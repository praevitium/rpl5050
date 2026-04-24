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

/* Comparisons (==, ≠, <, >, ≤, ≥), logical ops (AND/OR/XOR/NOT), TRUE/FALSE. */

/* ================================================================
   Comparison + logical ops — HP50 booleans are Reals: 1. = true, 0.
   ================================================================ */

// == across numeric types
{
  const s = new Stack();
  s.push(Real(3)); s.push(Integer(3));
  lookup('==').fn(s);
  assert(s.peek().value === 1, '3.0 == 3 (int) is true');
  s.clear();
  s.push(Real(1)); s.push(Real(2));
  lookup('==').fn(s);
  assert(s.peek().value === 0, '1 == 2 is false');
}

// ≠ / <> / < / > / ≤ / ≥
{
  const s = new Stack();
  s.push(Real(1)); s.push(Real(2));
  lookup('<').fn(s);
  assert(s.peek().value === 1, '1 < 2');
  s.clear();
  s.push(Real(5)); s.push(Real(5));
  lookup('≤').fn(s);
  assert(s.peek().value === 1, '5 ≤ 5');
  s.clear();
  s.push(Real(5)); s.push(Real(6));
  lookup('>=').fn(s);
  assert(s.peek().value === 0, '5 >= 6 is false');
  s.clear();
  s.push(Real(3)); s.push(Real(4));
  lookup('<>').fn(s);
  assert(s.peek().value === 1, '3 <> 4 is true');
}

// == on Names and Strings (structural)
{
  const s = new Stack();
  s.push(Name('X')); s.push(Name('X'));
  lookup('==').fn(s);
  assert(s.peek().value === 1, "Name('X') == Name('X')");
  s.clear();
  s.push(Str('foo')); s.push(Str('bar'));
  lookup('==').fn(s);
  assert(s.peek().value === 0, "'foo' != 'bar'");
}

// Logical ops
{
  const s = new Stack();
  s.push(Real(1)); s.push(Real(0)); lookup('AND').fn(s);
  assert(s.peek().value === 0, '1 AND 0 = 0');
  s.clear();
  s.push(Real(1)); s.push(Real(0)); lookup('OR').fn(s);
  assert(s.peek().value === 1, '1 OR 0 = 1');
  s.clear();
  s.push(Real(1)); s.push(Real(1)); lookup('XOR').fn(s);
  assert(s.peek().value === 0, '1 XOR 1 = 0');
  s.clear();
  s.push(Real(0)); lookup('NOT').fn(s);
  assert(s.peek().value === 1, 'NOT 0 = 1');
  s.clear();
  s.push(Real(42)); lookup('NOT').fn(s);
  assert(s.peek().value === 0, 'NOT 42 = 0');
}

// TRUE / FALSE push the literals
{
  const s = new Stack();
  lookup('TRUE').fn(s);  assert(s.peek().value === 1, 'TRUE pushes 1');
  lookup('FALSE').fn(s); assert(s.peek().value === 0, 'FALSE pushes 0');
}

