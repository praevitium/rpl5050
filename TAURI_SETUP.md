# Tauri Setup for rp5050sx

This project is now configured to run as a native desktop application on macOS, Windows, and Linux using Tauri.

## Prerequisites

### macOS
- Xcode Command Line Tools: `xcode-select --install`
- Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

### Windows
- Visual Studio with C++ build tools
- Rust: Download from https://www.rust-lang.org/tools/install

### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.0-dev \
  curl wget file libssl-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev
```

Then install Rust:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

## Installation

1. Install dependencies:
```bash
npm install
```

## Development

Run the app in development mode with hot reload:

```bash
npm run dev
```

The Tauri window will open and display the calculator. Any changes to HTML/CSS/JavaScript files will refresh automatically.

## Building

### Build for your current platform:
```bash
npm run build
```

This creates an executable in `src-tauri/target/release/bundle/`

### Build for specific platforms:
```bash
# macOS (universal binary for Apple Silicon + Intel)
npm run build:macos

# Windows (x86_64)
npm run build:windows

# Linux (x86_64)
npm run build:linux
```

## Project Structure

```
rpl5050/
├── package.json           # Node.js configuration
├── tauri.conf.json       # Tauri configuration
├── index.html            # Main app entry point
├── css/                  # Stylesheets
├── src/                  # JavaScript source
│   ├── app.js
│   ├── rpl/             # RPL engine (algebra, operations, etc.)
│   └── ui/              # UI components
├── src-tauri/           # Rust backend
│   ├── Cargo.toml
│   ├── build.rs
│   └── src/
│       └── main.rs
└── tests/               # Test suites
```

## Window Configuration

The window is configured in `tauri.conf.json`:
- **Size**: 600x900 (calculator form factor)
- **Resizable**: false (locked to calculator proportions)
- **Custom title bar**: Can be enabled for native look & feel

To modify window behavior, edit the `windows` array in `tauri.conf.json`.

## Distribution

### macOS (.dmg)
Automatically created in `src-tauri/target/release/bundle/dmg/`

### Windows (.msi, .exe)
Available in `src-tauri/target/release/bundle/msi/`

### Linux (.deb, .AppImage)
Available in `src-tauri/target/release/bundle/`

## Troubleshooting

**"error: linker `cc` not found"** (Linux)
```bash
sudo apt install build-essential
```

**"error: command not found: rustup"** (macOS/Linux)
Restart your terminal or run:
```bash
source $HOME/.cargo/env
```

**"failed to parse manifest at"** (Windows)
Ensure Visual Studio C++ tools are installed, then run:
```bash
rustup update
```

## Next Steps

- Customize the window icon: Add `icon.png` (1024x1024) and configure in `tauri.conf.json`
- Add native system menus: Update `src-tauri/src/main.rs`
- Sign releases: Configure code signing in build scripts for macOS/Windows

## Resources

- [Tauri Documentation](https://tauri.app/docs/)
- [Tauri Configuration Reference](https://tauri.app/docs/api/config/)
- [Rust Book](https://doc.rust-lang.org/book/)
