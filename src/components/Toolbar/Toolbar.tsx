// 頂部工具列：視圖切換（single/split）、broadcast 派工、以及成本/用量。
// 派工、Σ 成本、變更計數都限縮在聚焦 workspace 內。
import { useState } from "react";
import { useSessionStore } from "../../store/sessions";
import { useUiStore } from "../../store/ui";
import { useLayoutStore } from "../../store/layout";
import {
  resolveFocusedWorkspace,
  sessionsInWorkspace,
  workspaceChangedFileCount,
  workspaceTotalCost,
} from "../../store/workspaceGroups";
import { ptyWrite } from "../../ipc/pty";
import { focusActiveTerminal } from "../../focus/focusUtils";
import "./Toolbar.css";

type Target = "all" | "agents";

function fmtCost(n?: number): string {
  return n === undefined ? "—" : `$${n.toFixed(4)}`;
}
function fmtNum(n?: number): string {
  return n === undefined ? "—" : n.toLocaleString();
}

export function Toolbar() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.activeId);
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const filesOpen = useUiStore((s) => s.filesOpen);
  const toggleFiles = useUiStore((s) => s.toggleFiles);
  const settingsOpen = useUiStore((s) => s.settingsOpen);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);

  const [text, setText] = useState("");
  const [target, setTarget] = useState<Target>("agents");

  const active = sessions.find((s) => s.id === activeId);
  const workspaceId = resolveFocusedWorkspace(sessions, activeId);
  const workspaceSessions = sessionsInWorkspace(sessions, workspaceId);
  const totalCost = workspaceTotalCost(sessions, workspaceId);
  const changedCount = workspaceChangedFileCount(sessions, workspaceId);

  const targets = () =>
    target === "agents" ? workspaceSessions.filter((s) => s.agentId) : workspaceSessions;

  const broadcast = () => {
    const t = text.trim();
    if (!t) return;
    for (const s of targets()) void ptyWrite(s.id, `${t}\r`);
    setText("");
  };

  const targetCount = targets().length;

  return (
    <div className="toolbar" data-focus-region="toolbar">
      <div className="tb-view">
        <button
          className={viewMode === "single" ? "on" : ""}
          aria-pressed={viewMode === "single"}
          onClick={() => setViewMode("single")}
          title="單一視圖"
        >
          ▢
        </button>
        <button
          className={viewMode === "split" ? "on" : ""}
          aria-pressed={viewMode === "split"}
          onClick={() => {
            // 首次進 split 且無版面樹：把 focused workspace 的 sessions 自動平衡排列。
            useLayoutStore
              .getState()
              .ensureTree(workspaceId, workspaceSessions.map((s) => s.id));
            setViewMode("split");
          }}
          title="分割視圖"
        >
          ▦
        </button>
      </div>

      <div className="tb-broadcast">
        <select value={target} onChange={(e) => setTarget(e.target.value as Target)}>
          <option value="agents">Workspace 內 agent</option>
          <option value="all">Workspace 內 session</option>
        </select>
        <input
          value={text}
          placeholder={`派工給 ${targetCount} 個 session…`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              broadcast();
            } else if (e.key === "Escape") {
              e.preventDefault();
              focusActiveTerminal();
            }
          }}
        />
        <button className="tb-send" onClick={broadcast} disabled={!text.trim() || targetCount === 0}>
          送出
        </button>
      </div>

      <div className="tb-spacer" />

      {active?.agentId && (
        <div className="tb-cost">
          <span className="tb-agent">{active.agentLabel ?? "Agent"}</span>
          <span className="tb-mono" title="本次成本">
            {fmtCost(active.cost)}
          </span>
          <span className="tb-mono" title="input / output tokens">
            ↑{fmtNum(active.tokensIn)} ↓{fmtNum(active.tokensOut)}
          </span>
        </div>
      )}
      <button
        className={`tb-files ${filesOpen ? "on" : ""}`}
        aria-pressed={filesOpen}
        onClick={toggleFiles}
        title="此 Workspace 的檔案變更"
      >
        變更 {changedCount}
      </button>
      <span className="tb-total" title="此 Workspace 成本總計">
        Σ ${totalCost.toFixed(4)}
      </span>
      <button
        className={`tb-settings ${settingsOpen ? "on" : ""}`}
        aria-pressed={settingsOpen}
        onClick={() => setSettingsOpen(!settingsOpen)}
        title="設定"
      >
        ⚙
      </button>
    </div>
  );
}
