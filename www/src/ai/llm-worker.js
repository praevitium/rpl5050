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

// Allow fetching model weights from the HuggingFace Hub.
env.allowRemoteModels = true;
env.allowLocalModels  = false;

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
        dtype: 'q4',
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

async function generate({ id, messages, maxTokens = 768 }) {
  if (!generator) {
    self.postMessage({ type: 'error', id, message: 'Model not loaded' });
    return;
  }

  _aborted = false;

  try {
    const streamer = makeStreamer(id);

    await generator(messages, {
      max_new_tokens: maxTokens,
      temperature: 0.6,
      // Greedy decoding is faster and more deterministic for a
      // calculator assistant that needs accurate command names.
      do_sample: false,
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
