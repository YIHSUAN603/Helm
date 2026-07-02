// 應用層 UI 狀態（版面/面板開關）。
import { create } from "zustand";

export type ViewMode = "single" | "grid";

interface UiState {
  viewMode: ViewMode;
  filesOpen: boolean;
  setViewMode: (m: ViewMode) => void;
  toggleView: () => void;
  toggleFiles: () => void;
  setFilesOpen: (v: boolean) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  viewMode: "single",
  filesOpen: false,
  setViewMode: (m) => set({ viewMode: m }),
  toggleView: () => set({ viewMode: get().viewMode === "single" ? "grid" : "single" }),
  toggleFiles: () => set({ filesOpen: !get().filesOpen }),
  setFilesOpen: (v) => set({ filesOpen: v }),
}));
