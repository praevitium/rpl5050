// Prevents additional console window on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Toggle the WebView's DevTools panel.  Wired to a single click on
// the frontend version label.  Compiled into release builds because
// the `devtools` feature is enabled unconditionally on the `tauri`
// crate.
#[tauri::command]
fn toggle_devtools(window: tauri::WebviewWindow) {
  if window.is_devtools_open() {
    window.close_devtools();
  } else {
    window.open_devtools();
  }
}

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_window_state::Builder::new().build())
    .invoke_handler(tauri::generate_handler![toggle_devtools])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
