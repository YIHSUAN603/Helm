// 前端呼叫 Rust PTY commands / 訂閱 PTY events 的封裝層。
import { Channel, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface SpawnOptions {
  id: string;
  cols: number;
  rows: number;
  shell?: string;
  cwd?: string;
}

/**
 * Spawn a PTY; its output arrives on `onOutput` as raw bytes through an
 * invoke Channel (ordered, no base64/JSON round-trip). The channel has no
 * unlisten — it dies with the PTY (pty_kill ends the Rust reader thread).
 */
export function ptySpawn(
  options: SpawnOptions,
  onOutput: (bytes: Uint8Array) => void,
): Promise<void> {
  const channel = new Channel<ArrayBuffer | number[]>();
  channel.onmessage = (data) =>
    onOutput(data instanceof ArrayBuffer ? new Uint8Array(data) : Uint8Array.from(data));
  return invoke("pty_spawn", { options, onOutput: channel });
}

// Write/resize reject with "no pty session" once the shell has exited (the
// Rust reader thread removes the session on EOF); callers fire-and-forget
// (`void ptyWrite(...)`), so swallow here — input to a dead session is a no-op,
// not an error worth an unhandled rejection.
export function ptyWrite(id: string, data: string): Promise<void> {
  return invoke<void>("pty_write", { id, data }).catch(() => {});
}

export function ptyResize(id: string, cols: number, rows: number): Promise<void> {
  return invoke<void>("pty_resize", { id, cols, rows }).catch(() => {});
}

export function ptyKill(id: string): Promise<void> {
  return invoke("pty_kill", { id });
}

/** 訂閱某個 PTY 的結束事件。 */
export function onPtyExit(id: string, callback: () => void): Promise<UnlistenFn> {
  return listen(`pty://exit/${id}`, () => callback());
}
