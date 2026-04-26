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

  /** Render the chat UI into `el`.  Call once.  Kicks off the model
   *  download automatically — the model only weighs ~460 MB once and
   *  HuggingFace caches it locally, so subsequent loads are instant.
   *  The Load button stays available as a "Retry" affordance if the
   *  download fails. */
  mount(el) {
    this._container = el;
    el.innerHTML = '';
    el.classList.add('cb-root');
    el.appendChild(this._buildUI());

    // Auto-load on first mount.  Subsequent mounts are no-ops because
    // _startLoad short-circuits when the model is already loading or
    // ready.
    if (this._llm.status === 'idle') {
      this._startLoad();
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

    // Load button — only surfaced if the auto-load on mount() fails.
    // Hidden by default; _onStatus('error') unhides it as "Retry".
    this._loadBtn = document.createElement('button');
    this._loadBtn.className = 'cb-load-btn hidden';
    this._loadBtn.textContent = 'Retry download';
    this._loadBtn.title = 'Loads Llama-3.2-1B-Instruct (q4f16_1) via WebLLM from the bundled copy under www/models/mlc-ai/, falling back to HuggingFace + binary-mlc-llm-libs if not present. Cached afterward in the browser for instant subsequent loads.';
    this._loadBtn.addEventListener('click', () => this._startLoad());

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
    root.appendChild(this._messagesEl);
    root.appendChild(this._stopBtn);
    root.appendChild(inputRow);

    this._setUIState('idle');
    return root;
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

  async _startLoad() {
    this._loadBtn.disabled = true;
    this._loadBtn.textContent = 'Loading…';
    try {
      await this._llm.load();
    } catch (err) {
      this._loadBtn.disabled = false;
      this._loadBtn.textContent = 'Retry download';
    }
  }

  _onStatus(status, msg) {
    if (status === 'loading') {
      this._statusEl.textContent = msg || 'Loading…';
      this._statusEl.className = 'cb-status cb-status-loading';
      this._progressEl.classList.remove('hidden');
      this._loadBtn.classList.add('hidden');
    } else if (status === 'ready') {
      this._statusEl.textContent = `● ${msg || 'Ready'}`;
      this._statusEl.className = 'cb-status cb-status-ready';
      this._progressEl.classList.add('hidden');
      this._loadBtn.classList.add('hidden');
      this._sendBtn.disabled = false;
      // Greet on first ready, with starter chips so the user can jump
      // straight into a representative task.
      if (this._history.length === 0) {
        const greeting = this._addAssistantBubble(
          'Model ready! I can answer questions about RPL, commands, and ' +
          'maths, and I can suggest calculator actions for you to confirm. ' +
          'Pick a starter or type your own:',
        );
        this._renderChips(STARTER_CHIPS, greeting);
      }
    } else if (status === 'error') {
      this._statusEl.textContent = `✗ ${msg || 'Error'}`;
      this._statusEl.className = 'cb-status cb-status-error';
      this._progressEl.classList.add('hidden');
      this._loadBtn.disabled = false;
      this._loadBtn.textContent = 'Retry download';
      this._loadBtn.classList.remove('hidden');
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
   *  thinking. */
  async _phaseTool(turnId, iter, lastBubble) {
    const stale = () => this._runId !== turnId;
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT_TOOL },
      ...this._history,
    ];
    this._logPhase(`tool (iter ${iter})`, messages);

    const pill = this._renderInlinePill(lastBubble, '⚙ deciding next step…');
    let fullText = '';
    try {
      await this._llm.generate(messages, {
        onToken: (t) => { if (typeof t === 'string') fullText += t; },
      });
    } catch (err) {
      pill?.remove?.();
      return null;
    }
    pill?.remove?.();
    if (stale()) return null;

    // eslint-disable-next-line no-console
    console.log(`[ChatBot] ← Phase 2 (${fullText.length} chars):\n${fullText}`);

    if (/\bNO_TOOL\b/.test(fullText)) return null;
    return parseToolCall(fullText);
  }

  /** Phase 3 — silent follow-up chip generation.  Renders a placeholder
   *  beneath the last reply that gets replaced by chips when ready, or
   *  removed silently on failure. */
  async _phaseSuggest(turnId, lastBubble) {
    const stale = () => this._runId !== turnId;
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT_SUGGEST },
      ...this._history,
    ];
    this._logPhase('suggest', messages);

    const placeholder = this._renderInlinePill(lastBubble, '⏳ thinking of follow-ups…');
    let fullText = '';
    try {
      await this._llm.generate(messages, {
        onToken: (t) => { if (typeof t === 'string') fullText += t; },
      });
    } catch (err) {
      placeholder?.remove?.();
      return;
    }
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
