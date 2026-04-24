import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import {
  Real, Integer, BinaryInteger, Complex, Name, Str, Directory, Program, Tagged,
  RList, Vector, Matrix, Symbolic,
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
   →ARRY / ARRY→ (array compose / decompose).
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
   V→ / →V2 / →V3 (simple vector compose/decompose).

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
// LAST / LASTARG
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
       again to re-push the same argument list). ---- */
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

/* ================================================================
   OBJ→ on Program + →PRG (composer)
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

/* ================================================================
   DECOMP — Program → String source form.
   ================================================================ */

// Basic: DECOMP produces a String whose value starts with « and ends with ».
{
  const s = new Stack();
  s.push(Program([Integer(3n), Integer(4n), Name('+')]));
  lookup('DECOMP').fn(s);
  assert(s.depth === 1 && s.peek().type === 'string',
    'session068: DECOMP on Program pushes a String');
  const src = s.peek().value;
  assert(src.startsWith('«') && src.endsWith('»'),
    'session068: DECOMP output carries the « … » program delimiters');
  assert(src.includes('3') && src.includes('4') && src.includes('+'),
    'session068: DECOMP output contains every original token (3 4 +)');
}

// Empty program.
{
  const s = new Stack();
  s.push(Program([]));
  lookup('DECOMP').fn(s);
  assert(s.peek().type === 'string',
    'session068: DECOMP on empty Program still pushes a String');
  assert(/^«\s*»$/.test(s.peek().value),
    'session068: DECOMP of empty Program is roughly «  »');
}

// DECOMP + STR→ round-trip: the restored Program runs to the same result.
{
  resetHome();
  const prevApprox = calcState.approxMode;
  setApproxMode(true);
  try {
    const s = new Stack();
    s.push(Program([Integer(3n), Integer(4n), Name('+')]));
    lookup('DECOMP').fn(s);                 // Program → String
    lookup('STR→').fn(s);                   // String → value(s)
    // STR→ may emit one or more values; for a program source string we
    // expect exactly one: the reconstructed Program.
    assert(s.depth >= 1,
      'session068: DECOMP→STR→ leaves at least one value on the stack');
    const reconstituted = s._items[s._items.length - 1];
    assert(isProgram(reconstituted),
      'session068: DECOMP→STR→ yields a Program (round-trip preserves type)');
    assert(reconstituted.tokens.length === 3,
      'session068: DECOMP→STR→ preserves token count');
    // Running it should produce 7.
    lookup('EVAL').fn(s);
    // Level-1 is now the integer 7 (plus possibly other bookkeeping).
    const top = s.peek();
    const topVal = top.type === 'integer' ? Number(top.value)
                : top.type === 'real'    ? top.value : null;
    assert(topVal === 7,
      'session068: DECOMP→STR→→EVAL reproduces the original result (3 4 + → 7)');
  } finally {
    setApproxMode(prevApprox);
  }
}

// DECOMP on non-Program raises Bad argument type.
{
  const s = new Stack();
  s.push(Integer(42n));
  let caught = null;
  try { lookup('DECOMP').fn(s); } catch (e) { caught = e.message; }
  assert(caught && /Bad argument type/.test(caught),
    'session068: DECOMP on Integer raises Bad argument type');
}

{
  const s = new Stack();
  s.push(Str('hi'));
  let caught = null;
  try { lookup('DECOMP').fn(s); } catch (e) { caught = e.message; }
  assert(caught && /Bad argument type/.test(caught),
    'session068: DECOMP on String raises Bad argument type');
}

/* ================================================================
   OBJ→ on Symbolic — peel one AST layer onto the stack.
   ================================================================ */

// `'A+B' OBJ→`  →  'A'  'B'  '+'  3
{
  const s = new Stack();
  s.push(parseEntry("`A+B`")[0]);
  lookup('OBJ→').fn(s);
  assert(s.depth === 4,
    'session068: OBJ→ on 2-arg Bin leaves 4 items (l, r, op, count)');
  const [l, r, op, cnt] = s._items;
  assert(l.type === 'name' && l.id === 'A' && l.quoted,
    'session068: OBJ→ symbolic arg l is quoted Name(A)');
  assert(r.type === 'name' && r.id === 'B' && r.quoted,
    'session068: OBJ→ symbolic arg r is quoted Name(B)');
  assert(op.type === 'name' && op.id === '+' && op.quoted,
    'session068: OBJ→ symbolic head is quoted Name(+)');
  assert(cnt.type === 'integer' && cnt.value === 3n,
    'session068: OBJ→ symbolic count is Integer(3) for a binary head');
}

