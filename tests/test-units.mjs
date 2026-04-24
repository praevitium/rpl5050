import { Stack } from '../src/rpl/stack.js';
import { lookup } from '../src/rpl/ops.js';
import {
  Real, Integer, Unit, isReal, isUnit, isInteger,
} from '../src/rpl/types.js';
import { parseEntry } from '../src/rpl/parser.js';
import { format } from '../src/rpl/formatter.js';
import {
  parseUnitExpr, formatUnitExpr, normalizeUexpr,
  multiplyUexpr, divideUexpr, inverseUexpr, powerUexpr,
  sameDims, scaleOf, toBaseUexpr, uexprEqual,
} from '../src/rpl/units.js';
import { assert, assertThrows } from './helpers.mjs';

/* ================================================================
   Unit parser — canonicalisation, sign propagation
   ================================================================ */
{
  const u = parseUnitExpr('m');
  assert(u.length === 1 && u[0][0] === 'm' && u[0][1] === 1,
         `parse 'm' → [[m,1]]`);
}
{
  const u = parseUnitExpr('m/s^2');
  assert(u.length === 2 && u[0][0] === 'm' && u[0][1] === 1
      && u[1][0] === 's' && u[1][1] === -2,
         `parse 'm/s^2' → [[m,1],[s,-2]]`);
}
{
  // HP50 left-to-right: '/' inverts only the immediately next factor.
  const u = parseUnitExpr('m/s*s');
  assert(u.length === 1 && u[0][0] === 'm' && u[0][1] === 1,
         `parse 'm/s*s' cancels s → [[m,1]] (got ${JSON.stringify(u)})`);
}
{
  const u = parseUnitExpr('kg*m/s^2');
  const syms = u.map(([s]) => s).join(',');
  assert(syms === 'kg,m,s', `parse 'kg*m/s^2' sorted alphabetically: ${syms}`);
  const sMap = new Map(u);
  assert(sMap.get('kg') === 1 && sMap.get('m') === 1 && sMap.get('s') === -2,
         `parse 'kg*m/s^2' exponents`);
}
{
  // Unknown symbol → Error.
  assertThrows(() => parseUnitExpr('foobar'), null,
    `parseUnitExpr rejects unknown symbol`);
}

/* ================================================================
   uexpr algebra — multiply / divide / inverse / power
   ================================================================ */
{
  const m_per_s = parseUnitExpr('m/s');
  const s       = parseUnitExpr('s');
  const prod    = multiplyUexpr(m_per_s, s);
  assert(prod.length === 1 && prod[0][0] === 'm' && prod[0][1] === 1,
         `(m/s) * s → m`);
}
{
  const m_per_s2 = parseUnitExpr('m/s^2');
  const inv = inverseUexpr(m_per_s2);
  const map = new Map(inv);
  assert(map.get('m') === -1 && map.get('s') === 2,
         `inverse of m/s^2 is s^2/m`);
}
{
  const sq = powerUexpr(parseUnitExpr('m'), 2);
  assert(sq[0][0] === 'm' && sq[0][1] === 2, `m^2`);
}
{
  // sameDims: ft and m share length dim
  assert(sameDims(parseUnitExpr('ft'), parseUnitExpr('m')),
         `ft and m are dimensionally equal`);
  assert(!sameDims(parseUnitExpr('m'), parseUnitExpr('s')),
         `m and s differ`);
}

/* ================================================================
   Unit literal parser (REPL entry path)
   ================================================================ */
{
  const vals = parseEntry('9.8_m/s^2');
  assert(Array.isArray(vals) && vals.length === 1 && isUnit(vals[0]),
         `'9.8_m/s^2' parses to a single Unit`);
  assert(Math.abs(vals[0].value - 9.8) < 1e-12, `value is 9.8`);
}
{
  const vals = parseEntry('1_kg*m/s^2');
  assert(vals.length === 1 && isUnit(vals[0]), `kg*m/s^2 parses`);
  const map = new Map(vals[0].uexpr);
  assert(map.get('kg') === 1 && map.get('m') === 1 && map.get('s') === -2,
         `Newton-shape uexpr`);
}
{
  // Bogus unit → RPL parse error propagates.
  assertThrows(() => parseEntry('1_zzz'), null,
    `'1_zzz' (unknown unit) throws`);
}

