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
import { assert, assertThrows } from './helpers.mjs';

/* Comparisons (==, ≠, <, >, ≤, ≥), logical ops (AND/OR/XOR/NOT), TRUE/FALSE. */

/* ================================================================
   Comparison + logical ops — HP50 booleans are Reals: 1. = true, 0.
   ================================================================ */

// == across numeric types
{
  const s = new Stack();
  s.push(Real(3)); s.push(Integer(3));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1), '3.0 == 3 (int) is true');
  s.clear();
  s.push(Real(1)); s.push(Real(2));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0), '1 == 2 is false');
}

// ≠ / <> / < / > / ≤ / ≥
{
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2));
  lookup('<').fn(s);
  assert(s.peek().value.eq(1), '1 < 2');
  s.clear();
  s.push(Real(5)); s.push(Real(5));
  lookup('≤').fn(s);
  assert(s.peek().value.eq(1), '5 ≤ 5');
  s.clear();
  s.push(Real(5)); s.push(Real(6));
  lookup('>=').fn(s);
  assert(s.peek().value.eq(0), '5 >= 6 is false');
  s.clear();
  s.push(Real(3)); s.push(Real(4));
  lookup('<>').fn(s);
  assert(s.peek().value.eq(1), '3 <> 4 is true');
}

// == on Names and Strings (structural)
{
  const s = new Stack();
  s.push(Name('X')); s.push(Name('X'));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1), "Name(`X`) == Name(`X`)");
  s.clear();
  s.push(Str('foo')); s.push(Str('bar'));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0), "`foo` != `bar`");
}

// Logical ops
{
  const s = new Stack();
  s.push(Real(1)); s.push(Real(0)); lookup('AND').fn(s);
  assert(s.peek().value.eq(0), '1 AND 0 = 0');
  s.clear();
  s.push(Real(1)); s.push(Real(0)); lookup('OR').fn(s);
  assert(s.peek().value.eq(1), '1 OR 0 = 1');
  s.clear();
  s.push(Real(1)); s.push(Real(1)); lookup('XOR').fn(s);
  assert(s.peek().value.eq(0), '1 XOR 1 = 0');
  s.clear();
  s.push(Real(0)); lookup('NOT').fn(s);
  assert(s.peek().value.eq(1), 'NOT 0 = 1');
  s.clear();
  s.push(Real(42)); lookup('NOT').fn(s);
  assert(s.peek().value.eq(0), 'NOT 42 = 0');
}

// TRUE / FALSE push the literals
{
  const s = new Stack();
  lookup('TRUE').fn(s);  assert(s.peek().value.eq(1), 'TRUE pushes 1');
  lookup('FALSE').fn(s); assert(s.peek().value.eq(0), 'FALSE pushes 0');
}

/* ================================================================
   Comparisons expansion (HP50 AUR §4)

   Reference: HP50 AUR §4 "Real-number calculator commands", tables 4-1
   and 4-2 on the type matrix of comparison operators.  Quick summary:
     =     equation builder: always returns a Symbolic.
     ==    strict structural: numeric promotes; non-numerics compare
           by their "content" (names by id, strings by char-for-char,
           lists/vectors/matrices structurally, symbolics by AST).
     SAME  structural including types — does NOT lift to Symbolic;
           always returns a Real 1. / 0.
     ≠     negation of ==, also lifts to Symbolic when an operand is
           Symbolic/Name.
     < > ≤ ≥  numeric comparison; Symbolic/Name lift to a single
           Symbolic chain; Strings compare lexicographically by char
           codes (User Guide App-J).

   Tests that assert a current-day gap are guarded with a `.skip`-
   equivalent (commented-out `assert` + logged `KNOWN GAP`) so the
   suite stays green and the gap is visible.
   ================================================================ */

/* ---- Complex ==  /  ≠ — both structural on { re, im } pairs ---- */
{
  const s = new Stack();
  s.push(Complex(3, 4)); s.push(Complex(3, 4));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1), 'session068: (3,4) == (3,4) is true');
}
{
  const s = new Stack();
  s.push(Complex(1, 2)); s.push(Complex(1, 3));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0), 'session068: (1,2) == (1,3) is false (im differs)');
}
{
  const s = new Stack();
  s.push(Complex(2, 0)); s.push(Complex(0, 2));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0), 'session068: (2,0) == (0,2) is false (swap re/im)');
}
{
  // Complex with zero imaginary part == Real with same value.
  const s = new Stack();
  s.push(Complex(5, 0)); s.push(Real(5));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1),
    'session068: (5,0) == 5 is true (promotion folds to complex compare)');
}
{
  const s = new Stack();
  s.push(Complex(3, 4)); s.push(Real(3));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0),
    'session068: (3,4) == 3 is false (imaginary part differs)');
}
{
  const s = new Stack();
  s.push(Complex(1, 2)); s.push(Complex(1, 2));
  lookup('≠').fn(s);
  assert(s.peek().value.eq(0), 'session068: (1,2) ≠ (1,2) is false');
}
{
  const s = new Stack();
  s.push(Complex(1, 2)); s.push(Complex(3, 4));
  lookup('≠').fn(s);
  assert(s.peek().value.eq(1), 'session068: (1,2) ≠ (3,4) is true');
}

