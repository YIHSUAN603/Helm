// 集中審批面板：匯總「聚焦 workspace 內」所有等待審批的 agent，一鍵批准/拒絕。
// 批准/拒絕 = 把該 profile 定義的按鍵序列寫回對應 PTY（不攔截 stdin）。
// 其他 workspace 的待審批由側欄徽章與桌面通知提示。
// Buttons share respondApproval with the approval:* commands; Esc returns
// focus to the terminal.
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
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

// 「回應可能無效」提示只在回答後 3–20s 的窗口內有效；窗口到期不會有任何
// store tick 觸發重繪，所以掛載期間每秒自查一次，讓提示到期自動消失
//（approval 項目本來就短命，輪詢成本可忽略）。
function IneffectiveHint({ sessionId, prompt }: { sessionId: string; prompt: string }) {
  const t = useT();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const update = () => setShow(isResponseIneffective(sessionId, prompt, Date.now()));
    update();
    const timer = setInterval(update, 1_000);
    return () => clearInterval(timer);
  }, [sessionId, prompt]);
  if (!show) return null;
  return <div className="approval-hint">{t("approval.ineffectiveHint")}</div>;
}

export function ApprovalPanel() {
  const t = useT();
  // 窄訂閱：未動到的 session 物件引用穩定，shallow 比對讓其他 session 的
  // usage/state tick（PTY 輸出頻率）不會重繪整個面板。
  const pending = useSessionStore(
    useShallow((s) =>
      pendingApprovalsInWorkspace(s.sessions, resolveFocusedWorkspace(s.sessions, s.activeId)),
    ),
  );
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
          <IneffectiveHint sessionId={s.id} prompt={s.pendingApproval ?? ""} />
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
