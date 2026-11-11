// READ-ONLY admin script (owner 2026-11-11): "why did this booking get no driver?" It writes NOTHING.
//
// It takes the real ring rule (functions/tripLock.js evaluateNewLoadDriver -- the SAME code the live ring uses) and replays it against your
// CURRENT drivers for a booking, for the first ring and both escalation rounds, and tells you who would have been rung and, for everyone
// else, the exact reason (off duty, KYC not approved, no location, outside 30/50 km, wrong vehicle category, on a trip, no push token ...).
//
// Usage:
//   cd scripts
//   npm install
//   node whyNoDriver.js /path/to/serviceAccountKey.json                  (the 3 latest requests that got no driver)
//   node whyNoDriver.js /path/to/serviceAccountKey.json --latest 10      (the 10 latest)
//   node whyNoDriver.js /path/to/serviceAccountKey.json BOOKING_ID       (one booking)
//
// Honest limits: it replays with the drivers' state NOW (duty, location, KYC), not as it was when the customer pressed Book; "on a trip" is
// approximated by "has an Ongoing booking now"; and the app-open check is left out. So it explains the usual causes, it is not a time machine.

const path = require("path");
const trip = require("../functions/tripLock.js");

const CATEGORY_NAMES = ["3 wheeler", "Mini truck", "Mini pickup", "Pickup", "Pickup 8ft", "Pickup 9ft", "10ft truck", "14ft truck", "20ft container", "6 wheeler", "20 ton container", "12/14 wheeler", "16 wheeler", "32t+ truck"];
const tsMs = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : v && v.seconds ? v.seconds * 1000 : Number(v) || 0);
const IST = { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true };
const haversineKm = (a, b, c, d) => { const R = 6371, r = Math.PI / 180, dLat = (c - a) * r, dLng = (d - b) * r; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const catName = (i) => CATEGORY_NAMES[i] || `category ${i}`;

// Pure: one booking + every driver -> { rounds: [{ round, rung: [driver], reasons: {reason: [driver]} }] }
function replay(booking, drivers, bookings, fleetVehicles) {
  const ongoing = {};
  (bookings || []).forEach((b) => { if (b.status === "Ongoing" && b.driverMobile) (ongoing[b.driverMobile] = ongoing[b.driverMobile] || []).push(b); });
  const fleetBy = {};
  (fleetVehicles || []).forEach((v) => { if (v.kyc === "Approved") (fleetBy[v.ownerMobile] = fleetBy[v.ownerMobile] || []).push(v); });
  const rounds = [];
  for (let round = 0; round <= trip.RING_EXTRA_CATEGORIES; round++) {
    const rung = [], reasons = {};
    drivers.forEach((d) => {
      const ctx = {
        extended: round, mine: ongoing[d.mobile] || [],
        hasLoadConflict: (load, mine) => (mine || []).length > 0, notificationLockHours: () => 0, isAppOpen: () => false, haversineKm,
        fleetVehicles: d.fleetOwner ? fleetBy[d.mobile] || [] : [], fleetMine: () => [],
      };
      const v = trip.evaluateNewLoadDriver(d, booking, ctx);
      if (v.ok && !d.fcmToken) { (reasons["would be rung, but NO PUSH TOKEN (app not opened since install?)"] = reasons["would be rung, but NO PUSH TOKEN (app not opened since install?)"] || []).push(d); return; }
      if (v.ok) { rung.push(d); return; }
      const key = v.reason.replace(/[0-9.]+km away/, "N km away").replace(/category \d+ outside the picked category \d+ \.\. \+\d+ categories?/, "vehicle category outside the picked category's ring range");
      (reasons[key] = reasons[key] || []).push(d);
    });
    rounds.push({ round, rung, reasons });
  }
  return rounds;
}

async function main() {
  const [, , keyPathArg, ...rest] = process.argv;
  if (!keyPathArg) { console.error("Usage: node whyNoDriver.js <serviceAccountKey.json> [BOOKING_ID | --latest N]"); process.exit(1); }
  const admin = require("firebase-admin");
  admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyPathArg))) });
  const db = admin.firestore();
  const [bSnap, dSnap, fSnap] = await Promise.all([db.collection("bookings").get(), db.collection("drivers").get(), db.collection("fleetVehicles").get().catch(() => ({ docs: [] }))]);
  const bookings = bSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const drivers = dSnap.docs.map((d) => ({ id: d.id, ...d.data(), mobile: d.data().mobile || d.id }));
  const fleetVehicles = fSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const li = rest.indexOf("--latest");
  const n = li >= 0 ? Number(rest[li + 1]) || 3 : 3;
  const idArg = rest.find((a) => !a.startsWith("--") && a !== String(n));
  const noDriver = (b) => !b.driverName && (b.status === "AwaitingDriver" || b.status === "Searching" || b.status === "Cancelled");
  const targets = idArg ? bookings.filter((b) => b.id === idArg) : bookings.filter(noDriver).sort((a, b) => tsMs(b.createdAt || b.acceptedAt) - tsMs(a.createdAt || a.acceptedAt)).slice(0, n);
  if (!targets.length) { console.log("No matching booking found."); return; }
  console.log(`Drivers in the database: ${drivers.length}\n`);
  targets.forEach((b) => {
    const lCat = trip.loadCategoryIndex(b);
    console.log("=".repeat(78));
    console.log(`BOOKING ${b.id}  |  ${b.customerName || "?"} ${b.customerMobile || ""}  |  ${new Date(tsMs(b.createdAt || b.acceptedAt)).toLocaleString("en-IN", IST)}  |  ${b.status}`);
    console.log(`  ${b.pickup} -> ${b.drop}  |  picked category: ${lCat >= 0 ? catName(lCat) : "?"}  |  ${b.scheduledFor ? "ADVANCE " + b.scheduledFor + " (50 km radius)" : "Current (30 km radius)"}  |  pickup coords: ${b.pickupLat != null ? "yes" : "NO"}`);
    replay(b, drivers, bookings, fleetVehicles).forEach(({ round, rung, reasons }) => {
      console.log(`\n  ${round === 0 ? "FIRST RING" : "ESCALATION ROUND " + round} (${round === 0 ? "picked category only" : "picked .. +" + round + " categories"}): ${rung.length} driver(s) would be rung`);
      rung.slice(0, 15).forEach((d) => console.log(`      RUNG  ${d.name || "?"}  ${d.mobile}  ${d.vehicleSpec && d.vehicleSpec.capacityKg ? d.vehicleSpec.capacityKg + " kg" : ""}`));
      if (round === 0 || !rung.length) Object.entries(reasons).sort((x, y) => y[1].length - x[1].length).slice(0, 8).forEach(([why, list]) => console.log(`      ${String(list.length).padStart(4)} skipped: ${why}`));
    });
    console.log("");
  });
  console.log("Tip: the biggest 'skipped' line in the FIRST RING block is what to fix first.");
}

module.exports = { replay };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
