import { useEffect, useMemo, type CSSProperties } from "react";
import { Terminal } from "./components/Terminal/Terminal";
import { SessionSidebar } from "./components/SessionSidebar/SessionSidebar";
import { ApprovalPanel } from "./components/ApprovalPanel/ApprovalPanel";
import { Toolbar } from "./components/Toolbar/Toolbar";
import { ChangedFilesPanel } from "./components/ChangedFilesPanel/ChangedFilesPanel";
import { PaneLabel } from "./components/PaneLabel/PaneLabel";
import { SplitResizers } from "./components/SplitLayout/SplitResizers";
import { useSessionStore } from "./store/sessions";
import { useThemeStore } from "./store/theme";
import { useUiStore } from "./store/ui";
import { useLayoutStore } from "./store/layout";
import { computeLayout, pruneMissingSessions, type RectPct } from "./store/layoutTree";
import { loadSessions, loadLayout } from "./ipc/persist";
import { runShortcut } from "./shortcuts";
import { listen } from "@tauri-apps/api/event";
import { ensureNotifyPermission } from "./ipc/notify";
import { initRegistry, detectProfile, getProfile } from "./agents/registry";
import { deriveState, stripAnsi } from "./agents/engine";
import { extractFromLine } from "./agents/extract";
import "./App.css";

// 只在整個 app 生命週期做一次啟動流程。
let bootstrapped = false;

// 每個 session 的殘餘半行，逐行擷取用。
const lineBuffers = new Map<string, string>();

// split 模式下 leaf rect（百分比）→ pane 的 inline style。
function rectStyle(rect: RectPct): CSSProperties {
  return {
    top: `${rect.top}%`,
    left: `${rect.left}%`,
    width: `${rect.width}%`,
    height: `${rect.height}%`,
  };
}

// 近期渲染文字 → 偵測 agent 並推導狀態，更新 store。
function handleScan(id: string, text: string) {
  const store = useSessionStore.getState();
  const sess = store.sessions.find((x) => x.id === id);
  if (!sess) return;
  let profileId = sess.agentId;
  if (!profileId) {
    const p = detectProfile(text);
    if (!p) return;
    store.setDetectedAgent(id, p.id, p.label);
    profileId = p.id;
  }
  const derived = deriveState(getProfile(profileId), text);
  if (derived.state) {
    store.setAgentState(id, derived.state, derived.prompt);
  } else if (sess.pendingApproval) {
    store.clearApproval(id);
  }
}

// 原始輸出串流 → 逐行擷取成本/用量/檔案變更。
function handleStream(id: string, text: string) {
  const store = useSessionStore.getState();
  const sess = store.sessions.find((x) => x.id === id);
  if (!sess?.agentId) return;
  const profile = getProfile(sess.agentId);
  if (!profile.extract) return;

  let buf = (lineBuffers.get(id) ?? "") + text;
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";
  if (buf.length > 4000) buf = buf.slice(-4000);
  lineBuffers.set(id, buf);

  for (const raw of lines) {
    const line = stripAnsi(raw);
    if (!line.trim()) continue;
    const ex = extractFromLine(profile, line);
    if (ex.cost !== undefined || ex.tokensIn !== undefined || ex.tokensOut !== undefined) {
      store.setUsage(id, { cost: ex.cost, tokensIn: ex.tokensIn, tokensOut: ex.tokensOut });
    }
    if (ex.file) store.addChangedFile(id, ex.file);
  }
}

function App() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.activeId);
  const setActive = useSessionStore((s) => s.setActive);
  const setTitle = useSessionStore((s) => s.setTitle);
  const setStatus = useSessionStore((s) => s.setStatus);
  const theme = useThemeStore((s) => s.name);
  const viewMode = useUiStore((s) => s.viewMode);
  const layoutRoot = useLayoutStore((s) => s.root);

  // split 版面樹 → 每個 leaf 的百分比 rect + 分隔線幾何（single 模式不用）。
  const layout = useMemo(
    () =>
      layoutRoot
        ? computeLayout(layoutRoot)
        : { leaves: new Map<string, RectPct>(), resizers: [] },
    [layoutRoot],
  );

  // 快捷鍵：⌘\ 右分割、⌘⇧D 下分割、⌘⇧W 關閉 focused pane。
  // capture phase：搶在 xterm 的按鍵處理之前。
  // 注意：macOS WKWebView 會在原生層吞掉部分 Cmd 組合鍵（實測 ⌘D 到不了 DOM，
  // 選單 accelerator 在 webview 有焦點時也不會觸發），所以綁定必須挑實測可達
  // DOM 的組合；選單項（見 lib.rs）提供可發現性與滑鼠入口。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "\\") {
        e.preventDefault();
        e.stopPropagation();
        runShortcut("layout:split-right");
      } else if (key === "d" && e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        runShortcut("layout:split-down");
      } else if (key === "w" && e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        runShortcut("layout:close-pane");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    if (bootstrapped) return;
    bootstrapped = true;
    (async () => {
      await initRegistry();
      void ensureNotifyPermission();
      // 原生選單 accelerator → 版面快捷鍵（純瀏覽器環境會 reject，忽略）。
      listen<string>("app://shortcut", (e) => runShortcut(e.payload)).catch(() => {});
      const restored = await loadSessions();
      const store = useSessionStore.getState();
      if (restored.length > 0) store.restoreSessions(restored);
      else store.createSession();
      // 還原 split 版面樹：清掉指向已不存在 session 的 leaf。
      const tree = await loadLayout();
      const validIds = new Set(useSessionStore.getState().sessions.map((s) => s.id));
      useLayoutStore.getState().restore(pruneMissingSessions(tree, validIds));
      // split 模式但樹為空（首次或被 prune 光）→ 自動平衡排列。
      if (useUiStore.getState().viewMode === "split") {
        useLayoutStore.getState().ensureTree([...validIds]);
      }
    })();
  }, []);

  return (
    <div className="app" data-theme={theme}>
      <SessionSidebar />
      <main className="app-body">
        <Toolbar />
        {/* 同一組 pane 始終掛載；single/split 只靠 class + inline style 切換，避免重建終端。
            split 模式：版面樹只算幾何，rect 以 inline style 套在平鋪 pane 上（不在樹中的隱藏）。 */}
        <div className={`terminal-area ${viewMode}`}>
          {sessions.map((s) => {
            const rect = layout.leaves.get(s.id);
            return (
            <div
              key={s.id}
              className={`pane ${s.id === activeId ? "focused" : ""}`}
              data-active={s.id === activeId}
              data-in-layout={rect ? "true" : "false"}
              style={viewMode === "split" && rect ? rectStyle(rect) : undefined}
              onMouseDown={() => setActive(s.id)}
            >
              <PaneLabel session={s} />
              <Terminal
                id={s.id}
                focused={s.id === activeId}
                launchCommand={s.launchCommand}
                onTitle={(t) => setTitle(s.id, t)}
                onBusy={() => setStatus(s.id, "busy")}
                onIdle={() => setStatus(s.id, "idle")}
                onExit={() => setStatus(s.id, "exited")}
                onScan={(text) => handleScan(s.id, text)}
                onStream={(text) => handleStream(s.id, text)}
              />
            </div>
            );
          })}
          {viewMode === "split" && <SplitResizers resizers={layout.resizers} />}
          {sessions.length === 0 && (
            <div className="empty-hint">按左側 + 新增一個 session</div>
          )}
          <ApprovalPanel />
          <ChangedFilesPanel />
        </div>
      </main>
    </div>
  );
}

export default App;
