// DLT SMS Cloud Functions (owner 2026-11-25). Wired into functions/index.js as `Object.assign(exports, require("./smsFunctions")(deps))` -- the dependencies (db, auth, role lookup) are
// passed in so this file never needs to import index.js. The rules are in smsGateway.js / smsOtp.js / smsEvents.js (pure, tested); this file only reads / writes Firestore and calls the gateway.
//   requestSmsOtp / verifySmsOtp   -- the sign-up / login OTP (used by the app only while Admin has switched "SMS OTP" on; otherwise the app keeps using Firebase Phone Auth)
//   sendBulkDriverSms              -- Admin's bulk buttons (KYC reminder); same reply shape as the old WhatsApp bulk callable
//   sendTestSms                    -- Admin's "Send test SMS" (shows the gateway's own reply)
//   smsBookingConfirmed            -- trigger: the customer is texted when a driver accepts (the pickup OTP is made)
//   smsNewLoad                     -- trigger: drivers the ring chose are texted (separate from the frozen ring code; reads `ringTargets`, never writes the ring fields)
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const crypto = require("crypto");
const gw = require("./smsGateway");
const otp = require("./smsOtp");
const ev = require("./smsEvents");
const wa = require("./whatsappStatus");

const SMS_API_USER = defineSecret("SMS_API_USER");
const SMS_API_PASSWORD = defineSecret("SMS_API_PASSWORD");
const SECRETS = [SMS_API_USER, SMS_API_PASSWORD];
const REGION = "asia-south1";