// `'3+X' OBJ→`  →  Real(3)  'X'  '+'  3
{
  const s = new Stack();
  s.push(parseEntry("`3+X`")[0]);
  lookup('OBJ→').fn(s);
  assert(s.depth === 4,
    'session068: OBJ→ on 3+X leaves 4 items');
  assert(s._items[0].type === 'real' && s._items[0].value === 3,
    'session068: OBJ→ 3+X left-arg unwraps to Real(3)');
  assert(s._items[1].type === 'name' && s._items[1].id === 'X',
    'session068: OBJ→ 3+X right-arg is Name(X)');
  assert(s._items[3].type === 'integer' && s._items[3].value === 3n,
    'session068: OBJ→ 3+X count is 3');
}

// `'SIN(X+1)' OBJ→`  →  Symbolic('X+1')  'SIN'  2
{
  const s = new Stack();
  s.push(parseEntry("`SIN(X+1)`")[0]);
  lookup('OBJ→').fn(s);
  assert(s.depth === 3,
    'session068: OBJ→ on a unary Fn leaves 3 items (arg, fn, count)');
  const [arg, fn, cnt] = s._items;
  assert(arg.type === 'symbolic' && arg.expr.kind === 'bin' && arg.expr.op === '+',
    'session068: OBJ→ SIN(X+1): non-leaf argument stays Symbolic');
  assert(fn.type === 'name' && fn.id === 'SIN' && fn.quoted,
    'session068: OBJ→ SIN(X+1) head is quoted Name(SIN)');
  assert(cnt.type === 'integer' && cnt.value === 2n,
    'session068: OBJ→ SIN(X+1) count is 2 (arg + head)');
}

// Leaf Var: 'X' OBJ→  →  'X'  1  (single-layer)
{
  const s = new Stack();
  // Parser emits Name(X) for a plain 'X', not a Symbolic.  To exercise
  // the Symbolic-Var leaf path, wrap via Symbolic(Var(X)) directly.
  s.push(Symbolic({ kind: 'var', name: 'X' }));
  lookup('OBJ→').fn(s);
  assert(s.depth === 2,
    'session068: OBJ→ on leaf Symbolic(Var) leaves 2 items (name, count)');
  assert(s._items[0].type === 'name' && s._items[0].id === 'X' && s._items[0].quoted,
    'session068: OBJ→ leaf Var unwraps to quoted Name');
  assert(s._items[1].type === 'integer' && s._items[1].value === 1n,
    'session068: OBJ→ leaf Var count is 1');
}

// Leaf Num: Symbolic(Num) OBJ→  →  Real, 1
{
  const s = new Stack();
  s.push(Symbolic({ kind: 'num', value: 7 }));
  lookup('OBJ→').fn(s);
  assert(s.depth === 2,
    'session068: OBJ→ on leaf Symbolic(Num) leaves 2 items');
  assert(s._items[0].type === 'real' && s._items[0].value === 7,
    'session068: OBJ→ leaf Num unwraps to Real(7)');
  assert(s._items[1].type === 'integer' && s._items[1].value === 1n,
    'session068: OBJ→ leaf Num count is 1');
}

// Neg: '-X' OBJ→  →  'X'  'NEG'  2
{
  const s = new Stack();
  s.push(parseEntry("`-X`")[0]);
  lookup('OBJ→').fn(s);
  assert(s.depth === 3,
    'session068: OBJ→ on Neg leaves 3 items');
  assert(s._items[1].type === 'name' && s._items[1].id === 'NEG',
    'session068: OBJ→ Neg head is Name(NEG)');
  assert(s._items[2].type === 'integer' && s._items[2].value === 2n,
    'session068: OBJ→ Neg count is 2');
}

// Multi-arg function: lift a fake Fn with two args and verify the shape.
{
  const s = new Stack();
  s.push(Symbolic({
    kind: 'fn', name: 'GCD',
    args: [ { kind: 'var', name: 'A' }, { kind: 'var', name: 'B' } ],
  }));
  lookup('OBJ→').fn(s);
  assert(s.depth === 4,
    'session068: OBJ→ on 2-arg Fn leaves 4 items (a1, a2, fn, count)');
  assert(s._items[2].type === 'name' && s._items[2].id === 'GCD',
    'session068: OBJ→ 2-arg Fn head is Name(GCD)');
  assert(s._items[3].type === 'integer' && s._items[3].value === 3n,
    'session068: OBJ→ 2-arg Fn count is N+1 = 3');
}

