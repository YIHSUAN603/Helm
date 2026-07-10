// Agent hook 事件封裝：Rust 端 hookserver.rs 收到 CLI hook 程序的 POST 後
// emit `agent://hook`，payload 原樣轉交（正規化在 src/agents/hookEvents.ts）。
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface AgentHookEvent {
  sessionId: string;
  source: string;
  payload: unknown;
}

/** 監聽 hook 事件；純瀏覽器環境會 reject，呼叫端忽略即可。 */
export function listenAgentHook(
  cb: (event: AgentHookEvent) => void,
): Promise<UnlistenFn> {
  return listen<AgentHookEvent>("agent://hook", (e) => cb(e.payload));
}
