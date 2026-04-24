import { Stack } from '../www/src/rpl/stack.js';
import { lookup } from '../www/src/rpl/ops.js';
import {
  Real, Integer, BinaryInteger, Complex, Name, Str, Directory, Program, Tagged,
  RList, Vector, Matrix,
  isReal, isInteger, isBinaryInteger, isComplex, isDirectory, isProgram, isName,
  isString,
  Symbolic, isSymbolic,
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
import {
  parseAlgebra, simplify, deriv, expand, formatAlgebra,
  Num as AstNum, Var as AstVar, Bin as AstBin, Neg as AstNeg,
  astEqual,
  Fn as AstFn, isFn as astIsFn, isKnownFunction,
  evalAst, freeVars, defaultFnEval,
} from '../www/src/rpl/algebra.js';
import { giac } from '../www/src/rpl/cas/giac-engine.mjs';
import { assert } from './helpers.mjs';

/* Symbolic algebra — parser, simplify, DERIV, EXPAND, COLLECT, FACTOR,
   SUBST, SOLVE, textbook-mode pretty-print, EXACT/APPROX numeric-eval,
   keypad symbolic acceptance, string concat, complex cube-root closed form,
   FACT / UNDO / cube-root. */

// ==================================================================
// CAS: Symbolic AST + DERIV for polynomials
// ==================================================================



// --- parser: basic atoms and precedence -----------------------------
{
  const a = parseAlgebra('X');
  assert(a.kind === 'var' && a.name === 'X', 'parseAlgebra(X) = var X');
}
{
  const a = parseAlgebra('42');
  assert(a.kind === 'num' && a.value === 42, 'parseAlgebra(42) = num 42');
}
{
  const a = parseAlgebra('X + Y');
  assert(a.kind === 'bin' && a.op === '+' && a.l.name === 'X' && a.r.name === 'Y',
         'parseAlgebra(X + Y) = X + Y AST');
}
{
  // precedence:  2 + 3*4  →  2 + (3*4)
  const a = parseAlgebra('2 + 3*4');
  assert(a.op === '+' && a.l.value === 2 && a.r.op === '*' &&
         a.r.l.value === 3 && a.r.r.value === 4,
         '2 + 3*4 binds * tighter than +');
}
{
  // parens override precedence:  (2+3)*4  →  (2+3) then *4
  const a = parseAlgebra('(2+3)*4');
  assert(a.op === '*' && a.l.op === '+' && a.r.value === 4,
         '(2+3)*4 parens win');
}
{
  // ^ right-associates:  X^Y^Z  →  X^(Y^Z)
  const a = parseAlgebra('X^Y^Z');
  assert(a.op === '^' && a.l.name === 'X' && a.r.op === '^' &&
         a.r.l.name === 'Y' && a.r.r.name === 'Z',
         'X^Y^Z right-assoc');
}
{
  // unary minus
  const a = parseAlgebra('-X');
  assert(a.kind === 'neg' && a.arg.name === 'X', 'parseAlgebra(-X) = neg X');
}
{
  // round-trip: format(parse(s)) = s (modulo whitespace)
  const s = 'X^2 + 3*X + 1';
  const out = formatAlgebra(parseAlgebra(s));
  assert(out === 'X^2 + 3*X + 1', `round-trip: '${s}' → '${out}'`);
}

// --- simplifier -----------------------------------------------------
{
  const a = simplify(AstBin('+', AstNum(0), AstVar('X')));
  assert(astEqual(a, AstVar('X')), 'simplify 0+X = X');
}
{
  const a = simplify(AstBin('*', AstNum(1), AstVar('X')));
  assert(astEqual(a, AstVar('X')), 'simplify 1*X = X');
}
{
  const a = simplify(AstBin('*', AstNum(0), AstVar('X')));
  assert(astEqual(a, AstNum(0)), 'simplify 0*X = 0');
}
{
  const a = simplify(AstBin('^', AstVar('X'), AstNum(0)));
  assert(astEqual(a, AstNum(1)), 'simplify X^0 = 1');
}
{
  const a = simplify(AstBin('^', AstVar('X'), AstNum(1)));
  assert(astEqual(a, AstVar('X')), 'simplify X^1 = X');
}
{
  const a = simplify(AstBin('+', AstNum(2), AstNum(3)));
  assert(astEqual(a, AstNum(5)), 'simplify 2+3 = 5 (constant fold)');
}
{
  const a = simplify(AstBin('-', AstVar('X'), AstVar('X')));
  assert(astEqual(a, AstNum(0)), 'simplify X - X = 0');
}
{
  const a = simplify(AstNeg(AstNeg(AstVar('X'))));
  assert(astEqual(a, AstVar('X')), 'simplify --X = X');
}

// --- deriv: rules in isolation --------------------------------------
{
  const d = deriv(AstNum(5), 'X');
  assert(astEqual(d, AstNum(0)), 'DERIV 5 wrt X = 0');
}
{
  const d = deriv(AstVar('X'), 'X');
  assert(astEqual(d, AstNum(1)), 'DERIV X wrt X = 1');
}
{
  const d = deriv(AstVar('Y'), 'X');
  assert(astEqual(d, AstNum(0)), 'DERIV Y wrt X = 0 (free var constant)');
}
{
  const d = deriv(parseAlgebra('X + Y'), 'X');
  assert(astEqual(d, AstNum(1)), 'DERIV (X + Y) wrt X = 1');
}
{
  const d = deriv(parseAlgebra('X^2'), 'X');
  assert(astEqual(d, AstBin('*', AstNum(2), AstVar('X'))),
         'DERIV X^2 wrt X = 2*X');
}
{
  const d = deriv(parseAlgebra('X^3'), 'X');
  // Expect 3*X^2 (post-simplify).  Verify by formatting.
  assert(formatAlgebra(d) === '3*X^2', `DERIV X^3 wrt X → '${formatAlgebra(d)}'`);
}
{
  // polynomial: X^2 + 3*X + 1 → 2*X + 3
  const d = deriv(parseAlgebra('X^2 + 3*X + 1'), 'X');
  assert(formatAlgebra(d) === '2*X + 3',
         `DERIV X^2 + 3*X + 1 wrt X → '${formatAlgebra(d)}'`);
}
{
  // product rule: X*Y → wrt X = Y; wrt Y = X
  const d = deriv(parseAlgebra('X*Y'), 'X');
  assert(astEqual(d, AstVar('Y')), 'DERIV X*Y wrt X = Y');
}
{
  // quotient rule: DERIV 1/X wrt X  = -1/X^2
  const d = deriv(parseAlgebra('1/X'), 'X');
  // After simplify: -(1)/X^2 → simplify keeps a form equivalent to -1/X^2.
  // We just verify the string output is readable and correct.
  const s = formatAlgebra(d);
  assert(s === '-1/X^2' || s === '(-1)/X^2',
         `DERIV 1/X wrt X → '${s}' (expected -1/X^2)`);
}
{
  // const coefficient: DERIV 5*X wrt X = 5
  const d = deriv(parseAlgebra('5*X'), 'X');
  assert(astEqual(d, AstNum(5)), `DERIV 5*X wrt X = 5 (got ${formatAlgebra(d)})`);
}

// --- parser.js integration: 'expr' tokens become Symbolic -----------
{
  const [v] = parseEntry("`X^2 + 3*X + 1`");
  assert(isSymbolic(v), 'parseEntry on algebraic body returns Symbolic');
  assert(formatAlgebra(v.expr) === 'X^2 + 3*X + 1',
         'Symbolic.expr round-trips to original text');
}
{
  // Bare quoted name 'X' still returns a quoted Name, not a Symbolic —
  // important so STO/RCL/PURGE keep working unchanged.
  const [v] = parseEntry("`X`");
  assert(isName(v) && v.quoted && v.id === 'X',
         "parseEntry on bare `X` returns quoted Name (unchanged)");
}
{
  // Quoted operator '+' still works as a Name (used by tests around
  // STO of operator names etc.)
  const [v] = parseEntry("`+`");
  assert(isName(v) && v.quoted && v.id === '+',
         "parseEntry on `+` returns quoted Name (unchanged)");
}

// --- DERIV op end-to-end -------------------------------------------
// DERIV routes Symbolic inputs through Giac's diff() now.  Each test
// below registers a mock fixture keyed on the exact caseval command
// `buildGiacCmd` emits (purge prefix + diff call), then asserts that
// the op parses Giac's reply back into the expected AST.
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2 + 3*X + 1')));
  s.push(Name('X'));
  giac._clear();
  giac._setFixture('purge(X);diff(X^2+3*X+1,X)', '2*X+3');
  lookup('DERIV').fn(s);
  assert(s.depth === 1 && isSymbolic(s.peek()), 'DERIV op pushes a Symbolic');
  assert(formatAlgebra(s.peek().expr) === '2*X + 3',
         `DERIV op on X^2+3X+1 wrt X → '${formatAlgebra(s.peek().expr)}'`);
  giac._clear();
}
{
  // DERIV with a Real expr returns Real(0) — convenience coercion.
  const s = new Stack();
  s.push(Real(7.5));
  s.push(Name('X'));
  lookup('DERIV').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(0), 'DERIV 7.5 wrt X = 0 Real');
}
{
  // DERIV on a bare Name: 'X' 'X' DERIV → 1, 'Y' 'X' DERIV → 0.
  const s = new Stack();
  s.push(Name('X'));
  s.push(Name('X'));
  lookup('DERIV').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 1n, 'DERIV X wrt X = 1');

  s.clear();
  s.push(Name('Y'));
  s.push(Name('X'));
  lookup('DERIV').fn(s);
  assert(isInteger(s.peek()) && s.peek().value === 0n, 'DERIV Y wrt X = 0');
}
{
  // Bad arg types: DERIV of a List errors cleanly.
  const s = new Stack();
  s.push(RList([Real(1)]));
  s.push(Name('X'));
  let threw = false;
  try { lookup('DERIV').fn(s); } catch (_) { threw = true; }
  assert(threw, 'DERIV on List throws "Bad argument type"');
}

// --- Symbolic formatter dispatch -----------------------------------
{
  // format() of a Symbolic should render via formatAlgebra with tick
  // wrappers so the stack display uses HP50 style.
  const sym = Symbolic(parseAlgebra('2*X + 1'));
  const out = format(sym);
  assert(out === "`2*X + 1`", `format(Symbolic(2*X+1)) = '${out}'`);
}

// --- Associativity-aware printing ----------------------------------
{
  // Left-assoc: a - (b - c) MUST print with parens around the right
  // child (otherwise it would look identical to (a-b)-c).
  const e = AstBin('-', AstVar('A'), AstBin('-', AstVar('B'), AstVar('C')));
  const s = formatAlgebra(e);
  assert(s === 'A - (B - C)',
         `left-assoc minus wraps right child when same prec: '${s}'`);
}
{
  // Right-assoc ^: A^(B^C) prints without extra parens; (A^B)^C needs
  // parens on the left child.
  const e = AstBin('^', AstBin('^', AstVar('A'), AstVar('B')), AstVar('C'));
  const s = formatAlgebra(e);
  assert(s === '(A^B)^C',
         `right-assoc power wraps left child when same prec: '${s}'`);
}

// --- Keyboard-reachable round-trip: typing '2*X+3' then DERIV -------
// Simulates a user typing  '2*X+3' 'X' DERIV  at the command line.
{
  const s = new Stack();
  const entryLoop = (src) => {
    for (const v of parseEntry(src)) {
      if (v?.type === 'name' && !v.quoted) {
        const op = lookup(v.id);
        if (op) { op.fn(s); continue; }
      }
      s.push(v);
    }
  };
  giac._clear();
  giac._setFixture('purge(X);diff(2*X+3,X)', '2');
  entryLoop("`2*X+3` `X` DERIV");
  assert(s.depth === 1, 'entryLoop leaves a single result');
  const out = s.peek();
  assert(isSymbolic(out) || (isInteger(out) && out.value === 2n) ||
         (isReal(out) && out.value.eq(2)),
         "result is 2 (as Symbolic or Integer); got: " +
         (isSymbolic(out) ? formatAlgebra(out.expr) : JSON.stringify(out)));
  // After simplify, the derivative of 2*X + 3 wrt X is 2 (a Num).
  // formatStackTop then renders the Symbolic wrapper — accept either
  // form, but the visible-to-user rendering must say 2.
  const rendered = formatStackTop(out);
  assert(rendered === "`2`" || rendered === '2' || rendered === "2",
         `keyboard 'X^2+3*X+1' DERIV renders as '${rendered}'`);
  giac._clear();
}

// ==================================================================
// CAS extensions: fn node, chain rule, Symbolic EVAL
// ==================================================================



// --- fn node: parser ------------------------------------------------
{
  const a = parseAlgebra('SIN(X)');
  assert(a.kind === 'fn' && a.name === 'SIN' && a.args.length === 1 &&
         a.args[0].kind === 'var' && a.args[0].name === 'X',
         'parseAlgebra(SIN(X)) = fn SIN [X]');
}
{
  const a = parseAlgebra('LN(X + 1)');
  assert(a.kind === 'fn' && a.name === 'LN' &&
         a.args[0].kind === 'bin' && a.args[0].op === '+',
         'parseAlgebra(LN(X+1)) = fn LN [X+1 bin]');
}
{
  const a = parseAlgebra('EXP(SIN(X))');
  assert(a.kind === 'fn' && a.name === 'EXP' && a.args[0].kind === 'fn' &&
         a.args[0].name === 'SIN',
         'parseAlgebra(EXP(SIN(X))) = nested fn');
}
{
  // Case-folding of the function name: sin(X) is parsed as Fn('SIN').
  const a = parseAlgebra('sin(X)');
  assert(a.kind === 'fn' && a.name === 'SIN',
         'parseAlgebra(sin(X)) uppercases fn name');
}
{
  // Non-whitelisted identifier followed by '(' is an error — the outer
  // parser falls back to quoted Name.  Here we check the inner parser
  // throws so parser.js's try/catch fires.
  let threw = false;
  try { parseAlgebra('FOO(X)'); } catch (_) { threw = true; }
  assert(threw, 'parseAlgebra(FOO(X)) throws (FOO not whitelisted)');
}

// --- fn node: formatter --------------------------------------------
{
  const out = formatAlgebra(parseAlgebra('SIN(X)'));
  assert(out === 'SIN(X)', `format SIN(X) → '${out}'`);
}
{
  const out = formatAlgebra(parseAlgebra('LN(X + 1)'));
  assert(out === 'LN(X + 1)', `format LN(X + 1) → '${out}'`);
}
{
  const out = formatAlgebra(parseAlgebra('SIN(X) + COS(X)'));
  assert(out === 'SIN(X) + COS(X)',
         `format SIN(X)+COS(X) → '${out}'`);
}
{
  // Fn is a primary (no parens needed inside multiplication).
  const out = formatAlgebra(parseAlgebra('2*SIN(X)'));
  assert(out === '2*SIN(X)', `format 2*SIN(X) → '${out}'`);
}

// --- fn node: simplifier -------------------------------------------
{
  const a = simplify(parseAlgebra('SIN(0)'));
  assert(astEqual(a, AstNum(0)), 'simplify SIN(0) = 0');
}
{
  const a = simplify(parseAlgebra('COS(0)'));
  assert(astEqual(a, AstNum(1)), 'simplify COS(0) = 1');
}
{
  const a = simplify(parseAlgebra('LN(1)'));
  assert(astEqual(a, AstNum(0)), 'simplify LN(1) = 0');
}
{
  const a = simplify(parseAlgebra('EXP(0)'));
  assert(astEqual(a, AstNum(1)), 'simplify EXP(0) = 1');
}
{
  const a = simplify(parseAlgebra('SQRT(0)'));
  assert(astEqual(a, AstNum(0)), 'simplify SQRT(0) = 0');
}
{
  const a = simplify(parseAlgebra('SQRT(1)'));
  assert(astEqual(a, AstNum(1)), 'simplify SQRT(1) = 1');
}
{
  // EXP(0) folded to 1, then 1 * X collapses to X.
  const a = simplify(parseAlgebra('EXP(0) * X'));
  assert(astEqual(a, AstVar('X')), 'simplify EXP(0)*X = X');
}
{
  // LN(EXP(X)) → X
  const a = simplify(parseAlgebra('LN(EXP(X))'));
  assert(astEqual(a, AstVar('X')), 'simplify LN(EXP(X)) = X');
}
{
  // Constant fold on LN / EXP / SQRT (mode-independent).
  const a = simplify(parseAlgebra('LN(EXP(2))'));
  // After LN(EXP(X)) rule: still need to see both as nested.
  // Actually LN(EXP(Num(2))) → 2 via the rewrite.
  assert(astEqual(a, AstNum(2)), 'simplify LN(EXP(2)) = 2');
}
{
  // SIN(5) is left symbolic (depends on angle mode).
  const a = simplify(parseAlgebra('SIN(5)'));
  assert(a.kind === 'fn' && a.name === 'SIN' && a.args[0].value === 5,
         'simplify SIN(5) stays symbolic (mode-dependent)');
}

// --- fn node: DERIV chain rule -------------------------------------
{
  // DERIV SIN(X) wrt X = COS(X)
  const d = deriv(parseAlgebra('SIN(X)'), 'X');
  const out = formatAlgebra(d);
  assert(out === 'COS(X)', `deriv SIN(X) wrt X → '${out}'`);
}
{
  // DERIV COS(X) wrt X = -SIN(X)
  const d = deriv(parseAlgebra('COS(X)'), 'X');
  const out = formatAlgebra(d);
  assert(out === '-SIN(X)', `deriv COS(X) wrt X → '${out}'`);
}
{
  // DERIV LN(X) wrt X = 1/X
  const d = deriv(parseAlgebra('LN(X)'), 'X');
  const out = formatAlgebra(d);
  assert(out === '1/X', `deriv LN(X) wrt X → '${out}'`);
}
{
  // DERIV EXP(X) wrt X = EXP(X)
  const d = deriv(parseAlgebra('EXP(X)'), 'X');
  const out = formatAlgebra(d);
  assert(out === 'EXP(X)', `deriv EXP(X) wrt X → '${out}'`);
}
{
  // DERIV SQRT(X) wrt X = 1/(2*SQRT(X))
  const d = deriv(parseAlgebra('SQRT(X)'), 'X');
  const out = formatAlgebra(d);
  assert(out === '1/(2*SQRT(X))', `deriv SQRT(X) wrt X → '${out}'`);
}
{
  // Chain rule: DERIV SIN(X^2) wrt X = COS(X^2) * 2*X
  const d = deriv(parseAlgebra('SIN(X^2)'), 'X');
  const out = formatAlgebra(d);
  assert(out === 'COS(X^2)*2*X' || out === 'COS(X^2)*(2*X)' ||
         out === '2*X*COS(X^2)',
         `deriv SIN(X^2) wrt X → '${out}' (want COS(X^2)*2*X)`);
}
{
  // Chain rule: DERIV LN(X^2+1) wrt X = (2*X)/(X^2+1)
  const d = deriv(parseAlgebra('LN(X^2+1)'), 'X');
  const out = formatAlgebra(d);
  // After simplification: 2*X / (X^2 + 1)
  assert(out === '2*X/(X^2 + 1)',
         `deriv LN(X^2+1) wrt X → '${out}' (want 2*X/(X^2 + 1))`);
}
{
  // ATAN(X)' = 1/(1 + X^2).  The like-terms combiner canonicalises
  // additive chains with constants pushed to the tail, so the
  // denominator prints as `X^2 + 1` here (matches the `LN(X^2+1)'` case
  // above, which already emits constant-last).
  const d = deriv(parseAlgebra('ATAN(X)'), 'X');
  const out = formatAlgebra(d);
  assert(out === '1/(X^2 + 1)', `deriv ATAN(X) wrt X → '${out}'`);
}
{
  // DERIV SIN(Y) wrt X (Y is free, treated as constant) = 0
  const d = deriv(parseAlgebra('SIN(Y)'), 'X');
  assert(astEqual(d, AstNum(0)), 'deriv SIN(Y) wrt X = 0');
}

// --- parseEntry & DERIV op on a function-call Symbolic -------------
{
  // Full round-trip through the outer parser: 'SIN(X)' should land as
  // a Symbolic on the stack.
  const vals = parseEntry("`SIN(X)`");
  assert(vals.length === 1 && isSymbolic(vals[0]),
         'parseEntry SIN(X) returns Symbolic');
  const body = formatAlgebra(vals[0].expr);
  assert(body === 'SIN(X)',
         `'SIN(X)' Symbolic.expr round-trip → '${body}'`);
}
{
  // DERIV op end-to-end: `'SIN(X)' 'X' DERIV` → `'COS(X)'`
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)')));
  s.push(Name('X'));
  giac._clear();
  giac._setFixture('purge(X);diff(sin(X),X)', 'cos(X)');
  lookup('DERIV').fn(s);
  assert(s.depth === 1 && isSymbolic(s.peek()),
         'DERIV on SIN(X) keeps a Symbolic result');
  assert(formatAlgebra(s.peek().expr) === 'COS(X)',
         `DERIV op SIN(X) wrt X → '${formatAlgebra(s.peek().expr)}'`);
  giac._clear();
}

// --- freeVars + evalAst core ---------------------------------------
{
  const fv = freeVars(parseAlgebra('SIN(X) + Y*3'));
  assert(fv.has('X') && fv.has('Y') && fv.size === 2,
         'freeVars of SIN(X)+Y*3 is {X,Y}');
}
{
  // evalAst reduces a polynomial to a Num when all vars bind.
  const ast = parseAlgebra('X^2 + 3*X + 1');
  const r = evalAst(ast, name => name === 'X' ? 2 : null);
  assert(r.kind === 'num' && r.value === 11,
         `evalAst X^2+3X+1 at X=2 → ${r.kind === 'num' ? r.value : 'nope'}`);
}
{
  // evalAst leaves unbound vars symbolic.
  const ast = parseAlgebra('X + Y');
  const r = evalAst(ast, name => name === 'X' ? 5 : null);
  assert(r.kind === 'bin' && r.op === '+' &&
         r.l.kind === 'num' && r.l.value === 5 &&
         r.r.kind === 'var' && r.r.name === 'Y',
         `evalAst X+Y with only X=5 → partial reduction`);
}
{
  // defaultFnEval only evaluates mode-independent funcs.
  assert(defaultFnEval('LN', [Math.E]) !== null, 'defaultFnEval LN(e) works');
  assert(Math.abs(defaultFnEval('LN', [Math.E]) - 1) < 1e-12, 'LN(e) ≈ 1');
  assert(defaultFnEval('SIN', [0]) === null, 'defaultFnEval SIN returns null (mode-dep)');
  assert(defaultFnEval('SQRT', [9]) === 3, 'defaultFnEval SQRT(9) = 3');
  assert(defaultFnEval('SQRT', [-1]) === null, 'defaultFnEval SQRT(-1) = null');
}

// --- EVAL of Symbolic (ops.js) -------------------------------------
{
  // No bindings → EVAL pushes the same Symbolic back.
  resetHome();
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X + 1')));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && isSymbolic(s.peek()),
         'EVAL of fully-symbolic expr → Symbolic back');
  assert(formatAlgebra(s.peek().expr) === 'X + 1',
         `EVAL leaves X+1 unchanged: '${formatAlgebra(s.peek().expr)}'`);
}
{
  // Bind X=2, EVAL `X^2+1` → Real(5).
  resetHome();
  varStore('X', Real(2));
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2 + 1')));
  lookup('EVAL').fn(s);
  assert(s.depth === 1 && isReal(s.peek()) && s.peek().value.eq(5),
         `EVAL X^2+1 with X=2 → Real(5); got ${
           isReal(s.peek()) ? s.peek().value :
           isSymbolic(s.peek()) ? formatAlgebra(s.peek().expr) : 'other'}`);
}
{
  // Bind X=2 only, EVAL `X + Y` → Symbolic `'2 + Y'` (partial).
  resetHome();
  varStore('X', Real(2));
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X + Y')));
  lookup('EVAL').fn(s);
  assert(isSymbolic(s.peek()),
         'EVAL X+Y with only X bound → still Symbolic');
  const out = formatAlgebra(s.peek().expr);
  // The partially-reduced form replaces X with its numeric value.
  assert(out === '2 + Y',
         `EVAL X+Y with X=2 → '${out}' (want '2 + Y')`);
}
{
  // SIN evaluation honors angle mode.  Bind X to 0; EVAL 'SIN(X)' = 0.
  resetHome();
  varStore('X', Real(0));
  setAngle('RAD');
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)')));
  lookup('EVAL').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(0),
         `EVAL SIN(X) with X=0 (RAD) → 0; got ${
           isReal(s.peek()) ? s.peek().value : 'non-real'}`);
}
{
  // SIN(90) evaluates to 1 in DEG mode, sin(90) in RAD mode (≈0.894).
  resetHome();
  varStore('X', Real(90));
  setAngle('DEG');
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)')));
  lookup('EVAL').fn(s);
  assert(isReal(s.peek()) && Math.abs(s.peek().value - 1) < 1e-12,
         `EVAL SIN(90) in DEG → 1; got ${
           isReal(s.peek()) ? s.peek().value : 'non-real'}`);
  setAngle('RAD');                    // restore for subsequent tests
}
{
  // LN uses mode-independent eval.  Bind X=e; EVAL 'LN(X)' = 1.
  // Under EXACT (the default) the fold is gated by integer-in-integer-out,
  // so a Real(e) input wouldn't fold to Real(1.) even though the result
  // is "an integer" numerically.  Opt into APPROX explicitly — we're
  // testing the EVAL numeric fold, not the EXACT symbolic-preservation
  // behavior.
  setApproxMode(true);
  resetHome();
  varStore('X', Real(Math.E));
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('LN(X)')));
  lookup('EVAL').fn(s);
  assert(isReal(s.peek()) && Math.abs(s.peek().value - 1) < 1e-12,
         `EVAL LN(e) → 1; got ${isReal(s.peek()) ? s.peek().value : 'nope'}`);
  setApproxMode(false);
}
{
  // SQRT(9) with no var needed — evaluates purely by numeric fold.
  // Actually this tests: Symbolic 'SQRT(9)' simplifies at parse time
  // via simplifyFn → Num(3).  So by the time EVAL runs, the AST is
  // already Num(3) and EVAL emits Real(3).
  resetHome();
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SQRT(9)')));
  lookup('EVAL').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(3),
         `EVAL SQRT(9) → Real(3); got ${
           isReal(s.peek()) ? s.peek().value :
           isSymbolic(s.peek()) ? formatAlgebra(s.peek().expr) : 'other'}`);
}

// --- pretty.js — SVG pretty-printer MVP -----------------------------
// Textbook-mode rendering tests.  These tests don't run a browser; they
// assert structural properties of the returned SVG string (which glyphs,
// which elements, approximate box sizes).  Visual fidelity is verified
// through docs/pretty-demo.html.
{
  // Smoke test — import resolves, entry points exist.
  const { astToSvg, layoutAst } = await import('../www/src/rpl/pretty.js');
  assert(typeof astToSvg === 'function',  'pretty.astToSvg is a function');
  assert(typeof layoutAst === 'function', 'pretty.layoutAst is a function');
}
{
  // A single variable renders to one <text> element, no bar, no path.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg, width, height } = astToSvg(parseAlgebra('X'));
  assert(svg.startsWith('<svg '), 'astToSvg result starts with <svg>');
  assert((svg.match(/<text /g) || []).length === 1, 'one <text> for plain X');
  assert(!svg.includes('<line'), 'no <line> (no fraction)');
  assert(!svg.includes('<path'), 'no <path> (no parens)');
  assert(width > 10 && width < 60, `width for X is small (${width})`);
  assert(height > 20 && height < 50, `height for X is small (${height})`);
}
{
  // A fraction draws a <line> for the bar and two <text> elements.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg, height } = astToSvg(parseAlgebra('1/2'));
  assert(svg.includes('<line '), '1/2 draws a fraction bar <line>');
  assert((svg.match(/<text /g) || []).length === 2, '1/2 has two <text> (num + den)');
  assert(height > 50, `fraction is tall — got ${height}`);
}
{
  // Fraction children are never parenthesised — (X+1)/(X-1) yields
  // one <line> and zero <path> (no parens).
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg } = astToSvg(parseAlgebra('(X+1)/(X-1)'));
  assert((svg.match(/<line /g) || []).length === 1, '(X+1)/(X-1) has exactly one bar');
  assert(!svg.includes('<path '),
    `(X+1)/(X-1) renders with no parens (fraction bar separates) — got ${svg.slice(0,120)}`);
}
{
  // Superscript renders with a smaller font-size.  Base (X) at 24,
  // exponent (2) at 24*0.7 = 16.8.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg } = astToSvg(parseAlgebra('X^2'), { size: 24 });
  assert(svg.includes('font-size="24"'), 'X^2 has a 24px base glyph');
  // Expect the exponent at 16.8px.
  assert(/font-size="16\.?8?9*9*"/.test(svg) || svg.includes('16.7') || svg.includes('16.8'),
    `X^2 has a ~16.8px exponent — got ${svg}`);
}
{
  // (X+1)^2: the base is a sum so it must be wrapped in parens.  Our
  // parenBox uses <path> arcs.  Expect 2 <path> elements for the
  // matching parens.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg } = astToSvg(parseAlgebra('(X+1)^2'));
  const paths = (svg.match(/<path /g) || []).length;
  assert(paths === 2,
    `(X+1)^2 has 2 <path> (scaled parens) — got ${paths}`);
}
{
  // SIN(X^2): the function-call parens are drawn as <path>s; the
  // exponent (2) is a smaller <text>.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg } = astToSvg(parseAlgebra('SIN(X^2)'));
  assert(svg.includes('>SIN<'), 'SIN shows as a text glyph');
  assert((svg.match(/<path /g) || []).length === 2,
    'SIN(X^2) has 2 <path> for the call parens');
}
{
  // Font-family contains single quotes (for multi-word names), never
  // bare double quotes inside the attribute value (which would break
  // the outer attribute quoting).
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg } = astToSvg(parseAlgebra('X'));
  const m = svg.match(/font-family="([^"]*)"/);
  assert(m, 'font-family attribute present');
  assert(!m[1].includes('"'),
    `font-family value has no stray double quotes — got '${m[1]}'`);
}
{
  // astToSvg accepts a derived expression directly.  Smoke test with
  // DERIV of X^X to catch regressions in the combo of fn handling,
  // power rule, and pretty-print.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const ast = deriv(parseAlgebra('X^X'), 'X');   // X*X^(X-1) + X^X*LN(X)
  const { svg } = astToSvg(ast);
  assert(svg.startsWith('<svg '),
    'DERIV result renders without throwing');
  assert(svg.includes('>X<') && svg.includes('>LN<'),
    'rendered DERIV contains X and LN glyphs');
}

// --- pretty.js — √ radical glyph ---------------------
// SQRT(arg) no longer renders as the literal text `SQRT(...)`; it
// draws a hook+vinculum via a <path> for the hook and the vinculum
// segment as part of that path (single stroke).  The radicand is
// drawn inside, composing with fractions / exponents / etc.
{
  // SQRT(X) draws the hook-and-vinculum path; no "SQRT" text glyph
  // appears.  The radicand X is a single <text>.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg } = astToSvg(parseAlgebra('SQRT(X)'));
  assert(!svg.includes('>SQRT<'),
    'SQRT renders as a glyph, not the literal text SQRT');
  assert((svg.match(/<path /g) || []).length === 1,
    `SQRT(X) has exactly one <path> for the hook+vinculum`);
  assert((svg.match(/<text /g) || []).length === 1,
    'SQRT(X) radicand is one <text> (the X)');
}
{
  // A bare SQRT(X) is visibly taller than a plain X because of the
  // vinculum and hook dip.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { height: hX } = astToSvg(parseAlgebra('X'));
  const { height: hS } = astToSvg(parseAlgebra('SQRT(X)'));
  assert(hS > hX,
    `SQRT(X) taller than X (${hS} > ${hX})`);
}
{
  // SQRT composes with fractions — SQRT((X+1)/2) draws one vinculum
  // <line> for the fraction bar (NOT the radical — the radical is
  // part of a <path>), the radical hook <path>, and the
  // numerator/denominator text.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg } = astToSvg(parseAlgebra('SQRT((X+1)/2)'));
  assert((svg.match(/<line /g) || []).length === 1,
    'SQRT((X+1)/2) has one <line> (the fraction bar)');
  assert((svg.match(/<path /g) || []).length === 1,
    'SQRT((X+1)/2) has one <path> (the radical itself — fraction children need no parens)');
  assert(!svg.includes('>SQRT<'),
    'no literal SQRT glyph inside the radical composition');
}
{
  // SQRT composes with neighbours:  1 + SQRT(2)  → "1", " + ", "2" as
  // three <text>, plus one <path> for the radical.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg } = astToSvg(parseAlgebra('1 + SQRT(2)'));
  assert((svg.match(/<path /g) || []).length === 1,
    '1 + SQRT(2) has exactly one <path> (the radical)');
  // + separator uses a tighter opSepBox (gap+glyph+gap) instead of
  // `textBox(' + ')`, so the SVG contains `>+<` rather than `> + <`.
  assert(svg.includes('>1<') && svg.includes('>2<') && svg.includes('>+<'),
    '1 + SQRT(2) still shows the constants and the + separator');
  assert(!svg.includes('>SQRT<'), 'no literal SQRT text');
}

// --- pretty.js — ⁿ√k indexed radical for XROOT -------
// XROOT(radicand, index) renders as a √-hook with the index tucked
// into the crook at SUP_SCALE of base size.  The radical path stays a
// single <path>; the index is a separate <text>.  Parser now recognises
// XROOT as a two-arg KNOWN_FUNCTION so `'XROOT(2, 3)'` round-trips.
{
  // XROOT parses at the entry line.
  const a = parseAlgebra('XROOT(2, 3)');
  const fmt = (await import('../www/src/rpl/algebra.js')).formatAlgebra(a);
  assert(fmt === 'XROOT(2,3)',
    `parseAlgebra('XROOT(2, 3)') round-trips → '${fmt}'`);
}
{
  // simplify() does NOT fold XROOT(8, 3) to 2 — cube-root folding is the
  // job of SOLVE / _cubeRootReconstruct, not simplify; keeping XROOT
  // symbolic at simplify time lets algebra.js build closed-form cube-
  // root pairs without spontaneous numeric collapse.
  const { parseAlgebra: p, simplify: s, formatAlgebra: f } =
    await import('../www/src/rpl/algebra.js');
  const out = f(s(p('XROOT(8, 3)')));
  assert(out === 'XROOT(8,3)',
    `simplify(XROOT(8, 3)) stays symbolic → '${out}'`);
}
{
  // XROOT(2, 3) draws one <path> for the radical hook+vinculum AND one
  // <text> for the radicand (2) AND one <text> for the index (3).  No
  // literal 'XROOT' glyph.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg } = astToSvg(parseAlgebra('XROOT(2, 3)'));
  assert(!svg.includes('>XROOT<'),
    'XROOT renders as a glyph, not the literal text XROOT');
  assert((svg.match(/<path /g) || []).length === 1,
    'XROOT(2, 3) has exactly one <path> (the hook+vinculum)');
  assert((svg.match(/<text /g) || []).length === 2,
    'XROOT(2, 3) has two <text> elements — the radicand and the index');
  // Both numerals appear.
  assert(svg.includes('>2<'), 'radicand 2 is rendered');
  assert(svg.includes('>3<'), 'index 3 is rendered');
}
{
  // Indexed √ is wider than plain √ at the same radicand — the index
  // needs its own horizontal slot above/left of the hook peak.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { width: wSqrt } = astToSvg(parseAlgebra('SQRT(2)'));
  const { width: wX3 }   = astToSvg(parseAlgebra('XROOT(2, 3)'));
  assert(wX3 >= wSqrt,
    `XROOT(2, 3) at least as wide as SQRT(2) — got ${wX3} vs ${wSqrt}`);
}
{
  // Indexed √ is TALLER than plain √ on the same radicand — the index
  // protrudes above the vinculum, lifting the box ascent.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { height: hSqrt } = astToSvg(parseAlgebra('SQRT(2)'));
  const { height: hX3 }   = astToSvg(parseAlgebra('XROOT(2, 3)'));
  assert(hX3 > hSqrt,
    `XROOT(2, 3) taller than SQRT(2) — got ${hX3} vs ${hSqrt}`);
}
{
  // Wide index (e.g. "10") pushes the hook further right — total width
  // for XROOT(2, 10) exceeds XROOT(2, 3).
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { width: w3 }  = astToSvg(parseAlgebra('XROOT(2, 3)'));
  const { width: w10 } = astToSvg(parseAlgebra('XROOT(2, 10)'));
  assert(w10 > w3,
    `XROOT(2, 10) wider than XROOT(2, 3) — got ${w10} vs ${w3}`);
}
{
  // Complex radicand composes — XROOT((X+1)/2, 3) renders a fraction
  // under the vinculum (so there are two stroked primitives: the
  // fraction's <line> bar and the radical's <path>) plus the index.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg } = astToSvg(parseAlgebra('XROOT((X+1)/2, 3)'));
  assert((svg.match(/<line /g) || []).length === 1,
    'XROOT((X+1)/2, 3) has one <line> (the fraction bar)');
  assert((svg.match(/<path /g) || []).length === 1,
    'XROOT((X+1)/2, 3) has one <path> (the radical)');
  assert(!svg.includes('>XROOT<'), 'no literal XROOT glyph');
}
{
  // XROOT composes with neighbours: 1 + XROOT(2, 3)  — three <text>
  // for "1", "2", "3", plus " + " separator, and one <path>.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg } = astToSvg(parseAlgebra('1 + XROOT(2, 3)'));
  assert((svg.match(/<path /g) || []).length === 1,
    '1 + XROOT(2, 3) has one <path>');
  assert(svg.includes('>1<') && svg.includes('>2<') && svg.includes('>3<'),
    '1 + XROOT(2, 3) shows all three numerals');
  // `+` uses opSepBox so the SVG carries a bare `>+<` glyph
  // (no full-char-width padding).
  assert(svg.includes('>+<'),
    '1 + XROOT(2, 3) still shows the + separator');
}

// --- fn node: general power rule in DERIV --------------------------
// (u^v)' emits the general form  v * u^(v-1) * u' + u^v * LN(u) * v'.
// Cases covered:
//   - X^X  (both u and v depend on x)
//   - 2^X  (constant base shortcut; (a^v)' = a^v * LN(a) * v')
//   - X^Y  (u depends on x, v constant)  — same as polynomial shortcut
//   - (X+1)^X — non-atomic u
//   - X^(2*X) — non-atomic v
{
  // d/dx (X^X) = X * X^(X-1) * 1 + X^X * LN(X) * 1
  //            = X*X^(X-1) + LN(X)*X^X
  // (The second term's factors are alphabetically ordered by the
  // like-terms combiner's commutative canonicalizer — 'LN(X)' sorts
  // before 'X^X' so it prints first.)
  const d = deriv(parseAlgebra('X^X'), 'X');
  const out = formatAlgebra(d);
  assert(out === 'X*X^(X - 1) + LN(X)*X^X',
         `DERIV X^X wrt X → '${out}' (want X*X^(X - 1) + LN(X)*X^X)`);
}
{
  // d/dx (2^X) = 2^X * LN(2).  LN(2) folds to a numeric constant via
  // simplifyFn (LN has a mode-independent numeric evaluator); the
  // formatted output is a numeric literal, not the string 'LN(2)'.
  const d = deriv(parseAlgebra('2^X'), 'X');
  const out = formatAlgebra(d);
  const ln2 = Math.log(2);
  assert(out === `2^X*${ln2}`,
         `DERIV 2^X wrt X → '${out}' (want 2^X*${ln2})`);
}
{
  // d/dx (X^Y) with Y treated as constant (not the variable of
  // differentiation) — polynomial shortcut kicks in when Y parses as
  // Num, but here Y is a free Var so we fall into the general rule,
  // and v'=0 kills the second term, giving Y * X^(Y-1) * 1.
  const d = deriv(parseAlgebra('X^Y'), 'X');
  const out = formatAlgebra(d);
  assert(out === 'Y*X^(Y - 1)',
         `DERIV X^Y wrt X → '${out}' (want Y*X^(Y - 1))`);
}
{
  // d/dY (X^Y) = X^Y * LN(X) * 1 = X^Y * LN(X)  — constant-base branch.
  const d = deriv(parseAlgebra('X^Y'), 'Y');
  const out = formatAlgebra(d);
  assert(out === 'X^Y*LN(X)',
         `DERIV X^Y wrt Y → '${out}' (want X^Y*LN(X))`);
}
{
  // d/dx (X+1)^X = X * (X+1)^(X-1) * 1 + (X+1)^X * LN(X+1) * 1
  //              = (X+1)^(X-1)*X + (X+1)^X*LN(X+1)
  // (First term's factors reorder — '(X + 1)^(X - 1)' sorts before 'X'
  // under the commutative canonicalizer because '(' < 'X' in string
  // compare.  Second term stays as-is because '(' < 'L' too so
  // '(X + 1)^X' beats 'LN(X + 1)'.)
  const d = deriv(parseAlgebra('(X+1)^X'), 'X');
  const out = formatAlgebra(d);
  assert(out === '(X + 1)^(X - 1)*X + (X + 1)^X*LN(X + 1)',
         `DERIV (X+1)^X wrt X → '${out}'`);
}
{
  // d/dx X^(2*X) = 2*X * X^(2*X - 1) * 1 + X^(2*X) * LN(X) * 2
  //              = 2*X*X^(2*X - 1) + 2*LN(X)*X^(2*X)
  // (The nested `*` chain flattens and sorts alphabetically:
  // [2, LN(X), X^(2*X)].  The chain is a single left-assoc product so
  // no extra parens appear.)
  const d = deriv(parseAlgebra('X^(2*X)'), 'X');
  const out = formatAlgebra(d);
  assert(out === '2*X*X^(2*X - 1) + 2*LN(X)*X^(2*X)',
         `DERIV X^(2*X) wrt X → '${out}'`);
}
{
  // Regression: polynomial shortcut still shapes cleanly.
  assert(formatAlgebra(deriv(parseAlgebra('X^2'), 'X')) === '2*X',
         'regression: DERIV X^2 still → 2*X');
  assert(formatAlgebra(deriv(parseAlgebra('X^3'), 'X')) === '3*X^2',
         'regression: DERIV X^3 still → 3*X^2');
  assert(formatAlgebra(deriv(parseAlgebra('X^2 + 3*X + 1'), 'X')) === '2*X + 3',
         'regression: DERIV of full polynomial unchanged');
}

// --- CLB: clear the display-base override --------------------------
{
  // After HEX, BinInts render in hex regardless of their stored base.
  // CLB clears the override, so they render in their own stored base
  // again with minimum-width (no padding).
  resetBinaryState();
  const s = new Stack();
  s.push(BinaryInteger(0xFFn, 'd'));     // stored base is decimal
  assert(format(s.peek()) === '#255d',
         `pre-override: stored base wins — '${format(s.peek())}'`);
  lookup('HEX').fn(s);
  assert(format(s.peek()) !== '#255d',
         `after HEX: override wins — '${format(s.peek())}'`);
  lookup('CLB').fn(s);
  assert(format(s.peek()) === '#255d',
         `after CLB: stored base again — '${format(s.peek())}'`);
  assert(getBinaryBase() === null,
         'CLB leaves state.binaryBase = null');
}
{
  // CLB is a no-op when no override is active.
  resetBinaryState();
  assert(getBinaryBase() === null, 'fresh state has no override');
  lookup('CLB').fn(new Stack());
  assert(getBinaryBase() === null, 'CLB on fresh state is a no-op');
}

// --- like-terms combiner in simplify() ---------------
//
// `simplify` now walks top-level + / - chains and sums the coefficients
// of matching-body terms.  The rules are:
//   X + X        → 2*X
//   2*X + 3*X    → 5*X
//   2*X - 3*X    → -X
//   X + 2*X + Y  → 3*X + Y
//   5 + X + 3    → X + 8     (constants gathered at the tail)
//   X - X        → 0         (already handled by x-x rule, still works)
// The combiner is idempotent — re-running it on its output returns the
// same tree — and does not touch * / / / ^ nodes.
{
  const out = formatAlgebra(simplify(parseAlgebra('X + X')));
  assert(out === '2*X', `simplify(X + X) → '${out}' (want '2*X')`);
}
{
  const out = formatAlgebra(simplify(parseAlgebra('2*X + 3*X')));
  assert(out === '5*X', `simplify(2*X + 3*X) → '${out}' (want '5*X')`);
}
{
  const out = formatAlgebra(simplify(parseAlgebra('2*X - 3*X')));
  assert(out === '-X', `simplify(2*X - 3*X) → '${out}' (want '-X')`);
}
{
  const out = formatAlgebra(simplify(parseAlgebra('X + 2*X + Y')));
  assert(out === '3*X + Y', `simplify(X + 2*X + Y) → '${out}' (want '3*X + Y')`);
}
{
  // Constants bubble to the tail; like-term X coef stays 1.
  const out = formatAlgebra(simplify(parseAlgebra('5 + X + 3')));
  assert(out === 'X + 8', `simplify(5 + X + 3) → '${out}' (want 'X + 8')`);
}
{
  // Constant-only sum still folds (existing numeric-fold rule still wins).
  const out = formatAlgebra(simplify(parseAlgebra('2 + 3 + 4')));
  assert(out === '9', `simplify(2+3+4) → '${out}' (want '9')`);
}
{
  // Mixed bodies: X and X^2 are different keys — no cross-merge.
  const out = formatAlgebra(simplify(parseAlgebra('X^2 + X + X^2')));
  assert(out === '2*X^2 + X', `simplify(X^2 + X + X^2) → '${out}' (want '2*X^2 + X')`);
}
{
  // Cross-zero coefficient: 3*X - 3*X cancels, constant 7 remains.
  const out = formatAlgebra(simplify(parseAlgebra('3*X + 7 - 3*X')));
  assert(out === '7', `simplify(3*X + 7 - 3*X) → '${out}' (want '7')`);
}
{
  // Idempotence: re-running simplify on the combined output is a no-op.
  const once = simplify(parseAlgebra('2*X + 3*X + 4'));
  const twice = simplify(once);
  assert(formatAlgebra(once) === formatAlgebra(twice),
         `like-terms combiner is idempotent — '${formatAlgebra(once)}' unchanged on rerun`);
}
{
  // Commutative canonicalization of `*` chains.  The like-terms
  // combiner flattens each term's product into a sorted factor list
  // before hashing the bucket key, so `X*Y` and `Y*X` collide under
  // the same body and their coefficients sum.
  const out = formatAlgebra(simplify(parseAlgebra('X*Y + Y*X')));
  assert(out === '2*X*Y',
         `commutative canonicalization — 'X*Y + Y*X' → '${out}' (want '2*X*Y')`);
}
{
  // Mixed factors: 2*X*Y + 3*Y*X → 5*X*Y.  Coefficients strip off the
  // leading Num, then the bodies canonicalize to the same X*Y key.
  const out = formatAlgebra(simplify(parseAlgebra('2*X*Y + 3*Y*X')));
  assert(out === '5*X*Y',
         `canonicalization with coefs — '2*X*Y + 3*Y*X' → '${out}' (want '5*X*Y')`);
}
{
  // Three-factor canonicalization: A*B*C and C*B*A share the same
  // canonical key A*B*C (sorted alphabetically).
  const out = formatAlgebra(simplify(parseAlgebra('A*B*C + C*B*A')));
  assert(out === '2*A*B*C',
         `three-factor canonicalization — '${out}' (want '2*A*B*C')`);
}
{
  // Canonicalization must NOT affect single-variable bodies — no
  // regression on the X+X → 2*X case.
  const out = formatAlgebra(simplify(parseAlgebra('X + X')));
  assert(out === '2*X',
         `canonicalization preserves single-var like-terms — '${out}'`);
}
{
  // Powers sort by their printed form: X^2 vs Y → key is 'X^2*Y',
  // not 'Y*X^2'.  Covers the mixed-power case.
  const out = formatAlgebra(simplify(parseAlgebra('X^2*Y + Y*X^2')));
  assert(out === '2*X^2*Y',
         `power + var canonicalization — '${out}' (want '2*X^2*Y')`);
}
{
  // Signed canonicalization: 2*X*Y - 3*Y*X = -(X*Y).  The formatter
  // parenthesizes unary-minus of a product for clarity (unary `-`
  // has higher print precedence than `*`), so the result prints as
  // '-(X*Y)' rather than '-X*Y' — mathematically the same, and
  // consistent with every other Neg-of-product in the codebase.
  const out = formatAlgebra(simplify(parseAlgebra('2*X*Y - 3*Y*X')));
  assert(out === '-(X*Y)',
         `signed canonicalization — '2*X*Y - 3*Y*X' → '${out}' (want '-(X*Y)')`);
}
{
  // Leaves * chains alone — 2*X*3 is not a sum; no like-terms pass
  // applies.  The existing simplifier does NOT fold this one because
  // the multiply chain isn't constant-constant adjacent.  We only
  // check that like-terms doesn't wrongly rewrite the tree.
  const out = formatAlgebra(simplify(parseAlgebra('2*X*3')));
  assert(!out.includes('+') && !out.includes('-'),
         `like-terms leaves * chains alone — '${out}' has no additive ops`);
}

// --- EXPAND op + expand() core ------------------------
//
// EXPAND multiplies out products and small non-negative integer
// powers of sums, then passes the result through simplify() so the
// like-terms combiner collapses coefficients.  These tests exercise
// both the raw algebra helper and the RPL op wrapping.
{
  const out = formatAlgebra(expand(parseAlgebra('(X+1)^2')));
  assert(out === 'X^2 + 2*X + 1',
         `expand (X+1)^2 → '${out}' (want 'X^2 + 2*X + 1')`);
}
{
  const out = formatAlgebra(expand(parseAlgebra('(X+1)^3')));
  assert(out === 'X^3 + 3*X^2 + 3*X + 1',
         `expand (X+1)^3 → '${out}'`);
}
{
  const out = formatAlgebra(expand(parseAlgebra('(X-1)^2')));
  assert(out === 'X^2 - 2*X + 1',
         `expand (X-1)^2 → '${out}'`);
}
{
  const out = formatAlgebra(expand(parseAlgebra('(X+1)*(X-1)')));
  assert(out === 'X^2 - 1',
         `expand (X+1)*(X-1) → '${out}' (difference of squares)`);
}
{
  const out = formatAlgebra(expand(parseAlgebra('(2*X+1)^2')));
  assert(out === '4*X^2 + 4*X + 1',
         `expand (2*X+1)^2 → '${out}'`);
}
{
  // Zero exponent is 1.  (X+1)^0 is intentionally not left as Bin('^', ...)
  // because EXPAND's scope covers small non-negative integer exponents.
  const out = formatAlgebra(expand(parseAlgebra('(X+1)^0')));
  assert(out === '1', `expand (X+1)^0 → '${out}' (want '1')`);
}
{
  // Non-integer / non-numeric exponent: EXPAND is a pass-through.  The
  // tree is expanded below (no-op here since base is atomic), but no
  // power expansion happens.
  const out = formatAlgebra(expand(parseAlgebra('(X+1)^N')));
  assert(out === '(X + 1)^N',
         `expand of non-numeric exponent is a pass-through — got '${out}'`);
}
{
  // Constants and lone variables are idempotent.
  assert(formatAlgebra(expand(parseAlgebra('5'))) === '5', 'expand 5 = 5');
  assert(formatAlgebra(expand(parseAlgebra('X'))) === 'X', 'expand X = X');
}
{
  // Nested: (X+1)^2 + (X+1)^2 → 2*(X^2 + 2*X + 1) after like-terms on
  // the outer sum.  We verify the fully-collapsed polynomial shape.
  const out = formatAlgebra(expand(parseAlgebra('(X+1)^2 + (X+1)^2')));
  assert(out === '2*X^2 + 4*X + 2',
         `expand (X+1)^2 + (X+1)^2 → '${out}'`);
}
{
  // Power combining inside a single term: X * X → X^2 (via splitTerm
  // + combinePowers in EXPAND's multiplier).
  const out = formatAlgebra(expand(parseAlgebra('X*X')));
  assert(out === 'X^2', `expand X*X → '${out}' (want 'X^2')`);
}
{
  // Power combining with mixed factors: X * X^2 → X^3.
  const out = formatAlgebra(expand(parseAlgebra('X*X^2')));
  assert(out === 'X^3', `expand X*X^2 → '${out}' (want 'X^3')`);
}

// EXPAND op (RPL registry path).  Routes through Giac's expand().
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('(X+1)^2')));
  giac._clear();
  giac._setFixture('purge(X);expand((X+1)^2)', 'X^2+2*X+1');
  lookup('EXPAND').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === 'X^2 + 2*X + 1',
         `EXPAND op on (X+1)^2 → '${formatAlgebra(s.peek().expr)}'`);
  giac._clear();
}
{
  // EXPAND on a Real is a no-op pass-through (matches HP50 leniency).
  // Real/Integer/Name don't hit Giac — no fixture needed.
  const s = new Stack();
  s.push(Real(7));
  lookup('EXPAND').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(7),
         `EXPAND on a Real is a pass-through`);
}

// --- COLLECT op (CAS menu alias for simplify) ---------
// COLLECT 1-arg routes through Giac's simplify(); 2-arg through
// Giac's collect(expr,var).  Each block registers the caseval
// fixture the op emits.
{
  // COLLECT on a Symbolic sums like terms via the simplifier.
  // 'X + X + Y' must come back as '2*X + Y' — same result as EVAL
  // would produce, but reachable without triggering full evaluation.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X + X + Y')));
  giac._clear();
  giac._setFixture('purge(X);purge(Y);simplify(X+X+Y)', '2*X+Y');
  lookup('COLLECT').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === '2*X + Y',
         `COLLECT 'X + X + Y' → '${formatAlgebra(s.peek().expr)}' (want '2*X + Y')`);
  giac._clear();
}
{
  // COLLECT picks up the canonicalization path — Y*X bucket matches
  // X*Y, so the coefficients add.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X*Y + Y*X')));
  giac._clear();
  giac._setFixture('purge(X);purge(Y);simplify(X*Y+Y*X)', '2*X*Y');
  lookup('COLLECT').fn(s);
  assert(formatAlgebra(s.peek().expr) === '2*X*Y',
         `COLLECT 'X*Y + Y*X' → '${formatAlgebra(s.peek().expr)}' (want '2*X*Y')`);
  giac._clear();
}
{
  // COLLECT on a non-algebraic passes through unchanged — matches
  // EXPAND's leniency so users can compose either against any argument.
  const s = new Stack();
  s.push(Real(5));
  lookup('COLLECT').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(5),
         `COLLECT on a Real is a pass-through`);
}
{
  // COLLECT on a bare Name is a pass-through (no work to do).
  const s = new Stack();
  s.push(Name('ZETA'));
  lookup('COLLECT').fn(s);
  assert(isName(s.peek()) && s.peek().id === 'ZETA',
         `COLLECT on a Name is a pass-through`);
}

// --- TEXTBOOK / FLAT ops + textbookMode state flag ----
{
  const { setTextbookMode, getTextbookMode } =
    await import('../www/src/rpl/state.js');
  // Normalize to flat so the TEXTBOOK-flips-it-on assertion below is
  // meaningful regardless of the module-level default.
  setTextbookMode(false);
  assert(getTextbookMode() === false,
         'setTextbookMode(false) lands on flat mode');
  // TEXTBOOK op flips it true; FLAT flips it back.
  lookup('TEXTBOOK').fn(new Stack());
  assert(getTextbookMode() === true,
         'TEXTBOOK op sets textbookMode = true');
  lookup('FLAT').fn(new Stack());
  assert(getTextbookMode() === false,
         'FLAT op sets textbookMode = false');
  // Idempotent — calling TEXTBOOK twice doesn't throw or toggle.
  lookup('TEXTBOOK').fn(new Stack());
  lookup('TEXTBOOK').fn(new Stack());
  assert(getTextbookMode() === true, 'TEXTBOOK is idempotent (stays true)');
  setTextbookMode(false);                // reset for later tests
}

// --- textbookMode fires a state-change event -----------
{
  const { subscribe, setTextbookMode } =
    await import('../www/src/rpl/state.js');
  let fired = 0;
  const off = subscribe(() => { fired++; });
  setTextbookMode(true);
  assert(fired === 1, 'setTextbookMode fires exactly one state event on change');
  setTextbookMode(true);                  // same value — should not fire
  assert(fired === 1, 'setTextbookMode is a no-op when already at that value');
  setTextbookMode(false);
  assert(fired === 2, 'setTextbookMode fires again on toggle off');
  off();
}

// ===================================================================
// FACTOR / SUBST / polynomial COLLECT
// ===================================================================

// --- FACTOR: monic quadratic with integer roots --------------------
{
  const { factor } = await import('../www/src/rpl/algebra.js');
  // Perfect square: X^2 + 2X + 1 = (X+1)^2
  const r1 = factor(parseAlgebra('X^2 + 2*X + 1'));
  assert(formatAlgebra(r1) === '(X + 1)^2',
         `factor(X^2+2X+1) = '${formatAlgebra(r1)}' (want '(X + 1)^2')`);
  // Difference of squares: X^2 - 1 = (X-1)(X+1)
  const r2 = factor(parseAlgebra('X^2 - 1'));
  assert(formatAlgebra(r2) === '(X - 1)*(X + 1)',
         `factor(X^2-1) = '${formatAlgebra(r2)}'`);
  // Two distinct positive roots: X^2 + 5X + 6 = (X+2)(X+3)
  const r3 = factor(parseAlgebra('X^2 + 5*X + 6'));
  assert(formatAlgebra(r3) === '(X + 2)*(X + 3)',
         `factor(X^2+5X+6) = '${formatAlgebra(r3)}'`);
  // Mixed-sign roots: X^2 + X - 6 = (X-2)(X+3)
  const r4 = factor(parseAlgebra('X^2 + X - 6'));
  assert(formatAlgebra(r4) === '(X - 2)*(X + 3)',
         `factor(X^2+X-6) = '${formatAlgebra(r4)}'`);
  // Two positive roots: X^2 - 5X + 6 = (X-3)(X-2).  Ordering
  // convention is "d ascending" inside each (X + d) factor, so
  // -3 comes before -2 in the output.
  const r5 = factor(parseAlgebra('X^2 - 5*X + 6'));
  assert(formatAlgebra(r5) === '(X - 3)*(X - 2)',
         `factor(X^2-5X+6) = '${formatAlgebra(r5)}'`);
  // Zero root: X^2 + X — r1=0, r2=-1, so d ascending gives 0, +1.
  // r=0 collapses to a bare X; (X + 1) follows.
  const r6 = factor(parseAlgebra('X^2 + X'));
  assert(formatAlgebra(r6) === 'X*(X + 1)',
         `factor(X^2+X) = '${formatAlgebra(r6)}'`);
}

// --- FACTOR: irrational / complex / pass-through shapes ------------
{
  const { factor } = await import('../www/src/rpl/algebra.js');
  // Irrational roots (discriminant is not a perfect square) — returns
  // the EXPANDed form unchanged rather than throwing.  Stays useful
  // under composition.
  const irr = factor(parseAlgebra('X^2 + X + 1'));
  assert(formatAlgebra(irr) === 'X^2 + X + 1',
         `factor(X^2+X+1) passes through (got '${formatAlgebra(irr)}')`);
  // Negative discriminant — complex roots, out of scope.
  const cx = factor(parseAlgebra('X^2 + 1'));
  assert(formatAlgebra(cx) === 'X^2 + 1',
         `factor(X^2+1) passes through`);
  // Non-monic with a coprime constant AND irrational roots — gcd is 1
  // AND discriminant isn't a perfect square, so nothing to pull and
  // no rational roots.  Passes through.  (The non-monic rational-root
  // factorer handles inputs like 2*X^2+3*X+1 that DO have rational
  // roots — those factor instead of passing through.)
  const coprime = factor(parseAlgebra('3*X^2 + 5*X + 1'));
  assert(formatAlgebra(coprime) === '3*X^2 + 5*X + 1',
         `factor(3X^2+5X+1) passes through (got '${formatAlgebra(coprime)}')`);
  // Symbolic (non-numeric) coefficients — factorMonicOnly fallback:
  // not factorable via the monic-quadratic integer rule, so pass through.
  const sym = factor(parseAlgebra('A*X^2 + B*X + C'));
  assert(formatAlgebra(sym) === 'A*X^2 + B*X + C',
         `factor(A*X^2+B*X+C) passes through (got '${formatAlgebra(sym)}')`);
}

// --- FACTOR: scalar-GCD pull (non-monic) ---------------
{
  const { factor } = await import('../www/src/rpl/algebra.js');
  // 2(X+1)^2 — gcd=2, reduced core factors as perfect square.
  const r1 = factor(parseAlgebra('2*X^2 + 4*X + 2'));
  assert(formatAlgebra(r1) === '2*(X + 1)^2',
         `factor(2X^2+4X+2) = '${formatAlgebra(r1)}' (want '2*(X + 1)^2')`);
  // 4(X+1)^2 — gcd=4, reduced core factors as perfect square.
  const r2 = factor(parseAlgebra('4*X^2 + 8*X + 4'));
  assert(formatAlgebra(r2) === '4*(X + 1)^2',
         `factor(4X^2+8X+4) = '${formatAlgebra(r2)}'`);
  // 3(X-1)(X+1) = 3X^2 - 3 — gcd=3, reduced core is X^2-1, factors
  // into distinct linear binomials.
  const r3 = factor(parseAlgebra('3*X^2 - 3'));
  assert(formatAlgebra(r3) === '3*(X - 1)*(X + 1)',
         `factor(3X^2-3) = '${formatAlgebra(r3)}'`);
  // 2X + 4 — linear, gcd=2, reduced core is X+2.
  const r4 = factor(parseAlgebra('2*X + 4'));
  assert(formatAlgebra(r4) === '2*(X + 2)',
         `factor(2X+4) = '${formatAlgebra(r4)}'`);
  // -1*X^2 - 2X - 1 — leading negative, scalar=-1 flips sign so the
  // core is leading-positive and factors cleanly.  We use `-1*X^2`
  // rather than `-X^2` because the parser binds unary-minus tighter
  // than `^`, so `-X^2` would read as `(-X)^2 = X^2`.  Formatter
  // emits a conservative extra paren pair around the `^` inside
  // `Neg(...)` to guard against that same re-parse on round-trip.
  const r5 = factor(parseAlgebra('-1*X^2 - 2*X - 1'));
  assert(formatAlgebra(r5) === '-((X + 1)^2)',
         `factor(-1*X^2-2X-1) = '${formatAlgebra(r5)}'`);
}

// --- FACTOR: X-power GCD (common-variable factor) ------
{
  const { factor } = await import('../www/src/rpl/algebra.js');
  // X^3 + X — pulls X out, residue X^2+1 is irreducible but rebuilt
  // as a plain polynomial inside the factored form.
  const r1 = factor(parseAlgebra('X^3 + X'));
  assert(formatAlgebra(r1) === 'X*(X^2 + 1)',
         `factor(X^3+X) = '${formatAlgebra(r1)}'`);
  // X^3 + X^2 + X — pulls X out, residue X^2+X+1 is irreducible.
  const r2 = factor(parseAlgebra('X^3 + X^2 + X'));
  assert(formatAlgebra(r2) === 'X*(X^2 + X + 1)',
         `factor(X^3+X^2+X) = '${formatAlgebra(r2)}'`);
  // X^3 + X^2 — minK=2, residue is linear X+1.
  const r3 = factor(parseAlgebra('X^3 + X^2'));
  assert(formatAlgebra(r3) === 'X^2*(X + 1)',
         `factor(X^3+X^2) = '${formatAlgebra(r3)}'`);
  // 2X^3 + 4X^2 + 2X — combines X-pull AND scalar-GCD pull.
  const r4 = factor(parseAlgebra('2*X^3 + 4*X^2 + 2*X'));
  assert(formatAlgebra(r4) === '2*X*(X + 1)^2',
         `factor(2X^3+4X^2+2X) = '${formatAlgebra(r4)}'`);
  // Degree 3 without an X common factor and no rational roots —
  // passes through.  (Rational-root hunting is future work.)
  const r5 = factor(parseAlgebra('X^3 + X + 1'));
  assert(formatAlgebra(r5) === 'X^3 + X + 1',
         `factor(X^3+X+1) pass-through (got '${formatAlgebra(r5)}')`);
}

// --- buildGiacCmd: purge-wrapped caseval command builder ----------
// Pure string builder — the counterpart of astToGiac.  Purges every
// free variable alphabetically so reserved-name collisions with Xcas
// built-ins (UI, GF, IS, …) can't raise "<name> is not defined".
{
  const { buildGiacCmd } = await import('../www/src/rpl/cas/giac-convert.mjs');
  // No free vars — no purge prefix.
  assert(buildGiacCmd(parseAlgebra('2+3*4'), (e) => `factor(${e})`) === 'factor(2+3*4)',
         'buildGiacCmd: no purge prefix when AST has no free vars');
  // Single free var.
  assert(buildGiacCmd(parseAlgebra('X^2+1'), (e) => `factor(${e})`) === 'purge(X);factor(X^2+1)',
         'buildGiacCmd: single-var prefix');
  // Multi var, alphabetical.
  assert(buildGiacCmd(parseAlgebra('A*X+B'), (e) => `factor(${e})`) === 'purge(A);purge(B);purge(X);factor(A*X+B)',
         'buildGiacCmd: multi-var alphabetical prefix');
  // Arbitrary command factory — not limited to factor.
  assert(buildGiacCmd(parseAlgebra('X+1'), (e) => `expand((${e})^3)`) === 'purge(X);expand((X+1)^3)',
         'buildGiacCmd: arbitrary command factory');
  // Function-call names are NOT free vars — SIN stays as a function
  // and X is the only purge target.  Guards against accidentally
  // purging HP function names and breaking Giac's command lookup.
  assert(buildGiacCmd(parseAlgebra('SIN(X)'), (e) => `factor(${e})`) === 'purge(X);factor(sin(X))',
         'buildGiacCmd: function-name is not purged');
}

// --- FACTOR op: Giac-backed routing (session 092 CAS pilot) -------
// Prove that FACTOR on a Symbolic routes through Giac. There is no
// legacy fallback — the CAS is Giac, full stop. We register fixtures
// for the cases we exercise and verify both (a) the result AST is
// the round-tripped Giac output and (b) the call actually hit
// giac.caseval (via the mock's call log).
{
  giac._clear();
  // Giac's real output for factor(x^2+2x+1) is `(x+1)^2`; input is the
  // HP50 uppercase var which astToGiac echoes back as-is.  The FACTOR
  // op purges free vars before the factor call to dodge Xcas built-in
  // name collisions (session 094) — so the caseval key is prefixed with
  // `purge(X);`.
  giac._setFixture('purge(X);factor(X^2+2*X+1)', '(X+1)^2');
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2 + 2*X + 1')));
  lookup('FACTOR').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === '(X + 1)^2',
         `FACTOR op via Giac: X^2+2X+1 → '(X + 1)^2' (got '${formatAlgebra(s.peek().expr)}')`);
  const log = giac._callLogCopy();
  assert(
    log.includes('purge(X);factor(X^2+2*X+1)'),
    `FACTOR routed through giac.caseval with purge prefix — log: ${JSON.stringify(log)}`,
  );
  giac._clear();
}
{
  giac._clear();
  giac._setFixture('purge(X);factor(X^3-1)', '(X-1)*(X^2+X+1)');
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^3 - 1')));
  lookup('FACTOR').fn(s);
  assert(
    isSymbolic(s.peek()) &&
      formatAlgebra(s.peek().expr) === '(X - 1)*(X^2 + X + 1)',
    `FACTOR via Giac: X^3-1 → '(X - 1)*(X^2 + X + 1)' (got '${formatAlgebra(s.peek().expr)}')`,
  );
  giac._clear();
}
{
  // No-fallback policy: if Giac errors (or has no fixture in the mock),
  // FACTOR propagates the error. No silent degrade to the legacy
  // algebra.js path.
  giac._clear();
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2 - 1')));
  let threw = false;
  try { lookup('FACTOR').fn(s); } catch (_e) { threw = true; }
  assert(threw, 'FACTOR with no Giac fixture must throw (no fallback)');
  giac._clear();
}
{
  // Non-integer Real passes through — no meaningful prime factorisation.
  const s = new Stack();
  s.push(Real(42.5));
  lookup('FACTOR').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(42.5),
         `FACTOR on non-integer Real is a pass-through`);
}
{
  // Integer FACTOR: prime factorisation → Symbolic product.
  const s = new Stack();
  s.push(Integer(42));
  lookup('FACTOR').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === '2*3*7',
         `FACTOR 42 → '2*3*7' (got '${formatAlgebra(s.peek().expr)}')`);
}
{
  // Prime input: returned as a lone Num wrapped in Symbolic.
  const s = new Stack();
  s.push(Integer(7));
  lookup('FACTOR').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === '7',
         `FACTOR 7 → '7' (got '${formatAlgebra(s.peek().expr)}')`);
}
{
  // Negative integer: factorisation wrapped in unary minus.
  const s = new Stack();
  s.push(Integer(-12));
  lookup('FACTOR').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === '-(2^2*3)',
         `FACTOR -12 → '-(2^2*3)' (got '${formatAlgebra(s.peek().expr)}')`);
}
{
  // ±1 and 0 pass through (no factorisation defined).
  for (const n of [0n, 1n, -1n]) {
    const s = new Stack();
    s.push(Integer(n));
    lookup('FACTOR').fn(s);
    assert(s.peek().type === 'integer' && s.peek().value === n,
           `FACTOR ${n} passes through`);
  }
}

// --- FACTOR op: reserved-name collision (session 094) --------------
// Regression for the "UI is not defined" bug.  Giac's caseval resolves
// bare identifiers through its global symbol table before running
// commands, so a handful of two-letter uppercase names (UI, GF, IS,
// DO, IF, …) collide with Xcas built-ins and fail with
// `"<name> is not defined"` instead of staying symbolic.  FACTOR
// purges every free var in the AST first, so the collision no longer
// triggers.  Two checks: (a) the caseval command Giac actually sees
// begins with `purge(...)` for each free var, alphabetically; (b) a
// multi-variable expression purges each name exactly once.
{
  giac._clear();
  giac._setFixture('purge(UI);factor(UI^2+1)', 'UI^2+1');
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('UI^2 + 1')));
  lookup('FACTOR').fn(s);
  // factor(UI^2+1) over rationals is irreducible — Giac passes through.
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === 'UI^2 + 1',
         `FACTOR UI^2+1 round-trips symbolically (got '${formatAlgebra(s.peek().expr)}')`);
  const log = giac._callLogCopy();
  assert(log.length === 1 && log[0] === 'purge(UI);factor(UI^2+1)',
         `FACTOR purges reserved name UI — log: ${JSON.stringify(log)}`);
  giac._clear();
}
{
  // Multi-var purge ordering — alphabetical, one purge per var.
  giac._clear();
  giac._setFixture('purge(A);purge(B);purge(X);factor(A*X+B)', 'A*X+B');
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('A*X + B')));
  lookup('FACTOR').fn(s);
  const log = giac._callLogCopy();
  assert(log.length === 1 && log[0] === 'purge(A);purge(B);purge(X);factor(A*X+B)',
         `FACTOR purges every free var alphabetically — log: ${JSON.stringify(log)}`);
  giac._clear();
}

// --- SUBST: single-variable numeric substitution ------------------
{
  const { subst } = await import('../www/src/rpl/algebra.js');
  // X^2 + 1 with X=3 collapses to a single Num.
  const r = subst(parseAlgebra('X^2 + 1'), 'X', AstNum(3));
  assert(r.kind === 'num' && r.value === 10,
         `subst(X^2+1, X, 3) = Num(10) (got ${JSON.stringify(r)})`);
  // X + Y with X=2 → Y + 2 (partial substitution leaves Y free).
  const r2 = subst(parseAlgebra('X + Y'), 'X', AstNum(2));
  assert(formatAlgebra(r2) === 'Y + 2',
         `subst(X+Y, X, 2) = '${formatAlgebra(r2)}'`);
  // A*X + B with X=Y → A*Y + B (variable-for-variable)
  const r3 = subst(parseAlgebra('A*X + B'), 'X', AstVar('Y'));
  assert(formatAlgebra(r3) === 'A*Y + B',
         `subst(A*X+B, X, Y) = '${formatAlgebra(r3)}'`);
  // Nested: substitute a Symbolic AST in for X.  X^2 + 1 with X=Y+1
  // should expand-ish via simplify into Y^2 + 2*Y + 2 when simplify
  // sees the numeric folding.  Our local simplify doesn't expand
  // (X+1)^2 — so we expect the pre-expand shape.
  const r4 = subst(parseAlgebra('X + 5'), 'X', parseAlgebra('Y + 1'));
  assert(formatAlgebra(r4) === 'Y + 6',
         `subst(X+5, X, Y+1) = '${formatAlgebra(r4)}'`);
}

// --- SUBST op: 3-arg form on the stack -----------------------------
// SUBST routes each binding through Giac's `subst(expr, var=value)`.
// For list/equation multi-binding forms, bindings are applied
// sequentially so each step is its own caseval command — fixtures
// below cover every intermediate result.
giac._clear();
giac._setFixtures({
  'purge(X);subst(X^2+1,X=3)':                      '10',
  'purge(X);purge(Y);subst(X+Y,X=2)':               'Y+2',
  'purge(A);purge(B);purge(X);purge(Y);subst(A*X+B,X=Y)': 'A*Y+B',
  'purge(X);subst(X^2-4,X=2)':                      '0',
  'purge(Y);subst(Y+2,Y=3)':                        '5',
  'purge(A);purge(B);purge(X);purge(Y);subst(A*X+B,X=Y+1)': 'A*(Y+1)+B',
  'purge(X);purge(Y);purge(Z);subst(X+Y+Z,X=1)':    'Y+Z+1',
  'purge(Y);purge(Z);subst(Y+Z+1,Y=2)':             'Z+3',
  'purge(Z);subst(Z+3,Z=3)':                        '6',
});
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2 + 1')));
  s.push(Name('X', { quoted: true }));
  s.push(Real(3));
  lookup('SUBST').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(10),
         `SUBST 3-arg: X^2+1, X, 3 → Real(10) (got ${JSON.stringify(s.peek())})`);
}
{
  // Partial: free var Y remains, result stays Symbolic.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X + Y')));
  s.push(Name('X', { quoted: true }));
  s.push(Real(2));
  lookup('SUBST').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === 'Y + 2',
         `SUBST 3-arg: X+Y, X, 2 → Symbolic 'Y + 2'`);
}
{
  // Variable-for-variable substitution through Name value.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('A*X + B')));
  s.push(Name('X', { quoted: true }));
  s.push(Name('Y', { quoted: true }));
  lookup('SUBST').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === 'A*Y + B',
         `SUBST 3-arg name-for-name: '${formatAlgebra(s.peek().expr)}'`);
}

// --- SUBST op: 2-arg list form -------------------------------------
{
  // { 'X' 2 'Y' 3 } substitutes both vars — X+Y → 5.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X + Y')));
  s.push(RList([Name('X', { quoted: true }), Real(2),
                 Name('Y', { quoted: true }), Real(3)]));
  lookup('SUBST').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(5),
         `SUBST list form: X+Y with {X=2, Y=3} → 5 (got ${JSON.stringify(s.peek())})`);
}
{
  // Single-entry list form.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2 - 4')));
  s.push(RList([Name('X', { quoted: true }), Real(2)]));
  lookup('SUBST').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(0),
         `SUBST list form: X^2-4 with {X=2} → 0`);
}

// --- Polynomial COLLECT by variable --------------------------------
{
  const { collectByVar } = await import('../www/src/rpl/algebra.js');
  // Linear: X + A*X + B*X + C → (A + B + 1)*X + C
  const r1 = collectByVar(parseAlgebra('X + A*X + B*X + C'), 'X');
  assert(formatAlgebra(r1) === '(A + B + 1)*X + C',
         `collectByVar linear: '${formatAlgebra(r1)}'`);
  // Quadratic: X^2 + 2*X^2 + X + 5 → 3*X^2 + X + 5
  const r2 = collectByVar(parseAlgebra('X^2 + 2*X^2 + X + 5'), 'X');
  assert(formatAlgebra(r2) === '3*X^2 + X + 5',
         `collectByVar quadratic coef-sum: '${formatAlgebra(r2)}'`);
  // Mixed-coef quadratic: A*X^2 + B*X + C stays A*X^2 + B*X + C
  // (already grouped — output shape matches canonical form).
  const r3 = collectByVar(parseAlgebra('A*X^2 + B*X + C'), 'X');
  assert(formatAlgebra(r3) === 'A*X^2 + B*X + C',
         `collectByVar already-grouped: '${formatAlgebra(r3)}'`);
  // Variable not present — output is simplify(ast), safe fallback.
  const r4 = collectByVar(parseAlgebra('Y + 1'), 'X');
  assert(formatAlgebra(r4) === 'Y + 1',
         `collectByVar no-X: '${formatAlgebra(r4)}'`);
}

// --- COLLECT op: 2-arg form on the stack ---------------------------
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X + A*X + B*X + C')));
  s.push(Name('X', { quoted: true }));
  giac._clear();
  giac._setFixture('purge(A);purge(B);purge(C);purge(X);collect(X+A*X+B*X+C,X)',
                   '(A+B+1)*X+C');
  lookup('COLLECT').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === '(A + B + 1)*X + C',
         `COLLECT 2-arg: '${formatAlgebra(s.peek().expr)}'`);
  giac._clear();
}
{
  // Backwards compat: 1-arg form still works as a simplify alias.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X + X + Y')));
  giac._clear();
  giac._setFixture('purge(X);purge(Y);simplify(X+X+Y)', '2*X+Y');
  lookup('COLLECT').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === '2*X + Y',
         `COLLECT 1-arg still works as simplify alias`);
  giac._clear();
}
{
  // 2-arg with a Real on top stays 1-arg (Real is not a variable).
  // Pops only the top; pre-existing pass-through semantics.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X + X')));
  s.push(Real(7));
  lookup('COLLECT').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(7),
         `COLLECT: Real on top is not a variable — falls to 1-arg and passes through`);
  // Underlying Symbolic untouched on level 2.
  assert(isSymbolic(s.peek(2)) &&
         formatAlgebra(s.peek(2).expr) === 'X + X',
         `COLLECT 2-arg dispatch doesn't consume level-2 when Real is on top`);
}

// ===================================================================
// `=` in algebra grammar + SUBST equation form
// ===================================================================

// --- parseEntry integration: `'X = 3'` reaches the stack as Symbolic
{
  // The outer parser's looksAlgebraic heuristic accepts `=` so an
  // `=`-only body reaches the algebra parser and lands as a Symbolic
  // equation (not a bare Name('X = 3')).
  const vs = parseEntry("`X = 3`");
  assert(vs.length === 1 && isSymbolic(vs[0]),
         `parseEntry('X = 3') produces a Symbolic (got ${JSON.stringify(vs)})`);
  assert(formatAlgebra(vs[0].expr) === 'X = 3',
         `parseEntry('X = 3') round-trips as 'X = 3' (got '${formatAlgebra(vs[0].expr)}')`);
  // End-to-end: typing the equation followed by SUBST substitutes.
  const s = new Stack();
  for (const v of parseEntry("`X^2 + 1`")) s.push(v);
  for (const v of parseEntry("`X = 3`")) s.push(v);
  giac._clear();
  giac._setFixture('purge(X);subst(X^2+1,X=3)', '10');
  lookup('SUBST').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(10),
         `parseEntry → SUBST eqn-form end-to-end: 10 (got ${JSON.stringify(s.peek())})`);
  giac._clear();
}

// --- parseAlgebra: `=` at the top level ----------------------------
{
  // Simple variable binding parses as Bin('=', Var, Num).
  const a = parseAlgebra('X = 3');
  assert(a.kind === 'bin' && a.op === '=' &&
         a.l.kind === 'var' && a.l.name === 'X' &&
         a.r.kind === 'num' && a.r.value === 3,
         `parseAlgebra('X = 3'): ${JSON.stringify(a)}`);
  // Each side of `=` can be a full expression — `=` binds loosest.
  const b = parseAlgebra('X + 1 = 3');
  assert(b.kind === 'bin' && b.op === '=' &&
         b.l.kind === 'bin' && b.l.op === '+',
         `parseAlgebra('X + 1 = 3'): ${JSON.stringify(b)}`);
  // Round-trip through the formatter: spaces around `=`.
  assert(formatAlgebra(parseAlgebra('X = 3')) === 'X = 3',
         `formatAlgebra round-trip 'X = 3'`);
  assert(formatAlgebra(parseAlgebra('2*X + 1 = Y')) === '2*X + 1 = Y',
         `formatAlgebra round-trip '2*X + 1 = Y'`);
  // Nested equations are rejected — `=` only at outermost level.
  let nestedThrew = false;
  try { parseAlgebra('(X = 3) + 1'); }
  catch (_e) { nestedThrew = true; }
  assert(nestedThrew, `parseAlgebra rejects nested equation '(X = 3) + 1'`);
}

// --- SUBST equation form: expr 'var = val' SUBST -------------------
// Fixtures cover every intermediate caseval result produced by the
// equation-form, list-of-equations, list-of-pairs, and mixed-list
// variants.  Sequential list/mixed-list applications each produce
// their own caseval command, so one fixture per step.
giac._clear();
giac._setFixtures({
  'purge(X);subst(X^2+1,X=3)':                       '10',
  'purge(A);purge(B);purge(X);purge(Y);subst(A*X+B,X=Y+1)': 'A*(Y+1)+B',
  'purge(X);purge(Y);subst(X+Y,X=2)':                'Y+2',
  'purge(Y);subst(Y+2,Y=3)':                         '5',
  'purge(X);purge(Y);purge(Z);subst(X+Y+Z,X=1)':     'Y+Z+1',
  'purge(Y);purge(Z);subst(Y+Z+1,Y=2)':              'Z+3',
  'purge(Z);subst(Z+3,Z=3)':                         '6',
});
{
  // Basic numeric eval via equation form.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2 + 1')));
  s.push(Symbolic(parseAlgebra('X = 3')));
  lookup('SUBST').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(10),
         `SUBST eqn form: X^2+1 with 'X=3' → 10 (got ${JSON.stringify(s.peek())})`);
}
{
  // Partial substitution leaves free variable.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('A*X + B')));
  s.push(Symbolic(parseAlgebra('X = Y + 1')));
  lookup('SUBST').fn(s);
  assert(isSymbolic(s.peek()) &&
         formatAlgebra(s.peek().expr) === 'A*(Y + 1) + B',
         `SUBST eqn form partial: '${formatAlgebra(s.peek().expr)}'`);
}
{
  // List form with equation entries — mix of `{ 'X = 2' 'Y = 3' }`.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X + Y')));
  s.push(RList([Symbolic(parseAlgebra('X = 2')),
                 Symbolic(parseAlgebra('Y = 3'))]));
  lookup('SUBST').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(5),
         `SUBST list of eqns: X+Y with {X=2, Y=3} → 5 (got ${JSON.stringify(s.peek())})`);
}
{
  // List form also accepts alternating (name, value) pairs.
  // Regression: equation-entry dispatch must not break this path.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X + Y')));
  s.push(RList([Name('X', { quoted: true }), Real(2),
                 Name('Y', { quoted: true }), Real(3)]));
  lookup('SUBST').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(5),
         `SUBST list pairs (regression): X+Y with {X=2, Y=3} → 5`);
}
{
  // Mixed list: one equation entry plus one (name, value) pair.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X + Y + Z')));
  s.push(RList([Symbolic(parseAlgebra('X = 1')),
                 Name('Y', { quoted: true }), Real(2),
                 Symbolic(parseAlgebra('Z = 3'))]));
  lookup('SUBST').fn(s);
  assert(isReal(s.peek()) && s.peek().value.eq(6),
         `SUBST mixed list: 1+2+3=6 (got ${JSON.stringify(s.peek())})`);
}

// ===================================================================
// FACTOR: non-monic rational-root + sum/diff of cubes
//          `=` pretty-print (textbook mode)
// ===================================================================

// --- FACTOR: non-monic quadratic via rational roots ----
{
  const { factor } = await import('../www/src/rpl/algebra.js');
  // 2*X^2 + 3*X + 1 — roots -1/2 and -1.  Factors as (2X+1)(X+1).
  // The "larger" root (sqrtD ≥ 0) is -1/2 = r1, so it's emitted first.
  const r1 = factor(parseAlgebra('2*X^2 + 3*X + 1'));
  assert(formatAlgebra(r1) === '(2*X + 1)*(X + 1)',
         `factor(2X^2+3X+1) = '${formatAlgebra(r1)}' (want '(2*X + 1)*(X + 1)')`);
  // 4*X^2 - 1 — non-monic difference of squares, roots ±1/2.
  const r2 = factor(parseAlgebra('4*X^2 - 1'));
  assert(formatAlgebra(r2) === '(2*X - 1)*(2*X + 1)',
         `factor(4X^2-1) = '${formatAlgebra(r2)}'`);
  // 2*X^2 - 3*X - 2 — mixed rational + integer root (2 and -1/2).
  const r3 = factor(parseAlgebra('2*X^2 - 3*X - 2'));
  assert(formatAlgebra(r3) === '(X - 2)*(2*X + 1)',
         `factor(2X^2-3X-2) = '${formatAlgebra(r3)}'`);
  // 6*X^2 + 5*X + 1 — both roots rational: -1/3, -1/2.
  const r4 = factor(parseAlgebra('6*X^2 + 5*X + 1'));
  assert(formatAlgebra(r4) === '(3*X + 1)*(2*X + 1)',
         `factor(6X^2+5X+1) = '${formatAlgebra(r4)}'`);
  // 4*X^2 + 4*X + 1 — double rational root -1/2 → (2X+1)^2.
  const r5 = factor(parseAlgebra('4*X^2 + 4*X + 1'));
  assert(formatAlgebra(r5) === '(2*X + 1)^2',
         `factor(4X^2+4X+1) = '${formatAlgebra(r5)}'`);
  // 9*X^2 - 6*X + 1 — double rational root 1/3 → (3X-1)^2.
  const r6 = factor(parseAlgebra('9*X^2 - 6*X + 1'));
  assert(formatAlgebra(r6) === '(3*X - 1)^2',
         `factor(9X^2-6X+1) = '${formatAlgebra(r6)}'`);
}

// --- FACTOR: non-monic quadratic pass-through shapes ---
{
  const { factor } = await import('../www/src/rpl/algebra.js');
  // 2*X^2 + 3*X + 4 — negative discriminant → passes through.
  const r1 = factor(parseAlgebra('2*X^2 + 3*X + 4'));
  assert(formatAlgebra(r1) === '2*X^2 + 3*X + 4',
         `factor(2X^2+3X+4) complex roots → pass-through (got '${formatAlgebra(r1)}')`);
  // 2*X^2 + 2*X - 1 — irrational roots (D = 4 + 8 = 12, √12 ≠ integer)
  const r2 = factor(parseAlgebra('2*X^2 + 2*X - 1'));
  assert(formatAlgebra(r2) === '2*X^2 + 2*X - 1',
         `factor(2X^2+2X-1) irrational roots → pass-through (got '${formatAlgebra(r2)}')`);
  // 2*X^2 - 5*X + 3 — both roots rational: 3/2, 1 — integer + rational.
  // "Larger root first" convention: 3/2 > 1, so (2X - 3) comes first.
  const r3 = factor(parseAlgebra('2*X^2 - 5*X + 3'));
  assert(formatAlgebra(r3) === '(2*X - 3)*(X - 1)',
         `factor(2X^2-5X+3) = '${formatAlgebra(r3)}'`);
}

// --- FACTOR: sum/difference of cubes -------------------
{
  const { factor } = await import('../www/src/rpl/algebra.js');
  // X^3 + 8 — sum of cubes: (X + 2)(X^2 - 2X + 4).
  const r1 = factor(parseAlgebra('X^3 + 8'));
  assert(formatAlgebra(r1) === '(X + 2)*(X^2 - 2*X + 4)',
         `factor(X^3+8) = '${formatAlgebra(r1)}'`);
  // X^3 - 8 — difference of cubes: (X - 2)(X^2 + 2X + 4).
  const r2 = factor(parseAlgebra('X^3 - 8'));
  assert(formatAlgebra(r2) === '(X - 2)*(X^2 + 2*X + 4)',
         `factor(X^3-8) = '${formatAlgebra(r2)}'`);
  // X^3 + 1 — classic identity: (X + 1)(X^2 - X + 1).  The `p*q = 1`
  // case means the middle term of the quadratic drops its coefficient.
  const r3 = factor(parseAlgebra('X^3 + 1'));
  assert(formatAlgebra(r3) === '(X + 1)*(X^2 - X + 1)',
         `factor(X^3+1) = '${formatAlgebra(r3)}'`);
  // X^3 - 1 — (X - 1)(X^2 + X + 1).
  const r4 = factor(parseAlgebra('X^3 - 1'));
  assert(formatAlgebra(r4) === '(X - 1)*(X^2 + X + 1)',
         `factor(X^3-1) = '${formatAlgebra(r4)}'`);
  // 8*X^3 + 27 — both leading and constant are perfect cubes (p=2, q=3).
  // Factors as (2X + 3)(4X^2 - 6X + 9).
  const r5 = factor(parseAlgebra('8*X^3 + 27'));
  assert(formatAlgebra(r5) === '(2*X + 3)*(4*X^2 - 6*X + 9)',
         `factor(8X^3+27) = '${formatAlgebra(r5)}'`);
  // 8*X^3 - 27 — (2X - 3)(4X^2 + 6X + 9).
  const r6 = factor(parseAlgebra('8*X^3 - 27'));
  assert(formatAlgebra(r6) === '(2*X - 3)*(4*X^2 + 6*X + 9)',
         `factor(8X^3-27) = '${formatAlgebra(r6)}'`);
}

// --- FACTOR: cubes pipeline integration ----------------
{
  const { factor } = await import('../www/src/rpl/algebra.js');
  // 2*X^3 + 16 — gcd=2 pulls first, residue X^3 + 8 → (X+2)(X^2-2X+4).
  // End result: 2*(X + 2)*(X^2 - 2*X + 4), assembled as a left-assoc
  // `*` chain so no spurious parens appear.
  const r1 = factor(parseAlgebra('2*X^3 + 16'));
  assert(formatAlgebra(r1) === '2*(X + 2)*(X^2 - 2*X + 4)',
         `factor(2X^3+16) = '${formatAlgebra(r1)}'`);
  // X^4 + 8*X — X-pull first (minK=1), residue X^3 + 8 cubes.
  // Result: X * (X + 2) * (X^2 - 2X + 4).
  const r2 = factor(parseAlgebra('X^4 + 8*X'));
  assert(formatAlgebra(r2) === 'X*(X + 2)*(X^2 - 2*X + 4)',
         `factor(X^4+8X) = '${formatAlgebra(r2)}'`);
  // X^3 + 7 — 7 is not a perfect cube → passes through.
  const r3 = factor(parseAlgebra('X^3 + 7'));
  assert(formatAlgebra(r3) === 'X^3 + 7',
         `factor(X^3+7) pass-through (got '${formatAlgebra(r3)}')`);
  // X^3 + 4 — 4 is not a perfect cube → passes through.
  const r4 = factor(parseAlgebra('X^3 + 4'));
  assert(formatAlgebra(r4) === 'X^3 + 4',
         `factor(X^3+4) pass-through`);
  // 4*X^3 + 27 — 4 is not a perfect cube → passes through after any
  // GCD attempt (gcd(4,27)=1 so no scalar pull either).
  const r5 = factor(parseAlgebra('4*X^3 + 27'));
  assert(formatAlgebra(r5) === '4*X^3 + 27',
         `factor(4X^3+27) pass-through (a not perfect cube)`);
}

// --- FACTOR: EXPAND round-trip for new shapes ----------
{
  const { factor, expand } = await import('../www/src/rpl/algebra.js');
  // factor → EXPAND should return the polynomial form unchanged.
  // This is the "composition is a useful no-op" property that ties
  // the CAS together.
  const pairs = [
    '2*X^2 + 3*X + 1',
    '4*X^2 - 1',
    '8*X^3 + 27',
    'X^3 + 8',
  ];
  for (const src of pairs) {
    const factored = factor(parseAlgebra(src));
    const re = formatAlgebra(expand(factored));
    assert(re === src,
           `EXPAND(FACTOR(${src})) = '${re}' (want '${src}')`);
  }
}

// --- FACTOR: general cubic rational-root scan ----------
// Tests for the `factorCubicRationalRoot` path.  Cases cover distinct
// integer roots, repeated roots (double and triple), a non-monic
// cubic, inputs that have no rational root (pass-through), and the
// collapse of repeated linear factors into power notation.
{
  const { factor } = await import('../www/src/rpl/algebra.js');

  // Three distinct integer roots.
  // X^3 - 6X^2 + 11X - 6 = (X-1)(X-2)(X-3).  Search order (q=1, |p|
  // ascending, + before −) finds root 1 first; synthetic division
  // leaves X^2 - 5X + 6 whose monic factorer emits (X - 3)*(X - 2).
  assert(
    formatAlgebra(factor(parseAlgebra('X^3 - 6*X^2 + 11*X - 6'))) ===
      '(X - 1)*(X - 3)*(X - 2)',
    `factor(X^3 - 6X^2 + 11X - 6) = '${formatAlgebra(factor(parseAlgebra('X^3 - 6*X^2 + 11*X - 6')))}'`);

  // All-positive coefficients → all negative roots.  Root −1 found first.
  // Residue quadratic X^2 + 5X + 6: factorMonicQuadratic emits
  // (X + 2)(X + 3) — "larger root first" convention means r1 = −2
  // precedes r2 = −3, so factor order is (X+1), (X+2), (X+3) —
  // ascending-d inside each factor.
  assert(
    formatAlgebra(factor(parseAlgebra('X^3 + 6*X^2 + 11*X + 6'))) ===
      '(X + 1)*(X + 2)*(X + 3)',
    `factor(X^3 + 6X^2 + 11X + 6) = '${formatAlgebra(factor(parseAlgebra('X^3 + 6*X^2 + 11*X + 6')))}'`);

  // Triple root (X - 1)^3 = X^3 - 3X^2 + 3X - 1.
  // Linear (X-1), residue (X-1)^2 → collapse to (X-1)^3.
  assert(
    formatAlgebra(factor(parseAlgebra('X^3 - 3*X^2 + 3*X - 1'))) ===
      '(X - 1)^3',
    `factor((X-1)^3 expanded) = '${formatAlgebra(factor(parseAlgebra('X^3 - 3*X^2 + 3*X - 1')))}'`);

  // Triple root (X + 1)^3.
  assert(
    formatAlgebra(factor(parseAlgebra('X^3 + 3*X^2 + 3*X + 1'))) ===
      '(X + 1)^3',
    `factor((X+1)^3 expanded) = '${formatAlgebra(factor(parseAlgebra('X^3 + 3*X^2 + 3*X + 1')))}'`);

  // Triple root (2X - 1)^3 = 8X^3 - 12X^2 + 6X - 1.
  assert(
    formatAlgebra(factor(parseAlgebra('8*X^3 - 12*X^2 + 6*X - 1'))) ===
      '(2*X - 1)^3',
    `factor((2X-1)^3 expanded) = '${formatAlgebra(factor(parseAlgebra('8*X^3 - 12*X^2 + 6*X - 1')))}'`);

  // Double root (X - 1)^2 · (X + 1) = X^3 - X^2 - X + 1.
  // Found root 1 first; residue (X - 1)(X + 1); collapse repeated
  // (X - 1) into (X - 1)^2 · (X + 1).
  assert(
    formatAlgebra(factor(parseAlgebra('X^3 - X^2 - X + 1'))) ===
      '(X - 1)^2*(X + 1)',
    `factor((X-1)^2(X+1)) = '${formatAlgebra(factor(parseAlgebra('X^3 - X^2 - X + 1')))}'`);

  // Double root (X + 1)^2 · (X - 1) = X^3 + X^2 - X - 1.
  // Found root 1 first (ordering preference), residue (X+1)^2;
  // collapse at the top level doesn't apply (linear is (X-1), residue
  // is (X+1)^2 — different), so (X - 1)*(X + 1)^2.
  assert(
    formatAlgebra(factor(parseAlgebra('X^3 + X^2 - X - 1'))) ===
      '(X - 1)*(X + 1)^2',
    `factor((X+1)^2(X-1)) = '${formatAlgebra(factor(parseAlgebra('X^3 + X^2 - X - 1')))}'`);

  // Non-monic cubic with rational roots.
  // 2X^3 - X^2 - 2X + 1 = (2X - 1)(X - 1)(X + 1).  Root 1 (q=1, p=1)
  // found first; residue 2X^2 + X - 1 handled by factorNonMonicQuadratic.
  assert(
    formatAlgebra(factor(parseAlgebra('2*X^3 - X^2 - 2*X + 1'))) ===
      '(X - 1)*(2*X - 1)*(X + 1)',
    `factor(2X^3 - X^2 - 2X + 1) = '${formatAlgebra(factor(parseAlgebra('2*X^3 - X^2 - 2*X + 1')))}'`);

  // Non-monic cubic with a fractional root.
  // 4X^3 - 8X^2 + X + 3 = (2X - 3)(2X + 1)(X - 1).
  assert(
    formatAlgebra(factor(parseAlgebra('4*X^3 - 8*X^2 + X + 3'))) ===
      '(X - 1)*(2*X - 3)*(2*X + 1)',
    `factor(4X^3 - 8X^2 + X + 3) = '${formatAlgebra(factor(parseAlgebra('4*X^3 - 8*X^2 + X + 3')))}'`);

  // One rational root, quadratic residue irreducible over integers.
  // X^3 + X + 2 = (X + 1)(X^2 - X + 2) — the quadratic residue has
  // discriminant 1 - 8 = -7 (complex roots), so it emits as-is.
  assert(
    formatAlgebra(factor(parseAlgebra('X^3 + X + 2'))) ===
      '(X + 1)*(X^2 - X + 2)',
    `factor(X^3 + X + 2) = '${formatAlgebra(factor(parseAlgebra('X^3 + X + 2')))}'`);

  // Root 1 found, residue X^2 + 1 (complex roots) → (X - 1)(X^2 + 1).
  // Inputs like X^3 + X^2 + X + 1 (can be factored as (X+1)(X^2+1)).
  // Root -1 gives residue X^2 + 1.
  assert(
    formatAlgebra(factor(parseAlgebra('X^3 + X^2 + X + 1'))) ===
      '(X + 1)*(X^2 + 1)',
    `factor(X^3 + X^2 + X + 1) = '${formatAlgebra(factor(parseAlgebra('X^3 + X^2 + X + 1')))}'`);

  // No rational root — polynomial with irrational real roots.
  // X^3 - 2 (cubes branch already handles this — perfect cube?).  `2`
  // is not a perfect cube, and coef[1] = coef[2] = 0 so the cubes
  // branch takes it and returns null.  Our general-cubic branch does
  // NOT run in that case (middle coefs are zero).  Result: pass-through.
  assert(
    formatAlgebra(factor(parseAlgebra('X^3 - 2'))) === 'X^3 - 2',
    `factor(X^3 - 2) pass-through`);

  // X^3 + 2X + 1 — no rational root (p/q candidates: ±1 all fail).
  // Reaches the general-cubic branch (non-zero middle coef) but
  // returns null → pass-through to rebuildNumericPoly.  No scalar
  // GCD, no X-pull, so the factor() no-op guard returns expanded.
  assert(
    formatAlgebra(factor(parseAlgebra('X^3 + 2*X + 1'))) ===
      'X^3 + 2*X + 1',
    `factor(X^3 + 2X + 1) pass-through`);

  // Integration with earlier steps: X-GCD pull + cubic rational root.
  // X^4 - 6X^3 + 11X^2 - 6X = X·(X^3 - 6X^2 + 11X - 6)
  //                         = X·(X - 1)·(X - 3)·(X - 2).
  assert(
    formatAlgebra(factor(parseAlgebra('X^4 - 6*X^3 + 11*X^2 - 6*X'))) ===
      'X*(X - 1)*(X - 3)*(X - 2)',
    `factor(X·(X-1)(X-3)(X-2) expanded) = '${formatAlgebra(factor(parseAlgebra('X^4 - 6*X^3 + 11*X^2 - 6*X')))}'`);

  // Integration with scalar GCD pull.
  // 2X^3 - 12X^2 + 22X - 12 = 2·(X - 1)·(X - 3)·(X - 2).
  assert(
    formatAlgebra(factor(parseAlgebra('2*X^3 - 12*X^2 + 22*X - 12'))) ===
      '2*(X - 1)*(X - 3)*(X - 2)',
    `factor(2·cubic expanded) = '${formatAlgebra(factor(parseAlgebra('2*X^3 - 12*X^2 + 22*X - 12')))}'`);
}

// --- FACTOR: EXPAND round-trip for cubic rational-root factorizations
// Verify the FACTOR ∘ EXPAND identity at the value level — we compare
// via evaluation at several X values rather than trusting expand()'s
// term ordering, which isn't strictly descending-by-power.
{
  const { factor, expand, evalAst } = await import('../www/src/rpl/algebra.js');
  const check = (src) => {
    const orig = parseAlgebra(src);
    const factored = factor(orig);
    const re = expand(factored);
    // Evaluate both at X = 0, 1, 2, -1, 5 — if factoring/expanding is
    // correct the numeric results must match at every point.
    for (const x of [0, 1, 2, -1, 5, -3]) {
      const lookup = name => name === 'X' ? x : null;
      const a = evalAst(orig, lookup);
      const b = evalAst(re, lookup);
      assert(a.kind === 'num' && b.kind === 'num' && a.value === b.value,
             `EXPAND(FACTOR(${src})) value mismatch at X=${x}: orig ${formatAlgebra(a)} vs re ${formatAlgebra(b)}`);
    }
  };
  check('X^3 - 6*X^2 + 11*X - 6');
  check('X^3 - 3*X^2 + 3*X - 1');     // triple root
  check('2*X^3 - X^2 - 2*X + 1');     // non-monic
  check('4*X^3 - 8*X^2 + X + 3');     // fractional root
  check('X^3 - X^2 - X + 1');         // double root
  check('X^3 + X + 2');               // residue irreducible
}

// --- pretty.js: `=` renders as flat row with spaces ----
{
  const { astToSvg, layoutAst } = await import('../www/src/rpl/pretty.js');
  // Simple equation — three text glyphs in a row (X, ' = ', 3), no
  // fraction bar, no parens path.
  const { svg, width } = astToSvg(parseAlgebra('X = 3'));
  assert((svg.match(/<text /g) || []).length === 3,
         `pretty 'X = 3' uses 3 <text> glyphs (X, ' = ', 3) — got ${svg}`);
  assert(!svg.includes('<path'),
         `pretty 'X = 3' has no parens path`);
  assert(!svg.includes('<line'),
         `pretty 'X = 3' has no fraction bar`);
  // Width approximation: 'X' + (0.3 pad) '=' (0.3 pad) + '3' is about
  // 1 + 1.6 + 1 = 3.6 chars at 0.6em·24px ≈ 14.4px per char → roughly
  // 52px plus 8px padding.  The `=` separator uses 0.3-char gaps either
  // side (not a full ' = ').
  assert(width > 40 && width < 90,
         `pretty 'X = 3' width ~60 (got ${width})`);
}
{
  // Equation with a fraction on one side — the ` = ` separator sits at
  // the baseline while the fraction bar renders inside one of the
  // children.  Verify the bar still appears exactly once.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg } = astToSvg(parseAlgebra('Y = 1/2'));
  assert((svg.match(/<line /g) || []).length === 1,
         `pretty 'Y = 1/2' has one fraction bar`);
  // Three pieces of text outside the fraction: 'Y', ' = '; two inside
  // the fraction: '1', '2'.  Total 4.
  assert((svg.match(/<text /g) || []).length === 4,
         `pretty 'Y = 1/2' has 4 <text> glyphs — got ${svg}`);
}
{
  // Equation with a polynomial on the left — mixes superscript
  // (<text> at smaller size) with the ` = ` separator.
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  const { svg } = astToSvg(parseAlgebra('X^2 + 1 = 10'));
  // The base font is 24; the ^2 uses 24*0.7 = 16.8.  Ensure at least
  // one smaller-font <text> appears.
  assert(/font-size="16\.?8?9*"/.test(svg) ||
         svg.includes('16.7') || svg.includes('16.8'),
         `pretty 'X^2 + 1 = 10' has a superscript at ~16.8`);
  // No parens needed anywhere: ` = ` is outermost and has no child
  // that needs wrapping.
  assert(!svg.includes('<path'),
         `pretty 'X^2 + 1 = 10' has no parens`);
}

// --- pretty.js: textbook juxtaposition drops `*` on
//                Num × (Var|Power|Fn|ParenExpr) shapes ----
{
  const { astToSvg } = await import('../www/src/rpl/pretty.js');

  // 2*X renders as just "2" and "X" — no `*` glyph in between.
  {
    const { svg } = astToSvg(parseAlgebra('2*X'));
    const texts = (svg.match(/<text[^>]*>/g) || []).length;
    assert(texts === 2,
           `pretty '2*X' has 2 <text> glyphs (no *) — got ${texts}: ${svg}`);
    assert(!/>\s*\*\s*<\/text>/.test(svg),
           `pretty '2*X' should not contain a bare * glyph — got ${svg}`);
  }

  // 2*X^2 — Num × Power, still no `*`.  A superscript (font-size 16.8,
  // which JS sometimes serialises as 16.799999999999997) is present
  // for the exponent.
  {
    const { svg } = astToSvg(parseAlgebra('2*X^2'));
    assert(!/>\s*\*\s*<\/text>/.test(svg),
           `pretty '2*X^2' should have no * glyph — got ${svg}`);
    assert(svg.includes('16.7') || svg.includes('16.8'),
           `pretty '2*X^2' has a superscript 2 at ~16.8 — got ${svg}`);
  }

  // 2*(X+1) — Num × parenthesised Bin('+').  The * glyph should be
  // absent; parentheses (rendered as <path>) are still present because
  // `+` binds looser than `*` and the subtree needs wrapping.
  {
    const { svg } = astToSvg(parseAlgebra('2*(X+1)'));
    assert(!/>\s*\*\s*<\/text>/.test(svg),
           `pretty '2*(X+1)' should have no * glyph — got ${svg}`);
    assert(svg.includes('<path'),
           `pretty '2*(X+1)' still draws parens — got ${svg}`);
  }

  // 2*SIN(X) — Num × Fn, no `*`.  Parens surround the function arg.
  {
    const { svg } = astToSvg(parseAlgebra('2*SIN(X)'));
    assert(!/>\s*\*\s*<\/text>/.test(svg),
           `pretty '2*SIN(X)' should have no * glyph — got ${svg}`);
    assert(svg.includes('SIN'),
           `pretty '2*SIN(X)' still contains SIN — got ${svg}`);
  }

  // 2*3 — Num × Num → juxtaposition would produce "23", which reads as
  // twenty-three.  Do NOT drop the * here.
  {
    const { svg } = astToSvg(parseAlgebra('2*3'));
    assert(/>\s*\*\s*<\/text>/.test(svg),
           `pretty '2*3' KEEPS the * glyph to avoid 23 ambiguity — got ${svg}`);
  }

  // X*Y — Var × Var; current rule is conservative (left must be a
  // Num).  Ensure the `*` stays so this doesn't regress.
  {
    const { svg } = astToSvg(parseAlgebra('X*Y'));
    assert(/>\s*\*\s*<\/text>/.test(svg),
           `pretty 'X*Y' KEEPS the * glyph (conservative rule) — got ${svg}`);
  }

  // 2*X*Y — outer is (l=Bin, r=Var), inner is (l=2, r=X).  Inner
  // juxtaposes; outer keeps its *.  Expect exactly one * glyph.
  {
    const { svg } = astToSvg(parseAlgebra('2*X*Y'));
    const stars = (svg.match(/>\s*\*\s*<\/text>/g) || []).length;
    assert(stars === 1,
           `pretty '2*X*Y' has exactly 1 * glyph (inner juxtaposed) — got ${stars}: ${svg}`);
  }
}

// --- FACTOR: general quartic rational-root scan --------
// Tests for the `factorQuarticRationalRoot` path.  Cases cover:
// - biquadratic X^4 shapes (even-only powers),
// - cleanly-factoring full quartics,
// - repeated roots collapsing into (linear)^3 / (linear)^4,
// - cubic-residue irrationality (pass-through of the residue),
// - non-monic leading coefficients (e.g. 4*X^4 - 13*X^2 + 3),
// - pass-through for polynomials with no rational roots.
{
  const { factor } = await import('../www/src/rpl/algebra.js');

  // Biquadratic with four integer roots: (X-1)(X+1)(X-2)(X+2).
  // Root 1 found first; cubic residue X^3 + X^2 - 4X - 4 factors into
  // (X+1)(X-2)(X+2).  Linear (X-1) does NOT match any residue factor
  // so no collapse — full 4-factor chain emitted.
  assert(
    formatAlgebra(factor(parseAlgebra('X^4 - 5*X^2 + 4'))) ===
      '(X - 1)*(X + 1)*(X - 2)*(X + 2)',
    `factor(X^4 - 5X^2 + 4) = '${formatAlgebra(factor(parseAlgebra('X^4 - 5*X^2 + 4')))}'`);

  // Biquadratic: X^4 - 1 = (X-1)(X+1)(X^2+1).  Cubic residue
  // X^3 + X^2 + X + 1 factors into (X+1)(X^2+1).  (X-1) ≠ (X+1) so
  // no collapse; flat 3-factor chain.
  assert(
    formatAlgebra(factor(parseAlgebra('X^4 - 1'))) ===
      '(X - 1)*(X + 1)*(X^2 + 1)',
    `factor(X^4 - 1) = '${formatAlgebra(factor(parseAlgebra('X^4 - 1')))}'`);

  // Biquadratic with larger constants: X^4 - 16 = (X-2)(X+2)(X^2+4).
  assert(
    formatAlgebra(factor(parseAlgebra('X^4 - 16'))) ===
      '(X - 2)*(X + 2)*(X^2 + 4)',
    `factor(X^4 - 16) = '${formatAlgebra(factor(parseAlgebra('X^4 - 16')))}'`);

  // Biquadratic X^4 - 10X^2 + 9 = (X-1)(X+1)(X-3)(X+3).
  assert(
    formatAlgebra(factor(parseAlgebra('X^4 - 10*X^2 + 9'))) ===
      '(X - 1)*(X + 1)*(X - 3)*(X + 3)',
    `factor(X^4 - 10X^2 + 9) = '${formatAlgebra(factor(parseAlgebra('X^4 - 10*X^2 + 9')))}'`);

  // Quadruple root: (X-1)^4 = X^4 - 4X^3 + 6X^2 - 4X + 1.
  // Linear (X-1) · cubic (X-1)^3 → collapse to (X-1)^4.
  assert(
    formatAlgebra(factor(parseAlgebra('X^4 - 4*X^3 + 6*X^2 - 4*X + 1'))) ===
      '(X - 1)^4',
    `factor((X-1)^4 expanded) = '${formatAlgebra(factor(parseAlgebra('X^4 - 4*X^3 + 6*X^2 - 4*X + 1')))}'`);

  // Quadruple root (X+1)^4.
  assert(
    formatAlgebra(factor(parseAlgebra('X^4 + 4*X^3 + 6*X^2 + 4*X + 1'))) ===
      '(X + 1)^4',
    `factor((X+1)^4 expanded) = '${formatAlgebra(factor(parseAlgebra('X^4 + 4*X^3 + 6*X^2 + 4*X + 1')))}'`);

  // Triple-root + distinct:  (X-2)(X-1)^3 = X^4 - 5X^3 + 9X^2 - 7X + 2.
  // Root 1 found first (q=1, |p|=1, +p); cubic residue X^3 - 4X^2 + 5X - 2
  // = (X-1)^2 · (X-2) from the cubic factorer.  Outer linear (X-1) ·
  // cubic collapses via _collapseRepeatedFactors → (X-1)^3 · (X-2).
  assert(
    formatAlgebra(factor(parseAlgebra('X^4 - 5*X^3 + 9*X^2 - 7*X + 2'))) ===
      '(X - 1)^3*(X - 2)',
    `factor((X-1)^3(X-2) expanded) = '${formatAlgebra(factor(parseAlgebra('X^4 - 5*X^3 + 9*X^2 - 7*X + 2')))}'`);

  // Two real + one complex quadratic residue: X^4 + X^3 - X - 1 =
  // (X-1)(X+1)(X^2 + X + 1).  Root 1 found, cubic residue X^3 + 2X^2
  // + 2X + 1 factors as (X+1)(X^2+X+1).  No collapse.
  assert(
    formatAlgebra(factor(parseAlgebra('X^4 + X^3 - X - 1'))) ===
      '(X - 1)*(X + 1)*(X^2 + X + 1)',
    `factor(X^4 + X^3 - X - 1) = '${formatAlgebra(factor(parseAlgebra('X^4 + X^3 - X - 1')))}'`);

  // Non-monic quartic: 4X^4 - 13X^2 + 3 = (2X-1)(2X+1)(X^2 - 3).
  // Root 1/2 found via q=2, p=1; cubic residue 4X^3 + 2X^2 - 12X - 6
  // which... hmm, actually let me trace: a=4, b=0, c=-13, d=0, e=3.
  // Try p=1, q=2: 4*1 + 0 + (-13)*4 + 0 + 3*16 = 4 - 52 + 48 = 0. Hit.
  // A = 4/2 = 2, B = (0 + 2*1)/2 = 1, C = (-13 + 1*1)/2 = -6,
  // D = (0 + (-6)*1)/2 = -3.  Check: -D*p = 3 = e. ✓
  // Cubic 2X^3 + X^2 - 6X - 3: root -1/2: 2*(-1/8) + 1/4 + 3 - 3 =
  // -1/4 + 1/4 = 0. ✓ — so (2X+1) factor, residue X^2 - 3 (irrational).
  assert(
    formatAlgebra(factor(parseAlgebra('4*X^4 - 13*X^2 + 3'))) ===
      '(2*X - 1)*(2*X + 1)*(X^2 - 3)',
    `factor(4X^4 - 13X^2 + 3) = '${formatAlgebra(factor(parseAlgebra('4*X^4 - 13*X^2 + 3')))}'`);

  // Non-monic with complex quadratic residue: 16X^4 - 1 =
  // (2X-1)(2X+1)(4X^2+1).
  assert(
    formatAlgebra(factor(parseAlgebra('16*X^4 - 1'))) ===
      '(2*X - 1)*(2*X + 1)*(4*X^2 + 1)',
    `factor(16X^4 - 1) = '${formatAlgebra(factor(parseAlgebra('16*X^4 - 1')))}'`);

  // Biquadratic product-of-quadratics detection.
  // X^4 + X^2 + 1 has no rational roots but factors as
  // (X^2 + X + 1)(X^2 - X + 1) over Z.
  assert(
    formatAlgebra(factor(parseAlgebra('X^4 + X^2 + 1'))) ===
      '(X^2 + X + 1)*(X^2 - X + 1)',
    `factor(X^4 + X^2 + 1) = '${formatAlgebra(factor(parseAlgebra('X^4 + X^2 + 1')))}'`);

  // Irrational roots — X^4 - 2 has no rational roots (and even-only
  // coefs so the cubes branch doesn't apply).  Pass-through.
  assert(
    formatAlgebra(factor(parseAlgebra('X^4 - 2'))) === 'X^4 - 2',
    `factor(X^4 - 2) pass-through`);

  // Integration with X-GCD pull: X^5 - 5X^3 + 4X = X·(X^4 - 5X^2 + 4).
  assert(
    formatAlgebra(factor(parseAlgebra('X^5 - 5*X^3 + 4*X'))) ===
      'X*(X - 1)*(X + 1)*(X - 2)*(X + 2)',
    `factor(X·biquadratic) = '${formatAlgebra(factor(parseAlgebra('X^5 - 5*X^3 + 4*X')))}'`);

  // Integration with scalar GCD: 2X^4 - 10X^2 + 8 =
  //   2·(X^4 - 5X^2 + 4) = 2·(X-1)(X+1)(X-2)(X+2).
  assert(
    formatAlgebra(factor(parseAlgebra('2*X^4 - 10*X^2 + 8'))) ===
      '2*(X - 1)*(X + 1)*(X - 2)*(X + 2)',
    `factor(2·biquadratic) = '${formatAlgebra(factor(parseAlgebra('2*X^4 - 10*X^2 + 8')))}'`);
}

// --- simplify: (u^m)^n collapse ------------------
{
  const { simplify, parseAlgebra, deriv } = await import('../www/src/rpl/algebra.js');
  assert(formatAlgebra(simplify(parseAlgebra('(X^2)^3'))) === 'X^6',
         `simplify (X^2)^3 = X^6`);
  assert(formatAlgebra(simplify(parseAlgebra('(A^2)^3'))) === 'A^6',
         `simplify (A^2)^3 = A^6`);
  // Negative inner exponent still collapses by product (we're purely
  // structural — no branch-cut concerns for the polynomial slice).
  assert(formatAlgebra(simplify(parseAlgebra('(X^3)^2'))) === 'X^6',
         `simplify (X^3)^2 = X^6`);
  // Chain-rule cleanup: ATAN(X^2)' = 2*X / (X^4 + 1) rather than the
  // unsimplified (X^2)^2 + 1.
  assert(formatAlgebra(deriv(parseAlgebra('ATAN(X^2)'), 'X')) ===
         '2*X/(X^4 + 1)',
         `deriv ATAN(X^2) = 2*X/(X^4 + 1)`);
}

// --- SOLVE: linear / quadratic / via-FACTOR roots -----
// Direct tests of algebraSolve (bypass the op harness).  Covers:
//   - plain-expression input  (expr = 0 implied)
//   - equation input          (Bin('=', L, R) → L - R = 0)
//   - linear roots
//   - quadratic with rational, double, surd, and complex roots
//   - cubic / quartic routed through FACTOR
{
  const { solve } = await import('../www/src/rpl/algebra.js');
  const fmt = (roots) =>
    roots.map(r => formatAlgebra(r)).join(' | ');

  // Linear expr = 0.
  assert(fmt(solve(parseAlgebra('X + 3'), 'X')) === 'X = -3',
         `solve(X+3=0, X)`);
  assert(fmt(solve(parseAlgebra('2*X - 4'), 'X')) === 'X = 2',
         `solve(2X-4=0, X)`);
  // Equation form.
  assert(fmt(solve(parseAlgebra('X = 3'), 'X')) === 'X = 3',
         `solve(X=3, X)`);
  assert(fmt(solve(parseAlgebra('X + 1 = 7'), 'X')) === 'X = 6',
         `solve(X+1=7, X)`);
  // Linear with rational root.
  assert(fmt(solve(parseAlgebra('3*X + 2'), 'X')) === 'X = -(2/3)',
         `solve(3X+2=0, X) = -2/3 (got '${fmt(solve(parseAlgebra('3*X + 2'), 'X'))}')`);

  // Quadratic with integer roots.  Emits larger root first.
  assert(fmt(solve(parseAlgebra('X^2 - 4'), 'X')) === 'X = 2 | X = -2',
         `solve(X^2-4=0, X)`);
  assert(fmt(solve(parseAlgebra('X^2 + X - 6'), 'X')) === 'X = 2 | X = -3',
         `solve(X^2+X-6=0, X)`);

  // Double root.
  assert(fmt(solve(parseAlgebra('X^2 + 2*X + 1'), 'X')) === 'X = -1',
         `solve((X+1)^2=0, X) is a single root`);

  // Quadratic with rational roots via non-monic leading coef.
  // 2X^2 - 3X + 1 = (2X - 1)(X - 1) → roots 1 and 1/2.
  {
    const out = fmt(solve(parseAlgebra('2*X^2 - 3*X + 1'), 'X'));
    assert(out === 'X = 1 | X = 1/2', `solve(2X^2-3X+1=0, X) got '${out}'`);
  }

  // Quadratic with pure surd roots (no linear term).
  assert(fmt(solve(parseAlgebra('X^2 - 2'), 'X')) ===
         'X = SQRT(2) | X = -SQRT(2)',
         `solve(X^2-2=0, X)`);
  assert(fmt(solve(parseAlgebra('X^2 - 8'), 'X')) ===
         'X = 2*SQRT(2) | X = -2*SQRT(2)',
         `solve(X^2-8=0, X) got '${fmt(solve(parseAlgebra('X^2 - 8'), 'X'))}'`);

  // Quadratic with surd roots AND a linear term.
  assert(fmt(solve(parseAlgebra('X^2 + X - 1'), 'X')) ===
         'X = (-1 + SQRT(5))/2 | X = (-1 - SQRT(5))/2',
         `solve(X^2+X-1=0, X)`);

  // Complex conjugate pair when D < 0.  The imaginary unit is
  // `Var('i')` (HP50 symbolic convention).  Output formats use the
  // standard `(-b ± i·√|D|)/(2a)` shape, reduced.
  assert(fmt(solve(parseAlgebra('X^2 + 1'), 'X')) === 'X = i | X = -i',
         `solve(X^2+1=0, X) → ±i`);
  assert(fmt(solve(parseAlgebra('X^2 + 4'), 'X')) === 'X = 2*i | X = -2*i',
         `solve(X^2+4=0, X) → ±2i`);
  assert(fmt(solve(parseAlgebra('X^2 - 2*X + 5'), 'X')) ===
         'X = 1 + 2*i | X = 1 - 2*i',
         `solve(X^2-2X+5=0, X) → 1 ± 2i`);
  // Quadratic branch uses SQRT(f)·i tail order (not i·SQRT(f)) to match
  // the D-K branch's common-denom packaging.
  assert(fmt(solve(parseAlgebra('X^2 + X + 1'), 'X')) ===
         'X = (-1 + SQRT(3)*i)/2 | X = (-1 - SQRT(3)*i)/2',
         `solve(X^2+X+1=0, X) → (-1 ± √3·i)/2`);
  assert(fmt(solve(parseAlgebra('2*X^2 + 2*X + 1'), 'X')) ===
         'X = (-1 + i)/2 | X = (-1 - i)/2',
         `solve(2X^2+2X+1=0, X) → (-1 ± i)/2`);

  // Equation form with reduction: X^2 = X → roots 1, 0.
  assert(fmt(solve(parseAlgebra('X^2 = X'), 'X')) === 'X = 1 | X = 0',
         `solve(X^2=X, X)`);

  // Cubic routed through FACTOR.
  assert(fmt(solve(parseAlgebra('X^3 - 6*X^2 + 11*X - 6'), 'X')) ===
         'X = 1 | X = 3 | X = 2',
         `solve(cubic with integer roots, X)`);

  // Quartic via FACTOR → four integer roots.
  assert(fmt(solve(parseAlgebra('X^4 - 5*X^2 + 4'), 'X')) ===
         'X = 1 | X = -1 | X = 2 | X = -2',
         `solve(X^4 - 5X^2 + 4 = 0, X)`);

  // Numeric fallback (real from bisection, complex from Durand-Kerner).
  // SOLVE finds all roots.  These tests check that real roots are
  // still exact, and that the complex roots appear as Num-valued
  // `re + |im|*i` / `re - |im|*i` AST pairs.
  {
    const rr = solve(parseAlgebra('X^4 - 2'), 'X');
    // Two real ±2^(1/4), plus two pure-imaginary ±2^(1/4)·i.
    assert(rr && rr.length === 4, `solve(X^4-2, X) → 4 roots, got ${rr.length}`);
    const realPart = rr.map(r => r.r);
    const realAs = realPart.filter(a => a && a.kind === 'num').map(a => a.value);
    const want = Math.pow(2, 0.25);
    assert(realAs.some(v => Math.abs(v - want) < 1e-6) &&
           realAs.some(v => Math.abs(v + want) < 1e-6),
      `solve(X^4-2, X) contains ±2^(1/4), got ${realAs}`);
  }
  {
    // Cubic with one real root + one conjugate complex pair.
    const rr = solve(parseAlgebra('X^3 + X - 1'), 'X');
    assert(rr && rr.length === 3,
      `solve(X^3+X-1, X) → 3 roots (1 real + 1 complex pair), got ${rr.length}`);
    // The first root should be the real one.
    const v = rr[0].r.value;
    assert(Math.abs(v - 0.6823278038280194) < 1e-6,
           `solve(X^3+X-1, X) real root = ${v}`);
  }
  {
    // Mixed: FACTOR yields a rational root + irreducible quadratic
    // with real roots.  SOLVE combines the exact rational with the
    // square-root closed form of ±√2.
    //
    // The numeric solver routes through `_scalarClosedForm` first, so
    // numeric ±√2 round-trips back to `Fn('SQRT', [Num(2)])` /
    // `Neg(Fn('SQRT', [Num(2)]))`.  The rational root stays Num; the
    // irrational roots come out as the SQRT-shape AST.
    const rr = solve(parseAlgebra('X^3 - X^2 - 2*X + 2'), 'X');
    assert(rr && rr.length === 3, `solve cubic mixed → 3 roots, got ${rr.length}`);
    const strs = rr.map(r => formatAlgebra(r));
    assert(strs.some(s => s === 'X = 1'), `solve mixed keeps X=1: got ${strs}`);
    assert(strs.some(s => s === 'X = SQRT(2)'),
      `solve mixed yields X = SQRT(2): got ${strs}`);
    assert(strs.some(s => s === 'X = -SQRT(2)'),
      `solve mixed yields X = -SQRT(2): got ${strs}`);
  }
  {
    // Three-real-root casus irreducibilis — no rational root,
    // all three roots real and irrational.
    const rr = solve(parseAlgebra('X^3 - 3*X + 1'), 'X');
    assert(rr && rr.length === 3,
      `solve(X^3-3X+1, X) → 3 real roots, got ${rr.length}`);
    // Product ≈ -1 (Vieta: -d/a = -1/1 = -1)
    const prod = rr.map(r => r.r.value).reduce((a, b) => a * b, 1);
    assert(Math.abs(prod - (-1)) < 1e-6,
      `solve(X^3-3X+1) root product ≈ -1, got ${prod}`);
  }
}

// --- SOLVE op: stack integration ------------------------------
// SOLVE routes through Giac's solve(expr,var) — the reply is a list
// literal of roots which `splitGiacList` splits and we re-wrap each
// root as a `var = root` equation.  Each block registers a fixture
// for the caseval command the op emits.
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2 - 4')));
  s.push(Name('X'));
  giac._clear();
  giac._setFixture('purge(X);solve(X^2-4,X)', '[2,-2]');
  lookup('SOLVE').fn(s);
  const top = s.peek();
  assert(top && top.type === 'list' && top.items.length === 2,
         `SOLVE op: X^2-4 returns list of 2 roots`);
  assert(isSymbolic(top.items[0]) &&
         formatAlgebra(top.items[0].expr) === 'X = 2',
         `SOLVE op: first root is X=2`);
  assert(isSymbolic(top.items[1]) &&
         formatAlgebra(top.items[1].expr) === 'X = -2',
         `SOLVE op: second root is X=-2`);
  giac._clear();
}
{
  // Linear via equation form.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('2*X + 6 = 0')));
  s.push(Name('X'));
  giac._clear();
  giac._setFixture('purge(X);solve(2*X+6=0,X)', '[-3]');
  lookup('SOLVE').fn(s);
  const top = s.peek();
  assert(top && top.type === 'list' && top.items.length === 1 &&
         isSymbolic(top.items[0]) &&
         formatAlgebra(top.items[0].expr) === 'X = -3',
         `SOLVE op: 2X+6=0 → X=-3`);
  giac._clear();
}
{
  // Complex conjugate pair.  X^2 + 1 = 0 → {±i}.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2 + 1')));
  s.push(Name('X'));
  giac._clear();
  giac._setFixture('purge(X);solve(X^2+1,X)', '[i,-i]');
  lookup('SOLVE').fn(s);
  const top = s.peek();
  assert(top && top.type === 'list' && top.items.length === 2 &&
         formatAlgebra(top.items[0].expr) === 'X = i' &&
         formatAlgebra(top.items[1].expr) === 'X = -i',
         `SOLVE op: X^2+1 → {±i}`);
  giac._clear();
}
{
  // Variable as String works too.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('Y - 7')));
  s.push(Str('Y'));
  giac._clear();
  giac._setFixture('purge(Y);solve(Y-7,Y)', '[7]');
  lookup('SOLVE').fn(s);
  const top = s.peek();
  assert(top && top.type === 'list' && top.items.length === 1 &&
         formatAlgebra(top.items[0].expr) === 'Y = 7',
         `SOLVE op: accepts String 'Y' as var`);
  giac._clear();
}

// --- FACTOR: EXPAND round-trip for quartic ---
{
  const { factor, expand, evalAst } = await import('../www/src/rpl/algebra.js');
  const check = (src) => {
    const orig = parseAlgebra(src);
    const factored = factor(orig);
    const re = expand(factored);
    for (const x of [0, 1, 2, -1, 5, -3, 7]) {
      const lookup = name => name === 'X' ? x : null;
      const a = evalAst(orig, lookup);
      const b = evalAst(re, lookup);
      assert(a.kind === 'num' && b.kind === 'num' && a.value === b.value,
             `EXPAND(FACTOR(${src})) value mismatch at X=${x}: ${a.value} vs ${b.value}`);
    }
  };
  check('X^4 - 5*X^2 + 4');
  check('X^4 - 1');
  check('X^4 - 4*X^3 + 6*X^2 - 4*X + 1');    // (X-1)^4
  check('X^4 - 5*X^3 + 9*X^2 - 7*X + 2');    // (X-1)^3(X-2)
  check('X^4 + X^3 - X - 1');                 // mixed real + complex quad
  check('4*X^4 - 13*X^2 + 3');                // non-monic with irrational residue
  check('16*X^4 - 1');                         // complex quadratic residue
  check('2*X^4 - 10*X^2 + 8');                // scalar GCD + biquadratic
  // EXPAND(FACTOR(x)) round-trip must hold for the product-of-quadratics
  // factoring too.
  check('X^4 + X^2 + 1');                     // (X^2+X+1)(X^2-X+1)
  check('X^4 + 4');                            // Sophie Germain
  check('X^4 + 2*X^2 + 1');                    // (X^2+1)^2
  check('X^4 + 3*X^2 + 2');                    // (X^2+1)(X^2+2)
  check('X^4 - X^2 - 2');                      // (X^2+1)(X^2-2)
}

// --- FACTOR biquadratic product-of-quadratics detection.
//     Targets quartics with no rational root that still factor over Z
//     into two monic quadratics.
{
  const { factor } = await import('../www/src/rpl/algebra.js');
  const eq = (src, want) => {
    const got = formatAlgebra(factor(parseAlgebra(src)));
    assert(got === want, `factor(${src}) → '${got}' (want '${want}')`);
  };
  eq('X^4 + X^2 + 1', '(X^2 + X + 1)*(X^2 - X + 1)');
  eq('X^4 + 4',       '(X^2 + 2*X + 2)*(X^2 - 2*X + 2)');
  eq('X^4 + 2*X^2 + 1', '(X^2 + 1)^2');         // repeat collapsed
  eq('X^4 + 3*X^2 + 2', '(X^2 + 1)*(X^2 + 2)');
  eq('X^4 - X^2 - 2',   '(X^2 + 1)*(X^2 - 2)');  // mixed sign, no rational root
  // X^4 + X^3 + X^2 + X + 1 is the 5th cyclotomic — irreducible over Z.
  // Must remain unfactored (neither rational-root nor quadratic-pair
  // search finds anything).
  eq('X^4 + X^3 + X^2 + X + 1', 'X^4 + X^3 + X^2 + X + 1');
  // X^4 - 2 has irrational roots ±2^(1/4) and no quadratic pair over Z
  // (would need √2 in the constant).  Still pass-through.
  eq('X^4 - 2', 'X^4 - 2');
}

// --- Non-monic biquadratic FACTOR.  Extends the quadratic-pair search
//     beyond the a = 1 monic case to quartics with a leading integer > 1
//     that don't GCD-reduce to monic.  Typical hits: 4X⁴+1 (Sophie
//     Germain analog, a=4), 9X⁴-1 (difference of squares, a=9),
//     (aX²+c)² = a²X⁴+2acX²+c².
{
  const { factor } = await import('../www/src/rpl/algebra.js');
  const eq = (src, want) => {
    const got = formatAlgebra(factor(parseAlgebra(src)));
    assert(got === want, `factor(${src}) → '${got}' (want '${want}')`);
  };

  // 4X⁴ + 1 = (2X² + 2X + 1)(2X² - 2X + 1) — Sophie Germain analog.
  eq('4*X^4 + 1', '(2*X^2 + 2*X + 1)*(2*X^2 - 2*X + 1)');

  // Repeat non-monic quadratic collapses via `^2`.
  eq('4*X^4 - 4*X^2 + 1', '(2*X^2 - 1)^2');     // (2X² - 1)²
  eq('4*X^4 + 4*X^2 + 1', '(2*X^2 + 1)^2');     // (2X² + 1)²

  // Difference of squares (classical): 9X⁴ - 1 = (3X² - 1)(3X² + 1).
  // Factor order follows the scan order — positive-q first.
  eq('9*X^4 - 1', '(3*X^2 + 1)*(3*X^2 - 1)');

  // Two-factor non-monic with mixed leading coefs.
  eq('2*X^4 + 3*X^2 + 1', '(X^2 + 1)*(2*X^2 + 1)');
  eq('6*X^4 + 5*X^2 + 1', '(2*X^2 + 1)*(3*X^2 + 1)');

  // Regression: GCD-reducible input still reduces to monic first, then
  // the monic path handles it.  `2*X^4 + 2*X^2 + 2` → content 2, residue
  // X^4+X²+1 factors to (X²+X+1)(X²-X+1), outer scalar preserved.
  eq('2*X^4 + 2*X^2 + 2', '2*(X^2 + X + 1)*(X^2 - X + 1)');

  // Round-trip check: FACTOR then EXPAND recovers the original on each
  // of the non-monic hits.  Exercises the AST-build path with non-1
  // leading Num in quads.
  const { expand, evalAst, replaceVar } = await import('../www/src/rpl/algebra.js');
  const roundTrip = (src) => {
    const orig = parseAlgebra(src);
    const f = factor(orig);
    for (const xv of [-3, -1, 0, 1, 2, 5]) {
      const a = evalAst(replaceVar(orig, 'X', { kind: 'num', value: xv }),
                         () => undefined);
      const b = evalAst(replaceVar(f,    'X', { kind: 'num', value: xv }),
                         () => undefined);
      assert(a.kind === 'num' && b.kind === 'num' &&
             Math.abs(a.value - b.value) < 1e-9,
        `round-trip ${src} at X=${xv}: ${a.value} vs ${b.value}`);
    }
  };
  roundTrip('4*X^4 + 1');
  roundTrip('9*X^4 - 1');
  roundTrip('4*X^4 - 4*X^2 + 1');
  roundTrip('4*X^4 + 4*X^2 + 1');
  roundTrip('2*X^4 + 3*X^2 + 1');
  roundTrip('6*X^4 + 5*X^2 + 1');

  // Pass-through: 2X⁴ + X² + 1 has no rational root and the quadratic-
  // pair search finds nothing over ℤ (the discriminant doesn't land on
  // an integer solution for any divisor pairing), so it stays as-is.
  eq('2*X^4 + X^2 + 1', '2*X^4 + X^2 + 1');
}

// --- SOLVE — Durand-Kerner numeric fallback for complex roots of
//     polynomials degree ≥ 3.  Complements real-root bisection so
//     `realPower` roots are always returned.
{
  const { solve } = await import('../www/src/rpl/algebra.js');

  // The solve() cubic/quartic branch emits closed-form surds
  // (e.g. `1/2 + SQRT(3)/2*i` for X^3+1).  To keep these assertions
  // shape-agnostic we evaluate the AST numerically in complex
  // arithmetic.  The 'i' variable is the imaginary unit (HP50 convention).
  const classifyRoot = (ast) => {
    const ev = (node) => {
      if (!node) return null;
      if (node.kind === 'num') return { re: node.value, im: 0 };
      if (node.kind === 'var') {
        if (node.name === 'i') return { re: 0, im: 1 };
        return null;
      }
      if (node.kind === 'neg') {
        const a = ev(node.arg);
        return a ? { re: -a.re, im: -a.im } : null;
      }
      if (node.kind === 'fn' && node.name === 'SQRT' && node.args.length === 1) {
        const a = ev(node.args[0]);
        if (!a || a.im !== 0 || a.re < 0) return null;
        return { re: Math.sqrt(a.re), im: 0 };
      }
      // Cube-root closed form emits `XROOT(f, 3)`.
      if (node.kind === 'fn' && node.name === 'XROOT' && node.args.length === 2) {
        const a = ev(node.args[0]), n = ev(node.args[1]);
        if (!a || !n || a.im !== 0 || n.im !== 0 || n.re === 0) return null;
        return { re: Math.sign(a.re) * Math.pow(Math.abs(a.re), 1 / n.re), im: 0 };
      }
      if (node.kind === 'bin') {
        const a = ev(node.l), b = ev(node.r);
        if (!a || !b) return null;
        if (node.op === '+') return { re: a.re + b.re, im: a.im + b.im };
        if (node.op === '-') return { re: a.re - b.re, im: a.im - b.im };
        if (node.op === '*') return {
          re: a.re * b.re - a.im * b.im,
          im: a.re * b.im + a.im * b.re,
        };
        if (node.op === '/') {
          const d = b.re * b.re + b.im * b.im;
          if (d === 0) return null;
          return {
            re: (a.re * b.re + a.im * b.im) / d,
            im: (a.im * b.re - a.re * b.im) / d,
          };
        }
        if (node.op === '^') {
          if (a.im !== 0 || b.im !== 0) return null;
          return { re: Math.pow(a.re, b.re), im: 0 };
        }
      }
      return null;
    };
    return ev(ast);
  };

  // X^3 + 1 = (X+1)(X^2-X+1): one real, conjugate complex pair.
  {
    const rr = solve(parseAlgebra('X^3 + 1'), 'X');
    assert(rr && rr.length === 3, `solve(X^3+1): 3 roots, got ${rr && rr.length}`);
    const cs = rr.map(r => classifyRoot(r.r));
    assert(cs.every(c => c !== null), `solve(X^3+1): all roots classified`);
    const reals    = cs.filter(c => Math.abs(c.im) < 1e-6);
    const complex  = cs.filter(c => Math.abs(c.im) > 1e-6);
    assert(reals.length === 1 && Math.abs(reals[0].re + 1) < 1e-6,
      `solve(X^3+1): real root = -1`);
    assert(complex.length === 2, `solve(X^3+1): 2 complex roots`);
    // Conjugate pair around re=1/2, im=±√3/2.
    assert(complex.every(c => Math.abs(c.re - 0.5) < 1e-6),
      `solve(X^3+1): complex re = 0.5`);
    assert(complex.some(c => Math.abs(c.im - Math.sqrt(3)/2) < 1e-6) &&
           complex.some(c => Math.abs(c.im + Math.sqrt(3)/2) < 1e-6),
      `solve(X^3+1): ±i·√3/2`);
  }

  // X^4 + 1: no real roots, four complex.
  {
    const rr = solve(parseAlgebra('X^4 + 1'), 'X');
    assert(rr && rr.length === 4, `solve(X^4+1): 4 roots, got ${rr && rr.length}`);
    const cs = rr.map(r => classifyRoot(r.r));
    assert(cs.every(c => c !== null && Math.abs(c.im) > 1e-6),
      `solve(X^4+1): all four roots are complex (no real)`);
    // All roots should have |z| = 1, re = ±√2/2.
    const sqrt2over2 = Math.sqrt(2) / 2;
    assert(cs.every(c => Math.abs(c.re * c.re + c.im * c.im - 1) < 1e-6),
      `solve(X^4+1): all roots on unit circle`);
    assert(cs.filter(c => Math.abs(c.re - sqrt2over2) < 1e-6).length === 2 &&
           cs.filter(c => Math.abs(c.re + sqrt2over2) < 1e-6).length === 2,
      `solve(X^4+1): re components ±√2/2 appear in pairs`);
  }

  // X^4 - 2: two real ±2^(1/4), two pure-imaginary ±2^(1/4)·i.
  {
    const rr = solve(parseAlgebra('X^4 - 2'), 'X');
    assert(rr && rr.length === 4, `solve(X^4-2): 4 roots, got ${rr && rr.length}`);
    const cs = rr.map(r => classifyRoot(r.r));
    const q14 = Math.pow(2, 0.25);
    assert(cs.some(c => Math.abs(c.re - q14) < 1e-6 && Math.abs(c.im) < 1e-6),
      `solve(X^4-2): real root +2^(1/4)`);
    assert(cs.some(c => Math.abs(c.re + q14) < 1e-6 && Math.abs(c.im) < 1e-6),
      `solve(X^4-2): real root -2^(1/4)`);
    assert(cs.some(c => Math.abs(c.re) < 1e-6 && Math.abs(c.im - q14) < 1e-6),
      `solve(X^4-2): imaginary root +2^(1/4)·i`);
    assert(cs.some(c => Math.abs(c.re) < 1e-6 && Math.abs(c.im + q14) < 1e-6),
      `solve(X^4-2): imaginary root -2^(1/4)·i`);
  }

  // X^4 + 4 = (X^2-2X+2)(X^2+2X+2) — factor() nails the product-of-
  // quadratics, but _rootsFromFactored only reads linear factors, so
  // SOLVE falls through and Durand-Kerner finds all four roots:
  // 1±i, -1±i.
  {
    const rr = solve(parseAlgebra('X^4 + 4'), 'X');
    assert(rr && rr.length === 4, `solve(X^4+4): 4 roots, got ${rr && rr.length}`);
    const cs = rr.map(r => classifyRoot(r.r));
    const want = [[1,1],[1,-1],[-1,1],[-1,-1]];
    for (const [wr, wi] of want) {
      assert(cs.some(c => Math.abs(c.re - wr) < 1e-6 && Math.abs(c.im - wi) < 1e-6),
        `solve(X^4+4): has ${wr}${wi>=0?'+':''}${wi}i`);
    }
  }

  // Cubic X^3 - 2: one real 2^(1/3), plus a conjugate pair.
  {
    const rr = solve(parseAlgebra('X^3 - 2'), 'X');
    assert(rr && rr.length === 3, `solve(X^3-2): 3 roots`);
    const cs = rr.map(r => classifyRoot(r.r));
    const cbrt2 = Math.cbrt(2);
    assert(cs.some(c => Math.abs(c.re - cbrt2) < 1e-6 && Math.abs(c.im) < 1e-6),
      `solve(X^3-2): real root 2^(1/3)`);
    const cplx = cs.filter(c => Math.abs(c.im) > 1e-6);
    assert(cplx.length === 2 &&
           Math.abs(cplx[0].re + cplx[1].re - 2 * (-cbrt2 / 2)) < 1e-6,
      `solve(X^3-2): complex pair re = -cbrt2/2`);
  }
}

// --- Closed-form surd detection for Durand-Kerner output.  Roots like
//     (1 ± i·√3)/2 print with exact surds.  We check the emitted AST
//     shape via formatAlgebra so the test fails loudly if someone
//     reverts the closed-form pass.
{
  const { solve } = await import('../www/src/rpl/algebra.js');

  // Helper: get the set of root RHS strings from `solve(poly, X)`.
  const rootStrs = (poly) => {
    const rr = solve(parseAlgebra(poly), 'X');
    return (rr || []).map(r => formatAlgebra(r.r));
  };

  // X^3 + 1 conjugate pair → `(1 ± SQRT(3)*i)/2` (common-denom
  // packaging groups the shared /2 denominator).
  {
    const ss = rootStrs('X^3 + 1');
    assert(ss.includes('(1 + SQRT(3)*i)/2'),
      `solve(X^3+1): has '(1 + SQRT(3)*i)/2' — got ${JSON.stringify(ss)}`);
    assert(ss.includes('(1 - SQRT(3)*i)/2'),
      `solve(X^3+1): has '(1 - SQRT(3)*i)/2' — got ${JSON.stringify(ss)}`);
    assert(!ss.some(s => /\d+\.\d/.test(s)),
      `solve(X^3+1): no decimal approximations — got ${JSON.stringify(ss)}`);
  }

  // X^3 - 1 conjugate pair → `(-1 ± SQRT(3)*i)/2` (common-denom packaging).
  {
    const ss = rootStrs('X^3 - 1');
    assert(ss.includes('(-1 + SQRT(3)*i)/2'),
      `solve(X^3-1): has '(-1 + SQRT(3)*i)/2' — got ${JSON.stringify(ss)}`);
    assert(ss.includes('(-1 - SQRT(3)*i)/2'),
      `solve(X^3-1): has '(-1 - SQRT(3)*i)/2' — got ${JSON.stringify(ss)}`);
  }

  // X^4 + 1 → `(±SQRT(2) ± SQRT(2)*i)/2` — all four roots closed-form
  // and now packaged with the common /2 denominator.
  {
    const ss = rootStrs('X^4 + 1');
    assert(ss.every(s => s.includes('/2') && s.includes('SQRT(2)')),
      `solve(X^4+1): every root has shared /2 and SQRT(2) — got ${JSON.stringify(ss)}`);
    assert(!ss.some(s => /\d\.\d/.test(s)),
      `solve(X^4+1): no decimal approximations — got ${JSON.stringify(ss)}`);
  }

  // X^4 + 4 → ±1 ± i (both components are plain integers).
  {
    const ss = rootStrs('X^4 + 4');
    for (const want of ['1 + i', '-1 + i', '1 - i', '-1 - i']) {
      assert(ss.some(s => s.includes(want)),
        `solve(X^4+4): has '${want}' — got ${JSON.stringify(ss)}`);
    }
  }

  // X^6 - 1 → ±1, (±1 ± SQRT(3)*i)/2   (common-denom packaging).
  {
    const ss = rootStrs('X^6 - 1');
    assert(ss.length === 6, `solve(X^6-1): 6 roots`);
    assert(ss.includes('1') && ss.includes('-1'),
      `solve(X^6-1): contains ±1`);
    const complexCount = ss.filter(s => s.includes('SQRT(3)*i') && s.endsWith('/2')).length;
    assert(complexCount === 4,
      `solve(X^6-1): 4 complex roots packaged as (.. ± SQRT(3)*i)/2 — got ${JSON.stringify(ss)}`);
  }

  // X^4 - 2: roots are ±2^(1/4) and ±2^(1/4)·i — NOT a simple surd,
  // so closed-form detection MUST fall back to numeric.
  {
    const ss = rootStrs('X^4 - 2');
    assert(ss.some(s => /1\.189207/.test(s)),
      `solve(X^4-2): numeric 2^(1/4) ≈ 1.189207 present — got ${JSON.stringify(ss)}`);
    // No spurious "SQRT(..)" in the output — 2^(1/4) isn't a surd.
    assert(!ss.some(s => s.includes('SQRT(')),
      `solve(X^4-2): no false-positive SQRT in output — got ${JSON.stringify(ss)}`);
  }

  // X^3 - 2: the real root is `XROOT(2,3)` (cube-root closed form).
  // A specialised branch emits the complex conjugate pair in closed
  // form too — the SQRT(3) there is intentional (it's the √3 in
  // ω = (-1 + i√3)/2), not a false positive from `_scalarClosedForm`.
  // The guard here is narrowed to the REAL root specifically: it must
  // remain a pure XROOT with no SQRT.
  {
    const ss = rootStrs('X^3 - 2');
    const realRoots = ss.filter(s => !s.includes('*i') && !s.endsWith('i') && !s.endsWith('i)'));
    assert(realRoots.some(s => s === 'XROOT(2,3)'),
      `solve(X^3-2): real root is XROOT(2,3) — got ${JSON.stringify(ss)}`);
    assert(!realRoots.some(s => s.includes('SQRT(')),
      `solve(X^3-2): real root contains no false-positive SQRT — got ${JSON.stringify(ss)}`);
  }

  // Sanity check the internals directly via solve on an easy quartic:
  // X^4 + X^2 - 2 = (X-1)(X+1)(X²+2).  The quadratic factor gives
  // pure-imaginary roots ±i·√2, which FACTOR+_rootsFromFactored won't
  // read (it only reads linear factors) — so the D-K branch runs and
  // its output should show SQRT(2)·i closed-form.
  {
    const ss = rootStrs('X^4 + X^2 - 2');
    assert(ss.includes('1') && ss.includes('-1'),
      `solve(X^4+X^2-2): has ±1 real roots`);
    // Imaginary roots = ±SQRT(2)*i.  Formatter has options for how to
    // render pure-imaginary — accept any of a few canonical shapes.
    const hasSqrt2i = ss.some(s => /SQRT\(2\)\s*\*\s*i/.test(s));
    assert(hasSqrt2i,
      `solve(X^4+X^2-2): pure-imaginary root SQRT(2)*i present — got ${JSON.stringify(ss)}`);
  }
}

// --- Direct unit tests on _rationalReconstruct / _surdReconstruct
//     internals via a round-trip through solve().  We rely on public
//     behaviour: when _surdReconstruct recognises a value it emits
//     SQRT(f); otherwise the decimal approximation appears.  These
//     cases exercise the boundary carefully.
{
  const { solve } = await import('../www/src/rpl/algebra.js');

  // X^2 + X + 1 is handled by the quadratic branch, not the D-K path —
  // but its output is the reference format we want the cubic/quartic
  // output to resemble.  Double-check.
  {
    const rr = solve(parseAlgebra('X^2 + X + 1'), 'X');
    const ss = rr.map(r => formatAlgebra(r.r));
    assert(ss.every(s => s.includes('SQRT(3)')),
      `X^2+X+1 quadratic branch emits SQRT(3) — got ${JSON.stringify(ss)}`);
  }

  // X^3 + 8 = (X+2)(X²-2X+4).  Complex roots = 1 ± i·√3.  Cubic path.
  {
    const rr = solve(parseAlgebra('X^3 + 8'), 'X');
    const ss = rr.map(r => formatAlgebra(r.r));
    assert(ss.includes('-2'), `solve(X^3+8): real root -2`);
    // Complex pair is (1 ± i·√3).  Our D-K output format → "1 + SQRT(3)*i".
    assert(ss.some(s => /1 \+ SQRT\(3\)\*i/.test(s) ||
                        /SQRT\(3\)\*i.*\+ 1/.test(s)),
      `solve(X^3+8): has 1 + SQRT(3)*i — got ${JSON.stringify(ss)}`);
    assert(ss.some(s => /1 - SQRT\(3\)\*i/.test(s)),
      `solve(X^3+8): has 1 - SQRT(3)*i — got ${JSON.stringify(ss)}`);
  }
}

// --- Deflate-then-Durand-Kerner.  After the real-root passes
//     (FACTOR + bisection) find real roots, solve() synthetic-divides
//     them out of the coefficient vector before running D-K on the
//     residue.  Observable wins:
//       1.  D-K never has to approximate a real root it would then
//           be told to skip — so a degree-5 polynomial with 3 real
//           roots runs D-K on a degree-2 residue, not the full 5.
//       2.  No spurious "real approximation as complex" noise gets
//           emitted for real roots with small numerical im.
{
  const { solve } = await import('../www/src/rpl/algebra.js');

  // X^4 - 1 = (X-1)(X+1)(X²+1).  Real roots ±1 from FACTOR, then the
  // residue after deflation is X²+1 whose roots are ±i.
  {
    const rr = solve(parseAlgebra('X^4 - 1'), 'X');
    const ss = rr.map(r => formatAlgebra(r.r));
    assert(ss.length === 4, `solve(X^4-1): 4 roots`);
    assert(ss.includes('1') && ss.includes('-1'),
      `solve(X^4-1): real roots ±1`);
    assert(ss.includes('i') && ss.includes('-i'),
      `solve(X^4-1): complex roots ±i — got ${JSON.stringify(ss)}`);
  }

  // X^5 - X = X·(X-1)·(X+1)·(X²+1).  Three real roots (0, ±1), then the
  // residue after deflation is X²+1 whose roots are ±i.
  {
    const rr = solve(parseAlgebra('X^5 - X'), 'X');
    const ss = rr.map(r => formatAlgebra(r.r));
    assert(ss.length === 5, `solve(X^5-X): 5 roots`);
    assert(ss.includes('0') && ss.includes('1') && ss.includes('-1'),
      `solve(X^5-X): real roots {0, ±1}`);
    assert(ss.includes('i') && ss.includes('-i'),
      `solve(X^5-X): complex roots ±i — got ${JSON.stringify(ss)}`);
  }

  // X^4 - 2 has two numeric real roots ±2^(1/4).  After deflation the
  // residue is X² + √2 whose roots are ±2^(1/4)·i (pure imaginary).
  // Deflation must still work on a numeric-irrational real root.
  {
    const rr = solve(parseAlgebra('X^4 - 2'), 'X');
    const ss = rr.map(r => formatAlgebra(r.r));
    assert(ss.length === 4, `solve(X^4-2): 4 roots`);
    assert(ss.filter(s => /1\.189207/.test(s)).length === 4,
      `solve(X^4-2): 4 roots all ≈ 2^(1/4) magnitude — got ${JSON.stringify(ss)}`);
  }

  // X^3 - 2 has a single real root ∛2.  Emitted as the exact cube-root
  // surd `XROOT(2, 3)` rather than a 12-digit decimal.  Deflation
  // against the numeric real still runs D-K to find the conjugate
  // pair, which remain 12-digit decimals (those would need a mixed
  // ∛·√ closed form we don't have yet).
  {
    const rr = solve(parseAlgebra('X^3 - 2'), 'X');
    const ss = rr.map(r => formatAlgebra(r.r));
    assert(ss.length === 3, `solve(X^3-2): 3 roots`);
    assert(ss.some(s => s === 'XROOT(2,3)'),
      `solve(X^3-2): real root = XROOT(2,3) — got ${JSON.stringify(ss)}`);
    assert(ss.filter(s => /i/.test(s)).length === 2,
      `solve(X^3-2): 2 complex roots — got ${JSON.stringify(ss)}`);
  }

  // Regression check: ensure nothing in the existing degree-≤2 or
  // factor-only paths got broken by the deflation change.
  {
    const rr = solve(parseAlgebra('X^2 - 4'), 'X');
    const ss = rr.map(r => formatAlgebra(r.r));
    assert(ss.includes('2') && ss.includes('-2'),
      `solve(X^2-4): ±2 regression`);
  }
}

// --- Common-denominator packaging for complex roots.  When
//     _scalarClosedForm gives re = p/q and im = r/q (or surd shapes
//     sharing a denominator), _assembleReImAst repackages the pair as
//     a single fraction `(reNum ± imNum·i)/q` instead of
//     `p/q ± r/q·i`.  Quadratic branch uses the same tail-order
//     (`SQRT(f)·i`) so both paths emit structurally identical shapes.
{
  const { solve } = await import('../www/src/rpl/algebra.js');

  // X^3 + 1 — D-K branch, denom=2 common between re=1/2 and im=√3/2.
  {
    const rr = solve(parseAlgebra('X^3 + 1'), 'X');
    const ss = rr.map(r => formatAlgebra(r.r));
    assert(ss.includes('(1 + SQRT(3)*i)/2'),
      `X^3+1 packaged: (1 + SQRT(3)*i)/2 — got ${JSON.stringify(ss)}`);
    assert(ss.includes('(1 - SQRT(3)*i)/2'),
      `X^3+1 packaged: (1 - SQRT(3)*i)/2 — got ${JSON.stringify(ss)}`);
    // No legacy "1/2 + SQRT(3)/2*i" shape.
    assert(!ss.some(s => /1\/2.*SQRT\(3\)\/2/.test(s)),
      `X^3+1: legacy shape eliminated — got ${JSON.stringify(ss)}`);
  }

  // X^3 - 1 — same pattern with negative re=-1/2.
  {
    const rr = solve(parseAlgebra('X^3 - 1'), 'X');
    const ss = rr.map(r => formatAlgebra(r.r));
    assert(ss.includes('(-1 + SQRT(3)*i)/2'),
      `X^3-1 packaged: (-1 + SQRT(3)*i)/2 — got ${JSON.stringify(ss)}`);
    assert(ss.includes('(-1 - SQRT(3)*i)/2'),
      `X^3-1 packaged: (-1 - SQRT(3)*i)/2 — got ${JSON.stringify(ss)}`);
  }

  // X^4 + 1 — re and im both sqrt(2)/2.  Surd/surd common denom.
  {
    const rr = solve(parseAlgebra('X^4 + 1'), 'X');
    const ss = rr.map(r => formatAlgebra(r.r));
    assert(ss.includes('(SQRT(2) + SQRT(2)*i)/2'),
      `X^4+1 packaged: (SQRT(2) + SQRT(2)*i)/2 — got ${JSON.stringify(ss)}`);
    assert(ss.includes('(SQRT(2) - SQRT(2)*i)/2'),
      `X^4+1 packaged: (SQRT(2) - SQRT(2)*i)/2 — got ${JSON.stringify(ss)}`);
    assert(ss.includes('(-SQRT(2) + SQRT(2)*i)/2'),
      `X^4+1 packaged: (-SQRT(2) + SQRT(2)*i)/2 — got ${JSON.stringify(ss)}`);
    assert(ss.includes('(-SQRT(2) - SQRT(2)*i)/2'),
      `X^4+1 packaged: (-SQRT(2) - SQRT(2)*i)/2 — got ${JSON.stringify(ss)}`);
  }

  // X^2 + X + 1 — quadratic branch.  Its output SHAPE matches the D-K
  // branch's (`(reNum ± SQRT(f)·i)/d` with i at the tail).
  {
    const rr = solve(parseAlgebra('X^2 + X + 1'), 'X');
    const ss = rr.map(r => formatAlgebra(r.r));
    assert(ss.includes('(-1 + SQRT(3)*i)/2'),
      `X^2+X+1 quadratic-branch unified: (-1 + SQRT(3)*i)/2 — got ${JSON.stringify(ss)}`);
    assert(ss.includes('(-1 - SQRT(3)*i)/2'),
      `X^2+X+1 quadratic-branch unified: (-1 - SQRT(3)*i)/2 — got ${JSON.stringify(ss)}`);
  }

  // X^3 + 8 — re=1, im=√3·1 (denom=1 so NOT unified; falls through to
  // fallback path).  Expect the non-fractional shape.
  {
    const rr = solve(parseAlgebra('X^3 + 8'), 'X');
    const ss = rr.map(r => formatAlgebra(r.r));
    assert(ss.includes('1 + SQRT(3)*i'),
      `X^3+8: denom=1 keeps flat shape 1 + SQRT(3)*i — got ${JSON.stringify(ss)}`);
    assert(ss.includes('1 - SQRT(3)*i'),
      `X^3+8: denom=1 keeps flat shape 1 - SQRT(3)*i — got ${JSON.stringify(ss)}`);
  }

  // X^4 + 4 — integer re and im (±1 ± i, denom=1), NOT unified.
  {
    const rr = solve(parseAlgebra('X^4 + 4'), 'X');
    const ss = rr.map(r => formatAlgebra(r.r));
    for (const want of ['1 + i', '-1 + i', '1 - i', '-1 - i']) {
      assert(ss.some(s => s === want),
        `X^4+4: root '${want}' (denom=1, not unified) — got ${JSON.stringify(ss)}`);
    }
  }

  // Mixed-denom guard: 2*X^2 + 2*X + 1 → roots (-1 ± i)/2.  Quadratic
  // branch still does its own fraction wrapping; nothing to change.
  {
    const rr = solve(parseAlgebra('2*X^2 + 2*X + 1'), 'X');
    const ss = rr.map(r => formatAlgebra(r.r));
    assert(ss.includes('(-1 + i)/2') && ss.includes('(-1 - i)/2'),
      `2X²+2X+1 quadratic-branch denom=2 unchanged — got ${JSON.stringify(ss)}`);
  }
}

// --- Generalised sum/difference of cubes in X^k.
//     Extends the k=1 cubes identity to any core polynomial of shape
//     `a·X^(3k) + b` with a and |b| perfect cubes.  The recursion into
//     factor() on the two sub-factors further decomposes them when
//     possible — e.g. X^6−1 fully factors to (X−1)(X+1)(X²+X+1)(X²−X+1).
{
  const { factor, expand } = await import('../www/src/rpl/algebra.js');

  const shape = expr => formatAlgebra(factor(parseAlgebra(expr)));
  const expandEq = (a, b) => formatAlgebra(expand(parseAlgebra(a)))
                          === formatAlgebra(expand(parseAlgebra(b)));

  // X^6 − 1 — full decomposition via the cubes identity + linear
  // factor of (X²−1) + quartic factor of (X⁴+X²+1).
  assert(shape('X^6 - 1') === '(X - 1)*(X + 1)*(X^2 + X + 1)*(X^2 - X + 1)',
    `X^6-1 full factorization via cubes in X² — got ${shape('X^6 - 1')}`);
  // X^6 + 1 — (X²+1) and (X⁴−X²+1) both irreducible over ℤ.
  assert(shape('X^6 + 1') === '(X^2 + 1)*(X^4 - X^2 + 1)',
    `X^6+1 sum-of-cubes in X² — got ${shape('X^6 + 1')}`);
  // Sum / difference of cubes with non-trivial q=2.
  assert(shape('X^6 - 8') === '(X^2 - 2)*(X^4 + 2*X^2 + 4)',
    `X^6-8 → (X²-2)(X⁴+2X²+4) — got ${shape('X^6 - 8')}`);
  assert(shape('X^6 + 8') === '(X^2 + 2)*(X^4 - 2*X^2 + 4)',
    `X^6+8 → (X²+2)(X⁴-2X²+4) — got ${shape('X^6 + 8')}`);
  // q=4 — X^6−64 reaches full decomposition since X²−4 further
  // factors and X⁴+4X²+16 splits via the quartic-product pass.
  assert(shape('X^6 - 64') === '(X - 2)*(X + 2)*(X^2 + 2*X + 4)*(X^2 - 2*X + 4)',
    `X^6-64 full decomposition — got ${shape('X^6 - 64')}`);
  assert(shape('X^6 + 64') === '(X^2 + 4)*(X^4 - 4*X^2 + 16)',
    `X^6+64 — got ${shape('X^6 + 64')}`);
  // X^9 generalisation (k=3 in the Y=X^k sense).
  assert(shape('X^9 + 27') === '(X^3 + 3)*(X^6 - 3*X^3 + 9)',
    `X^9+27 sum-of-cubes in X³ — got ${shape('X^9 + 27')}`);
  assert(shape('X^9 - 27') === '(X^3 - 3)*(X^6 + 3*X^3 + 9)',
    `X^9-27 diff-of-cubes in X³ — got ${shape('X^9 - 27')}`);
  // X^9 ± 1 — the linear-in-Y factor recurses further because
  // X³±1 themselves factor via the k=1 cubes branch.
  assert(shape('X^9 + 1') === '(X + 1)*(X^2 - X + 1)*(X^6 - X^3 + 1)',
    `X^9+1 recursive decomposition — got ${shape('X^9 + 1')}`);
  assert(shape('X^9 - 1') === '(X - 1)*(X^2 + X + 1)*(X^6 + X^3 + 1)',
    `X^9-1 recursive decomposition — got ${shape('X^9 - 1')}`);
  // Non-monic leading X^(3k).
  assert(shape('8*X^6 + 1') === '(2*X^2 + 1)*(4*X^4 - 2*X^2 + 1)',
    `8X^6+1 non-monic cubes — got ${shape('8*X^6 + 1')}`);
  assert(shape('27*X^6 - 8') === '(3*X^2 - 2)*(9*X^4 + 6*X^2 + 4)',
    `27X^6-8 non-monic cubes — got ${shape('27*X^6 - 8')}`);
  // X^12 — cubes of X^4.  linear factor X^4−1 further factors to
  // (X−1)(X+1)(X²+1); quadratic X^8+X^4+1 stays as-is (no further
  // rational integer factorization in our current passes).
  assert(shape('X^12 - 1') === '(X - 1)*(X + 1)*(X^2 + 1)*(X^8 + X^4 + 1)',
    `X^12-1 via cubes in X^4 — got ${shape('X^12 - 1')}`);
  assert(shape('X^12 + 1') === '(X^4 + 1)*(X^8 - X^4 + 1)',
    `X^12+1 — got ${shape('X^12 + 1')}`);

  // Higher-q variants.
  assert(shape('X^6 - 27') === '(X^2 - 3)*(X^4 + 3*X^2 + 9)',
    `X^6-27 — got ${shape('X^6 - 27')}`);
  assert(shape('X^6 + 125') === '(X^2 + 5)*(X^4 - 5*X^2 + 25)',
    `X^6+125 — got ${shape('X^6 + 125')}`);

  // EXPAND round-trip: FACTOR then EXPAND should reconstruct the
  // original (up to simplify() normal form).
  for (const expr of ['X^6 - 1', 'X^6 + 8', 'X^9 - 27', '8*X^6 + 1',
                      'X^6 - 64', 'X^12 + 1', 'X^9 + 1', 'X^6 - 27']) {
    const f = factor(parseAlgebra(expr));
    const rebuilt = formatAlgebra(expand(f));
    const original = formatAlgebra(expand(parseAlgebra(expr)));
    assert(rebuilt === original,
      `round-trip factor→expand for ${expr}: ${rebuilt} vs ${original}`);
  }

  // Regressions: k=1 cubes unchanged.
  assert(shape('X^3 + 1') === '(X + 1)*(X^2 - X + 1)',
    `k=1 regression X^3+1 — got ${shape('X^3 + 1')}`);
  assert(shape('X^3 - 8') === '(X - 2)*(X^2 + 2*X + 4)',
    `k=1 regression X^3-8 — got ${shape('X^3 - 8')}`);
  assert(shape('8*X^3 + 27') === '(2*X + 3)*(4*X^2 - 6*X + 9)',
    `k=1 regression 8X^3+27 — got ${shape('8*X^3 + 27')}`);

  // Non-sparse X^(3k): sparse-check must prevent this from firing.
  // X^6 + X^3 + 1 is irreducible over ℚ and should stay as-is.
  assert(shape('X^6 + X^3 + 1') === 'X^6 + X^3 + 1',
    `sparse guard: X^6+X^3+1 not touched — got ${shape('X^6 + X^3 + 1')}`);
  // X^6 alone: coreCoefs[0]=0 → the coreCoefs[0] !== 0 guard excludes it.
  // (It falls through to rebuildNumericPoly, returning the same expanded form.)
  assert(shape('X^6') === 'X^6', `X^6 unchanged — got ${shape('X^6')}`);
}

// --- Odd/even symbolic identities and (-X)^n integer-power
//     canonicalisation.  Pulls signs out of SIN/TAN/ASIN/ATAN/SINH/
//     TANH/ASINH/ATANH (odd) and drops them inside COS/COSH (even).
//     `(-X)^n` with n a non-negative integer folds to X^n (even n)
//     or -(X^n) (odd n).  ABS(ABS(x)) → ABS(x).
{
  const { simplify, deriv } = await import('../www/src/rpl/algebra.js');
  const s = e => formatAlgebra(simplify(parseAlgebra(e)));

  // Odd functions.
  assert(s('SIN(-X)')   === '-SIN(X)',   `SIN(-X) → -SIN(X) — got ${s('SIN(-X)')}`);
  assert(s('TAN(-X)')   === '-TAN(X)',   `TAN(-X) → -TAN(X) — got ${s('TAN(-X)')}`);
  assert(s('ASIN(-X)')  === '-ASIN(X)',  `ASIN(-X) → -ASIN(X) — got ${s('ASIN(-X)')}`);
  assert(s('ATAN(-X)')  === '-ATAN(X)',  `ATAN(-X) → -ATAN(X) — got ${s('ATAN(-X)')}`);
  assert(s('SINH(-X)')  === '-SINH(X)',  `SINH(-X) → -SINH(X) — got ${s('SINH(-X)')}`);
  assert(s('TANH(-X)')  === '-TANH(X)',  `TANH(-X) → -TANH(X) — got ${s('TANH(-X)')}`);
  assert(s('ASINH(-X)') === '-ASINH(X)', `ASINH(-X) → -ASINH(X) — got ${s('ASINH(-X)')}`);
  assert(s('ATANH(-X)') === '-ATANH(X)', `ATANH(-X) → -ATANH(X) — got ${s('ATANH(-X)')}`);

  // Even functions — sign dropped.
  assert(s('COS(-X)')  === 'COS(X)',  `COS(-X) → COS(X) — got ${s('COS(-X)')}`);
  assert(s('COSH(-X)') === 'COSH(X)', `COSH(-X) → COSH(X) — got ${s('COSH(-X)')}`);

  // ABS stability — ABS(-x) and ABS(ABS(x)).
  assert(s('ABS(-X)')    === 'ABS(X)', `ABS(-X) existing — got ${s('ABS(-X)')}`);
  assert(s('ABS(ABS(X))') === 'ABS(X)', `ABS(ABS(X)) idempotent — got ${s('ABS(ABS(X))')}`);

  // Num literal arg (not a Neg node) — must NOT enter the odd/even
  // branch; numeric fold or symbolic fallback applies.
  assert(s('SIN(-2)') === 'SIN(-2)', `SIN(-2) left symbolic — got ${s('SIN(-2)')}`);

  // (-X)^n — integer non-neg exponent.
  assert(s('(-X)^2') === 'X^2',    `(-X)^2 → X^2 — got ${s('(-X)^2')}`);
  assert(s('(-X)^3') === '-(X^3)', `(-X)^3 → -(X^3) — got ${s('(-X)^3')}`);
  assert(s('(-X)^4') === 'X^4',    `(-X)^4 → X^4 — got ${s('(-X)^4')}`);
  assert(s('(-X)^0') === '1',      `(-X)^0 → 1 — got ${s('(-X)^0')}`);
  // Negative exponent — not folded (needs branch reasoning).
  assert(s('(-X)^(-2)').includes('('), `(-X)^(-2) not folded`);

  // Like-terms interaction: (-X)^2 + X^2 → 2*X^2.
  assert(s('(-X)^2 + X^2') === '2*X^2',
    `(-X)^2 + X^2 combines — got ${s('(-X)^2 + X^2')}`);

  // Nested odd-in-even, even-in-odd: sign drops / extracts at each level.
  assert(s('SIN(COS(-X))')  === 'SIN(COS(X))',  `nest SIN(COS(-X)) — got ${s('SIN(COS(-X))')}`);
  assert(s('COS(SIN(-X))')  === 'COS(SIN(X))',  `nest COS(SIN(-X)) — got ${s('COS(SIN(-X))')}`);

  // Derivative round-trip: d/dX SIN(-X) should simplify to -COS(X).
  const dSinNegX = formatAlgebra(deriv(parseAlgebra('SIN(-X)'), 'X'));
  assert(dSinNegX === '-COS(X)',
    `deriv(SIN(-X)) → -COS(X) — got ${dSinNegX}`);
  // d/dX COS(-X) → -SIN(X) (since COS is even, chain rule of -X cancels).
  const dCosNegX = formatAlgebra(deriv(parseAlgebra('COS(-X)'), 'X'));
  assert(dCosNegX === '-SIN(X)',
    `deriv(COS(-X)) → -SIN(X) — got ${dCosNegX}`);
}

// --- simplify() cancels a common integer factor in a fraction, so
//     DERIV(SQRT(X^2+1)) reduces to the textbook X/SQRT(X^2+1) instead
//     of 2*X/(2*SQRT(X^2+1)).
{
  const { simplify, deriv } = await import('../www/src/rpl/algebra.js');

  // The motivating case.
  {
    const d = deriv(parseAlgebra('SQRT(X^2+1)'), 'X');
    const out = formatAlgebra(d);
    assert(out === 'X/SQRT(X^2 + 1)',
      `DERIV(SQRT(X^2+1)) → '${out}' (want 'X/SQRT(X^2 + 1)')`);
  }

  // Generalisation: other SQRT(quadratic) derivatives reduce as well.
  {
    const d = deriv(parseAlgebra('SQRT(X^2+4)'), 'X');
    const out = formatAlgebra(d);
    assert(out === 'X/SQRT(X^2 + 4)',
      `DERIV(SQRT(X^2+4)) → '${out}'`);
  }

  // Plain fractional-form reductions.
  {
    const s = simplify(parseAlgebra('6*X/9'));
    const out = formatAlgebra(s);
    assert(out === '2*X/3', `simplify(6*X/9) → '${out}' (want '2*X/3')`);
  }
  {
    const s = simplify(parseAlgebra('4*X/2'));
    const out = formatAlgebra(s);
    assert(out === '2*X', `simplify(4*X/2) → '${out}' (want '2*X')`);
  }
  {
    const s = simplify(parseAlgebra('2/(2*X)'));
    const out = formatAlgebra(s);
    assert(out === '1/X', `simplify(2/(2*X)) → '${out}' (want '1/X')`);
  }

  // Double-negative sign flip even without integer cancellation.
  {
    const s = simplify(parseAlgebra('-X/-Y'));
    const out = formatAlgebra(s);
    assert(out === 'X/Y', `simplify(-X/-Y) → '${out}' (want 'X/Y')`);
  }

  // Coprime integer content: no reduction, expression unchanged.
  {
    const s = simplify(parseAlgebra('3*X/(5*Y)'));
    const out = formatAlgebra(s);
    assert(out === '3*X/(5*Y)',
      `simplify(3*X/(5*Y)) → '${out}' (want coprime, unchanged)`);
  }

  // Regression: earlier simplify rules still fire when present.
  //   X/X → 1 (via astEqual path, runs before _cancelIntegerFactor).
  {
    const s = simplify(parseAlgebra('X/X'));
    assert(s.kind === 'num' && s.value === 1,
      `simplify(X/X) → still Num(1)`);
  }
  //   0/X → 0 (zero-numerator short-circuit).
  {
    const s = simplify(parseAlgebra('0/X'));
    assert(s.kind === 'num' && s.value === 0,
      `simplify(0/X) → still Num(0)`);
  }
}


/* ============================================================
   FACT factorial, one-level UNDO, cube-root closed-form surd detection.
   ============================================================ */
{
  // ---- FACT on non-negative Integer (exact, BigInt) ----
  {
    const s = new Stack(); s.push(Integer(0n));
    lookup('FACT').fn(s, null);
    assert(s.peek().type === 'integer' && s.peek().value === 1n, '0! = 1');
  }
  {
    const s = new Stack(); s.push(Integer(5n));
    lookup('FACT').fn(s, null);
    assert(s.peek().type === 'integer' && s.peek().value === 120n, '5! = 120');
  }
  {
    const s = new Stack(); s.push(Integer(20n));
    lookup('FACT').fn(s, null);
    assert(s.peek().type === 'integer' && s.peek().value === 2432902008176640000n,
      `20! BigInt, got ${s.peek().value}`);
  }
  // ---- FACT on non-negative integer-valued Real → Integer ----
  {
    const s = new Stack(); s.push(Real(6));
    lookup('FACT').fn(s, null);
    assert(s.peek().type === 'integer' && s.peek().value === 720n, '6.0! = 720');
  }
  // ---- FACT on non-integer Real → Γ(x+1) (Lanczos) ----
  {
    const s = new Stack(); s.push(Real(0.5));
    lookup('FACT').fn(s, null);
    // Γ(1.5) = √π/2
    assert(Math.abs(s.peek().value - Math.sqrt(Math.PI)/2) < 1e-10,
      `Γ(1.5) via FACT, got ${s.peek().value}`);
  }
  {
    const s = new Stack(); s.push(Real(-0.5));
    lookup('FACT').fn(s, null);
    // Γ(0.5) = √π
    assert(Math.abs(s.peek().value - Math.sqrt(Math.PI)) < 1e-10,
      `Γ(0.5) via FACT(-0.5), got ${s.peek().value}`);
  }
  // ---- FACT: negative integer throws (pole) ----
  {
    const s = new Stack(); s.push(Integer(-1n));
    let threw = false;
    try { lookup('FACT').fn(s, null); } catch (e) { threw = true; }
    assert(threw, 'FACT(-1) throws (negative Integer)');
  }
  {
    const s = new Stack(); s.push(Real(-3));
    let threw = false;
    try { lookup('FACT').fn(s, null); } catch (e) { threw = true; }
    assert(threw, 'FACT(-3.0) throws (negative integer-valued Real, gamma pole)');
  }
  // ---- FACT in algebraic mode: folds integer values, leaves others symbolic ----
  {
    const pa = (await import('../www/src/rpl/algebra.js'));
    const ast = pa.parseAlgebra('FACT(5)');
    const simp = pa.simplify(ast);
    // Expect it folded to Num(120)
    assert(simp.kind === 'num' && simp.value === 120, `simplify(FACT(5)) = 120, got ${JSON.stringify(simp)}`);
  }
  {
    const pa = (await import('../www/src/rpl/algebra.js'));
    const ast = pa.parseAlgebra('FACT(N)');
    const simp = pa.simplify(ast);
    // N not numeric → stays symbolic
    assert(simp.kind === 'fn' && simp.name === 'FACT',
      `simplify(FACT(N)) stays symbolic, got ${JSON.stringify(simp)}`);
  }

  // ============================================================
  // UNDO / REDO (multi-level)
  // ============================================================

  // ---- Stack.saveForUndo + undo ----
  // saveForUndo records a snapshot; undo walks back through the history
  // stack and redo replays forward.  Single-save round-trip: push state,
  // make a change, UNDO restores, REDO re-applies.
  {
    const s = new Stack();
    s.push(Real(1)); s.push(Real(2));           // state A: { 1 2 }
    s.saveForUndo();
    s.push(Real(3));                            // state B: { 1 2 3 }
    s.undo();
    assert(s.depth === 2 && s.peek(1).value.eq(2) && s.peek(2).value.eq(1),
      'undo restores state A { 1 2 }');
    s.redo();                                   // forward again → B
    assert(s.depth === 3 && s.peek(1).value.eq(3),
      'redo re-applies the undone step → state B { 1 2 3 }');
  }

  // ---- undo with no snapshot throws ----
  {
    const s = new Stack();
    s.push(Real(1));
    let threw = false;
    try { s.undo(); } catch (e) { threw = true; }
    assert(threw, 'undo() with no snapshot throws "No undo available"');
  }

  // ---- hasUndo false before any snapshot, true after ----
  {
    const s = new Stack();
    assert(!s.hasUndo(), 'hasUndo false initially');
    s.push(Real(1));
    assert(!s.hasUndo(), 'hasUndo still false (push doesn\'t snapshot)');
    s.saveForUndo();
    assert(s.hasUndo(), 'hasUndo true after saveForUndo');
  }

  // ---- Entry.enter() snapshots before push ----
  {
    const { Entry } = await import('../www/src/ui/entry.js');
    const s = new Stack();
    s.push(Real(10));                            // pre-existing level 1
    const e = new Entry(s);
    e.type('42');
    e.enter();                                   // pushes 42 (parseEntry yields Integer for a bare digit run)
    assert(s.depth === 2 && Number(s.peek(1).value) === 42, `ENTER pushed 42, got ${s.peek(1)?.value}`);
    s.undo();
    assert(s.depth === 1 && s.peek(1).value.eq(10), 'undo rolls back to { 10 }');
  }

  // ---- Entry.execOp() snapshots before op ----
  {
    const { Entry } = await import('../www/src/ui/entry.js');
    const s = new Stack();
    s.push(Real(2)); s.push(Real(3));
    const e = new Entry(s);
    e.execOp('+');                               // 2 3 + → 5
    assert(s.depth === 1 && s.peek(1).value.eq(5), 'execOp added to 5');
    s.undo();
    assert(s.depth === 2 && s.peek(1).value.eq(3) && s.peek(2).value.eq(2),
      'undo restored {2, 3} before +');
  }

  // ---- Bad argument type leaves the stack unchanged ----
  // HP50 behavior: a type error (e.g. SIN on a string) does NOT
  // consume its arguments.  Entry rolls back the stack on any throw
  // that escapes the op, so the user sees the error flash with their
  // inputs still on the stack.
  {
    const { Entry } = await import('../www/src/ui/entry.js');
    const s = new Stack();
    s.push(Real(1));
    s.push(Str('hello'));                        // level-1: string, level-2: 1
    const e = new Entry(s);
    e.execOp('SIN');                             // should error, not pop
    assert(s.depth === 2, `SIN on string keeps depth (got ${s.depth})`);
    assert(isReal(s.peek(2)) && s.peek(2).value.eq(1), 'level 2 still Real 1');
    assert(s.peek(1).type === 'string' && s.peek(1).value === 'hello',
      'level 1 still string "hello"');
    assert(e.error && /bad argument type/i.test(e.error),
      'error flash says Bad argument type');
  }

  // ---- Mid-commit error: buffer push succeeds, op fails, all rolls back ----
  {
    const { Entry } = await import('../www/src/ui/entry.js');
    const s = new Stack();
    s.push(Real(42));                            // pre-existing stack item
    const e = new Entry(s);
    e.type('"foo"');                             // buffer: "foo"
    e.execOp('SIN');                             // commit pushes "foo", SIN fails
    assert(s.depth === 1 && s.peek(1).value.eq(42),
      'failed op rolls back both buffer commit and op attempt');
  }

  // ---- Entry.backspace() on empty buffer snapshots before DROP ----
  {
    const { Entry } = await import('../www/src/ui/entry.js');
    const s = new Stack();
    s.push(Real(1)); s.push(Real(2)); s.push(Real(3));
    const e = new Entry(s);
    e.backspace();                                // buffer empty → DROP
    assert(s.depth === 2 && s.peek(1).value.eq(2), 'backspace dropped 3');
    s.undo();
    assert(s.depth === 3 && s.peek(1).value.eq(3), 'undo restored 3');
  }

  // ---- Backspace that only edits buffer does NOT snapshot ----
  {
    const { Entry } = await import('../www/src/ui/entry.js');
    const s = new Stack();
    s.push(Real(99));
    const e = new Entry(s);
    e.type('abc');
    const hadBefore = s.hasUndo();
    e.backspace();                                // edits buffer only
    assert(s.hasUndo() === hadBefore, 'buffer-only backspace does not touch undo slot');
    assert(e.buffer === 'ab', 'buffer trimmed to "ab"');
  }

  // ---- Chained ops: each press overwrites snapshot (one-level) ----
  {
    const { Entry } = await import('../www/src/ui/entry.js');
    const s = new Stack();
    s.push(Real(1)); s.push(Real(2));
    const e = new Entry(s);
    e.execOp('+');                                // 1 2 + → 3  ; undo-snap: {1, 2}
    e.type('7');
    e.enter();                                    // push 7 → {3, 7} ; undo-snap: {3}
    s.undo();
    // Undo should revert the most recent action: back to { 3 }.
    assert(s.depth === 1 && s.peek(1).value.eq(3),
      `most-recent undo restores { 3 }, got depth=${s.depth} top=${s.peek(1)?.value}`);
  }

  // ---- UNDO registered as op (name-based invocation also works) ----
  // LASTSTACK is registered as an alias for single-step UNDO (pop-based).
  // For the "swap back" round-trip, REDO is the inverse.  LASTSTACK's
  // swap is indistinguishable from a single UNDO in the 1-level case,
  // so this still exercises the alias.
  {
    const s = new Stack();
    s.push(Real(1));
    s.saveForUndo();
    s.push(Real(2));
    lookup('UNDO').fn(s, null);
    assert(s.depth === 1 && s.peek(1).value.eq(1), 'named UNDO op restores { 1 }');
    lookup('REDO').fn(s, null);
    assert(s.depth === 2 && s.peek(1).value.eq(2), 'REDO re-applies the undone push → { 1 2 }');
    // LASTSTACK is still a working alias for single-step UNDO.
    lookup('LASTSTACK').fn(s, null);
    assert(s.depth === 1 && s.peek(1).value.eq(1), 'LASTSTACK alias steps back one level');
  }

  // ============================================================
  // Multi-level UNDO / REDO on the stack
  // ============================================================
  // Three-step chain: save ‣ mutate ‣ save ‣ mutate ‣ save ‣ mutate.
  // UNDO must walk back step-by-step; REDO must walk forward.  Any
  // new saveForUndo after an UNDO invalidates the forward history
  // ("new action kills redo") per the documented semantics.
  {
    const s = new Stack();
    s.push(Real(1));                // state A : { 1 }
    s.saveForUndo();
    s.push(Real(2));                // state B : { 1 2 }
    s.saveForUndo();
    s.push(Real(3));                // state C : { 1 2 3 }
    s.saveForUndo();
    s.push(Real(4));                // state D : { 1 2 3 4 }

    assert(s.depth === 4, 'sanity: 4 pushes produced depth 4');

    s.undo();                       // → C
    assert(s.depth === 3 && s.peek(1).value.eq(3), 'undo 1 → state C { 1 2 3 }');
    s.undo();                       // → B
    assert(s.depth === 2 && s.peek(1).value.eq(2), 'undo 2 → state B { 1 2 }');
    s.undo();                       // → A
    assert(s.depth === 1 && s.peek(1).value.eq(1), 'undo 3 → state A { 1 }');

    let threw = false;
    try { s.undo(); } catch (e) { threw = /no undo/i.test(e.message); }
    assert(threw, 'undo past the oldest snapshot throws No undo available');

    // Now walk forward.
    s.redo();
    assert(s.depth === 2 && s.peek(1).value.eq(2), 'redo 1 → state B { 1 2 }');
    s.redo();
    assert(s.depth === 3 && s.peek(1).value.eq(3), 'redo 2 → state C { 1 2 3 }');
    s.redo();
    assert(s.depth === 4 && s.peek(1).value.eq(4), 'redo 3 → state D { 1 2 3 4 }');

    let threw2 = false;
    try { s.redo(); } catch (e) { threw2 = /no redo/i.test(e.message); }
    assert(threw2, 'redo past the newest snapshot throws No redo available');
  }

  // saveForUndo after an UNDO wipes the redo stack (standard editor
  // semantics: a new branch kills the old future).
  {
    const s = new Stack();
    s.push(Real(1));
    s.saveForUndo();
    s.push(Real(2));
    s.undo();                       // back to { 1 }, redo holds { 1 2 }
    assert(s.hasRedo(), 'redo populated after undo');
    s.saveForUndo();
    s.push(Real(99));               // new action: must blow away redo
    assert(!s.hasRedo(), 'new saveForUndo invalidates redo history');
    // and attempting redo throws
    let threw = false;
    try { s.redo(); } catch (e) { threw = /no redo/i.test(e.message); }
    assert(threw, 'redo after new action throws No redo available');
  }

  // Undo history is capped at Stack.UNDO_MAX to avoid unbounded growth.
  {
    const { Stack } = await import('../www/src/rpl/stack.js');
    const s = new Stack();
    s.push(Real(0));
    // Push UNDO_MAX + 5 snapshots; only the last UNDO_MAX must survive.
    const extra = 5;
    for (let i = 0; i < Stack.UNDO_MAX + extra; i++) {
      s.saveForUndo();
      s.push(Real(i + 1));
    }
    // Drain undos: we should be able to undo exactly UNDO_MAX times.
    let undid = 0;
    while (s.hasUndo()) { s.undo(); undid++; }
    assert(undid === Stack.UNDO_MAX,
      `undo cap: expected ${Stack.UNDO_MAX} undos, got ${undid}`);
    // After draining, depth is whatever state was the oldest SURVIVING
    // snapshot — the snapshot taken just BEFORE push #extra was made.
    // That depth equals 1 (the single Real(0)) + extra prior pushes.
    assert(s.depth === 1 + extra,
      `state after UNDO_MAX undos: depth ${s.depth}, expected ${1 + extra}`);
  }

  // REDO op wired through the op table throws friendly error when empty.
  {
    const s = new Stack();
    s.push(Real(1));
    let threw = false;
    try { lookup('REDO').fn(s, null); } catch (e) { threw = /no redo/i.test(e.message); }
    assert(threw, 'REDO op with empty redo history throws No redo available');
  }

  // Entry.performRedo walks both stack + var state forward.
  {
    const { Entry }      = await import('../www/src/ui/entry.js');
    const { Stack }      = await import('../www/src/rpl/stack.js');
    resetHome();
    const s = new Stack();
    s.push(Real(10));
    const e = new Entry(s);
    e._snapForUndo();
    s.push(Real(20));
    varStore('X', Real(42));
    e.performUndo();
    assert(s.depth === 1 && varRecall('X') === undefined,
      'performUndo rolls back both stack and var state');
    e.performRedo();
    assert(s.depth === 2 && s.peek(1).value.eq(20),
      'performRedo restores the stack push');
    assert(varRecall('X') && varRecall('X').value.eq(42),
      'performRedo restores the var STO');
  }

  // performRedo with no redo history throws the friendly error.
  {
    const { Entry } = await import('../www/src/ui/entry.js');
    const { Stack } = await import('../www/src/rpl/stack.js');
    const s = new Stack();
    const e = new Entry(s);
    let threw = false;
    try { e.performRedo(); } catch (err) { threw = /no redo/i.test(err.message); }
    assert(threw, 'performRedo with no redo shadow throws No redo available');
  }

  // ============================================================
  // Cube-root closed-form surd detection
  // ============================================================
  {
    const { parseAlgebra, solve, formatAlgebra } = await import('../www/src/rpl/algebra.js');

    // X^3 − k for small integer k: real root is ∛k = XROOT(k, 3).
    const cubic = (src, wanted) => {
      const roots = solve(parseAlgebra(src), 'X');
      const strs  = roots.map(r => formatAlgebra(r.r));
      assert(strs.some(s => s === wanted),
        `solve(${src}): expected root ${wanted} — got ${JSON.stringify(strs)}`);
    };
    cubic('X^3 - 2',  'XROOT(2,3)');
    cubic('X^3 - 5',  'XROOT(5,3)');
    cubic('X^3 + 2',  '-XROOT(2,3)');       // sign=-1 branch
    cubic('X^3 - 16', '2*XROOT(2,3)');      // k=2 (coefficient ≠ 1)
    cubic('8*X^3 - 2', 'XROOT(2,3)/2');     // m=2 (non-trivial denom)

    // Pure rational cubics still emit a bare Num (rational beats cube).
    cubic('X^3 - 8',  '2');
    cubic('X^3 - 27', '3');
    cubic('X^3 + 8',  '-2');

    // Pure transcendental: X^3 + X - 1's real root ≈ 0.682 has no
    // rational / surd / cube-root closed form, so the 12-digit decimal
    // must survive (false-positive guard on _cubeRootReconstruct).
    {
      const rr = solve(parseAlgebra('X^3 + X - 1'), 'X');
      const real = rr.map(r => formatAlgebra(r.r)).find(s => !/i/.test(s));
      assert(/^0\.68232/.test(real), `X^3+X-1 real stays numeric: got ${real}`);
    }
  }
}

// ============================================================
// Keypad binary/unary ops accept Symbolic + Name
// ============================================================
// HP50 behavior: any symbolic operand lifts the whole op into the
// algebra domain, so `'X' 'Y' +` builds `X + Y` rather than throwing
// "Bad argument type".  These tests pin:
//   * binary ops (+ - * / ^) on Sym/Name and Sym/Num combinations;
//   * the mandatory co-symbolization of the numeric other side;
//   * unary ops NEG, INV, SQ, SQRT, ABS;
//   * unary fn ops LN, EXP, LOG, SIN, ASIN, SINH, ACOSH;
//   * the 2-arg XROOT symbolically;
//   * that Bad argument type STILL fires when NO operand is symbolic
//     and the operand type is otherwise unsupported (regression).
{
  const { isSymbolic, Symbolic } = await import('../www/src/rpl/types.js');
  const { formatAlgebra, parseAlgebra } = await import('../www/src/rpl/algebra.js');

  const asExprStr = (v) => {
    assert(isSymbolic(v), 'result is Symbolic');
    return formatAlgebra(v.expr);
  };

  // --- binary: 'X' 'Y' + → X+Y  (formatter uses spaces around +/-)
  {
    const s = new Stack();
    s.push(Name('X', false, true));               // 'X' (quoted)
    s.push(Name('Y', false, true));               // 'Y'
    lookup('+').fn(s);
    assert(s.depth === 1, 'binary sym: one item on stack');
    assert(asExprStr(s.peek(1)) === 'X + Y', `'X' 'Y' + → X + Y, got ${formatAlgebra(s.peek(1).expr)}`);
  }

  // --- binary: 5 'X' + → 5+X (number coerces to Num AST)
  {
    const s = new Stack();
    s.push(Integer(5));
    s.push(Name('X', false, true));
    lookup('+').fn(s);
    assert(asExprStr(s.peek(1)) === '5 + X', `5 'X' + → 5 + X, got ${formatAlgebra(s.peek(1).expr)}`);
  }

  // --- binary: 'X' 3 ^ → X^3
  {
    const s = new Stack();
    s.push(Name('X', false, true));
    s.push(Integer(3));
    lookup('^').fn(s);
    assert(asExprStr(s.peek(1)) === 'X^3', `'X' 3 ^ → X^3, got ${formatAlgebra(s.peek(1).expr)}`);
  }

  // --- binary: 'X+1' 'Y' * → (X+1)*Y (Symbolic + Name)
  {
    const s = new Stack();
    s.push(Symbolic(parseAlgebra('X+1')));
    s.push(Name('Y', false, true));
    lookup('*').fn(s);
    const got = formatAlgebra(s.peek(1).expr);
    assert(got === '(X+1)*Y' || got === '(X + 1)*Y',
      `'X+1' 'Y' * → (X+1)*Y, got ${got}`);
  }

  // --- binary: 'X' 'Y' - → X-Y
  {
    const s = new Stack();
    s.push(Name('X', false, true));
    s.push(Name('Y', false, true));
    lookup('-').fn(s);
    assert(asExprStr(s.peek(1)) === 'X - Y', `'X' 'Y' - → X - Y`);
  }

  // --- binary: 'X' 2 / → X/2
  {
    const s = new Stack();
    s.push(Name('X', false, true));
    s.push(Integer(2));
    lookup('/').fn(s);
    assert(asExprStr(s.peek(1)) === 'X/2', `'X' 2 / → X/2`);
  }

  // --- unary NEG on a Name → -X
  {
    const s = new Stack();
    s.push(Name('X', false, true));
    lookup('NEG').fn(s);
    assert(asExprStr(s.peek(1)) === '-X', `'X' NEG → -X`);
  }

  // --- unary INV on a Symbolic → 1/(X+1)
  {
    const s = new Stack();
    s.push(Symbolic(parseAlgebra('X+1')));
    lookup('INV').fn(s);
    const got = formatAlgebra(s.peek(1).expr);
    assert(got === '1/(X+1)' || got === '1/(X + 1)',
      `1/(X+1) via INV, got ${got}`);
  }

  // --- unary SQ on a Name → X^2
  {
    const s = new Stack();
    s.push(Name('X', false, true));
    lookup('SQ').fn(s);
    assert(asExprStr(s.peek(1)) === 'X^2', `'X' SQ → X^2`);
  }

  // --- unary SQRT on a Name → SQRT(X)
  {
    const s = new Stack();
    s.push(Name('X', false, true));
    lookup('SQRT').fn(s);
    assert(asExprStr(s.peek(1)) === 'SQRT(X)', `'X' SQRT → SQRT(X)`);
  }

  // --- unary ABS on a Name → ABS(X)
  {
    const s = new Stack();
    s.push(Name('X', false, true));
    lookup('ABS').fn(s);
    assert(asExprStr(s.peek(1)) === 'ABS(X)', `'X' ABS → ABS(X)`);
  }

  // --- SIN on Name (angle-mode IRRELEVANT for symbolic) → SIN(X)
  {
    const s = new Stack();
    setAngle('DEG');                              // prove angle mode doesn't matter
    s.push(Name('X', false, true));
    lookup('SIN').fn(s);
    assert(asExprStr(s.peek(1)) === 'SIN(X)', `'X' SIN (DEG mode) → SIN(X)`);
    setAngle('RAD');
  }

  // --- LN/EXP/LOG/ALOG on Name
  for (const [op, want] of [['LN', 'LN(X)'], ['EXP', 'EXP(X)'], ['LOG', 'LOG(X)'], ['ALOG', 'ALOG(X)']]) {
    const s = new Stack();
    s.push(Name('X', false, true));
    lookup(op).fn(s);
    assert(asExprStr(s.peek(1)) === want, `'X' ${op} → ${want}`);
  }

  // --- Hyperbolic on Name, including ACOSH/ATANH (their domain guards
  //     do NOT fire on symbolic operands because they skip toRealOrThrow)
  for (const [op, want] of [
    ['SINH',  'SINH(X)'],  ['COSH',  'COSH(X)'],  ['TANH',  'TANH(X)'],
    ['ASINH', 'ASINH(X)'], ['ACOSH', 'ACOSH(X)'], ['ATANH', 'ATANH(X)'],
  ]) {
    const s = new Stack();
    s.push(Name('X', false, true));
    lookup(op).fn(s);
    assert(asExprStr(s.peek(1)) === want, `'X' ${op} → ${want}`);
  }

  // --- XROOT symbolically: 'X' 3 XROOT → XROOT(X,3)
  {
    const s = new Stack();
    s.push(Name('X', false, true));
    s.push(Integer(3));
    lookup('XROOT').fn(s);
    assert(asExprStr(s.peek(1)) === 'XROOT(X,3)', `'X' 3 XROOT → XROOT(X,3)`);
  }

  // --- `+` with String operand concatenates; Real(1) + "hello"
  //     → "1hello".  Matches HP50 behaviour ("ABC" 123 + → "ABC123").
  //     Keeps symbolic lift + numeric paths working for non-string
  //     operands (covered below).
  {
    const s = new Stack();
    s.push(Real(1));
    s.push(Str('hello'));
    lookup('+').fn(s);
    assert(s.depth === 1 && isString(s.peek(1)) && s.peek(1).value === '1.hello',
      'Real(1) "hello" + → "1.hello" (STD-formats the Real)');
  }
  // --- String + Integer concat: "ABC" 123 + → "ABC123"
  {
    const s = new Stack();
    s.push(Str('ABC'));
    s.push(Integer(123));
    lookup('+').fn(s);
    assert(s.depth === 1 && isString(s.peek(1)) && s.peek(1).value === 'ABC123',
      '"ABC" 123 + → "ABC123"');
  }
  // --- String concat also works with leading numeric side
  {
    const s = new Stack();
    s.push(Integer(123));
    s.push(Str('ABC'));
    lookup('+').fn(s);
    assert(s.depth === 1 && isString(s.peek(1)) && s.peek(1).value === '123ABC',
      '123 "ABC" + → "123ABC"');
  }
  // --- Two strings concat
  {
    const s = new Stack();
    s.push(Str('foo'));
    s.push(Str('bar'));
    lookup('+').fn(s);
    assert(s.depth === 1 && isString(s.peek(1)) && s.peek(1).value === 'foobar',
      '"foo" "bar" + → "foobar"');
  }

  // --- REGRESSION: two numeric operands still fold numerically
  {
    const s = new Stack();
    s.push(Integer(7));
    s.push(Integer(3));
    lookup('+').fn(s);
    assert(s.depth === 1 && isInteger(s.peek(1)) && s.peek(1).value === 10n,
      '7 3 + = 10 Integer (numeric path preserved)');
  }

  // --- End-to-end: user types `'X' ENTER 'Y' ENTER +` via Entry
  {
    const { Entry } = await import('../www/src/ui/entry.js');
    const s = new Stack();
    const e = new Entry(s);
    e.type("`X`");   e.enter();
    e.type("`Y`");   e.enter();
    e.execOp('+');
    assert(s.depth === 1 && isSymbolic(s.peek(1)),
      'full keypad flow: X ENTER Y ENTER + produces Symbolic');
    assert(formatAlgebra(s.peek(1).expr) === 'X + Y',
      `keypad + on stacked quotes yields 'X + Y', got ${formatAlgebra(s.peek(1).expr)}`);
  }

  // --- End-to-end: user builds '2*X+1' with the keypad
  {
    const { Entry } = await import('../www/src/ui/entry.js');
    const s = new Stack();
    const e = new Entry(s);
    e.type('2');     e.enter();
    e.type("`X`");   e.enter();
    e.execOp('*');   // level1 = '2*X'
    e.type('1');     e.enter();
    e.execOp('+');   // level1 = '2*X+1'
    const got = formatAlgebra(s.peek(1).expr);
    assert(got === '2*X + 1', `keypad built '2*X + 1', got ${got}`);
  }

  /* ========== Comparison ops produce symbolic ============
     Every comparison op (=, ≠, <, >, ≤, ≥ and ASCII aliases <=, >=, <>)
     must (a) parse inside '…' algebraic literals and (b) produce a
     Symbolic result when either operand is a Name or Symbolic.
     ================================================================== */
  {
    const { parseEntry } = await import('../www/src/rpl/parser.js');
    const { formatAlgebra } = await import('../www/src/rpl/algebra.js');
    const { TYPES } = await import('../www/src/rpl/types.js');

    // --- parse inside '…' for every comparison operator ---
    const parseOps = [
      ["`x<y`",  'x<y'],
      ["`x>y`",  'x>y'],
      ["`x=y`",  'x = y'],      // `=` keeps legacy spaced print
      ["`x≠y`",  'x≠y'],
      ["`x<=y`", 'x≤y'],         // `<=` normalised to ≤
      ["`x>=y`", 'x≥y'],
      ["`x≤y`",  'x≤y'],
      ["`x≥y`",  'x≥y'],
    ];
    for (const [src, expected] of parseOps) {
      const vs = parseEntry(src);
      assert(vs.length === 1 && vs[0].type === TYPES.SYMBOLIC,
        `${src} parses to Symbolic`);
      const got = formatAlgebra(vs[0].expr);
      assert(got === expected,
        `${src} → ${expected} (got ${got})`);
    }

    // --- stack op: `x y >` with two Names → 'x>y' ---
    const stackCases = [
      ['>', 'x>y'],
      ['<', 'x<y'],
      ['≤', 'x≤y'],
      ['≥', 'x≥y'],
      ['≠', 'x≠y'],
      ['=', 'x = y'],
    ];
    for (const [op, expected] of stackCases) {
      const s = new Stack();
      s.push(Name('x'));
      s.push(Name('y'));
      lookup(op).fn(s);
      assert(s.depth === 1 && s.peek(1).type === TYPES.SYMBOLIC,
        `Name('x') Name('y') ${op} → Symbolic`);
      const got = formatAlgebra(s.peek(1).expr);
      assert(got === expected,
        `Name('x') Name('y') ${op} → '${expected}' (got '${got}')`);
    }

    // --- ASCII aliases <= / >= / <> produce the canonical Unicode op ---
    for (const [alias, canonical] of [['<=', '≤'], ['>=', '≥'], ['<>', '≠']]) {
      const s = new Stack();
      s.push(Name('x'));
      s.push(Name('y'));
      lookup(alias).fn(s);
      assert(s.depth === 1 && s.peek(1).type === TYPES.SYMBOLIC,
        `${alias} alias produces Symbolic`);
      assert(s.peek(1).expr.op === canonical,
        `${alias} alias normalises to ${canonical} (got ${s.peek(1).expr.op})`);
    }

    // --- Name-vs-Number still lifts: `x 5 <` → 'x<5' ---
    {
      const s = new Stack();
      s.push(Name('x'));
      s.push(Integer(5));
      lookup('<').fn(s);
      assert(s.depth === 1 && s.peek(1).type === TYPES.SYMBOLIC,
        'Name x Integer 5 < → Symbolic');
      assert(formatAlgebra(s.peek(1).expr) === 'x<5',
        `x 5 < → 'x<5', got ${formatAlgebra(s.peek(1).expr)}`);
    }

    // --- Pure numeric comparisons still return booleans (regression) ---
    {
      const s = new Stack();
      s.push(Integer(5)); s.push(Integer(3));
      lookup('<').fn(s);
      assert(s.peek(1).type === TYPES.REAL && s.peek(1).value.eq(0),
        '5 3 < → 0. (boolean path preserved)');
    }
    {
      const s = new Stack();
      s.push(Integer(5)); s.push(Integer(3));
      lookup('≠').fn(s);
      assert(s.peek(1).type === TYPES.REAL && s.peek(1).value.eq(1),
        '5 3 ≠ → 1. (boolean path preserved)');
    }

    // --- The `=` stack op builds an equation, even from numerics ---
    {
      const s = new Stack();
      s.push(Integer(2)); s.push(Integer(3));
      lookup('=').fn(s);
      assert(s.peek(1).type === TYPES.SYMBOLIC,
        '2 3 = → Symbolic (equation builder)');
      assert(formatAlgebra(s.peek(1).expr) === '2 = 3',
        `2 3 = → '2 = 3', got ${formatAlgebra(s.peek(1).expr)}`);
    }

    // --- `==` stays boolean / structural even with Names (regression) ---
    {
      const s = new Stack();
      s.push(Name('X')); s.push(Name('X'));
      lookup('==').fn(s);
      assert(s.peek(1).type === TYPES.REAL && s.peek(1).value.eq(1),
        'Name(X) Name(X) == → 1. (structural test, not symbolic)');
    }

    // --- End-to-end keypad flow: 'x' ENTER 'y' ENTER `>` → 'x>y' ---
    {
      const { Entry } = await import('../www/src/ui/entry.js');
      const s = new Stack();
      const e = new Entry(s);
      e.type("`x`");   e.enter();
      e.type("`y`");   e.enter();
      e.execOp('>');
      assert(s.depth === 1 && s.peek(1).type === TYPES.SYMBOLIC,
        `'x' ENTER 'y' ENTER > → Symbolic`);
      assert(formatAlgebra(s.peek(1).expr) === 'x>y',
        `keypad > yields 'x>y', got '${formatAlgebra(s.peek(1).expr)}'`);
    }
  }
}

/* ========== EXACT mode keeps Integer fractions exact ==
   EXACT (the default indicator) must not reduce fractions to their
   decimal equivalents — that is APPROX mode's job.  Session 092: non-
   exact Integer/Integer division now produces a native Rational type
   (replacing the earlier Symbolic('n/d') wrapper), backed by Fraction.js.
   ====================================================================== */
{
  const { setApproxMode } = await import('../www/src/rpl/state.js');
  const { TYPES } = await import('../www/src/rpl/types.js');

  // EXACT (default): 1 3 / stays as Rational(1/3), not 0.333…
  setApproxMode(false);
  {
    const s = new Stack();
    s.push(Integer(1));
    s.push(Integer(3));
    lookup('/').fn(s);
    assert(s.depth === 1 && s.peek(1).type === TYPES.RATIONAL,
      'EXACT: 1 3 / → Rational (not Real)');
    assert(s.peek(1).n === 1n && s.peek(1).d === 3n,
      `EXACT: 1 3 / → 1/3, got ${s.peek(1).n}/${s.peek(1).d}`);
  }

  // EXACT: 6 2 / still folds to Integer(3) — clean divisions stay Integer.
  {
    const s = new Stack();
    s.push(Integer(6));
    s.push(Integer(2));
    lookup('/').fn(s);
    assert(s.peek(1).type === TYPES.INTEGER && s.peek(1).value === 3n,
      'EXACT: 6 2 / → Integer(3) (clean division stays Integer)');
  }

  // EXACT: 2 4 / reduces via GCD to Rational(1/2).
  {
    const s = new Stack();
    s.push(Integer(2));
    s.push(Integer(4));
    lookup('/').fn(s);
    assert(s.peek(1).type === TYPES.RATIONAL &&
           s.peek(1).n === 1n && s.peek(1).d === 2n,
      'EXACT: 2 4 / → Rational(1/2) (auto-reduce via Fraction.js GCD)');
  }

  // APPROX: 1 3 / folds to a Real decimal.
  setApproxMode(true);
  {
    const s = new Stack();
    s.push(Integer(1));
    s.push(Integer(3));
    lookup('/').fn(s);
    assert(s.peek(1).type === TYPES.REAL,
      'APPROX: 1 3 / → Real (decimal fold)');
    assert(Math.abs(s.peek(1).value - 0.3333333333333333) < 1e-10,
      `APPROX: 1 3 / ≈ 0.333…, got ${s.peek(1).value}`);
  }

  // Restore default EXACT for any downstream tests.
  setApproxMode(false);
}


// ================================================================
// Complex cube-root closed form for pure X^3 ± k
// ================================================================
// A specialised branch in solve() handles the "pure cubic + constant"
// shape (no X² or X term) and emits all three roots in closed form
// via ω = e^{2πi/3} = (−1 + i√3)/2, multiplying the real root by
// {1, ω, ω²}.
{
  const { parseAlgebra, solve, formatAlgebra } = await import('../www/src/rpl/algebra.js');

  const rootStrs = (src) =>
    solve(parseAlgebra(src), 'X').map(r => formatAlgebra(r.r));

  // --- X^3 − 2: real XROOT(2,3), pair is (-XROOT(2,3) ± XROOT(2,3)*SQRT(3)*i)/2
  {
    const ss = rootStrs('X^3 - 2');
    assert(ss.length === 3, `solve(X^3-2): 3 roots — got ${ss.length}`);
    assert(ss.includes('XROOT(2,3)'), `real root XROOT(2,3): ${JSON.stringify(ss)}`);
    assert(ss.some(s => /XROOT\(2,3\).*SQRT\(3\).*i/.test(s) && s.includes('(-XROOT(2,3) +')),
      `complex + root shape: ${JSON.stringify(ss)}`);
    assert(ss.some(s => s.includes('(-XROOT(2,3) -')),
      `complex − root shape: ${JSON.stringify(ss)}`);
    // All three roots are numerically distinct and satisfy X³ = 2
    // (sanity-check by reading back the cube of each as a Num).
    // The real root is obviously a cube root of 2; the complex pair
    // must have |root|³ = 2 and 3·arg = ±π mod 2π.  Use a simple
    // numeric eval via the shape of the AST — skip that here since
    // the string test is enough to pin the canonical shape.
  }

  // --- X^3 + 2: sign = -1 branch.  Real root = -XROOT(2,3);
  //     complex pair flips: (XROOT(2,3) ± XROOT(2,3)·SQRT(3)·i)/2
  {
    const ss = rootStrs('X^3 + 2');
    assert(ss.includes('-XROOT(2,3)'), `real -XROOT(2,3): ${JSON.stringify(ss)}`);
    // When sign=-1, aN = -1, so negAtom = XROOT(2,3) (not Neg) and
    // imAtom = Neg(XROOT(2,3)*SQRT(3)).  Emitted numerator is
    // `XROOT(2,3) ± -XROOT(2,3)·SQRT(3)·i`.
    assert(ss.some(s => /^\(XROOT\(2,3\) [+-]/.test(s)),
      `complex pair starts with XROOT(2,3) when sign=-1: ${JSON.stringify(ss)}`);
  }

  // --- X^3 − 16 = 0 has real root 2·∛2.  With k=2, m=1, denom=2,
  //     gcd(|alpha|=2, denom=2)=2 → aN=1, denomRed=1.  Complex pair:
  //     -XROOT(2,3) ± XROOT(2,3)·SQRT(3)·i  (no outer /2).
  {
    const ss = rootStrs('X^3 - 16');
    assert(ss.includes('2*XROOT(2,3)'), `real 2*XROOT(2,3): ${JSON.stringify(ss)}`);
    assert(ss.some(s => /^-XROOT\(2,3\) \+/.test(s) && s.includes('SQRT(3)*i') && !s.includes('/')),
      `complex pair collapses /2 for X^3-16: ${JSON.stringify(ss)}`);
    assert(ss.some(s => /^-XROOT\(2,3\) \-/.test(s)),
      `complex − pair collapses /2 for X^3-16: ${JSON.stringify(ss)}`);
  }

  // --- 8·X^3 − 2 = 0: real root = XROOT(2,3)/2.  Complex pair
  //     denom = 4 after gcd reduction.
  {
    const ss = rootStrs('8*X^3 - 2');
    assert(ss.includes('XROOT(2,3)/2'), `real XROOT(2,3)/2: ${JSON.stringify(ss)}`);
    assert(ss.some(s => /\/4$/.test(s)),
      `complex pair denom /4: ${JSON.stringify(ss)}`);
  }

  // --- Every complex root emitted contains `i` — regression guard
  //     against any decimal-only fallback.
  {
    const ss = rootStrs('X^3 - 2');
    const numericRe = /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i;
    assert(!ss.some(s => numericRe.test(s) && s !== '0'),
      `no pure numeric roots remain for X^3-2: ${JSON.stringify(ss)}`);
    const complex = ss.filter(s => /i/.test(s));
    assert(complex.length === 2, `exactly 2 complex roots: ${JSON.stringify(ss)}`);
    assert(complex.every(s => /SQRT\(3\)/.test(s)),
      `complex roots use SQRT(3) closed form: ${JSON.stringify(ss)}`);
    assert(!complex.some(s => /0\.629960/.test(s)),
      `no stale decimal ≈ 0.629960 leaked from D-K: ${JSON.stringify(ss)}`);
  }

  // --- X^3 − 8 (pure rational root): specialised branch REJECTS this
  //     (f=1) and the generic factor path wins, emitting real root 2
  //     plus the standard (numeric-pair-maybe-present) downstream
  //     roots.  We just require 2 is present and the output isn't
  //     crashing.
  {
    const ss = rootStrs('X^3 - 8');
    assert(ss.includes('2'), `X^3-8 real root 2 still present: ${JSON.stringify(ss)}`);
  }

  // --- X^3 + X - 1 (transcendental real root): specialised branch
  //     must NOT fire (the X term is non-zero), so the numeric
  //     decimal real-root behavior is preserved.
  {
    const ss = rootStrs('X^3 + X - 1');
    assert(ss.some(s => /^0\.68232/.test(s)),
      `X^3+X-1 real root still numeric ≈ 0.68232: ${JSON.stringify(ss)}`);
    // Complex pair from D-K is fine either way — just ensure nothing
    // crashed and we got 3 roots.
    assert(ss.length === 3, `X^3+X-1 has 3 roots: ${JSON.stringify(ss)}`);
  }
}

// ================================================================
// APPROX / EXACT numeric-eval mode
//
// APPROX: EVAL on a Symbolic folds transcendentals to a 12-digit
// decimal.  EXACT (default): EVAL only folds when the result is an
// integer AND every arg was an integer, so SQRT(9) → 3 still folds
// but SQRT(2) and LN(2) stay symbolic.  →NUM forces APPROX for the
// span of one EVAL regardless of the flag.
// ================================================================
{
  const {
    setApproxMode, getApproxMode, toggleApproxMode,
  } = await import('../www/src/rpl/state.js');

  // Helper: run `'EXPR' EVAL` on a fresh stack, return the
  // top-of-stack string (via formatStackTop) so we can assert the
  // shape of the result without caring about numeric tolerance.
  function evalExpr(src) {
    const s = new Stack();
    for (const v of parseEntry(src)) s.push(v);
    lookup('EVAL').fn(s, null);
    return formatStackTop(s.peek());
  }

  // ---- APPROX mode (default) folds everything ----
  //     formatStackTop wraps Symbolic values in `'…'` and appends `.`
  //     to whole-number Reals (HP50 conventions); the tests accommodate
  //     both so they read as "the stack top shows ___".
  {
    resetHome();
    setApproxMode(true);
    assert(getApproxMode() === true, 'default/APPROX: flag is true');
    assert(evalExpr("`SQRT(2)`") === '1.41421356237',
      `APPROX: SQRT(2) folds to decimal — got ${evalExpr("`SQRT(2)`")}`);
    assert(evalExpr("`SQRT(9)`") === '3.',
      `APPROX: SQRT(9) folds to 3. — got ${evalExpr("`SQRT(9)`")}`);
    assert(evalExpr("`LN(2)`").startsWith('0.69314'),
      `APPROX: LN(2) folds to decimal — got ${evalExpr("`LN(2)`")}`);
  }

  // ---- EXACT mode keeps non-integer results symbolic ----
  {
    resetHome();
    setApproxMode(false);
    assert(getApproxMode() === false, 'EXACT: flag is false after setApproxMode(false)');
    // Integer-in, integer-out: still folds.
    assert(evalExpr("`SQRT(9)`") === '3.',
      `EXACT: SQRT(9) still folds to 3. — got ${evalExpr("`SQRT(9)`")}`);
    assert(evalExpr("`LN(1)`") === '0.',
      `EXACT: LN(1) still folds to 0. — got ${evalExpr("`LN(1)`")}`);
    // Integer-in, non-integer-out: stays symbolic.
    assert(evalExpr("`SQRT(2)`") === "`SQRT(2)`",
      `EXACT: SQRT(2) stays symbolic — got ${evalExpr("`SQRT(2)`")}`);
    assert(evalExpr("`LN(2)`") === "`LN(2)`",
      `EXACT: LN(2) stays symbolic — got ${evalExpr("`LN(2)`")}`);
    // Non-integer-in: stays symbolic regardless of result.
    assert(evalExpr("`SQRT(0.25)`") === "`SQRT(0.25)`",
      `EXACT: SQRT(0.25) stays symbolic — got ${evalExpr("`SQRT(0.25)`")}`);
  }

  // ---- toggleApproxMode flips the flag ----
  {
    setApproxMode(false);
    toggleApproxMode();
    assert(getApproxMode() === true, 'toggle: false → true');
    toggleApproxMode();
    assert(getApproxMode() === false, 'toggle: true → false');
  }

  // ---- APPROX / EXACT ops from the registry ----
  {
    resetHome();
    setApproxMode(true);
    const s = new Stack();
    lookup('EXACT').fn(s, null);
    assert(getApproxMode() === false, 'EXACT op: flag is false after running');
    lookup('APPROX').fn(s, null);
    assert(getApproxMode() === true, 'APPROX op: flag is true after running');
  }

  // ---- →NUM forces APPROX for one EVAL, then restores the flag ----
  {
    resetHome();
    setApproxMode(false);
    // Start in EXACT.  `'SQRT(2)' EVAL` would stay symbolic;
    // `'SQRT(2)' →NUM` must fold to the decimal.
    const s = new Stack();
    for (const v of parseEntry("`SQRT(2)`")) s.push(v);
    lookup('→NUM').fn(s, null);
    const top = formatStackTop(s.peek());
    assert(top === '1.41421356237',
      `→NUM under EXACT folds SQRT(2) to decimal — got ${top}`);
    // Flag must be restored to the pre-call value.
    assert(getApproxMode() === false,
      '→NUM restores the pre-call APPROX flag (stayed EXACT)');
  }

  // ---- →NUM restores flag even when EVAL throws ----
  {
    resetHome();
    setApproxMode(false);
    const s = new Stack();
    // Push a Symbolic referencing an unbound name — EVAL won't throw,
    // just leaves it symbolic.  Force a real throw by feeding a bare
    // name that can't resolve.  Pushing an empty stack and calling →NUM
    // will throw "Too few arguments"; catch to assert flag is restored.
    let threw = false;
    try { lookup('→NUM').fn(s, null); }
    catch (e) { threw = true; }
    assert(threw, '→NUM with empty stack throws');
    assert(getApproxMode() === false,
      '→NUM restores the EXACT flag even on error');
  }

  // ---- ->NUM ASCII alias routes to same op ----
  {
    resetHome();
    setApproxMode(false);
    const s = new Stack();
    for (const v of parseEntry("`SQRT(4)`")) s.push(v);
    lookup('->NUM').fn(s, null);
    assert(formatStackTop(s.peek()) === '2.',
      `->NUM ASCII alias folds SQRT(4) → 2. — got ${formatStackTop(s.peek())}`);
  }

  // Reset flag to the default (EXACT) so later tests aren't affected.
  setApproxMode(false);
}

// ==================================================================
// →NUM coverage in EXACT mode + symbolic constants.
//
// Behaviour pinned here:
//   1. Parser: pure-numeric tick-strings like '1/3' and '2^0.5'
//      parse as Symbolic rather than Name, so →NUM can reach them.
//   2. ops.js: PI / E are built-in constants resolved to numbers in
//      APPROX mode (incl. during the →NUM span) and kept symbolic in
//      EXACT.  `'PI' →NUM` folds to 3.14159… while `'PI' EVAL` in
//      EXACT stays as 'PI'.
//   3. algebra.evalAst honours a `binGate` callback; ops.js passes
//      `_approxGate` so EXACT-mode EVAL refuses to fold `'1/3'` or
//      `'1+0.5'` into a Real.
// ==================================================================
{
  const { getApproxMode } = await import('../www/src/rpl/state.js');
  // --- parser recognizes pure-numeric tick-strings as Symbolic ------
  {
    const toks = parseEntry("`1/3`");
    assert(toks.length === 1 && isSymbolic(toks[0]),
           `session041: '1/3' parses as Symbolic — got ${JSON.stringify(toks[0])}`);
  }
  {
    const toks = parseEntry("`2^0.5`");
    assert(toks.length === 1 && isSymbolic(toks[0]),
           `session041: '2^0.5' parses as Symbolic`);
  }
  {
    // Bare operator ticks still fall through to Name via the
    // parseAlgebra try/catch — `'+'` is not a legal algebraic form.
    const toks = parseEntry("`+`");
    assert(toks.length === 1 && isName(toks[0]) && toks[0].id === '+' && toks[0].quoted === true,
           `session041: '+' still falls back to a quoted Name`);
  }

  // --- →NUM folds symbolic inputs that EXACT mode keeps symbolic ------
  function runNum(src) {
    resetHome();
    setApproxMode(false);
    const s = new Stack();
    for (const v of parseEntry(src)) s.push(v);
    lookup('→NUM').fn(s, null);
    return { top: s.peek(), approx: getApproxMode() };
  }
  {
    const { top, approx } = runNum("`1/3`");
    assert(isReal(top) && Math.abs(top.value - 1/3) < 1e-12,
           `session041: EXACT '1/3' →NUM folds to 0.3333… — got ${formatStackTop(top)}`);
    assert(approx === false, "session041: →NUM restored EXACT after `1/3`");
  }
  {
    const { top } = runNum("`2^0.5`");
    assert(isReal(top) && Math.abs(top.value - Math.SQRT2) < 1e-12,
           `session041: EXACT '2^0.5' →NUM folds to SQRT(2) — got ${formatStackTop(top)}`);
  }
  {
    const { top } = runNum("`PI`");
    assert(isReal(top) && Math.abs(top.value - Math.PI) < 1e-12,
           `session041: EXACT 'PI' →NUM folds to 3.14159… — got ${formatStackTop(top)}`);
  }
  {
    const { top } = runNum("`PI+1`");
    assert(isReal(top) && Math.abs(top.value - (Math.PI + 1)) < 1e-12,
           `session041: EXACT 'PI+1' →NUM folds — got ${formatStackTop(top)}`);
  }
  {
    const { top } = runNum("`SIN(PI/4)`");
    setAngle('RAD');                   // in case a previous test changed it
    assert(isReal(top) && Math.abs(top.value - Math.SQRT1_2) < 1e-12,
           `session041: EXACT 'SIN(PI/4)' →NUM folds to √2/2 — got ${formatStackTop(top)}`);
  }

  // --- EVAL in EXACT mode — constants stay symbolic, pure-numeric
  //     Bin nodes that would produce a non-integer stay symbolic too ---
  function runEvalExact(src) {
    resetHome();
    setApproxMode(false);
    const s = new Stack();
    for (const v of parseEntry(src)) s.push(v);
    lookup('EVAL').fn(s, null);
    return s.peek();
  }
  {
    const top = runEvalExact("`PI`");
    assert(isName(top) && top.id === 'PI',
           `session041: EXACT 'PI' EVAL stays symbolic — got ${formatStackTop(top)}`);
  }
  {
    const top = runEvalExact("`1/3`");
    assert(isSymbolic(top),
           `session041: EXACT '1/3' EVAL stays symbolic — got ${formatStackTop(top)}`);
  }
  {
    const top = runEvalExact("`2+3`");
    // Integer-result-from-integer-inputs still folds under EXACT.
    assert(isReal(top) && top.value.eq(5),
           `session041: EXACT '2+3' EVAL folds to 5. — got ${formatStackTop(top)}`);
  }
  {
    const top = runEvalExact("`1+0.5`");
    assert(isSymbolic(top),
           `session041: EXACT '1+0.5' EVAL stays symbolic (non-integer input) — got ${formatStackTop(top)}`);
  }
  setApproxMode(false);
}

// ==================================================================
// pretty.js opSepBox tightens `+`/`-`/`=` spacing.
// ==================================================================
{
  const { astToSvg } = await import('../www/src/rpl/pretty.js');
  {
    const { svg } = astToSvg(parseAlgebra('X + 1'));
    // The `+` glyph is no longer padded by full character widths —
    // so the <text> body is literally `+`, not ` + `.
    assert(svg.includes('>+<') && !svg.includes('> + <'),
           `session041: 'X + 1' renders with tight + separator (got ${svg})`);
  }
  {
    const { svg } = astToSvg(parseAlgebra('A = B'));
    assert(svg.includes('>=<') && !svg.includes('> = <'),
           `session041: 'A = B' renders with tight = separator`);
  }
  {
    // `*` without juxtaposition still uses the plain textBox(op) path
    // — no padding change there, so `A * B` still looks like `A*B`
    // (no spaces) in SVG.
    const { svg } = astToSvg(parseAlgebra('A * B'));
    assert(svg.includes('>*<'),
           `session041: 'A * B' '*' glyph still inline`);
  }
}

// ==================================================================
// Complex display drops trailing `.` on integer-valued components in
// EXACT + STD mode.
// ==================================================================
{
  const prev = (await import('../www/src/rpl/state.js')).getApproxMode();
  setApproxMode(false);
  assert(format(Complex(1, 1)) === '(1, 1)',
         `session041: EXACT (1,1) → '(1, 1)' — got ${format(Complex(1, 1))}`);
  assert(format(Complex(0, -1)) === '(0, -1)',
         `session041: EXACT (0,-1) → '(0, -1)'`);
  assert(format(Complex(2.5, 3)) === '(2.5, 3)',
         `session041: EXACT (2.5,3) → '(2.5, 3)'`);
  setApproxMode(true);
  assert(format(Complex(1, 1)) === '(1., 1.)',
         `session041: APPROX (1,1) → '(1., 1.)'`);
  setApproxMode(prev);
}


// ==================================================================
// HORNER / PCOEF / FCOEF
// ==================================================================

/* ---- HORNER: (x³ - 6x² + 11x - 6) synth-divided by (x - 1) ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(-6n), Integer(11n), Integer(-6n)]));
  s.push(Integer(1n));
  lookup('HORNER').fn(s);
  assert(s.depth === 3, 'session053: HORNER leaves quotient, remainder, a');
  const a = s.peek(1);
  const r = s.peek(2);
  const q = s.peek(3);
  assert(q.type === 'list', 'session053: HORNER quotient is list');
  assert(q.items.map(i => i.value).join(',') === '1,-5,6',
    'session053: HORNER quotient of x³-6x²+11x-6 by (x-1) = x²-5x+6');
  assert(r.value === 0n, 'session053: HORNER remainder at root = 0');
  assert(a.value === 1n, 'session053: HORNER pushes `a` on top');
}

/* ---- HORNER evaluated at non-root: remainder = p(a) ---- */
{
  // p(x) = 2x² - 3x + 1 ; p(2) = 2*4 - 6 + 1 = 3
  const s = new Stack();
  s.push(RList([Integer(2n), Integer(-3n), Integer(1n)]));
  s.push(Integer(2n));
  lookup('HORNER').fn(s);
  assert(s.peek(2).value === 3n, 'session053: HORNER remainder = p(a)');
}

/* ---- HORNER: empty coefs throws ---- */
{
  const s = new Stack();
  s.push(RList([]));
  s.push(Integer(1n));
  let threw = false;
  try { lookup('HORNER').fn(s); } catch (e) { threw = /Bad argument/.test(e.message); }
  assert(threw, 'session053: HORNER empty coef list throws');
}

/* ---- HORNER: non-numeric coef throws ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Name('A')]));
  s.push(Integer(1n));
  let threw = false;
  try { lookup('HORNER').fn(s); } catch (e) { threw = /Bad argument/.test(e.message); }
  assert(threw, 'session053: HORNER Name coef throws');
}

/* ---- PCOEF: {1 2 3} → coefs of (x-1)(x-2)(x-3) = x³-6x²+11x-6 ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(2n), Integer(3n)]));
  lookup('PCOEF').fn(s);
  const c = s.peek();
  assert(c.type === 'list' && c.items.length === 4,
    'session053: PCOEF {1 2 3} length 4');
  assert(c.items.map(i => i.value).join(',') === '1,-6,11,-6',
    'session053: PCOEF {1 2 3} → {1 -6 11 -6}');
}

/* ---- PCOEF: empty list → {1} ---- */
{
  const s = new Stack();
  s.push(RList([]));
  lookup('PCOEF').fn(s);
  const c = s.peek();
  assert(c.type === 'list' && c.items.length === 1 && c.items[0].value === 1n,
    'session053: PCOEF {} → {1}');
}

/* ---- PCOEF: single root {5} → {1 -5} ---- */
{
  const s = new Stack();
  s.push(RList([Integer(5n)]));
  lookup('PCOEF').fn(s);
  assert(s.peek().items.map(i => i.value).join(',') === '1,-5',
    'session053: PCOEF {5} → {1 -5}');
}

/* ---- PCOEF and HORNER round-trip: roots → poly → remainder@root = 0 ---- */
{
  const s = new Stack();
  s.push(RList([Integer(2n), Integer(3n), Integer(5n)]));
  lookup('PCOEF').fn(s);
  // Now stack has the poly list.  Evaluate at x = 3 via HORNER.
  s.push(Integer(3n));
  lookup('HORNER').fn(s);
  assert(s.peek(2).value === 0n,
    'session053: PCOEF|HORNER at root → remainder 0');
}

/* ---- FCOEF: {1 2} → (VX - 1)² ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(2n)]));
  lookup('FCOEF').fn(s);
  assert(s.peek().type === 'symbolic',
    'session053: FCOEF returns Symbolic');
  const e = s.peek().expr;
  // Expect AstBin('*', (X-1), (X-1))
  assert(e.kind === 'bin' && e.op === '*' &&
         e.l.kind === 'bin' && e.l.op === '-' &&
         e.r.kind === 'bin' && e.r.op === '-',
    'session053: FCOEF {1 2} → (X-1)*(X-1)');
}

/* ---- FCOEF: {1 1 2 1} → (X-1)*(X-2) ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(1n), Integer(2n), Integer(1n)]));
  lookup('FCOEF').fn(s);
  const e = s.peek().expr;
  assert(e.kind === 'bin' && e.op === '*',
    'session053: FCOEF two distinct roots → product');
}

/* ---- FCOEF: odd-length list throws ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(2n), Integer(3n)]));
  let threw = false;
  try { lookup('FCOEF').fn(s); } catch (e) { threw = /Bad argument/.test(e.message); }
  assert(threw, 'session053: FCOEF odd-length list throws');
}

/* ---- FCOEF: negative multiplicity throws ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(-1n)]));
  let threw = false;
  try { lookup('FCOEF').fn(s); } catch (e) { threw = /Bad argument/.test(e.message); }
  assert(threw, 'session053: FCOEF negative multiplicity throws');
}

/* ---- FCOEF: zero-multiplicity skipped; empty result = Num(1) ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(0n)]));
  lookup('FCOEF').fn(s);
  const e = s.peek().expr;
  assert(e.kind === 'num' && e.value === 1,
    'session053: FCOEF {1 0} → Sym(1)');
}

/* =================================================================
   PROOT, QUOT, REMAINDER.
   ================================================================= */

/* ---- PROOT: x² - 3x + 2 = (x-1)(x-2) ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(-3n), Integer(2n)]));
  lookup('PROOT').fn(s);
  const v = s.pop();
  assert(v.type === 'vector' && v.items.length === 2,
    'session054: PROOT quadratic returns 2-vector');
  const vals = v.items.map(x => (isReal(x) || isInteger(x)) ? Number(x.value) : null).sort((a, b) => a - b);
  assert(vals[0] !== null && vals[1] !== null && Math.abs(vals[0] - 1) < 1e-9
         && Math.abs(vals[1] - 2) < 1e-9,
    'session054: PROOT x²-3x+2 → {1, 2}');
}

/* ---- PROOT: x² + 1 → ±i ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(0n), Integer(1n)]));
  lookup('PROOT').fn(s);
  const v = s.pop();
  assert(v.type === 'vector' && v.items.length === 2,
    'session054: PROOT x²+1 returns 2-vector');
  let sawI = false, sawNegI = false;
  for (const z of v.items) {
    assert(isComplex(z), 'session054: PROOT x²+1 root is Complex');
    if (Math.abs(z.re) < 1e-9 && Math.abs(z.im - 1) < 1e-9) sawI = true;
    if (Math.abs(z.re) < 1e-9 && Math.abs(z.im + 1) < 1e-9) sawNegI = true;
  }
  assert(sawI && sawNegI, 'session054: PROOT x²+1 → ±i');
}

/* ---- PROOT: cubic (x-1)(x-2)(x-3) = x³-6x²+11x-6 ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(-6n), Integer(11n), Integer(-6n)]));
  lookup('PROOT').fn(s);
  const v = s.pop();
  const vals = v.items.map(x => Number(x.value)).sort((a, b) => a - b);
  assert(Math.abs(vals[0] - 1) < 1e-6 && Math.abs(vals[1] - 2) < 1e-6
         && Math.abs(vals[2] - 3) < 1e-6,
    'session054: PROOT cubic → {1, 2, 3}');
}

/* ---- PROOT: linear shortcut 2x - 6 → {3} ---- */
{
  const s = new Stack();
  s.push(RList([Integer(2n), Integer(-6n)]));
  lookup('PROOT').fn(s);
  const v = s.pop();
  assert(v.type === 'vector' && v.items.length === 1
         && Math.abs(Number(v.items[0].value) - 3) < 1e-12,
    'session054: PROOT linear 2x-6 → {3}');
}

/* ---- PROOT: empty list → Bad argument value ---- */
{
  const s = new Stack();
  s.push(RList([]));
  let threw = false;
  try { lookup('PROOT').fn(s); } catch (e) { threw = /Bad argument value/.test(e.message); }
  assert(threw, 'session054: PROOT {} throws');
}

/* ---- PROOT: Name coef rejected ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Name('a'), Integer(1n)]));
  let threw = false;
  try { lookup('PROOT').fn(s); } catch (e) { threw = /Bad argument/.test(e.message); }
  assert(threw, 'session054: PROOT Name coef throws');
}

/* ---- QUOT: (x³ - 2x² + x - 2) / (x - 2) = x² + 1 ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(-2n), Integer(1n), Integer(-2n)]));
  s.push(RList([Integer(1n), Integer(-2n)]));
  lookup('QUOT').fn(s);
  const q = s.pop();
  assert(q.type === 'list' && q.items.length === 3
         && Number(q.items[0].value) === 1
         && Number(q.items[1].value) === 0
         && Number(q.items[2].value) === 1,
    'session054: QUOT → {1 0 1}');
}

/* ---- REMAINDER: (x² + 1) / (x - 1) = quot (x+1), rem 2 ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(0n), Integer(1n)]));
  s.push(RList([Integer(1n), Integer(-1n)]));
  lookup('REMAINDER').fn(s);
  const r = s.pop();
  assert(r.type === 'list' && r.items.length === 1
         && Number(r.items[0].value) === 2,
    'session054: REMAINDER → {2}');
}

/* ---- REMAINDER: exact divide → {0} ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(-3n), Integer(2n)])); // x²-3x+2
  s.push(RList([Integer(1n), Integer(-1n)]));              // x-1
  lookup('REMAINDER').fn(s);
  const r = s.pop();
  assert(r.type === 'list' && r.items.length === 1
         && Number(r.items[0].value) === 0,
    'session054: REMAINDER exact → {0}');
}

/* ---- QUOT: divisor-degree > dividend-degree → {0} ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(0n)]));               // x
  s.push(RList([Integer(1n), Integer(0n), Integer(0n)]));  // x²
  lookup('QUOT').fn(s);
  const q = s.pop();
  assert(q.type === 'list' && q.items.length === 1
         && Number(q.items[0].value) === 0,
    'session054: QUOT smaller dividend → {0}');
}

/* ---- QUOT: divisor = {0} → Infinite result ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(1n)]));
  s.push(RList([Integer(0n)]));
  let threw = false;
  try { lookup('QUOT').fn(s); } catch (e) { threw = /Infinite/.test(e.message); }
  assert(threw, 'session054: QUOT by zero throws');
}

/* =================================================================
   PEVAL, PTAYL, EPSX0, DISTRIB.
   (GRAMSCHMIDT / QR / CHOLESKY / RDM / C→P / P→C live in
   tests/test-matrix.mjs and tests/test-numerics.mjs.)
   ================================================================= */

/* ---- PEVAL: p(x) = x² - 3x + 2, x = 5 → 12 ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(-3n), Integer(2n)]));
  s.push(Integer(5n));
  lookup('PEVAL').fn(s);
  const r = s.pop();
  assert(Number(r.value) === 12,
    'session055: PEVAL x²-3x+2 at 5 → 12');
}

/* ---- PEVAL: constant polynomial returns the constant ---- */
{
  const s = new Stack();
  s.push(RList([Real(7)]));
  s.push(Real(999));
  lookup('PEVAL').fn(s);
  const r = s.pop();
  assert(isReal(r) && r.value.eq(7),
    'session055: PEVAL constant → constant');
}

/* ---- PEVAL: complex argument ---- */
{
  const s = new Stack();
  // p(x) = x² + 1; evaluated at i should be 0.
  s.push(RList([Integer(1n), Integer(0n), Integer(1n)]));
  s.push(Complex(0, 1));
  lookup('PEVAL').fn(s);
  const r = s.pop();
  assert(isComplex(r) && Math.abs(r.re) < 1e-12 && Math.abs(r.im) < 1e-12,
    'session055: PEVAL x²+1 at i → 0');
}

/* ---- PEVAL: empty list throws ---- */
{
  const s = new Stack();
  s.push(RList([]));
  s.push(Real(1));
  let threw = false;
  try { lookup('PEVAL').fn(s); } catch (e) { threw = /Bad argument value/.test(e.message); }
  assert(threw, 'session055: PEVAL {} throws');
}

/* ---- PEVAL: Symbolic coef rejected ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Symbolic(AstVar('a'))]));
  s.push(Real(1));
  let threw = false;
  try { lookup('PEVAL').fn(s); } catch (e) { threw = /Bad argument/.test(e.message); }
  assert(threw, 'session055: PEVAL Symbolic coef throws');
}

/* ---- PTAYL: x²  shifted by a=0  →  x² unchanged ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(0n), Integer(0n)]));
  s.push(Integer(0n));
  lookup('PTAYL').fn(s);
  const L = s.pop();
  assert(L.items.length === 3 && Number(L.items[0].value) === 1
         && Number(L.items[1].value) === 0 && Number(L.items[2].value) === 0,
    'session055: PTAYL x² at 0 → {1 0 0}');
}

/* ---- PTAYL: x² shifted by a=1  →  (x-1)² basis coefs = {1 2 1}
         because p(x) = x² = 1·(x-1)² + 2·(x-1) + 1 ---- */
{
  const s = new Stack();
  s.push(RList([Integer(1n), Integer(0n), Integer(0n)]));
  s.push(Integer(1n));
  lookup('PTAYL').fn(s);
  const L = s.pop();
  assert(L.items.length === 3 && Number(L.items[0].value) === 1
         && Number(L.items[1].value) === 2 && Number(L.items[2].value) === 1,
    'session055: PTAYL x² at 1 → {1 2 1}');
}

/* ---- PTAYL: (x+1)³  round-trips PCOEF → PTAYL at -1 gives {1 0 0 0} ---- */
{
  const s = new Stack();
  // (x - -1)³ expansion: x³ + 3x² + 3x + 1
  s.push(RList([Integer(1n), Integer(3n), Integer(3n), Integer(1n)]));
  s.push(Integer(-1n));
  lookup('PTAYL').fn(s);
  const L = s.pop();
  // In (x+1) basis, p = (x+1)³ → {1 0 0 0}
  assert(L.items.length === 4
         && Number(L.items[0].value) === 1
         && Number(L.items[1].value) === 0
         && Number(L.items[2].value) === 0
         && Number(L.items[3].value) === 0,
    'session055: PTAYL (x+1)³ at -1 → {1 0 0 0}');
}

/* ---- PTAYL: constant polynomial → constant polynomial ---- */
{
  const s = new Stack();
  s.push(RList([Real(5)]));
  s.push(Real(3));
  lookup('PTAYL').fn(s);
  const L = s.pop();
  assert(L.items.length === 1 && Number(L.items[0].value) === 5,
    'session055: PTAYL constant → constant');
}

/* ---- PTAYL: empty list throws ---- */
{
  const s = new Stack();
  s.push(RList([]));
  s.push(Real(1));
  let threw = false;
  try { lookup('PTAYL').fn(s); } catch (e) { threw = /Bad argument value/.test(e.message); }
  assert(threw, 'session055: PTAYL {} throws');
}

/* ---- EPSX0: tiny numeric drops to 0 ---- */
{
  const s = new Stack();
  // Sym:  X + 1e-15
  s.push(Symbolic(AstBin('+', AstVar('X'), AstNum(1e-15))));
  lookup('EPSX0').fn(s);
  const v = s.pop();
  assert(isSymbolic(v), 'session055: EPSX0 Symbolic out');
  const e = v.expr;
  assert(e.kind === 'bin' && e.op === '+'
         && e.l.kind === 'var' && e.l.name === 'X'
         && e.r.kind === 'num' && e.r.value === 0,
    'session055: EPSX0 tiny → 0 inside AST');
}

/* ---- EPSX0: value above threshold preserved ---- */
{
  const s = new Stack();
  s.push(Symbolic(AstBin('+', AstVar('X'), AstNum(0.5))));
  lookup('EPSX0').fn(s);
  const v = s.pop();
  const e = v.expr;
  assert(e.r.kind === 'num' && e.r.value === 0.5,
    'session055: EPSX0 preserves non-small values');
}

/* ---- EPSX0: nested inside fn call ---- */
{
  const s = new Stack();
  s.push(Symbolic(AstFn('SIN', [AstBin('+', AstVar('X'), AstNum(1e-14))])));
  lookup('EPSX0').fn(s);
  const v = s.pop();
  const e = v.expr;
  assert(e.kind === 'fn' && e.name === 'SIN'
         && e.args[0].kind === 'bin'
         && e.args[0].r.kind === 'num' && e.args[0].r.value === 0,
    'session055: EPSX0 recurses into fn args');
}

/* ---- EPSX0: scalar Real below threshold → Real(0) ---- */
{
  const s = new Stack();
  s.push(Real(1e-15));
  lookup('EPSX0').fn(s);
  const v = s.pop();
  assert(isReal(v) && v.value.eq(0),
    'session055: EPSX0 Real tiny → 0');
}

/* ---- EPSX0: scalar Real above threshold pass-through ---- */
{
  const s = new Stack();
  s.push(Real(2));
  lookup('EPSX0').fn(s);
  const v = s.pop();
  assert(isReal(v) && v.value.eq(2),
    'session055: EPSX0 Real 2 → 2');
}

/* ---- EPSX0: Complex with tiny imaginary → Real ---- */
{
  const s = new Stack();
  s.push(Complex(3, 1e-13));
  lookup('EPSX0').fn(s);
  const v = s.pop();
  assert(isReal(v) && v.value.eq(3),
    'session055: EPSX0 tiny-imag Complex → Real');
}

/* ---- EPSX0: Vector of tiny values ---- */
{
  const s = new Stack();
  s.push(Vector([Real(1e-15), Real(2), Real(-1e-20)]));
  lookup('EPSX0').fn(s);
  const v = s.pop();
  assert(v.items.length === 3
         && v.items[0].value.eq(0)
         && v.items[1].value.eq(2)
         && v.items[2].value.eq(0),
    'session055: EPSX0 Vector element-wise');
}

/* ---- DISTRIB: a*(b+c) → a*b + a*c ---- */
{
  const s = new Stack();
  // X * (Y + Z)
  s.push(Symbolic(AstBin('*', AstVar('X'),
    AstBin('+', AstVar('Y'), AstVar('Z')))));
  lookup('DISTRIB').fn(s);
  const v = s.pop();
  const e = v.expr;
  assert(e.kind === 'bin' && e.op === '+'
         && e.l.kind === 'bin' && e.l.op === '*'
         && e.l.l.kind === 'var' && e.l.l.name === 'X'
         && e.l.r.kind === 'var' && e.l.r.name === 'Y'
         && e.r.kind === 'bin' && e.r.op === '*'
         && e.r.l.kind === 'var' && e.r.l.name === 'X'
         && e.r.r.kind === 'var' && e.r.r.name === 'Z',
    'session055: DISTRIB X*(Y+Z) → X*Y + X*Z');
}

/* ---- DISTRIB: (b-c)*a → b*a - c*a ---- */
{
  const s = new Stack();
  s.push(Symbolic(AstBin('*',
    AstBin('-', AstVar('B'), AstVar('C')),
    AstVar('A'))));
  lookup('DISTRIB').fn(s);
  const e = s.pop().expr;
  assert(e.kind === 'bin' && e.op === '-'
         && e.l.kind === 'bin' && e.l.op === '*'
         && e.l.l.kind === 'var' && e.l.l.name === 'B'
         && e.l.r.kind === 'var' && e.l.r.name === 'A'
         && e.r.kind === 'bin' && e.r.op === '*'
         && e.r.l.kind === 'var' && e.r.l.name === 'C'
         && e.r.r.kind === 'var' && e.r.r.name === 'A',
    'session055: DISTRIB (B-C)*A → B*A - C*A');
}

/* ---- DISTRIB: (b+c)/a → b/a + c/a ---- */
{
  const s = new Stack();
  s.push(Symbolic(AstBin('/',
    AstBin('+', AstVar('B'), AstVar('C')),
    AstVar('A'))));
  lookup('DISTRIB').fn(s);
  const e = s.pop().expr;
  assert(e.kind === 'bin' && e.op === '+'
         && e.l.op === '/' && e.l.l.name === 'B' && e.l.r.name === 'A'
         && e.r.op === '/' && e.r.l.name === 'C' && e.r.r.name === 'A',
    'session055: DISTRIB (B+C)/A → B/A + C/A');
}

/* ---- DISTRIB: no distributable → unchanged ---- */
{
  const s = new Stack();
  s.push(Symbolic(AstBin('+', AstVar('X'), AstVar('Y'))));
  lookup('DISTRIB').fn(s);
  const e = s.pop().expr;
  assert(e.kind === 'bin' && e.op === '+'
         && e.l.name === 'X' && e.r.name === 'Y',
    'session055: DISTRIB X+Y → X+Y (no change)');
}

/* ---- DISTRIB: descends into children to find first distributable ---- */
{
  const s = new Stack();
  // (X + (A * (B + C)))  → distribute on inner A*(B+C)
  s.push(Symbolic(AstBin('+', AstVar('X'),
    AstBin('*', AstVar('A'),
      AstBin('+', AstVar('B'), AstVar('C'))))));
  lookup('DISTRIB').fn(s);
  const e = s.pop().expr;
  // Expected: X + (A*B + A*C)
  assert(e.kind === 'bin' && e.op === '+'
         && e.l.kind === 'var' && e.l.name === 'X'
         && e.r.kind === 'bin' && e.r.op === '+',
    'session055: DISTRIB recurses into children');
}

/* ---- DISTRIB: non-Symbolic input rejected ---- */
{
  const s = new Stack();
  s.push(Integer(5n));
  let threw = false;
  try { lookup('DISTRIB').fn(s); } catch (e) { threw = /Bad argument/.test(e.message); }
  assert(threw, 'session055: DISTRIB non-Symbolic throws');
}

/* ================================================================
   HERMITE / LEGENDRE / TCHEBYCHEFF (first-kind) and the TCHEB alias.

   All three ops run a three-term recurrence on a plain coefficient
   array (descending degree), then convert to a Symbolic expression
   in `X` via the shared `_coefArrToSymbolicX` helper in ops.js.  The
   tests evaluate the produced Symbolic at a handful of sample X
   values (via evalAst) and compare against the textbook polynomial
   values — this double-checks both the recurrence arithmetic and the
   coefficient-array → Symbolic translation.
   ================================================================ */

/* Reference closed-form polynomial values at x. */
function _refHermite(n, x) {
  // Physicist's Hermite: H_0 = 1, H_1 = 2x, H_{k+1} = 2x·H_k - 2k·H_{k-1}.
  if (n === 0) return 1;
  if (n === 1) return 2 * x;
  let a = 1, b = 2 * x;
  for (let k = 1; k < n; k++) {
    const c = 2 * x * b - 2 * k * a;
    a = b; b = c;
  }
  return b;
}
function _refLegendre(n, x) {
  if (n === 0) return 1;
  if (n === 1) return x;
  let a = 1, b = x;
  for (let k = 1; k < n; k++) {
    const c = ((2 * k + 1) * x * b - k * a) / (k + 1);
    a = b; b = c;
  }
  return b;
}
function _refTcheb(n, x) {
  if (n === 0) return 1;
  if (n === 1) return x;
  let a = 1, b = x;
  for (let k = 1; k < n; k++) {
    const c = 2 * x * b - a;
    a = b; b = c;
  }
  return b;
}

/* Evaluate the Symbolic result at a specific X value via evalAst.
   evalAst takes a `lookup(name) → number|null` callback and returns
   an AST node; when every Var folded, that node is `Num(k)`. */
function _evalSymAtX(sym, x) {
  const out = evalAst(sym.expr, (name) => name === 'X' ? x : null);
  if (!out || out.kind !== 'num') {
    throw new Error('evalAst did not fold to a Num: ' + JSON.stringify(out));
  }
  return out.value;
}

/* ---- HERMITE 0 / 1 / 3 / 5: closed-form values at x = 0.7, -1.2 ---- */
for (const n of [0, 1, 3, 5]) {
  for (const x of [0.7, -1.2]) {
    const s = new Stack();
    s.push(Integer(BigInt(n)));
    lookup('HERMITE').fn(s);
    const sym = s.pop();
    const got = _evalSymAtX(sym, x);
    const want = _refHermite(n, x);
    assert(Math.abs(got - want) < 1e-9,
      `session056: HERMITE(${n}) at x=${x} → ${got}, expect ${want}`);
  }
}

/* ---- HERMITE: H_3(X) = 8·X^3 - 12·X structural check ---- */
{
  const s = new Stack();
  s.push(Integer(3n));
  lookup('HERMITE').fn(s);
  const e = s.pop().expr;
  // Root of the expression should be '-' since 8X^3 is positive and
  // the -12X term follows.
  assert(e.kind === 'bin' && e.op === '-',
    'session056: HERMITE(3) root is subtraction (8X^3 - 12X)');
}

/* ---- LEGENDRE 0 / 1 / 2 / 4: closed-form values at x = 0.3, -0.8 ---- */
for (const n of [0, 1, 2, 4]) {
  for (const x of [0.3, -0.8]) {
    const s = new Stack();
    s.push(Integer(BigInt(n)));
    lookup('LEGENDRE').fn(s);
    const sym = s.pop();
    const got = _evalSymAtX(sym, x);
    const want = _refLegendre(n, x);
    assert(Math.abs(got - want) < 1e-9,
      `session056: LEGENDRE(${n}) at x=${x} → ${got}, expect ${want}`);
  }
}

/* ---- LEGENDRE(1) = X passthrough ---- */
{
  const s = new Stack();
  s.push(Integer(1n));
  lookup('LEGENDRE').fn(s);
  const e = s.pop().expr;
  assert(e.kind === 'var' && e.name === 'X',
    'session056: LEGENDRE(1) = X');
}

/* ---- TCHEBYCHEFF 0 / 1 / 3 / 6 at x = 0.5, -0.9 ---- */
for (const n of [0, 1, 3, 6]) {
  for (const x of [0.5, -0.9]) {
    const s = new Stack();
    s.push(Integer(BigInt(n)));
    lookup('TCHEBYCHEFF').fn(s);
    const sym = s.pop();
    const got = _evalSymAtX(sym, x);
    const want = _refTcheb(n, x);
    assert(Math.abs(got - want) < 1e-9,
      `session056: TCHEBYCHEFF(${n}) at x=${x} → ${got}, expect ${want}`);
  }
}

/* ---- TCHEB alias produces same result as TCHEBYCHEFF ---- */
{
  const s1 = new Stack(); s1.push(Integer(4n)); lookup('TCHEBYCHEFF').fn(s1);
  const s2 = new Stack(); s2.push(Integer(4n)); lookup('TCHEB').fn(s2);
  const e1 = s1.pop().expr, e2 = s2.pop().expr;
  // Evaluate at a couple of X values; the AST structure should match too.
  const at = (e, x) => {
    const r = evalAst(e, (name) => name === 'X' ? x : null);
    return r.value;
  };
  assert(Math.abs(at(e1, 0.6) - at(e2, 0.6)) < 1e-12 &&
         Math.abs(at(e1, -0.3) - at(e2, -0.3)) < 1e-12,
    'session056: TCHEB alias matches TCHEBYCHEFF numerically');
}

/* ---- HERMITE(0) = 1 (constant) ---- */
{
  const s = new Stack();
  s.push(Integer(0n));
  lookup('HERMITE').fn(s);
  const e = s.pop().expr;
  assert(e.kind === 'num' && e.value === 1,
    'session056: HERMITE(0) = constant 1');
}

/* ---- Negative n rejected (Bad argument value) — TCHEBYCHEFF
     accepts n<0 via the second-kind path, so only HERMITE and
     LEGENDRE appear here. ---- */
for (const name of ['HERMITE', 'LEGENDRE']) {
  const s = new Stack();
  s.push(Integer(-1n));
  let threw = false;
  try { lookup(name).fn(s); }
  catch (e) { threw = /Bad argument value/.test(e.message); }
  assert(threw, `session056: ${name}(-1) throws Bad argument value`);
}

/* ---- Non-integer Real rejected (Bad argument value) ---- */
{
  const s = new Stack();
  s.push(Real(2.5));
  let threw = false;
  try { lookup('HERMITE').fn(s); }
  catch (e) { threw = /Bad argument value/.test(e.message); }
  assert(threw, 'session056: HERMITE(2.5) non-integer throws');
}

/* ---- Non-numeric argument rejected (Bad argument type) ---- */
{
  const s = new Stack();
  s.push(RList([Real(3)]));
  let threw = false;
  try { lookup('LEGENDRE').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session056: LEGENDRE on list throws Bad argument type');
}

/* ---- Integer-valued Real accepted (n = 3.0 works like n = 3) ---- */
{
  const s = new Stack();
  s.push(Real(3));
  lookup('TCHEBYCHEFF').fn(s);
  const sym = s.pop();
  const got = _evalSymAtX(sym, 0.4);
  const want = _refTcheb(3, 0.4);
  assert(Math.abs(got - want) < 1e-12,
    'session056: TCHEBYCHEFF accepts integer-valued Real');
}

/* ================================================================
   TCHEBYCHEFF second-kind (negative n), FROOTS.

   MAD / AXL / AXM live in test-matrix.mjs (matrix / stats surface).
   ================================================================ */

/* Reference second-kind Chebyshev U_n(x):
     U_0 = 1, U_1 = 2x, U_{k+1} = 2x·U_k − U_{k-1}.  */
function _refTchebU(n, x) {
  if (n === 0) return 1;
  if (n === 1) return 2 * x;
  let a = 1, b = 2 * x;
  for (let k = 1; k < n; k++) {
    const c = 2 * x * b - a;
    a = b; b = c;
  }
  return b;
}

/* ---- TCHEBYCHEFF(-1) = U_0 = 1 ---- */
{
  const s = new Stack();
  s.push(Integer(-1n));
  lookup('TCHEBYCHEFF').fn(s);
  const sym = s.pop();
  assert(sym.expr.kind === 'num' && sym.expr.value === 1,
    'session057: TCHEBYCHEFF(-1) = U_0 = constant 1');
}

/* ---- TCHEBYCHEFF(-2) = U_1 = 2X ---- */
{
  const s = new Stack();
  s.push(Integer(-2n));
  lookup('TCHEBYCHEFF').fn(s);
  const sym = s.pop();
  const got = _evalSymAtX(sym, 0.37);
  const want = _refTchebU(1, 0.37);
  assert(Math.abs(got - want) < 1e-12,
    `session057: TCHEBYCHEFF(-2) at x=0.37 → ${got}, expect ${want}`);
}

/* ---- TCHEBYCHEFF neg 3..7 at x = 0.25, -0.8 ---- */
for (const nNeg of [-3, -4, -5, -7]) {
  for (const x of [0.25, -0.8]) {
    const s = new Stack();
    s.push(Integer(BigInt(nNeg)));
    lookup('TCHEBYCHEFF').fn(s);
    const sym = s.pop();
    const got = _evalSymAtX(sym, x);
    const want = _refTchebU(-nNeg - 1, x);
    assert(Math.abs(got - want) < 1e-9,
      `session057: TCHEBYCHEFF(${nNeg}) at x=${x} → ${got}, expect ${want}`);
  }
}

/* ---- TCHEB alias accepts negative n too ---- */
{
  const s = new Stack();
  s.push(Integer(-4n));
  lookup('TCHEB').fn(s);
  const sym = s.pop();
  const got = _evalSymAtX(sym, 0.6);
  const want = _refTchebU(3, 0.6);
  assert(Math.abs(got - want) < 1e-12,
    'session057: TCHEB alias accepts negative n');
}

/* ---- Non-integer Real still rejected on negative side ---- */
{
  const s = new Stack();
  s.push(Real(-2.5));
  let threw = false;
  try { lookup('TCHEBYCHEFF').fn(s); }
  catch (e) { threw = /Bad argument value/.test(e.message); }
  assert(threw, 'session057: TCHEBYCHEFF(-2.5) rejected');
}

/* ================================================================
   FROOTS — polynomial factoring from Symbolic side.  Piggy-backs on
   PROOT's Durand-Kerner loop; output is a flat RList alternating
   root and Integer multiplicity (HP50 AUR §12.5 shape).
   ================================================================ */

/* Helper: unpack a FROOTS result into an array of
   `{ root: { re, im }, mult: number }` so assertions can read cleanly. */
function _unpackFrootsResult(list) {
  assert(list.type === 'list', 'FROOTS returns a List');
  const items = list.items;
  assert(items.length % 2 === 0,
    'FROOTS result has even length (alternating root / mult)');
  const out = [];
  for (let i = 0; i < items.length; i += 2) {
    const r = items[i];
    const m = items[i + 1];
    let re, im;
    if (r.type === 'integer')      { re = Number(r.value); im = 0; }
    else if (r.type === 'real')    { re = r.value;         im = 0; }
    else if (r.type === 'complex') { re = r.re;            im = r.im; }
    else throw new Error('FROOTS root has unexpected type: ' + r.type);
    assert(m.type === 'integer',
      'FROOTS multiplicity is an Integer, got ' + m.type);
    out.push({ re, im, mult: Number(m.value) });
  }
  return out;
}

/* Approximate root-in-set comparison: roots come back in any order
   and with a smidge of float noise.  For each expected root, assert
   there's a result within tolerance; and the multiplicities sum to
   `degree`. */
function _assertRootsMatch(got, expected, name) {
  const mults = got.reduce((a, g) => a + g.mult, 0);
  assert(mults === expected.reduce((a, e) => a + e.mult, 0),
    `${name}: sum of multiplicities matches`);
  for (const e of expected) {
    let found = null;
    for (const g of got) {
      if (Math.abs(e.re - g.re) < 1e-4 && Math.abs(e.im - g.im) < 1e-4) {
        found = g; break;
      }
    }
    assert(found !== null,
      `${name}: root (${e.re}, ${e.im}) not found in ${JSON.stringify(got)}`);
    assert(found.mult === e.mult,
      `${name}: root (${e.re}, ${e.im}) multiplicity ${found.mult}, expected ${e.mult}`);
  }
}

/* ---- FROOTS X^2 - 5X + 6 = (X-2)(X-3) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2-5*X+6')));
  lookup('FROOTS').fn(s);
  const got = _unpackFrootsResult(s.pop());
  _assertRootsMatch(got,
    [{ re: 2, im: 0, mult: 1 }, { re: 3, im: 0, mult: 1 }],
    'session057: FROOTS X^2-5X+6');
}

/* ---- FROOTS (X-2)^3 = X^3 - 6X^2 + 12X - 8 → {2 3} ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^3-6*X^2+12*X-8')));
  lookup('FROOTS').fn(s);
  const got = _unpackFrootsResult(s.pop());
  _assertRootsMatch(got,
    [{ re: 2, im: 0, mult: 3 }],
    'session057: FROOTS (X-2)^3 clusters as {2 3}');
}

/* ---- FROOTS X^2 + 1 = (X-i)(X+i) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2+1')));
  lookup('FROOTS').fn(s);
  const got = _unpackFrootsResult(s.pop());
  _assertRootsMatch(got,
    [{ re: 0, im: 1, mult: 1 }, { re: 0, im: -1, mult: 1 }],
    'session057: FROOTS X^2+1 complex roots');
}

/* ---- FROOTS linear 2X + 6 = 0 → {-3 1} ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('2*X+6')));
  lookup('FROOTS').fn(s);
  const got = _unpackFrootsResult(s.pop());
  _assertRootsMatch(got,
    [{ re: -3, im: 0, mult: 1 }],
    'session057: FROOTS 2X+6 → -3');
}

/* ---- FROOTS X^3 - X = X(X-1)(X+1) → 3 simple real roots ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^3-X')));
  lookup('FROOTS').fn(s);
  const got = _unpackFrootsResult(s.pop());
  _assertRootsMatch(got,
    [{ re: 0, im: 0, mult: 1 },
     { re: 1, im: 0, mult: 1 },
     { re: -1, im: 0, mult: 1 }],
    'session057: FROOTS X^3-X → {0 1 -1}');
}

/* ---- FROOTS pure non-zero constant = 5 → empty list ---- */
{
  const s = new Stack();
  s.push(Symbolic(AstNum(5)));
  lookup('FROOTS').fn(s);
  const r = s.pop();
  assert(r.type === 'list' && r.items.length === 0,
    'session057: FROOTS on non-zero constant → empty list');
}

/* ---- FROOTS zero constant → Bad argument value ---- */
{
  const s = new Stack();
  s.push(Symbolic(AstNum(0)));
  let threw = false;
  try { lookup('FROOTS').fn(s); }
  catch (e) { threw = /Bad argument value/.test(e.message); }
  assert(threw, 'session057: FROOTS on zero constant throws');
}

/* ---- FROOTS rejects multi-variable ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2+Y+1')));
  let threw = false;
  try { lookup('FROOTS').fn(s); }
  catch (e) { threw = /Bad argument value/.test(e.message); }
  assert(threw, 'session057: FROOTS rejects multi-variable expression');
}

/* ---- FROOTS rejects rational (1/X) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1/X')));
  let threw = false;
  try { lookup('FROOTS').fn(s); }
  catch (e) { threw = /Bad argument value/.test(e.message); }
  assert(threw, 'session057: FROOTS rejects rational expression');
}

/* ---- FROOTS on non-Symbolic rejects with Bad argument type ---- */
{
  const s = new Stack();
  s.push(Real(5));
  let threw = false;
  try { lookup('FROOTS').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session057: FROOTS on Real throws Bad argument type');
}

/* ---- FROOTS on a non-X variable picks it automatically ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('Y^2-9')));   // roots ±3
  lookup('FROOTS').fn(s);
  const got = _unpackFrootsResult(s.pop());
  _assertRootsMatch(got,
    [{ re: 3, im: 0, mult: 1 }, { re: -3, im: 0, mult: 1 }],
    'session057: FROOTS Y^2-9 picks Y as main variable');
}

/* ---- FROOTS clusters a double root: (X-1)^2 = X^2-2X+1 → {1 2} ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2-2*X+1')));
  lookup('FROOTS').fn(s);
  const got = _unpackFrootsResult(s.pop());
  _assertRootsMatch(got,
    [{ re: 1, im: 0, mult: 2 }],
    'session057: FROOTS (X-1)^2 → {1 2}');
}

/* ================================================================
   FROOTS rational-root pre-scan, PREVAL, TAN2SC, LAPLACE / ILAP.

   FROOTS keeps Integer roots Integer (rather than Real-casting
   through Durand-Kerner).  PREVAL, TAN2SC, LAPLACE, ILAP are
   symbolic-algebra ops.
   ================================================================ */

/* ---- FROOTS rational-root pre-scan keeps Integer roots Integer ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2-5*X+6')));   // roots 2, 3
  lookup('FROOTS').fn(s);
  const list = s.pop();
  assert(list.type === 'list' && list.items.length === 4,
    'session058: FROOTS X^2-5X+6 → 4-item list');
  // The two roots should now both be Integer (not Real).
  const r1 = list.items[0], r2 = list.items[2];
  assert(isInteger(r1) && isInteger(r2),
    `session058: FROOTS X^2-5X+6 roots are Integer (got ${r1.type}, ${r2.type})`);
  const vals = new Set([Number(r1.value), Number(r2.value)]);
  assert(vals.has(2) && vals.has(3),
    'session058: FROOTS X^2-5X+6 roots include 2 and 3');
}

/* ---- FROOTS cubic with all integer roots ---- */
{
  const s = new Stack();
  // (X-1)(X-2)(X-3) = X^3 - 6X^2 + 11X - 6
  s.push(Symbolic(parseAlgebra('X^3-6*X^2+11*X-6')));
  lookup('FROOTS').fn(s);
  const list = s.pop();
  assert(list.items.length === 6,
    'session058: FROOTS cubic → 3 roots × 2 entries');
  const rootVals = [list.items[0], list.items[2], list.items[4]]
    .map(v => isInteger(v) ? Number(v.value) : (isReal(v) ? v.value : null));
  assert(rootVals.every(v => v !== null),
    `session058: FROOTS cubic roots are numeric (got ${rootVals})`);
  const sorted = rootVals.slice().sort((a, b) => a - b);
  assert(sorted[0] === 1 && sorted[1] === 2 && sorted[2] === 3,
    `session058: FROOTS cubic roots are {1, 2, 3} (sorted: ${sorted})`);
  // At least one root should be Integer-typed (ideally all).
  const intCount = [list.items[0], list.items[2], list.items[4]]
    .filter(isInteger).length;
  assert(intCount >= 1,
    `session058: FROOTS cubic has at least one Integer root (got ${intCount})`);
}

/* ---- FROOTS with rational root 1/2: 2X - 1 → {1/2 1} ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('2*X-1')));
  lookup('FROOTS').fn(s);
  const list = s.pop();
  assert(list.items.length === 2,
    'session058: FROOTS 2X-1 → linear root list');
  const r = list.items[0];
  // Expect rational Symbolic(1/2) or Real(0.5).
  if (isSymbolic(r)) {
    // Symbolic 1/2 form
    assert(r.expr && r.expr.kind === 'bin' && r.expr.op === '/',
      'session058: FROOTS 2X-1 root is Symbolic rational');
  } else {
    assert(isReal(r) && Math.abs(r.value - 0.5) < 1e-12,
      `session058: FROOTS 2X-1 root = 1/2 (got ${r.type}:${r.value})`);
  }
}

/* ---- FROOTS mixed integer + irrational: X^3 - X^2 - 2X + 2 ----
     = (X - 1)(X^2 - 2) = (X - 1)(X - √2)(X + √2).  Expected output:
     one Integer root (1) and two roots for ±√2.  The quadratic
     residual is extracted exactly, so the irrational roots come
     back as Symbolic nodes; Real (Durand-Kerner numerics) is also
     accepted as a fallback. */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^3-X^2-2*X+2')));
  lookup('FROOTS').fn(s);
  const list = s.pop();
  assert(list.items.length === 6,
    'session058: FROOTS X^3-X^2-2X+2 → 3 roots');
  const roots = [list.items[0], list.items[2], list.items[4]];
  const intRoots = roots.filter(isInteger);
  const nonIntRoots = roots.filter(r => !isInteger(r));
  assert(intRoots.length === 1 && Number(intRoots[0].value) === 1,
    `session058: rational-root pre-scan catches X=1 (int roots: ${intRoots.length})`);
  assert(nonIntRoots.length === 2,
    `session058: irrational roots ±√2 surface as 2 non-integer roots (got ${nonIntRoots.length})`);
  const allSymOrReal = nonIntRoots.every(r => isSymbolic(r) || isReal(r));
  assert(allSymOrReal,
    'session058: ±√2 roots are Symbolic or Real');
}

/* ================================================================
   PREVAL: F(X) a b → F(b) - F(a).
   ================================================================ */

/* ---- PREVAL of X^2 from 0 to 3 = 9 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2')));
  s.push(Real(0));
  s.push(Real(3));
  lookup('PREVAL').fn(s);
  const out = s.pop();
  assert(isReal(out) && Math.abs(out.value - 9) < 1e-12,
    'session058: PREVAL X^2 from 0 to 3 → 9');
}

/* ---- PREVAL of 2X+1 from 1 to 5 = (11)-(3) = 8 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('2*X+1')));
  s.push(Real(1));
  s.push(Real(5));
  lookup('PREVAL').fn(s);
  const out = s.pop();
  assert(isReal(out) && Math.abs(out.value - 8) < 1e-12,
    'session058: PREVAL 2X+1 from 1 to 5 → 8');
}

/* ---- PREVAL List-form: F(X) {a b} ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^3')));
  s.push(RList([Real(1), Real(2)]));
  lookup('PREVAL').fn(s);
  const out = s.pop();
  // 2^3 - 1^3 = 7
  assert(isReal(out) && Math.abs(out.value - 7) < 1e-12,
    'session058: PREVAL X^3 with {1 2} list → 7');
}

/* ---- PREVAL with Integer endpoints ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2')));
  s.push(Integer(0n));
  s.push(Integer(3n));
  lookup('PREVAL').fn(s);
  const out = s.pop();
  assert(isReal(out) && Math.abs(out.value - 9) < 1e-12,
    'session058: PREVAL accepts Integer endpoints');
}

/* ---- PREVAL with Symbolic endpoint stays Symbolic ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2')));
  s.push(Real(0));
  s.push(Symbolic(parseAlgebra('A')));
  lookup('PREVAL').fn(s);
  const out = s.pop();
  // F(A) - F(0) = A^2
  assert(isSymbolic(out),
    'session058: PREVAL with Symbolic endpoint returns Symbolic');
}

/* ---- PREVAL constant F returns 0 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('5')));
  s.push(Real(1));
  s.push(Real(2));
  lookup('PREVAL').fn(s);
  const out = s.pop();
  // F = 5: F(b) - F(a) = 0
  assert(isReal(out) && out.value.eq(0),
    'session058: PREVAL on constant F → 0');
}

/* ---- PREVAL multi-variable F substitutes VX ----
   PREVAL picks VX (default 'X') as the substitution variable, per
   HP50 AUR.  For F = X + Y with VX = X, result is
   (1 + Y) - (0 + Y) = 1. */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X+Y')));
  s.push(Real(0));
  s.push(Real(1));
  lookup('PREVAL').fn(s);
  const out = s.pop();
  assert(isReal(out) && Math.abs(out.value - 1) < 1e-12,
    'session076: PREVAL X+Y from 0 to 1 → 1 (substitutes VX=X)');
}

/* ---- PREVAL non-Symbolic F rejects ---- */
{
  const s = new Stack();
  s.push(Real(5));
  s.push(Real(0));
  s.push(Real(1));
  let threw = false;
  try { lookup('PREVAL').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session058: PREVAL non-Symbolic F rejects');
}

/* ================================================================
   TAN2SC: TAN(X) → SIN(X) / COS(X) rewrite.
   ================================================================ */

/* ---- TAN2SC on TAN(X) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('TAN(X)')));
  lookup('TAN2SC').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session058: TAN2SC returns Symbolic');
  // Expect '/' of SIN / COS at the top.
  const e = out.expr;
  assert(e && e.kind === 'bin' && e.op === '/'
    && e.l.kind === 'fn' && e.l.name === 'SIN'
    && e.r.kind === 'fn' && e.r.name === 'COS',
    'session058: TAN2SC TAN(X) → SIN(X)/COS(X)');
}

/* ---- TAN2SC leaves SIN / COS unchanged ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)+COS(X)')));
  lookup('TAN2SC').fn(s);
  const out = s.pop();
  assert(isSymbolic(out),
    'session058: TAN2SC on SIN+COS stays Symbolic');
}

/* ---- TAN2SC is idempotent ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('TAN(X)')));
  lookup('TAN2SC').fn(s);
  lookup('TAN2SC').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session058: TAN2SC idempotent');
  const e = out.expr;
  // Still SIN(X)/COS(X).
  assert(e && e.kind === 'bin' && e.op === '/'
    && e.l.kind === 'fn' && e.l.name === 'SIN',
    'session058: TAN2SC ∘ TAN2SC stable');
}

/* ---- TAN2SC deep: 1 + TAN(X)^2 → 1 + (SIN/COS)^2 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1+TAN(X)^2')));
  lookup('TAN2SC').fn(s);
  const out = s.pop();
  assert(isSymbolic(out),
    'session058: TAN2SC walks into 1+TAN(X)^2');
  // Verify no TAN remains anywhere via freeVars-style walk.
  function hasTan(node) {
    if (!node) return false;
    if (node.kind === 'fn' && node.name === 'TAN') return true;
    if (node.kind === 'neg') return hasTan(node.arg);
    if (node.kind === 'bin') return hasTan(node.l) || hasTan(node.r);
    if (node.kind === 'fn') return node.args.some(hasTan);
    return false;
  }
  assert(!hasTan(out.expr),
    'session058: TAN2SC eliminates all TAN nodes from 1+TAN(X)^2');
}

/* ---- TAN2SC on non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(1));
  let threw = false;
  try { lookup('TAN2SC').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session058: TAN2SC on Real rejects');
}

/* ================================================================
   LAPLACE / ILAP basic rules.
   ================================================================ */

/* ---- LAPLACE of 1 = 1/X ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session058: LAPLACE(1) returns Symbolic');
  // Expect 1/X.
  const e = out.expr;
  assert(e && e.kind === 'bin' && e.op === '/'
    && e.l.kind === 'num' && e.l.value === 1
    && e.r.kind === 'var' && e.r.name === 'X',
    'session058: LAPLACE(1) = 1/X');
}

/* ---- LAPLACE of X = 1/X^2 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  const e = out.expr;
  assert(e && e.kind === 'bin' && e.op === '/',
    'session058: LAPLACE(X) top is division');
  // r side should be X^2
  assert(e.r.kind === 'bin' && e.r.op === '^'
    && e.r.l.kind === 'var' && e.r.l.name === 'X'
    && e.r.r.kind === 'num' && e.r.r.value === 2,
    'session058: LAPLACE(X) = 1 / X^2');
}

/* ---- LAPLACE of X^2 = 2/X^3 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  const e = out.expr;
  assert(e && e.kind === 'bin' && e.op === '/',
    'session058: LAPLACE(X^2) = num/den');
  // numerator should be 2! = 2; denominator should be X^3.
  assert(e.l.kind === 'num' && e.l.value === 2,
    `session058: LAPLACE(X^2) numerator = 2 (got ${e.l.value})`);
  assert(e.r.kind === 'bin' && e.r.op === '^'
    && e.r.r.kind === 'num' && e.r.r.value === 3,
    'session058: LAPLACE(X^2) denominator = X^3');
}

/* ---- LAPLACE of EXP(2X) = 1 / (X - 2) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('EXP(2*X)')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  const e = out.expr;
  assert(e && e.kind === 'bin' && e.op === '/',
    'session058: LAPLACE(EXP(2X)) is division');
  assert(e.l.kind === 'num' && e.l.value === 1,
    'session058: LAPLACE(EXP(2X)) numerator = 1');
  // Denominator should be X - 2
  assert(e.r.kind === 'bin' && e.r.op === '-'
    && e.r.l.kind === 'var' && e.r.l.name === 'X'
    && e.r.r.kind === 'num' && e.r.r.value === 2,
    'session058: LAPLACE(EXP(2X)) denominator = X - 2');
}

/* ---- LAPLACE of SIN(3X) = 3 / (X^2 + 9) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(3*X)')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  const e = out.expr;
  assert(e && e.kind === 'bin' && e.op === '/',
    'session058: LAPLACE(SIN(3X)) is division');
  // numerator = 3
  assert(e.l.kind === 'num' && e.l.value === 3,
    'session058: LAPLACE(SIN(3X)) numerator = 3');
}

/* ---- LAPLACE of COS(X) = X / (X^2 + 1) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('COS(X)')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  const e = out.expr;
  assert(e && e.kind === 'bin' && e.op === '/'
    && e.l.kind === 'var' && e.l.name === 'X',
    'session058: LAPLACE(COS(X)) numerator is X');
}

/* ---- LAPLACE distributes over sum: LAPLACE(1 + X) = 1/X + 1/X^2 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1+X')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  const e = out.expr;
  assert(e && e.kind === 'bin' && e.op === '+',
    'session058: LAPLACE(1+X) is a sum');
}

/* ---- LAPLACE pulls scalar out: LAPLACE(5·SIN(X)) = 5 · (1/(X^2+1)) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('5*SIN(X)')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  const e = out.expr;
  // Expect 5 * (1/(X^2+1))
  assert(e && e.kind === 'bin' && e.op === '*',
    'session058: LAPLACE(5·SIN(X)) top is product');
  // One side is 5.
  const lv = e.l.kind === 'num' ? e.l.value : null;
  const rv = e.r.kind === 'num' ? e.r.value : null;
  assert(lv === 5 || rv === 5,
    'session058: LAPLACE(5·SIN(X)) keeps 5 out front');
}

/* ---- ILAP inverse of 1/X = 1 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1/X')));
  lookup('ILAP').fn(s);
  const out = s.pop();
  // Expect Num(1) which may unwrap to Real(1) via _pushSubstResult-style
  // collapse — here we pushed a Symbolic AST, so it stays Symbolic.
  assert(isSymbolic(out) && out.expr.kind === 'num' && out.expr.value === 1,
    `session058: ILAP(1/X) = 1`);
}

/* ---- ILAP of 1/X^2 = X ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1/X^2')));
  lookup('ILAP').fn(s);
  const out = s.pop();
  assert(isSymbolic(out),
    'session058: ILAP(1/X^2) is Symbolic');
  // Expect X (possibly inside a simplify wrapper).
  assert(out.expr.kind === 'var' && out.expr.name === 'X',
    `session058: ILAP(1/X^2) = X`);
}

/* ---- ILAP of 1/(X-3) = EXP(3·X) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1/(X-3)')));
  lookup('ILAP').fn(s);
  const out = s.pop();
  // Expect EXP(3·X) at top.
  assert(isSymbolic(out)
    && out.expr.kind === 'fn' && out.expr.name === 'EXP',
    'session058: ILAP(1/(X-3)) = EXP(3·X)');
}

/* ---- LAPLACE / ILAP round-trip on SIN(X) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)')));
  lookup('LAPLACE').fn(s);
  lookup('ILAP').fn(s);
  const out = s.pop();
  assert(isSymbolic(out),
    'session058: LAPLACE∘ILAP(SIN(X)) is Symbolic');
  // The result should contain SIN.
  function hasFn(node, name) {
    if (!node) return false;
    if (node.kind === 'fn' && node.name === name) return true;
    if (node.kind === 'neg') return hasFn(node.arg, name);
    if (node.kind === 'bin') return hasFn(node.l, name) || hasFn(node.r, name);
    if (node.kind === 'fn') return node.args.some(a => hasFn(a, name));
    return false;
  }
  assert(hasFn(out.expr, 'SIN'),
    'session058: LAPLACE∘ILAP(SIN(X)) contains SIN');
}

/* ---- LAPLACE non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(1));
  let threw = false;
  try { lookup('LAPLACE').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session058: LAPLACE on Real rejects');
}

/* ---- ILAP non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(1));
  let threw = false;
  try { lookup('ILAP').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session058: ILAP on Real rejects');
}

/* ================================================================
   HALFTAN, TAN2SC2, TAN2CS2, ACOS2S, ASIN2C,
   ASIN2T, ATAN2S, FROOTS exact quadratic residual.
   ================================================================ */

// Shared helper: does the AST contain a call to `name`?
function _s059HasFn(node, name) {
  if (!node) return false;
  if (node.kind === 'fn' && node.name === name) return true;
  if (node.kind === 'neg') return _s059HasFn(node.arg, name);
  if (node.kind === 'bin') return _s059HasFn(node.l, name) || _s059HasFn(node.r, name);
  if (node.kind === 'fn') return node.args.some(a => _s059HasFn(a, name));
  return false;
}

/* ---- HALFTAN returns Symbolic ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)')));
  lookup('HALFTAN').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session059: HALFTAN returns Symbolic');
}

/* ---- HALFTAN SIN(X) rewrite introduces TAN and drops SIN ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)')));
  lookup('HALFTAN').fn(s);
  const out = s.pop();
  assert(_s059HasFn(out.expr, 'TAN'),
    'session059: HALFTAN(SIN(X)) introduces TAN');
  assert(!_s059HasFn(out.expr, 'SIN'),
    'session059: HALFTAN(SIN(X)) eliminates SIN');
}

/* ---- HALFTAN COS(X) rewrite introduces TAN and drops COS ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('COS(X)')));
  lookup('HALFTAN').fn(s);
  const out = s.pop();
  assert(_s059HasFn(out.expr, 'TAN'),
    'session059: HALFTAN(COS(X)) introduces TAN');
  assert(!_s059HasFn(out.expr, 'COS'),
    'session059: HALFTAN(COS(X)) eliminates COS');
}

/* ---- HALFTAN TAN(X) rewrite keeps TAN (but now of X/2) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('TAN(X)')));
  lookup('HALFTAN').fn(s);
  const out = s.pop();
  assert(_s059HasFn(out.expr, 'TAN'),
    'session059: HALFTAN(TAN(X)) keeps TAN (of X/2)');
  // Output shape is a division: 2·t / (1 - t²)
  assert(out.expr.kind === 'bin' && out.expr.op === '/',
    'session059: HALFTAN(TAN(X)) top is a quotient');
}

/* ---- HALFTAN walks into 1+SIN(X) sums ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1+SIN(X)')));
  lookup('HALFTAN').fn(s);
  const out = s.pop();
  assert(isSymbolic(out),
    'session059: HALFTAN(1+SIN(X)) returns Symbolic');
  assert(!_s059HasFn(out.expr, 'SIN'),
    'session059: HALFTAN walks into the sum and eliminates SIN');
}

/* ---- HALFTAN non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(1));
  let threw = false;
  try { lookup('HALFTAN').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session059: HALFTAN on Real rejects');
}

/* ---- TAN2SC2 returns Symbolic ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('TAN(X)')));
  lookup('TAN2SC2').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session059: TAN2SC2 returns Symbolic');
}

/* ---- TAN2SC2 TAN(X) → SIN(2X) / (1 + COS(2X)) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('TAN(X)')));
  lookup('TAN2SC2').fn(s);
  const out = s.pop();
  assert(!_s059HasFn(out.expr, 'TAN'),
    'session059: TAN2SC2(TAN(X)) eliminates TAN');
  assert(_s059HasFn(out.expr, 'SIN') && _s059HasFn(out.expr, 'COS'),
    'session059: TAN2SC2(TAN(X)) introduces SIN and COS');
  assert(out.expr.kind === 'bin' && out.expr.op === '/',
    'session059: TAN2SC2 result is a division');
}

/* ---- TAN2SC2 walks into 1+TAN(X)^2 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1+TAN(X)^2')));
  lookup('TAN2SC2').fn(s);
  const out = s.pop();
  assert(!_s059HasFn(out.expr, 'TAN'),
    'session059: TAN2SC2 walks into 1+TAN(X)^2 and eliminates TAN');
}

/* ---- TAN2SC2 non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(1));
  let threw = false;
  try { lookup('TAN2SC2').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session059: TAN2SC2 on Real rejects');
}

/* ---- TAN2CS2 TAN(X) → (1 - COS(2X)) / SIN(2X) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('TAN(X)')));
  lookup('TAN2CS2').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session059: TAN2CS2 returns Symbolic');
  assert(!_s059HasFn(out.expr, 'TAN'),
    'session059: TAN2CS2(TAN(X)) eliminates TAN');
  assert(_s059HasFn(out.expr, 'SIN') && _s059HasFn(out.expr, 'COS'),
    'session059: TAN2CS2(TAN(X)) introduces SIN and COS');
  assert(out.expr.kind === 'bin' && out.expr.op === '/',
    'session059: TAN2CS2 result is a division');
}

/* ---- TAN2CS2 walks into 1+TAN(X)^2 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1+TAN(X)^2')));
  lookup('TAN2CS2').fn(s);
  const out = s.pop();
  assert(!_s059HasFn(out.expr, 'TAN'),
    'session059: TAN2CS2 walks into 1+TAN(X)^2 and eliminates TAN');
}

/* ---- TAN2CS2 non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(1));
  let threw = false;
  try { lookup('TAN2CS2').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session059: TAN2CS2 on Real rejects');
}

/* ---- ACOS2S : ACOS(X) → π/2 - ASIN(X) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('ACOS(X)')));
  lookup('ACOS2S').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session059: ACOS2S returns Symbolic');
  assert(!_s059HasFn(out.expr, 'ACOS'),
    'session059: ACOS2S(ACOS(X)) eliminates ACOS');
  assert(_s059HasFn(out.expr, 'ASIN'),
    'session059: ACOS2S introduces ASIN');
  assert(out.expr.kind === 'bin' && out.expr.op === '-',
    'session059: ACOS2S result top-level is subtraction');
}

/* ---- ACOS2S non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(0.5));
  let threw = false;
  try { lookup('ACOS2S').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session059: ACOS2S on Real rejects');
}

/* ---- ASIN2C : ASIN(X) → π/2 - ACOS(X) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('ASIN(X)')));
  lookup('ASIN2C').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session059: ASIN2C returns Symbolic');
  assert(!_s059HasFn(out.expr, 'ASIN'),
    'session059: ASIN2C(ASIN(X)) eliminates ASIN');
  assert(_s059HasFn(out.expr, 'ACOS'),
    'session059: ASIN2C introduces ACOS');
}

/* ---- ASIN2C non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(0.5));
  let threw = false;
  try { lookup('ASIN2C').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session059: ASIN2C on Real rejects');
}

/* ---- ASIN2T : ASIN(X) → ATAN(X / √(1 - X²)) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('ASIN(X)')));
  lookup('ASIN2T').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session059: ASIN2T returns Symbolic');
  assert(!_s059HasFn(out.expr, 'ASIN'),
    'session059: ASIN2T(ASIN(X)) eliminates ASIN');
  assert(_s059HasFn(out.expr, 'ATAN'),
    'session059: ASIN2T introduces ATAN');
  assert(_s059HasFn(out.expr, 'SQRT'),
    'session059: ASIN2T result contains SQRT(1 - X²)');
}

/* ---- ASIN2T non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(0.5));
  let threw = false;
  try { lookup('ASIN2T').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session059: ASIN2T on Real rejects');
}

/* ---- ATAN2S : ATAN(X) → ASIN(X / √(X² + 1)) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('ATAN(X)')));
  lookup('ATAN2S').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session059: ATAN2S returns Symbolic');
  assert(!_s059HasFn(out.expr, 'ATAN'),
    'session059: ATAN2S(ATAN(X)) eliminates ATAN');
  assert(_s059HasFn(out.expr, 'ASIN'),
    'session059: ATAN2S introduces ASIN');
  assert(_s059HasFn(out.expr, 'SQRT'),
    'session059: ATAN2S result contains SQRT(X² + 1)');
}

/* ---- ATAN2S non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(0.5));
  let threw = false;
  try { lookup('ATAN2S').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session059: ATAN2S on Real rejects');
}

/* ---- ACOS2S ∘ ASIN2C round-trips through ASIN/ACOS ---- */
// Not an exact identity (the nested subtractions differ), but the walk
// should be stable and produce Symbolic output both ways.
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('ASIN(X)+ACOS(X)')));
  lookup('ACOS2S').fn(s);
  const out = s.pop();
  assert(isSymbolic(out),
    'session059: ACOS2S walks into ASIN(X)+ACOS(X) and returns Symbolic');
  assert(!_s059HasFn(out.expr, 'ACOS'),
    'session059: ACOS2S eliminates the ACOS side of ASIN(X)+ACOS(X)');
}

/* ---- FROOTS X² - 2 yields exact ±√2 Symbolic roots ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2-2')));
  lookup('FROOTS').fn(s);
  const list = s.pop();
  assert(list.type === 'list' && list.items.length === 4,
    'session059: FROOTS X²-2 → 2 roots');
  const [r1, m1, r2, m2] = list.items;
  assert(isSymbolic(r1) && isSymbolic(r2),
    'session059: X²-2 roots are both Symbolic (exact)');
  assert(isInteger(m1) && Number(m1.value) === 1 &&
         isInteger(m2) && Number(m2.value) === 1,
    'session059: X²-2 roots have multiplicity 1');
  // One root must contain SQRT(2); both must
  assert(_s059HasFn(r1.expr, 'SQRT') && _s059HasFn(r2.expr, 'SQRT'),
    'session059: X²-2 roots contain SQRT(2)');
  // One is a bare SQRT, the other a neg of SQRT (sign distinction)
  const oneIsNeg = r1.expr.kind === 'neg' || r2.expr.kind === 'neg';
  assert(oneIsNeg,
    'session059: one of X²-2 roots is the negation');
}

/* ---- FROOTS X² + X - 1 yields the golden-ratio pair ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2+X-1')));
  lookup('FROOTS').fn(s);
  const list = s.pop();
  assert(list.type === 'list' && list.items.length === 4,
    'session059: FROOTS X²+X-1 → 2 roots');
  const [r1, , r2] = list.items;
  assert(isSymbolic(r1) && isSymbolic(r2),
    'session059: X²+X-1 roots are Symbolic');
  // Both roots should be divisions by 2 and contain SQRT(5).
  assert(r1.expr.kind === 'bin' && r1.expr.op === '/',
    'session059: X²+X-1 root is a fraction');
  assert(_s059HasFn(r1.expr, 'SQRT') && _s059HasFn(r2.expr, 'SQRT'),
    'session059: X²+X-1 roots contain SQRT(5)');
  // Verify the radicand is 5 in one of the SQRT nodes.
  function findSqrtArg(node) {
    if (!node) return null;
    if (node.kind === 'fn' && node.name === 'SQRT') return node.args[0];
    if (node.kind === 'neg') return findSqrtArg(node.arg);
    if (node.kind === 'bin') return findSqrtArg(node.l) || findSqrtArg(node.r);
    if (node.kind === 'fn') {
      for (const a of node.args) {
        const r = findSqrtArg(a); if (r) return r;
      }
    }
    return null;
  }
  const sq = findSqrtArg(r1.expr);
  assert(sq && sq.kind === 'num' && sq.value === 5,
    'session059: X²+X-1 radicand is 5');
}

/* ---- FROOTS 2X² - 1 yields ±√2 / 2 (gcd reduction works) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('2*X^2-1')));
  lookup('FROOTS').fn(s);
  const list = s.pop();
  assert(list.type === 'list' && list.items.length === 4,
    'session059: FROOTS 2X²-1 → 2 roots');
  const [r1, , r2] = list.items;
  assert(isSymbolic(r1) && isSymbolic(r2),
    'session059: 2X²-1 roots are Symbolic');
  // Both are (±√2)/2 — a division by 2.  The numerator is either
  // SQRT(2) or AstNeg(SQRT(2)).
  const topOp = (n) => n.expr.kind === 'bin' ? n.expr.op : null;
  assert(topOp(r1) === '/' && topOp(r2) === '/',
    'session059: 2X²-1 roots are both divisions');
  const denom = r1.expr.r;
  assert(denom.kind === 'num' && denom.value === 2,
    'session059: 2X²-1 roots have denominator 2');
}

/* ---- FROOTS 2X² + 3X - 1 yields (-3 ± √17)/4 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('2*X^2+3*X-1')));
  lookup('FROOTS').fn(s);
  const list = s.pop();
  assert(list.type === 'list' && list.items.length === 4,
    'session059: FROOTS 2X²+3X-1 → 2 roots');
  const [r1, , r2] = list.items;
  assert(isSymbolic(r1) && isSymbolic(r2),
    'session059: 2X²+3X-1 roots are Symbolic');
  // Each root is a division; denominator is 4.
  assert(r1.expr.kind === 'bin' && r1.expr.op === '/' &&
         r1.expr.r.kind === 'num' && r1.expr.r.value === 4,
    'session059: 2X²+3X-1 root denominator is 4');
  // SQRT(17) must appear.
  function findSqrtArg(node) {
    if (!node) return null;
    if (node.kind === 'fn' && node.name === 'SQRT') return node.args[0];
    if (node.kind === 'neg') return findSqrtArg(node.arg);
    if (node.kind === 'bin') return findSqrtArg(node.l) || findSqrtArg(node.r);
    return null;
  }
  const sq = findSqrtArg(r1.expr);
  assert(sq && sq.kind === 'num' && sq.value === 17,
    'session059: 2X²+3X-1 radicand is 17');
}

/* ---- FROOTS X² + 1 still yields complex roots (D < 0 defers) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2+1')));
  lookup('FROOTS').fn(s);
  const list = s.pop();
  // Complex conjugate pair — deferred to Durand-Kerner / PROOT path.
  assert(list.items.length >= 2,
    'session059: FROOTS X²+1 still produces complex roots');
  // No root should be a Symbolic (that would be the wrong path for D<0).
  const hasSymRoot = list.items.filter((_,i) => i%2===0)
                              .some(r => isSymbolic(r));
  assert(!hasSymRoot,
    'session059: FROOTS X²+1 does not misroute to the exact-quadratic branch');
}

/* ---- FROOTS X² - 1 still yields rational roots (√D integer path) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2-1')));
  lookup('FROOTS').fn(s);
  const list = s.pop();
  // (X-1)(X+1) — both roots rational ⇒ Integer, not Symbolic.
  assert(list.items.length === 4,
    'session059: FROOTS X²-1 → 2 roots');
  const [r1, , r2] = list.items;
  assert(isInteger(r1) && isInteger(r2),
    'session059: X²-1 roots stay Integer (exact-quadratic branch declines)');
}

/* ---- FROOTS quadratic-residual branch composes with rational pre-scan ----
     (X - 1)(X² - 5) = X³ - X² - 5X + 5 — rational root X=1, then
     quadratic residual X² - 5 → ±√5. */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^3-X^2-5*X+5')));
  lookup('FROOTS').fn(s);
  const list = s.pop();
  assert(list.items.length === 6,
    'session059: FROOTS (X-1)(X²-5) → 3 roots');
  const roots = [list.items[0], list.items[2], list.items[4]];
  const intRoots = roots.filter(isInteger);
  const symRoots = roots.filter(isSymbolic);
  assert(intRoots.length === 1 && Number(intRoots[0].value) === 1,
    'session059: pre-scan catches X=1');
  assert(symRoots.length === 2,
    'session059: quadratic-residual branch catches ±√5 as Symbolic');
}

/* ================================================================
   TEXPAND, TLIN, TCOLLECT, EXPLN.
   ================================================================ */

// Shared: does the AST contain a call to `name`?
function _s060HasFn(node, name) {
  if (!node) return false;
  if (node.kind === 'fn' && node.name === name) return true;
  if (node.kind === 'neg') return _s060HasFn(node.arg, name);
  if (node.kind === 'bin') return _s060HasFn(node.l, name) || _s060HasFn(node.r, name);
  if (node.kind === 'fn') return node.args.some(a => _s060HasFn(a, name));
  return false;
}

// Shared: does the AST reference the Var named `name`?
function _s060HasVar(node, name) {
  if (!node) return false;
  if (node.kind === 'var') return node.name === name;
  if (node.kind === 'neg') return _s060HasVar(node.arg, name);
  if (node.kind === 'bin') return _s060HasVar(node.l, name) || _s060HasVar(node.r, name);
  if (node.kind === 'fn') return node.args.some(a => _s060HasVar(a, name));
  return false;
}

/* ---- TEXPAND returns Symbolic ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(A+B)')));
  lookup('TEXPAND').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session060: TEXPAND returns Symbolic');
}

/* ---- TEXPAND SIN(A+B) → SIN(A)COS(B) + COS(A)SIN(B) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(A+B)')));
  lookup('TEXPAND').fn(s);
  const out = s.pop();
  // Expect top-level bin('+') with both sides products of SIN and COS.
  assert(out.expr.kind === 'bin' && out.expr.op === '+',
    'session060: TEXPAND SIN(A+B) top is addition');
  assert(_s060HasFn(out.expr, 'SIN') && _s060HasFn(out.expr, 'COS'),
    'session060: TEXPAND SIN(A+B) introduces both SIN and COS');
}

/* ---- TEXPAND SIN(A-B) uses subtraction at the top ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(A-B)')));
  lookup('TEXPAND').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '-',
    'session060: TEXPAND SIN(A-B) top is subtraction');
}

/* ---- TEXPAND COS(A+B) top is subtraction (COS·COS - SIN·SIN) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('COS(A+B)')));
  lookup('TEXPAND').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '-',
    'session060: TEXPAND COS(A+B) top is subtraction');
  assert(_s060HasFn(out.expr, 'SIN') && _s060HasFn(out.expr, 'COS'),
    'session060: TEXPAND COS(A+B) keeps SIN and COS');
}

/* ---- TEXPAND COS(A-B) top is addition (COS·COS + SIN·SIN) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('COS(A-B)')));
  lookup('TEXPAND').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '+',
    'session060: TEXPAND COS(A-B) top is addition');
}

/* ---- TEXPAND TAN(A+B) becomes a division with TAN in both parts ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('TAN(A+B)')));
  lookup('TEXPAND').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '/',
    'session060: TEXPAND TAN(A+B) top is division');
  assert(_s060HasFn(out.expr, 'TAN'),
    'session060: TEXPAND TAN(A+B) preserves TAN in both sides');
}

/* ---- TEXPAND TAN(A-B) denominator uses + (dual sign) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('TAN(A-B)')));
  lookup('TEXPAND').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '/',
    'session060: TEXPAND TAN(A-B) top is division');
  // Numerator has TAN(A)-TAN(B) (op='-') ; denominator has 1+TAN·TAN (op='+')
  assert(out.expr.l.kind === 'bin' && out.expr.l.op === '-',
    'session060: TEXPAND TAN(A-B) numerator uses -');
  assert(out.expr.r.kind === 'bin' && out.expr.r.op === '+',
    'session060: TEXPAND TAN(A-B) denominator uses +');
}

/* ---- TEXPAND parity: SIN(-X) = -SIN(X) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(-X)')));
  lookup('TEXPAND').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'neg',
    'session060: TEXPAND SIN(-X) top-level is negation');
  assert(_s060HasFn(out.expr, 'SIN'),
    'session060: TEXPAND SIN(-X) keeps SIN');
}

/* ---- TEXPAND parity: COS(-X) = COS(X) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('COS(-X)')));
  lookup('TEXPAND').fn(s);
  const out = s.pop();
  // Top is now a bare COS(X) — no neg at top.
  assert(out.expr.kind === 'fn' && out.expr.name === 'COS',
    'session060: TEXPAND COS(-X) collapses to COS(X)');
  assert(out.expr.args[0].kind === 'var' && out.expr.args[0].name === 'X',
    'session060: TEXPAND COS(-X) argument is X (not -X)');
}

/* ---- TEXPAND leaves SIN(X) (bare var arg) unchanged ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)')));
  lookup('TEXPAND').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'fn' && out.expr.name === 'SIN',
    'session060: TEXPAND SIN(X) is unchanged (no sum to expand)');
}

/* ---- TEXPAND walks into outer sums ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(A+B)+COS(A-B)')));
  lookup('TEXPAND').fn(s);
  const out = s.pop();
  // Outer bin('+') stays at top; each SIN/COS call expanded.
  assert(out.expr.kind === 'bin' && out.expr.op === '+',
    'session060: TEXPAND walks into outer sum');
}

/* ---- TEXPAND non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(1));
  let threw = false;
  try { lookup('TEXPAND').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session060: TEXPAND on Real rejects');
}

/* ---- TLIN returns Symbolic ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)*COS(X)')));
  lookup('TLIN').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session060: TLIN returns Symbolic');
}

/* ---- TLIN SIN(X)·COS(X) → (SIN(2X)+SIN(0))/2 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)*COS(X)')));
  lookup('TLIN').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '/',
    'session060: TLIN result is a division');
  // Denominator is literal 2.
  assert(out.expr.r.kind === 'num' && out.expr.r.value === 2,
    'session060: TLIN denominator is 2');
  // Numerator has SIN calls (SIN(X+X) and SIN(X-X)).
  assert(_s060HasFn(out.expr.l, 'SIN'),
    'session060: TLIN SIN·COS numerator contains SIN');
}

/* ---- TLIN SIN(A)·SIN(B) uses COS(a-b) - COS(a+b) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(A)*SIN(B)')));
  lookup('TLIN').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '/',
    'session060: TLIN SIN·SIN is a division');
  // Numerator is COS - COS.
  assert(out.expr.l.kind === 'bin' && out.expr.l.op === '-',
    'session060: TLIN SIN·SIN numerator is a subtraction');
  assert(_s060HasFn(out.expr.l, 'COS'),
    'session060: TLIN SIN·SIN numerator uses COS');
  assert(!_s060HasFn(out.expr.l, 'SIN'),
    'session060: TLIN SIN·SIN eliminates SIN in the numerator');
}

/* ---- TLIN COS(A)·COS(B) uses COS(a-b) + COS(a+b) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('COS(A)*COS(B)')));
  lookup('TLIN').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '/',
    'session060: TLIN COS·COS is a division');
  assert(out.expr.l.kind === 'bin' && out.expr.l.op === '+',
    'session060: TLIN COS·COS numerator is an addition');
}

/* ---- TLIN SIN²(X) → (1 - COS(2X))/2 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)^2')));
  lookup('TLIN').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '/',
    'session060: TLIN SIN²(X) is a division');
  assert(!_s060HasFn(out.expr, 'SIN'),
    'session060: TLIN SIN²(X) eliminates SIN');
  assert(_s060HasFn(out.expr, 'COS'),
    'session060: TLIN SIN²(X) introduces COS');
  // Numerator is 1 - COS(2X)
  assert(out.expr.l.kind === 'bin' && out.expr.l.op === '-',
    'session060: TLIN SIN²(X) numerator is 1 - COS(...)');
}

/* ---- TLIN COS²(X) → (1 + COS(2X))/2 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('COS(X)^2')));
  lookup('TLIN').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '/',
    'session060: TLIN COS²(X) is a division');
  // Numerator is 1 + COS(2X)
  assert(out.expr.l.kind === 'bin' && out.expr.l.op === '+',
    'session060: TLIN COS²(X) numerator is 1 + COS(...)');
}

/* ---- TLIN leaves non-trig products unchanged ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X*Y')));
  lookup('TLIN').fn(s);
  const out = s.pop();
  // X*Y is a product of vars; no rewrite.
  assert(out.expr.kind === 'bin' && out.expr.op === '*',
    'session060: TLIN X*Y stays as a product');
}

/* ---- TLIN non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(1));
  let threw = false;
  try { lookup('TLIN').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session060: TLIN on Real rejects');
}

/* ---- TCOLLECT returns Symbolic ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(A)+SIN(B)')));
  lookup('TCOLLECT').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session060: TCOLLECT returns Symbolic');
}

/* ---- TCOLLECT SIN(A)+SIN(B) → 2·SIN((A+B)/2)·COS((A-B)/2) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(A)+SIN(B)')));
  lookup('TCOLLECT').fn(s);
  const out = s.pop();
  // Top is a multiplication (2 * SIN(...)) * COS(...).
  assert(out.expr.kind === 'bin' && out.expr.op === '*',
    'session060: TCOLLECT SIN+SIN top is multiplication');
  assert(_s060HasFn(out.expr, 'SIN') && _s060HasFn(out.expr, 'COS'),
    'session060: TCOLLECT SIN+SIN introduces both SIN and COS');
}

/* ---- TCOLLECT SIN(A)-SIN(B) introduces a leading COS (not SIN) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(A)-SIN(B)')));
  lookup('TCOLLECT').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '*',
    'session060: TCOLLECT SIN-SIN top is multiplication');
  // 2·COS(sum)·SIN(diff) : the left factor is `2·COS(sum)`; the right
  // factor is `SIN(diff)`.  Keep tests at the has-fn level so we don't
  // over-constrain associativity.
  assert(_s060HasFn(out.expr, 'COS'),
    'session060: TCOLLECT SIN-SIN introduces COS');
}

/* ---- TCOLLECT COS(A)+COS(B) uses only COS ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('COS(A)+COS(B)')));
  lookup('TCOLLECT').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '*',
    'session060: TCOLLECT COS+COS top is multiplication');
  assert(!_s060HasFn(out.expr, 'SIN'),
    'session060: TCOLLECT COS+COS does not introduce SIN');
  assert(_s060HasFn(out.expr, 'COS'),
    'session060: TCOLLECT COS+COS preserves COS');
}

/* ---- TCOLLECT COS(A)-COS(B) produces a negated product ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('COS(A)-COS(B)')));
  lookup('TCOLLECT').fn(s);
  const out = s.pop();
  // COS(A) - COS(B) = -2·SIN((A+B)/2)·SIN((A-B)/2).  Top-level is neg.
  assert(out.expr.kind === 'neg',
    'session060: TCOLLECT COS-COS top-level is negation');
  assert(!_s060HasFn(out.expr, 'COS'),
    'session060: TCOLLECT COS-COS eliminates COS');
  assert(_s060HasFn(out.expr, 'SIN'),
    'session060: TCOLLECT COS-COS introduces SIN');
}

/* ---- TCOLLECT leaves mixed SIN+COS unchanged (no sum-to-product) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(A)+COS(B)')));
  lookup('TCOLLECT').fn(s);
  const out = s.pop();
  // No same-name pair — the walker returns the input essentially unchanged.
  assert(out.expr.kind === 'bin' && out.expr.op === '+',
    'session060: TCOLLECT SIN+COS stays as a sum');
  assert(_s060HasFn(out.expr, 'SIN') && _s060HasFn(out.expr, 'COS'),
    'session060: TCOLLECT SIN+COS preserves both');
}

/* ---- TCOLLECT inverse relationship with TEXPAND ----
   TEXPAND applied to SIN(X+Y)+SIN(X-Y) produces 2·SIN(X)·COS(Y)
   (which SIMPLIFY / EXPAND can reduce).  TCOLLECT applied directly
   to the same `SIN(A)+SIN(B)` shape (here A=X+Y, B=X-Y) yields
   2·SIN((2X)/2)·COS((2Y)/2) — symbolically equivalent but
   unsimplified.  Verify the walker visits and rewrites the top. */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X+Y)+SIN(X-Y)')));
  lookup('TCOLLECT').fn(s);
  const out = s.pop();
  // Should collapse into a product — top is bin('*').
  assert(out.expr.kind === 'bin' && out.expr.op === '*',
    'session060: TCOLLECT collapses SIN(X+Y)+SIN(X-Y) into a product');
  // And it introduces a COS.
  assert(_s060HasFn(out.expr, 'COS'),
    'session060: TCOLLECT SIN(X+Y)+SIN(X-Y) introduces COS');
}

/* ---- TCOLLECT non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(1));
  let threw = false;
  try { lookup('TCOLLECT').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session060: TCOLLECT on Real rejects');
}

/* ---- EXPLN returns Symbolic ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(isSymbolic(out), 'session060: EXPLN returns Symbolic');
}

/* ---- EXPLN SIN(X) introduces EXP and i, drops SIN ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(!_s060HasFn(out.expr, 'SIN'),
    'session060: EXPLN SIN(X) eliminates SIN');
  assert(_s060HasFn(out.expr, 'EXP'),
    'session060: EXPLN SIN(X) introduces EXP');
  assert(_s060HasVar(out.expr, 'i'),
    'session060: EXPLN SIN(X) references imaginary unit i');
}

/* ---- EXPLN COS(X) introduces EXP and i, drops COS ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('COS(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(!_s060HasFn(out.expr, 'COS'),
    'session060: EXPLN COS(X) eliminates COS');
  assert(_s060HasFn(out.expr, 'EXP'),
    'session060: EXPLN COS(X) introduces EXP');
  assert(_s060HasVar(out.expr, 'i'),
    'session060: EXPLN COS(X) references imaginary unit i');
  // Top-level division by 2.
  assert(out.expr.kind === 'bin' && out.expr.op === '/' &&
         out.expr.r.kind === 'num' && out.expr.r.value === 2,
    'session060: EXPLN COS(X) top denominator is 2');
}

/* ---- EXPLN TAN(X) is a division with e^(iX) on both sides ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('TAN(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '/',
    'session060: EXPLN TAN(X) top is a division');
  assert(!_s060HasFn(out.expr, 'TAN'),
    'session060: EXPLN TAN(X) eliminates TAN');
  assert(_s060HasVar(out.expr, 'i'),
    'session060: EXPLN TAN(X) references imaginary unit i');
}

/* ---- EXPLN SINH(X) uses real exp (no i) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SINH(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(!_s060HasFn(out.expr, 'SINH'),
    'session060: EXPLN SINH(X) eliminates SINH');
  assert(_s060HasFn(out.expr, 'EXP'),
    'session060: EXPLN SINH(X) introduces EXP');
  assert(!_s060HasVar(out.expr, 'i'),
    'session060: EXPLN SINH(X) does not reference i (real-only form)');
}

/* ---- EXPLN COSH(X) uses real exp, top-level division by 2 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('COSH(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(!_s060HasFn(out.expr, 'COSH'),
    'session060: EXPLN COSH(X) eliminates COSH');
  assert(out.expr.kind === 'bin' && out.expr.op === '/' &&
         out.expr.r.kind === 'num' && out.expr.r.value === 2,
    'session060: EXPLN COSH(X) top denominator is 2');
  assert(!_s060HasVar(out.expr, 'i'),
    'session060: EXPLN COSH(X) does not reference i');
}

/* ---- EXPLN TANH(X) is a division of exp-sum and exp-diff ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('TANH(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '/',
    'session060: EXPLN TANH(X) top is a division');
  assert(!_s060HasFn(out.expr, 'TANH'),
    'session060: EXPLN TANH(X) eliminates TANH');
  assert(!_s060HasVar(out.expr, 'i'),
    'session060: EXPLN TANH(X) does not reference i (real-only form)');
}

/* ---- EXPLN walks into 1+SIN(X) (sum-level container unchanged) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1+SIN(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(isSymbolic(out),
    'session060: EXPLN 1+SIN(X) returns Symbolic');
  assert(!_s060HasFn(out.expr, 'SIN'),
    'session060: EXPLN walks into the sum and eliminates SIN');
  assert(_s060HasFn(out.expr, 'EXP'),
    'session060: EXPLN 1+SIN(X) introduces EXP');
}

/* ---- EXPLN leaves bare variables unchanged ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X+Y')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  // No trig, no hyperbolic — walker returns the input.
  assert(!_s060HasFn(out.expr, 'EXP'),
    'session060: EXPLN X+Y does not introduce EXP');
}

/* ---- EXPLN non-Symbolic rejects ---- */
{
  const s = new Stack();
  s.push(Real(1));
  let threw = false;
  try { lookup('EXPLN').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session060: EXPLN on Real rejects');
}

/* ================================================================
   TSIMP, EXPLN inverse family, HEAVISIDE / DIRAC,
   LAPLACE / ILAP extensions, LNCOLLECT, FROOTS biquad.
   ================================================================ */

// Shared helpers: does the AST contain a call to `name`? / reference Var `name`?
function _s061HasFn(node, name) {
  if (!node) return false;
  if (node.kind === 'fn' && node.name === name) return true;
  if (node.kind === 'neg') return _s061HasFn(node.arg, name);
  if (node.kind === 'bin') return _s061HasFn(node.l, name) || _s061HasFn(node.r, name);
  if (node.kind === 'fn') return node.args.some(a => _s061HasFn(a, name));
  return false;
}

function _s061HasVar(node, name) {
  if (!node) return false;
  if (node.kind === 'var') return node.name === name;
  if (node.kind === 'neg') return _s061HasVar(node.arg, name);
  if (node.kind === 'bin') return _s061HasVar(node.l, name) || _s061HasVar(node.r, name);
  if (node.kind === 'fn') return node.args.some(a => _s061HasVar(a, name));
  return false;
}

/* ---- TSIMP Pythagorean sum to 1 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)^2+COS(X)^2')));
  lookup('TSIMP').fn(s);
  const out = s.pop();
  assert(isSymbolic(out) && out.expr.kind === 'num' && out.expr.value === 1,
    'session061: TSIMP(SIN(X)^2+COS(X)^2) = 1');
}

/* ---- TSIMP Pythagorean sum COS+SIN order ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('COS(X)^2+SIN(X)^2')));
  lookup('TSIMP').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'num' && out.expr.value === 1,
    'session061: TSIMP(COS(X)^2+SIN(X)^2) = 1 (order-independent)');
}

/* ---- TSIMP 1 - SIN^2 → COS^2 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1-SIN(X)^2')));
  lookup('TSIMP').fn(s);
  const out = s.pop();
  assert(_s061HasFn(out.expr, 'COS') && !_s061HasFn(out.expr, 'SIN'),
    'session061: TSIMP(1-SIN(X)^2) rewrites to COS form');
}

/* ---- TSIMP 1 - COS^2 → SIN^2 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1-COS(X)^2')));
  lookup('TSIMP').fn(s);
  const out = s.pop();
  assert(_s061HasFn(out.expr, 'SIN') && !_s061HasFn(out.expr, 'COS'),
    'session061: TSIMP(1-COS(X)^2) rewrites to SIN form');
}

/* ---- TSIMP TAN·COS → SIN ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('TAN(X)*COS(X)')));
  lookup('TSIMP').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'fn' && out.expr.name === 'SIN',
    'session061: TSIMP(TAN(X)·COS(X)) = SIN(X)');
}

/* ---- TSIMP SIN/COS → TAN ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)/COS(X)')));
  lookup('TSIMP').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'fn' && out.expr.name === 'TAN',
    'session061: TSIMP(SIN(X)/COS(X)) = TAN(X)');
}

/* ---- TSIMP compound: Pythagorean + arithmetic fold ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(A)^2+COS(A)^2+5')));
  lookup('TSIMP').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'num' && out.expr.value === 6,
    'session061: TSIMP(SIN(A)^2+COS(A)^2+5) folds to 6');
}

/* ---- TSIMP leaves unrelated expression unchanged ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X+Y')));
  lookup('TSIMP').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '+',
    'session061: TSIMP(X+Y) leaves structure intact');
}

/* ---- TSIMP rejects Real input ---- */
{
  const s = new Stack();
  s.push(Real(1));
  let threw = false;
  try { lookup('TSIMP').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session061: TSIMP on Real rejects');
}

/* ---- EXPLN ASIN(X) introduces LN and i ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('ASIN(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(isSymbolic(out) && !_s061HasFn(out.expr, 'ASIN'),
    'session061: EXPLN eliminates ASIN');
  assert(_s061HasFn(out.expr, 'LN'),
    'session061: EXPLN(ASIN(X)) introduces LN');
  assert(_s061HasVar(out.expr, 'i'),
    'session061: EXPLN(ASIN(X)) references i');
}

/* ---- EXPLN ACOS(X) references LN + i + SQRT ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('ACOS(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(!_s061HasFn(out.expr, 'ACOS'),
    'session061: EXPLN eliminates ACOS');
  assert(_s061HasFn(out.expr, 'LN') && _s061HasFn(out.expr, 'SQRT'),
    'session061: EXPLN(ACOS(X)) introduces LN and SQRT');
  assert(_s061HasVar(out.expr, 'i'),
    'session061: EXPLN(ACOS(X)) references i');
}

/* ---- EXPLN ATAN(X) uses (1 + iX)/(1 - iX) form ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('ATAN(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(!_s061HasFn(out.expr, 'ATAN'),
    'session061: EXPLN eliminates ATAN');
  assert(_s061HasFn(out.expr, 'LN'),
    'session061: EXPLN(ATAN(X)) introduces LN');
  assert(_s061HasVar(out.expr, 'i'),
    'session061: EXPLN(ATAN(X)) references i');
  // SQRT should NOT appear in the ATAN rewrite (uses rational log form).
  assert(!_s061HasFn(out.expr, 'SQRT'),
    'session061: EXPLN(ATAN(X)) has no SQRT (rational log form)');
}

/* ---- EXPLN ASINH(X) pure-real (no i) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('ASINH(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(!_s061HasFn(out.expr, 'ASINH'),
    'session061: EXPLN eliminates ASINH');
  assert(_s061HasFn(out.expr, 'LN') && _s061HasFn(out.expr, 'SQRT'),
    'session061: EXPLN(ASINH(X)) introduces LN + SQRT');
  assert(!_s061HasVar(out.expr, 'i'),
    'session061: EXPLN(ASINH(X)) does not reference i');
}

/* ---- EXPLN ACOSH(X) pure-real (no i) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('ACOSH(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(!_s061HasFn(out.expr, 'ACOSH'),
    'session061: EXPLN eliminates ACOSH');
  assert(_s061HasFn(out.expr, 'LN') && _s061HasFn(out.expr, 'SQRT'),
    'session061: EXPLN(ACOSH(X)) introduces LN + SQRT');
  assert(!_s061HasVar(out.expr, 'i'),
    'session061: EXPLN(ACOSH(X)) does not reference i');
}

/* ---- EXPLN ATANH(X) pure-real rational-log form ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('ATANH(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(!_s061HasFn(out.expr, 'ATANH'),
    'session061: EXPLN eliminates ATANH');
  assert(_s061HasFn(out.expr, 'LN'),
    'session061: EXPLN(ATANH(X)) introduces LN');
  assert(!_s061HasVar(out.expr, 'i'),
    'session061: EXPLN(ATANH(X)) does not reference i');
  assert(!_s061HasFn(out.expr, 'SQRT'),
    'session061: EXPLN(ATANH(X)) has no SQRT');
}

/* ---- EXPLN walks into nested ASIN inside a sum ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1+ASIN(X)')));
  lookup('EXPLN').fn(s);
  const out = s.pop();
  assert(!_s061HasFn(out.expr, 'ASIN'),
    'session061: EXPLN walks into sum and eliminates ASIN');
  assert(_s061HasFn(out.expr, 'LN'),
    'session061: EXPLN(1+ASIN(X)) introduces LN');
}

/* ---- HEAVISIDE on positive Real = 1 ---- */
{
  const s = new Stack();
  s.push(Real(2.5));
  lookup('HEAVISIDE').fn(s);
  const out = s.pop();
  assert(isReal(out) && out.value.eq(1),
    'session061: HEAVISIDE(2.5) = 1');
}

/* ---- HEAVISIDE on negative Real = 0 ---- */
{
  const s = new Stack();
  s.push(Real(-0.001));
  lookup('HEAVISIDE').fn(s);
  const out = s.pop();
  assert(isReal(out) && out.value.eq(0),
    'session061: HEAVISIDE(-0.001) = 0');
}

/* ---- HEAVISIDE(0) = 1 (right-continuous) ---- */
{
  const s = new Stack();
  s.push(Real(0));
  lookup('HEAVISIDE').fn(s);
  const out = s.pop();
  assert(isReal(out) && out.value.eq(1),
    'session061: HEAVISIDE(0) = 1 (right-continuous)');
}

/* ---- HEAVISIDE on Integer ---- */
{
  const s = new Stack();
  s.push(Integer(-5n));
  lookup('HEAVISIDE').fn(s);
  const out = s.pop();
  assert(isInteger(out) && out.value === 0n,
    'session061: HEAVISIDE(-5) = Integer 0');
}

/* ---- HEAVISIDE on Symbolic stays Symbolic ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X-3')));
  lookup('HEAVISIDE').fn(s);
  const out = s.pop();
  assert(isSymbolic(out) && out.expr.kind === 'fn'
    && out.expr.name === 'HEAVISIDE',
    'session061: HEAVISIDE(X-3) stays Symbolic');
}

/* ---- HEAVISIDE rejects non-numeric type ---- */
{
  const s = new Stack();
  s.push(RList([]));
  let threw = false;
  try { lookup('HEAVISIDE').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session061: HEAVISIDE on List rejects');
}

/* ---- DIRAC on non-zero Real = 0 ---- */
{
  const s = new Stack();
  s.push(Real(3.2));
  lookup('DIRAC').fn(s);
  const out = s.pop();
  assert(isReal(out) && out.value.eq(0),
    'session061: DIRAC(3.2) = 0');
}

/* ---- DIRAC on zero Real stays Symbolic ---- */
{
  const s = new Stack();
  s.push(Real(0));
  lookup('DIRAC').fn(s);
  const out = s.pop();
  assert(isSymbolic(out) && out.expr.kind === 'fn'
    && out.expr.name === 'DIRAC',
    'session061: DIRAC(0) stays Symbolic');
}

/* ---- DIRAC on non-zero Integer = 0 ---- */
{
  const s = new Stack();
  s.push(Integer(7n));
  lookup('DIRAC').fn(s);
  const out = s.pop();
  assert(isInteger(out) && out.value === 0n,
    'session061: DIRAC(7) = Integer 0');
}

/* ---- DIRAC on Symbolic stays Symbolic ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X-3')));
  lookup('DIRAC').fn(s);
  const out = s.pop();
  assert(isSymbolic(out) && out.expr.kind === 'fn'
    && out.expr.name === 'DIRAC',
    'session061: DIRAC(X-3) stays Symbolic');
}

/* ---- DIRAC rejects non-numeric type ---- */
{
  const s = new Stack();
  s.push(RList([]));
  let threw = false;
  try { lookup('DIRAC').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session061: DIRAC on List rejects');
}

/* ---- LAPLACE HEAVISIDE(X) → 1/X ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('HEAVISIDE(X)')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'bin' && out.expr.op === '/'
    && out.expr.l.kind === 'num' && out.expr.l.value === 1
    && out.expr.r.kind === 'var' && out.expr.r.name === 'X',
    'session061: LAPLACE(H(X)) = 1/X');
}

/* ---- LAPLACE HEAVISIDE(X-3) has EXP factor ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('HEAVISIDE(X-3)')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  assert(_s061HasFn(out.expr, 'EXP'),
    'session061: LAPLACE(H(X-3)) contains EXP factor');
  // Top-level is a division (num=EXP, den=X).
  assert(out.expr.kind === 'bin' && out.expr.op === '/',
    'session061: LAPLACE(H(X-3)) top is division');
}

/* ---- LAPLACE DIRAC(X) = 1 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('DIRAC(X)')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'num' && out.expr.value === 1,
    'session061: LAPLACE(δ(X)) = 1');
}

/* ---- LAPLACE DIRAC(X-3) top is EXP ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('DIRAC(X-3)')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'fn' && out.expr.name === 'EXP',
    'session061: LAPLACE(δ(X-3)) top is EXP');
}

/* ---- LAPLACE frequency-shift: L{EXP(2X)·SIN(X)} substitutes X→X-2 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('EXP(2*X)*SIN(X)')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  // Result should be 1/((X-2)^2 + 1) after simplification.  Structure:
  // top-level bin('/'), numerator Num 1, denominator bin('+').  Also no
  // EXP should remain at the top level of the result.
  assert(isSymbolic(out),
    'session061: LAPLACE(e^(2X)·SIN(X)) returns Symbolic');
  assert(!_s061HasFn(out.expr, 'EXP'),
    'session061: LAPLACE(e^(2X)·SIN(X)) eliminates top-level EXP');
  // The denominator should reference X-2 somewhere (via substitution).
  // Shallow check: the AST must mention the literal 2.
  function _hasNum(node, val) {
    if (!node) return false;
    if (node.kind === 'num') return node.value === val;
    if (node.kind === 'neg') return _hasNum(node.arg, val);
    if (node.kind === 'bin') return _hasNum(node.l, val) || _hasNum(node.r, val);
    if (node.kind === 'fn') return node.args.some(a => _hasNum(a, val));
    return false;
  }
  assert(_hasNum(out.expr, 2),
    'session061: LAPLACE(e^(2X)·SIN(X)) references the shift constant 2');
}

/* ---- ILAP EXP(-3X)/X → HEAVISIDE(X - 3) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('EXP(-3*X)/X')));
  lookup('ILAP').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'fn' && out.expr.name === 'HEAVISIDE',
    'session061: ILAP(e^(-3X)/X) = HEAVISIDE(X-3)');
}

/* ---- ILAP EXP(-3X) → DIRAC(X - 3) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('EXP(-3*X)')));
  lookup('ILAP').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'fn' && out.expr.name === 'DIRAC',
    'session061: ILAP(e^(-3X)) = DIRAC(X-3)');
}

/* ---- ILAP constant 1 → DIRAC(X) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('1')));
  lookup('ILAP').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'fn' && out.expr.name === 'DIRAC'
    && out.expr.args[0].kind === 'var' && out.expr.args[0].name === 'X',
    'session061: ILAP(1) = DIRAC(X)');
}

/* ---- LAPLACE / ILAP round-trip on DIRAC(X-3) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('DIRAC(X-3)')));
  lookup('LAPLACE').fn(s);
  lookup('ILAP').fn(s);
  const out = s.pop();
  assert(isSymbolic(out) && _s061HasFn(out.expr, 'DIRAC'),
    'session061: LAPLACE∘ILAP(DIRAC(X-3)) contains DIRAC');
}

/* ---- LAPLACE / ILAP round-trip on HEAVISIDE(X-2) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('HEAVISIDE(X-2)')));
  lookup('LAPLACE').fn(s);
  lookup('ILAP').fn(s);
  const out = s.pop();
  assert(_s061HasFn(out.expr, 'HEAVISIDE'),
    'session061: LAPLACE∘ILAP(H(X-2)) contains HEAVISIDE');
}

/* ---- LNCOLLECT LN(A) + LN(B) → LN(A·B) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('LN(A)+LN(B)')));
  lookup('LNCOLLECT').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'fn' && out.expr.name === 'LN'
    && out.expr.args[0].kind === 'bin' && out.expr.args[0].op === '*',
    'session061: LNCOLLECT(LN(A)+LN(B)) = LN(A·B)');
}

/* ---- LNCOLLECT LN(A) - LN(B) → LN(A/B) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('LN(A)-LN(B)')));
  lookup('LNCOLLECT').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'fn' && out.expr.name === 'LN'
    && out.expr.args[0].kind === 'bin' && out.expr.args[0].op === '/',
    'session061: LNCOLLECT(LN(A)-LN(B)) = LN(A/B)');
}

/* ---- LNCOLLECT n·LN(A) → LN(A^n) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('2*LN(X)')));
  lookup('LNCOLLECT').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'fn' && out.expr.name === 'LN',
    'session061: LNCOLLECT(2·LN(X)) top is LN');
  assert(out.expr.args[0].kind === 'bin' && out.expr.args[0].op === '^',
    'session061: LNCOLLECT(2·LN(X)) wraps X^2 inside LN');
}

/* ---- LNCOLLECT LN(A)·n (coefficient on right) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('LN(X)*3')));
  lookup('LNCOLLECT').fn(s);
  const out = s.pop();
  assert(out.expr.kind === 'fn' && out.expr.name === 'LN'
    && out.expr.args[0].kind === 'bin' && out.expr.args[0].op === '^'
    && out.expr.args[0].r.kind === 'num' && out.expr.args[0].r.value === 3,
    'session061: LNCOLLECT(LN(X)·3) = LN(X^3)');
}

/* ---- LNCOLLECT associates three LN terms ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('LN(A)+LN(B)+LN(C)')));
  lookup('LNCOLLECT').fn(s);
  const out = s.pop();
  // Bottom-up walk collects inner (LN(A)+LN(B)) → LN(A·B), then outer
  // LN(A·B) + LN(C) → LN((A·B)·C).  Top-level is a single LN.
  assert(out.expr.kind === 'fn' && out.expr.name === 'LN',
    'session061: LNCOLLECT(LN(A)+LN(B)+LN(C)) = single LN');
}

/* ---- LNCOLLECT leaves non-LN sums unchanged ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X+Y')));
  lookup('LNCOLLECT').fn(s);
  const out = s.pop();
  // No LN in input, no LN in output.
  assert(!_s061HasFn(out.expr, 'LN'),
    'session061: LNCOLLECT(X+Y) introduces no LN');
}

/* ---- LNCOLLECT rejects Real ---- */
{
  const s = new Stack();
  s.push(Real(1));
  let threw = false;
  try { lookup('LNCOLLECT').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session061: LNCOLLECT on Real rejects');
}

/* ---- FROOTS biquadratic X^4 - 10X^2 + 1 → four nested radicals ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^4-10*X^2+1')));
  lookup('FROOTS').fn(s);
  const rootsList = s.pop();
  assert(Array.isArray(rootsList.items),
    'session061: FROOTS(X^4-10X^2+1) returns a list');
  assert(rootsList.items.length === 8,
    `session061: FROOTS biquad produces 4 distinct roots (8 list entries, got ${rootsList.items.length})`);
  // Every odd-indexed entry is an Integer multiplicity (= 1 for biquadratic roots).
  const mults = rootsList.items.filter((_, i) => i % 2 === 1);
  assert(mults.every(m => isInteger(m) && m.value === 1n),
    'session061: FROOTS biquad multiplicities are all 1');
  // Roots are Symbolic (nested SQRT form).
  const roots = rootsList.items.filter((_, i) => i % 2 === 0);
  assert(roots.every(r => isSymbolic(r)),
    'session061: FROOTS biquad roots are Symbolic');
  // Each root's AST references SQRT (directly or under a neg wrapper).
  assert(roots.every(r => _s061HasFn(r.expr, 'SQRT')),
    'session061: FROOTS biquad roots contain SQRT (closed-form radicals)');
}

/* ---- FROOTS biquadratic with a leading coefficient ≠ 1 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('2*X^4-20*X^2+2')));
  lookup('FROOTS').fn(s);
  const rootsList = s.pop();
  assert(Array.isArray(rootsList.items) && rootsList.items.length === 8,
    'session061: FROOTS(2·X⁴-20X²+2) returns 4 roots');
}

/* ================================================================
   VX / SVX CAS-main-variable state + ops.
   ================================================================ */

/* ---- VX push default = Name('X') ---- */
{
  const { resetCasVx } = await import('../www/src/rpl/state.js');
  resetCasVx();
  const s = new Stack();
  lookup('VX').fn(s);
  const out = s.pop();
  assert(isName(out) && out.id === 'X',
    'session076: VX pushes Name(X) on a freshly-booted unit');
}

/* ---- SVX accepts Name and is observable via VX ---- */
{
  const { resetCasVx } = await import('../www/src/rpl/state.js');
  resetCasVx();
  const s = new Stack();
  s.push(Name('T'));
  lookup('SVX').fn(s);
  assert(s.depth === 0, 'session076: SVX consumes its argument');
  lookup('VX').fn(s);
  const out = s.pop();
  assert(isName(out) && out.id === 'T',
    'session076: after `SVX T`, VX → Name(T)');
  resetCasVx();
}

/* ---- SVX accepts String (HP50 accepts either at prompt) ---- */
{
  const { resetCasVx, getCasVx } = await import('../www/src/rpl/state.js');
  resetCasVx();
  const s = new Stack();
  s.push(Str('Y'));
  lookup('SVX').fn(s);
  assert(getCasVx() === 'Y', 'session076: SVX accepts String argument');
  resetCasVx();
}

/* ---- SVX rejects Real ---- */
{
  const { resetCasVx } = await import('../www/src/rpl/state.js');
  resetCasVx();
  const s = new Stack();
  s.push(Real(1));
  let threw = false;
  try { lookup('SVX').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session076: SVX on Real rejects with Bad argument type');
}

/* ---- SVX rejects empty String with Bad argument value ---- */
{
  const { resetCasVx } = await import('../www/src/rpl/state.js');
  resetCasVx();
  const s = new Stack();
  s.push(Str(''));
  let threw = false;
  try { lookup('SVX').fn(s); }
  catch (e) { threw = /Bad argument value/.test(e.message); }
  assert(threw, 'session076: SVX on empty string rejects with Bad argument value');
}

/* ---- PREVAL follows the active VX (not the single-free-var heuristic) ---- */
{
  const { resetCasVx, setCasVx } = await import('../www/src/rpl/state.js');
  resetCasVx();
  setCasVx('Y');
  // F = X + Y, endpoints 0 → 1.  VX = Y, so F(y=0) - F(y=1) substitutes Y:
  //   (X + 1) - (X + 0) = 1.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X+Y')));
  s.push(Real(0));
  s.push(Real(1));
  lookup('PREVAL').fn(s);
  const out = s.pop();
  assert(isReal(out) && Math.abs(out.value - 1) < 1e-12,
    'session076: PREVAL with VX=Y substitutes Y (not the first free var)');
  resetCasVx();
}

/* ---- LAPLACE picks VX when the input has multiple free vars ---- */
{
  const { resetCasVx, setCasVx } = await import('../www/src/rpl/state.js');
  resetCasVx();
  setCasVx('T');
  // F(T) = T (linear in T), plus an unrelated free var A.  With VX=T,
  // LAPLACE(T) = 1 / T^2, and the extra A stays as a multiplicative
  // constant on the outside.
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('A*T')));
  lookup('LAPLACE').fn(s);
  const out = s.pop();
  assert(isSymbolic(out),
    'session076: LAPLACE returns Symbolic on multi-var input with VX set');
  // The result must be a function of T (the LAPLACE variable), not A.
  // Just assert T appears and the top-level contains a division by T^2
  // somewhere — a coarse structural guard, not an exact equality.
  const fv = freeVars(out.expr);
  assert(fv.has('T'), 'session076: LAPLACE(A·T) with VX=T contains T in result');
  resetCasVx();
}

/* ---- VX round-trips through SVX/VX ---- */
{
  const { resetCasVx } = await import('../www/src/rpl/state.js');
  resetCasVx();
  const s = new Stack();
  s.push(Name('Q'));
  lookup('SVX').fn(s);
  lookup('VX').fn(s);
  const out = s.pop();
  assert(isName(out) && out.id === 'Q',
    'session076: SVX/VX round-trips a Name through state');
  resetCasVx();
}

/* ================================================================
   EXLR: extract left and right sides of a symbolic.
   ================================================================ */

/* ---- EXLR on A = B ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('A = B')));
  lookup('EXLR').fn(s);
  assert(s.depth === 2, 'session076: EXLR on A=B pushes two items');
  const right = s.pop();
  const left = s.pop();
  assert(isSymbolic(left) && left.expr.kind === 'var' && left.expr.name === 'A',
    'session076: EXLR(A=B) left is Symbolic(A)');
  assert(isSymbolic(right) && right.expr.kind === 'var' && right.expr.name === 'B',
    'session076: EXLR(A=B) right is Symbolic(B)');
}

/* ---- EXLR on the quadratic X^2 + 2X + 1 = 0 ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X^2 + 2*X + 1 = 0')));
  lookup('EXLR').fn(s);
  const right = s.pop();
  const left = s.pop();
  assert(isSymbolic(left) && left.expr.kind === 'bin',
    'session076: EXLR on quadratic preserves LHS compound shape');
  assert(isSymbolic(right) && right.expr.kind === 'num' && right.expr.value === 0,
    'session076: EXLR on quadratic RHS is Symbolic(0)');
}

/* ---- EXLR on X + Y (non-equation binary) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X + Y')));
  lookup('EXLR').fn(s);
  const r = s.pop();
  const l = s.pop();
  assert(isSymbolic(l) && l.expr.kind === 'var' && l.expr.name === 'X',
    'session076: EXLR on X+Y left = Symbolic(X)');
  assert(isSymbolic(r) && r.expr.kind === 'var' && r.expr.name === 'Y',
    'session076: EXLR on X+Y right = Symbolic(Y)');
}

/* ---- EXLR on comparison operator (<) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X < 5')));
  lookup('EXLR').fn(s);
  const r = s.pop();
  const l = s.pop();
  assert(isSymbolic(l) && l.expr.kind === 'var' && l.expr.name === 'X',
    'session076: EXLR on X<5 left = Symbolic(X)');
  assert(isSymbolic(r) && r.expr.kind === 'num' && r.expr.value === 5,
    'session076: EXLR on X<5 right = Symbolic(5)');
}

/* ---- EXLR rejects a bare variable (no top-level bin) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('X')));
  let threw = false;
  try { lookup('EXLR').fn(s); }
  catch (e) { threw = /Bad argument value/.test(e.message); }
  assert(threw, 'session076: EXLR on bare Sy(X) rejects with Bad argument value');
}

/* ---- EXLR rejects a unary (SIN(X)) ---- */
{
  const s = new Stack();
  s.push(Symbolic(parseAlgebra('SIN(X)')));
  let threw = false;
  try { lookup('EXLR').fn(s); }
  catch (e) { threw = /Bad argument value/.test(e.message); }
  assert(threw, 'session076: EXLR on SIN(X) rejects with Bad argument value');
}

/* ---- EXLR rejects a Real (non-Symbolic type) ---- */
{
  const s = new Stack();
  s.push(Real(42));
  let threw = false;
  try { lookup('EXLR').fn(s); }
  catch (e) { threw = /Bad argument type/.test(e.message); }
  assert(threw, 'session076: EXLR on Real rejects with Bad argument type');
}

