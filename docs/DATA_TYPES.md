# DATA_TYPES — RPL5050 argument-type coverage matrix

**Scope.** This file tracks the per-op argument-type surface the `hp50-type-support`
lane is widening.  It does not track whether an op is implemented at all — that
lives in `docs/COMMANDS.md` (or its predecessor, `docs/COMMANDS_INVENTORY.md`).
This file answers: *for this op, which types does the handler actually accept?*

**Last updated.** Session 076 (2026-04-23).

---

## Legend

| Symbol | Meaning |
|--------|---------|
| `✓`    | Supported — verified by an assertion in one of the `tests/*` files. |
| `·`    | Not applicable — the type isn't a meaningful operand here (e.g. a Real operand on a string-op). |
| `✗`    | Deliberately rejected — HP50 itself rejects this type, and we match. Verified by a rejection test. |
| *blank* | Candidate for a future widening pass. |

## Type axes (column headers)

```
R   Real            V   Vector              Sy  Symbolic
Z   Integer         M   Matrix              T   Tagged
B   BinaryInteger   L   List                U   Unit
C   Complex         N   Name (quoted)       S   String
P   Program         D   Directory           G   Grob
```

## Conventions (shared across all ops below)

- **List distribution** — lists distribute element-wise via
  `_withListUnary` / `_withListBinary` (defined in `src/rpl/ops.js`).  An op
  that treats a list as a whole object (SIZE, HEAD, aggregate reducers,
  STO, PURGE, …) does NOT list-distribute and is not wrapped.
- **Tagged transparency** — `_withTaggedUnary` unwraps, applies, re-tags with
  the same label.  `_withTaggedBinary` unwraps both sides and drops the tag
  (binary ops have no single obvious tag to keep).
- **Vector / Matrix element-wise** — `_withVMUnary` dispatches `f(x)` per
  element.  Ops with bespoke V/M semantics (ABS = Frobenius norm, INV/M =
  matrix inverse, SQ/M = M·M, SIGN/V = unit direction) bypass the wrapper.
