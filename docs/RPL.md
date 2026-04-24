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

## Current implementation status (as of session 067)

### Program value — parser & round-trip
- Parser: `<<` / `>>` (ASCII) and `«` / `»` (Unicode) both tokenize to
  the same `delim:<<`/`>>` pair; body is a flat token list. See
  `src/rpl/parser.js` `parseProgram`.
- Persistence: Program round-trips through `persist.js` — verified green
  by `tests/test-persist.mjs`.
- Formatter: programs render `« tok tok … »` via `src/rpl/formatter.js`.
- DECOMP / →STR on a Program: string form is produced by the formatter;
  a dedicated `DECOMP` op is NOT registered yet — deferred.
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
| `CASE…THEN…END … END`         | **session 067: new** | `runCase` |
| `« … »` nested programs       | ✓ (transparent; Programs push themselves) |

### Compiled local environments
- Status: **not implemented.**
- HP50 syntax: `→ a b c « ... body ... »` pops 3 from the stack into
  locals `a`, `b`, `c` visible only to `body`. Multiple forms (boxed
  program, algebraic, inline) exist per AUR §21.
- Current workaround: programs use `'X' STO` / `'X' PURGE`. Global
  (not lexical) — not a substitute.
- Next in queue (see below).

### Suspended-execution substrate
- Status: **not started.** `evalRange` is a straight-through recursive
  driver; there's no pause / resume / step state machine yet.
- HP50 ops in this family (to be implemented across multiple sessions):
  - `HALT` — suspend current program, return control to user mode.
  - `CONT` — resume the halted program where it left off.
  - `KILL` — terminate every halted program on the stack.
  - `ABORT` — **session 067: new** (partial). Unwinds the current
    evaluation; distinct from RPLError so IFERR cannot trap it.
  - `SST` / `SST↓` — step / step-in into the next token.
  - `DBUG` — start the debugger at the top of a program.
  - `RUN` — resume halted execution (AUR sometimes treats RUN as a
    synonym for CONT; there are subtle breakpoint semantics we'll need
    to replicate).
- First-principles note for when we tackle HALT/CONT: `evalRange` has
  to become an iterator / generator / explicit-state step fn so we can
  pause mid-token and later resume. A mid-term plan is to refactor
  `evalRange` to drive a "RunState" object (pointer + token list + local
  env stack + nested-call stack) instead of using JS recursion, then
  HALT just throws a SuspendSignal carrying the RunState, CONT picks it
  up.

### Program decomposition / composition
- `OBJ→` on Program: **session 067: new**. Pushes each token then an
  Integer count. Inverse op is `→PRG`.
- `→PRG`: **session 067: new**. Pops a count N, gathers N items into a
  fresh Program.
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

## Session 067 (this run) — what shipped

1. **`docs/RPL.md` bootstrapped.** First run of this lane.
2. **`CASE / THEN / END` control flow** — `runCase` implemented in
   `src/rpl/ops.js`. Added `CASE` to `CF_OPENERS`, plus a
   `_skipPastCaseEnd` helper so the generic `scanAtDepth0` can step
   past a nested CASE in one jump instead of mis-matching inner ENDs.
   Test coverage in `tests/test-control-flow.mjs` (10 new assertions).
3. **`OBJ→` on `Program`** + **`→PRG`** (+ `->PRG` ASCII alias) —
   extended the existing OBJ→ registration; added a `→PRG` composer
   that pops a count and that many items, pushing a fresh `Program`.
   Added `Program` to the top-of-file type import block in `ops.js`.
   Tests in `tests/test-reflection.mjs` (15 new assertions).
4. **`ABORT`** — new `RPLAbort` signal class in `src/rpl/stack.js`
   (subclass of `Error`, **not** `RPLError`, so `IFERR` cannot catch
   it). `ABORT` op throws `RPLAbort('Abort')`; unwinds EVAL through
   all nested control frames. EVAL's snapshot-restore catch now lets
   `RPLAbort` pass through **without restoring** — HP50 ABORT preserves
   stack state at the point of the abort rather than rewinding to
   pre-EVAL. Tests in `tests/test-control-flow.mjs` (6 new assertions).

Totals: 31 new assertions across two split test files. Full suite
`test-all.mjs` at 3198 passing / 0 failing. `test-persist.mjs` unchanged
(32 passing).

---

## Next-session queue

### High priority (continue substrate work)
1. **Compiled local environments — `→ a b « body »` form.**
   Parser already treats `→` as a bare ident. Evaluation should:
     1. Recognise the opener token when it's a bare `Name` with id `→`.
     2. Collect consecutive bare-name tokens as local-variable names,
        stop at the `« … »` body.
     3. Pop as many values from the stack as there are locals (right-
        most local gets level 1; matches HP50).
     4. Push a local-binding frame onto a new env stack; lookup in
        `evalToken` and `_evalValue` checks the local frame before the
        global var store.
     5. On body completion (or throw), pop the frame.
   Test matrix: single local, multiple locals, nested `→` frames
   shadowing outer, error path leaves frame popped, locals invisible
   after body ends.

2. **HALT / CONT / KILL scaffold** — the RunState refactor for
   `evalRange`. Start by converting just the IF handler to drive off a
   RunState so the test pattern is clear before touching all openers.

3. **`DECOMP` op** — program → string (use formatter output). Pair
   with `STR→` round-trip test.

### Medium priority
4. **OBJ→ on Symbolic** — currently throws `Bad argument type`.
   Should push the AST-root function name and operands, matching AUR.
   Adjacent to the →PRG work just shipped, but not urgent.

5. **`SST` / `DBUG` scaffolding** — require the RunState refactor, so
   blocked on item 2.

### Low priority / opportunistic
6. **Auto-close of unterminated `CASE`** — parser-side auto-close
   already works on lists / vectors / programs; decide whether CASE
   should auto-close too. Probably yes, to match the convenience
   pattern — but wait for a user report before committing.

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
**User-reachable demo** section. Session 067 is the first lane-specific
entry after the bootstrap.
