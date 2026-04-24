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
  setComplexMode, getComplexMode, toggleComplexMode,
} from '../src/rpl/state.js';
import { clampStackScroll, computeMenuPage } from '../src/ui/paging.js';
import { assert } from './helpers.mjs';

/* Numerics: basic arithmetic, complex, SQRT, stack ops, parser+format basics,
   trig, angle modes, R↔D, div-by-zero, FLOOR/CEIL/IP/FP/SIGN/MOD/MIN/MAX. */

// Basic push + arithmetic
{
  const s = new Stack();
  s.push(Real(2));
  s.push(Real(3));
  lookup('+').fn(s);
  assert(s.depth === 1 && isReal(s.peek()) && s.peek().value === 5, '2 3 + = 5');
}

// Integer arithmetic stays integer until forced
{
  const s = new Stack();
  s.push(Integer(10));
  s.push(Integer(3));
  lookup('*').fn(s);
  assert(s.depth === 1 && isInteger(s.peek()) && s.peek().value === 30n, '10 3 * = 30 (int)');
}

// Integer div that doesn't divide evenly -> Real (under APPROX mode)
// Session 035: the default boot mode flipped to EXACT, under which
// 10 3 / becomes Symbolic('10/3').  This test explicitly opts into
// APPROX to preserve its original intent: exercise the Integer → Real
// fall-through for non-clean division.
{
  setApproxMode(true);
  const s = new Stack();
  s.push(Integer(10));
  s.push(Integer(3));
  lookup('/').fn(s);
  assert(s.depth === 1 && isReal(s.peek()), '10 3 / -> Real (APPROX)');
  setApproxMode(false);
}

// Complex arithmetic
{
  const s = new Stack();
  s.push(Complex(1, 2));
  s.push(Complex(3, 4));
  lookup('*').fn(s);
  const v = s.peek();
  assert(isComplex(v) && v.re === -5 && v.im === 10, '(1,2)*(3,4) = (-5,10)');
}

// SQRT of negative -> complex
{
  const s = new Stack();
  s.push(Real(-4));
  lookup('SQRT').fn(s);
  const v = s.peek();
  assert(isComplex(v) && Math.abs(v.re) < 1e-10 && Math.abs(v.im - 2) < 1e-10,
         'SQRT(-4) = (0, 2)');
}

// Stack ops
{
  const s = new Stack();
  s.pushMany([Real(1), Real(2), Real(3)]);
  lookup('SWAP').fn(s);
  assert(s.peek(1).value === 2 && s.peek(2).value === 3, 'SWAP');
  lookup('DROP').fn(s);
  assert(s.peek(1).value === 3, 'DROP');
  lookup('DUP').fn(s);
  assert(s.depth === 3 && s.peek(1).value === 3 && s.peek(2).value === 3, 'DUP');
}

// Parser: integer, real, complex, list
{
  const vs = parseEntry('42 3.14 (1,2) { 10 20 }');
  assert(vs.length === 4, 'parse 4 items');
  assert(isInteger(vs[0]) && vs[0].value === 42n, 'integer token');
  assert(isReal(vs[1]) && Math.abs(vs[1].value - 3.14) < 1e-12, 'real token');
  assert(isComplex(vs[2]) && vs[2].re === 1 && vs[2].im === 2, 'complex token');
  assert(vs[3].type === 'list' && vs[3].items.length === 2, 'list tokens');
}

// Format a few values
{
  assert(format(Real(3.14)) === '3.14', 'format real');
  assert(format(Integer(42)) === '42', 'format int');
  // Session 041: in EXACT + STD, integer-valued Complex components
  // drop the trailing dot so `(1, 2)` displays as `(1, 2)` rather than
  // `(1., 2.)`.  Non-integer components still show the real form.
  assert(format(Complex(1, 2)) === '(1, 2)', 'format complex — integer components (EXACT/STD)');
  assert(format(Complex(1.5, 2)) === '(1.5, 2)', 'format complex — mixed components');
  assert(format(Complex(1.5, 2.5)) === '(1.5, 2.5)', 'format complex — real components');
}

// Trig — default mode is RAD
{
  setAngle('RAD');
  const s = new Stack();
  s.push(Real(0));
  lookup('SIN').fn(s);
  assert(Math.abs(s.peek().value) < 1e-15, 'SIN(0) = 0');
}

// Angle-mode: DEG
{
  setAngle('DEG');
  assert(calcState.angle === 'DEG', 'setAngle(DEG) writes state');
  const s = new Stack();
  s.push(Real(90));
  lookup('SIN').fn(s);
  assert(Math.abs(s.peek().value - 1) < 1e-12, 'SIN(90) in DEG = 1');
}

// Angle-mode: RAD
{
  setAngle('RAD');
  const s = new Stack();
  s.push(Real(Math.PI / 2));
  lookup('SIN').fn(s);
  assert(Math.abs(s.peek().value - 1) < 1e-12, 'SIN(pi/2) in RAD = 1');
}

// Angle-mode: GRD (400 grad per full turn; 100 grad == 90°)
{
  setAngle('GRD');
  const s = new Stack();
  s.push(Real(100));
  lookup('SIN').fn(s);
  assert(Math.abs(s.peek().value - 1) < 1e-12, 'SIN(100) in GRD = 1');
}

// Inverse trig returns angle in current mode
{
  setAngle('DEG');
  const s = new Stack();
  s.push(Real(1));
  lookup('ASIN').fn(s);
  assert(Math.abs(s.peek().value - 90) < 1e-12, 'ASIN(1) in DEG = 90');
}
{
  setAngle('RAD');
  const s = new Stack();
  s.push(Real(1));
  lookup('ASIN').fn(s);
  assert(Math.abs(s.peek().value - Math.PI / 2) < 1e-12, 'ASIN(1) in RAD = pi/2');
}

// DEG/RAD/GRD ops set the mode from RPL code
{
  setAngle('RAD');
  const s = new Stack();
  lookup('DEG').fn(s);
  assert(calcState.angle === 'DEG', 'DEG op sets angle to DEG');
  lookup('GRD').fn(s);
  assert(calcState.angle === 'GRD', 'GRD op sets angle to GRD');
  lookup('GRAD').fn(s);           // alias
  assert(calcState.angle === 'GRD', 'GRAD alias sets angle to GRD');
  lookup('RAD').fn(s);
  assert(calcState.angle === 'RAD', 'RAD op sets angle back to RAD');
}

// cycleAngle: DEG -> RAD -> GRD -> DEG
{
  setAngle('DEG');
  cycleAngle(); assert(calcState.angle === 'RAD', 'cycle DEG -> RAD');
  cycleAngle(); assert(calcState.angle === 'GRD', 'cycle RAD -> GRD');
  cycleAngle(); assert(calcState.angle === 'DEG', 'cycle GRD -> DEG');
}

// toRadians / fromRadians honor current state
{
  setAngle('DEG');
  assert(Math.abs(toRadians(180) - Math.PI) < 1e-12, 'toRadians(180 DEG) = pi');
  assert(Math.abs(fromRadians(Math.PI) - 180) < 1e-12, 'fromRadians(pi) = 180 DEG');
  setAngle('GRD');
  assert(Math.abs(toRadians(200) - Math.PI) < 1e-12, 'toRadians(200 GRD) = pi');
  setAngle('RAD');
  assert(toRadians(1.25) === 1.25, 'toRadians passthrough in RAD');
}

// Explicit converters R->D and D->R ignore current mode
{
  setAngle('GRD');        // make sure these ops do not use the mode
  const s = new Stack();
  s.push(Real(Math.PI));
  lookup('R->D').fn(s);
  assert(Math.abs(s.peek().value - 180) < 1e-12, 'R->D converts regardless of mode');
  s.clear();
  s.push(Real(180));
  lookup('D->R').fn(s);
  assert(Math.abs(s.peek().value - Math.PI) < 1e-12, 'D->R converts regardless of mode');
  setAngle('RAD');        // leave tests in a clean state
}

// Division by zero
{
  const s = new Stack();
  s.push(Real(1));
  s.push(Real(0));
  let threw = false;
  try { lookup('/').fn(s); } catch (e) { threw = true; }
  assert(threw, '1/0 throws');
}


// Session 014: FLOOR / CEIL / IP / FP / SIGN / MOD / MIN / MAX
// ------------------------------------------------------------------

// FLOOR / CEIL / IP / FP on reals
{
  const s = new Stack();
  s.push(Real(-1.2));
  lookup('FLOOR').fn(s);
  assert(isReal(s.peek()) && s.peek().value === -2, 'FLOOR(-1.2) = -2');
  s.clear();
  s.push(Real(-1.2));
  lookup('CEIL').fn(s);
  assert(isReal(s.peek()) && s.peek().value === -1, 'CEIL(-1.2) = -1');
  s.clear();
  s.push(Real(-1.8));
  lookup('IP').fn(s);
  assert(isReal(s.peek()) && s.peek().value === -1, 'IP(-1.8) = -1 (truncate toward 0)');
  s.clear();
  s.push(Real(1.8));
  lookup('FP').fn(s);
  assert(isReal(s.peek()) && Math.abs(s.peek().value - 0.8) < 1e-12, 'FP(1.8) ≈ 0.8');
  s.clear();
  s.push(Real(-1.8));
  lookup('FP').fn(s);
  assert(isReal(s.peek()) && Math.abs(s.peek().value - (-0.8)) < 1e-12,
         'FP(-1.8) ≈ -0.8 (matches sign of input)');
}

// FLOOR / CEIL on integers are identity; FP on integer is 0n.
{
  const s = new Stack();
  s.push(Integer(42));
  lookup('FLOOR').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 42n,
         'FLOOR(Integer(42)) = Integer(42) (identity)');
  s.clear();
  s.push(Integer(42));
  lookup('FP').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 0n,
         'FP(Integer(42)) = Integer(0n)');
}

// SIGN — real, integer, complex, zero
{
  const s = new Stack();
  s.push(Real(-7.5));
  lookup('SIGN').fn(s);
  assert(isReal(s.peek()) && s.peek().value === -1, 'SIGN(-7.5) = -1');
  s.clear();
  s.push(Real(0));
  lookup('SIGN').fn(s);
  assert(isReal(s.peek()) && s.peek().value === 0, 'SIGN(0) = 0');
  s.clear();
  s.push(Integer(42));
  lookup('SIGN').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 1n, 'SIGN(Integer(42)) = 1');
  s.clear();
  s.push(Complex(3, 4));
  lookup('SIGN').fn(s);
  const v = s.peek();
  assert(isComplex(v) && Math.abs(v.re - 0.6) < 1e-12 && Math.abs(v.im - 0.8) < 1e-12,
         'SIGN(3+4i) = (0.6, 0.8) unit vector');
}

// MOD — HP50 convention: sign of divisor
{
  const s = new Stack();
  s.pushMany([Real(-7), Real(3)]);
  lookup('MOD').fn(s);
  assert(isReal(s.peek()) && s.peek().value === 2, '-7 3 MOD = 2 (sign of divisor)');
  s.clear();
  s.pushMany([Real(7), Real(-3)]);
  lookup('MOD').fn(s);
  assert(isReal(s.peek()) && s.peek().value === -2, '7 -3 MOD = -2 (sign of divisor)');
  s.clear();
  s.pushMany([Integer(-7), Integer(3)]);
  lookup('MOD').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 2n,
         'Integer -7 3 MOD = Integer 2 (integer-preserving)');
  s.clear();
  s.pushMany([Real(10), Real(0)]);
  let threw = false;
  try { lookup('MOD').fn(s); } catch (_) { threw = true; }
  assert(threw, 'MOD by 0 throws "Infinite result"');
}

// MIN / MAX
{
  const s = new Stack();
  s.pushMany([Real(5), Real(9)]);
  lookup('MIN').fn(s);
  assert(s.peek().value === 5, 'MIN(5, 9) = 5');
  s.clear();
  s.pushMany([Real(5), Real(9)]);
  lookup('MAX').fn(s);
  assert(s.peek().value === 9, 'MAX(5, 9) = 9');
  s.clear();
  s.pushMany([Integer(5), Integer(9)]);
  lookup('MIN').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 5n,
         'MIN preserves Integer type when both are Integer');
  s.clear();
  s.pushMany([Integer(5), Real(9.5)]);
  lookup('MAX').fn(s);
  assert(isReal(s.peek()) && s.peek().value === 9.5,
         'MAX mixed Integer+Real promotes to Real');
}

// Complex rejected by MOD / MIN / MAX
{
  const s = new Stack();
  s.pushMany([Complex(1, 1), Complex(2, 2)]);
  let threw = false;
  try { lookup('MOD').fn(s); } catch (_) { threw = true; }
  assert(threw, 'MOD rejects complex arguments');
  s.clear();
  s.pushMany([Complex(1, 1), Complex(2, 2)]);
  let threw2 = false;
  try { lookup('MIN').fn(s); } catch (_) { threw2 = true; }
  assert(threw2, 'MIN rejects complex arguments');
}

// ------------------------------------------------------------------
// End session 014 additions
// ------------------------------------------------------------------

/* ==================================================================
   Session 043 — additional stack ops, complex decomposition, real
   decomposition (XPON/MANT), stable log/exp (LNP1/EXPM), rounding
   (RND/TRNC), percent family (%/%T/%CH).
   ================================================================== */

