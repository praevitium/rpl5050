/* =================================================================
   ChatBot — completely decoupled AI assistant.

   The calculator initialises one instance at startup and passes in
   a `tools` object and a `getContext` function.  ChatBot never
   imports anything from rpl/ or the rest of the UI.

   Constructor options:
     tools: {
       run(text: string): void   — type text into the entry and commit.
                                   ALWAYS requires user confirmation.
     }
     getContext(): {
       stack: string[]   — formatted stack lines, index 0 = level 1
       angleMode: string — 'RAD' | 'DEG' | 'GRD'
       displayMode: string
       dir: string       — current directory path
     }

   Public API:
     mount(containerEl)          — render into a DOM element
     open() / close()            — lifecycle (optional, for animation hooks)

   Tool-call loop:
     1. Build messages array (with current context injected into user msg).
     2. Generate.  Stream tokens into a live bubble.
     3. When done, scan for <tool_call>...</tool_call> in the response.
     4. If found:
          - run / any future mutating tool → show ▶ Confirm button.
          - get_stack → execute automatically, feed result back.
     5. Add tool response to history as { role:'tool', content:'...' }.
     6. Loop (up to MAX_ITER to prevent runaway).
   ================================================================= */

import { LLM } from './llm.js';
import {
  SYSTEM_PROMPT_REPLY,
  SYSTEM_PROMPT_TOOL,
  SYSTEM_PROMPT_SUGGEST,
} from './system-prompt.js';

// (Previously: MAX_ITER capped a multi-iteration tool loop.  Removed —
// the new linear pipeline runs Phase 1 / 2 / 3 exactly once per user
// turn, so there's no loop to bound.)

/* ---- Simple markdown → DOM renderer --------------------------------
   Handles the subset the assistant actually uses: headers, bold,
   italic, inline code, fenced code blocks, bullet lists.
   Action / tool_call fences are stripped before this renderer sees
   the text — they get their own widget.
   ------------------------------------------------------------------ */

function renderMarkdown(text) {
  const frag = document.createDocumentFragment();

  // Split on fenced code blocks first so we don't mangle their contents.
  const parts = text.split(/(```[\s\S]*?```)/g);

  for (const part of parts) {
    if (part.startsWith('```')) {
      // Fenced block — extract optional language tag.
      const inner = part.slice(3, -3);
      const nlIdx = inner.indexOf('\n');
      const code  = nlIdx >= 0 ? inner.slice(nlIdx + 1) : inner;
      const pre   = document.createElement('pre');
      const codeEl = document.createElement('code');
      codeEl.textContent = code.trimEnd();
      pre.appendChild(codeEl);
      frag.appendChild(pre);
    } else {
      // Plain text segment — inline formatting only.
      appendInlineMarkdown(frag, part);
    }
  }
  return frag;
}

function appendInlineMarkdown(frag, text) {
  // Process line by line so we can detect list items and headers.
  const lines = text.split('\n');
  let p = null; // current paragraph

  const flushP = () => { if (p) { frag.appendChild(p); p = null; } };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Heading
    const hm = line.match(/^(#{1,3})\s+(.+)/);
    if (hm) {
      flushP();
      const h = document.createElement(`h${hm[1].length + 2}`); // h3–h5
      appendSpans(h, hm[2]);
      frag.appendChild(h);
      continue;
    }

    // Bullet list item
    const lim = line.match(/^\s*[-*]\s+(.*)/);
    if (lim) {
      flushP();
      // Wrap consecutive items in a <ul> if the previous sibling isn't one.
      let ul = frag.lastChild;
      if (!ul || ul.tagName !== 'UL') {
        ul = document.createElement('ul');
        frag.appendChild(ul);
      }
      const li = document.createElement('li');
      appendSpans(li, lim[1]);
      ul.appendChild(li);
      continue;
    }

    // Numbered list item
    const nlim = line.match(/^\s*\d+\.\s+(.*)/);
    if (nlim) {
      flushP();
      let ol = frag.lastChild;
      if (!ol || ol.tagName !== 'OL') {
        ol = document.createElement('ol');
        frag.appendChild(ol);
      }
      const li = document.createElement('li');
      appendSpans(li, nlim[1]);
      ol.appendChild(li);
      continue;
    }

    // Blank line → paragraph break
    if (line.trim() === '') {
      flushP();
      continue;
    }

    // Regular line → accumulate into paragraph
    if (!p) { p = document.createElement('p'); }
    if (p.childNodes.length > 0) {
      p.appendChild(document.createTextNode(' '));
    }
    appendSpans(p, line);
  }
  flushP();
}

/** Append inline-formatted spans (bold, italic, code) to a parent. */
function appendSpans(parent, text) {
  // Regex that matches **bold**, *italic*, `code` in order of priority.
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parent.appendChild(document.createTextNode(text.slice(last, m.index)));
    }
    if (m[2] !== undefined) {
      const s = document.createElement('strong');
      s.textContent = m[2];
      parent.appendChild(s);
    } else if (m[3] !== undefined) {
      const s = document.createElement('em');
      s.textContent = m[3];
      parent.appendChild(s);
    } else if (m[4] !== undefined) {
      const s = document.createElement('code');
      s.textContent = m[4];
      parent.appendChild(s);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    parent.appendChild(document.createTextNode(text.slice(last)));
  }
}

/* ---- Model-output parsing ----------------------------------------- */

/** Extract a tool call from a Phase 2 response string.  The model is
 *  told to output a single bare-JSON object `{"name":"…","arguments":…}`
 *  or the literal `NO_TOOL`.  We find the first `{…}` whose first key
 *  is `"name"`, walking braces manually so nested objects in
 *  `arguments` don't confuse the matcher.  Returns `{name, arguments}`
 *  or null. */
function parseToolCall(text) {
  const start = text.search(/\{\s*"name"/);
  if (start < 0) return null;
  let depth = 0;
  let end   = -1;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1));
    if (typeof obj.name === 'string') {
      return { name: obj.name, arguments: obj.arguments ?? {} };
    }
  } catch { /* fall through */ }
  return null;
}

/** Lenient JSON-array parser for Phase 3 (chips).  The model is told
 *  to output only a JSON array of three strings, but tiny models drift
 *  — they sometimes wrap in code fences, add prose, or only emit the
 *  quoted strings.  We try, in order: direct parse, the first
 *  `[…]` window, and finally pulling every double-quoted token.
 *  Returns up to 3 non-empty trimmed strings, or null. */
