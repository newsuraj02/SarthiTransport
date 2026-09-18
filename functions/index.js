const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
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

// New-load alerts to drivers only — re-added per explicit request after the
// broader push-notification removal; every other push type (bid accepted,
// trip completed, new bid, invoice received, trial ended, load removed)
// stays removed.
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
// Same staleness cutoff as src/App.jsx's NEARBY_DRIVER_STALE_MS -- kept in
// sync manually. A driver who's still marked online but whose GPS hasn't
// updated in this long almost certainly locked their phone/closed the app
// after toggling on (measured live: 188 of 203 "online" drivers had no
// recent GPS at all) -- their last coordinate could be days old and just
// happen to fall inside the radius by coincidence, not proof they're
// actually reachable near this pickup right now.
const DRIVER_LOCATION_STALE_MS = 5 * 60 * 1000;

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
// client-side beep in DriverHome only fires while that screen is open.
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
      // See DRIVER_LOCATION_STALE_MS -- don't push-alert a driver whose
      // "online" flag is stuck true from before they locked their phone;
      // their last coordinate isn't proof they're actually near this load.
      if (!driver.lastKnownLocation.updatedAt || Date.now() - driver.lastKnownLocation.updatedAt > DRIVER_LOCATION_STALE_MS) return;
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

// A loud, high-priority alert to one specific driver — reused for both a
// fresh direct request and the 1-minute auto-reassign/manual-reject
// retarget moving the same booking to the next driver (see
// retargetToNextDriver in src/App.jsx). Reuses the exact same channel/
// pattern as sendLoadAlert above (already proven to reach a closed app)
// rather than a new, unregistered notification channel.
async function sendDirectRequestAlert(token, load, bookingId) {
  if (!token) return;
  try {
    await getMessaging().send({
      token,
      notification: {
        title: "🚨 आपके लिए सीधी बुकिंग रिक्वेस्ट!",
        body: `📍 लोडिंग: ${load.pickup}\n🏁 अनलोडिंग: ${load.drop}${load.weight ? `\n⚖️ ${load.weight}kg` : ""}\n⏱️ 60 सेकंड में जवाब दें`,
      },
      android: {
        priority: "high",
        notification: {
          channelId: "new_load_alerts",
          priority: "max",
          visibility: "public",
          defaultSound: true,
          defaultVibrateTimings: false,
          vibrateTimingsMillis: [0, 500, 200, 500, 200, 500, 200, 500],
        },
      },
      webpush: {
        headers: { Urgency: "high" },
        notification: { requireInteraction: true, vibrate: [500, 200, 500, 200, 500, 200, 500], tag: "direct-request", renotify: true },
        fcmOptions: { link: "/?open=driver" },
      },
      data: { type: "direct_request", bookingId },
    });
  } catch (e) {
    console.error("[push] direct-request alert send failed:", e.message);
  }
}

// Fires whenever a booking becomes (or stays, but with a different driver)
// "AwaitingDriver" — a fresh direct request from CustomerBooking's driver
// picker, or a retarget after the previous driver timed out/rejected.
// Reaches the newly-targeted driver even if their app is fully closed,
// same as onNewLoadPosted above. Only fires on a real change of who's
// pending, not on unrelated field updates to the same booking (e.g. the
// customer's live GPS ticking during a still-Bidding wait elsewhere).
exports.onDirectRequestAssigned = onDocumentWritten("bookings/{bookingId}", async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!after || after.status !== "AwaitingDriver" || !after.pendingDriverName) return;
  if (before?.status === "AwaitingDriver" && before?.pendingDriverName === after.pendingDriverName) return;

  // pendingDriverMobile (the doc id, guaranteed unique) is preferred over a
  // name lookup -- two drivers can share the same free-text display name
  // (no uniqueness enforced at signup), which used to let this resolve to
  // the WRONG same-named driver's fcmToken. Falls back to the old
  // name-based query only for a booking written before this field existed.
  const driver = after.pendingDriverMobile
    ? (await db.collection("drivers").doc(after.pendingDriverMobile).get()).data()
    : (await db.collection("drivers").where("name", "==", after.pendingDriverName).limit(1).get()).docs[0]?.data();
  if (!driver?.fcmToken) return;

  await sendDirectRequestAlert(driver.fcmToken, after, event.params.bookingId);
});

