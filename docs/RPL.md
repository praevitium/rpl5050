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

## Current implementation status (as of session 083)


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
- Status: **pilot landed (session 074); widened session 083 —
  multi-slot halted LIFO + `RUN`.** `HALT` / `CONT` / `KILL` / `RUN`
  work for programs suspended at the *top level of a Program body* —
  depth 0 in `evalRange`, no compiled-local frames active. The
  general-case RunState refactor is still open (queue item 1).
- HP50 ops in this family:
  - `HALT` — ✓ **session 074 pilot**. Inside a top-level program body:
    pushes `{ tokens, ip: i+1, length }` onto the `state.haltedStack`
    LIFO (session 083) and throws `RPLHalt`. Inside control flow / `→`
    body: raises `HALT: cannot suspend inside control structure or →
    (pilot)`. Called bare outside a running program: raises `HALT: not
    inside a running program`. `RPLHalt` is **not** an `RPLError`
    subclass, so `IFERR` cannot trap it.
  - `CONT` — ✓ **session 074 pilot, session 083 LIFO-aware**. Pops the
    TOP of `state.haltedStack` (the most-recent suspension) before
    resuming so a fresh HALT can push a new slot cleanly. Older halts
    remain on the stack to be CONT'd next. Raises `No halted program`
    when the LIFO is empty.
  - `KILL` — ✓ **session 074 pilot, session 083 LIFO-aware**. Pops ONE
    slot off the halted LIFO without resuming. Valid on an empty stack
    (matches AUR p.2-140 "terminates any currently-halted program, or
    does nothing"). Users who want to drain every suspension can
    `KILL` repeatedly or rely on `resetHome`.
  - `RUN` — ✓ **session 083 new**. AUR p.2-177 resume op. Without DBUG
    active, behaves identically to `CONT` (same resume semantics, same
    error when the halted LIFO is empty). DBUG-aware branching will
    land with the DBUG substrate (queue item 2).
  - `ABORT` — ✓ green (session 067). Unwinds the current evaluation
    via `RPLAbort`; not catchable by IFERR.
  - `SST` / `SST↓` — **not started.** Needs the RunState refactor
    below.
  - `DBUG` — **not started.** Also blocked on RunState.
- Pilot limitations (to lift in the full RunState work):
  - **[LIFTED session 083]** ~~Single-slot `state.halted`~~ — now a
    LIFO stack in `state.haltedStack`, with `state.halted` aliased to
    the top for back-compat. `haltedDepth()` exposed for tests.
  - HALT still rejects from inside `IF` / `FOR` / `WHILE` / `→` / any
    nested structural scope — the `ip` to resume wouldn't be
    meaningful without reconstructing the structural context.
  - No serialisation across `persist.js`; a refresh drops the halted
    LIFO (`clearAllHalted` fires on resetHome).
- First-principles note for the full refactor: `evalRange` still has
  to become an iterator / generator / explicit-state step fn to
  support SST and nested HALT. The RunState class plan in queue
  item 1 is still the design we're aiming at. Multi-slot halted is
  a first sub-component: each RunState carries its own suspension
  record, and the halted LIFO becomes the natural parent-link stack.

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

## Session 083 (this run) — what shipped

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
   frames). Session 083 lifted one pilot limitation — the halted LIFO
   is now multi-slot. Lifting the remaining structural-scope
   limitation requires the explicit-state driver we've been punting on:
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
     5. **[shipped session 083]** Multi-slot halted LIFO
        (`state.haltedStack`). When RunState lands, each RunState
        carries its own suspension record and the halted LIFO
        becomes the natural parent-link stack.
     6. Persistence hook so a page refresh can survive a halted
        program (wire through `persist.js`).
   Until the structural-scope piece lands, HALT inside IF/WHILE/→
   still rejects with the pilot-limit RPLError — the current
   `evalRange` simply can't capture the right `ip` for a resume
   inside a control construct.

2. **`SST` / `SST↓` / `DBUG`** — still blocked on the RunState
   refactor above. `RUN` shipped as a CONT alias in session 083 so
   at least the keyword gap is closed; full DBUG-aware resume is
   the piece remaining.

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
landed on disk with matching log numbers.
