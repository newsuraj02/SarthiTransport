# Criteria change log

Every change to a rule, condition, function or config file the app depends on, newest last. Written by `npm run criteria:accept`.

## 2026-11-03 -- initial baseline: busy-driver fix, availability rules, fares, rules files, functions
- added: app:parseScheduledFor, app:minAdvanceNoticeHours, app:notificationLockHours, app:estimatedTripHours, app:isBookingRunning, app:getBookingWindow, app:driverIsOnTrip, app:findDriverLoadConflict, app:isDriverRecord, app:isDriverBroadcastEligible, app:nearbyOnlineDrivers, app:nearbyOfflineDrivers, app:padVehicleCategories, app:maxFleetVehicleCapacityKg, app:CURRENT_BID_RADIUS_KM, app:ADVANCE_BID_RADIUS_KM, app:VEHICLE_HEADROOM_KG, app:NEARBY_DRIVER_RADIUS_KM, app:NEARBY_DRIVER_STALE_MS, app:BROADCAST_LOCATION_STALE_MS, app:BROADCAST_WEIGHT_HEADROOM_KG, app:DIRECT_REQUEST_RADIUS_KM, app:DEFAULT_FARE_TIERS, app:DIESEL_BASELINE_PRICE_PER_LITRE, app:DIESEL_MILEAGE_BY_TIER_MAX_KG, app:calculateFare, app:priceOutstation, app:priceCorrectionFactor, app:findFareTier, app:vehicleForWeight, app:getAdminRouteOverride, app:findExactAdminRoute, app:getRouteScaleRatio, app:resolveFareForCapacity, app:resolveFareForTier, app:applyDieselToSavedRates, app:enforceMonotonicFares, app:findFareOutliers, app:interpolateOutlierFare, app:zoneFor, app:routeMatchRadiusKm, app:ROUTE_MATCH_RADIUS_KM, app:KM_PER_DAY, app:haltPerDayFor, app:includedDays, app:daysUsed, app:haltOf, app:buildBill, app:isReturnLoadFor, app:markReturnModePatch, app:RETURN_RULES, app:RETURN_HOURS, app:MAX_BOOKING_WEIGHT_KG, app:getWeightInputChange, app:isWeightValid, app:localDateKey, app:isFutureAdvance, app:isLikelyUninstalled, app:DRIVER_KYC_FIELDS, app:getKycMissingFromValues, app:getDriverKycMissing, app:isDriverKycComplete, app:settlePendingRingAction, fns:notificationLockHours, fns:getBookingWindow, fns:hasLoadConflict, fns:haversineKm, fns:pinAuthEmail, fns:BROADCAST_WEIGHT_HEADROOM_KG, fn:sendBulkDriverWhatsApp, fn:ringAck, fn:onDirectRequestBroadcast, fn:onBookingTaken, fn:escalateUnmatchedBookings, fn:onCustomerBookingUpdate, fn:sendAdminNotification, fn:expireOldAdminNotifications, fn:notifyForceUpdate, fn:expireOldBookingOtps, fn:verifyPickupOtp, fn:issuePickupOtp, fn:mintLocationServiceToken, fn:classifyKycPhoto, fn:sendTestRing, fn:creditDriverReferral, fn:resolveChangeLogEntry, fn:initiateMaskedCall, fn:resetPinAfterPhoneVerify, fn:checkMobileRegistered, fn:createCsvDownloadLink, fn:dailyHealthCheckMorning, fn:dailyHealthCheckNight, fn:runHealthCheckNow, fn:getAddress, fn:searchPlaces, fn:getPlace, file:firestore.rules, file:storage.rules, file:firebase.json, file:index.html, file:public/service-worker.js, file:functions/otp.js, file:functions/ringText.js, file:functions/addressLang.js, file:functions/healthAudit.js, file:functions/package.json, file:capacitor.config.ts, file:capacitor.admin.config.ts, file:android/app/src/main/AndroidManifest.xml, file:android-admin/app/src/main/AndroidManifest.xml, file:src/firebaseClient.js, file:src/firestoreStore.js

## 2026-11-03 -- ring: busy-driver rule fixed on the server (hours:0 bug) + ONE ACCEPT (no ring while the driver's app is open on Home; app heartbeat appForegroundAt)
- changed: fns:getBookingWindow, fns:hasLoadConflict, fn:onDirectRequestBroadcast

## 2026-11-03 -- criteria list widened: server ring helpers/constants (escalateOneBooking, isAppOpenNow, ring push senders, timings) and the app-open heartbeat interval are now fingerprinted
- added: app:APP_OPEN_BEAT_MS, fns:parseScheduledFor, fns:estimatedTripHours, fns:isBookingRunning, fns:BROADCAST_LOCATION_STALE_MS, fns:DIRECT_REQUEST_RADIUS_KM, fns:APP_OPEN_WINDOW_MS, fns:isAppOpenNow, fns:escalateOneBooking, fns:ESCALATION_RADII_KM, fns:ESCALATION_FIRST_NUDGE_SEC, fns:ESCALATION_LOCATION_STALE_MS, fns:WATCHER_BACKUP_DELAY_MS, fns:RING_RETRY_DELAYS_MS, fns:sendDirectRequestAlert, fns:sendDirectRequestRingAlert

## 2026-11-03 -- guard made unavoidable (pre-push hook, deploy-time verify, GitHub Actions) + FULL code inventory: every tracked file and every top-level declaration is now fingerprinted
- changed (2): file:firebase.json, file:functions/healthAudit.js
- added (905): code:.env.example, code:.firebaserc, code:.githooks/pre-push, code:.github/workflows/build-apna-native.yml, code:.github/workflows/build-capacitor-admin.yml, code:.github/workflows/build-capacitor.yml, code:.github/workflows/build-twa.yml, code:.github/workflows/verify.yml, code:.gitignore, code:CLAUDE.md, code:DEPLOYMENT.md, code:PLAY_STORE_LISTING.md, code:README.md, code:TESTING_GUIDE.md, code:android-admin/.gitignore, code:android-admin/app/.gitignore, code:android-admin/app/build.gradle, code:android-admin/app/capacitor.build.gradle, code:android-admin/app/proguard-rules.pro, code:android-admin/app/src/main/AndroidManifest.xml, code:android-admin/app/src/main/java/com/apnatransport/admin/AppUpdateBridgePlugin.java, code:android-admin/app/src/main/java/com/apnatransport/admin/FusedLocationBridgePlugin.java, code:android-admin/app/src/main/java/com/apnatransport/admin/LocationBridgePlugin.java, code:android-admin/app/src/main/java/com/apnatransport/admin/MainActivity.java, code:android-admin/app/src/main/java/com/apnatransport/admin/SettingsBridgeActivity.java, code:android-admin/app/src/main/java/com/apnatransport/admin/SettingsBridgePlugin.java, code:android-admin/app/src/main/res/drawable-land-hdpi/splash.png, code:android-admin/app/src/main/res/drawable-land-mdpi/splash.png, code:android-admin/app/src/main/res/drawable-land-xhdpi/splash.png, code:android-admin/app/src/main/res/drawable-land-xxhdpi/splash.png, code:android-admin/app/src/main/res/drawable-land-xxxhdpi/splash.png, code:android-admin/app/src/main/res/drawable-port-hdpi/splash.png, code:android-admin/app/src/main/res/drawable-port-mdpi/splash.png, code:android-admin/app/src/main/res/drawable-port-xhdpi/splash.png, code:android-admin/app/src/main/res/drawable-port-xxhdpi/splash.png, code:android-admin/app/src/main/res/drawable-port-xxxhdpi/splash.png, code:android-admin/app/src/main/res/drawable-v24/ic_launcher_foreground.xml, code:android-admin/app/src/main/res/drawable/ic_launcher_background.xml, code:android-admin/app/src/main/res/drawable/splash.png, code:android-admin/app/src/main/res/layout/activity_main.xml, ... +865 more (see git diff of scripts/criteria.lock.json)

## 2026-11-03 -- correctness checks: customer-list predicate refactor (isDriverListableForCustomer), fare engine golden grid + property tests, admin-rate/trip-money/broadcast behaviour tests, known-issues ledger carried in build.json, contracts-coverage check
- changed (9): file:functions/healthAudit.js, code:docs/SYSTEM_CONTRACTS.md, code:functions/healthAudit.js#exportsList, code:functions/index.js#other, code:functions/index.js#runDailyHealthCheck, code:scripts/verifyInvariants.mjs#imports, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#CustomerBooking, code:vite.config.js
- added (6): code:scripts/fareEngine.mjs, code:scripts/golden/fares.json, code:scripts/knownIssues.json, code:scripts/updateGolden.mjs, code:functions/healthAudit.js#auditKnownIssues, code:src/App.jsx#isDriverListableForCustomer

