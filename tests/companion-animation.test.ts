// Companion sprite sheet 規格測試：格式與 Codex 寵物相同，列號 / 幀數是格式的一部分。
// Run: node --experimental-strip-types tests/companion-animation.test.ts
import assert from "node:assert";
import {
  FRAME_MS,
  PET_ANIMS,
  PET_SHEET,
  animCycleMs,
  LOOK_AT_YOU,
  lookAngle,
  lookCell,
  sheetRows,
  spriteGeometry,
  type PetAnim,
} from "../src/companion/petAnimation.ts";

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
}

// 格式：8 欄 × 9 列、每格 192×208，整張 1536×1872
{
  check("寬 = 欄 × 格寬", PET_SHEET.cols * PET_SHEET.cellWidth === PET_SHEET.width);
  check("高 = 列 × 格高", PET_SHEET.rows * PET_SHEET.cellHeight === PET_SHEET.height);
  check("1536×1872", PET_SHEET.width === 1536 && PET_SHEET.height === 1872);
}

// 九段動畫各佔一列、列號不重複、幀數不超過欄數
{
  const anims = Object.keys(PET_ANIMS) as PetAnim[];
  const rows = anims.map((a) => PET_ANIMS[a].row);
  check("九段動畫", anims.length === 9);
  check("列號 0–8 各一次", [...rows].sort((a, b) => a - b).join() === "0,1,2,3,4,5,6,7,8");
  check("幀數 ≤ 8", anims.every((a) => PET_ANIMS[a].frames >= 1 && PET_ANIMS[a].frames <= 8));
  check("idle 第 0 列 6 幀", PET_ANIMS.idle.row === 0 && PET_ANIMS.idle.frames === 6);
  check("review 第 8 列 6 幀", PET_ANIMS.review.row === 8 && PET_ANIMS.review.frames === 6);
  check("waving 4 幀", PET_ANIMS.waving.frames === 4);
}

// 播放時間：速度越快越短，非法速度退回 1×
{
  check("1× = 幀數 × FRAME_MS", animCycleMs("idle") === 6 * FRAME_MS);
  check("2× 減半", animCycleMs("idle", 2) === 3 * FRAME_MS);
  check("0.5× 加倍", animCycleMs("idle", 0.5) === 12 * FRAME_MS);
  check("0 速度退回 1×", animCycleMs("idle", 0) === animCycleMs("idle"));
}

// 幾何：依顯示高度等比縮放
{
  const g = spriteGeometry("waiting", 104); // 208 的一半
  check("格寬等比", g.cellWidth === 96);
  check("整張縮放", g.sheetWidth === 768 && g.sheetHeight === 936);
  check("選第 6 列", g.offsetY === -6 * 104);
  check("走完 6 格", g.travelX === -6 * 96);
}

// 兩種 sheet 尺寸：9 列與多兩列轉頭的擴充版
{
  check("1872 → 9 列", sheetRows(1872) === 9);
  check("2288 → 11 列", sheetRows(2288) === 11);
  check("其他尺寸 → null", sheetRows(2000) === null);
  check("擴充版整張高度", spriteGeometry("idle", 104, 11).sheetHeight === 11 * 104);
}

// 轉頭：正上方 0°、順時針；16 個方向分兩列
{
  check("正上方 0°", lookAngle(0, -10) === 0);
  check("正右方 90°", lookAngle(10, 0) === 90);
  check("正下方 180°", lookAngle(0, 10) === 180);
  check("正左方 270°", lookAngle(-10, 0) === 270);
  check("0° → 第 9 列第 0 格", lookCell(0).row === 9 && lookCell(0).col === 0);
  check("90° → 第 9 列第 4 格", lookCell(90).row === 9 && lookCell(90).col === 4);
  check("180° → 第 10 列第 0 格", lookCell(LOOK_AT_YOU).row === 10 && lookCell(LOOK_AT_YOU).col === 0);
  check("337.5° → 第 10 列第 7 格", lookCell(337.5).row === 10 && lookCell(337.5).col === 7);
  check("350° 四捨五入回 0°", lookCell(350).row === 9 && lookCell(350).col === 0);
  check("負角度也正確", lookCell(-90).row === 10 && lookCell(-90).col === 4);
  check("左下 → 第 10 列", lookCell(lookAngle(-10, 10)).row === 10);
}

console.log(`companion-animation: ${passed} checks passed`);
