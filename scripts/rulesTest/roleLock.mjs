// ONE ROLE PER MOBILE NUMBER (owner 2026-11-12) -- Firestore rules regression test, run in the local emulator like access.mjs / claim.mjs
// (see access.mjs for how to run it: copy into the scratch folder with the firebase tooling and run through `firebase emulators:exec`).
// Every line must say "ok".
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
const env = await initializeTestEnvironment({ projectId: "demo-test", firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url).pathname, "utf8"), host: "127.0.0.1", port: 8089 } });
const memo = new Map(); const fs = (k, mk) => { if (!memo.has(k)) memo.set(k, mk().firestore()); return memo.get(k); };
const drv = (m) => fs("d" + m, () => env.authenticatedContext("d" + m, { email: `${m}@driver.apnatransport.local` }));
const cus = (m) => fs("c" + m, () => env.authenticatedContext("c" + m, { email: `${m}@customer.apnatransport.local` }));
const adm = () => fs("a1", () => env.authenticatedContext("a1", { admin: true }));
const seed = async (docs) => env.withSecurityRulesDisabled(async (c) => { const f = c.firestore(); for (const [col, id, d] of docs) await setDoc(doc(f, col, id), d); });
const out = []; const t = async (name, docs, fn, expectOk) => { await env.clearFirestore(); await seed(docs); let ok; try { await fn(); ok = true; } catch { ok = false; } out.push([ok === expectOk ? "ok  " : "BUG?", name, ok ? "allowed" : "denied"]); };
const M = "7043758986";
const C = [["customers", M, { mobile: M, name: "Kaif" }]], D = [["drivers", M, { mobile: M, name: "Kaif", kyc: "Pending", blacklisted: false, wallet: 0, bonus: 0, heldCredit: 0, createdAt: new Date(), vehicleSpec: { type: "t", capacityKg: 500 } }]];
await t("customer number: customer updates own profile", C, () => updateDoc(doc(cus(M), "customers", M), { name: "K2" }), true);
await t("customer number: DRIVER profile create refused", C, () => setDoc(doc(drv(M), "drivers", M), { mobile: M, name: "Kaif", kyc: "Pending" }), false);
await t("driver number: CUSTOMER profile create refused", D, () => setDoc(doc(cus(M), "customers", M), { mobile: M, name: "Kaif" }), false);
await t("fresh number: customer profile create allowed", [], () => setDoc(doc(cus(M), "customers", M), { mobile: M, name: "K" }), true);
await t("fresh number: driver profile create allowed", [], () => setDoc(doc(drv(M), "drivers", M), { mobile: M, name: "K", kyc: "Pending" }), true);
await t("already BOTH (grandfathered): driver still updates own profile", [...C, ...D], () => updateDoc(doc(drv(M), "drivers", M), { online: true }), true);
await t("already BOTH (grandfathered): customer still updates own profile", [...C, ...D], () => updateDoc(doc(cus(M), "customers", M), { name: "z" }), true);
await t("customer deletes own profile", C, () => deleteDoc(doc(cus(M), "customers", M)), true);
await t("customer number: Admin may still create a driver profile", C, () => setDoc(doc(adm(), "drivers", M), { mobile: M, name: "K" }), true);
await t("driver number: Admin may still create a customer profile", D, () => setDoc(doc(adm(), "customers", M), { mobile: M, name: "K" }), true);
await t("other customer cannot create someone else's customer profile", [], () => setDoc(doc(cus("9999999999"), "customers", M), { mobile: M }), false);
console.log(out.map((r) => r.join("  ")).join("\n")); await env.cleanup(); process.exit(out.some((r) => r[0] !== "ok  ") ? 1 : 0);