/* ================================================================
   DECOMP → STR→ round-trip invariants

   Pins the canonical "program source-string round-trips to an
   equivalent program" invariant for a spread of program shapes.
   HP50 AUR p.1-12 documents this as the defining property of
   DECOMP: the emitted string must reparse into an object that's
   semantically equivalent to the input.

   Helper: decompThenStrTo(v) returns the Program re-assembled by
   DECOMP-then-STR→ on value v.
   ================================================================ */

function _roundTripProgram(prog) {
  const s = new Stack();
  s.push(prog);
  lookup('DECOMP').fn(s);
  lookup('STR→').fn(s);
  // STR→ yields one Program for any program-shape source string.
  assert(s.depth === 1,
    'session073: DECOMP→STR→ round-trip leaves exactly one value');
  const back = s.peek();
  assert(isProgram(back),
    'session073: DECOMP→STR→ round-trip yields a Program');
  return back;
}

/* ---- Empty program round-trips to an empty Program ---- */
{
  const back = _roundTripProgram(Program([]));
  assert(back.tokens.length === 0,
    'session073: DECOMP→STR→ preserves empty Program');
}

/* ---- Multi-token arithmetic round-trips with identical token count ---- */
{
  const src = Program([Integer(3n), Integer(4n), Name('+'), Integer(5n), Name('*')]);
  const back = _roundTripProgram(src);
  assert(back.tokens.length === src.tokens.length,
    'session073: DECOMP→STR→ preserves token count for arithmetic program');
}

/* ---- Round-trip execution agrees with the original ---- */
{
  resetHome();
  const prev = calcState.approxMode;
  setApproxMode(true);
  try {
    const src = Program([Integer(6n), Integer(7n), Name('*'), Integer(2n), Name('-')]);
    // Original EVAL: 6 7 * 2 - = 40
    const s0 = new Stack();
    s0.push(src);
    lookup('EVAL').fn(s0);
    const origTop = s0.peek();
    const origVal = origTop.type === 'integer' ? Number(origTop.value) : origTop.value;

    const back = _roundTripProgram(src);
    const s1 = new Stack();
    s1.push(back);
    lookup('EVAL').fn(s1);
    const backTop = s1.peek();
    const backVal = backTop.type === 'integer' ? Number(backTop.value) : backTop.value;
    assert(origVal === backVal && origVal === 40,
      'session073: DECOMP→STR→ round-trip preserves EVAL semantics (arith)');
  } finally {
    setApproxMode(prev);
  }
}

/* ---- Nested Program inside Program round-trips structurally ---- */
{
  // outer Program whose single token is an inner Program.
  const inner = Program([Integer(1n), Integer(2n), Name('+')]);
  const src = Program([inner]);
  const back = _roundTripProgram(src);
  assert(back.tokens.length === 1,
    'session073: DECOMP→STR→ on {nested prog} preserves outer length');
  assert(isProgram(back.tokens[0]),
    'session073: DECOMP→STR→ nested token is still a Program');
  assert(back.tokens[0].tokens.length === 3,
    'session073: DECOMP→STR→ nested Program token count survives');
}

/* ---- Program containing a String token round-trips with the string intact ---- */
{
  // The quoted string with spaces must survive lexing intact via the
  // `" … "` delimiters the formatter emits.
  const src = Program([Str('hello world'), Integer(5n)]);
  const back = _roundTripProgram(src);
  assert(back.tokens.length === 2,
    'session073: DECOMP→STR→ on [String, Integer] preserves token count');
  assert(back.tokens[0].type === 'string' &&
         back.tokens[0].value === 'hello world',
    'session073: DECOMP→STR→ preserves String token with embedded space');
}

