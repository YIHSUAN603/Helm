// Companion 寵物的逐幀運動（純函式，時間由呼叫端注入；node 測試可直接載入）。
//
// 為什麼不用 CSS keyframes：換動作時元素得重新掛載、keyframes 從頭播，寵物會從
// 來回跑的半路瞬間跳回停留點、或一下子跳到甲板最左邊；忙碌數一變、--dur / --pace
// 在動畫進行中被改掉，瀏覽器會用新時長重算進度，位置與影格也跟著跳。這裡改成
// 每一幀從「現在在哪、現在播到第幾格」往前推，任何切換都從當下狀態接續：要回
// 停留點就走回去、要來回跑就從所在位置出發、只有換了動畫列才從第一格開始。
import type { Behavior, Motion } from "./behavior.ts";
import { FRAME_MS, PET_ANIMS, type PetAnim } from "./petAnimation.ts";

/** 來回跑（pace）在 1.0× 速度下橫越甲板一次的時間。 */
export const PACE_CROSS_MS = 3_000;
/** 散步（stroll）橫越甲板一次的時間，不受速度影響。 */
export const STROLL_CROSS_MS = 7_000;
/** 走回停留點 / 進場 / 退場橫越整個甲板的時間（與 store 的 TRAVEL_MS 相同）。 */
export const WALK_CROSS_MS = 1_200;
/** 從隱藏或半透明回到完全顯示的淡入時間。 */
const FADE_IN_MS = 240;

export interface PetMotionState {
  /** 甲板上的位置，0 = 最左、1 = 最右（以可移動寬度為單位）；退場時會小於 0。 */
  x: number;
  dir: 1 | -1;
  /** 目前畫面上播的動畫列（走路時會蓋掉 behavior.anim）。 */
  anim: PetAnim;
  /** 影格位置（含小數），取整數部分顯示。 */
  frame: number;
  motion: Motion;
  opacity: number;
}

export interface PetMotionInput {
  behavior: Pick<Behavior, "anim" | "motion" | "speed">;
  /** 停留點（使用者拖放過的 deckX）。 */
  home: number;
  /** 拖曳中的位置；null = 沒在拖。 */
  dragX: number | null;
  /** 滑鼠停在牠身上：影格暫停（像在看你），位置照常。 */
  paused: boolean;
  /** prefers-reduced-motion：只顯示每個狀態的第一格，不位移。 */
  reduced: boolean;
}

export function initialPetMotion(home: number, behavior: Pick<Behavior, "anim" | "motion">): PetMotionState {
  return {
    x: behavior.motion === "enter" ? 1 : home,
    dir: -1,
    anim: behavior.anim,
    frame: 0,
    motion: behavior.motion,
    opacity: behavior.motion === "enter" || behavior.motion === "hidden" ? 0 : 1,
  };
}

/** 往 target 走一步；回傳新位置與是否已抵達。 */
function walk(x: number, target: number, rate: number, dt: number): { x: number; arrived: boolean } {
  const step = rate * dt;
  if (Math.abs(target - x) <= step) return { x: target, arrived: true };
  return { x: x + Math.sign(target - x) * step, arrived: false };
}

function runAnim(dir: 1 | -1): PetAnim {
  return dir > 0 ? "running-right" : "running-left";
}

/** 推進 dt 毫秒。dt 由呼叫端夾住上限（分頁切走回來時不會一步跨過整個甲板）。 */
export function stepPetMotion(s: PetMotionState, input: PetMotionInput, dt: number): PetMotionState {
  const { behavior, home, dragX } = input;
  let { x, dir, opacity } = s;
  let motion: Motion = behavior.motion;
  let anim: PetAnim = behavior.anim;
  let frameRate = behavior.speed;

  // 換動作的那一刻：只有「進場」需要重新起跑（從甲板右緣、透明開始）。
  if (motion !== s.motion && motion === "enter") {
    x = 1;
    opacity = 0;
  }

  if (dragX !== null) {
    x = dragX;
    anim = "failed";
    motion = "stay";
  } else if (input.reduced) {
    x = home;
  } else if (motion === "pace" || motion === "stroll") {
    const rate = motion === "stroll" ? 1 / STROLL_CROSS_MS : behavior.speed / PACE_CROSS_MS;
    // 退場後回來、或被拖到界外時先夾回甲板內，再從那裡出發。
    x = Math.min(1, Math.max(0, x)) + dir * rate * dt;
    if (x >= 1) {
      x = 1 - (x - 1);
      dir = -1;
    } else if (x <= 0) {
      x = -x;
      dir = 1;
    }
    x = Math.min(1, Math.max(0, x));
    anim = runAnim(dir);
  } else if (motion === "exit") {
    dir = -1;
    x -= dt / WALK_CROSS_MS;
    anim = "running-left";
    frameRate = 1;
  } else if (motion === "stay" || motion === "enter") {
    const w = walk(x, home, 1 / WALK_CROSS_MS, dt);
    if (!w.arrived) {
      dir = home > x ? 1 : -1;
      anim = runAnim(dir);
      frameRate = 1;
    }
    x = w.x;
  }
  // here / hold-last / hidden：原地不動。

  // 透明度：退場淡出（與走出甲板同步）、隱藏時歸零，其餘淡入到完全顯示。
  if (motion === "hidden") opacity = 0;
  else if (motion === "exit") opacity = Math.max(0, opacity - dt / WALK_CROSS_MS);
  else opacity = Math.min(1, opacity + dt / FADE_IN_MS);

  // 影格：換了動畫列才從第一格開始；速度變了只改推進速率，不會跳格。
  const frames = PET_ANIMS[anim].frames;
  let frame = anim === s.anim ? s.frame : 0;
  if (input.reduced) frame = 0;
  else if (!input.paused) frame += (dt * (frameRate > 0 ? frameRate : 1)) / FRAME_MS;
  if (motion === "hold-last" && dragX === null) frame = Math.min(frame, frames - 1);
  else frame %= frames;

  return { x, dir, anim, frame, motion, opacity };
}

/** 這一刻要顯示的格（欄號）。 */
export function frameColumn(s: PetMotionState): number {
  return Math.floor(s.frame) % PET_ANIMS[s.anim].frames;
}
