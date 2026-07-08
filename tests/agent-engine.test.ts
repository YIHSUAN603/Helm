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
{
  // Fast path: no control chars → the exact same string comes back (\n \t kept).
  const clean = "plain text\nwith\ttabs and ❯ unicode";
  check("stripAnsi 乾淨文字原樣返回", stripAnsi(clean) === clean);
}

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

// 反例：跨行 / 大小寫 / 已回答提示不應誤判為 waiting（修正通知風暴的 false positive）
check(
  "claude 行尾 ❯ + 後行編號清單不跨行誤判",
  deriveState(claude, "some text ❯\n\n1. Run the build").state !== "waiting",
);
check(
  "claude shell 提示符 ❯ + 編號散文不誤判",
  deriveState(claude, "~/project ❯\ngit log\n 2. Create a branch").state !== "waiting",
);
check(
  "claude 小寫散文 (❯ 1. yes ...) 不誤判",
  deriveState(claude, "❯ 1. yes we could do that").state !== "waiting",
);
check(
  "generic 已回答的 (y/n): y 不再視為 waiting",
  deriveState(GENERIC_PROFILE, "Overwrite? (y/n): y").state !== "waiting",
);
check(
  "codex 已回答的 (y/n): n 不再視為 waiting",
  deriveState(codex, "Delete file? (y/n): n").state !== "waiting",
);

// y/n 各種活提示形式仍須偵測為 waiting（行尾錨定不可造成 false negative）
check(
  "generic 偵測 (Y/n)",
  deriveState(GENERIC_PROFILE, "Continue? (Y/n)").state === "waiting",
);
check(
  "generic 偵測 [y/N] 含尾端空白",
  deriveState(GENERIC_PROFILE, "Replace? [y/N] ").state === "waiting",
);
check(
  "generic 偵測 (y/n): 冒號結尾",
  deriveState(GENERIC_PROFILE, "Proceed? (y/n):").state === "waiting",
);

// codex
check(
  "codex 偵測 waiting (Allow command)",
  deriveState(codex, "Allow command to run? (y/n)").state === "waiting",
);
// detectOutput 收緊：不因一般文字提到 codex 而誤標 session
{
  const detect = new RegExp(codex.detectOutput!, "i");
  check("codex detectOutput 命中 CLI banner", detect.test("Codex CLI v1.0"));
  check(
    "codex detectOutput 不因檔名提及誤判",
    !detect.test("downloading codex-notes.md from git log"),
  );
}

// waiting 優先於其他狀態
check(
  "waiting 優先序高於 error",
  deriveState(GENERIC_PROFILE, "error happened\nProceed? (y/n)").state === "waiting",
);

// stale-menu veto：選單「下方」出現輸入框列 ⇒ 已回答的殘影，不判 waiting。
// 作用中的審批對話框會取代輸入框，兩者不會同框出現在選單下方。
check(
  "claude 已回答殘影（下方有輸入框）不判 waiting",
  deriveState(
    claude,
    "Do you want to proceed?\n❯ 1. Yes\n  2. No\n╭──────────╮\n│ >        │\n╰──────────╯\n  ? for shortcuts",
  ).state !== "waiting",
);
check(
  "claude 已回答殘影（僅 ? for shortcuts 提示）不判 waiting",
  deriveState(claude, "❯ 1. Yes\n  2. No\n  ? for shortcuts").state !== "waiting",
);
check(
  "claude 殘影不遮蔽真實狀態（下方 thinking 判 thinking）",
  deriveState(
    claude,
    "❯ 1. Yes\n  2. No\n✻ Pondering… (esc to interrupt)\n│ > │",
  ).state === "thinking",
);
check(
  "claude 輸入框殘影在選單上方不影響作用中審批",
  deriveState(
    claude,
    "│ > │\nDo you want to proceed?\n❯ 1. Yes\n  2. No",
  ).state === "waiting",
);
check(
  "claude 作用中對話框（框底線下無輸入框）仍判 waiting",
  deriveState(
    claude,
    "│ Do you want to proceed?  │\n│ ❯ 1. Yes                 │\n│   2. No                  │\n╰──────────────────────────╯",
  ).state === "waiting",
);
check(
  "generic 無 inputBox pattern 行為不變",
  deriveState(GENERIC_PROFILE, "Proceed? (y/n)\n│ > │").state === "waiting",
);

// composer 閒置規則：輸入框可見且無 spinner ⇒ done。viewport 殘留的
// ⏺ 工具行 / "failed" 散文不得把燈號釘在 tool/error；工作中（含工具執行）
// spinner／esc to interrupt 恆在，thinking 命中即否決此規則。
check(
  "claude 完成後殘留 ⏺ 行 + 閒置輸入框判 done",
  deriveState(
    claude,
    "⏺ Update(demo.txt)\n╭──────────╮\n│ >        │\n╰──────────╯\n  ? for shortcuts",
  ).state === "done",
);
check(
  "claude 工具執行中（spinner 在場）仍判 tool",
  deriveState(
    claude,
    "⏺ Running 1 shell command…\n✻ Pondering… (esc to interrupt)\n│ > │",
  ).state === "tool",
);
check(
  "claude 思考中（spinner + 輸入框同框）仍判 thinking",
  deriveState(claude, "✻ Thinking…\n│ > │").state === "thinking",
);
check(
  "claude 全新 composer（無任何殘影）判 done",
  deriveState(claude, "│ > \n  ? for shortcuts").state === "done",
);
check(
  "claude 閒置輸入框旁殘留 failed 散文判 done（不釘 error）",
  deriveState(
    claude,
    "⏺ Bash(npm test)\n1 test failed\n│ > │\n  ? for shortcuts",
  ).state === "done",
);
check(
  "generic 無 inputBox pattern 不受 composer 規則影響（無匹配回空）",
  deriveState(GENERIC_PROFILE, "│ > │").state === undefined,
);

