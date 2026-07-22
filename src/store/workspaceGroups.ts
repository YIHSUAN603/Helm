// Pure workspace-grouping helpers (no React/Zustand deps, unit-testable).
// Workspaces are ordered by array position; sessions are bucketed by their
// workspaceId, falling back to the default workspace defensively.

export const DEFAULT_WORKSPACE_ID = "default";

export interface Workspace {
  id: string;
  name: string;
  collapsed: boolean;
  /** Default working directory for new sessions created in this workspace. */
  folder?: string;
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

/** A session's position within its split-group cluster, for connector-line rendering. */
export interface SplitClusterInfo {
  /** Split-group id the session belongs to, or null if ungrouped. */
  groupId: string | null;
  /** solo = ungrouped; first/middle/last = position within its cluster block. */
  position: "solo" | "first" | "middle" | "last";
}

/**
 * Reorder sessions so members of the same split-group tree sit contiguously
 * (stable: a group's members keep their relative order, placed at the first
 * member's position), and tag each with its cluster info for sidebar rendering.
 */
export function clusterBySplitGroup<S extends { id: string }>(
  sessions: S[],
  groupIdOf: (sessionId: string) => string | null,
): { session: S; cluster: SplitClusterInfo }[] {
  const buckets = new Map<string, S[]>();
  for (const s of sessions) {
    const groupId = groupIdOf(s.id);
    if (groupId === null) continue;
    const bucket = buckets.get(groupId);
    if (bucket) bucket.push(s);
    else buckets.set(groupId, [s]);
  }

  const placed = new Set<string>();
  const result: { session: S; cluster: SplitClusterInfo }[] = [];
  for (const s of sessions) {
    if (placed.has(s.id)) continue;
    const groupId = groupIdOf(s.id);
    if (groupId === null) {
      placed.add(s.id);
      result.push({ session: s, cluster: { groupId: null, position: "solo" } });
      continue;
    }
    const members = buckets.get(groupId)!;
    members.forEach((member, i) => {
      placed.add(member.id);
      const position = i === 0 ? "first" : i === members.length - 1 ? "last" : "middle";
      result.push({ session: member, cluster: { groupId, position } });
    });
  }
  return result;
}
