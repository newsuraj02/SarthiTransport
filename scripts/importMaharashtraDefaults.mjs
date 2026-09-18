// One-off, run-from-your-machine import of the Maharashtra Rate Card
// defaults straight into Firestore via the Admin SDK -- bypasses the
// mobile browser entirely (no page to lose, no connectivity watchdog, no
// weak-signal contention), which is what the in-app "Import all 11 hubs"
// button in the Admin Rate Calculator kept running into.
//
// Reproduces the exact same hubs/distances/rate bands/discount formula/doc
// IDs as buildMaharashtraDefaultRates() in src/App.jsx, so a run from here
// is fully consistent with anything already imported from the app, and
// with the in-app "Save Rate" / delete controls afterward -- every doc
// this writes is a completely ordinary adminRouteFares entry, editable or
// removable in the Admin app exactly like one typed by hand.
//
// SETUP (one-time):
//   1. Firebase Console -> your project -> gear icon -> Project Settings
//      -> Service Accounts -> Generate new private key. Save the
//      downloaded file as serviceAccountKey.json in this repo's root
//      (already in .gitignore -- never commit it).
//   2. npm install   (picks up the firebase-admin dependency this needs)
//
// RUN:
//   node scripts/importMaharashtraDefaults.mjs            # all 55 routes, all 8 brackets (880 docs)
//   node scripts/importMaharashtraDefaults.mjs --test     # just the 3-route trial batch (48 docs)
//   node scripts/importMaharashtraDefaults.mjs --verify   # read-only: confirms all 880 are actually there, lists anything missing/different
//   node scripts/importMaharashtraDefaults.mjs --test --verify   # same, for just the 3-route batch

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

const FARE_TIER_MAX_KG_UNCAPPED = 999999;

const MAHARASHTRA_HUBS = [
  { name: "Pune", lat: 18.5204, lng: 73.8567 },
  { name: "Mumbai", lat: 19.0760, lng: 72.8777 },
  { name: "Nashik", lat: 20.0059, lng: 73.7910 },
  { name: "Kolhapur", lat: 16.7050, lng: 74.2433 },
  { name: "Solapur", lat: 17.6599, lng: 75.9064 },
  { name: "Chh. Sambhajinagar", lat: 19.8762, lng: 75.3433 },
  { name: "Ahmednagar", lat: 19.0948, lng: 74.7480 },
  { name: "Satara", lat: 17.6805, lng: 74.0183 },
  { name: "Amravati", lat: 20.9374, lng: 77.7796 },
  { name: "Nanded", lat: 19.1383, lng: 77.3210 },
  { name: "Nagpur", lat: 21.1458, lng: 79.0882 },
];

const MAHARASHTRA_HUB_EDGES = [
  [0, 1, 150], [0, 2, 210], [0, 3, 230], [0, 4, 250], [0, 5, 235], [0, 6, 120], [0, 7, 110], [0, 8, 480], [0, 9, 430], [0, 10, 700],
  [1, 2, 165], [1, 3, 380], [1, 4, 400], [1, 5, 335], [1, 6, 260], [1, 7, 250], [1, 8, 660], [1, 9, 580], [1, 10, 710],
  [2, 3, 430], [2, 4, 370], [2, 5, 190], [2, 6, 135], [2, 7, 300], [2, 8, 480], [2, 9, 430], [2, 10, 680],
  [3, 4, 230], [3, 5, 380], [3, 6, 280], [3, 7, 110], [3, 8, 700], [3, 9, 490], [3, 10, 830],
  [4, 5, 250], [4, 6, 200], [4, 7, 140], [4, 8, 480], [4, 9, 280], [4, 10, 590],
  [5, 6, 115], [5, 7, 320], [5, 8, 350], [5, 9, 270], [5, 10, 500],
  [6, 7, 180], [6, 8, 450], [6, 9, 350], [6, 10, 600],
  [7, 8, 600], [7, 9, 500], [7, 10, 750],
  [8, 9, 250], [8, 10, 155],
  [9, 10, 340],
];

const MAHARASHTRA_TEST_EDGES = [
  [0, 1, 150],
  [0, 3, 230],
  [0, 10, 700],
];

const MAHARASHTRA_RATE_BANDS = [
  { maxKg: 500, lo: 18, hi: 26 },
  { maxKg: 750, lo: 20, hi: 29 },
  { maxKg: 1000, lo: 22, hi: 30 },
  { maxKg: 1500, lo: 25, hi: 35 },
  { maxKg: 2500, lo: 32, hi: 45 },
  { maxKg: 5000, lo: 42, hi: 58 },
  { maxKg: 7000, lo: 48, hi: 65 },
  { maxKg: FARE_TIER_MAX_KG_UNCAPPED, lo: 58, hi: 85 },
];

function maharashtraLongHaulDiscountPct(km) {
  if (km <= 300) return 0;
  return Math.min(16, 16 * Math.sqrt((km - 300) / 500));
}

