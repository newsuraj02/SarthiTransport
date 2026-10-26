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

// Runs the REAL weight functions out of App.jsx (the slice between the cap
// constant and weightUnitLabel is pure JS, no JSX) so the weight rules are
// pinned by behavior, not just by matching their source text.
function loadWeightFns() {
  const start = app.indexOf("const MAX_BOOKING_WEIGHT_KG");
  const end = app.indexOf("function weightUnitLabel");
  return new Function(app.slice(start, end) + "; return { getWeightInputChange, isWeightValid, MAX_KG: MAX_BOOKING_WEIGHT_KG };")();
}
// Types a string into the field one character at a time, as onChange sees it.
function typeInto(w, unit, text) {
  let value = "";
  for (const ch of text) value = w.getWeightInputChange(value + ch, unit, value).clean;
  return value;
}
const toKg = (v, unit) => (Number(v) || 0) * (unit === "ton" ? 1000 : 1);

const checks = [
  // ---- Weight cap: nothing above 35 ton / 35000 kg is ever accepted (owner rule 2026-10-26) ----
  ["weight cap constant is 35000 kg", () => app.includes("const MAX_BOOKING_WEIGHT_KG = 35000;") && loadWeightFns().MAX_KG === 35000],
  ["typing past 35000 kg is refused, 35000 itself allowed", () => { const w = loadWeightFns(); return typeInto(w, "kg", "35000") === "35000" && typeInto(w, "kg", "35001") === "3500" && typeInto(w, "kg", "99999") === "9999"; }],
  ["typing past 35 ton is refused (incl. the reported 9000), 35 itself allowed", () => { const w = loadWeightFns(); return typeInto(w, "ton", "35") === "35" && typeInto(w, "ton", "36") === "3" && typeInto(w, "ton", "9000") === "9" && typeInto(w, "ton", "35.5") === "35."; }],
  ["pasting an over-cap number leaves the field empty", () => { const w = loadWeightFns(); return w.getWeightInputChange("99999", "kg", "").clean === "" && w.getWeightInputChange("90", "ton", "").clean === ""; }],
  ["isWeightValid rejects everything above the cap, on any path", () => { const w = loadWeightFns(); return w.isWeightValid("35000", "kg") && !w.isWeightValid("35001", "kg") && !w.isWeightValid("99999", "kg") && w.isWeightValid("35", "ton") && !w.isWeightValid("35.001", "ton") && !w.isWeightValid("9000", "ton") && w.isWeightValid("0.5", "ton"); }],
  ["no typed input of any shape can end above the cap", () => { const w = loadWeightFns(); const samples = ["1", "123", "12345", "123456", "99999", "40000", "36000", "99", "36", "35.5", "99.999", "12345678", "35.001"]; return ["kg", "ton"].every((u) => samples.every((s) => toKg(typeInto(w, u, s), u) <= w.MAX_KG)); }],
  ["both booking forms hand over the previous value and show the 'Maximum weight' note", () => count(app, "getWeightInputChange(e.target.value, weightUnit, weight)") >= 2 && count(app, "Maximum weight is ") >= 2 && count(app, "setWeightCapHit(capped)") >= 2],

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
  ["admin message banner has the play/stop speaker toggle and no X dismiss", () => app.includes("toggleAnnouncementAudio(announcement.audioUrl)") && app.includes("toggleAnnouncementAudio(n.audioUrl)") && !app.includes("onDismiss={announcementAlerts.markSeen}")],
  ["every spoken sound uses the one slower SPEECH_RATE (0.85); nothing sets its own speed", () => app.includes("const SPEECH_RATE = 0.85;") && count(app, "utterance.rate = SPEECH_RATE;") === 2 && !/utterance\.rate = (?!SPEECH_RATE)/.test(app) && app.includes("audio.playbackRate = SPEECH_RATE;")],
  ["speaker is a strict on/off: tapping twice never overlaps, new audio replaces old", () => {
    const start = app.indexOf("let announcementAudio = null;");
    const end = app.indexOf("function useAnnouncementPlayingUrl");
    const made = [];
    class FakeAudio {
      constructor(url) { this.url = url; this.paused = false; made.push(this); }
      play() { return Promise.resolve(); }
      pause() { this.paused = true; }
    }
    const SPEECH_RATE = 0.85;
    const api = new Function("Audio", "SPEECH_RATE", app.slice(start, end) + "; return { toggleAnnouncementAudio, playAnnouncementAudio, state: () => announcementPlayingUrl };")(FakeAudio, SPEECH_RATE);
    const live = () => made.filter((a) => !a.paused).length;
    api.toggleAnnouncementAudio("a");                       // tap -> plays
    if (live() !== 1 || api.state() !== "a" || made[0].playbackRate !== SPEECH_RATE) return false;
    api.toggleAnnouncementAudio("a");                       // tap again -> stops, no second copy
    if (live() !== 0 || api.state() !== null || made.length !== 1) return false;
    api.toggleAnnouncementAudio("a"); api.toggleAnnouncementAudio("b"); // another message -> replaces it
    return live() === 1 && api.state() === "b";
  }],

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
