// Session 提醒卡純函式測試（不需 GUI / Tauri）。
// 執行：node --experimental-strip-types tests/session-brief.test.ts
import assert from "node:assert";
import {
  ACTIVITY_CAP,
  BRIEF_AWAY_MS,
  elapsedParts,
  hasSinceContent,
  latestOf,
  pushActivity,
  shouldShowBrief,
  summarizeSince,
  type BriefActivity,
} from "../src/store/sessionBrief.ts";

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
  console.log(`  ok - ${name}`);
}

const act = (at: number, tool: string, files: string[] = []): BriefActivity => ({
  at,
  tool,
  files,
});

// ---- pushActivity ----
{
  const one = pushActivity(undefined, act(1, "Edit"));
  check("從空開始追加", one.length === 1 && one[0].tool === "Edit");
  const original = [act(1, "Edit")];
  const next = pushActivity(original, act(2, "Bash"));
  check("回傳新陣列、不動原陣列", next !== original && original.length === 1);

  let list: BriefActivity[] = [];
  for (let i = 0; i < ACTIVITY_CAP + 5; i++) list = pushActivity(list, act(i, "Edit"));
  check("超過上限丟最舊", list.length === ACTIVITY_CAP && list[0].at === 5);
  check("尾端是最新", list[list.length - 1].at === ACTIVITY_CAP + 4);
}

// ---- summarizeSince ----
{
  const activities = [
    act(100, "Read"),
    act(200, "Edit", ["a.ts"]),
    act(300, "Bash"),
    act(400, "Edit", ["a.ts", "b.ts"]),
    act(500, "Bash"),
    act(600, "Edit", ["c.ts"]),
  ];
  const notifications = [
    { kind: "approval" as const, createdAt: 150 },
    { kind: "approval" as const, createdAt: 350 },
    { kind: "done" as const, createdAt: 650 },
  ];

  const s = summarizeSince(activities, notifications, 150);
  check(
    "只算 since 之後，次數多的在前",
    JSON.stringify(s.tools) ===
      JSON.stringify([
        { tool: "Edit", count: 3 },
        { tool: "Bash", count: 2 },
      ]),
  );
  check("since 那一刻（不含）之前的不算", !s.tools.some((x) => x.tool === "Read"));
  check("檔案數是不重複路徑", s.files === 3);
  check("通知依類型計數，邊界不含", s.alerts.approval === 1 && s.alerts.done === 1);

  const all = summarizeSince(activities, notifications, undefined);
  check("since 為 undefined → 總結全部", all.tools.some((x) => x.tool === "Read"));
  check("since 為 undefined → 通知全算", all.alerts.approval === 2);

  const tie = summarizeSince([act(1, "Write"), act(2, "Grep")], [], undefined);
  check("同次數保留首次出現順序", tie.tools[0].tool === "Write" && tie.tools[1].tool === "Grep");

  const empty = summarizeSince(activities, notifications, 1000);
  check("之後什麼都沒有 → 沒有內容", !hasSinceContent(empty));
  check("有活動 → 有內容", hasSinceContent(s));
  check(
    "只有通知也算有內容",
    hasSinceContent(summarizeSince([], [{ kind: "error", createdAt: 5 }], 0)),
  );
}

// ---- shouldShowBrief ----
{
  const leftAt = 10_000;
  const back = leftAt + BRIEF_AWAY_MS;
  check(
    "離開夠久且之後有事 → 顯示",
    shouldShowBrief({ leftAt, now: back, latestEventAt: leftAt + 1 }),
  );
  check(
    "離開不夠久 → 不顯示",
    !shouldShowBrief({ leftAt, now: back - 1, latestEventAt: leftAt + 1 }),
  );
  check(
    "期間沒有新事件 → 不顯示",
    !shouldShowBrief({ leftAt, now: back, latestEventAt: leftAt }),
  );
  check(
    "從沒離開過 → 不顯示",
    !shouldShowBrief({ leftAt: undefined, now: back, latestEventAt: back }),
  );
  check(
    "從沒有事件 → 不顯示",
    !shouldShowBrief({ leftAt, now: back, latestEventAt: undefined }),
  );
}

// ---- latestOf / elapsedParts ----
check("latestOf 取最晚、略過 undefined", latestOf(3, undefined, 9, 1) === 9);
check("latestOf 全缺 → undefined", latestOf(undefined, undefined) === undefined);
check("59 秒 → 秒", JSON.stringify(elapsedParts(59_999)) === '{"unit":"s","n":59}');
check("90 秒 → 1 分", JSON.stringify(elapsedParts(90_000)) === '{"unit":"m","n":1}');
check("2 小時", JSON.stringify(elapsedParts(2 * 3_600_000 + 5)) === '{"unit":"h","n":2}');
check("3 天", JSON.stringify(elapsedParts(3 * 86_400_000)) === '{"unit":"d","n":3}');
check("負值（時鐘回撥）視為 0", JSON.stringify(elapsedParts(-5)) === '{"unit":"s","n":0}');

console.log(`\nsession-brief: ${passed} checks passed`);
