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
 *   - The driver's vehicle CATEGORY is the one the customer picked, (owner 2026-11-05: the first ring is that category only; escalation rounds move it up ONE category at a time, +2 at most: RING_EXTRA_CATEGORIES).
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

// Owner 2026-11-10: 13 limits (+ "above 32000 kg"): 750 -> 700, 3500 -> 4000, 9000 -> 10000, NEW 1000 and 2000, and no 5000 / 12000 / 16000 category any more (a 5000 kg vehicle is in 4000,
// a 12000 / 16000 kg one in 10000). MIRRORS CUSTOMER_LIST_CATEGORY_KG / CATEGORY_MEMBER_MAX_KG in src/App.jsx (an invariant compares them on every weight 1..40000).
const RING_CATEGORY_MAX_KG = [500, 700, 1000, 1200, 1700, 2000, 2500, 4000, 7500, 10000, 20000, 25000, 32000];
// The heaviest vehicle that is IN each category (4000 takes 2501-5000, 10000 takes 7501-16000, 700 takes 501-750).
const RING_CATEGORY_MEMBER_MAX_KG = [500, 750, 1000, 1200, 1700, 2000, 2500, 5000, 7500, 16000, 20000, 25000, 32000];
// The category table BEFORE 3500 kg and 25000 kg were added (2026-11-04). A booking made by the old app carries only `listCategory` = an index into THIS
// table, so it is translated through it (to a weight limit) rather than read against the new table, which would shift it by one or two categories.
const LEGACY_RING_CATEGORY_MAX_KG = [500, 750, 1200, 1700, 2500, 5000, 7500, 9000, 12000, 16000, 20000, 32000];
// Owner 2026-11-10 (replaces the 2026-11-05 "picked limit + 5000 kg" widening): the FIRST ring goes ONLY to the category the customer picked; the ring moves UP ONE category at a time,
// and only while nobody has accepted: round 1 adds the next category, round 2 the one after, then it STOPS (+2). 500 kg picked, nobody answers -> 700, then 1000, then no more.
// `ctx.extended` is the number of escalation rounds already fired (true = 1): categories picked .. picked + that many. Applies to every picked category.
const RING_EXTRA_CATEGORIES = 2;
// MIRRORS CURRENT_BID_RADIUS_KM / ADVANCE_BID_RADIUS_KM in src/App.jsx (an invariant compares them) -- the same radius the customer's list uses.
const RING_RADIUS_KM = { current: 30, advance: 50 };

// Index of the category a vehicle of this capacity belongs to; -1 when the capacity is unknown.
function categoryIndexOfCapacity(capacityKg) {
  const kg = Number(capacityKg) || 0;
  if (kg <= 0) return -1;
  const i = RING_CATEGORY_MEMBER_MAX_KG.findIndex((m) => kg <= m); // mirrors customerListCategoryIndex
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

// First ring (extended = false / 0): the picked category only. Escalation round n (extended = n, true = 1): the picked category and up to n categories ABOVE it, never more than RING_EXTRA_CATEGORIES.
function categoryInRingRange(dCat, lCat, extended) {
  const steps = extended === true ? 1 : Math.max(0, Math.min(Math.floor(Number(extended) || 0), RING_EXTRA_CATEGORIES));
  if (steps === 0) return dCat === lCat;
  return dCat >= lCat && dCat <= lCat + steps;
}

// Fleet owner (owner 2026-11-08): the account is a transporter with several vehicles driven by people who have NO app. The ring goes to the OWNER's phone, and the owner is
// rung when ANY one of their approved, active vehicles fits the category rule (first ring: the picked category; escalation: up to the picked limit + 5000 kg) and is not busy.
// "Busy" is per VEHICLE (a vehicle on a trip does not stop the owner from taking another load on a different vehicle). The 30 / 50 km radius is skipped: the owner's phone is not
// where the vehicles are. Returns the first suitable vehicle id so callers / logs can name it.
function evaluateFleetOwnerVehicles(driver, load, ctx) {
  const vehicles = Array.isArray(ctx.fleetVehicles) ? ctx.fleetVehicles : [];
  if (!vehicles.length) return { ok: false, reason: "fleet owner with no approved vehicle" };
  const lCat = loadCategoryIndex(load);
  let sawCategory = false;
  for (const v of vehicles) {
    const cap = Number(v.capacityKg) || 0;
    if (cap <= 0) continue;
    const dCat = categoryIndexOfCapacity(cap);
    if (lCat !== -1 && !categoryInRingRange(dCat, lCat, ctx.extended || 0)) continue;
    sawCategory = true;
    const mine = typeof ctx.fleetMine === "function" ? ctx.fleetMine(v.id) : [];
    if (ctx.hasLoadConflict(load, mine || [], ctx.notificationLockHours(cap))) continue;
    return { ok: true, vehicleId: v.id };
  }
  return { ok: false, reason: sawCategory ? "every vehicle in the category is on a trip / has a conflicting commitment" : `no fleet vehicle in the ${ctx.extended ? "picked category .. +" + Math.min(Number(ctx.extended) || 1, RING_EXTRA_CATEGORIES) + " categories" : "picked category"}` };
}

// ctx: { extended: true from an escalation round, mine: this driver's Ongoing bookings, hasLoadConflict(load, mine, lockHours), notificationLockHours(capacityKg), isAppOpen(driver), haversineKm(lat1, lng1, lat2, lng2),
//        fleetVehicles / fleetMine(vehicleId): only for a fleet owner }
// Returns { ok: true } or { ok: false, reason }.
function evaluateNewLoadDriver(driver, load, ctx) {
  if (!driver.online) return { ok: false, reason: "off duty" };
  if (driver.kyc !== "Approved") return { ok: false, reason: `kyc=${driver.kyc}` };
  if (driver.blacklisted) return { ok: false, reason: "blacklisted" };
  if ((load.declinedBy || []).includes(driver.name)) return { ok: false, reason: "declined this load" };
  if (driver.fleetOwner) {
    const fleet = evaluateFleetOwnerVehicles(driver, load, ctx);
    if (!fleet.ok) return fleet;
    if (ctx.isAppOpen(driver)) return { ok: false, reason: "app is OPEN on screen -> in-app card + sound only, no ring" };
    return fleet;
  }
  const capacityKg = Number(driver.vehicleSpec && driver.vehicleSpec.capacityKg) || 0;
  const dCat = categoryIndexOfCapacity(capacityKg);
  if (dCat === -1) return { ok: false, reason: "no vehicle capacity on file" };
  const lCat = loadCategoryIndex(load);
  if (lCat !== -1 && !categoryInRingRange(dCat, lCat, ctx.extended || 0)) return { ok: false, reason: `category ${dCat} outside the ${ctx.extended ? `picked category ${lCat} .. +${Math.min(Number(ctx.extended) || 1, RING_EXTRA_CATEGORIES)} categories` : `picked category ${lCat}`}` };
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

module.exports = { RING_CATEGORY_MAX_KG, RING_CATEGORY_MEMBER_MAX_KG, LEGACY_RING_CATEGORY_MAX_KG, RING_EXTRA_CATEGORIES, RING_RADIUS_KM, categoryInRingRange, evaluateFleetOwnerVehicles, categoryIndexOfCapacity, loadCategoryIndex, evaluateNewLoadDriver };
