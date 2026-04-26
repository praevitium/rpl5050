/* =================================================================
   LLM Web Worker — runs Transformers.js inference off the main thread.

   Protocol (main → worker):
     { type: 'load' }
       Load and warm the model.  Sends back status + progress events.
     { type: 'generate', id, messages, maxTokens? }
       Run inference on a messages array (OpenAI chat format).
       Streams tokens back as they are produced.
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

import {
  pipeline,
  TextStreamer,
  env,
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.0';

// Model weights are bundled into the app at www/models/<MODEL_ID>/.
// `localModelPath` is resolved against the WORKER's URL inside
// transformers.js, not the document origin — so a bare `models/` would
// look up at /src/ai/models/ and 404.  Anchor it at the page origin
// with a full URL so the lookup lands on /models/<MODEL_ID>/...
// regardless of where the worker file lives in the source tree.
env.allowRemoteModels = false;
env.allowLocalModels  = true;
env.localModelPath    = `${self.location.origin}/models/`;

const MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct';

let generator = null;
// Abort is signalled by flipping this flag; the streamer callback
// throws when it detects it, which unwinds the generate() call.
let _aborted = false;

/* ---- Model loading ---- */

async function loadModel() {
  self.postMessage({ type: 'status', status: 'loading', message: 'Initialising…' });

  const progressCallback = (info) => {
    if (info.status === 'progress') {
      self.postMessage({
        type: 'progress',
        file: info.file ?? info.name ?? '',
        progress: info.progress ?? 0,
        loaded: info.loaded ?? 0,
        total: info.total ?? 0,
      });
    }
  };

  // Try WebGPU first (Metal on macOS, Vulkan/DX12 elsewhere).
  // Fall back to WASM/CPU if WebGPU is unavailable or the device
  // doesn't support the required features.
  for (const device of ['webgpu', 'wasm']) {
    try {
      self.postMessage({
        type: 'status',
        status: 'loading',
        message: device === 'webgpu'
          ? 'Loading model (WebGPU)…'
          : 'WebGPU unavailable — loading on CPU…',
      });

      generator = await pipeline('text-generation', MODEL_ID, {
        // q4f16 weights are ~483 MB vs ~786 MB for plain q4 with
        // similar quality, and run faster on WebGPU.  Must match the
        // file shipped under www/models/.../onnx/.
        dtype: 'q4f16',
        device,
        progress_callback: progressCallback,
      });

      self.postMessage({
        type: 'status',
        status: 'ready',
        message: `Ready (${device === 'webgpu' ? 'GPU' : 'CPU'})`,
        device,
      });
      return; // success — stop trying
    } catch (err) {
      generator = null;
      if (device === 'wasm') {
        // Both devices failed.
        self.postMessage({
          type: 'status',
          status: 'error',
          message: `Failed to load model: ${err.message}`,
        });
      }
      // Otherwise loop to the next device.
    }
  }
}

/* ---- Token streaming ---- */

function makeStreamer(id) {
  return new TextStreamer(generator.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text) => {
      if (_aborted) {
        // Throw to unwind the generate() call cleanly.
        throw new Error('AbortError');
      }
      self.postMessage({ type: 'token', id, text });
    },
  });
}

/* ---- Generation ---- */

async function generate({ id, messages, maxTokens = 256 }) {
  if (!generator) {
    self.postMessage({ type: 'error', id, message: 'Model not loaded' });
    return;
  }

  _aborted = false;

  try {
    const streamer = makeStreamer(id);

    // Qwen2.5-0.5B-Instruct sampling.  The Qwen team's published
    // recommendation is T=0.7, top_p=0.8, top_k=20, repetition_penalty
    // =1.05; we tighten T and top_p further so this assistant reads as
    // terse and predictable rather than chatty.  Pure greedy (do_sample
    // :false) on this 0.5B model collapses casual turns to <|im_end|>
    // immediately and yields empty replies, so we keep sampling on but
    // at low temperature for near-deterministic output.
    await generator(messages, {
      max_new_tokens: maxTokens,
      do_sample: true,
      temperature: 0.2,
      top_p: 0.8,
      top_k: 20,
      repetition_penalty: 1.05,
      streamer,
    });

    if (!_aborted) {
      self.postMessage({ type: 'done', id });
    } else {
      self.postMessage({ type: 'done', id }); // still signal done so UI cleans up
    }
  } catch (err) {
    if (err.message === 'AbortError' || _aborted) {
      self.postMessage({ type: 'done', id });
    } else {
      self.postMessage({ type: 'error', id, message: err.message });
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
      break;
    default:
      console.warn('[llm-worker] unknown message type:', type);
  }
};
