export type PtyOperation = "pty_write" | "pty_resize" | "pty_kill";

export interface PtyFailure {
  operation: PtyOperation;
  sessionId: string;
  message: string;
}

/** Cleanup and keyboard handlers must always settle, including synchronous
 * invoke failures. Only an already-removed PTY is an expected failure. */
export async function runPtyOperation(
  operation: PtyOperation,
  sessionId: string,
  invoke: () => Promise<void>,
  report: (failure: PtyFailure) => void,
): Promise<void> {
  try {
    await invoke();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === `no pty session: ${sessionId}`) return;
    report({ operation, sessionId, message: message.slice(0, 512) });
  }
}
