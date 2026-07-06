// 全域快捷鍵 keymap 純函式測試（不需 GUI / Tauri）。
// 執行：node --experimental-strip-types tests/keymap.test.ts
import assert from "node:assert";
import { matchBinding, shortcutLabel } from "../src/commands/keymap.ts";
import type { KeyEventLike } from "../src/commands/types.ts";

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
  console.log(`  ok - ${name}`);
}

function ev(partial: Partial<KeyEventLike>): KeyEventLike {
  return {
    key: "",
    code: "",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...partial,
  };
}

// Mod 對 ctrlKey / metaKey 一視同仁
{
  check(
    "Ctrl+Shift+P → palette:open",
    matchBinding(ev({ key: "P", code: "KeyP", ctrlKey: true, shiftKey: true })) ===
      "palette:open",
  );
  check(
    "Cmd+Shift+P → palette:open",
    matchBinding(ev({ key: "P", code: "KeyP", metaKey: true, shiftKey: true })) ===
      "palette:open",
  );
}

// 純 Ctrl+字母屬於終端機，一律不可比中
{
  check("Ctrl+C 不比中", matchBinding(ev({ key: "c", code: "KeyC", ctrlKey: true })) === null);
  check("Ctrl+W 不比中", matchBinding(ev({ key: "w", code: "KeyW", ctrlKey: true })) === null);
  check("Ctrl+D 不比中", matchBinding(ev({ key: "d", code: "KeyD", ctrlKey: true })) === null);
  check("純 Esc 不比中", matchBinding(ev({ key: "Escape", code: "Escape" })) === null);
  check("純字母不比中", matchBinding(ev({ key: "p", code: "KeyP" })) === null);
}

// 要求 Shift 的綁定，缺 Shift 不可比中；多帶 Alt 也不可比中
{
  check(
    "Ctrl+D（缺 Shift）不比中 split-down",
    matchBinding(ev({ key: "d", code: "KeyD", ctrlKey: true })) === null,
  );
  check(
    "Ctrl+Shift+Alt+D（多帶 Alt）不比中",
    matchBinding(
      ev({ key: "D", code: "KeyD", ctrlKey: true, shiftKey: true, altKey: true }),
    ) === null,
  );
  check(
    "Ctrl+Shift+D → layout:split-down",
    matchBinding(ev({ key: "D", code: "KeyD", ctrlKey: true, shiftKey: true })) ===
      "layout:split-down",
  );
}

// 數字鍵用 e.code 比對（不受鍵盤配置影響）
{
  check(
    "Ctrl+1（code Digit1）→ session:switch-1",
    matchBinding(ev({ key: "1", code: "Digit1", ctrlKey: true })) === "session:switch-1",
  );
  check(
    "Ctrl+9 → session:switch-9",
    matchBinding(ev({ key: "9", code: "Digit9", ctrlKey: true })) === "session:switch-9",
  );
  check(
    "key 非數字但 code 是 Digit1 仍比中",
    matchBinding(ev({ key: "&", code: "Digit1", ctrlKey: true })) === "session:switch-1",
  );
}

// 括號鍵：Shift 後 e.key 會變成 { }，必須用 code 比對
{
  check(
    "Ctrl+Shift+]（key 為 }）→ session:next",
    matchBinding(ev({ key: "}", code: "BracketRight", ctrlKey: true, shiftKey: true })) ===
      "session:next",
  );
  check(
    "Ctrl+Shift+[ → session:prev",
    matchBinding(ev({ key: "{", code: "BracketLeft", ctrlKey: true, shiftKey: true })) ===
      "session:prev",
  );
}

// 反斜線與 F6
{
  check(
    "Ctrl+\\ → layout:split-right",
    matchBinding(ev({ key: "\\", code: "Backslash", ctrlKey: true })) === "layout:split-right",
  );
  check("F6 → focus:cycle-region", matchBinding(ev({ key: "F6", code: "F6" })) === "focus:cycle-region");
  check(
    "Shift+F6 → focus:cycle-region-back",
    matchBinding(ev({ key: "F6", code: "F6", shiftKey: true })) === "focus:cycle-region-back",
  );
}

// Alt 組合（pane 焦點/縮放）
{
  check(
    "Ctrl+Alt+← → layout:focus-left",
    matchBinding(ev({ key: "ArrowLeft", code: "ArrowLeft", ctrlKey: true, altKey: true })) ===
      "layout:focus-left",
  );
  check(
    "Ctrl+Alt+Shift+→ → layout:resize-right",
    matchBinding(
      ev({ key: "ArrowRight", code: "ArrowRight", ctrlKey: true, altKey: true, shiftKey: true }),
    ) === "layout:resize-right",
  );
  check(
    "純方向鍵不比中",
    matchBinding(ev({ key: "ArrowLeft", code: "ArrowLeft" })) === null,
  );
}

// shortcutLabel：mac / windows 顯示格式
{
  check("mac label ⇧⌘P", shortcutLabel("palette:open", true) === "⇧⌘P");
  check("win label Ctrl+Shift+P", shortcutLabel("palette:open", false) === "Ctrl+Shift+P");
  check("win label Ctrl+\\", shortcutLabel("layout:split-right", false) === "Ctrl+\\");
  check("win label Ctrl+1", shortcutLabel("session:switch-1", false) === "Ctrl+1");
  check(
    "win label Ctrl+Alt+Shift+→",
    shortcutLabel("layout:resize-right", false) === "Ctrl+Alt+Shift+→",
  );
  check("無綁定 → undefined", shortcutLabel("approval:approve-all", false) === undefined);
  check("F6 label", shortcutLabel("focus:cycle-region", false) === "F6");
}

console.log(`\nkeymap: ${passed} checks passed`);
