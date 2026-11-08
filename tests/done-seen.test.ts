// 「完成但還沒看」純函式測試（不需 GUI / Tauri）。
// 執行：node --experimental-strip-types tests/done-seen.test.ts
import assert from "node:assert";
import { markDoneSeen, nextDoneSeen } from "../src/store/doneSeen.ts";
import type { DoneSeenLike } from "../src/store/doneSeen.ts";

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
}

// markDoneSeen: 只標畫面上、處於 done、尚未看過的 session
{
  const sessions: DoneSeenLike[] = [
    { id: "a", agentState: "done" },
    { id: "b", agentState: "done" },
    { id: "c", agentState: "thinking" },
    { id: "d", agentState: "done", doneSeen: true },
  ];
  const next = markDoneSeen(sessions, ["a", "c", "d"]);
  check("可見的未讀 done 標為已看", next[0].doneSeen === true);
  check("不可見的 done 不動", next[1].doneSeen === undefined);
  check("非 done 不動（同一參考）", next[2] === sessions[2]);
  check("已看過的不重建物件", next[3] === sessions[3]);
  check("未動到的 session 保留參考", next[1] === sessions[1]);
  check("原陣列不被修改", sessions[0].doneSeen === undefined);
}

// markDoneSeen: 沒有任何變動時回同一個陣列參考（避免多餘重繪與快照寫入）
{
  const sessions: DoneSeenLike[] = [
    { id: "a", agentState: "done", doneSeen: true },
    { id: "b", agentState: "tool" },
  ];
  check("無變動 → 同參考", markDoneSeen(sessions, ["a", "b"]) === sessions);
  check("空 ids → 同參考", markDoneSeen(sessions, []) === sessions);
  check("ids 不含 done → 同參考", markDoneSeen(sessions, ["zzz"]) === sessions);
}

// nextDoneSeen: 進入 done 取「此刻是否正看著」，留在 done 沿用，離開即清除
{
  check("進入 done 且正看著 → true", nextDoneSeen("thinking", "done", undefined, true) === true);
  check(
    "進入 done 沒在看 → undefined",
    nextDoneSeen("thinking", "done", undefined, false) === undefined,
  );
  check("從 undefined 進入 done 同樣處理", nextDoneSeen(undefined, "done", undefined, true) === true);
  check("留在 done 沿用已看", nextDoneSeen("done", "done", true, false) === true);
  check("留在 done 沿用未看", nextDoneSeen("done", "done", undefined, true) === undefined);
  check("離開 done → 清除", nextDoneSeen("done", "thinking", true, true) === undefined);
  check("非 done 狀態一律 undefined", nextDoneSeen("tool", "waiting", true, true) === undefined);
}

console.log(`done-seen: ${passed} checks passed`);
