// ADMIN LIST SEARCH (owner 2026-11-23: "add a search bar to every list in the Admin app that contains more than 20 entities like Install: KYC complete, Install: KYC
// Incomplete, Uninstall, New registration"). Pure helpers, no React: the rule "a list longer than LIST_SEARCH_MIN gets a search bar" and the matching live HERE, so
// every Admin list uses the same threshold and the same matching (and one invariant can run them for real).
export const LIST_SEARCH_MIN = 20;

// More than 20 entries -> the list gets a search bar (20 or fewer: no bar, the list is short enough to read).
export const needsListSearch = (count) => Number(count) > LIST_SEARCH_MIN;

const lower = (v) => String(v == null ? "" : v).toLowerCase();
const compact = (s) => s.replace(/[\s\-+().,/]/g, "");

// Every word typed must be found somewhere in the entry's text (name, mobile, vehicle number ...). Spaces / dashes are ignored on both sides, so "mh 12 ab" finds MH12AB1234
// and "98765 43210" finds 9876543210. An empty query matches everything.
export function matchesQuery(query, haystack) {
  const q = lower(query).trim();
  if (!q) return true;
  const hay = lower(haystack);
  const hayCompact = compact(hay);
  return q.split(/\s+/).every((tok) => hay.includes(tok) || hayCompact.includes(compact(tok)));
}

// Keeps the entries that match; with no query (or a short list that has no bar) the list is returned as it is.
export function filterByQuery(items, query, textOf) {
  const list = items || [];
  if (!lower(query).trim()) return list;
  return list.filter((it) => matchesQuery(query, textOf(it)));
}

// What a driver / customer entry is searched by: name, mobile, vehicle number, vehicle name.
export function personSearchText(p) {
  if (!p) return "";
  const spec = p.vehicleSpec || {};
  return [p.name, p.mobile, p.id, spec.vehicleNumber, spec.type, p.firmName, p.vehicleNumber].filter(Boolean).join(" ");
}

// What a booking / trip entry is searched by: both people, their mobiles, pickup, drop, status.
export function bookingSearchText(b) {
  if (!b) return "";
  return [b.customerName, b.customerMobile, b.driverName, b.driverMobile, b.pickup, b.drop, b.status, b.scheduledFor, b.vehicleNumber].filter(Boolean).join(" ");
}
