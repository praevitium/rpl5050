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

## Counts (as of session 139 — 2026-04-25)

- Fully shipped (✓): 437 (this lane's net since session 134 — session
  139 ships three new ops via Giac: `LIN`, `LIMIT`, `lim` — the last
  registered as a thin alias delegating to `LIMIT`'s fn, mirroring
  CHARPOL / XNUM / XQ pattern; row count is 2 because LIMIT and lim
  share a row.  +3 ✗→✓ transitions and one ✗-side reshape on the
  "Not yet supported" table)
- Partially shipped (~): 0
- Not yet implemented (✗): 1 (down from 3 — `LIMIT` was not actually
  on the not-yet-supported table because it had been a long-horizon
  CAS wishlist item rather than an explicit row, but `JORDAN` /
  `SCHUR` and `MULTMOD` rows remain.  Session 139 doesn't change
  those rows.)
- Will-not-support (by design): 9 menu groups

The registry lives at `www/src/rpl/ops.js` and is enumerated by `allOps()`.
`grep -c "register(" www/src/rpl/ops.js` = **466** at the end of session
139 (was 463 at the end of session 134, was 458 at the end of session
129, was 455 at the end of session 124, was 448 at the end of session
119).  Session 139 added three top-level register sites: `register('LIN',
…)`, `register('LIMIT', …)`, and `register('lim', …)` (the lim alias
counts as a real register call — it lives at the top level even though
its body delegates to `OPS.get('LIMIT').fn(s)`).  The actual top-level
`register()` *call* count (`grep -cE '^register\(' www/src/rpl/ops.js`)
is **445** (was 442 from session 129 onward through session 134).
Session-139 row transitions:
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
| `COMB` `PERM` | ✓ | Session 065.  Integer-only (non-integer Real rejected). |
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
| `OBJ→` `→STR` `STR→` | ✓ | Session 067 OBJ→ on Program + →PRG composer. |
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
| `INVMOD` | ✓ | **Session 076** — `( a n → a⁻¹ mod n )` two-arg modular inverse.  Reduces `a` into `[0, n)`.  Rejects `n < 2`, `a ≡ 0 (mod n)`, `gcd(a,n) ≠ 1` ("Bad argument value").  One-arg MODULO-state form deferred until MODULO lands. |
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
| `VX` `SVX` | ✓ | **Session 076** — CAS main variable slot.  `VX` pushes the current name (default `X`); `SVX` sets it from a Name or String, rejects Real ("Bad argument type") and empty string ("Bad argument value").  Persists across reload (snapshot field `casVx`).  LAPLACE/ILAP/PREVAL now honor VX for variable selection. |
| `EXLR` | ✓ | **Session 076** — extract left/right of an equation-style Symbolic.  `( 'L==R' → 'L' 'R' )`; works on any top-level binary (`==`, `+`, `-`, `<`, `≤`, …).  Rejects bare variable / function application ("Bad argument value"), non-Symbolic ("Bad argument type"). |
| `PROPFRAC` | ✓ | **Session 104 [Giac]** — proper-fraction form via `propfrac(...)`.  Symbolic routed through Giac; Rational lifts to Symbolic via `_toAst` so `43 12 / PROPFRAC → '3 + 7/12'` (HP50 AUR §3-197).  Real/Integer/Name pass-through.  No-fallback policy. |
| `PARTFRAC` | ✓ | **Session 104 [Giac]** — partial-fraction decomposition via `partfrac(...)`.  Symbolic routed through Giac; Real/Integer/Rational/Name pass-through (no non-trivial decomp on a bare number). HP50 AUR §3-180.  No-fallback policy. |
| `COSSIN` | ✓ | **Session 104 [Giac]** — rewrite in SIN/COS basis via Giac `tan2sincos(...)` (TAN(x) → SIN(x)/COS(x)).  Symbolic routed through Giac; Real/Integer/Rational/Name pass-through.  HP50 AUR §3-64.  No-fallback policy. |
| `LIN` | ✓ | **Session 139 [Giac]** — exponential linearization via Giac `lin(...)`.  HP50 AUR §3-131.  Single-arg; Symbolic routes through `buildGiacCmd` + `lin(${e})` (e.g. `e^X·e^Y` → `e^(X+Y)`); Real/Integer/Rational/Name pass-through (no non-trivial linearization on a bare scalar).  Vector / Matrix / List / Tagged / etc. reject `Bad argument type`.  No-fallback policy. |
| `LIMIT` `lim` | ✓ | **Session 139 [Giac]** — limit at a point via Giac `limit(expr,var,val)`.  HP50 AUR §lim entry / §3-131.  `( expr 'var=val' → limit )` (explicit equation form, top-level `=` or `==` Symbolic) or `( expr val → limit )` (bare Real/Integer/Rational point — variable defaults to `getCasVx()`, default `X`, per AUR p.3-131 "if the variable approaching a value is the current CAS variable, it is sufficient to give its value alone").  Numeric-leaf Giac result lifts to Real; non-numeric stays Symbolic.  Non-Symbolic / non-Name expression → `Bad argument type`; equation lhs not a `Var` → `Bad argument value`; non-Symbolic / non-numeric / non-Name point → `Bad argument type`.  `LIMIT` is the HP49G backward-compat name; `lim` is the HP50 lowercase canonical alias (thin `OPS.get('LIMIT').fn(s)` wrapper, mirrors CHARPOL / XNUM / XQ alias pattern).  No-fallback policy. |
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
| `MULTMOD` | modular | low | Modular poly multiplication — `EUCLID` / `INVMOD` shipped session 076; this is the last gap (needs MODULO state).  (`POLYEVAL` retired session 134 as a phantom — see session-134 log; the real HP50 polynomial evaluator is `PEVAL`, already ✓ since pre-session-061.) |

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
  Shipped `VX` / `SVX` (CAS main variable — default `X`, persists across
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
