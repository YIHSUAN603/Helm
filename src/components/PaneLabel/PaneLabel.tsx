// pane 標題列：狀態燈、標題、agent 標籤 + 分割/關閉操作（split 模式顯示）。
// 分割按鈕單擊 → 新 plain shell；launcher 選單由右鍵（contextmenu）開啟，
// 鍵盤等效為 ContextMenu 鍵或 Shift+F10。
import { useEffect, useRef, useState } from "react";
import { useSessionStore, type Session } from "../../store/sessions";
import { useLayoutStore } from "../../store/layout";
import type { SplitDir } from "../../store/layoutTree";
import { listLaunchers } from "../../agents/registry";
import { handleListKey } from "../../focus/listNav";
import type { AgentLauncher } from "../../agents/types";
import "./PaneLabel.css";

// 綜合狀態燈：agent 狀態優先，否則活動狀態（同 sidebar）。
function dotClass(s: Session): string {
  return s.agentState ? `agent-${s.agentState}` : s.status;
}

function isContextMenuKey(e: React.KeyboardEvent): boolean {
  return e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey);
}

export function PaneLabel({ session }: { session: Session }) {
  const closeSession = useSessionStore((s) => s.closeSession);
  // 記住要用哪個方向開 launcher 選單；null = 選單關閉。
  const [menuDir, setMenuDir] = useState<SplitDir | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // 開啟選單的按鈕（Esc 關閉時把焦點還回去）。
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (menuDir) menuRef.current?.querySelector("button")?.focus();
  }, [menuDir]);

  const splitTo = (dir: SplitDir, launcher?: AgentLauncher) => {
    const layout = useLayoutStore.getState();
    if (!layout.canSplitPane(session.workspaceId, session.id, dir)) return;
    const newId = useSessionStore
      .getState()
      .createSession(launcher, session.workspaceId);
    layout.splitPane(session.workspaceId, session.id, dir, newId);
  };

  const openMenu = (e: React.SyntheticEvent, dir: SplitDir) => {
    e.preventDefault();
    e.stopPropagation();
    triggerRef.current = e.currentTarget as HTMLElement;
    setMenuDir(dir);
  };

  const closeMenu = (refocus: boolean) => {
    setMenuDir(null);
    if (refocus) triggerRef.current?.focus();
  };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeMenu(true);
    } else if (handleListKey(e.key, menuRef.current, "button")) {
      e.preventDefault();
    }
  };

  const splitButton = (dir: SplitDir, icon: string, title: string) => (
    <button
      title={title}
      aria-haspopup="menu"
      aria-expanded={menuDir === dir}
      onClick={(e) => {
        e.stopPropagation();
        splitTo(dir);
      }}
      onContextMenu={(e) => openMenu(e, dir)}
      onKeyDown={(e) => {
        if (isContextMenuKey(e)) openMenu(e, dir);
      }}
    >
      {icon}
    </button>
  );

  return (
    <div className="pane-label">
      <span className={`status-dot ${dotClass(session)}`} />
      <span className="pane-title">{session.title}</span>
      {session.agentLabel && <span className="pane-agent">{session.agentLabel}</span>}
      <span className="pane-actions">
        {splitButton("row", "◫", "向右分割（右鍵選 agent）")}
        {splitButton("column", "⊟", "向下分割（右鍵選 agent）")}
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
          <div className="menu-backdrop" onClick={() => closeMenu(false)} />
          <div
            ref={menuRef}
            className="launcher-menu pane-launcher-menu"
            role="menu"
            onKeyDown={onMenuKeyDown}
          >
            {listLaunchers().map((l) => (
              <button
                key={l.label}
                role="menuitem"
                onClick={() => {
                  splitTo(menuDir, l);
                  closeMenu(false);
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
