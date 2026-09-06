const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

initializeApp();
const db = getFirestore();

// PIN-based login (src/App.jsx: CustomerOnboarding/DriverOnboarding) signs
// each customer/driver in as a normal Firebase email/password account under
// a synthetic, never-shown "email" built from their mobile number -- this
// domain is that convention, shared between the client (which constructs
// the same string to call signInWithEmailAndPassword) and this file (which
// needs it to look accounts up for password-reset). Namespaced by role
// (customer/driver) because the app deliberately lets the same phone number
// hold both a customer and a driver account at once -- see firebaseClient.js.
const PIN_AUTH_EMAIL_DOMAIN = "apnatransport.local";
function pinAuthEmail(mobile, role) {
  return `${mobile}@${role === "driver" ? "driver" : "customer"}.${PIN_AUTH_EMAIL_DOMAIN}`;
}

// A real Firebase Phone Auth session carries request.auth.token.phone_number
// automatically. A PIN-based session doesn't -- its identity is the
// synthetic email instead, so this parses the mobile number back out of it
// to get the same "+91XXXXXXXXXX" shape every other server-side check
// (initiateMaskedCall, isCustomer/isDriver comparisons) already expects.
// Returns null for anything that matches neither shape.
function callerPhoneFromAuth(token) {
  if (token?.phone_number) return token.phone_number;
  const match = (token?.email || "").match(/^(\d{10})@(?:customer|driver)\.apnatransport\.local$/);
  return match ? `+91${match[1]}` : null;
}

// Runs hourly. A customer's load that has sat in "Bidding" for 6+ hours
// gets deleted outright -- covers both cases: zero bids at all, or bids
// came in but the customer never accepted one. Either way, 6 hours with
// nothing resolved means it's dead weight, not something still "awaiting
// bids" on Admin's tile. This is a hard delete (not the status-flip a
// manual cancel uses) -- the doc is gone, nothing left in Admin's
// Cancelled history for it, per explicit product decision. Frees the
// customer to re-post instead of it quietly rotting forever.
const STALE_BID_HOURS = 6;
exports.expireStaleLoads = onSchedule({ schedule: "0 * * * *", timeZone: "Asia/Kolkata" }, async () => {
  const cutoff = Date.now() - STALE_BID_HOURS * 60 * 60 * 1000;
  const snap = await db.collection("bookings").where("status", "==", "Bidding").get();
  const deletions = [];
  snap.forEach((doc) => {
    const b = doc.data();
    if (!b.createdAt?.toMillis || b.createdAt.toMillis() > cutoff) return;
    deletions.push(doc.ref.delete());
  });
  await Promise.all(deletions);
});

