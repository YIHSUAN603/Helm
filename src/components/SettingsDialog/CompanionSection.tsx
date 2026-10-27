// 設定 → Companion 分頁（解鎖後才出現）：開關、親密度、取名、寵物管理、航海日誌。
// 匯入的驗證全在 Rust（pets.rs），這裡只負責流程：選檔 → （單一圖片時）取名
// → 撞 id 時詢問覆蓋 → 重新列出。
import { useState } from "react";
import { BUILTIN_PETS, useCompanionStore } from "../../store/companion";
import { deletePet, importPet } from "../../ipc/pets";
import { pickFolder, pickSpriteSheet } from "../../ipc/dialog";
import { levelOf, MAX_LEVEL, MILESTONE_IDS } from "../../companion/progress";
import { useT } from "../../i18n";

type Pending =
  | { kind: "name"; source: string }
  | { kind: "overwrite"; source: string; name: string | null; id: string };

export function CompanionSection() {
  const t = useT();
  const data = useCompanionStore((s) => s.data);
  const pets = useCompanionStore((s) => s.pets);
  const [pending, setPending] = useState<Pending | null>(null);
  const [importName, setImportName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  if (!data) return null;

  const store = useCompanionStore.getState();
  const level = levelOf(data.affinity);
  const canRename = level >= MAX_LEVEL;

  const runImport = async (source: string, name: string | null, overwrite: boolean) => {
    setError(null);
    try {
      const res = await importPet(source, name, overwrite);
      if (res.status === "exists") {
        setPending({ kind: "overwrite", source, name, id: res.id });
        return;
      }
      setPending(null);
      await store.refreshPets();
      store.setActivePet(res.id);
    } catch (e) {
      setPending(null);
      setError(t(`settings.companionError.${String(e)}`));
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await deletePet(id);
    } catch (e) {
      setError(t(`settings.companionError.${String(e)}`));
    }
    await store.refreshPets();
  };

  const commitName = () => {
    if (nameDraft !== null) store.setPetName(nameDraft);
    setNameDraft(null);
  };

  const logbook = [...data.milestones]
    .filter((m) => MILESTONE_IDS.includes(m.id))
    .sort((a, b) => b.at - a.at);

  return (
    <>
      <label className="settings-row">
        <span>{t("settings.companionEnabled")}</span>
        <input
          type="checkbox"
          checked={data.enabled}
          onChange={(e) => store.setEnabled(e.target.checked)}
        />
      </label>

      <div className="settings-row">
        <span>{t("settings.companionLevel")}</span>
        <span>{t("settings.companionLevelValue", { level, affinity: data.affinity })}</span>
      </div>
      <p className="settings-hint">
        {t("settings.companionStats", { answered: data.answered, done: data.done })}
      </p>

      <label className="settings-row">
        <span>{t("settings.companionName")}</span>
        <input
          type="text"
          disabled={!canRename}
          maxLength={24}
          placeholder={
            canRename ? t("settings.companionNamePlaceholder") : t("settings.companionNameLocked")
          }
          value={nameDraft ?? data.petName ?? ""}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitName();
          }}
        />
      </label>

      <div className="settings-section">{t("settings.companionPets")}</div>
      {[...BUILTIN_PETS, ...pets].map((p) => {
        const builtin = BUILTIN_PETS.some((b) => b.id === p.id);
        return (
          <div className="settings-row settings-subrow" key={p.id}>
            <label className="companion-pet-choice">
              <input
                type="radio"
                name="companion-pet"
                checked={data.activePetId === p.id}
                onChange={() => store.setActivePet(p.id)}
              />
              <span>{p.displayName}</span>
            </label>
            {builtin ? (
              <span className="settings-hint">{t("settings.companionBuiltin")}</span>
            ) : (
              <button className="settings-secondary" onClick={() => void remove(p.id)}>
                {t("settings.companionDelete")}
              </button>
            )}
          </div>
        );
      })}

      {pending?.kind === "name" ? (
        <div className="settings-row settings-row-actions">
          <input
            type="text"
            autoFocus
            maxLength={40}
            placeholder={t("settings.companionImportName")}
            value={importName}
            onChange={(e) => setImportName(e.target.value)}
          />
          <button
            className="settings-secondary"
            disabled={!importName.trim()}
            onClick={() => void runImport(pending.source, importName.trim(), false)}
          >
            {t("settings.companionImportConfirm")}
          </button>
          <button className="settings-secondary" onClick={() => setPending(null)}>
            {t("settings.companionCancel")}
          </button>
        </div>
      ) : pending?.kind === "overwrite" ? (
        <div className="settings-row settings-row-actions">
          <span>{t("settings.companionOverwrite", { id: pending.id })}</span>
          <button
            className="settings-secondary"
            onClick={() => void runImport(pending.source, pending.name, true)}
          >
            {t("settings.companionOverwriteConfirm")}
          </button>
          <button className="settings-secondary" onClick={() => setPending(null)}>
            {t("settings.companionCancel")}
          </button>
        </div>
      ) : (
        <div className="settings-row settings-row-actions">
          <button
            className="settings-secondary"
            onClick={async () => {
              const dir = await pickFolder().catch(() => null);
              if (dir) await runImport(dir, null, false);
            }}
          >
            {t("settings.companionImportFolder")}
          </button>
          <button
            className="settings-secondary"
            onClick={async () => {
              const file = await pickSpriteSheet().catch(() => null);
              if (!file) return;
              setImportName("");
              setPending({ kind: "name", source: file });
            }}
          >
            {t("settings.companionImportImage")}
          </button>
        </div>
      )}
      {error && <p className="settings-hint settings-error">{error}</p>}
      <p className="settings-hint">{t("settings.companionFormatHint")}</p>

      <div className="settings-section">
        {t("settings.companionLogbook")} · {logbook.length} / {MILESTONE_IDS.length}
      </div>
      {logbook.length === 0 ? (
        <p className="settings-hint">{t("settings.companionLogbookEmpty")}</p>
      ) : (
        <ul className="companion-logbook">
          {logbook.map((m) => (
            <li key={m.id}>
              <span>{t(`companion.milestone.${m.id}`)}</span>
              <span className="settings-hint">{new Date(m.at).toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
