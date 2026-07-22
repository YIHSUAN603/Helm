// Pure workspace-grouping helper tests (no GUI / Tauri needed).
// Run: node --experimental-strip-types tests/workspace-groups.test.ts
import assert from "node:assert";
import {
  DEFAULT_WORKSPACE_ID,
  clusterBySplitGroup,
  flattenGroupedIds,
  groupSessions,
  pendingApprovalsInWorkspace,
  resolveFocusedWorkspace,
  sessionsInWorkspace,
  workspaceChangedFileCount,
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

function sess(
  id: string,
  workspaceId: string,
  extra: { pendingApproval?: string; changedFiles?: unknown[] } = {},
) {
  return { id, workspaceId, ...extra };
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

// resolveFocusedWorkspace
{
  const sessions = [sess("s1", DEFAULT_WORKSPACE_ID), sess("s2", "w2")];
  check("active session's workspace wins", resolveFocusedWorkspace(sessions, "s2") === "w2");
  check("null active → default", resolveFocusedWorkspace(sessions, null) === DEFAULT_WORKSPACE_ID);
  check("unknown active → default", resolveFocusedWorkspace(sessions, "nope") === DEFAULT_WORKSPACE_ID);
  check("no sessions → default", resolveFocusedWorkspace([], "s1") === DEFAULT_WORKSPACE_ID);
}

// sessionsInWorkspace: membership and order
{
  const sessions = [sess("s1", "w1"), sess("s2", "w2"), sess("s3", "w1")];
  check(
    "only sessions of the workspace, insertion order kept",
    sessionsInWorkspace(sessions, "w1").map((s) => s.id).join(",") === "s1,s3",
  );
  check("unknown workspace → empty array", sessionsInWorkspace(sessions, "nope").length === 0);
}

// pendingApprovalsInWorkspace: workspace + pending filter
{
  const sessions = [
    sess("s1", "w1", { pendingApproval: "Allow?" }),
    sess("s2", "w1"),
    sess("s3", "w2", { pendingApproval: "Run?" }),
  ];
  check(
    "only pending sessions of the workspace",
    pendingApprovalsInWorkspace(sessions, "w1").map((s) => s.id).join(",") === "s1",
  );
  check(
    "other workspace's pending excluded",
    pendingApprovalsInWorkspace(sessions, "w2").map((s) => s.id).join(",") === "s3",
  );
  check(
    "no pending → empty array",
    pendingApprovalsInWorkspace([sess("s4", "w3")], "w3").length === 0,
  );
}

// workspaceChangedFileCount: per-workspace file totals
{
  const sessions = [
    sess("s1", "w1", { changedFiles: [{}, {}] }),
    sess("s2", "w1", { changedFiles: [{}] }),
    sess("s3", "w1"),
    sess("s4", "w2", { changedFiles: [{}] }),
  ];
  check("counts files across the workspace's sessions", workspaceChangedFileCount(sessions, "w1") === 3);
  check("other workspace not mixed in", workspaceChangedFileCount(sessions, "w2") === 1);
  check("empty workspace → 0", workspaceChangedFileCount(sessions, "nope") === 0);
}

// flattenGroupedIds: visual order across groups
{
  const workspaces = [ws(DEFAULT_WORKSPACE_ID), ws("w2")];
  const sessions = [sess("s3", "w2"), sess("s1", DEFAULT_WORKSPACE_ID), sess("s2", "w2")];
  const flat = flattenGroupedIds(groupSessions(workspaces, sessions));
  check("flatten follows group order then insertion order", flat.join(",") === "s1,s3,s2");
  check("flatten empty groups → empty array", flattenGroupedIds(groupSessions(workspaces, [])).length === 0);
}

// clusterBySplitGroup: reordering + position tagging
{
  const s = (id: string) => ({ id });

  // Interleaved group members get pulled together at the first member's spot.
  {
    const sessions = [s("a"), s("b"), s("c"), s("d")];
    const groupIdOf = (id: string) => (id === "a" || id === "c" ? "g1" : null);
    const result = clusterBySplitGroup(sessions, groupIdOf);
    check(
      "interleaved group members become contiguous, stable order otherwise",
      result.map((r) => r.session.id).join(",") === "a,c,b,d",
    );
    check(
      "ungrouped sessions tagged solo",
      result.find((r) => r.session.id === "b")!.cluster.position === "solo" &&
        result.find((r) => r.session.id === "b")!.cluster.groupId === null,
    );
    check(
      "2-member cluster tagged first/last (no middle)",
      result.find((r) => r.session.id === "a")!.cluster.position === "first" &&
        result.find((r) => r.session.id === "c")!.cluster.position === "last",
    );
  }

  // 3-member cluster: first/middle/last.
  {
    const sessions = [s("x"), s("y"), s("z")];
    const groupIdOf = () => "g2";
    const result = clusterBySplitGroup(sessions, groupIdOf);
    check(
      "3-member cluster tagged first/middle/last in order",
      result.map((r) => r.cluster.position).join(",") === "first,middle,last",
    );
    check(
      "all members share the same groupId",
      result.every((r) => r.cluster.groupId === "g2"),
    );
  }

  // All ungrouped: order unchanged, all solo.
  {
    const sessions = [s("p"), s("q")];
    const result = clusterBySplitGroup(sessions, () => null);
    check(
      "no groups → original order preserved",
      result.map((r) => r.session.id).join(",") === "p,q",
    );
    check("no groups → all solo", result.every((r) => r.cluster.position === "solo"));
  }
}

console.log(`\nworkspace-groups: ${passed} checks passed`);
