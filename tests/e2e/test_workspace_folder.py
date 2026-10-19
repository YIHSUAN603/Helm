"""Exercise folder initialization with real stores, terminal components and PTY writes.

Only native spawn/write IPC and the native picker are doubled. Completion still
comes from Terminal, and input still passes through the production ptyWrite.
"""
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).parent))
from harness import Results, boot, dev_server, fresh_page
from playwright.sync_api import sync_playwright


def instrument_pty(route):
    response = route.fetch()
    source = response.text()
    source, count = re.subn(
        r"const channel = new Channel\(\);.*?return invoke\(\"pty_spawn\",.*?;",
        "return window.__folderSpawn(options, onOutput);",
        source, count=1, flags=re.S,
    )
    assert count == 1, "PTY spawn insertion point changed"
    assert "invoke(cmd, args)" in source, "PTY write insertion point changed"
    source = source.replace("invoke(cmd, args)", "window.__folderInvoke(cmd, args)")
    route.fulfill(response=response, body=source)


def main():
    r = Results()
    with dev_server(), sync_playwright() as p:
        browser = p.chromium.launch()
        ctx, page = fresh_page(browser)
        module_urls = {}
        page.on("request", lambda request: module_urls.update({urlsplit(request.url).path: request.url}))
        page.add_init_script("""
          window.__folderPath = null;
          window.__folderSpawns = [];
          window.__folderWrites = [];
          window.__folderInvoke = async (cmd, args) => {
            if (cmd === 'pty_write') window.__folderWrites.push(args);
          };
          window.__folderSpawn = async (options, output) => {
            window.__folderSpawns.push(options);
            if (options.cwd === 'C:/missing') throw new Error('missing directory');
            if (options.cwd === 'C:/delayed') {
              await new Promise(resolve => window.__releaseFolderSpawn = resolve);
            }
            output(new TextEncoder().encode(String.fromCharCode(27) + '[6nPS> '));
          };
        """)
        page.route("**/src/ipc/pty.ts*", instrument_pty)
        page.route("**/src/ipc/dialog.ts*", lambda route: route.fulfill(
            body="export const pickFolder = async () => window.__folderPath; export const pickImage = async () => null;",
            content_type="text/javascript",
        ))
        boot(page)
        page.evaluate("""async urls => {
          window.__folderApi = {
            ...await import(urls.actions),
            ...await import(urls.folder),
            ...await import(urls.sessions),
            ...await import(urls.workspaces),
            ...await import(urls.pty),
          };
          window.__folderMembers = () => __folderApi.useSessionStore.getState().sessions
            .filter(s => s.workspaceId === window.__folderWorkspace);
          window.__newFolderWorkspace = () => {
            window.__folderWorkspace = __folderApi.newWorkspace();
            window.__folderInitial = __folderMembers()[0].id;
          };
          window.__chooseFolder = async path => {
            window.__folderPath = path;
            await __folderApi.chooseWorkspaceFolder(__folderWorkspace);
          };
        }""", {name: module_urls[path] for name, path in {
            "actions": "/src/commands/actions.ts",
            "folder": "/src/commands/workspaceFolder.ts",
            "sessions": "/src/store/sessions.ts",
            "workspaces": "/src/store/workspaces.ts",
            "pty": "/src/ipc/pty.ts",
        }.items()})

        page.evaluate("__newFolderWorkspace()")
        try:
            page.wait_for_function("__folderWrites.some(w => w.id === __folderInitial && w.data.endsWith('R'))", timeout=5000)
        except Exception:
            print(page.evaluate("({spawns: __folderSpawns, writes: __folderWrites, members: __folderMembers()})"))
            raise
        r.check("new workspace immediately has one default session", page.evaluate("__folderMembers().length === 1 && !__folderMembers()[0].cwd"))
        page.evaluate("__chooseFolder(null)")
        r.check("cancel preserves the initial session", page.evaluate("__folderMembers().length === 1 && __folderMembers()[0].id === __folderInitial"))
        page.evaluate("__chooseFolder('C:/project')")
        page.wait_for_function("__folderMembers().length === 1 && __folderMembers()[0].id !== __folderInitial")
        r.check("protocol replies do not prevent replacing untouched initial session", page.evaluate("__folderMembers()[0].cwd === 'C:/project'"))
        r.check("new session remains active", page.evaluate("__folderApi.useSessionStore.getState().activeId === __folderMembers()[0].id"))
        page.evaluate("__chooseFolder('C:/next')")
        page.wait_for_function("__folderSpawns.some(s => s.cwd === 'C:/next')")
        r.check("subsequent folder selection adds a session", page.evaluate("__folderMembers().length === 2"))

        for name, use in (
            ("input", "__folderApi.ptyWrite(__folderInitial, 'echo keep me')"),
            ("rename", "__folderApi.useSessionStore.getState().renameSession(__folderInitial, 'Keep')"),
            ("agent detection", "__folderApi.useSessionStore.getState().setDetectedAgent(__folderInitial, 'codex', 'Codex')"),
            ("another session", "__folderApi.newSession(undefined, __folderWorkspace)"),
            ("split", "__folderApi.splitPane(__folderInitial, 'row')"),
        ):
            page.evaluate("__newFolderWorkspace()")
            page.evaluate(use)
            page.evaluate("__chooseFolder('C:/preserve')")
            page.wait_for_function("__folderSpawns.some(s => s.id === __folderMembers().at(-1).id)")
            r.check(f"{name} preserves initial session", page.evaluate("__folderMembers().some(s => s.id === __folderInitial) && __folderMembers().length >= 2"))

        page.evaluate("__newFolderWorkspace()")
        page.locator('.pane[data-active="true"] .xterm-helper-textarea').focus()
        page.keyboard.type("echo keep")
        page.evaluate("__chooseFolder('C:/typed')")
        page.wait_for_function("__folderSpawns.some(s => s.cwd === 'C:/typed')")
        r.check("real terminal keyboard input preserves original", page.evaluate("__folderMembers().length === 2 && __folderMembers().some(s => s.id === __folderInitial)"))

        page.evaluate("__newFolderWorkspace()")
        page.evaluate("__chooseFolder('C:/delayed')")
        page.wait_for_function("typeof __releaseFolderSpawn === 'function'")
        r.check("original remains until replacement starts", page.evaluate("__folderMembers().some(s => s.id === __folderInitial)"))
        page.evaluate("__folderApi.ptyWrite(__folderInitial, 'keep'); __releaseFolderSpawn()")
        page.wait_for_timeout(100)
        r.check("input while spawning cancels replacement", page.evaluate("__folderMembers().length === 2 && __folderMembers().some(s => s.id === __folderInitial)"))

        page.evaluate("__newFolderWorkspace()")
        page.evaluate("__chooseFolder('C:/missing')")
        page.wait_for_function("__folderSpawns.some(s => s.id === __folderMembers().at(-1).id && !s.cwd)")
        r.check("cwd fallback preserves original session", page.evaluate("__folderMembers().length === 2 && __folderMembers().some(s => s.id === __folderInitial)"))

        ctx.close()
        browser.close()
    return r.report("workspace-folder")


if __name__ == "__main__":
    raise SystemExit(main())
