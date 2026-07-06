mod config;
mod pty;

use pty::PtyManager;
use tauri::menu::{Menu, MenuItemBuilder, SubmenuBuilder};
use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(PtyManager::default())
        .setup(|app| {
            // 應用選單：提供可發現性與滑鼠入口。實際按鍵由前端 DOM keydown 處理
            // （macOS 上 WKWebView 有焦點時選單 accelerator 不會觸發，這裡的
            // accelerator 主要作為選單上的快捷鍵提示；webview 無焦點時仍可作用）。
            // 項目 id = 前端命令 id（見 src/commands/registry.ts）。
            let item = |id: &str, label: &str, accel: &str| {
                MenuItemBuilder::with_id(id, label)
                    .accelerator(accel)
                    .build(app)
            };

            let new_session = item("session:new", "新增 Session", "CmdOrCtrl+Shift+T")?;
            let next_session = item("session:next", "下一個 Session", "CmdOrCtrl+Shift+]")?;
            let prev_session = item("session:prev", "上一個 Session", "CmdOrCtrl+Shift+[")?;
            let session_menu = SubmenuBuilder::new(app, "Session")
                .items(&[&new_session, &next_session, &prev_session])
                .build()?;

            let split_right = item("layout:split-right", "向右分割", "CmdOrCtrl+\\")?;
            let split_down = item("layout:split-down", "向下分割", "CmdOrCtrl+Shift+D")?;
            let close_pane = item("layout:close-pane", "關閉 Pane", "CmdOrCtrl+Shift+W")?;
            let focus_next_pane =
                item("layout:focus-next-pane", "焦點：下一個 Pane", "CmdOrCtrl+Shift+O")?;
            let layout_menu = SubmenuBuilder::new(app, "版面")
                .items(&[&split_right, &split_down, &close_pane, &focus_next_pane])
                .build()?;

            let palette = item("palette:open", "命令面板", "CmdOrCtrl+Shift+P")?;
            let toggle_view = item("view:toggle-mode", "切換 單一/分割 視圖", "CmdOrCtrl+Shift+M")?;
            let toggle_files = item("view:toggle-files", "檔案變更面板", "CmdOrCtrl+Shift+F")?;
            let toggle_theme = item("theme:toggle", "切換主題", "CmdOrCtrl+Shift+L")?;
            let view_menu = SubmenuBuilder::new(app, "檢視")
                .items(&[&palette, &toggle_view, &toggle_files, &toggle_theme])
                .build()?;

            let menu = Menu::default(app.handle())?;
            menu.append(&session_menu)?;
            menu.append(&layout_menu)?;
            menu.append(&view_menu)?;
            app.set_menu(menu)?;
            app.on_menu_event(|app, event| {
                let id = event.id().as_ref();
                // 只轉發自家命令 id，避免 macOS 預設選單項誤觸發。
                const PREFIXES: [&str; 6] =
                    ["layout:", "session:", "view:", "theme:", "palette:", "focus:"];
                if PREFIXES.iter().any(|p| id.starts_with(p)) {
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
            config::read_agents_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
