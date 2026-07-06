// One session row: status dot, title, agent tag, close button.
// Draggable so it can be dropped onto another workspace group.
import { useSessionStore, type Session } from "../../store/sessions";
import { activateSession } from "../../commands/actions";
import { focusActiveTerminal } from "../../focus/focusUtils";
import { handleListKey } from "../../focus/listNav";

/** Roving-focus targets in the sidebar: workspace headers + visible sessions. */
export const SIDEBAR_NAV_SELECTOR = ".workspace-header, .session-item";

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

interface SessionItemProps {
  session: Session;
  isActive: boolean;
  listRef: React.RefObject<HTMLDivElement | null>;
}

export function SessionItem({ session: s, isActive, listRef }: SessionItemProps) {
  const closeSession = useSessionStore((x) => x.closeSession);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activateSession(s.id);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      closeSession(s.id);
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
      draggable
      onDragStart={onDragStart}
      onClick={() => activateSession(s.id)}
      onKeyDown={onKeyDown}
    >
      <span className={`status-dot ${cls}`} title={stateLabel[cls] ?? ""} />
      <span className="session-name" title={s.title}>
        {s.title}
      </span>
      {s.agentLabel && <span className="agent-tag">{s.agentLabel}</span>}
      <button
        className="icon-btn close"
        title="關閉"
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
}
