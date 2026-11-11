// READ-ONLY admin script (owner 2026-11-11): how many drivers can actually take a load, and where. It writes NOTHING.
//
// Usage:
//   cd scripts
//   npm install
//   node driverSupplyReport.js /path/to/serviceAccountKey.json                      (funnel + the default Pune / Pimpri-Chinchwad hubs)
//   node driverSupplyReport.js /path/to/serviceAccountKey.json --hub 18.6,73.8,MyHub (add a hub: lat,lng,name)
//   node driverSupplyReport.js /path/to/serviceAccountKey.json --lists > outreach.txt (ALSO list the drivers to message, with phone numbers)
//
// 1. FUNNEL: of all drivers -> KYC approved -> duty ON -> has a location -> location fresh (GPS live, < 5 min) -> has a push token.
//    Every step is a reason a customer can end up with "no driver".
// 2. HUBS: for each place, the drivers who WOULD be rung / listed right now (duty on, KYC approved, last known location within 30 km),
//    split by GPS live / GPS off and by vehicle category -- so you can pick the launch area with the most drivers.
// 3. --lists: duty-ON approved drivers who never shared a location, and ones whose location is more than a day old -- the people to WhatsApp
//    ("turn on location / open the app") so more of them become reachable.
// The hub coordinates are approximate town centres; add your own with --hub.

const path = require("path");
const trip = require("../functions/tripLock.js");

const CATEGORY_NAMES = ["3 wheeler", "Mini truck", "Mini pickup", "Pickup", "Pickup 8ft", "Pickup 9ft", "10ft truck", "14ft truck", "20ft container", "6 wheeler", "20 ton container", "12/14 wheeler", "16 wheeler", "32t+ truck"];
const HUBS = [
  { name: "Chikhali", lat: 18.7440, lng: 73.8030 }, { name: "Moshi", lat: 18.6780, lng: 73.8500 }, { name: "Bhosari", lat: 18.6460, lng: 73.8450 },
  { name: "Pimpri", lat: 18.6279, lng: 73.8009 }, { name: "Hinjewadi", lat: 18.5912, lng: 73.7389 }, { name: "Wakad", lat: 18.5987, lng: 73.7600 },
  { name: "Hadapsar", lat: 18.5089, lng: 73.9259 }, { name: "Pune Airport (Lohgaon)", lat: 18.5793, lng: 73.9089 }, { name: "Pune city centre", lat: 18.5204, lng: 73.8567 },
];
const RADIUS_KM = trip.RING_RADIUS_KM.current;
const tsMs = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : v && v.seconds ? v.seconds * 1000 : Number(v) || 0);
const haversineKm = (a, b, c, d) => { const R = 6371, r = Math.PI / 180, dLat = (c - a) * r, dLng = (d - b) * r; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const hasLoc = (d) => d.lastKnownLocation && d.lastKnownLocation.lat != null && d.lastKnownLocation.lng != null;
const locAge = (d, now) => (hasLoc(d) ? now - tsMs(d.lastKnownLocation.updatedAt) : Infinity);

// Pure: drivers + hubs -> funnel numbers + per-hub counts.
function supply(drivers, hubs = HUBS, now = Date.now()) {
  const solo = drivers.filter((d) => !d.fleetOwner);
  const approved = solo.filter((d) => d.kyc === "Approved" && !d.blacklisted);
  const duty = approved.filter((d) => d.online);
  const located = duty.filter(hasLoc);
  const live = located.filter((d) => locAge(d, now) < 5 * 60e3);
  const funnel = { total: drivers.length, fleetOwners: drivers.length - solo.length, approved: approved.length, dutyOn: duty.length, located: located.length, gpsLive: live.length, withPushToken: duty.filter((d) => d.fcmToken).length };
  const perHub = hubs.map((h) => {
    const near = located.filter((d) => haversineKm(h.lat, h.lng, d.lastKnownLocation.lat, d.lastKnownLocation.lng) <= RADIUS_KM);
    const byCat = {};
    near.forEach((d) => { const ci = trip.categoryIndexOfCapacity(Number(d.vehicleSpec && d.vehicleSpec.capacityKg) || 0); const n = ci >= 0 ? CATEGORY_NAMES[ci] || `cat ${ci}` : "no vehicle weight"; byCat[n] = (byCat[n] || 0) + 1; });
    return { ...h, total: near.length, gpsLive: near.filter((d) => locAge(d, now) < 5 * 60e3).length, byCat };
  }).sort((a, b) => b.total - a.total);
  const neverLocated = duty.filter((d) => !hasLoc(d));
  const staleLocated = located.filter((d) => locAge(d, now) > 86400e3);
  return { funnel, perHub, neverLocated, staleLocated };
}

async function main() {
  const [, , keyPathArg, ...rest] = process.argv;
  if (!keyPathArg) { console.error("Usage: node driverSupplyReport.js <serviceAccountKey.json> [--hub lat,lng,name] [--lists]"); process.exit(1); }
  const admin = require("firebase-admin");
  admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyPathArg))) });
  const snap = await admin.firestore().collection("drivers").get();
  const drivers = snap.docs.map((d) => ({ id: d.id, ...d.data(), mobile: d.data().mobile || d.id }));
  const hubs = [...HUBS];
  rest.forEach((a, i) => { if (a === "--hub" && rest[i + 1]) { const [lat, lng, ...nm] = rest[i + 1].split(","); hubs.push({ name: nm.join(",") || "custom", lat: Number(lat), lng: Number(lng) }); } });
  const r = supply(drivers, hubs);
  const f = r.funnel;
  console.log("DRIVER FUNNEL (solo drivers; each step is a place a customer's request can fail)");
  console.log(`  all drivers ................. ${f.total}   (of which transport owners: ${f.fleetOwners})`);
  console.log(`  KYC approved, not blocked ... ${f.approved}`);
  console.log(`  duty ON ..................... ${f.dutyOn}`);
  console.log(`  ...and have a location ...... ${f.located}   (${f.dutyOn - f.located} duty-on drivers NEVER shared a location)`);
  console.log(`  ...and GPS live (< 5 min) ... ${f.gpsLive}`);
  console.log(`  ...and a push token ......... ${f.withPushToken}\n`);
  console.log(`HUBS: drivers who would be rung / listed within ${RADIUS_KM} km right now (duty on, KYC approved, last known location)`);
  r.perHub.forEach((h) => console.log(`  ${h.name.padEnd(24)} ${String(h.total).padStart(3)} drivers  (GPS live ${h.gpsLive})   ${Object.entries(h.byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}`));
  console.log("\nBest launch area = the top hub whose vehicle categories match what customers there book.");
  if (rest.includes("--lists")) {
    console.log(`\nMESSAGE THESE (duty ON, approved, NEVER shared a location): ${r.neverLocated.length}`);
    r.neverLocated.forEach((d, i) => console.log(`  ${i + 1}. ${d.name || "?"}  ${d.mobile}`));
    console.log(`\nMESSAGE THESE (duty ON, location more than a day old): ${r.staleLocated.length}`);
    r.staleLocated.forEach((d, i) => console.log(`  ${i + 1}. ${d.name || "?"}  ${d.mobile}  (last seen ${new Date(tsMs(d.lastKnownLocation.updatedAt)).toLocaleDateString("en-IN")})`));
  }
}

module.exports = { supply };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
