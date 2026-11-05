// 寵物關掉後的「偷看」彩蛋：偶爾在 agent 回合完成時，從甲板下緣探出頭看你
// 一下又縮回去（純函式，node 測試可直接載入）。
//
// 使用者是自己把寵物關掉的，所以這裡每一條規則都在壓低頻率：關掉後先給一段
// 寬限期、出現要碰機率、有冷卻、每次啟動有上限；有人在等批准或出錯時更是
// 完全不出現 —— 那時畫面上的注意力屬於 agent，不屬於彩蛋。

/** 關掉後多久內絕不出現：剛關掉就冒出來會像是不聽話。 */
export const PEEK_GRACE_MS = 30 * 60_000;
/** 兩次偷看之間至少隔多久。 */
export const PEEK_COOLDOWN_MS = 2 * 60 * 60_000;
/** 每次啟動最多幾次。 */
export const PEEK_MAX_PER_LAUNCH = 2;
/** 每個 done 事件觸發的機率。 */
export const PEEK_CHANCE = 0.15;

/** 冒出來、停住、縮回去各多久。縮回比冒出快：看起來比較害羞。 */
export const PEEK_RISE_MS = 400;
export const PEEK_HOLD_MS = 1_500;
export const PEEK_DUCK_MS = 250;
/** 被游標碰到時縮回去的速度：被抓包了，躲得更快。 */
export const PEEK_CAUGHT_MS = 140;
export const PEEK_TOTAL_MS = PEEK_RISE_MS + PEEK_HOLD_MS + PEEK_DUCK_MS;

/** 偷看時的顯示高度（比平常的 30px 大，只露半格也看得清楚）。 */
export const PEEK_HEIGHT = 40;
/** 露出格子上方多少比例（頭部）；其餘被甲板下緣切掉。以內建海鷗校準。 */
export const PEEK_REVEAL = 0.5;

export interface PeekContext {
  now: number;
  /** 已解鎖。 */
  unlocked: boolean;
  /** 寵物開著（開著就不需要偷看）。 */
  enabled: boolean;
  /** 使用者是否允許偷看（設定裡的「偶爾偷看」）。 */
  peekAllowed: boolean;
  /** 寵物是什麼時候被關掉的（本次啟動已是關閉狀態 → 啟動時間）。 */
  disabledAt: number | null;
  lastPeekAt: number | null;
  peeksThisLaunch: number;
  waiting: boolean;
  anyError: boolean;
  reducedMotion: boolean;
}

/** 這個 done 事件要不要讓牠偷看一下。rng 只在其餘條件都通過時才抽。 */
export function shouldPeek(ctx: PeekContext, rng: () => number): boolean {
  if (!ctx.unlocked || ctx.enabled || !ctx.peekAllowed) return false;
  if (ctx.reducedMotion || ctx.waiting || ctx.anyError) return false;
  if (ctx.disabledAt === null || ctx.now - ctx.disabledAt < PEEK_GRACE_MS) return false;
  if (ctx.lastPeekAt !== null && ctx.now - ctx.lastPeekAt < PEEK_COOLDOWN_MS) return false;
  if (ctx.peeksThisLaunch >= PEEK_MAX_PER_LAUNCH) return false;
  return rng() < PEEK_CHANCE;
}

/** 在甲板中段隨機挑一個位置（0–1），避開兩端貼著 fleet chip 與用量表。 */
export function pickPeekX(rng: () => number): number {
  return 0.15 + rng() * 0.7;
}
