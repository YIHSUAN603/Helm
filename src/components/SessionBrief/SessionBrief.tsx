// Session 提醒卡：回到一個 session 時，浮在 pane 右上角回答「它在做什麼、
// 我不在時發生了什麼」。觸發規則在 store/briefWatch.ts，摘要計算在
// store/sessionBrief.ts（純函式）。
//
// 卡片刻意不拿焦點：焦點留在終端，使用者一開始打字卡片就收起來，那個按鍵
// 照常送進 PTY —— 卡片絕不能擋住輸入。唯一被吞掉的是 Esc（它對 agent 是
// 「中斷」，拿來關卡片時不該順便打斷 agent）。例外是使用者主動點開備註
// 編輯：那時焦點在卡片裡的文字框，按鍵屬於文字框。
//
// 釘選的 session 在卡片收起時留一行摘要（PinnedStrip），點一下展開完整卡片。
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useSessionStore, type Session } from "../../store/sessions";
import { useBriefStore } from "../../store/briefs";
import { useNotificationsStore } from "../../store/notifications";
import { usePrefixStore } from "../../store/prefix";
import {
  elapsedParts,
  hasSinceContent,
  summarizeSince,
  taskProgress,
  visibleTasks,
  type BriefActivity,
} from "../../store/sessionBrief";
import type { TaskStatus } from "../../agents/hookEvents";
import { focusActiveTerminal } from "../../focus/focusUtils";
import { useT } from "../../i18n";
import "./SessionBrief.css";

const EMPTY_ACTIVITY: BriefActivity[] = [];
// 單獨的修飾鍵不算「開始打字」。
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock"]);
// 卡片上最多列幾種工具，其餘以「…」帶過。
const TOOLS_SHOWN = 4;
// 卡片上最多列幾個任務（見 visibleTasks 的取捨）。
const TASKS_SHOWN = 8;
// 本次 app 啟動的時間：還原出來的 session 若目標早於此刻，標示為「上次的目標」。
const APP_STARTED_AT = Date.now();

const TASK_ICONS: Record<TaskStatus, string> = {
  completed: "✔",
  in_progress: "▶",
  pending: "○",
};

function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function stateKeyOf(s: Session): string {
  return s.agentState ?? s.status;
}

function dotClassOf(s: Session): string {
  return s.agentState ? `agent-${s.agentState}` : s.status;
}

// Gate: 只有卡片開在這個 session 時才訂閱活動與通知。
export const SessionBrief = memo(function SessionBrief({ session }: { session: Session }) {
  const open = useBriefStore((s) => (s.open?.sessionId === session.id ? s.open : null));
  if (open) return <BriefCard session={session} since={open.since} />;
  if (session.briefPinned) return <PinnedStrip session={session} />;
  return null;
});

