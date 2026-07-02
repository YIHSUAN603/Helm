// Agent 狀態推導（純函式，方便單元測試）。
// 輸入是「近期已渲染的終端文字」（由 Terminal 從 xterm buffer 取，對 TUI 重繪較穩）。
import type { AgentProfile, AgentState } from "./types";

export interface DerivedState {
  state?: AgentState;
  /** waiting 時擷取到的提示行，供審批面板顯示。 */
  prompt?: string;
}

// 移除 ANSI escape / OSC / 其他控制字元，保留可讀文字（含換行）。
// OSC: ESC ] ... (BEL 或 ESC \) 結尾
const OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
// CSI / 其他 ESC 序列
const CSI = /\x1b[[\]()#;?]*[0-9;]*[0-9A-Za-z@=><]/g;
// 保留 \n \t，其餘 C0/DEL 控制字元移除
const CTRL = /[\x00-\x08\x0b-\x1f\x7f]/g;

export function stripAnsi(text: string): string {
  return text.replace(OSC, "").replace(CSI, "").replace(CTRL, "");
}

const cache = new Map<string, RegExp>();
function rx(src: string): RegExp | null {
  let re = cache.get(src);
  if (!re) {
    try {
      re = new RegExp(src, "i");
      cache.set(src, re);
    } catch {
      return null;
    }
  }
  return re;
}

function test(src: string | undefined, text: string): boolean {
  if (!src) return false;
  const re = rx(src);
  return re ? re.test(text) : false;
}

/**
 * 依 profile pattern 從近期文字推導狀態。
 * 優先序：waiting > error > tool > thinking > done。
 */
export function deriveState(profile: AgentProfile, text: string): DerivedState {
  const clean = stripAnsi(text);
  const s = profile.states;

  if (test(s.waiting, clean) && !test(s.ignore, clean)) {
    return { state: "waiting", prompt: extractPromptLine(clean, s.waiting!) };
  }
  if (test(s.error, clean)) return { state: "error" };
  if (test(s.tool, clean)) return { state: "tool" };
  if (test(s.thinking, clean)) return { state: "thinking" };
  if (test(s.done, clean)) return { state: "done" };
  return {};
}

// 取最後一條符合 waiting pattern 的非空行當作提示。
function extractPromptLine(clean: string, waitingSrc: string): string {
  const re = rx(waitingSrc);
  const lines = clean
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (re) {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (re.test(lines[i])) return lines[i].slice(0, 200);
    }
  }
  return lines[lines.length - 1]?.slice(0, 200) ?? "等待審批";
}
