// 桌面通知封裝。實際送出與點擊回呼在 Rust 端（notify.rs）——官方
// plugin-notification 在桌面偵測不到點擊，故各平台改用原生 crate。
// 使用者點擊通知會由 Rust emit `notify://activate`，前端在 App.tsx 監聽。
import { invoke } from "@tauri-apps/api/core";

/** 送出通知；點擊時 Rust 會 emit `notify://activate` 帶上 sessionId。 */
export function notify(sessionId: string, title: string, body: string): void {
  invoke("notify_session", { sessionId, title, body }).catch(() => {
    // 忽略（純瀏覽器環境或送出失敗）
  });
}
