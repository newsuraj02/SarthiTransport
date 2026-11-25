// Admin script (owner 2026-11-25): remove the fraud accounts that start random rides to waste drivers' and customers' time -- "Nishant Petrol Pump", "Dharmendra",
// "Atul Petrol Pump", "Ganesh Arde" (English or Hindi spelling) -- together with every ride they are on, and take them out of the Customers AND Drivers lists for good.
//
// SAFE BY DEFAULT: with no --apply it is a DRY RUN that writes NOTHING. It looks the names up (a name can match a real person, "Dharmendra" is a common name), and for each
// match prints the role, name, mobile, and the rides on that number (by status), so YOU choose the exact mobile numbers. Only numbers you pass to --apply are touched.
//
// Usage:
//   cd scripts
//   npm install
//   node removeFraudUsers.js /path/to/serviceAccountKey.json                              -> dry run: lists the matches and their rides, deletes nothing
//   node removeFraudUsers.js /path/to/serviceAccountKey.json --apply 9XXXXXXXXX,9YYYYYYYYY -> deletes ONLY those numbers (asks you to type DELETE first)
//
// What --apply does for each number (same steps as Admin's Delete button, adminDeleteAccount, minus its "refuse while a trip is running" check because the rides go first):
//   1. every booking where the number is the customer or the driver (any status), with its ring leftovers and pickup OTP;
//   2. the login (sign-in e-mail for each role + any phone login), tokens revoked, so nobody can sign in again on any phone;
//   3. a small tombstone (deletedAccounts/{mobile}) so a phone that is still signed in cannot re-create the profile;
//   4. the profile in customers / drivers and what hangs off it (customer activity, driver WhatsApp status, owned fleet vehicles).
// NOT done: Storage photos (KYC / profile pictures) stay in the bucket; the number can only come back by signing up again.

const path = require("path");
const readline = require("readline");

// Each pattern = every group must be found in the name; a group matches when ANY of its spellings is there.
const FRAUD_PATTERNS = [
  { label: "Nishant Petrol Pump", groups: [["nishant", "nishaant", "निशांत", "निशान्त"], ["petrol", "पेट्रोल", "पेट्रोल"]] },
  { label: "Dharmendra", groups: [["dharmendra", "dharmender", "dharmendar", "धर्मेंद्र", "धर्मेन्द्र", "धर्मेंदर"]] },
  { label: "Atul Petrol Pump", groups: [["atul", "अतुल"], ["petrol", "पेट्रोल"]] },
  { label: "Ganesh Arde", groups: [["ganesh", "गणेश"], ["arde", "arda", "ardhe", "अर्डे", "अरडे", "आर्डे"]] },
];

const norm = (s) => String(s || "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
function matchedPatterns(name) {
  const n = norm(name);
  if (!n) return [];
  return FRAUD_PATTERNS.filter((p) => p.groups.every((g) => g.some((w) => n.includes(w)))).map((p) => p.label);
}
const pinAuthEmail = (mobile, role) => `${mobile}@${role === "driver" ? "driver" : "customer"}.apnatransport.local`;
const tsMs = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : v && v.seconds ? v.seconds * 1000 : Number(v) || 0);
const when = (v) => { const ms = tsMs(v); return ms ? new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "-"; };

