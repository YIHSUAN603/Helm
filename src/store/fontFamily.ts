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
