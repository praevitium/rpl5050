import { Stack } from '../src/rpl/stack.js';
import { lookup } from '../src/rpl/ops.js';
import {
  Real, Integer, BinaryInteger, Complex, Name, Str, Directory, Program, Tagged,
  RList, Vector, Matrix,
  isReal, isInteger, isBinaryInteger, isComplex, isDirectory, isProgram, isName,
  isString,
} from '../src/rpl/types.js';
import { parseEntry } from '../src/rpl/parser.js';
import { format, formatStackTop } from '../src/rpl/formatter.js';
import {
  state as calcState, setAngle, cycleAngle, toRadians, fromRadians,
  varStore, varRecall, varList, varPurge, resetHome, currentPath,
  setLastError, clearLastError, getLastError,
  goHome, goUp, goInto, makeSubdir,
  setWordsize, getWordsize, getWordsizeMask,
  setBinaryBase, getBinaryBase, resetBinaryState,
  setApproxMode,
} from '../src/rpl/state.js';
import { clampStackScroll, computeMenuPage } from '../src/ui/paging.js';
import { assert } from './helpers.mjs';

/* Reflection ops — TYPE, OBJ→. */

  // ---- TYPE ----
  {
    const s = new Stack();
    s.push(Real(3.14));
    lookup('TYPE').fn(s);
    assert(isReal(s.peek()) && s.peek().value === 0, 'TYPE Real → 0');
  }
  {
    const s = new Stack();
    s.push(Complex(1, 2));
    lookup('TYPE').fn(s);
    assert(s.peek().value === 1, 'TYPE Complex → 1');
  }
  {
    const s = new Stack();
    s.push(Str('hi'));
    lookup('TYPE').fn(s);
    assert(s.peek().value === 2, 'TYPE String → 2');
  }
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    lookup('TYPE').fn(s);
    assert(s.peek().value === 3, 'TYPE real Vector → 3');
  }
  {
    const s = new Stack();
    s.push(Vector([Real(1), Complex(0, 1)]));
    lookup('TYPE').fn(s);
    assert(s.peek().value === 4, 'TYPE complex Vector → 4');
  }
  {
    const s = new Stack();
    s.push(RList([Real(1)]));
    lookup('TYPE').fn(s);
    assert(s.peek().value === 5, 'TYPE List → 5');
  }
  {
    const s = new Stack();
    s.push(Name('X'));
    lookup('TYPE').fn(s);
    assert(s.peek().value === 6, 'TYPE Name → 6');
  }
  {
    const s = new Stack();
    s.push(Program([Real(1)]));
    lookup('TYPE').fn(s);
    assert(s.peek().value === 8, 'TYPE Program → 8');
  }
  {
    const s = new Stack();
    s.push(BinaryInteger(15n, 'h'));
    lookup('TYPE').fn(s);
    assert(s.peek().value === 10, 'TYPE BinaryInteger → 10');
  }
  {
    const s = new Stack();
    s.push(Tagged('lbl', Real(1)));
    lookup('TYPE').fn(s);
    assert(s.peek().value === 12, 'TYPE Tagged → 12');
  }
  {
    const s = new Stack();
    s.push(Integer(42));
    lookup('TYPE').fn(s);
    assert(s.peek().value === 28, 'TYPE Integer (ZINT) → 28');
  }

  // ---- OBJ→ ----
  {
    const s = new Stack();
    s.push(Complex(3, 4));
    lookup('OBJ→').fn(s);
    assert(s.depth === 2 && isReal(s.peek(1)) && s.peek(1).value === 4
        && isReal(s.peek(2)) && s.peek(2).value === 3,
      'OBJ→ Complex(3,4) → 3 4');
  }
  {
    const s = new Stack();
    s.push(Tagged('lbl', Real(7)));
    lookup('OBJ→').fn(s);
    assert(s.depth === 2 && isString(s.peek(1)) && s.peek(1).value === 'lbl'
        && isReal(s.peek(2)) && s.peek(2).value === 7,
      'OBJ→ :lbl:7 → 7 "lbl"');
  }
  {
    const s = new Stack();
    s.push(RList([Real(10), Real(20), Real(30)]));
    lookup('OBJ→').fn(s);
    assert(s.depth === 4
        && isInteger(s.peek(1)) && s.peek(1).value === 3n
        && isReal(s.peek(2)) && s.peek(2).value === 30
        && isReal(s.peek(4)) && s.peek(4).value === 10,
      'OBJ→ { 10 20 30 } → 10 20 30 3');
  }
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2), Real(3)]));
    lookup('OBJ→').fn(s);
    // Vector OBJ→ leaves a { size } marker, not a bare count, so the
    // data can be reassembled with →ARRY later.
    assert(s.depth === 4
        && s.peek(1).type === 'list' && s.peek(1).items[0].value === 3
        && isReal(s.peek(2)) && s.peek(2).value === 3,
      'OBJ→ [1 2 3] → 1 2 3 { 3 }');
  }
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    lookup('OBJ→').fn(s);
    assert(s.depth === 5
        && s.peek(1).type === 'list'
        && s.peek(1).items[0].value === 2 && s.peek(1).items[1].value === 2
        && isReal(s.peek(2)) && s.peek(2).value === 4
        && isReal(s.peek(5)) && s.peek(5).value === 1,
      'OBJ→ [[1 2][3 4]] → 1 2 3 4 { 2 2 }');
  }
  {
    const s = new Stack();
    s.push(Str('1 2 +'));
    lookup('OBJ→').fn(s);
    // Parsed as three values: Integer(1), Integer(2), Name('+')
    assert(s.depth === 3, 'OBJ→ "1 2 +" parses 3 tokens');
  }
  {
    const s = new Stack();
    s.push(Real(3.14));
    lookup('OBJ→').fn(s);
    // Real OBJ→ → mantissa, exponent.  3.14 → 3.14, 0.
    assert(s.depth === 2
        && isInteger(s.peek(1)) && s.peek(1).value === 0n
        && isReal(s.peek(2)) && Math.abs(s.peek(2).value - 3.14) < 1e-12,
      'OBJ→ 3.14 → 3.14 0');
  }
  {
    const s = new Stack();
    s.push(Real(1500));
    lookup('OBJ→').fn(s);
    assert(s.depth === 2
        && isInteger(s.peek(1)) && s.peek(1).value === 3n
        && isReal(s.peek(2)) && Math.abs(s.peek(2).value - 1.5) < 1e-12,
      'OBJ→ 1500 → 1.5 3');
  }
  {
    // ASCII alias OBJ-> produces the same result
    const s = new Stack();
    s.push(RList([Real(9)]));
    lookup('OBJ->').fn(s);
    assert(s.depth === 2
        && isInteger(s.peek(1)) && s.peek(1).value === 1n,
      'ASCII alias OBJ-> behaves the same as OBJ→');
  }

