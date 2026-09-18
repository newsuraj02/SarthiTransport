// One-off admin script: wipes ALL ride/trip history from Firestore —
// every document in the `bookings` collection, regardless of status
// (Bidding, Ongoing, Completed, Cancelled, or a future-dated Advance
// booking) — plus each booking's uploaded bill/invoice/e-way-bill
// documents in Storage.
//
// This is what feeds every "ride history" surface in the app at once:
//   - Driver's Trip History (DriverHistory) and wallet transaction list
//     (commission-debit entries are derived from bookings/tripLog)
//   - Customer's active/past booking screens
//   - Admin's Live Dashboard tiles, trip log, and Reports/Finance numbers
//
// LEAVES COMPLETELY UNTOUCHED: drivers, customers (accounts, KYC, wallet
// balances, referral/bonus entries), vehicleTypes, materials, settings,
// withdrawals, rechargeRequests, alerts, adminNotifications. This script
// only ever touches `bookings` and its Storage documents — nothing else.
//
// This is IRREVERSIBLE. Run it only when you're sure — confirmed with the
// user: this wipes bookings of every status, including anything currently
// in progress right now, not just finished ones.
//
// Usage:
//   cd scripts
//   npm install
//   node wipeBookings.js /path/to/serviceAccountKey.json your-project.appspot.com
//   node wipeBookings.js /path/to/serviceAccountKey.json your-project.appspot.com --dry-run
//   node wipeBookings.js /path/to/serviceAccountKey.json your-project.appspot.com --skip-storage
//
// Where to get the two arguments: same as wipeUserData.js — see that
// file's header comment for exactly where in Firebase Console to find
// the service account key and storage bucket name.

const admin = require("firebase-admin");
const readline = require("readline");

const [, , keyPathArg, bucketArg, ...flags] = process.argv;
const dryRun = flags.includes("--dry-run");
const skipStorage = flags.includes("--skip-storage");

if (!keyPathArg || !bucketArg) {
  console.error("Usage: node wipeBookings.js <serviceAccountKey.json> <storage-bucket> [--dry-run] [--skip-storage]");
  process.exit(1);
}

const serviceAccount = require(require("path").resolve(keyPathArg));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: bucketArg,
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function deleteBookings() {
  const snap = await db.collection("bookings").get();
  console.log(`bookings: ${snap.size} document(s)${dryRun ? " (dry run, not deleting)" : ""}`);
  if (dryRun || snap.empty) return snap.docs.map((d) => d.id);
  const batchSize = 400;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = db.batch();
    docs.slice(i, i + batchSize).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return docs.map((d) => d.id);
}

async function deleteBookingDocuments(bookingIds) {
  for (const id of bookingIds) {
    const prefix = `bookings/${id}/documents`;
    const [files] = await bucket.getFiles({ prefix });
    if (files.length === 0) continue;
    console.log(`  storage ${prefix}: ${files.length} file(s)${dryRun ? " (dry run, not deleting)" : ""}`);
    if (dryRun) continue;
    await Promise.all(files.map((f) => f.delete().catch((err) => console.error(`    failed to delete ${f.name}:`, err.message))));
  }
}

async function confirm() {
  if (dryRun) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) =>
    rl.question(
      'This will PERMANENTLY delete every booking (any status, including ones in progress right now) and their uploaded documents. Driver/customer accounts, KYC, and wallets are NOT touched. Type "DELETE" to continue: ',
      resolve
    )
  );
  rl.close();
  return answer.trim() === "DELETE";
}

(async () => {
  console.log("Will wipe: the entire `bookings` collection (every status) and their Storage documents.");
  console.log("Will leave untouched: drivers, customers, wallets, KYC, withdrawals, rechargeRequests, alerts, settings.");
  console.log(skipStorage ? "Storage: skipped (--skip-storage)" : "Will also delete each booking's Storage documents under bookings/{id}/documents/");
  console.log("");

  const ok = await confirm();
  if (!ok) {
    console.log("Aborted, nothing deleted.");
    process.exit(0);
  }

  console.log("\nFirestore:");
  const bookingIds = await deleteBookings();

  if (!skipStorage) {
    console.log("\nStorage:");
    await deleteBookingDocuments(bookingIds);
  }

  console.log("\nDone.");
  process.exit(0);
})();