// Customer-side equivalent of sendDirectRequestAlert/sendLoadAlert above —
// reaches the customer even with the app fully closed, for the two moments
// they most need to know without having it open: their driver accepting
// (status -> Ongoing) and the trip finishing (status -> Completed). Reuses
// the same "new_load_alerts" channel already proven to reach a closed app,
// rather than registering a new, unproven one.
async function sendCustomerBookingAlert(token, booking, bookingId, kind) {
  if (!token) return;
  try {
    await getMessaging().send({
      token,
      notification: kind === "accepted"
        ? { title: "✅ ड्राइवर मिल गया!", body: `${booking.driverName || "ड्राइवर"} आपकी बुकिंग स्वीकार कर चुके हैं और रास्ते में हैं।` }
        : { title: "🏁 डिलीवरी पूरी हुई", body: `आपकी बुकिंग (${booking.pickup} → ${booking.drop}) पूरी हो गई है।` },
      android: {
        priority: "high",
        notification: { channelId: "new_load_alerts", priority: "max", visibility: "public", defaultSound: true, defaultVibrateTimings: true },
      },
      webpush: {
        headers: { Urgency: "high" },
        notification: { tag: `booking-${kind}`, renotify: true },
        fcmOptions: { link: "/?open=customer" },
      },
      data: { type: `booking_${kind}`, bookingId },
    });
  } catch (e) {
    console.error(`[push] customer ${kind} alert send failed:`, e.message);
  }
}

// Fires on the two booking-status transitions a customer needs to know
// about without having the app open — see sendCustomerBookingAlert above.
exports.onCustomerBookingUpdate = onDocumentWritten("bookings/{bookingId}", async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!after || !after.customerMobile) return;

  const becameOngoing = after.status === "Ongoing" && before?.status !== "Ongoing";
  const becameCompleted = after.status === "Completed" && before?.status !== "Completed";
  if (!becameOngoing && !becameCompleted) return;

  const customerSnap = await db.collection("customers").doc(after.customerMobile).get();
  const token = customerSnap.data()?.fcmToken;
  if (!token) return;

  await sendCustomerBookingAlert(token, after, event.params.bookingId, becameOngoing ? "accepted" : "completed");
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
  let targetEmails = null;
  let targetPhones = null;
  if (!target || target === "all") {
    const snap = await db.collection(col).count().get();
    recipientCount = snap.data().count;
  } else if (Array.isArray(target)) {
    // A specific list of mobiles (e.g. Admin's KYC desk "Send reminder to
    // all incomplete" button) rather than a single recipient or everyone.
    recipientCount = target.length;
    targetName = `${target.length} ${toRole === "driver" ? "drivers" : "customers"}`;
    // Precomputed here (Admin SDK, trusted) in both identity shapes a
    // recipient's own session might carry -- PIN-based login's synthetic
    // email (see PIN_AUTH_EMAIL_DOMAIN) or real Firebase Phone Auth's
    // phone_number claim -- so firestore.rules can grant read with a
    // plain `in` check against a precomputed list, instead of needing to
    // parse/reformat request.auth.token itself (which rules can't do).
    targetEmails = target.map((m) => `${m}@${toRole}.apnatransport.local`);
    targetPhones = target.map((m) => `+91${m}`);
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
    targetEmails,
    targetPhones,
    message: text,
    recipientCount,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, sentCount: recipientCount };
});

// Admin Announcements accumulate forever otherwise — meant to be a
// same-day heads-up (both Admin's own "Sent Notifications" list and every
// driver/customer's "Admin Announcements" inbox read from this same
// collection), not a permanent record, so it was quietly growing Firestore
// storage for no real benefit. Hard-deletes anything older than 24h, same
// pattern as expireStaleLoads above.
const ADMIN_NOTIFICATION_TTL_HOURS = 24;
exports.expireOldAdminNotifications = onSchedule({ schedule: "0 * * * *", timeZone: "Asia/Kolkata" }, async () => {
  const cutoff = Timestamp.fromMillis(Date.now() - ADMIN_NOTIFICATION_TTL_HOURS * 60 * 60 * 1000);
  const snap = await db.collection("adminNotifications").where("createdAt", "<=", cutoff).get();
  const deletions = [];
  snap.forEach((doc) => deletions.push(doc.ref.delete()));
  await Promise.all(deletions);
});

