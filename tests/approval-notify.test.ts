// Approval notification dedupe 的純函式測試（不需 GUI / Tauri）。
// 執行：node --experimental-strip-types tests/approval-notify.test.ts
import assert from "node:assert";
import {
  APPROVAL_NOTIFY_COOLDOWN_MS,
  clearApprovalNotify,
  shouldNotifyApproval,
} from "../src/store/approvalNotify.ts";

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
  console.log(`  ok - ${name}`);
}

const T0 = 1_000_000;

check("首次出現的 prompt 應通知", shouldNotifyApproval("s1", "Run ls?", T0));
check(
  "同 prompt 於 cooldown 內不重複通知（flapping 抑制）",
  !shouldNotifyApproval("s1", "Run ls?", T0 + 1_000),
);
check(
  "不同 prompt 應立即通知",
  shouldNotifyApproval("s1", "Delete file?", T0 + 2_000),
);
check(
  "換回原 prompt 也視為新審批（紀錄已被覆蓋）",
  shouldNotifyApproval("s1", "Run ls?", T0 + 3_000),
);
check(
  "同 prompt 超過 cooldown 應再通知",
  shouldNotifyApproval("s1", "Run ls?", T0 + 3_000 + APPROVAL_NOTIFY_COOLDOWN_MS),
);

// 明確回應（respondApproval）→ 清紀錄 → 同 prompt 立即再通知
{
  const t = T0 + 10_000;
  shouldNotifyApproval("s2", "Apply patch?", t);
  clearApprovalNotify("s2");
  check(
    "clearApprovalNotify 後同 prompt 應立即通知",
    shouldNotifyApproval("s2", "Apply patch?", t + 1_000),
  );
}

// session 之間互不影響
{
  const t = T0 + 20_000;
  shouldNotifyApproval("s3", "Run build?", t);
  check(
    "不同 session 的同 prompt 各自獨立",
    shouldNotifyApproval("s4", "Run build?", t + 1_000),
  );
}

console.log(`\n${passed} checks passed.`);
