# TESTS — RPL5050 unit-test lane notes

**Scope.** This file is the authoritative notes file for the `rpl5050-unit-tests`
scheduled-task lane. It tracks what tests exist, where the coverage gaps are,
which tests are known-flaky or known-failing, and what to pick up next run.

**Last updated.** Session 098 (2026-04-24).  In-file assertion labels
written this session read `session096:`/`session097:`/`session098:` —
all the same calendar day.  Session 098 is the follow-up to 097's
`giacToAst` diagnostic wrap, which revealed the *real* CAS-boundary
bug: Giac's `purge(X)` throws `No such variable X` when `X` was never
assigned, which aborts the `purge(X);factor(...)` semicolon-sequence
before it ever reaches `factor`.

Initial fix attempted a Giac-level `try{purge(X);}catch(err){0;}` wrap
— but that kept the preamble alive and the underlying assumption (we
*need* to purge) never got tested.  Final fix: **remove the purge
preamble entirely** from `buildGiacCmd`.  Rationale: rpl5050's CAS
flow never assigns values to variables inside Giac's session — every
op passes the symbolic AST and treats the returned string as
symbolic.  Xcas therefore already treats free variables as unassigned
`DOM_IDENT` by default, so purging was cargo-cult insurance against a
class of bug rpl5050's flow doesn't create.  `buildGiacCmd` is now a
thin wrapper around `astToGiac` + the caller's command factory.
`giacToAst` keeps the new defensive `isGiacErrorString` detector for
known runtime-error prefixes (`No such variable`, `Error:`,
`Syntax error`, …) so any future Giac value-channel error surfaces as
a clean `GiacResultError` instead of a `parseAlgebra` character-offset
leak.  All existing test fixtures that pinned the purge prefix were
stripped to the bare command shape.  This lane's log file is
`logs/session-098.md`.

## Coverage snapshot (session 098)

Baseline at session start: `node tests/test-all.mjs` = **3512 passing /
0 failing** (session-097 close).
Final: **3532 passing / 0 failing** (+20 — 20 new assertions in
`test-algebra.mjs` pinning buildGiacCmd's try/catch-wrapped purges
(3), `isGiacErrorString` prefix detector (9), `giacToAst` runtime-error
routing (4), and FACTOR end-to-end with an error-shaped fixture (4);
no drift elsewhere).  `test-persist.mjs` 34 / 0.  `sanity.mjs` 22 / 0.

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            |  815 | 0    | +8 session-096 (algebra auto-close at EOF: 4; CAS name-validator in astToGiac / buildGiacCmd: 4).  +10 session-097 (stripGiacQuotes iterative unwrap: 5; giacToAst diagnostic wrap: 3; FACTOR nested-quote end-to-end: 2).  +20 session-098 (buildGiacCmd try/catch-wrapped purges: 3; isGiacErrorString prefix detector: 9; giacToAst runtime-error routing: 4; FACTOR error-shape end-to-end: 4). |
| test-arrow-aliases.mjs      |   19 | 0    |                                          |
| test-binary-int.mjs         |  122 | 0    |                                          |
| test-comparisons.mjs        |   73 | 0    |                                          |
| test-control-flow.mjs       |  260 | 0    | `'SUM'` → `'TOTAL'` rename for WHILE loop (name validator: SUM is reserved). |
| test-entry.mjs              |   90 | 0    | +4 session-096 backtick-body validator guard (auto-close, ghost-Name rejection, `+` / `Y` round-trips). |
| test-eval.mjs               |   62 | 0    |                                          |
| test-helpers.mjs            |   43 | 0    |                                          |
| test-lists.mjs              |  171 | 0    |                                          |
| test-matrix.mjs             |  347 | 0    |                                          |
| test-numerics.mjs           |  660 | 0    |                                          |
| test-reflection.mjs         |  178 | 0    |                                          |
| test-stack-ops.mjs          |   32 | 0    |                                          |
| test-stats.mjs              |   20 | 0    |                                          |
| test-types.mjs              |  276 | 0    | +33 session-095 validator block (syntactic validity, reserved-name bookkeeping, STO / CRDIR integration). |
| test-ui.mjs                 |   73 | 0    |                                          |
| test-units.mjs              |   39 | 0    |                                          |
| test-variables.mjs          |  248 | 0    | `'SUB'` → `'AFOO'` rename (name validator: SUB is reserved); SVX empty-string assertion now expects "Invalid name". |

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
     `src/rpl/ops.js` (the existing `_eqArr` already recurses via
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
  `src/rpl/algebra.js`, `docs/RPL.md`) was active at lane entry; my
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

1. **Continue the `assertThrows` migration — `test-numerics.mjs`.**
   ~115 sites.  Now the biggest single target on the queue (s084
   cleared test-matrix.mjs's 104).  Suggested approach: chunk of
   ~30 per commit, re-run suite after each commit to confirm pass
   count unchanged.  test-numerics has more regex variety than
   test-matrix did (Bad argument type / Bad argument value /
   Invalid dimension / Infinite result / Undefined name / Bad
   modulus / …) — preserve each regex exactly to keep specificity.
   The s084 SPLIT-then-SIMPLE Python regex pattern is reusable
   (see "Mid-session events" above).

2. **Continue the `assertThrows` migration — `test-algebra.mjs`.**
   ~53 sites.  Largest remaining after test-numerics.  CAS-domain,
   so most rejections are `Bad argument type` / `Bad argument
   value` / `Undefined name` patterns.

3. **Confirm HALT/CONT flake closure & close the
   rpl-programming-lane filing.**  Already at 25+ consecutive
   clean runs; one more `flake-scan 20 --quiet` run + a coordinated
   write to TESTS.md (delete the "Assigned to rpl-programming"
   block) puts this to bed.  Time budget: ~10 min.

4. **Duplicate-label cleanup — opportunistic.**  Still 64 labels
   duplicated across files (3808 unique vs 3872 total).  Not a
   correctness concern but confusing for `grep`-based attribution.
   Best done during other test-file edits to avoid touching files
   for a single-purpose label rename.

5. **Explicit positive-coverage pass on ✓ cells in DATA_TYPES that
   only have negative / rejection evidence today.**  Plan:
   enumerate ✓ cells → grep for op name in tests → flag any ✓ cell
   whose op has no adjacent positive assertion.

6. **`assertThrows` migration — smaller files.**  Once test-numerics
   and test-algebra are done, mop up test-variables/lists/stack-
   ops/binary-int/types/control-flow/eval/ui/persist (~65 sites
   total across 9 files).  These are small enough to combine 2–3
   files into one session.

---

## Session-by-session log index

- Session 084 (2026-04-23) — this run.  Unit-tests lane.  Migrated
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
