// Runs the REAL `adminDeleteAccount` callable (functions/index.js) against a tiny fake Firestore / Auth -- no Firebase, no network (owner 2026-11-22: "once deleted, delete it from the
// system (even in firebase backend) ... never show that profile on the app"). Every line must say "ok"; the exit code is 1 otherwise. verifyInvariants.mjs runs this file ("ADMIN DELETE ACCOUNT").
const Module = require("module");
const path = require("path");
const store = {};
const col = (n) => (store[n] ||= new Map());
const STAMP = { __ts: true };
let autoId = 0;
class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const makeQuery = (name, filters = []) => ({
  where(f, op, v) { return makeQuery(name, [...filters, [f, v]]); },
  async get() { const docs = [...col(name).entries()].filter(([, d]) => filters.every(([f, v]) => d[f] === v)).map(([id, d]) => ({ id, data: () => d, exists: true, ref: fakeDb.collection(name).doc(id) })); return { docs, size: docs.length, empty: !docs.length, forEach: (fn) => docs.forEach(fn) }; },
});
const fakeDb = { collection: (name) => ({
  ...makeQuery(name),
  doc: (id0) => { const id = id0 || `auto${++autoId}`; return {
    id,
    async get() { const d = col(name).get(id); return { exists: !!d, id, data: () => d }; },
    async create(data) { if (col(name).has(id)) { const e = new Error("already exists"); e.code = 6; throw e; } col(name).set(id, data); },
    async set(data) { col(name).set(id, data); }, async update(p) { col(name).set(id, { ...col(name).get(id), ...p }); }, async delete() { col(name).delete(id); },
  }; },
}) };
const users = new Map(); // email -> { uid }
const phoneUsers = new Map(); // "+91..." -> { uid }
const revoked = []; const deleted = [];
const real = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === "firebase-functions/v2/https") return { onCall: (o, fn) => fn, onRequest: (o, fn) => fn, HttpsError };
  if (req === "firebase-functions/v2/firestore") return { onDocumentCreated: () => ({}), onDocumentUpdated: () => ({}), onDocumentWritten: () => ({}) };
  if (req === "firebase-functions/v2/scheduler") return { onSchedule: () => ({}) };
  if (req === "firebase-functions/params") return { defineSecret: () => ({ value: () => "x" }) };
  if (req === "firebase-admin/app") return { initializeApp: () => ({}) };
  if (req === "firebase-admin/firestore") return { getFirestore: () => fakeDb, FieldValue: { serverTimestamp: () => STAMP, increment: (n) => n, arrayUnion: (...a) => a }, Timestamp: { now: () => ({}), fromMillis: (m) => ({ toMillis: () => m }) } };
  if (req === "firebase-admin/auth") return { getAuth: () => ({
    getUserByEmail: async (e) => { if (users.has(e)) return { uid: users.get(e).uid, email: e }; const x = new Error("nf"); x.code = "auth/user-not-found"; throw x; },
    getUserByPhoneNumber: async (p) => { if (phoneUsers.has(p)) return { uid: phoneUsers.get(p).uid }; const x = new Error("nf"); x.code = "auth/user-not-found"; throw x; },
    deleteUser: async (uid) => { deleted.push(uid); for (const [e, u] of [...users]) if (u.uid === uid) users.delete(e); for (const [p, u] of [...phoneUsers]) if (u.uid === uid) phoneUsers.delete(p); },
    revokeRefreshTokens: async (uid) => { revoked.push(uid); },
  }) };
  if (req.startsWith("firebase-") || req.startsWith("@google-cloud")) return new Proxy(function () {}, { get: (t, k) => (k === "then" ? undefined : () => ({})), apply: () => ({}) });
  return real.apply(this, arguments);
};
let fns;
try { fns = require(path.join(__dirname, "..", "..", "functions", "index.js")); } catch (e) { console.error("LOAD FAIL", e.message); process.exit(2); }
const call = fns.adminDeleteAccount;
const admin = { auth: { token: { admin: true, email: "admin@x" }, uid: "adm" } };
const D = (m) => `${m}@driver.apnatransport.local`, C = (m) => `${m}@customer.apnatransport.local`;
(async () => {
  const out = [];
  const t = async (name, req, check) => { let r, err; try { r = await call(req); } catch (e) { err = e; } out.push([check(r, err) ? "ok  " : "BUG?", name, JSON.stringify(r || (err && err.code)).slice(0, 170)]); };
  const has = (c, id) => col(c).has(id);
  await t("non-admin refused", { auth: { token: {} }, data: { mobile: "9111111111", role: "customer" } }, (r, e) => e && e.code === "permission-denied");
  await t("bad mobile", { ...admin, data: { mobile: "12", role: "customer" } }, (r, e) => e && e.code === "invalid-argument");
  await t("bad role", { ...admin, data: { mobile: "9111111111", role: "admin" } }, (r, e) => e && e.code === "invalid-argument");
  await t("nobody with that number", { ...admin, data: { mobile: "9111111111", role: "customer" } }, (r) => r && !r.ok && r.reason === "not-found");

  // ---- customer: login + profile + activity go; bookings stay; tombstone written
  col("customers").set("9000000001", { name: "Ravi", mobile: "9000000001" }); users.set(C("9000000001"), { uid: "u1" });
  col("customerFlow").set("9000000001_1", { customerMobile: "9000000001" }); col("customerFlow").set("9000000001_2", { customerMobile: "9000000001" }); col("customerFlow").set("9222222222_1", { customerMobile: "9222222222" });
  col("bookings").set("B1", { customerMobile: "9000000001", status: "Completed" });
  const before = Math.floor(Date.now() / 1000);
  await t("customer deleted for real", { ...admin, data: { mobile: "9000000001", role: "customer" } }, (r) => r && r.ok && r.hadLogin === true && r.removed === 2);
  out.push([!has("customers", "9000000001") && !users.has(C("9000000001")) && deleted.includes("u1") && revoked.includes("u1") ? "ok  " : "BUG?", "profile and PIN login are gone, tokens revoked", ""]);
  out.push([!has("customerFlow", "9000000001_1") && !has("customerFlow", "9000000001_2") && has("customerFlow", "9222222222_1") ? "ok  " : "BUG?", "only this customer's activity removed", ""]);
  out.push([has("bookings", "B1") ? "ok  " : "BUG?", "finished bookings are kept (the other side's history)", ""]);
  const tomb = col("deletedAccounts").get("9000000001");
  out.push([tomb && tomb.role === "customer" && tomb.deletedAtSec >= before && tomb.deletedAtSec <= before + 5 && Object.keys(tomb).sort().join() === "at,deletedAtSec,role" ? "ok  " : "BUG?", "tombstone = time + role only (no personal data)", JSON.stringify(tomb)]);
  await t("second delete finds nothing (no loop)", { ...admin, data: { mobile: "9000000001", role: "customer" } }, (r) => r && !r.ok && r.reason === "not-found");

  // ---- the SAME number's other-role profile / login is NOT touched
  col("customers").set("9000000002", { name: "Both", mobile: "9000000002" }); users.set(C("9000000002"), { uid: "u2c" });
  col("drivers").set("9000000002", { name: "Both", mobile: "9000000002" }); users.set(D("9000000002"), { uid: "u2d" });
  await t("both-role number: delete the customer only", { ...admin, data: { mobile: "9000000002", role: "customer" } }, (r) => r && r.ok);
  out.push([has("drivers", "9000000002") && users.has(D("9000000002")) && !deleted.includes("u2d") ? "ok  " : "BUG?", "the other role of that number is untouched", ""]);

  // ---- running trips refuse, nothing changes
  col("drivers").set("9000000003", { name: "Busy", mobile: "9000000003" }); users.set(D("9000000003"), { uid: "u3" });
  col("bookings").set("B3", { driverMobile: "9000000003", status: "Ongoing" });
  await t("driver on a running trip is refused", { ...admin, data: { mobile: "9000000003", role: "driver" } }, (r) => r && !r.ok && r.reason === "trip-running");
  out.push([has("drivers", "9000000003") && users.has(D("9000000003")) && !has("deletedAccounts", "9000000003") ? "ok  " : "BUG?", "refusal changes nothing (profile, login, no tombstone)", ""]);
  col("customers").set("9000000004", { name: "Waiting", mobile: "9000000004" }); col("bookings").set("B4", { customerMobile: "9000000004", status: "AwaitingDriver" });
  await t("customer with an open booking is refused", { ...admin, data: { mobile: "9000000004", role: "customer" } }, (r) => r && !r.ok && r.reason === "trip-running");

  // ---- driver ghost profile (profile only, no PIN login) and a driver with fleet vehicles + WhatsApp status
  col("drivers").set("9000000005", { name: "9000000005", mobile: "9000000005", kyc: null });
  await t("ghost driver profile (no login) is deleted", { ...admin, data: { mobile: "9000000005", role: "driver" } }, (r) => r && r.ok && r.hadLogin === false);
  col("drivers").set("9000000006", { name: "Owner", mobile: "9000000006", fleetOwner: true }); users.set(D("9000000006"), { uid: "u6" });
  col("whatsappStatus").set("9000000006", { state: "read" }); col("fleetVehicles").set("FV1", { ownerMobile: "9000000006" }); col("fleetVehicles").set("FV2", { ownerMobile: "9000000099" });
  col("fleetVehiclePrivate").set("FV1", { driverMobile: "9" }); col("fleetVehiclePrivate").set("FV2", { driverMobile: "8" });
  await t("fleet owner: vehicles + private data + WhatsApp status go", { ...admin, data: { mobile: "9000000006", role: "driver" } }, (r) => r && r.ok && r.removed === 3);
  out.push([!has("fleetVehicles", "FV1") && !has("fleetVehiclePrivate", "FV1") && !has("whatsappStatus", "9000000006") && has("fleetVehicles", "FV2") && has("fleetVehiclePrivate", "FV2") ? "ok  " : "BUG?", "another owner's vehicles are untouched", ""]);

  // ---- an older phone-number login goes only when the number has no other-role profile / login
  col("customers").set("9000000007", { name: "Old", mobile: "9000000007" }); phoneUsers.set("+919000000007", { uid: "p7" });
  await t("old phone-number login is removed too", { ...admin, data: { mobile: "9000000007", role: "customer" } }, (r) => r && r.ok && deleted.includes("p7"));
  col("customers").set("9000000008", { name: "Old2", mobile: "9000000008" }); col("drivers").set("9000000008", { name: "Old2", mobile: "9000000008" }); phoneUsers.set("+919000000008", { uid: "p8" });
  await t("...but kept when the number still has a profile in the other role", { ...admin, data: { mobile: "9000000008", role: "customer" } }, (r) => r && r.ok && !deleted.includes("p8"));

  let bad = 0; for (const r of out) { if (r[0] !== "ok  ") bad++; }
  console.log(out.map((r) => r.join("  ")).join("\n"));
  process.exit(bad ? 1 : 0);
})();