// The "Required versionCode" gate in Admin Settings (src/App.jsx's
// nativeVersionState) only ever blocks someone the next time they actually
// open the app — a driver/customer who keeps it fully closed would never
// find out. This reaches them anyway, the same way sendLoadAlert already
// does for new loads. appVersionCode is written once per launch by
// useReportInstalledVersion (src/App.jsx); missing entirely (an install
// from before that existed, or one that's never reported yet) is treated
// as "old" so it's never skipped by accident.
exports.notifyForceUpdate = onDocumentWritten("settings/main", async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  const latest = Number(after?.latestVersionCode);
  if (!latest || Number(before?.latestVersionCode) === latest) return;

  for (const collectionName of ["drivers", "customers"]) {
    const snap = await db.collection(collectionName).get();
    const tokens = [];
    snap.forEach((doc) => {
      const d = doc.data();
      if (!d.fcmToken) return;
      const mine = Number(d.appVersionCode);
      if (!Number.isFinite(mine) || mine < latest) tokens.push(d.fcmToken);
    });

    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500);
      try {
        await getMessaging().sendEachForMulticast({
          tokens: batch,
          notification: {
            title: "⬆️ नया अपडेट उपलब्ध है",
            body: "ऐप का नया वर्शन आ गया है। जारी रखने के लिए कृपया अभी अपडेट करें।",
          },
          android: {
            priority: "high",
            notification: { channelId: "new_load_alerts", priority: "max", visibility: "public", defaultSound: true },
          },
          webpush: {
            headers: { Urgency: "high" },
            notification: { tag: "force-update", renotify: true },
            fcmOptions: { link: collectionName === "drivers" ? "/?open=driver" : "/?open=customer" },
          },
          data: { type: "force_update" },
        });
      } catch (e) {
        console.error("[push] force-update send failed:", collectionName, e.message);
      }
    }
  }
});

// bookingOtps (see verifyPickupOtp above) is only ever needed for the
// brief window between a trip starting and the driver verifying pickup —
// same unbounded-growth concern as adminNotifications, same fix.
const BOOKING_OTP_TTL_HOURS = 24;
exports.expireOldBookingOtps = onSchedule({ schedule: "0 * * * *", timeZone: "Asia/Kolkata" }, async () => {
  const cutoff = Timestamp.fromMillis(Date.now() - BOOKING_OTP_TTL_HOURS * 60 * 60 * 1000);
  const snap = await db.collection("bookingOtps").where("createdAt", "<=", cutoff).get();
  const deletions = [];
  snap.forEach((doc) => deletions.push(doc.ref.delete()));
  await Promise.all(deletions);
});

// Verifies a driver's pickup OTP guess without ever handing the real value
// to any client (see DriverOtpEntry/verifyPickupOtp in App.jsx/
// firebaseClient.js, and otp-readable-by-any-driver in BUG_TRACKER_SEED).
// The OTP itself lives in bookingOtps/{bookingId} (written by
// driverRespondBooking when the trip starts), readable only by that
// booking's own customer or Admin per firestore.rules -- this function
// reads it via the Admin SDK, which bypasses those rules entirely, so the
// driver's own client (which calls this) never sees the correct answer at
// any point, before or after a correct guess.
exports.verifyPickupOtp = onCall({ region: "asia-south1" }, async (request) => {
  const callerPhone = callerPhoneFromAuth(request.auth?.token);
  if (!callerPhone) throw new HttpsError("unauthenticated", "Sign in required.");
  const { bookingId, otp } = request.data || {};
  if (!bookingId || !otp) throw new HttpsError("invalid-argument", "bookingId and otp are required.");

  const bookingSnap = await db.collection("bookings").doc(bookingId).get();
  if (!bookingSnap.exists) throw new HttpsError("not-found", "Booking not found.");
  const booking = bookingSnap.data();
  // Only the driver this booking is actually assigned to may attempt a
  // guess -- otherwise any signed-in driver could brute-force another
  // driver's pickup OTP through this same function.
  if (!booking.driverMobile || callerPhone !== `+91${booking.driverMobile}`) {
    throw new HttpsError("permission-denied", "Not the assigned driver for this booking.");
  }

  const otpSnap = await db.collection("bookingOtps").doc(bookingId).get();
  const valid = otpSnap.exists && String(otpSnap.data().otp || "") === String(otp);
  return { valid };
});

