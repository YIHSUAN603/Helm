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

// 抓第一個 capture group 的數字（去掉千分位逗號）。
function num(src: string | undefined, line: string): number | undefined {
  if (!src) return undefined;
  const re = rx(src);
  const m = re?.exec(line);
  if (!m || !m[1]) return undefined;
  const n = parseFloat(m[1].replace(/,/g, ""));
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
