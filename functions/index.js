const { onDocumentCreated, onDocumentWritten, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const crypto = require("crypto");
const { ringWeightText } = require("./ringText");
const { evaluateNewLoadDriver, RING_EXTRA_CATEGORIES } = require("./tripLock");
const { planSixteenWheelerRepair, RIGHT_CAPACITY_KG } = require("./vehicleSpecRepair");
const { shouldIssuePickupOtp, newPickupOtp, judgeOtpGuess } = require("./otp");
const { buildFleetDispatchText, newLinkToken, tokenMatches, cleanMobile: fleetCleanMobile } = require("./fleetDispatch");
const { findStuckTrips, auditKnownIssues, auditLiveData, auditDeployment, diffCriteria, diffSettings, summarize, isDriverRecord: auditIsDriverRecord, isBookingRunning: auditIsBookingRunning, otherRunningTripsOfDriver: auditOtherRunningTrips } = require("./healthAudit");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getAuth } = require("firebase-admin/auth");
const { getStorage } = require("firebase-admin/storage");
const textToSpeech = require("@google-cloud/text-to-speech");

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
// FCM permanently invalidates a device's registration token on certain
// events (a fresh reinstall being by far the most common in practice --
// confirmed live via Cloud Logging: repeated "[push] ... send failed:
// Device unregistered." entries for the exact driver a test kept
// reinstalling a new build onto). Firebase's own docs explicitly
// recommend removing a token once it fails with this specific error, so
// it doesn't just sit there silently failing forever -- the next time
// that driver/customer's app runs its own token-registration effect
// (useRideNotifications in App.jsx), a fresh valid token gets written
// cleanly instead of never overwriting the dead one.
async function clearStaleFcmTokenOnFailure(collectionName, docId, error) {
  if (!docId) return;
  const isUnregistered = error?.code === "messaging/registration-token-not-registered"
    || /unregistered/i.test(error?.message || "");
  if (!isUnregistered) return;
  try {
    await db.collection(collectionName).doc(docId).update({ fcmToken: null });
  } catch (e) {
    console.error(`[push] failed to clear stale token for ${collectionName}/${docId}:`, e.message);
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

// Same great-circle distance formula as src/App.jsx's haversineKm — kept in
// sync manually, same as the other client-side logic duplicated above.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Mirrors src/App.jsx's availability block (estimatedTripHours / isBookingRunning / getBookingWindow) -- the real-world time window a
// driver is committed to for an already-accepted Ongoing booking. FIXED 2026-11-03 ("yes fix the ring too"): this used to start with
// `if (!b.hours) return null`, and EVERY booking has hours: 0, so no driver was ever treated as busy and the ring woke drivers who were
// mid-trip. A RUNNING booking (immediate, or advance whose loading began / time arrived) holds its driver until it is finished.
// scripts/verifyInvariants.mjs compares this copy with the app's on hundreds of random situations; edit both together.
function estimatedTripHours(b) {
  const km = Number(b?.distance) || 0;
  const oneWay = Math.max(2, Math.ceil(km / 30) + 1);
  return b?.returnTrip ? oneWay * 2 : oneWay;
}
function isBookingRunning(b, now = Date.now()) {
  if (!b.scheduledFor) return true;
  if (b.loadingStartedAt) return true;
  const t = parseScheduledFor(b.scheduledFor).getTime();
  return Number.isFinite(t) && t <= now;
}
function getBookingWindow(b, now = Date.now()) {
  let start;
  if (b.scheduledFor) start = parseScheduledFor(b.scheduledFor);
  else if (b.acceptedAt?.toMillis) start = new Date(b.acceptedAt.toMillis());
  else if (b.createdAt?.toMillis) start = new Date(b.createdAt.toMillis());
  else start = new Date(now);
  if (!Number.isFinite(start.getTime())) return null;
  const hours = Number(b.hours) > 0 ? Number(b.hours) : estimatedTripHours(b);
  let end = start.getTime() + hours * 60 * 60 * 1000;
  if (isBookingRunning(b, now) && end < now + 60 * 60 * 1000) end = now + 60 * 60 * 1000;
  return { start, end: new Date(end) };
}

// ONE ACCEPT (owner 2026-11-03): the driver app (DriverApp, src/App.jsx) stamps `drivers/{mobile}.appForegroundAt` (a server timestamp)
// every 15 s while its Home screen is open on screen, and clears it the moment the app is hidden or closed. A driver whose stamp is
// under 30 s old is LOOKING at the app, where the in-app load card + sound already work -- so no ring push, no full-screen ring screen
// and no LoadWatcher target is created for them (they would otherwise have to Accept twice: on the ring screen AND in the app).
// Fail-safe by design: a missing, cleared, old or future-dated stamp means "not looking" and the ring works exactly as before.
const APP_OPEN_WINDOW_MS = 30 * 1000;
function isAppOpenNow(driver, now = Date.now()) {
  const at = driver?.appForegroundAt?.toMillis ? driver.appForegroundAt.toMillis() : null;
  return at != null && at <= now + 5000 && now - at < APP_OPEN_WINDOW_MS;
}

// Mirrors src/App.jsx's findDriverLoadConflict (list-filtering mode, no
// candidate hours known yet) — true if this new load's start time falls
// inside any of the driver's existing Ongoing commitments' window plus the
// vehicle-tonnage buffer ahead of it. Covers both "still mid-trip on a
// current job" and "advance booking coming up soon", not just the latter.
function hasLoadConflict(load, myOngoing, lockHours) {
  const newStart = load.scheduledFor ? parseScheduledFor(load.scheduledFor) : new Date();
  return myOngoing.some((existing) => {
    const win = getBookingWindow(existing, Date.now());
    if (!win) return false;
    const lockStart = new Date(win.start.getTime() - lockHours * 60 * 60 * 1000);
    return newStart < win.end && newStart >= lockStart;
  });
}

// A loud, high-priority alert to one specific driver — reused for every
// driver in the broadcast list (see onDirectRequestBroadcast below).
async function sendDirectRequestAlert(token, load, bookingId, driverMobile) {
  if (!token) return;
  try {
    await getMessaging().send({
      token,
      notification: {
        title: "🚨 आपके लिए सीधी बुकिंग रिक्वेस्ट!",
        body: `📍 लोडिंग: ${load.pickup}\n🏁 अनलोडिंग: ${load.drop}${load.weight ? `\n⚖️ ${load.weight}kg` : ""}\n⏱️ 2 मिनट में जवाब दें`,
      },
      android: {
        priority: "high",
        notification: {
          channelId: "new_load_alerts",
          // Lets AppFirebaseMessagingService remove this exact banner when
          // another driver takes the load (see onBookingTaken below).
          tag: `load-${bookingId}`,
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
    await clearStaleFcmTokenOnFailure("drivers", driverMobile, e);
  }
}

// WhatsApp alert for the exact same 2-minute-window direct request/
// retarget sendDirectRequestAlert (push) already covers -- sent
// ALONGSIDE push, not instead of it. An earlier attempt fully replaced
// push with Exotel SMS for this alert and was reverted; this keeps push
// as the free, always-on channel and adds WhatsApp as a second, more
// reliable path -- WhatsApp already has de-facto OEM battery-
// optimization whitelisting on virtually every Indian Android device, so
// the actual failure mode push had here (stale/unregistered FCM tokens,
// missing notification channel, OEM battery/autostart restrictions)
// doesn't apply to it.
//
// sendDirectRequestWhatsApp (the per-booking WhatsApp alert this secret was
// for) was removed as dead code -- it had already been disabled in
// onDirectRequestBroadcast below per the 2026-10-15 owner request (see that
// function's own comment). MSG91_DIRECT_REQUEST_TEMPLATE stays declared here
// solely because onDirectRequestBroadcast's `secrets: [...]` list still
// references it; that function is frozen (CLAUDE.md), so this declaration
// isn't removed along with the rest.
const { buildFleetConversion } = require("./fleetConvert");
const { judgeMsg91Response } = require("./bulkWhatsApp");
const { lookupMobileRoles, refusesSecondRole } = require("./roleLock");
const MSG91_AUTH_KEY = defineSecret("MSG91_AUTH_KEY");
const MSG91_WHATSAPP_NUMBER = defineSecret("MSG91_WHATSAPP_NUMBER");
const MSG91_DIRECT_REQUEST_TEMPLATE = defineSecret("MSG91_DIRECT_REQUEST_TEMPLATE");
const MSG91_WHATSAPP_NAMESPACE = defineSecret("MSG91_WHATSAPP_NAMESPACE");

// Bulk WhatsApp sends for Admin's retention/reminder tiles (Uninstalled/
// Blocked, Off duty, and AdminDriverList's Incomplete-KYC and GPS-off
// sections) -- replaces the old "open wa.me, admin taps send, one driver at
// a time" queue with a single real API call reaching every matching driver
// at once. MSG91's own bulk endpoint takes an ARRAY of recipients
// (to_and_components) in one request, so this is genuinely one send, not a
// loop of individual ones -- same endpoint/account as sendDirectRequestWhatsApp
// above, no new secrets needed. Each template's own approved name and
// variable shape (see the 4 templates submitted/approved on MSG91's
// dashboard -- driver_reinstall_offer, driver_kyc_incomplete, driver_gps_off,
// driver_off_duty) is fixed by what Meta actually approved, not
// admin-configurable, so hardcoded here the same way direct_booking_request's
// is above.
const MSG91_BULK_TEMPLATES = {
  reinstall: { name: "driver_reinstall_offer", vars: () => ({}) },
  kycIncomplete: {
    name: "driver_kyc_incomplete",
    // The one template with a real variable -- each driver's own KYC
    // portal deep link, not shared across recipients.
    vars: (mobile) => ({ body_1: `https://sarthi-transport-74865.web.app/?driverKyc=1&mobile=${mobile}` }),
  },
  gpsOff: { name: "driver_gps_off", vars: () => ({}) },
  offDuty: { name: "driver_off_duty", vars: () => ({}) },
};
// MSG91's own limit on recipients per bulk call isn't documented anywhere
// public -- chunking defensively rather than assuming an unbounded array is
// safe, same reasoning bulkUpdateDocs already applies to Firestore writes
// (a several-hundred-entry single request is exactly the kind of thing that
// silently fails partway on a flaky connection).
const MSG91_BULK_CHUNK_SIZE = 100;
exports.sendBulkDriverWhatsApp = onCall({ region: "asia-south1", secrets: [MSG91_AUTH_KEY, MSG91_WHATSAPP_NUMBER, MSG91_WHATSAPP_NAMESPACE] }, async (request) => {
  if (request.auth?.token?.admin !== true) throw new HttpsError("permission-denied", "Admin access required.");
  const { kind, mobiles } = request.data || {};
  const template = MSG91_BULK_TEMPLATES[kind];
  if (!template) throw new HttpsError("invalid-argument", "Unknown template kind.");
  const list = Array.isArray(mobiles) ? mobiles.filter(Boolean) : [];
  if (list.length === 0) throw new HttpsError("invalid-argument", "mobiles is required.");

  const authKey = MSG91_AUTH_KEY.value(), fromNumber = MSG91_WHATSAPP_NUMBER.value(), namespace = MSG91_WHATSAPP_NAMESPACE.value();
  if (!authKey || !fromNumber || !namespace) throw new HttpsError("failed-precondition", `MSG91 WhatsApp is not configured (missing: ${[!authKey && "MSG91_AUTH_KEY", !fromNumber && "MSG91_WHATSAPP_NUMBER", !namespace && "MSG91_WHATSAPP_NAMESPACE"].filter(Boolean).join(", ")}).`);

  const chunks = [];
  for (let i = 0; i < list.length; i += MSG91_BULK_CHUNK_SIZE) chunks.push(list.slice(i, i + MSG91_BULK_CHUNK_SIZE));

  let sent = 0;
  let failure = null; // the last real reason a chunk did not go out -- returned to Admin so a failure is never just "try again"
  for (const chunk of chunks) {
    const to_and_components = chunk.map((mobile) => ({
      to: [`91${mobile}`],
      components: Object.fromEntries(Object.entries(template.vars(mobile)).map(([key, value]) => [key, { type: "text", value }])),
    }));
    try {
      const res = await fetch("https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/", {
        method: "POST",
        headers: { authkey: authKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          integrated_number: fromNumber,
          content_type: "template",
          payload: {
            messaging_product: "whatsapp",
            type: "template",
            template: { name: template.name, language: { code: "hi", policy: "deterministic" }, namespace, to_and_components },
          },
        }),
      });
      // Logged on every outcome, not just a non-2xx one -- MSG91's bulk
      // endpoint can return HTTP 200 with an error described only inside
      // the body (seen when driver_reinstall_offer reported "Sent" to the
      // admin here but never actually appeared in MSG91's own Logs panel:
      // res.ok was true, so the old code never looked at the body at all).
      // console.log, not console.error, on the success path so normal
      // sends don't spam Cloud Functions' error-level logs.
      const bodyText = await res.text();
      const verdict = judgeMsg91Response(res.status, bodyText);
      if (!verdict.ok) {
        console.error(`[whatsapp bulk:${kind}] rejected by MSG91 (HTTP ${res.status}):`, bodyText);
        failure = { reason: "msg91_rejected", detail: verdict.detail };
        continue;
      }
      console.log(`[whatsapp bulk:${kind}] MSG91 response (HTTP ${res.status}):`, bodyText);
      sent += chunk.length;
    } catch (e) {
      console.error(`[whatsapp bulk:${kind}] send failed:`, e.message);
      failure = { reason: "send_failed", detail: String(e.message || e).slice(0, 220) };
    }
  }
  return { ok: sent > 0, sent, requested: list.length, ...(sent < list.length && failure ? failure : {}) };
});

// Full-screen "incoming call" ring alert -- see AppFirebaseMessagingService.java/
// RingingBookingActivity.java on the Android side. Deliberately sent as a
// SEPARATE message from sendDirectRequestAlert above, not a replacement for
// it: this one carries NO top-level `notification` field at all (data-only),
// which is the one thing that actually matters here -- Android only invokes
// a custom FirebaseMessagingService's onMessageReceived while the app is
// backgrounded/killed when the message has no `notification` payload; the
// instant one is present (as sendDirectRequestAlert's is), the OS displays
// it itself and the app's own code never runs at all. Sending this
// ALONGSIDE the existing notification-payload alert, rather than converting
// that one to data-only, means a driver still on an older app build (before
// this feature shipped) is completely unaffected -- their app just quietly
// ignores this extra data message the same way it always would have, and
// keeps getting the original alert exactly as before. Only once a driver's
// app has actually updated does this second message start doing anything.
async function sendDirectRequestRingAlert(token, load, bookingId, driverMobile, ackKey = null) {
  if (!token) return;
  try {
    await getMessaging().send({
      token,
      android: { priority: "high", ttl: 120 * 1000 },
      data: {
        type: "direct_request_ring",
        bookingId,
        pickup: load.pickup || "-",
        drop: load.drop || "-",
        // Customer name / fare / km ride along inside the weight text (see ringText.js) -- no native build needed.
        weight: ringWeightText(load),
        // Delivery receipt (see ringAck below): the phone posts these back
        // the moment it starts ringing. Older app builds just ignore them.
        ...(ackKey ? { ackKey, driverMobile, ackUrl: RING_ACK_URL } : {}),
      },
    });
  } catch (e) {
    console.error("[push] direct-request ring alert send failed:", e.message);
    await clearStaleFcmTokenOnFailure("drivers", driverMobile, e);
  }
}

// Fires once per fresh category-based request (see src/App.jsx:
// requestByCategory/isDriverBroadcastEligible), alerting every eligible
// driver at once (push + WhatsApp) — whoever accepts first gets it.
// onDocumentCreated (not Written) since this should fire exactly once, at
// creation -- a later update to the same still-open booking (e.g.
// addDeclinedBy adding one more name to declinedBy) must NOT re-blast
// everyone who already got it.
//
// WHO is rung is decided by functions/tripLock.js (evaluateNewLoadDriver) -- duty on, KYC approved, not blocked, not on a trip, the picked
// vehicle category only (owner 2026-11-05: no "+2 above"), within 30 km (Current) / 50 km (Advance) of the pickup by the last known location; no GPS-on / weight condition (owner 2026-11-04). The old DIRECT_REQUEST_RADIUS_KM,
// BROADCAST_WEIGHT_HEADROOM_KG and BROADCAST_LOCATION_STALE_MS constants were removed with that rule.
// ---- घंटी पहुँची? (delivery receipt + automatic re-ring), 2026-10-13 ----
// Uber-style: the server doesn't just fire the push and hope. Every
// alerted driver gets a one-time ackKey (stored in ringDeliveries, which
// only the Admin SDK writes and only admins can read); the phone posts it
// back to ringAck the moment it rings. Anyone who hasn't acknowledged
// after RING_RETRY_DELAYS_MS while the load is still open gets the ring
// again. bookings.ringDeliveredCount lets the customer see how many phones
// are actually ringing.
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "sarthi-transport-74865";
const RING_ACK_URL = `https://asia-south1-${PROJECT_ID}.cloudfunctions.net/ringAck`;
const RING_RETRY_DELAYS_MS = [20000, 25000]; // re-ring at ~20 s, then ~45 s
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// How long the push gets to ring a phone before the in-app live watcher is allowed to (see onDirectRequestBroadcast).
const WATCHER_BACKUP_DELAY_MS = 3000;

exports.ringAck = onRequest({ region: "asia-south1", cors: false }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).send("POST only"); return; }
  const { bookingId, driverMobile, key } = req.body || {};
  if (typeof bookingId !== "string" || typeof driverMobile !== "string" || typeof key !== "string"
      || !/^[A-Za-z0-9_-]{1,64}$/.test(bookingId) || !/^\d{10}$/.test(driverMobile)) {
    res.status(400).send("bad request"); return;
  }
  const ref = db.collection("ringDeliveries").doc(`${bookingId}_${driverMobile}`);
  try {
    const firstAck = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.data().key !== key) return null;
      if (snap.data().ackAt) return false;
      tx.update(ref, { ackAt: Date.now() });
      tx.update(db.collection("bookings").doc(bookingId), { ringDeliveredCount: FieldValue.increment(1) });
      return true;
    });
    if (firstAck === null) { res.status(403).send("unknown"); return; }
    res.status(200).send("ok");
  } catch (e) {
    console.error("[ringAck]", e.message);
    res.status(500).send("error");
  }
});

