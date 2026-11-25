// Runs the REAL `deleteUnmatchedBookings` (functions/index.js) against a tiny fake Firestore -- no Firebase, no network (owner 2026-11-25: a booking nobody took within
// 1 hour is deleted for good). Every line must say "ok"; the exit code is 1 otherwise. verifyInvariants.mjs runs this file.
const Module = require("module");
const path = require("path");
const store = {};
const col = (n) => (store[n] ||= new Map());
const STAMP = { __ts: true };
const makeQuery = (name, filters = []) => ({
  where(f, op, v) { return makeQuery(name, [...filters, [f, v]]); },
  async get() { const docs = [...col(name).entries()].filter(([, d]) => filters.every(([f, v]) => d[f] === v)).map(([id, d]) => ({ id, data: () => d, exists: true, ref: { __col: name, id } })); return { docs, size: docs.length, empty: !docs.length, forEach: (fn) => docs.forEach(fn) }; },
});
const fakeDb = {
  collection: (name) => ({ ...makeQuery(name), doc: (id) => ({ id, __col: name, async get() { const d = col(name).get(id); return { exists: !!d, id, data: () => d }; }, async set(d) { col(name).set(id, d); }, async update(p) { col(name).set(id, { ...col(name).get(id), ...p }); }, async delete() { col(name).delete(id); } }) }),
  batch: () => { const ops = []; return { delete(ref) { ops.push(ref); }, set() {}, update() {}, async commit() { ops.forEach((r) => col(r.__col).delete(r.id)); } }; },
};
const real = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === "firebase-functions/v2/https") return { onCall: (o, fn) => fn, onRequest: (o, fn) => fn, HttpsError: class extends Error {} };
  if (req === "firebase-functions/v2/firestore") return { onDocumentCreated: () => ({}), onDocumentUpdated: () => ({}), onDocumentWritten: () => ({}) };
  if (req === "firebase-functions/v2/scheduler") return { onSchedule: (o, fn) => fn };
  if (req === "firebase-functions/params") return { defineSecret: () => ({ value: () => "x" }) };
  if (req === "firebase-admin/app") return { initializeApp: () => ({}) };
  if (req === "firebase-admin/firestore") return { getFirestore: () => fakeDb, FieldValue: { serverTimestamp: () => STAMP, increment: (n) => n, arrayUnion: (...a) => a, delete: () => null }, Timestamp: { fromMillis: (m) => ({ toMillis: () => m }) } };
  if (req.startsWith("firebase-") || req.startsWith("@google-cloud")) return new Proxy(function () {}, { get: (t, k) => (k === "then" ? undefined : () => ({})), apply: () => ({}) });
  return real.apply(this, arguments);
};
const fns = require(path.join(__dirname, "../../functions/index.js"));
let bad = 0;
const ok = (n, c) => { if (!c) bad++; console.log(`${c ? "ok  " : "FAIL"}  ${n}`); };
const ts = (msAgo) => ({ toMillis: () => Date.now() - msAgo });
const MIN = 60 * 1000;
(async () => {
  ok("the scheduled function exists", typeof fns.deleteUnmatchedBookings === "function");
  const B = col("bookings");
  B.set("cur-old", { status: "AwaitingDriver", createdAt: ts(61 * MIN), customerName: "A" });                                  // Current, 61 min -> deleted
  B.set("cur-new", { status: "AwaitingDriver", createdAt: ts(59 * MIN) });                                                      // 59 min -> kept
  B.set("adv-old", { status: "AwaitingDriver", createdAt: ts(3 * 60 * MIN), scheduledFor: "2026-11-27 08:00" });                // Advance, 3 h -> deleted
  B.set("ret-old", { status: "AwaitingDriver", createdAt: ts(2 * 60 * MIN), returnTrip: true });                                // Current Return -> deleted
  B.set("advret-old", { status: "AwaitingDriver", createdAt: ts(90 * MIN), returnTrip: true, scheduledFor: "2026-11-28 08:00" }); // Advance Return -> deleted
  B.set("accepted", { status: "Ongoing", createdAt: ts(5 * 60 * MIN), driverName: "Ravi", driverMobile: "9000000001" });       // somebody took it -> kept
  B.set("accepted-adv", { status: "Ongoing", createdAt: ts(9 * 60 * MIN), scheduledFor: "2026-11-27 08:00", driverMobile: "9000000002" });
  B.set("done", { status: "Completed", createdAt: ts(30 * 60 * MIN) });
  B.set("cancelled", { status: "Cancelled", createdAt: ts(30 * 60 * MIN) });
  B.set("no-time", { status: "AwaitingDriver" });                                                                              // age unknown -> kept
  B.set("legacy-accepted-at", { status: "AwaitingDriver", acceptedAt: ts(75 * MIN) });                                         // acceptedAt only -> deleted
  B.set("offer-waiting", { status: "AwaitingDriver", createdAt: ts(5 * 60 * MIN), pendingDriverName: "Sunil" });                // a driver's offer is waiting -> kept
  B.set("fleet-taken", { status: "AwaitingDriver", createdAt: ts(5 * 60 * MIN), fleetVehicleId: "FV1" });                      // fleet vehicle on it -> kept
  col("ringDeliveries").set("cur-old_9000000003", { bookingId: "cur-old", driverMobile: "9000000003" });
  col("ringDeliveries").set("cur-new_9000000003", { bookingId: "cur-new", driverMobile: "9000000003" });
  await fns.deleteUnmatchedBookings();
  const gone = (id) => !B.has(id), kept = (id) => B.has(id);
  ok("Current, over 1 hour with nobody -> deleted", gone("cur-old"));
  ok("Advance, over 1 hour with nobody -> deleted", gone("adv-old"));
  ok("Current Return, over 1 hour with nobody -> deleted", gone("ret-old"));
  ok("Advance Return, over 1 hour with nobody -> deleted", gone("advret-old"));
  ok("an old open booking that only has acceptedAt (its creation time) -> deleted", gone("legacy-accepted-at"));
  ok("59 minutes old -> kept", kept("cur-new"));
  ok("a trip a driver accepted (Current and Advance) is NEVER touched", kept("accepted") && kept("accepted-adv"));
  ok("Completed / Cancelled history is never touched", kept("done") && kept("cancelled"));
  ok("no timestamp = age unknown -> kept", kept("no-time"));
  ok("a driver's offer waiting, or a fleet vehicle on it -> kept", kept("offer-waiting") && kept("fleet-taken"));
  ok("the deleted booking's ring leftovers go with it, the others stay", !col("ringDeliveries").has("cur-old_9000000003") && col("ringDeliveries").has("cur-new_9000000003"));
  const left = [...B.keys()].sort().join(",");
  ok("exactly the expected bookings are left", left === ["accepted", "accepted-adv", "cancelled", "cur-new", "done", "fleet-taken", "no-time", "offer-waiting"].sort().join(","));
  await fns.deleteUnmatchedBookings(); // a second run changes nothing
  ok("a second run deletes nothing more", [...B.keys()].sort().join(",") === left);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
