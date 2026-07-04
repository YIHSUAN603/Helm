// Session metadata 持久化的前端封裝（對應 Rust store.rs 的 commands）。
// 呼叫皆 try/catch 包起：即使後端尚未就緒也不影響 UI 運作。
import { invoke } from "@tauri-apps/api/core";
import type { Session } from "../store/sessions";
import type { LayoutNode } from "../store/layoutTree";
import { sanitizeTree } from "../store/layoutTree";
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

/** 還原 split 版面樹；不存在或損壞時回 null。 */
export async function loadLayout(): Promise<LayoutNode | null> {
  try {
    const json = await invoke<string | null>("layout_get");
    if (!json) return null;
    return sanitizeTree(JSON.parse(json));
  } catch {
    return null;
  }
}

/** 持久化 split 版面樹（結構變更與拖曳 commit 時呼叫）。 */
export async function persistLayout(root: LayoutNode | null): Promise<void> {
  try {
    await invoke("layout_set", { tree: JSON.stringify(root) });
  } catch {
    // 忽略：持久化失敗不影響使用。
  }
}
