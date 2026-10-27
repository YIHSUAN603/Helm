// Companion 台詞庫測試：條件篩選、避免重複、每個 key 都有中英文字。
// Run: node --experimental-strip-types tests/companion-lines.test.ts
import assert from "node:assert";
import { LINES, eligibleLines, pickLine, type LineContext } from "../src/companion/lines.ts";
import { zhTW } from "../src/i18n/translations/zh-TW.ts";
import { en } from "../src/i18n/translations/en.ts";

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
}

// 每句台詞都要有中英文字，key 不重複
{
  const keys = LINES.map((l) => l.key);
  check("key 不重複", new Set(keys).size === keys.length);
  const missing = keys.filter((k) => !(k in zhTW) || !(k in en));
  check(`台詞都有翻譯（缺: ${missing.join(", ") || "無"}）`, missing.length === 0);
}

// 每個情境在 1 級、任何時段都至少有一句（避免某些情境默不作聲）
{
  const ctxs = [...new Set(LINES.map((l) => l.ctx))] as LineContext[];
  for (const ctx of ctxs) {
    for (const hour of [0, 9, 15, 21]) {
      check(`${ctx} @${hour}h 有台詞`, eligibleLines(ctx, { level: 1, hour }).length > 0);
    }
  }
}

// 等級與時段篩選
{
  const lv1 = eligibleLines("click", { level: 1, hour: 9 }).map((l) => l.key);
  const lv2 = eligibleLines("click", { level: 2, hour: 9 }).map((l) => l.key);
  const lv5 = eligibleLines("click", { level: 5, hour: 20 }).map((l) => l.key);
  check("1 級沒有早安", !lv1.includes("companion.line.click.morning"));
  check("2 級早上有早安", lv2.includes("companion.line.click.morning"));
  check("2 級早上沒有晚安", !lv2.includes("companion.line.click.evening"));
  check("3 級台詞 2 級拿不到", !lv2.includes("companion.line.click.done"));
  check("5 級晚上有晚安", lv5.includes("companion.line.click.evening"));
  check("5 級有專屬台詞", lv5.includes("companion.line.click.loyal1"));
}

// pickLine：排除上一句、rng 決定結果、沒有候選回 null
{
  const env = { level: 1, hour: 9 };
  const first = pickLine("annoyed", env, null, () => 0);
  check("rng 0 取第一句", first === "companion.line.annoyed.1");
  check("排除上一句", pickLine("annoyed", env, first, () => 0) === "companion.line.annoyed.2");
  check("rng 接近 1 不越界", pickLine("annoyed", env, null, () => 0.9999) === "companion.line.annoyed.3");
  check("只有一句時不排除", pickLine("unlock", env, "companion.line.unlock.1", () => 0) === "companion.line.unlock.1");
  for (let i = 0; i < 20; i++) {
    const r = Math.random;
    check("隨機挑也不重複上一句", pickLine("getUp", env, "companion.line.getUp.2", r) !== "companion.line.getUp.2");
  }
}

console.log(`companion-lines: ${passed} checks passed`);
