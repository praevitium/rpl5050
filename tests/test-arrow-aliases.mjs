/* Arrow-op alias coverage.

   HP50 has many ops whose canonical name uses a Unicode arrow (→ or
   its reverse), e.g. `→STR`, `R→D`, `C→R`, `→LIST`, `→UNIT`, etc.
   The real HP50 offers no ASCII alternative, but this implementation
   registers ASCII aliases (e.g. `->STR`, `R->D`, `C->R`) so users on
   keyboards without composition support can still reach the op.

   The aliases are the kind of code that silently rots: one half gets
   updated, the other half drifts.  This file pins them down.  For each
   arrow op below we:

     1. Exercise the Unicode form with a representative input.
     2. Exercise the ASCII form with the SAME input on a fresh stack.
     3. Assert the two outputs are structurally identical.

   That gives both a positive happy-path test AND a regression guard
   against the two halves drifting apart.

   Ops covered:
     R→D / R->D            Radians → degrees
     D→R / D->R            Degrees → radians
     R→B / B→R / ->B / ->R Real ↔ BinaryInteger
     →LIST / ->LIST        Compose list from stack
     →STR / ->STR          Value → String
     →V2 / →V3 / ->V2/V3   Compose Vector
     V→ / V->              Decompose Vector
     →Q / ->Q              Real → rational Symbolic
     →Qπ / ->Qπ            Real → rational·π Symbolic
     →HMS / HMS→ + ASCII   Decimal hours ↔ HMS form
     →TAG / ->TAG          Value + tag → Tagged
     →UNIT / ->UNIT        Real + template Unit → Unit
*/

import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import {
  Real, Integer, BinaryInteger, Complex, Str, Name, Tagged, Unit,
  RList, Vector, Matrix, Symbolic,
  isReal, isInteger, isBinaryInteger, isComplex, isTagged, isUnit,
  isString, isVector, isSymbolic,
} from '../www/src/rpl/types.js';
import { setBinaryBase, resetBinaryState, setWordsize } from '../www/src/rpl/state.js';
import { assert } from './helpers.mjs';

/* Helper: deep-equal for the common RPL value shapes we hit here.
   Purposefully narrow — arrow ops mostly return scalars / vectors
   / strings / tagged, and we want an assertion-free path that lets
   us say "alias produces the same thing as the canonical op". */
function rplEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || a.type !== b.type) return false;
  switch (a.type) {
    case 'integer':        return a.value === b.value;
    case 'real':           return a.value.eq(b.value);
    case 'binaryInteger':  return a.value === b.value && a.base === b.base;
    case 'complex':        return a.re === b.re && a.im === b.im;
    case 'string':         return a.value === b.value;
    case 'name':           return a.id === b.id;
    case 'symbolic':       return JSON.stringify(a) === JSON.stringify(b);
    case 'tagged':         return a.tag === b.tag && rplEqual(a.value, b.value);
    case 'vector':
      if (a.items.length !== b.items.length) return false;
      for (let i = 0; i < a.items.length; i++) {
        if (!rplEqual(a.items[i], b.items[i])) return false;
      }
      return true;
    case 'matrix':
      if (a.rows.length !== b.rows.length) return false;
      for (let i = 0; i < a.rows.length; i++) {
        if (a.rows[i].length !== b.rows[i].length) return false;
        for (let j = 0; j < a.rows[i].length; j++) {
          if (!rplEqual(a.rows[i][j], b.rows[i][j])) return false;
        }
      }
      return true;
    case 'list':
      if (a.items.length !== b.items.length) return false;
      for (let i = 0; i < a.items.length; i++) {
        if (!rplEqual(a.items[i], b.items[i])) return false;
      }
      return true;
    case 'unit':
      return a.value === b.value && JSON.stringify(a.uexpr) === JSON.stringify(b.uexpr);
    default:
      return JSON.stringify(a) === JSON.stringify(b);
  }
}

/* Generic "run op by name, return L1" helper. */
function run(opName, pre) {
  const s = new Stack();
  for (const v of pre) s.push(v);
  lookup(opName).fn(s);
  return s.peek();
}

/* Pairs of (canonical, ascii, pre-stack, label). */
const unaryPairs = [
  ['R→D', 'R->D', [Real(Math.PI)], 'R→D(π) ≈ 180'],
  ['D→R', 'D->R', [Real(180)],     'D→R(180) ≈ π'],
  ['→Q',  '->Q',  [Real(0.5)],     '→Q(0.5) → 1/2'],
  ['→Qπ', '->Qπ', [Real(Math.PI / 2)], '→Qπ(π/2) → π/2'],
  ['→HMS', '->HMS', [Real(2.5)],   '→HMS(2.5) → 2.3 (HH.MMSS)'],
  ['HMS→', 'HMS->', [Real(2.3)],   'HMS→(2.3) → 2.5'],
  ['→STR', '->STR', [Real(42)],    '→STR(42) → "42"'],
  ['V→',   'V->',   [Vector([Real(1), Real(2), Real(3)])], 'V→ decomposes 3-vec'],
  ['C→R',  'C->R',  [Complex(3, 4)], 'C→R((3,4)) → 3 on L2, 4 on L1'],
];

for (const [canon, ascii, pre, label] of unaryPairs) {
  // Some of these (V→, C→R) produce multi-level output; compare full
  // snapshots for those cases.
  const sCanon = new Stack();
  const sAscii = new Stack();
  for (const v of pre) { sCanon.push(v); sAscii.push(v); }
  lookup(canon).fn(sCanon);
  lookup(ascii).fn(sAscii);
  // Compare the full post-op stack.
  const snapA = sCanon.snapshot();
  const snapB = sAscii.snapshot();
  const ok = snapA.length === snapB.length
         && snapA.every((v, i) => rplEqual(v, snapB[i]));
  assert(ok, `session064: ${canon} and ${ascii} agree — ${label}`);
}

