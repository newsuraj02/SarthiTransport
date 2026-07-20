# Deploying the pilot

The app needs to run on a real public URL (not this session's preview) so 10-15 testers on their own phones/laptops can reach it and share live data through Firestore.

## Option A — Firebase Hosting (recommended, same project you already made)

From your own machine (not this sandbox — you need `firebase login` to open a real browser):

```bash
npm install -g firebase-tools   # once
git clone <this repo>
cd SarthiTransport
npm install
firebase login

# Create .env.local with your Firebase web config (see .env.example)
cp .env.example .env.local
# then fill in the six VITE_FIREBASE_* values from Firebase Console → Project Settings → General → Your apps
# and VITE_GOOGLE_MAPS_API_KEY from Google Cloud Console (see "Google Maps" below)

npm run build
firebase deploy --only hosting
```

Firebase will print a URL like `https://sarthi-transport-74865.web.app` — that's the link to send testers.

`firebase.json` and `.firebaserc` are already in the repo and pre-configured for your project (`sarthi-transport-74865`), so no `firebase init` prompts should appear.

## Option B — Vercel / Netlify

Either works fine for a static Vite build. Import the repo, set the six `VITE_FIREBASE_*` environment variables plus `VITE_GOOGLE_MAPS_API_KEY` in the project's dashboard (same values as `.env.local`), and use the default build command (`npm run build`) and output directory (`dist`).

## Google Maps

Location picking, real coordinates, and live GPS tracking need a Google Maps key:

1. In [Google Cloud Console](https://console.cloud.google.com/), pick or create a project and enable **Maps JavaScript API**, **Geocoding API**, and **Places API**. Billing must be on (Google gives a recurring free monthly credit that comfortably covers a pilot).
2. Create an API key (APIs & Services → Credentials), then restrict it to **HTTP referrers** matching your deployed domain (e.g. `https://sarthi-transport-74865.web.app/*`) so it can't be used elsewhere.
3. Put it in `VITE_GOOGLE_MAPS_API_KEY`.

Without this key the app still works — it falls back to a free OpenStreetMap-based picker and the old animated map for tracking — but location picking won't have search/autocomplete and live GPS tracking won't render on a real map.

## Phone login (real SMS OTP)

Customer and driver login now send a real SMS OTP via Firebase Authentication — no code changes needed, but a few one-time steps in Firebase Console:

1. **Enable Blaze (pay-as-you-go)**: https://console.cloud.google.com/billing/linkedaccount?project=sarthi-transport-74865 — Phone Authentication requires this even though actual usage cost for a pilot is a few cents. (You already saw this billing page when setting up Google Maps.)
2. **Turn on the Phone sign-in provider**: Firebase Console → your project → **Authentication** → **Sign-in method** → click **Phone** → toggle **Enable** → Save.
3. **(Recommended for testing) Add test phone numbers**: same Phone provider screen → **Phone numbers for testing** → add e.g. `+91 9999999999` with code `123456`. Logging in with that exact number always accepts that exact code, without sending a real SMS or using your quota — use this while you and testers are just poking at the app, save real numbers for the actual pilot.
4. **Authorized domains**: Authentication → **Settings** → **Authorized domains** — your `*.web.app` / `*.firebaseapp.com` domain is added automatically; only touch this if you deploy to a custom domain instead.

Nothing else to configure — the reCAPTCHA check Firebase requires is invisible and handled automatically by the SDK.

## Important: don't deploy via a sandboxed "Artifact" preview

An Artifact-style preview page blocks all outbound network requests, so it **cannot** reach Firestore — the app would fall back to solo/local behavior and testers wouldn't see each other's data. Use Option A or B above for the actual pilot link.

## Before testers arrive

- Firestore rules are wide open for anyone with your project's web config (see the security note at the top of `firestore.rules`) — fine for a short trusted pilot, not for a public link. Don't post the pilot URL somewhere public.
- Log in as admin yourself first (`admin123`) and keep the System Settings tab open — you'll want to watch the KYC queue and approve drivers as they sign up.
