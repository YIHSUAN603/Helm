// Agent registry：合併內建 profiles/launchers 與使用者 agents.json。
import { invoke } from "@tauri-apps/api/core";
import { BUILTIN_LAUNCHERS, BUILTIN_PROFILES, GENERIC_PROFILE } from "./builtins";
import type { AgentConfig, AgentLauncher, AgentProfile } from "./types";

let profiles = new Map<string, AgentProfile>();
let launchers: AgentLauncher[] = [];

function reset() {
  profiles = new Map(BUILTIN_PROFILES.map((p) => [p.id, p]));
  launchers = [...BUILTIN_LAUNCHERS];
}
reset();

/** 啟動時載入使用者設定並合併（使用者同 id 覆寫內建，launchers 追加）。 */
export async function initRegistry(): Promise<void> {
  reset();
  try {
    const raw = await invoke<string | null>("read_agents_config");
    if (!raw) return;
    const cfg = JSON.parse(raw) as AgentConfig;
    for (const p of cfg.profiles ?? []) profiles.set(p.id, p);
    for (const l of cfg.launchers ?? []) launchers.push(l);
  } catch {
    // 設定不存在或格式錯誤時，靜默沿用內建。
  }
}

export function getProfile(id: string | null | undefined): AgentProfile {
  if (id && profiles.has(id)) return profiles.get(id)!;
  return GENERIC_PROFILE;
}

export function listLaunchers(): AgentLauncher[] {
  return launchers;
}

/** 從輸出被動偵測 agent（供在 shell 內手動啟動的情形）。 */
export function detectProfile(text: string): AgentProfile | null {
  for (const p of profiles.values()) {
    if (!p.detectOutput) continue;
    try {
      if (new RegExp(p.detectOutput, "i").test(text)) return p;
    } catch {
      // 無效 regex 忽略
    }
  }
  return null;
}
