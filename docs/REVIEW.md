# REVIEW.md — RPL5050 code-review lane running ledger

**Scope.** This file is the authoritative ledger for the
`rpl5050-code-review` scheduled-task lane. It records audit findings
across the whole repo, classified into the six lane buckets
(`User Interface`, `Commands`, `Data Types`, `RPL`, `Unit Tests`,
`Other`), so the sibling implementer lanes can pick them up as a group.

**Last updated.** Session 089 (2026-04-23).  Third review-lane run.
Prior baseline = session 085.  Between sessions 085 and 089 the
sibling lanes shipped: 086 (command-support — ZETA, LAMBERT, XNUM,
XQ; +25 assertions), 087 (data-type-support — Program/Directory ==,
BinInt rounders, String lex comparators; +10 assertions), 088
(rpl-programming — generator-based evalRange, structural HALT fully
lifted, SIZE on Program, R-001 + X-006 comment/import fixes; +40
assertions).  Total Δ+79 assertions since session 085.  Two prior
findings confirmed resolved by session 088; five new findings filed
this run.

| Bucket          | Sibling lane that owns the fix            |
|-----------------|-------------------------------------------|
| User Interface  | `rpl5050-ui-development`                  |
| Commands        | `rpl5050-command-support`                 |
| Data Types      | `rpl5050-data-type-support`               |
| RPL             | `rpl5050-rpl-programming`                 |
| Unit Tests      | `rpl5050-unit-tests`                      |
| Other           | any lane — hygiene items, no behavior     |

**Ledger policy.** Each finding below is promoted to
`[resolved - session NNN]` once the owning lane ships the fix and
logs it.  Entries are NEVER deleted — they become the audit trail.
A finding that turned out to be a phantom on second-read is marked
`[retracted - session NNN]` with a one-line reason.

**Baseline (session 089).** At entry `node tests/test-all.mjs` =
**3951 passing / 0 failing** (up from 3872 at session 085 exit —
Δ+79: session 086 +25 command-support, 087 +10 data-type-support
concurrent with 086, 088 +40 rpl-programming).
`node tests/test-persist.mjs` = **34 passing / 0 failing** (stable).
`node tests/sanity.mjs` = **22 passing / 0 failing in ~5 ms**
(stable).  `node --check` N/A this run — only edit is to
`docs/REVIEW.md`, which isn't JS.

**This run's own edits.** Doc-stamp hygiene only: `docs/REVIEW.md`
Last-updated stamp bumped to session 089; baseline block updated;
findings re-aged; R-001 and X-006 promoted to resolved; five new
findings filed (C-003, C-004, C-005, T-001, R-002).  No sibling-lane
files touched.  No RPL op behavior changed, no types widened, no
tests deleted, no interpreter touched, no registrations added or
removed.

**Lock.** Held `utils/@locks/session089-code-review.json` throughout,
scope = `docs/REVIEW.md` and `logs/`.  All three sibling locks from
sessions 086/087/088 were fully released at this run's entry.
Lock released at end of run.

---

## Legend

| Symbol / field | Meaning |
|----------------|---------|
| **Classification** | One of the six buckets above. |
| **Where**      | File + line numbers (or file-scope if file-wide). |
| **What**       | One-line statement of the observed defect. |
| **Why**        | Why this matters — user-visible impact or maintenance hazard. |
| **Fix**        | Minimum change that resolves the finding. |
| **Confidence** | `high` — verified by grep + re-read; `medium` — plausible but needs owner judgment; `low` — style / could-be-deliberate. |
| **Age**        | `new` / `N runs` (number of review-lane runs since first filed). |
| **Status**     | `open` / `resolved session-NNN` / `retracted session-NNN` / `partial`. |

---

## Findings — Other (doc / comment hygiene, cross-lane)

### O-001  Stale lane-task-id `rpl5050-data-types` (should be `rpl5050-data-type-support`)

- **Classification.** Other.
- **Where.** `docs/RPL.md:9`, `docs/TESTS.md:34,131,177,327`.
- **What.** Five sites referenced the lane task id as
  `rpl5050-data-types`, but the charter-canonical id is
  `rpl5050-data-type-support`.
- **Why.** Grep-ability of lane notes.
- **Fix.** Mechanical string replace (shipped session 080).
- **Confidence.** high.
- **Age.** 2 runs. **Status.** resolved session-080.

