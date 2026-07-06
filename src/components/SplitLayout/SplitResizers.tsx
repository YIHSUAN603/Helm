// split 版面的分隔線 overlay：依樹算出的幾何渲染，pointer 拖曳調整 ratio。
// 雙擊重設 0.5。
// 鍵盤：Tab 聚焦分隔線後，方向鍵微調 ratio、Enter 重設 0.5。
import { useRef, useState } from "react";
import { useLayoutStore, MIN_PANE_W, MIN_PANE_H } from "../../store/layout";
import {
  MIN_RATIO,
  MAX_RATIO,
  type ResizerGeom,
} from "../../store/layoutTree";
import "./SplitResizers.css";

export function SplitResizers({ resizers }: { resizers: ResizerGeom[] }) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const onPointerDown = (e: React.PointerEvent, r: ResizerGeom) => {
    e.preventDefault();
    // 以 terminal-area 的 px 尺寸（拖曳期間固定）把游標位置直接映射成 ratio。
    const area = areaRef.current?.parentElement;
    if (!area) return;
    const areaRect = area.getBoundingClientRect();
    const horizontal = r.dir === "row";
    const startPx = horizontal
      ? areaRect.left + (r.splitRect.left / 100) * areaRect.width
      : areaRect.top + (r.splitRect.top / 100) * areaRect.height;
    const extentPx = horizontal
      ? (r.splitRect.width / 100) * areaRect.width
      : (r.splitRect.height / 100) * areaRect.height;
    if (extentPx <= 0) return;
    // 兩側都要容得下最小 pane 尺寸；split 本身太小時退回全域 clamp。
    const minPane = horizontal ? MIN_PANE_W : MIN_PANE_H;
    let lo = Math.max(MIN_RATIO, minPane / extentPx);
    let hi = Math.min(MAX_RATIO, 1 - minPane / extentPx);
    if (lo > hi) {
      lo = MIN_RATIO;
      hi = MAX_RATIO;
    }

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    setDraggingId(r.splitId);
    document.body.classList.add(
      "pane-resizing",
      horizontal ? "pane-resizing-row" : "pane-resizing-column",
    );
    const layout = useLayoutStore.getState();

    const ratioAt = (ev: PointerEvent) => {
      const pos = horizontal ? ev.clientX : ev.clientY;
      return Math.min(hi, Math.max(lo, (pos - startPx) / extentPx));
    };
    const onMove = (ev: PointerEvent) => {
      layout.setRatio(r.splitId, ratioAt(ev));
    };
    const onUp = (ev: PointerEvent) => {
      layout.setRatio(r.splitId, ratioAt(ev));
      cleanup();
    };
    const cleanup = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
      document.body.classList.remove(
        "pane-resizing",
        "pane-resizing-row",
        "pane-resizing-column",
      );
      setDraggingId(null);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  };

  // 鍵盤微調：分隔線方向對應的箭頭 ±KEY_STEP，Enter 重設 0.5。
  const KEY_STEP = 0.02;
  const keyDelta = (key: string, dir: string): number | null => {
    if (dir === "row") {
      if (key === "ArrowLeft") return -KEY_STEP;
      if (key === "ArrowRight") return KEY_STEP;
    } else {
      if (key === "ArrowUp") return -KEY_STEP;
      if (key === "ArrowDown") return KEY_STEP;
    }
    return null;
  };
  const onKeyDown = (e: React.KeyboardEvent, r: ResizerGeom) => {
    const layout = useLayoutStore.getState();
    const delta = keyDelta(e.key, r.dir);
    if (delta !== null) {
      e.preventDefault();
      layout.setRatio(r.splitId, r.ratio + delta);
    } else if (e.key === "Enter") {
      e.preventDefault();
      layout.setRatio(r.splitId, 0.5);
    }
  };

  return (
    <div ref={areaRef} className="split-resizers">
      {resizers.map((r) => (
        <div
          key={r.splitId}
          className={`split-resizer ${r.dir} ${draggingId === r.splitId ? "dragging" : ""}`}
          role="separator"
          tabIndex={0}
          aria-orientation={r.dir === "row" ? "vertical" : "horizontal"}
          style={{
            top: `${r.rect.top}%`,
            left: `${r.rect.left}%`,
            width: r.dir === "row" ? undefined : `${r.rect.width}%`,
            height: r.dir === "row" ? `${r.rect.height}%` : undefined,
          }}
          onPointerDown={(e) => onPointerDown(e, r)}
          onKeyDown={(e) => onKeyDown(e, r)}
          onDoubleClick={() =>
            useLayoutStore.getState().setRatio(r.splitId, 0.5)
          }
        />
      ))}
    </div>
  );
}
