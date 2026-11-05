// Companion 的事件來源：比對 session store 前後兩版，把狀態轉移翻成 companion
// 的活動與反應。刻意用 subscribe 而不是在 sessions.ts 裡插呼叫 —— 彩蛋不該
// 出現在 agent 感知的主幹上，拿掉這個檔案整個功能就消失。
//
// 「回答了一個 prompt」看的是離開 waiting 後的下一個狀態（trackAnswer），而不是
// respondApproval：使用者在 terminal 直接按 y 不會經過 Helm 的按鈕。
import { useSessionStore, type Session } from "./sessions";
import { useNotificationsStore } from "./notifications";
import { detectAgentEvent, isBusyState } from "./notificationRouter";
import { resolveFocusedWorkspace } from "./workspaceGroups";
import { companionVisible, useCompanionStore } from "./companion";
import {
  LONG_TURN_MS,
  initialTurn,
  isUserIdle,
  nextStreak,
  registerFiles,
  stepTurn,
  trackAnswer,
  type TurnClock,
} from "../companion/behavior";

let doneStreak = 0;
let fileSamples: { at: number; n: number }[] = [];
let lastBusyCount = 0;
/** 已離開 waiting、還在等下一個明確狀態的 session（見 trackAnswer）。 */
let leftWaiting = new Set<string>();
/** 每個 session 這回合 agent 實際工作了多久（見 stepTurn）。 */
let turns = new Map<string, TurnClock>();

function onSessions(sessions: Session[], prevSessions: Session[], activeId: string | null): void {
  const companion = useCompanionStore.getState();
  const prevById = new Map(prevSessions.map((s) => [s.id, s]));
  const focusedWs = resolveFocusedWorkspace(sessions, activeId);
  let addedFiles = 0;

  for (const s of sessions) {
    const p = prevById.get(s.id);
    if (!p) continue;
    if (s.agentId && !p.agentId) companion.activity({ kind: "agentSession" });
    if (s.cost !== undefined && p.cost !== undefined && s.cost > p.cost) {
      companion.activity({ kind: "cost", deltaUsd: s.cost - p.cost });
    }
    if (s.workspaceId === focusedWs) {
      const delta = (s.changedFiles?.length ?? 0) - (p.changedFiles?.length ?? 0);
      if (delta > 0) addedFiles += delta;
    }
    if (s.agentState === p.agentState) continue;

    const answer = trackAnswer(leftWaiting.has(s.id), p.agentState, s.agentState);
    if (answer.pending) leftWaiting.add(s.id);
    else leftWaiting.delete(s.id);
    if (answer.answered) {
      companion.activity({ kind: "answered" });
      companion.react("waving");
    }
    if (isBusyState(s.agentState)) companion.revive(s.id);
    const turn = stepTurn(turns.get(s.id) ?? initialTurn(), s.agentState, Date.now());
    turns.set(s.id, turn.clock);
    const event = detectAgentEvent(p.agentState, s.agentState, "approval");
    if (event === "done") {
      companion.activity({ kind: "done" });
      // 寵物關著時才可能生效（條件全在 shouldPeek）；開著時是 no-op。
      companion.tryPeek({
        waiting: sessions.some((x) => x.agentState === "waiting"),
        anyError: sessions.some((x) => x.agentState === "error"),
      });
      const r = nextStreak(doneStreak, "done");
      doneStreak = r.streak;
      // 長回合完成比連續完成更值得慶祝：跳久一點，蓋過一般的歡呼。
      if (turn.finishedMs !== null && turn.finishedMs >= LONG_TURN_MS) {
        companion.react("jumping", { cycles: 4 });
        companion.fx("arc");
      } else if (r.cheer) {
        companion.react("jumping", { cycles: 2 });
      }
    } else if (event === "error") {
      doneStreak = nextStreak(doneStreak, "error").streak;
      if (s.id === activeId) companion.knockOut(s.id);
    }
  }

  // 被關掉的 session 不該留在倒地名單裡。
  for (const id of companion.knockedOut) {
    if (!sessions.some((s) => s.id === id)) companion.revive(id);
  }
  leftWaiting = new Set([...leftWaiting].filter((id) => sessions.some((s) => s.id === id)));
  turns = new Map([...turns].filter(([id]) => sessions.some((s) => s.id === id)));

  if (addedFiles > 0) {
    const r = registerFiles(fileSamples, Date.now(), addedFiles);
    fileSamples = r.samples;
    if (r.burst) {
      companion.react("jumping");
      companion.say("startled", false);
    }
  }

  const busy = sessions.filter((s) => isBusyState(s.agentState)).length;
  if (busy !== lastBusyCount) {
    lastBusyCount = busy;
    companion.activity({ kind: "fleetBusy", count: busy });
  }
}

/** 啟動 companion：讀進度、開始監聽。bootstrap 時呼叫一次。 */
export function startCompanionWatch(): void {
  void useCompanionStore.getState().load();

  useSessionStore.subscribe((s, prev) => {
    if (s.sessions === prev.sessions) return;
    onSessions(s.sessions, prev.sessions, s.activeId);
  });

  // interrupted 沒有對應的 agentState（PTY 死掉後狀態直接被清掉），只能從通知
  // 中心的事件拿到。
  let seen = new Set(useNotificationsStore.getState().items.map((n) => n.id));
  useNotificationsStore.subscribe((s) => {
    const next = new Set<string>();
    for (const n of s.items) {
      next.add(n.id);
      if (seen.has(n.id) || n.kind !== "interrupted") continue;
      if (n.sessionId === useSessionStore.getState().activeId) {
        useCompanionStore.getState().knockOut(n.sessionId);
      }
    }
    seen = next;
  });

  // 使用者是否閒置：passive、不攔任何事件，只記時間。閒置後回來時揮手。
  const onInput = () => {
    const now = Date.now();
    const wasIdle = isUserIdle(lastInputAt, now);
    lastInputAt = now;
    if (wasIdle && companionVisible(useCompanionStore.getState().data)) {
      useCompanionStore.getState().react("waving", { cycles: 2 });
    }
  };
  const opts = { capture: true, passive: true } as const;
  window.addEventListener("keydown", onInput, opts);
  window.addEventListener("pointerdown", onInput, opts);
  window.addEventListener("pointermove", onInput, opts);
}

let lastInputAt = Date.now();

/** 給 Companion 元件判斷閒置用（每次 tick 讀一次，不進 store 免得一直重繪）。 */
export function lastUserInputAt(): number {
  return lastInputAt;
}
