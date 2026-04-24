# RPL.md — RPL Programming Support (task lane notes)

**Scope reminder.** This file tracks the User-RPL-as-a-language lane only:
parser `« … »`, evaluator, compiled local environments, structured control
flow, the suspended-execution substrate (HALT/CONT/KILL/ABORT/SST/DBUG/RUN),
program decomposition / composition, program persistence round-tripping.
Out of scope: arithmetic / CAS / unit / matrix / plot / string ops
(those belong to `rpl5050-command-support`), type widening
(`rpl5050-data-types`), UI (`rpl5050-ui-development`), the test harness
(`rpl5050-tests`).

This file is the authoritative lane-local notes file. Read it at the start
of every run; update it at the end of every run with what shipped, what's
open, and the next-session queue.

---

## Current implementation status (as of session 074)

### Program value — parser & round-trip
- Parser: `<<` / `>>` (ASCII) and `«` / `»` (Unicode) both tokenize to
  the same `delim:<<`/`>>` pair; body is a flat token list. See
  `src/rpl/parser.js` `parseProgram`.
- Persistence: Program round-trips through `persist.js` — verified green
  by `tests/test-persist.mjs`.
- Formatter: programs render `« tok tok … »` via `src/rpl/formatter.js`.
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
- Symbolic lift on most arithmetic ops via the `_isSymOperand` /
  `_toAst` pair — programs carrying bare `Name` tokens will auto-lift
  when the operand reaches a numeric op.

### Structured control flow
| Construct | Status | Implementation |
|-----------|--------|----------------|
| `IF…THEN…ELSE…END`           | ✓ green | `runIf` in ops.js |
| `IFERR…THEN…ELSE…END`         | ✓ green | `runIfErr` (last-error slot, save/restore of outer) |
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
- Status: **pilot landed (session 074).** `HALT` / `CONT` / `KILL` work
  for programs suspended at the *top level of a Program body* — depth
  0 in `evalRange`, no compiled-local frames active. The general-case
  RunState refactor is still open (see queue item 1).
