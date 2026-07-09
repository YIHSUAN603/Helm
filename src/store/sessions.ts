// 多 session 狀態管理 + agent 感知。
import { create } from "zustand";
import { groupTreeOf, useLayoutStore } from "./layout";
import { siblingFirstSession } from "./layoutTree";
import { resolveFocusedWorkspace } from "./workspaceGroups";
import { clearApprovalNotify, shouldNotifyApproval } from "./approvalNotify";
import { clearApprovalSuppress } from "./approvalSuppress";
import { clearScanState } from "./scanState";
import { notify } from "../ipc/notify";
import { getProfile } from "../agents/registry";
import { t } from "../i18n";
import type { AgentLauncher, AgentState, PromptKind } from "../agents/types";

export type SessionStatus = "idle" | "busy" | "exited";

export interface Session {
  id: string;
  title: string;
  status: SessionStatus; // 活動燈（無 agent 時使用）
  createdAt: number;
  workspaceId: string; // 側欄分組（純視覺，不影響 PTY）
  cwd?: string; // PTY 啟動目錄（建立時由 workspace 資料夾快照，之後不變）
  // ---- agent 相關 ----
  agentId: string | null; // profile id（launcher 指定或被動偵測到）
  agentLabel?: string;
  agentState?: AgentState;
  pendingApproval?: string; // waiting（kind = approval）時的提示行，進 ApprovalPanel
  // waiting 且 kind 為 question/plan 時的提示：只發桌面通知，不進 ApprovalPanel
  //（誤按 Approve 會隨便選中第一個選項）。
  pendingPrompt?: { kind: "question" | "plan"; text: string };
  launchCommand?: string; // 啟動時送進 PTY 的指令
  // ---- 本次執行的用量/變更（不持久化，重跑歸零）----
  cost?: number;
  tokensIn?: number;
  tokensOut?: number;
  changedFiles?: { op: string; path: string }[];
}

interface SessionState {
  sessions: Session[];
  activeId: string | null;
  createSession: (launcher?: AgentLauncher, workspaceId?: string, cwd?: string) => string;
  closeSession: (id: string) => void;
  moveSessionToWorkspace: (sessionId: string, workspaceId: string) => void;
  setActive: (id: string) => void;
  setTitle: (id: string, title: string) => void;
  setStatus: (id: string, status: SessionStatus) => void;
  setDetectedAgent: (id: string, profileId: string, label: string) => void;
  setAgentState: (id: string, state: AgentState, prompt?: string, kind?: PromptKind) => void;
  clearApproval: (id: string) => void;
  setUsage: (
    id: string,
    usage: { cost?: number; tokensIn?: number; tokensOut?: number },
  ) => void;
  addChangedFile: (id: string, file: { op: string; path: string }) => void;
}

let counter = 0;

/**
 * Send the desktop notification for a session's pending prompt (approval /
 * question / plan, title differs by kind), unless the dedupe gate suppresses
 * it. A focused window suppresses the notification only for sessions in the
 * FOCUSED workspace — their prompt is already on screen (ApprovalPanel or the
 * dialog itself); a prompt in another workspace surfaces only as a small
 * sidebar badge, so it still notifies. The focus check runs FIRST so a
 * suppressed notification is not recorded and can still fire later from the
 * blur listener in App.tsx. Known trade-off: answering inside the terminal
 * (not via the panel) leaves the dedupe record, so an identical prompt within
 * the cooldown shows only in the panel, without a toast.
 */
