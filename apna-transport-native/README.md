# Apna Transport (native) — Phase 1 scaffold

A fully-native Android (Kotlin + Jetpack Compose) rewrite covering the
**Customer and Driver** roles of Apna Transport in one app. Admin stays
on the hybrid app indefinitely — it's not part of this migration. This
exists to make GPS tracking and push notifications independent of the
hybrid Capacitor app's remote-URL-mode risks (see the main repo's notes
on why the hybrid app's background reliability is hard to fully fix on
some OEMs).

It talks to the **exact same Firebase project and Firestore schema** as
the hybrid app — no backend changes. It ships under its own
`applicationId` (`com.apnatransport.mobile`), completely separate from
the live `com.apnatransport.app`, so it can be installed side-by-side
on a test device without touching the production app. The hybrid app
stays live for all existing users throughout this migration.

This is a scaffold, not a finished app — see "What's a placeholder"
below before giving this to a real driver or customer.

## Checking crashes (Crashlytics)

The session developing this has no Android device/emulator/adb access,
so a crash on a real sideloaded device can't be diagnosed from a
symptom description alone. Firebase Crashlytics is wired in
(`app/build.gradle`) so it doesn't have to be: after a crash, open the
[Firebase Console](https://console.firebase.google.com/) →
**sarthi-transport-74865** → **Crashlytics** (left sidebar) → the
`com.apnatransport.mobile` app. The real stack trace shows up there
within a few minutes of the crash (the device needs network access
after the crash for it to upload) — screenshot or copy it over instead
of describing the symptom.

## One-time setup: register the Firebase app

The committed source has no `google-services.json`, so right now this
builds **without Firebase wired up** (`app/build.gradle` only applies
the `google-services` plugin if that file is present — same pattern as
`android/app/build.gradle` in the hybrid app). To enable Firebase:

1. Open the [Firebase Console](https://console.firebase.google.com/)
   and select the `sarthi-transport-74865` project (the same project
   the hybrid app and `functions/` already use).
2. Project settings → Add app → Android.
3. Package name: `com.apnatransport.mobile` (must match exactly —
   this is a *new* Android app entry in the same Firebase project,
   separate from the existing `com.apnatransport.app` entry).
4. Nickname: anything, e.g. "Apna Transport (native)".
5. SHA-1: optional for this scaffold stage (only needed later for
   Phone Auth / Dynamic Links / App Check, none of which are used
   yet — PIN auth here uses email/password sign-in, same as the
   hybrid app).
6. Download the generated `google-services.json` and place it at
   `apna-transport-native/app/google-services.json`.
7. Commit that file (this repo commits `google-services.json` rather
   than gitignoring it — see `android/app/google-services.json` for
   precedent; it contains no secret, only public client identifiers).
8. No Firestore/Auth rule changes are needed — this app signs in as
   the same kind of driver/customer accounts the hybrid app creates,
   and reads/writes the same `drivers/{mobile}`, `customers/{mobile}`
   and `bookings/{id}` documents.

Once that file exists, the next build (local or CI) picks it up
automatically — no workflow or Gradle change needed.

## One-time setup: Maps API key

`HomeScreen`/future map screens will need the Google Maps SDK for
Android. The manifest reads the key from a Gradle manifest placeholder
sourced from a local, **not committed**, `local.properties`:

```properties
# apna-transport-native/local.properties
MAPS_API_KEY=your-android-maps-sdk-key-here
```

Reuse the same Maps API key already used for the hybrid app's Android
build if it's unrestricted-by-package, or create a new Android-
restricted key (package `com.apnatransport.mobile`) in Google Cloud
Console → APIs & Services → Credentials.

## Building

Locally (needs Android SDK + JDK 17):

```sh
cd apna-transport-native
./gradlew assembleDebug
```

Or via CI: GitHub Actions → "Build Apna Transport (native, Phase 1
scaffold)" → Run workflow (manual `workflow_dispatch` only, see
`.github/workflows/build-apna-native.yml`). Downloads as the
`apna-transport-native-debug` artifact; sideload-only for now (no
release signing, not connected to Play Console).

## What's implemented