// FLEET OWNERS (owner 2026-11-08): a transporter account whose vehicles are driven by people with no app. Their approved, active vehicles live in `fleetVehicles`
// (public part: ownerMobile, capacityKg, kyc, active); a vehicle on a trip is found through the Ongoing bookings that carry its `fleetVehicleId`.
// functions/tripLock.js evaluateFleetOwnerVehicles decides with these.
async function loadFleetContext(ongoingSnap) {
  const vehiclesSnap = await db.collection("fleetVehicles").where("kyc", "==", "Approved").get();
  const byOwner = {};
  vehiclesSnap.forEach((d) => { const v = { id: d.id, ...d.data() }; if (v.active === false || !v.ownerMobile) return; (byOwner[v.ownerMobile] ||= []).push(v); });
  const byVehicle = {};
  ongoingSnap.forEach((d) => { const b = d.data(); if (b.fleetVehicleId) (byVehicle[b.fleetVehicleId] ||= []).push(b); });
  return { vehiclesFor: (ownerMobile) => byOwner[ownerMobile] || [], mineFor: (vehicleId) => byVehicle[vehicleId] || [] };
}
exports.onDirectRequestBroadcast = onDocumentCreated(
  { document: "bookings/{bookingId}", timeoutSeconds: 120, secrets: [MSG91_AUTH_KEY, MSG91_WHATSAPP_NUMBER, MSG91_DIRECT_REQUEST_TEMPLATE, MSG91_WHATSAPP_NAMESPACE] },
  async (event) => {
    const load = event.data?.data();
    if (!load || load.status !== "AwaitingDriver" || load.pendingDriverName) return;

    const [driversSnap, ongoingSnap] = await Promise.all([
      db.collection("drivers").get(),
      db.collection("bookings").where("status", "==", "Ongoing").get(),
    ]);
    const fleet = await loadFleetContext(ongoingSnap);
    const ongoingByDriver = {};
    // Keyed by mobile (name only for old bookings without driverMobile) --
    // two drivers sharing a name must not block each other's loads.
    ongoingSnap.forEach((doc) => {
      const b = doc.data();
      const key = b.driverMobile || (b.driverName ? `name:${b.driverName}` : null);
      if (!key) return;
      (ongoingByDriver[key] ||= []).push(b);
    });

    const sends = [];
    const alerted = [];
    const ringKeys = {};
    // Per-driver skip-reason logging -- every one of these conditions
    // fails completely silently otherwise, so there was no way to tell
    // which one was actually blocking a specific test driver without
    // seeing this.
    const skipLog = [];
    driversSnap.forEach((doc) => {
      const driver = doc.data();
      const tag = `${doc.id} (${driver.name || "?"})`;
      // WHO GETS THE BELL (owner 2026-11-04): duty ON, KYC approved, not blocked, not on a trip, the picked vehicle category only (owner 2026-11-05: no "+2 above"), within
      // 30 km / 50 km of the pickup by the last known location (GPS being off does not matter; never-located is not rung); no weight condition. One rule for this ring and the later
      // rounds: functions/tripLock.js evaluateNewLoadDriver.
      const mine = [...(ongoingByDriver[doc.id] || []), ...(ongoingByDriver[`name:${driver.name}`] || [])];
      const verdict = evaluateNewLoadDriver(driver, load, { mine, hasLoadConflict, notificationLockHours, haversineKm, isAppOpen: (d) => isAppOpenNow(d, Date.now()), fleetVehicles: driver.fleetOwner ? fleet.vehiclesFor(doc.id) : [], fleetMine: fleet.mineFor });
      if (!verdict.ok) { skipLog.push(`${tag}: ${verdict.reason}`); return; }

      if (driver.fcmToken) {
        skipLog.push(`${tag}: SENDING push+ring`);
        alerted.push(doc.id);
        const ackKey = crypto.randomBytes(12).toString("hex");
        ringKeys[doc.id] = { key: ackKey, token: driver.fcmToken };
        sends.push(() => sendDirectRequestAlert(driver.fcmToken, load, event.params.bookingId, doc.id));
        sends.push(() => sendDirectRequestRingAlert(driver.fcmToken, load, event.params.bookingId, doc.id, ackKey));
      } else {
        skipLog.push(`${tag}: no fcmToken (push/ring skipped)`);
      }
      // WhatsApp backup alert removed per owner request (2026-10-15) --
      // the ring is now confirmed reliable (open/closed/locked, see
      // CLAUDE.md's frozen note on commit f8f7f50), so this WhatsApp
      // "Load Alert!!" message every eligible driver got for every single
      // load is now just noise. sendDirectRequestWhatsApp itself (which
      // sent it) was later deleted as dead code; MSG91_DIRECT_REQUEST_TEMPLATE
      // above stays declared only because this function's own
      // `secrets: [...]` list still references it.
    });
    console.log(`[onDirectRequestBroadcast] booking ${event.params.bookingId} (tier=${load.tierMaxKg}, pickup=${load.pickupLat},${load.pickupLng}): ${driversSnap.size} drivers checked\n${skipLog.join("\n")}`);
    // Saved BEFORE anything rings, so onBookingTaken always knows whose
    // phone to stop -- even if someone accepts within a second. Owner 2026-10-31: written as
    // `ringTargets` first, NOT `alertedDriverMobiles` -- the phone's live watcher (LoadWatcher)
    // rings the moment it sees alertedDriverMobiles, and it only knows pickup/drop/weight, so it
    // beat the push (which carries customer/fare/km). alertedDriverMobiles follows after the push
    // has been sent (below); onBookingTaken / escalation read both lists.
    if (alerted.length) {
      await event.data.ref.update({ ringTargets: alerted, ringDeliveredCount: 0 }).catch((e) => console.error("[onDirectRequestBroadcast] ringTargets", e.message));
      const batch = db.batch();
      const bookingId = event.params.bookingId;
      for (const [mobile, { key }] of Object.entries(ringKeys)) {
        batch.set(db.collection("ringDeliveries").doc(`${bookingId}_${mobile}`), { bookingId, driverMobile: mobile, key, sentAt: Date.now(), attempts: 1, ackAt: null });
      }
      await batch.commit().catch((e) => console.error("[onDirectRequestBroadcast] ringDeliveries", e.message));
    }
    try {
      await Promise.all(sends.map((send) => send()));
      // Let the push reach the phones first (it carries the full details); the live watcher is the
      // backup and only starts ringing once alertedDriverMobiles appears. RUNG in the app makes
      // sure a load rings once even when both arrive.
      if (alerted.length) await sleep(WATCHER_BACKUP_DELAY_MS);
    } finally {
      // Always written, even if a send threw, so the backup ring is never lost.
      if (alerted.length) await event.data.ref.update({ alertedDriverMobiles: alerted }).catch((e) => console.error("[onDirectRequestBroadcast] alertedDriverMobiles", e.message));
    }

    // Re-ring whoever's phone hasn't confirmed, while the load is still open.
    const bookingId = event.params.bookingId;
    for (const delay of RING_RETRY_DELAYS_MS) {
      if (!Object.keys(ringKeys).length) break;
      await sleep(delay);
      const now = (await event.data.ref.get()).data();
      if (!now || now.status !== "AwaitingDriver") break;
      const pending = await db.collection("ringDeliveries").where("bookingId", "==", bookingId).where("ackAt", "==", null).get();
      if (pending.empty) break;
      const retries = [];
      pending.forEach((d) => {
        const { driverMobile, key, attempts } = d.data();
        const entry = ringKeys[driverMobile];
        if (!entry) return;
        retries.push(d.ref.update({ attempts: (attempts || 1) + 1, lastRetryAt: Date.now() }));
        retries.push(sendDirectRequestRingAlert(entry.token, load, bookingId, driverMobile, key));
      });
      console.log(`[onDirectRequestBroadcast] booking ${bookingId}: re-ring ${pending.size} unconfirmed phone(s)`);
      await Promise.all(retries);
    }
  }
);

