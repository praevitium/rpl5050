/* =================================================================
   Command-line / entry buffer.

   Manages the string the user is typing on the LCD's bottom line and
   the state machine that decides when ENTER is implied.

   Pressing a digit, decimal point, sign, EEX, space, etc. mutates
   the buffer.  Pressing ENTER commits.  Pressing an operator key
   while the buffer is non-empty commits first, then runs the op.
   ================================================================= */

import { parseEntry } from '../rpl/parser.js';
import { lookup } from '../rpl/ops.js';
import { RPLError } from '../rpl/stack.js';
import { errorBeep } from './beep.js';
import { Name } from '../rpl/types.js';
import {
  saveVarStateForUndo, undoVarState, redoVarState,
  hasVarRedo, clearVarUndo,
} from '../rpl/state.js';

// Maximum length of the command-line history ring buffer.
// 20 is the HP50 default for CMD — a balance between "enough to scroll
// back through typical use" and "doesn't saturate the LCD menu pager"
// (20 entries = 4 soft-menu pages at 6 slots per page, with the tail
// padded).  Parameterised here so tests can reset it if needed.
const HISTORY_MAX = 20;

export class Entry {
  static HISTORY_MAX = HISTORY_MAX;

  constructor(stack, options = {}) {
    this.stack = stack;
    this.buffer = '';
    this.cursor = 0;                       // insert point within buffer
    this.error = '';                       // last error message (for LCD)
    this._listeners = new Set();
    this.onError = options.onError || ((msg) => { this.error = msg; this._emit(); });
    // Command history.  Ring buffer of committed command-line
    // entries, newest-last.  Feeds the CMD soft-menu (HIST SHIFT-L)
    // on the keyboard; capped at HISTORY_MAX entries so long runs
    // don't unbounded-grow.
    //
    // Entries are recorded by _recordHistory() only when a commit
    // actually happened (non-empty buffer, parsed successfully).  We
    // deduplicate consecutive identical commits so spamming ENTER
    // doesn't fill the buffer.
    this._history = [];
  }

  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit() { for (const fn of this._listeners) fn(this); }

  /** Append raw text at the cursor. */
  type(text) {
    this.error = '';
    this.buffer = this.buffer.slice(0, this.cursor) + text + this.buffer.slice(this.cursor);
    this.cursor += text.length;
    this._emit();
  }

  /** True when the buffer has an unclosed backtick-quote — i.e. the cursor
   *  is inside an algebraic expression.  Used to route operator keys
   *  (+, -, *, /, ^) through type() instead of execOp() so the user
   *  can actually spell out ``X^2 + 2*X + 1`` on the keypad.
   *
   *  Counts backticks literally; there's no escape syntax (parseEntry
   *  uses balanced backticks).  Odd count → we're inside a quote;
   *  even → we're outside.
   */
  isAlgebraic() {
    let count = 0;
    for (const ch of this.buffer) if (ch === '`') count++;
    return (count % 2) === 1;
  }

  /** True when the user has started composing a command line — either
   *  anything is already in the buffer, or a backtick is open.  The key
   *  dispatchers below use this to decide whether a command key types
   *  its name (editing → build text) or runs the op (stack-direct).
   *
   *  Rationale: pressing the backtick key is the canonical "start edit
   *  mode" gesture (this app's remap of the HP50 tick key) — it opens an
   *  algebraic expression that accepts operator keys as text.  This
   *  build extends the same rule to any content in the buffer so `3 5 +`
   *  (typed) builds a program
   *  fragment, and so key presses during editing never silently
   *  commit-and-execute a half-finished line. */
  isEditing() {
    return this.buffer.length > 0;
  }

  /** Operator-key dispatcher: while the user is editing a command
   *  line, type the character; otherwise execute the op.  Used by
   *  +, −, ×, ÷, yˣ and shifted operators (x², 1/x, ≠, …) so the
   *  same physical key works on the RPL stack AND inside a buffer
   *  the user is composing. */
  typeOrExec(char, opName) {
    if (this.isEditing()) this.type(char);
    else this.execOp(opName ?? char);
  }

