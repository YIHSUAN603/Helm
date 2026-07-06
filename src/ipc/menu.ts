// 原生應用選單封裝。純瀏覽器環境（無 Tauri）呼叫會 reject，忽略即可。
import { invoke } from "@tauri-apps/api/core";

export async function setMenuLanguage(language: string): Promise<void> {
  try {
    await invoke("set_menu_language", { language });
  } catch {
    // 忽略（例如 npm run dev 純瀏覽器環境）
  }
}
