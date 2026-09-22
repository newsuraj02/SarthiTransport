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
