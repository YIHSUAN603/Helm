// 前端呼叫 Rust PTY commands / 訂閱 PTY events 的封裝層。
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface SpawnOptions {
  id: string;
  cols: number;
  rows: number;
  shell?: string;
  cwd?: string;
}

export function ptySpawn(options: SpawnOptions): Promise<void> {
  return invoke("pty_spawn", { options });
}

export function ptyWrite(id: string, data: string): Promise<void> {
  return invoke("pty_write", { id, data });
}

export function ptyResize(id: string, cols: number, rows: number): Promise<void> {
  return invoke("pty_resize", { id, cols, rows });
}

export function ptyKill(id: string): Promise<void> {
  return invoke("pty_kill", { id });
}

/** 訂閱某個 PTY 的輸出；callback 收到已解碼的原始 bytes。 */
export function onPtyOutput(
  id: string,
  callback: (bytes: Uint8Array) => void,
): Promise<UnlistenFn> {
  return listen<string>(`pty://output/${id}`, (event) => {
    const bin = atob(event.payload);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    callback(bytes);
  });
}

/** 訂閱某個 PTY 的結束事件。 */
export function onPtyExit(id: string, callback: () => void): Promise<UnlistenFn> {
  return listen(`pty://exit/${id}`, () => callback());
}
