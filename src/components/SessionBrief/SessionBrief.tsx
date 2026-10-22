// Session 提醒卡：回到一個 session 時，浮在 pane 右上角回答「它在做什麼、
// 我不在時發生了什麼」。觸發規則在 store/briefWatch.ts，摘要計算在
// store/sessionBrief.ts（純函式）。
//
// 卡片刻意不拿焦點：焦點留在終端，使用者一開始打字卡片就收起來，那個按鍵
// 照常送進 PTY —— 卡片絕不能擋住輸入。唯一被吞掉的是 Esc（它對 agent 是
// 「中斷」，拿來關卡片時不該順便打斷 agent）。
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "../../store/sessions";
import { useBriefStore } from "../../store/briefs";
import { useNotificationsStore } from "../../store/notifications";
import { usePrefixStore } from "../../store/prefix";
import {
  elapsedParts,
  hasSinceContent,
  summarizeSince,
  type BriefActivity,
} from "../../store/sessionBrief";
import { focusActiveTerminal } from "../../focus/focusUtils";
import { useT } from "../../i18n";
import "./SessionBrief.css";

const EMPTY_ACTIVITY: BriefActivity[] = [];
// 單獨的修飾鍵不算「開始打字」。
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock"]);
// 卡片上最多列幾種工具，其餘以「…」帶過。
const TOOLS_SHOWN = 4;
// 本次 app 啟動的時間：還原出來的 session 若目標早於此刻，標示為「上次的目標」。
const APP_STARTED_AT = Date.now();

function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Gate: 只有卡片開在這個 session 時才訂閱活動與通知。
export const SessionBrief = memo(function SessionBrief({ session }: { session: Session }) {
  const open = useBriefStore((s) => (s.open?.sessionId === session.id ? s.open : null));
  if (!open) return null;
  return <BriefCard session={session} since={open.since} />;
});

function BriefCard({ session, since }: { session: Session; since?: number }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const activity = useBriefStore((s) => s.activity[session.id]) ?? EMPTY_ACTIVITY;
  const items = useNotificationsStore((s) => s.items);
  // 相對時間（「4 分鐘前」）每 30 秒刷新一次。
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const summary = useMemo(
    () =>
      summarizeSince(
        activity,
        items.filter((n) => n.sessionId === session.id),
        since,
      ),
    [activity, items, session.id, since],
  );

  // 在這個 pane 裡按任何鍵（單獨修飾鍵與 Ctrl+A 前綴除外）就收起卡片。
  // capture phase 掛在 window，排在 App.tsx 的前綴處理之後：前綴吃掉的鍵會被
  // preventDefault，這裡據此放行。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || MODIFIER_KEYS.has(e.key)) return;
      if (usePrefixStore.getState().armed) return;
      const pane = ref.current?.closest(".pane");
      const target = e.target instanceof Node ? e.target : null;
      // 焦點在別處（對話框、側欄改名框）的按鍵與這張卡無關。
      if (target !== document.body && !(pane && target && pane.contains(target))) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
      useBriefStore.getState().close();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const ago = (ms: number) => {
    const p = elapsedParts(now - ms);
    return t(`brief.ago.${p.unit}`, { n: p.n });
  };
  const stateKey = session.agentState ?? session.status;
  const waitingText = session.pendingApproval ?? session.pendingPrompt?.text;
  const goal = session.goal;
  const goalIsOld = session.restored && goal !== undefined && goal.at < APP_STARTED_AT;
  const alertEntries = Object.entries(summary.alerts);
  const away = since !== undefined ? elapsedParts(now - since) : undefined;

  return (
    <div
      ref={ref}
      className="session-brief"
      role="status"
      title={t("brief.dismissHint")}
      onClick={() => {
        useBriefStore.getState().close();
        focusActiveTerminal();
      }}
    >
      <div className="session-brief-head">
        <span className="session-brief-name">{session.agentLabel ?? session.title}</span>
        <span className="session-brief-state">
          <span className={`status-dot ${session.agentState ? `agent-${stateKey}` : stateKey}`} />
          {t(`sidebar.state.${stateKey}`)}
          {session.stateSince !== undefined && ` · ${ago(session.stateSince)}`}
        </span>
      </div>

      {waitingText && (
        <div className="session-brief-section session-brief-waiting">
          <div className="session-brief-label">⏳ {t("brief.waiting")}</div>
          <div className="session-brief-text">{waitingText}</div>
        </div>
      )}

      <div className="session-brief-section">
        <div className="session-brief-label">
          🎯 {t(goalIsOld ? "brief.goalPrevious" : "brief.goal")}
          {goal && <span className="session-brief-time">{fmtClock(goal.at)}</span>}
        </div>
        {goal ? (
          <div className="session-brief-text session-brief-goal">{goal.text}</div>
        ) : (
          <div className="session-brief-muted">{t("brief.noGoal")}</div>
        )}
      </div>

      <div className="session-brief-section">
        <div className="session-brief-label">
          ⏱{" "}
          {away
            ? t("brief.sinceLeft", { d: t(`brief.duration.${away.unit}`, { n: away.n }) })
            : t("brief.soFar")}
        </div>
        {hasSinceContent(summary) ? (
          <ul className="session-brief-list">
            {summary.tools.length > 0 && (
              <li>
                {summary.tools
                  .slice(0, TOOLS_SHOWN)
                  .map((x) => `${x.tool} ×${x.count}`)
                  .join(" · ")}
                {summary.tools.length > TOOLS_SHOWN && " · …"}
              </li>
            )}
            {summary.files > 0 && <li>{t("brief.files", { n: summary.files })}</li>}
            {alertEntries.length > 0 && (
              <li>
                {alertEntries
                  .map(([kind, n]) => t(`brief.alert.${kind}`, { n: n ?? 0 }))
                  .join(" · ")}
              </li>
            )}
          </ul>
        ) : (
          <div className="session-brief-muted">{t("brief.noActivity")}</div>
        )}
      </div>

      <div className="session-brief-foot">{t("brief.dismissHint")}</div>
    </div>
  );
}
