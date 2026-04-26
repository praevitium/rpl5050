#!/usr/bin/env node
/* =================================================================
   DEPRECATED — bundling was removed.
   The chat-bot now picks from a curated WebLLM-prebuilt model list
   at runtime; weights come from the upstream URLs and get cached in
   the browser's Cache Storage.  See www/src/ai/chat-bot.js for the
   MODELS constant.

   This file can be deleted — the sandbox couldn't, but you can:
     rm scripts/download-llm.mjs
   ================================================================= */
console.error('[download-llm] Removed — model selection happens in the browser now.');
console.error('See the picker UI in the chat-bot panel.');
process.exit(1);
