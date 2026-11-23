// ADMIN "SWITCH ROLE" (owner 2026-11-19: "a Switch button, only Admin can switch, driver -> customer and customer -> driver, in every row of the Customer and Driver lists").
// ONE place decides whether a switch is allowed and what the new profile looks like; the callable `adminSwitchRole` (functions/index.js) only does the reads and writes.
//
// RULES (owner answers 2026-11-19):
//  * Customer -> Driver: the number becomes a Driver with an EMPTY, INCOMPLETE KYC (kyc null). They cannot accept loads, be listed or be approved until they fill the whole
//    documents form (same as any driver whose KYC is incomplete) -- the "no driver without the form" rule still holds. Refused while the customer has a Searching / Ongoing booking.
//  * Driver -> Customer: REFUSED while the driver has an unfinished trip, money that still has to be settled (wallet other than the untouched starter credit, bonus, held credit,
//    a pending withdrawal / recharge), fleet vehicles / a fleet-owner account, or is blocked. The reason says what the driver has to finish; nothing is ever moved or deleted
//    before every check passes.
//  * A number that already holds BOTH roles (grandfathered, from before the one-role rule) is never switched -- there is no single "from" to move.
// The old profile is copied into `roleSwitchLog` (so nothing is lost) and then removed, the PIN login is moved to the other role (same PIN), and every device is signed out.

const STARTER_WALLET = 500; // what every new driver profile starts with (App.jsx getOrCreateDoc / addManualDriver); an untouched wallet is not "money to settle"
const FINISHED = new Set(["Completed", "Cancelled"]);

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

// A driver's money that has to be settled before the account can stop being a driver.
function driverMoneyIssues(d) {
  const issues = [];
  const wallet = d?.wallet == null ? STARTER_WALLET : num(d.wallet);
  if (wallet !== STARTER_WALLET) issues.push("wallet");
  if (num(d?.bonus) !== 0) issues.push("bonus");
  if (num(d?.heldCredit) !== 0) issues.push("held-credit");
  return issues;
}

// input: { to: "customer" | "driver", mobile, from: { exists, data } (the profile of the role being left),
//          otherExists (a profile or a PIN login already exists in the target role),
//          openTrips (driver's unfinished bookings, status list), openBookings (customer's Searching / Ongoing bookings, status list),
//          pendingMoney (count of Pending withdrawals + recharge requests), fleetVehicles (count) }
// -> { ok: true, newDoc } | { ok: false, reason, issues? }
function planRoleSwitch(input) {
  const { to, mobile, from, otherExists, openTrips = [], openBookings = [], pendingMoney = 0, fleetVehicles = 0 } = input || {};
  if (to !== "customer" && to !== "driver") return { ok: false, reason: "bad-role" };
  if (!/^\d{10}$/.test(String(mobile || ""))) return { ok: false, reason: "bad-mobile" };
  if (!from || !from.exists) return { ok: false, reason: "not-found" };
  if (otherExists) return { ok: false, reason: "has-both-roles" };
  const d = from.data || {};

  if (to === "customer") {
    // the number is a Driver today
    const issues = [];
    if (openTrips.some((s) => !FINISHED.has(s))) issues.push("open-trip");
    for (const m of driverMoneyIssues(d)) issues.push(m);
    if (pendingMoney > 0) issues.push("pending-money");
    if (fleetVehicles > 0 || d.fleetOwner === true) issues.push("fleet-owner");
    if (d.blacklisted === true) issues.push("blocked");
    if (issues.length) return { ok: false, reason: "driver-not-settled", issues };
    const photo = d.photo && typeof d.photo === "object" ? d.photo : (d.docs && d.docs.photo && typeof d.docs.photo === "object" ? d.docs.photo : null);
    const newDoc = {
      name: String(d.name || "").trim() && String(d.name).trim() !== String(mobile) ? String(d.name).trim() : null,
      firmName: null, photo: photo || null, referredBy: null, referralCredited: false, mobile: String(mobile),
    };
    return { ok: true, newDoc };
  }

  // to === "driver": the number is a Customer today
  if (openBookings.some((s) => !FINISHED.has(s))) return { ok: false, reason: "customer-has-booking", issues: ["open-booking"] };
  const newDoc = {
    name: String(d.name || "").trim() || String(mobile), mobile: String(mobile), online: false, kyc: null,
    wallet: STARTER_WALLET, bonus: 0, heldCredit: 0, rating: 4.5, blacklisted: false, docs: null, vehicleSpec: null,
  };
  if (d.photo && typeof d.photo === "object") newDoc.photo = d.photo;
  return { ok: true, newDoc };
}

// A snapshot that is safe to store in Firestore (Timestamps -> ISO strings, undefined dropped).
function plainSnapshot(v) {
  if (v == null) return v;
  if (typeof v.toDate === "function") { try { return v.toDate().toISOString(); } catch { return null; } }
  if (Array.isArray(v)) return v.map(plainSnapshot);
  if (typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = plainSnapshot(x); return o; }
  return v;
}

module.exports = { planRoleSwitch, driverMoneyIssues, plainSnapshot, STARTER_WALLET };
