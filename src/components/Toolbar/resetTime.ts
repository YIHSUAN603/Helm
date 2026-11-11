// 方案額度重置時間的 tooltip 文字（純函式，node 測試）。
// 24 小時內只顯示時分；更遠的（週額度）一定要帶日期，否則「下午03:38 重置」
// 看起來像今天、甚至像已經過去的時間。

const DAY_MS = 24 * 60 * 60 * 1000;

export function fmtResetTime(
  unixSec: number | undefined,
  nowMs: number = Date.now(),
  locales?: string | string[],
): string | undefined {
  if (unixSec === undefined || !Number.isFinite(unixSec)) return undefined;
  const at = new Date(unixSec * 1000);
  const time: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  if (at.getTime() - nowMs < DAY_MS) return at.toLocaleTimeString(locales, time);
  return at.toLocaleString(locales, { month: "numeric", day: "numeric", ...time });
}
