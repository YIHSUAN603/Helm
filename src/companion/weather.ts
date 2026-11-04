// 甲板天氣：寵物背後的氛圍層（純函式，時間由呼叫端注入；node 測試可直接載入）。
//
// 分工：寵物跟著你眼前的 session，天氣看整個 fleet —— 用餘光就能感覺其他
// session 的狀況。三條界線寫在這裡、由測試鎖住：
// 1. 有人在等批准時海面靜止、不出特效：那時畫面上唯一該動的是寵物的提醒。
// 2. 出錯只讓浪變碎，不做暴風雨（彩蛋不懲罰人），顏色也不變 —— 天氣永遠不用
//    狀態色（--c-red 等），免得被誤認成 Toolbar 上的警示 chip。
// 3. 天空不填色，只用點綴（星星、夕陽）表達時段，任何主題下 Toolbar 底色都不變。

export type Sky = "day" | "dusk" | "night";
export type Sea = "flat" | "swell" | "choppy";
export type WeatherFx = "arc" | "sparkle";

/** 長回合完成時的光弧、里程碑時的光點，各播多久。 */
export const FX_MS: Record<WeatherFx, number> = { arc: 6_000, sparkle: 2_500 };

export interface WeatherContext {
  now: number;
  /** 當地時間的小時（0–23）。 */
  hour: number;
  /** 整個 fleet 是否有人在等批准。 */
  waiting: boolean;
  /** 整個 fleet 忙碌（thinking / tool）的 agent 數。 */
  busyCount: number;
  /** 整個 fleet 是否有 session 停在 error。 */
  anyError: boolean;
  fx: { kind: WeatherFx; until: number } | null;
}

export interface Weather {
  sky: Sky;
  sea: Sea;
  /** 起伏的幅度，0–1：fleet 越忙浪越高（swell 時才有意義）。 */
  swell: number;
  /** 海面靜止、整體變淡（有人在等批准）。 */
  frozen: boolean;
  fx: WeatherFx | null;
}

/**
 * 時段：夜晚 19–5 點、黃昏 17–19 點、其餘白天。
 * 刻意不沿用寵物的「深夜」（0–5 點）：天黑了出星星，和寵物打瞌睡是兩回事。
 */
export function skyOf(hour: number): Sky {
  if (hour >= 19 || hour < 5) return "night";
  if (hour >= 17) return "dusk";
  return "day";
}

/** 1 個忙碌 agent 0.5，每多一個 +0.25，最多 1。 */
export function swellOf(busyCount: number): number {
  if (busyCount <= 0) return 0;
  return Math.min(1, 0.5 + 0.25 * (busyCount - 1));
}

export function pickWeather(ctx: WeatherContext): Weather {
  const sky = skyOf(ctx.hour);
  const sea: Sea = ctx.anyError ? "choppy" : ctx.busyCount > 0 ? "swell" : "flat";
  const swell = swellOf(ctx.busyCount);
  if (ctx.waiting) return { sky, sea, swell, frozen: true, fx: null };
  const fx = ctx.fx && ctx.now < ctx.fx.until ? ctx.fx.kind : null;
  return { sky, sea, swell, frozen: false, fx };
}