function normalizeRouteText(s) {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function sanitizeForDocId(s) {
  return (s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "x";
}

function buildMaharashtraDefaultRates(edges) {
  const entries = [];
  edges.forEach(([ai, bi, km]) => {
    const a = MAHARASHTRA_HUBS[ai], b = MAHARASHTRA_HUBS[bi];
    const factor = 1 - maharashtraLongHaulDiscountPct(km) / 100;
    MAHARASHTRA_RATE_BANDS.forEach((band) => {
      const totalFare = Math.round(km * ((band.lo + band.hi) / 2) * factor);
      [[a, b], [b, a]].forEach(([from, to]) => {
        entries.push({
          pickupName: from.name, dropName: to.name,
          pickupLat: from.lat, pickupLng: from.lng, dropLat: to.lat, dropLng: to.lng,
          estimatedKm: km, tierMaxKg: band.maxKg, totalFare,
        });
      });
    });
  });
  return entries;
}

// Read-only: checks Firestore against the full expected set of docs
// instead of just eyeballing a count, so "is it really all there" has a
// definitive answer -- lists exactly what's missing or different, not
// just a total that could hide a gap.
async function verify(mode) {
  const edges = mode === "test" ? MAHARASHTRA_TEST_EDGES : MAHARASHTRA_HUB_EDGES;
  const expected = buildMaharashtraDefaultRates(edges).map((e) => ({
    ...e, docId: `${sanitizeForDocId(e.pickupName)}__${sanitizeForDocId(e.dropName)}__${e.tierMaxKg}`,
  }));

  console.log(`Verifying ${mode} batch: expecting ${expected.length} docs.\n`);

  const existingSnap = await db.collection("adminRouteFares").get();
  const existingById = {};
  existingSnap.forEach((doc) => { existingById[doc.id] = doc.data(); });
  console.log(`adminRouteFares collection has ${existingSnap.size} documents total (across everything, not just this batch).\n`);

  const missing = [];
  const wrongValue = [];
  let matched = 0;
  expected.forEach((e) => {
    const existing = existingById[e.docId];
    if (!existing) { missing.push(e.docId); return; }
    if (existing.totalFare !== e.totalFare) { wrongValue.push({ docId: e.docId, expected: e.totalFare, actual: existing.totalFare, source: existing.source }); return; }
    matched++;
  });

  console.log(`Matched exactly: ${matched}/${expected.length}`);
  if (missing.length) {
    console.log(`\nMISSING (${missing.length}) -- not in Firestore at all:`);
    missing.forEach((id) => console.log(`  - ${id}`));
  }
  if (wrongValue.length) {
    console.log(`\nDIFFERENT VALUE (${wrongValue.length}) -- exists, but not the default's number (likely hand-edited, which is expected/protected):`);
    wrongValue.forEach((w) => console.log(`  - ${w.docId}: expected ${w.expected}, actually ${w.actual}${w.source !== "maharashtraDefault" ? " (hand-edited)" : ""}`));
  }
  if (!missing.length && !wrongValue.length) {
    console.log("\nAll present and matching. The full batch is confirmed in Firestore.");
  }
}

async function main() {
  const mode = process.argv.includes("--test") ? "test" : "full";

  if (process.argv.includes("--verify")) {
    await verify(mode);
    return;
  }

  const edges = mode === "test" ? MAHARASHTRA_TEST_EDGES : MAHARASHTRA_HUB_EDGES;
  const entries = buildMaharashtraDefaultRates(edges);

  console.log(`Mode: ${mode} (${edges.length} routes x 8 brackets x 2 directions = ${entries.length} candidate docs)`);
  console.log("Reading existing adminRouteFares entries to avoid clobbering hand edits...");

  const existingSnap = await db.collection("adminRouteFares").get();
  const existingById = {};
  existingSnap.forEach((doc) => { existingById[doc.id] = doc.data(); });

  let skipped = 0, alreadyDone = 0;
  const toWrite = [];
  entries.forEach((e) => {
    const docId = `${sanitizeForDocId(e.pickupName)}__${sanitizeForDocId(e.dropName)}__${e.tierMaxKg}`;
    const existing = existingById[docId];
    if (existing && existing.source !== "maharashtraDefault") { skipped++; return; }
    if (existing && existing.source === "maharashtraDefault" && existing.totalFare === e.totalFare) { alreadyDone++; return; }
    toWrite.push({ ...e, docId });
  });

  console.log(`${alreadyDone} already imported with the same value, ${skipped} hand-edited (protected), ${toWrite.length} to write now.`);

  if (toWrite.length === 0) {
    console.log("Nothing to do -- every entry is already imported or hand-edited.");
    return;
  }

  // BulkWriter batches, retries, and rate-limits writes automatically --
  // built exactly for this (hundreds of writes from a trusted server-side
  // context), and doesn't depend on any client's network or browser state.
  const bulkWriter = db.bulkWriter();
  let ok = 0, failed = 0;
  bulkWriter.onWriteError((error) => {
    failed++;
    console.error(`  write failed for ${error.documentRef.id}: ${error.message}`);
    return error.failedAttempts < 3;
  });

  toWrite.forEach((e) => {
    const ref = db.collection("adminRouteFares").doc(e.docId);
    bulkWriter.set(ref, {
      pickupName: e.pickupName, dropName: e.dropName,
      pickupKey: normalizeRouteText(e.pickupName), dropKey: normalizeRouteText(e.dropName),
      pickupLat: e.pickupLat, pickupLng: e.pickupLng, dropLat: e.dropLat, dropLng: e.dropLng,
      estimatedKm: e.estimatedKm, weight: e.tierMaxKg >= FARE_TIER_MAX_KG_UNCAPPED ? 8000 : e.tierMaxKg,
      tierMaxKg: e.tierMaxKg, totalFare: e.totalFare, updatedAt: Date.now(), source: "maharashtraDefault",
    }).then(() => { ok++; if (ok % 50 === 0) console.log(`  ${ok}/${toWrite.length} written...`); });
  });

  await bulkWriter.close();
  console.log(`\nDone. Wrote ${ok}, failed ${failed}, already done ${alreadyDone}, kept (hand-edited) ${skipped}.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("\nImport failed:", e);
  process.exit(1);
});
