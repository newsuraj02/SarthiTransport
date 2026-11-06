/**
 * WHO GETS THE NEW-LOAD BELL (owner 2026-11-04, replacing the older GPS / radius / weight rule).
 *
 * One rule, used by BOTH rings in functions/index.js (onDirectRequestBroadcast = the first ring, escalateOneBooking = the later
 * rounds), so the two can never disagree. Pure: no Firebase, no clock of its own, so scripts/verifyInvariants.mjs runs it directly.
 *
 * A driver is rung when ALL of these hold:
 *   - Duty is ON (`online`) -- the availability switch. The phone being locked or the app being closed is NOT looked at:
 *     duty on + GPS off is rung (placed by where it was last seen); duty on + GPS on is rung; duty off is never rung (and nothing else is checked).
 *   - KYC is Approved and the driver is not blocked.
 *   - The driver is not on a trip (a running trip holds the driver until End Trip / Cancelled -- hasLoadConflict, the same availability
 *     rule the customer list uses).
 *   - The driver's vehicle CATEGORY is the one the customer picked, (owner 2026-11-05: the first ring is that category only; escalation rounds widen it to the picked limit + RING_EXTRA_RANGE_KG).
 *     The categories are the SAME ones the customer's vehicle list shows (owner 2026-11-04): 500 / 750 / 1200 / 1700 / 2500 / 5000 / 7500 /
 *     9000 / 12000 / 16000 / 20000 / 32000 kg + "above 32000 kg". The customer taps a category (never one driver) and EVERY vehicle in it
 *     (ONLY that category, owner 2026-11-05) is rung; the first driver to accept gets the trip. A booking carries `listCategoryKg` (the picked category's weight limit; an older booking only `listCategory`, an index into the previous table);
 *     an older booking without either falls back to the category of its tierMaxKg / weight.
 *   - The driver is WITHIN RING_RADIUS_KM of the pickup -- 30 km for a Current booking, 50 km for an Advance one (the booking has `scheduledFor`) --
 *     measured from the driver's LAST KNOWN location however old (owner 2026-11-04: the same radius as the customer's vehicle list). GPS being off
 *     or stale does not matter, but a driver who has NEVER reported a location cannot be placed and is not rung. A booking with no pickup
 *     coordinates skips the radius (a load is never left unrung because of missing data).
 *   - The driver has not declined this load, and is not looking at the app on screen (the in-app card + sound handle that case:
 *     "one Accept", 2026-11-03).
 *
 * The category list MIRRORS CUSTOMER_LIST_CATEGORY_KG in src/App.jsx (an invariant compares them); a driver's category is the first limit
 * the vehicle's capacity does not exceed (above the last limit = index 12, "Above 32000 kg"), exactly like the app's customerListCategoryIndex.
 */

const RING_CATEGORY_MAX_KG = [500, 750, 1200, 1700, 2500, 3500, 5000, 7500, 9000, 12000, 16000, 20000, 25000, 32000];
// The category table BEFORE 3500 kg and 25000 kg were added (2026-11-04). A booking made by the old app carries only `listCategory` = an index into THIS
// table, so it is translated through it (to a weight limit) rather than read against the new table, which would shift it by one or two categories.
const LEGACY_RING_CATEGORY_MAX_KG = [500, 750, 1200, 1700, 2500, 5000, 7500, 9000, 12000, 16000, 20000, 32000];
// Owner 2026-11-05 (replaces the old "+2 categories above"): the FIRST ring goes ONLY to the category the customer picked; if the load is
// still unaccepted, the escalation rounds widen the range to every category from the picked one up to the picked category's weight limit
// + RING_EXTRA_RANGE_KG (500 kg picked -> 500 .. 5500 kg: 500, 750, 1200, 1700, 2500, 3500, 5000). Applies to every picked category.
const RING_EXTRA_RANGE_KG = 5000;
// MIRRORS CURRENT_BID_RADIUS_KM / ADVANCE_BID_RADIUS_KM in src/App.jsx (an invariant compares them) -- the same radius the customer's list uses.
const RING_RADIUS_KM = { current: 30, advance: 50 };

