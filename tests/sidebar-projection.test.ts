// 側欄 session 投影（元素級 memoization / 參照穩定性）的純函式測試。
// 執行：node --experimental-strip-types tests/sidebar-projection.test.ts
import assert from "node:assert";
import { projectSidebarSessions } from "../src/store/sidebarProjection.ts";
import type { Session } from "../src/store/sessions.ts";

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
  console.log(`  ok - ${name}`);
}

function makeSession(id: string, over: Partial<Session> = {}): Session {
  return {
    id,
    title: `Session ${id}`,
    status: "idle",
    createdAt: 0,
    workspaceId: "default",
    agentId: null,
    ...over,
  };
}

// 相同輸入參照 → 直接回傳同一個輸出參照（selector 每次 store 變動都會呼叫）
const a = makeSession("a");
const b = makeSession("b");
const input1 = [a, b];
const out1 = projectSidebarSessions(input1);
check("同一輸入參照回傳同一輸出參照", projectSidebarSessions(input1) === out1);
check("投影保留側欄欄位", out1[0].id === "a" && out1[0].title === "Session a");

// cost-only 變更（非投影欄位）→ 陣列參照不變
const input2 = [{ ...a, cost: 1.23, tokensIn: 500 }, b];
const out2 = projectSidebarSessions(input2);
check("usage tick（cost/token）不換陣列參照", out2 === out1);

// title 變更（投影欄位）→ 陣列參照變，但未動的元素參照沿用
const input3 = [{ ...a, title: "renamed" }, b];
const out3 = projectSidebarSessions(input3);
check("投影欄位變更換新陣列參照", out3 !== out1);
check("變更的元素換新參照", out3[0] !== out1[0] && out3[0].title === "renamed");
check("未變更的元素沿用舊參照", out3[1] === out1[1]);

// session 移除 → 長度變、剩餘元素參照沿用
const input4 = [input3[1]];
const out4 = projectSidebarSessions(input4);
check("移除 session 後長度正確", out4.length === 1);
check("剩餘元素沿用舊參照", out4[0] === out3[1]);

// 移除後 cache 不殘留：同 id 再加回來會是新物件（舊投影已被回收）
const input5 = [input3[1], makeSession("a", { title: "renamed" })];
const out5 = projectSidebarSessions(input5);
check("移除後重加同 id 產生新投影物件", out5[1] !== out3[0]);

// 空陣列穩定
const empty1 = projectSidebarSessions([]);
const empty2 = projectSidebarSessions([]);
check("空陣列輸出參照穩定", empty1 === empty2 && empty1.length === 0);

console.log(`sidebar-projection: ${passed} checks passed`);
