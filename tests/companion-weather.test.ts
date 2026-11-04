// 甲板天氣測試：時段、海面、等批准時靜止、特效到期。
// Run: node --experimental-strip-types tests/companion-weather.test.ts
import assert from "node:assert";
import { FX_MS, pickWeather, skyOf, swellOf, type WeatherContext } from "../src/companion/weather.ts";

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
}

const NOW = 1_800_000_000_000;
const ctx = (o: Partial<WeatherContext> = {}): WeatherContext => ({
  now: NOW,
  hour: 10,
  waiting: false,
  busyCount: 0,
  anyError: false,
  fx: null,
  ...o,
});

// 時段邊界
{
  check("4 點是夜晚", skyOf(4) === "night");
  check("5 點天亮", skyOf(5) === "day");
  check("16 點白天", skyOf(16) === "day");
  check("17 點黃昏", skyOf(17) === "dusk");
  check("18 點黃昏", skyOf(18) === "dusk");
  check("19 點入夜", skyOf(19) === "night");
  check("0 點夜晚", skyOf(0) === "night");
}

// 海面
{
  check("沒人忙 → 平靜", pickWeather(ctx()).sea === "flat");
  check("有人忙 → 起伏", pickWeather(ctx({ busyCount: 1 })).sea === "swell");
  check("出錯 → 碎浪", pickWeather(ctx({ busyCount: 2, anyError: true })).sea === "choppy");
  check("沒人忙浪高 0", swellOf(0) === 0);
  check("1 個忙浪高 0.5", swellOf(1) === 0.5);
  check("越忙越高", swellOf(3) > swellOf(2));
  check("浪高有上限", swellOf(10) === 1);
}

// 等批准：海面靜止、沒有特效
{
  const fx = { kind: "arc" as const, until: NOW + FX_MS.arc };
  const w = pickWeather(ctx({ waiting: true, busyCount: 2, fx }));
  check("等批准 → 靜止", w.frozen);
  check("等批准 → 壓掉特效", w.fx === null);
  check("等批准仍保留時段", w.sky === "day");
  check("沒人等 → 不靜止", !pickWeather(ctx({ busyCount: 2 })).frozen);
}

// 特效到期
{
  const fx = { kind: "sparkle" as const, until: NOW + 1 };
  check("期限內播特效", pickWeather(ctx({ fx })).fx === "sparkle");
  check("到期不播", pickWeather(ctx({ fx, now: NOW + 1 })).fx === null);
}

console.log(`companion-weather: ${passed} checks passed`);
