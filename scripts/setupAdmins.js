// Batch version of setupAdmin.js — creates/updates several admin accounts
// in one run instead of calling setupAdmin.js once per person.
//
// Usage:
//   cd scripts
//   npm install
//   node setupAdmins.js /path/to/serviceAccountKey.json \
//     admin1@example.com "password1" \
//     admin2@example.com "password2" \
//     admin3@example.com "password3"
//
// Same one-time prerequisite as setupAdmin.js: enable the Email/Password
// sign-in provider in Firebase Console -> Authentication -> Sign-in method.
// Each admin must log out and back in once after this runs, for the
// "admin" claim to take effect.

const admin = require("firebase-admin");
const { ensureAdmin } = require("./_adminHelpers");

const [, , keyPathArg, ...pairs] = process.argv;

if (!keyPathArg || pairs.length === 0 || pairs.length % 2 !== 0) {
  console.error("Usage: node setupAdmins.js <serviceAccountKey.json> <email1> <password1> [<email2> <password2> ...]");
  process.exit(1);
}

const serviceAccount = require(require("path").resolve(keyPathArg));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

(async () => {
  for (let i = 0; i < pairs.length; i += 2) {
    await ensureAdmin(pairs[i], pairs[i + 1]);
  }
  console.log(`Done — ${pairs.length / 2} admin account(s) ready. Each should log out and back in on the Admin Login screen for it to take effect.`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
