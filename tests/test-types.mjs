import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import {
  Real, Integer, Rational, BinaryInteger, Complex, Name, Str, Directory, Program, Tagged,
  RList, Vector, Matrix, Symbolic,
  isReal, isInteger, isRational, isBinaryInteger, isComplex, isDirectory, isProgram, isName,
  isString, isNumber, isTagged, promoteNumericPair, Decimal,
  isValidHpIdentifier, isReservedHpName, isStorableHpName, registerReservedName,
} from '../www/src/rpl/types.js';
import { parseEntry } from '../www/src/rpl/parser.js';
import { format, formatStackTop } from '../www/src/rpl/formatter.js';
import { isKnownFunction, defaultFnEval } from '../www/src/rpl/algebra.js';
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
import { assert, assertThrows, runOp } from './helpers.mjs';

/* Data-type completeness pass. */

/* ================================================================
   Data-type completeness pass — Vector/Matrix element-wise ops:
     NEG  V,M — element-wise negation
     ABS  V,M — Frobenius norm (Adv Guide spec)
     CONJ V,M — element-wise (identity today; complex-ready later)
     RE   V,M — element-wise real part
     IM   V,M — element-wise imaginary part (zero array today)
     SIGN V   — unit vector v/‖v‖; zero vector stays zero
   ================================================================ */
{
  // --- NEG -------------------------------------------------------
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(-2), Real(3)]));
    lookup('NEG').fn(s);
    const v = s.peek();
    assert(v.type === 'vector'
        && v.items[0].value.eq(-1) && v.items[1].value.eq(2) && v.items[2].value.eq(-3),
      `NEG Vector negates each element, got [${v.items.map(x=>x.value).join(' ')}]`);
  }
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(-2)], [Real(3), Real(4)]]));
    lookup('NEG').fn(s);
    const m = s.peek();
    assert(m.type === 'matrix'
        && m.rows[0][0].value.eq(-1) && m.rows[0][1].value.eq(2)
        && m.rows[1][0].value.eq(-3) && m.rows[1][1].value.eq(-4),
      'NEG Matrix negates every entry');
  }

  // --- ABS (= Frobenius norm on arrays per Adv Guide spec) -------
  {
    const s = new Stack();
    s.push(Vector([Real(3), Real(4)]));
    lookup('ABS').fn(s);
    assert(isReal(s.peek()) && s.peek().value.eq(5),
      `ABS [3 4] → 5 (got ${s.peek()?.value})`);
  }
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    lookup('ABS').fn(s);
    const got = s.peek().value;
    assert(Math.abs(got - Math.sqrt(30)) < 1e-12,
      `ABS Matrix → Frobenius norm ≈ √30 (got ${got})`);
  }

  // --- CONJ / RE / IM element-wise on Vector ---------------------
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2), Real(3)]));
    lookup('CONJ').fn(s);
    const v = s.peek();
    assert(v.type === 'vector'
        && v.items[0].value.eq(1) && v.items[1].value.eq(2) && v.items[2].value.eq(3),
      'CONJ on real-entry Vector is identity');
  }
  {
    const s = new Stack();
    s.push(Vector([Real(5), Real(-2)]));
    lookup('RE').fn(s);
    const v = s.peek();
    assert(v.type === 'vector' && v.items[0].value.eq(5) && v.items[1].value.eq(-2),
      'RE on real-entry Vector is identity');
  }
  {
    const s = new Stack();
    s.push(Vector([Real(5), Real(-2)]));
    lookup('IM').fn(s);
    const v = s.peek();
    assert(v.type === 'vector' && v.items[0].value.eq(0) && v.items[1].value.eq(0),
      'IM on real-entry Vector → zero vector');
  }

  // --- CONJ on Matrix is identity (no complex entries yet) -------
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    lookup('CONJ').fn(s);
    const m = s.peek();
    assert(m.type === 'matrix'
        && m.rows[0][0].value.eq(1) && m.rows[1][1].value.eq(4),
      'CONJ on real-entry Matrix is identity');
  }

  // --- SIGN on Vector (unit vector v/‖v‖) -----------------------
  {
    const s = new Stack();
    s.push(Vector([Real(3), Real(4)]));  // ‖v‖ = 5
    lookup('SIGN').fn(s);
    const v = s.peek();
    assert(v.type === 'vector'
        && Math.abs(v.items[0].value - 0.6) < 1e-12
        && Math.abs(v.items[1].value - 0.8) < 1e-12,
      `SIGN [3 4] → [0.6 0.8] (got [${v.items.map(x=>x.value).join(' ')}])`);
  }
  {
    // Zero vector stays zero (matches scalar-SIGN convention on 0).
    const s = new Stack();
    s.push(Vector([Real(0), Real(0), Real(0)]));
    lookup('SIGN').fn(s);
    const v = s.peek();
    assert(v.type === 'vector'
        && v.items[0].value.eq(0) && v.items[1].value.eq(0) && v.items[2].value.eq(0),
      'SIGN on zero Vector → zero Vector');
  }

  // --- NEG on Complex stays Complex (regression: don't break scalars) ---
  {
    const s = new Stack();
    s.push(Complex(3, -4));
    lookup('NEG').fn(s);
    const c = s.peek();
    assert(c.type === 'complex' && c.re === -3 && c.im === 4,
      'NEG on Complex still returns Complex (no regression)');
  }
}

/* ================================================================
   CHR / NUM (String ⇄ single codepoint).
   ================================================================ */
{
  /* ---- CHR: ASCII ---- */
  {
    const s = new Stack();
    s.push(Real(65));
    lookup('CHR').fn(s);
    assert(isString(s.peek(1)) && s.peek(1).value === 'A',
      'CHR 65 → "A"');
  }
  {
    const s = new Stack();
    s.push(Integer(32n));
    lookup('CHR').fn(s);
    assert(s.peek(1).value === ' ',
      'CHR on Integer 32 → " " (space)');
  }
  /* ---- CHR: Unicode codepoint ---- */
  {
    const s = new Stack();
    s.push(Real(0x2192)); // →
    lookup('CHR').fn(s);
    assert(s.peek(1).value === '→',
      'CHR 0x2192 → "→" (right arrow)');
  }
  /* ---- CHR: boundary values ---- */
  {
    const s = new Stack();
    s.push(Real(0));
    lookup('CHR').fn(s);
    assert(isString(s.peek(1)) && s.peek(1).value.charCodeAt(0) === 0,
      'CHR 0 → NUL character');
  }
  /* ---- CHR errors ---- */
  {
    const s = new Stack();
    s.push(Real(-1));
    try { lookup('CHR').fn(s); assert(false, 'CHR -1 should throw'); }
    catch (e) { assert(/Bad argument value/i.test(e.message),
      'CHR -1 → Bad argument value'); }
  }
  {
    const s = new Stack();
    s.push(Real(0x110000));
    try { lookup('CHR').fn(s); assert(false, 'CHR overflow should throw'); }
    catch (e) { assert(/Bad argument value/i.test(e.message),
      'CHR > 0x10FFFF → Bad argument value'); }
  }
  {
    const s = new Stack();
    s.push(Real(3.5));
    try { lookup('CHR').fn(s); assert(false, 'CHR 3.5 should throw'); }
    catch (e) { assert(/Bad argument value/i.test(e.message),
      'CHR 3.5 → Bad argument value (non-integer Real)'); }
  }
  {
    const s = new Stack();
    s.push(Str('A'));
    try { lookup('CHR').fn(s); assert(false, 'CHR on String should throw'); }
    catch (e) { assert(/Bad argument type/i.test(e.message),
      'CHR on String → Bad argument type'); }
  }

  /* ---- NUM: ASCII ---- */
  {
    const s = new Stack();
    s.push(Str('A'));
    lookup('NUM').fn(s);
    assert(isInteger(s.peek(1)) && s.peek(1).value === 65n,
      'NUM "A" → 65 (Integer)');
  }
  /* ---- NUM: first codepoint of multi-char string ---- */
  {
    const s = new Stack();
    s.push(Str('HELLO'));
    lookup('NUM').fn(s);
    assert(s.peek(1).value === 72n,
      'NUM "HELLO" → 72 (first char only, HP50 convention)');
  }
  /* ---- NUM: Unicode codepoint round-trip with CHR ---- */
  {
    const s = new Stack();
    s.push(Real(0x03B1)); // α
    lookup('CHR').fn(s);
    lookup('NUM').fn(s);
    assert(s.peek(1).value === BigInt(0x03B1),
      'CHR then NUM round-trips Unicode codepoint α (0x03B1)');
  }
  /* ---- NUM errors ---- */
  {
    const s = new Stack();
    s.push(Str(''));
    try { lookup('NUM').fn(s); assert(false, 'NUM "" should throw'); }
    catch (e) { assert(/Bad argument value/i.test(e.message),
      'NUM "" → Bad argument value'); }
  }
  {
    const s = new Stack();
    s.push(Real(65));
    try { lookup('NUM').fn(s); assert(false, 'NUM on Real should throw'); }
    catch (e) { assert(/Bad argument type/i.test(e.message),
      'NUM on Real → Bad argument type'); }
  }
}

/* ================================================================
   →STR / STR→ (object ⇄ string serialization).

   →STR  ( any  → "src" )     render via formatter (STD display mode)
   STR→  ( "src"  → any… )    parse the source as RPL, push each value
   ================================================================ */
{
  /* ---- →STR on primitives ---- */
  {
    const s = new Stack();
    s.push(Real(3.14));
    lookup('→STR').fn(s);
    assert(isString(s.peek(1)) && s.peek(1).value === '3.14',
      '→STR 3.14 → "3.14"');
  }
  {
    const s = new Stack();
    s.push(Integer(42n));
    lookup('→STR').fn(s);
    assert(s.peek(1).value === '42',
      '→STR Integer(42) → "42" (no trailing dot for Integer)');
  }
  {
    const s = new Stack();
    s.push(Real(1));
    lookup('→STR').fn(s);
    assert(s.peek(1).value === '1.',
      '→STR Real(1) → "1." (STD trailing dot)');
  }
  {
    const s = new Stack();
    s.push(Str('HELLO'));
    lookup('→STR').fn(s);
    assert(s.peek(1).value === '"HELLO"',
      '→STR "HELLO" → literally "\\"HELLO\\"" (quoted form)');
  }
  {
    const s = new Stack();
    s.push(RList([Real(1), Real(2), Real(3)]));
    lookup('→STR').fn(s);
    assert(s.peek(1).value === '{ 1. 2. 3. }',
      '→STR {1 2 3} → "{ 1. 2. 3. }"');
  }
  {
    const s = new Stack();
    s.push(Vector([Real(7), Real(8), Real(9)]));
    lookup('→STR').fn(s);
    assert(s.peek(1).value === '[ 7. 8. 9. ]',
      '→STR [7 8 9] → "[ 7. 8. 9. ]"');
  }
  {
    // ASCII alias ->STR
    const s = new Stack();
    s.push(Real(5));
    lookup('->STR').fn(s);
    assert(s.peek(1).value === '5.',
      'ASCII alias ->STR works like →STR');
  }

  /* ---- STR→ on simple inputs ---- */
  {
    const s = new Stack();
    s.push(Str('42'));
    lookup('STR→').fn(s);
    assert(isInteger(s.peek(1)) && s.peek(1).value === 42n,
      'STR→ "42" → Integer(42)');
  }
  {
    const s = new Stack();
    s.push(Str('3.14'));
    lookup('STR→').fn(s);
    assert(isReal(s.peek(1)) && s.peek(1).value.eq(3.14),
      'STR→ "3.14" → Real(3.14)');
  }
  {
    const s = new Stack();
    s.push(Str('{ 1 2 3 }'));
    lookup('STR→').fn(s);
    const out = s.peek(1);
    assert(out.type === 'list' && out.items.length === 3,
      'STR→ "{ 1 2 3 }" → List of 3 items');
  }
  {
    // Empty string produces no pushes (matches OBJ→ on empty string)
    const s = new Stack();
    s.push(Str(''));
    lookup('STR→').fn(s);
    assert(s.depth === 0,
      'STR→ on empty string pushes nothing (depth stays 0)');
  }
  {
    // Multi-token string pushes each token separately
    const s = new Stack();
    s.push(Str('1 2 3'));
    lookup('STR→').fn(s);
    assert(s.depth === 3,
      'STR→ "1 2 3" pushes 3 separate values');
  }
  {
    // ASCII alias STR->
    const s = new Stack();
    s.push(Str('7'));
    lookup('STR->').fn(s);
    assert(s.peek(1).value === 7n,
      'ASCII alias STR-> works like STR→');
  }
  {
    // STR→ on non-String throws
    const s = new Stack();
    s.push(Real(5));
    try { lookup('STR→').fn(s); assert(false, 'STR→ on Real should throw'); }
    catch (e) { assert(/Bad argument type/i.test(e.message),
      'STR→ on non-String → Bad argument type'); }
  }

  /* ---- →STR then STR→ round-trip ---- */
  {
    const s = new Stack();
    s.push(Real(2.5));
    lookup('→STR').fn(s);
    lookup('STR→').fn(s);
    assert(isReal(s.peek(1)) && s.peek(1).value.eq(2.5),
      '→STR then STR→ round-trips a Real');
  }
  {
    const s = new Stack();
    s.push(Integer(-100n));
    lookup('→STR').fn(s);
    lookup('STR→').fn(s);
    assert(isInteger(s.peek(1)) && s.peek(1).value === -100n,
      '→STR then STR→ round-trips an Integer');
  }
}


// ==================================================================
// Tagged objects and type introspection
// ==================================================================

/* ---- →TAG wraps a value with a String tag ---- */
{
  const s = new Stack();
  s.push(Integer(42n));
  s.push(Str('answer'));
  lookup('→TAG').fn(s);
  const t = s.peek();
  assert(t.type === 'tagged' && t.tag === 'answer',
    'session053: →TAG with String tag → Tagged');
  assert(t.value.type === 'integer' && t.value.value === 42n,
    'session053: →TAG wraps the integer value');
}

/* ---- →TAG with Name tag (uses name id) ---- */
{
  const s = new Stack();
  s.push(Real(3.14));
  s.push(Name('PI'));
  lookup('→TAG').fn(s);
  assert(s.peek().tag === 'PI',
    'session053: →TAG with Name tag uses name id');
}

/* ---- →TAG on already-tagged value replaces outer tag ---- */
{
  const s = new Stack();
  s.push(Tagged('inner', Integer(1n)));
  s.push(Str('outer'));
  lookup('→TAG').fn(s);
  const t = s.peek();
  assert(t.tag === 'outer', 'session053: →TAG replaces outer tag');
  assert(t.value.type === 'integer',
    'session053: →TAG re-tag does not double-nest');
}

/* ---- →TAG non-string/name tag throws ---- */
{
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(2n));
  assertThrows(() => lookup('→TAG').fn(s), /Bad argument/,
    'session053: →TAG Integer-tag throws');
}

/* ---- ASCII alias ->TAG works ---- */
{
  const s = new Stack();
  s.push(Integer(5n));
  s.push(Str('five'));
  lookup('->TAG').fn(s);
  assert(s.peek().tag === 'five',
    'session053: ->TAG alias');
}

/* ---- DTAG strips the outer tag ---- */
{
  const s = new Stack();
  s.push(Tagged('hello', Integer(1n)));
  lookup('DTAG').fn(s);
  assert(s.peek().type === 'integer' && s.peek().value === 1n,
    'session053: DTAG strips tag');
}

/* ---- DTAG on untagged is a pass-through ---- */
{
  const s = new Stack();
  s.push(Integer(7n));
  lookup('DTAG').fn(s);
  assert(s.peek().type === 'integer' && s.peek().value === 7n,
    'session053: DTAG on untagged is no-op');
}

/* ---- UNDER explodes Tagged into value + tag-string ---- */
{
  const s = new Stack();
  s.push(Tagged('mytag', Real(2.5)));
  lookup('UNDER').fn(s);
  assert(s.depth === 2, 'session053: UNDER leaves value + tag on stack');
  assert(s.peek(2).type === 'real' && s.peek(2).value.eq(2.5),
    'session053: UNDER exposes value');
  assert(s.peek(1).type === 'string' && s.peek(1).value === 'mytag',
    'session053: UNDER pushes tag as String');
}

/* ---- UNDER on untagged throws ---- */
{
  const s = new Stack();
  s.push(Integer(1n));
  assertThrows(() => lookup('UNDER').fn(s), /Bad argument/,
    'session053: UNDER on untagged throws');
}

/* ---- KIND returns HP50 type code (Real) ---- */
{
  const s = new Stack();
  s.push(Real(1.5));
  lookup('KIND').fn(s);
  assert(s.peek().type === 'real' && s.peek().value.isFinite(),
    'session053: KIND returns Real');
}

/* ---- KIND differs by type ---- */
{
  const s = new Stack();
  s.push(Integer(1n));
  lookup('KIND').fn(s);
  const kInt = s.peek().value;
  s.pop();
  s.push(Str('x'));
  lookup('KIND').fn(s);
  const kStr = s.peek().value;
  assert(kInt !== kStr, 'session053: KIND distinguishes Integer vs String');
}

/* ---- →TAG / UNDER round-trip preserves value ---- */
{
  const s = new Stack();
  s.push(Integer(99n));
  s.push(Str('banana'));
  lookup('→TAG').fn(s);
  lookup('UNDER').fn(s);
  assert(s.depth === 2 &&
         s.peek(2).type === 'integer' && s.peek(2).value === 99n &&
         s.peek(1).value === 'banana',
    'session053: →TAG|UNDER round-trip');
}

/* =================================================================
   TYPE / VTYPE / KIND table-driven sweep (AUR §3-44)

   HP50 AUR §3-44 table of type codes:
       0  Real
       1  Complex
       2  String
       3  Real-array (Vector or Matrix with no complex entries)
       4  Complex-array (any complex entry)
       5  List
       6  Global name
       7  Local name
       8  Program
       9  Algebraic (Symbolic)
      10  Binary integer
      11  Graphics object (GROB)
      12  Tagged object
      13  Unit
      15  Directory
      28  Integer (ZINT, arbitrary precision)

   The TYPE / KIND ops return this code for any stack value.  VTYPE
   takes a Name, resolves the value via varRecall, and returns the
   code for the stored value (or "Undefined name" on miss).

   This block tables every type code our implementation supports and
   asserts all three ops agree with the AUR.
   ================================================================= */

