// 桌面通知：由 Rust 端送出並掛上點擊回呼（官方 plugin-notification 在桌面
// 偵測不到點擊，故各平台改用原生 backend）。使用者點擊通知時，emit
// `notify://activate` 帶上 session_id，前端據此聚焦視窗並切換到該 session。
//
// macOS 26 (Tahoe) 起，舊的 NSUserNotification API 已無法送達通知，故改用現代的
// UserNotifications framework（UNUserNotificationCenter）。該 API 只在已簽章的
// .app bundle 內可用，因此未包裝（`tauri dev`）時退回 osascript（可顯示但無點擊
// 回呼）。註冊 delegate 與請求授權在 `init`（於 lib.rs setup 呼叫）。
use tauri::AppHandle;

/// 送出通知，並在使用者點擊時 emit `notify://activate`（payload = session_id）。
/// 通知本身送不出去時靜默忽略（沿用前端原本的行為）。
#[tauri::command]
pub fn notify_session(app: AppHandle, session_id: String, title: String, body: String) {
    #[cfg(windows)]
    {
        use tauri::Emitter;
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
        use tauri::Emitter;
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
    macos::send(app, session_id, title, body);

    // 其他平台：無操作（避免未使用參數告警）。
    #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
    {
        let _ = (app, session_id, title, body);
    }
}

/// 於 app 啟動時初始化平台通知支援。目前僅 macOS 需要（在 app 完成啟動前註冊
/// UNUserNotificationCenter delegate 並請求授權）；其他平台為 no-op。
pub fn init(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    macos::init(app);
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

#[cfg(target_os = "macos")]
mod macos {
    use std::process::Command;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::OnceLock;

    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::{Bool, NSObject, ProtocolObject};
    use objc2::{define_class, msg_send, AllocAnyThread};
    use objc2_foundation::{NSBundle, NSError, NSObjectProtocol, NSString};
    use objc2_user_notifications::{
        UNAuthorizationOptions, UNMutableNotificationContent, UNNotification,
        UNNotificationPresentationOptions, UNNotificationRequest, UNNotificationResponse,
        UNUserNotificationCenter, UNUserNotificationCenterDelegate,
    };
    use tauri::{AppHandle, Emitter};

    /// 於 `init` 設定；delegate 讀取它以 emit `notify://activate`。
    static APP: OnceLock<AppHandle> = OnceLock::new();

    /// UNUserNotificationCenter 授權是否成功。未簽章的 app（codesign 缺失時
    /// requestAuthorization 直接回錯誤、不會跳提示）或使用者拒絕授權時維持
    /// false，`send` 據此退回 osascript，而不是把通知丟進送不出去的 UN request。
    static AUTH_GRANTED: AtomicBool = AtomicBool::new(false);

    /// 是否從真正的 `.app` bundle 執行。未包裝的行程（如 `tauri dev`）呼叫
    /// UNUserNotificationCenter 會擲例外，故所有 UN 呼叫都先過此檢查，否則退回
    /// osascript。
    fn is_bundled() -> bool {
        NSBundle::mainBundle().bundleIdentifier().is_some()
    }

    define_class!(
        #[unsafe(super(NSObject))]
        #[name = "HelmNotificationDelegate"]
        struct Delegate;

        unsafe impl NSObjectProtocol for Delegate {}

        unsafe impl UNUserNotificationCenterDelegate for Delegate {
            // 點擊通知 → 聚焦視窗並切換到該 session（identifier = session_id）。
            #[unsafe(method(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:))]
            fn did_receive(
                &self,
                _center: &UNUserNotificationCenter,
                response: &UNNotificationResponse,
                completion: &block2::DynBlock<dyn Fn()>,
            ) {
                let session_id = response.notification().request().identifier().to_string();
                if let Some(app) = APP.get() {
                    let _ = app.emit("notify://activate", &session_id);
                }
                completion.call(());
            }

            // 即使 Helm 在前景也顯示 banner（前端的聚焦抑制在抵達 Rust 前已先執行）。
            #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
            fn will_present(
                &self,
                _center: &UNUserNotificationCenter,
                _notification: &UNNotification,
                completion: &block2::DynBlock<dyn Fn(UNNotificationPresentationOptions)>,
            ) {
                completion.call((UNNotificationPresentationOptions::Banner
                    | UNNotificationPresentationOptions::Sound,));
            }
        }
    );

    pub fn init(app: &AppHandle) {
        let _ = APP.set(app.clone());
        if !is_bundled() {
            return; // dev build → osascript fallback，不需 delegate/授權
        }
        let center = UNUserNotificationCenter::currentNotificationCenter();

        // `delegate` 為 weak property —— 自行保留 delegate 直到 app 結束。
        let delegate = Delegate::alloc().set_ivars(());
        let delegate: Retained<Delegate> = unsafe { msg_send![super(delegate), init] };
        center.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
        std::mem::forget(delegate);

        // 授權結果寫入 AUTH_GRANTED；失敗（未簽章 app、使用者拒絕）要留下可診斷
        // 的訊息，否則通知會無聲消失。
        let handler = RcBlock::new(|granted: Bool, err: *mut NSError| {
            AUTH_GRANTED.store(granted.as_bool(), Ordering::Relaxed);
            if !granted.as_bool() {
                match unsafe { err.as_ref() } {
                    Some(e) => eprintln!(
                        "[helm] notification authorization failed: {}",
                        e.localizedDescription()
                    ),
                    None => eprintln!("[helm] notification authorization denied by user"),
                }
            }
        });
        center.requestAuthorizationWithOptions_completionHandler(
            UNAuthorizationOptions::Alert | UNAuthorizationOptions::Sound,
            &handler,
        );
    }

    pub fn send(app: AppHandle, session_id: String, title: String, body: String) {
        if is_bundled() && AUTH_GRANTED.load(Ordering::Relaxed) {
            let content = UNMutableNotificationContent::new();
            content.setTitle(&NSString::from_str(&title));
            content.setBody(&NSString::from_str(&body));
            let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
                &NSString::from_str(&session_id),
                &content,
                None,
            );
            UNUserNotificationCenter::currentNotificationCenter()
                .addNotificationRequest_withCompletionHandler(&request, None);
            let _ = app;
        } else {
            // Dev 或授權失敗時退回：osascript。文字以 argv 傳入（不插入腳本字串）以避免 AppleScript
            // 注入。title 為 item 1（受控/已在地化，不會以 '-' 開頭），body 為 item 2。
            let _ = Command::new("osascript")
                .arg("-e")
                .arg("on run argv")
                .arg("-e")
                .arg("display notification (item 2 of argv) with title (item 1 of argv)")
                .arg("-e")
                .arg("end run")
                .arg(&title)
                .arg(&body)
                .spawn();
            let _ = (app, session_id);
        }
    }
}