async function main(argv) {
  const [, , keyPathArg, ...rest] = argv;
  if (!keyPathArg) { console.error("Usage: node removeFraudUsers.js <serviceAccountKey.json> [--apply 9XXXXXXXXX,9YYYYYYYYY]"); process.exit(1); }
  const applyAt = rest.indexOf("--apply");
  const applyMobiles = applyAt >= 0 ? String(rest[applyAt + 1] || "").split(",").map((x) => x.trim()).filter(Boolean) : null;
  if (applyAt >= 0 && (!applyMobiles.length || applyMobiles.some((m) => !/^\d{10}$/.test(m)))) { console.error("--apply needs one or more 10-digit mobile numbers, comma separated (no spaces)."); process.exit(1); }

  const admin = require("firebase-admin");
  admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyPathArg))) });
  const db = admin.firestore();
  const auth = admin.auth();

  if (!applyMobiles) {
    // ---- DRY RUN ----
    const [custSnap, drvSnap, bookSnap] = await Promise.all([db.collection("customers").get(), db.collection("drivers").get(), db.collection("bookings").get()]);
    const bookings = bookSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const ridesOf = (m) => bookings.filter((b) => b.customerMobile === m || b.driverMobile === m);
    const hits = [];
    custSnap.forEach((d) => { const x = d.data(); const m = matchedPatterns(x.name); if (m.length) hits.push({ role: "customer", mobile: d.id, name: x.name, created: x.createdAt, patterns: m }); });
    drvSnap.forEach((d) => { const x = d.data(); const m = matchedPatterns(x.name); if (m.length) hits.push({ role: "driver", mobile: d.id, name: x.name, created: x.createdAt, patterns: m, extra: `KYC ${x.kyc || "-"}, duty ${x.online ? "on" : "off"}` }); });
    console.log(`\nDRY RUN -- nothing is written. ${hits.length} account(s) match by name:\n`);
    for (const h of hits) {
      const rides = ridesOf(h.mobile);
      const by = {}; rides.forEach((b) => { by[b.status] = (by[b.status] || 0) + 1; });
      console.log(`  [${h.role}] ${h.name}  |  mobile ${h.mobile}  |  created ${when(h.created)}  |  matches: ${h.patterns.join(", ")}${h.extra ? "  |  " + h.extra : ""}`);
      console.log(`      rides on this number: ${rides.length}${rides.length ? "  (" + Object.entries(by).map(([k, v]) => `${k} ${v}`).join(", ") + ")" : ""}${by.Ongoing ? "   <-- has Ongoing trip(s)" : ""}`);
      rides.slice(0, 3).forEach((b) => console.log(`        - ${b.status}: ${String(b.pickup || "").slice(0, 40)} -> ${String(b.drop || "").slice(0, 40)}  (${when(b.createdAt)})`));
    }
    const known = new Set(hits.map((h) => h.mobile));
    const orphan = {};
    bookings.forEach((b) => { if (matchedPatterns(b.customerName).length && !known.has(b.customerMobile)) (orphan[b.customerMobile] = orphan[b.customerMobile] || []).push(b); });
    const orphanKeys = Object.keys(orphan);
    if (orphanKeys.length) {
      console.log(`\nRides whose customer NAME matches but the customer account is not in the list above (account already gone, or a different number):`);
      orphanKeys.forEach((m) => console.log(`  mobile ${m}: ${orphan[m].length} ride(s), name "${orphan[m][0].customerName}"`));
    }
    console.log(`\nNext: pick the real fraud numbers from the list above and run:\n  node removeFraudUsers.js ${keyPathArg} --apply 9XXXXXXXXX,9YYYYYYYYY\n`);
    return;
  }

  // ---- APPLY (only the numbers you named) ----
  console.log(`\nAbout to PERMANENTLY delete these numbers, all their rides, their logins and their Customer / Driver profiles:\n  ${applyMobiles.join(", ")}\n`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((res) => rl.question("Type DELETE to continue: ", res));
  rl.close();
  if (answer.trim() !== "DELETE") { console.log("Cancelled. Nothing was deleted."); return; }

  for (const m of applyMobiles) {
    const refs = new Map();
    const take = async (q) => { const s = await q.get(); s.docs.forEach((d) => refs.set(d.ref.path, { ref: d.ref, id: d.id })); };
    await take(db.collection("bookings").where("customerMobile", "==", m));
    await take(db.collection("bookings").where("driverMobile", "==", m));
    const bookingIds = [...refs.values()].map((x) => x.id);
    for (const id of bookingIds) {
      try { await db.collection("bookingOtps").doc(id).delete(); } catch (e) { /* none */ }
      const ex = await db.collection("bookingExtras").where("bookingId", "==", id).get();
      for (const d of ex.docs) await d.ref.delete();
      const r = await db.collection("ringDeliveries").where("bookingId", "==", id).get();
      for (const d of r.docs) await d.ref.delete();
    }
    for (const { ref } of refs.values()) await ref.delete();
    console.log(`${m}: deleted ${bookingIds.length} ride(s)`);

    let tombRole = null;
    for (const role of ["customer", "driver"]) {
      const col = role === "driver" ? "drivers" : "customers";
      const profileRef = db.collection(col).doc(m);
      const profile = await profileRef.get();
      let login = null;
      try { login = await auth.getUserByEmail(pinAuthEmail(m, role)); } catch (e) { if (e.code !== "auth/user-not-found") throw e; }
      if (!profile.exists && !login) continue;
      tombRole = tombRole || role;
      if (login) { await auth.revokeRefreshTokens(login.uid); await auth.deleteUser(login.uid); }
      await db.collection("deletedAccounts").doc(m).set({ deletedAtSec: Math.floor(Date.now() / 1000), role: tombRole, at: admin.firestore.FieldValue.serverTimestamp() });
      if (profile.exists) await profileRef.delete();
      if (role === "customer") { const fl = await db.collection("customerFlow").where("customerMobile", "==", m).get(); for (const d of fl.docs) await d.ref.delete(); }
      if (role === "driver") {
        await db.collection("whatsappStatus").doc(m).delete().catch(() => {});
        const fv = await db.collection("fleetVehicles").where("ownerMobile", "==", m).get();
        for (const d of fv.docs) { await d.ref.delete(); await db.collection("fleetVehiclePrivate").doc(d.id).delete().catch(() => {}); }
      }
      console.log(`${m}: removed the ${role} account${login ? " (login + profile)" : " (profile only, it had no login)"}`);
    }
    // an older phone-number login, only when no profile of either role is left on the number
    try { const ph = await auth.getUserByPhoneNumber(`+91${m}`); await auth.deleteUser(ph.uid); console.log(`${m}: removed the phone login`); } catch (e) { if (e.code !== "auth/user-not-found") console.error(`${m}: phone login cleanup:`, e.message); }
  }
  console.log("\nDone.");
}

module.exports = { FRAUD_PATTERNS, matchedPatterns, pinAuthEmail, main };
if (require.main === module) main(process.argv).catch((e) => { console.error(e); process.exit(1); });