/* ================================================================
   Session 040 — →ARRY / ARRY→ (array compose / decompose).
   ================================================================ */

/* ---- →ARRY: bare count → Vector ---- */
{
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2)); s.push(Real(3));
  s.push(Real(3));
  lookup('→ARRY').fn(s);
  assert(s.depth === 1, '→ARRY consumed n + n elements');
  const v = s.peek(1);
  assert(v.type === 'vector' && v.items.length === 3,
    '→ARRY 1 2 3 3 → Vector of 3 items');
  assert(v.items[0].value === 1 && v.items[2].value === 3,
    '→ARRY preserves element order');
}
/* ---- →ARRY: {n} list → Vector ---- */
{
  const s = new Stack();
  s.push(Real(10)); s.push(Real(20));
  s.push(RList([Real(2)]));
  lookup('→ARRY').fn(s);
  const v = s.peek(1);
  assert(v.type === 'vector' && v.items.length === 2
      && v.items[0].value === 10 && v.items[1].value === 20,
    '→ARRY with {2} size-list → Vector[10 20]');
}
/* ---- →ARRY: {m n} list → Matrix (row-major) ---- */
{
  const s = new Stack();
  for (let i = 1; i <= 6; i++) s.push(Real(i));
  s.push(RList([Real(2), Real(3)]));
  lookup('→ARRY').fn(s);
  assert(s.depth === 1 && s.peek(1).type === 'matrix',
    '→ARRY with {2 3} builds a 2×3 Matrix');
  const m = s.peek(1);
  assert(m.rows.length === 2 && m.rows[0].length === 3,
    '→ARRY shape is 2 rows × 3 cols');
  assert(m.rows[0][0].value === 1 && m.rows[0][2].value === 3
      && m.rows[1][0].value === 4 && m.rows[1][2].value === 6,
    '→ARRY matrix elements row-major: [[1 2 3][4 5 6]]');
}
/* ---- ASCII alias ->ARRY ---- */
{
  const s = new Stack();
  s.push(Real(7)); s.push(Real(8));
  s.push(Real(2));
  lookup('->ARRY').fn(s);
  assert(s.peek(1).type === 'vector' && s.peek(1).items.length === 2,
    'ASCII alias ->ARRY behaves the same as →ARRY');
}
/* ---- →ARRY error: bad dim spec ---- */
{
  const s = new Stack();
  s.push(Real(1));
  s.push(Str('oops'));
  try { lookup('→ARRY').fn(s); assert(false, 'should throw'); }
  catch (e) { assert(/Bad argument type/i.test(e.message),
    '→ARRY with String dim-spec → Bad argument type'); }
}
{
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2));
  s.push(RList([Real(1), Real(2), Real(3)]));
  try { lookup('→ARRY').fn(s); assert(false, 'should throw'); }
  catch (e) { assert(/Bad argument value/i.test(e.message),
    '→ARRY with 3-element size list → Bad argument value'); }
}

