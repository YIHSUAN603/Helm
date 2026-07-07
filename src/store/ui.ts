// 應用層 UI 狀態（面板開關）。
import { create } from "zustand";

interface UiState {
  filesOpen: boolean;
  paletteOpen: boolean;
  settingsOpen: boolean;
  // 剛用工具列「新增 Workspace」建立、待側欄立即進入命名的 workspace id。
  renamingWorkspaceId: string | null;
  toggleFiles: () => void;
  setFilesOpen: (v: boolean) => void;
  setPaletteOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  setRenamingWorkspaceId: (id: string | null) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  filesOpen: false,
  paletteOpen: false,
  settingsOpen: false,
  renamingWorkspaceId: null,
  toggleFiles: () => set({ filesOpen: !get().filesOpen }),
  setFilesOpen: (v) => set({ filesOpen: v }),
  setPaletteOpen: (v) => set({ paletteOpen: v }),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setRenamingWorkspaceId: (id) => set({ renamingWorkspaceId: id }),
}));
