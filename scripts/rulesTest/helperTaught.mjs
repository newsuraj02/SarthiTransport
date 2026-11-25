// TEACH AI (owner 2026-11-25) -- Firestore rules regression test for `helperTaught`: only Admin reads / writes the answers taught to the in-app helper; customers and drivers never see them.
// Run in the local emulator like roleLock.mjs (see access.mjs for how). Every line must say "ok".
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";
const env = await initializeTestEnvironment({ projectId: "demo-test", firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url).pathname, "utf8"), host: "127.0.0.1", port: 8089 } });
const memo = new Map(); const fs = (k, mk) => { if (!memo.has(k)) memo.set(k, mk().firestore()); return memo.get(k); };
const cus = () => fs("c", () => env.authenticatedContext("c1", { email: "9100000001@customer.apnatransport.local" }));
const drv = () => fs("d", () => env.authenticatedContext("d1", { email: "9100000002@driver.apnatransport.local" }));
const adm = () => fs("a", () => env.authenticatedContext("a1", { admin: true }));
const anon = () => fs("n", () => env.unauthenticatedContext());
const seed = async () => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), "helperTaught", "T1"), { role: "customer", question: "q", answer: "a" }); });
const out = []; const t = async (name, fn, expectOk) => { await env.clearFirestore(); await seed(); let ok; try { await fn(); ok = true; } catch { ok = false; } out.push([ok === expectOk ? "ok  " : "BUG?", name]); };
const D = { role: "customer", question: "q2", answer: "a2" };
await t("Admin reads a taught answer", () => getDoc(doc(adm(), "helperTaught", "T1")), true);
await t("Admin teaches a new answer", () => setDoc(doc(adm(), "helperTaught", "T2"), D), true);
await t("Admin edits a taught answer", () => updateDoc(doc(adm(), "helperTaught", "T1"), { answer: "better" }), true);
await t("Admin deletes a taught answer", () => deleteDoc(doc(adm(), "helperTaught", "T1")), true);
await t("a customer cannot read taught answers", () => getDoc(doc(cus(), "helperTaught", "T1")), false);
await t("a driver cannot read taught answers", () => getDoc(doc(drv(), "helperTaught", "T1")), false);
await t("a customer cannot teach the helper", () => setDoc(doc(cus(), "helperTaught", "T9"), D), false);
await t("a driver cannot edit a taught answer", () => updateDoc(doc(drv(), "helperTaught", "T1"), { answer: "x" }), false);
await t("a driver cannot delete a taught answer", () => deleteDoc(doc(drv(), "helperTaught", "T1")), false);
await t("a signed-out visitor cannot read or write", () => getDoc(doc(anon(), "helperTaught", "T1")), false);
console.log(out.map((r) => r.join("  ")).join("\n")); await env.cleanup(); process.exit(out.some((r) => r[0] !== "ok  ") ? 1 : 0);
