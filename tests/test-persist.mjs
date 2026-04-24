/* Round-trip test for src/rpl/persist.js — snapshot() + rehydrate()
   without touching localStorage or the DOM. */

import { Stack } from '../src/rpl/stack.js';
import {
  Real, Integer, BinaryInteger, Complex, Name, Str, Program,
  RList, Vector, Matrix, Tagged, Symbolic,
  isReal, isInteger, isBinaryInteger, isComplex, isString, isName,
  isList, isVector, isMatrix, isProgram, isTagged, isSymbolic,
  isDirectory,
} from '../src/rpl/types.js';
import { Num, Var, Bin } from '../src/rpl/algebra.js';
import {
  state as calcState, setAngle,
  varStore, resetHome, currentPath,
  makeSubdir, goInto,
  seedPrng, getPrngSeed, resetPrng, nextPrngUnit,
} from '../src/rpl/state.js';
import { snapshot, rehydrate } from '../src/rpl/persist.js';

let failed = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failed++; }
  else console.log('ok  ', msg);
}

/* --- Seed a rich state: stack with varied types, angle=DEG, a
       subdir, and a variable in it. --- */
resetHome();
setAngle('DEG');

const s = new Stack();
s.push(Real(3.14));
s.push(Integer(42));
s.push(Complex(1, 2));
s.push(Str('hello'));
s.push(Name('X', { quoted: true }));
s.push(RList([Real(1), Real(2), Real(3)]));
s.push(Vector([Real(1), Real(2)]));
s.push(Tagged('LABEL', Real(7)));
s.push(Program([Real(1), Real(2), Name('+')]));

varStore('A', Real(100));
varStore('BIG', Integer(2n ** 80n));        // exercises BigInt
const sub = makeSubdir('SUB');
goInto('SUB');
varStore('INNER', Str('from inside'));

/* --- Take snapshot, wipe state, rehydrate, verify. --- */
const snap = snapshot(s);
const json = JSON.parse(JSON.stringify(snap));   // force JSON round-trip

// Wipe
resetHome();
setAngle('RAD');
const s2 = new Stack();

rehydrate(json, s2);

/* --- Assertions --- */
assert(calcState.angle === 'DEG', 'angle restored to DEG');
assert(currentPath().join('/') === 'HOME/SUB', 'path restored to HOME/SUB');

// Stack depth and top value
assert(s2.depth === 9, 'stack has 9 items after restore');

const lvl1 = s2.peek(1);
assert(isProgram(lvl1), 'level 1 is Program');
assert(lvl1.tokens.length === 3 && isReal(lvl1.tokens[0]) && lvl1.tokens[0].value === 1,
       'program token[0] is Real(1)');
assert(isName(lvl1.tokens[2]) && lvl1.tokens[2].id === '+',
       'program token[2] is Name(+)');

const tagged = s2.peek(2);
assert(isTagged(tagged) && tagged.tag === 'LABEL' && tagged.value.value === 7,
       'tagged 7 restored');

const vec = s2.peek(3);
assert(isVector(vec) && vec.items[1].value === 2, 'vector[1] restored');

const list = s2.peek(4);
assert(isList(list) && list.items.length === 3 && list.items[2].value === 3,
       'list[2] restored');

const qname = s2.peek(5);
assert(isName(qname) && qname.id === 'X' && qname.quoted === true, 'quoted Name X');

const str = s2.peek(6);
assert(isString(str) && str.value === 'hello', 'string restored');

const cx = s2.peek(7);
assert(isComplex(cx) && cx.re === 1 && cx.im === 2, 'complex restored');

const int = s2.peek(8);
assert(isInteger(int) && int.value === 42n, 'Integer 42 restored');

const real = s2.peek(9);
assert(isReal(real) && real.value === 3.14, 'Real 3.14 restored');

/* --- Variables --- */
// Current dir is SUB now.  Check INNER.
const inner = calcState.current.entries.get('INNER');
assert(inner && isString(inner) && inner.value === 'from inside',
       'INNER in current dir (SUB)');

// Walk back to HOME to inspect A and BIG.
calcState.current = calcState.home;
const a   = calcState.current.entries.get('A');
const big = calcState.current.entries.get('BIG');
assert(a && isReal(a) && a.value === 100, 'A restored');
assert(big && isInteger(big) && big.value === (2n ** 80n), 'BigInt-valued Integer restored');

const subDir = calcState.current.entries.get('SUB');
assert(subDir && isDirectory(subDir), 'SUB restored as Directory');
assert(subDir.parent === calcState.home, 'SUB.parent relinked to live HOME');

/* --- Unknown-version rejection --- */
let threw = false;
try { rehydrate({ version: 999 }, new Stack()); }
catch { threw = true; }
assert(threw, 'unknown version is rejected');

/* --- Extended type coverage: Matrix, BinaryInteger, Symbolic.
       Uses an independent snapshot so it doesn't shuffle the level
       indices the assertions above depend on. --- */