// Owner rule (2026-10-13): once one driver accepts a load (or the customer
// cancels it before anyone does), it disappears from every OTHER driver's
// phone at once -- their ring screen closes, the ringing stops and the
// banner is removed (see AppFirebaseMessagingService "load_taken"). The
// in-app list already drops it by itself (it only shows AwaitingDriver).
exports.onBookingTaken = onDocumentUpdated("bookings/{bookingId}", async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;
  if (before.status !== "AwaitingDriver" || after.status === "AwaitingDriver") return;
  const alerted = [...new Set([...(after.alertedDriverMobiles || before.alertedDriverMobiles || []), ...(after.ringTargets || before.ringTargets || [])])];
  const winner = after.driverMobile || null;
  const targets = alerted.filter((m) => m && m !== winner);
  if (!targets.length) return;
  const snaps = await db.getAll(...targets.map((m) => db.collection("drivers").doc(m)));
  await Promise.all(snaps.map(async (snap) => {
    const token = snap.get("fcmToken");
    if (!token) return;
    try {
      await getMessaging().send({
        token,
        android: { priority: "high" },
        data: { type: "load_taken", bookingId: event.params.bookingId, reason: after.status === "Ongoing" ? "taken" : "closed" },
      });
    } catch (e) {
      console.error("[onBookingTaken] send failed:", e.message);
      await clearStaleFcmTokenOnFailure("drivers", snap.id, e);
    }
  }));
});

// ---------------- Nearby-driver escalation (new, 2026-10-19) ----------------
// Owner spec (developer guide, Step 15): onDirectRequestBroadcast above
// already pings every eligible driver (duty on, picked category only: functions/tripLock.js)
// (30km) the instant a booking is created, with no duty-on filter (an
// earlier deliberate choice -- see its own comment). This is a DELIBERATE
// SECOND NUDGE, not a search for new territory: once a booking has sat
// unmatched for a while, re-ring specifically the drivers who are
// currently on duty (so a driver who had the app backgrounded/ignored the
// first ring gets another, louder chance), widening the radius in stages
// instead of blasting everyone at full radius again. "Won't go again to
// who already received it" is scoped to each booking's own escalation --
// a driver nudged at the 5km tier is never nudged again at 10km/20km for
// the SAME booking -- not a block on ever re-pinging someone from the
// original broadcast, since re-pinging the already-alerted-but-silent
// drivers is the entire point here.
//
// Deliberately does NOT repeat onDirectRequestBroadcast's own 20s/25s
// rapid re-ring loop (RING_RETRY_DELAYS_MS) -- that loop holds one
// function invocation open per booking for ~45s, which is fine for a
// single just-created booking but not for a scheduled pass that may be
// escalating several unmatched bookings in the same run.
// How many later rounds a still-unmatched booking gets (owner 2026-11-04: the radius tiers are gone with the GPS condition -- each round
// simply rings whoever has become eligible since the previous round and was not alerted yet).
// Owner 2026-11-10: the ring climbs ONE category per round and stops at +2 (RING_EXTRA_CATEGORIES): round 1 rings the next category up, round 2 the one after, then no more.
const ESCALATION_ROUNDS = RING_EXTRA_CATEGORIES;
// How old (from createdAt) a still-unmatched booking must be before the
// FIRST escalation nudge goes out -- matches the owner's "2 minutes"
// spec. Subsequent tiers (10km, then 20km) fire on later scheduled passes
// once eligible, not instantly one after another.
const ESCALATION_FIRST_NUDGE_SEC = 120;
async function escalateOneBooking(bookingId, load, tierIndex) {
  const [driversSnap, ongoingSnap] = await Promise.all([
    db.collection("drivers").get(),
    db.collection("bookings").where("status", "==", "Ongoing").get(),
  ]);
  const ongoingByDriver = {};
  ongoingSnap.forEach((d) => {
    const b = d.data();
    const key = b.driverMobile || (b.driverName ? `name:${b.driverName}` : null);
    if (!key) return;
    (ongoingByDriver[key] ||= []).push(b);
  });

  const fleet = await loadFleetContext(ongoingSnap);
  const alreadyAlerted = new Set([...(load.alertedDriverMobiles || []), ...(load.ringTargets || [])]);
  const newlyAlerted = [];
  const sends = [];
  const ringKeys = {};
  const skipLog = [];

  driversSnap.forEach((doc) => {
    const driver = doc.data();
    const tag = `${doc.id} (${driver.name || "?"})`;
    if (alreadyAlerted.has(doc.id)) { skipLog.push(`${tag}: already alerted for this booking`); return; }
    // Same rule as the first ring (functions/tripLock.js): duty on, approved, not blocked, not on a trip, the picked category plus ONE more category above it per round, +2 at most (owner 2026-11-10: round 1 = next category, round 2 = the one after, then it stops).
    // Same radius as the first ring (owner 2026-11-04), so a later round reaches anyone who has become eligible since the first ring
    // (went on duty, came inside the radius, finished a trip) and was not alerted yet.
    const mine = [...(ongoingByDriver[doc.id] || []), ...(ongoingByDriver[`name:${driver.name}`] || [])];
    const verdict = evaluateNewLoadDriver(driver, load, { extended: tierIndex + 1, mine, hasLoadConflict, notificationLockHours, haversineKm, isAppOpen: (d) => isAppOpenNow(d, Date.now()), fleetVehicles: driver.fleetOwner ? fleet.vehiclesFor(doc.id) : [], fleetMine: fleet.mineFor });
    if (!verdict.ok) { skipLog.push(`${tag}: ${verdict.reason}`); return; }
    if (!driver.fcmToken) { skipLog.push(`${tag}: no fcmToken`); return; }
    skipLog.push(`${tag}: NUDGING (round ${tierIndex + 1})`);
    newlyAlerted.push(doc.id);
    const ackKey = crypto.randomBytes(12).toString("hex");
    ringKeys[doc.id] = { key: ackKey, token: driver.fcmToken };
    sends.push(() => sendDirectRequestAlert(driver.fcmToken, load, bookingId, doc.id));
    sends.push(() => sendDirectRequestRingAlert(driver.fcmToken, load, bookingId, doc.id, ackKey));
  });

  console.log(`[escalateUnmatchedBookings] booking ${bookingId}: round ${tierIndex + 1} -- ${newlyAlerted.length} duty-on driver(s) newly nudged\n${skipLog.join("\n")}`);

  // Record the attempted tier even with zero matches, so the next
  // scheduled pass moves on to the next radius instead of retrying this
  // same one forever.
  const updates = { escalatedTierIndex: tierIndex + 1 };
  if (newlyAlerted.length) {
    updates.alertedDriverMobiles = [...(load.alertedDriverMobiles || []), ...newlyAlerted];
  }
  await db.collection("bookings").doc(bookingId).update(updates).catch((e) => console.error("[escalateUnmatchedBookings] update", e.message));
  if (!newlyAlerted.length) return;

  const batch = db.batch();
  for (const [mobile, { key }] of Object.entries(ringKeys)) {
    batch.set(db.collection("ringDeliveries").doc(`${bookingId}_${mobile}`), { bookingId, driverMobile: mobile, key, sentAt: Date.now(), attempts: 1, ackAt: null });
  }
  await batch.commit().catch((e) => console.error("[escalateUnmatchedBookings] ringDeliveries", e.message));
  await Promise.all(sends.map((send) => send()));
}

exports.escalateUnmatchedBookings = onSchedule(
  { schedule: "every 2 minutes", timeZone: "Asia/Kolkata", region: "asia-south1" },
  async () => {
    const snap = await db.collection("bookings").where("status", "==", "AwaitingDriver").get();
    if (snap.empty) return;

    const now = Date.now();
    const jobs = [];
    snap.forEach((doc) => {
      const load = doc.data();
      const bookingId = doc.id;
      const createdAtMs = load.createdAt?.toMillis ? load.createdAt.toMillis() : null;
      if (!createdAtMs) return;
      const ageSec = (now - createdAtMs) / 1000;
      if (ageSec < ESCALATION_FIRST_NUDGE_SEC) return;

      // escalatedTierIndex: how many of the ESCALATION_ROUNDS have already
      // been tried for this booking -- 0 = none yet, 1 = 5km done, etc.
      const tierIndex = load.escalatedTierIndex || 0;
      if (tierIndex >= ESCALATION_ROUNDS) return; // every round already done
      jobs.push(escalateOneBooking(bookingId, load, tierIndex));
    });
    await Promise.all(jobs);
  }
);

