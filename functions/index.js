// Sends push notifications for the ride events customers/drivers actually
// care about. Runs server-side (not in the browser) because sending FCM
// pushes needs the Admin SDK's service-account credentials — a browser
// can't hold those safely, so this is the one piece of this app that has
// to live in a Cloud Function instead of client code.
const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
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

async function sendPush(token, title, body) {
  if (!token) return;
  try {
    await getMessaging().send({ token, notification: { title, body } });
  } catch (e) {
    // A stale/revoked token (e.g. user cleared site data) fails here — that's
    // expected and not worth crashing the trigger over.
    console.error("[push] send failed:", e.message);
  }
}

// New-load alerts need to cut through — loud/vibrating and marked
// high-priority on both Android and web push, so they still surface even
// with the app fully closed and the phone in someone's pocket. Regular
// status-update pushes above (sendPush) stay at normal priority since
// those aren't time-critical the same way.
async function sendLoadAlert(token, load, bookingId) {
  if (!token) return;
  try {
    await getMessaging().send({
      token,
      notification: {
        title: "🔔 नया भाड़ा उपलब्ध है!",
        body: `📍 लोडिंग: ${load.pickup}\n🏁 अनलोडिंग: ${load.drop}\n🚛 गाड़ी: ${load.vehicle || "-"}${load.weight ? ` · ${load.weight}kg` : ""}`,
      },
      android: {
        priority: "high",
        notification: {
          channelId: "new_load_alerts",
          priority: "max",
          visibility: "public",
          defaultSound: true,
          defaultVibrateTimings: false,
          vibrateTimingsMillis: [0, 400, 200, 400, 200, 400],
        },
      },
      webpush: {
        headers: { Urgency: "high" },
        notification: { requireInteraction: true, vibrate: [400, 200, 400, 200, 400], tag: "new-load", renotify: true },
        fcmOptions: { link: "/?open=driver" },
      },
      data: { type: "new_load", bookingId },
    });
  } catch (e) {
    console.error("[push] load-alert send failed:", e.message);
  }
}

// Same lock-hours chart as src/App.jsx's notificationLockHours — kept in
// sync manually since this Cloud Function can't import from the browser
// bundle. Update both together if the chart ever changes.
function notificationLockHours(vehicleCapacityKg) {
  if (vehicleCapacityKg > 16000) return 4;
  if (vehicleCapacityKg > 8000) return 3;
  if (vehicleCapacityKg >= 3000) return 2;
  return 1;
}
function parseScheduledFor(scheduledFor) {
  const [datePart, timePart] = scheduledFor.split(" ");
  return new Date(`${datePart}T${timePart}:00`);
}

// Same great-circle distance + radius as src/App.jsx's haversineKm/BID_RADIUS_KM
// — kept in sync manually, same as the other client-side logic duplicated
// above. Only applies to current (non-advance) loads.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const BID_RADIUS_KM = 100;

// Mirrors src/App.jsx's getBookingWindow — the real-world time window a
// driver is committed to for an already-accepted Ongoing booking.
function getBookingWindow(b) {
  if (!b.hours) return null;
  let start;
  if (b.scheduledFor) start = parseScheduledFor(b.scheduledFor);
  else if (b.acceptedAt?.toMillis) start = new Date(b.acceptedAt.toMillis());
  else if (b.createdAt?.toMillis) start = new Date(b.createdAt.toMillis());
  else return null;
  return { start, end: new Date(start.getTime() + b.hours * 60 * 60 * 1000) };
}

// Mirrors src/App.jsx's findDriverLoadConflict (list-filtering mode, no
// candidate hours known yet) — true if this new load's start time falls
// inside any of the driver's existing Ongoing commitments' window plus the
// vehicle-tonnage buffer ahead of it. Covers both "still mid-trip on a
// current job" and "advance booking coming up soon", not just the latter.
function hasLoadConflict(load, myOngoing, lockHours) {
  const newStart = load.scheduledFor ? parseScheduledFor(load.scheduledFor) : new Date();
  return myOngoing.some((existing) => {
    const win = getBookingWindow(existing);
    if (!win) return false;
    const lockStart = new Date(win.start.getTime() - lockHours * 60 * 60 * 1000);
    return newStart < win.end && newStart >= lockStart;
  });
}

