// Companion 的台詞庫：每句台詞帶著「什麼情境、幾級以上、哪個時段」的條件，
// 文字本身在 i18n（companion.line.*）。純函式，node 測試可直接載入。

export type LineContext =
  | "click"
  | "annoyed"
  | "flee"
  | "getUp"
  | "streak"
  | "startled"
  | "stillWaiting"
  | "stalled"
  | "sleepy"
  | "bedtime"
  | "welcomeBack"
  | "earlyBird"
  | "unlock"
  | "greeting";

export interface LineDef {
  key: string;
  ctx: LineContext;
  /** 親密度等級下限（含）；省略 = 1 級就有。 */
  minLevel?: number;
  /** 當地時間 [from, to) 點才會出現；省略 = 全天。 */
  hours?: [number, number];
}

function many(ctx: LineContext, n: number, minLevel?: number): LineDef[] {
  return Array.from({ length: n }, (_, i) => ({
    key: `companion.line.${ctx}.${i + 1}`,
    ctx,
    minLevel,
  }));
}

export const LINES: readonly LineDef[] = [
  ...many("click", 4),
  { key: "companion.line.click.morning", ctx: "click", minLevel: 2, hours: [5, 12] },
  { key: "companion.line.click.afternoon", ctx: "click", minLevel: 2, hours: [12, 18] },
  { key: "companion.line.click.evening", ctx: "click", minLevel: 2, hours: [18, 24] },
  { key: "companion.line.click.answered", ctx: "click", minLevel: 3 },
  { key: "companion.line.click.done", ctx: "click", minLevel: 3 },
  ...many("click", 2, 5).map((l, i) => ({ ...l, key: `companion.line.click.loyal${i + 1}` })),
  ...many("annoyed", 3),
  ...many("flee", 2),
  ...many("getUp", 3),
  ...many("streak", 3),
  ...many("startled", 3),
  ...many("stillWaiting", 3),
  ...many("stalled", 3),
  ...many("sleepy", 3),
  ...many("bedtime", 3),
  ...many("welcomeBack", 3),
  ...many("earlyBird", 2),
  ...many("unlock", 1),
  ...many("greeting", 2),
];

export interface LineEnv {
  level: number;
  hour: number;
}

/** 符合情境、等級與時段的候選台詞。 */
export function eligibleLines(ctx: LineContext, env: LineEnv): LineDef[] {
  return LINES.filter(
    (l) =>
      l.ctx === ctx &&
      (l.minLevel ?? 1) <= env.level &&
      (!l.hours || (env.hour >= l.hours[0] && env.hour < l.hours[1])),
  );
}

/**
 * 挑一句台詞的 i18n key；沒有候選時回 null。候選超過一句時排除上一句，
 * 避免同一句連續出現。rng 由呼叫端注入（測試用固定值重現）。
 */
export function pickLine(
  ctx: LineContext,
  env: LineEnv,
  lastKey: string | null,
  rng: () => number,
): string | null {
  let pool = eligibleLines(ctx, env);
  if (pool.length > 1 && lastKey) pool = pool.filter((l) => l.key !== lastKey);
  if (pool.length === 0) return null;
  const idx = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[idx].key;
}