// Index of the category a vehicle of this capacity belongs to; -1 when the capacity is unknown.
function categoryIndexOfCapacity(capacityKg) {
  const kg = Number(capacityKg) || 0;
  if (kg <= 0) return -1;
  const i = RING_CATEGORY_MAX_KG.findIndex((m) => kg <= m);
  return i === -1 ? RING_CATEGORY_MAX_KG.length : i;
}

// The category the customer picked. A booking made by the current app carries `listCategoryKg` = the picked category's weight limit (999999 = "above
// 32000 kg"), which stays right whenever categories are added; a booking from an older app carries only `listCategory` = an index into the OLD table,
// which is translated through LEGACY_RING_CATEGORY_MAX_KG; anything older falls back to its tierMaxKg, then its weight. -1 = unknown (then no category
// filter is applied -- a load is never left unrung).
function loadCategoryIndex(load) {
  const kg = Number(load && load.listCategoryKg);
  if (load && load.listCategoryKg != null && kg > 0) return categoryIndexOfCapacity(kg);
  const c = Number(load && load.listCategory);
  if (load && load.listCategory != null && Number.isInteger(c) && c >= 0 && c <= LEGACY_RING_CATEGORY_MAX_KG.length) {
    return categoryIndexOfCapacity(c < LEGACY_RING_CATEGORY_MAX_KG.length ? LEGACY_RING_CATEGORY_MAX_KG[c] : 999999);
  }
  const t = Number(load && load.tierMaxKg) || 0;
  if (t > 0) return categoryIndexOfCapacity(t);
  return categoryIndexOfCapacity(load && load.weight);
}

// Weight limit of a category index (the last, "above 32000 kg", has no limit).
function categoryLimitKg(idx) { return idx < RING_CATEGORY_MAX_KG.length ? RING_CATEGORY_MAX_KG[idx] : Infinity; }
// First ring (extended = false): the picked category only. Escalation (extended = true): the picked category up to its limit + RING_EXTRA_RANGE_KG.
function categoryInRingRange(dCat, lCat, extended) {
  if (!extended) return dCat === lCat;
  return dCat >= lCat && categoryLimitKg(dCat) <= categoryLimitKg(lCat) + RING_EXTRA_RANGE_KG;
}

// ctx: { extended: true from an escalation round, mine: this driver's Ongoing bookings, hasLoadConflict(load, mine, lockHours), notificationLockHours(capacityKg), isAppOpen(driver), haversineKm(lat1, lng1, lat2, lng2) }
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
  if (lCat !== -1 && !categoryInRingRange(dCat, lCat, !!ctx.extended)) return { ok: false, reason: `category ${dCat} outside the ${ctx.extended ? `picked category ${lCat} .. +${RING_EXTRA_RANGE_KG} kg` : `picked category ${lCat}`}` };
  // Radius from the pickup, by the driver's last known location (however old); skipped when the booking has no pickup coordinates.
  if (load.pickupLat != null && load.pickupLng != null) {
    const loc = driver.lastKnownLocation;
    if (!loc || loc.lat == null || loc.lng == null) return { ok: false, reason: "no location on record -> cannot be placed within the radius" };
    const radiusKm = load.scheduledFor ? RING_RADIUS_KM.advance : RING_RADIUS_KM.current;
    const km = ctx.haversineKm(loc.lat, loc.lng, load.pickupLat, load.pickupLng);
    if (km > radiusKm) return { ok: false, reason: `${km.toFixed(1)}km away (last known), outside the ${radiusKm}km radius` };
  }
  if (ctx.hasLoadConflict(load, ctx.mine || [], ctx.notificationLockHours(capacityKg))) return { ok: false, reason: "on a trip / conflicts with an existing commitment" };
  if (ctx.isAppOpen(driver)) return { ok: false, reason: "app is OPEN on screen -> in-app card + sound only, no ring" };
  return { ok: true };
}

module.exports = { RING_CATEGORY_MAX_KG, LEGACY_RING_CATEGORY_MAX_KG, RING_EXTRA_RANGE_KG, RING_RADIUS_KM, categoryInRingRange, categoryIndexOfCapacity, loadCategoryIndex, evaluateNewLoadDriver };
