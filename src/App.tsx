import { useEffect, useMemo, type CSSProperties } from "react";
import { Terminal } from "./components/Terminal/Terminal";
import { SessionSidebar } from "./components/SessionSidebar/SessionSidebar";
import { ApprovalPanel } from "./components/ApprovalPanel/ApprovalPanel";
import { Toolbar } from "./components/Toolbar/Toolbar";
import { ChangedFilesPanel } from "./components/ChangedFilesPanel/ChangedFilesPanel";
import { PaneLabel } from "./components/PaneLabel/PaneLabel";
import { SplitResizers } from "./components/SplitLayout/SplitResizers";
import { notifyPendingApproval, useSessionStore } from "./store/sessions";
import {
  clearApprovalSuppress,
  isApprovalSuppressed,
  markApprovalAnswered,
} from "./store/approvalSuppress";
import { useThemeStore } from "./store/theme";
import { groupTreeOf, useLayoutStore } from "./store/layout";
import { computeLayout, type RectPct } from "./store/layoutTree";
import { CommandPalette } from "./components/CommandPalette/CommandPalette";
import { SettingsDialog } from "./components/SettingsDialog/SettingsDialog";
import { matchBinding } from "./commands/keymap";
import { runCommand } from "./commands/registry";
import { listen } from "@tauri-apps/api/event";
import { ensureNotifyPermission } from "./ipc/notify";
import { setMenuLanguage } from "./ipc/menu";
import { checkForUpdate, downloadAndInstallUpdate } from "./ipc/update";
import { useUpdateStore } from "./store/update";
import { useLanguageStore } from "./store/language";
import { initRegistry, detectProfile, getProfile } from "./agents/registry";
import { deriveState, stripAnsi } from "./agents/engine";
import { extractFromLine } from "./agents/extract";
import { useT } from "./i18n";
import "./App.css";

// 只在整個 app 生命週期做一次啟動流程。
let bootstrapped = false;

// 每個 session 的殘餘半行，逐行擷取用。
const lineBuffers = new Map<string, string>();

// Consecutive non-waiting scans per session while an approval is pending.
// The TUI redraws constantly and a scan can catch a mid-redraw frame with the
// menu row absent; a single divergent scan must not clear the approval (that
// flapping is what caused the notification storm).
const nonWaitingStreak = new Map<string, number>();

// 啟動時自動檢查並安裝更新，找到新版本就直接下載、安裝、重啟，無需使用者互動。
async function checkAndInstallUpdate(): Promise<void> {
  const { setPhase } = useUpdateStore.getState();
  setPhase("checking");
  const update = await checkForUpdate();
  if (!update) {
    setPhase("up-to-date");
    return;
  }
  try {
    setPhase("downloading", update.version);
    await downloadAndInstallUpdate(update);
    setPhase("relaunching", update.version);
  } catch {
    setPhase("error", update.version);
  }
}

// 未分組 session 的全幅 rect（與群組 leaf rect 走同一條 inline style 路徑）。
const FULL_RECT: RectPct = { top: 0, left: 0, width: 100, height: 100 };

