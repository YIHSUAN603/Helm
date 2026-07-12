// 字型 font-family 字串的純函式工具（無 React/Zustand 依賴，可直接單元測試）。
// 供 SettingsDialog 在「系統字型清單」與「儲存的 CSS font-family 字串」之間轉換。

/**
 * 取出 CSS font-family 字串的第一個字型名稱（去引號、去空白）。
 * @example firstFontFamily('"SF Mono", Consolas, monospace') === "SF Mono"
 */
export function firstFontFamily(cssValue: string): string {
  const first = cssValue.split(",")[0] ?? "";
  return first.trim().replace(/^["']|["']$/g, "");
}

/**
 * 將字型名稱轉為儲存用的 font-family 值：必要時加引號，並補 monospace 備援。
 * @example toFontFamilyValue("Cascadia Code") === '"Cascadia Code", monospace'
 */
export function toFontFamilyValue(family: string): string {
  const name = /^[a-zA-Z][a-zA-Z0-9-]*$/.test(family) ? family : `"${family}"`;
  return `${name}, monospace`;
}

/** 內建（@font-face 打包）的符號字型家族名——見 App.css 的 @font-face。 */
export const SYMBOLS_NERD_FONT = '"Symbols Nerd Font Mono"';

/**
 * 在使用者的 font-family 鏈中補上內建的符號字型作為 fallback，讓 Nerd Font 圖示
 * （Neovim/TUI 圖示，位於 Private Use Area）無論主字型是什麼都能顯示。插在結尾的
 * generic `monospace` 之前（generic 之後的具名字型在部分瀏覽器不會被納入 fallback）；
 * 沒有 generic 就補在最後再接上 monospace。已含則原樣返回（冪等）。
 * @example withSymbolsFallback('"SF Mono", monospace')
 *   === '"SF Mono", "Symbols Nerd Font Mono", monospace'
 */
export function withSymbolsFallback(cssValue: string): string {
  if (cssValue.includes(SYMBOLS_NERD_FONT)) return cssValue;
  const parts = cssValue
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const genericIdx = parts.findIndex((p) => p === "monospace");
  if (genericIdx >= 0) {
    parts.splice(genericIdx, 0, SYMBOLS_NERD_FONT);
  } else {
    parts.push(SYMBOLS_NERD_FONT, "monospace");
  }
  return parts.join(", ");
}