/* ---- Complex < is rejected (partial order undefined on ℂ) ---- */
{
  const s = new Stack();
  s.push(Complex(1, 2)); s.push(Complex(3, 4));
  assertThrows(() => lookup('<').fn(s), /Bad argument type/i,
    'session068: (1,2) < (3,4) rejects — no total order on ℂ when im≠0');
}

/* ---- SAME on Name is structural (same id ⇒ true) ---- */
{
  const s = new Stack();
  s.push(Name('X')); s.push(Name('X'));
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(1), 'session068: SAME(X, X) on Names is true');
}
{
  const s = new Stack();
  s.push(Name('X')); s.push(Name('Y'));
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(0),
    'session068: SAME(X, Y) on distinct Names is false');
}

/* ---- SAME never lifts to Symbolic (always Real 1./0.) ----
   HP50 AUR §4-7: SAME "is not defined for Algebraic and does not
   produce a symbolic result".  Our Name-vs-Name structural case above
   already produces a Real; here we just confirm Name-vs-different-Name
   doesn't sneak into a symbolic path. */
{
  const s = new Stack();
  s.push(Name('X')); s.push(Name('Y'));
  lookup('SAME').fn(s);
  const top = s.peek();
  assert(top.type === 'real',
    'session068: SAME returns a Real literal, not a Symbolic, on Name/Name mismatch');
}

/* ---- Symbolic chain lift on  <, >, ≤, ≥ ----
   Expected: two Names (or a Name and a number, or two Symbolics) on
   either side of a comparison op produce a single combined Symbolic
   with the op at the root.  Numbers on both sides fall through to the
   fast boolean path. */
{
  const s = new Stack();
  s.push(Name('X')); s.push(Name('Y'));
  lookup('<').fn(s);
  assert(s.peek().type === 'symbolic',
    'session068: Name < Name lifts to a Symbolic chain');
}
{
  const s = new Stack();
  s.push(Name('A')); s.push(Real(1));
  lookup('≤').fn(s);
  assert(s.peek().type === 'symbolic',
    'session068: Name ≤ Real lifts to Symbolic');
}
{
  const s = new Stack();
  s.push(Real(1)); s.push(Name('Z'));
  lookup('>').fn(s);
  assert(s.peek().type === 'symbolic',
    'session068: Real > Name lifts to Symbolic (symmetric lift)');
}
{
  const s = new Stack();
  s.push(Name('X')); s.push(Name('Y'));
  lookup('≥').fn(s);
  assert(s.peek().type === 'symbolic',
    'session068: Name ≥ Name lifts to Symbolic');
}

/* ---- = (equation builder) always returns Symbolic, even on numerics ---- */
{
  const s = new Stack();
  s.push(Real(2)); s.push(Real(3));
  lookup('=').fn(s);
  assert(s.peek().type === 'symbolic',
    'session068: 2 3 = yields a Symbolic equation (not 0/1)');
}
{
  const s = new Stack();
  s.push(Name('X')); s.push(Name('X'));
  lookup('=').fn(s);
  assert(s.peek().type === 'symbolic',
    'session068: X X = yields a Symbolic equation even when both sides identical');
}

/* ---- ASCII alias parity: <= ≡ ≤  and  >= ≡ ≥ ---- */
{
  const s = new Stack();
  s.push(Real(3)); s.push(Real(4));
  lookup('<=').fn(s);
  const ascii = s.peek().value;
  const t = new Stack();
  t.push(Real(3)); t.push(Real(4));
  lookup('≤').fn(t);
  const uni = t.peek().value;
  assert(ascii.eq(1) && uni.eq(1) && ascii.eq(uni),
    'session068: <= and ≤ agree on 3 4 (both 1)');
}

