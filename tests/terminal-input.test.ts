import assert from "node:assert";
import { trackTerminalInput } from "../src/components/Terminal/trackInput.ts";
import { initialSessionTracker } from "../src/store/initialSession.ts";

let passed = 0;
function check(name: string, condition: boolean) {
  assert.ok(condition, `FAIL: ${name}`);
  passed++;
  console.log(`  ok - ${name}`);
}

const session = { id: "initial", workspaceId: "workspace", status: "idle", agentId: null };
const container = new EventTarget();
let onKey: (() => void) | undefined;
const stopTracking = trackTerminalInput(session.id, {
  onKey: (listener) => {
    onKey = () => listener({ key: "a", domEvent: {} as KeyboardEvent });
    return { dispose: () => { onKey = undefined; } };
  },
}, container as HTMLElement);

function register() {
  initialSessionTracker.reset();
  initialSessionTracker.register(session.workspaceId, session.id);
}
function isEligible() {
  return initialSessionTracker.takeCandidate(session.workspaceId, [session]) === session.id;
}

register();
check("attaching input tracking does not mark the shell as used", isEligible());
register();
onKey?.();
check("terminal keyboard input prevents replacement", !isEligible());
for (const event of ["input", "paste", "compositionstart"]) {
  register();
  container.dispatchEvent(new Event(event));
  check(`${event} prevents replacement`, !isEligible());
}
stopTracking();
register();
container.dispatchEvent(new Event("paste"));
check("cleanup removes DOM input listeners", isEligible());
check("cleanup disposes terminal key listener", onKey === undefined);
initialSessionTracker.reset();

console.log(`\nterminal-input: ${passed} checks passed`);
