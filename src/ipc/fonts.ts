// 系統等寬字型列舉封裝。純瀏覽器環境（無 Tauri）呼叫會 reject，回傳空陣列即可。
import { invoke } from "@tauri-apps/api/core";

/**
 * 取得系統已安裝的等寬字型 family 名稱清單（Rust 端已排序、去重）。
 * @returns 字型名稱陣列；純瀏覽器環境或失敗時為空陣列
 */
export async function listMonospaceFonts(): Promise<string[]> {
  try {
    const fonts = await invoke<string[]>("list_monospace_fonts");
    return Array.isArray(fonts) ? fonts : [];
  } catch {
    // 忽略（例如 npm run dev 純瀏覽器環境）
    return [];
  }
}
