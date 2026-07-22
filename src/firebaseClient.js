import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

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
