import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import {
  Real, Integer, BinaryInteger, Complex, Name, Str, Directory, Program, Tagged,
  RList, Vector, Matrix,
  isReal, isInteger, isBinaryInteger, isComplex, isDirectory, isProgram, isName,
  isString,
} from '../www/src/rpl/types.js';
import { parseEntry } from '../www/src/rpl/parser.js';
import { format, formatStackTop } from '../www/src/rpl/formatter.js';
import {
  state as calcState, setAngle, cycleAngle, toRadians, fromRadians,
  varStore, varRecall, varList, varPurge, resetHome, currentPath,
  setLastError, clearLastError, getLastError,
  goHome, goUp, goInto, makeSubdir,
  setWordsize, getWordsize, getWordsizeMask,
  setBinaryBase, getBinaryBase, resetBinaryState,
  setApproxMode,
} from '../www/src/rpl/state.js';
import { clampStackScroll, computeMenuPage } from '../www/src/ui/paging.js';
import { assert, assertThrows } from './helpers.mjs';

/* Entry mode — algebraic entry + shifted keypad ops + command-line history. */

/* ============================================================
   Algebraic entry mode

   These tests exercise the Entry layer (no DOM required).  They
   prove that:
     • isAlgebraic() tracks odd/even tick-count correctly,
     • typeOrExec() types inside `'…'` but runs the op outside,
     • typeOrExecFn() types `FN(` inside `'…'` but runs the fn outside,
     • the full "type characters → ENTER → ops on the stack" path
       produces a valid Symbolic AST that FACTOR/SOLVE/DERIV can
       then operate on.
   ============================================================ */
{
  const { Entry } = await import('../www/src/ui/entry.js');
  const { formatAlgebra } = await import('../www/src/rpl/algebra.js');
  const { isSymbolic, isList } = await import('../www/src/rpl/types.js');

  // isAlgebraic() — parity of `'` characters
  {
    const e = new Entry(new Stack());
    assert(e.isAlgebraic() === false, 'isAlgebraic empty → false');
    e.type("'"); assert(e.isAlgebraic() === true, "isAlgebraic after `'` → true");
    e.type('X'); assert(e.isAlgebraic() === true, "isAlgebraic inside `'X` → true");
    e.type("'"); assert(e.isAlgebraic() === false, "isAlgebraic after closing `'` → false");
  }

  // typeOrExec — inside `'` it types, outside it execs
  {
    const s = new Stack();
    const e = new Entry(s);
    e.type("'"); e.type('3');
    e.typeOrExec('+', '+');
    assert(e.buffer === "'3+", `typeOrExec in algebraic → buffer='${e.buffer}'`);
    assert(s.depth === 0, 'typeOrExec in algebraic → stack untouched');
  }
  {
    const s = new Stack();
    s.push(Real(3)); s.push(Real(4));
    const e = new Entry(s);
    e.typeOrExec('+', '+');
    assert(s.depth === 1 && s.peek().value === 7, 'typeOrExec outside → exec +');
  }

  // typeOrExecFn — inside `'` types `FN(`; outside runs the op
  {
    const s = new Stack();
    const e = new Entry(s);
    e.type("'"); e.type('X'); e.type('+');
    e.typeOrExecFn('SIN');
    assert(e.buffer === "'X+SIN(", `typeOrExecFn in algebraic → '${e.buffer}'`);
  }
  {
    const s = new Stack();
    s.push(Real(0));
    const e = new Entry(s);
    e.typeOrExecFn('SIN');
    assert(Math.abs(s.peek().value) < 1e-12, 'typeOrExecFn outside → exec SIN');
  }

  // Command-key keys self-insert a leading space when the char before
  // the cursor isn't whitespace — otherwise `3 4+[SIN]` would glom to
  // `3 4+SIN ` and the parser would see `+SIN` as one token.
  {
    const e = new Entry(new Stack());
    e.type('3 4+');
    e.typeOrExecFn('SIN');
    assert(e.buffer === '3 4+ SIN ',
      `typeOrExecFn inserts leading space when prev char isn't whitespace → '${e.buffer}'`);
  }
  {
    const e = new Entry(new Stack());
    e.type('3 4 ');
    e.typeOrExecFn('SIN');
    assert(e.buffer === '3 4 SIN ',
      `typeOrExecFn leaves existing trailing space alone → '${e.buffer}'`);
  }
  {
    const e = new Entry(new Stack());
    e.type('5');
    e.typeOrExecName('STO');
    assert(e.buffer === '5 STO ',
      `typeOrExecName inserts leading space when prev char isn't whitespace → '${e.buffer}'`);
  }
  {
    const e = new Entry(new Stack());
    e.type('5 ');
    e.typeOrExecName('STO');
    assert(e.buffer === '5 STO ',
      `typeOrExecName leaves existing trailing space alone → '${e.buffer}'`);
  }

  // typeWithCursor — inserts and moves cursor back
  {
    const e = new Entry(new Stack());
    e.typeWithCursor('()', 1);
    assert(e.buffer === '()' && e.cursor === 1,
      `typeWithCursor('()',1) → buffer='${e.buffer}', cursor=${e.cursor}`);
    e.type('X');
    assert(e.buffer === '(X)', `cursor-placement lets next char land inside: '${e.buffer}'`);
  }

  // Full flow: type `'X^2 + 2*X + 1'` and commit — this is exactly
  // what the on-screen keyboard now produces for the sequence:
  //   '  X  yˣ  2  SPC  +  SPC  2  ×  X  SPC  +  SPC  1  '  ENTER
  // Each operator key is routed through typeOrExec and types the
  // character because isAlgebraic() is true between the two ticks.
  {
    const s = new Stack();
    const e = new Entry(s);
    e.type("'");
    e.type('X');
    e.typeOrExec('^', '^');   // yˣ while algebraic → types `^`
    e.type('2');
    e.type(' ');
    e.typeOrExec('+', '+');   // + key while algebraic → types `+`
    e.type(' ');
    e.type('2');
    e.typeOrExec('*', '*');   // × key while algebraic → types `*`
    e.type('X');
    e.type(' ');
    e.typeOrExec('+', '+');
    e.type(' ');
    e.type('1');
    e.type("'");
    assert(e.isAlgebraic() === false, 'ticks balanced after closing quote');
    e.enter();
    assert(s.depth === 1, `after ENTER: depth=${s.depth}`);
    assert(isSymbolic(s.peek()), 'after ENTER: stack top is Symbolic');
    const f = formatAlgebra(s.peek().expr);
    // Parser output may or may not inline juxtaposition — accept both shapes.
    assert(f === 'X^2 + 2*X + 1' || f === 'X^2 + 2X + 1',
      `parsed symbolic = '${f}'`);
  }

  // And then FACTOR runs cleanly on that Symbolic. FACTOR routes to
  // Giac in Node via the MockGiacEngine; register a fixture so caseval
  // returns what real Giac returns for this input. No fallback path.
  {
    const { giac } = await import('../www/src/rpl/cas/giac-engine.mjs');
    giac._clear();
    giac._setFixture('factor(X^2+2*X+1)', '(X+1)^2');
    const s = new Stack();
    const e = new Entry(s);
    for (const ch of "'X^2 + 2*X + 1'") {
      if ('+-*/^'.includes(ch)) e.typeOrExec(ch, ch);
      else e.type(ch);
    }
    e.enter();
    lookup('FACTOR').fn(s);
    const f = formatAlgebra(s.peek().expr);
    assert(f === '(X + 1)^2', `FACTOR('X^2 + 2*X + 1') = '${f}'`);
    giac._clear();
  }

  // SOLVE flow: `'X^2 - 4' 'X' SOLVE` typed as chars ending with SOLVE
  // reached via bare-name lookup on ENTER commit.
  {
    const s = new Stack();
    const e = new Entry(s);
    for (const ch of "'X^2 - 4' 'X' SOLVE") {
      if ('+-*/^'.includes(ch) && e.isAlgebraic()) e.typeOrExec(ch, ch);
      else e.type(ch);
    }
    e.enter();
    assert(s.depth === 1 && isList(s.peek()), `SOLVE result type: depth=${s.depth}`);
    const roots = s.peek().items.map(r => formatAlgebra(r.expr));
    roots.sort();
    assert(JSON.stringify(roots) === JSON.stringify(['X = -2', 'X = 2']),
      `SOLVE roots = ${JSON.stringify(roots)}`);
  }

  // DERIV flow: `'SIN(X^2)' 'X' DERIV`
  {
    const s = new Stack();
    const e = new Entry(s);
    for (const ch of "'SIN(X^2)' 'X' DERIV") {
      if ('+-*/^'.includes(ch) && e.isAlgebraic()) e.typeOrExec(ch, ch);
      else e.type(ch);
    }
    e.enter();
    assert(s.depth === 1 && isSymbolic(s.peek()),
      `DERIV result type: depth=${s.depth}, symbolic=${isSymbolic(s.peek())}`);
    const d = formatAlgebra(s.peek().expr);
    // chain rule: d/dX[SIN(X^2)] = COS(X^2)*2*X  (simplify may reorder)
    assert(d.includes('COS(X^2)') && (d.includes('2*X') || d.includes('2X')),
      `DERIV(SIN(X^2),X) = '${d}'`);
  }

  // Virtual button simulation: call the shifted action for − key (parens)
  // and verify cursor lands inside the parens.
  {
    const e = new Entry(new Stack());
    e.type("'");
    // Simulate − shiftL action: typeWithCursor('()', 1)
    e.typeWithCursor('()', 1);
    e.type('X');
    e.type('+');
    e.type('1');
    assert(e.buffer === "'(X+1)", `nested-paren entry sequence: '${e.buffer}'`);
  }

  // Regression: NON-algebraic use of + / × / yˣ still runs the op
  // on the RPL stack.  This matters because virtually every RPN test
  // in the suite above relies on `exec('+')` behavior — the new
  // typeExec must not regress that path.
  {
    const s = new Stack();
    s.push(Real(2)); s.push(Real(5));
    const e = new Entry(s);
    e.typeOrExec('+', '+');
    assert(s.depth === 1 && s.peek().value === 7, 'non-algebraic + still exec');
  }
}

