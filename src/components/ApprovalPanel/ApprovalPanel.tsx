// 集中審批面板：跨 session 匯總所有等待審批的 agent，一鍵批准/拒絕。
// 批准/拒絕 = 把該 profile 定義的按鍵序列寫回對應 PTY（不攔截 stdin）。
// Buttons share respondApproval with the approval:* commands; Esc returns
// focus to the terminal.
import {
  activateSession,
  respondAllApprovals,
  respondApproval,
} from "../../commands/actions";
import { focusActiveTerminal } from "../../focus/focusUtils";
import { useSessionStore } from "../../store/sessions";
import "./ApprovalPanel.css";

export function ApprovalPanel() {
  const sessions = useSessionStore((s) => s.sessions);

  const pending = sessions.filter((s) => s.pendingApproval);
  if (pending.length === 0) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      focusActiveTerminal();
    }
  };

  const onMetaKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activateSession(id);
    }
  };

  return (
    <div className="approval-panel" data-focus-region="approvals" onKeyDown={onKeyDown}>
      <div className="approval-header">
        待審批 <span className="approval-count">{pending.length}</span>
        {pending.length > 1 && (
          <span className="approval-batch">
            <button className="batch approve" onClick={() => respondAllApprovals(true)}>
              全部批准
            </button>
            <button className="batch reject" onClick={() => respondAllApprovals(false)}>
              全部拒絕
            </button>
          </span>
        )}
      </div>
      {pending.map((s) => (
        <div className="approval-item" key={s.id}>
          <div
            className="approval-meta"
            role="button"
            tabIndex={0}
            onClick={() => activateSession(s.id)}
            onKeyDown={(e) => onMetaKeyDown(e, s.id)}
          >
            <span className="approval-agent">{s.agentLabel ?? "Agent"}</span>
            <span className="approval-session">{s.title}</span>
          </div>
          <div className="approval-prompt" title={s.pendingApproval}>
            {s.pendingApproval}
          </div>
          <div className="approval-actions">
            <button
              className="approve"
              onClick={() => respondApproval(s.id, s.agentId, true)}
            >
              批准
            </button>
            <button
              className="reject"
              onClick={() => respondApproval(s.id, s.agentId, false)}
            >
              拒絕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