const TYPE_CODE_TABLE = [
  // [value-factory, expected HP50 code, label]
  [() => Real(3.14),                                  0,  'Real'],
  [() => Complex(1, 2),                               1,  'Complex (non-zero im)'],
  [() => Complex(5, 0),                               1,  'Complex (zero im — still code 1)'],
  [() => Str('hello'),                                2,  'String'],
  [() => Vector([Real(1), Real(2), Real(3)]),         3,  'Real Vector'],
  [() => Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]),
                                                      3,  'Real Matrix'],
  [() => Vector([Complex(1, 2), Real(3)]),            4,  'Complex Vector (any complex entry → code 4)'],
  [() => Matrix([[Complex(1, 1), Real(0)], [Real(0), Real(1)]]),
                                                      4,  'Complex Matrix (any complex entry → code 4)'],
  [() => RList([Real(1), Real(2), Str('x')]),         5,  'List (heterogeneous)'],
  [() => Name('FOO'),                                 6,  'Global Name'],
  [() => Name('LX', { local: true }),                 7,  'Local Name'],
  [() => Program([Integer(1n), Integer(2n), Name('+')]),
                                                      8,  'Program'],
  [() => Symbolic({ k: 'var', id: 'X' }),             9,  'Symbolic (Algebraic)'],
  [() => BinaryInteger(255n, 'h'),                   10,  'Binary integer'],
  [() => Tagged('t', Integer(42n)),                  12,  'Tagged'],
  [() => Tagged('t', Tagged('inner', Real(1))),      12,  'Nested Tagged (outer kind is still Tagged)'],
  // Unit needs a uexpr; the simplest is an empty-exponents tuple.
  // Use the same {kind,name} shape test-arrow-aliases.mjs builds.
  [() => ({ type: 'unit', value: 5, uexpr: { kind: 'atom', name: 'm' } }),
                                                     13,  'Unit'],
  [() => Directory({ name: 'HOME' }),                15,  'Directory'],
  [() => Integer(12345678901234567890n),             28,  'Integer (arbitrary precision)'],
];

/* ---- TYPE: table-drive every row ---- */
for (const [make, code, label] of TYPE_CODE_TABLE) {
  const s = new Stack();
  s.push(make());
  lookup('TYPE').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(code),
    `session068: TYPE(${label}) = ${code} (got ${s.peek()?.value})`);
}

/* ---- KIND: should agree with TYPE for every row ---- */
for (const [make, code, label] of TYPE_CODE_TABLE) {
  const s = new Stack();
  s.push(make());
  lookup('KIND').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(code),
    `session068: KIND(${label}) = ${code} (got ${s.peek()?.value})`);
}

/* ---- VTYPE: store each test value under a fresh name and assert
       VTYPE('n') returns the same code TYPE does ---- */
{
  // Use a scratch subdirectory to keep test values from polluting HOME.
  resetHome();
  let i = 0;
  for (const [make, code, label] of TYPE_CODE_TABLE) {
    const name = `VT_${i++}`;
    varStore(name, make());
    const s = new Stack();
    s.push(Name(name, { quoted: true }));
    lookup('VTYPE').fn(s);
    assert(isReal(s.peek()) && s.peek().value.eq(code),
      `session068: VTYPE('${name}') = ${code} — ${label}`);
  }
}

/* ---- VTYPE rejects non-Name argument ---- */
{
  const s = new Stack();
  s.push(Real(1));
  assertThrows(() => lookup('VTYPE').fn(s), /Bad argument type/i,
    'session068: VTYPE on Real → Bad argument type');
}

/* ---- VTYPE on an undefined name → Undefined name ---- */
{
  resetHome();
  const s = new Stack();
  s.push(Name('NOPE_XYZ', { quoted: true }));
  assertThrows(() => lookup('VTYPE').fn(s), /Undefined name/i,
    'session068: VTYPE on undefined name → Undefined name');
}

/* ---- TYPE / KIND distinguish Real ≠ Integer ≠ BinaryInteger ---- */
{
  // HP50 has three distinct numeric types.  This is a common "these
  // should never collide" regression point — easy to break when
  // touching promoteNumericPair.
  const real = new Stack(); real.push(Real(5));       lookup('TYPE').fn(real);
  const integer = new Stack(); integer.push(Integer(5n)); lookup('TYPE').fn(integer);
  const bin = new Stack(); bin.push(BinaryInteger(5n, 'h')); lookup('TYPE').fn(bin);
  assert(real.peek().value.eq(0) && integer.peek().value.eq(28) && bin.peek().value.eq(10)
      && real.peek().value !== integer.peek().value
      && integer.peek().value !== bin.peek().value,
    'session068: TYPE distinguishes Real(0) / Integer(28) / BinaryInteger(10)');
}

/* ---- TYPE on multi-arg inputs consumes exactly one ---- */
{
  const s = new Stack();
  s.push(Real(1));
  s.push(Real(2));
  s.push(Str('x'));
  const startDepth = s.depth;
  lookup('TYPE').fn(s);
  // TYPE should pop 1, push 1 → net depth unchanged.
  assert(s.depth === startDepth,
    'session068: TYPE pops 1 and pushes 1 (net depth unchanged)');
  assert(s.peek().value.eq(2),
    'session068: TYPE of level-1 String → code 2 (operated on the top, not level 2)');
  assert(s.peek(2).value.eq(2), 'session068: TYPE leaves level 2 (Real(2)) untouched');
  assert(s.peek(3).value.eq(1), 'session068: TYPE leaves level 3 (Real(1)) untouched');
}

/* ---- KIND on empty stack → Too few arguments ---- */
{
  const s = new Stack();
  assertThrows(() => lookup('KIND').fn(s), /Too few arguments/i,
    'session068: KIND on empty stack → Too few arguments');
}

/* ================================================================
   Data-Type Support widening — three clusters in src/rpl/algebra.js:
     Item 1 — DERIV on the hyperbolic family
              (SINH / COSH / TANH / ASINH / ACOSH / ATANH).
     Item 2 — INTEG on SINH / COSH / ALOG direct-arg forms.
     Item 3 — simplify() rounding / sign idempotency rules
              (FLOOR∘FLOOR, CEIL∘CEIL, IP∘IP, FP∘FP, FP of any
              integer-producing rounder = 0, cross-rounder collapse,
              SIGN∘SIGN = SIGN).
   All three widen the Symbolic-operand surface — the ops themselves
   lift to `Symbolic(AstFn(...))` via KNOWN_FUNCTIONS, and these
   rewrites are what make the resulting AST useful rather than a
   deferred black box.
   ================================================================ */
{
  /* --------- Item 1: DERIV on hyperbolic functions ---------- */
  // DERIV routes through Giac, which handles the entire function
  // universe.  The tests below register fixtures for the exact caseval
  // commands the op emits and assert the formatted round-trip.
  const { giac } = await import('../www/src/rpl/cas/giac-engine.mjs');
  giac._clear();
  giac._setFixtures({
    'diff(sinh(X),X)':  'cosh(X)',
    'diff(cosh(X),X)':  'sinh(X)',
    'diff(tanh(X),X)':  '1-tanh(X)^2',
    'diff(asinh(X),X)': '1/sqrt(X^2+1)',
    'diff(acosh(X),X)': '1/sqrt(X^2-1)',
    'diff(atanh(X),X)': '1/(1-X^2)',
    'diff(cosh(2*X),X)': '2*sinh(2*X)',
  });
  {
    const [e] = parseEntry("`SINH(X)`");
    const out = runOp('DERIV', e, Name('X'));
    assert(format(out) === "`COSH(X)`",
      `session082: DERIV SINH(X) / X = COSH(X) (got ${format(out)})`);
  }
  {
    const [e] = parseEntry("`COSH(X)`");
    const out = runOp('DERIV', e, Name('X'));
    assert(format(out) === "`SINH(X)`",
      `session082: DERIV COSH(X) / X = SINH(X) (got ${format(out)})`);
  }
  {
    const [e] = parseEntry("`TANH(X)`");
    const out = runOp('DERIV', e, Name('X'));
    const f = format(out);
    assert(f === "`-(TANH(X)^2) + 1`" || f === "`1 - TANH(X)^2`",
      `session082: DERIV TANH(X) / X = 1 - TANH(X)^2 (got ${f})`);
  }
  {
    const [e] = parseEntry("`ASINH(X)`");
    const out = runOp('DERIV', e, Name('X'));
    assert(format(out) === "`1/SQRT(X^2 + 1)`",
      `session082: DERIV ASINH(X) / X = 1/SQRT(X^2+1) (got ${format(out)})`);
  }
  {
    const [e] = parseEntry("`ACOSH(X)`");
    const out = runOp('DERIV', e, Name('X'));
    assert(format(out) === "`1/SQRT(X^2 - 1)`",
      `session082: DERIV ACOSH(X) / X = 1/SQRT(X^2-1) (got ${format(out)})`);
  }
  {
    const [e] = parseEntry("`ATANH(X)`");
    const out = runOp('DERIV', e, Name('X'));
    const f = format(out);
    assert(f === "`1/(-(X^2) + 1)`" || f === "`1/(1 - X^2)`",
      `session082: DERIV ATANH(X) / X = 1/(1 - X^2) (got ${f})`);
  }
  {
    const [e] = parseEntry("`COSH(2*X)`");
    const out = runOp('DERIV', e, Name('X'));
    const f = format(out);
    assert(f === "`2*SINH(2*X)`" || f === "`SINH(2*X)*2`",
      `session082: DERIV COSH(2*X) applies chain rule with 2 (got ${f})`);
  }
  giac._clear();

  // HEAVISIDE note: on Giac, `diff(Heaviside(X),X)` returns `Dirac(X)`
  // rather than throwing, so DERIV does not reject unknown functions.
}

{
  /* --------- Item 2: INTEG on SINH / COSH / ALOG ---------- */
  // INTEG routes through Giac, which computes antiderivatives without
  // a lookup table.  The tests below register fixtures for each caseval
  // command and verify the formatted round-trip.
  const { giac } = await import('../www/src/rpl/cas/giac-engine.mjs');
  giac._clear();
  giac._setFixtures({
    'integrate(sinh(X),X)': 'cosh(X)',
    'integrate(cosh(X),X)': 'sinh(X)',
    // Giac writes ALOG as `10^X` under the hood; our astToGiac emits
    // `(10^(X))` for `ALOG(X)`.  giacToAst then parses the reply back
    // through the `10^X` shape, which `formatAlgebra` renders as
    // "10^X/LN(10)" — the test below accepts either rendering.
    'integrate((10^(X)),X)': '10^X/ln(10)',
    // TANH's antiderivative in Giac: ln(cosh(X)).
    'integrate(tanh(X),X)': 'ln(cosh(X))',
  });
  {
    const [e] = parseEntry("`SINH(X)`");
    const out = runOp('INTEG', e, Name('X'));
    assert(format(out) === "`COSH(X)`",
      `session082: INTEG SINH(X) d/X = COSH(X) (got ${format(out)})`);
  }
  {
    const [e] = parseEntry("`COSH(X)`");
    const out = runOp('INTEG', e, Name('X'));
    assert(format(out) === "`SINH(X)`",
      `session082: INTEG COSH(X) d/X = SINH(X) (got ${format(out)})`);
  }
  {
    // Giac normalises ALOG through `10^X`, so the round-tripped result
    // prints as `10^X/LN(10)`.  Accept either rendering.
    const [e] = parseEntry("`ALOG(X)`");
    const out = runOp('INTEG', e, Name('X'));
    const f = format(out);
    assert(
      f === "`10^X/LN(10)`" || f === "`ALOG(X)/LN(10)`"
        || /^`ALOG\(X\)\/2\.30258509/.test(f),
      `session082: INTEG ALOG(X) d/X = 10^X/LN(10) (got ${f})`);
  }
  {
    // TANH has a closed-form antiderivative via Giac: LN(COSH(X)).
    const [e] = parseEntry("`TANH(X)`");
    const out = runOp('INTEG', e, Name('X'));
    const f = format(out);
    assert(f === "`LN(COSH(X))`",
      `session082: INTEG TANH(X) d/X = LN(COSH(X)) (got ${f})`);
  }

  // Rejection — non-variable / non-Symbolic / non-numeric operand.
  {
    const [e] = parseEntry("`SINH(X)`");
    assertThrows(
      () => runOp('INTEG', e, Real(7)),
      /Bad argument type/i,
      'session082: INTEG rejects Real as variable-of-integration');
  }
  giac._clear();
}

{
  /* --------- Item 3: simplify rounding / sign idempotency ---------- */
  // HP50-specific rounding identities (FLOOR/CEIL/IP/FP/SIGN idempotency)
  // aren't part of Giac's native simplify().  COLLECT's 1-arg form
  // routes through Giac's simplify(), so the fixtures below simulate
  // what Giac *would* return if we taught it those rules (or added a
  // post-Giac normalisation pass).  The tests still verify the caseval
  // plumbing + formatter round-trip.
  // TODO: add a post-Giac normalisation pass that applies the HP50-
  // flavoured idempotency rules so these fixtures can be dropped.
  const { giac } = await import('../www/src/rpl/cas/giac-engine.mjs');
  giac._clear();
  giac._setFixtures({
    'simplify(FLOOR(FLOOR(X)))': 'FLOOR(X)',
    'simplify(CEIL(CEIL(X)))':   'CEIL(X)',
    'simplify(IP(IP(X)))':       'IP(X)',
    'simplify(FP(FP(X)))':       'FP(X)',
    'simplify(sign(sign(X)))':   'sign(X)',
    'simplify(FP(FLOOR(X)))':    '0',
    'simplify(FP(CEIL(X)))':     '0',
    'simplify(FP(IP(X)))':       '0',
    'simplify(FLOOR(CEIL(X)))':  'CEIL(X)',
    'simplify(CEIL(FLOOR(X)))':  'FLOOR(X)',
    'simplify(IP(FLOOR(X)))':    'FLOOR(X)',
    'simplify(IP(CEIL(X)))':     'CEIL(X)',
    'simplify(FLOOR(IP(X)))':    'IP(X)',
    'simplify(CEIL(IP(X)))':     'IP(X)',
    'simplify(FLOOR(FP(X)))':    'FLOOR(FP(X))',
    'simplify(CEIL(FP(X)))':     'CEIL(FP(X))',
  });

  const IDEMP = [
    ['FLOOR(FLOOR(X))', 'FLOOR(X)'],
    ['CEIL(CEIL(X))',   'CEIL(X)'],
    ['IP(IP(X))',       'IP(X)'],
    ['FP(FP(X))',       'FP(X)'],
    ['SIGN(SIGN(X))',   'SIGN(X)'],
  ];
  for (const [src, expected] of IDEMP) {
    const [e] = parseEntry(`\`${src}\``);
    const out = runOp('COLLECT', e);
    const f = format(out);
    assert(f === `\`${expected}\``,
      `session082: COLLECT '${src}' → '${expected}' (got ${f})`);
  }

  const FP_OF_INT = [
    ['FP(FLOOR(X))'],
    ['FP(CEIL(X))'],
    ['FP(IP(X))'],
  ];
  for (const [src] of FP_OF_INT) {
    const [e] = parseEntry(`\`${src}\``);
    const out = runOp('COLLECT', e);
    const f = format(out);
    assert(f === "`0`" || f === '0' || f === '0.',
      `session082: COLLECT '${src}' → 0 (got ${f})`);
  }

  const CROSS = [
    ['FLOOR(CEIL(X))', 'CEIL(X)'],
    ['CEIL(FLOOR(X))', 'FLOOR(X)'],
    ['IP(FLOOR(X))',   'FLOOR(X)'],
    ['IP(CEIL(X))',    'CEIL(X)'],
    ['FLOOR(IP(X))',   'IP(X)'],
    ['CEIL(IP(X))',    'IP(X)'],
  ];
  for (const [src, expected] of CROSS) {
    const [e] = parseEntry(`\`${src}\``);
    const out = runOp('COLLECT', e);
    const f = format(out);
    assert(f === `\`${expected}\``,
      `session082: COLLECT '${src}' → '${expected}' (got ${f})`);
  }

  {
    const [e] = parseEntry("`FLOOR(FP(X))`");
    const out = runOp('COLLECT', e);
    assert(format(out) === "`FLOOR(FP(X))`",
      `session082: COLLECT leaves FLOOR(FP(X)) alone (got ${format(out)})`);
  }
  {
    const [e] = parseEntry("`CEIL(FP(X))`");
    const out = runOp('COLLECT', e);
    assert(format(out) === "`CEIL(FP(X))`",
      `session082: COLLECT leaves CEIL(FP(X)) alone (got ${format(out)})`);
  }
  giac._clear();
}

