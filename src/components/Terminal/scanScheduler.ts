/** 輸出合併掃描；清除提示需要確認時，即使 PTY 已安靜也會補掃描。 */
export function createScanScheduler(scan: () => boolean | void, confirmDelay: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const schedule = (delay: number) => {
    cancel();
    timer = setTimeout(() => {
      timer = undefined;
      if (scan()) schedule(confirmDelay);
    }, delay);
  };
  return { schedule, cancel };
}
