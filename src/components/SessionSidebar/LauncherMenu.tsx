// Dropdown listing all launchers; shared by the sidebar's global "+" and
// each workspace's own "+". Fully arrow-navigable; Escape closes and hands
// focus back to the opener.
import { useEffect, useRef } from "react";
import { listLaunchers } from "../../agents/registry";
import { handleListKey } from "../../focus/listNav";
import type { AgentLauncher } from "../../agents/types";

interface LauncherMenuProps {
  onPick: (launcher: AgentLauncher) => void;
  onClose: (refocus: boolean) => void;
}

export function LauncherMenu({ onPick, onClose }: LauncherMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Focus the first item so the keyboard can pick straight away.
  useEffect(() => {
    menuRef.current?.querySelector("button")?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose(true);
    } else if (handleListKey(e.key, menuRef.current, "button")) {
      e.preventDefault();
    }
  };

  return (
    <>
      <div className="menu-backdrop" onClick={() => onClose(false)} />
      <div ref={menuRef} className="launcher-menu" role="menu" onKeyDown={onKeyDown}>
        {listLaunchers().map((l) => (
          <button key={l.label} role="menuitem" onClick={() => onPick(l)}>
            {l.label}
          </button>
        ))}
      </div>
    </>
  );
}