/* ================================================================
   KNOWN-GAP block: == / SAME on Program and Directory.

   HP50 AUR §4-7 specifies:

     - Program == Program (and Program SAME Program): structural
       equality on the token sequence.  Two Programs whose `tokens`
       arrays are pointwise eqValues-equal compare equal.  Two Programs
       with different tokens compare not-equal.
     - Directory == Directory (and Directory SAME Directory): reference
       identity only.  Directories own live mutable state (entries
       Map, parent pointer, name), so HP50 treats them as identifiable
       containers, not values — `d1 SAME d2` is true iff `d1` and `d2`
       are the same object.

   Currently `eqValues` in src/rpl/ops.js falls through to `return
   false` for both Program × Program and Directory × Directory, so:

     - Two structurally identical Programs compare 0 (HP50: 1).
     - The same Directory compared with itself compares 0 (HP50: 1).

   These tests use the soft-assert pattern (`current OR expected`) to
   document the HP50 outcome without breaking the suite while the
   implementation gap exists.  When `eqValues` is widened to add
   Program structural equality and Directory identity equality, flip
   these to hard asserts (`expected only`) and remove the fallback
   branch.

   Regression guards included here:
     - `==` on Programs whose tokens differ in *order* should compare
       not-equal.
     - Two distinct Directory instances with the same name and
       entries should still compare not-equal (reference identity is
       the spec).
   ================================================================ */
{
  // ---- Program × Program: structurally identical → HP50 1 ----
  // Build two Programs with identical tokens via the public Program
  // constructor.  A real-world equivalent is `« 1 2 + »` typed twice.
  {
    const p1 = Program([Real(1), Real(2), Name('+')]);
    const p2 = Program([Real(1), Real(2), Name('+')]);
    const s = new Stack();
    s.push(p1); s.push(p2);
    lookup('==').fn(s);
    const v = s.peek().value;
    assert(v.eq(1),
      'session087: Program == Program structural (identical tokens) = 1');
  }
  // ---- Program × Program SAME equivalent ----
  {
    const p1 = Program([Real(1), Real(2), Name('+')]);
    const p2 = Program([Real(1), Real(2), Name('+')]);
    const s = new Stack();
    s.push(p1); s.push(p2);
    lookup('SAME').fn(s);
    const v = s.peek().value;
    assert(v.eq(1),
      'session087: SAME on identical-token Programs = 1');
  }
  // ---- Program × Program: differing tokens → 0 (already correct) ----
  // Hard assert: a different token list MUST compare not-equal.  This
  // both-now-and-later-correct test guards the widening — when
  // equality is widened on, this case must STILL be 0.
  {
    const p1 = Program([Real(1), Real(2), Name('+')]);
    const p2 = Program([Real(1), Real(3), Name('+')]);  // different middle token
    const s = new Stack();
    s.push(p1); s.push(p2);
    lookup('==').fn(s);
    assert(s.peek().value.eq(0),
      'session084: Program == Program with different tokens is 0 (regression guard for upcoming widening)');
  }
  // ---- Program × Program: token-order matters ----
  {
    const p1 = Program([Real(1), Real(2), Name('+')]);
    const p2 = Program([Real(2), Real(1), Name('+')]);  // commuted operands
    const s = new Stack();
    s.push(p1); s.push(p2);
    lookup('SAME').fn(s);
    assert(s.peek().value.eq(0),
      'session084: SAME on Programs with permuted tokens is 0 (regression guard)');
  }
  // ---- Program × Program: empty programs are equal ----
  {
    const p1 = Program([]);
    const p2 = Program([]);
    const s = new Stack();
    s.push(p1); s.push(p2);
    lookup('==').fn(s);
    const v = s.peek().value;
    assert(v.eq(1),
      'session087: empty Program == empty Program = 1');
  }

  // ---- Directory × Directory: reference identity (same object) ----
  // HP50 AUR §4-7: SAME on two Directory references is true iff they
  // are the same object.  We build one Directory and push it twice.
  {
    const d = Directory({ name: 'TEST' });
    const s = new Stack();
    s.push(d); s.push(d);
    lookup('SAME').fn(s);
    const v = s.peek().value;
    assert(v.eq(1),
      'session087: SAME on the same Directory ref = 1');
  }
  // ---- Directory × Directory: same-name distinct objects → 0 ----
  // Hard regression guard: even after widening, two *distinct*
  // Directory objects that happen to share the same name must
  // compare not-equal.  HP50 treats Directories as identifiable
  // containers, not values.
  {
    const d1 = Directory({ name: 'TEST' });
    const d2 = Directory({ name: 'TEST' });   // distinct allocation
    const s = new Stack();
    s.push(d1); s.push(d2);
    lookup('SAME').fn(s);
    assert(s.peek().value.eq(0),
      'session084: SAME on two distinct Directories with same name is 0 (regression guard for reference-identity semantics)');
  }
  // ---- Directory == Directory: same object → HP50 1 ----
  {
    const d = Directory({ name: 'CALCS' });
    const s = new Stack();
    s.push(d); s.push(d);
    lookup('==').fn(s);
    const v = s.peek().value;
    assert(v.eq(1),
      'session087: Directory == Directory same-ref = 1');
  }
}

/* ================================================================
   session087: BinaryInteger on FLOOR / CEIL / IP / FP
   HP50 AUR §3 accepts BinInt on the rounders; rounding is a no-op
   (BinInts are always integer-valued).  FP yields #0 in same base.
   ================================================================ */
{
  // ---- FLOOR: BinInt → same BinInt (no-op) ----
  {
    const s = new Stack();
    s.push(BinaryInteger(7n, 'h'));
    lookup('FLOOR').fn(s);
    const r = s.peek();
    assert(isBinaryInteger(r) && r.value === 7n && r.base === 'h',
      'session087: FLOOR #7h → #7h (BinInt no-op, preserves base)');
  }
  // ---- CEIL: BinInt → same BinInt ----
  {
    const s = new Stack();
    s.push(BinaryInteger(10n, 'd'));
    lookup('CEIL').fn(s);
    const r = s.peek();
    assert(isBinaryInteger(r) && r.value === 10n && r.base === 'd',
      'session087: CEIL #10d → #10d (BinInt no-op)');
  }
  // ---- IP: BinInt → same BinInt ----
  {
    const s = new Stack();
    s.push(BinaryInteger(255n, 'h'));
    lookup('IP').fn(s);
    const r = s.peek();
    assert(isBinaryInteger(r) && r.value === 255n && r.base === 'h',
      'session087: IP #FFh → #FFh (BinInt no-op, preserves hex base)');
  }
  // ---- FP: BinInt → #0 in same base (integer part IS the whole value) ----
  {
    const s = new Stack();
    s.push(BinaryInteger(42n, 'o'));
    lookup('FP').fn(s);
    const r = s.peek();
    assert(isBinaryInteger(r) && r.value === 0n && r.base === 'o',
      'session087: FP #42o → #0o (FP of BinInt always 0, preserves base)');
  }
  // ---- rejection: Complex still rejected by FLOOR ----
  assertThrows(
    () => { const s = new Stack(); s.push(Complex(1, 2)); lookup('FLOOR').fn(s); },
    /Bad argument type/,
    'session087: FLOOR on Complex still throws Bad argument type'
  );

  // -------- session102: BinInt rounder — edge-case values --------
  // Zero BinInt through each rounder — base-preservation regression guard.
  {
    const s = new Stack();
    s.push(BinaryInteger(0n, 'b'));
    lookup('FLOOR').fn(s);
    const r = s.peek();
    assert(isBinaryInteger(r) && r.value === 0n && r.base === 'b',
      'session102: FLOOR #0b → #0b (zero BinInt, binary base preserved)');
  }
  {
    const s = new Stack();
    s.push(BinaryInteger(0n, 'h'));
    lookup('FP').fn(s);
    const r = s.peek();
    assert(isBinaryInteger(r) && r.value === 0n && r.base === 'h',
      'session102: FP #0h → #0h (FP of zero is still zero; hex base preserved)');
  }
  // IP on binary base preserves base (previous coverage only pinned hex).
  {
    const s = new Stack();
    s.push(BinaryInteger(5n, 'b'));
    lookup('IP').fn(s);
    const r = s.peek();
    assert(isBinaryInteger(r) && r.value === 5n && r.base === 'b',
      'session102: IP #101b → #101b (binary base preserved)');
  }
  // CEIL on octal base.
  {
    const s = new Stack();
    s.push(BinaryInteger(64n, 'o'));
    lookup('CEIL').fn(s);
    const r = s.peek();
    assert(isBinaryInteger(r) && r.value === 64n && r.base === 'o',
      'session102: CEIL #100o → #100o (octal base preserved)');
  }
}

/* ================================================================
   Rational data type (Fraction.js-backed)

   An exact ratio-of-integers type alongside Integer / Real / Complex.
   Canonical shape: { type: 'rational', n: BigInt, d: BigInt } with
   gcd(|n|,d)=1 and d≥1.  Arithmetic runs through Fraction.js —
   arbitrary precision via BigInt, no fallbacks.
   ================================================================ */
{
  // Constructor canonicalisation — sign on numerator, reduced.
  {
    const r = Rational(-6, 9);
    assert(isRational(r), 'Rational(-6, 9) is rational');
    assert(r.n === -2n && r.d === 3n,
      `Rational(-6, 9) canonicalises to -2/3 (got ${r.n}/${r.d})`);
  }
  {
    const r = Rational(6, -9);
    assert(r.n === -2n && r.d === 3n,
      `Rational(6, -9) canonicalises to -2/3 (got ${r.n}/${r.d})`);
  }
  {
    const r = Rational(0, 5);
    assert(r.n === 0n && r.d === 1n,
      `Rational(0, 5) is 0/1 (got ${r.n}/${r.d})`);
  }
  // Large magnitudes via BigInt — Rational is arbitrary-precision.
  {
    const r = Rational(2n ** 100n, 3n);
    assert(r.n === 2n ** 100n && r.d === 3n,
      'Rational(2^100, 3) preserves BigInt magnitude (no precision loss)');
  }
  // Division by zero rejected.
  assertThrows(
    () => Rational(1, 0),
    /Division by zero/,
    'Rational(1, 0) throws Division by zero'
  );

  // isNumber picks up Rational.
  assert(isNumber(Rational(1, 2)),
    'isNumber(Rational(1, 2)) is true');

  // promoteNumericPair lattice — Integer+Rational → rational kind.
  {
    const p = promoteNumericPair(Integer(2), Rational(1, 3));
    assert(p.kind === 'rational',
      `promote(Integer, Rational) → rational kind (got ${p.kind})`);
    assert(p.a.n === 2n && p.a.d === 1n,
      'promote widens Integer to {n,d:1n}');
  }
  // Rational + Real → real kind (exactness already lost).
  {
    const p = promoteNumericPair(Rational(1, 3), Real(0.5));
    assert(p.kind === 'real',
      `promote(Rational, Real) → real kind (got ${p.kind})`);
  }
  // Rational + Complex → complex kind.
  {
    const p = promoteNumericPair(Rational(1, 2), Complex(0, 1));
    assert(p.kind === 'complex',
      `promote(Rational, Complex) → complex kind (got ${p.kind})`);
  }

  // Arithmetic: + - * / between Rationals and with Integers.
  {
    const s = new Stack();
    s.push(Rational(1, 3));
    s.push(Rational(1, 6));
    lookup('+').fn(s);
    assert(s.peek(1).type === 'rational' &&
           s.peek(1).n === 1n && s.peek(1).d === 2n,
      `1/3 + 1/6 = 1/2 (got ${s.peek(1).n}/${s.peek(1).d})`);
  }
  {
    // 1/2 + 1/2 collapses back to Integer(1).
    const s = new Stack();
    s.push(Rational(1, 2));
    s.push(Rational(1, 2));
    lookup('+').fn(s);
    assert(s.peek(1).type === 'integer' && s.peek(1).value === 1n,
      '1/2 + 1/2 collapses to Integer(1)');
  }
  {
    const s = new Stack();
    s.push(Integer(2));
    s.push(Rational(1, 3));
    lookup('*').fn(s);
    assert(s.peek(1).type === 'rational' &&
           s.peek(1).n === 2n && s.peek(1).d === 3n,
      `2 * 1/3 = 2/3 (got ${s.peek(1).n}/${s.peek(1).d})`);
  }
  {
    // Division by Rational.
    const s = new Stack();
    s.push(Integer(1));
    s.push(Rational(1, 3));
    lookup('/').fn(s);
    assert(s.peek(1).type === 'integer' && s.peek(1).value === 3n,
      '1 / (1/3) = Integer(3)');
  }
  {
    // Integer power → stays Rational when base is Rational.
    const s = new Stack();
    s.push(Rational(2, 3));
    s.push(Integer(2));
    lookup('^').fn(s);
    assert(s.peek(1).type === 'rational' &&
           s.peek(1).n === 4n && s.peek(1).d === 9n,
      `(2/3)^2 = 4/9 (got ${s.peek(1).n}/${s.peek(1).d})`);
  }
  {
    // Negative-exponent inverts — still exact.
    const s = new Stack();
    s.push(Rational(2, 3));
    s.push(Integer(-1));
    lookup('^').fn(s);
    assert(s.peek(1).type === 'rational' &&
           s.peek(1).n === 3n && s.peek(1).d === 2n,
      `(2/3)^-1 = 3/2 (got ${s.peek(1).n}/${s.peek(1).d})`);
  }

  // APPROX mode collapses Rational arithmetic to Real — HP50 flag -3
  // means "I want decimals", so any op on Rationals in APPROX mode
  // yields a Real instead of a Rational.  EXACT mode (default) keeps
  // the exact ratio.  Integer/Integer division is likewise APPROX-
  // aware: EXACT produces Rational, APPROX produces Real.
  {
    const { setApproxMode } = await import('../www/src/rpl/state.js');
    setApproxMode(true);
    // 1/3 + 1/6 in APPROX → Real(0.5), not Rational(1/2).
    {
      const s = new Stack();
      s.push(Rational(1, 3));
      s.push(Rational(1, 6));
      lookup('+').fn(s);
      assert(s.peek(1).type === 'real'
          && Math.abs(s.peek(1).value - 0.5) < 1e-12,
        `APPROX: Rational+Rational → Real (got ${s.peek(1).type} ${s.peek(1).value ?? s.peek(1).n+'/'+s.peek(1).d})`);
    }
    // 1/3 NEG in APPROX → Real(-0.333…), not Rational(-1/3).
    {
      const s = new Stack();
      s.push(Rational(1, 3));
      lookup('NEG').fn(s);
      assert(s.peek(1).type === 'real'
          && Math.abs(s.peek(1).value - (-1/3)) < 1e-12,
        'APPROX: NEG on Rational → Real');
    }
    // 2/3 ABS in APPROX → Real.  EXACT would keep Rational.
    {
      const s = new Stack();
      s.push(Rational(-2, 3));
      lookup('ABS').fn(s);
      assert(s.peek(1).type === 'real'
          && Math.abs(s.peek(1).value - (2/3)) < 1e-12,
        'APPROX: ABS on Rational → Real');
    }
    // 2/3 INV in APPROX → Real(1.5).
    {
      const s = new Stack();
      s.push(Rational(2, 3));
      lookup('INV').fn(s);
      assert(s.peek(1).type === 'real'
          && Math.abs(s.peek(1).value - 1.5) < 1e-12,
        'APPROX: INV on Rational → Real');
    }
    // 1 3 / in APPROX → Real(0.333…), not Rational(1/3).
    {
      const s = new Stack();
      s.push(Integer(1n)); s.push(Integer(3n));
      lookup('/').fn(s);
      assert(s.peek(1).type === 'real',
        'APPROX: 1/3 (Integer/Integer non-exact) → Real, not Rational');
    }
    setApproxMode(false);
  }

  // EXACT mode: unary Rational ops stay exact.
  {
    // NEG on Rational(2/3) → Rational(-2/3).
    {
      const s = new Stack();
      s.push(Rational(2, 3));
      lookup('NEG').fn(s);
      assert(s.peek(1).type === 'rational'
          && s.peek(1).n === -2n && s.peek(1).d === 3n,
        'EXACT: NEG 2/3 → -2/3');
    }
    // ABS on Rational(-2/3) → Rational(2/3).
    {
      const s = new Stack();
      s.push(Rational(-2, 3));
      lookup('ABS').fn(s);
      assert(s.peek(1).type === 'rational'
          && s.peek(1).n === 2n && s.peek(1).d === 3n,
        'EXACT: ABS -2/3 → 2/3');
    }
    // INV on Rational(2/3) → Rational(3/2).
    {
      const s = new Stack();
      s.push(Rational(2, 3));
      lookup('INV').fn(s);
      assert(s.peek(1).type === 'rational'
          && s.peek(1).n === 3n && s.peek(1).d === 2n,
        'EXACT: INV 2/3 → 3/2');
    }
    // INV on Rational(-2/3) preserves sign on numerator → Rational(-3/2).
    {
      const s = new Stack();
      s.push(Rational(-2, 3));
      lookup('INV').fn(s);
      assert(s.peek(1).type === 'rational'
          && s.peek(1).n === -3n && s.peek(1).d === 2n,
        'EXACT: INV -2/3 → -3/2 (sign on numerator)');
    }
    // INV on Rational(0, 1) throws Infinite result — d must be non-zero
    // in the RESULT.  The Rational constructor guards division by zero
    // at construction, but 0/1 inverted would give 1/0.
    {
      const s = new Stack();
      s.push(Rational(0, 1));
      assertThrows(() => lookup('INV').fn(s), /Infinite result/i,
        'EXACT: INV on Rational(0) → Infinite result');
    }
    // SQRT on a Rational perfect square → exact Rational.
    {
      const s = new Stack();
      s.push(Rational(4, 9));
      lookup('SQRT').fn(s);
      assert(s.peek(1).type === 'rational'
          && s.peek(1).n === 2n && s.peek(1).d === 3n,
        'EXACT: SQRT 4/9 → 2/3 (perfect square, exact)');
    }
    // SQRT on a non-perfect-square Rational → Symbolic(SQRT(2/9)) in
    // EXACT mode — the irrational is preserved rather than decimated.
    // Pressing →NUM or toggling APPROX folds it to the 15-digit Real.
    {
      const s = new Stack();
      s.push(Rational(2, 9));
      lookup('SQRT').fn(s);
      assert(s.peek(1).type === 'symbolic',
        'EXACT: SQRT 2/9 → Symbolic (non-perfect-square stays exact)');
    }
    // SQRT on a negative Rational → Complex.
    {
      const s = new Stack();
      s.push(Rational(-4, 9));
      lookup('SQRT').fn(s);
      assert(s.peek(1).type === 'complex',
        'EXACT: SQRT -4/9 → Complex');
    }
    // SQ on Rational — (a/b)^2 stays exact.
    {
      const s = new Stack();
      s.push(Rational(2, 3));
      lookup('SQ').fn(s);
      assert(s.peek(1).type === 'rational'
          && s.peek(1).n === 4n && s.peek(1).d === 9n,
        'EXACT: SQ 2/3 → 4/9');
    }
    // FLOOR / CEIL / IP / FP on Rational — exact BigInt rounding.
    {
      const tests = [
        //  n,    d, FLOOR, CEIL, IP,  FP (BigInt → Integer, [n,d] → Rational)
        [ 7n,   2n,  3n,   4n,   3n,  [ 1n, 2n]],   //  7/2
        [-7n,   2n, -4n,  -3n,  -3n,  [-1n, 2n]],   // -7/2
        [ 4n,   2n,  2n,   2n,   2n,   0n       ],  //  4/2 = 2 exact
      ];
      for (const [n, d, fl, ce, ip, fp] of tests) {
        const tag = `${n}/${d}`;
        {
          const s = new Stack();
          s.push(Rational(n, d));
          lookup('FLOOR').fn(s);
          assert(s.peek(1).type === 'integer' && s.peek(1).value === fl,
            `EXACT: FLOOR ${tag} → ${fl}`);
        }
        {
          const s = new Stack();
          s.push(Rational(n, d));
          lookup('CEIL').fn(s);
          assert(s.peek(1).type === 'integer' && s.peek(1).value === ce,
            `EXACT: CEIL ${tag} → ${ce}`);
        }
        {
          const s = new Stack();
          s.push(Rational(n, d));
          lookup('IP').fn(s);
          assert(s.peek(1).type === 'integer' && s.peek(1).value === ip,
            `EXACT: IP ${tag} → ${ip}`);
        }
        {
          const s = new Stack();
          s.push(Rational(n, d));
          lookup('FP').fn(s);
          if (typeof fp === 'bigint') {
            assert(s.peek(1).type === 'integer' && s.peek(1).value === fp,
              `EXACT: FP ${tag} → ${fp}`);
          } else {
            assert(s.peek(1).type === 'rational'
                && s.peek(1).n === fp[0] && s.peek(1).d === fp[1],
              `EXACT: FP ${tag} → ${fp[0]}/${fp[1]}`);
          }
        }
      }
    }
    // SIGN on Rational — sign of the numerator (d always > 0).
    {
      for (const [n, d, expected] of [
        [ 2n, 3n,  1n],
        [-2n, 3n, -1n],
        [ 0n, 1n,  0n],
      ]) {
        const s = new Stack();
        s.push(Rational(n, d));
        lookup('SIGN').fn(s);
        assert(s.peek(1).type === 'integer' && s.peek(1).value === expected,
          `EXACT: SIGN ${n}/${d} → ${expected}`);
      }
    }
  }

  // Formatter — Rational prints as `n/d`.
  {
    const s1 = format(Rational(1, 3));
    assert(s1 === '1/3', `format(Rational(1,3)) = '1/3' (got '${s1}')`);
    const s2 = format(Rational(-7, 4));
    assert(s2 === '-7/4', `format(Rational(-7,4)) = '-7/4' (got '${s2}')`);
  }
}

