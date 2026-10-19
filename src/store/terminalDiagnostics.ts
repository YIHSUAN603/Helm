import { create } from "zustand";
import type { PtyFailure } from "../ipc/ptyErrors";
import { addTerminalDiagnostic, type TerminalDiagnostic } from "./terminalDiagnosticEntries";

interface TerminalDiagnosticsState {
  entries: TerminalDiagnostic[];
  record: (failure: PtyFailure) => void;
  clear: () => void;
}

// Deliberately memory-only: input data and environment never enter this store.
export const useTerminalDiagnosticsStore = create<TerminalDiagnosticsState>((set) => ({
  entries: [],
  record: (failure) => set((state) => ({
    entries: addTerminalDiagnostic(state.entries, failure, Date.now()),
  })),
  clear: () => set({ entries: [] }),
}));