  /** True when the buffer has non-whitespace content immediately
   *  before the cursor.  Used by the command-key dispatchers so
   *  pressing SIN/STO/etc. mid-buffer can self-insert a leading
   *  separator — otherwise `3 4+SIN` would be the literal result of
   *  typing `3 4+[SIN]` and the name would glom onto the operator. */
  _needsLeadingSpace() {
    return this.cursor > 0 && !/\s/.test(this.buffer[this.cursor - 1]);
  }

  /** Function-key dispatcher (SIN, COS, LN, SQRT, …).  Three cases:
   *    - Inside an unclosed backtick (algebraic entry): type `FN(` so the
   *      expression reads like textbook math.
   *    - Editing but outside a backtick (bare RPN): type `FN ` — a
   *      whitespace-separated token that parses to a Name reference
   *      and composes cleanly with the rest of the buffer.  If the
   *      char before the cursor isn't whitespace, prefix a space too
   *      so the name stays tokenised from whatever came before.
   *    - Empty buffer: run the op on the stack. */
  typeOrExecFn(fnName) {
    if (this.isAlgebraic()) this.type(fnName + '(');
    else if (this.isEditing()) {
      this.type((this._needsLeadingSpace() ? ' ' : '') + fnName + ' ');
    }
    else this.execOp(fnName);
  }

  /** Command-key dispatcher (STO, RCL, UNDO, EVAL, …): while editing,
   *  type the op name followed by a space so the next token sits on
   *  its own; otherwise run the op.  This is the bare-name counterpart
   *  to typeOrExecFn — commands that don't take arguments via `(...)`
   *  and so belong as whitespace-separated tokens in the buffer.  A
   *  leading space is added when the char before the cursor isn't
   *  already whitespace, for the same tokenisation reason. */
  typeOrExecName(opName) {
    if (this.isEditing()) {
      this.type((this._needsLeadingSpace() ? ' ' : '') + opName + ' ');
    }
    else this.execOp(opName);
  }

  /** Insert `text` at the cursor and position the cursor `backUp`
   *  characters from the end of the inserted text.  Example:
   *    typeWithCursor('()', 1)   inserts `()` and leaves the cursor
   *    between the two parens, matching HP50 behavior for the `( )`
   *    combo key.  `backUp = 0` is equivalent to `type(text)`. */
  typeWithCursor(text, backUp = 0) {
    this.type(text);
    if (backUp > 0) {
      this.cursor = Math.max(0, this.cursor - backUp);
      this._emit();
    }
  }

  /** Snapshot stack AND variable/directory state together so HIST
   *  SHIFT-R UNDO reverts the whole keypress — not just the stack.
   *  The var-state half ensures `'X' 5 STO [UNDO]` actually removes
   *  X from the current directory. */
  _snapForUndo() {
    this.stack.saveForUndo();
    saveVarStateForUndo();
  }

  /** Composite UNDO: pop BOTH the stack and the var-state history in
   *  lockstep.  The HIST SHIFT-R key calls this directly (bypassing
   *  execOp so the snapshot taken at the top of execOp doesn't
   *  overwrite what we're about to restore).  Throws
   *  'No undo available' when no snapshot exists; the keyboard
   *  handler turns that into a flashed status-line error.
   *
   *  Multi-level: repeated calls walk back through history one
   *  step at a time (not swap — see Stack.undo). */
  performUndo() {
    if (!this.stack.hasUndo()) throw new RPLError('No undo available');
    // Var-state first so the stack-undo event arrives AFTER the
    // var-state change — listeners that redraw both will see a
    // consistent pair.  Either half throwing keeps the rest untouched.
    undoVarState();
    this.stack.undo();
  }

  /** Composite REDO: re-apply the most recently undone step.
   *  Companion to multi-level performUndo.  Throws
   *  'No redo available' when there's nothing to redo. */
  performRedo() {
    if (!this.stack.hasRedo()) throw new RPLError('No redo available');
    if (hasVarRedo()) redoVarState();
    this.stack.redo();
  }

