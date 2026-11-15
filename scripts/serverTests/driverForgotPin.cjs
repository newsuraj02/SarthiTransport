// Runs the REAL `resetPinAfterPhoneVerify` (functions/index.js) against a tiny fake Firebase -- no network (owner 2026-11-15: drivers appeared with NO documents).
// ROOT CAUSE this pins: "Forgot PIN" on the Driver app CREATED a brand-new driver login for ANY mobile that had none, so a person who never filled the sign-up form got
// an account (and the app then made an empty driver profile for it). The ONLY way a NEW driver account may come into being is the final "Create Account" of the
// completed documents form (client). Forgot PIN may only reset the PIN of a driver who already exists (a login, or a profile document -- e.g. an Admin-added or an
// older phone-login driver). Every line must say "ok"; exit code 1 otherwise. verifyInvariants.mjs runs this ("NO DRIVER ACCOUNT WITHOUT THE COMPLETED FORM").
const Module = require("module");
const path = require("path");
const store = {};
const col = (n) => (store[n] ||= new Map());
class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const docRef = (name, id) => ({
  async get() { const d = col(name).get(id); return { exists: !!d, id, data: () => d }; },
  async set(data, opts) { col(name).set(id, opts && opts.merge ? { ...(col(name).get(id) || {}), ...data } : data); },
  async update(p) { col(name).set(id, { ...(col(name).get(id) || {}), ...p }); },
});
const fakeDb = { collection: (n) => ({ doc: (id) => docRef(n, id) }), batch() { return { set() {}, update() {}, async commit() {} }; }, async runTransaction(fn) { return fn({ get: (r) => r.get(), set: (r, d, o) => r.set(d, o) }); } };
const users = new Map(); // email -> { uid, password }
const created = [];
const fakeAuth = {
  async getUserByEmail(email) { const u = users.get(email); if (!u) { const e = new Error("no user"); e.code = "auth/user-not-found"; throw e; } return u; },
  async updateUser(uid, patch) { for (const u of users.values()) if (u.uid === uid) Object.assign(u, patch); },
  async createUser({ email, password }) { const u = { uid: "u" + users.size, password }; users.set(email, u); created.push(email); return u; },
};
const real = Module._load;
Module._load = function (req) {
  if (req === "firebase-functions/v2/https") return { onCall: (o, fn) => fn, onRequest: (o, fn) => fn, HttpsError };
  if (req === "firebase-functions/v2/firestore") return { onDocumentCreated: () => ({}), onDocumentUpdated: () => ({}), onDocumentWritten: () => ({}) };
  if (req === "firebase-functions/v2/scheduler") return { onSchedule: () => ({}) };
  if (req === "firebase-functions/params") return { defineSecret: () => ({ value: () => "x" }) };
  if (req === "firebase-admin/app") return { initializeApp: () => ({}) };
  if (req === "firebase-admin/firestore") return { getFirestore: () => fakeDb, FieldValue: { serverTimestamp: () => ({ __ts: true }), increment: (n) => ({ __inc: n }), arrayUnion: (...a) => a }, Timestamp: { now: () => ({}) } };
  if (req === "firebase-admin/auth") return { getAuth: () => fakeAuth };
  if (req.startsWith("firebase-") || req.startsWith("@google-cloud")) return new Proxy(function () {}, { get: (t, k) => (k === "then" ? undefined : () => ({})), apply: () => ({}) });
  return real.apply(this, arguments);
};
process.env.GCLOUD_PROJECT = "demo-proj";
let fns;
try { fns = require(path.join(__dirname, "..", "..", "functions", "index.js")); } catch (e) { console.error("LOAD FAIL", e.message); process.exit(2); }
const call = (mobile, role) => fns.resetPinAfterPhoneVerify({ auth: { token: { phone_number: "+91" + mobile } }, data: { role, newPin: "123456" } });
const email = (m, role) => `${m}@${role}.apnatransport.local`;
(async () => {
  const out = []; const ok = (name, c, x = "") => out.push([c ? "ok  " : "BUG?", name, String(x).slice(0, 160)]);
  // 1. A stranger (no login, no profile) taps Forgot PIN on the DRIVER app: nothing is created.
  const r1 = await call("9111111111", "driver");
  ok("Forgot PIN for a number that never signed up as a driver is refused (no_account)", r1.ok === false && r1.reason === "no_account", JSON.stringify(r1));
  ok("... and NO driver login was created for it", !created.some((e) => e.startsWith("9111111111")) && !users.has(email("9111111111", "driver")));
  // 2. A real driver with a login: PIN is reset, nothing new is created.
  users.set(email("9222222222", "driver"), { uid: "ux", password: "old" });
  const r2 = await call("9222222222", "driver");
  ok("a driver who has a login gets the PIN reset", r2.ok === true && users.get(email("9222222222", "driver")).password === "123456", JSON.stringify(r2));
  // 3. A driver who exists only as a profile (Admin-added / older phone-login driver) may still get a PIN login through Forgot PIN.
  col("drivers").set("9333333333", { name: "Old Driver", mobile: "9333333333" });
  const r3 = await call("9333333333", "driver");
  ok("a driver with a profile but no login can still set a PIN (older / Admin-added drivers keep working)", r3.ok === true && users.has(email("9333333333", "driver")), JSON.stringify(r3));
  // 4. The one-role rule still holds: a Customer number cannot become a Driver.
  col("customers").set("9444444444", { name: "Cust", mobile: "9444444444" });
  const r4 = await call("9444444444", "driver");
  ok("a Customer number still cannot become a Driver", r4.ok === false && r4.reason === "other_role", JSON.stringify(r4));
  // 5. Customers are untouched by this change (they have no documents): Forgot PIN still works for them.
  const r5 = await call("9555555555", "customer");
  ok("customer Forgot PIN behaves as before", r5.ok === true && users.has(email("9555555555", "customer")), JSON.stringify(r5));
  for (const l of out) console.log(l.join("  "));
  process.exit(out.some((l) => l[0] !== "ok  ") ? 1 : 0);
})();