/* ---- DUPN ---- */
{
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2)); s.push(Real(3));
  s.push(Integer(2));
  lookup('DUPN').fn(s);
  assert(s.depth === 5
      && s.peek(5).value === 1 && s.peek(4).value === 2 && s.peek(3).value === 3
      && s.peek(2).value === 2 && s.peek(1).value === 3,
    'session043: 1 2 3 2 DUPN → 1 2 3 2 3');
}
{
  // 0 DUPN is a no-op
  const s = new Stack();
  s.push(Real(7)); s.push(Integer(0));
  lookup('DUPN').fn(s);
  assert(s.depth === 1 && s.peek(1).value === 7,
    'session043: 0 DUPN is a no-op (count consumed, nothing duplicated)');
}
{
  // Negative count rejected
  const s = new Stack();
  s.push(Real(1)); s.push(Integer(-1));
  let threw = false;
  try { lookup('DUPN').fn(s); } catch (e) { threw = /Bad argument value/.test(e.message); }
  assert(threw, 'session043: DUPN with negative count → Bad argument value');
}
{
  // Not enough items for requested count
  const s = new Stack();
  s.push(Real(1)); s.push(Integer(5));
  let threw = false;
  try { lookup('DUPN').fn(s); } catch (e) { threw = /Too few/.test(e.message); }
  assert(threw, 'session043: DUPN where depth < count → Too few arguments');
}

/* ---- DUPDUP ---- */
{
  const s = new Stack();
  s.push(Real(42));
  lookup('DUPDUP').fn(s);
  assert(s.depth === 3 && s.peek(1).value === 42 && s.peek(2).value === 42 && s.peek(3).value === 42,
    'session043: DUPDUP 42 → 42 42 42');
}
{
  const s = new Stack();
  let threw = false;
  try { lookup('DUPDUP').fn(s); } catch (e) { threw = /Too few/.test(e.message); }
  assert(threw, 'session043: DUPDUP on empty stack → Too few arguments');
}

/* ---- NIP ---- */
{
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2)); s.push(Real(3));
  lookup('NIP').fn(s);
  assert(s.depth === 2 && s.peek(1).value === 3 && s.peek(2).value === 1,
    'session043: 1 2 3 NIP → 1 3 (drops former level 2)');
}
{
  const s = new Stack();
  s.push(Real(1));
  let threw = false;
  try { lookup('NIP').fn(s); } catch (e) { threw = /Too few/.test(e.message); }
  assert(threw, 'session043: NIP with depth 1 → Too few arguments');
}

/* ---- PICK3 ---- */
{
  const s = new Stack();
  s.push(Real(10)); s.push(Real(20)); s.push(Real(30));
  lookup('PICK3').fn(s);
  assert(s.depth === 4 && s.peek(1).value === 10,
    'session043: PICK3 ≡ 3 PICK (no explicit arg)');
}

/* ---- ROLL ---- */
{
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2)); s.push(Real(3));
  s.push(Integer(3));
  lookup('ROLL').fn(s);
  assert(s.peek(3).value === 2 && s.peek(2).value === 3 && s.peek(1).value === 1,
    'session043: 1 2 3 3 ROLL → 2 3 1');
}
{
  // 1 ROLL is a no-op
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2)); s.push(Integer(1));
  lookup('ROLL').fn(s);
  assert(s.depth === 2 && s.peek(1).value === 2 && s.peek(2).value === 1,
    'session043: 1 ROLL is a no-op');
}
{
  // 0 ROLL is a no-op (count consumed)
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2)); s.push(Integer(0));
  lookup('ROLL').fn(s);
  assert(s.depth === 2 && s.peek(1).value === 2,
    'session043: 0 ROLL is a no-op');
}
{
  // Too few
  const s = new Stack();
  s.push(Real(1)); s.push(Integer(5));
  let threw = false;
  try { lookup('ROLL').fn(s); } catch (e) { threw = /Too few/.test(e.message); }
  assert(threw, 'session043: ROLL with depth < count → Too few arguments');
}

/* ---- ROLLD ---- */
{
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2)); s.push(Real(3));
  s.push(Integer(3));
  lookup('ROLLD').fn(s);
  // Inverse of ROLL: 3 1 2
  assert(s.peek(3).value === 3 && s.peek(2).value === 1 && s.peek(1).value === 2,
    'session043: 1 2 3 3 ROLLD → 3 1 2');
}
{
  // ROLL then ROLLD round-trip
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2)); s.push(Real(3)); s.push(Real(4));
  s.push(Integer(4));
  lookup('ROLL').fn(s);
  s.push(Integer(4));
  lookup('ROLLD').fn(s);
  assert(s.depth === 4 && s.peek(4).value === 1 && s.peek(3).value === 2
      && s.peek(2).value === 3 && s.peek(1).value === 4,
    'session043: n ROLL then n ROLLD round-trips');
}

/* ---- UNPICK ---- */
{
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2)); s.push(Real(3));
  s.push(Real(99)); s.push(Integer(3));
  lookup('UNPICK').fn(s);
  // Writes 99 at level 3 of remaining stack (1 2 3): now 99 2 3
  assert(s.depth === 3 && s.peek(3).value === 99 && s.peek(2).value === 2 && s.peek(1).value === 3,
    'session043: 1 2 3 99 3 UNPICK → 99 2 3');
}
{
  // UNPICK pairs with PICK
  const s = new Stack();
  s.push(Real(10)); s.push(Real(20)); s.push(Real(30));
  s.push(Integer(2));
  lookup('PICK').fn(s);
  assert(s.peek(1).value === 20, 'session043: PICK setup');
  // Now: 10 20 30 20 — put it back at level 3 (was originally at level 2 after consume)
  s.push(Integer(3));
  lookup('UNPICK').fn(s);
  assert(s.depth === 3 && s.peek(3).value === 20 && s.peek(2).value === 20 && s.peek(1).value === 30,
    'session043: PICK then UNPICK writes the value back');
}
{
  // Bad index
  const s = new Stack();
  s.push(Real(1)); s.push(Real(99)); s.push(Integer(0));
  let threw = false;
  try { lookup('UNPICK').fn(s); } catch (e) { threw = /Bad argument value/.test(e.message); }
  assert(threw, 'session043: UNPICK with level 0 → Bad argument value');
}

/* ---- NDUPN ---- */
{
  const s = new Stack();
  s.push(Real(7)); s.push(Integer(3));
  lookup('NDUPN').fn(s);
  assert(s.depth === 4
      && s.peek(4).value === 7 && s.peek(3).value === 7 && s.peek(2).value === 7
      && s.peek(1).value === 3n,
    'session043: 7 3 NDUPN → 7 7 7 3');
}
{
  const s = new Stack();
  s.push(Real(42)); s.push(Integer(0));
  lookup('NDUPN').fn(s);
  // x 0 NDUPN → 0  (x consumed, 0 pushed back)
  assert(s.depth === 1 && s.peek(1).value === 0n,
    'session043: x 0 NDUPN consumes x and pushes 0');
}

/* ==================================================================
   Complex decomposition: C→R and R→C (and ASCII aliases C->R / R->C)
   ================================================================== */
{
  const s = new Stack();
  s.push(Real(3)); s.push(Real(4));
  lookup('R→C').fn(s);
  assert(s.depth === 1 && isComplex(s.peek(1)) && s.peek(1).re === 3 && s.peek(1).im === 4,
    'session043: 3 4 R→C → (3,4)');
}
{
  // ASCII alias
  const s = new Stack();
  s.push(Integer(5)); s.push(Integer(6));
  lookup('R->C').fn(s);
  assert(isComplex(s.peek(1)) && s.peek(1).re === 5 && s.peek(1).im === 6,
    'session043: ASCII R->C accepts integer components');
}
{
  const s = new Stack();
  s.push(Complex(3, 4));
  lookup('C→R').fn(s);
  assert(s.depth === 2 && isReal(s.peek(2)) && isReal(s.peek(1))
      && s.peek(2).value === 3 && s.peek(1).value === 4,
    'session043: (3,4) C→R → 3 4 (re on L2, im on L1)');
}
{
  // Round-trip
  const s = new Stack();
  s.push(Complex(2.5, -1.5));
  lookup('C→R').fn(s);
  lookup('R→C').fn(s);
  assert(isComplex(s.peek(1)) && s.peek(1).re === 2.5 && s.peek(1).im === -1.5,
    'session043: C→R then R→C round-trip preserves components');
}
{
  // C→R on Real: HP50 permits — pushes value and 0
  const s = new Stack();
  s.push(Real(7));
  lookup('C→R').fn(s);
  assert(s.depth === 2 && s.peek(2).value === 7 && s.peek(1).value === 0,
    'session043: C→R on Real x → x 0');
}
{
  // R→C with bad types
  const s = new Stack();
  s.push(Str('bad')); s.push(Real(3));
  let threw = false;
  try { lookup('R→C').fn(s); } catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session043: R→C with String operand → Bad argument type');
}
{
  // Vector branch: two real vectors → complex vector
  const s = new Stack();
  s.push(Vector([Real(1), Real(2)]));
  s.push(Vector([Real(3), Real(4)]));
  lookup('R→C').fn(s);
  const v = s.peek(1);
  assert(v.type === 'vector' && v.items.length === 2
      && v.items[0].type === 'complex' && v.items[0].re === 1 && v.items[0].im === 3
      && v.items[1].type === 'complex' && v.items[1].re === 2 && v.items[1].im === 4,
    'session043: R→C on two real vectors → complex vector');
}
{
  // Mismatched vector lengths → Invalid dimension
  const s = new Stack();
  s.push(Vector([Real(1), Real(2)]));
  s.push(Vector([Real(3)]));
  let threw = false;
  try { lookup('R→C').fn(s); } catch (e) { threw = /Invalid dimension/.test(e.message); }
  assert(threw, 'session043: R→C on mismatched vectors → Invalid dimension');
}
{
  // C→R on vector of complex → two real vectors
  const s = new Stack();
  s.push(Vector([Complex(1, 2), Complex(3, 4)]));
  lookup('C→R').fn(s);
  assert(s.depth === 2
      && s.peek(2).items[0].value === 1 && s.peek(2).items[1].value === 3
      && s.peek(1).items[0].value === 2 && s.peek(1).items[1].value === 4,
    'session043: C→R on complex vector → real-part vector, imag-part vector');
}

/* ==================================================================
   XPON / MANT — mantissa/exponent decomposition of Reals
   ================================================================== */
{
  const s = new Stack();
  s.push(Real(1234.5));
  lookup('XPON').fn(s);
  assert(isReal(s.peek(1)) && s.peek(1).value === 3,
    'session043: XPON 1234.5 → 3');
}
{
  const s = new Stack();
  s.push(Real(1234.5));
  lookup('MANT').fn(s);
  assert(Math.abs(s.peek(1).value - 1.2345) < 1e-12,
    'session043: MANT 1234.5 → 1.2345');
}
{
  const s = new Stack();
  s.push(Real(0));
  lookup('XPON').fn(s);
  assert(s.peek(1).value === 0, 'session043: XPON 0 → 0');
  s.clear();
  s.push(Real(0));
  lookup('MANT').fn(s);
  assert(s.peek(1).value === 0, 'session043: MANT 0 → 0');
}
{
  const s = new Stack();
  s.push(Real(-0.05));
  lookup('XPON').fn(s);
  assert(s.peek(1).value === -2, 'session043: XPON -0.05 → -2');
  s.clear();
  s.push(Real(-0.05));
  lookup('MANT').fn(s);
  assert(Math.abs(s.peek(1).value - (-5)) < 1e-12,
    'session043: MANT -0.05 → -5 (negative mantissa for negative input)');
}
{
  // Integer input → coerces to real
  const s = new Stack();
  s.push(Integer(500n));
  lookup('XPON').fn(s);
  assert(s.peek(1).value === 2, 'session043: XPON Integer 500 → 2');
}
{
  // Bad type
  const s = new Stack();
  s.push(Str('nope'));
  let threw = false;
  try { lookup('XPON').fn(s); } catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session043: XPON on String → Bad argument type');
}

/* ==================================================================
   LNP1 / EXPM — numerically stable log1p / expm1
   ================================================================== */
{
  const s = new Stack();
  s.push(Real(1e-20));
  lookup('LNP1').fn(s);
  // Plain LN(1+1e-20) loses all digits; log1p gives the true value.
  assert(Math.abs(s.peek(1).value - 1e-20) < 1e-30,
    'session043: LNP1 1e-20 is exact (log1p precision)');
}
{
  const s = new Stack();
  s.push(Real(0));
  lookup('LNP1').fn(s);
  assert(s.peek(1).value === 0, 'session043: LNP1 0 → 0');
}
{
  // Domain boundary x <= -1 → Infinite result
  const s = new Stack();
  s.push(Real(-1));
  let threw = false;
  try { lookup('LNP1').fn(s); } catch (e) { threw = /Infinite result/.test(e.message); }
  assert(threw, 'session043: LNP1 -1 → Infinite result');
}
{
  const s = new Stack();
  s.push(Real(1e-20));
  lookup('EXPM').fn(s);
  assert(Math.abs(s.peek(1).value - 1e-20) < 1e-30,
    'session043: EXPM 1e-20 is exact (expm1 precision)');
}
{
  const s = new Stack();
  s.push(Real(0));
  lookup('EXPM').fn(s);
  assert(s.peek(1).value === 0, 'session043: EXPM 0 → 0');
}
{
  // Inverse pairing: LNP1 ∘ EXPM ≈ identity near 0
  const s = new Stack();
  s.push(Real(0.25));
  lookup('EXPM').fn(s);
  lookup('LNP1').fn(s);
  assert(Math.abs(s.peek(1).value - 0.25) < 1e-15,
    'session043: EXPM then LNP1 round-trips 0.25');
}

