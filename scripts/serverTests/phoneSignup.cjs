// Runs the REAL `otpSignIn` callable (functions/index.js) against a tiny fake Firestore / Auth -- no Firebase, no network (owner 2026-11-24: number + OTP login, no PIN).
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
    createCustomToken: async (uid, claims) => "custom:" + uid + ":" + JSON.stringify(claims || {}),
    createUser: async ({ email, password }) => { if (users.has(email)) { const x = new Error("exists"); x.code = "auth/email-already-exists"; throw x; } users.set(email, { uid: "u" + users.size, password }); return { uid: "u" + users.size }; },
  }) };
  if (req.startsWith("firebase-") || req.startsWith("@google-cloud")) return new Proxy(function () {}, { get: (t, k) => (k === "then" ? undefined : () => ({})), apply: () => ({}) });
  return real.apply(this, arguments);
};
process.env.ENFORCE_OTP_SIGNUP = "1";
let fns;
try { fns = require(path.join(__dirname, "..", "..", "functions", "index.js")); } catch (e) { console.error("LOAD FAIL", e.message); process.exit(2); }
const call = fns.otpSignIn, block = fns.blockUnverifiedPinSignup;
const now = Math.floor(Date.now() / 1000);
const phoneTok = (mobile, o = {}) => ({ auth: { token: { phone_number: "+91" + mobile, auth_time: now - 60, firebase: { sign_in_provider: "phone" }, ...o }, uid: "p" + mobile } });
const em = (m, r) => m + "@" + r + ".apnatransport.local";
(async () => {
  const out = [];
  const t = async (name, req, check) => { let r, err; try { r = await call(req); } catch (e) { err = e; } out.push([check(r, err) ? "ok  " : "BUG?", name, JSON.stringify(r || (err && err.code)).slice(0, 150)]); };
  const has = (e) => users.has(e);
  const d = (role, mode) => ({ role, mode });
  // ---- who may call at all
  await t("signed-out caller refused", { data: d("customer", "login") }, (r, e) => e && e.code === "unauthenticated");
  await t("an e-mail session is NOT phone proof", { auth: { token: { email: em("9000000001", "customer"), auth_time: now, firebase: { sign_in_provider: "password" } } }, data: d("customer", "login") }, (r, e) => e && e.code === "unauthenticated");
  await t("a linked phone number on a password session is NOT proof either", { auth: { token: { phone_number: "+919000000001", auth_time: now, firebase: { sign_in_provider: "password" } } }, data: d("customer", "signup") }, (r, e) => e && e.code === "unauthenticated");
  out.push([users.size === 0 ? "ok  " : "BUG?", "nothing was created by the refused calls", ""]);
  // ---- freshness: login 15 min, sign-up 3 h
  await t("login with a 20-minute-old OTP -> otp_expired", { ...phoneTok("9000000001", { auth_time: now - 20 * 60 }), data: d("customer", "login") }, (r) => r && !r.ok && r.reason === "otp_expired");
  await t("sign-up with a 4-hour-old OTP -> otp_expired", { ...phoneTok("9000000001", { auth_time: now - 4 * 3600 }), data: d("customer", "signup") }, (r) => r && !r.ok && r.reason === "otp_expired");
  await t("future auth_time -> otp_expired", { ...phoneTok("9000000001", { auth_time: now + 3600 }), data: d("customer", "signup") }, (r) => r && !r.ok && r.reason === "otp_expired");
  // ---- login with no account: nothing is created
  await t("LOGIN on a number with no account -> no_account (customer)", { ...phoneTok("9000000001"), data: d("customer", "login") }, (r) => r && !r.ok && r.reason === "no_account");
  await t("LOGIN on a number with no account -> no_account (driver: no driver account without the form)", { ...phoneTok("9000000001"), data: d("driver", "login") }, (r) => r && !r.ok && r.reason === "no_account");
  out.push([users.size === 0 && col("customers").size === 0 && col("drivers").size === 0 ? "ok  " : "BUG?", "login created nothing (no login, no profile)", ""]);
  // ---- sign-up
  let tok1 = null;
  await t("fresh OTP: customer SIGN-UP creates the login and returns a token", { ...phoneTok("9000000001"), data: d("customer", "signup") }, (r) => { tok1 = r && r.token; return r && r.ok === true && typeof r.token === "string"; });
  out.push([has(em("9000000001", "customer")) && !has(em("9000000001", "driver")) && users.get(em("9000000001", "customer")).password.length >= 24 ? "ok  " : "BUG?", "the login exists with a RANDOM password nobody knows (no PIN)", ""]);
  out.push([tok1 && tok1.includes('"email":"' + em("9000000001", "customer") + '"') ? "ok  " : "BUG?", "the custom token carries the e-mail claim the Firestore / Storage rules read", String(tok1).slice(0, 80)]);
  out.push([col("customers").size === 0 && col("drivers").size === 0 ? "ok  " : "BUG?", "no profile / document was written (the app writes those afterwards)", ""]);
  await t("SIGN-UP again on the same number -> exists", { ...phoneTok("9000000001"), data: d("customer", "signup") }, (r) => r && !r.ok && r.reason === "exists");
  const uid1 = users.get(em("9000000001", "customer")).uid;
  await t("LOGIN now works and signs in the SAME uid (same account, same data)", { ...phoneTok("9000000001"), data: d("customer", "login") }, (r) => r && r.ok === true && r.token.startsWith("custom:" + uid1 + ":"));
  out.push([users.size === 1 ? "ok  " : "BUG?", "login created no second user", ""]);
  // ---- one role per number
  await t("the number is a Customer -> a Driver SIGN-UP is refused (one role per number)", { ...phoneTok("9000000001"), data: d("driver", "signup") }, (r) => r && !r.ok && r.reason === "other_role");
  await t("the number is a Customer -> a Driver LOGIN is refused too", { ...phoneTok("9000000001"), data: d("driver", "login") }, (r) => r && !r.ok && r.reason === "other_role");
  out.push([!has(em("9000000001", "driver")) ? "ok  " : "BUG?", "no driver login was created for that number", ""]);
  // ---- profile-only accounts (Admin-added / older phone-login accounts)
  col("drivers").set("9000000002", { name: "Admin added", mobile: "9000000002" });
  await t("a profile added by Admin counts as the number being taken (sign-up refused)", { ...phoneTok("9000000002"), data: d("driver", "signup") }, (r) => r && !r.ok && r.reason === "exists");
  await t("a profile of the other role blocks a customer login / sign-up", { ...phoneTok("9000000002"), data: d("customer", "login") }, (r) => r && !r.ok && r.reason === "other_role");
  await t("that driver CAN log in with the OTP -> their login is made now", { ...phoneTok("9000000002"), data: d("driver", "login") }, (r) => r && r.ok === true && typeof r.token === "string");
  out.push([has(em("9000000002", "driver")) ? "ok  " : "BUG?", "the driver login was created for the profile-only driver", ""]);
  // ---- driver sign-up
  await t("fresh OTP: a NEW driver SIGN-UP creates a login (no profile yet)", { ...phoneTok("9000000003"), data: d("driver", "signup") }, (r) => r && r.ok === true);
  out.push([has(em("9000000003", "driver")) && !col("drivers").has("9000000003") ? "ok  " : "BUG?", "driver login exists but NO drivers/{mobile} profile (documents come later)", ""]);
  await t("sign-up with a 2-hour-old OTP still works (the driver was filling the documents form)", { ...phoneTok("9000000005", { auth_time: now - 2 * 3600 }), data: d("driver", "signup") }, (r) => r && r.ok === true);
  await t("an unknown role is treated as customer, an unknown mode as login", { ...phoneTok("9000000004"), data: { role: "admin", mode: "whatever" } }, (r) => r && !r.ok && r.reason === "no_account");
  // ---- the optional blocking function
  out.push([typeof block === "function" ? "ok  " : "BUG?", "blocking function is exported when ENFORCE_OTP_SIGNUP=1", ""]);
  let blocked = false, passed = false;
  try { block({ data: { email: em("9111111111", "customer") } }); } catch (e) { blocked = e.code === "permission-denied"; }
  try { block({ data: { email: em("9111111111", "driver") } }); passed = false; } catch (e) { passed = e.code === "permission-denied"; }
  let phoneOk = true, adminOk = true;
  try { block({ data: { phoneNumber: "+919111111111" } }); } catch (e) { phoneOk = false; }
  try { block({ data: { email: "owner@gmail.com" } }); } catch (e) { adminOk = false; }
  out.push([blocked && passed && phoneOk && adminOk ? "ok  " : "BUG?", "blocking fn refuses client-made PIN-style sign-ups (customer + driver e-mails) but lets phone sign-ups and real e-mails (Admin) through", ""]);
  let bad = 0; for (const r of out) { if (r[0] !== "ok  ") bad++; }
  console.log(out.map((r) => r.join("  ")).join("\n"));
  process.exit(bad ? 1 : 0);
})();
