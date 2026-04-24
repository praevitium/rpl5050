# TESTS — RPL5050 unit-test lane notes

**Scope.** This file is the authoritative notes file for the `rpl5050-unit-tests`
scheduled-task lane. It tracks what tests exist, where the coverage gaps are,
which tests are known-flaky or known-failing, and what to pick up next run.

**Last updated.** Session 074 (2026-04-23).

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
| `rpl5050-data-types`     | widen existing ops' type surface            |
| `rpl5050-ui-development` | keypad, entry line, display, paging         |
| `rpl5050-rpl-programming`| User-RPL interpreter: Program, CASE/IF/LOCAL, HALT/CONT |
| `rpl5050-unit-tests`     | **this lane**                               |

---

## Coverage snapshot (session 074)

Baseline at lane start: `node tests/test-all.mjs` = **3616 passing / 0
failing** (grew +151 since session 073 — session-073 data-types lane
contributed +88, session-072 command-support contributed +44, the rpl-
programming lane's session-073 HALT/CONT pilot landed in
`test-control-flow.mjs` for ~+18, and a handful of other cross-lane
additions).  `node tests/test-persist.mjs` = 32 passing / 0 failing.
`node tests/sanity.mjs` = 22 passing / 0 failing in ~5 ms.

Final: `node tests/test-all.mjs` = **3630 passing / 0 failing** (+14
this lane — the BinInt == audit is 14 new assertions, all soft-asserted
as KNOWN GAPs because the data-types lane has not yet widened
`eqValues` / `comparePair` for BinInt).  `test-persist.mjs` unchanged;
`sanity.mjs` unchanged.  **Flake-scan harness confirms 8/8 identical
runs — 3566 unique-labelled assertions stable-ok across the cohort.**

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1333 | 0    | Largest file; CAS focus.                 |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  117 | 0    | **+14 this lane** (session074 BinInt == block). |
| test-comparisons.mjs        |   68 | 0    | +24 from s072 data-types lane (not this). |
| test-control-flow.mjs       |  149 | 0    | +33 from s073 rpl-programming HALT/CONT.  |
| test-entry.mjs              |   86 | 0    |                                          |
| test-eval.mjs               |   62 | 0    |                                          |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  171 | 0    |                                          |
| test-matrix.mjs             |  347 | 0    |                                          |
| test-numerics.mjs           |  553 | 0    | +20 from s072 (FLOOR/CEIL/IP/FP on Unit, %/%T/%CH V/M). |
| test-reflection.mjs         |  149 | 0    | +30 from s072 cross-lane cohort.         |
| test-stack-ops.mjs          |   32 | 0    |                                          |
| test-stats.mjs              |   20 | 0    |                                          |
| test-types.mjs              |  121 | 0    |                                          |
| test-ui.mjs                 |   73 | 0    |                                          |
| test-units.mjs              |   39 | 0    |                                          |
| test-variables.mjs          |  248 | 0    |                                          |
| **test-all (aggregate)**    | **3630** | **0** | 8 consecutive clean runs end-of-session. |
| test-persist.mjs (separate) |   32 | 0    |                                          |
| sanity.mjs (standalone)     |   22 | 0    | <5 ms smoke suite.                       |

Grand total assertions available across all runnable `.mjs` files
(excluding the aggregator itself): **3684** passing, 0 failing.

### Coverage heat-map notes

- **BinaryInteger equality** is a new KNOWN-GAP cluster.  All 14 new
  session-074 assertions in `test-binary-int.mjs` soft-assert: `#FFh ==
  #FFh` → 0 today (HP50 expected: 1), because `eqValues()` in
  `src/rpl/ops.js` has no BinInt branch and `isNumber` in
  `src/rpl/types.js` L230 deliberately excludes BinInt.  Parallel gap
  on `comparePair` — `#1h < #2h` throws `Bad argument type`.  Both
  filed against `rpl5050-data-types` below.
