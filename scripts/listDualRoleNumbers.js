// READ-ONLY admin script (owner 2026-11-12): lists every mobile number that is BOTH a Customer and a Driver -- the numbers that slipped in before the
// "one role per mobile number" rule (contract N11) -- so the owner can decide which account to keep. It writes NOTHING.
//
// Usage:
//   cd scripts
//   npm install
//   node listDualRoleNumbers.js /path/to/serviceAccountKey.json
//   node listDualRoleNumbers.js /path/to/serviceAccountKey.json --csv > dual.csv
//
// A number counts as a Customer when it has a customers/{mobile} record OR a customer PIN login; a Driver when it has a drivers/{mobile} record OR a
// driver PIN login. For each number the script shows both names, the driver's KYC state, and how many rides the number has as a customer and as a driver,
// plus a hint: the account with rides (or an Approved KYC) is usually the real one. Deleting the other one is the owner's decision (Admin -> Customers /
// Drivers -> row -> Delete); this script never deletes anything.

const path = require("path");

const PIN_DOMAIN = "apnatransport.local";
const last10 = (v) => String(v || "").replace(/\D/g, "").slice(-10);

// Pure: records -> one row per number that is in both roles, sorted by mobile.
//   customers / drivers: [{ mobile, name, kyc?, fleetOwner? }]   bookings: [{ customerMobile, driverMobile, status }]
//   authEmails: every Auth user's email (the PIN logins), e.g. "9000000001@driver.apnatransport.local"
function findDualRole({ customers = [], drivers = [], bookings = [], authEmails = [] }) {
  const cust = new Map(), drv = new Map();
  customers.forEach((c) => { const m = last10(c.mobile || c.id); if (m) cust.set(m, c); });
  drivers.forEach((d) => { const m = last10(d.mobile || d.id); if (m) drv.set(m, d); });
  const authCust = new Set(), authDrv = new Set();
  authEmails.forEach((e) => {
    const m = /^(\d{10})@(customer|driver)\./.exec(String(e || ""));
    if (!m) return;
    (m[2] === "driver" ? authDrv : authCust).add(m[1]);
  });
  const asCustomerRides = new Map(), asDriverRides = new Map();
  bookings.forEach((b) => {
    const c = last10(b.customerMobile), d = last10(b.driverMobile);
    if (c) asCustomerRides.set(c, (asCustomerRides.get(c) || 0) + 1);
    if (d) asDriverRides.set(d, (asDriverRides.get(d) || 0) + 1);
  });
  const all = new Set([...cust.keys(), ...drv.keys(), ...authCust, ...authDrv]);
  const rows = [];
  all.forEach((m) => {
    const isCust = cust.has(m) || authCust.has(m);
    const isDrv = drv.has(m) || authDrv.has(m);
    if (!(isCust && isDrv)) return;
    const c = cust.get(m) || {}, d = drv.get(m) || {};
    const cr = asCustomerRides.get(m) || 0, dr = asDriverRides.get(m) || 0;
    let hint = "no rides either way: keep whichever role the person actually uses";
    if (cr > 0 && dr === 0) hint = "has rides as a CUSTOMER only: the driver account is probably the mistake";
    else if (dr > 0 && cr === 0) hint = "has rides as a DRIVER only: the customer account is probably the mistake";
    else if (cr > 0 && dr > 0) hint = "has rides in BOTH roles: check with the person before deleting anything";
    else if (d.kyc === "Approved") hint = "driver KYC is Approved: probably a real driver, the customer account is the extra one";
    rows.push({
      mobile: m,
      customerName: c.name || "",
      driverName: d.name || "",
      driverKyc: d.kyc || "",
      fleetOwner: !!d.fleetOwner,
      customerHasRecord: cust.has(m), customerHasLogin: authCust.has(m),
      driverHasRecord: drv.has(m), driverHasLogin: authDrv.has(m),
      ridesAsCustomer: cr, ridesAsDriver: dr, hint,
    });
  });
  return rows.sort((a, b) => a.mobile.localeCompare(b.mobile));
}

const csvCell = (v) => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

async function main() {
  const [, , keyPathArg, ...flagArgs] = process.argv;
  if (!keyPathArg || keyPathArg.startsWith("--")) { console.error("Usage: node listDualRoleNumbers.js /path/to/serviceAccountKey.json [--csv]"); process.exit(1); }
  const admin = require("firebase-admin");
  admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyPathArg))) });
  const db = admin.firestore();
  const [cSnap, dSnap, bSnap] = await Promise.all([db.collection("customers").get(), db.collection("drivers").get(), db.collection("bookings").get()]);
  const authEmails = [];
  let page;
  do {
    const res = await admin.auth().listUsers(1000, page);
    res.users.forEach((u) => { if (u.email && u.email.endsWith("@customer." + PIN_DOMAIN) || u.email && u.email.endsWith("@driver." + PIN_DOMAIN)) authEmails.push(u.email); });
    page = res.pageToken;
  } while (page);
  const rows = findDualRole({
    customers: cSnap.docs.map((x) => ({ id: x.id, ...x.data() })),
    drivers: dSnap.docs.map((x) => ({ id: x.id, ...x.data() })),
    bookings: bSnap.docs.map((x) => x.data()),
    authEmails,
  });
  if (flagArgs.includes("--csv")) {
    console.log("mobile,customer_name,driver_name,driver_kyc,fleet_owner,rides_as_customer,rides_as_driver,hint");
    rows.forEach((r) => console.log([r.mobile, r.customerName, r.driverName, r.driverKyc, r.fleetOwner ? "yes" : "", r.ridesAsCustomer, r.ridesAsDriver, r.hint].map(csvCell).join(",")));
    return;
  }
  console.log(`\n${rows.length} mobile number(s) are BOTH a Customer and a Driver.\n`);
  rows.forEach((r, i) => {
    console.log(`${i + 1}. ${r.mobile}   customer: ${r.customerName || "-"}   driver: ${r.driverName || "-"}${r.driverKyc ? ` (KYC ${r.driverKyc})` : ""}${r.fleetOwner ? " [transporter]" : ""}`);
    console.log(`     rides as customer: ${r.ridesAsCustomer}   rides as driver: ${r.ridesAsDriver}`);
    console.log(`     -> ${r.hint}`);
  });
  console.log("\nNothing was changed. To remove an account use Admin -> Customers / Drivers -> the row -> Delete.");
}

module.exports = { findDualRole };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