function parseSuggestionsArray(text) {
  if (!text) return null;
  const s = text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '');
  const tryParse = (raw) => {
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return null;
      const out = arr
        .map(v => (typeof v === 'string' ? v.trim() : ''))
        .filter(Boolean)
        .slice(0, 3);
      return out.length ? out : null;
    } catch { return null; }
  };
  let items = tryParse(s);
  if (items) return items;
  const lo = s.indexOf('[');
  const hi = s.lastIndexOf(']');
  if (lo >= 0 && hi > lo) {
    items = tryParse(s.slice(lo, hi + 1));
    if (items) return items;
  }
  const quoted = [...s.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)]
    .map(m => m[1].trim())
    .filter(Boolean)
    .slice(0, 3);
  return quoted.length ? quoted : null;
}

/* ---- Starter chips ------------------------------------------------- */

/** Initial suggestion chips, shown alongside the greeting once the
 *  model is ready.  Kept short and concrete so the user sees what kinds
 *  of things the assistant can actually do. */
const STARTER_CHIPS = [
  'Add 3 to 5',
  'Expand (x-1)^6',
  'Solve for x: x^2-5*x+6=0',
];

/* ---- Model catalog ------------------------------------------------
   Curated subset of WebLLM's prebuiltAppConfig.model_list (see
   https://github.com/mlc-ai/web-llm/blob/main/src/config.ts) chosen
   to span small-fast → large-smart so users with different hardware
   can pick what fits.  All entries are q4f16_1 quantization (the
   standard for WebGPU); all are instruction-tuned (no base models).

   Adding/removing models: paste a `model_id:` line from the WebLLM
   config and fill in label / size / note.  Sizes are approximate
   download size (≈ on-disk Cache Storage size after download), not
   VRAM requirement — VRAM is similar for q4f16_1 but exact numbers
   live on each prebuiltAppConfig entry's vram_required_MB field if
   you need them.
   ------------------------------------------------------------------ */
