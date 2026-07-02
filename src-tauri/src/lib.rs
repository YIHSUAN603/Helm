mod config;
mod pty;
mod store;

use pty::PtyManager;
use store::Store;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(PtyManager::default())
        .setup(|app| {
            let store = Store::init(app.handle())?;
            app.manage(store);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            store::sessions_list,
            store::session_upsert,
            store::session_delete,
            config::read_agents_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
