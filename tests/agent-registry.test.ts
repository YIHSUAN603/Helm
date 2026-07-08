// Agent registry 的偵測 / 查詢純函式測試（不需 GUI / Tauri）。
// 執行：node --experimental-strip-types tests/agent-registry.test.ts
import assert from "node:assert";
import { detectProfile, getProfile } from "../src/agents/registry.ts";
import { GENERIC_PROFILE } from "../src/agents/builtins.ts";

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
  console.log(`  ok - ${name}`);
}

// detectProfile：從輸出被動偵測內建 profile
check(
  "detectProfile 偵測 Claude Code",
  detectProfile("Welcome to Claude Code v1.0")?.id === "claude-code",
);
check(
  "detectProfile 對 detectOutput 不分大小寫",
  detectProfile("powered by ANTHROPIC")?.id === "claude-code",
);
check(
  "detectProfile 偵測 Codex",
  detectProfile("OpenAI Codex session started")?.id === "codex",
);
check(
  "detectProfile 對一般 shell 輸出回傳 null",
  detectProfile("$ ls -la\ntotal 0") === null,
);
check(
  "detectProfile 重複呼叫（快取路徑）結果一致",
  detectProfile("claude.ai/code")?.id === "claude-code" &&
    detectProfile("claude.ai/code")?.id === "claude-code",
);

// getProfile：id 查詢與 fallback
check("getProfile 以 id 取得內建 profile", getProfile("claude-code").id === "claude-code");
check("getProfile null 回傳 GENERIC_PROFILE", getProfile(null) === GENERIC_PROFILE);
check("getProfile undefined 回傳 GENERIC_PROFILE", getProfile(undefined) === GENERIC_PROFILE);
check("getProfile 未知 id 回傳 GENERIC_PROFILE", getProfile("no-such-agent") === GENERIC_PROFILE);

console.log(`agent-registry: ${passed} checks passed`);
