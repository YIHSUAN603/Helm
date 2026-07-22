// Pure fleet-status helper tests (no GUI / Tauri needed).
// Run: node --experimental-strip-types tests/fleet.test.ts
import assert from "node:assert";
import { fleetCounts, fleetStateOf, nextIdInState } from "../src/store/fleet.ts";
import type { FleetState } from "../src/store/fleet.ts";

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
}

// fleetStateOf: thinking/tool 合併為 busy，其餘一對一，undefined 穿透
{
  check("thinking → busy", fleetStateOf("thinking") === "busy");
  check("tool → busy", fleetStateOf("tool") === "busy");
  check("waiting 原樣", fleetStateOf("waiting") === "waiting");
  check("error 原樣", fleetStateOf("error") === "error");
  check("done 原樣", fleetStateOf("done") === "done");
  check("undefined 穿透", fleetStateOf(undefined) === undefined);
}

// fleetCounts: 分類計數，無 agent 的 session 不計入
{
  const counts = fleetCounts([
    { agentState: "thinking" },
    { agentState: "tool" },
    { agentState: "waiting" },
    { agentState: "done" },
    {},
  ]);
  check("busy 合併計數", counts.busy === 2);
  check("waiting 計數", counts.waiting === 1);
  check("done 計數", counts.done === 1);
  check("error 為 0", counts.error === 0);
  check("空列表全 0", fleetCounts([]).busy === 0);
}

// nextIdInState: 依序輪替、環繞、active 不在候選中回第一個
{
  const states: Record<string, FleetState | undefined> = {
    a: "waiting",
    b: "busy",
    c: "waiting",
    d: undefined,
    e: "waiting",
  };
  const ids = ["a", "b", "c", "d", "e"];
  const stateOf = (id: string) => states[id];
  check("active 是候選 → 下一個", nextIdInState(ids, stateOf, "a", "waiting") === "c");
  check("尾端環繞回頭", nextIdInState(ids, stateOf, "e", "waiting") === "a");
  check("active 非候選 → 第一個", nextIdInState(ids, stateOf, "b", "waiting") === "a");
  check("active 為 null → 第一個", nextIdInState(ids, stateOf, null, "waiting") === "a");
  check("唯一候選點回自己", nextIdInState(ids, stateOf, "b", "busy") === "b");
  check("無候選 → undefined", nextIdInState(ids, stateOf, "a", "error") === undefined);
}

console.log(`fleet: ${passed} checks passed`);