## 2026-11-03 -- instant + hourly watch: auditTripAccepted trigger, hourlyHealthPulse, pushChangeFeed, Admin tile pulse/dead-man + older-build warning (__BUNDLE_COMMIT__), CLAUDE.md/contracts G4-G6
- changed (9): file:functions/healthAudit.js, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:functions/healthAudit.js#exportsList, code:functions/index.js#other, code:functions/index.js#runDailyHealthCheck, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#ScanStatusTile, code:vite.config.js
- added (6): fn:auditTripAccepted, fn:hourlyHealthPulse, code:functions/healthAudit.js#otherRunningTripsOfDriver, code:functions/index.js#pushChangeFeed, code:functions/index.js#fn:auditTripAccepted, code:functions/index.js#fn:hourlyHealthPulse
## 2026-11-03 -- Handwritten note 2026-11-03: admin Round trip column, pickup/drop mic + same-city suggestions (addressLang.searchPlaces), road-distance tile, vehicle circle removed, bigger Round trip bar, admin bulk messages (KYC/off-duty/uninstalled), Change Log old entries tucked, Alerts inside Notify
- changed (15): file:functions/addressLang.js, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:functions/addressLang.js#createAddressService, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#AdminFleet, code:src/AdminPanel.jsx#AdminBugTracker, code:src/AdminPanel.jsx#AdminRateCalculator, code:src/AdminPanel.jsx#AdminDriverList, code:src/AdminPanel.jsx#AdminPanel, code:src/App.jsx#imports, code:src/App.jsx#NearbyDriverMarker, code:src/App.jsx#LocationField, code:src/App.jsx#CustomerBooking, code:src/App.jsx#BookedVehiclePanel

## 2026-11-03 -- Re-accept after merging remote: handwritten note 2026-11-03 changes (admin Round trip column, mic + same-city suggestions, road km, no vehicle circle, bigger Round trip bar, driver bulk messages, Change Log old entries, Alerts in Notify)
- changed (15): file:functions/addressLang.js, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:functions/addressLang.js#createAddressService, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#AdminFleet, code:src/AdminPanel.jsx#AdminBugTracker, code:src/AdminPanel.jsx#AdminRateCalculator, code:src/AdminPanel.jsx#AdminDriverList, code:src/AdminPanel.jsx#AdminPanel, code:src/App.jsx#imports, code:src/App.jsx#NearbyDriverMarker, code:src/App.jsx#LocationField, code:src/App.jsx#CustomerBooking, code:src/App.jsx#BookedVehiclePanel

## 2026-11-03 -- Windows deploy fix: stray root files (100m, firebase-debug.log, .firebase/) no longer enter the code inventory; firebase predeploy uses npm scripts (verify:quiet, stamp:functions); quiet verify mode
- changed (6): file:firebase.json, code:firebase.json, code:package.json, code:scripts/criteria.mjs#listFiles, code:scripts/verifyInvariants.mjs#checks, code:scripts/verifyInvariants.mjs#other

## 2026-11-03 -- Admin live map: no circle round vehicles, booked vehicle road line to pickup; Change Log entries for 3 Nov note
- changed (6): code:docs/SYSTEM_CONTRACTS.md, code:src/AdminPanel.jsx#imports, code:src/AdminPanel.jsx#statusTruckIcon, code:src/AdminPanel.jsx#AdminLiveMap, code:src/App.jsx#BUG_TRACKER_SEED, code:src/App.jsx#useDrivingRoute
- added (1): code:src/AdminPanel.jsx#AdminTripRoad

## 2026-11-03 -- scan fix: otp-missing no longer fires for trips older than the 24 h OTP expiry (false alarm found in the Admin bug tracker); contracts G7
- changed (4): file:functions/healthAudit.js, code:docs/SYSTEM_CONTRACTS.md, code:functions/healthAudit.js#auditLiveData, code:scripts/verifyInvariants.mjs#checks

## 2026-11-03 -- 10-minute no-call timer on 'Not seeing the right vehicle?' (customer shows 'can't find a driver' unless Admin contacted them; Admin Call/Save fare stamp contactedAt; customer may read own unmatched request); contract B8
- changed (9): file:firestore.rules, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:firestore.rules, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#imports, code:src/AdminPanel.jsx#AdminAlerts, code:src/App.jsx#CustomerBooking, code:src/App.jsx#App
- added (2): code:src/App.jsx#UNMATCHED_NO_CALL_MS, code:src/App.jsx#unmatchedRequestStage

## 2026-11-03 -- Pickup/Drop mic always shown; visible keyboard-mic / retry hints instead of silent failure; B6 rewritten
- changed (4): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#LocationField
- added (1): code:src/App.jsx#speechRecognitionBroken

## 2026-11-04 -- Pickup/Drop suggestions nearest-first with km (origin + 5 areas + band ranking, replaces the <3 local rule); contract B5 rewritten
- changed (6): file:functions/addressLang.js, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:functions/addressLang.js#createAddressService, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#LocationField
- added (2): code:src/App.jsx#sortPredictionsNearestFirst, code:src/App.jsx#formatSuggestionKm

## 2026-11-04 -- In-app Pickup/Drop mic: native speech plugin (@capacitor-community/speech-recognition) + src/speechInput.js engine chain + VoiceListeningSheet UI; cap sync gradle files; contract B6
- changed (9): code:CLAUDE.md, code:android/app/capacitor.build.gradle, code:android/capacitor.settings.gradle, code:docs/SYSTEM_CONTRACTS.md, code:package.json, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#imports, code:src/App.jsx#LocationField, code:src/index.css
- added (2): code:src/App.jsx#VoiceListeningSheet, code:src/speechInput.js

## 2026-11-04 -- Admin Live Map: trip routes + ride detail card (additive; AdminLiveMap GPS code untouched); contract M1; held for owner go-ahead before push
- changed (4): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#AdminLiveMap
- added (7): code:src/AdminPanel.jsx#TRIP_ROUTE_CACHE, code:src/AdminPanel.jsx#MAX_TRIP_ROUTES_ON_MAP, code:src/AdminPanel.jsx#tripsOnMap, code:src/AdminPanel.jsx#useTripRoute, code:src/AdminPanel.jsx#tripPhase, code:src/AdminPanel.jsx#AdminTripRouteLine, code:src/AdminPanel.jsx#AdminTripDetailCard

## 2026-11-04 -- Windows fix: the mic invariant loads src/speechInput.js through a file:// URL (a plain C:\ path breaks ESM import on Windows) and says 'run npm install' if the speech plugin is missing
- changed (2): code:scripts/verifyInvariants.mjs#imports, code:scripts/verifyInvariants.mjs#checks

## 2026-11-04 -- Microphone removed completely (button, sheet, speech engine, plugin, gradle); contract B6 now says NO microphone
- changed (9): code:CLAUDE.md, code:android/app/capacitor.build.gradle, code:android/capacitor.settings.gradle, code:docs/SYSTEM_CONTRACTS.md, code:package.json, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#imports, code:src/App.jsx#LocationField, code:src/index.css
- removed (3): code:src/App.jsx#VoiceListeningSheet, code:src/App.jsx#speechRecognitionBroken, code:src/speechInput.js

## 2026-11-04 -- Customer booking: est. km + Enter Weight boxes removed; Pickup+Drop lead straight to the vehicle list (no capacity window); booking stores tapped vehicle capacity as weight + weightIsCapacity; Admin unmatched card copes with no weight; contracts A5/B1, CLAUDE.md
- changed (7): code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#AdminAlerts, code:src/App.jsx#isDriverListableForCustomer, code:src/App.jsx#CustomerBooking, code:src/App.jsx#BookedVehiclePanel, code:src/App.jsx#App

## 2026-11-04 -- CLAUDE.md: restored the nearest-first suggestions paragraph (silently lost by my earlier mic-removal edit), added the no-weight-box paragraph, Live Map marked pushed
- changed (1): code:CLAUDE.md

## 2026-11-04 -- WHO GETS THE BELL: duty-on only (no GPS/radius/weight), picked category +2, one rule in functions/tripLock.js for both rings; customer list = duty on (km only when GPS on, else 'Location off'); padVehicleCategories + old radius constants removed; contracts A5/A6
- changed (16): app:isDriverBroadcastEligible, fns:escalateOneBooking, fn:onDirectRequestBroadcast, fn:escalateUnmatchedBookings, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:functions/index.js#other, code:functions/index.js#fn:onDirectRequestBroadcast, code:functions/index.js#escalateOneBooking, code:functions/index.js#fn:escalateUnmatchedBookings, code:scripts/criteria.mjs#BLOCKS, code:scripts/criteria.mjs#FILES, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#isDriverListableForCustomer, code:src/App.jsx#isDriverBroadcastEligible, code:src/App.jsx#CustomerBooking
- added (12): app:ringCategoryIndexOfCapacity, app:ringCategoryIndexOfLoad, app:RING_CATEGORIES_ABOVE, app:hasFreshLocation, fns:ESCALATION_ROUNDS, file:functions/tripLock.js, code:functions/index.js#ESCALATION_ROUNDS, code:src/App.jsx#RING_CATEGORIES_ABOVE, code:src/App.jsx#ringCategoryIndexOfCapacity, code:src/App.jsx#ringCategoryIndexOfLoad, code:src/App.jsx#hasFreshLocation, code:functions/tripLock.js
- removed (18): app:padVehicleCategories, app:BROADCAST_LOCATION_STALE_MS, app:BROADCAST_WEIGHT_HEADROOM_KG, app:DIRECT_REQUEST_RADIUS_KM, fns:BROADCAST_WEIGHT_HEADROOM_KG, fns:BROADCAST_LOCATION_STALE_MS, fns:DIRECT_REQUEST_RADIUS_KM, fns:ESCALATION_RADII_KM, fns:ESCALATION_LOCATION_STALE_MS, code:functions/index.js#DIRECT_REQUEST_RADIUS_KM, code:functions/index.js#BROADCAST_WEIGHT_HEADROOM_KG, code:functions/index.js#BROADCAST_LOCATION_STALE_MS, code:functions/index.js#ESCALATION_RADII_KM, code:functions/index.js#ESCALATION_LOCATION_STALE_MS, code:src/App.jsx#DIRECT_REQUEST_RADIUS_KM, code:src/App.jsx#BROADCAST_LOCATION_STALE_MS, code:src/App.jsx#BROADCAST_WEIGHT_HEADROOM_KG, code:src/App.jsx#padVehicleCategories

