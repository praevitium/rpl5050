# RPL.md — RPL Programming Support (task lane notes)

**Scope reminder.** This file tracks the User-RPL-as-a-language lane only:
parser `« … »`, evaluator, compiled local environments, structured control
flow, the suspended-execution substrate (HALT/CONT/KILL/ABORT/SST/DBUG/RUN),
program decomposition / composition, program persistence round-tripping.
Out of scope: arithmetic / CAS / unit / matrix / plot / string ops
(those belong to `rpl5050-command-support`), type widening
(`rpl5050-data-type-support`), UI (`rpl5050-ui-development`), the test harness
(`rpl5050-unit-tests`).

This file is the authoritative lane-local notes file. Read it at the start
of every run; update it at the end of every run with what shipped, what's
open, and the next-session queue.

---

## Current implementation status (as of session 268)


### Program value — parser & round-trip
- Parser: `<<` / `>>` (ASCII) and `«` / `»` (Unicode) both tokenize to
  the same `delim:<<`/`>>` pair; body is a flat token list. See
  `www/src/rpl/parser.js` `parseProgram`.
- Persistence: Program round-trips through `persist.js` — verified green
  by `tests/test-persist.mjs`.
- Formatter: programs render `« tok tok … »` via `www/src/rpl/formatter.js`.
- DECOMP / →STR on a Program: **session 069: new**. `DECOMP` op pops a
  Program and pushes the formatter's source-form string. Tests in
  `tests/test-reflection.mjs`.
- **Auto-close on unterminated** `«`: the parser silently auto-closes the
  program body when the source runs out before `»`. Matches the existing
  "forgot the closer" convenience on lists / vectors.

### Evaluation
- `EVAL` (ops.js) dispatches Program / Name / Tagged / Symbolic /
  Directory / other. Program eval runs `evalRange` over the token array
  with a pointer, snapshotting the stack and rolling back on RPLError.
- Recursion depth capped at `MAX_EVAL_DEPTH = 256`.
- Loop-iteration ceiling: `MAX_LOOP_ITERATIONS = 1_000_000`.
- `IFT` / `IFTE` — stack-based conditionals, implemented, tested.
  **Session 121:** HALT/PROMPT inside the action(s) now lifts cleanly when
  the IFT/IFTE keyword is reached through `evalRange`'s body intercept
  (`runIft` / `runIfte` are generator helpers; the action is EVAL'd via
  `_evalValueGen`).  Reaching IFT/IFTE through Name dispatch
  (`'IFT' EVAL`, Tagged-wrapped Name) still rejects through
  `_driveGen` with the session-111 `cannot suspend inside <IFT|IFTE> action`
  label.
- `MAP` / `SEQ` / `DOLIST` / `DOSUBS` / `STREAM` — list combinators with
  body programs.
  **Session 126** lifted MAP and SEQ; **session 131** lifted the
  remaining three (DOLIST, DOSUBS, STREAM).  HALT/PROMPT inside the body
  now lifts cleanly when any of these keywords is reached through
  `evalRange`'s body intercept (`runMap` / `runSeq` / `runDoList` /
  `runDoSubs` / `runStream` are generator helpers; per-iteration body
  EVAL is driven by `_evalValueGen` with `yield*`).  Per-iteration suspension is
  the natural shape: the partial accumulator (`out` array, current `i`,
  in-progress matrix row, restored variable binding, DOSUBS NSUB/ENDSUB
  frame, in-flight STREAM accumulator on the RPL stack) lives in the
  generator's stack frame, so CONT resumes mid-iteration with all state
  intact.  The Name-dispatch fallback (`'MAP' EVAL`, Tagged-wrapped
  `Name('SEQ')`, direct `lookup('DOLIST').fn(s)`, etc.) still goes
  through `_driveGen` with the session-111 caller labels (`MAP program` /
  `SEQ expression` / `DOLIST program` / `DOSUBS program` /
  `STREAM program`); KILL of a halted MAP-in-→ (or DOLIST-in-→ /
  DOSUBS-in-→) tears down the `→` frame via `gen.return()`'s finally
  chain, and DOSUBS additionally pops its NSUB/ENDSUB frame in the same
  `finally`.  `resetHome` closes the generator before clearing the home
  directory, so a halted DOSUBS's frame stack is cleared correctly on
  refresh.
- Symbolic lift on most arithmetic ops via the `_isSymOperand` /
  `_toAst` pair — programs carrying bare `Name` tokens will auto-lift
  when the operand reaches a numeric op.

### Structured control flow
| Construct | Status | Implementation |
|-----------|--------|----------------|
| `IF…THEN…ELSE…END`           | ✓ green (**session 083: auto-close on missing END**) | `runIf` in ops.js |
| `IFERR…THEN…ELSE…END`         | ✓ green (**session 078: auto-close on missing END**) | `runIfErr` (last-error slot, save/restore of outer) |
| `WHILE…REPEAT…END`            | ✓ green (**session 136: auto-close on missing END**) | `runWhile` |
| `DO…UNTIL…END`                | ✓ green (**session 136: auto-close on missing END**) | `runDo` |
| `START…NEXT`/`…STEP`          | ✓ green (**session 136: auto-close on missing NEXT/STEP, implicit step=1**) | `runStart` (Integer-mode preserving) |
| `FOR…NEXT`/`…STEP`            | ✓ green (**session 136: auto-close on missing NEXT/STEP, implicit step=1**) | `runFor` (bound name save/restore) |
| `CASE…THEN…END … END`         | ✓ green (**session 074: auto-close on missing END**) | `runCase` |
| `« … »` nested programs       | ✓ (transparent; Programs push themselves) |

### Compiled local environments
- Status: **session 069: ✓ green (boxed-program and algebraic bodies).**
- HP50 syntax: `→ a b c « ... body ... »` pops 3 from the stack into
  locals `a`, `b`, `c` visible only to `body`. Algebraic body form
  (`→ a b 'a+b'`) also supported — the body is an `Algebraic` object
  whose EVAL consults the local frame before `varRecall`.
- Evaluator hook: `evalRange` intercepts bare-`Name` token with id `→`
  and dispatches to `runArrow`. Frame is a `Map<string, value>` pushed
  onto the module-level `_localFrames` stack; popped in `finally` so
  a throw inside the body still cleans up.
- Lookup precedence: local frame (innermost first) → global `varStore`
  → op table. Implemented in `evalToken`, `_evalValue` Name branch,
  and the Symbolic-EVAL internal `lookup` closure.
- Workaround superseded: `'X' STO` / `'X' PURGE` is no longer the only
  tool — prefer `→` for anything that looks lexical.

### Suspended-execution substrate
- Status: **session 106: HALT fully lifted, including sub-program
  calls via Name lookup; SST↓ is now a real step-into op.**  HALT /
  CONT / KILL / RUN / SST / SST↓ / DBUG now compose freely at any
  structural depth AND across named-sub-program boundaries reached
  via `evalToken` Name lookup.  Previous session-088 substrate already
  covered structural control flow (`IF` / `FOR` / `WHILE` / `DO` /
  `IFERR` / `→`); session 106 adds the evalToken path by splitting
  `_evalValue` into two flavours: `_evalValueSync` (used by sync
  callers that cannot yield — `IFT`, `IFTE`, `MAP`, etc., which still
  reject HALT with the pilot-limit message via `_driveGen`) and
  `_evalValueGen` (generator, used *only* from `evalToken`'s Name
  branch).  The generator flavour does `yield* evalRange(...)` for
  Program values so a nested HALT propagates cleanly through every
  variable-lookup frame.  SST↓ now passes `into=true` into a new
  `_stepOnce(s, into)` helper, which sets a `_stepInto` module flag;
  `_evalValueGen`'s Program branch flips a separate `_insideSubProgram`
  flag.  The per-token yield site uses `_shouldStepYield()` which
  combines `_singleStepMode && (!_insideSubProgram || _stepInto)` — so
  SST steps *over* a sub-program call (runs the whole body in one
  step) while SST↓ descends *into* it (yields on every inner token).
- Implementation: `evalRange` and all `run*` helpers are now JS
  generator functions (`function*`). `yield` at each HALT propagates
  through the `yield*` delegation chain to the EVAL/CONT handler, which
  stores the live generator in `state.haltedStack` via `setHalted`.
  `CONT` uses `takeHalted()` (pop without closing) + `gen.next()`.
  `KILL` uses `clearHalted()` (pop + `gen.return()`). `resetHome` calls
  `gen.return()` for each live generator before clearing the stack so
  `runArrow`'s `finally` blocks run and `_localFrames` stays clean.
- HP50 ops in this family:
  - `HALT` — ✓ **session 088: structural HALT lifted.** `yield` in
    `evalRange` propagates through the full `yield*` chain. Called bare
    outside a running program: raises `HALT: not inside a running
    program`. `RPLHalt` class retained for back-compat but is no longer
    thrown during structural HALT — the generator yield mechanism
    replaces it.
  - `PROMPT` — ✓ **session 121 new** (HP50 AUR p.2-160).  Pops level 1,
    sets `state.promptMessage` to the popped value, then `yield`s — same
    suspension channel as HALT, so CONT/SST/KILL all work without further
    plumbing.  CONT and `_stepOnce` clear the banner up-front (resumption
    consumes the prompt); KILL clears the banner alongside `clearHalted`;
    `resetHome` clears it.  Bare PROMPT outside a running program raises
    `PROMPT: not inside a running program`, matching HALT's
    outside-program behavior.
  - `CONT` — ✓ **session 083 LIFO-aware, session 088 generator-based**.
    Uses `takeHalted()` (pops the top record without closing it) then
    drives `h.generator.next()`. If it yields again (another HALT),
    calls `setHalted` to push it back. Older halts remain. Raises
    `No halted program` when the LIFO is empty.
  - `KILL` — ✓ **session 083 LIFO-aware, session 088 gen.return()**.
    Uses `clearHalted()` which calls `gen.return()` to close the
    generator and trigger `finally` cleanup. Valid on an empty stack.
  - `RUN` — ✓ **session 083 new**. AUR p.2-177 resume op. Without DBUG
    active, behaves identically to `CONT`.
  - `ABORT` — ✓ green (session 067). Unwinds via `RPLAbort`.
  - `SST` / `SST↓` — ✓ **session 101: shipped; session 106: SST↓
    differentiated as real step-into.**  Module-private
    `_singleStepMode` flag flipped on/off by the SST handler; when
    set, `evalRange`'s `_shouldStepYield()` check yields after every
    token (in addition to the HALT-yield) so the generator suspends
    between instructions.  Session 106 added `_stepInto` and
    `_insideSubProgram` flags so SST runs a Name-reached sub-program
    body in one step (the `_shouldStepYield()` check returns false
    while inside a sub-program unless step-into is active) and SST↓
    descends token-by-token into the sub-program.  Ops:
    `SST` = `_stepOnce(s, false)`; `SST↓` = `_stepOnce(s, true)`.
    `_stepOnce` saves/restores both `_singleStepMode` and `_stepInto`
    in `finally` so KILL mid-step cannot leak either flag.  Generator
    semantics preserve every structural-context frame (FOR counter,
    IF branch, `→` local frame) for free across single-step
    suspensions.  Errors: SST with no halted program →
    `No halted program`.
  - `DBUG` — ✓ **session 101: shipped.** Pops a Program from level
    1, sets `_singleStepMode = true`, delegates to EVAL.  EVAL's
    generator runs the first token then yields, suspending the
    program on `haltedStack`; user drives subsequent steps with
    SST.  Errors: DBUG on a non-Program → `Bad argument type`.
    Empty program (`« »`) completes immediately with no halt.
- Session 116 — EVAL handler drives `_evalValueGen` so HALT lifts
  through Tagged wrappers and Name-on-stack EVALs.  The pre-116
  Program-direct fast path is gone; EVAL routes *every* operand
  through `_evalValueGen`, which recursively peels Tagged/Name
  preserving an `isSubProgram` parameter (default `true`; the EVAL
  entry passes `false` so the body remains the *outer* program from
  SST/DBUG's point of view).  DBUG's argument-type guard was
  widened to peel Tagged before the Program check so the same
  set of EVAL-able values is now DBUG-able.  `runArrow`'s Symbolic
  body call to `_evalValueSync` was wired with a caller label
  (`'→ algebraic body'`) — defensive consistency with the sibling
  sync-path call sites.
- Remaining limitations (session 131):
  - **Session 131 closes the structural-HALT lift program for the body-
    intercept family.**  All seven body-intercept ops — IFT, IFTE, MAP,
    SEQ, **DOLIST, DOSUBS, STREAM** — now lift HALT/PROMPT through
    `evalRange` body intercepts that delegate to generator helpers
    (`runIft` / `runIfte` / `runMap` / `runSeq` / `runDoList` /
    `runDoSubs` / `runStream`) driving `_evalValueGen`.  The Name-
    dispatch fallback for each (`'DOLIST' EVAL`, Tagged-wrapped
    `Name('DOSUBS')`, direct `lookup('STREAM').fn(s)`, etc.) still
    routes through the registered handler, which now drives the same
    generator through `_driveGen` — so the session-111 reject-with-
    caller-label messages are unchanged on that narrow path.  Session
    111 threads the caller label through `_evalValueSync` into
    `_driveGen`; internal recursion on Name / Tagged wrappers forwards
    the original label so the outermost originator's name survives the
    recursion.
  - The only structural sync-path call site that still rejects HALT is
    `runArrow`'s Symbolic body (`'→ algebraic body'` caller label, see
    session 116 narrative below).  This site is currently unreachable
    in practice — the Symbolic AST cannot carry a Program subnode — but
    the label is wired defensively for any future Symbolic refactor.
  - DOSUBS additionally maintains an `_DOSUBS_STACK` frame stack for
    `NSUB` / `ENDSUB`.  The frame is now pushed/popped inside
    `runDoSubs`'s `try/finally`, so a KILL of a halted DOSUBS closes
    the generator via `gen.return()` and the `finally` tears down the
    frame.  Pinned by the session-131 KILL-during-halted-window
    assertions in `tests/test-control-flow.mjs`.  STREAM has no
    auxiliary frame to maintain — its accumulator lives on the user-
    visible RPL stack between fold steps, so a HALT mid-fold leaves the
    accumulator visible exactly as it would be for any other in-flight
    program.
  - No serialisation across `persist.js`; page refresh drops the halted
    stack (`clearAllHalted` fires on `resetHome`).

### Program decomposition / composition
- `OBJ→` on Program: **session 067: new**. Pushes each token then an
  Integer count. Inverse op is `→PRG`.
- `→PRG`: **session 067: new**. Pops a count N, gathers N items into a
  fresh Program.
- `OBJ→` on Symbolic: **session 069: new**. Walks the AST root:
  Bin(op) → pushes `[L, R, Name('op', quoted), Integer(3)]`;
  Fn(name, args) → pushes `[arg1..argN, Name(name, quoted), Integer(N+1)]`;
  Neg(x) → same shape as Fn('NEG', [x]); leaves (num/var) unwrap to the
  underlying Real/Integer/Name with an Integer(1) count.
- `OBJ→` on Real / Integer: **session 155: AUR §3-149 fidelity edit**
  — pushes the value back unchanged (1-in / 1-out), matching the AUR
  §3-149 Input/Output table which lists no numeric-scalar entry.  The
  mantissa / exponent split that prior versions performed is the job
  of `MANT` (AUR p.3-6) and `XPON` (AUR p.3-9) — those ops are wired
  separately and unchanged by this edit.  Closes R-008.