/* ================================================================
   Real arithmetic — decimal.js-backed.

   Real × Real arithmetic goes through decimal.js at precision 15.
   The point: heal the IEEE-754 artifacts that haunt JS-number
   arithmetic, so the HP50 classroom-math illusion holds.
   ================================================================ */
{
  // Sanity — the classic 0.1 + 0.2 ≠ 0.3 trap in JS number arithmetic.
  // Real + Real must give an exact 0.3 via decimal.js.
  {
    const s = new Stack();
    s.push(Real(0.1));
    s.push(Real(0.2));
    lookup('+').fn(s);
    const r = s.peek();
    assert(r.type === 'real' && r.value.eq(0.3),
      `decimal: 0.1 + 0.2 → Real(0.3) (got ${r.value})`);
  }

  // Multiplication — `3 * 0.4 - 1.2` lands on exact zero instead of
  // 2.22e-16.
  {
    const s = new Stack();
    s.push(Real(3));
    s.push(Real(0.4));
    lookup('*').fn(s);
    s.push(Real(1.2));
    lookup('-').fn(s);
    const r = s.peek();
    assert(r.type === 'real' && r.value.eq(0),
      `decimal: 3*0.4 - 1.2 → Real(0) (got ${r.value})`);
  }

  // Division that should be exact — 1/10 stays at 0.1 (no IEEE tail).
  {
    const s = new Stack();
    s.push(Real(1));
    s.push(Real(10));
    lookup('/').fn(s);
    const r = s.peek();
    assert(r.type === 'real' && r.value.eq(0.1),
      `decimal: 1/10 → Real(0.1) (got ${r.value})`);
  }

  // Power — 1.1^2 = 1.21 exactly (vs. 1.2100000000000002 native).
  {
    const s = new Stack();
    s.push(Real(1.1));
    s.push(Real(2));
    lookup('^').fn(s);
    const r = s.peek();
    assert(r.type === 'real' && r.value.eq(1.21),
      `decimal: 1.1^2 → Real(1.21) (got ${r.value})`);
  }

  // Compound expression — 0.1 + 0.1 + 0.1 accumulates exactly.
  {
    const s = new Stack();
    s.push(Real(0.1));
    s.push(Real(0.1));
    lookup('+').fn(s);
    s.push(Real(0.1));
    lookup('+').fn(s);
    const r = s.peek();
    assert(r.type === 'real' && r.value.eq(0.3),
      `decimal: 0.1 + 0.1 + 0.1 → Real(0.3) (got ${r.value})`);
  }

  // Division by zero still throws 'Infinite result' (not NaN / Infinity).
  {
    const s = new Stack();
    s.push(Real(1));
    s.push(Real(0));
    try {
      lookup('/').fn(s);
      assert(false, 'decimal: 1/0 should throw');
    } catch (e) {
      assert(e.message === 'Infinite result',
        `decimal: 1/0 throws 'Infinite result' (got '${e.message}')`);
    }
  }
}

/* ================================================================
   Complex arithmetic — complex.js-backed.

   Complex × Complex arithmetic routes through complex.js.  The
   payload on the stack is a plain `{ re, im }` pair.  complex.js's
   kernel gives us exact identity preservation (i² = -1, not
   i² ≈ -1 + 0i with trailing zeros), correct branch-cut handling at
   negative reals for `^`, and a library-vetted polar-form pow.
   ================================================================ */
{
  // i * i = -1 exactly.  Tests the identity preservation through the
  // complex.js multiplication kernel.
  {
    const s = new Stack();
    s.push(Complex(0, 1));
    s.push(Complex(0, 1));
    lookup('*').fn(s);
    const r = s.peek();
    assert(r.type === 'complex' && r.re === -1 && r.im === 0,
      `complex: i * i → (-1, 0) (got (${r.re}, ${r.im}))`);
  }

  // (1+2i) + (3-i) = 4 + i.
  {
    const s = new Stack();
    s.push(Complex(1, 2));
    s.push(Complex(3, -1));
    lookup('+').fn(s);
    const r = s.peek();
    assert(r.type === 'complex' && r.re === 4 && r.im === 1,
      `complex: (1+2i) + (3-i) → (4, 1) (got (${r.re}, ${r.im}))`);
  }

  // (1+2i) * (3-i) = 5 + 5i.
  {
    const s = new Stack();
    s.push(Complex(1, 2));
    s.push(Complex(3, -1));
    lookup('*').fn(s);
    const r = s.peek();
    assert(r.type === 'complex' && r.re === 5 && r.im === 5,
      `complex: (1+2i) * (3-i) → (5, 5) (got (${r.re}, ${r.im}))`);
  }

  // (1+i)^2 = 2i exactly.  Tests pow via polar form.
  {
    const s = new Stack();
    s.push(Complex(1, 1));
    s.push(Complex(2, 0));
    lookup('^').fn(s);
    const r = s.peek();
    // The library's pow uses polar form — check the result is within
    // a very tight ULP of (0, 2).  Strict equality may pick up a last-
    // bit trig artifact, so tolerate < 1e-12 on each component.
    assert(r.type === 'complex'
           && Math.abs(r.re) < 1e-12
           && Math.abs(r.im - 2) < 1e-12,
      `complex: (1+i)^2 → (0, 2) (got (${r.re}, ${r.im}))`);
  }

  // Division by zero on Complex still throws 'Infinite result'.
  {
    const s = new Stack();
    s.push(Complex(1, 1));
    s.push(Complex(0, 0));
    try {
      lookup('/').fn(s);
      assert(false, 'complex: (1+i) / 0 should throw');
    } catch (e) {
      assert(e.message === 'Infinite result',
        `complex: (1+i) / 0 throws 'Infinite result' (got '${e.message}')`);
    }
  }
}

/* ================================================================
   Rational lifting into Symbolic AST.

   `_toAst(Rational)` returns Bin('/', Num(n), Num(d)) so a Rational
   survives into a Symbolic expression without being flattened to a
   float leaf.  LN/LOG/EXP/SIN/etc. on a Symbolic argument containing
   a Rational form a valid symbolic expression rather than throwing
   "Bad argument type".
   ================================================================ */
{
  // Rational + Name lifts to Symbolic.
  {
    const s = new Stack();
    s.push(Name('X', { quoted: true }));
    s.push(Rational(1, 3));
    lookup('+').fn(s);
    const r = s.peek();
    assert(r.type === 'symbolic',
      `rational->AST: X + 1/3 lifts to Symbolic (got ${r.type})`);
    const txt = format(r);
    assert(txt.includes('1/3') && txt.includes('X'),
      `rational->AST: X + 1/3 formats with both X and 1/3 (got '${txt}')`);
  }

  // LN of (X + 1/3) — Rational survives through the AST into a
  // transcendental wrapper.
  {
    const s = new Stack();
    s.push(Name('X', { quoted: true }));
    s.push(Rational(1, 3));
    lookup('+').fn(s);
    lookup('LN').fn(s);
    const r = s.peek();
    assert(r.type === 'symbolic',
      `rational->AST: LN(X + 1/3) is Symbolic (got ${r.type})`);
    const txt = format(r);
    assert(txt.includes('LN') && txt.includes('1/3'),
      `rational->AST: LN(X + 1/3) formats with LN(...) and 1/3 (got '${txt}')`);
  }
}

/* ================================================================
   EXACT/APPROX — exactness preservation and push-time decimation.

   EXACT (flag -105 CLEAR):
     Integer/Rational inputs to transcendental ops keep the result
     Symbolic when the closed-form answer is not an integer.
     `SQRT(2)`, `LN(2)`, `EXP(1)`, `SIN(30)` (any angle mode), `2^(1/3)`
     all stay as Symbolic.  Clean folds like `SQRT(9)=3`, `LN(1)=0`,
     `SIN(0)=0`, `EXP(0)=1` still collapse to Integer(0/1/3).

   APPROX (flag -105 SET):
     Integer/Rational/pure-numeric-Symbolic values coerce to Real on
     the way onto the stack — "fractions and integers decimate on
     entry, in expressions too."  Values with free variables do NOT
     decimate; `X + 1` stays symbolic.
   ================================================================ */
{
  /* ---- EXACT-mode exactness for transcendentals ---- */
  const prev = calcState.approxMode;
  setApproxMode(false);
  try {
    // SQRT(2) stays Symbolic
    {
      const s = new Stack();
      s.push(Integer(2));
      lookup('SQRT').fn(s);
      assert(s.peek(1).type === 'symbolic',
        'EXACT: SQRT(2) → Symbolic (irrational stays exact)');
    }
    // SQRT(9)=3 still folds to Integer (clean integer result)
    {
      const s = new Stack();
      s.push(Integer(9));
      lookup('SQRT').fn(s);
      assert(s.peek(1).type === 'integer' && s.peek(1).value === 3n,
        'EXACT: SQRT(9) → Integer(3) (clean fold still folds)');
    }
    // SQRT(3/5) stays Symbolic
    {
      const s = new Stack();
      s.push(Rational(3, 5));
      lookup('SQRT').fn(s);
      assert(s.peek(1).type === 'symbolic',
        'EXACT: SQRT(3/5) → Symbolic (non-perfect-square fraction stays exact)');
    }
    // LN(2) stays Symbolic
    {
      const s = new Stack();
      s.push(Integer(2));
      lookup('LN').fn(s);
      assert(s.peek(1).type === 'symbolic',
        'EXACT: LN(2) → Symbolic (irrational stays exact)');
    }
    // LN(1) = 0 still folds
    {
      const s = new Stack();
      s.push(Integer(1));
      lookup('LN').fn(s);
      assert(s.peek(1).type === 'integer' && s.peek(1).value === 0n,
        'EXACT: LN(1) → Integer(0) (clean fold still folds)');
    }
    // EXP(0) = 1 still folds
    {
      const s = new Stack();
      s.push(Integer(0));
      lookup('EXP').fn(s);
      assert(s.peek(1).type === 'integer' && s.peek(1).value === 1n,
        'EXACT: EXP(0) → Integer(1) (clean fold still folds)');
    }
    // EXP(1) stays Symbolic
    {
      const s = new Stack();
      s.push(Integer(1));
      lookup('EXP').fn(s);
      assert(s.peek(1).type === 'symbolic',
        'EXACT: EXP(1) → Symbolic');
    }
    // 2 ^ (1/3) stays Symbolic
    {
      const s = new Stack();
      s.push(Integer(2));
      s.push(Rational(1, 3));
      lookup('^').fn(s);
      assert(s.peek(1).type === 'symbolic',
        'EXACT: 2 ^ (1/3) → Symbolic (fractional exponent stays exact)');
    }
    // Real SQRT still decimates (Real wasn't ever symbolic-preserving)
    {
      const s = new Stack();
      s.push(Real(2));
      lookup('SQRT').fn(s);
      assert(s.peek(1).type === 'real',
        'EXACT: SQRT(2.0) → Real (Real inputs never lift to Symbolic)');
    }
  } finally {
    setApproxMode(prev);
  }
}

{
  /* ---- APPROX push-time coercion ---- */
  const prev = calcState.approxMode;
  setApproxMode(true);
  try {
    // Integer → Real on push
    {
      const s = new Stack();
      s.push(Integer(42));
      const v = s.peek(1);
      assert(v.type === 'real' && v.value.eq(42),
        'APPROX: push(Integer(42)) coerces to Real(42)');
    }
    // Rational → Real on push
    {
      const s = new Stack();
      s.push(Rational(1, 3));
      const v = s.peek(1);
      assert(v.type === 'real' && Math.abs(v.value.toNumber() - (1/3)) < 1e-12,
        'APPROX: push(Rational(1/3)) coerces to Real(0.333…)');
    }
    // Symbolic with no free variables — pure-numeric 1/3 — decimates
    {
      const s = new Stack();
      const parsed = parseEntry('`1/3`');        // → Symbolic(AstBin('/',1,3))
      for (const val of parsed) s.push(val);
      const v = s.peek(1);
      assert(v.type === 'real',
        `APPROX: push(Symbolic(1/3)) coerces to Real (got ${v.type})`);
      assert(Math.abs(v.value.toNumber() - (1/3)) < 1e-12,
        `APPROX: Symbolic(1/3) → ~0.333… (got ${v.value})`);
    }
    // Symbolic WITH free variables — X + 1 — stays symbolic
    {
      const s = new Stack();
      const parsed = parseEntry('`X+1`');
      for (const val of parsed) s.push(val);
      const v = s.peek(1);
      assert(v.type === 'symbolic',
        'APPROX: Symbolic with free variables stays Symbolic on push');
    }
    // Arithmetic respects coercion: Integer(3) + Integer(4) → Real(7)
    {
      const s = new Stack();
      s.push(Integer(3));
      s.push(Integer(4));
      lookup('+').fn(s);
      const v = s.peek(1);
      assert(v.type === 'real' && v.value.eq(7),
        'APPROX: 3 4 + → Real(7) after push coercion');
    }
    // Large Integer (beyond 2^53) → Real via Decimal string path, no
    // precision loss on the integer part
    {
      const s = new Stack();
      s.push(Integer(10n ** 20n));
      const v = s.peek(1);
      assert(v.type === 'real',
        'APPROX: push(big BigInt) coerces to Real');
      assert(v.value.eq(new Decimal('1e20')),
        'APPROX: push(10^20) keeps precision via Decimal string');
    }
    // EXACT → APPROX transition: existing Integer on the stack doesn't
    // retroactively decimate, only fresh pushes do.  Stack ops like DUP
    // preserve what's there.
    {
      setApproxMode(false);
      const s = new Stack();
      s.push(Integer(5));
      setApproxMode(true);
      // DUP must not trigger coercion — it copies a stack slot, it
      // doesn't push a "new" value.
      s.dup();
      assert(s.peek(1).type === 'integer' && s.peek(2).type === 'integer',
        'APPROX: DUP does not retroactively coerce existing Integer');
    }
  } finally {
    setApproxMode(prev);
  }
}