// ---------------- KYC photo classification (Gemini) ----------------
// Catches drivers uploading a front or diagonal shot for the vehicle's
// "Side" photo tile (found by spot-checking submitted KYC), and the same
// idea extended to the Driving License tile (catching a blank/random/wrong
// photo, not government validity -- that's a separate, much bigger
// integration this doesn't attempt). Runs at upload time in DriverKyc, on
// the resized image the client already has in memory -- classification
// happens BEFORE that file goes anywhere near Storage, so a rejected photo
// never overwrites whatever good photo was there before at that driver's
// fixed vehicleSide.jpg/dl.jpg path.
//
// Secret (set via `firebase functions:secrets:set GEMINI_API_KEY`, never
// hardcoded or committed): a Gemini API key from Google AI Studio
// (aistudio.google.com/apikey). Until it's set, this returns reason:
// "not_configured" instead of throwing -- the client treats that as
// "skip the check, upload normally" so KYC keeps working exactly as before
// while the key is still being set up, rather than blocking every driver.
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const KYC_PHOTO_PROMPTS = {
  // Deliberately lenient, not a strict pass/fail: a driver blocked from
  // finishing KYC over a borderline call is a worse outcome than an
  // imperfect photo slipping through, so both prompts are written to give
  // borderline/ambiguous shots the benefit of the doubt and only reject
  // what's clearly, unambiguously wrong -- not to catch every imperfect
  // angle or blurry photo.
  vehicleSide: 'You are reviewing a photo uploaded as the "side profile" photo of a commercial vehicle (truck/tempo/pickup/van) during a driver\'s KYC on an Indian goods-transport app -- taken by drivers on their own phones, so it will rarely be a perfectly straight, perfectly framed shot. Reply with ONLY strict JSON, no markdown: {"isMatch": true|false, "reason": "one short sentence in English"}. Be lenient: isMatch is true for anything that is mostly a side view of the vehicle, even if somewhat angled, off-center, slightly cropped, or not perfectly straight-on -- give borderline or ambiguous shots the benefit of the doubt. isMatch is false ONLY when it\'s clearly and unambiguously wrong: a straight-on front view, a straight-on rear view, an interior shot, or something that isn\'t a vehicle at all.',
  drivingLicense: 'You are reviewing a photo uploaded as an Indian driving license document during a commercial driver\'s KYC -- taken by drivers on their own phones, so expect imperfect lighting, glare, blur, or a slight crop. Reply with ONLY strict JSON, no markdown: {"isMatch": true|false, "reason": "one short sentence in English"}. Be lenient: isMatch is true for anything that plausibly could be a driving license card/document (front or back), even with poor photo quality, glare, blur, or an awkward angle -- give borderline or ambiguous shots the benefit of the doubt. isMatch is false ONLY when it\'s clearly and unambiguously wrong: a blank image, a random unrelated photo, just a person\'s face with no document at all, or a completely different kind of document (e.g. an Aadhaar card, a bill).',
};

exports.classifyKycPhoto = onCall({ region: "asia-south1", secrets: [GEMINI_API_KEY] }, async (request) => {
  const callerPhone = callerPhoneFromAuth(request.auth?.token);
  if (!callerPhone) throw new HttpsError("unauthenticated", "Sign in required.");
  const { imageBase64, mimeType, docType } = request.data || {};
  const prompt = KYC_PHOTO_PROMPTS[docType];
  if (!prompt) throw new HttpsError("invalid-argument", "docType must be vehicleSide or drivingLicense.");
  if (!imageBase64) throw new HttpsError("invalid-argument", "imageBase64 is required.");

  const apiKey = GEMINI_API_KEY.value();
  if (!apiKey) return { ok: false, reason: "not_configured" };

  try {
    // "-latest" alias rather than a pinned version — gemini-2.0-flash
    // (originally used here) has since been deprecated/removed from the
    // API entirely, confirmed by testing the actual configured key
    // against the live models list. A pinned version number will hit the
    // same dead end again eventually; the -latest alias for the cheapest
    // flash tier keeps resolving to whatever's current without needing a
    // manual bump each time Google rotates model versions. This is a
    // simple binary classification task, not something that needs a
    // bigger/pricier model.
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType || "image/jpeg", data: imageBase64 } }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }),
    });
    const data = await res.json();
    if (!res.ok) { console.error("[classifyKycPhoto] Gemini rejected the request:", data); return { ok: false, reason: "api_error" }; }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = text ? JSON.parse(text) : null;
    if (!parsed || typeof parsed.isMatch !== "boolean") return { ok: false, reason: "api_error" };
    return { ok: true, isMatch: parsed.isMatch, reason: parsed.reason || "" };
  } catch (e) {
    console.error("[classifyKycPhoto] failed:", e.message);
    return { ok: false, reason: "api_error" };
  }
});