### O-002  Stale lane-task-id `rpl5050-tests` (should be `rpl5050-unit-tests`)

- **Classification.** Other.
- **Where.** `docs/RPL.md:10`.
- **What.** Scope-reminder paragraph in `RPL.md` named the test
  lane as `rpl5050-tests`; canonical id is `rpl5050-unit-tests`.
- **Why.** Same reason as O-001.
- **Fix.** One-word replace.  Shipped session 080.
- **Confidence.** high.
- **Age.** 2 runs. **Status.** resolved session-080.

### O-003  Stale lane-task-id `hp50-type-support` (very old name)

- **Classification.** Other.
- **Where.** `docs/DATA_TYPES.md:3`.
- **What.** DATA_TYPES.md front-matter named the owning lane as
  `hp50-type-support` — a pre-rename string.
- **Why.** Docs anachronism; misleading to new readers.
- **Fix.** Replaced with `rpl5050-data-type-support`.  Shipped
  session 080.
- **Confidence.** high.
- **Age.** 2 runs. **Status.** resolved session-080.

### O-004  Stale reference to nonexistent `docs/COMMANDS_INVENTORY.md`

- **Classification.** Other.
- **Where.** `docs/DATA_TYPES.md:5`, `docs/@!MY_NOTES.md:55`,
  `src/ui/side-panel.js:13,44`.
- **What.** Four sites told the reader to consult
  `docs/COMMANDS_INVENTORY.md`, which doesn't exist in the tree.
- **Why.** Broken link; `docs/@!MY_NOTES.md:55` is an uncompletable
  standing instruction to "keep `docs/COMMANDS_INVENTORY.md`
  updated".
- **Fix.** Replace with `docs/COMMANDS.md`; the `@!MY_NOTES.md`
  entry is the command lane's notebook and can't be touched by
  review lane.
- **Confidence.** high — `ls` confirms file absent.
- **Age.** 3 runs. **Status.** partial — three sites resolved
  session-080; `docs/@!MY_NOTES.md:55` still open, lane =
  `rpl5050-command-support`.  Verified session 089: grep for
  `COMMANDS_INVENTORY` still hits only that one `@!MY_NOTES.md`
  line outside of REVIEW.md itself.

### O-005  `index.html` comments reference nonexistent `js/` directory

- **Classification.** User Interface (comment-only).
- **Where.** `index.html:45,50,54`.
- **What.** Three HTML comments said `rendered by js/keyboard.js`;
  real path is `src/ui/keyboard.js`.
- **Why.** Broken doc trail for new readers.
- **Fix.** Replaced three occurrences.  Shipped session 080.
- **Confidence.** high.
- **Age.** 2 runs. **Status.** resolved session-080.

### O-006  `docs/DATA_TYPES.md` "Last updated" stamp drift

- **Classification.** Other.
- **Where.** `docs/DATA_TYPES.md:8`.
- **What.** At session 080 the stamp read "Session 076" while the
  last substantive change was session 074.
- **Why.** Stale "verified through session N" misleads readers.
- **Fix.** Session 082 (data-type lane) rewrote the stamp as
  `Session 082 (2026-04-23) — last substantive change. Sessions
  075 / 076 / 078 / 079 / 080 / 081 did not touch the type-
  acceptance matrix itself (they were unit-tests / review /
  command-support work).` — exactly the explanatory paragraph
  suggested in the session-080 filing.
- **Confidence.** high — verified session 085.
- **Age.** 2 runs. **Status.** resolved session-082.

---

## Findings — Commands

### C-003  `COMMANDS.md` HALT row still describes the old pilot limitation

- **Classification.** Commands.
- **Where.** `docs/COMMANDS.md:235`.
- **What.** The HALT / CONT / KILL row Notes field still reads:
  "Session 074 pilot — top-level program bodies only; HALT inside
  control flow or `→` raises a pilot-limit error."  Session 088
  converted `evalRange` and all `run*` helpers to JS generators,
  fully lifting the pilot restriction.  HALT now works at any
  structural depth (inside `FOR`, `IF`, `WHILE`, `DO`, `IFERR`,
  `→`).  The only remaining limit — HALT inside a *named
  sub-program reached via variable lookup* — is different from the
  old pilot and is documented correctly in `docs/RPL.md:79-81`.
  The COMMANDS.md row has no mention of the session 088 change.