## 2026-11-04 -- Customer vehicle list order: GPS-on vehicles first, then GPS-off; inside each group category then nearest (owner: online first then offline); invariant LIST ORDER
- changed (4): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#CustomerBooking

## 2026-11-04 -- Customer vehicle list: must be within 30 km (Current) / 50 km (Advance) of the pickup by last known location (GPS off/stale still listed; never-located not listed); card shows last seen; GPS-on first order kept; contract A5
- changed (5): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#isDriverListableForCustomer, code:src/App.jsx#CustomerBooking

## 2026-11-04 -- Bell radius: the load bell now uses the same 30 km (Current) / 50 km (Advance) pickup radius as the customer vehicle list, by last known location; never-located drivers are not rung (owner 2026-11-04 'apply the same radius to the bell')
- changed (11): app:isDriverBroadcastEligible, fns:escalateOneBooking, fn:onDirectRequestBroadcast, file:functions/tripLock.js, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:functions/index.js#fn:onDirectRequestBroadcast, code:functions/index.js#escalateOneBooking, code:functions/tripLock.js, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#isDriverBroadcastEligible

## 2026-11-04 -- Customer vehicle list shown in capacity categories 500..32000 kg (+Above 32000) with headings; display only (owner 2026-11-04)
- changed (5): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/criteria.mjs#BLOCKS, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#CustomerBooking
- added (8): app:CUSTOMER_LIST_CATEGORY_KG, app:customerListCategoryIndex, app:customerListCategoryLabel, app:groupByCustomerListCategory, code:src/App.jsx#CUSTOMER_LIST_CATEGORY_KG, code:src/App.jsx#customerListCategoryIndex, code:src/App.jsx#customerListCategoryLabel, code:src/App.jsx#groupByCustomerListCategory

## 2026-11-04 -- Category booking: tap selects the whole category, rings category + 2 above using the list's 12 categories (listCategory), top fare, fastest accept wins note (owner 2026-11-04)
- changed (9): app:ringCategoryIndexOfCapacity, app:ringCategoryIndexOfLoad, file:functions/tripLock.js, code:functions/tripLock.js, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#ringCategoryIndexOfCapacity, code:src/App.jsx#ringCategoryIndexOfLoad, code:src/App.jsx#CustomerBooking, code:src/App.jsx#App

## 2026-11-04 -- Category booking docs (contracts A5/A6, CLAUDE.md): tap selects whole category; ring uses the list's 12 categories via listCategory (owner 2026-11-04)
- changed (2): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md

## 2026-11-04 -- One 'Book this category' button per category; vehicle rows info only; card selection / See all removed (owner 2026-11-04 'single button for each and every category')
- changed (4): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#CustomerBooking

## 2026-11-04 -- CLAUDE.md pointer: card tap / Book this vehicle / See all vehicles replaced by the per-category button
- changed (1): code:CLAUDE.md

## 2026-11-04 -- Map N min pill restored on the nearest GPS-on listed vehicle (owner 2026-11-04)
- changed (4): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#CustomerBooking

## 2026-11-04 -- One fixed 'Book now' bar: select a category then press it; per-category buttons removed (owner 2026-11-04)
- changed (4): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#CustomerBooking

## 2026-11-04 -- Customer list = one row per category (icon, weight, vehicle name, top fare, N min); per-vehicle cards removed (owner 2026-11-04)
- changed (4): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#CustomerBooking

## 2026-11-04 -- Category names on the customer list rows: 3 wheeler, Tata Ace, Pickup, Pickup 8ft, Tata 407, 17ft Eicher, 20ft container, 6 wheeler, 22ft/24ft truck, 10 wheeler, 32ft container, 12/14/16 wheeler, 32t+ truck (owner 2026-11-04)
- changed (5): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/criteria.mjs#BLOCKS, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#CustomerBooking
- added (4): app:CUSTOMER_LIST_CATEGORY_NAMES, app:customerListCategoryName, code:src/App.jsx#CUSTOMER_LIST_CATEGORY_NAMES, code:src/App.jsx#customerListCategoryName

## 2026-11-04 -- Vehicle illustrations (src/vehicleArt.jsx) on the category rows + large on the picked row; category names translated to hi / mr (owner 2026-11-04)
- changed (9): app:CUSTOMER_LIST_CATEGORY_NAMES, app:customerListCategoryName, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#imports, code:src/App.jsx#CUSTOMER_LIST_CATEGORY_NAMES, code:src/App.jsx#customerListCategoryName, code:src/App.jsx#CustomerBooking
- added (1): code:src/vehicleArt.jsx

## 2026-11-04 -- Mature vehicle art; body size beside the picked illustration (from VEHICLE_MODEL_SPECS); lookupVehicleModelSpec now picks the longest matching key (16 wheeler was matching 6 wheeler)
- changed (6): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/criteria.mjs#BLOCKS, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#lookupVehicleModelSpec, code:src/App.jsx#CustomerBooking
- added (24): app:CUSTOMER_LIST_CATEGORY_DIM_MODELS, app:CUSTOMER_LIST_3_WHEELER_DIMS, app:CUSTOMER_LIST_DIM_LABELS, app:formatDimFeet, app:customerListCategoryDims, code:src/App.jsx#CUSTOMER_LIST_CATEGORY_DIM_MODELS, code:src/App.jsx#CUSTOMER_LIST_3_WHEELER_DIMS, code:src/App.jsx#CUSTOMER_LIST_DIM_LABELS, code:src/App.jsx#formatDimFeet, code:src/App.jsx#customerListCategoryDims, code:src/vehicleArt.jsx#imports, code:src/vehicleArt.jsx#VEHICLE_ART_SPECS, code:src/vehicleArt.jsx#INK, code:src/vehicleArt.jsx#GLASS_TOP, code:src/vehicleArt.jsx#GLASS_BOT, code:src/vehicleArt.jsx#OUTLINE, code:src/vehicleArt.jsx#GROUND, code:src/vehicleArt.jsx#WHEEL_R, code:src/vehicleArt.jsx#WHEEL_Y, code:src/vehicleArt.jsx#FLOOR, code:src/vehicleArt.jsx#CAB_BOTTOM, code:src/vehicleArt.jsx#DEPTH, code:src/vehicleArt.jsx#RISE, code:src/vehicleArt.jsx#CategoryVehicleArt
- removed (1): code:src/vehicleArt.jsx

## 2026-11-04 -- Bold row icons; 16-wheeler capacity repair callable + Admin Settings card + vehicleSpecRepair.js (owner 2026-11-04 'fix this too')
- changed (10): file:src/firebaseClient.js, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:functions/index.js#other, code:scripts/criteria.mjs#FILES, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#imports, code:src/AdminPanel.jsx#AdminSettings, code:src/App.jsx#CustomerBooking, code:src/vehicleArt.jsx#CategoryVehicleArt
- added (5): fn:repairSixteenWheelerCapacity, file:functions/vehicleSpecRepair.js, code:functions/index.js#fn:repairSixteenWheelerCapacity, code:src/firebaseClient.js#repairSixteenWheelerCapacity, code:functions/vehicleSpecRepair.js

## 2026-11-04 -- Row vehicle icon thickness matched to the picked icon (strokes 1.7x, no extra tyre / chassis bulk) (owner 2026-11-04)
- changed (2): code:CLAUDE.md, code:src/vehicleArt.jsx#CategoryVehicleArt

## 2026-11-04 -- Picked row shows the vehicle once: small icon hidden while the big picture is shown (owner 2026-11-04)
- changed (4): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#CustomerBooking

## 2026-11-04 -- More realistic vehicle art: far-side tyres, twin rear tyres, tread, mudguard lip, mud flaps, fuel tank, reflective tape (owner 2026-11-04 'tyre seems odd, only 2 tyres')
- changed (4): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/vehicleArt.jsx#CategoryVehicleArt

## 2026-11-04 -- Realistic Indian 3 wheeler drawing (ThreeWheelerArt) in the same style as the rest of the set (owner 2026-11-04)
- changed (5): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/vehicleArt.jsx#VEHICLE_ART_SPECS, code:src/vehicleArt.jsx#CategoryVehicleArt
- added (1): code:src/vehicleArt.jsx#ThreeWheelerArt

## 2026-11-04 -- 3 wheeler redrawn with real proportions and details: tall narrow cab, rounded nose + headlamp, mudguard, engine bay, exhaust, leaf spring, low cargo deck (owner 2026-11-04 'more realistic')
- changed (3): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:src/vehicleArt.jsx#ThreeWheelerArt

