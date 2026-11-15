// NO DRIVER WITHOUT THE FORM, ON THE SERVER TOO (owner 2026-11-15) -- Firestore rules regression test, run in the local emulator like roleLock.mjs / access.mjs
// (copy into the scratch folder with the firebase tooling and run through `firebase emulators:exec --only firestore --project demo-test "node driverSignup.mjs"`). Every line must say "ok".
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, updateDoc } from "firebase/firestore";
const env = await initializeTestEnvironment({ projectId: "demo-test", firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url).pathname, "utf8"), host: "127.0.0.1", port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(":")[1] || 8089) } });
const memo = new Map(); const fsOf = (k, mk) => { if (!memo.has(k)) memo.set(k, mk().firestore()); return memo.get(k); };
const drv = (m) => fsOf("d" + m, () => env.authenticatedContext("d" + m, { email: `${m}@driver.apnatransport.local` }));
const adm = () => fsOf("a1", () => env.authenticatedContext("a1", { admin: true }));
const anon = () => fsOf("anon", () => env.unauthenticatedContext());
const seed = async (docs) => env.withSecurityRulesDisabled(async (c) => { const f = c.firestore(); for (const [col, id, d] of docs) await setDoc(doc(f, col, id), d); });
const out = []; const t = async (name, docs, fn, expectOk) => { await env.clearFirestore(); await seed(docs); let ok; try { await fn(); ok = true; } catch { ok = false; } out.push([ok === expectOk ? "ok  " : "BUG?", name]); };
const M = "9111111111", N = "9222222222";
const created = new Date();
const blank = (m) => [["drivers", m, { mobile: m, name: m, kyc: null, online: true, wallet: 500, bonus: 0, heldCredit: 0, rating: 4.5, blacklisted: false, docs: null, vehicleSpec: null, createdAt: created }]];
const full = (m, extra = {}) => [["drivers", m, { mobile: m, name: "Ramesh", kyc: "Approved", online: true, wallet: 500, bonus: 0, heldCredit: 0, blacklisted: false, docs: { dl: { url: "u" }, photo: { url: "u" } }, vehicleSpec: { type: "tempo", capacityKg: 1000, vehicleNumber: "MH12AB1234", photoSide: { url: "u" } }, createdAt: created, ...extra }]];
const ref = (c, m) => doc(c, "drivers", m);
// ---- the hole: a driver making himself a fleet owner (the old sign-up "I own several vehicles" -> instant account with no documents)
await t("empty profile: own phone CANNOT set fleetOwner true (old app's fleet sign-up)", blank(M), () => updateDoc(ref(drv(M), M), { fleetOwner: true, kyc: "Pending", vehicleSpec: { type: "fleet", capacityKg: null, vehicleNumber: null, fleet: true } }), false);
await t("empty profile: own phone CANNOT set kyc Approved", blank(M), () => updateDoc(ref(drv(M), M), { kyc: "Approved" }), false);
await t("empty profile: own phone CANNOT raise wallet", blank(M), () => updateDoc(ref(drv(M), M), { wallet: 99999 }), false);
await t("approved driver: own phone CANNOT set fleetOwner true", full(M), () => updateDoc(ref(drv(M), M), { fleetOwner: true }), false);
await t("create own profile with fleetOwner true is refused", [], () => setDoc(ref(drv(M), M), { mobile: M, name: M, kyc: null, fleetOwner: true, createdAt: created }), false);
// ---- the KYC-portal link (no login) keeps working for the legitimate writes, and only those
await t("portal link (no login): can submit name + photo + docs + vehicleSpec + kyc Pending", blank(M), () => updateDoc(ref(anon(), M), { name: "Ramesh", photo: { url: "u" }, docs: { dl: { url: "u" }, photo: { url: "u" } }, vehicleSpec: { type: "tempo", capacityKg: 1000, vehicleNumber: "MH12AB1234" }, kyc: "Pending" }), true);
await t("portal link (no login): CANNOT set kyc Approved", blank(M), () => updateDoc(ref(anon(), M), { kyc: "Approved" }), false);
await t("portal link (no login): CANNOT set fleetOwner true", blank(M), () => updateDoc(ref(anon(), M), { fleetOwner: true }), false);
await t("portal link (no login): CANNOT raise wallet", blank(M), () => updateDoc(ref(anon(), M), { wallet: 99999 }), false);
await t("portal link (no login): CANNOT touch a driver whose KYC is already filled", full(M), () => updateDoc(ref(anon(), M), { name: "Hacker" }), false);
// ---- everything that must keep working
await t("new driver account: own phone creates the normal empty profile", [], () => setDoc(ref(drv(M), M), { mobile: M, name: M, kyc: null, online: true, wallet: 500, bonus: 0, heldCredit: 0, blacklisted: false, docs: null, vehicleSpec: null, createdAt: created }), true);
await t("empty profile: own phone submits the finished form (docs + vehicleSpec + kyc Pending)", blank(M), () => updateDoc(ref(drv(M), M), { name: "Ramesh", docs: { dl: { url: "u" }, photo: { url: "u" } }, vehicleSpec: { type: "tempo", capacityKg: 1000, vehicleNumber: "MH12AB1234", photoSide: { url: "u" } }, kyc: "Pending" }), true);
await t("approved driver: own phone toggles duty / writes lastActiveAt", full(M), () => updateDoc(ref(drv(M), M), { online: false, lastActiveAt: new Date() }), true);
await t("existing fleet owner: own phone writes the same fleetOwner value back (full-profile save)", full(M, { fleetOwner: true, fleetSetupDone: false, fleetVehicleCount: 0 }), () => updateDoc(ref(drv(M), M), { fleetOwner: true, name: "Ramesh K", fleetVehicleCount: 1, fleetSetupDone: true }), true);
await t("another driver cannot change someone else's profile", full(M), () => updateDoc(ref(drv(N), M), { online: false }), false);
await t("Admin approves a driver", full(M, { kyc: "Pending" }), () => updateDoc(ref(adm(), M), { kyc: "Approved" }), true);
await t("Admin can make a driver a fleet owner", full(M), () => updateDoc(ref(adm(), M), { fleetOwner: true }), true);
await t("empty profile without a createdAt field (older doc): own phone can still save the form", [["drivers", M, { mobile: M, name: M, kyc: null, wallet: 500, bonus: 0, heldCredit: 0, blacklisted: false, docs: null, vehicleSpec: null }]], () => updateDoc(ref(drv(M), M), { name: "Ramesh", kyc: "Pending" }), true);
console.log(out.map((r) => r.join("  ")).join("\n")); await env.cleanup(); process.exit(out.some((r) => r[0] !== "ok  ") ? 1 : 0);
