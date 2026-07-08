// i18n：en / zh-TW key 對齊 + t() 插值測試。
// language store 在模組載入時就讀 localStorage / navigator，先 stub 再動態載入。
// 執行：node --experimental-strip-types tests/i18n.test.ts
import assert from "node:assert";

const g = globalThis as { localStorage?: unknown; navigator?: unknown };
g.localStorage ??= { getItem: () => null, setItem: () => {} };
g.navigator ??= { language: "en" };

const { zhTW } = await import("../src/i18n/translations/zh-TW.ts");
const { en } = await import("../src/i18n/translations/en.ts");
const { t } = await import("../src/i18n/index.ts");
const { useLanguageStore } = await import("../src/store/language.ts");

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
  console.log(`  ok - ${name}`);
}

// key 對齊：兩份字典必須同步維護
const zhKeys = Object.keys(zhTW);
const enKeys = new Set(Object.keys(en));
const missingInEn = zhKeys.filter((k) => !enKeys.has(k));
const missingInZh = Object.keys(en).filter((k) => !(k in zhTW));
check(`zh-TW 的 key 都在 en（缺: ${missingInEn.join(", ") || "無"}）`, missingInEn.length === 0);
check(`en 的 key 都在 zh-TW（缺: ${missingInZh.join(", ") || "無"}）`, missingInZh.length === 0);

// t()：查詢 + 插值（直接 setState，避開 setName 的 localStorage / IPC 副作用）
useLanguageStore.setState({ name: "en" });
check("en 查詢", t("toolbar.send") === "Send");
check("插值替換變數", t("toolbar.broadcastPlaceholder", { count: 3 }).includes("3"));
check(
  "缺變數時保留佔位符",
  t("toolbar.broadcastPlaceholder").includes("{count}"),
);
check("未知 key 回傳 key 本身", t("no.such.key") === "no.such.key");

useLanguageStore.setState({ name: "zh-TW" });
check("zh-TW 查詢", t("toolbar.send") === "送出");

console.log(`i18n: ${passed} checks passed`);