/* ---- ARRY→: Vector decompose ---- */
{
  const s = new Stack();
  s.push(Vector([Real(11), Real(22), Real(33)]));
  lookup('ARRY→').fn(s);
  assert(s.depth === 4, 'ARRY→ on Vector[3] → 3 elements + size-list');
  const size = s.peek(1);
  assert(size.type === 'list' && size.items.length === 1
      && size.items[0].value === 3,
    'ARRY→ pushes {3} as size spec');
  assert(s.peek(2).value === 33 && s.peek(4).value === 11,
    'ARRY→ Vector elements in HP50 order (L2=last, L4=first)');
}
/* ---- ARRY→: Matrix decompose ---- */
{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
  lookup('ARRY→').fn(s);
  assert(s.depth === 5, 'ARRY→ on 2×2 Matrix → 4 elements + size-list');
  const size = s.peek(1);
  assert(size.type === 'list' && size.items.length === 2
      && size.items[0].value === 2 && size.items[1].value === 2,
    'ARRY→ on Matrix pushes {2 2} size spec');
  assert(s.peek(2).value === 4 && s.peek(5).value === 1,
    'ARRY→ on Matrix: elements in row-major order, L2=last, L5=first');
}
/* ---- ARRY→ round-trip with →ARRY ---- */
{
  const s = new Stack();
  s.push(Vector([Real(1), Real(2), Real(3), Real(4)]));
  lookup('ARRY→').fn(s);
  lookup('→ARRY').fn(s);
  const round = s.peek(1);
  assert(round.type === 'vector' && round.items.length === 4
      && round.items[0].value === 1 && round.items[3].value === 4,
    'ARRY→ then →ARRY round-trips a Vector');
}
{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2), Real(3)], [Real(4), Real(5), Real(6)]]));
  lookup('ARRY→').fn(s);
  lookup('→ARRY').fn(s);
  const round = s.peek(1);
  assert(round.type === 'matrix'
      && round.rows.length === 2 && round.rows[0].length === 3
      && round.rows[0][0].value === 1 && round.rows[1][2].value === 6,
    'ARRY→ then →ARRY round-trips a Matrix (row-major preserved)');
}
/* ---- ASCII alias ARRY-> ---- */
{
  const s = new Stack();
  s.push(Vector([Real(9)]));
  lookup('ARRY->').fn(s);
  assert(s.depth === 2
      && s.peek(1).type === 'list' && s.peek(1).items[0].value === 1,
    'ASCII alias ARRY-> behaves the same as ARRY→');
}
/* ---- ARRY→ on a non-array ---- */
{
  const s = new Stack();
  s.push(Real(3));
  try { lookup('ARRY→').fn(s); assert(false, 'should throw'); }
  catch (e) { assert(/Bad argument type/i.test(e.message),
    'ARRY→ on Real → Bad argument type'); }
}

