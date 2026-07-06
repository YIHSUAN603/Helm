// Roving focus for vertical lists / menus, driven by the live DOM
// (no index state to keep in sync with dynamic lists).

/**
 * Move focus among the container's items for ArrowUp/ArrowDown/Home/End.
 * Returns true when the key was handled (caller should preventDefault).
 */
export function handleListKey(
  key: string,
  container: HTMLElement | null,
  itemSelector: string,
): boolean {
  if (!container) return false;
  const items = [...container.querySelectorAll<HTMLElement>(itemSelector)];
  if (items.length === 0) return false;
  const idx = items.indexOf(document.activeElement as HTMLElement);
  let next: number;
  if (key === "ArrowDown") {
    next = idx < 0 ? 0 : (idx + 1) % items.length;
  } else if (key === "ArrowUp") {
    next = idx < 0 ? items.length - 1 : (idx - 1 + items.length) % items.length;
  } else if (key === "Home") {
    next = 0;
  } else if (key === "End") {
    next = items.length - 1;
  } else {
    return false;
  }
  items[next].focus();
  return true;
}
