import { useState } from "react";
import { t } from "../../i18n";
import "./ReplayHistory.css";

/** 靜態紀錄獨立於 PTY 畫面，不受 shell 清屏或 alt-screen 影響。 */
export function ReplayHistory({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="replay-history">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t(open ? "terminal.hideHistory" : "terminal.showHistory")}
      </button>
      {open && (
        <pre className="replay-history-content" tabIndex={0} onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setOpen(false);
          }
        }}>{text}</pre>
      )}
    </div>
  );
}
