import { useTerminalDiagnosticsStore } from "../../store/terminalDiagnostics";
import { useT } from "../../i18n";

export function TerminalDiagnostics() {
  const t = useT();
  const entries = useTerminalDiagnosticsStore((s) => s.entries);
  const clear = useTerminalDiagnosticsStore((s) => s.clear);

  return (
    <>
      <div className="settings-section">{t("diagnostics.title")}</div>
      <p className="settings-hint">{t("diagnostics.hint")}</p>
      <div className="settings-row">
        <span>{t("diagnostics.count", { count: entries.length })}</span>
        <button className="settings-secondary" disabled={entries.length === 0} onClick={clear}>
          {t("diagnostics.clear")}
        </button>
      </div>
      {entries.length === 0 && <p className="settings-hint">{t("diagnostics.empty")}</p>}
      {entries.map((entry) => (
        <div
          className="settings-diagnostic-entry"
          key={`${entry.sessionId}:${entry.operation}:${entry.firstSeen}:${entry.message}`}
        >
          <div>
            {new Date(entry.lastSeen).toLocaleString()} · {entry.operation} · ×{entry.count}
          </div>
          <div>{t("diagnostics.session", { id: entry.sessionId })}</div>
          <div>{entry.message}</div>
        </div>
      ))}
    </>
  );
}
