// 前端呼叫 Rust dialog plugin 的封裝層。
import { open } from "@tauri-apps/plugin-dialog";

/** Native folder picker; returns the chosen absolute path or null if cancelled. */
export async function pickFolder(defaultPath?: string): Promise<string | null> {
  const res = await open({ directory: true, multiple: false, defaultPath });
  return typeof res === "string" ? res : null;
}