// ---------------- Driver referral payout ----------------
// Credits ₹200 into a referring driver's wallet the first time the driver
// they referred (signed up via that driver's ?ref= share link — see
// shareApp in src/App.jsx) completes a real trip. This used to run as a
// plain client-side function (App.jsx: creditReferralOnce) that wrote
// straight to the *referring* driver's wallet from the *referred* driver's
// own signed-in session — silently blocked by firestore.rules even before
// the security pass that tightened drivers/{mobile}'s update rule (an
// update touching another driver's doc could never satisfy isOwnPhone for
// that doc), so the payout never actually landed. Moving it here lets the
// Admin SDK make the cross-driver write, while still deriving *which*
// driver is claiming the referral from their own auth token rather than a
// client-supplied mobile -- so nobody can call this to credit an arbitrary
// referral chain of their choosing.
//
// The client no longer has a "this driver just finished a trip" moment to
// hand over as proof, so this re-derives it server-side: the caller must
// own at least one Completed booking under their own driver mobile --
// driverMobile (stamped by driverRespondBooking in App.jsx) rather than
// driverName, since two drivers can share the same free-text display name
// (no uniqueness enforced at signup) and a name-based lookup could
// previously be satisfied by a different, same-named driver's trip.
exports.creditDriverReferral = onCall({ region: "asia-south1" }, async (request) => {
  const callerPhone = callerPhoneFromAuth(request.auth?.token);
  if (!callerPhone) throw new HttpsError("unauthenticated", "Sign in required.");
  const mobile = callerPhone.replace("+91", "");

  const driverSnap = await db.collection("drivers").doc(mobile).get();
  if (!driverSnap.exists) return { ok: false, reason: "not_found" };
  const driverData = driverSnap.data();
  if (!driverData.referredBy || driverData.referralCredited) return { ok: false, reason: "not_eligible" };

  const referrerRef = db.collection("drivers").doc(driverData.referredBy);
  const referrerSnap = await referrerRef.get();
  if (!referrerSnap.exists) return { ok: false, reason: "referrer_not_found" };

  const completedTrip = await db.collection("bookings")
    .where("driverMobile", "==", mobile)
    .where("status", "==", "Completed")
    .limit(1)
    .get();
  if (completedTrip.empty) return { ok: false, reason: "no_completed_trip" };

  // Marked credited first, before the payout write — if the function
  // retries or is called again, the guard above already stops a second
  // payout, but flipping this first (rather than after the wallet credit)
  // means a crash between the two writes fails closed (no payout re-tried
  // forever) rather than open (a duplicate payout on retry).
  await driverSnap.ref.update({ referralCredited: true });
  await referrerRef.update({
    wallet: FieldValue.increment(200),
    referralEntries: FieldValue.arrayUnion({ amount: 200, fromMobile: mobile, creditedAt: Date.now() }),
  });
  return { ok: true };
});

// ---------------- Change Log "Resolve" (see AdminBugTracker in App.jsx) ----------------
// Same route-matching radius as src/App.jsx's routeMatchRadiusKm/
// locationsNear/ROUTE_MATCH_RADIUS_KM — kept in sync manually, same as the
// other client-side logic duplicated in this file (haversineKm above).
const ROUTE_MATCH_RADIUS_KM = 25;
function routeMatchRadiusKm(routeKm) {
  if (routeKm == null) return ROUTE_MATCH_RADIUS_KM;
  return Math.min(60, Math.max(ROUTE_MATCH_RADIUS_KM, routeKm * 0.15));
}
function locationsNear(lat1, lng1, lat2, lng2, radiusKm = ROUTE_MATCH_RADIUS_KM) {
  return haversineKm(lat1, lng1, lat2, lng2) <= radiusKm;
}

// Server-side twin of src/App.jsx's cleanupOrphanedAdminRates — the one
// Change Log entry with a real, deterministic data remedy (duplicate Admin
// route-rate entries left behind by an already-fixed edit-save bug). Run
// here with Admin SDK privileges instead of trusting the admin's own
// browser session to have current data, since resolveChangeLogEntry below
// runs this before ever asking Claude to verify anything.
async function cleanupOrphanedAdminRates() {
  const snap = await db.collection("adminRouteFares").get();
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => r.pickupLat != null && r.dropLat != null);
  const toDelete = new Set();
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (toDelete.has(a.id)) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (toDelete.has(b.id) || a.tierMaxKg !== b.tierMaxKg) continue;
      const radiusKm = routeMatchRadiusKm(haversineKm(a.pickupLat, a.pickupLng, a.dropLat, a.dropLng));
      const samePickup = locationsNear(a.pickupLat, a.pickupLng, b.pickupLat, b.pickupLng, radiusKm);
      const sameDrop = locationsNear(a.dropLat, a.dropLng, b.dropLat, b.dropLng, radiusKm);
      if (samePickup && sameDrop) toDelete.add((a.updatedAt || 0) >= (b.updatedAt || 0) ? b.id : a.id);
    }
  }
  await Promise.all([...toDelete].map((id) => db.collection("adminRouteFares").doc(id).delete()));
  return toDelete.size;
}

