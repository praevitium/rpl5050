/* =================================================================
   RemoteLLM — drop-in replacement for LLM that talks to an OpenAI-
   compatible HTTP endpoint instead of running WebLLM in a worker.

   Targets Ollama's `/v1` endpoints (`POST /chat/completions`,
   `GET /models`) but also works with any other server that mirrors
   that subset of the OpenAI API.

   Public surface mirrors LLM exactly so chat-bot.js can swap one for
   the other without conditional plumbing:
     status, statusMsg, loadedModelId, lastStats
     onStatus(fn), onProgress(fn), onStats(fn)
     load(modelId), generate(messages, {onToken, maxTokens}), abort()

   Notable differences vs the WebLLM worker path:
   - load() does a quick GET /models probe to surface bad URL / down
     server up front; doesn't actually pre-warm the model.
   - generate() uses fetch with stream:true and parses SSE manually.
   - abort() uses AbortController on the in-flight fetch — no worker
     postMessage round-trip needed.
   - Progress events never fire (no weights to download); the
     onProgress subscription exists only so the LLM consumer doesn't
     need to special-case which impl it has. */

export class RemoteLLM {
  constructor(endpoint = '') {
    this._endpoint  = (endpoint || '').replace(/\/+$/, '');
    this._status    = 'idle';
    this._statusMsg = '';
    this._statusListeners   = new Set();
    this._progressListeners = new Set();
    this._statsListeners    = new Set();
    this._lastStats         = null;

    this._loadingModelId = null;
    this._loadedModelId  = null;

    // Single in-flight fetch's AbortController.  abort() trips it.
    this._abortCtrl = null;
  }

  /* ---- Public API ---- */

  get status()    { return this._status; }
  get statusMsg() { return this._statusMsg; }
  get endpoint()  { return this._endpoint; }
  get lastStats() { return this._lastStats; }
  get loadedModelId() { return this._loadedModelId ?? null; }

  onStatus(fn) {
    this._statusListeners.add(fn);
    return () => this._statusListeners.delete(fn);
  }
  onProgress(fn) {
    this._progressListeners.add(fn);
    return () => this._progressListeners.delete(fn);
  }
  onStats(fn) {
    this._statsListeners.add(fn);
    return () => this._statsListeners.delete(fn);
  }

  /** Probe the configured endpoint and mark ready.  modelId is the
   *  model name the server will route requests to (e.g. "llama3.2").
   *  We don't pre-load weights — Ollama keeps them resident itself. */
  async load(modelId /* , opts = {} */) {
    if (!modelId) {
      return Promise.reject(new Error('load() requires a modelId'));
    }
    if (!this._endpoint) {
      return Promise.reject(new Error('Endpoint URL not configured'));
    }
    if (this._status === 'ready' && this._loadedModelId === modelId) {
      return;
    }
    this._loadingModelId = modelId;
    this._setStatus('loading', `Connecting to ${this._endpoint}…`);
    try {
      // GET /models is the lightest weight probe.  Ollama returns a
      // JSON list; servers that don't implement it (rare) will 404
      // and we'll fail-fast here rather than wait for the first
      // generate to discover the URL is wrong.
      const resp = await fetch(this._endpoint + '/models', { method: 'GET' });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} from ${this._endpoint}/models`);
      }
      // Best-effort: warn (in console) if the modelId isn't in the
      // returned list.  Don't hard-fail — some servers don't list
      // every callable model, and the user might know better.
      try {
        const body = await resp.json();
        const ids = (body?.data ?? []).map((m) => m.id).filter(Boolean);
        if (ids.length && !ids.includes(modelId)) {
          // eslint-disable-next-line no-console
          console.warn('[RemoteLLM] model', modelId,
                       'not in /models response; available:', ids);
        }
      } catch { /* not JSON / unexpected shape — ignore */ }

      this._loadedModelId  = modelId;
      this._loadingModelId = null;
      this._setStatus('ready', `Ready (remote)`);
    } catch (err) {
      this._loadingModelId = null;
      this._setStatus('error', `Remote endpoint unreachable: ${err.message ?? err}`);
      throw err;
    }
  }

  async generate(messages, { onToken, maxTokens } = {}) {
    if (this._status !== 'ready') {
      // eslint-disable-next-line no-console
      console.warn('[RemoteLLM] generate rejected: status=', this._status);
      throw new Error('Model not ready');
    }
    this._abortCtrl = new AbortController();

    const inputChars = messages.reduce(
      (n, m) => n + (m.content?.length ?? 0), 0);

    const t0 = (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
    let firstTokenAt = null;
    let outputChars  = 0;
    let outputTokens = 0;
    let finishReason = null;
    let aborted      = false;

    try {
      const resp = await fetch(this._endpoint + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this._loadedModelId,
          messages,
          stream: true,
          temperature: 0.1,
          top_p: 1.0,
          max_tokens: maxTokens || 256,
          frequency_penalty: 0.5,
          presence_penalty: 0,
        }),
        signal: this._abortCtrl.signal,
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new Error(`HTTP ${resp.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
      }
      if (!resp.body) {
        throw new Error('Streaming response has no body');
      }

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // SSE parsing: server-sent events are `data: <json>\n\n`.  Some
      // servers separate events with a single newline; tolerate both.
      // [DONE] sentinel marks end-of-stream in the OpenAI dialect.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          let chunk;
          try {
            chunk = JSON.parse(data);
          } catch {
            // eslint-disable-next-line no-console
            console.warn('[RemoteLLM] dropped malformed SSE frame:', data.slice(0, 200));
            continue;
          }
          const text = chunk.choices?.[0]?.delta?.content;
          if (typeof text === 'string' && text.length > 0) {
            if (firstTokenAt === null) {
              firstTokenAt = (typeof performance !== 'undefined' && performance.now)
                ? performance.now() : Date.now();
            }
            outputChars += text.length;
            outputTokens++;
            try { onToken?.(text); } catch (err) {
              // eslint-disable-next-line no-console
              console.warn('[RemoteLLM] onToken threw:', err);
            }
          }
          const fr = chunk.choices?.[0]?.finish_reason;
          if (fr) finishReason = fr;
        }
      }
    } catch (err) {
      if (err.name === 'AbortError' || this._abortCtrl?.signal.aborted) {
        aborted = true;
      } else {
        this._abortCtrl = null;
        throw err;
      }
    } finally {
      // Caller can call abort() between turns; clearing keeps the
      // next generate from observing a stale signal.
      this._abortCtrl = null;
    }

    const t1 = (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
    const totalMs   = t1 - t0;
    const ttftMs    = firstTokenAt !== null ? firstTokenAt - t0 : null;
    const decodeMs  = firstTokenAt !== null ? t1 - firstTokenAt : null;
    const decodeTps = (decodeMs && decodeMs > 0)
      ? (outputTokens / (decodeMs / 1000))
      : null;

    const stats = {
      id: 0,
      inputChars,
      inputMessages: messages.length,
      outputTokens,
      outputChars,
      totalMs,
      ttftMs,
      decodeTps,
      finishReason,
      aborted,
      runtimeStats: null,
    };
    this._lastStats = stats;
    for (const fn of this._statsListeners) {
      try { fn(stats); } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[RemoteLLM] stats listener threw:', err);
      }
    }
  }

  abort() {
    try { this._abortCtrl?.abort(); } catch { /* no-op */ }
  }

  /* ---- Internal ---- */

  _setStatus(s, msg = '') {
    this._status    = s;
    this._statusMsg = msg;
    for (const fn of this._statusListeners) fn(s, msg);
  }
}
