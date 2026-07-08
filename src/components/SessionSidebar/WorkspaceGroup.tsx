// One collapsible workspace group: header (chevron / name / count / actions)
// plus its session rows. The whole group is a drop target so a session can
// be dragged in even when the group is collapsed.
import { memo, useMemo, useRef, useState } from "react";
import { useSessionStore } from "../../store/sessions";
import type { SidebarSession } from "../../store/sidebarProjection";
import { useWorkspaceStore, expandWorkspace } from "../../store/workspaces";
import { useUiStore } from "../../store/ui";
import type { SplitClusterInfo, Workspace } from "../../store/workspaceGroups";
import {
  activateFirstPendingApproval,
  newSession,
  removeWorkspace,
} from "../../commands/actions";
import { focusActiveTerminal } from "../../focus/focusUtils";
import { handleListKey } from "../../focus/listNav";
import { SessionItem, SIDEBAR_NAV_SELECTOR } from "./SessionItem";
import { useT } from "../../i18n";

interface WorkspaceGroupProps {
  workspace: Workspace;
  sessions: { session: SidebarSession; cluster: SplitClusterInfo }[];
  activeId: string | null;
  listRef: React.RefObject<HTMLDivElement | null>;
  deletable: boolean;
}

// Memoized: rename state is subscribed from the ui store (not passed as
// per-render closures) so unrelated sidebar re-renders skip whole groups.
export const WorkspaceGroup = memo(function WorkspaceGroup({
  workspace: w,
  sessions,
  activeId,
  listRef,
  deletable,
}: WorkspaceGroupProps) {
  const t = useT();
  const toggleCollapsed = useWorkspaceStore((s) => s.toggleCollapsed);
  const renameWorkspace = useWorkspaceStore((s) => s.renameWorkspace);
  const moveSessionToWorkspace = useSessionStore((s) => s.moveSessionToWorkspace);
  const renaming = useUiStore((s) => s.renamingWorkspaceId === w.id);
  const setRenamingId = useUiStore((s) => s.setRenamingWorkspaceId);
  const onRenameStart = () => setRenamingId(w.id);
  const onRenameEnd = () => setRenamingId(null);
  const [dragOver, setDragOver] = useState(false);
  const pendingCount = useMemo(
    () => sessions.filter(({ session: s }) => s.pendingApproval).length,
    [sessions],
  );
  // Counter to ignore dragleave noise from child elements.
  const dragDepth = useRef(0);

  const commitRename = (value: string) => {
    const name = value.trim();
    if (name) renameWorkspace(w.id, name);
    onRenameEnd();
  };

  const onHeaderKeyDown = (e: React.KeyboardEvent) => {
    if (renaming) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleCollapsed(w.id);
    } else if (e.key === "F2") {
      e.preventDefault();
      onRenameStart();
    } else if (e.key === "Escape") {
      e.preventDefault();
      focusActiveTerminal();
    } else if (handleListKey(e.key, listRef.current, SIDEBAR_NAV_SELECTOR)) {
      e.preventDefault();
    }
  };

  const onRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "Enter") commitRename(e.currentTarget.value);
    else if (e.key === "Escape") onRenameEnd();
  };

  const addSession = () => {
    newSession(undefined, w.id);
    expandWorkspace(w.id);
  };

  const clearDrag = () => {
    dragDepth.current = 0;
    setDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    clearDrag();
    const id = e.dataTransfer.getData("text/plain");
    if (id) moveSessionToWorkspace(id, w.id);
  };

  return (
    <div
      className={`workspace-group ${dragOver ? "drag-over" : ""}`}
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current += 1;
        setDragOver(true);
      }}
      onDragLeave={() => {
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) clearDrag();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={onDrop}
    >
      <div
        className="workspace-header"
        role="button"
        tabIndex={-1}
        aria-expanded={!w.collapsed}
        onClick={() => {
          if (!renaming) toggleCollapsed(w.id);
        }}
        onDoubleClick={() => {
          if (!renaming) onRenameStart();
        }}
        onKeyDown={onHeaderKeyDown}
      >
        <span className="workspace-chevron">{w.collapsed ? "▸" : "▾"}</span>
        {renaming ? (
          <input
            className="workspace-rename-input"
            defaultValue={w.name}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={onRenameKeyDown}
            onBlur={(e) => commitRename(e.currentTarget.value)}
          />
        ) : (
          <span className="workspace-name" title={w.name}>
            {w.name}
          </span>
        )}
        <span className="workspace-count">{sessions.length}</span>
        {/* Cross-workspace alert: pending approvals inside this group. */}
        {pendingCount > 0 && (
          <button
            className="workspace-approval-badge"
            title={t("sidebar.pendingApprovalBadge", { count: pendingCount })}
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              activateFirstPendingApproval(w.id);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {pendingCount}
          </button>
        )}
        <button
          className="icon-btn hover-action"
          title={t("sidebar.addSession")}
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            addSession();
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          +
        </button>
        {deletable && (
          <button
            className="icon-btn hover-action"
            title={t("sidebar.removeWorkspace")}
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              removeWorkspace(w.id);
            }}
          >
            ×
          </button>
        )}
      </div>
      {!w.collapsed && (
        <div className="workspace-sessions">
          {sessions.map(({ session: s, cluster }) => (
            <SessionItem
              key={s.id}
              session={s}
              clusterPos={cluster.position}
              clusterGroupId={cluster.groupId}
              isActive={s.id === activeId}
              listRef={listRef}
            />
          ))}
        </div>
      )}
    </div>
  );
});