/* ============================================================
   Shifted-key ops (hyperbolics, XROOT, complex helpers, GCD/LCM,
   and CLEAR/DEL smoke tests).

   Covers SINH/COSH/TANH, XROOT, ARG/CONJ/RE/IM, GCD/LCM, plus
   Entry.cancel() clearing a buffer the way the SHIFT-L + ⌫ (DEL)
   key binding expects.
   ============================================================ */
{
  const { Entry } = await import('../www/src/ui/entry.js');

  // ----- hyperbolic ops -----
  {
    const s = new Stack(); s.push(Real(0));
    lookup('SINH').fn(s, null);
    assert(Math.abs(s.peek().value - 0) < 1e-12, 'SINH(0) = 0');
  }
  {
    const s = new Stack(); s.push(Real(0));
    lookup('COSH').fn(s, null);
    assert(Math.abs(s.peek().value - 1) < 1e-12, 'COSH(0) = 1');
  }
  {
    const s = new Stack(); s.push(Real(1));
    lookup('TANH').fn(s, null);
    assert(Math.abs(s.peek().value - Math.tanh(1)) < 1e-12,
      `TANH(1) = ${s.peek().value}`);
  }
  {
    const s = new Stack(); s.push(Real(Math.sinh(2)));
    lookup('ASINH').fn(s, null);
    assert(Math.abs(s.peek().value - 2) < 1e-12,
      `ASINH(SINH(2)) = 2, got ${s.peek().value}`);
  }
  {
    const s = new Stack(); s.push(Real(Math.cosh(3)));
    lookup('ACOSH').fn(s, null);
    assert(Math.abs(s.peek().value - 3) < 1e-12,
      `ACOSH(COSH(3)) = 3`);
  }
  {
    // ACOSH of x < 1 lifts to Complex (principal branch) rather than
    // throwing — matches HP50 complex-mode behavior.
    // acosh(0.5) = i * π/3 ≈ 0 + 1.04719755i.
    const s = new Stack(); s.push(Real(0.5));
    lookup('ACOSH').fn(s, null);
    const v = s.peek();
    assert(isComplex(v) && Math.abs(v.re) < 1e-10 && Math.abs(v.im - Math.PI/3) < 1e-10,
      'session045: ACOSH(0.5) → (0, π/3)');
  }
  {
    const s = new Stack(); s.push(Real(0.5));
    lookup('ATANH').fn(s, null);
    assert(Math.abs(s.peek().value - Math.atanh(0.5)) < 1e-12,
      `ATANH(0.5) = atanh(0.5)`);
  }
  {
    // ATANH of out-of-domain
    const s = new Stack(); s.push(Real(1));
    assertThrows(() => lookup('ATANH').fn(s, null), null,
      'ATANH(1) throws (domain |x| < 1)');
  }

  // ----- XROOT (two-arg, y x → y^(1/x)) -----
  {
    const s = new Stack(); s.push(Real(8)); s.push(Real(3));
    lookup('XROOT').fn(s, null);
    assert(Math.abs(s.peek().value - 2) < 1e-12,
      `8 XROOT 3 → 2, got ${s.peek().value}`);
  }
  {
    const s = new Stack(); s.push(Real(16)); s.push(Real(4));
    lookup('XROOT').fn(s, null);
    assert(Math.abs(s.peek().value - 2) < 1e-12,
      `16 XROOT 4 → 2`);
  }
  {
    // XROOT by 0 should throw
    const s = new Stack(); s.push(Real(5)); s.push(Real(0));
    assertThrows(() => lookup('XROOT').fn(s, null), null,
      'XROOT by 0 throws');
  }

  // ----- ARG / CONJ / RE / IM -----
  {
    // ARG on Real: nonneg → 0, neg → π (in current angle mode)
    setAngle('RAD');
    const s = new Stack(); s.push(Real(5));
    lookup('ARG').fn(s, null);
    assert(Math.abs(s.peek().value - 0) < 1e-12, 'ARG(5) = 0');
  }
  {
    setAngle('RAD');
    const s = new Stack(); s.push(Real(-3));
    lookup('ARG').fn(s, null);
    assert(Math.abs(s.peek().value - Math.PI) < 1e-12,
      'ARG(-3) = π in RAD mode');
  }
  {
    setAngle('DEG');
    const s = new Stack(); s.push(Real(-1));
    lookup('ARG').fn(s, null);
    assert(Math.abs(s.peek().value - 180) < 1e-12,
      'ARG(-1) = 180 in DEG mode');
    setAngle('RAD');
  }
  {
    // ARG on Complex
    setAngle('RAD');
    const s = new Stack();
    s.push({ type: 'complex', re: 1, im: 1 });
    lookup('ARG').fn(s, null);
    assert(Math.abs(s.peek().value - Math.PI / 4) < 1e-12,
      'ARG(1+i) = π/4');
  }
  {
    // CONJ on Complex
    const s = new Stack();
    s.push({ type: 'complex', re: 3, im: -4 });
    lookup('CONJ').fn(s, null);
    const v = s.peek();
    assert(v.type === 'complex' && v.re === 3 && v.im === 4,
      `CONJ(3-4i) = 3+4i, got ${v.re}+${v.im}i`);
  }
  {
    // CONJ on Real → identity
    const s = new Stack(); s.push(Real(7));
    lookup('CONJ').fn(s, null);
    assert(s.peek().value === 7, 'CONJ(7) = 7');
  }
  {
    const s = new Stack();
    s.push({ type: 'complex', re: 3, im: -4 });
    lookup('RE').fn(s, null);
    assert(s.peek().value === 3, 'RE(3-4i) = 3');
  }
  {
    const s = new Stack();
    s.push({ type: 'complex', re: 3, im: -4 });
    lookup('IM').fn(s, null);
    assert(s.peek().value === -4, 'IM(3-4i) = -4');
  }
  {
    // IM on Real → 0
    const s = new Stack(); s.push(Real(9));
    lookup('IM').fn(s, null);
    assert(s.peek().value === 0, 'IM(9) = 0');
  }

  // ----- GCD / LCM on integers -----
  {
    const s = new Stack();
    s.push({ type: 'integer', value: 12n });
    s.push({ type: 'integer', value: 18n });
    lookup('GCD').fn(s, null);
    assert(s.peek().value === 6n, `GCD(12,18) = 6, got ${s.peek().value}`);
  }
  {
    const s = new Stack();
    s.push({ type: 'integer', value: 0n });
    s.push({ type: 'integer', value: 7n });
    lookup('GCD').fn(s, null);
    assert(s.peek().value === 7n, 'GCD(0,7) = 7');
  }
  {
    const s = new Stack();
    s.push({ type: 'integer', value: -15n });
    s.push({ type: 'integer', value: 10n });
    lookup('GCD').fn(s, null);
    assert(s.peek().value === 5n, 'GCD(-15,10) = 5 (absolute)');
  }
  {
    const s = new Stack();
    s.push({ type: 'integer', value: 4n });
    s.push({ type: 'integer', value: 6n });
    lookup('LCM').fn(s, null);
    assert(s.peek().value === 12n, `LCM(4,6) = 12, got ${s.peek().value}`);
  }
  {
    const s = new Stack();
    s.push({ type: 'integer', value: 0n });
    s.push({ type: 'integer', value: 5n });
    lookup('LCM').fn(s, null);
    assert(s.peek().value === 0n, 'LCM(0,5) = 0');
  }
  {
    // GCD on non-integer Real should throw
    const s = new Stack(); s.push(Real(1.5)); s.push(Real(3));
    assertThrows(() => lookup('GCD').fn(s, null), null,
      'GCD(1.5, 3) throws');
  }

  // ----- DEL: Entry.cancel() clears an in-progress buffer -----
  // The SHIFT-L + ⌫ (DEL) key is wired to Entry.cancel in keyboard.js.
  {
    const e = new Entry(new Stack());
    e.type('1'); e.type('2'); e.type('3');
    e.cancel();
    assert(e.buffer === '' && e.cursor === 0,
      `DEL clears buffer → '${e.buffer}' cursor=${e.cursor}`);
  }

  // ----- CLEAR: register('CLEAR') wipes the stack -----
  {
    const s = new Stack();
    s.push(Real(1)); s.push(Real(2)); s.push(Real(3));
    lookup('CLEAR').fn(s, null);
    assert(s.depth === 0, `CLEAR empties stack, depth=${s.depth}`);
  }
}


