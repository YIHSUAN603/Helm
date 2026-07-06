// 設定對話框：主題、字型、游標、預設 shell/工作目錄。所有變更即時套用並寫入 localStorage。
// 結構仿 CommandPalette：backdrop + 置中對話框，Esc/backdrop 點擊關閉並還原焦點。
import { useEffect, useRef } from "react";
import { useUiStore } from "../../store/ui";
import { useThemeStore, THEME_NAMES, THEME_LABELS } from "../../store/theme";
import { useSettingsStore, type CursorStyle } from "../../store/settings";
import { focusActiveTerminal } from "../../focus/focusUtils";
import "./SettingsDialog.css";

const CURSOR_STYLES: { value: CursorStyle; label: string }[] = [
  { value: "block", label: "方塊" },
  { value: "bar", label: "直線" },
  { value: "underline", label: "底線" },
];

export function SettingsDialog() {
  const open = useUiStore((s) => s.settingsOpen);
  if (!open) return null;
  return <SettingsDialogInner />;
}

function SettingsDialogInner() {
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const prevFocusRef = useRef<Element | null>(document.activeElement);

  const themeName = useThemeStore((s) => s.name);
  const setThemeName = useThemeStore((s) => s.setName);

  const fontFamily = useSettingsStore((s) => s.fontFamily);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const cursorStyle = useSettingsStore((s) => s.cursorStyle);
  const cursorBlink = useSettingsStore((s) => s.cursorBlink);
  const defaultShell = useSettingsStore((s) => s.defaultShell);
  const defaultCwd = useSettingsStore((s) => s.defaultCwd);
  const setFontFamily = useSettingsStore((s) => s.setFontFamily);
  const setFontSize = useSettingsStore((s) => s.setFontSize);
  const setCursorStyle = useSettingsStore((s) => s.setCursorStyle);
  const setCursorBlink = useSettingsStore((s) => s.setCursorBlink);
  const setDefaultShell = useSettingsStore((s) => s.setDefaultShell);
  const setDefaultCwd = useSettingsStore((s) => s.setDefaultCwd);

  useEffect(() => {
    const dialog = document.getElementById("settings-dialog");
    (dialog?.querySelector("select, input") as HTMLElement | null)?.focus();
  }, []);

  const close = () => {
    setSettingsOpen(false);
    const prev = prevFocusRef.current;
    if (prev instanceof HTMLElement && prev.isConnected) {
      prev.focus();
    } else {
      focusActiveTerminal();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  return (
    <div className="settings-overlay">
      <div className="settings-backdrop" onClick={close} />
      <div
        id="settings-dialog"
        className="settings"
        role="dialog"
        aria-modal="true"
        aria-label="設定"
        onKeyDown={onKeyDown}
      >
        <div className="settings-header">
          <span className="settings-title">設定</span>
          <button className="settings-close" onClick={close} aria-label="關閉">
            ×
          </button>
        </div>

        <div className="settings-body">
          <label className="settings-row">
            <span>主題</span>
            <select
              value={themeName}
              onChange={(e) => setThemeName(e.target.value as typeof themeName)}
            >
              {THEME_NAMES.map((name) => (
                <option key={name} value={name}>
                  {THEME_LABELS[name]}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-row">
            <span>字型</span>
            <input
              type="text"
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
            />
          </label>

          <label className="settings-row">
            <span>字型大小</span>
            <input
              type="number"
              min={8}
              max={32}
              value={fontSize}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v > 0) setFontSize(v);
              }}
            />
          </label>

          <label className="settings-row">
            <span>游標樣式</span>
            <select
              value={cursorStyle}
              onChange={(e) => setCursorStyle(e.target.value as CursorStyle)}
            >
              {CURSOR_STYLES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-row">
            <span>游標閃爍</span>
            <input
              type="checkbox"
              checked={cursorBlink}
              onChange={(e) => setCursorBlink(e.target.checked)}
            />
          </label>

          <label className="settings-row">
            <span>預設 Shell</span>
            <input
              type="text"
              value={defaultShell}
              placeholder="留空使用系統預設"
              onChange={(e) => setDefaultShell(e.target.value)}
            />
          </label>

          <label className="settings-row">
            <span>預設工作目錄</span>
            <input
              type="text"
              value={defaultCwd}
              placeholder="留空使用使用者家目錄"
              onChange={(e) => setDefaultCwd(e.target.value)}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
