// 內建 agent profiles 與 launchers。
// 這些只是「預設值」——使用者可透過 app config dir 的 agents.json 覆寫或新增，
// 所以本系統並不綁定 Claude Code / Codex，任何 CLI agent 都能加進來。
import type { AgentLauncher, AgentProfile } from "./types";

// 通用 fallback：涵蓋常見的審批/錯誤字樣，適用任何未特別定義的工具。
export const GENERIC_PROFILE: AgentProfile = {
  id: "generic",
  label: "Agent",
  states: {
    // 只保留強訊號：明確的 y/n 提示、或箭頭指著編號肯定選項。
      waiting:
      "\\(y\\/n\\)|\\(Y\\/n\\)|\\(y\\/N\\)|\\[y\\/N\\]|\\[Y\\/n\\]|❯\\s*\\d+\\.\\s*(Yes|Allow|Run|Apply|Proceed)",
    thinking: "thinking|working|analyz|generating|processing|⠋|⠙|⠹|⠸|⠼",
    tool: "running|executing|\\$\\s|\\brunning tool\\b|tool call",
    error: "\\berror\\b|\\bfailed\\b|traceback|exception",
    done: "\\bdone\\b|completed|finished|✔|✓",
  },
  extract: {
    cost: "cost[^$]*\\$\\s?([0-9]+(?:\\.[0-9]+)?)",
    tokensIn: "([0-9,]+)\\s*(?:input|prompt)\\s*tokens",
    tokensOut: "([0-9,]+)\\s*(?:output|completion)\\s*tokens",
    fileChange:
      "\\b(edited|wrote|created|modified|updated|edit|write|create|update)\\b[:\\s]+([^\\s]+\\.[A-Za-z0-9]+)",
  },
  approve: "y\r",
  reject: "n\r",
};

export const BUILTIN_PROFILES: AgentProfile[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    detectOutput: "Claude Code|anthropic|claude\\.ai\\/code",
    states: {
    // 以下皆對照 Claude Code 2.1.x 實際 TUI 輸出校準。
      // 只匹配「作用中的核准選單」：箭頭 ❯ 指著一個編號的肯定選項。
      // （輸入框也是 ❯ 開頭，但後面沒有「數字.」，故不會誤觸發。）
      waiting: "❯\\s*\\d+\\.\\s*(Yes|Allow|Run|Apply|Proceed|Create)",
      // 思考中：旋轉星號 ✻✽✶✳✢、"thinking"、或 "esc to interrupt" 提示。
      thinking: "[✻✽✶✳✢]|\\bthinking\\b|esc to interrupt",
      // 工具呼叫：⏺ 後接工具動詞（⏺ Running / ⏺ Update(...) / ⏺ Reading …）。
      tool: "⏺\\s*(Running|Ran|Reading|Writing|Searching|Fetching|Update|Edit|MultiEdit|Write|Read|Create|Bash|Grep|Glob)\\b",
      error: "\\berror\\b|failed|API Error",
      // 完成：「Done.」或「Worked for 5s」。
      done: "\\bDone\\.|Worked for \\d",
      // 排除啟動/設定類的一次性提示（信任資料夾、選主題、登入等）。
      ignore:
        "trust\\s*(this folder|the files)|Security\\s*guide|choose.*text style|Select\\s*(theme|login)|Sign in|Log in|Welcome to Claude",
    },
    extract: {
      // 成本：/cost 指令輸出的「Total cost: $X」。
      cost: "(?:total cost|cost)[:\\s]*\\$\\s?([0-9]+(?:\\.[0-9]+)?)",
      // Token 用量顯示於底部：↑ 輸入 / ↓ 輸出（例：↑ 75 tokens、↓ 38 tokens）。
      tokensIn: "↑\\s*([0-9,]+)\\s*tokens?",
      tokensOut: "↓\\s*([0-9,]+)\\s*tokens?",
      // 檔案變更：Update/Edit/Write/Create(路徑)（例：⏺ Update(demo.txt)）。
      fileChange: "\\b(Update|Edit|MultiEdit|Write|Create)\\(([^)]+)\\)",
    },
    // 預設按 Enter 接受被 highlight 的第一項；請依實際 UI 於 agents.json 微調。
    approve: "\r",
    reject: "\x1b", // Esc
  },
  {
    id: "codex",
    label: "Codex",
    detectOutput: "Codex CLI|OpenAI Codex|codex",
    states: {
      waiting: "Allow command|Run this command|\\(y\\/n\\)|approve\\?|Apply patch\\?",
      thinking: "Thinking|Working|Reasoning",
      tool: "Running|exec|\\$\\s|patch",
      error: "\\berror\\b|failed",
      done: "\\bdone\\b|completed",
    },
    extract: {
      cost: "cost[:\\s]*\\$\\s?([0-9]+(?:\\.[0-9]+)?)",
      tokensIn: "([0-9,]+)\\s*(?:input|prompt)",
      tokensOut: "([0-9,]+)\\s*(?:output|completion)",
      fileChange: "\\b(Apply patch|patch|edit|create|update)\\b.*?([^\\s]+\\.[A-Za-z0-9]+)",
    },
    approve: "y\r",
    reject: "n\r",
  },
  GENERIC_PROFILE,
];

export const BUILTIN_LAUNCHERS: AgentLauncher[] = [
  { label: "Shell", command: "", profileId: null },
  { label: "Claude Code", command: "claude", profileId: "claude-code" },
  { label: "Codex", command: "codex", profileId: "codex" },
];
