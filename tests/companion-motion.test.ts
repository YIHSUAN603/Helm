// Companion 逐幀運動測試：任何切換都要從當下狀態接續，不能瞬間跳位或跳格。
// Run: node --experimental-strip-types tests/companion-motion.test.ts
import assert from "node:assert";
import type { Behavior } from "../src/companion/behavior.ts";
import {
  PACE_CROSS_MS,
  WALK_CROSS_MS,
  frameColumn,
  initialPetMotion,
  stepPetMotion,
  type PetMotionInput,
  type PetMotionState,
} from "../src/companion/petMotion.ts";
import { FRAME_MS } from "../src/companion/petAnimation.ts";

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
}

const STAY: Behavior = { anim: "idle", motion: "stay", speed: 1 };
const THINK: Behavior = { anim: "running", motion: "stay", speed: 1 };
const PACE: Behavior = { anim: "running-right", motion: "pace", speed: 1 };
const HOME = 0.5;

function input(behavior: Behavior, over: Partial<PetMotionInput> = {}): PetMotionInput {
  return { behavior, home: HOME, dragX: null, paused: false, reduced: false, ...over };
}

/** 以 16ms 一幀推進 ms 毫秒，回傳過程中單幀最大的位移。 */
function run(s: PetMotionState, inp: PetMotionInput, ms: number): { s: PetMotionState; maxJump: number } {
  let maxJump = 0;
  for (let t = 0; t < ms; t += 16) {
    const next = stepPetMotion(s, inp, 16);
    maxJump = Math.max(maxJump, Math.abs(next.x - s.x));
    s = next;
  }
  return { s, maxJump };
}

// 每幀最多走的距離：最快的是 1.6× 的 pace 與走回停留點。
const MAX_PER_FRAME = Math.max(1.6 / PACE_CROSS_MS, 1 / WALK_CROSS_MS) * 16 + 1e-9;

// 停留：站在停留點、播 behavior 的動畫
{
  const r = run(initialPetMotion(HOME, STAY), input(STAY), 1000);
  check("停在停留點", r.s.x === HOME && r.s.anim === "idle");
  check("影格有在走", r.s.frame > 0 && frameColumn(r.s) === Math.floor((62 * 16) / FRAME_MS) % 6);
}

// stay → pace：從所在位置出發，不跳到甲板左緣
{
  const start = initialPetMotion(HOME, STAY);
  const first = stepPetMotion(start, input(PACE), 16);
  check("起跑點就是原位", Math.abs(first.x - HOME) <= MAX_PER_FRAME);
  const r = run(start, input(PACE), 10_000);
  check("來回跑全程不跳位", r.maxJump <= MAX_PER_FRAME);
  check("跑的時候用左右兩列", r.s.anim === "running-right" || r.s.anim === "running-left");
  check("不跑出甲板", r.s.x >= 0 && r.s.x <= 1);
}

// pace → stay：走回停留點，到了才換回原本的動畫
{
  let s = run(initialPetMotion(HOME, STAY), input(PACE), 1100).s;
  check("前提：已離開停留點", Math.abs(s.x - HOME) > 0.2);
  s = stepPetMotion(s, input(THINK), 16);
  check("不瞬移回停留點", s.x !== HOME);
  check("走回去時播跑步列", s.anim === "running-left" || s.anim === "running-right");
  const r = run(s, input(THINK), WALK_CROSS_MS);
  check("走回去全程不跳位", r.maxJump <= MAX_PER_FRAME);
  check("一趟內走回停留點", r.s.x === HOME && r.s.anim === "running");
}

// 速度改變：只改推進速率，影格與位置都不跳
{
  const s = run(initialPetMotion(HOME, STAY), input(PACE), 500).s;
  const faster = stepPetMotion(s, input({ ...PACE, speed: 1.6 }), 16);
  check("加速不跳位", Math.abs(faster.x - s.x) <= MAX_PER_FRAME);
  check("加速不跳格", faster.anim === s.anim && faster.frame - s.frame < 1);
}

// 換了動畫列才從第一格開始
{
  const s = run(initialPetMotion(HOME, STAY), input(STAY), 300).s;
  check("前提：idle 播到後面", s.frame >= 1);
  const wave = stepPetMotion(s, input({ anim: "waving", motion: "here", speed: 1 }), 16);
  check("換列從第一格", frameColumn(wave) === 0);
}

// 一次性反應原地播：pace 半路被點，不先走回停留點
{
  const s = run(initialPetMotion(HOME, STAY), input(PACE), 1100).s;
  const wave = run(s, input({ anim: "waving", motion: "here", speed: 1 }), 500).s;
  check("原地揮手", wave.x === s.x && wave.anim === "waving");
}

// 倒地：播一次停在最後一格
{
  const r = run(initialPetMotion(HOME, STAY), input({ anim: "failed", motion: "hold-last", speed: 1 }), 5000);
  check("停在最後一格", frameColumn(r.s) === 7);
}

// 進場從右緣淡入、走到停留點；退場往左淡出；跑走回來從左邊走回停留點
{
  const enter: Behavior = { anim: "running-left", motion: "enter", speed: 1 };
  const e0 = stepPetMotion(initialPetMotion(HOME, STAY), input(enter), 16);
  check("進場從右緣出發", e0.x > 0.95 && e0.opacity < 0.2);
  const e1 = run(e0, input(enter), WALK_CROSS_MS).s;
  check("進場走到停留點、完全顯示", e1.x === HOME && e1.opacity === 1);

  const exit: Behavior = { anim: "running-left", motion: "exit", speed: 1 };
  const x1 = run(e1, input(exit), WALK_CROSS_MS).s;
  check("退場往左走出去", x1.x < 0 && x1.opacity < 0.01);
  const hid = run(x1, input({ anim: "idle", motion: "hidden", speed: 1 }), 1000).s;
  check("隱藏時看不見", hid.opacity === 0);
  const back = run(hid, input(STAY), 2 * WALK_CROSS_MS);
  check("回來時從左邊走回停留點", back.maxJump <= MAX_PER_FRAME && back.s.x === HOME && back.s.opacity === 1);
}

// 拖曳：跟著游標、播 failed
{
  const s = stepPetMotion(initialPetMotion(HOME, STAY), input(STAY, { dragX: 0.9 }), 16);
  check("跟著游標", s.x === 0.9 && s.anim === "failed");
}

// 滑鼠停在身上：影格暫停
{
  const s = run(initialPetMotion(HOME, STAY), input(STAY), 300).s;
  const held = run(s, input(STAY, { paused: true }), 1000).s;
  check("暫停影格", held.frame === s.frame);
}

// 減少動態效果：第一格、停在停留點
{
  const r = run(initialPetMotion(HOME, STAY), input(PACE, { reduced: true }), 2000);
  check("不位移", r.s.x === HOME);
  check("第一格", frameColumn(r.s) === 0);
}

console.log(`companion-motion: ${passed} checks passed`);
