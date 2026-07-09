// Impure command helpers bridging the stores, PTY, and DOM focus.
// Shared by the command registry and components so buttons and hotkeys
// go through the exact same code path.
import { useSessionStore } from "../store/sessions";
import { clearApprovalNotify } from "../store/approvalNotify";
import { markApprovalAnswered } from "../store/approvalSuppress";
import { groupTreeOf, useLayoutStore } from "../store/layout";
import { useWorkspaceStore, expandWorkspace } from "../store/workspaces";
import {
  DEFAULT_WORKSPACE_ID,
  clusterBySplitGroup,
  flattenGroupedIds,
  groupSessions,
  pendingApprovalsInWorkspace,
  resolveFocusedWorkspace,
  sessionsInWorkspace,
} from "../store/workspaceGroups";
import { computeLayout, findTreeBySession, type LayoutNode, type SplitDir } from "../store/layoutTree";
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
 * and hand keyboard focus to its terminal. The view follows the session:
 * its split group's layout when grouped, fullscreen otherwise.
 */
export function activateSession(id: string): void {
  const store = useSessionStore.getState();
  const target = store.sessions.find((s) => s.id === id);
  store.setActive(id);
  // Keep the newly active session visible in the sidebar.
  if (target) expandWorkspace(target.workspaceId);
  // Terminal's focused-effect does not rerun when activeId is unchanged,
  // and the DOM updates after the next render — focus explicitly, post-paint.
  requestAnimationFrame(() => focusActiveTerminal());
}

/** A workspace's default folder (new sessions start here), or undefined when unset. */
function folderForWorkspace(id: string): string | undefined {
  return useWorkspaceStore.getState().workspaces.find((w) => w.id === id)?.folder || undefined;
}

/** Create an ungrouped session (optionally from a launcher) and focus its terminal. */
export function newSession(launcher?: AgentLauncher, workspaceId?: string): void {
  const store = useSessionStore.getState();
  const targetWs = workspaceId ?? resolveFocusedWorkspace(store.sessions, store.activeId);
  store.createSession(launcher, targetWs, folderForWorkspace(targetWs));
  requestAnimationFrame(() => focusActiveTerminal());
}

/** Split the active pane, creating a new session in the active session's group. */
export function splitActivePane(dir: SplitDir, launcher?: AgentLauncher): void {
  const store = useSessionStore.getState();
  const active = store.sessions.find((s) => s.id === store.activeId);
  if (!active) return;
  const layout = useLayoutStore.getState();
  if (!layout.canSplitPane(active.id, dir)) return;
  const newId = store.createSession(launcher, active.workspaceId, folderForWorkspace(active.workspaceId));
  layout.splitPane(active.id, dir, newId);
}

/** Session ids in sidebar visual order (grouped by workspace, then split-group cluster). */
function sessionIdsInSidebarOrder(): string[] {
  const { workspaces } = useWorkspaceStore.getState();
  const { sessions } = useSessionStore.getState();
  const { trees } = useLayoutStore.getState();
  const groupIdOf = (id: string) => findTreeBySession(trees, id);
  const groups = groupSessions(workspaces, sessions).map((g) => ({
    workspace: g.workspace,
    sessions: clusterBySplitGroup(g.sessions, groupIdOf).map((c) => c.session),
  }));
  return flattenGroupedIds(groups);
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

/** Create a workspace, open a fresh session in it, and return the workspace id. */
export function newWorkspace(): string {
  const id = useWorkspaceStore.getState().createWorkspace();
  newSession(undefined, id);
  return id;
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
  const store = useSessionStore.getState();
  const prompt = store.sessions.find((s) => s.id === id)?.pendingApproval;
  const profile = getProfile(agentId);
  void ptyWrite(id, approve ? profile.approve : profile.reject);
  store.clearApproval(id);
  // The TUI repaints past the menu asynchronously; scans in that window still
  // see the old prompt and would resurrect the approval just answered.
  if (prompt) markApprovalAnswered(id, prompt, Date.now());
  // Explicit response resets notification dedupe: a NEW approval with the
  // exact same prompt text must notify immediately.
  clearApprovalNotify(id);
}

/** Respond to every pending approval in the focused workspace only. */
export function respondAllApprovals(approve: boolean): void {
  const { sessions, activeId } = useSessionStore.getState();
  const workspaceId = resolveFocusedWorkspace(sessions, activeId);
  for (const s of pendingApprovalsInWorkspace(sessions, workspaceId)) {
    respondApproval(s.id, s.agentId, approve);
  }
}

/** Jump to the first session awaiting approval in a workspace. */
export function activateFirstPendingApproval(workspaceId: string): void {
  const { sessions } = useSessionStore.getState();
  const target = sessionsInWorkspace(sessions, workspaceId).find((s) => s.pendingApproval);
  if (target) activateSession(target.id);
}

export function respondActiveApproval(approve: boolean): void {
  const { sessions, activeId } = useSessionStore.getState();
  const active = sessions.find((s) => s.id === activeId);
  if (active?.pendingApproval) {
    respondApproval(active.id, active.agentId, approve);
  }
}

/** The active session's group tree (the one the view renders); null when ungrouped. */
function activeGroupTree(): LayoutNode | null {
  const { activeId } = useSessionStore.getState();
  return groupTreeOf(useLayoutStore.getState().trees, activeId);
}

/** Move pane focus directionally or cyclically (no-op when ungrouped). */
export function focusPane(dir: NavDir | "next"): void {
  const root = activeGroupTree();
  const active = useSessionStore.getState().activeId;
  if (!root || !active) return;
  const { leaves } = computeLayout(root);
  const next =
    dir === "next"
      ? nextPaneCyclic(leaves, active)
      : nextPaneDirectional(leaves, active, dir);
  if (next) activateSession(next);
}

/** Nudge the active pane's nearest matching split by one keyboard step. */
export function resizeActivePane(dir: NavDir): void {
  const root = activeGroupTree();
  const active = useSessionStore.getState().activeId;
  if (!root || !active) return;
  const target = resizeTarget(root, active, dir);
  if (target) {
    useLayoutStore.getState().setRatio(target.splitId, target.ratio);
  }
}

export function focusBroadcastInput(): void {
  document.querySelector<HTMLElement>(".tb-broadcast input")?.focus();
}

/** screen-style C-a a / C-a C-a: write a literal Ctrl+A (0x01) to the active PTY. */
export function sendPrefixLiteral(): void {
  const { activeId } = useSessionStore.getState();
  if (activeId) void ptyWrite(activeId, "\x01");
}