/* ==================================================================
   RND / TRNC — round and truncate
   ================================================================== */
{
  const s = new Stack();
  s.push(Real(3.14159)); s.push(Integer(2));
  lookup('RND').fn(s);
  assert(Math.abs(s.peek(1).value - 3.14) < 1e-12,
    'session043: 3.14159 2 RND → 3.14');
}
{
  // Half-away-from-zero
  const s = new Stack();
  s.push(Real(2.5)); s.push(Integer(0));
  lookup('RND').fn(s);
  assert(s.peek(1).value === 3, 'session043: 2.5 0 RND → 3 (half-away-from-zero)');
  s.clear();
  s.push(Real(-2.5)); s.push(Integer(0));
  lookup('RND').fn(s);
  assert(s.peek(1).value === -3, 'session043: -2.5 0 RND → -3');
}
{
  const s = new Stack();
  s.push(Real(3.19)); s.push(Integer(1));
  lookup('TRNC').fn(s);
  assert(Math.abs(s.peek(1).value - 3.1) < 1e-12,
    'session043: 3.19 1 TRNC → 3.1');
  s.clear();
  s.push(Real(-3.19)); s.push(Integer(1));
  lookup('TRNC').fn(s);
  assert(Math.abs(s.peek(1).value - (-3.1)) < 1e-12,
    'session043: -3.19 1 TRNC → -3.1 (toward zero)');
}
{
  // Significant-figure rounding (negative count)
  const s = new Stack();
  s.push(Real(12345)); s.push(Integer(-3));
  lookup('RND').fn(s);
  // 3 sig figs of 12345 → 12300
  assert(s.peek(1).value === 12300, 'session043: 12345 -3 RND → 12300 (3 sig figs)');
}
{
  // Complex input rounds each component
  const s = new Stack();
  s.push(Complex(3.14159, 2.71828)); s.push(Integer(2));
  lookup('RND').fn(s);
  const v = s.peek(1);
  assert(isComplex(v) && Math.abs(v.re - 3.14) < 1e-12 && Math.abs(v.im - 2.72) < 1e-12,
    'session043: RND on Complex rounds each component');
}
{
  // Out-of-range precision throws
  const s = new Stack();
  s.push(Real(3.14)); s.push(Integer(20));
  let threw = false;
  try { lookup('RND').fn(s); } catch (e) { threw = /Bad argument value/.test(e.message); }
  assert(threw, 'session043: RND with precision > 11 → Bad argument value');
}
{
  // Integer input with non-negative places returns the Integer unchanged
  const s = new Stack();
  s.push(Integer(42n)); s.push(Integer(3));
  lookup('RND').fn(s);
  assert(isInteger(s.peek(1)) && s.peek(1).value === 42n,
    'session043: Integer 42 3 RND → Integer 42 (no change)');
}

/* ==================================================================
   %, %T, %CH — percent family
   ================================================================== */
{
  const s = new Stack();
  s.push(Real(200)); s.push(Real(10));
  lookup('%').fn(s);
  assert(s.peek(1).value === 20, 'session043: 200 10 % → 20 (10% of 200)');
}
{
  // Integer/Real mix still works
  const s = new Stack();
  s.push(Integer(50)); s.push(Real(25));
  lookup('%').fn(s);
  assert(s.peek(1).value === 12.5, 'session043: 50 25 % → 12.5 (mixed)');
}
{
  const s = new Stack();
  s.push(Real(50)); s.push(Real(20));
  lookup('%T').fn(s);
  assert(s.peek(1).value === 40, 'session043: 50 20 %T → 40 (20 is 40% of 50)');
}
{
  const s = new Stack();
  s.push(Real(100)); s.push(Real(125));
  lookup('%CH').fn(s);
  assert(s.peek(1).value === 25, 'session043: 100 125 %CH → 25 (25% increase)');
}
{
  // Decrease
  const s = new Stack();
  s.push(Real(100)); s.push(Real(75));
  lookup('%CH').fn(s);
  assert(s.peek(1).value === -25, 'session043: 100 75 %CH → -25 (25% decrease)');
}
{
  // Division by zero in %T
  const s = new Stack();
  s.push(Real(0)); s.push(Real(10));
  let threw = false;
  try { lookup('%T').fn(s); } catch (e) { threw = /Infinite result/.test(e.message); }
  assert(threw, 'session043: 0 10 %T → Infinite result');
}
{
  // Division by zero in %CH
  const s = new Stack();
  s.push(Real(0)); s.push(Real(10));
  let threw = false;
  try { lookup('%CH').fn(s); } catch (e) { threw = /Infinite result/.test(e.message); }
  assert(threw, 'session043: 0 10 %CH → Infinite result');
}
{
  // Symbolic operand lifts
  const s = new Stack();
  s.push(Real(100)); s.push(Name('x', { quoted: true }));
  lookup('%').fn(s);
  assert(s.peek(1).type === 'symbolic', 'session043: 100 \'x\' % → Symbolic');
}

// ------------------------------------------------------------------
// End session 043 additions
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Session 044: MAXR / MINR constants and HMS family
// ------------------------------------------------------------------

// MAXR: largest finite Real
{
  const s = new Stack();
  lookup('MAXR').fn(s);
  assert(isReal(s.peek()) && s.peek().value === Number.MAX_VALUE,
         'session044: MAXR pushes Number.MAX_VALUE');
}

// MINR: smallest positive Real
{
  const s = new Stack();
  lookup('MINR').fn(s);
  assert(isReal(s.peek()) && s.peek().value === Number.MIN_VALUE,
         'session044: MINR pushes Number.MIN_VALUE');
}

// MAXR takes no arguments — depth grows by 1
{
  const s = new Stack();
  s.push(Real(42));
  lookup('MAXR').fn(s);
  assert(s.depth === 2, 'session044: MAXR does not pop');
}

// ------------------ HMS family ------------------

// →HMS of 2.5 hours is 2 h 30 min 0 s → 2.3 exactly
{
  const s = new Stack();
  s.push(Real(2.5));
  lookup('→HMS').fn(s);
  const r = s.peek().value;
  assert(Math.abs(r - 2.3) < 1e-12,
         `session044: 2.5 →HMS → 2.3 (got ${r})`);
}

// →HMS of 1.75 hours is 1 h 45 min 0 s → 1.45
{
  const s = new Stack();
  s.push(Real(1.75));
  lookup('→HMS').fn(s);
  const r = s.peek().value;
  assert(Math.abs(r - 1.45) < 1e-12,
         `session044: 1.75 →HMS → 1.45 (got ${r})`);
}

// HMS→ of 2.3 → 2.5
{
  const s = new Stack();
  s.push(Real(2.3));
  lookup('HMS→').fn(s);
  const r = s.peek().value;
  assert(Math.abs(r - 2.5) < 1e-9,
         `session044: 2.3 HMS→ → 2.5 (got ${r})`);
}

// Round-trip: x →HMS HMS→ ≈ x
{
  const s = new Stack();
  s.push(Real(3.14159265));
  lookup('→HMS').fn(s);
  lookup('HMS→').fn(s);
  const r = s.peek().value;
  assert(Math.abs(r - 3.14159265) < 1e-9,
         `session044: 3.14159265 →HMS HMS→ round-trip (got ${r})`);
}

// Negative hours: sign applies to the whole value
{
  const s = new Stack();
  s.push(Real(-1.5));
  lookup('→HMS').fn(s);
  const r = s.peek().value;
  assert(Math.abs(r - (-1.30)) < 1e-10,
         `session044: -1.5 →HMS → -1.30 (got ${r})`);
}

// HMS+: 1h 45m + 1h 30m = 3h 15m → 3.15 exactly
{
  const s = new Stack();
  s.push(Real(1.45));
  s.push(Real(1.30));
  lookup('HMS+').fn(s);
  const r = s.peek().value;
  assert(Math.abs(r - 3.15) < 1e-9,
         `session044: 1.45 1.30 HMS+ → 3.15 (got ${r})`);
}

// HMS-: 3h 15m - 1h 30m = 1h 45m → 1.45 exactly
{
  const s = new Stack();
  s.push(Real(3.15));
  s.push(Real(1.30));
  lookup('HMS-').fn(s);
  const r = s.peek().value;
  assert(Math.abs(r - 1.45) < 1e-9,
         `session044: 3.15 1.30 HMS- → 1.45 (got ${r})`);
}

// HMS+ carries minutes and seconds correctly: 0.3030 + 0.3030 = 1.0100
{
  const s = new Stack();
  s.push(Real(0.3030));
  s.push(Real(0.3030));
  lookup('HMS+').fn(s);
  const r = s.peek().value;
  assert(Math.abs(r - 1.0100) < 1e-9,
         `session044: 0.3030 0.3030 HMS+ → 1.01 (got ${r})`);
}

// HMS→ rejects minutes ≥ 60 as bad argument value
{
  const s = new Stack();
  s.push(Real(1.60));   // not a valid HMS (60 minutes)
  let threw = false;
  try { lookup('HMS→').fn(s); } catch (e) { threw = /Bad argument value/.test(e.message); }
  assert(threw, 'session044: 1.60 HMS→ throws Bad argument value');
}

// ASCII aliases work
{
  const s = new Stack();
  s.push(Real(2.5));
  lookup('->HMS').fn(s);
  assert(Math.abs(s.peek().value - 2.3) < 1e-12,
         'session044: ->HMS ASCII alias of →HMS');
}
{
  const s = new Stack();
  s.push(Real(2.3));
  lookup('HMS->').fn(s);
  assert(Math.abs(s.peek().value - 2.5) < 1e-9,
         'session044: HMS-> ASCII alias of HMS→');
}

// Integer input coerces through toRealOrThrow
{
  const s = new Stack();
  s.push(Integer(3n));
  lookup('→HMS').fn(s);
  assert(Math.abs(s.peek().value - 3.0) < 1e-12,
         'session044: 3 (Integer) →HMS → 3.0');
}

// Complex input rejected
{
  const s = new Stack();
  s.push(Complex(1, 2));
  let threw = false;
  try { lookup('→HMS').fn(s); } catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session044: (1,2) →HMS throws Bad argument type');
}

// ------------------------------------------------------------------
// End session 044 additions
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Session 045: Complex-aware unary math
// ------------------------------------------------------------------
//
// Previously EXP / LN / LOG / ALOG / SIN / COS / TAN / ASIN / ACOS /
// ATAN / SINH / COSH / TANH / ASINH / ACOSH / ATANH rejected Complex
// inputs via toRealOrThrow (threw 'Bad argument type').  Session 045
// adds principal-branch complex formulas to all of them so HP50-style
// complex workflows work.  Real inputs still go through the original
// real-only paths unchanged.
// ------------------------------------------------------------------

const _CX_EPS = 1e-10;
function _cxApprox(got, re, im, label) {
  const ok = got && got.type === 'complex' &&
    Math.abs(got.re - re) < _CX_EPS && Math.abs(got.im - im) < _CX_EPS;
  assert(ok, `${label} (got re=${got?.re} im=${got?.im})`);
}

// EXP on Complex: exp(iπ) = -1 + 0i (Euler's identity)
{
  const s = new Stack();
  s.push(Complex(0, Math.PI));
  lookup('EXP').fn(s);
  _cxApprox(s.peek(), -1, 0, 'session045: EXP(iπ) = -1 + 0i');
}

// EXP on Complex: exp(iπ/2) = 0 + 1i
{
  const s = new Stack();
  s.push(Complex(0, Math.PI / 2));
  lookup('EXP').fn(s);
  _cxApprox(s.peek(), 0, 1, 'session045: EXP(iπ/2) = 0 + 1i');
}

// LN on Complex: ln(-1) = 0 + iπ (principal branch)
{
  const s = new Stack();
  s.push(Complex(-1, 0));
  lookup('LN').fn(s);
  _cxApprox(s.peek(), 0, Math.PI, 'session045: LN(-1) = 0 + iπ');
}

// LN round-trip: ln(exp(z)) = z for small z
{
  const s = new Stack();
  s.push(Complex(0.5, 0.7));
  lookup('EXP').fn(s);
  lookup('LN').fn(s);
  _cxApprox(s.peek(), 0.5, 0.7, 'session045: LN(EXP((0.5, 0.7))) round-trips');
}

// LOG on Complex: log10(100) on Complex input = 2 + 0i
{
  const s = new Stack();
  s.push(Complex(100, 0));
  lookup('LOG').fn(s);
  _cxApprox(s.peek(), 2, 0, 'session045: LOG((100, 0)) = 2 + 0i');
}

// ALOG on Complex: alog(z) = 10^z; ALOG(0, 0) = 1 + 0i
{
  const s = new Stack();
  s.push(Complex(0, 0));
  lookup('ALOG').fn(s);
  _cxApprox(s.peek(), 1, 0, 'session045: ALOG((0, 0)) = 1 + 0i');
}

// ALOG on Complex: ALOG(2, 0) = 100 + 0i
{
  const s = new Stack();
  s.push(Complex(2, 0));
  lookup('ALOG').fn(s);
  _cxApprox(s.peek(), 100, 0, 'session045: ALOG((2, 0)) = 100 + 0i');
}

// SINH on Complex: sinh(iπ/2) = 0 + 1i (identity: sinh(ix) = i sin(x))
{
  const s = new Stack();
  s.push(Complex(0, Math.PI / 2));
  lookup('SINH').fn(s);
  _cxApprox(s.peek(), 0, 1, 'session045: SINH(iπ/2) = 0 + 1i');
}

// COSH on Complex: cosh(iπ) = -1 + 0i
{
  const s = new Stack();
  s.push(Complex(0, Math.PI));
  lookup('COSH').fn(s);
  _cxApprox(s.peek(), -1, 0, 'session045: COSH(iπ) = -1 + 0i');
}

// TANH on Complex: tanh(0 + iπ/4) = 0 + 1i
{
  const s = new Stack();
  s.push(Complex(0, Math.PI / 4));
  lookup('TANH').fn(s);
  _cxApprox(s.peek(), 0, 1, 'session045: TANH(iπ/4) = 0 + 1i');
}

// SIN on Complex (rad): sin(0 + 1i) = 0 + sinh(1)i
{
  setAngle('rad');
  const s = new Stack();
  s.push(Complex(0, 1));
  lookup('SIN').fn(s);
  _cxApprox(s.peek(), 0, Math.sinh(1), 'session045: SIN(0 + i) = 0 + sinh(1)i');
}

// COS on Complex (rad): cos(0 + 1i) = cosh(1) + 0i
{
  setAngle('rad');
  const s = new Stack();
  s.push(Complex(0, 1));
  lookup('COS').fn(s);
  _cxApprox(s.peek(), Math.cosh(1), 0, 'session045: COS(0 + i) = cosh(1) + 0i');
}