- **Why.** A reader consulting COMMANDS.md to check whether structural
  HALT is supported will conclude it isn't.  Actively misleading.
- **Fix.** Append to the HALT row Notes: "**Session 088:** generator-
  based `evalRange` — structural HALT fully lifted.  HALT now works
  at any depth inside `FOR`, `IF`, `WHILE`, `DO`, `IFERR`, `→`.
  Remaining limit: HALT inside a named sub-program called via
  variable lookup (see `docs/RPL.md`)."
- **Confidence.** high — grep confirmed, `docs/RPL.md:75-95` has the
  full account.
- **Age.** new. **Status.** open (lane = `rpl5050-command-support`).

### C-004  `COMMANDS.md` SIZE rows missing Program widening from session 088

- **Classification.** Commands.
- **Where.** `docs/COMMANDS.md:141` (Lists → SIZE), `:151`
  (Strings → SIZE).
- **What.** Both SIZE rows carry no Notes text.  Session 088 widened
  SIZE to accept Program objects, returning an Integer count of
  top-level tokens (`« 1 2 + » SIZE` → `3`; `« » SIZE` → `0`).
  Neither SIZE row mentions this widening.  `docs/RPL.md:180-183`
  and `tests/test-reflection.mjs` (5 session088-labelled assertions)
  confirm the behavior is shipped and tested.
- **Why.** A developer looking up SIZE coverage will miss the Program
  branch entirely; a future data-types run might re-add it and
  silently overwrite the existing implementation.
- **Fix.** Add a note to the Lists SIZE row (or add a new Program
  substrate row nearby): "Session 088 — SIZE on Program returns
  Integer(token count); shallow — nested sub-programs count as 1.
  Empty program → 0."
- **Confidence.** high — `grep -n 'isProgram' src/rpl/ops.js` at the
  SIZE register block confirms the branch; `docs/RPL.md:180`
  documents it; 5 test assertions exist.
- **Age.** new. **Status.** open (lane = `rpl5050-command-support`).

### C-005  `COMMANDS.md` Counts block and session log stale after sessions 087/088

- **Classification.** Commands.
- **Where.** `docs/COMMANDS.md:24` (Counts heading), `:310-328`
  (Session log block).
- **What.** Two related gaps:
  1. The Counts block heading reads "as of session 086 — 2026-04-23".
     Sessions 087 and 088 have both landed, but neither added a
     session-log entry or bumped the Counts heading.  The ✓ count
     (416) and `register()` grep count (447) are still numerically
     correct — 087 and 088 made type-widening and structural changes,
     not new ✗→✓ op flips — but the "as of" stamp is two sessions
     stale.
  2. The session log block has an entry for session 086 and then
     jumps to session 081; sessions 087 and 088 are absent entirely.
     (Session 087 did update the Notes columns for FLOOR/CEIL/IP/FP
     and comparator ops, and 088 added the generator note in the
     CONT area of COMMANDS.md via the HALT row — but neither session
     added a session-log entry at the bottom of the file.)
- **Why.** The session log is the per-file audit trail for "what
  changed when".  Missing entries make it impossible to grep-bisect
  when a type-widening or behavioral change landed.
- **Fix.**
  - Bump the Counts heading to "as of session 088 — 2026-04-23".
  - Add a session-log entry for session 087 (BinInt rounders +
    String lex comparators + Program/Directory ==; type-widenings
    only, no new ✓ rows, 0 count changes).
  - Add a session-log entry for session 088 (generator-based
    evalRange / structural HALT; SIZE on Program widening; 0
    count changes).
- **Confidence.** high — grep confirms no session 087/088 entries.
- **Age.** new. **Status.** open (lane = `rpl5050-command-support`).

### C-001  `MEM` listed as not-yet-supported but already ✓ shipped

- **Classification.** Commands.
- **Where.** `docs/COMMANDS.md` (pre-fix line numbers 272, 242).
- **What.** The "Not yet supported" table double-listed `MEM`
  alongside `TVARS`; `MEM` is shipped at `ops.js:7480`.
- **Why.** Counts-block integrity.
- **Fix.** Row split — `MEM` dropped from the not-yet-supported
  cluster, `TVARS` kept solo.  Shipped session 081.
- **Confidence.** high.
- **Age.** 2 runs. **Status.** resolved session-081.

