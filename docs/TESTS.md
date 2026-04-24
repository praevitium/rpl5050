# TESTS — RPL5050 unit-test lane notes

**Scope.** This file is the authoritative notes file for the `rpl5050-unit-tests`
scheduled-task lane. It tracks what tests exist, where the coverage gaps are,
which tests are known-flaky or known-failing, and what to pick up next run.

**Last updated.** Session 066 (2026-04-23, bootstrap).

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

## Coverage snapshot (session 066)

Ran `node tests/test-all.mjs` and `node tests/test-persist.mjs` standalone
after all sibling-lane work for 2026-04-23 had settled.

| File                        | OK   | FAIL | Notes                                    |
|-----------------------------|------|------|------------------------------------------|
| test-algebra.mjs            | 1333 | 0    | Largest file; CAS focus.                 |
| test-arrow-aliases.mjs      |   19 | 0    | **new this lane, session 066**           |
| test-binary-int.mjs         |  103 | 0    |                                          |
| test-comparisons.mjs        |   15 | 0    | Thin — candidate for expansion.          |
| test-control-flow.mjs       |   90 | 0    | Session-064 CASE tests now green (rpl-programming fix). |
| test-entry.mjs              |   86 | 0    |                                          |
| test-eval.mjs               |   62 | 0    |                                          |
| test-lists.mjs              |  171 | 0    |                                          |
| test-matrix.mjs             |  347 | 0    | Second-largest.                          |
| test-numerics.mjs           |  452 | 0    | +37 this day from command-support lane (COMB/PERM/IDIV2/UTPN). |
| test-reflection.mjs         |   66 | 0    |                                          |
| test-stack-ops.mjs          |   32 | 0    | **new this lane, session 066**           |
| test-stats.mjs              |   20 | 0    | **new this lane, session 066**           |
| test-types.mjs              |   56 | 0    | Thin — candidate for expansion.          |
| test-ui.mjs                 |   73 | 0    |                                          |
| test-units.mjs              |   39 | 0    |                                          |
| test-variables.mjs          |  248 | 0    |                                          |
| **test-all (aggregate)**    | **3192–3198** | **0** | Baseline at this lane's session start was 3037 → final 3192 (+155: 71 from this lane, 84 from sibling lanes finishing during the same day). Count drifted up to 3198 by the end of the log-writing step as another sibling-lane batch landed in the uncommitted tree; still all green. |
| test-persist.mjs (separate) |   32 | 0    |                                          |

Total assertions across all runnable `.mjs` files (excluding the aggregator
itself): **3224** passing, 0 failing.

### Coverage heat-map notes

- Arithmetic / numerics / algebra: **well covered** (total >2100 assertions).
- Stack manipulation: **previously zero-coverage** on OVER, ROT, ROLL, ROLLD,
  DUP2, DROP2, DROPN, DUPN, NIP, PICK, PICK3, UNPICK, NDUPN, DEPTH, CLEAR,
  LASTSTACK. Covered this run by `test-stack-ops.mjs`.
- Statistics accumulators: **previously zero-coverage** on ΣX / ΣX² / ΣY /
  ΣY² / ΣXY / NΣ / MAXΣ / MINΣ and their ASCII aliases (SX / SX2 / …).
  Covered this run by `test-stats.mjs`.
- Arrow-op ASCII aliases: verified for 16 op pairs this run in
  `test-arrow-aliases.mjs`.

---

## Known gaps (open items)

### Assigned to `rpl5050-rpl-programming`

No open items. The earlier observed transient failure of the nested
CASE-in-IF and CASE-in-CASE tests (`tests/test-control-flow.mjs`
session-064 tests at lines ~1079 and ~1126) stopped reproducing once the
rpl-programming lane's own session-065 fixes to `runCase` / IF landed in
the uncommitted tree. Keep on the watch-list — if they start failing
intermittently again, downgrade to `.skip` with a pointer and re-file.

### Assigned to `rpl5050-data-types`

No open items this run. Type-widening tests are growing alongside each
`hp50-type-support` session's additions to `test-numerics.mjs`.

### Assigned to `rpl5050-command-support`

No new ops flagged as untested this run. Spot-check pass is queued (see
"Next-session queue").

### Harness / test-plumbing (own items — `rpl5050-unit-tests`)

