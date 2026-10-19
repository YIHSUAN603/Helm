/**
 * 輸出合併掃描；清除提示需要確認時，即使 PTY 已安靜也會補掃描。
 *
 * 合併方式是 trailing debounce 加上 maxWait：持續有輸出時，距離這一輪第一次
 * schedule 滿 maxWait 就照樣掃一次。純 debounce 不夠 —— Codex / Claude Code
 * 工作中的 spinner 約每 100ms 重繪一次，比 debounce 間隔還短，於是整個回合
 * 一次都不會掃描，燈號停在回合開始前的狀態（通常是上一回合的 done，綠燈）。
 * 終端標題的忙碌訊號也只在掃描時才併入 deriveState，同樣被餓死。
 *
 * `now` 只為了讓測試能注入時鐘。
 */
export function createScanScheduler(
  scan: () => boolean | void,
  confirmDelay: number,
  now: () => number = Date.now,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // 這一輪最晚必須掃描的時間點；第一次 schedule 時決定，掃描或 cancel 後清掉。
  let deadline: number | undefined;
  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    deadline = undefined;
  };
  const schedule = (delay: number, maxWait = Infinity) => {
    const t = now();
    if (deadline === undefined) deadline = t + maxWait;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(
      () => {
        timer = undefined;
        deadline = undefined;
        if (scan()) schedule(confirmDelay);
      },
      Math.max(0, Math.min(delay, deadline - t)),
    );
  };
  return { schedule, cancel };
}