/* ---- Program containing an IF/THEN/ELSE/END structure round-trips
       and re-evaluates to the same result ---- */
{
  resetHome();
  const prev = calcState.approxMode;
  setApproxMode(true);
  try {
    const src = Program([
      Integer(5n),
      Name('IF'), Name('DUP'), Integer(0n), Name('>'),
      Name('THEN'), Integer(100n), Name('+'),
      Name('ELSE'), Name('NEG'),
      Name('END'),
    ]);
    const back = _roundTripProgram(src);
    // Re-run the round-tripped program.
    const s = new Stack();
    s.push(back);
    lookup('EVAL').fn(s);
    const top = s.peek();
    const v = top.type === 'integer' ? Number(top.value) : top.value;
    assert(v === 105,
      'session073: DECOMP→STR→ round-trip preserves IF/THEN/ELSE/END (5>0 → 5+100)');
  } finally {
    setApproxMode(prev);
  }
}

/* ---- Program containing a quoted Name round-trips as quoted ---- */
{
  // Quoted-Name tokens in a Program body come from source like `'X'`.
  const q = Name('X', { quoted: true });
  const src = Program([q, Name('STO')]);
  const back = _roundTripProgram(src);
  assert(back.tokens.length === 2,
    'session073: DECOMP→STR→ preserves {quoted-Name, Name} token count');
  const first = back.tokens[0];
  assert(isName(first) && first.id === 'X' && first.quoted === true,
    'session073: DECOMP→STR→ quoted-Name round-trips as quoted');
}

/* ---- Program containing a Real with a fractional part round-trips ---- */
{
  const src = Program([Real(3.25), Real(2.5), Name('+')]);
  const back = _roundTripProgram(src);
  assert(back.tokens.length === 3,
    'session073: DECOMP→STR→ preserves token count for Real-bearing program');
  assert(back.tokens[0].type === 'real' &&
         Math.abs(back.tokens[0].value - 3.25) < 1e-12,
    'session073: DECOMP→STR→ preserves Real value 3.25');
}

/* ---- Idempotence: DECOMP→STR→→DECOMP produces the SAME string ---- */
{
  // Second round yields the identical source — this is the
  // "canonical form" check.  If the formatter ever introduced
  // nondeterministic whitespace, this assertion would catch it.
  const src = Program([
    Integer(1n),
    Name('FOR'), Name('i'), Integer(10n),
    Name('i'), Name('*'),
    Name('NEXT'),
  ]);
  const s = new Stack();
  s.push(src);
  lookup('DECOMP').fn(s);
  const str1 = s.peek().value;
  lookup('STR→').fn(s);       // back to Program
  lookup('DECOMP').fn(s);     // Program → string again
  const str2 = s.peek().value;
  assert(str1 === str2,
    'session073: DECOMP→STR→→DECOMP is a canonical-form fixed point');
}

/* ================================================================
   →PRG / OBJ→(Program) parity audit with →LIST /
                 LIST→ / →ARRY

   The cluster of decompose/compose ops presents a uniform surface
   for the meta-programmer.  Invariants pinned here:

     - →PRG, →LIST, →ARRY all accept Integer / Real / BinaryInteger
       counts (parity handled by `_toCountN` / `_toIntIdx`).
     - Negative counts reject with "Bad argument value" (not "type").
     - Zero counts produce the empty form: « », { }, [ ].
     - OBJ→ on Program pushes tokens then an Integer count (matching
       LIST→).  OBJ→ on List does the same.  ARRY→ still uses the
       size-list convention — documented here so the contrast is
       visible.
     - Round-trip: OBJ→ ; →PRG reproduces the input program.  Same
       shape LIST→ ; →LIST has.
   ================================================================ */

/* ---- Count-type parity: BinaryInteger on level 1 ---- */
{
  const s = new Stack();
  s.push(Integer(10n)); s.push(Integer(20n));
  s.push(BinaryInteger(2n, 'd'));
  lookup('→LIST').fn(s);
  assert(s.depth === 1 && s.peek().type === 'list' &&
         s.peek().items.length === 2,
    'session077: →LIST accepts BinaryInteger count (parity with →PRG)');
}
{
  const s = new Stack();
  s.push(Name('A')); s.push(Name('B'));
  s.push(BinaryInteger(2n, 'h'));
  lookup('→PRG').fn(s);
  assert(s.depth === 1 && s.peek().type === 'program' &&
         s.peek().tokens.length === 2,
    'session077: →PRG accepts BinaryInteger count');
}
{
  const s = new Stack();
  s.push(Integer(1n)); s.push(Integer(2n)); s.push(Integer(3n));
  s.push(BinaryInteger(3n, 'b'));
  lookup('→ARRY').fn(s);
  assert(s.depth === 1 && s.peek().type === 'vector' &&
         s.peek().items.length === 3,
    'session077: →ARRY accepts BinaryInteger bare count (parity widening)');
}

