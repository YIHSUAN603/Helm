// 從單行輸出擷取結構化資訊（純函式，方便測試）。
// 由 profile.extract 的 regex 驅動，不綁定特定工具。
import type { AgentProfile } from "./types";

export interface Extracted {
  cost?: number;
  tokensIn?: number;
  tokensOut?: number;
  file?: { op: string; path: string };
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

// k/m/b 後綴 → 倍率（Claude Code footer 會顯示 2.1k tokens 這種縮寫）。
const SUFFIX_MULTIPLIERS: Record<string, number> = {
  k: 1e3,
  m: 1e6,
  b: 1e9,
};

// 抓第一個 capture group 的數字（去掉千分位逗號，支援 k/m/b 後綴）。
function num(src: string | undefined, line: string): number | undefined {
  if (!src) return undefined;
  const re = rx(src);
  const m = re?.exec(line);
  if (!m || !m[1]) return undefined;
  let raw = m[1].replace(/,/g, "");
  const mult = SUFFIX_MULTIPLIERS[raw.slice(-1).toLowerCase()] ?? 1;
  if (mult !== 1) {
    raw = raw.slice(0, -1);
  }
  const n = parseFloat(raw) * mult;
  return Number.isFinite(n) ? n : undefined;
}

export function extractFromLine(profile: AgentProfile, line: string): Extracted {
  const e = profile.extract;
  if (!e) return {};
  const out: Extracted = {};

  const cost = num(e.cost, line);
  if (cost !== undefined) out.cost = cost;
  const ti = num(e.tokensIn, line);
  if (ti !== undefined) out.tokensIn = ti;
  const to = num(e.tokensOut, line);
  if (to !== undefined) out.tokensOut = to;

  if (e.fileChange) {
    const re = rx(e.fileChange);
    const m = re?.exec(line);
    if (m) {
      // group1=op group2=path；若只有一個 group 就當作 path。
      const op = m[2] ? m[1] : "change";
      const path = (m[2] ?? m[1] ?? "").trim();
      if (path) out.file = { op: op.trim(), path };
    }
  }
  return out;
}

export type ExtractedUsage = Pick<Extracted, "cost" | "tokensIn" | "tokensOut">;

// 從整段已渲染文字（如 xterm viewport）擷取用量統計。
// 只取 cost/tokens（idempotent 的「當前狀態」），不取 fileChange（append 事件，
// 留在 stream 路徑處理）。逐行掃描，後面的行覆蓋前面的（footer 靠近底部）。
export function extractUsageFromText(profile: AgentProfile, text: string): ExtractedUsage {
  const out: ExtractedUsage = {};
  if (!profile.extract) return out;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const cost = num(profile.extract.cost, line);
    if (cost !== undefined) out.cost = cost;
    const ti = num(profile.extract.tokensIn, line);
    if (ti !== undefined) out.tokensIn = ti;
    const to = num(profile.extract.tokensOut, line);
    if (to !== undefined) out.tokensOut = to;
  }
  return out;
}
