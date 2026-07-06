// 應用程式自動更新狀態，供 Toolbar/SettingsDialog 顯示進度。
import { create } from "zustand";

export type UpdatePhase = "idle" | "checking" | "up-to-date" | "downloading" | "relaunching" | "error";

interface UpdateState {
  phase: UpdatePhase;
  version: string | null;
  setPhase: (phase: UpdatePhase, version?: string) => void;
}

export const useUpdateStore = create<UpdateState>((set) => ({
  phase: "idle",
  version: null,
  setPhase: (phase, version) => set({ phase, version: version ?? null }),
}));
