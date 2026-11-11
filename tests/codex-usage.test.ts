import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCodexPlanUsage } from "../src/agents/codexUsage.ts";

test("Codex quota windows use remaining percentage and unix reset times", () => {
  assert.deepEqual(parseCodexPlanUsage({ limit_id: "codex", primary: { used_percent: 23, window_minutes: 300, resets_at: 123 }, secondary: { used_percent: 100, window_minutes: 10080 } }), {
    fiveHourLeftPercent: 77, fiveHourResetsAt: 123,
    sevenDayLeftPercent: 0, sevenDayResetsAt: undefined,
  });
});
test("Missing, other-model, invalid and unknown windows do not invent quota", () => {
  for (const value of [null, {}, { limit_id: "spark", primary: { used_percent: 1, window_minutes: 300 } }, { primary: { used_percent: NaN, window_minutes: 300 } }, { primary: { used_percent: 1, window_minutes: 60 } }]) assert.equal(parseCodexPlanUsage(value), undefined);
});
