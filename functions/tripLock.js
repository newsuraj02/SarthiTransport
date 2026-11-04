/**
 * WHO GETS THE NEW-LOAD BELL (owner 2026-11-04, replacing the older GPS / radius / weight rule).
 *
 * One rule, used by BOTH rings in functions/index.js (onDirectRequestBroadcast = the first ring, escalateOneBooking = the later
 * rounds), so the two can never disagree. Pure: no Firebase, no clock of its own, so scripts/verifyInvariants.mjs runs it directly.
 *
 * A driver is rung when ALL of these hold:
 *   - Duty is ON (`online`) -- the ONLY availability switch. GPS, last-seen, the phone being locked or the app being closed are NOT looked at:
 *     duty on + GPS off is rung; duty on + GPS on is rung; duty off is never rung (and nothing else is checked).
 *   - KYC is Approved and the driver is not blocked.
 *   - The driver is not on a trip (a running trip holds the driver until End Trip / Cancelled -- hasLoadConflict, the same availability
 *     rule the customer list uses).
 *   - The driver's vehicle CATEGORY is the one the customer picked, or one of the next RING_CATEGORIES_ABOVE categories above it
 *     (customer picks a 500 kg vehicle -> that category and the 2 above it).
 *   - The driver has not declined this load, and is not looking at the app on screen (the in-app card + sound handle that case:
 *     "one Accept", 2026-11-03).
 *
 * The category list MIRRORS DEFAULT_FARE_TIERS in src/App.jsx (an invariant compares them); a driver's category is the smallest tier whose
 * maxKg is at least the vehicle's capacity, exactly like the app's findFareTier.
 */

const FARE_TIER_MAX_KG = [500, 750, 800, 900, 1000, 1200, 1250, 1500, 2000, 2500, 3500, 5000, 7000, 7500, 9000, 9500, 10000, 12000, 16000, 18000, 21000, 25000, 30000, 999999];
const RING_CATEGORIES_ABOVE = 2;

// Index of the category a vehicle of this capacity belongs to; -1 when the capacity is unknown.
function categoryIndexOfCapacity(capacityKg) {
  const kg = Number(capacityKg) || 0;
  if (kg <= 0) return -1;
  const i = FARE_TIER_MAX_KG.findIndex((m) => kg <= m);
  return i === -1 ? FARE_TIER_MAX_KG.length - 1 : i;
}

// The category the customer picked: the booking's tierMaxKg (set by the app from the tapped vehicle); falls back to the booking's
// weight for a booking made some other way; -1 = unknown (then no category filter is applied -- a load is never left unrung).
function loadCategoryIndex(load) {
  const t = Number(load && load.tierMaxKg) || 0;
  if (t > 0) { const i = FARE_TIER_MAX_KG.indexOf(t); if (i !== -1) return i; return categoryIndexOfCapacity(t); }
  return categoryIndexOfCapacity(load && load.weight);
}

// ctx: { mine: this driver's Ongoing bookings, hasLoadConflict(load, mine, lockHours), notificationLockHours(capacityKg), isAppOpen(driver) }
// Returns { ok: true } or { ok: false, reason }.
function evaluateNewLoadDriver(driver, load, ctx) {
  if (!driver.online) return { ok: false, reason: "off duty" };
  if (driver.kyc !== "Approved") return { ok: false, reason: `kyc=${driver.kyc}` };
  if (driver.blacklisted) return { ok: false, reason: "blacklisted" };
  if ((load.declinedBy || []).includes(driver.name)) return { ok: false, reason: "declined this load" };
  const capacityKg = Number(driver.vehicleSpec && driver.vehicleSpec.capacityKg) || 0;
  const dCat = categoryIndexOfCapacity(capacityKg);
  if (dCat === -1) return { ok: false, reason: "no vehicle capacity on file" };
  const lCat = loadCategoryIndex(load);
  if (lCat !== -1 && (dCat < lCat || dCat > lCat + RING_CATEGORIES_ABOVE)) return { ok: false, reason: `category ${dCat} outside the picked category ${lCat} .. +${RING_CATEGORIES_ABOVE}` };
  if (ctx.hasLoadConflict(load, ctx.mine || [], ctx.notificationLockHours(capacityKg))) return { ok: false, reason: "on a trip / conflicts with an existing commitment" };
  if (ctx.isAppOpen(driver)) return { ok: false, reason: "app is OPEN on screen -> in-app card + sound only, no ring" };
  return { ok: true };
}

module.exports = { FARE_TIER_MAX_KG, RING_CATEGORIES_ABOVE, categoryIndexOfCapacity, loadCategoryIndex, evaluateNewLoadDriver };
