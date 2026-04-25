# REVIEW.md — RPL5050 code-review lane running ledger

**Scope.** This file is the authoritative ledger for the
`rpl5050-code-review` scheduled-task lane. It records audit findings
across the whole repo, classified into the six lane buckets
(`User Interface`, `Commands`, `Data Types`, `RPL`, `Unit Tests`,
`Other`), so the sibling implementer lanes can pick them up as a group.

**Last updated.** Session 143 (2026-04-25).  Twelfth review-lane
run.  Prior baseline = session 138.  Between sessions 138 and 143
the sibling lanes shipped: 139 (command-support — three new ops
shipped via Giac: `LIN` (exponential linearization, single-arg,
mirrors `PROPFRAC` / `PARTFRAC` / `COSSIN`), `LIMIT` (limit at a
point, two stack-contract forms — equation `'var=val'` and bare-
value with VX default), and the `lim` lower-case alias delegating
to `LIMIT.fn(s)` (case-sensitive, mirrors the `CHARPOL` / `XNUM` /
`XQ` alias pattern); +13 assertions in `tests/test-algebra.mjs`;
`register()` total 463 → 466 (+3); top-level `^register(` count
442 → 445 (+3); also closed `C-009` in full — three loop rows
(`FOR / START / STEP / NEXT`, `WHILE / REPEAT / END`, `DO / UNTIL
/ END`) at `docs/COMMANDS.md:450` / `:451` / `:452` gained
session-136 auto-close Notes annotations; Counts heading bumped
"as of session 134 — 2026-04-24" → "as of session 139 —
2026-04-25"; session-log entries back-filled for 135 / 136 / 137
/ 138 / 139); 140 (data-type-support — three more hard-assertion
widening clusters pinning previously-undertested wrapper-VM
composition contracts: hyperbolic family Tagged-of-V/M wrapper-VM
composition (SINH / COSH / TANH / ASINH / ACOSH / ATANH — 9 pins,
including the EXACT-mode `_exactUnaryLift` Integer-stay-exact
path under Tagged-V and inner-Tagged-inside-Vector rejection),
inverse-trig Tagged-of-V/M (ASIN / ACOS / ATAN) plus EXPM
Tagged-of-V/M closing the LNP1/EXPM dual pair (9 pins), and
ARG bare V/M axis + ARG / CONJ / RE / IM Tagged-of-V/M through
the 2-deep-bespoke `_withTaggedUnary(_withListUnary(bespoke V/M
dispatch))` wrapper distinct from the 3-deep wrapper of clusters
1/2 (18 pins); `tests/test-types.mjs` 703 → 739 (+36); no
source-side changes; `docs/DATA_TYPES.md` Last-updated bumped
to session 140 with six Notes columns updated and a "Resolved
this session (140)" block added); 141 (rpl-programming —
**HALT / PROMPT lift through `IFERR` clauses pinned with
regression tests** (the lift mechanism itself was already live
since session 088's generator substrate plus session 078's IFERR
auto-close, but no test pinned the behaviour); +76 session141
assertions in `tests/test-control-flow.mjs` (599 → 675) covering
HALT in trap / THEN / ELSE clauses (full-form and auto-closed
variants), nested-IFERR last-error save/restore chain across
nested `finally`s on CONT and KILL, PROMPT in THEN, and a
sentinel pin that yield is not a thrown exception so IFERR's
catch must not capture HALT; **R-005 doc cleanup also shipped
in this run** — three "(this run) — what shipped" headings in
`docs/RPL.md` (sessions 121 / 126 / 136) demoted to plain past
tense + Session log pointer prose updated; new "Session 141
(this run) — what shipped" chapter added at `:258`; no
`www/src/rpl/ops.js` source change this run); 142 (unit-tests
— **active at run-entry** — substantive coverage adds across
`test-types.mjs` / `test-arrow-aliases.mjs` / `test-stack-ops.mjs`
/ `test-stats.mjs` / `test-units.mjs` / `test-comparisons.mjs`
plus `docs/TESTS.md` updates).  Session 142's lock was active at
this run's acquisition (heartbeatAt === startedAt = 1777107415,
no `released: true`, scope held `docs/TESTS.md` + the broad
`tests/*.mjs` set + `logs/session-142.md`); review-lane narrowed
its scope to `docs/REVIEW.md` only (mirroring the session-138
vs. session-137 and session-133 vs. session-132 patterns) and
the session log file `logs/session-143.md` was written without
a lock under the `utils/@locks/README.md:40` "logs/ are append-
only with unique filenames" exemption.

Carry-over from session 103: the project tree was relocated —
`src/` → `www/src/`.  All Where: lines filed prior to session 099
referenced the old `src/...` paths; each open finding below has
been re-verified at the new path.  Historical Where: lines are
preserved verbatim as the audit trail.

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

**Baseline (session 143).** Sessions 139, 140 graceful-released
before this run's acquisition; session 141 released with the
heartbeatAt === startedAt + intent="items TBD" + late-mtime-on-log
signature that O-008 / O-010 / T-002 codified as "looks stale-
prune-shaped at the lock layer but the log was in fact written"
— `logs/session-141.md` is on disk (226 lines, mtime 2026-04-25
08:59 — within seconds of `releasedAt: 1777107556` per the lock
body); session 142 (unit-tests) was active at run-entry with a
wide `tests/*.mjs` (test-types / test-arrow-aliases / test-stack-
ops / test-stats / test-units / test-comparisons) + `docs/TESTS.md`
+ `logs/session-142.md` scope.  At review-lane *entry*
`node tests/test-all.mjs` = **4711 passing / 0 failing**
(fully green); `node tests/test-persist.mjs` = **38 passing / 0
failing** (stable from the session-138 baseline of 38);
`node tests/sanity.mjs` = **22 passing / 0 failing in ~5 ms**
(stable).  `node --check` N/A this run — only edit is
`docs/REVIEW.md` (Markdown).  Δ from session 138's run-close
4586: **+125** (139 +13 LIN/LIMIT/lim Giac coverage in
`test-algebra.mjs`; 140 +36 hyperbolic-Tagged + inverse-trig +
EXPM + ARG/CONJ/RE/IM bespoke wrapper composition pins in
`test-types.mjs`; 141 +76 IFERR HALT/PROMPT lift pins in
`test-control-flow.mjs`; 142 +0 in-flight at this run's entry —
no `tests/*.mjs` deltas yet visible on disk; 4586 + 13 + 36 + 76
+ 0 = 4711).  Lock overlap during the run: at acquisition
(1777107439) session 142 was active with `heartbeatAt ===
startedAt` (1777107415, ~24 s before acquisition); session 142
had not yet landed any visible `tests/*.mjs` edits on disk by
run-entry.  Review-lane narrowed its scope to `docs/REVIEW.md`
to avoid `logs/` overlap with session 142's `logs/session-142.md`
claim; review-lane's edits to `docs/REVIEW.md` describe the
finding-state as it stood at session 142's lock-acquisition
moment.

