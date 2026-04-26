#!/usr/bin/env node
/* =================================================================
   Download the Qwen2.5-0.5B-Instruct ONNX weights + tokenizer files
   into www/models/ so the calculator's chat-bot can run fully offline
   without hitting the HuggingFace Hub at runtime.

   Run with:  node scripts/download-llm.mjs

   Pulls ~485 MB.  Idempotent — files that already exist with the
   correct size are skipped.
   ================================================================= */

import { mkdirSync, statSync, createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODEL_REPO = 'onnx-community/Qwen2.5-0.5B-Instruct';
const DEST_ROOT  = path.resolve(HERE, '..', 'www', 'models', MODEL_REPO);
const HF_BASE    = `https://huggingface.co/${MODEL_REPO}/resolve/main`;

// File list — tokenizer + config + the q4f16 ONNX weights.  q4f16 is
// the smallest dtype that still runs on WebGPU/CPU at usable quality
// (~483 MB).  Switching dtype later means changing this list and the
// `dtype` option in www/src/ai/llm-worker.js.
const FILES = [
  'config.json',
  'generation_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'vocab.json',
  'merges.txt',
  'added_tokens.json',
  'onnx/model_q4f16.onnx',
];

mkdirSync(DEST_ROOT, { recursive: true });
mkdirSync(path.join(DEST_ROOT, 'onnx'), { recursive: true });

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
  // Tee through a Transform that prints progress.
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

(async () => {
  for (const file of FILES) {
    const url  = `${HF_BASE}/${file}`;
    const dest = path.join(DEST_ROOT, file);
    let expected;
    try { expected = await head(url); }
    catch (e) { console.error(`HEAD failed for ${file}: ${e.message}`); continue; }

    let existing = -1;
    try { existing = statSync(dest).size; } catch { /* missing */ }
    if (existing === expected && existing > 0) {
      console.log(`✓ ${file} (${fmtMB(existing)}) — already present`);
      continue;
    }

    console.log(`↓ ${file} (${fmtMB(expected)})`);
    await download(url, dest, expected);
  }
  console.log(`\nAll files in ${DEST_ROOT}`);
})();
