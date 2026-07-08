// 應用程式更新狀態：發現新版本時先詢問使用者，供 Toolbar/SettingsDialog 顯示與操作。
import { create } from "zustand";
import type { Update } from "@tauri-apps/plugin-updater";
import { downloadAndInstallUpdate } from "../ipc/update";

export type UpdatePhase =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "relaunching"
  | "error";

interface UpdateState {
  phase: UpdatePhase;
  version: string | null;
  /** 已發現但尚未安裝的更新，等待使用者決定。 */
  pendingUpdate: Update | null;
  /** 使用者按「稍後」後隱藏 Toolbar 提示（設定對話框仍可手動更新）。 */
  dismissed: boolean;
  setPhase: (phase: UpdatePhase, version?: string) => void;
  setAvailable: (update: Update) => void;
  dismiss: () => void;
}

export const useUpdateStore = create<UpdateState>((set) => ({
  phase: "idle",
  version: null,
  pendingUpdate: null,
  dismissed: false,
  setPhase: (phase, version) => set({ phase, version: version ?? null }),
  setAvailable: (update) =>
    set({
      phase: "available",
      version: update.version,
      pendingUpdate: update,
      dismissed: false,
    }),
  dismiss: () => set({ dismissed: true }),
}));

/** 使用者同意後下載並安裝待裝更新，完成後重啟應用程式。 */
export async function installPendingUpdate(): Promise<void> {
  const { pendingUpdate, setPhase } = useUpdateStore.getState();
  if (!pendingUpdate) {
    return;
  }
  try {
    setPhase("downloading", pendingUpdate.version);
    await downloadAndInstallUpdate(pendingUpdate);
    setPhase("relaunching", pendingUpdate.version);
  } catch {
    setPhase("error", pendingUpdate.version);
  }
}
