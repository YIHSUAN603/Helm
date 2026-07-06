// Pure workspace-grouping helper tests (no GUI / Tauri needed).
// Run: node --experimental-strip-types tests/workspace-groups.test.ts
import assert from "node:assert";
import {
  DEFAULT_WORKSPACE_ID,
  flattenGroupedIds,
  groupSessions,
  resolveTargetWorkspace,
  type Workspace,
} from "../src/store/workspaceGroups.ts";

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
  console.log(`  ok - ${name}`);
}

function ws(id: string, name = id): Workspace {
  return { id, name, collapsed: false };
}

function sess(id: string, workspaceId: string) {
  return { id, workspaceId };
}

// groupSessions: bucketing, empty groups, orphan fallback
{
  const workspaces = [ws(DEFAULT_WORKSPACE_ID), ws("w2")];
  const sessions = [sess("s1", DEFAULT_WORKSPACE_ID), sess("s2", "w2"), sess("s3", "w2")];
  const groups = groupSessions(workspaces, sessions);
  check("groups follow workspace array order", groups.map((g) => g.workspace.id).join(",") === "default,w2");
  check("sessions bucketed by workspaceId", groups[1].sessions.map((s) => s.id).join(",") === "s2,s3");
  check("default group holds its own sessions", groups[0].sessions.map((s) => s.id).join(",") === "s1");

  const withOrphan = groupSessions(workspaces, [sess("sX", "gone")]);
  check("orphan workspaceId falls back to default group", withOrphan[0].sessions.map((s) => s.id).join(",") === "sX");

  const empty = groupSessions([ws(DEFAULT_WORKSPACE_ID), ws("w2")], []);
  check("empty workspaces still produce groups", empty.length === 2 && empty.every((g) => g.sessions.length === 0));
}

// groupSessions: fallback when default workspace is absent
{
  const groups = groupSessions([ws("w1")], [sess("sX", "gone")]);
  check("without default, orphan falls into first group", groups[0].sessions.map((s) => s.id).join(",") === "sX");
}

// resolveTargetWorkspace
{
  const sessions = [sess("s1", DEFAULT_WORKSPACE_ID), sess("s2", "w2")];
  check("active session's workspace wins", resolveTargetWorkspace(sessions, "s2") === "w2");
  check("null active → default", resolveTargetWorkspace(sessions, null) === DEFAULT_WORKSPACE_ID);
  check("unknown active → default", resolveTargetWorkspace(sessions, "nope") === DEFAULT_WORKSPACE_ID);
  check("no sessions → default", resolveTargetWorkspace([], "s1") === DEFAULT_WORKSPACE_ID);
}

// flattenGroupedIds: visual order across groups
{
  const workspaces = [ws(DEFAULT_WORKSPACE_ID), ws("w2")];
  const sessions = [sess("s3", "w2"), sess("s1", DEFAULT_WORKSPACE_ID), sess("s2", "w2")];
  const flat = flattenGroupedIds(groupSessions(workspaces, sessions));
  check("flatten follows group order then insertion order", flat.join(",") === "s1,s3,s2");
  check("flatten empty groups → empty array", flattenGroupedIds(groupSessions(workspaces, [])).length === 0);
}

console.log(`\nworkspace-groups: ${passed} checks passed`);
