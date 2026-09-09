import assert from "node:assert/strict";
import xterm from "@xterm/xterm";
import { buildReplayText } from "../src/components/Terminal/replay.ts";
import { writeReplayBuffer } from "../src/components/Terminal/replayBuffer.ts";

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
  console.log(`  ok - ${name}`);
}

for (const rows of [1, 5, 24]) {
  for (const count of [1, 40, 150]) {
    const term = new xterm.Terminal({ cols: 40, rows, scrollback: 100, allowProposedApi: true });
    try {
      const text = buildReplayText({
        lines: Array.from({ length: count }, (_, i) => `history ${i} with a long line that wraps across columns`),
        header: "saved history",
        footer: "end of history",
      });
      const floor = await writeReplayBuffer(term, text);
      const buf = term.buffer.normal;
      const label = `${rows} rows / ${count} history lines`;
      check(`${label}: cursor starts at origin`, buf.cursorX === 0 && buf.cursorY === 0);
      check(`${label}: floor matches live screen`, floor === buf.baseY);
      check(`${label}: footer remains in scrollback`, buf.getLine(floor - 1)?.translateToString(true) === "end of history");
      const history = Array.from({ length: floor }, (_, i) => buf.getLine(i)?.translateToString(true));
      check(`${label}: live screen is empty`, Array.from({ length: rows }, (_, i) => buf.getLine(floor + i)?.translateToString(true)).every((line) => line === ""));
      // 模擬 shell 先印 prompt，輸入時再以 ConPTY 的絕對座標重畫。
      await new Promise<void>((resolve) => term.write("PS> \x1b[1;5Habc", resolve));
      check(`${label}: input follows prompt`, buf.getLine(floor)?.translateToString(true) === "PS> abc");
      check(`${label}: input preserves history`, history.every((line, i) => buf.getLine(i)?.translateToString(true) === line));
    } finally {
      term.dispose();
    }
  }
}

const empty = new xterm.Terminal({ allowProposedApi: true });
try {
  check("no replay leaves buffer untouched", await writeReplayBuffer(empty, "") === 0 && empty.buffer.normal.baseY === 0);
} finally {
  empty.dispose();
}
console.log(`\n# replay-buffer: ${passed} checks passed`);
