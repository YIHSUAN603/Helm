// Split 版面樹的狀態管理。每個 workspace 一棵樹（forest），樹只算幾何，
// Terminal pane 本體由 App.tsx 平鋪渲染（只渲染 focused workspace 的樹）。
import { create } from "zustand";
import {
  attachSessionToTree,
  buildBalancedTree,
  computeLayout,
  findLeafBySession,
  leaf,
  removeLeafBySession,
  setRatio as setTreeRatio,
  splitLeaf,
  type LayoutNode,
  type SplitDir,
} from "./layoutTree";

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
  /** workspaceId → 該 workspace 的版面樹（不變量：session 只出現在自己 workspace 的樹）。 */
  trees: Record<string, LayoutNode | null>;
  /** 分割後的兩半是否都還夠大（量不到 DOM 時放行）。 */
  canSplitPane: (workspaceId: string, sessionId: string, dir: SplitDir) => boolean;
  /** 把 newSessionId 分割進 sessionId 的 leaf；session 不在樹中時先成為 root。 */
  splitPane: (
    workspaceId: string,
    sessionId: string,
    dir: SplitDir,
    newSessionId: string,
  ) => void;
  /** 不在樹中的 session 換入 focused 的 leaf（無 focused 則分割第一個 leaf；樹空則成為 root）。 */
  attachSession: (
    workspaceId: string,
    sessionId: string,
    focusedSessionId: string | null,
  ) => void;
  /** session 關閉或搬離 workspace 時收合對應 leaf（搜尋所有樹；不在樹中則 no-op）。 */
  removeSession: (sessionId: string) => void;
  setRatio: (splitId: string, ratio: number) => void;
  /** 該 workspace 樹為空時用其 sessions 自動平衡排列（首次進 split 模式）。 */
  ensureTree: (workspaceId: string, sessionIds: string[]) => void;
  /** workspace 被刪除時清掉對應的樹。 */
  dropTree: (workspaceId: string) => void;
}

export const useLayoutStore = create<LayoutState>((set, get) => {
  const treeOf = (workspaceId: string): LayoutNode | null =>
    get().trees[workspaceId] ?? null;
  const commit = (workspaceId: string, root: LayoutNode | null) =>
    set((s) => ({ trees: { ...s.trees, [workspaceId]: root } }));

  return {
    trees: {},

    canSplitPane: (workspaceId, sessionId, dir) => {
      const root = treeOf(workspaceId);
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

    splitPane: (workspaceId, sessionId, dir, newSessionId) => {
      const root = treeOf(workspaceId);
      if (!root || !findLeafBySession(root, sessionId)) {
        // 目標不在樹中（例如剛從 single 模式切過來）→ 先以它為 root 再分割。
        const base = leaf(sessionId);
        commit(workspaceId, splitLeaf(base, base.id, dir, newSessionId));
        return;
      }
      const target = findLeafBySession(root, sessionId)!;
      commit(workspaceId, splitLeaf(root, target.id, dir, newSessionId));
    },

    attachSession: (workspaceId, sessionId, focusedSessionId) => {
      const root = treeOf(workspaceId);
      const next = attachSessionToTree(root, sessionId, focusedSessionId);
      if (next !== root) commit(workspaceId, next);
    },

    removeSession: (sessionId) => {
      // session id 全域唯一，至多命中一棵樹。
      for (const [workspaceId, root] of Object.entries(get().trees)) {
        if (root && findLeafBySession(root, sessionId)) {
          commit(workspaceId, removeLeafBySession(root, sessionId));
          return;
        }
      }
    },

    setRatio: (splitId, ratio) => {
      // split node id 全域唯一（UUID），至多命中一棵樹。
      for (const [workspaceId, root] of Object.entries(get().trees)) {
        if (!root) continue;
        const next = setTreeRatio(root, splitId, ratio);
        if (next !== root) {
          commit(workspaceId, next);
          return;
        }
      }
    },

    ensureTree: (workspaceId, sessionIds) => {
      if (treeOf(workspaceId)) return;
      commit(workspaceId, buildBalancedTree(sessionIds));
    },

    dropTree: (workspaceId) => {
      set((s) => {
        const { [workspaceId]: _dropped, ...rest } = s.trees;
        return { trees: rest };
      });
    },
  };
});

export type { LayoutNode, SplitDir };
