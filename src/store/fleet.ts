// Toolbar 艦隊狀態列的純函式：全局 agent 狀態統計、「跳到下一個」輪替、
// workspace 狀態彙整，以及所有狀態燈共用的 CSS class。
// 無 React/Zustand 依賴，node 測試可直接載入（tests/fleet.test.ts）。
import type { AgentState } from "../agents/types";

/** chip 的狀態分類：thinking/tool 合併為 busy，其餘一對一。 */
export type FleetState = "busy" | "waiting" | "error" | "done";

/** chips 的渲染順序（同 Toolbar 左→右）。 */
export const FLEET_STATES: FleetState[] = ["busy", "waiting", "error", "done"];

/** 讀狀態所需的最小 session 形狀（Session / SidebarSession 都符合）。 */
export interface FleetSessionLike {
  agentState?: AgentState;
  /** done 已經被使用者看過（見 doneSeen.ts）。 */
  doneSeen?: boolean;
}

export function fleetStateOf(agentState?: AgentState): FleetState | undefined {
  if (agentState === undefined) return undefined;
  return agentState === "thinking" || agentState === "tool" ? "busy" : agentState;
}

/**
 * 以 session 為單位的分類：看過的 done 不再算 done —— 它已經不需要使用者
 * 注意，等同閒置。fleet chip、跳轉與 workspace 彙整都走這一個定義。
 */
export function fleetStateOfSession(s: FleetSessionLike): FleetState | undefined {
  if (s.agentState === "done" && s.doneSeen) return undefined;
  return fleetStateOf(s.agentState);
}

/** 各狀態的 session 數（沒跑 agent、或 done 已讀的 session 不計入任何一類）。 */
export function fleetCounts(sessions: FleetSessionLike[]): Record<FleetState, number> {
  const counts: Record<FleetState, number> = { busy: 0, waiting: 0, error: 0, done: 0 };
  for (const s of sessions) {
    const st = fleetStateOfSession(s);
    if (st) counts[st]++;
  }
  return counts;
}

/** workspace 彙整的優先序：越前面越需要使用者處理。 */
const ROLLUP_PRIORITY: FleetState[] = ["waiting", "error", "busy", "done"];

/**
 * 一組 session 彙整成單一狀態（workspace 標題的狀態燈）：任一個 waiting 就是
 * waiting，其次 error、busy、未讀 done；都沒有回 undefined。
 */
export function rollupFleetState(sessions: FleetSessionLike[]): FleetState | undefined {
  const present = new Set<FleetState>();
  for (const s of sessions) {
    const st = fleetStateOfSession(s);
    if (st) present.add(st);
  }
  return ROLLUP_PRIORITY.find((st) => present.has(st));
}

/** FleetState → status-dot class（busy 取 thinking 的樣式）。 */
export function fleetDotClass(state: FleetState): string {
  return state === "busy" ? "agent-thinking" : `agent-${state}`;
}

/**
 * 單一 session 的狀態燈 class：agent 狀態優先，否則活動狀態。看過的 done 降為
 * agent-idle（灰），讓綠燈只代表「做完了、你還沒看」。
 */
export function statusDotClass(
  s: FleetSessionLike & { status: string },
): string {
  if (s.agentState === "done" && s.doneSeen) return "agent-idle";
  return s.agentState ? `agent-${s.agentState}` : s.status;
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
