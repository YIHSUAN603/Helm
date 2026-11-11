import { invoke } from "@tauri-apps/api/core";
import { parseCodexPlanUsage } from "../agents/codexUsage";

export async function codexPlanUsage() {
  return parseCodexPlanUsage(await invoke("codex_plan_usage"));
}