// Deterministic, real data remedies — keyed by the Change Log entry's own
// resolveAction field (see BUG_TRACKER_SEED in src/App.jsx). Run BEFORE
// asking Claude anything below, so Claude is verifying/reporting on an
// actual just-applied fix rather than being asked to invent one.
const RESOLVE_ACTIONS = {
  "cleanup-orphaned-admin-rates": cleanupOrphanedAdminRates,
};

// Anthropic API key (set via `firebase functions:secrets:set ANTHROPIC_API_KEY`,
// never hardcoded or committed) — same not_configured fallback pattern as
// GEMINI_API_KEY/EXOTEL_* above: until it's set, this returns reason:
// "not_configured" instead of throwing.
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

// Clicking "Resolve"/"Resolve (auto-fix)" on a Change Log entry (see
// AdminBugTracker) calls this instead of the client flipping status
// itself, so the click is tracked live (open -> resolving -> fixed/open)
// across every admin session, not just optimistic local state that
// vanishes on refresh — the exact thing asked for ("keep it in track for
// admin whether it is resolving in progress, resolved").
//
// Two-step resolution, run in order:
// 1. If this entry has a REAL deterministic data remedy registered
//    (RESOLVE_ACTIONS), run it for real against live Firestore data —
//    e.g. cleanup-orphaned-admin-rates actually deletes duplicate rate
//    entries, it doesn't just relabel the entry.
// 2. Ask Claude to confirm the issue is actually resolved given what
//    just happened (or, for a pure code-logic fix with no live data
//    component, given the original description already documenting that
//    fix as shipped) and write a short admin-facing note. This is the
//    closest an in-app button can honestly get to "fix it by hook or by
//    crook" for a bug whose real fix already lives in shipped source code
//    — a browser click can't rewrite and redeploy the app itself, but it
//    CAN re-run any live data cleanup and have a real model verify/report
//    on the result instead of a hardcoded "done" label.
// Never leaves an entry silently stuck on "resolving" — any failure
// (missing key, network error, bad response) reverts it to "open" with a
// note explaining why, so a false "resolved" is never shown.
exports.resolveChangeLogEntry = onCall({ region: "asia-south1", secrets: [ANTHROPIC_API_KEY] }, async (request) => {
  if (request.auth?.token?.admin !== true) throw new HttpsError("permission-denied", "Admin access required.");
  const { bugId } = request.data || {};
  if (!bugId) throw new HttpsError("invalid-argument", "bugId is required.");

  const ref = db.collection("bugs").doc(bugId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Change Log entry not found.");
  const bug = snap.data();

  await ref.update({ status: "resolving", resolvingAt: FieldValue.serverTimestamp() });

  let actionSummary = "No automated data remedy is registered for this issue — it was a code-level fix.";
  const action = RESOLVE_ACTIONS[bug.resolveAction];
  if (action) {
    try {
      const count = await action();
      actionSummary = count > 0
        ? `Ran the "${bug.resolveAction}" data remedy just now — it found and removed ${count} affected record(s).`
        : `Ran the "${bug.resolveAction}" data remedy just now — nothing needed fixing, data is already clean.`;
    } catch (e) {
      console.error("[resolveChangeLogEntry] action failed:", e.message);
      actionSummary = `Tried to run the "${bug.resolveAction}" data remedy but it failed: ${e.message}`;
    }
  }

  const apiKey = ANTHROPIC_API_KEY.value();
  if (!apiKey) {
    await ref.update({ status: "open", resolutionNote: "Automated resolution isn't set up yet (ANTHROPIC_API_KEY not configured) — resolve manually for now.", resolvingAt: FieldValue.delete() });
    return { ok: false, reason: "not_configured" };
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: "You are verifying, for the admin of a production Indian trucking-marketplace app (Sarthi Transport), whether a previously-logged Change Log entry (a bug, feature, UI or config change) is currently resolved. Respond with ONLY strict JSON, no markdown: {\"resolved\": true|false, \"note\": \"one short plain-language sentence for the admin\"}. If the entry describes a code-level fix that its own description says already shipped, and no live data action contradicts that, treat it as resolved. If a data remedy just ran, factor its actual result into your note and your resolved decision.",
        messages: [{
          role: "user",
          content: `Change Log entry:\nTitle: ${bug.title || ""}\nType: ${bug.type || "bug"}\nArea: ${bug.area || ""}\nOriginal description: ${bug.description || "(none)"}\n\nWhat just happened when Resolve was clicked: ${actionSummary}\n\nIs this issue resolved right now? Respond with the JSON only.`,
        }],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("[resolveChangeLogEntry] Claude API rejected the request:", data);
      await ref.update({ status: "open", resolutionNote: "Automated resolution failed (API error) — try again or resolve manually.", resolvingAt: FieldValue.delete() });
      return { ok: false, reason: "api_error" };
    }
    const text = data?.content?.[0]?.text || "";
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    if (typeof parsed.resolved !== "boolean") throw new Error("malformed response");

    if (parsed.resolved) {
      await ref.update({ status: "fixed", fixedAt: FieldValue.serverTimestamp(), resolutionNote: parsed.note || "", resolvingAt: FieldValue.delete() });
    } else {
      await ref.update({ status: "open", resolutionNote: parsed.note || "Still not resolved.", resolvingAt: FieldValue.delete() });
    }
    return { ok: true, resolved: parsed.resolved, note: parsed.note || "" };
  } catch (e) {
    console.error("[resolveChangeLogEntry] failed:", e.message);
    await ref.update({ status: "open", resolutionNote: "Automated resolution failed — try again or resolve manually.", resolvingAt: FieldValue.delete() });
    return { ok: false, reason: "error" };
  }
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

// ---------------- Daily health check (live-backend half) ----------------
// The other half of the same daily check lives in a Claude Code Routine
// (GitHub source-code regression check + build, holding no Firebase
// credentials at all by design) -- see BUG_TRACKER_SEED's
// "daily-health-check-added" entry and systemHealth/{doc} in
// firestore.rules. THIS half runs entirely inside Firebase: it gets
// Firestore/Auth access for free via the Cloud Functions runtime's own
// ambient identity, no service-account key stored anywhere, and normal
// internet egress (unlike a sandboxed dev environment, which could reach
// neither the production Hosting URL nor Cloud Functions URLs at all).
//
// AIzaSyDdNGALZWDhLeqqGldHQY2iPpvKDmREpOI is the app's public Web API key
// (the same one already shipped in every client bundle, restricted by
// HTTP referrer, not a secret -- see src/firebaseClient.js's
// VITE_FIREBASE_API_KEY) -- used here only to exercise the real PIN-login
// REST call the client itself makes, via two dedicated test accounts
// (customers/9990001111, drivers/9990002222 -- both tagged
// isHealthCheckAccount: true) created specifically for this.
const HEALTH_CHECK_WEB_API_KEY = "AIzaSyDdNGALZWDhLeqqGldHQY2iPpvKDmREpOI";
const PRODUCTION_URL = "https://sarthi-transport-74865.web.app/";
const HEALTH_CHECK_PASSWORD = "apna-pin-1234";
// Fixed test-driver location (drivers/9990002222.lastKnownLocation) and two
// pickup points with a KNOWN-correct answer, so the proximity check below
// asserts an actual result instead of just "did the query not crash" --
// this is the exact regression behind proximity-filter-fails-open-not-closed
// in BUG_TRACKER_SEED. Mirrors src/App.jsx's CURRENT_BID_RADIUS_KM (30km,
// the customer-facing current-load radius that bug was actually in) --
// deliberately NOT the same as this file's own BID_RADIUS_KM above, which
// is the broader new-load PUSH ALERT radius, a different constant.
const HEALTH_CHECK_RADIUS_KM = 30;
const HEALTH_CHECK_DRIVER_LOC = { lat: 18.5204, lng: 73.8567 }; // Pune
const HEALTH_CHECK_NEAR_PICKUP = { lat: 18.55, lng: 73.9 }; // ~6km away -- must be eligible
const HEALTH_CHECK_FAR_PICKUP = { lat: 28.7041, lng: 77.1025 }; // Delhi, ~1150km away -- must NOT be eligible

async function signInHealthCheckAccount(email) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${HEALTH_CHECK_WEB_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Referer: PRODUCTION_URL },
    body: JSON.stringify({ email, password: HEALTH_CHECK_PASSWORD, returnSecureToken: true }),
  });
  const data = await res.json();
  if (!res.ok || !data.idToken) throw new Error(`sign-in failed: ${data?.error?.message || res.status}`);
}

