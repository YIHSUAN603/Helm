mod config;
mod pty;
mod store;

use pty::PtyManager;
use store::Store;
use tauri::menu::{Menu, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(PtyManager::default())
        .setup(|app| {
            let store = Store::init(app.handle())?;
            app.manage(store);

            // 版面選單：提供可發現性與滑鼠入口。實際按鍵由前端 DOM keydown 處理
            // （macOS 上 WKWebView 有焦點時選單 accelerator 不會觸發，這裡的
            // accelerator 主要作為選單上的快捷鍵提示；webview 無焦點時仍可作用）。
            let split_right = MenuItemBuilder::with_id("layout:split-right", "向右分割")
                .accelerator("CmdOrCtrl+\\")
                .build(app)?;
            let split_down = MenuItemBuilder::with_id("layout:split-down", "向下分割")
                .accelerator("CmdOrCtrl+Shift+D")
                .build(app)?;
            let close_pane = MenuItemBuilder::with_id("layout:close-pane", "關閉 Pane")
                .accelerator("CmdOrCtrl+Shift+W")
                .build(app)?;
            let layout_menu = SubmenuBuilder::new(app, "版面")
                .items(&[&split_right, &split_down, &close_pane])
                .build()?;
            let menu = Menu::default(app.handle())?;
            menu.append(&layout_menu)?;
            app.set_menu(menu)?;
            app.on_menu_event(|app, event| {
                let id = event.id().as_ref();
                if id.starts_with("layout:") {
                    let _ = app.emit("app://shortcut", id);
                }
            });
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
            store::layout_get,
            store::layout_set,
            config::read_agents_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
