// Handles the driver "new load posted" push while the app isn't the active
// tab (backgrounded or closed) — re-added as the one carve-out from the
// broader push-notification removal, see functions/index.js's
// onNewLoadPosted/sendLoadAlert. Service workers can't read Vite's
// import.meta.env, so the config is inlined here directly — these are the
// public web-app values from Firebase Console (safe to embed client-side,
// same ones already in src/firebaseClient.js), not secrets.
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
  const isLoadAlert = payload.data?.type === "new_load";
  // New-load alerts need to actually get a driver's attention with the app
  // closed/backgrounded — vibrate pattern + requireInteraction (stays on
  // screen until dismissed) instead of the quiet default a normal update
  // would get.
  self.registration.showNotification(title || "Apna Transport", {
    body: body || "",
    icon: "/favicon.svg",
    tag: isLoadAlert ? "new-load" : undefined,
    renotify: isLoadAlert,
    requireInteraction: isLoadAlert,
    vibrate: isLoadAlert ? [400, 200, 400, 200, 400] : undefined,
    data: payload.data || {},
  });
});

// Tapping the notification focuses an already-open tab if there is one,
// otherwise opens a fresh one straight into the driver app.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.type === "new_load" ? "/?open=driver" : "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});

// Basic runtime caching so the app shell loads instantly on repeat visits
// and still opens (from cache) on a flaky or offline connection. Deliberately
// simple: only same-origin GET requests (the built JS/CSS/HTML/icons) are
// ever cached — Firestore, Storage, and Google Maps calls always go straight
// to the network, since that data has to be live.
const CACHE_NAME = "apna-transport-v3";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetches + caches one request, used both for the first attempt and the
// one retry below.
function fetchAndCache(request) {
  return fetch(request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    return response;
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetchAndCache(request)
      // A single dropped packet on flaky mobile data is common and often
      // succeeds a moment later -- worth one retry before giving up,
      // rather than immediately falling back to (often nonexistent) cache.
      .catch(() => fetchAndCache(request))
      .catch(async () => {
        // Genuinely offline (or the retry failed too). Only fall back to
        // cache if something is ACTUALLY cached for this exact request --
        // resolving to `undefined` here (the old behavior) is invalid for
        // respondWith() and silently breaks whatever requested this. That
        // was a real bug: a brand-new content-hashed JS/CSS file right
        // after a fresh deploy was never cached under the old name, so one
        // network blip on it (e.g. during the language-picker's full-page
        // reload right after signup) meant no network AND no cache --
        // exactly how a reload turned into a permanent blank white screen
        // instead of a normal, retryable load failure.
        const cached = await caches.match(request);
        if (cached) return cached;
        throw new Error(`[sw] unavailable offline and not cached: ${request.url}`);
      })
  );
});
