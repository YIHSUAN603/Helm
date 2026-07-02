// 桌面通知封裝。權限在啟動時請求，之後 notify() 直接送。
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

let granted = false;

export async function ensureNotifyPermission(): Promise<void> {
  try {
    granted = await isPermissionGranted();
    if (!granted) {
      granted = (await requestPermission()) === "granted";
    }
  } catch {
    granted = false;
  }
}

export function notify(title: string, body: string): void {
  if (!granted) return;
  try {
    sendNotification({ title, body });
  } catch {
    // 忽略
  }
}
