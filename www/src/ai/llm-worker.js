/* =================================================================
   LLM Web Worker — runs WebLLM (MLC) inference off the main thread.

   Runtime: @mlc-ai/web-llm.  Replaces the earlier @huggingface/
   transformers (transformers.js) implementation; we swapped for
   tighter WebGPU kernels (TVM-compiled per architecture rather than
   generic ONNX Runtime) and the OpenAI-compatible chat-completion
   API which obviates the chat-template plumbing the old worker had
   to do by hand.

   Protocol (main → worker, UNCHANGED across the swap):
     { type: 'load' }
       Load and warm the model.  Sends back status + progress events.
     { type: 'generate', id, messages, maxTokens? }
       Run inference on a messages array (OpenAI chat format).
       Streams tokens back as they are produced.
     { type: 'abort' }
       Signal the running generation to stop early.

   Protocol (worker → main, UNCHANGED across the swap):
     { type: 'status', status: 'loading'|'ready'|'error', message, device? }
     { type: 'progress', file, progress, loaded, total }
     { type: 'token', id, text }
     { type: 'done', id }
     { type: 'error', id, message }
   ================================================================= */

/* eslint-disable no-restricted-globals */

// Pinning npm version + matching .wasm modelVersion together is
// load-bearing.  The npm package version and the compatible
// "modelVersion" constant for the binary-mlc-llm-libs .wasm files
// drift independently — at the time of this commit the latest
// published web-llm was 0.2.82 and its compatible modelVersion was
// v0_2_80.  If you bump web-llm here, also bump MODEL_LIB_VERSION
// in scripts/download-llm.mjs and LOCAL_MODEL_LIB below — verify
// the new web-llm's `modelVersion` constant in
//   https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@<ver>/lib/config.js
// (search for `modelVersion`) and check that the resulting URL
//   https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/<modelVersion>/<lib>.wasm
// returns 200.
import {
  CreateMLCEngine,
  prebuiltAppConfig,
} from 'https://esm.run/@mlc-ai/web-llm@0.2.82';

// MLC model id — must match an entry in WebLLM's prebuiltAppConfig
// model_list (see https://github.com/mlc-ai/web-llm/blob/main/src/config.ts).
// q4f16_1 is the 4-bit / fp16 activations variant — ~880 MB VRAM,
// fastest of the prebuilt Llama-3.2-1B options, and matches what we
// were running under transformers.js.
const MODEL_ID = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';

// Local-bundle paths.  When the user has run `npm run download-llm`,
// the MLC artifacts (mlc-chat-config.json, ndarray-cache.json, the
// 21 params_shard_*.bin files, tokenizer.json/_config.json) live at
// www/models/mlc-ai/<model_id>/, and the matching .wasm library
// lives at www/models/mlc-ai/lib/<lib>.wasm.  These paths resolve
// to /models/... in dev (live-server roots at www/) and to the
// frontendDist root in Tauri builds.
//
// If the bundle isn't present, we fall back to WebLLM's default
// upstream URLs (HF Hub for weights, raw.githubusercontent.com for
// the .wasm library), so a fresh dev clone still works.
const LOCAL_MODEL_BASE = '/models/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC';
const LOCAL_MODEL_LIB  = '/models/mlc-ai/lib/Llama-3.2-1B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm';

// Loud version banner — confirms the worker actually re-loaded after
// a refresh (browser worker caches can outlive a Cmd-Shift-R).  If
// you don't see this line in the console, the OLD worker is still
// running — close all tabs of this origin, or DevTools →
// Application → Service Workers → Unregister, then reload.
// eslint-disable-next-line no-console
console.log('%c[llm-worker] BOOT — runtime:', 'color:#67e8f9;font-weight:bold',
  'web-llm@0.2.82', 'model:', MODEL_ID);

