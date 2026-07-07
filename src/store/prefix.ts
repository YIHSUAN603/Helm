// Prefix (Ctrl+A) armed state. The App keydown handler drives it; the
// which-key overlay renders exactly while armed. Arming starts a one-shot
// auto-disarm timer so a forgotten prefix never wedges the keyboard.
import { create } from "zustand";
import { PREFIX_TIMEOUT_MS } from "../commands/prefix";

interface PrefixState {
  armed: boolean;
  arm: () => void;
  disarm: () => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export const usePrefixStore = create<PrefixState>((set) => ({
  armed: false,
  arm: () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      set({ armed: false });
    }, PREFIX_TIMEOUT_MS);
    set({ armed: true });
  },
  disarm: () => {
    if (timer) clearTimeout(timer);
    timer = null;
    set({ armed: false });
  },
}));
