// 設定對話框：主題、字型、游標、預設 shell/工作目錄。所有變更即時套用並寫入 localStorage。
// 結構仿 CommandPalette：backdrop + 置中對話框，Esc/backdrop 點擊關閉並還原焦點。
import { useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useUiStore } from "../../store/ui";
import { useThemeStore, THEME_NAMES, THEME_LABELS } from "../../store/theme";
import { useSettingsStore, type CursorStyle } from "../../store/settings";
import { useLanguageStore, LANGUAGE_NAMES, LANGUAGE_LABELS } from "../../store/language";
import { useUpdateStore } from "../../store/update";
import { focusActiveTerminal } from "../../focus/focusUtils";
import { useT } from "../../i18n";
import "./SettingsDialog.css";

const CURSOR_STYLE_KEYS: Record<CursorStyle, string> = {
  block: "settings.cursorStyleBlock",
  bar: "settings.cursorStyleBar",
  underline: "settings.cursorStyleUnderline",
};
const CURSOR_STYLES: CursorStyle[] = ["block", "bar", "underline"];

export function SettingsDialog() {
  const open = useUiStore((s) => s.settingsOpen);
  if (!open) return null;
  return <SettingsDialogInner />;
}

function SettingsDialogInner() {
  const t = useT();
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const prevFocusRef = useRef<Element | null>(document.activeElement);

  const themeName = useThemeStore((s) => s.name);
  const setThemeName = useThemeStore((s) => s.setName);

  const language = useLanguageStore((s) => s.name);
  const setLanguage = useLanguageStore((s) => s.setName);

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

  const updatePhase = useUpdateStore((s) => s.phase);
  const updateVersion = useUpdateStore((s) => s.version);
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    const dialog = document.getElementById("settings-dialog");
    (dialog?.querySelector("select, input") as HTMLElement | null)?.focus();
  }, []);

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
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
        aria-label={t("settings.dialogLabel")}
        onKeyDown={onKeyDown}
      >
        <div className="settings-header">
          <span className="settings-title">{t("settings.title")}</span>
          <button className="settings-close" onClick={close} aria-label={t("settings.close")}>
            ×
          </button>
        </div>

        <div className="settings-body">
          <label className="settings-row">
            <span>{t("settings.theme")}</span>
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
            <span>{t("settings.language")}</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as typeof language)}
            >
              {LANGUAGE_NAMES.map((name) => (
                <option key={name} value={name}>
                  {LANGUAGE_LABELS[name]}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-row">
            <span>{t("settings.fontFamily")}</span>
            <input
              type="text"
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
            />
          </label>

          <label className="settings-row">
            <span>{t("settings.fontSize")}</span>
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
            <span>{t("settings.cursorStyle")}</span>
            <select
              value={cursorStyle}
              onChange={(e) => setCursorStyle(e.target.value as CursorStyle)}
            >
              {CURSOR_STYLES.map((c) => (
                <option key={c} value={c}>
                  {t(CURSOR_STYLE_KEYS[c])}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-row">
            <span>{t("settings.cursorBlink")}</span>
            <input
              type="checkbox"
              checked={cursorBlink}
              onChange={(e) => setCursorBlink(e.target.checked)}
            />
          </label>

          <label className="settings-row">
            <span>{t("settings.defaultShell")}</span>
            <input
              type="text"
              value={defaultShell}
              placeholder={t("settings.defaultShellPlaceholder")}
              onChange={(e) => setDefaultShell(e.target.value)}
            />
          </label>

          <label className="settings-row">
            <span>{t("settings.defaultCwd")}</span>
            <input
              type="text"
              value={defaultCwd}
              placeholder={t("settings.defaultCwdPlaceholder")}
              onChange={(e) => setDefaultCwd(e.target.value)}
            />
          </label>

          <div className="settings-row">
            <span>{t("settings.updateVersion")}</span>
            <span>{appVersion}</span>
          </div>

          <div className="settings-row">
            <span>{t("settings.updateStatus")}</span>
            <span>
              {updatePhase === "idle" || updatePhase === "checking"
                ? t("update.checking")
                : t(`update.${updatePhase}`, { version: updateVersion ?? "" })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
