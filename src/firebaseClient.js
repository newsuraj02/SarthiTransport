import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { getFunctions, httpsCallable } from "firebase/functions";
import { Capacitor } from "@capacitor/core";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const hasConfig = !!(firebaseConfig.apiKey && firebaseConfig.projectId);

// True only inside the installed native app (Capacitor's Android WebView
// wrapper — see capacitor.config.ts) — false for every plain browser tab,
// including one opened from inside that same WebView via an external
// link. Evaluated once at module load: Capacitor's platform detection
// itself is synchronous (based on whether window.Capacitor was injected
// by the native runtime before any page JS ran), so this never needs to
// be awaited. Exported so App.jsx's push-notification hook and its
// native-settings-bridge link (see isRunningInOwnTwa there) can branch on
// it without importing @capacitor/core a second time.
export const isNativeApp = Capacitor.isNativePlatform();

// PIN-based signup/login (CustomerOnboarding/DriverOnboarding in App.jsx)
// signs a customer/driver in as a normal Firebase email/password account
// under this synthetic, never-shown "email" built from their mobile number
// — Firebase Auth requires *some* email/password identity, and this avoids
// needing a real one. Namespaced by role so the same phone number can hold
// both a customer and a driver account at once, same as it already could
// under real Firebase Phone Auth (see the three-named-apps note below).
// Mirrored server-side in functions/index.js as pinAuthEmail — keep both in
// sync if this domain/shape ever changes.
export function pinAuthEmail(mobile, role) {
  return `${mobile}@${role === "driver" ? "driver" : "customer"}.apnatransport.local`;
}

// The customer/driver-facing PIN is 4 digits, but Firebase Auth's
// email/password sign-in rejects anything under 6 characters — so a fixed,
// non-numeric prefix is added before ever handing it to Firebase, purely to
// clear that length floor. This is NOT a security measure (the prefix is a
// constant, known to anyone reading this file) — the PIN's own 4 digits are
// still the entire secret. Used everywhere a raw PIN would otherwise be
// passed to createUserWithEmailAndPassword/signInWithEmailAndPassword/
// EmailAuthProvider.credential, and for what's sent as the new password to
// the resetPinAfterPhoneVerify Cloud Function (which just stores whatever
// string it receives, unaware this transform even happened).
export function pinToPassword(pin) {
  return `apna-pin-${pin}`;
}

// Three separate named Firebase Apps (not one shared default app) so a
// customer session, a driver session, and an admin session can each hold
// their own real, phone/email-verified Firebase Auth sign-in at the same
// time on one device/browser.
//
// IMPORTANT: Firestore/Storage security rules only see `request.auth` as
// non-null when the request is issued through the SAME app instance whose
// Auth the user actually signed into — an Auth session on one named app
// does NOT carry over to a Firestore/Storage client built on a different
// (or default) app. So each of these three apps needs its own Firestore +
// Storage client too, not one shared instance built on some separate,
// never-signed-into app (that was a real bug: every read/write silently
// looked unauthenticated to security rules, regardless of who was really
// logged in, once rules started requiring real auth).
const customerApp = hasConfig ? initializeApp(firebaseConfig, "customerAuth") : null;
const driverApp = hasConfig ? initializeApp(firebaseConfig, "driverAuth") : null;
const adminApp = hasConfig ? initializeApp(firebaseConfig, "adminAuth") : null;

export const customerFirebaseAuth = customerApp ? getAuth(customerApp) : null;
export const driverFirebaseAuth = driverApp ? getAuth(driverApp) : null;
export const adminFirebaseAuth = adminApp ? getAuth(adminApp) : null;

// autoDetectLongPolling: Firestore's default streaming transport
// (WebChannel) can get stuck behind restrictive corporate/mobile proxies
// that don't like long-lived connections. Auto-detecting and falling back
// to HTTP long-polling makes the realtime sync far more reliable on the
// kind of varied networks pilot testers will actually be on.
//
// localCache/persistentLocalCache: caches every read in IndexedDB, so a
// dropped or slow connection shows the last-known data (bookings, wallet
// balance, KYC status, etc.) instead of a blank/stuck screen, and queued
// writes sync automatically the moment connectivity returns instead of
// silently failing. No tab manager specified — defaults to single-tab
// persistence, which is the safe choice here since customer/driver/admin
// each have their own separately-persisted Firestore instance already
// (see the three-named-apps note above); no need to coordinate multiple
// browser tabs sharing one cache.
const firestoreOpts = { experimentalAutoDetectLongPolling: true, localCache: persistentLocalCache() };
const dbByRole = {
  customer: customerApp ? initializeFirestore(customerApp, firestoreOpts) : null,
  driver: driverApp ? initializeFirestore(driverApp, firestoreOpts) : null,
  admin: adminApp ? initializeFirestore(adminApp, firestoreOpts) : null,
};
// Profile/KYC/vehicle photos upload here instead of living inline in
// Firestore documents — keeps every realtime listener (driver lists,
// bookings) small regardless of how many photos testers upload.
const storageByRole = {
  customer: customerApp ? getStorage(customerApp) : null,
  driver: driverApp ? getStorage(driverApp) : null,
  admin: adminApp ? getStorage(adminApp) : null,
};

