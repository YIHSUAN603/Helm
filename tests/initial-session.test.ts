import assert from "node:assert";
import { InitialSessionTracker } from "../src/store/initialSession.ts";

let passed = 0;
function check(name: string, condition: boolean) {
  assert.ok(condition, `FAIL: ${name}`);
  passed++;
  console.log(`  ok - ${name}`);
}

const original = { id: "initial", workspaceId: "workspace", status: "idle", agentId: null };
const replacement = { ...original, id: "replacement" };
const tracker = new InitialSessionTracker();
function register() {
  tracker.reset();
  tracker.register(original.workspaceId, original.id);
}
function begin() {
  register();
  tracker.takeCandidate(original.workspaceId, [original]);
  tracker.begin(original.workspaceId, original.id, replacement.id);
}

register();
check("untouched initial session is eligible", tracker.takeCandidate("workspace", [original]) === original.id);
check("folder selection consumes eligibility", tracker.takeCandidate("workspace", [original]) === undefined);
register();
check("shell prompt output does not count as use", tracker.takeCandidate("workspace", [{ ...original, status: "busy" }]) === original.id);

for (const [name, patch] of [
  ["renamed", { titleLocked: true }],
  ["restored", { restored: true }],
  ["exited", { status: "exited" }],
  ["launcher", { agentId: "codex" }],
  ["detected agent", { agentState: "thinking" }],
  ["startup command", { launchCommand: "npm run dev" }],
] as const) {
  register();
  check(`${name} session is preserved`, tracker.takeCandidate("workspace", [{ ...original, ...patch }]) === undefined);
}

register();
tracker.markUsed(original.id);
check("input permanently cancels eligibility", tracker.takeCandidate("workspace", [original]) === undefined);
register();
tracker.invalidateWorkspace("workspace");
check("creating another session permanently cancels eligibility", tracker.takeCandidate("workspace", [original]) === undefined);
register();
check("multiple sessions are preserved", tracker.takeCandidate("workspace", [original, replacement]) === undefined);
register();
check("an unrelated workspace does not interfere", tracker.takeCandidate("workspace", [original, { ...replacement, workspaceId: "other" }]) === original.id);
register();
check("missing initial session is preserved", tracker.takeCandidate("workspace", [replacement]) === undefined);

begin();
check("successful spawn permits closing original", tracker.finish("replacement", true, [original, replacement]) === original.id);
check("spawn completion is handled only once", tracker.finish("replacement", true, [original, replacement]) === undefined);
begin();
check("spawn failure or cwd fallback preserves original", tracker.finish("replacement", false, [original, replacement]) === undefined);
check("failed attempt cannot later remove original", tracker.finish("replacement", true, [original, replacement]) === undefined);
begin();
tracker.markUsed(original.id);
check("input during spawn preserves original", tracker.finish("replacement", true, [original, replacement]) === undefined);
begin();
tracker.invalidateWorkspace("workspace");
check("another session created during spawn preserves original", tracker.finish("replacement", true, [original, replacement]) === undefined);
begin();
tracker.remove(replacement.id);
check("closing replacement cancels removal", tracker.finish("replacement", true, [original, replacement]) === undefined);
begin();
check("original changed during spawn is preserved", tracker.finish("replacement", true, [{ ...original, titleLocked: true }, replacement]) === undefined);
begin();
check("original moved to another workspace is preserved", tracker.finish("replacement", true, [{ ...original, workspaceId: "other" }, replacement]) === undefined);
begin();
check("replacement moved to another workspace preserves original", tracker.finish("replacement", true, [original, { ...replacement, workspaceId: "other" }]) === undefined);
begin();
check("replacement exited before completion preserves original", tracker.finish("replacement", true, [original, { ...replacement, status: "exited" }]) === undefined);
begin();
tracker.reset();
check("restore clears pending replacements", tracker.finish("replacement", true, [original, replacement]) === undefined);
check("restore does not register candidates", tracker.takeCandidate("workspace", [original]) === undefined);
begin();
tracker.register("other", "other-initial");
tracker.invalidateWorkspace("other");
check("other workspace activity does not cancel pending replacement", tracker.finish("replacement", true, [original, replacement]) === original.id);

console.log(`\ninitial-session: ${passed} checks passed`);
