// Hook 事件正規化：CLI agent 的 hook 程序把 stdin 的 JSON POST 回 Helm
// （見 src-tauri/src/hookserver.rs → `agent://hook` 事件），這裡轉成統一的
// AgentEvent。Claude Code 與 Codex 的 hooks 共用同一套欄位（hook_event_name /
// tool_name / tool_input），statusline 則是 Claude Code 專屬的用量來源。
// 純函式、無執行期依賴，node 測試可直接載入。

/** 正規化後的事件。permission 進 waiting，stop 進 done，其餘更新統計。 */
export type AgentEvent =
  | { kind: "permission"; prompt: string }
  | { kind: "stop" }
  | { kind: "toolDone"; file?: { op: string; path: string } }
  | {
      kind: "usage";
      usage: {
        cost?: number;
        tokensIn?: number;
        tokensOut?: number;
        contextLeftPercent?: number;
      };
    };

/** hook 安裝片段的 source 參數 → 對應的內建 profile id（未知來源回 null）。 */
export function profileIdForSource(source: string): string | null {
  if (source === "claude-code" || source === "claude-code-statusline") return "claude-code";
  if (source === "codex") return "codex";
  return null;
}

// 與 engine.extractPromptLine 相同的提示長度上限。
const PROMPT_MAX = 200;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

// tool_input 中常見的檔案路徑欄位（Claude Code：file_path / notebook_path；
// Codex 的 patch 類工具用 path）。
function filePathOf(input: Record<string, unknown>): string | undefined {
  return str(input.file_path) ?? str(input.notebook_path) ?? str(input.path);
}

/** 審批提示：工具名 + 最能辨識這次動作的參數（指令或檔案路徑）。 */
function summarizePermission(toolName: string, toolInput: unknown): string {
  let detail: string | undefined;
  if (isRecord(toolInput)) {
    detail = str(toolInput.command) ?? filePathOf(toolInput) ?? str(toolInput.description);
    if (!detail) {
      const json = JSON.stringify(toolInput);
      detail = json === "{}" ? undefined : json;
    }
  }
  return (detail ? `${toolName}: ${detail}` : toolName).slice(0, PROMPT_MAX);
}

// 會改動檔案的工具 → ChangedFilesPanel 的 op 標籤（沿用 regex 擷取的字彙）。
const FILE_TOOL_OPS: Record<string, string> = {
  Edit: "Edit",
  MultiEdit: "MultiEdit",
  Write: "Write",
  NotebookEdit: "Edit",
  apply_patch: "Update",
};

/**
 * 把單一 hook payload 正規化成 AgentEvent；認不得的事件回 undefined（丟棄）。
 * statusline 沒有 hook_event_name，靠 source 區分。
 */
export function normalizeHookPayload(source: string, payload: unknown): AgentEvent | undefined {
  if (!isRecord(payload)) return undefined;

  if (source === "claude-code-statusline") {
    const cost = isRecord(payload.cost) ? num(payload.cost.total_cost_usd) : undefined;
    const ctx = isRecord(payload.context_window) ? payload.context_window : undefined;
    const usage = {
      cost,
      tokensIn: ctx ? num(ctx.total_input_tokens) : undefined,
      tokensOut: ctx ? num(ctx.total_output_tokens) : undefined,
      contextLeftPercent: ctx ? num(ctx.remaining_percentage) : undefined,
    };
    if (Object.values(usage).every((v) => v === undefined)) return undefined;
    return { kind: "usage", usage };
  }

  const event = str(payload.hook_event_name);
  const toolName = str(payload.tool_name);
  switch (event) {
    case "PermissionRequest":
      return { kind: "permission", prompt: summarizePermission(toolName ?? "?", payload.tool_input) };
    case "Stop":
      return { kind: "stop" };
    case "PostToolUse": {
      const op = toolName ? FILE_TOOL_OPS[toolName] : undefined;
      const path =
        op && isRecord(payload.tool_input) ? filePathOf(payload.tool_input) : undefined;
      return { kind: "toolDone", file: op && path ? { op, path } : undefined };
    }
    default:
      return undefined;
  }
}
