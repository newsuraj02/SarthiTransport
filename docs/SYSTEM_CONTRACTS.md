# Apna Transport — system contracts (the app's memory)

**Why this file exists.** The owner's rule (2026-11-03): *"keep track of every inch/minute detail in criteria, conditions, functions, system — inform
Admin even the slightest change."* Every session starts with no memory of the last one, so the memory has to live in the repository.
This file lists every rule that decides something, in plain words, WHERE it lives and WHAT pins it. Three machines keep it honest:

| Machine | What it does | When |
|---|---|---|
| `npm run verify:invariants` | Runs the real rule code on made-up situations (behaviour checks) and refuses to pass if any fails. **Also fails if any tracked rule, Cloud Function or config/rules file changed without being acknowledged** (`scripts/criteria.lock.json`). | Before every push |
| `npm run criteria:accept -- "why"` | The ONLY way to acknowledge a rule change: updates the lock and appends a dated line to `docs/CRITERIA_CHANGELOG.md`. | After a deliberate rule change |
| Morning (09:00) + night (23:00) IST scan, plus Admin's **Run scan now** | Reads the LIVE data and the LIVE deployed build; tells Admin on the Live Dashboard tile (and in the Change Log) about every problem **and every change** since the previous scan. | Twice a day |

**Rules of the road for any session (human or AI):**
1. Before changing a rule, find it below, read its check, and say plainly what changes.
2. Change the rule AND its check together. Run `npm run verify:invariants`, then `npm run criteria:accept -- "reason"`.
3. A rule that exists in two places (app + Cloud Functions) is listed as *mirrored*; the checks compare the copies.
4. If a bug is found, add a check that FAILS on the old code before fixing it (the busy-driver check was proven this way).
5. Frozen areas (GPS, ring) are in `CLAUDE.md`; do not touch without the owner's request in the same message.

Legend: **app** = `src/App.jsx`, **admin** = `src/AdminPanel.jsx`, **fns** = `functions/index.js`, **scan** = `functions/healthAudit.js`.

---

## 1. Who may be shown / take a load (AVAILABILITY)

| # | Rule | Where | Pinned by |
|---|---|---|---|
| A1 | A driver is **busy** from the moment they accept an immediate booking until it is Completed/Cancelled — however long it overruns. A busy driver is NOT in the customer's vehicle list, NOT on the customer's map, NOT offered new loads, and cannot accept a second trip. | app `driverIsOnTrip`, `isBookingRunning`, `getBookingWindow`, `findDriverLoadConflict` | invariant "DRIVER AVAILABILITY" (fails on the old code) · scan check `availability-rule-broken` |
| A2 | An **advance** booking holds its driver from *(scheduled time − tonnage buffer)* until *(scheduled time + trip length)*; once its time arrives or loading starts it is "running" (A1). | same | same |
| A3 | Tonnage buffer before an advance booking: capacity >16 t → 4 h, >8 t → 3 h, ≥3 t → 2 h, else 1 h. | app `notificationLockHours` (mirrored in fns + scan) | availability + equivalence invariants |
| A4 | Trip length when a booking states none (`hours` is 0 on EVERY booking): `max(2, ceil(km/30)+1)` h, doubled for a round trip. | app `estimatedTripHours` (mirrored in scan) | availability invariant |
| A5 | **Customer vehicle list**: driver online, KYC Approved, not blacklisted, capacity ≥ load and ≤ load + 5,000 kg, a GPS fix not older than 5 min, within 30 km of pickup (50 km for advance), and **no availability conflict (A1/A2)**. | app `isDriverListableForCustomer` (called by `CustomerBooking`) | invariant "CUSTOMER VEHICLE-LIST RULE (A5), behaviour" (every condition tested alone) + browser test |
| A6 | **Driver load list / broadcast** (`isDriverBroadcastEligible`): KYC Approved, not blacklisted, hasn't declined, capacity window (load … load + 5,000 kg), GPS fix within 24 h and within 30 km of pickup, no availability conflict. Online status is deliberately NOT checked. | app `isDriverBroadcastEligible` | invariant "DRIVER BROADCAST RULE (A6), behaviour" |
| A7 | The server's ring (`onDirectRequestBroadcast` and the escalation waves) applies the same conflict rule through `hasLoadConflict` / `getBookingWindow` — a **mirrored copy**, fixed 2026-11-03 (it had the old `hours:0 → no window` bug and rang busy drivers). | fns | invariant "SERVER ring availability" (equivalence on 400 random cases) · scan finding `ring-busy-driver` |
| A9 | **ONE ACCEPT**: a driver whose app is OPEN on its Home screen gets the in-app card + sound only (no ring push, no full-screen ring, no LoadWatcher target); a driver whose app is killed / in background / on another screen gets the ring. The app stamps `appForegroundAt` every 15 s while Home is open and clears it when hidden; the server treats a stamp under 30 s old as "open". No / old stamp = ring (fail-safe). | app `DriverApp` (`APP_OPEN_BEAT_MS`), fns `isAppOpenNow` in `onDirectRequestBroadcast` + escalation | invariant "ONE ACCEPT" + real-function run against fake Firebase |
| A8 | Fewer than 3 vehicle categories nearby → the list climbs to the next tiers (`padVehicleCategories`). | app | text invariants |