// 純文字提問：composer 閒置 + 上方最後一句為問句 ⇒ waiting / kind = question
// （只發桌面通知，不進 ApprovalPanel）。
{
  const d = deriveState(
    claude,
    "⏺ Which approach do you prefer?\n╭──────────╮\n│ >        │\n╰──────────╯\n  ? for shortcuts",
  );
  check("claude 純文字提問判 waiting", d.state === "waiting");
  check("claude 純文字提問 kind = question", d.kind === "question");
}
{
  const d = deriveState(
    claude,
    "⏺ 你想用哪一個方案？\n╭──────────╮\n│ >        │\n╰──────────╯\n  ? for shortcuts",
  );
  check("claude 全形問號提問判 waiting", d.state === "waiting");
  check("claude 全形問號提問 kind = question", d.kind === "question");
}
check(
  "claude 完成非問句訊息 + 閒置輸入框仍判 done（不誤判提問）",
  deriveState(
    claude,
    "⏺ Updated the config as requested.\n╭──────────╮\n│ >        │\n╰──────────╯\n  ? for shortcuts",
  ).state === "done",
);
check(
  "claude 提問後印非問句結尾行（只看最後一條內容行）不判提問",
  deriveState(
    claude,
    "⏺ Which do you prefer?\n  - Option A\n  - Option B\n│ > │\n  ? for shortcuts",
  ).state === "done",
);

// prompt 擷取：選單式審批應回報上方的問題行（每筆審批可辨識），
// 而不是各審批都相同的選項列「❯ 1. Yes」。
{
  const d = deriveState(
    claude,
    "Do you want to make this edit to demo.txt?\n❯ 1. Yes\n  2. No, tell Claude",
  );
  check("claude 選單 prompt 用上方問題行", d.prompt === "Do you want to make this edit to demo.txt?");
}
{
  const d = deriveState(
    claude,
    "╭──────────────────────────╮\n│ Bash command             │\n│ Do you want to proceed?  │\n│ ❯ 1. Yes                 │\n│   2. No                  │\n╰──────────────────────────╯",
  );
  check("claude 有邊框的審批框 prompt 去除邊框", d.prompt === "Do you want to proceed?");
}
{
  const d = deriveState(claude, "❯ 1. Yes\n  2. No");
  check("選單上方無問題行時 fallback 用選項列", d.prompt === "❯ 1. Yes");
}
{
  const d = deriveState(GENERIC_PROFILE, "Overwrite config? (y/n) ");
  check("y/n 式提示行為不變（本身就是問題行）", !!d.prompt && d.prompt.includes("Overwrite config?"));
}

// 提示類型（kind）：問題選單（AskUserQuestion，任意選項文字）與 plan 執行確認。
{
  const d = deriveState(
    claude,
    "Which approach do you prefer?\n❯ 1. Use axios\n  2. Use fetch",
  );
  check("claude 問題選單（任意選項）判 waiting", d.state === "waiting");
  check("claude 問題選單 kind = question", d.kind === "question");
  check("claude 問題選單 prompt 用問題行", d.prompt === "Which approach do you prefer?");
}
{
  const d = deriveState(
    claude,
    "│ Which library should we use?  │\n│ ❯ 1. axios                    │\n│   2. fetch                    │\n╰───────────────────────────────╯",
  );
  check("claude 有邊框的問題選單判 waiting", d.state === "waiting");
  check("claude 有邊框的問題選單 kind = question", d.kind === "question");
}
check(
  "claude 任意選單上方無問題行不判 waiting",
  deriveState(claude, "Some intro text\n❯ 1. Use axios\n  2. Use fetch").state !== "waiting",
);
check(
  "claude 問題選單下方有輸入框（殘影）不判 waiting",
  deriveState(
    claude,
    "Which approach do you prefer?\n❯ 1. Use axios\n  2. Use fetch\n  ? for shortcuts",
  ).state !== "waiting",
);
check(
  "claude ignore 對問題選單同樣生效（選主題）",
  deriveState(claude, "Select theme?\n❯ 1. Dark\n  2. Light").state !== "waiting",
);
{
  const d = deriveState(
    claude,
    "Here is Claude's plan:\n│ Add two notification kinds │\nWould you like to proceed?\n❯ 1. Yes, and auto-accept edits\n  2. Yes, and manually approve edits\n  3. No, keep planning",
  );
  check("claude plan 執行確認判 waiting", d.state === "waiting");
  check("claude plan 執行確認 kind = plan", d.kind === "plan");
  check("claude plan 確認 prompt 用問題行", d.prompt === "Would you like to proceed?");
}
check(
  "claude plan 標記無選單時不判 waiting",
  deriveState(claude, "Would you like to proceed?").state !== "waiting",
);
{
  const d = deriveState(
    claude,
    "Do you want to make this edit to demo.txt?\n❯ 1. Yes\n  2. No, tell Claude",
  );
  check("claude 動作核准 kind = approval（回歸）", d.kind === "approval");
}
check(
  "generic 無新 pattern 時 kind 一律 approval",
  deriveState(GENERIC_PROFILE, "Proceed? (y/n)").kind === "approval",
);

console.log(`\n${passed} checks passed.`);
