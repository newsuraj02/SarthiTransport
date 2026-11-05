# Standing rules for this repo

## SYSTEM MEMORY — read this first, every session (owner 2026-11-03)

The owner is, rightly, furious at having to re-explain things and at fixes silently going missing ("the app gets back to its older self").
The memory is IN THE REPO, and it is enforced by machines, not by good intentions:

1. **`docs/SYSTEM_CONTRACTS.md`** — every rule/condition/function that decides something, in plain words, where it lives and what pins it.
   Read the relevant section BEFORE changing anything; update it in the same commit as the change.
2. **`scripts/criteria.lock.json`** — SHA-256 fingerprints of ~110 rule blocks, every Cloud Function, and the rules/config/manifest files.
   `npm run verify:invariants` FAILS if any of them changed without `npm run criteria:accept -- "why"`, which logs the change in
   **`docs/CRITERIA_CHANGELOG.md`**. A rule can never change silently again.
3. **Morning (09:00) + night (23:00 IST) scan + Admin's "Run scan now"** (`functions/healthAudit.js`, `runDailyHealthCheck` in `functions/index.js`):
   audits LIVE data (busy drivers, double bookings, stuck trips, missing OTPs, settings, money queues, ring helper), checks DEPLOYMENT DRIFT
   (live hosting build vs Cloud Functions vs latest commit; built from uncommitted code), and lists EVERY change since the previous scan
   (rule/function/file fingerprints from the live `/build.json`, settings, builds). Shown on the Live Dashboard scan tile + Change Log. Needs
   `firebase deploy --only functions` AND hosting (the build stamp `dist/build.json` is written by `vite.config.js`; `functions/build.json` by
   `scripts/writeFunctionsStamp.mjs` before every functions deploy).
   Also (owner 2026-11-03, "dont limit yourself"): an HOURLY pulse (`hourlyHealthPulse`, :30) runs the same scan, so a problem or change shows within the hour and
   the tile turns amber after 2.5 h of silence; `auditTripAccepted` raises a critical Change Log entry + feed line within seconds when a driver is accepted onto a
   second running trip; the Admin tile warns when THIS device runs an older build than the live `/build.json` (`__BUNDLE_COMMIT__`). Known open issues the owner was
   told about live in `scripts/knownIssues.json` and are listed on every scan. NOT built (needs the owner): phone push / WhatsApp to Admin (a WhatsApp template must
   be approved in MSG91; the Admin app has no FCM, a native push needs a build).
4. **Bug rule:** when a bug is found, first add a check that FAILS on the old code, then fix it (done for the busy-driver bug: the check fails on
   the old code, passes on the new).
5. **Mirrored code** (app ↔ `functions/`): the checks compare the copies on hundreds of random situations; never edit one copy alone.


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
- `src/App.jsx`: `LoadBellButton` — the permission checklist UI (`BELL_STEPS`,
  `stepInfo`, the per-item "Open Settings" + autostart's self-reported
  "✓ Done" button). As of commit `600cf28` (2026-10-15) this is the
  owner's intended, locked-in version: one card per missing permission
  with device-specific instructions, non-dismissible, re-verified every
  resume. `PowerBridgePlugin.java`'s `needsAutoStartSettings` (its
  `oemLabel` field, used by this UI) is already covered under the GPS
  freeze above, since that's the same file.
- the `drivers/{mobile}.fcmToken` field: only the live app
  (`com.apnatransport.app`) writes it; the test native app
  (`apna-transport-native`) writes `fcmTokenNativeApp` instead. Never let
  two apps share `fcmToken` again.

Before ANY release that touches native code, test on the owner's two
phones (Google Pixel 10, Oppo): app open, app swiped away, phone locked —
each must ring and wake the screen.

Owner-requested change 2026-10-31 (ring screen content, NO native build -- owner: "make it work without new version"): the installed
`RingingBookingActivity` shows only pickup / drop / weight (+ " किग्रा"), so `sendDirectRequestRingAlert` writes the customer name, fare
and est. km INTO the weight text (`ringWeightText` in `functions/ringText.js`): "ग्राहक / भाड़ा / अनुमानित दूरी" lines, then
"वज़न: <kg>" last. Lines with no value are skipped; with nothing extra the text is exactly the old one. The native files were NOT
touched. Limit: the second ring path (`LoadWatcher`, native, builds the text from the booking itself) still shows the old three
fields; a proper separate layout needs a native build, which the owner declined.

Owner-requested 2026-10-31 (still NO native build) -- ring ORDER: `LoadWatcher` rings the instant it sees `alertedDriverMobiles` on a
booking, and it only knows pickup/drop/weight, so it always beat the push and the customer/fare/km lines never showed. Now
`onDirectRequestBroadcast` writes `ringTargets` (same list) FIRST, sends the push, waits `WATCHER_BACKUP_DELAY_MS` (3 s), THEN writes
`alertedDriverMobiles` (in a `finally`, so the backup ring is never lost). `onBookingTaken` and the escalation job read BOTH lists.
Trade-off the owner accepted: when the push does not arrive (the case LoadWatcher exists for), the backup ring is ~3 s later than before.
The escalation waves (`escalateUnmatchedBookings`) were NOT changed. Pinned by a text-order check; the real function was also run
against fake Firebase pieces to confirm the order (ringTargets -> push with details -> alertedDriverMobiles).

Owner-requested 2026-10-31, PREPARED but NOT built: a bell (🔔) in front of the ring screen's header "नई डायरेक्ट बुकिंग रिक्वेस्ट!"
(`activity_ringing_booking.xml`, native). No build was triggered for it -- it ships with the NEXT native build, whenever one is needed
anyway (owner: "prepare it without new build"). Until then the installed app shows the header without the bell.

Owner-requested 2026-11-01 -- ADVANCE date on the ring: a booking with `scheduledFor` ("YYYY-MM-DD HH:MM") puts "📅 एडवांस ट्रिप: 5 Nov 2026, 7:00 AM" as the VERY FIRST line of the ring text (`ringWeightText` / `formatScheduledFor` in `functions/ringText.js`; Current bookings have none; the
"test ring" sample shows one for tomorrow). Needs `firebase deploy --only functions`. Order of lines: date, round trip, customer, fare, km, weight.

Owner-requested 2026-11-01 -- ONE Accept: the Accept/Reject tapped on the native ring screen is read once by `RingingBridge` (it removes the
extras as it hands them over). On a cold start / slow resume the booking was often not in `bookings` yet, `driverRespondBooking` silently did
nothing and the tap was lost, so the load had to be accepted a second time in the app. Now the tap is PARKED (`pendingRingActionRef`) and
settled by `settlePendingRingAction` as soon as the booking is in the list (accept/reject once; dropped if the load was taken or after the
2-minute ring window). JS only (no native change). Pinned by a behaviour check in `verifyInvariants.mjs`.