/* ================================================================
   Session 042 — V→ / →V2 / →V3 (simple vector compose/decompose).

   →V2 ( x y    → [ x y ]    )
   →V3 ( x y z  → [ x y z ]  )
   V→  ( [x1…xn] → x1 … xn   )   decompose WITHOUT pushing a size list
   ================================================================ */

/* ---- →V2 ---- */
{
  const s = new Stack();
  s.push(Real(3));
  s.push(Real(4));
  lookup('→V2').fn(s);
  const v = s.peek(1);
  assert(v.type === 'vector' && v.items.length === 2
      && v.items[0].value === 3 && v.items[1].value === 4,
    '→V2 3 4 → [3 4]');
}
{
  // ASCII alias
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2));
  lookup('->V2').fn(s);
  assert(s.peek(1).type === 'vector' && s.peek(1).items.length === 2,
    'ASCII alias ->V2 works like →V2');
}
{
  // Stack underflow
  const s = new Stack();
  s.push(Real(1));
  try { lookup('→V2').fn(s); assert(false, '→V2 with 1 arg should throw'); }
  catch (e) { assert(/Too few/i.test(e.message) || /argument/i.test(e.message),
    '→V2 with one stack item → Too few arguments'); }
}

/* ---- →V3 ---- */
{
  const s = new Stack();
  s.push(Real(1));
  s.push(Real(2));
  s.push(Real(3));
  lookup('→V3').fn(s);
  const v = s.peek(1);
  assert(v.type === 'vector' && v.items.length === 3
      && v.items[0].value === 1 && v.items[2].value === 3,
    '→V3 1 2 3 → [1 2 3]');
}
{
  // ASCII alias
  const s = new Stack();
  s.push(Real(7)); s.push(Real(8)); s.push(Real(9));
  lookup('->V3').fn(s);
  assert(s.peek(1).items.length === 3,
    'ASCII alias ->V3 works like →V3');
}

/* ---- V→ ---- */
{
  const s = new Stack();
  s.push(Vector([Real(11), Real(22), Real(33)]));
  lookup('V→').fn(s);
  assert(s.depth === 3,
    'V→ on 3-vector pushes 3 scalars (NO size list, differs from ARRY→)');
  assert(s.peek(3).value === 11 && s.peek(2).value === 22 && s.peek(1).value === 33,
    'V→ preserves element order (L3=first, L1=last)');
}
{
  // Empty vector → nothing
  const s = new Stack();
  s.push(Vector([]));
  lookup('V→').fn(s);
  assert(s.depth === 0,
    'V→ on empty vector pushes nothing');
}
{
  // ASCII alias V->
  const s = new Stack();
  s.push(Vector([Real(5), Real(6)]));
  lookup('V->').fn(s);
  assert(s.depth === 2 && s.peek(1).value === 6,
    'ASCII alias V-> works like V→');
}
{
  // Non-vector
  const s = new Stack();
  s.push(Real(3));
  try { lookup('V→').fn(s); assert(false, 'V→ on Real should throw'); }
  catch (e) { assert(/Bad argument type/i.test(e.message),
    'V→ on Real → Bad argument type'); }
}
{
  // Matrix is NOT a vector for V→ — that's ARRY→'s job
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2)]]));
  try { lookup('V→').fn(s); assert(false, 'V→ on Matrix should throw'); }
  catch (e) { assert(/Bad argument type/i.test(e.message),
    'V→ on Matrix → Bad argument type (use ARRY→ for matrices)'); }
}