// TAN on Complex: tan(π/4 + 0i) = 1 + 0i (identity: tan(x) for real x
// embedded as Complex should match the real result).  In rad mode.
{
  setAngle('rad');
  const s = new Stack();
  s.push(Complex(Math.PI / 4, 0));
  lookup('TAN').fn(s);
  _cxApprox(s.peek(), 1, 0, 'session045: TAN(π/4 + 0i) = 1 + 0i');
}

// ASIN on Complex: asin(0, 1) = 0 + ln(1 + sqrt(2))i ≈ (0, 0.8814…)
{
  setAngle('rad');
  const s = new Stack();
  s.push(Complex(0, 1));
  lookup('ASIN').fn(s);
  _cxApprox(s.peek(), 0, Math.log(1 + Math.sqrt(2)),
    'session045: ASIN(0 + i) = 0 + ln(1+√2)i');
}

// ACOS on Complex: acos(0, 0) = π/2 + 0i
{
  setAngle('rad');
  const s = new Stack();
  s.push(Complex(0, 0));
  lookup('ACOS').fn(s);
  _cxApprox(s.peek(), Math.PI / 2, 0,
    'session045: ACOS((0, 0)) = π/2 + 0i');
}

// ATAN on Complex: atan(1, 0) = π/4 + 0i  (rad)
{
  setAngle('rad');
  const s = new Stack();
  s.push(Complex(1, 0));
  lookup('ATAN').fn(s);
  _cxApprox(s.peek(), Math.PI / 4, 0,
    'session045: ATAN(1 + 0i) = π/4 + 0i');
}

// ATANH on Complex: atanh(0, 1) = 0 + π/4 i  (standard identity)
{
  const s = new Stack();
  s.push(Complex(0, 1));
  lookup('ATANH').fn(s);
  _cxApprox(s.peek(), 0, Math.PI / 4,
    'session045: ATANH(0 + i) = 0 + π/4 i');
}

// ASINH on Complex: asinh(0, 1) = 0 + π/2 i
{
  const s = new Stack();
  s.push(Complex(0, 1));
  lookup('ASINH').fn(s);
  _cxApprox(s.peek(), 0, Math.PI / 2,
    'session045: ASINH(0 + i) = 0 + π/2 i');
}

// ACOSH of real x < 1 now lifts to Complex (covered in test-entry.mjs
// too — keep one assertion here for locality): ACOSH(-1) = 0 + πi
{
  const s = new Stack();
  s.push(Real(-1));
  lookup('ACOSH').fn(s);
  _cxApprox(s.peek(), 0, Math.PI,
    'session045: ACOSH(-1) = 0 + πi (real < 1 lifts to Complex)');
}

// ATANH of real |x| > 1 now lifts to Complex: ATANH(2) = ln(3)/2 + i*(-π/2)
// (the principal branch lands on the negative-imaginary side via atan2 for
// the (1-z)=(-1, 0) piece)
{
  const s = new Stack();
  s.push(Real(2));
  lookup('ATANH').fn(s);
  const r = s.peek();
  assert(r && r.type === 'complex' &&
         Math.abs(r.re - 0.5 * Math.log(3)) < _CX_EPS &&
         Math.abs(Math.abs(r.im) - Math.PI / 2) < _CX_EPS,
         'session045: ATANH(2) principal → (ln(3)/2, ±π/2)');
}

// LN of (0, 0) throws (Infinite result)
{
  const s = new Stack();
  s.push(Complex(0, 0));
  let threw = false;
  try { lookup('LN').fn(s); } catch (e) { threw = /Infinite result/.test(e.message); }
  assert(threw, 'session045: LN((0, 0)) throws Infinite result');
}

// Symbolic operand still lifts (not touched by Complex branch)
{
  const s = new Stack();
  s.push(Name('X', { quoted: true }));
  lookup('EXP').fn(s);
  assert(s.peek().type === 'symbolic',
         'session045: EXP on quoted Name still lifts to Symbolic');
}

// Reset angle mode to default
setAngle('rad');

// ------------------------------------------------------------------
// End session 045 additions (Complex-aware unary math)
// ------------------------------------------------------------------

// ==================================================================
// Session 047 — factorial `!` bang, →Q rationalize
// ==================================================================

/* ---- `!` as FACT alias — Integer input stays exact ---- */
{
  const s = new Stack();
  s.push(Integer(5));
  lookup('!').fn(s);
  assert(s.peek().value === 120n,
    'session047: 5 ! → Integer(120) (FACT alias)');
}

/* ---- `!` on 0 returns 1 ---- */
{
  const s = new Stack();
  s.push(Integer(0));
  lookup('!').fn(s);
  assert(s.peek().value === 1n,
    'session047: 0 ! → 1 (0! definition)');
}

/* ---- `!` on a non-integer Real goes through gamma ---- */
{
  const s = new Stack();
  s.push(Real(0.5));
  lookup('!').fn(s);
  const v = s.peek();
  // Γ(1.5) = (√π)/2 ≈ 0.886226925
  assert(isReal(v) && Math.abs(v.value - 0.8862269254527) < 1e-10,
    'session047: 0.5 ! → Γ(1.5) ≈ √π/2');
}

/* ---- `!` on negative integer throws ---- */
{
  const s = new Stack();
  s.push(Integer(-3));
  let threw = false;
  try { lookup('!').fn(s); } catch (_e) { threw = true; }
  assert(threw, 'session047: -3 ! throws Bad argument value');
}

/* ---- `!` parses from an entry buffer as an ident ---- */
{
  const vals = parseEntry('5 !');
  const s = new Stack();
  for (const v of vals) {
    if (v?.type === 'name' && !v.quoted) {
      const op = lookup(v.id);
      if (op) { op.fn(s); continue; }
    }
    s.push(v);
  }
  assert(s.peek().value === 120n,
    'session047: "5 !" via parseEntry → 120 (tokeniser splits 5 and !)');
}

/* ---- →Q on 0.5 → Symbolic 1/2 ---- */
{
  const s = new Stack();
  s.push(Real(0.5));
  lookup('→Q').fn(s);
  const sym = s.peek();
  assert(sym && sym.type === 'symbolic', '→Q produces Symbolic');
  const ast = sym.expr;
  assert(ast.kind === 'bin' && ast.op === '/'
      && ast.l.kind === 'num' && ast.l.value === 1
      && ast.r.kind === 'num' && ast.r.value === 2,
    'session047: 0.5 →Q → Sym(1/2)');
}

/* ---- →Q on 0.333333333333 → Symbolic 1/3 ---- */
{
  const s = new Stack();
  s.push(Real(1 / 3));
  lookup('→Q').fn(s);
  const ast = s.peek().expr;
  assert(ast.kind === 'bin' && ast.op === '/'
      && ast.l.value === 1 && ast.r.value === 3,
    'session047: (1/3 as Real) →Q → Sym(1/3) via continued fraction');
}

/* ---- →Q on a negative: -3/4 → Neg(3/4) ---- */
{
  const s = new Stack();
  s.push(Real(-0.75));
  lookup('→Q').fn(s);
  const ast = s.peek().expr;
  assert(ast.kind === 'neg' && ast.arg.kind === 'bin' && ast.arg.op === '/'
      && ast.arg.l.value === 3 && ast.arg.r.value === 4,
    'session047: -0.75 →Q → Neg(3/4)');
}

/* ---- →Q on an integer-valued Real: 5.0 → Sym(5), no /1 ---- */
{
  const s = new Stack();
  s.push(Real(5));
  lookup('→Q').fn(s);
  const ast = s.peek().expr;
  assert(ast.kind === 'num' && ast.value === 5,
    'session047: 5.0 →Q → Sym(5)  (no /1 denominator)');
}

/* ---- →Q on zero: 0 → Sym(0) ---- */
{
  const s = new Stack();
  s.push(Real(0));
  lookup('→Q').fn(s);
  const ast = s.peek().expr;
  assert(ast.kind === 'num' && ast.value === 0,
    'session047: 0 →Q → Sym(0)');
}

/* ---- →Q on an Integer: passes through as Sym(n) ---- */
{
  const s = new Stack();
  s.push(Integer(42));
  lookup('→Q').fn(s);
  const ast = s.peek().expr;
  assert(ast.kind === 'num' && ast.value === 42,
    'session047: Integer 42 →Q → Sym(42)');
}

/* ---- →Q on Complex throws ---- */
{
  const s = new Stack();
  s.push(Complex(1, 2));
  let threw = false;
  try { lookup('→Q').fn(s); } catch (_e) { threw = true; }
  assert(threw, 'session047: Complex →Q throws Bad argument type');
}

/* ---- ->Q ASCII alias ---- */
{
  const s = new Stack();
  s.push(Real(0.25));
  lookup('->Q').fn(s);
  const ast = s.peek().expr;
  assert(ast.kind === 'bin' && ast.l.value === 1 && ast.r.value === 4,
    'session047: ->Q ASCII alias works (0.25 → 1/4)');
}

// ------------------------------------------------------------------
// End session 047 additions (factorial `!`, →Q rationalize)
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Session 048 — Q→ decompose, D→HMS / HMS→D bridges
// ------------------------------------------------------------------

/* ---- Q→ on Symbolic 1/2 → ( 1 2 ) ---- */
{
  const s = new Stack();
  s.push(Real(0.5));
  lookup('→Q').fn(s);      // push Sym(1/2)
  lookup('Q→').fn(s);      // decompose
  assert(s.depth === 2, 'session048: Q→ of Sym(1/2) pushes 2 items');
  const d = s.pop();
  const n = s.pop();
  assert(isInteger(n) && n.value === 1n, 'session048: Q→ of 1/2 numerator=1');
  assert(isInteger(d) && d.value === 2n, 'session048: Q→ of 1/2 denom=2');
}

/* ---- Q→ on Symbolic 3/4 constructed directly ---- */
{
  const s = new Stack();
  s.push(Real(0.75));
  lookup('→Q').fn(s);      // push Sym(3/4)
  lookup('Q→').fn(s);
  const d = s.pop();
  const n = s.pop();
  assert(isInteger(n) && n.value === 3n && isInteger(d) && d.value === 4n,
    'session048: Q→ of 3/4 → ( 3 4 )');
}

/* ---- Q→ on a negative Symbolic: -(3/4) → ( -3 4 ) ---- */
{
  const s = new Stack();
  s.push(Real(-0.75));
  lookup('→Q').fn(s);      // push Sym(Neg(3/4))
  lookup('Q→').fn(s);
  const d = s.pop();
  const n = s.pop();
  assert(isInteger(n) && n.value === -3n && isInteger(d) && d.value === 4n,
    'session048: Q→ of Neg(3/4) → ( -3 4 )');
}

/* ---- Q→ on an integer Symbolic: Sym(5) → ( 5 1 ) ---- */
{
  const s = new Stack();
  s.push(Real(5));
  lookup('→Q').fn(s);      // push Sym(5)
  lookup('Q→').fn(s);
  const d = s.pop();
  const n = s.pop();
  assert(isInteger(n) && n.value === 5n && isInteger(d) && d.value === 1n,
    'session048: Q→ of Sym(5) → ( 5 1 ) (integer-over-one convention)');
}

/* ---- Q→ on zero ---- */
{
  const s = new Stack();
  s.push(Real(0));
  lookup('→Q').fn(s);
  lookup('Q→').fn(s);
  const d = s.pop();
  const n = s.pop();
  assert(isInteger(n) && n.value === 0n && isInteger(d) && d.value === 1n,
    'session048: Q→ of Sym(0) → ( 0 1 )');
}

/* ---- Q→ on a bare Integer (convenience passthrough) ---- */
{
  const s = new Stack();
  s.push(Integer(42));
  lookup('Q→').fn(s);
  const d = s.pop();
  const n = s.pop();
  assert(isInteger(n) && n.value === 42n && isInteger(d) && d.value === 1n,
    'session048: Q→ of Integer(42) → ( 42 1 )');
}

/* ---- Q→ on a bare Real with integer value ---- */
{
  const s = new Stack();
  s.push(Real(7));
  lookup('Q→').fn(s);
  const d = s.pop();
  const n = s.pop();
  assert(isInteger(n) && n.value === 7n && isInteger(d) && d.value === 1n,
    'session048: Q→ of Real(7) → ( 7 1 )');
}

/* ---- Q→ on a non-integer Real throws ---- */
{
  const s = new Stack();
  s.push(Real(3.14));
  let threw = false;
  try { lookup('Q→').fn(s); } catch (_e) { threw = true; }
  assert(threw, 'session048: Q→ of non-integer Real throws Bad argument value');
}

/* ---- Q→ on wrong Symbolic shape (SIN(x)) throws ---- */
{
  const s = new Stack();
  // Manually build a Symbolic that's not a rational.
  // Import AST ctors via algebra.js
}
{
  // Import and test via a wrong-shape path:
  const { Fn } = await import('../src/rpl/algebra.js');
  const { Symbolic } = await import('../src/rpl/types.js');
  const s = new Stack();
  s.push(Symbolic(Fn('SIN', [{ kind: 'var', name: 'X' }])));
  let threw = false;
  try { lookup('Q→').fn(s); } catch (_e) { threw = true; }
  assert(threw, 'session048: Q→ of SIN(X) throws Bad argument type');
}

/* ---- Q→ on Complex throws ---- */
{
  const s = new Stack();
  s.push(Complex(1, 2));
  let threw = false;
  try { lookup('Q→').fn(s); } catch (_e) { threw = true; }
  assert(threw, 'session048: Q→ of Complex throws Bad argument type');
}

/* ---- Q-> ASCII alias ---- */
{
  const s = new Stack();
  s.push(Real(0.25));
  lookup('→Q').fn(s);
  lookup('Q->').fn(s);
  const d = s.pop();
  const n = s.pop();
  assert(isInteger(n) && n.value === 1n && isInteger(d) && d.value === 4n,
    'session048: Q-> ASCII alias works (0.25 round-trip → 1 4)');
}