// Admin's "Send Notification" screen (AdminNotify) -- logs a message to
// adminNotifications so it becomes a genuine, persisted announcement both
// the admin's "Sent Notifications" list AND the recipient's own "Admin
// Announcements" inbox (hamburger menu, both roles) read from. Purely
// in-app now -- no push is sent, so a recipient only sees it once they
// open the app (banner/badge/inbox), not as an OS notification while
// it's closed.
exports.sendAdminNotification = onCall({ region: "asia-south1" }, async (request) => {
  if (request.auth?.token?.admin !== true) throw new HttpsError("permission-denied", "Admin access required.");
  const { target, message, audience } = request.data || {};
  const text = (message || "").trim();
  if (!text) throw new HttpsError("invalid-argument", "message is required.");
  const toRole = audience === "customer" ? "customer" : "driver";
  const col = toRole === "customer" ? "customers" : "drivers";

  let recipientCount;
  let targetName = null;
  if (!target || target === "all") {
    const snap = await db.collection(col).count().get();
    recipientCount = snap.data().count;
  } else if (Array.isArray(target)) {
    // A specific list of mobiles (e.g. Admin's KYC desk "Send reminder to
    // all incomplete" button) rather than a single recipient or everyone.
    recipientCount = target.length;
    targetName = `${target.length} ${toRole === "driver" ? "drivers" : "customers"}`;
  } else {
    const snap = await db.collection(col).doc(target).get();
    if (!snap.exists) throw new HttpsError("not-found", `${toRole} not found.`);
    targetName = snap.data().name || target;
    recipientCount = 1;
  }

  await db.collection("adminNotifications").add({
    toRole,
    target: target && target !== "all" ? target : "all",
    targetName,
    message: text,
    recipientCount,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, sentCount: recipientCount };
});

// ---------------- Number masking (Exotel) ----------------
// Bridges a call between a booking's customer and driver through Exotel's
// Connect API instead of exposing either side's real number to the other:
// Exotel rings the caller's own phone first, then on answer connects them
// to the other party with Exotel's number as the caller ID both sides see.
// Requested specifically to stop customer/driver going direct off-platform
// after their first trip, keep personal numbers private, make the call
// recognizable, and leave a call log tied to the booking for disputes.
//
// Secrets (set via `firebase functions:secrets:set NAME`, never hardcoded
// or committed): EXOTEL_SID/API_KEY/API_TOKEN from the Exotel dashboard,
// EXOTEL_CALLER_ID is the ExoPhone (virtual number) provisioned for
// masking. Until all four are set, this returns reason: "not_configured"
// instead of throwing -- the client falls back to a plain tel: link so
// calling keeps working while Exotel is still being set up.
const EXOTEL_SID = defineSecret("EXOTEL_SID");
const EXOTEL_API_KEY = defineSecret("EXOTEL_API_KEY");
const EXOTEL_API_TOKEN = defineSecret("EXOTEL_API_TOKEN");
const EXOTEL_CALLER_ID = defineSecret("EXOTEL_CALLER_ID");

exports.initiateMaskedCall = onCall({ region: "asia-south1", secrets: [EXOTEL_SID, EXOTEL_API_KEY, EXOTEL_API_TOKEN, EXOTEL_CALLER_ID] }, async (request) => {
  const { bookingId } = request.data || {};
  // Real Firebase Phone Auth sessions carry the verified number as
  // request.auth.token.phone_number automatically (e.g. "+919876543210").
  // PIN-based sessions (see callerPhoneFromAuth below) don't have that
  // claim -- their identity comes from the synthetic email instead, so it
  // has to be parsed back out to get the same "+91XXXXXXXXXX" shape.
  const callerPhone = callerPhoneFromAuth(request.auth?.token);
  if (!callerPhone) throw new HttpsError("unauthenticated", "Sign in required.");
  if (!bookingId) throw new HttpsError("invalid-argument", "bookingId is required.");

  const bookingSnap = await db.collection("bookings").doc(bookingId).get();
  if (!bookingSnap.exists) throw new HttpsError("not-found", "Booking not found.");
  const booking = bookingSnap.data();

  const isCustomer = callerPhone === `+91${booking.customerMobile}`;
  const isDriver = !!booking.driverMobile && callerPhone === `+91${booking.driverMobile}`;
  if (!isCustomer && !isDriver) throw new HttpsError("permission-denied", "You're not a party to this booking.");

  const otherMobile = isCustomer ? booking.driverMobile : booking.customerMobile;
  if (!otherMobile) return { ok: false, reason: "no_other_party" };

  const sid = EXOTEL_SID.value(), apiKey = EXOTEL_API_KEY.value(), apiToken = EXOTEL_API_TOKEN.value(), callerId = EXOTEL_CALLER_ID.value();
  if (!sid || !apiKey || !apiToken || !callerId) return { ok: false, reason: "not_configured" };

  const basicAuth = Buffer.from(`${apiKey}:${apiToken}`).toString("base64");
  const body = new URLSearchParams({ From: callerPhone, To: `+91${otherMobile}`, CallerId: callerId, CallType: "trans" });
  let exotelCallSid = null;
  try {
    const res = await fetch(`https://api.exotel.com/v1/Accounts/${sid}/Calls/connect.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await res.json();
    if (!res.ok) { console.error("[maskedCall] Exotel rejected the request:", data); return { ok: false, reason: "exotel_error" }; }
    exotelCallSid = data?.Call?.Sid || null;
  } catch (e) {
    console.error("[maskedCall] Exotel request failed:", e.message);
    return { ok: false, reason: "exotel_error" };
  }

  // Audit trail for dispute resolution -- which booking, who initiated,
  // when. Written server-side with Admin privileges (bypasses Firestore
  // rules), readable by admin only -- see firestore.rules.
  await db.collection("callLogs").add({
    bookingId,
    initiatedBy: isCustomer ? "customer" : "driver",
    exotelCallSid,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});

// ---------------- Forgot PIN (recovery via Firebase Phone Auth) ----------------
// Customer/Driver signup and normal login are pure client-side Firebase
// email/password calls (see CustomerOnboarding/DriverOnboarding) -- no
// server involvement, no SMS, no reCAPTCHA. Recovering a forgotten PIN
// still needs a Cloud Function (setting a password without knowing the old
// one requires Admin SDK privileges a browser can't hold), but the actual
// "prove you own this number" step reuses Firebase's own Phone Auth
// (reCAPTCHA + real SMS OTP) instead of a custom Exotel-based one --
// that flow already works today with no DLT template to wait on, since
// it's the same mechanism the app used for every login before PIN auth.
// Showing the "I'm not a robot" check on this one rare recovery path is a
// far smaller cost than showing it on every signup/login, which was the
// actual complaint that started this whole migration.
//
// The client calls this already signed in via a fresh signInWithPhoneNumber
// (see CustomerOnboarding/DriverOnboarding's Forgot PIN flow) -- so
// request.auth.token.phone_number is trusted directly as real proof,
// no separate code-matching step needed here. Creates the PIN account if
// this mobile+role never had one yet (covers "forgot a PIN I never
// actually set"), otherwise resets the existing one's password.
//
// newPin here is NOT the raw 4-digit PIN the person typed -- the client
// already ran it through pinToPassword (see firebaseClient.js) before this
// call, the same transform used at signup/login, purely to clear Firebase
// Auth's 6-character password minimum (the 4 digits are still the whole
// secret; the added prefix is a public constant, not a security layer).
// This function just stores whatever string it's given, unaware that
// happened -- hence the length-only check below rather than a digit regex.
exports.resetPinAfterPhoneVerify = onCall({ region: "asia-south1" }, async (request) => {
  const phone = request.auth?.token?.phone_number;
  if (!phone) throw new HttpsError("unauthenticated", "Phone verification required.");
  const mobile = phone.replace("+91", "");
  const { role, newPin } = request.data || {};
  const toRole = role === "driver" ? "driver" : "customer";
  if (typeof newPin !== "string" || newPin.length < 6) throw new HttpsError("invalid-argument", "A valid newPin is required.");

  const email = pinAuthEmail(mobile, toRole);
  try {
    const user = await getAuth().getUserByEmail(email);
    await getAuth().updateUser(user.uid, { password: newPin });
  } catch (e) {
    if (e.code === "auth/user-not-found") {
      await getAuth().createUser({ email, password: newPin });
    } else {
      console.error("[forgotPin] reset failed:", e.message);
      return { ok: false, reason: "reset_failed" };
    }
  }
  return { ok: true };
});
