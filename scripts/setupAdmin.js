// One-off admin script: creates (or updates) a real Firebase Auth account
// for an admin, and tags it with a custom claim { admin: true }. Firestore
// and Storage security rules check this claim to recognize a real,
// server-verified admin — replacing the old env-var password comparison,
// which had no way to prove identity to security rules at all.
//
// Run this once per admin (including re-runs to change a password).
//
// Usage:
//   cd scripts
//   npm install
//   node setupAdmin.js /path/to/serviceAccountKey.json admin@example.com "their-password"
//
// Where to get the service account key: Firebase Console -> gear icon ->
// Project Settings -> Service accounts -> "Generate new private key".
//
// IMPORTANT one-time Firebase Console step before running this: enable the
// Email/Password sign-in provider — Authentication -> Sign-in method ->
// Email/Password -> Enable -> Save.
//
// After running: that admin must log out and back in (or the app's session
// naturally re-mints their ID token) before the "admin" claim is visible to
// Firestore/Storage rules — custom claims only apply to newly-issued tokens.

const admin = require("firebase-admin");
const { ensureAdmin } = require("./_adminHelpers");

const [, , keyPathArg, email, password] = process.argv;

if (!keyPathArg || !email || !password) {
  console.error("Usage: node setupAdmin.js <serviceAccountKey.json> <admin-email> <admin-password>");
  process.exit(1);
}

const serviceAccount = require(require("path").resolve(keyPathArg));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

(async () => {
  await ensureAdmin(email, password);
  console.log("Done. That admin should log out and back in on the Admin Login screen for it to take effect.");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