/* ---- Round-trip: x →Q Q→ → (n d) where x == n/d ---- */
{
  const s = new Stack();
  s.push(Real(0.125));
  lookup('→Q').fn(s);
  lookup('Q→').fn(s);
  const d = Number(s.pop().value);
  const n = Number(s.pop().value);
  assert(n === 1 && d === 8, 'session048: 0.125 →Q Q→ → ( 1 8 )');
}

/* ---- D→HMS — decimal-degree → DD.MMSS ---- */
{
  const s = new Stack();
  s.push(Real(1.5));         // 1°30'00"
  lookup('D→HMS').fn(s);
  const v = s.peek();
  assert(isReal(v) && Math.abs(v.value - 1.3) < 1e-9,
    'session048: D→HMS 1.5 → 1.3 (1°30\')');
}

/* ---- HMS→D — DD.MMSS → decimal-degree ---- */
{
  const s = new Stack();
  s.push(Real(1.3));         // 1°30'00"
  lookup('HMS→D').fn(s);
  const v = s.peek();
  assert(isReal(v) && Math.abs(v.value - 1.5) < 1e-9,
    'session048: HMS→D 1.3 → 1.5');
}

/* ---- D→HMS on a degree with arcseconds ---- */
{
  const s = new Stack();
  s.push(Real(10.25));       // 10°15'00"
  lookup('D→HMS').fn(s);
  const v = s.peek();
  assert(isReal(v) && Math.abs(v.value - 10.15) < 1e-9,
    'session048: D→HMS 10.25 → 10.15');
}

/* ---- HMS→D on 10.3015 → 10.5041666… (10°30'15") ---- */
{
  const s = new Stack();
  s.push(Real(10.3015));     // 10°30'15"
  lookup('HMS→D').fn(s);
  const v = s.peek();
  const expected = 10 + 30 / 60 + 15 / 3600;
  assert(isReal(v) && Math.abs(v.value - expected) < 1e-9,
    'session048: HMS→D 10.3015 → 10°30\'15" decimal');
}

/* ---- D→HMS / HMS→D round trip on random value ---- */
{
  const s = new Stack();
  s.push(Real(5.375));
  lookup('D→HMS').fn(s);
  lookup('HMS→D').fn(s);
  const v = s.peek();
  assert(isReal(v) && Math.abs(v.value - 5.375) < 1e-9,
    'session048: D→HMS HMS→D round-trip preserves value');
}

/* ---- ASCII aliases D->HMS / HMS->D ---- */
{
  const s = new Stack();
  s.push(Real(1.5));
  lookup('D->HMS').fn(s);
  assert(Math.abs(s.peek().value - 1.3) < 1e-9,
    'session048: D->HMS ASCII alias');
}
{
  const s = new Stack();
  s.push(Real(1.3));
  lookup('HMS->D').fn(s);
  assert(Math.abs(s.peek().value - 1.5) < 1e-9,
    'session048: HMS->D ASCII alias');
}

/* ---- D→HMS rejects Complex ---- */
{
  const s = new Stack();
  s.push(Complex(1, 2));
  let threw = false;
  try { lookup('D→HMS').fn(s); } catch (_e) { threw = true; }
  assert(threw, 'session048: D→HMS on Complex throws');
}

// ------------------------------------------------------------------
// End session 048 additions (Q→, D→HMS / HMS→D)
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Session 052 — →Qπ / ->Qπ: rationalize as rational multiple of π
// ------------------------------------------------------------------

/* ---- →Qπ on π itself → Sym(PI) ---- */
{
  const s = new Stack();
  s.push(Real(Math.PI));
  lookup('→Qπ').fn(s);
  const sym = s.peek();
  assert(sym && sym.type === 'symbolic',
    'session052: →Qπ produces Symbolic');
  assert(sym.expr.kind === 'var' && sym.expr.name === 'PI',
    'session052: π →Qπ → Sym(PI)');
}

/* ---- →Qπ on π/2 → Sym(PI/2) ---- */
{
  const s = new Stack();
  s.push(Real(Math.PI / 2));
  lookup('→Qπ').fn(s);
  const ast = s.peek().expr;
  // Expect: PI / 2
  assert(ast.kind === 'bin' && ast.op === '/'
      && ast.l.kind === 'var' && ast.l.name === 'PI'
      && ast.r.kind === 'num' && ast.r.value === 2,
    'session052: π/2 →Qπ → Sym(PI / 2)');
}

/* ---- →Qπ on 3π/4 → Sym((3 * PI) / 4) ---- */
{
  const s = new Stack();
  s.push(Real(3 * Math.PI / 4));
  lookup('→Qπ').fn(s);
  const ast = s.peek().expr;
  assert(ast.kind === 'bin' && ast.op === '/'
      && ast.r.kind === 'num' && ast.r.value === 4,
    'session052: 3π/4 →Qπ denominator is 4');
  assert(ast.l.kind === 'bin' && ast.l.op === '*'
      && ast.l.l.kind === 'num' && ast.l.l.value === 3
      && ast.l.r.kind === 'var' && ast.l.r.name === 'PI',
    'session052: 3π/4 →Qπ numerator is 3 * PI');
}

/* ---- →Qπ on 2π → Sym(2 * PI), no /1 denominator ---- */
{
  const s = new Stack();
  s.push(Real(2 * Math.PI));
  lookup('→Qπ').fn(s);
  const ast = s.peek().expr;
  assert(ast.kind === 'bin' && ast.op === '*'
      && ast.l.kind === 'num' && ast.l.value === 2
      && ast.r.kind === 'var' && ast.r.name === 'PI',
    'session052: 2π →Qπ → Sym(2 * PI)  (no /1 denom)');
}

/* ---- →Qπ on -π/3 → Neg(PI / 3) ---- */
{
  const s = new Stack();
  s.push(Real(-Math.PI / 3));
  lookup('→Qπ').fn(s);
  const ast = s.peek().expr;
  assert(ast.kind === 'neg',
    'session052: -π/3 →Qπ produces a Neg at the top');
  const inner = ast.arg;
  assert(inner.kind === 'bin' && inner.op === '/'
      && inner.l.kind === 'var' && inner.l.name === 'PI'
      && inner.r.kind === 'num' && inner.r.value === 3,
    'session052: -π/3 →Qπ → Neg(PI / 3)');
}

/* ---- →Qπ on 0 → Sym(0) ---- */
{
  const s = new Stack();
  s.push(Real(0));
  lookup('→Qπ').fn(s);
  const ast = s.peek().expr;
  assert(ast.kind === 'num' && ast.value === 0,
    'session052: 0 →Qπ → Sym(0)');
}

/* ---- →Qπ on an Integer (Integer 0 passthrough is separately covered;
        test an Integer multiple of π via coercion path) ---- */
{
  const s = new Stack();
  s.push(Integer(0));
  lookup('→Qπ').fn(s);
  const ast = s.peek().expr;
  assert(ast.kind === 'num' && ast.value === 0,
    'session052: Integer 0 →Qπ → Sym(0)');
}

/* ---- →Qπ on Complex throws Bad argument type ---- */
{
  const s = new Stack();
  s.push(Complex(1, 2));
  let threw = false;
  try { lookup('→Qπ').fn(s); } catch (e) { threw = /Bad argument/.test(e.message); }
  assert(threw, 'session052: Complex →Qπ throws');
}

/* ---- ASCII alias ->Qπ works identically ---- */
{
  const s = new Stack();
  s.push(Real(Math.PI));
  lookup('->Qπ').fn(s);
  assert(s.peek().expr.kind === 'var' && s.peek().expr.name === 'PI',
    'session052: ->Qπ ASCII alias matches →Qπ');
}

// ------------------------------------------------------------------
// End session 052 additions (→Qπ / ->Qπ)
// ------------------------------------------------------------------

// ------------------------------------------------------------------

// ==================================================================
// Session 053 — number-theoretic ops (CAS §11, integer subset)
// ==================================================================

/* ---- ISPRIME? on small cases ---- */
{
  const s = new Stack();
  for (const [n, expected] of [[2n,1],[3n,1],[4n,0],[5n,1],[9n,0],[11n,1],[12n,0],[13n,1],[1n,0],[0n,0]]) {
    s.push(Integer(n));
    lookup('ISPRIME?').fn(s);
    assert(isReal(s.peek()) && s.peek().value === expected,
      `session053: ISPRIME? ${n} → ${expected}`);
    s.pop();
  }
}

/* ---- ISPRIME? on integer-valued Real coerces ---- */
{
  const s = new Stack();
  s.push(Real(17));
  lookup('ISPRIME?').fn(s);
  assert(s.peek().value === 1, 'session053: ISPRIME? Real(17) → true');
}

/* ---- ISPRIME? on non-integer Real throws ---- */
{
  const s = new Stack();
  s.push(Real(2.5));
  let threw = false;
  try { lookup('ISPRIME?').fn(s); } catch (e) { threw = /Bad argument/.test(e.message); }
  assert(threw, 'session053: ISPRIME? 2.5 throws');
}

/* ---- ISPRIME? on larger Miller-Rabin witness cases ---- */
{
  const s = new Stack();
  s.push(Integer(7919n));   // 1000th prime
  lookup('ISPRIME?').fn(s);
  assert(s.peek().value === 1, 'session053: ISPRIME? 7919 → true');
  s.pop();
  s.push(Integer(7920n));
  lookup('ISPRIME?').fn(s);
  assert(s.peek().value === 0, 'session053: ISPRIME? 7920 → false');
}

/* ---- NEXTPRIME / PREVPRIME ---- */
{
  const s = new Stack();
  s.push(Integer(10n));
  lookup('NEXTPRIME').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 11n,
    'session053: NEXTPRIME 10 → 11');

  s.pop();
  s.push(Integer(10n));
  lookup('PREVPRIME').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 7n,
    'session053: PREVPRIME 10 → 7');

  s.pop();
  s.push(Integer(13n));
  lookup('NEXTPRIME').fn(s);
  assert(s.peek().value === 17n, 'session053: NEXTPRIME 13 → 17 (skips 13)');

  s.pop();
  s.push(Integer(13n));
  lookup('PREVPRIME').fn(s);
  assert(s.peek().value === 11n, 'session053: PREVPRIME 13 → 11 (skips 13)');
}

/* ---- PREVPRIME on input where no smaller prime exists ---- */
{
  const s = new Stack();
  s.push(Integer(2n));
  let threw = false;
  try { lookup('PREVPRIME').fn(s); } catch (e) { threw = /Bad argument/.test(e.message); }
  assert(threw, 'session053: PREVPRIME 2 throws (no prime < 2)');
}

/* ---- EULER (Euler totient φ) ---- */
{
  const s = new Stack();
  for (const [n, phi] of [[1n,1n],[2n,1n],[3n,2n],[4n,2n],[6n,2n],[9n,6n],[12n,4n],[36n,12n]]) {
    s.push(Integer(n));
    lookup('EULER').fn(s);
    assert(isInteger(s.peek()) && s.peek().value === phi,
      `session053: EULER ${n} → ${phi}`);
    s.pop();
  }
}

/* ---- EULER 0 / negative throws ---- */
{
  const s = new Stack();
  s.push(Integer(0n));
  let threw = false;
  try { lookup('EULER').fn(s); } catch (e) { threw = /Bad argument/.test(e.message); }
  assert(threw, 'session053: EULER 0 throws');

  s.push(Integer(-5n));
  threw = false;
  try { lookup('EULER').fn(s); } catch (e) { threw = /Bad argument/.test(e.message); }
  assert(threw, 'session053: EULER -5 throws');
}

/* ---- DIVIS ---- */
{
  const s = new Stack();
  s.push(Integer(12n));
  lookup('DIVIS').fn(s);
  const d = s.peek();
  assert(d.type === 'list' && d.items.length === 6, 'session053: DIVIS 12 size=6');
  assert(d.items.map(i => i.value).join(',') === '1,2,3,4,6,12',
    'session053: DIVIS 12 → {1 2 3 4 6 12}');

  s.pop();
  s.push(Integer(1n));
  lookup('DIVIS').fn(s);
  assert(s.peek().items.length === 1 && s.peek().items[0].value === 1n,
    'session053: DIVIS 1 → {1}');

  // Negative input uses absolute value
  s.pop();
  s.push(Integer(-6n));
  lookup('DIVIS').fn(s);
  assert(s.peek().items.map(i => i.value).join(',') === '1,2,3,6',
    'session053: DIVIS -6 uses |n|');
}

/* ---- DIVIS 0 throws ---- */
{
  const s = new Stack();
  s.push(Integer(0n));
  let threw = false;
  try { lookup('DIVIS').fn(s); } catch (e) { threw = /Bad argument/.test(e.message); }
  assert(threw, 'session053: DIVIS 0 throws');
}

/* ---- FACTORS ---- */
{
  const s = new Stack();
  s.push(Integer(12n));
  lookup('FACTORS').fn(s);
  assert(s.peek().items.map(i => i.value).join(',') === '2,2,3,1',
    'session053: FACTORS 12 → {2 2 3 1}');

  s.pop();
  s.push(Integer(100n));
  lookup('FACTORS').fn(s);
  assert(s.peek().items.map(i => i.value).join(',') === '2,2,5,2',
    'session053: FACTORS 100 → {2 2 5 2}');

  s.pop();
  s.push(Integer(7n));
  lookup('FACTORS').fn(s);
  assert(s.peek().items.map(i => i.value).join(',') === '7,1',
    'session053: FACTORS 7 → {7 1}');

  s.pop();
  s.push(Integer(1n));
  lookup('FACTORS').fn(s);
  assert(s.peek().items.length === 0, 'session053: FACTORS 1 → {}');
}

