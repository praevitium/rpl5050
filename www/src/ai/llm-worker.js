/* =================================================================
   LLM Web Worker — runs WebLLM (MLC) inference off the main thread.

   Runtime: @mlc-ai/web-llm.

   Bundling: NONE.  Earlier revisions of this worker tried to load
   model files from a bundled copy under www/models/ to avoid runtime
   downloads, but that path tripped over multiple sharp edges (the
   live-server "200-OK HTML 404" trap, npm-version vs modelVersion
   drift, .wasm filename changes between WebLLM releases).  The
   current design just lets WebLLM use its prebuilt upstream URLs:
   weights from huggingface.co/mlc-ai/<model>, .wasm libraries from
   raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs.  WebLLM
   caches downloaded files in the browser's Cache Storage, so the
   download is one-time per model per origin.

   Model selection: the main thread tells us which model to load via
   the `load` message — this worker has no opinion about which model
   to run.  See www/src/ai/chat-bot.js for the curated MODELS list
   and the picker UI.

   Protocol (main → worker):
     { type: 'load', modelId }
       Load and warm the named model.  Sends back status + progress.
     { type: 'generate', id, messages, maxTokens? }
       Run inference on a messages array (OpenAI chat format).
     { type: 'abort' }
       Signal the running generation to stop early.

   Protocol (worker → main):
     { type: 'status', status: 'loading'|'ready'|'error', message, device? }
     { type: 'progress', file, progress, loaded, total }
     { type: 'token', id, text }
     { type: 'done', id }
     { type: 'error', id, message }
   ================================================================= */

/* eslint-disable no-restricted-globals */

// Pinning npm version + the matching .wasm modelVersion together is
// load-bearing.  The npm package version and the compatible
// modelVersion drift independently — at the time of this commit the
// latest published web-llm was 0.2.82 and its compatible modelVersion
// (the path inside binary-mlc-llm-libs) was v0_2_80.  When you bump
// this, verify the new web-llm's `modelVersion` constant in
//   https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@<ver>/lib/config.js
// and check that the resulting .wasm URLs return 200.
import { CreateMLCEngine } from 'https://esm.run/@mlc-ai/web-llm@0.2.82';

// eslint-disable-next-line no-console
console.log('%c[llm-worker] BOOT — runtime:', 'color:#67e8f9;font-weight:bold',
  'web-llm@0.2.82');

let engine = null;
let _aborted = false;

/* ---- Model loading ---- */

async function loadModel({ modelId }) {
  if (!modelId) {
    self.postMessage({ type: 'status', status: 'error', message: 'No modelId supplied' });
    return;
  }

  self.postMessage({
    type: 'status',
    status: 'loading',
    message: `Initialising ${modelId}…`,
  });

  // WebLLM's progress callback shape: { progress: 0..1, text, timeElapsed }
  // We map onto the existing single-bar progress UI by fanning the
  // same number out as both `progress` and `loaded/total`.
  const initProgressCallback = (info) => {
    // eslint-disable-next-line no-console
    console.log('[llm-worker] progress:', info);
    const pct = Math.round((info.progress ?? 0) * 100);
    self.postMessage({
      type: 'progress',
      file: info.text ?? '',
      progress: pct,
      loaded: pct,
      total: 100,
    });
    if (info.text) {
      self.postMessage({ type: 'status', status: 'loading', message: info.text });
    }
  };

  try {
    // Switching models: if `engine` already exists for a previous
    // modelId, just let CreateMLCEngine replace it.  WebLLM cleans
    // up the old WebGPU device internally; no explicit unload needed.
    engine = await CreateMLCEngine(modelId, { initProgressCallback });
    self.postMessage({
      type: 'status',
      status: 'ready',
      message: `Ready (WebGPU)`,
      device: 'webgpu',
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[llm-worker] load failed:', err);
    engine = null;
    self.postMessage({
      type: 'status',
      status: 'error',
      message: `Failed to load ${modelId}: ${err.message ?? err}`,
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

  try {
    const total = messages.reduce((n, m) => n + (m.content?.length ?? 0), 0);
    // eslint-disable-next-line no-console
    console.log(`[llm-worker] generate: ${messages.length} messages, ${total} chars total`);
  } catch { /* swallow — diagnostic only */ }

  try {
    // Sampling tuned for *near-deterministic + accurate* output
    // across all three pipeline phases (Phase 1 prose, Phase 2 JSON
    // tool calls, Phase 3 suggestion arrays).
    //
    // History of this block:
    //   v1 (transformers.js):       do_sample:false, repetition_penalty:1.05
    //   v2 (WebLLM, first attempt): temperature:0,   frequency_penalty:0
    //                               → Phase 2 hung in deterministic
    //                               token loops on small models
    //                               (1B-class), invisibly because
    //                               Phase 2 doesn't stream a visible
    //                               bubble.
    //   v3 (this):                  temperature:0.1, frequency_penalty:0.5
    //                               → tiny noise breaks self-loops
    //                               while staying effectively
    //                               deterministic for short outputs;
    //                               higher freq penalty discourages
    //                               JSON-token-thrash without breaking
    //                               valid JSON.
    //
    // top_p / top_k are ignored when temperature is very low but we
    // set them explicitly for clarity.
    const stream = await engine.chat.completions.create({
      messages,
      stream: true,
      temperature: 0.1,
      top_p: 1.0,
      max_tokens: maxTokens,
      frequency_penalty: 0.5,
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
      await loadModel(data);
      break;
    case 'generate':
      await generate(data);
      break;
    case 'abort':
      _aborted = true;
      try { engine?.interruptGenerate?.(); } catch { /* ignore */ }
      break;
    default:
      // eslint-disable-next-line no-console
      console.warn('[llm-worker] unknown message type:', type);
  }
};
