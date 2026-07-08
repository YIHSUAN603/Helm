// Per-session scan/stream working state (pure, no imports, so node tests can
// load it directly). The stream handler buffers each session's trailing
// partial line; the scan handler counts consecutive non-waiting scans while a
// prompt is pending (a single divergent scan may be a mid-redraw frame and
// must not clear the approval). Entries are keyed by session id and must be
// dropped on session close (closeSession) — the handlers themselves stop
// firing once the Terminal unmounts, so they cannot self-clean.

const lineBuffers = new Map<string, string>();
const nonWaitingStreaks = new Map<string, number>();
const emptyScanStreaks = new Map<string, number>();

/** 殘餘半行長度上限：長時間無換行的輸出不能讓 buffer 無限成長。 */
export const LINE_BUFFER_MAX = 4000;

/**
 * stream 每 chunk 最多處理的行數，超過只取尾端：洪水輸出（cat 大檔、build
 * log）一個 64KB chunk 可含上萬短行，逐行 stripAnsi + regex 會同步卡住
 * main thread。cost/token 行是「最新覆蓋」語意，取尾端天然正確；fileChange
 * 是逐檔的人速輸出，單一 chunk 塞超過這個行數的檔案變更行並不現實。
 */
export const STREAM_MAX_LINES_PER_CHUNK = 200;

/**
 * Append a raw chunk to the session's partial-line buffer and return the
 * complete lines; the trailing partial line stays buffered (capped at
 * LINE_BUFFER_MAX, keeping the tail) for the next chunk. With maxLines set,
 * only the trailing maxLines lines are returned (see STREAM_MAX_LINES_PER_CHUNK).
 */
export function consumeLines(
  sessionId: string,
  chunk: string,
  maxLines = Infinity,
): string[] {
  let buf = (lineBuffers.get(sessionId) ?? "") + chunk;
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";
  if (buf.length > LINE_BUFFER_MAX) buf = buf.slice(-LINE_BUFFER_MAX);
  lineBuffers.set(sessionId, buf);
  return lines.length > maxLines ? lines.slice(-maxLines) : lines;
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

/**
 * Count one more consecutive no-state scan and return the new streak. Scans
 * that derive no state at all (agent quit back to the shell) must clear a
 * stale agentState, but only after two in a row — a single empty frame may be
 * a mid-redraw transient.
 */
export function bumpEmptyScanStreak(sessionId: string): number {
  const streak = (emptyScanStreaks.get(sessionId) ?? 0) + 1;
  emptyScanStreaks.set(sessionId, streak);
  return streak;
}

/** Reset the streak (a scan derived a concrete state, or the stale state was cleared). */
export function resetEmptyScanStreak(sessionId: string): void {
  emptyScanStreaks.delete(sessionId);
}

/** Forget the session's buffers (session close / housekeeping). */
export function clearScanState(sessionId: string): void {
  lineBuffers.delete(sessionId);
  nonWaitingStreaks.delete(sessionId);
  emptyScanStreaks.delete(sessionId);
}
