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

/** 通知後端狀態（見 notify.rs 的 NotificationStatus）。 */
export interface NotificationStatus {
  /** "system" = 原生通知（點擊可聚焦）；"fallback" = macOS osascript（點擊無回呼）。 */
  backend: "system" | "fallback";
  /** 是否從打包後的 .app 執行（false = `tauri dev`）。 */
  bundled: boolean;
  /** 系統通知授權是否成功。 */
  granted: boolean;
  /** 授權失敗原因（給 UI 顯示），成功時為 null。 */
  reason: string | null;
}

/** 查詢通知後端狀態；純瀏覽器環境回 null。 */
export async function notificationStatus(): Promise<NotificationStatus | null> {
  try {
    return await invoke<NotificationStatus>("notification_status");
  } catch {
    return null;
  }
}

/** 開啟系統的通知設定頁（macOS；其他平台 no-op）。 */
export function openNotificationSettings(): void {
  invoke("open_notification_settings").catch(() => {});
}
