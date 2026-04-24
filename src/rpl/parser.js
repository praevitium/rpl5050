/* =================================================================
   Tiny RPL-ish parser for the command-line entry buffer.

   On the HP50, pressing ENTER with text in the command line causes
   the text to be parsed and its result pushed onto the stack.  This
   module implements a minimal version that covers:

     - signed decimal reals           42, -3.14, 1.5E-3
     - unsigned integers (Integer)    42   (no decimal point)
     - binary integers                #FFh, #1010b, #777o, #255d
     - parenthesised complex          (re,im)
     - string literals                "hello"
     - bare identifiers               X, 'Y'
     - lists                          { 1 2 3 }
     - programs                       << 1 2 + >>   (stored as tokens)
     - vectors                        [ 1 2 3 ]

   Anything unrecognised is passed through as a bare identifier.
   ================================================================= */

import {
  Real, Integer, BinaryInteger, Complex, Str, Name, RList, Vector, Program,
  Symbolic, Unit,
} from './types.js';
import { RPLError } from './stack.js';
import { getWordsizeMask, state as _state } from './state.js';
import { parseAlgebra } from './algebra.js';
import { parseUnitExpr } from './units.js';

/* ----------------------------- tokenizer ----------------------------- */
export function tokenize(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;

  const isSpace = c => /\s/.test(c);

  while (i < n) {
    const c = src[i];

    if (isSpace(c)) { i++; continue; }

    // String literal.  An unterminated string at end-of-buffer is
    // auto-closed so the user's in-progress `"hello` still parses
    // as the string "hello" — matches the common convenience the
    // user asked for over strict-parser errors.
    if (c === '"') {
      let j = i + 1, str = '';
      while (j < n && src[j] !== '"') {
        if (src[j] === '\\' && j + 1 < n) { str += src[j + 1]; j += 2; }
        else str += src[j++];
      }
      tokens.push({ kind: 'string', text: str });
      i = (j < n) ? j + 1 : n; continue;
    }

    // Delimiters that are single-char
    if ('{}[]'.includes(c)) {
      tokens.push({ kind: 'delim', text: c });
      i++; continue;
    }

    // Program markers << and >> — both ASCII double-angle (what the
    // user types when there's no direct way to produce the guillemets)
    // and the Unicode U+00AB / U+00BB guillemets (what SHIFT-R + types
    // on our keypad — matching the glyph the HP50 prints on the key).
    // Session 033 added the Unicode variants so the keypad emission
    // actually parses.  The two forms normalise to the same delim token
    // so the downstream parseProgram path is unchanged.
    if (c === '<' && src[i + 1] === '<') {
      tokens.push({ kind: 'delim', text: '<<' }); i += 2; continue;
    }
    if (c === '>' && src[i + 1] === '>') {
      tokens.push({ kind: 'delim', text: '>>' }); i += 2; continue;
    }
    if (c === '«') {
      tokens.push({ kind: 'delim', text: '<<' }); i++; continue;
    }
    if (c === '»') {
      tokens.push({ kind: 'delim', text: '>>' }); i++; continue;
    }

    // Parenthesised complex (re,im).  Unterminated → accept whatever
    // is between `(` and end-of-buffer.
    if (c === '(') {
      let j = i + 1, body = '';
      let depth = 1;
      while (j < n && depth > 0) {
        if (src[j] === '(') depth++;
        else if (src[j] === ')') { depth--; if (depth === 0) break; }
        body += src[j++];
      }
      tokens.push({ kind: 'complex', text: body });
      i = (j < n) ? j + 1 : n; continue;
    }

    // Binary integer literal — '#' followed by digits, optionally
    // terminated by a base letter (h/d/o/b).  Case-insensitive.
    //   #FFh    16-bit hex 255
    //   #255d   decimal 255
    //   #377o   octal 255
    //   #11111111b binary 255
    // If no base letter is present, the currently-selected display base
    // (state.binaryBase, set by HEX/DEC/OCT/BIN) is assumed — so with
    // DEC selected `#1234` is treated as `#1234d`.
    // 'h' and 'o' are unambiguous suffixes (not hex digits).  'd' and
    // 'b' are both valid hex digits AND base letters; we peel them as
    // suffix to preserve long-standing explicit-suffix behavior.
    if (c === '#') {
      let j = i + 1;
      while (j < n && /[0-9A-Fa-fHhOo]/.test(src[j])) j++;
      const atom = src.slice(i + 1, j);
      if (atom.length === 0) {
        throw new RPLError('Malformed binary integer');
      }
      const last = atom[atom.length - 1].toLowerCase();
      let digits, baseLetter;
      if ('hdob'.includes(last)) {
        digits = atom.slice(0, -1);
        baseLetter = last;
        if (digits.length === 0) {
          throw new RPLError('Malformed binary integer');
        }
      } else {
        // No suffix — assume the currently selected display base.
        digits = atom;
        baseLetter = _state.binaryBase || 'h';
      }
      tokens.push({ kind: 'binInt', digits, base: baseLetter });
      i = j; continue;
    }

    // Tick for algebraic/name — 'X'.  Unterminated tick → accept
    // whatever is typed so far as the quoted body.
    if (c === "'") {
      let j = i + 1, sym = '';
      while (j < n && src[j] !== "'") sym += src[j++];
      tokens.push({ kind: 'quotedName', text: sym });
      i = (j < n) ? j + 1 : n; continue;
    }

    // Number? start with digit, decimal, or sign followed by digit/.
    const rest = src.slice(i);
    const m = rest.match(/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/);
    if (m && (m[0].match(/[0-9]/))) {
      // Only consume the sign as part of the number if it starts the token,
      // otherwise leave + and - as their own tokens (operator names).
      // We've arrived here only when i is at the start of an atom, so it's safe.
      i += m[0].length;
      // Unit literal: `<number>_<unitExpr>` — the underscore immediately
      // after the number kicks off a unit expression that runs to the
      // next whitespace or structural delimiter.
      if (i < n && src[i] === '_') {
        i++;                                  // consume the '_'
        let j = i;
        while (j < n && !isSpace(src[j]) && !'{}[]"\''.includes(src[j])) j++;
        tokens.push({ kind: 'unit', numText: m[0], unitText: src.slice(i, j) });
        i = j; continue;
      }
      tokens.push({ kind: 'number', text: m[0] });
      continue;
    }

    // Identifier / operator token — run until whitespace or delimiter
    let j = i;
    while (j < n && !isSpace(src[j]) && !'{}[]"\''.includes(src[j])) j++;
    tokens.push({ kind: 'ident', text: src.slice(i, j) });
    i = j;
  }
  return tokens;
}

