// 側欄 hover 摘要卡的垂直定位（純函式，node 測試可直接載入）。
//
// 卡片對齊滑過的那一列的頂端；靠近視窗底部時往上推，讓整張卡留在畫面內。
// 卡片比視窗還高時貼齊頂端邊距 —— 寧可底部被裁，也不要連標題都看不到。

/** 卡片與視窗邊緣的最小距離（px）。 */
export const PEEK_MARGIN_PX = 8;

export function peekTop(rowTop: number, peekHeight: number, viewportHeight: number): number {
  const maxTop = viewportHeight - PEEK_MARGIN_PX - peekHeight;
  return Math.max(PEEK_MARGIN_PX, Math.min(rowTop, maxTop));
}
