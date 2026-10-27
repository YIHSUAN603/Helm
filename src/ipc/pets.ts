// 前端呼叫 Rust 寵物管理的封裝層（見 src-tauri/src/pets.rs）。
// Rust 的錯誤是短代碼（not-found / bad-size / ...），原樣交給 UI 對應 i18n。
import { invoke } from "@tauri-apps/api/core";

export interface PetInfo {
  id: string;
  displayName: string;
  description: string;
}

export type ImportOutcome = { status: "imported"; id: string } | { status: "exists"; id: string };

/**
 * 已匯入的寵物；沒有 Tauri runtime（瀏覽器 dev）時回空陣列。async + try：
 * 沒有 runtime 時 invoke 是同步 throw，只靠 .catch 接不到。
 */
export async function listPets(): Promise<PetInfo[]> {
  try {
    return await invoke<PetInfo[]>("list_pets");
  } catch {
    return [];
  }
}

/** 已匯入寵物的 sprite sheet（data: URL）。 */
export function readPetSprite(id: string): Promise<string> {
  return invoke<string>("read_pet_sprite", { id });
}

/** source 是寵物資料夾或單一 .webp（後者需要 displayName）。失敗時 reject 錯誤代碼。 */
export function importPet(
  source: string,
  displayName: string | null,
  overwrite: boolean,
): Promise<ImportOutcome> {
  return invoke<ImportOutcome>("import_pet", { source, displayName, overwrite });
}

export function deletePet(id: string): Promise<void> {
  return invoke<void>("delete_pet", { id });
}
