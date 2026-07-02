// 應用主題（深/淺色），記在 localStorage。
import { create } from "zustand";
import type { ITheme } from "@xterm/xterm";

export type ThemeName = "dark" | "light";

interface ThemeState {
  name: ThemeName;
  toggle: () => void;
}

const STORAGE_KEY = "aiterminal.theme";

function initial(): ThemeName {
  return (localStorage.getItem(STORAGE_KEY) as ThemeName) || "dark";
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  name: initial(),
  toggle: () => {
    const next = get().name === "dark" ? "light" : "dark";
    localStorage.setItem(STORAGE_KEY, next);
    set({ name: next });
  },
}));

// xterm 對應的配色。
export const xtermThemes: Record<ThemeName, ITheme> = {
  dark: {
    background: "#1e1e2e",
    foreground: "#cdd6f4",
    cursor: "#f5e0dc",
    selectionBackground: "#585b70",
  },
  light: {
    background: "#eff1f5",
    foreground: "#4c4f69",
    cursor: "#dc8a78",
    selectionBackground: "#acb0be",
  },
};
