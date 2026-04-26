#!/usr/bin/env node
/* =================================================================
   Download the WebLLM (MLC) Llama-3.2-1B-Instruct artifacts into
   www/models/ so the calculator's chat-bot can run fully offline
   without hitting HuggingFace or GitHub at runtime.  The Tauri build
   packages the entire www/ tree (frontendDist), so anything under
   www/models/ rides along inside the .dmg / .msi / .deb.

   Run with:  node scripts/download-llm.mjs   (or `npm run download-llm`)

   Pulls ~1.0 GB.  Idempotent — files that already exist with the
   correct size are skipped.

   What's different vs. the old (transformers.js / ONNX) setup:
     - WebLLM consumes MLC artifacts: a manifest (mlc-chat-config.json
       + ndarray-cache.json + tensor-cache.json), N sharded weight
       blobs (params_shard_*.bin), tokenizer files, AND a separately-
       hosted .wasm library that contains TVM-compiled WebGPU
       shaders.
     - The .wasm library lives at a versioned URL on GitHub (the
       binary-mlc-llm-libs repo), keyed on the WebLLM version.  Keep
       MODEL_LIB_URL in sync with the modelVersion in
       https://github.com/mlc-ai/web-llm/blob/main/src/config.ts and
       with the @mlc-ai/web-llm version pinned in
       www/src/ai/llm-worker.js.

   If you swap the model again, update:
     1. MODEL_REPO and the MLC <model_id> below.
     2. MODEL_LIB_URL — pick the matching <model_id>_cs1k-webgpu.wasm
        for the same WebLLM modelVersion.
     3. MODEL_ID in www/src/ai/llm-worker.js.
   ================================================================= */

import { mkdirSync, statSync, createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---- Weight repo (HuggingFace) -----------------------------------
const MODEL_REPO = 'mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC';
const HF_BASE    = `https://huggingface.co/${MODEL_REPO}/resolve/main`;
const DEST_ROOT  = path.resolve(HERE, '..', 'www', 'models', MODEL_REPO);

// 21 weight shards — count taken from the live repo file listing.
// If MLC re-shards on a future release, regenerate this list with:
//   curl -sL https://huggingface.co/api/models/<repo> | jq -r '.siblings[].rfilename'
const NUM_SHARDS = 21;
const SHARD_FILES = Array.from(
  { length: NUM_SHARDS },
  (_, i) => `params_shard_${i}.bin`,
);

const WEIGHT_FILES = [
  'mlc-chat-config.json',
  'ndarray-cache.json',
  'tensor-cache.json',
  'tokenizer.json',
  'tokenizer_config.json',
  ...SHARD_FILES,
];

// ---- Model library (GitHub: binary-mlc-llm-libs) -----------------
// This .wasm contains the TVM-compiled WebGPU shaders for the Llama
// architecture at this dtype + context length.  It's hosted
// separately from the weights because it's regenerated on each
// WebLLM version bump even when the weight repo is unchanged.
// modelVersion is keyed off the npm @mlc-ai/web-llm package version
// pinned in www/src/ai/llm-worker.js — they drift independently.
// At the time of this commit web-llm@0.2.82 declares modelVersion
// "v0_2_80".  Verify with:
//   curl https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@<ver>/lib/config.js | grep modelVersion
const MODEL_LIB_VERSION = 'v0_2_80';
const MODEL_LIB_NAME    = 'Llama-3.2-1B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm';
const MODEL_LIB_URL     =
  `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/${MODEL_LIB_VERSION}/${MODEL_LIB_NAME}`;
const LIB_DEST_DIR      = path.resolve(HERE, '..', 'www', 'models', 'mlc-ai', 'lib');

mkdirSync(DEST_ROOT, { recursive: true });
mkdirSync(LIB_DEST_DIR, { recursive: true });

function fmtMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

async function head(url) {
  const r = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  if (!r.ok) throw new Error(`HEAD ${url} → ${r.status}`);
  return Number(r.headers.get('content-length') ?? 0);
}

async function download(url, dest, expected) {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`GET ${url} → ${r.status}`);
  const total = Number(r.headers.get('content-length') ?? expected ?? 0);
  let got = 0;
  let lastPct = -1;
  const reportingStream = new Readable.from((async function* () {
    const reader = r.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      got += value.length;
      if (total) {
        const pct = Math.floor(got / total * 100);
        if (pct !== lastPct && pct % 5 === 0) {
          process.stdout.write(`\r  ${path.basename(dest)}: ${pct}% (${fmtMB(got)} / ${fmtMB(total)})`);
          lastPct = pct;
        }
      }
      yield value;
    }
  })());
  await pipeline(reportingStream, createWriteStream(dest));
  process.stdout.write('\n');
}

async function fetchOne(url, dest) {
  let expected;
  try { expected = await head(url); }
  catch (e) { console.error(`HEAD failed for ${path.basename(dest)}: ${e.message}`); return; }

  let existing = -1;
  try { existing = statSync(dest).size; } catch { /* missing */ }
  if (existing === expected && existing > 0) {
    console.log(`✓ ${path.basename(dest)} (${fmtMB(existing)}) — already present`);
    return;
  }

  console.log(`↓ ${path.basename(dest)} (${fmtMB(expected)})`);
  await download(url, dest, expected);
}

(async () => {
  console.log(`Weights → ${DEST_ROOT}`);
  for (const file of WEIGHT_FILES) {
    await fetchOne(`${HF_BASE}/${file}`, path.join(DEST_ROOT, file));
  }

  console.log(`\nLibrary → ${LIB_DEST_DIR}`);
  await fetchOne(MODEL_LIB_URL, path.join(LIB_DEST_DIR, MODEL_LIB_NAME));

  console.log(`\nDone.  Worker resolves these paths via:`);
  console.log(`  LOCAL_MODEL_BASE = /models/${MODEL_REPO}`);
  console.log(`  LOCAL_MODEL_LIB  = /models/mlc-ai/lib/${MODEL_LIB_NAME}`);
})();
