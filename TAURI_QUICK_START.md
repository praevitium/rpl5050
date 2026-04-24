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

All your calculator code stays exactly where it is:
- `index.html` → Entry point
- `src/app.js` → Tauri loads this automatically
- `src/rpl/` → Your symbolic algebra engine
- `css/` → Styles (unchanged)

Tauri wraps it all in a native app shell.

## Customization

### Window Size/Title
Edit `tauri.conf.json` → `app.windows[0]`

### App Icon
Create `icon.png` (1024x1024) and add to the project, then configure in `tauri.conf.json`

### Menus & Native Features
Edit `src-tauri/src/main.rs` to add native menus, keyboard shortcuts, etc.

---

**Got stuck?** Check [TAURI_SETUP.md](./TAURI_SETUP.md) for troubleshooting.
