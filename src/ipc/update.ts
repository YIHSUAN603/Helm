// 應用程式自動更新封裝。純瀏覽器環境（無 Tauri）呼叫會 reject，忽略即可。
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "up-to-date" }
  | { phase: "downloading" }
  | { phase: "relaunching" }
  | { phase: "error" };

/** 檢查是否有新版本，無更新或檢查失敗時回傳 null。 */
export async function checkForUpdate(): Promise<Update | null> {
  try {
    return await check();
  } catch {
    return null;
  }
}

/** 下載並安裝更新，完成後重啟應用程式。 */
export async function downloadAndInstallUpdate(update: Update): Promise<void> {
  await update.downloadAndInstall();
  await relaunch();
}