## 2. Fares

| # | Rule | Where | Pinned by |
|---|---|---|---|
| F1 | Resolution order: Admin's saved rate for this vehicle+route → scaled by Admin's other-vehicle ratio on the same route → master formula. | app `resolveFareForCapacity` | invariants (fares) |
| F2 | Route matching is by **coordinates first** (radius 25 km, growing to 60 km on long routes), place-name text only as fallback — for exact AND scaled rates. | app `getAdminRouteOverride`, `findExactAdminRoute`, `getRouteScaleRatio` | invariant "derived (scaled) Admin rate matches by COORDINATES" |
| F3 | In-city = master formula × price corrector (5 % under Porter at 13 km); outstation = `priceOutstation` curve; a bigger vehicle is never cheaper than a smaller one; fares never fall as diesel rises. | app `calculateFare`, `priceOutstation`, `enforceMonotonicFares` | invariant "FARE ENGINE, correctness + golden grid": Porter anchors, monotonic by tier / diesel / return %, and all 528 prices equal `scripts/golden/fares.json` |
| F3b | **KNOWN OPEN ISSUE** (found 2026-11-03 by that check): outstation fares for vehicles above 5 t FALL between ~94 km and ~108–130 km (7 t up to ₹438, 18 t ₹1,204, 30 t ₹1,768, uncapped ₹2,364 cheaper). Owner decision pending; listed on every scan from `scripts/knownIssues.json`; the check caps the dip at its recorded size so it cannot get worse. | app `rawOutstationValue` | invariant (dip cap) · `scripts/knownIssues.json` |
| F4 | Diesel baseline ₹98/L; live price in `settings/main.dieselPricePerLitre` adds `km × Δprice ÷ tier mileage` to every formula/scaled fare. | app `DIESEL_*`, `calculateFare` | invariants |
| F5 | **Saved Admin rates follow diesel automatically**: each stores `dieselAtSave`; the root adds `km × (live − dieselAtSave) ÷ mileage`. Unstamped rates stand at `settings/main.ratesDieselBase`. | app `applyDieselToSavedRates` | invariant "saved Admin rates FOLLOW diesel" |
| F6 | **Round trip** fare = one-way + return, where return = Admin's saved return rate for the swapped route, else one-way less Admin's `returnPct` (15). No halting charge. | app `CustomerBooking`, `completeBooking` | invariants |
| F7 | A Round trip is **never** discounted a second time by the driver-side "Return Load" rule, and finishing one does not start Return-Load mode. | app `driverRespondBooking`, `completeBooking` | invariant "Round trip is never discounted a second time" |
| F8 | Outlier fares (one vehicle priced wildly off its siblings) are corrected for display only. | app `findFareOutliers`, `interpolateOutlierFare` | invariants |
| F10 | Admin rate resolution: a saved rate for this vehicle + zone + direction, matched by coordinates (text fallback), wins; km beyond its distance add its per-km; other direction / vehicle / far places never match; else the other vehicles' ratio scales the formula; else the plain formula. | app `getAdminRouteOverride`, `getRouteScaleRatio`, `resolveFareForTier` | invariant "ADMIN RATE RESOLUTION, behaviour" |
| F9 | Admin Rate Calculator suggestion includes live diesel; an existing saved rate shows as it stands today. | admin `AdminRateCalculator` | invariant "diesel reaches EVERY fare" |
| F10 | Admin Rate Calculator has a read-only **Round trip** column = one-way + return (saved return rate for the swapped route, else one-way less `returnPct`) — the same number a customer pays (F6). Never saved; hidden on the swapped (return) side. | admin `AdminRateCalculator` (`roundTripTotal`) | invariant "handwritten note 2026-11-03" |

