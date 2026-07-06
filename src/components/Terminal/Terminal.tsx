// xterm.js 終端面板：掛載後開一條 PTY，串接輸入/輸出/resize。
// 多實例：隱藏時仍保留掛載（PTY 續跑、scrollback 保留），顯示時 refit。
// agent 感知：輸出後 debounce 讀取已渲染的 buffer 文字餵給 onScan。
import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import type { UnlistenFn } from "@tauri-apps/api/event";
import {
  onPtyExit,
  onPtyOutput,
  ptyKill,
  ptyResize,
  ptySpawn,
  ptyWrite,
} from "../../ipc/pty";
import { useThemeStore, xtermThemes } from "../../store/theme";
import { useSettingsStore } from "../../store/settings";
import "./Terminal.css";

interface TerminalProps {
  id: string;
  /** 是否為目前 focus 的 pane（邊框高亮 + 自動聚焦輸入）。 */
  focused: boolean;
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

export function Terminal({
  id,
  focused,
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
  cbRef.current = { onTitle, onBusy, onIdle, onExit, onScan, onStream };

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
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // WebGL 不可用時退回預設 canvas renderer。
    }
    fitAddon.fit();
    termRef.current = term;
    fitRef.current = fitAddon;

    const titleDisposable = term.onTitleChange((t) => cbRef.current.onTitle?.(t));

    // 活動燈 + agent 掃描（皆 debounce）。
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let scanTimer: ReturnType<typeof setTimeout> | undefined;
    const onOutput = () => {
      cbRef.current.onBusy?.();
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => cbRef.current.onIdle?.(), 400);
      if (scanTimer) clearTimeout(scanTimer);
      scanTimer = setTimeout(() => {
        cbRef.current.onScan?.(readBufferText(term));
      }, 150);
    };

    let disposed = false;
    let unlistenOutput: UnlistenFn | undefined;
    let unlistenExit: UnlistenFn | undefined;
    const decoder = new TextDecoder();

    (async () => {
      unlistenOutput = await onPtyOutput(id, (bytes) => {
        term.write(bytes);
        onOutput();
        // 串流解碼供逐行擷取（stream:true 處理跨 chunk 的多位元組字元）。
        cbRef.current.onStream?.(decoder.decode(bytes, { stream: true }));
      });
      unlistenExit = await onPtyExit(id, () => {
        term.write("\r\n\x1b[2m[process exited]\x1b[0m\r\n");
        cbRef.current.onExit?.();
      });
      if (disposed) return;
      const effectiveShell = shell ?? (settings.defaultShell || undefined);
      const effectiveCwd = cwd ?? (settings.defaultCwd || undefined);
      await ptySpawn({ id, cols: term.cols, rows: term.rows, cwd: effectiveCwd, shell: effectiveShell });
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
      resizeObserver.disconnect();
      titleDisposable.dispose();
      dataDisposable.dispose();
      unlistenOutput?.();
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