// Fires the moment a customer posts a new load — pushes a loud, high-priority
// alert to every driver who is Online, KYC-approved, not blocked, whose
// vehicle can carry this load, and who isn't currently inside their own
// advance-booking protection window (see notificationLockHours). This is
// what actually reaches a driver whose app is closed/backgrounded — the
// client-side beep+toast in DriverHome only fires while that screen is open.
exports.onNewLoadPosted = onDocumentCreated("bookings/{bookingId}", async (event) => {
  const load = event.data?.data();
  if (!load || load.status !== "Bidding") return;

  const [vehicleTypesSnap, driversSnap, ongoingSnap] = await Promise.all([
    db.collection("vehicleTypes").get(),
    db.collection("drivers").get(),
    db.collection("bookings").where("status", "==", "Ongoing").get(),
  ]);

  const vehicleTypesByKey = {};
  vehicleTypesSnap.forEach((doc) => { vehicleTypesByKey[doc.id] = doc.data(); });
  const loadVehicleDef = vehicleTypesByKey[load.vehicle];

  const ongoingByDriver = {};
  ongoingSnap.forEach((doc) => {
    const b = doc.data();
    if (!b.driverName) return;
    (ongoingByDriver[b.driverName] ||= []).push(b);
  });

  const sends = [];
  driversSnap.forEach((doc) => {
    const driver = doc.data();
    if (!driver.online || driver.kyc !== "Approved" || driver.blacklisted || !driver.fcmToken) return;

    // Same "bigger truck can carry a smaller load" rule as the client's
    // openLoads filter in DriverHome.
    const driverVehicleDef = vehicleTypesByKey[driver.vehicleSpec?.type];
    if (driverVehicleDef && loadVehicleDef && loadVehicleDef.capacityKg > driverVehicleDef.capacityKg) return;
    if (driverVehicleDef && !loadVehicleDef && load.vehicle !== driver.vehicleSpec?.type) return;

    // Current (non-advance) loads only alert drivers within BID_RADIUS_KM of
    // the pickup point — same rule as the client's openLoads filter. Advance
    // bookings are exempt since the driver has time to travel there.
    if (!load.scheduledFor && load.pickupLat != null && load.pickupLng != null) {
      if (!driver.lastKnownLocation) return;
      const distKm = haversineKm(driver.lastKnownLocation.lat, driver.lastKnownLocation.lng, load.pickupLat, load.pickupLng);
      if (distKm > BID_RADIUS_KM) return;
    }

    // No ping if this load would conflict with a commitment the driver
    // already has (current trip in progress, or an upcoming Advance booking
    // plus its vehicle-tonnage buffer) — they can't bid on it anyway.
    const lockHours = notificationLockHours(driverVehicleDef?.capacityKg || 0);
    if (hasLoadConflict(load, ongoingByDriver[driver.name] || [], lockHours)) return;

    sends.push(sendLoadAlert(driver.fcmToken, load, event.params.bookingId));
  });

  await Promise.all(sends);
});

async function getCustomerToken(customerMobile) {
  if (!customerMobile) return null;
  const snap = await db.collection("customers").doc(customerMobile).get();
  return snap.exists ? snap.data().fcmToken : null;
}

async function getDriverTokenByName(driverName) {
  if (!driverName) return null;
  const snap = await db.collection("drivers").where("name", "==", driverName).limit(1).get();
  return snap.empty ? null : snap.docs[0].data().fcmToken;
}

