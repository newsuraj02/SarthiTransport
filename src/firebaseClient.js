import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { getFunctions, httpsCallable } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const hasConfig = !!(firebaseConfig.apiKey && firebaseConfig.projectId);

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
const firestoreOpts = { experimentalAutoDetectLongPolling: true };
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

// Push notifications don't touch Firestore/Storage security rules, so the
// messaging instance can live on any one app — reuses the customer app
// rather than creating a fourth.
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

// Asks the browser for notification permission, registers the FCM service
// worker, and returns a device token to save on the customer/driver's own
// Firestore doc — a Cloud Function reads that token to push real
// notifications for ride events (see functions/index.js).
export async function requestPushToken() {
  const messaging = await getMessagingIfSupported();
  if (!messaging) return { ok: false, reason: "unsupported" };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: permission };
  try {
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
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

// Shows an in-app toast for pushes that arrive while the tab is already
// open — browsers only auto-display a system notification for background
// tabs, so foreground messages need to be handled manually. Returns an
// unsubscribe function, or null if messaging isn't available.
export async function listenForegroundPush(onMessageReceived) {
  const messaging = await getMessagingIfSupported();
  if (!messaging) return null;
  return onMessage(messaging, onMessageReceived);
}
