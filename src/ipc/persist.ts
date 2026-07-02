// Session metadata 持久化的前端封裝（對應 Rust store.rs 的 commands）。
// 呼叫皆 try/catch 包起：即使後端尚未就緒也不影響 UI 運作。
import { invoke } from "@tauri-apps/api/core";
import type { Session } from "../store/sessions";
import { getProfile } from "../agents/registry";

interface StoredSession {
  id: string;
  title: string;
  status: string;
  createdAt: number;
  agentId: string | null;
  launchCommand: string | null;
}

export async function loadSessions(): Promise<Session[]> {
  try {
    const rows = await invoke<StoredSession[]>("sessions_list");
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: "idle", // 還原時回到 idle（PTY 是重新 spawn 的）
      createdAt: r.createdAt,
      agentId: r.agentId,
      agentLabel: r.agentId ? getProfile(r.agentId).label : undefined,
      launchCommand: r.launchCommand ?? undefined,
    }));
  } catch {
    return [];
  }
}

export async function persistSession(session: Session): Promise<void> {
  try {
    await invoke("session_upsert", {
      session: {
        id: session.id,
        title: session.title,
        status: session.status,
        createdAt: session.createdAt,
        agentId: session.agentId,
        launchCommand: session.launchCommand ?? null,
      },
    });
  } catch {
    // 忽略：持久化失敗不影響使用。
  }
}

export async function removePersistedSession(id: string): Promise<void> {
  try {
    await invoke("session_delete", { id });
  } catch {
    // 忽略
  }
}
