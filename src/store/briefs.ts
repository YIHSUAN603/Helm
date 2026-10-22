// Session 提醒卡的執行期狀態：每個 session 的工具活動、離開時間，以及目前
// 打開的那張卡。全部只在記憶體 —— 這些是「本次執行」的觀測值，同 cost /
// changedFiles 那一側（持久化的只有 Session.goal，見 sessionSnapshotSchema）。
//
// 刻意不掛在 Session 上：活動跑在 hook 事件頻率，掛在 Session 會讓每次工具
// 完成都重建 sessions 陣列、重算快照等值比較。
import { create } from "zustand";
import { pushActivity, type BriefActivity } from "./sessionBrief";

/** 目前打開的卡片。since = 摘要「離開期間」的起點（手動打開且沒有離開紀錄時為 undefined）。 */
export interface OpenBrief {
  sessionId: string;
  since?: number;
}

interface BriefState {
  activity: Record<string, BriefActivity[]>;
  /** session 從畫面上消失（或視窗失焦）的時間；回到畫面時被消費掉。 */
  leftAt: Record<string, number>;
  open: OpenBrief | null;
  recordActivity: (id: string, entry: BriefActivity) => void;
  /** 標記離開；已有較早的離開時間就保留它（失焦後又切換 session 的情況）。 */
  markLeft: (ids: readonly string[], now: number) => void;
  /** 回到畫面：清掉離開時間，回傳被清掉的值。 */
  consumeLeft: (id: string) => number | undefined;
  show: (brief: OpenBrief) => void;
  close: () => void;
}

export const useBriefStore = create<BriefState>((set, get) => ({
  activity: {},
  leftAt: {},
  open: null,

  recordActivity: (id, entry) =>
    set((s) => ({ activity: { ...s.activity, [id]: pushActivity(s.activity[id], entry) } })),

  markLeft: (ids, now) => {
    const cur = get().leftAt;
    const fresh = ids.filter((id) => cur[id] === undefined);
    if (fresh.length === 0) return;
    const next = { ...cur };
    for (const id of fresh) next[id] = now;
    set({ leftAt: next });
  },

  consumeLeft: (id) => {
    const cur = get().leftAt;
    const at = cur[id];
    if (at === undefined) return undefined;
    const next = { ...cur };
    delete next[id];
    set({ leftAt: next });
    return at;
  },

  show: (brief) => set({ open: brief }),

  close: () => {
    if (get().open) set({ open: null });
  },
}));

/** session 關閉時丟掉它的提醒卡資料（同 clearScanState 等清理函式）。 */
export function clearBrief(id: string): void {
  const s = useBriefStore.getState();
  if (!(id in s.activity) && !(id in s.leftAt) && s.open?.sessionId !== id) return;
  const activity = { ...s.activity };
  const leftAt = { ...s.leftAt };
  delete activity[id];
  delete leftAt[id];
  useBriefStore.setState({
    activity,
    leftAt,
    open: s.open?.sessionId === id ? null : s.open,
  });
}
