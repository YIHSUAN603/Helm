import type { PlanUsage } from "./hookEvents";

/** Codex rollout token_count.rate_limits; never substitute context usage. */
export function parseCodexPlanUsage(value: unknown): PlanUsage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const limits = value as Record<string, unknown>;
  if (limits.limit_id !== undefined && limits.limit_id !== "codex") return undefined;
  const out: PlanUsage = {};
  for (const key of ["primary", "secondary"]) {
    const window = limits[key];
    if (!window || typeof window !== "object") continue;
    const w = window as Record<string, unknown>;
    if (typeof w.used_percent !== "number" || !Number.isFinite(w.used_percent)) continue;
    const left = Math.max(0, Math.min(100, 100 - w.used_percent));
    const reset = typeof w.resets_at === "number" && Number.isFinite(w.resets_at) ? w.resets_at : undefined;
    if (w.window_minutes === 300) {
      out.fiveHourLeftPercent = left;
      out.fiveHourResetsAt = reset;
    } else if (w.window_minutes === 10080) {
      out.sevenDayLeftPercent = left;
      out.sevenDayResetsAt = reset;
    }
  }
  return out.fiveHourLeftPercent !== undefined || out.sevenDayLeftPercent !== undefined ? out : undefined;
}
