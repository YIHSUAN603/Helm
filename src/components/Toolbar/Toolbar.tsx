// 頂部工具列：視圖切換（single/split）、broadcast 派工、以及成本/用量。
// 派工、Σ 成本、變更計數都限縮在聚焦 workspace 內。
import { useState } from "react";
import { useSessionStore } from "../../store/sessions";
import { useUiStore } from "../../store/ui";
import { useLayoutStore } from "../../store/layout";
import { useUpdateStore } from "../../store/update";
import {
  resolveFocusedWorkspace,
  sessionsInWorkspace,
  workspaceChangedFileCount,
  workspaceTotalCost,
} from "../../store/workspaceGroups";
import { ptyWrite } from "../../ipc/pty";
import { focusActiveTerminal } from "../../focus/focusUtils";
import { useT } from "../../i18n";
import "./Toolbar.css";

type Target = "all" | "agents";

function fmtCost(n?: number): string {
  return n === undefined ? "—" : `$${n.toFixed(4)}`;
}
function fmtNum(n?: number): string {
  return n === undefined ? "—" : n.toLocaleString();
}

export function Toolbar() {
  const t = useT();
  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.activeId);
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const filesOpen = useUiStore((s) => s.filesOpen);
  const toggleFiles = useUiStore((s) => s.toggleFiles);
  const updatePhase = useUpdateStore((s) => s.phase);
  const updateVersion = useUpdateStore((s) => s.version);

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
          title={t("toolbar.singleView")}
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
          title={t("toolbar.splitView")}
        >
          ▦
        </button>
      </div>

      <div className="tb-broadcast">
        <select value={target} onChange={(e) => setTarget(e.target.value as Target)}>
          <option value="agents">{t("toolbar.targetAgents")}</option>
          <option value="all">{t("toolbar.targetAll")}</option>
        </select>
        <input
          value={text}
          placeholder={t("toolbar.broadcastPlaceholder", { count: targetCount })}
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
          {t("toolbar.send")}
        </button>
      </div>

      <div className="tb-spacer" />

      {(updatePhase === "downloading" || updatePhase === "relaunching") && (
        <span className="tb-update" title={t(`update.${updatePhase}`, { version: updateVersion ?? "" })}>
          {t(`update.${updatePhase}`, { version: updateVersion ?? "" })}
        </span>
      )}

      {active?.agentId && (
        <div className="tb-cost">
          <span className="tb-agent">{active.agentLabel ?? t("toolbar.defaultAgent")}</span>
          <span className="tb-mono" title={t("toolbar.cost")}>
            {fmtCost(active.cost)}
          </span>
          <span className="tb-mono" title={t("toolbar.tokens")}>
            ↑{fmtNum(active.tokensIn)} ↓{fmtNum(active.tokensOut)}
          </span>
        </div>
      )}
      <button
        className={`tb-files ${filesOpen ? "on" : ""}`}
        aria-pressed={filesOpen}
        onClick={toggleFiles}
        title={t("toolbar.changedFiles")}
      >
        {t("toolbar.changedFilesLabel", { count: changedCount })}
      </button>
      <span className="tb-total" title={t("toolbar.totalCost")}>
        Σ ${totalCost.toFixed(4)}
      </span>
    </div>
  );
}
