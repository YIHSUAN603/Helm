# Helm

A terminal that watches your AI coding agents for you.

## What Helm does

Helm is a desktop terminal app. Each tab is a real shell session — but when
you run an AI coding agent like Claude Code or Codex in one, Helm watches
its output and tells you what it's doing: thinking, running a tool, waiting
for your approval, done, or stuck on an error. Pending approvals, running
cost, and files an agent has changed are all surfaced in one place, so you
can run several agents side by side without babysitting each terminal
individually.

## Installing

Download the installer for your platform from the
[GitHub Releases page](https://github.com/5l4u4vm00/Helm/releases). Helm
checks for updates automatically every time it starts and installs them in
the background — there's nothing to do manually.

Prefer to build it yourself? See [Building from source](#building-from-source)
below.

## Getting started

1. Helm opens with one empty session ready to go.
2. Click **+** next to a workspace to start a new session, and choose what
   to launch: **Claude Code**, **Codex**, **Shell** (a plain terminal, no
   agent detection), or any custom agent you've added.
3. Use it like a normal terminal — everything you type goes straight to the
   real shell.
4. When the agent needs your input, Helm shows an **approval prompt**
   automatically with **Approve**/**Reject** buttons (or the shortcuts
   `Ctrl/⌘+Shift+Y` / `Ctrl/⌘+Shift+N`) — no need to switch to that tab and
   read its output yourself.

## Organizing sessions

The sidebar has two levels: **workspaces** (groups) containing **sessions**
(individual terminals).

- **New workspace** — click **+** in the sidebar header; it's ready for you
  to name right away.
- **Rename a workspace** — double-click its header, or select it and press
  `F2`.
- **Delete a workspace** — hover its header and click the **×**; its
  sessions move to the default workspace (which can't be deleted).
- **Collapse/expand** — click the header or its chevron.
- **New session in a workspace** — hover the workspace and click its **+**.
- **Move a session** — drag it onto another workspace (even a collapsed
  one) to drop it there.
- **Close a session** — click its **×**, or select it and press
  `Delete`/`Backspace`.

Each session shows a status dot (thinking, running, awaiting approval, done,
error — or idle/running/exited for a plain shell) plus an agent badge if
one is running. A workspace you're not currently viewing shows a badge with
its pending-approval count — click it to jump straight to that approval.

## Split view

Switch between **single** (one session at a time) and **split** (tiled
panes) from the toolbar's ▢ / ▦ buttons, or `Ctrl/⌘+Shift+M`.

- **Split a pane** — use the ◫ (split right) / ⊟ (split down) buttons on a
  pane's title bar, or `Ctrl/⌘+\` and `Ctrl/⌘+Shift+D`. Right-click a split
  button (or use the Command Palette) to choose which agent to launch in
  the new pane instead of a plain shell.
- **Close a pane** — the **×** on its title bar, or `Ctrl/⌘+Shift+W`.
- **Resize** — drag the divider between panes (double-click a divider to
  reset it to 50/50), or `Ctrl/⌘+Alt+Shift+arrow` to resize the focused
  pane in small steps.
- **Move focus between panes** — `Ctrl/⌘+Alt+arrow`, or `Ctrl/⌘+Shift+O` to
  cycle to the next one.

## Keeping track of your agents

- **Approval panel** — pops up automatically whenever an agent in your
  current workspace is waiting on you. Shows the agent, the session, and
  its actual question, with Approve/Reject per session and Approve
  All/Reject All when more than one is waiting. If the same prompt keeps
  reappearing after you respond, Helm will tell you the automated
  keystrokes may not match that agent — reply directly in the terminal
  instead.
- **Cost and tokens** — the toolbar shows the active session's running cost
  and input/output token counts, plus a workspace-wide total (Σ).
- **Changed files** — click the toolbar's file-count button (or
  `Ctrl/⌘+Shift+F`) to see every file an agent has touched in the current
  workspace, grouped by session.

## Broadcasting to multiple agents

Type a message once in the toolbar's broadcast box, choose whether it goes
to **agents only** or **every session** in the current workspace, and press
Enter (or Send, or `Ctrl/⌘+Shift+B` to jump to the box) — it's typed into
all of them at once. Handy for answering the same question across several
agents in one go.

## Command Palette

Press `Ctrl/⌘+Shift+P` to open a searchable list of everything Helm can do
— split panes, start a session with a specific agent, toggle the theme,
approve/reject, open Settings, jump to a session, and more — each shown
with its keyboard shortcut. Type to filter, arrow keys plus Enter to run.

## Keyboard shortcuts

`Ctrl/⌘` means Ctrl on Windows/Linux, ⌘ on macOS.

**Sessions**

| Shortcut | Action |
| --- | --- |
| `Ctrl/⌘+Shift+T` | New session |
| `Ctrl/⌘+Shift+]` / `[` | Next / previous session |
| `Ctrl/⌘+1` … `9` | Jump to session 1–9 |

**Panes & split view**

| Shortcut | Action |
| --- | --- |
| `Ctrl/⌘+\` | Split pane right |
| `Ctrl/⌘+Shift+D` | Split pane down |
| `Ctrl/⌘+Shift+W` | Close focused pane |
| `Ctrl/⌘+Shift+O` | Focus next pane |
| `Ctrl/⌘+Alt+arrow` | Move focus between panes |
| `Ctrl/⌘+Alt+Shift+arrow` | Resize the focused pane |
| `Ctrl/⌘+Shift+M` | Toggle single/split view |

**Approvals**

| Shortcut | Action |
| --- | --- |
| `Ctrl/⌘+Shift+Y` | Approve the active session's prompt |
| `Ctrl/⌘+Shift+N` | Reject the active session's prompt |

**Other**

| Shortcut | Action |
| --- | --- |
| `Ctrl/⌘+Shift+P` | Open Command Palette |
| `Ctrl/⌘+Shift+F` | Toggle changed-files panel |
| `Ctrl/⌘+Shift+L` | Toggle light/dark theme |
| `Ctrl/⌘+Shift+B` | Focus the broadcast box |
| `F6` / `Shift+F6` | Cycle focus between UI regions forward/back |

## Settings

Open Settings from the gear icon at the bottom of the sidebar. Everything
here applies immediately and is remembered for next time:

- **Theme** — 10 presets (Dark, Light, Solarized Dark, Nord, Dracula,
  Gruvbox Dark, One Dark, Tokyo Night, GitHub Dark, GitHub Light)
- **Language** — English or Traditional Chinese (繁體中文)
- **Font family** and **font size** (8–32)
- **Cursor style** (block, bar, underline) and **cursor blink**
- **Default shell** and **default working directory** for new sessions
  (leave blank to use your system's defaults)
- Installed app version and current update status

## Supported agents & customization

Helm recognizes **Claude Code** and **Codex** out of the box. To add
support for another CLI agent (or customize how approvals are detected),
create or edit an `agents.json` file in Helm's config directory — no code
required, just describes how to recognize the tool and its states.

## Building from source

Prefer to run Helm from source, or contribute to it?

**Prerequisites:** [Node.js](https://nodejs.org/) >= 22.6 (see `.nvmrc`),
[Rust](https://www.rust-lang.org/tools/install) (stable), and Tauri's
platform dependencies (see the
[Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/)).

```bash
npm install
npm run tauri dev     # run the app
npm run tauri build   # package an installer
```

See [`CLAUDE.md`](./CLAUDE.md) for the codebase architecture and
[`docs/RELEASING.md`](./docs/RELEASING.md) for the release process.

## License

MIT — see [`LICENSE`](./LICENSE).
