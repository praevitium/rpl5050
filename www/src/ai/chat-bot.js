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

import { LLM }           from './llm.js';
import { SYSTEM_PROMPT } from './system-prompt.js';

/* Maximum tool-call iterations per user turn. */
const MAX_ITER = 6;

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

/* ---- Tool-call parsing -------------------------------------------- */

const TOOL_CALL_RE = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/;

/** Extract the first tool call from a response string.
 *  Returns { name, arguments } or null. */
function parseToolCall(text) {
  const m = TOOL_CALL_RE.exec(text);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[1]);
    if (typeof obj.name !== 'string') return null;
    return { name: obj.name, arguments: obj.arguments ?? {} };
  } catch {
    return null;
  }
}

/** Strip *complete* tool_call blocks from the text, returning the clean
 *  prose.  Used for finalised messages, where every tool_call has its
 *  closing tag. */
function stripToolCalls(text) {
  return text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
}

/** Format a partial response for the live streaming bubble.
 *
 *  The model's output interleaves prose with tool_call blocks.  A naive
 *  display would show raw `<tool_call>\n{"name":"run", …` as the JSON is
 *  being typed out, which looks like the chat is broken.  Instead, we:
 *    – strip any *complete* tool_call blocks (rare during streaming, but
 *      possible if there are multiple),
 *    – truncate at the first *opening* `<tool_call>` tag, replacing the
 *      partial XML with a small "preparing action…" badge.
 *
 *  Returns a string that's safe to drop into textContent. */
function formatStreamingText(text) {
  // Remove any already-closed tool_call blocks first.
  let s = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '');
  const open = s.indexOf('<tool_call>');
  if (open >= 0) {
    const prose = s.slice(0, open).trimEnd();
    return prose ? `${prose}\n\n⚙ preparing action…` : '⚙ preparing action…';
  }
  return s.trim();
}

/* ================================================================
   ChatBot class
   ================================================================ */

export class ChatBot {
  /**
   * @param {object} opts
   * @param {object} opts.tools        — { run(text:string):void }
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

    this._llm.onStatus((status, msg) => this._onStatus(status, msg));
    this._llm.onProgress((info) => this._onProgress(info));
  }

  /* ---- Lifecycle ---- */

  /** Render the chat UI into `el`.  Call once. */
  mount(el) {
    this._container = el;
    el.innerHTML = '';
    el.classList.add('cb-root');
    el.appendChild(this._buildUI());
  }

  /* ---- UI construction ---- */

