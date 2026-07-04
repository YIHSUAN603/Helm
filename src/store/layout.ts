// Split 版面樹的狀態管理。樹只算幾何，Terminal pane 本體由 App.tsx 平鋪渲染。
// 結構變更（split/close/swap）立即持久化；ratio 只在拖曳結束（commit）時寫。
import { create } from "zustand";
import {
  buildBalancedTree,
  computeLayout,
  findLeafBySession,
  leaf,
  pruneMissingSessions,
  removeLeafBySession,
  setRatio as setTreeRatio,
  splitLeaf,
  swapLeafSession,
  type LayoutNode,
  type SplitDir,
} from "./layoutTree";
import { persistLayout } from "../ipc/persist";

/** pane 最小尺寸（px），拖曳 clamp 與分割前檢查共用。 */
export const MIN_PANE_W = 120;
export const MIN_PANE_H = 80;

/** 量 terminal-area 的實際 px 尺寸（分割前檢查用；量不到就不擋）。 */
function areaSize(): { width: number; height: number } | null {
  const el = document.querySelector(".terminal-area");
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { width: r.width, height: r.height } : null;
}

interface LayoutState {
  root: LayoutNode | null;
  /** 分割後的兩半是否都還夠大（量不到 DOM 時放行）。 */
  canSplitPane: (sessionId: string, dir: SplitDir) => boolean;
  /** 把 newSessionId 分割進 sessionId 的 leaf；session 不在樹中時先成為 root。 */
  splitPane: (sessionId: string, dir: SplitDir, newSessionId: string) => void;
  /** 不在樹中的 session 換入目前 focused 的 leaf（樹空則成為 root）。 */
  attachSession: (sessionId: string, focusedSessionId: string | null) => void;
  /** session 關閉時收合對應 leaf（不在樹中則 no-op）。 */
  removeSession: (sessionId: string) => void;
  setRatio: (splitId: string, ratio: number, commit: boolean) => void;
  /** 樹為空時用現有 sessions 自動平衡排列（首次切到 split 模式）。 */
  ensureTree: (sessionIds: string[]) => void;
  restore: (root: LayoutNode | null) => void;
}

export const useLayoutStore = create<LayoutState>((set, get) => {
  const commit = (root: LayoutNode | null) => {
    set({ root });
    void persistLayout(root);
  };

  return {
    root: null,

    canSplitPane: (sessionId, dir) => {
      const { root } = get();
      if (!root) return true;
      const target = findLeafBySession(root, sessionId);
      if (!target) return true;
      const size = areaSize();
      if (!size) return true;
      const rect = computeLayout(root).leaves.get(sessionId);
      if (!rect) return true;
      // rect 是百分比 → 換回 px，分割後兩半各需容得下最小尺寸。
      return dir === "row"
        ? (rect.width / 100) * size.width >= MIN_PANE_W * 2
        : (rect.height / 100) * size.height >= MIN_PANE_H * 2;
    },

    splitPane: (sessionId, dir, newSessionId) => {
      const { root } = get();
      if (!root || !findLeafBySession(root, sessionId)) {
        // 目標不在樹中（例如剛從 single 模式切過來）→ 先以它為 root 再分割。
        const base = leaf(sessionId);
        commit(splitLeaf(base, base.id, dir, newSessionId));
        return;
      }
      const target = findLeafBySession(root, sessionId)!;
      commit(splitLeaf(root, target.id, dir, newSessionId));
    },

    attachSession: (sessionId, focusedSessionId) => {
      const { root } = get();
      if (findLeafBySession(root, sessionId)) return;
      if (!root) {
        commit(leaf(sessionId));
        return;
      }
      const target = focusedSessionId
        ? findLeafBySession(root, focusedSessionId)
        : null;
      if (target) {
        commit(swapLeafSession(root, target.id, sessionId));
      }
      // 沒有 focused leaf 可換 → 留在樹外（sidebar 點選時再換入）。
    },

    removeSession: (sessionId) => {
      const { root } = get();
      if (!root || !findLeafBySession(root, sessionId)) return;
      commit(removeLeafBySession(root, sessionId));
    },

    setRatio: (splitId, ratio, commitNow) => {
      const { root } = get();
      if (!root) return;
      const next = setTreeRatio(root, splitId, ratio);
      if (commitNow) commit(next);
      else set({ root: next });
    },

    ensureTree: (sessionIds) => {
      if (get().root) return;
      commit(buildBalancedTree(sessionIds));
    },

    restore: (root) => set({ root }),
  };
});

export { pruneMissingSessions };
export type { LayoutNode, SplitDir };
