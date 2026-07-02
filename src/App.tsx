import { useEffect } from "react";
import { Terminal } from "./components/Terminal/Terminal";
import { SessionSidebar } from "./components/SessionSidebar/SessionSidebar";
import { ApprovalPanel } from "./components/ApprovalPanel/ApprovalPanel";
import { Toolbar } from "./components/Toolbar/Toolbar";
import { ChangedFilesPanel } from "./components/ChangedFilesPanel/ChangedFilesPanel";
import { useSessionStore, type Session } from "./store/sessions";
import { useThemeStore } from "./store/theme";
import { useUiStore } from "./store/ui";
import { loadSessions } from "./ipc/persist";
import { ensureNotifyPermission } from "./ipc/notify";
import { initRegistry, detectProfile, getProfile } from "./agents/registry";
import { deriveState, stripAnsi } from "./agents/engine";
import { extractFromLine } from "./agents/extract";
import "./App.css";

// 只在整個 app 生命週期做一次啟動流程。
let bootstrapped = false;

// 每個 session 的殘餘半行，逐行擷取用。
const lineBuffers = new Map<string, string>();

// pane 標題列的狀態燈：agent 狀態優先，否則活動狀態。
function dotClass(s: Session): string {
  return s.agentState ? `agent-${s.agentState}` : s.status;
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

  useEffect(() => {
    if (bootstrapped) return;
    bootstrapped = true;
    (async () => {
      await initRegistry();
      void ensureNotifyPermission();
      const restored = await loadSessions();
      const store = useSessionStore.getState();
      if (restored.length > 0) store.restoreSessions(restored);
      else store.createSession();
    })();
  }, []);

  return (
    <div className="app" data-theme={theme}>
      <SessionSidebar />
      <main className="app-body">
        <Toolbar />
        {/* 同一組 pane 始終掛載；single/grid 只靠 class 切換，避免重建終端。 */}
        <div className={`terminal-area ${viewMode}`}>
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`pane ${s.id === activeId ? "focused" : ""}`}
              data-active={s.id === activeId}
              onMouseDown={() => setActive(s.id)}
            >
              <div className="pane-label">
                <span className={`status-dot ${dotClass(s)}`} />
                <span className="pane-title">{s.title}</span>
                {s.agentLabel && <span className="pane-agent">{s.agentLabel}</span>}
              </div>
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
          ))}
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
