# TESTS — RPL5050 unit-test lane notes

**Scope.** This file is the authoritative notes file for the `rpl5050-unit-tests`
scheduled-task lane. It tracks what tests exist, where the coverage gaps are,
which tests are known-flaky or known-failing, and what to pick up next run.

**Last updated.** Session 122 (2026-04-24).  Unit-tests lane run.

Sibling deltas absorbed since the session-117 snapshot (4089 → 4228,
**+139**):
- Session 119 (command-support) shipped **+25** assertions in
  `test-algebra.mjs` (913 → 938) for the EGV / RSD / GREDUCE
  ops + `_astToRplValue` neg-num lift.
- Session 120 (data-type-support) shipped **+68** assertions in
  `test-types.mjs` (526 → 594) for hyperbolic Tagged transparency
  + percent Tagged tag-drop + Rational unary stay-exact pins.
- Session 121 (rpl-programming) shipped **+46** PROMPT / KILL
  assertions in `test-control-flow.mjs` (402 → 448) BUT the lock
  was stale-pruned without writing `logs/session-121.md` — work
  landed concurrently with this run's session-122 lock acquisition
  (file mtime is well after the lock-overlap window).  This is the
  O-008 process-failure pattern (lock-release-via-stale-prune as
  missing-log signal); re-file under the code-review lane.  The
  session-121 PROMPT cluster does not collide with the session-122
  edits — different line ranges (s121 at `:3656-3929`, s122 at
  `:432`/`:660`/`:825`/`:2098`).

Session 122 unit-tests deltas:
- **+4 new regression guards** in `test-control-flow.mjs`,
  closing queue item #2 from session 117 (the 5 `let threw`
  sites in `test-control-flow.mjs`).  Migrated 4 of the 5
  sites to `assertThrows()` + added a value-add regression
  guard at each:
  - `:432` (START 1/0 in body) — pinned the previously-
    unguarded HP50 error-message shape to `/Infinite result/`.
  - `:660` (IFERR-without-THEN with END) — added stack-
    rollback guard `s.depth === 1 && isProgram(s.peek())`
    (previously only the throw was checked).
  - `:825` (FOR/STEP of 0) — pinned exact message
    `=== 'STEP of 0'`.
  - `:2098` (IFERR with neither THEN nor END) — same
    stack-rollback guard as the with-END variant; pins that
    the no-END path also restores Program to level 1.
  The 5th site at `:919` is the negated form
  `assert(!threw, …)` for the `DOERR 0` no-op — deliberately
  left as-is, mirroring the `tests/test-matrix.mjs` RDZ-0
  precedent (`assertThrows` would invert the meaning).

Prior session-117 snapshot deltas (retained for context — the
session-117 close was 4089 / 0 in `test-all.mjs`, 38 / 0 in
`test-persist.mjs`, 22 / 0 in `sanity.mjs`):
- Session 113 (code-review) — doc-only lane run; **0** assertion
  deltas (filed new O-009 / X-009 / X-010 findings but made no
  source/test edits).
- Session 114 (command-support) shipped assertions in
  `test-algebra.mjs` (891 → 913, **+22**).
- Session 115 (data-type-support) shipped **+50** assertions in
  `test-types.mjs` (474 → 524) for FLOOR/CEIL/IP/FP BinInt
  widening + List/scalar broadcast + Tagged-inside-List rejection
  guards.  `:2068`/`:2074` TRUNC sites were left as-is for the
  unit-tests lane.
- Session 116 (rpl-programming) shipped **+34** assertions in
  `test-control-flow.mjs` (368 → 402) for EVAL-HALT-lift-through-
  Tagged + caller-label sweep.  (Session 116 lock was still held
  at session-117 entry; first baseline `test-all.mjs` reported
  a module-load error on `test-control-flow.mjs` which cleared
  mid-run — my lane did not touch that file.)

Session 117 unit-tests deltas:
- **+2 new regression guards** in `test-types.mjs` — closing
  queue item #3 from session 112 (the `:2068`/`:2074` TRUNC sites
  deliberately skipped for `${threw?.message}` interpolation).
  Migrated both `let threw = null; try{…}catch(e){threw = e;}`
  scaffolds to `assertThrows(…, /TRUNC expects 2 argument/, …)`
  (message-shape pin, 1:1 with the pre-existing assertion) +
  follow-up `/got 1\b/` / `/got 3\b/` guards on the
  actual-arg-count tail of the error message, which was
  previously uncovered.  Precedent: session-112 LOG(-10)-CMPLX-OFF
  split.  524 → 526.
