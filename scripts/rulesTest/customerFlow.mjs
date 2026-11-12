// CUSTOMER FLOW TRACKING (owner 2026-11-12) -- Firestore rules regression test, run in the local emulator like access.mjs / claim.mjs
// (see access.mjs for how to run it: copy into the scratch folder with the firebase tooling and run through `firebase emulators:exec`).
// Every line must say "ok".
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection } from "firebase/firestore";
const env = await initializeTestEnvironment({ projectId: "demo-test", firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url).pathname, "utf8"), host: "127.0.0.1", port: 8089 } });
const memo = new Map(); const fs = (k, mk) => { if (!memo.has(k)) memo.set(k, mk().firestore()); return memo.get(k); };
const drv = (m) => fs("d" + m, () => env.authenticatedContext("d" + m, { email: `${m}@driver.apnatransport.local` }));
const cus = (m) => fs("c" + m, () => env.authenticatedContext("c" + m, { email: `${m}@customer.apnatransport.local` }));
const adm = () => fs("a1", () => env.authenticatedContext("a1", { admin: true }));
const seed = async (docs) => env.withSecurityRulesDisabled(async (c) => { const f = c.firestore(); for (const [col, id, d] of docs) await setDoc(doc(f, col, id), d); });
const out = []; const t = async (name, docs, fn, expectOk) => { await env.clearFirestore(); await seed(docs); let ok; try { await fn(); ok = true; } catch { ok = false; } out.push([ok === expectOk ? "ok  " : "BUG?", name, ok ? "allowed" : "denied"]); };
const M = "7043758986", O = "9000000009";
const S = (m, n = 3) => ({ customerMobile: m, customerName: "K", group: "current", stage: "opened", startedAt: 1, lastAt: 1, events: Array.from({ length: n }, (_, i) => ({ t: i, e: "tap", d: "x" })) });
const SEEDED = [["customerFlow", `${M}_1`, S(M)]];
await t("customer creates a session for THEIR OWN number", [], () => setDoc(doc(cus(M), "customerFlow", `${M}_1`), S(M)), true);
await t("customer cannot create a session for someone else's number", [], () => setDoc(doc(cus(O), "customerFlow", `${M}_1`), S(M)), false);
await t("customer updates their own session (merge)", SEEDED, () => setDoc(doc(cus(M), "customerFlow", `${M}_1`), { stage: "pickup", events: S(M, 5).events }, { merge: true }), true);
await t("another customer cannot rewrite it", SEEDED, () => updateDoc(doc(cus(O), "customerFlow", `${M}_1`), { stage: "booked" }), false);
await t("customer cannot move the session to another number", SEEDED, () => updateDoc(doc(cus(M), "customerFlow", `${M}_1`), { customerMobile: O }), false);
await t("a timeline over 250 entries is refused", [], () => setDoc(doc(cus(M), "customerFlow", `${M}_2`), S(M, 251)), false);
await t("a timeline of exactly 250 is allowed", [], () => setDoc(doc(cus(M), "customerFlow", `${M}_3`), S(M, 250)), true);
await t("customer cannot read sessions", SEEDED, () => getDoc(doc(cus(M), "customerFlow", `${M}_1`)), false);
await t("customer cannot list sessions", SEEDED, () => getDocs(collection(cus(M), "customerFlow")), false);
await t("Admin reads sessions", SEEDED, () => getDocs(collection(adm(), "customerFlow")), true);
await t("customer cannot delete a session", SEEDED, () => deleteDoc(doc(cus(M), "customerFlow", `${M}_1`)), false);
await t("Admin deletes a session", SEEDED, () => deleteDoc(doc(adm(), "customerFlow", `${M}_1`)), true);
console.log(out.map((r) => r.join("  ")).join("\n")); await env.cleanup(); process.exit(out.some((r) => r[0] !== "ok  ") ? 1 : 0);
