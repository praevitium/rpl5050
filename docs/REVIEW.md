# REVIEW.md — RPL5050 code-review lane running ledger

**Scope.** This file is the authoritative ledger for the
`rpl5050-code-review` scheduled-task lane. It records audit findings
across the whole repo, classified into the six lane buckets
(`User Interface`, `Commands`, `Data Types`, `RPL`, `Unit Tests`,
`Other`), so the sibling implementer lanes can pick them up as a group.

**Last updated.** Session 085 (2026-04-23).  Second review-lane run.
Prior baseline = session 080 (bootstrap).  Between sessions 080 and
085 the sibling lanes shipped: 081 (command-support), 082
(data-type-support), 083 (rpl-programming), and 084 was in-flight
(unit-tests; its lock was live at this run's entry).  Two prior
findings closed this run; one was resolved by the sibling lane,
the other is a new-finding introduced by session-083's work.

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

**Baseline (session 085).** At entry `node tests/test-all.mjs` =
**3864 passing / 0 failing** (up from 3745 at session 080 — Δ+119
across sessions 081/082/083's new assertions).  At exit = **3872
passing / 0 failing** — session 084 (unit-tests lane) landed Δ+8
assertions during this run (its lock was active at entry; the
landing was observed on the second verification pass).
`node tests/test-persist.mjs` = **34 passing / 0 failing** (stable).
`node tests/sanity.mjs` = **22 passing / 0 failing in ~4-5 ms**
(stable).  `node --check` N/A this run — only edit was to
`docs/REVIEW.md`, which isn't JS.

**This run's own edits.** Narrow doc-stamp hygiene only:
`docs/REVIEW.md`'s own Last-updated stamp bumped from session 080 to
session 085.  No sibling-lane files touched.  No RPL op behavior
changed, no types widened, no tests deleted, no interpreter touched,
no registrations added or removed.

**Lock.** Held `utils/@locks/session085-code-review.json` throughout,
scope = `docs/REVIEW.md` and `logs/`.  No scope overlap with the
two active sibling locks (session083-rpl-programming scope =
src/rpl/algebra.js, docs/RPL.md, tests/test-control-flow.mjs,
tests/test-reflection.mjs; session084-unit-tests scope =
tests/test-matrix.mjs, tests/test-numerics.mjs, tests/test-types.mjs,
tests/sanity.mjs, tests/test-all.mjs, docs/TESTS.md, scripts/).
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
- **Age.** 2 runs. **Status.** partial — three sites resolved
  session-080; `docs/@!MY_NOTES.md:55` still open, lane =
  `rpl5050-command-support`.  Verified session 085: grep for
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
- **Age.** new. **Status.** open (lane = `rpl5050-rpl-programming`).

---

## Findings — Unit Tests

_(No new Unit Tests findings this run.  The `docs/TESTS.md` file is
under the active session084-unit-tests lock at entry; its own
coverage-gap blocks remain the authoritative backlog.  Review lane
explicitly does not duplicate those here.)_

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
  from `ops.js`.  Re-verified session 085 — counts unchanged.
- **Why.** Top-of-file imports in a 14k-line file are a readability
  anchor; pulling in unused names makes the import block lie.
- **Fix.** Delete the five names from the import list.
- **Confidence.** high.
- **Age.** 2 runs. **Status.** open (lane = `rpl5050-command-support`).

### X-002  Unused import `TYPES` in `src/rpl/formatter.js`

- **Classification.** Other (dead import).
- **Where.** `src/rpl/formatter.js:10`.
- **What.** `TYPES` is imported from `./types.js` and referenced
  nowhere else in the file (grep-count 1).  Re-verified session 085.
- **Why.** Import-block readability.
- **Fix.** Drop `TYPES` from the import list.
- **Confidence.** high.
- **Age.** 2 runs. **Status.** open (lane = `rpl5050-command-support`
  OR `rpl5050-data-type-support`).

### X-003  Unused import `clampLevel` in `src/app.js`

- **Classification.** User Interface (owner) / Other (nature).
- **Where.** `src/app.js:14`.
- **What.** `clampLevel` imported alongside
  `interactiveStackMenu, levelUp, levelDown`; never referenced
  elsewhere in `app.js` (grep-count 1).  Re-verified session 085.
- **Why.** Same rationale as X-001 / X-002.
- **Fix.** Drop `clampLevel` from the import list.
- **Confidence.** high.
- **Age.** 2 runs. **Status.** open (lane = `rpl5050-ui-development`).

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
- **Age.** 2 runs. **Status.** open (lane = `rpl5050-command-support`).

### X-005  Shadowed-by-later-register arithmetic + trig registrations (21 duplicates)

- **Classification.** Other.
- **Where.** `src/rpl/ops.js` first-pass at `~:736-752` (+,-,*,/,^)
  and `~:925-957` (SIN COS TAN ASIN ACOS ATAN LN LOG EXP ALOG
  SINH COSH TANH ASINH ACOSH ATANH); superseded by second-pass
  registrations at `~:7150-7177` and `~:6730-6816` respectively.
  (Line numbers approximate — ops.js grows; re-verify at fix
  time.)  Session 085 verified the 21-count still matches via
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
- **Age.** 2 runs. **Status.** open (lane = `rpl5050-command-support`).

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
- **Age.** new. **Status.** open (lane = `rpl5050-rpl-programming`
  OR `rpl5050-command-support` — ops.js is command-support's main
  file but the two imports are the rpl-programming lane's
  additions, either is appropriate).

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