// Which role's Firestore/Storage client every read/write should go through
// right now — kept in sync with the root App's `role` state. Defaults to
// "customer" before any role is chosen; harmless, since the only reads
// that happen pre-login (vehicleTypes, materials, settings) are public
// regardless of which of the three (equally unauthenticated, at that
// point) clients asks.
let activeRole = "customer";
export function setActiveRole(role) {
  activeRole = (role === "driver" || role === "admin") ? role : "customer";
}
export function getDb() {
  return dbByRole[activeRole];
}
export function getActiveStorage() {
  return storageByRole[activeRole];
}

// Same per-role-app reasoning as Firestore/Storage above: the callable
// function reads the caller's phone number off request.auth, which only
// carries over when the call goes through the same app instance the user
// actually signed into.
const functionsByRole = {
  // Must match the region initiateMaskedCall is actually deployed to (see
  // functions/index.js) -- getFunctions() defaults to us-central1 otherwise,
  // and the client would silently call a region with nothing deployed there.
  customer: customerApp ? getFunctions(customerApp, "asia-south1") : null,
  driver: driverApp ? getFunctions(driverApp, "asia-south1") : null,
  admin: adminApp ? getFunctions(adminApp, "asia-south1") : null,
};

// Bridges a call between this booking's customer and driver through
// Exotel (see functions/index.js) so neither side sees the other's real
// number. Always resolves (never throws) with { ok, reason? } — reason
// "not_configured" means Exotel's secrets haven't been set on the backend
// yet, which callers should treat as "fall back to a plain tel: link",
// not as an error to surface to the user.
export async function initiateMaskedCall(bookingId) {
  const functions = functionsByRole[activeRole];
  if (!functions) return { ok: false, reason: "not_configured" };
  try {
    const call = httpsCallable(functions, "initiateMaskedCall");
    const result = await call({ bookingId });
    return result.data;
  } catch (e) {
    console.error("[maskedCall] callable failed", e);
    return { ok: false, reason: "error" };
  }
}

// Logs an in-app announcement (see functions/index.js: sendAdminNotification)
// for one driver/customer (target = their mobile/doc id), a specific list
// of them (target = an array of mobiles, e.g. Admin's KYC desk "Send to
// all incomplete" button), or every driver/customer (target = "all" or
// omitted), depending on audience ("driver", the default, or "customer").
// Purely in-app now — no push is sent. Always resolves (never throws)
// with { ok, reason? }.
export async function sendAdminNotification(target, message, audience = "driver") {
  const functions = functionsByRole[activeRole];
  if (!functions) return { ok: false, reason: "not_configured" };
  try {
    const call = httpsCallable(functions, "sendAdminNotification");
    const result = await call({ target, message, audience });
    return result.data;
  } catch (e) {
    console.error("[adminNotify] callable failed", e);
    return { ok: false, reason: "error" };
  }
}

// Checks a KYC photo actually shows what its tile claims before it's
// uploaded (see functions/index.js: classifyKycPhoto and DriverKyc's
// startPhotoUpload) -- docType is "vehicleSide" (rejects front/diagonal
// shots) or "drivingLicense" (rejects a blank/unrelated photo). imageBase64
// is the already-resized photo (no data: prefix), mimeType e.g.
// "image/jpeg". Always resolves (never throws) with { ok, isMatch?,
// reason? } -- ok:false (not_configured/error) means the check couldn't
// run at all, which callers should treat as "skip it, upload normally"
// rather than blocking KYC over an unrelated outage.
export async function classifyKycPhoto(imageBase64, mimeType, docType) {
  const functions = functionsByRole[activeRole];
  if (!functions) return { ok: false, reason: "not_configured" };
  try {
    const call = httpsCallable(functions, "classifyKycPhoto");
    const result = await call({ imageBase64, mimeType, docType });
    return result.data;
  } catch (e) {
    console.error("[classifyKycPhoto] callable failed", e);
    return { ok: false, reason: "error" };
  }
}

