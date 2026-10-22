// Hook 事件正規化：CLI agent 的 hook 程序把 stdin 的 JSON POST 回 Helm
// （見 src-tauri/src/hookserver.rs → `agent://hook` 事件），這裡轉成統一的
// AgentEvent。Claude Code 與 Codex 的 hooks 共用同一套欄位（hook_event_name /
// tool_name / tool_input），statusline 則是 Claude Code 專屬的用量來源。
// 純函式、無執行期依賴，node 測試可直接載入。
// .ts 副檔名：讓 node 測試（strip-types 模式）能直接載入本模組。
import type { ChangedFile } from "./extract.ts";

/** 正規化後的事件。permission 進 waiting，stop 進 done，其餘更新統計。 */
export type AgentEvent =
  | { kind: "permission"; prompt: string }
  // lastMessage：agent 這一回合的最後一段回覆（Stop 的 last_assistant_message，
  // Claude Code 2.1.308 / Codex 0.163.0 皆有）→ 提醒卡的「Agent 最後說」。
  | { kind: "stop"; lastMessage?: string }
  // 使用者剛送出的指令（UserPromptSubmit）→ 提醒卡的「目標」。
  | { kind: "prompt"; text: string }
  // 陣列而非單一檔案：Codex 的一次 apply_patch 可以同時新增/修改/刪除多個檔案。
  // tool 是工具名，供提醒卡統計「離開期間做了什麼」；tasks 是任務清單工具
  // 帶來的進度變化（見 taskUpdateFrom）。
  | { kind: "toolDone"; tool?: string; files: ChangedFile[]; tasks?: TaskListUpdate }
  | {
      kind: "usage";
      usage: {
        cost?: number;
        tokensIn?: number;
        tokensOut?: number;
        contextLeftPercent?: number;
        planUsage?: PlanUsage;
      };
    };

/** 方案速率限制剩餘（Claude Code Pro/Max，來自 statusline rate_limits；帳號級、跨 session）。 */
export interface PlanUsage {
  fiveHourLeftPercent?: number; // 100 - five_hour.used_percentage
  sevenDayLeftPercent?: number; // 100 - seven_day.used_percentage
  fiveHourResetsAt?: number; // unix seconds
  sevenDayResetsAt?: number;
}

/**
 * Agent CLI 自己的 session 身分。Claude Code 在**每一個** hook payload 與
 * statusline JSON 裡都附上 session_id 與 transcript_path，而 normalizeHookPayload
 * 只看 hook_event_name / tool_name / tool_input，等於把它們丟掉了 —— 那是「重啟
 * 後 claude --resume <id>」唯一的原料來源。
 *
 * 刻意獨立於 normalizeHookPayload：身分不必穿過四個事件分支，而且被 normalize
 * 丟棄的事件（SessionStart 等）也照樣能貢獻身分。
 */
export interface AgentIdentity {
  agentSessionId?: string;
  transcriptPath?: string;
}

/** 兩者皆無 → undefined（呼叫端據此完全不動 store）。 */
export function extractAgentIdentity(source: string, payload: unknown): AgentIdentity | undefined {
  if (!isRecord(payload)) return undefined;
  // statusline 的 JSON 也帶 session_id（Claude Code 的 session 物件）。
  const agentSessionId =
    str(payload.session_id) ??
    (isRecord(payload.session) ? str(payload.session.id) : undefined);
  const transcriptPath = str(payload.transcript_path);
  if (!agentSessionId && !transcriptPath) return undefined;
  // source 目前不影響解析，但保留參數：Codex 之後若用不同欄位名，這裡是唯一
  // 要改的地方（同 profileIdForSource 的資料驅動精神）。
  void source;
  return { agentSessionId, transcriptPath };
}

/** hook 安裝片段的 source 參數 → 對應的內建 profile id（未知來源回 null）。 */
export function profileIdForSource(source: string): string | null {
  if (source === "claude-code" || source === "claude-code-statusline") return "claude-code";
  if (source === "codex") return "codex";
  return null;
}

// 與 engine.extractPromptLine 相同的提示長度上限。
const PROMPT_MAX = 200;
// 使用者指令（提醒卡的目標）上限：卡片以 CSS 截斷顯示，這裡只防超長貼上
// 把整份檔案塞進 store 與 sessions.json。
export const GOAL_MAX = 500;
// agent 最後回覆的上限：回合總結常是整段 markdown，卡片只需要開頭幾行。
export const LAST_REPLY_MAX = 1000;
// 單一任務標題的上限。
export const TASK_TEXT_MAX = 200;

/** 提醒卡「進度」的一個項目。三種狀態是 Claude Code 與 Codex 共同的字彙。 */
export type TaskStatus = "pending" | "in_progress" | "completed";