/* ---- Count-type parity: negative count ---- */
{
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(-1n));
  let caught = null;
  try { lookup('→LIST').fn(s); } catch (e) { caught = e; }
  assert(caught && /Bad argument value/.test(caught.message),
    'session077: →LIST with negative count raises Bad argument value');
}
{
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(-1n));
  let caught = null;
  try { lookup('→PRG').fn(s); } catch (e) { caught = e; }
  assert(caught && /Bad argument value/.test(caught.message),
    'session077: →PRG with negative count raises Bad argument value (parity)');
}
{
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(-1n));
  let caught = null;
  try { lookup('→ARRY').fn(s); } catch (e) { caught = e; }
  assert(caught && /Bad argument value/.test(caught.message),
    'session077: →ARRY with negative bare count raises Bad argument value');
}

/* ---- Count-type parity: String count rejects with Bad argument type ---- */
{
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Str('oops'));
  let caught = null;
  try { lookup('→PRG').fn(s); } catch (e) { caught = e; }
  assert(caught && /Bad argument type/.test(caught.message),
    'session077: →PRG rejects String count with Bad argument type');
}
{
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Str('oops'));
  let caught = null;
  try { lookup('→LIST').fn(s); } catch (e) { caught = e; }
  assert(caught && /Bad argument type/.test(caught.message),
    'session077: →LIST rejects String count with Bad argument type');
}
{
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Str('oops'));
  let caught = null;
  try { lookup('→ARRY').fn(s); } catch (e) { caught = e; }
  assert(caught && /Bad argument type/.test(caught.message),
    'session077: →ARRY rejects String bare count with Bad argument type');
}

/* ---- Zero count across the trio produces the empty form ---- */
{
  const s = new Stack();
  s.push(Integer(0n));
  lookup('→LIST').fn(s);
  assert(s.depth === 1 && s.peek().type === 'list' &&
         s.peek().items.length === 0,
    'session077: →LIST 0 → empty list {}');
}
{
  const s = new Stack();
  s.push(Integer(0n));
  lookup('→PRG').fn(s);
  assert(s.depth === 1 && s.peek().type === 'program' &&
         s.peek().tokens.length === 0,
    'session077: →PRG 0 → empty program « »');
}
{
  // →ARRY's bare-count form rejects 0 at the `_toIntIdx` layer —
  // historically the internal `if (n === 0) { push Vector([]); }` check
  // inside `_toArrayOp` is unreachable because `_toIntIdx` refuses
  // zero.  Flipping that would be a new behaviour and needs a
  // downstream audit (matrix shape validation, ARRY→ round-trip,
  // etc.); the current rejection shape is pinned here so a future
  // cleanup sees the deliberate asymmetry.  Tracked in RPL.md.
  const s = new Stack();
  s.push(Integer(0n));
  let caught = null;
  try { lookup('→ARRY').fn(s); } catch (e) { caught = e; }
  assert(caught && /Bad argument value/.test(caught.message),
    'session077: →ARRY 0 rejects Bad argument value (documented asymmetry ' +
    'with →LIST 0 / →PRG 0 — follow-up in RPL.md)');
}

