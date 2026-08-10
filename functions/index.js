// Sends push notifications for the ride events customers/drivers actually
// care about. Runs server-side (not in the browser) because sending FCM
// pushes needs the Admin SDK's service-account credentials — a browser
// can't hold those safely, so this is the one piece of this app that has
// to live in a Cloud Function instead of client code.
const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
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
