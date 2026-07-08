// scan/stream 工作狀態（殘餘半行 buffer + 非 waiting 連續計數）的純函式測試。
// 執行：node --experimental-strip-types tests/scan-state.test.ts
import assert from "node:assert";
import {
  LINE_BUFFER_MAX,
  bumpNonWaitingStreak,
  clearScanState,
  consumeLines,
  resetNonWaitingStreak,
} from "../src/store/scanState.ts";

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
  console.log(`  ok - ${name}`);
}

// consumeLines：完整行切出、半行留存
check(
  "完整行切出，殘餘半行留在 buffer",
  JSON.stringify(consumeLines("s1", "a\nb")) === JSON.stringify(["a"]),
);
check(
  "下一個 chunk 接續殘餘半行",
  JSON.stringify(consumeLines("s1", "c\n")) === JSON.stringify(["bc"]),
);
check("純半行 chunk 不產生行", consumeLines("s2", "abc").length === 0);
check(
  "跨 chunk 半行合併",
  JSON.stringify(consumeLines("s2", "def\n")) === JSON.stringify(["abcdef"]),
);
check(
  "一個 chunk 多行",
  JSON.stringify(consumeLines("s3", "1\n2\n3\n")) === JSON.stringify(["1", "2", "3"]),
);

// buffer 上限：長時間無換行不能無限成長（保尾）
consumeLines("s4", "x".repeat(LINE_BUFFER_MAX) + "TAIL");
const [capped] = consumeLines("s4", "\n");
check(
  `殘餘半行截斷到 ${LINE_BUFFER_MAX} 並保留尾端`,
  capped.length === LINE_BUFFER_MAX && capped.endsWith("TAIL"),
);

// 非 waiting 連續計數
check("streak 從 1 起算", bumpNonWaitingStreak("s5") === 1);
check("streak 遞增", bumpNonWaitingStreak("s5") === 2);
resetNonWaitingStreak("s5");
check("reset 後重新起算", bumpNonWaitingStreak("s5") === 1);
check("不同 session 各自計數", bumpNonWaitingStreak("s6") === 1);

// clearScanState：兩種狀態一起清掉
consumeLines("s7", "partial");
bumpNonWaitingStreak("s7");
clearScanState("s7");
check(
  "clear 後 buffer 歸零",
  JSON.stringify(consumeLines("s7", "line\n")) === JSON.stringify(["line"]),
);
check("clear 後 streak 歸零", bumpNonWaitingStreak("s7") === 1);

console.log(`scan-state: ${passed} checks passed`);