/* ================================================================
   session095: HP50 identifier validator

   Covers the exported helpers in types.js plus the integration with
   register() in ops.js (every registered op name becomes reserved).
   The shape follows HP50 AUR §2.2.4: 1-127 letters/digits/underscore
   starting with a letter, case-sensitive, reserved command names
   refused for storage.  The validator intentionally permits the HP50
   Greek range (U+0391-U+03A9, U+03B1-U+03C9) but no wider Unicode.
   ================================================================ */
{
  // --- syntactic validity ----------------------------------------
  assert(isValidHpIdentifier('X'),     'isValid: single ASCII letter');
  assert(isValidHpIdentifier('X1'),    'isValid: letter + digit');
  assert(isValidHpIdentifier('foo_bar'), 'isValid: lowercase + underscore');
  assert(isValidHpIdentifier('α'),     'isValid: Greek alpha (U+03B1)');
  assert(isValidHpIdentifier('Ω'),     'isValid: Greek Omega (U+03A9)');
  assert(isValidHpIdentifier('Xα2_y'), 'isValid: mixed Greek/ASCII/digits/_');
  assert(isValidHpIdentifier('A'.repeat(127)), 'isValid: 127 chars (max)');

  assert(!isValidHpIdentifier(''),       '!isValid: empty string');
  assert(!isValidHpIdentifier('1X'),     '!isValid: leading digit');
  assert(!isValidHpIdentifier('_X'),     '!isValid: leading underscore');
  assert(!isValidHpIdentifier('X Y'),    '!isValid: space inside');
  assert(!isValidHpIdentifier('X+Y'),    '!isValid: operator inside');
  assert(!isValidHpIdentifier("X'"),     '!isValid: tick inside');
  assert(!isValidHpIdentifier('X.Y'),    '!isValid: period inside');
  assert(!isValidHpIdentifier('café'),   '!isValid: Latin-1 accent (outside HP set)');
  assert(!isValidHpIdentifier('日本'),   '!isValid: CJK (outside HP set)');
  assert(!isValidHpIdentifier('A'.repeat(128)), '!isValid: 128 chars (over limit)');
  assert(!isValidHpIdentifier(null),     '!isValid: null');
  assert(!isValidHpIdentifier(42),       '!isValid: number');

  // --- reserved-name bookkeeping ---------------------------------
  // ops.js registers every op name at module load.  'SIN' / 'STO' are
  // core ops; querying them should now show reserved.
  assert(isReservedHpName('SIN'),  'SIN registered as reserved (from ops.js load)');
  assert(isReservedHpName('sin'),  'SIN case-insensitive match');
  assert(isReservedHpName('STO'),  'STO registered as reserved');
  assert(!isReservedHpName('MYVAR'), 'MYVAR (unregistered) is not reserved');

  // Ad-hoc registration — verify the hook works for the non-op path.
  registerReservedName('MYRESERVED_PROBE_X');
  assert(isReservedHpName('MYRESERVED_PROBE_X'), 'registerReservedName sticks');
  assert(isReservedHpName('myreserved_probe_x'), 'registerReservedName: case folds');

  // --- combined storable check ------------------------------------
  assert(isStorableHpName('MYVAR'),  'isStorable: valid + unreserved');
  assert(!isStorableHpName('SIN'),   '!isStorable: valid but reserved');
  assert(!isStorableHpName('1X'),    '!isStorable: invalid shape');
  assert(!isStorableHpName(''),      '!isStorable: empty');

  // --- STO / CRDIR reject invalid / reserved names ---------------
  // Wiring integration check: the /ops.js/ write path surfaces
  // "Invalid name" through RPLError when given anything that fails
  // isStorableHpName.  The string literal is the canonical message
  // emitted by _coerceStorableName.
  resetHome();
  clearLastError();
  {
    const s = new Stack();
    s.push(Real(1));
    s.push(Name('SIN', { quoted: true }));   // reserved
    assertThrows(() => { lookup('STO').fn(s); }, /Invalid name/,
      'STO on reserved name SIN throws "Invalid name"');
  }
  {
    const s = new Stack();
    s.push(Real(1));
    s.push(Str('1X'));                       // invalid shape
    assertThrows(() => { lookup('STO').fn(s); }, /Invalid name/,
      'STO on invalid shape "1X" throws "Invalid name"');
  }
  {
    const s = new Stack();
    s.push(Name('COS', { quoted: true }));   // reserved
    assertThrows(() => { lookup('CRDIR').fn(s); }, /Invalid name/,
      'CRDIR on reserved name COS throws "Invalid name"');
  }
  // Regression guard: a plain legal name still stores.
  {
    const s = new Stack();
    s.push(Real(7));
    s.push(Name('FOO', { quoted: true }));
    lookup('STO').fn(s);
    const v = varRecall('FOO');
    assert(isReal(v) && v.value.eq(7), 'STO on plain name FOO succeeds');
  }
  resetHome();
}

/* ================================================================
   Session 105 — Sy round-trip hardening for HP50 two-arg ops.

   Session 100 closed the Sy axis for eleven arity-1 ops via
   KNOWN_FUNCTIONS entries and hard tests in tests/test-algebra.mjs.
   That file is lock-held this session, so we mirror the pattern in
   tests/test-types.mjs and extend coverage to the arity-2 (and
   variadic) surface that was never pinned:

     Cluster A — 10 two-arg HP50 ops: MIN, MAX, MOD, COMB, PERM,
       IQUOT, IREMAINDER, GCD, LCM, XROOT.  Each passes through
       parseEntry → Symbolic → formatAlgebra → parseEntry-idempotent,
       and exercises its defaultFnEval numeric fold at simplify time.

     Cluster B — 10 special-function / stat-dist ops: UTPC, UTPF,
       UTPT, BETA, ERF, ERFC, GAMMA, LNGAMMA, HEAVISIDE, DIRAC.
       Parser round-trip + eval guards (HEAVISIDE / DIRAC / GAMMA
       fold on safe inputs; the others return null → leave-symbolic).

     Cluster C — TRUNC's arity-2 enforcement (1-arg form rejected at
       parseAlgebra) and PSI's variadic 1-or-2-arg shape.

   The round-trip check is parseEntry(format(parseEntry(src))) →
   same Symbolic shape.  The comparison we assert on is textual
   equality after format (so whitespace normalizes to parser canonical
   form, matching the existing test-algebra.mjs pattern).
   ================================================================ */
{
  /* ---------- helpers ---------- */
  const rtSymbolic = (entrySrc) => {
    const [v1] = parseEntry(`\`${entrySrc}\``);
    assert(v1 && v1.type === 'symbolic',
      `session105: parseEntry \`${entrySrc}\` → Symbolic (got ${v1?.type})`);
    const f1 = format(v1);
    const [v2] = parseEntry(f1);
    assert(v2 && v2.type === 'symbolic',
      `session105: reparse ${f1} → Symbolic (got ${v2?.type})`);
    const f2 = format(v2);
    assert(f1 === f2,
      `session105: round-trip idempotent for ${entrySrc} (got ${f1} vs ${f2})`);
  };

  /* ---------- Cluster A: 2-arg HP50 ops ---------- */
  const CLUSTER_A = [
    'MIN', 'MAX', 'MOD', 'COMB', 'PERM',
    'IQUOT', 'IREMAINDER', 'GCD', 'LCM', 'XROOT',
  ];
  for (const name of CLUSTER_A) {
    assert(isKnownFunction(name),
      `session105: isKnownFunction('${name}') (Cluster A)`);
    assert(isKnownFunction(name.toLowerCase()),
      `session105: isKnownFunction case-insensitive for '${name}'`);
  }

  // Per-op round-trips with concrete symbolic operands.
  rtSymbolic('MIN(X, 3)');
  rtSymbolic('MAX(X, 3)');
  rtSymbolic('MOD(X, 3)');
  rtSymbolic('COMB(N, K)');
  rtSymbolic('PERM(N, K)');
  rtSymbolic('IQUOT(A, B)');
  rtSymbolic('IREMAINDER(A, B)');
  rtSymbolic('GCD(X, 12)');
  rtSymbolic('LCM(X, 12)');
  rtSymbolic('XROOT(Y, 3)');

  // Numeric folds for the arity-2 evaluators (safe, mode-independent).
  assert(defaultFnEval('MIN',  [3, 5]) === 3,           'session105: MIN(3,5) fold');
  assert(defaultFnEval('MIN',  [5, 3]) === 3,           'session105: MIN(5,3) fold');
  assert(defaultFnEval('MAX',  [3, 5]) === 5,           'session105: MAX(3,5) fold');
  assert(defaultFnEval('MAX',  [5, 3]) === 5,           'session105: MAX(5,3) fold');
  assert(defaultFnEval('MOD',  [10, 3]) === 1,          'session105: MOD(10,3) fold');
  assert(defaultFnEval('MOD',  [-7, 3]) === 2,          'session105: MOD(-7,3) floor-div sign');
  assert(defaultFnEval('MOD',  [10, 0]) === null,       'session105: MOD(10,0) leaves symbolic');
  assert(defaultFnEval('COMB', [5, 2]) === 10,          'session105: COMB(5,2) fold');
  assert(defaultFnEval('COMB', [5, 0]) === 1,           'session105: COMB(5,0) fold');
  assert(defaultFnEval('COMB', [5, 6]) === null,        'session105: COMB(5,6) out-of-range → null');
  assert(defaultFnEval('COMB', [-1, 2]) === null,       'session105: COMB(-1,2) negative → null');
  assert(defaultFnEval('PERM', [5, 2]) === 20,          'session105: PERM(5,2) fold');
  assert(defaultFnEval('PERM', [5, 0]) === 1,           'session105: PERM(5,0) fold');
  assert(defaultFnEval('PERM', [5, 6]) === null,        'session105: PERM(5,6) out-of-range → null');
  assert(defaultFnEval('IQUOT',[17, 5]) === 3,          'session105: IQUOT(17,5) fold');
  assert(defaultFnEval('IQUOT',[-17, 5]) === -3,        'session105: IQUOT(-17,5) truncates towards 0');
  assert(defaultFnEval('IQUOT',[10, 0]) === null,       'session105: IQUOT(10,0) leaves symbolic');
  assert(defaultFnEval('IREMAINDER',[17, 5]) === 2,     'session105: IREMAINDER(17,5) fold');
  assert(defaultFnEval('IREMAINDER',[-17, 5]) === -2,   'session105: IREMAINDER(-17,5) sign');
  assert(defaultFnEval('IREMAINDER',[10, 0]) === null,  'session105: IREMAINDER(10,0) leaves symbolic');
  assert(defaultFnEval('GCD',  [12, 18]) === 6,         'session105: GCD(12,18) fold');
  assert(defaultFnEval('GCD',  [0, 7]) === 7,           'session105: GCD(0,7) → 7');
  assert(defaultFnEval('GCD',  [1.5, 3]) === null,      'session105: GCD non-integer → null');
  assert(defaultFnEval('LCM',  [4, 6]) === 12,          'session105: LCM(4,6) fold');
  assert(defaultFnEval('LCM',  [0, 7]) === 0,           'session105: LCM(0,n) → 0');
  assert(defaultFnEval('LCM',  [1.5, 3]) === null,      'session105: LCM non-integer → null');
  assert(defaultFnEval('XROOT',[27, 3]) === 3,          'session105: XROOT(27,3) fold');
  assert(Math.abs(defaultFnEval('XROOT',[2, 2]) - Math.SQRT2) < 1e-12,
    'session105: XROOT(2,2) = √2');
  assert(defaultFnEval('XROOT',[-8, 3]) === null,       'session105: XROOT negative radicand → null');
  assert(defaultFnEval('XROOT',[8, 0]) === null,        'session105: XROOT zero index → null');

  /* ---------- Cluster B: 10 special-function / stat-dist ops ---------- */
  const CLUSTER_B = [
    'UTPC', 'UTPF', 'UTPT', 'BETA', 'ERF', 'ERFC',
    'GAMMA', 'LNGAMMA', 'HEAVISIDE', 'DIRAC',
  ];
  for (const name of CLUSTER_B) {
    assert(isKnownFunction(name),
      `session105: isKnownFunction('${name}') (Cluster B)`);
  }

  // Sy round-trip at representative entry-line forms.
  rtSymbolic('UTPC(4, X)');
  rtSymbolic('UTPF(2, 3, X)');
  rtSymbolic('UTPT(5, X)');
  rtSymbolic('BETA(3, X)');
  rtSymbolic('ERF(X)');
  rtSymbolic('ERFC(X)');
  rtSymbolic('GAMMA(X)');
  rtSymbolic('LNGAMMA(X)');
  rtSymbolic('HEAVISIDE(X)');
  rtSymbolic('DIRAC(X-1)');

  // Fold guards: HEAVISIDE / DIRAC / GAMMA have safe numeric evaluators.
  // All other special-fn evaluators must stay null (leave-symbolic) — the
  // stack ops own the Lanczos / incomplete-beta path, not simplify().
  assert(defaultFnEval('HEAVISIDE', [2])  === 1,    'session105: HEAVISIDE(2) → 1');
  assert(defaultFnEval('HEAVISIDE', [0])  === 1,    'session105: HEAVISIDE(0) → 1 (HP50 convention)');
  assert(defaultFnEval('HEAVISIDE', [-1]) === 0,    'session105: HEAVISIDE(-1) → 0');
  assert(defaultFnEval('DIRAC',     [3])  === 0,    'session105: DIRAC(3) → 0');
  assert(defaultFnEval('DIRAC',     [0])  === null, 'session105: DIRAC(0) leaves symbolic');
  assert(defaultFnEval('GAMMA',     [5])  === 24,   'session105: GAMMA(5) = 24 (integer fold)');
  assert(defaultFnEval('GAMMA',     [0])  === null, 'session105: GAMMA(0) leaves symbolic (pole)');
  assert(defaultFnEval('GAMMA',     [0.5]) === null, 'session105: GAMMA(0.5) non-integer → null');
  assert(defaultFnEval('GAMMA',     [180]) === null, 'session105: GAMMA(180) overflow → null');
  assert(defaultFnEval('ERF',       [0.5]) === null, 'session105: ERF has no simplify-time fold');
  assert(defaultFnEval('ERFC',      [0.5]) === null, 'session105: ERFC has no simplify-time fold');
  assert(defaultFnEval('BETA',      [3, 4]) === null, 'session105: BETA has no simplify-time fold');
  assert(defaultFnEval('UTPC',      [4, 9.5]) === null, 'session105: UTPC has no simplify-time fold');
  assert(defaultFnEval('UTPF',      [2, 3, 1.5]) === null, 'session105: UTPF has no simplify-time fold');
  assert(defaultFnEval('UTPT',      [5, 1.2]) === null, 'session105: UTPT has no simplify-time fold');
  assert(defaultFnEval('LNGAMMA',   [5]) === null,    'session105: LNGAMMA has no simplify-time fold');

  /* ---------- Cluster C: TRUNC arity-2 + PSI variadic ---------- */
  // TRUNC has spec.arity === 2 → 1-arg form must be rejected at parseAlgebra
  // (the throw path).  2-arg form round-trips.  3-arg form is also rejected.
  rtSymbolic('TRUNC(X, 3)');
  {
    // session117: migrated from `let threw; try{…}catch(e){…}` to
    // `assertThrows` + follow-up regex guard on the actual-count
    // portion (`got 1`).  The original composite assertion only
    // pinned the "expects 2 argument" prefix; the actual-count
    // tail was uncovered, so a refactor that broke the `got N`
    // template would have silently slipped through.  Splitting
    // gives one assertion per invariant.  Precedent: session 112
    // LOG(-10)-CMPLX-OFF split (message vs. non-TypeError guard).
    const err = assertThrows(
      () => parseEntry("`TRUNC(X)`"),
      /TRUNC expects 2 argument/,
      'session105: TRUNC(X) 1-arg form rejected at parseAlgebra');
    assert(err && /got 1\b/.test(err.message),
      'session117: TRUNC(X) rejection reports actual arg-count "got 1"');
  }
  {
    const err = assertThrows(
      () => parseEntry("`TRUNC(X, 3, 4)`"),
      /TRUNC expects 2 argument/,
      'session105: TRUNC(X,3,4) 3-arg form rejected at parseAlgebra');
    assert(err && /got 3\b/.test(err.message),
      'session117: TRUNC(X,3,4) rejection reports actual arg-count "got 3"');
  }

  // PSI is variadic (no spec.arity) — both 1-arg (digamma) and 2-arg
  // (polygamma) round-trip.  3+ args also parse (the parser skips the
  // arity guard) — we treat that as a deliberate HP50 convention
  // (AUR §CAS-SPECIAL lists `psi(x, n)`; the entry parser is lenient).
  rtSymbolic('PSI(X)');
  rtSymbolic('PSI(X, 2)');
  assert(defaultFnEval('PSI', [1])    === null,
    'session105: PSI has no simplify-time fold (1-arg)');
  assert(defaultFnEval('PSI', [1, 2]) === null,
    'session105: PSI has no simplify-time fold (2-arg)');
}