- HP50 ops in this family:
  - `HALT` — ✓ **session 074 pilot**. Inside a top-level program body:
    captures `{ tokens, ip: i+1, length }` in `state.halted` and throws
    `RPLHalt`. Inside control flow / `→` body: raises
    `HALT: cannot suspend inside control structure or → (pilot)`.
    Called bare outside a running program: raises
    `HALT: not inside a running program`. `RPLHalt` is **not** an
    `RPLError` subclass, so `IFERR` cannot trap it.
  - `CONT` — ✓ **session 074 pilot**. Resumes `state.halted.tokens`
    from `state.halted.ip`. Clears the slot before resuming so a fresh
    HALT can re-populate it. Raises `No halted program` if the slot
    is empty.
  - `KILL` — ✓ **session 074 pilot**. No-op that clears `state.halted`.
    Valid even when the slot is empty (matches AUR p.2-140 "terminates
    any currently-halted program, or does nothing").
  - `ABORT` — ✓ green (session 067). Unwinds the current evaluation
    via `RPLAbort`; not catchable by IFERR.
  - `SST` / `SST↓` — **not started.** Needs the RunState refactor
    below.
  - `DBUG` — **not started.** Also blocked on RunState.
  - `RUN` — **not started.** AUR sometimes treats RUN as a synonym
    for CONT; breakpoint semantics need care.
- Pilot limitations (to lift in the full RunState work):
  - Single-slot `state.halted` (no stack of halted programs).
  - HALT rejects from inside `IF` / `FOR` / `WHILE` / `→` / any nested
    structural scope — the `ip` to resume wouldn't be meaningful
    without reconstructing the structural context.
  - No serialisation across `persist.js`; a refresh drops the halted
    slot (clearHalted fires on resetHome).
- First-principles note for the full refactor: `evalRange` still has
  to become an iterator / generator / explicit-state step fn to
  support SST and nested HALT. The RunState class plan in queue
  item 1 is still the design we're aiming at.

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

## Session 074 (this run) — what shipped

1. **HALT / CONT / KILL pilot** — suspended-execution substrate at the
   top-level-program-body scope. New class `RPLHalt` in
   `src/rpl/stack.js` (sibling of `RPLAbort`, **not** an `RPLError`
   subclass so `IFERR` cannot trap it). New `state.halted` slot +
   `setHalted` / `getHalted` / `clearHalted` in `src/rpl/state.js`.
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
   `→ a b 'algebraic-body'`. Evaluator hook `runArrow` in `src/rpl/ops.js`:
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

### High priority (substrate — continue the RunState work)
1. **Full RunState refactor for HALT / CONT inside structured flow.**
   Session 074 shipped the top-level pilot (HALT at depth 0, no local
   frames). Lifting the pilot limitation requires the explicit-state
   driver we've been punting on:
     1. Introduce `RunState` in `src/rpl/ops.js`: fields `tokens`,
        `ip`, `localFrames`, `parentRunState`, `suspended`.
     2. Refactor `evalRange` + `runControl` / `runIf` / `runFor` /
        `runWhile` / `runDo` / `runCase` / `runArrow` to thread a
        RunState instead of using JS recursion. Nested call ≡
        `parentRunState` link, not a JS call frame.
     3. Replace `_localFrames` with per-RunState `localFrames` so
        HALT inside `→` captures the frame correctly.
     4. Upgrade `RPLHalt` → carry the captured RunState; `CONT`
        restores the full chain instead of re-entering `evalRange`.
     5. Multi-slot halted stack in `state.halted` (HP50 convention).
     6. Persistence hook so a page refresh can survive a halted
        program (wire through `persist.js`).
   Until this lands, the pilot's pilot-limit rejection stays — which
   is fine because the current `evalRange` simply can't capture the
   right `ip` for a resume inside a control construct.

2. **`SST` / `SST↓` / `DBUG`** — blocked on item 1.

### Medium priority
3. **`→LIST` / `LIST→` parity pass on Program decomposition.** Now
   that `→PRG`, OBJ→ on Program, and OBJ→ on Symbolic all work, the
   symmetry with `→LIST` / `LIST→` on lists is close but not perfect.
   Audit `→ARRY` too.

4. **Auto-close of unterminated `IFERR`.** Analogous to the CASE
   auto-close that shipped in 074; right now `IFERR…THEN…` without an
   `END` still throws. Cheap follow-up.

5. **`CONT` across a `resetHome`.** Currently `resetHome` clears the
   halted slot (correct), but there's no UI signal to tell the user
   their halted program was dropped. Medium priority once we have a
   status-line affordance.

### Low priority / opportunistic
6. **CASE auto-close across a deeply nested IF whose own END is also
   missing.** Today's auto-close only reaches the outermost program
   body; a truncated CASE inside an IF whose END is missing still
   errors because `scanAtDepth0`'s _skipPastCaseEnd returns
   `toks.length` and the outer IF can't find its matching END.
   Nice-to-have; no known user report.

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

- Parser: `src/rpl/parser.js` (`parseProgram`, `tokenize`).
- Evaluator: `src/rpl/ops.js` — search for `evalRange`, `runControl`,
  the `run…` family, and `_evalValue`.
- Types: `src/rpl/types.js` — `Program`, `Name`, `Symbolic`, `Tagged`.
- Stack: `src/rpl/stack.js` — `save` / `restore` for EVAL atomicity.
- Tests: `tests/test-control-flow.mjs` (primary), `tests/test-eval.mjs`
  (EVAL dispatch), `tests/test-variables.mjs` (STO/RCL/PURGE + locals
  when those land), `tests/test-reflection.mjs` (OBJ→ / →PRG).

## Session log pointer

Each run leaves a numbered log in `logs/session-NNN.md` with a
**User-reachable demo** section. Session 067 was the first lane-specific
entry after the bootstrap; session 068 went to the data-types lane
(Tagged transparency widening); session 069 was this lane (compiled
locals + DECOMP + OBJ→ on Symbolic); sessions 070–073 went to sibling
lanes; session 074 is this run (HALT/CONT/KILL pilot + CASE auto-close
+ DECOMP round-trip + closure pin).

Note on cohort labels: in-file assertion names from this run carry the
`session073:` prefix (chosen when the work was drafted alongside the
sibling lane's 073 log). The session log file itself is `session-074.md`
because 073 was already claimed by the sibling lane before this run
committed.
