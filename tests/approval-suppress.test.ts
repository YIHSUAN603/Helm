// Post-response approval suppression 的純函式測試（不需 GUI / Tauri）。
// 執行：node --experimental-strip-types tests/approval-suppress.test.ts
import assert from "node:assert";
import {
  APPROVAL_SUPPRESS_MS,
  RESPONSE_INEFFECTIVE_WINDOW_MS,
  clearApprovalSuppress,
  isApprovalSuppressed,
  isResponseIneffective,
  markApprovalAnswered,
} from "../src/store/approvalSuppress.ts";

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
  console.log(`  ok - ${name}`);
}

const T0 = 1_000_000;

check("未回應過的 prompt 不抑制", !isApprovalSuppressed("s1", "Run ls?", T0));

// 回應後：同 prompt 於窗內抑制、窗外恢復
{
  markApprovalAnswered("s1", "Run ls?", T0);
  check("剛回應的同 prompt 於窗內抑制", isApprovalSuppressed("s1", "Run ls?", T0 + 500));
  check(
    "不同 prompt 不抑制（是新審批）",
    !isApprovalSuppressed("s1", "Delete file?", T0 + 500),
  );
  check(
    "同 prompt 超過抑制窗後恢復顯示",
    !isApprovalSuppressed("s1", "Run ls?", T0 + APPROVAL_SUPPRESS_MS),
  );
}

// clearApprovalSuppress：清掉後立即恢復
{
  markApprovalAnswered("s2", "Apply patch?", T0);
  clearApprovalSuppress("s2");
  check(
    "清除紀錄後同 prompt 不再抑制",
    !isApprovalSuppressed("s2", "Apply patch?", T0 + 500),
  );
}

// session 之間互不影響
{
  markApprovalAnswered("s3", "Run build?", T0);
  check(
    "不同 session 的同 prompt 各自獨立",
    !isApprovalSuppressed("s4", "Run build?", T0 + 500),
  );
}

// isResponseIneffective：回應後同 prompt 又出現 = 按鍵可能未生效
{
  markApprovalAnswered("s5", "Run ls?", T0);
  check(
    "抑制窗內不算未生效（還在等重繪）",
    !isResponseIneffective("s5", "Run ls?", T0 + APPROVAL_SUPPRESS_MS - 1),
  );
  check(
    "抑制窗後同 prompt 重現 → 未生效",
    isResponseIneffective("s5", "Run ls?", T0 + APPROVAL_SUPPRESS_MS),
  );
  check(
    "不同 prompt 不算未生效",
    !isResponseIneffective("s5", "Delete file?", T0 + APPROVAL_SUPPRESS_MS),
  );
  check(
    "超過提示窗後不再顯示未生效",
    !isResponseIneffective("s5", "Run ls?", T0 + RESPONSE_INEFFECTIVE_WINDOW_MS),
  );
  check("沒回應過的 session 不算未生效", !isResponseIneffective("s6", "Run ls?", T0 + 5_000));
}

console.log(`\napproval-suppress: ${passed} checks passed`);
