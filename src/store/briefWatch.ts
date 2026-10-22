// 提醒卡的觸發接線：追蹤哪些 session「在畫面上」，離開時記下時間，回來時用
// sessionBrief.ts 的純判斷決定要不要跳卡。
//
// 「在畫面上」= active session 所在分割群組的全部成員（未分組時就是它自己），
// 與 App.tsx 決定哪些 pane 拿得到 rect 的規則相同。視窗失焦也算離開：使用者
// 切去別的視窗半小時再回來，正是最需要這張卡的時候。
import { useSessionStore } from "./sessions";
import { groupTreeOf, useLayoutStore } from "./layout";
import { collectSessionIds, type LayoutNode } from "./layoutTree";
import { useNotificationsStore } from "./notifications";
import { useSettingsStore } from "./settings";
import { useBriefStore } from "./briefs";
import { latestOf, shouldShowBrief } from "./sessionBrief";

function visibleSessionIds(
  trees: Record<string, LayoutNode>,
  activeId: string | null,
): string[] {
  if (!activeId) return [];
  const tree = groupTreeOf(trees, activeId);
  return tree ? collectSessionIds(tree) : [activeId];
}

/** 這個 session 最近一次「有事發生」的時間（目標、狀態轉移、工具活動、通知）。 */
function latestEventAt(id: string): number | undefined {
  const s = useSessionStore.getState().sessions.find((x) => x.id === id);
  if (!s) return undefined;
  const activity = useBriefStore.getState().activity[id];
  let lastAlert: number | undefined;
  for (const n of useNotificationsStore.getState().items) {
    if (n.sessionId === id) lastAlert = latestOf(lastAlert, n.createdAt);
  }
  return latestOf(s.goal?.at, s.stateSince, activity?.[activity.length - 1]?.at, lastAlert);
}

/** session 回到畫面：消費它的離開時間；是 active 的那個才考慮跳卡。 */
function onReturn(id: string, isActive: boolean, now: number): void {
  const leftAt = useBriefStore.getState().consumeLeft(id);
  if (!isActive || !useSettingsStore.getState().sessionBrief) return;
  if (shouldShowBrief({ leftAt, now, latestEventAt: latestEventAt(id) })) {
    useBriefStore.getState().show({ sessionId: id, since: leftAt });
  }
}

/** 開始追蹤；回傳取消函式。開機時呼叫一次。 */
export function startBriefWatch(): () => void {
  let prevActive = useSessionStore.getState().activeId;
  let prevTrees = useLayoutStore.getState().trees;
  let prevVisible = visibleSessionIds(prevTrees, prevActive);

  const onLayoutChange = () => {
    const activeId = useSessionStore.getState().activeId;
    const trees = useLayoutStore.getState().trees;
    // session store 跑在 PTY 輸出頻率：只有 activeId / trees 換了才往下算。
    if (activeId === prevActive && trees === prevTrees) return;
    const now = Date.now();
    const visible = visibleSessionIds(trees, activeId);
    const brief = useBriefStore.getState();
    brief.markLeft(
      prevVisible.filter((id) => !visible.includes(id)),
      now,
    );
    // 卡片屬於使用者正在看的那個 session；切走就收起來。
    if (brief.open && brief.open.sessionId !== activeId) brief.close();
    for (const id of visible) {
      if (!prevVisible.includes(id)) onReturn(id, id === activeId, now);
    }
    prevActive = activeId;
    prevTrees = trees;
    prevVisible = visible;
  };

  const onBlur = () => useBriefStore.getState().markLeft(prevVisible, Date.now());
  const onFocus = () => {
    const now = Date.now();
    for (const id of prevVisible) onReturn(id, id === prevActive, now);
  };

  const unsubSessions = useSessionStore.subscribe(onLayoutChange);
  const unsubLayout = useLayoutStore.subscribe(onLayoutChange);
  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", onFocus);
  return () => {
    unsubSessions();
    unsubLayout();
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("focus", onFocus);
  };
}
