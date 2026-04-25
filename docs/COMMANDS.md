# COMMANDS.md — command-support lane inventory

Authoritative status of every HP50 RPL command the `rpl5050-command-support`
lane tracks.  This file is maintained by the command-support lane and is
the canonical place to flip a row from `✗` to `~` to `✓` as an op ships.

For data-type width of an already-shipped op (Tagged transparency, List
distribution, Symbolic lift, V/M broadcast, Unit handling, BinaryInteger
coercion), see `docs/DATA_TYPES.md`.  This file records **whether the op
exists at all**, not the shape of its type coverage.

## Legend

| Symbol | Meaning |
|--------|---------|
| `✓` | Fully shipped — registered in `www/src/rpl/ops.js`, reachable from the keypad, ≥1 positive + ≥1 rejection test covered. |
| `~` | Partially shipped — e.g. the op exists but rejects a whole argument class HP50 accepts, or an alias is missing, or there's no rejection-path coverage yet. |
| `✗` | Not yet implemented. |
| `will-not` | Explicitly out of scope per `docs/@!MY_NOTES.md` (USER, ENTRY, S.SLV, NUM.SLV, FINANCE, TIME, DEF, LIB, OFF) or replaced by a deliberate design deviation. |

Where relevant the **Notes** column records the last session number that
touched the row, and any known caveats worth carrying forward.

## Counts (as of session 161 — 2026-04-25)

