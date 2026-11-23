// Runs the REAL `createPinAccountAfterPhoneVerify` callable (functions/index.js) against a tiny fake Firestore / Auth -- no Firebase, no network (owner 2026-11-23: OTP at sign-up).
// Every line must say "ok"; the exit code is 1 otherwise. verifyInvariants.mjs runs this file ("OTP AT SIGN-UP").
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
const users = new Map(); // email -> { uid, password }
const real = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === "firebase-functions/v2/https") return { onCall: (o, fn) => fn, onRequest: (o, fn) => fn, HttpsError };
  if (req === "firebase-functions/v2/identity") return { beforeUserCreated: (o, fn) => fn };
  if (req === "firebase-functions/v2/firestore") return { onDocumentCreated: () => ({}), onDocumentUpdated: () => ({}), onDocumentWritten: () => ({}) };
  if (req === "firebase-functions/v2/scheduler") return { onSchedule: () => ({}) };
  if (req === "firebase-functions/params") return { defineSecret: () => ({ value: () => "x" }) };
  if (req === "firebase-admin/app") return { initializeApp: () => ({}) };
  if (req === "firebase-admin/firestore") return { getFirestore: () => fakeDb, FieldValue: { serverTimestamp: () => STAMP, increment: (n) => n, arrayUnion: (...a) => a }, Timestamp: { now: () => ({}), fromMillis: (m) => ({ toMillis: () => m }) } };
  if (req === "firebase-admin/auth") return { getAuth: () => ({
    getUserByEmail: async (e) => { if (users.has(e)) return { uid: users.get(e).uid, email: e }; const x = new Error("nf"); x.code = "auth/user-not-found"; throw x; },
    createUser: async ({ email, password }) => { if (users.has(email)) { const x = new Error("exists"); x.code = "auth/email-already-exists"; throw x; } users.set(email, { uid: "u" + users.size, password }); return { uid: "u" + users.size }; },
  }) };
  if (req.startsWith("firebase-") || req.startsWith("@google-cloud")) return new Proxy(function () {}, { get: (t, k) => (k === "then" ? undefined : () => ({})), apply: () => ({}) });
  return real.apply(this, arguments);
};
process.env.ENFORCE_OTP_SIGNUP = "1";
let fns;
try { fns = require(path.join(__dirname, "..", "..", "functions", "index.js")); } catch (e) { console.error("LOAD FAIL", e.message); process.exit(2); }
const call = fns.createPinAccountAfterPhoneVerify, block = fns.blockUnverifiedPinSignup;
const now = Math.floor(Date.now() / 1000);
const phoneTok = (mobile, o = {}) => ({ auth: { token: { phone_number: "+91" + mobile, auth_time: now - 60, firebase: { sign_in_provider: "phone" }, ...o }, uid: "p" + mobile } });
const PW = "apna-pin-1234";
(async () => {
  const out = [];
  const t = async (name, req, check) => { let r, err; try { r = await call(req); } catch (e) { err = e; } out.push([check(r, err) ? "ok  " : "BUG?", name, JSON.stringify(r || (err && err.code)).slice(0, 150)]);  };
  const has = (e) => users.has(e);
  await t("signed-out caller refused", { data: { role: "customer", newPin: PW } }, (r, e) => e && e.code === "unauthenticated");
  await t("an e-mail (PIN) session is NOT phone proof", { auth: { token: { email: "9000000001@customer.apnatransport.local", auth_time: now, firebase: { sign_in_provider: "password" } } }, data: { role: "customer", newPin: PW } }, (r, e) => e && e.code === "unauthenticated");
  await t("a linked phone number on a password session is NOT proof either", { auth: { token: { phone_number: "+919000000001", auth_time: now, firebase: { sign_in_provider: "password" } } }, data: { role: "customer", newPin: PW } }, (r, e) => e && e.code === "unauthenticated");
  out.push([users.size === 0 ? "ok  " : "BUG?", "nothing was created by the refused calls", ""]);
  await t("old OTP (4 h ago) -> otp_expired", phoneTok("9000000001", { auth_time: now - 4 * 3600 }) && { ...phoneTok("9000000001", { auth_time: now - 4 * 3600 }), data: { role: "customer", newPin: PW } }, (r) => r && !r.ok && r.reason === "otp_expired");
  await t("future auth_time -> otp_expired", { ...phoneTok("9000000001", { auth_time: now + 3600 }), data: { role: "customer", newPin: PW } }, (r) => r && !r.ok && r.reason === "otp_expired");
  await t("a too-short PIN string -> bad_pin", { ...phoneTok("9000000001"), data: { role: "customer", newPin: "123" } }, (r) => r && !r.ok && r.reason === "bad_pin");
  await t("fresh OTP: customer login created", { ...phoneTok("9000000001"), data: { role: "customer", newPin: PW } }, (r) => r && r.ok === true);
  out.push([has("9000000001@customer.apnatransport.local") && users.get("9000000001@customer.apnatransport.local").password === PW && !has("9000000001@driver.apnatransport.local") ? "ok  " : "BUG?", "the customer login exists with that PIN string, no driver login", ""]);
  out.push([col("customers").size === 0 && col("drivers").size === 0 ? "ok  " : "BUG?", "no profile / document was written (the app writes those afterwards)", ""]);
  await t("same number again -> exists (cannot be re-made)", { ...phoneTok("9000000001"), data: { role: "customer", newPin: PW } }, (r) => r && !r.ok && r.reason === "exists");
  await t("the number is a Customer -> a Driver sign-up is refused (one role per number)", { ...phoneTok("9000000001"), data: { role: "driver", newPin: PW } }, (r) => r && !r.ok && r.reason === "other_role");
  out.push([!has("9000000001@driver.apnatransport.local") ? "ok  " : "BUG?", "no driver login was created for that number", ""]);
  col("drivers").set("9000000002", { name: "Admin added", mobile: "9000000002" });
  await t("a profile added by Admin counts as the number being taken", { ...phoneTok("9000000002"), data: { role: "driver", newPin: PW } }, (r) => r && !r.ok && r.reason === "exists");
  await t("a profile of the other role blocks it too", { ...phoneTok("9000000002"), data: { role: "customer", newPin: PW } }, (r) => r && !r.ok && r.reason === "other_role");
  await t("fresh OTP: a NEW driver login is created (no profile yet)", { ...phoneTok("9000000003"), data: { role: "driver", newPin: PW } }, (r) => r && r.ok === true);
  out.push([has("9000000003@driver.apnatransport.local") && !col("drivers").has("9000000003") ? "ok  " : "BUG?", "driver login exists but NO drivers/{mobile} profile (documents come later)", ""]);
  await t("an unknown role is treated as customer", { ...phoneTok("9000000004"), data: { role: "admin", newPin: PW } }, (r) => r && r.ok === true && has("9000000004@customer.apnatransport.local"));
  // the optional blocking function
  out.push([typeof block === "function" ? "ok  " : "BUG?", "blocking function is exported when ENFORCE_OTP_SIGNUP=1", ""]);
  let blocked = false, passed = false;
  try { block({ data: { email: "9111111111@customer.apnatransport.local" } }); } catch (e) { blocked = e.code === "permission-denied"; }
  try { block({ data: { email: "9111111111@driver.apnatransport.local" } }); passed = false; } catch (e) { passed = e.code === "permission-denied"; }
  let phoneOk = true, adminOk = true;
  try { block({ data: { phoneNumber: "+919111111111" } }); } catch (e) { phoneOk = false; }
  try { block({ data: { email: "owner@gmail.com" } }); } catch (e) { adminOk = false; }
  out.push([blocked && passed && phoneOk && adminOk ? "ok  " : "BUG?", "blocking fn refuses client PIN sign-ups (customer + driver e-mails) but lets phone sign-ups and real e-mails (Admin) through", ""]);
  let bad = 0; for (const r of out) { if (r[0] !== "ok  ") bad++; }
  console.log(out.map((r) => r.join("  ")).join("\n"));
  process.exit(bad ? 1 : 0);
})();
