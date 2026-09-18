// One-off admin script: wipes all driver/customer-related data from
// Firestore (and optionally their Storage photos), leaving admin
// settings/config completely untouched.
//
// DELETES (entire collections): drivers, customers, bookings,
//   withdrawals, rechargeRequests, alerts
// LEAVES ALONE: settings/main, vehicleTypes, materials
// ALSO DELETES (unless --skip-storage): Storage objects under
//   drivers/ and customers/ (KYC docs, vehicle photos, profile photos)
//
// This is IRREVERSIBLE. Run it only when you're sure.
//
// Usage:
//   cd scripts
//   npm install
//   node wipeUserData.js /path/to/serviceAccountKey.json your-project.appspot.com
//   node wipeUserData.js /path/to/serviceAccountKey.json your-project.appspot.com --dry-run
//   node wipeUserData.js /path/to/serviceAccountKey.json your-project.appspot.com --skip-storage
//
// Where to get the two arguments:
//   1. Service account key: Firebase Console -> gear icon -> Project
//      Settings -> Service accounts -> "Generate new private key" ->
//      downloads a JSON file. Keep it out of the git repo.
//   2. Storage bucket name: Firebase Console -> Storage -> top of the
//      page (looks like "sarthi-transport-74865.appspot.com"), or check
//      VITE_FIREBASE_STORAGE_BUCKET in your .env.local.

const admin = require("firebase-admin");
const readline = require("readline");

const COLLECTIONS_TO_WIPE = ["drivers", "customers", "bookings", "withdrawals", "rechargeRequests", "alerts"];
const STORAGE_PREFIXES = ["drivers/", "customers/"];

const [, , keyPathArg, bucketArg, ...flags] = process.argv;
const dryRun = flags.includes("--dry-run");
const skipStorage = flags.includes("--skip-storage");

if (!keyPathArg || !bucketArg) {
  console.error("Usage: node wipeUserData.js <serviceAccountKey.json> <storage-bucket> [--dry-run] [--skip-storage]");
  process.exit(1);
}

const serviceAccount = require(require("path").resolve(keyPathArg));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: bucketArg,
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function deleteCollection(name) {
  const snap = await db.collection(name).get();
  console.log(`  ${name}: ${snap.size} document(s)${dryRun ? " (dry run, not deleting)" : ""}`);
  if (dryRun || snap.empty) return;
  const batchSize = 400;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = db.batch();
    docs.slice(i, i + batchSize).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function deleteStoragePrefix(prefix) {
  const [files] = await bucket.getFiles({ prefix });
  console.log(`  storage ${prefix}: ${files.length} file(s)${dryRun ? " (dry run, not deleting)" : ""}`);
  if (dryRun || files.length === 0) return;
  await Promise.all(files.map((f) => f.delete().catch((err) => console.error(`    failed to delete ${f.name}:`, err.message))));
}

async function confirm() {
  if (dryRun) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question('This will PERMANENTLY delete all driver/customer/booking data. Type "DELETE" to continue: ', resolve));
  rl.close();
  return answer.trim() === "DELETE";
}

(async () => {
  console.log("Will wipe these Firestore collections:", COLLECTIONS_TO_WIPE.join(", "));
  console.log("Will leave untouched: settings/main, vehicleTypes, materials");
  console.log(skipStorage ? "Storage: skipped (--skip-storage)" : "Will also delete Storage files under: " + STORAGE_PREFIXES.join(", "));
  console.log("");

  const ok = await confirm();
  if (!ok) {
    console.log("Aborted, nothing deleted.");
    process.exit(0);
  }

  console.log("\nFirestore:");
  for (const name of COLLECTIONS_TO_WIPE) {
    await deleteCollection(name);
  }

  if (!skipStorage) {
    console.log("\nStorage:");
    for (const prefix of STORAGE_PREFIXES) {
      await deleteStoragePrefix(prefix);
    }
  }

  console.log(dryRun ? "\nDry run complete — nothing was deleted." : "\nDone. Driver/customer data wiped; settings, vehicleTypes, and materials are untouched.");
  process.exit(0);
})();