/** 釘選後的收合狀態：一行摘要，點一下展開。 */
function PinnedStrip({ session }: { session: Session }) {
  const t = useT();
  const progress = taskProgress(session.tasks);
  const summary = session.goal?.text ?? session.note ?? t("command.toggleBrief");
  return (
    <div
      className="session-brief-pinned"
      title={t("brief.pinnedOpen")}
      onClick={() => {
        useBriefStore.getState().show({ sessionId: session.id });
        focusActiveTerminal();
      }}
    >
      <span>📌</span>
      <span className={`status-dot ${dotClassOf(session)}`} />
      <span className="session-brief-pinned-text">{summary}</span>
      {progress.total > 0 && (
        <span className="session-brief-pinned-progress">
          ☑ {progress.done}/{progress.total}
        </span>
      )}
    </div>
  );
}

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
      const card = ref.current;
      const pane = card?.closest(".pane");
      const target = e.target instanceof Node ? e.target : null;
      // 卡片自己的備註框：按鍵屬於文字框。
      if (card && target && card.contains(target)) return;
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
  const stateKey = stateKeyOf(session);
  const waitingText = session.pendingApproval ?? session.pendingPrompt?.text;
  const goal = session.goal;
  const goalIsOld = session.restored && goal !== undefined && goal.at < APP_STARTED_AT;
  const alertEntries = Object.entries(summary.alerts);
  const away = since !== undefined ? elapsedParts(now - since) : undefined;
  const tasks = session.tasks ?? [];
  const progress = taskProgress(tasks);
  const shownTasks = visibleTasks(tasks, TASKS_SHOWN);
  const pinned = Boolean(session.briefPinned);

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
          <span className={`status-dot ${dotClassOf(session)}`} />
          {t(`sidebar.state.${stateKey}`)}
          {session.stateSince !== undefined && ` · ${ago(session.stateSince)}`}
        </span>
        <button
          className={`session-brief-pin ${pinned ? "pinned" : ""}`}
          aria-pressed={pinned}
          title={t(pinned ? "brief.unpin" : "brief.pin")}
          onClick={(e) => {
            e.stopPropagation();
            useSessionStore.getState().setBriefPinned(session.id, !pinned);
            focusActiveTerminal();
          }}
        >
          📌
        </button>
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
          <div className="session-brief-text session-brief-clamp3">{goal.text}</div>
        ) : (
          <div className="session-brief-muted">{t("brief.noGoal")}</div>
        )}
      </div>

      {progress.total > 0 && (
        <div className="session-brief-section">
          <div className="session-brief-label">
            ☑ {t("brief.tasks", { done: progress.done, total: progress.total })}
          </div>
          <ul className="session-brief-tasks">
            {shownTasks.items.map((task) => (
              <li key={task.id} className={`task-${task.status}`}>
                <span className="session-brief-task-icon">{TASK_ICONS[task.status]}</span>
                <span>{task.text}</span>
              </li>
            ))}
          </ul>
          {shownTasks.hidden > 0 && (
            <div className="session-brief-muted">
              {t("brief.tasksHidden", { n: shownTasks.hidden })}
            </div>
          )}
        </div>
      )}

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

      {session.lastReply && (
        <div className="session-brief-section">
          <div className="session-brief-label">
            💬 {t("brief.lastReply")}
            <span className="session-brief-time">{fmtClock(session.lastReply.at)}</span>
          </div>
          <div className="session-brief-text session-brief-clamp4">{session.lastReply.text}</div>
        </div>
      )}

      <NoteSection session={session} />

      <div className="session-brief-foot">{t("brief.dismissHint")}</div>
    </div>
  );
}

/** 備註：點一下編輯，Enter 儲存、Shift+Enter 換行、Esc 放棄（同改名框的慣例）。 */
function NoteSection({ session }: { session: Session }) {
  const t = useT();
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  // 結束編輯後會把焦點還給終端，那一下會先觸發文字框的 blur；沒有這個旗標，
  // Esc 放棄的草稿會被 blur 的「儲存」寫回去。
  const finishedRef = useRef(false);

  const startEdit = () => {
    finishedRef.current = false;
    setDraft(session.note ?? "");
  };

  const finish = (save: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (save && draft !== null) useSessionStore.getState().setNote(session.id, draft);
    setDraft(null);
    focusActiveTerminal();
  };

  return (
    <div
      className="session-brief-section session-brief-note"
      // 點備註區不是「關閉卡片」：停在這裡，改為進入編輯。
      onClick={(e) => {
        e.stopPropagation();
        if (!editing) startEdit();
      }}
    >
      <div className="session-brief-label">📝 {t("brief.note")}</div>
      {editing ? (
        <>
          <textarea
            className="session-brief-note-input"
            autoFocus
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => finish(true)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return; // IME 組字中的 Enter 不是送出
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                finish(true);
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                finish(false);
              }
            }}
          />
          <div className="session-brief-muted">{t("brief.noteEditHint")}</div>
        </>
      ) : session.note ? (
        <div className="session-brief-text session-brief-note-text">{session.note}</div>
      ) : (
        <div className="session-brief-muted session-brief-note-text">
          {t("brief.notePlaceholder")}
        </div>
      )}
    </div>
  );
}
