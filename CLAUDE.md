# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Helm (package name `helm`) is a Tauri 2 + React 19 + TypeScript desktop terminal application. Its core feature is "agent awareness": each session is a PTY, and the frontend passively scans terminal output to detect the running CLI agent (Claude Code, Codex, etc.), derive its state (thinking / tool / waiting / done / error), and centrally surface pending approval prompts, cost/token usage, and file changes. It supports tmux-style split views.

> Comments and commit messages are written in English; code follows the naming and style conventions in `~/.claude/CLAUDE.md`.

## Common Commands

```bash
npm run tauri dev      # Development (runs vite + tauri together; use this to run the actual app)
npm run dev            # vite only (browser-only, no PTY; for quickly viewing UI)
npm run build          # tsc type-check + vite build (frontend output to dist/)
npm run tauri build    # Package the desktop app

# Tests (pure functions, no GUI / Tauri needed, using Node's built-in test)
node --experimental-strip-types tests/layout-tree.test.ts
node --experimental-strip-types tests/workspace-groups.test.ts
node --experimental-strip-types tests/agent-engine.test.ts
node --experimental-strip-types tests/agent-extract.test.ts
```

There is no lint config; type checking relies on `tsc` (run by `npm run build`). `tsconfig.json` enables `strict`, `noUnusedLocals`, and `noUnusedParameters`.

## Architecture: Layers and Data Flow

### Three layers

1. **Rust backend** (`src-tauri/src/`) — exposes capabilities to the frontend via `#[tauri::command]`. All registered in `lib.rs`'s `invoke_handler`.
   - `pty.rs` — one PTY per session (`portable-pty`). `pty_spawn` starts a reader thread that streams output to the frontend as base64 via `pty://output/<id>` events; emits `pty://exit/<id>` on exit.
   - `config.rs` — reads `agents.json` from the app config dir; writes a template with a demo launcher if it doesn't exist.

2. **IPC wrapper layer** (`src/ipc/`) — wraps Rust commands / events as TS functions. `pty.ts` handles base64 decoding; `notify.ts` handles desktop notifications.

3. **React frontend** (`src/`) — UI + state (Zustand) + agent detection logic.

### Data flow (the core of agent awareness)

PTY output → `Terminal.tsx` writes to xterm and triggers two debounced pipelines (see `App.tsx`):