/* ---- == across numeric-type pairs, for the round-trip promotion matrix ---- */
{
  // Integer == Real with matching value
  const s = new Stack();
  s.push(Integer(7n)); s.push(Real(7));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1), 'session068: Integer(7) == Real(7) is true');
}
{
  // Integer == Integer with big-bigint value
  const s = new Stack();
  s.push(Integer(10n ** 30n)); s.push(Integer(10n ** 30n));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1),
    'session068: 10^30 == 10^30 is true (arbitrary-precision BigInt)');
}
{
  // Real NaN-adjacent edge: HP50 rejects NaN at the Real constructor
  // so this case simply validates that the constructor guard exists —
  // a surprise NaN should never reach ==.  We do NOT test NaN == NaN.
  assertThrows(() => Real(NaN), /NaN/,
    'session068: Real(NaN) is rejected at construction (prevents NaN==NaN ambiguity)');
}

/* ---- String equality is structural (char-for-char) ---- */
{
  const s = new Stack();
  s.push(Str('hello')); s.push(Str('hello'));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1), 'session068: "hello" == "hello" is true');
}
{
  const s = new Stack();
  s.push(Str('hello')); s.push(Str('Hello'));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0),
    'session068: "hello" == "Hello" is false (case-sensitive structural compare)');
}

/* ================================================================
   KNOWN GAPS — asserted via `assert(true, …)` comments only.
   These document HP50 behaviors our implementation does not yet meet.
   Each is filed in docs/TESTS.md under "Known gaps — assigned to
   <sibling lane>".  Flip to a real assertion once the sibling lane
   ships the fix.
   ---------------------------------------------------------------- */

/* ---- List / Vector structural equality via == ----
   HP50 AUR §4-2 lists Lists and Vectors as valid == operands, with
   structural semantics.  `eqValues()` in src/rpl/ops.js treats Lists
   and Vectors as structurally comparable.  See also the per-type
   sweep further down. */
{
  const s = new Stack();
  s.push(RList([Real(1), Real(2), Real(3)]));
  s.push(RList([Real(1), Real(2), Real(3)]));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1),
    'session072: List == List is structural (1 for identical) — gap filed s070, fixed s072');
}
{
  const s = new Stack();
  s.push(Vector([Real(1), Real(2)]));
  s.push(Vector([Real(1), Real(2)]));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1),
    'session072: Vector == Vector is structural — gap filed s070, fixed s072');
}

/* ---- String lexicographic < > ≤ ≥ ----
   HP50 User Guide App. J: string comparisons are char-code lex. */
{
  // "a" < "b" — basic ascending order
  {
    const s = new Stack();
    s.push(Str('a')); s.push(Str('b'));
    lookup('<').fn(s);
    assert(s.peek().value.eq(1),
      'session087: "a" < "b" = 1 (String lex <)');
  }
  // "b" > "a"
  {
    const s = new Stack();
    s.push(Str('b')); s.push(Str('a'));
    lookup('>').fn(s);
    assert(s.peek().value.eq(1),
      'session087: "b" > "a" = 1 (String lex >)');
  }
  // "abc" ≤ "abd"
  {
    const s = new Stack();
    s.push(Str('abc')); s.push(Str('abd'));
    lookup('≤').fn(s);
    assert(s.peek().value.eq(1),
      'session087: "abc" ≤ "abd" = 1 (String lex ≤, differ at last char)');
  }
  // "z" ≥ "z" (equal strings)
  {
    const s = new Stack();
    s.push(Str('z')); s.push(Str('z'));
    lookup('≥').fn(s);
    assert(s.peek().value.eq(1),
      'session087: "z" ≥ "z" = 1 (equal strings)');
  }
  // "b" < "a" = 0 (regression guard)
  {
    const s = new Stack();
    s.push(Str('b')); s.push(Str('a'));
    lookup('<').fn(s);
    assert(s.peek().value.eq(0),
      'session087: "b" < "a" = 0 (regression guard)');
  }
  // Mixed String + Real still rejected
  assertThrows(
    () => { const s = new Stack(); s.push(Str('x')); s.push(Real(1)); lookup('<').fn(s); },
    /Bad argument type/,
    'session087: String < Real throws Bad argument type (no cross-type lift for <)'
  );
}

/* ---- SAME on structurally identical Symbolics ----
   HP50 AUR §4-7 documents SAME as strictly structural.  `eqValues()`
   has an `isSymbolic(a) && isSymbolic(b)` branch that calls a local
   `_astStructEqual` over the AST; uses a properly-shaped parser AST
   (via parseEntry — parser emits `{kind,...}`). */
{
  const [symA] = parseEntry("`A+B`");
  const [symB] = parseEntry("`A+B`");
  const s = new Stack();
  s.push(symA); s.push(symB);
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(1),
    'session072: SAME on structurally identical Symbolics returns 1 — gap filed s070, fixed s072');
}

