// Companion 行為仲裁測試：最重要的是「有人在等批准時，牠只做一件事：提醒你」。
// Run: node --experimental-strip-types tests/companion-behavior.test.ts
import assert from "node:assert";
import {
  ANNOYED_CLICKS,
  BUBBLE_GAP_MS,
  CLICK_TALK_CHANCE,
  LONG_TURN_MS,
  STROKE_COOLDOWN_MS,
  STROKE_MIN_PX,
  STROKE_WINDOW_MS,
  FLEE_CLICKS,
  USER_IDLE_MS,
  WAIT_NUDGE_MS,
  WAIT_SETTLE_MS,
  busySpeed,
  canSpeak,
  clickTalks,
  initialStroke,
  initialTurn,
  isUserIdle,
  nextStreak,
  pickBehavior,
  registerClick,
  registerFiles,
  registerStroke,
  stepTurn,
  trackAnswer,
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
  check("等滿 60 秒 → 原地揮手", nudge.anim === "waving" && nudge.motion === "stay");
  const settle = pickBehavior(ctx({ waitingSince: NOW - WAIT_SETTLE_MS }));
  check("等滿 5 分鐘 → 不再揮手，坐著等、不講話", settle.anim === "waiting" && settle.motion === "stay" && !settle.line);
}

// 等批准勝過一切：反應、跑走、倒地、閒晃、深夜都被打斷
{
  const waiting = { waitingSince: NOW - 1000 };
  const reaction = { anim: "jumping" as const, until: NOW + 5000, line: "startled" as const };
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
  const reaction = { anim: "jumping" as const, until: NOW + 1, motion: "enter" as const, line: "startled" as const };
  const b = pickBehavior(ctx({ reaction, activeState: "thinking" }));
  check("期限內播反應", b.anim === "jumping" && b.motion === "enter" && b.line === "startled");
  const expired = { ...reaction, until: NOW };
  check("到期讓位給狀態", pickBehavior(ctx({ reaction: expired, activeState: "thinking" })).anim === "running");
  const inPlace = pickBehavior(ctx({ reaction: { anim: "waving", until: NOW + 1 } }));
  check("沒指定動作的反應原地播", inPlace.motion === "here");
  check("反應勝過倒地", pickBehavior(ctx({ reaction, knockedOut: true })).anim === "jumping");
}

// 跑走 / 倒地 / stalled
{
  check("跑走期間隱藏", pickBehavior(ctx({ awayUntil: NOW + 1 })).motion === "hidden");
  check("跑走期滿回來", pickBehavior(ctx({ awayUntil: NOW })).motion === "stay");
  const ko = pickBehavior(ctx({ knockedOut: true, activeState: "error" }));
  check("倒地停在最後一格", ko.anim === "failed" && ko.motion === "hold-last");
  const stalled = pickBehavior(ctx({ activeStalled: true, activeState: "thinking" }));
  check("stalled 勝過 thinking，放慢、不講話", stalled.anim === "idle" && stalled.speed === 0.5 && !stalled.line);
}

