// Post-response approval suppression (pure, no imports, so node tests can
// load it directly). After the user explicitly answers an approval, the TUI
// takes a few frames to repaint past the menu; a viewport scan in that window
// still sees the old prompt and would re-derive "waiting", resurrecting the
// approval the user just answered. This gate drops same-prompt waiting scans
// for a short window after an explicit response.

/** Last explicitly answered approval per session. */
const lastAnswered = new Map<string, { prompt: string; at: number }>();

/**
 * How long a same-prompt waiting scan is ignored after an explicit response.
 * Long enough to cover the TUI repaint (scans are debounced 150ms); short
 * enough that a genuinely re-asked identical prompt resurfaces quickly.
 */
export const APPROVAL_SUPPRESS_MS = 3_000;

/** Record that the user explicitly answered this prompt (respondApproval). */
export function markApprovalAnswered(sessionId: string, prompt: string, now: number): void {
  lastAnswered.set(sessionId, { prompt, at: now });
}

/**
 * Whether a scan-derived waiting state is just the answered prompt still on
 * screen. A different prompt is never suppressed — it is a new approval.
 */
export function isApprovalSuppressed(sessionId: string, prompt: string, now: number): boolean {
  const last = lastAnswered.get(sessionId);
  return last !== undefined && last.prompt === prompt && now - last.at < APPROVAL_SUPPRESS_MS;
}

/** Forget the session's record (session close / housekeeping). */
export function clearApprovalSuppress(sessionId: string): void {
  lastAnswered.delete(sessionId);
}
