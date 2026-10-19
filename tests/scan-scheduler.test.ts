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

test("持續輸出（spinner 每 100ms 重繪）時，最晚 maxWait 就掃描一次", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  let scans = 0;
  const scheduler = createScanScheduler(() => {
    scans++;
  }, 150);
  // 每 100ms 一筆輸出，持續 2 秒：純 debounce（150ms）在這段期間一次都不會觸發。
  for (let elapsed = 0; elapsed < 2000; elapsed += 100) {
    scheduler.schedule(150, 500);
    t.mock.timers.tick(100);
  }
  assert.equal(scans, 4, "2 秒內每 500ms 一次");
  // 最後一次 maxWait 掃描（2000ms）已在最後一筆輸出（1900ms）之後，不再多掃。
  t.mock.timers.tick(1000);
  assert.equal(scans, 4);
});

test("沒有 maxWait 時維持純 debounce（既有呼叫端行為不變）", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  let scans = 0;
  const scheduler = createScanScheduler(() => {
    scans++;
  }, 150);
  for (let elapsed = 0; elapsed < 2000; elapsed += 100) {
    scheduler.schedule(150);
    t.mock.timers.tick(100);
  }
  assert.equal(scans, 0);
  t.mock.timers.tick(150);
  assert.equal(scans, 1);
});

test("cancel 也清掉 maxWait 期限：下一輪重新起算", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  let scans = 0;
  const scheduler = createScanScheduler(() => {
    scans++;
  }, 150);
  // 連續輸出 400ms（期限是 500ms），還沒掃描就卸載。
  for (let elapsed = 0; elapsed < 400; elapsed += 100) {
    scheduler.schedule(150, 500);
    t.mock.timers.tick(100);
  }
  scheduler.cancel();
  assert.equal(scans, 0);
  // 新一輪：期限應從 400ms 重新起算（900ms），而不是沿用舊的 500ms。
  scheduler.schedule(150, 500);
  t.mock.timers.tick(140);
  assert.equal(scans, 0, "舊期限不該讓新一輪提早掃描");
  t.mock.timers.tick(10);
  assert.equal(scans, 1);
});
