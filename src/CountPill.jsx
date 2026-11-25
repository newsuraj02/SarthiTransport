// IN-APP NUMBER (owner 2026-11-25: "notification needs to be evident just like we add number outside, number needs to be inside the app too wherever the notification is").
// ONE small red pill used next to the menu item / button / tab that the launcher-icon number (src/appBadge.js) counts. Shows nothing for 0, so a screen with nothing waiting is unchanged.
import React from "react";

export default function CountPill({ n, className = "", color = "#FF2A2A" }) {
  const c = Math.floor(Number(n) || 0);
  if (c <= 0) return null;
  return (
    <span data-count-pill className={`inline-flex items-center justify-center rounded-full text-[10px] font-black text-white leading-none shrink-0 ${className}`}
      style={{ background: color, minWidth: 18, height: 18, padding: "0 5px" }}>{c > 99 ? "99+" : c}</span>
  );
}
