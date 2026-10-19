import type { Terminal } from "@xterm/xterm";
import { initialSessionTracker } from "../../store/initialSession.ts";

/** onData also carries automatic protocol replies, so track actual input separately. */
export function trackTerminalInput(
  id: string,
  term: Pick<Terminal, "onKey">,
  container: HTMLElement,
): () => void {
  const markUsed = () => initialSessionTracker.markUsed(id);
  const keyDisposable = term.onKey(markUsed);
  const events = ["input", "paste", "compositionstart"] as const;
  const options = { capture: true };
  for (const event of events) {
    container.addEventListener(event, markUsed, options);
  }
  return () => {
    keyDisposable.dispose();
    for (const event of events) {
      container.removeEventListener(event, markUsed, options);
    }
  };
}