// Wrap fetch so we can see every URL WebLLM is asking for AND the
// response status.  Useful for confirming the local-bundle override
// is hitting the right paths and for debugging the dreaded "200-OK
// HTML 404" trap that live-server inflicts on missing files (see the
// localBundlePresent() guard below).
const _origFetch = self.fetch.bind(self);
self.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url;
  // eslint-disable-next-line no-console
  console.log('[llm-worker] fetch →', url);
  const resp = await _origFetch(input, init);
  // eslint-disable-next-line no-console
  console.log(
    `[llm-worker] fetch ← ${resp.status} ${resp.headers.get('content-type') ?? ''}`,
    url,
  );
  return resp;
};

let engine = null;
// `_aborted` lets generate() observe an interrupt mid-stream and bail
// before WebLLM has a chance to deliver the next chunk.  WebLLM also
// has engine.interruptGenerate() which we call from the abort
// handler, but the flag is the canonical "is this turn dead?" signal
// from the main thread's perspective.
let _aborted = false;

/* ---- Model loading ---- */

/** Probe whether a usable local MLC bundle exists at LOCAL_MODEL_BASE.
 *  Returns true only if the manifest is reachable AND comes back
 *  with a non-HTML content-type — live-server's 200-OK-with-HTML
 *  fallback for missing files would otherwise look like a successful
 *  fetch, then poison WebLLM's JSON parsing. */
async function localBundlePresent() {
  try {
    const r = await _origFetch(`${LOCAL_MODEL_BASE}/mlc-chat-config.json`,
      { method: 'HEAD' });
    if (!r.ok) return false;
    const ct = r.headers.get('content-type') ?? '';
    if (ct.includes('text/html')) return false;
    return true;
  } catch {
    return false;
  }
}

/** Build the appConfig WebLLM uses to resolve model URLs.
 *  Starts from `prebuiltAppConfig` (so we inherit every default the
 *  shipped catalog provides — context length overrides, conv
 *  template, vram_required, etc.) and rewrites only the `model` and
 *  `model_lib` URLs of our chosen entry when the local bundle is
 *  present.  Anything else stays as upstream defaults. */
async function buildAppConfig() {
  const useLocal = await localBundlePresent();
  // Deep clone — prebuiltAppConfig is exported as a shared object;
  // mutating it would leak into other consumers in the same realm.
  const appConfig = JSON.parse(JSON.stringify(prebuiltAppConfig));
  const entry = appConfig.model_list.find((m) => m.model_id === MODEL_ID);
  if (!entry) {
    throw new Error(
      `MODEL_ID "${MODEL_ID}" missing from web-llm prebuiltAppConfig — `
      + 'check the WebLLM version pinned in this worker against '
      + 'https://github.com/mlc-ai/web-llm/blob/main/src/config.ts',
    );
  }
  if (useLocal) {
    entry.model     = LOCAL_MODEL_BASE;
    entry.model_lib = LOCAL_MODEL_LIB;
    // eslint-disable-next-line no-console
    console.log('[llm-worker] using LOCAL bundle at', LOCAL_MODEL_BASE);
  } else {
    // eslint-disable-next-line no-console
    console.log('[llm-worker] no local bundle — using WebLLM upstream URLs',
      entry.model);
  }
  return appConfig;
}

