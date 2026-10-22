// Session 提醒卡（Session Brief）的純函式：活動紀錄、「離開期間」摘要與
// 「要不要跳出來」的判斷。無執行期 import，node 測試可直接載入。
//
// 卡片回答的是「回到這個 session 時，它在做什麼、我不在時發生了什麼」。
// 判斷刻意保守：離開太短或期間什麼都沒發生就不跳 —— 一張每次切換都出現的
// 卡片很快就會被當成雜訊，連真正有用的那次也一起被忽略。
import type { NotifyKind } from "./notificationCenter.ts";

/** 一次工具完成（PostToolUse hook）。files 是這次動到的路徑。 */
export interface BriefActivity {
  at: number;
  tool: string;
  files: string[];
}

/** 每個 session 保留的活動筆數上限（尾端最新）。 */
export const ACTIVITY_CAP = 50;

/** 離開多久之後回來才自動跳出提醒卡。 */
export const BRIEF_AWAY_MS = 60_000;

/** 追加一筆活動，超過上限丟最舊。回傳新陣列。 */
export function pushActivity(
  list: readonly BriefActivity[] | undefined,
  entry: BriefActivity,
): BriefActivity[] {
  const next = [...(list ?? []), entry];
  return next.length > ACTIVITY_CAP ? next.slice(next.length - ACTIVITY_CAP) : next;
}

/** 離開期間的摘要。 */
export interface SinceSummary {
  /** 工具名 → 次數，次數多的在前（同次數保留首次出現順序）。 */
  tools: { tool: string; count: number }[];
  /** 動到的不重複檔案數。 */
  files: number;
  /** 通知中心這個 session 的事件，依類型計數。 */
  alerts: Partial<Record<NotifyKind, number>>;
}

/**
 * 只看 `since` 之後（不含）的活動與通知。`since` 為 undefined（手動打開、
 * 沒有離開時間）時總結全部 —— 那時使用者要的是「到目前為止」。
 */
export function summarizeSince(
  activities: readonly BriefActivity[],
  notifications: readonly { kind: NotifyKind; createdAt: number }[],
  since: number | undefined,
): SinceSummary {
  const after = (at: number) => since === undefined || at > since;
  const counts = new Map<string, number>();
  const paths = new Set<string>();
  for (const a of activities) {
    if (!after(a.at)) continue;
    counts.set(a.tool, (counts.get(a.tool) ?? 0) + 1);
    for (const f of a.files) paths.add(f);
  }
  const alerts: Partial<Record<NotifyKind, number>> = {};
  for (const n of notifications) {
    if (!after(n.createdAt)) continue;
    alerts[n.kind] = (alerts[n.kind] ?? 0) + 1;
  }
  // Array.prototype.sort 是穩定排序：同次數維持 Map 的插入（首次出現）順序。
  const tools = [...counts].map(([tool, count]) => ({ tool, count }));
  tools.sort((a, b) => b.count - a.count);
  return { tools, files: paths.size, alerts };
}

/** 摘要裡是否真的有東西（全空就不值得佔一格）。 */
export function hasSinceContent(s: SinceSummary): boolean {
  return s.tools.length > 0 || s.files > 0 || Object.keys(s.alerts).length > 0;
}

/**
 * 回到 session 時是否自動跳出提醒卡：離開夠久，而且離開之後確實有事發生
 * （`latestEventAt` 為目標、狀態轉移、工具活動、通知中最晚的一個時間）。
 */
export function shouldShowBrief(input: {
  leftAt: number | undefined;
  now: number;
  latestEventAt: number | undefined;
}): boolean {
  const { leftAt, now, latestEventAt } = input;
  if (leftAt === undefined || latestEventAt === undefined) return false;
  return now - leftAt >= BRIEF_AWAY_MS && latestEventAt > leftAt;
}

/** 多個可能缺席的時間戳取最晚者；全缺回 undefined。 */
export function latestOf(...times: (number | undefined)[]): number | undefined {
  let out: number | undefined;
  for (const t of times) {
    if (t !== undefined && (out === undefined || t > out)) out = t;
  }
  return out;
}

/**
 * 經過時間 → 粗略單位（給 i18n 套字）。只取一個最大單位：卡片要的是「大概
 * 多久」，不是精確時長。
 */
export function elapsedParts(ms: number): { unit: "s" | "m" | "h" | "d"; n: number } {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return { unit: "s", n: s };
  const m = Math.floor(s / 60);
  if (m < 60) return { unit: "m", n: m };
  const h = Math.floor(m / 60);
  if (h < 24) return { unit: "h", n: h };
  return { unit: "d", n: Math.floor(h / 24) };
}
