// OSC 52 剪貼簿 payload 解析（純函式，node 可測）。
// 序列格式：`\x1b]52;<selection>;<base64>\x07`，handler 收到的是
// `<selection>;<base64>` 這段；selection 為 c/p/s/0-7 的組合，可為空。

/** Parse an OSC 52 payload ("<selection>;<base64>"). Returns the decoded
 *  UTF-8 text to copy, or null for queries ("?") / malformed payloads. */
export function decodeOsc52(data: string): string | null {
  const sep = data.indexOf(";");
  if (sep < 0) return null;
  const payload = data.slice(sep + 1);
  // `?` 是讀取剪貼簿的查詢：刻意不支援（回應會把剪貼簿洩漏給任何寫入
  // PTY 的程式；貼進 TUI 走 Cmd+V / bracketed paste 即可）。
  if (payload === "?") return null;
  try {
    const bin = atob(payload);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}
