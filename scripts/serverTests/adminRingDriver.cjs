// Runs the REAL `adminRingDriver` callable (functions/index.js) against a tiny fake Firestore / Auth / Messaging -- no Firebase, no network (owner 2026-11-27: a Ring button on every driver in Book for a customer). Every line must say "ok"; exit 1 otherwise. verifyInvariants.mjs runs this file ("ADMIN RING BUTTON").

const Module = require("module");
const path = require("path");
const store = {}; // col -> Map(id -> data)
const col = (n) => (store[n] ||= new Map());
const STAMP = { __ts: true };
class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const makeQuery = (name, filters = []) => ({
  where(f, op, v) { return makeQuery(name, [...filters, [f, v]]); },
  async get() { const docs = [...col(name).entries()].filter(([, d]) => filters.every(([f, v]) => d[f] === v)).map(([id, d]) => ({ id, data: () => d, exists: true })); return { docs, size: docs.length, empty: !docs.length, forEach: (fn) => docs.forEach(fn) }; },
});
const fakeDb = { collection: (name) => ({
  ...makeQuery(name),
  doc: (id) => ({
    async get() { const d = col(name).get(id); return { exists: !!d, id, data: () => d }; },
    async create(data) { if (col(name).has(id)) { const e = new Error("already exists"); e.code = 6; throw e; } col(name).set(id, data); },
    async set(data) { col(name).set(id, data); }, async update(p) { col(name).set(id, { ...col(name).get(id), ...p }); },
  }),
}) };
const authUsers = new Set();
const sent = [];
const real = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === "firebase-functions/v2/https") return { onCall: (o, fn) => fn, onRequest: (o, fn) => fn, HttpsError };
  if (req === "firebase-functions/v2/firestore") return { onDocumentCreated: () => ({}), onDocumentUpdated: () => ({}), onDocumentWritten: () => ({}) };
  if (req === "firebase-functions/v2/scheduler") return { onSchedule: () => ({}) };
  if (req === "firebase-functions/params") return { defineSecret: () => ({ value: () => "x" }) };
  if (req === "firebase-admin/app") return { initializeApp: () => ({}) };
  if (req === "firebase-admin/firestore") return { getFirestore: () => fakeDb, FieldValue: { serverTimestamp: () => STAMP, increment: (n) => n, arrayUnion: (...a) => a }, Timestamp: { now: () => ({}), fromMillis: (m) => ({ toMillis: () => m }) } };
  if (req === "firebase-admin/auth") return { getAuth: () => ({ getUserByEmail: async (e) => { if (authUsers.has(e)) return { uid: e }; const x = new Error("nf"); x.code = "auth/user-not-found"; throw x; } }) };
  if (req === "firebase-admin/messaging") return { getMessaging: () => ({ send: async (m) => { sent.push(m); return "id"; } }) };
  if (req.startsWith("firebase-") || req.startsWith("@google-cloud")) return new Proxy(function () {}, { get: (t, k) => (k === "then" ? undefined : () => ({})), apply: () => ({}) });
  return real.apply(this, arguments);
};
let fns;
try { fns = require(path.join(__dirname, "..", "..", "functions", "index.js")); } catch (e) { console.error("LOAD FAIL", e.message); process.exit(2); }
const call = fns.adminRingDriver;
const admin = { auth: { token: { admin: true } } };
const base = { customerMobile: "9876543210", customerName: "Rahul Kumar", driverMobile: "9000000001", pickup: "Chikhali", drop: "Moshi", pickupLat: 18.73, pickupLng: 73.8, dropLat: 18.67, dropLng: 73.85, fare: 750, tierMaxKg: 750, listCategory: 1, listCategoryKg: 700, distance: 12.4, scheduledFor: null, placeLang: "en" };
const near = { lat: 18.735, lng: 73.805 };
const drv = (o) => ({ name: "Suresh", kyc: "Approved", blacklisted: false, online: true, fcmToken: "tok-1", lastKnownLocation: near, vehicleSpec: { type: "tata_ace", capacityKg: 700 }, ...o });
col("drivers").set("9000000001", drv({ mobile: "9000000001" }));
col("drivers").set("9000000002", drv({ mobile: "9000000002", name: "Blocked", blacklisted: true, fcmToken: "tok-2" }));
col("drivers").set("9000000003", drv({ mobile: "9000000003", name: "NoToken", fcmToken: null }));
col("drivers").set("9000000004", drv({ mobile: "9000000004", name: "OffDuty", online: false, fcmToken: "tok-4" }));
col("drivers").set("9000000005", drv({ mobile: "9000000005", name: "Far", lastKnownLocation: { lat: 19.5, lng: 74.9 }, fcmToken: "tok-5" }));
col("drivers").set("9000000006", drv({ mobile: "9000000006", name: "BigTruck", vehicleSpec: { capacityKg: 9000 }, fcmToken: "tok-6" }));
col("drivers").set("9000000007", drv({ mobile: "9000000007", name: "AppOpen", fcmToken: "tok-7", appForegroundAt: { toMillis: () => Date.now() - 5000 } }));
col("drivers").set("9000000008", drv({ mobile: "9000000008", name: "Bystander", fcmToken: "tok-8" })); // eligible too, but NOT the one Admin rang
col("drivers").set("9000000009", { name: "Fleet", mobile: "9000000009", kyc: "Approved", fleetOwner: true, online: true, fcmToken: "tok-9", vehicleSpec: { capacityKg: 700 } });
(async () => {
  const out = [];
  const t = async (name, req, check) => { let r, err; try { r = await call(req); } catch (e) { err = e; } out.push([check(r, err) ? "ok  " : "BUG?", name, JSON.stringify(r || (err && err.code)).slice(0, 150)]); };
  const n0 = () => col("bookings").size;
  await t("non-admin refused", { auth: { token: {} }, data: base }, (r, e) => e && e.code === "permission-denied");
  await t("blocked driver: nothing created, nobody rung", { ...admin, data: { ...base, driverMobile: "9000000002" } }, (r) => r && r.reason === "driver_blocked" && n0() === 0 && sent.length === 0);
  await t("driver without a push token: refused, nothing created", { ...admin, data: { ...base, driverMobile: "9000000003" } }, (r) => r && r.reason === "no_push_token" && n0() === 0 && sent.length === 0);
  await t("off-duty driver would never see the load: refused, nothing created", { ...admin, data: { ...base, driverMobile: "9000000004" } }, (r) => r && r.reason === "not_in_ring_rule" && n0() === 0 && sent.length === 0);
  await t("driver 120+ km from the pickup: refused", { ...admin, data: { ...base, driverMobile: "9000000005" } }, (r) => r && r.reason === "not_in_ring_rule" && n0() === 0);
  await t("driver of another category: refused", { ...admin, data: { ...base, driverMobile: "9000000006" } }, (r) => r && r.reason === "not_in_ring_rule" && n0() === 0);
  await t("a transporter is not rung from here", { ...admin, data: { ...base, driverMobile: "9000000009" } }, (r) => r && r.reason === "driver_is_transporter" && n0() === 0);
  await t("customer number is a Driver", { ...admin, data: { ...base, customerMobile: "9000000003", driverMobile: "9000000001" } }, (r) => r && r.reason === "number_is_driver" && n0() === 0);
  await t("a fleet vehicle id is not a ring target", { ...admin, data: { ...base, driverMobile: undefined, fleetVehicleId: "f1" } }, (r) => r && r.reason === "driver_mobile");
  await t("bad fare", { ...admin, data: { ...base, fare: 0 } }, (r) => r && r.reason === "fare");
  // THE RING
  await t("good ring: ok + rung", { ...admin, data: base }, (r) => r && r.ok && r.rung === true && r.appOpen === false && /^TS-\d{5}$/.test(r.bookingId));
  const id = [...col("bookings").keys()][0]; const b = col("bookings").get(id);
  out.push([b && b.status === "AwaitingDriver" && b.driverName === null && !b.driverMobile && b.pendingDriverName === null && b.adminRing === true && b.adminRingMobile === "9000000001" && b.paymentBy === "customer" && b.customerMobile === "9876543210" && b.fare === 750 && b.listCategoryKg === 700 ? "ok  " : "BUG?", "open request: AwaitingDriver, nobody assigned, placeholder cleared, adminRing flag", JSON.stringify({ s: b && b.status, p: b && b.pendingDriverName, a: b && b.adminRing })]);
  out.push([b && JSON.stringify(b.ringTargets) === '["9000000001"]' && JSON.stringify(b.alertedDriverMobiles) === '["9000000001"]' ? "ok  " : "BUG?", "ring targets + live-watch backup list = ONLY the chosen driver", JSON.stringify([b && b.ringTargets, b && b.alertedDriverMobiles])]);
  const tokens = sent.map((m) => m.token);
  out.push([sent.length === 2 && tokens.every((x) => x === "tok-1") ? "ok  " : "BUG?", "exactly two pushes (alert + ring), both to the chosen driver's token; the Bystander / others got nothing", JSON.stringify(tokens)]);
  const ring = sent.find((m) => m.data && m.data.type === "direct_request_ring");
  out.push([ring && ring.data.bookingId === id && /Rahul Kumar/.test(ring.data.weight) && ring.data.ackKey ? "ok  " : "BUG?", "the ring carries the booking id, the customer name / fare text and a delivery key", JSON.stringify(ring && { id: ring.data.bookingId })]);
  out.push([col("ringDeliveries").has(id + "_9000000001") ? "ok  " : "BUG?", "ringDelivery receipt row written for him only", String([...col("ringDeliveries").keys()])]);
  await t("same driver rung again for a trip that clashes? he has no running trip, so a second request is allowed", { ...admin, data: { ...base, scheduledFor: "2030-04-01 08:00" } }, (r) => r && r.ok);
  // driver's app open -> no ring, load shows on his screen
  const before = sent.length;
  await t("driver with the app OPEN: request created, NO ring sent", { ...admin, data: { ...base, driverMobile: "9000000007" } }, (r) => r && r.ok && r.rung === false && r.appOpen === true && sent.length === before);
  const open = [...col("bookings").values()].filter((x) => x.adminRingMobile === "9000000007")[0];
  out.push([open && open.pendingDriverName === null && !open.ringTargets && !open.alertedDriverMobiles ? "ok  " : "BUG?", "app-open request is open to the pool without any ring list", JSON.stringify(open && { r: open.ringTargets })]);
  console.log(out.map((r) => r.join("  ")).join("\n"));
  process.exit(out.some((r) => r[0] !== "ok  ") ? 1 : 0);
})();
