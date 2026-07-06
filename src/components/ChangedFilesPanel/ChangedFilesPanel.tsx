// 檔案變更面板：列出聚焦 workspace 內所有 session 動到的檔案，依 session 分組。
// 點分組標頭可跳到該 session；Esc（面板內有焦點時）關閉並把焦點還給終端機。
import { activateSession } from "../../commands/actions";
import { useSessionStore, type Session } from "../../store/sessions";
import { useUiStore } from "../../store/ui";
import {
  resolveFocusedWorkspace,
  sessionsInWorkspace,
  workspaceChangedFileCount,
} from "../../store/workspaceGroups";
import { focusActiveTerminal } from "../../focus/focusUtils";
import { useT } from "../../i18n";
import "./ChangedFilesPanel.css";

function SessionFileGroup({ session }: { session: Session }) {
  const files = session.changedFiles ?? [];
  return (
    <div className="files-group">
      <div
        className="files-group-header"
        role="button"
        tabIndex={-1}
        title={session.title}
        onClick={() => activateSession(session.id)}
      >
        <span className="files-group-title">{session.title}</span>
        <span className="files-group-count">{files.length}</span>
      </div>
      {files.map((f) => (
        <div className="file-row" key={`${session.id}:${f.path}`}>
          <span className={`file-op op-${f.op.toLowerCase()}`}>{f.op}</span>
          <span className="file-path" title={f.path}>
            {f.path}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ChangedFilesPanel() {
  const t = useT();
  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.activeId);
  const open = useUiStore((s) => s.filesOpen);
  const setFilesOpen = useUiStore((s) => s.setFilesOpen);

  if (!open) return null;
  const onClose = () => setFilesOpen(false);
  const workspaceId = resolveFocusedWorkspace(sessions, activeId);
  const groups = sessionsInWorkspace(sessions, workspaceId).filter(
    (s) => (s.changedFiles?.length ?? 0) > 0,
  );
  const total = workspaceChangedFileCount(sessions, workspaceId);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      focusActiveTerminal();
    }
  };

  return (
    <div className="files-panel" data-focus-region="files" onKeyDown={onKeyDown}>
      <div className="files-header">
        <span>{total > 0 ? t("files.titleWithCount", { count: total }) : t("files.title")}</span>
        <button className="files-close" onClick={onClose} title={t("files.close")}>
          ×
        </button>
      </div>
      <div className="files-list">
        {groups.length === 0 && <div className="files-empty">{t("files.empty")}</div>}
        {groups.map((s) => (
          <SessionFileGroup key={s.id} session={s} />
        ))}
      </div>
    </div>
  );
}
