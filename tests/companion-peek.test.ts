// 偷看彩蛋測試：只在關掉後、寬限期過後、冷卻與次數內、沒有人在等批准時才出現。
// Run: node --experimental-strip-types tests/companion-peek.test.ts
import assert from "node:assert";
import {
  PEEK_CHANCE,
  PEEK_COOLDOWN_MS,
  PEEK_GRACE_MS,
  PEEK_MAX_PER_LAUNCH,
  pickPeekX,
  shouldPeek,
  type PeekContext,
} from "../src/companion/peek.ts";
import { defaultCompanion, normalizeCompanion } from "../src/companion/progress.ts";

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
}

const NOW = 1_800_000_000_000;
const ctx = (o: Partial<PeekContext> = {}): PeekContext => ({
  now: NOW,
  unlocked: true,
  enabled: false,
  peekAllowed: true,
  disabledAt: NOW - PEEK_GRACE_MS,
  lastPeekAt: null,
  peeksThisLaunch: 0,
  waiting: false,
  anyError: false,
  reducedMotion: false,
  ...o,
});
const hit = () => 0;
const miss = () => 0.99;

// 基本情況：條件都過、機率抽中才出現
{
  check("條件都過且抽中 → 偷看", shouldPeek(ctx(), hit));
  check("沒抽中 → 不偷看", !shouldPeek(ctx(), miss));
  check("機率邊界：剛好等於 PEEK_CHANCE 不算中", !shouldPeek(ctx(), () => PEEK_CHANCE));
}

// 身分條件
{
  check("未解鎖 → 不偷看", !shouldPeek(ctx({ unlocked: false }), hit));
  check("寵物開著 → 不偷看", !shouldPeek(ctx({ enabled: true }), hit));
  check("使用者關掉偷看 → 不偷看", !shouldPeek(ctx({ peekAllowed: false }), hit));
  check("reduced-motion → 不偷看", !shouldPeek(ctx({ reducedMotion: true }), hit));
}

// 不搶 agent 的注意力
{
  check("有人在等批准 → 不偷看", !shouldPeek(ctx({ waiting: true }), hit));
  check("有 session 出錯 → 不偷看", !shouldPeek(ctx({ anyError: true }), hit));
}

// 寬限期
{
  check("不知道何時關掉 → 不偷看", !shouldPeek(ctx({ disabledAt: null }), hit));
  check("剛關掉 → 不偷看", !shouldPeek(ctx({ disabledAt: NOW - 1 }), hit));
  check("寬限期差 1ms → 不偷看", !shouldPeek(ctx({ disabledAt: NOW - PEEK_GRACE_MS + 1 }), hit));
  check("寬限期剛好過 → 可以", shouldPeek(ctx({ disabledAt: NOW - PEEK_GRACE_MS }), hit));
}

// 冷卻與次數
{
  check("冷卻中 → 不偷看", !shouldPeek(ctx({ lastPeekAt: NOW - PEEK_COOLDOWN_MS + 1 }), hit));
  check("冷卻剛好過 → 可以", shouldPeek(ctx({ lastPeekAt: NOW - PEEK_COOLDOWN_MS }), hit));
  check(
    "本次啟動已達上限 → 不偷看",
    !shouldPeek(ctx({ peeksThisLaunch: PEEK_MAX_PER_LAUNCH }), hit),
  );
  check(
    "上限前一次 → 可以",
    shouldPeek(ctx({ peeksThisLaunch: PEEK_MAX_PER_LAUNCH - 1 }), hit),
  );
}

// rng 只在其餘條件都通過時才抽（不浪費、也不讓呼叫次數影響別的隨機序列）
{
  let calls = 0;
  shouldPeek(ctx({ enabled: true }), () => {
    calls++;
    return 0;
  });
  check("條件不過時不抽 rng", calls === 0);
}

// 位置避開甲板兩端
{
  check("rng=0 → 0.15", Math.abs(pickPeekX(() => 0) - 0.15) < 1e-9);
  check("rng→1 → 不超過 0.85", pickPeekX(() => 0.999999) <= 0.85);
}

// 設定欄位：預設開、舊檔沒有欄位時用預設值、壞值退回預設
{
  check("預設允許偷看", defaultCompanion().peek === true);
  const { peek: _drop, ...old } = defaultCompanion();
  check("舊檔沒有 peek → true", normalizeCompanion(old).peek === true);
  check("存了 false → false", normalizeCompanion({ ...defaultCompanion(), peek: false }).peek === false);
  check("壞值 → 預設", normalizeCompanion({ ...defaultCompanion(), peek: "nope" }).peek === true);
}

console.log(`companion-peek: ${passed} passed`);