## 2026-11-04 -- Added the 3500 kg (14ft Eicher) and 25000 kg (12/14 wheeler) categories (16000 already existed): 14 limits + above, 15 names/drawings/size models, 32000 = 16 wheeler; ring table + app mirror; bookings store listCategoryKg and old-style listCategory indices are translated through the previous table (owner 2026-11-04)
- changed (16): app:ringCategoryIndexOfLoad, app:CUSTOMER_LIST_CATEGORY_KG, app:CUSTOMER_LIST_CATEGORY_NAMES, app:CUSTOMER_LIST_CATEGORY_DIM_MODELS, file:functions/tripLock.js, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:functions/tripLock.js, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#ringCategoryIndexOfLoad, code:src/App.jsx#CUSTOMER_LIST_CATEGORY_KG, code:src/App.jsx#CUSTOMER_LIST_CATEGORY_NAMES, code:src/App.jsx#CUSTOMER_LIST_CATEGORY_DIM_MODELS, code:src/App.jsx#CustomerBooking, code:src/App.jsx#App, code:src/vehicleArt.jsx#VEHICLE_ART_SPECS
- added (2): code:src/App.jsx#LEGACY_CUSTOMER_LIST_CATEGORY_KG, code:src/App.jsx#customerListCategoryLimitKg

## 2026-11-04 -- Est. km at the left and Change pickup / drop at the right of one row above the list; blue note box removed (owner 2026-11-04)
- changed (4): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#CustomerBooking

## 2026-11-04 -- Owner 2026-11-04: bigger 'Distance: N km' label; REMOVED 'Not seeing the right vehicle? Click here' and everything tied to it (customer button + 10-min timer, unmatchedVehicleRequests rules/collection use, Admin dashboard box + Alerts Unmatched load cards, scan unmatched-waiting check, blink CSS)
- changed (16): file:firestore.rules, file:functions/healthAudit.js, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:firestore.rules, code:functions/healthAudit.js#auditLiveData, code:functions/index.js#loadLiveData, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#imports, code:src/AdminPanel.jsx#AdminFleet, code:src/AdminPanel.jsx#AdminAlerts, code:src/AdminPanel.jsx#AdminPanel, code:src/App.jsx#CustomerBooking, code:src/App.jsx#CustomerApp, code:src/App.jsx#App, code:src/index.css
- removed (2): code:src/App.jsx#UNMATCHED_NO_CALL_MS, code:src/App.jsx#unmatchedRequestStage

## 2026-11-04 -- Owner 2026-11-04 (screenshot): customer category rows redesigned in two lines so the kg chip is never cut off (small icon + name + weight chip; N min away + bigger fare underneath)
- changed (4): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#CustomerBooking

## 2026-11-04 -- Owner 2026-11-04: bar renamed 'Book Round trip' and kept visible at all times (z-45, suggestion lists capped above it); MAJOR BUG fix: vehicle list / Drop box no longer appear while Pickup/Drop text is still being typed (typingField)
- changed (5): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#LocationField, code:src/App.jsx#CustomerBooking

## 2026-11-04 -- Owner 2026-11-04: Book Round trip bar only on the main screen (gone once cursor is in Pickup, in Advance, once ticked); Book now bar only with the vehicle list and not while a box has the cursor
- changed (4): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#CustomerBooking

## 2026-11-04 -- Owner 2026-11-04: Book Round trip bar also on the Advance Booking main screen (same rule as Current)
- changed (4): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#CustomerBooking

## 2026-11-05 -- Owner 2026-11-04: Advance Booking is date-only -- Kal / Parso / Day after Parso buttons (hi/mr) replace the date-and-time box; saved at fixed 08:00; availability window unchanged
- changed (4): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#CustomerBooking
- added (3): code:src/App.jsx#ADVANCE_DAY_OFFSETS, code:src/App.jsx#ADVANCE_DEFAULT_TIME, code:src/App.jsx#advanceDayLabel

## 2026-11-05 -- Owner 2026-11-04: Advance day buttons use English equivalents (Tomorrow / Day after tomorrow / In 3 days) in English
- changed (4): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#advanceDayLabel

## 2026-11-05 -- Owner 2026-11-04: Pickup/Drop suggestions replicate Google Maps -- one soft-biased Autocomplete call, Google's own order, no hard boxes, no nearest-first re-sort
- changed (6): file:functions/addressLang.js, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:functions/addressLang.js#createAddressService, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#LocationField
- removed (1): code:src/App.jsx#sortPredictionsNearestFirst

## 2026-11-05 -- Owner 2026-11-04: map pinned (sticky 30vh) once Pickup+Drop are chosen; Advance day buttons pinned under it so they stay visible over the vehicle list
- changed (4): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#CustomerBooking

## 2026-11-05 -- Owner 2026-11-04 (correcting my misreading, which pinned the map): map HIDDEN over the vehicle list (Current) and date step + list (Advance); Advance day buttons disappear once picked, with a date summary + Change
- changed (4): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#CustomerBooking

## 2026-11-05 -- Owner 2026-11-04: selected category moves to the top as a bigger Selected card; recent-trip + trip cards show Pickup/Drop partitioned with a route rail; larger gradient Book now bar
- changed (5): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#imports, code:src/App.jsx#CustomerBooking

## 2026-11-05 -- Owner 2026-11-04: recent-trip cards show locations only (no Pickup/Drop words, no chevron, lighter font); no route card from the vehicle list onwards, only the small Change pickup / drop row
- changed (5): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#imports, code:src/App.jsx#CustomerBooking

## 2026-11-05 -- Owner 2026-11-04: recent-trip cards show the FULL address (no line clamp) in a compact size so three fit in the frame
- changed (3): code:CLAUDE.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#CustomerBooking

## 2026-11-05 -- Owner 2026-11-04: booking-screen map frames a 500 m radius by default (was 1.5 km)
- changed (3): code:CLAUDE.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#NEARBY_MAP_DEFAULT_RADIUS_KM

## 2026-11-05 -- Owner 2026-11-04: Book now is no longer a fixed bar -- it is an inline button directly below the selected category card, other categories follow
- changed (4): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#CustomerBooking

## 2026-11-05 -- Owner 2026-11-04: customer booking UI/UX declared FROZEN (CLAUDE.md section + contracts note + invariant); no code change
- changed (3): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks

## 2026-11-05 -- Owner 2026-11-05: Admin Rate Calculator gets a By km / By ton toggle (tons + rate per ton, route rate = per ton x tons); saved as rateBasis/tons/perTon; customer/driver fares unchanged
- changed (5): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#AdminSavedRoutes, code:src/AdminPanel.jsx#AdminRateCalculator
- added (3): code:src/AdminPanel.jsx#suggestPerTonRate, code:src/AdminPanel.jsx#tonRouteTotal, code:src/AdminPanel.jsx#clampTonsToCapacity

## 2026-11-05 -- Admin Rate Calculator: Market rate change (settings/main.marketAdjustPct) scales formula fares in calculateFare; calculator card + props; invariant + engine export
- changed (12): app:calculateFare, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/fareEngine.mjs, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#imports, code:src/AdminPanel.jsx#AdminRatesDiesel, code:src/AdminPanel.jsx#AdminRouteFares, code:src/AdminPanel.jsx#AdminRateCalculator, code:src/AdminPanel.jsx#AdminPanel, code:src/App.jsx#calculateFare, code:src/App.jsx#App
- added (7): code:src/App.jsx#MARKET_ADJUST_MIN_PCT, code:src/App.jsx#MARKET_ADJUST_MAX_PCT, code:src/App.jsx#MARKET_ADJUST_STEP_PCT, code:src/App.jsx#clampMarketAdjustPct, code:src/App.jsx#currentMarketAdjustPct, code:src/App.jsx#applyMarketAdjustPct, code:src/App.jsx#marketAdjustFactor

## 2026-11-05 -- Market rate change: saved Admin route (and its toll/floor) never scaled in the calculator
- changed (2): code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#AdminRateCalculator

## 2026-11-05 -- Scan alerts settle for real: close-stuck-trips remedy, Resolve re-runs the scan, auto-close, one change entry per day, docs-only drift note, source markers pinned
- changed (13): fn:resolveChangeLogEntry, file:functions/healthAudit.js, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:functions/healthAudit.js#auditLiveData, code:functions/healthAudit.js#auditDeployment, code:functions/healthAudit.js#exportsList, code:functions/index.js#other, code:functions/index.js#RESOLVE_ACTIONS, code:functions/index.js#fn:resolveChangeLogEntry, code:functions/index.js#checkSourceMarkers, code:functions/index.js#runDailyHealthCheck, code:scripts/verifyInvariants.mjs#checks
- added (4): code:functions/healthAudit.js#findStuckTrips, code:functions/healthAudit.js#HOSTING_CRITERIA, code:functions/healthAudit.js#hostingCodeMatches, code:functions/index.js#closeStuckTrips

## 2026-11-05 -- ONE FARE EVERYWHERE: calculator + customer list + booking read buildRouteFareTable; category fare = top tier; calculator no longer has its own formula
- changed (9): app:customerListCategoryName, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/fareEngine.mjs, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#imports, code:src/AdminPanel.jsx#AdminRateCalculator, code:src/App.jsx#customerListCategoryName, code:src/App.jsx#CustomerBooking
- added (4): code:src/App.jsx#buildRouteFareTable, code:src/App.jsx#categoryRouteFare, code:src/App.jsx#categoryTierBounds, code:src/App.jsx#customerCategoriesForTier

