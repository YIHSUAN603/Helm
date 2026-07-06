// 檔案變更面板：列出目前 session 這次執行 agent 動到的檔案（op + 路徑）。
// Esc（面板內有焦點時）關閉並把焦點還給終端機。
import { useSessionStore } from "../../store/sessions";
import { useUiStore } from "../../store/ui";
import { focusActiveTerminal } from "../../focus/focusUtils";
import "./ChangedFilesPanel.css";

export function ChangedFilesPanel() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.activeId);
  const open = useUiStore((s) => s.filesOpen);
  const setFilesOpen = useUiStore((s) => s.setFilesOpen);
  const active = sessions.find((s) => s.id === activeId);

  if (!open) return null;
  const onClose = () => setFilesOpen(false);
  const files = active?.changedFiles ?? [];

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
        <span>檔案變更 {files.length > 0 && `(${files.length})`}</span>
        <button className="files-close" onClick={onClose} title="關閉">
          ×
        </button>
      </div>
      <div className="files-list">
        {files.length === 0 && <div className="files-empty">尚無變更</div>}
        {files.map((f) => (
          <div className="file-row" key={f.path}>
            <span className={`file-op op-${f.op.toLowerCase()}`}>{f.op}</span>
            <span className="file-path" title={f.path}>
              {f.path}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
