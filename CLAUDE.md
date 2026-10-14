# Standing rules for this repo

## GPS Tracking — FROZEN, do not touch

As of commit `d34f4fb` (2026-09-22), the driver GPS tracking feature is
confirmed working end-to-end on a real device, including the hardest case
(background service survives the app being fully swiped away from
Recents, not just minimized). The user has explicitly instructed:
**this workflow stays completely untouched from here on.**

Do not modify, "improve," refactor, or touch any of the following unless
the user explicitly asks for a change to GPS/location tracking
specifically in that same request:

- `android/app/src/main/java/com/apnatransport/app/LocationTrackerService.java`
- `android/app/src/main/java/com/apnatransport/app/LocationTrackerPlugin.java`
- `android/app/src/main/java/com/apnatransport/app/PowerBridgePlugin.java`
- `android/app/src/main/java/com/apnatransport/app/FusedLocationBridgePlugin.java`
- `functions/index.js`: `mintLocationServiceToken`
- `src/App.jsx`: `DriverHome`'s GPS polling effect, the LocationTracker
  start/stop effect, the battery-optimization/autostart/background-location
  priming effects, `BackgroundLocationDisclosure`, `AdminLiveMap`, and the
  customer-side location effect in `CustomerApp`
- `android/app/src/main/AndroidManifest.xml`'s location/foreground-service/
  battery-optimization permissions and the `LocationTrackerService`
  `<service>` entry
- `android/app/build.gradle`'s Firebase Firestore/Auth dependencies added
  for this feature

If a change elsewhere in the app happens to touch one of these files
(e.g. a broader refactor), leave the GPS-tracking-specific code exactly as
it is and work around it, rather than folding it into the same edit.

If the user reports a NEW bug in this area later, that itself is
permission to investigate and fix it — "frozen" means no unsolicited
changes, not that bug reports here should be ignored.

## Load ring / driver notifications — FROZEN, do not touch

As of commit `f8f7f50` (built 2026-10-14, CI run 38556798805 -- the
known-good version to go back to if anything breaks), the owner confirmed on real phones that the
driver's load ring works with the app open, closed and the phone asleep.
It took two days to get here. The owner has said: keep it exactly as it
is for now. Same rule as GPS: no unsolicited changes; a NEW bug report in
this area is permission to investigate.

There are TWO ring paths and both must keep working:
1. FCM push: `functions/index.js` `onDirectRequestBroadcast` →
   `AppFirebaseMessagingService.java` → `RingingBookingActivity.java`.
2. FCM-independent live watch (inside the process the GPS foreground
   service keeps alive): `ApnaApplication.java` → `LoadWatcher.java`.

Do not modify, refactor or "clean up" any of these unless the owner asks
for a change to the ring/notification itself in that same request:

- `android/app/src/main/java/com/apnatransport/app/`:
  `ApnaApplication.java`, `LoadWatcher.java`, `PushTokenSync.java`,
  `NativePushPlugin.java`, `AppFirebaseMessagingService.java`,
  `RingingBookingActivity.java`, `RingingBridgePlugin.java`,
  `MainActivity.java` (plugin registration + `onResume` token sync)
- `AndroidManifest.xml`: `android:name=".ApnaApplication"`, the
  `AppFirebaseMessagingService` / removed Capacitor `MessagingService`
  entries, `RingingBookingActivity`, `SYSTEM_ALERT_WINDOW`
- `functions/index.js`: `onDirectRequestBroadcast`, `ringAck`,
  `onBookingTaken`, `sendTestRing`, `sendDirectRequestRingAlert`
- `src/firebaseClient.js`: `checkPushPermission`, `requestPushToken`
  (routed through NativePush)
- `src/App.jsx`: `DriverHome`'s PermissionGate (incl. the push-token save
  when permission is already granted) and the in-app `playStrongBeep` loop
- the `drivers/{mobile}.fcmToken` field: only the live app
  (`com.apnatransport.app`) writes it; the test native app
  (`apna-transport-native`) writes `fcmTokenNativeApp` instead. Never let
  two apps share `fcmToken` again.

Before ANY release that touches native code, test on the owner's two
phones (Google Pixel 10, Oppo): app open, app swiped away, phone locked —
each must ring and wake the screen.

Known leftovers, to remove only when the owner asks: the temporary
`PushDiagnosticPanel` in Profile screens, `rawPushRegisterProbe`, and
`WebView.setWebContentsDebuggingEnabled(true)` in `MainActivity`.

## Don't trigger a new native build/versionCode unless it's mandatory

The user has explicitly said too many versionCodes were built in a short
span and it became impossible to track which one had which fix. Native
Android code changes (Java/Kotlin, AndroidManifest.xml, build.gradle,
capacitor.config.ts) require a real CI build + reinstall to test at all
— that part is unavoidable. But:

- Don't reflexively trigger `build-capacitor.yml` after every single
  native edit. Where reasonable, batch multiple native fixes together
  and build once, rather than once per fix.
- Before triggering a build, say plainly why it's needed (what native
  change requires it) rather than doing it silently.
- JS-only changes (`src/App.jsx`, `src/firebaseClient.js`, most of
  `functions/index.js`) never need a new native build/versionCode at
  all — `npm run build && firebase deploy --only hosting` (or
  `firebase deploy --only functions`) is enough, since this app runs in
  remote-URL mode. Don't confuse the two or bump a versionCode for a
  JS-only change.
