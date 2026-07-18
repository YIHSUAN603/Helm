// 清單鍵盤導覽（roving focus）的測試：handleListKey 只碰
// querySelectorAll / document.activeElement / focus()，以最小 stub 模擬。
// 執行：node --experimental-strip-types tests/list-nav.test.ts
import assert from "node:assert";
import { focusNearestItem, handleListKey } from "../src/focus/listNav.ts";

let passed = 0;
function check(name: string, cond: boolean) {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
  console.log(`  ok - ${name}`);
}

let focused: object | null = null;
const makeItem = (label: string) => {
  const item = {
    label,
    focus: () => {
      focused = item;
    },
  };
  return item;
};
const items = [makeItem("a"), makeItem("b"), makeItem("c")];
const container = {
  querySelectorAll: () => items,
} as unknown as HTMLElement;
const emptyContainer = {
  querySelectorAll: () => [],
} as unknown as HTMLElement;
(globalThis as { document?: unknown }).document = {
  get activeElement() {
    return focused;
  },
};

check("container 為 null 時不處理", handleListKey("ArrowDown", null, ".x") === false);
check("沒有項目時不處理", handleListKey("ArrowDown", emptyContainer, ".x") === false);
check("非導覽鍵不處理", handleListKey("Enter", container, ".x") === false);

focused = null;
check(
  "無焦點時 ArrowDown 聚焦第一項",
  handleListKey("ArrowDown", container, ".x") === true && focused === items[0],
);
check(
  "ArrowDown 移到下一項",
  handleListKey("ArrowDown", container, ".x") === true && focused === items[1],
);
focused = items[2];
check(
  "ArrowDown 從最後一項繞回第一項",
  handleListKey("ArrowDown", container, ".x") === true && focused === items[0],
);
focused = null;
check(
  "無焦點時 ArrowUp 聚焦最後一項",
  handleListKey("ArrowUp", container, ".x") === true && focused === items[2],
);
check(
  "ArrowUp 移到上一項",
  handleListKey("ArrowUp", container, ".x") === true && focused === items[1],
);
focused = items[0];
check(
  "ArrowUp 從第一項繞到最後一項",
  handleListKey("ArrowUp", container, ".x") === true && focused === items[2],
);
check("Home 聚焦第一項", handleListKey("Home", container, ".x") === true && focused === items[0]);
check("End 聚焦最後一項", handleListKey("End", container, ".x") === true && focused === items[2]);

// vim 別名:j/k = ↓/↑,g/G = Home/End。
focused = items[0];
check("j 移到下一項", handleListKey("j", container, ".x") === true && focused === items[1]);
check("k 移到上一項", handleListKey("k", container, ".x") === true && focused === items[0]);
focused = items[2];
check("g 聚焦第一項", handleListKey("g", container, ".x") === true && focused === items[0]);
check("G 聚焦最後一項", handleListKey("G", container, ".x") === true && focused === items[2]);
check("非別名字元不處理", handleListKey("m", container, ".x") === false);

// focusNearestItem：焦點不在清單項目上（如 workspace 標頭）時，從該元素的
// 文件位置往下/往上接到最近的項目。stub 以整體文件順序 order 推 bitmask。
const POSITION_FOLLOWING = 4;
const POSITION_PRECEDING = 2;
const makeNode = (order: number) => {
  const node = {
    order,
    focus: () => {
      focused = node;
    },
    compareDocumentPosition: (other: { order: number }) =>
      other.order > order ? POSITION_FOLLOWING : other.order < order ? POSITION_PRECEDING : 0,
  };
  return node;
};
// 文件順序：header0(0) item0(1) header1(2) item1(3) item2(4)
const [header0, item0, header1, item1, item2] = [0, 1, 2, 3, 4].map(makeNode);
const navItems = [item0, item1, item2];
const navContainer = {
  querySelectorAll: () => navItems,
} as unknown as HTMLElement;
const asEl = (n: object) => n as unknown as HTMLElement;

check(
  "標頭往下接到其後最近的項目",
  focusNearestItem(asEl(header1), navContainer, ".x", 1) === true && focused === item1,
);
check(
  "標頭往上接到其前最近的項目",
  focusNearestItem(asEl(header1), navContainer, ".x", -1) === true && focused === item0,
);
check(
  "最後一項之後往下 wrap 到第一項",
  focusNearestItem(asEl(item2), navContainer, ".x", 1) === true && focused === item0,
);
check(
  "第一項之前往上 wrap 到最後一項",
  focusNearestItem(asEl(header0), navContainer, ".x", -1) === true && focused === item2,
);
check("container 為 null 時不處理", focusNearestItem(asEl(header0), null, ".x", 1) === false);
check(
  "沒有項目時不處理",
  focusNearestItem(asEl(header0), emptyContainer, ".x", 1) === false,
);

console.log(`list-nav: ${passed} checks passed`);
