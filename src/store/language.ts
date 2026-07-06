// 顯示語言，記在 localStorage。
import { create } from "zustand";
import { setMenuLanguage } from "../ipc/menu";

export type Language = "zh-TW" | "en";

export const LANGUAGE_NAMES: Language[] = ["zh-TW", "en"];

export const LANGUAGE_LABELS: Record<Language, string> = {
  "zh-TW": "繁體中文",
  en: "English",
};

interface LanguageState {
  name: Language;
  setName: (name: Language) => void;
}

const STORAGE_KEY = "helm.language";

/** 沒有已存偏好時，依系統/瀏覽器語言猜一個預設值。 */
function systemDefault(): Language {
  return navigator.language.toLowerCase().startsWith("zh") ? "zh-TW" : "en";
}

function initial(): Language {
  const v = localStorage.getItem(STORAGE_KEY) as Language | null;
  return v && LANGUAGE_NAMES.includes(v) ? v : systemDefault();
}

export const useLanguageStore = create<LanguageState>((set) => ({
  name: initial(),
  setName: (name) => {
    localStorage.setItem(STORAGE_KEY, name);
    set({ name });
    void setMenuLanguage(name);
  },
}));