  /** Record a committed entry in the command-line history ring buffer.
   *  Consecutive identical entries are collapsed to one — otherwise
   *  spamming ENTER would saturate the buffer with duplicates.  Only
   *  `enter()` / `execOp()` call this on a successful commit path so
   *  failed parses don't pollute the history. */
  _recordHistory(text) {
    const s = String(text ?? '').trim();
    if (s.length === 0) return;
    // Dedup most-recent entry.
    if (this._history.length > 0 && this._history[this._history.length - 1] === s) return;
    this._history.push(s);
    if (this._history.length > Entry.HISTORY_MAX) {
      this._history.splice(0, this._history.length - Entry.HISTORY_MAX);
    }
  }

  /** Public snapshot of the command history, newest entry LAST.  The
   *  CMD soft-menu reverses this into newest-first on display.  Returned
   *  as a fresh array so callers can't mutate the internal buffer. */
  getHistory() {
    return this._history.slice();
  }

  /** Clear the command line and fill it with `text`, positioning the
   *  cursor at the end.  Used by the CMD soft-menu's slot onPress to
   *  recall a historical entry — matches HP50 CMD behavior where a
   *  recall replaces the current command line rather than inserting. */
  recall(text) {
    this.buffer = String(text ?? '');
    this.cursor = this.buffer.length;
    this.error = '';
    this._emit();
  }

  /** Move the cursor one character left.  No-op at position 0. */
  cursorLeft() {
    if (this.cursor > 0) { this.cursor--; this._emit(); }
  }

  /** Move the cursor one character right.  No-op past the end. */
  cursorRight() {
    if (this.cursor < this.buffer.length) { this.cursor++; this._emit(); }
  }

  /** Jump the cursor to the start of the buffer. */
  cursorHome() {
    if (this.cursor !== 0) { this.cursor = 0; this._emit(); }
  }

  /** Jump the cursor to the end of the buffer. */
  cursorEnd() {
    if (this.cursor !== this.buffer.length) {
      this.cursor = this.buffer.length;
      this._emit();
    }
  }

  /** Move the cursor to the same column on the previous line of a
   *  multi-line buffer.  On a single-line buffer (or the first line),
   *  no-op.  We don't clamp to cursorHome on the first line because
   *  that would conflict with the user's expectation that ▲ / ArrowUp
   *  never scrolls the stack while the editor is active. */
  cursorUp() {
    const before = this.buffer.slice(0, this.cursor);
    const nl = before.lastIndexOf('\n');
    if (nl === -1) return;                             // already on line 0
    const curCol = this.cursor - nl - 1;
    const prevStart = before.slice(0, nl).lastIndexOf('\n') + 1; // 0 if not found
    const prevLen = nl - prevStart;
    const newCol = Math.min(curCol, prevLen);
    this.cursor = prevStart + newCol;
    this._emit();
  }

  /** Move the cursor to the same column on the next line of a multi-
   *  line buffer.  On the final line (or a single-line buffer), no-op
   *  for the same reason cursorUp is a no-op on line 0. */
  cursorDown() {
    const nl = this.buffer.indexOf('\n', this.cursor);
    if (nl === -1) return;                             // already on last line
    const lineStart = this.buffer.lastIndexOf('\n', this.cursor - 1) + 1;
    const curCol = this.cursor - lineStart;
    const nextStart = nl + 1;
    const nextNl = this.buffer.indexOf('\n', nextStart);
    const nextLen = (nextNl === -1 ? this.buffer.length : nextNl) - nextStart;
    const newCol = Math.min(curCol, nextLen);
    this.cursor = nextStart + newCol;
    this._emit();
  }

  /** Backspace.  If buffer is empty, DROP from stack instead. */
  backspace() {
    this.error = '';
    if (this.buffer.length === 0) {
      // Snapshot BEFORE the DROP so HIST SHIFT-R UNDO can restore it.
      this._snapForUndo();
      try { this.stack.drop(); } catch (e) { this.flashError(e); }
      return;
    }
    if (this.cursor > 0) {
      this.buffer = this.buffer.slice(0, this.cursor - 1) + this.buffer.slice(this.cursor);
      this.cursor--;
      this._emit();
    }
  }