/* ---- IBERNOULLI B_0..B_6 ---- */
{
  const s = new Stack();
  // B_0 = 1
  s.push(Integer(0n));
  lookup('IBERNOULLI').fn(s);
  assert(s.peek().type === 'symbolic' && s.peek().expr.kind === 'num' && s.peek().expr.value === 1,
    'session053: IBERNOULLI 0 → 1');
  s.pop();

  // B_1 = -1/2
  s.push(Integer(1n));
  lookup('IBERNOULLI').fn(s);
  {
    const e = s.peek().expr;
    assert(e.kind === 'neg' && e.arg.kind === 'bin' && e.arg.op === '/' &&
           e.arg.l.value === 1 && e.arg.r.value === 2,
      'session053: IBERNOULLI 1 → -1/2');
  }
  s.pop();

  // B_2 = 1/6
  s.push(Integer(2n));
  lookup('IBERNOULLI').fn(s);
  {
    const e = s.peek().expr;
    assert(e.kind === 'bin' && e.op === '/' && e.l.value === 1 && e.r.value === 6,
      'session053: IBERNOULLI 2 → 1/6');
  }
  s.pop();

  // B_3 = 0 (odd > 1)
  s.push(Integer(3n));
  lookup('IBERNOULLI').fn(s);
  assert(s.peek().expr.kind === 'num' && s.peek().expr.value === 0,
    'session053: IBERNOULLI 3 → 0');
  s.pop();

  // B_4 = -1/30
  s.push(Integer(4n));
  lookup('IBERNOULLI').fn(s);
  {
    const e = s.peek().expr;
    assert(e.kind === 'neg' && e.arg.kind === 'bin' &&
           e.arg.l.value === 1 && e.arg.r.value === 30,
      'session053: IBERNOULLI 4 → -1/30');
  }
  s.pop();

  // B_6 = 1/42
  s.push(Integer(6n));
  lookup('IBERNOULLI').fn(s);
  {
    const e = s.peek().expr;
    assert(e.kind === 'bin' && e.op === '/' && e.l.value === 1 && e.r.value === 42,
      'session053: IBERNOULLI 6 → 1/42');
  }
}

/* ---- IBERNOULLI negative input throws ---- */
{
  const s = new Stack();
  s.push(Integer(-1n));
  let threw = false;
  try { lookup('IBERNOULLI').fn(s); } catch (e) { threw = /Bad argument/.test(e.message); }
  assert(threw, 'session053: IBERNOULLI -1 throws');
}

/* ---- IBERNOULLI cap ---- */
{
  const s = new Stack();
  s.push(Integer(1000n));
  let threw = false;
  try { lookup('IBERNOULLI').fn(s); } catch (e) { threw = /Bad argument/.test(e.message); }
  assert(threw, 'session053: IBERNOULLI 1000 throws (cap)');
}

/* ---- IEGCD ---- */
{
  const s = new Stack();
  s.push(Integer(12n));
  s.push(Integer(18n));
  lookup('IEGCD').fn(s);
  assert(s.depth === 3, 'session053: IEGCD pushes u v g');
  const g = s.peek(1).value;
  const v = s.peek(2).value;
  const u = s.peek(3).value;
  assert(g === 6n, 'session053: IEGCD 12 18 g = 6');
  assert(u * 12n + v * 18n === 6n, 'session053: IEGCD 12 18 u v satisfies u*a + v*b = g');
}

/* ---- IEGCD 0 0 — g must be 0; u, v can be any integers ---- */
{
  const s = new Stack();
  s.push(Integer(0n));
  s.push(Integer(0n));
  lookup('IEGCD').fn(s);
  assert(s.peek(1).value === 0n,
    'session053: IEGCD 0 0 → g = 0');
}

/* ---- IEGCD with negative input ---- */
{
  const s = new Stack();
  s.push(Integer(-12n));
  s.push(Integer(18n));
  lookup('IEGCD').fn(s);
  const g = s.peek(1).value;
  const v = s.peek(2).value;
  const u = s.peek(3).value;
  assert(g === 6n && u * -12n + v * 18n === 6n,
    'session053: IEGCD -12 18 satisfies u*(-12) + v*18 = 6');
}

/* ---- ICHINREM ---- */
{
  // x ≡ 2 (mod 3), x ≡ 3 (mod 5) → x = 8 (mod 15)
  const s = new Stack();
  s.push(RList([Integer(2n), Integer(3n)]));
  s.push(RList([Integer(3n), Integer(5n)]));
  lookup('ICHINREM').fn(s);
  const r = s.peek();
  assert(r.type === 'list' && r.items.length === 2 &&
         r.items[0].value === 8n && r.items[1].value === 15n,
    'session053: ICHINREM {2,3} {3,5} → {8 15}');
}

/* ---- ICHINREM no solution throws ---- */
{
  // x ≡ 1 (mod 2), x ≡ 0 (mod 4) — inconsistent
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(2n)]));
  s.push(RList([Integer(0n), Integer(4n)]));
  let threw = false;
  try { lookup('ICHINREM').fn(s); } catch (e) { threw = /Bad argument/.test(e.message); }
  assert(threw, 'session053: ICHINREM inconsistent throws');
}

/* ---- IABCUV ---- */
{
  // 12 u + 18 v = 30 ; gcd(12,18) = 6, 30/6 = 5, bezout(12,18) has u=-1,v=1 so u=-5,v=5
  const s = new Stack();
  s.push(Integer(12n));
  s.push(Integer(18n));
  s.push(Integer(30n));
  lookup('IABCUV').fn(s);
  const v = s.peek(1).value;
  const u = s.peek(2).value;
  assert(12n * u + 18n * v === 30n,
    'session053: IABCUV 12 18 30 satisfies 12u + 18v = 30');
}

/* ---- IABCUV no solution ---- */
{
  const s = new Stack();
  s.push(Integer(6n));
  s.push(Integer(9n));
  s.push(Integer(5n));     // gcd(6,9) = 3, 5 not divisible by 3
  let threw = false;
  try { lookup('IABCUV').fn(s); } catch (e) { threw = /Bad argument/.test(e.message); }
  assert(threw, 'session053: IABCUV 6 9 5 (no solution) throws');
}

// ==================================================================
// Session 053 — STD / FIX / SCI / ENG (display-mode state)
// ==================================================================

/* ---- FIX n sets displayMode = 'FIX' and displayDigits = n ---- */
{
  const s = new Stack();
  s.push(Integer(4n));
  lookup('FIX').fn(s);
  assert(calcState.displayMode === 'FIX',
    'session053: FIX sets displayMode = FIX');
  assert(calcState.displayDigits === 4,
    'session053: FIX 4 sets displayDigits = 4');
}

/* ---- SCI sets displayMode = 'SCI' ---- */
{
  const s = new Stack();
  s.push(Integer(3n));
  lookup('SCI').fn(s);
  assert(calcState.displayMode === 'SCI' && calcState.displayDigits === 3,
    'session053: SCI 3 → mode=SCI, digits=3');
}

/* ---- ENG sets displayMode = 'ENG' ---- */
{
  const s = new Stack();
  s.push(Integer(2n));
  lookup('ENG').fn(s);
  assert(calcState.displayMode === 'ENG' && calcState.displayDigits === 2,
    'session053: ENG 2 → mode=ENG, digits=2');
}

/* ---- STD resets mode but preserves digits ---- */
{
  // First set SCI 5
  const s = new Stack();
  s.push(Integer(5n));
  lookup('SCI').fn(s);
  const digitsBefore = calcState.displayDigits;
  lookup('STD').fn(s);
  assert(calcState.displayMode === 'STD',
    'session053: STD sets mode=STD');
  assert(calcState.displayDigits === digitsBefore,
    'session053: STD does not overwrite displayDigits');
}

/* ---- FIX clamps at 11 digits (HP50 cap) ---- */
{
  const s = new Stack();
  s.push(Integer(20n));
  lookup('FIX').fn(s);
  assert(calcState.displayDigits === 11,
    'session053: FIX 20 clamps to 11');
}

/* ---- FIX with negative digits throws ---- */
{
  const s = new Stack();
  s.push(Integer(-1n));
  let threw = false;
  try { lookup('FIX').fn(s); } catch (e) { threw = /Bad argument/.test(e.message); }
  assert(threw, 'session053: FIX -1 throws');
}

/* ---- FIX with non-integer Real throws ---- */
{
  const s = new Stack();
  s.push(Real(3.5));
  let threw = false;
  try { lookup('FIX').fn(s); } catch (e) { threw = /Bad argument/.test(e.message); }
  assert(threw, 'session053: FIX 3.5 throws');
}

/* ---- FIX with non-numeric throws Bad argument type ---- */
{
  const s = new Stack();
  s.push(Name('X'));
  let threw = false;
  try { lookup('FIX').fn(s); } catch (e) { threw = /Bad argument/.test(e.message); }
  assert(threw, 'session053: FIX Name throws');
}

/* =================================================================
   Session 054 — CMPLX / CMPLX? mode toggle.
   ================================================================= */

/* ---- CMPLX op toggles state.complexMode ---- */
{
  setComplexMode(false);
  const s = new Stack();
  lookup('CMPLX').fn(s);
  assert(getComplexMode() === true, 'session054: CMPLX op sets mode on');
  lookup('CMPLX').fn(s);
  assert(getComplexMode() === false, 'session054: CMPLX op toggles back off');
}

/* ---- CMPLX? returns 1/0 ---- */
{
  setComplexMode(true);
  const s = new Stack();
  lookup('CMPLX?').fn(s);
  assert(s.pop().value === 1, 'session054: CMPLX? ON → 1');
  setComplexMode(false);
  lookup('CMPLX?').fn(s);
  assert(s.pop().value === 0, 'session054: CMPLX? OFF → 0');
}

/* ---- CMPLX OFF: LN(-1) throws Bad argument value ---- */
{
  setComplexMode(false);
  const s = new Stack();
  s.push(Real(-1));
  let threw = false;
  try { lookup('LN').fn(s); } catch (e) { threw = /Bad argument value/.test(e.message); }
  assert(threw, 'session054: LN(-1) throws under CMPLX OFF');
}

/* ---- CMPLX ON: LN(-1) → (0, π) ---- */
{
  setComplexMode(true);
  const s = new Stack();
  s.push(Real(-1));
  lookup('LN').fn(s);
  const r = s.pop();
  assert(isComplex(r) && Math.abs(r.re) < 1e-12 && Math.abs(r.im - Math.PI) < 1e-12,
    'session054: LN(-1) under CMPLX ON → (0, π)');
  setComplexMode(false);
}

/* ---- ACOS(2) always lifts to Complex (session 045 default); CMPLX
 *      doesn't gate that path.  This test pins the behavior so a later
 *      session doesn't accidentally tie ACOS to CMPLX without a
 *      conscious decision. ---- */
{
  setComplexMode(true);
  setAngle('RAD');
  const s = new Stack();
  s.push(Real(2));
  lookup('ACOS').fn(s);
  assert(isComplex(s.pop()), 'session054: ACOS(2) returns Complex (CMPLX ON)');
  setComplexMode(false);
  const s2 = new Stack();
  s2.push(Real(2));
  lookup('ACOS').fn(s2);
  assert(isComplex(s2.pop()), 'session054: ACOS(2) returns Complex (CMPLX OFF)');
}

/* ---- LOG(-10) under CMPLX ON → (1, π/ln10) principal-branch
 *      (re=log10(10)=1, im = Arg(-10)/ln10 = π/ln10) ---- */
{
  setComplexMode(true);
  const s = new Stack();
  s.push(Real(-10));
  lookup('LOG').fn(s);
  const r = s.pop();
  assert(isComplex(r) && Math.abs(r.re - 1) < 1e-9
         && Math.abs(r.im - Math.PI / Math.LN10) < 1e-9,
    'session054: LOG(-10) under CMPLX ON principal-branch');
  setComplexMode(false);
}

/* ---- LOG(-10) under CMPLX OFF throws clean RPL error ---- */
{
  setComplexMode(false);
  const s = new Stack();
  s.push(Real(-10));
  let threw = false, isRPL = true;
  try { lookup('LOG').fn(s); } catch (e) {
    threw = /Bad argument value/.test(e.message);
    isRPL = e.name !== 'TypeError';
  }
  assert(threw && isRPL, 'session054: LOG(-10) CMPLX OFF throws clean RPL error');
}

/* ================================================================
   Session 055 — C→P / P→C complex cartesian ↔ polar.

   Angle-mode aware: `fromRadians` writes the θ coordinate out of
   C→P in the current angle mode, and P→C reads it back via
   `toRadians` so the round-trip is an identity in any angle mode.
   ================================================================ */

/* ---- C→P in RAD: (3, 4) → (5, atan2(4,3)) ---- */
{
  setAngle('RAD');
  const s = new Stack();
  s.push(Complex(3, 4));
  lookup('C→P').fn(s);
  const r = s.pop();
  assert(isComplex(r)
         && Math.abs(r.re - 5) < 1e-12
         && Math.abs(r.im - Math.atan2(4, 3)) < 1e-12,
    'session055: C→P(3+4i) = (5, atan2(4,3)) in RAD');
}

/* ---- C→P in DEG: θ returned in degrees ---- */
{
  setAngle('DEG');
  const s = new Stack();
  s.push(Complex(0, 1));                  // straight up
  lookup('C→P').fn(s);
  const r = s.pop();
  assert(isComplex(r)
         && Math.abs(r.re - 1) < 1e-12
         && Math.abs(r.im - 90) < 1e-9,
    'session055: C→P(i) = (1, 90°) in DEG');
  setAngle('RAD');
}

/* ---- P→C in RAD: (2, π/2) → (0, 2) ---- */
{
  setAngle('RAD');
  const s = new Stack();
  s.push(Complex(2, Math.PI / 2));
  lookup('P→C').fn(s);
  const r = s.pop();
  assert(isComplex(r)
         && Math.abs(r.re) < 1e-12
         && Math.abs(r.im - 2) < 1e-12,
    'session055: P→C(2, π/2) = 2i in RAD');
}