export function notifyPendingPrompt(sess: Session): void {
  const kind: PromptKind = sess.pendingPrompt?.kind ?? "approval";
  const text = sess.pendingPrompt?.text ?? sess.pendingApproval;
  if (!text) return;
  if (document.hasFocus()) {
    const { sessions, activeId } = useSessionStore.getState();
    if (sess.workspaceId === resolveFocusedWorkspace(sessions, activeId)) return;
  }
  if (!shouldNotifyApproval(sess.id, text, Date.now())) return;
  notify(sess.id, t(`notify.${kind}`, { label: sess.agentLabel ?? "Agent" }), text);
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeId: null,

  createSession: (launcher, workspaceId, cwd) => {
    const id = crypto.randomUUID();
    const profileId = launcher?.profileId ?? null;
    const { sessions, activeId } = get();
    const session: Session = {
      id,
      title: launcher?.label ?? `Session ${++counter}`,
      status: "idle",
      createdAt: Date.now(),
      workspaceId: workspaceId ?? resolveFocusedWorkspace(sessions, activeId),
      cwd,
      agentId: profileId,
      agentLabel: profileId ? getProfile(profileId).label : undefined,
      launchCommand: launcher?.command || undefined,
    };
    set((s) => ({ sessions: [...s.sessions, session], activeId: id }));
    return id;
  },

  closeSession: (id) => {
    const { sessions, activeId } = get();
    // 分割群組：先記下 sibling（focus 移交對象），再收合 leaf。
    const layout = useLayoutStore.getState();
    const sibling = siblingFirstSession(groupTreeOf(layout.trees, id), id);
    layout.removeSession(id);
    const remaining = sessions.filter((s) => s.id !== id);
    let nextActive = activeId;
    if (activeId === id) {
      const idx = sessions.findIndex((s) => s.id === id);
      nextActive = sibling ?? remaining[idx]?.id ?? remaining[idx - 1]?.id ?? null;
    }
    set({ sessions: remaining, activeId: nextActive });
    clearApprovalNotify(id);
    clearApprovalSuppress(id);
    clearScanState(id);
  },

  moveSessionToWorkspace: (sessionId, workspaceId) => {
    const { sessions } = get();
    const target = sessions.find((s) => s.id === sessionId);
    if (!target || target.workspaceId === workspaceId) return;
    // 維持「群組只含同 workspace 的 session」不變量：跨 workspace 即踢出群組。
    useLayoutStore.getState().removeSession(sessionId);
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === sessionId ? { ...x, workspaceId } : x,
      ),
    }));
  },

  setActive: (id) => set({ activeId: id }),

  // Setters below early-return when nothing would change: they run at PTY
  // output frequency (per chunk / per 150ms scan), and a no-op set() would
  // still rebuild the sessions array and re-render every subscriber.
  setTitle: (id, title) => {
    const cur = get().sessions.find((x) => x.id === id);
    if (!cur || cur.title === title) return;
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === id ? { ...x, title } : x)),
    }));
  },

  setStatus: (id, status) => {
    const cur = get().sessions.find((x) => x.id === id);
    if (!cur || cur.status === status || cur.status === "exited") return;
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === id ? { ...x, status } : x)),
    }));
  },

  setDetectedAgent: (id, profileId, label) => {
    const cur = get().sessions.find((x) => x.id === id);
    if (!cur || cur.agentId) return;
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === id ? { ...x, agentId: profileId, agentLabel: label } : x,
      ),
    }));
  },

  setAgentState: (id, state, prompt, kind = "approval") => {
    const prev = get().sessions.find((x) => x.id === id);
    if (!prev) return;
    const pendingApproval =
      state === "waiting" && kind === "approval" ? prompt : undefined;
    const pendingPrompt =
      state === "waiting" && kind !== "approval" && prompt
        ? { kind, text: prompt }
        : undefined;
    if (
      prev.agentState === state &&
      prev.pendingApproval === pendingApproval &&
      prev.pendingPrompt?.kind === pendingPrompt?.kind &&
      prev.pendingPrompt?.text === pendingPrompt?.text
    ) {
      return;
    }
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === id ? { ...x, agentState: state, pendingApproval, pendingPrompt } : x,
      ),
    }));
    // Entered waiting → desktop notification, gated by focus + dedupe
    // (notifyPendingPrompt) so state flapping cannot re-notify the same prompt.
    if (state === "waiting" && prev?.agentState !== "waiting") {
      const sess = get().sessions.find((x) => x.id === id);
      if (sess) notifyPendingPrompt(sess);
    }
  },

  clearApproval: (id) =>
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === id
          ? { ...x, pendingApproval: undefined, pendingPrompt: undefined, agentState: undefined }
          : x,
      ),
    })),

  setUsage: (id, usage) => {
    const cur = get().sessions.find((x) => x.id === id);
    if (!cur) return;
    const cost = usage.cost ?? cur.cost;
    const tokensIn = usage.tokensIn ?? cur.tokensIn;
    const tokensOut = usage.tokensOut ?? cur.tokensOut;
    if (cost === cur.cost && tokensIn === cur.tokensIn && tokensOut === cur.tokensOut) {
      return;
    }
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === id ? { ...x, cost, tokensIn, tokensOut } : x,
      ),
    }));
  },

  addChangedFile: (id, file) => {
    const cur = get().sessions.find((x) => x.id === id);
    if (!cur) return;
    const files = cur.changedFiles ?? [];
    const idx = files.findIndex((f) => f.path === file.path);
    if (idx >= 0 && files[idx].op === file.op) return;
    // 已存在 → 更新 op；否則追加（保留首次出現順序）。
    const next =
      idx >= 0 ? files.map((f, i) => (i === idx ? file : f)) : [...files, file];
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === id ? { ...x, changedFiles: next } : x,
      ),
    }));
  },
}));