// Pays a referring driver's ₹200 once the driver they referred completes a
// real trip (see functions/index.js: creditDriverReferral). Called by the
// referred driver's own session right after their own completeBooking
// (App.jsx) — the function derives which driver is claiming the referral
// from this session's own auth token, not any argument passed here.
// Always resolves (never throws) with { ok, reason? } — every reason
// (not_configured/not_found/not_eligible/no_completed_trip/error) just
// means "no payout happened this time," nothing for the caller to surface
// to the driver.
export async function creditDriverReferral() {
  const functions = functionsByRole[activeRole];
  if (!functions) return { ok: false, reason: "not_configured" };
  try {
    const call = httpsCallable(functions, "creditDriverReferral");
    const result = await call({});
    return result.data;
  } catch (e) {
    console.error("[creditDriverReferral] callable failed", e);
    return { ok: false, reason: "error" };
  }
}

// Verifies a driver's typed-in pickup OTP guess against the real value
// server-side (see functions/index.js: verifyPickupOtp) without the real
// value ever reaching this client at all — see DriverOtpEntry (App.jsx)
// and otp-readable-by-any-driver in BUG_TRACKER_SEED for why this can no
// longer just compare against a value already sitting in local state.
// Resolves { valid: false } (never throws) on any failure — a network
// blip or a genuine wrong guess look the same to the caller either way.
export async function verifyPickupOtp(bookingId, otp) {
  const functions = functionsByRole[activeRole];
  if (!functions) return { valid: false };
  try {
    const call = httpsCallable(functions, "verifyPickupOtp");
    const result = await call({ bookingId, otp });
    return result.data;
  } catch (e) {
    console.error("[verifyPickupOtp] callable failed", e);
    return { valid: false };
  }
}

// Forgot-PIN recovery, final step (see functions/index.js). Must be called
// while already signed in via a fresh real Firebase Phone Auth session
// (CustomerOnboarding/DriverOnboarding's Forgot PIN flow does the
// signInWithPhoneNumber + OTP confirm first) -- the function trusts that
// session's phone_number claim as proof, no separate code passed here.
// Sets newPin as that mobile+role's PIN account password (creating the
// account if it never had one). Always resolves with { ok, reason? }.
export async function resetPinAfterPhoneVerify(role, newPin) {
  const functions = functionsByRole[activeRole];
  if (!functions) return { ok: false, reason: "not_configured" };
  try {
    const call = httpsCallable(functions, "resetPinAfterPhoneVerify");
    const result = await call({ role, newPin });
    return result.data;
  } catch (e) {
    console.error("[forgotPin] reset callable failed", e);
    return { ok: false, reason: "error" };
  }
}

// Re-added for the driver "new load posted" alert only — see
// functions/index.js's onNewLoadPosted/sendLoadAlert. Every other push
// type stays removed; this is the one carve-out. Push notifications don't
// touch Firestore/Storage security rules, so the messaging instance can
// live on any one app — reuses the customer app rather than creating a
// fourth.
let messagingInstance = null;
async function getMessagingIfSupported() {
  if (!hasConfig) return null;
  if (messagingInstance) return messagingInstance;
  try {
    if (!(await isSupported())) return null;
    messagingInstance = getMessaging(customerApp);
    return messagingInstance;
  } catch (e) {
    console.error("[messaging] unsupported", e);
    return null;
  }
}

// ---- Native (Capacitor Android) push, alongside the web-Push-API flow
// below ----
//
// Inside the installed app, FCM registration goes through the OS/Play
// Services directly via @capacitor/push-notifications rather than the
// browser's Web Push + VAPID + service-worker path (getToken/onMessage
// below) — that's still exactly what a plain browser tab uses, untouched.
// Both ultimately hand back a plain FCM device token that
// functions/index.js's sendLoadAlert/sendDirectRequestAlert already send
// to via admin.messaging().send({ token, ... }) — same Firebase project,
// same send call, either kind of token works, so no backend changes were
// needed for this.
//
// Requires android/app/google-services.json to exist (see that file's
// absence noted in DEPLOYMENT.md) — without it, Capacitor's own
// build.gradle template silently skips applying the google-services
// plugin and native push registration below will fail with reason
// "unsupported"/"error", same as this app already handles an
// unconfigured/unsupported web-push environment.
//
// Dynamically imported (never bundled/evaluated in a plain browser tab,
// isNativeApp false) so a bug or version mismatch in the native-only
// plugin can never break the web build.
let pushNotificationsPluginPromise = null;
function getNativePushNotifications() {
  if (!isNativeApp) return Promise.resolve(null);
  if (!pushNotificationsPluginPromise) {
    pushNotificationsPluginPromise = import("@capacitor/push-notifications")
      .then((m) => m.PushNotifications)
      .catch((e) => {
        console.error("[nativePush] plugin unavailable", e);
        return null;
      });
  }
  return pushNotificationsPluginPromise;
}