// --- Entry command-line history ------------------------------------
// Ring buffer of committed entry buffers.  Feeds the HIST SHIFT-L CMD
// soft-menu so the user can recall prior command lines.  Recording
// only happens on a *successful* parse+commit; failed commits don't
// pollute history; consecutive duplicates collapse to one.
{
  const { Entry } = await import('../www/src/ui/entry.js');
  const { Stack } = await import('../www/src/rpl/stack.js');

  // ---- ENTER records the committed text ----
  {
    resetHome();
    const s = new Stack();
    const e = new Entry(s);
    e.type('1 2 +');
    e.enter();
    const h = e.getHistory();
    assert(h.length === 1 && h[0] === '1 2 +',
      `ENTER records '1 2 +' to history — got ${JSON.stringify(h)}`);
  }

  // ---- Empty-line ENTER (= DUP) does NOT record ----
  {
    resetHome();
    const s = new Stack();
    s.push(Real(5));
    const e = new Entry(s);
    e.enter();                 // DUP, no text to record
    assert(e.getHistory().length === 0,
      'empty ENTER (DUP) does not record history');
  }

  // ---- Consecutive duplicates collapse ----
  {
    resetHome();
    const s = new Stack();
    const e = new Entry(s);
    e.type('7'); e.enter();
    e.type('7'); e.enter();
    e.type('7'); e.enter();
    const h = e.getHistory();
    assert(h.length === 1 && h[0] === '7',
      `consecutive dup entries collapse — got ${JSON.stringify(h)}`);
  }

  // ---- Non-duplicates keep order (oldest first in storage) ----
  {
    resetHome();
    const s = new Stack();
    const e = new Entry(s);
    e.type('1'); e.enter();
    e.type('2'); e.enter();
    e.type('3'); e.enter();
    const h = e.getHistory();
    assert(h.length === 3 && h[0] === '1' && h[2] === '3',
      `history preserves order oldest→newest — got ${JSON.stringify(h)}`);
  }

  // ---- Ring buffer caps at HISTORY_MAX ----
  {
    resetHome();
    const s = new Stack();
    const e = new Entry(s);
    for (let i = 0; i < Entry.HISTORY_MAX + 5; i++) {
      e.type(String(i)); e.enter();
    }
    const h = e.getHistory();
    assert(h.length === Entry.HISTORY_MAX,
      `ring buffer caps at HISTORY_MAX=${Entry.HISTORY_MAX} — got ${h.length}`);
    // Oldest entries are dropped — first surviving entry should be i=5.
    assert(h[0] === '5',
      `oldest entries drop off — first surviving is '${h[0]}', expected '5'`);
  }

  // ---- execOp commit-path also records ----
  {
    resetHome();
    const s = new Stack();
    s.push(Real(3));
    const e = new Entry(s);
    e.type('4');              // non-empty buffer
    e.execOp('+');            // commits '4', then runs +
    const h = e.getHistory();
    assert(h.includes('4'),
      `execOp commit path records pre-op buffer — got ${JSON.stringify(h)}`);
  }

  // ---- Failed parse does NOT record ----
  {
    // Malformed binary integer still throws at parse time (unlike
    // unterminated-string, which auto-closes now).  What we care about
    // here is that the safeRun error path doesn't record.
    resetHome();
    const s = new Stack();
    const e = new Entry(s);
    e.type('#Xh');            // bad hex digit → Malformed binary integer
    e.enter();                // safeRun catches parse error
    const h = e.getHistory();
    assert(h.length === 0,
      `failed commit does not record — got ${JSON.stringify(h)}`);
  }

  // ---- recall() replaces buffer and repositions cursor ----
  {
    resetHome();
    const s = new Stack();
    const e = new Entry(s);
    e.type('abc');
    e.recall('HELLO WORLD');
    assert(e.buffer === 'HELLO WORLD',
      `recall replaces buffer — got '${e.buffer}'`);
    assert(e.cursor === 'HELLO WORLD'.length,
      `recall positions cursor at end — got ${e.cursor}`);
  }

  // ---- getHistory() returns a defensive copy ----
  {
    resetHome();
    const s = new Stack();
    const e = new Entry(s);
    e.type('x'); e.enter();
    const h = e.getHistory();
    h.push('EVIL');
    assert(e.getHistory().length === 1,
      'external mutation of getHistory result does not affect internal history');
  }
}

