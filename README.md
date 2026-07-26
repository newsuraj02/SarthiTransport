# अपना ट्रांसपोर्ट (Apna Transport)

An all-India on-demand truck/tempo booking marketplace — customers post loads, drivers bid, and admins run the platform.

Built with React + Vite + Tailwind CSS + lucide-react, backed by Firebase/Firestore for real-time multi-user sync (bookings, bids, driver profiles, admin settings all update live across every tester's device).

## Apps included

- **Customer** — real SMS-OTP login (Firebase Phone Authentication) remembered across visits, mandatory address verification, post a load (now or in advance) with a Google Maps location picker (search + tap-to-pin + real coordinates) for pickup/drop, review driver quotes (lowest fare first), track a trip live on a real map with the driver's live GPS position, pay the driver directly (90% of the fare, outside the app), rate drivers, download invoices, and reach Contact & Helpline (call/WhatsApp/complaint) from the hamburger menu.
- **Driver** — real SMS-OTP login, KYC hard-gated (no dashboard until admin approves, unless their own 30-day trial is still active — see below), get a beep+toast the instant a matching load is posted (no search bar), submit one-time fare quotes (fare, allowed hours, waiting charge), wallet with minimum-balance and commission-shortfall checks outside their own trial period, admin-approved recharge requests, bonus withdrawals, and a held-credit pool that auto-offsets the next trip after a cancellation.
- **Admin** — live fleet dashboard, KYC approval desk, driver list/blacklist, wallet recharge & bonus withdrawal approvals, commission/bonus/minimum-wallet settings (these are the rates that apply once each driver's own trial ends), finance reports, notifications, and emergency/complaint alerts from both customers and drivers.

The root `App` component starts in a demo "role switcher" mode so all three apps are reachable from one screen, and admin can preview the customer/driver apps through the same real login/verification gates a normal user goes through.

Two layers of state:
- **Shared / real-time (Firestore)** — bookings, bids, driver profiles (keyed by mobile number, so every tester gets a real identity), customers, admin settings, alerts, withdrawals, recharge requests. Any tester's write shows up on every other tester's screen live.
- **Per-device (`localStorage`)** — role choice, a lightweight "verified" flag mirroring the Firebase Auth session, language, and custom material list. This is intentionally local: it's about *this browser's* session, not shared data.

See **`firestore.rules`** for the schema/security model, **`DEPLOYMENT.md`** for how to put this on a real URL so multiple people can test it together, and **`TESTING_GUIDE.md`** for a pilot test script covering all three roles.

### Phone login (real SMS OTP)

Customer and driver login send a real SMS OTP via Firebase Phone Authentication (see `DEPLOYMENT.md` → "Phone login" for the one-time Firebase Console setup: enabling Blaze billing and the Phone sign-in provider). Under the hood, customer and driver each sign in through their own dedicated Firebase Auth instance (`customerFirebaseAuth` / `driverFirebaseAuth` in `src/firebaseClient.js`), so one device/browser can hold two independent verified sessions at once — one customer number and one driver number — matching how the app already lets a single device act as both. "Remembered login" is now a real, persisted Firebase Auth session rather than a locally-stored list of past numbers: log out from the hamburger menu to actually end it.

### Google Maps

Location picking (search + tap-to-pin), real pickup/drop coordinates, and live trip tracking use the Google Maps JavaScript/Places/Geocoding APIs, loaded via `VITE_GOOGLE_MAPS_API_KEY` (see `DEPLOYMENT.md` → "Google Maps" for how to get one). Without a key configured, the app automatically falls back to a free OpenStreetMap-based picker and a stylized animated map — booking still works, just without search/autocomplete or a real live map.

While a trip is "Ongoing", both sides share their real GPS position the same way (`navigator.geolocation.watchPosition`, throttled to one write every ~5s): the driver's browser writes to that booking's `driverLocation` field (and their own driver doc's `lastKnownLocation`, which admin's fleet map reads from), and the customer's browser writes to the same booking's `customerLocation` field. `LiveTrackingMap` renders both as separate markers (🚚 driver, 🧍 customer) alongside the pickup/drop pins.

### Known limitations for a pilot (not a public launch)

- **Security**: Firestore rules are wide open (anyone with the web config can read/write everything) — fine for a short trusted pilot, not for a public link. See the note at the top of `firestore.rules`.
- **Driver identity**: a driver's active trip is matched by display *name* internally, not phone number — pilot testers must use distinct real names (see `TESTING_GUIDE.md`).
- **Live GPS**: only shared while a driver has an active ("Ongoing") trip, and only if they grant location permission in their browser — there's no background/idle tracking.
- Each driver/customer gets their own 30-day free trial starting from their own signup date (their doc's `createdAt`), not one shared platform-wide clock — see `isInTrial()` in `src/App.jsx`. Commission is 0% and KYC auto-approves for a driver's first submission while they're within their own 30 days; admin's configured commission/bonus/minimum-wallet rates apply automatically once it ends.
- "Push notifications" to drivers are an in-app beep + toast, not real mobile push.
- ₹200 referral tracking, KYC document storage (uploads aren't actually stored anywhere), and payment collection are all simulated — a real launch needs object storage and a payment/notification provider.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Firebase web config
npm run dev
```

Then open the printed local URL. To build for production:

```bash
npm run build
npm run preview
```

To actually test with multiple people at once, deploy it — see `DEPLOYMENT.md` (a local `npm run dev`/`preview` only reaches your own machine).

## Demo credentials

- Admin password: `admin123`
- Customer/Driver login: real SMS OTP (or use a [test phone number](DEPLOYMENT.md#phone-login-real-sms-otp) while developing, to avoid sending real SMS)
