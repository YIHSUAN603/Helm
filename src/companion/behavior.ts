// Companion 的行為仲裁與互動判定（純函式，時間由呼叫端注入；node 測試可直接載入）。
//
// pickBehavior 是整個寵物的單一決策點：由上往下第一條符合的規則勝出。最重要的
// 不變式是「有人在等批准時，牠只做一件事：提醒你」—— 等批准的三條規則排在
// 一次性反應之前，所以點擊、里程碑、閒晃都會被打斷。這條寫在仲裁裡、由測試
// 鎖住，而不是靠元件各自記得檢查。
import type { AgentState } from "../agents/types";
import type { PetAnim } from "./petAnimation.ts";
import type { LineContext } from "./lines.ts";

/** 等批准多久開始在甲板上來回跑催你。 */
export const WAIT_NUDGE_MS = 60_000;
/** 等批准多久後不再跑，改成坐著乾等（跑太久只會變成干擾）。 */
export const WAIT_SETTLE_MS = 5 * 60_000;

/**
 * - stay：停在甲板上的位置（不在那裡時先走回去）
 * - here：原地播（一次性反應：揮手、跳一下不該先走回停留點）
 * - pace：在甲板上左右來回（向右用 running-right、向左用 running-left）
 * - stroll：pace 的慢速版，閒置時散步
 * - enter：從甲板右側跑進來
 * - exit：往左跑出甲板（被惹毛時）
 * - hold-last：播一次後停在最後一格（倒地）
 * - hidden：不在畫面上（被惹毛跑走了）
 */
export type Motion = "stay" | "here" | "pace" | "stroll" | "enter" | "exit" | "hold-last" | "hidden";

export interface Reaction {
  anim: PetAnim;
  until: number;
  motion?: Motion;
  line?: LineContext;
}

export interface BehaviorContext {
  now: number;
  /** 整個 fleet 裡最早進入 waiting 的時間；沒人在等時為 null。 */
  waitingSince: number | null;
  reaction: Reaction | null;
  awayUntil: number | null;
  /** 目前 session error / interrupted，且使用者還沒點牠起來。 */
  knockedOut: boolean;
  activeState?: AgentState;
  activeStalled: boolean;
  /** 整個 fleet 忙碌（thinking / tool / waiting）的 agent 數。 */
  busyCount: number;
  userIdle: boolean;
  night: boolean;
}

export interface Behavior {
  anim: PetAnim;
  motion: Motion;
  speed: number;
  line?: LineContext;
}

/** thinking 時的播放速度：fleet 越忙跑越快，1 個 1.0×、每多一個 +0.2，最多 1.6×。 */
export function busySpeed(busyCount: number): number {
  return Math.min(1.6, 1 + 0.2 * Math.max(0, busyCount - 1));
}

export function pickBehavior(ctx: BehaviorContext): Behavior {
  if (ctx.waitingSince !== null) {
    const waited = ctx.now - ctx.waitingSince;
    if (waited >= WAIT_SETTLE_MS) {
      return { anim: "waiting", motion: "stay", speed: 1, line: "stillWaiting" };
    }
    if (waited >= WAIT_NUDGE_MS) {
      return { anim: "running-right", motion: "pace", speed: 1.2 };
    }
    return { anim: "waiting", motion: "stay", speed: 1 };
  }
  if (ctx.reaction && ctx.now < ctx.reaction.until) {
    const r = ctx.reaction;
    return { anim: r.anim, motion: r.motion ?? "here", speed: 1, line: r.line };
  }
  if (ctx.awayUntil !== null && ctx.now < ctx.awayUntil) {
    return { anim: "idle", motion: "hidden", speed: 1 };
  }
  if (ctx.knockedOut) {
    return { anim: "failed", motion: "hold-last", speed: 1 };
  }
  if (ctx.activeStalled) {
    return { anim: "idle", motion: "stay", speed: 0.5, line: "stalled" };
  }
  if (ctx.activeState === "thinking") {
    return { anim: "running", motion: "stay", speed: busySpeed(ctx.busyCount) };
  }
  if (ctx.activeState === "tool") {
    return { anim: "running-right", motion: "pace", speed: busySpeed(ctx.busyCount) };
  }
  if (ctx.activeState === "done") {
    return { anim: "review", motion: "stay", speed: 1 };
  }
  if (ctx.userIdle) {
    return { anim: "running-right", motion: "stroll", speed: 0.6 };
  }
  if (ctx.night) {
    return { anim: "idle", motion: "stay", speed: 0.5, line: "sleepy" };
  }
  return { anim: "idle", motion: "stay", speed: 1 };
}