- `OBJ→` on BinaryInteger / Rational: **session 163: AUR-fidelity
  extension** — pushes the value back unchanged (1-in / 1-out),
  matching the same AUR §3-149 choice the session-155 close made
  for Real / Integer (no numeric-scalar entry in the AUR table, so
  push back is the consistent fidelity choice).  Pre-163 these
  branches fell through `OBJ→`'s dispatch and threw `Bad argument
  type` — a divergence from the choice already documented for
  Real / Integer.  Format-specific splits remain at `B→R` (BinInt
  → Real, AUR p.3-46) and the rational `→NUM` / `→DEN` ops.  No
  REVIEW.md finding open against this branch — caught by audit.
- `OBJ→` on Tagged: **AUR-verified session 155** — pushes
  `value, "tag"` where `"tag"` is a String, not a Name.  R-008 had
  flagged this branch as suspect; the AUR §3-149 re-read confirmed
  the existing behaviour is correct.  Pinned with a regression
  assertion that the tag is `isString` and not `isName`.
- `OBJ→` on Unit: **session 159: AUR §3-149 row added** — pushes
  `Real(v.value)` on level 2 and `Unit(1, v.uexpr)` on level 1, so
  `x_unit  →  x  1_unit` per the AUR.  Round-trip via `*`
  reconstructs the original Unit because `_unitBinary` on Real*Unit
  folds the scalar into `b.value` (1 * x = x), preserving the uexpr.
  The level-1 push uses the bare `Unit()` constructor (not
  `_makeUnit`) so a theoretically-empty uexpr would still emit the
  prototype rather than collapsing to `Real(1)` — preserving the
  AUR table's shape-preserving "1_unit" output.  Closes R-012.
- `DECOMP` on Program: **session 069: new**. Pushes the formatter
  source-string (`« … »` form). Pair with `STR→` for round-trip —
  **session 074: DECOMP→STR→ round-trip pinned** by assertions in
  `tests/test-reflection.mjs` (9 new), including a DECOMP→STR→→DECOMP
  canonical-form idempotence check.
- `NEWOB` — supports every numeric-scalar shape (Real / Integer /
  BinaryInteger / Rational / Complex), every composite container
  (List / Vector / Matrix / Program), and Tagged / Unit / String /
  Name / Symbolic via the `_newObCopy` switch.  Every enumerated
  shape now produces a fresh `Object.freeze`d outer wrapper; the
  shallow-copy contract preserves inner-element identity for the
  composites.  **Session 167:** Rational branch added — closed the
  audit-driven asymmetry vs. the other numeric-scalar shapes
  (Real / Integer / BinInt were already enumerated; a Rational
  reaching the unenumerated tail returned identity, the lone
  outlier vs. the session-163 OBJ→ widening that brought BinInt
  and Rational into the OBJ→ push-back branch).  Reconstruction
  is `Rational(v.n, v.d)`; the constructor's sign-on-numerator +
  GCD-reduce pass is observably idempotent on already-canonicalised
  inputs.  **Session 172:** Program branch's outer-freeze parity
  fix.  Pre-172, the Program branch constructed an inline object
  literal `{ type: 'program', tokens: Object.freeze([...v.tokens]) }`
  with the inner tokens array frozen but the outer wrapper not —
  `Object.isFrozen(copy)` returned `false`, the lone outlier vs.
  every other shape's factory-mediated outer freeze.  The fix
  replaces the inline literal with `Program(v.tokens)`; the
  factory's matched outer + inner freeze pair brings Program into
  the same invariant every sibling shape already met.  Directory
  and Grob fall through to identity on purpose — Directories are
  live mutable containers and Grobs flow through their own
  value-copy path.

### Error-machinery
- `ERRM` / `ERRN` / `ERR0` / `DOERR` — registered and tested.
- Nested IFERR: `savedOuterError` capture + finally-restore is in place.

### Quoted names & directory resolution inside programs
- Bare `Name` inside a program body: `evalToken` checks the op table
  first, then `varRecall`, otherwise pushes the name.
- Quoted names (`'X'`) always push without EVAL — correct.
- Directory references inside programs: `enterDirectory` on EVAL of a
  Directory value; verified.

---

## Session 268 (this run) — what shipped

Post-ship verification pass on Sunday 2026-04-26.  All R-bucket findings
in `docs/REVIEW.md` remain fully closed at run-entry (R-001 — R-012
all resolved; O-011 + O-012 + O-014 `[deferred - post-ship]`).

**Verification-only run — no source or test change.**  Confirmed
5666 / 0 clean baseline (Δ+26 from session 264's 5640 — entirely from
sibling lanes: session 265-unit-tests, session 266-command-support,
session 266-code-review, session 267-data-type-support).  The RPL
programming substrate remains in the fully-documented, zero-drift
condition established by session 180.

Verification gates at exit:
- `node --check` on `www/src/rpl/ops.js`, `state.js`, `parser.js` → OK.
- `node tests/test-all.mjs` → 5666 / 0 passed.
- `node tests/test-persist.mjs` → all passed.
- `node tests/sanity.mjs` → 22 / 0 passed in 5 ms.

Session-264 `(this run)` heading demoted to plain past tense below
(per the recurring R-005 discipline — each rpl-programming-lane run
that adds a `(this run)` chapter must also demote its predecessor).
Status stamp bumped from "as of session 264" to "as of session 268".

---

## Session 264 — what shipped

Post-ship verification pass on Sunday 2026-04-26.  Scope-capped at
~1/3 workload per the scheduled-task guardrail.  All R-bucket findings
in `docs/REVIEW.md` remain fully closed at run-entry (R-001 — R-012
all resolved; O-011 + O-012 + O-014 `[deferred - post-ship]`).

**Verification-only run — no source or test change.**  Confirmed
5640 / 0 clean baseline (Δ+137 from session 213's 5503 — entirely from
sibling lanes across sessions 214–263).  The RPL programming substrate
remains in the fully-documented, zero-drift condition established by
session 180.

Session-213 `(this run)` heading demoted to plain past tense below
(per the recurring R-005 discipline — each rpl-programming-lane run
that adds a `(this run)` chapter must also demote its predecessor).
Status stamp bumped from "as of session 259" to "as of session 264".

---

## Session 213 — what shipped

Post-ship verification pass on Sunday 2026-04-26.  Scope-capped at
~1/3 workload per the scheduled-task guardrail.  All R-bucket findings
in `docs/REVIEW.md` remain fully closed at run-entry (R-001 — R-012
all resolved; O-011 + O-012 `[deferred - post-ship]`).

**Verification-only run — no source or test change.**  Confirmed
5503 / 0 clean baseline (Δ+10 from session 209's 5493 — entirely from
sibling lanes: session 210-code-review, session 211-command-support,
session 212-data-type-support).  The RPL programming substrate remains
in the fully-documented, zero-drift condition established by session 180.

Session-209 `(this run)` heading demoted to plain past tense below
(per the recurring R-005 discipline — each rpl-programming-lane run
that adds a `(this run)` chapter must also demote its predecessor).
Status stamp bumped from "as of session 209" to "as of session 213".

---

## Session 209 — what shipped

Post-ship verification pass on Sunday 2026-04-26.  Scope-capped at
~1/3 workload per the scheduled-task guardrail.  All R-bucket findings
in `docs/REVIEW.md` remain fully closed at run-entry (R-001 — R-012
all resolved; O-011 + O-012 `[deferred - post-ship]`).

**Verification-only run — no source or test change.**  Confirmed
5493 / 0 clean baseline (Δ+1 from session 205's 5492 — entirely from
sibling lanes: session 206-unit-tests (TESTS.md snapshot refresh, Δ+0
tests), session 207-command-support (COMMANDS.md session-log back-fill,
doc-only), session 208-data-type-support (erf M-cell pin promotion,
+1 test in `tests/test-types.mjs`)).  The RPL programming substrate
remains in the fully-documented, zero-drift condition established by
session 180.

Session-201 `(this run)` heading demoted to plain past tense below
(per the recurring R-005 discipline — each rpl-programming-lane run
that adds a `(this run)` chapter must also demote its predecessor).
Status stamp bumped from "as of session 205" to "as of session 209".

---

## Session 201 — what shipped

Post-ship verification pass on Sunday 2026-04-26.  Scope-capped at
1/3 workload per the scheduled-task guardrail.  All R-bucket findings
in `docs/REVIEW.md` remain fully closed at run-entry (R-001 — R-012
all resolved; O-011 + O-012 `[deferred - post-ship]`; O-009 resolved
session-189-code-review; C-014 resolved session-199-command-support).

**Verification-only run — no source or test change.**  Confirmed
5485 / 0 clean baseline (Δ+13 from session 197's 5472 — entirely from
sibling lanes: session 198-unit-tests (TESTS.md snapshot, Δ+0 tests),
session 199-command-support (COMMANDS.md backfill, doc-only),
session 200-data-type-support (GAMMA / LNGAMMA / erf / erfc L/V/M
matrix +13 pins)).  The RPL programming substrate remains in the
fully-documented, zero-drift condition established by session 180.

Session-197 `(this run)` heading demoted to plain past tense below
(per the recurring R-005 discipline — each rpl-programming-lane run
that adds a `(this run)` chapter must also demote its predecessor).
Status stamp bumped from "as of session 197" to "as of session 201".

---

## Session 197 — what shipped

Session log pointer prose extension on Sunday 2026-04-26.
Scope-capped at 1/3 workload per the scheduled-task guardrail.
All R-bucket findings in `docs/REVIEW.md` remain fully closed
(R-001 — R-012 all resolved; O-011 + O-012 `[deferred - post-ship]`;
O-009 resolved session-189-code-review).

**Doc-only run — no source or test change.**  The Session log pointer
prose section had been frozen at "Session 167 is this run" since session
167.  Sessions 172 / 180 / 184 / 188 / 192 were each verification-only
or audit-only runs that did not extend the prose.  This run extends it
with accurate one-paragraph summaries of each, demotes session 167's
"is this run" wording to "was this lane", and updates the footnote
demotion history.  Status stamp bumped from "as of session 192" to
"as of session 197".  Session-192 `(this run)` heading demoted to
plain past tense below (per the recurring R-005 discipline).

---

## Session 192 — what shipped

Post-ship verification pass on Sunday 2026-04-26.  Scope-capped at
1/3 workload per the scheduled-task guardrail.  All R-bucket findings
in `docs/REVIEW.md` remain fully closed at run-entry (R-001 — R-012
all resolved; O-011 + O-012 `[deferred - post-ship]`; O-009 resolved
session-189-code-review).

**Verification-only run — no source or test change.**  Confirmed
5464 / 0 clean baseline (Δ+16 from session 188's 5448 — entirely from
sibling lanes: session 189 unit-tests, session 189 code-review,
session 190 command-support, session 191 data-type-support).  The RPL
programming substrate remains in the fully-documented, zero-drift
condition established by session 180.

Session-188 `(this run)` heading demoted to plain past tense below
(per the recurring R-005 discipline — each rpl-programming-lane run
that adds a `(this run)` chapter must also demote its predecessor).

---

## Session 188 — what shipped

Post-ship verification pass on Sunday 2026-04-26.  Scope-capped at
1/3 workload per the scheduled-task guardrail.  All R-bucket findings
in `docs/REVIEW.md` remain fully closed at run-entry (R-001 — R-012
all resolved; O-009 + O-011 `[deferred - post-ship]`; T-003 partial,
assigned to `rpl5050-unit-tests`).

**Verification-only run — no source or test change.**  Confirmed
5448 / 0 clean baseline (Δ+47 from session 184's 5401 — entirely from
sibling lanes: session 185 unit-tests, session 185 code-review,
session 186 command-support, session 187 data-type-support).  The RPL
programming substrate remains in the fully-documented, zero-drift
condition established by session 180.

Session-184 `(this run)` heading demoted to plain past tense below
(per the recurring R-005 discipline — each rpl-programming-lane run
that adds a `(this run)` chapter must also demote its predecessor).

---

## Session 184 — what shipped

Post-ship verification pass on Sunday 2026-04-26.  Scope-capped at
1/3 workload per the scheduled-task guardrail.  All R-bucket findings
in `docs/REVIEW.md` were fully closed at run-entry (R-001 — R-012
all resolved; O-009 + O-011 `[deferred - post-ship]`; T-003 partial,
assigned to `rpl5050-unit-tests`).

**Verification-only run — no source or test change.**  Confirmed
5401 / 0 clean baseline unchanged from session 183.  Prior session
(180) completed the suspended-execution substrate audit and left
the substrate in fully-documented, zero-drift condition; this run
verifies that sibling sessions 181–183 did not perturb the RPL
programming substrate.

Session-180 `(this run)` heading demoted to plain past tense below
(per the recurring R-005 discipline — each rpl-programming-lane run
that adds a `(this run)` chapter must also demote its predecessor).

---

## Session 180 — what shipped

Ship-day audit-only run on Sunday 2026-04-26.  Scope-capped at 1/3
workload per the scheduled-task guardrail.  All R-bucket findings
in `docs/REVIEW.md` were fully closed at run-entry (R-001 — R-012
all resolved; O-009 + O-011 `[deferred - post-ship]`).  Priority
items 1–3 from the lane task file (R-008 OBJ→ fidelity, R-001…R-006
closures, RPL.md reconciliation) were all completed in prior runs
(sessions 155 / 159 / 163 / 167 / 172).  This run executed
priority #4: suspended-execution substrate doc-comment audit.

**Suspended-execution substrate audit — no source change.**  Full
survey of `ops.js` module-level state flags (`_singleStepMode` /
`_stepInto` / `_insideSubProgram` / `_localFrames`), `_driveGen`,
`_evalValueGen`, `evalToken`, and every registered handler in the
HALT / PROMPT / CONT / KILL / RUN / SST / SST↓ / DBUG family.
Findings: zero comment drift, zero dead state slots, zero missing
`gen.return()` calls, zero TODO/FIXME/HACK/XXX markers.  The
substrate emerged from session-178's CONT dead-catch removal and
RUN step-state-clear rewrite in clean, fully-documented condition.
No `www/src/rpl/ops.js` source change this run.

Session-172 `(this run)` heading demoted to plain past tense below
(per the recurring R-005 discipline — each rpl-programming-lane run
that adds a `(this run)` chapter must also demote its predecessor).

### User-reachable demo

No new behavior.  Existing session-178 RUN demo remains valid:
`« 1 2 + 10 * »` ENTER → DBUG → SST → RUN → stack shows `30`.

### Verification

| Gate                                | Result        |
|-------------------------------------|---------------|
| `node --check www/src/rpl/ops.js`   | clean         |
| `node tests/test-all.mjs`           | 5389 / 0      |
| `node tests/test-persist.mjs`       | 66 / 0        |
| `node tests/sanity.mjs`             | 22 / 0 (~5 ms)|

Δ from session-179 close (5389 / 0): **0** — audit-only run.

---

## Session 172 — what shipped

Final RPL-lane run on Sunday 2026-04-26, the ship day itself.
Hour 17 Pacific (odd, outside the 06–08 window) — both run guards
passed.  Fourth rpl-programming-lane run since ship-prep
(sessions 155 / 159 / 163 / 167 closed the OBJ→ + NEWOB AUR-
fidelity audits one shape at a time; this run closes another
audit-driven asymmetry on the same NEWOB op).  The R-bucket of
`docs/REVIEW.md` remained fully closed at run-entry (R-001 —
R-012 all resolved; the open queue at session-169-code-review's
close was O-009 + O-011 only, both `[deferred - post-ship]`).
This run was the same kind of audit-driven fidelity edit as
session 167 — caught by examining the `_newObCopy` enumeration
for additional asymmetries the s167 Rational close did not
address.

1. **Program-branch outer-freeze fix in `_newObCopy`**
   (`www/src/rpl/ops.js:9341`).  Pre-172 the Program branch
   constructed an inline object literal:
   ```js
   if (isProgram(v)) return { type: 'program', tokens: Object.freeze([...v.tokens]) };
   ```
   The inner tokens array was frozen (already pinned at session-
   146:2120 — `assert(Object.isFrozen(copy.tokens), ...)`) but the
   *outer* wrapper was NOT frozen.  Every other enumerated shape
   in `_newObCopy` goes through its factory (`RList` / `Vector` /
   `Matrix` / `Tagged` / `Unit` / scalar atom factories), each of
   which `Object.freeze`s the outer wrapper.  Program alone
   violated the invariant `Object.isFrozen(copy) === true`.  The
   fix is one line: switch the inline literal to `Program(v.tokens)`,
   so the Program factory's `Object.freeze({ type, tokens:
   Object.freeze([...]) })` pair gives matched outer + inner
   freezing.  No behavioural change for any program — every reader
   of the Program shape (DECOMP, EVAL, formatter, persistence)
   already treats the value as immutable; the bypass was a latent
   correctness hazard for any future mutation-attempt path that a
   refactor might introduce.  Probed via
   `utils/@probe-newob-program-frozen.mjs` and the broader
   `utils/@probe-newob-frozen-all.mjs` sweep — pre-fix Program
   was the lone shape with `output frozen=false`; post-fix every
   one of the 14 enumerated shapes is `output frozen=true`.
   Header doc-comment at `:9281-9320` rewritten to enumerate
   the freeze contract and to call out the s172 audit-close
   inline.  Footer comment in `_newObCopy`'s fall-through block
   extended with the session-172 audit rationale and the link
   back to session 167's parallel sibling close.
2. **33 session172 hard assertions added to
   `tests/test-reflection.mjs`**, inserted between the session-
   168 NEWOB follow-up cluster and the DECOMP→STR→ round-trip
   block.  Coverage breakdown:
   - **2 direct Program freeze pins** — non-empty Program
     (3-token body) and empty Program (`« »` boundary).  Both
     would have failed pre-fix.
   - **26 freeze-parity sweep pins** (13 shapes × 2 asserts):
     distinct-object precondition + `Object.isFrozen(copy)` for
     every NEWOB-handled shape (Real / Integer / BinInt / Rational
     / Complex / String / Name / Symbolic / List / Vector / Matrix
     / Tagged / Unit).  Defensive sweep so any future shape
     factory that drops the outer freeze, or any future inline-
     literal bypass like the pre-172 Program branch, surfaces as
     a hard test failure rather than silently regressing
     identity-decoupling.
   - **2 strict-mode mutation-rejection sentinels** — confirm
     the freeze is RUNTIME-enforced (`copy.tokens = ['mutated']`
     throws under ESM strict mode rather than silently succeeding,
     and the field still holds the original tokens array after
     the failed attempt).  Pre-fix the assignment silently
     succeeded.
   - **1 NEWOB→DECOMP→STR equivalence pin** — DECOMP on a NEWOB-
     copied Program produces the same source-form string as
     DECOMP on the original (smoke test that the factory switch
     did not change observable Program shape end-to-end).
   - **2 sweep precondition pins** for the `!== orig` check on
     Program (covered by the 13-shape sweep but inserted
     separately for the dedicated Program-freeze block above).

   The s172 pin set explicitly closes any future inline-literal
   bypass (the failure mode that this fix addresses) and any
   future shape-factory regression that drops the outer freeze
   (a defensive widening — no factory currently has this hazard,
   but the sweep now catches it if one is introduced).

3. **`docs/RPL.md` reconciled**.  Implementation-status NEWOB
   bullet rewritten to cite the s172 freeze fix explicitly and
   to fold the freeze-parity invariant into the bullet's prose.
   Status heading bumped from "as of session 167" to "as of
   session 172".  Session-172 (this run) chapter added at the
   top of the Session-log block.

### User-reachable demo

A real user can demonstrate the freeze fix from the calculator
keypad with the following sequence:

1. Type a program literal:  press `«`, then `1`, `SPC`, `2`, `SPC`,
   `+`, then `»` ENTER.  Stack level 1 now holds `« 1 2 + »`.
2. Press the soft-key `NEWOB` (or type `NEWOB` ENTER) — the program
   is replaced on level 1 by a freshly constructed copy.
3. Press the soft-key `EVAL` (or type `EVAL` ENTER) — the copy
   evaluates to `3` exactly as the original program would.

The freeze fix itself is a JS-runtime invariant not directly
visible from the keypad, but the user can verify the
distinct-object contract by running the same program through
`NEWOB EVAL` versus `EVAL`: both produce `3`, confirming the
factory-rebuilt Program preserves observable semantics.

### Verification

| Gate                                | Result        |
|-------------------------------------|---------------|
| `node --check www/src/rpl/ops.js`   | clean         |
| `node --check tests/test-reflection.mjs` | clean    |
| `node tests/test-reflection.mjs`    | 382 / 0       |
| `node tests/test-all.mjs`           | 5306 / 0      |
| `node tests/test-persist.mjs`       | 66 / 0        |
| `node tests/sanity.mjs`             | 22 / 0 (~5 ms)|

Δ from session-171 close (5273 / 0):  test-all **+33** from
this run's freeze-parity sweep.  test-persist unchanged at 66.
sanity unchanged at 22.

---

## Session 167 — what shipped

Final RPL-lane run on Saturday 2026-04-25 ahead of the Sunday
2026-04-26 ship — the third rpl-programming-lane run since
ship-prep (sessions 155 / 159 / 163 closed the OBJ→ AUR-fidelity
audit one numeric-scalar shape at a time; this run closes the
matching NEWOB asymmetry).  The R-bucket of `docs/REVIEW.md`
remained empty at run-entry (R-007 / R-009 / R-010 / R-011 closed
at ship-prep, R-008 at session 155, R-012 at session 159,
R-001 — R-006 all resolved across earlier sessions; the open queue
at session-164-code-review's close is O-009 + O-011 only, both
`[deferred - post-ship]`).  This run extends the same kind of
audit-driven fidelity edit to **NEWOB** — closing the asymmetry
where every other numeric-scalar shape was enumerated by
`_newObCopy` but Rational fell through the unenumerated tail and
returned identity (`v`).  No REVIEW.md finding was open against
this branch; caught by audit while reviewing the session-163
OBJ→ widening for sibling-op coverage.

1. **Rational branch added to `_newObCopy`**
   (`www/src/rpl/ops.js`).  The existing scalar-rebuild block was
   widened with `if (isRational(v)) return Rational(v.n, v.d);`
   placed alongside the pre-existing Real / Integer / BinaryInteger
   / Complex branches.  Pre-fix behaviour: NEWOB on a Rational
   returned the same frozen instance — `===` against the input
   was `true`, breaking the distinct-object-identity contract that
   every other numeric-scalar shape honoured.  Post-fix: NEWOB
   reconstructs via the Rational() constructor, which performs
   sign-on-numerator + GCD-reduce normalisation; on an
   already-canonical input that's observably idempotent (n / d
   pair survives byte-for-byte) but the returned object is a fresh
   frozen instance distinct from the input.  Header comment block
   at `:9270-9279` rewritten to enumerate every covered scalar
   shape and to call out Directory / Grob's deliberate
   fall-through to identity (Directory is a live mutable container,
   Grob flows through its own value-copy path).  Inline comment in
   `_newObCopy`'s fall-through block expanded to record the
   session-167 audit rationale and the link back to the
   session-163 OBJ→ widening.
2. **20 session167 hard assertions added to
   `tests/test-reflection.mjs`** (5 distinct scenarios × 4 asserts
   on average), inserted after the session 146 NEWOB-on-Program
   cluster.  Coverage:
   - Bare Rational distinct-object contract:  `is`-shape /
     `!== orig` / payload preserved (3/4) / frozen.
   - Negative Rational sign-convention preservation
     (Rational(-7n, 2n) keeps sign on numerator).
   - n/1 type stability (Rational(5n, 1n) does NOT collapse to
     Integer through NEWOB — mirrors session 164's OBJ→ pin).
   - Zero canonicalisation (Rational(0n, 1n) round-trips through
     NEWOB unchanged — mirror of session 163's BinInt #0b
     zero-value pin onto the Rational arm).
   - Composition with the existing shallow-copy contract:
     List-of-Rational rebuilds the outer List but preserves the
     inner Rational identity by reference (matches session 146's
     nested-Program shallow-copy pin); Tagged-of-Rational rebuilds
     the Tagged shell, preserves tag, preserves inner Rational by
     reference.
   - NEWOB→OBJ→ composition with the session-163 push-back
     branch:  the post-NEWOB Rational survives the OBJ→ push-back
     intact, distinct from the pre-NEWOB original — verifying
     that the two reflection ops compose without losing the
     freshly-allocated identity NEWOB just produced.

User-reachable demo (keypad sequence the user can replay):

```
3 ENTER 4 / ENTER       (level 1: 3/4 — Rational, EXACT mode)
DUP                     (level 2: 3/4, level 1: 3/4 — same instance)
NEWOB                   (level 1: 3/4 — fresh instance)
==                      (level 1: 1.   — value-equal, but the
                         underlying objects are now distinct;
                         pre-167 the NEWOB produced the same
                         frozen instance and `==` would still
                         be true since `==` compares values, not
                         references — the visible regression is
                         on the metaprogramming side via the
                         shallow-copy contract pinned in tests)