/* ================================================================
   Unit formatter
   ================================================================ */
{
  const u = Unit(9.8, parseUnitExpr('m/s^2'));
  const s = format(u);
  assert(s.includes('9.8') && s.includes('_m/s^2'),
         `format Unit 9.8_m/s^2 → '${s}'`);
}
{
  const u = Unit(1, parseUnitExpr('kg*m/s^2'));
  const s = format(u);
  assert(s.includes('_kg*m/s^2'),
         `format Unit 1_kg*m/s^2 → '${s}'`);
}
{
  // Two negative factors get parens so the output round-trips.
  const u = Unit(2, parseUnitExpr('m/s^2/kg'));
  const fu = formatUnitExpr(u.uexpr);
  assert(fu.includes('/(') || fu.startsWith('1/('),
         `denominator with multiple factors parenthesised: '${fu}'`);
  // Round-trip check
  const reparsed = parseUnitExpr(fu);
  assert(uexprEqual(u.uexpr, reparsed), `round-trip: ${fu}`);
}

/* ================================================================
   Arithmetic: +, -, *, /, ^ on Units
   ================================================================ */
{
  // Unit + Unit, same dims, different symbols — result in LEFT's unit.
  const s = new Stack();
  s.push(parseEntry('1_km')[0]);
  s.push(parseEntry('500_m')[0]);
  lookup('+').fn(s);
  const r = s.peek();
  assert(isUnit(r) && r.uexpr[0][0] === 'km' && Math.abs(r.value - 1.5) < 1e-12,
         `1_km + 500_m → 1.5_km (got ${JSON.stringify(r)})`);
}
{
  // Mismatched dims → error.
  const s = new Stack();
  s.push(parseEntry('1_m')[0]);
  s.push(parseEntry('1_s')[0]);
  assertThrows(() => lookup('+').fn(s), null,
    `1_m + 1_s throws Inconsistent units`);
}
{
  // Unit * Real → Unit with same uexpr.
  const s = new Stack();
  s.push(parseEntry('2_m')[0]);
  s.push(Real(3));
  lookup('*').fn(s);
  const r = s.peek();
  assert(isUnit(r) && r.value === 6 && r.uexpr[0][0] === 'm',
         `2_m * 3 → 6_m`);
}
{
  // Unit * Unit combines uexprs.
  const s = new Stack();
  s.push(parseEntry('2_m')[0]);
  s.push(parseEntry('3_s')[0]);
  lookup('*').fn(s);
  const r = s.peek();
  assert(isUnit(r) && r.value === 6,
         `2_m * 3_s → Unit 6 (got value ${r.value})`);
  const map = new Map(r.uexpr);
  assert(map.get('m') === 1 && map.get('s') === 1,
         `...with uexpr m*s`);
}
{
  // Dimensionless result unwraps to Real: _m / _m.
  const s = new Stack();
  s.push(parseEntry('6_m')[0]);
  s.push(parseEntry('2_m')[0]);
  lookup('/').fn(s);
  const r = s.peek();
  assert(isReal(r) && r.value === 3,
         `6_m / 2_m → Real(3) (got ${JSON.stringify(r)})`);
}
{
  // Power: (_m)^3 → m^3.
  const s = new Stack();
  s.push(parseEntry('2_m')[0]);
  s.push(Integer(3));
  lookup('^').fn(s);
  const r = s.peek();
  assert(isUnit(r) && r.value === 8 && r.uexpr[0][0] === 'm' && r.uexpr[0][1] === 3,
         `2_m ^ 3 → 8_m^3`);
}

