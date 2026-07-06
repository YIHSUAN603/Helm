// Focus helpers shared by commands, the palette, and components.
// Regions are marked with data-focus-region so F6 can cycle between them;
// nothing here auto-refocuses on blur (that would fight other regions).

const REGION_ORDER = ["sidebar", "toolbar", "terminal", "approvals", "files"] as const;

export type FocusRegion = (typeof REGION_ORDER)[number];

const FOCUSABLE = 'button, input, select, [tabindex="0"]';

/** Focus the active pane's xterm hidden textarea (where typing goes). */
export function focusActiveTerminal(): void {
  const el = document.querySelector<HTMLElement>(
    '.pane[data-active="true"] .xterm-helper-textarea',
  );
  el?.focus();
}

function regionOf(el: Element | null): FocusRegion {
  const host = el?.closest<HTMLElement>("[data-focus-region]");
  const name = host?.dataset.focusRegion as FocusRegion | undefined;
  return name && REGION_ORDER.includes(name) ? name : "terminal";
}

/** The element that receives focus when a region is entered; null if region absent. */
function entryPoint(region: FocusRegion): HTMLElement | null {
  if (region === "terminal") {
    return document.querySelector<HTMLElement>(
      '.pane[data-active="true"] .xterm-helper-textarea',
    );
  }
  const host = document.querySelector<HTMLElement>(`[data-focus-region="${region}"]`);
  if (!host) return null;
  return (
    host.querySelector<HTMLElement>("[data-region-entry]") ??
    host.querySelector<HTMLElement>(FOCUSABLE)
  );
}

/** Move focus to the next/previous visible region (F6 / Shift+F6). */
export function cycleFocusRegion(step: 1 | -1): void {
  const n = REGION_ORDER.length;
  const idx = REGION_ORDER.indexOf(regionOf(document.activeElement));
  for (let i = 1; i <= n; i++) {
    const next = REGION_ORDER[(idx + step * i + n * i) % n];
    const el = entryPoint(next);
    if (el) {
      el.focus();
      return;
    }
  }
}