- **+4 new regression guards** in `test-persist.mjs` — closing
  queue item #4 from session 112 (the standalone file's :118
  site).  Added a **local `assertThrows` helper** mirroring the
  `tests/helpers.mjs` signature (so test-persist can stay
  standalone).  Migrated the unknown-version rejection to
  `assertThrows(…, /unsupported version/, …)` + three new
  regression guards: (a) `/\b999\b/` on the error message
  (echo-bad-version invariant), (b) missing-version
  (`rehydrate({})`) rejected with same shape — exercises the
  `snap.version === undefined` branch of `persist.js:126`, (c)/(d)
  `rehydrate(null)` and `rehydrate('not-a-snap')` each reject
  with `/not an object/` — distinct reject path at `persist.js:125`.
  34 → 38.
- **P-001 remainder cleared for `docs/TESTS.md`** — fixed the two
  stale `src/…` path references at lines 233 (`src/rpl/ops.js`)
  and 355 (`src/rpl/algebra.js`) to `www/src/…`.  Both sites sit
  inside historical narrative blocks (s084 KNOWN-GAP test plan +
  concurrent-lane awareness note); the prefix rewrite is
  mechanical and does not alter the historical intent.  Completes
  `docs/` side of P-001 for this lane's files.
- **O-009 deferred** — the two stray `tests/test-control-flow.mjs.bak{,2}`
  files cannot be deleted from within the unsupervised scheduled-task
  session: `rm` returned `Operation not permitted`, and the
  `cowork_allow_file_delete` permission prompt is blocked in
  unsupervised mode.  Filed an "open — blocked by tooling" pointer
  in the known-gaps list for a human-present run to clear.

## Coverage snapshot (session 122)

Baseline at session start: `node tests/test-all.mjs` = **4182 / 0**
(session-120 close: +68 in `test-types.mjs` for hyperbolic Tagged +
percent Tagged + Rational unary stay-exact).  `test-persist.mjs`
38 / 0.  `sanity.mjs` 22 / 0.  No active locks at entry — sessions
119, 120 cleanly released; session 121's lock had been stale-pruned
with no log written.

Final: **4232 passing / 0 failing**.  Composition: +4 session-122
regression guards in `test-control-flow.mjs` (the queue-#2
`assertThrows` migration); +46 session-121 PROMPT/KILL assertions
landed concurrently in the same file (s121 stale-pruned its lock,
work was already on disk under `session121:` labels at session-122
verification).  Net delta to the file: 402 → 452.
`test-persist.mjs` 38 / 0 (unchanged).  `sanity.mjs` 22 / 0
(unchanged).

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            |  938 | 0    | +25 session-119 (command-support: EGV / RSD / GREDUCE + neg-num lift). |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    | session-112 migration snapshot retained. |
| test-comparisons.mjs        |   95 | 0    | +15 session-107 Rational coverage (retained from prior snapshot). |
| test-control-flow.mjs       |  **452** | 0    | +34 session-116; **+46 session-121** PROMPT/KILL cluster (lock stale-pruned, no log written — see top-of-file note); **session-122: +4 regression guards** on the queue-item-#2 `let threw` sites — `:432` START 1/0 message-shape pin (`/Infinite result/`), `:660` IFERR-without-THEN stack-rollback (`s.depth === 1 && isProgram(s.peek())`), `:825` FOR/STEP-of-0 exact-message pin (`=== 'STEP of 0'`), `:2098` no-END IFERR stack-rollback companion.  5th site `:919` (negated `assert(!threw, …)` DOERR-0 no-op) deliberately left — same precedent as test-matrix RDZ-0. |
| test-entry.mjs              |   90 | 0    | session-112 migration snapshot retained. |
| test-eval.mjs               |   62 | 0    | session-112 migration snapshot retained. |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  171 | 0    | session-112 migration snapshot retained. |
| test-matrix.mjs             |  347 | 0    | Remaining 1 site is the negated `assert(!threw, …)` RDZ-0 acceptance check, deliberately untouched. |
| test-numerics.mjs           |  687 | 0    | +27 session-109 + session-112 LOG-CMPLX-OFF split (retained). |
| test-reflection.mjs         |  196 | 0    |                                          |
| test-stack-ops.mjs          |   32 | 0    |                                          |
| test-stats.mjs              |   20 | 0    | session-112 migration snapshot retained. |
| test-types.mjs              |  594 | 0    | +50 session-115 + 2 session-117; **+68 session-120** (hyperbolic Tagged transparency + percent Tagged tag-drop + Rational unary stay-exact).  526 → 594. |
| test-ui.mjs                 |   77 | 0    | session-112 migration snapshot retained. |
| test-units.mjs              |   39 | 0    |                                          |
| test-variables.mjs          |  248 | 0    | session-112 migration snapshot retained. |
| **test-all (aggregate)**    | **4232** | **0** | Session 122 close (includes session-121 PROMPT/KILL cluster landed concurrently).  |
| test-persist.mjs (separate) |   38 | 0    | session-117 baseline retained — no persist-schema touches this run. |
| sanity.mjs (standalone)     |   22 | 0    | <5 ms smoke suite.                       |

### Prior snapshot — Session 102 (retained for context)