async function loadModel() {
  self.postMessage({ type: 'status', status: 'loading', message: 'Initialising…' });

  // WebLLM's progress callback shape: { progress: 0..1, text, timeElapsed }
  // — coarser than transformers.js's per-file events.  We map onto
  // our existing single-bar progress UI by fanning the same number
  // out as both `progress` and `loaded/total` (in pseudo-bytes), and
  // pulling a friendly file name out of `text` when present.
  const initProgressCallback = (info) => {
    // eslint-disable-next-line no-console
    console.log('[llm-worker] progress:', info);
    const pct = Math.round((info.progress ?? 0) * 100);
    self.postMessage({
      type: 'progress',
      file: info.text ?? '',
      progress: pct,
      loaded: pct,        // pseudo-bytes — UI just renders the percentage
      total: 100,
    });
    // Surface the human-readable text in status too, so the load
    // pill shows "Fetching params (12 / 21)…" rather than a stale
    // "Loading model (WebGPU)…".
    if (info.text) {
      self.postMessage({ type: 'status', status: 'loading', message: info.text });
    }
  };

  try {
    const appConfig = await buildAppConfig();
    engine = await CreateMLCEngine(MODEL_ID, {
      appConfig,
      initProgressCallback,
    });
    self.postMessage({
      type: 'status',
      status: 'ready',
      message: 'Ready (WebGPU)',
      device: 'webgpu',
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[llm-worker] load failed:', err);
    engine = null;
    self.postMessage({
      type: 'status',
      status: 'error',
      message: `Failed to load model: ${err.message ?? err}`,
    });
  }
}

/* ---- Generation ---- */

async function generate({ id, messages, maxTokens = 256 }) {
  if (!engine) {
    self.postMessage({ type: 'error', id, message: 'Model not loaded' });
    return;
  }

  _aborted = false;

  // Diagnostic: log the full messages array we're about to send.
  // WebLLM applies the chat template internally (using the
  // tokenizer_config.json bundled with the model), so we don't see
  // the templated string here — but we DO see the raw OpenAI-style
  // input, which is what the rest of the pipeline reasons about.
  try {
    const total = messages.reduce((n, m) => n + (m.content?.length ?? 0), 0);
    // eslint-disable-next-line no-console
    console.log(`[llm-worker] generate: ${messages.length} messages, ${total} chars total`);
  } catch { /* swallow — diagnostic only */ }

  try {
    // Sampling tuned for *deterministic + accurate* output across all
    // three pipeline phases (Phase 1 prose, Phase 2 JSON tool calls,
    // Phase 3 suggestion arrays).  WebLLM uses OpenAI-style sampling
    // params, so the previous transformers.js mapping changes:
    //   transformers.js do_sample:false                 → WebLLM temperature:0
    //   transformers.js repetition_penalty:1.05         → WebLLM frequency_penalty:0
    //                                                     (WebLLM has no
    //                                                     direct equivalent
    //                                                     of repetition_penalty;
    //                                                     frequency_penalty:0
    //                                                     means greedy
    //                                                     reproduces tokens
    //                                                     freely, which is
    //                                                     fine for our short
    //                                                     replies and clean
    //                                                     for JSON output).
    // top_p / top_k are ignored when temperature:0, but we set them
    // explicitly for clarity and to match Meta's recommended defaults.
    const stream = await engine.chat.completions.create({
      messages,
      stream: true,
      temperature: 0,
      top_p: 1.0,
      max_tokens: maxTokens,
      frequency_penalty: 0,
      presence_penalty: 0,
    });

    for await (const chunk of stream) {
      if (_aborted) break;
      const text = chunk.choices?.[0]?.delta?.content;
      if (typeof text === 'string' && text.length > 0) {
        self.postMessage({ type: 'token', id, text });
      }
      const finishReason = chunk.choices?.[0]?.finish_reason;
      if (finishReason) break;
    }

    self.postMessage({ type: 'done', id });
  } catch (err) {
    if (_aborted) {
      self.postMessage({ type: 'done', id });
    } else {
      // eslint-disable-next-line no-console
      console.error('[llm-worker] generate error:', err);
      self.postMessage({ type: 'error', id, message: err.message ?? String(err) });
    }
  }
}

/* ---- Message dispatcher ---- */

self.onmessage = async (e) => {
  const { type, ...data } = e.data;

  switch (type) {
    case 'load':
      await loadModel();
      break;
    case 'generate':
      await generate(data);
      break;
    case 'abort':
      _aborted = true;
      // Tell WebLLM to stop generating.  The for-await loop in
      // generate() will also bail on the _aborted flag, but
      // interruptGenerate() unblocks the underlying TVM call faster.
      try { engine?.interruptGenerate?.(); } catch { /* ignore */ }
      break;
    default:
      // eslint-disable-next-line no-console
      console.warn('[llm-worker] unknown message type:', type);
  }
};
