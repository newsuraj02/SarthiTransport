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

**Booking weight (customer app).** kg input = 3–5 digits; ton input = max 2
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

**Fares.** `calculateFare` (App.jsx): in-city = master formula × `priceCorrectionFactor`
(anchored 5% below Porter at 13 km); outstation = `priceOutstation`, a piecewise
curve from real Porter quotes (500/750/1200/2000/3500/5000 kg, ×0.95), tiers
above 5000 kg scaled from the 5000 curve, with a LIVE running max so a bigger
vehicle is never cheaper than a smaller one at any distance
(`enforceMonotonicFares` is the display backstop in both booking flows).
Diesel baseline ₹98/L; live price in Firestore `settings/main.dieselPricePerLitre`
adds km × Δprice ÷ tier mileage to every fare. Resolution order: admin's saved
route rate → scaled by the admin's other-tier ratio → formula.

**Admin lists** (Drivers tab's 7 sections + search, Customers, Uninstalled, Blocked,
New Registrations): numbered rows; name truncates but icons are never cut; driver
GPS/KYC are compact "GPS"/"KYC" badges (green ok, red not); Call really disables
after a tap (not just greys) and stays disabled until EVERY entry in that list
has been called, then the round resets; double-tapping a disabled Call re-enables
just that entry; called entries sink to the bottom so numbers re-shuffle.
Customers: Call icon per row, status pill (Searching/Ongoing/Completed/Cancelled)
that expands the latest booking, chevron-only details button, sorted by latest
ride, "Redirect to Driver App" WhatsApp (`wa.me`, link carries `?open=driver`).
Alerts → Unmatched load: persistent Call + double-tap too; offline-driver matches
only within the pickup radius (30 km immediate / 50 km advance) with "N km from
Pickup". New Registrations: 7/30/90-day button matching the From/To dates is
highlighted. "Uninstalled" = no sign of life for 14 days (owner 2026-10-27 after
calls found "installed" drivers in it): the NEWEST of `lastActiveAt` (root `App`
stamps it on every app open/foreground for every driver state, at most every 6h),
`lastKnownLocation.updatedAt` and `fcmTokenSavedAt`; `createdAt` only if none
exist (`isLikelyUninstalled`, pinned by a behavior check). The Uninstall bar keeps its name,
labelled "Inactive 14+ days" (Install = "Active in last 14 days"); the Uninstalled page
holds ONLY those drivers. Blocked drivers have their own full-width Live-Map-style
tile + page ("Blocked", with Unblock) on the Live Dashboard (owner 2026-10-27). KYC: Reject needs a second confirm tap; Rejected drivers stay in the
approval queue so a mistaken reject can be reversed.

**Live Dashboard.** First thing at the top: red box "N Direct request(s) from
customer" (pending unmatched loads), tapping it opens Alerts.

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
never set a speed on an individual sound.
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
(pinned by a behavior check).

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

**Working agreement.** Push automatically after build + invariants pass, EXCEPT
GPS/notification-related changes — ask first (owner rule, 2026-10-23). After a
push, give the deploy commands: `git checkout claude/app-from-document-njzc58 &&
git pull && npm run build && firebase deploy --only hosting` (add `,functions`
when `functions/` changed). `scripts/package-lock.json` is permanently untracked
on purpose — the stop-hook nagging about it is expected; leave it alone.