/* ---- Round-trip: →V3 then V→ ---- */
{
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2)); s.push(Real(3));
  lookup('→V3').fn(s);
  lookup('V→').fn(s);
  assert(s.depth === 3
      && s.peek(3).value === 1 && s.peek(1).value === 3,
    '→V3 then V→ round-trips three scalars');
}

// ------------------------------------------------------------------
// Session 046 additions — LAST / LASTARG
// ------------------------------------------------------------------

/* ---- LAST / LASTARG: basic 2-arg binary op ---- */
{
  const s = new Stack();
  s.push(Real(3));
  s.push(Real(4));
  // Explicit runOp wrap so LASTARG sees the `+`'s consumed arguments.
  s.runOp(() => lookup('+').fn(s));
  assert(s.depth === 1 && isReal(s.peek()) && s.peek().value === 7,
    'session046: 3 4 + → 7');
  lookup('LASTARG').fn(s);
  assert(s.depth === 3
      && isReal(s.peek(2)) && s.peek(2).value === 3
      && isReal(s.peek(1)) && s.peek(1).value === 4,
    'session046: LASTARG after 3 4 + pushes 3 4');
}

/* ---- LAST is a synonym for LASTARG ---- */
{
  const s = new Stack();
  s.push(Real(10));
  s.push(Real(2));
  s.runOp(() => lookup('-').fn(s));
  lookup('LAST').fn(s);
  assert(s.depth === 3
      && s.peek(2).value === 10 && s.peek(1).value === 2,
    'session046: LAST (synonym) after 10 2 - pushes 10 2');
}

/* ---- LASTARG after a unary op ---- */
{
  const s = new Stack();
  s.push(Real(5));
  s.runOp(() => lookup('NEG').fn(s));
  assert(s.peek().value === -5, 'session046: 5 NEG → -5 (setup)');
  lookup('LASTARG').fn(s);
  assert(s.depth === 2 && s.peek(2).value === -5 && s.peek(1).value === 5,
    'session046: LASTARG after NEG pushes the pre-NEG value');
}

/* ---- LASTARG with no recorded op throws ---- */
{
  const s = new Stack();
  try { lookup('LASTARG').fn(s); assert(false, 'LASTARG on empty history should throw'); }
  catch (e) { assert(/No last arguments/i.test(e.message),
    'session046: LASTARG with no prior op → No last arguments'); }
}

/* ---- LASTARG after a zero-consumption op (DUP) is empty ---- */
{
  const s = new Stack();
  s.push(Real(7));
  s.runOp(() => lookup('DUP').fn(s));   // prior=[7], cur=[7,7]; diff = []
  try { lookup('LASTARG').fn(s); assert(false, 'DUP consumed 0 → LASTARG empty'); }
  catch (e) { assert(/No last arguments/i.test(e.message),
    'session046: LASTARG after DUP (no consumed args) → No last arguments'); }
}

/* ---- LASTARG after a 3-arg op (PUT) pushes 3 values ---- */
{
  const s = new Stack();
  s.push(RList([Real(1), Real(2), Real(3)]));
  s.push(Integer(2));
  s.push(Real(99));
  s.runOp(() => lookup('PUT').fn(s));
  lookup('LASTARG').fn(s);
  // After PUT the stack has 1 item; LASTARG adds 3 → total 4
  assert(s.depth === 4, 'session046: LASTARG after PUT pushes the 3 args');
  assert(s.peek(1).value === 99,  'session046: LASTARG PUT arg3 = value');
  assert(s.peek(2).value === 2n,  'session046: LASTARG PUT arg2 = index');
  assert(s.peek(3).items.length === 3, 'session046: LASTARG PUT arg1 = original list');
}