/* ---- R→B / ->B and B→R / ->R — BinaryInteger conversions ---- */
{
  resetBinaryState();
  setWordsize(64);
  setBinaryBase('h');

  const sU = new Stack();
  sU.push(Real(255));
  lookup('R→B').fn(sU);
  const uBI = sU.peek();

  const sA = new Stack();
  sA.push(Real(255));
  lookup('R->B').fn(sA);
  const aBI = sA.peek();

  assert(isBinaryInteger(uBI) && isBinaryInteger(aBI) && rplEqual(uBI, aBI),
    'session064: R→B and R->B both produce the same BinaryInteger (255 → #FFh)');

  // Round-trip back with B→R / B->R.
  const sU2 = new Stack();
  sU2.push(uBI);
  lookup('B→R').fn(sU2);
  const sA2 = new Stack();
  sA2.push(aBI);
  lookup('B->R').fn(sA2);
  assert(rplEqual(sU2.peek(), sA2.peek()) && sU2.peek().value.eq(255),
    'session064: B→R and B->R agree (#FFh → 255.0)');
}

/* ---- →LIST / ->LIST — compose a list ---- */
{
  const pre = [Integer(1n), Integer(2n), Integer(3n), Integer(3n)];
  const sU = new Stack(); for (const v of pre) sU.push(v);
  const sA = new Stack(); for (const v of pre) sA.push(v);
  lookup('→LIST').fn(sU);
  lookup('->LIST').fn(sA);
  assert(rplEqual(sU.peek(), sA.peek()) && sU.peek().type === 'list'
         && sU.peek().items.length === 3,
    'session064: →LIST and ->LIST both build the same 3-element list');
}

/* ---- →V2 / ->V2, →V3 / ->V3 — compose a Vector ---- */
{
  const sU = new Stack(); sU.push(Real(1)); sU.push(Real(2));
  const sA = new Stack(); sA.push(Real(1)); sA.push(Real(2));
  lookup('→V2').fn(sU);
  lookup('->V2').fn(sA);
  assert(rplEqual(sU.peek(), sA.peek()) && isVector(sU.peek())
         && sU.peek().items.length === 2,
    'session064: →V2 and ->V2 both compose [1 2]');

  const tU = new Stack(); tU.push(Real(1)); tU.push(Real(2)); tU.push(Real(3));
  const tA = new Stack(); tA.push(Real(1)); tA.push(Real(2)); tA.push(Real(3));
  lookup('→V3').fn(tU);
  lookup('->V3').fn(tA);
  assert(rplEqual(tU.peek(), tA.peek()) && isVector(tU.peek())
         && tU.peek().items.length === 3,
    'session064: →V3 and ->V3 both compose [1 2 3]');
}

/* ---- →TAG / ->TAG — attach a tag ---- */
{
  const sU = new Stack(); sU.push(Real(3.14)); sU.push(Str('pi'));
  const sA = new Stack(); sA.push(Real(3.14)); sA.push(Str('pi'));
  lookup('→TAG').fn(sU);
  lookup('->TAG').fn(sA);
  assert(rplEqual(sU.peek(), sA.peek()) && isTagged(sU.peek())
         && sU.peek().tag === 'pi',
    'session064: →TAG and ->TAG both attach tag "pi"');
}

/* ---- →UNIT / ->UNIT — attach a unit template ---- */
{
  // The unit template lives at L1; the value is at L2.  We construct
  // a Unit with value=1 just to supply the uexpr.
  const tmpl = Unit(1, { kind: 'atom', name: 'm' });
  const sU = new Stack(); sU.push(Real(5)); sU.push(tmpl);
  const sA = new Stack(); sA.push(Real(5)); sA.push(tmpl);
  lookup('→UNIT').fn(sU);
  lookup('->UNIT').fn(sA);
  assert(rplEqual(sU.peek(), sA.peek()) && isUnit(sU.peek())
         && sU.peek().value === 5,
    'session064: →UNIT and ->UNIT both produce 5_m');
}

/* ---- →Q correctness check (not just alias parity) ---- */
{
  const s = new Stack();
  s.push(Real(0.25));
  lookup('→Q').fn(s);
  assert(isSymbolic(s.peek()),
    'session064: →Q(0.25) returns a Symbolic (=1/4)');
}

/* ---- →HMS / HMS→ round-trip ---- */
{
  const s = new Stack();
  s.push(Real(2.5));
  lookup('→HMS').fn(s);
  lookup('HMS→').fn(s);
  // Allow a tiny FP slack.
  assert(isReal(s.peek()) && Math.abs(s.peek().value - 2.5) < 1e-12,
    'session064: →HMS / HMS→ round-trip preserves 2.5');
}

/* ---- Rejection guard: ASCII alias rejects same types as canonical ---- */
{
  // R→B / R->B on a String must both fail with Bad argument type.
  let bothThrew = 0;
  for (const op of ['R→B', 'R->B']) {
    const s = new Stack();
    s.push(Str('oops'));
    try { lookup(op).fn(s); } catch (e) {
      if (/Bad argument type/.test(e.message)) bothThrew++;
    }
  }
  assert(bothThrew === 2,
    'session064: R→B and R->B both reject String with Bad argument type');
}
