// 命令面板模糊過濾純函式測試（不需 GUI / Tauri）。
// 執行：node --experimental-strip-types tests/command-filter.test.ts
import assert from "node:assert";
import { filterCommands } from "../src/commands/filter.ts";
import type { Command } from "../src/commands/types.ts";

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
  console.log(`  ok - ${name}`);
}

function cmd(id: string, title: string, extra?: Partial<Command>): Command {
  return { id, title, run: () => {}, ...extra };
}

const commands: Command[] = [
  cmd("a", "split right", { keywords: "layout" }),
  cmd("b", "right pane"),
  cmd("c", "brighten"),
  cmd("d", "向右分割", { keywords: "split right" }),
  cmd("e", "切換主題", { category: "檢視", keywords: "theme" }),
];

// 空查詢 → 保持原順序回傳全部
{
  const r = filterCommands(commands, "");
  check("空查詢回傳全部", r.length === commands.length);
  check("空查詢保持原順序", r[0].id === "a" && r[4].id === "e");
  check("空白查詢視同空查詢", filterCommands(commands, "   ").length === commands.length);
}

// 前綴 > 字詞開頭 > 子字串
{
  const r = filterCommands(commands, "right");
  check("有比中 right 的命令", r.length >= 3);
  check("前綴（right pane）最優先", r[0].id === "b");
  check("字詞開頭（split right）次之", r[1].id === "a");
  check("子字串（brighten）再次之", r.some((c) => c.id === "c"));
}

// 大小寫不敏感
{
  const r = filterCommands(commands, "RIGHT");
  check("大小寫不敏感", r[0].id === "b");
}

// keywords / category 也可比中（但排在 title 命中之後）
{
  const r = filterCommands(commands, "theme");
  check("keywords 比中 theme", r.length === 1 && r[0].id === "e");
  const r2 = filterCommands(commands, "檢視");
  check("category 比中 檢視", r2.length === 1 && r2[0].id === "e");
}

// 中文標題比對
{
  const r = filterCommands(commands, "向右");
  check("中文前綴比中", r[0].id === "d");
}

// 子序列比中（模糊）
{
  const r = filterCommands(commands, "sprt");
  check("子序列比中 split right", r.some((c) => c.id === "a"));
}

// 完全不比中 → 空陣列
{
  check("不比中回空陣列", filterCommands(commands, "zzz不存在").length === 0);
}

console.log(`\ncommand-filter: ${passed} checks passed`);
