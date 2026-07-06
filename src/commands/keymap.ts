// Global key bindings and matching (pure, node-testable).
// Every binding carries a modifier (or an F-key), so plain terminal keys
// (Ctrl+C, Esc, letters, digits...) can never match. Matching is strict:
// an extra or missing modifier means no match.
// macOS note: WKWebView swallows some plain Cmd+letter combos before they
// reach the DOM, so new bindings should stay in the Mod+Shift+letter class.
import type { KeyBinding, KeyEventLike } from "./types";

export const KEYMAP: KeyBinding[] = [
  { key: "p", mod: true, shift: true, commandId: "palette:open" },
  { key: "\\", mod: true, commandId: "layout:split-right" },
  { key: "d", mod: true, shift: true, commandId: "layout:split-down" },
  { key: "w", mod: true, shift: true, commandId: "layout:close-pane" },
  { key: "o", mod: true, shift: true, commandId: "layout:focus-next-pane" },
  { code: "ArrowLeft", mod: true, alt: true, commandId: "layout:focus-left" },
  { code: "ArrowRight", mod: true, alt: true, commandId: "layout:focus-right" },
  { code: "ArrowUp", mod: true, alt: true, commandId: "layout:focus-up" },
  { code: "ArrowDown", mod: true, alt: true, commandId: "layout:focus-down" },
  { code: "ArrowLeft", mod: true, alt: true, shift: true, commandId: "layout:resize-left" },
  { code: "ArrowRight", mod: true, alt: true, shift: true, commandId: "layout:resize-right" },
  { code: "ArrowUp", mod: true, alt: true, shift: true, commandId: "layout:resize-up" },
  { code: "ArrowDown", mod: true, alt: true, shift: true, commandId: "layout:resize-down" },
  { key: "t", mod: true, shift: true, commandId: "session:new" },
  { code: "BracketRight", mod: true, shift: true, commandId: "session:next" },
  { code: "BracketLeft", mod: true, shift: true, commandId: "session:prev" },
  { code: "Digit1", mod: true, commandId: "session:switch-1" },
  { code: "Digit2", mod: true, commandId: "session:switch-2" },
  { code: "Digit3", mod: true, commandId: "session:switch-3" },
  { code: "Digit4", mod: true, commandId: "session:switch-4" },
  { code: "Digit5", mod: true, commandId: "session:switch-5" },
  { code: "Digit6", mod: true, commandId: "session:switch-6" },
  { code: "Digit7", mod: true, commandId: "session:switch-7" },
  { code: "Digit8", mod: true, commandId: "session:switch-8" },
  { code: "Digit9", mod: true, commandId: "session:switch-9" },
  { key: "m", mod: true, shift: true, commandId: "view:toggle-mode" },
  { key: "f", mod: true, shift: true, commandId: "view:toggle-files" },
  { key: "l", mod: true, shift: true, commandId: "theme:toggle" },
  { key: "b", mod: true, shift: true, commandId: "broadcast:focus" },
  { key: "y", mod: true, shift: true, commandId: "approval:approve-active" },
  { key: "n", mod: true, shift: true, commandId: "approval:reject-active" },
  { key: "f6", commandId: "focus:cycle-region" },
  { key: "f6", shift: true, commandId: "focus:cycle-region-back" },
  { key: "e", mod: true, shift: true, commandId: "focus:cycle-region" },
];

function bindingMatches(b: KeyBinding, e: KeyEventLike): boolean {
  if ((b.mod ?? false) !== (e.metaKey || e.ctrlKey)) return false;
  if ((b.shift ?? false) !== e.shiftKey) return false;
  if ((b.alt ?? false) !== e.altKey) return false;
  if (b.code) return b.code === e.code;
  return b.key === e.key.toLowerCase();
}

/** First matching binding's command id, or null when the event is not ours. */
export function matchBinding(e: KeyEventLike): string | null {
  for (const b of KEYMAP) {
    if (bindingMatches(b, e)) return b.commandId;
  }
  return null;
}

const CODE_LABELS: Record<string, string> = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  BracketLeft: "[",
  BracketRight: "]",
};

function keyLabel(b: KeyBinding): string {
  if (b.code) {
    if (b.code.startsWith("Digit")) return b.code.slice(5);
    return CODE_LABELS[b.code] ?? b.code;
  }
  return b.key === "\\" ? "\\" : (b.key ?? "").toUpperCase();
}

/** Human-readable shortcut for a command ("⌥⇧⌘P" / "Ctrl+Shift+P"). */
export function shortcutLabel(commandId: string, isMac: boolean): string | undefined {
  const b = KEYMAP.find((x) => x.commandId === commandId);
  if (!b) return undefined;
  const k = keyLabel(b);
  if (isMac) {
    return `${b.alt ? "⌥" : ""}${b.shift ? "⇧" : ""}${b.mod ? "⌘" : ""}${k}`;
  }
  const parts: string[] = [];
  if (b.mod) parts.push("Ctrl");
  if (b.alt) parts.push("Alt");
  if (b.shift) parts.push("Shift");
  parts.push(k);
  return parts.join("+");
}
