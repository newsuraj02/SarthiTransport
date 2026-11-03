// CRITERIA FINGERPRINTS -- the app's memory of every rule, condition and function that decides something (deep-clean 2026-11-03).
// Owner: "keep track of every inch/minute detail in criteria, conditions, functions, system -- inform Admin even the slightest change".
//
// collectCriteria() hashes (SHA-256 of the exact text) the named rule blocks in src/App.jsx / src/AdminPanel.jsx / functions/index.js,
// every `exports.*` Cloud Function, and the whole of the config/rules files below. The result is
//   1. committed as scripts/criteria.lock.json -- `npm run verify:invariants` FAILS when any criterion differs from the lock, so a rule can
//      never change silently: whoever changes one must run `npm run criteria:accept -- "why"`, which updates the lock AND appends a line to
//      docs/CRITERIA_CHANGELOG.md (date, what changed, reason);
//   2. written into dist/build.json at build time (vite.config.js), which the morning/evening scan (functions/healthAudit.js) compares
//      with the previous scan to tell Admin exactly which criteria changed in the LIVE app.
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

// Named top-level declarations ("function NAME(", "const NAME =", "export ..." variants) per source file.
export const BLOCKS = {
  "src/App.jsx": [
    // availability / who may be shown or take a load
    "parseScheduledFor", "minAdvanceNoticeHours", "notificationLockHours", "estimatedTripHours", "isBookingRunning", "getBookingWindow", "driverIsOnTrip",
    "findDriverLoadConflict", "isDriverRecord", "isDriverBroadcastEligible", "nearbyOnlineDrivers", "nearbyOfflineDrivers", "padVehicleCategories",
    "maxFleetVehicleCapacityKg", "CURRENT_BID_RADIUS_KM", "ADVANCE_BID_RADIUS_KM", "VEHICLE_HEADROOM_KG", "NEARBY_DRIVER_RADIUS_KM", "NEARBY_DRIVER_STALE_MS",
    "BROADCAST_LOCATION_STALE_MS", "BROADCAST_WEIGHT_HEADROOM_KG", "DIRECT_REQUEST_RADIUS_KM",
    // fares
    "DEFAULT_FARE_TIERS", "DIESEL_BASELINE_PRICE_PER_LITRE", "DIESEL_MILEAGE_BY_TIER_MAX_KG", "calculateFare", "priceOutstation", "priceCorrectionFactor",
    "findFareTier", "vehicleForWeight", "getAdminRouteOverride", "findExactAdminRoute", "getRouteScaleRatio", "resolveFareForCapacity", "resolveFareForTier",
    "applyDieselToSavedRates", "enforceMonotonicFares", "findFareOutliers", "interpolateOutlierFare", "zoneFor", "routeMatchRadiusKm", "ROUTE_MATCH_RADIUS_KM",
    // trip money / return load
    "KM_PER_DAY", "haltPerDayFor", "includedDays", "daysUsed", "haltOf", "buildBill", "isReturnLoadFor", "markReturnModePatch", "RETURN_RULES", "RETURN_HOURS",
    // booking input rules
    "MAX_BOOKING_WEIGHT_KG", "getWeightInputChange", "isWeightValid", "localDateKey", "isFutureAdvance", "isLikelyUninstalled", "DRIVER_KYC_FIELDS",
    "getKycMissingFromValues", "getDriverKycMissing", "isDriverKycComplete", "settlePendingRingAction",
  ],
  "functions/index.js": ["notificationLockHours", "getBookingWindow", "hasLoadConflict", "haversineKm", "pinAuthEmail", "BROADCAST_WEIGHT_HEADROOM_KG"],
};
// Whole-file fingerprints: rules, hosting/functions config, service worker, loader, native manifests, server helpers.
export const FILES = [
  "firestore.rules", "storage.rules", "firebase.json", "index.html", "public/service-worker.js", "functions/otp.js", "functions/ringText.js",
  "functions/addressLang.js", "functions/healthAudit.js", "functions/package.json", "capacitor.config.ts", "capacitor.admin.config.ts",
  "android/app/src/main/AndroidManifest.xml", "android-admin/app/src/main/AndroidManifest.xml", "src/firebaseClient.js", "src/firestoreStore.js",
];

const sha = (t) => createHash("sha256").update(t).digest("hex").slice(0, 16);

// Text of one top-level declaration: from its first line to the first line that closes it at column 0 (`}` `};` `]` `];` `})` `});`),
// or the same line for a one-liner. Comments directly above the declaration are NOT part of it (wording changes are not rule changes).
export function extractBlock(src, name) {
  const lines = src.split("\n");
  const re = new RegExp(`^(export\\s+)?(async\\s+)?(function\\s+${name}\\s*\\(|const\\s+${name}\\s*=|let\\s+${name}\\s*=)`);
  const start = lines.findIndex((l) => re.test(l));
  if (start < 0) return null;
  const balance = (t) => { let n = 0; for (const ch of t) { if ("{[(".includes(ch)) n++; else if ("}])".includes(ch)) n--; } return n; };
  let acc = lines[start], depth = balance(lines[start]);
  if (depth === 0 && /[;}]\s*$/.test(lines[start])) return acc;
  for (let i = start + 1; i < lines.length; i++) {
    acc += "\n" + lines[i];
    if (/^[}\])]+;?$/.test(lines[i]) || (/^[}\])]+\)?;?\s*$/.test(lines[i]))) return acc;
  }
  return acc;
}
// Every `exports.NAME = ...` Cloud Function block in functions/index.js.
export function extractExports(src) {
  const lines = src.split("\n"); const out = {};
  lines.forEach((l, i) => {
    const m = l.match(/^exports\.(\w+)\s*=/);
    if (!m) return;
    let acc = l;
    if (!/[;}]\s*$/.test(l) || l.split("(").length !== l.split(")").length) for (let j = i + 1; j < lines.length; j++) { acc += "\n" + lines[j]; if (/^[}\])]+;?$/.test(lines[j])) break; }
    out[`fn:${m[1]}`] = acc;
  });
  return out;
}

export function collectCriteria(root) {
  const out = {}; const missing = [];
  for (const [file, names] of Object.entries(BLOCKS)) {
    const p = join(root, file); if (!existsSync(p)) { missing.push(file); continue; }
    const src = readFileSync(p, "utf8").replace(/\r\n/g, "\n");
    for (const n of names) { const b = extractBlock(src, n); if (b == null) missing.push(`${file}#${n}`); else out[`${file === "src/App.jsx" ? "app" : "fns"}:${n}`] = sha(b); }
    if (file === "functions/index.js") for (const [k, v] of Object.entries(extractExports(src))) out[k] = sha(v);
  }
  for (const f of FILES) { const p = join(root, f); if (!existsSync(p)) { missing.push(f); continue; } out[`file:${f}`] = sha(readFileSync(p, "utf8").replace(/\r\n/g, "\n")); }
  return { criteria: out, missing };
}
