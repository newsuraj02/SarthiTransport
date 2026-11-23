// DEEP LINKS (owner 2026-11-13: "2 deep links: /customer and /driver ... customer sees only customer, driver only driver"). The "where did they come from" lead tracking that used to
// live here (lead source on the new account, Admin -> Leads) was REMOVED 2026-11-23 (owner: "it doesnt actually help in anything"): the links only choose the role now.
// Pure (no React, no Firebase) so the invariants can run it.
//
//  - https://<site>/customer and /driver are the two entry links (a "?src=..." / utm tag on them is simply ignored).
//  - Inside the installed app a link LOCKS the phone to that role (the other role's buttons are never shown). In a plain Android browser the link sends the person to the Play Store
//    with the role in the Play "referrer" (read on first launch by the native build, see docs/SYSTEM_CONTRACTS.md N20).

export const ENTRY_ROLES = ["customer", "driver"];
export const PLAY_PACKAGE = "com.apnatransport.app";

// "/customer", "/driver/", "/customer/anything" -> role; anything else -> null.
export function roleFromPath(pathname) {
  const m = /^\/(customer|driver)(\/|$)/i.exec(String(pathname || ""));
  return m ? m[1].toLowerCase() : null;
}

// -> { role } or null when the URL is not an entry link.
export function parseEntryLink(pathname) {
  const role = roleFromPath(pathname);
  return role ? { role } : null;
}

// Same thing from a full URL (the app's `appUrlOpen` event gives one).
export function parseEntryUrl(url) {
  try { return parseEntryLink(new URL(String(url)).pathname); } catch { return null; }
}

// The Play Store URL a browser visitor is sent to; the referrer carries the role (Play passes it to the app on first launch).
export function playStoreUrlFor(entry, base = `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`) {
  if (!entry) return base;
  return `${base}&referrer=${encodeURIComponent(`role=${entry.role}`)}`;
}

// Parse a Play install referrer string back ("role=customer") -> { role }, or null.
export function parseReferrer(referrer) {
  const role = String(new URLSearchParams(String(referrer || "")).get("role") || "").replace(/[^\w]/g, "").toLowerCase();
  return ENTRY_ROLES.includes(role) ? { role } : null;
}
