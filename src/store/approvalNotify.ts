// Desktop-notification dedupe for approval prompts (pure, no imports, so
// node tests can load it directly). State flapping — mid-redraw scans briefly
// deriving a non-waiting state — re-triggers the "entered waiting" edge for
// the same prompt; this gate turns that storm into a single notification.

/** Last desktop-notified approval per session. */
const lastNotified = new Map<string, { prompt: string; at: number }>();

/** Re-notify the same prompt only after this long without an explicit reset. */
export const APPROVAL_NOTIFY_COOLDOWN_MS = 120_000;

/**
 * Whether a desktop notification should be sent for this approval prompt.
 * True when the session has no record, the prompt differs, or the cooldown
 * elapsed — and only then is the notification recorded.
 */
export function shouldNotifyApproval(
  sessionId: string,
  prompt: string,
  now: number,
): boolean {
  const last = lastNotified.get(sessionId);
  if (last && last.prompt === prompt && now - last.at < APPROVAL_NOTIFY_COOLDOWN_MS) {
    return false;
  }
  lastNotified.set(sessionId, { prompt, at: now });
  return true;
}

/**
 * Forget the session's record. Called when the user explicitly responds to
 * an approval (a new prompt with identical text must notify immediately) and
 * on session close. Deliberately NOT called from clearApproval/setAgentState —
 * those are the paths flapping takes, and resetting there would re-open the
 * notification storm.
 */
export function clearApprovalNotify(sessionId: string): void {
  lastNotified.delete(sessionId);
}
