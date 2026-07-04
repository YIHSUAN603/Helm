// pane 標題列：狀態燈、標題、agent 標籤 + 分割/關閉操作（split 模式顯示）。
// 分割按鈕單擊 → 新 plain shell；launcher 選單由右鍵（contextmenu）開啟。
import { useState } from "react";
import { useSessionStore, type Session } from "../../store/sessions";
import { useLayoutStore } from "../../store/layout";
import type { SplitDir } from "../../store/layoutTree";
import { listLaunchers } from "../../agents/registry";
import type { AgentLauncher } from "../../agents/types";
import "./PaneLabel.css";

// 綜合狀態燈：agent 狀態優先，否則活動狀態（同 sidebar）。
function dotClass(s: Session): string {
  return s.agentState ? `agent-${s.agentState}` : s.status;
}

export function PaneLabel({ session }: { session: Session }) {
  const closeSession = useSessionStore((s) => s.closeSession);
  // 記住要用哪個方向開 launcher 選單；null = 選單關閉。
  const [menuDir, setMenuDir] = useState<SplitDir | null>(null);

  const splitTo = (dir: SplitDir, launcher?: AgentLauncher) => {
    const layout = useLayoutStore.getState();
    if (!layout.canSplitPane(session.id, dir)) return;
    const newId = useSessionStore.getState().createSession(launcher);
    layout.splitPane(session.id, dir, newId);
  };

  return (
    <div className="pane-label">
      <span className={`status-dot ${dotClass(session)}`} />
      <span className="pane-title">{session.title}</span>
      {session.agentLabel && <span className="pane-agent">{session.agentLabel}</span>}
      <span className="pane-actions">
        <button
          title="向右分割（右鍵選 agent）"
          onClick={(e) => {
            e.stopPropagation();
            splitTo("row");
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuDir("row");
          }}
        >
          ◫
        </button>
        <button
          title="向下分割（右鍵選 agent）"
          onClick={(e) => {
            e.stopPropagation();
            splitTo("column");
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuDir("column");
          }}
        >
          ⊟
        </button>
        <button
          className="pane-close"
          title="關閉"
          onClick={(e) => {
            e.stopPropagation();
            closeSession(session.id);
          }}
        >
          ×
        </button>
      </span>
      {menuDir && (
        <>
          <div className="menu-backdrop" onClick={() => setMenuDir(null)} />
          <div className="launcher-menu pane-launcher-menu">
            {listLaunchers().map((l) => (
              <button
                key={l.label}
                onClick={() => {
                  splitTo(menuDir, l);
                  setMenuDir(null);
                }}
              >
                {l.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
