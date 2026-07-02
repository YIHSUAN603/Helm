// Extractor 純函式測試（成本/tokens/檔案變更）。
// 執行：node --experimental-strip-types tests/agent-extract.test.ts
import assert from "node:assert";
import { extractFromLine } from "../src/agents/extract.ts";
import { BUILTIN_PROFILES, GENERIC_PROFILE } from "../src/agents/builtins.ts";

const claude = BUILTIN_PROFILES.find((p) => p.id === "claude-code")!;

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
  console.log(`  ok - ${name}`);
}

// generic 成本
check(
  "generic 擷取成本",
  extractFromLine(GENERIC_PROFILE, "Total cost: $0.0123").cost === 0.0123,
);
// generic tokens（含千分位）
check(
  "generic 擷取 input tokens",
  extractFromLine(GENERIC_PROFILE, "12,345 input tokens used").tokensIn === 12345,
);
// generic 檔案變更
{
  const f = extractFromLine(GENERIC_PROFILE, "edited: src/demo.txt").file;
  check("generic 檔案變更 op", f?.op === "edited");
  check("generic 檔案變更 path", f?.path === "src/demo.txt");
}
// generic 無關行不誤取
check(
  "generic 無關行回空",
  Object.keys(extractFromLine(GENERIC_PROFILE, "just chatting here")).length === 0,
);

// claude 風格
check(
  "claude 擷取 total cost",
  extractFromLine(claude, "Total cost: $1.42 (session)").cost === 1.42,
);
{
  const f = extractFromLine(claude, "Edit(src/App.tsx)").file;
  check("claude 檔案變更 op", f?.op === "Edit");
  check("claude 檔案變更 path", f?.path === "src/App.tsx");
}
// 對照 claude 2.1.x 實際擷取字串
{
  const f = extractFromLine(claude, "⏺ Update(demo.txt)").file;
  check("claude 檔案變更 ⏺ Update", f?.op === "Update" && f?.path === "demo.txt");
}
check(
  "claude tokens ↑ 輸入",
  extractFromLine(claude, "↑ 75 tokens · thinking").tokensIn === 75,
);
check(
  "claude tokens ↓ 輸出",
  extractFromLine(claude, "↓ 1,234 tokens").tokensOut === 1234,
);
check(
  "claude Read 不算檔案變更",
  extractFromLine(claude, "⏺ Read(demo.txt)").file === undefined,
);

console.log(`\n${passed} checks passed.`);
