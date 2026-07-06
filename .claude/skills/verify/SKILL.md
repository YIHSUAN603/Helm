---
name: verify
description: How to verify Helm frontend changes end-to-end without the Tauri shell — drive the vite dev server with Playwright.
---

# Verifying Helm changes

## Surface

Most Helm logic (stores, agent detection, split layout, sidebar) is pure frontend.
`npm run dev` (vite only, port **1420**, strictPort) renders the full UI in a
browser; PTY spawn and Tauri IPC reject silently, so terminals stay blank but
sessions, workspaces, split view, toolbars, and panels all work. Only verify via
`npm run tauri dev` (manual) when the change touches Rust (`src-tauri/`), PTY
streaming, or native menus.

## Recipe (Playwright, Python)

Use the webapp-testing skill's `with_server.py`:

```bash
python <webapp-testing>/scripts/with_server.py --server "npm run dev" --port 1420 -- python <script>.py
```

Useful selectors (all stable class names):

- Sidebar: `.workspace-group`, `.workspace-header`, `.workspace-name`,
  `.session-item`, `.session-name`
- Sidebar buttons (by title attr, Chinese): `新增 Workspace`,
  `在此 Workspace 新增 Session` (opens `.launcher-menu` →
  `button[role='menuitem']`), `刪除 Workspace（session 移到預設）`
- Toolbar view buttons: `button[title='單一視圖']`, `button[title='分割視圖']`
- Panes: `.pane` with `data-in-layout="true|false"` (false = hidden via CSS,
  Terminal stays mounted), `data-active`, `.pane-title`; pane split buttons
  `button[title^='向右分割']` / `button[^='向下分割']` (hover the pane first)
- Split resizers: `.split-resizer` (drag with mouse.down/move/up)

Gotchas:

- Session titles are not unique (`Shell` repeats) — locate sessions by
  workspace-group index + item index, never by title text.
- Sidebar session order is session-array insertion order, so sessions moved
  from a deleted workspace appear interleaved, not appended.
- Wait ~200ms after clicks; state updates are synchronous but rAF focus and
  re-render need a beat.
- Filter console errors: PTY/Tauri invoke rejections are expected noise in
  browser mode.

## Cheap checks first

- `npm run build` — tsc strict catches signature drift across call sites.
- `node --experimental-strip-types tests/*.test.ts` needs **Node 22**
  (`/c/Users/USER/AppData/Local/nvm/v22.18.0/node.exe`) or `npx tsx`.
