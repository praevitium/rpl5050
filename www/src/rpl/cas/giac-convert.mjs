// SPDX-License-Identifier: GPL-3.0-or-later
//
// Bidirectional conversion between rpl5050's AST (algebra.js) and the
// string syntax that Giac's `caseval` takes and emits.
//
// rpl5050 AST (see algebra.js):
//   Num(value)        numeric literal
//   Var(name)         identifier
//   Neg(arg)          unary negation
//   Bin(op, l, r)     binary: +, -, *, /, ^   (comparisons too, but CAS
//                     normally doesn't round-trip comparisons)
//   Fn(name, args[])  function call — HP-style uppercase name
//
// Giac syntax:
//   Same infix surface, but function names are lowercase. A few names
//   don't map 1:1 (HP LOG is base-10 while Giac `log` is natural; HP
//   ALOG is `10^x`). We carry an explicit name map in both directions.
//
// This module doesn't depend on the Giac engine itself. It's pure
// string / AST manipulation, so it's safe to use in Node tests.

import { Num, Var, Neg, Bin, Fn, parseAlgebra, formatAlgebra } from "../algebra.js";

/* ------------------------------------------------------------------
   Function-name maps.

   Keys on the left of HP_TO_GIAC are HP/rpl5050 names (normalized
   uppercase). Values are Giac names. Not every HP function has a
   direct Giac equivalent; this table will grow as ops are migrated.
   ------------------------------------------------------------------ */

export const HP_TO_GIAC = Object.freeze({
  SIN: "sin", COS: "cos", TAN: "tan",
  ASIN: "asin", ACOS: "acos", ATAN: "atan",
  SINH: "sinh", COSH: "cosh", TANH: "tanh",
  ASINH: "asinh", ACOSH: "acosh", ATANH: "atanh",
  LN: "ln",
  LOG: "log10",    // HP LOG is base-10; Giac `log` is natural
  EXP: "exp",
  SQRT: "sqrt",
  ABS: "abs",
  SIGN: "sign",
  MIN: "min", MAX: "max",
  GCD: "gcd", LCM: "lcm",
  FACT: "factorial",
  GAMMA: "Gamma",
  "Β": "Beta", // rare — carry through if someone uses the Greek name
  ERF: "erf", ERFC: "erfc",
  ARG: "arg", CONJ: "conj",
  // MOD, XROOT, ALOG, LNGAMMA, INTEG have non-trivial mappings —
  // handled as special cases in astToGiac, not via this table.
});

/** Inverse of HP_TO_GIAC, extended with Giac-only names that parsing
    needs to recognise. When the output from Giac uses a lowercase name
    we have no HP equivalent for, we keep it lowercase and let
    parseAlgebra reject it if it's unknown — easier to extend than to
    silently mangle. */
export const GIAC_TO_HP = Object.freeze(
  Object.fromEntries([
    ...Object.entries(HP_TO_GIAC).map(([hp, g]) => [g, hp]),
    // Aliases Giac emits that we route to the same HP canonical name:
    ["log", "LN"],          // natural log (only seen in `latex(...)` output)
    ["atan2", "ATAN2"],     // extended trig
    // Constants — left as lowercase identifiers for now; the AST layer
    // will wrap them as Var('pi') etc. and formatters downstream can
    // prettify.
  ]),
);

/* ------------------------------------------------------------------
   AST -> Giac input string.
   ------------------------------------------------------------------ */

/**
 * Convert an rpl5050 AST into a Giac-parseable expression string.
 *
 * Strategy: walk the tree mirroring formatAlgebra's precedence logic
 * so we emit minimal parens; but swap HP function names for their
 * Giac equivalents and handle the few special cases the name table
 * can't cover (HP ALOG, XROOT, MOD, LNGAMMA).
 *
 * Unknown function names pass through verbatim. The caller is
 * expected to validate that whatever Giac receives is meaningful —
 * if it isn't, `caseval` will return an error string.
 */
export function astToGiac(ast) {
  return emit(ast, 0);
}

const PREC = {
  "+": 1, "-": 1,
  "*": 2, "/": 2,
  "^": 3,
};

function emit(ast, parentPrec) {
  if (!ast) return "";
  switch (ast.kind) {
    case "num":
      return formatNum(ast.value);
    case "var":
      return ast.name;
    case "neg": {
      // Unary minus: bind tighter than * and /, looser than ^.
      const inner = emit(ast.arg, 4);
      const s = `-${inner}`;
      return parentPrec >= 2 ? `(${s})` : s;
    }
    case "fn":
      return emitFn(ast);
    case "bin": {
      const p = PREC[ast.op];
      if (p === undefined) {
        // Comparison / unknown — unlikely for CAS round-trip. Pass
        // through at low precedence.
        return `${emit(ast.l, 0)}${ast.op}${emit(ast.r, 0)}`;
      }
      const rightAssoc = ast.op === "^";
      const lPrec = rightAssoc ? p + 1 : p;
      const rPrec = rightAssoc ? p : p + 1;
      const lStr = emit(ast.l, lPrec);
      const rStr = emit(ast.r, rPrec);
      const s = `${lStr}${ast.op}${rStr}`;
      return p < parentPrec ? `(${s})` : s;
    }
    default:
      return "?";
  }
}