/* ---- OBJ→ on Program / List both push Integer count (parity) ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(2n), Integer(3n)]));
  lookup('OBJ→').fn(s);
  assert(s.depth === 4 && s.peek().type === 'integer' &&
         s.peek().value === 3n,
    'session077: OBJ→ on List pushes Integer count (=3)');
}
{
  const s = new Stack();
  s.push(Program([Integer(1n), Integer(2n), Integer(3n)]));
  lookup('OBJ→').fn(s);
  assert(s.depth === 4 && s.peek().type === 'integer' &&
         s.peek().value === 3n,
    'session077: OBJ→ on Program pushes Integer count (=3, matches LIST→ shape)');
}
{
  const s = new Stack();
  // LIST→ equivalent — pushes Integer count too.
  s.push(RList([Integer(1n), Integer(2n), Integer(3n)]));
  lookup('LIST→').fn(s);
  assert(s.peek().type === 'integer' && s.peek().value === 3n,
    'session077: LIST→ pushes Integer count (baseline)');
}

/* ---- Round-trip idempotence: OBJ→ ; →PRG reproduces the Program ---- */
{
  const s = new Stack();
  const prog = Program([
    Integer(2n), Integer(3n), Name('+'),
    Name('SWAP'), Name('DUP'),
  ]);
  s.push(prog);
  lookup('OBJ→').fn(s);
  lookup('→PRG').fn(s);
  assert(s.depth === 1 && s.peek().type === 'program' &&
         s.peek().tokens.length === prog.tokens.length,
    'session077: Program OBJ→ ; →PRG round-trips token count');
  // Spot-check content.
  const rt = s.peek();
  for (let i = 0; i < prog.tokens.length; i++) {
    const a = prog.tokens[i], b = rt.tokens[i];
    const same = (a.type === b.type) && (
      (a.type === 'integer' && a.value === b.value) ||
      (a.type === 'name' && a.id === b.id)
    );
    assert(same,
      `session077: round-trip token[${i}] preserved (${a.type})`);
  }
}

/* ---- Round-trip idempotence: LIST→ ; →LIST reproduces the list ---- */
{
  const s = new Stack();
  const src = RList([Integer(10n), Integer(20n), Integer(30n)]);
  s.push(src);
  lookup('LIST→').fn(s);
  lookup('→LIST').fn(s);
  assert(s.depth === 1 && s.peek().type === 'list' &&
         s.peek().items.length === 3 &&
         s.peek().items[0].value === 10n &&
         s.peek().items[2].value === 30n,
    'session077: LIST→ ; →LIST round-trips the source list');
}

/* ---- ARRY→ is documented-different: it pushes a size-LIST, not a
       bare count.  This is the one known asymmetry in the cluster —
       left as-is because OBJ→ on Matrix has the same shape and the
       2-D form genuinely needs 2 numbers (rows + cols).  Pin the
       shape explicitly so a future cleanup pass doesn't silently
       flip it to bare Integer and break existing callers. ---- */
{
  const s = new Stack();
  const v = Vector([Real(1), Real(2), Real(3)]);
  s.push(v);
  lookup('ARRY→').fn(s);
  // Stack: 1  2  3  { 3 }   (bottom→top)
  assert(s.depth === 4, 'session077: ARRY→ pushes elements + 1-elem size-list');
  const top = s.peek();
  assert(top.type === 'list' && top.items.length === 1 &&
         top.items[0].type === 'real' && top.items[0].value === 3,
    'session077: ARRY→ size-spec is a LIST wrapping Real — asymmetric with '
    + 'LIST→/OBJ→(Program) by design (matches →ARRY input shape)');
}

/* ---- SIZE on Program (session088) ---- */
{
  resetHome();
  const s = new Stack();

  // Empty program « » → SIZE = 0
  s.push(Program([]));
  lookup('SIZE').fn(s);
  assert(s.depth === 1 && s.peek().type === 'integer' && s.peek().value === 0n,
    'session088: SIZE on empty program returns 0');

  // « 1 2 + » → 3 tokens
  s.push(Program([ Integer(1n), Integer(2n), Name('+') ]));
  lookup('SIZE').fn(s);
  assert(s.peek().type === 'integer' && s.peek().value === 3n,
    'session088: SIZE on « 1 2 + » returns 3');

  // Nested program counts as one token at the outer level
  // « « 1 2 » 3 + » has 3 tokens: [Program([1,2]), Integer(3), Name('+')]
  const inner = Program([ Integer(1n), Integer(2n) ]);
  s.push(Program([ inner, Integer(3n), Name('+') ]));
  lookup('SIZE').fn(s);
  assert(s.peek().type === 'integer' && s.peek().value === 3n,
    'session088: SIZE on program with nested sub-program counts sub-program as 1 token');

  // Single-token program
  s.push(Program([ Name('DUP') ]));
  lookup('SIZE').fn(s);
  assert(s.peek().type === 'integer' && s.peek().value === 1n,
    'session088: SIZE on single-token program returns 1');

  // Error on non-program type (regression guard: Real still bad-arg)
  let caught = null;
  s.push(Real(1.0));
  try { lookup('SIZE').fn(s); } catch (e) { caught = e; }
  assert(caught && /Bad argument type/.test(caught.message),
    'session088: SIZE on Real still throws Bad argument type');
}
