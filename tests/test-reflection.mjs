import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import {
  Real, Integer, BinaryInteger, Complex, Name, Str, Directory, Program, Tagged,
  RList, Vector, Matrix, Symbolic, Unit,
  isReal, isInteger, isBinaryInteger, isComplex, isDirectory, isProgram, isName,
  isString, isUnit,
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
    assert(isReal(s.peek()) && s.peek().value.eq(0), 'TYPE Real → 0');
  }
  {
    const s = new Stack();
    s.push(Complex(1, 2));
    lookup('TYPE').fn(s);
    assert(s.peek().value.eq(1), 'TYPE Complex → 1');
  }
  {
    const s = new Stack();
    s.push(Str('hi'));
    lookup('TYPE').fn(s);
    assert(s.peek().value.eq(2), 'TYPE String → 2');
  }
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2)]));
    lookup('TYPE').fn(s);
    assert(s.peek().value.eq(3), 'TYPE real Vector → 3');
  }
  {
    const s = new Stack();
    s.push(Vector([Real(1), Complex(0, 1)]));
    lookup('TYPE').fn(s);
    assert(s.peek().value.eq(4), 'TYPE complex Vector → 4');
  }
  {
    const s = new Stack();
    s.push(RList([Real(1)]));
    lookup('TYPE').fn(s);
    assert(s.peek().value.eq(5), 'TYPE List → 5');
  }
  {
    const s = new Stack();
    s.push(Name('X'));
    lookup('TYPE').fn(s);
    assert(s.peek().value.eq(6), 'TYPE Name → 6');
  }
  {
    const s = new Stack();
    s.push(Program([Real(1)]));
    lookup('TYPE').fn(s);
    assert(s.peek().value.eq(8), 'TYPE Program → 8');
  }
  {
    const s = new Stack();
    s.push(BinaryInteger(15n, 'h'));
    lookup('TYPE').fn(s);
    assert(s.peek().value.eq(10), 'TYPE BinaryInteger → 10');
  }
  {
    const s = new Stack();
    s.push(Tagged('lbl', Real(1)));
    lookup('TYPE').fn(s);
    assert(s.peek().value.eq(12), 'TYPE Tagged → 12');
  }
  {
    const s = new Stack();
    s.push(Integer(42));
    lookup('TYPE').fn(s);
    assert(s.peek().value.eq(28), 'TYPE Integer (ZINT) → 28');
  }

  // ---- OBJ→ ----
  {
    const s = new Stack();
    s.push(Complex(3, 4));
    lookup('OBJ→').fn(s);
    assert(s.depth === 2 && isReal(s.peek(1)) && s.peek(1).value.eq(4)
        && isReal(s.peek(2)) && s.peek(2).value.eq(3),
      'OBJ→ Complex(3,4) → 3 4');
  }
  {
    const s = new Stack();
    s.push(Tagged('lbl', Real(7)));
    lookup('OBJ→').fn(s);
    assert(s.depth === 2 && isString(s.peek(1)) && s.peek(1).value === 'lbl'
        && isReal(s.peek(2)) && s.peek(2).value.eq(7),
      'OBJ→ :lbl:7 → 7 "lbl"');
  }
  {
    const s = new Stack();
    s.push(RList([Real(10), Real(20), Real(30)]));
    lookup('OBJ→').fn(s);
    assert(s.depth === 4
        && isInteger(s.peek(1)) && s.peek(1).value === 3n
        && isReal(s.peek(2)) && s.peek(2).value.eq(30)
        && isReal(s.peek(4)) && s.peek(4).value.eq(10),
      'OBJ→ { 10 20 30 } → 10 20 30 3');
  }
  {
    const s = new Stack();
    s.push(Vector([Real(1), Real(2), Real(3)]));
    lookup('OBJ→').fn(s);
    // Vector OBJ→ leaves a { size } marker, not a bare count, so the
    // data can be reassembled with →ARRY later.
    assert(s.depth === 4
        && s.peek(1).type === 'list' && s.peek(1).items[0].value.eq(3)
        && isReal(s.peek(2)) && s.peek(2).value.eq(3),
      'OBJ→ [1 2 3] → 1 2 3 { 3 }');
  }
  {
    const s = new Stack();
    s.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
    lookup('OBJ→').fn(s);
    assert(s.depth === 5
        && s.peek(1).type === 'list'
        && s.peek(1).items[0].value.eq(2) && s.peek(1).items[1].value.eq(2)
        && isReal(s.peek(2)) && s.peek(2).value.eq(4)
        && isReal(s.peek(5)) && s.peek(5).value.eq(1),
      'OBJ→ [[1 2][3 4]] → 1 2 3 4 { 2 2 }');
  }
  {
    const s = new Stack();
    s.push(Str('1 2 +'));
    lookup('OBJ→').fn(s);
    // Parsed as three values: Integer(1), Integer(2), Name('+')
    assert(s.depth === 3, 'OBJ→ "1 2 +" parses 3 tokens');
  }
  /* HP50 AUR §3-149 — OBJ→ on a Real returns the Real unchanged.
     Prior versions did a mantissa/exponent split here, but the AUR
     §3-149 Input/Output table lists no numeric-scalar entry; the
     mantissa/exponent split is the job of MANT (AUR p.3-6) and XPON
     (AUR p.3-9), which are wired separately.  R-008 closed by
     session 155. */
  {
    const s = new Stack();
    s.push(Real(3.14));
    lookup('OBJ→').fn(s);
    assert(s.depth === 1
        && isReal(s.peek(1)) && s.peek(1).value.eq(3.14),
      'session155: OBJ→ Real 3.14 → 3.14 (1-in / 1-out, no decomposition)');
  }
  {
    const s = new Stack();
    s.push(Real(1500));
    lookup('OBJ→').fn(s);
    assert(s.depth === 1
        && isReal(s.peek(1)) && s.peek(1).value.eq(1500),
      'session155: OBJ→ Real 1500 → 1500 (no mantissa/exponent split)');
  }
  {
    /* OBJ→ on Integer is also a no-op repush — symmetric with Real. */
    const s = new Stack();
    s.push(Integer(42n));
    lookup('OBJ→').fn(s);
    assert(s.depth === 1
        && isInteger(s.peek(1)) && s.peek(1).value === 42n,
      'session155: OBJ→ Integer 42 → 42 (1-in / 1-out)');
  }
  {
    /* OBJ→ on zero Real returns zero Real (no special-case decomp). */
    const s = new Stack();
    s.push(Real(0));
    lookup('OBJ→').fn(s);
    assert(s.depth === 1
        && isReal(s.peek(1)) && s.peek(1).value.isZero(),
      'session155: OBJ→ Real 0 → 0 (no zero-special-case)');
  }
  {
    /* MANT and XPON still operate on Real to provide the
       mantissa / exponent split that OBJ→ no longer does. */
    const s = new Stack();
    s.push(Real(1500));
    lookup('MANT').fn(s);
    assert(s.depth === 1
        && isReal(s.peek(1)) && Math.abs(s.peek(1).value.toNumber() - 1.5) < 1e-12,
      'session155: MANT 1500 → 1.5 (split lives at MANT, not OBJ→)');
    s.push(Real(1500));
    lookup('XPON').fn(s);
    assert(s.depth === 2
        && isReal(s.peek(1)) && s.peek(1).value.eq(3),
      'session155: XPON 1500 → 3 (split lives at XPON, not OBJ→)');
  }
  {
    /* Tagged OBJ→: AUR §3-149 shows tag as `"tag"` (String), not Name.
       Pinned here so any future "fix" to switch to Name(tag) is
       caught by the test suite as a regression. */
    const s = new Stack();
    s.push(Tagged('lbl', Real(7)));
    lookup('OBJ→').fn(s);
    assert(s.depth === 2
        && isString(s.peek(1)) && s.peek(1).value === 'lbl'
        && !isName(s.peek(1))
        && isReal(s.peek(2)) && s.peek(2).value.eq(7),
      'session155: OBJ→ :lbl:7 → 7 "lbl" — tag is a String per AUR §3-149');
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

  /* session 156 — OBJ→ edge / composition pins extending the
     session-155 Real/Tagged/Integer audit.  Five new pins covering
     the empty-container shapes (Vector / List / Program), the
     Tagged-of-Tagged composition, and the negative-Real branch.
     None of these were exercised by session 155's pin set; each
     guards a distinct branch of the OBJ→ dispatch in
     `www/src/rpl/ops.js:6642-6720`. */
  {
    /* Empty Vector → just the {0} size-list (no items pushed).
       Mirrors AUR §3-149's `[ x1, ... ,xn ] → x1 … xn  {n}` row
       at the n=0 boundary — pins that the size-list is emitted as
       an RList containing a single Real(0), not omitted entirely
       (which would collapse the depth to 0 and break the inverse
       round-trip via →ARRY). */
    const s = new Stack();
    s.push(Vector([]));
    lookup('OBJ→').fn(s);
    assert(s.depth === 1
        && s.peek(1).type === 'list'
        && s.peek(1).items.length === 1
        && isReal(s.peek(1).items[0])
        && s.peek(1).items[0].value.eq(0),
      'session156: OBJ→ empty Vector → just {0} size-list (no items, list with single Real(0))');
  }
  {
    /* Empty List → just the Integer(0) count (no items pushed).
       Mirrors AUR §3-149's `{ obj1, ... ,objn } → obj1 … objn  n`
       row at the n=0 boundary — pins that the trailing count is
       still emitted as Integer(0) so a generic
       `OBJ→ … N→PRG`-style metaprogramming loop sees a uniform
       (args, count) shape regardless of list size. */
    const s = new Stack();
    s.push(RList([]));
    lookup('OBJ→').fn(s);
    assert(s.depth === 1
        && isInteger(s.peek(1)) && s.peek(1).value === 0n,
      'session156: OBJ→ empty List → just Integer(0) count (no items, count present)');
  }
  {
    /* Empty Program → just the Integer(0) count.  Symmetric to
       the empty-List case above; pins that the Program branch
       (ops.js:6685-6691) does NOT special-case empty so the
       count is unconditional and a `« » OBJ→ →PRG` round-trip
       closes through the Integer(0) bridge. */
    const s = new Stack();
    s.push(Program([]));
    lookup('OBJ→').fn(s);
    assert(s.depth === 1
        && isInteger(s.peek(1)) && s.peek(1).value === 0n,
      'session156: OBJ→ empty Program → just Integer(0) count');
  }
  {
    /* Negative Real → unchanged (no sign decomposition).
       Session 155 pinned the zero-Real and positive-Real
       no-decomposition path; this closes the negative-sign
       branch, guarding against a future "fix" that special-cases
       sign extraction (some HP48-era RPL variants pushed
       sign + magnitude separately — AUR §3-149 explicitly does
       not). */
    const s = new Stack();
    s.push(Real(-1500));
    lookup('OBJ→').fn(s);
    assert(s.depth === 1
        && isReal(s.peek(1)) && s.peek(1).value.eq(-1500),
      'session156: OBJ→ Real(-1500) → -1500 (no sign decomposition; symmetric to session-155 positive/zero pins)');
  }
  {
    /* Tagged-of-Tagged: only the outermost layer peels.  The
       inner Tagged value is preserved as the level-2 push, and
       the outer tag becomes the level-1 String per AUR §3-149.
       Session 155 pinned the Real-inside-Tagged shape; this is
       the recursive-Tagged composition pin — guards against a
       refactor that flattens nested tags or recursively peels
       (the AUR is explicit that OBJ→ is one-layer-deep). */
    const s = new Stack();
    s.push(Tagged('outer', Tagged('inner', Real(7))));
    lookup('OBJ→').fn(s);
    assert(s.depth === 2,
      'session156: OBJ→ Tagged-of-Tagged → 2 stack items (one-layer peel, not recursive)');
    assert(isString(s.peek(1)) && s.peek(1).value === 'outer',
      'session156: OBJ→ Tagged-of-Tagged level-1 = "outer" (outer tag as String per AUR §3-149)');
    const inner = s.peek(2);
    assert(inner.type === 'tagged' && inner.tag === 'inner'
        && isReal(inner.value) && inner.value.value.eq(7),
      'session156: OBJ→ Tagged-of-Tagged level-2 = :inner:7 (inner Tagged preserved, NOT recursively peeled)');
  }

  /* session 159 — OBJ→ on Unit (HP50 AUR §3-149: `x_unit → x  1_unit`).
     Closes R-012 — the Unit branch was previously missing, so OBJ→ on
     a Unit value rejected with `Bad argument type` instead of pushing
     the bare numeric value (level 2) and the unit prototype `1_unit`
     (level 1).  Eight new pins covering the basic decomposition,
     multi-symbol uexpr, the round-trip-via-* contract, the negative-
     value branch, the inverse-style uexpr (`m/s`), Tagged-of-Unit
     composition, and the regression guard against future "fix"
     attempts that flip the level-1 push to a Name. */
  {
    /* Basic Unit decomposition: 5_m → 5  1_m. */
    const s = new Stack();
    s.push(Unit(5, [['m', 1]]));
    lookup('OBJ→').fn(s);
    assert(s.depth === 2,
      'session159: OBJ→ 5_m → 2 stack items (Real on level 2, Unit prototype on level 1)');
    assert(isReal(s.peek(2)) && s.peek(2).value.eq(5),
      'session159: OBJ→ 5_m level-2 = Real(5) (the bare numeric value per AUR §3-149)');
    assert(isUnit(s.peek(1)) && s.peek(1).value === 1
        && s.peek(1).uexpr.length === 1
        && s.peek(1).uexpr[0][0] === 'm' && s.peek(1).uexpr[0][1] === 1,
      'session159: OBJ→ 5_m level-1 = Unit(1, [[m,1]]) — the `1_m` prototype per AUR §3-149');
  }
  {
    /* Round-trip via *: x_unit OBJ→ * → x_unit (lossless reconstruction). */
    const s = new Stack();
    s.push(Unit(5, [['m', 1]]));
    lookup('OBJ→').fn(s);
    lookup('*').fn(s);
    assert(s.depth === 1 && isUnit(s.peek(1))
        && s.peek(1).value === 5
        && s.peek(1).uexpr.length === 1
        && s.peek(1).uexpr[0][0] === 'm' && s.peek(1).uexpr[0][1] === 1,
      'session159: 5_m OBJ→ * → 5_m (lossless round-trip via Real*Unit fold)');
  }
  {
    /* Multi-symbol inverse uexpr (m/s) preserved through OBJ→. */
    const s = new Stack();
    s.push(Unit(5, [['m', 1], ['s', -1]]));
    lookup('OBJ→').fn(s);
    assert(s.depth === 2 && isReal(s.peek(2)) && s.peek(2).value.eq(5),
      'session159: OBJ→ 5_m/s level-2 = Real(5)');
    const proto = s.peek(1);
    assert(isUnit(proto) && proto.value === 1
        && proto.uexpr.length === 2
        && proto.uexpr[0][0] === 'm' && proto.uexpr[0][1] === 1
        && proto.uexpr[1][0] === 's' && proto.uexpr[1][1] === -1,
      'session159: OBJ→ 5_m/s level-1 = Unit(1, [[m,1],[s,-1]]) — multi-symbol uexpr preserved');
  }
  {
    /* Negative-value Unit: -3_kg → -3  1_kg.  Sign rides the level-2
       Real, NOT the level-1 prototype (which always carries value=1). */
    const s = new Stack();
    s.push(Unit(-3, [['kg', 1]]));
    lookup('OBJ→').fn(s);
    assert(isReal(s.peek(2)) && s.peek(2).value.eq(-3),
      'session159: OBJ→ -3_kg level-2 = Real(-3) (sign on the value, NOT the prototype)');
    assert(isUnit(s.peek(1)) && s.peek(1).value === 1,
      'session159: OBJ→ -3_kg level-1 prototype value = 1 (positive, regardless of input sign)');
    /* And round-trip: -3_kg OBJ→ * → -3_kg. */
    lookup('*').fn(s);
    assert(s.depth === 1 && isUnit(s.peek(1))
        && s.peek(1).value === -3
        && s.peek(1).uexpr[0][0] === 'kg',
      'session159: -3_kg OBJ→ * → -3_kg (sign survives the round-trip)');
  }
  {
    /* Regression guard against a future "fix" that flips the level-1
       push to a Name.  AUR §3-149 unambiguously specifies a Unit
       prototype, not a Name — Don't switch to Name(uexpr-as-string). */
    const s = new Stack();
    s.push(Unit(7, [['m', 1]]));
    lookup('OBJ→').fn(s);
    assert(isUnit(s.peek(1)) && !isName(s.peek(1)) && !isString(s.peek(1)),
      'session159: OBJ→ Unit level-1 is a Unit value (NOT a Name, NOT a String) per AUR §3-149');
  }
  {
    /* Tagged-of-Unit composition: only the outermost layer peels.
       The inner Unit value is preserved as the level-2 push, NOT
       further decomposed — symmetric with the session-156
       Tagged-of-Tagged pin.  Guards against a refactor that
       recursively decomposes through composite types. */
    const s = new Stack();
    s.push(Tagged('len', Unit(5, [['m', 1]])));
    lookup('OBJ→').fn(s);
    assert(s.depth === 2,
      'session159: OBJ→ :len:5_m → 2 stack items (one-layer Tagged peel)');
    assert(isString(s.peek(1)) && s.peek(1).value === 'len',
      'session159: OBJ→ :len:5_m level-1 = "len" (tag as String per AUR §3-149)');
    const inner = s.peek(2);
    assert(isUnit(inner) && inner.value === 5 && inner.uexpr[0][0] === 'm',
      'session159: OBJ→ :len:5_m level-2 = 5_m (inner Unit preserved, NOT recursively decomposed)');
  }
  {
    /* ASCII alias OBJ-> works on Unit too (parity with session-155
       OBJ-> alias pin on List). */
    const s = new Stack();
    s.push(Unit(2, [['kg', 1]]));
    lookup('OBJ->').fn(s);
    assert(s.depth === 2
        && isReal(s.peek(2)) && s.peek(2).value.eq(2)
        && isUnit(s.peek(1)) && s.peek(1).value === 1,
      'session159: ASCII alias OBJ-> on Unit behaves the same as OBJ→');
  }
  {
    /* Reverse-uexpr-shape (1/m): pins that the prototype carries the
       same uexpr shape regardless of whether exponents are positive
       or negative — guards against a future refactor that strips
       negative exponents on the prototype. */
    const s = new Stack();
    s.push(Unit(2, [['m', -1]]));
    lookup('OBJ→').fn(s);
    const proto = s.peek(1);
    assert(isUnit(proto) && proto.value === 1
        && proto.uexpr.length === 1
        && proto.uexpr[0][0] === 'm' && proto.uexpr[0][1] === -1,
      'session159: OBJ→ 2_(1/m) level-1 prototype preserves the [m,-1] negative-exponent uexpr');
  }

  /* session160: OBJ→ Unit follow-up edges — boundary cases (zero / fractional
     value, exponent != ±1 on uexpr) and round-trip closures that session 159's
     R-012 close pin-set did not enumerate.  Five pins covering the value-side
     edges (zero, fractional) and the uexpr-side edges (exponent ≠ 1, multi-
     symbol round-trip, higher-power round-trip).  All five exercise the same
     Unit branch in OBJ→'s dispatch; mirror of session 156's empty-V/L/P
     boundary closures applied to the Unit row of AUR §3-149.  No source
     change — the branch has been live since session 159. */
  {
    /* Zero-value Unit boundary: 0_m OBJ→ → 0  1_m.  Sign-rule edge: zero
       has no sign so the Real(0) push and the level-1 prototype both have
       value=1 — closes the value=0 corner that the s159 negative -3_kg
       pin and positive 5_m pin straddle. */
    const s = new Stack();
    s.push(Unit(0, [['m', 1]]));
    lookup('OBJ→').fn(s);
    assert(s.depth === 2 && isReal(s.peek(2)) && s.peek(2).value.eq(0),
      'session160: OBJ→ 0_m level-2 = Real(0) (zero-value boundary; closes value=0 corner between s159 5_m positive and -3_kg negative pins)');
    assert(isUnit(s.peek(1)) && s.peek(1).value === 1
        && s.peek(1).uexpr.length === 1 && s.peek(1).uexpr[0][0] === 'm'
        && s.peek(1).uexpr[0][1] === 1,
      'session160: OBJ→ 0_m level-1 = Unit(1, [[m,1]]) (prototype shape unchanged at value=0; the prototype always carries value=1 regardless of input value)');
  }
  {
    /* Fractional-value Unit: 2.5_m OBJ→ → 2.5  1_m.  Pins that non-integer
       Real values pass through OBJ→'s value-extraction unchanged — guards
       against a refactor that would round/truncate the level-2 push. */
    const s = new Stack();
    s.push(Unit(2.5, [['m', 1]]));
    lookup('OBJ→').fn(s);
    assert(s.depth === 2 && isReal(s.peek(2)) && s.peek(2).value.eq(2.5),
      'session160: OBJ→ 2.5_m level-2 = Real(2.5) (fractional value passed through OBJ→ unchanged; complements s159 integer-value pins)');
  }
  {
    /* Higher-power uexpr: 3_m^2 OBJ→ → 3  1_m^2.  Exponent ≠ ±1 on the
       prototype.  Distinct from s159's 5_m (exponent +1) and 2_(1/m)
       (exponent -1) pins — pins that arbitrary integer exponents survive
       the prototype construction. */
    const s = new Stack();
    s.push(Unit(3, [['m', 2]]));
    lookup('OBJ→').fn(s);
    const proto = s.peek(1);
    assert(s.depth === 2 && isReal(s.peek(2)) && s.peek(2).value.eq(3)
        && isUnit(proto) && proto.value === 1
        && proto.uexpr.length === 1
        && proto.uexpr[0][0] === 'm' && proto.uexpr[0][1] === 2,
      'session160: OBJ→ 3_m^2 → Real(3) + Unit(1, [[m,2]]) (exponent ≠ ±1 preserved on prototype; closes the integer-exponent shoulder between s159 +1 and -1 pins)');
  }
  {
    /* Multi-symbol round-trip: 5_m/s OBJ→ * → 5_m/s.  Mirror of s159's
       single-symbol round-trip pin lifted onto the multi-symbol uexpr —
       guards against a refactor that re-orders or normalizes the uexpr
       differently in the *-fold path versus the OBJ→ build path. */
    const s = new Stack();
    s.push(Unit(5, [['m', 1], ['s', -1]]));
    lookup('OBJ→').fn(s);
    lookup('*').fn(s);
    assert(s.depth === 1 && isUnit(s.peek(1))
        && s.peek(1).value === 5
        && s.peek(1).uexpr.length === 2
        && s.peek(1).uexpr[0][0] === 'm' && s.peek(1).uexpr[0][1] === 1
        && s.peek(1).uexpr[1][0] === 's' && s.peek(1).uexpr[1][1] === -1,
      'session160: 5_m/s OBJ→ * → 5_m/s (multi-symbol uexpr round-trip closes via Real*Unit fold; uexpr ordering preserved [m,1][s,-1])');
  }
  {
    /* Higher-power round-trip: 3_m^2 OBJ→ * → 3_m^2.  Mirror of s159's
       single-symbol +1-exponent round-trip onto exponent ≠ ±1 — pins that
       Real*Unit fold reconstructs the higher-power uexpr exactly. */
    const s = new Stack();
    s.push(Unit(3, [['m', 2]]));
    lookup('OBJ→').fn(s);
    lookup('*').fn(s);
    assert(s.depth === 1 && isUnit(s.peek(1))
        && s.peek(1).value === 3
        && s.peek(1).uexpr.length === 1
        && s.peek(1).uexpr[0][0] === 'm' && s.peek(1).uexpr[0][1] === 2,
      'session160: 3_m^2 OBJ→ * → 3_m^2 (higher-power uexpr round-trip via Real*Unit fold; exponent=2 reconstructed exactly)');
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
  assert(v.items[0].value.eq(1) && v.items[2].value.eq(3),
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
      && v.items[0].value.eq(10) && v.items[1].value.eq(20),
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
  assert(m.rows[0][0].value.eq(1) && m.rows[0][2].value.eq(3)
      && m.rows[1][0].value.eq(4) && m.rows[1][2].value.eq(6),
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
      && size.items[0].value.eq(3),
    'ARRY→ pushes {3} as size spec');
  assert(s.peek(2).value.eq(33) && s.peek(4).value.eq(11),
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
      && size.items[0].value.eq(2) && size.items[1].value.eq(2),
    'ARRY→ on Matrix pushes {2 2} size spec');
  assert(s.peek(2).value.eq(4) && s.peek(5).value.eq(1),
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
      && round.items[0].value.eq(1) && round.items[3].value.eq(4),
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
      && round.rows[0][0].value.eq(1) && round.rows[1][2].value.eq(6),
    'ARRY→ then →ARRY round-trips a Matrix (row-major preserved)');
}
/* ---- ASCII alias ARRY-> ---- */
{
  const s = new Stack();
  s.push(Vector([Real(9)]));
  lookup('ARRY->').fn(s);
  assert(s.depth === 2
      && s.peek(1).type === 'list' && s.peek(1).items[0].value.eq(1),
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
      && v.items[0].value.eq(3) && v.items[1].value.eq(4),
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
      && v.items[0].value.eq(1) && v.items[2].value.eq(3),
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
  assert(s.peek(3).value.eq(11) && s.peek(2).value.eq(22) && s.peek(1).value.eq(33),
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
  assert(s.depth === 2 && s.peek(1).value.eq(6),
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
      && s.peek(3).value.eq(1) && s.peek(1).value.eq(3),
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
  assert(s.depth === 1 && isReal(s.peek()) && s.peek().value.eq(7),
    'session046: 3 4 + → 7');
  lookup('LASTARG').fn(s);
  assert(s.depth === 3
      && isReal(s.peek(2)) && s.peek(2).value.eq(3)
      && isReal(s.peek(1)) && s.peek(1).value.eq(4),
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
      && s.peek(2).value.eq(10) && s.peek(1).value.eq(2),
    'session046: LAST (synonym) after 10 2 - pushes 10 2');
}

/* ---- LASTARG after a unary op ---- */
{
  const s = new Stack();
  s.push(Real(5));
  s.runOp(() => lookup('NEG').fn(s));
  assert(s.peek().value.eq(-5), 'session046: 5 NEG → -5 (setup)');
  lookup('LASTARG').fn(s);
  assert(s.depth === 2 && s.peek(2).value.eq(-5) && s.peek(1).value.eq(5),
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
  assert(s.peek(1).value.eq(99),  'session046: LASTARG PUT arg3 = value');
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
  assert(s.peek(1).value.eq(3) && s.peek(2).value.eq(8)
      && s.peek(3).value.eq(3) && s.peek(4).value.eq(8),
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
      && s.peek(4).value.eq(2) && s.peek(3).value.eq(9)
      && s.peek(2).value.eq(2) && s.peek(1).value.eq(9),
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
    // Running it should produce 7.  Under APPROX the push-time
    // coercion makes the result a Real (Decimal); under EXACT the
    // integer path keeps it as Integer.  Handle both.
    lookup('EVAL').fn(s);
    const top = s.peek();
    const topVal = top.type === 'integer' ? Number(top.value)
                : top.type === 'real'    ? top.value.toNumber() : null;
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
  assert(s._items[0].type === 'real' && s._items[0].value.eq(3),
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
  assert(s._items[0].type === 'real' && s._items[0].value.eq(7),
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
    // Original EVAL: 6 7 * 2 - = 40.  Under APPROX the push-time
    // coercion makes the top-of-stack a Real (Decimal); unwrap with
    // .toNumber() so the numeric equality test is mode-agnostic.
    const s0 = new Stack();
    s0.push(src);
    lookup('EVAL').fn(s0);
    const origTop = s0.peek();
    const origVal = origTop.type === 'integer' ? Number(origTop.value)
                  : origTop.type === 'real'    ? origTop.value.toNumber()
                  : origTop.value;

    const back = _roundTripProgram(src);
    const s1 = new Stack();
    s1.push(back);
    lookup('EVAL').fn(s1);
    const backTop = s1.peek();
    const backVal = backTop.type === 'integer' ? Number(backTop.value)
                  : backTop.type === 'real'    ? backTop.value.toNumber()
                  : backTop.value;
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
    // Re-run the round-tripped program.  Top-of-stack may be Integer
    // (EXACT) or Real/Decimal (APPROX after push coercion).
    const s = new Stack();
    s.push(back);
    lookup('EVAL').fn(s);
    const top = s.peek();
    const v = top.type === 'integer' ? Number(top.value)
            : top.type === 'real'    ? top.value.toNumber()
            : top.value;
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
  // the internal `if (n === 0) { push Vector([]); }` check inside
  // `_toArrayOp` is unreachable because `_toIntIdx` refuses zero.
  // Flipping that would be a new behaviour and needs a downstream
  // audit (matrix shape validation, ARRY→ round-trip, etc.); the
  // current rejection shape is pinned here so a future cleanup sees
  // the deliberate asymmetry.  Tracked in RPL.md.
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
         top.items[0].type === 'real' && top.items[0].value.eq(3),
    'session077: ARRY→ size-spec is a LIST wrapping Real — asymmetric with '
    + 'LIST→/OBJ→(Program) by design (matches →ARRY input shape)');
}

/* ---- SIZE on Program ---- */
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

/* ---- TVARS — type-filtered VARS (session 099) ---- */
{
  resetHome();

  // Seed a variety of types in the current dir.
  varStore('AR',  Real(3.14));                      // type 0
  varStore('AC',  Complex(1, 2));                   // type 1
  varStore('AS',  Str('hi'));                       // type 2
  varStore('AL',  RList([Real(1)]));                // type 5
  varStore('AP',  Program([ Integer(1n) ]));        // type 8
  varStore('AZ',  Integer(42n));                    // type 28
  varStore('AR2', Real(2.71));                      // type 0 (second Real)

  // --- Integer arg: single type filter ---
  {
    const s = new Stack();
    s.push(Integer(0n));
    lookup('TVARS').fn(s);
    const r = s.peek();
    assert(r.type === 'list' && r.items.length === 2,
      'session099: TVARS 0 returns both Reals');
    const ids = r.items.map(n => n.id).sort();
    assert(ids[0] === 'AR' && ids[1] === 'AR2',
      'session099: TVARS 0 picks AR and AR2');
  }

  // --- Real-but-integer arg: should coerce ---
  {
    const s = new Stack();
    s.push(Real(28));
    lookup('TVARS').fn(s);
    const r = s.peek();
    assert(r.type === 'list' && r.items.length === 1 && r.items[0].id === 'AZ',
      'session099: TVARS 28. (Real) picks Integer var AZ');
  }

  // --- Integer arg: type that nobody matches ---
  {
    const s = new Stack();
    s.push(Integer(9n));  // Algebraic / Symbolic — none stored
    lookup('TVARS').fn(s);
    const r = s.peek();
    assert(r.type === 'list' && r.items.length === 0,
      'session099: TVARS 9 with no Symbolics returns {}');
  }

  // --- Negative Integer: complement (all except type |n|) ---
  {
    const s = new Stack();
    s.push(Integer(-0n));  // -0n === 0n in BigInt semantics — use Integer(-1) route instead
    lookup('TVARS').fn(s);
    const r = s.peek();
    // -0 behaves as 0 — just a single-type positive filter.  Sanity, not the real negative test.
    assert(r.type === 'list' && r.items.length === 2,
      'session099: TVARS -0 equivalent to TVARS 0');
  }
  {
    const s = new Stack();
    s.push(Integer(-2n));
    lookup('TVARS').fn(s);
    const r = s.peek();
    // All stored types EXCEPT 2 (String): AR, AC, AL, AP, AZ, AR2 — 6 names.
    assert(r.type === 'list' && r.items.length === 6,
      'session099: TVARS -2 excludes Strings (6 remaining)');
    const ids = new Set(r.items.map(n => n.id));
    assert(!ids.has('AS'), 'session099: TVARS -2 does not include AS');
    assert(ids.has('AR') && ids.has('AC') && ids.has('AL') && ids.has('AP') && ids.has('AZ') && ids.has('AR2'),
      'session099: TVARS -2 returns every non-String var');
  }

  // --- List arg: union of positive types ---
  {
    const s = new Stack();
    s.push(RList([ Integer(0n), Integer(2n) ]));
    lookup('TVARS').fn(s);
    const r = s.peek();
    // Reals (2) + String (1) = 3 names.
    assert(r.type === 'list' && r.items.length === 3,
      'session099: TVARS {0 2} unions Reals + String');
    const ids = new Set(r.items.map(n => n.id));
    assert(ids.has('AR') && ids.has('AR2') && ids.has('AS'),
      'session099: TVARS {0 2} includes AR, AR2, AS');
  }

  // --- List arg with a negative: include-list minus exclude-list ---
  {
    const s = new Stack();
    s.push(RList([ Integer(0n), Integer(2n), Integer(-2n) ]));
    lookup('TVARS').fn(s);
    const r = s.peek();
    // include = {0,2}; exclude = {2}; net = {0} → 2 Reals.
    assert(r.type === 'list' && r.items.length === 2,
      'session099: TVARS {0 2 -2} nets to just Reals after exclusion');
    const ids = new Set(r.items.map(n => n.id));
    assert(ids.has('AR') && ids.has('AR2'),
      'session099: TVARS {0 2 -2} returns only Reals');
  }

  // --- Empty list: no positive filter → everything (minus no exclusions) ---
  {
    const s = new Stack();
    s.push(RList([]));
    lookup('TVARS').fn(s);
    const r = s.peek();
    assert(r.type === 'list' && r.items.length === 7,
      'session099: TVARS {} returns every var (empty include == no filter)');
  }

  // --- Reject non-integer Real ---
  {
    const s = new Stack();
    s.push(Real(3.14));
    let caught = null;
    try { lookup('TVARS').fn(s); } catch (e) { caught = e; }
    assert(caught && /Bad argument type/.test(caught.message),
      'session099: TVARS 3.14 rejects non-integer Real');
  }

  // --- Reject Name / String / Program as type arg ---
  {
    const s = new Stack();
    s.push(Name('foo'));
    let caught = null;
    try { lookup('TVARS').fn(s); } catch (e) { caught = e; }
    assert(caught && /Bad argument type/.test(caught.message),
      'session099: TVARS with Name arg rejects');
  }
  {
    const s = new Stack();
    s.push(Str('bar'));
    let caught = null;
    try { lookup('TVARS').fn(s); } catch (e) { caught = e; }
    assert(caught && /Bad argument type/.test(caught.message),
      'session099: TVARS with String arg rejects');
  }

  // --- List containing a non-integer element: reject ---
  {
    const s = new Stack();
    s.push(RList([ Integer(0n), Str('x') ]));
    let caught = null;
    try { lookup('TVARS').fn(s); } catch (e) { caught = e; }
    assert(caught && /Bad argument type/.test(caught.message),
      'session099: TVARS { 0 "x" } rejects non-integer list element');
  }

  // --- Empty HOME: TVARS returns {} for any filter ---
  {
    resetHome();
    const s = new Stack();
    s.push(Integer(0n));
    lookup('TVARS').fn(s);
    assert(s.peek().type === 'list' && s.peek().items.length === 0,
      'session099: TVARS on empty dir returns {}');
  }
}

/* ================================================================
   Session 146 — NEWOB on a Program.

   NEWOB ( obj → obj' ) is the HP50 "force a fresh copy" op.  On the
   real unit it materialises a value that was recalled by reference
   into a freshly-allocated copy.  Our implementation rebuilds every
   composite container (List / Vector / Matrix / Program) so that
   `===` against the original is false but the structural content
   round-trips.

   Sessions 047 / 047b pinned NEWOB on Real, List, Matrix.  Program
   NEWOB has been live since session 067 (the same change that
   added OBJ→ / →PRG) but no test has pinned the round-trip
   invariants for it: distinct-object identity, distinct-tokens-
   array identity, structural equality, EVAL semantics agreement,
   and structural-program (IF/THEN/ELSE/END) survival.  This
   block closes that gap.

   The lane-scope rationale for filing these under the rpl-
   programming lane (vs. the data-types lane that owns the rest of
   the NEWOB family): Program is the User-RPL programming-lane
   value type — its tokens carry the structural-keyword vocabulary
   the lane owns — and the round-trip needs to round-trip that
   vocabulary correctly.
   ================================================================ */

/* ---- NEWOB on an empty Program returns a distinct empty Program ---- */
{
  const s = new Stack();
  const orig = Program([]);
  s.push(orig);
  lookup('NEWOB').fn(s);
  assert(s.depth === 1 && isProgram(s.peek()),
    'session146: NEWOB on empty Program leaves a Program');
  assert(s.peek() !== orig,
    'session146: NEWOB on empty Program returns a distinct object');
  assert(s.peek().tokens.length === 0,
    'session146: NEWOB on empty Program preserves zero-token shape');
}

/* ---- NEWOB on a non-empty Program returns a distinct Program with
        equal token count, distinct tokens-array, equal token shape ---- */
{
  const s = new Stack();
  const orig = Program([Integer(3n), Integer(4n), Name('+')]);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(isProgram(copy),
    'session146: NEWOB on non-empty Program leaves a Program');
  assert(copy !== orig,
    'session146: NEWOB on non-empty Program returns a distinct object');
  assert(copy.tokens !== orig.tokens,
    'session146: NEWOB on Program returns a distinct tokens array (not === to orig.tokens)');
  assert(copy.tokens.length === orig.tokens.length,
    'session146: NEWOB on Program preserves token count');
  assert(copy.tokens[0].type === 'integer' && copy.tokens[0].value === 3n,
    'session146: NEWOB Program token 0 preserves Integer(3)');
  assert(copy.tokens[1].type === 'integer' && copy.tokens[1].value === 4n,
    'session146: NEWOB Program token 1 preserves Integer(4)');
  assert(copy.tokens[2].type === 'name' && copy.tokens[2].id === '+',
    'session146: NEWOB Program token 2 preserves Name(+)');
}

/* ---- NEWOB-produced tokens array is frozen ---- */
{
  const s = new Stack();
  s.push(Program([Integer(1n), Integer(2n)]));
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(Object.isFrozen(copy.tokens),
    'session146: NEWOB on Program returns a frozen tokens array (matches Program() invariant)');
}

/* ---- NEWOB on a Program containing nested Program preserves nesting ---- */
{
  const s = new Stack();
  const inner = Program([Name('+')]);
  const orig = Program([Integer(10n), Integer(20n), inner, Name('EVAL')]);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(isProgram(copy) && copy !== orig,
    'session146: NEWOB on nested Program returns a distinct outer Program');
  assert(copy.tokens.length === 4,
    'session146: NEWOB nested Program preserves outer token count');
  assert(isProgram(copy.tokens[2]) && copy.tokens[2].tokens.length === 1,
    'session146: NEWOB nested Program inner token is still a 1-token Program');
  // The shallow rebuild policy in `_newObCopy` re-wraps the outer
  // tokens array but does NOT recurse into nested Programs — the
  // inner Program shares identity with the original.  HP50 NEWOB
  // is one-level "decouple", so this is the contract.
  assert(copy.tokens[2] === inner,
    'session146: NEWOB on Program is a shallow copy — nested Program object identity preserved');
}

/* ---- NEWOB on a Program containing a structural-keyword body
        (IF/THEN/ELSE/END) preserves every keyword token ---- */
{
  const s = new Stack();
  const orig = Program([
    Integer(5n),
    Name('IF'), Name('DUP'), Integer(0n), Name('>'),
    Name('THEN'), Integer(100n), Name('+'),
    Name('ELSE'), Name('NEG'),
    Name('END'),
  ]);
  s.push(orig);
  lookup('NEWOB').fn(s);
  const copy = s.peek();
  assert(isProgram(copy) && copy !== orig,
    'session146: NEWOB on IF/THEN/ELSE/END Program returns distinct Program');
  assert(copy.tokens.length === orig.tokens.length,
    'session146: NEWOB on IF/THEN/ELSE/END Program preserves token count');
  // Spot-check every structural keyword survives byte-for-byte.
  const tokIds = copy.tokens.filter(t => t.type === 'name').map(t => t.id);
  const want = ['IF', 'DUP', '>', 'THEN', '+', 'ELSE', 'NEG', 'END'];
  let allHave = true;
  for (const w of want) if (!tokIds.includes(w)) { allHave = false; break; }
  assert(allHave,
    'session146: NEWOB preserves IF/THEN/ELSE/END structural keywords');
}

/* ---- NEWOB result EVALs to the same final stack as the original ---- */
{
  resetHome();
  const prevApprox = calcState.approxMode;
  setApproxMode(true);
  try {
    const orig = Program([Integer(6n), Integer(7n), Name('*'), Integer(2n), Name('-')]);
    // Evaluate the original.
    const s0 = new Stack();
    s0.push(orig);
    lookup('EVAL').fn(s0);
    const t0 = s0.peek();
    const v0 = t0.type === 'integer' ? Number(t0.value)
             : t0.type === 'real'    ? t0.value.toNumber() : null;

    // Evaluate the NEWOB copy.
    const s1 = new Stack();
    s1.push(orig);
    lookup('NEWOB').fn(s1);
    const copy = s1.peek();
    assert(copy !== orig,
      'session146: NEWOB precondition — copy is a distinct Program object');
    lookup('EVAL').fn(s1);
    const t1 = s1.peek();
    const v1 = t1.type === 'integer' ? Number(t1.value)
             : t1.type === 'real'    ? t1.value.toNumber() : null;

    assert(v0 === 40 && v1 === 40 && v0 === v1,
      'session146: NEWOB-then-EVAL agrees with original-EVAL (6 7 * 2 - = 40)');
  } finally {
    setApproxMode(prevApprox);
  }
}

/* ---- NEWOB on a Program → DECOMP→STR→ round-trip is invariant ---- */
{
  const s = new Stack();
  const orig = Program([Integer(2n), Name('X', { quoted: true }), Name('*')]);
  s.push(orig);
  lookup('NEWOB').fn(s);
  // Now run DECOMP→STR→ on the NEWOB copy.
  lookup('DECOMP').fn(s);
  lookup('STR→').fn(s);
  const back = s.peek();
  assert(isProgram(back) && back.tokens.length === 3,
    'session146: NEWOB→DECOMP→STR→ on Program preserves shape');
  assert(back.tokens[1].type === 'name' && back.tokens[1].id === 'X' && back.tokens[1].quoted,
    'session146: NEWOB→DECOMP→STR→ preserves quoted Name token');
}

/* ================================================================
   DECOMP → STR→ round-trip for the structural-keyword family
   (CASE, IFERR, IF, WHILE, DO, START, FOR + auto-close variants).
   Pins that the formatter's canonical keyword form parses back
   through DECOMP→STR→.  A regression in either the formatter
   (mis-spelled keyword, dropped delimiter) or the parser (missing
   tokenisation rule) for any one of these constructs would surface
   here.
   ================================================================ */

/* ---- IFERR / THEN / ELSE / END round-trip ---- */
{
  resetHome();
  const prevApprox = calcState.approxMode;
  setApproxMode(true);
  try {
    // « IFERR 1 0 / THEN 99 ELSE 7 END »  — divide-by-zero trapped,
    // THEN clause runs and pushes 99.
    const src = Program([
      Name('IFERR'), Integer(1n), Integer(0n), Name('/'),
      Name('THEN'), Integer(99n),
      Name('ELSE'), Integer(7n),
      Name('END'),
    ]);
    const back = _roundTripProgram(src);
    assert(back.tokens.length === src.tokens.length,
      'session146: DECOMP→STR→ preserves IFERR/THEN/ELSE/END token count');
    const s = new Stack();
    s.push(back);
    lookup('EVAL').fn(s);
    const top = s.peek();
    const v = top.type === 'integer' ? Number(top.value)
            : top.type === 'real'    ? top.value.toNumber() : null;
    assert(v === 99,
      'session146: DECOMP→STR→ on IFERR program preserves trap-then-THEN semantics');
  } finally {
    setApproxMode(prevApprox);
  }
}

/* ---- WHILE / REPEAT / END round-trip ---- */
{
  resetHome();
  const prevApprox = calcState.approxMode;
  setApproxMode(true);
  try {
    // « 0 1 WHILE DUP 5 < REPEAT 1 + END SWAP DROP »
    //   loop var stays on top of stack, increments until ≥ 5,
    //   then SWAP DROP cleans up the initial 0.  Final: 5.
    const src = Program([
      Integer(0n), Integer(1n),
      Name('WHILE'), Name('DUP'), Integer(5n), Name('<'),
      Name('REPEAT'), Integer(1n), Name('+'),
      Name('END'),
      Name('SWAP'), Name('DROP'),
    ]);
    const back = _roundTripProgram(src);
    assert(back.tokens.length === src.tokens.length,
      'session146: DECOMP→STR→ preserves WHILE/REPEAT/END token count');
    const s = new Stack();
    s.push(back);
    lookup('EVAL').fn(s);
    const top = s.peek();
    const v = top.type === 'integer' ? Number(top.value)
            : top.type === 'real'    ? top.value.toNumber() : null;
    assert(v === 5,
      'session146: DECOMP→STR→ on WHILE program preserves loop semantics (1 → 5)');
  } finally {
    setApproxMode(prevApprox);
  }
}

/* ---- DO / UNTIL / END round-trip ---- */
{
  resetHome();
  const prevApprox = calcState.approxMode;
  setApproxMode(true);
  try {
    // « 1 DO 2 * DUP 16 ≥ UNTIL END »  — doubles starting from 1
    // until value ≥ 16.  Trace: 1→2→4→8→16, stop.  Final: 16.
    const src = Program([
      Integer(1n),
      Name('DO'), Integer(2n), Name('*'), Name('DUP'), Integer(16n), Name('≥'),
      Name('UNTIL'),
      Name('END'),
    ]);
    const back = _roundTripProgram(src);
    assert(back.tokens.length === src.tokens.length,
      'session146: DECOMP→STR→ preserves DO/UNTIL/END token count');
    const s = new Stack();
    s.push(back);
    lookup('EVAL').fn(s);
    const top = s.peek();
    const v = top.type === 'integer' ? Number(top.value)
            : top.type === 'real'    ? top.value.toNumber() : null;
    assert(v === 16,
      'session146: DECOMP→STR→ on DO/UNTIL program preserves loop semantics (1 → 16)');
  } finally {
    setApproxMode(prevApprox);
  }
}

/* ---- START / NEXT round-trip ---- */
{
  resetHome();
  const prevApprox = calcState.approxMode;
  setApproxMode(true);
  try {
    // « 0 1 4 START 1 + NEXT »  — counted loop 1..4, body increments
    // accumulator each iteration.  Final: 4.
    const src = Program([
      Integer(0n),
      Integer(1n), Integer(4n),
      Name('START'), Integer(1n), Name('+'),
      Name('NEXT'),
    ]);
    const back = _roundTripProgram(src);
    assert(back.tokens.length === src.tokens.length,
      'session146: DECOMP→STR→ preserves START/NEXT token count');
    const s = new Stack();
    s.push(back);
    lookup('EVAL').fn(s);
    const top = s.peek();
    const v = top.type === 'integer' ? Number(top.value)
            : top.type === 'real'    ? top.value.toNumber() : null;
    assert(v === 4,
      'session146: DECOMP→STR→ on START/NEXT program preserves loop semantics (4 iters → 4)');
  } finally {
    setApproxMode(prevApprox);
  }
}

/* ---- FOR / NEXT round-trip ---- */
{
  resetHome();
  const prevApprox = calcState.approxMode;
  setApproxMode(true);
  try {
    // « 0 1 4 FOR i i + NEXT »  — sum 1+2+3+4 = 10.
    const src = Program([
      Integer(0n),
      Integer(1n), Integer(4n),
      Name('FOR'), Name('i'), Name('i'), Name('+'),
      Name('NEXT'),
    ]);
    const back = _roundTripProgram(src);
    assert(back.tokens.length === src.tokens.length,
      'session146: DECOMP→STR→ preserves FOR/NEXT token count');
    const s = new Stack();
    s.push(back);
    lookup('EVAL').fn(s);
    const top = s.peek();
    const v = top.type === 'integer' ? Number(top.value)
            : top.type === 'real'    ? top.value.toNumber() : null;
    assert(v === 10,
      'session146: DECOMP→STR→ on FOR/NEXT program preserves loop semantics (sum 1..4 = 10)');
  } finally {
    setApproxMode(prevApprox);
  }
}

/* ---- CASE / THEN / END / END round-trip ---- */
{
  resetHome();
  const prevApprox = calcState.approxMode;
  setApproxMode(true);
  try {
    // « 2 CASE DUP 1 == THEN "one" END DUP 2 == THEN "two" END "other" END »
    //   Test value 2 → "two" branch fires, picks the matching string.
    const src = Program([
      Integer(2n),
      Name('CASE'),
        Name('DUP'), Integer(1n), Name('=='), Name('THEN'), Str('one'), Name('END'),
        Name('DUP'), Integer(2n), Name('=='), Name('THEN'), Str('two'), Name('END'),
        Str('other'),
      Name('END'),
    ]);
    const back = _roundTripProgram(src);
    assert(back.tokens.length === src.tokens.length,
      'session146: DECOMP→STR→ preserves CASE token count');
    const s = new Stack();
    s.push(back);
    lookup('EVAL').fn(s);
    const top = s.peek();
    assert(top.type === 'string' && top.value === 'two',
      'session146: DECOMP→STR→ on CASE program preserves dispatch (2 → "two")');
  } finally {
    setApproxMode(prevApprox);
  }
}

/* ---- → (compiled local) round-trip ---- */
{
  resetHome();
  const prevApprox = calcState.approxMode;
  setApproxMode(true);
  try {
    // « 3 4 → a b « a b * » »  — multiply locals → 12.
    const inner = Program([Name('a'), Name('b'), Name('*')]);
    const src = Program([
      Integer(3n), Integer(4n),
      Name('→'), Name('a'), Name('b'),
      inner,
    ]);
    const back = _roundTripProgram(src);
    assert(back.tokens.length === src.tokens.length,
      'session146: DECOMP→STR→ preserves → (compiled-local) token count');
    const s = new Stack();
    s.push(back);
    lookup('EVAL').fn(s);
    const top = s.peek();
    const v = top.type === 'integer' ? Number(top.value)
            : top.type === 'real'    ? top.value.toNumber() : null;
    assert(v === 12,
      'session146: DECOMP→STR→ on → program preserves local-binding semantics (3 4 → a b → 12)');
  } finally {
    setApproxMode(prevApprox);
  }
}