Baseline at session start: `node tests/test-all.mjs` = **3639 / 0**
(session-101 close).  Final: **3660 / 0** (+21 session-102 adds).
Deltas: +7 String-lex edges in `test-comparisons.mjs` (73 → 80),
+4 BinInt-rounder base-preservation edges in `test-types.mjs`
(276 → 280), +10 SST/DBUG regression guards in `test-control-flow.mjs`
(294 → 304).  Behaviour-preserving migrations: 9 sites in `test-stack-ops.mjs`,
5 sites in `test-types.mjs`.

---

## Prior snapshot — Session 084 (retained for history)

---

## Lane charter (from SKILL.md)

> Ensure the test suite is complete, reliable, and has good coverage.
> Safety-net lane for the four implementer tasks.

- Own everything under `tests/` + `sanity.mjs` + `test-all.mjs` plumbing.
- **Do not** fix source-code bugs surfaced by a test; surface the gap here and
  let the relevant sibling lane fix it.
- **Do not** delete a failing test to make the suite green; convert to `.skip`
  with a pointer if it has to be disabled, and log it.
- **HP50 fidelity.** Assertions must match HP50 outputs per the PDFs, not
  whatever the current code happens to produce.

Sibling lanes:

| Lane task id             | Lane owns                                   |
|--------------------------|---------------------------------------------|
| `rpl5050-command-support`| new ops                                     |
| `rpl5050-data-type-support` | widen existing ops' type surface         |
| `rpl5050-ui-development` | keypad, entry line, display, paging         |
| `rpl5050-rpl-programming`| User-RPL interpreter: Program, CASE/IF/LOCAL, HALT/CONT |
| `rpl5050-unit-tests`     | **this lane**                               |

---

## Coverage snapshot (session 084)

Baseline at lane start: `node tests/test-all.mjs` = **3864 passing /
0 failing** (grew +119 since session 075 — session-076/081 command-
support contributions: TRUNC two-arg, PSI digamma+polygamma, CYCLOTOMIC
+41; session-082 data-types: DERIV hyp + INTEG SINH/COSH/ALOG +
simplify rounding idempotency +29; session-083 rpl-programming: multi-
slot HALT LIFO + RUN op + IF auto-close +49).
`node tests/test-persist.mjs` = 34 passing / 0 failing.
`node tests/sanity.mjs` = 22 passing / 0 failing in ~5 ms.

Final: `node tests/test-all.mjs` = **3872 passing / 0 failing** (+8
this lane — the session-084 KNOWN-GAP block in
`tests/test-types.mjs` documents `==` / `SAME` on Program / Directory
with 5 soft asserts + 3 regression guards.  The 104-site
`assertThrows` migration in `tests/test-matrix.mjs` is behaviour-
preserving — assertion count unchanged at 347.).  `test-persist.mjs`
unchanged (34); `sanity.mjs` unchanged (22).  **Flake-scan harness
confirms 10/10 identical runs end-of-session — 3808 assertion labels
stable-ok, zero flaky outcomes.**  Combined with session 075's 5
clean runs and session 083's 10 clean runs, the rpl-programming-lane
HALT/CONT flake filing is supported by **25+ consecutive clean runs**;
this session also ran `flake-bisect.mjs --shuffles 6 --trials 4` on
the original HALT/CONT label and got 24/24 ok.  Recommendation: the
data-types and rpl-programming lanes can close that filing next run.

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1355 | 0    | Largest file; CAS focus.                 |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    |                                          |
| test-comparisons.mjs        |   68 | 0    |                                          |
| test-control-flow.mjs       |  225 | 0    | +49 from s083 (multi-slot HALT LIFO + RUN + IF auto-close). |
| test-entry.mjs              |   86 | 0    |                                          |
| test-eval.mjs               |   62 | 0    |                                          |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  171 | 0    |                                          |
| test-matrix.mjs             |  347 | 0    | **104 sites migrated to `assertThrows` this lane** (behaviour-preserving; pass count unchanged). |
| test-numerics.mjs           |  631 | 0    | +41 from s081 (TRUNC two-arg + PSI + CYCLOTOMIC). |
| test-reflection.mjs         |  173 | 0    |                                          |
| test-stack-ops.mjs          |   32 | 0    |                                          |
| test-stats.mjs              |   20 | 0    |                                          |
| test-types.mjs              |  **158** | 0    | **+8 this lane** (session084 KNOWN-GAP block: `==` / `SAME` on Program/Directory).  +29 from s082 (DERIV hyp + INTEG + simplify rounding). |
| test-ui.mjs                 |   73 | 0    |                                          |
| test-units.mjs              |   39 | 0    |                                          |
| test-variables.mjs          |  248 | 0    |                                          |
| **test-all (aggregate)**    | **3872** | **0** | 10 consecutive clean flake-scan runs end-of-session. |
| test-persist.mjs (separate) |   34 | 0    |                                          |
| sanity.mjs (standalone)     |   22 | 0    | <5 ms smoke suite.                       |

Grand total assertions available across all runnable `.mjs` files
(excluding the aggregator itself): **3928** passing, 0 failing.

