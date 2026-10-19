// 前端呼叫 Rust PTY commands / 訂閱 PTY events 的封裝層。
import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { initialSessionTracker } from "../store/initialSession";
import { useTerminalDiagnosticsStore } from "../store/terminalDiagnostics";
import { runPtyOperation, type PtyOperation } from "./ptyErrors";

export interface SpawnOptions {
  id: string;
  cols: number;
  rows: number;
  shell?: string;
  cwd?: string;
  /** Workspace recipe 帶來的額外環境變數；Helm 自己的變數由 pty.rs 擋下不被覆寫。 */
  env?: Record<string, string>;
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

// Dead sessions and browser-only development are quiet. Other failures remain
// non-throwing for cleanup/input handlers, but are visible in Settings → About.
// Spawn retains its rejection contract for cwd fallback and launch handling.
function ptyFireAndForget(
  cmd: PtyOperation,
  args: Record<string, unknown> & { id: string },
): Promise<void> {
  return runPtyOperation(
    cmd,
    args.id,
    () => invoke<void>(cmd, args),
    (failure) => {
      if (isTauri()) useTerminalDiagnosticsStore.getState().record(failure);
    },
  );
}

/** xterm protocol replies use false; its actual input is tracked at the UI source. */
export function ptyWrite(id: string, data: string, isUserInput = true): Promise<void> {
  if (isUserInput && data.length > 0) {
    initialSessionTracker.markUsed(id);
  }
  return ptyFireAndForget("pty_write", { id, data });
}

export function ptyResize(id: string, cols: number, rows: number): Promise<void> {
  return ptyFireAndForget("pty_resize", { id, cols, rows });
}

export function ptyKill(id: string): Promise<void> {
  return ptyFireAndForget("pty_kill", { id });
}

/** 訂閱某個 PTY 的結束事件。 */
export function onPtyExit(id: string, callback: () => void): Promise<UnlistenFn> {
  return listen(`pty://exit/${id}`, () => callback());
}