// ---- 連點 ----

export const CLICK_WINDOW_MS = 2_000;
export const ANNOYED_CLICKS = 5;
export const FLEE_CLICKS = 10;
export const FLEE_MS = 60_000;

export type ClickOutcome = "click" | "annoyed" | "flee";

/**
 * 記錄一次點擊，回傳 2 秒窗內的點擊時間與這一下的結果。剛好第 5 下惱怒、
 * 第 10 下跑走（之後歸零，回來後重新算）；其餘都是普通點擊。
 */
export function registerClick(
  times: readonly number[],
  now: number,
): { times: number[]; outcome: ClickOutcome } {
  const recent = times.filter((t) => now - t < CLICK_WINDOW_MS);
  recent.push(now);
  if (recent.length >= FLEE_CLICKS) return { times: [], outcome: "flee" };
  if (recent.length === ANNOYED_CLICKS) return { times: recent, outcome: "annoyed" };
  return { times: recent, outcome: "click" };
}

// ---- changed files 突增 ----

export const BURST_WINDOW_MS = 10_000;
export const BURST_FILES = 10;

/**
 * 記錄新增的 changed files 數；10 秒內累積超過 10 個就算突增（嚇一跳），
 * 觸發後清空，同一波不會連續嚇好幾次。
 */
export function registerFiles(
  samples: readonly { at: number; n: number }[],
  now: number,
  added: number,
): { samples: { at: number; n: number }[]; burst: boolean } {
  const recent = samples.filter((s) => now - s.at < BURST_WINDOW_MS);
  if (added > 0) recent.push({ at: now, n: added });
  const total = recent.reduce((a, s) => a + s.n, 0);
  if (total > BURST_FILES) return { samples: [], burst: true };
  return { samples: recent, burst: false };
}

// ---- 連續完成 ----

export const STREAK_CHEER = 3;

/** done 累加、error 歸零；剛好達到 3 次時歡呼並重新計算。 */
export function nextStreak(streak: number, event: "done" | "error"): { streak: number; cheer: boolean } {
  if (event === "error") return { streak: 0, cheer: false };
  const next = streak + 1;
  if (next >= STREAK_CHEER) return { streak: 0, cheer: true };
  return { streak: next, cheer: false };
}

// ---- 回答提示 ----

/**
 * 一次狀態轉移是否代表使用者回答了提示。pending = 已離開 waiting、還沒等到下一個
 * 明確狀態。不能只看 waiting → thinking / tool：Helm 面板與 Ctrl+A y/N 回答時
 * clearApproval 先把狀態清成 undefined，scan 清除路徑也可能如此，所以離開
 * waiting 後跨過 undefined 等下一個狀態；那是非 waiting 的狀態才算回答，又回到
 * waiting 則不算。
 */
export function trackAnswer(
  pending: boolean,
  prev: AgentState | undefined,
  next: AgentState | undefined,
): { pending: boolean; answered: boolean } {
  if (next === "waiting") return { pending: false, answered: false };
  if (!pending && prev !== "waiting") return { pending: false, answered: false };
  if (next === undefined) return { pending: true, answered: false };
  return { pending: false, answered: true };
}

// ---- 泡泡頻率 ----

/** 牠主動冒出的泡泡至少間隔多久；使用者點牠觸發的不受限制。 */
export const BUBBLE_GAP_MS = 120_000;

export function canSpeak(lastUnsolicitedAt: number | null, now: number, solicited: boolean): boolean {
  if (solicited) return true;
  return lastUnsolicitedAt === null || now - lastUnsolicitedAt >= BUBBLE_GAP_MS;
}

// ---- 使用者閒置 ----

export const USER_IDLE_MS = 5 * 60_000;

export function isUserIdle(lastInputAt: number, now: number): boolean {
  return now - lastInputAt >= USER_IDLE_MS;
}