## 3. Booking input

| # | Rule | Where | Pinned by |
|---|---|---|---|
| B1 | Weight: kg 3–5 digits; ton ≤ 2 integer + 3 decimal digits; **hard cap 35,000 kg**; weight is always saved in kg. | app `getWeightInputChange`, `isWeightValid` | behaviour invariants |
| B2 | Calendar days are the device's LOCAL day (`localDateKey`), never UTC. | app, admin | invariant "calendar days are the device's LOCAL day" |
| B3 | Advance booking: date + time slot, per-category minimum notice (>8 t 3 h, ≥3 t 2 h, else 1 h). | app `minAdvanceNoticeHours`, `TimeSlotModal` | invariants |
| B4 | Driver KYC is mandatory for every field except dimensions (`DRIVER_KYC_FIELDS`). | app | behaviour invariants |
| B5 | **Pickup/Drop suggestions come NEAREST FIRST, in ascending km, each showing its km** (owner 2026-11-03 city-first, replaced 2026-11-04): server `searchPlaces` sends the reference point (the customer for Pickup, the pickup for Drop) as `origin` and asks Google five areas -- tight ~13 km, city ~39 km, region ~130 km, state ~350 km, anywhere -- merges without duplicates, keeps the closest 3 of each distance band (≤15, ≤40, ≤150, ≤400, farther km) so far places are not crowded out, caps at 10 and sorts ascending by `distanceMeters` (`distanceKm` in the result). "Kudalwadi" = the one near you, then the ~120 km one, then the ~350 km one. With no known position: Google's own order, no km. The in-browser fallback also passes `origin` and sorts the same way (`sortPredictionsNearestFirst`). Needs `firebase deploy --only functions` (hosting alone shows the old order, without km). | fns/`functions/addressLang.js` `searchPlaces`, `rankNearestFirst`; app `LocationField` (`biasLat`/`biasLng`, `data-suggestion-km`) | invariants "PICKUP/DROP SUGGESTIONS NEAREST FIRST" + "handwritten note 2026-11-03" |
| B6 | **Pickup/Drop mic works IN the app** (owner 2026-11-03, rebuilt 2026-11-04). The icon always shows on an empty box. Tapping it opens a **listening sheet** (`VoiceListeningSheet`, portal to `<body>`): preparing → listening (pulsing rings, equalizer, LIVE transcript) → heard (tick, text fills the box) or an error ("mic is off for this app" with how to turn it on, or "didn't hear anything"; Try again / Type instead). Engine order (`src/speechInput.js`): the app's own native speech plugin `@capacitor-community/speech-recognition` (Android SpeechRecognizer; **needs the native build** that contains the plugin + RECORD_AUDIO) → the browser's Web Speech API → the keyboard's own mic with a visible hint (`speechRecognitionBroken` remembers a phone that cannot do speech). Hindi / Marathi / English-India. Hosting can be deployed BEFORE the native build: the old app simply uses the Web / keyboard path. | app `LocationField`, `VoiceListeningSheet`; `src/speechInput.js`; `android/*capacitor*.gradle` | invariant "PICKUP/DROP MIC works IN the app" |
| B7 | The booked-vehicle "how far" tile shows the **real road distance** (same as the map below it); the x1.35 straight-line guess is only the fallback. | app `BookedVehiclePanel` | same |
| B8 | **"Not seeing the right vehicle? Click here" — 10-minute no-call timer** (owner 2026-11-03): after the tap the customer sees "Our team will call you shortly"; if Admin has NOT contacted them within 10 min (Admin tapped Call on that request, sent the fare, or marked it handled → `contactedAt` / `status` ≠ pending on the request), the line becomes "We can't find a driver for you at the moment." If Admin contacts them later it goes back to the first line. The customer's app reads only its OWN request (rules); if that read fails the plain 10-minute timer still runs. Current AND Advance (one shared screen). | app `UNMATCHED_NO_CALL_MS`, `unmatchedRequestStage`, `CustomerBooking`; Admin `markRequestContacted`; `firestore.rules` `unmatchedVehicleRequests` read | invariant "UNMATCHED 10-MINUTE TIMER" |

