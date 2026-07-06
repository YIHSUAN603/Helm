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

/** Workspace a new session should land in: the active session's, else default. */
export function resolveTargetWorkspace(
  sessions: { id: string; workspaceId: string }[],
  activeId: string | null,
): string {
  const active = sessions.find((s) => s.id === activeId);
  return active?.workspaceId ?? DEFAULT_WORKSPACE_ID;
}

/** Session ids in sidebar visual order (collapsed groups still included). */
export function flattenGroupedIds(
  groups: WorkspaceGroup<{ id: string; workspaceId: string }>[],
): string[] {
  return groups.flatMap((g) => g.sessions.map((s) => s.id));
}
