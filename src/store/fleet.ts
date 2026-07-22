// Toolbar 艦隊狀態列的純函式：全局 agent 狀態統計與「跳到下一個」輪替。
// 無 React/Zustand 依賴，node 測試可直接載入（tests/fleet.test.ts）。
import type { AgentState } from "../agents/types";

/** chip 的狀態分類：thinking/tool 合併為 busy，其餘一對一。 */
export type FleetState = "busy" | "waiting" | "error" | "done";

/** chips 的渲染順序（同 Toolbar 左→右）。 */
export const FLEET_STATES: FleetState[] = ["busy", "waiting", "error", "done"];

export function fleetStateOf(agentState?: AgentState): FleetState | undefined {
  if (agentState === undefined) return undefined;
  return agentState === "thinking" || agentState === "tool" ? "busy" : agentState;
}

/** 各狀態的 session 數（沒跑 agent 的 session 不計入任何一類）。 */
export function fleetCounts(
  sessions: { agentState?: AgentState }[],
): Record<FleetState, number> {
  const counts: Record<FleetState, number> = { busy: 0, waiting: 0, error: 0, done: 0 };
  for (const s of sessions) {
    const st = fleetStateOf(s.agentState);
    if (st) counts[st]++;
  }
  return counts;
}

/**
 * 以 orderedIds（sidebar 視覺順序）輪替：回傳 activeId 之後下一個處於該狀態的
 * id（環繞）；activeId 不在候選中則回第一個；沒有候選回 undefined。
 */
export function nextIdInState(
  orderedIds: string[],
  stateOf: (id: string) => FleetState | undefined,
  activeId: string | null,
  state: FleetState,
): string | undefined {
  const candidates = orderedIds.filter((id) => stateOf(id) === state);
  if (candidates.length === 0) return undefined;
  const idx = candidates.indexOf(activeId ?? "");
  return candidates[(idx + 1) % candidates.length];
}
