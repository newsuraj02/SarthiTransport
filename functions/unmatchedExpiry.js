/**
 * UNMATCHED BOOKINGS EXPIRE AFTER ONE HOUR (owner 2026-11-25: "if a certain Current and Advance booking (Return included) has not received a ride for 1 hour,
 * then that trip is deleted permanently throughout the app (Admin, Driver and Customer)").
 *
 * "Has not received a ride" = still `AwaitingDriver` with nobody on it (no driver assigned, no driver's offer waiting). Current, Current Return, Advance and
 * Advance Return are all the same kind of booking (Advance = `scheduledFor`, Return = `returnTrip`), so one rule covers all four. The age is counted from when the
 * customer pressed Book (`createdAt`; `acceptedAt` is the same moment on an open booking). A booking with NO timestamp is never deleted (age unknown), and a
 * trip somebody has taken (Ongoing / Completed / Cancelled) is never touched. Pure, so it is testable without Firebase.
 */
const UNMATCHED_EXPIRY_MS = 60 * 60 * 1000;

const tsMs = (v) => {
  if (v && typeof v.toMillis === "function") return v.toMillis();
  if (v && typeof v.seconds === "number") return v.seconds * 1000;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
};

function bookingCreatedMs(b) {
  const a = tsMs(b && b.createdAt);
  return a != null ? a : tsMs(b && b.acceptedAt);
}

function isUnmatchedExpired(b, nowMs = Date.now()) {
  if (!b || b.status !== "AwaitingDriver") return false;
  if (b.driverName || b.driverMobile || b.pendingDriverName || b.pendingDriverMobile || b.fleetVehicleId) return false; // somebody is on it
  const created = bookingCreatedMs(b);
  if (created == null) return false;
  return nowMs - created >= UNMATCHED_EXPIRY_MS;
}

module.exports = { UNMATCHED_EXPIRY_MS, isUnmatchedExpired, bookingCreatedMs };
