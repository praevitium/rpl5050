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
| `✓` | Fully shipped — registered in `src/rpl/ops.js`, reachable from the keypad, ≥1 positive + ≥1 rejection test covered. |
| `~` | Partially shipped — e.g. the op exists but rejects a whole argument class HP50 accepts, or an alias is missing, or there's no rejection-path coverage yet. |
| `✗` | Not yet implemented. |
| `will-not` | Explicitly out of scope per `docs/@!MY_NOTES.md` (USER, ENTRY, S.SLV, NUM.SLV, FINANCE, TIME, DEF, LIB, OFF) or replaced by a deliberate design deviation. |

Where relevant the **Notes** column records the last session number that
touched the row, and any known caveats worth carrying forward.

## Counts (as of session 076 — 2026-04-23)

- Fully shipped (✓): 409
- Partially shipped (~): 0
- Not yet implemented (✗): 32 (see "Not yet supported" below)
- Will-not-support (by design): 9 menu groups

The registry lives at `src/rpl/ops.js` and is enumerated by `allOps()`.
`grep -c "register(" src/rpl/ops.js` = **437** at the end of session 076
(was 429 at the end of session 069); the Fully-shipped count above
reflects new HP50 ops shipped this run (`VX`, `SVX`, `EXLR`, `EUCLID`,
`INVMOD` — 5 rows flipped ✗ → ✓).

---

## Arithmetic & scalar math

| Command | Status | Notes |
|---------|--------|-------|
| `+` `-` `*` `/` `^` | ✓ | Full R/Z/C/BIN/Vec/Mat/Unit/Sym dispatch (many sessions). |
| `NEG` `ABS` `INV` `SQ` `SQRT` | ✓ | Session 064 Tagged transparency; INV/M is matrix inverse, SQ/M is matmul. |
| `SIGN` | ✓ | Session 062 widening (Sy/L/T). |
| `ARG` `CONJ` `RE` `IM` | ✓ | |
| `MAXR` `MINR` | ✓ | Machine Max/Min Real. |
| `RND` `TRNC` | ✓ | |
| `MANT` `XPON` | ✓ | |
| `FLOOR` `CEIL` `IP` `FP` | ✓ | Session 062 — Tagged + List + V/M + Sym lift.  Session 072 — Unit (`1.5_m FLOOR` → `1_m`, uexpr preserved). |
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
| `XROOT` | ✓ | Sy lift. |
| `EXP` `EXPM` `LN` `LNP1` `LOG` `ALOG` | ✓ | |
| `SIN` `COS` `TAN` `ASIN` `ACOS` `ATAN` | ✓ | Angle-mode aware. |
| `SINH` `COSH` `TANH` `ASINH` `ACOSH` `ATANH` | ✓ | |

## Comparisons / boolean

| Command | Status | Notes |
|---------|--------|-------|
| `==` `=` `<>` `≠` `<` `>` `<=` `>=` `≤` `≥` | ✓ | Session 072 — `==` widened to structural compare on List / Vector / Matrix / Symbolic / Tagged / Unit (was: returned 0 for all such pairs). Session 074 — BinaryInteger widening: `==` / `≠` / `<>` cross-base and cross-family (BinInt × Integer/Real/Complex) through `_binIntCrossNormalize`; `<` / `>` / `≤` / `≥` widened in `comparePair` by promoting BinInt to Integer(value & wordsize-mask). |
| `AND` `OR` `XOR` `NOT` | ✓ | Real/Int/Binary. |
| `SAME` | ✓ | Strict structural equality.  Session 072 same widening as `==`; never lifts to Symbolic. Session 074 — accepts BinInt × BinInt value compare (cross-base) via the eqValues BinInt branch, but deliberately does NOT cross-family widen (so `SAME #10h Integer(16)` = 0). |
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

## Lists

| Command | Status | Notes |
|---------|--------|-------|
| `→LIST` `LIST→` `→LIST` (arrow) | ✓ | |
| `SIZE` `HEAD` `TAIL` `APPEND` | ✓ | |
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

## CAS (symbolic)