## 4. Trip, OTP and money

| # | Rule | Where | Pinned by |
|---|---|---|---|
| T1 | The pickup OTP is made by the **server** when the booking turns Ongoing (`issuePickupOtp`); nobody's phone writes it; 10 wrong guesses lock the check for 10 min. | fns `issuePickupOtp`, `verifyPickupOtp`, `functions/otp.js`; rules `bookingOtps` | invariant "pickup OTP is made by the SERVER" · scan finding `otp-missing` |
| T2 | Halting: free for `includedDays` (1 in city; `ceil(km/500)+1` outstation), then a fixed ₹/day per vehicle (500 if the vehicle is unknown); a started 24 h block counts as a day. | app `haltOf`, `includedDays`, `daysUsed`, `HALT_PER_DAY_BY_MAXKG` | invariant "TRIP MONEY, behaviour" |
| T3 | Bill = fare − return discount + halting + ONLY the accepted extras. | app `buildBill` | invariant "TRIP MONEY, behaviour" |
| T4 | A driver's own session may only LOWER the bonus; wallet / held credit are locked; withdrawals ≤ bonus; money taps cannot double-fire. | rules `drivers`; app `claimMoneyTap` | invariants + `scripts/rulesTest/` |
| T5 | A Return-Load accept may only be a discount (fare never higher; originalFare = old fare). | rules `bookings` | `scripts/rulesTest/claim.mjs` |

## 4b. Admin panel (owner 2026-11-03, handwritten note)

