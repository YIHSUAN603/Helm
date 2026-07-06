// Session 側欄看板：兩層階層 — workspace（可摺疊群組）→ session。
// 「⊞」新增 workspace（立即進入命名）；「+」開啟 launcher 選單建立 session
// （落在作用中 session 的 workspace）。session 可拖曳到其他 workspace。
// Keyboard: roving focus over headers + items (arrows / Enter / Delete / F2),
// Esc back to the terminal; the launcher menu is fully arrow-navigable.
import { useRef, useState } from "react";
import { useSessionStore } from "../../store/sessions";
import { useWorkspaceStore } from "../../store/workspaces";
import { groupSessions, DEFAULT_WORKSPACE_ID } from "../../store/workspaceGroups";
import { useThemeStore } from "../../store/theme";
import { newSession, newWorkspace } from "../../commands/actions";
import { LauncherMenu } from "./LauncherMenu";
import { WorkspaceGroup } from "./WorkspaceGroup";
import "./SessionSidebar.css";

export function SessionSidebar() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.activeId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const theme = useThemeStore((s) => s.name);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLButtonElement>(null);

  const groups = groupSessions(workspaces, sessions);

  const closeMenu = (refocus: boolean) => {
    setMenuOpen(false);
    if (refocus) plusRef.current?.focus();
  };

  const addWorkspace = () => {
    setRenamingId(newWorkspace());
  };

  return (
    <aside className="sidebar" data-focus-region="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">SESSIONS</span>
        <div className="sidebar-actions">
          <button className="icon-btn" title="新增 Workspace" onClick={addWorkspace}>
            ⊞
          </button>
          <div className="new-menu-wrap">
            <button
              ref={plusRef}
              className="icon-btn"
              title="新增 Session"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              +
            </button>
            {menuOpen && (
              <LauncherMenu
                onPick={(l) => {
                  newSession(l);
                  closeMenu(false);
                }}
                onClose={closeMenu}
              />
            )}
          </div>
        </div>
      </div>

      <div className="session-list" ref={listRef}>
        {groups.map((g) => (
          <WorkspaceGroup
            key={g.workspace.id}
            workspace={g.workspace}
            sessions={g.sessions}
            activeId={activeId}
            listRef={listRef}
            deletable={g.workspace.id !== DEFAULT_WORKSPACE_ID}
            renaming={renamingId === g.workspace.id}
            onRenameStart={() => setRenamingId(g.workspace.id)}
            onRenameEnd={() => setRenamingId(null)}
          />
        ))}
      </div>

      <div className="sidebar-footer">
        <button className="theme-btn" onClick={toggleTheme}>
          {theme === "dark" ? "☾ Dark" : "☀ Light"}
        </button>
      </div>
    </aside>
  );
}