/* ---- P→C in DEG: (1, 180°) → -1 ---- */
{
  setAngle('DEG');
  const s = new Stack();
  s.push(Complex(1, 180));
  lookup('P→C').fn(s);
  const r = s.pop();
  assert(isComplex(r)
         && Math.abs(r.re + 1) < 1e-12
         && Math.abs(r.im) < 1e-12,
    'session055: P→C(1, 180°) = -1 in DEG');
  setAngle('RAD');
}

/* ---- C→P then P→C round-trips (RAD) ---- */
{
  setAngle('RAD');
  const s = new Stack();
  s.push(Complex(-2, 5));
  lookup('C→P').fn(s);
  lookup('P→C').fn(s);
  const r = s.pop();
  assert(isComplex(r)
         && Math.abs(r.re + 2) < 1e-10
         && Math.abs(r.im - 5) < 1e-10,
    'session055: C→P / P→C round-trips in RAD');
}

/* ---- C→P of Real lifts to (|x|, 0) with x>0 ---- */
{
  setAngle('RAD');
  const s = new Stack();
  s.push(Real(7));
  lookup('C→P').fn(s);
  const r = s.pop();
  assert(isComplex(r) && Math.abs(r.re - 7) < 1e-12 && Math.abs(r.im) < 1e-12,
    'session055: C→P(7) = (7, 0)');
}

/* ---- C->P ASCII alias matches C→P ---- */
{
  setAngle('RAD');
  const s = new Stack();
  s.push(Complex(1, 0));
  lookup('C->P').fn(s);
  const r = s.pop();
  assert(isComplex(r) && Math.abs(r.re - 1) < 1e-12 && Math.abs(r.im) < 1e-12,
    'session055: C->P ASCII alias');
}

/* ---- P->C ASCII alias matches P→C ---- */
{
  setAngle('RAD');
  const s = new Stack();
  s.push(Complex(3, 0));
  lookup('P->C').fn(s);
  const r = s.pop();
  assert(isComplex(r) && Math.abs(r.re - 3) < 1e-12 && Math.abs(r.im) < 1e-12,
    'session055: P->C ASCII alias');
}

/* ---- C→P rejects non-scalar (Vector) with Bad argument type ---- */
{
  const s = new Stack();
  s.push(Vector([Real(1), Real(2)]));
  let threw = false;
  try { lookup('C→P').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session055: C→P rejects Vector');
}

/* ======================================================================
   Session 062 — type-support widening.

   FLOOR / CEIL / IP / FP / SIGN / ARG / MOD / MIN / MAX were previously
   restricted to scalar Real/Integer (SIGN/ARG additionally handling
   Complex + Vector for SIGN).  This session widens them with:
     - Symbolic lift on Name/Symbolic operands
     - Vector/Matrix element-wise on FLOOR/CEIL/IP/FP/SIGN/ARG
     - Tagged transparency (unary: re-tags result; binary: drops tag)
   Complex remains rejected on FLOOR/CEIL/IP/FP/MOD/MIN/MAX — ℂ has no
   total ordering or well-defined integer-part, matching HP50 behavior.
   ====================================================================== */

/* ---- FLOOR / CEIL / IP / FP: Symbolic lift on Name ---- */
{
  const s = new Stack();
  s.push(Name('X'));
  lookup('FLOOR').fn(s);
  const sym = s.peek();
  assert(sym && sym.type === 'symbolic' && sym.expr.kind === 'fn'
      && sym.expr.name === 'FLOOR' && sym.expr.args[0].kind === 'var'
      && sym.expr.args[0].name === 'X',
    'session062: FLOOR on Name lifts to Symbolic(FLOOR(X))');
}
{
  const s = new Stack();
  s.push(Name('Y'));
  lookup('CEIL').fn(s);
  const sym = s.peek();
  assert(sym && sym.type === 'symbolic' && sym.expr.kind === 'fn'
      && sym.expr.name === 'CEIL',
    'session062: CEIL on Name lifts to Symbolic');
}
{
  const s = new Stack();
  s.push(Name('Z'));
  lookup('IP').fn(s);
  assert(s.peek().type === 'symbolic' && s.peek().expr.name === 'IP',
    'session062: IP on Name lifts to Symbolic');
}
{
  const s = new Stack();
  s.push(Name('W'));
  lookup('FP').fn(s);
  assert(s.peek().type === 'symbolic' && s.peek().expr.name === 'FP',
    'session062: FP on Name lifts to Symbolic');
}

/* ---- FLOOR / CEIL on Symbolic round-trips through entry parser ---- */
{
  const parsed = parseEntry("'FLOOR(X+1)'");
  const s = new Stack();
  // parseEntry returns an array of stack-push items.
  for (const item of parsed) s.push(item);
  const v = s.peek();
  assert(v && v.type === 'symbolic' && v.expr.kind === 'fn' && v.expr.name === 'FLOOR',
    'session062: FLOOR(X+1) parses as Symbolic(FLOOR(…))');
}

/* ---- FLOOR / CEIL / IP / FP: Vector element-wise ---- */
{
  const s = new Stack();
  s.push(Vector([Real(1.7), Real(-2.3), Real(3)]));
  lookup('FLOOR').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && isReal(v.items[0]) && v.items[0].value === 1
      && isReal(v.items[1]) && v.items[1].value === -3
      && isReal(v.items[2]) && v.items[2].value === 3,
    'session062: FLOOR on Vector element-wise');
}
{
  const s = new Stack();
  s.push(Vector([Real(1.2), Real(-1.2)]));
  lookup('CEIL').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && v.items[0].value === 2 && v.items[1].value === -1,
    'session062: CEIL on Vector element-wise');
}
{
  const s = new Stack();
  s.push(Vector([Real(1.7), Real(-2.3)]));
  lookup('IP').fn(s);
  const v = s.peek();
  assert(v.items[0].value === 1 && v.items[1].value === -2,
    'session062: IP on Vector element-wise');
}
{
  const s = new Stack();
  s.push(Vector([Real(1.25), Real(-0.5)]));
  lookup('FP').fn(s);
  const v = s.peek();
  assert(Math.abs(v.items[0].value - 0.25) < 1e-12
      && Math.abs(v.items[1].value - (-0.5)) < 1e-12,
    'session062: FP on Vector element-wise');
}

/* ---- FLOOR on Matrix element-wise ---- */
{
  const s = new Stack();
  s.push(Matrix([[Real(1.7), Real(-2.3)], [Real(0.5), Real(4.9)]]));
  lookup('FLOOR').fn(s);
  const m = s.peek();
  assert(m.type === 'matrix'
      && m.rows[0][0].value === 1 && m.rows[0][1].value === -3
      && m.rows[1][0].value === 0 && m.rows[1][1].value === 4,
    'session062: FLOOR on Matrix element-wise');
}

/* ---- FLOOR on Tagged: unwrap → apply → re-tag ---- */
{
  const s = new Stack();
  s.push(Tagged('Price', Real(4.7)));
  lookup('FLOOR').fn(s);
  const t = s.peek();
  assert(t.type === 'tagged' && t.tag === 'Price'
      && isReal(t.value) && t.value.value === 4,
    'session062: FLOOR on Tagged preserves tag and floors the value');
}

/* ---- IP on Tagged Integer: tag preserved, value unchanged ---- */
{
  const s = new Stack();
  s.push(Tagged('N', Integer(42n)));
  lookup('IP').fn(s);
  const t = s.peek();
  assert(t.type === 'tagged' && t.tag === 'N'
      && isInteger(t.value) && t.value.value === 42n,
    'session062: IP on Tagged(Integer) preserves tag, integer identity');
}

/* ---- FLOOR still rejects Complex (HP50 has no floor on ℂ) ---- */
{
  const s = new Stack();
  s.push(Complex(1.5, 2.5));
  let threw = false;
  try { lookup('FLOOR').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session062: FLOOR rejects Complex');
}
{
  const s = new Stack();
  s.push(Complex(1.5, 2.5));
  let threw = false;
  try { lookup('FP').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session062: FP rejects Complex');
}

/* ---- SIGN widenings ---- */
{
  const s = new Stack();
  s.push(Name('X'));
  lookup('SIGN').fn(s);
  const sym = s.peek();
  assert(sym.type === 'symbolic' && sym.expr.name === 'SIGN',
    'session062: SIGN on Name lifts to Symbolic');
}
{
  // SIGN already handled Vector as a unit-direction op.  The Matrix
  // branch (new) is element-wise scalar-SIGN.
  const s = new Stack();
  s.push(Matrix([[Real(-3), Real(0)], [Real(2.5), Real(-1)]]));
  lookup('SIGN').fn(s);
  const m = s.peek();
  assert(m.type === 'matrix'
      && m.rows[0][0].value === -1 && m.rows[0][1].value === 0
      && m.rows[1][0].value === 1  && m.rows[1][1].value === -1,
    'session062: SIGN on Matrix element-wise');
}
{
  const s = new Stack();
  s.push(Tagged('Profit', Real(-2.5)));
  lookup('SIGN').fn(s);
  const t = s.peek();
  assert(t.type === 'tagged' && t.tag === 'Profit'
      && isReal(t.value) && t.value.value === -1,
    'session062: SIGN on Tagged preserves tag');
}

/* ---- ARG widenings: Symbolic lift, Vector/Matrix element-wise, Tagged ---- */
{
  const s = new Stack();
  s.push(Name('Z'));
  lookup('ARG').fn(s);
  assert(s.peek().type === 'symbolic' && s.peek().expr.name === 'ARG',
    'session062: ARG on Name lifts to Symbolic');
}
{
  setAngle('RAD');
  const s = new Stack();
  s.push(Vector([Real(1), Real(-1), Complex(0, 1)]));
  lookup('ARG').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && Math.abs(v.items[0].value - 0) < 1e-12
      && Math.abs(v.items[1].value - Math.PI) < 1e-12
      && Math.abs(v.items[2].value - Math.PI / 2) < 1e-12,
    'session062: ARG on Vector element-wise in RAD mode');
}
{
  setAngle('RAD');
  const s = new Stack();
  s.push(Matrix([[Real(2), Real(-3)], [Complex(0, 1), Real(0)]]));
  lookup('ARG').fn(s);
  const m = s.peek();
  assert(m.type === 'matrix'
      && Math.abs(m.rows[0][0].value - 0) < 1e-12
      && Math.abs(m.rows[0][1].value - Math.PI) < 1e-12
      && Math.abs(m.rows[1][0].value - Math.PI / 2) < 1e-12
      && Math.abs(m.rows[1][1].value - 0) < 1e-12,
    'session062: ARG on Matrix element-wise');
}
{
  setAngle('RAD');
  const s = new Stack();
  s.push(Tagged('phase', Complex(0, 1)));
  lookup('ARG').fn(s);
  const t = s.peek();
  assert(t.type === 'tagged' && t.tag === 'phase'
      && isReal(t.value) && Math.abs(t.value.value - Math.PI / 2) < 1e-12,
    'session062: ARG on Tagged preserves tag');
}

/* ---- MOD widenings: Symbolic lift, Tagged transparency ---- */
{
  const s = new Stack();
  s.push(Name('X'));
  s.push(Real(3));
  lookup('MOD').fn(s);
  const sym = s.peek();
  assert(sym.type === 'symbolic' && sym.expr.kind === 'fn'
      && sym.expr.name === 'MOD' && sym.expr.args.length === 2,
    'session062: MOD with Name left operand lifts to Symbolic(MOD(X,3))');
}
{
  const s = new Stack();
  s.push(Real(10));
  s.push(Name('Y'));
  lookup('MOD').fn(s);
  assert(s.peek().type === 'symbolic' && s.peek().expr.name === 'MOD',
    'session062: MOD with Name right operand lifts to Symbolic');
}
{
  // Tagged binary — result is untagged (we drop the tag on binaries).
  const s = new Stack();
  s.push(Tagged('A', Real(7)));
  s.push(Real(3));
  lookup('MOD').fn(s);
  const v = s.peek();
  assert(isReal(v) && v.value === 1,
    'session062: MOD on Tagged L drops tag, computes 7 mod 3 = 1');
}
{
  const s = new Stack();
  s.push(Real(-7));
  s.push(Tagged('D', Real(3)));
  lookup('MOD').fn(s);
  const v = s.peek();
  assert(isReal(v) && v.value === 2,
    'session062: MOD on Tagged R drops tag, computes -7 mod 3 = 2 (sign of divisor)');
}
{
  // Complex remains rejected.
  const s = new Stack();
  s.push(Complex(1, 1));
  s.push(Real(3));
  let threw = false;
  try { lookup('MOD').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session062: MOD still rejects Complex (no total order in ℂ)');
}

/* ---- MIN / MAX widenings: Symbolic lift, Tagged transparency ---- */
{
  const s = new Stack();
  s.push(Name('X'));
  s.push(Real(3));
  lookup('MIN').fn(s);
  const sym = s.peek();
  assert(sym.type === 'symbolic' && sym.expr.name === 'MIN'
      && sym.expr.args.length === 2,
    'session062: MIN(X, 3) lifts to Symbolic');
}
{
  const s = new Stack();
  s.push(Real(5));
  s.push(Name('Y'));
  lookup('MAX').fn(s);
  assert(s.peek().type === 'symbolic' && s.peek().expr.name === 'MAX',
    'session062: MAX(5, Y) lifts to Symbolic');
}
{
  const s = new Stack();
  s.push(Tagged('Lo', Real(2)));
  s.push(Tagged('Hi', Real(9)));
  lookup('MIN').fn(s);
  const v = s.peek();
  assert(isReal(v) && v.value === 2,
    'session062: MIN on two Tagged drops tags, returns min');
}
{
  const s = new Stack();
  s.push(Tagged('Lo', Real(2)));
  s.push(Tagged('Hi', Real(9)));
  lookup('MAX').fn(s);
  const v = s.peek();
  assert(isReal(v) && v.value === 9,
    'session062: MAX on two Tagged drops tags, returns max');
}
{
  // Complex still rejected (no total order on ℂ).
  const s = new Stack();
  s.push(Complex(1, 1));
  s.push(Real(3));
  let threw = false;
  try { lookup('MIN').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session062: MIN still rejects Complex');
}

/* ---- Symbolic round-trip through entry parser for new KNOWN_FUNCTIONS ---- */
{
  const parsed = parseEntry("'MIN(X,3)'");
  const s = new Stack();
  for (const item of parsed) s.push(item);
  const v = s.peek();
  assert(v && v.type === 'symbolic' && v.expr.kind === 'fn' && v.expr.name === 'MIN',
    'session062: MIN(X,3) parses as Symbolic(MIN(…))');
}
{
  const parsed = parseEntry("'MOD(X,2)'");
  const s = new Stack();
  for (const item of parsed) s.push(item);
  const v = s.peek();
  assert(v && v.type === 'symbolic' && v.expr.kind === 'fn' && v.expr.name === 'MOD',
    'session062: MOD(X,2) parses as Symbolic(MOD(…))');
}
{
  const parsed = parseEntry("'SIGN(X)'");
  const s = new Stack();
  for (const item of parsed) s.push(item);
  const v = s.peek();
  assert(v && v.type === 'symbolic' && v.expr.kind === 'fn' && v.expr.name === 'SIGN',
    'session062: SIGN(X) parses as Symbolic(SIGN(…))');
}

/* ============================================================
 * Session 063 — Vector / Matrix element-wise + Tagged
 *   for the trig, hyperbolic, log, sqrt, fact families.
 *
 * Every widened op picks up three new axes:
 *   - Vector (apply f to each element, return a Vector)
 *   - Matrix (apply f to each entry, return a Matrix)
 *   - Tagged (unwrap, apply, re-tag with same label)
 *
 * FACT additionally gains Symbolic / Name lift and List
 * distribution; previously it threw on those.
 * ============================================================ */

const _approx = (got, want, tol = 1e-9) =>
  Math.abs(got - want) < tol;

setAngle('RAD');

/* ---- Trig forward (SIN/COS/TAN) on Vector / Matrix / Tagged ---- */
{
  const s = new Stack();
  s.push(Vector([Real(0), Real(Math.PI / 2), Real(Math.PI)]));
  lookup('SIN').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && _approx(v.items[0].value, 0)
      && _approx(v.items[1].value, 1)
      && _approx(v.items[2].value, 0),
    'session063: SIN dispatches element-wise on Vector');
}
{
  const s = new Stack();
  s.push(Matrix([
    [Real(0),         Real(Math.PI)],
    [Real(Math.PI/2), Real(-Math.PI/2)],
  ]));
  lookup('COS').fn(s);
  const v = s.peek();
  assert(v.type === 'matrix'
      && _approx(v.rows[0][0].value, 1)
      && _approx(v.rows[0][1].value, -1)
      && _approx(v.rows[1][0].value, 0)
      && _approx(v.rows[1][1].value, 0),
    'session063: COS dispatches element-wise on Matrix');
}
{
  const s = new Stack();
  s.push(Tagged('θ', Real(Math.PI / 4)));
  lookup('TAN').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'θ' && _approx(v.value.value, 1),
    'session063: TAN on Tagged Real preserves the tag');
}

/* ---- Trig inverse (ASIN/ACOS/ATAN) on Vector / Matrix / Tagged ---- */
{
  const s = new Stack();
  s.push(Vector([Real(0), Real(1)]));
  lookup('ASIN').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && _approx(v.items[0].value, 0)
      && _approx(v.items[1].value, Math.PI / 2),
    'session063: ASIN dispatches element-wise on Vector');
}
{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(-1)]]));
  lookup('ACOS').fn(s);
  const v = s.peek();
  assert(v.type === 'matrix'
      && _approx(v.rows[0][0].value, 0)
      && _approx(v.rows[0][1].value, Math.PI),
    'session063: ACOS dispatches element-wise on Matrix');
}
{
  const s = new Stack();
  s.push(Tagged('slope', Real(1)));
  lookup('ATAN').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'slope'
      && _approx(v.value.value, Math.PI / 4),
    'session063: ATAN on Tagged Real preserves the tag');
}

