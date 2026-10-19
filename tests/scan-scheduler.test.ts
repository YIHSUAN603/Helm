import assert from "node:assert/strict";
import { test } from "node:test";
import { createScanScheduler } from "../src/components/Terminal/scanScheduler.ts";
import {
  bumpNonWaitingStreak,
  clearScanState,
  isHookWaitingFresh,
  markHookWaiting,
} from "../src/store/scanState.ts";

test("PTY 安靜後仍完成第二次確認，清除已回答的提示", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let pending = true;
  let scans = 0;
  const scheduler = createScanScheduler(() => {
    scans++;
    if (bumpNonWaitingStreak("quiet") < 2) return true;
    pending = false;
  }, 150);
  scheduler.schedule(150);
  t.mock.timers.tick(150);
  assert.equal(pending, true);
  t.mock.timers.tick(150);
  assert.equal(pending, false);
  t.mock.timers.tick(1000);
  assert.equal(scans, 2);
  clearScanState("quiet");
});

test("hook 寬限期結束後，沒有新輸出仍繼續確認提示是否消失", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let now = 1000;
  let pending = true;
  markHookWaiting("hook", now);
  const scheduler = createScanScheduler(() => {
    if (isHookWaitingFresh("hook", now)) return true;
    if (bumpNonWaitingStreak("hook") < 2) return true;
    pending = false;
  }, 150);
  scheduler.schedule(150);
  t.mock.timers.tick(150);
  assert.equal(pending, true);
  now += 2001;
  t.mock.timers.tick(150);
  assert.equal(pending, true);
  t.mock.timers.tick(150);
  assert.equal(pending, false);
  clearScanState("hook");
});

test("新輸出合併掃描，卸載時取消待執行的確認", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let scans = 0;
  const scheduler = createScanScheduler(() => {
    scans++;
    return true;
  }, 150);
  scheduler.schedule(150);
  t.mock.timers.tick(100);
  scheduler.schedule(150);
  t.mock.timers.tick(50);
  assert.equal(scans, 0);
  t.mock.timers.tick(100);
  assert.equal(scans, 1);
  scheduler.cancel();
  t.mock.timers.tick(1000);
  assert.equal(scans, 1);
});