export interface BriefTask {
  id: string;
  text: string;
  status: TaskStatus;
}

/**
 * 任務清單的一次變化。兩種 CLI 的模型不同：TodoWrite / update_plan 每次送出
 * 整份清單（replace），Claude Code 2.1 的 TaskCreate / TaskUpdate 則逐項增改。
 */
export type TaskListUpdate =
  | { type: "replace"; items: BriefTask[] }
  | { type: "add"; item: BriefTask }
  | { type: "patch"; id: string; status?: TaskStatus; text?: string }
  | { type: "remove"; id: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

// statusline 的 rate_limits：Pro/Max 首次 API 回應後才有，任一視窗可能單獨缺席。
// 存「剩餘 %」（100 - used_percentage）與 resets_at（unix seconds）。全缺回 undefined。
function parsePlanUsage(v: unknown): PlanUsage | undefined {
  if (!isRecord(v)) return undefined;
  const out: PlanUsage = {};
  const five = isRecord(v.five_hour) ? v.five_hour : undefined;
  const seven = isRecord(v.seven_day) ? v.seven_day : undefined;
  const fiveUsed = five ? num(five.used_percentage) : undefined;
  const sevenUsed = seven ? num(seven.used_percentage) : undefined;
  if (fiveUsed !== undefined) out.fiveHourLeftPercent = 100 - fiveUsed;
  if (sevenUsed !== undefined) out.sevenDayLeftPercent = 100 - sevenUsed;
  if (five) out.fiveHourResetsAt = num(five.resets_at);
  if (seven) out.sevenDayResetsAt = num(seven.resets_at);
  return Object.values(out).some((x) => x !== undefined) ? out : undefined;
}

function taskStatus(v: unknown): TaskStatus | undefined {
  return v === "pending" || v === "in_progress" || v === "completed" ? v : undefined;
}

// 任務 id：Claude Code 給字串，保險起見也收數字。
function taskId(v: unknown): string | undefined {
  return str(v) ?? (typeof v === "number" && Number.isFinite(v) ? String(v) : undefined);
}

function taskText(v: unknown): string | undefined {
  const s = str(v)?.trim();
  return s ? s.slice(0, TASK_TEXT_MAX) : undefined;
}

/** 整份清單（TodoWrite 的 todos / update_plan 的 plan）→ BriefTask[]；形狀不對的項目略過。 */
function taskItems(raw: unknown, textKey: string): BriefTask[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: BriefTask[] = [];
  raw.forEach((item, i) => {
    if (!isRecord(item)) return;
    const text = taskText(item[textKey]);
    if (text) out.push({ id: String(i), text, status: taskStatus(item.status) ?? "pending" });
  });
  return out;
}

/**
 * 任務清單工具的 PostToolUse → 進度變化；不是任務工具回 undefined。
 *
 * - TodoWrite（Claude Code 舊版 / CLAUDE_CODE_ENABLE_TODO_TOOLS）：tool_input.todos
 *   `[{content, status, activeForm}]`，整份替換。
 * - update_plan（Codex）：tool_input.plan `[{step, status}]`，整份替換。
 * - TaskCreate（Claude Code 2.1 預設）：tool_input.subject；id 只在 tool_response
 *   `{task: {id, subject}}` 裡，缺了就以標題當 id —— 之後的 TaskUpdate 對不上時
 *   頂多多一筆，不會弄錯別筆。
 * - TaskUpdate：tool_input.taskId + status / subject；status "deleted" = 移除。
 */
export function taskUpdateFrom(
  toolName: string | undefined,
  input: unknown,
  response: unknown,
): TaskListUpdate | undefined {
  if (!isRecord(input)) return undefined;
  switch (toolName) {
    case "TodoWrite": {
      const items = taskItems(input.todos, "content");
      return items ? { type: "replace", items } : undefined;
    }
    case "update_plan": {
      const items = taskItems(input.plan, "step");
      return items ? { type: "replace", items } : undefined;
    }
    case "TaskCreate": {
      const text = taskText(input.subject);
      if (!text) return undefined;
      // tool_response 可能是物件，也可能是序列化過的 JSON 字串。
      let res = response;
      if (typeof res === "string") {
        try {
          res = JSON.parse(res);
        } catch {
          res = undefined;
        }
      }
      const task = isRecord(res) && isRecord(res.task) ? res.task : undefined;
      const id = (task && taskId(task.id)) ?? text;
      return { type: "add", item: { id, text, status: "pending" } };
    }
    case "TaskUpdate": {
      const id = taskId(input.taskId);
      if (!id) return undefined;
      if (input.status === "deleted") return { type: "remove", id };
      const status = taskStatus(input.status);
      const text = taskText(input.subject);
      return status || text ? { type: "patch", id, status, text } : undefined;
    }
    default:
      return undefined;
  }
}

// tool_input 中常見的檔案路徑欄位（Claude Code：file_path / notebook_path；
// 其他 CLI 的單檔工具常用 path）。
function filePathOf(input: Record<string, unknown>): string | undefined {
  return str(input.file_path) ?? str(input.notebook_path) ?? str(input.path);
}

// Codex apply_patch 的檔案標頭（0.163.0 實測：路徑不在獨立欄位，整份 patch 文字
// 放在 tool_input.command）。Move to 緊跟在 Update File 後面，表示改名。
const PATCH_HEADER = /^\*\*\* (Add|Update|Delete) File: (.+)$|^\*\*\* Move to: (.+)$/;
const PATCH_OPS: Record<string, string> = { Add: "Create", Update: "Update", Delete: "Delete" };

/**
 * 從 apply_patch 的 patch 文字取出它動到的檔案（依出現順序、同路徑只留一筆）。
 * 改名記成新路徑：舊路徑已不存在，git diff 也只會在新路徑上看到變更。
 */
export function filesFromPatch(patch: string): { op: string; path: string }[] {
  const out: { op: string; path: string }[] = [];
  for (const raw of patch.split("\n")) {
    const m = PATCH_HEADER.exec(raw.trimEnd());
    if (!m) continue;
    if (m[3]) {
      const last = out[out.length - 1];
      if (last) last.path = m[3].trim();
      continue;
    }
    const path = m[2].trim();
    if (path && !out.some((f) => f.path === path)) out.push({ op: PATCH_OPS[m[1]], path });
  }
  return out;
}

/** 審批提示：工具名 + 最能辨識這次動作的參數（指令或檔案路徑）。 */
function summarizePermission(toolName: string, toolInput: unknown): string {
  let detail: string | undefined;
  if (isRecord(toolInput)) {
    // patch 文字本身（*** Begin Patch …）在提示列上沒有意義，改列它動到的檔案。
    const patchFiles =
      toolName === "apply_patch" && typeof toolInput.command === "string"
        ? filesFromPatch(toolInput.command).map((f) => f.path)
        : [];
    detail =
      (patchFiles.length > 0 ? patchFiles.join(", ") : undefined) ??
      str(toolInput.command) ??
      filePathOf(toolInput) ??
      str(toolInput.description);
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
    // token 數在 context_window.current_usage 底下；該物件在首次 API 呼叫前、
    // 以及 /compact 後到下次呼叫前都是 null，故要自己的守衛。
    const cu = ctx && isRecord(ctx.current_usage) ? ctx.current_usage : undefined;
    const usage = {
      cost,
      tokensIn: cu ? num(cu.input_tokens) : undefined,
      tokensOut: cu ? num(cu.output_tokens) : undefined,
      contextLeftPercent: ctx ? num(ctx.remaining_percentage) : undefined,
      planUsage: parsePlanUsage(payload.rate_limits),
    };
    if (Object.values(usage).every((v) => v === undefined)) return undefined;
    return { kind: "usage", usage };
  }

  const event = str(payload.hook_event_name);
  const toolName = str(payload.tool_name);
  switch (event) {
    case "PermissionRequest":
      return { kind: "permission", prompt: summarizePermission(toolName ?? "?", payload.tool_input) };
    case "Stop": {
      const last = str(payload.last_assistant_message)?.trim();
      return last ? { kind: "stop", lastMessage: last.slice(0, LAST_REPLY_MAX) } : { kind: "stop" };
    }
    case "UserPromptSubmit": {
      // Claude Code 與 Codex（0.163.0 實測支援此事件）都把指令放在 prompt 欄位。
      const text = str(payload.prompt)?.trim();
      return text ? { kind: "prompt", text: text.slice(0, GOAL_MAX) } : undefined;
    }
    case "PostToolUse": {
      const op = toolName ? FILE_TOOL_OPS[toolName] : undefined;
      const input = isRecord(payload.tool_input) ? payload.tool_input : undefined;
      let touched: { op: string; path: string }[] = [];
      if (op && input) {
        const path = filePathOf(input);
        if (path) touched = [{ op, path }];
        else if (toolName === "apply_patch" && typeof input.command === "string") {
          touched = filesFromPatch(input.command);
        }
      }
      // payload.cwd is the agent CLI's live working directory for this call —
      // a better git anchor than the session's creation-time cwd snapshot,
      // and what makes Codex's workspace-relative paths resolvable.
      const cwd = str(payload.cwd);
      const tasks = taskUpdateFrom(toolName, payload.tool_input, payload.tool_response);
      return {
        kind: "toolDone",
        tool: toolName,
        files: touched.map((f) => ({ ...f, source: "hook" as const, cwd })),
        ...(tasks ? { tasks } : {}),
      };
    }
    default:
      return undefined;
  }
}
