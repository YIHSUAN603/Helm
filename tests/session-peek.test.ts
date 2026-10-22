// 側欄 hover 摘要卡的純函式測試（不需 GUI / Tauri）。
// 執行：node --experimental-strip-types tests/session-peek.test.ts
import assert from "node:assert";
import { PEEK_MARGIN_PX, peekTop } from "../src/components/SessionSidebar/peekPosition.ts";
import { currentTask } from "../src/store/sessionBrief.ts";

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
  console.log(`  ok - ${name}`);
}

// ---- peekTop ----
check("放得下就對齊列頂", peekTop(100, 150, 900) === 100);
check("靠近底部往上推", peekTop(800, 150, 900) === 900 - PEEK_MARGIN_PX - 150);
check("列在視窗上方之外 → 貼齊頂端邊距", peekTop(-40, 150, 900) === PEEK_MARGIN_PX);
check("卡片比視窗高 → 貼齊頂端邊距（寧可裁底部）", peekTop(300, 2000, 900) === PEEK_MARGIN_PX);

// ---- currentTask ----
{
  const t = (id: string, status: "pending" | "in_progress" | "completed") => ({
    id,
    text: `task ${id}`,
    status,
  });
  check(
    "優先取 in_progress",
    currentTask([t("1", "completed"), t("2", "pending"), t("3", "in_progress")])?.id === "3",
  );
  check("沒有 in_progress → 第一個還沒做的", currentTask([t("1", "completed"), t("2", "pending")])?.id === "2");
  check("全部做完 → undefined", currentTask([t("1", "completed")]) === undefined);
  check("空清單 → undefined", currentTask(undefined) === undefined);
}

console.log(`\nsession-peek: ${passed} checks passed`);