/* ================================================================
   +/- (CHS / toggleSign) respects exponent

   When the current number has an E (scientific notation), +/- flips
   the exponent's sign, not the mantissa's.  HP50 behavior.
   ================================================================ */
{
  const { Entry } = await import('../www/src/ui/entry.js');

  // Helper: new Entry with a given typed buffer and cursor at the end.
  const mk = (src) => {
    const e = new Entry(new Stack());
    e.type(src);
    return e;
  };

  // ---- 1E7 → 1E-7 (not -1E7) ----
  {
    const e = mk('1E7');
    e.toggleSign();
    assert(e.buffer === '1E-7',
      `1E7 +/- → 1E-7 (flips exponent sign, not mantissa), got "${e.buffer}"`);
    assert(e.cursor === e.buffer.length,
      '1E7 +/- leaves cursor at end of buffer');
  }

  // ---- 1E-7 → 1E7 (second press removes the minus) ----
  {
    const e = mk('1E-7');
    e.toggleSign();
    assert(e.buffer === '1E7', `1E-7 +/- → 1E7, got "${e.buffer}"`);
  }

  // ---- 1E+7 → 1E-7 (flip explicit +) ----
  {
    const e = mk('1E+7');
    e.toggleSign();
    assert(e.buffer === '1E-7', `1E+7 +/- → 1E-7, got "${e.buffer}"`);
    assert(e.buffer.length === 4,
      'flipping + to - keeps buffer length unchanged');
  }

  // ---- Round-trip: two +/- presses return to original ----
  {
    const e = mk('1E7');
    e.toggleSign();
    e.toggleSign();
    assert(e.buffer === '1E7',
      `1E7 +/- +/- → 1E7 (round-trip), got "${e.buffer}"`);
  }

  // ---- Multi-digit mantissa + exponent ----
  {
    const e = mk('1.5E2');
    e.toggleSign();
    assert(e.buffer === '1.5E-2', `1.5E2 +/- → 1.5E-2, got "${e.buffer}"`);
  }

  // ---- Negative mantissa with positive exponent: flip only exponent ----
  {
    const e = mk('-1.5E2');
    e.toggleSign();
    assert(e.buffer === '-1.5E-2',
      `-1.5E2 +/- → -1.5E-2 (mantissa sign preserved), got "${e.buffer}"`);
  }

  // ---- Lowercase e also counts as exponent marker ----
  {
    const e = mk('2e3');
    e.toggleSign();
    assert(e.buffer === '2e-3', `2e3 +/- → 2e-3, got "${e.buffer}"`);
  }

  // ---- No exponent: still flips mantissa (regression protection) ----
  {
    const e = mk('1.5');
    e.toggleSign();
    assert(e.buffer === '-1.5', `1.5 +/- → -1.5, got "${e.buffer}"`);
    e.toggleSign();
    assert(e.buffer === '1.5', `-1.5 +/- → 1.5, got "${e.buffer}"`);
  }

  // ---- Empty buffer: NEGs the stack top (existing dispatch) ----
  {
    const s = new Stack();
    s.push(Real(7));
    const e = new Entry(s);
    e.toggleSign();
    assert(s.depth === 1 && isReal(s.peek(1)) && s.peek(1).value === -7,
      'empty buffer: +/- NEGs the stack top');
  }

  // ---- Trailing E with no exponent digits yet (just after EEX) ----
  {
    const e = mk('123E');
    e.toggleSign();
    assert(e.buffer === '123E-',
      `123E +/- inserts a - after E for the yet-to-be-typed exponent, got "${e.buffer}"`);
    assert(e.cursor === e.buffer.length,
      'cursor advances past the inserted - so next digit typed appends to exponent');
  }
}

