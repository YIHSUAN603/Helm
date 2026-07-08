// Per-session scan/stream working state (pure, no imports, so node tests can
// load it directly). The stream handler buffers each session's trailing
// partial line; the scan handler counts consecutive non-waiting scans while a
// prompt is pending (a single divergent scan may be a mid-redraw frame and
// must not clear the approval). Entries are keyed by session id and must be
// dropped on session close (closeSession) — the handlers themselves stop
// firing once the Terminal unmounts, so they cannot self-clean.

const lineBuffers = new Map<string, string>();
const nonWaitingStreaks = new Map<string, number>();

/** 殘餘半行長度上限：長時間無換行的輸出不能讓 buffer 無限成長。 */
export const LINE_BUFFER_MAX = 4000;

/**
 * Append a raw chunk to the session's partial-line buffer and return the
 * complete lines; the trailing partial line stays buffered (capped at
 * LINE_BUFFER_MAX, keeping the tail) for the next chunk.
 */
export function consumeLines(sessionId: string, chunk: string): string[] {
  let buf = (lineBuffers.get(sessionId) ?? "") + chunk;
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";
  if (buf.length > LINE_BUFFER_MAX) buf = buf.slice(-LINE_BUFFER_MAX);
  lineBuffers.set(sessionId, buf);
  return lines;
}

/** Count one more consecutive non-waiting scan and return the new streak. */
export function bumpNonWaitingStreak(sessionId: string): number {
  const streak = (nonWaitingStreaks.get(sessionId) ?? 0) + 1;
  nonWaitingStreaks.set(sessionId, streak);
  return streak;
}

/** Reset the streak (a waiting scan arrived, or the pending prompt resolved). */
export function resetNonWaitingStreak(sessionId: string): void {
  nonWaitingStreaks.delete(sessionId);
}

/** Forget the session's buffers (session close / housekeeping). */
export function clearScanState(sessionId: string): void {
  lineBuffers.delete(sessionId);
  nonWaitingStreaks.delete(sessionId);
}
