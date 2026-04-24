# Quick Start - Tauri Development

## One-Time Setup

```bash
# 1. Install Node dependencies
npm install

# 2. Check Rust is installed
rustc --version
cargo --version

# If Rust is not installed:
# macOS/Linux:  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Windows:      Visit https://www.rust-lang.org/tools/install
```

## Run in Development Mode

```bash
npm run dev
```

This launches the calculator in a Tauri window with:
- ✅ Hot reload for HTML/CSS/JS changes
- ✅ Chromium DevTools (right-click → Inspect)
- ✅ Full filesystem and system access

## Create Production Build

```bash
npm run build
```

Output appears in:
- **macOS**: `src-tauri/target/release/bundle/dmg/`
- **Windows**: `src-tauri/target/release/bundle/msi/`
- **Linux**: `src-tauri/target/release/bundle/`

## File Locations

All browser-loaded assets live under `www/` so Tauri can ship them without
dragging in `src-tauri/`, `node_modules/`, or target directories:
- `www/index.html` → Entry point
- `www/src/app.js` → App bootstrap
- `www/src/rpl/` → Symbolic algebra engine
- `www/css/` → Styles

Tauri config (`src-tauri/tauri.conf.json`) points `frontendDist` at `../www`.

## Customization

### Window Size/Title
Edit `src-tauri/tauri.conf.json` → `app.windows[0]`

### App Icon
Drop a 1024x1024 source image somewhere and run:

```bash
npx tauri icon /path/to/source.png --output src-tauri/icons
```

This regenerates the full icon set (macOS `.icns`, Windows `.ico`, Linux PNGs,
iOS, Android). The icons currently committed are placeholders.

### Menus & Native Features
Edit `src-tauri/src/main.rs` to add native menus, keyboard shortcuts, etc.

---

## Troubleshooting

Issues encountered setting this project up, and how to resolve them. All of
these are now fixed in the committed config — this section is kept for
reference in case they reappear after a dependency bump or migration.

### `cargo not found` / Rust not on PATH

Rust's installer drops `cargo` in `~/.cargo/bin` and sources it from
`~/.profile`, which **zsh does not read on macOS**. Fix by adding this line
to `~/.zprofile` (login shells) or `~/.zshrc` (interactive shells):

```bash
[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
```

For the current shell: `source ~/.cargo/env`.

### Tauri v2 config schema errors

If `tauri build` reports `Additional properties are not allowed` for keys
like `devPath`, `targets`, or `deb`, the config is using Tauri v1 shape.
v2 requires:

| v1 (broken)                                | v2 (correct)                                            |
|--------------------------------------------|---------------------------------------------------------|
| `build.devPath: "."`                       | removed (use `build.devUrl: "http://..."` if needed)    |
| `bundle.targets: ["deb","dmg","msi",...]`  | `bundle.targets: "all"` (per-platform arrays disallowed)|
| `bundle.deb: {...}`                        | `bundle.linux.deb: {...}`                               |
| `tauri.conf.json` at project root          | `src-tauri/tauri.conf.json` (next to `Cargo.toml`)      |

With the config in `src-tauri/`, `frontendDist` is relative to that folder
(so `"../www"` points at the project's `www/` directory).

### `shell-open` feature not found in Tauri 2

```
package depends on `tauri` with feature `shell-open` but `tauri` does not
have that feature.
```

`shell-open` was a v1 feature. In v2, shell access moved to a separate
plugin (`tauri-plugin-shell`). If you don't need to open external URLs or
spawn processes, just drop the feature:

```toml
# src-tauri/Cargo.toml
tauri = { version = "2", features = [] }
```

### `frontendDist includes src-tauri, node_modules, ...`

Tauri refuses to bundle a `frontendDist` that also contains its own build
artifacts or dependencies. The fix is to isolate web assets in a single
folder — here, `www/`. If you add new top-level browser assets, put them
under `www/`, not at the repo root.

### `failed to open icon src-tauri/icons/icon.png`

Tauri's codegen needs a full icon set at compile time. If `src-tauri/icons/`
is missing or empty, generate placeholders:

```bash
npx tauri icon /path/to/any-1024x1024.png --output src-tauri/icons
```

### `npm run dev` hangs or fails after config changes

Tauri dev caches the Cargo build. If behavior is stale after a config
change, try:

```bash
rm -rf src-tauri/target
npm run dev
```

---

**Got stuck?** Check [TAURI_SETUP.md](./TAURI_SETUP.md) for deeper setup notes.