## 2026-11-05 -- ONE FARE + ONE DISTANCE everywhere: syncRouteDistance + formatTripKm used by customer/Admin/driver; Return Load no longer changes the fare
- changed (14): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#imports, code:src/AdminPanel.jsx#AdminTripDetailCard, code:src/AdminPanel.jsx#AdminSavedRoutes, code:src/AdminPanel.jsx#AdminRateCalculator, code:src/App.jsx#CustomerBooking, code:src/App.jsx#BookedVehiclePanel, code:src/App.jsx#ActiveRide, code:src/App.jsx#CustomerHistory, code:src/App.jsx#DriverHome, code:src/App.jsx#SetFareForm, code:src/App.jsx#App
- added (3): code:src/App.jsx#syncRouteDistance, code:src/App.jsx#tripKmRounded, code:src/App.jsx#formatTripKm

## 2026-11-05 -- Fare + distance shown in every booking list row (Advance lists, Admin lists, history) via fareKmText
- changed (9): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#imports, code:src/AdminPanel.jsx#AdminBookings, code:src/App.jsx#CustomerHistory, code:src/App.jsx#CustomerApp, code:src/App.jsx#DriverHistory, code:src/App.jsx#DriverApp
- added (1): code:src/App.jsx#fareKmText

## 2026-11-05 -- Ride History card: separator between fare and distance
- changed (2): code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#CustomerHistory

## 2026-11-05 -- ONE WEIGHT CATEGORY SYSTEM: category + kg labels everywhere (bookingCategoryText / vehicleCategoryText / formatKgLabel), booking weight = category limit
- changed (14): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#imports, code:src/AdminPanel.jsx#AdminTripDetailCard, code:src/AdminPanel.jsx#AdminFleet, code:src/AdminPanel.jsx#AdminRateCalculator, code:src/AdminPanel.jsx#AdminDriverList, code:src/AdminPanel.jsx#AdminCustomers, code:src/App.jsx#CustomerBooking, code:src/App.jsx#formatKgLabel, code:src/App.jsx#BookedVehiclePanel, code:src/App.jsx#ActiveRide, code:src/App.jsx#DriverHome
- added (3): code:src/App.jsx#vehicleCategoryText, code:src/App.jsx#bookingCategoryIndex, code:src/App.jsx#bookingCategoryText

## 2026-11-05 -- Admin calculator vehicle picker = the customer's 15 weight categories (categoryTopTier); category helpers exported
- changed (8): app:customerListCategoryLabel, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/fareEngine.mjs, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#imports, code:src/AdminPanel.jsx#AdminRateCalculator, code:src/App.jsx#customerListCategoryLabel
- added (2): code:src/App.jsx#categoryTopTier, code:src/App.jsx#customerListCategoryCount

## 2026-11-05 -- Renamed customer vehicle category 32ft container -> 20 ton container (en; hi/mr: 20 टन कंटेनर); weight limit 20000 kg unchanged
- changed (8): app:CUSTOMER_LIST_CATEGORY_NAMES, app:CUSTOMER_LIST_CATEGORY_DIM_MODELS, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#CUSTOMER_LIST_CATEGORY_NAMES, code:src/App.jsx#CUSTOMER_LIST_CATEGORY_DIM_MODELS, code:src/vehicleArt.jsx#VEHICLE_ART_SPECS

## 2026-11-05 -- Froze fare, distance and vehicle categories (docs/guard only, no code change)
- changed (3): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks

## 2026-11-05 -- Owner 2026-11-05: removed the +2 vehicle-category rule from the ring/list eligibility; RING_CATEGORIES_ABOVE 2 -> 0 (functions/tripLock.js + src/App.jsx mirror): only the category the customer picked is rung
- changed (10): app:RING_CATEGORIES_ABOVE, fns:escalateOneBooking, fn:onDirectRequestBroadcast, file:functions/tripLock.js, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:functions/tripLock.js, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#RING_CATEGORIES_ABOVE, code:src/App.jsx#CustomerBooking

## 2026-11-05 -- Owner 2026-11-05: Meta (Facebook) SDK for app-install ads -- facebook-core dependency, com.facebook.sdk meta-data in the manifest, placeholder App ID / client token in strings.xml (no frozen GPS/ring code touched)
- changed (6): file:android/app/src/main/AndroidManifest.xml, code:CLAUDE.md, code:android/app/build.gradle, code:android/app/src/main/AndroidManifest.xml, code:android/app/src/main/res/values/strings.xml, code:docs/SYSTEM_CONTRACTS.md

## 2026-11-06 -- Owner 2026-11-05: Meta follow-ups -- privacy.html Meta SDK disclosure (EN+HI), terms.html + delete-data.html copied into public/, 1024 icon in meta-pages (static web files only)
- changed (3): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:public/privacy.html
- added (4): code:meta-pages/delete-data.html, code:meta-pages/terms.html, code:public/delete-data.html, code:public/terms.html

## 2026-11-06 -- Owner 2026-11-05 (notification range): first ring = picked category only; escalation rounds ring the picked category up to its limit + 5000 kg (RING_EXTRA_RANGE_KG replaces RING_CATEGORIES_ABOVE; tripLock.js + app mirror; escalateOneBooking passes extended)
- changed (8): app:isDriverBroadcastEligible, fns:escalateOneBooking, file:functions/tripLock.js, code:functions/index.js#escalateOneBooking, code:functions/tripLock.js, code:scripts/criteria.mjs#BLOCKS, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#isDriverBroadcastEligible
- added (7): app:RING_EXTRA_RANGE_KG, app:ringCategoryLimitKg, app:ringCategoryInRange, code:meta-pages/app-icon-1024.png, code:src/App.jsx#RING_EXTRA_RANGE_KG, code:src/App.jsx#ringCategoryLimitKg, code:src/App.jsx#ringCategoryInRange
- removed (2): app:RING_CATEGORIES_ABOVE, code:src/App.jsx#RING_CATEGORIES_ABOVE

## 2026-11-06 -- docs only: ring range wording
- changed (2): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md

## 2026-11-07 -- Owner 2026-11-07: ad-only landing pages public/customer.html + public/driver.html (noindex, unlinked, copied unchanged otherwise)
- added (2): code:public/customer.html, code:public/driver.html

## 2026-11-07 -- Owner 2026-11-07: removed the orange AREAS chips under Pickup/Drop (AREAS + suggestAreas deleted, no suggestions prop on the two LocationFields)
- changed (3): code:CLAUDE.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#CustomerBooking
- removed (2): code:src/App.jsx#AREAS, code:src/App.jsx#suggestAreas

## 2026-11-07 -- Owner 2026-11-07: Set Fare synced with the Admin Rate Calculator (shared By km/By ton + 1-3 km fixed rate helpers); deploy 'dirty' stamp counts only really-deployed files (scripts/dirtyState.mjs)
- changed (12): file:functions/healthAudit.js, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:functions/healthAudit.js#auditDeployment, code:scripts/verifyInvariants.mjs#checks, code:scripts/writeFunctionsStamp.mjs, code:src/AdminPanel.jsx#imports, code:src/AdminPanel.jsx#AdminRateCalculator, code:src/App.jsx#SetFareForm, code:src/App.jsx#DriverApp, code:src/App.jsx#App, code:vite.config.js
- added (5): code:src/App.jsx#suggestPerTonRate, code:src/App.jsx#tonRouteTotal, code:src/App.jsx#clampTonsToCapacity, code:src/App.jsx#routeFixedRate, code:scripts/dirtyState.mjs
- removed (3): code:src/AdminPanel.jsx#suggestPerTonRate, code:src/AdminPanel.jsx#tonRouteTotal, code:src/AdminPanel.jsx#clampTonsToCapacity

