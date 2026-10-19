interface SessionCandidate {
  id: string;
  workspaceId: string;
  status: string;
  agentId: string | null;
  agentState?: string;
  launchCommand?: string;
  titleLocked?: boolean;
  restored?: boolean;
}

interface Replacement {
  workspaceId: string;
  originalId: string;
}

function isUnused(session: SessionCandidate): boolean {
  // Output briefly marks even an untouched shell prompt as busy; output is not input.
  return session.status !== "exited" && !session.agentId && !session.agentState &&
    !session.launchCommand && !session.titleLocked && !session.restored;
}

/** Runtime only: restored sessions must never regain permission to be replaced. */
export class InitialSessionTracker {
  private initial = new Map<string, string>();
  private replacements = new Map<string, Replacement>();

  register(workspaceId: string, sessionId: string): void {
    this.initial.set(workspaceId, sessionId);
  }

  invalidateWorkspace(workspaceId: string): void {
    this.initial.delete(workspaceId);
    for (const [id, replacement] of this.replacements) {
      if (replacement.workspaceId === workspaceId) {
        this.replacements.delete(id);
      }
    }
  }

  markUsed(sessionId: string): void {
    for (const [workspaceId, id] of this.initial) {
      if (id === sessionId) {
        this.initial.delete(workspaceId);
      }
    }
    for (const [id, replacement] of this.replacements) {
      if (replacement.originalId === sessionId) {
        this.replacements.delete(id);
      }
    }
  }

  remove(sessionId: string): void {
    this.markUsed(sessionId);
    this.replacements.delete(sessionId);
  }

  /** The first confirmed folder selection consumes the opportunity, even if ineligible. */
  takeCandidate(workspaceId: string, sessions: readonly SessionCandidate[]): string | undefined {
    const id = this.initial.get(workspaceId);
    this.initial.delete(workspaceId);
    const members = sessions.filter((session) => session.workspaceId === workspaceId);
    return members.length === 1 && members[0].id === id && isUnused(members[0]) ? id : undefined;
  }

  begin(workspaceId: string, originalId: string, replacementId: string): void {
    this.replacements.set(replacementId, { workspaceId, originalId });
  }

  /** Recheck after asynchronous spawn; input or additional sessions can cancel removal. */
  finish(replacementId: string, succeeded: boolean, sessions: readonly SessionCandidate[]): string | undefined {
    const replacement = this.replacements.get(replacementId);
    this.replacements.delete(replacementId);
    if (!succeeded || !replacement) {
      return undefined;
    }
    const members = sessions.filter((session) => session.workspaceId === replacement.workspaceId);
    const original = members.find((session) => session.id === replacement.originalId);
    const next = members.find((session) => session.id === replacementId);
    return members.length === 2 && original && isUnused(original) && next && next.status !== "exited"
      ? original.id : undefined;
  }

  reset(): void {
    this.initial.clear();
    this.replacements.clear();
  }
}

export const initialSessionTracker = new InitialSessionTracker();
