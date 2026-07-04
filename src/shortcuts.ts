// 版面快捷鍵的動作本體。
// Tauri 內：由原生選單 accelerator 觸發（macOS 的 Cmd 組合鍵到不了 DOM，
// 見 src-tauri/src/lib.rs 的選單註冊）；純瀏覽器（vite dev）才走 DOM keydown。
import { useSessionStore } from "./store/sessions";
import { useLayoutStore } from "./store/layout";
import { useUiStore } from "./store/ui";
import type { SplitDir } from "./store/layoutTree";

export function runShortcut(id: string): void {
  const store = useSessionStore.getState();
  const active = store.activeId;
  if (!active) return;

  if (id === "layout:split-right" || id === "layout:split-down") {
    const dir: SplitDir = id === "layout:split-right" ? "row" : "column";
    const layout = useLayoutStore.getState();
    // single 模式下分割 → 自動切到 split。
    useUiStore.getState().setViewMode("split");
    if (!layout.canSplitPane(active, dir)) return;
    const newId = store.createSession();
    layout.splitPane(active, dir, newId);
  } else if (id === "layout:close-pane") {
    store.closeSession(active);
  }
}