- **`onScan`** (150ms debounce, reads the rendered text of xterm's **visible viewport**) → `handleScan` → `deriveState` derives agent state → updates the session store → on `waiting`, pops up `ApprovalPanel` + desktop notification. Deliberately reads only the visible viewport, not scrollback (a prompt that was answered and scrolled away should no longer count as an active approval).
- **`onStream`** (raw decoded output, line by line) → `handleStream` → `extractFromLine` extracts cost/token/file changes → updates the store → `ChangedFilesPanel`. Partial lines across chunks are buffered by `lineBuffers` in `App.tsx`.

### Agent profile system (data-driven, not tied to any specific tool)

`src/agents/` — profiles use **regex source strings** (not RegExp objects) to describe how to recognize an agent and each of its states. This lets the same schema live both in the built-in TS (`builtins.ts`) and be supplied by the user's `agents.json`, merged in `registry.ts` (user entries with the same id override built-ins; launchers are appended). Therefore, **to support a new CLI agent, prefer editing the patterns in `builtins.ts` rather than writing hardcoded detection logic**.

- `types.ts` — `AgentProfile` (states patterns, extractors, detectOutput, approve/reject keys), `AgentLauncher`, `AgentConfig`.
- `engine.ts` — `deriveState` (state priority: waiting > error > tool > thinking > done) and `stripAnsi` (pure functions, tested).
- `extract.ts` — line-by-line extraction of structured info (pure functions, tested).
- `builtins.ts` — built-in `claude-code` / `codex` / `generic` profiles, with patterns calibrated to actual TUI output.

### Split layout (tmux-style)

- `store/layoutTree.ts` — **pure-function** binary split-tree operations (split / remove / setRatio / computeLayout / attachSessionToTree, etc.), with no React/Zustand dependency, directly unit-testable. Core invariant: a session appears in at most one leaf.
- `store/layout.ts` — wraps the above pure functions in a Zustand store holding **one tree per workspace** (`trees: Record<workspaceId, LayoutNode | null>`; invariant: a session only appears in its own workspace's tree). Most actions take a `workspaceId`; `removeSession` / `setRatio` search all trees (ids are globally unique). `moveSessionToWorkspace` and workspace deletion clean the trees up (`removeSession` / `dropTree`).
- The layout tree **only computes geometry** (each leaf's percentage rect); `App.tsx` renders all panes tiled but computes rects only from the **focused workspace's** tree — sessions from other workspaces get no rect and are hidden via `data-in-layout="false"` CSS — switching single/split only via class + inline style, so **the same set of Terminals stays mounted and is never rebuilt** (PTYs keep running, scrollback preserved). Split view therefore shows only the focused workspace; switching the active session to another workspace swaps in that workspace's whole layout (ratios remembered).

### Sidebar hierarchy (workspace → session)

The sidebar (`src/components/SessionSidebar/`) is two-level: collapsible **workspaces** (pure visual grouping, not tied to a cwd) containing **sessions**. `store/workspaceGroups.ts` holds the pure grouping helpers (`groupSessions`, `resolveFocusedWorkspace`, `sessionsInWorkspace`, workspace cost/file aggregations, `flattenGroupedIds`; unit-tested); `store/workspaces.ts` is the Zustand store (create / rename / delete / collapse). New sessions land in the active session's workspace; deleting a workspace moves its sessions to the default one (id `"default"`, never deletable). Sessions are dragged between workspaces via HTML5 DnD (`text/plain` carries the session id). Session cycling (`session:next/prev`, Cmd+1..9) follows the sidebar's grouped visual order (see `sessionIdsInSidebarOrder` in `src/commands/actions.ts`). The **focused workspace** is derived, not stored: it is the active session's workspace (`resolveFocusedWorkspace`). ApprovalPanel, ChangedFilesPanel (grouped by session), the Toolbar's Σ cost / broadcast targets / changed-file count, and the approve/reject-all commands are all scoped to it; other workspaces surface pending approvals via a clickable badge on their sidebar header (desktop notifications stay global).

### Zustand stores (`src/store/`)

`sessions.ts` (session list + agent state; the convergence point of agent awareness), `workspaces.ts` / `workspaceGroups.ts` (sidebar grouping), `layout.ts` / `layoutTree.ts` (split), `theme.ts` (includes xterm themes), `ui.ts` (viewMode: single/split).

## Important Notes

- **Windows support**: PTYs use ConPTY via `portable-pty`. The default shell is resolved in `pty.rs` as `HELM_SHELL` → `SHELL` → platform default (Windows: `pwsh.exe` if on PATH else `powershell.exe`, launched with `-NoLogo`; Unix: `/bin/zsh`). Home falls back `HOME` → `USERPROFILE`. The `agents.json` template in `config.rs` has per-platform demo commands (`#[cfg(windows)]` = PowerShell syntax).
- **macOS Cmd shortcuts**: WKWebView swallows some Cmd key combinations when the webview has focus (in testing, ⌘D never reaches the DOM, and menu accelerators don't fire either) — this does not happen on Windows, where Ctrl combos reach the DOM normally. So shortcuts take two paths: the frontend DOM `keydown` (capture phase, ahead of xterm, see `App.tsx`) matches `KEYMAP` in `src/commands/keymap.ts` and dispatches via `runCommand` (`src/commands/registry.ts`); the native menu (`lib.rs`) emits `app://shortcut` events into the same `runCommand` for discoverability and mouse access. When changing shortcuts, update both places.
- **Nothing is persisted across launches** (deliberate): sessions, workspaces, and the split layout all live in memory only. **Bootstrap** runs only once per app lifetime (the `bootstrapped` flag in `App.tsx`) and simply creates one fresh session in the default workspace. The only cross-launch state is user preferences in localStorage (theme, viewMode).
- **Launching an agent** works by writing the command as user input into the PTY (`ptyWrite(id, "claude\r")`), preserving the full shell environment, rather than spawning the command directly.
- After adding a Rust command, remember to register it in `lib.rs`'s `generate_handler!` and add a corresponding wrapper in `src/ipc/`.