/* ================================================================
   NEG / ABS / INV / SQ on Units
   ================================================================ */
{
  const s = new Stack();
  s.push(parseEntry('5_m')[0]);
  lookup('NEG').fn(s);
  const r = s.peek();
  assert(isUnit(r) && r.value === -5 && r.uexpr[0][0] === 'm',
         `NEG 5_m → -5_m`);
}
{
  const s = new Stack();
  s.push(parseEntry('-5_m')[0]);
  lookup('ABS').fn(s);
  const r = s.peek();
  assert(isUnit(r) && r.value === 5, `ABS -5_m → 5_m`);
}
{
  const s = new Stack();
  s.push(parseEntry('2_m')[0]);
  lookup('INV').fn(s);
  const r = s.peek();
  assert(isUnit(r) && r.value === 0.5 && r.uexpr[0][0] === 'm' && r.uexpr[0][1] === -1,
         `INV 2_m → 0.5_1/m`);
}
{
  const s = new Stack();
  s.push(parseEntry('3_m')[0]);
  lookup('SQ').fn(s);
  const r = s.peek();
  assert(isUnit(r) && r.value === 9 && r.uexpr[0][0] === 'm' && r.uexpr[0][1] === 2,
         `SQ 3_m → 9_m^2`);
}

/* ================================================================
   UVAL / UBASE / →UNIT / CONVERT
   ================================================================ */
{
  const s = new Stack();
  s.push(parseEntry('3.5_km')[0]);
  lookup('UVAL').fn(s);
  const r = s.peek();
  assert(isReal(r) && r.value === 3.5, `UVAL 3.5_km → Real(3.5)`);
}
{
  // UBASE: 1_km → 1000_m
  const s = new Stack();
  s.push(parseEntry('1_km')[0]);
  lookup('UBASE').fn(s);
  const r = s.peek();
  assert(isUnit(r) && r.value === 1000 && r.uexpr[0][0] === 'm',
         `UBASE 1_km → 1000_m (got ${JSON.stringify(r)})`);
}
{
  // UBASE on a Newton: 1_N → 1_kg*m/s^2
  const s = new Stack();
  s.push(parseEntry('1_N')[0]);
  lookup('UBASE').fn(s);
  const r = s.peek();
  const map = new Map(r.uexpr);
  assert(isUnit(r) && Math.abs(r.value - 1) < 1e-12
      && map.get('kg') === 1 && map.get('m') === 1 && map.get('s') === -2,
         `UBASE 1_N → 1_kg*m/s^2`);
}
{
  // CONVERT: 1_km into feet → 3280.839895_ft
  const s = new Stack();
  s.push(parseEntry('1_km')[0]);
  s.push(parseEntry('1_ft')[0]);
  lookup('CONVERT').fn(s);
  const r = s.peek();
  assert(isUnit(r) && r.uexpr[0][0] === 'ft',
         `CONVERT result in ft`);
  assert(Math.abs(r.value - 3280.8398950131) < 1e-6,
         `1_km converts to ≈3280.84_ft (got ${r.value})`);
}
{
  // CONVERT rejects incompatible dims.
  const s = new Stack();
  s.push(parseEntry('1_m')[0]);
  s.push(parseEntry('1_s')[0]);
  assertThrows(() => lookup('CONVERT').fn(s), null,
    `CONVERT m → s throws`);
}
{
  // →UNIT: 5 and 1_kg → 5_kg (the unit's value is ignored).
  const s = new Stack();
  s.push(Real(5));
  s.push(parseEntry('1_kg')[0]);
  lookup('→UNIT').fn(s);
  const r = s.peek();
  assert(isUnit(r) && r.value === 5 && r.uexpr[0][0] === 'kg',
         `5 1_kg →UNIT → 5_kg`);
}

/* ================================================================
   TYPE returns 13 for units (HP50 code)
   ================================================================ */
{
  const s = new Stack();
  s.push(parseEntry('1_m')[0]);
  lookup('TYPE').fn(s);
  const r = s.peek();
  assert(isReal(r) && r.value === 13, `TYPE of a Unit is 13 (got ${r.value})`);
}
