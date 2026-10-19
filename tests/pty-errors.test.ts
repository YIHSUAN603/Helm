import assert from "node:assert/strict";
import { runPtyOperation, type PtyFailure } from "../src/ipc/ptyErrors.ts";
import {
  addTerminalDiagnostic,
  TERMINAL_DIAGNOSTIC_CAP,
  type TerminalDiagnostic,
} from "../src/store/terminalDiagnosticEntries.ts";

let passed = 0;
async function check(name: string, run: () => void | Promise<void>) {
  await run();
  passed++;
  console.log(`  ok - ${name}`);
}

const failure: PtyFailure = {
  operation: "pty_write",
  sessionId: "session-1",
  message: "write failed: broken pipe",
};

await check("successful operations do not create diagnostics", async () => {
  const entries: PtyFailure[] = [];
  await runPtyOperation("pty_write", "session-1", async () => {}, (e) => entries.push(e));
  assert.equal(entries.length, 0);
});

await check("missing PTY is ignored only for the requested session", async () => {
  const entries: PtyFailure[] = [];
  for (const operation of ["pty_write", "pty_resize", "pty_kill"] as const) {
    await runPtyOperation(operation, "session-1", async () => {
      throw "no pty session: session-1";
    }, (e) => entries.push(e));
  }
  assert.equal(entries.length, 0);
  await runPtyOperation("pty_write", "session-1", async () => {
    throw "no pty session: another-session";
  }, (e) => entries.push(e));
  assert.equal(entries.length, 1);
});

await check("unexpected async failures resolve and report operation and session", async () => {
  const entries: PtyFailure[] = [];
  await runPtyOperation("pty_write", "session-1", async () => {
    throw new Error(failure.message);
  }, (e) => entries.push(e));
  assert.deepEqual(entries, [failure]);
});

await check("synchronous invoke failures also resolve without aborting cleanup", async () => {
  const entries: PtyFailure[] = [];
  await runPtyOperation("pty_kill", "session-1", () => {
    throw new Error("invoke failed");
  }, (e) => entries.push(e));
  assert.equal(entries[0].operation, "pty_kill");
  assert.equal(entries[0].message, "invoke failed");
});

await check("diagnostic messages have a bounded size", async () => {
  const entries: PtyFailure[] = [];
  await runPtyOperation("pty_resize", "session-1", async () => {
    throw "x".repeat(10000);
  }, (e) => entries.push(e));
  assert.equal(entries[0].message.length, 512);
});

await check("repeat failures merge across interleaved sessions and move to the top", () => {
  const original = addTerminalDiagnostic([], failure, 1000);
  const interleaved = addTerminalDiagnostic(original, { ...failure, sessionId: "other" }, 2000);
  const merged = addTerminalDiagnostic(interleaved, failure, 3000);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].sessionId, "session-1");
  assert.equal(merged[0].count, 2);
  assert.equal(merged[0].firstSeen, 1000);
  assert.equal(merged[0].lastSeen, 3000);
  assert.equal(original[0].count, 1);
});

await check("different operations and messages are separate records", () => {
  let entries = addTerminalDiagnostic([], failure, 1000);
  entries = addTerminalDiagnostic(entries, { ...failure, operation: "pty_resize" }, 2000);
  entries = addTerminalDiagnostic(entries, { ...failure, message: "other failure" }, 2000);
  assert.equal(entries.length, 3);
});

await check("a later recurrence starts a new diagnostic after the merge window", () => {
  let entries = addTerminalDiagnostic([], failure, 1000);
  entries = addTerminalDiagnostic(entries, failure, 31000);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].count, 1);
});

await check("history evicts old records at its cap", () => {
  let entries: TerminalDiagnostic[] = [];
  for (let i = 0; i < TERMINAL_DIAGNOSTIC_CAP + 10; i++) {
    entries = addTerminalDiagnostic(entries, { ...failure, sessionId: String(i) }, i);
  }
  assert.equal(entries.length, TERMINAL_DIAGNOSTIC_CAP);
  assert.equal(entries.at(-1)?.sessionId, "10");
});

console.log(`pty-errors: ${passed} checks passed`);