```

The user-visible behaviour change is invisible on `==` (which
compares values), but a metaprogramming user calling NEWOB to
force a decoupled copy of a Rational previously got the *same*
frozen object, which would surprise any program relying on
identity-distinct copies.  The fix matches every other
numeric-scalar shape's contract.

Verification gates (all four green at run-close):
- `node --check www/src/rpl/ops.js` — clean.
- `node tests/test-all.mjs` — **5206 / 0** (was 5186 at session
  166 close; +20 matches this run's session167 pin count exactly).
- `node tests/test-persist.mjs` — **66 / 0** (stable since the
  D-001 ship-prep close).
- `node tests/sanity.mjs` — **22 / 0 in 6 ms** (unchanged).

No REVIEW.md ledger edit this run — no R-bucket finding was open
against the NEWOB Rational asymmetry; this run's audit-driven
extension is captured in the session log + this RPL.md chapter
rather than promoted from a finding.

---

## Session 163 — what shipped

Final RPL-lane run on Saturday 2026-04-25 ahead of the Sunday
2026-04-26 ship.  The R-bucket of `docs/REVIEW.md` is empty
(R-007 / R-009 / R-010 / R-011 closed at ship-prep, R-008 at
session 155, R-012 at session 159, R-001 — R-006 all resolved
across earlier sessions; the open queue at session-160's close is
O-009 + O-011 only, both `[deferred - post-ship]`).  This run
extends `OBJ→`'s AUR-fidelity audit to the two remaining
numeric-scalar shapes — **BinaryInteger** and **Rational** —
matching the choice the session-155 close already made for
Real / Integer.  No REVIEW.md finding was open against these
branches; the divergence was caught by audit while reviewing the
session-155 / 159 / 160 OBJ→ closures for any unaddressed rows.

1. **BinaryInteger and Rational branches added to OBJ→**
   (`www/src/rpl/ops.js:6740-6757`).  The existing Real / Integer
   branch was widened from `if (isReal(v) || isInteger(v))` to
   `if (isReal(v) || isInteger(v) || isBinaryInteger(v) ||
   isRational(v))` so all four numeric-scalar shapes share the
   same `s.push(v); return;` body.  Pre-fix behaviour: BinInt and
   Rational fell through to the trailing `throw new RPLError('Bad
   argument type')` — a divergence from the AUR-fidelity choice
   the Real/Integer branch already documented.  AUR §3-149's
   Input/Output table still lists no row for any numeric scalar,
   so push-back is the consistent fidelity choice — symmetric
   with the rationale recorded by session 155.

2. **Header comment block updated** (`www/src/rpl/ops.js:6605-
   6660`).  The dispatch comment block — last rewritten in
   session 159 for the R-012 close — gains BinaryInteger and
   Rational rows in the AUR-table summary alongside Real /
   Integer / Unit, plus a paragraph noting that format-specific
   splits remain at `B→R` (AUR p.3-46) and the rational
   `→NUM` / `→DEN` ops, not `OBJ→`.  The body comment in the
   widened branch was rewritten to reference all four shapes
   explicitly and to call out that BinInt and Rational formerly
   fell through to `Bad argument type`.

3. **Pinned with eight new session163 assertions** in
   `tests/test-reflection.mjs` covering: BinaryInteger
   push-back at hex base (`#15h → #15h`); BinaryInteger base
   preservation across OBJ→ (`#255d → #255d`, no
   hex/decimal normalization); BinaryInteger zero-value
   boundary (`#0b → #0b`); Rational push-back (`3/4 → 3/4`,
   no coercion to Real); negative-numerator Rational
   (`-7/2 → -7/2`, sign convention preserved); ASCII alias
   `OBJ-> ` parity on BinaryInteger (matching the s155
   List / s159 Unit alias parity pins); EVAL-as-literal-push
   semantics on BinaryInteger (`#15h EVAL → #15h`);
   EVAL-as-literal-push on Rational (`3/4 EVAL → 3/4`).
   The EVAL pins close the parallel between OBJ→ and EVAL
   for every numeric-scalar shape — a future refactor that
   re-routes BinInt through B→R during EVAL would now be
   caught immediately.

Files edited:
- `www/src/rpl/ops.js` — `isBinaryInteger || isRational`
  added to the existing Real/Integer branch (one-line
  predicate widening); header comment block extended with
  BinInt and Rational rows (~22 added lines); body comment
  in the widened branch rewritten to cite all four scalar
  shapes (~7 added lines).
- `tests/test-reflection.mjs` — `Rational` and `isRational`
  added to the shared imports; eight session163 assertions
  appended after the session160 OBJ→-Unit follow-up cluster
  and before the `→ARRY / ARRY→` divider; file 596 →
  734 lines.
- `docs/RPL.md` — this chapter; OBJ→ implementation-status
  row for BinaryInteger / Rational added under "Program
  decomposition / composition"; "as of session N" stamp
  bumped from 159 → 163; session 159's `(this run)`
  heading demoted to plain past tense per R-005's
  recurring drift pattern.
- `docs/REVIEW.md` — no finding to promote (no open R-bucket
  finding existed against this branch); session 163 noted in
  the run-log narrative below the existing entry.

Totals: **+8 new session163-labelled assertions** in
`tests/test-reflection.mjs` (counted by `grep -c session163`).
`test-all.mjs` at **5156 passing / 0 failing** (entry baseline
5148 from session 162 close, Δ+8 — entirely this lane this run).
`test-persist.mjs` at **66 passing / 0 failing** (stable
since the D-001 ship-prep close).  `sanity.mjs` at
**22 passing / 5 ms** (unchanged).  `node --check` clean on
both touched JS files.

User-reachable demo (`OBJ→` on a BinaryInteger / Rational
pushes back unchanged):

```
8                       (level 1: 8 — Integer entry)
…&BR  HEX               (set BIN mode, hex base)
#FFh ENTER              (level 1: #FFh — BinaryInteger)
OBJ→                    (level 1: #FFh — push-back; pre-163
                         this would have thrown "Bad argument type")

3 4 / ENTER             (level 1: 3/4 — Rational from /
                         in EXACT mode; if you're in APPROX
                         use → 3 ENTER 4 / and EXACT first)
OBJ→                    (level 1: 3/4 — push-back unchanged)

EVAL                    (level 1: 3/4 — same value, EVAL of
                         a numeric scalar is a literal push)
```

The third line in each block also works — `#FFh EVAL → #FFh`
and `3/4 EVAL → 3/4` — confirming OBJ→ and EVAL stay parallel
for every numeric scalar shape on the HP50.

---

## Session 159 — what shipped

This run closes the open RPL-bucket finding **R-012**: the HP50
AUR §3-149 fidelity edit of `OBJ→`'s **Unit** branch — the third
row of the §3-149 Input/Output table, the one session 155's audit
did not address (R-008 was scoped to Real and Tagged only).
The session-156 audit re-read AUR §3-149 (text at PDF body line
13201ff, `OBJ→` Input/Output table) and confirmed the row reads
`x_unit  →  x  1_unit`: a Unit decomposes into the bare numeric
value (level 2) and a `1_unit` prototype (a Unit with value 1 and
the same uexpr) on level 1.  Pre-fix rpl5050 had no `isUnit`
branch in `OBJ→`'s dispatch — Unit fell through to `throw new
RPLError('Bad argument type')`, breaking the standard
`x_unit  OBJ→ ... rebuild ...` metaprogramming idiom.

1. **Unit branch added to OBJ→** (`www/src/rpl/ops.js:6720-6738`).
   New `if (isUnit(v))` branch pushes `Real(v.value)` on level 2
   and `Unit(1, v.uexpr)` on level 1.  The level-1 push uses the
   bare `Unit()` constructor rather than `_makeUnit` so a
   theoretically-empty uexpr would still emit the prototype rather
   than collapsing to `Real(1)` — preserving the AUR table's
   shape-preserving "1_unit" output.  In practice the codebase's
   arithmetic invariant ensures Units on the stack always have
   non-empty uexpr (anything dimensionless flows through
   `_makeUnit`'s collapse), but the bare constructor keeps the
   `OBJ→` branch robust against any future Unit constructor that
   doesn't go through that path.

2. **Header comment block updated** (`www/src/rpl/ops.js:6605-
   6650`).  The dispatch comment block — last rewritten in
   session 155 for the R-008 close — gains a Unit row in the
   AUR-table summary alongside Real/Integer, plus a paragraph
   explaining the `Unit()`-not-`_makeUnit` choice and the
   round-trip-via-`*` contract.

3. **Pinned with eight new session159 assertions** in
   `tests/test-reflection.mjs` covering: basic decomposition
   (`5_m → 5  1_m`); the round-trip-via-* contract (`5_m OBJ→ *
   → 5_m`, lossless); multi-symbol uexpr preservation
   (`5_m/s → 5  1_m/s`); the negative-value branch
   (`-3_kg → -3  1_kg` with sign on level-2 value, level-1
   prototype's value always 1; round-trip preserves sign); a
   regression guard pinning the level-1 push as `isUnit` and
   NOT `isName` / NOT `isString` (so a future "fix" that flips
   the prototype to a Name is caught); Tagged-of-Unit
   composition (only the outer Tagged peels, the inner Unit is
   preserved at level 2 — symmetric with session 156's
   Tagged-of-Tagged pin); ASCII alias `OBJ->` parity on Unit;
   and a negative-exponent uexpr (`2_(1/m)`) regression guard
   that the prototype preserves the `[m,-1]` shape.  Total:
   15 session159-labelled assertions across the file (counted
   inclusive of the helper-fired sub-asserts; the cluster is
   eight `{ ... }` blocks per the comment plan).

Files edited:
- `www/src/rpl/ops.js` — Unit branch added (10 source lines),
  header comment block extended (~20 lines added).
- `tests/test-reflection.mjs` — `Unit` / `isUnit` added to the
  shared imports; 15 session159 assertions appended at the tail
  of the OBJ→ test cluster (file ~315 → ~430 lines).
- `docs/RPL.md` — this chapter; OBJ→ implementation-status row
  for Unit added under "Program decomposition / composition";
  Session log pointer prose extended with a session-159 footnote;
  session 155's `(this run)` heading demoted to plain past tense
  per R-005's recurring drift pattern (session 155's chapter is
  now the entry one above this one).
- `docs/REVIEW.md` — R-012 promoted to `[resolved - session 159]`.

Totals: **15 new session159-labelled assertions** in
`tests/test-reflection.mjs` (file 315 → ~430 lines).
`test-all.mjs` at **5120 passing / 0 failing** (entry baseline
5105 from session 158 close, Δ+15 — entirely this lane this run).
`test-persist.mjs` at **40 passing / 0 failing** (D-001 closed
during session 152's window per the REVIEW.md note).
`sanity.mjs` at **22 passing / 5 ms** (unchanged).
`node --check` clean on every touched JS file.

User-reachable demo (`OBJ→` on a Unit decomposes per AUR):

```
5 _ m   ENTER         (level 1: 5_m)
OBJ→                  (level 2: 5, level 1: 1_m)
*                     (level 1: 5_m  — round-trip closes)
```

User-reachable demo (multi-symbol uexpr):

```
5 _ m / s   ENTER     (level 1: 5_m/s)
OBJ→                  (level 2: 5, level 1: 1_m/s)
SWAP / 1 / *          → reconstructs back to 5_m/s
```

User-reachable demo (negative-value, round-trip):

```
3 +/-  _ k g  ENTER   (level 1: -3_kg)
OBJ→                  (level 2: -3, level 1: 1_kg)
*                     (level 1: -3_kg — sign on the value, prototype
                       value always 1)
```

R-012 closed.  No other RPL-bucket findings were open coming
into this run (R-001 / R-002 / R-003 / R-004 / R-005 / R-006 /
R-007 / R-008 / R-009 / R-010 all resolved by previous lanes;
R-011 is a documented deliberate deviation).  R-012's close
also clears the OBJ→ HP50-fidelity audit trail — every row of
the AUR §3-149 Input/Output table now has a corresponding
branch in rpl5050's dispatch (Complex / Tagged / List / Vector /
Matrix / String / Program / Symbolic / Real / Integer / Unit).

---

## Session 155 — what shipped

This run closes the top-priority ship-target finding **R-008**: the
HP50 AUR §3-149 fidelity audit of `OBJ→`'s Real and Tagged branches.
Two suspected divergences were filed; the AUR re-read against
`docs/HP50 Advanced Guide.pdf` §3-149 (text at PDF body line 13201
onward, `OBJ→` Input/Output table) showed one was real and one was
a phantom:

1. **Real branch — divergence confirmed and fixed** (`www/src/rpl/
   ops.js:6709-6720`).  AUR §3-149 lists no Real / Integer entry in
   the `OBJ→` Input/Output table.  Prior rpl5050 implementation
   split a Real into mantissa-in-`[1,10)` and `floor(log10(|x|))`
   exponent and pushed them as `Real(m), Integer(e)` — that's
   `MANT` / `XPON`'s job per AUR p.3-6 / p.3-9, separately.  Real
   branch reduced to `s.push(v); return;` matching the Integer
   branch.  The two existing test assertions in
   `tests/test-reflection.mjs` that pinned the old (1-in / 2-out)
   behaviour were flipped to pin the new (1-in / 1-out, no
   decomposition) behaviour, and four new session155 assertions
   were added covering: Real → same Real; Integer → same Integer;
   zero Real → zero Real (no zero-special-case decomposition); a
   `MANT` / `XPON` sanity-pin confirming the mantissa / exponent
   split still lives at the standalone ops untouched by this edit.

2. **Tagged branch — phantom divergence, no edit** (`www/src/rpl/
   ops.js:6644-6650`).  R-008 suspected the existing `Str(v.tag)`
   push was a divergence from HP50 (claim: HP50 pushes the tag as a
   quoted Name).  AUR §3-149 re-read showed the table cell as
   `:tag:obj  →  obj  "tag"` — the `"tag"` notation uses double
   quotes, which is the AUR's String-literal convention (compare
   the symbolic-decomposition row showing `'function'` with single
   quotes for a quoted Name).  The existing `Str(v.tag)` is
   correct per AUR.  →TAG (AUR p.3-247) accepts either a String OR
   a Name as the tag-side input, so a user can construct a tagged
   from either, but `OBJ→`'s canonical decomposition uses the
   String form.  No code change; the comment block at
   `ops.js:6604-6638` was rewritten to capture the AUR-verified
   finding and warn future readers not to "fix" `Str(v.tag)` into
   a Name form.  A new session155 regression assertion in
   `tests/test-reflection.mjs` pins the tag is `isString` and not
   `isName` so any future flip is caught.

Files edited:
- `www/src/rpl/ops.js` — Real-branch reduction (12 lines → 4
  lines), header comment block rewrite (10 lines added), Tagged-
  branch one-line "do not flip" comment.
- `tests/test-reflection.mjs` — two old-behavior asserts replaced
  with new-behavior asserts; five new session155 asserts (Integer
  no-op, zero-Real no-op, MANT/XPON still operate on Real, Tagged
  isString-not-isName regression-guard).

Totals: **7 new session155-labelled assertions** (5 new + 2
flipped from prior shape) in `tests/test-reflection.mjs` (file
~280 → ~315 lines).  `test-all.mjs` at **5063 passing / 0
failing** (entry baseline 5034 from session 151 close + sibling
deltas across 152 / 153 / 154; my run delta is +5 net new + 2
flipped = +5 across the file's per-file count).
`test-persist.mjs` at **40 passing / 0 failing** (D-001 was
closed during session 152's window per the REVIEW.md note).
`sanity.mjs` at **22 passing / 5 ms** (unchanged).
`node --check` clean on every touched JS file.

User-reachable demo (OBJ→ on a Real returns the same Real):

```
3.14   ENTER         (level 1: 3.14)
OBJ→                 (depth still 1; level 1: 3.14 — no split)
```

Compare with MANT / XPON which still do the split:

```
1500   ENTER         (level 1: 1500)
DUP                  (level 2: 1500, level 1: 1500)
MANT                 (level 2: 1500, level 1: 1.5)
SWAP XPON            (level 2: 1.5,  level 1: 3)
```

User-reachable demo (OBJ→ on a Tagged: tag pushes as a String):

```
:lbl:7   ENTER       (level 1: :lbl:7)
OBJ→                 (level 2: 7, level 1: "lbl" — note the
                      double quotes; this is a String, not a Name)
```

R-008 closed.  No other RPL-bucket findings touched this run —
R-001 through R-006 remain open for follow-up runs (R-005 / R-006
are doc-cleanup, R-001 / R-002 / R-003 are docstring drift, R-004
is the IFT/IFTE/PROMPT narrative gap in this file's chapter
sequence).  Next-session queue updated below.

---

## Session 151 — what shipped

This run is a test-pinning run.  No source-code logic in
`www/src/rpl/ops.js` changed; every assertion below corresponds to
behaviour that has been live since session 088 (the generator-based
substrate) but was not explicitly pinned by the test suite.

The session 141 chapter pinned HALT/PROMPT lift through IFERR
clauses (trap, THEN, ELSE — full-form and auto-closed); session 146
pinned HALT/CONT/KILL through nested `→` frames.  This run closes
the symmetric gaps for the remaining structural runners: **CASE
clauses** (test, action, default, auto-closed), the **explicit-
closer forms of START** (NEXT and STEP), **DO/UNTIL** (body and
UNTIL test), and the explicit-STEP path of **FOR/STEP** (loop-var
save/restore under KILL).

1. **HALT/PROMPT lift through CASE clauses pinned.**  `runCase`
   (`ops.js:3654`) has been a generator since session 088 and uses
   `yield* evalRange(...)` for every clause range — clause test,
   clause action, default clause.  Eight new blocks (~26
   assertions) cover: HALT in clause action with later-clause
   short-circuit holding across HALT/CONT (sentinel: `« 5 CASE 1
   THEN 10 HALT 11 END 1 THEN 999 END END »` lands `⟦5 10 11⟧`,
   never includes `999`); HALT in clause test expression; HALT in
   default clause (`if (scan.kind === 'END')` branch); HALT in
   auto-closed CASE (no outer END); PROMPT in clause action
   (banner set / cleared on CONT); KILL of halted CASE (no
   `localFramesDepth` leak); sentinel pin against any future
   refactor that loses the post-clause `pending`/`nest` skip
   bookkeeping when a clause action yields mid-stream.

2. **HALT/PROMPT lift through DO/UNTIL pinned.**  `runDo`
   (`ops.js:4002`) is a generator and uses `yield*` for both the
   body range and the UNTIL test range.  Four new blocks (~14
   assertions): HALT inside DO body (`« 0 DO 1 + HALT UNTIL DUP 2
   ≥ END »` halts twice, exits when 2 ≥ 2); HALT inside UNTIL
   test (DUP residue visible at suspension, loop continues if
   test is false after CONT); KILL of halted DO; PROMPT inside DO
   body.

3. **HALT lift through fully-closed START/NEXT and START/STEP
   pinned.**  Session 136 pinned HALT in *auto-closed* START's
   body (the `closeScan === null` path).  The *fully-closed*
   paths — explicit NEXT, explicit STEP — were never pinned for
   HALT lift.  Three new blocks (~13 assertions): HALT in
   START/NEXT body (3 iters, final stack `⟦7 7 7⟧`); HALT in
   START/STEP body where STEP value is popped at end-of-iteration
   (sentinel `« 1 5 START HALT 100 2 STEP »` runs three iters at
   step=2, final stack `⟦100 100 100⟧`).  Pins that the
   `s.pop()` for the STEP value at `runLoopBody:4159` fires after
   the body's `yield* evalRange(...)` completes — body-HALT must
   not interfere with the STEP-value bookkeeping.

4. **HALT lift through fully-closed FOR/STEP + KILL with prior
   loop-var binding pinned.**  Symmetric to (3) for FOR.  Two new
   blocks (~18 assertions): HALT in FOR/STEP body with loop var
   `i` visible at every suspension (1/2/3/4); finally purges `i`
   on completion when no prior binding existed.  KILL of halted
   FOR/STEP with a *prior* binding for the loop var — establishes
   `varStore('i', Integer(99n))` before EVAL, body shadows it
   (i=1 visible), KILL closes the generator and runs the FOR's
   `finally` chain → `varRecall('i').value === 99n` (prior
   binding restored).  Pins runFor's save/restore symmetry
   (`ops.js:4111-4117`) under the KILL-via-`gen.return()` path.

Totals: **71 new session151-labelled assertions** in
`tests/test-control-flow.mjs` (file 5749 → 6238 lines).
`test-all.mjs` at **5034 passing / 0 failing** (entry baseline
4963, Δ+71 — entirely this lane this run).
`test-persist.mjs` at **40 passing / 1 failing** — the failure
(`session076: snapshot missing casVx resets to default 'X' (got
'x')`) is **pre-existing at session 151 entry** and out-of-lane:
`state.js:139` defaults `casVx` to lowercase `'x'` (deliberate
deviation per the comment block at `:125-139`), but the test and
`persist.js:118` block comment still claim `'X'`.  Drift is
data-types / CAS lane territory — not touched this run.
`sanity.mjs` at **22 passing / ~6 ms** (unchanged).
`node --check tests/test-control-flow.mjs` clean.
`www/src/rpl/ops.js` was not modified this run.

User-reachable demo (HALT inside a CASE clause action, with CONT
short-circuiting past later clauses):

```
« 5 CASE 1 THEN 10 HALT 11 END 1 THEN 999 END END »   ENTER
EVAL
   → display halts with stack ⟦5 10⟧.
   Press CONT → final stack ⟦5 10 11⟧
                (the 999 in the second clause never appears —
                 short-circuit holds across HALT/CONT).
```

User-reachable demo (HALT inside DO body and UNTIL test):

```
« 0 DO 1 + HALT UNTIL DUP 2 ≥ END »   ENTER, EVAL
   → halts with ⟦1⟧.  CONT runs UNTIL (1≥2 false), re-enters body,
     halts with ⟦2⟧.  CONT runs UNTIL (2≥2 true), loop exits.
     Final stack ⟦2⟧.
```

User-reachable demo (HALT inside fully-closed START/STEP):

```
« 1 5 START HALT 100 2 STEP »   ENTER, EVAL
   → halts (counter=1, body hasn't pushed yet).
   3× CONT — each iteration pushes 100, STEP pops 2, counter→3→5→7.
     Final stack ⟦100 100 100⟧.
```

User-reachable demo (KILL of halted FOR/STEP restores prior i):

```
99 'i' STO              (prior binding: i = 99)
« 1 5 FOR i i HALT 1 STEP »   ENTER, EVAL
   → halts with ⟦1⟧; 'i' RCL shows 1 (loop var shadows prior 99).
   Press KILL → halt slot clears, FOR's finally restores i=99.
     'i' RCL now shows 99.
```

---

## Session 146 — what shipped

This run is a test-pinning + doc-cleanup run.  No source-code logic
in `www/src/rpl/ops.js` changed; every assertion below corresponds
to behaviour that has been live for several sessions but was not
explicitly pinned by the test suite.

1. **R-006 doc-cleanup — stale internal cross-reference at
   `docs/RPL.md:348` refreshed.**  Item 5 of the session-141
   chapter cited `:1455` as the location of the Session log
   pointer prose that R-005 demoted to past tense.  That citation
   was correct only for a snapshot taken *before* session 141's
   own +99-line chapter insertion at `:258-356`; the demote target
   in the current file sits at `:1682`.  Pure-string edit:
   `prose at \`:1455\`` → `prose at \`:1682\`` plus a one-sentence
   parenthetical noting the line-number refresh.  R-006 closed.

2. **NEWOB on Program — distinct-object / distinct-tokens-array /
   structural / EVAL-equivalence pin set.**  NEWOB on Program has
   been live since session 067 (the same change that added OBJ→ /
   →PRG), but the existing NEWOB test cluster (session 047, in
   `tests/test-variables.mjs`) covered Real / List / Matrix only.
   This run adds a 7-block × ~5-assertion-per-block pin set in
   `tests/test-reflection.mjs` covering: empty-Program identity
   reset; non-empty Program with distinct outer object, distinct
   tokens-array, equal token count, per-token shape-equality (via
   spot-checks on Integer/Name fields); the tokens-array is
   `Object.isFrozen(...)` (matching the `Program()` constructor
   invariant); a nested-Program-inside-Program preserves outer
   shape *and* preserves inner-Program object identity (the
   `_newObCopy` switch's Program branch is shallow — one-level
   "decouple", same as HP50); a Program containing
   IF/THEN/ELSE/END structural keywords preserves every keyword
   token byte-for-byte; NEWOB-then-EVAL on `« 6 7 * 2 - »` agrees
   with original-EVAL (40 = 40); NEWOB-then-DECOMP-then-STR→ on a
   Program with a quoted Name preserves the quoted-Name token.

3. **DECOMP→STR→ round-trip pin for the structural-keyword family
   that wasn't previously pinned.**  Session 073 pinned the
   round-trip for IF/THEN/ELSE/END only.  Sessions 074 / 078 / 083
   / 136 added auto-close on missing END / NEXT for the rest of
   the structural family (CASE, IFERR, IF, WHILE, DO, START, FOR),
   and the formatter has long emitted these keywords in their
   canonical source form, but no test pinned that the resulting
   source-string round-trips through DECOMP→STR→ for any of them.
   This run adds 7 round-trip pins (one per structural construct
   not previously covered): IFERR/THEN/ELSE/END (trap divide-by-
   zero + THEN clause runs → 99); WHILE/REPEAT/END (1 → 5
   counter); DO/UNTIL/END (1 → 16 doubling); START/NEXT (4-iter
   accumulator → 4); FOR/NEXT (sum 1..4 = 10); CASE (3-clause
   dispatch with 2 → "two"); → compiled-local (`3 4 → a b « a b *
   »` → 12).  Each round-trip both preserves token count and runs
   to the same final value as the original, pinning that the
   formatter and parser agree on every structural keyword's
   source-form representation.

4. **HALT / CONT / KILL through *nested* `→` (compiled local)
   frames pinned.**  Session 088 pinned HALT/CONT/KILL on a
   single-level `→` frame (HALT inside `→ a « a HALT a a + »`
   suspends with a=10 visible, frame torn down on CONT).  The
   nested-`→` case — outer `→` whose body opens an inner `→`
   whose body HALTs — was never pinned.  Five new blocks in
   `tests/test-control-flow.mjs`: (a) HALT in inner body
   suspends with `localFramesDepth() === 2` and inner-binding
   visible (shadowing outer); CONT drains both frames cleanly.
   (b) KILL on the same shape closes the generator chain via
   `gen.return()`, runs both finallys in LIFO, frames torn down.
   (c) HALT *between* inner-frame open and close — i.e. the inner
   `→` ran to completion and popped its frame *before* HALT
   fires — `localFramesDepth() === 1` at suspension, only outer
   frame live; CONT drains the outer.  (d) `resetHome` on a
   nested-`→` HALT closes the generator chain, both frames torn
   down.  (e) Sequential HALTs at different `→` depths — first
   HALT inside outer-only, second HALT inside inner — confirms
   LIFO halt-stack semantics interact correctly with frame
   stacking: at first halt one frame live, at second halt two
   frames live, final CONT drains everything.

Totals: **65 new session146-labelled assertions** (36 in
`tests/test-reflection.mjs`, 29 in `tests/test-control-flow.mjs`).
`test-all.mjs` at **4883 passing / 0 failing** (entry baseline
this run was 4804, Δ+79 — 65 from session146 labels; 14 from
incidental fires of the existing session073-labelled
`_roundTripProgram` helper invoked seven new times by the new
DECOMP→STR→ structural-family round-trip pins).
`test-persist.mjs` at **40 passing / 0 failing** (unchanged
from entry — baseline was 40 after session 144's casModulo
additions).
`sanity.mjs` at **22 passing / 5 ms** (unchanged).
`node --check` clean on every touched JS file
(`tests/test-reflection.mjs`, `tests/test-control-flow.mjs`).
`www/src/rpl/ops.js` was not modified this run — every pin
exercises behaviour that was already live.

User-reachable demo (NEWOB on a Program preserves structural
keywords + EVAL semantics):

```
« 5 IF DUP 0 > THEN 100 + ELSE NEG END »   ENTER
NEWOB                                       (pushes a structurally
                                            equal but distinct copy)
EVAL                                        → final result 105
                                            (5 > 0 → 5 + 100)
```

User-reachable demo (DECOMP→STR→ round-trip on a FOR loop
preserves loop semantics):

```
« 0 1 4 FOR i i + NEXT »   ENTER
DECOMP                      (pushes the source-string « 0 1 4 FOR i i + NEXT »)
STR→                        (parses the source back into a Program)
EVAL                        → 10  (sum 1+2+3+4)
```

User-reachable demo (HALT/CONT through nested `→` frames):

```
« 1 2 → a b « 10 20 → a b « a HALT b » » »   ENTER, EVAL
   → display halts with stack ⟦10⟧.  Inner a=10 visible to
     name-recall (shadowing outer a=1).  Two `→` frames live.
   Press CONT → inner b=20 pushes; inner frame pops; outer
     frame pops.  Final stack ⟦10 20⟧.
```

User-reachable demo (KILL of a nested-`→` HALT closes the
generator chain via gen.return()):

```
« 1 2 → a b « 10 20 → a b « a HALT b » » »   ENTER, EVAL
   → halts as above with two `→` frames live.
   Press KILL → halt slot cleared; gen.return() runs the
     inner runArrow finally (pops inner frame), then the
     outer runArrow finally (pops outer frame).  No frame
     leak.
```

---

## Session 141 — what shipped

This run is a test-pinning + doc-cleanup run.  No source-code logic
in `www/src/rpl/ops.js` changed; the IFERR ⇄ suspension-substrate
behaviour exercised below has been live since the session-088
generator substrate plus session-078's IFERR auto-close, but was
never explicitly pinned.  Every assertion below corresponds to a
keypress sequence a real user can type from the keypad.

1. **HALT / PROMPT lift through `IFERR` clauses pinned (full-form
   `« IFERR … THEN … ELSE … END »`).**  `runIfErr` has been a
   generator since session 088 and uses `yield* evalRange(...)` for
   each of its three clauses (trap, THEN, ELSE), so HALT and PROMPT
   inside any of them already lifted mechanically through the
   `yield*` chain up to the EVAL/CONT driver.  The session-088 /
   session-121 narrative never pinned this directly — the new
   session-141 assertions in `tests/test-control-flow.mjs` close
   that gap.  Specifically:
   - HALT inside the trap clause suspends the program; CONT
     resumes; the trap pushes its post-HALT residue; with no
     thrown error the ELSE branch runs (sentinel: `« 10 IFERR
     HALT 99 THEN 7 ELSE 8 END »` lands `⟦10 99 8⟧`, never `⟦…
     7 …⟧`).
   - HALT inside the THEN clause (after a real caught error) keeps
     the *trapped* last-error visible to ERRM / ERRN during the
     halt window — `restoreLastError(savedOuterError)` lives in a
     `finally` that wraps the THEN-clause `yield*`, so it does NOT
     run on suspension (yield is not return).  CONT runs the rest
     of THEN; the finally then restores the outer last-error to
     its pre-IFERR value.
   - HALT inside the ELSE clause (no thrown error) sees the trap
     residue on the stack at suspension; CONT pushes the
     post-HALT result; the trap residue survives the suspension
     intact.
   - PROMPT inside the THEN clause sets `state.promptMessage`
     mid-trap-handler; CONT clears the banner and finishes THEN;
     the outer last-error finally still restores at THEN
     completion.

2. **HALT lift through *auto-closed* `IFERR` clauses pinned (no
   END).**  Session 078's `runIfErr` auto-close treats end-of-token-
   list as an implicit END for either the THEN clause (no ELSE,
   no END) or the ELSE clause (ELSE present, no END).  The
   resulting `yield*` chain composes with HALT/CONT/KILL the same
   way the explicit-END form does:
   - `« 10 IFERR HALT 5 THEN 99 »` (no END, no error path) →
     trap halts, CONT resumes, trap pushes 5, no error → THEN
     does not run, final stack `⟦10 5⟧`.
   - `« 10 IFERR 1 0 / THEN HALT 7 »` (no END, error path) →
     trap errors, THEN halts mid-clause; CONT pushes the post-
     HALT 7; finally restores outer last-error.
   - `« IFERR 1 2 + THEN 9 ELSE HALT 7 »` (no END) → trap
     pushes 3, ELSE auto-closes and halts; CONT pushes 7, trap
     residue 3 survives the cycle.

3. **Nested IFERR — last-error save/restore chain across nested
   `finally`s on CONT and KILL.**  The interesting structural
   invariant: each `runIfErr` frame snapshots its outer last-error
   before calling `setLastError(caught)` and restores it in a
   `finally` that wraps the THEN-clause `yield*`.  Two pins:
   - Inner-IFERR-THEN halts inside outer-IFERR-THEN.  During the
     inner halt, ERRM sees the *inner* caught error (the inner
     `setLastError(caughtInner)` ran before the yield).  CONT
     completes inner THEN → inner `finally` restores to outer
     caught → outer THEN finishes → outer `finally` restores to
     entry-null.  Final state: last-error is null.
   - KILL of the same halted inner-IFERR-THEN runs both
     `finally`s in LIFO via `gen.return()` — inner restores to
     outer-caught, then outer restores to entry-null.  Final
     state: last-error is null.  `localFramesDepth() === 0`.

4. **Sentinel pin: `yield` is not a thrown exception, so IFERR's
   `catch` block must not capture a HALT yield.**  If it ever
   did, `« IFERR HALT 1 THEN 999 ELSE 2 END »` would mistakenly
   run the THEN clause on resumption and the sentinel `999`
   would land on the stack.  The new pin runs this exact program
   and asserts the THEN-clause sentinel is absent at every stack
   level after CONT, plus that the ELSE result `2` is on top of
   the trap residue `1`.  This is a regression guard against any
   future refactor that switches `runIfErr`'s `try`/`catch` to
   capture more aggressively.

5. **R-005 doc cleanup — three `(this run)` headings demoted.**
   Section headers for sessions 121, 126, and 136 in this file
   used to all read `## Session NNN (this run) — what shipped`,
   but the lane writes a fresh chapter every substantive run, so
   only the most-recent run should bear that label.  This run
   demotes those three to plain `## Session NNN — what shipped`,
   and adds the present session-141 chapter as the new `(this
   run)` holder.  Same run also updates the Session log pointer
   prose at `:1682` to demote `Session 131 is this run …` to
   past tense and append session-136 / session-141 footnotes,
   per R-005's two pure-string edit list.  (Session 146 R-006
   close: line number refreshed from the original `:1455` to the
   current `:1682` after session 141's own +99-line chapter
   insertion pushed the demote target down by ~227 lines.)

Totals: **76 new session141-labelled assertions** in
`tests/test-control-flow.mjs` (control-flow file 599 → 675).
`test-all.mjs` at **4711 passing / 0 failing** (entry baseline
this run was 4635, Δ+76 — entirely this lane this run; sibling
lanes quiescent during the audit window).
`test-persist.mjs` unchanged.
`sanity.mjs` at **22 passing / ≈5 ms** (unchanged).
`node --check` clean on every touched JS file
(`tests/test-control-flow.mjs`).  `www/src/rpl/ops.js` was not
modified this run — the lift mechanism was already live.

User-reachable demo (HALT lift through IFERR THEN clause):

```
« 10 IFERR 1 0 / THEN HALT 99 ELSE 8 END »   ENTER, EVAL
   → display halts inside THEN with stack ⟦10⟧.  ERRM (typed at
     keypad) returns "Infinite result" — the trapped error is
     visible during the halt window.
   Press CONT → THEN finishes (push 99), outer last-error
     restored to whatever it was before IFERR (typically null /
     no error).  Final stack ⟦10 99⟧.
```

User-reachable demo (HALT lift through IFERR trap clause; sentinel
that yield is not an exception):

```
« IFERR HALT 1 THEN 999 ELSE 2 END »          ENTER, EVAL
   → display halts inside the trap with stack ⟦⟧.  Press CONT →
     trap pushes 1, no error caught (yield ≠ throw), ELSE runs
     (push 2).  Final stack ⟦1 2⟧.  THEN-clause sentinel 999
     never appears.
```

User-reachable demo (HALT lift through auto-closed IFERR ELSE
clause):

```
« IFERR 1 2 + THEN 9 ELSE HALT 7 »            ENTER, EVAL
   → trap pushes 3 (no error) → ELSE runs → display halts with
     stack ⟦3⟧.  Press CONT → ELSE pushes 7.  Final stack ⟦3 7⟧.
     No closing END; the auto-close path absorbs trailing tokens
     into the ELSE clause.
```

User-reachable demo (PROMPT lift through IFERR THEN clause):

```
« IFERR 1 0 / THEN "wait" PROMPT 99 END »     ENTER, EVAL
   → trap errors → THEN runs → "wait" pushed and consumed by
     PROMPT → display halts with the banner reading "wait" and
     the stack empty.  Press CONT → banner clears, THEN
     finishes (push 99), outer last-error restored.  Final
     stack ⟦99⟧.
```

User-reachable demo (KILL of HALT inside IFERR THEN restores
outer last-error via `finally`):

```
« IFERR 1 0 / THEN HALT 99 END »              ENTER, EVAL
   → trap errors → THEN runs HALT → display halts with last-
     error visible to ERRM / ERRN.
   Press KILL → halt slot cleared, gen.return() runs the
     `runIfErr` `finally`, outer last-error restored to its
     pre-IFERR value.
```

---

## Session 121 — what shipped

1. **`PROMPT` op shipped (HP50 AUR p.2-160).**  Three pieces:
   `state.promptMessage` (a new state slot with setter / getter /
   clearer in `www/src/rpl/state.js`); an intercept in `evalRange` that
   pops level 1, calls `setPromptMessage`, and `yield`s on the same
   suspension channel HALT uses; a registered `register('PROMPT', …)`
   fallback that throws `PROMPT: not inside a running program` for the
   bare-Name dispatch path (matches HALT's outside-program shape).
   CONT and `_stepOnce` (the SST/SST↓ engine) clear the banner up-front
   on resumption — a fresh PROMPT inside the resumed program will
   `setPromptMessage` again, so the banner reflects the *current*
   suspension's prompt.  KILL clears the banner alongside `clearHalted`.
   `resetHome` clears it.  Pop-before-yield means the operand is
   consumed atomically with the suspension; an empty stack throws
   `PROMPT: Too few arguments` before any state mutation.

2. **HALT/PROMPT lift through `IFT` body.**  New `runIft(s, depth)`
   generator helper in `ops.js`: snap the stack, pop test+action, EVAL
   the action through `_evalValueGen` (yieldable).  `evalRange`'s body
   intercept calls `yield* runIft(...)` after the existing HALT branch,
   so an `IFT` keyword *encountered while running a Program body*
   suspends cleanly instead of rejecting through `_driveGen`.  The
   `register('IFT', …)` body-handler stays as a sync fallback — it now
   drives `runIft` through `_driveGen` with the session-111
   `'IFT action'` caller label, so the rare Name-dispatch path
   (`'IFT' EVAL`, Tagged-wrapped `Name('IFT')`) keeps the existing
   reject-on-HALT behavior.  The outer snap/restore in the fallback
   preserves operand-rollback on rejection — `_driveGen.return()` runs
   only finally blocks, not catch, so the helper's own snap can't
   restore here.

3. **HALT/PROMPT lift through `IFTE` body.**  Same shape: new
   `runIfte(s, depth)` helper (popN(3), branch on `isTruthy(test)`,
   yield* the chosen action via `_evalValueGen`); intercept added in
   `evalRange` immediately after IFT; sync fallback rewritten to drive
   `runIfte` with the `'IFTE action'` caller label.  Both branches
   covered with regression tests.

4. **50 new session121-labelled regression assertions** in
   `tests/test-control-flow.mjs`.  Coverage:

   - 7 — `PROMPT` end-to-end: pop+halt cycle, banner type-flexible
     (any RPL value, not just String), empty-stack rejection,
     bare-Name `not inside a running program` rejection.
   - 6 — `PROMPT` interactions with structural control flow:
     inside `→` body (frame survives suspension; CONT tears down on
     completion), inside IF/THEN.
   - 4 — `HALT` inside IFT body — lifts, CONT resumes, no frame leak,
     no halt residue.
   - 3 — `PROMPT` inside IFT body — banner set, branch finishes after
     CONT.
   - 2 — IFT body false-test path: action skipped, no suspension.
   - 2 — sync-fallback IFT still rejects with session-111 label.
   - 4 — HALT inside IFTE true-branch and false-branch — both lift
     and resume correctly.
   - 2 — sync-fallback IFTE still rejects.
   - 3 — KILL of HALT-inside-IFT-inside-`→` cleans up halt + frames
     (closure of `runIft` propagates `gen.return()` through `runArrow`'s
     finally so the `→` frame tears down).
   - 1 — `resetHome` clears the prompt banner.

Totals: **50 new session121-labelled assertions** (all in
`tests/test-control-flow.mjs`).
Test-control-flow at **452 passing** (prior baseline 402 — Δ+50,
all from this lane).
`test-all.mjs` at **4232 passing / 0 failing** (prior baseline 4182 —
Δ+50; entirely this lane).
`test-persist.mjs` at **34 passing / 0 failing** (unchanged).
`sanity.mjs` at **22 passing / 5 ms** (unchanged).
`node --check` clean on every touched JS file
(`www/src/rpl/ops.js`, `www/src/rpl/state.js`,
`tests/test-control-flow.mjs`).

User-reachable demo (PROMPT):

```
"Enter X" PROMPT
   → display halts; banner reads "Enter X"; stack empty.
   Press CONT (or "CONT" ENTER) → banner clears, program completes.
```

User-reachable demo (HALT lift through IFT body):

```
1 « HALT 99 » IFT 100
   → display halts after the inner HALT; stack empty.
   Press CONT → 99 then 100 push; final stack ⟦100, 99⟧.
```

User-reachable demo (HALT lift through IFTE body):

```
0 « 1 » « HALT 2 » IFTE 100
   → false branch chosen; halts after HALT; stack empty.
   Press CONT → 2 then 100 push; final stack ⟦100, 2⟧.
```

---

## Session 126 — what shipped

1. **HALT/PROMPT lift through `SEQ` body.**  New `runSeq(s, depth)`
   generator helper in `ops.js`: pop the five SEQ args, validate the
   loop variable name, recall the prior binding for the `finally`-time
   restore, then loop over `[start, end]` by `step`.  Each iteration
   `varStore`s the current counter and EVAL's the expression through
   `_evalValueGen` (`yield*`), checks the +1 stack delta, and pushes the
   produced value into the accumulator `out` array.  `evalRange`'s body
   intercept calls `yield* runSeq(...)` after the existing IFTE branch,
   so a `SEQ` keyword *encountered while running a Program body*
   suspends mid-iteration on a HALT or PROMPT inside the expression.
   The partial accumulator and the current loop variable both live in
   the generator's stack frame, so CONT resumes inside the same
   iteration — the previously-pushed `out` entries survive intact and
   the loop continues from `i = i + step` once the suspended iteration
   completes.  KILL closes the generator and runs the `finally` block
   that restores the prior binding of the loop variable.

   `register('SEQ', (s) => { _driveGen(runSeq(s, 0), 'SEQ expression'); })`
   keeps the sync-fallback path: a HALT inside the body of a SEQ
   reached via Name dispatch (`'SEQ' EVAL`, Tagged-wrapped
   `Name('SEQ')`) or via direct `lookup('SEQ').fn(s)` calls still
   throws `HALT: cannot suspend inside SEQ expression` with the
   session-111 caller label.

2. **HALT/PROMPT lift through `MAP` body.**  Same shape: new
   `runMap(s, depth)` generator helper plus a `_mapOneValueGen(s, prog,
   e, depth)` per-element worker that pushes the input element, EVAL's
   the program through `_evalValueGen` (`yield*`), and pops/returns the
   one produced value.  `runMap` walks the input — List items array,
   Vector items array, or Matrix rows-of-rows — calling
   `_mapOneValueGen` per element and assembling the output container of
   the same type.  `evalRange`'s body intercept calls
   `yield* runMap(...)` immediately after the SEQ branch, so HALT
   inside the body of a MAP iterates correctly: the produced-so-far
   array and the in-progress matrix row both live in the generator's
   stack frame.  Session 121's `_combinatorProgCheck` argument-type
   guard is preserved (Program / Name / Symbolic accepted; everything
   else rejected with `Bad argument type`), and the original `_mapOneValue`
   sync helper is retained in source for any future caller (no current
   reference path uses it; see ops.js comment).

   `register('MAP', (s) => { _driveGen(runMap(s, 0), 'MAP program'); })`
   keeps the sync-fallback path with the session-111 `MAP program`
   caller label.

3. **34 new session126-labelled regression assertions** in
   `tests/test-control-flow.mjs`.  Coverage:

   - 5 — SEQ HALT in iter 1 lifts; CONT runs to completion;
     accumulator across HALT/CONT yields `{ 10 20 30 }`.
   - 4 — SEQ HALT in iter 3 (via IFT-conditional inside the body)
     preserves all five iterations after CONT (`{ 1 2 3 4 5 }`).
   - 3 — SEQ KILL during a halted iteration restores the prior
     binding of the loop variable through the `finally` chain.
   - 4 — SEQ PROMPT inside the body sets the banner mid-iteration;
     CONT clears it; both iterations complete.
   - 2 — sync-fallback SEQ still rejects HALT with session-111 label;
     no leaked halts or `_localFrames`.
   - 2 — SEQ on an empty range never halts and produces `{}`.
   - 5 — MAP HALT in iter 1 over a List lifts; CONT yields a 3-element
     result with no leaked halts.
   - 3 — MAP HALT in iter 3 (via IFT-conditional) preserves the
     partial accumulator across HALT/CONT (`{ 2 3 4 5 }`).
   - 2 — MAP HALT lift preserves Vector type after CONT.
   - 2 — MAP HALT lift preserves 2×2 Matrix shape after CONT.
   - 3 — MAP PROMPT inside the body sets the banner; CONT clears it.
   - 2 — sync-fallback MAP still rejects HALT with session-111 label.
   - 2 — MAP on an empty list never halts and produces `{}`.
   - 4 — KILL of HALT-inside-MAP-inside-`→` cleans up halt + `→`
     frame (closure of `runMap` propagates `gen.return()` through
     `runArrow`'s finally so the local frame tears down).
   - 3 — `resetHome` during a halted SEQ closes the generator and
     leaves no `_localFrames` leak.

User-reachable demo (HALT lift through SEQ body):

```
« X 1 == « HALT » IFT X 10 * » 'X' 1 3 1 SEQ
   → display halts on iter 1 (X==1); stack empty after the partial
     iteration accumulator is preserved in the generator.
   Press CONT → SEQ resumes inside iter 1, finishes 1*10=10, then
   iter 2 (20), then iter 3 (30).  Final stack ⟦{ 10 20 30 }⟧.
```

User-reachable demo (HALT lift through MAP body):

```
{ 1 2 3 } « DUP 1 == « HALT » IFT 100 * » MAP
   → display halts on iter 1 (input==1); the MAP generator holds
     the input list and the partial output array in its frame.
   Press CONT → iter 1 completes 1*100=100, iters 2/3 run straight
     through to 200/300.  Final stack ⟦{ 100 200 300 }⟧.
```

User-reachable demo (PROMPT lift through SEQ body):

```
« K K 1 == « "wait!" PROMPT » IFT 7 * » 'K' 1 2 1 SEQ
   → display halts on iter 1 (K==1) with banner "wait!".
   Press CONT → banner clears; iter 1 produces 7, iter 2 produces 14.
   Final stack ⟦{ 7 14 }⟧.
```

---

## Session 136 — what shipped

1. **Auto-close on missing END for `WHILE/REPEAT`.**  Symmetric with
   the existing IF / IFERR / CASE auto-close policy and with the
   parser's auto-close on unterminated `«` / `{` / `[`.  In
   `runWhile`, when `scanAtDepth0` for the END returns `null` (forward
   scan ran off the end of the token list) we now treat
   `endIdx = toks.length` as an implicit END and set an `autoClosed`
   flag that's used to return `bound` (mirrors `runIf`'s pattern).  A
   missing REPEAT stays a hard error: WHILE has no sensible default
   body separator.  A spurious NEXT / STEP at depth 0 in the END slot
   (counter-loop closer in a condition-loop's slot) also stays a hard
   error.  So
   ```
   « WHILE test REPEAT body »          ≡  « WHILE test REPEAT body END »
   « WHILE 1 1 + »                     still throws "WHILE without REPEAT"
   « WHILE 1 REPEAT 2 NEXT »           still throws "WHILE/REPEAT without END"
   ```

2. **Auto-close on missing END for `DO/UNTIL`.**  Same shape.  In
   `runDo`, a `null` `endScan` becomes the implicit END at
   `toks.length`.  A missing UNTIL stays a hard error.  A spurious
   NEXT / STEP in the END slot stays a hard error.

3. **Auto-close on missing NEXT / STEP for `START`.**  In `runStart`,
   a `null` `closeScan` (forward scan ran off the end) is treated as
   an implicit `NEXT` (step = 1) at `toks.length`.  Result: the body
   runs `(end - start + 1)` times, advancing the counter by 1 each
   iteration — same as if the user had typed `NEXT`.  A spurious END
   at depth 0 in the closer slot is still a hard error: START has no
   END closer in HP50, only NEXT / STEP.

4. **Auto-close on missing NEXT / STEP for `FOR`.**  Same shape as
   START.  The bound-variable save/restore via `runFor`'s `try /
   finally` is preserved across the auto-close path: a pre-existing
   binding for the FOR variable is restored on completion (or on
   KILL of a halted auto-closed FOR body); a fresh binding is purged
   on completion.  A missing variable name (`Name` token after FOR)
   is still a hard error.  A spurious END at depth 0 in the closer
   slot is still a hard error.

These four lifts are pure runtime auto-close — no parser change.  The
policy is uniform: any `scanAtDepth0` inside a structural runner
(`runIf` / `runIfErr` / `runCase` / `runWhile` / `runDo` / `runStart`
/ `runFor`) that runs off the end of the token list now treats end-
of-program as the implicit closer.  Whatever closer would have made
the construct well-formed is the one that's substituted (`END` for the
condition-loops and the dispatchers; `NEXT` for the counter-loops).

Composition with HALT/CONT/KILL is automatic — the runner is still a
generator, so HALT inside an auto-closed body suspends through the
same `yield*` chain as a fully-closed body, CONT resumes inside the
same iteration, and KILL closes the generator and runs the loop's
`finally` block (FOR's bound-name save/restore in particular).  The
only behavioral surface that changes is what *throws* — three previously-
throwing programs (the four "missing END/NEXT" shapes above) now run.
Programs that already had explicit closers behave identically.

5. **36 new session136-labelled regression assertions** in
   `tests/test-control-flow.mjs`.  Coverage:

   - 7 — WHILE auto-close: simple loop to 3, false-test no-op, parsed-
     source `<< 0 WHILE DUP 4 < REPEAT 1 + >>` happy path, missing-
     REPEAT still throws, missing-REPEAT stack-rollback, spurious-
     NEXT-in-END-slot still throws.
   - 6 — DO/UNTIL auto-close: 3-iteration counter loop, body runs at
     least once, missing-UNTIL throws, spurious-NEXT-in-END-slot
     throws.
   - 4 — START auto-close: 5-iteration loop, start>end runs body once
     (HP50 semantics), spurious END in closer slot still throws.
   - 8 — FOR auto-close: sum 1..4 to 10, var purged on exit, prior
     binding restored via finally, spurious END in closer slot still
     throws, FOR-without-NEXT/STEP error leaves no leaked binding.
   - 2 — Nested auto-close: WHILE-inside-IF where both are missing
     their END both auto-close correctly; parsed-source FOR with no
     NEXT runs a sum-to-15.
   - 9 — HALT/CONT/KILL composition with auto-close: HALT in an auto-
     closed START suspends, three CONTs complete the full 3-iteration
     run, final stack matches the explicit-NEXT version; KILL of a
     halted auto-closed FOR purges the loop var via finally and
     leaves no `_localFrames` leak.

Totals: **36 new session136-labelled assertions** (all in
`tests/test-control-flow.mjs`).
Test-control-flow at **599 passing** (prior baseline 563 — Δ+36, all
from this lane).
`test-all.mjs` at **4558 passing / 0 failing** (prior baseline 4522,
Δ+36 — entirely this lane this run; sibling lanes quiescent during
the audit window).
`test-persist.mjs` at **38 passing / 0 failing** (unchanged).
`sanity.mjs` at **22 passing / 5 ms** (unchanged).
`node --check` clean on every touched JS file
(`www/src/rpl/ops.js`, `tests/test-control-flow.mjs`).

User-reachable demo (WHILE auto-close):

```
« 0 WHILE DUP 4 < REPEAT 1 + »   ENTER, EVAL
   → final stack ⟦4⟧.  Note no closing END inside the program; the
     program parser auto-closes the outer `«` and the runtime auto-
     closes the WHILE/REPEAT.  The same source with `END` before
     `»` is identical.
```

User-reachable demo (DO/UNTIL auto-close):

```
« 0 DO 1 + UNTIL DUP 3 ≥ »       ENTER, EVAL
   → final stack ⟦3⟧.
```

User-reachable demo (START auto-close):

```
0 ENTER « 1 5 START 1 + »        EVAL
   → final stack ⟦5⟧ (body runs 5 times, accumulator 0 + 5×1 = 5).
```

User-reachable demo (FOR auto-close):

```
0 ENTER « 1 4 FOR i i + »        EVAL
   → final stack ⟦10⟧ (sum 1..4).  After the loop the loop var
     `i` is purged automatically.
```

User-reachable demo (HALT inside an auto-closed START):

```
« 1 3 START HALT 7 »             ENTER, EVAL
   → display halts on iter 1 with stack empty.  Press CONT three
     times.  After the third CONT the final stack is ⟦7 7 7⟧ — same
     as if the source had been written « 1 3 START HALT 7 NEXT ».
```

---

## Session 131 — what shipped

1. **HALT/PROMPT lift through `DOLIST` body.**  New `runDoList(s, depth)`
   generator helper in `ops.js`: pop the program, decide whether the
   next operand is a count or the implicit-1 single-list form, pop the
   count and N lists, validate types, find the min length, and loop.
   Each iteration pushes the i-th element of every list onto the stack
   and EVAL's the program through `_evalValueGen` (`yield*`), checks
   the +1 stack delta, and pushes the produced value into the
   accumulator `out` array.  `evalRange`'s body intercept calls
   `yield* runDoList(...)` immediately after the MAP branch, so a
   `DOLIST` keyword *encountered while running a Program body* suspends
   mid-iteration on a HALT or PROMPT inside the body.  The partial
   accumulator and the input lists both live in the generator's stack
   frame, so CONT resumes inside the same iteration with the
   previously-produced `out` entries intact.  KILL closes the
   generator; there is no auxiliary frame to tear down (DOLIST has no
   NSUB-like context).

   `register('DOLIST', (s) => { _driveGen(runDoList(s, 0), 'DOLIST program'); })`
   keeps the sync-fallback path with the session-111 caller label.

2. **HALT/PROMPT lift through `DOSUBS` body, with NSUB/ENDSUB frame
   teardown on KILL.**  New `runDoSubs(s, depth)` generator helper:
   pop program / window-size / list, push the NSUB/ENDSUB frame onto
   `_DOSUBS_STACK` inside a `try/finally`, then iterate windows.
   Each window pushes `n` consecutive elements and EVAL's the program
   through `_evalValueGen` (`yield*`).  The frame's `index` is updated
   per-window, so `NSUB` / `ENDSUB` called from inside a halted-and-
   CONT'd body read the correct (preserved-across-suspension) values.
   `evalRange`'s body intercept calls `yield* runDoSubs(...)` after
   the DOLIST branch.

   The frame `pop()` lives in the `finally`, so a KILL of a halted
   DOSUBS closes the generator via `gen.return()`, which runs the
   finally and tears down the frame — `NSUB` / `ENDSUB` called outside
   DOSUBS afterward correctly throw `Undefined local name`.  Pinned by
   the session-131 KILL-tears-down-frame assertions.  A new
   module-private observer `dosubsStackDepth()` is exported so tests
   can pin the frame-stack invariant directly.

   `register('DOSUBS', (s) => { _driveGen(runDoSubs(s, 0), 'DOSUBS program'); })`
   keeps the sync-fallback path with the session-111 caller label.

3. **HALT/PROMPT lift through `STREAM` body.**  New `runStream(s, depth)`
   generator helper: pop program and list, validate types,
   short-circuit on empty / single-element lists (matches pre-131
   behavior — `Invalid dimension` on empty, push the bare element on
   single-item).  Otherwise push `items[0]` as the seed accumulator,
   then for each subsequent element push it and EVAL the program
   through `_evalValueGen` (`yield*`).  The accumulator lives on the
   *user-visible RPL stack* between fold steps (matching pre-131 sync
   semantics), so a HALT mid-fold leaves the in-flight accumulator
   visible at the suspension — same observability as a HALT inside any
   other structural op.  `evalRange`'s body intercept calls
   `yield* runStream(...)` after the DOSUBS branch.

   `register('STREAM', (s) => { _driveGen(runStream(s, 0), 'STREAM program'); })`
   keeps the sync-fallback path with the session-111 caller label.

4. **65 new session131-labelled regression assertions** in
   `tests/test-control-flow.mjs`.  Coverage:

   - 5 — DOLIST HALT in iter 1 over a list lifts; CONT runs to
     completion; accumulator across HALT/CONT yields `{ 10 20 30 }`.
   - 5 — DOLIST HALT in iter 3 preserves the partial accumulator;
     final result is `{ 1 2 3 4 5 }`.
   - 4 — DOLIST 2-list parallel form HALT in iter 1; CONT completes;
     yields `{ 11 22 33 }`.
   - 4 — DOLIST PROMPT inside the body sets the banner; CONT clears it;
     final result is `{ 7 14 }`.
   - 3 — DOLIST KILL during a halted iteration leaves no halt residue
     and no leaked local frames.
   - 2 — sync-fallback DOLIST still rejects HALT with session-111
     caller label; no leaked halts or `_localFrames`.
   - 2 — DOLIST on empty list never halts and produces `{}`.
   - 6 — DOSUBS HALT in iter 1 lifts; frame stays alive across the
     halted window; CONT completes; frame torn down on completion;
     yields `{ 3 5 7 }`.
   - 4 — DOSUBS NSUB/ENDSUB-readable-from-body across a halted-and-
     CONT'd window: index continues correctly from 2 → 3.
   - 6 — DOSUBS KILL during halted window tears down the NSUB/ENDSUB
     frame — `dosubsStackDepth()` drops to 0; bare `NSUB` / `ENDSUB`
     called afterward correctly throw `Undefined local name`.
   - 3 — sync-fallback DOSUBS still rejects HALT with session-111
     caller label; cleans up halts, frames, and DOSUBS frame.
   - 3 — DOSUBS empty-window-set short-circuit (n > list length) never
     halts; produces empty list; pushes no NSUB frame.
   - 4 — STREAM HALT mid-fold suspends; accumulator (3) visible on the
     RPL stack at suspension; CONT yields final accumulator (10).
   - 4 — STREAM PROMPT inside the body sets the banner; CONT clears it;
     final accumulator is 6.
   - 2 — sync-fallback STREAM still rejects HALT with session-111
     caller label; no leaked halts or `_localFrames`.
   - 2 — STREAM single-element short-circuit never halts and pushes
     the bare element.
   - 4 — KILL of HALT-inside-DOLIST-inside-`→` cleans up halt + `→`
     frame (closure of `runDoList` propagates `gen.return()` through
     `runArrow`'s finally so the local frame tears down).
   - 4 — KILL of HALT-inside-DOSUBS-inside-`→` tears down both `→`
     frame and DOSUBS frame in one finally chain.
   - 4 — `resetHome` during a halted DOSUBS closes the generator,
     clears the DOSUBS frame, and leaves no local-frame leak.

Totals: **65 new session131-labelled assertions** (all in
`tests/test-control-flow.mjs`).
Test-control-flow at **563 passing** (prior baseline 498 — Δ+65,
all from this lane).
`test-all.mjs` at **4474 passing / 0 failing** (prior baseline 4409 —
Δ+65; entirely this lane).
`test-persist.mjs` at **38 passing / 0 failing** (unchanged).
`sanity.mjs` at **22 passing / 5 ms** (unchanged).
`node --check` clean on every touched JS file
(`www/src/rpl/ops.js`, `tests/test-control-flow.mjs`).

User-reachable demo (HALT lift through DOLIST body):

```
{ 1 2 3 } « DUP 1 == « HALT » IFT 10 * » DOLIST
   → display halts on iter 1 (input==1); the DOLIST generator holds
     the input list and the partial output array in its frame.
   Press CONT → iter 1 finishes 1*10=10, iters 2/3 run straight
     through to 20/30.  Final stack ⟦{ 10 20 30 }⟧.
```

User-reachable demo (HALT lift through DOSUBS body, with NSUB
preserved across the suspension):

```
{ 10 20 30 } 1 « DROP NSUB DUP 2 == « HALT » IFT ENDSUB + » DOSUBS
   → DOSUBS walks 1-wide windows over the list.  In window 2 (NSUB=2),
     the conditional HALT fires; display halts.  Press CONT → window 2
     finishes (NSUB=2, ENDSUB=3, 2+3=5 pushed); window 3 runs straight
     through (NSUB=3, ENDSUB=3, 3+3=6).  Final stack ⟦{ 4 5 6 }⟧.
```

User-reachable demo (HALT lift through STREAM body, accumulator
visible at suspension):

```
{ 1 2 3 4 } « + DUP 3 == « HALT » IFT » STREAM
   → STREAM folds + over the list.  After the first step (1+2=3) the
     conditional HALT fires; the running accumulator (3) is on the
     stack at suspension — same observability as any HALT mid-program.
   Press CONT → fold continues 3+3=6, 6+4=10.  Final stack ⟦10⟧.
```

---

## Session 116 — what shipped

1. **EVAL handler now drives `_evalValueGen` (queue item: Tagged /
   Name-on-stack lift, was uncredited site at session 111).**
   Pre-116 the EVAL handler had a Program-direct fast path and any
   non-Program operand fell through to `_evalValueSync`, which
   rejected HALT via `_driveGen` with the
   `HALT: cannot suspend inside a sub-program call` message.  That
   meant a Tagged-wrapped Program (`Tagged('label', Program(…))`)
   or a Name-on-stack pointing at a Program rejected HALT, even
   though both are semantically transparent program references.
   Session 116 routes the entry value through `_evalValueGen`
   unconditionally; the generator recursively peels Tagged / Name
   layers and `yield*`s the Program body, so HALT propagates up
   through whatever wrapper chain the user wrote.

   The change is gated by a new `isSubProgram` parameter on
   `_evalValueGen` (default `true`; the EVAL entry passes `false`).
   The flag controls whether the Program branch flips
   `_insideSubProgram` for the duration of the body — sub-program
   callers (evalToken Name lookup, recursive unwraps within token
   streams) keep the default so SST step-over works correctly; the
   top-level EVAL passes `false` so the body yields per token at
   the outer level (matches pre-116 Program-direct semantics) and
   SST↓ step-into still descends into Name-lookup-reached
   sub-programs.

2. **DBUG accepts Tagged-wrapped Programs.**  Pre-116 the type guard
   was a strict `isProgram(s.peek())` check, so a Tagged-wrapped
   Program failed with `Bad argument type` even though its EVAL
   sibling worked.  Session 116 walks the Tagged chain before the
   Program check (read-through; no pop) so the same set of
   EVAL-able values is now DBUG-able.  The actual peel still
   happens inside EVAL via `_evalValueGen`'s Tagged recursion.

3. **`runArrow` Symbolic body caller label.**  Session 111
   classified this site as **uncredited** — the
   `_evalValueSync(s, body, depth+1)` call passed no `caller`
   string, so a HALT inside (impossibly — Symbolic AST cannot carry
   a Program) would have surfaced with the default `a sub-program
   call` text.  Session 116 wires the label `'→ algebraic body'` for
   defensive consistency with the IFT / IFTE / MAP / SEQ / DOLIST /
   DOSUBS / STREAM sites; a future Symbolic-AST refactor that swaps
   in a Program-bearing node would otherwise silently lose the
   label.

4. **34 new session116-labelled regression assertions** in
   `tests/test-control-flow.mjs` (and 2 session111 rejection
   assertions superseded by the new lift behavior).  Coverage:

   - 5 — Tagged-wrapped Program EVAL lifts HALT, CONT resumes,
     no frame leak (was 2 rejection assertions pre-116).
   - 5 — double-Tagged Program EVAL lifts through both wrappers.
   - 5 — Name-on-stack EVAL of a Program with HALT lifts.
   - 4 — Name → Tagged → Program EVAL composition.
   - 6 — DBUG on a Tagged-wrapped Program; SST advances per outer
     token; step flags clean.  Load-bearing SST regression for
     `isSubProgram=false` at the EVAL entry.
   - 8 — SST↓ step-into through a Tagged outer + a Name-resolved
     sub-program: `isSubProgram=false` at the entry does NOT
     propagate into Name-resolved sub-programs at evalToken time.
   - 3 — `runArrow` Symbolic body smoke test
     (`→ a b \`a^2 + b^2\`` with `3, 4` folds to `25`).

Totals: **34 new session116-labelled assertions** in this lane (all
in `tests/test-control-flow.mjs`); 2 session111 rejection
assertions superseded by lift-pin replacements.
Test-control-flow at **402 passing** (prior baseline 368 — Δ+34,
all from this lane).
`test-all.mjs` at **4089 passing / 0 failing** (prior baseline
4053 — Δ+36; this lane contributed +34, and the data-types lane
contributed +2 in `test-types.mjs` between session 111's release
and this run's entry).
`test-persist.mjs` at **34 passing / 0 failing** (unchanged).
`sanity.mjs` at **22 passing / 6 ms** (unchanged).
`node --check` clean on every touched JS file
(`www/src/rpl/ops.js`, `tests/test-control-flow.mjs`).

---

## Session 111 — what shipped

1. **R-003 closed — `_driveGen` docstring rewritten (review finding
   from session 107).**  Pre-session-106 the docstring's
   parenthetical listed "variable lookup" as a canonical caller of
   `_evalValueSync → _driveGen`; session 106 moved variable lookup
   to `_evalValueGen`, but the lead paragraph of the docstring was
   never updated.  The rewrite now enumerates the actual sync-path
   callers (IFT / IFTE / MAP / SEQ / DOLIST / DOSUBS / STREAM /
   → algebraic body, plus the Name/Tagged recursion those ops
   trigger) and explicitly calls out that the `evalToken` →
   `_evalValueGen` path does **not** come through `_driveGen`.
   Pure-comment edit; `node --check` is the safety net.

2. **Caller-aware HALT-rejection message.**  Pre-session-111
   `_driveGen` threw `HALT: cannot suspend inside a sub-program
   call (use EVAL directly)` with no caller context.  The
   parenthetical "use EVAL directly" was misleading — users who
   hit this error typed `EVAL` on a program whose sub-op was
   IFT / IFTE / MAP / etc.  The fix: `_driveGen` accepts an
   optional `caller` string, baked into the error as
   `HALT: cannot suspend inside <caller>`.  `_evalValueSync`
   gained a 4th parameter to thread the label through from each
   op's call site; internal recursion on Name / Tagged wrappers
   forwards the original label.  Labels shipped:
   `IFT action`, `IFTE action`, `MAP program`,
   `SEQ expression`, `DOLIST program`, `DOSUBS program`,
   `STREAM program`.  Uncredited call sites (Tagged-wrapped
   Program EVAL via the EVAL dispatcher's own fallback, and
   runArrow's Symbolic body) pass no label — they fall through
   to the historical default (sans the stale "use EVAL
   directly" suggestion).  The existing session-106
   regression test at `:3092` uses `/HALT: cannot suspend/`
   as its regex, so the rename is backward-compatible with
   the prior pin.

3. **Regression tests — 23 new session111-labelled assertions
   in `tests/test-control-flow.mjs`.**  Per-op caller-label
   pins (IFT / IFTE true-branch / IFTE false-branch / MAP /
   SEQ / DOLIST / DOSUBS / STREAM) = 8 error-message assertions
   + 8 paired localFramesDepth-zero / haltedDepth-zero cleanup
   assertions.  Plus a Tagged-wrapped-Program EVAL pin for the
   uncredited default-message path (2 assertions), a Name-
   recursion pin confirming the caller label survives the
   `_evalValueSync` Name branch (2 assertions), and a
   cross-check that the lifted `_evalValueGen` path is
   unaffected — a `Name('PHALT') EVAL` inside an outer program
   still suspends cleanly rather than getting re-rejected by a
   mis-wired caller-label path (3 assertions).

Totals: **23 new session111-labelled assertions** in this lane
(all in `tests/test-control-flow.mjs`).  Test-control-flow at
**368 passing** (prior baseline 345 — Δ+23, all from this lane).
`test-all.mjs` at **3980 passing / 0 failing** (prior baseline
3957, Δ+23 — all from this lane, sibling lanes quiescent).
`test-persist.mjs` at **34 passing / 0 failing** (unchanged).
`sanity.mjs` at **22 passing / 4 ms** (unchanged).
`node --check` clean on every touched JS file
(`www/src/rpl/ops.js`, `tests/test-control-flow.mjs`).

---

## Session 106 — what shipped

1. **HALT lifts through `evalToken` Name lookup (queue item 2)** —
   Previously a HALT inside a program that was invoked via variable
   lookup (`'MYPROG' EVAL` or just bare `MYPROG` when `MYPROG` is
   `STO`'d as a Program) threw
   `HALT: cannot suspend inside a sub-program call`.  That path
   went `evalToken` → `_evalValueSync` → `_driveGen(evalRange(…))`,
   and `_driveGen` is a sync driver that rejects a `yield`.  This
   session split `_evalValue` into two flavours: `_evalValueSync`
   (used by the narrow set of callers that still cannot yield — IFT,
   IFTE, MAP bodies, Symbolic constant-rpl path) and a new
   `_evalValueGen` generator that `yield*`s an `evalRange` on
   Program values.  `evalToken` itself is now a `function*` and
   the one call site inside `evalRange` uses `yield* evalToken(...)`.
   Result: HALT inside a named sub-program (one level deep or deeply
   chained A→B→C) suspends cleanly, CONT resumes, KILL closes
   with `finally` blocks running for every nested `runArrow`
   local frame.  The session-101 R-002 regression guard was
   superseded: its assertions now pin the *successful suspend*
   case rather than the throw case.

2. **SST↓ is a real step-into op (previously alias of SST)** —
   Session 101 shipped SST↓ as a one-line alias of SST because
   distinguishing them required the evalToken migration.  That
   migration landed above, so SST↓ now has its own semantics.
   Module-private `_stepInto` and `_insideSubProgram` flags were
   added alongside `_singleStepMode`; `_stepOnce(s, into)` takes an
   `into` parameter, `SST` passes `false`, `SST↓` passes `true`.
   The per-token yield site uses a new `_shouldStepYield()`
   predicate: `_singleStepMode && (!_insideSubProgram || _stepInto)`.
   Concretely: with a halted program `« HALT MYP 1 + »` where
   `MYP = « 10 20 * »`, SST runs MYP's entire body in one step;
   SST↓ yields after each of `10`, `20`, `*`.  `_stepOnce`
   save/restores both flags in `finally`, and the `_evalValueGen`
   Program branch save/restores `_insideSubProgram` in `finally`,
   so KILL mid-step cannot leak either flag.

3. **P-001 doc drift — fix 9 stale `src/...` paths in docs/RPL.md**
   (review-lane finding from session 103).  `src/rpl/parser.js` →
   `www/src/rpl/parser.js` and similar at 9 sites (body of the
   status block and the Reference hooks section at the bottom of the
   file).  Sibling lanes had already fixed their portions of P-001;
   this closes the RPL.md share.  See `docs/REVIEW.md` for the full
   P-001 scoreboard.

Totals: **44 new session106-labelled assertions** in this lane
(all in `tests/test-control-flow.mjs`: 6 HALT-in-Name-sub-program
core + 4 deep chain / two-level + 3 IFT/IFTE pilot-limit retention
+ 6 SST step-over on sub-programs + 8 SST↓ step-into core + 5
step-into reset invariants + 6 KILL-during-step-into + 3 R-002
supersede + 3 empty/edge cases).  Test-control-flow at **345
passing** (prior baseline 294 — Δ+51 includes incidental probes).
`test-all.mjs` at **3886 passing / 0 failing**.
`test-persist.mjs` at **34 passing / 0 failing** (unchanged).
`sanity.mjs` at **22 passing / 0 failing in 6 ms** (unchanged).
`node --check` clean on every touched JS file
(`www/src/rpl/ops.js`, `tests/test-control-flow.mjs`).

---

## Session 101 — what shipped

1. **SST / SST↓ — single-step debugger** — Queue item 1 from the
   session-088 close-out.  Built on the generator substrate: a
   module-private `_singleStepMode` flag in `ops.js`; `evalRange`
   yields after every token (and at the tail of `runControl` /
   `runArrow`) when the flag is set.  New `_stepOnce(s)` helper
   replicates CONT's `takeHalted` / `gen.next` / re-`setHalted`
   pattern but flips the flag on around the `gen.next()` call so
   the generator suspends after exactly one token.  Flag is reset
   in the `_stepOnce` `finally` block, so subsequent CONT/RUN/EVAL
   calls run at full speed.  Two ops registered: `SST` and `SST↓`
   (alias — same body for now; full step-into requires the
   `evalToken` / `_evalValueSync` generator migration that's also
   needed to lift the HALT-inside-named-sub-program pilot limit).
   Public observer `singleStepMode()` exported for tests to pin
   the cleanup invariant.  User-reachable demo: enter
   `« 1 HALT 2 3 + »` ENTER, EVAL — program halts with [1] on
   stack; press `SST` repeatedly to advance one token at a time
   and watch the stack evolve.

2. **DBUG — start a program in single-step mode** — Queue item 3
   from the session-088 close-out (was blocked on SST).  Pops a
   Program off level 1, sets `_singleStepMode = true`, delegates
   to EVAL.  EVAL's generator runs the first token and then
   yields (because the flag is on), suspending the program on
   `haltedStack`; the flag is reset in `finally` so any
   downstream CONT/RUN runs at full speed.  Empty program
   (`« »`) completes immediately with no halt; non-Program
   argument throws `Bad argument type` (peek-then-EVAL pattern
   means the failed argument is preserved on the stack).
   User-reachable demo: enter `« 7 8 + »` ENTER, DBUG — stack
   shows [7] and DBUG annunciator implied; press `SST` twice to
   step through; press `CONT` instead to finish at full speed.

3. **R-002 — `_driveGen` closes the abandoned generator** —
   Pending review-lane finding from session 089 (low confidence,
   style/defensive).  In `_driveGen`, before throwing
   `HALT: cannot suspend inside a sub-program call`, call
   `try { gen.return(); } catch (_) {}` so the abandoned
   generator's `finally` blocks (notably `_popLocalFrame()` in
   `runArrow`) run synchronously.  Not a correctness fix — the
   outer EVAL handler's `_truncateLocalFrames(framesAtEntry)`
   safety net already restored frame depth before the abandoned
   generator reached GC — but makes the cleanup self-contained
   and obvious to a reader auditing resource lifecycles.  One
   regression-guard assertion in `tests/test-control-flow.mjs`
   exercises the throw path and pins `localFramesDepth() === 0`
   after.

Totals: **30 new session101-labelled assertions** in this lane
(all in `tests/test-control-flow.mjs`: 8 SST core + 2 SST error
+ 4 SST↓ alias + 6 DBUG + 5 DBUG edge cases + 5 KILL-during-SST
+ 3 R-002 cleanup pin).  Test-control-flow at **294 passing**
(prior baseline 264 — Δ+30 all from this lane).
`test-all.mjs` at **3639 passing / 0 failing**.
`test-persist.mjs` at **34 passing / 0 failing** (unchanged).
`sanity.mjs` at **22 passing / 0 failing in 4 ms** (unchanged).
`node --check` clean on every touched JS file
(`www/src/rpl/ops.js`, `tests/test-control-flow.mjs`).

(Note: the `test-all.mjs` aggregate is below the session-089
baseline of 3951 because the CAS migration sessions 092–100
consolidated and replaced large chunks of the test surface; the
3639 figure is the on-disk baseline this run picked up before
adding the +30 session-101 assertions, not a regression.)

---

## Session 088 — what shipped

1. **Comment fix (R-001) + dead-import removal (X-006)** —
   `state.js:406` comment updated to correctly state that
   `clearAllHalted()` is used by tests (not by `resetHome`).
   `clearAllHalted` and `haltedDepth` removed from the `./state.js`
   import in `ops.js`; replaced with an explanatory comment.

2. **Generator-based evalRange — structural HALT fully lifted** —
   The main architectural advancement this session. `evalRange`,
   `runControl`, `runCase`, `runIf`, `runIfErr`, `runWhile`, `runDo`,
   `runStart`, `runFor`, `runLoopBody`, and `runArrow` converted to
   JS generator functions (`function*`). `_evalValue` renamed
   `_evalValueSync` with a `_driveGen` helper that rejects HALT
   inside sub-program calls. EVAL handler drives the evalRange
   generator with `gen.next()`; on yield (HALT), stores the live
   generator in `state.haltedStack`. CONT uses new `takeHalted()`
   (pop without closing the generator) + `gen.next()` to resume.
   KILL uses `clearHalted()` which calls `gen.return()` so the
   generator's `finally` blocks (including runArrow's
   `_popLocalFrame()`) execute on discard. `resetHome()` and
   `clearAllHalted()` likewise call `gen.return()` on every halted
   generator before clearing. `state.js` gains `takeHalted()` export
   and `_closeRecord()` private helper. `RPLHalt` class retained for
   back-compat but is no longer thrown. New tests in
   `tests/test-control-flow.mjs`: 35 new session088-labelled
   assertions covering HALT inside FOR, IF, WHILE, →, nested
   FOR-in-IF, KILL cleanup, and resetHome cleanup.

3. **SIZE on Program** — `SIZE` extended to accept Program objects,
   returning the token count as an Integer (shallow count: nested
   sub-programs count as 1 token each). HP50 AUR §5.3 specifies
   SIZE on programs. 5 new assertions in `tests/test-reflection.mjs`.

Totals: **40 new session088-labelled assertions** in this lane
(35 in `test-control-flow.mjs` + 5 in `test-reflection.mjs`).
`test-all.mjs` at **3951 passing / 0 failing** (baseline 3911 at
end of session 087, Δ+40 — all from this lane this run).
`test-persist.mjs` unchanged (34 passing). `sanity.mjs` unchanged
(22 passing). `node --check` clean on every touched JS file.

---

## Session 083 — what shipped

1. **Multi-slot halted-program LIFO** — queue item 1's first concrete
   sub-component. `state.halted` flipped from a single scalar slot to
   the top of a LIFO stack (`state.haltedStack`) without changing the
   single-slot observable surface. Added `clearAllHalted()` and
   `haltedDepth()` exports; `setHalted` pushes, `clearHalted` pops
   one, `resetHome` drains everything. Scenario now supported:
   user runs program A which halts, then runs program B which also
   halts — previously B's halt overwrote A's; now CONT resumes B and
   A remains on the LIFO to be CONT'd next. Matches HP50 AUR p.2-135's
   stack-of-halted-programs behaviour.

2. **`RUN` op (AUR p.2-177)** — registered as a CONT synonym for the
   no-DBUG case. One-line delegation (`OPS.get('CONT').fn(s)`) so
   future DBUG work can graft the single-step/breakpoint branch on
   top without re-plumbing. Closes a small HP50 keyword gap —
   users typing `RUN` from the keypad get the same resume semantics
   they'd get from `CONT`.

3. **IF auto-close on missing END** — queue item 6. `runIf` now
   treats the end of the enclosing program body as the implicit
   closer for an `IF…THEN…` or `IF…THEN…ELSE…` that never sees its
   `END`. Mirrors the CASE auto-close (session 074) and the IFERR
   auto-close (session 077). "IF without THEN" stays a hard error —
   no default-clause semantics for IF (unlike CASE where the whole
   body becomes the default). Specifically un-blocks the
   queue-item-6 case: a CASE nested inside an IF whose own END is
   also missing previously threw "IF without END" because
   `_skipPastCaseEnd` returned `toks.length` and the outer
   `scanAtDepth0` fell off the end; both auto-close now and the
   combined `« IF 1 THEN CASE 1 THEN 101 END END »` (outer CASE
   END and outer IF END both missing) evaluates cleanly.

Totals: **49 new session083-labelled assertions** in this lane
(all in `test-control-flow.mjs`: 9 IF auto-close + 3 RUN + 3 RUN
chain + 23 multi-slot LIFO + 11 back-compat / drain / RUN-LIFO).
`test-all.mjs` at **3864 passing / 0 failing** (baseline 3815 at
end of session 082, Δ+49 — all from this lane this run).
`test-persist.mjs` unchanged (34 passing). `flake-scan.mjs 10 --quiet`:
3800 assertions stable-ok across 10 runs, zero flakes.

---

## Session 077 — what shipped

1. **HALT / CONT flake-hardening** — session 075 filed a flaky
   assertion in `tests/test-control-flow.mjs` L1830 (the
   `session073: first CONT runs 2 + → 3, re-hits HALT` block)
   where a first full-suite run occasionally threw `RPLHalt` out
   of `EVAL`. Root-cause scan found two real hygiene gaps rather
   than a single smoking gun:
     1. `resetHome()` did **not** clear `state.halted`, despite
        RPL.md's session-074 claim that "clearHalted fires on
        resetHome." Fixed: `resetHome()` now directly resets
        `state.halted = null` alongside the `_home.entries.clear()`
        call (single emit at the end).
     2. `_localFrames` had no defensive reset for abnormal
        unwinds through `EVAL` and `CONT`. Both handlers now
        snapshot `_localFrames.length` at entry and truncate back
        to that depth in `finally` via a new
        `_truncateLocalFrames(toLength)` helper. Legal nested
        `→NUM` / recursive EVAL is untouched (snap restores to
        *entry* depth, not zero). New exported
        `localFramesDepth()` lets tests pin the invariant.
   Regression guard: 19 new session077-labelled assertions in
   `tests/test-control-flow.mjs` cover localFramesDepth invariants
   around `→` normal-exit / error-exit, post-arrow HALT cycles,
   resetHome clearing `halted`, and two HALT/CONT cycles in the
   same stack. `flake-scan.mjs 10` clean across 10 runs, full
   determinism.

2. **Auto-close of unterminated `IFERR`** — queue item 4.
   Mirrors the CASE auto-close that shipped in 074: `runIfErr`
   now treats the end of the enclosing program body as the
   implicit closer for an `IFERR…THEN…` or
   `IFERR…THEN…ELSE…` that never sees its `END`. `branchScan`
   null → `endIdx = bound; autoClosed = true`; ELSE-present-but-
   no-END → same. "IFERR without THEN" stays a hard error —
   there's no default clause semantics to fall back on (unlike
   CASE). 8 new session077-labelled assertions in
   `tests/test-control-flow.mjs`: THEN-only on throw/no-throw,
   THEN/ELSE on both paths, preserved "IFERR without THEN" error,
   trailing-token absorption, source-parse, lastError nesting
   through an auto-closed outer IFERR.

3. **`→LIST` / `LIST→` / `→PRG` / `OBJ→` / `→ARRY` / `ARRY→`
   parity audit** — queue item 3. The three decomposition ops
   were not consistently accepting `BinaryInteger` counts and
   `→ARRY`'s dim-spec branch silently coerced Reals but refused
   BinInts. Widened the three coercion helpers
   (`_toIntIdx`, `_toCountN`, `_toDimSpec`) to accept BinInt
   uniformly and re-ran parity across all three construct/destruct
   pairs. 24 new session077-labelled assertions in
   `tests/test-reflection.mjs`: BinInt count for all three ops
   (`→LIST`, `→PRG`, `→ARRY`), negative-count rejection, String-
   count rejection, zero-count behaviour (documented `→ARRY 0`
   asymmetry — see new queue item 7), `OBJ→` integer-count
   parity across Program/List, round-trips, `ARRY→` size-list
   asymmetry note.

Totals: **51 new session077-labelled assertions** in this lane
(27 in `test-control-flow.mjs`, 24 in `test-reflection.mjs` — the
latter file's labels cover 20 discrete blocks, some with multiple
`assert` calls).
`test-all.mjs` at **3732 passing / 0 failing** (baseline 3681 at
end of session 076, Δ+51 — all from this lane this run).
`test-persist.mjs` unchanged (34 passing). `flake-scan.mjs 10`:
3668 assertions stable-ok, zero flakes.

---

## Session 074 — what shipped

1. **HALT / CONT / KILL pilot** — suspended-execution substrate at the
   top-level-program-body scope. New class `RPLHalt` in
   `www/src/rpl/stack.js` (sibling of `RPLAbort`, **not** an `RPLError`
   subclass so `IFERR` cannot trap it). New `state.halted` slot +
   `setHalted` / `getHalted` / `clearHalted` in `www/src/rpl/state.js`.
   `evalRange` intercepts the bare-name `HALT` token; when `depth ===
   0 && _localFrames.length === 0` it records `{ tokens, ip: i+1,
   length }` and throws `RPLHalt`; otherwise it raises a clear
   pilot-limit `RPLError`. `register('EVAL', …)` catches `RPLHalt`
   silently (clean suspension, stack preserved at HALT point).
   Registered `HALT` (outside-program error), `CONT` (resume), `KILL`
   (slot clear). Tests in `tests/test-control-flow.mjs` (~20 new
   assertions covering HALT/CONT round-trip, KILL semantics, pilot
   rejection inside IF/→, `CONT` on empty slot, sequential HALT/CONT
   pairs).
2. **Auto-close of unterminated `CASE`** — `runCase` no longer throws
   `CASE without END` when the outer `END` is missing. The scan
   fallthrough treats program-body end as the implicit close:
   unmatched THEN clauses dispatch; trailing tokens after the last
   inner `END` run as the default clause; short-circuit forward-scan
   hitting the program bound returns the bound instead of throwing.
   Regression guard: the old session-067 "diagnostic on missing outer
   END" test was flipped to assert the new auto-close success path.
   7 new session-073-cohort assertions + updated old test in
   `tests/test-control-flow.mjs`.
3. **`DECOMP`→`STR→` round-trip tests** — 9 new assertions in
   `tests/test-reflection.mjs` pinning the invariant that
   `« … » DECOMP STR→` reproduces the original Program shape.
   Covers empty program, EVAL-semantics preservation, nested
   Program, embedded-space String tokens, `IF`/`THEN`/`ELSE`/`END`,
   quoted-Name round-trip, Real value preservation, and
   DECOMP→STR→→DECOMP canonical-form idempotence.
4. **Nested-program closure-over-locals pin** — 3 new assertions in
   `tests/test-control-flow.mjs` confirming that compiled `→` locals
   remain visible inside nested `« … »` programs (dynamic scoping
   matching HP50 behaviour), that an inner `→` correctly shadows an
   outer local, and that an outer local survives across a nested
   `RPLError` that IFERR unwinds. This pins today's semantics so a
   future RunState refactor can't silently flip it to lexical.

Totals: 50 new `session073:`-labelled assertions in this lane
(34 in `test-control-flow.mjs`, 16 in `test-reflection.mjs`).
`test-all.mjs` at **3630 passing / 0 failing** (3553 → 3630, Δ+77:
this lane contributed +50; remaining +27 came in on disk from
sibling lanes the same day). `test-persist.mjs` unchanged (32
passing).

---

## Session 069 — what shipped

1. **Compiled local environments** — `→ a b c « body »` and
   `→ a b 'algebraic-body'`. Evaluator hook `runArrow` in `www/src/rpl/ops.js`:
   scans consecutive bare-name tokens after `→`, pops that many stack
   values (rightmost name gets level 1 per HP50 convention), pushes a
   `_localFrames` frame, evaluates the body, pops the frame in
   `finally`. Lookup precedence in `evalToken`, `_evalValue`'s Name
   branch, and the Symbolic-EVAL internal `lookup` closure all
   consult `_localLookup` before `varRecall`. Handles nested `→`
   shadowing, algebraic bodies, error-path cleanup. Tests in
   `tests/test-control-flow.mjs` (20 new assertions).
2. **`DECOMP` op** — pops a Program, pushes the formatter's string
   representation (`« tok tok … »`). Matches AUR p.1-12 description
   of program → source-string. Tests in `tests/test-reflection.mjs`
   (11 new assertions covering simple programs, nested programs,
   empty bodies, `IF`/control structures, string tokens, error on
   non-Program input).
3. **`OBJ→` on Symbolic** — extended the existing OBJ→ dispatch with
   a `isSymbolic` branch. Bin(op) pushes 4 items (L, R, quoted-op
   Name, Integer(3)). Fn(name, args) pushes `args…`, quoted-name,
   `Integer(args.length+1)`. Neg is encoded as Fn('NEG', [x]). Leaf
   num/var unwraps: `num` → underlying Real/Integer with count 1;
   `var` → Name with count 1. Helper `_symbolicDecompose` is the
   source of truth for the shape; `_astToRplValue` lifts an AST
   sub-expression back to an RPL value (Real, Integer, Name, or
   Symbolic). Tests in `tests/test-reflection.mjs` (7 new assertions).

Totals: 38 new assertions across two split test files. Full suite
`test-all.mjs` at **3465 passing / 0 failing** (3275 → 3465, +190:
this lane contributed +38; remaining +152 came in on disk from sibling
lanes during the same day). `test-persist.mjs` unchanged (32 passing).

---

## Next-session queue

### High priority
1. **[shipped session 101]** `SST` / `SST↓` — single-step debugger.
   `_singleStepMode` flag in `ops.js`, `evalRange` `yield`s after
   every token when set; SST handler peels the live generator off
   the haltedStack, flips the flag on, drives `gen.next()` once,
   and re-pushes if the generator yields again.  Clears the flag in
   `finally` so subsequent CONT/RUN run at full speed.  SST↓ aliases
   SST until the `_evalValueSync` generator migration lands.

2. **[shipped session 106]** HALT inside a sub-program call reached
   via `evalToken` Name lookup.  `evalToken` and a new
   `_evalValueGen` are now generator functions; the sync
   `_evalValueSync` is retained only for the narrow set of callers
   (IFT / IFTE / MAP / etc.) that still cannot yield.  `yield*` now
   threads through the Name-lookup path so a HALT inside a named
   sub-program suspends cleanly.  Session 101's `_driveGen.return()`
   tightening (R-002) stays in place for the remaining sync callers
   — supersede notes added in `tests/test-control-flow.mjs`.

3. **[shipped session 101]** `DBUG`.  Pops a Program, sets
   `_singleStepMode`, delegates to EVAL — first token runs and
   then the generator yields, suspending the program on
   `haltedStack` for `SST` to drive forward.

4. **Persistence of halted programs** — Generators are not
   serialisable via JSON. To survive a page refresh, we'd need
   to capture enough token/IP state to re-construct the generator
   chain. Not a priority — the `resetHome` hook already clears
   the halted stack on refresh.

5. **[shipped session 111]** R-003 — `_driveGen` docstring
   named "variable lookup" as a canonical sync-path caller after
   session 106 moved that path to `_evalValueGen`.  Docstring
   rewritten to list the actual sync-path callers (IFT / IFTE /
   MAP / SEQ / DOLIST / DOSUBS / STREAM / → algebraic body) and
   call out that `evalToken`'s Name-binding branch does **not**
   come through `_driveGen`.  Same run also shipped the
   caller-aware rejection message: `HALT: cannot suspend inside
   <caller>` where `<caller>` is the op label; uncredited sites
   fall through to `a sub-program call`.

6. **[shipped session 116]** EVAL handler routes through
   `_evalValueGen` so HALT lifts through Tagged-wrapped Programs
   and Name-on-stack EVALs.  DBUG widened to peel Tagged in its
   argument-type guard (matching EVAL's transparency).
   `runArrow` Symbolic body wired with the
   `'→ algebraic body'` caller label (defensive consistency with
   the sibling sync-path call sites; the AST cannot reach a
   Program subnode so the label is never user-visible today, but
   a future Symbolic-AST refactor that swaps in a Program-bearing
   node would otherwise silently lose the label).

7. **[shipped session 121]** `PROMPT` op (HP50 AUR p.2-160), plus
   HALT/PROMPT lift through IFT and IFTE bodies via `evalRange`
   intercepts that delegate to new `runIft` / `runIfte` generator
   helpers.  Sync fallbacks (Name dispatch) keep the session-111
   reject-with-caller-label behavior.  `state.promptMessage` slot
   added with setter / getter / clearer; cleared on CONT, SST,
   KILL, and `resetHome`.

8. **[shipped session 126]** HALT/PROMPT lift through MAP and SEQ
   bodies via `evalRange` intercepts that delegate to new `runMap`
   / `runSeq` generator helpers.  Per-iteration suspension is the
   natural shape: the partial accumulator (`out` array, current
   loop counter, in-progress matrix row, restored variable
   binding) lives in the generator's stack frame, so CONT resumes
   mid-iteration with all state intact and previously-completed
   iterations are preserved.  Sync fallbacks (Name dispatch +
   direct `lookup('MAP').fn(s)` calls) keep the session-111
   reject-with-caller-label behavior.

9. **[shipped session 131]** HALT lift through DOLIST / DOSUBS /
   STREAM bodies (last remaining sync-path callers).  Same shape
   as session 126's MAP/SEQ work — each op now has an `evalRange`
   intercept that delegates to a generator helper (`runDoList` /
   `runDoSubs` / `runStream`) driving `_evalValueGen`.  DOSUBS
   additionally pops its NSUB/ENDSUB frame in the helper's
   `finally`, so KILL of a halted DOSUBS tears down the frame
   stack via `gen.return()`.  STREAM's accumulator lives on the
   user-visible RPL stack between fold steps, so a HALT mid-fold
   leaves the accumulator visible at suspension.  Sync fallbacks
   (`'DOLIST' EVAL`, etc.) preserve the session-111 reject-with-
   caller-label behavior.  +65 session131 assertions in
   `tests/test-control-flow.mjs`.  This closes the body-intercept
   lift program — the only structural sync-path call site that
   still rejects HALT is `runArrow`'s Symbolic body, which is
   currently unreachable in practice (Symbolic AST cannot carry a
   Program subnode).

10. **[shipped session 136]** Auto-close on missing END / NEXT for
    `WHILE/REPEAT`, `DO/UNTIL`, `START`, and `FOR`.  Symmetric
    with the existing IF (session 083) / IFERR (session 078) /
    CASE (session 074) auto-close policy and with the parser's
    auto-close on unterminated `«` / `{` / `[`.  A `scanAtDepth0`
    that runs off the end of the token list inside `runWhile` /
    `runDo` / `runStart` / `runFor` is now treated as the implicit
    closer (`END` for the condition-loops, `NEXT` for the counter-
    loops).  Missing-separator errors (WHILE-without-REPEAT, DO-
    without-UNTIL, FOR-without-name) and spurious-closer errors
    (END in a START closer slot, NEXT/STEP in a WHILE END slot)
    stay as hard errors.  HALT/CONT/KILL composition is automatic
    via the existing generator substrate; FOR's bound-name
    save/restore in `runArrow`-style `try/finally` carries through
    the auto-close path.  +36 session136 assertions in
    `tests/test-control-flow.mjs`.  This closes the structural
    auto-close program — every structural opener now auto-closes
    at end-of-program if its closer is missing.

11. **[shipped session 141]** HALT / PROMPT lift through `IFERR`
    clauses pinned with regression tests; R-005 doc cleanup
    (demote three `(this run)` headings + Session log pointer
    prose update).  The lift mechanism itself was already live —
    `runIfErr` has been a generator since session 088 and uses
    `yield* evalRange(...)` for trap, THEN, and ELSE clauses, so
    HALT / PROMPT lifted mechanically through the `yield*` chain
    as soon as the substrate landed.  But no test pinned the
    behaviour, so a future refactor that broke it would not have
    been caught.  +76 session141 assertions in
    `tests/test-control-flow.mjs`.  Coverage: HALT in trap / THEN
    / ELSE (full-form and auto-closed variants); nested-IFERR
    last-error save/restore chain across nested `finally`s on
    CONT and KILL; PROMPT in THEN; sentinel pin that yield ≠
    throw so IFERR's catch never captures a HALT yield; HALT-
    then-DOERR-after-CONT triggers the catch correctly.  No
    `www/src/rpl/ops.js` source change this run.

12. **[shipped session 146]** R-006 doc-cleanup (line-number
    refresh `:1455` → `:1682` inside session 141's chapter at
    `docs/RPL.md:348`); **NEWOB on Program** distinct-object /
    distinct-tokens-array / structural / EVAL-equivalence pin
    set in `tests/test-reflection.mjs` (live since session 067,
    not previously pinned — the existing NEWOB cluster covered
    Real/List/Matrix only); **DECOMP→STR→ round-trip pin** for
    every structural-keyword construct not previously covered —
    IFERR / WHILE / DO / START / FOR / CASE / → (compiled local)
    — pinning that the formatter and parser agree on each
    construct's source-form representation; **HALT/CONT/KILL
    through *nested* `→` frames** pin set in
    `tests/test-control-flow.mjs` (single-level pinned at
    session 088, nested case never pinned).  +65 session146
    assertions split 36 / 29 across the two test files; +14
    incidental fires of the existing session073-labelled
    `_roundTripProgram` helper invoked by the new round-trip
    pins.  No `www/src/rpl/ops.js` source change this run.

13. **[shipped session 163]** `OBJ→` on BinaryInteger and
    Rational — AUR-fidelity extension matching the choice the
    session-155 close made for Real / Integer.  Pre-163, BinInt
    and Rational fell through `OBJ→`'s dispatch and threw `Bad
    argument type`; post-163, all four numeric-scalar shapes
    share the same push-back branch.  +8 session163 pins in
    `tests/test-reflection.mjs` covering OBJ→ and EVAL parity
    on both shapes plus the ASCII-alias parity check.  No
    REVIEW.md finding open against the branch — caught by audit
    while reviewing the s155 / s159 / s160 OBJ→ closures for
    unaddressed rows.

14. **[shipped session 167]** `NEWOB` on Rational — audit-driven
    asymmetry close, sibling to the session-163 OBJ→ extension.
    `_newObCopy` enumerated every other numeric-scalar shape
    (Real / Integer / BinaryInteger / Complex) and every
    composite container, but Rational fell through the
    unenumerated tail and returned identity (`v`).  Post-167,
    `_newObCopy` reconstructs via `Rational(v.n, v.d)` — fresh
    frozen instance, distinct from the input.  +20 session167
    pins in `tests/test-reflection.mjs` covering the
    distinct-object identity contract, sign convention
    preservation, n/1 type stability, zero canonicalisation,
    composition with the shallow-copy contract on List /
    Tagged inners, and composition with the session-163 OBJ→
    push-back branch.  No REVIEW.md finding open against the
    branch — caught by audit while reviewing the session-163
    OBJ→ widening for sibling-op coverage.

### Medium priority
5. **`CONT` across a `resetHome` — UI signal** — `resetHome`
   now closes generators correctly (session 088). Follow-up
   remains: no UI affordance tells the user their halted program
   was dropped. Belongs to `rpl5050-ui-development`.

### Low priority / opportunistic
6. **[shipped session 083]** CASE auto-close and IF auto-close —
   both landed.

7. **`→ARRY 0` rejection asymmetry** — documented, low priority.

### Medium priority
3. **[shipped session 078] `→LIST` / `LIST→` parity pass on
   Program decomposition.** BinInt counts now accepted by
   `→LIST`, `→PRG`, `→ARRY`; `_toIntIdx` / `_toCountN` /
   `_toDimSpec` widened. Residual asymmetry tracked as queue
   item 7 below.

4. **[shipped session 078] Auto-close of unterminated `IFERR`.**
   `runIfErr` now treats the end of the program body as the
   implicit closer, mirroring session 074's CASE auto-close.
   "IFERR without THEN" intentionally preserved as a hard error.

5. **`CONT` across a `resetHome`.** Session 077 confirmed that
   `resetHome` now directly clears `state.halted` (previously
   undocumented / only via emit side-effect). Follow-up remains:
   there's no UI signal to tell the user their halted program
   was dropped. Medium priority once we have a status-line
   affordance — this is a **UI lane** item (`rpl5050-ui-development`),
   not this lane.

### Low priority / opportunistic
6. **[shipped session 083]** CASE auto-close across a deeply nested
   IF whose own END is also missing. Fixed by widening `runIf` with
   the same auto-close policy `runCase` / `runIfErr` already had —
   any forward scan that falls off the end of the program body is
   treated as an implicit END. "IF without THEN" still a hard error
   (no default-clause semantics for IF, unlike CASE).

7. **`→ARRY 0` rejection is a documented asymmetry.** `→LIST 0`
   produces `{}` and `→PRG 0` produces `« »`, but `→ARRY 0`
   throws "Bad argument value" because `_toIntIdx` rejects 0.
   There is dead code in `_toArrayOp` (`if (n === 0) push
   Vector([])`) that anticipated the empty case but can't be
   reached. Low-priority: HP50's own behaviour on `→ARRY 0` is
   not clearly specified in AUR; empty-vector support would
   need a downstream audit of every op that consumes Vector to
   see which ones assume `dim ≥ 1`. Leave the rejection in
   place and the dead code annotated until someone needs empty
   vectors.

---

## Known issues / open questions

- `evalRange` swallows the CASE-internal END tokens because both `CASE`
  and each inner `THEN` look like CF openers if we're not careful. The
  session-064 implementation solves this by having `runCase` take over
  parsing from the opener onward, scanning forward for its own internal
  structure (not going through `CF_OPENERS` for its children). Worth
  revisiting if we see weird errors from mixed CASE-inside-IF nesting.
- `ABORT` message is not catchable by IFERR, but the outer user-facing
  `entry.js` loop may need to learn about `RPLAbort` to display a
  cleaner status-line message. Session 067 leaves the fallback
  `error.message` path alone — good enough for now; revisit when we
  wire up the UI-side ABORT display.

---

## Reference hooks

- Parser: `www/src/rpl/parser.js` (`parseProgram`, `tokenize`).
- Evaluator: `www/src/rpl/ops.js` — search for `evalRange`, `runControl`,
  the `run…` family, and `_evalValue`.
- Types: `www/src/rpl/types.js` — `Program`, `Name`, `Symbolic`, `Tagged`.
- Stack: `www/src/rpl/stack.js` — `save` / `restore` for EVAL atomicity.
- Tests: `tests/test-control-flow.mjs` (primary), `tests/test-eval.mjs`
  (EVAL dispatch), `tests/test-variables.mjs` (STO/RCL/PURGE + locals
  when those land), `tests/test-reflection.mjs` (OBJ→ / →PRG).

## Session log pointer

Each run leaves a numbered log in `logs/session-NNN.md` with a
**User-reachable demo** section. Session 067 was the first lane-specific
entry after the bootstrap; session 068 went to the data-types lane
(Tagged transparency widening); session 069 was this lane (compiled
locals + DECOMP + OBJ→ on Symbolic); sessions 070–073 went to sibling
lanes; session 074 was this lane (HALT/CONT/KILL pilot + CASE auto-close
+ DECOMP round-trip + closure pin); sessions 075–077 went to sibling
lanes; session 078 was this lane (HALT/CONT flake-hardening + IFERR
auto-close + →LIST/→PRG/→ARRY BinInt-count parity).

Note on cohort labels: session 074's assertions carry the `session073:`
in-file prefix (chosen when the work was drafted alongside the sibling
lane's 073 log). Session 078's assertions carry a `session077:` prefix
(chosen when the work was drafted alongside the calendar-day cohort on
2026-04-23). The log file lands at **078** because the data-types lane
already claimed `logs/session-077.md` earlier today with its own
`session074:`-cohort labels. Session 083's assertions carry the
`session083:` prefix directly — the log file is `logs/session-083.md`;
session numbering is back in sync with the actual log name for this
run because sessions 079 (unit-tests) and 080 (code-review) already
landed on disk with matching log numbers.  Session 088 was this lane
(generator-based evalRange + SIZE on Program).  Session 101 was this
lane (SST / SST↓ / DBUG + R-002 cleanup).  Session 106 was this lane
(HALT lift through evalToken Name-lookup path, SST↓ real step-into
semantics, P-001 RPL.md doc-path fixes).  Session 111 was this lane
(R-003 docstring rewrite, caller-aware `_driveGen` HALT-rejection
message threaded through `_evalValueSync` from IFT / IFTE / MAP /
SEQ / DOLIST / DOSUBS / STREAM call sites); test-file prefix is
`session111:` and the log file is `logs/session-111.md`.  Session 116
was this lane (EVAL handler driven through `_evalValueGen` so HALT
lifts through Tagged-wrapped Programs and Name-on-stack EVALs;
DBUG widened to peel Tagged in its argument-type guard;
`runArrow` Symbolic body wired with the `'→ algebraic body'`
caller label); test-file prefix is `session116:` and the log file
is `logs/session-116.md`.  Session 121 was this lane (`PROMPT` op
+ HALT/PROMPT lift through IFT and IFTE bodies via `evalRange`
intercepts driving new `runIft` / `runIfte` generator helpers);
test-file prefix is `session121:` and the log file is
`logs/session-121.md`.  Session 126 was this lane (HALT/PROMPT lift
through MAP and SEQ bodies via `evalRange` intercepts and new
`runMap` / `runSeq` generator helpers, plus the parallel
`_mapOneValueGen` per-element worker for the MAP path); test-file
prefix is `session126:` and the log file is
`logs/session-126.md`.  Session 131 was this lane (HALT/PROMPT lift
through DOLIST / DOSUBS / STREAM bodies via `evalRange` intercepts
and new `runDoList` / `runDoSubs` / `runStream` generator helpers;
DOSUBS additionally tears down its NSUB/ENDSUB frame on KILL via
the helper's `try/finally`; new `dosubsStackDepth()` observer
exported for tests).  This closes the body-intercept HALT-lift
program — the only structural sync-path call site that still
rejects HALT is `runArrow`'s Symbolic body, which is currently
unreachable in practice.  Test-file prefix is `session131:` and
the log file is `logs/session-131.md`.  Session 136 was this lane
(auto-close on missing END / NEXT for `WHILE/REPEAT`, `DO/UNTIL`,
`START`, and `FOR` — symmetric with the existing IF / IFERR / CASE
auto-close policy and with the parser's auto-close on unterminated
`«` / `{` / `[`); test-file prefix is `session136:` and the log
file is `logs/session-136.md`.  Session 141 was this lane (HALT/
PROMPT lift through `IFERR` clauses pinned: trap, THEN, ELSE — both
fully-terminated and auto-closed forms; nested-IFERR last-error
save/restore chain across nested `finally`s on CONT and KILL;
sentinel pin that yield is not a thrown exception so IFERR's catch
must not capture HALT; demote of stale `(this run)` headings in
this file per R-005); test-file prefix is `session141:` and the log
file is `logs/session-141.md`.  Session 146 was this lane (R-006
internal cross-reference refresh `:1455` → `:1682` at item 5 of
the session 141 chapter; **NEWOB on Program** distinct-object /
distinct-tokens-array / structural / EVAL-equivalence pin set in
`tests/test-reflection.mjs` (live since session 067, not previously
pinned); **DECOMP→STR→ round-trip** pin for IFERR / WHILE / DO /
START / FOR / CASE / → constructs that weren't in session 073's
IF/THEN/ELSE/END-only round-trip set; **HALT/CONT/KILL through
*nested* `→` frames** pin set in `tests/test-control-flow.mjs`
(single-level pinned at session 088, nested case never pinned);
+65 session146 assertions split 36 / 29 across the two test files;
no `www/src/rpl/ops.js` source change this run); test-file prefix
is `session146:` and the log file is `logs/session-146.md`.
Session 151 was this lane (HALT/PROMPT lift through CASE clauses,
fully-closed START/NEXT and START/STEP, DO/UNTIL, and FOR/STEP
pinned; +71 session151 assertions in `tests/test-control-flow.mjs`;
no `www/src/rpl/ops.js` source change); test-file prefix is
`session151:` and the log file is `logs/session-151.md`.
Session 155 was this lane (R-008 close — HP50 AUR §3-149 fidelity
audit of `OBJ→`'s Real and Tagged branches: Real-branch reduced to
`s.push(v); return;` matching the AUR's no-numeric-scalar entry,
Tagged branch verified-correct against AUR's `"tag"` notation and
left as `Str(v.tag)` with a "do not flip" comment guard;
`MANT` / `XPON` are unchanged and remain the canonical mantissa /
exponent split per AUR p.3-6 / p.3-9; +5 net new + 2 flipped =
+7 session155 assertions in `tests/test-reflection.mjs`); test-
file prefix is `session155:` and the log file is
`logs/session-155.md`.
Session 159 was this lane (R-012 close — HP50 AUR §3-149 fidelity
edit of `OBJ→`'s Unit branch, the third row of the §3-149 table
that session 155's audit did not address; new `isUnit` branch
pushes `Real(v.value)` on level 2 and `Unit(1, v.uexpr)` on
level 1 per the AUR `x_unit  →  x  1_unit` row, with the
level-1 push using the bare `Unit()` constructor rather than
`_makeUnit` so the prototype shape is preserved; +15 session159
assertions in `tests/test-reflection.mjs`); test-file prefix is
`session159:` and the log file is `logs/session-159.md`.
Session 163 was this lane (release-mode AUR-fidelity extension of
`OBJ→`'s numeric-scalar branch — BinaryInteger and Rational push
back unchanged, matching the choice the s155 close made for Real
and Integer; pre-163 they fell through to `Bad argument type`,
post-163 all four numeric-scalar shapes share the same push-back
branch.  No REVIEW.md finding open against the branch — caught by
audit while reviewing the s155 / s159 / s160 OBJ→ closures for
unaddressed rows; +8 session163 assertions in
`tests/test-reflection.mjs` covering OBJ→ and EVAL parity on both
shapes plus the ASCII-alias parity check); test-file prefix is
`session163:` and the log file is `logs/session-163.md`.
Session 167 was this lane (release-mode audit-driven asymmetry
close on `NEWOB`, sibling to the session-163 OBJ→ widening — a
Rational reaching `_newObCopy`'s unenumerated tail returned
identity (`v`) while every other numeric-scalar shape was
already enumerated; one-line widening
`if (isRational(v)) return Rational(v.n, v.d);` placed alongside
the pre-existing Real / Integer / BinaryInteger / Complex
branches.  No REVIEW.md finding was open against the branch —
caught by audit while reviewing the s163 OBJ→ widening for
sibling-op coverage.  +20 session167 assertions in
`tests/test-reflection.mjs` covering: bare-Rational
distinct-object identity, sign-convention preservation, n/1
type stability, zero canonicalisation, List-of-Rational and
Tagged-of-Rational shallow-copy contracts, and NEWOB→OBJ→
composition with the s163 push-back branch); test-file prefix is
`session167:` and the log file is `logs/session-167.md`.
Session 172 was this lane (audit-driven outer-freeze parity fix in
`_newObCopy`'s Program branch — the inline `{ type, tokens }` literal
was not passed through `Object.freeze`, while every other enumerated
shape uses its factory which freezes the outer wrapper; switched to
`Program(v.tokens)` so the factory's double-freeze pair applies;
+33 session172 freeze-parity assertions in
`tests/test-reflection.mjs` covering outer-frozen contract,
inner-tokens-frozen contract, structural deep-equality, and EVAL
equivalence); test-file prefix is `session172:` and the log file is
`logs/session-172.md`.
Session 180 was this lane (ship-day suspended-execution substrate
doc-comment audit — full survey of `_singleStepMode` / `_stepInto` /
`_insideSubProgram` / `_localFrames` state flags, `_driveGen`,
`_evalValueGen`, `evalToken`, and every registered handler in the
HALT / PROMPT / CONT / KILL / RUN / SST / SST↓ / DBUG family;
findings: zero comment drift, zero dead state slots, zero missing
`gen.return()` calls, zero TODO/FIXME markers; no source change; test
baseline 5389/0 unchanged); log file is `logs/session-180.md`.
Session 184 was this lane (post-ship verification pass — confirmed
5401/0 clean baseline; sibling sessions 181–183 did not perturb the
RPL programming substrate; no source or test change); log file is
`logs/session-184.md`.
Session 188 was this lane (post-ship verification pass — confirmed
5448/0 clean baseline; Δ+47 entirely from sibling lanes sessions
185–187; RPL programming substrate undisturbed; no source or test
change); log file is `logs/session-188.md`.
Session 192 was this lane (post-ship verification pass — confirmed
5464/0 clean baseline; Δ+16 entirely from sibling lanes sessions
189–191; all RPL-bucket REVIEW.md findings remain fully closed;
no source or test change); log file is `logs/session-192.md`.
Session 197 was this lane (session log pointer prose extension —
demoting session 167's "is this run" marker to past tense and
adding pointer entries for sessions 172 / 180 / 184 / 188 / 192;
no `www/src/rpl/ops.js` source change or test change; status stamp
bumped from "as of session 192" to "as of session 197"); log file
is `logs/session-197.md`.
Session 201 was this lane (post-ship verification pass — confirmed
5485 / 0 clean baseline; Δ+13 from session 197 entirely from sibling
lanes 198-unit-tests / 199-command-support / 200-data-type-support;
RPL programming substrate undisturbed; no source or test change;
status stamp bumped from "as of session 197" to "as of session 201");
log file is `logs/session-201.md`.
Session 205 was this lane (post-ship verification pass — confirmed
5492 / 0 clean baseline; Δ+7 from session 201 entirely from sibling
lane 204-data-type-support (erfc L/V/M/T+L stale-cell promotion);
RPL programming substrate undisturbed; no source or test change;
status stamp bumped from "as of session 201" to "as of session 205");
log file is `logs/session-205.md`.
Session 209 was this lane (post-ship verification pass — confirmed
5493 / 0 clean baseline; Δ+1 from session 205 entirely from sibling
lane 208-data-type-support (erf M-cell pin promotion, +1 test);
RPL programming substrate undisturbed; no source or test change;
status stamp bumped from "as of session 205" to "as of session 209");
log file is `logs/session-209.md`.
Session 213 was this lane (post-ship verification pass — confirmed
5503 / 0 clean baseline; Δ+10 from session 209 entirely from sibling
lanes 210-code-review / 211-command-support / 212-data-type-support;
RPL programming substrate undisturbed; all RPL-bucket REVIEW.md
findings remain fully closed; no source or test change; status stamp
bumped from "as of session 209" to "as of session 213");
log file is `logs/session-213.md`.
Session 217 was this lane (post-ship verification pass — confirmed
5508 / 0 clean baseline; Δ+5 from session 213 entirely from sibling
lanes 214-unit-tests / 215-command-support / 216-data-type-support;
RPL programming substrate undisturbed; all RPL-bucket REVIEW.md
findings remain fully closed; no source or test change; status stamp
bumped from "as of session 213" to "as of session 217");
log file is `logs/session-217.md`.
Session 259 is this run (post-ship verification pass — confirmed
5621 / 0 clean baseline; Δ+30 from session 254 entirely from sibling
lanes 255–258 (code-review / unit-tests / command-support /
data-type-support passes; see individual lane logs for detail); RPL
programming substrate undisturbed; all RPL-bucket REVIEW.md findings
remain fully closed; no source or test change; status stamp bumped
from "as of session 254" to "as of session 259");
log file is `logs/session-259.md`.
Session 254 was this lane (post-ship verification pass — confirmed
5591 / 0 clean baseline; Δ+50 from session 241 entirely from sibling
lanes 242–253 (data-type / command-support / unit-tests /
code-review passes; see individual lane logs for detail); RPL
programming substrate undisturbed; all RPL-bucket REVIEW.md findings
remain fully closed; no source or test change; status stamp bumped
from "as of session 249" to "as of session 254");
log file is `logs/session-254.md`.
Session 249 was this lane (post-ship verification pass — confirmed
5568 / 0 clean baseline; Δ+8 from session 245 entirely from sibling
lane 248-data-type-support (UTPC/UTPT List+Tagged widening via
`_utpcScalar` / `_utptScalar` + `_withTaggedBinary` /
`_withListBinary` wrappers; +8 assertions); RPL programming substrate
undisturbed; all RPL-bucket REVIEW.md findings remain fully closed;
no source or test change; status stamp bumped from "as of session
245" to "as of session 249");
log file is `logs/session-249.md`.
Session 245 was this lane (post-ship verification pass — confirmed
5560 / 0 clean baseline; Δ+19 from session 241 entirely from sibling
lane 244-data-type-support (ERF/ERFC/BETA/UTPC/UTPF/UTPT Z+L/V/M
cell audit; +19 pin assertions); RPL programming substrate
undisturbed; all RPL-bucket REVIEW.md findings remain fully closed;
no source or test change; status stamp bumped from "as of session
241" to "as of session 245");
log file is `logs/session-245.md`.
Session 241 was this lane (post-ship verification pass — confirmed
5541 / 0 clean baseline; Δ+16 from session 237 entirely from sibling
lane 240-data-type-support (240 added 16 test assertions: Q-cell
audit for stat-dist family GAMMA/LNGAMMA/ERF/ERFC/BETA/UTPC/UTPF/
UTPT/HEAVISIDE/DIRAC and combinatorial family COMB/PERM/IQUOT/
IREMAINDER/XROOT); RPL programming substrate undisturbed; all
RPL-bucket REVIEW.md findings remain fully closed; no source or test
change; status stamp bumped from "as of session 237" to "as of
session 241");
log file is `logs/session-241.md`.
Session 237 was this lane (post-ship verification pass — confirmed
5525 / 0 clean baseline; Δ+6 from session 232 entirely from sibling
lane 236-data-type-support (236 added 6 test assertions: Q-cell
audit for LNP1 / EXPM / TRUNC / ZETA / LAMBERT / PSI); RPL
programming substrate undisturbed; all RPL-bucket REVIEW.md findings
remain fully closed; no source or test change; status stamp bumped
from "as of session 232" to "as of session 237");
log file is `logs/session-237.md`.
Session 232 was this lane (post-ship verification pass — confirmed
5519 / 0 clean baseline; Δ+8 from session 227 entirely from sibling
lanes 230-command-support / 231-data-type-support (231 added 8 test
assertions: CONJ/RE/IM Rational widening acceptance pins + Q-cell
audit cluster for ARG / % / %T / %CH / GCD / LCM); RPL programming
substrate undisturbed; all RPL-bucket REVIEW.md findings remain fully
closed; no source or test change; status stamp bumped from "as of
session 227" to "as of session 232");
log file is `logs/session-232.md`.
Session 227 was this lane (post-ship verification pass — confirmed
5511 / 0 clean baseline; Δ+3 from session 222 entirely from sibling
lanes 223-unit-tests / 224-code-review / 225-command-support /
226-data-type-support (226 added 3 test assertions: CONJ/RE/IM
Rational rejection pins); RPL programming substrate undisturbed;
all RPL-bucket REVIEW.md findings remain fully closed; no source
or test change; status stamp bumped from "as of session 222"
to "as of session 227");
log file is `logs/session-227.md`.
Session 222 was this lane (post-ship verification pass — confirmed
5508 / 0 clean baseline; Δ+0 from session 217 entirely from sibling
lanes 218-unit-tests / 219-code-review / 220-command-support /
221-data-type-support (all doc-only); RPL programming substrate
undisturbed; all RPL-bucket REVIEW.md findings remain fully closed;
no source or test change; status stamp bumped from "as of session
217" to "as of session 222");
log file is `logs/session-222.md`.

(Footnote — sessions 074 / 078 / 088 / 106 / 116 / 121 / 126 / 131
/ 141 / 146 / 151 / 155 / 159 / 163 / 167 used the historical "is
this run" wording in their authoring session; that label has since
been demoted to plain past tense as the lane runs forward.
Demotion to plain past tense for sessions 121 / 126 / 131 / 136
was bundled into session 141 per R-005; demotion of session 141's
own `(this run)` heading was bundled into session 146; demotion
of session 146's own `(this run)` heading was bundled into
session 151; demotion of session 151's own `(this run)` heading
was bundled into session 155; demotion of session 155's own
`(this run)` heading was bundled into session 159; demotion of
session 159's own `(this run)` heading was bundled into session
163; demotion of session 163's own `(this run)` heading was
bundled into session 167; demotion of session 167's own
`(this run)` wording in the Session log pointer prose was
bundled into session 197 as part of the five-session backfill
(172 / 180 / 184 / 188 / 192); demotion of session 197's own
`(this run)` wording in the Session log pointer prose was
bundled into session 201; demotion of session 201's own
`(this run)` wording in the Session log pointer prose was
bundled into session 205; demotion of session 205's own
`(this run)` wording in the Session log pointer prose was
bundled into session 209; demotion of session 209's own
`(this run)` wording in the Session log pointer prose was
bundled into session 213; demotion of session 213's own
`(this run)` wording in the Session log pointer prose was
bundled into session 217; demotion of session 217's own
`(this run)` wording in the Session log pointer prose was
bundled into session 222; demotion of session 222's own
`(this run)` wording in the Session log pointer prose was
bundled into session 227.  Sessions 172 / 180 / 184 / 188 /
192 / 241 / 245 / 249 never carried a `(this run)` marker in the
Session log pointer prose — they were verification-only or
audit-only runs that did not extend this prose section.  This is
the recurring R-005 drift pattern — every substantive
rpl-programming-lane run that adds a new `(this run)` marker must
also demote its predecessor; the recurrence is by design, the
demote is the ship-discipline check.)