function formatNum(v) {
  if (Number.isInteger(v)) return v.toString();
  return String(v);
}

function emitFn(ast) {
  const hpName = ast.name.toUpperCase();
  const args = ast.args.map((a) => emit(a, 0));

  // --- special cases that don't fit the simple name map ---
  if (hpName === "ALOG") {
    // HP ALOG(x) = 10^x
    return `(10^(${args[0]}))`;
  }
  if (hpName === "LNGAMMA") {
    // HP LNGAMMA(x) = ln(Gamma(x))
    return `ln(Gamma(${args[0]}))`;
  }
  if (hpName === "XROOT") {
    // HP XROOT(n, x) = x^(1/n)  — HP arg order is n first, then x
    return `((${args[1]})^(1/(${args[0]})))`;
  }
  if (hpName === "MOD") {
    // HP MOD(a, b) — Giac has `irem` for integer remainder and `%` infix.
    // Use Giac's `irem` for integers and rely on caller for type-specific
    // dispatch; this is adequate for the symbolic surface.
    return `irem(${args[0]},${args[1]})`;
  }
  if (hpName === "INTEG") {
    // HP INTEG(expr, var) -> Giac integrate(expr, var)
    return `integrate(${args.join(",")})`;
  }

  // --- generic name mapping ---
  const giacName = HP_TO_GIAC[hpName] ?? ast.name;
  return `${giacName}(${args.join(",")})`;
}

/* ------------------------------------------------------------------
   Giac output string -> AST.
   ------------------------------------------------------------------ */

/**
 * Parse a string returned by Giac into an rpl5050 AST.
 *
 * Strategy: pre-process the string (lowercase Giac names -> HP
 * uppercase) then hand it to algebra.js's parseAlgebra.
 *
 * Giac can also return:
 *   - lists:     [a, b, c]                    — not yet supported
 *   - special:   undef, +infinity, -infinity  — not yet supported
 *   - piecewise: piecewise(c1, v1, c2, v2, …) — not yet supported
 * These cases throw so the caller can handle them explicitly rather
 * than silently produce garbage. Future expansion: return a tagged
 * result shape { kind: 'ast' | 'list' | 'undef', ... }.
 */
export function giacToAst(giacStr) {
  const s = String(giacStr).trim();
  if (s === "" || s === "undef") {
    throw new GiacResultError(s || "empty");
  }
  if (s.startsWith("[") && s.endsWith("]")) {
    throw new GiacResultError(s, "list");
  }
  if (s.includes("piecewise(")) {
    throw new GiacResultError(s, "piecewise");
  }
  if (s.endsWith("infinity") || s === "inf") {
    throw new GiacResultError(s, "infinity");
  }

  // Remap lowercase Giac names -> HP uppercase. The algebra parser's
  // isKnownFunction check is case-insensitive but we want canonical
  // uppercase in the AST, matching the rest of the codebase. We only
  // remap names that appear as `name(` (function-call context) to
  // avoid touching bare identifiers that may be variable names.
  //
  // The substitution is regex-based; it's enough for Giac's output
  // which is always well-formed syntactically.
  const mapped = s.replace(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g, (match, name) => {
    const hp = GIAC_TO_HP[name];
    if (hp) return `${hp}(`;
    // Unknown name — leave as-is; parseAlgebra will reject if truly
    // unrecognised.
    return match;
  });

  return parseAlgebra(mapped);
}

/**
 * Thrown when Giac returned a valid result that our adapter can't
 * (yet) represent as an AST — lists, infinity, piecewise, etc.
 * Carries the raw Giac string so callers can present it to the user
 * or handle specific shapes.
 */
export class GiacResultError extends Error {
  constructor(raw, kind = "unsupported") {
    super(`Giac returned ${kind} result: ${raw}`);
    this.name = "GiacResultError";
    this.raw = raw;
    this.kind = kind;
  }
}

/* ------------------------------------------------------------------
   Convenience round-trippers.
   ------------------------------------------------------------------ */

/** Quick helper: input AST, get the Giac input string via astToGiac,
    compare against formatAlgebra of the same tree. Used by tests. */
export function compareRoundTrip(ast) {
  return { giac: astToGiac(ast), rpl: formatAlgebra(ast) };
}
