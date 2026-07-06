// Session 側欄看板：兩層階層 — workspace（可摺疊群組）→ session。
// 「⊞」新增 workspace（立即進入命名）；新增 session 由各 workspace 群組
// 自己的「+」launcher 負責（見 WorkspaceGroup）。session 可拖曳到其他 workspace。
// Keyboard: roving focus over headers + items (arrows / Enter / Delete / F2),
// Esc back to the terminal; the launcher menu is fully arrow-navigable.
import { useRef } from "react";
import { useSessionStore } from "../../store/sessions";
import { useWorkspaceStore } from "../../store/workspaces";
import { groupSessions, DEFAULT_WORKSPACE_ID } from "../../store/workspaceGroups";
import { useThemeStore } from "../../store/theme";
import { useUiStore } from "../../store/ui";
import { newWorkspace } from "../../commands/actions";
import { WorkspaceGroup } from "./WorkspaceGroup";
import "./SessionSidebar.css";

export function SessionSidebar() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.activeId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const theme = useThemeStore((s) => s.name);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const renamingId = useUiStore((s) => s.renamingWorkspaceId);
  const setRenamingId = useUiStore((s) => s.setRenamingWorkspaceId);
  const listRef = useRef<HTMLDivElement>(null);

  const groups = groupSessions(workspaces, sessions);

  const addWorkspace = () => {
    setRenamingId(newWorkspace());
  };

  return (
    <aside className="sidebar" data-focus-region="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">SESSIONS</span>
        <div className="sidebar-actions">
          <button className="icon-btn" title="新增 Workspace" onClick={addWorkspace}>
            +
          </button>
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