  _buildUI() {
    const root = document.createElement('div');
    root.className = 'cb-inner';

    // — Status bar (model loading state + device badge)
    this._statusEl = document.createElement('div');
    this._statusEl.className = 'cb-status';

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

    // Load button — shown until model is ready
    this._loadBtn = document.createElement('button');
    this._loadBtn.className = 'cb-load-btn';
    this._loadBtn.textContent = 'Load model (~460 MB, bundled)';
    this._loadBtn.title = 'Downloads Qwen2.5-0.5B-Instruct (quantised) from HuggingFace and caches it locally.';
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
    this._inputEl.rows = 2;
    this._inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._submit();
      }
    });

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

    root.appendChild(this._statusEl);
    root.appendChild(this._progressEl);
    root.appendChild(this._loadBtn);
    root.appendChild(this._messagesEl);
    root.appendChild(this._stopBtn);
    root.appendChild(inputRow);

    this._setUIState('idle');
    return root;
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
      // Greet on first ready
      if (this._history.length === 0) {
        this._addAssistantBubble(
          'Model ready! I can answer questions about RPL, commands, and maths, ' +
          'and I can suggest calculator actions for you to confirm.\n\n' +
          'Try: *"How do I compute the factorial of 10?"* or ' +
          '*"Push π onto the stack"*.',
        );
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
    this._addUserBubble(text);
    this._setUIState('generating');

    try {
      await this._runLoop(text);
    } finally {
      this._setUIState('idle');
    }
  }

  async _runLoop(userText) {
    // Inject current calculator context into the user message so the
    // model always knows what's on the stack without having to ask.
    const ctx     = this._getContext();
    const ctxNote = this._formatContext(ctx);
    const content = ctxNote ? `${ctxNote}\n\n${userText}` : userText;

    this._history.push({ role: 'user', content });

    for (let iter = 0; iter < MAX_ITER; iter++) {
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...this._history,
      ];

      // Create a streaming bubble.
      const { bubble, textEl } = this._addStreamingBubble();
      let fullText = '';

      try {
        await this._llm.generate(messages, {
          onToken: (t) => {
            // Defensive: some streamer implementations flush a final
            // empty/null token; ignore non-strings rather than appending
            // "null"/"undefined" into the bubble.
            if (typeof t !== 'string' || t.length === 0) return;
            fullText += t;
            // Hide partial tool_call markup behind a "preparing action…"
            // placeholder so the user never sees raw XML/JSON streaming
            // in.  Empty fullText still shows the spinner ellipsis.
            textEl.textContent = formatStreamingText(fullText) || '…';
          },
        });
      } catch (err) {
        if (err.message !== 'AbortError') {
          this._finaliseStreamBubble(bubble, textEl, `⚠ ${err.message}`, null);
          this._history.push({ role: 'assistant', content: fullText || err.message });
        } else {
          // Aborted: still finalise the bubble so the streaming cursor
          // and "preparing…" placeholder don't linger forever.
          this._finaliseStreamBubble(bubble, textEl, stripToolCalls(fullText), null);
          if (fullText) this._history.push({ role: 'assistant', content: fullText });
        }
        return;
      }

      const toolCall = parseToolCall(fullText);
      const cleanText = stripToolCalls(fullText);

      if (!toolCall) {
        // Final assistant turn — render markdown and finish.  If the
        // model produced no output at all (e.g. greedy decoding chose
        // EOS as its first token), surface a fallback so the user
        // always sees that the turn completed instead of an invisible
        // empty bubble.
        const display = cleanText || '_(model returned no output — try rephrasing.)_';
        this._finaliseStreamBubble(bubble, textEl, display, null);
        this._history.push({ role: 'assistant', content: fullText });
        return;
      }

      // Has a tool call — add it to history and handle it.
      this._history.push({ role: 'assistant', content: fullText });

      if (toolCall.name === 'get_stack') {
        // Non-destructive: execute automatically without confirmation.
        this._finaliseStreamBubble(bubble, textEl, cleanText, null);
        const result = this._getContext();
        this._pushToolResult({
          stack: result.stack,
          angleMode: result.angleMode,
          displayMode: result.displayMode,
          dir: result.dir,
        });
        // Loop to let the model process the result.
        continue;
      }

      if (toolCall.name === 'run') {
        // Mutating — require user confirmation.
        const code = toolCall.arguments?.text ?? '';
        this._finaliseStreamBubble(bubble, textEl, cleanText, { name: 'run', code });

        // Pause loop and wait for the user to click Confirm or Cancel.
        const confirmed = await new Promise((resolve) => {
          this._pendingConfirm = { resolve };
        });
        this._pendingConfirm = null;

        if (confirmed) {
          try {
            this._tools.run(code);
            const after = this._getContext();
            this._pushToolResult({ success: true, stack: after.stack });
          } catch (err) {
            this._pushToolResult({ error: err.message });
          }
        } else {
          this._pushToolResult({ cancelled: true });
        }
        continue;
      }

      // Unknown tool — tell the model.
      this._finaliseStreamBubble(bubble, textEl, cleanText, null);
      this._pushToolResult({ error: `Unknown tool: ${toolCall.name}` });
    }
  }

  /** Push a tool-call result into the conversation, wrapped in the
   *  exact `<tool_response>…</tool_response>` shape the system prompt
   *  promises the model.  We use `role:'user'` rather than `role:'tool'`
   *  because the small Qwen2.5-0.5B model is far more reliable when the
   *  conversation alternates user/assistant — and the explicit XML tags
   *  give it a strong textual cue that this is tool output, not a new
   *  user instruction. */
  _pushToolResult(payload) {
    this._history.push({
      role: 'user',
      content: `<tool_response>\n${JSON.stringify(payload)}\n</tool_response>`,
    });
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
      bubble.appendChild(this._buildToolCallWidget(toolCall));
    }

    this._scrollBottom();
  }

  _buildToolCallWidget({ name, code }) {
    const widget = document.createElement('div');
    widget.className = 'cb-action-widget';

    const label = document.createElement('div');
    label.className = 'cb-action-label';
    label.textContent = name === 'run' ? '▶ Suggested action:' : `Tool: ${name}`;
    widget.appendChild(label);

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
      this._pendingConfirm.resolve(true);
      confirmBtn.disabled = true;
      cancelBtn.disabled  = true;
      confirmBtn.textContent = '✓ Running…';
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'cb-btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      if (!this._pendingConfirm) return;
      this._pendingConfirm.resolve(false);
      confirmBtn.disabled = true;
      cancelBtn.disabled  = true;
      cancelBtn.textContent = '✗ Cancelled';
    });

    btnRow.appendChild(confirmBtn);
    btnRow.appendChild(cancelBtn);
    widget.appendChild(btnRow);
    return widget;
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