// Fires whenever a booking doc changes — the moment the customer's single
// scanned/uploaded invoice shows up (documents.file), alerts the driver.
// Guarded on the before-value so a later, unrelated update to the same
// booking doesn't re-send this every time.
exports.onBillDocumentsUploaded = onDocumentUpdated("bookings/{bookingId}", async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!after?.documents?.file?.url || before?.documents?.file?.url) return;

  const driverToken = await getDriverTokenByName(after.driverName);
  await sendPush(driverToken, "Invoice Received", "The customer has sent the invoice for this trip — open the app to view it.");
});

exports.onBookingUpdate = onDocumentUpdated("bookings/{bookingId}", async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;

  // A bid was accepted — trip flips from Bidding to Ongoing.
  if (before.status === "Bidding" && after.status === "Ongoing" && after.driverName) {
    const [customerToken, driverToken] = await Promise.all([
      getCustomerToken(after.customerMobile),
      getDriverTokenByName(after.driverName),
    ]);
    await Promise.all([
      sendPush(customerToken, "Ride confirmed", `${after.driverName} accepted your load and is on the way.`),
      sendPush(driverToken, "Bid accepted!", `Your trip to ${after.drop} has started.`),
    ]);
    return;
  }

  // Trip marked complete.
  if (before.status !== "Completed" && after.status === "Completed") {
    const customerToken = await getCustomerToken(after.customerMobile);
    await sendPush(customerToken, "Trip completed", `Your delivery to ${after.drop} is complete.`);
    return;
  }

  // A new bid landed while the load is still open.
  const beforeBidCount = (before.bids || []).length;
  const afterBids = after.bids || [];
  if (after.status === "Bidding" && afterBids.length > beforeBidCount) {
    const newBid = afterBids[afterBids.length - 1];
    const customerToken = await getCustomerToken(after.customerMobile);
    await sendPush(customerToken, "New bid received", `${newBid?.driverName || "A driver"} bid ₹${newBid?.amount ?? ""} for your load.`);
  }
});

// Mirrors src/App.jsx's isInTrial/TRIAL_DAYS — kept in sync manually, same
// as the other client-side logic duplicated above. Actual trial gating
// (commission, minimum wallet, KYC auto-approval) is computed live from
// createdAt everywhere it's used, both here and on the client — nothing
// reads trialEndNotified for that. It exists purely so this nightly job
// doesn't re-send the same "trial ended" push every night after day 30.
const TRIAL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const isInTrial = (createdAt) => (createdAt?.toMillis ? (Date.now() - createdAt.toMillis()) < TRIAL_DAYS * DAY_MS : true);

// Runs daily at midnight IST. A driver whose 30-day trial has just ended
// (and who hasn't already been notified) gets a one-time push telling them
// so — the admin's Free Trial / Main Routine split itself updates on its
// own the moment isInTrial flips, with no dependency on this job having
// run, so a missed night here only delays the notification, not the
// commission/wallet rules actually taking effect.
exports.checkTrialExpirations = onSchedule({ schedule: "0 0 * * *", timeZone: "Asia/Kolkata" }, async () => {
  const driversSnap = await db.collection("drivers").get();
  const updates = [];
  driversSnap.forEach((doc) => {
    const driver = doc.data();
    if (driver.trialEndNotified || isInTrial(driver.createdAt) || !driver.createdAt) return;
    updates.push(
      sendPush(driver.fcmToken, "Free trial ended", "Your 30-day free trial has ended.")
        .then(() => doc.ref.update({ trialEndNotified: true }))
    );
  });
  await Promise.all(updates);
});

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
    deletions.push(
      doc.ref.delete().then(async () => {
        const token = await getCustomerToken(b.customerMobile);
        await sendPush(token, "Load removed", `No driver was confirmed for your ${b.pickup} → ${b.drop} load within 6 hours, so it was removed. Feel free to post it again.`);
      })
    );
  });
  await Promise.all(deletions);
});