| # | Rule | Where | Pinned by |
|---|---|---|---|
| M1 | Admin → Drivers: KYC **Incomplete** and Status **Off duty** lists, and the **Uninstalled** page, each have one bulk WhatsApp button (MSG91 templates `driver_kyc_incomplete` / `driver_off_duty` / `driver_reinstall_offer`); a driver is messaged at most once per day; the count shows first. | admin `AdminDriverList` (`msgKind`), `AdminFleet` (`reinstallUnsent`); fns `sendBulkDriverWhatsApp` | invariant "handwritten note 2026-11-03" |
| M2 | Change Log opens with open + recently fixed entries; older fixed ones sit behind "Old changes (N)" (search / # jump / type filter still reach them). Nothing is deleted. | admin `AdminBugTracker` (`showOld`) | same |
| M3 | Alerts live INSIDE the Notify tab (two-sided switch); there is no separate Alerts tab button; `onNavigate("alerts")` still opens the Alerts side. | admin `AdminPanel` | same |

| M4 | Admin Live Dashboard map (owner 2026-11-03, asked again explicitly): every located vehicle is a plain coloured truck (no circle round it); a vehicle on an Ongoing trip that has not started loading shows its road to the customer's pickup (blue line + dot, `AdminTripRoad`, read-only, uses `useDrivingRoute`). GPS polling itself untouched. | admin `AdminLiveMap` / `AdminTripRoad` | build + invariants |

## 5. Frozen (see CLAUDE.md)

GPS tracking · load ring / notifications (two paths) · `LoadBellButton` · push-token fields. Fingerprinted in the lock so ANY edit is visible.

## 6. The scan itself (`functions/healthAudit.js`, `runDailyHealthCheck`)

Checks on the LIVE data every run: busy-driver rule (A1) · ring helper (A7) · double-booked drivers · stuck / over-72 h trips · unanswered searches ·
missing pickup OTPs · running trips whose driver no longer exists · negative balances · settings out of range (diesel 60–200, returnPct 0–50, commission 0–50) ·
unusable saved rates · withdrawals / recharges / unmatched requests / KYC waiting too long · login test accounts · hosting reachable · proximity maths ·
**deployment drift** (live build vs functions vs the latest commit, or built from uncommitted code).
Change detection (against the previous scan): live build commit · functions commit · every rule/function/file fingerprint added/changed/removed · settings values.
Results: `systemHealth/heartbeat` (tile), `systemHealth/changeFeed`, `systemHealth/baseline`, Change Log entries `scan-*`. No names or phone numbers are ever written.

## 7. The guard and the tracking itself

| # | Rule | Where | Pinned by |
|---|---|---|---|
| G1 | A push cannot skip the guard: `.githooks/pre-push` runs `npm run verify:invariants` (installed by `npm run build` / `npm install`); GitHub runs the same on every push (`.github/workflows/verify.yml`); `firebase deploy` of hosting/functions first runs it (and hosting rebuilds, so `dist` is never stale). | `.githooks`, `.github/workflows`, `firebase.json` predeploy, `scripts/installHooks.mjs` | invariant "FULL CODE INVENTORY" (the guard files are fingerprinted) |
| G2 | EVERY tracked file is fingerprinted and the big sources are split into every top-level declaration; a comment edit changes nothing, any code edit changes exactly its unit. | `scripts/criteria.mjs` (`collectInventory`) | invariant "FULL CODE INVENTORY" |
| G3 | Open issues the owner has been told about live in `scripts/knownIssues.json`; every scan lists them. | `scripts/knownIssues.json`, `vite.config.js`, scan | scan finding `known-*` |
| G4 | **Instant check**: the moment a trip is accepted, a driver who is ALSO on another running trip raises a critical Change Log entry + a feed line within seconds (read-only, can never block the accept). | `auditTripAccepted`, `otherRunningTripsOfDriver` | invariant "INSTANT + HOURLY WATCH" |
| G5 | **Hourly pulse** (:30 each hour) runs the same scan as 09:00/23:00; the tile treats it as a scan and turns amber after 2.5 h of silence (dead-man). | `hourlyHealthPulse`, `ScanStatusTile` | invariant "INSTANT + HOURLY WATCH" |
| G6 | **Old-build warning**: the Admin tile compares the commit baked into THIS bundle with the live `/build.json` and says "this device runs an older build — tap Refresh". | `ScanStatusTile`, `vite.config.js` (`__BUNDLE_COMMIT__`) | invariant "INSTANT + HOURLY WATCH" |
| G7 | **OTP-missing finding** covers only trips accepted 2 min – 23 h ago: the OTP expiry job deletes every OTP after 24 h, so older stuck trips are reported once, as "not started for over 24 h". | `auditLiveData` check 4, `expireOldBookingOtps` | invariant "BUG (found 2026-11-03 from the Admin bug tracker)" |

---

## How to read a scan result
* **CRITICAL** = a rule is broken right now (act today). **HIGH** = wrong but not immediately dangerous. **INFO** = a note / something waiting for a human.
* "The live app is not the latest commit" = fixes exist that are not deployed — the usual cause of "the app went back to its old self".
* "Built from UNCOMMITTED code" = someone edited files on the build machine; those edits are live but not in the repository.
