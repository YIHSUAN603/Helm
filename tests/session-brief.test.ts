// Session 提醒卡純函式測試（不需 GUI / Tauri）。
// 執行：node --experimental-strip-types tests/session-brief.test.ts
import assert from "node:assert";
import {
  ACTIVITY_CAP,
  BRIEF_AWAY_MS,
  TASKS_CAP,
  applyTaskUpdate,
  elapsedParts,
  hasSinceContent,
  latestOf,
  pushActivity,
  shouldShowBrief,
  summarizeSince,
  taskProgress,
  visibleTasks,
  type BriefActivity,
} from "../src/store/sessionBrief.ts";
import type { BriefTask } from "../src/agents/hookEvents.ts";

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

// ---- applyTaskUpdate / taskProgress / visibleTasks ----
{
  const t = (id: string, status: BriefTask["status"] = "pending", text = `task ${id}`): BriefTask => ({
    id,
    text,
    status,
  });
  const base = [t("1", "completed"), t("2", "in_progress"), t("3")];

  const replaced = applyTaskUpdate(base, { type: "replace", items: [t("a")] });
  check("replace 整份換掉", replaced?.length === 1 && replaced[0].id === "a");
  check(
    "replace 內容相同 → 原參照",
    applyTaskUpdate(base, { type: "replace", items: base.map((x) => ({ ...x })) }) === base,
  );

  const added = applyTaskUpdate(base, { type: "add", item: t("4") });
  check("add 追加在尾端", added?.length === 4 && added[3].id === "4");
  check("add 同 id 同標題 → 原參照", applyTaskUpdate(base, { type: "add", item: t("3") }) === base);
  const renamed = applyTaskUpdate(base, { type: "add", item: t("3", "pending", "新標題") });
  check("add 同 id 新標題 → 改標題不重複", renamed?.length === 3 && renamed[2].text === "新標題");
  check("從空清單 add", applyTaskUpdate(undefined, { type: "add", item: t("1") })?.length === 1);

  const patched = applyTaskUpdate(base, { type: "patch", id: "2", status: "completed" });
  check("patch 改狀態", patched?.[1].status === "completed" && patched[1].text === "task 2");
  check(
    "patch 沒變 → 原參照",
    applyTaskUpdate(base, { type: "patch", id: "2", status: "in_progress" }) === base,
  );
  check(
    "patch 不認得的 id 且無標題 → 原參照",
    applyTaskUpdate(base, { type: "patch", id: "x", status: "completed" }) === base,
  );
  const adopted = applyTaskUpdate(base, {
    type: "patch",
    id: "x",
    status: "completed",
    text: "早就有的任務",
  });
  check(
    "patch 不認得的 id 但有標題 → 補進來",
    adopted?.length === 4 && adopted[3].status === "completed",
  );

  const removed = applyTaskUpdate(base, { type: "remove", id: "1" });
  check("remove", removed?.length === 2 && removed[0].id === "2");
  check("remove 不存在 → 原參照", applyTaskUpdate(base, { type: "remove", id: "z" }) === base);

  let many: readonly BriefTask[] | undefined;
  for (let i = 0; i < TASKS_CAP + 3; i++) {
    many = applyTaskUpdate(many, { type: "add", item: t(String(i)) });
  }
  check("超過上限丟最舊", many?.length === TASKS_CAP && many[0].id === "3");
  check(
    "replace 也受上限約束",
    applyTaskUpdate(undefined, {
      type: "replace",
      items: Array.from({ length: TASKS_CAP + 5 }, (_, i) => t(String(i))),
    })?.length === TASKS_CAP,
  );

  const p = taskProgress(base);
  check("進度 = 完成數 / 總數", p.done === 1 && p.total === 3);
  check("空清單進度 0/0", taskProgress(undefined).total === 0);

  const list = [t("1", "completed"), t("2", "completed"), t("3", "in_progress"), t("4"), t("5")];
  const fit = visibleTasks(list, 10);
  check("放得下就全列", fit.items.length === 5 && fit.hidden === 0);
  const trimmed = visibleTasks(list, 3);
  check(
    "太長先從前面丟已完成的，順序不變",
    trimmed.items.map((x) => x.id).join() === "3,4,5" && trimmed.hidden === 2,
  );
  const tight = visibleTasks([t("1"), t("2"), t("3"), t("4")], 2);
  check(
    "沒有已完成可丟 → 截尾",
    tight.items.map((x) => x.id).join() === "1,2" && tight.hidden === 2,
  );
}

console.log(`\nsession-brief: ${passed} checks passed`);
