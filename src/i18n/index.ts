// 翻譯查詢：純函式供元件與純 ts 檔（如 commands/registry.ts）共用，
// useT() 額外訂閱 language store 以在切換語言時觸發重新渲染。
// .ts 副檔名：讓 node 測試（strip-types 模式）能直接載入本模組。
import { useLanguageStore, type Language } from "../store/language.ts";
import { zhTW } from "./translations/zh-TW.ts";
import { en } from "./translations/en.ts";

const dictionaries: Record<Language, Record<string, string>> = {
  "zh-TW": zhTW,
  en,
};

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in vars ? String(vars[key]) : match,
  );
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const lang = useLanguageStore.getState().name;
  const template = dictionaries[lang][key] ?? key;
  return interpolate(template, vars);
}

/** React hook: re-renders the caller when the language changes. */
export function useT() {
  useLanguageStore((s) => s.name);
  return t;
}
