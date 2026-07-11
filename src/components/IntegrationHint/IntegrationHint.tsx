// 偵測到 Codex 但 OSC 9 通知未設定時的引導橫幅：點「開啟設定」直達設定
// 對話框的 Agent 整合區塊（含可複製的 config.toml 片段）；× 寫 localStorage
// 永久不再提示。Helm 不自動改 TOML，這裡只做引導。
import { useEffect, useRef, useState } from "react";
import { integrationStatus } from "../../ipc/integrations";
import { useSessionStore } from "../../store/sessions";
import { useUiStore } from "../../store/ui";
import { useT } from "../../i18n";
import "./IntegrationHint.css";

const DISMISSED_KEY = "helm.codexOsc9HintDismissed";

export function IntegrationHint() {
  const t = useT();
  const hasCodex = useSessionStore((s) => s.sessions.some((x) => x.agentId === "codex"));
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const [show, setShow] = useState(false);
  // 每次 app 執行只查一次狀態：sessions tick 頻繁，不能反覆打 IPC。
  const checked = useRef(false);

  useEffect(() => {
    if (!hasCodex || checked.current) return;
    checked.current = true;
    if (localStorage.getItem(DISMISSED_KEY) === "true") return;
    void integrationStatus().then((status) => {
      // 純瀏覽器環境（null）或已設定 → 不提示。
      if (status && !status.codexOsc9) setShow(true);
    });
  }, [hasCodex]);

  if (!show) return null;

  return (
    <div className="integration-hint">
      <div className="integration-hint-text">{t("integrationHint.codexOsc9")}</div>
      <div className="integration-hint-actions">
        <button
          className="integration-hint-open"
          onClick={() => {
            // 本次不再顯示，但不寫 dismissed：設定完成後 status 檢查會自行擋掉，
            // 沒設定的話下次啟動再提醒一次。
            setShow(false);
            setSettingsOpen(true);
          }}
        >
          {t("integrationHint.openSettings")}
        </button>
        <button
          className="integration-hint-dismiss"
          aria-label={t("integrationHint.dismiss")}
          title={t("integrationHint.dismiss")}
          onClick={() => {
            localStorage.setItem(DISMISSED_KEY, "true");
            setShow(false);
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
