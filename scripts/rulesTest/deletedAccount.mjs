// DELETED ACCOUNT (owner 2026-11-22: "even if I delete it keeps reappearing ... delete it from the system") -- Firestore rules regression test, run in the local emulator like
// roleLock.mjs (see access.mjs for how to run it). Every line must say "ok". `auth_time` is the second the login was made (an ID token claim): a session whose login is OLDER than
// the deletion (a phone still signed in on an old token) can no longer re-create the profile / a booking / an activity record; a login made AFTER the deletion (signing up again) can.
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, updateDoc, getDoc } from "firebase/firestore";
const env = await initializeTestEnvironment({ projectId: "demo-test", firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url).pathname, "utf8"), host: "127.0.0.1", port: 8089 } });
const memo = new Map(); const fs = (k, mk) => { if (!memo.has(k)) memo.set(k, mk().firestore()); return memo.get(k); };
const T0 = 1_800_000_000; // the deletion moment (seconds)
const cus = (m, authTime) => fs(`c${m}${authTime}`, () => env.authenticatedContext("c" + m, { email: `${m}@customer.apnatransport.local`, auth_time: authTime }));
const drv = (m, authTime) => fs(`d${m}${authTime}`, () => env.authenticatedContext("d" + m, { email: `${m}@driver.apnatransport.local`, auth_time: authTime }));
const adm = () => fs("a1", () => env.authenticatedContext("a1", { admin: true }));
const seed = async (docs) => env.withSecurityRulesDisabled(async (c) => { const f = c.firestore(); for (const [col, id, d] of docs) await setDoc(doc(f, col, id), d); });
const out = []; const t = async (name, docs, fn, expectOk) => { await env.clearFirestore(); await seed(docs); let ok; try { await fn(); ok = true; } catch { ok = false; } out.push([ok === expectOk ? "ok  " : "BUG?", name, ok ? "allowed" : "denied"]); };
const M = "9100000001";
const TOMB = [["deletedAccounts", M, { deletedAtSec: T0, role: "customer" }]];
const bk = { customerMobile: M, pickup: "A", drop: "B", status: "AwaitingDriver", declinedBy: [] };
await t("no tombstone: customer creates profile (unchanged)", [], () => setDoc(doc(cus(M, T0 - 50), "customers", M), { mobile: M, name: "R" }), true);
await t("STALE customer session cannot re-create the deleted profile", TOMB, () => setDoc(doc(cus(M, T0 - 50), "customers", M), { mobile: M, name: "R" }), false);
await t("STALE customer session cannot even merge a nameless profile", TOMB, () => setDoc(doc(cus(M, T0 - 50), "customers", M), { appVersionCode: 5 }, { merge: true }), false);
await t("a NEW login (after the deletion) can sign up again", TOMB, () => setDoc(doc(cus(M, T0 + 50), "customers", M), { mobile: M, name: "R" }), true);
await t("STALE driver session cannot re-create the deleted driver profile", [["deletedAccounts", M, { deletedAtSec: T0, role: "driver" }]], () => setDoc(doc(drv(M, T0 - 50), "drivers", M), { mobile: M, name: M, kyc: null }), false);
await t("a new driver login after the deletion can sign up again", [["deletedAccounts", M, { deletedAtSec: T0, role: "driver" }]], () => setDoc(doc(drv(M, T0 + 50), "drivers", M), { mobile: M, name: "K", kyc: "Pending" }), true);
await t("STALE session cannot create a booking", TOMB, () => setDoc(doc(cus(M, T0 - 50), "bookings", "B1"), bk), false);
await t("a new login can create a booking", TOMB, () => setDoc(doc(cus(M, T0 + 50), "bookings", "B1"), bk), true);
await t("STALE session cannot write a customerFlow record", TOMB, () => setDoc(doc(cus(M, T0 - 50), "customerFlow", `${M}_1`), { customerMobile: M, events: [] }), false);
await t("no tombstone: customerFlow write works (unchanged)", [], () => setDoc(doc(cus(M, T0 - 50), "customerFlow", `${M}_1`), { customerMobile: M, events: [] }), true);
await t("an existing profile is still editable by its owner when a tombstone of ANOTHER number exists", [["deletedAccounts", "9999999999", { deletedAtSec: T0 }], ["customers", M, { mobile: M, name: "R" }]], () => updateDoc(doc(cus(M, T0 - 50), "customers", M), { name: "R2" }), true);
await t("Admin may still create a profile", TOMB, () => setDoc(doc(adm(), "customers", M), { mobile: M, name: "R" }), true);
await t("nobody but the server writes deletedAccounts (customer)", [], () => setDoc(doc(cus(M, T0 + 50), "deletedAccounts", M), { deletedAtSec: 1 }), false);
await t("nobody but the server writes deletedAccounts (even Admin from the app)", [], () => setDoc(doc(adm(), "deletedAccounts", M), { deletedAtSec: 1 }), false);
await t("a customer cannot read deletedAccounts", TOMB, () => getDoc(doc(cus(M, T0 + 50), "deletedAccounts", M)), false);
await t("Admin can read deletedAccounts", TOMB, () => getDoc(doc(adm(), "deletedAccounts", M)), true);
console.log(out.map((r) => r.join("  ")).join("\n")); await env.cleanup(); process.exit(out.some((r) => r[0] !== "ok  ") ? 1 : 0);
