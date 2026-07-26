import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const hasConfig = !!(firebaseConfig.apiKey && firebaseConfig.projectId);

// Falls back to null (not throwing) so the app can still boot and show a
// clear setup message instead of a blank white screen when the pilot
// backend hasn't been configured yet.
//
// autoDetectLongPolling: Firestore's default streaming transport
// (WebChannel) can get stuck behind restrictive corporate/mobile proxies
// that don't like long-lived connections. Auto-detecting and falling back
// to HTTP long-polling makes the realtime sync far more reliable on the
// kind of varied networks 10-15 pilot testers will actually be on.
const defaultApp = hasConfig ? initializeApp(firebaseConfig) : null;
export const db = defaultApp
  ? initializeFirestore(defaultApp, { experimentalAutoDetectLongPolling: true })
  : null;

// Profile/KYC/vehicle photos upload here instead of living inline in
// Firestore documents — keeps every realtime listener (driver lists,
// bookings) small regardless of how many photos testers upload.
export const storage = defaultApp ? getStorage(defaultApp) : null;

// Two separate named Firebase Apps (not the default one above) so a
// customer session and a driver session can each hold their own real,
// phone-verified Firebase Auth sign-in at the same time on one device/
// browser — this app intentionally lets one device act as both a customer
// and a driver with different phone numbers.
export const customerFirebaseAuth = hasConfig ? getAuth(initializeApp(firebaseConfig, "customerAuth")) : null;
export const driverFirebaseAuth = hasConfig ? getAuth(initializeApp(firebaseConfig, "driverAuth")) : null;
// Real email/password sign-in for Admin (replacing the old env-var password
// comparison) — needed so Firestore/Storage security rules can actually
// recognize "this is an authenticated admin" via a custom claim, the same
// way they recognize a customer/driver via their verified phone number.
export const adminFirebaseAuth = hasConfig ? getAuth(initializeApp(firebaseConfig, "adminAuth")) : null;

// Push notifications (ride status updates, new bids) — lazy/guarded because
// getMessaging() throws in browsers/contexts that don't support it (Safari
// without the right setup, private-browsing tabs, non-HTTPS), and because
// requesting the token before a user gesture would trigger the permission
// prompt at a confusing moment. Callers request this only when the user
// taps an explicit "Enable Notifications" button.
let messagingInstance = null;
async function getMessagingIfSupported() {
  if (!hasConfig) return null;
  if (messagingInstance) return messagingInstance;
  try {
    if (!(await isSupported())) return null;
    messagingInstance = getMessaging(defaultApp);
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
