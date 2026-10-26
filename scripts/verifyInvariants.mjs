// Regression guard for behavior the owner has confirmed working. Run after
// ANY change (npm run verify:invariants) -- a FAIL means a rule listed in
// CLAUDE.md ("Verified-working behavior -- KEEP INTACT") was altered or
// removed, and must be understood and fixed (or, if the owner asked for the
// change, the check updated in the same commit) before pushing.
//
// Deliberately plain text/count checks, not an import of App.jsx (JSX plus
// Firebase can't be loaded in bare Node) -- each one pins the exact source
// text of a rule that was hard-won and verified on real devices.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const app = read("src/App.jsx");
const admin = read("src/AdminPanel.jsx");
const fns = read("functions/index.js");
const manifest = read("android/app/src/main/AndroidManifest.xml");
const count = (src, needle) => src.split(needle).length - 1;

const checks = [
  // ---- Weight input rules (customer booking) ----
  ["kg input is 3-5 digits", () => app.includes("const KG_WEIGHT_RE = /^\\d{3,5}$/;")],
  ["ton input is max 2 integer + 3 decimal digits (so 9000 ton can never be typed)", () => app.includes("const TON_WEIGHT_RE = /^\\d{1,2}(\\.\\d{1,3})?$/;")],
  ["keystroke caps: kg 5 digits, ton 2 integer digits", () => app.includes("digitsOnly.slice(0, 5)") && app.includes("intPart.slice(0, 2)")],
  ["both booking forms validate weight with isWeightValid", () => count(app, "isWeightValid(weight, weightUnit)") >= 2],
  ["both booking forms convert ton to kg before use", () => count(app, '(weightUnit === "ton" ? 1000 : 1)') >= 2],
  ["both booking forms save weightKg in kg (loadKg)", () => count(app, "weightKg: loadKg || null") >= 2],
  ["both booking forms block loads above the biggest vehicle", () => count(app, "loadKg > maxFleetCapacityKg") >= 2],
  ["admin never prints weightKg with weightUnit as suffix (the '9000ton' bug)", () => !admin.includes("${req.weightKg}${req.weightUnit")],

  // ---- Pricing ----
  ["diesel baseline is Rs 98/L", () => app.includes("export const DIESEL_BASELINE_PRICE_PER_LITRE = 98;")],
  ["outstation fares go through priceOutstation", () => app.includes("total = priceOutstation(tier.maxKg, km, tiers);")],
  ["outstation anchor tiers unchanged", () => app.includes("const OUTSTATION_ANCHOR_TIER_KGS = [500, 750, 1200, 2000, 3500, 5000];")],
  ["short-distance donor tiers unchanged", () => app.includes("const SHORT_DISTANCE_DONOR_KG = { 500: 750, 3500: 5000 };")],
  ["bigger vehicle never cheaper: enforceMonotonicFares applied in both booking flows", () => count(app, "return enforceMonotonicFares(afterOutliers);") >= 2],
  ["live diesel price feeds every fare", () => count(app, "dieselPricePerLitre") >= 20 && app.includes("settings.dieselPricePerLitre ?? DIESEL_BASELINE_PRICE_PER_LITRE")],

  // ---- Admin lists: numbering, call round-robin, double-tap ----
  ["call round-robin resets when the whole list is called (Uninstalled, Drivers, Customers)", () => count(admin, "roundComplete ? {} : next") >= 3],
  ["double-tap re-enables a called entry (Uninstalled, Drivers, Customers, Alerts x2)", () => count(admin, "onDoubleClick={() => unmark") >= 5],
  ["row numbers shown on driver/customer/uninstalled/registration lists", () => count(admin, "{i + 1}</span>") >= 3 && count(admin, "{num}</span>") >= 2],
  ["GPS/KYC badges are compact and red/green", () => admin.includes("> GPS\n") || admin.includes("<MapPin size={9} /> GPS")],
  ["customers sorted by latest ride activity", () => admin.includes("latestRideByMobile")],
  ["KYC Reject needs a confirm tap", () => admin.includes("setConfirmRejectId(dr.id)") && admin.includes("Yes, reject")],
  ["Rejected drivers stay in the approval queue (reject is reversible)", () => admin.includes('d.vehicleSpec && (d.kyc === "Pending" || d.kyc === "Rejected")')],
  ["offline-driver matching uses real pickup radius", () => admin.includes("x.km <= radiusKm") && admin.includes("CURRENT_BID_RADIUS_KM")],
  ["dashboard shows 'N Direct request(s) from customer' red box linking to Alerts", () => admin.includes("Direct request${pendingUnmatchedCount > 1") && admin.includes('onNavigate("alerts")')],

  // ---- Voice ----
  ["onboarding voice guidance is mandatory (no mute/once gating)", () => !app.includes("sarthi_voiceGuideOn") && !app.includes("sarthi_voiceGuideSeen")],
  ["admin broadcast audio is server-generated, played by playAnnouncementAudio", () => fns.includes("async function synthesizeBroadcastAudio") && app.includes("function playAnnouncementAudio(url)")],
  ["TTS client is lazy (an eager one broke 'firebase deploy' with a 10s timeout)", () => fns.includes("function getTtsClient()") && !fns.includes("\nconst ttsClient = new textToSpeech.TextToSpeechClient();")],
  ["admin message banner has the replay speaker and no X dismiss", () => app.includes("playAnnouncementAudio(announcement.audioUrl)") && !app.includes("onDismiss={announcementAlerts.markSeen}")],

  // ---- Role selection ----
  ["role select cards say WHO should pick them", () => app.includes('"If you drive a truck or vehicle"') && app.includes('"If you need to send goods"')],

  // ---- Frozen GPS / ring system still present (see CLAUDE.md freeze rules) ----
  ["frozen Cloud Functions still exported", () => ["mintLocationServiceToken", "onDirectRequestBroadcast", "ringAck", "onBookingTaken", "sendTestRing"].every((n) => fns.includes(`exports.${n} =`))],
  ["frozen native files still present", () => ["LocationTrackerService", "LocationTrackerPlugin", "PowerBridgePlugin", "FusedLocationBridgePlugin", "ApnaApplication", "LoadWatcher", "PushTokenSync", "NativePushPlugin", "AppFirebaseMessagingService", "RingingBookingActivity", "RingingBridgePlugin"].every((n) => existsSync(join(root, `android/app/src/main/java/com/apnatransport/app/${n}.java`)))],
  ["frozen manifest entries still present", () => [".LocationTrackerService", ".AppFirebaseMessagingService", ".ApnaApplication", "RingingBookingActivity"].every((n) => manifest.includes(n))],
];

let failed = 0;
for (const [name, fn] of checks) {
  let ok = false;
  try { ok = !!fn(); } catch { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
console.log(`\n${checks.length - failed}/${checks.length} invariants hold.`);
process.exit(failed ? 1 : 0);
