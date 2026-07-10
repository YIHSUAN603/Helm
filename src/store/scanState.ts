// Per-session scan/stream working state (pure, no imports, so node tests can
// load it directly). The stream handler buffers each session's trailing
// partial line; the scan handler counts consecutive non-waiting scans while a
// prompt is pending (a single divergent scan may be a mid-redraw frame and
// must not clear the approval). Entries are keyed by session id and must be
// dropped on session close (closeSession) — the handlers themselves stop
// firing once the Terminal unmounts, so they cannot self-clean.

// type-only import：維持本模組可被 node 測試直接載入（無執行期依賴）。
import type { TitleSignal } from "../agents/types";

const lineBuffers = new Map<string, string>();
const nonWaitingStreaks = new Map<string, number>();
const emptyScanStreaks = new Map<string, number>();
const titleSignals = new Map<string, { signal: TitleSignal; at: number }>();
const hookWaitingAt = new Map<string, number>();

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

/**
 * busy 訊號的有效期：spinner 期間 CLI 每秒更新標題數次,超過此時間沒有新的
 * busy title 即視為過期——agent 被 kill 後殘留的 spinner title 不能把燈
 * 永久釘在 thinking（shell 不一定會重設 title）。rest 只做否決,不設 TTL。
 */
export const TITLE_BUSY_TTL_MS = 3000;

/** Record the latest title-derived signal (undefined = no signal, forget it). */
export function setTitleSignal(
  sessionId: string,
  signal: TitleSignal | undefined,
  now: number,
): void {
  if (signal) titleSignals.set(sessionId, { signal, at: now });
  else titleSignals.delete(sessionId);
}

/** The session's title signal; a busy older than TITLE_BUSY_TTL_MS is expired. */
export function getTitleSignal(
  sessionId: string,
  now: number,
): TitleSignal | undefined {
  const cur = titleSignals.get(sessionId);
  if (!cur) return undefined;
  if (cur.signal === "busy" && now - cur.at > TITLE_BUSY_TTL_MS) return undefined;
  return cur.signal;
}

/**
 * Hook-waiting 寬限：PermissionRequest hook 在審批對話框「畫出來之前」觸發
 * （hooks 的語意如此），若 handleScan 的連續 non-waiting 清除在對話框重繪前
 * 執行，會把剛設下的 waiting 清掉。寬限期內跳過清除；代價是使用者在 TUI 內
 * 回答時，燈號最多晚這個時間才清。
 */
export const HOOK_WAITING_GRACE_MS = 2000;

/**
 * 記錄「目前的 waiting 來自 hook」。entry 存在期間 scan 偵測到的 waiting 不
 * 覆蓋 prompt（hook 的 tool_name + tool_input 比 viewport 選單行精確）；
 * 清除時機：scan 判定審批已結束、stop/toolDone 事件、session 關閉。
 */
export function markHookWaiting(sessionId: string, now: number): void {
  hookWaitingAt.set(sessionId, now);
}

export function clearHookWaiting(sessionId: string): void {
  hookWaitingAt.delete(sessionId);
}

/** 目前的 waiting 是否為 hook 來源（不論新舊）。 */
export function hasHookWaiting(sessionId: string): boolean {
  return hookWaitingAt.has(sessionId);
}

/** hook 設下 waiting 後是否仍在寬限期內（清除要再等等）。 */
export function isHookWaitingFresh(sessionId: string, now: number): boolean {
  const at = hookWaitingAt.get(sessionId);
  return at !== undefined && now - at <= HOOK_WAITING_GRACE_MS;
}

/** Forget the session's buffers (session close / housekeeping). */
export function clearScanState(sessionId: string): void {
  lineBuffers.delete(sessionId);
  nonWaitingStreaks.delete(sessionId);
  emptyScanStreaks.delete(sessionId);
  titleSignals.delete(sessionId);
  hookWaitingAt.delete(sessionId);
}
