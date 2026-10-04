// One-off, run-from-your-machine deletion of EVERY route-rate document in
// Firestore -- both adminRouteFares (the imported Maharashtra defaults AND
// any hand-set Admin overrides live in this same collection, distinguished
// only by the `source` field) and routeFares (driver-submitted "Set Fare"
// reference entries). Requested explicitly to stop these from showing up
// at all in the Admin Rate Calculator / Saved Routes screens -- not a
// display toggle, an actual delete. THIS IS PERMANENT: there is no
// in-app undo and this script makes no backup of its own. If you want one,
// run with --export-dir first and keep the JSON files it writes before
// running --apply.
//
// What this does NOT touch: fareTiers (the DEFAULT_FARE_TIERS baseFare/
// perKmRate formula hardcoded in src/App.jsx) -- that's code, not
// Firestore data, so it's unaffected either way. resolveFareForTier falls
// through to that formula automatically the moment there's no
// adminRouteFares override left for a route, so every booking still gets
// a real computed fare afterward (needed for invoicing/commission/driver
// payout) -- it just won't have a per-route override anymore.
//
// SETUP: same serviceAccountKey.json as scripts/importMaharashtraDefaults.mjs
// (Firebase Console -> Project Settings -> Service Accounts -> Generate
// new private key, saved at the repo root, already gitignored).
//
// RUN:
//   node scripts/deleteAllRouteRates.mjs --dry-run                        # preview only, no writes (default)
//   node scripts/deleteAllRouteRates.mjs --export-dir ./rate-backup --dry-run   # also preview what an export would contain
//   node scripts/deleteAllRouteRates.mjs --export-dir ./rate-backup --apply     # back up to JSON, THEN delete everything
//   node scripts/deleteAllRouteRates.mjs --apply                          # delete everything, no backup

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
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

const apply = process.argv.includes("--apply");
const dryRun = !apply;
const exportDirIndex = process.argv.indexOf("--export-dir");
const exportDir = exportDirIndex !== -1 ? process.argv[exportDirIndex + 1] : null;

const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function collectDocs(collectionName) {
  const snap = await db.collection(collectionName).get();
  const docs = [];
  snap.forEach((doc) => docs.push({ id: doc.id, data: doc.data() }));
  return docs;
}

async function deleteAll(collectionName, docs) {
  const bulkWriter = db.bulkWriter();
  let ok = 0, failed = 0;
  bulkWriter.onWriteError((error) => {
    failed++;
    console.error(`  delete failed for ${collectionName}/${error.documentRef.id}: ${error.message}`);
    return error.failedAttempts < 3;
  });
  docs.forEach(({ id }) => {
    bulkWriter.delete(db.collection(collectionName).doc(id)).then(() => { ok++; });
  });
  await bulkWriter.close();
  return { ok, failed };
}

async function main() {
  console.log(dryRun ? "DRY RUN -- no writes will happen. Pass --apply to actually delete.\n" : "APPLYING -- this will PERMANENTLY delete from Firestore.\n");

  const adminRouteFares = await collectDocs("adminRouteFares");
  const routeFares = await collectDocs("routeFares");
  const defaultCount = adminRouteFares.filter((d) => d.data.source === "maharashtraDefault").length;
  const handSetCount = adminRouteFares.length - defaultCount;

  console.log(`adminRouteFares: ${adminRouteFares.length} total (${defaultCount} default, ${handSetCount} hand-set by Admin)`);
  console.log(`routeFares (driver-submitted): ${routeFares.length} total`);
  console.log(`\n${adminRouteFares.length + routeFares.length} documents would be permanently deleted.\n`);

  if (exportDir) {
    mkdirSync(exportDir, { recursive: true });
    const adminPath = join(exportDir, "adminRouteFares-backup.json");
    const driverPath = join(exportDir, "routeFares-backup.json");
    if (!dryRun) {
      writeFileSync(adminPath, JSON.stringify(adminRouteFares, null, 2));
      writeFileSync(driverPath, JSON.stringify(routeFares, null, 2));
      console.log(`Backed up to:\n  ${adminPath}\n  ${driverPath}\n`);
    } else {
      console.log(`(dry run -- would back up to ${adminPath} and ${driverPath})\n`);
    }
  }

  if (dryRun) {
    console.log("Dry run only -- nothing deleted. Re-run with --apply once this looks right.");
    return;
  }

  const adminResult = await deleteAll("adminRouteFares", adminRouteFares);
  const driverResult = await deleteAll("routeFares", routeFares);

  console.log(`\nadminRouteFares: deleted ${adminResult.ok}, failed ${adminResult.failed}`);
  console.log(`routeFares: deleted ${driverResult.ok}, failed ${driverResult.failed}`);
  console.log("\nDone. The Admin Rate Calculator and Saved Routes screens will now show zero entries.");
  console.log("Fare resolution (resolveFareForTier) now falls through straight to the hardcoded");
  console.log("per-tier formula in DEFAULT_FARE_TIERS (src/App.jsx) for every route.");
  process.exit(adminResult.failed + driverResult.failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("\nDeletion failed:", e);
  process.exit(1);
});