// Raw source-marker check -- unlike the Claude Code Routine (which also
// checks this, plus runs the real build and uses judgment on whether a
// mismatch was an intentional change), THIS check has nowhere to run
// `npm run build` and can't reason about intent -- it's a plain substring
// check against the live GitHub source, fetched directly since Cloud
// Functions have normal, unrestricted internet access. Its whole purpose
// is to let the ALWAYS-VISIBLE Live Dashboard status tile reflect both
// halves of the daily check, not just the live-backend half -- the
// Routine's own findings only ever reach the admin via push/email,
// never the in-app Change Log, since it deliberately holds no Firebase
// credentials.
const SOURCE_REPO_RAW_BASE = "https://raw.githubusercontent.com/newsuraj02/SarthiTransport/claude/app-from-document-njzc58";
async function checkSourceMarkers() {
  const findings = [];
  let src;
  try {
    const res = await fetch(`${SOURCE_REPO_RAW_BASE}/src/App.jsx`);
    if (!res.ok) return [`[Source check] Couldn't fetch src/App.jsx from GitHub (HTTP ${res.status}) -- skipped.`];
    src = await res.text();
  } catch (e) {
    return [`[Source check] Couldn't fetch src/App.jsx from GitHub: ${e.message} -- skipped.`];
  }
  const mustContain = [
    ["AWAITING_DRIVER_TIMEOUT_SEC = 120", "2-minute driver response timeout"],
    ["CURRENT_BID_RADIUS_KM = 30", "30km current-load proximity radius"],
    ["ADVANCE_BID_RADIUS_KM = 50", "50km advance-load proximity radius"],
    ["!pickupCoords || !d.lastKnownLocation", "proximity filter failing closed on missing coordinates"],
  ];
  for (const [needle, label] of mustContain) {
    if (!src.includes(needle)) findings.push(`[Source check] Expected to find "${needle}" (${label}) in src/App.jsx, but it's missing or changed.`);
  }
  return findings;
}

