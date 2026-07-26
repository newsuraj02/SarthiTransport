// Handles push notifications while the app isn't the active tab (backgrounded
// or closed). Service workers can't read Vite's import.meta.env, so the
// config is inlined here directly — these are the public web-app values from
// Firebase Console (safe to embed client-side, same ones already in
// src/firebaseClient.js), not secrets.
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDdNGALZWDhLeqqGldHQY2iPpvKDmREpOI",
  authDomain: "sarthi-transport-74865.firebaseapp.com",
  projectId: "sarthi-transport-74865",
  storageBucket: "sarthi-transport-74865.firebasestorage.app",
  messagingSenderId: "673069213756",
  appId: "1:673069213756:web:41faafa93b344029d5bb39",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || "Apna Transport", {
    body: body || "",
    icon: "/favicon.svg",
  });
});
