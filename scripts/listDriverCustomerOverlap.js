// One-off admin script: finds every mobile number that has BOTH a driver
// doc and a customer doc. Not a bug check -- the app deliberately allows
// one phone number to hold both a Customer and a Driver account (see
// isOwnPhone's comment in firestore.rules) -- this just makes the current
// list visible on demand, since there's no live view of it in the app.
//
// Usage:
//   cd scripts
//   npm install
//   node listDriverCustomerOverlap.js /path/to/serviceAccountKey.json
//
// Where to get the service account key: Firebase Console -> gear icon ->
// Project Settings -> Service accounts -> "Generate new private key".

const admin = require("firebase-admin");

const [, , keyPathArg] = process.argv;

if (!keyPathArg) {
  console.error("Usage: node listDriverCustomerOverlap.js <serviceAccountKey.json>");
  process.exit(1);
}

const serviceAccount = require(require("path").resolve(keyPathArg));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

(async () => {
  const [driversSnap, customersSnap] = await Promise.all([
    db.collection("drivers").get(),
    db.collection("customers").get(),
  ]);

  const driversByMobile = new Map();
  driversSnap.forEach((doc) => {
    const d = doc.data();
    if (d.mobile) driversByMobile.set(d.mobile, d);
  });

  const customersByMobile = new Map();
  customersSnap.forEach((doc) => {
    const c = doc.data();
    if (c.mobile) customersByMobile.set(c.mobile, c);
  });

  const overlap = [...driversByMobile.keys()].filter((mobile) => customersByMobile.has(mobile));

  if (overlap.length === 0) {
    console.log("No mobile number is registered as both a driver and a customer.");
    process.exit(0);
  }

  console.log(`${overlap.length} mobile number(s) registered as both a driver and a customer:\n`);
  overlap.sort().forEach((mobile) => {
    const d = driversByMobile.get(mobile);
    const c = customersByMobile.get(mobile);
    console.log(mobile);
    console.log(`  Driver:   ${d.name || "(no name)"}${d.kyc ? ` (KYC: ${d.kyc})` : ""}`);
    console.log(`  Customer: ${c.name || "(no name)"}`);
    console.log("");
  });

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
