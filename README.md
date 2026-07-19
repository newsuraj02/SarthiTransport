# सार्थी ट्रांसपोर्ट (Sarthi Transport)

An all-India on-demand truck/tempo booking marketplace — customers post loads, drivers bid, and admins run the platform.

Built with React + Vite + Tailwind CSS + lucide-react, backed by Firebase/Firestore for real-time multi-user sync (bookings, bids, driver profiles, admin settings all update live across every tester's device).

## Apps included

- **Customer** — role selection remembered across visits, OTP login, mandatory address verification, post a load (now or in advance) with an explicit vehicle picker and a popup for light-but-bulky materials, review driver quotes (lowest fare first), track a trip live with a countdown loading timer, pay the driver directly (90% of the fare, outside the app), rate drivers, download invoices, and reach Contact & Helpline (call/WhatsApp/complaint) from the hamburger menu.
- **Driver** — OTP login, KYC hard-gated (no dashboard until admin approves), get a beep+toast the instant a matching load is posted (no search bar), submit one-time fare quotes (fare, allowed hours, waiting charge), wallet with minimum-balance and commission-shortfall checks outside the free-trial period, admin-approved recharge requests, bonus withdrawals, and a held-credit pool that auto-offsets the next trip after a cancellation.
- **Admin** — live fleet dashboard, KYC approval desk, driver list/blacklist, wallet recharge & bonus withdrawal approvals, commission/bonus/minimum-wallet settings with a 60-day free-trial countdown that auto-switches to commercial mode, finance reports, notifications, and emergency/complaint alerts from both customers and drivers.

The root `App` component starts in a demo "role switcher" mode so all three apps are reachable from one screen, and admin can preview the customer/driver apps through the same real login/verification gates a normal user goes through.

Two layers of state:
- **Shared / real-time (Firestore)** — bookings, bids, driver profiles (keyed by mobile number, so every tester gets a real identity), customers, admin settings, alerts, withdrawals, recharge requests. Any tester's write shows up on every other tester's screen live.
- **Per-device (`localStorage`)** — role choice, login/OTP verification state, remembered phone numbers, language, and custom material list. This is intentionally local: it's about *this browser's* session, not shared data.

See **`firestore.rules`** for the schema/security model, **`DEPLOYMENT.md`** for how to put this on a real URL so multiple people can test it together, and **`TESTING_GUIDE.md`** for a pilot test script covering all three roles.

### Known limitations for a pilot (not a public launch)

- **Security**: Firestore rules are wide open (anyone with the web config can read/write everything) — fine for a short trusted pilot, not for a public link. See the note at the top of `firestore.rules`.
- **Driver identity**: a driver's active trip is matched by display *name* internally, not phone number — pilot testers must use distinct real names (see `TESTING_GUIDE.md`).
- The 60-day free-trial clock starts the first time anyone opens the deployed app (shared, not per-browser) and is tracked in the `settings` Firestore doc.
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
- Customer/Driver OTP: `1234`
