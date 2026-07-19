# सार्थी ट्रांसपोर्ट (Sarthi Transport)

An all-India on-demand truck/tempo booking marketplace — customers post loads, drivers bid, and admins run the platform.

Built with React + Vite + Tailwind CSS + lucide-react.

## Apps included

- **Customer** — role selection remembered across visits, OTP login, mandatory address verification, post a load (now or in advance) with an explicit vehicle picker and a popup for light-but-bulky materials, review driver quotes (lowest fare first), track a trip live with a countdown loading timer, pay the driver directly (90% of the fare, outside the app), rate drivers, download invoices, and reach Contact & Helpline (call/WhatsApp/complaint) from the hamburger menu.
- **Driver** — OTP login, KYC hard-gated (no dashboard until admin approves), get a beep+toast the instant a matching load is posted (no search bar), submit one-time fare quotes (fare, allowed hours, waiting charge), wallet with minimum-balance and commission-shortfall checks outside the free-trial period, admin-approved recharge requests, bonus withdrawals, and a held-credit pool that auto-offsets the next trip after a cancellation.
- **Admin** — live fleet dashboard, KYC approval desk, driver list/blacklist, wallet recharge & bonus withdrawal approvals, commission/bonus/minimum-wallet settings with a 60-day free-trial countdown that auto-switches to commercial mode, finance reports, notifications, and emergency/complaint alerts from both customers and drivers.

The root `App` component starts in a demo "role switcher" mode so all three apps are reachable from one screen, and admin can preview the customer/driver apps through the same real login/verification gates a normal user goes through. App state (bookings, wallets, KYC, settings, role/login choice, trial start date) persists to the browser's `localStorage`, so a reload doesn't reset the demo.

### Known frontend-only limitations

This is a fully client-side demo with no backend, so a few PRD items are approximated rather than production-grade:
- The 60-day free-trial clock is tracked per-browser (first launch in that browser), not per-deployment on a server.
- "Push notifications" to drivers are an in-app beep + toast, not real mobile push.
- ₹200 referral tracking, KYC document storage, and payment collection are all simulated — a real launch needs a backend, object storage, and a payment/notification provider.

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL. To build for production:

```bash
npm run build
npm run preview
```

## Demo credentials

- Admin password: `admin123`
- Customer/Driver OTP: `1234`
