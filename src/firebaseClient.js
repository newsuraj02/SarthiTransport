import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Falls back to null (not throwing) so the app can still boot and show a
// clear setup message instead of a blank white screen when the pilot
// backend hasn't been configured yet.
//
// autoDetectLongPolling: Firestore's default streaming transport
// (WebChannel) can get stuck behind restrictive corporate/mobile proxies
// that don't like long-lived connections. Auto-detecting and falling back
// to HTTP long-polling makes the realtime sync far more reliable on the
// kind of varied networks 10-15 pilot testers will actually be on.
export const db = firebaseConfig.apiKey && firebaseConfig.projectId
  ? initializeFirestore(initializeApp(firebaseConfig), { experimentalAutoDetectLongPolling: true })
  : null;