  /** Clear the command line entirely (CANCEL / ON). */
  cancel() {
    this.buffer = '';
    this.cursor = 0;
    this.error = '';
    this._emit();
  }

  /** Toggle sign of the current number being typed, or NEG the stack top.
   *
   *  HP50 behavior — if the current number has an exponent marker (E),
   *  +/- flips the EXPONENT's sign, not the mantissa.  Only a number
   *  without an E gets its mantissa sign flipped. */
  toggleSign() {
    this.error = '';
    if (this.buffer.length === 0) {
      this.execOp('NEG');
      return;
    }
    const t = this.buffer;

    // Find the start of the current number token (walking back from cursor).
    let i = this.cursor - 1;
    while (i >= 0 && /[0-9.eE+\-]/.test(t[i]) && !(i < this.cursor - 1 && (t[i] === '+' || t[i] === '-') && /[0-9.]/.test(t[i + 1]) === false)) i--;
    const startTok = i + 1;

    // Scan forward from startTok to locate an E (end of mantissa, start
    // of exponent).  Stops at the first non-token char so we stay inside
    // the current number.  A leading +/- at startTok is the mantissa
    // sign; an interior +/- only counts as part of the token when it's
    // immediately after an E (e.g. inside `1E-7`).
    let eIdx = -1;
    for (let k = startTok; k < t.length; k++) {
      const c = t[k];
      if (c === 'e' || c === 'E') { eIdx = k; break; }
      if (/[0-9.]/.test(c)) continue;
      if (c === '+' || c === '-') {
        if (k === startTok) continue;
        if (/[eE]/.test(t[k - 1])) continue;
      }
      break;
    }

    if (eIdx !== -1) {
      // Current number has an E — flip the exponent's sign.
      const afterE = eIdx + 1;
      const ch = t[afterE];
      if (ch === '-') {
        this.buffer = t.slice(0, afterE) + t.slice(afterE + 1);
        if (this.cursor > afterE) this.cursor -= 1;
      } else if (ch === '+') {
        this.buffer = t.slice(0, afterE) + '-' + t.slice(afterE + 1);
        // length unchanged — cursor unchanged
      } else {
        // Insert '-' right after the E.  ch may be a digit, undefined
        // (cursor parked immediately after EEX, nothing typed yet), or
        // any other non-exponent char (whitespace/operator) — treat all
        // three the same: just splice in the minus.
        this.buffer = t.slice(0, afterE) + '-' + t.slice(afterE);
        if (this.cursor >= afterE) this.cursor += 1;
      }
      this._emit();
      return;
    }

    // No exponent: flip the mantissa's leading sign.
    if (t[startTok] === '-') {
      this.buffer = t.slice(0, startTok) + t.slice(startTok + 1);
      this.cursor -= 1;
    } else if (t[startTok] === '+') {
      this.buffer = t.slice(0, startTok) + '-' + t.slice(startTok + 1);
    } else {
      this.buffer = t.slice(0, startTok) + '-' + t.slice(startTok);
      this.cursor += 1;
    }
    this._emit();
  }

  /** Insert scientific "E" marker. */
  eex() {
    if (this.buffer.length === 0) { this.type('1E'); return; }
    // If already has an E in the current token, do nothing; else append E.
    const tail = this.buffer.slice(0, this.cursor);
    const lastTok = tail.match(/[0-9.+\-eE]+$/)?.[0] ?? '';
    if (/[eE]/.test(lastTok)) return;
    this.type('E');
  }

