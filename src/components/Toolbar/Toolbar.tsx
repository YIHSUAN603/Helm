// 頂部工具列：視圖切換（single/split）、broadcast 派工、以及 active session 的成本/用量。
import { useState } from "react";
import { useSessionStore } from "../../store/sessions";
import { useUiStore } from "../../store/ui";
import { useLayoutStore } from "../../store/layout";
import { ptyWrite } from "../../ipc/pty";
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

  const [text, setText] = useState("");
  const [target, setTarget] = useState<Target>("agents");

  const active = sessions.find((s) => s.id === activeId);
  const totalCost = sessions.reduce((sum, s) => sum + (s.cost ?? 0), 0);
  const changedCount = active?.changedFiles?.length ?? 0;

  const targets = () =>
    target === "agents" ? sessions.filter((s) => s.agentId) : sessions;

  const broadcast = () => {
    const t = text.trim();
    if (!t) return;
    for (const s of targets()) void ptyWrite(s.id, `${t}\r`);
    setText("");
  };

  const targetCount = targets().length;

  return (
    <div className="toolbar">
      <div className="tb-view">
        <button
          className={viewMode === "single" ? "on" : ""}
          onClick={() => setViewMode("single")}
          title="單一視圖"
        >
          ▢
        </button>
        <button
          className={viewMode === "split" ? "on" : ""}
          onClick={() => {
            // 首次進 split 且無版面樹：把現有 sessions 自動平衡排列。
            useLayoutStore.getState().ensureTree(sessions.map((s) => s.id));
            setViewMode("split");
          }}
          title="分割視圖"
        >
          ▦
        </button>
      </div>

      <div className="tb-broadcast">
        <select value={target} onChange={(e) => setTarget(e.target.value as Target)}>
          <option value="agents">所有 agent</option>
          <option value="all">所有 session</option>
        </select>
        <input
          value={text}
          placeholder={`派工給 ${targetCount} 個 session…`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") broadcast();
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
          <button
            className={`tb-files ${filesOpen ? "on" : ""}`}
            onClick={toggleFiles}
            title="檔案變更"
          >
            變更 {changedCount}
          </button>
        </div>
      )}
      <span className="tb-total" title="所有 session 成本總計">
        Σ ${totalCost.toFixed(4)}
      </span>
    </div>
  );
}
