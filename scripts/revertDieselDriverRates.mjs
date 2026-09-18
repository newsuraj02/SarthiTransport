// One-off correction for driver-submitted routeFares entries after too
// much manual testing of the Admin "-Diesel+" control (see AdminRouteFares
// in src/App.jsx) left them drifted away from what drivers actually typed
// into Set Fare. The Diesel control keeps no history of its own clicks --
// each click just overwrites totalFare/tier1to5Fare/perKmRate in place --
// so the only way back is applying the exact opposite net adjustment by
// hand, once, from here.
//
// Uses the SAME flat rule the (now-fixed) in-app Diesel control uses:
// totalFare += delta*estimatedKm, then Tier1-5/perKmRate recomputed from
// the new total purely for display (see SetFareForm's own formula) -- NOT
// the original buggy per-km-rate-driven formula, since that one doesn't
// have a clean, well-defined inverse. If any of the drifting clicks
// actually happened under that older buggy code (before it was fixed),
// this correction will land close to, but not byte-for-byte exactly, the
// original driver-entered number for those specific entries -- run
// --dry-run first and sanity-check a few against what the driver actually
// remembers charging before committing.
//
// SETUP: same serviceAccountKey.json as scripts/importMaharashtraDefaults.mjs
// (Firebase Console -> Project Settings -> Service Accounts -> Generate
// new private key, saved at the repo root, already gitignored).
//
// RUN:
//   node scripts/revertDieselDriverRates.mjs --net 2 --dry-run   # preview only, no writes
//   node scripts/revertDieselDriverRates.mjs --net 2 --apply     # actually writes the correction
//
// --net is the NET number of Diesel clicks to undo (+ increases rates,
// - decreases them) -- e.g. "clicked + three times, - once" is net +3,
// so pass --net 2 is WRONG for that; pass the actual net you clicked.
// This script always applies the OPPOSITE of --net (i.e. --net 2 means
// "the rates went up by a net of 2, undo that", so it subtracts 2/km).

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

const netArgIndex = process.argv.indexOf("--net");
const net = netArgIndex !== -1 ? Number(process.argv[netArgIndex + 1]) : null;
const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run") || !apply;

if (net == null || Number.isNaN(net)) {
  console.error("\nPass --net <number> -- the NET Diesel clicks to undo (e.g. --net 2 for \"+3 then -1\").\n");
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  console.log(`Undoing a net Diesel adjustment of ${net > 0 ? "+" : ""}${net}/km on every driver-submitted routeFares entry.`);
  console.log(dryRun ? "DRY RUN -- no writes will happen. Pass --apply to actually save.\n" : "APPLYING -- this will write to Firestore.\n");

  const snap = await db.collection("routeFares").get();
  console.log(`routeFares has ${snap.size} entries total.\n`);

  const skipped = [];
  const changes = [];
  snap.forEach((doc) => {
    const r = doc.data();
    if (!(r.estimatedKm > 0)) { skipped.push(doc.id); return; }
    const oldTotalFare = Number(r.totalFare) || 0;
    const newTotalFare = Math.max(1, Math.round(oldTotalFare - net * r.estimatedKm));
    const newTier1to5Fare = Math.round(newTotalFare * 0.25);
    const newPerKmRate = r.estimatedKm > 5 ? Math.round((newTotalFare - newTier1to5Fare) / (r.estimatedKm - 5)) : (r.perKmRate ?? null);
    changes.push({
      id: doc.id, driverMobile: r.driverMobile, pickupName: r.pickupName, dropName: r.dropName,
      oldTotalFare, newTotalFare, newTier1to5Fare, newPerKmRate,
    });
  });

  changes.forEach((c) => {
    console.log(`  ${c.driverMobile} | ${c.pickupName} -> ${c.dropName} | ${c.oldTotalFare} -> ${c.newTotalFare}`);
  });
  if (skipped.length) console.log(`\n${skipped.length} entries skipped (no estimatedKm to scale by, left untouched): ${skipped.join(", ")}`);
  console.log(`\n${changes.length} entries would be updated.`);

  if (dryRun) {
    console.log("\nDry run only -- nothing written. Re-run with --apply once this looks right.");
    return;
  }

  const bulkWriter = db.bulkWriter();
  let ok = 0, failed = 0;
  bulkWriter.onWriteError((error) => {
    failed++;
    console.error(`  write failed for ${error.documentRef.id}: ${error.message}`);
    return error.failedAttempts < 3;
  });
  changes.forEach((c) => {
    bulkWriter.update(db.collection("routeFares").doc(c.id), {
      totalFare: c.newTotalFare, tier1to5Fare: c.newTier1to5Fare, perKmRate: c.newPerKmRate,
    }).then(() => { ok++; });
  });
  await bulkWriter.close();
  console.log(`\nDone. Updated ${ok}, failed ${failed}.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("\nRevert failed:", e);
  process.exit(1);
});