**This run's own edits.** One doc/hygiene edit:
`docs/REVIEW.md` Last-updated stamp bumped to session 143;
baseline block rewritten; findings re-aged; three carried-
forward findings aged (X-003 11 → 12 runs — still the longest-
aging open finding, now 12 review-lane runs and 37+ calendar
days unaddressed; O-007 8 → 9 runs; O-009 5 → 6 runs); two
prior findings promoted to resolved:
  • **C-009** — closed in full by session 139's command-support
    run.  All three sub-items shipped: (1) loop-row Notes
    columns at `docs/COMMANDS.md:450` (`FOR / START / STEP /
    NEXT`), `:451` (`WHILE / REPEAT / END`), `:452` (`DO /
    UNTIL / END`) all now carry the session-136 auto-close
    annotation mirroring the session-083 IF row style; (2)
    Counts heading at `:24` bumped from "as of session 134 —
    2026-04-24" to "as of session 139 — 2026-04-25" with the
    `register()` count refresh 463 → 466 (+3 for LIN, LIMIT,
    lim) and `^register(` 442 → 445; (3) session-log entries
    back-filled for sessions 135 / 136 / 137 / 138 / 139 at the
    file end.  Same close shape as C-007 (session 128 → 129) and
    C-008 (session 133 → 134) — fifth iteration of the rpl-
    programming-lift-then-command-support-back-fill cycle, all
    five now closed.
  • **R-005** — closed in full by session 141's rpl-programming
    run.  Both pure-string edits shipped: (1) the three stale
    `## Session NNN (this run) — what shipped` headings at
    `docs/RPL.md:258` (session 121), `:358` (session 126), `:465`
    (session 136) all demoted to plain `## Session NNN — what
    shipped`; (2) the Session log pointer prose previously at
    `:1500` rewritten to past tense for session 131 ("Session
    131 was this lane (HALT/PROMPT lift through DOLIST / DOSUBS /
    STREAM bodies …)") at the now-`:1682` location, with new
    session-136 / session-141 footnotes appended.  Session 141
    additionally added a new "## Session 141 (this run) — what
    shipped" chapter at `:258` (the new sole `(this run)` holder).
    Pure comment / string drift; closed.
Two new findings filed:
  • **R-006** — `docs/RPL.md:348` carries a stale internal cross-
    reference: "Same run also updates the Session log pointer
    prose at `:1455` to demote `Session 131 is this run …`".
    Line 1455 in the current file is unrelated content
    ("Persistence of halted programs" — Generators are not
    serialisable via JSON, etc.); the actual demote target —
    "Session 131 was this lane …" — sits at line 1682.  This is
    drift introduced by session 141's own edit: the line numbers
    in the inline prose at `:348` were not refreshed after
    session 141's own +99-line chapter insertion (lines 258-356)
    plus the 76 new test-pin assertions' chapter expansions
    pushed the demote target down by ~200 lines.  Pure-string
    drift; safe doc edit for either the rpl-programming or the
    review lane.
  • **O-011** — third instance of the lock-body
    heartbeatAt-equals-startedAt + intent="items TBD" +
    log-mtime-equals-releasedAt signature (after O-008 session
    106 and O-010 session 121).  Session 141's lock body shows
    `heartbeatAt: 1777106701 === startedAt`, `released: true`,
    `releasedAt: 1777107556` (855 s = 14m 15s after start —
    well past the 10-min stale-prune threshold), with no
    `releaseReason` field; `logs/session-141.md` mtime is
    2026-04-25 08:59 (matches `releasedAt`).  The log content is
    real and substantive (226 lines), so the missing-log signal
    O-008 was meant to trigger does NOT apply this time — same
    as session 121 / O-010.  But the lock-layer signature is now
    the third occurrence of "looks stale-prune-shaped, log was
    in fact written" without the audit being able to disambiguate
    a graceful late-write from an actual stale-prune-with-late-
    log.  T-002's resolution paragraph (session 132) already
    flagged the future improvement: add a `releaseReason` field
    to the lock body so graceful release vs. prune is unambiguous
    for future audits.  This finding promotes that future-
    improvement note from a comment-in-passing to a tracked
    work item, owned by any lane that maintains
    `utils/@locks/lock.mjs` (no canonical owner — pick the
    lane currently editing that file).

Session 143 log added.  No sibling-lane source files touched.
No RPL op behavior changed, no types widened, no tests added
or deleted, no interpreter touched, no registrations added or
removed.

**Lock.** Held `utils/@locks/session143-code-review.json`
throughout, scope = `docs/REVIEW.md` only (narrower than the
canonical review-lane scope of `docs/REVIEW.md` + `logs/`
because session 142 unit-tests is holding `logs/session-142.md`
at this run's acquisition — same tooling pattern as session 138
vs session 137, session 133 vs session 132, and session 128 vs
session 127; the helper accepts `docs/REVIEW.md`-only as non-
overlapping; the session log file `logs/session-143.md` is
written without a lock under the `utils/@locks/README.md:40`
"logs/ are append-only with unique filenames" exemption, with
a unique filename so no real conflict exists).  Sibling locks
at run-entry: session 142 unit-tests (active — holds the broad
`tests/*.mjs` set + `docs/TESTS.md` + `logs/session-142.md`);
sessions 129 – 140 all released gracefully; session 141 released
with the late-mtime signature documented in O-011 above (log
on disk, lock-layer ambiguity flagged for fix).  Released at
end of run.

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
- **Age.** 3 runs. **Status.** resolved session-099 — the command-
  support lane rewrote the step-4 instruction.  Verified session 103:
  `grep -n COMMANDS_INVENTORY docs/@\!MY_NOTES.md` returns zero hits;
  the remaining `COMMANDS_INVENTORY` mentions in the tree are all
  audit-trail references inside `docs/COMMANDS.md`'s own session-log
  and inside this REVIEW.md.

### O-005  `index.html` comments reference nonexistent `js/` directory

- **Classification.** User Interface (comment-only).
- **Where.** `index.html:45,50,54`.
- **What.** Three HTML comments said `rendered by js/keyboard.js`;
  real path is `src/ui/keyboard.js`.
- **Why.** Broken doc trail for new readers.
- **Fix.** Replaced three occurrences.  Shipped session 080.
- **Confidence.** high.
- **Age.** 2 runs. **Status.** resolved session-080.

### O-007  `www/src/rpl/cas/giac-convert.mjs` `buildGiacCmd` block-comment contradicts the body

- **Classification.** Other (comment drift).
- **Where.** `www/src/rpl/cas/giac-convert.mjs:230-252` (header
  block), vs. `:283-295` (post-return comment).
- **What.** The block comment immediately above `buildGiacCmd` is
  titled "Safe caseval command builder — purge free variables first"
  and spends 22 lines explaining why the builder prepends
  `purge(v1);purge(v2);…` to every caseval.  Session 098
  deliberately removed the purge preamble because Xcas raises
  `No such variable X` when `purge` runs for an unassigned name.
  The function body at `:280-282` now just validates `extraVars`,
  calls `astToGiac`, and returns `buildCmd(giacExpr)` — no purge.
  A second comment at `:283-295` correctly explains the removal and
  conditions under which it might be reintroduced.  The two comments
  sit on opposite sides of a two-line function body and contradict
  each other.
- **Why.** A reader approaching the function top-down reads 22 lines
  describing a purge preamble that does not exist, reaches a
  2-line function body, and has to scroll past the body to the
  second comment to discover the top block is stale.  The
  session-098 memory note ("Giac — no purge preamble, question
  'insurance' machinery") codified this as an intentional design
  choice; the stale top block obscures that intent.
- **Fix.** Rewrite the top block — either delete the purge
  narrative and leave only the session-098 rationale inline, or
  demote the old narrative to a short "historical: prior versions
  prepended `purge(…)`; session 098 removed this because…" note.
  Either form is a pure-comment edit safe for the review lane or
  the cas lane to ship.
- **Confidence.** high — both blocks read in situ session 103;
  re-verified session 108 (block at `:230-252` still leads with
  "Safe caseval command builder — purge free variables first" while
  the body at `:280-282` is the bare `astToGiac` + `buildCmd` pair);
  re-verified session 113 (same state — the 22-line top block at
  `www/src/rpl/cas/giac-convert.mjs:231-252` still opens with the
  purge-first narrative; body at `:280-282` still the bare
  `astToGiac`/`buildCmd` pair; second comment block at `:285-299`
  still explains the removal).
- **Age.** 9 runs. **Status.** open (lane = `rpl5050-cas-giac` or
  `rpl5050-code-review` — any lane can take this as pure hygiene,
  but defer to the cas lane if they want the phrasing).
  Re-verified session 118: same state — the 22-line top block at
  `www/src/rpl/cas/giac-convert.mjs:234-256` still opens with
  "Safe caseval command builder — purge free variables first" and
  spends the paragraph describing a preamble the body no longer
  emits; body at `:279-286` is still the bare `astToGiac` +
  `buildCmd` pair; second comment at `:287-299` still correctly
  explains the removal.  Re-verified session 123: same state at
  `:234-256` (top block) / `:281-289` (body — bare `astToGiac` +
  `buildCmd`, with `assertValidCasName` arity check on `extraVars`
  immediately above) / `:290-303` (second comment correctly
  explaining the session-098 removal).  Sessions 119 / 120 / 121
  did not touch the file.  Re-verified session 128:
  `grep -n "Safe caseval" www/src/rpl/cas/giac-convert.mjs`
  still hits at `:235`, top block still opens with the purge-
  first narrative; sessions 124 (LNAME / GBASIS — both new
  *callers* of giac infra but did not touch this file) and 125
  (data-types — pure widening, no Giac files) did not touch
  `giac-convert.mjs`.  Re-verified session 133:
  `grep -n "Safe caseval" www/src/rpl/cas/giac-convert.mjs`
  still hits at `:235`; top block at `:234-256` still opens with
  "Safe caseval command builder — purge free variables first"
  while the body at `:279-286` is still the bare
  `assertValidCasName` arity check + `astToGiac` + `buildCmd(giacExpr)`
  triple, with no purge preamble; second comment block at
  `:287-299` still correctly explains the session-098 removal.
  Sessions 129 (command-support — doc-only COMMANDS.md edits;
  no CAS files), 130 (data-types — `tests/test-types.mjs` only),
  131 (rpl-programming — `ops.js` body-intercept lifts; no
  `cas/` files) did not touch `giac-convert.mjs`.  Re-verified
  session 138: `grep -n "Safe caseval" www/src/rpl/cas/giac-convert.mjs`
  still hits at `:236`; top block at `:235-257` still opens with
  "Safe caseval command builder — purge free variables first"
  while the body at `:279-286` is still the bare
  `assertValidCasName` arity check + `astToGiac` + `buildCmd(giacExpr)`
  triple, with no purge preamble; second comment block at
  `:287-299` still correctly explains the session-098 removal.
  Sessions 134 (command-support — doc-only COMMANDS.md + phantom-row
  retire pass; no CAS files), 135 (data-types — `tests/test-types.mjs`
  only), 136 (rpl-programming — `ops.js` runWhile / runDo / runStart
  / runFor auto-close branches; no `cas/` files) did not touch
  `giac-convert.mjs`.  Re-verified session 143:
  `grep -n "Safe caseval" www/src/rpl/cas/giac-convert.mjs`
  still hits at `:235`; top block at `:234-256` still opens with
  "Safe caseval command builder — purge free variables first"
  while the body at `:279-300` is still the bare
  `assertValidCasName` arity check + `astToGiac` + `buildCmd(giacExpr)`
  triple, with no purge preamble; second comment block at
  `:287-299` still correctly explains the session-098 removal.
  Session 139 (command-support — shipped LIN / LIMIT / lim via
  `buildGiacCmd` callers but did NOT touch `giac-convert.mjs`
  itself; the new ops are call-sites of `buildGiacCmd`, not
  edits to the builder), 140 (data-types — `tests/test-types.mjs`
  + `docs/DATA_TYPES.md` only), 141 (rpl-programming — test-
  control-flow.mjs + RPL.md only, no `cas/` files), 142 (unit-
  tests in flight, broad `tests/*.mjs` + `docs/TESTS.md`
  scope) did not touch `giac-convert.mjs` either.  Now 9
  review-lane runs aging — the rpl5050-cas-giac lane has not
  been spun up since this finding was filed (the giac/cas work
  continues to be threaded through command-support sessions
  instead, and none has chosen to fold this hygiene edit into
  their pass).

### O-008  Session 106 shipped substantive changes without writing `logs/session-106.md`

- **Classification.** Other (process / audit-trail drift).
- **Where.** `logs/` (no `session-106.md` exists),
  `utils/@locks/session106-rpl-programming.json` (lock body shows
  `"released": true, "releasedAt": 1777056932`, set by the
  10-minute stale-prune at 18:55 UTC, NOT by a graceful release).
- **What.** Session 106 (lane = `rpl5050-rpl-programming`, intent
  = "P-001 doc paths + lift HALT-in-named-sub-program + SST
  step-into") acquired its lock at `1777056299` and was
  stale-pruned ~10 minutes later.  The source/doc edits the
  session was claiming did land — `_evalValueGen` and the
  `_stepInto` / `_insideSubProgram` machinery exist in
  `www/src/rpl/ops.js`, `docs/RPL.md` carries the "as of session
  106" header at `:18` and the full lift narrative at `:75-148`,
  the P-001 RPL.md sites are all rewritten to `www/src/...`, and
  `tests/test-control-flow.mjs` imports `stepIntoMode` and runs
  the new step-into assertions cleanly (3871 passing) — but no
  `logs/session-106.md` was written.  The bottom of the existing
  log directory tops out at `logs/session-105.md`.
- **Why.** The session log is the per-run audit trail.  The
  COMMANDS.md / RPL.md session-log blocks point at it; the next
  review-lane and unit-tests passes use it to confirm what the
  prior lane intended versus what landed; future lanes
  archaeologically grep through it to bisect when a behavior
  change first appeared.  The C-006 finding above had to
  reconstruct what session 106 did from RPL.md prose, the lock
  file, and direct reads of `ops.js` — that reconstruction is
  exactly what a session log would have spared.
- **Fix.** Have the rpl-programming lane (or any agent
  reconstructing the run from `ops.js` + `RPL.md` deltas) write a
  back-dated `logs/session-106.md` summarising the HALT lift +
  SST↓ step-into + P-001 RPL.md fix, with the entry/exit test
  counts (entry = 3830 from session 105 close, exit = 3830 + the
  +N test-control-flow assertions session 106 added — verifiable
  by counting `session106:` labels in `tests/test-control-flow.mjs`).
  Independent of the back-fill, codify the "release lock by
  graceful call, not by stale-prune" expectation in the lock
  helper README so future runs surface the missing-log condition
  louder.
- **Confidence.** high — `ls logs/session-10*.md` confirms 105 is
  the latest log on disk; `cat utils/@locks/session106-rpl-programming.json`
  confirms the released-by-prune state; `grep -nE 'session 106|_evalValueGen'
  www/src/rpl/ops.js docs/RPL.md` confirms the work itself shipped.
- **Age.** 2 runs. **Status.** resolved session-118 — both halves
  now shipped.  (1) Back-fill: `logs/session-106.md` exists on
  disk (10,777 bytes, mtime 19:03 UTC 2026-04-24), populated with
  the HALT-lift + SST↓ step-into + P-001 narrative that a
  session-106 log would have carried; written by the rpl-
  programming lane as part of the session 111 close-out
  (`logs/session-111.md:207-216`).  The parallel concern — session
  109 command-support's log turned out to be a race on session
  111's directory snapshot, not a miss.  (2) README guidance:
  `utils/@locks/README.md:35` (formerly the short "Release — delete
  your lock file…" line) now spells out that `release()` is the
  task's own responsibility and must fire from a `finally` block
  before task exit; explicitly calls out that a `released: true`
  set by `pruneStale` (rather than by the owner's `unlink`) is a
  process-failure signal — usually means the task ran out of time
  or crashed mid-way and did NOT write its `logs/session-NNN.md`.
  The paragraph tells a future audit pass to flag the missing
  session log in REVIEW.md whenever it spots that signature.
  Points at O-008 itself as the precedent.  Verified session 118:
  `grep -n 'stale-prune\|release()' utils/@locks/README.md`
  returns the new paragraph at line 35.

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

### P-001  Seventeen stale `src/…` path references in `docs/` (the tree moved to `www/src/`)

- **Classification.** Other (doc path drift, cross-lane).
- **Where.**
  - `docs/RPL.md:24, :27, :395, :397, :445, :582, :583, :585, :586`
    (9 sites).
  - `docs/DATA_TYPES.md:69, :81, :92, :271, :296` (5 sites).
  - `docs/ROADMAP.md:46` (1 site).
  - `docs/TESTS.md:203, :325` (2 sites — do **not** edit from the
    review lane while session 102 unit-tests holds that file).
- **What.** All 17 references name source files as `src/rpl/…` /
  `src/ui/…` / `src/app.js`.  The project tree was relocated during
  the session-090 Tauri prep (the `src-tauri/` directory now
  occupies `src/` at the top level and the JS code moved under
  `www/src/…`).  Every reference at the sites above should now
  read `www/src/…`.
- **Why.** Grep-ability of documentation.  A new contributor
  reading `docs/RPL.md:583` ("Evaluator: `src/rpl/ops.js` — search
  for `evalRange`…") will fail to find the file, or worse, will
  accidentally land in `src-tauri/` and follow a false trail.
- **Fix.** Mechanical prefix replacement `src/rpl/` → `www/src/rpl/`
  and `src/ui/` → `www/src/ui/` and `src/app.js` → `www/src/app.js`
  in each of the three doc files (RPL.md, DATA_TYPES.md, ROADMAP.md).
  `docs/TESTS.md` is locked by session 102 — unit-tests lane should
  fold those two updates into its next pass.  Each finding below
  that cites an `src/rpl/` path (X-001 through X-005, R-001, R-002,
  U-001) is historical audit trail and should NOT be rewritten —
  the verifier greps in this run have already been updated to the
  new paths.
- **Confidence.** high — 17 sites confirmed via `grep -rn 'src/rpl\|src/ui\|src/app\.js' docs/ | grep -v 'www/src'` at session-103 entry; `ls www/src/rpl/` confirms the new location.
- **Age.** 3 runs. **Status.** **resolved session-117 (all 17 sites
  closed across sessions 105 / 106 / 117 / 118).**
  - `docs/RPL.md` (9 sites) — **resolved session-106** (rpl-programming
    lane, while shipping HALT-named-sub-program lift; the session-106
    log was back-filled later, see O-008).  Verified session 113:
    the only `src/rpl/...` mention in `docs/RPL.md` that isn't
    under `www/src/` is a historical audit-trail line at `:294`
    inside session 106's own log block ("`src/rpl/parser.js` →
    `www/src/rpl/parser.js` and similar at 9 sites"), which
    preserves both old and new path names on purpose as a migration
    narrative — per the REVIEW.md policy that "historical audit
    trail … should NOT be rewritten" this is not an open site.
  - `docs/DATA_TYPES.md` (5 sites) — **resolved session-105**
    (data-type-support lane, alongside the 23-op Sy round-trip pass).
    Verified session 113: same grep returns zero hits.
  - `docs/ROADMAP.md` (1 site) — **resolved session-118** (code-
    review lane, folded into this run's scope because it's pure
    path-prefix hygiene).  Verified session 118: `grep -n 'src/rpl'
    docs/ROADMAP.md` returns zero hits.
  - `docs/TESTS.md` (2 sites) — **resolved session-117** (unit-tests
    lane, alongside the assertThrows migration pass).  Both sites
    rewritten to `www/src/rpl/...` and `www/src/...` respectively;
    the surrounding narrative blocks (s084 KNOWN-GAP test plan that
    formerly cited `src/rpl/ops.js`, and s083 concurrent-lane
    awareness paragraph that formerly cited `src/rpl/algebra.js`)
    were the targets.  Verified session 123: `grep -rn 'src/rpl\|src/ui\|src/app\.js'
    docs/ | grep -v www/src | grep -v src-tauri | grep -v REVIEW.md
    | grep -v 'docs/RPL.md:294'` returns zero hits — the only
    surviving non-`www/src/` mentions are the historical audit-trail
    lines preserved per policy (the RPL.md:294 migration narrative
    plus the session-103/108/113/118 entries inside this REVIEW.md
    that cite the old paths as part of the finding history).
  - Re-verified clean with the full grep at session 123.

### P-002  `www/src/rpl/types.js` header docstring omits Rational and points at pre-move vendor path

- **Classification.** Other (doc drift inside source file).
- **Where.** `www/src/rpl/types.js:1-40` (file header comment) and
  `:128` (Rational docstring).
- **What.** Two related gaps:
  1. The file-header "Types implemented" enumeration (lines 9-40)
     lists Real, Integer, Complex, String, Name, Symbolic, List,
     Vector, Matrix, Program, Tagged, BinaryInteger, Unit, Grob —
     but not **Rational**.  Rational became a first-class stack
     type in session 092 (Fraction.js-backed; participates in the
     Integer ⊂ Rational ⊂ Real ⊂ Complex promotion lattice); its
     constructor is at `:132` and its predicate `isRational` at
     `:374`.  A reader looking at the header-block manifest will
     miss one of the three numeric types (alongside Integer and
     Real).
  2. The Rational docstring at `:128` reads "vendored at
     `src/vendor/fraction.js/`" — the current path is
     `www/src/vendor/fraction.js/` (same tree-relocation that drove
     P-001).
- **Why.** The header block is the canonical one-stop summary of
  the value-type surface.  An omission at that level cascades into
  reader assumptions about what the numeric promotion lattice looks
  like.  The vendor-path pointer is the only link between the
  Rational doc and its implementation library; it should resolve.
- **Fix.** (1) Add a `Rational — exact ratio of integers via
  Fraction.js; participates in the Integer ⊂ Rational ⊂ Real ⊂
  Complex lattice.` row to the header block, positioned between
  Integer and Complex.  (2) Replace `src/vendor/fraction.js/` with
  `www/src/vendor/fraction.js/` at line 128.
- **Confidence.** high — header re-read session 103.
- **Age.** 1 run. **Status.** resolved session-105 — data-type-support
  lane added the Rational row to the header-block enumeration
  (now at `www/src/rpl/types.js:17-21`, between Integer and Complex,
  with the lattice phrasing exactly as proposed), and replaced the
  vendor path at the Rational docstring (now reads
  `www/src/vendor/fraction.js/`).  Verified session 108:
  `grep -n 'Rational' www/src/rpl/types.js` shows the header row
  at :17, and `grep -n 'src/vendor/fraction.js/' www/src/rpl/types.js`
  shows only the `www/src/...` form.

---

## Findings — Commands

### C-007  `COMMANDS.md` PROMPT row classified under UI lane; session 121 shipped it through rpl-programming lane

- **Classification.** Commands.
- **Where.** `docs/COMMANDS.md:371` (the Interaction-ops row that
  groups `DISP CLLCD FREEZE INPUT PROMPT WAIT BEEP → ui lane`),
  plus the Counts block heading at `:24` (still stamped "session
  119") and the session-log block at the file end (no entry for
  sessions 120 / 121 / 122).
- **What.** Three related drifts caused by session 121's
  unannounced PROMPT ship (see O-010 for the umbrella finding):
  1. **PROMPT misclassified.**  The Interaction-ops row at line
     371 still groups PROMPT with the rest of the user-facing
     I/O ops (`DISP`, `CLLCD`, `FREEZE`, `INPUT`, `WAIT`, `BEEP`)
     under the trailing arrow `→ ui lane`.  That arrow was
     accurate when written (the UI lane was expected to ship
     PROMPT alongside DISP / INPUT) but session 121
     `rpl5050-rpl-programming` actually shipped PROMPT as a
     suspension-yielding control-flow op, not as a UI write
     primitive.  The PROMPT handler in `www/src/rpl/ops.js:10968`
     yields up to the EVAL/CONT driver (the same mechanism HALT
     uses), parks `state.promptMessage`, and resumes on
     CONT / KILL / SST — none of which is UI-lane work.  A reader
     consulting COMMANDS.md to understand "is PROMPT shipped?"
     and "which lane owns it?" gets two wrong answers (the row
     reads as ✗ since it sits with the not-yet-shipped DISP /
     INPUT cluster, and the lane attribution is also wrong).
  2. **PROMPT row needs ✗ → ✓ flip + Notes column.**  Split out
     PROMPT into its own row (or move it into the control-flow
     section near HALT / CONT / KILL where it actually belongs);
     mark ✓; add a Notes column citing session 121 ("Session 121
     — PROMPT yields up to the EVAL/CONT driver, parks the
     prompt-message string in `state.promptMessage`, resumes on
     CONT / KILL / SST.  Mirrors HALT's suspension protocol; no
     UI-lane involvement.")
  3. **IFT / IFTE row missing the session-121 generator lift.**
     Session 121 also re-routed IFT / IFTE through `evalRange`'s
     body-intercept (see O-010); the COMMANDS.md control-flow
     row for IFT / IFTE has no Notes addendum reflecting this.
     A reader consulting that row to gauge HALT-inside-IFT
     coverage would conclude (correctly per the row, wrongly per
     the code) that HALT is still rejected — the row has not
     been updated since the row's last edit.
  4. **Counts block stamp + register() count.**  Heading at line
     24 still reads "as of session 119".  `grep -c "register(" www/src/rpl/ops.js`
     now returns **449** (one new ship — PROMPT — landed by
     session 121 since the session-119 stamp recorded **448**).
     The session-log block at the file end has entries through
     session 119 / EGV / RSD / GREDUCE; no entry for session 120
     (data-types — no register changes) or session 121 (PROMPT
     ship + IFT / IFTE refactor) or 122 (in-flight unit tests).
- **Why.** COMMANDS.md is the canonical "what's shipped, what's
  not" reference.  PROMPT misclassification is actively
  misleading on three axes — capability ("is it shipped?"), lane
  attribution ("who owns it?"), and mechanism ("does it go
  through the UI render loop or the evaluator?").  IFT / IFTE
  HALT-coverage is the same kind of capability-state gap that
  C-003 / C-006 already mapped for HALT itself: the row
  describes the pre-lift state.  Counts-block staleness is the
  audit-trail concern that C-005 mapped at session 086 / 088 —
  exactly the same anti-pattern, recurring once per
  rpl-programming-lane silent-ship.
- **Fix.** Three pure-Notes-column / row-shape edits to
  `docs/COMMANDS.md`:
  1. Pull PROMPT out of the Interaction-ops row at `:371`; add a
     new row in the control-flow section near HALT / CONT / KILL
     marked ✓ with the session-121 Notes column proposed above.
  2. Append to the IFT / IFTE row Notes: "Session 121 —
     IFT / IFTE actions now re-enter `evalRange` via the
     body-intercept path (`ops.js:3116-3158`); HALT inside the
     action no longer rejects at `_driveGen`.  Pinned by
     test-control-flow session122 IFT/IFTE+HALT cluster."
  3. Bump the Counts heading to "as of session 122 — 2026-04-24"
     (or the next session that owns the edit), update the
     `register()` total to **449**, and add session-log entries
     for sessions 120 (no count change), 121 (+1 PROMPT, ✗ → ✓;
     IFT / IFTE Notes addendum), and 122 (no count change).
- **Confidence.** high — `grep -n 'PROMPT' docs/COMMANDS.md`
  shows the line-371 row is the only PROMPT mention in the file;
  `grep -nE "register\(\s*'PROMPT'" www/src/rpl/ops.js` shows the
  op live at `:10968`; `grep -c "register(" www/src/rpl/ops.js`
  returns 449; `grep -nE 'IFT[E]? .*Notes|Session 12[01]' docs/COMMANDS.md`
  confirms no IFT / IFTE row addendum and no session-12x log
  entries.
- **Age.** 1 run. **Status.** **resolved session 129** by the
  `rpl5050-command-support` lane.  All four sub-items from this
  finding's session-128 status block are now closed:
  - **(closed session 129)** PROMPT row split out of the
    `DISP CLLCD FREEZE INPUT WAIT BEEP → ui lane` group; new ✓
    row added in the control-flow section between
    `HALT CONT KILL` and `RUN`, with Notes that cite the
    session-121 evalRange intercept (`ops.js:3129-3136`),
    `setPromptMessage` / `clearPromptMessage`, the CONT/KILL/SST
    semantics, and the `'PROMPT' EVAL` outside-program error
    mirroring HALT.
  - **(closed session 129)** IFT/IFTE row Notes column amended
    with the session-121 generator-flavor lift addendum (body-
    intercept path at `ops.js:3145-3158` — note that the
    session-128 audit cited `:3116-3158`; the actual range is
    `:3145-3158`, the `:3116` figure was off-by-one).  Sync-
    fallback caveat preserved.
  - **(closed session 129)** HALT/CONT/KILL row Notes column
    amended with both the session-121 IFT/IFTE lift and the
    session-126 SEQ/MAP lift; the previously stale "only HALT
    inside a sync-path call (IFT / IFTE / MAP / SEQ body) still
    rejects" caveat rewritten as the now-correct "Residual:
    HALT reached through the **sync-fallback** Name-dispatch
    path for IFT / IFTE / SEQ / MAP still rejects" with the
    four session-111 caller labels enumerated.
  - **(closed session 129)** Session-log entries for sessions
    120, 121, 122, 123, 125, 126, 127, 128 back-filled at the
    file-end log block (chronological, most-recent-first), plus
    a session-129 entry at the top of the log documenting this
    run's edits.  The Counts heading was bumped from session
    124 to session 129 and the `register()` count narrative
    refreshed from 455 → 458 with attribution for the +3 delta
    (session-126 SEQ/MAP register-rewrites + sibling-lane
    traffic; session 129 itself shipped no new registrations).
  Verified session 129 via `grep -nE
  '## Counts \(as of session 129|register\(\) count it added is
  the \+1|PROMPT.*Session 121.*HP50 AUR p\.2-160|IFT.*IFTE.*Session
  121:|HALT.*Session 126:.*SEQ' docs/COMMANDS.md` (5 hits, all on
  the new edits) and `node tests/test-all.mjs` = 4374 / 0 / sanity
  22 / persist 38 (all stable from session 128's run-close
  baseline).  **Original status block (session 128) preserved
  below for traceability.**

  ---
  *(session-128 status block, retained for traceability — the
  open-piece narrative below was the input to session 129's
  closure work)*

  **partial — Counts heading +
  register count + session-124 log entry slice closed by session
  124; PROMPT row + IFT/IFTE row + HALT row + missing
  120/121/122/123/125 session-log entries still open.**  Re-
  verified session 128:
  - **(closed by session 124)** Counts heading at
    `docs/COMMANDS.md:24` now reads "## Counts (as of session 124
    — 2026-04-24)"; `register()` line at `:34` reads "= **455**
    at the end of session 124 (was 448 at the end of session
    119)"; the prelude at `:37` calls out "the remaining +5
    between sessions 119 and 124 came from intervening lanes
    (e.g. session 121's `PROMPT` op for the rpl-programming
    lane)".  Brief acknowledgement of session 121's PROMPT in
    the Counts narrative is now present; one of C-007's three
    drifts is closed.
  - **(still open)** Line 348: `IFT IFTE` row Notes column still
    reads only `Stack conditionals.` — no session-121 addendum
    describing the generator-flavor lift through `evalRange`'s
    body intercept; no link to RPL.md.  Required edit: append
    "**Session 121:** IFT / IFTE actions now re-enter `evalRange`
    via the body-intercept path (`ops.js:3116-3158`); HALT /
    PROMPT inside the action lifts cleanly through `_evalValueGen`
    and resumes via CONT.  Sync-fallback (Name dispatch /
    Tagged-wrapped Name / direct `lookup('IFT').fn(s)`) still
    rejects with the session-111 caller label.  See `docs/RPL.md:
    42-46`."
  - **(still open and now MORE stale)** Line 355: HALT /
    CONT / KILL row Notes still says "**Session 106:** … only
    HALT inside a sync-path call (IFT / IFTE / MAP / SEQ body)
    still rejects with `HALT: cannot suspend inside a sub-
    program call`."  Session 121 lifted IFT / IFTE off this list
    and session 126 (in flight at this run) is lifting MAP / SEQ.
    The row's caveat list will need a session-121 amendment now
    and a session-126 amendment once 126 graceful-releases; for
    this run, the session-121 amendment is the open piece.
  - **(still open)** Line 388: `DISP CLLCD FREEZE INPUT PROMPT
    WAIT BEEP → ui lane` — PROMPT still grouped with the UI-
    lane I/O ops.  Required edit: pull PROMPT out of this row
    and add a control-flow row near HALT / CONT / KILL marked ✓
    with session-121 Notes ("yields to the EVAL/CONT driver via
    the same suspension channel HALT uses; parks
    `state.promptMessage`; CONT clears the banner and resumes;
    KILL drops the suspension; SST is a no-op for PROMPT").
  - **(still open)** Session-log block at the file end has
    entries for sessions 124 and 119 (the file-end block is
    most-recent-first, so 124 sits at the top, 119 a few entries
    down).  Missing entries for sessions 120 (data-types — no
    register changes; brief one-liner OK), 121 (rpl-programming
    — the PROMPT ✗ → ✓ flip + IFT / IFTE Notes addendum, even
    though the row edits themselves are still pending; the log
    entry can pre-cite the rows that need updating), 122 (unit-
    tests — back-fill of session-121 PROMPT/IFT/IFTE coverage;
    no register changes), 123 (review-lane — no register
    changes), 125 (data-types — arity-2 list distribution
    widening + Tagged-of-List composition; no register changes).
  Required: command-support lane next time it runs to pick up
  C-007's three open drifts (IFT/IFTE row, HALT row, PROMPT row
  + session-log entries).  Lane = `rpl5050-command-support`.
  Pairs naturally with the IFT/IFTE row update if session 126
  closes its work and the HALT row needs a session-126 MAP/SEQ
  amendment in the same pass.

### C-008  `COMMANDS.md` HALT/CONT/KILL row missing session-131 DOLIST/DOSUBS/STREAM lift + Counts/session-log staleness

- **Classification.** Commands.
- **Where.** `docs/COMMANDS.md:389` (the `HALT CONT KILL` row in
  the control-flow section), plus the Counts heading at `:24`
  (still stamped "as of session 129 — 2026-04-24") and the
  session-log block at the file end (no entries for sessions
  130, 131, or the in-flight 132).
- **What.** Session 131 (`rpl5050-rpl-programming`, fifth run)
  lifted HALT / PROMPT through `DOLIST` / `DOSUBS` / `STREAM`
  per-iteration program bodies — the last three structural
  sync-path call sites that the session-126 SEQ/MAP run hadn't
  reached.  New `runDoList` / `runDoSubs` / `runStream`
  generator helpers were added at `www/src/rpl/ops.js:8142`,
  `:8224`, and `:8304` respectively, plus body-intercept dispatch
  in `evalRange` at `:3196` / `:3202` / `:3208`.  Sync-fallback
  handlers preserved with session-111 caller labels
  (`'DOLIST program'`, `'DOSUBS program'`, `'STREAM program'`);
  DOSUBS NSUB/ENDSUB context-frame teardown happens inside the
  generator's `try/finally`.  Pinned by +65 session-131
  assertions in `tests/test-control-flow.mjs` (498 → 563).
  None of this is reflected in COMMANDS.md:
  1. **HALT/CONT/KILL row Notes column missing the session-131
     addendum.**  The row at `:389` enumerates the lift history
     through session 088 ("structural HALT pilot-limit fully
     lifted"), session 106 (named-sub-program lift), session 121
     (IFT/IFTE), and session 126 (SEQ/MAP) — and stops there.
     A reader consulting that row to gauge "can HALT escape
     DOLIST / DOSUBS / STREAM iterations?" would conclude no
     (per the absence) when the answer per the code is yes.
     The residual paragraph at the end of the row Notes still
     enumerates the four session-111 caller labels (IFT, IFTE,
     SEQ, MAP) but does not include the three new caller labels
     session 131 added (`'DOLIST program'`, `'DOSUBS program'`,
     `'STREAM program'`).
  2. **Counts heading staleness.**  The block heading at `:24`
     still reads "as of session 129 — 2026-04-24".  Session 131
     did not add new `register()` sites — it rewrote three
     existing handlers (`DOLIST` / `DOSUBS` / `STREAM`) as
     generator-flavor wrappers — but the heading exists to
     convey that the file has been audited against session-N
     state, and four sessions have shipped behavior-affecting
     changes since (130 data-type widening, 131 structural HALT
     lift, 132 unit-tests, plus this run's review).  Bumping
     to "as of session 131" (or session 133 if it lands here)
     keeps readers honest about which behaviors the file
     reflects.
  3. **Session-log block missing entries 130 / 131 / 132.**  The
     log at `:461` ends at session 129; no entries for the
     three sibling-lane runs that have since landed.  Same
     anti-pattern as C-005 / C-006 / C-007 — the file is the
     authoritative session-log surface for the Commands lane,
     and gaps grow harder to back-fill with each missed run.
- **Why.** C-007 was filed at session 123 against the same
  COMMANDS.md HALT row for session 121's IFT/IFTE lift, and
  again at session 128 against the same row for session 126's
  SEQ/MAP lift; session 129 closed both.  C-008 is the third
  iteration of the same anti-pattern: a structural HALT lift
  ships in an rpl-programming-lane run, and the COMMANDS.md
  HALT row plus Counts heading plus session-log block fall
  one cycle behind.  Capability-state drift is the same kind
  of audit-trail concern C-003 / C-006 mapped — the row
  describes a pre-lift state and a reader can't tell which
  iteration constructs HALT now lifts through.  Notes-column
  edits are zero-risk doc work and pair naturally with the
  session-130 / 131 / 132 log back-fill the file owes anyway.
- **Fix.** Three pure-Notes-column / log-entry edits to
  `docs/COMMANDS.md`:
  1. Append to the HALT/CONT/KILL row Notes (`:389`):
     "**Session 131:** DOLIST / DOSUBS / STREAM per-iteration
     program bodies lifted via `runDoList` / `runDoSubs` /
     `runStream` generators (`ops.js:8142`, `:8224`, `:8304`)
     plus body-intercept dispatch in `evalRange` (`:3196`,
     `:3202`, `:3208`) — HALT / PROMPT inside a DOLIST /
     DOSUBS / STREAM iteration suspends cleanly and CONT
     resumes inside the same iteration with the partial
     accumulator and (for DOSUBS) the NSUB/ENDSUB context
     frame intact via the generator's `try/finally` teardown."
     Update the Residual paragraph to enumerate the now-seven
     session-111 caller labels (IFT / IFTE / SEQ / MAP /
     DOLIST / DOSUBS / STREAM) on the sync-fallback Name-
     dispatch path.
  2. Bump the Counts heading at `:24` to "as of session 131 —
     2026-04-25" (or session 133 if this run authors the
     edit).  Session 131 did not change the `register()`
     total; the count narrative stays at 458.
  3. Back-fill session-log entries for sessions 130 (data-type-
     support — three hard-assertion clusters in test-types.mjs;
     no register changes; no row flips), 131 (rpl-programming
     — DOLIST/DOSUBS/STREAM body-intercept lift; new caller
     labels; no new register sites; no row flips), and 132
     (unit-tests — TESTS.md T-002 doc fix + coverage adds; no
     register changes).
- **Confidence.** high — `grep -n 'HALT.*CONT.*KILL' docs/COMMANDS.md`
  shows the row at `:389` and confirms the Notes column stops
  at session 126; `grep -nE 'as of session ([0-9]+)' docs/COMMANDS.md`
  shows the Counts heading at `:24` still reads "session 129";
  `grep -nE 'session 13[012]' docs/COMMANDS.md` returns no
  hits in the session-log block (the only mentions are unrelated
  doc references); `grep -nE 'register\(\s*"DOLIST"|register\(\s*"DOSUBS"|register\(\s*"STREAM"' www/src/rpl/ops.js`
  shows the three handlers live and rewritten;
  `grep -nE 'runDoList|runDoSubs|runStream' www/src/rpl/ops.js`
  shows the three generator helpers at the cited line numbers;
  `grep -c 'session131\|session 131' tests/test-control-flow.mjs`
  shows the +65 assertions are present.
- **Age.** 1 run (filed session 133). **Status.** **resolved
  session 134** by the command-support lane's doc-only run, all
  three sub-items shipped verbatim.  Re-verified session 138:
  (1) `grep -n "Session 131" docs/COMMANDS.md` hits at `:436`
  inside the `HALT CONT KILL` row Notes — the row now contains
  the addendum "**Session 131:** DOLIST / DOSUBS / STREAM
  per-iteration program bodies lifted via `runDoList` / `runDoSubs`
  / `runStream` generators (`ops.js:8142`, `:8224`, `:8304`)
  plus body-intercept dispatch in `evalRange` (`:3196`, `:3202`,
  `:3208`)…" and the residual paragraph enumerates all seven
  session-111 caller labels (IFT / IFTE / SEQ / MAP / DOLIST /
  DOSUBS / STREAM); (2) `grep -nE "as of session" docs/COMMANDS.md`
  shows the Counts heading at `:24` reads "as of session 134
  — 2026-04-24" with the `grep -c "register("` stamp updated
  458 → 463 and the top-level `^register(` count narrative noted
  as 442 unchanged from session 129; (3) session-log block at
  `:507` opens with a session-134 entry and contains contiguous
  back-fill entries for sessions 130 / 131 / 132 / 133 / 134.
  Same close shape as C-007 (session 128 → 129); the C-007
  → C-008 → C-009 chain (this run files C-009 against the
  WHILE/DO/START/FOR row Notes for the same anti-pattern,
  recurring on session 136's auto-close lift) is the third
  iteration of the same cycle.  Lane = `rpl5050-command-support`.

### C-009  `COMMANDS.md` WHILE / DO / START / FOR rows missing session-136 auto-close lift + Counts/session-log staleness

- **Classification.** Commands.
- **Where.** `docs/COMMANDS.md:426` (the `FOR / START / STEP /
  NEXT` row), `:427` (`WHILE / REPEAT / END`), `:428` (`DO /
  UNTIL / END`) — all three carry an empty Notes column; plus
  the Counts heading at `:24` (still stamped "as of session 134
  — 2026-04-24") and the session-log block at `:507` (most-recent
  entry is session 134; no entries for sessions 135 / 136 / the
  in-flight 137 / this run's 138).
- **What.** Session 136 (`rpl5050-rpl-programming`, sixth run)
  shipped auto-close on missing END / NEXT for `WHILE/REPEAT`,
  `DO/UNTIL`, `START`, and `FOR` — `runWhile` (`www/src/rpl/ops.js`),
  `runDo`, `runStart`, `runFor` each gain an
  `if (!endScan) { endIdx = bound; autoClosed = true; }` branch
  and a `return autoClosed ? bound : closerIdx + 1` exit; spurious
  closer-of-wrong-kind still rejects (the throws at `:3677`
  (`"WHILE/REPEAT without END"`), `:3717` (`"DO/UNTIL without
  END"`), `:3761` (`"START without NEXT/STEP"`), `:3798` (`"FOR
  without NEXT/STEP"`) survive on the wrong-kind branch).  Pinned
  by +36 session-136 assertions in `tests/test-control-flow.mjs`
  (563 → 599).  This closes the structural-auto-close program for
  the condition-loop and counter-loop families, mirroring the
  existing IF (session 083) / IFERR (session 077) / CASE (session
  074) auto-close policy.  None of this is reflected in
  COMMANDS.md:
  1. **Loop row Notes columns at `:426` / `:427` / `:428` empty.**
     The four loop rows all read just `| ✓ |` with no annotation.
     A reader consulting the row to gauge "does WHILE auto-close
     on missing END?" would conclude no (per the absence) when
     the answer per the code is yes.  Compare with the
     `IF / THEN / ELSE / END` row at `:424` which correctly carries
     "**Session 083** — IF auto-closes on missing END at
     program-body bound, mirroring CASE (session 074) and IFERR
     (session 077); IF-without-THEN stays a hard error" — the
     four loop rows want a parallel session-136 annotation.
  2. **Counts heading staleness.**  The block heading at `:24`
     still reads "as of session 134 — 2026-04-24".  Session 136
     did not add new `register()` sites — it widened existing
     `runWhile` / `runDo` / `runStart` / `runFor` bodies in
     place — but the heading exists to convey that the file has
     been audited against session-N state, and three sessions
     have shipped behavior-affecting changes since (135 data-type
     widening — though no source-side change, only test pins; 136
     structural auto-close lift; plus this run's review).  Bumping
     to "as of session 136" keeps readers honest about which
     behaviors the file reflects.
  3. **Session-log block missing entries 135 / 136.**  The log at
     `:507` ends at session 134; no entries for the two
     sibling-lane runs that have since landed (135 data-type-
     support coverage adds; 136 rpl-programming auto-close lift).
     Same anti-pattern as C-005 / C-006 / C-007 / C-008 — the
     file is the authoritative session-log surface for the
     Commands lane, and gaps grow harder to back-fill with each
     missed run.
- **Why.** C-007 was filed at session 123 against the same kind
  of COMMANDS.md row drift for session 121's IFT/IFTE lift, and
  again at session 128 for session 126's SEQ/MAP lift; session
  129 closed it.  C-008 was filed at session 133 against the
  same kind of drift for session 131's DOLIST/DOSUBS/STREAM
  lift; session 134 closed it.  C-009 is the *fourth* iteration
  of the same anti-pattern: a structural-shape change ships in
  an rpl-programming-lane run, and the COMMANDS.md row Notes
  plus Counts heading plus session-log block fall one cycle
  behind.  This time the row drift is wider because the lift
  spans four rows (the four loop families), all with empty
  Notes columns rather than amend-existing-prose edits.
- **Fix.** Three pure-Notes-column / log-entry edits to
  `docs/COMMANDS.md`:
  1. Append to each of the four loop rows an annotation
     mirroring the IF row's session-083 phrasing — e.g.
     "**Session 136** — auto-closes on missing END at
     program-body bound, mirroring IF (session 083) / CASE
     (session 074) / IFERR (session 077); a spurious closer of
     the wrong kind (e.g. NEXT in the END slot) stays a hard
     error".  The FOR / START rows want the same
     annotation phrased for "missing NEXT / STEP".
  2. Bump the Counts heading at `:24` to "as of session 136 —
     2026-04-25" (or session 138 if this run authors the edit).
     Session 136 did not change the `register()` total; the
     count narrative stays at 463 / 442.
  3. Back-fill session-log entries for sessions 135
     (data-type-support — three hard-assertion clusters in
     test-types.mjs; no register changes; no row flips) and
     136 (rpl-programming — auto-close lift on the four loop
     families; no new register sites; no row flips).
- **Confidence.** high — `grep -nE 'WHILE|DO[^a-z]|REPEAT|FOR\s' docs/COMMANDS.md`
  shows the four loop rows at `:426` / `:427` / `:428` and confirms
  each Notes column is `| ✓ |` (empty after the status); `grep -nE
  'as of session ([0-9]+)' docs/COMMANDS.md` shows the Counts
  heading at `:24` still reads "session 134"; `grep -nE 'session
  13[5-7]\b' docs/COMMANDS.md` returns no hits in the session-log
  block; `grep -nE "auto-close" www/src/rpl/ops.js` shows the
  four `runWhile` / `runDo` / `runStart` / `runFor` auto-close
  branches live; `grep -c 'session136' tests/test-control-flow.mjs`
  shows the +36 assertions are present.
- **Age.** 1 run (filed session 138).  **Status.** **resolved
  session 139** by the command-support lane.  All three sub-
  items shipped:
  - **(closed session 139)** Loop rows at `docs/COMMANDS.md:450`
    (`FOR / START / STEP / NEXT`), `:451` (`WHILE / REPEAT /
    END`), `:452` (`DO / UNTIL / END`) all gained the
    session-136 auto-close annotation.  The FOR/START row reads
    "**Session 136** — `FOR` and `START` auto-close on missing
    `NEXT` / `STEP` at program-body bound, mirroring IF (session
    083) / CASE (session 074) / IFERR (session 077).  A
    spurious closer of the wrong kind (e.g. `END` in the
    `NEXT`/`STEP` slot) stays a hard error; see `runFor` /
    `runStart` in `www/src/rpl/ops.js`."  Parallel phrasing
    on the WHILE/REPEAT and DO/UNTIL rows pointing at `runWhile`
    / `runDo` respectively.
  - **(closed session 139)** Counts heading at `:24` bumped from
    "as of session 134 — 2026-04-24" to "as of session 139 —
    2026-04-25"; `grep -c "register("` count refreshed 463 →
    466 (+3 for the new LIN / LIMIT / lim ops session 139 also
    shipped this run); `grep -cE '^register\('` count refreshed
    442 → 445; ✓ rows count refreshed to 437 (was 434, +3 for
    the LIN / LIMIT ops — note that LIMIT / lim share a single
    combined row, hence +3 ✓ rows from +3 register sites).
  - **(closed session 139)** Session-log block at the file end
    gained back-fill entries for sessions 135 (data-types Q×V/M
    broadcast / Tagged-of-V/M binary composition / Tagged tag-
    identity & BinInt cross-base equality, +31 test-types.mjs),
    136 (rpl-programming WHILE/DO/START/FOR auto-close lift,
    +36 test-control-flow.mjs), 137 (unit-tests cross-file
    coverage adds, +45), 138 (code-review eleventh run filing
    C-009 + R-005), and the session-139 entry itself at the top
    of the log.
  Verified session 143 via `grep -nE 'WHILE / REPEAT|DO / UNTIL|FOR / START|auto-close' docs/COMMANDS.md`
  (5 hits including the IF row's session-083 annotation and the
  three new session-136 annotations on the loop rows);
  `grep -nE "as of session" docs/COMMANDS.md` shows the Counts
  heading reads "as of session 139"; `grep -nE "^- \*\*session 13[5-9]"
  docs/COMMANDS.md` shows the back-filled entries 135 → 139 in
  the session-log block.  Same close shape as C-007 (session
  128 → 129) and C-008 (session 133 → 134) — fifth iteration
  of the rpl-programming-lift-then-command-support-back-fill
  cycle, all five now closed.

### C-006  `COMMANDS.md` HALT row missing session-106 named-sub-program lift + SST↓ step-into

- **Classification.** Commands.
- **Where.** `docs/COMMANDS.md:299` (the HALT / CONT / KILL row in
  the control-flow section).
- **What.** The HALT row Notes column was last updated for session
  088 ("generator-based `evalRange` — structural HALT pilot-limit
  fully lifted; HALT now works from inside `FOR`, `IF`, `WHILE`,
  `DO`, `IFERR`, and `→` bodies.").  Since then session 106 has
  shipped two related capability changes that the row does not
  reflect:
  1. **HALT through Name lookup is now supported.**  `evalToken`'s
     Name-binding branch routes Program values through the new
     `_evalValueGen` generator (`www/src/rpl/ops.js:3752`) instead
     of `_evalValueSync`, so a HALT inside a sub-program reached
     by `'PRG' EVAL` or by a tail-position name reference now
     yields cleanly up to the EVAL/CONT driver.  The row's old
     "remaining limit: HALT inside a named sub-program called via
     variable lookup" caveat (which C-003 already corrected for the
     session-088 lift) is now itself stale.
  2. **`SST↓` is now a real step-into op.**  Session 106 added
     `_stepInto` + `_insideSubProgram` + `_shouldStepYield`
     (`ops.js:2944-3118`) so single-stepping descends into the body
     of a sub-program when invoked via `SST↓`, while plain `SST`
     keeps stepping over.  RPL.md captures this at `:121-148`; the
     COMMANDS.md row only mentions SST/SST↓/DBUG as a session-101
     shipment without the session-106 step-into refinement.
  Both gaps were created by the session-106 lift landing without
  a COMMANDS.md edit (the rpl-programming lane owns RPL.md, not
  COMMANDS.md, so the cross-doc update is naturally a command-
  support follow-up).  The remaining sub-program limitation
  documented in RPL.md:144-148 — HALT inside a sync-path call
  (IFT / IFTE / MAP body etc.) — still rejects via `_driveGen` and
  is the only true limit left to cite.
- **Why.** A user consulting COMMANDS.md to gauge HALT coverage
  will see only the session-088 description and conclude that
  named-sub-program calls still raise the pilot limit — they do
  not.  Symmetric concern for SST↓: the current row reads as if
  step-into is unimplemented, when it has been live since session
  106.
- **Fix.** Append to the HALT / CONT / KILL row Notes: "**Session
  106:** named-sub-program HALT lifted via `evalToken` → `_evalValueGen`
  for Name-binding evaluations; only HALT inside a sync-path call
  (IFT / IFTE / MAP / SEQ body) still rejects with `HALT: cannot
  suspend inside a sub-program call`.  See `docs/RPL.md:144-148`."
  Add a parallel addendum to the SST / SST↓ / DBUG row (or wherever
  COMMANDS.md tracks the debugger ops): "**Session 106:** SST↓
  shipped as a real step-into via `_stepInto` + `_insideSubProgram`
  modulation of the post-token yield."  Both are pure Notes-column
  edits.
- **Confidence.** high — `grep -n 'HALT' docs/COMMANDS.md` shows
  the row notes end at the session-088 phrasing; `grep -n
  '_evalValueGen\|_stepInto' www/src/rpl/ops.js` confirms the
  session-106 helpers are live; RPL.md `:18` carries the "as of
  session 106" stamp and `:75-148` describes the lifts in detail.
- **Age.** 1 run (filed session 108). **Status.** resolved session-109
  by the `rpl5050-command-support` lane.  `docs/COMMANDS.md` HALT /
  CONT / KILL row now carries the session-106 addendum ("**Session
  106:** named-sub-program HALT lifted via `evalToken` →
  `_evalValueGen` for Name-binding evaluations; only HALT inside a
  sync-path call (IFT / IFTE / MAP / SEQ body) still rejects…").
  The debugger row was additionally upgraded: originally listed as
  `SST` `DBUG` ✗ because session 101's own flip edit had drifted,
  now listed as `SST` `SST↓` `DBUG` ✓ with the session-101 ship
  context + the session-106 step-into refinement in Notes.  Counts
  block reflects the 4-row ✗ → ✓ transition (Ei, Si, Ci new ships
  + SST doc-drift correction).  Verified session 113: `grep -n
  'HALT.*CONT.*KILL\|SST.*SST↓\|Session 106' docs/COMMANDS.md`
  confirms both row additions are present at `:313` and `:315`.

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
- **Age.** 1 run. **Status.** resolved session-099 — `docs/COMMANDS.md:292`
  HALT row Notes now reads "**Session 088:** generator-based
  `evalRange` — structural HALT pilot-limit fully lifted; HALT now
  works from inside `FOR`, `IF`, `WHILE`, `DO`, `IFERR`, and `→`
  bodies."  Verified session 103.

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
- **Confidence.** high — `grep -n 'isProgram' www/src/rpl/ops.js` at the
  SIZE register block confirms the branch; `docs/RPL.md:180`
  documents it; 5 test assertions exist.
- **Age.** 1 run. **Status.** resolved session-099 — `docs/COMMANDS.md:182`
  Lists-SIZE row Notes now reads "**Session 088** — `SIZE` widened to
  Program (count of top-level tokens; matches HP50 AUR)."  Verified
  session 103.

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
- **Age.** 1 run. **Status.** resolved session-099 — Counts heading
  now stamped "as of session 099 — 2026-04-24" (`docs/COMMANDS.md:24`);
  session-log block now carries entries for sessions 087, 088, 092,
  094, 095, 096-098, and 099.  Verified session 103.

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

### R-004  `docs/RPL.md` carries no narrative for the session-121 IFT/IFTE generator-flavor lift or the PROMPT mechanism

- **Classification.** RPL.
- **Where.** `docs/RPL.md` (file-scope — the document's
  control-flow chapter ends with the session-106 HALT-in-named-
  sub-program lift narrative at `:75-148` and has no entry past
  it; PROMPT is unmentioned anywhere in the file).
- **What.** Session 121 (see O-010 for the umbrella finding)
  shipped two RPL-bucket capability changes that `docs/RPL.md`
  does not describe:
  1. **IFT / IFTE generator-flavor lift.**  The session-106
     narrative at `:75-148` walked the reader through the
     `evalToken` → `_evalValueGen` split and called out IFT /
     IFTE bodies as still-rejecting at `_driveGen`.  Session
     111 then tightened that rejection's error message via the
     `caller` label thread, with R-003's resolution paragraph
     citing IFT / IFTE / MAP / SEQ / DOLIST / DOSUBS / STREAM
     as the still-rejecting set.  Session 121 silently lifted
     IFT / IFTE specifically — the two ops now re-enter
     `evalRange` via a body-intercept path (`ops.js:3116-3158`,
     `:3573-3593`) instead of dispatching through
     `_evalValueSync`, which propagates HALT cleanly.  RPL.md
     has no description of this lift or its mechanism, so the
     document still reads as if IFT / IFTE+HALT rejects.  This
     is the largest control-flow capability lift since session
     088 itself (which fully lifted structural HALT) and is
     load-bearing for any user-facing program that wants to
     pause inside a conditional branch.
  2. **PROMPT mechanism.**  The session-121 PROMPT op uses the
     same yield-to-driver mechanism as HALT: when a program
     reaches PROMPT, the handler stores the message string in
     `state.promptMessage` (new slot, see O-010) and yields up
     through the generator chain to the EVAL/CONT driver; CONT
     resumes execution from the post-PROMPT IP and clears the
     message; KILL drops the suspension; SST ignores PROMPT
     (the step-into machinery from session 106 keeps stepping).
     RPL.md's HALT chapter at `:75-148` is exactly the place a
     reader would expect a parallel PROMPT chapter — same
     mechanism, slightly different state shape.  None of this
     is documented.
  Both gaps stem from session 121's silent ship (see O-010);
  fixing them is the RPL-lane's half of the O-010 remediation.
- **Why.** `docs/RPL.md` is the canonical mental-model reference
  for the language's control-flow surface.  A user reading the
  HALT chapter will follow the lane logic — "HALT works
  structurally, except inside IFT / IFTE / MAP / SEQ / etc." —
  and conclude the IFT / IFTE caveat still holds, when it does
  not.  A user looking for "how does PROMPT work?" finds nothing
  at all.  Both gaps drive users either to read source (the
  thing the doc is supposed to spare them) or to assume the
  capability is missing (the thing the doc is supposed to
  prevent).
- **Fix.** Two narrative additions to `docs/RPL.md`:
  1. Add a "Session 121" subsection inside the control-flow
     chapter (after the existing session-106 narrative at
     `:75-148`) describing the IFT / IFTE lift mechanism: the
     body-intercept in `evalRange` (`ops.js:3116-3158`), the new
     IFT / IFTE runners at `:3573-3593`, the resulting HALT
     propagation, and the +14 session-122 IFT/IFTE+HALT
     assertions in `tests/test-control-flow.mjs` that pin the
     behavior.  Update R-003's still-rejecting call-list (now in
     `_driveGen` docstring at `ops.js:3713-3741`) to drop IFT /
     IFTE — that's a parallel doc-comment edit also owned by the
     RPL lane.
  2. Add a new "PROMPT" section (likely as a peer of the HALT
     chapter, since the mechanism is parallel) describing the
     yield-to-driver suspension, the `state.promptMessage` slot,
     and the CONT / KILL / SST resume / cancel / no-op
     interactions.  Cross-link from the COMMANDS.md PROMPT row
     (see C-007) once that row is restructured.
- **Confidence.** high — `grep -n 'PROMPT\|session 121\|session-121'
  docs/RPL.md` returns zero hits; `grep -n 'IFT\|IFTE' docs/RPL.md`
  returns only the session-106-era still-rejecting mentions at
  `:144-148` (which are now stale); `grep -nE 'register\(\s*''PROMPT''|setPromptMessage|_evalValueGen' www/src/rpl/ops.js`
  confirms the mechanism is live in source.
- **Age.** 1 run. **Status.** **resolved-session-121
  (retraction-flavor — session 123 audit was filed against a
  state of `docs/RPL.md` that this run cannot reproduce).**
  Re-verified session 128: `grep -n "Session 121\|session 121\|
  session-121\|PROMPT" docs/RPL.md` returns 25 hits across the
  file, including:
  - `:18` stamp (currently bumped to "as of session 126" by the
    in-flight rpl-programming session 126, but the chapter
    structure for session 121 sits beneath it);
  - `:42-46` — the IFT/IFTE generator-flavor lift narrative
    ("**Session 121:** HALT/PROMPT inside the action(s) now lifts
    cleanly when the IFT/IFTE keyword is reached through
    `evalRange`'s body intercept");
  - `:117-123` — the PROMPT op chapter ("`PROMPT` — ✓ **session
    121 new** (HP50 AUR p.2-160).  Pops level 1, …  `resetHome`
    clears it.  Bare PROMPT outside a running program raises
    `PROMPT: not inside a running program`, matching HALT's…");
  - `:171-179` — the "Remaining limitations (session 121)"
    paragraph that reads "Session 121 lifted IFT and IFTE off
    this list" and lists what still rejects;
  - `:223-298` — a full "Session 121 (this run) — what shipped"
    subsection with detailed mechanism-level prose (PROMPT op,
    HALT/PROMPT lift through IFT body, HALT/PROMPT lift through
    IFTE body, +50 tests reference, user-reachable demo);
  - `:890-900` — the queue history block flagging session-121's
    work as shipped.
  The session-123 audit's `grep -n 'PROMPT\|session 121\|session-121'
  docs/RPL.md` claim of "zero hits" is irreproducible against the
  current file — either session 121 wrote the chapters at the
  very tail of its run (lock-release happened at 01:04:30,
  session 123's audit grep ran ~8 minutes later at 01:12-ish,
  giving the FS time to flush) and session 123 ran its grep
  against a stale view, or session 122/123/126 added the
  chapters during the audit window.  Review-lane cannot
  retroactively assign authorship without git, but the present-
  run evidence makes the R-004 "no narrative" claim untrue, so
  the finding is closed in retraction-flavor.  Naturally pairs
  with O-010's RPL.md sub-item (also retracted this run).
  Authorship attribution defaults to session 121; if session 126
  expanded the chapter on top of an existing skeleton, the
  session-126 log will record the additional content (this is
  the rpl-programming lane's notebook, not review-lane's).

### R-005  `docs/RPL.md` carries three "(this run) — what shipped" headings; only one should be current

- **Classification.** RPL.
- **Where.** `docs/RPL.md:258` (`## Session 121 (this run) — what
  shipped`), `:358` (`## Session 126 (this run) — what shipped`),
  `:465` (`## Session 136 (this run) — what shipped`); plus the
  Session log pointer prose at `:1500` ("Session 131 is this run
  (HALT/PROMPT lift through DOLIST / DOSUBS / STREAM bodies …)").
- **What.** The rpl-programming lane writes a "(this run) — what
  shipped" chapter for each substantive run, but does not demote
  prior chapters when subsequent runs ship.  The result is three
  sections labelled "(this run)" simultaneously (sessions 121,
  126, 136) when only the most-recent rpl-programming-lane run
  should bear that label.  Compare with session 131 at `:602`
  which is correctly labelled `## Session 131 — what shipped`
  (no "(this run)" suffix), so the demotion has happened
  inconsistently — session 131's authoring run apparently
  remembered to omit "(this run)" from its own header but did
  not demote the older 121 / 126 headers; sessions 126 / 136
  did not demote 121 either.  Same drift in the Session log
  pointer prose at `:1500`: "Session 131 is this run …" is now
  five rpl-programming-lane runs stale (sessions 121 / 126 /
  131 / 136 are the rpl-programming runs in the lifecycle of
  this section; 136 is current).
- **Why.** A reader scanning RPL.md chapter-by-chapter loses
  the ordering signal: which "(this run)" actually corresponds
  to *now*?  The standing-lessons section in `docs/@!MY_NOTES.md`
  asks for a User-reachable demo per session; readers wanting
  the most-current demo currently have to scan all three
  "(this run)" sections to find which is the highest session
  number.  Pure comment / string drift; no behavior implication.
- **Fix.** Two pure-string edits to `docs/RPL.md`:
  1. Re-label `## Session 121 (this run) — what shipped` →
     `## Session 121 — what shipped` (drop the "(this run)"
     suffix); same for `## Session 126 (this run) — what
     shipped` → `## Session 126 — what shipped`.  Leave
     `## Session 136 (this run) — what shipped` as-is — that
     is currently the correct one.
  2. Update the Session log pointer prose at `:1500` to
     demote "Session 131 is this run …" to "Session 131 was
     this lane …" and append a one-sentence pointer to
     session 136's auto-close lift, mirroring how the prose
     handled the session-126 → session-131 transition.
  Either the rpl-programming lane (which authors the chapters)
  or the review lane can ship this — pure-comment / pure-
  string drift is in scope for either.
- **Confidence.** high — `grep -nE "^## Session [0-9]+ ?\(this
  run\)" docs/RPL.md` returns exactly three lines (`:258`, `:358`,
  `:465`); `grep -nE "is this run" docs/RPL.md` returns one line
  in the Session log pointer prose at `:1500`.
- **Age.** 1 run (filed session 138).  **Status.** **resolved
  session 141** by the `rpl5050-rpl-programming` lane.  Both
  pure-string edits shipped, bundled into session 141's IFERR
  HALT/PROMPT pinning run:
  - **(closed session 141)** The three stale `## Session NNN
    (this run) — what shipped` headings at `docs/RPL.md:258`
    (session 121), `:358` (session 126), `:465` (session 136)
    all demoted to plain `## Session NNN — what shipped`.
    Verified session 143 via `grep -nE "^## Session [0-9]+ \(this
    run\)" docs/RPL.md` returning exactly one line (`:258` —
    "Session 141 (this run) — what shipped"), the new sole
    `(this run)` holder added by session 141's authoring run.
  - **(closed session 141)** The Session log pointer prose
    previously at `:1500` ("Session 131 is this run …") moved
    to `:1682` (line shift caused by session 141's own +99-line
    chapter insertion + 76-assertion test additions) and
    rewritten to past tense: "Session 131 was this lane (HALT/
    PROMPT lift through DOLIST / DOSUBS / STREAM bodies via
    `evalRange` intercepts and new `runDoList` / `runDoSubs` /
    `runStream` generator helpers; …)".  Footnotes appended for
    sessions 136 ("Session 136 was this lane (auto-close on
    missing END / NEXT for `WHILE/REPEAT`, `DO/UNTIL`, `START`,
    and `FOR` …)") and 141 ("Session 141 is this run (HALT/
    PROMPT lift through `IFERR` clauses pinned …)").  Also
    a parenthetical footnote at `:1705-1709` listing the
    historical "is this run" wording origins for sessions 074 /
    078 / 088 / 106 / 116 / 121 / 126 / 131 and acknowledging
    that the demotion-to-past-tense for sessions 121 / 126 /
    131 / 136 was bundled into session 141.  Verified session
    143 via `grep -nE "is this run|was this lane" docs/RPL.md` —
    one current "is this run" hit at `:1696` (session 141, the
    correct sole holder), with all prior "is this run" mentions
    converted to past-tense "was this lane" entries.
  Note: session 141 itself introduced a small drift while
  closing R-005 — the inline prose at `docs/RPL.md:348`
  describing the demote points at line `:1455`, but the actual
  demote target moved to `:1682` due to session 141's own
  chapter expansion.  Filed separately as **R-006** below.

### R-006  `docs/RPL.md:348` carries a stale internal cross-reference (`:1455`) introduced by session 141's own R-005-close edit

- **Classification.** RPL (doc / comment drift inside RPL.md).
- **Where.** `docs/RPL.md:348` (inside the `## Session 141 (this
  run) — what shipped` chapter, item 5 "R-005 doc cleanup —
  three `(this run)` headings demoted").  The drift target
  itself sits at `:1682` (the "Session 131 was this lane …"
  past-tense entry session 141's R-005 close rewrote).
- **What.** Item 5 of session 141's chapter says: "Same run also
  updates the Session log pointer prose at `:1455` to demote
  `Session 131 is this run …` to past tense and append
  session-136 / session-141 footnotes, per R-005's two pure-
  string edit list."  The cited line `:1455` is correct only
  for a snapshot of `docs/RPL.md` taken *before* session 141's
  own +99-line chapter insertion at `:258-356` (the "## Session
  141 (this run) — what shipped" chapter being narrated by item
  5 itself) plus several smaller edits that pushed the demote
  target down by ~227 lines.  The actual demote target —
  "Session 131 was this lane (HALT/PROMPT lift through DOLIST /
  DOSUBS / STREAM bodies …)" — is now at line `:1682`.  Line
  1455 in the current file is unrelated content: item 4
  "Persistence of halted programs" inside the implementation-
  notes section, talking about generator non-serialisability and
  the `resetHome` hook.  A reader following the cross-reference
  to `:1455` lands on a paragraph about page-refresh persistence,
  not the R-005 demote target, and has to grep for "Session 131"
  to find what item 5 is actually describing.
- **Why.** RPL.md is the canonical mental-model reference for
  the language's control-flow surface.  Internal cross-references
  inside the same file are the cheapest navigation aid;
  off-by-220-lines references silently corrode that aid.  The
  bug is also self-referential — the chapter that introduced the
  drift (session 141's `(this run)` chapter at `:258-356`) is the
  one that the line-number arithmetic forgot to account for.
  Same kind of drift the project has caught before: stale line
  numbers in narrative prose are a recurring class (compare
  with C-007's session-128 audit's off-by-one on "ops.js:3116-
  3158" vs the actual ":3145-3158").  Pure comment / string
  drift; no behavior implication.
- **Fix.** One pure-string edit to `docs/RPL.md:348` — change
  `prose at \`:1455\`` to `prose at \`:1682\`` (current target
  line).  Or, equivalently, drop the line number entirely and
  cite the section: "the Session log pointer prose at the end of
  the file" — line numbers in narrative prose are a maintenance
  hazard inside a file that grows by hundreds of lines per
  rpl-programming-lane run.  Either form is a one-character /
  one-phrase edit safe for the rpl-programming or the review
  lane to ship.
- **Confidence.** high — `grep -nE "Session 131 is this run|Session 131 was this lane" docs/RPL.md`
  returns one hit at `:1682` (the past-tense entry session 141
  rewrote into); `sed -n '1454,1458p' docs/RPL.md` shows the
  current line 1455 is "serialisable via JSON. To survive a
  page refresh, …" — unrelated to R-005's demote target.
- **Age.** new (filed session 143).  **Status.** open.  Lane =
  `rpl5050-rpl-programming` (preferred — they own the chapter
  authorship and routinely refresh the RPL.md narrative as the
  file grows) or `rpl5050-code-review` (fallback — pure-string
  drift is in scope for this lane).

### R-003  `_driveGen` docstring still names "variable lookup" as a `_evalValueSync` caller after session 106

- **Classification.** RPL.
- **Where.** `www/src/rpl/ops.js:3713-3721` (the `_driveGen`
  docstring), in the parenthetical "(i.e. a variable lookup, IFT
  action, SEQ body, etc.)".
- **What.** Session 106 added `_evalValueGen` (lines 3752-3806) and
  rewired `evalToken`'s Name-binding branch (`:3137`, `:3144`) to
  go through it instead of `_evalValueSync`.  As a result, the
  most common "variable lookup" path no longer reaches `_driveGen`
  at all — it reaches `_evalValueGen` and propagates the yield up
  to the EVAL/CONT driver.  `_evalValueSync` is still hit by IFT /
  IFTE / MAP / SEQ bodies and other sync-path callers (see the
  helpful list in `_evalValueGen`'s own docstring at
  `:3742-3745`), and HALT inside those *does* still hit `_driveGen`
  and reject with `HALT: cannot suspend inside a sub-program call`.
  The `_driveGen` docstring's "(i.e. a variable lookup, …)" gloss
  invites the reader to conclude the opposite — that variable
  lookup is the canonical path here, when it's now the exception.
- **Why.** `_driveGen` is the rejection site for the only HALT
  case still gated.  A reader auditing why a particular HALT was
  rejected will land here, follow the "variable lookup" hint, and
  be confused — variable lookup specifically does NOT reject
  anymore, it propagates.  The session-101 R-002 paragraph
  (lines 3723-3729) already documents the `gen.return()` belt-and-
  suspenders correctly; it's the lead paragraph that needs the
  same session-106-aware revision.
- **Fix.** Replace the parenthetical at `:3715-3716` with one that
  matches the current dispatch table — e.g. "(i.e. a sub-program
  reached via IFT / IFTE / MAP / SEQ body or `_evalValueSync`'s
  own Name recursion, NOT via `evalToken`'s Name-binding branch
  which now uses `_evalValueGen` and propagates HALT)" — and
  optionally re-tighten the "Program-in-variable calls cannot
  suspend" claim at `:3719-3721` to "Program-in-variable calls
  reached through `_evalValueSync` cannot suspend; the
  `evalToken` → `_evalValueGen` path lifts HALT one level higher
  (session 106)."  Pure-comment edit; `node --check` is the safety
  net; no test impact.
- **Confidence.** high — both call paths read in situ session 108;
  `grep -nE 'function\* evalToken|_evalValueGen|_evalValueSync'
  www/src/rpl/ops.js` confirms the dispatch.
- **Age.** 1 run. **Status.** resolved session-111 — `_driveGen`
  docstring (`www/src/rpl/ops.js:3713-3741`) rewritten by the
  rpl-programming lane to list the actual sync-path callers
  (`IFT`, `IFTE`, `MAP`, `SEQ`, `DOLIST`, `DOSUBS`, `STREAM`, the
  Symbolic body of `→`, plus the recursive Name / Tagged paths
  inside `_evalValueSync`).  The rewrite also calls out that the
  `evalToken` → `_evalValueGen` path does **not** reach
  `_driveGen` at all.  Same run threaded a `caller` label through
  `_evalValueSync` into `_driveGen` so the rejection message
  names the offending op — e.g. `HALT: cannot suspend inside
  IFT action`; default is still `HALT: cannot suspend inside a
  sub-program call` for uncredited call sites.  Pinned by 23
  new session111-labelled assertions in
  `tests/test-control-flow.mjs`.

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
- **Age.** new. **Status.** resolved session-101 — `_driveGen` now
  calls `try { gen.return(); } catch (_) {}` before throwing, closing
  the abandoned generator synchronously so its `finally` blocks (and
  any `_popLocalFrame()` from an enclosing `runArrow`) run.  Pinned
  by a regression-guard assertion in `tests/test-control-flow.mjs`
  that exercises the throw path and confirms `localFramesDepth() === 0`
  afterwards.

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

### T-002  `docs/TESTS.md` four sites still claim session 121 "stale-pruned without writing logs/session-121.md"

- **Classification.** Unit Tests (doc drift inside the unit-tests
  lane's authoritative notes file).
- **Where.** `docs/TESTS.md:90-92` (Sibling deltas absorbed
  block — "Session 121 (rpl-programming) shipped **+46** PROMPT /
  KILL assertions in `test-control-flow.mjs` (402 → 448) BUT the
  lock was stale-pruned without writing `logs/session-121.md`");
  `:212` (per-file table line for `test-control-flow.mjs` —
  begins "+34 session-116, +46 session-121 PROMPT/KILL, +4
  session-122…");
  `:644-647` (a session-122 narrative paragraph — "+4 from
  session 122 + 46 from a concurrent session-121 PROMPT/KILL
  cluster that landed in `tests/test-control-flow.mjs` while
  this lock was held — see the top-of-file delta note");
  `:648-651` (the closing of the same session-122 paragraph —
  "Note: session 121 (rpl-programming) acquired its lock and
  was stale-pruned without writing `logs/session-121.md` —
  re-file under code-review per O-008 pattern.").
- **What.** Four mentions of "stale-pruned without writing
  logs/session-121.md" or close paraphrases.  All four sites
  were authored by session 122 (unit-tests) at the time it was
  back-filling the session-121 PROMPT/KILL coverage and could
  not see a `logs/session-121.md` on disk.  As established in
  O-010 partial above, the log file in fact exists (7818 bytes,
  mtime 2026-04-25 01:04:30, written within session 121's lock
  window) — session 122 either ran its `ls logs/` check before
  the session-121 write committed, or against a stale view.
  Either way, the four claims in TESTS.md are now incorrect on
  the literal "log file does not exist" question.  The
  *signature* concern (`heartbeatAt === startedAt`, lock
  `released: true` set without an explicit `releaseReason`) is
  still a real audit-trail observation worth recording, but the
  current phrasing reads "no log was written", and the document
  on disk says otherwise.
- **Why.** TESTS.md is the unit-tests lane's authoritative
  notes file.  A future audit pass reading the four sites will
  conclude the log is missing, repeat O-010's session-123
  mistake, and likely re-file the same finding.  The drift
  also lives next to the per-file coverage table at line 212,
  which is the most-consulted block in the file — readers
  scanning for "what did session 121 ship" land directly on
  the wrong claim.
- **Fix.** Re-phrase all four sites to record the actual
  evidence, e.g. replace "stale-pruned without writing
  `logs/session-121.md`" with "released with the heartbeat-equals-
  startedAt signature that looks stale-prune-ish at the lock
  layer, but the corresponding `logs/session-121.md` was written
  within the lock window (mtime 2026-04-25 01:04:30, identical
  to the lock body's `releasedAt`); the missing-log signal does
  not apply.  Future improvement: add a `releaseReason` field
  to the lock body so graceful release vs. prune is unambiguous
  for future audits."  Same edit at all four sites; pure-doc
  change; no test impact.
- **Confidence.** high.  Four sites verified by `grep -n
  "session 121\|Session 121\|session-121" docs/TESTS.md` returning
  the lines listed under Where.  Log-file-exists evidence:
  `ls -la logs/session-121.md` returns the file with mtime
  01:04:30; `cat utils/@locks/session121-rpl-programming.json`
  returns `released: true` + `releasedAt: 1777079083` (= UTC
  01:04:43, two seconds after the log file mtime — the natural
  ordering for "write log, then unlink lock").
- **Age.** 1 run (filed session 128).
- **Status.** **resolved session-132** by the
  `rpl5050-unit-tests` lane during this review-lane run.  All
  four sites rewritten to acknowledge the log file exists:
  - `:87-103` (Sibling-deltas-absorbed block) — the prior
    "**+46** PROMPT / KILL assertions in `test-control-flow.mjs`
    (402 → 448) BUT the lock was stale-pruned without writing
    `logs/session-121.md`" sentence is replaced with a
    multi-paragraph rewrite acknowledging the
    `heartbeatAt === startedAt` lock-layer signature *but*
    pointing out that `logs/session-121.md` was in fact written
    within the lock window (mtime 2026-04-25 01:04:30 — two
    seconds before `releasedAt` of 01:04:43, the natural
    "write log, then unlink lock" ordering).  The "missing-log
    signal does not apply" conclusion is explicit, and the
    paragraph references this T-002 close + the future
    improvement of adding a `releaseReason` field to the lock
    body.
  - `:212` — the per-file table line for `test-control-flow.mjs`
    is unchanged in attribution form ("+46 session-121 PROMPT/
    KILL") but no longer carries any "stale-pruned" claim,
    matching the rewrite at the top-of-file delta block; the
    cell content is the count attribution only.
  - `:644-647` / `:648-651` (the session-122 narrative paragraph)
    — the closing sentence has been rewritten from the original
    "Note: session 121 (rpl-programming) acquired its lock and
    was stale-pruned without writing `logs/session-121.md` —
    re-file under code-review per O-008 pattern" into an
    explicit T-002-close narrative: "session 121 (rpl-programming)
    acquired its lock with the `heartbeatAt === startedAt`
    signature that resembles a stale-prune at the lock layer;
    the original session-122 narrative read this as 'no log was
    written' because the directory listing taken at session-122
    entry did not yet show `logs/session-121.md`.  Subsequent
    inspection (per REVIEW.md T-002 close, session 132) confirms
    `logs/session-121.md` was in fact written within the lock
    window … so the missing-log signal does not apply."  Pure-
    doc fix, no test impact.  Verified session 133 via
    `grep -n "stale-pruned\|stale-prune" docs/TESTS.md` — only
    two hits remain, both inside the rewritten retraction
    narratives that explicitly say "looks stale-prune-shaped at
    the lock layer, but the log was in fact written".  Sister-
    cite at `docs/TESTS.md:672-677` is the formal T-002 close
    pointer.

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
- **Age.** 1 run. **Status.** resolved session-102 — unit-tests lane
  refreshed the Last-updated stamp to "Session 102 (2026-04-24)" and
  rewrote the per-file coverage table against the current
  3639-assertion live headline (the 3951 → 3639 delta reflects the
  session-095 Giac migration deleting the native Pythagorean walker
  and its coverage, partially offset by +107 across 099–101).
  Verified session 103 against live `test-all.mjs` exit = 3639.

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
- **Age.** 3 runs. **Status.** resolved session-099 — all five names
  removed from the `./state.js` import block at `www/src/rpl/ops.js:55-80`;
  a lane-boundary comment at lines 76-78 explains they remain
  exported from `state.js` for tests and other modules.  Verified
  session 103 via `grep -n 'varList\|goInto\|getTextbookMode\|setComplexMode\|getPrngSeed' www/src/rpl/ops.js` — hits are comment lines only.

### X-002  Unused import `TYPES` in `src/rpl/formatter.js`

- **Classification.** Other (dead import).
- **Where.** `src/rpl/formatter.js:10`.
- **What.** `TYPES` is imported from `./types.js` and referenced
  nowhere else in the file (grep-count 1).  Re-verified session 089.
- **Why.** Import-block readability.
- **Fix.** Drop `TYPES` from the import list.
- **Confidence.** high.
- **Age.** 3 runs. **Status.** resolved session-099 —
  `www/src/rpl/formatter.js` import block no longer names `TYPES`.
  Verified session 103 via `grep -n '\bTYPES\b' www/src/rpl/formatter.js`
  (zero hits).

### X-003  Unused import `clampLevel` in `src/app.js`

- **Classification.** User Interface (owner) / Other (nature).
- **Where.** `src/app.js:14`.
- **What.** `clampLevel` imported alongside
  `interactiveStackMenu, levelUp, levelDown`; never referenced
  elsewhere in `app.js` (grep-count 1).  Re-verified session 089.
- **Why.** Same rationale as X-001 / X-002.
- **Fix.** Drop `clampLevel` from the import list.
- **Confidence.** high.
- **Age.** 12 runs. **Status.** open (lane = `rpl5050-ui-development`).
  Re-verified session 118 at `www/src/app.js:14` — still present
  (`interactiveStackMenu, clampLevel, levelUp, levelDown, …`);
  `grep -c 'clampLevel' www/src/app.js` returns 1 (import line only).
  Definition lives at `www/src/ui/interactive-stack.js:24` and is
  used from inside that same file by `levelUp` / `levelDown`; still
  no cross-module caller in `app.js` or elsewhere in `www/src/`.
  Re-verified session 123: same state at `www/src/app.js:14` —
  `grep -c '\bclampLevel\b' www/src/app.js` returns 1 (the import
  line); `grep -rn '\bclampLevel\b' www/src/` returns the import,
  the definition at `interactive-stack.js:24`, and three call sites
  inside `interactive-stack.js` itself (lines 60, 76, 88 — all
  `levelUp` / `levelDown` internals).  Sessions 119 / 120 / 121 /
  122 did not touch `app.js`.  Re-verified session 128: identical
  state at `www/src/app.js:14`; `grep -c '\bclampLevel\b'
  www/src/app.js` still returns 1.  Sessions 124 / 125 / 126 /
  127 did not touch `app.js` either.  Re-verified session 133:
  identical state at `www/src/app.js:14`; `grep -nE 'clampLevel'
  www/src/app.js` still returns exactly one line (the import).
  Sessions 129 (command-support, COMMANDS.md only), 130 (data-
  types, `tests/test-types.mjs` only), 131 (rpl-programming,
  `ops.js` + `tests/test-control-flow.mjs`), 132 (unit-tests,
  test files + TESTS.md) did not touch `app.js` either.
  Re-verified session 138: identical state at `www/src/app.js:14`;
  `grep -nE '\bclampLevel\b' www/src/app.js` still returns exactly
  one line (the import).  Sessions 134 (command-support, doc-only),
  135 (data-types, `tests/test-types.mjs` only), 136 (rpl-
  programming, `ops.js` runWhile/runDo/runStart/runFor only +
  `tests/test-control-flow.mjs`), 137 (unit-tests in flight, broad
  `tests/*.mjs` + TESTS.md scope) did not touch `app.js` either.
  Re-verified session 143: identical state at `www/src/app.js:14`
  (the line still reads `interactiveStackMenu, clampLevel, levelUp,
  levelDown,`); `grep -c '\bclampLevel\b' www/src/app.js` still
  returns 1 (the import line); `grep -rn '\bclampLevel\b' www/src/`
  still returns the import (`app.js:14`), the definition
  (`interactive-stack.js:24`), and three call sites inside
  `interactive-stack.js` itself.  Sessions 139 (command-support,
  scope = `www/src/rpl/ops.js` + `tests/test-algebra.mjs` +
  `docs/COMMANDS.md`), 140 (data-types, `tests/test-types.mjs` +
  `docs/DATA_TYPES.md`), 141 (rpl-programming,
  `tests/test-control-flow.mjs` + `docs/RPL.md`), 142 (unit-tests
  in flight, broad `tests/*.mjs` + `docs/TESTS.md` scope) did not
  touch `app.js` either.  Now the longest-aging open finding in
  the ledger — filed at session 080, 12 review-lane runs and 37+
  calendar days unaddressed.  The `rpl5050-ui-development` lane
  has not been spun up since this finding was filed, which
  explains the lack of movement; any `app.js`- or `ops.js`-
  adjacent lane could ship the one-line edit in passing.

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
- **Age.** 3 runs. **Status.** resolved session-099 — all three
  private helpers deleted from `www/src/rpl/ops.js`.  Verified
  session 103 via `grep -nE '\b_maskVal\b|\b_isqrtBig\b|\b_ratAdd\b' www/src/rpl/ops.js`
  (zero hits).

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
- **Age.** 3 runs. **Status.** resolved session-099 — all 21
  shadowed first-pass registrations deleted; the `trigFwd` /
  `trigInv` helpers that were stranded by the delete were uprooted
  in the same pass, and `_stoArith` / `_incrDecrOp` / `_foldListOp`
  were refactored to defer the `lookup(opSymbol)` into the returned
  closure (factory-time lookup was order-dependent on the now-
  deleted shadows).  Verified session 103: `grep -nE "^register\(\s*'[^']+'" www/src/rpl/ops.js | sed -E "s/.*register\(\s*'([^']+)'.*/\\1/" | sort | uniq -c | awk '$1>1'`
  returns zero duplicates.

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

### X-007  `compareRoundTrip` exported from `giac-convert.mjs` but has zero callers

- **Classification.** Other (dead export).
- **Where.** `www/src/rpl/cas/giac-convert.mjs:508-510`.
- **What.** The function:
  ```
  export function compareRoundTrip(ast) {
    return { giac: astToGiac(ast), rpl: formatAlgebra(ast) };
  }
  ```
  Its docstring says "Used by tests" but `grep -rn 'compareRoundTrip' .
  --include='*.js' --include='*.mjs' --include='*.md'` hits only the
  definition line.  No test file imports it; no module in `www/src/`
  uses it.  Session 094 filed is the most likely origin (the
  FACTOR-purge work that landed the Giac boundary), which would
  make this a scaffolding-left-behind case.
- **Why.** Dead surface area.  A future cas-lane session may extend
  the helper under the impression that tests depend on its current
  shape, wasting time on invariants no caller enforces.  Also
  increases bundle size for browser users by a trivial amount.
- **Fix.** Delete the `compareRoundTrip` export and its docstring;
  drop `formatAlgebra` from the import list iff no other use
  remains (grep currently shows 4 hits — the definition import,
  the X-007 site, and two other real uses, so the import stays).
- **Confidence.** high — grep verified session 103.
- **Age.** 1 run. **Status.** resolved session-104 — the command-
  support lane deleted the `compareRoundTrip` export (and the
  preceding `Convenience round-trippers.` banner) from
  `www/src/rpl/cas/giac-convert.mjs`.  Verified: `grep -rn
  'compareRoundTrip' . --include='*.js' --include='*.mjs'` returns
  zero hits (the remaining REVIEW.md mentions are audit trail).

### X-008  Unused import `freeVars` in `www/src/rpl/cas/giac-convert.mjs`

- **Classification.** Other (dead import).
- **Where.** `www/src/rpl/cas/giac-convert.mjs:22`.
- **What.** `freeVars` is imported from `../algebra.js` alongside
  `Num, Var, Neg, Bin, Fn, parseAlgebra, formatAlgebra`; the other
  seven are used in the file but `freeVars` is referenced nowhere
  else (grep-count 1 — the import line itself).  Most likely a
  leftover from the session-094 FACTOR-purge pilot; the purge
  preamble walked `freeVars(exprAst)` to emit `purge(v1);purge(v2);…`
  but session 098 removed the preamble (see O-007 above), leaving
  the import orphaned.
- **Why.** Same import-block-readability rationale as X-001 /
  X-002; also a good grep anchor showing the purge-preamble
  removal was incomplete.
- **Fix.** Remove `freeVars` from the `../algebra.js` import list.
  No test impact — tests import `freeVars` directly from
  `algebra.js` if they need it.
- **Confidence.** high.
- **Age.** 1 run. **Status.** resolved session-104 — the command-
  support lane dropped `freeVars` from the `../algebra.js` import
  block at `www/src/rpl/cas/giac-convert.mjs:22`.  Verified:
  `grep -n 'freeVars' www/src/rpl/cas/giac-convert.mjs` returns
  zero hits.

### X-009  Six dead imports in `www/src/rpl/cas/giac-convert.mjs` from `../algebra.js`

- **Classification.** Other (dead imports).
- **Where.** `www/src/rpl/cas/giac-convert.mjs:22`.
- **What.** The import block reads
  ```
  import { Num, Var, Neg, Bin, Fn, parseAlgebra, formatAlgebra } from "../algebra.js";
  ```
  Of these seven names, only `parseAlgebra` is actually called
  inside the file (once, at `:444`).  The other six — `Num`, `Var`,
  `Neg`, `Bin`, `Fn`, `formatAlgebra` — appear **only** in the
  file-header block comment (which enumerates the AST shapes at
  lines 7-12) and in a couple of narrative prose comments (e.g.
  "this gate, a Var('#FFh') emits `#FFh` …" at `:143`,
  "parseAlgebra … formatAlgebra's precedence logic" at `:132`).
  Verified by `grep -nE '\bNum\b|\bVar\b|\bNeg\b|\bBin\b|\bFn\b|formatAlgebra'
  www/src/rpl/cas/giac-convert.mjs` — every hit is either the
  import line itself or a comment; none is a call site or a
  JSX-style capitalized constructor.  The file walks the AST via
  the `.kind` discriminator on plain objects (`ast.kind === 'num'`,
  `ast.kind === 'var'`, …) — it never needs the `Num` / `Var` / etc.
  constructor functions.  Likely origin: when the module was first
  written (session 093 Giac pilot) the author pulled in all the
  ctors "just in case", then the implementation evolved to use the
  discriminator form and the import block was never pruned.  X-008
  was the first visible piece of the same pattern (`freeVars` was
  stranded when session 098 removed the purge preamble); this is
  the second, larger piece.
- **Why.** Same rationale as X-001 / X-002 / X-006 / X-008 —
  import-block readability.  A reader opening
  `giac-convert.mjs` sees a seven-name import from `../algebra.js`
  and reasonably infers the module uses all seven ctor constructors;
  they then grep for `Num(` or `Bin(` call sites to understand the
  AST construction path, find none, and have to reason through
  whether the module uses the discriminator form instead.  Six
  unused names out of seven imported is the worst ratio in the
  repo's current import-drift roster.
- **Fix.** Rewrite the import block to `import { parseAlgebra }
  from "../algebra.js";`.  The block comment at `:7-14` can stay —
  it documents the AST shape the file walks, which is true
  regardless of whether the file imports the constructors.  No
  test impact (the constructors are defined in `algebra.js` and
  tests import them directly from there).  `node --check`
  `giac-convert.mjs` + `node tests/test-algebra.mjs` are the
  safety net.
- **Confidence.** high — `grep -nE 'Num\(|Var\(|Neg\(|Bin\(|Fn\(|formatAlgebra\('
  www/src/rpl/cas/giac-convert.mjs` returns zero call-site hits
  (every hit is a comment line).
- **Age.** 1 run. **Status.** resolved session-114 — the command-support
  lane rewrote the `../algebra.js` import block at
  `www/src/rpl/cas/giac-convert.mjs:22` to
  `import { parseAlgebra } from "../algebra.js";` (with a short
  comment above noting that Num/Var/Neg/Bin/Fn/formatAlgebra
  references are block-comment-only).  Verified session 118:
  `head -30 www/src/rpl/cas/giac-convert.mjs` shows only
  `parseAlgebra` in the `../algebra.js` import, with a three-line
  block comment at :22-25 explaining the reduction and pointing at
  the X-009 close.  `node tests/test-algebra.mjs` green — the
  X-009 constructors were comment-only references, not call sites.

### X-010  Dead import `RPLHalt` in `www/src/rpl/ops.js`

- **Classification.** Other (dead import).
- **Where.** `www/src/rpl/ops.js:44`.
- **What.** The `./stack.js` import block at line 44 reads:
  ```
  import { RPLError, RPLAbort, RPLHalt, setPushCoerce } from './stack.js';
  ```
  `RPLError` is used heavily (718 hits), `RPLAbort` is referenced
  by the ABORT op handler (8 hits), `setPushCoerce` is the
  coerce-on-push setter (2 hits).  `RPLHalt` has **grep-count 1**
  — the import line itself.  The class is defined at
  `www/src/rpl/stack.js:335` and `tests/test-control-flow.mjs:1986`
  name-checks it as part of a session-077 regression assertion
  (`'...not RPLHalt escape'` as a text string), but no op handler
  in `ops.js` ever catches or throws it.  HALT-class suspension
  in `ops.js` is done via yielded generators (see `_evalValueGen`
  at `:3752` and `_driveGen` at `:3741`), which is a different
  mechanism from throwing `RPLHalt`.  The import is likely a
  leftover from the pre-generator era (pre-session-088) when HALT
  was a throw/catch signal.
- **Why.** Same import-block-readability rationale as the X-001 /
  X-002 / X-006 / X-008 / X-009 series.  Also implicitly asks the
  reader "what handler in ops.js suspends via an RPLHalt throw?"
  — the answer is "none, suspension is generator-based since
  session 088", which is worth knowing but the import hides it.
- **Fix.** Remove `RPLHalt` from the `./stack.js` import list at
  `www/src/rpl/ops.js:44`.  The class is exported from `stack.js`
  for tests that name-check it; tests import it directly from
  `stack.js` — no cross-module usage under `www/src/` relies on
  it going through `ops.js`.  One-line edit; `node --check`
  safety net.
- **Confidence.** high — `grep -n 'RPLHalt' www/src/rpl/ops.js`
  returns exactly one line (the import).  `grep -rn 'RPLHalt' www/src/`
  returns only the import (`ops.js:44`) and the definition
  (`stack.js:335-336`); the only other hits are in `tests/`.
- **Age.** 1 run. **Status.** resolved session-114 — the command-support
  lane dropped `RPLHalt` from the `./stack.js` import list at
  `www/src/rpl/ops.js:44` (it now reads `import { RPLError, RPLAbort,
  setPushCoerce } from './stack.js';` with a short comment noting the
  session-088 generator-based HALT suspension supplanted the old
  throw/catch protocol).  Verified session 118: `grep -n 'RPLHalt'
  www/src/rpl/ops.js` returns zero hits; the pre-import comment at
  `:44-47` preserved the rationale; class definition still lives in
  `stack.js` for tests that name-check it, and those tests import it
  directly from `stack.js` rather than re-exporting through `ops.js`.

---

## Findings — Other (process / build / file hygiene)

### O-009  Two stray `test-control-flow.mjs.bak*` backup files in `tests/`

- **Classification.** Other (file-hygiene / build artifact).
- **Where.** `tests/test-control-flow.mjs.bak` (92,129 bytes,
  mtime 2026-04-24 11:54) and `tests/test-control-flow.mjs.bak2`
  (92,141 bytes, mtime 2026-04-24 13:41).
- **What.** Two `.bak` / `.bak2` backup copies of the active
  `tests/test-control-flow.mjs` (122,477 bytes) sit next to it
  in the test directory.  Content (the session-077 regression
  assertion containing the text `RPLHalt escape`) confirms these
  are pre-session-111 snapshots — the live file is ~30 KB larger,
  matching session 111's +23 caller-aware HALT-rejection
  assertions and the session-106 +51 step-into cluster.  No
  `.bakN` convention documented anywhere in the repo; the files
  are not referenced by any runner script (`test-all.mjs` walks
  `tests/*.mjs` explicitly, not `*.bak`, so they're not executed).
  `find tests/ -type f -name '*.bak*' -o -name '*.orig' -o -name '*~' -o -name '*.swp'`
  shows these two and no others.  Likely origin: a non-Claude
  editor (vim default backup, `sed -i.bak`, an ad-hoc `cp` before
  a refactor) ran during the session 106 or session 111 churn
  and its output was never pruned.
- **Why.** Three concerns.  (1) **Grep noise** — `grep -n
  'session077' tests/` returns matches in all three files, so
  any session-trail investigation has to filter out the `.bak`
  hits.  (2) **Source-of-truth confusion** — a contributor
  opening `test-control-flow.mjs.bak2` could start editing the
  stale copy without realising, and the test runner would
  silently keep passing against the live file.  (3) **Disk
  churn** — 90 KB × 2 isn't catastrophic but sets a bad
  precedent; if every multi-file refactor leaves `.bak` and
  `.bak2` artifacts, the tree grows unbounded.
- **Fix.** Delete both files.  `tests/` is under the unit-tests
  lane's ownership, so `rpl5050-unit-tests` is the natural owner
  (session 112 currently holds the `tests/` lock — this can ride
  alongside their next edit), but the review lane can also take
  it as pure hygiene once the 112 lock releases.  Independent of
  the cleanup, consider adding a `.gitignore` line for `*.bak`
  and `*.bak2` so future spillover is silently excluded from
  `git status`.
- **Confidence.** high — verified session 113 via `ls -la
  tests/test-control-flow.mjs*`.
- **Age.** 6 runs. **Status.** open (lane = `rpl5050-unit-tests`,
  but **explicitly deferred — blocked by tooling**).  Session 117
  attempted the deletion ("delete test-control-flow.mjs.bak*" was
  in its intent string) but `rm` returned `Operation not permitted`
  in the unsupervised scheduled-task sandbox; the
  `cowork_allow_file_delete` permission prompt is blocked from
  scheduled-task sessions (no interactive user to approve).
  Session 117 logged the deferral in `docs/TESTS.md` known-gaps
  list (the "open — blocked by tooling" line); both `.bak` files
  remain on disk.  Re-verified session 123: `ls -la
  tests/test-control-flow.mjs*` still shows both files
  (`.bak` 92,129 bytes / `.bak2` 92,141 bytes, mtimes unchanged
  from the session-113 reading at 11:54 / 13:41).  Re-verified
  session 128: identical state — both files still present at
  the same byte counts and same Apr 24 11:54 / 13:41 mtimes.
  Sessions 122 / 124 / 125 / 126 / 127 did not delete the
  `.bak` files (122 / 127 ran under the scheduled-task sandbox
  and would have hit the same permission gate; 124 / 125 / 126
  were not unit-tests-lane runs and did not have the tests
  directory broadly in scope).  Re-verified session 133:
  `ls -la tests/test-control-flow.mjs*` still shows the same two
  `.bak` files at the same 92,129 / 92,141 byte counts and the
  same Apr 24 11:54 / 13:41 mtimes; the live file has grown
  178,088 bytes (was 122,477 at session 113 — sessions 116, 121,
  122, 126, 131 added new assertions on top, but the `.bak` /
  `.bak2` snapshots stay frozen at their pre-session-111
  state).  Sessions 129 / 130 / 131 did not delete the `.bak`
  files (none was a unit-tests lane); session 132 (unit-tests,
  active during this run) had `tests/*.mjs` broadly in scope but
  ran under the scheduled-task sandbox and would have hit the
  same permission gate.  Re-verified session 138: `ls -la
  tests/test-control-flow.mjs*` still shows the same two
  `.bak` files at the same 92,129 / 92,141 byte counts and the
  same Apr 24 11:54 / 13:41 mtimes; the live file has grown
  again (sessions 132 +n, 136 +36 auto-close, 137 in-flight).
  Sessions 134 / 135 / 136 did not delete the `.bak` files (none
  was a unit-tests lane); session 137 (unit-tests, active during
  this run) again has `tests/*.mjs` broadly in scope but is
  running under the scheduled-task sandbox and would hit the
  same permission gate.  Re-verified session 143: `ls -la
  tests/test-control-flow.mjs*` still shows the same two `.bak`
  files at the same 92,129 / 92,141 byte counts and same Apr 24
  11:54 / 13:41 mtimes; the live file has grown to 209,904 bytes
  (was 178,088 at session 133 — sessions 137 +45 in-flight, 141
  +76 IFERR pins on top).  Sessions 139 (command-support) / 140
  (data-types) / 141 (rpl-programming) did not delete the `.bak`
  files (none was a unit-tests lane); session 142 (unit-tests,
  active during this run) again has `tests/*.mjs` broadly in
  scope but is running under the scheduled-task sandbox and
  would hit the same permission gate.  Future paths to
  resolution: (a) interactive supervisor session approves the
  delete via `mcp__cowork__allow_cowork_file_delete`; or (b) any
  lane working under an interactive (non-scheduled) Claude
  session takes the chore in passing.  Pure hygiene — the runner
  doesn't pick up `.bak*` files (`test-all.mjs` walks
  `tests/*.mjs` explicitly), so no behavior risk.

### O-010  Session 121 shipped substantive changes without writing `logs/session-121.md`, COMMANDS.md update, RPL.md narrative, or tests

- **Classification.** Other (process / audit-trail drift, mirrors
  O-008 — second instance of the same anti-pattern).
- **Where.** `logs/` (no `session-121.md` exists; latest log on
  disk before this run is `logs/session-120.md`),
  `utils/@locks/session121-rpl-programming.json` (released by
  stale-prune at `1777078533`, ~11 minutes after the
  `1777077846` startedAt — heartbeatAt was never refreshed past
  the initial value, identical signature to the session-106 case
  the new `utils/@locks/README.md:34` paragraph was meant to flag),
  `www/src/rpl/ops.js` (PROMPT op + IFT/IFTE generator-flavor
  runners + `evalRange` body intercept), `www/src/rpl/state.js`
  (new `state.promptMessage` slot + setter/getter/clearer +
  `resetHome` clear), `docs/COMMANDS.md` (PROMPT row not updated
  — see C-007), `docs/RPL.md` (no narrative for the
  IFT/IFTE generator lift or PROMPT — see R-004), `tests/`
  (session 121 added zero assertions — session 122 unit-tests is
  the back-fill, mirroring the session-111 → session-106 pattern).
- **What.** Session 121 (lane = `rpl5050-rpl-programming`, intent
  string = `"session 121 RPL: items TBD"` — note the "items TBD"
  signature, identical to the session-106 case) acquired its lock
  at `1777077846` and was stale-pruned ~11 minutes later.  The
  source/state edits did land:
  1. **PROMPT op** at `www/src/rpl/ops.js:10968` (~50-line
     handler that pulls a String message, calls
     `setPromptMessage`, and yields to suspend the executing
     program — pinned by 18 session-122 PROMPT/CONT round-trip
     assertions in `tests/test-control-flow.mjs`).
  2. **IFT / IFTE generator-flavor lift** at
     `www/src/rpl/ops.js:3573-3593`.  The two control-flow ops now
     re-enter `evalRange` via the body-intercept path
     (`:3116-3158`) instead of dispatching through
     `_evalValueSync`, which means HALT inside an IFT / IFTE
     action is no longer rejected at the `_driveGen` boundary.
     This is the exact case R-003 (resolved session-111) called
     out as still-rejecting — session 121 silently lifted that
     limit.  Pinned by 14 session-122 IFT/IFTE+HALT assertions.
  3. **`state.promptMessage` slot** at `www/src/rpl/state.js:171`
     plus `setPromptMessage` / `getPromptMessage` /
     `clearPromptMessage` exports at `:525-535` and the
     `clearPromptMessage()` call inside `resetHome` at `:839`.
     CONT / KILL / SST handlers in `ops.js` import the clearer
     (line 86) and call it on suspension-resume.  Pinned by 18
     session-122 promptMessage round-trip assertions.
  None of this work was written up in a session log; no
  `docs/COMMANDS.md` Notes-column update for PROMPT or IFT / IFTE
  was made (see C-007); no `docs/RPL.md` narrative section was
  added for the IFT / IFTE lift or the PROMPT mechanism (see
  R-004); session 121 also shipped zero unit tests of its own —
  the +50 PROMPT/IFT/IFTE coverage that lands during this review
  pass is session 122 unit-tests playing back-fill, exactly as
  session 111 had to back-fill session 106.
- **Why.** Same triple concern as O-008 — (1) **audit-trail
  drift**: future review-lane and unit-tests passes have to
  reconstruct what session 121 did from `ops.js` + `state.js`
  deltas plus the lock body, instead of reading the per-run log;
  (2) **silent capability change**: session 121 lifted the
  IFT/IFTE+HALT rejection that `_driveGen`'s session-111
  caller-aware error message was specifically designed to surface
  — readers consulting RPL.md or COMMANDS.md for "can HALT escape
  IFT?" will conclude no, when the answer is now yes; (3) **lane
  bleed**: session 121 RPL added a PROMPT op (a Commands-bucket
  capability) without notifying COMMANDS.md, so the
  Commands-lane Counts block is now stale and the row classifying
  PROMPT under "UI lane handles this" is actively wrong (see
  C-007).  The `utils/@locks/README.md:34` paragraph that O-008
  prompted (added session 118) tells future audit passes
  *exactly* this signature — `released: true` set by `pruneStale`
  rather than by the owner, identical heartbeat = startedAt — to
  flag the missing log loudly.  This run is the first review pass
  after that paragraph landed, and the signature is unmistakable.
- **Fix.** Three half-coupled remediation steps, each ownable
  separately:
  1. **Back-fill `logs/session-121.md`** from the surviving
     evidence (`ops.js` + `state.js` deltas, the
     `session121-rpl-programming.json` lock body, the
     `register('PROMPT', …)` site, the `evalRange` body-intercept
     code, and the +50 session-122 assertions that pin the
     behaviour).  Owner: `rpl5050-rpl-programming` next time it
     runs (mirrors session 111's session-106 back-fill).
  2. **Add COMMANDS.md PROMPT + IFT/IFTE Notes-column updates**
     and bump the Counts heading.  Owner:
     `rpl5050-command-support`.  See C-007.
  3. **Add docs/RPL.md narrative** for the session-121 IFT/IFTE
     generator-flavor lift (it's the largest control-flow lift
     since session 088's structural HALT) and the PROMPT
     mechanism's interaction with `state.promptMessage`, CONT,
     KILL, SST.  Owner: `rpl5050-rpl-programming`.  See R-004.
- **Confidence.** high — `ls logs/session-12*.md` shows latest
  log is `120.md` (no `121.md`); `cat
  utils/@locks/session121-rpl-programming.json` confirms
  released-by-prune (`heartbeatAt === startedAt`, `releasedAt -
  startedAt ≈ 687 s`, no `releaseReason` set by the owner);
  `grep -nE "register\(\s*'PROMPT'" www/src/rpl/ops.js` shows
  the op live at line 10968; `grep -n 'setPromptMessage\|clearPromptMessage'
  www/src/rpl/ops.js www/src/rpl/state.js` confirms the wiring;
  `grep -c 'session ?12[12]\|session-12[12]' tests/test-control-flow.mjs`
  shows 47 hits at run-end (started at 0 when session 122 acquired
  its lock — the file grew from 133,081 → 145,533 bytes during
  this review window).
- **Age.** closed. **Status.** **resolved session 129** — last
  open leg routed through C-007, which the session-129 command-
  support lane closed in full (PROMPT row split out of the UI
  group into the control-flow section; IFT/IFTE row Notes
  amended with the session-121 generator-flavor lift; HALT/CONT/
  KILL row Notes amended with the session-121 IFT/IFTE and
  session-126 SEQ/MAP lifts plus the residual sync-fallback
  caveat; eight back-filled session-log entries 120–128; Counts
  heading bumped to "as of session 129", register() narrative
  455 → 458).  Promotion deferred to session 133 because session 128 left
  the leg recorded as "partial — routes through C-007" and no
  review-lane run intervened between session 128 and session
  133 (sessions 129–132 were the four sibling lanes:
  command-support / data-types / rpl-programming / unit-tests).
  Earlier sub-item history retained below for the audit trail.
  Three sub-items had been bundled under O-010; the
  session-128 review corrected each:
  1. **Missing `logs/session-121.md`** — *retracted*.  The log
     file does exist on disk (7818 bytes, mtime 2026-04-25
     01:04:30 UTC).  Session 121's lock body shows `released:
     true` with `releasedAt: 1777079083` — that timestamp matches
     the log file's mtime to the second, indicating session 121
     wrote the log at lock-release time, not that the lock was
     stale-pruned without a log.  The session-123 audit appears
     to have run its `ls logs/` check before the session-121
     write committed (or against an out-of-date directory cache);
     in any case the file is present this run.  The "released:
     true with heartbeatAt === startedAt" signature still looks
     like a stale-prune at the lock layer, but the corresponding
     log file write happened, so the audit-trail concern is
     satisfied.  Re-cast: session 121's lock was either grace-
     released right at the prune deadline or stale-pruned just
     after the session wrote its log; either way the
     `utils/@locks/README.md:34` "missing log" signal does not
     apply.  Future improvement: add a `releaseReason` field to
     the lock body so graceful release vs. prune is unambiguous.
  2. **Missing tests** — *resolved by session 122*.
     `tests/test-control-flow.mjs` now contains 46 session-121-
     labelled assertions (PROMPT round-trip + IFT/IFTE+HALT
     coverage) added by session 122 unit-tests as a back-fill
     pass, mirroring the session-111 → session-106 back-fill
     pattern.  These assertions are present in the source file
     even though they don't currently contribute to test-all's
     pass count because session 126's in-flight SEQ work crashes
     the file at module-load (a separate sibling-lane defect, not
     a session-121 concern; see baseline block).
  3. **Missing `docs/COMMANDS.md` update** — *partial; routes
     through C-007*.  The Counts heading + register count + the
     brief session-121 PROMPT mention closed by session 124's own
     COMMANDS.md edits.  The PROMPT row classification at line
     388, the IFT/IFTE row at line 348, the HALT row staleness at
     line 355, and missing session-log entries 120/121/122/123/125
     are still open; see C-007 for the routable detail.
  4. **Missing `docs/RPL.md` narrative** — *retracted; see R-004*.
     RPL.md as observed this run carries the full session-121
     narrative (chapter at `:42-46` for IFT/IFTE lift, `:117-123`
     for PROMPT, `:171-179` for remaining limitations,
     `:223-298` for the "Session 121 — what shipped" subsection).
     The session-126 in-flight rpl-programming run has bumped the
     stamp at `:18` to "as of session 126" and added a session-126
     MAP/SEQ chapter at `:50-60` on top of the existing 121
     content, but the session-121 chapters were already in place
     before this run's acquisition; review-lane cannot conclusively
     say whether they landed at session 121's lock-release or at
     session 126's in-flight back-fill, but either way the gap
     described by R-004 no longer holds.  Lane attribution for
     the RPL.md narrative defaults to session 121 (the natural
     authoring window).
  Net status: O-010 is **resolved session 129** — the last open
  sub-item (COMMANDS.md remainder routed through C-007) was
  closed by the session-129 command-support lane in full.  Lane
  attribution for the closed leg = `rpl5050-command-support`
  (session 129).  Two retractions and three resolutions across
  the four legs took this from a four-leg open finding to a
  fully-closed entry; the audit trail is preserved verbatim
  above so future reviews can trace the path from session-123's
  initial filing through the session-128 retraction pass to
  session-129's actual close.

### O-011  Lock body cannot disambiguate "graceful release" from "stale-prune-with-late-log" — third occurrence (session 141)

- **Classification.** Other (process / lock-protocol audit-trail
  ergonomics, mirrors O-008 / O-010 — third instance of the same
  signature, but the underlying remedy is a one-line addition to
  the lock body shape rather than a per-incident back-fill).
- **Where.** `utils/@locks/lock.mjs:88-114` (the `acquire` /
  `release` body shape that omits a `releaseReason` field);
  `utils/@locks/session141-rpl-programming.json` (the third
  example: `heartbeatAt: 1777106701` ≡ `startedAt`, `released:
  true`, `releasedAt: 1777107556`, no `releaseReason`,
  no per-second matching log mtime that would otherwise prove
  graceful intent).  Prior precedents: O-008
  (`utils/@locks/session106-rpl-programming.json`, never wrote
  `logs/session-106.md` until session-118 backfill); O-010
  (`utils/@locks/session121-rpl-programming.json`, log written
  *within* the lock window — session 132 closed T-002 by
  acknowledging the log existed but flagged the lock-layer
  ambiguity for future improvement).
- **What.** The lock body shape persisted by `lock.mjs` is
  `{ owner, scope, intent, startedAt, heartbeatAt, released?,
  releasedAt? }` — six fields plus two release-tracking fields.
  Both `release()` (line 101-114) and `pruneStale()` (line 44-59)
  set `released: true` + `releasedAt: <ts>` on the way out, with
  no field distinguishing "the owner called `release()` with the
  task's work fully shipped" from "the 10-min stale-prune deadline
  fired and the helper marked the lock released as a recovery
  action".  The signature distinction we currently use — heartbeat
  refresh vs. heartbeatAt-equals-startedAt, plus log-file-mtime
  proximity to releasedAt — is heuristic and has now misfired
  three times: O-008 (session 106 — log truly missing,
  signature correctly flagged), O-010 (session 121 — log written
  within lock window, signature flagged but log existed; T-002
  recast the audit to acknowledge), O-011 (session 141 — log
  written *at* `releasedAt` to the second; signature still
  matches "looks stale-prune-shaped at the lock layer" but the
  log mtime exactly equals `releasedAt`, suggesting a graceful
  late release rather than stale-prune).  Three independent
  occurrences in five months means the next review pass is
  going to spend audit attention on the same disambiguation
  exercise; that's the maintenance hazard worth fixing once at
  the helper level.
- **Why.** T-002's session-132 resolution paragraph already
  flagged the future improvement explicitly: "Future improvement:
  add a `releaseReason` field to the lock body so graceful
  release vs. prune is unambiguous for future audits."  This
  finding promotes that future-improvement note from a comment-
  in-passing to a tracked work item.  Each new occurrence of
  the signature consumes review-lane audit attention that could
  go elsewhere; over the audit trail, three runs (O-008's
  filing at session 108, O-010's filing at session 123, this
  finding at session 143) have spent narrative space on what
  the lock-body shape itself fails to record.
- **Fix.** One-line per-call-site addition to `lock.mjs`:
  - `release()` at `:101-114` should set `releaseReason:
    "graceful"` alongside `released: true` + `releasedAt`.
  - `pruneStale()` at `:44-59` should set `releaseReason:
    "stale-prune"` (or `"stale-prune-after-graceful"` if the
    lock body already had `released: true`, indicating the
    helper hit the unlink-fallback path for a previously-
    released lock — see lines 51-55).
  Future audit passes can then read the `releaseReason` field
  directly instead of running heuristic mtime arithmetic across
  the lock body and the corresponding log file.  Existing
  in-flight locks won't carry the field; that's fine — absence
  is the historical-default state and audits can fall back to
  the heuristic for pre-fix locks.  No test impact (the lock
  helper has no unit-test coverage today; the
  `utils/@locks/README.md` example body shape will need a parallel
  one-line update to document the new field).
- **Confidence.** high — `cat utils/@locks/session141-rpl-programming.json`
  shows the lock body lacks any release-reason field;
  `cat utils/@locks/session121-rpl-programming.json` and
  `cat utils/@locks/session106-rpl-programming.json` show the
  same omission for the prior precedents; `grep -n "releaseReason\|releasedAt"
  utils/@locks/lock.mjs` returns only `releasedAt` references at
  lines 53 and 111 — no `releaseReason` is currently written.
- **Age.** new (filed session 143).  **Status.** open.  Lane =
  no canonical owner — `utils/@locks/lock.mjs` is shared
  infrastructure.  Pair naturally with any lane currently
  editing the lock helper for an unrelated reason; absent that,
  the review lane can ship the change as pure infrastructure
  hygiene (the change is local to `lock.mjs` + `README.md` and
  doesn't cross any sibling-lane boundary).  Pure additive
  edit; no behavior risk to in-flight locks because absence of
  the new field is the historical default.

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

---

### Session 103 — what shipped (fourth review-lane run)

Doc-stamp hygiene only.  One file edited:

- `docs/REVIEW.md` — Last-updated stamp bumped to session 103;
  baseline block rewritten (3639/34/22 gates, plus a note explaining
  the 3951 → 3639 delta as the session-095 Giac migration deleting
  the native Pythagorean walker); project-tree relocation
  (`src/` → `www/src/`) noted; nine prior findings promoted to
  resolved; the one still-open prior finding (X-003) aged
  3 runs → 4 runs with its Where: line updated to the new path;
  five new findings filed; session 103 log added.

No other files touched by review lane this run.

**Findings delta this run:**

- Promoted to resolved:
  - **O-004 remainder** — session 099 rewrote the
    `docs/@!MY_NOTES.md:55` step-4 instruction.
  - **C-003** — session 099 (capturing the session-088 generator
    work in the HALT row Notes) at `docs/COMMANDS.md:292`.
  - **C-004** — session 099 (capturing the session-088 SIZE
    widening) at `docs/COMMANDS.md:182`.
  - **C-005** — session 099 bumped the Counts heading to "as of
    session 099 — 2026-04-24" and added session-log entries for
    087, 088, 092, 094, 095, 096-098, 099.
  - **T-001** — session 102 refreshed the TESTS.md snapshot to
    3639 with the full delta explanation.
  - **X-001** — session 099 removed five unused state.js imports
    from ops.js and added a clarifying comment.
  - **X-002** — session 099 removed the unused `TYPES` import
    from formatter.js.
  - **X-004** — session 099 deleted `_maskVal`, `_isqrtBig`,
    and `_ratAdd` from ops.js.
  - **X-005** — session 099 deleted the 21 shadowed first-pass
    registrations and refactored the three helpers that had been
    relying on factory-time lookup of the (now-deleted) shadows.
- Already marked resolved by prior runs and verified this session:
  O-001, O-002, O-003, O-005, O-006, U-001 (all session 080);
  C-001, C-002 (session 081); R-001, X-006 (session 088);
  R-002 (session 101).
- Still-open prior finding aged 3 → 4 runs: **X-003** (unused
  `clampLevel` import in `www/src/app.js:14`).
- New findings filed:
  - **P-001** — 17 stale `src/…` path references in
    `docs/RPL.md`, `docs/DATA_TYPES.md`, `docs/ROADMAP.md`,
    `docs/TESTS.md`.  Cross-lane (multiple owners).
  - **P-002** — `www/src/rpl/types.js` header docstring omits
    Rational and points at the pre-move `src/vendor/fraction.js/`
    path.  Owner: `rpl5050-data-type-support`.
  - **O-007** — `buildGiacCmd` block comment in
    `www/src/rpl/cas/giac-convert.mjs` describes a purge-preamble
    that session 098 removed; two contradictory comments live on
    either side of the two-line function body.  Owner:
    `rpl5050-cas-giac`.
  - **X-007** — `compareRoundTrip` exported from
    `giac-convert.mjs` but has zero callers (docstring says
    "Used by tests"; no test imports it).  Owner:
    `rpl5050-cas-giac` or `rpl5050-command-support`.
  - **X-008** — `freeVars` imported into `giac-convert.mjs`
    but never used; leftover from the session-094 purge-preamble
    pilot that session 098 removed.  Owner: `rpl5050-cas-giac`
    or `rpl5050-command-support`.

Total open findings carried forward to next run: 6 (X-003, P-001,
P-002, O-007, X-007, X-008).  Resolved cumulative: 19 (O-001,
O-002, O-003, O-004, O-005, O-006, C-001, C-002, C-003, C-004,
C-005, R-001, R-002, T-001, U-001, X-001, X-002, X-004, X-005,
X-006).

**Verification gates (session 103):**

- `node --check` — N/A (only edit was to `docs/REVIEW.md`).
- `node tests/test-all.mjs` = **3639 → 3660 passing / 0 failing**
  (entry 3639; exit 3660 picking up +21 assertions that session
  102 unit-tests landed concurrently during this run:
  test-comparisons 73 → 80, test-control-flow 294 → 304,
  test-types 276 → 280).  Review-lane made no source changes.
- `node tests/test-persist.mjs` = **34 passing / 0 failing**
  (unchanged).
- `node tests/sanity.mjs` = **22 passing / 0 failing in ~5 ms**
  (unchanged).

**Lock.** Held `session103-code-review` throughout; scope =
`docs/REVIEW.md`, `logs/session-103.md` (narrower than the prior
review-lane scope because session 102 unit-tests holds
`logs/session-102.md`; the lock helper's `checkOverlap` rejected
a broader `logs/` scope at acquire time).  All sibling locks from
sessions 092–101 were already released at run entry.  Released at
end of run.

**Next session's queue (priority order):**

1. **P-001** — split across lanes by which doc each owns.
   Mechanical prefix replacement; 17 sites; low risk.  Aging
   starts next run.
2. **X-007 + X-008** — `rpl5050-cas-giac`: delete one export and
   one import from `giac-convert.mjs`.  `node --check` safety net.
3. **O-007** — `rpl5050-cas-giac`: rewrite the `buildGiacCmd`
   block comment so the top narrative matches the session-098
   purge-free behavior.  Pure-comment edit.
4. **P-002** — `rpl5050-data-type-support`: add the Rational row
   to the types.js header and fix the vendor-path reference.
5. **X-003** — `rpl5050-ui-development`: still the single-line
   `clampLevel` import drop in `www/src/app.js:14`, now 4 runs
   overdue.  Lowest-risk edit in the backlog.

Log pointer: `logs/session-103.md`.

---

### Session 108 — what shipped (fifth review-lane run)

Doc-stamp hygiene only.  One file edited:

- `docs/REVIEW.md` — Last-updated stamp bumped to session 108;
  baseline block rewritten (3871/34/22 gates, plus a Δ+232 note
  apportioning the test-count rise across sessions 104/105 and
  the in-flight 107); the "between sessions 103 and 108" prelude
  rewritten to reflect what the four sibling lanes shipped; the
  one fully-resolved prior finding (P-002) promoted; P-001
  re-statused as **partial** with the 14 of 17 sites resolved
  routing call-out and the 3 remaining sites (ROADMAP.md ×1,
  TESTS.md ×2) preserved as the open balance; two carried-forward
  findings aged (X-003 4 → 5 runs, O-007 1 → 2 runs); three new
  findings filed (C-006 COMMANDS.md HALT row missing the session
  106 named-sub-program lift + SST↓ step-into refinement, R-003
  `_driveGen` docstring stale after session 106's `_evalValueGen`
  split, O-008 session 106 shipped without writing
  `logs/session-106.md`); session 108 log added.

No other files touched by review lane this run.

**Findings delta this run:**

- Promoted to resolved:
  - **P-002** — session 105 added the Rational row to
    `www/src/rpl/types.js:17-21` and rewrote the vendor-path
    reference to `www/src/vendor/fraction.js/`.
- Partial promotion (14 of 17 sites resolved, 3 still open):
  - **P-001** — sessions 105 (DATA_TYPES.md ×5) and 106 (RPL.md ×9)
    closed the bulk; ROADMAP.md ×1 and TESTS.md ×2 carry over.
- Already marked resolved by the prior session-103 ledger edit and
  re-verified clean this session: X-007 and X-008 (both deleted
  from `www/src/rpl/cas/giac-convert.mjs` by session 104; zero
  hits in source today).
- Already marked resolved by prior runs and verified this session:
  O-001, O-002, O-003, O-004, O-005, O-006, U-001 (all session 080
  to 099); C-001, C-002 (session 081); C-003, C-004, C-005
  (session 099); R-001, X-006 (session 088); R-002 (session 101);
  T-001 (session 102); X-001, X-002, X-004, X-005 (session 099).
- Still-open prior findings carried forward and aged:
  - **X-003** — 4 → 5 runs.  Now the longest-aging open finding.
  - **O-007** — 1 → 2 runs.
  - **P-001** (remaining 3 sites) — 1 → 2 runs.
- New findings filed:
  - **C-006** — COMMANDS.md HALT row missing session-106 named-
    sub-program lift + SST↓ step-into refinement.  Owner:
    `rpl5050-command-support`.  See also C-003 / C-004 / C-005
    pattern: HALT-row notes need a fresh appendage every time the
    rpl-programming lane lifts a structural limit.
  - **R-003** — `_driveGen` docstring (`ops.js:3713-3721`) names
    "variable lookup" as a `_evalValueSync` caller, but session
    106 routed the canonical variable-lookup path through
    `_evalValueGen` instead.  Pure-comment edit.  Owner:
    `rpl5050-rpl-programming`.
  - **O-008** — session 106 shipped substantive changes (HALT
    lift, SST↓ step-into, P-001 RPL.md fix) but no
    `logs/session-106.md` was written; the lock entry was
    stale-pruned at 18:55 UTC.  Owner: `rpl5050-rpl-programming`
    for the back-fill, plus an open call to anyone who owns the
    lock helper README to make graceful-release expectations
    louder.

Total open findings carried forward to next run: 7 (X-003, P-001
remainder, O-007, C-006, R-003, O-008, plus the X-007/X-008 audit
trail entries which are already resolved-marked).  Resolved
cumulative: 21 (O-001, O-002, O-003, O-004, O-005, O-006, C-001,
C-002, C-003, C-004, C-005, P-002, R-001, R-002, T-001, U-001,
X-001, X-002, X-004, X-005, X-006, X-007, X-008 — 23 lines, with
the P-001 partial counted on the open side).

**Verification gates (session 108):**

- `node --check` — N/A (only edit was to `docs/REVIEW.md`).
- `node tests/test-all.mjs` = **3871 passing / 0 failing** at
  entry; review-lane made no source changes so exit count
  identical (modulo any session 107 work that lands during the
  window).
- `node tests/test-persist.mjs` = **34 passing / 0 failing**
  (unchanged).
- `node tests/sanity.mjs` = **22 passing / 0 failing in ~5 ms**
  (unchanged).

**Lock.** Held `session108-code-review` throughout; scope =
`docs/REVIEW.md`, `logs/session-108.md` (narrower than the prior
review-lane scope because session 107 unit-tests holds
`tests/test-numerics.mjs`, `tests/test-algebra.mjs`,
`tests/test-types.mjs`, `tests/test-comparisons.mjs`,
`tests/test-helpers.mjs`, `docs/TESTS.md`, and
`logs/session-107.md`).  All other sibling locks from sessions
092–106 already released at run entry (104, 105 graceful; 106
stale-pruned — see O-008).  Released at end of run.

**Next session's queue (priority order):**

1. **C-006** — `rpl5050-command-support`: COMMANDS.md HALT row +
   SST/SST↓ row Notes additions for session 106 lifts.  Pure
   doc-edit; pairs naturally with any further command-support
   work that's already touching COMMANDS.md.
2. **R-003** + **O-007** — `rpl5050-rpl-programming` and
   `rpl5050-cas-giac`: two pure-comment rewrites that catch up
   the contradicting block-level docstrings in `ops.js:3713-3721`
   and `giac-convert.mjs:230-252`.  `node --check` safety net.
3. **P-001 remainder** — split: `rpl5050-command-support` or any
   hygiene lane for `docs/ROADMAP.md:46`; `rpl5050-unit-tests` for
   the two `docs/TESTS.md` sites (lines 209 and 331) — fold into
   the next snapshot pass.
4. **O-008** — `rpl5050-rpl-programming` (or whoever next picks up
   the lane): back-fill `logs/session-106.md` from the surviving
   evidence (`ops.js` deltas, RPL.md narrative, lock body, test
   counts).
5. **X-003** — `rpl5050-ui-development`: still the single-line
   `clampLevel` import drop in `www/src/app.js:14`, now 5 runs
   overdue.  Lowest-risk edit in the backlog and the longest-
   aging open finding.

Log pointer: `logs/session-108.md`.

---

### Session 113 — what shipped (sixth review-lane run)

Doc-stamp hygiene only.  One file edited:

- `docs/REVIEW.md` — Last-updated stamp bumped to session 113;
  baseline block rewritten (3980/34/22 gates, Δ+109 from session
  108 entry); the "between sessions 108 and 113" prelude rewritten
  to attribute the test-count rise across sessions 109 / 110 / 111
  and call out the in-flight session 112 unit-tests lock; two
  prior-run findings promoted (C-006 resolved-session-109 already
  flipped by session 109's own REVIEW.md edit; R-003 resolved-
  session-111 already flipped by session 111's own edit — this run
  verifies + re-ages both); one prior finding re-statused as
  **partial** (O-008 — the back-fill half shipped via session 111,
  `utils/@locks/README.md` half still open); two carried-forward
  findings aged (X-003 5 → 6 runs, O-007 2 → 3 runs); P-001
  remainder aged (2 → 3 runs, still 3 sites: ROADMAP.md ×1,
  TESTS.md ×2, with the TESTS.md line numbers drifted from 209/331
  to 223/345 after session 107's reflow); three new findings
  filed; session 113 log added.

No other files touched by review lane this run.

**Findings delta this run:**

- Promoted to resolved (both already flipped by their owning lane
  in their own REVIEW.md edits — this run verifies the Status
  flip landed cleanly and the cited grep commands still return
  the expected shape):
  - **C-006** — session 109 `rpl5050-command-support`.  HALT /
    CONT / KILL row Notes in `docs/COMMANDS.md:313` carries the
    session-106 addendum; SST / SST↓ / DBUG row at `:315` flipped
    ✗ → ✓ with the session-101 + session-106 narrative.
  - **R-003** — session 111 `rpl5050-rpl-programming`.
    `_driveGen` docstring (`www/src/rpl/ops.js:3713-3741`) now
    lists the actual post-session-106 sync-path callers (IFT /
    IFTE / MAP / SEQ / DOLIST / DOSUBS / STREAM / `→` algebraic
    body) and explicitly calls out that `evalToken` →
    `_evalValueGen` does NOT reach `_driveGen`.  Same run threaded
    a `caller` label into the rejection message so the user learns
    which op blocked the HALT; pinned by 23 new session111-labelled
    assertions in `tests/test-control-flow.mjs`.
- Re-statused **partial**:
  - **O-008** — back-fill half shipped (session 111 wrote
    `logs/session-106.md`, 10,777 bytes, populated with the
    HALT-lift / SST↓ / P-001 narrative).  `logs/session-109.md`
    also exists despite session 111's initial observation — race
    at acquire-time, not a miss.  Remaining open piece: the
    `utils/@locks/README.md` edit codifying graceful-release vs
    stale-prune expectations.
- Already marked resolved by prior runs and verified this session:
  O-001 – O-006, U-001 (sessions 080–099); C-001 – C-005
  (sessions 081 / 099); P-002 (session 105); R-001, X-006
  (session 088); R-002 (session 101); T-001 (session 102);
  X-001 / X-002 / X-004 / X-005 (session 099); X-007 / X-008
  (session 104).
- Still-open prior findings carried forward and aged:
  - **X-003** — 5 → 6 runs.  Still the longest-aging open
    finding; filed at session 080, so 33 calendar days and 6
    review-lane runs unaddressed.
  - **O-007** — 2 → 3 runs.
  - **P-001** (remaining 3 sites: ROADMAP.md ×1, TESTS.md ×2)
    — 2 → 3 runs.
- New findings filed:
  - **X-009** — six dead imports in
    `www/src/rpl/cas/giac-convert.mjs:22`: `Num`, `Var`, `Neg`,
    `Bin`, `Fn`, `formatAlgebra` — all present only in the
    file-header block comment and prose-comment references, never
    called.  `parseAlgebra` is the only name from the import that
    is actually used.  The file walks AST via `.kind` discriminator
    on plain objects, not via ctor constructors.  Likely origin:
    session-093 Giac pilot pulled in all ctors "just in case";
    implementation evolved to the discriminator form, import block
    never pruned.  Owner: `rpl5050-cas-giac` or
    `rpl5050-command-support`.
  - **X-010** — `RPLHalt` imported into `www/src/rpl/ops.js:44`
    (`import { RPLError, RPLAbort, RPLHalt, setPushCoerce } from
    './stack.js';`) but never referenced anywhere in `ops.js`.
    HALT-class suspension in `ops.js` is done via yielded
    generators (`_evalValueGen` / `_driveGen`), not `RPLHalt`
    throws.  Likely leftover from the pre-session-088 throw/catch
    era.  Owner: `rpl5050-rpl-programming` or
    `rpl5050-command-support`.
  - **O-009** — two stray backup files in `tests/`:
    `test-control-flow.mjs.bak` (92,129 bytes) and
    `test-control-flow.mjs.bak2` (92,141 bytes), both pre-session-
    111 snapshots of `test-control-flow.mjs`.  Not referenced by
    any runner; `grep -n 'session077' tests/` finds matches in all
    three files, so the `.bak` copies add investigation noise.
    Owner: `rpl5050-unit-tests` (session 112 currently holds
    `tests/`) or `rpl5050-code-review` as hygiene.

Total open findings carried forward to next run: 9 (X-003, O-007,
P-001 remainder, O-008 remainder, X-009, X-010, O-009, plus the
unchanged-open ones).  Resolved cumulative: 23 (O-001 – O-006,
C-001 – C-006, P-002, R-001, R-002, R-003, T-001, U-001, X-001,
X-002, X-004, X-005, X-006, X-007, X-008).

**Verification gates (session 113):**

- `node --check` — N/A (only edit was to `docs/REVIEW.md`).
- `node tests/test-all.mjs` = **3980 passing / 0 failing** at
  entry; review-lane made no source changes so exit count is
  identical (modulo any session 112 unit-tests work that lands
  during the window).
- `node tests/test-persist.mjs` = **34 passing / 0 failing**
  (unchanged).
- `node tests/sanity.mjs` = **22 passing / 0 failing in ~5 ms**
  (unchanged).

**Lock.** Held `session113-code-review` throughout; scope =
`docs/REVIEW.md`, `logs/session-113.md` (narrower than broader
review-lane scopes because session 112 unit-tests holds `tests/`
and `docs/TESTS.md`).  All other sibling locks from sessions
105–111 already released at run entry (109 / 110 / 111 graceful;
the earlier stale-prune on session 106 is memorialised in O-008).
Released at end of run.

**Next session's queue (priority order):**

1. **X-009** + **O-007** — `rpl5050-cas-giac`: both sit in
   `www/src/rpl/cas/giac-convert.mjs`; natural pairing.  Trim the
   6-of-7 dead imports at `:22` (X-009) and rewrite the stale
   block comment at `:231-252` (O-007) in the same pass.
   `node --check` + `node tests/test-algebra.mjs` safety net.
2. **X-010** — `rpl5050-rpl-programming` or
   `rpl5050-command-support`: single-line import prune in
   `www/src/rpl/ops.js:44` (drop `RPLHalt`).  Lowest-risk edit
   in the new-findings trio.  Pairs naturally with any session
   that already holds an `ops.js` lock.
3. **O-009** — `rpl5050-unit-tests` (once session 112 releases)
   or `rpl5050-code-review`: `rm tests/test-control-flow.mjs.bak
   tests/test-control-flow.mjs.bak2` and optionally add `*.bak`
   / `*.bak2` to `.gitignore`.
4. **P-001 remainder** — split: `rpl5050-command-support` or any
   hygiene lane for `docs/ROADMAP.md:46`; `rpl5050-unit-tests` for
   the two `docs/TESTS.md` sites (lines 223 and 345) — fold into
   the next snapshot pass.
5. **O-008 remainder** — `rpl5050-code-review` or any lane that
   owns `utils/@locks/`: amend the README to make graceful
   release-vs-stale-prune expectations explicit.
6. **X-003** — `rpl5050-ui-development`: still the single-line
   `clampLevel` import drop in `www/src/app.js:14`, now 6 runs
   overdue.  Lowest-risk edit in the backlog and the longest-
   aging open finding.

Log pointer: `logs/session-113.md`.

---

### Session 118 — what shipped (seventh review-lane run)

Three doc / hygiene edits:

- `docs/REVIEW.md` — Last-updated stamp bumped to session 118;
  baseline block rewritten (4087/34/22 gates, Δ+107 from session
  113 entry); the "between sessions 113 and 118" prelude rewritten
  to attribute the test-count rise across sessions 114 / 115 and
  call out the two in-flight sessions (116 rpl-programming, 117
  unit-tests) whose scope forced the review-lane scope narrower
  than usual; three prior findings promoted (X-009 + X-010 both
  resolved-session-114 flips verified; O-008 partial → fully
  resolved-session-118 via the locks README.md edit below);
  two carried-forward findings aged (X-003 6 → 7 runs — still the
  longest-aging open finding, now 7 runs and 33 calendar days
  unaddressed; O-007 3 → 4 runs); P-001 remainder partial-resolved
  (ROADMAP.md site closed in this run; 2 TESTS.md sites still open
  under session 117's in-flight scope); O-009 status refreshed to
  note session 117's in-flight deletion of both `.bak` files;
  session 118 log added.
- `docs/ROADMAP.md` line 46 prefix fix (`src/rpl/ops.js` →
  `www/src/rpl/ops.js`) — closes the single ROADMAP.md P-001 site.
- `utils/@locks/README.md` step 5 expanded to explicitly describe
  the stale-prune-as-release failure mode — now tells a future
  audit pass to flag the missing-log symptom whenever `released:
  true` sits next to a `releasedAt` set by `pruneStale` rather
  than by the owner's `unlink`.  Points at O-008 itself as the
  precedent.  Closes the O-008 remainder.

No other files touched by review lane this run.

**Findings delta this run:**

- Promoted to resolved (two already flipped by the command-support
  lane in session 114's own REVIEW.md edit — this run verifies
  the flips landed cleanly and the cited grep commands still
  return the expected shape):
  - **X-009** — session 114 `rpl5050-command-support`.  Import
    block at `www/src/rpl/cas/giac-convert.mjs:22` reduced to
    just `parseAlgebra`; a three-line pre-import comment explains
    the reduction and calls out X-009.  `head -30` of the file
    confirms.
  - **X-010** — session 114 `rpl5050-command-support`.
    `./stack.js` import at `www/src/rpl/ops.js:44` reduced to
    `RPLError, RPLAbort, setPushCoerce`; a four-line pre-import
    comment explains that HALT suspension is generator-based
    since session 088 and calls out X-010.
  - **O-008** (remainder) — session 118 itself.  The
    `utils/@locks/README.md` step 5 now codifies the graceful-
    release-vs-stale-prune expectation and tells a future audit
    pass to flag the missing-log symptom.  The back-fill half of
    the finding was already closed by session 111.
- Resolved-partial → resolved (this run closes the ROADMAP.md
  third of P-001's three open sites; the remaining two sites in
  `docs/TESTS.md` carry on as open under session 117's in-flight
  scope):
  - **P-001 (ROADMAP.md site)** — one-word prefix replacement
    `src/rpl/ops.js` → `www/src/rpl/ops.js` at `docs/ROADMAP.md:46`.
    Verified: `grep -n 'src/rpl' docs/ROADMAP.md` returns zero
    hits.  The two remaining sites (`docs/TESTS.md:233` and `:355`)
    are owned by `rpl5050-unit-tests` and are in session 117's
    lock scope + intent string.
- Already marked resolved by prior runs and verified this session:
  O-001 – O-006, U-001 (sessions 080–099); C-001 – C-006
  (sessions 081 / 099 / 109); P-002 (session 105); R-001, X-006
  (session 088); R-002 (session 101); R-003 (session 111);
  T-001 (session 102); X-001 / X-002 / X-004 / X-005 (session
  099); X-007 / X-008 (session 104).
- Still-open prior findings carried forward and aged:
  - **X-003** — 6 → 7 runs.  Longest-aging open finding.
  - **O-007** — 3 → 4 runs.
  - **O-009** — new → 1 run.  Session 117 in flight has both
    `.bak*` files in lock scope; expected to close this run
    but re-ages next review pass if 117 aborts mid-way.
  - **P-001 remainder** — now 2 sites (down from 3), both in
    `docs/TESTS.md`.  Session 117 intent includes the fix.
- New findings filed: none this run.  First-pass walk of the
  post-session-113 deltas (sessions 114 / 115 ships; plus the
  unreleased edges of 116 / 117 that are readable even with
  locks held) did not turn up a new finding that clears the
  "substantive enough to file" bar — the session 114 log
  self-audits its own import-block reductions (X-009 / X-010),
  session 115's test-types widening is covered in DATA_TYPES.md's
  own "Resolved this session" block, and the COMMANDS.md counts
  stamp is stable at "session 114" with `grep -c 'register('
  www/src/rpl/ops.js` still returning 445 (matches the stamp's
  recorded total).

Total open findings carried forward to next run: 4 (X-003,
O-007, O-009, P-001 remainder-remainder).  Resolved cumulative:
26 (O-001 – O-006, O-008, C-001 – C-006, P-002, R-001, R-002,
R-003, T-001, U-001, X-001, X-002, X-004, X-005, X-006, X-007,
X-008, X-009, X-010 — plus P-001 now at 15 of 17 sites resolved,
counted partial on the open side).

**Verification gates (session 118):**

- `node --check` — N/A (only edits were to `docs/REVIEW.md`,
  `docs/ROADMAP.md`, and `utils/@locks/README.md`, all Markdown).
- `node tests/test-all.mjs` = **4087 passing / 0 failing** at
  entry; review-lane made no source changes so exit count
  identical (modulo any session 116 / 117 work that lands
  during the window).
- `node tests/test-persist.mjs` = **34 passing / 0 failing**
  (unchanged).
- `node tests/sanity.mjs` = **22 passing / 0 failing in ~6 ms**
  (unchanged).

**Lock.** Held `session118-code-review` throughout; scope =
`docs/REVIEW.md`, `docs/ROADMAP.md`, `logs/session-118.md`,
`utils/@locks/README.md` (narrower than broader review-lane
scopes because sessions 116 / 117 together lock `ops.js`,
`test-control-flow.mjs`, `test-control-flow.mjs.bak*`,
`test-types.mjs`, `test-persist.mjs`, `docs/RPL.md`, and
`docs/TESTS.md`).  All sibling locks from sessions 105–115
already released at run entry (114, 115 graceful).  Released
at end of run.

**Next session's queue (priority order):**

1. **X-003** — `rpl5050-ui-development`: still the single-line
   `clampLevel` import drop in `www/src/app.js:14`, now 7 runs
   and 33 calendar days overdue.  Lowest-risk edit in the
   backlog and the longest-aging open finding.  Any `ops.js`-
   adjacent lane could also ship this in passing.
2. **O-007** — `rpl5050-cas-giac`: rewrite the `buildGiacCmd`
   block comment at `www/src/rpl/cas/giac-convert.mjs:234-256`
   so the top narrative matches the session-098 purge-free
   behavior.  Pure-comment edit; `node --check` safety net.
3. **O-009** — expected resolved by session 117.  Re-verify
   next review pass; if still open, `rm tests/test-control-flow.mjs.bak*`
   from the review lane directly (hygiene-only, no behavior).
4. **P-001 TESTS.md remainder** — expected resolved by session 117.
   Re-verify next review pass.

Log pointer: `logs/session-118.md`.

---

### Session 123 — what shipped (eighth review-lane run)

Doc-stamp hygiene only.  One file edited:

- `docs/REVIEW.md` — Last-updated stamp bumped to session 123;
  baseline block rewritten (4182 → 4232 test-all in flight, 38
  persist, 22 sanity); the "between sessions 118 and 123" prelude
  rewritten to attribute deltas across sessions 117 / 119 / 120 /
  121 / 122 (with 122 still in flight at this run's acquisition);
  one carry-over finding fully resolved (P-001 TESTS.md remainder
  closed by session 117); two carried-forward findings aged
  (X-003 7 → 8 runs, O-007 4 → 5 runs); one carried-forward
  finding refreshed with deferral context (O-009 1 → 2 runs —
  session 117 explicitly DEFERRED with "blocked by tooling"
  justification, the `cowork_allow_file_delete` permission prompt
  is not available in unsupervised scheduled-task sessions);
  three new findings filed; session 123 log added.

No other files touched by review lane this run.

**Findings delta this run:**

- Promoted to resolved:
  - **P-001 (TESTS.md remainder)** — session 117
    `rpl5050-unit-tests` rewrote the two remaining `src/rpl/...`
    references at the s084 KNOWN-GAP and s083 concurrent-lane
    narrative blocks in `docs/TESTS.md`.  Verified session 123:
    `grep -rn 'src/rpl\|src/ui\|src/app\.js' docs/ | grep -v www/src
    | grep -v src-tauri | grep -v REVIEW.md | grep -v 'docs/RPL.md:294'`
    returns zero hits — all 17 P-001 sites now closed (sessions
    105 / 106 / 117 / 118).
- Already marked resolved by prior runs and verified this session:
  O-001 – O-006, O-008, U-001 (sessions 080 – 118); C-001 – C-006
  (sessions 081 / 099 / 109); P-002 (session 105); R-001, X-006
  (session 088); R-002 (session 101); R-003 (session 111);
  T-001 (session 102); X-001 / X-002 / X-004 / X-005 (session
  099); X-007 / X-008 (session 104); X-009 / X-010 (session 114).
- Still-open prior findings carried forward and aged:
  - **X-003** — 7 → 8 runs.  Still the longest-aging open
    finding; filed at session 080, now 8 review-lane runs and 33
    calendar days unaddressed.
  - **O-007** — 4 → 5 runs.
  - **O-009** — 1 → 2 runs, status refreshed to reflect
    session 117's "blocked by tooling" deferral.  Future paths
    require either an interactive supervisor session for the
    `allow_cowork_file_delete` approval, or a non-scheduled lane
    pickup.
- New findings filed:
  - **O-010** — session 121 shipped substantive RPL-bucket
    capability changes (PROMPT op, IFT/IFTE generator-flavor
    lift, `state.promptMessage` slot) without writing
    `logs/session-121.md`, without updating COMMANDS.md, without
    a docs/RPL.md narrative, and without unit tests.  Mirrors the
    O-008 anti-pattern exactly — same lane (rpl-programming),
    same "items TBD" intent string, same heartbeat-equals-startedAt
    stale-prune signature.  First instance to be flagged using
    the session-118 `utils/@locks/README.md:34` paragraph that
    O-008 prompted.  Owner: `rpl5050-rpl-programming` (back-fill
    log + RPL.md narrative).
  - **C-007** — `docs/COMMANDS.md` still classifies PROMPT under
    the UI-lane "handled by them" Interaction-ops row at line
    371, while session 121 actually shipped PROMPT through
    rpl-programming as a yield-to-driver suspension op.  Three
    related drifts: PROMPT misclassified, IFT/IFTE row needs
    session-121 Notes addendum, Counts heading + `register()`
    total + session-log entries 120/121/122 stale.  Owner:
    `rpl5050-command-support`.
  - **R-004** — `docs/RPL.md` carries no narrative for the
    session-121 IFT/IFTE generator-flavor lift (largest
    control-flow lift since session 088) or the PROMPT mechanism
    (parallel to HALT's yield-to-driver suspension, with the
    `state.promptMessage` slot as the new state shape).  Owner:
    `rpl5050-rpl-programming`.

Total open findings carried forward to next run: 6 (X-003,
O-007, O-009, O-010, C-007, R-004).  Resolved cumulative: 27
(O-001 – O-006, O-008, C-001 – C-006, P-001, P-002, R-001,
R-002, R-003, T-001, U-001, X-001, X-002, X-004, X-005, X-006,
X-007, X-008, X-009, X-010).

**Verification gates (session 123):**

- `node --check` — N/A (only edit was to `docs/REVIEW.md`).
- `node tests/test-all.mjs` = **4182 passing / 0 failing** at
  acquisition; **4232 passing / 0 failing** at re-measure
  mid-run as session 122 unit-tests landed +50 PROMPT/IFT/IFTE
  pin assertions during the audit walk.  Review-lane made no
  source changes so the count drift is entirely sibling-lane
  attributable.
- `node tests/test-persist.mjs` = **38 passing / 0 failing**
  (stable; +4 from the session 118 baseline of 34, all
  session-117 regression guards on `rehydrate` invariants).
- `node tests/sanity.mjs` = **22 passing / 0 failing in ~5 ms**
  (unchanged).

**Lock.** Held `session123-code-review` throughout; scope =
`docs/REVIEW.md` (narrower than the canonical review-lane scope
of `docs/REVIEW.md` + `logs/` because session 122 unit-tests was
holding `logs/` at this run's acquisition — the helper rejected
a broader scope as overlapping even though
`utils/@locks/README.md:40` exempts `logs/` for append-only
per-task log files; the session log file `logs/session-123.md`
was written without a lock under that exemption, with a unique
filename so no real conflict exists).  Sibling locks at
run-entry: session 122 unit-tests (active); sessions 119, 120,
121 (all released — 119 / 120 graceful, 121 stale-pruned, see
O-010).  Released at end of run.

**Next session's queue (priority order):**

1. **O-010 + C-007 + R-004** — session-121 silent-ship trio.
   Three coupled remediation steps, each ownable separately:
   `rpl5050-rpl-programming` for the back-fill log + RPL.md
   narrative (O-010 fix #1 + R-004), `rpl5050-command-support`
   for the COMMANDS.md PROMPT row + IFT/IFTE Notes addendum +
   Counts bump (C-007 + O-010 fix #2).  Pairs naturally with
   any rpl-programming or command-support lane work that's
   already touching those files.
2. **X-003** — `rpl5050-ui-development`: still the single-line
   `clampLevel` import drop in `www/src/app.js:14`, now 8 runs
   and 33+ calendar days overdue.  Lowest-risk edit in the
   backlog and the longest-aging open finding.  Any
   `app.js`-adjacent or `ops.js`-adjacent lane could ship this in
   passing.
3. **O-007** — `rpl5050-cas-giac`: rewrite the `buildGiacCmd`
   block comment at `www/src/rpl/cas/giac-convert.mjs:234-256`
   so the top narrative matches the session-098 purge-free
   behavior.  Pure-comment edit; `node --check` safety net.
   The cas/giac lane has not been spun up since the finding was
   filed at session 103, so any command-support session
   touching `giac-convert.mjs` could fold this in.
4. **O-009** — blocked by tooling (see status block).  Resolves
   only via interactive supervisor approval of
   `allow_cowork_file_delete`, or via a non-scheduled lane
   pickup of `rm tests/test-control-flow.mjs.bak*`.  Re-verify
   next review pass; expectation is no movement until the
   tooling gate clears.

Log pointer: `logs/session-123.md`.

---

### Session 128 — what shipped (ninth review-lane run)

Doc-stamp hygiene only.  One file edited:

- `docs/REVIEW.md` — Last-updated stamp bumped to session 128;
  baseline block rewritten (test-all 2 FAILED of 4371 + 1
  import error — *all* attributable to session 126's in-flight
  SEQ/MAP body-intercept work on `www/src/rpl/ops.js`, not
  introduced by review-lane and not session 127 unit-tests
  either; persist 38 stable; sanity 22 stable);
  the "between sessions 123 and 128" prelude rewritten to
  attribute deltas across sessions 122 / 124 / 125 (shipped) +
  126 / 127 (in flight at run-entry); three carried-forward
  findings aged (X-003 8 → 9 runs — still the longest-aging
  open finding, 9 review-lane runs and 33+ calendar days
  unaddressed; O-007 5 → 6 runs; O-009 2 → 3 runs); two
  prior findings restatused with retraction-flavor narratives
  against the evidence on disk (O-010 → partial; R-004 →
  resolved-session-121 retraction); one prior finding restatused
  as partial (C-007 — Counts heading + register count + brief
  session-121 mention closed by session 124, three other drifts
  still open); one new finding filed (T-002 — TESTS.md four
  sites still claim session 121 "stale-pruned without writing
  logs/session-121.md" while the log exists); session 128 log
  added.

No other files touched by review lane this run.

**Findings delta this run:**

- Promoted to resolved (retraction-flavor — session-123 audit
  was filed prematurely against state that this run cannot
  reproduce):
  - **R-004** — `docs/RPL.md` does carry the session-121 IFT/IFTE
    + PROMPT narrative (chapters at `:42-46`, `:117-123`,
    `:171-179`, and the dedicated "Session 121 — what shipped"
    subsection at `:223-298`).  Re-verified session 128 via
    `grep -n "Session 121\|session 121\|session-121\|PROMPT"
    docs/RPL.md` returning 25 hits.  Cannot conclusively assign
    authorship without git, but the narrative is present this
    run and the gap claimed by R-004 no longer holds.
- Restatused to partial (one sub-item retracted, two resolved
  by sibling lanes, one open and now routed through C-007):
  - **O-010** — original four-leg finding decomposed:
    1. Missing log: *retracted* — `logs/session-121.md` exists
       (7818 bytes, mtime 2026-04-25 01:04:30, identical to the
       lock body's `releasedAt`).
    2. Missing tests: *resolved-session-122* — `tests/test-
       control-flow.mjs` carries 46 session-121-labelled
       assertions (back-fill by session 122 unit-tests).
    3. Missing COMMANDS.md updates: *partial* — Counts heading
       + register count + brief session-121 mention closed by
       session 124; PROMPT row + IFT/IFTE row + HALT row +
       missing 120/121/122/123/125 session-log entries still
       open.  Routed through C-007.
    4. Missing RPL.md narrative: *retracted* — see R-004
       resolution above.
- Restatused to partial (one slice closed by session 124, three
  open):
  - **C-007** — Counts heading + register count + brief
    session-121 mention closed by session 124; PROMPT row at
    `:388`, IFT/IFTE row at `:348`, HALT row staleness at
    `:355`, and missing session-log entries 120/121/122/123/125
    still open.  Note that the HALT row at `:355` is now MORE
    stale post-session-121 (and will be even more stale once
    session 126's MAP/SEQ lift converges) — its caveat list
    needs both a session-121 amendment (drop IFT/IFTE) and a
    session-126 amendment (drop MAP/SEQ).
- Already marked resolved by prior runs and verified this session:
  O-001 – O-006, O-008, U-001 (sessions 080 – 118); C-001 – C-006
  (sessions 081 / 099 / 109); P-001 (session 117 + earlier),
  P-002 (session 105); R-001, X-006 (session 088); R-002
  (session 101); R-003 (session 111); T-001 (session 102);
  X-001 / X-002 / X-004 / X-005 (session 099); X-007 / X-008
  (session 104); X-009 / X-010 (session 114).
- Still-open prior findings carried forward and aged:
  - **X-003** — 8 → 9 runs.  Still the longest-aging open
    finding; filed at session 080, now 9 review-lane runs and
    33+ calendar days unaddressed.  Sessions 124 / 125 / 126 /
    127 did not touch `www/src/app.js`.
  - **O-007** — 5 → 6 runs.  Sessions 124 / 125 did not touch
    `www/src/rpl/cas/giac-convert.mjs`.
  - **O-009** — 2 → 3 runs.  Both `.bak*` files identical
    (size + mtime) to the session-113 reading.  Tooling gate
    unchanged.
- New findings filed:
  - **T-002** — `docs/TESTS.md` four sites (`:90-92`, `:212`,
    `:644-647`, `:648-651`) still claim session 121 "stale-pruned
    without writing `logs/session-121.md`" while the log exists
    on disk.  Owner: `rpl5050-unit-tests`.  Pure-doc fix; same
    re-phrasing at all four sites.

Total open findings carried forward to next run: 5 (X-003,
O-007, O-009, O-010-remainder, C-007-remainder, T-002 — counting
T-002 as new this run).  Resolved cumulative: 28 (O-001 – O-006,
O-008, C-001 – C-006, P-001, P-002, R-001, R-002, R-003, R-004,
T-001, U-001, X-001, X-002, X-004, X-005, X-006, X-007, X-008,
X-009, X-010).

**Verification gates (session 128):**

- `node --check` — N/A (only edit was to `docs/REVIEW.md`).
- `node tests/test-all.mjs` = **2 FAILED of 4371 + 1 import
  error**.  The 2 failures and the module-load abort are *all*
  session 126 in-flight ops.js SEQ/MAP body-intercept work, not
  introduced by review-lane.  The 4 session126-labelled failures
  are stable, not flake (CONT-clears-banner-after-SEQ-PROMPT,
  SEQ-completes-after-CONT, sync-fallback SEQ HALT-rejection,
  sync-fallback MAP HALT-rejection — count of 4 reflects what
  prints with the full `FAIL:` lines before the file aborts;
  test-all summary headlines this as 2 failed because the
  running tally captures only what the runner sees post-abort).
  The 46 PROMPT/KILL session-121 + 4 session-122 IFT/IFTE
  assertions in `test-control-flow.mjs` are present in source
  but do not contribute to test-all's pass count this run
  because the file fails module-load at line 4286 (`runSeq`
  throws on a quoted-Name `J` operand — same in-flight defect).
- `node tests/test-persist.mjs` = **38 passing / 0 failing**
  (stable from the session 123 baseline).
- `node tests/sanity.mjs` = **22 passing / 0 failing in ~5 ms**
  (stable).

**Lock.** Held `session128-code-review` throughout; scope =
`docs/REVIEW.md` (narrower than the canonical review-lane scope
of `docs/REVIEW.md` + `logs/` because session 127 unit-tests is
holding `logs/` at this run's acquisition; the session log file
`logs/session-128.md` was written without a lock under the
`utils/@locks/README.md:40` "logs/ are append-only with unique
filenames" exemption, with a unique filename so no real conflict
exists).  Sibling locks at run-entry: session 126 rpl-programming
(active — holds `docs/RPL.md`, `www/src/rpl/ops.js`,
`tests/test-control-flow.mjs`); session 127 unit-tests (active —
holds the broad `tests/*.mjs` set + `docs/TESTS.md` + `logs/`);
sessions 119 – 125 all released.  Released at end of run.

**Next session's queue (priority order):**

1. **C-007 remainder** — `rpl5050-command-support`: PROMPT row
   re-classification at `docs/COMMANDS.md:388` (pull out of
   Interaction-ops, add new control-flow row near HALT/CONT/KILL),
   IFT/IFTE row Notes addendum at `:348` (cite session 121 lift),
   HALT row Notes amendment at `:355` (drop IFT/IFTE from the
   still-rejecting caveat list; if session 126 has converged by
   then, also drop MAP/SEQ), missing session-log entries for
   sessions 120 / 121 / 122 / 123 / 125 (most are one-liners —
   the only substantive entry needed is session 121's PROMPT
   ✗ → ✓ + IFT/IFTE Notes addendum, which can be authored
   directly from the CONT/KILL/SST PROMPT-banner-clearing
   description in `logs/session-121.md`).
2. **T-002** — `rpl5050-unit-tests`: re-phrase the four
   "stale-pruned without writing log" sites in `docs/TESTS.md`
   to record the actual evidence (log exists, lock body shows
   graceful release at the same wall-clock second as the log
   write); pure-doc fix.  Pairs naturally with any unit-tests
   pass that already touches TESTS.md.
3. **X-003** — `rpl5050-ui-development`: still the single-line
   `clampLevel` import drop in `www/src/app.js:14`, now 9 runs
   and 33+ calendar days overdue.  Lowest-risk edit in the
   backlog and the longest-aging open finding.  Any
   `app.js`-adjacent or `ops.js`-adjacent lane could ship this
   in passing.
4. **O-007** — `rpl5050-cas-giac` (or any command-support pass
   touching `giac-convert.mjs`): rewrite the `buildGiacCmd`
   block comment at `www/src/rpl/cas/giac-convert.mjs:234-256`
   so the top narrative matches the session-098 purge-free
   behavior.  Pure-comment edit; `node --check` safety net.
5. **O-009** — blocked by tooling (see status block).  Resolves
   only via interactive supervisor approval of
   `allow_cowork_file_delete`, or via a non-scheduled lane
   pickup of `rm tests/test-control-flow.mjs.bak*`.

Log pointer: `logs/session-128.md`.

---

### Session 133 — what shipped (tenth review-lane run)

Doc-stamp hygiene only.  One file edited:

- `docs/REVIEW.md` — Last-updated stamp bumped to session 133;
  baseline block rewritten (test-all 4474 / 0 — fully green
  this run; persist 38 / 0; sanity 22 / 0 in ~5 ms);
  the "between sessions 128 and 133" prelude rewritten to
  attribute deltas across sessions 129 (command-support — C-007
  remainder closed in full + 8 back-filled session-log entries),
  130 (data-type-support — three hard-assertion clusters,
  test-types.mjs +35), 131 (rpl-programming — DOLIST/DOSUBS/STREAM
  body-intercept HALT-lift completing the program; tests/test-
  control-flow.mjs 498 → 563), and 132 (unit-tests — TESTS.md
  T-002 doc fix + coverage adds across multiple test files —
  active at this run's acquisition); three carried-forward
  findings aged (X-003 9 → 10 runs — still the longest-aging
  open finding, 10 review-lane runs and 36+ calendar days
  unaddressed; O-007 6 → 7 runs; O-009 3 → 4 runs); two prior
  partials promoted to fully-resolved (C-007 closed in full by
  session 129; O-010 last open leg routed through C-007, so
  closes alongside C-007); one prior finding promoted to
  resolved (T-002 — session 132's `docs/TESTS.md` rewrite
  acknowledges the log file exists, replacing the original
  "stale-pruned without writing" phrasing with the now-accurate
  "heartbeatAt === startedAt looks stale-prune-shaped at the
  lock layer, but the log file was written within the lock
  window" narrative); one new finding filed (C-008 —
  `docs/COMMANDS.md` HALT/CONT/KILL row at `:389` is missing
  the session-131 DOLIST/DOSUBS/STREAM body-intercept lift
  addendum; same anti-pattern as the session-128 C-007 partial,
  recurring once per rpl-programming-lane structural lift; also
  covers Counts heading staleness "as of session 129" → should
  bump to track session 131, plus missing session-log entries
  for sessions 130 / 131 / 132); session 133 log added (this
  block).  No sibling-lane source files touched.  No RPL op
  behavior changed; no types widened; no tests added or
  deleted; no interpreter touched; no registrations added or
  removed.

No other files touched by review lane this run.

**Findings delta this run:**

- Promoted to resolved:
  - **C-007** — full close (was partial after session 128).
    Session 129's command-support lane shipped the full set of
    edits the session-128 status block enumerated: PROMPT row
    pulled out of the `DISP CLLCD FREEZE INPUT WAIT BEEP → ui
    lane` group at `docs/COMMANDS.md` and replaced by a new
    control-flow row between `HALT CONT KILL` and `RUN`; IFT/
    IFTE row Notes amended with the session-121 generator-
    flavor lift addendum; HALT/CONT/KILL row Notes amended
    with both the session-121 IFT/IFTE lift and the session-126
    SEQ/MAP lift (with the residual sync-fallback caveat
    rewritten to enumerate the session-111 caller labels);
    eight session-log entries back-filled (120 / 121 / 122 /
    123 / 125 / 126 / 127 / 128); Counts heading bumped to
    "as of session 129" with the `register()` total stamp
    updated 455 → 458 reflecting the +3 from PROMPT (session
    121) plus the SEQ/MAP rewrites (session 126).  Verified
    against the file in its current state via `grep -n
    'session 129' docs/COMMANDS.md`.
  - **O-010** — last open sub-item (COMMANDS.md remainder
    routed through C-007) closes alongside C-007's full close.
    Lane attribution = `rpl5050-command-support` (session 129)
    for the closing leg.  Two retractions and three resolutions
    across the four legs took this from a four-leg open
    finding to a fully-closed entry; the audit trail is
    preserved verbatim in O-010's body for future reviews to
    trace the path from session-123's filing through the
    session-128 retraction pass to session-129's actual close.
  - **T-002** — session 132 unit-tests (active at this run's
    acquisition with `docs/TESTS.md` in scope) rewrote the
    four "stale-pruned without writing logs/session-121.md"
    sites at `docs/TESTS.md:87-103` and `:667-681` to
    acknowledge the log exists; the new phrasing recasts the
    `heartbeatAt === startedAt` lock-layer signature as
    "looks stale-prune-shaped at the lock layer but the log
    file was written within the lock window".  Verified the
    rewrites against the file in its current state — session
    132 had landed the TESTS.md edits on disk by this run's
    acquisition even though the lock had not yet released.
- Already marked resolved by prior runs and verified this
  session: O-001 – O-006, O-008, O-010, U-001 (sessions 080 –
  133); C-001 – C-007 (sessions 081 / 099 / 109 / 129); P-001
  (session 117 + earlier), P-002 (session 105); R-001, X-006
  (session 088); R-002 (session 101); R-003 (session 111);
  R-004 (session 128 retraction); T-001 (session 102), T-002
  (session 132); X-001 / X-002 / X-004 / X-005 (session 099);
  X-007 / X-008 (session 104); X-009 / X-010 (session 114).
- Still-open prior findings carried forward and aged:
  - **X-003** — 9 → 10 runs.  Still the longest-aging open
    finding; filed at session 080, now 10 review-lane runs
    and 36+ calendar days unaddressed.  Sessions 129 / 130 /
    131 / 132 did not touch `www/src/app.js`.
  - **O-007** — 6 → 7 runs.  Sessions 129 / 130 / 131 / 132
    did not touch `www/src/rpl/cas/giac-convert.mjs`.
  - **O-009** — 3 → 4 runs.  Both `.bak*` files identical
    (size + mtime) to the session-113 reading.  Tooling gate
    unchanged.
- New findings filed:
  - **C-008** — `docs/COMMANDS.md` HALT/CONT/KILL row at
    `:389` missing the session-131 DOLIST/DOSUBS/STREAM body-
    intercept lift addendum; Counts heading at `:24` still
    reads "as of session 129"; session-log block missing
    entries for sessions 130 / 131 / 132.  Same anti-pattern
    as C-007 (the third iteration: structural HALT lift ships
    in rpl-programming-lane, COMMANDS.md HALT row + Counts
    heading + session-log block fall one cycle behind).
    Owner: `rpl5050-command-support`.  Pure Notes-column +
    log-back-fill work; pairs naturally with any
    command-support run that touches the file.

Total open findings carried forward to next run: 4 (X-003,
O-007, O-009, C-008).  Resolved cumulative: 31 (O-001 – O-006,
O-008, O-010, C-001 – C-007, P-001, P-002, R-001, R-002,
R-003, R-004, T-001, T-002, U-001, X-001, X-002, X-004,
X-005, X-006, X-007, X-008, X-009, X-010).

**Verification gates (session 133):**

- `node --check` — N/A (only edit was to `docs/REVIEW.md`).
- `node tests/test-all.mjs` = **4474 passing / 0 failing**
  (fully green; +100 from the session 128 close baseline of
  4374 — +35 from session 130 wrapper-VM Tagged + B × Q +
  Tagged-of-List composition coverage in `test-types.mjs`,
  +65 from session 131 DOLIST/DOSUBS/STREAM HALT-lift
  coverage in `test-control-flow.mjs`).
- `node tests/test-persist.mjs` = **38 passing / 0 failing**
  (stable from the session 128 baseline).
- `node tests/sanity.mjs` = **22 passing / 0 failing in ~5 ms**
  (stable).

**Lock.** Held `session133-code-review` throughout; scope =
`docs/REVIEW.md` only (narrower than the canonical review-lane
scope of `docs/REVIEW.md` + `logs/` because session 132
unit-tests is holding `logs/session-132.md` at this run's
acquisition; the session log file `logs/session-133.md` was
written without a lock under the `utils/@locks/README.md:40`
"logs/ are append-only with unique filenames" exemption, with
a unique filename so no real conflict exists).  Sibling locks
at run-entry: session 132 unit-tests (active — holds the
broad `tests/*.mjs` set + `docs/TESTS.md` +
`logs/session-132.md`); sessions 119 – 131 all released
(graceful or session-121 stale-prune-flavor-but-log-written;
see O-010 history).  Released at end of run.

**Next session's queue (priority order):**

1. **C-008** — `rpl5050-command-support`: HALT/CONT/KILL row
   Notes-column addendum at `docs/COMMANDS.md:389` for the
   session-131 DOLIST/DOSUBS/STREAM body-intercept lift;
   Counts heading bump at `:24` from "session 129" to "session
   131" (or session 133 if this run authors the edit; no
   `register()` count change); back-fill session-log entries
   for 130 / 131 / 132.  Pure Notes-column + log-entry work,
   zero behavior risk, pairs naturally with any command-support
   pass.
2. **X-003** — `rpl5050-ui-development`: still the single-
   line `clampLevel` import drop in `www/src/app.js:14`, now
   10 runs and 36+ calendar days overdue.  Lowest-risk edit
   in the backlog and the longest-aging open finding.  Any
   `app.js`-adjacent or `ops.js`-adjacent lane could ship
   this in passing.
3. **O-007** — `rpl5050-cas-giac` (or any command-support
   pass touching `giac-convert.mjs`): rewrite the
   `buildGiacCmd` block comment at
   `www/src/rpl/cas/giac-convert.mjs:234-256` so the top
   narrative matches the session-098 purge-free behavior.
   Pure-comment edit; `node --check` safety net.
4. **O-009** — blocked by tooling (see status block).
   Resolves only via interactive supervisor approval of
   `allow_cowork_file_delete`, or via a non-scheduled lane
   pickup of `rm tests/test-control-flow.mjs.bak*`.

Log pointer: `logs/session-133.md`.

---

### Session 138 — what shipped (eleventh review-lane run)

Doc-stamp hygiene only.  One file edited:

- `docs/REVIEW.md` — Last-updated stamp bumped to session 138;
  baseline block rewritten (test-all 4586 / 0 — fully green
  this run; persist 38 / 0; sanity 22 / 0 in ~6 ms);
  the "between sessions 133 and 138" prelude rewritten to
  attribute deltas across sessions 134 (command-support — C-008
  remainder closed in full + bonus phantom-row retire pass on
  the "Not yet supported" table for `GXROOT` / `LQD` /
  `POLYEVAL`; `register()` count 458 → 463; not-yet-implemented
  count 4 → 3; four session-log entries back-filled), 135
  (data-type-support — three hard-assertion clusters pinning
  Q × V/M arithmetic broadcast / Tagged-of-V/M binary
  composition / Tagged tag-identity & BinInt cross-base
  equality; `tests/test-types.mjs` 672 → 703 / +31), 136
  (rpl-programming — auto-close on missing END / NEXT for
  `WHILE/REPEAT`, `DO/UNTIL`, `START`, `FOR` completing the
  structural-auto-close program for the loop families;
  `tests/test-control-flow.mjs` 563 → 599 / +36; `docs/RPL.md`
  flipped on the four loop rows), and 137 (unit-tests — broad
  `tests/*.mjs` coverage adds + `docs/TESTS.md` updates —
  active at this run's acquisition); three carried-forward
  findings aged (X-003 10 → 11 runs — still the longest-aging
  open finding, 11 review-lane runs and 37+ calendar days
  unaddressed; O-007 7 → 8 runs; O-009 4 → 5 runs); one prior
  finding promoted to resolved (C-008 — closed in full by
  session 134's doc-only run, all three sub-items shipped
  verbatim per the session-133 status block); two new findings
  filed:
  • **C-009** — `docs/COMMANDS.md` Control-flow rows for
    `WHILE/REPEAT/END` (`:427`), `DO/UNTIL/END` (`:428`), and
    `FOR/START/STEP/NEXT` (`:426`) carry empty Notes columns
    with no annotation for session 136's auto-close lift; same
    anti-pattern as C-007 / C-008, fourth iteration; also covers
    Counts heading staleness "as of session 134" → should bump
    to session 136 + missing session-log entries for 135 / 136.
  • **R-005** — `docs/RPL.md` carries three "(this run) — what
    shipped" headings (sessions 121, 126, 136) at `:258`,
    `:358`, `:465` when only the most-recent rpl-programming-
    lane run should bear that label; Session log pointer prose
    at `:1500` ("Session 131 is this run …") is stale by the
    same drift.  Pure comment / string drift; safe doc edit.

Verification: test-all 4586 / 0, persist 38 / 0, sanity 22 / 0
in ~6 ms.  No `node --check` invocation (no JS files touched —
only `docs/REVIEW.md` Markdown edits this run).  No sibling-lane
source files touched.  No RPL op behavior changed, no types
widened, no tests added or deleted, no interpreter touched, no
registrations added or removed.

**Lock.** Held `utils/@locks/session138-code-review.json`
throughout, scope = `docs/REVIEW.md` only (narrowed because
session 137 unit-tests holds the broad `tests/*.mjs` +
`docs/TESTS.md` + `logs/session-137.md` scope at run-entry,
mirroring the session-133 vs. session-132 and session-128 vs.
session-127 patterns); the session log file `logs/session-138.md`
was written without a lock under the `utils/@locks/README.md:40`
"logs/ are append-only with unique filenames" exemption, with
a unique filename so no real conflict exists.  Sibling locks
at run-entry: session 137 unit-tests (active — holds the broad
`tests/*.mjs` set + `docs/TESTS.md` + `logs/session-137.md`);
sessions 124 – 136 all released gracefully.  Released at end
of run.

**Next session's queue (priority order):**

1. **C-009** — `rpl5050-command-support`: append session-136
   auto-close annotation to the four loop-row Notes columns at
   `docs/COMMANDS.md:426` / `:427` / `:428` (the `FOR / START /
   STEP / NEXT`, `WHILE / REPEAT / END`, and `DO / UNTIL / END`
   rows); Counts heading bump at `:24` from "session 134" to
   "session 136" (or session 138 if this run authors the edit;
   no `register()` count change); back-fill session-log entries
   for 135 / 136.  Pure Notes-column + log-entry work, zero
   behavior risk, pairs naturally with any command-support pass.
   Same close shape as C-007 (session 128 → 129) and C-008
   (session 133 → 134).
2. **X-003** — `rpl5050-ui-development`: still the single-
   line `clampLevel` import drop in `www/src/app.js:14`, now
   11 runs and 37+ calendar days overdue.  Lowest-risk edit
   in the backlog and the longest-aging open finding.  Any
   `app.js`-adjacent or `ops.js`-adjacent lane could ship
   this in passing.
3. **R-005** — `rpl5050-rpl-programming` (preferred — they
   own RPL.md chapter authorship) or `rpl5050-code-review`
   (fallback): demote `## Session 121 (this run) — what
   shipped` and `## Session 126 (this run) — what shipped` at
   `docs/RPL.md:258` / `:358` to drop the "(this run)" suffix;
   refresh the Session log pointer prose at `:1500` to
   acknowledge session 136 is now current.  Pure-string edit;
   `node --check` N/A (Markdown only).
4. **O-007** — `rpl5050-cas-giac` (or any command-support
   pass touching `giac-convert.mjs`): rewrite the
   `buildGiacCmd` block comment at
   `www/src/rpl/cas/giac-convert.mjs:235-257` so the top
   narrative matches the session-098 purge-free behavior.
   Pure-comment edit; `node --check` safety net.
5. **O-009** — blocked by tooling (see status block).
   Resolves only via interactive supervisor approval of
   `allow_cowork_file_delete`, or via a non-scheduled lane
   pickup of `rm tests/test-control-flow.mjs.bak*`.

Log pointer: `logs/session-138.md`.

---

### Session 143 — what shipped (twelfth review-lane run)

Doc-stamp hygiene only.  One file edited:

- `docs/REVIEW.md` — Last-updated stamp bumped to session 143;
  baseline block rewritten (test-all 4711 / 0 — fully green this
  run; persist 38 / 0; sanity 22 / 0 in ~5 ms); the "between
  sessions 138 and 143" prelude rewritten to attribute deltas
  across sessions 139 (command-support — three new ops via Giac:
  LIN, LIMIT, lim, +13 in `test-algebra.mjs`; `register()` 463
  → 466; also closed C-009 with the loop-row Notes column
  back-fill and Counts heading bump; session-log entries 135 →
  139 back-filled), 140 (data-type-support — three hard-assertion
  clusters pinning hyperbolic Tagged-of-V/M, inverse-trig +
  EXPM Tagged-of-V/M, and ARG/CONJ/RE/IM bespoke-2-deep wrapper
  composition; `tests/test-types.mjs` 703 → 739 / +36; no
  source-side change; DATA_TYPES.md Last-updated bumped to
  session 140 with six Notes columns updated and the "Resolved
  this session (140)" block added), 141 (rpl-programming —
  HALT/PROMPT lift through IFERR clauses pinned with regression
  tests; +76 session141 assertions in
  `tests/test-control-flow.mjs` (599 → 675); R-005 doc cleanup
  also shipped — three `(this run)` headings demoted, Session
  log pointer prose updated to past tense; new "Session 141
  (this run) — what shipped" chapter added; no `ops.js` source
  change), and 142 (unit-tests — broad `tests/*.mjs` + TESTS.md
  scope — active at this run's acquisition with no visible
  edits on disk yet); three carried-forward findings aged
  (X-003 11 → 12 runs — still the longest-aging open finding,
  12 review-lane runs and 37+ calendar days unaddressed; O-007
  8 → 9 runs; O-009 5 → 6 runs); two prior findings promoted to
  resolved (C-009 — closed in full by session 139's command-
  support run, all three sub-items shipped including the +3
  register count refresh for LIN/LIMIT/lim; R-005 — closed in
  full by session 141's rpl-programming run, both pure-string
  edits shipped); two new findings filed:
  • **R-006** — `docs/RPL.md:348` carries a stale internal
    cross-reference (`:1455`) introduced by session 141's own
    R-005-close edit; the actual demote target moved to
    `:1682` due to session 141's own +99-line chapter
    insertion at `:258-356` plus the 76 new test-pin assertions'
    chapter expansions pushing the target down by ~227 lines.
    Pure-string drift; safe doc edit for the rpl-programming
    or the review lane.
  • **O-011** — third instance of the lock-body
    heartbeatAt-equals-startedAt + intent="items TBD" + log-
    mtime-equals-releasedAt signature (after O-008 session 106
    and O-010 session 121).  Session 141's lock body lacks a
    `releaseReason` field that would distinguish "graceful late
    release" from "stale-prune".  T-002's session-132 resolution
    paragraph already flagged the future improvement; this
    finding promotes that note to a tracked work item owned by
    any lane editing `utils/@locks/lock.mjs`.  One-line per-
    call-site addition to `lock.mjs` (`release()` sets
    `releaseReason: "graceful"`; `pruneStale()` sets
    `releaseReason: "stale-prune"`) plus a parallel README
    update.

Verification: test-all 4711 / 0, persist 38 / 0, sanity 22 / 0
in ~5 ms.  No `node --check` invocation (no JS files touched —
only `docs/REVIEW.md` Markdown edits this run).  No sibling-lane
source files touched.  No RPL op behavior changed, no types
widened, no tests added or deleted, no interpreter touched, no
registrations added or removed.

**Lock.** Held `utils/@locks/session143-code-review.json`
throughout, scope = `docs/REVIEW.md` only (narrowed because
session 142 unit-tests holds the broad `tests/*.mjs` +
`docs/TESTS.md` + `logs/session-142.md` scope at run-entry,
mirroring the session-138 vs. session-137, session-133 vs.
session-132, and session-128 vs. session-127 patterns); the
session log file `logs/session-143.md` was written without a
lock under the `utils/@locks/README.md:40` "logs/ are append-
only with unique filenames" exemption, with a unique filename
so no real conflict exists.  Sibling locks at run-entry:
session 142 unit-tests (active — holds the broad `tests/*.mjs`
set + `docs/TESTS.md` + `logs/session-142.md`); sessions 129 –
140 all released gracefully; session 141 released with the
late-mtime signature documented in O-011 above (log on disk,
lock-layer ambiguity flagged for fix).  Released at end of run.

**Findings delta this run:**

- Promoted to resolved: **C-009** (session 139, command-support
  — three sub-items shipped: loop-row Notes columns at
  `docs/COMMANDS.md:450` / `:451` / `:452` annotated with the
  session-136 auto-close lift; Counts heading bumped from
  "as of session 134" to "as of session 139"; `register()`
  count 463 → 466; session-log entries 135 / 136 / 137 / 138 /
  139 back-filled).  Same close shape as C-007 (session 128 →
  129) and C-008 (session 133 → 134) — fifth iteration of the
  rpl-programming-lift-then-command-support-back-fill cycle,
  all five now closed.
- Promoted to resolved: **R-005** (session 141, rpl-programming
  — both pure-string edits shipped: three stale `## Session NNN
  (this run) — what shipped` headings at `docs/RPL.md:258` /
  `:358` / `:465` demoted to plain past tense; Session log
  pointer prose previously at `:1500` rewritten to past tense
  for session 131 and moved to `:1682` due to session 141's
  own +99-line chapter insertion; new "Session 141 (this run)
  — what shipped" chapter added as the new sole `(this run)`
  holder.  Footnote at `:1705-1709` lists the historical "is
  this run" wording origins for sessions 074 / 078 / 088 /
  106 / 116 / 121 / 126 / 131).
- Already marked resolved by prior runs and verified this
  session: O-001 – O-006, O-008, O-010, U-001 (sessions 080 –
  133); C-001 – C-008 (sessions 081 / 099 / 109 / 129 / 134);
  P-001 (session 117 + earlier), P-002 (session 105); R-001,
  X-006 (session 088); R-002 (session 101); R-003 (session
  111); R-004 (session 128 retraction); T-001 (session 102),
  T-002 (session 132); X-001 / X-002 / X-004 / X-005 (session
  099); X-007 / X-008 (session 104); X-009 / X-010 (session
  114).
- Still-open prior findings carried forward and aged:
  - **X-003** — 11 → 12 runs.  Still the longest-aging open
    finding; filed at session 080, now 12 review-lane runs
    and 37+ calendar days unaddressed.  Sessions 139 / 140 /
    141 / 142 did not touch `www/src/app.js`.
  - **O-007** — 8 → 9 runs.  Sessions 139 / 140 / 141 / 142
    did not touch `www/src/rpl/cas/giac-convert.mjs`.
  - **O-009** — 5 → 6 runs.  Both `.bak*` files identical
    (size + mtime) to the session-113 reading.  Tooling gate
    unchanged.
- New findings filed:
  - **R-006** — `docs/RPL.md:348` stale internal cross-
    reference (`:1455` should be `:1682` or pruned to a
    section reference).  Owner: `rpl5050-rpl-programming`
    (preferred — they own RPL.md chapter authorship) or
    `rpl5050-code-review` (fallback — pure-string drift).
  - **O-011** — third instance of the lock-body shape
    ambiguity that session 141's lock body again surfaces.
    Underlying remedy is a one-line per-call-site addition to
    `utils/@locks/lock.mjs` adding a `releaseReason` field;
    promotes T-002's session-132 future-improvement note from
    a comment-in-passing to a tracked work item.  Owner: no
    canonical lane — pair naturally with any run editing
    `lock.mjs`, or the review lane can ship as pure
    infrastructure hygiene.

Total open findings carried forward to next run: 5 (X-003,
O-007, O-009, R-006, O-011).  Resolved cumulative: 33 (O-001
– O-006, O-008, O-010, C-001 – C-009, P-001, P-002, R-001 –
R-005, T-001, T-002, U-001, X-001, X-002, X-004 – X-010).

**Verification gates (session 143):**

- `node --check` — N/A (only edit was to `docs/REVIEW.md`,
  Markdown).
- `node tests/test-all.mjs` = **4711 passing / 0 failing**
  (fully green; +125 from the session 138 close baseline of
  4586 — +13 from session 139 LIN/LIMIT/lim Giac coverage in
  `test-algebra.mjs`; +36 from session 140 hyperbolic-Tagged
  + inverse-trig + EXPM + ARG/CONJ/RE/IM bespoke wrapper
  composition pins in `test-types.mjs`; +76 from session 141
  IFERR HALT/PROMPT lift pins in `test-control-flow.mjs`).
- `node tests/test-persist.mjs` = **38 passing / 0 failing**
  (stable from the session 138 baseline).
- `node tests/sanity.mjs` = **22 passing / 0 failing in ~5 ms**
  (stable).

**Next session's queue (priority order):**

1. **R-006** — `rpl5050-rpl-programming` (preferred) or
   `rpl5050-code-review` (fallback): one-character / one-phrase
   edit at `docs/RPL.md:348` to fix the stale `:1455`
   cross-reference (should be `:1682`, or drop the line number
   and cite the section).  Pure-string drift; `node --check`
   N/A (Markdown only).
2. **X-003** — `rpl5050-ui-development`: still the single-
   line `clampLevel` import drop in `www/src/app.js:14`, now
   12 runs and 37+ calendar days overdue.  Lowest-risk edit
   in the backlog and the longest-aging open finding.  Any
   `app.js`-adjacent or `ops.js`-adjacent lane could ship
   this in passing.
3. **O-011** — no canonical owner: one-line per-call-site
   addition to `utils/@locks/lock.mjs` (`release()` →
   `releaseReason: "graceful"`; `pruneStale()` →
   `releaseReason: "stale-prune"`) plus a parallel one-line
   update to the `utils/@locks/README.md` example body shape.
   Pure infrastructure hygiene; no behavior risk to in-flight
   locks.  Pair naturally with any lane currently editing
   `lock.mjs` for an unrelated reason; absent that, the
   review lane can ship as pure infrastructure hygiene.
4. **O-007** — `rpl5050-cas-giac` (or any command-support
   pass touching `giac-convert.mjs`): rewrite the
   `buildGiacCmd` block comment at
   `www/src/rpl/cas/giac-convert.mjs:234-256` so the top
   narrative matches the session-098 purge-free behavior.
   Pure-comment edit; `node --check` safety net.
5. **O-009** — blocked by tooling (see status block).
   Resolves only via interactive supervisor approval of
   `allow_cowork_file_delete`, or via a non-scheduled lane
   pickup of `rm tests/test-control-flow.mjs.bak*`.

Log pointer: `logs/session-143.md`.
