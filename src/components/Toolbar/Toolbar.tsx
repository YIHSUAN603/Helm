// 頂部工具列：broadcast 派工、以及成本/用量。
// 派工以「畫面上可見的 session」為對象（active session 的分割群組，
// 未分組時只有它自己）；Σ 成本、變更計數則限縮在聚焦 workspace 內。
import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useSessionStore } from "../../store/sessions";
import { useUiStore } from "../../store/ui";
import { groupTreeOf, useLayoutStore } from "../../store/layout";
import { collectSessionIds } from "../../store/layoutTree";
import { installPendingUpdate, useUpdateStore } from "../../store/update";
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
  const activeId = useSessionStore((s) => s.activeId);
  const trees = useLayoutStore((s) => s.trees);
  const filesOpen = useUiStore((s) => s.filesOpen);
  const toggleFiles = useUiStore((s) => s.toggleFiles);
  const updatePhase = useUpdateStore((s) => s.phase);
  const updateVersion = useUpdateStore((s) => s.version);
  const updateDismissed = useUpdateStore((s) => s.dismissed);
  const dismissUpdate = useUpdateStore((s) => s.dismiss);

  const [text, setText] = useState("");
  const [target, setTarget] = useState<Target>("agents");

  // 窄訂閱（值/引用沒變就不重繪）：Σ成本與變更數是 primitive；active 只投影
  // 工具列實際顯示的欄位（shallow 比對擋掉 agentState 等無關 tick）。
  const totalCost = useSessionStore((s) =>
    workspaceTotalCost(s.sessions, resolveFocusedWorkspace(s.sessions, s.activeId)),
  );
  const changedCount = useSessionStore((s) =>
    workspaceChangedFileCount(s.sessions, resolveFocusedWorkspace(s.sessions, s.activeId)),
  );
  const active = useSessionStore(
    useShallow((s) => {
      const a = s.sessions.find((x) => x.id === s.activeId);
      return (
        a && {
          agentId: a.agentId,
          agentLabel: a.agentLabel,
          cost: a.cost,
          tokensIn: a.tokensIn,
          tokensOut: a.tokensOut,
        }
      );
    }),
  );

  // 派工對象 = 畫面上可見的 session：active 的分割群組成員，未分組時只有它自己。
  // broadcast 只需要 id（agents 目標再過濾有 agentId 的），不必訂閱 session 物件。
  const visibleIds = useMemo(() => {
    const groupRoot = groupTreeOf(trees, activeId);
    return groupRoot ? collectSessionIds(groupRoot) : activeId ? [activeId] : [];
  }, [trees, activeId]);
  const visibleAgentIds = useSessionStore(
    useShallow((s) =>
      visibleIds.filter((id) => s.sessions.find((x) => x.id === id)?.agentId),
    ),
  );

  const targetIds = () => (target === "agents" ? visibleAgentIds : visibleIds);

  const broadcast = () => {
    const t = text.trim();
    if (!t) return;
    for (const id of targetIds()) void ptyWrite(id, `${t}\r`);
    setText("");
  };

  const targetCount = targetIds().length;

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

      {updatePhase === "available" && !updateDismissed && (
        <div className="tb-update-banner">
          <span>{t("update.available", { version: updateVersion ?? "" })}</span>
          <button className="tb-update-install" onClick={() => void installPendingUpdate()}>
            {t("update.installNow")}
          </button>
          <button className="tb-update-later" onClick={dismissUpdate}>
            {t("update.later")}
          </button>
        </div>
      )}

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