| Command | Status | Notes |
|---------|--------|-------|
| `EVAL` `APPROX` `EXPAND` `FACTOR` | ✓ | |
| `COLLECT` `DISTRIB` `TEXPAND` `TLIN` | ✓ | |
| `LNCOLLECT` `EXPLN` `TSIMP` `TCOLLECT` | ✓ | |
| `DERIV` `INTEG` `SUM` `SOLVE` | ✓ | |
| `SUBST` `LAPLACE` `ILAP` `HEAVISIDE` `DIRAC` | ✓ | |
| `HALFTAN` `ASIN2C` `ASIN2T` `ACOS2S` | ✓ | |
| `ATAN2S` `TAN2SC` `TAN2SC2` `TAN2CS2` | ✓ | |
| `COLLECT` `EPSX0` | ✓ | |
| `VX` `SVX` | ✓ | **Session 076** — CAS main variable slot.  `VX` pushes the current name (default `X`); `SVX` sets it from a Name or String, rejects Real ("Bad argument type") and empty string ("Bad argument value").  Persists across reload (snapshot field `casVx`).  LAPLACE/ILAP/PREVAL now honor VX for variable selection. |
| `EXLR` | ✓ | **Session 076** — extract left/right of an equation-style Symbolic.  `( 'L==R' → 'L' 'R' )`; works on any top-level binary (`==`, `+`, `-`, `<`, `≤`, …).  Rejects bare variable / function application ("Bad argument value"), non-Symbolic ("Bad argument type"). |

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
| `IF` `THEN` `ELSE` `END` | ✓ | |
| `CASE` `THEN` `END` | ✓ | Session 067. |
| `FOR` `START` `STEP` `NEXT` | ✓ | |
| `WHILE` `REPEAT` `END` | ✓ | |
| `DO` `UNTIL` `END` | ✓ | |
| `IFT` `IFTE` | ✓ | Stack conditionals. |
| `IFERR` `THEN` `ELSE` `END` | ✓ | |
| `ERRM` `ERRN` `ERR0` `DOERR` | ✓ | |
| `EVAL` | ✓ | |
| `→PRG` `OBJ→` (on Program) | ✓ | Session 067. |
| `ABORT` | ✓ | Session 067. |
| `DECOMP` | ✓ | |
| `HALT` `CONT` `KILL` | ✓ | Session 074 pilot — top-level program bodies only; HALT inside control flow or `→` raises a pilot-limit error. |
| `SST` `DBUG` `RUN` | ✗ | Blocked on RunState refactor — rpl5050-rpl lane. |

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
- `DISP` `CLLCD` `FREEZE` `INPUT` `PROMPT` `WAIT` `BEEP` → ui lane
- `MENU` `TMENU` `RCLMENU` → ui lane
- `PVIEW` `PXC` `CPX` `GOR` `GXOR` → ui lane

## Not yet supported (in-lane candidates for future runs)

These are HP50 AUR commands, in-lane for this file, with no registration
in `src/rpl/ops.js`.  Listed with the cluster they belong to so they
can be picked up as a group.

| Command | Cluster | Priority | Notes |
|---------|---------|----------|-------|
| `PSI` | CAS-special | high | Digamma.  Asymptotic + recurrence. |
| `Psi` (polygamma) | CAS-special | medium | `PSI(x, n)` — nth polygamma. |
| `ZETA` | CAS-special | low | Riemann zeta — only integer args practical. |
| `LAMBERT` | CAS-special | low | W-function — iterative. |
| `Ei` `Si` `Ci` | CAS-special | low | Exponential / sine / cosine integrals. |
| `GREDUCE` `GXROOT` | CAS | low | Groebner reduction — deferred behind SOLVE. |
| `CHARPOL` `EGVL` `EGV` | Matrix | medium | Characteristic poly + eigenvalues. |
| `JORDAN` `SCHUR` `LQD` `RSD` | Matrix | low | Advanced decomps. |
| `ACKER` `CTRB` `OBSV` | Matrix | low | Control-theory. |
| `SRPLY` | list | low | Slightly obscure — Sum-of-Repeated-Pairs. |
| `MEM` `TVARS` | reflection | low | TVARS selects vars by type. |
| `BARPLOT` `HISTPLOT` `SCATRPLOT` | graphics | ui-lane | (graphics — not in this lane) |
| `ATTACH` `DETACH` `LIBS` | libraries | will-not | `LIB` not supported per `@!MY_NOTES.md`. |
| `RCWS` (STWS/RCWS done) | binary-int | ✓ | |
| `XNUM` `XQ` | number mode | low | "Numeric / exact" toggles — aliases of →NUM / →Q. |
| `CYCLOTOMIC` | poly | low | nth cyclotomic polynomial. |
| `POLYEVAL` `MULTMOD` | modular | low | Modular poly ops — `EUCLID` / `INVMOD` shipped session 076; these two remain (need MODULO state). |
| `PA2B2` `PROPFRAC` `PARTFRAC` | algebra | medium | PARTFRAC is the big one. |
| `TRUNC` (two-arg) | real | low | `TRUNC(x, n)` — truncate to n places.  One-arg `TRNC` present. |
| `COSSIN` | trig-form | low | Rewrite in cos/sin basis. |

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
