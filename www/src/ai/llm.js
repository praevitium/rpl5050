/* =================================================================
   LLM — main-thread manager for the inference Web Worker.

   Usage:
     const llm = new LLM();
     llm.onStatus((status, msg) => ...);
     llm.onProgress((info) => ...);     // { file, progress, loaded, total }
     await llm.load();
     await llm.generate(messages, { onToken: (t) => ... });
     llm.abort();
   ================================================================= */

export class LLM {
  constructor() {
    this._worker        = null;
    this._status        = 'idle';   // idle | loading | ready | error
    this._statusMsg     = '';
    this._statusListeners   = new Set();
    this._progressListeners = new Set();

    // In-flight load/generate bookkeeping.
    this._loadPromise   = null;
    this._loadResolve   = null;
    this._loadReject    = null;

    this._genId         = 0;
    this._genResolve    = null;
    this._genReject     = null;
    this._genOnToken    = null;
  }

  /* ---- Public API ---- */

  get status()    { return this._status; }
  get statusMsg() { return this._statusMsg; }

  /** Subscribe to status changes.  Callback: (status, message) => void.
   *  Returns an unsubscribe function. */
  onStatus(fn) {
    this._statusListeners.add(fn);
    return () => this._statusListeners.delete(fn);
  }

  /** Subscribe to model download progress.  Callback: ({file, progress, loaded, total}) => void.
   *  Returns an unsubscribe function. */
  onProgress(fn) {
    this._progressListeners.add(fn);
    return () => this._progressListeners.delete(fn);
  }

  /** Load the model.  Safe to call multiple times — subsequent calls
   *  return the same in-flight promise or resolve immediately if ready. */
  load() {
    if (this._status === 'ready')   return Promise.resolve();
    if (this._loadPromise)          return this._loadPromise;

    this._worker = new Worker(
      new URL('./llm-worker.js', import.meta.url),
      { type: 'module' },
    );
    this._worker.onmessage = (e) => this._onWorkerMessage(e);
    this._worker.onerror   = (e) => {
      this._setStatus('error', e.message ?? 'Worker error');
      this._loadReject?.(new Error(e.message ?? 'Worker error'));
      this._loadReject = null;
    };

    this._loadPromise = new Promise((resolve, reject) => {
      this._loadResolve = resolve;
      this._loadReject  = reject;
    });

    this._worker.postMessage({ type: 'load' });
    return this._loadPromise;
  }

  /** Run inference on a messages array (OpenAI chat format).
   *  Streams tokens via onToken callback.  Resolves when done. */
  generate(messages, { onToken } = {}) {
    if (this._status !== 'ready') {
      return Promise.reject(new Error('Model not ready'));
    }

    const id = ++this._genId;
    this._genOnToken = onToken ?? null;

    return new Promise((resolve, reject) => {
      this._genResolve = resolve;
      this._genReject  = reject;
      this._worker.postMessage({ type: 'generate', id, messages });
    });
  }

  /** Signal the current generation to stop.  Safe to call even when
   *  no generation is in progress. */
  abort() {
    this._worker?.postMessage({ type: 'abort' });
  }

  /* ---- Internal ---- */

  _setStatus(s, msg = '') {
    this._status    = s;
    this._statusMsg = msg;
    for (const fn of this._statusListeners) fn(s, msg);
  }

  _onWorkerMessage({ data }) {
    const { type, ...rest } = data;

    if (type === 'status') {
      this._setStatus(rest.status, rest.message ?? '');
      if (rest.status === 'ready') {
        this._loadResolve?.();
        this._loadResolve = this._loadReject = null;
      } else if (rest.status === 'error') {
        this._loadReject?.(new Error(rest.message ?? 'Load error'));
        this._loadResolve = this._loadReject = null;
        // Also reject any in-flight generation.
        this._genReject?.(new Error(rest.message ?? 'Load error'));
        this._genResolve = this._genReject = null;
      }
      return;
    }

    if (type === 'progress') {
      for (const fn of this._progressListeners) fn(rest);
      return;
    }

    if (type === 'token') {
      this._genOnToken?.(rest.text);
      return;
    }

    if (type === 'done') {
      this._genResolve?.();
      this._genResolve = this._genReject = this._genOnToken = null;
      return;
    }

    if (type === 'error') {
      this._genReject?.(new Error(rest.message ?? 'Generation error'));
      this._genResolve = this._genReject = this._genOnToken = null;
    }
  }
}