- **Per-file headline counts now ship in `test-all.mjs`** (session 074;
  was session-068 queue item #1).  The aggregator reports every file
  with its pass/fail tally, plus a resilient module-load crash block so
  a single file's import-time throw no longer masks everyone else.
- **Flake-scan harness now ships as `tests/flake-scan.mjs`** (session
  074; was session-068 queue item #5).  `node tests/flake-scan.mjs [N
  [--quiet]]` runs the suite N times in fresh child processes and
  reports any assertion that saw mixed ok/FAIL outcomes across the run
  set.  On the baseline run starting this session, a HALT/CONT flake
  appeared on one invocation and did not reproduce on 8 subsequent —
  file a flake-scan invocation into any future scheduled run where
  determinism is in doubt.

---

## Known gaps (open items)

### Assigned to `rpl5050-data-types`

1. **String lexicographic `<` / `>` / `≤` / `≥`** — (rolled forward
   from s073 queue).  HP50 User Guide App-J documents char-code lex
   order. `comparePair()` rejects Strings with `Bad argument type`.
   Test: `tests/test-comparisons.mjs` KNOWN GAP marker around the
   original session 068 block.  Soft-asserted; flip to hard once
   widened.
2. **BinaryInteger `==` / `SAME`** — (NEW this session, session 074).
   `eqValues()` has no BinInt branch → `#FFh == #FFh` returns 0.  HP50
   AUR §4-1 says display base is not semantic; `==` must compare
   masked numeric values.  Cross-type `#10h == Integer(16)` should
   widen to numeric-family compare and also return 1.  SAME should
   return 1 on same-typed same-value BinInts and 0 cross-type.  Test
   file: `tests/test-binary-int.mjs` session074 block (14 assertions,
   most soft-asserted as KNOWN GAP).  Fix is a one-branch add to
   `eqValues` after the `isNumber && isNumber` branch.
3. **BinaryInteger `<` / `>` / `≤` / `≥`** — (NEW this session).
   `comparePair()` rejects BinInt with `Bad argument type`.  HP50 AUR
   §4-1 says ordered compare on BinInts uses masked numeric value.
   Soft-asserted in the session074 block — accepts throw or the
   ordered-compare result.  Fix: widen `comparePair` in the same pass
   that adds the BinInt eqValues branch.
4. **`==` / `SAME` on Program, Directory** — (rolled forward from s073
   queue).  Program == could reuse `_eqArr` on tokens.  Directory is
   live-mutable; HP50 says two Directories are SAME iff same object
   (reference identity).  Read AUR §4-7 before widening.
5. **Dim-equivalence `==` on Units** — (rolled forward from s073).
   `1_m == 1_km` = 0 today by design (strict structural); a separate
   `UEQUAL` op or flag would give dimension-aware equality.  Low
   priority.

### Assigned to `rpl5050-rpl-programming`

- **Flake watch continues — HALT/CONT ordering dependency.**  On the
  first baseline run of session 074 the aggregator threw
  `RPLHalt` escaping out of the second `CONT` call in the "HALT + CONT
  round-trip" test in `tests/test-control-flow.mjs` (~L1830).  The
  HALT/CONT-pair test block passed standalone, and 8 consecutive full-
  suite reruns after that were clean.  Classic order-dependency: some
  prior file leaks state that causes evalRange to treat the second
  HALT as inside-a-control-structure on that particular run.
  - Repro command: `node tests/flake-scan.mjs 20` and look for any
    flaky-outcome labels under `session073:` naming CONT.
  - If it recurs, suspect angle-mode / `_localFrames` / halted-slot
    state left by an upstream test file.
  - Currently no action required from this lane; filed for visibility.

### Assigned to `rpl5050-command-support` / `rpl5050-data-types`

No new missing-op gaps flagged this run.  (The coverage sweep revealed
no zero-coverage ops in `docs/COMMANDS.md` — the lanes have kept up.)

### Harness / test-plumbing (own items — `rpl5050-unit-tests`)

1. **~~No `sanity.mjs` smoke file~~** — ✅ session 070.
2. **~~`helpers.mjs` is minimal~~** — ✅ session 070.
3. **~~No per-file headline counts in `test-all.mjs`~~** — ✅ session
   074.  Each file reports its pass/fail count; module-load crashes
   are caught and reported without knocking out the rest.
4. **~~No flake-detection harness~~** — ✅ session 074.  Use
   `node tests/flake-scan.mjs [N] [--quiet]`.  Standalone; not wired
   into `test-all.mjs` or `sanity.mjs`.
5. **Audit ~40 inline `assertThrows`-pattern sites and migrate.**
   (rolled forward from s068/s070 queue).  Helpers now exist; the
   migration is mechanical refactor across every test file.  Best done
   file-by-file in future sessions to keep each diff small.
6. **Duplicate-label hygiene.**  Session 074 flake-scan reports 3566
   unique labels out of 3630 assertions — 64 duplicate labels across
   test files.  Not a correctness concern (flake-scan's duplicate
   handling prefers FAIL on collision), but confusing for
   `grep`-based attribution.  Low priority — fix opportunistically
   when editing a file for other reasons.
7. **Wire `sanity.mjs` into a pre-commit-style script.** (rolled
   forward from s070 queue).  Currently standalone.  Add `npm run
   sanity` or a shell entry point; scheduled tasks could run this as
   a cheap 5-ms gate before the full 3630-assertion suite.

---

## Mid-session events (session 074)

- **Baseline-run HALT/CONT flake** — see the rpl-programming lane gap
  above.  Noted, not acted on.
- **No cross-lane import races this run.**  `test-all.mjs` import
  order processed cleanly on every flake-scan invocation.
- **Aggregator architecture change.**  `test-all.mjs` was rewritten to
  use a dynamic-import loop with per-file counter snapshotting.  All
  existing tests continue to pass; the assertion-counting semantics
  are byte-for-byte identical (same shared `state` object in
  `helpers.mjs`, same `state.passed++` / `state.failed++`).

---

## Known flakes

One intermittent event observed on the **first** baseline run this
session (one in 9 total runs: the initial node invocation then 8
flake-scan iterations): `session073: first CONT runs 2 + → 3, re-hits
HALT` in `tests/test-control-flow.mjs` threw `RPLHalt` instead of
returning.  Did not reproduce across the subsequent 8 runs.

Logged against `rpl5050-rpl-programming` (above) as a lane-owned bug;
the test is genuinely correct per HP50 AUR p.2-52.  The unit-test lane
has shipped `tests/flake-scan.mjs` this session so future sightings
can be bisected via `node tests/flake-scan.mjs 20`.

---

## Next-session queue (priority order)

1. **Migrate inline `assertThrows`-pattern sites to the new helper.**
   ~40 sites across test files, file-by-file. Start with
   `test-matrix.mjs` (13 sites), `test-numerics.mjs` (8 sites), then
   work outward. No behavior change; shrinks diff noise on future
   failing-assertion updates.

2. **Flake-bisect the HALT/CONT ordering dependency.**  Write a
   bisection harness that shuffles the `FILES` list in `test-all.mjs`
   and reports the minimal prefix that reproduces the flake.  Builds
   on top of `tests/flake-scan.mjs`.  Ideal future output: "prefix
   [test-numerics, test-comparisons, test-variables, test-eval] before
   test-control-flow reproduces 3/10 runs; shorter prefixes do not."

3. **Expand rejection tests where `docs/DATA_TYPES.md` has a `✗`.**
   (rolled from s068/s070 queue).  The data-types file now lists
   several "deliberately rejected" cells (e.g. `%/%T/%CH V/M`,
   `FLOOR/CEIL/IP/FP on Complex`).  Verify each has a matching
   rejection assertion in the test tree.  The data-types lane has
   been adding these alongside its widening work; the test lane should
   sweep through once and confirm the mapping is 1:1.

4. **Flip BinInt == soft-asserts to hard after the sibling fix lands.**
   Once `rpl5050-data-types` widens `eqValues` for BinInt, flip the 8
   soft-asserts in the session074 `test-binary-int.mjs` block to
   `assert(got === 1, …)` (and the rejection case to `assert(got ===
   0)`).  Similarly flip the BinInt `<` comparator probe to a hard
   `assert(s.peek().value === 1)`.

5. **Wire `sanity.mjs` into a pre-commit-style script.** (rolled
   forward).  Standalone today.  A `scripts/pre-commit.sh` or an
   `npm run sanity` entry keeps the 5-ms gate reachable without the
   explicit path.

6. **Duplicate-label cleanup.**  64 labels are reused across files;
   makes per-file attribution fuzzy.  Opportunistic fix during other
   edits.

---

## Session-by-session log index

- Session 074 (2026-04-23) — this run.  Added per-file headline counts
  + resilient module-load handling to `test-all.mjs`; shipped
  `tests/flake-scan.mjs` (non-determinism detector, standalone);
  appended the 14-assertion BinInt == / SAME / comparator audit block
  to `test-binary-int.mjs` as KNOWN GAPs against `rpl5050-data-types`.
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