/* ================================================================
   Logical-op coverage strengthening (short).
   ================================================================ */
{
  // NOT on Real(0) = 1; NOT on any non-zero = 0.
  const s = new Stack();
  s.push(Real(-3));
  lookup('NOT').fn(s);
  assert(s.peek().value.eq(0),
    'session068: NOT(-3) = 0 (any non-zero is truthy, HP50 flag-style logic)');
}
{
  // AND / OR / XOR short-circuit truth table (Real operands).
  const truth = [
    ['AND', 0, 0, 0], ['AND', 1, 0, 0], ['AND', 0, 1, 0], ['AND', 1, 1, 1],
    ['OR',  0, 0, 0], ['OR',  1, 0, 1], ['OR',  0, 1, 1], ['OR',  1, 1, 1],
    ['XOR', 0, 0, 0], ['XOR', 1, 0, 1], ['XOR', 0, 1, 1], ['XOR', 1, 1, 0],
  ];
  let allOk = true;
  for (const [op, a, b, want] of truth) {
    const s = new Stack();
    s.push(Real(a)); s.push(Real(b));
    lookup(op).fn(s);
    if (!s.peek().value.eq(want)) allOk = false;
  }
  assert(allOk,
    'session068: Real AND/OR/XOR truth table (12 rows) all correct');
}

/* ================================================================
   Structural equality on List / Vector / Matrix / Symbolic / Tagged /
   Unit via == and SAME — the full per-type sweep.  Covers positive +
   negative + length-mismatch + nested + cross-type-rejection for each.
   ================================================================ */
