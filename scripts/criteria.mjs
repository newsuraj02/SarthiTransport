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
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";

// Named top-level declarations ("function NAME(", "const NAME =", "export ..." variants) per source file.
export const BLOCKS = {
  "src/App.jsx": [
    // availability / who may be shown or take a load
    "parseScheduledFor", "minAdvanceNoticeHours", "notificationLockHours", "estimatedTripHours", "isBookingRunning", "getBookingWindow", "driverIsOnTrip",
    "findDriverLoadConflict", "isDriverRecord", "isDriverBroadcastEligible", "ringCategoryIndexOfCapacity", "ringCategoryIndexOfLoad", "RING_EXTRA_RANGE_KG", "ringCategoryLimitKg", "ringCategoryInRange", "hasFreshLocation", "CUSTOMER_LIST_CATEGORY_KG", "CUSTOMER_LIST_CATEGORY_NAMES", "customerListCategoryName", "CUSTOMER_LIST_CATEGORY_DIM_MODELS", "CUSTOMER_LIST_3_WHEELER_DIMS", "CUSTOMER_LIST_DIM_LABELS", "formatDimFeet", "customerListCategoryDims", "customerListCategoryIndex", "customerListCategoryLabel", "groupByCustomerListCategory", "nearbyOnlineDrivers", "nearbyOfflineDrivers",
    "maxFleetVehicleCapacityKg", "CURRENT_BID_RADIUS_KM", "ADVANCE_BID_RADIUS_KM", "VEHICLE_HEADROOM_KG", "NEARBY_DRIVER_RADIUS_KM", "NEARBY_DRIVER_STALE_MS",
    "APP_OPEN_BEAT_MS",
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
  "functions/index.js": ["notificationLockHours", "parseScheduledFor", "estimatedTripHours", "isBookingRunning", "getBookingWindow", "hasLoadConflict", "haversineKm", "pinAuthEmail",
    "APP_OPEN_WINDOW_MS", "isAppOpenNow", "escalateOneBooking", "ESCALATION_ROUNDS",
    "ESCALATION_FIRST_NUDGE_SEC", "WATCHER_BACKUP_DELAY_MS", "RING_RETRY_DELAYS_MS", "sendDirectRequestAlert", "sendDirectRequestRingAlert"],
};
// Whole-file fingerprints: rules, hosting/functions config, service worker, loader, native manifests, server helpers.
export const FILES = [
  "firestore.rules", "storage.rules", "firebase.json", "index.html", "public/service-worker.js", "functions/otp.js", "functions/ringText.js", "functions/tripLock.js", "functions/vehicleSpecRepair.js",
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

// ---- COMPLETE CODE INVENTORY (owner 2026-11-03: "don't limit yourself to a hand-picked list") ---------------------------------------
// Every tracked file is fingerprinted, and the big source files (App.jsx, AdminPanel.jsx, functions/index.js, firebaseClient.js ...) are split into
// every top-level declaration (each component, hook, helper, constant) and every `exports.*` Cloud Function. Comments and blank lines are ignored, so
// only real code changes count. Keys: `code:<path>` (whole file) or `code:<path>#<name>`.
const BINARY = /\.(png|jpe?g|gif|webp|ico|jar|keystore|jks|woff2?|ttf|otf|mp3|mp4)$/i;
const SKIP_FILES = new Set(["scripts/criteria.lock.json", "docs/CRITERIA_CHANGELOG.md", "functions/build.json", "scripts/package-lock.json", "package-lock.json", "functions/package-lock.json", "android/gradle/wrapper/gradle-wrapper.jar"]);
const SPLIT = /\.(jsx?|mjs|cjs)$/;
const SPLIT_MIN_LINES = 120; // smaller JS files are hashed whole

function listFiles(root) {
  const git = (args) => execSync(`git ls-files ${args}`, { cwd: root, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }).toString().split("\n").map((x) => x.trim()).filter(Boolean);
  let tracked, fresh;
  try { tracked = git("--cached"); fresh = git("--others --exclude-standard"); } catch { return null; }
  // Tracked files always count. A brand-new, not-yet-committed file counts only if it sits in a source folder: stray files in the project root
  // (a Windows `> 100m` redirect, firebase-debug.log, .firebase/ cache ...) must never fail someone's deploy (2026-11-03).
  const SOURCE_DIRS = /^(src|functions|scripts|android|public|docs|\.githooks|\.github)\//;
  const all = [...new Set([...tracked, ...fresh.filter((x) => SOURCE_DIRS.test(x) && !/\s/.test(x))])];
  return all.filter((x) => !SKIP_FILES.has(x) && !x.endsWith("package-lock.json") && existsSync(join(root, x)));
}
// Drops comment-only lines, block comments, JSX comment lines and blank lines; trims trailing whitespace. Code is untouched.
export function stripComments(text, file = "") {
  const css = /\.css$/.test(file), markup = /\.(html|xml|svg)$/.test(file);
  let t = text.replace(/\r\n/g, "\n");
  if (markup) t = t.replace(/<!--[\s\S]*?-->/g, "");
  if (css) t = t.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = []; let inBlock = false;
  for (const raw of t.split("\n")) {
    const l = raw.replace(/\s+$/, ""); const tr = l.trim();
    if (inBlock) { if (tr.includes("*/")) inBlock = false; continue; }
    if (!tr) continue;
    if (!css && !markup) {
      if (tr.startsWith("//")) continue;
      if (tr.startsWith("/*") && !tr.startsWith("/**/")) { if (!tr.includes("*/")) inBlock = true; continue; }
      if (/^\{\/\*.*\*\/\}$/.test(tr)) continue;
    }
    out.push(l);
  }
  return out.join("\n");
}
const DECL = /^(export\s+)?(default\s+)?(async\s+)?(?:function\*?\s+(\w+)|(?:const|let|var)\s+(\w+)|class\s+(\w+))/;
// Splits a JS source into top-level units (declaration starts at column 0). Imports and anything unnamed are grouped into `imports` / `other`.
export function splitUnits(src) {
  const lines = src.replace(/\r\n/g, "\n").split("\n"); const marks = [];
  lines.forEach((l, i) => {
    let name = null; const m = l.match(DECL); const ex = l.match(/^exports\.(\w+)\s*=/);
    if (m) name = m[4] || m[5] || m[6]; else if (ex) name = `fn:${ex[1]}`; else if (/^export\s+default\b/.test(l)) name = "default";
    else if (/^import\b/.test(l)) name = "imports"; else if (/^(module\.exports|export\s*\{|export\s+\*)/.test(l)) name = "exportsList";
    else if (/^[A-Za-z_$]/.test(l) && !/^(else|catch|finally|case|default)\b/.test(l)) name = "other";
    if (name) marks.push([i, name]);
  });
  const buckets = {}; const seen = {};
  for (let k = 0; k < marks.length; k++) {
    const [start, name] = marks[k]; const end = k + 1 < marks.length ? marks[k + 1][0] : lines.length;
    const text = lines.slice(start, end).join("\n");
    let key = name; if (name !== "imports" && name !== "other" && name !== "exportsList") { seen[name] = (seen[name] || 0) + 1; if (seen[name] > 1) key = `${name}#${seen[name]}`; }
    buckets[key] = (buckets[key] || "") + text + "\n";
  }
  return buckets;
}
export function collectInventory(root) {
  const files = listFiles(root); if (!files) return { inventory: {}, error: "not a git checkout" };
  const inv = {};
  for (const f of files) {
    let buf; try { buf = readFileSync(join(root, f)); } catch { continue; }
    if (BINARY.test(f)) { inv[`code:${f}`] = createHash("sha256").update(buf).digest("hex").slice(0, 16); continue; }
    const text = buf.toString("utf8");
    const lineCount = text.split("\n").length;
    if (SPLIT.test(f) && lineCount >= SPLIT_MIN_LINES) { for (const [k, v] of Object.entries(splitUnits(text))) inv[`code:${f}#${k}`] = sha(stripComments(v, f)); }
    else inv[`code:${f}`] = sha(stripComments(text, f));
  }
  return { inventory: inv };
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
  const { inventory } = collectInventory(root);
  Object.assign(out, inventory);
  return { criteria: out, missing };
}