// ------------------------------------------------------------------
// LAST / LASTARG via the Entry layer end-to-end — verifies the runOp
// wiring in entry.js captures consumed args when ops are driven
// through the user-facing execOp / enter paths.
// ------------------------------------------------------------------
{
  const { Entry } = await import('../www/src/ui/entry.js');
  // Helper: Integer holds BigInt, Real holds JS Number.  Parser emits
  // Integer for bare digit literals in EXACT mode.  Compare as Number.
  const val = (v) => Number(v.value);
  // `3 4 +` via the command line, then LASTARG as a subsequent entry.
  {
    const s = new Stack();
    const e = new Entry(s);
    e.type('3 4 +');
    e.enter();
    assert(s.depth === 1 && val(s.peek()) === 7,
      'session046(entry): 3 4 + via entry → 7');
    e.type('LASTARG');
    e.enter();
    assert(s.depth === 3 && val(s.peek(2)) === 3 && val(s.peek(1)) === 4,
      'session046(entry): LASTARG via entry pushes 3 4');
  }
  // execOp path: type `5` then press an operator key bound via execOp.
  {
    const s = new Stack();
    const e = new Entry(s);
    s.push(Real(12));
    e.type('3');
    e.execOp('*');                       // commits `3`, then multiplies
    assert(s.depth === 1 && val(s.peek()) === 36,
      'session046(entry): 12 on stack, type 3, press *, → 36');
    // Now push LASTARG via execOp.  execOp calls runOp for LASTARG
    // itself — since LASTARG consumes nothing, that runOp records an
    // empty _lastArgs after the push.  But the args pushed are what
    // `*` consumed 12 and 3 above.
    e.execOp('LASTARG');
    assert(s.depth === 3,
      'session046(entry): LASTARG via execOp pushes 2 args');
    assert(val(s.peek(2)) === 12 && val(s.peek(1)) === 3,
      'session046(entry): args restored (12, 3) after execOp(*) LASTARG');
  }
  // Chained LASTARG through the entry path: LASTARG is idempotent
  // per HP50 semantics — pressing it N times pushes the same arg set
  // N times, because ops that only grow the stack (LASTARG itself,
  // DUP, OVER, DEPTH, …) no longer clobber the _lastArgs slot.
  {
    const s = new Stack();
    const e = new Entry(s);
    e.type('10 20 +');
    e.enter();
    e.type('LASTARG');
    e.enter();
    // First LASTARG pushed [10, 20]; the _lastArgs slot still holds
    // the `+` op's args, so a second press pushes the same pair again.
    e.type('LASTARG');
    e.enter();
    assert(s.depth === 5,
      'session046(entry): two LASTARG presses push the args twice');
    assert(val(s.peek(5)) === 30 && val(s.peek(4)) === 10 && val(s.peek(3)) === 20
        && val(s.peek(2)) === 10 && val(s.peek(1)) === 20,
      'session046(entry): args repeated across chained LASTARG');
  }
}

// --- Cleanup shared state so later tests don't see stray bindings
resetHome();
setAngle('RAD');
resetBinaryState();

