// 側欄 session 的 hover 摘要卡：不必切過去，就知道每個 session 在做什麼。
//
// 整個側欄只有一張，由 session list 上的事件委派驅動，而不是每一列各掛一個：
// 列是 memo 過的、只吃 sidebarProjection 的少數欄位（見該檔），把目標 / 進度
// 塞進投影會讓每次任務更新都重繪整列。這裡只訂閱「目前指著的那一個」session。
//
// 取代了列上原本的原生 title tooltip（完整標題 + 改名提示）：兩者同時出現
// 會疊在一起，所以那兩行也搬進卡片裡。
//
// 鍵盤：列以鍵盤取得焦點（:focus-visible）時也顯示，用 j/k 掃過側欄就能
// 逐一看到每個 session 的摘要。
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSessionStore } from "../../store/sessions";
import { currentTask, taskProgress } from "../../store/sessionBrief";
import { peekTop } from "./peekPosition";
import { useT } from "../../i18n";

/** 滑鼠停多久才顯示（掃過側欄時不該一路閃）。 */
const PEEK_DELAY_MS = 450;
/** 卡片與側欄右緣的間距（px）。 */
const PEEK_GAP_PX = 8;

interface PeekTarget {
  id: string;
  row: HTMLElement;
}

function rowOf(node: EventTarget | null): HTMLElement | null {
  return node instanceof Element ? node.closest<HTMLElement>(".session-item") : null;
}

export function SessionPeek({ listRef }: { listRef: React.RefObject<HTMLDivElement | null> }) {
  const [target, setTarget] = useState<PeekTarget | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // 目前指著（或已排程）的列；同一列內移動不重新計時。
    let current: HTMLElement | null = null;
    // 按下過的列：在滑出它之前不再顯示（點擊 / 拖曳 / 雙擊改名都從按下開始）。
    let suppressed: HTMLElement | null = null;

    const hide = () => {
      clearTimeout(timer);
      current = null;
      setTarget(null);
    };
    const showLater = (row: HTMLElement, delay: number) => {
      clearTimeout(timer);
      current = row;
      setTarget(null);
      timer = setTimeout(() => {
        const id = row.dataset.sessionId;
        // 改名框開著時卡片會擋住它。
        if (id && !row.querySelector("input")) setTarget({ id, row });
      }, delay);
    };

    const onOver = (e: PointerEvent) => {
      if (e.buttons !== 0) return; // 拖曳中
      const row = rowOf(e.target);
      if (row === current) return;
      if (row !== suppressed) suppressed = null;
      if (!row || row === suppressed) hide();
      else showLater(row, PEEK_DELAY_MS);
    };
    const onLeave = () => {
      suppressed = null;
      hide();
    };
    const onDown = (e: PointerEvent) => {
      suppressed = rowOf(e.target);
      hide();
    };
    const onFocusIn = (e: FocusEvent) => {
      const row = rowOf(e.target);
      if (row && row === e.target && row.matches(":focus-visible")) showLater(row, 0);
    };
    const onFocusOut = () => hide();

    list.addEventListener("pointerover", onOver);
    list.addEventListener("pointerleave", onLeave);
    list.addEventListener("pointerdown", onDown, true);
    list.addEventListener("focusin", onFocusIn);
    list.addEventListener("focusout", onFocusOut);
    list.addEventListener("scroll", hide);
    window.addEventListener("blur", hide);
    return () => {
      clearTimeout(timer);
      list.removeEventListener("pointerover", onOver);
      list.removeEventListener("pointerleave", onLeave);
      list.removeEventListener("pointerdown", onDown, true);
      list.removeEventListener("focusin", onFocusIn);
      list.removeEventListener("focusout", onFocusOut);
      list.removeEventListener("scroll", hide);
      window.removeEventListener("blur", hide);
    };
  }, [listRef]);

  if (!target) return null;
  return <PeekCard target={target} />;
}

function PeekCard({ target }: { target: PeekTarget }) {
  const t = useT();
  const session = useSessionStore((s) => s.sessions.find((x) => x.id === target.id));
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // 量完自己的高度才定位（避免第一幀在錯的位置閃一下）。
  useLayoutEffect(() => {
    const card = ref.current;
    if (!card || !target.row.isConnected) return;
    const row = target.row.getBoundingClientRect();
    const sidebar = target.row.closest(".sidebar")?.getBoundingClientRect();
    setPos({
      left: (sidebar?.right ?? row.right) + PEEK_GAP_PX,
      top: peekTop(row.top, card.offsetHeight, window.innerHeight),
    });
  }, [target, session]);

  if (!session) return null;
  const stateKey = session.agentState ?? session.status;
  const dotClass = session.agentState ? `agent-${session.agentState}` : session.status;
  const waiting = session.pendingApproval ?? session.pendingPrompt?.text;
  const progress = taskProgress(session.tasks);
  const doing = currentTask(session.tasks);

  return (
    <div
      ref={ref}
      className="session-peek"
      role="tooltip"
      style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden" }}
    >
      <div className="session-peek-head">
        <span className={`status-dot ${dotClass}`} />
        <span className="session-peek-title">{session.title}</span>
      </div>
      <div className="session-peek-meta">
        {session.agentLabel ? `${session.agentLabel} · ` : ""}
        {t(`sidebar.state.${stateKey}`)}
      </div>
      {waiting && <div className="session-peek-line session-peek-waiting">⏳ {waiting}</div>}
      {session.goal && <div className="session-peek-line session-peek-clamp">🎯 {session.goal.text}</div>}
      {progress.total > 0 && (
        <div className="session-peek-line">
          ☑ {progress.done}/{progress.total}
          {doing && <span className="session-peek-doing"> · {doing.text}</span>}
        </div>
      )}
      {session.note && <div className="session-peek-line session-peek-clamp">📝 {session.note}</div>}
      <div className="session-peek-hint">{t("sidebar.renameSession")}</div>
    </div>
  );
}
