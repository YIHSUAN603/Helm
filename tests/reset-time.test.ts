import assert from "node:assert/strict";
import { test } from "node:test";
import { fmtResetTime } from "../src/components/Toolbar/resetTime.ts";

// 2026-11-11 15:49 本地時間；比較時用同一個 locale 格式化期望值，避開時區差異。
const now = new Date(2026, 10, 11, 15, 49).getTime();
const sec = (d: Date) => d.getTime() / 1000;
const time: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };

test("Reset within 24 hours shows only the time", () => {
  const at = new Date(2026, 10, 11, 20, 38);
  assert.equal(fmtResetTime(sec(at), now, "en-US"), at.toLocaleTimeString("en-US", time));
});

test("Weekly reset days away carries the date so it cannot read as today", () => {
  const at = new Date(2026, 10, 18, 15, 38);
  const out = fmtResetTime(sec(at), now, "en-US")!;
  assert.equal(out, at.toLocaleString("en-US", { month: "numeric", day: "numeric", ...time }));
  assert.match(out, /11\/18/);
});

test("Missing or invalid reset time yields no text", () => {
  assert.equal(fmtResetTime(undefined, now), undefined);
  assert.equal(fmtResetTime(NaN, now), undefined);
});