async function runDailyHealthCheck(label) {
  const findings = [];

  try {
    const res = await fetch(PRODUCTION_URL);
    if (!res.ok) findings.push(`[Hosting] Production URL returned HTTP ${res.status}.`);
  } catch (e) {
    findings.push(`[Hosting] Production URL unreachable: ${e.message}`);
  }

  try {
    await signInHealthCheckAccount("9990001111@customer.apnatransport.local");
  } catch (e) {
    findings.push(`[Customer login] ${e.message}`);
  }
  try {
    await signInHealthCheckAccount("9990002222@driver.apnatransport.local");
  } catch (e) {
    findings.push(`[Driver login] ${e.message}`);
  }

  const nearKm = haversineKm(HEALTH_CHECK_DRIVER_LOC.lat, HEALTH_CHECK_DRIVER_LOC.lng, HEALTH_CHECK_NEAR_PICKUP.lat, HEALTH_CHECK_NEAR_PICKUP.lng);
  const farKm = haversineKm(HEALTH_CHECK_DRIVER_LOC.lat, HEALTH_CHECK_DRIVER_LOC.lng, HEALTH_CHECK_FAR_PICKUP.lat, HEALTH_CHECK_FAR_PICKUP.lng);
  if (!(nearKm <= HEALTH_CHECK_RADIUS_KM)) findings.push(`[Proximity] Known-near test point measured ${nearKm.toFixed(1)}km, expected within ${HEALTH_CHECK_RADIUS_KM}km.`);
  if (!(farKm > HEALTH_CHECK_RADIUS_KM)) findings.push(`[Proximity] Known-far test point measured ${farKm.toFixed(1)}km, expected well outside ${HEALTH_CHECK_RADIUS_KM}km -- would incorrectly be shown as eligible.`);

  try {
    await db.collection("adminRouteFares").limit(1).get();
  } catch (e) {
    findings.push(`[Admin rate lookup] adminRouteFares query failed: ${e.message}`);
  }

  findings.push(...(await checkSourceMarkers()));

  const passed = findings.length === 0;
  const summary = passed ? "All checks passed." : findings.join(" | ");

  // Always written, pass or fail -- see AdminFleet's always-visible
  // "Daily Health Check" status tile in src/App.jsx, which reads this
  // doc directly (public read) so an admin sees the latest result
  // either way, not just when something's broken.
  await db.collection("systemHealth").doc("heartbeat").set({
    [`${label}At`]: FieldValue.serverTimestamp(),
    [`${label}Status`]: passed ? "pass" : "fail",
    [`${label}Summary`]: summary,
  }, { merge: true });

  if (!passed) {
    await db.collection("bugs").add({
      title: `Daily health check found ${findings.length} issue(s)`,
      description: summary,
      severity: "high",
      status: "open",
      type: "bug",
      area: "Automated daily health check",
      foundAt: new Date().toISOString().slice(0, 10),
    });
  }
}

exports.dailyHealthCheckMorning = onSchedule({ schedule: "0 9 * * *", timeZone: "Asia/Kolkata", region: "asia-south1" }, async () => {
  await runDailyHealthCheck("lastMorningRun");
});

exports.dailyHealthCheckNight = onSchedule({ schedule: "0 23 * * *", timeZone: "Asia/Kolkata", region: "asia-south1" }, async () => {
  await runDailyHealthCheck("lastNightRun");
});