## 2026-11-08 -- Owner 2026-11-08: fleet owners -- evaluateNewLoadDriver fleet branch, loadFleetContext in both rings, fleet-aware app mirrors (isDriverRecord, findBookingDriver, isDriverListableForCustomer, isDriverBroadcastEligible, getDriverKycMissing), dispatchFleetTrip + fleetTripAction, fleetVehicles rules, privacy/terms text
- changed (36): app:findDriverLoadConflict, app:isDriverRecord, app:isDriverBroadcastEligible, app:getDriverKycMissing, fns:escalateOneBooking, fn:onDirectRequestBroadcast, file:firestore.rules, file:functions/tripLock.js, file:src/firebaseClient.js, file:src/firestoreStore.js, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:firestore.rules, code:functions/index.js#other, code:functions/index.js#fn:onDirectRequestBroadcast, code:functions/index.js#escalateOneBooking, code:meta-pages/terms.html, code:public/privacy.html, code:public/terms.html, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#imports, code:src/AdminPanel.jsx#AdminPanel, code:src/App.jsx#imports, code:src/App.jsx#isDriverListableForCustomer, code:src/App.jsx#findDriverLoadConflict, code:src/App.jsx#isDriverBroadcastEligible, code:src/App.jsx#getDriverKycMissing, code:src/App.jsx#kycFieldLabel, code:src/App.jsx#DriverOnboarding, code:src/App.jsx#isDriverRecord, code:src/App.jsx#findBookingDriver, code:src/App.jsx#BookedVehiclePanel, code:src/App.jsx#DriverHome, code:src/App.jsx#DriverApp, code:src/App.jsx#App, code:src/firestoreStore.js#imports
- added (40): fn:dispatchFleetTrip, fn:fleetTripAction, code:functions/index.js#loadFleetContext, code:functions/index.js#FLEET_TRIP_PAGE, code:functions/index.js#fleetLinkFor, code:functions/index.js#fn:dispatchFleetTrip, code:functions/index.js#fn:fleetTripAction, code:functions/tripLock.js#RING_CATEGORY_MAX_KG, code:functions/tripLock.js#LEGACY_RING_CATEGORY_MAX_KG, code:functions/tripLock.js#RING_EXTRA_RANGE_KG, code:functions/tripLock.js#RING_RADIUS_KM, code:functions/tripLock.js#categoryIndexOfCapacity, code:functions/tripLock.js#loadCategoryIndex, code:functions/tripLock.js#categoryLimitKg, code:functions/tripLock.js#categoryInRingRange, code:functions/tripLock.js#evaluateFleetOwnerVehicles, code:functions/tripLock.js#evaluateNewLoadDriver, code:functions/tripLock.js#exportsList, code:src/App.jsx#FleetSetup, code:src/App.jsx#FleetAssignSheet, code:src/App.jsx#FleetDispatchSheet, code:src/App.jsx#fleetPseudoDrivers, code:src/App.jsx#allFleetPseudoDrivers, code:src/firebaseClient.js#dispatchFleetTrip, code:src/firestoreStore.js#subscribeWhere, code:functions/fleetDispatch.js, code:public/trip.html, code:src/FleetOwner.jsx#imports, code:src/FleetOwner.jsx#T, code:src/FleetOwner.jsx#digits, code:src/FleetOwner.jsx#newVehicleId, code:src/FleetOwner.jsx#PhotoPick, code:src/FleetOwner.jsx#field, code:src/FleetOwner.jsx#fieldStyle, code:src/FleetOwner.jsx#FleetVehicleForm, code:src/FleetOwner.jsx#FleetSetup, code:src/FleetOwner.jsx#FleetAssignSheet, code:src/FleetOwner.jsx#FleetDispatchSheet, code:src/FleetOwner.jsx#AdminFleetVehicles, code:src/fleetDispatch.js
- removed (1): code:functions/tripLock.js

## 2026-11-08 -- Owner 2026-11-08: sync fleet fields across Driver/Customer/Admin screens (admin trip card + driver lists, customer share text, fleet chip on ride banner)
- changed (5): code:src/AdminPanel.jsx#AdminTripDetailCard, code:src/AdminPanel.jsx#AdminFleet, code:src/AdminPanel.jsx#AdminDriverList, code:src/App.jsx#RideTypeBanner, code:src/App.jsx#ActiveRide
- added (1): code:src/AdminPanel.jsx#driverPlateText

## 2026-11-08 -- Owner 2026-11-08: invariant pinning fleet fields in all three roles
- changed (1): code:scripts/verifyInvariants.mjs#checks

## 2026-11-08 -- Owner 2026-11-08: fleet bookings recognised by owner mobile in cancel/complete/referral (bookingIsMine); fleet vehicle shown in invoice, advance list and Admin lists
- changed (10): code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#AdminFleet, code:src/AdminPanel.jsx#AdminBookings, code:src/AdminPanel.jsx#AdminCallLogs, code:src/AdminPanel.jsx#AdminCustomers, code:src/AdminPanel.jsx#AdminFinance, code:src/App.jsx#CustomerTripSummary, code:src/App.jsx#CustomerApp, code:src/App.jsx#DriverTripSummary, code:src/App.jsx#App
- added (1): code:src/AdminPanel.jsx#fleetTag

## 2026-11-08 -- Owner 2026-11-08: invariant text updated for fleetTag / fleet return-mode guard
- changed (1): code:scripts/verifyInvariants.mjs#checks

## 2026-11-08 -- Owner 2026-11-08: criteria inventory ignores stray *.log / .firebase files (functions/firebase-debug.log blocked a deploy)
- changed (3): code:.gitignore, code:scripts/criteria.mjs#listFiles, code:scripts/verifyInvariants.mjs#checks

## 2026-11-08 -- Owner 2026-11-08: removed a stray extra brace after the Admin Drivers tab line (printed a literal } and an esbuild error)
- changed (2): code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#AdminPanel

## 2026-11-08 -- Owner 2026-11-08: one device per driver (activeSessionId claim + sign-out of the other device)
- changed (5): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#DriverOnboarding, code:src/App.jsx#App
- added (2): code:src/App.jsx#shouldLogOutDriverSession, code:src/App.jsx#newDriverSessionId

## 2026-11-08 -- Owner 2026-11-08: removed the KYC Settings link from the driver home; WhatsApp Support stays centred at the bottom
- changed (4): code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#imports, code:src/App.jsx#DriverHome, code:src/App.jsx#DriverApp

## 2026-11-08 -- CLAUDE.md note for the removed KYC Settings link
- changed (1): code:CLAUDE.md

## 2026-11-08 -- Owner 2026-11-08: removed the Admin Call Logs tab, screen and subscription
- changed (7): code:CLAUDE.md, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#imports, code:src/AdminPanel.jsx#AdminPanel, code:src/App.jsx#EN_LABELS, code:src/App.jsx#MR_LABELS, code:src/App.jsx#App
- removed (1): code:src/AdminPanel.jsx#AdminCallLogs

## 2026-11-08 -- Owner 2026-11-08: bulk WhatsApp reads MSG91's reply honestly and shows the real failure reason (judgeMsg91Response, reason/detail, UI line)
- changed (9): fn:sendBulkDriverWhatsApp, file:src/firebaseClient.js, code:CLAUDE.md, code:functions/index.js#other, code:functions/index.js#fn:sendBulkDriverWhatsApp, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#AdminFleet, code:src/AdminPanel.jsx#AdminDriverList, code:src/firebaseClient.js#sendBulkDriverWhatsApp
- added (2): code:src/AdminPanel.jsx#whatsappFailDetail, code:functions/bulkWhatsApp.js

## 2026-11-08 -- Owner 2026-11-08: Admin driver list rows now match the customer list rows (details, tags, edit, block, delete inside the arrow; one row open at a time)
- changed (3): code:CLAUDE.md, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#AdminDriverList

## 2026-11-08 -- Owner 2026-11-08: thicker (2px) border on every Admin customer and driver row
- changed (4): code:CLAUDE.md, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#AdminDriverList, code:src/AdminPanel.jsx#AdminCustomers

## 2026-11-09 -- Owner 2026-11-09: Add new vehicle -> owner conversion (convertDriverToFleetOwner, profile button, openForm) + names letters-only / numbers digits-only (inputRules)
- changed (20): file:src/firebaseClient.js, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:functions/index.js#other, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#imports, code:src/App.jsx#CustomerOnboarding, code:src/App.jsx#DriverOnboarding, code:src/App.jsx#DriverKycPortalNameEdit, code:src/App.jsx#CustomerProfileEdit, code:src/App.jsx#TripExtras, code:src/App.jsx#DriverOtpEntry, code:src/App.jsx#DriverKyc, code:src/App.jsx#DriverProfileEdit, code:src/App.jsx#DriverApp, code:src/App.jsx#App, code:src/FleetOwner.jsx#imports, code:src/FleetOwner.jsx#digits, code:src/FleetOwner.jsx#FleetVehicleForm, code:src/FleetOwner.jsx#FleetSetup
- added (5): fn:convertDriverToFleetOwner, code:functions/index.js#fn:convertDriverToFleetOwner, code:src/firebaseClient.js#convertToFleetOwner, code:functions/fleetConvert.js, code:src/inputRules.js

## 2026-11-09 -- Owner 2026-11-09: fleet add-vehicle form uses the 15-category dropdown (customerListCategoryOptions); fleet lists show category text
- changed (7): code:CLAUDE.md, code:scripts/verifyInvariants.mjs#checks, code:src/FleetOwner.jsx#imports, code:src/FleetOwner.jsx#FleetVehicleForm, code:src/FleetOwner.jsx#FleetSetup, code:src/FleetOwner.jsx#FleetAssignSheet, code:src/FleetOwner.jsx#AdminFleetVehicles
- added (1): code:src/App.jsx#customerListCategoryOptions

## 2026-11-09 -- Owner 2026-11-09: full-app dead-code audit -- removed unused components (TimeSlotModal, PickupPage, PickupPill, StepSummary, StepNextButton, RecentPlacesList, TripExtras, VehicleCategoryIcon), unused weight-input helpers and other unreferenced functions/constants from src/App.jsx; no behaviour changed
- changed (6): code:scripts/criteria.mjs#BLOCKS, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#imports, code:src/App.jsx#CustomerBooking, code:src/App.jsx#ActiveRide, code:src/App.jsx#App
- removed (31): app:maxFleetVehicleCapacityKg, app:vehicleForWeight, app:getWeightInputChange, app:isWeightValid, code:scripts/verifyInvariants.mjs#loadWeightFns, code:scripts/verifyInvariants.mjs#typeInto, code:scripts/verifyInvariants.mjs#toKg, code:src/App.jsx#TIME_PERIODS, code:src/App.jsx#periodLabel, code:src/App.jsx#formatSlotShort, code:src/App.jsx#formatTimeSlot, code:src/App.jsx#TimeSlotModal, code:src/App.jsx#vehicleForWeight, code:src/App.jsx#addExtra, code:src/App.jsx#respondExtra, code:src/App.jsx#isLongHaulSmallLoad, code:src/App.jsx#trialDaysLeft, code:src/App.jsx#VehicleCategoryIcon, code:src/App.jsx#maxFleetVehicleCapacityKg, code:src/App.jsx#MAX_BOOKING_WEIGHT_TON, code:src/App.jsx#KG_WEIGHT_RE, code:src/App.jsx#TON_WEIGHT_RE, code:src/App.jsx#getWeightInputChange, code:src/App.jsx#isWeightValid, code:src/App.jsx#weightUnitLabel, code:src/App.jsx#StepSummary, code:src/App.jsx#StepNextButton, code:src/App.jsx#RecentPlacesList, code:src/App.jsx#PickupPill, code:src/App.jsx#PickupPage, code:src/App.jsx#TripExtras

