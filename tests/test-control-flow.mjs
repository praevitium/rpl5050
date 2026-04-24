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
  setHalted, getHalted, clearHalted,
} from '../src/rpl/state.js';
import { clampStackScroll, computeMenuPage } from '../src/ui/paging.js';
import { assert } from './helpers.mjs';

/* Control flow — IFT / IFTE, IF/THEN/ELSE/END, WHILE, DO/UNTIL, START,
   FOR/NEXT/STEP (incl. Integer-aware variant), IFERR. */

/* ================================================================
   IFT / IFTE — stack-based conditionals
   ================================================================ */

// IFT: test true runs the action
{
  resetHome();
  const s = new Stack();
  s.push(Real(1));                     // test = true
  s.push(Program([Integer(99)]));      // action: pushes 99
  lookup('IFT').fn(s);
  assert(s.depth === 1 && s.peek().value === 99n,
         'IFT with true test runs the action');
}

// IFT: test false drops both without running
{
  resetHome();
  const s = new Stack();
  s.push(Real(0));
  s.push(Program([Integer(99)]));
  lookup('IFT').fn(s);
  assert(s.depth === 0, 'IFT with false test consumed both, ran nothing');
}

// IFT with a plain value as the action pushes it
{
  resetHome();
  const s = new Stack();
  s.push(Real(1));
  s.push(Integer(7));                  // non-program action
  lookup('IFT').fn(s);
  assert(s.depth === 1 && s.peek().value === 7n,
         'IFT with true + plain value pushes value');
}

// IFTE: test true runs t-action
{
  resetHome();
  const s = new Stack();
  s.push(Real(1));
  s.push(Program([Integer(10)]));
  s.push(Program([Integer(20)]));
  lookup('IFTE').fn(s);
  assert(s.depth === 1 && s.peek().value === 10n, 'IFTE true → t-action');
}

// IFTE: test false runs f-action
{
  resetHome();
  const s = new Stack();
  s.push(Real(0));
  s.push(Program([Integer(10)]));
  s.push(Program([Integer(20)]));
  lookup('IFTE').fn(s);
  assert(s.depth === 1 && s.peek().value === 20n, 'IFTE false → f-action');
}

// IFTE with plain values selects between them
{
  resetHome();
  const s = new Stack();
  s.push(Real(1));
  s.push(Real(3.14));
  s.push(Real(2.71));
  lookup('IFTE').fn(s);
  assert(Math.abs(s.peek().value - 3.14) < 1e-12, 'IFTE selects 3.14 when true');
}

/* ================================================================
   IF / THEN / ELSE / END inside Programs
   ================================================================ */

