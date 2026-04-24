/* =================================================================
   RPL value types.

   Every value on the stack is a tagged immutable object of the shape
   { type: <string>, ...payload }.  Constructors below enforce that
   shape and provide type predicates.

   Types implemented:
     Real      — JS number (IEEE-754, upgrade later to 12-digit BCD)
     Integer   — arbitrary precision via BigInt
     Complex   — { re, im } real pair
     String    — quoted string literal
     Name      — global or local identifier
     Symbolic  — algebraic expression (parsed AST stored as .expr)
     List      — ordered heterogeneous sequence
     Vector    — 1-D array of Reals/Complex
     Matrix    — 2-D array of Reals/Complex
     Program   — compiled RPL program (sequence of tokens)
     Tagged    — value wrapped with a string label
     BinaryInteger — non-negative integer with a display base (h/d/o/b),
                     written `#NNNNh` etc.  Produced by ERRN and by
                     HEX/DEC/OCT/BIN literals.  Payload is a BigInt so
                     wide values (up to the HP50's 64-bit STWS) round-trip.

   Unit — numeric value carried with a dimensional expression, e.g.
       3_m, 5_kg*m/s^2.  Stored as { value, dims, expr } — see the
       `Unit` constructor below.  Arithmetic obeys dimensional rules
       (see ops.js) and CONVERT/UBASE/UVAL handle unit→unit coercion.
   Grob — rectangular bitmap (Graphics Object).  A value-only shell:
       the plotting system that produces and consumes GROBs is out of
       scope, but the type exists so TYPE, →STR, persistence, and
       future graphics primitives have something to round-trip.
   ================================================================= */

export const TYPES = Object.freeze({
  REAL:      'real',
  INTEGER:   'integer',
  BININT:    'binaryInteger',
  COMPLEX:   'complex',
  STRING:    'string',
  NAME:      'name',
  SYMBOLIC:  'symbolic',
  LIST:      'list',
  VECTOR:    'vector',
  MATRIX:    'matrix',
  PROGRAM:   'program',
  TAGGED:    'tagged',
  DIRECTORY: 'directory',
  UNIT:      'unit',
  GROB:      'grob',
});

/** Valid Binary-Integer display bases: h(16) d(10) o(8) b(2). */
export const BIN_BASES = Object.freeze(['h', 'd', 'o', 'b']);

/* --------------------------- constructors --------------------------- */

export function Real(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) {
    throw new TypeError(`Real() needs a finite number, got ${n}`);
  }
  return Object.freeze({ type: TYPES.REAL, value: n });
}

export function Integer(n) {
  const b = typeof n === 'bigint' ? n : BigInt(n);
  return Object.freeze({ type: TYPES.INTEGER, value: b });
}

/**
 * A Binary Integer — non-negative integer with a display base.
 *
 * HP50 binary integers are literal unsigned values up to the current
 * wordsize (STWS, default 64).  They are written `#NNNNh` (hex),
 * `#NNNNd` (decimal), `#NNNNo` (octal), `#NNNNb` (binary) in source.
 * The base is a display flag that travels with the value — the
 * numeric payload is always the same BigInt.
 *
 *   n    : BigInt (or coercible).  Negative inputs are clamped to 0 —
 *          HP50 has no concept of a signed BinInt and `#-1h` is not
 *          a legal literal.
 *   base : 'h' | 'd' | 'o' | 'b'.  Defaults to 'h', the HP50 default.
 *
 * Payload shape differs intentionally from Integer so that type
 * predicates (isInteger vs. isBinaryInteger) remain distinct; operations
 * that treat both the same can fall through numeric coercion.
 */
export function BinaryInteger(n, base = 'h') {
  const raw = typeof n === 'bigint' ? n : BigInt(n);
  const value = raw < 0n ? 0n : raw;
  const b = String(base).toLowerCase();
  if (!BIN_BASES.includes(b)) {
    throw new TypeError(`BinaryInteger base must be h/d/o/b, got ${base}`);
  }
  return Object.freeze({ type: TYPES.BININT, value, base: b });
}

export function Complex(re, im) {
  return Object.freeze({
    type: TYPES.COMPLEX,
    re: Number(re),
    im: Number(im),
  });
}

export function Str(s) {
  return Object.freeze({ type: TYPES.STRING, value: String(s) });
}

/**
 * A Name identifier.
 *
 *   quoted:  true  → the name was written as `'X'` in source, or otherwise
 *                    constructed as a literal reference.  Quoted names are
 *                    never auto-evaluated: EVAL and the entry-loop push them
 *                    back unchanged.  The formatter renders them with ticks.
 *                    Use this when you want to hand a name to STO, RCL,
 *                    PURGE, etc. without losing it to a variable lookup.
 *
 *            false → a "bare" identifier as it appears in a program body
 *                    (or in the command line without surrounding ticks).
 *                    Bare names are resolved at EVAL time: ops run, bound
 *                    variables auto-recall-and-eval, unbound names push.
 *
 *   local:   reserved for program-local bindings (↓X), unchanged here.
 *
 * HP50 parallel: the calculator's internal "GROB" vs. "algebraic name"
 * distinction collapses to this single flag for our purposes.
 */
export function Name(id, { local = false, quoted = false } = {}) {
  return Object.freeze({
    type: TYPES.NAME,
    id: String(id),
    local,
    quoted: Boolean(quoted),
  });
}

