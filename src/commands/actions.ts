// Impure command helpers bridging the stores, PTY, and DOM focus.
// Shared by the command registry and components so buttons and hotkeys
// go through the exact same code path.
import { useSessionStore } from "../store/sessions";
import { useLayoutStore } from "../store/layout";
import { useUiStore } from "../store/ui";
import { useWorkspaceStore, expandWorkspace } from "../store/workspaces";
import {
  DEFAULT_WORKSPACE_ID,
  flattenGroupedIds,
  groupSessions,
} from "../store/workspaceGroups";
import { computeLayout, type SplitDir } from "../store/layoutTree";
import { getProfile } from "../agents/registry";
import { ptyWrite } from "../ipc/pty";
import { focusActiveTerminal } from "../focus/focusUtils";
import {
  nextPaneCyclic,
  nextPaneDirectional,
  resizeTarget,
  type NavDir,
} from "./paneNav";
import type { AgentLauncher } from "../agents/types";

/**
 * Make a session active (same semantics as clicking it in the sidebar)
 * and hand keyboard focus to its terminal.
 */
export function activateSession(id: string): void {
  const store = useSessionStore.getState();
  if (useUiStore.getState().viewMode === "split") {
    useLayoutStore.getState().attachSession(id, store.activeId);
  }
  store.setActive(id);
  // Keep the newly active session visible in the sidebar.
  const target = store.sessions.find((s) => s.id === id);
  if (target) expandWorkspace(target.workspaceId);
  // Terminal's focused-effect does not rerun when activeId is unchanged,
  // and the DOM updates after the next render — focus explicitly, post-paint.
  requestAnimationFrame(() => focusActiveTerminal());
}

/** Create a session (optionally from a launcher) and focus its terminal. */
export function newSession(launcher?: AgentLauncher, workspaceId?: string): void {
  const store = useSessionStore.getState();
  const focusedId = store.activeId;
  const id = store.createSession(launcher, workspaceId);
  if (useUiStore.getState().viewMode === "split") {
    useLayoutStore.getState().attachSession(id, focusedId);
  }
  requestAnimationFrame(() => focusActiveTerminal());
}

/** Split the active pane; splitting from single mode switches to split view. */
export function splitActivePane(dir: SplitDir, launcher?: AgentLauncher): void {
  const store = useSessionStore.getState();
  const active = store.activeId;
  if (!active) return;
  const layout = useLayoutStore.getState();
  useUiStore.getState().setViewMode("split");
  if (!layout.canSplitPane(active, dir)) return;
  const newId = store.createSession(launcher);
  layout.splitPane(active, dir, newId);
}

/** Session ids in sidebar visual order (grouped by workspace). */
function sessionIdsInSidebarOrder(): string[] {
  const { workspaces } = useWorkspaceStore.getState();
  const { sessions } = useSessionStore.getState();
  return flattenGroupedIds(groupSessions(workspaces, sessions));
}

/** Activate the next (+1) or previous (-1) session in sidebar order. */
export function cycleSession(step: 1 | -1): void {
  const ids = sessionIdsInSidebarOrder();
  if (ids.length < 2) return;
  const { activeId } = useSessionStore.getState();
  const idx = ids.indexOf(activeId ?? "");
  activateSession(ids[(idx + step + ids.length) % ids.length]);
}

/** Activate the Nth session in sidebar order (0-based); no-op when missing. */
export function switchToSessionIndex(index: number): void {
  const id = sessionIdsInSidebarOrder()[index];
  if (id) activateSession(id);
}

/** Create a workspace and return its id. */
export function newWorkspace(): string {
  return useWorkspaceStore.getState().createWorkspace();
}

/** Delete a workspace; its sessions move to the default one (never destroyed). */
export function removeWorkspace(id: string): void {
  if (id === DEFAULT_WORKSPACE_ID) return;
  const sessionStore = useSessionStore.getState();
  for (const s of sessionStore.sessions) {
    if (s.workspaceId === id) {
      sessionStore.moveSessionToWorkspace(s.id, DEFAULT_WORKSPACE_ID);
    }
  }
  useWorkspaceStore.getState().deleteWorkspace(id);
}

/** Write the profile's approve/reject key sequence to the PTY and clear the prompt. */
export function respondApproval(id: string, agentId: string | null, approve: boolean): void {
  const profile = getProfile(agentId);
  void ptyWrite(id, approve ? profile.approve : profile.reject);
  useSessionStore.getState().clearApproval(id);
}

export function respondAllApprovals(approve: boolean): void {
  const pending = useSessionStore.getState().sessions.filter((s) => s.pendingApproval);
  for (const s of pending) {
    respondApproval(s.id, s.agentId, approve);
  }
}

export function respondActiveApproval(approve: boolean): void {
  const { sessions, activeId } = useSessionStore.getState();
  const active = sessions.find((s) => s.id === activeId);
  if (active?.pendingApproval) {
    respondApproval(active.id, active.agentId, approve);
  }
}

/** Move pane focus directionally or cyclically (split mode only). */
export function focusPane(dir: NavDir | "next"): void {
  const root = useLayoutStore.getState().root;
  const active = useSessionStore.getState().activeId;
  if (!root || !active || useUiStore.getState().viewMode !== "split") return;
  const { leaves } = computeLayout(root);
  const next =
    dir === "next"
      ? nextPaneCyclic(leaves, active)
      : nextPaneDirectional(leaves, active, dir);
  if (next) activateSession(next);
}

/** Nudge the active pane's nearest matching split by one keyboard step. */
export function resizeActivePane(dir: NavDir): void {
  const root = useLayoutStore.getState().root;
  const active = useSessionStore.getState().activeId;
  if (!root || !active || useUiStore.getState().viewMode !== "split") return;
  const target = resizeTarget(root, active, dir);
  if (target) {
    useLayoutStore.getState().setRatio(target.splitId, target.ratio);
  }
}

export function focusBroadcastInput(): void {
  document.querySelector<HTMLElement>(".tb-broadcast input")?.focus();
}
