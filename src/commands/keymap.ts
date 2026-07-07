// Global key bindings and matching (pure, node-testable).
// Nearly all shortcuts live behind the tmux-style Ctrl+A prefix (prefix.ts);
// KEYMAP keeps only the direct bindings that must work without the prefix.
// Every binding carries a modifier, so plain terminal keys (Ctrl+C, Esc,
// letters...) can never match; matching is strict — an extra or missing
// modifier means no match. Ctrl+A itself is owned by the prefix machine and
// must never appear here.
import type { KeyBinding, KeyEventLike } from "./types";
import { prefixLabel } from "./prefix.ts";

export const KEYMAP: KeyBinding[] = [
  { key: "p", mod: true, shift: true, commandId: "palette:open" },
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

function keyLabel(b: KeyBinding): string {
  if (b.code) return b.code.startsWith("Digit") ? b.code.slice(5) : b.code;
  return b.key === "\\" ? "\\" : (b.key ?? "").toUpperCase();
}

/**
 * Human-readable shortcut for a command: direct bindings render as
 * "⇧⌘P" / "Ctrl+Shift+P"; everything else falls back to the prefix
 * sequence ("⌃A %" / "Ctrl+A %") when the command is in PREFIX_TABLE.
 */
export function shortcutLabel(commandId: string, isMac: boolean): string | undefined {
  const b = KEYMAP.find((x) => x.commandId === commandId);
  if (!b) return prefixLabel(commandId, isMac);
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