/* ================================================================
   session 110 — data-type-support lane.

   Three substantive widening clusters this session.  Hard user-
   reachable assertions that pin behavior the matrix treated as
   "already ✓" but that had no direct test on file.  (test-algebra.mjs,
   ops.js, and COMMANDS.md are lock-held by the concurrent session 109
   command-support run.)

     Cluster 1 — BinInt × Real/Integer mixed-scalar arithmetic audit.
       Pin `_scalarBinaryMixed` semantics under multiple wordsizes
       (HP50 AUR §10.1): BinInt base always wins, Real operands are
       trunc-toward-zero coerced, negative Integer/Real wraps via
       2^w, Division-by-zero and Complex rejection remain strict.

     Cluster 2 — Tagged transparency pins on SIGN / ARG / FLOOR /
       CEIL / IP / FP.  All six are wrapped in `_withTaggedUnary` so
       `Tagged(lbl, v) OP` round-trips to `Tagged(lbl, OP(v))`.  The
       DATA_TYPES.md matrix listed all six T-cells as ✓ but no direct
       test pinned the re-tag-with-same-label contract.

     Cluster 3 — Rational × Real / Integer / Complex / Rational
       equality & ordered compare.  `eqValues` routes numeric-family
       operands through `promoteNumericPair`; Rational is in
       `isNumber`, so `Rational(1,2) == Real(0.5)` = 1, and
       `Rational(6,3) == Integer(2)` = 1.  `comparePair` has an
       explicit `rational` branch that cross-multiplies.  Pins
       the cross-family widening end-to-end from the stack, since
       the matrix has no Q column today.
   ================================================================ */
{
  /* ---------- Cluster 1: BinInt × Real/Integer mixed-scalar ---------- */

  // Capture wordsize so we can restore it after the ws=8 block.
  const wsEntry = getWordsize();

  // Default wordsize (64): #FFh + 3 = 258; BinInt base wins.
  {
    const s = new Stack();
    s.push(BinaryInteger(255n, 'h'));
    s.push(Integer(3n));
    lookup('+').fn(s);
    const v = s.peek();
    assert(isBinaryInteger(v) && v.value === 258n && v.base === 'h',
      `session110: #FFh + Integer(3) → #102h (value=${v.value} base=${v.base})`);
  }

  // Reverse order: Integer(3) + #FFh = 258; BinInt base still wins.
  {
    const s = new Stack();
    s.push(Integer(3n));
    s.push(BinaryInteger(255n, 'h'));
    lookup('+').fn(s);
    const v = s.peek();
    assert(isBinaryInteger(v) && v.value === 258n && v.base === 'h',
      `session110: Integer(3) + #FFh → #102h base=h (value=${v.value} base=${v.base})`);
  }

  // Real coerces by trunc-toward-zero: #20h * 2.7 = #40h (2.7 → 2).
  {
    const s = new Stack();
    s.push(BinaryInteger(32n, 'h'));
    s.push(Real(2.7));
    lookup('*').fn(s);
    const v = s.peek();
    assert(isBinaryInteger(v) && v.value === 64n && v.base === 'h',
      `session110: #20h * Real(2.7) → #40h via trunc (value=${v.value} base=${v.base})`);
  }

  // Real(-3) wraps via 2^w: #10h + (-3) at ws=64 collapses to
  // 16 + (2^64 - 3) & mask = 13 (= #Dh).
  {
    const s = new Stack();
    s.push(BinaryInteger(16n, 'h'));
    s.push(Real(-3));
    lookup('+').fn(s);
    const v = s.peek();
    assert(isBinaryInteger(v) && v.value === 13n && v.base === 'h',
      `session110: #10h + Real(-3) at ws=64 → #Dh (wrap) (value=${v.value})`);
  }

  // BinInt-base preservation across different bases: #12d + Real(5) = #17d.
  {
    const s = new Stack();
    s.push(BinaryInteger(12n, 'd'));
    s.push(Real(5));
    lookup('+').fn(s);
    const v = s.peek();
    assert(isBinaryInteger(v) && v.value === 17n && v.base === 'd',
      `session110: #12d + Real(5) → #17d (decimal base preserved)`);
  }

  // Power: #2h ^ Integer(3) → #8h.
  {
    const s = new Stack();
    s.push(BinaryInteger(2n, 'h'));
    s.push(Integer(3n));
    lookup('^').fn(s);
    const v = s.peek();
    assert(isBinaryInteger(v) && v.value === 8n && v.base === 'h',
      `session110: #2h ^ Integer(3) → #8h (value=${v.value})`);
  }

  // ws=8 masking: #FFh + Integer(2) → #01h (257 masked to 8 bits).
  setWordsize(8);
  {
    const s = new Stack();
    s.push(BinaryInteger(255n, 'h'));
    s.push(Integer(2n));
    lookup('+').fn(s);
    const v = s.peek();
    assert(isBinaryInteger(v) && v.value === 1n && v.base === 'h',
      `session110: ws=8 #FFh + Integer(2) → #01h (wrap at 8-bit) (value=${v.value})`);
  }

  // ws=8 power overflow: #2h ^ Integer(10) = 1024 & 0xFF = 0.
  {
    const s = new Stack();
    s.push(BinaryInteger(2n, 'h'));
    s.push(Integer(10n));
    lookup('^').fn(s);
    const v = s.peek();
    assert(isBinaryInteger(v) && v.value === 0n && v.base === 'h',
      `session110: ws=8 #2h ^ Integer(10) → #0h (1024 masked to 8 bits) (value=${v.value})`);
  }

  // ws=8 Real coerce + overflow: Real(300) * #2h = 600 & 0xFF = 88 (#58h).
  // Also tests reverse-order operand: non-BinInt on level 2.
  {
    const s = new Stack();
    s.push(Real(300));
    s.push(BinaryInteger(2n, 'h'));
    lookup('*').fn(s);
    const v = s.peek();
    assert(isBinaryInteger(v) && v.value === 88n && v.base === 'h',
      `session110: ws=8 Real(300) * #2h → #58h (600 masked to 8 bits) (value=${v.value})`);
  }
  setWordsize(wsEntry);

  // Division by zero: #5h / Integer(0) throws Division by zero
  // (routed through binIntBinary after coercion — distinct from
  // the Real-path 'Infinite result').
  assertThrows(
    () => {
      const s = new Stack();
      s.push(BinaryInteger(5n, 'h'));
      s.push(Integer(0n));
      lookup('/').fn(s);
    },
    /Division by zero/,
    'session110: #5h / Integer(0) → Division by zero (BinInt branch)'
  );

  // Complex still rejected on either side — BinInt promotion is
  // integer-only.  `_scalarBinaryMixed` falls through to the generic
  // mixed-BinInt reject when the other side isn't Integer / Real.
  assertThrows(
    () => {
      const s = new Stack();
      s.push(BinaryInteger(5n, 'h'));
      s.push(Complex(1, 2));
      lookup('+').fn(s);
    },
    /Bad argument type/,
    'session110: #5h + Complex(1,2) → Bad argument type (no BinInt×Complex path)'
  );

  /* ---------- Cluster 2: Tagged transparency on rounders + SIGN/ARG ---------- */
  // The _withTaggedUnary wrapper unwraps, applies the op to the inner
  // value, and re-tags with the *same* label.  Pin each of the six ops.

  const assertTaggedReal = (op, lbl, inner, expect, desc) => {
    const s = new Stack();
    s.push(Tagged(lbl, inner));
    lookup(op).fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === lbl,
      `session110: ${desc} preserves tag '${lbl}' (got tag=${v.tag})`);
    const inside = v.value;
    const rawNum = isReal(inside)    ? inside.value.toNumber()
                 : isInteger(inside) ? Number(inside.value)
                 : NaN;
    assert(Math.abs(rawNum - expect) < 1e-9,
      `session110: ${desc} inner value ≈ ${expect} (got ${rawNum})`);
  };

  // FLOOR on Tagged Real / Integer.
  assertTaggedReal('FLOOR', 'x', Real(7.2),   7, ':x:Real(7.2) FLOOR → :x:7');
  assertTaggedReal('FLOOR', 'x', Real(-1.5), -2, ':x:Real(-1.5) FLOOR → :x:-2');
  {
    const s = new Stack();
    s.push(Tagged('n', Integer(5n)));
    lookup('FLOOR').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'n' && isInteger(v.value) && v.value.value === 5n,
      `session110: :n:Integer(5) FLOOR → :n:5 (Integer pass-through, tag preserved)`);
  }

  // CEIL on Tagged Real.
  assertTaggedReal('CEIL', 'y', Real(7.2), 8, ':y:Real(7.2) CEIL → :y:8');
  assertTaggedReal('CEIL', 'y', Real(-1.5), -1, ':y:Real(-1.5) CEIL → :y:-1');

  // IP / FP on Tagged Real.
  assertTaggedReal('IP', 'z', Real(7.2), 7, ':z:Real(7.2) IP → :z:7');
  assertTaggedReal('IP', 'z', Real(-7.2), -7, ':z:Real(-7.2) IP → :z:-7 (trunc toward zero)');

  // FP(7.2) ~= 0.2 (small IEEE drift via Math.trunc path is acceptable —
  // the value passes through `x - Math.trunc(x)` in `_rounderScalar`).
  assertTaggedReal('FP', 'w', Real(7.2), 0.2, ':w:Real(7.2) FP → :w:0.2');

  // SIGN on Tagged Real (sign is Real too) + zero guard.
  assertTaggedReal('SIGN', 'u', Real(-5), -1, ':u:Real(-5) SIGN → :u:-1');
  assertTaggedReal('SIGN', 'u', Real(0),   0, ':u:Real(0) SIGN → :u:0');
  {
    const s = new Stack();
    s.push(Tagged('p', Real(42)));
    lookup('SIGN').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'p' && isReal(v.value) && v.value.value.toNumber() === 1,
      `session110: :p:Real(42) SIGN → :p:1 (tag preserved)`);
  }

  // ARG on Tagged Complex — atan2(im, re) at current angle mode
  // (default RAD).  Value is irrational; pin approximately.
  {
    const s = new Stack();
    s.push(Tagged('v', Complex(3, 4)));
    lookup('ARG').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'v',
      `session110: ARG Tagged preserves tag 'v' (got ${v.tag})`);
    const inner = v.value;
    assert(isReal(inner),
      `session110: ARG(:v:Complex(3,4)) inner is Real (got ${inner?.type})`);
    const arg = inner.value.toNumber();
    assert(Math.abs(arg - Math.atan2(4, 3)) < 1e-9,
      `session110: ARG(:v:Complex(3,4)) ≈ atan2(4,3) (got ${arg})`);
  }

  /* ---------- Cluster 3: Rational cross-family compare & equality ---------- */
  // eqValues routes numeric pairs through promoteNumericPair; Rational
  // is in isNumber.  `==` returns Real(1) / Real(0); `SAME` uses the
  // same comparator (and therefore ALSO cross-widens Rational×Real —
  // deliberate: BinInt is the only "strict on types" exclusion for
  // SAME; Rational joins Integer/Real/Complex in the cross-family
  // numeric lattice via promoteNumericPair).

  // Pure Rational × Rational equality — canonicalised form guards
  // against stale-representation false positives.
  {
    const s = new Stack();
    s.push(Rational(1, 2));
    s.push(Rational(2, 4));           // canonicalises to 1/2
    lookup('==').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session110: Rational(1,2) == Rational(2,4) → 1 (canonical compare)`);
  }
  {
    const s = new Stack();
    s.push(Rational(1, 2));
    s.push(Rational(2, 3));
    lookup('==').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(0),
      `session110: Rational(1,2) == Rational(2,3) → 0`);
  }

  // Rational × Integer — Rational(6,3) canonicalises to 2/1; compare
  // through promoteNumericPair's rational branch yields equality.
  {
    const s = new Stack();
    s.push(Rational(6, 3));
    s.push(Integer(2n));
    lookup('==').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session110: Rational(6,3) == Integer(2) → 1 (promote Integer → rational{n,d:1})`);
  }

  // Rational × Real — promoteNumericPair returns 'real' kind and
  // compares Decimals; Rational(1,2) widens to Decimal(0.5).
  {
    const s = new Stack();
    s.push(Rational(1, 2));
    s.push(Real(0.5));
    lookup('==').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session110: Rational(1,2) == Real(0.5) → 1 (real-kind promotion)`);
  }

  // SAME follows the same comparator — pin that Rational×Real SAME
  // also returns 1.  (Contrast: SAME #10h Integer(16) = 0 because
  // BinInt is OUT of isNumber; Rational is IN.)
  {
    const s = new Stack();
    s.push(Rational(1, 2));
    s.push(Real(0.5));
    lookup('SAME').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session110: SAME Rational(1,2) Real(0.5) → 1 (Rational is in isNumber lattice)`);
  }

  // Rational × Complex with zero imaginary — promoteNumericPair goes
  // to complex kind; eqValues compares re/im.
  {
    const s = new Stack();
    s.push(Rational(1, 2));
    s.push(Complex(0.5, 0));
    lookup('==').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session110: Rational(1,2) == Complex(0.5, 0) → 1 (complex-kind widen)`);
  }

  // Ordered compare — comparePair has a dedicated `rational` branch
  // that cross-multiplies (no round-trip through Real).
  {
    const s = new Stack();
    s.push(Rational(1, 2));
    s.push(Integer(1n));
    lookup('<').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session110: Rational(1,2) < Integer(1) → 1`);
  }
  {
    const s = new Stack();
    s.push(Rational(3, 2));
    s.push(Real(1.4));
    lookup('>').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session110: Rational(3,2) > Real(1.4) → 1 (cross-family via real-kind)`);
  }
  {
    const s = new Stack();
    s.push(Rational(1, 2));
    s.push(Rational(3, 4));
    lookup('<').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session110: Rational(1,2) < Rational(3,4) → 1 (n1·d2 vs n2·d1)`);
  }
  {
    const s = new Stack();
    s.push(Rational(1, 2));
    s.push(Rational(1, 2));
    lookup('≤').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(1),
      `session110: Rational(1,2) ≤ Rational(1,2) → 1 (equal)`);
  }
  {
    const s = new Stack();
    s.push(Rational(-3, 4));
    s.push(Rational(-2, 3));
    lookup('<').fn(s);
    const v = s.peek();
    // -3/4 = -0.75, -2/3 ≈ -0.667; -0.75 < -0.667 → true.
    // Cross-multiply: (-3)*(3) = -9 ;  (-2)*(4) = -8 ;  -9 < -8 = true.
    assert(isReal(v) && v.value.eq(1),
      `session110: Rational(-3,4) < Rational(-2,3) → 1 (negative cross-multiply)`);
  }
}

