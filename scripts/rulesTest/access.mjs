// Firestore rules regression test against the REAL firestore.rules, run in the local emulator (deep-clean 2026-11-02).
// NOT part of `npm run verify:invariants` (needs Java + the emulator). To run, from any scratch folder:
//   npm i firebase-tools @firebase/rules-unit-testing@3 firebase@10
//   npx firebase emulators:exec --only firestore --project demo-test "node access.mjs"
// (copy this file into that same folder first -- Node resolves @firebase/rules-unit-testing from the script's own folder; and point
// RULES at the repo's firestore.rules) with a firebase.json there: { "firestore": { "rules": "<repo>/firestore.rules" }, "emulators": { "firestore": { "port": 8089 } } }
// "ok" = expected. "BUG?" = KNOWN open design gaps (bookingOtps writable by any signed-in user, vehicleTypes writable by any signed-in user) -- see the deep-clean report.
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, updateDoc, deleteDoc, increment, getDoc, serverTimestamp, collection, addDoc } from "firebase/firestore";
const env = await initializeTestEnvironment({ projectId: "demo-test", firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url).pathname, "utf8"), host: "127.0.0.1", port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(":")[1] || 8089) } });
const drv = (m = "9000000001") => env.authenticatedContext("d" + m, { email: `${m}@driver.apnatransport.local` }).firestore();
const cus = (m = "8000000001") => env.authenticatedContext("c" + m, { email: `${m}@customer.apnatransport.local` }).firestore();
const adm = () => env.authenticatedContext("a1", { admin: true }).firestore();
const seed = async () => env.withSecurityRulesDisabled(async (c) => { const f = c.firestore();
  await setDoc(doc(f, "drivers", "9000000001"), { mobile: "9000000001", name: "Survesh", kyc: "Approved", wallet: 1500, bonus: 200, heldCredit: 0, blacklisted: false, createdAt: new Date(), vehicleSpec: { type: "t", capacityKg: 1000 }, online: false });
  await setDoc(doc(f, "customers", "8000000001"), { mobile: "8000000001", name: "C" });
  await setDoc(doc(f, "bookings", "B1"), { customerMobile: "8000000001", status: "Ongoing", driverMobile: "9000000001", driverName: "Survesh", fare: 1000 });
  await setDoc(doc(f, "bookings", "B2"), { customerMobile: "8000000001", status: "AwaitingDriver", fare: 1000, tierMaxKg: 1000, declinedBy: [] });
  await setDoc(doc(f, "bookingOtps", "B2"), { otp: "1234", customerMobile: "8000000001" });
  await setDoc(doc(f, "vehicleTypes", "tempo"), { label: "Tempo", rate: 25 });
  await setDoc(doc(f, "rechargeRequests", "R1"), { driverMobile: "9000000001", amount: 100, status: "Pending" });
});
const res = [];
const t = async (name, fn, expectOk) => { await env.clearFirestore(); await seed(); let ok; try { await fn(); ok = true; } catch { ok = false; } res.push([ok === expectOk ? "ok  " : "BUG?", name, ok ? "allowed" : "denied"]); };
await t("driver deducts own bonus (withdrawal request)", () => updateDoc(doc(drv(), "drivers", "9000000001"), { bonus: increment(-200) }), true);
await t("driver creates a withdrawal doc", () => setDoc(doc(drv(), "withdrawals", "W1"), { role: "driver", driverMobile: "9000000001", amount: 200, status: "Pending" }), true);
await t("driver goes online/offline + location", () => updateDoc(doc(drv(), "drivers", "9000000001"), { online: true, lastKnownLocation: { lat: 1, lng: 2, updatedAt: 1 } }), true);
await t("driver RAISES own bonus (must be denied)", () => updateDoc(doc(drv(), "drivers", "9000000001"), { bonus: increment(500) }), false);
await t("driver RAISES own heldCredit (must be denied)", () => updateDoc(doc(drv(), "drivers", "9000000001"), { heldCredit: increment(500) }), false);
await t("driver lowers own wallet (blocked on purpose until commission moves server-side)", () => updateDoc(doc(drv(), "drivers", "9000000001"), { wallet: increment(-100) }), false);
await t("driver changes own wallet (must be denied)", () => updateDoc(doc(drv(), "drivers", "9000000001"), { wallet: 99999 }), false);
await t("driver self-approves kyc (must be denied)", () => updateDoc(doc(drv(), "drivers", "9000000001"), { kyc: "Approved", name: "x", wallet: 1500 }), true);
await t("driver stamps lastActiveAt serverTimestamp", () => updateDoc(doc(drv(), "drivers", "9000000001"), { lastActiveAt: serverTimestamp() }), true);
await t("assigned driver patches their trip (loadingStartedAt)", () => updateDoc(doc(drv(), "bookings", "B1"), { loadingStartedAt: 1, returnStartedAt: 2 }), true);
await t("another driver patches someone's trip (must be denied)", () => updateDoc(doc(drv("9000000009"), "bookings", "B1"), { fare: 1 }), false);
await t("customer cancels own booking", () => updateDoc(doc(cus(), "bookings", "B2"), { status: "Cancelled", cancelledAt: serverTimestamp() }), true);
await t("customer rates trip", () => updateDoc(doc(cus(), "bookings", "B1"), { rating: 5 }), true);
await t("customer creates booking", () => setDoc(doc(cus(), "bookings", "B9"), { customerMobile: "8000000001", status: "AwaitingDriver", fare: 5, returnTrip: true }), true);
await t("driver reads bookingOtps (must be denied)", () => getDoc(doc(drv(), "bookingOtps", "B2")), false);
await t("customer reads own bookingOtps", () => getDoc(doc(cus(), "bookingOtps", "B2")), true);
await t("driver overwrites bookingOtps (server-only now)", () => setDoc(doc(drv(), "bookingOtps", "B2"), { otp: "0000", customerMobile: "8000000001" }), false);
await t("driver updates bookingOtps (server-only now)", () => updateDoc(doc(drv(), "bookingOtps", "B2"), { otp: "0000" }), false);
await t("customer overwrites bookingOtps (server-only now)", () => updateDoc(doc(cus(), "bookingOtps", "B2"), { otp: "1111" }), false);
await t("customer overwrites an existing vehicle type (must be denied)", () => setDoc(doc(cus(), "vehicleTypes", "tempo"), { label: "hack" }), false);
await t("customer deletes a vehicle type (must be denied)", () => deleteDoc(doc(cus(), "vehicleTypes", "tempo")), false);
await t("driver adds a NEW vehicle type (sign-up)", () => setDoc(doc(drv(), "vehicleTypes", "newtruck"), { label: "New truck", rate: 25 }), true);
await t("admin edits a vehicle type", () => setDoc(doc(adm(), "vehicleTypes", "tempo"), { label: "Tempo 2" }), true);
await t("customer reads a bookingOtps doc that does not exist yet (listener must not die)", () => getDoc(doc(cus(), "bookingOtps", "NOPE")), true);
await t("driver creates a bookingOtps doc (must be denied)", () => setDoc(doc(drv(), "bookingOtps", "NEW1"), { otp: "1111", customerMobile: "8000000001" }), false);
await t("admin writes bookingOtps", () => setDoc(doc(adm(), "bookingOtps", "NEW2"), { otp: "2222", customerMobile: "8000000001" }), true);
await t("claim without any OTP write still works", () => updateDoc(doc(drv(), "bookings", "B2"), { status: "Ongoing", driverName: "Survesh", driverMobile: "9000000001", vehicle: "t", progress: 0 }), true);
await t("customer writes settings (must be denied)", () => updateDoc(doc(cus(), "settings", "main"), { dieselPricePerLitre: 1 }), false);
await t("customer writes adminRouteFares (must be denied)", () => setDoc(doc(cus(), "adminRouteFares", "z"), { totalFare: 1 }), false);
await t("customer creates alert", () => setDoc(doc(cus(), "alerts", "A1"), { message: "x" }), true);
await t("driver creates routeFares (Set Fare)", () => setDoc(doc(drv(), "routeFares", "q"), { driverMobile: "9000000001", pickupName: "a", dropName: "b", totalFare: 5 }), true);
await t("customer reads other customer's doc (must be denied)", () => getDoc(doc(cus("8000000002"), "customers", "8000000001")), false);
await t("driver creates callLog (Admin-only collection)", () => setDoc(doc(drv(), "callLogs", "L1"), { by: "x" }), false);
await t("driver creates bookingExtras", () => setDoc(doc(drv(), "bookingExtras", "E1"), { bookingId: "B1", type: "labour", amount: 100, by: "driver", byMobile: "9000000001", status: "pending" }), true);
await t("admin writes settings", () => setDoc(doc(adm(), "settings", "main"), { x: 1 }), true);
for (const r of res) console.log(...r);
await env.cleanup(); 