Owner-requested 2026-11-03 -- ONE ACCEPT ("there are 2 accept buttons to be clicked ... keep it to Accept on the ring notification if the app is killed / in background; if in app then that screen's accept button works along with the sound only, no need to fall back to wake and full screen"). NO native build: `DriverApp` (JS) stamps `drivers/{mobile}.appForegroundAt` (server timestamp) every 15 s ONLY while its Home screen (`tab === "home" && rideView === "current"`) is open on screen, and clears it (null) the moment the app is hidden (`visibilitychange`, `pagehide`, Capacitor `appStateChange`), closed or leaves Home. `functions/index.js` `isAppOpenNow` (30 s window): `onDirectRequestBroadcast` AND the escalation waves send NO ring push and write NO `ringTargets` / `alertedDriverMobiles` entry for a driver whose stamp is under 30 s old (so neither the full-screen ring nor the LoadWatcher backup fires); the in-app load card + `playStrongBeep` loop (untouched) are the only alert. FAIL-SAFE: no stamp, a cleared / old / future-dated stamp = the ring works exactly as before. Gap to know about: if the app is swiped away while open, the stamp can stay fresh for up to 30 s, and a load arriving in that gap does not ring (the 2-minute escalation wave does reach them). A cleaner, instant version (decide inside `AppFirebaseMessagingService` / `LoadWatcher` from the process's foreground state) needs a native build -- do it with the NEXT native build and then retire the heartbeat. Pinned by the real `onDirectRequestBroadcast` + escalation run against fake Firebase (open-app and busy drivers get nothing; background / stale / never / future-dated drivers ring) and by an invariant.

Owner-requested 2026-11-04 -- WHO GETS THE BELL (explicit change to the frozen ring, answers "duty on only, no GPS"): a driver is rung when DUTY IS ON (`online`), KYC Approved, not blocked, not on a trip (`hasLoadConflict`), has not declined, and the app is not open on Home (one Accept, unchanged), AND the vehicle CATEGORY is the one the customer tapped or one of the next 2 above it (`RING_CATEGORIES_ABOVE`; owner 2026-11-04: the categories are now the customer list's 14 capacity categories (3500 and 25000 kg were ADDED later the same day; 16000 was already there) + "above 32000 kg" -- `RING_CATEGORY_MAX_KG` in `functions/tripLock.js`, mirror `CUSTOMER_LIST_CATEGORY_KG` in the app -- NOT the 24 fare tiers any more; the booking carries `listCategoryKg` = the picked category's weight limit (999999 = above 32000 kg), which stays right whenever categories are added; a booking from the previous app carries only `listCategory` = an index into the PREVIOUS 12-limit table (`LEGACY_RING_CATEGORY_MAX_KG` / `LEGACY_CUSTOMER_LIST_CATEGORY_KG`) and is translated through it so a booking in flight during a deploy still rings the right category; anything older falls back to its `tierMaxKg` / weight; the customer taps a category, never one driver, and EVERY vehicle in it is rung, the fastest to accept wins). AND (owner 2026-11-04, "apply the same radius to the bell") the driver is WITHIN 30 km (Current) / 50 km (Advance, the booking has `scheduledFor`) of the pickup by the LAST KNOWN location however old (`RING_RADIUS_KM` in `functions/tripLock.js`, mirrored by `CURRENT_BID_RADIUS_KM` / `ADVANCE_BID_RADIUS_KM` in the app) -- the SAME radius as the customer's vehicle list. No GPS-on / weight condition: duty on + GPS off (but last seen inside the radius) is rung, duty on + GPS on is rung, duty off is never rung; a driver who NEVER reported a location is not rung; a booking with no pickup coordinates skips the radius. The rule lives in ONE place, `functions/tripLock.js` `evaluateNewLoadDriver`, used by BOTH `onDirectRequestBroadcast` (first ring) and `escalateOneBooking` (later rounds -- the radius tiers are gone, `ESCALATION_ROUNDS = 3` rounds each ring whoever became eligible since and was not alerted); `isDriverBroadcastEligible` in the app is the mirror (the driver's own load list + the "does anyone qualify" check). The old `DIRECT_REQUEST_RADIUS_KM` / `BROADCAST_WEIGHT_HEADROOM_KG` / `BROADCAST_LOCATION_STALE_MS` / `ESCALATION_LOCATION_STALE_MS` constants and `padVehicleCategories` were removed. FCM sending, the ring ORDER (ringTargets -> push -> alertedDriverMobiles), the re-ring loop, the native files and the one-Accept heartbeat were NOT touched. NO native build. Needs `firebase deploy --only functions` AND hosting. Consequence: a duty-on driver outside the radius, or one who never reported a location, is no longer rung (the 3 rounds re-check, so one who drives into the radius is rung in a later round). Duty is never switched off by the app (only the driver's button / Admin block; it switches ON after a trip ends). Pinned by "WHO GETS THE BELL" (app == server on 2,000 random cases; category table == fare table) and by running the REAL `onDirectRequestBroadcast` + `escalateUnmatchedBookings` against fake Firebase (duty-on GPS-stale-but-near rings and a driver ~33 km away rings only for an Advance booking; duty-on never-located / 1,400 km away, duty-off, KYC pending, blocked, on-trip, app-open, category -1 / +3 and a 500 kg auto do not; a later round rings the newly eligible and nobody twice).

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

## Verified-working behavior — KEEP INTACT (owner standing rule, 2026-10-26)

Everything in this section was built, deployed and confirmed working by the
owner. It must stay exactly as it is. This is the memory of "what works" —
treat a regression here as MY bug, found and fixed by me, not by the owner.

**Before every push:**
1. `npm run verify:invariants` (every line must PASS) and `npm run build`.
2. Ask: "could this edit change anything below, even indirectly — a shared
   helper, shared state, the same component?" If yes, re-read the affected
   code and fix the side effect myself.
3. When the owner confirms a new feature works, add it to this list AND a
   matching check in `scripts/verifyInvariants.mjs`, in the same commit.
   When the owner explicitly asks to change a listed behavior, change it on
   purpose and update the list + check together.
4. If I find a real bug (mine or inherited), say so plainly with the
   commit/cause — no excuses, no quiet fixes.

**Booking weight (customer app) -- THE WEIGHT BOX WAS REMOVED FROM THE CUSTOMER SCREEN 2026-11-04 (see the "No weight / est.-distance box" paragraph below); the rules in this paragraph now describe the helper functions only, which stay in the code UNUSED and keep their behaviour checks.** kg input = 3–5 digits; ton input = max 2
integer + 3 decimal digits (so "9000 ton" can never be typed). HARD CAP (owner
rule 2026-10-26, "we have vehicles only up to 35 ton / 35000 kg"): nothing above
`MAX_BOOKING_WEIGHT_KG = 35000` (35 ton) is ever accepted — a keystroke that
would exceed it is refused (field keeps its previous value, red "Maximum weight
is 35 ton / 35000 kg" note shows), pasting an over-cap number leaves the field
empty, and `isWeightValid` rejects over-cap values on every path. This is pinned
by BEHAVIOR checks in `verifyInvariants.mjs` that run the real functions. Both
`CustomerBooking` and `CustomerAdvanceBooking` convert ton→kg (`loadKg`), save
`weightKg` ALWAYS in kilograms, and also block loads above the live fleet's
biggest vehicle (`exceedsFleetMax`, a separate, softer check). Driver/admin
vehicle-capacity fields are a different thing and are NOT capped by this.
`weightUnit` is only the label the customer picked — never print it as the
suffix of `weightKg` (2026-10-26: Alerts showed "9000ton" for a 9-ton load;
validation was fine, the label was wrong, bug since 207b028).

**Customer booking (owner 2026-10-29, flow redone -- built, not yet confirmed on a device). [2026-11-04: the est. km box, the Enter Weight box, the "Enter weight first" note, the fleet-max note and "Weight typed tucks Pickup+Drop away" are GONE -- wherever this paragraph says weight / km box, read the "No weight / est.-distance box" paragraph instead. ALSO GONE (2026-11-04): tapping a vehicle card, the chosen-card view, "Book this vehicle", "Book this category" and "See all vehicles" -- the customer taps a capacity category and presses ONE fixed "Book now" bar (see CATEGORY BOOKING below).]**
`CustomerBooking` reveals itself step by step on ONE page. Screen 1: Pickup box + "Use Current
Location" (no Book button yet); the customer's last 3 whole trips (pickup AND drop, `recentTrips`, built in
`CustomerApp`) are listed right under the Pickup box with NO heading text and ONLY while Pickup is empty (owner
2026-10-29: not inside the dropdown, and not kept on screen after a pickup is typed/chosen); Drop and Weight are not rendered. Drop appears once Pickup is
SELECTED (`pickupSelected` = coordinates known: suggestion / current location / map tap / trip /
typed text that has geocoded; without Google Maps, 3+ typed characters count); Weight appears once
Pickup AND Drop are selected (`showWeight`). Tapping a trip fills both IN THE BACKGROUND and moves the cursor +
golden highlight to Weight (`onTripSelected`, `requestFocus`); the Pickup and Drop boxes (and any pickup/drop text) then
stay HIDDEN (`fromTrip` / `tripHidden`, owner 2026-10-30) -- only the est. km box and Enter Weight show, plus a small
"Change pickup / drop" link that brings the boxes back with the trip's values; picking/typing a place any other way
clears `fromTrip` and behaves as before; (owner 2026-10-31) the SAME tuck-away now also happens when Pickup AND Drop were both
CHOSEN by hand -- a suggestion, "Use Current Location" or a map tap, never merely typed text -- so only the est. km box and Enter
Weight stay (`onPickupPlaceSelected` / `onDropPlaceSelected` set `fromTrip` once both places are explicitly chosen); Advance Booking
behaves identically. The hide/show is SMOOTH (owner 2026-10-31: `SmoothCollapse` eases the Pickup and Drop blocks closed/open instead of
popping; open state has overflow visible and no extra stacking so the dropdowns and the z-40 / z-30 rule still work), and
"Change pickup / drop" (`changePlacesLink`) sits UNDER the "Enter weight first..." note (the date/time hint in Advance, the "Tap a
vehicle" line once vehicles show), centred, small and dull grey -- not at the top any more. A FIXED horizontal box with its checkbox, labelled just "Round trip" (hi/mr "राउंड ट्रिप", icon ↔; owner 2026-11-01 -- it used to say "Book Return trip"; the note, tags and driver/admin wording still say "Return trip"), sits at the BOTTOM of the booking screen (`data-return-bar`, owner 2026-11-01,
Current AND Advance): `fixed`, `z-[25]` (below the Pickup z-40 / Drop z-30 suggestion lists and the menu/sheets at z-50), SMALL and quiet (owner 2026-11-01: "too big and
highlighted" -> slim strip ~30 px, 1 px `C.line` border, no shadow, 12 px semibold grey text, 16 px checkbox). Shown ONLY while the Pickup/Drop
boxes are on screen AND the tick is off: `returnBarVisible = !weightTyped && !tripHidden && !chosen && !returnTrip` -- the moment it is TICKED
the box disappears, and it is gone once both places are entered / a weight is typed / a vehicle is chosen. The tick stays on and shows as
the green "Return fare included (N% off on return)" note (under the "Enter weight first" note, the date/time hint, the "Tap a vehicle"
line, and above Book) which has NO Remove/untick control (owner 2026-11-01: "remove the Remove button") -- once ticked it stays ticked until the form is reset (Book, or the Refresh button). A return-trip booking NEVER pays a halting charge (owner 2026-11-01; `completeBooking` sets it to 0 when `returnTrip`). The word "leg" is not used anywhere for return trips -- say "return".
It must NOT depend on which text box has focus (an earlier version hid itself when the Weight box got the cursor -- do not bring that
back); the page has `pb-16` only while it is shown. RETURN FARE (owner answers 2026-11-01): ticked =
every vehicle's fare is ONE-WAY + RETURN, where the return fare = Admin's saved return rate for the swapped route
(`getAdminRouteOverride(... isReturn=true)`, what the Admin rate calculator's ⇅ swap saves) if there is one, otherwise the one-way fare less
Admin's `returnPct` (settings/main, 15 now; passed App -> CustomerApp -> CustomerBooking). NO waiting charge. A green note "Return fare
included (N% off on return)" shows with the vehicle list and above Book. The booking stores `returnTrip`, `oneWayFare`,
`returnFare`, `returnPct`, and `fare` = the TOTAL; Drivers and admin see a "↩ Return trip"
tag (`ReturnTripTag`: `RouteLine`, `RideTypeBanner`, admin lists) and the driver's ring text has "↔ राउंड ट्रिप (आना-जाना)" as its FIRST
line (`ringWeightText`, needs `firebase deploy --only functions` -- until functions are redeployed the ring screen cannot show it). RETURN TRIP DRIVER FLOW (owner "go" 2026-11-01): there is still exactly ONE End Trip, tapped at the PICKUP once the vehicle is back. After the OTP the
driver's `LoadingTimer` shows only "↩ Reached drop — start return" (stamps `returnStartedAt`, ends nothing, no second OTP); after that it shows
the normal End Trip plus an "on the way back" hint. From `returnStartedAt` on (`isReturning(b)` / `tripStretch(b)`), the driver's and the
customer's map, the address line ("Back to Pickup") and the customer's "Distance to pickup" point back to the pickup, and the customer
sees a green "Return trip: ..." status line (`data-return-status`). Non-return trips are untouched. The frozen GPS polling effect (which
also stamps `reachedDropAt`) was NOT edited. Nothing is pre-selected (owner
2026-10-29): the vehicle list shows no highlighted card, and the "Book this vehicle" button exists ONLY once
the customer has tapped a vehicle (`selectedEntry`); it books that vehicle (`bookEntry`). Order after a tap (owner
2026-10-30): the chosen card, then "Book this vehicle", then "See all vehicles" (hi "सभी गाड़ियाँ देखें", mr "सर्व गाड्या पहा");
there is no sticky bottom bar any more. Tapping Book shows "Sending request..." for a
deliberate 700 ms. Developer-brief rules (owner 2026-10-29, "implement these changes only"): (1) the moment a
weight is typed, Pickup + Drop tuck away (`weightTyped`) behind a one-line summary with "Change" (clears the
weight, brings the boxes back); (2) the map is never collapsed or hidden before Book, and it is NOT pinned: it scrolls up and down with the rest of the page (owner 2026-10-29), and with a valid weight it plots ONLY the vehicles in the list below
(`mapFixedDrivers`, inactive trucks hidden, `activeOnly`); (3) tapping a vehicle (`chosen`) leaves only that
card + "Book this vehicle" + "See all vehicles" (weight row, summary, banner and the old "not seeing the right vehicle"
link vanish); the map then shows only that type with the nearest one ringed and "N min" (`etaMinutes`, km x 1.3
at 25 km/h); Advance Booking now behaves identically (see below); (4) typing in Pickup clears drop + distance +
weight, typing in Drop clears distance + weight (`clearAfterPickup/Drop`; picking from a list or a trip never
clears); (5) places carry Google place ids (`pickupPlaceId`/`dropPlaceId`, saved on the booking with `placeLang`);
past trips are de-duplicated by id and re-read in today's language (`localizePlace`), and a half-filled form
survives the page reload a language change does (`sarthi_lang_reload` stamp + `sarthi_booking_draft`, only
read while the stamp is under 60 s old; nothing else is ever remembered); (6) after Book the form empties and
"Your message has gone to drivers" shows (also the first line of the ride screen). Pinned in `verifyInvariants.mjs`.
The earlier step-flow / Pickup-page / top-right-pill redesign was rolled back (`PickupPage`,
`PickupPill`, `StepSummary`, `RecentPlacesList` remain in the file, unused). Also: the booking map
is a compact 35% of the screen (owner 2026-10-29: 50% pushed the content off screen) and by default frames a 1.5 km radius around the current location
(`NEARBY_MAP_DEFAULT_RADIUS_KM`); it (and the live ride-tracking map) has NO +/- zoom buttons and
keeps the customer's own zoom/pan until the page is refreshed (`nearbyMapUserView`); markers are the
top-down blue-and-yellow truck (`truckMarkerIcon`) and a blue pickup dot. Weight caps, fares and
the vehicle/driver list are unchanged. An evident 3 px navy line + soft shadow separates the map from the form (owner 2026-10-31, `data-map-divider`; a plain wrapper, no position/z-index). Inputs may always
shrink (global `min-width: 0` in `index.css`). Layering rule (owner 2026-10-29: the km box + Enter Weight painted over the Drop suggestions): every `.anim-rise`
block is its own stacking layer, so the Pickup row is `relative z-40` and the Drop wrapper `relative z-30` -- keep
them, or suggestion lists get covered by the rows below. Pinned in `verifyInvariants.mjs`.

**Round trip bar + "list only after Pickup and Drop are entered" (owner 2026-11-04, bug reports; the bar rule was changed twice the same day, the LAST word is here and replaces every older description in this file).** (1) The fixed bottom box is called "Book Round trip" (hi "राउंड ट्रिप बुक करें", mr "राउंड ट्रिप बुक करा"). FINAL RULE (owner: "remove it from every screen except the main screen; it must disappear once you place the cursor on the pickup and afterwards"): it shows ONLY on the MAIN screen -- Current AND Advance Booking (one shared screen; owner: "I want it on the Advance booking screen similarly") with nothing entered -- and is gone for good once the cursor has been placed in Pickup (`pickupTouched`; stays gone after the cursor leaves), once Pickup has any text (recent trip, suggestion, restored draft), and once ticked; it comes back only when the form empties after a booking (`resetBookingForm`) or the page reloads: `returnBarVisible = !returnTrip && !pickupTouched && !pickup.trim()`. (A customer who wants a round trip must tick it BEFORE tapping Pickup; the green "Return fare included" note then shows.) It is `z-[45]` and `LocationField` caps its suggestion list (`ddMaxH`) so a list ends above it. The fixed "Book now" bar (`bookBarVisible`) shows ONLY with the vehicle list (Pickup + Drop (+ date/time in Advance) chosen, at least one vehicle) and never while a Pickup / Drop box has the cursor (`!typingField`). (2) MAJOR BUG: the vehicle list (and the Drop box) appeared before Pickup / Drop were entered, because text still being typed was geocoded after a 900 ms pause and counted as "chosen". Now a box with the cursor in it (`typingField`, set on focus, cleared on blur) and hand-typed text does not count: Drop appears and the list shows only once the cursor has left the box (or a suggestion / current location / map tap / trip chose the place, which counts at once). Pinned by "LIST ONLY AFTER PICKUP AND DROP ARE ENTERED" + the "booking box label" invariant; browser-checked (type Pickup: no Drop box; leave it: Drop box; type Drop: no list; leave it: list).

**MAP HIDDEN OVER THE LIST + DAY BUTTONS GONE ONCE PICKED (owner 2026-11-04: "In the Current booking, the map at the top disappears on the vehicle selection list and reappears from the OTP screen onwards. In the Advance booking it disappears on the vehicle selection list and the date selection; reappears from the OTP screen onwards. Also, the date selection disappears once the date is selected").** This is the owner's DESIRED behaviour, not a bug report: I first read it as a bug and PINNED the map (sticky) -- the exact opposite -- and the owner said so; that build was reverted the same day, nothing sticky remains. THIS REPLACES the 2026-10-29 rule "the map is never collapsed or hidden before Book". `mapHidden = advance ? placesReady : (locationsReady && !sameLocation)`: in Current the map (`data-map-divider`) is NOT rendered from the moment the vehicle list shows; in Advance from the moment Pickup + Drop are chosen (the date step and the list). It is shown again while Pickup / Drop are being typed (so a map tap can still pick a place) and on the OTP / ride screen (`ActiveRide` has its own map, untouched). The three Advance day buttons show only until a day is picked (`advance && placesReady && !scheduleReady`); after that a one-line summary "📅 Tomorrow · Fri, 6 Nov   Change date" (`data-advance-date-summary`, hi "तारीख बदलें", mr "तारीख बदला") sits above the list -- the summary + Change are MY addition so a wrong day can still be fixed (Change empties the date, which brings the buttons back and hides the list until a day is picked again). Pinned by "MAP HIDDEN OVER THE LIST, DAY BUTTONS GONE ONCE PICKED"; browser-checked (360 x 700, Current + Advance).

**SELECTED CATEGORY ON TOP + PLEASANT FLOW (owner 2026-11-04: "in the vehicle list the selected vehicle category gets placed at the top and shows it better using UI/UX ... improve the UI/UX of the entire flow so it looks pleasant ... for the main screen suggestions, Pickup / Drop needs partition and some basic design").** (1) The picked category MOVES TO THE TOP of the list (`orderedListGroups`; the rest keep light -> heavy under a small "Other vehicles" divider, `data-other-vehicles`, hi "अन्य गाड़ियाँ", mr "इतर गाड्या") as a bigger "selected" card: green gradient + glow, a "✓ Selected" badge (`data-category-selected-badge`, hi "चुना गया", mr "निवडले"), `text-xl` name, big navy fare pill (`text-2xl`), the big picture + body size; the page scrolls it into view (`scrollIntoView`). The unpicked rows are unchanged. (2) The RECENT-TRIP suggestion cards on the MAIN screen (`data-recent-trip`) show the two locations partitioned: a route rail (green dot, dashed line, blue square) and a hairline between the addresses -- LOCATIONS ONLY (owner 2026-11-04, second pass: "remove the words Pickup and Drop from the suggestion boxes ... no need to add the side button too ... the location fonts are too bold"): no "Pickup" / "Drop" words, no chevron / side button, and a LIGHT weight (`font-normal`, 12 px); the FULL address is shown, wrapped, NEVER cut with "..." (owner 2026-11-04 third pass: "show full address, do not cut the location texts ... decrease the size of the suggestion boxes so that 3 fit in the frame") -- the cards are compact (`py-1.5`, tight line height, 4 px gap) so three typical addresses (2 lines each) fit above the "Book Round trip" bar at 360 x 700 (measured: 68 + 53 + 53 px); very long 3-line addresses make a card taller and the page scrolls; still no heading text over the list (the 2026-10-29 rule). (3) From the vehicle list onwards there is NO route card (owner: "don't keep it from the next screen onwards, just a small Change Pickup / Drop"): only the small `data-trip-row` -- "Distance: N km" at the left and a small underlined "Change pickup / drop" link at the right, exactly as before. (4) The fixed "Book now" bar is a larger rounded-2xl button with a green gradient. Pinned by "SELECTED CATEGORY ON TOP + PLEASANT FLOW"; browser-checked (360 px, en + hi). NOT done: the Pickup / Drop input boxes themselves (they carry the guided golden ring, the suggestion dropdown layering z-40 / z-30 and the typing logic -- restyling them is a bigger change; ask if wanted), and the OTP / ride screens.

**Current | Advance toggle (owner 2026-10-30).** The customer header has a two-segment toggle -- "Current Booking" and "Advance Booking"
(hi "करंट बुकिंग"/"एडवांस बुकिंग", mr "करंट बुकिंग"/"अ‍ॅडव्हान्स बुकिंग"; 11px text so it fits at 320px) -- both always visible; the one in use is GREEN for Current Booking and BLUE (#0052CC) for Advance Booking (owner 2026-10-30: matches the hamburger menu's "View Current Booking/s" green and "View Advance Booking" blue), the other plain. `advanceOpen`
starts `false`, so the app ALWAYS opens on Current. It replaced the single "Book Advance / Book Current" pill. The toggle is exactly CENTRED in the header (owner 2026-10-30; menu and the Refresh spacer are the same width either side); the "Advance (N)" list button and the go-to-current-ride arrow, when present, sit on their own right-aligned line UNDER it so they can never push it off-centre. Pinned in
`verifyInvariants.mjs`.

**ADVANCE = DATE ONLY: Kal / Parso / Day after Parso (owner 2026-11-04: "add Kal, Parso and Day after Parso and language equivalent instead of Select Date and time ... date only, no need of time"; time = "fixed morning start 8 AM but dont keep the driver occupied for the entire day"). THIS REPLACES the single "Choose date & time" box / `TimeSlotModal` two-step sheet described in the next paragraph (the component stays in the file, UNUSED).** After Pickup + Drop (+ trip) a row of three buttons (`data-advance-days`, `ADVANCE_DAY_OFFSETS` = 1, 2, 3 days ahead) shows, each with its date (e.g. "Fri, 6 Nov"): en "Tomorrow" / "Day after tomorrow" / "In 3 days" (owner: "keep it English equivalent"; hi/mr are the Kal / Parso / day-after-Parso words), hi "कल" / "परसों" / "परसों के बाद", mr "उद्या" / "परवा" / "परवा नंतर" (`advanceDayLabel`). Tapping one sets `advanceDate` and `advanceTime = ADVANCE_DEFAULT_TIME` ("08:00"), so the booking carries `scheduledFor` "YYYY-MM-DD 08:00" -- the format the ring text, the availability window, the notice check and the audit already read. Nothing else changed: driver availability still blocks only the trip's own window (tonnage buffer + `estimatedTripHours`), NEVER the whole day; the per-category minimum-notice check still runs when Book is tapped (its message now says "pick a later date"); the list waits for a day ("Choose the day first, then vehicles will show"). Pinned by "ADVANCE DAY CHOICES" + the Advance-screen invariant; browser-checked (en + hi: 3 buttons, pick Parso -> list + Book now, booking saved "2026-11-07 08:00").

**Advance Booking = the same screen + date and time (owner 2026-10-30: "follow the same UI/UX, pattern, flow of work, exact
same with the addition of date and time"; the date-and-time BOX described here was replaced by the day buttons above on 2026-11-04).** `CustomerAdvanceBooking` is only `<CustomerBooking {...props} advance />`;
there is ONE copy of the booking screen -- change `CustomerBooking`, never re-create a second one. `advance` adds (owner
2026-10-30): ONE single "Choose date & time" box (owner 2026-10-30) -- tapping it opens ONE bottom sheet, `TimeSlotModal`, run as a
TWO-STEP flow: step 1 "Select Date" (a date field that shows a GREY "Select date" prompt like every other box until a date
is picked, plus Next; picking a date moves straight on), step 2 "Time slots" (date recap with "Change date", period buttons,
hourly slots), then "Confirm" returns both; the box then reads e.g. "4 Nov 2026 . Morning 6:00 AM". (A native
datetime-local "Set date and time" picker was tried and REVERTED the same day at the owner's request -- do not bring it
back.) The sheet must stay OUTSIDE the `.anim-rise` block, whose transform would otherwise break its `fixed` positioning.
The est. km box and "Enter Weight" appear TOGETHER with that box (`showWeight` =
`placesReady`, owner 2026-10-30: use the empty space), weight can be typed before the schedule is set, and the vehicle
list stays hidden behind an orange "choose the date & time first" hint until the schedule exists; the box is placed AFTER the Pickup/Drop flow and shown only once Pickup AND Drop are entered (typed, picked or via a trip
suggestion) -- the flow is Pickup -> Drop -> Date/Time -> Weight, the golden ring following that order; Pickup, "Use
Current Location" and the trip suggestions are NOT gated by the schedule; only the vehicle list waits for the date AND time
(`placesReady` = places chosen, `locationsReady` = places + schedule); `ADVANCE_BID_RADIUS_KM` (50 km)
instead of the current radius; drivers checked against THIS slot (`findDriverLoadConflict` with `scheduledFor`); the
per-category `minAdvanceNoticeHours` check when Book is tapped; `scheduledFor` ("YYYY-MM-DD HH:MM") sent with the request;
a "📅 date . time" line above Book once a vehicle is chosen;
and the date/time are cleared with the rest of the form after Book. The language-reload draft only restores into the SAME
mode. Pinned in `verifyInvariants.mjs`.

**Address language (owner 2026-10-31, from the developer brief "Address Language Fix" -- built, NOT yet deployed/confirmed).**
The Pickup/Drop boxes (`LocationField`, "Use Current Location", map taps, language re-read of saved places) get addresses
from three server callables in `functions/index.js` -- `searchPlaces`, `getPlace`, `getAddress` (logic in
`functions/addressLang.js`, testable without Firebase): always in the app's selected language, English words
transliterated into the script via Google Input Tools, plus codes stripped, cached in Firestore `geoCache`, signed-in
callers only. The client (`geoSearchPlaces` / `geoGetPlace` / `geoGetAddress` in `firebaseClient.js`) tries them FIRST and
falls back to the old in-browser Google lookup on ANY failure (30 s cooldown after a failure), so hosting can be deployed
before functions. City-only boxes (Set Fare, `citiesOnly`) keep the in-browser path. A one-time server setup is needed
BEFORE `firebase deploy --only functions`: `firebase functions:secrets:set MAPS_KEY` (a SERVER Maps key) and enable
"Geocoding API" + "Places API (New)" for it -- a missing secret blocks the whole functions deploy. NOT taken from the brief
on purpose: its `index.js`/`package.json` (would wipe the other functions; Node 20 is decommissioned -- we run 22),
`firebase init functions`, the `users`/`trips` collections (ours are `customers`/`drivers`/`bookings`), and the trip-address
triggers (extra cost; nothing reads `pickupAddress` yet). Transliteration was removed from the app once before because the
home-made version produced broken text -- if Input Tools output looks wrong, set `TRANSLITERATE_ENABLED = false` in
`functions/addressLang.js` and redeploy functions. Pinned in `verifyInvariants.mjs`.

**Map vs header taps (owner 2026-10-29: tapping a header icon set a map point as Pickup).** Both live maps
(`NearbyVehiclesMap`, `LiveTrackingMap`) are wrapped in their own stacking context (`isolation: isolate` +
`overflow-hidden`) so Google's high-z-index panes can never sit above the page header or the fixed Refresh button,
and the customer header row is `relative z-30` while the fixed Refresh button is `z-[60]`: the header row's
transparent right-hand spacer sits exactly under Refresh, so Refresh MUST stay above the header row (a same-level
header row once swallowed its taps). The header row and its empty spacer are also `pointer-events-none` (only the row's
buttons take taps), so nothing empty in that row can ever swallow a tap whatever the layering. All three header buttons -- menu, Book Advance, Refresh -- must stay tappable. Keep all of it.
Refresh additionally has a safety net (owner 2026-10-29: dead on the customer screen, fine on the driver's, cause never
found): `App` listens at the window's CAPTURE phase and refreshes on any tap that starts and ends inside the button's
rectangle (`refreshBtnRef`), whatever element is on top of it; `useRefreshButton`'s `lockRef` stops a double fire. Pinned in `verifyInvariants.mjs`.

**OTP-screen map (owner 2026-10-29 -- built, not yet confirmed on a device).** Before the pickup OTP is
entered, the ride-tracking map (`LiveTrackingMap`, `mode="toPickup"`; the customer's `ActiveRide` and the
driver's trip screen) frames a 500 m radius (`OTP_MAP_RADIUS_KM`) around the driver's live position, or the
Pickup pin until a GPS fix arrives. Framed once per anchor, so the person's own zoom is kept; after the OTP
(`mode="route"`) the old fit-the-whole-route behaviour is unchanged. Pinned in `verifyInvariants.mjs`.

**Driver home shortcuts (owner 2026-10-31).** Under the "My Wallet" + duty bar on the driver's idle home screen sit two
quiet, plain-grey text links (no fill, no border -- "keep it simple and don't highlight it too much"): "KYC Settings"
(opens the KYC & Vehicle settings screen via `onOpenKycSettings`; the menu's "Settings (KYC & Vehicle)" entry was REMOVED 2026-10-31 -- this link replaces it) and "WhatsApp Support" (the support
number `ADMIN_WHATSAPP`, and it logs the same "व्हाट्सएप सपोर्ट" alert for that driver as the Helpline page). They stay on ONE
row down to 320 px. Pinned in `verifyInvariants.mjs`.
The hamburger / Advance row at the top of the driver home is FIXED (owner 2026-10-31): it sits OUTSIDE the scrolling area (`relative z-20 shrink-0`, before the scroller in `DriverApp`), so it never scrolls away.
Also (owner 2026-10-31): the whole block -- My Wallet, the Driver Duty switch, KYC Settings and WhatsApp Support -- is pinned to the
BOTTOM of the idle home screen (`DriverHome`'s root is a flex column with `flex-1` inside the scroller, which is itself a flex column on this screen; the block is `mt-auto`; the "You're live" area is `flex-1`, so the whole idle page FITS the screen and does not scroll -- owner 2026-10-31: "keep it intact"; it scrolls only if banners/permission cards genuinely add height), the two links
are `text-sm` with 17 px icons (still plain grey; they wrap onto two lines only at 320 px in English), and the idle pill says
"Loads available in Pune Hub" (hi "पुणे हब में लोड उपलब्ध", mr "पुणे हबमध्ये लोड उपलब्ध") instead of "All India booking available".

**Set Fare (owner 2026-10-29).** The driver's "Set Fare" pill appears ONLY on the main (idle home) page --
`realHamburgerVisible` in `DriverApp` -- and nowhere else (not Wallet, My Trips, Advance rides, Profile, or an
active trip). Pinned in `verifyInvariants.mjs`.

**Entry + refresh animation (owner 2026-10-29).** `index.html`'s inline loader: the app icon
rises in on a deep-blue field with a one-time shine and a slim yellow progress bar, then
the screen eases away (min ~2.4 s hold, the bar fills over it, 0.8 s exit). The Refresh button (`useRefreshButton`) turns once
(`refresh-turn`), dims the app, sets `sessionStorage.sarthi_refresh` and reloads after 600 ms;
the loader reads that flag and plays the short `.is-refresh` variant (icon + spinning ring,
~0.9 s). The Android native splash image is separate (native build) and was not touched.

**Motion pass (owner 2026-10-29, "implement all" -- built, not yet confirmed on a device).**
Decoration-only classes live in `index.css` (`anim-rise`, `anim-drop-in`, `ring-pulse-yellow`,
`bell-wiggle`, `pop-in`, `draw-tick`, `radar-ring`, `map-halo`, `skeleton`, `bob`,
`slide-in-right`, `photo-zoom-in`, `sb-*`) and ALL stop under reduced motion. Where: vehicle
cards rise (both booking screens) and the Book button shows a spinner while sending; map trucks
fade in and the pickup dot pulses (`OverlayViewF`); the "Notifying" screen has radar rings, a
self-drawing "Request sent" tick and a counting-up ring count; the booked-driver panel rises in;
the driver duty switch has a springy knob + live pulse; incoming-load cards drop in with a bell
wiggle and yellow ring (visual only -- `respondToBroadcast`, the ring and the beep loop are
untouched); the driver trip summary counts the fare up; sign-up steps slide with `StepDots`; a
one-off `SuccessBurst` after a brand-new sign-up; KYC photo tiles zoom in; history lists show
`SkeletonRows` until the first bookings snapshot (`useBookingsLoaded`) and `EmptyState` (bobbing
blue/yellow truck) when empty. Not done: the route-line draw-on and the confetti-free variants.
Animations play BY DEFAULT, ignoring the phone's "Remove animations" / Power-saving setting
(owner 2026-10-29: "why do I need a permission to run animations?"). `index.html` adds
`html.force-motion` unless `localStorage.sarthi_forceMotion === '0'`, and every
reduced-motion rule in `index.css` / `index.html` is prefixed `:root:not(.force-motion)`.
`/motion-check.html` (`public/`) shows the phone's setting + whether the latest build is
deployed, and lets someone who needs reduced motion opt out ("Follow my phone's setting").

**Handwritten note (owner 2026-11-03, 3-11-2026 -- built, not yet confirmed on a device).** (1) Admin Rate Calculator: a read-only "Round trip rate" row (one-way + return, same as F6). (2) Booking screen: the fixed bottom "Round trip" box is a BIT BIGGER (14 px bold text, 24 px checkbox, `py-3`; was a 30 px strip) -- this deliberately replaces the 2026-11-01 "small and quiet" size; (the mic that was added to Pickup/Drop here was REMOVED 2026-11-04) the suggestions are the customer's own city first, 8-10 of them (`searchPlaces` in `functions/addressLang.js`, needs `firebase deploy --only functions`; wrong-spelling tolerance is Google's); the booked-vehicle distance tile uses the real road distance. (3) The pulsing circle around the nearest vehicle on the booking map is gone (the "N min" pill stays). (4) Admin: bulk WhatsApp for KYC-incomplete / off-duty / uninstalled drivers; Change Log hides old fixed entries behind "Old changes (N)"; Alerts moved INSIDE the Notify tab. NOT done on purpose (frozen GPS/map code, needs the owner's go-ahead): extra live-vehicle layers on `AdminLiveMap`, and road-snapped movement of the vehicle toward the customer on `LiveTrackingMap` -- both already show the live position today.

**"Not seeing the right vehicle? Click here" -- REMOVED (owner 2026-11-04: "remove the button ... and features associated with it throughout the app as it turns irrelevant because we added rung feature even if the GPS is off" -- built, not yet confirmed on a device).** Gone everywhere: the customer's blinking button and its "team will call you" / "can't find a driver" lines, the 10-minute no-call timer (`UNMATCHED_NO_CALL_MS`, `unmatchedRequestStage`), the `unmatchedVehicleRequests` collection (no code reads or writes it; its `firestore.rules` block is removed, so old documents just sit unread in Firestore), Admin's red "N Direct request(s) from customer" box on the Live Dashboard, the Alerts "Unmatched load" cards (offline-driver matches, Call, fare box, Mark handled), the scan's `unmatched-waiting` check and the blink style. The ring's escalation of unmatched BOOKINGS (`escalateUnmatchedBookings`) is a different thing and stays. Needs `firebase deploy --only functions`, hosting, then `--only firestore:rules` (rules LAST). Contract B8; pinned by "NOT SEEING THE RIGHT VEHICLE REMOVED".

**NO microphone on Pickup/Drop (owner 2026-11-04: "remove the microphone completely").** The mic added 2026-11-03 (and its in-app listening sheet + native speech plugin, 2026-11-04) is gone: no mic button, `VoiceListeningSheet`, `src/speechInput.js`, `@capacitor-community/speech-recognition`, or Android Gradle entry (`android/app/capacitor.build.gradle` / `capacitor.settings.gradle` are back to their pre-mic content, so NO native build is needed for this). Do not re-add a mic unless the owner asks. The spoken onboarding prompts and Admin announcement audio ("Voice" paragraph) are different features and stay. Contract B6; pinned by the "NO MICROPHONE" invariant.

**Pickup/Drop suggestions = Google Maps (owner 2026-11-04: "the suggestions give vague options ... only 2-3 letters of the first words are enough in Google Maps ... replicate the way Google Maps suggests" -- built, needs `firebase deploy --only functions`, not yet confirmed on a device).** THIS REPLACES the earlier nearest-first search (five hard boxes of 13 / 39 / 130 / 350 km + anywhere, closest 3 per distance band, re-sorted ascending by km), which threw away Google's relevance order and so showed near-but-vague places above the exact match. Now `searchPlaces` (`functions/addressLang.js`) makes ONE Autocomplete (New) call per keystroke with a SOFT `locationBias` circle (<= 50 km) around the reference point (the customer for Pickup, the pickup for Drop) plus `origin` (km label only) and `includedRegionCodes: ["in"]`, and shows Google's own order untouched (up to 8, duplicates removed); never a hard `locationRestriction`, never distance re-sorting. No position = no bias, no km. The in-browser fallback does the same (bias radius 50 km, Google's order). Every row still shows its km (`data-suggestion-km`); debounce 200 ms. Source: Google's Autocomplete (New) docs -- bias is soft, restriction is a hard filter, `origin` only affects the distance, `languageCode` has a small influence on set and order and results can be mixed-language if the typed language differs. KNOWN LIMIT: with the app in Hindi / Marathi the request still uses that language code, so Latin-typed words rely on Google matching across scripts; if the owner still finds Latin typing weak in Hindi, the next step is to query with `en` for matching and transliterate for display. Contract B5; pinned by "PICKUP/DROP SUGGESTIONS WORK LIKE GOOGLE MAPS" (runs the real service against a fake Google: one call, soft bias, Google's order kept even when the exact match is far).

**No weight / est.-distance box on the customer screen (owner 2026-11-04: "remove the Est. distance and Enter box completely ... after typing in Pickup and Drop, it leads to vehicle list directly with existing criteria and show the online vehicles first" -- built, not yet confirmed on a device).** `CustomerBooking` (Current AND Advance, one component) no longer has a weight state / input / kg-ton toggle / weight notes / km box. After Pickup + Drop (+ date and time in Advance) the vehicle list shows at once: `isDriverListableForCustomer` WITHOUT the capacity window (DUTY ON, KYC Approved, not blacklisted, not on a trip, AND WITHIN 30 km Current / 50 km Advance of the pickup measured from the driver's LAST KNOWN location however old -- owner 2026-11-04: GPS off / stale does not stop listing, shown as "Location off (last seen)", but a driver who NEVER reported a location is not listed), ORDER (owner 2026-11-04): GPS-ON vehicles first, then the GPS-off ones; inside each group category (light -> heavy) then nearest; duty-off vehicles are NOT listed. The load BELL uses the SAME 30 / 50 km radius (rule A6, 2026-11-04), so list and bell agree. CATEGORIES (owner 2026-11-04, built, not yet confirmed on a device): the list is ONE ROW PER capacity category (owner: "I want the list to be like this along with the fare price, category, N min and vehicle icon" -- like the weight / vehicle chooser): vehicle icon (`data-category-icon`), the vehicle illustration (`CategoryVehicleArt`, `src/vehicleArt.jsx`: 15 original vector drawings in a heavy, realistic front-left-above style (owner 2026-11-04: "more mature and thick like the reference"; "the tyre seems odd, only 2 tyres" -> far-side tyres peek out below the body, twin rear tyres from the Tata 407 up, tread / lug nuts / mudguard lip / mud flap, fuel tank, rear guard, reflective tape; the 3 wheeler has its own drawing `ThreeWheelerArt` -- a realistic Indian loading auto, redrawn with real proportions after "not realistic enough": tall narrow cab on small wheels, ONE centre front wheel under a rounded nose + big oval headlamp + flowing mudguard, raked windscreen + wiper, canopy roof, open-sided cab with bench seat + handlebar + mirror, engine bay + exhaust + silencer, leaf spring, low open cargo deck on two rear wheels) -- NO image files / Canva rasters; the PICKED row shows the vehicle ONCE -- its small icon is hidden and only the large picture is shown, `data-category-art` (owner 2026-11-04: never two vehicles at once) -- with a BODY SIZE block beside it, `data-category-dims`: length / width / height in feet in the customer's language, from `VEHICLE_MODEL_SPECS` via `customerListCategoryDims`, NEVER on the small row icon), the category NAME in big bold type (`data-category-title`; owner 2026-11-04, `CUSTOMER_LIST_CATEGORY_NAMES` in the customer's language -- hi / mr are translated, e.g. "6 चक्का" / "6 चाकी"; English: 3 wheeler, Tata Ace, Pickup, Pickup 8ft, Tata 407, 14ft Eicher, 17ft Eicher, 20ft container, 6 wheeler, 22ft/24ft truck, 10 wheeler, 32ft container, 12/14 wheeler, 16 wheeler, 32t+ truck; 14ft Eicher = 3500 kg and 12/14 wheeler = 25000 kg were added 2026-11-04, so the old 12/14/16 wheeler row became 12/14 wheeler + 16 wheeler) with its weight limit under it (`data-category-weight`), the top fare (`data-category-fare`) and "⏱ N min away" of the nearest GPS-on vehicle of that category (`data-category-eta`) -- ROW LAYOUT (owner 2026-11-04, screenshot: on a 360 px phone the weight was cut to "7500 ..." and the name wrapped on 3 lines): TWO lines, never squeezed: line 1 = small 84 x 48 px icon + the name (`text-base`, wraps freely) + the weight as a chip "⚖ 7500 kg" that is never truncated; line 2 = "N min away" at the left, the fare (`text-lg`, bold) at the right; pinned by "CATEGORY ROW LAYOUT"; NO per-vehicle cards (no photo / km / "Location off" line) -- 500 / 750 / 1200 / 1700 / 2500 / 3500 / 5000 / 7500 / 9000 / 12000 / 16000 / 20000 / 25000 / 32000 kg, light -> heavy (`CUSTOMER_LIST_CATEGORY_KG`, `groupByCustomerListCategory`; a vehicle goes in the first category whose limit it does not exceed, over 32000 kg = a final "Above 32000 kg" group so none is hidden, empty categories are not shown); the GPS-on-first / nearest order still decides the N min (nearest GPS-on vehicle); CATEGORY BOOKING (owner 2026-11-04, "no need to select an individual driver, just ring each and every vehicle inside that category" + "single button for each and every category"): the customer TAPS A CATEGORY (`selectedCategory`, highlighted green; nothing pre-selected) and presses ONE fixed "Book now · ₹fare" bar at the bottom of the screen (`data-book-bar`, greyed out until a category is picked, sits just above the Round trip bar when both show) -- there are NO per-category buttons; the row itself is the tap target (no vehicle cards, no "See all vehicles", no "Tap a vehicle" hint; the old chosen-card view is gone, but the map's "N min" pill is back (owner 2026-11-04) on the NEAREST GPS-on vehicle of all the listed ones, `nearestListed` / `mapHighlight`); the button books the whole category at its TOP fare (dearest vehicle in it; tie -> bigger capacity), the booking stores that vehicle's tier / capacity / return fare + `listCategory`, and the bell rings the category + 2 above (rule A6); the blue note box that used to sit above the list ("every vehicle in a category is notified, only one driver can accept, the fastest wins") was REMOVED at the owner's request (2026-11-04). ONE ROW now sits above the list (`data-trip-row`, `changePlacesLink`): the distance at its LEFT end, BIGGER and bold (owner 2026-11-04, `data-est-km`: "Distance: N km" / hi "दूरी: N किमी" / mr "अंतर: N किमी", `text-base font-extrabold`, shown once Pickup + Drop give a distance) and "Change pickup / drop" at its RIGHT end (`data-change-places`, only while the Pickup / Drop boxes are tucked away), both visible down to 320 px; it replaces the old centred grey link. Pinned by "CUSTOMER LIST IN CAPACITY CATEGORIES" + "CATEGORY BOOKING". Pickup/Drop tuck away only after an explicit choice (`tripHidden`), never while typing; a map tap no longer replaces Pickup/Drop once both are chosen. Distance is also computed for fares / the booking's `distance`, and is shown as the "Distance: N km" at the left of the row above the list. Booking without a weight: `weight` = the TAPPED vehicle's capacity + `weightIsCapacity: true` (dispatch window [capacity, capacity + 5 t] still contains the tapped vehicle; the server ring code was NOT touched; the customer's ride screen says "Vehicle capacity" instead of "Your load"). (The "Not seeing the right vehicle?" request was removed the same day.) Known consequence: the list is now every capacity (a customer with a small load sees big trucks too). Contract B1/A5; pinned by "NO WEIGHT BOX" + the rewritten booking-flow checks + a browser run (Current + Advance, en + hi, real booking).

**Admin Live Map: trip routes + ride details (owner 2026-11-04 -- built and PUSHED 2026-11-04 on the owner's explicit go-ahead ("push it"); AdminLiveMap is GPS-frozen; not yet confirmed on a device).** The owner asked for this change explicitly ("it must show all the trip details on the map ... show the route for the trip and tapping it will show the details of the ride"). Implemented ONLY as additions in `src/AdminPanel.jsx`: `tripsOnMap` / `useTripRoute` / `AdminTripRouteLine` / `AdminTripDetailCard`, mounted by three added lines in `AdminLiveMap` (state, the route layer inside `<GoogleMap>`, the card + a hint chip). The existing GPS polling / located-driver markers / fit-bounds / `AdminTripRoad` / legend were NOT edited. See contract M1.

**Fares.** `calculateFare` (App.jsx): in-city = master formula × `priceCorrectionFactor`
(anchored 5% below Porter at 13 km); outstation = `priceOutstation`, a piecewise
curve from real Porter quotes (500/750/1200/2000/3500/5000 kg, ×0.95), tiers
above 5000 kg scaled from the 5000 curve, with a LIVE running max so a bigger
vehicle is never cheaper than a smaller one at any distance
(`enforceMonotonicFares` is the display backstop in both booking flows).
Diesel baseline ₹98/L; live price in Firestore `settings/main.dieselPricePerLitre`
adds km × Δprice ÷ tier mileage to every fare. Resolution order: admin's saved
route rate → scaled by the admin's other-tier ratio → formula.
The scaled layer (`getRouteScaleRatio`) matches the route by COORDINATES first (same radius rule as the exact override), text only as fallback, and every caller passes coordinates (owner 2026-11-02: Admin calculator showed ₹6,941 but the customer's one-way was ≈₹8,964 on the same route, because differently-written place names lost the derived rate; the Round trip total ₹16,583 was just that ₹8,964 + 85% of it). Pinned by a behavior check.
Diesel (owner 2026-11-02, "fare is not grasping the change in diesel"): SAVED Admin rates now follow the live price AUTOMATICALLY (owner 2026-11-02): each saved rate stores `dieselAtSave`; `applyDieselToSavedRates` (App.jsx, applied once at the root so every screen reads the same adjusted `adminRouteFares`) adds km x (live - dieselAtSave) / tier mileage. Rates saved before this have no stamp and stand at `settings/main.ratesDieselBase` (written once, with the first diesel change after this shipped; until then = the live price, so NOTHING moves on deploy). "Save Diesel Rate" now writes only the price (no bulk rewrite of documents). Everything else follows the live price too: formula fares, the scaled layer (its ratio now divides by the formula AT the live diesel, so no double count after a nudge), and the Admin Rate Calculator's suggestion + driver-entry comparison (they used to ignore diesel). Pinned by a behavior check.

**Deep-clean fixes (owner request 2026-11-02, "deep clean the entire app").** Static lint + a fake-Firestore browser smoke test (about 2,500 random taps across customer / driver / admin in en and hi) + the Firestore rules run in the local emulator (`scripts/rulesTest/`). Fixed: (1) the Admin Rate Calculator crashed on open (my diesel commits, `AdminRouteFares` never received `dieselPricePerLitre`); (2) a customer's Round trip got the driver-side Return Load 15% discount a second time at accept (`!b.returnTrip && isReturnLoadFor(...)`, both the accept and the load-card badge), and finishing a Round trip no longer starts the driver's Return Load mode; (3) `firestore.rules`: a Return Load accept was refused outright (the claim writes fare/originalFare/isReturn/returnPct, which were not allowed on an unassigned booking) -- now allowed ONLY as a discount; (4) `firestore.rules`: a driver's withdrawal request was accepted but the bonus deduction was refused, so the same bonus could be requested again and again -- a driver's own session may now only LOWER the bonus (wallet / heldCredit stay locked so a stale profile overwrite can never undo an Admin credit); (5) double taps on Withdraw / Approve-recharge can no longer fire twice (`claimMoneyTap`); (6) unused imports/variables removed; (7) DATES: `toISOString().slice(0, 10)` is the UTC day, so in India the Admin finance chart plotted yesterday under today's label (today's earnings never showed), a night-time Advance booking could pick an hour already past, and `isFutureAdvance` was wrong until 05:30 -- everything now uses `localDateKey()`; (8) the service worker never caches an error page, a partial response, or a stylesheet/script that came back as HTML (Hosting rewrites unknown /assets paths to index.html with a 200 -- the likely cause of the 'unstyled screen' report), cache bumped to v4. Rules changes need `firebase deploy --only firestore:rules`.

**Owner decisions after the deep clean (2026-11-02, "all 4 fixes").** (a) PICKUP OTP IS SERVER-MADE: `functions/otp.js` + `issuePickupOtp` (functions/index.js, fires when a booking first becomes Ongoing with a driver; `create()` so it is issued once) write `bookingOtps/{id}`; the driver's phone no longer generates or writes it (`driverRespondBooking` only claims the booking); `verifyPickupOtp` counts wrong guesses (10 wrong = locked 10 min, `judgeOtpGuess`); `firestore.rules`: only Admin/server write `bookingOtps`, and reading a not-yet-existing one is allowed so the customer's listener (opened the moment the booking turns Ongoing) survives the ~1 s gap. DEPLOY ORDER MATTERS: functions first, then hosting, rules LAST (`firebase deploy --only functions` -> `--only hosting` -> `--only firestore:rules`); rules before the others would refuse the old app's OTP write and break accepting. (b) `vehicleTypes` / `materials`: signed-in users may only ADD (a driver typing a new vehicle at sign-up), only Admin edits/deletes. (c) Android `allowBackup="false"` in both manifests (native build needed -- NOT triggered, ships with the next one). The `setWebContentsDebuggingEnabled(true)` leftover named above is no longer in the code (nothing to remove). (d) Ride dates read DD/MM/YYYY (were DD:MM:YYYY). Rules tests: `scripts/rulesTest/` (all lines "ok").

**DRIVER AVAILABILITY (owner 2026-11-03: "a vehicle already on the trip is showing in the vehicle list").** ROOT CAUSE: `getBookingWindow` returned null for any booking with `hours` of 0, and EVERY booking is created with `hours: 0`, so `findDriverLoadConflict` never found a conflict -- no driver was ever "busy" (customer list, driver's own load list, accepting a second trip). Fixed in `App.jsx` (block `// ---- driver availability (start/end) ----`): a RUNNING booking (immediate, or advance whose loading began / time arrived) holds its driver until Completed/Cancelled (window never ends before now+1h); an advance booking blocks only inside its tonnage buffer (`notificationLockHours`) and an estimated length (`estimatedTripHours`: max(2, km/30+1) h, doubled for a round trip); `driverIsOnTrip` also keeps the driver off the customer's MAP. Pinned by a behaviour check (it FAILS on the old code) and reproduced/fixed in the browser. ALSO FIXED ON THE SERVER (owner said "yes fix the ring too", 2026-11-03): `functions/index.js` `getBookingWindow`/`hasLoadConflict` (used by `onDirectRequestBroadcast` and the escalation waves) had the same `if (!b.hours) return null`, so a busy driver was still RUNG for new loads; they now mirror the app (`estimatedTripHours`/`isBookingRunning`/`getBookingWindow`), pinned by an equivalence check against the app's rule on 400 random situations.

**Vehicle model lookup (found 2026-11-04 while adding the body sizes).** `lookupVehicleModelSpec` (Driver KYC autofill from the typed vehicle name) used to return the FIRST model whose key appeared in the text, so "16 wheeler" matched "6 wheeler" and autofilled 17.5 ft / 9 t instead of 40 ft / 30 t. It now picks the LONGEST matching key ("tata ace gold" still beats "tata ace"). Pinned by "CATEGORY BODY SIZE". REPAIR of the data it already damaged (owner 2026-11-04 "fix this too"): admin-only callable `repairSixteenWheelerCapacity` (`functions/vehicleSpecRepair.js` decides, `functions/index.js` writes) behind Admin -> Settings -> "Fix 16-wheeler vehicle sizes": **Check** is a DRY RUN that lists the drivers / vehicle types; **Fix** (confirm, only when something is listed) sets capacityKg to 30,000 ONLY where the vehicle name says "16 wheeler"/"16-wheeler" AND the saved capacity is exactly 9,000 (hand-typed capacities, real 6 wheelers, "116 wheeler" are never touched; `apply` must be boolean `true`). Needs `firebase deploy --only functions` AND hosting. Pinned by "16-WHEELER CAPACITY REPAIR" and run against fake Firestore (non-admin refused, dry run writes nothing, only the right records change, a second Check finds nothing). Row icons (2026-11-04): the small row illustration is drawn `bold` = strokes 1.7x thicker (the big picture is drawn ~1.7x larger, so the on-screen line thickness is the SAME as the picked icon's -- owner: "match the thickness to the inside vehicle icon"; the earlier 2.4x version with chunkier tyres was too heavy) in a `w-28 h-16` box; the big picture on the picked row keeps the normal weight.

**White-screen watchdog (2026-11-02, "blank white screen on the Admin app").** The inline loader in `index.html` gives up after 10 s, so an app whose JavaScript never starts used to leave a BLANK page with no clue why. A second inline script now waits 12 s; if `#root` is still empty it shows the first caught script errors (failed file, syntax error, rejected promise) + the device's user-agent and a Reload button that also unregisters the service worker and clears the caches; it removes itself if the app mounts later. Never shows when the app starts normally. Pinned in `verifyInvariants.mjs`.

**Admin lists** (Drivers tab: FOUR boxes -- GPS, KYC, Status, Low wallet -- showing their counts (owner 2026-10-31; they replaced the 7 accordions, same lists); tapping a box OPENS A NEW SCREEN with a toggle at the top (GPS On/Off, KYC Complete/Incomplete, Status On Duty/Off Duty; Low wallet has none) and the list of the selected side below it, back arrow returns; "All Drivers (N)" opens a screen with everyone; search stays on the boxes screen; Customers, Uninstalled, Blocked,
New Registrations): numbered rows; name truncates but icons are never cut; driver
GPS/KYC are compact "GPS"/"KYC" badges (green ok, red not); Call really disables
after a tap (not just greys) and stays disabled until EVERY entry in that list
has been called, then the round resets; double-tapping a disabled Call re-enables
just that entry; called entries sink to the bottom so numbers re-shuffle.
Customers: Call icon per row, status pill (Searching/Ongoing/Completed/Cancelled)
that expands the latest booking, chevron-only details button, sorted by latest
ride, "Redirect to Driver App" WhatsApp (`wa.me`, link carries `?open=driver`).
New Registrations: 7/30/90-day button matching the From/To dates is
highlighted. "Uninstalled" = no sign of life for 14 days (owner 2026-10-27 after
calls found "installed" drivers in it): the NEWEST of `lastActiveAt` (root `App`
stamps it on every app open/foreground for every driver state, at most every 6h),
`lastKnownLocation.updatedAt` and `fcmTokenSavedAt`; `createdAt` only if none
exist (`isLikelyUninstalled`, pinned by a behavior check). The Uninstall bar keeps its name,
labelled "Inactive 14+ days" (Install = "Active in last 14 days"); the Uninstalled page
holds ONLY those drivers. Blocked drivers have their own full-width Live-Map-style
tile + page ("Blocked", with Unblock) on the Live Dashboard (owner 2026-10-27). KYC: Reject needs a second confirm tap; Rejected drivers stay in the
approval queue so a mistaken reject can be reversed.

**Live Dashboard.** (The red "N Direct request(s) from customer" box was removed 2026-11-04 with the "Not seeing the right vehicle?" feature.)

**Voice.** Onboarding prompts (role question, mobile, PIN, confirm PIN, success,
off-duty reminder) are MANDATORY — no mute toggle, no once-per-device gate; they
use the device's Web Speech API, which some phones' WebView lacks entirely (works
in Chrome; device-dependent in the app). Admin "🔊 Also read this aloud" does NOT
use device TTS: `sendAdminNotification` synthesizes an MP3 server-side (Google
Cloud TTS → Storage → `audioUrl`), played by `playAnnouncementAudio` for a
recipient whose app is OPEN (closed-app delivery needs a native build — owner
declined). One merged banner, big 🔊 button (banner + inbox), no X.
The 🔊 button is a strict play/stop toggle (owner 2026-10-26): ONE shared player
(`toggleAnnouncementAudio`), tapping twice stops it and never layers a second
copy; a new announcement replaces the old one; the icon becomes a stop square
while playing. EVERY spoken sound (`speakAlert`, `speakGuide`, the MP3 player)
uses the one `SPEECH_RATE` (0.85, slower than normal) — retune that one number,
never set a speed on an individual sound. Lines that must play one after another use
`speakGuide(text, lang, { queue: true })` (role select: welcome, then the role question)
-- never a fixed timer, which chopped the Hindi welcome. Sign-up's opening prompt asks
for the name AND mobile (the form's first field is the name).
Cloud Functions run on Node 22 (`firebase.json` runtime `nodejs22` + `functions/package.json` engines `22`; upgraded 2026-10-29 because Node 20 is decommissioned 2026-10-30).
Deploy gotchas: run `npm install` in `functions/` after pulling new deps; keep
the TTS client lazy (eager creation timed out `firebase deploy`); Cloud
Text-to-Speech API must be enabled on the GCP project.

**Role selection.** Cards say WHO should pick them ("If you drive a truck or
vehicle" / "If you need to send goods") — matches the spoken prompt.

**Driver KYC is mandatory (owner rule 2026-10-27 -- built, not yet confirmed on a
device).** Every KYC field is required except vehicle dimensions (not collected):
driver photo, driving license photo, vehicle name, vehicle registered number,
vehicle capacity (kg, a real number > 0), vehicle side photo. ONE definition
drives everything -- `DRIVER_KYC_FIELDS` / `getKycMissingFromValues` /
`getDriverKycMissing` / `isDriverKycComplete` in `App.jsx` (pinned by BEHAVIOR
checks in `verifyInvariants.mjs`): the KYC form's Submit (`draftMissing`), the
sign-up documents form, the Incomplete screen and the admin KYC
badge (green only when Approved AND complete). A driver who signed up but whose
saved KYC lacks any field sees the red "Incomplete form -- complete it to start
your rides / trips" notice (`KycIncompleteNotice`) with the form FIRST, every
time the app opens, before the Pending screen and the dashboard
(`driverKycIncomplete` gate in `App()`). APPROVED drivers are exempt (owner,
2026-10-27: "keep approved drivers approved") -- never gated, and submitting the
KYC form never demotes them to Pending; admin's KYC badge is unchanged. An
Approved driver who is still missing documents gets a dismissible orange reminder
(`KycReminderBanner`) at the top of the idle home screen: "Complete now" opens the
KYC form, "Later" hides only that banner until the app is next opened. Rejected
drivers keep their own "resubmit" screen. Everyone else's submission lands in
"Pending" for admin to verify. `firestore.rules` lets a driver's own session set
`kyc` to 'Pending' only (never Approved/Rejected) -- deploy it with
`firebase deploy --only firestore:rules` or a Rejected driver's re-submit is
refused. The GPS/ring code itself is untouched; the gate simply means a gated
driver never reaches `DriverHome`.
The KYC screen (`DriverKyc`, shared by Settings and sign-up) opens with the red line "Without these documents you won't be able to get loads." (owner 2026-10-31), above the "Everything below is mandatory" note.

**Driver sign-up flow (owner 2026-10-28 -- built, not yet confirmed on a device).**
Step 1 = Name, Mobile, PIN/confirm PIN ONLY (no document clause there); the PIN
button says "Continue" (`goToDocsStage`) and creates NO account. Step 2 = the
mandatory documents + vehicle form (`DriverKyc deferred`), with the
document-responsibility clause (`DocsTermsCheckbox`) LAST, after Vehicle Details.
The Firebase account is created in exactly one place, `createAccountAndSubmit`,
when the final "Create Account" is tapped with everything filled and the clause
ticked -- so nobody ends up with an account and an Incomplete KYC. Photos picked
before the account exists are held in memory (File + blob preview) and uploaded by
`runDriverSignupFinalize` right after creation (AI check on licence/side photo; a
wrong-kind photo is dropped, so that driver lands on the Incomplete form listing
it). If the account can't be created or saved, an error shows and the form stays.
Pinned by behavior checks in `verifyInvariants.mjs`.
A mobile that already has an account for the SAME role (customer or driver; one
number may hold one account per role) is refused at the mobile step of Sign Up
with "Number Already exists. Try login" -- `goToPinStage` asks the callable
`checkMobileRegistered` (functions/index.js; needs `firebase deploy --only functions`).
If that check can't run, sign-up continues and account creation shows the same
message.
Sign-up forms never remember what was typed (owner 2026-10-28): customer and
driver sign-up fields (name, firm, photo, mobile, PIN, and the deferred documents
form) are plain state, not localStorage, and EVERY Back arrow (`resetForm`) wipes
the whole form so they retype it all. Pinned in `verifyInvariants.mjs`.

**Meta ads export (owner 2026-10-27).** Admin Settings -> "Export app users for ads
(Meta)" downloads every driver + customer mobile (blocked/inactive included, duplicates
merged, junk skipped) as a one-column `phone` CSV (`91XXXXXXXXXX`), to upload as a Meta
Customer-list audience and EXCLUDE from install ads. Logic is `buildMetaUsersCsv`
(pinned by a behavior check). The Android app's WebView has no download handler, so
a blob CSV download can silently do nothing there. So "Download CSV for Meta" asks the
admin-only callable `createCsvDownloadLink` (functions/index.js; needs
`firebase deploy --only functions`) for a 10-minute signed https link and opens it
in the phone's browser, which downloads it. If that fails it falls back to the blob
download. The card also has "Copy numbers" + a selectable box (paste into Meta's
"Copy and paste your customer list").

**Look & feel (owner 2026-10-26: "same brand colour, fresher feel").** Brand hues
(marigold #FFCC00, orange, blue #0052CC, green, red) are unchanged. All screens
read neutrals from the `C` tokens in `App.jsx` — page `bg` #F4F7FB (white `paper`
cards lift off it), `ink` #0F1B2D, `inkSoft` #475569, soft grey-blue `line`
#D5DCE8 (NOT black). Never hard-code a black (`#000000`) border/outline; use
`C.line`. Font = Inter + Noto Sans Devanagari (`index.html` link, `index.css`);
real 700/800 bold, not Arial Black. Global polish lives in `index.css` (focus
ring, tap feedback, reduced-motion) and `tailwind.config.js` (layered shadows,
round corners) — restyle there, not screen by screen. Layouts were NOT changed.
Whole-app pass (2026-10-26) also covered booking, advance booking (time sheet),
driver home, wallet, trip history, admin tabs. Palette rules for new UI: disabled
fill `#E5EAF2`, hint/placeholder grey `#94A3B8`, modal scrim `rgba(15,27,45,0.55)`,
page headings `text-lg font-extrabold`, cards `shadow-sm`/`shadow-md`, selected
states ring + tint instead of thicker borders (no layout jump). GPS/ring-frozen
blocks (LoadBellButton, BackgroundLocationDisclosure, AdminLiveMap) were left
exactly as they were.

**Clean-up pass (owner 2026-10-31, "make the whole app clean" -> chosen approach: SAFE shared styles only).** The end of `index.css`
("Clean-up pass") adds only look-and-feel rules that change no box size, position or layer: no text inflation, balanced headings /
tidy paragraphs, brand-tinted selection, buttons not text-selectable, colour fades on state changes, no overscroll bounce. Layout of
six screens (customer, customer after a trip tap, advance, driver in en/hi, customer hi) was measured before and after: 0 elements
moved. `index.css` also sets `--sarthi-css: 1` and `index.html` reloads ONCE (`sarthi_css_retry` guard) when that marker is missing,
i.e. when the stylesheet failed to load (the unstyled-screen report). Bigger visual changes (per-screen layouts) were NOT done: they
need the design-first route. Pinned in `verifyInvariants.mjs`.

**Clean fonts (owner 2026-10-31: "more clean irrespective of the language ... don't remove bold, italic, underline").** Same fonts (Inter +
Noto Sans Devanagari); `<html lang>` now follows the app language (`App()` effect) so `index.css` can treat each script on its own:
Latin headings get -0.01em, Hindi/Marathi headings none (never squeeze conjuncts), Hindi/Marathi weight 800 is drawn at 700 (still
bold), Inter loads its real italics (`ital` axis in the Google Fonts link), underlines keep their underline with a cleaner offset,
kerning/ligatures on. Bold / italic / underline are NEVER removed -- no rule may set `font-style`/`text-decoration`/low weights with
`!important`. Layout measured before/after on six screens: 0 moved (1 element 1 px in Hindi). Not viewable in the sandbox (Google Fonts
are not loaded there), so the real-font look is for the owner to confirm on a phone. Pinned in `verifyInvariants.mjs`.

**Working agreement.** Push automatically after build + invariants pass, EXCEPT
GPS/notification-related changes — ask first (owner rule, 2026-10-23). After a
push, give the deploy commands: `git checkout claude/app-from-document-njzc58 &&
git pull && npm run build && firebase deploy --only hosting` (add `,functions`
when `functions/` changed). `scripts/package-lock.json` is permanently untracked
on purpose — the stop-hook nagging about it is expected; leave it alone.
