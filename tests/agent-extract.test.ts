// Extractor 純函式測試（成本/tokens/檔案變更）。
// 執行：node --experimental-strip-types tests/agent-extract.test.ts
import assert from "node:assert";
import { extractFromLine, extractUsageFromText } from "../src/agents/extract.ts";
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

// k/m 縮寫（現行 Claude Code footer 格式）
check(
  "claude tokens ↓ k 縮寫",
  extractFromLine(claude, "↓ 2.1k tokens").tokensOut === 2100,
);
check(
  "claude tokens ↑ m 縮寫",
  extractFromLine(claude, "↑ 1.2m tokens").tokensIn === 1_200_000,
);
check(
  "claude footer 完整行擷取 tokens",
  extractFromLine(claude, "✻ Thinking… (esc to interrupt · 12s · ↓ 1.5k tokens)")
    .tokensOut === 1500,
);

// extractUsageFromText：整段 viewport 文字擷取用量
{
  const text = [
    "⏺ Update(demo.txt)",
    "Total cost: $1.42 (session)",
    "↓ 800 tokens",
    "✻ Thinking… (esc to interrupt · 12s · ↓ 1.5k tokens)",
  ].join("\n");
  const usage = extractUsageFromText(claude, text);
  check("usage 擷取 cost", usage.cost === 1.42);
  check("usage 後行覆蓋前行（footer 在底部）", usage.tokensOut === 1500);
  check(
    "usage 不含檔案變更",
    !("file" in usage),
  );
}
// Pre-filter 邊界：頂層 | 的 pattern 仍能擷取（(?:...) 包裹不會互相汙染）
{
  const alt = {
    id: "alt",
    label: "Alt",
    states: {},
    approve: "y",
    reject: "n",
    extract: { cost: "Total cost: \\$([\\d.]+)|Spent \\$([\\d.]+)" },
  };
  check(
    "頂層交替 pattern 仍擷取 cost",
    extractFromLine(alt, "Total cost: $2.50").cost === 2.5,
  );
  check(
    "頂層交替 pattern 無關行回空",
    Object.keys(extractFromLine(alt, "nothing to see")).length === 0,
  );
}
// Pre-filter 邊界：單一 pattern 無效時，其餘有效 pattern 不受影響
{
  const broken = {
    id: "broken",
    label: "Broken",
    states: {},
    approve: "y",
    reject: "n",
    extract: { cost: "cost: \\$([\\d.]+)", fileChange: "([" },
  };
  check(
    "無效 fileChange 不影響 cost 擷取",
    extractFromLine(broken, "cost: $0.5").cost === 0.5,
  );
}
check(
  "usage 無 extract 的 profile 回空",
  Object.keys(
    extractUsageFromText(
      { id: "x", label: "X", states: {}, approve: "y", reject: "n" },
      "↓ 1.5k tokens",
    ),
  ).length === 0,
);

console.log(`\n${passed} checks passed.`);