  /** Run `body` with a stack snapshot.  If it throws, restore the
   *  snapshot so a failed op (e.g. SIN on a string → "Bad argument
   *  type") leaves the stack unchanged — HP50 behavior where a type
   *  error does NOT consume its arguments.  Also clears the undo
   *  slot on failure since the rolled-back state equals the slot.
   *
   *  Public: callers outside Entry (side-panel, soft-menu handlers in
   *  app.js) that invoke ops directly need the same rollback
   *  guarantee, otherwise a type error from e.g. the Commands panel
   *  eats the args the op had popped before throwing. */
  safeRun(body) {
    const rollback = this.stack.save();
    try { body(); }
    catch (e) {
      this.stack.restore(rollback);
      this.stack.clearUndo();
      // Also nuke the var-state UNDO slot.  Since `body()` may have
      // succeeded a variable STO/PURGE before the throw (and we
      // intentionally DON'T roll var state back — RPL side effects on
      // variables are persistent), keeping the var-undo slot would let
      // a subsequent UNDO revert to a state where the stack matches
      // the current live one but vars don't.  Clearing both keeps the
      // two halves in lock-step.
      clearVarUndo();
      this.flashError(e);
    }
  }

  /** Commit current buffer to the stack (ENTER). */
  enter() {
    this.error = '';
    const raw = this.buffer.trim();
    // Snapshot BEFORE any stack mutation so HIST SHIFT-R UNDO can
    // restore the pre-ENTER stack AND variable/directory state —
    // covers "oops, I pushed the wrong thing", "oops, I ran the
    // wrong op via a bare-name invocation", AND "oops, I just did
    // STO/PURGE/CRDIR via the entry line".
    this._snapForUndo();
    if (raw.length === 0) {
      // ENTER on empty line = DUP
      this.safeRun(() => this.stack.dup());
      return;
    }
    this.safeRun(() => {
      const values = parseEntry(raw);
      // If a *bare* (unquoted) identifier resolves to an op, run it rather
      // than pushing.  Quoted identifiers (`'+'`) are literal references
      // and always push — this is what makes `'+' 'X' STO` work.
      // Wrap each op invocation in `stack.runOp` so LAST/LASTARG
      // sees the most recently executed user-facing command's
      // argument list.
      for (const v of values) {
        if (v?.type === 'name' && !v.quoted) {
          const op = lookup(v.id);
          if (op) { this.stack.runOp(() => op.fn(this.stack, this)); continue; }
        }
        this.stack.push(v);
      }
      this._recordHistory(raw);
      this.buffer = '';
      this.cursor = 0;
      this._emit();
    });
  }

  /** Commit then run an op.  Called by operator keys. */
  execOp(name) {
    this.error = '';
    // Snapshot BEFORE any stack mutation (buffer commit OR op run)
    // so HIST SHIFT-R UNDO can revert the whole keypress — stack AND
    // variable/directory state.  One snapshot per keypress — if the
    // commit pushes N values then the op runs, both are inside the
    // same undo unit.
    this._snapForUndo();
    this.safeRun(() => {
      // commit current entry first (if any)
      if (this.buffer.trim().length > 0) {
        const raw = this.buffer.trim();
        const values = parseEntry(raw);
        for (const v of values) {
          if (v?.type === 'name' && !v.quoted) {
            const op = lookup(v.id);
            if (op) { this.stack.runOp(() => op.fn(this.stack, this)); continue; }
          }
          this.stack.push(v);
        }
        this._recordHistory(raw);
        this.buffer = '';
        this.cursor = 0;
      }
      const op = lookup(name);
      if (!op) throw new RPLError(`Undefined: ${name}`);
      this.stack.runOp(() => op.fn(this.stack, this));
    });
    this._emit();
  }

  flashError(e) {
    // Accept real Error instances AND plain { message } objects so call
    // sites can use either ergonomically.  Prior behavior ran objects
    // through String(e), producing "[object Object]" on the LCD whenever
    // a UI handler used the lighter-weight `{message: '...'}` form
    // (e.g. pressSoftKey on an empty menu).
    this.error = (e && typeof e === 'object' && e.message != null)
      ? String(e.message)
      : String(e);
    this._emit();
    errorBeep();
    // optionally auto-clear after a bit
    clearTimeout(this._errTimer);
    this._errTimer = setTimeout(() => { this.error = ''; this._emit(); }, 2500);
  }
}
