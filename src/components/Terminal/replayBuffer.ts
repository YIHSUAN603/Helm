import type { Terminal } from "@xterm/xterm";

/** 將紀錄推入回捲區，讓新 PTY 與 xterm 都從畫面左上角開始。 */
export async function writeReplayBuffer(term: Terminal, text: string): Promise<number> {
  if (!text) return 0;
  await new Promise<void>((resolve) => term.write(text, resolve));
  // 重播已以 CRLF 結尾。再補一個畫面的空行，把所有紀錄推離活動畫面；
  // 不能只送 CUP 歸位，否則 ConPTY 的絕對定位輸出仍會覆蓋舊紀錄。
  await new Promise<void>((resolve) => {
    term.write("\r\n".repeat(term.rows - 1) + "\x1b[H", resolve);
  });
  return term.buffer.normal.baseY;
}