## 2026-11-09 -- Owner 2026-11-09: dead-code audit follow-up -- SYSTEM_CONTRACTS B3 wording (TimeSlotModal deleted)
- changed (2): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md

## 2026-11-09 -- Owner bug report 2026-11-09: customer screen crash 'reading lat' -- CustomerBooking list km no longer reads a null lastKnownLocation (fleet vehicles have none)
- changed (3): code:CLAUDE.md, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#CustomerBooking
- added (1): code:src/App.jsx#NO_LOCATION_KM

## 2026-11-09 -- Owner 2026-11-09: dead-code audit part 2 -- removed unused materials rule from firestore.rules and the unused drivers prop of AdminAlerts
- changed (6): file:firestore.rules, code:CLAUDE.md, code:firestore.rules, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#AdminAlerts, code:src/AdminPanel.jsx#AdminPanel

## 2026-11-10 -- Owner 2026-11-10: added read-only scripts/auditDriverCapacities.js (lists drivers whose entered capacity looks wrong); no app behaviour changed
- added (1): code:scripts/auditDriverCapacities.js

## 2026-11-10 -- Owner 2026-11-10: auditDriverCapacities.js gets an --all option (one line per driver with the weight entered); read-only script, no app behaviour changed
- changed (1): code:scripts/auditDriverCapacities.js

## 2026-11-10 -- Owner 2026-11-10: KYC vehicle model picker from Apna_Transport_Vehicle_Weights.xlsx (no weight box), 4 customer-list category names made generic (no company/model words), Admin weight-category dropdown, capacity fix/audit scripts
- changed (14): app:CUSTOMER_LIST_CATEGORY_NAMES, app:DRIVER_KYC_FIELDS, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#imports, code:src/AdminPanel.jsx#AdminFleet, code:src/AdminPanel.jsx#AdminDriverList, code:src/App.jsx#imports, code:src/App.jsx#DRIVER_KYC_FIELDS, code:src/App.jsx#CUSTOMER_LIST_CATEGORY_NAMES, code:src/App.jsx#runDriverSignupFinalize, code:src/App.jsx#DriverOnboarding, code:src/App.jsx#DriverKyc
- added (3): code:scripts/fixDriverCapacities.js, code:src/VehicleModelPicker.jsx, code:src/vehicleModels.js

## 2026-11-10 -- Owner 2026-11-10: Admin dashboard Installs vs Uninstalls card replaced by the four-way installs + KYC split (partitionDriversByInstallAndKyc)
- changed (5): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#imports, code:src/AdminPanel.jsx#AdminFleet
- added (4): code:src/App.jsx#SANE_CAPACITY_MIN_KG, code:src/App.jsx#driverKycDetailsProblem, code:src/App.jsx#kycProblemText, code:src/App.jsx#partitionDriversByInstallAndKyc

## 2026-11-10 -- Deploy guard ignores .txt / .csv output files in scripts/ (the capacity audit's drivers.txt blocked a deploy); gitignore scripts/*.txt and *.csv
- changed (2): code:.gitignore, code:scripts/criteria.mjs#listFiles

## 2026-11-10 -- Stray-file invariant covers .txt/.csv output (drivers.txt incident)
- changed (1): code:scripts/verifyInvariants.mjs#checks

## 2026-11-10 -- Owner 2026-11-10: Admin dashboard Customers tile (how many customers installed the app)
- changed (4): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#AdminFleet

## 2026-11-10 -- One vehicle picker everywhere: Admin driver edit forms + fleet add-vehicle form use VehicleModelPicker (owner 2026-11-10)
- changed (13): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#imports, code:src/AdminPanel.jsx#AdminFleet, code:src/AdminPanel.jsx#AdminDriverList, code:src/AdminPanel.jsx#AdminPanel, code:src/App.jsx#imports, code:src/App.jsx#DriverKyc, code:src/FleetOwner.jsx#imports, code:src/FleetOwner.jsx#FleetVehicleForm, code:src/VehicleModelPicker.jsx, code:src/vehicleModels.js
- added (5): code:src/AdminPanel.jsx#adminVehicleDraft, code:src/AdminPanel.jsx#adminPickedVehicle, code:src/AdminPanel.jsx#adminVehiclePatch, code:src/AdminPanel.jsx#AdminVehiclePick, code:src/App.jsx#vehicleTypeKeyForName

## 2026-11-10 -- Vehicle picker: models listed under the company with weight chips instead of a second dropdown (owner 2026-11-10)
- changed (4): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/VehicleModelPicker.jsx

## 2026-11-10 -- Vehicle picker: removed the 'My model is not listed' option (owner 2026-11-10)
- changed (4): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/verifyInvariants.mjs#checks, code:src/VehicleModelPicker.jsx

## 2026-11-10 -- Weight category limits from the registered-vehicle sheet: 750->700, 3500->4000, 9000->10000; 701-750 kg counts as 700; fares unchanged via CATEGORY_FARE_LIMIT_KG (owner 2026-11-10, explicit change to the frozen category table)
- changed (15): app:CUSTOMER_LIST_CATEGORY_KG, app:customerListCategoryIndex, file:functions/tripLock.js, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:functions/tripLock.js#RING_CATEGORY_MAX_KG, code:functions/tripLock.js#categoryIndexOfCapacity, code:scripts/auditDriverCapacities.js, code:scripts/criteria.mjs#BLOCKS, code:scripts/fareEngine.mjs, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#categoryTierBounds, code:src/App.jsx#CUSTOMER_LIST_CATEGORY_KG, code:src/App.jsx#customerListCategoryIndex, code:src/vehicleModels.js
- added (2): app:CATEGORY_FARE_LIMIT_KG, code:src/App.jsx#CATEGORY_FARE_LIMIT_KG

## 2026-11-10 -- Weight categories round 2: add 1000 + 2000, merge 5000 into 4000 and 12000/16000 into 10000 (member-max table), fares of existing categories unchanged (owner 2026-11-10, explicit change to the frozen category table)
- changed (21): app:CUSTOMER_LIST_CATEGORY_KG, app:CATEGORY_FARE_LIMIT_KG, app:CUSTOMER_LIST_CATEGORY_NAMES, app:CUSTOMER_LIST_CATEGORY_DIM_MODELS, app:customerListCategoryIndex, file:functions/tripLock.js, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:functions/tripLock.js#RING_CATEGORY_MAX_KG, code:functions/tripLock.js#categoryIndexOfCapacity, code:functions/tripLock.js#exportsList, code:scripts/criteria.mjs#BLOCKS, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#CUSTOMER_LIST_CATEGORY_KG, code:src/App.jsx#CATEGORY_FARE_LIMIT_KG, code:src/App.jsx#customerListCategoryIndex, code:src/App.jsx#CUSTOMER_LIST_CATEGORY_NAMES, code:src/App.jsx#CUSTOMER_LIST_CATEGORY_DIM_MODELS, code:src/App.jsx#customerListCategoryOptions, code:src/vehicleArt.jsx#VEHICLE_ART_SPECS, code:src/vehicleModels.js
- added (3): app:CATEGORY_MEMBER_MAX_KG, code:functions/tripLock.js#RING_CATEGORY_MEMBER_MAX_KG, code:src/App.jsx#CATEGORY_MEMBER_MAX_KG

## 2026-11-10 -- Vehicle picker: first dropdown placeholder reads 'Select vehicle' (owner 2026-11-10)
- changed (1): code:src/VehicleModelPicker.jsx

## 2026-11-10 -- Drivers' Set Fare + Return Load use the category tier; Saved Routes show the category (owner 2026-11-10)
- changed (7): app:markReturnModePatch, code:CLAUDE.md, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#AdminRouteFares, code:src/AdminPanel.jsx#AdminSavedRoutes, code:src/App.jsx#markReturnModePatch, code:src/App.jsx#SetFareForm
- added (1): code:src/AdminPanel.jsx#savedRateCategoryText