- A role-select screen (Driver / Customer, no Admin option — Admin
  stays hybrid-only) and PIN login (`AuthRepository`) shared by both
  roles — identical scheme to the hybrid app's `pinAuthEmail`/
  `pinToPassword`, so it signs in to the same existing accounts.
- **Driver side**: duty on/off toggle, writing `drivers/{mobile}.online`
  and starting/stopping `LocationTrackerService` (ported near-verbatim
  from the hybrid app's proven native GPS service); a live Firestore
  listener showing open broadcast bookings with Accept/Decline buttons;
  full-screen ring alert on an incoming direct request
  (`AppFirebaseMessagingService` → `RingingBookingActivity`, both ported
  near-verbatim from the hybrid app's proven implementation), including
  bringing the app to the foreground via `singleTask` + `onNewIntent`
  when Accept/Reject is tapped from the ring screen.
- **Background reliability** (`reliability/ReliabilityUtils.kt`, ported
  from the hybrid app's `PowerBridgePlugin`/`FusedLocationBridgePlugin`/
  `RingingBridgePlugin`/`LocationBridgePlugin` — plain native functions
  now, no Capacitor plugin wrapper needed): location permission is
  requested before duty can go online at all (required for
  `LocationTrackerService`'s `foregroundServiceType="location"` to
  legally start on API 29+/34+), followed by a non-blocking check that
  the device's Location Services/GPS is actually switched on (the
  native "Turn on Location?" system dialog, distinct from app
  permission — granted permission does nothing if GPS itself is off at
  the OS level). Once online, persistent re-verify nudge cards cover
  battery-optimization exemption, background location ("Allow all the
  time"), OEM autostart settings (Xiaomi/OPPO/Vivo/Huawei/Honor), and
  the Android 14+ full-screen-intent permission the ring alert needs —
  each re-checked every time duty goes online, not just once, since any
  of them can be silently revoked later.
- **Notification channel** (`ApnaApp.onCreate()`, ported from the
  hybrid app's `MainActivity.java`): creates the `new_load_alerts`
  Android notification channel on every process start. Needed because
  the server sends some pushes (the driver's plain new-load alert, and
  customer-side driver-accepted/trip-completed alerts) with a
  `notification` payload the OS displays automatically — but Android
  8+ silently drops any such push targeting a channel that was never
  created on-device, even though the send itself succeeds server-side.
- **Customer side**: a form to post a load (pickup/drop/weight) and a
  live Firestore listener showing that customer's own open/ongoing
  bookings, updating in real time once a driver accepts.
- **FCM token registration** (`AuthRepository.signIn()` +
  `AppFirebaseMessagingService.onNewToken()`): writes the device's push
  token to `drivers/{mobile}.fcmToken`/`customers/{mobile}.fcmToken`
  right after sign-in, and again on any future token refresh. Without
  this the server has no valid token to send this install's pushes to
  at all — confirmed as a real gap (duty toggle worked, but nothing
  ever rang) before being fixed.

## What's a placeholder (do not ship to real drivers/customers yet)

- `BookingRepository.observeOpenBookings()` shows *every* open
  broadcast booking, not the real eligibility match (vehicle capacity
  window, radius, KYC/blacklist, conflict check — see `src/App.jsx`'s
  `isDriverBroadcastEligible`).
- `BookingRepository.acceptBooking()` is a plain Firestore `update`,
  not the real atomic `claimBooking` transaction — it has the exact
  race condition (two drivers both accepting the same load) that
  transaction exists to prevent.
- `CustomerBookingRepository.createBooking()` uses a flat placeholder
  fare, not the real fare-tier resolution (see `src/App.jsx`'s
  `resolveFareForTier`), and skips the eligibility pre-check (so it'll
  happily post a load with no eligible driver nearby).
- No driver/customer registration or KYC-creation flow —
  `AuthRepository` only signs in to an account that already exists.
- Deliberately out of scope for this first slice: wallet, trip
  history, masked calling, announcements, referral, advance bookings,
  return-load mode, settings/language switch, and any Admin
  functionality (Admin is not part of this native rewrite at all).
- Forced in-app updates (the hybrid app's `AppUpdateBridgePlugin`, Play
  Core's `startUpdateFlowForResult`) aren't ported — meaningless before
  this app is actually distributed via Play Console, since it only
  ever finds an update for an install Play Store itself is tracking.
