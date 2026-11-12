// Admin Bookings groups (owner 2026-11-12, from the developer requirements document): every LIVE booking (not Completed / Cancelled) belongs to exactly one of
// four groups -- Current, Current Return, Advance, Advance Return. "Advance" = the booking carries `scheduledFor`; "Return" = the customer ticked Round trip
// (`returnTrip`). Pure functions, no React, so the invariants can run them.

export const BOOKING_GROUP_KEYS = ["current", "currentReturn", "advance", "advanceReturn"];

export function bookingGroupKey(b) {
  const advance = !!(b && b.scheduledFor);
  const ret = !!(b && b.returnTrip);
  return advance ? (ret ? "advanceReturn" : "advance") : (ret ? "currentReturn" : "current");
}

export function isLiveBooking(b) {
  return !!b && b.status !== "Completed" && b.status !== "Cancelled";
}

const createdMs = (b) => (b && b.createdAt && typeof b.createdAt.toMillis === "function" ? b.createdAt.toMillis() : Number(b && b.createdAt) || 0);

// -> { current: [...], currentReturn: [...], advance: [...], advanceReturn: [...] }, newest booking first in each group.
export function groupLiveBookings(bookings) {
  const out = { current: [], currentReturn: [], advance: [], advanceReturn: [] };
  (bookings || []).forEach((b) => { if (isLiveBooking(b)) out[bookingGroupKey(b)].push(b); });
  BOOKING_GROUP_KEYS.forEach((k) => out[k].sort((a, c) => createdMs(c) - createdMs(a)));
  return out;
}
