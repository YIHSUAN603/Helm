import type { PtyFailure } from "../ipc/ptyErrors.ts";

export interface TerminalDiagnostic extends PtyFailure {
  firstSeen: number;
  lastSeen: number;
  count: number;
}

export const TERMINAL_DIAGNOSTIC_CAP = 50;
const MERGE_WINDOW_MS = 30_000;

/** Bounded session-local history; repeated input/resize failures share a row. */
export function addTerminalDiagnostic(
  entries: TerminalDiagnostic[],
  failure: PtyFailure,
  now: number,
): TerminalDiagnostic[] {
  const index = entries.findIndex((entry) =>
    entry.operation === failure.operation &&
    entry.sessionId === failure.sessionId &&
    entry.message === failure.message &&
    now >= entry.lastSeen && now - entry.lastSeen < MERGE_WINDOW_MS,
  );
  const next = entries.slice();
  const previous = index >= 0 ? next.splice(index, 1)[0] : undefined;
  next.unshift({
    ...failure,
    firstSeen: previous?.firstSeen ?? now,
    lastSeen: now,
    count: (previous?.count ?? 0) + 1,
  });
  return next.slice(0, TERMINAL_DIAGNOSTIC_CAP);
}
