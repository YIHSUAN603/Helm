// 設定對話框：主題、字型、游標、預設 shell/工作目錄。所有變更即時套用並寫入 localStorage。
// 結構仿 CommandPalette：backdrop + 置中對話框，Esc/backdrop 點擊關閉並還原焦點。
import { useEffect, useMemo, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useUiStore } from "../../store/ui";
import { useThemeStore, THEME_NAMES, THEME_LABELS } from "../../store/theme";
import { useSettingsStore, FONT_FAMILY_PRESETS, type CursorStyle } from "../../store/settings";
import { firstFontFamily, toFontFamilyValue } from "../../store/fontFamily";
import { listMonospaceFonts } from "../../ipc/fonts";
import { useLanguageStore, LANGUAGE_NAMES, LANGUAGE_LABELS } from "../../store/language";
import { installPendingUpdate, useUpdateStore } from "../../store/update";
import { focusActiveTerminal } from "../../focus/focusUtils";
import { useT } from "../../i18n";
import "./SettingsDialog.css";

const CURSOR_STYLE_KEYS: Record<CursorStyle, string> = {
  block: "settings.cursorStyleBlock",
  bar: "settings.cursorStyleBar",
  underline: "settings.cursorStyleUnderline",
};
const CURSOR_STYLES: CursorStyle[] = ["block", "bar", "underline"];

const CUSTOM_FONT_FAMILY_ID = "custom";

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

  // 系統等寬字型清單；載入中(null)、清單為空或純瀏覽器環境時退回內建 preset。
  const [systemFonts, setSystemFonts] = useState<string[] | null>(null);
  useEffect(() => {
    let alive = true;
    listMonospaceFonts().then((fonts) => {
      if (alive) {
        setSystemFonts(fonts);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const fontOptions = useMemo(
    () =>
      systemFonts && systemFonts.length > 0
        ? systemFonts.map((name) => ({
            id: name,
            label: name,
            value: toFontFamilyValue(name),
          }))
        : FONT_FAMILY_PRESETS,
    [systemFonts],
  );

  // 使用者主動選了「自訂…」時強制顯示自由輸入框（此時 fontFamily 可能仍匹配某個選項）。
  const [forceCustomFont, setForceCustomFont] = useState(false);

  // 選中判定：先精確比對，再以第一個字型名稱比對（讓舊的 preset 備援鏈值
  // 能對到同名的系統字型），都沒中才落到「自訂」。
  const storedFirstFamily = firstFontFamily(fontFamily).toLowerCase();
  const selectedFontPresetId = forceCustomFont
    ? CUSTOM_FONT_FAMILY_ID
    : fontOptions.find((p) => p.value === fontFamily)?.id ??
      fontOptions.find((p) => firstFontFamily(p.value).toLowerCase() === storedFirstFamily)?.id ??
      CUSTOM_FONT_FAMILY_ID;

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
            <select
              value={selectedFontPresetId}
              onChange={(e) => {
                if (e.target.value === CUSTOM_FONT_FAMILY_ID) {
                  setForceCustomFont(true);
                  return;
                }
                setForceCustomFont(false);
                const preset = fontOptions.find((p) => p.id === e.target.value);
                if (preset) setFontFamily(preset.value);
              }}
            >
              {fontOptions.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
              <option value={CUSTOM_FONT_FAMILY_ID}>{t("settings.fontFamilyCustom")}</option>
            </select>
          </label>

          {selectedFontPresetId === CUSTOM_FONT_FAMILY_ID && (
            <label className="settings-row">
              <span>{t("settings.fontFamilyCustomValue")}</span>
              <input
                type="text"
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
              />
            </label>
          )}

          <label className="settings-row">
            <span>{t("settings.fontSize")}</span>
            <input
              type="number"
              min={8}
              max={32}
              value={fontSize}
              onChange={(e) => {
                const v = Number(e.target.value);
                // 夾在宣告的 min/max 內：超界值會直接套進 xterm 並持久化。
                if (v > 0) setFontSize(Math.min(32, Math.max(8, v)));
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
            {updatePhase === "available" ? (
              <span className="settings-update">
                {t("update.available", { version: updateVersion ?? "" })}
                <button
                  className="settings-update-install"
                  onClick={() => void installPendingUpdate()}
                >
                  {t("update.installNow")}
                </button>
              </span>
            ) : (
              <span>
                {updatePhase === "idle" || updatePhase === "checking"
                  ? t("update.checking")
                  : t(`update.${updatePhase}`, { version: updateVersion ?? "" })}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