/* ---- Hyperbolic family on Vector / Matrix / Tagged ---- */
{
  const s = new Stack();
  s.push(Vector([Real(0), Real(1)]));
  lookup('SINH').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && _approx(v.items[0].value, 0)
      && _approx(v.items[1].value, Math.sinh(1)),
    'session063: SINH dispatches element-wise on Vector');
}
{
  const s = new Stack();
  s.push(Matrix([[Real(0), Real(1)], [Real(2), Real(-1)]]));
  lookup('COSH').fn(s);
  const v = s.peek();
  assert(v.type === 'matrix'
      && _approx(v.rows[0][0].value, 1)
      && _approx(v.rows[0][1].value, Math.cosh(1))
      && _approx(v.rows[1][0].value, Math.cosh(2))
      && _approx(v.rows[1][1].value, Math.cosh(1)),
    'session063: COSH dispatches element-wise on Matrix');
}
{
  const s = new Stack();
  s.push(Tagged('h', Real(0)));
  lookup('TANH').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'h' && _approx(v.value.value, 0),
    'session063: TANH on Tagged Real preserves the tag');
}
{
  const s = new Stack();
  s.push(Vector([Real(0), Real(1)]));
  lookup('ASINH').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && _approx(v.items[0].value, 0)
      && _approx(v.items[1].value, Math.asinh(1)),
    'session063: ASINH dispatches element-wise on Vector');
}
{
  // ACOSH on Vector — domain is x>=1; test the in-domain branch
  const s = new Stack();
  s.push(Vector([Real(1), Real(2)]));
  lookup('ACOSH').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && _approx(v.items[0].value, 0)
      && _approx(v.items[1].value, Math.acosh(2)),
    'session063: ACOSH dispatches element-wise on Vector');
}
{
  const s = new Stack();
  s.push(Tagged('z', Real(0)));
  lookup('ATANH').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'z' && _approx(v.value.value, 0),
    'session063: ATANH on Tagged Real preserves the tag');
}

/* ---- Log family (LN / LOG / EXP / ALOG) on V / M / Tagged ---- */
{
  const s = new Stack();
  s.push(Vector([Real(1), Real(Math.E), Real(Math.E * Math.E)]));
  lookup('LN').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && _approx(v.items[0].value, 0)
      && _approx(v.items[1].value, 1)
      && _approx(v.items[2].value, 2),
    'session063: LN dispatches element-wise on Vector');
}
{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(10)], [Real(100), Real(1000)]]));
  lookup('LOG').fn(s);
  const v = s.peek();
  assert(v.type === 'matrix'
      && _approx(v.rows[0][0].value, 0)
      && _approx(v.rows[0][1].value, 1)
      && _approx(v.rows[1][0].value, 2)
      && _approx(v.rows[1][1].value, 3),
    'session063: LOG dispatches element-wise on Matrix');
}
{
  const s = new Stack();
  s.push(Vector([Real(0), Real(1)]));
  lookup('EXP').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && _approx(v.items[0].value, 1)
      && _approx(v.items[1].value, Math.E),
    'session063: EXP dispatches element-wise on Vector');
}
{
  const s = new Stack();
  s.push(Tagged('mag', Real(2)));
  lookup('ALOG').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'mag'
      && _approx(v.value.value, 100),
    'session063: ALOG on Tagged Real preserves the tag (10^2 = 100)');
}

/* ---- SQRT on Vector / Matrix / Tagged ---- */
{
  const s = new Stack();
  s.push(Vector([Real(1), Real(4), Real(9), Real(16)]));
  lookup('SQRT').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && _approx(v.items[0].value, 1)
      && _approx(v.items[1].value, 2)
      && _approx(v.items[2].value, 3)
      && _approx(v.items[3].value, 4),
    'session063: SQRT dispatches element-wise on Vector');
}
{
  const s = new Stack();
  s.push(Matrix([[Real(0), Real(0.25)], [Real(2.25), Real(6.25)]]));
  lookup('SQRT').fn(s);
  const v = s.peek();
  assert(v.type === 'matrix'
      && _approx(v.rows[0][0].value, 0)
      && _approx(v.rows[0][1].value, 0.5)
      && _approx(v.rows[1][0].value, 1.5)
      && _approx(v.rows[1][1].value, 2.5),
    'session063: SQRT dispatches element-wise on Matrix');
}
{
  const s = new Stack();
  s.push(Tagged('area', Real(81)));
  lookup('SQRT').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'area' && _approx(v.value.value, 9),
    'session063: SQRT on Tagged Real preserves the tag');
}
{
  // SQRT on Vector with a negative entry → Complex element (tagged of vector)
  const s = new Stack();
  s.push(Vector([Real(-4), Real(9)]));
  lookup('SQRT').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && v.items[0].type === 'complex'
      && _approx(v.items[0].im, 2)
      && _approx(v.items[1].value, 3),
    'session063: SQRT on Vector promotes negative entries to Complex');
}

/* ---- FACT widening: Symbolic / Name lift, List, Vector, Matrix, Tagged ---- */
{
  const s = new Stack();
  s.push(Name('N'));
  lookup('FACT').fn(s);
  const v = s.peek();
  assert(v.type === 'symbolic' && v.expr.kind === 'fn'
      && v.expr.name === 'FACT'
      && v.expr.args.length === 1 && v.expr.args[0].kind === 'var',
    'session063: FACT on Name lifts to Symbolic FACT(N)');
}
{
  const s = new Stack();
  s.push(RList([Integer(3n), Integer(4n), Integer(5n)]));
  lookup('FACT').fn(s);
  const v = s.peek();
  assert(v.type === 'list'
      && v.items[0].type === 'integer' && v.items[0].value === 6n
      && v.items[1].type === 'integer' && v.items[1].value === 24n
      && v.items[2].type === 'integer' && v.items[2].value === 120n,
    'session063: FACT distributes over List ({3 4 5} → {6 24 120})');
}
{
  const s = new Stack();
  s.push(Vector([Integer(3n), Integer(4n), Integer(5n)]));
  lookup('FACT').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && v.items[0].value === 6n
      && v.items[1].value === 24n
      && v.items[2].value === 120n,
    'session063: FACT dispatches element-wise on Vector');
}
{
  const s = new Stack();
  s.push(Matrix([[Integer(0n), Integer(1n)], [Integer(5n), Integer(6n)]]));
  lookup('FACT').fn(s);
  const v = s.peek();
  assert(v.type === 'matrix'
      && v.rows[0][0].value === 1n
      && v.rows[0][1].value === 1n
      && v.rows[1][0].value === 120n
      && v.rows[1][1].value === 720n,
    'session063: FACT dispatches element-wise on Matrix');
}
{
  const s = new Stack();
  s.push(Tagged('n', Integer(6n)));
  lookup('FACT').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'n'
      && v.value.type === 'integer' && v.value.value === 720n,
    'session063: FACT on Tagged Integer preserves the tag');
}

/* ---- LNP1 / EXPM on Vector / Tagged ---- */
{
  const s = new Stack();
  s.push(Vector([Real(0), Real(1)]));
  lookup('LNP1').fn(s);
  const v = s.peek();
  assert(v.type === 'vector'
      && _approx(v.items[0].value, 0)
      && _approx(v.items[1].value, Math.log(2)),
    'session063: LNP1 dispatches element-wise on Vector');
}
{
  const s = new Stack();
  s.push(Tagged('dx', Real(0)));
  lookup('EXPM').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'dx' && _approx(v.value.value, 0),
    'session063: EXPM on Tagged Real preserves the tag');
}

/* ---- Rejection: program operands still throw on widened ops ---- */
{
  const s = new Stack();
  s.push(Program([Real(1)]));
  let threw = false;
  try { lookup('SIN').fn(s); }
  catch (e) { threw = /Bad argument/.test(e.message); }
  assert(threw, 'session063: SIN still rejects Program (no Bad argument bypass)');
}
{
  const s = new Stack();
  s.push(Program([Real(1)]));
  let threw = false;
  try { lookup('LN').fn(s); }
  catch (e) { threw = /Bad argument/.test(e.message); }
  assert(threw, 'session063: LN still rejects Program');
}
{
  // FACT on Complex still rejects (HP50 gamma is real-only).
  const s = new Stack();
  s.push(Complex(2, 1));
  let threw = false;
  try { lookup('FACT').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session063: FACT still rejects Complex (no complex-Γ)');
}
{
  // FACT on negative integer → Bad argument value (unchanged from session 031).
  const s = new Stack();
  s.push(Integer(-3n));
  let threw = false;
  try { lookup('FACT').fn(s); }
  catch (e) { threw = /Bad argument value/.test(e.message); }
  assert(threw, 'session063: FACT(-3) still throws Bad argument value');
}

/* ---- Tagged-of-Vector on hyperbolic: tag preserved across container ---- */
{
  const s = new Stack();
  s.push(Tagged('temps', Vector([Real(0), Real(1)])));
  lookup('SINH').fn(s);
  const v = s.peek();
  assert(v.type === 'tagged' && v.tag === 'temps'
      && v.value.type === 'vector'
      && _approx(v.value.items[0].value, 0)
      && _approx(v.value.items[1].value, Math.sinh(1)),
    'session063: SINH on Tagged-of-Vector preserves tag and dispatches inside');
}

/* ---- Symbolic round-trip: FACT(X) parses through entry line ---- */
{
  const parsed = parseEntry("'FACT(X)'");
  const s = new Stack();
  for (const item of parsed) s.push(item);
  const v = s.peek();
  assert(v && v.type === 'symbolic' && v.expr.kind === 'fn' && v.expr.name === 'FACT',
    'session063: FACT(X) parses as Symbolic(FACT(…))');
}
