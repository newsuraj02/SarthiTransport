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
const css = read("src/index.css");
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

// Runs the REAL driver-KYC completeness helpers out of App.jsx (pure JS,
// between DRIVER_KYC_FIELDS and the END marker) -- the one definition of
// "KYC complete" the form, the sign-up checklist, the Incomplete screen and
// the admin badge all share (owner rule 2026-10-27).
const rules = read("firestore.rules");
function loadKycFns() {
  const start = app.indexOf("const DRIVER_KYC_FIELDS");
  const end = app.indexOf("// END driver KYC completeness helpers");
  const code = app.slice(start, end).replace(/\bexport /g, "");
  return new Function(code + "; return { DRIVER_KYC_FIELDS, getKycMissingFromValues, getDriverKycMissing, isDriverKycComplete };")();
}
// Runs the REAL isLikelyUninstalled (pure JS between UNINSTALL_INACTIVE_DAYS and driverInstallStatus).
function loadUninstallFn() {
  const start = app.indexOf("const UNINSTALL_INACTIVE_DAYS");
  const end = app.indexOf("// Single source of truth for \"which of the three buckets");
  return new Function("DAY_MS", app.slice(start, end).replace(/\bexport /g, "") + "; return isLikelyUninstalled;")(86400000);
}
// Runs the REAL Meta-export helpers out of AdminPanel.jsx (pure JS between toMetaPhone and the END marker).
function loadMetaExportFn() {
  const start = admin.indexOf("const toMetaPhone");
  const end = admin.indexOf("// END Meta users export helpers");
  return new Function(admin.slice(start, end) + "; return { toMetaPhone, buildMetaUsersCsv };")();
}
// Runs the REAL runDriverSignupFinalize (pure, everything injected) out of App.jsx.
function loadSignupFinalizeFn() {
  const start = app.indexOf("async function runDriverSignupFinalize");
  const end = app.indexOf("// END driver sign-up finalize");
  return new Function(app.slice(start, end) + "; return runDriverSignupFinalize;")();
}
const photo = (n) => ({ name: `${n}.jpg`, url: `https://example.test/${n}.jpg` });
const fullDriver = () => ({
  name: "Ramesh", mobile: "9999999999", kyc: "Approved", photo: photo("p"), docs: { dl: photo("dl"), photo: photo("p") },
  vehicleSpec: { type: "tata-109", vehicleNumber: "MH14XX1234", capacityKg: 2500, photoSide: photo("side") },
});

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
  ["role-select voice: welcome then question are QUEUED (never cut off); a plain speakGuide still replaces everything and drops lines waiting their turn (owner 2026-10-29 recheck)", async () => {
    const i = app.indexOf("let guideTimers = [];"), j = app.indexOf("// Re-added for the driver \"new load posted\" alert only");
    if (i < 0 || j < i) return false;
    const log = [];
    const win = { speechSynthesis: { speak: (u) => log.push("speak:" + u.text), cancel: () => log.push("cancel") } };
    const fn = new Function("window", "SpeechSynthesisUtterance", "SPEECH_RATE", app.slice(i, j) + "\nreturn speakGuide;");
    const speakGuide = fn(win, function (t) { this.text = t; }, 0.85);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    speakGuide("welcome", "hi"); speakGuide("question", "hi", { queue: true });
    await wait(400);
    const queuedOk = log.join(",") === "cancel,speak:welcome,speak:question";
    log.length = 0;
    speakGuide("a", "hi"); speakGuide("b", "hi", { queue: true }); speakGuide("c", "hi"); // c replaces a and the still-waiting b
    await wait(400);
    const replacedOk = log.join(",") === "cancel,cancel,speak:c";
    return queuedOk && replacedOk && app.includes("speakGuide(roleQuestion, lang, { queue: true })") && !app.includes("setTimeout(() => speakGuide(roleQuestion");
  }],
  ["sign-up's opening voice prompt asks for the NAME and mobile (the form's first field is the name)", () => count(app, 'Please enter your name and mobile number.') === 2],
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

  // ---- Look & feel (2026-10-26 refresh) ----
  ["borders/dividers use the soft C.line token, never hard black", () => app.includes('line: "#D5DCE8"') && !app.includes("solid #000000") && !admin.includes("solid #000000")],
  ["brand colours unchanged (marigold, orange, blue, green, red)", () => ["marigold: \"#FFCC00\"", "marigoldDeep: \"#FF6600\"", "navy: \"#0052CC\"", "success: \"#00A854\"", "safety: \"#FF2A2A\""].every((t) => app.includes(t))],
  ["no leftover old-palette greys/browns in App.jsx (use C tokens, #E5EAF2 disabled, #94A3B8 hints)", () => !/"#E0E0E0"|#C7B8B3|#E5E5E5|rgba\(42,33,28/.test(app) && !admin.includes("rgba(42,33,28")],
  ["Inter + Noto Sans Devanagari font is loaded and applied app-wide", () => css.includes('"Inter", "Noto Sans Devanagari"') && read("index.html").includes("family=Inter") && !css.includes("font-family: \"Arial Black\"")],

  // ---- Driver KYC is mandatory (owner rule 2026-10-27) ----
  ["KYC mandatory fields are exactly: photo, license, vehicle name/number/capacity, side photo -- no dimensions", () => {
    const k = loadKycFns();
    return JSON.stringify(k.DRIVER_KYC_FIELDS.map((f) => f.key)) === JSON.stringify(["photo", "dl", "vehicleName", "vehicleNumber", "capacityKg", "vehicleSide"])
      && !k.DRIVER_KYC_FIELDS.some((f) => /length|width|height|dimension/i.test(f.key + f.en));
  }],
  ["a fully filled driver is complete; missing ANY single mandatory field makes them incomplete", () => {
    const k = loadKycFns();
    if (!k.isDriverKycComplete(fullDriver())) return false;
    const breakers = [
      (d) => { d.photo = null; d.docs.photo = null; }, (d) => { d.docs.dl = null; },
      (d) => { d.vehicleSpec.type = ""; }, (d) => { d.vehicleSpec.vehicleNumber = "  "; },
      (d) => { d.vehicleSpec.capacityKg = null; }, (d) => { d.vehicleSpec.photoSide = null; },
    ];
    return breakers.every((brk, i) => { const d = fullDriver(); brk(d); return !k.isDriverKycComplete(d) && k.getDriverKycMissing(d).length === 1 && k.getDriverKycMissing(d)[0] === k.DRIVER_KYC_FIELDS[i].key; });
  }],
  ["capacity must be a real positive number ('0', 'abc', '-5' don't count)", () => {
    const k = loadKycFns();
    const miss = (c) => k.getKycMissingFromValues({ photo: photo("p"), dl: photo("d"), vehicleName: "x", vehicleNumber: "y", capacityKg: c, vehicleSide: photo("s") }).length;
    return miss("750") === 0 && miss(750) === 0 && miss("0") === 1 && miss("abc") === 1 && miss("-5") === 1 && miss("") === 1 && miss(null) === 1;
  }],
  ["no saved KYC at all (or no driver) is incomplete with every field outstanding; vehicle front photo is NOT required", () => {
    const k = loadKycFns();
    const d = fullDriver(); d.vehicleSpec.photoFront = null; d.vehicleSpec.photo = null;
    return k.getDriverKycMissing({ name: "A", mobile: "1", vehicleSpec: null, docs: null }).length === 6 && k.getDriverKycMissing(null).length === 6 && k.isDriverKycComplete(d);
  }],
  ["legacy driver whose only profile photo is driver.photo still counts as having a photo", () => {
    const k = loadKycFns();
    const d = fullDriver(); d.docs = { dl: photo("dl") };
    return k.isDriverKycComplete(d);
  }],
  ["KYC form's Submit is gated by the same shared list (getKycMissingFromValues) + the clause on a first submission", () => app.includes("const canSubmit = draftMissing.length === 0 && !termsMissing && !anyUploading && !submitting;") && app.includes("const draftMissing = getKycMissingFromValues({") && app.includes("const termsMissing = needsTerms && !acceptedTerms;")],
  ["incomplete drivers see the Incomplete form FIRST: gate sits before the Pending and Approved screens", () => {
    const gate = app.indexOf("{role === \"driver\" && driverKycIncomplete && !driverResubmitting && (");
    const pending = app.indexOf("!driverResubmitting && !driverKycIncomplete && driver.kyc !== \"Approved\"");
    const approved = app.indexOf("!driverResubmitting && !driverKycIncomplete && driver.kyc === \"Approved\"");
    return gate > 0 && pending > gate && approved > pending && app.includes("const driverKycIncomplete = !!(driverAuth.verified && driver && driver.vehicleSpec && driver.kyc !== \"Approved\" && driver.kyc !== \"Rejected\" && !isDriverKycComplete(driver));");
  }],
  ["Incomplete notice ('Incomplete form' + 'complete it to start your rides / trips') shows on the gate AND on sign-up step 2", () => count(app, "<KycIncompleteNotice lang={lang} missing={getDriverKycMissing(driver)} />") >= 2 && app.includes('"Incomplete form"') && app.includes("start your rides / trips")],
  ["sign-up refuses a number already registered for the same role, at the mobile step (owner 2026-10-28)", () => app.includes("Number Already exists. Try login") && app.includes('checkMobileRegistered("customer", mobile)') && app.includes('checkMobileRegistered("driver", mobile)') && !app.includes("already registered — please Login instead") && /exports\.checkMobileRegistered[\s\S]{0,700}pinAuthEmail\(mobile, toRole\)/.test(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "functions", "index.js"), "utf8"))],
  ["role selection uses the blue person icon for Customer and the blue driver-at-wheel icon for Driver (owner 2026-10-28)", () => app.includes('src="/role-customer.svg"') && existsSync(join(root, "public", "role-customer.svg")) && app.includes('src="/role-driver-icon.png"') && existsSync(join(root, "public", "role-driver-icon.png"))],
  ["driver sign-up step 1 has no 'Keep these ready' checklist (owner 2026-10-28)", () => !app.includes("Keep these ready") && !app.includes("DRIVER_KYC_FIELDS.map((f) => <li key={f.key}>")],
  ["Firestore lets a driver's own session set kyc only to 'Pending' (never Approved/Rejected)", () => rules.includes("request.resource.data.kyc == resource.data.kyc || request.resource.data.kyc == 'Pending'") && !/request\.resource\.data\.kyc == 'Approved'|request\.resource\.data\.kyc == 'Rejected'/.test(rules)],
  ["Approved drivers stay Approved: never gated, and submitting the KYC form never demotes them to Pending (owner 2026-10-27)", () => app.includes('kyc: driver.kyc === "Approved" ? "Approved" : "Pending", photo, docs: { dl, photo },') && !app.includes('...driver, kyc: "Pending", photo, docs')],
  ["Approved drivers missing documents get a dismissible reminder (not a lock): idle home only, 'Later' hides it for the session, 'Complete now' opens the KYC form", () => app.includes("function KycReminderBanner(") && app.includes("const [kycReminderDismissed, setKycReminderDismissed] = useState(false);") && app.includes("{realHamburgerVisible && !kycReminderDismissed && !isDriverKycComplete(driver) && (") && app.includes('onComplete={() => setSettingsView("kyc")} onDismiss={() => setKycReminderDismissed(true)}')],
  ["Uninstalled list: any recent sign of life (app open, live GPS, push-token save) keeps a driver OUT of it; only 14+ days of total silence puts them in", () => {
    const f = loadUninstallFn(); const D = 86400000; const ago = (d) => Date.now() - d * D; const ts = (d) => ({ toMillis: () => ago(d) });
    return f({ createdAt: ts(60), lastActiveAt: ts(20) }) === true                       // silent 20 days
      && f({ createdAt: ts(60), lastActiveAt: ts(2) }) === false                         // opened the app 2 days ago
      && f({ createdAt: ts(60), lastActiveAt: ts(30), lastKnownLocation: { updatedAt: ago(1) } }) === false   // old open, but GPS reported yesterday
      && f({ createdAt: ts(60), fcmTokenSavedAt: ago(3) }) === false                     // push token saved 3 days ago
      && f({ createdAt: ts(60) }) === true && f({ createdAt: ts(5) }) === false           // no signal at all -> signup date decides
      && f({}) === false;                                                                // nothing known -> never flagged
  }],
  ["lastActiveAt is stamped by the root App for EVERY signed-in driver state (not only the Approved dashboard), on open and on return to foreground", () => app.includes("const lastActiveWriteRef = useRef(0);") && app.includes('document.addEventListener("visibilitychange", onVisible);\n    return () => document.removeEventListener("visibilitychange", onVisible);\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [driverAuth.verified, driverAuth.mobile, !!driver]);') && count(app, "{ lastActiveAt: serverTimestamp() }") === 1],
  ["Admin: 'Uninstall' keeps its name, labelled 'Inactive 14+ days'; the Uninstalled page holds ONLY inactive drivers; Blocked drivers have their own Live-Map-style tile + page with Unblock (owner 2026-10-27)", () => admin.includes('items: [...uninstalledDrivers].sort(') && !admin.includes("inactiveDrivers") && admin.includes('"Inactive 14+ days"') && admin.includes('onClick={() => setDetailView("blocked")}') && admin.includes("items: blacklistedDrivers,") && admin.includes('title: lang === "en" ? "Uninstalled" :')],
  ["Meta export: one `phone` column, 91+10 digits, drivers + customers, everyone included, duplicates merged, junk skipped (not guessed)", () => {
    const { toMetaPhone, buildMetaUsersCsv } = loadMetaExportFn();
    const r = buildMetaUsersCsv(
      [{ mobile: "9812345678" }, { id: "9822222222", blacklisted: true }, { mobile: "+91 98765 43210" }, { mobile: "12345" }, { mobile: "" }],
      [{ mobile: "9812345678" }, { mobile: "09833333333" }, { id: "5000000000" }, null]
    );
    return toMetaPhone("9812345678") === "919812345678" && toMetaPhone("919812345678") === "919812345678" && toMetaPhone("5123456789") === null && toMetaPhone("abc") === null
      && r.csv === "phone\n919812345678\n919822222222\n919833333333\n919876543210\n"
      && r.driverCount === 3 && r.customerCount === 2 && r.total === 4 && r.skipped === 4
      && buildMetaUsersCsv([], []).csv === "phone\n" && buildMetaUsersCsv([], []).total === 0;
  }],
  ["Meta export downloads through a server-made https link (admin-only callable) so it works in the Android app (owner 2026-10-29)", () => admin.includes("await createCsvDownloadLink(metaExport.csv, fileName)") && /exports\.createCsvDownloadLink[\s\S]{0,400}token\?\.admin !== true/.test(readFileSync(join(root, "functions", "index.js"), "utf8")) && readFileSync(join(root, "functions", "index.js"), "utf8").includes('contentDisposition: `attachment; filename="${safeName}"`')],
  ["customer booking main page asks only for the DROP, then weight, then vehicles; the map stays; pickup is the current location, shown in a top-right pill that opens the separate Pickup page (owner 2026-10-29)", () => app.includes("function StepSummary(") && app.includes("function RecentPlacesList(") && app.includes("function PickupPill(") && app.includes("function PickupPage(") && app.includes("recentPlaces={recentPlaces}") && app.includes("const showDropStep = !dropDone;") && app.includes("const showWeightStep = pickupDone && dropDone;") && app.includes("{pickupPageOpen && (") && app.includes("const [pickupAuto, setPickupAuto] = useState(true);") && app.includes("{locationsReady && pickupDone && dropDone && (") && app.includes("<NearbyVehiclesMap drivers={drivers} customerLocation={pickupCoords || customerLocation} height=\"35vh\"")],
  ["booking steps move with a short buffering beat (drop -> weight), no check icon, and never auto-open the keyboard (owner 2026-10-29)", () => app.includes("const commitStep = (which) => {") && app.includes('commitStep("drop")') && !app.includes("dropFieldRef.current?.focus(), 120") && !app.includes("weightInputRef.current?.focus(), 120") && !/shrink-0 w-5 h-5 rounded-full[^\n]*✓/.test(app)],
  ["Pickup page: search box + recent places, with Current Location and Locate on Map at the bottom (owner 2026-10-29)", () => { const i = app.indexOf("function PickupPage("); if (i < 0) return false; const seg = app.slice(i, i + 9000); const a = seg.indexOf("<LocationField"), b = seg.indexOf("<RecentPlacesList items={recentPlaces}"), c = seg.indexOf("onClick={onUseCurrent}"), d = seg.indexOf("setMapMode(true)"); return a > 0 && b > a && c > b && d > c && seg.includes("Current Location") && seg.includes("Locate on Map") && seg.includes("Confirm pickup"); }],
  ["booking location boxes use smaller text and wrap suggestions/summaries to 2 lines so more of an address shows (owner 2026-10-29)", () => count(app, "compact\n") >= 2 && app.includes("text-[11.5px] font-semibold") && count(app, "WebkitLineClamp: 2") >= 2],
  ["no overlaps on the customer booking page: zoom buttons bottom-right of the map with the driver-count badge under them; header always reserves the Refresh button's corner (owner 2026-10-29)", () => app.includes('absolute right-2 bottom-5 flex flex-col items-end gap-2 pointer-events-none') && app.includes('aria-label="Zoom in"') && app.includes('aria-label="Zoom out"') && !app.includes('absolute top-2 left-2 text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm whitespace-nowrap') && app.includes("Always reserve the Refresh button's spot") && !app.includes("{showHamburger ? null : <div className=\"w-9 h-9 shrink-0\" />}")],
  ["booking map: keeps the customer's own zoom/pan until the page is refreshed, takes 50% of the screen, and uses the sleek top-down truck + blue-dot pickup markers (owner 2026-10-29)", () => app.includes("let nearbyMapUserView = null;") && app.includes("if (userAdjustedRef.current) return; // the customer has set their own view") && app.includes('height="50vh" lang={lang} onMapClick={onMapClick} refitKey=') && app.includes("function truckMarkerIcon(headingDeg = null, active = true)") && app.includes("export function driverTruckIcon(headingDeg = null) { return truckMarkerIcon(headingDeg, true); }") && app.includes("return truckMarkerIcon(headingDeg, true);") && !app.includes('fill="#f3dfae"')],
  ["Meta export also offers copy/paste of the numbers (the Android WebView can't download blobs) (owner 2026-10-29)", () => admin.includes("const copyMetaNumbers = async () => {") && admin.includes("navigator.clipboard.writeText(metaNumbersText)") && admin.includes("<textarea readOnly value={metaNumbersText}")],
  ["Admin Settings has the 'Export app users for ads (Meta)' card wired to the real driver + customer lists", () => admin.includes("const metaExport = buildMetaUsersCsv(drivers, customers);") && admin.includes("<AdminSettings drivers={drivers} customers={customers} ") && admin.includes("Download CSV for Meta")],
  ["Customer + Driver first screens: 'Sign Up' sits ABOVE 'Login' and both buttons are yellow (owner 2026-10-28)", () => {
    const yellow = 'className="w-full rounded-lg py-4 font-bold text-base" style={{ background: C.marigold, color: "#000000" }}>';
    return ["(New Customer)", "(New Driver)"].every((who) => {
      const i = app.indexOf(`"Sign Up ${who}"`); const j = app.indexOf('"Login" : lang === "mr" ? "लॉगिन करा"', i);
      return i > 0 && j > i && j - i < 400 && app.lastIndexOf('onClick={() => setMode("signup")} ' + yellow, i) > i - 700 && app.lastIndexOf('onClick={() => setMode("login")} ' + yellow, j) > i;
    });
  }],
  ["Customer sign-up: optional 'Firm Name' sits under Full Name (before phone + PIN) in both forms, is saved with the profile; only photo + firm name are optional", () => count(app, '"Firm Name (Optional)"') === 2 && app.includes('firmName: firmName.trim() || null,') && app.includes("const detailsValid = name.trim().length >= 3;") && app.indexOf('"Firm Name (Optional)"') > app.indexOf('"Full Name" : lang === "mr" ? "पूर्ण नाव"')],
  // ---- Driver sign-up (owner 2026-10-28): account only at the very end; clause after Step 2 ----
  ["Driver sign-up: the account is created ONLY by the final 'Create Account' (createAccountAndSubmit); step 1 + the PIN screen only collect, with a 'Continue' button and NO clause", () => {
    const a = app.indexOf("function DriverOnboarding("), b = app.indexOf("// DRIVER KYC PORTAL"); const reg = app.slice(a, b);
    const fn = reg.slice(reg.indexOf("const createAccountAndSubmit"), reg.indexOf("// Account exists and the driver doc has arrived"));
    return count(reg, "createUserWithEmailAndPassword(") === 1 && fn.includes("createUserWithEmailAndPassword(")
      && reg.includes("onClick={goToDocsStage}") && !reg.includes("setAcceptedDocsTerms") && !reg.includes("sarthi_driverReg_acceptedDocsTerms") && !reg.includes("<DocsTermsCheckbox") && !reg.includes('"Create Account" : lang === "mr"')
      && !reg.includes("accept the document responsibility clause");
  }],
  ["Driver documents form: the clause sits AFTER Step 2 Vehicle Details, right above the final button, which reads 'Create Account' during sign-up", () => {
    const a = app.indexOf("function DriverKyc("); const k = app.slice(a);
    const i = k.indexOf("Fill this clearly"), j = k.indexOf("<DocsTermsCheckbox lang={lang}"), l = k.indexOf("To submit, still needed"), m = k.indexOf('"Create Account" : lang === "mr"');
    return i > 0 && j > i && l > j && m > l && count(app, "<DocsTermsCheckbox lang={lang}") === 1;
  }],
  ["sign-up forms never remember typed values and Back wipes them (owner 2026-10-28)", () => !app.includes("sarthi_customerReg_name") && !app.includes("sarthi_customerReg_firmName") && !app.includes("sarthi_customerReg_photo") && !app.includes("sarthi_driverReg_name\"") && count(app, "const resetForm = () => {") === 2 && count(app, "resetForm(); setMode(null);") === 4 && app.includes('<button onClick={resetForm} className="flex items-center gap-1 mb-1 p-3')],
  ["Photos picked before the account exists are held in memory only (never persisted) and uploaded after it", () => count(app, ", !deferred);") === 8 && app.includes("setVal({ name: f.name, url: URL.createObjectURL(f), file: f });") && app.includes("await runDriverSignupFinalize(pendingSignupRef.current, driver, {")],
  ["runDriverSignupFinalize (real code): uploads first, then ONE complete profile patch (Pending, name, docs, vehicle, side photo) -- the doc a driver ends up with is KYC-complete", async () => {
    const run = loadSignupFinalizeFn(), k = loadKycFns();
    const calls = []; const saved = [];
    const f = (n) => ({ file: { name: n }, url: "blob:" + n, name: n });
    const pending = { name: "Suresh Jadhav", photo: f("me"), dl: f("dl"), vehiclePhotoSide: f("side"), vehicleTypeName: "Tata 109", capacityKg: "2500", vehicleNumber: " mh14ab1234 " };
    const types = [];
    await run(pending, { mobile: "9123456780", name: "9123456780", kyc: null }, {
      uploadPhoto: async (file, path) => { calls.push(path); return { name: file.name, url: "https://x/" + path }; },
      classifyPhoto: async () => ({ ok: true, isMatch: true }), setDriver: (d) => saved.push(d), addVehicleType: (t) => types.push(t), vehicleTypes: [], slugify: (x) => x.toLowerCase().replace(/\s+/g, "-"), ref: "9000000000",
    });
    const d = saved[0];
    return saved.length === 1 && JSON.stringify(calls) === JSON.stringify(["drivers/9123456780/photo.jpg", "drivers/9123456780/dl.jpg", "drivers/9123456780/vehicleSide.jpg"])
      && d.kyc === "Pending" && d.name === "Suresh Jadhav" && d.referredBy === "9000000000" && d.vehicleSpec.vehicleNumber === "MH14AB1234" && d.vehicleSpec.capacityKg === 2500 && d.vehicleSpec.type === "tata-109"
      && types.length === 1 && types[0].key === "tata-109" && k.isDriverKycComplete(d);
  }],
  ["runDriverSignupFinalize: a wrong-kind DL/side photo (AI check) is NOT saved and not uploaded -- the driver lands on Incomplete form listing exactly that item; an upload failure saves nothing", async () => {
    const run = loadSignupFinalizeFn(), k = loadKycFns();
    const f = (n) => ({ file: { name: n }, url: "blob:" + n, name: n });
    const pending = { name: "S J", photo: f("me"), dl: f("dl"), vehiclePhotoSide: f("side"), vehicleTypeName: "Tata", capacityKg: "900", vehicleNumber: "MH12" };
    const uploads = []; const saved = [];
    await run(pending, { mobile: "9123456780" }, {
      uploadPhoto: async (file, path) => { uploads.push(path); return { name: file.name, url: "u" }; },
      classifyPhoto: async (file, type) => (type === "vehicleSide" ? { ok: true, isMatch: false } : { ok: true, isMatch: true }),
      setDriver: (d) => saved.push(d), addVehicleType: () => {}, vehicleTypes: [{ key: "tata", label: "Tata" }], slugify: (x) => x, ref: null,
    });
    const missing = k.getDriverKycMissing(saved[0]);
    let threw = false; const saved2 = [];
    try {
      await run(pending, { mobile: "9123456780" }, { uploadPhoto: async () => null, classifyPhoto: async () => null, setDriver: (d) => saved2.push(d), addVehicleType: () => {}, vehicleTypes: [], slugify: (x) => x, ref: null });
    } catch { threw = true; }
    return !uploads.some((u) => u.includes("vehicleSide")) && saved[0].vehicleSpec && saved[0].vehicleSpec.photoSide === null && JSON.stringify(missing) === '["vehicleSide"]' && threw && saved2.length === 0;
  }],
  ["admin KYC badge is plain green for Approved (completeness doesn't change it)", () => admin.includes('background: d.kyc === "Approved" ? C.success : C.safety }} title={km.label}>KYC</span>') && !admin.includes("isDriverKycComplete")],

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
  try { ok = !!(await fn()); } catch { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
console.log(`\n${checks.length - failed}/${checks.length} invariants hold.`);
process.exit(failed ? 1 : 0);
