# Apna Driver (native) — Phase 1 scaffold

A fully-native Android (Kotlin + Jetpack Compose) rewrite of the driver
side of Apna Transport. It exists to make GPS tracking and push
notifications independent of the hybrid Capacitor app's remote-URL-mode
risks (see the main repo's notes on why the hybrid app's background
reliability is hard to fully fix on some OEMs).

It talks to the **exact same Firebase project and Firestore schema** as
the hybrid app — no backend changes. It ships under its own
`applicationId` (`com.apnatransport.driver`), completely separate from
the live `com.apnatransport.app`, so it can be installed side-by-side
on a test device without touching the production app. The hybrid app
stays live for all existing users throughout this migration.

This is a scaffold, not a finished app — see "What's a placeholder"
below before giving this to a real driver.

## One-time setup: register the Firebase app

The committed source has no `google-services.json`, so right now this
builds **without Firebase wired up** (`app/build.gradle` only applies
the `google-services` plugin if that file is present — same pattern as
`android/app/build.gradle` in the hybrid app). To enable Firebase:

1. Open the [Firebase Console](https://console.firebase.google.com/)
   and select the `sarthi-transport-74865` project (the same project
   the hybrid app and `functions/` already use).
2. Project settings → Add app → Android.
3. Package name: `com.apnatransport.driver` (must match exactly —
   this is a *new* Android app entry in the same Firebase project,
   separate from the existing `com.apnatransport.app` entry).
4. Nickname: anything, e.g. "Apna Driver (native)".
5. SHA-1: optional for this scaffold stage (only needed later for
   Phone Auth / Dynamic Links / App Check, none of which are used
   yet — PIN auth here uses email/password sign-in, same as the
   hybrid app).
6. Download the generated `google-services.json` and place it at
   `driver-native/app/google-services.json`.
7. Commit that file (this repo commits `google-services.json` rather
   than gitignoring it — see `android/app/google-services.json` for
   precedent; it contains no secret, only public client identifiers).
8. No Firestore/Auth rule changes are needed — this app signs in as
   the same kind of driver account the hybrid app creates, and reads/
   writes the same `drivers/{mobile}` and `bookings/{id}` documents.

Once that file exists, the next build (local or CI) picks it up
automatically — no workflow or Gradle change needed.

## One-time setup: Maps API key

`HomeScreen`/future map screens will need the Google Maps SDK for
Android. The manifest reads the key from a Gradle manifest placeholder
sourced from a local, **not committed**, `local.properties`:

```properties
# driver-native/local.properties
MAPS_API_KEY=your-android-maps-sdk-key-here
```

Reuse the same Maps API key already used for the hybrid app's Android
build if it's unrestricted-by-package, or create a new Android-
restricted key (package `com.apnatransport.driver`) in Google Cloud
Console → APIs & Services → Credentials.

## Building

Locally (needs Android SDK + JDK 17):

```sh
cd driver-native
./gradlew assembleDebug
```

Or via CI: GitHub Actions → "Build Driver app (native, Phase 1
scaffold)" → Run workflow (manual `workflow_dispatch` only, see
`.github/workflows/build-driver-native.yml`). Downloads as the
`apna-driver-native-debug` artifact; sideload-only for now (no release
signing, not connected to Play Console).

## What's implemented

- PIN login (`AuthRepository`) — identical scheme to the hybrid app's
  `pinAuthEmail`/`pinToPassword`, so it signs in to the same existing
  driver accounts.
- Duty on/off toggle, writing `drivers/{mobile}.online` and starting/
  stopping `LocationTrackerService` (ported near-verbatim from the
  hybrid app's proven native GPS service).
- A live Firestore listener showing open broadcast bookings, with
  Accept/Decline buttons.
- Full-screen ring alert on an incoming direct request
  (`AppFirebaseMessagingService` → `RingingBookingActivity`, both
  ported near-verbatim from the hybrid app's proven implementation),
  including bringing the app to the foreground via `singleTask` +
  `onNewIntent` when Accept/Reject is tapped from the ring screen.

## What's a placeholder (do not ship to real drivers yet)

- `BookingRepository.observeOpenBookings()` shows *every* open
  broadcast booking, not the real eligibility match (vehicle capacity
  window, radius, KYC/blacklist, conflict check — see `src/App.jsx`'s
  `isDriverBroadcastEligible`).
- `BookingRepository.acceptBooking()` is a plain Firestore `update`,
  not the real atomic `claimBooking` transaction — it has the exact
  race condition (two drivers both accepting the same load) that
  transaction exists to prevent.
- `AppFirebaseMessagingService.onNewToken()` doesn't yet write the new
  FCM token back to `drivers/{mobile}.fcmToken`.
- No driver registration/KYC-creation flow — `AuthRepository` only
  signs in to an account that already exists.
- Deliberately out of scope for this first slice: wallet, trip
  history, masked calling, announcements, referral, advance bookings,
  return-load mode, settings/language switch.
