// 集中審批面板：匯總「聚焦 workspace 內」所有等待審批的 agent，一鍵批准/拒絕。
// 批准/拒絕 = 把該 profile 定義的按鍵序列寫回對應 PTY（不攔截 stdin）。
// 其他 workspace 的待審批由側欄徽章與桌面通知提示。
// Buttons share respondApproval with the approval:* commands; Esc returns
// focus to the terminal.
import {
  activateSession,
  respondAllApprovals,
  respondApproval,
} from "../../commands/actions";
import { focusActiveTerminal } from "../../focus/focusUtils";
import { useSessionStore } from "../../store/sessions";
import { isResponseIneffective } from "../../store/approvalSuppress";
import {
  pendingApprovalsInWorkspace,
  resolveFocusedWorkspace,
} from "../../store/workspaceGroups";
import { useT } from "../../i18n";
import "./ApprovalPanel.css";

export function ApprovalPanel() {
  const t = useT();
  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.activeId);

  const workspaceId = resolveFocusedWorkspace(sessions, activeId);
  const pending = pendingApprovalsInWorkspace(sessions, workspaceId);
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
        {t("approval.pending")} <span className="approval-count">{pending.length}</span>
        {pending.length > 1 && (
          <span className="approval-batch">
            <button className="batch approve" onClick={() => respondAllApprovals(true)}>
              {t("approval.approveAll")}
            </button>
            <button className="batch reject" onClick={() => respondAllApprovals(false)}>
              {t("approval.rejectAll")}
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
            <span className="approval-agent">{s.agentLabel ?? t("toolbar.defaultAgent")}</span>
            <span className="approval-session">{s.title}</span>
          </div>
          <div className="approval-prompt" title={s.pendingApproval}>
            {s.pendingApproval}
          </div>
          {isResponseIneffective(s.id, s.pendingApproval ?? "", Date.now()) && (
            <div className="approval-hint">
              {t("approval.ineffectiveHint")}
            </div>
          )}
          <div className="approval-actions">
            <button
              className="approve"
              onClick={() => respondApproval(s.id, s.agentId, true)}
            >
              {t("approval.approve")}
            </button>
            <button
              className="reject"
              onClick={() => respondApproval(s.id, s.agentId, false)}
            >
              {t("approval.reject")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
