// Companion 寵物的 sprite sheet 規格與動畫表（純資料 + 純函式，node 測試可直接載入）。
//
// 格式刻意與 Codex 的寵物相同：8 欄 × 9 列、每格 192×208、一列一段動畫。同一份
// 圖可以在兩邊通用，使用者不必為 Helm 另外畫一套。列號與幀數是格式的一部分，
// 改動等於宣告舊寵物全部失效，所以集中在這裡、由測試鎖住。
//
// 擴充版（v2）在下面多兩列「看向某處」：16 個方向，從正上方 0° 起順時針每
// 22.5° 一格（90° 朝右、180° 正對畫面、270° 朝左），第 9 列是 0°–157.5°、
// 第 10 列是 180°–337.5°。沒有這兩列的寵物照樣能用，只是不會轉頭。

export type PetAnim =
  | "idle"
  | "running-right"
  | "running-left"
  | "waving"
  | "jumping"
  | "failed"
  | "waiting"
  | "running"
  | "review";

export const PET_SHEET = {
  cols: 8,
  rows: 9,
  /** 擴充版多了兩列轉頭方向。 */
  lookRows: 11,
  cellWidth: 192,
  cellHeight: 208,
  width: 1536,
  height: 1872,
  lookHeight: 2288,
} as const;

/** 從圖片高度判斷有幾列；不是兩種合法尺寸之一時回 null。 */
export function sheetRows(height: number): number | null {
  if (height === PET_SHEET.height) return PET_SHEET.rows;
  if (height === PET_SHEET.lookHeight) return PET_SHEET.lookRows;
  return null;
}

/** 每段動畫在 sheet 上的列號與實際使用的幀數（其餘格子是透明的）。 */
export const PET_ANIMS: Record<PetAnim, { row: number; frames: number }> = {
  idle: { row: 0, frames: 6 },
  "running-right": { row: 1, frames: 8 },
  "running-left": { row: 2, frames: 8 },
  waving: { row: 3, frames: 4 },
  jumping: { row: 4, frames: 5 },
  failed: { row: 5, frames: 8 },
  waiting: { row: 6, frames: 6 },
  running: { row: 7, frames: 6 },
  review: { row: 8, frames: 6 },
};

/** 1.0× 速度下每一幀的時間。 */
export const FRAME_MS = 140;

/** 播完一輪的時間；speed 越大越快（stalled 用 0.5、忙碌的 fleet 用 >1）。 */
export function animCycleMs(anim: PetAnim, speed = 1): number {
  const safe = speed > 0 ? speed : 1;
  return Math.round((PET_ANIMS[anim].frames * FRAME_MS) / safe);
}

/**
 * 以顯示高度換算整張 sheet 的縮放後尺寸與這段動畫的列位移（px）。CSS 用
 * background-size 縮整張圖、background-position-y 選列、再用 steps() 沿 x 播放。
 */
export function spriteGeometry(anim: PetAnim, displayHeight: number, rows: number = PET_SHEET.rows) {
  const scale = displayHeight / PET_SHEET.cellHeight;
  const cellWidth = PET_SHEET.cellWidth * scale;
  const { row, frames } = PET_ANIMS[anim];
  return {
    cellWidth,
    cellHeight: displayHeight,
    sheetWidth: PET_SHEET.width * scale,
    sheetHeight: rows * displayHeight,
    offsetY: -row * displayHeight,
    // 播完這段動畫要走的水平距離：最後一幀的右緣，steps(frames) 會停在每格左緣。
    travelX: -frames * cellWidth,
    frames,
  };
}

// ---- 轉頭（只有擴充版 sheet 有）----

export const LOOK_DIRECTIONS = 16;
const LOOK_STEP = 360 / LOOK_DIRECTIONS;
/** 第一列轉頭方向在 sheet 上的列號。 */
const LOOK_FIRST_ROW = 9;

/**
 * 螢幕上的位移（目標 − 寵物中心）→ 角度：正上方 0°、順時針。螢幕 y 軸向下，
 * 所以「上」是 dy < 0。
 */
export function lookAngle(dx: number, dy: number): number {
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** 角度 → 最接近的方向格（列、欄）。 */
export function lookCell(angle: number): { row: number; col: number } {
  const idx = Math.round((((angle % 360) + 360) % 360) / LOOK_STEP) % LOOK_DIRECTIONS;
  return { row: LOOK_FIRST_ROW + Math.floor(idx / PET_SHEET.cols), col: idx % PET_SHEET.cols };
}

/** 正對畫面（看著你）：滑鼠停在寵物身上時用。 */
export const LOOK_AT_YOU = 180;
