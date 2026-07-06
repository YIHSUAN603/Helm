// 應用層 UI 狀態（版面/面板開關）。viewMode 記在 localStorage。
import { create } from "zustand";

export type ViewMode = "single" | "split";

const STORAGE_KEY = "aiterminal.viewMode";

function initial(): ViewMode {
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "grid") return "split"; // 舊版 grid 模式遷移
  return v === "split" ? "split" : "single";
}

interface UiState {
  viewMode: ViewMode;
  filesOpen: boolean;
  paletteOpen: boolean;
  // 剛用工具列「新增 Workspace」建立、待側欄立即進入命名的 workspace id。
  renamingWorkspaceId: string | null;
  setViewMode: (m: ViewMode) => void;
  toggleFiles: () => void;
  setFilesOpen: (v: boolean) => void;
  setPaletteOpen: (v: boolean) => void;
  setRenamingWorkspaceId: (id: string | null) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  viewMode: initial(),
  filesOpen: false,
  paletteOpen: false,
  renamingWorkspaceId: null,
  setViewMode: (m) => {
    localStorage.setItem(STORAGE_KEY, m);
    set({ viewMode: m });
  },
  toggleFiles: () => set({ filesOpen: !get().filesOpen }),
  setFilesOpen: (v) => set({ filesOpen: v }),
  setPaletteOpen: (v) => set({ paletteOpen: v }),
  setRenamingWorkspaceId: (id) => set({ renamingWorkspaceId: id }),
}));
