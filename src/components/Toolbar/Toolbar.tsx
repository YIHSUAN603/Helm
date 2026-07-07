// 頂部工具列：broadcast 派工、以及成本/用量。
// 派工以「畫面上可見的 session」為對象（active session 的分割群組，
// 未分組時只有它自己）；Σ 成本、變更計數則限縮在聚焦 workspace 內。
import { useState } from "react";
import { useSessionStore } from "../../store/sessions";
import { useUiStore } from "../../store/ui";
import { groupTreeOf, useLayoutStore } from "../../store/layout";
import { collectSessionIds } from "../../store/layoutTree";
import { useUpdateStore } from "../../store/update";
import {
  resolveFocusedWorkspace,
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
  const trees = useLayoutStore((s) => s.trees);
  const filesOpen = useUiStore((s) => s.filesOpen);
  const toggleFiles = useUiStore((s) => s.toggleFiles);
  const updatePhase = useUpdateStore((s) => s.phase);
  const updateVersion = useUpdateStore((s) => s.version);

  const [text, setText] = useState("");
  const [target, setTarget] = useState<Target>("agents");

  const active = sessions.find((s) => s.id === activeId);
  const workspaceId = resolveFocusedWorkspace(sessions, activeId);
  const totalCost = workspaceTotalCost(sessions, workspaceId);
  const changedCount = workspaceChangedFileCount(sessions, workspaceId);

  // 派工對象 = 畫面上可見的 session：active 的分割群組成員，未分組時只有它自己。
  const groupRoot = groupTreeOf(trees, activeId);
  const visibleIds = groupRoot
    ? collectSessionIds(groupRoot)
    : activeId
      ? [activeId]
      : [];
  const visibleSessions = visibleIds
    .map((id) => sessions.find((s) => s.id === id))
    .filter((s) => s !== undefined);

  const targets = () =>
    target === "agents" ? visibleSessions.filter((s) => s.agentId) : visibleSessions;

  const broadcast = () => {
    const t = text.trim();
    if (!t) return;
    for (const s of targets()) void ptyWrite(s.id, `${t}\r`);
    setText("");
  };

  const targetCount = targets().length;

  return (
    <div className="toolbar" data-focus-region="toolbar">
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