1. **No `sanity.mjs` smoke file.** The charter mentions `sanity.mjs` (smoke)
   as in-scope. It doesn't exist in the repo yet. Candidate to bootstrap
   next run with a minimal "import everything, construct a Stack, push a
   Real, run a few ops" suite that exits in well under a second — useful
   for pre-commit / scheduled-task startup.
2. **No per-file headline counts in `test-all.mjs`.** Right now the aggregator
   only prints one final number. Adding a short per-file tally would make
   regressions in a single area immediately visible. Small, isolated harness
   improvement.
3. **`helpers.mjs` is minimal** — just `assert` + a shared counter. Candidate
   helpers that are re-invented across files:
   - `runOp(opName, ...preStack)` → pushes args, runs op, returns `peek()`.
     (Handwritten in every file as a 3-liner.)
   - `rplEqual(a, b)` deep-equal for RPL values (I wrote a version inside
     `test-arrow-aliases.mjs` this run — lift to `helpers.mjs` when a second
     file needs it).
   - `assertThrows(fn, pattern, msg)` → consolidate the
     `let threw = false; try { … } catch (e) { threw = /.../.test(e.message) }`
     pattern that appears dozens of times.

---

## Known flakes

| Test file / id                                      | Symptom                          | State as of session 066              |
|-----------------------------------------------------|----------------------------------|--------------------------------------|
| `test-control-flow.mjs` session-064 CASE-in-IF tests| Failed once on first full-suite run early in session 066; stopped reproducing after 10+ consecutive clean runs (coincides with rpl-programming lane's fix landing). | Watch-list; no longer a hard failure. |

No other flakes observed in this run.

---

## Next-session queue (priority order)

1. **Bootstrap `sanity.mjs`.** Small, self-contained smoke file. Goal: a
   sub-200-ms sanity check that a future pre-commit hook can call.
   Assertions should hit the obvious-regression surface: push/pop a Real,
   run `+`, `SIN`, `→STR`, parse `« 1 2 + »`, evaluate it, and check the
   result is `Integer(3)`.

2. **Grow `test-comparisons.mjs` (currently 15 assertions).** Candidate
   additions per HP50 AUR §4:
   - `==` / `≠` on Complex pairs (both real-valued and truly complex).
   - `==` on List and Vector (structural equality on containers).
   - `SAME` vs `==` on Symbolic — SAME is strictly structural, `==` is
     not defined on abstract symbolic and should raise.
   - `<` / `>` / `≤` / `≥` chain lift on Symbolic operands (should produce
     a single combined Symbolic per session-034 semantics).
   - Error path: `<` on two Strings → HP50 lexicographic or Bad argument
     type? (Check PDF first.)

3. **Grow `test-types.mjs` (currently 56 assertions).** TYPE/VTYPE/KIND
   are covered thinly. Candidate: table-drive a (value, expectedCode)
   pairs list across all 20+ HP50 type codes from AUR §3-44.

4. **Expand rejection tests where `docs/DATA_TYPES.md` has a `✗`.** The
   data-types file now lists several "deliberately rejected" cells (e.g.
   FLOOR on Complex). Verify each has a matching rejection assertion. The
   data-types lane has been adding these alongside its widening work; the
   test lane should sweep through once and confirm the mapping is 1:1.

5. **Harness cleanup — consolidate `assertThrows`.** Pull the pattern out
   of the ~40 sites that inline it into a helper in `helpers.mjs`. Pure
   refactor, no behavior change — but makes flake diagnostics easier
   (single place to add per-site logging).

6. **Investigate whether there's a hidden test-ordering dependency.** The
   session-064 CASE nesting flake hints at one. Try running each test file
   in isolation vs inside `test-all.mjs` and diff the pass/fail sets. If
   any test passes standalone but fails in aggregate (or vice versa), the
   ordering pollution is real and we surface it.

---

## Session-by-session log index

- Session 066 (2026-04-23) — bootstrap of this file; added
  `test-stack-ops.mjs` (32), `test-stats.mjs` (20),
  `test-arrow-aliases.mjs` (19). Final suite 3192 passing / 0 failing;
  persist still green at 32.
  See `logs/session-066.md`.
  (Sessions 062–065 are owned by sibling lanes — type-support for 062–064,
  command-support for 065. This lane reclaims 066 as its bootstrap number.)
