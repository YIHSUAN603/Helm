// Workspace list state (in-memory only; every launch starts fresh).
// Cross-store orchestration (e.g. moving sessions on delete) lives in
// src/commands/actions.ts to keep stores free of circular imports.
import { create } from "zustand";
import { DEFAULT_WORKSPACE_ID, type Workspace } from "./workspaceGroups";

interface WorkspaceState {
  workspaces: Workspace[];
  /** Create "Workspace N" and return its id. */
  createWorkspace: () => string;
  renameWorkspace: (id: string, name: string) => void;
  /** Set (or clear) the default working directory for new sessions in this workspace. */
  setWorkspaceFolder: (id: string, folder: string | undefined) => void;
  /** Remove the workspace itself; refuses the default one. */
  deleteWorkspace: (id: string) => void;
  toggleCollapsed: (id: string) => void;
}

let counter = 1;

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaces: [{ id: DEFAULT_WORKSPACE_ID, name: "Workspace 1", collapsed: false }],

  createWorkspace: () => {
    const id = crypto.randomUUID();
    const workspace: Workspace = {
      id,
      name: `Workspace ${++counter}`,
      collapsed: false,
    };
    set((s) => ({ workspaces: [...s.workspaces, workspace] }));
    return id;
  },

  renameWorkspace: (id, name) =>
    set((s) => ({
      workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, name } : w)),
    })),

  setWorkspaceFolder: (id, folder) =>
    set((s) => ({
      workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, folder } : w)),
    })),

  deleteWorkspace: (id) => {
    if (id === DEFAULT_WORKSPACE_ID) return;
    set((s) => ({ workspaces: s.workspaces.filter((w) => w.id !== id) }));
  },

  toggleCollapsed: (id) =>
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === id ? { ...w, collapsed: !w.collapsed } : w,
      ),
    })),
}));

/** Expand a workspace so its sessions are visible (activation helper). */
export function expandWorkspace(id: string): void {
  const { workspaces } = useWorkspaceStore.getState();
  const target = workspaces.find((w) => w.id === id);
  if (target?.collapsed) useWorkspaceStore.getState().toggleCollapsed(id);
}
