// Central command registry: the single dispatch point for global hotkeys,
// the command palette, and the native menu (app://shortcut events).
// To add a keyboard-reachable action: add a Command here and, if it needs a
// hotkey, a KeyBinding in keymap.ts (plus a menu item in lib.rs when useful).
import { useSessionStore } from "../store/sessions";
import { useLayoutStore } from "../store/layout";
import { useUiStore } from "../store/ui";
import { useThemeStore } from "../store/theme";
import { collectSessionIds } from "../store/layoutTree";
import {
  pendingApprovalsInWorkspace,
  resolveFocusedWorkspace,
  sessionsInWorkspace,
} from "../store/workspaceGroups";
import { listLaunchers } from "../agents/registry";
import { cycleFocusRegion, focusActiveTerminal } from "../focus/focusUtils";
import {
  activateSession,
  cycleSession,
  focusBroadcastInput,
  focusPane,
  newSession,
  newWorkspace,
  resizeActivePane,
  respondActiveApproval,
  respondAllApprovals,
  splitActivePane,
  switchToSessionIndex,
} from "./actions";
import type { Command } from "./types";

function hasActive(): boolean {
  return useSessionStore.getState().activeId !== null;
}

function activeHasApproval(): boolean {
  const { sessions, activeId } = useSessionStore.getState();
  return Boolean(sessions.find((s) => s.id === activeId)?.pendingApproval);
}

// Scoped to the focused workspace, matching respondAllApprovals' semantics.
function anyApproval(): boolean {
  const { sessions, activeId } = useSessionStore.getState();
  const workspaceId = resolveFocusedWorkspace(sessions, activeId);
  return pendingApprovalsInWorkspace(sessions, workspaceId).length > 0;
}

function inSplitMode(): boolean {
  return useUiStore.getState().viewMode === "split";
}

function splitLeafCount(): number {
  const { sessions, activeId } = useSessionStore.getState();
  const workspaceId = resolveFocusedWorkspace(sessions, activeId);
  return collectSessionIds(useLayoutStore.getState().trees[workspaceId] ?? null).length;
}

function toggleViewMode(): void {
  const ui = useUiStore.getState();
  if (ui.viewMode === "split") {
    ui.setViewMode("single");
    return;
  }
  // First entry into split mode with no tree: auto-balance the focused
  // workspace's sessions (split view only shows the focused workspace).
  const { sessions, activeId } = useSessionStore.getState();
  const workspaceId = resolveFocusedWorkspace(sessions, activeId);
  const ids = sessionsInWorkspace(sessions, workspaceId).map((s) => s.id);
  useLayoutStore.getState().ensureTree(workspaceId, ids);
  ui.setViewMode("split");
}

const PANE_DIRS = [
  ["left", "左方"],
  ["right", "右方"],
  ["up", "上方"],
  ["down", "下方"],
] as const;

const RESIZE_TITLES = {
  left: "縮窄 Pane",
  right: "加寬 Pane",
  up: "縮短 Pane",
  down: "加高 Pane",
} as const;

function layoutCommands(): Command[] {
  const nav: Command[] = PANE_DIRS.map(([dir, label]) => ({
    id: `layout:focus-${dir}`,
    title: `焦點：${label} Pane`,
    category: "版面",
    keywords: "focus pane",
    enabled: inSplitMode,
    run: () => focusPane(dir),
  }));
  const resize: Command[] = PANE_DIRS.map(([dir]) => ({
    id: `layout:resize-${dir}`,
    title: RESIZE_TITLES[dir],
    category: "版面",
    keywords: "resize pane",
    enabled: inSplitMode,
    run: () => resizeActivePane(dir),
  }));
  return [...nav, ...resize];
}

function numberedSwitchCommands(): Command[] {
  return Array.from({ length: 9 }, (_, i) => ({
    id: `session:switch-${i + 1}`,
    title: `切換到第 ${i + 1} 個 Session`,
    category: "Session",
    hidden: true,
    enabled: () => useSessionStore.getState().sessions.length > i,
    run: () => switchToSessionIndex(i),
  }));
}

