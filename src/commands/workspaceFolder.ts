import { pickFolder } from "../ipc/dialog";
import { initialSessionTracker } from "../store/initialSession";
import { useSessionStore } from "../store/sessions";
import { useWorkspaceStore } from "../store/workspaces";
import { newSession } from "./actions";

/** Both sidebar folder entry points share the same initialization behavior. */
export async function chooseWorkspaceFolder(workspaceId: string): Promise<void> {
  const workspace = useWorkspaceStore.getState().workspaces.find((w) => w.id === workspaceId);
  if (!workspace) {
    return;
  }
  const path = await pickFolder(workspace.folder);
  const workspaces = useWorkspaceStore.getState();
  if (!path || !workspaces.workspaces.some((w) => w.id === workspaceId)) {
    return;
  }
  const originalId = initialSessionTracker.takeCandidate(workspaceId, useSessionStore.getState().sessions);
  workspaces.setWorkspaceFolder(workspaceId, path);
  const replacementId = newSession(undefined, workspaceId);
  if (originalId) {
    initialSessionTracker.begin(workspaceId, originalId, replacementId);
  }
}

/** A home-directory fallback is usable, but does not qualify as a successful replacement. */
export function completeFolderSession(sessionId: string, requestedFolderStarted: boolean): void {
  const originalId = initialSessionTracker.finish(
    sessionId, requestedFolderStarted, useSessionStore.getState().sessions,
  );
  if (originalId) {
    useSessionStore.getState().closeSession(originalId);
  }
}
