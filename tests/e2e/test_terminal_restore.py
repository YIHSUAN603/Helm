"""Exercise real Terminal components with restored files and a deterministic PTY.

The IPC doubles let hidden panes finish spawning, unlike browser mode where
invoke rejects before the previously unguarded post-spawn fit is reached.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from harness import Results, boot, dev_server, fresh_page
from playwright.sync_api import sync_playwright

STORE = """
export const SNAPSHOT_FILE = 'sessions.json';
export const SCROLLBACK_PREFIX = 'scrollback-';
export const JOURNAL_FILE = 'events.jsonl';
export const scrollbackFileName = id => `scrollback-${id}.txt`;
const snapshot = JSON.stringify({version:1, savedAt:Date.now(), activeId:'restore-1', groups:[],
  sessions:[1,2,3].map(i=>({id:`restore-${i}`,title:`Restore ${i}`,status:'idle',
    createdAt:Date.now(),workspaceId:'default',agentId:null}))});
export const readAppFileOr = async (name, fallback='') => name.startsWith('scrollback-')
  ? `helm-scrollback 1 ${Date.now()}\\nHISTORY ${name}\\n${'readable previous output '.repeat(8)}\\n`
  : fallback;
export const readAppFile = async name => ({ok:true,text:name===SNAPSHOT_FILE?snapshot:null});
export const listAppFiles = async () => [];
export const writeAppFile = async () => true;
export const appendAppFile = async () => true;
export const deleteAppFile = async () => true;
export const forgetPersistedState = async () => {};
"""

PTY = """
const outputs = new Map();
window.__ptySizes = [];
export async function ptySpawn(options, output) {
  outputs.set(options.id, output);
  window.__ptySizes.push({...options,kind:'spawn'});
  output(new TextEncoder().encode('PS> '));
}
export async function ptyResize(id, cols, rows) {
  window.__ptySizes.push({id,cols,rows,kind:'resize'});
}
export async function ptyWrite(id, data) {
  outputs.get(id)?.(new TextEncoder().encode('\\x1b[1;5H' + data));
}
export async function ptyKill(id) { outputs.delete(id); }
export async function onPtyExit() { return () => {}; }
"""


def instrument_terminal(route):
    response = route.fetch()
    source = response.text()
    needle = "termRef.current = term;"
    assert needle in source, "terminal probe insertion point changed"
    source = source.replace(needle, needle + " (window.__restoreTerms ??= {})[id] = term;")
    route.fulfill(response=response, body=source)


def main():
    r = Results()
    with dev_server(), sync_playwright() as p:
        browser = p.chromium.launch()
        ctx, page = fresh_page(browser)
        page.add_init_script("""
          localStorage.setItem('helm.restoreSessions', 'true');
          localStorage.setItem('helm.restoreScrollback', 'true');
          Object.defineProperty(navigator, 'platform', {get:()=> 'Win32'});
        """)
        page.route("**/src/ipc/appStore.ts", lambda route: route.fulfill(body=STORE, content_type="text/javascript"))
        page.route("**/src/ipc/pty.ts", lambda route: route.fulfill(body=PTY, content_type="text/javascript"))
        page.route("**/src/components/Terminal/Terminal.tsx", instrument_terminal)
        boot(page)
        page.wait_for_function("window.__ptySizes?.filter(x=>x.kind==='spawn').length === 3")
        # Let post-spawn resize and hidden-pane timeout finish before selecting.
        page.wait_for_timeout(400)
        sizes = page.evaluate("window.__ptySizes")
        r.check("hidden restore never sends a collapsed grid to PTY", all(x["cols"] >= 80 and x["rows"] >= 24 for x in sizes), str(sizes))
        for i in range(1, 4):
            sid = f"restore-{i}"
            page.locator(f'.session-item[data-session-id="{sid}"]').click()
            page.wait_for_timeout(500)
            before = page.evaluate("id => {const t=window.__restoreTerms[id];return {cols:t.cols,rows:t.rows,y:t.buffer.normal.cursorY};}", sid)
            r.check(f"{sid}: shown grid fits a full pane", before["cols"] > 80 and before["rows"] > 24, str(before))
            pane = page.locator('.pane[data-in-layout="true"]')
            pane.locator(".xterm-helper-textarea").focus()
            page.keyboard.type("abc")
            page.wait_for_timeout(100)
            state = page.evaluate("""id => {
              const t=window.__restoreTerms[id], b=t.buffer.normal;
              return {y:b.cursorY,line:b.getLine(b.baseY+b.cursorY).translateToString(true),
                history:Array.from({length:b.baseY},(_,i)=>b.getLine(i).translateToString(true)).join('\\n')};
            }""", sid)
            r.eq(f"{sid}: input stays on prompt row", state["y"], before["y"])
            r.check(f"{sid}: prompt survives absolute cursor redraw", state["line"].startswith("PS> "), str(state))
            r.check(f"{sid}: history remains in scrollback", f"HISTORY scrollback-{sid}.txt" in state["history"])
            pane.get_by_role("button", name="查看上次紀錄").click()
            r.check(f"{sid}: history is accessible without terminal scrolling", f"HISTORY scrollback-{sid}.txt" in pane.locator(".replay-history-content").inner_text())
            page.screenshot(path=f"logs/{sid}.png")
            pane.get_by_role("button", name="關閉紀錄").click()
        # Active screen full at resize: ConPTY must not pull history into it.
        state = page.evaluate("""async () => {
          const t=window.__restoreTerms['restore-3'];
          await new Promise(r=>t.write(`\\x1b[${t.rows};1Hbottom`,r));
          const before=t.buffer.normal.cursorY;
          t.resize(t.cols,t.rows+10);
          return {before,after:t.buffer.normal.cursorY};
        }""")
        r.eq("ConPTY growth keeps cursor row stable", state["after"], state["before"])
        ctx.close()
        browser.close()
    return r.report("terminal-restore")


if __name__ == "__main__":
    raise SystemExit(main())
