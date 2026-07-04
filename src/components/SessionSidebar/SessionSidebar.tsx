// Session 側欄看板：列出所有 session、狀態燈、agent 標籤、切換/新增/關閉。
// 「+」開啟 launcher 選單：一般 shell 或任何設定好的 agent。
import { useState } from "react";
import { useSessionStore, type Session } from "../../store/sessions";
import { useThemeStore } from "../../store/theme";
import { useUiStore } from "../../store/ui";
import { useLayoutStore } from "../../store/layout";
import { listLaunchers } from "../../agents/registry";
import "./SessionSidebar.css";

// 綜合狀態燈：有 agent 狀態優先，否則用活動狀態。
function dotClass(s: Session): string {
  if (s.agentState) return `agent-${s.agentState}`;
  return s.status;
}

const stateLabel: Record<string, string> = {
  "agent-thinking": "思考中",
  "agent-tool": "執行中",
  "agent-waiting": "等待審批",
  "agent-done": "完成",
  "agent-error": "錯誤",
  busy: "執行中",
  idle: "閒置",
  exited: "已結束",
};

export function SessionSidebar() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.activeId);
  const setActive = useSessionStore((s) => s.setActive);
  const createSession = useSessionStore((s) => s.createSession);
  const closeSession = useSessionStore((s) => s.closeSession);
  const theme = useThemeStore((s) => s.name);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const [menuOpen, setMenuOpen] = useState(false);

  const launchers = listLaunchers();

  // split 模式：不在版面樹中的 session 換入目前 focused 的 leaf（tmux 式）。
  const attachIfSplit = (id: string, focusedId: string | null) => {
    if (useUiStore.getState().viewMode === "split") {
      useLayoutStore.getState().attachSession(id, focusedId);
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">SESSIONS</span>
        <div className="new-menu-wrap">
          <button
            className="icon-btn"
            title="新增"
            onClick={() => setMenuOpen((v) => !v)}
          >
            +
          </button>
          {menuOpen && (
            <>
              <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="launcher-menu">
                {launchers.map((l) => (
                  <button
                    key={l.label}
                    onClick={() => {
                      const focusedId = activeId;
                      const id = createSession(l);
                      attachIfSplit(id, focusedId);
                      setMenuOpen(false);
                    }}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="session-list">
        {sessions.map((s) => {
          const cls = dotClass(s);
          return (
            <div
              key={s.id}
              className={`session-item ${s.id === activeId ? "active" : ""}`}
              onClick={() => {
                attachIfSplit(s.id, activeId);
                setActive(s.id);
              }}
            >
              <span className={`status-dot ${cls}`} title={stateLabel[cls] ?? ""} />
              <span className="session-name" title={s.title}>
                {s.title}
              </span>
              {s.agentLabel && <span className="agent-tag">{s.agentLabel}</span>}
              <button
                className="icon-btn close"
                title="關閉"
                onClick={(e) => {
                  e.stopPropagation();
                  closeSession(s.id);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <div className="sidebar-footer">
        <button className="theme-btn" onClick={toggleTheme}>
          {theme === "dark" ? "☾ Dark" : "☀ Light"}
        </button>
      </div>
    </aside>
  );
}
