// Agent profile 系統的型別。刻意用「regex 來源字串」而非 RegExp，
// 這樣同一份 schema 既能寫在內建 TS，也能由使用者的 agents.json 提供。

/** agent 的執行狀態。generic terminal 沒跑 agent 時為 undefined。 */
export type AgentState =
  | "thinking" // 思考中
  | "tool" // 執行工具/指令
  | "waiting" // 等待審批（需要使用者）
  | "done" // 完成
  | "error"; // 錯誤

/** 各狀態的辨識 pattern（regex 來源字串，套用在近期清乾淨的輸出上）。 */
export interface AgentStatePatterns {
  /**
   * Matched per line and CASE-SENSITIVELY (it drives desktop notifications,
   * so precision matters most here — enumerate case variants explicitly,
   * e.g. "\\([yY]\\/[nN]\\)"). All other states are matched per line with
   * the "i" flag.
   */
  waiting?: string;
  thinking?: string;
  tool?: string;
  error?: string;
  done?: string;
  /**
   * 命中則「抑制 waiting」。用來排除 onboarding / 設定類提示
   * （例如 Claude Code 啟動時的「信任這個資料夾」對話框），
   * 避免這些一次性提示佔用集中審批面板。
   */
  ignore?: string;
}

/**
 * 從輸出串流逐行擷取結構化資訊（成本/用量/檔案變更）的 regex 來源。
 * 皆選填，需帶 capture group。同樣資料驅動：任何工具都能在 agents.json 定義。
 */
export interface AgentExtractors {
  /** group1 = 累計成本（美元數字）。 */
  cost?: string;
  /** group1 = input/prompt tokens。 */
  tokensIn?: string;
  /** group1 = output/completion tokens。 */
  tokensOut?: string;
  /** group1 = 操作（Edit/Write…），group2 = 檔案路徑。 */
  fileChange?: string;
}

export interface AgentProfile {
  /** 唯一 id，例如 "claude-code"、"codex"、"generic"。 */
  id: string;
  /** 顯示名稱。 */
  label: string;
  /** 從輸出被動偵測「這是不是這個 agent」的 regex 來源（選填）。 */
  detectOutput?: string;
  /** 狀態辨識 pattern。 */
  states: AgentStatePatterns;
  /** 結構化擷取 pattern（成本/用量/檔案變更），選填。 */
  extract?: AgentExtractors;
  /** 進入 waiting 時，approve / reject 要寫回 PTY 的按鍵序列。 */
  approve: string;
  reject: string;
}

/** 側欄「+」可啟動的項目：一般 shell 或某個 agent。 */
export interface AgentLauncher {
  label: string;
  /** 啟動後寫入 PTY 的指令；空字串代表純 shell。 */
  command: string;
  /** 對應的 profile id；純 shell 為 null。 */
  profileId: string | null;
}

/** 使用者 agents.json 的結構（皆選填，與內建合併）。 */
export interface AgentConfig {
  profiles?: AgentProfile[];
  launchers?: AgentLauncher[];
}
