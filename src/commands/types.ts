// Shared types for the command system.
// Pure module: no store / Tauri imports, so it stays node-testable.

export interface Command {
  id: string;
  title: string;
  /** Palette group label, e.g. "版面". */
  category?: string;
  /** Extra text matched by the palette filter (e.g. English aliases). */
  keywords?: string;
  /** Not shown in the palette (hotkey-only helpers like numbered switch). */
  hidden?: boolean;
  /** Command is skipped when this returns false; absent = always enabled. */
  enabled?: () => boolean;
  run: () => void;
}

export interface KeyBinding {
  /** Matched against e.key.toLowerCase(); prefer `code` for layout-dependent keys. */
  key?: string;
  /** Matched against e.code (digits, arrows, brackets). */
  code?: string;
  /** Requires metaKey || ctrlKey (Cmd on macOS, Ctrl on Windows/Linux). */
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  commandId: string;
}

/** Subset of KeyboardEvent used by matchBinding (keeps this module DOM-free). */
export interface KeyEventLike {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}
