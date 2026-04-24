import { Stack } from '../src/rpl/stack.js';
import { lookup } from '../src/rpl/ops.js';
import {
  Real, Integer, BinaryInteger, Complex, Name, Str, Directory, Program, Tagged,
  RList, Vector, Matrix, Symbolic,
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

/* Data-type completeness pass (session 037). */

/* ================================================================
   Session 037 — data-type completeness pass
   Close the Vector/Matrix gaps called out by the new command inventory:
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
        && v.items[0].value === -1 && v.items[1].value === 2 && v.items[2].value === -3,
      `NEG Vector negates each element, got [${v.items.map(x=>x.value).join(' ')}]`);
  }
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(-2)], [Real(3), Real(4)]]));
    lookup('NEG').fn(s);
    const m = s.peek();
    assert(m.type === 'matrix'
        && m.rows[0][0].value === -1 && m.rows[0][1].value === 2
        && m.rows[1][0].value === -3 && m.rows[1][1].value === -4,
      'NEG Matrix negates every entry');
  }

  // --- ABS (= Frobenius norm on arrays per Adv Guide spec) -------
  {
    const s = new Stack();
    s.push(Vector([Real(3), Real(4)]));
    lookup('ABS').fn(s);
    assert(isReal(s.peek()) && s.peek().value === 5,
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
        && v.items[0].value === 1 && v.items[1].value === 2 && v.items[2].value === 3,
      'CONJ on real-entry Vector is identity');
  }
  {
    const s = new Stack();
    s.push(Vector([Real(5), Real(-2)]));
    lookup('RE').fn(s);
    const v = s.peek();
    assert(v.type === 'vector' && v.items[0].value === 5 && v.items[1].value === -2,
      'RE on real-entry Vector is identity');
  }
  {
    const s = new Stack();
    s.push(Vector([Real(5), Real(-2)]));
    lookup('IM').fn(s);
    const v = s.peek();
    assert(v.type === 'vector' && v.items[0].value === 0 && v.items[1].value === 0,
      'IM on real-entry Vector → zero vector');
  }

  // --- CONJ on Matrix is identity (no complex entries yet) -------
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    lookup('CONJ').fn(s);
    const m = s.peek();
    assert(m.type === 'matrix'
        && m.rows[0][0].value === 1 && m.rows[1][1].value === 4,
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
        && v.items[0].value === 0 && v.items[1].value === 0 && v.items[2].value === 0,
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
   Session 040 — CHR / NUM (String ⇄ single codepoint).
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
   Session 042 — →STR / STR→ (object ⇄ string serialization).

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
    assert(isReal(s.peek(1)) && s.peek(1).value === 3.14,
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
    assert(isReal(s.peek(1)) && s.peek(1).value === 2.5,
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
// Session 053 — Tagged objects and type introspection
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
  let threw = false;
  try { lookup('→TAG').fn(s); } catch (e) { threw = /Bad argument/.test(e.message); }
  assert(threw, 'session053: →TAG Integer-tag throws');
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
  assert(s.peek(2).type === 'real' && s.peek(2).value === 2.5,
    'session053: UNDER exposes value');
  assert(s.peek(1).type === 'string' && s.peek(1).value === 'mytag',
    'session053: UNDER pushes tag as String');
}

/* ---- UNDER on untagged throws ---- */
{
  const s = new Stack();
  s.push(Integer(1n));
  let threw = false;
  try { lookup('UNDER').fn(s); } catch (e) { threw = /Bad argument/.test(e.message); }
  assert(threw, 'session053: UNDER on untagged throws');
}

/* ---- KIND returns HP50 type code (Real) ---- */
{
  const s = new Stack();
  s.push(Real(1.5));
  lookup('KIND').fn(s);
  assert(s.peek().type === 'real' && typeof s.peek().value === 'number',
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
   session068 — TYPE / VTYPE / KIND table-driven sweep (AUR §3-44)

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
  assert(isReal(s.peek()) && s.peek().value === code,
    `session068: TYPE(${label}) = ${code} (got ${s.peek()?.value})`);
}

/* ---- KIND: should agree with TYPE for every row ---- */
for (const [make, code, label] of TYPE_CODE_TABLE) {
  const s = new Stack();
  s.push(make());
  lookup('KIND').fn(s);
  assert(isReal(s.peek()) && s.peek().value === code,
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
    assert(isReal(s.peek()) && s.peek().value === code,
      `session068: VTYPE('${name}') = ${code} — ${label}`);
  }
}

/* ---- VTYPE rejects non-Name argument ---- */
{
  const s = new Stack();
  s.push(Real(1));
  let threw = false;
  try { lookup('VTYPE').fn(s); }
  catch (e) { threw = /Bad argument type/i.test(e.message); }
  assert(threw, 'session068: VTYPE on Real → Bad argument type');
}

/* ---- VTYPE on an undefined name → Undefined name ---- */
{
  resetHome();
  const s = new Stack();
  s.push(Name('NOPE_XYZ', { quoted: true }));
  let threw = false;
  try { lookup('VTYPE').fn(s); }
  catch (e) { threw = /Undefined name/i.test(e.message); }
  assert(threw, 'session068: VTYPE on undefined name → Undefined name');
}

/* ---- TYPE / KIND distinguish Real ≠ Integer ≠ BinaryInteger ---- */
{
  // HP50 has three distinct numeric types.  This is a common "these
  // should never collide" regression point — the code has changed
  // whenever someone refactored promoteNumericPair.
  const real = new Stack(); real.push(Real(5));       lookup('TYPE').fn(real);
  const integer = new Stack(); integer.push(Integer(5n)); lookup('TYPE').fn(integer);
  const bin = new Stack(); bin.push(BinaryInteger(5n, 'h')); lookup('TYPE').fn(bin);
  assert(real.peek().value === 0 && integer.peek().value === 28 && bin.peek().value === 10
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
  assert(s.peek().value === 2,
    'session068: TYPE of level-1 String → code 2 (operated on the top, not level 2)');
  assert(s.peek(2).value === 2, 'session068: TYPE leaves level 2 (Real(2)) untouched');
  assert(s.peek(3).value === 1, 'session068: TYPE leaves level 3 (Real(1)) untouched');
}

/* ---- KIND on empty stack → Too few arguments ---- */
{
  const s = new Stack();
  let threw = false;
  try { lookup('KIND').fn(s); }
  catch (e) { threw = /Too few arguments/i.test(e.message); }
  assert(threw, 'session068: KIND on empty stack → Too few arguments');
}