// agent 狀態對應
{
  check("thinking → running", pickBehavior(ctx({ activeState: "thinking", busyCount: 1 })).anim === "running");
  const tool = pickBehavior(ctx({ activeState: "tool" }));
  check("tool → 與 thinking 同一個原地動畫", tool.anim === "running" && tool.motion === "stay");
  const think = pickBehavior(ctx({ activeState: "thinking", busyCount: 3 }));
  const tool3 = pickBehavior(ctx({ activeState: "tool", busyCount: 3 }));
  check("thinking ↔ tool 切換不換動作", think.anim === tool3.anim && think.motion === tool3.motion && think.speed === tool3.speed);
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

// 回答提示：離開 waiting 後，跨過 undefined 等下一個明確狀態
{
  check("waiting → thinking 算回答", trackAnswer(false, "waiting", "thinking").answered);
  check("waiting → done 算回答（拒絕後停下）", trackAnswer(false, "waiting", "done").answered);
  // 面板 / Ctrl+A y 回答：clearApproval 先清成 undefined，之後才開始工作。
  const cleared = trackAnswer(false, "waiting", undefined);
  check("waiting → undefined 先掛著", cleared.pending && !cleared.answered);
  const resumed = trackAnswer(cleared.pending, undefined, "tool");
  check("undefined → tool 補算回答", resumed.answered && !resumed.pending);
  const again = trackAnswer(true, undefined, "waiting");
  check("又回到 waiting 不算", !again.answered && !again.pending);
  check("沒等過批准的 undefined → thinking 不算", !trackAnswer(false, undefined, "thinking").answered);
  check("thinking → tool 不算", !trackAnswer(false, "thinking", "tool").answered);
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

// 點牠多半只揮手，偶爾才說話
{
  check("rng 低於機率 → 說話", clickTalks(() => CLICK_TALK_CHANCE - 0.01));
  check("rng 等於機率 → 只揮手", !clickTalks(() => CLICK_TALK_CHANCE));
  check("說話機率不超過一半", CLICK_TALK_CHANCE <= 0.5);
}

// 摸頭：左右來回 3 次
{
  const stroke = (xs: number[], start = NOW, step = 100) => {
    let st = initialStroke();
    const hits: number[] = [];
    xs.forEach((x, i) => {
      const r = registerStroke(st, x, start + i * step);
      st = r.state;
      if (r.petted) hits.push(i);
    });
    return { st, hits };
  };
  check("來回 3 次 → 摸頭", stroke([0, 20, 0, 20, 0]).hits.length === 1);
  check("來回 2 次不算", stroke([0, 20, 0, 20]).hits.length === 0);
  check("一路往右不算", stroke([0, 10, 20, 30, 40, 50, 60]).hits.length === 0);
  const jitter = STROKE_MIN_PX - 1;
  check("小於門檻的抖動不算反轉", stroke([0, 20, 20 - jitter, 20, 20 - jitter, 20]).hits.length === 0);
  check("太慢不算", stroke([0, 20, 0, 20, 0], NOW, STROKE_WINDOW_MS / 2).hits.length === 0);
  // 摸完的冷卻期內繼續摸不再觸發，冷卻後可以再摸
  const fast = stroke([0, 20, 0, 20, 0, 20, 0, 20, 0], NOW, 100);
  check("冷卻期內不連發", fast.hits.length === 1);
  const after = registerStroke({ ...fast.st, quietUntil: NOW + STROKE_COOLDOWN_MS }, 20, NOW + STROKE_COOLDOWN_MS + 1);
  check("冷卻後重新累積", !after.petted);
}

// 長回合：只算 thinking / tool 的時間
{
  const MIN = 60_000;
  let c = initialTurn();
  c = stepTurn(c, "thinking", NOW).clock;
  c = stepTurn(c, "tool", NOW + 2 * MIN).clock;
  c = stepTurn(c, "waiting", NOW + 4 * MIN).clock;
  // 等批准 30 分鐘不算工作
  c = stepTurn(c, undefined, NOW + 34 * MIN).clock;
  c = stepTurn(c, "thinking", NOW + 34 * MIN).clock;
  const end = stepTurn(c, "done", NOW + 36 * MIN);
  check("工作時間 = 4 + 2 分鐘", end.finishedMs === 6 * MIN);
  check("6 分鐘算長回合", end.finishedMs! >= LONG_TURN_MS);
  check("結束後歸零", end.clock.workMs === 0 && end.clock.since === null);
  check("回合中不回報", stepTurn(initialTurn(), "thinking", NOW).finishedMs === null);
  const short = stepTurn(stepTurn(initialTurn(), "thinking", NOW).clock, "done", NOW + MIN);
  check("1 分鐘不算長回合", short.finishedMs === MIN && short.finishedMs < LONG_TURN_MS);
  const err = stepTurn(stepTurn(initialTurn(), "tool", NOW).clock, "error", NOW + 10 * MIN);
  check("error 也結束回合", err.finishedMs === 10 * MIN);
}

console.log(`companion-behavior: ${passed} checks passed`);
