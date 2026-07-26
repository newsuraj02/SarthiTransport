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

1. In [Google Cloud Console](https://console.cloud.google.com/), pick or create a project and enable **Maps JavaScript API**, **Geocoding API**, **Places API**, and **Distance Matrix API**. Billing must be on (Google gives a recurring free monthly credit that comfortably covers a pilot).
2. Create an API key (APIs & Services → Credentials), then restrict it to **HTTP referrers** matching your deployed domain (e.g. `https://sarthi-transport-74865.web.app/*`) so it can't be used elsewhere.
3. Put it in `VITE_GOOGLE_MAPS_API_KEY`.

Without this key the app still works — it falls back to a free OpenStreetMap-based picker and the old animated map for tracking — but location picking won't have search/autocomplete and live GPS tracking won't render on a real map.

Distance Matrix API specifically powers the "Estimated distance" shown when booking a load — with it enabled, that number is the real routed driving distance between pickup and drop; without it (or if the call fails), the app falls back to a straight-line-distance approximation, then to a rough guess if coordinates aren't available at all.

## Phone login (real SMS OTP)

Customer and driver login now send a real SMS OTP via Firebase Authentication — no code changes needed, but a few one-time steps in Firebase Console:

1. **Enable Blaze (pay-as-you-go)**: https://console.cloud.google.com/billing/linkedaccount?project=sarthi-transport-74865 — Phone Authentication requires this even though actual usage cost for a pilot is a few cents. (You already saw this billing page when setting up Google Maps.)
2. **Turn on the Phone sign-in provider**: Firebase Console → your project → **Authentication** → **Sign-in method** → click **Phone** → toggle **Enable** → Save.
3. **(Recommended for testing) Add test phone numbers**: same Phone provider screen → **Phone numbers for testing** → add e.g. `+91 9999999999` with code `123456`. Logging in with that exact number always accepts that exact code, without sending a real SMS or using your quota — use this while you and testers are just poking at the app, save real numbers for the actual pilot.
4. **Authorized domains**: Authentication → **Settings** → **Authorized domains** — your `*.web.app` / `*.firebaseapp.com` domain is added automatically; only touch this if you deploy to a custom domain instead.

Nothing else to configure — the reCAPTCHA check Firebase requires is invisible and handled automatically by the SDK.

## Photo & document storage (Firebase Storage)

Profile photos, KYC documents, and vehicle photos upload to Firebase Storage (not inline in Firestore) so the app stays fast as more testers upload photos. One-time setup:

1. Firebase Console → your project → **Storage** → **Get started** → accept the default bucket and location (the free tier is more than enough for a pilot).
2. **Rules** tab → paste the contents of `storage.rules` → **Publish**.

Until this is done, photo uploads automatically fall back to the old inline-in-Firestore behavior, so the app keeps working — but do this before real testers start uploading KYC documents.

## Admin login

The Admin Portal (`?admin=1`) uses real Firebase Authentication (email/password) — not an env var, not a client-side comparison. This is what lets Firestore/Storage security rules actually verify "this is a real admin" (see "Security setup" below).

**One-time setup per admin:**

1. Firebase Console → **Authentication** → **Sign-in method** → enable **Email/Password** (once, for the whole project).
2. Create the admin's account and tag it as an admin:
   ```bash
   cd scripts
   npm install
   node setupAdmin.js /path/to/serviceAccountKey.json admin@example.com "their-password"
   ```
   (Get the service account key from Project Settings → Service accounts → Generate new private key.) Run this once per admin — each gets their own real email/password.
3. That admin logs in normally at the Admin Login screen with the email/password you just set.

Running `setupAdmin.js` again for the same email updates their password and re-applies the admin tag — use it to add more admins or reset a forgotten password. There's no limit on how many admin accounts you create this way.

**Adding several admins at once**: `setupAdmins.js` does the same thing for multiple people in one command:
```bash
node setupAdmins.js /path/to/serviceAccountKey.json \
  admin1@example.com "password1" \
  admin2@example.com "password2" \
  admin3@example.com "password3"
```

## Security setup (Firestore + Storage rules)

Both `firestore.rules` and `storage.rules` in this repo started wide open (`allow read, write: if true`) for the initial trusted pilot — anyone with your public Firebase web config could read/write everything. They've since been rewritten to actually check identity: customers/drivers can only write their own data (matched by their verified phone number), and admin-only actions (approvals, KYC, settings) require the real admin login above. Do this **once**, in this exact order:

1. **Set up at least one admin account first** (previous section) — `setupAdmin.js` — before publishing the new rules, so you don't lock yourself out of admin-only paths before an admin account exists to unlock them.
2. **Enable Email/Password sign-in** (previous section, step 1) if you haven't already — the new rules assume real Firebase Auth exists for admin, not just customers/drivers.
3. **Deploy both rule files** — `firebase.json` already points at them, so the CLI can push both directly instead of copy-pasting into Console (less error-prone):
   ```bash
   firebase deploy --only firestore:rules,storage:rules
   ```
   (Console → Firestore Database/Storage → Rules → paste-and-Publish still works too, if you prefer.)
4. **Rebuild and redeploy the app** — the Admin Login screen's code changed (real Firebase sign-in instead of env vars):
   ```bash
   npm run build
   firebase deploy --only hosting
   ```
5. **Log every existing admin out and back in once** — custom claims (the "admin" tag) only take effect on a freshly issued sign-in token, so an admin who was already logged in via the old system needs one fresh login for the new rules to recognize them.

After this, delete `VITE_ADMIN_EMAIL`/`VITE_ADMIN_PASSWORD` (and any `_2`/`_3`/`_4` variants) from your `.env.local` if you had them set — they're no longer read by the app at all.

**What's still intentionally open, and why**: `vehicleTypes`, `materials`, and `settings` stay world-readable (no login needed) because the app loads them before anyone signs in, and none of it is sensitive — just vehicle names, material names, and commission percentages. `drivers`/`bookings`/`withdrawals`/`rechargeRequests` are readable by *any* signed-in user (not scoped to just the owner) because the app currently fetches whole collections and filters client-side rather than using scoped Firestore queries — e.g. a driver needs to see every open "Bidding" load, not just their own bookings. Writes to all of these ARE scoped to the owning phone number or admin. Tightening list-reads further would mean rewriting those subscriptions to use `where()` queries first — a real future improvement, not done here.

## Push notifications (ride updates)

Customers get a real push when a driver bids/accepts their load or completes the trip; drivers get one the moment their bid is accepted — even if the browser tab isn't open. One-time setup:

1. **Enable Blaze**, if not already (Phone Auth above already required this): https://console.cloud.google.com/billing/linkedaccount?project=sarthi-transport-74865 — Cloud Functions (what actually sends the push) needs it.
2. **Generate a Web Push key pair**: Firebase Console → your project → gear icon → **Project Settings** → **Cloud Messaging** tab → under "Web configuration", click **Generate key pair**. Copy the key into `VITE_FIREBASE_VAPID_KEY` in `.env.local`.
3. **Install the Cloud Function's dependencies** (once, and again any time `functions/package.json` changes):
   ```bash
   cd functions
   npm install
   cd ..
   ```
4. **Deploy the function** — from now on, deploys need `functions` alongside `hosting`:
   ```bash
   firebase deploy --only functions,hosting
   ```

That's it — no Firestore rules changes needed. In the app, customers/drivers see a "Turn on notifications for ride updates" banner on their home screen; tapping it triggers the browser's own permission prompt. If they dismiss/deny it, the banner explains they can re-enable it from the browser's site settings.

Until steps 1-4 are done, that banner still shows and the button still runs — it just won't have a working Cloud Function to actually deliver pushes, so nothing will arrive. No error, just silence, so it's safe to deploy this code before finishing the Console setup.

## Wiping all driver/customer data (reset before/after a pilot)

`scripts/wipeUserData.js` permanently deletes everything tied to drivers and
customers, while leaving your admin settings and config lists alone. Exact
scope:

- **Deletes** (entire Firestore collections): `drivers`, `customers`,
  `bookings` (which includes all bids/quotes, since those live inside
  booking docs), `withdrawals`, `rechargeRequests`, `alerts`.
- **Also deletes** (Storage): every file under `drivers/` and `customers/`
  — KYC documents, vehicle photos, profile photos. Pass `--skip-storage` if
  you'd rather keep those and only clear Firestore.
- **Leaves untouched**: the `settings/main` doc (commission %, bonus %,
  minimum wallet), the `vehicleTypes` collection, and the `materials`
  collection.

This is **irreversible** — there's no undo once it runs. Run it from your
own machine, never from a shared/public one, since it uses a service
account key with full admin access to your project.

```bash
# One-time: get a service account key
# Firebase Console -> gear icon -> Project Settings -> Service accounts
# -> "Generate new private key" -> saves a .json file. Keep it outside
# the repo (or in the repo root — it's already git-ignored by pattern).

cd scripts
npm install

# Dry run first — shows counts, deletes nothing:
node wipeUserData.js /path/to/serviceAccountKey.json sarthi-transport-74865.appspot.com --dry-run

# For real — you'll be asked to type DELETE to confirm:
node wipeUserData.js /path/to/serviceAccountKey.json sarthi-transport-74865.appspot.com
```

(Swap in your actual downloaded key's path and your actual Storage bucket
name — found at the top of Firebase Console → Storage, or as
`VITE_FIREBASE_STORAGE_BUCKET` in your `.env.local`.)

Prefer not to run a script at all? For a pilot-sized dataset it's just as
fine to do it by hand: Firebase Console → **Firestore Database** → open
each of the six collections listed above → select all documents → Delete.
Then **Storage** → open the `drivers/` and `customers/` folders → select
all → Delete. Leave `settings`, `vehicleTypes`, and `materials` alone
either way.

## Important: don't deploy via a sandboxed "Artifact" preview

An Artifact-style preview page blocks all outbound network requests, so it **cannot** reach Firestore — the app would fall back to solo/local behavior and testers wouldn't see each other's data. Use Option A or B above for the actual pilot link.

## Before testers arrive

- Firestore rules are wide open for anyone with your project's web config (see the security note at the top of `firestore.rules`) — fine for a short trusted pilot, not for a public link. Don't post the pilot URL somewhere public.
- Log in as admin yourself first (`admin123`) and keep the System Settings tab open — you'll want to watch the KYC queue and approve drivers as they sign up.
