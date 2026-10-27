// Companion 行為仲裁測試：最重要的是「有人在等批准時，牠只做一件事：提醒你」。
// Run: node --experimental-strip-types tests/companion-behavior.test.ts
import assert from "node:assert";
import {
  ANNOYED_CLICKS,
  BUBBLE_GAP_MS,
  FLEE_CLICKS,
  USER_IDLE_MS,
  WAIT_NUDGE_MS,
  WAIT_SETTLE_MS,
  busySpeed,
  canSpeak,
  isUserIdle,
  nextStreak,
  pickBehavior,
  registerClick,
  registerFiles,
  type BehaviorContext,
} from "../src/companion/behavior.ts";

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
}

const NOW = 1_000_000_000;
function ctx(over: Partial<BehaviorContext> = {}): BehaviorContext {
  return {
    now: NOW,
    waitingSince: null,
    reaction: null,
    awayUntil: null,
    knockedOut: false,
    activeState: undefined,
    activeStalled: false,
    busyCount: 0,
    userIdle: false,
    night: false,
    ...over,
  };
}

// 等批准：三段升級
{
  const b = pickBehavior(ctx({ waitingSince: NOW - 1000 }));
  check("剛開始等 → waiting 原地", b.anim === "waiting" && b.motion === "stay" && !b.line);
  const nudge = pickBehavior(ctx({ waitingSince: NOW - WAIT_NUDGE_MS }));
  check("等滿 60 秒 → 來回跑", nudge.motion === "pace");
  const settle = pickBehavior(ctx({ waitingSince: NOW - WAIT_SETTLE_MS }));
  check("等滿 5 分鐘 → 坐著等 + 泡泡", settle.anim === "waiting" && settle.motion === "stay" && settle.line === "stillWaiting");
}

// 等批准勝過一切：反應、跑走、倒地、閒晃、深夜都被打斷
{
  const waiting = { waitingSince: NOW - 1000 };
  const reaction = { anim: "jumping" as const, until: NOW + 5000, line: "streak" as const };
  check("勝過一次性反應", pickBehavior(ctx({ ...waiting, reaction })).anim === "waiting");
  check("一次性反應的泡泡也被壓掉", pickBehavior(ctx({ ...waiting, reaction })).line === undefined);
  check("勝過跑走", pickBehavior(ctx({ ...waiting, awayUntil: NOW + 5000 })).motion !== "hidden");
  check("勝過倒地", pickBehavior(ctx({ ...waiting, knockedOut: true })).anim === "waiting");
  check("勝過閒晃", pickBehavior(ctx({ ...waiting, userIdle: true })).motion === "stay");
  check("勝過深夜", pickBehavior(ctx({ ...waiting, night: true })).line === undefined);
  check("勝過 thinking", pickBehavior(ctx({ ...waiting, activeState: "thinking" })).anim === "waiting");
}

// 一次性反應：期限內播、過期就讓位
{
  const reaction = { anim: "jumping" as const, until: NOW + 1, motion: "enter" as const, line: "streak" as const };
  const b = pickBehavior(ctx({ reaction, activeState: "thinking" }));
  check("期限內播反應", b.anim === "jumping" && b.motion === "enter" && b.line === "streak");
  const expired = { ...reaction, until: NOW };
  check("到期讓位給狀態", pickBehavior(ctx({ reaction: expired, activeState: "thinking" })).anim === "running");
  check("反應勝過倒地", pickBehavior(ctx({ reaction, knockedOut: true })).anim === "jumping");
}

// 跑走 / 倒地 / stalled
{
  check("跑走期間隱藏", pickBehavior(ctx({ awayUntil: NOW + 1 })).motion === "hidden");
  check("跑走期滿回來", pickBehavior(ctx({ awayUntil: NOW })).motion === "stay");
  const ko = pickBehavior(ctx({ knockedOut: true, activeState: "error" }));
  check("倒地停在最後一格", ko.anim === "failed" && ko.motion === "hold-last");
  const stalled = pickBehavior(ctx({ activeStalled: true, activeState: "thinking" }));
  check("stalled 勝過 thinking，放慢 + 泡泡", stalled.anim === "idle" && stalled.speed === 0.5 && stalled.line === "stalled");
}