// Capacitor's PermissionState ("granted"/"denied"/"prompt"/
// "prompt-with-rationale") collapses onto the same 3-state shape the rest
// of this app already reads off the browser's Notification.permission
// ("granted"/"denied"/"default") — so callers (useRideNotifications /
// NotificationBanner in src/App.jsx) don't need a separate native branch
// just to render the right banner.
function toWebPermissionShape(state) {
  return state === "granted" || state === "denied" ? state : "default";
}

// Native equivalent of the browser's `Notification.permission` read —
// unlike that, this is inherently async (goes through the native bridge),
// so callers that need a synchronous initial value (useRideNotifications'
// useState initializer) should keep reading Notification.permission
// directly on web and only call this for the native branch.
export async function checkPushPermission() {
  if (!isNativeApp) return typeof Notification !== "undefined" ? Notification.permission : "unsupported";
  const PushNotifications = await getNativePushNotifications();
  if (!PushNotifications) return "unsupported";
  try {
    const status = await PushNotifications.checkPermissions();
    return toWebPermissionShape(status.receive);
  } catch (e) {
    console.error("[nativePush] checkPermissions failed", e);
    return "unsupported";
  }
}

async function requestNativePushToken() {
  const PushNotifications = await getNativePushNotifications();
  if (!PushNotifications) return { ok: false, reason: "unsupported" };
  try {
    let state = (await PushNotifications.checkPermissions()).receive;
    if (state === "prompt" || state === "prompt-with-rationale") {
      state = (await PushNotifications.requestPermissions()).receive;
    }
    if (state !== "granted") return { ok: false, reason: toWebPermissionShape(state) };
  } catch (e) {
    console.error("[nativePush] permission check failed", e);
    return { ok: false, reason: "error" };
  }
  // register() itself resolves before the token is known — the actual
  // token (or failure) arrives asynchronously through these two events,
  // same as the plugin's own docs describe, so wrap that in a Promise
  // rather than awaiting register() directly.
  return new Promise((resolve) => {
    let settled = false;
    let regHandle, errHandle;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      regHandle?.then((h) => h.remove());
      errHandle?.then((h) => h.remove());
      resolve(result);
    };
    regHandle = PushNotifications.addListener("registration", (token) => finish({ ok: true, token: token.value }));
    errHandle = PushNotifications.addListener("registrationError", (err) => {
      console.error("[nativePush] registration error", err);
      finish({ ok: false, reason: "error" });
    });
    PushNotifications.register();
  });
}

// Asks the browser for notification permission, registers the service
// worker (see public/service-worker.js — the same one used for app-shell
// caching also handles FCM background messages), and returns a device
// token to save on the driver's own Firestore doc — onNewLoadPosted reads
// that token to push new-load alerts. Inside the native app, does the
// equivalent through @capacitor/push-notifications instead (see above) —
// same return shape either way, so callers never need to know which one
// ran.
export async function requestPushToken() {
  if (isNativeApp) return requestNativePushToken();
  const messaging = await getMessagingIfSupported();
  if (!messaging) return { ok: false, reason: "unsupported" };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: permission };
  try {
    const registration = await navigator.serviceWorker.register("/service-worker.js");
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    return token ? { ok: true, token } : { ok: false, reason: "no-token" };
  } catch (e) {
    console.error("[messaging] token error", e);
    return { ok: false, reason: "error" };
  }
}

// Shows an in-app toast for pushes that arrive while the tab/app is
// already open — foreground messages don't auto-display a system
// notification, so they need to be handled manually either way. Returns
// an unsubscribe function, or null if messaging isn't available.
export async function listenForegroundPush(onMessageReceived) {
  if (isNativeApp) {
    const PushNotifications = await getNativePushNotifications();
    if (!PushNotifications) return null;
    const handle = await PushNotifications.addListener("pushNotificationReceived", (notification) => {
      // Reshaped to match the web SDK's onMessage payload shape
      // (payload.notification.{title,body}) — see ForegroundToast/
      // useRideNotifications in src/App.jsx, which read that shape
      // regardless of which push path produced it.
      onMessageReceived({ notification: { title: notification.title, body: notification.body }, data: notification.data });
    });
    return () => handle.remove();
  }
  const messaging = await getMessagingIfSupported();
  if (!messaging) return null;
  return onMessage(messaging, onMessageReceived);
}
