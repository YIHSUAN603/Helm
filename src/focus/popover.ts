// Toolbar popovers (notification center, changed files): non-modal panels that
// still have to be easy to get rid of. Two rules, shared by both:
//  - opening moves focus into the panel, so Esc (handled by the panel's own
//    handleDismissKey) works no matter how it was opened — a toolbar click
//    otherwise leaves focus on the button, where Esc reaches nothing;
//  - a pointerdown anywhere outside closes it, except on its own toggle button
//    (whose click would immediately reopen it) and inside the diff overlay,
//    which the files panel opens and must outlive.
import { useEffect, useRef, type RefObject } from "react";
import { focusRegion, type FocusRegion } from "./focusUtils";

/** Toolbar buttons carry `data-popover-toggle="<region>"` to mark themselves. */
const TOGGLE_ATTR = "data-popover-toggle";

const KEEP_OPEN_SELECTOR = ".diff-overlay";

export function usePopoverDismiss(
  ref: RefObject<HTMLElement | null>,
  region: FocusRegion,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!ref.current?.contains(document.activeElement)) focusRegion(region);
  }, [ref, region]);

  // Latest onClose without re-subscribing the window listener every render.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target || ref.current?.contains(target)) return;
      if (target.closest(`[${TOGGLE_ATTR}="${region}"], ${KEEP_OPEN_SELECTOR}`)) return;
      closeRef.current();
    };
    // Capture phase: xterm stops propagation of the pointer events it handles.
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [ref, region]);
}
