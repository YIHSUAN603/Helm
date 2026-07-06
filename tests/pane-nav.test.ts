// 鍵盤 pane 導航/縮放純函式測試（不需 GUI / Tauri）。
// 執行：node --experimental-strip-types tests/pane-nav.test.ts
import assert from "node:assert";
import {
  nextPaneCyclic,
  nextPaneDirectional,
  resizeTarget,
  RESIZE_STEP,
} from "../src/commands/paneNav.ts";
import {
  computeLayout,
  leaf,
  splitLeaf,
  type LayoutNode,
  type SplitNode,
} from "../src/store/layoutTree.ts";

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
  console.log(`  ok - ${name}`);
}

function approx(a: number, b: number) {
  return Math.abs(a - b) < 1e-9;
}

// 建一棵 L 型三分割樹：左 s1 | 右（上 s2 / 下 s3）
function buildLTree(): LayoutNode {
  const l1 = leaf("s1");
  let t = splitLeaf(l1, l1.id, "row", "s2");
  const s2Leaf = (t as SplitNode).b;
  t = splitLeaf(t, s2Leaf.id, "column", "s3");
  return t;
}

// 方向導航：兩 pane 左右
{
  const l1 = leaf("s1");
  const t = splitLeaf(l1, l1.id, "row", "s2");
  const { leaves } = computeLayout(t);
  check("s1 → 右是 s2", nextPaneDirectional(leaves, "s1", "right") === "s2");
  check("s2 → 左是 s1", nextPaneDirectional(leaves, "s2", "left") === "s1");
  check("s1 → 左是邊界 null", nextPaneDirectional(leaves, "s1", "left") === null);
  check("s1 → 上是邊界 null", nextPaneDirectional(leaves, "s1", "up") === null);
  check("不存在的 session → null", nextPaneDirectional(leaves, "nope", "right") === null);
}

// 方向導航：L 型三 pane（左 s1 | 右上 s2 / 右下 s3）
{
  const { leaves } = computeLayout(buildLTree());
  check("s2 → 下是 s3", nextPaneDirectional(leaves, "s2", "down") === "s3");
  check("s3 → 上是 s2", nextPaneDirectional(leaves, "s3", "up") === "s2");
  check("s2 → 左是 s1", nextPaneDirectional(leaves, "s2", "left") === "s1");
  check("s3 → 左是 s1", nextPaneDirectional(leaves, "s3", "left") === "s1");
  // s1 往右：s2 與 s3 距離相同，取垂直重疊較大者（各半，取先比到較大者之一即可）
  const right = nextPaneDirectional(leaves, "s1", "right");
  check("s1 → 右是 s2 或 s3", right === "s2" || right === "s3");
  check("s2 → 右是邊界 null", nextPaneDirectional(leaves, "s2", "right") === null);
}

// 循環導航：閱讀順序（top 先、left 次），會繞回
{
  const { leaves } = computeLayout(buildLTree());
  // 順序：s1 (top0,left0) → s2 (top0,left50) → s3 (top50,left50)
  check("s1 的下一個是 s2", nextPaneCyclic(leaves, "s1") === "s2");
  check("s2 的下一個是 s3", nextPaneCyclic(leaves, "s2") === "s3");
  check("s3 繞回 s1", nextPaneCyclic(leaves, "s3") === "s1");
  const single = computeLayout(leaf("only")).leaves;
  check("單一 pane → null", nextPaneCyclic(single, "only") === null);
}

// 鍵盤縮放：找最近的同方向祖先 split，a 側加寬 = ratio 增、b 側加寬 = ratio 減
{
  const t = buildLTree() as SplitNode; // row split：a=s1、b=(column s2/s3)
  const rowId = t.id;
  const colId = (t.b as SplitNode).id;

  const grow1 = resizeTarget(t, "s1", "right");
  check("s1 加寬 → row split ratio 增", grow1?.splitId === rowId && approx(grow1.ratio, 0.5 + RESIZE_STEP));
  const shrink1 = resizeTarget(t, "s1", "left");
  check("s1 縮窄 → ratio 減", shrink1?.splitId === rowId && approx(shrink1.ratio, 0.5 - RESIZE_STEP));

  const grow2 = resizeTarget(t, "s2", "right");
  check("s2（b 側）加寬 → ratio 減", grow2?.splitId === rowId && approx(grow2.ratio, 0.5 - RESIZE_STEP));

  const grow2v = resizeTarget(t, "s2", "down");
  check("s2 加高 → column split（最近祖先）", grow2v?.splitId === colId && approx(grow2v.ratio, 0.5 + RESIZE_STEP));
  const grow3v = resizeTarget(t, "s3", "down");
  check("s3（b 側）加高 → column ratio 減", grow3v?.splitId === colId && approx(grow3v.ratio, 0.5 - RESIZE_STEP));

  check("s1 沒有 column 祖先 → null", resizeTarget(t, "s1", "down") === null);
  check("不存在的 session → null", resizeTarget(t, "nope", "right") === null);
}

// computeLayout 的 resizer 幾何帶 ratio（鍵盤微調基準）
{
  const l1 = leaf("s1");
  const t = splitLeaf(l1, l1.id, "row", "s2");
  const { resizers } = computeLayout(t);
  check("resizer 帶 ratio", resizers.length === 1 && approx(resizers[0].ratio, 0.5));
}

console.log(`\npane-nav: ${passed} checks passed`);
