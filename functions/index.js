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

initializeApp();
const db = getFirestore();

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
  // Firebase Phone Auth sets this claim automatically on sign-in (e.g.
  // "+919876543210") -- used to verify the caller is actually a party to
  // this booking, not just any signed-in user who knows the bookingId.
  const callerPhone = request.auth?.token?.phone_number;
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
