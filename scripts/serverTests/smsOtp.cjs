// Runs the REAL DLT SMS callables / triggers (functions/smsFunctions.js, wired in functions/index.js) and the real otpSignIn against a fake Firestore + Auth + gateway
// (owner 2026-11-25). Every line must say "ok"; exit code 1 otherwise. verifyInvariants.mjs runs this file.
const Module = require("module");
const path = require("path");
const store = {};
const col = (n) => (store[n] ||= new Map());
const STAMP = { __ts: true };
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const applyPatch = (cur, patch) => { const out = { ...cur }; for (const [k, v] of Object.entries(patch)) { if (v && v.__union) out[k] = [...new Set([...(out[k] || []), ...v.__union])]; else if (k.includes(".")) { const [a, b] = k.split("."); out[a] = { ...(out[a] || {}), [b]: v }; } else out[k] = v; } return out; };
const mkRef = (name, id) => ({ __col: name, id, async get() { const d = col(name).get(id); return { exists: !!d, id, data: () => (d ? JSON.parse(JSON.stringify(d)) : undefined) }; },
  async set(data, opts) { col(name).set(id, opts && opts.merge ? applyPatch(col(name).get(id) || {}, data) : { ...data }); },
  async update(p) { if (!col(name).has(id)) throw new Error("no doc"); col(name).set(id, applyPatch(col(name).get(id), p)); },
  async create(d) { if (col(name).has(id)) { const e = new Error("exists"); e.code = 6; throw e; } col(name).set(id, { ...d }); } });
