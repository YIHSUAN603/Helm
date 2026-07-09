// 桌面通知：由 Rust 端送出並掛上點擊回呼（官方 plugin-notification 在桌面
// 偵測不到點擊，故各平台改用原生 crate）。使用者點擊通知時，emit
// `notify://activate` 帶上 session_id，前端據此聚焦視窗並切換到該 session。
use tauri::{AppHandle, Emitter};

/// 送出通知，並在使用者點擊時 emit `notify://activate`（payload = session_id）。
/// 通知本身送不出去時靜默忽略（沿用前端原本的行為）。
#[tauri::command]
pub fn notify_session(app: AppHandle, session_id: String, title: String, body: String) {
    #[cfg(windows)]
    {
        use tauri_winrt_notification::Toast;
        // 安裝後的 app 會有自己的 AUMID；開發階段沒有註冊，退回 PowerShell id
        // （通知會誤標來源為 PowerShell，但點擊回呼仍可運作）。
        let _ = Toast::new(Toast::POWERSHELL_APP_ID)
            .title(&title)
            .text1(&body)
            .on_activated(move |_action| {
                let _ = app.emit("notify://activate", &session_id);
                Ok(())
            })
            .show();
    }

    #[cfg(target_os = "linux")]
    {
        use notify_rust::Notification;
        // "default" = 點擊通知本體（多數桌面環境）。wait_for_action 會阻塞，
        // 必須丟到獨立執行緒。
        if let Ok(handle) = Notification::new()
            .summary(&title)
            .body(&body)
            .action("default", "Open")
            .show()
        {
            std::thread::spawn(move || {
                handle.wait_for_action(|action| {
                    if action == "default" {
                        let _ = app.emit("notify://activate", &session_id);
                    }
                });
            });
        }
    }

    #[cfg(target_os = "macos")]
    {
        use mac_notification_sys::{send_notification, Notification, NotificationResponse};
        // send_notification 會阻塞直到使用者互動或通知消失，丟到獨立執行緒。
        std::thread::spawn(move || {
            if let Ok(response) = send_notification(&title, None, &body, &Notification::default()) {
                match response {
                    NotificationResponse::Click | NotificationResponse::ActionButton(_) => {
                        let _ = app.emit("notify://activate", &session_id);
                    }
                    _ => {}
                }
            }
        });
    }

    // 其他平台：無操作（避免未使用參數告警）。
    #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
    {
        let _ = (app, session_id, title, body);
    }
}