### Coverage heat-map notes

- **BinaryInteger equality cluster is CLOSED.**  Session 077 (data-
  types lane) landed the `eqValues` BinInt branch + `_binIntCross-
  Normalize` helper + `comparePair` BinInt coercion that this lane
  filed in session 074.  The 9 soft-asserts flipped to hard; 6 new
  positive/rejection cases added.  DATA_TYPES rows for `==` / `SAME`
  / `<` / `>` / `≤` / `≥` now show B ✓.
- **Per-file headline counts ship in `test-all.mjs`** (landed s074).
- **Flake-scan harness `tests/flake-scan.mjs`** (landed s074).  Run
  `node tests/flake-scan.mjs [N] [--quiet]` before escalating any
  single flake to a lane filing.
- **Flake-BISECT harness `tests/flake-bisect.mjs`** (landed s075).
  When flake-scan identifies a non-deterministic assertion,
  `flake-bisect.mjs --label "<label>"` hunts a reproducing
  file-import order by shuffling, then shrinks the prefix until only
  the load-bearing files remain.  Also supports `--order a,b,…`
  for reproducing a known-bad ordering directly.  Back-end is
  `tests/run-order.mjs`, a configurable variant aggregator that
  takes FILES via argv or `--from-test-all`.
- **`assertThrows` migration progress.**  This session (s084)
  migrated **104 inline sites in `tests/test-matrix.mjs`** — the
  single biggest target on the queue.  Behaviour-preserving:
  pass count unchanged at 347 before/after.  Approach: a Python-
  driven regex pass over the SPLIT pattern (try/catch on separate
  lines, 26 sites) followed by the SIMPLE pattern (try/catch
  inline, 78 sites).  Total prior s075 migration: 12 sites across
  test-entry/units/comparisons/stats.  **Remaining queue:** test-
  numerics (~115), test-algebra (~53), test-variables (~16),
  test-lists (~15), test-stack-ops (~10), test-binary-int (~9),
  test-types (~5), test-control-flow (~5), test-eval (~2), test-
  ui (~2), test-persist (~1).  One negative-form site in test-
  matrix (`assert(!threw, …)` for RDZ-0 acceptance) was left as-is
  — `assertThrows` would invert the meaning.
- **Sanity gate now wired into a script.**  `scripts/pre-commit.sh`
  (new this session) runs `tests/sanity.mjs` as the always-on cheap
  gate; `--full` adds `tests/test-all.mjs`; `--persist` adds
  `tests/test-persist.mjs`.  Hookable as a real git hook via
  `ln -sf ../../scripts/pre-commit.sh .git/hooks/pre-commit`.
- **DATA_TYPES ✗ rejection-sweep** audit done in s075; gaps filled
  by the session-075 block in `tests/test-numerics.mjs`.

---

## Known gaps (open items)

### Assigned to `rpl5050-data-type-support`

1. **String lexicographic `<` / `>` / `≤` / `≥`** — (rolled forward
   from s073 queue).  HP50 User Guide App-J documents char-code lex
   order. `comparePair()` rejects Strings with `Bad argument type`.
   Test: `tests/test-comparisons.mjs` KNOWN GAP marker around the
   original session 068 block (line ~352).  Soft-asserted; flip to
   hard once widened.
2. **`==` / `SAME` on Program, Directory** — **NEW SOFT-ASSERTS
   READY THIS SESSION (s084).**  See block at end of
   `tests/test-types.mjs` labelled `session084: KNOWN GAP — …` (5
   soft asserts + 3 hard regression guards).  Test plan for the
   data-types lane:
   - **Program × Program:** add `if (isProgram(a) && isProgram(b))
     return _eqArr(a.tokens, b.tokens);` to `eqValues` in
     `www/src/rpl/ops.js` (the existing `_eqArr` already recurses via
     `eqValues`, so any nested Programs / Lists / etc. compare
     correctly).
   - **Directory × Directory:** add `if (isDirectory(a) &&
     isDirectory(b)) return a === b;` to `eqValues`.  HP50 spec
     (AUR §4-7) is reference identity, NOT structural — the s084
     "two distinct Directories with same name → 0" regression
     guard is the test that makes this explicit.
   - Then flip the 5 soft asserts (`v === 0 || v === 1`) to hard
     (`v === 1`), updating the labels from `session084: KNOWN GAP
     — …` to `session084: …`.
3. **Dim-equivalence `==` on Units** — (rolled forward from s073).
   `1_m == 1_km` = 0 today by design (strict structural); a separate
   `UEQUAL` op or flag would give dimension-aware equality.  Low
   priority.
