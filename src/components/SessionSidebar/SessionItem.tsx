// One session row: status dot, title, close button.
// Draggable so it can be dropped onto another workspace group.
// Memoized: projected session refs (sidebarProjection) are stable for
// untouched sessions and cluster info arrives as primitives, so one session's
// state tick re-renders only its own row.
import { memo } from "react";
import { useSessionStore } from "../../store/sessions";
import type { SidebarSession } from "../../store/sidebarProjection";
import type { SplitClusterInfo } from "../../store/workspaceGroups";
import { activateSession, newSession } from "../../commands/actions";
import { focusActiveTerminal } from "../../focus/focusUtils";
import { handleListKey } from "../../focus/listNav";
import { useT } from "../../i18n";

/** Roving-focus targets in the sidebar: workspace headers + visible sessions. */
export const SIDEBAR_NAV_SELECTOR = ".workspace-header, .session-item";

// 綜合狀態燈：有 agent 狀態優先，否則用活動狀態。
function dotClass(s: SidebarSession): string {
  if (s.agentState) return `agent-${s.agentState}`;
  return s.status;
}

const stateLabelKeys: Record<string, string> = {
  "agent-thinking": "sidebar.state.thinking",
  "agent-tool": "sidebar.state.tool",
  "agent-waiting": "sidebar.state.waiting",
  "agent-done": "sidebar.state.done",
  "agent-error": "sidebar.state.error",
  busy: "sidebar.state.busy",
  idle: "sidebar.state.idle",
  exited: "sidebar.state.exited",
};

interface SessionItemProps {
  session: SidebarSession;
  clusterPos: SplitClusterInfo["position"];
  clusterGroupId: string | null;
  isActive: boolean;
  listRef: React.RefObject<HTMLDivElement | null>;
}

export const SessionItem = memo(function SessionItem({
  session: s,
  clusterPos,
  clusterGroupId,
  isActive,
  listRef,
}: SessionItemProps) {
  const t = useT();
  const closeSession = useSessionStore((x) => x.closeSession);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activateSession(s.id);
    } else if (e.key === "Delete" || e.key === "Backspace" || e.key === "d") {
      e.preventDefault();
      closeSession(s.id);
    } else if (e.key === "h" || e.key === "ArrowLeft") {
      // Tree-view collapse direction: jump up to the owning workspace header.
      e.preventDefault();
      e.currentTarget
        .closest(".workspace-group")
        ?.querySelector<HTMLElement>(".workspace-header")
        ?.focus();
    } else if (e.key === "a") {
      e.preventDefault();
      newSession(undefined, s.workspaceId);
    } else if (e.key === "Escape") {
      e.preventDefault();
      focusActiveTerminal();
    } else if (handleListKey(e.key, listRef.current, SIDEBAR_NAV_SELECTOR)) {
      e.preventDefault();
    }
  };

  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", s.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const cls = dotClass(s);
  return (
    <div
      className={`session-item ${isActive ? "active" : ""}`}
      role="button"
      tabIndex={isActive ? 0 : -1}
      data-region-entry={isActive ? "true" : undefined}
      data-cluster-pos={clusterPos}
      data-cluster-group={clusterGroupId ?? undefined}
      draggable
      onDragStart={onDragStart}
      onClick={() => activateSession(s.id)}
      onKeyDown={onKeyDown}
    >
      <span className={`status-dot ${cls}`} title={cls in stateLabelKeys ? t(stateLabelKeys[cls]) : ""} />
      <span className="session-name" title={s.title}>
        {s.title}
      </span>
      <button
        className="icon-btn close"
        title={t("sidebar.close")}
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          closeSession(s.id);
        }}
      >
        ×
      </button>
    </div>
  );
});
