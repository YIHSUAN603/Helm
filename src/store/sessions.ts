// 多 session 狀態管理 + agent 感知。
import { create } from "zustand";
import { persistSession, removePersistedSession } from "../ipc/persist";
import { notify } from "../ipc/notify";
import { getProfile } from "../agents/registry";
import type { AgentLauncher, AgentState } from "../agents/types";

export type SessionStatus = "idle" | "busy" | "exited";

export interface Session {
  id: string;
  title: string;
  status: SessionStatus; // 活動燈（無 agent 時使用）
  createdAt: number;
  // ---- agent 相關 ----
  agentId: string | null; // profile id（launcher 指定或被動偵測到）
  agentLabel?: string;
  agentState?: AgentState;
  pendingApproval?: string; // waiting 時的提示行
  launchCommand?: string; // 啟動時送進 PTY 的指令（restore 用）
  // ---- 本次執行的用量/變更（不持久化，重跑歸零）----
  cost?: number;
  tokensIn?: number;
  tokensOut?: number;
  changedFiles?: { op: string; path: string }[];
}

interface SessionState {
  sessions: Session[];
  activeId: string | null;
  createSession: (launcher?: AgentLauncher) => string;
  closeSession: (id: string) => void;
  setActive: (id: string) => void;
  setTitle: (id: string, title: string) => void;
  setStatus: (id: string, status: SessionStatus) => void;
  setDetectedAgent: (id: string, profileId: string, label: string) => void;
  setAgentState: (id: string, state: AgentState, prompt?: string) => void;
  clearApproval: (id: string) => void;
  setUsage: (
    id: string,
    usage: { cost?: number; tokensIn?: number; tokensOut?: number },
  ) => void;
  addChangedFile: (id: string, file: { op: string; path: string }) => void;
  restoreSessions: (sessions: Session[]) => void;
}

let counter = 0;

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeId: null,

  createSession: (launcher) => {
    const id = crypto.randomUUID();
    const profileId = launcher?.profileId ?? null;
    const session: Session = {
      id,
      title: launcher?.label ?? `Session ${++counter}`,
      status: "idle",
      createdAt: Date.now(),
      agentId: profileId,
      agentLabel: profileId ? getProfile(profileId).label : undefined,
      launchCommand: launcher?.command || undefined,
    };
    set((s) => ({ sessions: [...s.sessions, session], activeId: id }));
    void persistSession(session);
    return id;
  },

  closeSession: (id) => {
    const { sessions, activeId } = get();
    const remaining = sessions.filter((s) => s.id !== id);
    let nextActive = activeId;
    if (activeId === id) {
      const idx = sessions.findIndex((s) => s.id === id);
      nextActive = remaining[idx]?.id ?? remaining[idx - 1]?.id ?? null;
    }
    set({ sessions: remaining, activeId: nextActive });
    void removePersistedSession(id);
  },

  setActive: (id) => set({ activeId: id }),

  setTitle: (id, title) =>
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === id ? { ...x, title } : x)),
    })),

  setStatus: (id, status) =>
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === id && x.status !== "exited" ? { ...x, status } : x,
      ),
    })),

  setDetectedAgent: (id, profileId, label) => {
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === id && !x.agentId ? { ...x, agentId: profileId, agentLabel: label } : x,
      ),
    }));
    const sess = get().sessions.find((x) => x.id === id);
    if (sess) void persistSession(sess);
  },

  setAgentState: (id, state, prompt) => {
    const prev = get().sessions.find((x) => x.id === id);
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === id
          ? {
              ...x,
              agentState: state,
              pendingApproval: state === "waiting" ? prompt : undefined,
            }
          : x,
      ),
    }));
    // 首次進入 waiting → 桌面通知。
    if (state === "waiting" && prev?.agentState !== "waiting") {
      notify(`${prev?.agentLabel ?? "Agent"} 需要你核准`, prompt ?? "等待審批");
    }
  },

  clearApproval: (id) =>
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === id ? { ...x, pendingApproval: undefined, agentState: undefined } : x,
      ),
    })),

  setUsage: (id, usage) =>
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === id
          ? {
              ...x,
              cost: usage.cost ?? x.cost,
              tokensIn: usage.tokensIn ?? x.tokensIn,
              tokensOut: usage.tokensOut ?? x.tokensOut,
            }
          : x,
      ),
    })),

  addChangedFile: (id, file) =>
    set((s) => ({
      sessions: s.sessions.map((x) => {
        if (x.id !== id) return x;
        const files = x.changedFiles ?? [];
        const idx = files.findIndex((f) => f.path === file.path);
        // 已存在 → 更新 op；否則追加（保留首次出現順序）。
        const next =
          idx >= 0
            ? files.map((f, i) => (i === idx ? file : f))
            : [...files, file];
        return { ...x, changedFiles: next };
      }),
    })),

  restoreSessions: (sessions) => {
    counter = Math.max(counter, sessions.length);
    set({ sessions, activeId: sessions[0]?.id ?? null });
  },
}));