/* ---- LASTARG chain: LASTARG is idempotent under runOp.  runOp only
       overwrites _lastArgs when the wrapped op actually consumed
       something; LASTARG itself consumes nothing (pure growth), so the
       _lastArgs slot from the earlier `*` survives across repeated
       LASTARG calls.  Matches HP50 behaviour (user can press LASTARG
       again to re-push the same argument list).  [Fixed session 048 —
       previously asserted chained-LASTARG-throws, contradicting the
       stack.js code comment that documents the idempotent design.] ---- */
{
  const s = new Stack();
  s.push(Real(8));
  s.push(Real(3));
  s.runOp(() => lookup('*').fn(s));
  s.runOp(() => lookup('LASTARG').fn(s));
  // prior=[24], cur=[24,8,3]. LCP=1, consumed=[].
  // consumed.length === 0 → runOp preserves the previous _lastArgs.
  s.runOp(() => lookup('LASTARG').fn(s));
  // Stack now [24, 8, 3, 8, 3] — LASTARG pushed the args again.
  assert(s.depth === 5,
    'session048: LASTARG is idempotent — chaining re-pushes the same args');
  assert(s.peek(1).value === 3 && s.peek(2).value === 8
      && s.peek(3).value === 3 && s.peek(4).value === 8,
    'session048: chained LASTARG pushes [8,3] twice on top of [24]');
}

/* ---- Manual LASTARG doesn't use runOp → _lastArgs survives chained
       LASTARG calls (test-shape convenience) ---- */
{
  const s = new Stack();
  s.push(Real(2)); s.push(Real(9));
  s.runOp(() => lookup('+').fn(s));
  lookup('LASTARG').fn(s);              // no runOp
  // _lastArgs still [2, 9] from the `+`
  lookup('LASTARG').fn(s);              // pushes again
  assert(s.depth === 5
      && s.peek(4).value === 2 && s.peek(3).value === 9
      && s.peek(2).value === 2 && s.peek(1).value === 9,
    'session046: direct LASTARG doesn\'t overwrite _lastArgs (test-only path)');
}

// ------------------------------------------------------------------
// End session 046 LAST/LASTARG additions
// ------------------------------------------------------------------

/* ================================================================
   Session 064 — OBJ→ on Program + →PRG (composer)
   ================================================================

   Covers the new "program-as-data" hook and its inverse:
     « t1 … tn » OBJ→  →  t1 … tn n
     t1 … tn n  →PRG  →  « t1 … tn »
   See src/rpl/ops.js for the implementation and comments. */

/* ---- OBJ→ on a non-empty Program pushes tokens + count ---- */
{
  const s = new Stack();
  // << 3 4 + >> — three tokens
  s.push(Program([Integer(3n), Integer(4n), Name('+')]));
  lookup('OBJ→').fn(s);
  assert(s.depth === 4,
    'session067: OBJ→ on 3-token Program pushes 3 tokens + count');
  assert(s.peek(1).type === 'integer' && s.peek(1).value === 3n,
    'session067: OBJ→ Program level 1 = token count as Integer');
  assert(s.peek(2).type === 'name' && s.peek(2).id === '+',
    'session067: OBJ→ Program level 2 = last token (+)');
  assert(s.peek(4).type === 'integer' && s.peek(4).value === 3n,
    'session067: OBJ→ Program level 4 = first token (3)');
}

/* ---- OBJ→ on empty Program pushes just a zero count ---- */
{
  const s = new Stack();
  s.push(Program([]));
  lookup('OBJ→').fn(s);
  assert(s.depth === 1 && s.peek().type === 'integer' && s.peek().value === 0n,
    'session067: OBJ→ on empty Program leaves just 0');
}

