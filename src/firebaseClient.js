import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

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
export const db = firebaseConfig.apiKey && firebaseConfig.projectId
  ? getFirestore(initializeApp(firebaseConfig))
  : null;
