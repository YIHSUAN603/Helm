// CLI agent 整合安裝（Rust 端 integrations.rs）：查詢/寫入使用者層級的
// Claude Code hooks 與 statusline 設定；Codex 只回報狀態（不自動改 TOML）。
import { invoke } from "@tauri-apps/api/core";

export interface IntegrationStatus {
  claudeHooks: boolean;
  /** "none" 未設定 / "helm" 我們裝的 / "other" 使用者自己的。 */
  claudeStatusline: "none" | "helm" | "other";
  codexOsc9: boolean;
}

/** 查詢各整合項狀態；純瀏覽器環境回 null（設定頁隱藏整合區塊）。 */
export async function integrationStatus(): Promise<IntegrationStatus | null> {
  try {
    return await invoke<IntegrationStatus>("integration_status");
  } catch {
    return null;
  }
}

export function installClaudeHooks(): Promise<void> {
  return invoke("install_claude_hooks");
}

export function installClaudeStatusline(): Promise<void> {
  return invoke("install_claude_statusline");
}
