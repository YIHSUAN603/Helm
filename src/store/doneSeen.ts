// 「完成但還沒看」的純函式（node 測試：tests/done-seen.test.ts）。
//
// agent 回合結束後 agentState 停在 done，但「做完了」和「做完了、我也看過了」
// 對使用者是兩回事：前者需要去 review，後者等同閒置。沒有這個區分時，fleet
// 的 done 計數只增不減，很快就失去意義。所以 done 多帶一個 doneSeen 旗標：
// - 進入 done 的當下，若那個 pane 正在畫面上且視窗有焦點 → 直接算看過；
// - 之後只要它出現在畫面上（切過去、解除 zoom、視窗重新取得焦點）就標為看過；
// - 離開 done（新回合開始）旗標即失效，下一次 done 重新計算。
// 執行期觀測值，不持久化（agentState 本身就不持久化）。
import type { AgentState } from "../agents/types";

export interface DoneSeenLike {
  id: string;
  agentState?: AgentState;
  doneSeen?: boolean;
}

/**
 * 把 ids 中處於 done 且尚未看過的 session 標為看過。沒有任何變動時回傳
 * **同一個陣列參考** —— 呼叫端跑在 activeId / focus 變動上，新陣列會讓每個
 * 訂閱者重繪、也會排一次多餘的快照寫入。
 */
export function markDoneSeen<T extends DoneSeenLike>(
  sessions: T[],
  ids: readonly string[],
): T[] {
  if (ids.length === 0) return sessions;
  const visible = new Set(ids);
  let changed = false;
  const next = sessions.map((s) => {
    if (s.agentState !== "done" || s.doneSeen || !visible.has(s.id)) return s;
    changed = true;
    return { ...s, doneSeen: true };
  });
  return changed ? next : sessions;
}

/**
 * setAgentState 寫入的 doneSeen：留在 done 就沿用舊值（同狀態換提示不算新回合），
 * 剛進入 done 取「此刻是否正看著它」，其他狀態一律清掉。
 */
export function nextDoneSeen(
  prevState: AgentState | undefined,
  nextState: AgentState,
  prevSeen: boolean | undefined,
  lookingNow: boolean,
): boolean | undefined {
  if (nextState !== "done") return undefined;
  if (prevState === "done") return prevSeen;
  return lookingNow || undefined;
}