const MODELS = [
  // ---- 0.4-0.7 GB — fastest, weakest ----
  { id: 'SmolLM2-360M-Instruct-q4f16_1-MLC',          label: 'SmolLM2 360M',           size: '~370 MB',  note: 'Fastest, weakest — fluent but unreliable on math / structured output' },
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',          label: 'Qwen2.5 0.5B',           size: '~400 MB',  note: 'Tiny, surprisingly good at JSON / tool calls' },
  { id: 'Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC',    label: 'Qwen2.5 Coder 0.5B',     size: '~400 MB',  note: 'Code-tuned 0.5B — handles RPL syntax better than the base 0.5B' },
  { id: 'Qwen3-0.6B-q4f16_1-MLC',                     label: 'Qwen3 0.6B',             size: '~500 MB',  note: 'Newer Qwen generation' },
  { id: 'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC',       label: 'TinyLlama 1.1B',         size: '~700 MB',  note: 'Classic small chat model' },

  // ---- 0.9-1.5 GB — small / sweet spot ----
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',          label: 'Llama 3.2 1B',           size: '~880 MB',  note: 'Recommended default — solid balance', isDefault: true },
  { id: 'stablelm-2-zephyr-1_6b-q4f16_1-MLC',         label: 'StableLM 2 Zephyr 1.6B', size: '~1.0 GB',  note: 'Stability AI chat-tuned' },
  { id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',          label: 'SmolLM2 1.7B',           size: '~1.0 GB',  note: 'Larger SmolLM2 — better follow-through than 360M' },
  { id: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',    label: 'Qwen2.5 Coder 1.5B',     size: '~1.3 GB',  note: 'Code-tuned 1.5B — strong at structured output' },
  { id: 'Qwen2.5-Math-1.5B-Instruct-q4f16_1-MLC',     label: 'Qwen2.5 Math 1.5B',      size: '~1.3 GB',  note: 'Math-tuned — better at calc-style reasoning' },
  { id: 'Qwen3-1.7B-q4f16_1-MLC',                     label: 'Qwen3 1.7B',             size: '~1.4 GB',  note: 'Newer Qwen, mid-size' },

  // ---- 1.9-2.4 GB — mid-tier ----
  { id: 'gemma-2-2b-it-q4f16_1-MLC',                  label: 'Gemma 2 2B',             size: '~1.9 GB',  note: 'Google instruction-tuned 2B' },
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',          label: 'Llama 3.2 3B',           size: '~2.3 GB',  note: 'Much smarter than 1B — needs ~3 GB VRAM' },
  { id: 'Hermes-3-Llama-3.2-3B-q4f16_1-MLC',          label: 'Hermes 3 (Llama 3.2 3B)', size: '~2.3 GB', note: 'NousResearch fine-tune of Llama 3.2 3B — strong tool calling' },
  { id: 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC',      label: 'Qwen2.5 Coder 3B',       size: '~2.4 GB',  note: 'Code-tuned 3B' },
  { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',          label: 'Phi 3.5 mini',           size: '~2.4 GB',  note: 'Microsoft — strong on tool / structured output' },

  // ---- 3.0+ GB — premium, needs a beefy GPU ----
  { id: 'Qwen3-4B-q4f16_1-MLC',                       label: 'Qwen3 4B',               size: '~3.2 GB',  note: 'Premium Qwen3 mid-tier' },
  { id: 'Mistral-7B-Instruct-v0.3-q4f16_1-MLC',       label: 'Mistral 7B v0.3',        size: '~4.5 GB',  note: 'Premium — needs ≥6 GB VRAM' },
  { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',            label: 'Qwen2.5 7B',             size: '~5.0 GB',  note: 'Premium — needs ≥6 GB VRAM' },
  { id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',          label: 'Llama 3.1 8B',           size: '~5.4 GB',  note: 'Top-tier — needs ≥6 GB VRAM' },
];

const DEFAULT_MODEL_ID  = MODELS.find((m) => m.isDefault)?.id ?? MODELS[0].id;
const MODEL_STORAGE_KEY = 'rpl5050.chatbot.modelId';

function loadSavedModelId() {
  try { return localStorage.getItem(MODEL_STORAGE_KEY); } catch { return null; }
}
function saveModelId(id) {
  try { localStorage.setItem(MODEL_STORAGE_KEY, id); } catch { /* private mode */ }
}

/* ================================================================
   ChatBot class
   ================================================================ */

export class ChatBot {
  /**
   * @param {object} opts
   * @param {object} opts.tools — Calculator-side callback bag.  Each
   *   field corresponds to a primitive operation that one or more tools
   *   exposed to the model dispatch into.  Members:
   *     run(text:string):void          — type RPL into the editor and ENTER
   *     appendToEditor(text:string)    — insert at cursor, no commit
   *     clearEditor():void             — empty the editor buffer
   *     getEditor():string             — current editor contents
   *     listVars():string[]            — variable names in current dir
   *     recallVar(name:string):any     — value of named variable (or undefined)
   * @param {function} opts.getContext — () => { stack, angleMode, displayMode, dir }
   */
  constructor({ tools, getContext }) {
    this._tools      = tools;
    this._getContext = getContext;
    this._llm        = new LLM();
    this._history    = [];   // conversation turns (messages array)
    this._container  = null; // DOM element we're mounted into
    this._messagesEl = null; // scrollable message list
    this._inputEl    = null; // textarea
    this._sendBtn    = null;
    this._stopBtn    = null;
    this._statusEl   = null;
    this._progressEl = null;
    this._generating = false;
    this._pendingConfirm = null; // { resolve } | null — awaiting user confirmation
    // Monotonic counter incremented every time we start (or kill) a
    // _runLoop turn.  Each loop captures its own turnId locally and
    // bails out silently if it discovers _runId has moved past it —
    // that's how _newChat aborts in-flight generation cleanly without
    // race-condition history corruption.
    this._runId = 0;

    // Tool registry — the single source of truth for what the model can
    // call.  Each entry is { confirm, summary(args), handler(args) }.
    // Read-only tools (confirm:false) execute automatically; mutating
    // tools render a confirmation widget and pause the loop on
    // _pendingConfirm until the user clicks Run or Cancel.  Adding a new
    // tool means: register it here, document it in SYSTEM_PROMPT, and
    // (if it needs a new calculator primitive) add a callback in
    // app.js's `tools` bag.
    this._registry = this._buildRegistry();

    this._llm.onStatus((status, msg) => this._onStatus(status, msg));
    this._llm.onProgress((info) => this._onProgress(info));
  }

  /* ---- Tool registry ---- */

  _buildRegistry() {
    const tools = this._tools;
    const ctx   = () => this._getContext();
    return {
      // ---- Read-only (auto, no confirmation) ----
      get_stack: {
        confirm: false,
        summary: () => ({ label: '🔍 get_stack', code: '' }),
        handler: () => {
          const c = ctx();
          return {
            stack: c.stack,
            angleMode: c.angleMode,
            displayMode: c.displayMode,
            dir: c.dir,
          };
        },
      },
      get_editor: {
        confirm: false,
        summary: () => ({ label: '🔍 get_editor', code: '' }),
        handler: () => ({ buffer: tools.getEditor() }),
      },
      get_vars: {
        confirm: false,
        summary: () => ({ label: '🔍 get_vars', code: '' }),
        handler: () => ({ vars: tools.listVars(), dir: ctx().dir }),
      },
      recall_var: {
        confirm: false,
        summary: ({ name } = {}) => ({ label: `🔍 recall_var ${name ?? ''}`, code: '' }),
        handler: ({ name } = {}) => {
          const v = tools.recallVar(String(name ?? ''));
          return v === undefined
            ? { name, exists: false }
            : { name, exists: true, value: String(v) };
        },
      },

      // ---- Mutating (require user confirmation) ----
      run: {
        confirm: true,
        summary: ({ text } = {}) => ({ label: '▶ Run RPL', code: String(text ?? '') }),
        handler: ({ text } = {}) => {
          tools.run(String(text ?? ''));
          const c = ctx();
          return { success: true, stack: c.stack };
        },
      },
      append_to_editor: {
        confirm: true,
        summary: ({ text } = {}) => ({ label: '✎ Append to editor', code: String(text ?? '') }),
        handler: ({ text } = {}) => {
          tools.appendToEditor(String(text ?? ''));
          return { success: true, buffer: tools.getEditor() };
        },
      },
      clear_editor: {
        confirm: true,
        summary: () => ({ label: '✗ Clear editor', code: '' }),
        handler: () => {
          tools.clearEditor();
          return { success: true, buffer: tools.getEditor() };
        },
      },
    };
  }

  /* ---- Lifecycle ---- */

  /** Render the chat UI into `el`.  Call once.
   *
   *  Model load policy:
   *   - First-ever mount with no saved model → show the picker;
   *     don't auto-download anything.  The user picks explicitly so
   *     they're not surprised by a several-hundred-MB download on
   *     opening the panel.
   *   - Mount with a saved model id in localStorage → auto-load
   *     that model.  Subsequent loads of the same id hit Cache
   *     Storage and complete in seconds.
   *   - Saved id no longer in MODELS (e.g. user wiped their setting,
   *     or we removed a model) → fall back to picker.
   */
  mount(el) {
    this._container = el;
    el.innerHTML = '';
    el.classList.add('cb-root');
    el.appendChild(this._buildUI());

    if (this._llm.status === 'idle') {
      const saved = loadSavedModelId();
      const known = saved && MODELS.some((m) => m.id === saved);
      if (known) {
        this._startLoad(saved);
      } else {
        this._showPicker();
      }
    }
  }

  /* ---- UI construction ---- */

  _buildUI() {
    const root = document.createElement('div');
    root.className = 'cb-inner';

    // — Header row: status text on the left, BETA badge in the
    // middle, "New chat" button on the right.  Status indicates model
    // load state; the BETA badge flags this whole feature as a
    // research preview so users don't expect production-grade
    // behaviour from a 1B-param on-device LLM; New chat resets the
    // conversation in-place without unloading the model.
    const header = document.createElement('div');
    header.className = 'cb-header';

    this._statusEl = document.createElement('div');
    this._statusEl.className = 'cb-status';

    const betaBadge = document.createElement('span');
    betaBadge.className = 'cb-beta-badge';
    betaBadge.textContent = 'BETA';
    betaBadge.title = 'On-device LLM is a research preview — replies may be wrong; always verify before running tool calls.';

    this._newChatBtn = document.createElement('button');
    this._newChatBtn.type = 'button';
    this._newChatBtn.className = 'cb-newchat-btn';
    this._newChatBtn.title = 'Start a new conversation';
    this._newChatBtn.setAttribute('aria-label', 'New chat');
    this._newChatBtn.textContent = '✱ New';
    this._newChatBtn.addEventListener('click', () => this._newChat());

    header.appendChild(this._statusEl);
    header.appendChild(betaBadge);
    header.appendChild(this._newChatBtn);

    this._progressEl = document.createElement('div');
    this._progressEl.className = 'cb-progress hidden';

    const progressBar = document.createElement('div');
    progressBar.className = 'cb-progress-bar';
    this._progressBarFill = document.createElement('div');
    this._progressBarFill.className = 'cb-progress-fill';
    progressBar.appendChild(this._progressBarFill);
    this._progressLabel = document.createElement('span');
    this._progressLabel.className = 'cb-progress-label';
    this._progressEl.appendChild(progressBar);
    this._progressEl.appendChild(this._progressLabel);

    // Load button — surfaced if a load fails.  Hidden by default;
    // _onStatus('error') unhides it as "Retry".  Re-running the same
    // model id retries; the picker is the way to switch models.
    this._loadBtn = document.createElement('button');
    this._loadBtn.className = 'cb-load-btn hidden';
    this._loadBtn.textContent = 'Retry';
    this._loadBtn.title = 'Retry loading the selected model.';
    this._loadBtn.addEventListener('click', () => {
      const id = loadSavedModelId() ?? DEFAULT_MODEL_ID;
      this._startLoad(id);
    });

    // "Pick a different model" affordance — visible alongside Retry
    // on error, and also surfaced from the header once a model is
    // ready so the user can switch later.
    this._switchModelBtn = document.createElement('button');
    this._switchModelBtn.className = 'cb-switch-model-btn hidden';
    this._switchModelBtn.textContent = '⇄ Pick a different model';
    this._switchModelBtn.title = 'Show the model picker.';
    this._switchModelBtn.addEventListener('click', () => this._showPicker());

    // — Picker (hidden by default; populated by _showPicker())
    this._pickerEl = document.createElement('div');
    this._pickerEl.className = 'cb-picker hidden';

    // — Messages list
    this._messagesEl = document.createElement('div');
    this._messagesEl.className = 'cb-messages';

    // — Input row
    const inputRow = document.createElement('div');
    inputRow.className = 'cb-input-row';

    this._inputEl = document.createElement('textarea');
    this._inputEl.className = 'cb-input';
    this._inputEl.placeholder = 'Ask about RPL, commands, maths…';
    this._inputEl.rows = 1;          // height matches the send button (40px)
    this._inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._submit();
      }
    });
    // Auto-grow vertically as the user types.  Reset to single-line
    // height first so deleting content can shrink the box again, then
    // expand to fit the wrapped content.  The CSS max-height caps it
    // so the textarea never eats the whole panel.
    this._autoGrowInput = () => {
      const el = this._inputEl;
      // Reset first so deletes can shrink it back; box-sizing: border-box
      // means we add the top+bottom border to scrollHeight, otherwise the
      // last line gets clipped by 2 px.
      el.style.height = 'auto';
      el.style.height = (el.scrollHeight + 2) + 'px';
    };
    this._inputEl.addEventListener('input', this._autoGrowInput);

    this._sendBtn = document.createElement('button');
    this._sendBtn.className = 'cb-send-btn';
    this._sendBtn.textContent = '▶';
    this._sendBtn.title = 'Send (Enter)';
    this._sendBtn.disabled = true;
    this._sendBtn.addEventListener('click', () => this._submit());

    this._stopBtn = document.createElement('button');
    this._stopBtn.className = 'cb-stop-btn hidden';
    this._stopBtn.textContent = '■ Stop';
    this._stopBtn.addEventListener('click', () => this._abort());

    inputRow.appendChild(this._inputEl);
    inputRow.appendChild(this._sendBtn);

    root.appendChild(header);
    root.appendChild(this._progressEl);
    root.appendChild(this._loadBtn);
    root.appendChild(this._switchModelBtn);
    root.appendChild(this._pickerEl);
    root.appendChild(this._messagesEl);
    root.appendChild(this._stopBtn);
    root.appendChild(inputRow);

    this._setUIState('idle');
    return root;
  }

  /* ---- Model picker --------------------------------------------------
     Renders MODELS as a vertical list.  Clicking a row picks + loads
     that model and persists the selection to localStorage.  The
     picker hides itself once loading begins; _showPicker() can be
     called again from the header / error state to change models. */

  _showPicker() {
    if (!this._pickerEl) return;
    this._pickerEl.innerHTML = '';
    this._pickerEl.classList.remove('hidden');

    // Header row with the blurb and a close button so the user can
    // back out without selecting.  Dismiss is always allowed — even
    // before any model has been loaded — but in that case the chat
    // input stays disabled and the "Pick a model" button stays
    // surfaced so they can re-open the picker.
    const head = document.createElement('div');
    head.className = 'cb-picker-head';

    const blurb = document.createElement('p');
    blurb.className = 'cb-picker-blurb';
    blurb.textContent =
      'Pick a model. Each runs entirely on your device via WebGPU. '
      + 'First load downloads the weights (one-time per model) and caches them in the browser.';
    head.appendChild(blurb);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'cb-picker-close';
    closeBtn.title = 'Dismiss the picker';
    closeBtn.setAttribute('aria-label', 'Dismiss the picker');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => this._dismissPicker());
    head.appendChild(closeBtn);

    this._pickerEl.appendChild(head);

    const list = document.createElement('ul');
    list.className = 'cb-picker-list';

    const activeId = this._llm.loadedModelId ?? loadSavedModelId();

    for (const m of MODELS) {
      const li = document.createElement('li');
      li.className = 'cb-picker-row';
      if (m.id === activeId) li.classList.add('cb-picker-row-active');

      const top = document.createElement('div');
      top.className = 'cb-picker-row-top';

      const name = document.createElement('span');
      name.className = 'cb-picker-name';
      name.textContent = m.label;

      const size = document.createElement('span');
      size.className = 'cb-picker-size';
      size.textContent = m.size;

      top.appendChild(name);
      top.appendChild(size);

      const note = document.createElement('div');
      note.className = 'cb-picker-note';
      note.textContent = m.note;
      if (m.id === activeId) note.textContent += ' · loaded';

      li.appendChild(top);
      li.appendChild(note);

      li.addEventListener('click', () => {
        if (this._generating) return; // can't switch mid-generation
        if (m.id === this._llm.loadedModelId) {
          // Already loaded — just hide the picker.
          this._pickerEl.classList.add('hidden');
          return;
        }
        saveModelId(m.id);
        this._pickerEl.classList.add('hidden');
        // Reset the visible conversation when switching models —
        // the new model has different priors and the prior chat
        // history would be confusing in that context.
        this._history = [];
        if (this._messagesEl) this._messagesEl.innerHTML = '';
        this._removeActiveChips();
        this._startLoad(m.id);
      });

      list.appendChild(li);
    }
    this._pickerEl.appendChild(list);
  }

  _hidePicker() {
    this._pickerEl?.classList.add('hidden');
  }

  /** User-driven dismiss of the picker.  Hides the list and surfaces
   *  the "Pick a model" button so they can re-open it.  Differs from
   *  _hidePicker() (called as part of normal load flow) only in that
   *  it always exposes the re-open button, even when no model is
   *  loaded yet — otherwise the user could end up looking at an empty
   *  panel with no way to bring the picker back. */
  _dismissPicker() {
    this._hidePicker();
    if (this._switchModelBtn) {
      this._switchModelBtn.classList.remove('hidden');
      // Adapt the label to match what's loaded.
      this._switchModelBtn.textContent =
        this._llm.loadedModelId ? '⇄ Pick a different model' : '⇄ Pick a model';
    }
  }

  /** Wipe the conversation and start fresh.  Aborts any in-flight
   *  generation, clears history + the visible bubble list, and re-shows
   *  the starter chips.  The model itself stays loaded — this is purely
   *  a conversation reset, not a model reset. */
  _newChat() {
    // Bump the turn id so an in-flight _runLoop detects the reset and
    // unwinds without writing back into the freshly-cleared history.
    this._runId++;
    if (this._generating) {
      this._llm.abort();
      if (this._pendingConfirm) {
        this._pendingConfirm.resolve(false);
        this._pendingConfirm = null;
      }
    }
    this._history = [];
    this._removeActiveChips();
    if (this._messagesEl) this._messagesEl.innerHTML = '';
    if (this._inputEl) {
      this._inputEl.value = '';
      this._inputEl.style.height = '';        // reset auto-grow
    }

    // If the model is already ready, re-render the greeting + starter
    // chips immediately.  Otherwise the greeting will fire from
    // _onStatus('ready') as before.
    if (this._llm.status === 'ready') {
      const greeting = this._addAssistantBubble(
        'New conversation started. Pick a starter or type your own:',
      );
      this._renderChips(STARTER_CHIPS, greeting);
    }
    this._inputEl?.focus();
  }

  /* ---- Model loading ---- */

  async _startLoad(modelId) {
    if (!modelId) modelId = loadSavedModelId() ?? DEFAULT_MODEL_ID;
    this._loadBtn.disabled = true;
    this._loadBtn.textContent = 'Loading…';
    this._loadBtn.classList.add('hidden');
    this._switchModelBtn.classList.add('hidden');
    this._hidePicker();
    try {
      await this._llm.load(modelId);
    } catch (err) {
      this._loadBtn.disabled = false;
      this._loadBtn.textContent = 'Retry';
    }
  }

  _onStatus(status, msg) {
    if (status === 'loading') {
      this._statusEl.textContent = msg || 'Loading…';
      this._statusEl.className = 'cb-status cb-status-loading';
      this._progressEl.classList.remove('hidden');
      this._loadBtn.classList.add('hidden');
      this._switchModelBtn.classList.add('hidden');
      this._hidePicker();
    } else if (status === 'ready') {
      const id    = this._llm.loadedModelId;
      const entry = MODELS.find((m) => m.id === id);
      const label = entry?.label ?? id ?? '';
      this._statusEl.textContent = `● ${label || 'Ready'}`;
      this._statusEl.className = 'cb-status cb-status-ready';
      this._progressEl.classList.add('hidden');
      this._loadBtn.classList.add('hidden');
      this._switchModelBtn.classList.remove('hidden');
      this._switchModelBtn.textContent = '⇄ Pick a different model';
      this._sendBtn.disabled = false;
      this._hidePicker();
      // Greet on first ready, with starter chips so the user can jump
      // straight into a representative task.
      if (this._history.length === 0) {
        const greeting = this._addAssistantBubble(
          `${label || 'Model'} ready. I can answer questions about RPL, commands, and ` +
          'maths, and suggest calculator actions for you to confirm. ' +
          'Pick a starter or type your own:',
        );
        this._renderChips(STARTER_CHIPS, greeting);
      }
    } else if (status === 'error') {
      this._statusEl.textContent = `✗ ${msg || 'Error'}`;
      this._statusEl.className = 'cb-status cb-status-error';
      this._progressEl.classList.add('hidden');
      this._loadBtn.disabled = false;
      this._loadBtn.textContent = 'Retry';
      this._loadBtn.classList.remove('hidden');
      this._switchModelBtn.classList.remove('hidden');
    }
  }

  _onProgress({ file, progress }) {
    const pct = Math.round(progress ?? 0);
    this._progressBarFill.style.width = pct + '%';
    const name = (file ?? '').split('/').pop();
    this._progressLabel.textContent = name ? `${name} — ${pct}%` : `${pct}%`;
  }

  /* ---- Submit / tool-call loop ---- */

  async _submit() {
    const text = this._inputEl.value.trim();
    if (!text || this._generating) return;
    if (this._llm.status !== 'ready') return;

    this._inputEl.value = '';
    this._inputEl.style.height = '';            // collapse auto-grown height
    this._addUserBubble(text);
    this._setUIState('generating');

    try {
      await this._runLoop(text);
    } finally {
      this._setUIState('idle');
    }
  }

  /* ---- Linear three-phase pipeline --------------------------------
     One user turn = one LLM reply + one tool decision + (one optional
     tool execution) + one chip generation.  No iteration, no nested
     tool conversations — that level of agency requires a much larger
     model than 135M parameters can muster.

     Each phase has its own focused system prompt and runs as a
     separate generate() call so the model only juggles one task at a
     time.  Phase 2's tool decision result is rendered as a confirm
     widget under Phase 1's reply; on confirm we execute the tool and
     append a natural-language summary ("Ran X — stack is now …") to
     history so the next user turn's Phase 1 sees coherent prose
     rather than raw JSON. */
  async _runLoop(userText) {
    const turnId = ++this._runId;
    const stale  = () => this._runId !== turnId;

    // Inject current calculator state into the user message so every
    // turn starts with fresh stack/dir context.
    const ctx     = this._getContext();
    const ctxNote = this._formatContext(ctx);
    const content = ctxNote ? `${ctxNote}\n\n${userText}` : userText;
    this._history.push({ role: 'user', content });

    // ── Phase 1: reply ─────────────────────────────────────────────
    const reply = await this._phaseReply(turnId, 0);
    if (stale() || reply === null) return;
    const lastBubble = reply.bubble;

    // ── Phase 2: tool decision (silent) ────────────────────────────
    const toolCall = await this._phaseTool(turnId, 0, lastBubble);
    if (stale()) return;

    // ── Tool execution + history note (only if Phase 2 said yes) ───
    if (toolCall) {
      await this._dispatchTool(toolCall);
      if (stale()) return;
    }

    // ── Phase 3: suggestion chips ──────────────────────────────────
    await this._phaseSuggest(turnId, lastBubble);
  }

  /** Phase 1 — streamed natural-language reply.
   *  Returns { bubble, fullText } on success, or null if the user
   *  aborted / errored out (the bubble is finalised in either case). */
  async _phaseReply(turnId, iter) {
    const stale = () => this._runId !== turnId;
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT_REPLY },
      ...this._history,
    ];
    this._logPhase(`reply (iter ${iter})`, messages);

    const { bubble, textEl } = this._addStreamingBubble();
    let fullText = '';

    try {
      await this._llm.generate(messages, {
        onToken: (t) => {
          if (typeof t !== 'string' || !t) return;
          fullText += t;
          // Phase-1 output is pure prose — no markup to strip, no
          // partial tags to hide.  Just show what the model has so far.
          textEl.textContent = fullText.trim() || '…';
        },
      });
    } catch (err) {
      const display = err.message === 'AbortError' ? fullText.trim() : `⚠ ${err.message}`;
      this._finaliseStreamBubble(bubble, textEl, display, null);
      if (fullText) this._history.push({ role: 'assistant', content: fullText.trim() });
      return null;
    }

    if (stale()) return null;
    // eslint-disable-next-line no-console
    console.log(`[ChatBot] ← Phase 1 (${fullText.length} chars):\n${fullText}`);

    const trimmed = fullText.trim();
    const display = trimmed || '_(model returned no output — try rephrasing.)_';
    this._finaliseStreamBubble(bubble, textEl, display, null);
    this._history.push({ role: 'assistant', content: trimmed });
    return { bubble, fullText: trimmed };
  }

  /** Phase 2 — silent tool decision.  Returns the parsed tool call or
   *  null (NO_TOOL / unparseable / aborted).  No streaming bubble; a
   *  small inline pill below the last reply tells the user we're
   *  thinking.
   *
   *  WebLLM enforces OpenAI's "last message must be user/tool" rule
   *  (MessageOrderError otherwise), so we append a trailing user
   *  message that asks for the tool decision.  This trailing message
   *  also doubles as the action prompt — pulling "now emit the tool
   *  call" out of the system message and into a user turn makes
   *  small chat-tuned models more reliably follow the instruction. */
  async _phaseTool(turnId, iter, lastBubble) {
    const stale = () => this._runId !== turnId;
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT_TOOL },
      ...this._history,
      { role: 'user', content:
        'Now output ONE LINE — either the JSON tool call that fulfils my request above, '
        + 'or the literal word NO_TOOL if my request is purely conceptual. '
        + 'No prose, no code fences.' },
    ];
    this._logPhase(`tool (iter ${iter})`, messages);

    const pill = this._renderInlinePill(lastBubble, '⚙ deciding next step…');
    let fullText = '';
    // eslint-disable-next-line no-console
    console.groupCollapsed('[ChatBot] Phase 2 stream');
    try {
      // Phase 2 outputs at most one line of JSON or the literal
      // NO_TOOL — 80 tokens is plenty.  Capping low keeps the
      // worst-case latency bounded if the model loops.
      await this._llm.generate(messages, {
        maxTokens: 80,
        onToken: (t) => {
          if (typeof t === 'string') {
            fullText += t;
            // Live per-token visibility — so a stuck-looking Phase 2
            // is debuggable in real time without having to wait for
            // the final summary log.
            // eslint-disable-next-line no-console
            console.log('  tok:', JSON.stringify(t));
          }
        },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.groupEnd();
      pill?.remove?.();
      return null;
    }
    // eslint-disable-next-line no-console
    console.groupEnd();
    pill?.remove?.();
    if (stale()) return null;

    // eslint-disable-next-line no-console
    console.log(`[ChatBot] ← Phase 2 (${fullText.length} chars):\n${fullText}`);

    if (/\bNO_TOOL\b/.test(fullText)) return null;
    return parseToolCall(fullText);
  }

  /** Phase 3 — silent follow-up chip generation.  Renders a placeholder
   *  beneath the last reply that gets replaced by chips when ready, or
   *  removed silently on failure.
   *
   *  Same trailing-user-message trick as Phase 2 — WebLLM rejects
   *  message arrays whose last entry isn't user/tool, and the
   *  trailing instruction keeps small models on-task. */
  async _phaseSuggest(turnId, lastBubble) {
    const stale = () => this._runId !== turnId;
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT_SUGGEST },
      ...this._history,
      { role: 'user', content:
        'Now suggest three short follow-up questions I might ask next, '
        + 'as a JSON array of three strings. Output only the array.' },
    ];
    this._logPhase('suggest', messages);

    const placeholder = this._renderInlinePill(lastBubble, '⏳ thinking of follow-ups…');
    let fullText = '';
    // eslint-disable-next-line no-console
    console.groupCollapsed('[ChatBot] Phase 3 stream');
    try {
      // Phase 3 outputs a 3-element JSON array of short strings;
      // 120 tokens is more than enough.
      await this._llm.generate(messages, {
        maxTokens: 120,
        onToken: (t) => {
          if (typeof t === 'string') {
            fullText += t;
            // eslint-disable-next-line no-console
            console.log('  tok:', JSON.stringify(t));
          }
        },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.groupEnd();
      placeholder?.remove?.();
      return;
    }
    // eslint-disable-next-line no-console
    console.groupEnd();
    placeholder?.remove?.();
    if (stale()) return;

    // eslint-disable-next-line no-console
    console.log(`[ChatBot] ← Phase 3 (${fullText.length} chars):\n${fullText}`);

    const items = parseSuggestionsArray(fullText);
    if (items?.length) this._renderChips(items, lastBubble);
  }

  /** Dispatch a parsed tool call through the registry.  Renders a
   *  confirm widget for mutating tools, executes, then appends a
   *  natural-language summary of what happened to history (so the
   *  *next* user turn's Phase 1 model sees coherent prose, not raw
   *  JSON).  No return value — single-pass pipeline doesn't need to
   *  signal continuation. */
  async _dispatchTool(toolCall) {
    const tool = this._registry[toolCall.name];
    const args = toolCall.arguments ?? {};

    if (!tool) {
      this._addAssistantBubble(`_(unknown tool: \`${toolCall.name}\`.)_`);
      this._pushHistoryNote(`(Tried to use unknown tool "${toolCall.name}".)`);
      return;
    }

    if (tool.confirm) {
      const summary = tool.summary(args);
      // `complete` flips the widget out of "Running…" once the
      // handler returns.  Without this call the button stays stuck
      // on the interim label forever, even though the tool has
      // actually finished executing.  Cancel path is handled by the
      // cancel button's own click listener (it sets "✗ Cancelled"
      // before resolve(false)), so we only call complete() on the
      // run path.
      const { complete } = this._addToolWidgetBubble({ name: toolCall.name, ...summary });
      const confirmed = await new Promise((resolve) => {
        this._pendingConfirm = { resolve };
      });
      this._pendingConfirm = null;
      if (!confirmed) {
        this._pushHistoryNote(`(User cancelled the proposed ${toolCall.name} action.)`);
        return;
      }
      try {
        const result = await tool.handler(args);
        complete(true, '✓ Done');
        this._pushHistoryNote(this._summariseToolResult(toolCall.name, args, result));
      } catch (err) {
        complete(false, `✗ ${err.message ?? 'Failed'}`);
        this._pushHistoryNote(`(Running ${toolCall.name} failed: ${err.message}.)`);
      }
      return;
    }

    // Read-only — execute silently.
    try {
      const result = await tool.handler(args);
      this._pushHistoryNote(this._summariseToolResult(toolCall.name, args, result));
    } catch (err) {
      this._pushHistoryNote(`(Reading ${toolCall.name} failed: ${err.message}.)`);
    }
  }

  /** Append a short natural-language note to history as if the
   *  assistant said it.  Tiny models parse plain prose far better than
   *  structured `<tool_response>` JSON, so we collapse tool execution
   *  into one human-readable sentence per turn. */
  _pushHistoryNote(text) {
    if (!text) return;
    this._history.push({ role: 'assistant', content: text });
  }

  /** Convert a tool's structured result into a one-line English
   *  summary the model can grok.  Falls back to JSON for unknown
   *  shapes — better that than nothing. */
  _summariseToolResult(name, args, result) {
    const r = result ?? {};
    if (name === 'run' && r.success) {
      const stack = Array.isArray(r.stack) ? r.stack : [];
      const head  = stack.slice(0, 3).map((v, i) => `${i + 1}: ${v}`).join(', ');
      return stack.length
        ? `(Ran \`${args.text}\`. Stack now: ${head}${stack.length > 3 ? ', …' : ''}.)`
        : `(Ran \`${args.text}\`. Stack is empty.)`;
    }
    if (name === 'append_to_editor' && r.success) {
      return `(Editor now contains: \`${r.buffer}\`.)`;
    }
    if (name === 'clear_editor' && r.success) {
      return '(Editor cleared.)';
    }
    if (name === 'get_stack') {
      const stack = Array.isArray(r.stack) ? r.stack : [];
      return stack.length
        ? `(Stack: ${stack.slice(0, 3).map((v, i) => `${i + 1}: ${v}`).join(', ')}.)`
        : '(Stack is empty.)';
    }
    if (name === 'get_editor') {
      return r.buffer ? `(Editor: \`${r.buffer}\`.)` : '(Editor is empty.)';
    }
    if (name === 'get_vars') {
      const vars = Array.isArray(r.vars) ? r.vars : [];
      return vars.length
        ? `(Variables in ${r.dir ?? 'current dir'}: ${vars.join(', ')}.)`
        : `(No variables in ${r.dir ?? 'current dir'}.)`;
    }
    if (name === 'recall_var') {
      return r.exists
        ? `(${r.name} = ${r.value}.)`
        : `(${r.name} is not defined.)`;
    }
    return `(${name} returned: ${JSON.stringify(result)})`;
  }

  _logPhase(label, messages) {
    // eslint-disable-next-line no-console
    console.groupCollapsed(`[ChatBot] → Phase ${label}`);
    // eslint-disable-next-line no-console
    console.log('messages:', messages);
    // eslint-disable-next-line no-console
    console.log('total chars:', messages.reduce((n, m) => n + (m.content?.length ?? 0), 0));
    // eslint-disable-next-line no-console
    console.groupEnd();
  }

  _abort() {
    this._llm.abort();
    // Also resolve any pending confirmation as cancelled.
    if (this._pendingConfirm) {
      this._pendingConfirm.resolve(false);
    }
  }

  /* ---- Context formatting ---- */

  _formatContext(ctx) {
    if (!ctx) return '';
    const lines = [];
    if (ctx.stack?.length > 0) {
      lines.push('Stack: ' + ctx.stack.map((v, i) => `${i + 1}: ${v}`).join('  '));
    } else {
      lines.push('Stack: (empty)');
    }
    if (ctx.angleMode)   lines.push(`Angle: ${ctx.angleMode}`);
    if (ctx.displayMode) lines.push(`Display: ${ctx.displayMode}`);
    if (ctx.dir)         lines.push(`Dir: ${ctx.dir}`);
    return `[Calculator state — ${lines.join('  ')}]`;
  }

  /* ---- Bubble helpers ---- */

  _addUserBubble(text) {
    // Any active chips belong to the previous turn — drop them before
    // the new user bubble lands so they don't sit awkwardly above.
    this._removeActiveChips();
    const el = document.createElement('div');
    el.className = 'cb-bubble cb-bubble-user';
    el.textContent = text;
    this._messagesEl.appendChild(el);
    this._scrollBottom();
  }

  _addAssistantBubble(markdownText) {
    const el = document.createElement('div');
    el.className = 'cb-bubble cb-bubble-assistant';
    el.appendChild(renderMarkdown(markdownText));
    this._messagesEl.appendChild(el);
    this._scrollBottom();
    return el;
  }

  /** Render a small status pill below `after` (a bubble) — used while
   *  phase 2 / phase 3 are running to show silent progress without
   *  dropping a full streaming bubble.  Returns the pill element so
   *  callers can `.remove()` it when their phase completes. */
  _renderInlinePill(after, text) {
    const pill = document.createElement('div');
    pill.className = 'cb-inline-pill';
    pill.textContent = text;
    if (after && after.parentNode === this._messagesEl) {
      this._messagesEl.insertBefore(pill, after.nextSibling);
    } else {
      this._messagesEl.appendChild(pill);
    }
    this._scrollBottom();
    return pill;
  }

  /** A bubble that contains only a tool-call confirmation widget — no
   *  prose.  Used in the three-phase loop where the prose lives in its
   *  own preceding bubble and the proposed action gets its own card.
   *  Returns `{ bubble, complete }` — `complete(ok, label)` flips the
   *  widget out of its in-flight "Running…" state once the handler
   *  finishes; see `_buildToolCallWidget`'s docstring for the
   *  contract. */
  _addToolWidgetBubble({ name, label, code }) {
    const bubble = document.createElement('div');
    bubble.className = 'cb-bubble cb-bubble-assistant cb-bubble-tool';
    const { widget, complete } = this._buildToolCallWidget({ name, label, code });
    bubble.appendChild(widget);
    this._messagesEl.appendChild(bubble);
    this._scrollBottom();
    return { bubble, complete };
  }

  /** Create an in-progress streaming bubble.  Returns refs to update it. */
  _addStreamingBubble() {
    const bubble = document.createElement('div');
    bubble.className = 'cb-bubble cb-bubble-assistant cb-bubble-streaming';

    const textEl = document.createElement('span');
    textEl.className = 'cb-stream-text';
    textEl.textContent = '…';
    bubble.appendChild(textEl);

    const cursor = document.createElement('span');
    cursor.className = 'cb-cursor';
    bubble.appendChild(cursor);

    this._messagesEl.appendChild(bubble);
    this._scrollBottom();
    return { bubble, textEl };
  }

  /** Replace the streaming span with rendered markdown + optional tool-call widget. */
  _finaliseStreamBubble(bubble, _textEl, cleanText, toolCall) {
    bubble.classList.remove('cb-bubble-streaming');
    bubble.innerHTML = '';

    if (cleanText) {
      const mdFrag = renderMarkdown(cleanText);
      bubble.appendChild(mdFrag);
    }

    if (toolCall) {
      // Legacy path — current pipeline always passes toolCall=null
      // here and renders the widget in a separate bubble via
      // _addToolWidgetBubble.  Kept for symmetry; the `complete`
      // handle is intentionally unused because nothing in this code
      // path awaits the tool.
      const { widget } = this._buildToolCallWidget(toolCall);
      bubble.appendChild(widget);
    }

    this._scrollBottom();
  }

  /* ---- Suggestion chips ----
     Chips render *under* the most recent assistant bubble.  Only one
     strip is visible at a time — submitting (or clicking another chip)
     removes the previous strip.  Clicking a chip submits it as the
     user's next message. */

  /** Render a horizontal strip of chips below the messages list, or
   *  immediately after `after` if given.  Returns the strip element so
   *  callers can position other content relative to it. */
  _renderChips(items, after = null) {
    this._removeActiveChips();
    if (!items || items.length === 0) return null;

    const wrap = document.createElement('div');
    wrap.className = 'cb-chips';
    for (const item of items) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'cb-chip';
      chip.textContent = item;
      chip.addEventListener('click', () => this._sendChip(item));
      wrap.appendChild(chip);
    }

    if (after && after.parentNode === this._messagesEl) {
      this._messagesEl.insertBefore(wrap, after.nextSibling);
    } else {
      this._messagesEl.appendChild(wrap);
    }
    this._activeChipsEl = wrap;
    this._scrollBottom();
    return wrap;
  }

  _removeActiveChips() {
    if (this._activeChipsEl?.parentNode) {
      this._activeChipsEl.parentNode.removeChild(this._activeChipsEl);
    }
    this._activeChipsEl = null;
  }

  _sendChip(text) {
    if (this._generating || this._llm.status !== 'ready') return;
    this._removeActiveChips();
    this._inputEl.value = text;
    this._submit();
  }

  /** Build a tool-call confirmation widget.
   *
   *  Returns `{ widget, complete }` rather than a bare DOM node:
   *    - `widget`   — the element to insert into the message list.
   *    - `complete(ok, label)` — call this AFTER the tool handler
   *      finishes (or throws) to flip the button out of its
   *      "✓ Running…" state.  Without it the button is stuck on
   *      "Running…" forever, which is misleading because the tool
   *      has actually completed by then — the widget just never got
   *      told.  Cancel and Run-then-await both flow through this
   *      helper so the disabled-state contract stays uniform.
   *
   *  The click handlers themselves only resolve the pending-confirm
   *  promise and disable both buttons — they DO NOT set a final
   *  label.  That's `complete()`'s job, called from `_dispatchTool`
   *  with the actual outcome.  This avoids the previous footgun
   *  where the click handler optimistically wrote "✓ Running…" and
   *  the dispatch path had no way to overwrite it. */
  _buildToolCallWidget({ name, label, code }) {
    const widget = document.createElement('div');
    widget.className = 'cb-action-widget';

    const labelEl = document.createElement('div');
    labelEl.className = 'cb-action-label';
    labelEl.textContent = label || `Tool: ${name}`;
    widget.appendChild(labelEl);

    if (code) {
      const pre = document.createElement('pre');
      pre.className = 'cb-action-code';
      pre.textContent = code;
      widget.appendChild(pre);
    }

    const btnRow = document.createElement('div');
    btnRow.className = 'cb-action-btns';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'cb-btn-confirm';
    confirmBtn.textContent = '▶ Run';
    confirmBtn.addEventListener('click', () => {
      if (!this._pendingConfirm) return;
      // Disable + show interim label.  _dispatchTool will overwrite
      // this label via complete() once the handler returns.
      confirmBtn.disabled = true;
      cancelBtn.disabled  = true;
      confirmBtn.textContent = '✓ Running…';
      this._pendingConfirm.resolve(true);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'cb-btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      if (!this._pendingConfirm) return;
      confirmBtn.disabled = true;
      cancelBtn.disabled  = true;
      cancelBtn.textContent = '✗ Cancelled';
      this._pendingConfirm.resolve(false);
    });

    btnRow.appendChild(confirmBtn);
    btnRow.appendChild(cancelBtn);
    widget.appendChild(btnRow);

    // Mark the widget done.  Called from _dispatchTool with the
    // outcome of the handler so the user sees a definite end state
    // rather than the in-flight "Running…" label.  Idempotent — safe
    // to call multiple times; only the first call has visible
    // effect.
    let _completed = false;
    const complete = (ok, finalLabel) => {
      if (_completed) return;
      _completed = true;
      confirmBtn.disabled = true;
      cancelBtn.disabled  = true;
      confirmBtn.textContent = finalLabel || (ok ? '✓ Done' : '✗ Failed');
      widget.classList.add(ok ? 'cb-action-done' : 'cb-action-failed');
    };

    return { widget, complete };
  }

  /* ---- UI state ---- */

  _setUIState(state) {
    this._generating = (state === 'generating');
    if (this._sendBtn) this._sendBtn.disabled = this._generating || this._llm.status !== 'ready';
    if (this._stopBtn) this._stopBtn.classList.toggle('hidden', !this._generating);
    if (this._inputEl) this._inputEl.disabled = this._generating;
  }

  _scrollBottom() {
    if (this._messagesEl) {
      this._messagesEl.scrollTop = this._messagesEl.scrollHeight;
    }
  }
}