resetHome();
const s3 = new Stack();
s3.push(Matrix([[Real(1), Real(2)], [Real(3), Real(4)]]));
s3.push(BinaryInteger(0xFFn, 'h'));
// 'X^2 + 1' as an AST — exercises nested Bin + Var + Num round-trip.
s3.push(Symbolic(Bin('+', Bin('^', Var('X'), Num(2)), Num(1))));

const snap2 = snapshot(s3);
const json2 = JSON.parse(JSON.stringify(snap2));
resetHome();
const s4 = new Stack();
rehydrate(json2, s4);

assert(s4.depth === 3, 'extended stack has 3 items after restore');

const sym = s4.peek(1);
assert(isSymbolic(sym) && sym.expr?.kind === 'bin' && sym.expr.op === '+',
       'Symbolic: top-level Bin(+) restored');
assert(sym.expr.l?.kind === 'bin' && sym.expr.l.op === '^' &&
       sym.expr.l.l?.kind === 'var' && sym.expr.l.l.name === 'X' &&
       sym.expr.l.r?.kind === 'num' && sym.expr.l.r.value === 2,
       'Symbolic: X^2 sub-tree restored');
assert(sym.expr.r?.kind === 'num' && sym.expr.r.value === 1,
       'Symbolic: +1 leaf restored');

const bi = s4.peek(2);
assert(isBinaryInteger(bi) && bi.value === 0xFFn && bi.base === 'h',
       'BinaryInteger #FFh restored (value is BigInt, base preserved)');

const mat = s4.peek(3);
assert(isMatrix(mat) && mat.rows.length === 2 && mat.rows[0].length === 2,
       'Matrix 2×2 shape restored');
assert(isReal(mat.rows[0][1]) && mat.rows[0][1].value === 2 &&
       isReal(mat.rows[1][0]) && mat.rows[1][0].value === 3,
       'Matrix cell values restored');

/* --- Session 051: PRNG seed survives the snapshot round-trip.
       Seed the PRNG, advance it once, snapshot, reset, rehydrate; the
       seed field should restore to the same BigInt value, and the
       next draw should match the pre-snapshot draw produced from the
       same state.  Done as an independent block so it doesn't perturb
       the stack-order assertions above. --- */
{
  resetHome();
  const s5 = new Stack();
  seedPrng(424242);
  const seedAfterSet = getPrngSeed();
  // Pre-snapshot: advance once, record the draw, then rewind the PRNG.
  const expectedNext = nextPrngUnit();
  seedPrng(424242);   // rewind so the snapshot is frozen at seedAfterSet
  assert(getPrngSeed() === seedAfterSet, 'session051: PRNG rewind matches');

  const snap3 = snapshot(s5);
  const json3 = JSON.parse(JSON.stringify(snap3));

  // Wipe + rehydrate into a fresh seed that must be overwritten.
  resetPrng();                 // seed back to boot default
  assert(getPrngSeed() !== seedAfterSet, 'session051: pre-rehydrate seed differs');
  const s6 = new Stack();
  rehydrate(json3, s6);
  assert(getPrngSeed() === seedAfterSet,
    `session051: prngSeed restored to ${seedAfterSet} (got ${getPrngSeed()})`);
  const drawAfter = nextPrngUnit();
  assert(drawAfter === expectedNext,
    `session051: first PRNG draw after rehydrate matches pre-snapshot draw (${drawAfter} vs ${expectedNext})`);

  // Old snapshot without prngSeed rehydrates without touching the seed.
  seedPrng(777);
  const pinnedSeed = getPrngSeed();
  const legacySnap = { ...snap3 };
  delete legacySnap.prngSeed;
  rehydrate(legacySnap, new Stack());
  assert(getPrngSeed() === pinnedSeed,
    'session051: snapshot missing prngSeed leaves current seed untouched');

  resetPrng();
}

/* --- Session 076: VX (CAS main variable) survives snapshot / rehydrate. --- */
{
  const { setCasVx, resetCasVx, getCasVx } = await import('../src/rpl/state.js');
  resetCasVx();
  setCasVx('T');                                  // pin to T so 'X' default is clearly rejected
  const s4 = new Stack();
  s4.push(Integer(1n));
  const snap4 = snapshot(s4);
  const json4 = JSON.parse(JSON.stringify(snap4));
  resetCasVx();                                   // wipe back to 'X'
  const s5 = new Stack();
  rehydrate(json4, s5);
  assert(getCasVx() === 'T',
    `session076: casVx restored to 'T' after snapshot round-trip (got '${getCasVx()}')`);

  // Old snapshot without casVx rehydrates to default 'X'.
  const legacy = { ...snap4 };
  delete legacy.casVx;
  setCasVx('Q');                                  // pin to Q so the default reset is observable
  rehydrate(legacy, new Stack());
  assert(getCasVx() === 'X',
    `session076: snapshot missing casVx resets to default 'X' (got '${getCasVx()}')`);

  resetCasVx();
}

console.log(failed ? `\n${failed} FAIL(s)` : '\nALL PERSIST TESTS PASSED');
process.exit(failed ? 1 : 0);
