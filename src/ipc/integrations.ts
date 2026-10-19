// CLI agent 整合安裝（Rust 端 integrations.rs）：查詢/寫入使用者層級的
// Claude Code hooks 與 statusline 設定；Codex 只回報狀態與產生片段（不自動改它的設定檔）。
import { invoke } from "@tauri-apps/api/core";

export interface IntegrationStatus {
  claudeHooks: boolean;
  /** "none" 未設定 / "helm" 我們裝的 / "other" 使用者自己的。 */
  claudeStatusline: "none" | "helm" | "other";
  codexOsc9: boolean;
  /** hooks.json 或 config.toml 的 [hooks] 已接上 Helm（是否已在 /hooks 信任讀不到）。 */
  codexHooks: boolean;
}

export interface CodexHooksSnippet {
  /** 可貼進 hooks.json 的 JSON。 */
  snippet: string;
  /** 該貼去的 hooks.json 絕對路徑（尊重 CODEX_HOME）。 */
  path: string;
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

/** Codex 的 hooks.json 片段；Windows 上會先把轉發腳本寫到 Helm 的設定目錄。 */
export function codexHooksSnippet(): Promise<CodexHooksSnippet> {
  return invoke("codex_hooks_snippet");
}
