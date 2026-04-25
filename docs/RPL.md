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

## Current implementation status (as of session 121)


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
- Symbolic lift on most arithmetic ops via the `_isSymOperand` /
  `_toAst` pair — programs carrying bare `Name` tokens will auto-lift
  when the operand reaches a numeric op.

### Structured control flow
| Construct | Status | Implementation |
|-----------|--------|----------------|
| `IF…THEN…ELSE…END`           | ✓ green (**session 083: auto-close on missing END**) | `runIf` in ops.js |
| `IFERR…THEN…ELSE…END`         | ✓ green (**session 078: auto-close on missing END**) | `runIfErr` (last-error slot, save/restore of outer) |
| `WHILE…REPEAT…END`            | ✓ green | `runWhile` |
| `DO…UNTIL…END`                | ✓ green | `runDo` |
| `START…NEXT`/`…STEP`          | ✓ green | `runStart` (Integer-mode preserving) |
| `FOR…NEXT`/`…STEP`            | ✓ green | `runFor` (bound name save/restore) |
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
- Remaining limitations (session 121):
  - HALT inside a sync-path call (MAP / SEQ / DOLIST / DOSUBS / STREAM
    bodies, plus `runArrow`'s Symbolic body) still rejects.  Session 111
    refined the error text: the message is now
    `HALT: cannot suspend inside <caller>` — where `<caller>` is
    `MAP program`, `SEQ expression`, `DOLIST program`, `DOSUBS program`,
    `STREAM program`, or the default `a sub-program call`.
    **Session 121 lifted IFT and IFTE off this list** — both now have a
    program-body intercept in `evalRange` that lifts HALT/PROMPT through
    `runIft` / `runIfte` (generator helpers driving `_evalValueGen`).
    The Name-dispatch fallback (`'IFT' EVAL`, Tagged-wrapped Name(IFT))
    still goes through `_driveGen` with the session-111 caller labels, so
    the rejection message is unchanged on that narrow path.
    Low urgency for the rest — the workaround is `IF … THEN … END`
    (structural, yields).  Session 111 threads the caller label through
    `_evalValueSync` into `_driveGen`; internal recursion on
    Name / Tagged wrappers forwards the original label so the
    outermost originator's name survives the recursion.
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
- `DECOMP` on Program: **session 069: new**. Pushes the formatter
  source-string (`« … »` form). Pair with `STR→` for round-trip —
  **session 074: DECOMP→STR→ round-trip pinned** by assertions in
  `tests/test-reflection.mjs` (9 new), including a DECOMP→STR→→DECOMP
  canonical-form idempotence check.
- `NEWOB` — supports Program via the existing `_newObCopy` switch
  (frozen tokens array copied).

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

## Session 121 (this run) — what shipped

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

8. **HALT lift through MAP / SEQ / DOLIST / DOSUBS / STREAM
   bodies (next remaining sync-path callers).**  Same shape as
   session 121's IFT/IFTE work: each op currently drives
   `_evalValueSync` with a session-111 caller label
   (`MAP program`, `SEQ expression`, etc.).  Lifting any of these
   would require either an `evalRange` intercept (only viable when
   the op is reached as a Name token in a program body) or a
   structural rework of the op so it `yield*`s its body call
   directly.  IFT/IFTE were the simplest cases — single body, no
   iteration loop — so they shipped first.  MAP-family lift needs
   thinking about per-iteration yield semantics (what does HALT
   inside iteration 3 of MAP over a 10-element list mean? CONT
   resumes mid-iteration — does the partially-mapped result
   survive?).  Defer to a future session that scopes those
   semantics carefully.

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
lanes; session 078 is this run (HALT/CONT flake-hardening + IFERR
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
is this run (EVAL handler driven through `_evalValueGen` so HALT
lifts through Tagged-wrapped Programs and Name-on-stack EVALs;
DBUG widened to peel Tagged in its argument-type guard;
`runArrow` Symbolic body wired with the `'→ algebraic body'`
caller label); test-file prefix is `session116:` and the log file
is `logs/session-116.md`.
