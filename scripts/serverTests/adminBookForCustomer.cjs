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
// a transporter with two vehicles (one Approved, one still Pending) and a blocked transporter
col("drivers").set("9000000010", { name: "Owner Pratik", mobile: "9000000010", kyc: "Approved", fleetOwner: true, vehicleSpec: { capacityKg: 700 } });
col("fleetVehicles").set("f1", { ownerMobile: "9000000010", vehicleName: "Tata Ace", capacityKg: 700, kyc: "Approved", active: true });
col("fleetVehiclePrivate").set("f1", { ownerMobile: "9000000010", driverName: "Ramesh Patil", driverMobile: "9333333333", vehicleNumber: "MH12AB1234" });
col("fleetVehicles").set("f2", { ownerMobile: "9000000010", vehicleName: "Pickup", capacityKg: 1200, kyc: "Pending", active: true });
col("fleetVehiclePrivate").set("f2", { ownerMobile: "9000000010", driverName: "Sunil", driverMobile: "9444444444" });
col("fleetVehicles").set("f3", { ownerMobile: "9000000010", vehicleName: "Pickup", capacityKg: 1200, kyc: "Approved", active: false });
col("fleetVehiclePrivate").set("f3", { ownerMobile: "9000000010", driverName: "Sunil", driverMobile: "9444444444" });
col("drivers").set("9000000011", { name: "Blocked Owner", mobile: "9000000011", kyc: "Approved", fleetOwner: true, blacklisted: true });
col("fleetVehicles").set("f4", { ownerMobile: "9000000011", vehicleName: "Pickup", capacityKg: 1200, kyc: "Approved", active: true });
col("fleetVehiclePrivate").set("f4", { ownerMobile: "9000000011", driverName: "Dev", driverMobile: "9555555551" });
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
  // ROUND TRIP: the fare is the TOTAL = one-way + return
  await t("round trip books with one-way + return = fare", { ...admin, data: { ...base, driverMobile: "9000000001", scheduledFor: "2030-02-01 08:00", returnTrip: true, oneWayFare: 750, returnFare: 638, returnPct: 15, fare: 1388 } }, (r) => r && r.ok);
  const rt = [...col("bookings").values()].find((x) => x.returnTrip === true);
  out.push([rt && rt.fare === 1388 && rt.oneWayFare === 750 && rt.returnFare === 638 && rt.returnPct === 15 && rt.status === "Ongoing" ? "ok  " : "BUG?", "round trip doc keeps total + both legs", JSON.stringify(rt && { f: rt.fare, o: rt.oneWayFare, r: rt.returnFare })]);
  await t("round trip whose legs do not add up", { ...admin, data: { ...base, returnTrip: true, oneWayFare: 750, returnFare: 638, returnPct: 15, fare: 900 } }, (r) => r && r.reason === "fare");
  await t("round trip without a return fare", { ...admin, data: { ...base, returnTrip: true, oneWayFare: 750, fare: 750 } }, (r) => r && r.reason === "fare");
  // TRANSPORTER'S VEHICLE
  const fl = { ...base, driverMobile: undefined, fleetVehicleId: "f1" };
  await t("transporter vehicle books (fleet doc, owner's account, WhatsApp text)", { ...admin, data: fl }, (r) => r && r.ok && r.fleet === true && r.dispatch && r.dispatch.sent === false && /trip\.html\?b=TS-\d+&k=/.test(r.dispatch.link) && /Chikhali/.test(r.dispatch.text) && r.dispatch.driverMobile === "9333333333");
  const fb = [...col("bookings").values()].find((x) => x.fleetBooking === true);
  out.push([fb && fb.status === "Ongoing" && fb.driverMobile === "9000000010" && fb.driverName === "Ramesh Patil" && fb.fleetVehicleId === "f1" && fb.fleetDriverName === "Ramesh Patil" && fb.fleetDriverMobile === "9333333333" && fb.fleetVehicleNumber === "MH12AB1234" && fb.ownerName === "Owner Pratik" && fb.vehicle === "Tata Ace" && fb.adminBooked === true && fb.paymentBy === "customer" ? "ok  " : "BUG?", "fleet booking fields (what the owner's own Accept writes)", JSON.stringify(fb && { d: fb.driverMobile, n: fb.driverName, v: fb.fleetVehicleId })]);
  out.push([[...col("fleetTripLinks").keys()].length === 1 && [...col("bookingOtps").keys()].length >= 4 ? "ok  " : "BUG?", "trip link + OTP made for the fleet trip", String([...col("fleetTripLinks").keys()])]);
  await t("same vehicle again -> busy (per vehicle)", { ...admin, data: fl }, (r) => r && r.reason === "driver_busy");
  await t("pending (not approved) vehicle", { ...admin, data: { ...fl, fleetVehicleId: "f2" } }, (r) => r && r.reason === "vehicle_not_approved");
  await t("inactive vehicle", { ...admin, data: { ...fl, fleetVehicleId: "f3" } }, (r) => r && r.reason === "vehicle_inactive");
  await t("blocked transporter's vehicle", { ...admin, data: { ...fl, fleetVehicleId: "f4" } }, (r) => r && r.reason === "driver_blocked");
  await t("unknown vehicle", { ...admin, data: { ...fl, fleetVehicleId: "nope" } }, (r) => r && r.reason === "vehicle_not_found");
  await t("customer is the vehicle's own driver", { ...admin, data: { ...fl, fleetVehicleId: "f1", customerMobile: "9333333333", scheduledFor: "2030-03-01 08:00" } }, (r) => r && r.reason === "same_number");
  await t("advance transporter booking on a later day works", { ...admin, data: { ...fl, scheduledFor: "2030-03-02 08:00" } }, (r) => r && r.ok && r.fleet);
  console.log(out.map((r) => r.join("  ")).join("\n"));
  process.exit(out.some((r) => r[0] !== "ok  ") ? 1 : 0);
})();