// leaf rect（百分比）→ pane 的 inline style。
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
  if (!sess) {
    lineBuffers.delete(id);
    nonWaitingStreak.delete(id);
    clearApprovalSuppress(id);
    return;
  }
  let profileId = sess.agentId;
  if (!profileId) {
    const p = detectProfile(text);
    if (!p) return;
    store.setDetectedAgent(id, p.id, p.label);
    profileId = p.id;
  }
  const derived = deriveState(getProfile(profileId), text);
  if (derived.state === "waiting") {
    // Just-answered prompt still on screen (TUI mid-repaint): don't resurrect
    // the approval the user already responded to. A different prompt passes.
    if (isApprovalSuppressed(id, derived.prompt ?? "", Date.now())) {
      return;
    }
    nonWaitingStreak.delete(id);
    store.setAgentState(id, derived.state, derived.prompt);
    return;
  }
  // Pending approval + non-waiting result: drop the first divergent scan as a
  // possibly-stale redraw frame; apply only on the second consecutive one.
  // This delays clearing, never setting, so real approvals are unaffected.
  if (sess.pendingApproval) {
    const streak = (nonWaitingStreak.get(id) ?? 0) + 1;
    if (streak < 2) {
      nonWaitingStreak.set(id, streak);
      return;
    }
    // The dialog left the screen without a panel response — the user answered
    // inside the terminal. Record it so a stale copy of the same prompt
    // resurfacing (e.g. a resize reflow) cannot resurrect the approval,
    // matching the explicit-response path in respondApproval.
    markApprovalAnswered(id, sess.pendingApproval, Date.now());
  }
  nonWaitingStreak.delete(id);
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
  if (!sess) {
    lineBuffers.delete(id);
    return;
  }
  if (!sess.agentId) return;
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
  const t = useT();
  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.activeId);
  const setActive = useSessionStore((s) => s.setActive);
  const setTitle = useSessionStore((s) => s.setTitle);
  const setStatus = useSessionStore((s) => s.setStatus);
  const theme = useThemeStore((s) => s.name);
  const trees = useLayoutStore((s) => s.trees);
  // 只渲染 active session 所在群組的樹；其他 session 的 pane 拿不到
  // rect → data-in-layout="false" 隱藏（Terminal 保持掛載）。
  // active session 未分組時 layoutRoot 為 null → 該 pane 拿全幅 rect。
  const layoutRoot = groupTreeOf(trees, activeId);

  // 群組樹 → 每個 leaf 的百分比 rect + 分隔線幾何。
  const layout = useMemo(
    () =>
      layoutRoot
        ? computeLayout(layoutRoot)
        : { leaves: new Map<string, RectPct>(), resizers: [] },
    [layoutRoot],
  );

  // 全域快捷鍵：keymap 比對 → 命令派發。capture phase：搶在 xterm 的按鍵處理之前。
  // 注意：macOS WKWebView 會在原生層吞掉部分 Cmd 組合鍵（實測 ⌘D 到不了 DOM，
  // 選單 accelerator 在 webview 有焦點時也不會觸發），所以綁定必須挑實測可達
  // DOM 的組合（見 src/commands/keymap.ts）；選單項（見 lib.rs）提供可發現性與滑鼠入口。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const id = matchBinding(e);
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      runCommand(id);
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
      // 啟動時把已持久化的語言同步給原生選單（Rust 端預設建置為 zh-TW）。
      void setMenuLanguage(useLanguageStore.getState().name);
      // 原生選單 accelerator → 命令派發（純瀏覽器環境會 reject，忽略）。
      listen<string>("app://shortcut", (e) => runCommand(e.payload)).catch(() => {});
      // Notifications are suppressed while the window is focused (the
      // ApprovalPanel is visible then); on blur, send them for approvals
      // still pending. Dedupe in notifyPendingApproval stops alt-tab spam.
      window.addEventListener("blur", () => {
        for (const s of useSessionStore.getState().sessions) {
          notifyPendingApproval(s);
        }
      });
      // 每次啟動都是全新配置：一個預設 workspace + 一個新 session。
      useSessionStore.getState().createSession();
      void checkAndInstallUpdate();
    })();
  }, []);

  return (
    <div className="app" data-theme={theme}>
      <SessionSidebar />
      <main className="app-body">
        <Toolbar />
        {/* 同一組 pane 始終掛載；可見性只靠 data 屬性 + inline style 切換，避免重建終端。
            群組樹只算幾何，rect 以 inline style 套在平鋪 pane 上（不在群組中的隱藏）；
            未分組的 active session 拿全幅 rect（data-solo 只去除邊框，標題列一律顯示）。 */}
        <div className="terminal-area" data-focus-region="terminal">
          {sessions.map((s) => {
            const rect =
              layout.leaves.get(s.id) ??
              (layoutRoot === null && s.id === activeId ? FULL_RECT : undefined);
            return (
            <div
              key={s.id}
              className={`pane ${s.id === activeId ? "focused" : ""}`}
              data-active={s.id === activeId}
              data-in-layout={rect ? "true" : "false"}
              data-solo={layoutRoot === null && s.id === activeId}
              style={rect ? rectStyle(rect) : undefined}
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
          {layoutRoot !== null && <SplitResizers resizers={layout.resizers} />}
          {sessions.length === 0 && (
            <div className="empty-hint">{t("app.emptyHint")}</div>
          )}
          <ApprovalPanel />
          <ChangedFilesPanel />
        </div>
      </main>
      <CommandPalette />
      <SettingsDialog />
    </div>
  );
}

export default App;
