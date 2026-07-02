// Agent 狀態引擎的純函式測試（不需 GUI / Tauri）。
// 執行：node --experimental-strip-types tests/agent-engine.test.ts
import assert from "node:assert";
import { deriveState, stripAnsi } from "../src/agents/engine.ts";
import { BUILTIN_PROFILES, GENERIC_PROFILE } from "../src/agents/builtins.ts";

const claude = BUILTIN_PROFILES.find((p) => p.id === "claude-code")!;
const codex = BUILTIN_PROFILES.find((p) => p.id === "codex")!;

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
  console.log(`  ok - ${name}`);
}

// stripAnsi 移除跳脫序列
check(
  "stripAnsi 移除 CSI 色碼",
  stripAnsi("\x1b[31mred\x1b[0m text") === "red text",
);
check(
  "stripAnsi 移除 OSC 標題序列",
  stripAnsi("\x1b]0;title\x07hello") === "hello",
);

// generic：常見審批字樣
{
  const d = deriveState(GENERIC_PROFILE, "thinking...\nDo you want to proceed? (y/n) ");
  check("generic 偵測 waiting", d.state === "waiting");
  check("generic 擷取 prompt", !!d.prompt && d.prompt.includes("(y/n)"));
}
check(
  "generic 偵測 thinking",
  deriveState(GENERIC_PROFILE, "thinking about it").state === "thinking",
);
check(
  "generic 偵測 error",
  deriveState(GENERIC_PROFILE, "fatal error: boom").state === "error",
);
check("generic 無匹配回空", deriveState(GENERIC_PROFILE, "just a prompt $").state === undefined);

// claude：數字選單核准 UI
check(
  "claude 偵測 waiting (❯ 1. Yes)",
  deriveState(claude, "  ❯ 1. Yes\n    2. No").state === "waiting",
);
check(
  "claude 偵測 thinking (✻ Thinking)",
  deriveState(claude, "✻ Thinking...").state === "thinking",
);
// 以下對照 claude 2.1.x 實際 TUI 擷取的字串
check(
  "claude thinking 星號 gerund (✽ Recombobulating…)",
  deriveState(claude, "✽ Recombobulating… (esc to interrupt)").state === "thinking",
);
check(
  "claude tool (⏺ Running 1 shell command)",
  deriveState(claude, "⏺ Running 1 shell command…").state === "tool",
);
check(
  "claude tool (⏺ Update(demo.txt))",
  deriveState(claude, "⏺ Update(demo.txt)").state === "tool",
);
check(
  "claude done (Worked for 5s)",
  deriveState(claude, "Worked for 5s").state === "done",
);
check(
  "claude 輸入框 ❯ 不誤判為 waiting",
  deriveState(claude, '❯ Try "edit <filepath> to..."').state !== "waiting",
);

// 反例：平常畫面上的字詞不應誤判為 waiting（修正 false positive）
check(
  "claude 不因 'Do you want' 誤判",
  deriveState(claude, "Tip: Do you want faster edits? Try plan mode.").state !== "waiting",
);
check(
  "claude 不因 'proceed?' 誤判",
  deriveState(claude, "Let me know how to proceed?").state !== "waiting",
);
check(
  "generic 不因裸 'Allow' 誤判",
  deriveState(GENERIC_PROFILE, "Allow list updated.").state !== "waiting",
);

// claude 啟動的「信任資料夾」對話框應被 ignore 排除（使用者實際回報的文字）
check(
  "claude ignore 信任資料夾對話框",
  deriveState(claude, "✳ Claude Code\nSecurity guide\n❯ 1. Yes, I trust this folder\n  2. No")
    .state !== "waiting",
);
check(
  "claude 仍偵測真正的動作核准 (Bash 命令)",
  deriveState(claude, "Run this command?\n❯ 1. Yes\n  2. No, tell Claude").state === "waiting",
);

// codex
check(
  "codex 偵測 waiting (Allow command)",
  deriveState(codex, "Allow command to run? (y/n)").state === "waiting",
);

// waiting 優先於其他狀態
check(
  "waiting 優先序高於 error",
  deriveState(GENERIC_PROFILE, "error happened\nProceed? (y/n)").state === "waiting",
);

console.log(`\n${passed} checks passed.`);
