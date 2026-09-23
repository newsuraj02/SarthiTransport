// One-off migration for the fare-tier rebracketing (vehicle-category
// pricing, Sep 2026) -- getAdminRouteOverride matches an adminRouteFares
// doc to a load by EXACT equality on tierMaxKg (see calculateFare/
// findFareTier/getAdminRouteOverride in src/App.jsx), not by capacity
// range. Four of the eight bracket ceilings changed as part of the
// rebracketing (750->850, 1000->1200, 1500->1700, 5000->4500) -- every
// existing doc saved under one of the OLD numbers (the ~880-doc
// Maharashtra Rate Card import, AND any hand-typed Admin override at one
// of those same brackets) would silently stop matching real bookings the
// moment the new code ships, quietly falling back to the generic formula
// instead of Admin's researched/hand-set number. This doesn't change any
// totalFare -- it only renumbers tierMaxKg (and, for maharashtraDefault
// docs specifically, the mirrored `weight` field) so the same override
// keeps applying to the same real-world capacityKg it always did.
//
// SETUP: same serviceAccountKey.json as scripts/importMaharashtraDefaults.mjs
// (see that file's header for how to get one).
//
// RUN:
//   node scripts/migrateFareTierBoundaries.mjs --dry-run   # lists what would change, writes nothing
//   node scripts/migrateFareTierBoundaries.mjs             # applies it
//   node scripts/migrateFareTierBoundaries.mjs --verify    # read-only: confirms no doc is left on an old boundary

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import admin from "firebase-admin";

const __dirname = dirname(fileURLToPath(import.meta.url));
const keyPath = join(__dirname, "..", "serviceAccountKey.json");

if (!existsSync(keyPath)) {
  console.error(
    `\nCouldn't find serviceAccountKey.json at ${keyPath}\n\n` +
    "Get one from Firebase Console -> Project Settings -> Service Accounts\n" +
    "-> Generate new private key, save it at that exact path, then re-run this.\n"
  );
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Old bracket ceiling -> new bracket ceiling. Only brackets whose NUMBER
// actually changed need an entry here -- 500, 2500, 7000, and the uncapped
// value are untouched by the rebracketing, so docs at those tierMaxKg
// values already match the new code with no migration needed.
const BOUNDARY_RENUMBER = { 750: 850, 1000: 1200, 1500: 1700, 5000: 4500 };

function sanitizeForDocId(s) {
  return (s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "x";
}

async function run() {
  const dryRun = process.argv.includes("--dry-run");
  const verify = process.argv.includes("--verify");

  const snap = await db.collection("adminRouteFares").get();
  console.log(`adminRouteFares has ${snap.size} documents total.\n`);

  if (verify) {
    const stale = [];
    snap.forEach((doc) => {
      const data = doc.data();
      if (BOUNDARY_RENUMBER[data.tierMaxKg] != null) stale.push({ id: doc.id, tierMaxKg: data.tierMaxKg });
    });
    if (stale.length === 0) {
      console.log("Verified: no doc is left on an old tier boundary.");
    } else {
      console.log(`${stale.length} doc(s) still on an old boundary:`);
      stale.forEach((s) => console.log(`  - ${s.id} (tierMaxKg: ${s.tierMaxKg})`));
    }
    return;
  }

  const toMigrate = [];
  snap.forEach((doc) => {
    const data = doc.data();
    const newTierMaxKg = BOUNDARY_RENUMBER[data.tierMaxKg];
    if (newTierMaxKg == null) return; // this bracket's number didn't change -- nothing to do
    const newDocId = `${sanitizeForDocId(data.pickupName)}__${sanitizeForDocId(data.dropName)}__${newTierMaxKg}`;
    if (snap.docs.some((d) => d.id === newDocId)) {
      console.log(`  skip ${doc.id}: a doc already exists at the new id ${newDocId} (not overwriting it)`);
      return;
    }
    toMigrate.push({ oldId: doc.id, newDocId, data, newTierMaxKg });
  });

  console.log(`${toMigrate.length} doc(s) to renumber (old boundary -> new boundary).\n`);
  if (toMigrate.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  if (dryRun) {
    toMigrate.forEach((m) => console.log(`  ${m.oldId}  ->  ${m.newDocId}`));
    console.log("\nDry run only -- nothing written. Re-run without --dry-run to apply.");
    return;
  }

  const bulkWriter = db.bulkWriter();
  let ok = 0, failed = 0;
  bulkWriter.onWriteError((error) => {
    failed++;
    console.error(`  write failed for ${error.documentRef.id}: ${error.message}`);
    return error.failedAttempts < 3;
  });

  toMigrate.forEach((m) => {
    const isMaharashtraDefault = m.data.source === "maharashtraDefault";
    const newData = {
      ...m.data,
      tierMaxKg: m.newTierMaxKg,
      // Only the Maharashtra import deliberately mirrors weight to
      // tierMaxKg (see importMaharashtraDefaults.mjs) -- a hand-typed
      // Admin override's `weight` is a real captured value, unrelated to
      // the rebracketing, and must not be touched.
      ...(isMaharashtraDefault ? { weight: m.newTierMaxKg >= 999999 ? 8000 : m.newTierMaxKg } : {}),
      updatedAt: Date.now(),
    };
    bulkWriter.set(db.collection("adminRouteFares").doc(m.newDocId), newData);
    bulkWriter.delete(db.collection("adminRouteFares").doc(m.oldId));
    ok++;
  });

  await bulkWriter.close();
  console.log(`\nDone. Renumbered ${ok}, failed ${failed}.`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("\nMigration failed:", e);
  process.exit(1);
});
