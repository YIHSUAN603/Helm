// 應用層 UI 狀態（面板開關）。
import { create } from "zustand";

interface UiState {
  filesOpen: boolean;
  notificationsOpen: boolean;
  paletteOpen: boolean;
  settingsOpen: boolean;
  // 隱藏左側 session 側欄（釋放終端寬度）；預設顯示（false）。
  sidebarHidden: boolean;
  // 剛用工具列「新增 Workspace」建立、待側欄立即進入命名的 workspace id。
  renamingWorkspaceId: string | null;
  toggleFiles: () => void;
  setFilesOpen: (v: boolean) => void;
  toggleSidebar: () => void;
  setSidebarHidden: (v: boolean) => void;
  toggleNotifications: () => void;
  setNotificationsOpen: (v: boolean) => void;
  setPaletteOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  setRenamingWorkspaceId: (id: string | null) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  filesOpen: false,
  notificationsOpen: false,
  paletteOpen: false,
  settingsOpen: false,
  sidebarHidden: false,
  renamingWorkspaceId: null,
  toggleFiles: () => set({ filesOpen: !get().filesOpen }),
  setFilesOpen: (v) => set({ filesOpen: v }),
  toggleSidebar: () => set({ sidebarHidden: !get().sidebarHidden }),
  setSidebarHidden: (v) => set({ sidebarHidden: v }),
  toggleNotifications: () => set({ notificationsOpen: !get().notificationsOpen }),
  setNotificationsOpen: (v) => set({ notificationsOpen: v }),
  setPaletteOpen: (v) => set({ paletteOpen: v }),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setRenamingWorkspaceId: (id) => set({ renamingWorkspaceId: id }),
}));
