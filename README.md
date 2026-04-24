# rp5050sx

**RPL Scientific Calculator — a modern HP 50g adaptation.**

rp5050sx is a desktop reimplementation of the HP 50g graphing calculator. It
keeps the RPL stack, the User-RPL programming language, and the HP command
surface, but replaces the 128×80 monochrome LCD with a high-resolution UI and
swaps the 1990s-era CAS for [Giac](https://www-fourier.univ-grenoble-alpes.fr/~parisse/giac.html) —
the same engine Bernard Parisse (author of the HP 48/49/50g "erable" CAS)
later used in Xcas and the HP Prime.

The calculator runs in a [Tauri 2](https://tauri.app/) window on macOS,
Windows, and Linux. The entire frontend is plain HTML / CSS / ES modules —
no build step for the web assets, no framework.

## Status

Active development. The stack engine, RPL parser/evaluator, structured
control flow (`IF`/`WHILE`/`DO`/`FOR`/`START`/`CASE`/`IFERR`), compiled local
environments (`→ a b c « ... »`), and the suspended-execution substrate
(`HALT` / `CONT` / `KILL`) are all working. Most of the HP 50g AUR command
set is registered; see [docs/ROADMAP.md](docs/ROADMAP.md) for what's left and
[docs/COMMANDS.md](docs/COMMANDS.md) for the current command inventory.

## Getting started

```bash
# one-time
npm install
rustc --version   # Tauri needs a Rust toolchain; install via rustup if missing

# run in a Tauri window (hot reload, DevTools)
npm run dev

# produce a platform installer
npm run build
```

Build output lands in `src-tauri/target/release/bundle/` (`.dmg` on macOS,
`.msi` on Windows, `.deb` / `.AppImage` on Linux). For a deeper walk-through
— including common Tauri v1 → v2 config pitfalls — see
[TAURI_QUICK_START.md](TAURI_QUICK_START.md) and [TAURI_SETUP.md](TAURI_SETUP.md).

The frontend is pure static assets. You can also open [www/index.html](www/index.html)
in a browser to drive the calculator without Tauri, with the caveat that
anything depending on the Tauri APIs (native menus, filesystem persistence)
won't be wired up.

## Project layout

```
www/                  Browser-loaded assets (entry point for Tauri's frontendDist)
  index.html          Calculator shell
  src/app.js          Bootstrap
  src/rpl/            Stack engine, parser, evaluator, formatter, persistence
  src/rpl/cas/        Giac engine adapter (main-thread, sync) + AST↔Giac conversion
  src/ui/             Keyboard, display, interactive stack, side panel, entry
  src/vendor/giac/    Prebuilt Giac WebAssembly (see NOTICE for provenance)
  css/                Styles
src-tauri/            Rust/Tauri host (window config, icons, native glue)
tests/                Node-based test suites (see Testing below)
docs/                 Lane notes, HP 50g reference PDFs, roadmap
```

## Testing

Tests are plain Node ES modules under [tests/](tests/) — no framework,
driven directly by `node`:

```bash
node tests/test-all.mjs          # full suite
node tests/test-algebra.mjs      # one file
node tests/flake-scan.mjs        # repeat the suite to surface order-sensitivity
```

Each `test-*.mjs` file covers one lane (parser, evaluator, stack ops,
numerics, matrix, units, stats, persistence, reflection, UI, ...). The
harness exits non-zero on the first failure and prints a diff.

## Documentation

- [docs/RPL.md](docs/RPL.md) — RPL programming language support (parser,
  evaluator, control flow, local environments, suspended execution)
- [docs/COMMANDS.md](docs/COMMANDS.md) — HP 50g command surface and coverage
- [docs/DATA_TYPES.md](docs/DATA_TYPES.md) — stack value types and widening rules
- [docs/TESTS.md](docs/TESTS.md) — test harness conventions
- [docs/REVIEW.md](docs/REVIEW.md) — code-review lane notes
- [docs/ROADMAP.md](docs/ROADMAP.md) — next-feature map across lanes
- [docs/HP50 User Guide.pdf](docs/), User Manual, Advanced Guide — fidelity
  reference (HP's official docs, not redistributed content of this repo)

## License

rp5050sx is licensed under the **GNU General Public License v3.0 or later**
(`SPDX-License-Identifier: GPL-3.0-or-later`). The full text is in
[LICENSE](LICENSE).

This project bundles Giac (GPL-3.0+), GMP/MPFR/MPFI (LGPL, transitively
inside the Giac WebAssembly), and will bundle KaTeX (MIT) for math
rendering. Because Giac is GPL-3.0+, the combined work must be distributed
under GPL-3.0-or-later — you may not relicense this project under a more
permissive license while Giac remains bundled. See [NOTICE](NOTICE) for
full attribution and upstream pointers.

HP, HP 48, HP 49, HP 50g, and HP Prime are trademarks of HP Inc. This
project is an independent reimplementation and is not affiliated with or
endorsed by HP.
