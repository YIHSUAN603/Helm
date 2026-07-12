// Pure font-family helper tests (no GUI / Tauri needed).
// Run: node --experimental-strip-types tests/font-family.test.ts
import assert from "node:assert";
import {
  firstFontFamily,
  SYMBOLS_NERD_FONT,
  toFontFamilyValue,
  withSymbolsFallback,
} from "../src/store/fontFamily.ts";

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
  console.log(`  ok - ${name}`);
}

// firstFontFamily: 各種引號與空白
{
  check(
    "double-quoted first family",
    firstFontFamily('"SF Mono", "Cascadia Mono", monospace') === "SF Mono",
  );
  check("single-quoted first family", firstFontFamily("'Fira Code', monospace") === "Fira Code");
  check("unquoted first family", firstFontFamily("Consolas, monospace") === "Consolas");
  check("single family without fallback", firstFontFamily("monospace") === "monospace");
  check("surrounding whitespace trimmed", firstFontFamily('  "JetBrains Mono" , x') === "JetBrains Mono");
  check("empty string stays empty", firstFontFamily("") === "");
}

// toFontFamilyValue: 引號與 monospace 備援
{
  check("simple name unquoted", toFontFamilyValue("Consolas") === "Consolas, monospace");
  check(
    "name with space gets quoted",
    toFontFamilyValue("Cascadia Code") === '"Cascadia Code", monospace',
  );
  check(
    "name starting with digit gets quoted",
    toFontFamilyValue("3270 Nerd Font") === '"3270 Nerd Font", monospace',
  );
  check("hyphenated name unquoted", toFontFamilyValue("Noto-Mono") === "Noto-Mono, monospace");
}

// round-trip: toFontFamilyValue 後 firstFontFamily 應取回原名
{
  for (const family of ["Consolas", "Cascadia Code", "JetBrains Mono", "3270 Nerd Font"]) {
    check(`round-trip: ${family}`, firstFontFamily(toFontFamilyValue(family)) === family);
  }
}

// withSymbolsFallback: 補上內建符號字型 fallback，插在 generic monospace 之前
{
  check(
    "inserts before trailing monospace",
    withSymbolsFallback('"SF Mono", monospace') ===
      `"SF Mono", ${SYMBOLS_NERD_FONT}, monospace`,
  );
  check(
    "inserts before monospace in a longer chain",
    withSymbolsFallback('"SF Mono", Consolas, monospace') ===
      `"SF Mono", Consolas, ${SYMBOLS_NERD_FONT}, monospace`,
  );
  check(
    "appends symbols + monospace when no generic present",
    withSymbolsFallback('"SF Mono", Consolas') ===
      `"SF Mono", Consolas, ${SYMBOLS_NERD_FONT}, monospace`,
  );
  check(
    "idempotent when already present",
    withSymbolsFallback(`"SF Mono", ${SYMBOLS_NERD_FONT}, monospace`) ===
      `"SF Mono", ${SYMBOLS_NERD_FONT}, monospace`,
  );
  check(
    "user Nerd Font primary is preserved, symbols appended as fallback",
    withSymbolsFallback('"JetBrainsMono Nerd Font Mono", monospace') ===
      `"JetBrainsMono Nerd Font Mono", ${SYMBOLS_NERD_FONT}, monospace`,
  );
  check(
    "bare monospace gets symbols before it",
    withSymbolsFallback("monospace") === `${SYMBOLS_NERD_FONT}, monospace`,
  );
}

console.log(`\nfont-family tests passed: ${passed}`);
