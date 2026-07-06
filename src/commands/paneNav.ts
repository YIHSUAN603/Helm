// Keyboard pane navigation / resizing over the split layout tree
// (pure geometry, node-testable; consumes computeLayout() output).
import type { LayoutNode, RectPct, SplitDir, SplitNode } from "../store/layoutTree";

export type NavDir = "left" | "right" | "up" | "down";

/** Ratio nudge applied by one keyboard resize step. */
export const RESIZE_STEP = 0.04;

const EPS = 0.001;

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

/** Gap from cur's leading edge to r's near edge; null when r is not in that direction. */
function edgeDistance(cur: RectPct, r: RectPct, dir: NavDir): number | null {
  let d: number;
  if (dir === "right") {
    d = r.left - (cur.left + cur.width);
  } else if (dir === "left") {
    d = cur.left - (r.left + r.width);
  } else if (dir === "down") {
    d = r.top - (cur.top + cur.height);
  } else {
    d = cur.top - (r.top + r.height);
  }
  return d >= -EPS ? Math.max(0, d) : null;
}

/** Neighbor pane in a direction: nearest edge, then largest perpendicular overlap. */
export function nextPaneDirectional(
  leaves: Map<string, RectPct>,
  currentId: string,
  dir: NavDir,
): string | null {
  const cur = leaves.get(currentId);
  if (!cur) return null;
  const horizontal = dir === "left" || dir === "right";
  let best: { id: string; dist: number; ov: number } | null = null;
  for (const [id, r] of leaves) {
    if (id === currentId) continue;
    const dist = edgeDistance(cur, r, dir);
    if (dist === null) continue;
    const ov = horizontal
      ? overlap(cur.top, cur.top + cur.height, r.top, r.top + r.height)
      : overlap(cur.left, cur.left + cur.width, r.left, r.left + r.width);
    if (ov <= EPS) continue;
    const better =
      !best || dist < best.dist - EPS || (Math.abs(dist - best.dist) <= EPS && ov > best.ov);
    if (better) {
      best = { id, dist, ov };
    }
  }
  return best?.id ?? null;
}

/** Next pane in visual reading order (top, then left), wrapping around. */
export function nextPaneCyclic(
  leaves: Map<string, RectPct>,
  currentId: string,
): string | null {
  const ids = [...leaves.entries()]
    .sort((x, y) => x[1].top - y[1].top || x[1].left - y[1].left)
    .map(([id]) => id);
  if (ids.length < 2) return null;
  const idx = ids.indexOf(currentId);
  if (idx < 0) return ids[0];
  return ids[(idx + 1) % ids.length];
}

/**
 * Keyboard resize: grow the pane toward right/down, shrink toward left/up,
 * on the nearest ancestor split of the matching orientation.
 * Returns the split to adjust and its new (unclamped) ratio, or null when
 * the session has no such ancestor.
 */
export function resizeTarget(
  root: LayoutNode,
  sessionId: string,
  dir: NavDir,
): { splitId: string; ratio: number } | null {
  const want: SplitDir = dir === "left" || dir === "right" ? "row" : "column";
  const grow = dir === "right" || dir === "down";
  let result: { splitId: string; ratio: number } | null = null;
  // Walk down; the last matching-orientation split seen above the leaf is the nearest.
  const walk = (
    node: LayoutNode,
    anc: { split: SplitNode; inA: boolean } | null,
  ): boolean => {
    if (node.type === "leaf") {
      if (node.sessionId !== sessionId) return false;
      if (anc) {
        const sign = (grow ? 1 : -1) * (anc.inA ? 1 : -1);
        result = { splitId: anc.split.id, ratio: anc.split.ratio + sign * RESIZE_STEP };
      }
      return true;
    }
    const match = node.dir === want;
    return (
      walk(node.a, match ? { split: node, inA: true } : anc) ||
      walk(node.b, match ? { split: node, inA: false } : anc)
    );
  };
  walk(root, null);
  return result;
}