## 2026-11-10 -- Fare synced to the new categories (priced at own limit, CATEGORY_FARE_LIMIT_KG removed); ring climbs one category per round, +2 at most (owner 2026-11-10, explicit change to frozen fare + ring)
- changed (20): app:isDriverBroadcastEligible, app:ringCategoryInRange, fns:escalateOneBooking, fns:ESCALATION_ROUNDS, file:functions/tripLock.js, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:functions/index.js#other, code:functions/index.js#ESCALATION_ROUNDS, code:functions/index.js#escalateOneBooking, code:functions/tripLock.js#categoryInRingRange, code:functions/tripLock.js#evaluateFleetOwnerVehicles, code:functions/tripLock.js#evaluateNewLoadDriver, code:functions/tripLock.js#exportsList, code:scripts/criteria.mjs#BLOCKS, code:scripts/fareEngine.mjs, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#ringCategoryInRange, code:src/App.jsx#isDriverBroadcastEligible, code:src/App.jsx#categoryTierBounds
- added (3): app:RING_EXTRA_CATEGORIES, code:functions/tripLock.js#RING_EXTRA_CATEGORIES, code:src/App.jsx#RING_EXTRA_CATEGORIES
- removed (8): app:RING_EXTRA_RANGE_KG, app:ringCategoryLimitKg, app:CATEGORY_FARE_LIMIT_KG, code:functions/tripLock.js#RING_EXTRA_RANGE_KG, code:functions/tripLock.js#categoryLimitKg, code:src/App.jsx#RING_EXTRA_RANGE_KG, code:src/App.jsx#ringCategoryLimitKg, code:src/App.jsx#CATEGORY_FARE_LIMIT_KG

## 2026-11-10 -- By-ton capacity/clamp/per-ton suggestion use the category's limit (700 kg = 0.7 t) instead of the fare tier's weight (0.75 t) in the Admin calculator and driver Set Fare; owner asked to check 750 vs 700
- changed (4): code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#imports, code:src/AdminPanel.jsx#AdminRateCalculator, code:src/App.jsx#SetFareForm
- added (1): code:src/App.jsx#categoryLoadCapacityKg

## 2026-11-10 -- CLAUDE.md: documented the By-ton load = category limit rule (docs only)
- changed (1): code:CLAUDE.md

## 2026-11-10 -- Added own fare tiers for 1700 kg (priced apart from 2000) and 4000 kg (category no longer priced at the 5000 kg tier); Saved Routes no longer names a retired-tier rate after a category; golden grid regenerated
- changed (9): app:DEFAULT_FARE_TIERS, app:DIESEL_MILEAGE_BY_TIER_MAX_KG, code:CLAUDE.md, code:scripts/golden/fares.json, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#savedRateCategoryText, code:src/App.jsx#DEFAULT_FARE_TIERS, code:src/App.jsx#DIESEL_MILEAGE_BY_TIER_MAX_KG, code:src/App.jsx#HALT_PER_DAY_BY_MAXKG

## 2026-11-10 -- 25000 kg fare tier separated from 21000 kg (innerFix 5200, innerPer 76, outerMin 7400, outerPer 60) so 20 ton container and 12/14 wheeler no longer quote the same fare; KNOWN_DIP for 25000 scaled; golden regenerated
- changed (5): app:DEFAULT_FARE_TIERS, code:CLAUDE.md, code:scripts/golden/fares.json, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#DEFAULT_FARE_TIERS

## 2026-11-10 -- Saved Admin rates now follow the Market rate change (marketAtSave stamp, applyMarketToSavedRates before the diesel term, ratesMarketBase for unstamped rates); card text updated; fare engine exposes the helper to tests
- changed (6): code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:scripts/fareEngine.mjs, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#AdminRateCalculator, code:src/App.jsx#App
- added (1): code:src/App.jsx#applyMarketToSavedRates

## 2026-11-11 -- Admin System Settings trial note reworded: the 30-day trial for new drivers begins after the 1st trip (text only; see the open question about the actual trial start)
- changed (1): code:src/AdminPanel.jsx#AdminFinance

## 2026-11-11 -- Admin Danger Zone: added 'select what to delete' option beside 'delete whole ride history'; deleteSelectedRides only deletes finished rides
- changed (5): code:CLAUDE.md, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#AdminFinance, code:src/AdminPanel.jsx#AdminPanel, code:src/App.jsx#App

## 2026-11-11 -- Admin fleet list heading renamed from 'Fleet vehicles' to 'Transporter' (text only)
- changed (1): code:src/FleetOwner.jsx#AdminFleetVehicles

## 2026-11-11 -- Admin Transporter list grouped by owner: owner cards with vehicle details and driver details (incl. driver phone) underneath
- changed (4): code:CLAUDE.md, code:scripts/verifyInvariants.mjs#checks, code:src/FleetOwner.jsx#imports, code:src/FleetOwner.jsx#AdminFleetVehicles

## 2026-11-11 -- Admin Drivers tab: 'All Transporters' button beside 'All Drivers' opens the owner-grouped transporter list on its own screen (no longer inline)
- changed (6): code:CLAUDE.md, code:scripts/verifyInvariants.mjs#checks, code:src/AdminPanel.jsx#imports, code:src/AdminPanel.jsx#AdminDriverList, code:src/AdminPanel.jsx#AdminPanel, code:src/FleetOwner.jsx#AdminFleetVehicles

## 2026-11-11 -- New read-only admin script scripts/listCustomerBookingAttempts.js (lists customers who tried to book / booked / cancelled, with phone numbers); no app or rule change
- added (1): code:scripts/listCustomerBookingAttempts.js

## 2026-11-11 -- New read-only admin scripts whyNoDriver.js and driverSupplyReport.js (replay the ring rule against live drivers; supply funnel per hub); no app/rule change
- changed (1): code:CLAUDE.md
- added (2): code:scripts/driverSupplyReport.js, code:scripts/whyNoDriver.js
## 2026-11-10 -- Ring: never-located drivers are skipped by the first ring and rung from escalation round 1 (last resort); evaluateNewLoadDriver + isDriverBroadcastEligible mirror; new invariant
- changed (7): app:isDriverBroadcastEligible, file:functions/tripLock.js, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:functions/tripLock.js#evaluateNewLoadDriver, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#isDriverBroadcastEligible

## 2026-11-11 -- Rebase merge: re-fingerprint after combining the Danger Zone change with the never-located ring change
- changed (7): app:isDriverBroadcastEligible, file:functions/tripLock.js, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:functions/tripLock.js#evaluateNewLoadDriver, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#isDriverBroadcastEligible

## 2026-11-11 -- Rebase merge: re-fingerprint after combining the Transporter change with the never-located ring change
- changed (7): app:isDriverBroadcastEligible, file:functions/tripLock.js, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:functions/tripLock.js#evaluateNewLoadDriver, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#isDriverBroadcastEligible

## 2026-11-11 -- Rebase merge: re-fingerprint after combining the All Transporters button with the never-located ring change
- changed (7): app:isDriverBroadcastEligible, file:functions/tripLock.js, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:functions/tripLock.js#evaluateNewLoadDriver, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#isDriverBroadcastEligible

## 2026-11-11 -- Rebase merge: re-fingerprint after combining the supply scripts with the never-located ring change
- changed (7): app:isDriverBroadcastEligible, file:functions/tripLock.js, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:functions/tripLock.js#evaluateNewLoadDriver, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#isDriverBroadcastEligible

## 2026-11-12 -- One role per mobile number: roleLock.js, checkMobileRegistered/resetPinAfterPhoneVerify, sign-up/login/forgot-PIN messages (owner 2026-11-12)
- changed (10): fn:resetPinAfterPhoneVerify, fn:checkMobileRegistered, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:functions/index.js#other, code:functions/index.js#fn:resetPinAfterPhoneVerify, code:functions/index.js#fn:checkMobileRegistered, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#CustomerOnboarding, code:src/App.jsx#DriverOnboarding
- added (4): code:functions/index.js#mobileHasRoleAccount, code:src/App.jsx#numberBelongsToOtherRole, code:src/App.jsx#numberOtherRoleMsg, code:functions/roleLock.js

## 2026-11-12 -- CLAUDE.md: point the 2026-10-28 sign-up line at the one-role-per-number rule
- changed (1): code:CLAUDE.md

## 2026-11-12 -- One role per mobile number (re-fingerprint on the pushed base)
- changed (10): fn:resetPinAfterPhoneVerify, fn:checkMobileRegistered, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:functions/index.js#other, code:functions/index.js#fn:resetPinAfterPhoneVerify, code:functions/index.js#fn:checkMobileRegistered, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#CustomerOnboarding, code:src/App.jsx#DriverOnboarding
- added (4): code:functions/index.js#mobileHasRoleAccount, code:src/App.jsx#numberBelongsToOtherRole, code:src/App.jsx#numberOtherRoleMsg, code:functions/roleLock.js

## 2026-11-12 -- Rebase merge: re-fingerprint after combining the one-role change with the never-located ring change
- changed (7): app:isDriverBroadcastEligible, file:functions/tripLock.js, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:functions/tripLock.js#evaluateNewLoadDriver, code:scripts/verifyInvariants.mjs#checks, code:src/App.jsx#isDriverBroadcastEligible

## 2026-11-12 -- One role per number also enforced by firestore.rules (create drivers/customers refused when the other profile exists), read-only dual-role script, rules emulator test (owner 2026-11-12)
- changed (5): file:firestore.rules, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:firestore.rules, code:scripts/verifyInvariants.mjs#checks
- added (2): code:scripts/listDualRoleNumbers.js, code:scripts/rulesTest/roleLock.mjs

## 2026-11-12 -- One role per number also enforced by firestore.rules, read-only dual-role script, rules emulator test (re-fingerprint on the pushed base)
- changed (5): file:firestore.rules, code:CLAUDE.md, code:docs/SYSTEM_CONTRACTS.md, code:firestore.rules, code:scripts/verifyInvariants.mjs#checks
- added (2): code:scripts/listDualRoleNumbers.js, code:scripts/rulesTest/roleLock.mjs
