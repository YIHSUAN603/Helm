// 集中審批面板：跨 session 匯總所有等待審批的 agent，一鍵批准/拒絕。
// 批准/拒絕 = 把該 profile 定義的按鍵序列寫回對應 PTY（不攔截 stdin）。
import { useSessionStore } from "../../store/sessions";
import { getProfile } from "../../agents/registry";
import { ptyWrite } from "../../ipc/pty";
import "./ApprovalPanel.css";

export function ApprovalPanel() {
  const sessions = useSessionStore((s) => s.sessions);
  const setActive = useSessionStore((s) => s.setActive);
  const clearApproval = useSessionStore((s) => s.clearApproval);

  const pending = sessions.filter((s) => s.pendingApproval);
  if (pending.length === 0) return null;

  const respond = (id: string, agentId: string | null, approve: boolean) => {
    const profile = getProfile(agentId);
    void ptyWrite(id, approve ? profile.approve : profile.reject);
    clearApproval(id);
  };

  const respondAll = (approve: boolean) => {
    for (const s of pending) respond(s.id, s.agentId, approve);
  };

  return (
    <div className="approval-panel">
      <div className="approval-header">
        待審批 <span className="approval-count">{pending.length}</span>
        {pending.length > 1 && (
          <span className="approval-batch">
            <button className="batch approve" onClick={() => respondAll(true)}>
              全部批准
            </button>
            <button className="batch reject" onClick={() => respondAll(false)}>
              全部拒絕
            </button>
          </span>
        )}
      </div>
      {pending.map((s) => (
        <div className="approval-item" key={s.id}>
          <div className="approval-meta" onClick={() => setActive(s.id)}>
            <span className="approval-agent">{s.agentLabel ?? "Agent"}</span>
            <span className="approval-session">{s.title}</span>
          </div>
          <div className="approval-prompt" title={s.pendingApproval}>
            {s.pendingApproval}
          </div>
          <div className="approval-actions">
            <button
              className="approve"
              onClick={() => respond(s.id, s.agentId, true)}
            >
              批准
            </button>
            <button
              className="reject"
              onClick={() => respond(s.id, s.agentId, false)}
            >
              拒絕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