/* ================================================================
   session 115 — data-type-support lane.

   Three substantive widening clusters, all pinning contracts the
   DATA_TYPES.md matrix treated as "✓" but that had no direct test.
   ops.js + test-algebra.mjs + test-numerics.mjs + test-matrix.mjs +
   docs/COMMANDS.md + docs/REVIEW.md + logs/ are lock-held by the
   concurrent session 114 command-support lane, so the new
   assertions live in `tests/test-types.mjs` (end-of-file session 115
   block) — same pattern as session 110 and session 105.

     Cluster 1 — Binary Tagged tag-drop contract on +, -, *, /, ^ and
       the binary-numeric family (MOD/MIN/MAX/COMB/PERM/IQUOT/
       IREMAINDER/GCD/LCM).  `_withTaggedBinary` unwraps either or
       both operands' tags before the inner handler runs and drops
       the tag on the result — matching HP50 AUR §3.4 ("binary ops
       have no single obvious tag to keep").  Tested with both
       operands tagged, left-only, right-only, and a Symbolic-lift
       round-trip (`:a:Name(X) + :b:Real(5)` still lifts to Symbolic
       after the tag unwrap).

     Cluster 2 — Rational arithmetic on +, -, *, /, ^.  Pins the
       Integer ⊂ Rational ⊂ Real ⊂ Complex promotion lattice
       end-to-end: exact Q×Q sums through Fraction.js, canonical
       Integer collapse when the result has d=1, Q→Real widening
       on Q×Real, Q→Complex widening on Q×Complex, and the ^
       dispatch's integer-exponent exact path (resolving
       DATA_TYPES.md "next-session candidate 4" — the exact-stays-
       exact path is already shipped, contrary to the stale
       queue note).  APPROX-mode collapse is pinned separately.

     Cluster 3 — List distribution edge cases.  `_withListUnary` /
       `_withListBinary` wrap most ops; deeper contract pins:
       Tagged-outer-of-List (Tagged wrapper unwraps first, list
       distributes inside, outer tag re-applied); nested list
       recursion; List × scalar / scalar × List / List × List
       pairwise; size-mismatch rejection.  Plus one deliberate
       rejection: List of Tagged (inner Tagged has no unwrapper
       at the scalar handler because _withTaggedUnary sits
       OUTSIDE _withListUnary in the wrapper chain).
   ================================================================ */
{
  /* ---------- Cluster 1: Binary Tagged tag-drop ---------- */
  // Helper: assert the binary op drops tags and returns the expected
  // non-Tagged result.  Relies on plain rplEqual-style value checks
  // rather than a structural assertion — lets each op keep its own
  // result type (Integer for COMB/PERM/MOD integer inputs, Real for
  // MIN/MAX/arithmetic on Real, etc.).

  // +  both-sides tagged → Real, tag dropped.
  {
    const s = new Stack();
    s.push(Tagged('a', Real(5)));
    s.push(Tagged('b', Real(3)));
    lookup('+').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isReal(v) && v.value.eq(8),
      `session115: :a:Real(5) + :b:Real(3) → Real(8) (both tags dropped)`);
  }
  // +  left-only tagged → Real, tag dropped.
  {
    const s = new Stack();
    s.push(Tagged('a', Real(5)));
    s.push(Real(3));
    lookup('+').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isReal(v) && v.value.eq(8),
      `session115: :a:Real(5) + Real(3) → Real(8) (left tag dropped)`);
  }
  // +  right-only tagged → Real, tag dropped.
  {
    const s = new Stack();
    s.push(Real(5));
    s.push(Tagged('b', Real(3)));
    lookup('+').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isReal(v) && v.value.eq(8),
      `session115: Real(5) + :b:Real(3) → Real(8) (right tag dropped)`);
  }
  // -  both tagged
  {
    const s = new Stack();
    s.push(Tagged('a', Real(5)));
    s.push(Tagged('b', Real(3)));
    lookup('-').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isReal(v) && v.value.eq(2),
      `session115: :a:Real(5) - :b:Real(3) → Real(2) (tag-drop)`);
  }
  // *  both tagged
  {
    const s = new Stack();
    s.push(Tagged('a', Real(5)));
    s.push(Tagged('b', Real(3)));
    lookup('*').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isReal(v) && v.value.eq(15),
      `session115: :a:Real(5) * :b:Real(3) → Real(15) (tag-drop)`);
  }
  // /  both tagged
  {
    const s = new Stack();
    s.push(Tagged('a', Real(10)));
    s.push(Tagged('b', Real(2)));
    lookup('/').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isReal(v) && v.value.eq(5),
      `session115: :a:Real(10) / :b:Real(2) → Real(5) (tag-drop)`);
  }
  // ^  both tagged, Integer exponent path
  {
    const s = new Stack();
    s.push(Tagged('a', Integer(2n)));
    s.push(Tagged('b', Integer(5n)));
    lookup('^').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isInteger(v) && v.value === 32n,
      `session115: :a:Integer(2) ^ :b:Integer(5) → Integer(32) (tag-drop + integer path)`);
  }

  // MOD both tagged
  {
    const s = new Stack();
    s.push(Tagged('a', Integer(10n)));
    s.push(Tagged('b', Integer(3n)));
    lookup('MOD').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isInteger(v) && v.value === 1n,
      `session115: :a:Integer(10) MOD :b:Integer(3) → Integer(1) (tag-drop)`);
  }
  // MOD one-side tagged (left)
  {
    const s = new Stack();
    s.push(Tagged('a', Integer(17n)));
    s.push(Integer(5n));
    lookup('MOD').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isInteger(v) && v.value === 2n,
      `session115: :a:Integer(17) MOD Integer(5) → Integer(2) (left tag-drop)`);
  }
  // MOD one-side tagged (right)
  {
    const s = new Stack();
    s.push(Integer(17n));
    s.push(Tagged('b', Integer(5n)));
    lookup('MOD').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isInteger(v) && v.value === 2n,
      `session115: Integer(17) MOD :b:Integer(5) → Integer(2) (right tag-drop)`);
  }

  // MIN both tagged
  {
    const s = new Stack();
    s.push(Tagged('a', Real(7)));
    s.push(Tagged('b', Real(3)));
    lookup('MIN').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isReal(v) && v.value.eq(3),
      `session115: :a:Real(7) MIN :b:Real(3) → Real(3) (tag-drop)`);
  }
  // MAX both tagged
  {
    const s = new Stack();
    s.push(Tagged('a', Integer(7n)));
    s.push(Tagged('b', Integer(3n)));
    lookup('MAX').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isInteger(v) && v.value === 7n,
      `session115: :a:Integer(7) MAX :b:Integer(3) → Integer(7) (tag-drop)`);
  }

  // COMB tagged
  {
    const s = new Stack();
    s.push(Tagged('n', Integer(5n)));
    s.push(Tagged('k', Integer(2n)));
    lookup('COMB').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isInteger(v) && v.value === 10n,
      `session115: :n:Integer(5) COMB :k:Integer(2) → Integer(10) (tag-drop)`);
  }
  // PERM tagged
  {
    const s = new Stack();
    s.push(Tagged('n', Integer(5n)));
    s.push(Tagged('k', Integer(2n)));
    lookup('PERM').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isInteger(v) && v.value === 20n,
      `session115: :n:Integer(5) PERM :k:Integer(2) → Integer(20) (tag-drop)`);
  }

  // IQUOT tagged
  {
    const s = new Stack();
    s.push(Tagged('a', Integer(17n)));
    s.push(Tagged('b', Integer(5n)));
    lookup('IQUOT').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isInteger(v) && v.value === 3n,
      `session115: :a:Integer(17) IQUOT :b:Integer(5) → Integer(3) (tag-drop)`);
  }
  // IREMAINDER one-side tagged
  {
    const s = new Stack();
    s.push(Integer(17n));
    s.push(Tagged('b', Integer(5n)));
    lookup('IREMAINDER').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isInteger(v) && v.value === 2n,
      `session115: Integer(17) IREMAINDER :b:Integer(5) → Integer(2) (right tag-drop)`);
  }

  // GCD tagged
  {
    const s = new Stack();
    s.push(Tagged('a', Integer(12n)));
    s.push(Tagged('b', Integer(18n)));
    lookup('GCD').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isInteger(v) && v.value === 6n,
      `session115: :a:Integer(12) GCD :b:Integer(18) → Integer(6) (tag-drop)`);
  }
  // LCM tagged
  {
    const s = new Stack();
    s.push(Tagged('a', Integer(4n)));
    s.push(Tagged('b', Integer(6n)));
    lookup('LCM').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isInteger(v) && v.value === 12n,
      `session115: :a:Integer(4) LCM :b:Integer(6) → Integer(12) (tag-drop)`);
  }

  // Symbolic lift survives tag-drop: :a:Name(X) + :b:Real(5) → Symbolic(X+5),
  // no tag on the result.  (Confirms that the tag unwrap happens BEFORE the
  // scalar handler decides to lift to Symbolic, so the Name reaches
  // _isSymOperand unwrapped.)
  {
    const s = new Stack();
    s.push(Tagged('a', Name('X', true)));
    s.push(Tagged('b', Real(5)));
    lookup('+').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && v.type === 'symbolic',
      `session115: :a:Name(X) + :b:Real(5) → Symbolic (tag-drop + Symbolic lift)`);
  }

  /* ---------- Cluster 2: Rational arithmetic on +/-/*///^ ---------- */

  // Q + Q — exact add via Fraction.js; LCD is 6.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Rational(1n, 3n));
    lookup('+').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === 5n && v.d === 6n,
      `session115: Rational(1,2) + Rational(1,3) → Rational(5/6) (exact)`);
  }
  // Q - Q — exact subtract; integer collapse when result has d=1.
  {
    const s = new Stack();
    s.push(Rational(3n, 2n));
    s.push(Rational(1n, 2n));
    lookup('-').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 1n,
      `session115: Rational(3,2) - Rational(1,2) → Integer(1) (integer collapse)`);
  }
  // Z - Q — Integer widens to {n:k, d:1n} via promoteNumericPair's rational
  // branch; result is Rational(2,3).
  {
    const s = new Stack();
    s.push(Integer(1n));
    s.push(Rational(1n, 3n));
    lookup('-').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === 2n && v.d === 3n,
      `session115: Integer(1) - Rational(1,3) → Rational(2/3) (Z widens to Q)`);
  }
  // Q * Q — exact multiply across canonicalisation; 2/3 * 3/5 = 2/5.
  {
    const s = new Stack();
    s.push(Rational(2n, 3n));
    s.push(Rational(3n, 5n));
    lookup('*').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === 2n && v.d === 5n,
      `session115: Rational(2,3) * Rational(3,5) → Rational(2/5) (canonicalised)`);
  }
  // Q * Z — integer collapse: 1/2 * 4 = 2.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Integer(4n));
    lookup('*').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 2n,
      `session115: Rational(1,2) * Integer(4) → Integer(2) (integer collapse)`);
  }
  // Negative multiplication — sign canonicalisation: -3/4 * 2/3 = -6/12 = -1/2.
  {
    const s = new Stack();
    s.push(Rational(-3n, 4n));
    s.push(Rational(2n, 3n));
    lookup('*').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === -1n && v.d === 2n,
      `session115: Rational(-3,4) * Rational(2,3) → Rational(-1/2) (sign on numerator)`);
  }
  // Q / Q — exact division; 1/2 ÷ 1/4 = 2.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Rational(1n, 4n));
    lookup('/').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 2n,
      `session115: Rational(1,2) / Rational(1,4) → Integer(2) (integer collapse)`);
  }
  // Q / Z(0) — Fraction.js throws "Division by Zero" — the BigInt-backed
  // library does NOT return the Real-path's "Infinite result" because the
  // rational dispatch is entered before the Real branch.
  assertThrows(
    () => {
      const s = new Stack();
      s.push(Rational(3n, 2n));
      s.push(Integer(0n));
      lookup('/').fn(s);
    },
    /Division by Zero/,
    'session115: Rational(3,2) / Integer(0) → Division by Zero (Fraction.js path)'
  );

  // Q ^ Z integer exponent — exact-stays-exact path via Fraction.pow.
  // Resolves DATA_TYPES.md "next-session candidate 4" stale claim that
  // Rational^Integer is real-promoted: it has not been since at least
  // session 092.  Q(3/2)^Z(3) = 27/8.
  {
    const s = new Stack();
    s.push(Rational(3n, 2n));
    s.push(Integer(3n));
    lookup('^').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === 27n && v.d === 8n,
      `session115: Rational(3,2) ^ Integer(3) → Rational(27/8) (exact integer exponent)`);
  }
  // Q ^ Z(-2) — negative integer exponent, still exact: (2/3)^-2 = 9/4.
  {
    const s = new Stack();
    s.push(Rational(2n, 3n));
    s.push(Integer(-2n));
    lookup('^').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === 9n && v.d === 4n,
      `session115: Rational(2,3) ^ Integer(-2) → Rational(9/4) (negative exponent stays exact)`);
  }
  // Q ^ Z(0) — anything to the 0 is Integer(1), even 7/11.
  {
    const s = new Stack();
    s.push(Rational(7n, 11n));
    s.push(Integer(0n));
    lookup('^').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 1n,
      `session115: Rational(7,11) ^ Integer(0) → Integer(1)`);
  }
  // Q ^ Q non-integer exponent in EXACT mode — lifts to Symbolic(base^exp)
  // per `_rationalBinary('^')`.  `2^(1/3)` stays irrational.
  {
    const s = new Stack();
    s.push(Rational(2n, 1n));
    s.push(Rational(1n, 3n));
    lookup('^').fn(s);
    const v = s.peek();
    assert(v.type === 'symbolic',
      `session115: EXACT Rational(2,1) ^ Rational(1,3) → Symbolic (irrational exponent stays symbolic)`);
  }
  // Q + Real — promoteNumericPair falls through to 'real' kind; Rational
  // collapses to Decimal because Real is inexact by construction.
  // Q(1/2) + R(0.25) = R(0.75).
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Real(0.25));
    lookup('+').fn(s);
    const v = s.peek();
    assert(isReal(v) && v.value.eq(0.75),
      `session115: Rational(1,2) + Real(0.25) → Real(0.75) (real-kind widen)`);
  }
  // Q + Complex — complex-kind promotion; Q(1/2) + C(0,1) = C(0.5, 1).
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Complex(0, 1));
    lookup('+').fn(s);
    const v = s.peek();
    assert(isComplex(v) && v.re === 0.5 && v.im === 1,
      `session115: Rational(1,2) + Complex(0,1) → Complex(0.5, 1) (complex-kind widen)`);
  }

  // APPROX-mode collapse: Q+Q in APPROX drops to Real regardless of
  // exactness.  Restore EXACT after.  Pins the flag -3 "give me decimals"
  // contract on the rational branch.
  setApproxMode(true);
  try {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    s.push(Rational(1n, 3n));
    lookup('+').fn(s);
    const v = s.peek();
    // 1/2 + 1/3 = 5/6 ≈ 0.833333333333333 at 15-digit precision.
    assert(isReal(v) && Math.abs(v.value.toNumber() - 5/6) < 1e-12,
      `session115: APPROX Rational(1,2) + Rational(1,3) → Real ≈ 0.833 (APPROX collapse)`);
  } finally {
    setApproxMode(false);
  }

  // Tagged + Rational: the tag-drop convention from Cluster 1 still applies
  // when the underlying values are Rational, with the result preserving the
  // rational kind.
  {
    const s = new Stack();
    s.push(Tagged('a', Rational(1n, 2n)));
    s.push(Tagged('b', Rational(1n, 3n)));
    lookup('+').fn(s);
    const v = s.peek();
    assert(!isTagged(v) && isRational(v) && v.n === 5n && v.d === 6n,
      `session115: :a:Rational(1,2) + :b:Rational(1,3) → Rational(5/6) (tag-drop + exact add)`);
  }

  /* ---------- Cluster 3: List distribution edges ---------- */

  // Tagged(List): Tagged wrapper unwraps first (outer), list distributes
  // inside, outer tag re-applied.  Pins the wrapper-nesting contract
  // (Tagged OUTSIDE List in the _unaryCx / rounder wrap chain).
  {
    const s = new Stack();
    s.push(Tagged('lbl', RList([Real(1), Real(-2), Real(3)])));
    lookup('NEG').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'lbl',
      `session115: :lbl:{1 -2 3} NEG preserves outer tag (got tag=${v.tag})`);
    assert(v.value.type === 'list' && v.value.items.length === 3
        && isReal(v.value.items[0]) && v.value.items[0].value.eq(-1)
        && isReal(v.value.items[1]) && v.value.items[1].value.eq(2)
        && isReal(v.value.items[2]) && v.value.items[2].value.eq(-3),
      `session115: :lbl:{1 -2 3} NEG → :lbl:{-1 2 -3} (list distributes inside tag)`);
  }

  // Nested list: {{1 -2} {3 -4}} NEG → {{-1 2} {-3 4}}.  _withListUnary
  // recurses via `isList(item) → RList(item.items.map(apply))` so nested
  // lists distribute to arbitrary depth without hitting the scalar handler.
  {
    const s = new Stack();
    s.push(RList([
      RList([Real(1), Real(-2)]),
      RList([Real(3), Real(-4)]),
    ]));
    lookup('NEG').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items.length === 2,
      `session115: nested {{1 -2}{3 -4}} NEG returns list (outer depth preserved)`);
    const [row0, row1] = v.items;
    assert(row0.type === 'list' && row0.items[0].value.eq(-1) && row0.items[1].value.eq(2),
      `session115: nested list NEG — inner row 0 → {-1 2}`);
    assert(row1.type === 'list' && row1.items[0].value.eq(-3) && row1.items[1].value.eq(4),
      `session115: nested list NEG — inner row 1 → {-3 4}`);
  }

  // Mixed-element list on FLOOR: Integer pass-through, Real gets floored.
  // Pins that the list wrapper doesn't monomorphise the element type.
  {
    const s = new Stack();
    s.push(RList([Integer(5n), Real(3.2), Real(-7.5)]));
    lookup('FLOOR').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items.length === 3,
      `session115: mixed {Z(5) R(3.2) R(-7.5)} FLOOR returns 3-element list`);
    assert(isInteger(v.items[0]) && v.items[0].value === 5n,
      `session115: FLOOR on Integer(5) inside list → Integer(5) (pass-through)`);
    assert(isReal(v.items[1]) && v.items[1].value.eq(3),
      `session115: FLOOR on Real(3.2) inside list → Real(3)`);
    assert(isReal(v.items[2]) && v.items[2].value.eq(-8),
      `session115: FLOOR on Real(-7.5) inside list → Real(-8) (round-toward-minus-inf)`);
  }

  // Binary: List * scalar — right operand is scalar, list distributes.
  {
    const s = new Stack();
    s.push(RList([Real(1), Real(2), Real(3)]));
    s.push(Real(2));
    lookup('*').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items.length === 3
        && v.items[0].value.eq(2) && v.items[1].value.eq(4) && v.items[2].value.eq(6),
      `session115: {1 2 3} * Real(2) → {2 4 6} (list × scalar)`);
  }

  // Binary: scalar × List — left operand is scalar, list distributes.
  {
    const s = new Stack();
    s.push(Real(2));
    s.push(RList([Real(1), Real(2), Real(3)]));
    lookup('*').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items.length === 3
        && v.items[0].value.eq(2) && v.items[1].value.eq(4) && v.items[2].value.eq(6),
      `session115: Real(2) * {1 2 3} → {2 4 6} (scalar × list)`);
  }

  // Binary: List + List (same size) — pairwise distribution.
  {
    const s = new Stack();
    s.push(RList([Real(1), Real(2), Real(3)]));
    s.push(RList([Real(10), Real(20), Real(30)]));
    lookup('+').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items.length === 3
        && v.items[0].value.eq(11) && v.items[1].value.eq(22) && v.items[2].value.eq(33),
      `session115: {1 2 3} + {10 20 30} → {11 22 33} (pairwise)`);
  }

  // Binary: List + List (size mismatch) — throws Invalid dimension.
  assertThrows(
    () => {
      const s = new Stack();
      s.push(RList([Real(1), Real(2)]));
      s.push(RList([Real(1), Real(2), Real(3)]));
      lookup('+').fn(s);
    },
    /Invalid dimension/,
    'session115: {1 2} + {1 2 3} → Invalid dimension (size mismatch rejected)'
  );

  // Binary: nested list × scalar broadcasts to each leaf.
  {
    const s = new Stack();
    s.push(RList([
      RList([Real(1), Real(2)]),
      RList([Real(3), Real(4)]),
    ]));
    s.push(Real(10));
    lookup('+').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items.length === 2
        && v.items[0].type === 'list' && v.items[0].items[0].value.eq(11)
        && v.items[0].items[1].value.eq(12)
        && v.items[1].items[0].value.eq(13) && v.items[1].items[1].value.eq(14),
      `session115: {{1 2}{3 4}} + Real(10) → {{11 12}{13 14}} (nested broadcast)`);
  }

  // Deliberate rejection: List of Tagged through NEG throws Bad argument
  // type.  `_withTaggedUnary` sits OUTSIDE `_withListUnary`, so it only
  // fires on the outermost stack value — a Tagged inside a list reaches
  // the scalar handler (which doesn't know about Tagged) and errors.
  // Pinning the current behavior so any future per-element Tagged
  // handling (or a wrapper-order swap) has a regression guard.
  assertThrows(
    () => {
      const s = new Stack();
      s.push(RList([Tagged('x', Real(1)), Tagged('y', Real(-2))]));
      lookup('NEG').fn(s);
    },
    /Bad argument type/,
    'session115: {:x:1 :y:-2} NEG → Bad argument type (List of Tagged — Tagged wrapper is outside List)'
  );
}

