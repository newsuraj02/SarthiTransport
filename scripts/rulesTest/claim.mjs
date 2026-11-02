// Firestore rules regression test against the REAL firestore.rules, run in the local emulator (deep-clean 2026-11-02).
// NOT part of `npm run verify:invariants` (needs Java + the emulator). To run, from any scratch folder:
//   npm i firebase-tools @firebase/rules-unit-testing@3 firebase@10
//   npx firebase emulators:exec --only firestore --project demo-test "node <repo>/scripts/rulesTest/claim.mjs"
// with a firebase.json there: { "firestore": { "rules": "<repo>/firestore.rules" }, "emulators": { "firestore": { "port": 8089 } } }
// Every line must be PASS: the Return Load accept is a DISCOUNT-only exception on an unassigned booking.
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, updateDoc } from "firebase/firestore";
const rulesPath = process.env.RULES || new URL("../../firestore.rules", import.meta.url).pathname;
const env = await initializeTestEnvironment({ projectId: "demo-test", firestore: { rules: readFileSync(rulesPath, "utf8"), host: "127.0.0.1", port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(":")[1] || 8080) } });
const seed = async () => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), "bookings", "B1"), { customerMobile: "8000000001", status: "AwaitingDriver", fare: 1000, tierMaxKg: 1000, driverName: null, declinedBy: [], bids: [] }); });
const driver = () => env.authenticatedContext("d1", { email: "9000000001@driver.apnatransport.local" }).firestore();
const results = [];
const check = async (name, fn, expectOk) => { await env.clearFirestore(); await seed(); let ok; try { await fn(); ok = true; } catch (e) { ok = false; } results.push([ok === expectOk ? "PASS" : "FAIL", name, `(expected ${expectOk ? "allow" : "deny"}, got ${ok ? "allow" : "deny"})`]); };
const claim = { status: "Ongoing", driverName: "Survesh", driverMobile: "9000000001", vehicle: "tempo", progress: 0 };
await check("normal claim", () => updateDoc(doc(driver(), "bookings", "B1"), claim), true);
await check("return-load claim: 15% lower fare + originalFare", () => updateDoc(doc(driver(), "bookings", "B1"), { ...claim, fare: 850, originalFare: 1000, isReturn: true, returnPct: 15 }), true);
await check("claim that RAISES the fare", () => updateDoc(doc(driver(), "bookings", "B1"), { ...claim, fare: 5000, originalFare: 1000, isReturn: true, returnPct: 15 }), false);
await check("lower fare but wrong originalFare", () => updateDoc(doc(driver(), "bookings", "B1"), { ...claim, fare: 850, originalFare: 999, isReturn: true, returnPct: 15 }), false);
await check("lower fare without originalFare", () => updateDoc(doc(driver(), "bookings", "B1"), { ...claim, fare: 850, isReturn: true, returnPct: 15 }), false);
await check("touching customerMobile", () => updateDoc(doc(driver(), "bookings", "B1"), { ...claim, customerMobile: "9999999999" }), false);
await check("decline (declinedBy only)", () => updateDoc(doc(driver(), "bookings", "B1"), { declinedBy: ["Survesh"] }), true);
for (const r of results) console.log(...r);
await env.cleanup();
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