export function Symbolic(expr) {
  // expr is an AST node — shape defined in src/rpl/algebra.js (future).
  // For now, accept any object and store it.
  return Object.freeze({ type: TYPES.SYMBOLIC, expr });
}

export function RList(items) {
  return Object.freeze({ type: TYPES.LIST, items: Object.freeze([...items]) });
}

export function Vector(items) {
  return Object.freeze({ type: TYPES.VECTOR, items: Object.freeze([...items]) });
}

export function Matrix(rows) {
  return Object.freeze({
    type: TYPES.MATRIX,
    rows: Object.freeze(rows.map(r => Object.freeze([...r]))),
  });
}

export function Program(tokens) {
  return Object.freeze({
    type: TYPES.PROGRAM,
    tokens: Object.freeze([...tokens]),
  });
}

export function Tagged(tag, value) {
  return Object.freeze({ type: TYPES.TAGGED, tag: String(tag), value });
}

/**
 * A Unit: numeric value carrying a dimensional expression.
 *
 *   value : JS number (same flat shape Real uses).  Integer-typed input
 *           is coerced to a number at construction time — once the
 *           dimensional arithmetic takes over we're firmly in Real land
 *           anyway (CONVERT / UBASE produce decimals).
 *   uexpr : canonical frozen array of [symbol, exponent] tuples — see
 *           units.js's `normalizeUexpr`.  An empty uexpr is a legal
 *           shape but ops that produce a dimensionless result will
 *           normally unwrap to a plain Real.
 */
export function Unit(value, uexpr) {
  return Object.freeze({ type: TYPES.UNIT, value: Number(value), uexpr });
}

/**
 * A Directory is a mutable named container for variables.
 *
 * Unlike the other value types (which are frozen value objects), a
 * Directory owns live state — STO writes into it, PURGE removes from
 * it.  `entries` is a Map<string, Value>.  `parent` is another
 * Directory (or null for HOME).  `name` is the directory's label as
 * seen in the `{ HOME }` path annunciator.
 *
 * Intentionally NOT Object.freeze()d: its purpose is to be mutated.
 * If you need a snapshot, copy `entries`.
 */
export function Directory({ name = 'HOME', parent = null, entries = null } = {}) {
  return {
    type: TYPES.DIRECTORY,
    name: String(name),
    parent,
    entries: entries ?? new Map(),
  };
}

/* ----------------------------- predicates ----------------------------- */

export const isReal     = v => v && v.type === TYPES.REAL;
export const isInteger  = v => v && v.type === TYPES.INTEGER;
export const isBinaryInteger = v => v && v.type === TYPES.BININT;
export const isComplex  = v => v && v.type === TYPES.COMPLEX;
export const isString   = v => v && v.type === TYPES.STRING;
export const isName       = v => v && v.type === TYPES.NAME;
export const isQuotedName = v => isName(v) && v.quoted === true;
export const isSymbolic = v => v && v.type === TYPES.SYMBOLIC;
export const isList     = v => v && v.type === TYPES.LIST;
export const isVector   = v => v && v.type === TYPES.VECTOR;
export const isMatrix   = v => v && v.type === TYPES.MATRIX;
export const isProgram  = v => v && v.type === TYPES.PROGRAM;
export const isTagged    = v => v && v.type === TYPES.TAGGED;
export const isDirectory = v => v && v.type === TYPES.DIRECTORY;
export const isUnit      = v => v && v.type === TYPES.UNIT;
// BinaryInteger is deliberately NOT in isNumber today — HP50 HEX/DEC
// arithmetic between BinInts follows a base-preservation rule
// (the left operand's base wins) that the default promoteNumericPair
// doesn't model yet.  Ops that want to accept a BinInt can do so via
// `isInteger(v) || isBinaryInteger(v)` and call `binIntToBigInt(v)`.
export const isNumber    = v => isReal(v) || isInteger(v) || isComplex(v);

/* ------------------------ numeric coercion helpers ------------------------ */

/**
 * Coerce any numeric value to a Real.  BigInts become floats, complex with
 * a zero imaginary part become real, otherwise throws.  Used by math ops
 * that aren't complex-aware yet.
 */
export function toRealOrThrow(v) {
  if (isReal(v)) return v.value;
  if (isInteger(v)) return Number(v.value);
  if (isComplex(v) && v.im === 0) return v.re;
  throw new TypeError(`Bad argument type: expected real, got ${v?.type}`);
}

/**
 * Coerce to complex { re, im }.
 */
export function toComplex(v) {
  if (isComplex(v)) return { re: v.re, im: v.im };
  if (isReal(v))    return { re: v.value, im: 0 };
  if (isInteger(v)) return { re: Number(v.value), im: 0 };
  throw new TypeError(`Bad argument type: expected number, got ${v?.type}`);
}

/**
 * Promote a pair of numeric operands to a common numeric type.
 * Returns { a, b, kind } where kind is 'real' | 'complex' | 'integer'.
 */
export function promoteNumericPair(a, b) {
  if (isComplex(a) || isComplex(b)) {
    return { a: toComplex(a), b: toComplex(b), kind: 'complex' };
  }
  if (isInteger(a) && isInteger(b)) {
    return { a: a.value, b: b.value, kind: 'integer' };
  }
  return {
    a: toRealOrThrow(a),
    b: toRealOrThrow(b),
    kind: 'real',
  };
}