/* ----------------------------- parser ----------------------------- */

/** Parse the full entry buffer; if it produces exactly one value,
 *  return that value; else return a Program-like list of values (the
 *  caller can decide to push each). */
export function parseEntry(src) {
  const toks = tokenize(src);
  let idx = 0;

  function parseOne() {
    const t = toks[idx++];
    if (!t) throw new RPLError('Empty parse');

    switch (t.kind) {
      case 'string': return Str(t.text);

      case 'number': {
        const text = t.text;
        if (/^[-+]?\d+$/.test(text)) return Integer(text);
        return Real(parseFloat(text));
      }

      case 'unit': {
        // Numeric part parses identically to a bare number; the unit
        // part is canonicalized via parseUnitExpr (which throws on an
        // unknown symbol — bubble that up as an RPL parse error so the
        // user's `9.8_m/s^2` typo doesn't silently become a Name).
        let uexpr;
        try { uexpr = parseUnitExpr(t.unitText); }
        catch (e) { throw new RPLError(e.message || 'Bad unit'); }
        const numValue = parseFloat(t.numText);
        if (!Number.isFinite(numValue)) {
          throw new RPLError('Bad numeric part in unit literal');
        }
        return Unit(numValue, uexpr);
      }

      case 'complex': {
        const [re, im = '0'] = t.text.split(',').map(x => x.trim());
        return Complex(parseFloat(re), parseFloat(im));
      }

      case 'binInt': {
        const radix = { h: 16, d: 10, o: 8, b: 2 }[t.base];
        // Validate digit set against the declared base.  Hex accepts
        // 0-9a-f; decimal digits 0-9; octal 0-7; binary 0-1.  A stray
        // digit outside the set is a parse error — matches HP50.
        const valid = {
          h: /^[0-9A-Fa-f]+$/,
          d: /^[0-9]+$/,
          o: /^[0-7]+$/,
          b: /^[01]+$/,
        }[t.base];
        if (!valid.test(t.digits)) {
          throw new RPLError(`Malformed ${t.base}-base integer: #${t.digits}${t.base}`);
        }
        // BigInt accepts only hex/oct/bin via "0x" / "0o" / "0b"
        // prefixes; for decimal plain-number works.
        let big;
        if (radix === 10) big = BigInt(t.digits);
        else if (radix === 16) big = BigInt('0x' + t.digits);
        else if (radix === 8)  big = BigInt('0o' + t.digits);
        else                    big = BigInt('0b' + t.digits);
        // HP50 truncates BinInt literals at PARSE time to the current
        // STWS wordsize.  Typing `#FFFFh` at ws=8 lands as `#FFh` on the
        // stack, not the 16-bit value.  Masking here mirrors that
        // behavior — arithmetic also masks, but catching it at parse
        // time means the value on the stack is already correct so
        // display + equality checks line up with the HP50's.
        big = big & getWordsizeMask();
        return BinaryInteger(big, t.base);
      }

      case 'quotedName': {
        // A tick-quoted atom can be either:
        //   - a bare variable reference:   'X'        → Name('X', quoted)
        //   - an operator name:            '+'        → Name('+', quoted)
        //   - an algebraic expression:     'X^2 + 1'  → Symbolic(ast)
        //   - a pure-numeric algebra form: '1/3'      → Symbolic(ast)
        // Heuristic: if the body contains any algebra token (+ - * / ^
        // ( ) = ≠ < > ≤ ≥), try the algebra parser.  If that fails,
        // fall back to Name so forms like `'+'` (bare operator tick)
        // still round-trip as a Name.
        const body = t.text;
        // Include comparison operators (≠, <, >, ≤, ≥) so `'x<y'` and
        // friends are parsed as symbolic inequalities rather than falling
        // through to Name.  Session 034.
        // Session 041: dropped the letter requirement so purely numeric
        // algebra — '1/3', '2^0.5' — becomes Symbolic rather than a
        // Name.  This is what makes `'1/3' →NUM` fold under APPROX and
        // stay exact under EXACT.  Bare operator atoms like `'+'` fall
        // through to Name via the parseAlgebra try/catch.
        const looksAlgebraic =
          /[+\-*/^()=≠<>≤≥]/.test(body);
        if (looksAlgebraic) {
          try {
            return Symbolic(parseAlgebra(body));
          } catch (_e) {
            // Fall through to Name below — keeps unusual tick-quoted
            // tokens working even if they look algebraic at a glance.
          }
        }
        // Literal name reference — never auto-evaluated.  The `quoted`
        // flag tells EVAL and the entry loop to push this back instead
        // of looking it up.
        return Name(body, { quoted: true });
      }

      case 'ident': {
        const s = t.text;
        // A bare identifier in source — the executor (entry loop / EVAL)
        // decides at run time whether this is an op call, an auto-RCL,
        // or a push-back for an unbound name.
        return Name(s);
      }

      case 'delim': {
        if (t.text === '{') return parseList();
        if (t.text === '[') return parseVector();
        if (t.text === '<<') return parseProgram();
        throw new RPLError('Syntax error near ' + t.text);
      }
    }
    throw new RPLError('Unknown token');
  }

  /* When the input runs out before the expected closing delimiter
     (`}`, `]`, `>>`), we auto-close silently instead of throwing.
     Makes the common "user forgot to type the closer" case just
     work — e.g. `{ 1 2 3` lands as a 3-element list on ENTER. */

  function parseList() {
    const items = [];
    while (idx < toks.length && !(toks[idx].kind === 'delim' && toks[idx].text === '}')) {
      items.push(parseOne());
    }
    if (idx < toks.length) idx++;      // consume '}' when present
    return RList(items);
  }

  function parseVector() {
    const items = [];
    while (idx < toks.length && !(toks[idx].kind === 'delim' && toks[idx].text === ']')) {
      items.push(parseOne());
    }
    if (idx < toks.length) idx++;
    return Vector(items);
  }

  function parseProgram() {
    // A program is stored as a flat token list — the interpreter resolves
    // Names into ops when RUN is invoked.
    const body = [];
    while (idx < toks.length && !(toks[idx].kind === 'delim' && toks[idx].text === '>>')) {
      body.push(parseOne());
    }
    if (idx < toks.length) idx++;
    return Program(body);
  }

  const values = [];
  while (idx < toks.length) values.push(parseOne());
  return values;
}