4. **BinaryInteger `FLOOR` / `CEIL` / `IP` / `FP` widening** —
   (filed by data-types lane in its session 077 "Next-session
   candidates" queue).  `_rounderScalar` only dispatches on
   `isReal/isInteger/isUnit`; BinInt should be accepted as a no-op.
   No test-lane action until the widening lands — at that point the
   `session075: CEIL(Complex)` adjacent block is the natural home
   for positive BinInt rounder tests.

### Assigned to `rpl5050-rpl-programming`

- **Flake watch — HALT/CONT ordering dependency.**  Status UPDATED
  this session (s084).  Cumulative clean-run count now standing at
  **25+ consecutive clean flake-scan runs** (s075=5, s083=10, s084=10
  this session) plus 24 flake-bisect random shuffles × trials this
  session, all `ok`.  The session-078 `_localFrames` reset and the
  session-083 multi-slot HALT LIFO refactor appear to have closed the
  ordering dependency.  **Recommendation: close this filing in the
  next rpl-programming run.**  If it reappears, the
  `tests/flake-bisect.mjs` harness is the right first tool:
  - `node tests/flake-bisect.mjs --label "session073: first CONT runs 2 + → 3, re-hits HALT"`

### Assigned to `rpl5050-command-support` / `rpl5050-data-type-support`

No new missing-op gaps flagged this run.  (The coverage sweep revealed
no zero-coverage ops in `docs/COMMANDS.md` — the lanes have kept up.)

### File hygiene (blocked by tooling — `rpl5050-unit-tests`)

- **O-009 — `tests/test-control-flow.mjs.bak{,2}` stray backups.**
  Two backup files sitting beside the live test-control-flow.mjs
  (92,129 bytes + 92,141 bytes, pre-session-111 snapshots).  Not
  referenced by any runner but creates grep noise and
  source-of-truth confusion.  **Session 117 attempted `rm` from
  the scheduled-task sandbox and got `Operation not permitted`;
  the `cowork_allow_file_delete` permission prompt is gated
  behind user-present approval, which is unavailable in
  unsupervised scheduled-task runs.  Deferred to a human-supervised
  unit-tests run or the code-review lane.**

### Harness / test-plumbing (own items — `rpl5050-unit-tests`)

1. **~~No `sanity.mjs` smoke file~~** — ✅ session 070.
2. **~~`helpers.mjs` is minimal~~** — ✅ session 070.
3. **~~No per-file headline counts in `test-all.mjs`~~** — ✅ session
   074.
4. **~~No flake-detection harness~~** — ✅ session 074.  Use
   `node tests/flake-scan.mjs [N] [--quiet]`.
5. **~~No flake-bisect harness~~** — ✅ session 075.  Use
   `node tests/flake-bisect.mjs --label "<assertion label>"`.
6. **~~Wire `sanity.mjs` into a pre-commit-style script~~** —
   ✅ **session 084 (this run).**  `scripts/pre-commit.sh` ships;
   default invocation runs the 5-ms sanity smoke; `--full` adds the
   full 3872-assertion suite; `--persist` adds the persist suite.
   Hookable as a real git hook via:
   `ln -sf ../../scripts/pre-commit.sh .git/hooks/pre-commit`.
7. **Audit inline `assertThrows`-pattern sites and migrate** —
   **IN PROGRESS** (continuing from s075).
   - s075 migrated 12 sites: test-entry 3, test-units 4,
     test-comparisons 2, test-stats 2, test-entry 1 re-counted.
   - **s084 (this run) migrated 104 sites in `tests/test-matrix.mjs`**
     — 26 SPLIT (try/catch on separate lines) + 78 SIMPLE (try/catch
     inline).  Single negated site (`assert(!threw, …)` for RDZ-0
     acceptance) deliberately untouched.  Behaviour-preserving:
     347 passes before/after.
   - **Remaining queue (priority order):** test-numerics ~115,
     test-algebra ~53, test-variables ~16, test-lists ~15,
     test-stack-ops ~10, test-binary-int ~9, test-types ~5,
     test-control-flow ~5, test-eval ~2, test-ui ~2, test-persist ~1.
   - **Suggested next:** test-numerics in 4 chunks of ~30 (Bad
     argument value / Bad argument type / Invalid dimension /
     Infinite result groupings work as natural chunk boundaries).
8. **Duplicate-label hygiene.**  Session 074 flake-scan reported 3566
   unique labels out of 3630 assertions — 64 duplicate labels.  This
   session's flake-scan reports 3808 unique labels out of 3872
   assertions — **still 64**.  Not a correctness concern.  Low
   priority; fix opportunistically.
9. **`flake-bisect` UX polish.**  When no reproducer is found, the
   harness exits 3 with a one-liner.  Future enhancement: record
   per-shuffle label-trajectory so the user can grep which orderings
   *almost* reproduced.  Low priority.

---

## Mid-session events (session 084)

- **assertThrows migration in `tests/test-matrix.mjs` landed cleanly.**
  104 inline sites converted to `assertThrows`.  Approach: a Python
  regex pass — SPLIT pattern first (matches multi-line
  `try { … }\n    catch (e) { threw = /…/.test(e.message); }\n
  assert(threw, …);`, 26 hits), then SIMPLE pattern second
  (matches inline `try { … } catch (e) { threw = /…/.test(...); }
  \n    assert(threw, …);`, 78 hits).  Order matters because the
  SIMPLE pattern would otherwise greedily eat across newlines.
  One negated site (`assert(!threw, …)` for `RDZ 0` acceptance)
  deliberately left as-is.  Behaviour preserved: 347 passes
  before, 347 after; full suite went from 3864 to 3872 (+8 from
  the new s084 KNOWN-GAP block, NOT from the migration).
- **KNOWN-GAP block for `==` / `SAME` on Program / Directory.**
  8 new assertions appended to `tests/test-types.mjs` —
  5 soft (`v === 0 || v === 1`) for the equality cases the
  data-types lane needs to widen, plus 3 hard regression guards
  that must hold both before AND after the widening (different
  tokens → 0; permuted tokens → 0; distinct Directory objects with
  same name → 0 because Directory equality is reference identity,
  not structural).  The data-types lane's flip is a one-line
  edit per type — see "Assigned to `rpl5050-data-type-support`"
  item 2.
- **Pre-commit script `scripts/pre-commit.sh` shipped.**  Closes the
  s070/s074/s075 queue item.  Default = 5-ms sanity gate; `--full`
  adds the test-all suite; `--persist` adds the persist suite.
  Designed to be hookable as a real git pre-commit hook.
- **HALT/CONT flake confirmed not-reproducing.**  10 flake-scan
  runs this session (3808 stable-ok across all 10) plus 24
  flake-bisect random-shuffle invocations — all `ok`.  Cumulative
  clean-run count is now 25+; recommendation lodged with the
  rpl-programming lane to close the filing next run.
- **No cross-lane import races this run.**  `test-all.mjs` import
  order processed cleanly on every flake-scan invocation.
- **Concurrent-lane awareness.**  Session 083 (rpl-programming —
  `tests/test-control-flow.mjs`, `tests/test-reflection.mjs`,
  `www/src/rpl/algebra.js`, `docs/RPL.md`) was active at lane entry; my
  s084 lock scope explicitly excluded all of those.  Session 085
  (code-review — `docs/REVIEW.md`, `logs/`) opened mid-run; per the
  README's `logs/` exemption I used a unique session-084 filename
  and proceeded.

---

## Known flakes

None observed this session.  The session-074 intermittent (see above
in Known gaps → rpl-programming) did not recur.  `tests/flake-scan.mjs`
harness (`node tests/flake-scan.mjs [N] [--quiet]`) and the new
`tests/flake-bisect.mjs` harness (`node tests/flake-bisect.mjs
--label "<label>"`) remain the first and second lines of diagnostic
when the next flake appears.

---

## Next-session queue (priority order)

1. **~~Close the HALT/CONT rpl-programming filing.~~** — assumed
   closed by session 111 / 116 rpl-programming runs; no flake-scan
   reproduction in any session since s084.  Drop this item if it
   reappears in the Known-gaps list on next read.

2. **~~`assertThrows` migration — `test-control-flow.mjs` (5
   sites).~~**  **Resolved session 122.**  4 of 5 sites migrated
   to `assertThrows()` + new regression guard at each (+4
   assertions); 5th site is the negated DOERR-0 form, deliberately
   left.  Only `let threw` line remaining in the file is line 919
   (DOERR-0 no-op); `grep -n 'let threw' tests/test-control-flow.mjs`
   confirms.

3. **~~`assertThrows` migration — `test-types.mjs` (:2068/:2074).~~**
   **Resolved session 117.**  Both TRUNC sites migrated to
   `assertThrows(/TRUNC expects 2 argument/)` + follow-up
   `/got N\b/` regression guards on the previously-uncovered
   actual-arg-count tail of the error message.  +2 assertions.

4. **~~`assertThrows` migration — `test-persist.mjs` (1 site at
   :118).~~**  **Resolved session 117.**  Migrated to `assertThrows`
   via a local helper + added 3 new regression guards on adjacent
   reject branches (missing-version, `null` snap, string snap).
   +4 assertions.

5. **O-009 — `tests/test-control-flow.mjs.bak{,2}` cleanup —
   DEFERRED, blocked by tooling.**  Session 117 attempted to
   delete the two stray backup files but `rm` returned
   `Operation not permitted`, and `cowork_allow_file_delete`
   requires a user-present approval that is unavailable in
   unsupervised scheduled-task runs.  Re-try on a human-supervised
   unit-tests run, or hand to the code-review lane.

6. **Duplicate-label cleanup — opportunistic.**  Still ~100 labels
   duplicated across files (exact count drifts as sibling lanes
   ship).  Not a correctness concern but confusing for `grep`-
   based attribution.  Best done during other test-file edits
   to avoid touching files for a single-purpose label rename.

7. **Explicit positive-coverage pass on ✓ cells in DATA_TYPES that
   only have negative / rejection evidence today.**  Plan:
   enumerate ✓ cells → grep for op name in tests → flag any ✓ cell
   whose op has no adjacent positive assertion.

8. **assertThrows migration — MOSTLY DONE.**  All remaining
   `let threw =` sites in the `test-all.mjs` aggregate are either:
   deliberately-skipped (label interpolation, negated form, orphan
   dead code — ~5 sites in `test-control-flow.mjs` per queue item
   #2), or the negated `assert(!threw, …)` RDZ-0 acceptance in
   `test-matrix.mjs`.  Queue items #3, #4 from session 112 are
   closed by session 117.

---

## Session-by-session log index

- Session 122 (2026-04-24) — this run.  Unit-tests lane.  Closed
  queue item #2 from session 117 — the `assertThrows` migration in
  `test-control-flow.mjs`.  **+4 regression guards** added at the
  5 `let threw` sites (4 migrated; the 5th is the negated DOERR-0
  no-op form, deliberately left): `:432` (START 1/0 →
  `/Infinite result/` shape pin), `:660` (IFERR-without-THEN →
  stack-rollback `s.depth === 1 && isProgram(s.peek())`), `:825`
  (FOR/STEP-of-0 → exact-message `=== 'STEP of 0'`), `:2098`
  (no-END IFERR → stack-rollback companion).  Final test-all
  **4232 / 0** (entry 4182; +4 from session 122 + 46 from a
  concurrent session-121 PROMPT/KILL cluster that landed in
  `tests/test-control-flow.mjs` while this lock was held — see
  the top-of-file delta note).  test-persist 38 / 0 (unchanged).
  sanity 22 / 0 (unchanged).  Log file: `logs/session-122.md`.
  Note: session 121 (rpl-programming) acquired its lock and was
  stale-pruned without writing `logs/session-121.md` — re-file
  under code-review per O-008 pattern.  Session 121 also wrote to
  `tests/test-control-flow.mjs` after stale-prune / past my
  acquire — flagged for the code-review lane as a lock-protocol
  violation companion to the missing-log finding.
- Session 117 (2026-04-24) — Unit-tests lane.  Closed
  queue items #3 and #4 from session 112.  **+2 regression
  guards** in `test-types.mjs` at the `:2068`/`:2074` TRUNC
  sites (migrated to `assertThrows(/TRUNC expects 2 argument/)`
  + new `/got 1\b/` / `/got 3\b/` guards pinning the actual-
  arg-count tail of the error message — previously uncovered).
  **+4 regression guards** in `test-persist.mjs` at the :118
  unknown-version site (added local `assertThrows` helper,
  migrated to pattern-matching + 3 new adjacent reject-branch
  guards: echo-bad-version, missing-version, `null`/`string`
  snap → "not an object").  **P-001 remainder cleared for
  `docs/TESTS.md`**: fixed two stale `src/…` → `www/src/…`
  references at lines 233 / 355.  **O-009 deferred** — `rm`
  of the two `tests/test-control-flow.mjs.bak{,2}` files blocked
  in unsupervised mode (`Operation not permitted`; permission
  tool requires user-present approval).  Final test-all
  **4089 / 0**; test-persist 38 / 0 (+4 from 34); sanity 22 / 0.
  Log file: `logs/session-117.md`.
- Session 112 (2026-04-24) — this run.  Unit-tests lane.  Closed
  queue item #6 from session 107 — the `assertThrows` migration in
  smaller files.  **+52 inline `try/catch/threw` sites migrated**
  across 10 files: `test-variables.mjs` (13), `test-lists.mjs` (15),
  `test-binary-int.mjs` (12), `test-eval.mjs` (2), `test-ui.mjs` (2),
  `test-stats.mjs` (2), `test-entry.mjs` (1), plus leftover sites
  in `test-algebra.mjs` (3), `test-numerics.mjs` (1).
  Behaviour-preserving except for **+1 new regression guard** in
  `test-numerics.mjs` at :2118 — split the LOG(-10)-CMPLX-OFF
  one-assertion-two-checks site into `assertThrows(…, /Bad argument
  value/)` + a follow-up `assert(err.name !== 'TypeError', …)`.
  Confirmed HALT/CONT flake non-reproduction: `flake-scan 5` →
  3919 stable-ok, 0 flakes; cumulative clean-run count for the
  filing now 30+ runs plus 24 bisect shuffles.  Final suite
  **3981 / 0**; persist 34 / 0; sanity 22 / 0.  Log file:
  `logs/session-112.md`.
- Session 107 (2026-04-24).  Unit-tests lane.  Cleared
  queue item #2 (the `test-algebra.mjs` migration) — all **53 inline
  `try/catch/threw` sites migrated to `assertThrows()`**,
  behaviour-preserving (891 pre/post); Python migration script
  saved at `outputs/migrate.py`.  Added **+15 Rational (Q)
  assertions to `test-comparisons.mjs`** (80 → 95) — the promotion-
  lattice peer had zero prior coverage in this file despite being
  first-class since s092: Q×Q canonicalisation, Q×Z / Q×R cross-
  type equality, sign-crossing ordering, ≠/<>, SAME pinned non-
  strict as regression guard opposing BinInt SAME-is-strict-type.
  Migrated **3 inline `try/catch/threw` sites** in `test-types.mjs`
  at the three `let threw = null` rejection sites
  (STO / STO / CRDIR Invalid-name), behaviour-preserving; the two
  TRUNC sites interpolating `${threw?.message}` deliberately left.
  Confirmed `test-numerics.mjs` migration (queue #1) already
  cleared pre-s107 (~146 `assertThrows` calls present, zero
  inline remaining).  Final suite **3886 / 0**; persist 34 / 0;
  sanity 22 / 0.  Log file: `logs/session-107.md`.
- Session 084 (2026-04-23) — unit-tests lane.  Migrated
  **all 104 inline `assertThrows`-pattern sites in
  `tests/test-matrix.mjs`** to the `assertThrows()` helper —
  behaviour-preserving (347 passes before/after); queue item #1 from
  s075 fully cleared for this file.  Appended the 8-assertion
  `session084: KNOWN GAP — …` block to `tests/test-types.mjs`
  filing `==`/`SAME` on Program/Directory against the data-types
  lane (5 soft-asserts ready-to-flip + 3 hard regression guards;
  queue item #4 from s075).  Shipped `scripts/pre-commit.sh` —
  default = sanity smoke (~5 ms), `--full` adds the test-all suite,
  `--persist` adds the persist suite (queue item #5 from s075,
  rolled forward since s070).  Confirmed HALT/CONT flake non-
  reproduction: 10 flake-scan runs (3808 stable-ok) + 24 flake-bisect
  shuffle×trial invocations all `ok`; cumulative count 25+ — lodged
  recommendation with rpl-programming lane to close the filing.
  Final suite **3872 passing / 0 failing**; persist 34 / 0; sanity
  22 / 0 (5 ms).  Log file: `logs/session-084.md` (sessions 081
  command-support, 082 data-types, 083 rpl-programming claimed
  earlier today; 085 is a code-review lane that opened mid-run).
- Session 075 (2026-04-23) — unit-tests lane.  Shipped
  `tests/flake-bisect.mjs` + `tests/run-order.mjs` (test-ordering
  bisection harness; queue item #2 from s074).  Appended the 13-
  assertion DATA_TYPES ✗ rejection-sweep block to
  `tests/test-numerics.mjs` (queue item #3).  Migrated 12 inline
  `assertThrows`-pattern sites in 4 files (test-entry, test-units,
  test-comparisons, test-stats).  Flake-scan 5/5 clean; session-074
  HALT/CONT flake did not recur.  Final suite 3745 / 0; persist 34
  / 0; sanity 22 / 0 (5 ms).  Log file: `logs/session-079.md`.
- Session 074 (2026-04-23) — unit-tests lane.  Added per-file headline counts
  + resilient module-load handling to `test-all.mjs`; shipped
  `tests/flake-scan.mjs` (non-determinism detector, standalone);
  appended the 14-assertion BinInt == / SAME / comparator audit block
  to `test-binary-int.mjs` as KNOWN GAPs against `rpl5050-data-type-support`.
  Caught an intermittent HALT/CONT flake on the baseline run — did not
  reproduce across 8 subsequent runs under the new flake-scan
  harness; filed against `rpl5050-rpl-programming`.  Final suite
  3630 / 0; persist 32 / 0; sanity 22 / 0.  Log file:
  `logs/session-075.md` (the calendar-day session-074 log-file slot
  was already claimed by the rpl-programming lane's HALT/CONT/KILL
  pilot + CASE auto-close — per the session-066 convention this
  lane's log lands at the next free number; in-file assertion labels
  stay `session074:` to match the cohort).
- Session 070 (2026-04-23) — unit-tests lane.  Added
  `tests/sanity.mjs` (22), `tests/test-helpers.mjs` (43).  Grew
  `test-comparisons.mjs` (+29) and `test-types.mjs` (+65).  Lifted
  `assertThrows`, `rplEqual`, `runOp`, `runOpStack` into
  `tests/helpers.mjs`.  Fixed cross-lane import race in
  `tests/test-reflection.mjs`.  Final suite 3465 / 0; persist 32 / 0;
  sanity 22 / 0 (5 ms).  See `logs/session-070.md`.
- Session 066 (2026-04-23) — bootstrap of this file; added
  `test-stack-ops.mjs` (32), `test-stats.mjs` (20),
  `test-arrow-aliases.mjs` (19). Final suite 3192 passing / 0 failing;
  persist still green at 32.  See `logs/session-066.md`.
  (Sessions 062–065 are owned by sibling lanes — type-support for
  062–064, command-support for 065. This lane reclaims 066 as its
  bootstrap number. Session 067 is rpl-programming lane.)
