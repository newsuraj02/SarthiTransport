// ADMIN -> SETTINGS -> the common "More settings" box (owner 2026-11-25: "3 needs to have separate dropdown for each in a common box; 4 and 5 under the dropdown").
// ONE row = a header button (title + optional small badge + chevron) that opens / closes its content. The Settings screen keeps ONE `openRow` id, so only one row is open at a time.
import React from "react";
import { ChevronDown } from "lucide-react";
import { C } from "./App.jsx";

export default function SettingsDropdown({ id, title, badge = null, open, onToggle, children }) {
  return (
    <div data-settings-dropdown={id} data-open={open ? "true" : "false"} className="rounded-lg mb-2" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
      <button type="button" data-settings-dropdown-head={id} onClick={onToggle} aria-expanded={open ? "true" : "false"} className="w-full flex items-center justify-between gap-2 p-3 text-left">
        <span className="text-xs font-extrabold break-words min-w-0" style={{ color: C.ink }}>{title}</span>
        <span className="flex items-center gap-2 shrink-0">
          {badge}
          <ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : "none", color: C.inkSoft }} />
        </span>
      </button>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  );
}