// Admin's "Send Notification" screen (AdminNotify) -- sends a real FCM push
// to one driver/customer or every driver/customer, and logs it to
// adminNotifications so it becomes a genuine, persisted announcement both
// the admin's "Sent Notifications" list AND the recipient's own "Admin
// Announcements" inbox (hamburger menu, both roles) read from -- not just a
// one-off push that's gone once the toast disappears. A recipient who has
// the app open sees it immediately as the same foreground toast every other
// push already uses; closed/backgrounded, it arrives as a normal OS
// notification via FCM.
exports.sendAdminNotification = onCall({ region: "asia-south1" }, async (request) => {
  if (request.auth?.token?.admin !== true) throw new HttpsError("permission-denied", "Admin access required.");
  const { target, message, audience } = request.data || {};
  const text = (message || "").trim();
  if (!text) throw new HttpsError("invalid-argument", "message is required.");
  const toRole = audience === "customer" ? "customer" : "driver";
  const col = toRole === "customer" ? "customers" : "drivers";

  let recipients;
  let targetName = null;
  if (!target || target === "all") {
    const snap = await db.collection(col).get();
    recipients = snap.docs.map((d) => ({ fcmToken: d.data().fcmToken }));
  } else if (Array.isArray(target)) {
    // A specific list of mobiles (e.g. Admin's KYC desk "Send reminder to
    // all incomplete" button) rather than a single recipient or everyone.
    const snaps = await Promise.all(target.map((m) => db.collection(col).doc(m).get()));
    recipients = snaps.filter((s) => s.exists).map((s) => ({ fcmToken: s.data().fcmToken }));
    targetName = `${target.length} ${toRole === "driver" ? "drivers" : "customers"}`;
  } else {
    const snap = await db.collection(col).doc(target).get();
    if (!snap.exists) throw new HttpsError("not-found", `${toRole} not found.`);
    targetName = snap.data().name || target;
    recipients = [{ fcmToken: snap.data().fcmToken }];
  }

  const sendable = recipients.filter((r) => r.fcmToken);
  await Promise.all(sendable.map((r) => sendPush(r.fcmToken, "📢 Message from Admin", text)));

  await db.collection("adminNotifications").add({
    toRole,
    target: target && target !== "all" ? target : "all",
    targetName,
    message: text,
    recipientCount: sendable.length,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, sentCount: sendable.length };
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

// ---------------- Forgot PIN (SMS recovery for PIN-based login) ----------------
// Customer/Driver signup and normal login are pure client-side Firebase
// email/password calls (see CustomerOnboarding/DriverOnboarding) -- no
// server involvement, no SMS, no reCAPTCHA. The one place a PIN-based
// account still needs a Cloud Function is recovering a forgotten PIN,
// since resetting a password without knowing the old one requires Admin
// SDK privileges a browser can't hold. Two calls: sendForgotPinOtp (texts
// a code via Exotel) and resetPinWithOtp (checks it, then sets the new
// PIN in one step -- no separate "verified" round-trip needed since there's
// nothing else to do with a bare verification here).
//
// Needs the same EXOTEL_SID/API_KEY/API_TOKEN secrets as initiateMaskedCall
// above (same Exotel account) plus EXOTEL_SMS_SENDER_ID -- the DLT-approved
// SMS sender header (a short alphanumeric code, NOT a phone number, so
// distinct from EXOTEL_CALLER_ID which is a real ExoPhone used for calls).
// Until India's DLT template for this SMS is registered and approved,
// sendForgotPinOtp returns reason: "not_configured" instead of throwing --
// same graceful-degradation pattern as initiateMaskedCall.
const EXOTEL_SMS_SENDER_ID = defineSecret("EXOTEL_SMS_SENDER_ID");

exports.sendForgotPinOtp = onCall({ region: "asia-south1", secrets: [EXOTEL_SID, EXOTEL_API_KEY, EXOTEL_API_TOKEN, EXOTEL_SMS_SENDER_ID] }, async (request) => {
  const { mobile, role } = request.data || {};
  if (!/^[0-9]{10}$/.test(mobile || "")) throw new HttpsError("invalid-argument", "A valid 10-digit mobile number is required.");
  const toRole = role === "driver" ? "driver" : "customer";
  const key = `${toRole}_${mobile}`;

  // Only makes sense for a number that already has a PIN account -- also
  // doubles as a cheap existence check so this can't be used to fish for
  // which numbers are registered (same error either way, see below).
  try {
    await getAuth().getUserByEmail(pinAuthEmail(mobile, toRole));
  } catch {
    return { ok: false, reason: "not_found" };
  }

  // Rate limit: max 5 sends per mobile+role per rolling hour -- this is a
  // recovery flow, not the main login path, so real usage should be rare;
  // this mainly guards against a script hammering the endpoint.
  const limitRef = db.collection("otpRateLimits").doc(key);
  const now = Date.now();
  const limitSnap = await limitRef.get();
  const limitData = limitSnap.exists ? limitSnap.data() : null;
  if (limitData && now - limitData.windowStart < 60 * 60 * 1000) {
    if (limitData.count >= 5) throw new HttpsError("resource-exhausted", "Too many attempts — please wait a while before trying again.");
    await limitRef.update({ count: limitData.count + 1 });
  } else {
    await limitRef.set({ windowStart: now, count: 1 });
  }

  const sid = EXOTEL_SID.value(), apiKey = EXOTEL_API_KEY.value(), apiToken = EXOTEL_API_TOKEN.value(), senderId = EXOTEL_SMS_SENDER_ID.value();
  if (!sid || !apiKey || !apiToken || !senderId) return { ok: false, reason: "not_configured" };

  const code = String(Math.floor(100000 + Math.random() * 900000));
  await db.collection("otpCodes").doc(key).set({ code, expiresAt: now + 5 * 60 * 1000, attempts: 0 });

  const basicAuth = Buffer.from(`${apiKey}:${apiToken}`).toString("base64");
  const body = new URLSearchParams({
    From: senderId, To: `+91${mobile}`,
    Body: `${code} is your Apna Transport PIN reset code. Valid for 5 minutes. Do not share this with anyone.`,
  });
  try {
    const res = await fetch(`https://api.exotel.com/v1/Accounts/${sid}/Sms/send.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error("[forgotPin] Exotel rejected the send:", data);
      return { ok: false, reason: "sms_failed" };
    }
  } catch (e) {
    console.error("[forgotPin] Exotel SMS request failed:", e.message);
    return { ok: false, reason: "sms_failed" };
  }
  return { ok: true };
});

exports.resetPinWithOtp = onCall({ region: "asia-south1" }, async (request) => {
  const { mobile, role, code, newPin } = request.data || {};
  const toRole = role === "driver" ? "driver" : "customer";
  if (!/^[0-9]{10}$/.test(mobile || "") || !code || !/^[0-9]{6}$/.test(newPin || "")) {
    throw new HttpsError("invalid-argument", "mobile, code, and a 6-digit newPin are required.");
  }
  const key = `${toRole}_${mobile}`;
  const ref = db.collection("otpCodes").doc(key);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "not_found" };
  const data = snap.data();
  if (Date.now() > data.expiresAt) { await ref.delete(); return { ok: false, reason: "expired" }; }
  if ((data.attempts || 0) >= 5) { await ref.delete(); return { ok: false, reason: "too_many_attempts" }; }
  if (data.code !== String(code)) {
    await ref.update({ attempts: (data.attempts || 0) + 1 });
    return { ok: false, reason: "wrong_code" };
  }
  await ref.delete();

  try {
    const user = await getAuth().getUserByEmail(pinAuthEmail(mobile, toRole));
    await getAuth().updateUser(user.uid, { password: newPin });
  } catch (e) {
    console.error("[forgotPin] password reset failed:", e.message);
    return { ok: false, reason: "reset_failed" };
  }
  return { ok: true };
});