// IF/THEN/END with true
{
  resetHome();
  const s = new Stack();
  // << 1 IF 1 THEN 2 + END >>  ⇒ 3
  s.push(Program([
    Integer(1),
    Name('IF'), Integer(1), Name('THEN'), Integer(2), Name('+'), Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 3n,
         '<< 1 IF 1 THEN 2 + END >> leaves 3');
}

// IF/THEN/END with false skips the branch
{
  resetHome();
  const s = new Stack();
  // << 42 IF 0 THEN DROP END >>  ⇒ 42 left alone
  s.push(Program([
    Integer(42),
    Name('IF'), Integer(0), Name('THEN'), Name('DROP'), Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 42n,
         'IF 0 skips the THEN branch');
}

// IF/THEN/ELSE/END with true selects THEN
{
  resetHome();
  const s = new Stack();
  // << IF 1 THEN 'YES' ELSE 'NO' END >>
  s.push(Program([
    Name('IF'), Integer(1), Name('THEN'),
    Str('YES'),
    Name('ELSE'),
    Str('NO'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.peek().value === 'YES', 'IF 1 THEN...ELSE... picks THEN');
}

// IF/THEN/ELSE/END with false selects ELSE
{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Name('IF'), Integer(0), Name('THEN'),
    Str('YES'),
    Name('ELSE'),
    Str('NO'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.peek().value === 'NO', 'IF 0 THEN...ELSE... picks ELSE');
}

// Nested IF: test that inner END doesn't match outer IF
{
  resetHome();
  const s = new Stack();
  // << IF 1 THEN IF 1 THEN 100 END 200 + END >>
  // Inner IF pushes 100; outer adds 200 → 300
  s.push(Program([
    Name('IF'), Integer(1), Name('THEN'),
      Name('IF'), Integer(1), Name('THEN'), Integer(100), Name('END'),
      Integer(200), Name('+'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 300n,
         'nested IFs match their own ENDs');
}

// IF test uses a comparison op
{
  resetHome();
  const s = new Stack();
  // << 5 IF DUP 3 > THEN 'BIG' ELSE 'SMALL' END >>
  // DUP leaves 5 on top; 3 > compares; still 5 on stack; if true push 'BIG'
  s.push(Program([
    Integer(5),
    Name('IF'), Name('DUP'), Integer(3), Name('>'), Name('THEN'),
      Str('BIG'),
    Name('ELSE'),
      Str('SMALL'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  // Stack should be: level 2 = 5, level 1 = 'BIG'
  assert(s.depth === 2 && s.peek(2).value === 5n && s.peek().value === 'BIG',
         'IF test with comparison picks THEN for 5 > 3');
}

// Parse an IF directly from source
{
  resetHome();
  const s = new Stack();
  const vs = parseEntry('<< IF 1 THEN 7 ELSE 9 END >> EVAL');
  for (const v of vs) {
    if (v?.type === 'name' && !v.quoted) {
      const op = lookup(v.id);
      if (op) { op.fn(s); continue; }
    }
    s.push(v);
  }
  assert(s.peek().value === 7n, 'parsed IF/THEN/ELSE/END picks THEN for 1');
}

/* ================================================================
   WHILE / REPEAT / END and DO / UNTIL / END
   ================================================================ */

// WHILE: sum 1..5 using a counter
{
  resetHome();
  varStore('N', Real(1));
  varStore('SUM', Real(0));
  const s = new Stack();
  // << WHILE 'N' RCL 5 ≤ REPEAT
  //      'SUM' RCL 'N' RCL + 'SUM' STO
  //      'N' RCL 1 + 'N' STO
  //    END >>
  s.push(Program([
    Name('WHILE'),
      Name('N', { quoted: true }), Name('RCL'), Integer(5), Name('≤'),
    Name('REPEAT'),
      Name('SUM', { quoted: true }), Name('RCL'),
      Name('N', { quoted: true }),  Name('RCL'), Name('+'),
      Name('SUM', { quoted: true }), Name('STO'),
      Name('N', { quoted: true }),  Name('RCL'), Integer(1), Name('+'),
      Name('N', { quoted: true }),  Name('STO'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  const sum = varRecall('SUM');
  assert(sum && sum.value === 15, 'WHILE loop sums 1..5 to 15');
}

// WHILE with a false test from the start never enters the body
{
  resetHome();
  const s = new Stack();
  // << 0 WHILE 0 REPEAT 1 + END >>
  s.push(Program([
    Integer(0),
    Name('WHILE'), Integer(0), Name('REPEAT'),
      Integer(1), Name('+'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 0n,
         'WHILE 0 never runs the body');
}

// DO/UNTIL runs at least once
{
  resetHome();
  const s = new Stack();
  // << 0 DO 1 + UNTIL DUP 3 ≥ END >>  — runs 3 times, leaves 3
  s.push(Program([
    Integer(0),
    Name('DO'),
      Integer(1), Name('+'),
    Name('UNTIL'),
      Name('DUP'), Integer(3), Name('≥'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 3n,
         'DO/UNTIL increments until test true, leaves 3');
}

/* ================================================================
   START / NEXT / STEP counter loops
   ================================================================ */

// START/NEXT: body runs (end - start + 1) times
{
  resetHome();
  const s = new Stack();
  // 0 on stack; then 1 3 START 1 + NEXT  ⇒ body runs 3 times → 3
  s.push(Integer(0));
  s.push(Program([
    Integer(1), Integer(3), Name('START'),
      Integer(1), Name('+'),
    Name('NEXT'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.peek().value === 3n, 'START/NEXT 1..3 runs body 3 times');
}

// START/STEP with positive step
{
  resetHome();
  const s = new Stack();
  // 0 on stack; 1 10 START 1 + 3 STEP  — counter 1,4,7,10 → 4 iterations → 4
  s.push(Integer(0));
  s.push(Program([
    Integer(1), Integer(10), Name('START'),
      Integer(1), Name('+'),
      Integer(3),
    Name('STEP'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.peek().value === 4n, 'START/STEP 1..10 step 3 runs body 4 times');
}

// START/STEP with negative step
{
  resetHome();
  const s = new Stack();
  // 0 on stack; 10 1 START 1 + -3 STEP — counter 10,7,4,1 → 4 iterations → 4
  s.push(Integer(0));
  s.push(Program([
    Integer(10), Integer(1), Name('START'),
      Integer(1), Name('+'),
      Integer(-3),
    Name('STEP'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.peek().value === 4n, 'START/STEP 10..1 step -3 runs body 4 times');
}

/* ================================================================
   FOR / NEXT / STEP — counter bound to a loop variable
   ================================================================ */

// FOR/NEXT: sum I for I = 1..5 → 15
//   Session 016 change: both bounds Integer ⇒ loop counter stays Integer
//   (BigInt) for the whole loop, so the accumulator stays Integer too.
{
  resetHome();
  const s = new Stack();
  s.push(Integer(0));
  // 1 5 FOR I I + NEXT
  s.push(Program([
    Integer(1), Integer(5), Name('FOR'), Name('I'),
      Name('I'), Name('+'),
    Name('NEXT'),
  ]));
  lookup('EVAL').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 15n,
         'FOR/NEXT sum of 1..5 = 15 (Integer preserved)');
  // Loop variable should be purged after the loop (was unbound before).
  assert(varRecall('I') === undefined, 'FOR loop var I purged after exit');
}

// FOR/STEP with step = 2 sums 1 + 3 + 5 = 9
{
  resetHome();
  const s = new Stack();
  s.push(Integer(0));
  s.push(Program([
    Integer(1), Integer(5), Name('FOR'), Name('I'),
      Name('I'), Name('+'),
      Integer(2),
    Name('STEP'),
  ]));
  lookup('EVAL').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 9n,
         'FOR/STEP 1..5 step 2 sum is 9 (Integer preserved)');
}

// FOR with a prior binding is restored after the loop
{
  resetHome();
  varStore('I', Real(99));
  const s = new Stack();
  s.push(Integer(0));
  s.push(Program([
    Integer(1), Integer(3), Name('FOR'), Name('I'),
      Name('I'), Name('+'),
    Name('NEXT'),
  ]));
  lookup('EVAL').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 6n,
         'FOR loop computes 1+2+3 = 6 (Integer preserved)');
  assert(varRecall('I')?.value === 99,
         'prior binding of I restored after FOR loop');
}

// Nested FOR: multiplication table-ish — sum of i*j for i=1..3, j=1..3
{
  resetHome();
  const s = new Stack();
  s.push(Integer(0));
  s.push(Program([
    Integer(1), Integer(3), Name('FOR'), Name('I'),
      Integer(1), Integer(3), Name('FOR'), Name('J'),
        Name('I'), Name('J'), Name('*'), Name('+'),
      Name('NEXT'),
    Name('NEXT'),
  ]));
  lookup('EVAL').fn(s);
  // sum i*j for i,j in 1..3 = (1+2+3)*(1+2+3) = 36
  assert(isInteger(s.peek()) && s.peek().value === 36n,
         'nested FOR computes 36 (Integer preserved)');
}

// Parse + EVAL from source: IF reads test from the stack (empty test block)
{
  resetHome();
  const s = new Stack();
  // Note: "YES" (double quotes) parses as String; 'YES' (single quotes)
  // would be a quoted Name — different type.  HP50 programs typically
  // evaluate the test *inside* IF..THEN, but both forms are legal.
  const vs = parseEntry('<< 10 5 > IF THEN "YES" ELSE "NO" END >> EVAL');
  for (const v of vs) {
    if (v?.type === 'name' && !v.quoted) {
      const op = lookup(v.id);
      if (op) { op.fn(s); continue; }
    }
    s.push(v);
  }
  assert(s.peek().value === 'YES',
         'HP50-style IF with empty test block reads test from stack');
}

// Atomicity: error mid-loop restores the original stack
{
  resetHome();
  const s = new Stack();
  s.push(Real(100));
  // Program divides by zero on the 2nd iteration
  s.push(Program([
    Integer(1), Integer(2), Name('START'),
      Integer(1), Integer(0), Name('/'),
    Name('NEXT'),
  ]));
  let threw = false;
  try { lookup('EVAL').fn(s); } catch (e) { threw = true; }
  assert(threw, 'START loop with 1/0 in body throws');
  assert(s.depth === 2, 'stack restored to pre-EVAL depth after START error');
  assert(isReal(s.peek(2)) && s.peek(2).value === 100,
         'pre-existing Real(100) preserved after rollback');
}

/* ================================================================
   IFERR / THEN / [ELSE] / END — error-trap control flow
   + ERRM / ERRN / ERR0 companion ops

   HP50 IFERR semantics:
     - On error in trap → stack restored to pre-IFERR state, last-error
       slot populated, THEN branch runs.
     - On success + no ELSE → trap's stack result kept as-is.
     - On success + ELSE → ELSE branch runs on trap's stack result.
   ERRM / ERRN read the slot; ERR0 clears it.
   ================================================================ */

// IFERR: no-error path, no ELSE — stack result of trap is preserved
{
  resetHome();
  clearLastError();
  const s = new Stack();
  // << 10 IFERR 1 2 + THEN 99 END >>  → trap pushes 3, no error → stack = 10 3
  s.push(Program([
    Integer(10),
    Name('IFERR'), Integer(1), Integer(2), Name('+'),
    Name('THEN'), Integer(99),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 2 && s.peek(2).value === 10n && s.peek(1).value === 3n,
         'IFERR success path without ELSE keeps trap result (10, 3)');
}

// IFERR: error in trap → stack rolled back, THEN runs
{
  resetHome();
  clearLastError();
  const s = new Stack();
  // << 10 IFERR 1 0 / THEN 999 END >>
  //   10 left alone; 1 0 / errors; stack rolls back to pre-IFERR (10 on top);
  //   THEN runs, pushing 999.  Final: 10 999.
  s.push(Program([
    Integer(10),
    Name('IFERR'), Integer(1), Integer(0), Name('/'),
    Name('THEN'), Integer(999),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 2 && s.peek(2).value === 10n && s.peek(1).value === 999n,
         'IFERR error path rolls back trap residue + runs THEN');
}

// IFERR: error with ELSE — ELSE is NOT run when the trap errored
{
  resetHome();
  clearLastError();
  const s = new Stack();
  // << IFERR 1 0 / THEN 7 ELSE 8 END >>   → 7 (error path)
  s.push(Program([
    Name('IFERR'), Integer(1), Integer(0), Name('/'),
    Name('THEN'), Integer(7),
    Name('ELSE'), Integer(8),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 7n,
         'IFERR error path runs THEN, not ELSE');
}

// IFERR: success with ELSE — ELSE runs, THEN does not
{
  resetHome();
  clearLastError();
  const s = new Stack();
  // << IFERR 1 2 + THEN 99 ELSE 2 * END >>
  // trap leaves 3; no error; ELSE runs (2 *) → 6
  s.push(Program([
    Name('IFERR'), Integer(1), Integer(2), Name('+'),
    Name('THEN'), Integer(99),
    Name('ELSE'), Integer(2), Name('*'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 6n,
         'IFERR success path runs ELSE on trap result');
}

// ERRM inside THEN returns the caught error's message as a String
{
  resetHome();
  clearLastError();
  const s = new Stack();
  // << IFERR 1 0 / THEN ERRM END >>
  s.push(Program([
    Name('IFERR'), Integer(1), Integer(0), Name('/'),
    Name('THEN'), Name('ERRM'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().type === 'string' &&
         s.peek().value === 'Infinite result',
         'ERRM inside THEN returns "Infinite result"');
}

// ERRN inside THEN returns the error number as a BinaryInteger in hex
// (session 014: ERRN now returns BinaryInteger, not Integer).
{
  resetHome();
  clearLastError();
  const s = new Stack();
  s.push(Program([
    Name('IFERR'), Integer(1), Integer(0), Name('/'),
    Name('THEN'), Name('ERRN'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && isBinaryInteger(s.peek()) &&
         s.peek().value === 0x305n && s.peek().base === 'h',
         'ERRN returns the mapped HP50-ish code for "Infinite result" (#305h)');
}

// ERR0 clears the last-error slot
{
  resetHome();
  setLastError(new Error('something'));
  assert(getLastError() !== null, 'precondition: lastError populated');
  const s = new Stack();
  lookup('ERR0').fn(s);
  assert(getLastError() === null, 'ERR0 clears last-error slot');
  assert(s.depth === 0, 'ERR0 pushes nothing');
}

// ERRM when no error has been recorded returns empty string
{
  clearLastError();
  const s = new Stack();
  lookup('ERRM').fn(s);
  assert(s.depth === 1 && s.peek().type === 'string' && s.peek().value === '',
         'ERRM with no last error returns empty string');
}

// ERRN when no error has been recorded returns #0h
{
  clearLastError();
  const s = new Stack();
  lookup('ERRN').fn(s);
  assert(s.depth === 1 && isBinaryInteger(s.peek()) &&
         s.peek().value === 0n && s.peek().base === 'h',
         'ERRN with no last error returns #0h');
}

// Error-number mapping: "Bad argument type" → 0x202, "Too few arguments" → 0x201,
// "Undefined name: FOO" → 0x204.  Sanity-check that the classifier picks the
// right code from the message prefix.
{
  clearLastError();
  setLastError({ message: 'Bad argument type' });
  assert(getLastError().number === 0x202, 'map: Bad argument type → 0x202');
  setLastError({ message: 'Too few arguments' });
  assert(getLastError().number === 0x201, 'map: Too few arguments → 0x201');
  setLastError({ message: 'Undefined name: FOO' });
  assert(getLastError().number === 0x204,
         'map: Undefined name prefix → 0x204');
  setLastError({ message: 'some made-up error' });
  assert(getLastError().number === 0, 'unknown error message → 0');
  clearLastError();
}

// IFERR catches Undefined-name RCL error and ERRN reports 0x204
{
  resetHome();
  clearLastError();
  const s = new Stack();
  // << 'NOPE' IFERR RCL THEN DROP ERRN END >>
  //   'NOPE' is on stack; IFERR RCL throws; THEN drops the Name and pushes ERRN.
  s.push(Program([
    Name('NOPE', { quoted: true }),
    Name('IFERR'), Name('RCL'),
    Name('THEN'), Name('DROP'), Name('ERRN'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && isBinaryInteger(s.peek()) && s.peek().value === 0x204n,
         'IFERR around failed RCL: ERRN = #204h');
}

// Nested IFERR: inner catches its own, outer sees a clean no-error on exit
{
  resetHome();
  clearLastError();
  const s = new Stack();
  // Outer IFERR has a benign trap (pushes 1).  Inner IFERR sits after
  // the trap; it catches its own 1/0 error and pushes 'CAUGHT'.
  // Outer's ELSE runs because its trap didn't itself error.
  // << IFERR 1 IFERR 1 0 / THEN "inner" END THEN 99 ELSE "outer-ok" END >>
  s.push(Program([
    Name('IFERR'),
      Integer(1),
      Name('IFERR'), Integer(1), Integer(0), Name('/'),
      Name('THEN'), Str('inner'),
      Name('END'),
    Name('THEN'), Integer(99),
    Name('ELSE'), Str('outer-ok'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  // After nesting: trap left 1 then inner's "inner"; ELSE runs → pushes "outer-ok".
  // Expected: 1, "inner", "outer-ok"
  assert(s.depth === 3 &&
         s.peek(3).value === 1n &&
         s.peek(2).value === 'inner' &&
         s.peek(1).value === 'outer-ok',
         'nested IFERR: inner catches, outer runs ELSE');
}

// IFERR without THEN throws a recognizable structural error
{
  resetHome();
  const s = new Stack();
  // << IFERR 1 2 + END >>  — no THEN
  s.push(Program([
    Name('IFERR'), Integer(1), Integer(2), Name('+'), Name('END'),
  ]));
  let threw = false, msg = '';
  try { lookup('EVAL').fn(s); } catch (e) { threw = true; msg = e.message; }
  assert(threw && /IFERR without THEN/.test(msg),
         'IFERR without THEN is a structural error');
}

// Parse IFERR from source and execute end-to-end
{
  resetHome();
  clearLastError();
  const s = new Stack();
  const vs = parseEntry('<< IFERR 1 0 / THEN ERRM ELSE "ok" END >> EVAL');
  for (const v of vs) {
    if (v?.type === 'name' && !v.quoted) {
      const op = lookup(v.id);
      if (op) { op.fn(s); continue; }
    }
    s.push(v);
  }
  assert(s.depth === 1 && s.peek().type === 'string' &&
         s.peek().value === 'Infinite result',
         'parsed IFERR/THEN/ELSE/END picks ERRM on error');
}

// State nesting: an inner IFERR's caught message does NOT leak out to an
// outer IFERR's THEN clause if both catch errors.  Each ERRM reads the
// error caught by *its own* enclosing IFERR's trap.
{
  resetHome();
  clearLastError();
  const s = new Stack();
  // Outer trap: bind name NOPE, RCL it → "Undefined name: NOPE".  Inside
  // outer's THEN clause: an inner IFERR deliberately triggers 1/0, reads
  // ERRM into the stack, and the outer's THEN then reads its own ERRM.
  // Expected top-of-stack after evaluation:
  //   level 2: "Infinite result"   (inner's caught error)
  //   level 1: "Undefined name: NOPE"  (outer's caught error, preserved
  //            across the inner IFERR)
  s.push(Program([
    Name('IFERR'),
      Name('NOPE', { quoted: true }), Name('RCL'),
    Name('THEN'),
      Name('IFERR'), Integer(1), Integer(0), Name('/'),
      Name('THEN'), Name('ERRM'),
      Name('END'),
      Name('ERRM'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 2 &&
         s.peek(2).value === 'Infinite result' &&
         s.peek(1).value === 'Undefined name: NOPE',
         'nested IFERR: outer ERRM survives inner trap via last-error restore');
}


// Session 016 — Integer-aware FOR/NEXT/STEP counter
// ------------------------------------------------------------------

// FOR loop stores loop variable as Integer when both bounds are Integer.
{
  resetHome();
  const s = new Stack();
  // Push a Program that records the TYPE of I into the result stack.
  // 1 3 FOR I I NEXT   ⇒ stack becomes the three I values pushed in order.
  s.push(Program([
    Integer(1), Integer(3), Name('FOR'), Name('I'),
      Name('I'),
    Name('NEXT'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 3, 'FOR 1..3 pushed 3 I-values');
  // Each pushed I should be an Integer, not a Real.
  const [a, b, c] = [s.peek(3), s.peek(2), s.peek(1)];
  assert(isInteger(a) && a.value === 1n, 'FOR iter 1: I is Integer(1n)');
  assert(isInteger(b) && b.value === 2n, 'FOR iter 2: I is Integer(2n)');
  assert(isInteger(c) && c.value === 3n, 'FOR iter 3: I is Integer(3n)');
}

// FOR loop with Real bound demotes to Real (unchanged pre-session-016 path).
{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Real(1.0), Integer(3), Name('FOR'), Name('I'),
      Name('I'),
    Name('NEXT'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 3, 'FOR 1.0..3 pushed 3 I-values');
  assert(isReal(s.peek(3)) && s.peek(3).value === 1,
         'FOR iter 1 (mixed bounds): I is Real(1)');
  assert(isReal(s.peek(1)) && s.peek(1).value === 3,
         'FOR iter 3 (mixed bounds): I is Real(3)');
}

// FOR/STEP with Integer bounds AND Integer step stays Integer.
{
  resetHome();
  const s = new Stack();
  // 1 10 FOR I I 2 STEP  — I = 1,3,5,7,9 → 5 Integers
  s.push(Program([
    Integer(1), Integer(10), Name('FOR'), Name('I'),
      Name('I'),
      Integer(2),
    Name('STEP'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 5, 'FOR 1..10 step 2 pushed 5 I-values');
  assert(isInteger(s.peek()) && s.peek().value === 9n,
         'FOR/STEP Integer-mode last I = 9n');
  assert(isInteger(s.peek(5)) && s.peek(5).value === 1n,
         'FOR/STEP Integer-mode first I = 1n');
}

// FOR/STEP with Integer bounds but Real step demotes to Real mode.
{
  resetHome();
  const s = new Stack();
  // 1 5 FOR I I 0.5 STEP   — I = 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5
  // That's 9 iterations since the counter after I=5 is 5.5 > 5.
  s.push(Program([
    Integer(1), Integer(5), Name('FOR'), Name('I'),
      Name('I'),
      Real(0.5),
    Name('STEP'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 9, 'FOR 1..5 step 0.5 pushed 9 I-values');
  // Once the Real step arrives mid-loop, the counter flips to Real for the
  // remaining iterations.  The first stored I was still Integer(1).
  assert(isInteger(s.peek(9)) && s.peek(9).value === 1n,
         'FOR iter 1 (int mode before first STEP): I is Integer(1n)');
  assert(isReal(s.peek(8)) && s.peek(8).value === 1.5,
         'FOR iter 2 (after Real STEP, demoted): I is Real(1.5)');
  assert(isReal(s.peek()) && s.peek().value === 5,
         'FOR iter 9 (Real mode): I is Real(5)');
}

// Negative Integer step — 5 1 FOR I I -1 STEP pushes 5,4,3,2,1 as Integers.
{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Integer(5), Integer(1), Name('FOR'), Name('I'),
      Name('I'),
      Integer(-1),
    Name('STEP'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 5, 'FOR 5..1 step -1 pushed 5 I-values');
  assert(isInteger(s.peek(5)) && s.peek(5).value === 5n,
         'FOR neg-step iter 1: I = 5n');
  assert(isInteger(s.peek()) && s.peek().value === 1n,
         'FOR neg-step iter 5: I = 1n');
}

// STEP of 0 still errors cleanly in Integer mode (was 'STEP of 0' before).
{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Integer(1), Integer(5), Name('FOR'), Name('I'),
      Name('I'),
      Integer(0),
    Name('STEP'),
  ]));
  let threw = false;
  try { lookup('EVAL').fn(s); } catch (_) { threw = true; }
  assert(threw, 'FOR/STEP with Integer step of 0 throws');
}

// Arithmetic on Integer loop var stays Integer (session-016 headline):
//   1 3 FOR I I I * NEXT — 1*1 + 2*2 + 3*3 — but we want individual Integer
//   products.  Here: 1*1, 2*2, 3*3 pushed as three Integers.
{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Integer(1), Integer(3), Name('FOR'), Name('I'),
      Name('I'), Name('I'), Name('*'),
    Name('NEXT'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 3, 'FOR pushed three I*I values');
  assert(isInteger(s.peek(3)) && s.peek(3).value === 1n,
         'I*I at I=1 is Integer(1n)');
  assert(isInteger(s.peek(2)) && s.peek(2).value === 4n,
         'I*I at I=2 is Integer(4n)');
  assert(isInteger(s.peek()) && s.peek().value === 9n,
         'I*I at I=3 is Integer(9n)');
}

// ------------------------------------------------------------------
// End session 016 additions — STWS literal truncation + Integer FOR
// ------------------------------------------------------------------


// ==================================================================
// Session 053 — DOERR (user-raised RPL error)
// ==================================================================

/* ---- DOERR with String raises an error carrying that message ---- */
{
  clearLastError();
  const s = new Stack();
  s.push(Str('custom fail'));
  let caught;
  try { lookup('DOERR').fn(s); } catch (e) { caught = e.message; }
  assert(caught === 'custom fail', 'session053: DOERR "custom fail" throws');
}

/* ---- DOERR with empty String raises Interrupted ---- */
{
  clearLastError();
  const s = new Stack();
  s.push(Str(''));
  let caught;
  try { lookup('DOERR').fn(s); } catch (e) { caught = e.message; }
  assert(caught === 'Interrupted', 'session053: DOERR "" → Interrupted');
}

/* ---- DOERR with known hex code maps to canonical message ---- */
{
  clearLastError();
  const s = new Stack();
  s.push(BinaryInteger(0x201n, 'h'));
  let caught;
  try { lookup('DOERR').fn(s); } catch (e) { caught = e.message; }
  assert(caught === 'Too few arguments',
    'session053: DOERR #201h → "Too few arguments"');
}

/* ---- DOERR with Integer code maps message ---- */
{
  clearLastError();
  const s = new Stack();
  s.push(Integer(0x305n));
  let caught;
  try { lookup('DOERR').fn(s); } catch (e) { caught = e.message; }
  assert(caught === 'Infinite result',
    'session053: DOERR Integer(0x305) → "Infinite result"');
}

/* ---- DOERR 0 is a no-op ---- */
{
  clearLastError();
  const s = new Stack();
  s.push(Integer(0n));
  let threw = false;
  try { lookup('DOERR').fn(s); } catch (e) { threw = true; }
  assert(!threw, 'session053: DOERR 0 does not throw');
  assert(s.depth === 0, 'session053: DOERR 0 leaves empty stack');
}

/* ---- DOERR with unknown code falls back to hex formatting ---- */
{
  const s = new Stack();
  s.push(Integer(0xFFFn));
  let caught;
  try { lookup('DOERR').fn(s); } catch (e) { caught = e.message; }
  assert(/Error: #FFFh/.test(caught),
    'session053: DOERR unknown code → hex-format fallback');
}

/* ---- DOERR on bad argument type throws Bad argument type ---- */
{
  const s = new Stack();
  s.push(Name('X'));
  let caught;
  try { lookup('DOERR').fn(s); } catch (e) { caught = e.message; }
  assert(/Bad argument type/.test(caught),
    'session053: DOERR Name throws Bad argument type');
}

/* ---- DOERR inside IFERR — THEN clause runs with caught message ---- */
{
  resetHome();
  clearLastError();
  const s = new Stack();
  // << IFERR "oops" DOERR THEN ERRM END >>
  s.push(Program([
    Name('IFERR'), Str('oops'), Name('DOERR'),
    Name('THEN'), Name('ERRM'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().type === 'string' && s.peek().value === 'oops',
    'session053: IFERR traps DOERR; ERRM returns the custom message');
}

/* ================================================================
   Session 064 — CASE / THEN / END
   ================================================================

   Grammar:
     CASE
       test1 THEN action1 END
       test2 THEN action2 END
       ...
       [default]
     END

   Each THEN clause is its own body-END pair; the CASE itself is
   closed by the trailing outer END.  See runCase in src/rpl/ops.js. */

/* ---- first clause matches — action runs, later clauses skipped ---- */
{
  resetHome();
  const s = new Stack();
  // << CASE
  //      1 THEN 111 END
  //      1 THEN 222 END    ← would also match but should be skipped
  //      333               ← default, also skipped
  //    END >>
  s.push(Program([
    Name('CASE'),
    Integer(1n), Name('THEN'), Integer(111n), Name('END'),
    Integer(1n), Name('THEN'), Integer(222n), Name('END'),
    Integer(333n),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 111n,
    'session067: CASE first matching clause runs; later clauses skipped');
}

/* ---- later clause matches — earlier false clauses fall through ---- */
{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Name('CASE'),
    Integer(0n), Name('THEN'), Integer(111n), Name('END'),   // false
    Integer(1n), Name('THEN'), Integer(222n), Name('END'),   // true
    Integer(333n),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 222n,
    'session067: CASE second clause runs when first test is false');
}

/* ---- no clause matches — default runs ---- */
{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Name('CASE'),
    Integer(0n), Name('THEN'), Integer(111n), Name('END'),
    Integer(0n), Name('THEN'), Integer(222n), Name('END'),
    Integer(999n),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 999n,
    'session067: CASE default clause runs when no test matches');
}

/* ---- no match and no default — nothing added ---- */
{
  resetHome();
  const s = new Stack();
  s.push(Integer(42n));                // witness — must survive
  s.push(Program([
    Name('CASE'),
    Integer(0n), Name('THEN'), Integer(111n), Name('END'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 42n,
    'session067: CASE with no match and no default pushes nothing');
}

/* ---- empty CASE ( CASE END ) is a no-op ---- */
{
  resetHome();
  const s = new Stack();
  s.push(Integer(7n));
  s.push(Program([Name('CASE'), Name('END')]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 7n,
    'session067: empty CASE is a no-op');
}

/* ---- CASE matches use full EVAL — Program action runs, non-Program pushes ---- */
{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Name('CASE'),
    Integer(1n), Name('THEN'),
      Integer(10n), Integer(20n), Name('+'),     // compute 30 inside action
    Name('END'),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 30n,
    'session067: CASE action body supports multi-token expressions (10 20 +)');
}

/* ---- CASE inside IF — nested blocks ---- */
{
  resetHome();
  const s = new Stack();
  // << IF 1 THEN
  //      CASE
  //        0 THEN 111 END
  //        1 THEN 222 END
  //      END
  //    ELSE 999 END >>
  s.push(Program([
    Name('IF'), Integer(1n), Name('THEN'),
      Name('CASE'),
        Integer(0n), Name('THEN'), Integer(111n), Name('END'),
        Integer(1n), Name('THEN'), Integer(222n), Name('END'),
      Name('END'),
    Name('ELSE'), Integer(999n),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 222n,
    'session067: CASE nested inside IF — inner match wins');
}

/* ---- IF inside CASE action — nested blocks the other way around ---- */
{
  resetHome();
  const s = new Stack();
  // << CASE
  //      1 THEN IF 1 THEN 55 ELSE 66 END END
  //      7777
  //    END >>
  s.push(Program([
    Name('CASE'),
    Integer(1n), Name('THEN'),
      Name('IF'), Integer(1n), Name('THEN'), Integer(55n),
      Name('ELSE'), Integer(66n), Name('END'),
    Name('END'),
    Integer(7777n),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 55n,
    'session067: CASE clause containing IF/ELSE/END — ELSE stays inside clause');
}

/* ---- nested CASE — inner match does not short-circuit outer ---- */
{
  resetHome();
  const s = new Stack();
  // Outer first clause contains a nested CASE whose own first clause
  // matches.  After the inner match, the outer's first clause
  // completes, and the outer short-circuits past its own second clause.
  // Expected: 77 on the stack (inner match), not 8 (outer default).
  s.push(Program([
    Name('CASE'),
      Integer(1n), Name('THEN'),
        Name('CASE'),
          Integer(1n), Name('THEN'), Integer(77n), Name('END'),
          Integer(88n),
        Name('END'),
      Name('END'),
      Integer(1n), Name('THEN'), Integer(999n), Name('END'),
    Integer(8n),
    Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 77n,
    'session067: nested CASE: inner match returns to outer short-circuit');
}

/* ---- CASE without closing outer END — session 073 flipped this
        behaviour to auto-close (parity with IF/WHILE/program-body
        recovery).  Regression guard: the matching THEN clause still
        runs, trailing tokens after the last inner END act as the
        default clause (empty here), no throw. ---- */
{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Name('CASE'),
    Integer(1n), Name('THEN'), Integer(10n), Name('END'),
    // deliberately missing outer END — auto-closes at program end
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 10n,
    'session073: unterminated outer CASE auto-closes, matched clause still runs');
}

/* ================================================================
   ABORT — program-interrupt primitive (session 067)
   AUR p.1-27.  ABORT stops execution of the currently-running
   program.  Unlike RPLError, ABORT is *not* catchable by IFERR, and
   EVAL's snapshot-restore lets it pass through so the stack reflects
   the state at the abort point, not pre-EVAL.
   ================================================================ */

// Basic: ABORT inside a program unwinds EVAL and does NOT re-push the
// Program, so the stack is left with anything ABORT's program pushed
// before the abort.
{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Integer(42n),     // program runs: pushes 42
    Name('ABORT'),    // then aborts
    Integer(99n),     // unreachable
  ]));
  let caught = null;
  try { lookup('EVAL').fn(s); } catch (e) { caught = e; }
  assert(caught && caught.name === 'RPLAbort',
    'session067: ABORT inside EVAL propagates an RPLAbort signal');
  // Stack contents at point of abort are preserved: 42 was pushed
  // before ABORT ran; 99 was NOT.  The Program itself is consumed.
  assert(s.depth === 1 && s.peek().value === 42n,
    'session067: ABORT preserves stack state (42 stays, 99 never ran)');
}

// IFERR cannot trap ABORT — it bubbles straight past the handler.
{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Name('IFERR'),
      Name('ABORT'),
    Name('THEN'),
      Integer(111n),     // trap branch — must NOT run
    Name('END'),
    Integer(222n),       // after IFERR — must NOT run either
  ]));
  let caught = null;
  try { lookup('EVAL').fn(s); } catch (e) { caught = e; }
  assert(caught && caught.name === 'RPLAbort',
    'session067: IFERR does NOT catch ABORT (RPLAbort bubbles past)');
  assert(s.depth === 0,
    'session067: neither THEN branch nor post-IFERR ran after ABORT');
}

// ABORT unwinds multiple nested control frames (WHILE inside IF).
{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Name('IF'),
      Real(1),                          // truthy constant test for IF
    Name('THEN'),
      Name('WHILE'),
        Real(1),                        // infinite-loop test body
      Name('REPEAT'),
        Integer(7n),                    // body: push 7
        Name('ABORT'),                  // then abort from deep inside
        Integer(999n),                  // unreachable
      Name('END'),                      // WHILE END
    Name('END'),                        // IF END
    Integer(555n),                      // unreachable past the IF
  ]));
  let caught = null;
  try { lookup('EVAL').fn(s); } catch (e) { caught = e; }
  assert(caught && caught.name === 'RPLAbort',
    'session067: ABORT unwinds WHILE-inside-IF cleanly');
  // The 7 pushed just before ABORT is retained; nothing after ran.
  assert(s.depth === 1 && s.peek().value === 7n,
    'session067: ABORT preserves values pushed before the abort');
}

/* ================================================================
   Compiled local environments — `→ a b … body`  (session 068)
   ================================================================ */

// Single local + program body.  3 4 « → a b « a b + » » EVAL → 7
{
  resetHome();
  const s = new Stack();
  s.push(Integer(3n));
  s.push(Integer(4n));
  s.push(Program([
    Name('→'), Name('a'), Name('b'),
    Program([ Name('a'), Name('b'), Name('+') ]),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 7n,
    'session068: → single-clause, program body, a + b with a=3 b=4 → 7');
}

// Three locals; rightmost name takes stack level 1.
// 10 3 2 → a b c « a b c * - »  → 10 - (3 * 2) = 4
{
  resetHome();
  const s = new Stack();
  s.push(Integer(10n));
  s.push(Integer(3n));
  s.push(Integer(2n));
  s.push(Program([
    Name('→'), Name('a'), Name('b'), Name('c'),
    Program([ Name('a'), Name('b'), Name('c'), Name('*'), Name('-') ]),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 4n,
    'session068: → three locals — rightmost name binds stack level 1');
}

// Algebraic body: 5 2 → a b 'a+b'  → 7 (via Symbolic EVAL)
{
  resetHome();
  const prevApprox = calcState.approxMode;
  setApproxMode(true);
  try {
    const s = new Stack();
    s.push(Integer(5n));
    s.push(Integer(2n));
    // Build the program: → a b 'a+b'
    s.push(parseEntry("<< → a b 'a+b' >>")[0]);
    lookup('EVAL').fn(s);
    assert(s.depth === 1,
      'session068: → with algebraic body leaves a single value on the stack');
    const top = s.peek();
    // Symbolic EVAL with locals bound to integers folds to a Real 7.
    const val = top.type === 'real' ? top.value
              : top.type === 'integer' ? Number(top.value)
              : null;
    assert(val === 7,
      'session068: → algebraic body: a+b with a=5 b=2 folds to 7');
  } finally {
    setApproxMode(prevApprox);
  }
}

// Locals are invisible after the body ends — the outer lookup falls
// through to the global store (or pushes the Name if unbound).
{
  resetHome();
  const s = new Stack();
  s.push(Integer(42n));
  s.push(Program([
    Name('→'), Name('x'),
    Program([ Name('x') ]),    // body: push the local
    Name('x'),                 // after body — `x` is no longer bound
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 2,
    'session068: → locals invisible after body (x pushes a Name afterwards)');
  const top = s.peek();
  assert(top.type === 'name' && top.id === 'x',
    'session068: → trailing `x` became an unbound Name');
  // Level 2 is the value of `x` inside the body — the Integer 42.
  assert(s._items[0].value === 42n,
    'session068: → body saw the local binding before it went out of scope');
}

// Nested → frames: inner shadows outer.
// 1 2 → a b « 10 20 → a b « a b » »  → inner a=10, b=20, so top = 20, L2 = 10
{
  resetHome();
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(2n));
  s.push(Program([
    Name('→'), Name('a'), Name('b'),
    Program([
      Integer(10n), Integer(20n),
      Name('→'), Name('a'), Name('b'),
      Program([ Name('a'), Name('b') ]),
    ]),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 2,
    'session068: nested → left two values on the stack');
  assert(s.peek().value === 20n && s._items[0].value === 10n,
    'session068: nested → inner shadows outer (sees 10,20 not 1,2)');
}

// After inner frame pops, outer still binds.
// 1 2 → a b « 10 → a « a » b »  → inner a=10 pushed, outer b=2 pushed
{
  resetHome();
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Integer(2n));
  s.push(Program([
    Name('→'), Name('a'), Name('b'),
    Program([
      Integer(10n),
      Name('→'), Name('a'),
      Program([ Name('a') ]),         // inner body: pushes 10
      Name('b'),                      // after inner body: outer b = 2
    ]),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 2,
    'session068: outer → frame still live after inner pops');
  assert(s.peek().value === 2n && s._items[0].value === 10n,
    'session068: outer b=2 visible after inner → closed');
}

// Too-few-arguments error preserves the stack (EVAL's save/restore
// kicks in because the error is an RPLError).
{
  resetHome();
  const s = new Stack();
  s.push(Integer(100n));                 // only one value
  s.push(Program([
    Name('→'), Name('a'), Name('b'),     // wants two
    Program([ Name('a'), Name('b'), Name('+') ]),
  ]));
  let caught = null;
  try { lookup('EVAL').fn(s); } catch (e) { caught = e; }
  assert(caught && /Too few arguments/.test(caught.message),
    'session068: → with too-few args raises Too few arguments');
  // EVAL's snapshot-restore should have put the 100 and the Program back.
  assert(s.depth === 2 && s._items[0].value === 100n,
    'session068: → error path leaves outer stack intact (EVAL restore)');
}

// Error inside the body pops the frame even on the error path — after
// unwind, the local name is NOT visible.
{
  resetHome();
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Program([
    Name('→'), Name('boom'),
    Program([ Name('boom'), Integer(0n), Name('/') ]),   // divide-by-zero
  ]));
  let caught = null;
  try { lookup('EVAL').fn(s); } catch (_e) { caught = _e; }
  assert(caught && /Infinite|[Zz]ero|[Dd]ivide/.test(caught.message || ''),
    'session068: → body propagates divide-by-zero');
  // Now re-run a tiny probe to confirm frame was popped: just push `boom`
  // in a fresh Program with no → — should stay as an unbound Name.
  const s2 = new Stack();
  s2.push(Program([ Name('boom') ]));
  lookup('EVAL').fn(s2);
  const t = s2.peek();
  assert(s2.depth === 1 && t.type === 'name' && t.id === 'boom',
    'session068: → frame popped on error path — local name no longer bound');
}

// Syntax errors: → with no names, → with no body, → followed by a
// non-Program non-Symbolic body.
{
  resetHome();
  const s = new Stack();
  s.push(Program([
    Name('→'),     // no locals, no body
  ]));
  let caught = null;
  try { lookup('EVAL').fn(s); } catch (e) { caught = e; }
  assert(caught && /local variable names/.test(caught.message),
    'session068: → with no local names is a syntax error');
}

{
  resetHome();
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Program([
    Name('→'), Name('a'),   // name but no body token
  ]));
  let caught = null;
  try { lookup('EVAL').fn(s); } catch (e) { caught = e; }
  assert(caught && /missing body/.test(caught.message),
    'session068: → with local names but no body raises missing body');
}

{
  resetHome();
  const s = new Stack();
  s.push(Integer(1n));
  s.push(Program([
    Name('→'), Name('a'),
    Integer(99n),             // not a Program / Symbolic
  ]));
  let caught = null;
  try { lookup('EVAL').fn(s); } catch (e) { caught = e; }
  assert(caught && /body must be a program or algebraic/.test(caught.message),
    'session068: → with non-Program non-Symbolic body is rejected');
}

// Local shadows a global with the same name.
// 'X' 99 STO ; 5 → X « X » → 5 (local wins); then PURGE checks cleanup.
{
  resetHome();
  const s = new Stack();
  // Pre-store X=99 globally.
  varStore('X', Integer(99n));
  s.push(Integer(5n));
  s.push(Program([
    Name('→'), Name('X'),
    Program([ Name('X') ]),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 5n,
    'session068: local X shadows global X during body (got the 5)');
  // After body, global X is still 99.
  const g = varRecall('X');
  assert(g && g.value === 99n,
    'session068: global X unchanged by the → body');
  varPurge('X');
}

/* ================================================================
   Session 073 — Auto-close of unterminated CASE
   Parser already auto-closes unterminated `«`, `}`, `]` (parser.js
   lines 299-302).  The runCase helper now extends the same
   convenience to CASE blocks whose outer END — or whose per-clause
   inner ENDs — have been dropped off the end of the source.
   ================================================================ */

/* ---- CASE missing only the outer END (first clause matches) ---- */
{
  resetHome();
  const s = new Stack();
  // « CASE 1 THEN 10 END »    — the outer CASE END is absent
  s.push(Program([
    Name('CASE'),
    Integer(1n), Name('THEN'), Integer(10n), Name('END'),
    // NOTE: no trailing outer `END`
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 10n,
    'session073: CASE auto-closes missing outer END (matched clause)');
}

/* ---- CASE missing outer END (no clause matches, falls off) ---- */
{
  resetHome();
  const s = new Stack();
  // Three false tests, no default action, no trailing END — pushes nothing.
  s.push(Integer(42n));
  s.push(Program([
    Name('CASE'),
    Integer(0n), Name('THEN'), Integer(1n), Name('END'),
    Integer(0n), Name('THEN'), Integer(2n), Name('END'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 42n,
    'session073: CASE auto-closes with no match and no default (leaves stack alone)');
}

/* ---- CASE missing outer END but has a default clause at the tail ---- */
{
  resetHome();
  const s = new Stack();
  // Default clause after the last inner END should still run when
  // no test matches and the outer END is absent.
  s.push(Program([
    Name('CASE'),
    Integer(0n), Name('THEN'), Integer(111n), Name('END'),
    Integer(0n), Name('THEN'), Integer(222n), Name('END'),
    Integer(999n),               // default-action body
    // no trailing END
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 999n,
    'session073: CASE auto-close runs trailing default clause when no test matches');
}

/* ---- CASE with no clauses and no END: default-only auto-close ---- */
{
  resetHome();
  const s = new Stack();
  // « CASE 7 »   — all tokens after CASE are the default body
  s.push(Program([
    Name('CASE'),
    Integer(7n),
    // no THEN, no END
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 7n,
    'session073: CASE with no THEN and no END runs rest as default clause');
}

/* ---- CASE with a THEN but missing its inner END (truthy test) ---- */
{
  resetHome();
  const s = new Stack();
  // « CASE 1 THEN 5 6 + »     — no inner END, no outer END
  s.push(Program([
    Name('CASE'),
    Integer(1n), Name('THEN'),
    Integer(5n), Integer(6n), Name('+'),
    // truncated — the remainder is the matched clause's body
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 11n,
    'session073: CASE auto-closes missing inner END when test matches');
}

/* ---- CASE with THEN missing inner END (falsy test) ---- */
{
  resetHome();
  const s = new Stack();
  // Falsy test + truncated action: nothing runs, stack unchanged apart
  // from the CASE block disappearing from the pending work.
  s.push(Integer(88n));
  s.push(Program([
    Name('CASE'),
    Integer(0n), Name('THEN'),
    Integer(999n),                  // action that will NOT run
    // truncated — no inner END, no outer END
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 88n,
    'session073: CASE falsy test with missing inner END skips without running body');
}

/* ---- CASE auto-close at top of program body composes with a
       properly-closed nested CASE ---- */
{
  resetHome();
  const s = new Stack();
  // Outer CASE is missing its END; inner CASE is fully closed.  The
  // auto-close path must still recognise the fully-closed inner CASE
  // and not count its inner-ENDs against the outer's pending ENDs.
  //   « CASE 1 THEN
  //          CASE 0 THEN 111 END 1 THEN 222 END END
  //          »                              ← outer END dropped
  s.push(Program([
    Name('CASE'),
      Integer(1n), Name('THEN'),
        Name('CASE'),
          Integer(0n), Name('THEN'), Integer(111n), Name('END'),
          Integer(1n), Name('THEN'), Integer(222n), Name('END'),
        Name('END'),                 // inner CASE closed
      Name('END'),                   // outer first-clause closed
    // outer CASE END dropped
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 222n,
    'session073: CASE auto-close on outer block preserves nested CASE dispatch');
}

/* ================================================================
   Session 073 — Nested-program closure-over-locals pin
   HP50 `→` locals use dynamic scoping within the compiled-local
   region: a nested `« »` program invoked during the outer body
   sees the outer frame's bindings.  This test freezes that
   behavior so a future refactor to lexical scoping has to come
   with a deliberate flip.
   ================================================================ */

/* ---- Nested program reads an outer-frame local ---- */
{
  resetHome();
  const s = new Stack();
  //  5 → a  «  «  a a * »  EVAL  »       → 25
  s.push(Integer(5n));
  s.push(Program([
    Name('→'), Name('a'),
    Program([
      Program([ Name('a'), Name('a'), Name('*') ]),
      Name('EVAL'),
    ]),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 25n,
    'session073: nested program sees outer → local (dynamic-scope pin)');
}

/* ---- Inner `→` frame shadows outer without clobbering ---- */
{
  resetHome();
  const s = new Stack();
  //  3 → a
  //    « 10 → a « a »     ← inner body pushes 10 (inner a wins)
  //      a                ← outer a again visible after inner pops
  //      +                ← 10 + 3 = 13
  //    »
  s.push(Integer(3n));
  s.push(Program([
    Name('→'), Name('a'),
    Program([
      Integer(10n), Name('→'), Name('a'),
      Program([ Name('a') ]),              // inner body
      Name('a'),                           // outer a (3) pushed here
      Name('+'),
    ]),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 13n,
    'session073: inner → shadows outer local, outer visible again after pop');
}

/* ---- Outer local survives nested program throwing ---- */
{
  resetHome();
  const s = new Stack();
  //  7 → a
  //    « IFERR 1 0 / THEN a END »
  //  The probe 1 0 / throws; the THEN clause should find outer a=7
  //  still bound because runArrow's finally hasn't fired yet.
  s.push(Integer(7n));
  s.push(Program([
    Name('→'), Name('a'),
    Program([
      Name('IFERR'),
      Integer(1n), Integer(0n), Name('/'),
      Name('THEN'),
      Name('a'),
      Name('END'),
    ]),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 7n,
    'session073: outer → local still visible after nested RPLError unwinds IFERR');
}

/* ================================================================
   Session 073 — HALT / CONT / KILL substrate pilot
   HP50 AUR p.2-52, p.2-135, p.2-140.  HALT suspends the running
   program at the current instruction pointer; CONT resumes where
   HALT left off; KILL discards the suspension.  Pilot restriction:
   HALT must fire at the top level of a Program body (no active
   structured-control frame, no compiled-local frame).
   ================================================================ */

/* ---- HALT suspends, stack carries the pre-HALT result ---- */
{
  resetHome(); clearHalted();
  const s = new Stack();
  // « 1 2 + HALT 3 * »    — after HALT the stack has 3, not 9.
  s.push(Program([
    Integer(1n), Integer(2n), Name('+'),
    Name('HALT'),
    Integer(3n), Name('*'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && s.peek().value === 3n,
    'session073: HALT suspends program, pre-HALT stack result preserved (3)');
  assert(getHalted() !== null,
    'session073: HALT populates state.halted slot');
  clearHalted();
}

/* ---- CONT resumes from the token after HALT ---- */
{
  resetHome(); clearHalted();
  const s = new Stack();
  s.push(Program([
    Integer(1n), Integer(2n), Name('+'),
    Name('HALT'),
    Integer(3n), Name('*'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.peek().value === 3n, 'session073: HALT pre-state matches');
  lookup('CONT').fn(s);
  // After CONT: 3 * → 9
  assert(s.depth === 1 && s.peek().value === 9n,
    'session073: CONT resumes from post-HALT token (3 * → 9)');
  assert(getHalted() === null,
    'session073: CONT clears halted slot on successful resume');
}

/* ---- KILL clears the halted slot without resuming ---- */
{
  resetHome(); clearHalted();
  const s = new Stack();
  s.push(Program([
    Integer(42n),
    Name('HALT'),
    Integer(999n),                     // would run if CONT'd, killed instead
  ]));
  lookup('EVAL').fn(s);
  assert(s.peek().value === 42n, 'session073: HALT for KILL test');
  assert(getHalted() !== null, 'session073: halted before KILL');
  lookup('KILL').fn(s);
  assert(getHalted() === null,
    'session073: KILL clears halted slot');
  assert(s.depth === 1 && s.peek().value === 42n,
    'session073: KILL does not touch the stack');
}

/* ---- KILL with no halted program is a no-op ---- */
{
  resetHome(); clearHalted();
  const s = new Stack();
  s.push(Integer(7n));
  lookup('KILL').fn(s);             // should not throw
  assert(s.depth === 1 && s.peek().value === 7n,
    'session073: KILL with empty halted slot is a no-op (stack unchanged)');
}

/* ---- CONT with no halted program raises an RPLError ---- */
{
  resetHome(); clearHalted();
  const s = new Stack();
  let caught = null;
  try { lookup('CONT').fn(s); } catch (e) { caught = e; }
  assert(caught && /No halted program/.test(caught.message),
    'session073: CONT with empty halted slot raises No halted program');
}

/* ---- HALT inside structured control flow rejects (pilot limit) ---- */
{
  resetHome(); clearHalted();
  const s = new Stack();
  // « IF 1 THEN HALT END »   — HALT under IF's runIf evalRange call
  s.push(Program([
    Name('IF'), Integer(1n), Name('THEN'),
    Name('HALT'),
    Name('END'),
  ]));
  let caught = null;
  try { lookup('EVAL').fn(s); } catch (e) { caught = e; }
  assert(caught && /HALT.*inside control structure/.test(caught.message),
    'session073: HALT inside IF raises pilot-limit RPLError');
  assert(getHalted() === null,
    'session073: pilot-limit rejection does not populate halted slot');
}

/* ---- HALT inside a compiled-local `→` frame rejects ---- */
{
  resetHome(); clearHalted();
  const s = new Stack();
  // 5 → a « HALT »   — HALT fires under runArrow
  s.push(Integer(5n));
  s.push(Program([
    Name('→'), Name('a'),
    Program([ Name('HALT') ]),
  ]));
  let caught = null;
  try { lookup('EVAL').fn(s); } catch (e) { caught = e; }
  assert(caught && /HALT.*pilot/.test(caught.message),
    'session073: HALT inside → raises pilot-limit RPLError');
  assert(getHalted() === null,
    'session073: pilot limit blocks halted-slot write from inside →');
}

/* ---- Bare HALT on the stack (not inside EVAL) reports the bare-op
       error, so `HALT ENTER` outside a program doesn't wedge anything ---- */
{
  resetHome(); clearHalted();
  const s = new Stack();
  let caught = null;
  try { lookup('HALT').fn(s); } catch (e) { caught = e; }
  assert(caught && /not inside a running program/.test(caught.message),
    'session073: bare-op HALT (outside a program body) raises clear error');
}

/* ---- HALT + CONT round-trip preserves mid-stream compute ---- */
{
  resetHome(); clearHalted();
  const s = new Stack();
  // « 10 HALT DUP * »       — HALT with 10 on stack, CONT squares it → 100
  s.push(Program([
    Integer(10n),
    Name('HALT'),
    Name('DUP'), Name('*'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.peek().value === 10n, 'session073: HALT preserves 10 mid-stream');
  lookup('CONT').fn(s);
  assert(s.depth === 1 && s.peek().value === 100n,
    'session073: CONT runs DUP * on the preserved 10 → 100');
}

/* ---- Two sequential HALT/CONT pairs (sequential resumption) ---- */
{
  resetHome(); clearHalted();
  const s = new Stack();
  // « 1 HALT 2 + HALT 3 * »    first CONT yields 3 (=1+2); second → 9
  s.push(Program([
    Integer(1n), Name('HALT'),
    Integer(2n), Name('+'),
    Name('HALT'),
    Integer(3n), Name('*'),
  ]));
  lookup('EVAL').fn(s);
  assert(s.peek().value === 1n, 'session073: first HALT — 1 on top');
  lookup('CONT').fn(s);
  assert(s.peek().value === 3n,
    'session073: first CONT runs 2 + → 3, re-hits HALT');
  assert(getHalted() !== null,
    'session073: second HALT re-populated the slot');
  lookup('CONT').fn(s);
  assert(s.depth === 1 && s.peek().value === 9n,
    'session073: second CONT runs 3 * → 9, program finishes clean');
  assert(getHalted() === null,
    'session073: slot empty after the final CONT');
}