- **Symbolic / Name lift** — either operand being a `Name` or `Symbolic`
  lifts the op to `Symbolic(AstFn('OPNAME', [...]))` (or an `AstBin` when
  that's more natural — see `+` / `-` / `*` / `/` / `^`).  The name must be
  in `KNOWN_FUNCTIONS` in `src/rpl/algebra.js` so the symbolic result
  round-trips through `parseEntry`.
- **Promotion lattice** — Z → R → C (scalar promotion); scalar → V/M
  (broadcast); R / C → Sy (lift).  BinaryInteger does NOT silently promote
  to R — mixing B with a non-B scalar is rejected unless the op has an
  explicit BinaryInteger path.

---

## Widened ops (current state)

Rows are **in registration order** of the op in `src/rpl/ops.js` — grouping
matches the code.  Blank cells in otherwise-widened rows are deliberate
follow-on candidates and listed at the bottom.

### Unary — invert / square / sqrt / elementary functions

| Op     | R | Z | B | C | N | Sy | L | V | M | T | U | S | P | Notes |
|--------|---|---|---|---|---|----|---|---|---|---|---|---|---|-------|
| INV    | ✓ | ✓ | · | ✓ | ✓ | ✓  | ✓ | · | ✓ | ✓ | ✓ | ✗ | ✗ | V = · (no standard vector-inverse); M = matrix inverse. Session 064 added T. |
| SQ     | ✓ | ✓ | · | ✓ | ✓ | ✓  | ✓ | · | · | ✓ | ✓ | ✗ | ✗ | V/M deliberately · — `SQ/V` = dot product, `SQ/M` = matmul, handled by `*`. Session 064 added T. |
| SQRT   | ✓ | ✓ | · | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | · | ✗ | ✗ | Negative real / integer promotes to Complex (principal branch). Session 063 added V/M/T. |
| ABS    | ✓ | ✓ | · | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | V/M = Frobenius norm (bespoke — not the wrapper). Session 068 added T. |
| SIN..ACOSH..ATANH (elementary) | ✓ | ✓ | · | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✗ | ✗ | Session 063. Mode-sensitive (DEG/RAD/GRD) for trig. |
| FACT / `!` | ✓ | ✓ | · | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✗ | ✗ | Session 063. Complex ✗ (HP50 Γ is real-only). Negative integer = Bad argument value (Γ pole). |
| LNP1, EXPM | ✓ | ✓ | · | · | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✗ | ✗ | Session 063. Complex · by design (stable-near-zero real form). |

### Unary — rounding / sign / arg

| Op    | R | Z | B | C | N | Sy | L | V | M | T | U | S | P | Notes |
|-------|---|---|---|---|---|----|---|---|---|---|---|---|---|-------|
| FLOOR | ✓ | ✓ | · | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | Session 062; session 072 added U (`1.5_m FLOOR` → `1_m`, uexpr preserved). Complex ✗ — no total order. |
| CEIL  | ✓ | ✓ | · | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | Session 062; session 072 added U. |
| IP    | ✓ | ✓ | · | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | Session 062; session 072 added U. Compound uexpr (`m/s^2`) round-trips. |
| FP    | ✓ | ✓ | · | ✗ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | Session 062; session 072 added U. `FP(-1.8_m)` = `-0.8_m` (sign preserved). |
| SIGN  | ✓ | ✓ | · | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | · | ✗ | ✗ | SIGN/V = unit direction (bespoke); SIGN/M = per-entry sign. |
| ARG   | ✓ | ✓ | · | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | · | ✗ | ✗ | Angle-mode sensitive. |

### Binary — MOD / MIN / MAX

| Op  | R | Z | B | C | N | Sy | L | V | M | T | U | S | P | Notes |
|-----|---|---|---|---|---|----|---|---|---|---|---|---|---|-------|
| MOD | ✓ | ✓ | · | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | · | ✗ | ✗ | Session 068 confirmed V/M rejection (HP50 AUR §3 scalar-only). |
| MIN | ✓ | ✓ | · | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | · | ✗ | ✗ | Same. |
| MAX | ✓ | ✓ | · | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | · | ✗ | ✗ | Same. |

### Binary — GCD / LCM

| Op  | R* | Z | B | C | N | Sy | L | V | M | T | U | S | P | Notes |
|-----|----|---|---|---|---|----|---|---|---|---|---|---|---|-------|
| GCD | ~  | ✓ | · | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | · | ✗ | ✗ | Session 064 added N/Sy/L/T. R accepted only when integer-valued (non-integer Real = Bad argument value). |
| LCM | ~  | ✓ | · | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | · | ✗ | ✗ | Same as GCD. |

*`~` on Real = accepted only when `Number.isInteger(value)`.

### Binary — percent family

| Op  | R | Z | B | C | N | Sy | L | V | M | T | U | S | P | Notes |
|-----|---|---|---|---|---|----|---|---|---|---|---|---|---|-------|
| %   | ✓ | ✓ | · | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | · | ✗ | ✗ | Session 064 added L/T; session 072 flipped V/M from blank to ✗ (HP50 AUR §3-1 scalar-only, mirrors MOD/MIN/MAX audit in s068). |
| %T  | ✓ | ✓ | · | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | · | ✗ | ✗ | Same. Infinite result on base = 0 preserved. |
| %CH | ✓ | ✓ | · | ✗ | ✓ | ✓  | ✓ | ✗ | ✗ | ✓ | · | ✗ | ✗ | Same. |

### Reference rows — already-broad ops from earlier sessions

These rows summarise the `+` / `-` / `*` / `/` / `^` family and the complex
reference ops.  Pulling them into per-op detail sections is a doc-only
candidate flagged in session 063.

| Op  | R | Z | B | C | N | Sy | L | V | M | T | U | S | Notes |
|-----|---|---|---|---|---|----|---|---|---|---|---|---|-------|
| +   | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Concats on String+String; Unit dim-algebra; V+V element-wise (same length). Session 068 added T. |
| -   | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | Session 068 added T. |
| *   | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | V·V = dot product, M·M = matmul; Real-by-String = repeat (String rep). Session 068 added T. |
| /   | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | Session 068 added T. |
| ^   | ✓ | ✓ | ✗ | ✓ | ✓ | ✓  | ✓ | ✗ | ✓ | ✓ | ✓ | ✗ | M^n = repeated matmul for integer n. Session 068 added T. |
| NEG | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | Session 068 added T. |
| CONJ| ✓ | ✓ | · | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | · | · | Session 068 added T. |
| RE  | ✓ | ✓ | · | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | · | · | Session 068 added T. |
| IM  | ✓ | ✓ | · | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | · | · | Session 068 added T. |

### Ordered comparators — `<` / `>` / `≤` / `≥`

Numeric-family ordered compare.  `comparePair()` promotes BinInt to
Integer (with wordsize mask applied to the payload) before routing
through `promoteNumericPair`, so BinInt × BinInt and cross-family
BinInt × Integer / Real are accepted.  Complex with a non-zero
imaginary part rejects (no total order on ℂ).  String lex order is
still `Bad argument type` — tracked in the "next-session candidates"
list below.

| Op   | R | Z | B | C* | N | Sy | L | V | M | T | U | S | Notes |
|------|---|---|---|----|---|----|---|---|---|---|---|---|-------|
| `<`  | ✓ | ✓ | ✓ | ~  | ✓ | ✓  | · | · | · | · | · | ✗ | Session 074 added B (comparePair coerces via `Integer(value & mask)`). |
| `>`  | ✓ | ✓ | ✓ | ~  | ✓ | ✓  | · | · | · | · | · | ✗ | Same. |
| `≤`  | ✓ | ✓ | ✓ | ~  | ✓ | ✓  | · | · | · | · | · | ✗ | Same. |
| `≥`  | ✓ | ✓ | ✓ | ~  | ✓ | ✓  | · | · | · | · | · | ✗ | Same. |

*`~` on Complex = accepted only when both `im === 0`; otherwise `Bad argument type`.

### Equality / structural compare — `==` / `SAME`

Structural equality over collection and expression types.  `==` and
`SAME` share the same comparator (`eqValues`) — the only semantic
difference is that `SAME` never lifts to Symbolic for the other
comparators (it always returns a Real 1./0.).  Numeric cross-promotion
is the same as in `<`/`≤`/`>`/`≥` (`Real(1) == Integer(1)` = 1).

| Op   | R | Z | B | C | N | Sy | L | V | M | T | U | S | Notes |
|------|---|---|---|---|---|----|---|---|---|---|---|---|-------|
| ==   | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Session 072 added Sy/L/V/M/T/U structural compare (gap filed s070). Session 074 added BinInt × BinInt (masked against current wordsize) plus cross-family BinInt × Integer / Real / Complex widening at the `==` / `≠` / `<>` outer level via `_binIntCrossNormalize`. Nested lists / matrix rows recurse via `_eqArr`. Tagged: same tag AND same value. Unit: same numeric value AND same `uexpr` (so `1_m == 1_km` = 0). |
| SAME | ✓ | ✓ | ✓ | ✓ | ✓ | ✓  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Same widening — `SAME` always returns Real 1./0., never a Symbolic. Session 074: BinInt × BinInt value compare through the same eqValues branch, BUT `SAME` deliberately does NOT cross-family widen (so `SAME #10h Integer(16)` = 0 — AUR §4-7 "SAME does not type-coerce"). |

---

## Next-session widening candidates

(Ordered by estimated effort, smallest first.)

1. **BinaryInteger audit on `+`, `-`, `*`, `/` with mixed scalar operand** —
   confirm the B + R / B + Z coercion path in `_scalarBinaryMixed`
   (session 047?) is correct under all four wordsize masks.  Estimated
   6–8 tests.  HP50 AUR §10.1 describes the masking rule.
2. **Tagged transparency on `SIGN`, `ARG`, `FLOOR`, `CEIL`, `IP`, `FP`** —
   audit; most are already ✓ via the existing `_withTaggedUnary` wrapper
   (added in sessions 062–063).  If any row is still blank, one-line
   swap + pair of tests.
3. **Detail rows for `+` / `-` / `*` / `/` / `^`** — pull these out of the
   compact reference table into per-op sections with Unit-dim-algebra notes
   and BinaryInteger STWS masking notes.  Doc-only; low effort.
4. **String lexicographic `<` / `>` / `≤` / `≥`** — currently
   `comparePair()` in `src/rpl/ops.js` rejects Strings with
   `Bad argument type`.  HP50 User Guide App-J defines char-code lex
   ordering.  Gap filed against this lane by the unit-tests lane
   (session 070); the soft-assert in `test-comparisons.mjs` still
   accepts either outcome.  Estimated ~1 hr: widen `comparePair`,
   add 5 positive + 2 rejection tests, flip the soft-assert to hard.
5. **`==` / `SAME` on Program, Directory** — out of scope for session
   072.  Program is conceptually structural over its tokens (could
   reuse `_eqArr`); Directory is a live mutable container so `SAME`
   should probably be reference-identity only.  Read HP50 AUR §4-7
   before widening.
6. **Dim-equivalence `==` on Units** — distinct from today's strict
   structural `==`.  Could be a new op (`UEQUAL`?) or a flag that
   flips `==` semantics.  Read AUR §20 first.
7. **BinaryInteger widening on floor/ceil/ip/fp** — today BinInt on the
   rounders is rejected because `_rounderScalar` only dispatches on
   `isReal(v) || isInteger(v) || isUnit(v)`.  For BinInts rounding is
   a no-op — they are already integers — but the type should still be
   accepted rather than rejected (HP50 AUR §3).  Quick widening.

### Resolved this session (074)

- **BinaryInteger `==` across bases** — `#FFh == #255d` = 1.  Fixed
  by a dedicated BinInt × BinInt branch in `eqValues` (masked against
  current wordsize) plus a `_binIntCrossNormalize` helper invoked by
  the `==` / `≠` / `<>` op wrappers for cross-family BinInt ↔
  Integer/Real/Complex widening.  `SAME` deliberately does NOT
  cross-normalize (strict type per AUR §4-7).
- **BinaryInteger `<` / `>` / `≤` / `≥`** — `comparePair` promotes
  BinInt to Integer(value & mask) before routing through the numeric
  path.

---

## Bootstrap note

Sessions 062 and 063 logs reference a file named `docs/TYPE_SUPPORT.md`;
that filename is not present in the current tree.  The scheduled-task
charter for this lane names the notes file `docs/DATA_TYPES.md`, so
session 064 re-bootstraps under the charter-correct filename.  Future
runs should treat *this* file as authoritative.  If `TYPE_SUPPORT.md`
resurfaces, consolidate it back into this file rather than maintaining
two.