- Fully shipped (✓): 447 (no net change since session 149 — sessions
  150 / 151 / 152 / 153 / 154 / 155 / 156 / 157 / 158 / 159 / 160 /
  161 are all contract-tightening, coverage, and doc-hygiene runs; no
  ✗ → ✓ transitions in any of them.  Session 153's ship-prep run closed
  `C-011` (`_combPermArgs` Rational `TypeError` leak — guard tightened
  to mirror `_intQuotientArg`) and retired the stale INVMOD `TODO`.
  Session 155 closed ship-target `R-008` (HP50 AUR §3-149 fidelity
  audit of `OBJ→`'s Real / Integer + Tagged branches) — Real / Integer
  no longer mantissa/exponent-split; Tagged tag emitted as String
  (AUR-verified, with a comment guard at `ops.js:6640-6644` against a
  future Name "fix").  Session 159 closed ship-target `R-012` (the
  third — and final — row of the AUR §3-149 OBJ→ Input/Output table):
  the missing `isUnit` branch was added to OBJ→'s dispatch at
  `ops.js:6740-6752`, matching the AUR `x_unit → x  1_unit` row
  exactly.  Session 160 was split between the code-review lane (X-003
  dead-import drop in `app.js:13-15`; full release-mode REVIEW.md
  reconciliation; sixteenth review-lane run) and the unit-tests lane
  (+13 release-mode pin coverage assertions across reflection / types /
  algebra files).  Session 161 (this run) is a doc-reconciliation
  pass — Counts stamp refresh, OBJ→ row Notes amendment for the
  session-159 R-012 close + session-160 boundary-edge follow-up pins,
  and session-log back-fill (sessions 158 / 159 / 160 entries
  enumerated below).)
- Partially shipped (~): 0
- Not yet implemented (✗): 1 (only the `JORDAN` / `SCHUR`
  matrix-decomp row remains — the entire MODULO-family is ✓.)
- Will-not-support (by design): 9 menu groups

The registry lives at `www/src/rpl/ops.js` and is enumerated by `allOps()`.
`grep -c "register(" www/src/rpl/ops.js` = **476** at the end of session
161 (unchanged from session 149 — no new registrations across sessions
150 → 161; was 471 at the end of session 144, was 466 at the end of
session 139, was 463 at the end of session 134, was 458 at the end of
session 129, was 455 at the end of session 124, was 448 at the end of
session 119).  The actual top-level `register()` *call* count
(`grep -cE '^register\(' www/src/rpl/ops.js`) is **455** (unchanged
from session 149).

Session-153 row transitions:
- **0 ops newly shipped** (no ✗ → ✓).  Release-mode wrap-up run.
- **1 review-lane finding closed**: `C-011` (the session-152-filed
  `_combPermArgs` Rational TypeError leak at `www/src/rpl/ops.js:1683`).
  Argument-type guard rewritten from the broad
  `if (!isNumber(a) || !isNumber(b))` to the narrow
  `if (!isInteger(a) && !isReal(a)) … if (!isInteger(b) && !isReal(b)) …`
  pair, mirroring `_intQuotientArg`'s shape exactly.  The redundant
  explicit `isComplex` rejection a line below was deleted (subsumed
  by the new guard — Complex satisfies neither `isInteger` nor `isReal`).
  Eight `session153:` assertions added to `tests/test-numerics.mjs`
  pinning the six AUR-mandated rejection modes (COMB / PERM ×
  {Rat-on-2, Rat-on-1, both Rat}) plus two genuinely-fractional
  Rational rejections (Rat 5/2, Rat 3/2).  All eight surface as the
  RPL-style `Bad argument type` instead of the prior leaked
  `TypeError: Cannot read properties of undefined (reading
  'isFinite')`.  Behavior change is rejection-narrowing only — the
  COMB/PERM happy paths (Integer pairs, integer-valued Real pairs,
  Name/Symbolic lift, Complex-rejection, `m > n` rejection) all
  re-verified at run-close.
- **1 stale-comment block retired**: the `TODO` paragraph at
  `www/src/rpl/ops.js:1961-1963` ("add a single-arg form that
  consults `getCasModulo()`") rewritten as a deliberate-deviation
  note explaining why INVMOD remains 2-arg even though the rest of
  the MODULO menu (`ADDTMOD` / `SUBTMOD` / `MULTMOD` / `POWMOD`)
  consumes `state.casModulo`.  Paired entry added to the
  Intentional Deviations table in `docs/@!MY_NOTES.md` ("INVMOD
  arity").  Pure-comment + doc edit; no behavior change.
- **2 row Notes amendments**: `COMB` / `PERM` row (session-153
  C-011 close — Rational rejection contract pinned) and `INVMOD`
  row (session-153 deviation codification).
- **State / persistence:** no change — no new state slots; no
  `persist.js` edits; `tests/test-persist.mjs` 66 / 0 stable.

Session-149 row transitions:
- **5 ops newly shipped** (✗ → ✓): `EXPANDMOD` (HP50 AUR §3-80), `FACTORMOD`
  (HP50 AUR §3-83), `GCDMOD` (HP50 AUR §3-96), `DIVMOD` (HP50 AUR
  §3-63), `DIV2MOD` (HP50 AUR §3-62).  The five share a unified
  pattern: pure-Integer fast paths use BigInt with `_centerMod` (and,
  for DIVMOD / DIV2MOD, a new `_modDivBigInt` that prefers exact
  integer division and falls back to modular inverse — matches the
  HP50 User Guide p.5-14 mix where 12/3 ≡ 4 even though gcd(3,12)=3,
  but 12/8 "does not exist"); Symbolic / Name paths route through
  Giac with an inline `(...) mod m` postfix wrapping the underlying
  `expand` / `factor` / `gcd` / `/` / `quo` / `rem` call.
  FACTORMOD additionally enforces the AUR §3-83 modulus precondition
  ("less than 100, and a prime number").
- **1 ✗-side row retired**: the standalone `DIVMOD GCDMOD EXPANDMOD
  FACTORMOD DIV2MOD` row in "Not yet supported" is dropped — the
  entire MODULO-family is now ✓.  Not-yet-supported count drops
  1 → 0 in the modular cluster (the `JORDAN` / `SCHUR` row stays).
- **1 review-lane finding closed**: `C-010` (the session-148-filed
  INVMOD block-comment drift at `www/src/rpl/ops.js:1942` and `:1953`)
  — both conditional-future phrasings ("until that slot lands" /
  "When the MODULO state slot lands") rewritten in past tense
  pointing at the session-144 ship.  Two pure-comment edits; behavior
  unchanged.
- **State / persistence:** no change — the five new ops *consume*
  `state.casModulo` via `getCasModulo()` but never mutate it (only
  MODSTO writes), so `persist.js` and `tests/test-persist.mjs` are
  unaffected (40 / 0 stable).

Session-144 row transitions:
- **5 ops newly shipped** (✗ → ✓): `MODSTO` (HP50 AUR §3-150; new row
  in Polynomials / algebra), `ADDTMOD` / `SUBTMOD` / `MULTMOD` (HP50
  AUR §3-9 / §3-243 / §3-153; combined into one row alongside the
  earlier modular cluster), `POWMOD` (HP50 AUR §3-175; new row).
  +3 doc rows total — ADDTMOD/SUBTMOD/MULTMOD share a row (mirrors
  the `STO+ STO- STO* STO/` row style).
- **1 ✗-side reshape**: the standalone `MULTMOD` "Not yet supported"
  row is retired (now ✓), and the row reused for the remaining
  MODULO-family gaps `DIVMOD` / `GCDMOD` / `EXPANDMOD` / `FACTORMOD`
  / `DIV2MOD` — those build on the same `state.casModulo` slot
  introduced this run.
- **State / persistence:** new `casModulo: 13n` field on `state.js`
  (HP50 factory default 13).  `persist.js` round-trips it as
  `{ __t: 'bigint', v: '<digits>' }`; older snapshots without the
  field fall back to the default — same compatibility shape as
  `casVx` (session 076).  Two new assertions in `tests/test-persist.mjs`
  (38 → 40).
- **Comment cleanup:** the INVMOD comment "One-arg MODULO-state
  form deferred until MODULO lands" stays accurate — INVMOD itself
  did not switch to the new state slot this run; the deferred
  upgrade is a follow-up item for a future MODULO-family session.

Session-139 row transitions (carried-forward context):
- **3 ops newly shipped** (✗ → ✓): `LIN` (HP50 AUR §3-131; new row in
  CAS section between `COSSIN` and `GREDUCE`), `LIMIT`, `lim` (HP50
  AUR §lim entry / §3-131; new combined row between `LIN` and
  `GREDUCE`).
- **3 row Notes amendments** (✗-empty → session-136 annotation):
  the four loop rows (`FOR / START / STEP / NEXT`, `WHILE / REPEAT /
  END`, `DO / UNTIL / END`) at `:426`-`:428` had empty Notes columns
  before this run; the session-136 auto-close annotations now mirror
  the session-083 IF row style ("auto-closes on missing END / NEXT
  at program-body bound, mirroring IF (session 083) / CASE (session
  074) / IFERR (session 077)").  Closes `C-009`.
- **2 session-log entries back-filled** (sessions 135 / 136) plus
  this session's entry at the top of the log.

Prior baseline (session 134):
- Fully shipped (✓): 434 (this lane's net since session 129 — session
  134 is a doc-only run resolving the `C-008` finding routed by
  session 133 and retiring three phantom rows; no ✗→✓ transitions
  that session)
- Partially shipped (~): 0
- Not yet implemented (✗): 3 (down from 4 — the `GXROOT` / `LQD` /
  `POLYEVAL` phantoms were retired session 134; `JORDAN` and `SCHUR`
  are folded into one row, `MULTMOD` keeps its own row.)
- Will-not-support (by design): 9 menu groups

Session-134 row transitions:
- **0 rows newly shipped** (no ✗ → ✓).
- **3 phantom rows retired**: `GXROOT` (CAS row dropped — zero hits
  across the AUR / User Guide / User Manual when run through
  `pdftotext`; the Grœbner-family CAS gap is now empty since GBASIS
  shipped session 124 and GREDUCE shipped session 119).  `LQD`
  (Matrix decomps row — zero hits across all three PDFs; the row
  collapses to `JORDAN` `SCHUR` only).  `POLYEVAL` (modular row —
  zero hits across all three PDFs; the real HP50 polynomial
  evaluator is `PEVAL` and has been ✓ since pre-session-061; the
  row collapses to `MULTMOD` only).  Same pattern as the
  session-124 retire of `ACKER` / `CTRB` / `OBSV`.
- **1 row Notes amendment**: `HALT CONT KILL` row (session-131
  DOLIST/DOSUBS/STREAM body-intercept lift addendum + 7-label residual
  paragraph rewrite enumerating the full sync-fallback set).
- **4 session-log entries back-filled** (sessions 130 / 131 / 132 /
  133) — closes the audit-trail gap C-008 had catalogued, plus a
  session-134 entry at the top of the log.

Prior baseline (session 129):
- Fully shipped (✓): 434 (this lane's net since session 124 — the
  session-121 `PROMPT` op was already shipped on disk but was missing
  a row in this file; session 129 added the row, which is the only
  ✗→✓ transition this session)
- Partially shipped (~): 0
- Not yet implemented (✗): 4 (see "Not yet supported" below)
- Will-not-support (by design): 9 menu groups

`grep -c "register(" www/src/rpl/ops.js` = **458** at the end of session
129 (was 455 at the end of session 124, was 448 at the end of session
119).  Session 129 itself shipped no new registrations — the +3 since
session 124 came from intervening lanes (session 126 rewrote the
`register('SEQ', ...)` and `register('MAP', ...)` handlers as
`_driveGen` sync-fallback wrappers that delegate into new `runSeq` /
`runMap` generator helpers; that pattern adds register sites for the
caller-label split, accounting for +2 of the delta — the remaining +1
is sibling-lane traffic between sessions 124 and 126).  Session-129
row transitions:
- **1 row newly shipped** (✗ → ✓): the new `PROMPT` row in the
  control-flow section (session-121 op on disk, no prior row in this
  file; pulled out of the `DISP CLLCD FREEZE INPUT WAIT BEEP → ui
  lane` group).
- **2 row Notes amendments**: `IFT IFTE` row (session-121 generator-
  flavor lift addendum) and `HALT CONT KILL` row (session-121 IFT/IFTE
  body-intercept lift + session-126 SEQ/MAP body-intercept lift; the
  former "only HALT inside a sync-path call (IFT / IFTE / MAP / SEQ
  body) still rejects" caveat is rewritten as the now-correct
  "Residual: HALT reached through the **sync-fallback** Name-dispatch
  path for IFT / IFTE / SEQ / MAP still rejects").
- **8 session-log entries back-filled** (sessions 120 / 121 / 122 /
  123 / 125 / 126 / 127 / 128) — closes the audit-trail gap C-007 had
  catalogued, plus a session-129 entry at the top of the log.

Prior baseline (session 124):
- Fully shipped (✓): 433 (this lane's net since session 119; other
  lanes may have shipped additional ops between sessions 119 and 124
  without bumping this counter — see register() delta below)
- Partially shipped (~): 0
- Not yet implemented (✗): 4 (see "Not yet supported" below)
- Will-not-support (by design): 9 menu groups

`grep -c "register(" www/src/rpl/ops.js` = **455** at the end of session 124
(was 448 at the end of session 119).  +2 from session 124 (`LNAME`,
`GBASIS`); the remaining +5 between sessions 119 and 124 came from
intervening lanes (e.g. session 121's `PROMPT` op for the rpl-programming
lane).  Row transitions this session:
- **2 ops newly shipped** (✗ → ✓): `LNAME` (new row in Polynomials /
  algebra), `GBASIS` (new row in CAS, paired with the session-119
  `GREDUCE` row).
- **1 phantom row retired**: `ACKER CTRB OBSV` (not HP50 commands —
  zero hits across the AUR, User Guide, and User Manual when run
  through `pdftotext`).
- **Not-yet-supported reshape**: the standalone `GXROOT` row stays,
  with its Notes column updated (GBASIS now ships, so GXROOT is the
  last CAS gap on the row).

Prior baseline (session 119):
- **3 ops newly shipped** (✗ → ✓): `EGV` (new row in Vectors / Matrices /
  Arrays — paired note with the session-114 `PCAR` / `CHARPOL` / `EGVL`
  cluster), `RSD` (new row in Vectors / Matrices / Arrays), `GREDUCE`
  (new row in CAS).
- **Not-yet-supported table reshape**: `EGV` row removed outright;
  `RSD` row removed from Matrix decomps (the four-decomp row collapses
  to `JORDAN` / `SCHUR` / `LQD` only); `GREDUCE` removed from the
  CAS row, which collapses to `GXROOT` only.
- **Helper improvement (carry-over benefit).** `_astToRplValue` now
  unwraps `Neg(Num(v))` to a negative Real, so any future Giac call
  that returns `-1` / `-3.14` / etc. lands on the stack as a numeric
  Real instead of a single-leaf-Negation Symbolic.  Surfaced when
  GREDUCE's AUR worked example returned `-1`; benefits EGVL / EGV /
  PCAR / FACTOR alike.

Prior baseline (session 114):
- 4 rows newly shipped (✗ → ✓): `PCAR`, `CHARPOL`, `EGVL`, `PA2B2`.
- 1 phantom row retired: `SRPLY` (zero hits in all three HP50 PDFs).
- 2 REVIEW.md cleanups closed: X-009 + X-010.

Prior baseline (session 109):
- 3 rows newly shipped (✗ → ✓): `Ei`, `Si`, `Ci`.
- 1 row doc-drift corrected (✗ → ✓): `SST` / `SST↓` / `DBUG` —
  session 101 shipped these but its ledger edit never landed in this
  file (session-101 log says "Status table flipped: SST / SST↓ and
  DBUG from 'not…'", but the row here read ✗ through sessions 102–108).
  Corrected under the C-006 close — see below.

Session 109 also closed one code-review finding from
`docs/REVIEW.md`: **C-006** (the session-103 `HALT` / `SST↓` doc-drift
row — Notes column on `HALT` now mentions the session-106 named-sub-
program lift via `_evalValueGen`, the `SST` / `SST↓` / `DBUG` row flips
✗ → ✓ with the session-101 initial ship + session-106 step-into
refinement captured in the Notes column).

Session 104 also cleaned up two code-review findings from
`docs/REVIEW.md`: **X-007** (deleted the dead `compareRoundTrip` export
from `www/src/rpl/cas/giac-convert.mjs`) and **X-008** (dropped the
unused `freeVars` import from the same file — leftover from the
session-094 FACTOR-purge pilot that session 098 removed).

Session 099 also cleaned up three code-review findings from
`docs/REVIEW.md`: **X-001** (4 unused imports from state.js —
`varList`, `goInto`, `getTextbookMode`, `setComplexMode`, `getPrngSeed`),
**X-002** (3 dead private helpers — `_maskVal`, `_isqrtBig`, `_ratAdd`),
**X-004** (unused `trigFwd` / `trigInv` helpers after shadow deletion),
**X-005** (21 duplicate `register()` names), and **O-004** remainder
(`docs/@!MY_NOTES.md:55` still referenced the retired
`COMMANDS_INVENTORY.md` — now `COMMANDS.md`).

Session 081 also cleaned up two code-review findings from session 080's
`docs/REVIEW.md`: **C-001** (split the stale `MEM TVARS` row —
`MEM` is already ✓ at L242, only `TVARS` remains ✗) and **C-002**
(deleted the ghost `RCWS (STWS/RCWS done) | ✓` row that was already
covered by the binary-integer section).

---

## Arithmetic & scalar math

**Numeric type upgrade — session 092.**  Scalar arithmetic is now
backed by three vendored libraries, all under the no-fallback rule
(if the library errors, the op errors — no legacy hand-rolled path):

- **Rational** (`TYPES.RATIONAL`, new this session) — BigInt-backed
  exact ratio `n/d`.  Integer ÷ Integer that doesn't divide evenly
  returns Rational in EXACT mode, Real in APPROX.  All unary ops
  (NEG, ABS, INV, SQ, SQRT, FLOOR/CEIL/IP/FP, SIGN) have
  EXACT/APPROX-aware dispatch: EXACT keeps exactness where
  meaningful, APPROX collapses to Real.  Backed by Fraction.js
  v5.3.4 at `www/src/vendor/fraction.js/`.
- **Real** — `.value` is a **decimal.js Decimal instance** at
  precision 15 (session 093 finished the payload migration; session
  092 had routed arithmetic through Decimal but still unwrapped to JS
  number on the stack).  Every op, formatter, and persistence codec
  reads Decimals via the decimal.js API, so arithmetic chains
  preserve 15-digit precision without IEEE-754 round-trips between
  ops.  The classic `0.1 + 0.2 → 0.3` gotcha is healed, and
  `100! / 99!` stays exact-equal to `100` at 100 digits.  Persisted
  via `{ __t: 'decimal', v: '<toString>' }`.  Backed by decimal.js
  v10.4.3 at `www/src/vendor/decimal.js/`.
- **Complex** — `{ re, im }` on the stack; `complexBinary` now
  routes through complex.js (identity preservation for `i*i = -1`,
  correct branch-cut handling in polar-form `^`).  Backed by
  complex.js v2.4.3 at `www/src/vendor/complex.js/`.

Rational values lift into the Symbolic AST as `Bin('/', Num(n),
Num(d))` so they compose cleanly with CAS ops (FACTOR, EXPAND,
DERIV, etc. via Giac).

| Command | Status | Notes |
|---------|--------|-------|
| `+` `-` `*` `/` `^` | ✓ | Full R/Z/Rat/C/BIN/Vec/Mat/Unit/Sym dispatch (many sessions).  Session 092 — Rational arithmetic (EXACT/APPROX-aware), Real via decimal.js, Complex via complex.js. |
| `NEG` `ABS` `INV` `SQ` `SQRT` | ✓ | Session 064 Tagged transparency; INV/M is matrix inverse, SQ/M is matmul. |
| `SIGN` | ✓ | Session 062 widening (Sy/L/T). |
| `ARG` `CONJ` `RE` `IM` | ✓ | |
| `MAXR` `MINR` | ✓ | Machine Max/Min Real. |
| `RND` `TRNC` `TRUNC` | ✓ | **Session 081** — `TRUNC` two-arg form `(x n → round-toward-zero to n places)` shipped; shares `_truncTowardZero` with `TRNC`, Symbolic lift on `x` or `n`, Integer passthrough. |
| `MANT` `XPON` | ✓ | |
| `FLOOR` `CEIL` `IP` `FP` | ✓ | Session 062 — Tagged + List + V/M + Sym lift.  Session 072 — Unit (`1.5_m FLOOR` → `1_m`, uexpr preserved).  Session 087 — BinaryInteger accepted (no-op; FP of BinInt = `#0` in same base). |
| `MOD` | ✓ | Floor-div (sign-of-divisor).  Session 062 Sym lift.  Session 068 pinned V/M rejection. |
| `MIN` `MAX` | ✓ | Session 062 Sym lift + Tagged.  Session 068 pinned V/M rejection (HP50 AUR §3 scalar-only). |
| `GCD` `LCM` | ✓ | Session 064 — Sy/N/L/T. |
| `%` `%T` `%CH` | ✓ | Session 064 Tagged + List.  Session 072 pinned V/M rejection (HP50 AUR §3-1 scalar-only). |
| `COMB` `PERM` | ✓ | Session 065.  Integer-only (non-integer Real rejected).  Session 153 — `_combPermArgs` argument-type guard tightened to mirror `_intQuotientArg`: Rational is rejected with `Bad argument type` even when integer-valued (`5/1`).  Closes `C-011` from `docs/REVIEW.md` — was leaking `TypeError: Cannot read properties of undefined (reading 'isFinite')` because the prior `isNumber`-based guard let Rational through to a downstream `.value.isFinite()` access on `{n, d}`. |
| `FACT` (`!`) | ✓ | Session 031; session 063 L/V/M/Sy widening. |
| `IDIV2` | ✓ | Session 065.  Two-result; no wrappers. |
| `IQUOT` `IREMAINDER` | ✓ | Session 068 — single-result siblings of IDIV2, Tagged + List + Sy. |
| `GAMMA` `LNGAMMA` | ✓ | Session 068 — Lanczos-backed special functions. |
| `Beta` | ✓ | **Session 069** — B(a, b) = Γ(a)Γ(b)/Γ(a+b) via Lanczos log-gamma, Tagged + List + Sy. |
| `erf` `erfc` | ✓ | **Session 069** — erf via P(1/2, x²); erfc via Q(1/2, x²) for no-cancellation large-x tail. |
| `PSI` | ✓ | **Session 081** — digamma ψ(x) (1-arg) + polygamma ψ⁽ⁿ⁾(x) (2-arg with integer n ≥ 0).  Reflection for x < 0.5, integer-shift recurrence, Bernoulli asymptotic (2k=12).  Poles at non-positive integers throw `Infinite result`.  Tagged + List + V/M + Sym lift. |
| `ZETA` | ✓ | **Session 086** — Riemann zeta ζ(s).  Euler-Maclaurin (N=15, M=6 Bernoulli terms) for s ≥ 0.5, functional-equation reflection below.  s=0 → -1/2; s=1 → `Infinite result` (simple pole); negative even integers → exact 0 (trivial zeros).  Tagged + List + V/M + Sym lift. |
| `LAMBERT` | ✓ | **Session 086** — Lambert W₀ (principal branch).  Halley iteration seeded with a Puiseux expansion near x=-1/e so the branch point returns -1 exactly in double precision.  x < -1/e → `Bad argument value`.  Tagged + List + V/M + Sym lift. |
| `Ei` | ✓ | **Session 109** — exponential integral Ei(x).  x > 0: power series γ + ln x + Σ x^k/(k·k!) for x < 40; asymptotic (e^x/x) · Σ k!/x^k truncated at the smallest term for x ≥ 40.  x < 0: Ei(x) = -E1(-x) via series for \|x\| < 1 and modified-Lentz CF for \|x\| ≥ 1.  x = 0 → `Infinite result`.  Tagged + List + V/M + Sym lift. |
| `Si` | ✓ | **Session 109** — sine integral Si(x), entire and odd.  \|x\| ≤ 4: odd power series Σ (-1)^k x^{2k+1}/((2k+1)(2k+1)!).  \|x\| > 4: complex-Lentz CF for E1(i·\|x\|) gives Si(\|x\|) = π/2 + Im(E1(i·\|x\|)).  Si(0) = 0 exact.  Tagged + List + V/M + Sym lift. |
| `Ci` | ✓ | **Session 109** — cosine integral Ci(x), real-mode x > 0.  x ≤ 4: γ + ln x + Σ (-1)^k x^{2k}/((2k)(2k)!).  x > 4: Ci(x) = -Re(E1(i·x)) via the same complex-Lentz CF as Si.  x = 0 → `Infinite result`; x < 0 → `Bad argument value` (complex result deferred).  Tagged + List + V/M + Sym lift. |
| `XROOT` | ✓ | Sy lift. |
| `EXP` `EXPM` `LN` `LNP1` `LOG` `ALOG` | ✓ | |
| `SIN` `COS` `TAN` `ASIN` `ACOS` `ATAN` | ✓ | Angle-mode aware. |
| `SINH` `COSH` `TANH` `ASINH` `ACOSH` `ATANH` | ✓ | |

## Comparisons / boolean

| Command | Status | Notes |
|---------|--------|-------|
| `==` `=` `<>` `≠` `<` `>` `<=` `>=` `≤` `≥` | ✓ | Session 072 — `==` widened to structural compare on List / Vector / Matrix / Symbolic / Tagged / Unit (was: returned 0 for all such pairs). Session 074 — BinaryInteger widening: `==` / `≠` / `<>` cross-base and cross-family (BinInt × Integer/Real/Complex) through `_binIntCrossNormalize`; `<` / `>` / `≤` / `≥` widened in `comparePair` by promoting BinInt to Integer(value & wordsize-mask). Session 087 — `<` / `>` / `≤` / `≥` accept String × String (char-code lex; HP50 User Guide App. J); `==` / `SAME` widen to Program (structural) and Directory (reference identity). |
| `AND` `OR` `XOR` `NOT` | ✓ | Real/Int/Binary. |
| `SAME` | ✓ | Strict structural equality.  Session 072 same widening as `==`; never lifts to Symbolic. Session 074 — accepts BinInt × BinInt value compare (cross-base) via the eqValues BinInt branch, but deliberately does NOT cross-family widen (so `SAME #10h Integer(16)` = 0). Session 087 — Program (structural) and Directory (reference identity). |
| `TRUE` `FALSE` | ✓ | |

## Bitwise / BinaryInteger

| Command | Status | Notes |
|---------|--------|-------|
| `AND` `OR` `XOR` `NOT` | ✓ | Binary branch. |
| `SL` `SR` `SLB` `SRB` `ASR` | ✓ | |
| `RL` `RR` `RLB` `RRB` | ✓ | |
| `STWS` `RCWS` | ✓ | Wordsize get/set. |
| `BIN` `DEC` `HEX` `OCT` | ✓ | Base mode cycle. |
| `R→B` `B→R` `R->B` `B->R` | ✓ | Session 066 arrow-alias coverage. |

## Angle / conversion

| Command | Status | Notes |
|---------|--------|-------|
| `DEG` `RAD` `GRD` `GRAD` | ✓ | |
| `R→D` `D→R` `R->D` `D->R` | ✓ | |
| `→HMS` `HMS→` `HMS+` `HMS-` | ✓ | |
| `D→HMS` `HMS→D` | ✓ | |
| `C→R` `R→C` `C->R` `R->C` | ✓ | |
| `C→P` `P→C` `C->P` `P->C` | ✓ | |
| `CYLIN` `SPHERE` `RECT` | ✓ | Coord-mode switches. |

## Stack manipulation

| Command | Status | Notes |
|---------|--------|-------|
| `DUP` `DROP` `SWAP` `OVER` `ROT` | ✓ | |
| `DUP2` `DROP2` `DROPN` `DUPN` `PICK` `PICK3` `UNPICK` | ✓ | |
| `ROLL` `ROLLD` `NIP` `NDUPN` `DUPDUP` | ✓ | |
| `DEPTH` `CLEAR` | ✓ | |
| `UNDO` `LASTSTACK` `REDO` | ✓ | Multi-level (deviation from HP50). |
| `LAST` `LASTARG` | ✓ | |

## Types / reflection

| Command | Status | Notes |
|---------|--------|-------|
| `TYPE` `VTYPE` `KIND` | ✓ | |
| `CMPLX?` `CMPLX` | ✓ | |
| `→TAG` `DTAG` | ✓ | |
| `→UNIT` `UVAL` `UBASE` `CONVERT` | ✓ | |
| `OBJ→` `→STR` `STR→` | ✓ | **Session 067** — OBJ→ on Program + →PRG composer.  **Session 155** — R-008 close: HP50 AUR §3-149 fidelity audit of the Real / Integer and Tagged branches.  Real / Integer now push back unchanged (1-in / 1-out) — AUR §3-149 lists no numeric-scalar Input/Output row, and the prior depth-2 mantissa/exponent split was an HP50-divergence; users wanting the split now reach for `MANT` / `XPON` (AUR p.3-6 / p.3-9), unchanged.  Tagged push order verified against AUR §3-149 (`:tag:obj → obj "tag"`): the tag is a String, not a Name — see the dispatch comment at `ops.js:6640-6644` warning future readers off the `Str(v.tag) → Name(v.tag)` "fix".  **Session 156** — follow-up pin coverage in `tests/test-reflection.mjs` for the boundary cells the audit didn't enumerate: empty Vector → `{0}`, empty List / empty Program → Integer(0), negative Real unchanged, Tagged-of-Tagged peels only the outer layer (preserves the inner Tagged on level 2, outer tag as String on level 1).  **Session 159** — R-012 close: missing `isUnit` branch added at `ops.js:6740-6752` per AUR §3-149's `x_unit → x  1_unit` row.  The bare numeric value lands on level 2 as a Real; the unit prototype `Unit(1, v.uexpr)` lands on level 1 — `*`-fold on the pair reconstructs the original Unit because `_unitBinary` on Real×Unit folds the scalar into `b.value` (1·x = x) while preserving the uexpr.  Header block at `:6605-6655` extended with a Unit-row entry (and a sibling note explaining why the bare `Unit(1, v.uexpr)` constructor is used instead of `_makeUnit` — preserves the AUR's shape-preserving "1_unit" output even for a theoretically-empty uexpr).  Closes the AUR §3-149 audit trail end-to-end: every Input/Output table row (Complex / Tagged / List / Vector / Matrix / String / Program / Symbolic / Real / Integer / Unit) now has a matching branch in `register('OBJ→', ...)`.  Pinned by 15 `session159:` assertions in `tests/test-reflection.mjs` plus 6 `session160:` boundary-edge follow-ups (zero-value `0_m`, fractional `2.5_m`, exponent-≠-±1 `3_m^2`, multi-symbol round-trip `5_m/s`, higher-power round-trip `3_m^2`). |
| `NEWOB` | ✓ | Deep copy. |
| `BYTES` | ✓ | |
| `APPROX` `EXACT` `→NUM` `→Q` `→Qπ` | ✓ | |
| `XNUM` `XQ` | ✓ | **Session 086** — ASCII aliases for `→NUM` / `→Q`.  Thin wrappers that delegate via `OPS.get('→NUM').fn` / `OPS.get('→Q').fn` so they pick up any future refinement automatically. |
| `TVARS` | ✓ | **Session 099** — filter names in the current directory by HP50 type code.  Single-arg form `(code → {names})` accepts Integer or integer-valued Real; List-arg form `({codes} → {names})` unions matches across codes.  Negative codes complement ("not of this type"); a list mixing positives and negatives = `{union of positives} ∖ {union of |negatives|}` (HP50 AUR p.2-218).  Rejects non-integer Real, Name, String, and non-integer list elements with `Bad argument type`. |

## Lists

| Command | Status | Notes |
|---------|--------|-------|
| `→LIST` `LIST→` `→LIST` (arrow) | ✓ | |
| `SIZE` `HEAD` `TAIL` `APPEND` | ✓ | **Session 088** — `SIZE` widened to Program (count of top-level tokens; matches HP50 AUR). |
| `GET` `GETI` `PUT` `PUTI` | ✓ | |
| `SUB` `POS` `REVLIST` `SORT` | ✓ | |
| `SEQ` `DOLIST` `DOSUBS` `NSUB` `ENDSUB` `STREAM` | ✓ | |
| `ΣLIST` `ΔLIST` `ΠLIST` `SLIST` `DLIST` `PLIST` (ASCII) | ✓ | |

## Strings

| Command | Status | Notes |
|---------|--------|-------|
| `SIZE` `→STR` `STR→` | ✓ | Shared with lists. |
| `SUB` `POS` `REPL` `SREPL` | ✓ | |
| `CHR` `NUM` | ✓ | |
| `+` | ✓ | Concatenation via `+`. |

## Vectors / Matrices / Arrays

| Command | Status | Notes |
|---------|--------|-------|
| `→ARRY` `ARRY→` `→COL` `COL→` `→ROW` `ROW→` `→V2` `→V3` `V→` | ✓ | |
| `ROW+` `ROW-` `COL+` `COL-` `CSWP` `RSWP` | ✓ | |
| `RCI` `RCIJ` `RDM` `AXL` `AXM` | ✓ | |
| `REPL` `SUB` `GET` `GETI` `PUT` `PUTI` | ✓ | |
| `TRN` `DET` `TRACE` `RANK` `COND` `NORM` | ✓ | |
| `RREF` `REF` `CHOLESKY` `LU` `QR` `LQ` | ✓ | |
| `SCONJ` `SNEG` `SINV` `LSQ` `HADAMARD` | ✓ | |
| `CNRM` `RNRM` `CROSS` `DOT` | ✓ | |
| `GRAMSCHMIDT` `MERGE` `EULER` | ✓ | |
| `IDN` `CON` `RANM` `RDM` | ✓ | |
| `HILBERT` `VANDERMONDE` `AUGMENT` `FLAT` | ✓ | |
| `MAD` | ✓ | |
| `PCAR` `CHARPOL` `EGVL` | ✓ | **Session 114 [Giac]** — characteristic polynomial (`PCAR` = HP50 canonical, `CHARPOL` = Giac-style alias both via `charpoly(M,vx)`) and eigenvalue vector via `eigenvals(M)` (Xcas's list form; `egvl(M)` is the Jordan-matrix form and isn't what HP50 wants).  HP50 AUR §3-196, §3-90.  Square-matrix input only; entries serialised to Giac brackets via `_matrixToGiacStr` + `_scalarToGiacStr` (Integer/Real/Rational/Complex/Symbolic/Name).  Eigenvalues come back as a flat bracket list → Vector of AST-lifted items via `_astToRplValue`.  No-fallback policy. |
| `EGV` | ✓ | **Session 119 [Giac]** — `( [[ M ]] → [[ EVec ]] [ EVal ] )`. HP50 AUR §3-73.  Square-matrix-only.  Eigenvector matrix via Xcas `egv(M)` (columns = right eigenvectors so `M·P = P·diag(EVal)`); eigenvalue vector via the same `eigenvals(M)` call EGVL uses, so the i-th eigenvalue corresponds to the i-th column of EVec by construction.  Reuses `_matrixToGiacStr` / `_popSquareMatrix` from PCAR; non-list Giac output → `Bad argument value`.  No-fallback policy. |
| `RSD` | ✓ | **Session 119** — `( B A Z → B−A·Z )` residual.  HP50 AUR §3-213.  Native numeric (Real / Integer entries); reuses `_asNumArray*` and `_matMulNum` / `_matVecNum`.  Both vector-vector and matrix-matrix shapes supported; mixed shapes (vec/mat) reject with `Bad argument type`; cols(A) ≠ len(Z)/rows(Z) or rows(A) ≠ len(B)/rows(B) reject with `Invalid dimension`.  Symbolic entries reject (numeric-only path, mirrors LSQ). |

## Polynomials / algebra

| Command | Status | Notes |
|---------|--------|-------|
| `HORNER` `PEVAL` `PROOT` `PCOEF` `PTAYL` | ✓ | |
| `FCOEF` `FROOTS` `TCHEB` `TCHEBYCHEFF` | ✓ | |
| `HERMITE` `LEGENDRE` | ✓ | |
| `QUOT` `REMAINDER` `IABCUV` `ICHINREM` `IEGCD` | ✓ | |
| `IBERNOULLI` `DIVIS` `FACTORS` | ✓ | |
| `ISPRIME?` `NEXTPRIME` `PREVPRIME` | ✓ | |
| `EUCLID` | ✓ | **Session 076** — `( a b → {u v g} )` extended-Euclid / Bezout; `u*a + v*b = g`.  Rejects `(0,0)` ("Bad argument value"), non-Integer ("Bad argument type").  Re-signs u,v for negative inputs. |
| `INVMOD` | ✓ | **Session 076** — `( a n → a⁻¹ mod n )` two-arg modular inverse.  Reduces `a` into `[0, n)`.  Rejects `n < 2`, `a ≡ 0 (mod n)`, `gcd(a,n) ≠ 1` ("Bad argument value").  Block-comment phrasings refreshed session 149 (closes `C-010`).  Session 153 — the explicit-modulus 2-arg form is **deliberate**; HP50 firmware exposes INVMOD as a 1-arg op consuming `state.casModulo` like ADDTMOD / SUBTMOD / MULTMOD / POWMOD, but rpl5050 keeps the 2-arg form so programs can compute inverses against ad-hoc moduli without an intervening MODSTO.  Codified in the Intentional Deviations table at `docs/@!MY_NOTES.md`; the prior `TODO` for adding a 1-arg form has been retired. |
| `MODSTO` | ✓ | **Session 144** — `( m → )` set the global CAS MODULO state value (HP50 AUR §3-150).  `state.casModulo` is a BigInt, default 13n; setter normalizes negatives to abs and 0 / 1 to 2 (HP50 firmware contract: modulus is always ≥ 2 positive).  Persisted across reload via `persist.js` (`{ __t: 'bigint', v: '<digits>' }` codec).  Accepts Integer or integer-valued Real; non-integer Real → `Bad argument value`; Vector / Symbolic / etc. → `Bad argument type`. |
| `ADDTMOD` `SUBTMOD` `MULTMOD` | ✓ | **Session 144** — `( a b → (a±·) mod m )` modular arithmetic against the MODSTO-set modulus (HP50 AUR §3-9 / §3-243 / §3-153).  Pure-Integer / integer-Real inputs reduce natively with BigInt and return the centered representative `[-(m-1)/2, m/2]` — `12 0 ADDTMOD` (m=7) → `Integer(-2)` matching the AUR worked example `(X^2+3X+6)+(9X+3) ≡ X^2-2X+2 (mod 7)`.  Symbolic / Name inputs route through Giac as `((expr1 op expr2)) mod m` and lift the result back via `giacToAst`.  Rejects Vector / Matrix / Complex / List / Tagged / etc. with `Bad argument type` (only number-shaped operands are valid).  No-fallback policy. |
| `POWMOD` | ✓ | **Session 144** — `( a n → a^n mod m )` modular exponentiation against the MODSTO modulus (HP50 AUR §3-175).  Pure-Integer fast path uses `_powModBig` with BigInt; the result is centered (matches ADDTMOD/SUBTMOD/MULTMOD).  Symbolic / Name path emits `powmod(base,exp,m)` to Giac and round-trips the result.  Negative exponent → `Bad argument value`.  No-fallback policy. |
| `EXPANDMOD` | ✓ | **Session 149 [Giac]** — `( a → a' )` coefficient-reduce + expand mod the MODSTO modulus (HP50 AUR §3-80).  Pure-Integer / integer-Real path returns `_centerMod(v, m)` directly (mirrors User Guide p.5-15: `EXPANDMOD(125) ≡ 5 (mod 12)`).  Symbolic / Name path routes through Giac as `expand(${e}) mod ${m}` and lifts back via `_astToRplValue` (numeric-leaf → Real, polynomial → Symbolic).  Rejects Vector / Matrix / Complex / etc. with `Bad argument type`.  No-fallback policy. |
| `FACTORMOD` | ✓ | **Session 149 [Giac]** — `( p → factored )` factorization in Z_m[X] (HP50 AUR §3-83).  Modulus precondition enforced before the operand is consumed: `m < 100 && _isPrimeBig(m)` else `Bad argument value` (matches the AUR rule "the modulus must be less than 100, and a prime number").  Pure-Integer / integer-Real path collapses to `_centerMod(v, m)` (every nonzero element of Z/pZ is a unit, so a bare integer round-trips as itself centered).  Symbolic / Name path routes through Giac as `factor(${e}) mod ${m}`.  Worked example `FACTORMOD(X^2+2)` (m=3) → `(X+1)*(X-1)`.  No-fallback policy. |
| `GCDMOD` | ✓ | **Session 149 [Giac]** — `( a b → gcd )` polynomial GCD over Z_m[X] (HP50 AUR §3-96).  Pure-Integer-pair path: native `_extGcdBigInt` then `_centerMod`; rejects gcd(0,0) with `Bad argument value` (matches `EUCLID`).  Symbolic / Name path routes through Giac as `gcd(${e1},${e2}) mod ${m}`.  Worked example `GCDMOD(2X^2+5, 4X^2-5X)` (m=13) → `-(4X-5)`.  No-fallback policy. |
| `DIVMOD` | ✓ | **Session 149 [Giac]** — `( a b → quotient )` modular division in Z_m (or rational form in Z_m[X] for symbolic) (HP50 AUR §3-63).  Pure-Integer path uses `_modDivBigInt`: prefers exact integer division (`12 3 DIVMOD` = `4` mod 12 even though gcd(3,12)=3, matching User Guide p.5-14 "12/3 ≡ 4 (mod 12)" / "66/6 ≡ -1 (mod 12)") and falls back to modular inverse otherwise (`64 13` = `4` since 13 ≡ 1 mod 12 invertible); rejects when neither path applies (`12 8` → `Bad argument value` since 12 isn't divisible by 8 and gcd(8,12)≠1, matching User Guide "12/8 (mod 12) does not exist").  Symbolic path emits `(${e1})/(${e2}) mod ${m}` to Giac.  AUR worked example `DIVMOD(5*X^2+4*X+2, X^2+1)` (m=3) → `-((X^2-X+1)/(X^2+1))`.  No-fallback policy. |
| `DIV2MOD` | ✓ | **Session 149 [Giac]** — `( a b → q r )` Euclidean division mod m, two-result (HP50 AUR §3-62).  Quotient on level 2, remainder on level 1.  Pure-Integer path uses `_modDivBigInt` for q (same exact-then-inverse policy as `DIVMOD`) and `_centerMod(a - q·b, m)` for r — User Guide p.5-14 examples reproduce: `125 17 DIV2MOD` (m=12) → `(1, 0)`; `68 7 DIV2MOD` (m=12) → `(-4, 0)`; `7 5 DIV2MOD` (m=12) → `(-1, 0)`.  Symbolic path issues two Giac calls — `quo(${e1},${e2}) mod ${m}` and `rem(${e1},${e2}) mod ${m}` — simpler than parsing a list response from `divmod(a,b,m)`.  AUR worked example `DIV2MOD(X^3+4, X^2-1)` (m=3) → `(X, X+1)`.  No-fallback policy. |
| `PA2B2` | ✓ | **Session 114** — `( p → (a,b) )` Fermat sum of two squares for primes with `p=2` or `p ≡ 1 (mod 4)`; native Cornacchia via the existing BigInt helpers (`_isPrimeBig`, `_powModBig`, new `_bigIntSqrtFloor`).  Returns a native Complex Gaussian integer with the smaller component real, larger imag.  Rejects non-prime / `p ≡ 3 (mod 4)` with "Bad argument value".  HP50 AUR §3-162. |
| `CYCLOTOMIC` | ✓ | **Session 081** — `( n → Φ_n(X) )` n-th cyclotomic polynomial as a Symbolic in X.  BigInt long-division build via `Φ_n = (Xⁿ − 1) / ∏_{d\|n, d<n} Φ_d`.  Capped at n ≤ 200 (MAX_SAFE_INTEGER guard on the descending-degree coefficient array).  Rejects non-Integer and n < 1. |
| `LNAME` | ✓ | **Session 124** — `( 'expr' → 'expr' [names] )` extract the symbolic Names referenced by an expression.  Native AST walker (no Giac dependency): visits `Var` nodes and `Fn` nodes whose head is not in `KNOWN_FUNCTIONS` (i.e. user-defined function names land in the result), dedups in first-seen order, sorts by length DESC then alpha ASC to match HP50 AUR §3-136.  Preserves the input on level 2 and pushes the Vector of Names on level 1.  Rejects non-Symbolic input ("Bad argument type"). |

## CAS (symbolic)

**CAS engine — session 092:** Symbolic CAS calls are delegated to
**Giac** (Bernard Parisse, Institut Fourier; GPL-3.0+), vendored at
`www/src/vendor/giac/`.  The adapter lives at
`www/src/rpl/cas/giac-engine.mjs` (main-thread synchronous); AST ↔
Giac-string conversion is `www/src/rpl/cas/giac-convert.mjs`.  There
is **no legacy-algebra.js fallback**: if Giac isn't ready or the
caseval errors, the op errors.  Integer-input fast paths (e.g.
`FACTOR 42` via native trial division) are intentional native paths,
not fallbacks.  Migration is incremental — rows below are flagged
**[Giac]** once they've moved; others still run through the original
`www/src/rpl/algebra.js` until migrated.

| Command | Status | Notes |
|---------|--------|-------|
| `FACTOR` | ✓ | **Session 092 [Giac]** — Symbolic routed through `factor(...)`; Integer path is native trial-division (Giac's `factor(12)` prints `(2)^2*3` which doesn't match HP50 semantics). No-fallback policy: Symbolic input errors if Giac isn't ready. |
| `EVAL` `APPROX` | ✓ | |
| `EXPAND` `COLLECT` `SUBST` | ✓ | **Session 095 [Giac]** — pilot four + COLLECT/SUBST; all routed through `caseval` with the purge-wrapping helper. No-fallback policy. |
| `DERIV` `INTEG` `SOLVE` | ✓ | **Session 095 [Giac]** — pilot four; SUM is native. |
| `DISTRIB` `TEXPAND` `TLIN` | ✓ | **Session 095 [Giac]** — trig/exp/log family. |
| `LNCOLLECT` `EXPLN` `TSIMP` `TCOLLECT` | ✓ | **Session 095 [Giac]** — trig/exp/log family; the native Pythagorean walker was deleted as part of this migration. |
| `LAPLACE` `ILAP` `PREVAL` | ✓ | **Session 095 [Giac]** — `laplace/ilaplace/preval` via `caseval`. `PREVAL` multi-var path still honors `VX`. |
| `HEAVISIDE` `DIRAC` | ✓ | |
| `SUM` | ✓ | Native sum-of-list path. |
| `HALFTAN` `ASIN2C` `ASIN2T` `ACOS2S` | ✓ | |
| `ATAN2S` `TAN2SC` `TAN2SC2` `TAN2CS2` | ✓ | |
| `COLLECT` `EPSX0` | ✓ | |
| `VX` `SVX` | ✓ | **Session 076** — CAS main variable slot.  `VX` pushes the current name (default `x` — deliberate lowercase deviation from the HP50 factory `X`, matching the lowercase-default keyboard); `SVX` sets it from a Name or String, rejects Real ("Bad argument type") and empty string ("Bad argument value").  Persists across reload (snapshot field `casVx`).  LAPLACE/ILAP/PREVAL now honor VX for variable selection. |
| `EXLR` | ✓ | **Session 076** — extract left/right of an equation-style Symbolic.  `( 'L==R' → 'L' 'R' )`; works on any top-level binary (`==`, `+`, `-`, `<`, `≤`, …).  Rejects bare variable / function application ("Bad argument value"), non-Symbolic ("Bad argument type"). |
| `PROPFRAC` | ✓ | **Session 104 [Giac]** — proper-fraction form via `propfrac(...)`.  Symbolic routed through Giac; Rational lifts to Symbolic via `_toAst` so `43 12 / PROPFRAC → '3 + 7/12'` (HP50 AUR §3-197).  Real/Integer/Name pass-through.  No-fallback policy. |
| `PARTFRAC` | ✓ | **Session 104 [Giac]** — partial-fraction decomposition via `partfrac(...)`.  Symbolic routed through Giac; Real/Integer/Rational/Name pass-through (no non-trivial decomp on a bare number). HP50 AUR §3-180.  No-fallback policy. |
| `COSSIN` | ✓ | **Session 104 [Giac]** — rewrite in SIN/COS basis via Giac `tan2sincos(...)` (TAN(x) → SIN(x)/COS(x)).  Symbolic routed through Giac; Real/Integer/Rational/Name pass-through.  HP50 AUR §3-64.  No-fallback policy. |
| `LIN` | ✓ | **Session 139 [Giac]** — exponential linearization via Giac `lin(...)`.  HP50 AUR §3-131.  Single-arg; Symbolic routes through `buildGiacCmd` + `lin(${e})` (e.g. `e^X·e^Y` → `e^(X+Y)`); Real/Integer/Rational/Name pass-through (no non-trivial linearization on a bare scalar).  Vector / Matrix / List / Tagged / etc. reject `Bad argument type`.  No-fallback policy. |
| `LIMIT` `lim` | ✓ | **Session 139 [Giac]** — limit at a point via Giac `limit(expr,var,val)`.  HP50 AUR §lim entry / §3-131.  `( expr 'var=val' → limit )` (explicit equation form, top-level `=` or `==` Symbolic) or `( expr val → limit )` (bare Real/Integer/Rational point — variable defaults to `getCasVx()`, default `x`, per AUR p.3-131 "if the variable approaching a value is the current CAS variable, it is sufficient to give its value alone").  Numeric-leaf Giac result lifts to Real; non-numeric stays Symbolic.  Non-Symbolic / non-Name expression → `Bad argument type`; equation lhs not a `Var` → `Bad argument value`; non-Symbolic / non-numeric / non-Name point → `Bad argument type`.  `LIMIT` is the HP49G backward-compat name; `lim` is the HP50 lowercase canonical alias (thin `OPS.get('LIMIT').fn(s)` wrapper, mirrors CHARPOL / XNUM / XQ alias pattern).  No-fallback policy. |
| `GREDUCE` | ✓ | **Session 119 [Giac]** — `( poly basis vars → reduced )` Grœbner reduction via `greduce(p,[basis],[vars])`.  HP50 AUR §3-99.  Level 1 must be a Vector of bare Names; level 2 a Vector of polynomials (Symbolic / Name / Integer / Real / Rational); level 3 the polynomial to reduce.  Empty basis or empty vars list → `Invalid dimension`.  Result lifts back through `giacToAst` + `_astToRplValue` so a numeric remainder lands as Real and a polynomial remainder stays Symbolic (`_astToRplValue`'s session-119 `Neg(Num)` unwrap fixes the AUR `-1` worked example).  No-fallback policy. |
| `GBASIS` | ✓ | **Session 124 [Giac]** — `( polys vars → basis )` Grœbner basis via `gbasis([polys],[vars])`.  HP50 AUR §3-92.  Level 1 must be a Vector of bare Names; level 2 a Vector of polynomials (Symbolic / Name / Integer / Real / Rational).  Empty polys or empty vars list → `Invalid dimension`; non-Vector args → `Bad argument type`; non-Name in vars → `Bad argument type`; non-list Giac output (e.g. unit ideal `[1]` is still a list — but `gbasis(...)` errors come back as bare strings) → `Bad argument value`.  Result Vector items lift through `giacToAst` + `_astToRplValue` (Names stay Names, numeric polynomials become Symbolic, scalar `1` lifts to `Real(1)`).  No-fallback policy. |

## Statistics

| Command | Status | Notes |
|---------|--------|-------|
| `MEAN` `MEDIAN` `SDEV` `VAR` `STD` | ✓ | |
| `CORR` `COV` `TOT` | ✓ | |
| `NΣ` `NSIGMA` `ΣX` `ΣX²` `ΣY` `ΣY²` `ΣXY` | ✓ | Session 066 — test-stats.mjs |
| `SX` `SX2` `SY` `SY2` `SXY` | ✓ | ASCII aliases. |
| `MAXΣ` `MINΣ` `MAXS` `MINS` | ✓ | |
| `BESTFIT` `LINFIT` `EXPFIT` `LOGFIT` `PWRFIT` | ✓ | |
| `PREDV` `PREDX` `PREVAL` | ✓ | |
| `RAND` `RDZ` | ✓ | Session 051 PRNG. |
| `UTPN` | ✓ | Session 065 (μ, σ², x). |
| `UTPC` | ✓ | Session 068 (ν, x) — chi-square upper tail via regularised Γ. |
| `UTPF` | ✓ | **Session 069** (n, d, F) — F upper tail via regularised incomplete beta I_w(d/2, n/2). |
| `UTPT` | ✓ | **Session 069** (ν, t) — Student-t upper tail via the same I-of-ν/(ν+t²) closed form. |

## Control flow & program substrate

| Command | Status | Notes |
|---------|--------|-------|
| `IF` `THEN` `ELSE` `END` | ✓ | **Session 083** — IF auto-closes on missing END at program-body bound, mirroring CASE (session 074) and IFERR (session 077); IF-without-THEN stays a hard error. |
| `CASE` `THEN` `END` | ✓ | Session 067. |
| `FOR` `START` `STEP` `NEXT` | ✓ | **Session 136** — `FOR` and `START` auto-close on missing `NEXT` / `STEP` at program-body bound, mirroring IF (session 083) / CASE (session 074) / IFERR (session 077).  A spurious closer of the wrong kind (e.g. `END` in the `NEXT`/`STEP` slot) stays a hard error; see `runFor` / `runStart` in `www/src/rpl/ops.js`. |
| `WHILE` `REPEAT` `END` | ✓ | **Session 136** — `WHILE/REPEAT` auto-closes on missing `END` at program-body bound, mirroring IF (session 083) / CASE (session 074) / IFERR (session 077).  A spurious closer of the wrong kind (e.g. `NEXT` in the `END` slot) stays a hard error; see `runWhile` in `www/src/rpl/ops.js`. |
| `DO` `UNTIL` `END` | ✓ | **Session 136** — `DO/UNTIL` auto-closes on missing `END` at program-body bound, mirroring IF (session 083) / CASE (session 074) / IFERR (session 077).  A spurious closer of the wrong kind (e.g. `NEXT` in the `END` slot) stays a hard error; see `runDo` in `www/src/rpl/ops.js`. |
| `IFT` `IFTE` | ✓ | Stack conditionals.  **Session 121:** IFT / IFTE actions now re-enter `evalRange` via the body-intercept path (`ops.js:3145-3158`); HALT / PROMPT inside the action lifts cleanly through `_evalValueGen` and resumes via CONT.  The `register('IFT', …)` / `register('IFTE', …)` handlers stay as sync fallbacks for the rare Name-dispatch path (`'IFT' EVAL`, Tagged-wrapped `Name(IFT)`); those still reject HALT through `_driveGen` with the session-111 caller labels (`'IFT action'` / `'IFTE action'`).  See `docs/RPL.md:42-46`. |
| `IFERR` `THEN` `ELSE` `END` | ✓ | |
| `ERRM` `ERRN` `ERR0` `DOERR` | ✓ | |
| `EVAL` | ✓ | |
| `→PRG` `OBJ→` (on Program) | ✓ | Session 067. |
| `ABORT` | ✓ | Session 067. |
| `DECOMP` | ✓ | |
| `HALT` `CONT` `KILL` | ✓ | Session 074 pilot — top-level program bodies only; HALT inside control flow or `→` raises a pilot-limit error. **Session 083:** multi-slot halted LIFO (`state.haltedStack`) matches HP50 AUR p.2-135; CONT/KILL pop one slot off the top, new `clearAllHalted()` drains, `haltedDepth()` exposes depth. **Session 088:** generator-based `evalRange` — structural HALT pilot-limit fully lifted; HALT now works from inside `FOR`, `IF`, `WHILE`, `DO`, `IFERR`, and `→` bodies. **Session 106:** named-sub-program HALT lifted via `evalToken` → `_evalValueGen` for Name-binding evaluations. **Session 121:** IFT / IFTE bodies lifted via the body-intercept path in `evalRange` (`ops.js:3145-3158`) — HALT / PROMPT inside an IFT or IFTE action now suspends cleanly. **Session 126:** SEQ / MAP per-iteration bodies lifted via `runSeq` / `runMap` generators (`ops.js:7568-7607`, `8053-8096`) — HALT / PROMPT inside a SEQ expression or MAP program suspends cleanly and CONT resumes inside the same iteration with the partial accumulator intact. **Session 131:** DOLIST / DOSUBS / STREAM per-iteration program bodies lifted via `runDoList` / `runDoSubs` / `runStream` generators (`ops.js:8142`, `:8224`, `:8304`) plus body-intercept dispatch in `evalRange` (`:3196`, `:3202`, `:3208`) — HALT / PROMPT inside a DOLIST / DOSUBS / STREAM iteration suspends cleanly and CONT resumes inside the same iteration with the partial accumulator and (for DOSUBS) the NSUB/ENDSUB context frame intact via the generator's `try/finally` teardown.  Residual: HALT reached through the **sync-fallback** Name-dispatch path for IFT / IFTE / SEQ / MAP / DOLIST / DOSUBS / STREAM (e.g. `'IFT' EVAL`, Tagged-wrapped `Name('SEQ')`) still rejects through `_driveGen` with the session-111 caller labels (`'IFT action'` / `'IFTE action'` / `'SEQ expression'` / `'MAP program'` / `'DOLIST program'` / `'DOSUBS program'` / `'STREAM program'`); body-intercept is the supported path.  See `docs/RPL.md:42-46`, `:117-123`, `:171-179`. |
| `PROMPT` | ✓ | **Session 121** — HP50 AUR p.2-160 form: pop level 1, stash it as the active prompt banner via `setPromptMessage(msg)`, then yield up to the EVAL/CONT driver via the same generator-suspension channel HALT uses (`evalRange` intercept at `ops.js:3129-3136`).  CONT clears the banner via `clearPromptMessage()` and resumes the suspended generator; KILL drops the suspension and clears the banner; SST is a no-op for PROMPT (the suspension already happened).  Outside a running program — i.e. reaching the registered handler via Name dispatch (`'PROMPT' EVAL` from the keypad) — throws `PROMPT: not inside a running program`, mirroring HALT.  Owned by the rpl-programming lane (suspension protocol), not the UI lane (the prompt banner is rendered by the UI but the op itself is a control-flow primitive). |
| `RUN` | ✓ | **Session 083** — registered as a CONT synonym for the no-DBUG case (AUR p.2-177). Will upgrade to debug-aware resume once DBUG substrate lands. |
| `SST` `SST↓` `DBUG` | ✓ | **Session 101** — single-step debugger.  `SST` steps token-by-token through the most-recently-halted program (AUR p.2-184); `DBUG` installs a freshly-pushed Program as halted so the user can step from the first token (AUR p.2-77); `SST↓` originally registered as an alias for `SST`.  **Session 106:** `SST↓` shipped as a real step-into op via `_stepInto` + `_insideSubProgram` + `_shouldStepYield` (`ops.js:2944-3118`) — single-stepping now descends into the body of a sub-program reached by name lookup, while plain `SST` keeps stepping over.  See `docs/RPL.md:75-148`. |

## Variables & directories

| Command | Status | Notes |
|---------|--------|-------|
| `STO` `RCL` `PURGE` `VARS` `ORDER` | ✓ | |
| `STO+` `STO-` `STO*` `STO/` | ✓ | Arithmetic variants. |
| `INCR` `DECR` | ✓ | |
| `CRDIR` `PGDIR` `UPDIR` `HOME` `PATH` | ✓ | Session 012. |
| `STOF` `RCLF` | ✓ | Flag word persistence. |
| `SF` `CF` `FS?` `FC?` `FS?C` `FC?C` | ✓ | |
| `CLB` (clear all user flags) | ✓ | |

## Display / UI ops reachable from RPL

| Command | Status | Notes |
|---------|--------|-------|
| `FIX` `SCI` `ENG` | ✓ | Display-mode ops. |
| `TEXTBOOK` | ✓ | |
| `MEM` | ✓ | |

## Display / graphics / UI — handled by UI lane

These are tracked here only to mark them out-of-scope for the command-support
lane; `rpl5050-ui-development` owns them.

- `DRAW` `DRAX` `DRAWMENU` `ERASE` `PICT` → ui lane
- `DISP` `CLLCD` `FREEZE` `INPUT` `WAIT` `BEEP` → ui lane (PROMPT moved
  to the control-flow section session 129 — it ships through the
  rpl-programming lane as a HALT-flavored suspension op, not through
  the UI render loop)
- `MENU` `TMENU` `RCLMENU` → ui lane
- `PVIEW` `PXC` `CPX` `GOR` `GXOR` → ui lane

## Not yet supported (in-lane candidates for future runs)

These are HP50 AUR commands, in-lane for this file, with no registration
in `www/src/rpl/ops.js`.  Listed with the cluster they belong to so they
can be picked up as a group.

| Command | Cluster | Priority | Notes |
|---------|---------|----------|-------|
| `JORDAN` `SCHUR` | Matrix | low | Advanced decomps.  (`RSD` shipped session 119, `LQD` retired session 134 as a phantom — neither was previously grouped on this row.) |
| `BARPLOT` `HISTPLOT` `SCATRPLOT` | graphics | ui-lane | (graphics — not in this lane) |
| `ATTACH` `DETACH` `LIBS` | libraries | will-not | `LIB` not supported per `@!MY_NOTES.md`. |

## Will-not-support (by design deviation)

Menu-level blocks in `docs/@!MY_NOTES.md` — none of these ops are
accepted as work for this lane:

- `USER` mode and keyboard assignments
- `ENTRY` mode
- `S.SLV` (algebraic solver UI)
- `NUM.SLV` (numeric solver UI)
- `FINANCE` menu (TVMROOT, AMORT, etc.)
- `TIME` menu (DATE, TIME, TICKS, etc.)
- `DEF` user-defined function shorthand
- `LIB` / `LIBS` / `ATTACH` / `DETACH` custom library system
- `OFF`

If a user asks for one of these, the correct response is to point at
`@!MY_NOTES.md` and close the request.

---

## Session log — status changes

Maintain chronologically, most recent first.

- **session 161** (2026-04-25) — `rpl5050-command-support` lane.
  Release-mode doc-reconciliation run, no source-side or test-side
  edits.  Two substantive items, both `docs/COMMANDS.md` hygiene:

  1. **OBJ→ row Notes amendment** (`docs/COMMANDS.md:416`).
     The OBJ→ row's Notes column carried a "**Residual:** R-012
     (open, routed to `rpl5050-rpl-programming`)" call-out from
     the session-157 amendment, flagging that OBJ→ on a Unit
     value rejected `Bad argument type` instead of pushing
     `x  1_unit` per AUR §3-149's `x_unit → x  1_unit` row.
     Session 159 (`rpl5050-rpl-programming`) closed `R-012` by
     adding the missing `isUnit` branch at `ops.js:6740-6752` —
     bare numeric value lands on level 2 as Real, unit prototype
     `Unit(1, v.uexpr)` lands on level 1; `*`-fold reconstructs
     the original Unit via `_unitBinary`'s Real×Unit fold.
     Notes column rewritten to: (a) drop the "Residual: R-012"
     paragraph; (b) add a **Session 159** addendum citing the
     branch location, the AUR Input/Output table closure (every
     row Complex / Tagged / List / Vector / Matrix / String /
     Program / Symbolic / Real / Integer / Unit now has a matching
     branch), the bare-`Unit(1, v.uexpr)` rationale (vs.
     `_makeUnit`'s empty-uexpr collapse), and the test pin counts
     (15 `session159:` + 6 `session160:` boundary-edge follow-ups
     in `tests/test-reflection.mjs`).  Also nudged the comment-
     guard line reference forward (`:6649-6655` → `:6640-6644`)
     to match the live header block at `ops.js:6605-6655`.
     This is doc-row reconciliation, not a source edit.

  2. **Counts heading bump + session-log back-fill**
     (`docs/COMMANDS.md:24` and `:637` block).  Counts heading
     refreshed from "as of session 157" to "as of session 161"
     with the twelve-session no-net-change narrative extended
     (sessions 150 → 161 are all contract-tightening / coverage /
     doc-hygiene runs; no ✗ → ✓ transitions).  Comment-guard
     line reference also fixed in the Counts narrative
     (`ops.js:6649-6655` → `:6640-6644`).  Session-log block
     back-filled with four prior-session entries (sessions 158 /
     159 / 160-code-review / 160-unit-tests) plus this run's
     session-161 entry at the top.  No `register()` count change
     (476 / 455 unchanged from session 153 entry).

  Run-entry test gate: `tests/test-all.mjs` 5133 / 0 (was 5120 at
  session-160-code-review close + 13 from session-160-unit-tests
  three coverage clusters); `tests/test-persist.mjs` 66 / 0;
  `tests/sanity.mjs` 22 / 0.  Run-close test gate: identical (no
  source-side or test-side edits this run).  No new findings
  filed in `docs/REVIEW.md`; the Commands bucket has zero open
  findings at run-close (`C-001` … `C-011` all resolved; release
  open queue is `O-009` + `O-011`, both `[deferred - post-ship]`,
  neither in this lane's bucket).  Lock =
  `utils/@locks/session161-command-support.json`, scope
  `[docs/COMMANDS.md, docs/REVIEW.md, logs/]`, released gracefully
  at end of run.

- **session 160** (2026-04-25) — `rpl5050-unit-tests` lane.
  Release wrap-up coverage pass.  Three substantive `session160:`
  pin clusters totaling +13 assertions, all weighted toward
  pinning recently-shipped behavior: (a) `tests/test-
  reflection.mjs` +6 — OBJ→ Unit follow-up boundary edges that
  session 159's R-012 close pin-set did not enumerate (zero-value
  `0_m`, fractional `2.5_m`, exponent-≠-±1 `3_m^2`, multi-symbol
  round-trip `5_m/s`, higher-power round-trip `3_m^2`); (b)
  `tests/test-types.mjs` +4 — transcendental wrapper-LIST n=0 /
  n=1 boundary closures lifting session 156's empty-V/L/P n=0
  closure pattern onto the session-158 wrapper-LIST composition;
  (c) `tests/test-algebra.mjs` +3 — MODULO ARITH follow-up edges
  session 156's pin-set did not enumerate (DIV2MOD MODSTO
  consultation pair + GCDMOD(0,0) both-zero reject).  No source-
  side change; no `register()` change.  `tests/test-all.mjs`
  5120 → 5133 (+13).  Concurrent with `session160-code-review`
  via non-overlapping locks (this lane held test files +
  `docs/TESTS.md`; the review lane held `docs/REVIEW.md` +
  `logs/` + a mid-run scope broaden to `www/src/app.js` for the
  X-003 close).

- **session 160** (2026-04-25) — `rpl5050-code-review` lane.
  Release-mode wrap-up review-lane run (sixteenth such run).
  Folded all sibling-lane closures since session 152 into the
  authoritative ledger (`docs/REVIEW.md`), shipped one charter-
  permitted dead-import drop, aged the two `[deferred - post-
  ship]` items.  Substantive items: (a) **X-003 close** at
  `www/src/app.js:13-15` — dropped the unused `clampLevel`
  import from the `./ui/interactive-stack.js` import block;
  16 review-lane runs aging at close.  Pure dead-import drop;
  `node --check` clean; `clampLevel` is still used internally
  by `levelUp` / `levelDown` in `interactive-stack.js`, just no
  cross-module caller.  (b) **REVIEW.md release-mode triage**
  — last-updated stamp bumped to session 160; preamble
  rewritten to attribute deltas across ship-prep-2026-04-25 +
  sessions 153 / 154 / 155 / 156 / 157 / 158 / 159; ship-
  priorities section updated to reflect closures; `R-008` /
  `R-012` / `C-011` / `X-003` promoted to resolved with
  attribution; `O-009` and `O-011` aged with re-verification
  notes (both `[deferred - post-ship]`).  No source-side change
  in this lane outside the X-003 in-place edit.  Lock =
  `rpl5050-code-review-2026-04-25`, broadened mid-run for the
  X-003 close, released gracefully.

- **session 159** (2026-04-25) — `rpl5050-rpl-programming` lane.
  **R-012 close** (the third — and final — row of the AUR §3-149
  OBJ→ Input/Output table).  Session 155's R-008 audit closed
  the Real and Tagged rows; R-012 was filed session 156 as the
  follow-up Unit row that session 155 did not address.  Session
  159 added the missing `isUnit` branch to OBJ→'s dispatch at
  `www/src/rpl/ops.js:6740-6752`, matching AUR §3-149's
  `x_unit → x  1_unit` row exactly: `s.push(Real(v.value));
  s.push(Unit(1, v.uexpr));`.  The bare `Unit(1, v.uexpr)`
  constructor (vs. `_makeUnit`) is intentional — preserves the
  AUR shape-preserving "1_unit" output even for a theoretically
  empty uexpr (in practice the codebase's `_makeUnit` collapse
  invariant ensures Units on the stack always have non-empty
  uexpr, but the bare constructor keeps the OBJ→ branch robust
  against any future Unit constructor that doesn't go through
  that path).  Header block at `ops.js:6605-6655` extended with
  a Unit-row entry citing AUR §3-149 and a sibling note
  explaining the constructor choice.  Pinned by 15 `session159:`
  assertions in `tests/test-reflection.mjs` (8 test blocks:
  basic decomposition, *-fold round-trip, multi-symbol uexpr,
  negative-value sign rule, ASCII alias OBJ-> parity, Tagged-of-
  Unit one-layer-peel composition, regression guard against a
  future Name-instead-of-Unit refactor, reverse-uexpr (1/m)
  shape preservation).  After this run every row of AUR §3-149
  has a matching branch in `register('OBJ→', ...)`.  No
  `register()` count change (still 476 / 455).  `tests/test-
  all.mjs` 5105 → 5120 (+15 session159 pins).

- **session 158** (2026-04-25) — `rpl5050-data-type-support` lane.
  Two more hard-assertion **pinning** clusters in
  `tests/test-types.mjs` lifting session-150's wrapper-VM-under-
  Tagged work onto the **LIST axis** (bare-List + Tagged-of-List)
  on already-widened transcendental ops: ACOSH/ATANH (Cluster 1,
  Integer-stay-exact under bare/Tagged-List wrapper composition,
  out-of-domain Real → Complex bypass, heterogeneous per-element
  domain dispatch) and LN/LOG/EXP/ALOG (Cluster 2, EXACT-mode
  Integer-stay-exact under bare/Tagged-List composition,
  distinct-position outputs, heterogeneous stay-symbolic +
  integer-clean, APPROX-mode bypass).  +19 assertions
  (`tests/test-types.mjs` 829 → 848).  No source-side change —
  the wrapper paths were already live since session 145 / 150;
  this run pins them.  `tests/test-all.mjs` 5086 → 5105 (+19).

- **session 157** (2026-04-25) — `rpl5050-command-support` lane.
  Release-mode doc-reconciliation run, no source-side or test-side
  edits.  Two substantive items, both `docs/COMMANDS.md` hygiene:

  1. **OBJ→ row Notes amendment** (`docs/COMMANDS.md:409`).
     The OBJ→ row Notes column previously read only "Session 067
     OBJ→ on Program + →PRG composer." — stale after the
     session-155 R-008 close (HP50 AUR §3-149 fidelity audit of
     the Real / Integer + Tagged branches) and the session-156
     unit-tests follow-up (boundary-cell pin coverage).  Notes
     amended with: (a) **Session 155** addendum citing the Real
     / Integer push-unchanged shape, the Tagged-tag-as-String
     verification, and the comment guard at `ops.js:6649-6655`
     warning future readers off the `Str(v.tag) → Name(v.tag)`
     "fix"; (b) **Session 156** addendum citing the
     `tests/test-reflection.mjs` follow-up pin set (empty Vector
     → `{0}`, empty List / Program → Integer(0), negative Real
     unchanged, Tagged-of-Tagged peels only the outer layer);
     (c) explicit **Residual** call-out for `R-012` (open,
     routed to `rpl5050-rpl-programming`) — OBJ→ on a Unit
     value still rejects `Bad argument type` instead of pushing
     `x  1_unit` per AUR §3-149's `x_unit → x  1_unit` row;
     ship-stretch finding.

  2. **Counts heading bump + session-log back-fill**
     (`docs/COMMANDS.md:24` and `:629` block).  Counts heading
     refreshed from "as of session 153" to "as of session 157"
     with the eight-session no-net-change narrative (sessions
     150 → 157 are all contract-tightening / coverage / doc-
     hygiene runs; no ✗ → ✓ transitions).  Session-log block
     back-filled with seven prior-session entries (sessions
     150 / 151 / 152 / 154 / 155 / 156) plus this run's
     session-157 entry at the top.  No `register()` count
     change (476 / 455 unchanged from session 153 entry).

  Run-entry test gate: `tests/test-all.mjs` 5086 / 0 (was 5063
  at session-155 close + 23 from session 156's three coverage
  clusters); `tests/test-persist.mjs` 66 / 0; `tests/sanity.mjs`
  22 / 0.  Run-close test gate: identical (no source-side or
  test-side edits this run).  No new findings filed in
  `docs/REVIEW.md`; the Commands bucket has zero open findings
  at run-close.  Lock = `utils/@locks/session157-command-support.json`,
  scope `[www/src/rpl/ops.js, docs/COMMANDS.md, docs/REVIEW.md,
  logs/]`, released gracefully at end of run.

- **session 156** (2026-04-25) — `rpl5050-unit-tests` lane.
  Release wrap-up coverage pass.  Three substantive `session156:`
  pin clusters totaling +23 assertions: (a) `tests/test-
  reflection.mjs` +7 — OBJ→ session-155 follow-up boundary cells
  (empty Vector → `{0}` size-list, empty List / Program → Integer
  count, negative Real unchanged, Tagged-of-Tagged peels only the
  outer layer); (b) `tests/test-algebra.mjs` +10 — session-149
  MODULO cluster follow-up (DIV2MOD V-reject, DIVMOD per-arg type
  rejects, GCDMOD `(a, 0)` identity edge in both directions,
  EXPANDMOD on negative integer, FACTORMOD prime-modulus boundary
  m=2 / m=99, DIVMOD MODSTO consultation pair); (c) `tests/test-
  numerics.mjs` +6 — session-153 C-011 follow-up composition
  branches (Tagged(Rational) on level 2 / level 1, BinaryInteger
  COMB / PERM, Vector COMB, negative integer-valued
  `Rational(-5, 1)`).  One new finding filed: **R-012** (OBJ→ on
  Unit divergence — AUR §3-149 `x_unit → x  1_unit` row not yet
  wired; routed to `rpl5050-rpl-programming` as ship-stretch).
  No source-side edit; no `register()` change.
  `tests/test-all.mjs` 5063 → 5086 (+23).

- **session 155** (2026-04-25) — `rpl5050-rpl-programming` lane.
  **R-008 close** (HP50 AUR §3-149 fidelity audit of `OBJ→`'s
  Real / Integer and Tagged branches).  Two arms shipped: (a)
  Real / Integer branch reduced from a 12-line mantissa /
  exponent split to a 4-line push-unchanged body — the prior
  depth-2 shape was an HP50-divergence; users wanting the split
  reach for `MANT` / `XPON` (AUR p.3-6 / p.3-9), unchanged; (b)
  Tagged branch verified-and-guarded — AUR §3-149 shows
  `:tag:obj → obj "tag"` with the tag in **String** notation
  (not Name); existing `Str(v.tag)` was already AUR-correct, but
  a one-line comment was added at `ops.js:6649-6655` warning
  future readers off the `Str(v.tag) → Name(v.tag)` "fix".
  Header block at `:6605-6638` rewritten to enumerate the AUR
  Input/Output table verbatim, cite MANT / XPON as the
  mantissa-split owners, and link to →TAG (AUR p.3-247).
  `tests/test-reflection.mjs`: 2 prior asserts flipped (depth-2
  → depth-1) + 5 new `session155:` asserts pinning the new
  shapes + Tagged regression-guard.  No `register()` change.
  `tests/test-all.mjs` 5034 → 5063 (entry baseline already
  included sibling-lane growth from sessions 152 / 153 / 154
  plus this run's +5 net new pins; the run's net file delta is
  +5 in test-reflection.mjs).

- **session 154** (2026-04-25) — `rpl5050-data-type-support` lane.
  Doc-only `docs/DATA_TYPES.md` audit reconciling the coverage
  matrix against live op registrations in `www/src/rpl/ops.js`
  via three `utils/@…` probe scripts (special-fns V/M, TRUNC V/M,
  XROOT V/M).  20 cells downgraded from aspirational ✓ to blank
  (5 ops × 4 cells); the matrix now reflects what tests actually
  pin, no aspirational ✓.  No source-side edit; no test-side
  edit; no `register()` change.

- **session 152** (2026-04-25) — `rpl5050-code-review` lane
  (fourteenth review-lane run).  Doc-stamp hygiene only: re-aged
  baseline, four prior open findings re-verified and aged, one
  prior finding promoted to resolved (C-010 — closed by session
  149 alongside the MODULO cluster), two new findings filed
  (C-011 + D-001).  No source-side edit; no `register()` change.
  An interactive `session-file-explorer` lane shipped a partial
  D-001 fix during this run's window (uppercase `'X'` → lowercase
  `'x'` in `tests/test-persist.mjs:271-274`) re-greening the
  persist gate; D-001 stays open as **partial** because
  `persist.js:126` block comment was not part of the partial fix.

- **session 151** (2026-04-25) — `rpl5050-rpl-programming` lane.
  HALT / PROMPT lift coverage symmetric to session 141's IFERR
  pin set: pins for HALT / PROMPT inside CASE clauses, fully-
  closed START/NEXT and START/STEP, and DO/UNTIL.  +71 assertions
  in `tests/test-control-flow.mjs`.  Plus `session151b-sort-fix`
  side-quest (an interactive sort-fix run that addressed a
  test-control-flow ordering bug).  No source-side `register()`
  change; no row flips.

- **session 150** (2026-04-25) — `rpl5050-data-type-support` lane.
  Three hard-assertion widening clusters in `tests/test-types.mjs`:
  inverse-trig (ASIN/ACOS/ATAN) DEG-mode `_exactUnaryLift` Integer-
  stay-exact under Tagged-V/M wrapper composition; transcendental
  bare-scalar EXACT-mode contract closures; closes the
  transcendental wrapper-VM-under-Tagged matrix (forward-trig DEG,
  inverse-trig DEG, forward-hyp, LN/LOG/EXP/ALOG).  +26 assertions
  (test-types.mjs 803 → 829).  No source-side `register()` change.

- **session 153** (2026-04-25) — Release-mode wrap-up run.  No new
  ops; two substantive items shipped, both HP50-fidelity contract
  clarifications.

  1. **C-011 close** (`www/src/rpl/ops.js:1683`).  The
     `_combPermArgs` argument-type guard was rewritten from the
     broad `if (!isNumber(a) || !isNumber(b))` to the narrower
     `if (!isInteger(a) && !isReal(a)) … if (!isInteger(b) &&
     !isReal(b)) …` pair, mirroring `_intQuotientArg` (used by
     IQUOT / IREMAINDER / IDIV2 / DIVMOD / DIV2MOD).  The
     redundant explicit `isComplex(a) || isComplex(b)` rejection
     a line below was deleted (subsumed by the new guard).
     Reason: the prior guard allowed `Rational` operands through
     to a downstream `v.value.isFinite()` access in the `toBig`
     closure — Rational payload is `{n, d}` with no `.value`
     field, so the access leaked a JavaScript
     `TypeError: Cannot read properties of undefined (reading
     'isFinite')` instead of the RPL-style `Bad argument type`.
     Six failure modes (COMB / PERM × {Rat-on-2, Rat-on-1, both
     Rat}) plus two genuinely-fractional Rational cases
     (Rat 5/2, Rat 3/2) pinned with eight `session153:`
     `assertThrows(/Bad argument type/, …)` sites in
     `tests/test-numerics.mjs`.  Origin of the drift: the
     `isNumber` lattice expanded to include Rational in session
     092 (Fraction.js + `isRational` predicate); the
     `_combPermArgs` guard pre-dated that and was never
     tightened.  Same stranding pattern as X-008 (purge-removal
     stranded `freeVars`).  Behavior change is rejection-narrowing
     only — happy paths (Integer pairs, integer-valued Real
     pairs, Name/Symbolic lift, Complex rejection, `m > n`
     rejection) all re-verified at run-close.  `tests/test-all.mjs`
     5050 → 5058 (+8 session153 pins), all green.

  2. **INVMOD `TODO` retire** (`www/src/rpl/ops.js:1961-1963`).
     The session-144-vintage `TODO` paragraph ("add a single-arg
     form that consults `getCasModulo()` for parity with the rest
     of the MODULO menu") was rewritten as a deliberate-deviation
     note explaining why INVMOD remains 2-arg even though the rest
     of the MODULO menu (ADDTMOD / SUBTMOD / MULTMOD / POWMOD)
     consumes `state.casModulo`.  Paired entry "INVMOD arity"
     added to the Intentional Deviations table in
     `docs/@!MY_NOTES.md`.  Reason: the explicit-modulus 2-arg
     form lets programs compute inverses against ad-hoc moduli
     without round-tripping through MODSTO; converting to 1-arg
     would force every caller through state mutation.  This is
     pure documentation hygiene — no behavior change, no test
     change.  The TODO had sat dormant for nine sessions
     (144 → 152) without any lane choosing to ship the 1-arg
     form, so codifying the 2-arg form as deliberate is the
     ship-aligned choice.

  Doc-row Notes amendments: `COMB` `PERM` row (C-011 close
  pinned; Rational rejection contract documented) and `INVMOD`
  row (deliberate-deviation note + `TODO` retire reference).
  Counts heading bumped "as of session 149" → "as of session
  153"; the +5 register-site bump narrative is preserved as
  the prior baseline; this run is `register()` count 476
  unchanged + top-level 455 unchanged.  `persist.js` /
  `tests/test-persist.mjs` untouched (66 / 0 stable).

  User-reachable demo:  on the calculator: `5 ENTER 1 / 3 COMB`
  (or alpha-typed `'COMB'`) — soft-key path: `MTH` → `PROB`
  → press the `COMB` soft-key with a Rational on level 1.  The
  status line now reads `COMB Error: Bad argument type`; before
  this run it read the JavaScript stack trace
  `TypeError: Cannot read properties of undefined (reading
  'isFinite')` (which the formatter would surface as the bare
  string).

  Next-run queue (post-ship — defer until next version of
  rpl5050):
    • `JORDAN` / `SCHUR` matrix decomps — only ✗ row remaining
      (advanced linear algebra; needs a numerical-LAPACK
      vendoring decision).
    • Open Other-bucket findings inherited from the review-lane
      ledger: O-007 (giac-convert.mjs `buildGiacCmd` block-
      comment top/bottom contradiction — `[resolved - ship-prep
      2026-04-25]` per REVIEW.md so already closed), O-009
      (sandbox `.bak` cleanup — `[deferred - post-ship]`),
      O-011 (lock-body shape ambiguity).
    • Single-arg INVMOD form (would now be a behavior-changing
      addition — opt-in via `MODSTO` slot).  Explicitly
      deferred per the deliberate-deviation table entry.

- **session 149** (2026-04-25) — Five ops newly shipped (`EXPANDMOD`,
  `FACTORMOD`, `GCDMOD`, `DIVMOD`, `DIV2MOD`) — the remaining HP50
  CAS MODULO ARITH menu (`!Þ MODULO`) ops, completing the menu started
  in session 144.  All five consult the `state.casModulo` slot via
  `getCasModulo()` (read-only — only MODSTO writes), so `persist.js`
  and `tests/test-persist.mjs` are unaffected (40 / 0 stable).

  1. **`EXPANDMOD`** (HP50 AUR §3-80) — `( a → a' )` coefficient-reduce
     + expand mod the MODSTO modulus.  Pure-Integer / integer-Real
     path returns `_centerMod(v, m)` directly; the User Guide p.5-15
     worked examples (`EXPANDMOD(125) ≡ 5`, `EXPANDMOD(17) ≡ 5`,
     `EXPANDMOD(6) ≡ 6`, all mod 12) reproduce.  Symbolic / Name path
     routes through Giac as `expand(${e}) mod ${m}` and lifts back
     via `_astToRplValue`.  AUR worked example
     `EXPANDMOD((X+3)*(X+4))` (m=3) → `X^2+X` (mock fixture verified).
  2. **`FACTORMOD`** (HP50 AUR §3-83) — `( p → factored )` polynomial
     factorization in Z_m[X].  Modulus precondition enforced before
     the operand is consumed: `m < 100 && _isPrimeBig(m)` else
     `Bad argument value` (matches AUR rule "the modulus must be less
     than 100, and a prime number").  Pure-Integer path collapses to
     `_centerMod(v, m)` (every nonzero element of Z/pZ is a unit, so
     a bare integer round-trips as itself centered).  Symbolic path
     routes through Giac as `factor(${e}) mod ${m}`.  AUR worked
     example `FACTORMOD(X^2+2)` (m=3) → `(X+1)*(X-1)` (mock fixture
     verified).
  3. **`GCDMOD`** (HP50 AUR §3-96) — `( a b → gcd )` polynomial GCD
     over Z_m[X].  Pure-Integer-pair path uses `_extGcdBigInt` then
     `_centerMod`; rejects gcd(0,0) with `Bad argument value` (matches
     `EUCLID`'s contract).  Symbolic path emits
     `gcd(${e1},${e2}) mod ${m}` to Giac.  AUR worked example
     `GCDMOD(2X^2+5, 4X^2-5X)` (m=13) → `-(4X-5)` (mock fixture
     verified).
  4. **`DIVMOD`** (HP50 AUR §3-63) — `( a b → quotient )` modular
     division.  New helper `_modDivBigInt(ba, bb, m)` implements the
     two-path semantics surfaced by reading the User Guide p.5-14
     examples carefully: prefer **exact integer division** when `b`
     divides `a` (so `12 3` → `4` mod 12 even though gcd(3,12)=3,
     and `66 6` → `-1` mod 12 even though gcd(6,12)=6); fall back to
     **modular inverse** otherwise (so `64 13` → `4` since 13 ≡ 1
     mod 12 invertible); reject when neither path applies (`12 8`
     → `Bad argument value`, matching User Guide "12/8 (mod 12) does
     not exist" — 12 not divisible by 8 and gcd(8,12)≠1).  All five
     User Guide DIVMOD numeric examples reproduce.  Symbolic path
     emits `(${e1})/(${e2}) mod ${m}` to Giac (matches AUR worked
     example `DIVMOD(5*X^2+4*X+2, X^2+1)` mod 3 → fraction form).
  5. **`DIV2MOD`** (HP50 AUR §3-62) — `( a b → q r )` Euclidean
     division mod m, two-result.  Quotient on level 2, remainder on
     level 1 (matches AUR output spec).  Pure-Integer path reuses
     `_modDivBigInt` for q (same exact-then-inverse policy as
     DIVMOD) and `_centerMod(a - q·b, m)` for r — User Guide p.5-14
     examples reproduce: `125 17` (m=12) → `(1, 0)`; `68 7` (m=12)
     → `(-4, 0)`; `7 5` (m=12) → `(-1, 0)`; `2 3` (m=12) →
     `Bad argument value` (matching "2/3 (mod 12) does not exist").
     Symbolic path issues two Giac calls — `quo(${e1},${e2}) mod ${m}`
     and `rem(${e1},${e2}) mod ${m}` — simpler than parsing a list
     response from `divmod(a,b,m)`.  AUR worked example
     `DIV2MOD(X^3+4, X^2-1)` (m=3) → `(X, X+1)` (mock fixtures
     verified).

  All five share two new helpers in the new MODULO-extension block
  in `www/src/rpl/ops.js` (above the session-144 ADDTMOD block):
  `_modDivBigInt(ba, bb, m)` (the exact-then-inverse division
  helper) and a re-use of session-144's `_centerMod` / `_isIntLike`.
  +5 register sites; counts heading bumped 471 → 476 register-comments,
  450 → 455 top-level register calls.

  Tests:
    • `tests/test-algebra.mjs` +30 assertions in a new "session 149"
      block at the file end (EXPANDMOD on Integer / integer-Real / Symbolic
      via mock fixture / Vector-reject; FACTORMOD on Integer / Symbolic
      via mock fixture / composite-modulus reject / m≥100 reject;
      GCDMOD on Integer / 0,0 reject / Symbolic via mock fixture;
      DIVMOD on the five User Guide p.5-14 numeric cases (12/3, 25/5,
      66/6, 12/8 reject, 64/13) plus AUR symbolic via mock fixture
      plus Vector reject; DIV2MOD on the three User Guide DIV2MOD
      numeric cases (125/17, 68/7, 7/5) plus 2/3 reject plus AUR
      symbolic two-call mock fixtures; MODSTO + EXPANDMOD round-trip
      pinning the modulus consultation).  Test-all total: 4907 → 4937
      (+30).
    • `tests/test-persist.mjs` unchanged at 40 / 0 (the new ops only
      *read* `casModulo`; only MODSTO writes — and that's already
      pinned by the session-144 round-trip block).
    • `node tests/sanity.mjs` stable at 22 / 0.

  Closes `C-010` from `docs/REVIEW.md` (INVMOD block-comment drift):
  the two conditional-future phrasings at `www/src/rpl/ops.js:1942`
  ("until that slot lands so the op is usable without the CAS state
  substrate") and `:1953` ("When the MODULO state slot lands, add a
  single-arg form that consults it") rewritten in past tense pointing
  at the session-144 ship.  Pure-comment edits; behavior unchanged.

  User-reachable demo:
  ```
    13 ENTER          → Integer 13   (factory default modulus)
    ALPHA M O D S T O ENTER  → casModulo := 13n (hygiene reset)

    20 ENTER 8 ENTER ALPHA G C D M O D ENTER   → 4
    125 ENTER 17 ENTER ALPHA D I V 2 M O D ENTER  → q=1 (level 2), r=0 (level 1)
    66 ENTER 6 ENTER ALPHA D I V M O D ENTER  → -1  (centered, m=12 demo below)
    125 ENTER ALPHA E X P A N D M O D ENTER  → 8  (since m=13 still: 125 mod 13 = 8)

    7 ENTER ALPHA F A C T O R M O D ENTER  → 7  (Integer, prime modulus required)
    `X^2+2` ENTER ALPHA F A C T O R M O D ENTER  → `(X+1)*(X-1)` (m=13 → reduces, browser-side Giac required)
  ```
  (The Symbolic FACTORMOD example wants m=3 to land on the AUR
  textbook output `(X+1)*(X-1)`; rerun after `3 ENTER MODSTO`.  The
  modulus persists across reloads via `persist.js`.)

- **session 144** (2026-04-25) — Five ops newly shipped (`MODSTO`,
  `ADDTMOD`, `SUBTMOD`, `MULTMOD`, `POWMOD`) — the HP50 CAS MODULO
  ARITH menu (`!Þ MODULO`).  All five share a new `state.casModulo`
  BigInt slot (default `13n`, HP50 factory default per the CAS Modes
  input form) introduced this run; persisted across reload via
  `persist.js` with the same `{ __t: 'bigint', v: '<digits>' }`
  encoding `prngSeed` already uses.

  1. **`MODSTO`** (HP50 AUR §3-150) — `( m → )` set the modulus.
     Accepts Integer or integer-valued Real; setter normalizes
     (negatives → abs, 0 / 1 → 2 — matching HP50 firmware which
     never stores a modulus below 2).  Non-integer Real →
     `Bad argument value`; Vector / Symbolic / etc. →
     `Bad argument type`.
  2. **`ADDTMOD`** (HP50 AUR §3-9) — `( a b → (a+b) mod m )`.  Pure
     Integer / integer-Real on both levels: native BigInt with
     centered representative `[-(m-1)/2, m/2]` — matches the AUR
     worked example `(X^2+3X+6)+(9X+3) mod 7 = X^2 - 2X + 2`
     (the `12 → -2` fold).  Symbolic / Name path emits
     `((expr1+expr2)) mod m` to Giac.  No-fallback policy.
  3. **`SUBTMOD`** (HP50 AUR §3-243) — same shape as ADDTMOD with
     the `-` operator.  Centered: `0 3 SUBTMOD` (m=7) →
     `Integer(-3)`, but `1 5 SUBTMOD` (m=7) → `Integer(3)` (3 sits
     at the upper boundary of the centered range so it stays
     positive).
  4. **`MULTMOD`** (HP50 AUR §3-153) — same shape with `*`.
  5. **`POWMOD`** (HP50 AUR §3-175) — `( a n → a^n mod m )`.  Pure
     Integer fast path uses `_powModBig` (already vendored for
     PA2B2 / Miller-Rabin) and re-centers the result; Symbolic /
     Name path emits `powmod(base,exp,m)` to Giac.  Negative
     exponent → `Bad argument value`.

  All five share the helpers `_centerMod(a, m)` (centered-rep
  reduction) and `_isIntLike(v)` (Integer-or-integer-Real test)
  introduced at the top of the new MODULO block in
  `www/src/rpl/ops.js`; ADDTMOD / SUBTMOD / MULTMOD additionally
  share `_modBinary(s, intOp, giacOp)` since they differ only in
  the BigInt combiner and the Giac infix operator.  +5 register
  sites; counts heading bumped 466 → 471 register-comments,
  445 → 450 top-level register calls.

  Tests:
    • `tests/test-algebra.mjs` +29 assertions in a new "session 144"
      block at the file end (defaults + setter normalization;
      MODSTO accepting Integer / negative / 0 / integer-Real;
      MODSTO rejecting non-integer Real and Vector; ADDTMOD pure
      Integer + centered; the AUR worked example via mock fixture;
      SUBTMOD positive/negative wrap-around; MULTMOD pure +
      Symbolic via fixture; POWMOD pure + zero-exponent + negative
      reject + Symbolic via fixture; ADDTMOD rejects Vector + Complex;
      MODSTO + ADDTMOD round-trip).  1014 → 1014 + 29 = 1043 entries
      in `test-algebra.mjs` listing, but the framework counts the
      block as a contiguous run of `assert(...)` calls.  Test-all
      total: 4734 → 4763 (+29).
    • `tests/test-persist.mjs` +2 assertions: round-trip pinning
      `casModulo = 23n` and the legacy-snapshot reset-to-default
      path.  Test-persist 38 → 40.
    • `node tests/sanity.mjs` stable at 22 / 0.

  User-reachable demo:
  ```
    7 ENTER          → Integer 7
    ALPHA M O D S T O ENTER     → casModulo := 7n (no stack output)
    12 ENTER 0 ENTER ALPHA A D D T M O D ENTER  → -2
    `X^2+3*X+6` ENTER `9*X+3` ENTER ALPHA A D D T M O D ENTER  → `X^2 - 2*X + 2`
  ```
  (The Symbolic case requires the browser-side Giac wasm to be
  ready; from the keypad the modulus persists across reloads via
  `persist.js`.)

- **session 139** (2026-04-25) — Three ops newly shipped (`LIN`,
  `LIMIT`, `lim`) plus the four loop-row Notes-column amendments
  closing `C-009`.  Three Giac-backed CAS ops added between COSSIN
  and GREDUCE in the CAS section:
  1. **`LIN`** (HP50 AUR §3-131) — exponential linearization via
     Giac `lin(...)`.  Single-arg, mirrors PROPFRAC / PARTFRAC /
     COSSIN: Symbolic routes through `buildGiacCmd` + `lin(${e})`;
     Real / Integer / Rational / Name pass-through; everything else
     rejects `Bad argument type`.  No-fallback policy.
  2. **`LIMIT`** + **`lim`** (HP50 AUR §lim entry / §3-131) — limit
     of an expression at a point via Giac `limit(expr,var,val)`.
     Two-arg: level 2 = expression Symbolic, level 1 = either a
     `var=val` Symbolic equation (top-level `=` or `==` bin) OR a
     bare numeric point (Real / Integer / Rational — variable
     defaults to the current CAS variable `getCasVx()`, default
     `'X'`, per AUR p.3-131 "if the variable approaching a value is
     the current CAS variable, it is sufficient to give its value
     alone").  Numeric-leaf Giac result lifts to Real; non-numeric
     stays Symbolic.  `LIMIT` is the HP49G backward-compat name and
     `lim` is the HP50 lowercase canonical alias — `lim` registered
     as a thin `OPS.get('LIMIT').fn(s)` wrapper, mirroring CHARPOL
     (session 114) / XNUM, XQ (session 086).  No-fallback policy.
  3. **C-009 close** — four loop-row Notes columns at `:426`-`:428`
     (the `FOR / START / STEP / NEXT`, `WHILE / REPEAT / END`,
     `DO / UNTIL / END` rows) gained the session-136 auto-close
     annotation (verbatim mirror of the session-083 IF row style:
     "auto-closes on missing END / NEXT at program-body bound,
     mirroring IF (session 083) / CASE (session 074) / IFERR
     (session 077)…").  Counts heading bumped from "as of session
     134 — 2026-04-24" to "as of session 139 — 2026-04-25".  Session
     -log entries below for sessions 135 (data-types Q×V/M broadcast
     + Tagged-of-V/M binary composition + Tagged tag-identity &
     BinInt cross-base equality, +31 test-types.mjs, no register
     changes), 136 (rpl-programming WHILE/DO/START/FOR auto-close
     lift, +36 test-control-flow.mjs, no register changes), 137
     (unit-tests coverage adds across stats / comparisons /
     numerics / binary-int / units / helpers / stack-ops /
     arrow-aliases, +45 assertions, no register changes), 138
     (code-review eleventh run — REVIEW.md doc-only edits filing
     C-009 + R-005 and re-aging X-003 / O-007 / O-009; no register
     changes), 139 (this run).
  Test gates: `node --check www/src/rpl/ops.js tests/test-algebra.mjs`
  pass; `node tests/test-all.mjs` = **4635 passing / 0 failing**
  at run-end (was 4586 at session-138 baseline; +13 of the +49 are
  this run's LIN/LIMIT/lim assertions in `tests/test-algebra.mjs`,
  the remaining +36 came in via concurrent session 140 data-type-
  support's `tests/test-types.mjs` widening — locks confirmed
  session 140 active during this run with scope `tests/test-types.mjs`
  + `docs/DATA_TYPES.md`, no overlap with this run's scope);
  `node tests/test-persist.mjs` = **38 / 0** (stable);
  `node tests/sanity.mjs` = **22 / 0** (stable).
  `register()` total = **466** (was 463 at session 134 — +3 for the
  three new register sites).  Top-level `^register(` count = **445**
  (was 442 — same +3).  See `logs/session-139.md`.
  Closes `C-009` from `docs/REVIEW.md`.
- **session 138** (2026-04-25) — Code-review lane (eleventh run).
  Doc-only edits to `docs/REVIEW.md`: Last-updated stamp bumped to
  session 138; baseline block rewritten; one new finding (`C-009`
  — this file's loop-row Notes-column drift against the session-136
  auto-close lift on WHILE / DO / START / FOR) filed and routed to
  `rpl5050-command-support` (closed by session 139, this run); one
  new R-bucket finding (`R-005`) filed against `docs/RPL.md`
  multiple-"this run" labelling drift; one prior finding promoted to
  resolved (C-008 — closed by session 134).  Three long-aging
  open findings re-aged (X-003 10→11 runs, O-007 7→8 runs, O-009
  4→5 runs).  No source-side changes; no row flips here; no
  `register()` count change.  Lock scope = `docs/REVIEW.md` only
  (narrower than canonical review-lane scope to avoid `logs/`
  overlap with active session 137).
- **session 137** (2026-04-25) — Unit-tests lane.  Substantive
  coverage adds across `test-stats.mjs` / `test-comparisons.mjs` /
  `test-numerics.mjs` / `test-binary-int.mjs` / `test-units.mjs` /
  `test-helpers.mjs` / `test-stack-ops.mjs` / `test-arrow-aliases.mjs`
  plus `docs/TESTS.md` updates.  +45 session-137 assertions.  No
  new ops; no row flips; no `register()` count change.
- **session 136** (2026-04-25) — RPL-programming lane (sixth run).
  Auto-close on missing `END` / `NEXT` for the four condition-loop
  and counter-loop families (`WHILE/REPEAT`, `DO/UNTIL`, `START`,
  `FOR`) — completes the structural-auto-close program for loops,
  mirroring the existing IF (session 083) / IFERR (session 077) /
  CASE (session 074) auto-close policy.  `runWhile` / `runDo` /
  `runStart` / `runFor` (`www/src/rpl/ops.js`) each gain a fall-
  through `if (!endScan) { endIdx = bound; autoClosed = true; }`
  branch and a `return autoClosed ? bound : closerIdx + 1` exit;
  spurious closer-of-wrong-kind still rejects (the throws at
  `:3677` / `:3717` / `:3761` / `:3798` survive on the wrong-kind
  branch).  +36 session-136 assertions in `tests/test-control-flow.mjs`
  (563 → 599).  `docs/RPL.md` status table flipped on the four loop
  rows with the session-136 auto-close annotation.  No new register
  sites — auto-close lift was an in-place body widening of the four
  existing `runFor` / `runStart` / `runWhile` / `runDo` helpers.
  COMMANDS.md row-Notes back-fill is session 139's follow-up
  (captured above as the C-009 close).
- **session 135** (2026-04-24) — Data-type-support lane.  Three
  hard-assertion widening clusters in `tests/test-types.mjs`
  pinning previously-undertested broadcast and identity contracts
  on already-widened ops: Q × V/M arithmetic broadcast on `+ - * /`
  (8 pins — Q×R-element → Real degradation, Q×Q-element stays-
  exact via `_rationalBinary` with d=1 collapse, Q×Z-element on the
  Matrix axis, per-element Q+R degradation on V+V pairwise),
  Tagged-of-V/M binary composition via `_withTaggedBinary(_with
  ListBinary(handler))` (11 pins), Tagged tag-identity & BinInt
  cross-base equality (12 pins).  +31 assertions (672 → 703).  No
  source-side changes; no row flips; no `register()` count change.
  `docs/DATA_TYPES.md` Last-updated bumped to session 135 with six
  Notes columns updated and a "Resolved this session (135)" block
  added at the top of the Resolved sections.
- **session 134** (2026-04-24) — Doc-only run resolving the
  `C-008` remainder routed by session 133, plus a phantom-row
  cleanup pass on the "Not yet supported" table.  Two row/heading
  edits + three phantom retires + four session-log back-fills +
  this entry:
  1. `HALT CONT KILL` row Notes column at `:389` amended with the
     session-131 DOLIST/DOSUBS/STREAM body-intercept lift addendum
     (`runDoList` / `runDoSubs` / `runStream` generators at
     `ops.js:8142`, `:8224`, `:8304` plus body-intercept dispatch in
     `evalRange` at `:3196`, `:3202`, `:3208`).  The Residual
     paragraph was expanded from the four-label session-126 form
     (`'IFT action'` / `'IFTE action'` / `'SEQ expression'` /
     `'MAP program'`) to the now-complete seven-label form, adding
     `'DOLIST program'` / `'DOSUBS program'` / `'STREAM program'`
     for the sync-fallback Name-dispatch path.
  2. Counts heading bumped from "as of session 129 — 2026-04-24" to
     "as of session 134 — 2026-04-24"; `grep -c "register("` stamp
     refreshed from 458 → 463 with the session-131 attribution
     spelled out (the +5 is comment-only — the new `runDoList` /
     `runDoSubs` / `runStream` docstrings each carry a `register(
     'NAME', ...)` mention, plus the body-intercept block in
     `evalRange` references all three sync-fallback sites; the actual
     top-level `register()` call count `grep -cE '^register\('` is
     442, unchanged from session 129).  Session 131 rewrote the
     three handler bodies in place — no new register sites added.
  3. Session-log entries back-filled below for sessions 130
     (data-type-support, sixth run), 131 (rpl-programming, sixth
     run), 132 (unit-tests, seventh run), 133 (code-review, tenth
     run).  All four sibling-lane runs landed between session 129's
     close and session 134's acquisition.
  4. Three phantom rows retired from the "Not yet supported (in-lane
     candidates for future runs)" table: `GXROOT` (CAS row — zero
     hits across the AUR / User Guide / User Manual), `LQD` (Matrix
     decomps row — zero hits across all three PDFs; row collapses
     to `JORDAN` `SCHUR` only), `POLYEVAL` (modular row — zero hits
     across all three PDFs; the real HP50 polynomial evaluator is
     `PEVAL`, ✓ since pre-session-061; row collapses to `MULTMOD`
     only).  Same pattern as the session-124 retire of `ACKER` /
     `CTRB` / `OBSV`.  Verification: `for f in docs/HP50*.pdf; do
     pdftotext "$f" - | grep -c "GXROOT"; done` → `0 0 0`; same for
     `LQD` and `POLYEVAL`.  Not-yet-supported count drops 4 → 3.
  No source-side changes; no row flips; no ops registered or removed.
  Closes `C-008` from `docs/REVIEW.md`.  See `logs/session-134.md`.
- **session 133** (2026-04-24) — Code-review lane (tenth run).
  Doc-only edits to `docs/REVIEW.md`: Last-updated stamp bumped
  to session 133; baseline block rewritten; one new finding
  (`C-008` — this file's HALT row + Counts staleness against the
  session-131 DOLIST/DOSUBS/STREAM lift) filed and routed to
  `rpl5050-command-support`; two prior partials promoted to
  fully-resolved (`C-007` closed by session 129, `O-010` closed
  alongside `C-007`); one prior finding promoted to resolved
  (`T-002` — closed by session 132's TESTS.md rewrite); three
  long-aging open findings re-aged (X-003 9→10 runs, O-007
  6→7 runs, O-009 3→4 runs).  No source-side changes; no row
  flips here; no `register()` count change.  See
  `logs/session-133.md`.
- **session 132** (2026-04-24) — Unit-tests lane (seventh run).
  T-002 doc fix in `docs/TESTS.md` (the four "stale-pruned
  without writing logs/session-121.md" sites rewritten to
  acknowledge the session-128 audit found the log file does
  exist) + assertion coverage adds across `test-stats.mjs`,
  `test-comparisons.mjs`, `test-algebra.mjs`, `test-types.mjs`.
  No new ops; no row flips; no `register()` count change.
  Test count moved into the session-133 baseline (4474
  passing).  See `logs/session-132.md`.
- **session 131** (2026-04-25 UTC) — RPL-programming lane (fifth
  run, sixth structural HALT lift since the session-088
  generator pivot).  HALT/PROMPT lift through DOLIST + DOSUBS
  + STREAM per-iteration program bodies — the last three
  structural sync-path call sites that the session-126 SEQ/MAP
  run hadn't reached.  New `runDoList` / `runDoSubs` /
  `runStream` generator helpers at `ops.js:8142`, `:8224`,
  `:8304`; body-intercept dispatch in `evalRange` at `:3196`,
  `:3202`, `:3208`; sync-fallback handlers preserved with
  session-111 caller labels (`'DOLIST program'`, `'DOSUBS
  program'`, `'STREAM program'`).  DOSUBS NSUB/ENDSUB
  context-frame teardown happens inside the generator's
  `try/finally` so a HALT mid-iteration cleans up correctly on
  KILL.  +65 session-131 assertions in
  `tests/test-control-flow.mjs` (498 → 563).  Top-level
  `register()` call count unchanged (in-place body rewrites);
  comment-grep count moved by the new docstrings.  No new ops;
  no row flips here — the row-Notes back-fill is session 134's
  follow-up captured above.  See `logs/session-131.md`.
- **session 130** (2026-04-24) — Data-type-support lane (sixth
  run).  Three hard-assertion widening clusters in
  `tests/test-types.mjs` pinning previously-undertested wrapper-
  composition and cross-family contracts: Tagged-of-V/M
  composition through `_withTaggedUnary(_withListUnary(
  _withVMUnary(handler)))`, BinaryInteger × Rational cross-
  family on `==/≠/</>/≤/≥` and SAME's strict no-coerce
  contract, Tagged-of-List binary composition.  +35
  assertions (637 → 672 within `test-types.mjs`).  No source-
  side changes; no row flips; no `register()` count change.
  `docs/DATA_TYPES.md` Last-updated bumped to session 130.
  See `logs/session-130.md`.
- **session 129** (2026-04-24) — Doc-only run resolving the
  `C-007` remainder routed by session 128.  Four edits to this file:
  1. `PROMPT` row pulled out of the `DISP CLLCD FREEZE INPUT WAIT BEEP
     → ui lane` group at `:385`; replaced by a new control-flow row
     between `HALT CONT KILL` and `RUN` describing the session-121
     suspension protocol (yield via `evalRange:3129-3136`,
     `setPromptMessage` / `clearPromptMessage`, CONT/KILL semantics,
     `'PROMPT' EVAL` outside-program error mirroring HALT).
  2. `IFT IFTE` row Notes amended with the session-121 generator-
     flavor lift addendum (body-intercept path at `ops.js:3145-3158`,
     sync-fallback caveat preserved).
  3. `HALT CONT KILL` row Notes amended with both the session-121
     IFT/IFTE lift and the session-126 SEQ/MAP lift; the previous
     "only HALT inside a sync-path call (IFT / IFTE / MAP / SEQ
     body) still rejects" caveat is now obsolete and rewritten as
     "Residual: HALT reached through the **sync-fallback** Name-
     dispatch path for IFT / IFTE / SEQ / MAP still rejects" — which
     is the correct residual after sessions 121 and 126.
  4. Session-log backfill for sessions 120, 121, 122, 123, 125, 126,
     127, 128 below.
  Counts heading bumped to "as of session 129 — 2026-04-24";
  `register()` total stamp now reads **458** (was 455 at session
  124; +3 from sessions 121 / 126 — `PROMPT` registered session
  121 + the sync-fallback `register('SEQ', ...)` and
  `register('MAP', ...)` rewrites in session 126 added two more
  register sites for the session-111 caller-label pattern).  No
  rows flipped this session — purely descriptive doc work
  catching up to the actual on-disk capability state.  Test
  baseline preserved: `node tests/test-all.mjs` = **4374
  passing / 0 failing**, `test-persist.mjs` = **38 / 0**,
  `sanity.mjs` = **22 / 0**.  See `logs/session-129.md`.
  Closes `C-007` from `docs/REVIEW.md`.
- **session 128** (2026-04-25 UTC) — Code-review lane
  (ninth run).  No source changes; doc-only edit to
  `docs/REVIEW.md`.  Restatuses: O-010 partial (decomposed,
  three of four sub-items closed by sibling lanes),
  R-004 resolved-with-retraction (RPL.md does carry session-121
  PROMPT narrative on disk), C-007 partial (Counts heading +
  register count + brief session-121 mention closed by session
  124; PROMPT row + IFT/IFTE row + HALT row + missing
  session-log entries still open — routed back to this lane,
  closed by session 129).  New finding: T-002 (TESTS.md
  stale-prune drift).  No `register()` count change.  See
  `logs/session-128.md`.
- **session 127** (2026-04-25 UTC) — Unit-tests lane
  (sixth run).  +28 assertions: LNAME edge cluster, Q × C/R
  cross-type comparisons, Y-family stats rejection catchup.
  Test count 4346 → 4374.  No `register()` count change.
  Mid-session 4 transient failures in `test-control-flow.mjs`
  (session-126's pre-pinned HALT/PROMPT-lift assertions ahead
  of implementation) cleared by session 126's close.  See
  `logs/session-127.md`.
- **session 126** (2026-04-25 UTC) — RPL-programming lane
  (sixth run).  HALT/PROMPT lift through SEQ + MAP per-iteration
  bodies via new `runSeq` / `runMap` generator helpers
  (`ops.js:7568-7607`, `8053-8096`) plus `evalRange` body-
  intercept at `ops.js:3173-3184`.  Sync-fallback handlers
  preserved with session-111 caller labels (`'SEQ expression'`,
  `'MAP program'`) — `register('SEQ')` and `register('MAP')` got
  rewritten as `_driveGen` wrappers; net `register()` count
  delta is +0 (same registrations, new bodies).  +46 session-126
  assertions in `tests/test-control-flow.mjs`.  4232 → 4346
  passing.  No row flips here — the row-Notes back-fill is the
  session-129 follow-up captured above.  See `logs/session-126.md`.
- **session 125** (2026-04-24) — Data-type-support lane (sixth
  run).  +43 assertions in `tests/test-types.mjs`: List
  distribution on the arity-2 numeric family, Tagged-of-List
  composition on the rounding/sign/abs family, and Q→R
  degradation on MIN / MAX / MOD.  No new ops; no row flips
  here (DATA_TYPES.md owns type-coverage rows).  4257 → 4300
  passing.  No `register()` count change.  See
  `logs/session-125.md`.
- **session 123** (2026-04-24) — Code-review lane (eighth run).
  Doc-only; no source or test changes.  Filed three new
  findings (R-004, O-010, C-007) and aged the longest-aging
  open finding (X-003) to 8 runs.  Counts/register stamps in
  this file stayed at session-119 phrasing through this run
  (the gap that C-007 then catalogued and routed back here).
  No `register()` count change.  See `logs/session-123.md`.
- **session 122** (2026-04-24) — Unit-tests lane (fifth run).
  `assertThrows` migration in `tests/test-control-flow.mjs`
  (queue #2 from session 117).  +4 direct assertions plus the
  concurrent +46 PROMPT/KILL cluster from session 121's
  rpl-programming lock landing in the same file.  4182 → 4232
  passing.  No `register()` count change.  See
  `logs/session-122.md`.
- **session 121** (2026-04-24) — RPL-programming lane (fifth
  run).  `PROMPT` op shipped (HP50 AUR p.2-160) — the
  `register()` count it added is the +1 between session 119's
  448 and session 124's 455 attributed to "intervening lanes".
  Mechanism: `evalRange` body-intercept yields up to the
  EVAL/CONT driver via the same channel HALT uses; `state.
  promptMessage` is the prompt banner store.  Same session also
  lifted IFT / IFTE bodies onto the body-intercept path
  (`ops.js:3145-3158`) so HALT / PROMPT inside the action
  suspends cleanly.  PROMPT row is captured under the new
  control-flow entry above (added session 129); IFT / IFTE row
  Notes were amended session 129 (this back-fill).  +50
  assertions in `tests/test-control-flow.mjs` (session 121 and
  session 122 combined, since session 122 back-filled the
  assertThrows-migration coverage on the same file).  4114 →
  4182 passing on session 121's own close (before session 122
  adjusted the form).  See `logs/session-121.md`.
- **session 120** (2026-04-24) — Data-type-support lane (fifth
  run).  +68 assertions in `tests/test-types.mjs`: hyperbolic
  Tagged transparency, percent Tagged tag-drop / List
  broadcast, Rational unary stay-exact / APPROX collapse /
  out-of-domain rejection.  No new ops; DATA_TYPES.md owns
  type-coverage rows.  4114 → 4182 passing.  No `register()`
  count change.  See `logs/session-120.md`.
- **session 124** (2026-04-24) — `LNAME` + `GBASIS` ship as two new ops,
  plus a phantom-row retire.  `LNAME` (HP50 AUR §3-136) is a native AST
  walker — no Giac dependency — that visits `Var` and `Fn` nodes,
  treats user-defined function names (heads not in `KNOWN_FUNCTIONS`)
  as names alongside variables, dedups in first-seen order, then sorts
  length DESC then alpha ASC to match the AUR's worked example
  `LNAME('COS(B)/2*A + MYFUNC(PQ) + 1/T') → [MYFUNC PQ A B T]`.  Pushes
  the resulting Vector of Names without consuming the input.  Rejects
  non-Symbolic with `Bad argument type`.  `GBASIS` (HP50 AUR §3-92)
  wraps Giac `gbasis([polys],[vars])`: level 2 Vector of polynomials,
  level 1 Vector of bare Names.  Reuses session-119 plumbing
  (`_scalarToGiacStr`, `splitGiacList`, `_astToRplValue`, `giacToAst`)
  and the `giac.isReady()` no-fallback gate.  Empty polys or empty
  vars list → `Invalid dimension`; non-Vector args or non-Name in
  vars → `Bad argument type`; non-list Giac output (caseval error
  string) → `Bad argument value`.  Worked example: `[X^2+2*X*Y^2
  X*Y+2*Y^3-1] [X Y] GBASIS → [X 2*Y^3-1]` (matches AUR p.3-92 with
  the smaller basis first); the unit-ideal case `[X-1 X+1] [X]
  GBASIS → [1]` lifts to a one-element Vector of `Real(1)` because
  `_astToRplValue` lifts `Num(v)` to `Real`.  `register()` count
  448 → 450 (+2).  2 rows newly shipped (✗ → ✓): `LNAME` (new row in
  Polynomials / algebra), `GBASIS` (new row in CAS).  Phantom retire:
  the `ACKER CTRB OBSV` row dropped from "Not yet supported" — all
  three names return zero hits when run through `pdftotext` against
  the HP50 AUR, User Guide, and User Manual, so they were never HP50
  commands to begin with.  The `GXROOT` row's Notes column updated:
  GBASIS now ships, so GXROOT is the last CAS Grœbner-family gap.
  `register()` count 448 → 455 (+2 from this session, +5 from
  intervening lanes since session 119).  +23 assertions in
  `tests/test-algebra.mjs` (15 LNAME, 8 GBASIS).  4234 → 4257
  passing (sanity 22, persist 34 unchanged).  See `logs/session-124.md`.  User-reachable keypress demo: at the
  calculator web page (`http://localhost:8080`) type `'COS(B)/2*A +
  MYFUNC(PQ) + 1/T'` ENTER then `LNAME` ENTER → level 2 holds the
  original Symbolic, level 1 = `[MYFUNC PQ A B T]`; for GBASIS push
  `[X^2+2*X*Y^2 X*Y+2*Y^3-1]` ENTER `[X Y]` ENTER then `GBASIS`
  ENTER → `[X 2*Y^3-1]`.
- **session 119** (2026-04-24) — `EGV` + `RSD` + `GREDUCE` ship as
  three new ops in the Matrix and CAS sections, plus a small lift to
  the shared `_astToRplValue` helper that benefits every Giac-backed
  unwrap site.  `EGV` (HP50 AUR §3-73) is the natural follow-on to
  the session-114 `EGVL` ship: pop a square matrix, hand Giac `egv(M)`
  for the eigenvector matrix and `eigenvals(M)` for the value list,
  push matrix on level 2 and vector on level 1.  Reuses the
  session-114 helpers (`_matrixToGiacStr`, `_popSquareMatrix`,
  `_astToRplValue`) end-to-end; the eigenvalue order matches EGVL by
  construction because the same `eigenvals(M)` call is used for both
  ops.  `RSD` (HP50 AUR §3-213) is pure native linear algebra:
  three-arg `( B A Z → B − A·Z )` over Real / Integer entries,
  reusing `_asNumArray2D`, `_asNumArray1D`, `_matVecNum`, and
  `_matMulNum` from the LSQ infrastructure.  Both `vector / vector`
  and `matrix / matrix` shapes supported; mixed shapes (vector B
  with matrix Z, etc.) reject with `Bad argument type`; shape
  mismatches reject with `Invalid dimension`; Symbolic entries
  reject because the path is numeric-only (mirrors LSQ).  `GREDUCE`
  (HP50 AUR §3-99) wraps Giac `greduce(p, [basis], [vars])`:
  level 3 polynomial, level 2 Vector of basis polynomials, level 1
  Vector of bare Names; rejects empty basis / empty vars list with
  `Invalid dimension`, rejects Symbolic-in-vars with `Bad argument
  type`.  Result lifts back through the same `giacToAst` →
  `_astToRplValue` chain PCAR / EGVL use.  `_astToRplValue` extended
  to unwrap `Neg(Num(v))` directly to `Real(−v)` — surfaced by
  GREDUCE's AUR worked example returning `-1` (which previously
  came back as a single-leaf-Neg Symbolic instead of a numeric
  Real); the same lift now makes any negative numeric Giac scalar
  unwrap cleanly across EGVL / EGV / PCAR / FACTOR.  `register()`
  count 445 → 448 (+3).  3 rows flipped ✗ → ✓ (one new row each
  in Vectors / Matrices / Arrays for `EGV` and `RSD`; one in CAS
  for `GREDUCE`).  Not-yet-supported table reshape: `EGV` row
  removed; the four-decomp `JORDAN SCHUR LQD RSD` row collapses to
  `JORDAN SCHUR LQD` with a sibling-note about RSD; the CAS
  `GREDUCE GXROOT` row collapses to `GXROOT` only.  +25
  assertions in `tests/test-algebra.mjs` (8 EGV, 8 RSD, 9 GREDUCE).
  4089 → 4114 passing (sanity 22, persist 34 unchanged).  See
  `logs/session-119.md`.  User-reachable keypress demo: at the
  calculator web page (`http://localhost:8080`) push the matrix
  `[[2,0],[0,5]]` (use the matrix-editor or type
  `[[2,0],[0,5]]` ENTER), then type `EGV` ENTER → level 2 holds the
  eigenvector matrix and level 1 holds the eigenvalue vector
  `[2 5]`; for RSD push `[2 6]` ENTER `[[2,0],[0,3]]` ENTER
  `[1 2]` ENTER then `RSD` ENTER → `[0 0]`; for GREDUCE push
  `'X^2*Y - X*Y - 1'` ENTER `[X 2*Y^3-1]` ENTER `[X Y]` ENTER
  then `GREDUCE` ENTER → `-1`.
- **session 114** (2026-04-24) — `PCAR` + `CHARPOL` + `EGVL` + `PA2B2`
  ship (four new ops) plus the phantom `SRPLY` row retires and REVIEW.md
  X-009 + X-010 dead-import cleanups close.  `PCAR` (HP50 AUR §3-196)
  is the HP50 canonical name for the characteristic polynomial; the
  Giac-style alias `CHARPOL` is registered as a thin call-through to
  `OPS.get('PCAR').fn`.  Both pop a square matrix, pin the CAS main
  variable via `getCasVx()`, serialise the matrix with new helpers
  `_matrixToGiacStr` / `_scalarToGiacStr` / `_popSquareMatrix`
  (Integer / Real / Rational / Complex / Symbolic / Name supported —
  Matrix-of-Symbolic works too), hand Giac `charpoly(M,vx)`, and push
  the resulting Symbolic.  `EGVL` (HP50 AUR §3-90) is eigenvalues-only
  via Giac's `eigenvals(M)` (the list form — `egvl(M)` is the Jordan
  diagonal matrix form in Xcas and didn't match HP50 EGVL semantics);
  result is a Giac list that's split by `splitGiacList` and lifted
  back through `giacToAst` + `_astToRplValue` into a Vector of stack
  values (Real / Complex / Symbolic / Name depending on what Giac
  emits).  `PA2B2` (HP50 AUR
  §3-162) is Fermat sum-of-two-squares: the input must be `p = 2` or a
  prime with `p ≡ 1 (mod 4)`; implementation is native Cornacchia
  using the existing BigInt helpers (`_isPrimeBig`, `_powModBig`) plus
  a new `_bigIntSqrtFloor` (Newton iteration, pairs with the existing
  perfect-square-only `_bigIntIsqrt`).  Scans `z = 2, 3, …` for a QNR
  via Euler's criterion, sets `r = z^((p−1)/4) mod p` so `r² ≡ −1`,
  then runs the (a, b) ← (b, a mod b) reduction until `b ≤ √p`;
  output is `Complex(min(b,c), max(b,c))` where `c = √(p − b²)` so
  the real/imag ordering is deterministic.  Rejects non-primes and
  primes with `p ≡ 3 (mod 4)` with "Bad argument value"; non-integer
  inputs hit "Bad argument type" via `_toBigIntStrict`.  Also retires
  the phantom `SRPLY` row: `pdftotext` on all three HP50 PDFs
  (Advanced Guide, User Guide, User Manual) returns zero hits, so the
  entry was speculative — removed from "Not yet supported".  REVIEW.md
  X-009 (6 dead imports in `giac-convert.mjs`: `Num` / `Var` / `Neg` /
  `Bin` / `Fn` / `formatAlgebra` all comment-only after the session 95
  Giac-based conversion landed) and X-010 (`RPLHalt` unused import in
  `ops.js` line 44 — only the class name was ever imported, never
  referenced) both close.  `register()` count 441 → 445 (+4).  4 rows
  flipped ✗ → ✓ in Vectors / Matrices / Arrays + Polynomials / algebra;
  the Not-yet-supported `CHARPOL EGVL EGV` row is rewritten to just
  `EGV` (the eigenvector variant still needs Giac's `egv(M)` list-of-
  vector-bundles decoded).  User-reachable keypress demos: (1) on the
  calculator web page at `http://localhost:8080`, stack `[[2,1],[1,2]]`
  ENTER, then type `PCAR` ENTER → Symbolic polynomial in VX appears on
  stack level 1, e.g. `'X^2-4*X+3'`; (2) `EGVL` on the same matrix
  returns `[1 3]` as a Vector; (3) `5 PA2B2` → `(1,2)` native complex
  — these exercise the keypad→command-line→eval loop through the
  ops.js boundary.  See `logs/session-114.md` for the full run.
- **session 109** (2026-04-24) — `Ei` + `Si` + `Ci` ship as three
  native special-function ops in the CAS-special section, plus
  REVIEW.md C-006 doc-drift close.  `Ei` (HP50 AUR §2-CAS-SPECIAL)
  covers positive x via power series for x < 40 and (e^x/x)·Σ k!/x^k
  asymptotic truncated at the smallest term for x ≥ 40; negative x
  via the E1 relation (series for |x| < 1, modified-Lentz CF for
  |x| ≥ 1).  x = 0 → `Infinite result`.  `Si` is entire and odd:
  odd power series for |x| ≤ 4, complex-Lentz CF for E1(i·|x|) on
  |x| > 4 yields `Si(|x|) = π/2 + Im(E1(i·|x|))`.  `Si(0) = 0` exact.
  `Ci` real-mode: γ + ln x + Σ (-1)^k x^{2k}/((2k)(2k)!) for x ≤ 4;
  `Ci(x) = -Re(E1(i·x))` via the same complex-Lentz CF for x > 4.
  x = 0 → `Infinite result`; x < 0 → `Bad argument value` (complex
  result deferred from real mode).  All three: Tagged + List + V/M +
  Sym lift; Ast round-trip via `EI` / `SI` / `CI` entries in
  `KNOWN_FUNCTIONS`.  Reference values verified at machine precision
  against A&S Tables 5.1 / 5.3 — see `utils/@ei_si_ci_probe.mjs`.
  3 rows flipped ✗ → ✓.  +27 assertions in `tests/test-numerics.mjs`
  (Ei 9, Si 8, Ci 10).  Also closed REVIEW.md C-006: `HALT` Notes
  column now records the session-106 named-sub-program lift via
  `_evalValueGen`, and the `SST` / `SST↓` / `DBUG` row flips ✗ → ✓
  with session-101 ship + session-106 step-into refinement captured
  in the Notes column (session-101's own ledger edit had drifted —
  one row doc-drift corrected in parallel with the three Notes-column
  edits C-006 called out).  `register()` count 438 → 441 (+3 new
  registrations).  3930 → 3957 passing (sanity 22, persist 34).
  See `logs/session-109.md`.
- **session 104** (2026-04-24) — `PROPFRAC` + `PARTFRAC` + `COSSIN`
  ship as three Giac-backed ops in the CAS section + X-007/X-008
  cleanup.  `PROPFRAC` (HP50 AUR §3-197) routes Symbolic through
  `propfrac(...)` and lifts Rational via `_toAst` so a numeric
  `43/12 PROPFRAC → '3 + 7/12'` works the same as `'(X^2+1)/(X+1)'
  PROPFRAC → 'X - 1 + 2/(X + 1)'`; Real/Integer/Name pass-through.
  `PARTFRAC` (HP50 AUR §3-180) routes Symbolic through
  `partfrac(...)`; Real/Integer/Rational/Name pass-through.
  `COSSIN` (HP50 AUR §3-64) rewrites TAN as SIN/COS via Giac
  `tan2sincos(...)`; Real/Integer/Rational/Name pass-through.  All
  three obey the no-fallback policy: if Giac isn't ready or caseval
  errors, the op errors.  3 rows flipped ✗ → ✓.  +21 assertions in
  `tests/test-algebra.mjs`.  Also closed REVIEW.md X-007 (deleted
  dead `compareRoundTrip` export from
  `www/src/rpl/cas/giac-convert.mjs`) and X-008 (dropped unused
  `freeVars` import from the same file).  `register()` count
  432 → 438 (+6 loose; +3 new registrations + 3 comment-level
  mentions from sessions 100/101).  3660 → 3681 passing
  (sanity 22, persist 34).  See `logs/session-104.md`.
- **session 099** (2026-04-24) — `TVARS` ships + X-001..X-005 + O-004
  remainder.  `TVARS` reflection op: with Integer/integer-Real code arg
  returns names of that HP50 type in CWD; with List-of-codes unions
  matches across codes; negative codes complement.  Rejects non-integer
  Real, Name, String, and non-integer list element with `Bad argument
  type`.  X-005 sweep deleted 21 shadowed first-pass registrations
  (`+ − * / ^` + 16 trig/inverse-trig/log/exp shadows) that `Map.set`
  semantics had been silently overwriting; also uprooted `trigFwd` /
  `trigInv` helpers left stranded, and refactored `_stoArith`,
  `_incrDecrOp`, `_foldListOp` to defer `lookup(opSymbol)` into the
  returned closure (factory-time lookup was order-dependent on the
  now-deleted shadows).  X-001..X-002: 5 unused state.js imports +
  3 dead private helpers removed.  O-004 remainder:
  `docs/@!MY_NOTES.md:55` `COMMANDS_INVENTORY.md` → `COMMANDS.md`.
  1 row flipped ✗ → ✓ (`TVARS`).  +18 assertions in
  `tests/test-reflection.mjs`.  `register()` count 447 → 432.
  3532 → 3550 passing (sanity 22, persist 34).  See `logs/session-099.md`.
- **session 087** (2026-04-23) — data-type widening (not a
  command-support lane session, but logged here because three
  COMMANDS.md rows moved): FLOOR/CEIL/IP/FP accept BinaryInteger
  (no-op; FP of BinInt = `#0` in same base); `<` `>` `≤` `≥` accept
  String × String (char-code lex; HP50 User Guide App. J); `==` /
  `SAME` widen to Program (structural) and Directory (reference
  identity).  See `logs/session-087.md`.
- **session 088** (2026-04-23) — rpl-programming: generator-based
  `evalRange` lifts the structural HALT pilot-limit — HALT now works
  from inside `FOR`, `IF`, `WHILE`, `DO`, `IFERR`, and `→` bodies.
  `SIZE` widened to Program (count of top-level tokens).  No new
  registrations; two COMMANDS.md rows annotated.  See
  `logs/session-088.md`.
- **session 092** (2026-04-24) — CAS migration phase 1 + numeric-type
  upgrade.  `FACTOR` routed through Giac (`caseval('factor(...)')`);
  Integer path stays native trial-division to preserve HP50 semantics.
  `Rational` type added (Fraction.js), `Real` arithmetic lifted onto
  decimal.js at precision 15 (stack payload migration finalized in
  093), `Complex` routed through complex.js.  No-fallback policy
  codified.  See `logs/session-092.md`, `logs/session-093.md`.
- **session 094** (2026-04-24) — `FACTOR` / Giac boundary: purge free
  vars before caseval so user variables don't leak into CAS scope.
  See `logs/session-094.md`.
- **session 095** (2026-04-24) — Giac migration finish: pilot four
  (`EXPAND`, `DERIV`, `INTEG`, `SOLVE`) + `COLLECT` / `SUBST` /
  `DISTRIB` / `TEXPAND` / `TLIN` / `LNCOLLECT` / `EXPLN` / `TSIMP` /
  `TCOLLECT` / `LAPLACE` / `ILAP` / `PREVAL` routed through
  `caseval`; native Pythagorean walker deleted.  HP50 name validator
  added at the CAS boundary.  Row notes updated in the CAS section.
  See `logs/session-095.md`.
- **session 096–098** (2026-04-24) — CAS boundary hardening (not a
  command-support lane session, logged for ops visibility):
  algebra auto-close + name-validator guard (096), iterative
  `stripGiacQuotes` + diagnostic wrap (097), purge-preamble removal
  + Giac runtime-error detector (098).  No new ops; no row flips.
  See `logs/session-096.md`, `-097.md`, `-098.md`.
- **session 086** (2026-04-23) — `ZETA`, `LAMBERT`, `XNUM`, `XQ`.
  `ZETA`: Riemann ζ(s) — Euler-Maclaurin (N=15, M=6 Bernoulli terms)
  for s ≥ 0.5; functional-equation reflection `ζ(s)=2ˢπ^(s-1)sin(πs/2)Γ(1-s)ζ(1-s)`
  below; trivial zeros at negative even integers returned as exact 0;
  `s=1` → `Infinite result`; `s=0` → -1/2.  Verified ζ(2)=π²/6,
  ζ(4)=π⁴/90, ζ(-1)=-1/12, ζ(0.5)=-1.460354…, all to ≤ 1e-12.
  `LAMBERT`: principal branch W₀ via Halley iteration seeded with the
  Corless-et-al. Puiseux expansion `W = -1 + p − p²/3 + 11p³/72 − …`
  (p = √(2(ex+1))) for ep1 < 0.25, fixing Halley's linear-convergence
  stall at the branch point.  `LAMBERT(-1/e) = -1` exactly in double
  precision; `LAMBERT(1) = Ω`; inverse property `W·e^W = x` verified
  across x ∈ {5, 10, 100, -0.1, -0.3, 0.5, -0.35}.  `x < -1/e` →
  `Bad argument value`.  `XNUM` / `XQ`: ASCII aliases delegating to
  `→NUM` / `→Q` via `OPS.get(...).fn`.  All four ops get Tagged + List
  + V/M + Sym lift via the standard `_withTaggedUnary` / `_withListUnary`
  wrappers.  Four rows flipped ✗ → ✓.  +25 assertions in
  `tests/test-numerics.mjs`.  3911 passing.  See `logs/session-086.md`.
- **session 081** (2026-04-23) — `TRUNC` two-arg + `PSI` (digamma +
  polygamma) + `CYCLOTOMIC`.  `TRUNC` shares the toward-zero kernel
  with the existing one-arg `TRNC` and lifts to Symbolic when `x` or
  `n` is a Name / Symbolic.  `PSI` dispatches on arity: one-arg is
  digamma, two-arg `(x n)` with integer `n ≥ 0` is the n-th polygamma;
  numerical core is reflection-for-`x<0.5` + integer-shift recurrence
  up to `y ≥ 8..10` + Bernoulli asymptotic truncated at `2k = 12`;
  Tagged / List / V/M / Sym lift.  `CYCLOTOMIC` builds Φ_n(X) via
  iterative exact BigInt long-division `Φ_n = (Xⁿ − 1) / ∏ Φ_d`
  (d proper divisor of n), capped at n ≤ 200 so the descending
  coefficient array never overruns `Number.MAX_SAFE_INTEGER`
  (verified against the famous Φ_105 with its −2 coefficient).
  Three rows flipped ✗ → ✓.  +41 assertions
  (`test-numerics.mjs`: 8 TRUNC, 20 PSI, 13 CYCLOTOMIC).  Also
  resolved REVIEW.md C-001 (split stale `MEM TVARS` row — `MEM`
  already ✓) and C-002 (deleted ghost `RCWS` row).
  3745 → 3786.  See `logs/session-081.md`.
- **session 076** (2026-04-23) — CAS VX slot + EXLR + modular arithmetic.
  Shipped `VX` / `SVX` (CAS main variable — default `x` (lowercase, deviation from HP50), persists across
  reload via new `casVx` snapshot field; LAPLACE/ILAP/PREVAL now honor
  it), `EXLR` (split a top-level binary AST into two Symbolics), and
  `EUCLID` / `INVMOD` (extended-Euclid returning `{u v g}` + two-arg
  modular inverse with reduction into `[0, n)`).  Five rows flipped ✗ →
  ✓; PREVAL multi-var path rewritten to substitute VX instead of
  rejecting (session058 test updated).  +51 assertions (test-algebra
  VX/SVX + EXLR, test-numerics EUCLID/INVMOD, test-persist VX
  round-trip).  3630 → 3681.  See `logs/session-076.md`.
- **session 069** (2026-04-23) — Beta-family + STAT-DIST completion.
  Added `_regBetaI(a, b, x)` (NR §6.4 Lentz CF) as the shared helper.
  Shipped `UTPF`, `UTPT` (both via `_regBetaI` in the I-of-w(·,·)
  closed form), `Beta` (Lanczos log-gamma), and `erf` / `erfc` (via
  the existing `_regGammaQ` + new `_regGammaP`).  Five rows flipped
  ✗ → ✓; STAT-DIST cluster complete.  +44 assertions in
  `tests/test-numerics.mjs`.  See `logs/session-072.md`.
- **session 068** (2026-04-23) — bootstrap + new ops.  Bootstrapped
  this file (see gaps flagged in logs/session-064.md, 065.md, 066.md,
  067.md — previously absent).  Shipped `IQUOT`, `IREMAINDER`,
  `GAMMA`, `LNGAMMA`, `UTPC` (five rows flipped ✗ → ✓).