module.exports = function register({ db, FieldValue, lookupMobileRoles, mobileHasRoleAccount }) {
  const out = {};
  const loadConfig = async () => { const s = await db.collection("smsConfig").doc("main").get(); return gw.normalizeConfig(s.exists ? s.data() : null); };
  const creds = () => ({ user: SMS_API_USER.value(), password: SMS_API_PASSWORD.value() });
  const sendOne = (cfg, kind, to, vars) => gw.sendDltSms({ cfg, creds: creds(), kind, to, vars, fetchImpl: fetch });
  const isAdmin = (request) => request.auth && request.auth.token && request.auth.token.admin === true;
  const dayKey = (now) => new Date(now + 5.5 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
  const ipKey = (request) => { const raw = request.rawRequest || {}; const ip = String((raw.headers && raw.headers["x-forwarded-for"]) || raw.ip || "unknown").split(",")[0].trim(); return "ip_" + crypto.createHash("sha1").update(ip).digest("hex").slice(0, 24); };

  // ---- OTP ----
  out.requestSmsOtp = onCall({ region: REGION, secrets: SECRETS }, async (request) => {
    const { mobile: rawMobile, role, mode } = request.data || {};
    const mobile = gw.cleanMobile(rawMobile);
    const toRole = role === "driver" ? "driver" : "customer";
    const toMode = mode === "signup" ? "signup" : "login";
    const cfg = await loadConfig();
    // OTP by SMS is OFF until Admin has tested it and switched it on: the app then simply keeps using Firebase Phone Auth.
    if (!cfg.otpEnabled || !gw.templateFor(cfg, "otp").ok) return { ok: false, reason: "sms_otp_off" };
    if (!gw.isIndianMobile(mobile)) return { ok: false, reason: "invalid_phone" };
    // Only text a number when the sign-in could really go on (this is what stops SMS-pumping): login = it HAS an account, sign-up = it does NOT.
    try {
      const roles = await lookupMobileRoles(toRole, (rr) => mobileHasRoleAccount(mobile, rr));
      if (toMode === "login" && !roles.exists) return { ok: false, reason: roles.otherRoleExists ? "other_role" : "no_account" };
      if (toMode === "signup" && roles.exists) return { ok: false, reason: "exists" };
      if (toMode === "signup" && roles.otherRoleExists) return { ok: false, reason: "other_role" };
    } catch (e) { console.error("[requestSmsOtp] role lookup failed:", e.message); return { ok: false, reason: "error" }; }
    const now = Date.now();
    const col = db.collection("smsOtps");
    try {
      const [ipSnap, daySnap, numSnap] = await Promise.all([col.doc(ipKey(request)).get(), col.doc("day_" + dayKey(now)).get(), col.doc(mobile).get()]);
      const ip = otp.planIp(ipSnap.exists ? ipSnap.data() : null, now);
      if (!ip.ok) return { ok: false, reason: "too_many" };
      if ((daySnap.exists ? Number(daySnap.data().count) || 0 : 0) >= cfg.dailyOtpCap) return { ok: false, reason: "quota" };
      const numDoc = numSnap.exists ? numSnap.data() : null;
      const plan = otp.planSend(numDoc, now);
      if (!plan.ok) return { ok: false, reason: plan.reason, waitSec: plan.waitSec };
      const code = otp.newCode();
      const sent = await sendOne(cfg, "otp", mobile, [code]);
      if (!sent.ok) { console.error(`[requestSmsOtp] gateway: ${sent.reason}: ${sent.detail}`); return { ok: false, reason: "sms_failed" }; }
      await Promise.all([
        col.doc(mobile).set(otp.afterSend(numDoc, now, { mobile, code })),
        col.doc(ipKey(request)).set({ sends: ip.sends, updatedAt: now }),
        col.doc("day_" + dayKey(now)).set({ count: (daySnap.exists ? Number(daySnap.data().count) || 0 : 0) + 1, updatedAt: now }),
      ]);
      return { ok: true, expiresInSec: otp.OTP_TTL_MS / 1000, resendInSec: otp.RESEND_GAP_MS / 1000 };
    } catch (e) { console.error("[requestSmsOtp] failed:", e.message); return { ok: false, reason: "error" }; }
  });

  out.verifySmsOtp = onCall({ region: REGION }, async (request) => {
    const { mobile: rawMobile, code } = request.data || {};
    const mobile = gw.cleanMobile(rawMobile);
    if (!gw.isIndianMobile(mobile)) return { ok: false, reason: "invalid_phone" };
    try {
      const ref = db.collection("smsOtps").doc(mobile);
      const snap = await ref.get();
      const plan = otp.planVerify(snap.exists ? snap.data() : null, mobile, String(code || ""), Date.now());
      if (plan.doc) await ref.set(plan.doc);
      return plan.ok ? { ok: true, proof: plan.proof } : { ok: false, reason: plan.reason === "no_code" ? "expired" : plan.reason };
    } catch (e) { console.error("[verifySmsOtp] failed:", e.message); return { ok: false, reason: "error" }; }
  });

  // Used by otpSignIn (functions/index.js): is this proof good for this number? `consume` removes it after a successful sign-in.
  const checkSmsProof = async (mobile, proof) => {
    const snap = await db.collection("smsOtps").doc(gw.cleanMobile(mobile)).get();
    return otp.checkProof(snap.exists ? snap.data() : null, proof, Date.now());
  };
  const consumeSmsProof = async (mobile) => { try { await db.collection("smsOtps").doc(gw.cleanMobile(mobile)).set({ proof: null, proofUntil: 0, hash: null }, { merge: true }); } catch (e) { console.error("[consumeSmsProof]", e.message); } };
  Object.defineProperty(out, "__smsProof", { value: { checkSmsProof, consumeSmsProof }, enumerable: false });

  // ---- Admin ----
  const BULK_KINDS = { kycIncomplete: "kycReminder" }; // the other old WhatsApp buttons have no DLT template (yet)
  out.sendBulkDriverSms = onCall({ region: REGION, secrets: SECRETS, timeoutSeconds: 300 }, async (request) => {
    if (!isAdmin(request)) throw new HttpsError("permission-denied", "Admin access required.");
    const { kind, mobiles } = request.data || {};
    const list = [...new Set((Array.isArray(mobiles) ? mobiles : []).map(gw.cleanMobile).filter(gw.isIndianMobile))].slice(0, 500);
    if (!list.length) throw new HttpsError("invalid-argument", "mobiles is required.");
    const smsKind = BULK_KINDS[kind];
    if (!smsKind) return { ok: false, sent: 0, requested: list.length, reason: "no_template", detail: "There is no DLT SMS template for this message yet -- only the KYC reminder is set up." };
    const cfg = await loadConfig();
    const t = gw.templateFor(cfg, smsKind);
    if (!t.ok) return { ok: false, sent: 0, requested: list.length, reason: t.reason, detail: t.detail };
    const batchId = `${Date.now()}`; let sent = 0; let failure = null;
    for (let i = 0; i < list.length; i += 5) {
      await Promise.all(list.slice(i, i + 5).map(async (m) => {
        let dsnap = null; try { dsnap = await db.collection("drivers").doc(m).get(); } catch { /* the name is only a greeting */ }
        const r = await sendOne(cfg, smsKind, m, ev.kycVars(dsnap && dsnap.exists ? dsnap.data() : null));
        if (r.ok) sent++; else failure = { reason: r.reason, detail: String(r.detail || "").slice(0, 220) };
        try {
          const at = Date.now(); const ref = db.collection("whatsappStatus").doc(m); // the ticks / red "!" in Admin's driver rows read this record (delivery receipts are not available, so "accepted by the gateway" = one tick)
          await ref.set({ mobile: m, lastKind: kind, updatedAt: at }, { merge: true });
          await ref.update({ [`byKind.${kind}`]: r.ok ? { status: "sent", batchId, submittedAt: at, sentAt: at } : wa.failedSendState(batchId, String(r.detail || r.reason).slice(0, 220), at) });
        } catch (e) { console.error("[sendBulkDriverSms] could not record the tick:", e.message); }
      }));
    }
    return { ok: sent > 0, sent, requested: list.length, ...(sent < list.length && failure ? failure : {}) };
  });

  out.sendTestSms = onCall({ region: REGION, secrets: SECRETS }, async (request) => {
    if (!isAdmin(request)) throw new HttpsError("permission-denied", "Admin access required.");
    const { kind, mobile } = request.data || {};
    if (!gw.KINDS.includes(kind)) throw new HttpsError("invalid-argument", "Unknown message kind.");
    const cfg = await loadConfig();
    const n = gw.countVars(cfg.templates[kind].text);
    const sample = { otp: ["123456"], bookingConfirmed: ["Test Driver", "MH12AB1234"], newLoad: ["Pune", "Mumbai"], kycReminder: ["Test Driver"] }[kind].slice(0, n);
    while (sample.length < n) sample.push("test");
    const r = await sendOne(cfg, kind, mobile, sample);
    if (r.ok && kind === "otp") await db.collection("smsConfig").doc("main").set({ otpTestedAt: Date.now() }, { merge: true });
    return r.ok ? { ok: true, detail: r.detail } : { ok: false, reason: r.reason, detail: r.detail };
  });

  // ---- Triggers ----
  out.smsBookingConfirmed = onDocumentCreated({ document: "bookingOtps/{bookingId}", region: REGION, secrets: SECRETS }, async (event) => {
    try {
      const otpDoc = event.data && event.data.data();
      const bSnap = await db.collection("bookings").doc(event.params.bookingId).get();
      if (!bSnap.exists) return;
      const b = bSnap.data();
      const dSnap = b.driverMobile && !b.fleetBooking ? await db.collection("drivers").doc(String(b.driverMobile)).get() : null;
      const msg = ev.bookingConfirmedSms(b, otpDoc, dSnap && dSnap.exists ? dSnap.data() : null);
      if (!msg) return;
      const cfg = await loadConfig();
      const r = await sendOne(cfg, "bookingConfirmed", msg.to, msg.vars);
      if (!r.ok && r.reason !== "no_template" && r.reason !== "not_configured" && r.reason !== "disabled") console.error(`[smsBookingConfirmed] ${r.reason}: ${r.detail}`);
    } catch (e) { console.error("[smsBookingConfirmed] failed:", e.message); }
  });

  out.smsNewLoad = onDocumentUpdated({ document: "bookings/{bookingId}", region: REGION, secrets: SECRETS, timeoutSeconds: 120 }, async (event) => {
    try {
      const after = event.data && event.data.after.data();
      const { targets } = ev.newLoadTargets(after);
      if (!targets.length) return;
      const cfg = await loadConfig();
      if (!gw.templateFor(cfg, "newLoad").ok) return;
      const ref = db.collection("bookings").doc(event.params.bookingId);
      // Claim first (so a retry / the next update never texts the same driver twice), then send.
      const claimed = await db.runTransaction(async (tx) => {
        const cur = (await tx.get(ref)).data();
        const { targets: t2 } = ev.newLoadTargets(cur);
        if (!t2.length) return [];
        tx.update(ref, { smsSentTo: FieldValue.arrayUnion(...t2.slice(0, 60)) });
        return t2.slice(0, 60);
      });
      const vars = ev.newLoadVars(after);
      for (let i = 0; i < claimed.length; i += 5) await Promise.all(claimed.slice(i, i + 5).map((m) => sendOne(cfg, "newLoad", m, vars).then((r) => { if (!r.ok) console.error(`[smsNewLoad] ${r.reason}: ${r.detail}`); })));
    } catch (e) { console.error("[smsNewLoad] failed:", e.message); }
  });

  return out;
};