### C-002  Ghost `RCWS (STWS/RCWS done)` row in "Not yet supported"

- **Classification.** Commands.
- **Where.** `docs/COMMANDS.md` (pre-fix line 275).
- **What.** A self-contradicting row `RCWS (STWS/RCWS done) | ✓` sat
  inside the not-yet-supported section while both STWS and RCWS
  were already shipped.
- **Why.** Counts-block integrity.
- **Fix.** Row deleted.  Shipped session 081.
- **Confidence.** high.
- **Age.** 2 runs. **Status.** resolved session-081.

---

## Findings — Data Types

_(No new Data Types findings this run beyond those tracked in
`docs/DATA_TYPES.md`'s own "future widening" cells.  O-006 closed
above.)_

---

## Findings — RPL

### R-002  `_driveGen` abandons a yielded generator without calling `gen.return()`

- **Classification.** RPL.
- **Where.** `src/rpl/ops.js:3300` (`_driveGen` function).
- **What.** `_driveGen` calls `gen.next()`; if the generator yields
  (HALT inside a sub-program call), it throws an RPLError without
  first calling `gen.return()` to close the generator.  Per the
  JS spec, a generator that is abandoned without `gen.return()` will
  not run its `finally` blocks until GC.  The relevant `finally`
  block is `_popLocalFrame()` inside `runArrow` — the compiled-local
  frame cleanup for `→` bodies.
  In practice this is **not a correctness bug**: the outer EVAL
  handler's `finally { _truncateLocalFrames(framesAtEntry) }` runs
  synchronously and restores `_localFrames` to its pre-EVAL depth
  before the abandoned generator object reaches GC.  The only
  observable effect is that the generator object itself lingers in
  memory until collected.  Verified by tracing: `_truncateLocalFrames`
  at `ops.js:3502-3523` covers the frame-depth invariant; `gen.return()`
  in the `_driveGen` throw path would be belt-and-suspenders.
- **Why.** Style hazard: a reader auditing resource cleanup will note
  the missing `gen.return()` and have to reason through the
  `_truncateLocalFrames` safety net to confirm there is no leak.
  The reasoning is non-trivial (it crosses function boundaries).
  Adding `gen.return()` before the throw would make the cleanup
  self-contained and obvious.
