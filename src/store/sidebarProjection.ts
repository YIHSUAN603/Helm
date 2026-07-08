// 側欄專用的 session 投影：只挑出側欄實際顯示的欄位，並做元素級
// memoization —— 投影欄位全都沒變時回傳「同一個陣列參照」、單一 session
// 沒變時沿用同一個元素參照。zustand selector 以 Object.is 比對結果，
// 因此 cost/token 等高頻 usage tick（不在投影欄位內）完全不會觸發側欄
// 重繪；真的變了也只換掉該 session 的元素參照，讓下游 memo 精準命中。
// 純函式 + module-level cache（側欄只有一個實例；若未來多實例需改成
// factory），無 React/Zustand 依賴，node 測試可直接載入。
// 注意：側欄新增顯示欄位時，必須同步加進 SidebarSession 與 sameProjected。
import type { Session } from "./sessions";

export type SidebarSession = Pick<
  Session,
  "id" | "title" | "status" | "workspaceId" | "agentState" | "agentLabel" | "pendingApproval"
>;

let prevInput: Session[] | null = null;
let prevOutput: SidebarSession[] = [];
let cache = new Map<string, SidebarSession>();

function sameProjected(s: Session, p: SidebarSession): boolean {
  return (
    s.id === p.id &&
    s.title === p.title &&
    s.status === p.status &&
    s.workspaceId === p.workspaceId &&
    s.agentState === p.agentState &&
    s.agentLabel === p.agentLabel &&
    s.pendingApproval === p.pendingApproval
  );
}

/** Project sessions to their sidebar-visible fields with stable references. */
export function projectSidebarSessions(sessions: Session[]): SidebarSession[] {
  if (sessions === prevInput) return prevOutput;

  // 每次以新 Map 重建 cache，只留仍存在的 id：關閉的 session 自然被清掉，
  // 不需要在 closeSession 加清理 hook。
  const nextCache = new Map<string, SidebarSession>();
  let changed = sessions.length !== prevOutput.length;
  const output = sessions.map((s, i) => {
    const prev = cache.get(s.id);
    const proj =
      prev && sameProjected(s, prev)
        ? prev
        : {
            id: s.id,
            title: s.title,
            status: s.status,
            workspaceId: s.workspaceId,
            agentState: s.agentState,
            agentLabel: s.agentLabel,
            pendingApproval: s.pendingApproval,
          };
    nextCache.set(s.id, proj);
    if (proj !== prevOutput[i]) changed = true;
    return proj;
  });

  cache = nextCache;
  prevInput = sessions;
  if (changed) prevOutput = output;
  return prevOutput;
}
