// Pure workspace-grouping helpers (no React/Zustand deps, unit-testable).
// Workspaces are ordered by array position; sessions are bucketed by their
// workspaceId, falling back to the default workspace defensively.

export const DEFAULT_WORKSPACE_ID = "default";

export interface Workspace {
  id: string;
  name: string;
  collapsed: boolean;
}

export interface WorkspaceGroup<S extends { workspaceId: string }> {
  workspace: Workspace;
  sessions: S[];
}

/** Bucket sessions under their workspace, in workspace array order. */
export function groupSessions<S extends { workspaceId: string }>(
  workspaces: Workspace[],
  sessions: S[],
): WorkspaceGroup<S>[] {
  const buckets = new Map<string, S[]>(workspaces.map((w) => [w.id, []]));
  const fallback = buckets.get(DEFAULT_WORKSPACE_ID) ?? buckets.values().next().value;
  for (const s of sessions) {
    (buckets.get(s.workspaceId) ?? fallback)?.push(s);
  }
  return workspaces.map((w) => ({ workspace: w, sessions: buckets.get(w.id) ?? [] }));
}

/**
 * Workspace that currently has focus: the active session's, else default.
 * Also where a new session lands.
 */
export function resolveFocusedWorkspace(
  sessions: { id: string; workspaceId: string }[],
  activeId: string | null,
): string {
  const active = sessions.find((s) => s.id === activeId);
  return active?.workspaceId ?? DEFAULT_WORKSPACE_ID;
}

/** Sessions belonging to one workspace, in insertion order. */
export function sessionsInWorkspace<S extends { workspaceId: string }>(
  sessions: S[],
  workspaceId: string,
): S[] {
  return sessions.filter((s) => s.workspaceId === workspaceId);
}

/** Sessions with a pending approval inside one workspace. */
export function pendingApprovalsInWorkspace<
  S extends { workspaceId: string; pendingApproval?: string },
>(sessions: S[], workspaceId: string): S[] {
  return sessions.filter((s) => s.workspaceId === workspaceId && s.pendingApproval);
}

/** Sum of session costs inside one workspace (missing cost counts as 0). */
export function workspaceTotalCost(
  sessions: { workspaceId: string; cost?: number }[],
  workspaceId: string,
): number {
  return sessionsInWorkspace(sessions, workspaceId).reduce(
    (sum, s) => sum + (s.cost ?? 0),
    0,
  );
}

/** Total changed-file entries across all sessions in one workspace. */
export function workspaceChangedFileCount(
  sessions: { workspaceId: string; changedFiles?: unknown[] }[],
  workspaceId: string,
): number {
  return sessionsInWorkspace(sessions, workspaceId).reduce(
    (sum, s) => sum + (s.changedFiles?.length ?? 0),
    0,
  );
}

/** Session ids in sidebar visual order (collapsed groups still included). */
export function flattenGroupedIds(
  groups: WorkspaceGroup<{ id: string; workspaceId: string }>[],
): string[] {
  return groups.flatMap((g) => g.sessions.map((s) => s.id));
}