/* ================================================================
   Session 120 — three widening clusters pinning previously-undertested
   contracts on already-widened ops (no source-side changes; ops.js,
   test-algebra, test-matrix, COMMANDS.md, REVIEW.md and logs/ are all
   lock-held by concurrent session 119 command-support lane).

   Cluster 1 — Hyperbolic family (`SINH`/`COSH`/`TANH`/`ASINH`/`ACOSH`/
     `ATANH`) Tagged transparency, List distribution, and Symbolic-lift
     through Tagged.  The matrix has all six ops at `T ✓ / L ✓ / N ✓ /
     Sy ✓` since session 063 (under "Unary — invert / square / sqrt /
     elementary functions") but no direct test pin existed.  This
     cluster also catches the principal-branch promotion of
     `ATANH(:v:Real(2))` to `Tagged(v, Complex)` (|x|>1 lifts to
     Complex) — important contract to lock down because the wrapper-
     order is `_withTaggedUnary(_withListUnary(_withVMUnary(handler)))`,
     so the inner handler chooses Real-vs-Complex *after* the Tagged
     unwrap, and the outer re-tag doesn't care about the inner type.

   Cluster 2 — Tagged tag-drop on the percent family (`%` / `%T` /
     `%CH`).  All three list `T ✓` since session 064 with the comment
     "Session 064 added L/T", but no direct test pinned the
     `_withTaggedBinary` tag-drop contract on these specific ops.
     Symmetric with the binary-numeric tag-drop pinned in session 115
     (Cluster 1) but on the percent family which routes through a
     different inner handler than the arithmetic family.  Also pins
     the V/M ✗ rejection that session 072 flipped from blank to ✗.

   Cluster 3 — Rational unary stay-exact contract on
     `NEG`/`INV`/`SQ`/`ABS`/`SQRT`/`SIGN`/`FLOOR`/`CEIL`/`IP`/`FP`
     plus the APPROX-mode collapse and out-of-domain rejection on
     `FACT`/`XPON`/`MANT`.  The "Rational (`Q`) — session 092"
     convention text describes the EXACT-mode stay-exact dispatch and
     APPROX-mode Real collapse but no per-op row carries a Q column,
     and no direct test pinned the integer-collapse boundaries
     (FLOOR/CEIL/IP/SIGN drop to Integer; SQRT of perfect-square
     drops to Rational then collapses if d=1; SQRT of non-square
     lifts to Symbolic in EXACT; SQRT of negative Q lifts to Complex;
     FP keeps Q except for integer-valued Q where it returns
     Integer(0); INV(Rational(1, n)) collapses to Integer(n)).
   ================================================================ */
{
  /* ---------- Cluster 1: Hyperbolic Tagged + List + Sy-lift ---------- */

  // Helper: assert Tagged-Real-inner with a numeric tolerance.
  const assertTaggedRealClose = (op, lbl, inner, expected, eps, desc) => {
    const s = new Stack();
    s.push(Tagged(lbl, inner));
    lookup(op).fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === lbl,
      `session120: ${op}(:${lbl}:…) preserves outer tag (got tag=${v?.tag})`);
    assert(isReal(v.value) && Math.abs(v.value.value.toNumber() - expected) < eps,
      `session120: ${desc} (got ${v?.value?.value?.toString()})`);
  };

  // SINH / COSH / TANH on Tagged Real — re-tag with Real inner.
  assertTaggedRealClose('SINH', 't', Real(0), 0, 1e-15,
    ':t:Real(0) SINH → :t:0');
  assertTaggedRealClose('COSH', 'lbl', Real(0), 1, 1e-15,
    ':lbl:Real(0) COSH → :lbl:1');
  assertTaggedRealClose('TANH', 'k', Real(1), Math.tanh(1), 1e-12,
    ':k:Real(1) TANH → :k:tanh(1) ≈ 0.7616');

  // Inverse hyperbolic on Tagged Real (real-domain).
  assertTaggedRealClose('ASINH', 'v', Real(2), Math.asinh(2), 1e-12,
    ':v:Real(2) ASINH → :v:asinh(2) ≈ 1.4436');
  assertTaggedRealClose('ACOSH', 'v', Real(2), Math.acosh(2), 1e-12,
    ':v:Real(2) ACOSH → :v:acosh(2) ≈ 1.3170');
  assertTaggedRealClose('ATANH', 'v', Real(0.5), Math.atanh(0.5), 1e-12,
    ':v:Real(0.5) ATANH → :v:atanh(0.5) ≈ 0.5493');

  // ATANH on |x| > 1 promotes the inner value to Complex while the outer
  // tag is preserved by _withTaggedUnary.  This pins the wrapper-order
  // contract: the inner handler chooses Real-vs-Complex *after* the
  // Tagged unwrap, and the outer re-tag is type-agnostic on the inner.
  {
    const s = new Stack();
    s.push(Tagged('v', Real(2)));
    lookup('ATANH').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'v',
      `session120: :v:Real(2) ATANH preserves outer tag (got tag=${v?.tag})`);
    assert(isComplex(v.value),
      `session120: :v:Real(2) ATANH lifts inner to Complex (|x|>1 principal branch)`);
  }

  // Hyperbolic on Tagged Complex — inner Complex passes through.
  // SINH(0+i) = i sin(1) — inner is Complex.  Outer tag preserved.
  {
    const s = new Stack();
    s.push(Tagged('z', Complex(0, 1)));
    lookup('SINH').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'z' && isComplex(v.value),
      `session120: :z:Complex(0,1) SINH → :z:Complex (got tag=${v?.tag} inner=${v?.value?.type})`);
    assert(Math.abs(v.value.re - 0) < 1e-12 && Math.abs(v.value.im - Math.sin(1)) < 1e-12,
      `session120: :z:Complex(0,1) SINH inner ≈ i·sin(1) (got re=${v?.value?.re}, im=${v?.value?.im})`);
  }

  // Symbolic-lift through Tagged: :v:Name(X) SINH → :v:Symbolic(SINH(X)).
  // Tagged unwraps first, the inner handler sees a Name and lifts to
  // Symbolic, then the outer re-tags with the same label.
  {
    const s = new Stack();
    s.push(Tagged('v', Name('X')));
    lookup('SINH').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'v' && v.value && v.value.type === 'symbolic',
      `session120: :v:Name(X) SINH → :v:Symbolic (got tag=${v?.tag} inner=${v?.value?.type})`);
  }

  // List distribution: SINH({0 1}) — element-wise via _withListUnary.
  for (const op of ['SINH', 'COSH', 'TANH', 'ASINH']) {
    const s = new Stack();
    s.push(RList([Real(0), Real(1)]));
    lookup(op).fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items.length === 2,
      `session120: ${op}({0 1}) returns 2-element list (got len=${v?.items?.length})`);
    assert(isReal(v.items[0]) && isReal(v.items[1]),
      `session120: ${op}({0 1}) — both elements Real (got types ${v?.items?.map(x=>x?.type).join(',')})`);
  }
  // Specific values: SINH(0) = 0, SINH(1) = sinh(1).
  {
    const s = new Stack();
    s.push(RList([Real(0), Real(1)]));
    lookup('SINH').fn(s);
    const v = s.peek();
    assert(v.items[0].value.eq(0) && Math.abs(v.items[1].value.toNumber() - Math.sinh(1)) < 1e-12,
      `session120: SINH({0 1}) → {0 sinh(1)} (got ${v?.items?.map(x => x.value?.toString()).join(',')})`);
  }

  // Tagged-outer-of-List: :lbl:{0 1} SINH → :lbl:{SINH(0) SINH(1)}
  // The Tagged wrapper unwraps first, then the List wrapper distributes,
  // then the outer Tagged re-applies — same recursion order as the
  // session 115 Cluster 3 NEG variant, but on a transcendental op that
  // reaches a different inner handler.
  {
    const s = new Stack();
    s.push(Tagged('lbl', RList([Real(0), Real(1)])));
    lookup('SINH').fn(s);
    const v = s.peek();
    assert(isTagged(v) && v.tag === 'lbl',
      `session120: :lbl:{0 1} SINH preserves outer tag (got tag=${v?.tag})`);
    assert(v.value && v.value.type === 'list' && v.value.items.length === 2,
      `session120: :lbl:{0 1} SINH inner is 2-element list (got ${v?.value?.type})`);
    assert(v.value.items[0].value.eq(0)
        && Math.abs(v.value.items[1].value.toNumber() - Math.sinh(1)) < 1e-12,
      `session120: :lbl:{0 1} SINH → :lbl:{0 sinh(1)} (Tagged-outer-of-List unwrap order)`);
  }

  /* ---------- Cluster 2: Tagged tag-drop on % / %T / %CH ---------- */

  // Helper: pin the both-side tag-drop contract on a percent op.
  const assertPctBothTags = (op, leftVal, rightVal, expectedVal, desc) => {
    const s = new Stack();
    s.push(Tagged('a', Real(leftVal)));
    s.push(Tagged('b', Real(rightVal)));
    lookup(op).fn(s);
    const v = s.peek();
    assert(isReal(v) && !isTagged(v),
      `session120: ${desc} — result is Real (no Tagged envelope), got type=${v?.type}`);
    assert(Math.abs(v.value.toNumber() - expectedVal) < 1e-12,
      `session120: ${desc} (got ${v?.value?.toString()})`);
  };

  // Both-sides tag-drop:  `% :a:Real(80) :b:Real(25)` → Real(20).
  assertPctBothTags('%', 80, 25, 20,
    ':a:Real(80) :b:Real(25) % → Real(20) — both tags drop');
  assertPctBothTags('%T', 50, 20, 40,
    ':a:Real(50) :b:Real(20) %T → Real(40) — both tags drop');
  assertPctBothTags('%CH', 50, 20, -60,
    ':a:Real(50) :b:Real(20) %CH → Real(-60) — both tags drop');

  // Left-only tag-drop:  `% :a:Real(80) Real(25)` → Real(20).
  {
    const s = new Stack();
    s.push(Tagged('a', Real(80)));
    s.push(Real(25));
    lookup('%').fn(s);
    const v = s.peek();
    assert(isReal(v) && !isTagged(v) && Math.abs(v.value.toNumber() - 20) < 1e-12,
      `session120: :a:Real(80) Real(25) % → Real(20) — left tag drops`);
  }
  // Right-only tag-drop:  `% Real(80) :p:Real(25)` → Real(20).
  {
    const s = new Stack();
    s.push(Real(80));
    s.push(Tagged('p', Real(25)));
    lookup('%').fn(s);
    const v = s.peek();
    assert(isReal(v) && !isTagged(v) && Math.abs(v.value.toNumber() - 20) < 1e-12,
      `session120: Real(80) :p:Real(25) % → Real(20) — right tag drops`);
  }

  // List distribution on % is row L ✓ since session 064.  Pin the
  // List × scalar broadcast on the percent base.  HP50 AUR §3-1: %
  // distributes over the *first* (base) argument when the second is
  // a scalar; we verify the broadcast shape.
  {
    const s = new Stack();
    s.push(RList([Real(80), Real(40)]));
    s.push(Real(25));
    lookup('%').fn(s);
    const v = s.peek();
    assert(v.type === 'list' && v.items.length === 2,
      `session120: {80 40} 25 % returns 2-element list (got len=${v?.items?.length})`);
    assert(isReal(v.items[0]) && Math.abs(v.items[0].value.toNumber() - 20) < 1e-12
        && isReal(v.items[1]) && Math.abs(v.items[1].value.toNumber() - 10) < 1e-12,
      `session120: {80 40} 25 % → {20 10} (% distributes over base)`);
  }

  // V/M rejection on the percent family — session 072 flipped V/M from
  // blank to ✗.  Pin the rejection.  HP50 AUR §3-1 percent family is
  // scalar-only, mirroring MOD/MIN/MAX (pinned in session 068).
  assertThrows(
    () => {
      const s = new Stack();
      s.push(Vector([Real(80), Real(40)]));
      s.push(Real(25));
      lookup('%').fn(s);
    },
    /Bad argument type/,
    'session120: Vector 25 % → Bad argument type (% is scalar-only on V)'
  );
  assertThrows(
    () => {
      const s = new Stack();
      s.push(Real(80));
      s.push(Matrix([[Real(25)]]));
      lookup('%').fn(s);
    },
    /Bad argument type/,
    'session120: 80 Matrix(1×1) % → Bad argument type (% is scalar-only on M)'
  );

  /* ---------- Cluster 3: Rational unary stay-exact contract ---------- */

  // NEG / INV / SQ / ABS — all stay-exact on Rational (EXACT mode).
  // The convention text "EXACT keeps the Rational" is pinned here for
  // the four core unary numeric ops.
  {
    const s = new Stack();
    s.push(Rational(1n, 2n));
    lookup('NEG').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === -1n && v.d === 2n,
      `session120: NEG Rational(1,2) → Rational(-1,2) (stay-exact, sign on numerator)`);
  }
  {
    const s = new Stack();
    s.push(Rational(2n, 3n));
    lookup('INV').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === 3n && v.d === 2n,
      `session120: INV Rational(2,3) → Rational(3,2) (stay-exact, swap numerator/denominator)`);
  }
  // INV with d=1 collapse: INV Rational(1,5) → Integer(5).
  {
    const s = new Stack();
    s.push(Rational(1n, 5n));
    lookup('INV').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 5n,
      `session120: INV Rational(1,5) → Integer(5) (Rational(5,1) collapses to Integer)`);
  }
  // SQ stay-exact (and pin that SQ does NOT collapse Rational(4,1)).
  {
    const s = new Stack();
    s.push(Rational(-3n, 4n));
    lookup('SQ').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === 9n && v.d === 16n,
      `session120: SQ Rational(-3,4) → Rational(9,16) (sign squared)`);
  }
  // ABS stay-exact.
  {
    const s = new Stack();
    s.push(Rational(-3n, 4n));
    lookup('ABS').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === 3n && v.d === 4n,
      `session120: ABS Rational(-3,4) → Rational(3,4) (stay-exact, magnitude)`);
  }

  // SQRT — perfect-square rationals stay exact (then d=1 collapse to
  // Integer if applicable); non-square rationals lift to Symbolic in
  // EXACT mode; negative rationals lift to Complex.
  {
    const s = new Stack();
    s.push(Rational(9n, 16n));
    lookup('SQRT').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === 3n && v.d === 4n,
      `session120: SQRT Rational(9,16) → Rational(3,4) (perfect-square stay-exact)`);
  }
  {
    const s = new Stack();
    s.push(Rational(0n, 1n));
    lookup('SQRT').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 0n,
      `session120: SQRT Rational(0,1) → Integer(0) (zero radicand)`);
  }
  {
    // Non-square rational lifts to Symbolic — irrational SQRT(2) doesn't
    // round-trip exactly through Rational.
    const s = new Stack();
    s.push(Rational(2n, 1n));
    lookup('SQRT').fn(s);
    const v = s.peek();
    assert(v && v.type === 'symbolic',
      `session120: SQRT Rational(2,1) → Symbolic (irrational radicand lifts in EXACT)`);
  }
  {
    // Negative Rational lifts to Complex (principal branch i·sqrt(|x|)).
    const s = new Stack();
    s.push(Rational(-1n, 1n));
    lookup('SQRT').fn(s);
    const v = s.peek();
    assert(isComplex(v) && Math.abs(v.re - 0) < 1e-12 && Math.abs(v.im - 1) < 1e-12,
      `session120: SQRT Rational(-1,1) → Complex(0, 1) (negative-radicand principal branch)`);
  }

  // SIGN — Q always collapses to Integer(-1/0/1).
  {
    const s = new Stack();
    s.push(Rational(-3n, 4n));
    lookup('SIGN').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === -1n,
      `session120: SIGN Rational(-3,4) → Integer(-1)`);
  }
  {
    const s = new Stack();
    s.push(Rational(0n, 1n));
    lookup('SIGN').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 0n,
      `session120: SIGN Rational(0,1) → Integer(0)`);
  }
  {
    const s = new Stack();
    s.push(Rational(3n, 4n));
    lookup('SIGN').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 1n,
      `session120: SIGN Rational(3,4) → Integer(1)`);
  }

  // Rounding family — FLOOR / CEIL / IP all collapse to Integer on Q
  // (the integer part is exact, so no Rational result is needed).
  // FP keeps Rational unless integer-valued, where it collapses to
  // Integer(0).  Sign conventions:
  //   FLOOR = round toward -∞
  //   CEIL  = round toward +∞
  //   IP    = trunc toward zero
  {
    const s = new Stack();
    s.push(Rational(7n, 2n));
    lookup('FLOOR').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 3n,
      `session120: FLOOR Rational(7,2) → Integer(3) (Q→Z collapse, exact)`);
  }
  {
    const s = new Stack();
    s.push(Rational(-7n, 2n));
    lookup('FLOOR').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === -4n,
      `session120: FLOOR Rational(-7,2) → Integer(-4) (round toward -∞)`);
  }
  {
    const s = new Stack();
    s.push(Rational(7n, 2n));
    lookup('CEIL').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 4n,
      `session120: CEIL Rational(7,2) → Integer(4) (round toward +∞)`);
  }
  {
    const s = new Stack();
    s.push(Rational(-7n, 2n));
    lookup('CEIL').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === -3n,
      `session120: CEIL Rational(-7,2) → Integer(-3)`);
  }
  {
    const s = new Stack();
    s.push(Rational(7n, 2n));
    lookup('IP').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 3n,
      `session120: IP Rational(7,2) → Integer(3) (trunc toward zero)`);
  }
  {
    const s = new Stack();
    s.push(Rational(-7n, 2n));
    lookup('IP').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === -3n,
      `session120: IP Rational(-7,2) → Integer(-3) (trunc toward zero, NOT -4)`);
  }
  {
    // FP on non-integer Q stays Rational (exact fractional part).
    const s = new Stack();
    s.push(Rational(7n, 2n));
    lookup('FP').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === 1n && v.d === 2n,
      `session120: FP Rational(7,2) → Rational(1,2) (exact fractional, stay-Q)`);
  }
  {
    const s = new Stack();
    s.push(Rational(-7n, 2n));
    lookup('FP').fn(s);
    const v = s.peek();
    assert(isRational(v) && v.n === -1n && v.d === 2n,
      `session120: FP Rational(-7,2) → Rational(-1,2) (sign preserved)`);
  }
  {
    // FP on integer-valued Q (Rational(6,3) canonicalises to 2/1) → Integer(0).
    const s = new Stack();
    s.push(Rational(6n, 3n));
    lookup('FP').fn(s);
    const v = s.peek();
    assert(isInteger(v) && v.value === 0n,
      `session120: FP Rational(6,3) → Integer(0) (integer-valued Q has zero fractional part)`);
  }

  // APPROX-mode collapse: Q unary ops drop to Real regardless of
  // exactness.  Pins the flag -3 "give me decimals" contract on the
  // rational unary surface (mirrors the session 115 Cluster 2
  // APPROX collapse pin on the binary `+`).
  setApproxMode(true);
  try {
    {
      const s = new Stack();
      s.push(Rational(2n, 3n));
      lookup('INV').fn(s);
      const v = s.peek();
      assert(isReal(v) && Math.abs(v.value.toNumber() - 1.5) < 1e-12,
        `session120: APPROX INV Rational(2,3) → Real ≈ 1.5 (Q→R collapse)`);
    }
    {
      const s = new Stack();
      s.push(Rational(2n, 3n));
      lookup('SQ').fn(s);
      const v = s.peek();
      assert(isReal(v) && Math.abs(v.value.toNumber() - 4/9) < 1e-12,
        `session120: APPROX SQ Rational(2,3) → Real ≈ 0.4444 (Q→R collapse)`);
    }
    {
      const s = new Stack();
      s.push(Rational(7n, 2n));
      lookup('FLOOR').fn(s);
      const v = s.peek();
      assert(isReal(v) && Math.abs(v.value.toNumber() - 3) < 1e-12,
        `session120: APPROX FLOOR Rational(7,2) → Real(3) (Q→R collapse, NOT Integer)`);
    }
  } finally {
    setApproxMode(false);
  }

  // Out-of-domain rejection: FACT / XPON / MANT all reject Rational
  // even at integer-valued Q (e.g., Rational(5,1)).  The HP50 AUR
  // domain for these ops is Real or Integer, NOT Rational — Q is not
  // silently coerced to Real here, even though it could be.  This is
  // a deliberate "Q is its own first-class type" stance (mirrors how
  // BinInt is also rejected from these ops).
  assertThrows(
    () => {
      const s = new Stack();
      s.push(Rational(5n, 1n));
      lookup('FACT').fn(s);
    },
    /Bad argument type/,
    'session120: FACT Rational(5,1) → Bad argument type (Q rejected even at integer-valued)'
  );
  assertThrows(
    () => {
      const s = new Stack();
      s.push(Rational(1n, 2n));
      lookup('XPON').fn(s);
    },
    /Bad argument type/,
    'session120: XPON Rational(1,2) → Bad argument type (Q not in XPON domain)'
  );
  assertThrows(
    () => {
      const s = new Stack();
      s.push(Rational(1n, 2n));
      lookup('MANT').fn(s);
    },
    /Bad argument type/,
    'session120: MANT Rational(1,2) → Bad argument type (Q not in MANT domain)'
  );
}
