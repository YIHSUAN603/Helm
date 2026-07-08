// xterm.js 終端面板：掛載後開一條 PTY，串接輸入/輸出/resize。
// 多實例：隱藏時仍保留掛載（PTY 續跑、scrollback 保留），顯示時 refit。
// agent 感知：輸出後 debounce 讀取已渲染的 buffer 文字餵給 onScan。
import { memo, useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import type { UnlistenFn } from "@tauri-apps/api/event";
import {
  onPtyExit,
  ptyKill,
  ptyResize,
  ptySpawn,
  ptyWrite,
} from "../../ipc/pty";
import { useThemeStore, xtermThemes } from "../../store/theme";
import { useSettingsStore } from "../../store/settings";
import "./Terminal.css";

// WebGL context-loss recovery: retry budget per visible period, and how long
// to wait before re-attaching (gives the GPU driver time after a reset).
const MAX_CONTEXT_LOSSES = 3;
const CONTEXT_LOSS_RETRY_MS = 1000;

// Agent-scan debounce. Hidden panes still scan (their approvals surface via
// sidebar badges and desktop notifications) but at a relaxed cadence — the
// extra latency is invisible there and the viewport regex sweep is not free.
const SCAN_DEBOUNCE_VISIBLE_MS = 150;
const SCAN_DEBOUNCE_HIDDEN_MS = 1000;

interface TerminalProps {
  id: string;
  /** 是否為目前 focus 的 pane（邊框高亮 + 自動聚焦輸入）。 */
  focused: boolean;
  /** Pane is CSS-visible (`data-in-layout="true"`); drives WebGL renderer attach/detach. */
  visible: boolean;
  cwd?: string;
  shell?: string;
  /** 啟動後送進 PTY 的指令（例如啟動某個 agent）。 */
  launchCommand?: string;
  onTitle?: (title: string) => void;
  onBusy?: () => void;
  onIdle?: () => void;
  onExit?: () => void;
  /** debounce 後把近期已渲染文字交出去做 agent 狀態偵測。 */
  onScan?: (text: string) => void;
  /** 原始輸出串流（已解碼文字），供逐行擷取成本/檔案變更。 */
  onStream?: (text: string) => void;
}

// 只讀「目前可見畫面」的渲染文字（baseY 起算的 term.rows 行）。
// 刻意不含捲動歷史：已回答並捲走的提示不該再被當成作用中的核准。
function readBufferText(term: XTerm): string {
  const buf = term.buffer.active;
  const out: string[] = [];
  for (let i = 0; i < term.rows; i++) {
    const line = buf.getLine(buf.baseY + i);
    if (line) out.push(line.translateToString(true));
  }
  return out.join("\n");
}

function TerminalImpl({
  id,
  focused,
  visible,
  cwd,
  shell,
  launchCommand,
  onTitle,
  onBusy,
  onIdle,
  onExit,
  onScan,
  onStream,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const themeName = useThemeStore((s) => s.name);

  const cbRef = useRef({ onTitle, onBusy, onIdle, onExit, onScan, onStream });
  // Latest-ref 模式（刻意在 render 期同步更新）：PTY 事件可能在 render 與
  // effect flush 之間到達，改在 effect 內指派會讀到過期 callback。
  // eslint-disable-next-line react-hooks/refs
  cbRef.current = { onTitle, onBusy, onIdle, onExit, onScan, onStream };

  // WebGL renderer lifecycle: only visible panes hold a GPU context
  // (WebView2 caps live WebGL contexts at ~16; hidden panes fall back to the
  // DOM renderer, which costs nothing while display:none). All state lives in
  // refs so the helpers below never close over stale values.
  const webglRef = useRef<WebglAddon | null>(null);
  const contextLossDisposableRef = useRef<{ dispose(): void } | null>(null);
  const lossCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attachRafRef = useRef(0);
  const visibleRef = useRef(visible);
  // Latest-ref 模式（同 cbRef）：scan debounce 在事件路徑上讀取，不參與 render。
  // eslint-disable-next-line react-hooks/refs
  visibleRef.current = visible;

  // Drop the WebGL context and every pending attach/retry; xterm falls back
  // to the DOM renderer until attachWebgl() runs again.
  function detachWebgl() {
    if (attachRafRef.current) {
      cancelAnimationFrame(attachRafRef.current);
      attachRafRef.current = 0;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = undefined;
    }
    contextLossDisposableRef.current?.dispose();
    contextLossDisposableRef.current = null;
    try {
      webglRef.current?.dispose();
    } catch {
      /* ignore */
    }
    webglRef.current = null;
  }

  // Idempotent: attaches the WebGL renderer only when the pane is visible,
  // laid out (non-zero size), and not already accelerated.
  function attachWebgl() {
    const term = termRef.current;
    const container = containerRef.current;
    if (webglRef.current || !term || !container || !visibleRef.current) {
      return;
    }
    if (container.clientWidth === 0 || container.clientHeight === 0) {
      return;
    }
    const addon = new WebglAddon();
    // Subscribe before loading: per xterm docs the addon must be disposed
    // as soon as the context is lost.
    contextLossDisposableRef.current = addon.onContextLoss(() => handleContextLoss());
    try {
      term.loadAddon(addon);
      webglRef.current = addon;
    } catch {
      // WebGL unavailable: stay on the DOM renderer. Count it as a loss so
      // the retry path does not hammer a hard-failing GPU.
      contextLossDisposableRef.current?.dispose();
      contextLossDisposableRef.current = null;
      try {
        addon.dispose();
      } catch {
        /* ignore */
      }
      lossCountRef.current += 1;
    }
  }

  // GPU reset (sleep/resume, driver crash): dispose the dead context and
  // re-attach after a delay, bounded so a broken GPU settles on the DOM
  // renderer instead of retrying forever. The budget resets on next show.
  function handleContextLoss() {
    lossCountRef.current += 1;
    detachWebgl();
    if (lossCountRef.current >= MAX_CONTEXT_LOSSES) {
      return;
    }
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = undefined;
      if (visibleRef.current) {
        attachWebgl();
      }
    }, CONTEXT_LOSS_RETRY_MS);
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const settings = useSettingsStore.getState();
    const term = new XTerm({
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      cursorStyle: settings.cursorStyle,
      cursorBlink: settings.cursorBlink,
      allowProposedApi: true,
      theme: xtermThemes[useThemeStore.getState().name],
    });
    // xterm.js 不對映 Ctrl+/ → 0x1F(^_);補上讓 nvim 的 <C-/> 綁定可用。
    term.attachCustomKeyEventHandler((e) => {
      if (
        e.type === "keydown" &&
        e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey &&
        e.key === "/"
      ) {
        term.input("\x1f");
        return false; // 已處理,不讓 xterm 預設邏輯再碰
      }
      return true;
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();
    termRef.current = term;
    fitRef.current = fitAddon;

    // WebGL is owned by the visibility effect; this rAF covers term rebuilds
    // (deps change) where that effect does not re-run. Double-fire on first
    // mount is harmless — attachWebgl() is idempotent.
    const initialAttachRaf = requestAnimationFrame(() => {
      attachWebgl();
    });

    const titleDisposable = term.onTitleChange((t) => cbRef.current.onTitle?.(t));

    // 活動燈 + agent 掃描（皆 debounce）。
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let scanTimer: ReturnType<typeof setTimeout> | undefined;
    const onOutput = () => {
      // Leading-edge busy: onBusy fires once per busy period (first chunk),
      // not per chunk — the idle timeout re-arms it.
      if (idleTimer === undefined) cbRef.current.onBusy?.();
      else clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        idleTimer = undefined;
        cbRef.current.onIdle?.();
      }, 400);
      if (scanTimer) clearTimeout(scanTimer);
      scanTimer = setTimeout(
        () => {
          cbRef.current.onScan?.(readBufferText(term));
        },
        visibleRef.current ? SCAN_DEBOUNCE_VISIBLE_MS : SCAN_DEBOUNCE_HIDDEN_MS,
      );
    };

    let disposed = false;
    let unlistenExit: UnlistenFn | undefined;
    const decoder = new TextDecoder();

    (async () => {
      unlistenExit = await onPtyExit(id, () => {
        term.write("\r\n\x1b[2m[process exited]\x1b[0m\r\n");
        cbRef.current.onExit?.();
      });
      if (disposed) return;
      const effectiveShell = shell ?? (settings.defaultShell || undefined);
      const effectiveCwd = cwd ?? (settings.defaultCwd || undefined);
      await ptySpawn(
        { id, cols: term.cols, rows: term.rows, cwd: effectiveCwd, shell: effectiveShell },
        (bytes) => {
          // The channel has no unlisten: a message can land between React
          // cleanup and the Rust reader noticing pty_kill, and term.write on
          // a disposed xterm would throw.
          if (disposed) return;
          term.write(bytes);
          onOutput();
          // 串流解碼供逐行擷取（stream:true 處理跨 chunk 的多位元組字元）。
          cbRef.current.onStream?.(decoder.decode(bytes, { stream: true }));
        },
      );
      // 啟動 agent：把指令當作使用者輸入送進 PTY（保留完整 shell 環境）。
      if (launchCommand) {
        await ptyWrite(id, `${launchCommand}\r`);
      }
    })();

    const dataDisposable = term.onData((data) => {
      void ptyWrite(id, data);
    });

    // 拖曳分隔線時 resize 事件連發：fit 用 rAF 合併（畫面即時跟手），
    // ptyResize 尾端 debounce（拖曳結束才通知 PTY 新的 cols/rows）。
    let fitRaf = 0;
    let ptyResizeTimer: ReturnType<typeof setTimeout> | undefined;
    const resizeObserver = new ResizeObserver(() => {
      if (container.clientWidth === 0 || container.clientHeight === 0) return;
      if (!fitRaf) {
        fitRaf = requestAnimationFrame(() => {
          fitRaf = 0;
          try {
            fitAddon.fit();
          } catch {
            /* ignore */
          }
        });
      }
      if (ptyResizeTimer) clearTimeout(ptyResizeTimer);
      ptyResizeTimer = setTimeout(() => {
        try {
          void ptyResize(id, term.cols, term.rows);
        } catch {
          /* ignore */
        }
      }, 80);
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      if (idleTimer) clearTimeout(idleTimer);
      if (scanTimer) clearTimeout(scanTimer);
      if (fitRaf) cancelAnimationFrame(fitRaf);
      if (ptyResizeTimer) clearTimeout(ptyResizeTimer);
      cancelAnimationFrame(initialAttachRaf);
      // term.dispose() would dispose the addon too, but explicit detach also
      // clears our retry timers and listener refs.
      detachWebgl();
      resizeObserver.disconnect();
      titleDisposable.dispose();
      dataDisposable.dispose();
      unlistenExit?.();
      void ptyKill(id);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [id, cwd, shell, launchCommand]);

  // focus 時聚焦輸入並 refit（版面剛變動時尺寸可能剛更新）。
  useEffect(() => {
    if (!focused) return;
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    requestAnimationFrame(() => {
      try {
        fit.fit();
        void ptyResize(id, term.cols, term.rows);
        term.focus();
      } catch {
        /* ignore */
      }
    });
  }, [focused, id]);

  // Visible ⇢ fit (display just flipped, dimensions are valid by rAF time)
  // then attach the WebGL renderer; hidden ⇢ release the GPU context.
  useEffect(() => {
    if (!visible) {
      detachWebgl();
      return;
    }
    // Fresh retry budget each time the pane is shown, so a pane that gave up
    // after repeated context losses gets another chance without a restart.
    lossCountRef.current = 0;
    attachRafRef.current = requestAnimationFrame(() => {
      attachRafRef.current = 0;
      try {
        fitRef.current?.fit();
      } catch {
        /* ignore */
      }
      attachWebgl();
    });
    return () => {
      if (attachRafRef.current) {
        cancelAnimationFrame(attachRafRef.current);
        attachRafRef.current = 0;
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = undefined;
      }
    };
  }, [visible]);

  useEffect(() => {
    const term = termRef.current;
    if (term) term.options.theme = xtermThemes[themeName];
  }, [themeName]);

  // 字型/游標設定變更：套用到已存在的 term，並重新 fit（字型大小會改變 cell 尺寸）。
  const fontFamily = useSettingsStore((s) => s.fontFamily);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const cursorStyle = useSettingsStore((s) => s.cursorStyle);
  const cursorBlink = useSettingsStore((s) => s.cursorBlink);
  useEffect(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    term.options.fontFamily = fontFamily;
    term.options.fontSize = fontSize;
    term.options.cursorStyle = cursorStyle;
    term.options.cursorBlink = cursorBlink;
    try {
      fit.fit();
      void ptyResize(id, term.cols, term.rows);
    } catch {
      /* ignore */
    }
  }, [id, fontFamily, fontSize, cursorStyle, cursorBlink]);

  // 版面（single/grid、顯示與否）由外層 pane 控制；這裡只填滿容器。
  return <div className="terminal-pane" ref={containerRef} />;
}

// The comparator ignores the callback props on purpose: they are read through
// cbRef (refreshed on every actual render), and the parent Pane's callbacks
// capture only the stable session id — so a skipped render can never leave a
// stale callback behind, while parent re-renders with fresh closures no
// longer cascade into every mounted terminal.
export const Terminal = memo(
  TerminalImpl,
  (prev, next) =>
    prev.id === next.id &&
    prev.focused === next.focused &&
    prev.visible === next.visible &&
    prev.cwd === next.cwd &&
    prev.shell === next.shell &&
    prev.launchCommand === next.launchCommand,
);
