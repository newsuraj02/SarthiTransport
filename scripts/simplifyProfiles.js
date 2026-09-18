// One-off admin script: trims EXISTING customer/driver Firestore documents
// down to the simplified field set the app itself now collects (see the
// "master plan" profile-simplification pass — CustomerProfileEdit and
// DriverKyc no longer show these fields, but old accounts created before
// that change still carry the old data until this runs).
//
// customers: removes email, address, area, city, state, pincode — kept
//   going forward: mobile, name, photo, referral fields.
// drivers: removes vehicleSpec.length/width/height (old manual-dimension
//   fields DriverKyc no longer collects) and the legacy top-level
//   address/city/state/pincode fields some accounts got from the old
//   admin manual-add path — kept going forward: photo/DL, vehicle side
//   photo, vehicleNumber, capacityKg, vehicle type/model, plus every
//   operational field (wallet, online, kyc, rating, rateCard, etc.),
//   none of which this script ever touches.
//
// Only ever DELETES the specific fields named above, on documents that
// actually still have at least one of them — every other field on every
// document is left exactly as-is. Safe to re-run; a document with none of
// these fields left is simply skipped.
//
// Usage:
//   cd scripts
//   npm install
//   node simplifyProfiles.js /path/to/serviceAccountKey.json --dry-run
//   node simplifyProfiles.js /path/to/serviceAccountKey.json
//
// Where to get the service account key: Firebase Console -> gear icon ->
// Project Settings -> Service accounts -> "Generate new private key".

const admin = require("firebase-admin");
const readline = require("readline");

const [, , keyPathArg, ...flags] = process.argv;
const dryRun = flags.includes("--dry-run");

if (!keyPathArg) {
  console.error("Usage: node simplifyProfiles.js <serviceAccountKey.json> [--dry-run]");
  process.exit(1);
}

const serviceAccount = require(require("path").resolve(keyPathArg));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const CUSTOMER_FIELDS = ["email", "address", "area", "city", "state", "pincode"];
const DRIVER_TOP_FIELDS = ["address", "city", "state", "pincode"];
const DRIVER_VEHICLE_SPEC_FIELDS = ["length", "width", "height"];

async function planCustomerUpdates() {
  const snap = await db.collection("customers").get();
  const updates = [];
  snap.forEach((doc) => {
    const data = doc.data();
    const present = CUSTOMER_FIELDS.filter((f) => data[f] !== undefined);
    if (present.length === 0) return;
    const patch = {};
    present.forEach((f) => { patch[f] = FieldValue.delete(); });
    updates.push({ ref: doc.ref, patch, id: doc.id, fields: present });
  });
  return updates;
}

async function planDriverUpdates() {
  const snap = await db.collection("drivers").get();
  const updates = [];
  snap.forEach((doc) => {
    const data = doc.data();
    const topPresent = DRIVER_TOP_FIELDS.filter((f) => data[f] !== undefined);
    const specPresent = DRIVER_VEHICLE_SPEC_FIELDS.filter((f) => data.vehicleSpec && data.vehicleSpec[f] !== undefined);
    if (topPresent.length === 0 && specPresent.length === 0) return;
    const patch = {};
    topPresent.forEach((f) => { patch[f] = FieldValue.delete(); });
    specPresent.forEach((f) => { patch[`vehicleSpec.${f}`] = FieldValue.delete(); });
    updates.push({ ref: doc.ref, patch, id: doc.id, fields: [...topPresent, ...specPresent.map((f) => `vehicleSpec.${f}`)] });
  });
  return updates;
}

async function applyUpdates(label, updates) {
  console.log(`${label}: ${updates.length} document(s) to update${dryRun ? " (dry run, not writing)" : ""}`);
  updates.forEach((u) => console.log(`  ${u.id}: clearing [${u.fields.join(", ")}]`));
  if (dryRun || updates.length === 0) return;
  const batchSize = 400;
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = db.batch();
    updates.slice(i, i + batchSize).forEach((u) => batch.update(u.ref, u.patch));
    await batch.commit();
  }
}

async function confirm(customerCount, driverCount) {
  if (dryRun) return true;
  if (customerCount === 0 && driverCount === 0) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) =>
    rl.question(
      `This will permanently clear the old address/email fields from ${customerCount} customer doc(s) and old dimension/address fields from ${driverCount} driver doc(s). Every other field (wallet, KYC, rating, rate card, etc.) is untouched. Type "DELETE" to continue: `,
      resolve
    )
  );
  rl.close();
  return answer.trim() === "DELETE";
}

(async () => {
  console.log("Scanning customers and drivers for old fields to clean up...\n");
  const customerUpdates = await planCustomerUpdates();
  const driverUpdates = await planDriverUpdates();

  const ok = await confirm(customerUpdates.length, driverUpdates.length);
  if (!ok) {
    console.log("Aborted, nothing changed.");
    process.exit(0);
  }

  console.log("");
  await applyUpdates("customers", customerUpdates);
  console.log("");
  await applyUpdates("drivers", driverUpdates);

  console.log("\nDone.");
  process.exit(0);
})();
