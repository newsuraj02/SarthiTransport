// Runs the REAL `adminSwitchRole` callable (functions/index.js) against a tiny fake Firestore / Auth -- no Firebase, no network (owner 2026-11-19: Admin switches a number between
// Driver and Customer). Every line must say "ok"; the exit code is 1 otherwise. verifyInvariants.mjs runs this file ("ADMIN SWITCH ROLE").
const Module = require("module");
const path = require("path");
const store = {};
const col = (n) => (store[n] ||= new Map());
const STAMP = { __ts: true };
let autoId = 0;
class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const makeQuery = (name, filters = []) => ({
  where(f, op, v) { return makeQuery(name, [...filters, [f, v]]); },
  async get() { const docs = [...col(name).entries()].filter(([, d]) => filters.every(([f, v]) => d[f] === v)).map(([id, d]) => ({ id, data: () => d, exists: true })); return { docs, size: docs.length, empty: !docs.length, forEach: (fn) => docs.forEach(fn) }; },
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
const revoked = [];
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
    updateUser: async (uid, p) => { for (const [e, u] of users) if (u.uid === uid) { users.delete(e); if (p.email) users.set(p.email, u); return; } throw new Error("no such uid"); },
    revokeRefreshTokens: async (uid) => { revoked.push(uid); },
  }) };
  if (req.startsWith("firebase-") || req.startsWith("@google-cloud")) return new Proxy(function () {}, { get: (t, k) => (k === "then" ? undefined : () => ({})), apply: () => ({}) });
  return real.apply(this, arguments);
};
let fns;
try { fns = require(path.join(__dirname, "..", "..", "functions", "index.js")); } catch (e) { console.error("LOAD FAIL", e.message); process.exit(2); }
const call = fns.adminSwitchRole;
const admin = { auth: { token: { admin: true, email: "admin@x" }, uid: "adm" } };
const D = (m) => `${m}@driver.apnatransport.local`, C = (m) => `${m}@customer.apnatransport.local`;
const driver = (o) => ({ name: "Suresh", mobile: "x", kyc: "Approved", wallet: 500, bonus: 0, heldCredit: 0, blacklisted: false, online: true, docs: { photo: { url: "u" } }, vehicleSpec: { capacityKg: 700 }, ...o });
(async () => {
  const out = [];
  const t = async (name, req, check) => { let r, err; try { r = await call(req); } catch (e) { err = e; } out.push([check(r, err) ? "ok  " : "BUG?", name, JSON.stringify(r || (err && err.code)).slice(0, 160)]); };
  await t("non-admin refused", { auth: { token: {} }, data: { mobile: "9111111111", to: "customer" } }, (r, e) => e && e.code === "permission-denied");
  await t("bad mobile", { ...admin, data: { mobile: "12", to: "customer" } }, (r, e) => e && e.code === "invalid-argument");
  await t("bad role", { ...admin, data: { mobile: "9111111111", to: "admin" } }, (r, e) => e && e.code === "invalid-argument");
  await t("nobody with that number", { ...admin, data: { mobile: "9111111111", to: "customer" } }, (r) => r && !r.ok && r.reason === "not-found");

  // ---- Driver -> Customer, clean driver with a PIN login
  col("drivers").set("9000000001", driver({ mobile: "9000000001" })); users.set(D("9000000001"), { uid: "u1" });
  col("bookings").set("B1", { driverMobile: "9000000001", status: "Completed" }); col("bookings").set("B2", { driverMobile: "9000000001", status: "Cancelled" });
  await t("clean driver -> customer", { ...admin, data: { mobile: "9000000001", to: "customer" } }, (r) => r && r.ok && r.to === "customer" && r.hadLogin === true);
  const cdoc = col("customers").get("9000000001");
  out.push([cdoc && cdoc.name === "Suresh" && cdoc.mobile === "9000000001" && cdoc.switchedFromRole === "driver" && cdoc.createdAt === STAMP && cdoc.referralCredited === false && cdoc.photo && cdoc.photo.url === "u" ? "ok  " : "BUG?", "customer profile created from the driver (name, photo)", JSON.stringify(cdoc).slice(0, 140)]);
  out.push([!col("drivers").has("9000000001") ? "ok  " : "BUG?", "driver profile removed", ""]);
  out.push([users.has(C("9000000001")) && !users.has(D("9000000001")) && users.get(C("9000000001")).uid === "u1" ? "ok  " : "BUG?", "PIN login moved to the customer role (same uid, same PIN)", [...users.keys()].join(",")]);
  out.push([revoked.includes("u1") ? "ok  " : "BUG?", "every device signed out", String(revoked)]);
  const log = [...col("roleSwitchLog").values()][0];
  out.push([log && log.mobile === "9000000001" && log.from === "driver" && log.to === "customer" && log.by === "admin@x" && log.at === STAMP && log.oldProfile && log.oldProfile.kyc === "Approved" ? "ok  " : "BUG?", "switch logged with the old profile kept", JSON.stringify(log).slice(0, 140)]);
  await t("switching the same number again (now a customer) -> driver works the other way", { ...admin, data: { mobile: "9000000001", to: "driver" } }, (r) => r && r.ok && r.to === "driver");
  const ddoc = col("drivers").get("9000000001");
  out.push([ddoc && ddoc.kyc === null && ddoc.online === false && ddoc.wallet === 500 && ddoc.docs === null && ddoc.vehicleSpec === null && ddoc.name === "Suresh" && !col("customers").has("9000000001") ? "ok  " : "BUG?", "customer -> driver: EMPTY KYC (kyc null, no docs, off duty), name kept, customer profile gone", JSON.stringify(ddoc).slice(0, 160)]);

  // ---- Driver -> Customer refusals (nothing may change)
  const refuse = async (name, mobile, setup, issue) => {
    col("drivers").set(mobile, driver({ mobile, ...(setup.d || {}) })); users.set(D(mobile), { uid: "u" + mobile });
    for (const [c, id, v] of setup.rows || []) col(c).set(id, v);
    const before = JSON.stringify([...col("drivers").get(mobile).name]);
    await t(name, { ...admin, data: { mobile, to: "customer" } }, (r) => r && !r.ok && r.reason === "driver-not-settled" && r.issues.includes(issue));
    out.push([col("drivers").has(mobile) && !col("customers").has(mobile) && users.has(D(mobile)) ? "ok  " : "BUG?", `  ...and nothing changed (${name})`, ""]);
  };
  await refuse("unfinished trip refused", "9000000002", { rows: [["bookings", "T1", { driverMobile: "9000000002", status: "Ongoing" }]] }, "open-trip");
  await refuse("wallet balance refused", "9000000003", { d: { wallet: 1250 } }, "wallet");
  await refuse("wallet below the starter credit refused", "9000000004", { d: { wallet: 120 } }, "wallet");
  await refuse("bonus refused", "9000000005", { d: { bonus: 40 } }, "bonus");
  await refuse("held credit refused", "9000000006", { d: { heldCredit: 30 } }, "held-credit");
  await refuse("pending withdrawal refused", "9000000007", { rows: [["withdrawals", "W1", { driverMobile: "9000000007", status: "Pending" }]] }, "pending-money");
  await refuse("pending recharge refused", "9000000008", { rows: [["rechargeRequests", "R1", { driverMobile: "9000000008", status: "Pending" }]] }, "pending-money");
  await refuse("fleet owner refused", "9000000009", { d: { fleetOwner: true } }, "fleet-owner");
  await refuse("fleet vehicles refused", "9000000010", { rows: [["fleetVehicles", "F1", { ownerMobile: "9000000010" }]] }, "fleet-owner");
  await refuse("blocked driver refused", "9000000011", { d: { blacklisted: true } }, "blocked");
  col("drivers").set("9000000012", driver({ mobile: "9000000012", wallet: 0, bonus: 5 })); users.set(D("9000000012"), { uid: "u12" });
  col("bookings").set("T2", { driverMobile: "9000000012", status: "Ongoing" });
  await t("every problem is listed at once", { ...admin, data: { mobile: "9000000012", to: "customer" } }, (r) => r && r.issues.includes("open-trip") && r.issues.includes("wallet") && r.issues.includes("bonus"));
  await t("settled withdrawals / recharges do not block", { ...admin, data: { mobile: "9000000013", to: "customer" } }, (r) => r && r.reason === "not-found");
  col("drivers").set("9000000014", driver({ mobile: "9000000014", name: "9000000014" })); col("withdrawals").set("W9", { driverMobile: "9000000014", status: "Approved" });
  await t("driver with an approved withdrawal and no login switches (no login to move)", { ...admin, data: { mobile: "9000000014", to: "customer" } }, (r) => r && r.ok && r.hadLogin === false);
  out.push([col("customers").get("9000000014") && col("customers").get("9000000014").name === null ? "ok  " : "BUG?", "a driver whose name is just the number gets no fake name", JSON.stringify(col("customers").get("9000000014"))]);

  // ---- Customer -> Driver
  col("customers").set("9100000001", { name: "Rahul", mobile: "9100000001", photo: { url: "p" } }); users.set(C("9100000001"), { uid: "c1" });
  col("bookings").set("CB1", { customerMobile: "9100000001", status: "AwaitingDriver" });
  await t("customer with an open booking refused", { ...admin, data: { mobile: "9100000001", to: "driver" } }, (r) => r && !r.ok && r.reason === "customer-has-booking");
  col("bookings").set("CB1", { customerMobile: "9100000001", status: "Completed" });
  await t("customer with only finished rides -> driver", { ...admin, data: { mobile: "9100000001", to: "driver" } }, (r) => r && r.ok);
  out.push([users.has(D("9100000001")) && !users.has(C("9100000001")) && col("drivers").get("9100000001").photo.url === "p" ? "ok  " : "BUG?", "customer login moved to Driver; photo carried", [...users.keys()].filter((k) => k.startsWith("9100000001")).join(",")]);

  // ---- both roles already (grandfathered) -> never touched
  col("drivers").set("9200000001", driver({ mobile: "9200000001" })); col("customers").set("9200000001", { name: "Both", mobile: "9200000001" });
  await t("number that already holds both roles is refused", { ...admin, data: { mobile: "9200000001", to: "customer" } }, (r) => r && r.reason === "has-both-roles");
  out.push([col("drivers").has("9200000001") && col("customers").has("9200000001") ? "ok  " : "BUG?", "  ...and both profiles are still there", ""]);
  // a login in the other role only (no profile) also blocks
  col("drivers").set("9200000002", driver({ mobile: "9200000002" })); users.set(C("9200000002"), { uid: "x2" });
  await t("a customer PIN login on the number blocks a Driver -> Customer switch", { ...admin, data: { mobile: "9200000002", to: "customer" } }, (r) => r && r.reason === "has-both-roles");

  let bad = 0;
  for (const [flag, name, detail] of out) { console.log(flag + " " + name + (flag === "ok  " ? "" : "  -> " + detail)); if (flag !== "ok  ") bad++; }
  process.exit(bad ? 1 : 0);
})();