/* ---- List == List ---- */
{
  // Same-length structural match.
  const s = new Stack();
  s.push(RList([Real(1), Real(2), Real(3)]));
  s.push(RList([Real(1), Real(2), Real(3)]));
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(1), 'session072: SAME {1,2,3} {1,2,3} = 1');
}
{
  // Different length — not equal.
  const s = new Stack();
  s.push(RList([Real(1), Real(2)]));
  s.push(RList([Real(1), Real(2), Real(3)]));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0), 'session072: {1,2} == {1,2,3} = 0 (length mismatch)');
}
{
  // Same length, different element — not equal.
  const s = new Stack();
  s.push(RList([Real(1), Real(2), Real(3)]));
  s.push(RList([Real(1), Real(2), Real(4)]));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0), 'session072: {1,2,3} == {1,2,4} = 0');
}
{
  // Nested lists — recursive structural compare.
  const s = new Stack();
  s.push(RList([RList([Real(1), Real(2)]), Real(3)]));
  s.push(RList([RList([Real(1), Real(2)]), Real(3)]));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1), 'session072: { {1,2} 3 } == { {1,2} 3 } = 1');
}
{
  // Heterogeneous list with promoted numerics — Real vs Integer inside still equal.
  const s = new Stack();
  s.push(RList([Real(1), Real(2)]));
  s.push(RList([Integer(1n), Integer(2n)]));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1),
    'session072: { 1. 2. } == { 1 2 } = 1 (numeric promotion inside list)');
}
/* ---- Vector == Vector ---- */
{
  const s = new Stack();
  s.push(Vector([Real(3), Real(4)]));
  s.push(Vector([Real(3), Real(4)]));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1), 'session072: [3 4] == [3 4] = 1');
}
{
  const s = new Stack();
  s.push(Vector([Real(3), Real(4)]));
  s.push(Vector([Real(4), Real(3)]));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0), 'session072: [3 4] == [4 3] = 0 (order-sensitive)');
}
{
  // Vector vs list is a cross-type no — structural compare does not mix.
  const s = new Stack();
  s.push(Vector([Real(1), Real(2)]));
  s.push(RList([Real(1), Real(2)]));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0),
    'session072: [1 2] == {1 2} = 0 (different container types are not equal)');
}
/* ---- Matrix == Matrix ---- */
{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
  s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
  lookup('==').fn(s);
  assert(s.peek().value.eq(1), 'session072: [[1 2][3 4]] == [[1 2][3 4]] = 1');
}
{
  // Row count mismatch — not equal.
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2)]]));
  s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0), 'session072: matrix row-count mismatch → 0');
}
{
  const s = new Stack();
  s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
  s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(5)]]));
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(0), 'session072: SAME matrix cell mismatch → 0');
}
/* ---- Symbolic == Symbolic and SAME ---- */
{
  const [a] = parseEntry("`X+Y`");
  const [b] = parseEntry("`X+Y`");
  const s = new Stack();
  s.push(a); s.push(b);
  lookup('==').fn(s);
  assert(s.peek().value.eq(1), "session072: `X+Y` == `X+Y` = 1");
}
{
  // Subtly different operand order — structural compare is order-sensitive.
  const [a] = parseEntry("`X+Y`");
  const [b] = parseEntry("`Y+X`");
  const s = new Stack();
  s.push(a); s.push(b);
  lookup('==').fn(s);
  assert(s.peek().value.eq(0),
    "session072: `X+Y` == `Y+X` = 0 (commutativity is a CAS concern, not ==)");
}
{
  // Symbolic fn calls.
  const [a] = parseEntry("`SIN(X)`");
  const [b] = parseEntry("`SIN(X)`");
  const s = new Stack();
  s.push(a); s.push(b);
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(1), "session072: SAME `SIN(X)` `SIN(X)` = 1");
}
{
  // SIN(X) vs COS(X) — different fn name.
  const [a] = parseEntry("`SIN(X)`");
  const [b] = parseEntry("`COS(X)`");
  const s = new Stack();
  s.push(a); s.push(b);
  lookup('==').fn(s);
  assert(s.peek().value.eq(0), "session072: `SIN(X)` == `COS(X)` = 0 (fn-name differs)");
}
{
  // Nested bin + fn.
  const [a] = parseEntry("`X^2+SIN(X)`");
  const [b] = parseEntry("`X^2+SIN(X)`");
  const s = new Stack();
  s.push(a); s.push(b);
  lookup('==').fn(s);
  assert(s.peek().value.eq(1), "session072: `X^2+SIN(X)` structural match");
}
/* ---- Tagged == Tagged ---- */
{
  // Same tag + same value.
  const s = new Stack();
  s.push(Tagged('price', Real(200)));
  s.push(Tagged('price', Real(200)));
  lookup('SAME').fn(s);
  assert(s.peek().value.eq(1),
    'session072: SAME price:200 price:200 = 1 (tag + value match)');
}
{
  // Different tag, same value — not SAME (strict structural).
  const s = new Stack();
  s.push(Tagged('price', Real(200)));
  s.push(Tagged('cost',  Real(200)));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0),
    'session072: price:200 == cost:200 = 0 (tag differs)');
}
{
  // Same tag, different value.
  const s = new Stack();
  s.push(Tagged('x', Real(1)));
  s.push(Tagged('x', Real(2)));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0), 'session072: x:1 == x:2 = 0 (value differs)');
}
/* ---- Unit == Unit ---- */
{
  // Exact structural compare: same value AND same uexpr string.
  const [a] = parseEntry('1_m');
  const [b] = parseEntry('1_m');
  const s = new Stack();
  s.push(a); s.push(b);
  lookup('==').fn(s);
  assert(s.peek().value.eq(1), 'session072: 1_m == 1_m = 1');
}
{
  // Same dimension, different scale — structural compare says not equal.
  const [a] = parseEntry('1_m');
  const [b] = parseEntry('1_km');
  const s = new Stack();
  s.push(a); s.push(b);
  lookup('==').fn(s);
  assert(s.peek().value.eq(0),
    'session072: 1_m == 1_km = 0 (different uexpr even though both are lengths)');
}
{
  // Same uexpr, different numeric.
  const [a] = parseEntry('1_m');
  const [b] = parseEntry('2_m');
  const s = new Stack();
  s.push(a); s.push(b);
  lookup('==').fn(s);
  assert(s.peek().value.eq(0), 'session072: 1_m == 2_m = 0 (value differs)');
}
/* ---- Cross-type rejection (regression guard) ---- */
{
  // List vs String — different types, eqValues returns false.
  const s = new Stack();
  s.push(RList([Real(1)])); s.push(Str('1'));
  lookup('==').fn(s);
  assert(s.peek().value.eq(0),
    'session072: {1} == "1" = 0 (cross-type: list ≠ string)');
}
{
  // Symbolic vs Real — cross-type is never equal via == (numeric Real would
  // need to be lifted to symbolic by `+`-family ops, not by ==).
  const [a] = parseEntry("`X`");
  const s = new Stack();
  s.push(a); s.push(Real(5));
  // Note: `==` does NOT call `_trySymCompare`; it goes straight to
  // `eqValues`, which returns false on Sy-vs-Real.  This is intentional
  // per the docstring on register('=='): "strict structural equality".
  lookup('==').fn(s);
  assert(s.peek().value.eq(0),
    "session072: `X` == 5 = 0 (== is strictly structural, no symbolic lift)");
}
