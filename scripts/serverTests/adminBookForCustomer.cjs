// Runs the REAL `adminBookForCustomer` callable (functions/index.js) against a tiny fake Firestore / Auth -- no Firebase, no network (owner 2026-11-12: Admin books on behalf of
// a customer). Every line must say "ok"; the exit code is 1 otherwise. verifyInvariants.mjs runs this file ("ADMIN BOOKS ON BEHALF OF A CUSTOMER").
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
const real = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === "firebase-functions/v2/https") return { onCall: (o, fn) => fn, onRequest: (o, fn) => fn, HttpsError };
  if (req === "firebase-functions/v2/firestore") return { onDocumentCreated: () => ({}), onDocumentUpdated: () => ({}), onDocumentWritten: () => ({}) };
  if (req === "firebase-functions/v2/scheduler") return { onSchedule: () => ({}) };
  if (req === "firebase-functions/params") return { defineSecret: () => ({ value: () => "x" }) };
  if (req === "firebase-admin/app") return { initializeApp: () => ({}) };
  if (req === "firebase-admin/firestore") return { getFirestore: () => fakeDb, FieldValue: { serverTimestamp: () => STAMP, increment: (n) => n, arrayUnion: (...a) => a }, Timestamp: { now: () => ({}), fromMillis: (m) => ({ toMillis: () => m }) } };
  if (req === "firebase-admin/auth") return { getAuth: () => ({ getUserByEmail: async (e) => { if (authUsers.has(e)) return { uid: e }; const x = new Error("nf"); x.code = "auth/user-not-found"; throw x; } }) };
  if (req.startsWith("firebase-") || req.startsWith("@google-cloud")) return new Proxy(function () {}, { get: (t, k) => (k === "then" ? undefined : () => ({})), apply: () => ({}) });
  return real.apply(this, arguments);
};
let fns;
try { fns = require(path.join(__dirname, "..", "..", "functions", "index.js")); } catch (e) { console.error("LOAD FAIL", e.message); process.exit(2); }
const call = fns.adminBookForCustomer;
const admin = { auth: { token: { admin: true } } };
const base = { customerMobile: "9876543210", customerName: "Rahul Kumar", driverMobile: "9000000001", pickup: "Chikhali", drop: "Moshi", pickupLat: 18.73, pickupLng: 73.8, dropLat: 18.67, dropLng: 73.85, fare: 750, tierMaxKg: 750, listCategory: 1, listCategoryKg: 700, distance: 12.4, scheduledFor: null, placeLang: "en" };
col("drivers").set("9000000001", { name: "Suresh", mobile: "9000000001", kyc: "Approved", blacklisted: false, online: true, vehicleSpec: { type: "tata_ace", capacityKg: 700 } });
col("drivers").set("9000000002", { name: "Blocked", mobile: "9000000002", kyc: "Approved", blacklisted: true, vehicleSpec: { capacityKg: 700 } });
col("drivers").set("9000000003", { name: "Fleet", mobile: "9000000003", kyc: "Approved", fleetOwner: true, vehicleSpec: { capacityKg: 700 } });
col("drivers").set("9000000004", { name: "Pending", mobile: "9000000004", kyc: "Pending", vehicleSpec: { capacityKg: 700 } });
(async () => {
  const out = [];
  const t = async (name, req, check) => { let r, err; try { r = await call(req); } catch (e) { err = e; } out.push([check(r, err) ? "ok  " : "BUG?", name, JSON.stringify(r || (err && err.code)).slice(0, 140)]); };
  await t("non-admin refused", { auth: { token: {} }, data: base }, (r, e) => e && e.code === "permission-denied");
  await t("good booking", { ...admin, data: base }, (r) => r && r.ok && /^TS-\d{5}$/.test(r.bookingId));
  const id = [...col("bookings").keys()][0]; const b = col("bookings").get(id);
  out.push([b && b.status === "Ongoing" && b.driverMobile === "9000000001" && b.driverName === "Suresh" && b.vehicle === "tata_ace" && b.customerMobile === "9876543210" && b.customerName === "Rahul Kumar" && b.adminBooked === true && b.paymentBy === "customer" && b.fare === 750 && b.returnTrip === false && b.acceptedAt === STAMP && b.createdAt === STAMP && b.declinedBy.length === 0 && b.pendingDriverName === null ? "ok  " : "BUG?", "booking doc shape", JSON.stringify(b).slice(0, 120)]);
  const otp = col("bookingOtps").get(id); out.push([otp && /^[1-9]\d{3}$/.test(otp.otp) && otp.customerMobile === "9876543210" ? "ok  " : "BUG?", "pickup OTP written", JSON.stringify(otp)]);
  await t("same driver again -> busy", { ...admin, data: base }, (r) => r && !r.ok && r.reason === "driver_busy");
  await t("blocked driver", { ...admin, data: { ...base, driverMobile: "9000000002" } }, (r) => r && r.reason === "driver_blocked");
  await t("transporter", { ...admin, data: { ...base, driverMobile: "9000000003" } }, (r) => r && r.reason === "driver_is_transporter");
  await t("KYC pending", { ...admin, data: { ...base, driverMobile: "9000000004" } }, (r) => r && r.reason === "driver_not_approved");
  await t("unknown driver", { ...admin, data: { ...base, driverMobile: "9111111111" } }, (r) => r && r.reason === "driver_not_found");
  await t("customer number is a Driver", { ...admin, data: { ...base, customerMobile: "9000000004", driverMobile: "9000000001" } }, (r) => r && r.reason === "number_is_driver");
  authUsers.add("9555555555@customer.apnatransport.local");
  await t("customer with an account is fine (other driver)", { ...admin, data: { ...base, customerMobile: "9555555555", driverMobile: "9000000001", scheduledFor: "2030-01-05 08:00" } }, (r) => r && r.ok);
  await t("bad mobile", { ...admin, data: { ...base, customerMobile: "123" } }, (r) => r && r.reason === "customer_mobile");
  await t("numeric name", { ...admin, data: { ...base, customerName: "12345" } }, (r) => r && r.reason === "customer_name");
  await t("no coordinates", { ...admin, data: { ...base, pickupLat: null } }, (r) => r && r.reason === "coords");
  await t("zero fare", { ...admin, data: { ...base, fare: 0 } }, (r) => r && r.reason === "fare");
  await t("same number", { ...admin, data: { ...base, customerMobile: "9000000001" } }, (r) => r && r.reason === "same_number");
  console.log(out.map((r) => r.join("  ")).join("\n"));
  process.exit(out.some((r) => r[0] !== "ok  ") ? 1 : 0);
})();