/* ---- →PRG composes a Program from count + tokens ---- */
{
  const s = new Stack();
  s.push(Integer(3n));
  s.push(Integer(4n));
  s.push(Name('+'));
  s.push(Integer(3n));                 // count
  lookup('→PRG').fn(s);
  assert(s.depth === 1 && isProgram(s.peek()),
    'session067: →PRG pops 3 tokens + count, pushes Program');
  assert(s.peek().tokens.length === 3,
    'session067: →PRG preserves token count (3)');
  assert(s.peek().tokens[2].type === 'name' && s.peek().tokens[2].id === '+',
    'session067: →PRG preserves token order (+ is last)');
}

/* ---- →PRG with zero count yields an empty program ---- */
{
  const s = new Stack();
  s.push(Integer(0n));
  lookup('→PRG').fn(s);
  assert(s.depth === 1 && isProgram(s.peek()) && s.peek().tokens.length === 0,
    'session067: →PRG with 0 count → empty program');
}

/* ---- OBJ→ + →PRG round-trip preserves program body ---- */
{
  const s = new Stack();
  // « 2 'X' * 1 + » — five tokens
  const orig = Program([
    Integer(2n), Name('X', { quoted: true }), Name('*'),
    Integer(1n), Name('+'),
  ]);
  s.push(orig);
  lookup('OBJ→').fn(s);
  lookup('→PRG').fn(s);
  assert(s.depth === 1 && isProgram(s.peek()),
    'session067: OBJ→ ⟶ →PRG round-trip still a Program');
  assert(s.peek().tokens.length === 5,
    'session067: round-trip preserves token count');
  // Structural check per-token
  const after = s.peek().tokens;
  let allMatch = true;
  for (let k = 0; k < orig.tokens.length; k++) {
    const a = orig.tokens[k], b = after[k];
    if (a.type !== b.type) { allMatch = false; break; }
    if (a.type === 'integer' && a.value !== b.value) { allMatch = false; break; }
    if (a.type === 'name' && (a.id !== b.id || !!a.quoted !== !!b.quoted)) {
      allMatch = false; break;
    }
  }
  assert(allMatch, 'session067: round-trip preserves every token identity');
}

/* ---- →PRG ASCII alias ->PRG works identically ---- */
{
  const s = new Stack();
  s.push(Integer(42n));
  s.push(Integer(1n));
  lookup('->PRG').fn(s);
  assert(s.depth === 1 && isProgram(s.peek()) && s.peek().tokens.length === 1
      && s.peek().tokens[0].value === 42n,
    'session067: ->PRG ASCII alias produces the same Program shape');
}

/* ---- →PRG on negative count raises Bad argument value ---- */
{
  const s = new Stack();
  s.push(Integer(-1n));
  let caught = null;
  try { lookup('→PRG').fn(s); } catch (e) { caught = e.message; }
  assert(caught && /Bad argument value/.test(caught),
    'session067: →PRG negative count raises Bad argument value');
}

/* ---- →PRG on a non-numeric count raises Bad argument type ---- */
{
  const s = new Stack();
  s.push(Name('foo'));
  let caught = null;
  try { lookup('→PRG').fn(s); } catch (e) { caught = e.message; }
  assert(caught && /Bad argument type/.test(caught),
    'session067: →PRG non-numeric count raises Bad argument type');
}

/* ---- Programs can contain other Programs as tokens (round-trip) ---- */
{
  const s = new Stack();
  const inner = Program([Name('+')]);
  const outer = Program([Integer(1n), Integer(2n), inner, Name('EVAL')]);
  s.push(outer);
  lookup('OBJ→').fn(s);
  lookup('→PRG').fn(s);
  assert(s.depth === 1 && isProgram(s.peek()) && s.peek().tokens.length === 4,
    'session067: nested Program tokens survive round-trip');
  assert(isProgram(s.peek().tokens[2]) && s.peek().tokens[2].tokens.length === 1,
    'session067: nested Program token is still a Program after round-trip');
}