// agent 狀態對應
{
  check("thinking → running", pickBehavior(ctx({ activeState: "thinking", busyCount: 1 })).anim === "running");
  const tool = pickBehavior(ctx({ activeState: "tool" }));
  check("tool → 來回跑", tool.anim === "running-right" && tool.motion === "pace");
  check("done → review", pickBehavior(ctx({ activeState: "done" })).anim === "review");
  check("沒事 → idle", pickBehavior(ctx()).anim === "idle");
  check("閒置 → 散步", pickBehavior(ctx({ userIdle: true })).motion === "stroll");
  check("忙碌時不散步", pickBehavior(ctx({ userIdle: true, activeState: "thinking" })).motion === "stay");
  const night = pickBehavior(ctx({ night: true }));
  check("深夜 → 打瞌睡", night.anim === "idle" && night.line === "sleepy" && night.speed < 1);
  check("閒置勝過深夜", pickBehavior(ctx({ night: true, userIdle: true })).motion === "stroll");
}

// fleet 越忙跑越快，有上限
{
  check("1 個 1.0×", busySpeed(1) === 1);
  check("0 個也是 1.0×", busySpeed(0) === 1);
  check("3 個 1.4×", Math.abs(busySpeed(3) - 1.4) < 1e-9);
  check("上限 1.6×", busySpeed(20) === 1.6);
}

// 連點：第 5 下惱怒、第 10 下跑走、超過 2 秒窗就重新算
{
  let times: number[] = [];
  const outcomes: string[] = [];
  for (let i = 0; i < FLEE_CLICKS; i++) {
    const r = registerClick(times, NOW + i * 100);
    times = r.times;
    outcomes.push(r.outcome);
  }
  check("第 5 下惱怒", outcomes[ANNOYED_CLICKS - 1] === "annoyed");
  check("第 6 下不會再惱怒", outcomes[ANNOYED_CLICKS] === "click");
  check("第 10 下跑走", outcomes[FLEE_CLICKS - 1] === "flee");
  check("跑走後歸零", times.length === 0);
  const slow = registerClick([NOW - 5000, NOW - 4000, NOW - 3000, NOW - 2500], NOW);
  check("窗外的點擊不算", slow.outcome === "click" && slow.times.length === 1);
}

// changed files 突增
{
  let r = registerFiles([], NOW, 6);
  check("6 個不算", !r.burst);
  r = registerFiles(r.samples, NOW + 5000, 5);
  check("10 秒內累積 11 個 → 突增", r.burst && r.samples.length === 0);
  const late = registerFiles([{ at: NOW - 11_000, n: 9 }], NOW, 5);
  check("窗外的不累積", !late.burst);
  check("0 個不留樣本", registerFiles([], NOW, 0).samples.length === 0);
}

// 連續完成
{
  let s = 0;
  let r = nextStreak(s, "done"); s = r.streak;
  r = nextStreak(s, "done"); s = r.streak;
  check("兩次還沒歡呼", !r.cheer && s === 2);
  r = nextStreak(s, "done");
  check("第三次歡呼並歸零", r.cheer && r.streak === 0);
  check("error 歸零", nextStreak(2, "error").streak === 0);
}

// 泡泡頻率與閒置
{
  check("從沒說過話可以說", canSpeak(null, NOW, false));
  check("間隔不足不說", !canSpeak(NOW - 1000, NOW, false));
  check("間隔足夠可以說", canSpeak(NOW - BUBBLE_GAP_MS, NOW, false));
  check("使用者點的不受限", canSpeak(NOW - 1000, NOW, true));
  check("剛操作不算閒置", !isUserIdle(NOW - 1000, NOW));
  check("5 分鐘沒操作算閒置", isUserIdle(NOW - USER_IDLE_MS, NOW));
}

console.log(`companion-behavior: ${passed} checks passed`);