const STATIC_COMMANDS: Command[] = [
  {
    id: "palette:open",
    title: "命令面板",
    category: "檢視",
    keywords: "command palette",
    run: () => {
      const ui = useUiStore.getState();
      ui.setPaletteOpen(!ui.paletteOpen);
    },
  },
  {
    id: "layout:split-right",
    title: "向右分割",
    category: "版面",
    keywords: "split right",
    enabled: hasActive,
    run: () => splitActivePane("row"),
  },
  {
    id: "layout:split-down",
    title: "向下分割",
    category: "版面",
    keywords: "split down",
    enabled: hasActive,
    run: () => splitActivePane("column"),
  },
  {
    id: "layout:close-pane",
    title: "關閉 Pane",
    category: "版面",
    keywords: "close pane",
    enabled: hasActive,
    run: () => {
      const store = useSessionStore.getState();
      if (store.activeId) store.closeSession(store.activeId);
    },
  },
  {
    id: "layout:focus-next-pane",
    title: "焦點：下一個 Pane",
    category: "版面",
    keywords: "next pane",
    enabled: () => inSplitMode() && splitLeafCount() >= 2,
    run: () => focusPane("next"),
  },
  ...layoutCommands(),
  {
    id: "session:new",
    title: "新增 Session（shell）",
    category: "Session",
    keywords: "new session shell",
    run: () => newSession(),
  },
  {
    id: "session:next",
    title: "下一個 Session",
    category: "Session",
    keywords: "next session",
    enabled: () => useSessionStore.getState().sessions.length >= 2,
    run: () => cycleSession(1),
  },
  {
    id: "session:prev",
    title: "上一個 Session",
    category: "Session",
    keywords: "previous session",
    enabled: () => useSessionStore.getState().sessions.length >= 2,
    run: () => cycleSession(-1),
  },
  ...numberedSwitchCommands(),
  {
    id: "workspace:new",
    title: "新增 Workspace",
    category: "Session",
    keywords: "new workspace group",
    run: () => {
      newWorkspace();
    },
  },
  {
    id: "view:toggle-mode",
    title: "切換 單一/分割 視圖",
    category: "檢視",
    keywords: "toggle view single split",
    run: toggleViewMode,
  },
  {
    id: "view:toggle-files",
    title: "檔案變更面板",
    category: "檢視",
    keywords: "changed files panel",
    run: () => useUiStore.getState().toggleFiles(),
  },
  {
    id: "theme:toggle",
    title: "切換主題",
    category: "檢視",
    keywords: "toggle theme dark light",
    run: () => useThemeStore.getState().toggle(),
  },
  {
    id: "broadcast:focus",
    title: "聚焦派工輸入框",
    category: "檢視",
    keywords: "broadcast input",
    run: focusBroadcastInput,
  },
  {
    id: "approval:approve-active",
    title: "批准目前 Session",
    category: "審批",
    keywords: "approve",
    enabled: activeHasApproval,
    run: () => respondActiveApproval(true),
  },
  {
    id: "approval:reject-active",
    title: "拒絕目前 Session",
    category: "審批",
    keywords: "reject",
    enabled: activeHasApproval,
    run: () => respondActiveApproval(false),
  },
  {
    id: "approval:approve-all",
    title: "全部批准（此 Workspace）",
    category: "審批",
    keywords: "approve all",
    enabled: anyApproval,
    run: () => respondAllApprovals(true),
  },
  {
    id: "approval:reject-all",
    title: "全部拒絕（此 Workspace）",
    category: "審批",
    keywords: "reject all",
    enabled: anyApproval,
    run: () => respondAllApprovals(false),
  },
  {
    id: "focus:cycle-region",
    title: "循環焦點區域",
    category: "檢視",
    keywords: "cycle focus region",
    run: () => cycleFocusRegion(1),
  },
  {
    id: "focus:cycle-region-back",
    title: "循環焦點區域（反向）",
    category: "檢視",
    keywords: "cycle focus region back",
    hidden: true,
    run: () => cycleFocusRegion(-1),
  },
  {
    id: "focus:terminal",
    title: "回到終端機",
    category: "檢視",
    keywords: "focus terminal",
    enabled: hasActive,
    run: focusActiveTerminal,
  },
];

/** Palette-only commands rebuilt from live sessions / launchers. */
function dynamicCommands(): Command[] {
  const cmds: Command[] = [];
  for (const s of useSessionStore.getState().sessions) {
    cmds.push({
      id: `session:switch:${s.id}`,
      title: `切換到：${s.title}`,
      category: "Session",
      keywords: s.agentLabel ?? "switch",
      run: () => activateSession(s.id),
    });
  }
  listLaunchers().forEach((l, i) => {
    cmds.push({
      id: `session:new:${i}`,
      title: `新增 Session：${l.label}`,
      category: "Session",
      keywords: "new session",
      run: () => newSession(l),
    });
    cmds.push({
      id: `layout:split-right-with:${i}`,
      title: `向右分割：${l.label}`,
      category: "版面",
      keywords: "split right",
      enabled: hasActive,
      run: () => splitActivePane("row", l),
    });
    cmds.push({
      id: `layout:split-down-with:${i}`,
      title: `向下分割：${l.label}`,
      category: "版面",
      keywords: "split down",
      enabled: hasActive,
      run: () => splitActivePane("column", l),
    });
  });
  return cmds;
}

export function listCommands(): Command[] {
  return [...STATIC_COMMANDS, ...dynamicCommands()];
}

/** Run a command by id; silently ignores unknown or disabled commands. */
export function runCommand(id: string): void {
  const cmd = listCommands().find((c) => c.id === id);
  if (!cmd || cmd.enabled?.() === false) return;
  cmd.run();
}