const fakeDb = {
  collection: (name) => ({ doc: (id) => mkRef(name, id), where() { return { where() { return { async get() { return { empty: true, docs: [] }; } }; }, async get() { return { empty: true, docs: [] }; } }; } }),
  async runTransaction(fn) { return fn({ get: (ref) => ref.get(), update: (ref, p) => ref.update(p) }); },
  batch() { return { set() {}, update() {}, delete() {}, async commit() {} }; },
};
const users = new Map(); let uidN = 0; const created = [];
const real = Module._load;
Module._load = function (req) {
  if (req === "firebase-functions/v2/https") return { onCall: (o, fn) => fn, onRequest: (o, fn) => fn, HttpsError };
  if (req === "firebase-functions/v2/firestore") return { onDocumentCreated: (o, fn) => fn, onDocumentUpdated: (o, fn) => fn, onDocumentWritten: (o, fn) => fn };
  if (req === "firebase-functions/v2/scheduler") return { onSchedule: (o, fn) => fn };
  if (req === "firebase-functions/params") return { defineSecret: (n) => ({ value: () => (global.__noSecrets ? "" : "secret-" + n) }) };
  if (req === "firebase-admin/app") return { initializeApp: () => ({}) };
  if (req === "firebase-admin/firestore") return { getFirestore: () => fakeDb, FieldValue: { serverTimestamp: () => STAMP, increment: (n) => n, arrayUnion: (...a) => ({ __union: a }), delete: () => null }, Timestamp: { now: () => ({}), fromMillis: (m) => ({ toMillis: () => m }) } };
  if (req === "firebase-admin/auth") return { getAuth: () => ({
    getUserByEmail: async (e) => { if (users.has(e)) return { uid: users.get(e), email: e }; const x = new Error("nf"); x.code = "auth/user-not-found"; throw x; },
    createUser: async ({ email }) => { const uid = "u" + ++uidN; users.set(email, uid); created.push(email); return { uid }; },
    createCustomToken: async (uid, claims) => `token:${uid}:${claims && claims.email}`,
  }) };
  if (req.startsWith("firebase-") || req.startsWith("@google-cloud")) return new Proxy(function () {}, { get: (t, k) => (k === "then" ? undefined : () => ({})), apply: () => ({}) });
  return real.apply(this, arguments);
};
let T = 1_800_000_000_000; Date.now = () => T;
const gwCalls = []; let gwReply = { status: 200, body: '{"status":"SUCCESS"}' };
global.fetch = async (url, init) => { const body = JSON.parse(init.body); gwCalls.push(body); return { status: gwReply.status, text: async () => gwReply.body }; };
const fns = require(path.join(__dirname, "../../functions/index.js"));
let bad = 0; const ok = (n, c) => { if (!c) bad++; console.log(`${c ? "ok  " : "FAIL"}  ${n}`); };
const req = (data, extra = {}) => ({ data, rawRequest: { headers: { "x-forwarded-for": extra.ip || "1.1.1.1" } }, ...extra });
const lastCode = () => { const m = /^(\d{6}) is your/.exec(gwCalls[gwCalls.length - 1].message); return m && m[1]; };
const smsConfig = (over = {}) => col("smsConfig").set("main", { entityId: "1101", header: "APNATR", otpEnabled: true, otpTestedAt: 5, templates: { otp: { id: "T1" }, bookingConfirmed: { id: "T2" }, newLoad: { id: "T3" }, kycReminder: { id: "T4" } }, ...over });
(async () => {
  for (const n of ["requestSmsOtp", "verifySmsOtp", "sendBulkDriverSms", "sendTestSms", "smsBookingConfirmed", "smsNewLoad", "otpSignIn"]) ok(`${n} is exported`, typeof fns[n] === "function");
  ok("the old MSG91 functions are gone", !fns.sendBulkDriverWhatsApp && !fns.msg91WhatsAppStatus && !fns.getWhatsAppWebhookInfo && !fns.initiateMaskedCall);

  // switch OFF -> the app falls back to Firebase Phone Auth
  let r = await fns.requestSmsOtp(req({ mobile: "9876543210", role: "customer", mode: "signup" }));
  ok("no config / switch off -> sms_otp_off, nothing sent", r.reason === "sms_otp_off" && gwCalls.length === 0);
  smsConfig({ otpEnabled: false }); r = await fns.requestSmsOtp(req({ mobile: "9876543210", role: "customer", mode: "signup" }));
  ok("configured but switched off -> still sms_otp_off", r.reason === "sms_otp_off" && gwCalls.length === 0);
  smsConfig(); r = await fns.requestSmsOtp(req({ mobile: "12345", role: "customer", mode: "signup" })); ok("bad number refused", r.reason === "invalid_phone" && gwCalls.length === 0);

  // only text a number the sign-in can continue with
  r = await fns.requestSmsOtp(req({ mobile: "9876543210", role: "customer", mode: "login" })); ok("login on a number with no account -> no_account, NO SMS (no pumping)", r.reason === "no_account" && gwCalls.length === 0);
  users.set("9111111111@customer.apnatransport.local", "uExisting");
  r = await fns.requestSmsOtp(req({ mobile: "9111111111", role: "customer", mode: "signup" })); ok("sign-up on an existing number -> exists, NO SMS", r.reason === "exists" && gwCalls.length === 0);
  col("drivers").set("9222222222", { name: "D" });
  r = await fns.requestSmsOtp(req({ mobile: "9222222222", role: "customer", mode: "signup" })); ok("number registered in the other app -> other_role, NO SMS", r.reason === "other_role" && gwCalls.length === 0);

  // a real sign-up OTP
  r = await fns.requestSmsOtp(req({ mobile: "9876543210", role: "customer", mode: "signup" }));
  ok("sign-up OTP is sent through the gateway with the DLT ids", r.ok === true && gwCalls.length === 1 && gwCalls[0].dltTemplateId === "T1" && gwCalls[0].entityId === "1101" && gwCalls[0].sourceAddress === "APNATR" && gwCalls[0].destinationAddress[0] === "919876543210");
  const code = lastCode(); ok("the code is 6 digits", /^\d{6}$/.test(code));
  const stored = JSON.stringify(col("smsOtps").get("9876543210")); ok("only a salted hash is stored, never the code", !stored.includes(code) && stored.includes('"hash"'));
  r = await fns.requestSmsOtp(req({ mobile: "9876543210", role: "customer", mode: "signup" })); ok("a second request inside 30 s -> wait, no second SMS", r.reason === "wait" && gwCalls.length === 1);

  // verifying
  r = await fns.verifySmsOtp(req({ mobile: "9876543210", code: "000000" })); ok("wrong code -> wrong_code", r.reason === "wrong_code");
  r = await fns.verifySmsOtp(req({ mobile: "9876543210", code })); ok("right code -> a one-time proof", r.ok === true && typeof r.proof === "string" && r.proof.length >= 20);
  const proof = r.proof;
  ok("the code cannot be used twice", (await fns.verifySmsOtp(req({ mobile: "9876543210", code }))).ok === false);

  // otpSignIn with the proof
  let s;
  try { await fns.otpSignIn(req({ role: "customer", mode: "signup", mobile: "9876543210", proof: "wrong" })); s = "no-throw"; } catch (e) { s = e.code; }
  ok("a wrong proof is refused (unauthenticated)", s === "unauthenticated");
  try { await fns.otpSignIn(req({ role: "customer", mode: "signup", mobile: "9000000000", proof })); s = "no-throw"; } catch (e) { s = e.code; }
  ok("a proof for ANOTHER number is refused", s === "unauthenticated");
  s = await fns.otpSignIn(req({ role: "customer", mode: "signup", mobile: "9876543210", proof }));
  ok("sign-up with the proof creates the account and returns a login token", s.ok === true && /^token:u\d+:9876543210@customer\.apnatransport\.local$/.test(s.token) && created.includes("9876543210@customer.apnatransport.local"));
  try { await fns.otpSignIn(req({ role: "customer", mode: "login", mobile: "9876543210", proof })); s = "no-throw"; } catch (e) { s = e.code; }
  ok("the proof is used up after one sign-in", s === "unauthenticated");

  // login with a fresh OTP for the now-existing account
  T += 40_000; r = await fns.requestSmsOtp(req({ mobile: "9876543210", role: "customer", mode: "login" })); ok("login OTP for an existing account is sent", r.ok === true && gwCalls.length === 2);
  const c2 = lastCode(); const v2 = await fns.verifySmsOtp(req({ mobile: "9876543210", code: c2 }));
  s = await fns.otpSignIn(req({ role: "customer", mode: "login", mobile: "9876543210", proof: v2.proof })); ok("login with the proof signs the same account in", s.ok === true && s.token.includes("9876543210@customer"));
  s = await fns.otpSignIn(req({ role: "driver", mode: "login", mobile: "9876543210", proof: (await (async () => { T += 40_000; await fns.requestSmsOtp(req({ mobile: "9876543210", role: "customer", mode: "login" })); return fns.verifySmsOtp(req({ mobile: "9876543210", code: lastCode() })); })()).proof }));
  ok("a customer proof cannot create / open a DRIVER login on a number that is a customer's (the one-role rule still decides)", s.ok === false && s.reason === "other_role");

  // wrong guesses lock the code
  T += 40_000; await fns.requestSmsOtp(req({ mobile: "9876543210", role: "customer", mode: "login" })); const c3 = lastCode();
  let last; for (let i = 0; i < 5; i++) last = await fns.verifySmsOtp(req({ mobile: "9876543210", code: "000000" }));
  ok("5 wrong guesses burn the code", last.reason === "locked" && (await fns.verifySmsOtp(req({ mobile: "9876543210", code: c3 }))).ok === false);

  // limits
  const base = gwCalls.length; let count = 0, lastR;
  for (let i = 0; i < 12; i++) { T += 31_000; lastR = await fns.requestSmsOtp(req({ mobile: "9876543210", role: "customer", mode: "login" })); if (lastR.ok) count++; }
  ok("at most 5 SMS per hour to one number, then too_many", count <= 5 && lastR.reason === "too_many" && gwCalls.length - base === count);
  T += 25 * 3600 * 1000; const ipBase = gwCalls.length; let ipLast, ipSent = 0;
  for (let i = 0; i < 25; i++) { const m = `98000000${String(i).padStart(2, "0")}`; users.set(`${m}@customer.apnatransport.local`, "x" + i); ipLast = await fns.requestSmsOtp(req({ mobile: m, role: "customer", mode: "login" }, { ip: "9.9.9.9" })); if (ipLast.ok) ipSent++; }
  ok("one device address can only trigger 20 SMS an hour", ipSent === 20 && ipLast.reason === "too_many" && gwCalls.length - ipBase === 20);
  T += 25 * 3600 * 1000; smsConfig({ dailyOtpCap: 2 }); col("smsOtps").set("day_" + new Date(T + 5.5 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, ""), { count: 2 });
  users.set("9333333333@customer.apnatransport.local", "uc"); r = await fns.requestSmsOtp(req({ mobile: "9333333333", role: "customer", mode: "login" }, { ip: "8.8.8.8" })); ok("the daily cap stops all OTP SMS", r.reason === "quota");

  // a gateway failure never reaches the person as a sent OTP
  smsConfig(); T += 25 * 3600 * 1000; users.set("9444444444@customer.apnatransport.local", "ud"); gwReply = { status: 200, body: '{"status":"FAILED","message":"Header not mapped"}' };
  r = await fns.requestSmsOtp(req({ mobile: "9444444444", role: "customer", mode: "login" }, { ip: "7.7.7.7" })); ok("gateway refusal -> sms_failed (the app falls back to Firebase), nothing stored", r.reason === "sms_failed" && !col("smsOtps").has("9444444444")); gwReply = { status: 200, body: '{"status":"SUCCESS"}' };

  // Admin
  let e1; try { await fns.sendBulkDriverSms(req({ kind: "kycIncomplete", mobiles: ["9555555555"] })); } catch (e) { e1 = e.code; } ok("bulk SMS needs Admin", e1 === "permission-denied");
  const admin = { auth: { token: { admin: true } } };
  r = await fns.sendBulkDriverSms({ ...req({ kind: "reinstall", mobiles: ["9555555555"] }), ...admin }); ok("buttons without a DLT template say so", r.ok === false && r.reason === "no_template");
  const nb = gwCalls.length; r = await fns.sendBulkDriverSms({ ...req({ kind: "kycIncomplete", mobiles: ["9555555555", "9555555556", "bad", "9555555555"] }), ...admin });
  ok("KYC reminder goes to each valid number once, with the driver's own KYC link", r.ok === true && r.sent === 2 && gwCalls.length - nb === 2 && /driverKyc=1&mobile=9555555555/.test(gwCalls[nb].message) && gwCalls[nb].dltTemplateId === "T4");
  ok("the sent state is recorded for the Admin ticks", col("whatsappStatus").get("9555555555").byKind.kycIncomplete.status === "sent" && col("whatsappStatus").get("9555555555").lastKind === "kycIncomplete");
  gwReply = { status: 200, body: '{"status":"FAILED","message":"Template mismatch"}' }; r = await fns.sendBulkDriverSms({ ...req({ kind: "kycIncomplete", mobiles: ["9555555557"] }), ...admin });
  ok("a refused KYC reminder reports why and records the failure (red !)", r.ok === false && r.sent === 0 && /Template mismatch/.test(r.detail) && col("whatsappStatus").get("9555555557").byKind.kycIncomplete.status === "failed" && /Template mismatch/.test(col("whatsappStatus").get("9555555557").byKind.kycIncomplete.reason)); gwReply = { status: 200, body: '{"status":"SUCCESS"}' };
  global.__noSecrets = true; r = await fns.sendBulkDriverSms({ ...req({ kind: "kycIncomplete", mobiles: ["9555555558"] }), ...admin }); ok("missing gateway login names the secrets", r.ok === false && /SMS_API_USER/.test(r.detail)); global.__noSecrets = false;
  col("smsConfig").get("main").otpTestedAt = 0; r = await fns.sendTestSms({ ...req({ kind: "otp", mobile: "9555555559" }), ...admin });
  ok("the test OTP SMS works and unlocks the OTP switch (otpTestedAt)", r.ok === true && col("smsConfig").get("main").otpTestedAt === T);
  e1 = null; try { await fns.sendTestSms(req({ kind: "otp", mobile: "9555555559" })); } catch (e) { e1 = e.code; } ok("test SMS needs Admin", e1 === "permission-denied");

  // triggers
  smsConfig(); col("bookings").set("b1", { customerMobile: "9123456789", driverName: "Ravi", driverMobile: "9666666666", status: "Ongoing" }); col("drivers").set("9666666666", { name: "Ravi", vehicleSpec: { vehicleNumber: "MH12AB1234" } });
  const n0 = gwCalls.length; await fns.smsBookingConfirmed({ params: { bookingId: "b1" }, data: { data: () => ({ otp: "4821", customerMobile: "9123456789" }) } });
  ok("booking confirmed: the customer is texted with driver, plate and pickup OTP", gwCalls.length - n0 === 1 && gwCalls[n0].message === "Apna Transport: Booking confirmed. Driver Ravi (MH12AB1234) will reach you soon. Pickup OTP: 4821" && gwCalls[n0].destinationAddress[0] === "919123456789" && gwCalls[n0].dltTemplateId === "T2");
  col("bookings").set("b2", { status: "AwaitingDriver", pickup: "Hinjewadi Phase 1, Pune, Maharashtra", drop: "Mumbai", ringTargets: ["9700000001", "9700000002"] });
  const ev = (id) => ({ params: { bookingId: id }, data: { after: { data: () => JSON.parse(JSON.stringify(col("bookings").get(id))) } } });
  const n1 = gwCalls.length; await fns.smsNewLoad(ev("b2"));
  ok("new load: every ring target is texted once", gwCalls.length - n1 === 2 && gwCalls[n1].dltTemplateId === "T3" && /New load request from Hinjewadi Phase 1.*to Mumbai/.test(gwCalls[n1].message) && col("bookings").get("b2").smsSentTo.length === 2);
  await fns.smsNewLoad(ev("b2")); ok("a second update texts nobody again", gwCalls.length - n1 === 2);
  col("bookings").get("b2").ringTargets.push("9700000003"); await fns.smsNewLoad(ev("b2")); ok("a driver added by a later escalation round is texted (only him)", gwCalls.length - n1 === 3 && gwCalls[gwCalls.length - 1].destinationAddress[0] === "919700000003");
  ok("the ring fields are never written by the SMS code", JSON.stringify(col("bookings").get("b2")).includes('"ringTargets":["9700000001","9700000002","9700000003"]') && !("alertedDriverMobiles" in col("bookings").get("b2")));
  col("bookings").set("b3", { status: "Ongoing", driverName: "X", ringTargets: ["9700000009"] }); const n2 = gwCalls.length; await fns.smsNewLoad(ev("b3")); ok("a taken booking is never texted", gwCalls.length === n2);
  console.log(bad ? `\n${bad} FAILED` : "\nALL OK"); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