- **Fix.** In `_driveGen`, after detecting `!result.done`, call
  `try { gen.return(); } catch (_) {}` before the `throw`.
  One-line change; no test impact expected (tests exercise the
  throw path but don't observe GC timing).
- **Confidence.** low — not a correctness defect; style / defensive
  coding.  Owner judgment on whether it's worth the churn.
- **Age.** new. **Status.** open (lane = `rpl5050-rpl-programming`).

### R-001  `state.js` docstring claim "`clearAllHalted()` — Used by resetHome()" is false

- **Classification.** RPL.
- **Where.** `src/rpl/state.js:415`.
- **What.** The block-comment description of `clearAllHalted()` in
  the haltedStack-getters-legend comment (L410–L417) says
  `clearAllHalted()— drain the whole stack.  Used by resetHome().`
  But `resetHome()` at `src/rpl/state.js:749-755` inlines the drain
  as `state.halted = null; state.haltedStack.length = 0;` — it does
  NOT call `clearAllHalted()`.  Verified via `grep -nE
  '\bclearAllHalted\b' src/`: the function is defined at L438 and
  imported once at `ops.js:57`; no call site anywhere in `src/`.
  `tests/test-control-flow.mjs` is the only caller.
- **Why.** A "Used by X" claim is a grepping anchor.  Readers
  chasing why `clearAllHalted` exists will pull up resetHome,
  read it, and see the inlined form — then have to guess whether
  the comment is a stale future-tense claim, a description of
  intent, or an actual mistake.  The comment was written in
  session 083 alongside the LIFO refactor and the plan at that
  point was to call `clearAllHalted()` from resetHome; the final
  resetHome body instead inlines because resetHome needs a single
  terminal `_emit()` and `clearAllHalted()` also emits (double-
  emit would be wrong).
- **Fix.** Either:
  1. Change the comment to `Used by test-control-flow.mjs; the
     resetHome() helper inlines equivalent logic to keep a single
     _emit() call`; OR
  2. Actually have `resetHome()` call `clearAllHalted()` and
     suppress its `_emit()` via an internal flag.
  Preferred: (1) — comment-only, no behavior risk.  Not shipped
  this run because the file is the rpl-programming lane's home
  turf; review lane defers the change even though it's a one-
  line comment.
- **Confidence.** high — grep + re-read.
- **Age.** 2 runs. **Status.** resolved session-088 — comment updated
  to `Used by tests (test-control-flow.mjs); resetHome() inlines the
  equivalent drain directly so it can emit exactly once`.

---

## Findings — Unit Tests

### T-001  `docs/TESTS.md` coverage snapshot frozen at session 084

- **Classification.** Unit Tests.
- **Where.** `docs/TESTS.md:7` (Last-updated stamp), `:43`
  (Coverage snapshot heading), `:68-90` (per-file counts table).
- **What.** `docs/TESTS.md` Last-updated stamp reads "Session 084
  (2026-04-23)"; the per-file snapshot table shows 3872 total
  assertions.  The current suite is **3951 passing** — Δ+79 across
  sessions 086 (test-numerics: +25), 087 (test-types: +5,
  test-comparisons: +5, 1 soft-assert hardened), and 088
  (test-control-flow: +35 structural-HALT + 4 converted pilot
  expectations; test-reflection: +5 SIZE-on-Program).  The per-file
  numbers for `test-numerics.mjs` (660, up from 635),
  `test-comparisons.mjs` (73, up from 62), `test-types.mjs` (163,
  up from 153), `test-control-flow.mjs` (260, up from 217 session
  083 baseline), and `test-reflection.mjs` (178, up from 168 at
  launch) are all stale.
- **Why.** The snapshot is the unit-tests lane's authoritative
  "what's tested" reference.  New lanes consult it to gauge
  coverage gaps; a three-session-old snapshot systematically
  under-counts coverage, especially in control-flow and numerics
  which gained the most assertions.
- **Fix.** Re-run `node tests/test-all.mjs`, update the per-file
  table to current counts, bump Last-updated to session 089 (or
  whichever session the unit-tests lane next runs), and add a
  brief delta note explaining the jump (+79 from three sibling
  sessions).
- **Confidence.** high — live run this session = 3951; snapshot = 3872.
- **Age.** new. **Status.** open (lane = `rpl5050-unit-tests`).

---

## Findings — User Interface

### U-001  `src/ui/side-panel.js` header comment references nonexistent COMMANDS_INVENTORY.md

- **Classification.** User Interface.
- **Where.** `src/ui/side-panel.js:13,44`.
- **What.** The file's top comment promised alignment with
  `docs/COMMANDS_INVENTORY.md` (nonexistent).
- **Why.** Broken maintainer-promise link.
- **Fix.** Replaced both with `docs/COMMANDS.md`.  Shipped
  session 080.
- **Confidence.** high.
- **Age.** 2 runs. **Status.** resolved session-080.

_(See also O-005 — `index.html`'s three `js/keyboard.js` comments
are UI-adjacent but classified under Other for bookkeeping.)_

---

## Findings — Other (dead code — pending owner judgment)

### X-001  Five unused imports in `src/rpl/ops.js` from `./state.js`

- **Classification.** Other (dead imports).
- **Where.** `src/rpl/ops.js:45-55` (approximate — re-verify at fix time).
- **What.** Five names imported from `./state.js` into `ops.js` but
  never referenced inside the file:
  - `varList`   — grep-count 1 (import line only)
  - `goInto`    — grep-count 1
  - `getTextbookMode` — grep-count 1
  - `setComplexMode`  — grep-count 1
  - `getPrngSeed`     — grep-count 1

  All five are real exports used elsewhere in the tree — just not
  from `ops.js`.  Re-verified session 089 — counts unchanged.
- **Why.** Top-of-file imports in a 14k-line file are a readability
  anchor; pulling in unused names makes the import block lie.
- **Fix.** Delete the five names from the import list.
- **Confidence.** high.
- **Age.** 3 runs. **Status.** open (lane = `rpl5050-command-support`).

### X-002  Unused import `TYPES` in `src/rpl/formatter.js`

- **Classification.** Other (dead import).
- **Where.** `src/rpl/formatter.js:10`.
- **What.** `TYPES` is imported from `./types.js` and referenced
  nowhere else in the file (grep-count 1).  Re-verified session 089.
- **Why.** Import-block readability.
- **Fix.** Drop `TYPES` from the import list.
- **Confidence.** high.
- **Age.** 3 runs. **Status.** open (lane = `rpl5050-command-support`
  OR `rpl5050-data-type-support`).

### X-003  Unused import `clampLevel` in `src/app.js`

- **Classification.** User Interface (owner) / Other (nature).
- **Where.** `src/app.js:14`.
- **What.** `clampLevel` imported alongside
  `interactiveStackMenu, levelUp, levelDown`; never referenced
  elsewhere in `app.js` (grep-count 1).  Re-verified session 089.
- **Why.** Same rationale as X-001 / X-002.
- **Fix.** Drop `clampLevel` from the import list.
- **Confidence.** high.
- **Age.** 3 runs. **Status.** open (lane = `rpl5050-ui-development`).

### X-004  Three unused private functions in `src/rpl/ops.js`

- **Classification.** Other.
- **Where.** `src/rpl/ops.js:611` (`_maskVal`), `:9091` (`_isqrtBig`),
  `:9381` (`_ratAdd`).  (Line numbers may shift as ops.js grows;
  re-verify at fix time.)
- **What.** Three `function _name(…)` definitions with zero callers
  anywhere in the repo (grep-count 1 each, all at the definition
  sites).
- **Why.** Dead code drift.  `_isqrtBig` is the worst case —
  "reserved for later" label tricks future readers into assuming
  a working integer-sqrt helper already exists.
- **Fix.** Delete `_maskVal` and `_ratAdd`; for `_isqrtBig`, either
  delete or add a real caller (via the planned ISQRT op).
- **Confidence.** high (`_maskVal`, `_ratAdd`); medium (`_isqrtBig`).
- **Age.** 3 runs. **Status.** open (lane = `rpl5050-command-support`).

### X-005  Shadowed-by-later-register arithmetic + trig registrations (21 duplicates)

- **Classification.** Other.
- **Where.** `src/rpl/ops.js` first-pass at `~:736-752` (+,-,*,/,^)
  and `~:925-957` (SIN COS TAN ASIN ACOS ATAN LN LOG EXP ALOG
  SINH COSH TANH ASINH ACOSH ATANH); superseded by second-pass
  registrations at `~:7150-7177` and `~:6730-6816` respectively.
  (Line numbers approximate — ops.js grows; re-verify at fix
  time.)  Session 089 verified the 21-count still matches via
  `grep -nE "^register\('[^']+'" src/rpl/ops.js | sed -E
  "s/.*register\\('([^']+)'.*/\\1/" | sort | uniq -c | awk '$1>1'`
  — exactly 21 op names appear twice (+ - * / ^ SIN COS TAN ASIN
  ACOS ATAN LN LOG EXP ALOG SINH COSH TANH ASINH ACOSH ATANH),
  unchanged from session 080.
- **What.** `register()` stores into a Map, so the second call
  strictly replaces the first.  First-pass registrations are
  never reachable at runtime.
- **Why.** Dead weight; grep anti-pattern.
- **Fix.** Either delete the first-pass registrations or add a
  block comment clearly marking them as overridden.
- **Confidence.** medium (the "which-wins" analysis is high-conf
  — Map semantics — but picking the right remediation is a judgment call).
- **Age.** 3 runs. **Status.** open (lane = `rpl5050-command-support`).

### X-006  Unused imports `clearAllHalted` + `haltedDepth` in `src/rpl/ops.js`

- **Classification.** Other (dead import).
- **Where.** `src/rpl/ops.js:57`.
- **What.** The state.js import block at `ops.js:55-58` brings in
  `setHalted, getHalted, clearHalted, clearAllHalted, haltedDepth`.
  The first three are used (HALT/CONT/KILL op handlers).
  `clearAllHalted` and `haltedDepth` are never referenced in ops.js
  — `grep -c '\bclearAllHalted\b' src/rpl/ops.js` = 1 (import line
  only); same for `haltedDepth`.  Both are used in
  `tests/test-control-flow.mjs` (LIFO-ordering test assertions);
  neither has a caller anywhere in `src/`.  Added session 083
  alongside the multi-slot halted LIFO refactor.
- **Why.** Same import-block-readability concern as X-001 / X-002.
  Also implicitly asks the ops.js reader "what handler calls
  `clearAllHalted` / `haltedDepth`?" — the answer is "no handler
  does, only tests", which is worth stating explicitly or removing
  the imports.
- **Fix.** Remove both names from the `./state.js` import block in
  `src/rpl/ops.js`.  No test impact — tests import them directly
  from `src/rpl/state.js`.
- **Confidence.** high.
- **Age.** 2 runs. **Status.** resolved session-088 — both names
  removed from the `./state.js` import block in ops.js; replaced with
  a clarifying comment noting they are test-only exports.

---

## Session log — status changes

### Session 080 — what shipped (review lane bootstrap run)

Narrow doc / comment hygiene only.  Files edited: `docs/REVIEW.md`
(created), `docs/RPL.md` (2 lane-id fixes), `docs/TESTS.md` (4
lane-id fixes), `docs/DATA_TYPES.md` (2 fixes), `index.html` (3
path-comment fixes), `src/ui/side-panel.js` (2 doc-ref fixes).
Filed 13 findings; 6 self-resolved, 7 handed off.

Verification: test-all 3745 / 0, persist 34 / 0, sanity 22 / 0 in
~5 ms.

### Session 085 — what shipped (second review-lane run)

Narrow doc-stamp hygiene only.  One file edited:

- `docs/REVIEW.md` — Last-updated stamp bumped from `Session 080
  (2026-04-23)` to `Session 085 (2026-04-23)`; baseline block
  updated; findings re-aged; two findings promoted to
  resolved (O-006 by session 082 data-types lane; the existing
  C-001 / C-002 promotion from session 081 is now verified against
  the file in its current state).

No other files touched by review lane this run.

**Findings delta this run:**

- Promoted to resolved: **O-006** (`docs/DATA_TYPES.md` Last-updated
  stamp drift — data-types lane rewrote the stamp in session 082
  with exactly the explanatory paragraph suggested).
- Verified still-resolved (carried forward): O-001, O-002, O-003,
  O-005, U-001 (all session 080); C-001, C-002 (both session 081).
- Still-open findings aged from `new` → `2 runs`: O-004 remainder,
  X-001, X-002, X-003, X-004, X-005.
- New findings filed: **R-001** (docstring claim about
  `clearAllHalted()` being used by `resetHome()` is false — owner
  `rpl5050-rpl-programming`), **X-006** (`clearAllHalted` +
  `haltedDepth` are unused imports in `src/rpl/ops.js` — owner
  `rpl5050-rpl-programming` or `rpl5050-command-support`).

Total open findings carried forward to next run: 8 (O-004
remainder, R-001, X-001, X-002, X-003, X-004, X-005, X-006).
Resolved cumulative: 8 (O-001, O-002, O-003, O-005, O-006, C-001,
C-002, U-001).

**Verification gates (session 085):**

- `node --check` — N/A (only edit was to `docs/REVIEW.md`, not JS).
- `node tests/test-all.mjs` = **3864 → 3872 passing / 0 failing**
  (entry 3864, up Δ+119 from session 080's 3745 for sessions
  081/082/083; exit 3872, picking up Δ+8 from session 084 unit-tests
  lane that landed during this run).
- `node tests/test-persist.mjs` = **34 passing / 0 failing**
  (unchanged).
- `node tests/sanity.mjs` = **22 passing / 0 failing in ~4 ms**
  (unchanged).

**Lock.** Held `session085-code-review` throughout;
scope = `docs/REVIEW.md`, `logs/`.  No scope overlap with the
two active sibling locks (session083-rpl-programming on src/rpl/
files + docs/RPL.md + two test files; session084-unit-tests on
six test files + docs/TESTS.md + scripts/).  Released at end of
run.

**Next session's queue (priority order):**

1. **X-001 + X-004 + X-006** — `rpl5050-command-support` (or
   rpl-programming for X-006): drop unused imports and dead
   private helpers from `src/rpl/ops.js`.  All three are low-risk
   mechanical edits with `node --check` and `test-all.mjs` as the
   safety net.
2. **R-001** — `rpl5050-rpl-programming`: fix the
   `src/rpl/state.js:415` comment about `clearAllHalted()`.
3. **X-003** — `rpl5050-ui-development`: drop unused `clampLevel`
   import from `src/app.js`.
4. **X-002** — unused `TYPES` import in `formatter.js`.  Either
   command-support or data-type-support.
5. **X-005** — `rpl5050-command-support`: decide on the
   duplicate-register policy (delete first pass OR annotate it
   clearly).  Lowest priority — style not correctness.
6. **O-004 remainder** — `rpl5050-command-support`: rewrite the
   `docs/@!MY_NOTES.md:55` step-4 instruction to point at
   `docs/COMMANDS.md`'s Counts block.

Log pointer: `logs/session-085.md`.

---

### Session 089 — what shipped (third review-lane run)

Doc-stamp hygiene only.  One file edited:

- `docs/REVIEW.md` — Last-updated stamp bumped to session 089;
  baseline block updated (3951/0/0 gates); all still-open findings
  aged from 2 → 3 runs; R-001 and X-006 promoted to resolved
  (session 088 rpl-programming lane fixed both); five new findings
  filed; session 089 log added.

No other files touched by review lane this run.

**Findings delta this run:**

- Promoted to resolved: **R-001** (state.js clearAllHalted comment
  updated by session 088); **X-006** (ops.js dead imports removed
  by session 088, replaced with clarifying comment).
- Verified still-resolved (carried forward): O-001, O-002, O-003,
  O-005, O-006, U-001 (session 080); C-001, C-002 (session 081).
- Still-open findings aged from 2 → 3 runs: O-004 remainder,
  X-001, X-002, X-003, X-004, X-005.
- New findings filed:
  - **C-003** — COMMANDS.md HALT row still says "pilot limitation"
    after session 088 fully lifted it.  Owner: `rpl5050-command-support`.
  - **C-004** — COMMANDS.md SIZE rows missing session 088's Program
    widening.  Owner: `rpl5050-command-support`.
  - **C-005** — COMMANDS.md Counts block "as of session 086" and
    session log missing 087/088 entries.  Owner: `rpl5050-command-support`.
  - **T-001** — TESTS.md coverage snapshot frozen at session 084
    (3872); current count 3951 (+79).  Owner: `rpl5050-unit-tests`.
  - **R-002** — `_driveGen` abandons yielded generator without
    `gen.return()` (style/defensive, not a correctness bug).
    Owner: `rpl5050-rpl-programming`.  Confidence: low.

Total open findings carried forward to next run: 11 (O-004 remainder,
C-003, C-004, C-005, T-001, R-002, X-001, X-002, X-003, X-004,
X-005).  Resolved cumulative: 10 (O-001, O-002, O-003, O-005, O-006,
C-001, C-002, U-001, R-001, X-006).

**Verification gates (session 089):**

- `node --check` — N/A (only edit was to `docs/REVIEW.md`).
- `node tests/test-all.mjs` = **3951 passing / 0 failing** (stable
  at entry and exit; no sibling-lane changes concurrent this run).
- `node tests/test-persist.mjs` = **34 passing / 0 failing**
  (unchanged).
- `node tests/sanity.mjs` = **22 passing / 0 failing in ~5 ms**
  (unchanged).

**Lock.** Held `session089-code-review` throughout; scope =
`docs/REVIEW.md`, `logs/`.  All sibling locks (086/087/088) fully
released at run entry.  Released at end of run.

**Next session's queue (priority order):**

1. **C-003 + C-004 + C-005** — `rpl5050-command-support`: three
   COMMANDS.md doc-hygiene items from the session 088 generator
   work.  All are mechanical updates (Notes column additions,
   session-log entry, counts-stamp bump); low risk, `node --check`
   N/A.  Natural pairing with X-001 / X-004 cleanup.
2. **T-001** — `rpl5050-unit-tests`: update TESTS.md coverage
   snapshot to 3951, add delta note.
3. **X-001 + X-004** — `rpl5050-command-support`: still the lowest-
   risk mechanical edits in the backlog; 3 runs overdue.
4. **X-003** — `rpl5050-ui-development`: single-line import drop
   in `app.js`.
5. **X-002** — `rpl5050-command-support` or `rpl5050-data-type-support`.
6. **R-002** — `rpl5050-rpl-programming`: low-confidence style fix
   in `_driveGen`; defer until owner judges it worth the churn.
7. **X-005** — `rpl5050-command-support`: duplicate-register
   policy decision.  Still lowest priority.
8. **O-004 remainder** — `rpl5050-command-support`: stale step-4
   instruction in `@!MY_NOTES.md`.

Log pointer: `logs/session-089.md`.
