import type { CapacitorConfig } from "@capacitor/cli";

// IMPORTANT — remote-URL mode, not a bundled web app.
//
// `server.url` points the WebView straight at the live Firebase-hosted
// site, the same way twa/ points Bubblewrap's TWA at it (see
// twa/generate-project.js's MANIFEST_URL). `webDir` below still has to
// name a real directory (Capacitor's CLI/gradle plugin insist a build
// output exists to copy assets from during `cap sync`), but nothing in
// it is ever shown to a user — `server.url` always wins over any bundled
// index.html at runtime. Do NOT remove `server.url` / point this at a
// bundled copy of dist/: the entire point of this app is that
// `firebase deploy --only hosting` goes live instantly for every
// customer/driver with no Play Store review, and bundling the web app
// into the APK would defeat that for every change except genuinely
// native-only ones (new plugin, manifest permission, etc.).
const config: CapacitorConfig = {
  appId: "com.apnatransport.app",
  appName: "Apna Transport",
  webDir: "dist",
  server: {
    url: "https://sarthi-transport-74865.web.app",
    // The site is served over HTTPS already; cleartext traffic is never
    // needed and stays disabled (Capacitor's default).
    cleartext: false,
  },
  // Android-only project (no iOS target has been added — `cap add ios`
  // was never run and nothing here assumes it exists). Same intent as
  // twa/generate-project.js raising Bubblewrap's minSdkVersion to 23 —
  // see android/variables.gradle (minSdkVersion) for where the matching
  // floor is actually enforced on this side; nothing here needs to repeat
  // that number, just noting the two should stay in step if either changes.
  plugins: {
    // Confirmed against @capacitor/push-notifications' own Android source
    // (PushNotificationsPlugin.java) -- it only actually calls
    // notificationManager.notify(...) to show a REAL system-tray
    // notification for a backgrounded/killed app if this array contains
    // "alert" ("banner"/"list" map to the same Android behavior; "badge"
    // is iOS-only). Left unset (the default), which is exactly why
    // sendDirectRequestAlert/sendLoadAlert (functions/index.js) were being
    // sent and received successfully, but nothing ever appeared on the
    // device outside the foreground in-app toast (ForegroundToast in
    // App.jsx, a completely separate JS-only code path that doesn't touch
    // the system notification tray at all). This is a config read from
    // this file at BUILD time (bundled into the APK's own
    // capacitor.config.json, unrelated to server.url's remote-URL JS) --
    // changing it needs a new native build + reinstall, not a hosting
    // deploy.
    PushNotifications: {
      presentationOptions: ["sound", "alert"],
    },
  },
};

export default config;
