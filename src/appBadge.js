// LAUNCHER-ICON BADGE (owner 2026-11-25: "I want the notification (n) to appear on the app logo ... Announcement / notice, New load, Driver KYC incomplete, Alert,
// Current / Advance ride, Bookings, Earning, Wallet").
//
// ONE shared file. The number on the phone's launcher icon can only be set by a native plugin (@capawesome/capacitor-badge, Android launcher badges), which ships with the NEXT
// native build (`cap sync` in the CI build wires it into Gradle). Until that build is installed `badgeAvailable()` is false and nothing here does anything: the installed app
// looks and behaves exactly as it did. The count is worked out IN THE APP from data it already holds (nothing is added to the server, no push is changed, the frozen ring / GPS
// files are not touched) so it updates while the app is open or running in the background; it cannot change while the app is fully closed (that needs the server to send the
// number inside each push = an edit of the frozen ring files, NOT done).
import { Capacitor } from "@capacitor/core";
import { Badge } from "@capawesome/capacitor-badge";
import { useEffect } from "react";

// parts = { announcements, newLoads, kycIncomplete, alerts, rides, bookings, earnings, wallet } -- each a non-negative number (a missing one counts 0). Pure, tested.
export function badgeTotal(parts) {
  let total = 0;
  for (const v of Object.values(parts || {})) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) total += Math.floor(n);
  }
  return Math.min(total, 999);
}

let availPromise = null;
// true only inside the installed app AND only when this build has the plugin AND the phone's launcher supports badges. Asked once.
export function badgeAvailable() {
  if (!availPromise) {
    availPromise = (async () => {
      try {
        if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("Badge")) return false;
        const r = await Badge.isSupported();
        return !!(r && r.isSupported);
      } catch { return false; }
    })();
  }
  return availPromise;
}

let lastSet = null;
export async function setAppBadge(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n === lastSet) return;
  try {
    if (!(await badgeAvailable())) return;
    lastSet = n;
    if (n > 0) await Badge.set({ count: n }); else await Badge.clear();
  } catch { lastSet = null; /* a launcher that refuses must never break the app */ }
}

// Mount once in each signed-in app; the badge follows `count` and is cleared when that app is left (logout / role change).
export function useAppBadge(count) {
  useEffect(() => { setAppBadge(count); }, [count]);
  useEffect(() => () => { setAppBadge(0); }, []);
}
