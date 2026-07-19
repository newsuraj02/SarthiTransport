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

npm run build
firebase deploy --only hosting
```

Firebase will print a URL like `https://sarthi-transport-74865.web.app` — that's the link to send testers.

`firebase.json` and `.firebaserc` are already in the repo and pre-configured for your project (`sarthi-transport-74865`), so no `firebase init` prompts should appear.

## Option B — Vercel / Netlify

Either works fine for a static Vite build. Import the repo, set the six `VITE_FIREBASE_*` environment variables in the project's dashboard (same values as `.env.local`), and use the default build command (`npm run build`) and output directory (`dist`).

## Important: don't deploy via a sandboxed "Artifact" preview

An Artifact-style preview page blocks all outbound network requests, so it **cannot** reach Firestore — the app would fall back to solo/local behavior and testers wouldn't see each other's data. Use Option A or B above for the actual pilot link.

## Before testers arrive

- Firestore rules are wide open for anyone with your project's web config (see the security note at the top of `firestore.rules`) — fine for a short trusted pilot, not for a public link. Don't post the pilot URL somewhere public.
- Log in as admin yourself first (`admin123`) and keep the System Settings tab open — you'll want to watch the KYC queue and approve drivers as they sign up.
