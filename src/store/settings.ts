// 終端機外觀與預設啟動參數，記在 localStorage（每個欄位各自一個 key）。
import { create } from "zustand";

export type CursorStyle = "block" | "bar" | "underline";

const DEFAULT_FONT_FAMILY =
  '"SF Mono", "Cascadia Mono", "Cascadia Code", Consolas, "JetBrains Mono", Menlo, Monaco, "Courier New", monospace';
const DEFAULT_FONT_SIZE = 13;
const DEFAULT_CURSOR_STYLE: CursorStyle = "block";
const DEFAULT_CURSOR_BLINK = true;

const KEYS = {
  fontFamily: "aiterminal.fontFamily",
  fontSize: "aiterminal.fontSize",
  cursorStyle: "aiterminal.cursorStyle",
  cursorBlink: "aiterminal.cursorBlink",
  defaultShell: "aiterminal.defaultShell",
  defaultCwd: "aiterminal.defaultCwd",
} as const;

interface SettingsState {
  fontFamily: string;
  fontSize: number;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  defaultShell: string;
  defaultCwd: string;
  setFontFamily: (v: string) => void;
  setFontSize: (v: number) => void;
  setCursorStyle: (v: CursorStyle) => void;
  setCursorBlink: (v: boolean) => void;
  setDefaultShell: (v: string) => void;
  setDefaultCwd: (v: string) => void;
}

function initialFontFamily(): string {
  return localStorage.getItem(KEYS.fontFamily) || DEFAULT_FONT_FAMILY;
}

function initialFontSize(): number {
  const v = Number(localStorage.getItem(KEYS.fontSize));
  return v > 0 ? v : DEFAULT_FONT_SIZE;
}

function initialCursorStyle(): CursorStyle {
  const v = localStorage.getItem(KEYS.cursorStyle);
  return v === "bar" || v === "underline" || v === "block" ? v : DEFAULT_CURSOR_STYLE;
}

function initialCursorBlink(): boolean {
  const v = localStorage.getItem(KEYS.cursorBlink);
  return v === null ? DEFAULT_CURSOR_BLINK : v === "true";
}

export const useSettingsStore = create<SettingsState>((set) => ({
  fontFamily: initialFontFamily(),
  fontSize: initialFontSize(),
  cursorStyle: initialCursorStyle(),
  cursorBlink: initialCursorBlink(),
  defaultShell: localStorage.getItem(KEYS.defaultShell) || "",
  defaultCwd: localStorage.getItem(KEYS.defaultCwd) || "",

  setFontFamily: (v) => {
    localStorage.setItem(KEYS.fontFamily, v);
    set({ fontFamily: v });
  },
  setFontSize: (v) => {
    localStorage.setItem(KEYS.fontSize, String(v));
    set({ fontSize: v });
  },
  setCursorStyle: (v) => {
    localStorage.setItem(KEYS.cursorStyle, v);
    set({ cursorStyle: v });
  },
  setCursorBlink: (v) => {
    localStorage.setItem(KEYS.cursorBlink, String(v));
    set({ cursorBlink: v });
  },
  setDefaultShell: (v) => {
    localStorage.setItem(KEYS.defaultShell, v);
    set({ defaultShell: v });
  },
  setDefaultCwd: (v) => {
    localStorage.setItem(KEYS.defaultCwd, v);
    set({ defaultCwd: v });
  },
}));