// Text for every customer alert. "arriving" and "loading" added 2026-10-13
// (owner: the customer must hear about their booking whether the app is
// open or closed) -- before that a customer only got "accepted" and
// "completed", and nothing when the truck reached their gate.
const CUSTOMER_ALERT_TEXT = {
  accepted: (b) => ({ title: "✅ ड्राइवर मिल गया!", body: `${b.driverName || "ड्राइवर"} आपकी बुकिंग स्वीकार कर चुके हैं और रास्ते में हैं।` }),
  arriving: (b) => ({ title: "🚚 गाड़ी पहुँचने वाली है", body: `${b.driverName || "ड्राइवर"} पिकअप के पास हैं। ऐप में OTP देखकर ड्राइवर को बताएँ।` }),
  loading: (b) => ({ title: "📦 लोडिंग शुरू हो गई", body: `आपका माल ${b.drop || "ड्रॉप"} के लिए लोड हो रहा है।` }),
  completed: (b) => ({ title: "🏁 डिलीवरी पूरी हुई", body: `आपकी बुकिंग (${b.pickup} → ${b.drop}) पूरी हो गई है।` }),
};
// Driver this close to pickup (straight line) counts as "arriving".
const CUSTOMER_ARRIVING_KM = 0.5;

// Customer-side equivalent of sendDirectRequestAlert above —
// reaches the customer even with the app fully closed, for the two moments
// they most need to know without having it open: their driver accepting
// (status -> Ongoing) and the trip finishing (status -> Completed). Reuses
// the same "new_load_alerts" channel already proven to reach a closed app,
// rather than registering a new, unproven one.
async function sendCustomerBookingAlert(token, booking, bookingId, kind, customerMobile) {
  if (!token) return;
  try {
    await getMessaging().send({
      token,
      notification: CUSTOMER_ALERT_TEXT[kind](booking),
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
    await clearStaleFcmTokenOnFailure("customers", customerMobile, e);
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
  const loadingStarted = after.status === "Ongoing" && !!after.loadingStartedAt && !before?.loadingStartedAt;
  // Arriving: fires once per booking, the first driverLocation write within
  // CUSTOMER_ARRIVING_KM of pickup before loading starts. Guarded by
  // customerArrivingNotified (set below) so the frequent GPS writes on
  // this doc never send it twice.
  const loc = after.driverLocation;
  const arriving = after.status === "Ongoing" && !after.loadingStartedAt && !after.customerArrivingNotified
    && loc?.lat != null && loc?.lng != null && after.pickupLat != null && after.pickupLng != null
    && haversineKm(loc.lat, loc.lng, after.pickupLat, after.pickupLng) <= CUSTOMER_ARRIVING_KM;
  const kind = becameCompleted ? "completed" : loadingStarted ? "loading" : becameOngoing ? "accepted" : arriving ? "arriving" : null;
  if (!kind) return;
  if (kind === "arriving") await event.data.after.ref.update({ customerArrivingNotified: true });

  const customerSnap = await db.collection("customers").doc(after.customerMobile).get();
  const token = customerSnap.data()?.fcmToken;
  if (!token) return;

  await sendCustomerBookingAlert(token, after, event.params.bookingId, kind, after.customerMobile);
});

// Server-side speech synthesis for AdminNotify's "🔊 Also read this aloud"
// checkbox -- owner request (2026-10-25), replacing an earlier client-side
// Web Speech API attempt after a real device turned out to have no
// window.speechSynthesis at all (confirmed via an on-screen diagnostic:
// synth=false). That's not fixable in JS -- the whole capability was
// missing from that WebView -- and asking every driver/customer to
// manually update system components before a feature works isn't a real
// rollout plan. Synthesizing a real MP3 server-side and just playing it
// back with a plain <audio> element sidesteps the problem entirely: audio
// playback is universally supported, unlike each device's own TTS engine.
//
// ttsClient is created lazily (NOT at module load time) -- its constructor
// does credential auto-discovery, which hung long enough on a Windows dev
// machine with no GCP metadata server reachable to blow right through the
// Firebase CLI's 10s "load and analyze the file" budget on deploy
// (deploy's own local analysis step requires()s this whole file, so
// anything slow at the top level delays every function, not just this
// one -- real bug this caused, not a flaky CLI timeout). Built once, on
// first actual use, inside a real function invocation instead.
let ttsClient = null;
function getTtsClient() {
  if (!ttsClient) ttsClient = new textToSpeech.TextToSpeechClient();
  return ttsClient;
}
async function synthesizeBroadcastAudio(text, docId) {
  const [response] = await getTtsClient().synthesizeSpeech({
    input: { text },
    voice: { languageCode: "hi-IN", ssmlGender: "NEUTRAL" },
    audioConfig: { audioEncoding: "MP3" },
  });
  const bucket = getStorage().bucket();
  const file = bucket.file(`adminBroadcasts/${docId}.mp3`);
  await file.save(response.audioContent, { metadata: { contentType: "audio/mpeg" } });
  await file.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${file.name}`;
}

// Admin's "Send Notification" screen (AdminNotify) -- logs a message to
// adminNotifications so it becomes a genuine, persisted announcement both
// the admin's "Sent Notifications" list AND the recipient's own "Admin
// Announcements" inbox (hamburger menu, both roles) read from. This part
// is always in-app -- a recipient always sees it next time they open the
// app, no matter what.
//
// speak = true additionally synthesizes the message into a real MP3 (see
// synthesizeBroadcastAudio above) and stores its public URL on the doc as
// audioUrl. useAnnouncementAlerts (App.jsx) watches for any new entry with
// audioUrl set and plays it via a plain <audio> element the moment it
// arrives -- but only for a recipient who already has the app open right
// now. Does NOT reach a closed/backgrounded app -- that would need a real
// FCM push + a native service to trigger playback, which needs a new
// native Android build the owner doesn't want to ship yet.
exports.sendAdminNotification = onCall({ region: "asia-south1" }, async (request) => {
  if (request.auth?.token?.admin !== true) throw new HttpsError("permission-denied", "Admin access required.");
  const { target, message, audience, speak } = request.data || {};
  const text = (message || "").trim();
  if (!text) throw new HttpsError("invalid-argument", "message is required.");
  const toRole = audience === "customer" ? "customer" : "driver";
  const col = toRole === "customer" ? "customers" : "drivers";
  const wantSpeak = speak === true;

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

  const docRef = db.collection("adminNotifications").doc();
  let audioUrl = null;
  if (wantSpeak) {
    try {
      audioUrl = await synthesizeBroadcastAudio(text, docRef.id);
    } catch (e) {
      // Still deliver the plain in-app notification even if speech
      // synthesis fails for some reason -- that part must never be
      // blocked by this best-effort extra.
      console.error("[sendAdminNotification] speech synthesis failed:", e.message);
    }
  }

  await docRef.set({
    toRole,
    target: target && target !== "all" ? target : "all",
    targetName,
    targetEmails,
    targetPhones,
    message: text,
    speak: wantSpeak,
    audioUrl,
    recipientCount,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, sentCount: recipientCount };
});

// Admin Announcements accumulate forever otherwise — meant to be a
// same-day heads-up (both Admin's own "Sent Notifications" list and every
// driver/customer's "Admin Announcements" inbox read from this same
// collection), not a permanent record, so it was quietly growing Firestore
// storage for no real benefit. Hard-deletes anything older than 24h.
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
// find out. This reaches them anyway, the same way sendDirectRequestAlert
// already does for new loads. appVersionCode is written once per launch by
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

// bookingOtps (see verifyPickupOtp below) is only ever needed for the
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

  // Guess limit + server-made code: see functions/otp.js. A wrong guess bumps a counter on the OTP document; after
  // OTP_MAX_BAD_GUESSES the check locks for OTP_LOCK_MS. The client treats any non-valid answer as "Incorrect OTP".
  const otpRef = db.collection("bookingOtps").doc(bookingId);
  const otpSnap = await otpRef.get();
  const verdict = judgeOtpGuess(otpSnap.exists ? otpSnap.data() : null, otp);
  if (verdict.update) await otpRef.update(verdict.update).catch((e) => console.error("[verifyPickupOtp] counter", e.message));
  return { valid: verdict.valid, ...(verdict.locked ? { locked: true } : {}), ...(verdict.pending ? { pending: true } : {}) };
});

// =====================================================================================================================================================================
// FLEET OWNERS (owner 2026-11-08): a transporter's vehicles are driven by people with NO app. When the owner accepts a booking and picks a vehicle (src/App.jsx
// fleetClaimWithVehicle) this callable (1) makes the driver's private trip link, (2) sends the same message by WhatsApp through MSG91 when an approved template is
// set in settings/main.fleetDispatchTemplate (a template name; its 5 body variables are, in order: pickup, drop, customer mobile, owner mobile, trip link), and
// (3) returns { link, sent } so the owner's app can offer the one-tap WhatsApp button when nothing was sent. The link opens public/trip.html, which talks to
// fleetTripAction below (driver enters the customer's pickup OTP, later taps "delivered"; the OWNER's app still ends the trip and does the money).
const FLEET_TRIP_PAGE = "https://sarthi-transport-74865.web.app/trip.html";
async function fleetLinkFor(bookingId) {
  const ref = db.collection("fleetTripLinks").doc(bookingId);
  const snap = await ref.get();
  if (snap.exists && snap.data().token) return snap.data().token;
  const token = newLinkToken();
  await ref.set({ token, bookingId, createdAt: FieldValue.serverTimestamp() });
  return token;
}
// "Add new vehicle" in a driver's My Profile (owner 2026-11-09): turns a self-driving driver into a fleet owner. His own vehicle becomes the first fleet vehicle (he is its driver),
// approval is inherited from his KYC, and the account gets the same owner shape the "I own several vehicles" sign-up makes. Refused while he has a trip running, because a running
// trip is not tied to a fleet vehicle and the new vehicle list could not tell he is busy. Idempotent: a second call just says already.
exports.convertDriverToFleetOwner = onCall({ region: "asia-south1" }, async (request) => {
  const token = request.auth?.token;
  const phoneMatch = (token?.phone_number || "").match(/^\+91(\d{10})$/);
  const emailMatch = (token?.email || "").match(/^(\d{10})@driver\.apnatransport\.local$/);
  const mobile = phoneMatch ? phoneMatch[1] : emailMatch ? emailMatch[1] : null;
  if (!mobile) throw new HttpsError("unauthenticated", "Sign in as a driver.");
  const ref = db.collection("drivers").doc(mobile);
  const snap = await ref.get();
  const plan = buildFleetConversion(snap.exists ? snap.data() : null, mobile);
  if (plan.already) return { ok: true, already: true };
  if (plan.error) return { ok: false, reason: plan.error };
  const running = await db.collection("bookings").where("driverMobile", "==", mobile).where("status", "==", "Ongoing").get();
  if (!running.empty) return { ok: false, reason: "trip-running" };
  const batch = db.batch();
  batch.set(db.collection("fleetVehicles").doc(plan.id), { ...plan.vehicle, createdAt: FieldValue.serverTimestamp() });
  batch.set(db.collection("fleetVehiclePrivate").doc(plan.id), { ...plan.priv, createdAt: FieldValue.serverTimestamp() });
  batch.update(ref, { ...plan.ownerPatch, fleetConvertedAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return { ok: true, vehicleId: plan.id };
});

exports.dispatchFleetTrip = onCall({ region: "asia-south1", secrets: [MSG91_AUTH_KEY, MSG91_WHATSAPP_NUMBER, MSG91_WHATSAPP_NAMESPACE] }, async (request) => {
  const callerPhone = callerPhoneFromAuth(request.auth?.token);
  if (!callerPhone) throw new HttpsError("unauthenticated", "Sign in required.");
  const { bookingId } = request.data || {};
  if (!bookingId) throw new HttpsError("invalid-argument", "bookingId is required.");
  const bSnap = await db.collection("bookings").doc(bookingId).get();
  if (!bSnap.exists) throw new HttpsError("not-found", "Booking not found.");
  const booking = bSnap.data();
  if (!booking.fleetBooking || !booking.fleetVehicleId || !booking.driverMobile || callerPhone !== `+91${booking.driverMobile}`) {
    throw new HttpsError("permission-denied", "Not the fleet owner of this booking.");
  }
  const privSnap = await db.collection("fleetVehiclePrivate").doc(booking.fleetVehicleId).get();
  const priv = privSnap.exists ? privSnap.data() : null;
  const token = await fleetLinkFor(bookingId);
  const link = `${FLEET_TRIP_PAGE}?b=${encodeURIComponent(bookingId)}&k=${token}`;
  const driverMobile = fleetCleanMobile(priv?.driverMobile || booking.fleetDriverMobile);
  let sent = false;
  try {
    const cfg = (await db.collection("settings").doc("main").get()).data() || {};
    const templateName = typeof cfg.fleetDispatchTemplate === "string" ? cfg.fleetDispatchTemplate.trim() : "";
    const authKey = MSG91_AUTH_KEY.value(), fromNumber = MSG91_WHATSAPP_NUMBER.value(), namespace = MSG91_WHATSAPP_NAMESPACE.value();
    if (templateName && authKey && fromNumber && namespace && driverMobile.length === 10) {
      const vars = [booking.pickup || "-", booking.drop || "-", fleetCleanMobile(booking.customerMobile) || "-", fleetCleanMobile(booking.driverMobile), link];
      const res = await fetch("https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/", {
        method: "POST",
        headers: { authkey: authKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          integrated_number: fromNumber, content_type: "template",
          payload: { messaging_product: "whatsapp", type: "template", template: { name: templateName, language: { code: "hi", policy: "deterministic" }, namespace,
            to_and_components: [{ to: [`91${driverMobile}`], components: Object.fromEntries(vars.map((v, i) => [`body_${i + 1}`, { type: "text", value: String(v).slice(0, 900) }])) }] } },
        }),
      });
      const bodyText = await res.text();
      if (res.ok) { sent = true; console.log(`[dispatchFleetTrip] ${bookingId}: MSG91 response (HTTP ${res.status}):`, bodyText); }
      else console.error(`[dispatchFleetTrip] ${bookingId}: rejected by MSG91 (HTTP ${res.status}):`, bodyText);
    }
  } catch (e) {
    console.error("[dispatchFleetTrip] send failed:", e.message);
  }
  return { link, sent, text: buildFleetDispatchText({ booking, ownerName: booking.ownerName, ownerMobile: booking.driverMobile, link }) };
});

// The trip page's own door (public/trip.html): no login -- the secret in the link is the proof. Actions: "info" (what the driver needs to see), "otp" (the customer's 4-digit
// pickup code, same guess limit as verifyPickupOtp; right code starts the loading timer exactly like the app does), "delivered" (a flag the owner's app shows; the OWNER
// ends the trip). Nothing here touches money, the wallet or the trip log.
exports.fleetTripAction = onRequest({ region: "asia-south1", cors: true }, async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ ok: false, error: "post-only" }); return; }
  const { b: bookingId, k: key, action, otp } = req.body || {};
  if (!bookingId || !key || typeof bookingId !== "string" || bookingId.length > 80) { res.status(400).json({ ok: false, error: "bad-request" }); return; }
  try {
    const linkSnap = await db.collection("fleetTripLinks").doc(bookingId).get();
    if (!linkSnap.exists || !tokenMatches(linkSnap.data().token, key)) { res.status(403).json({ ok: false, error: "bad-link" }); return; }
    const bRef = db.collection("bookings").doc(bookingId);
    const bSnap = await bRef.get();
    if (!bSnap.exists) { res.status(404).json({ ok: false, error: "not-found" }); return; }
    const b = bSnap.data();
    const state = () => ({
      status: b.status, started: !!b.loadingStartedAt, delivered: !!b.fleetDeliveredAt,
      pickup: b.pickup || "", drop: b.drop || "", pickupLat: b.pickupLat ?? null, pickupLng: b.pickupLng ?? null, dropLat: b.dropLat ?? null, dropLng: b.dropLng ?? null,
      customerMobile: fleetCleanMobile(b.customerMobile), ownerMobile: fleetCleanMobile(b.driverMobile), ownerName: b.ownerName || "", driverName: b.fleetDriverName || "",
      vehicleNumber: b.fleetVehicleNumber || "", scheduledFor: b.scheduledFor || null,
    });
    if (!b.fleetBooking) { res.status(403).json({ ok: false, error: "not-a-fleet-trip" }); return; }
    if (action === "info" || !action) { res.json({ ok: true, ...state() }); return; }
    if (b.status !== "Ongoing") { res.json({ ok: false, error: "trip-not-active", ...state() }); return; }
    if (action === "otp") {
      if (b.loadingStartedAt) { res.json({ ok: true, valid: true, already: true, ...state() }); return; }
      const otpRef = db.collection("bookingOtps").doc(bookingId);
      const otpSnap = await otpRef.get();
      const verdict = judgeOtpGuess(otpSnap.exists ? otpSnap.data() : null, otp);
      if (verdict.update) await otpRef.update(verdict.update).catch((e) => console.error("[fleetTripAction] counter", e.message));
      if (verdict.valid) {
        await bRef.update({ loadingStartedAt: Date.now(), travelPausedAt: null, pausedMs: 0, reachedDropAt: null, fleetOtpVerifiedAt: Date.now() });
        b.loadingStartedAt = Date.now();
      }
      res.json({ ok: true, valid: !!verdict.valid, ...(verdict.locked ? { locked: true } : {}), ...(verdict.pending ? { pending: true } : {}), ...state() });
      return;
    }
    if (action === "delivered") {
      if (!b.loadingStartedAt) { res.json({ ok: false, error: "enter-otp-first", ...state() }); return; }
      if (!b.fleetDeliveredAt) { await bRef.update({ fleetDeliveredAt: Date.now() }); b.fleetDeliveredAt = Date.now(); }
      res.json({ ok: true, ...state() });
      return;
    }
    res.status(400).json({ ok: false, error: "unknown-action" });
  } catch (e) {
    console.error("[fleetTripAction]", e);
    res.status(500).json({ ok: false, error: "server-error" });
  }
});

// Makes the pickup OTP when a booking first becomes Ongoing (owner request 2026-11-02). The driver's own phone used to make and
// write it, so it always knew the answer and could overwrite it; now only this function (Admin SDK) can write bookingOtps.
// `create()` fails with ALREADY_EXISTS if one is there already (a retry, or a stale app version that still writes its own),
// which is exactly the "issue once" behaviour wanted.
exports.issuePickupOtp = onDocumentUpdated("bookings/{bookingId}", async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!shouldIssuePickupOtp(before, after)) return;
  try {
    await db.collection("bookingOtps").doc(event.params.bookingId).create({
      otp: newPickupOtp(),
      customerMobile: after.customerMobile || "",
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    if (e.code !== 6 && !/already exists/i.test(e.message || "")) throw e;
  }
});

// Mints a Firebase custom token for LocationTrackerService (see
// android/app/src/main/java/com/apnatransport/app/LocationTrackerService.java)
// to sign into. The foreground service writes GPS fixes to Firestore from
// native Java code, outside the WebView, so it can't reuse the JS Firebase
// Auth SDK's session (they're entirely separate SDK instances/processes) --
// it needs its own signInWithCustomToken() session. request.auth here is
// still the normal PIN-based session the WebView is already signed into
// (Capacitor plugin calls carry the calling page's auth context), so this
// just mints a token for that SAME uid rather than trusting any uid the
// native side might ask for.
exports.mintLocationServiceToken = onCall({ region: "asia-south1" }, async (request) => {
  const callerPhone = callerPhoneFromAuth(request.auth?.token);
  if (!callerPhone) throw new HttpsError("unauthenticated", "Sign in required.");
  const token = await getAuth().createCustomToken(request.auth.uid);
  return { token };
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
// Driver taps "टेस्ट घंटी" (LoadBellButton in src/App.jsx): sends the
// driver's OWN phone the exact same data-only ring message a real load
// uses, after a short delay so they can lock the phone or close the app
// first. bookingId starts with "TEST-" -- the app ignores Accept/Reject for
// it (nothing to claim). Only to the caller's own fcmToken, max once per
// 30 s per driver.
exports.sendTestRing = onCall({ region: "asia-south1" }, async (request) => {
  const callerPhone = callerPhoneFromAuth(request.auth?.token);
  if (!callerPhone) throw new HttpsError("unauthenticated", "Sign in required.");
  const mobile = callerPhone.replace("+91", "");
  const ref = db.collection("drivers").doc(mobile);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "not_found" };
  const d = snap.data();
  if (!d.fcmToken) return { ok: false, reason: "no_token" };
  const now = Date.now();
  if (d.lastTestRingAt && now - d.lastTestRingAt < 30000) throw new HttpsError("resource-exhausted", "Wait 30 seconds.");
  await ref.update({ lastTestRingAt: now });
  const delaySec = Math.max(0, Math.min(15, Number(request.data?.delaySec) || 0));
  if (delaySec) await new Promise((r) => setTimeout(r, delaySec * 1000));
  try {
    await getMessaging().send({
      token: d.fcmToken,
      android: { priority: "high" },
      data: {
        type: "direct_request_ring",
        bookingId: `TEST-${now}`,
        pickup: "🔔 टेस्ट घंटी — यह असली लोड नहीं है",
        drop: "बंद करने के लिए कोई भी बटन दबाएँ",
        weight: ringWeightText({ customerName: "टेस्ट ग्राहक", scheduledFor: new Date(now + 24 * 3600 * 1000 + 5.5 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " "), returnTrip: true, fare: 1250, distance: 14, weight: 1500 }),
      },
    });
    return { ok: true };
  } catch (e) {
    console.error("[push] test ring send failed:", e.message);
    await clearStaleFcmTokenOnFailure("drivers", mobile, e);
    return { ok: false, reason: "send_failed" };
  }
});

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

// The one Change Log entry with a real, deterministic data remedy
// (duplicate Admin route-rate entries left behind by an already-fixed
// edit-save bug). Run here with Admin SDK privileges instead of trusting
// the admin's own browser session to have current data, since
// resolveChangeLogEntry below runs this before ever asking Claude to
// verify anything.
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
// "Resolve" on the scan's "accepted trip(s) not started for over 24 h" / "driver on more than one trip" entries (owner 2026-11-05: these came back EVERY day,
// because "Resolve" only asked an AI for an opinion while the stuck trips themselves stayed in Firestore and the next scan re-opened the entry).
// Closes exactly the trips the scan reports (`findStuckTrips`, functions/healthAudit.js): accepted, never started, not an Advance booking, older than 24 h --
// their pickup OTP is already deleted (expireOldBookingOtps), so they can never start and only keep a driver "busy" for ever. Marks them Cancelled the same
// way the app's cancelBooking does (status + cancelledAt; no wallet change -- commission is 0) plus who/why. A trip that started, an Advance booking and any
// recent trip are never touched, so two genuinely recent trips of one driver stay flagged. Returns how many were closed.
async function closeStuckTrips() {
  const snap = await db.collection("bookings").where("status", "==", "Ongoing").get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const stuck = findStuckTrips(rows, Date.now());
  for (let i = 0; i < stuck.length; i += 400) {
    const batch = db.batch();
    stuck.slice(i, i + 400).forEach((b) => batch.update(db.collection("bookings").doc(b.id), { status: "Cancelled", cancelledAt: FieldValue.serverTimestamp(), cancelledBy: "system-cleanup", cancelReason: "Accepted but never started for over 24 h (pickup OTP expired); closed by Admin Resolve." }));
    await batch.commit();
  }
  if (stuck.length) console.log(`[closeStuckTrips] closed ${stuck.length} stuck trip(s): ${stuck.map((b) => b.id).join(", ")}`);
  return stuck.length;
}
const RESOLVE_ACTIONS = {
  "cleanup-orphaned-admin-rates": cleanupOrphanedAdminRates,
  "close-stuck-trips": closeStuckTrips,
};

// Anthropic API key (set via `firebase functions:secrets:set ANTHROPIC_API_KEY`,
// never hardcoded or committed) — same not_configured fallback pattern as
// GEMINI_API_KEY/MSG91_* above: until it's set, this returns reason:
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
exports.resolveChangeLogEntry = onCall({ region: "asia-south1", secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300, memory: "512MiB" }, async (request) => {
  if (request.auth?.token?.admin !== true) throw new HttpsError("permission-denied", "Admin access required.");
  const { bugId } = request.data || {};
  if (!bugId) throw new HttpsError("invalid-argument", "bugId is required.");

  const ref = db.collection("bugs").doc(bugId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Change Log entry not found.");
  const bug = snap.data();

  await ref.update({ status: "resolving", resolvingAt: FieldValue.serverTimestamp() });

  // Entries written by the morning/evening scan (id "scan-...") are settled by the scan's own truth, never by an AI's opinion (owner 2026-11-05: "Resolve" used to
  // mark them fixed on the strength of "code-level fix shipped" while the problem was still in the live data, so they re-opened every day). Run the registered data
  // remedy (if any), then run the full scan again: it re-opens this entry when the problem is still detected and closes it ("verified") when it is gone.
  if (String(bugId).startsWith("scan-") && !String(bugId).startsWith("scan-changes-")) {
    try {
      let did = "";
      const act = RESOLVE_ACTIONS[bug.resolveAction];
      if (act) { const n = await act(); did = n > 0 ? `Closed ${n} record(s). ` : "Nothing needed closing. "; }
      await runDailyHealthCheck("lastManualRun");
      const after = (await ref.get()).data() || {};
      const fixed = after.status === "fixed";
      const note = `${did}${after.resolutionNote || (fixed ? "Verified by the scan: no longer detected." : "Checked just now: still detected.")}`.trim();
      if (!fixed) await ref.update({ status: "open", resolutionNote: note, resolvingAt: FieldValue.delete() });
      else await ref.update({ resolutionNote: note });
      return { ok: true, resolved: fixed, note };
    } catch (e) {
      console.error("[resolveChangeLogEntry] scan entry failed:", e.message);
      await ref.update({ status: "open", resolutionNote: "Could not re-check just now (" + String(e.message).slice(0, 120) + ") -- try again.", resolvingAt: FieldValue.delete() });
      return { ok: false, reason: "error" };
    }
  }

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
        system: "You are verifying, for the admin of a production Indian trucking-marketplace app (Apna Transport), whether a previously-logged Change Log entry (a bug, feature, UI or config change) is currently resolved. Respond with ONLY strict JSON, no markdown: {\"resolved\": true|false, \"note\": \"one short plain-language sentence for the admin\"}. If the entry describes a code-level fix that its own description says already shipped, and no live data action contradicts that, treat it as resolved. If a data remedy just ran, factor its actual result into your note and your resolved decision.",
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

// ---------------- Number masking + WhatsApp (both MSG91) ----------------
// Replaces Kaleyra for masked calling below -- the owner closed their
// Kaleyra account, and MSG91 (already in use for WhatsApp direct-request
// alerts above) offers the same kind of Voice click-to-call/bridge API
// under the same account/AuthKey, so this moved onto MSG91 too rather than
// picking a third vendor.
//
// Secrets (set via `firebase functions:secrets:set NAME`, never hardcoded
// or committed):
//   MSG91_AUTH_KEY           -- reused from the WhatsApp integration above
//                                (one AuthKey per MSG91 account, shared
//                                across all of that account's channels).
//   MSG91_VOICE_CALLER_ID    -- the Voice number provisioned on MSG91's
//                                dashboard for this account (the number
//                                both sides see as caller ID).
// Until both are set, initiateMaskedCall returns reason: "not_configured"
// and the client falls back to a plain tel: link, instead of throwing.
const MSG91_VOICE_CALLER_ID = defineSecret("MSG91_VOICE_CALLER_ID");

exports.initiateMaskedCall = onCall({ region: "asia-south1", secrets: [MSG91_AUTH_KEY, MSG91_VOICE_CALLER_ID] }, async (request) => {
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

  const authKey = MSG91_AUTH_KEY.value(), callerId = MSG91_VOICE_CALLER_ID.value();
  if (!authKey || !callerId) return { ok: false, reason: "not_configured" };

  // MSG91's click-to-call ("2-way call"): `destination` is rung first,
  // then on answer each number in `destinationB` is dialed and bridged in
  // -- the same shape as Kaleyra's old from/to, just destination(A)/
  // destinationB(array) instead. caller_id is the registered Voice number
  // both sides see as caller ID -- see
  // control.msg91.com/api/v5/voice/call/ctc docs.
  const body = JSON.stringify({
    caller_id: callerId,
    destination: callerPhone.replace(/^\+/, ""),
    destinationB: [`91${otherMobile}`],
  });
  let msg91CallId = null;
  try {
    const res = await fetch("https://control.msg91.com/api/v5/voice/call/ctc", {
      method: "POST",
      headers: { accept: "application/json", authkey: authKey, "content-type": "application/json" },
      body,
    });
    const data = await res.json();
    if (!res.ok) { console.error("[maskedCall] MSG91 rejected the request:", data); return { ok: false, reason: "msg91_error" }; }
    // MSG91's click-to-call response shape for the call-id field hasn't
    // been confirmed against their docs yet (only the request shape was
    // available when this was written) -- tried in order of how MSG91's
    // other v5 APIs name this field. Worst case this stays null and the
    // call itself still goes through; it only affects the ID shown in the
    // audit log below.
    msg91CallId = data?.data?.call_id || data?.call_id || data?.request_id || data?.data?.id || data?.id || null;
  } catch (e) {
    console.error("[maskedCall] MSG91 request failed:", e.message);
    return { ok: false, reason: "msg91_error" };
  }

  // Audit trail for dispute resolution -- which booking, who initiated,
  // when. Written server-side with Admin privileges (bypasses Firestore
  // rules), readable by admin only -- see firestore.rules.
  await db.collection("callLogs").add({
    bookingId,
    initiatedBy: isCustomer ? "customer" : "driver",
    msg91CallId,
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
      // One role per number (owner 2026-11-12): a number that is a Customer must not become a Driver through "forgot PIN" (this branch CREATES the account), nor the reverse.
      try {
        const roles = await lookupMobileRoles(toRole, (rr) => mobileHasRoleAccount(mobile, rr));
        if (refusesSecondRole(roles)) return { ok: false, reason: "other_role" };
      } catch (e2) {
        console.error("[forgotPin] role lookup failed:", e2.message);
        return { ok: false, reason: "reset_failed" };
      }
      await getAuth().createUser({ email, password: newPin });
    } else {
      console.error("[forgotPin] reset failed:", e.message);
      return { ok: false, reason: "reset_failed" };
    }
  }
  return { ok: true };
});

// Sign-up pre-check: does this mobile already have a PIN account for this
// role, and does it already belong to the OTHER role? Callable signed-out
// (nobody has an account yet). ONE ROLE PER NUMBER (owner 2026-11-12): a
// Customer number cannot become a Driver and vice versa (functions/roleLock.js).
// Reveals only yes/no facts the sign-up screen would reveal anyway.
exports.checkMobileRegistered = onCall({ region: "asia-south1" }, async (request) => {
  const { role, mobile } = request.data || {};
  if (typeof mobile !== "string" || !/^\d{10}$/.test(mobile)) throw new HttpsError("invalid-argument", "A 10-digit mobile is required.");
  const toRole = role === "driver" ? "driver" : "customer";
  try {
    const r = await lookupMobileRoles(toRole, (rr) => mobileHasRoleAccount(mobile, rr));
    // exists = this role already has the number; otherRoleExists = the number belongs to the OTHER role (owner 2026-11-12: one role per number).
    return { ok: true, exists: r.exists, otherRoleExists: r.otherRoleExists };
  } catch (e) {
    console.error("[checkMobileRegistered] lookup failed:", e.message);
    return { ok: false, reason: "error" };
  }
});

// Does this mobile hold an account in `role`? A PIN login (Auth user) or the role's profile document. Throws on a real lookup error.
async function mobileHasRoleAccount(mobile, role) {
  try {
    await getAuth().getUserByEmail(pinAuthEmail(mobile, role));
    return true;
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw e;
  }
  const snap = await db.collection(role === "driver" ? "drivers" : "customers").doc(mobile).get();
  return snap.exists;
}

// Admin-only: turn a CSV the Admin screen already built into a real, short-lived
// download link. The Android app's WebView has no download handler, so a blob
// <a download> does nothing there (owner 2026-10-29: "not downloading"); an
// https link opens in the phone's browser, which does download it. The file is
// private (no client can read adminExports/, see storage.rules) and the signed
// link expires in 10 minutes.
exports.createCsvDownloadLink = onCall({ region: "asia-south1" }, async (request) => {
  if (request.auth?.token?.admin !== true) throw new HttpsError("permission-denied", "Admin access required.");
  const { csv, fileName } = request.data || {};
  if (typeof csv !== "string" || !csv.trim() || csv.length > 2000000) throw new HttpsError("invalid-argument", "A CSV (max 2 MB) is required.");
  const safeName = String(fileName || "export.csv").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80).replace(/(\.csv)?$/i, ".csv");
  const file = getStorage().bucket().file(`adminExports/${crypto.randomBytes(8).toString("hex")}-${safeName}`);
  await file.save(csv, { metadata: { contentType: "text/csv; charset=utf-8", contentDisposition: `attachment; filename="${safeName}"` } });
  const [url] = await file.getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 10 * 60 * 1000 });
  return { ok: true, url };
});

// Admin only (owner 2026-11-04, "fix this too"): repairs drivers / vehicle types saved with 9,000 kg because the old Driver-KYC autofill matched "16 wheeler"
// to "6 wheeler" (see functions/vehicleSpecRepair.js for exactly which records are touched). DRY RUN by default: { apply: false } only lists what WOULD
// change; { apply: true } writes capacityKg = 30,000 on those drivers' vehicleSpec and on those vehicleTypes entries, and nothing else.
exports.repairSixteenWheelerCapacity = onCall({ region: "asia-south1" }, async (request) => {
  if (request.auth?.token?.admin !== true) throw new HttpsError("permission-denied", "Admin access required.");
  const apply = request.data?.apply === true;
  const [dSnap, tSnap] = await Promise.all([db.collection("drivers").get(), db.collection("vehicleTypes").get()]);
  const plan = planSixteenWheelerRepair(dSnap.docs.map((x) => ({ id: x.id, ...x.data() })), tSnap.docs.map((x) => ({ id: x.id, ...x.data() })));
  if (apply) {
    const writes = [
      ...plan.drivers.map((d) => ({ ref: db.collection("drivers").doc(String(d.mobile)), data: { "vehicleSpec.capacityKg": RIGHT_CAPACITY_KG } })),
      ...plan.types.map((t) => ({ ref: db.collection("vehicleTypes").doc(String(t.key)), data: { capacityKg: RIGHT_CAPACITY_KG } })),
    ];
    for (let i = 0; i < writes.length; i += 400) {
      const batch = db.batch();
      writes.slice(i, i + 400).forEach((w) => batch.update(w.ref, w.data));
      await batch.commit();
    }
    console.log(`[repairSixteenWheelerCapacity] fixed ${plan.drivers.length} driver(s) + ${plan.types.length} vehicle type(s) -> ${RIGHT_CAPACITY_KG} kg`);
  }
  return { ok: true, applied: apply, newCapacityKg: RIGHT_CAPACITY_KG, drivers: plan.drivers.slice(0, 100), driverCount: plan.drivers.length, types: plan.types, typeCount: plan.types.length };
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
// the customer-facing current-load radius that bug was actually in).
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
  // Non-fatal on purpose (2026-11-03): if GitHub cannot be read (private repo, rate limit, outage) that is a NOTE, not a failure --
  // it used to raise a "high" Change Log entry every single day for something that was not wrong with the app.
  const notes = [];
  const findings = [];
  let src;
  try {
    const res = await fetch(`${SOURCE_REPO_RAW_BASE}/src/App.jsx`);
    if (!res.ok) return { findings, notes: [`Source markers not checked: GitHub returned HTTP ${res.status} (private repository?).`] };
    src = await res.text();
  } catch (e) {
    return { findings, notes: [`Source markers not checked: ${e.message}`] };
  }
  const mustContain = [
    ["CURRENT_BID_RADIUS_KM = 30", "30km current-load proximity radius"],
    ["ADVANCE_BID_RADIUS_KM = 50", "50km advance-load proximity radius"],
    ["if (!pickupCoords || !loc || loc.lat == null || loc.lng == null) return false;", "proximity filter failing closed on missing coordinates"],
    ["function driverIsOnTrip(", "busy-driver rule (a vehicle on a trip must not be listed)"],
    ["const isReturn = !b.returnTrip && isReturnLoadFor(driver, b);", "Round trip not discounted twice"],
  ];
  for (const [needle, label] of mustContain) {
    if (!src.includes(needle)) findings.push({ id: `source-marker-${label.slice(0, 20)}`, sev: "high", area: "Source", title: `Expected rule missing from the source: ${label}`, detail: `"${needle}" is not in src/App.jsx on the main branch.` });
  }
  return { findings, notes };
}

// ---- morning / evening scan: live data + deployment drift + change detection (2026-11-03) ----------------------------------------------
// The pure logic is in functions/healthAudit.js. This half talks to Firestore / GitHub / the live site and writes the result for Admin:
//   systemHealth/heartbeat  -> `${label}At/Status/Summary` + `${label}Findings` + `${label}Changes` (the Live Dashboard tile reads this)
//   systemHealth/changeFeed -> newest-first list of every detected change (criteria, settings, builds)
//   systemHealth/baseline   -> what the previous scan saw (so only NEW changes are reported)
//   bugs/scan-*             -> one Change Log entry per critical/high finding (re-opened if it comes back)
async function fetchJsonTimeout(url, headers = {}, ms = 12000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const res = await fetch(url, { headers, signal: ctl.signal }); let data = null; try { data = await res.json(); } catch (e) { /* not json */ } return { ok: res.ok, status: res.status, data }; }
  catch (e) { return { ok: false, status: 0, data: null, error: e.message }; } finally { clearTimeout(t); }
}
const REPO_HEAD_API = "https://api.github.com/repos/newsuraj02/SarthiTransport/commits/claude/app-from-document-njzc58";
function readFunctionsStamp() { try { return require("./build.json"); } catch (e) { return null; } }
async function loadLiveData() {
  const col = async (name, q) => (await (q ? q(db.collection(name)) : db.collection(name)).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const [drivers, bookings, withdrawals, rechargeRequests, adminRouteFares, vehicleTypes] = await Promise.all([
    col("drivers"), col("bookings", (c) => c.where("status", "in", ["Ongoing", "AwaitingDriver"])), col("withdrawals", (c) => c.where("status", "==", "Pending")),
    col("rechargeRequests", (c) => c.where("status", "==", "Pending")), col("adminRouteFares"), col("vehicleTypes"),
  ]);
  const settingsSnap = await db.collection("settings").doc("main").get();
  const ongoing = bookings.filter((b) => b.status === "Ongoing");
  const otpSnaps = ongoing.length ? await db.getAll(...ongoing.map((b) => db.collection("bookingOtps").doc(b.id))) : [];
  return { drivers, bookings, withdrawals, rechargeRequests, adminRouteFares, vehicleTypes, settings: settingsSnap.exists ? settingsSnap.data() : {}, otpIds: otpSnaps.filter((x) => x.exists).map((x) => x.id) };
}

async function runDailyHealthCheck(label) {
  const findings = [];
  const notes = [];
  const infra = (id, title, detail) => findings.push({ id: `infra-${id}`, sev: "high", area: "Infrastructure", title, detail: String(detail || "").slice(0, 400) });

  try {
    const res = await fetch(PRODUCTION_URL);
    if (!res.ok) infra("hosting", `Production URL returned HTTP ${res.status}`, "");
  } catch (e) {
    infra("hosting", "Production URL unreachable", e.message);
  }

  try { await signInHealthCheckAccount("9990001111@customer.apnatransport.local"); } catch (e) { infra("customer-login", "Customer login test failed", e.message); }
  try { await signInHealthCheckAccount("9990002222@driver.apnatransport.local"); } catch (e) { infra("driver-login", "Driver login test failed", e.message); }

  const nearKm = haversineKm(HEALTH_CHECK_DRIVER_LOC.lat, HEALTH_CHECK_DRIVER_LOC.lng, HEALTH_CHECK_NEAR_PICKUP.lat, HEALTH_CHECK_NEAR_PICKUP.lng);
  const farKm = haversineKm(HEALTH_CHECK_DRIVER_LOC.lat, HEALTH_CHECK_DRIVER_LOC.lng, HEALTH_CHECK_FAR_PICKUP.lat, HEALTH_CHECK_FAR_PICKUP.lng);
  if (!(nearKm <= HEALTH_CHECK_RADIUS_KM)) infra("proximity-near", "Proximity check failed", `Known-near test point measured ${nearKm.toFixed(1)}km, expected within ${HEALTH_CHECK_RADIUS_KM}km.`);
  if (!(farKm > HEALTH_CHECK_RADIUS_KM)) infra("proximity-far", "Proximity check failed", `Known-far test point measured ${farKm.toFixed(1)}km, expected outside ${HEALTH_CHECK_RADIUS_KM}km -- would incorrectly be shown.`);

  const src = await checkSourceMarkers();
  findings.push(...src.findings); notes.push(...src.notes);

  // --- live data audit (the busy-driver rule, double bookings, stuck trips, missing OTPs, settings, money, queues) ---
  let live = null;
  try {
    live = await loadLiveData();
    findings.push(...auditLiveData({ ...live, now: Date.now() }));
    // The RING path (onDirectRequestBroadcast / escalation) decides with this file's own hasLoadConflict -- test THAT code on the live trips:
    // every driver on a running trip must count as having a conflict, or the ring would still wake a driver who is mid-trip (2026-11-03).
    const t = Date.now();
    const ringWouldRing = live.drivers.filter((d) => {
      const mine = live.bookings.filter((b) => b.status === "Ongoing" && auditIsDriverRecord(b, d));
      if (!mine.some((b) => auditIsBookingRunning(b, t))) return false;
      const cap = Number(d.vehicleSpec && d.vehicleSpec.capacityKg) || 0;
      return !hasLoadConflict({}, mine, notificationLockHours(cap));
    });
    if (ringWouldRing.length) findings.push({ id: "ring-busy-driver", sev: "critical", area: "Ring", title: `The load ring would still wake ${ringWouldRing.length} driver(s) who are on a trip`, detail: "Cloud Function hasLoadConflict / getBookingWindow in functions/index.js ignore trips with hours = 0 (all of them). Needs the same fix the app already has. Driver ids: " + ringWouldRing.slice(0, 8).map((d) => String(d.id || d.mobile || "").slice(-4)).join(", ") });
  }
  catch (e) { infra("live-data", "The scan could not read the live data", e.message); }

  // --- deployment drift: live hosting stamp vs functions stamp vs latest commit on the branch ---
  const hostRes = await fetchJsonTimeout(`${PRODUCTION_URL}build.json?_=${Date.now()}`);
  const hosting = hostRes.ok && hostRes.data && hostRes.data.commit ? hostRes.data : null;
  const functionsStamp = readFunctionsStamp();
  const headRes = await fetchJsonTimeout(REPO_HEAD_API, { "User-Agent": "apna-transport-health-check", Accept: "application/vnd.github+json" });
  const head = headRes.ok && headRes.data && headRes.data.sha ? headRes.data.sha : null;
  if (!head) notes.push(`Latest commit not read from GitHub (HTTP ${headRes.status}) -- "is the live app up to date?" was not checked.`);
  // When the live site is behind the branch head, look at WHAT changed: a head whose website code is identical (only docs / tests / server files differ)
  // is a note, not a "not deployed" alarm. The head's criteria come from its own scripts/criteria.lock.json (the pre-push guard keeps it current).
  let headCriteria = null;
  if (head && hosting && hosting.commitFull && !(hosting.commitFull.startsWith(head) || head.startsWith(hosting.commitFull))) {
    try { const r = await fetch(`https://raw.githubusercontent.com/newsuraj02/SarthiTransport/${head}/scripts/criteria.lock.json`); if (r.ok) headCriteria = (JSON.parse(await r.text()) || {}).criteria || null; } catch (e) { notes.push(`Head criteria not read: ${e.message}`); }
  }
  findings.push(...auditDeployment({ hosting, functions: functionsStamp, head, headCriteria }));
  if (hosting) findings.push(...auditKnownIssues(hosting.knownIssues));

  // --- change detection against what the previous scan saw ---
  const baseRef = db.collection("systemHealth").doc("baseline");
  const baseSnap = await baseRef.get();
  const prev = baseSnap.exists ? baseSnap.data() : null;
  const settingsNow = live ? live.settings : null;
  const changes = [];
  if (prev) {
    if (hosting && prev.hostingCommit && prev.hostingCommit !== hosting.commit) changes.push(`Live app build changed: ${prev.hostingCommit} -> ${hosting.commit}${hosting.dirty ? " (built from uncommitted code!)" : ""}`);
    if (functionsStamp && prev.functionsCommit && prev.functionsCommit !== functionsStamp.commit) changes.push(`Cloud Functions deployed: ${prev.functionsCommit} -> ${functionsStamp.commit}`);
    if (hosting && prev.criteria) {
      const d = diffCriteria(prev.criteria, hosting.criteria);
      d.changed.forEach((x) => changes.push(`CHANGED: ${x}`)); d.added.forEach((x) => changes.push(`ADDED: ${x}`)); d.removed.forEach((x) => changes.push(`REMOVED: ${x}`));
    }
    if (settingsNow && prev.settings) changes.push(...diffSettings(prev.settings, settingsNow));
  } else notes.push("First scan: baseline recorded -- from the next scan on, every change is listed.");
  // A deploy can change hundreds of code units at once -- show the first 25 and say how many more (the full set is in the baseline fingerprints).
  const totalChanges = changes.length;
  if (totalChanges > 25) { changes.length = 25; changes.push(`...and ${totalChanges - 25} more change(s) -- compare scripts/criteria.lock.json with the previous one for the full list`); }
  const pick = (o) => { const r = {}; for (const k of ["dieselPricePerLitre", "returnPct", "commissionPct", "bonusPct", "minWallet", "latestVersionCode", "ratesDieselBase"]) if (o && o[k] != null) r[k] = o[k]; return r; };
  await baseRef.set({
    at: FieldValue.serverTimestamp(), hostingCommit: hosting ? hosting.commit : (prev && prev.hostingCommit) || null, functionsCommit: functionsStamp ? functionsStamp.commit : (prev && prev.functionsCommit) || null,
    criteria: hosting ? hosting.criteria : (prev && prev.criteria) || {}, settings: settingsNow ? pick(settingsNow) : (prev && prev.settings) || {},
  });
  await pushChangeFeed(changes, label);

  const sevRank = { critical: 0, high: 1, info: 2 };
  findings.sort((a, b) => sevRank[a.sev] - sevRank[b.sev]);
  const sum = summarize(findings, changes, totalChanges);
  const passed = sum.status === "pass";

  // Always written, pass or fail -- the Live Dashboard tile reads this doc directly (public read, so NO names / phone numbers in it).
  await db.collection("systemHealth").doc("heartbeat").set({
    [`${label}At`]: FieldValue.serverTimestamp(),
    [`${label}Status`]: passed ? "pass" : "fail",
    [`${label}Summary`]: sum.text,
    [`${label}Findings`]: findings.slice(0, 30).map((x) => ({ id: x.id, sev: x.sev, area: x.area, title: x.title.slice(0, 200), detail: x.detail })),
    [`${label}Changes`]: changes.slice(0, 30),
    [`${label}Notes`]: notes.slice(0, 10),
    hostingCommit: hosting ? hosting.commit : null, hostingBuiltAt: hosting ? hosting.builtAt : null, hostingDirty: hosting ? !!hosting.dirty : null,
    functionsCommit: functionsStamp ? functionsStamp.commit : null, repoHead: head ? head.slice(0, 7) : null,
  }, { merge: true });

  // Change Log: one entry per critical/high problem (stable id -> re-opened if it returns, never duplicated).
  const day = new Date().toISOString().slice(0, 10);
  const scanWord = label.replace("last", "").replace("Run", "");
  for (const x of findings.filter((y) => y.sev !== "info")) {
    await db.collection("bugs").doc(`scan-${x.id}`.slice(0, 120)).set({
      title: x.title, description: `${x.detail}`.trim() || x.title, severity: x.sev, status: "open", type: "bug", area: `Morning/evening scan - ${x.area}`, foundAt: day, lastSeenAt: Date.now(),
      ...(x.remedy ? { resolveAction: x.remedy } : {}), resolutionNote: `Checked by the ${scanWord} scan: still detected.`, resolvingAt: FieldValue.delete(),
    }, { merge: true });
  }
  // AUTO-CLOSE (owner 2026-11-05: the same entries came back every day and had to be marked fixed by hand): an open scan entry whose problem this scan no longer
  // finds is closed here, "verified by the scan" -- but only when the check that produces it really ran (live data read, GitHub head read, source read).
  try {
    const currentIds = new Set(findings.filter((y) => y.sev !== "info").map((x) => `scan-${x.id}`.slice(0, 120)));
    const checked = (area) => /Deployment$/.test(area) ? !!(hosting && head) : /Source$/.test(area) ? src.notes.length === 0 : /Infrastructure$/.test(area) ? true : !!live;
    const openSnap = await db.collection("bugs").where("area", ">=", "Morning/evening scan").where("area", "<", "Morning/evening scan\uf8ff").get();
    for (const d of openSnap.docs) {
      const b = d.data() || {};
      if (!d.id.startsWith("scan-") || b.status === "fixed") continue;
      const isChange = d.id.startsWith("scan-changes-");
      if (!isChange && (currentIds.has(d.id) || !checked(String(b.area || "")))) continue;
      await db.collection("bugs").doc(d.id).set({ status: "fixed", fixedAt: FieldValue.serverTimestamp(), resolvingAt: FieldValue.delete(), resolutionNote: isChange ? "Informational -- listed on the Live Dashboard under Recent changes." : `Verified by the ${scanWord} scan: no longer detected.` }, { merge: true });
    }
  } catch (e) { console.error("[health] auto-close failed:", e.message); }
  // Detected changes are INFORMATION, not a problem: ONE entry per day (all scans merged), logged already-settled so it never sits in the open list;
  // the same lines are in the Live Dashboard's Recent changes feed.
  if (changes.length) {
    try {
      const cref = db.collection("bugs").doc(`scan-changes-${day}`);
      const csnap = await cref.get();
      const od = csnap.exists ? csnap.data() || {} : {};
      const lines = [`[${scanWord}] ${totalChanges} change(s):`, ...changes, ...(od.description ? [String(od.description)] : [])].join("\n").slice(0, 1500);
      const count = (Number(od.changeCount) || 0) + totalChanges;
      await cref.set({ title: `${count} change(s) detected in the app today`, description: lines, severity: "low", status: "fixed", fixedAt: FieldValue.serverTimestamp(), resolutionNote: "Informational -- listed on the Live Dashboard under Recent changes.", type: "config", area: "Morning/evening scan - change detection", foundAt: day, lastSeenAt: Date.now(), changeCount: count }, { merge: true });
    } catch (e) { console.error("[health] change entry failed:", e.message); }
  }
  return { status: passed ? "pass" : "fail", summary: sum.text, findings: findings.length, changes: changes.length };
}

// One place that adds lines to the Admin's "Recent changes" feed (systemHealth/changeFeed), newest first, capped at 80.
async function pushChangeFeed(texts, label) {
  if (!texts.length) return;
  const feedRef = db.collection("systemHealth").doc("changeFeed");
  const feedSnap = await feedRef.get();
  const old = feedSnap.exists ? feedSnap.data().entries || [] : [];
  await feedRef.set({ entries: [...texts.map((text) => ({ at: Date.now(), scan: label, text: String(text).slice(0, 300) })), ...old].slice(0, 80) });
}

// INSTANT CHECK (owner 2026-11-03: "inform Admin even the slightest of change"): the moment a trip is accepted, make sure that driver is not
// ALSO on another running trip. If they are, Admin gets a red Change Log entry + a line in the Recent-changes feed within seconds, not at the
// next scan. Read-only on bookings/drivers; a failure here can never block an accept.
exports.auditTripAccepted = onDocumentUpdated("bookings/{bookingId}", async (event) => {
  try {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    if (!(after.status === "Ongoing" && before.status !== "Ongoing")) return; // only the moment a trip is accepted
    const booking = { id: event.params.bookingId, ...after };
    const ongoing = (await db.collection("bookings").where("status", "==", "Ongoing").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
    const others = auditOtherRunningTrips(booking, ongoing, Date.now());
    if (!others.length) return;
    const day = new Date().toISOString().slice(0, 10);
    await db.collection("bugs").doc(`live-double-booked-${booking.id}`.slice(0, 120)).set({
      title: "A driver was just given a second trip while already on one", severity: "critical", status: "open", type: "bug", area: "Instant check - availability",
      description: `Booking ${booking.id} was accepted by a driver who is already on running trip(s): ${others.slice(0, 5).join(", ")}. The "driver is busy" rule did not stop it (an old app version, or a rule fault).`,
      foundAt: day, lastSeenAt: Date.now(),
    }, { merge: true });
    await pushChangeFeed([`ALERT: booking ${booking.id} accepted by a driver already on ${others.length} other running trip(s)`], "instant");
  } catch (e) { console.error("[auditTripAccepted]", e.message); }
});

const SCAN_OPTIONS = { schedule: null, timeZone: "Asia/Kolkata", region: "asia-south1", timeoutSeconds: 300, memory: "512MiB" };
exports.dailyHealthCheckMorning = onSchedule({ ...SCAN_OPTIONS, schedule: "0 9 * * *" }, async () => {
  await runDailyHealthCheck("lastMorningRun");
});

// Hourly pulse (same scan, :30 past each hour): a problem or a change reaches the Admin screen within the hour instead of waiting for 9:00 / 23:00.
// Also the "dead-man" signal: the tile turns amber if no scan of any kind has run for 2.5 hours.
exports.hourlyHealthPulse = onSchedule({ ...SCAN_OPTIONS, schedule: "30 * * * *" }, async () => {
  await runDailyHealthCheck("lastPulseRun");
});
exports.dailyHealthCheckNight = onSchedule({ ...SCAN_OPTIONS, schedule: "0 23 * * *" }, async () => {
  await runDailyHealthCheck("lastNightRun");
});

// Admin's "Run scan now" button (Live Dashboard) -- same scan, on demand, recorded as `lastManualRun*`.
exports.runHealthCheckNow = onCall({ region: "asia-south1", timeoutSeconds: 300, memory: "512MiB" }, async (request) => {
  if (request.auth?.token?.admin !== true) throw new HttpsError("permission-denied", "Admin access required.");
  return { ok: true, ...(await runDailyHealthCheck("lastManualRun")) };
});

// ---------------------------------------------------------------------------
// Address language (owner 2026-10-31, from the developer brief "Address Language
// Fix"): the Pickup / Drop boxes ask THESE three callables for addresses, always
// in the app's selected language, with any English words transliterated into the
// selected script (logic + the TRANSLITERATE_ENABLED kill switch: addressLang.js).
//
// ONE-TIME SETUP before deploying (a missing secret blocks the functions deploy):
//   firebase functions:secrets:set MAPS_KEY      (a SERVER Maps key)
//   Google Cloud Console -> enable "Geocoding API" + "Places API (New)" for that key.
// The app falls back to its old in-browser Google lookup whenever these fail, so
// hosting can be deployed first without breaking anything.
// ---------------------------------------------------------------------------
const { createAddressService, resolveLang, GeoError } = require("./addressLang");
const MAPS_KEY = defineSecret("MAPS_KEY");
const GEO_CACHE_COLLECTION = "geoCache";
const addressService = createAddressService({
  fetchFn: (...args) => fetch(...args),
  mapsKey: () => MAPS_KEY.value(),
  cache: {
    get: async (id) => { const snap = await db.collection(GEO_CACHE_COLLECTION).doc(id).get(); return snap.exists ? snap.data() : null; },
    set: (id, data) => db.collection(GEO_CACHE_COLLECTION).doc(id).set({ ...data, at: FieldValue.serverTimestamp() }),
  },
});
// Signed-in users only (customers and drivers both have a Firebase session): these calls spend Maps quota.
function geoGuard(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Please sign in.");
}
function geoError(e) {
  if (e instanceof HttpsError) return e;
  if (e instanceof GeoError) return new HttpsError(e.code, e.message);
  console.error("[address language]", e);
  return new HttpsError("internal", "Address lookup failed.");
}
const GEO_OPTIONS = { region: "asia-south1", secrets: [MAPS_KEY], maxInstances: 20 };

// Current location / map pin -> address in the user's language.
exports.getAddress = onCall(GEO_OPTIONS, async (request) => {
  geoGuard(request);
  const { lat, lng, lang } = request.data || {};
  if (typeof lat !== "number" || typeof lng !== "number") throw new HttpsError("invalid-argument", "lat and lng (numbers) are required");
  try {
    const L = resolveLang(lang);
    const { address, placeId } = await addressService.getAddress(lat, lng, L);
    return { lang: L, lat, lng, address, placeId };
  } catch (e) { throw geoError(e); }
});

// Search-box suggestions (pickup / drop).
exports.searchPlaces = onCall(GEO_OPTIONS, async (request) => {
  geoGuard(request);
  const { input, lang, sessionToken, lat, lng } = request.data || {};
  if (!input || String(input).trim().length < 2) return { lang: null, results: [] };
  if (String(input).length > 120) throw new HttpsError("invalid-argument", "input too long");
  try {
    const L = resolveLang(lang);
    return { lang: L, results: await addressService.searchPlaces(String(input), L, sessionToken, lat, lng) };
  } catch (e) { throw geoError(e); }
});

// The customer taps a suggestion -> the full place (name, address, lat/lng).
exports.getPlace = onCall(GEO_OPTIONS, async (request) => {
  geoGuard(request);
  const { placeId, lang, sessionToken } = request.data || {};
  if (!placeId || typeof placeId !== "string") throw new HttpsError("invalid-argument", "placeId is required");
  try {
    const L = resolveLang(lang);
    return { lang: L, ...(await addressService.getPlace(placeId, L, sessionToken)) };
  } catch (e) { throw geoError(e); }
});
