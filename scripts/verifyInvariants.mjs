// Regression guard for behavior the owner has confirmed working. Run after
// ANY change (npm run verify:invariants) -- a FAIL means a rule listed in
// CLAUDE.md ("Verified-working behavior -- KEEP INTACT") was altered or
// removed, and must be understood and fixed (or, if the owner asked for the
// change, the check updated in the same commit) before pushing.
//
// Deliberately plain text/count checks, not an import of App.jsx (JSX plus
// Firebase can't be loaded in bare Node) -- each one pins the exact source
// text of a rule that was hard-won and verified on real devices.
import { readFileSync as rawReadFileSync, existsSync } from "node:fs";
// Windows checkouts (git autocrlf) turn every newline into CRLF; the checks below
// match multi-line snippets, so read everything with plain LF line endings.
const readFileSync = (p, enc) => { const v = rawReadFileSync(p, enc); return typeof v === "string" ? v.replace(/\r\n/g, "\n") : v; };
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
  ["booking form (Current AND Advance share it) hand over the previous value and show the 'Maximum weight' note", () => count(app, "getWeightInputChange(e.target.value, weightUnit, weight)") >= 1 && count(app, "Maximum weight is ") >= 1 && count(app, "setWeightCapHit(capped)") >= 1],

  // ---- Weight input rules (customer booking) ----
  ["kg input is 3-5 digits", () => app.includes("const KG_WEIGHT_RE = /^\\d{3,5}$/;")],
  ["ton input is max 2 integer + 3 decimal digits (so 9000 ton can never be typed)", () => app.includes("const TON_WEIGHT_RE = /^\\d{1,2}(\\.\\d{1,3})?$/;")],
  ["keystroke caps: kg 5 digits, ton 2 integer digits", () => app.includes("digitsOnly.slice(0, 5)") && app.includes("intPart.slice(0, 2)")],
  ["booking form (Current AND Advance share it) validate weight with isWeightValid", () => count(app, "isWeightValid(weight, weightUnit)") >= 1],
  ["booking form (Current AND Advance share it) convert ton to kg before use", () => count(app, '(weightUnit === "ton" ? 1000 : 1)') >= 1],
  ["booking form (Current AND Advance share it) save weightKg in kg (loadKg)", () => count(app, "weightKg: loadKg || null") >= 1],
  ["booking form (Current AND Advance share it) block loads above the biggest vehicle", () => count(app, "loadKg > maxFleetCapacityKg") >= 1],
  ["admin never prints weightKg with weightUnit as suffix (the '9000ton' bug)", () => !admin.includes("${req.weightKg}${req.weightUnit")],

  // ---- Pricing ----
  ["diesel baseline is Rs 98/L", () => app.includes("export const DIESEL_BASELINE_PRICE_PER_LITRE = 98;")],
  ["outstation fares go through priceOutstation", () => app.includes("total = priceOutstation(tier.maxKg, km, tiers);")],
  ["outstation anchor tiers unchanged", () => app.includes("const OUTSTATION_ANCHOR_TIER_KGS = [500, 750, 1200, 2000, 3500, 5000];")],
  ["short-distance donor tiers unchanged", () => app.includes("const SHORT_DISTANCE_DONOR_KG = { 500: 750, 3500: 5000 };")],
  ["bigger vehicle never cheaper: enforceMonotonicFares applied in the shared booking flow (Current + Advance)", () => count(app, "return enforceMonotonicFares(afterOutliers);") >= 1],
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
  ["customer booking flow (owner 2026-10-29): screen 1 = Pickup + Use Current Location + last 3 whole trips (no Book button yet); Drop box hidden until Pickup is selected; Weight hidden until Pickup AND Drop are selected; a tapped trip fills both and moves the cursor to Weight; 'Book this vehicle' (inline under the chosen card, then 'See all vehicles'; books the TAPPED vehicle) exists only once a vehicle is tapped -- nothing is pre-selected", () => { const a = app.indexOf("function CustomerBooking("), b = app.indexOf("function CustomerAdvanceBooking("); const cb = app.slice(a, b); return cb.includes("recentTrips") && cb.includes("onTripSelected") && cb.includes("<SmoothCollapse show={showDrop && !weightTyped && !tripHidden}>") && cb.includes("{showWeight && !chosen && (") && cb.includes("const showDrop = pickupSelected;") && cb.includes("const showWeight = placesReady;") && cb.includes("const canBook = locationsReady && !sameLocation && weightReady && !exceedsFleetMax && !!bookEntry;") && cb.includes("disabled={!canBook || !!sendingKey}") && cb.includes("{chosen && (") && cb.indexOf("Book this vehicle") < cb.indexOf("See all vehicles") && cb.includes('"सभी गाड़ियाँ देखें"') && cb.includes('"सर्व गाड्या पहा"') && !cb.includes("sticky bottom-0") && !cb.includes("Choose another vehicle") && cb.includes("const bookEntry = selectedEntry;") && !cb.includes("nearbyDrivers[0] || null") && cb.includes("const isSelected = !!selectedEntry && selectedEntry.id === key;") && cb.includes("}, 700);") && cb.includes('onClick={useCurrentLocationForPickup}') && !cb.includes("PickupPill") && !cb.includes("PickupPage") && !cb.includes("commitStep") && app.includes("recentTrips={recentTrips}") && app.includes("const recentTrips = [];"); }],
  ["no overlaps on the customer booking page: driver-count badge bottom-right of the map, NO +/- zoom buttons; header always reserves the Refresh button's corner (owner 2026-10-29)", () => app.includes('absolute right-2 bottom-5 flex flex-col items-end gap-2 pointer-events-none') && !app.includes('aria-label="Zoom in"') && !app.includes('aria-label="Zoom out"') && !app.includes('const zoomBy = ') && !app.includes('absolute top-2 left-2 text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm whitespace-nowrap') && app.includes("Always reserve the Refresh button's spot") && !app.includes("{showHamburger ? null : <div className=\"w-9 h-9 shrink-0\" />}")],
  ["booking map: keeps the customer's own zoom/pan until the page is refreshed, stays a compact 35% of the screen height, and uses the sleek top-down truck + blue-dot pickup markers (owner 2026-10-29)", () => app.includes("let nearbyMapUserView = null;") && app.includes("if (userAdjustedRef.current) return; // the customer has set their own view") && app.includes('height="35vh" lang={lang} onMapClick={onMapClick}\n') && app.includes("{!pickup.trim() && recentTrips && recentTrips.length > 0 && (") && !app.includes("Your recent trips") && !app.includes("tripSuggestions") && app.includes("function truckMarkerIcon(headingDeg = null, active = true)") && app.includes("export function driverTruckIcon(headingDeg = null) { return truckMarkerIcon(headingDeg, true); }") && app.includes("return truckMarkerIcon(headingDeg, true);") && !app.includes('fill="#f3dfae"')],
  ["Set Fare button shows only on the driver's main page (owner 2026-10-29)", () => /\{realHamburgerVisible && \(\s*<button onClick=\{\(\) => setSetFareOpen\(true\)\}/.test(app)],
  ["booking screen follows the developer brief (owner 2026-10-29): typing a weight tucks Pickup+Drop away; the map then shows only the matching active vehicles; choosing a vehicle leaves only that vehicle + Book Now + Choose another vehicle (map: that type only, nearest ringed with its minutes); typing in Pickup clears drop/distance/weight and typing in Drop clears distance/weight; places carry Google place ids and are re-read in the new language; after booking the form clears with 'Your message has gone to drivers'", () => {
    const a = app.indexOf("function CustomerBooking("), b = app.indexOf("function CustomerAdvanceBooking("); const cb = app.slice(a, b);
    return cb.includes("const weightTyped = showWeight && !!weight.trim();") && cb.includes("<SmoothCollapse show={!weightTyped && !tripHidden}>")
      && !cb.includes("sticky top-0 z-20") && !cb.includes("View Map") && cb.includes("activeOnly={weightTyped}") && cb.includes("fixedDrivers={mapFixedDrivers}") && cb.includes("highlightLabel={mapHighlight?.label")
      && cb.includes("const visibleDrivers = selectedEntry ? [selectedEntry] : nearbyDrivers;") && cb.includes("setSelectedDriverKey(null)} disabled={!!sendingKey}") && cb.includes("e.tier.maxKg === selectedEntry.tier.maxKg")
      && cb.includes("const clearAfterPickup = () => {") && cb.includes("const clearAfterDrop = () => {") && cb.includes("onChange={(e) => onPickupTyped(e.target.value)}") && cb.includes("onChange={(e) => onDropTyped(e.target.value)}")
      && cb.includes('<div className="relative z-40 flex items-start gap-2">') && cb.includes('<div className="anim-rise relative z-30">') && cb.includes("const tripHidden = fromTrip && placesReady;") && cb.includes("setFromTrip(true);") && cb.includes("pickupPlaceId, dropPlaceId,") && cb.includes("localizePlace(") && cb.includes("reverseGeocodeFull(") && cb.includes("readLangReloadDraft()")
      && cb.includes("else { resetBookingForm(); setSendingKey(null); setBookedMsg(true); }") && cb.includes("Your message has gone to drivers")
      && app.includes("pickupPlaceId: pickupPlaceId ?? null, dropPlaceId: dropPlaceId ?? null, placeLang: lang") && app.includes("placeId: p.place_id || null") && app.includes("window.sessionStorage.setItem(LANG_RELOAD_KEY")
      && app.includes("const key = `${b.pickupPlaceId || pickupName}|${b.dropPlaceId || dropName}`;")
      && app.includes("function NearbyVehiclesMap(") && app.includes("fixedDrivers || nearbyOnlineDrivers(drivers, customerLocation)");
  }],
  ["maps are isolated and the customer header row sits above them (owner 2026-10-29: tapping a header icon set a map point as Pickup): NearbyVehiclesMap + LiveTrackingMap roots use isolation:isolate, the header row is relative z-30 and the fixed Refresh button z-[60] (above the header row's own transparent spacer, which otherwise swallows its taps)", () => app.includes('<div className="relative overflow-hidden" style={{ height, isolation: "isolate" }}>') && app.includes('style={{ height, background: "#E2E8F0", isolation: "isolate" }}') && app.includes('border: `1px solid ${C.line}`, isolation: "isolate" }}') && app.includes('<div className="relative z-30 flex items-center justify-between gap-2 px-5 pt-3 pointer-events-none [&_button]:pointer-events-auto">') && app.includes('<div className="w-9 h-9 shrink-0 pointer-events-none" aria-hidden="true" />') && app.includes('className="fixed right-3 z-[60] w-9 h-9 rounded-full')],
  ["Refresh works even when something covers it (owner 2026-10-29: dead on the customer screen, fine on the driver's): a tap that starts and ends inside the button's rectangle refreshes, caught at the window's capture phase; one lock stops a double fire", () => app.includes("const refreshBtnRef = useRef(null);") && app.includes('window.addEventListener("pointerup", onUp, true);') && app.includes("<button ref={refreshBtnRef} onClick={refreshButton.refresh}") && app.includes("const lockRef = useRef(false);") && app.includes("if (refreshing || lockRef.current) return;")],
  ["Current | Advance toggle at the top of the customer screen (owner 2026-10-30): both options always visible, the active one GREEN for Current Booking / BLUE for Advance Booking (matching the hamburger-menu items), app always opens on Current (advanceOpen starts false)", () => app.includes("const [advanceOpen, setAdvanceOpen] = useState(false);") && app.includes("aria-pressed={!advanceOpen} onClick={() => setAdvanceOpen(false)}") && app.includes("aria-pressed={advanceOpen} onClick={() => setAdvanceOpen(true)}") && app.includes('background: !advanceOpen ? C.success : "transparent"') && app.includes('background: advanceOpen ? "#0052CC" : "transparent"') && app.includes('"Current Booking" : "करंट बुकिंग"') && app.includes('"Advance Booking" : lang === "mr" ? "अ‍ॅडव्हान्स बुकिंग" : "एडवांस बुकिंग"') && app.includes('"View Current Booking/s"') && !app.includes("setAdvanceOpen((v) => !v)") && app.includes('<div className="flex-1 min-w-0 flex items-center justify-center">') && app.includes("(advanceBookings.length > 0 || !!activeBooking) && (")],
  ["Advance Booking is the SAME screen as Current Booking plus date and time (owner 2026-10-30): CustomerAdvanceBooking just renders CustomerBooking with `advance`; the shared code adds ONE single Date & Time box (one tap opens a two-step sheet: 1 Select Date -> 2 Time slots -> Confirm; the date field shows a grey 'Select date' prompt) AFTER the Pickup/Drop flow (only once both are entered, before Weight), 50 km radius, slot-based driver availability, minimum-notice check and scheduledFor; Weight waits for date AND time", () => {
    const a = app.indexOf("function CustomerBooking("), b = app.indexOf("function CustomerAdvanceBooking("); const cb = app.slice(a, b); const adv = app.slice(b, b + 400);
    return adv.includes("return <CustomerBooking {...props} advance />;") && !app.slice(b + 400, b + 4000).includes("const [advanceDate, setAdvanceDate]")
      && cb.includes("advance = false }) {") && cb.includes("const scheduleReady = !advance || !!(advanceDate && advanceTime);") && cb.includes("const bidRadiusKm = advance ? ADVANCE_BID_RADIUS_KM : CURRENT_BID_RADIUS_KM;")
      && cb.includes("findDriverLoadConflict(d, advance ? { scheduledFor: scheduledForValue } : {}, bookings, VEHICLES, lang)") && cb.includes("minAdvanceNoticeHours(entry.tier.maxKg)") && cb.includes("scheduledFor: advance ? scheduledForValue : null")
      && cb.includes("const locationsReady = placesReady && scheduleReady;") && !cb.includes("disabled={!scheduleReady}") && cb.includes("{advance && placesReady && !chosen && (") && !cb.includes('type="datetime-local"') && cb.includes('"Choose date & time"') && cb.includes("onSelect={(t, d) => {") && app.includes('"Choose Date & Time"') && app.includes("onSelect(pending, pendingDate)") && app.includes("const [step, setStep] = useState(1); // 1 = Select Date, 2 = Time slots") && app.includes('T("Select Date", "तारीख चुनें", "तारीख निवडा")') && app.includes('T("Time slots", "समय स्लॉट", "वेळेचे स्लॉट")') && app.includes('T("Confirm", "पुष्टि करें", "निश्चित करा")') && app.includes('T("Select date", "तारीख चुनें", "तारीख निवडा")') && app.includes('pendingDate ? C.ink : "#94A3B8"') && cb.indexOf("<TimeSlotModal open={showTimeModal}") > cb.indexOf("</button>\n          </div>\n          {/* Outside the .anim-rise block on purpose") && cb.includes("{advance && placesReady && !scheduleReady && (") && cb.indexOf("{advance && placesReady && !chosen && (") > cb.indexOf("{showDrop && !weightTyped && !tripHidden && (") && cb.indexOf("{advance && placesReady && !chosen && (") < cb.indexOf("{showWeight && !chosen && (")
      && app.includes("recentTrips={recentTrips} lang={lang} drivers={drivers}") && (app.match(/<CustomerAdvanceBooking /g) || []).length === 1;
  }],
  ["address language (owner 2026-10-31, developer brief): the Pickup/Drop boxes get addresses from the server in the app's language -- searchPlaces / getPlace / getAddress callables (signed-in only), English words transliterated into the script, plus codes stripped, results cached; the client tries them first and falls back to the in-browser Google lookup (city-only boxes keep the old path); existing functions untouched", async () => {
    const { createRequire } = await import("node:module");
    const { createAddressService, resolveLang, GeoError } = createRequire(import.meta.url)(join(root, "functions", "addressLang.js"));
    const TR = { Rajeshivajinagar: "राजेशिवाजीनगर", Pimpri: "पिंपरी", Chinchwad: "चिंचवड" };
    const store = new Map(); let googleCalls = 0;
    const fetchFn = async (url) => {
      const u = String(url);
      if (u.startsWith("https://inputtools.google.com")) { const w = decodeURIComponent(u.match(/text=([^&]*)/)[1]); return { ok: true, json: async () => (TR[w] ? ["SUCCESS", [[w, [TR[w]]]]] : ["FAILED"]) }; }
      googleCalls++;
      return { ok: true, json: async () => ({ status: "OK", results: [{ formatted_address: "JQ38+PRM, 16/189, Rajeshivajinagar, Pimpri-Chinchwad", place_id: "PID" }] }) };
    };
    const svc = createAddressService({ fetchFn, mapsKey: () => "K", cache: { get: async (id) => store.get(id) || null, set: async (id, d) => { store.set(id, d); } } });
    const hi = await svc.getAddress(18.6298, 73.8131, "hi"); await svc.getAddress(18.6298, 73.8131, "hi");
    const en = await svc.getAddress(18.6298, 73.8131, "en");
    const callsForTwoLanguages = googleCalls; // Hindi (once, then cached) + English = 2 Google calls
    const down = createAddressService({ fetchFn: async (u) => { if (String(u).includes("inputtools")) throw new Error("down"); return fetchFn(u); }, mapsKey: () => "K", cache: { get: async () => null, set: async () => {} } });
    const outage = await down.getAddress(1, 2, "hi");
    let typed = false; try { await createAddressService({ fetchFn: async () => ({ ok: true, json: async () => ({ status: "ZERO_RESULTS" }) }), mapsKey: () => "K", cache: { get: async () => null, set: async () => {} } }).getAddress(1, 2, "hi"); } catch (e) { typed = e instanceof GeoError; }
    const behaviour = hi.address === "16/189, राजेशिवाजीनगर, पिंपरी-चिंचवड" && hi.placeId === "PID" && en.address === "16/189, Rajeshivajinagar, Pimpri-Chinchwad" && callsForTwoLanguages === 2 && outage.address === "16/189, Rajeshivajinagar, Pimpri-Chinchwad" && typed && resolveLang("मराठी") === "mr" && resolveLang(undefined) === "hi";
    const fc = read("src/firebaseClient.js");
    return behaviour
      && ["getAddress", "searchPlaces", "getPlace"].every((n) => fns.includes(`exports.${n} = onCall(GEO_OPTIONS`)) && fns.includes("function geoGuard(request)") && fns.includes('defineSecret("MAPS_KEY")') && fns.includes('require("./addressLang")')
      && ["mintLocationServiceToken", "onDirectRequestBroadcast", "ringAck", "onBookingTaken", "sendTestRing"].every((n) => fns.includes(`exports.${n} = `))
      && fc.includes("export const geoSearchPlaces") && fc.includes("export const geoGetPlace") && fc.includes("export const geoGetAddress") && fc.includes("geoDownUntil = Date.now() + 30000")
      && app.includes("const data = await geoSearchPlaces({ input: value, lang, sessionToken: newSessionToken()") && app.includes("const place = await geoGetPlace({ placeId: p.place_id, lang, sessionToken: token })") && app.includes("if (!citiesOnly) {")
      && app.includes("async function reverseGeocodeFull(lat, lng, lang = \"\")") && (app.match(/reverseGeocodeFull\(lat, lng, lang\)/g) || []).length === 2 && app.includes("placeId ? await geoGetPlace({ placeId, lang }) : await geoGetAddress({ lat, lng, lang })");
  }],
  ["driver home: quiet 'KYC Settings' + 'WhatsApp Support' text links sit UNDER the My Wallet / duty bar (owner 2026-10-31; plain grey, no fill) -- KYC Settings opens the same screen as the menu's Settings (KYC & Vehicle), WhatsApp opens the support number", () => app.includes("onOpenKycSettings={() => setSettingsView(\"kyc\")} raiseAlert={raiseAlert}") && app.includes("onClick={() => onOpenKycSettings?.()}") && app.includes("raiseAlert?.(\"driver\", \"व्हाट्सएप सपोर्ट\", null, driver.mobile)") && app.indexOf("Quiet shortcuts under the wallet / duty bar") > app.indexOf("My Wallet + Driver Duty switch") && app.indexOf("Quiet shortcuts under the wallet / duty bar") < app.indexOf("// ---- लोड घंटी बटन")],
  ["ring screen (owner 2026-10-31, NO native build): customer name, fare and est. km ride inside the push's weight text (functions/ringText.js), the weight line stays last, the old text is unchanged when there is nothing extra, and the native ring files are untouched", async () => { const { createRequire } = await import("node:module"); const { ringWeightText } = createRequire(import.meta.url)(join(root, "functions/ringText.js")); const full = ringWeightText({ customerName: "Rahul", fare: 1250.4, distance: 14.26, weight: 6000 }); const fn = read("functions/index.js"); const act = read("android/app/src/main/java/com/apnatransport/app/RingingBookingActivity.java"); return full === "ग्राहक: Rahul\nभाड़ा: ₹1250\nअनुमानित दूरी: 14.3 किमी\nवज़न: 6000" && ringWeightText({ weight: 6000 }) === "6000" && ringWeightText({}) === "-" && fn.includes("weight: ringWeightText(load),") && !act.includes("customerName"); }],
  ["ring screen header (owner 2026-10-31): a bell sits in front of 'नई डायरेक्ट बुकिंग रिक्वेस्ट!' -- native layout, PREPARED ONLY, ships with the next native build (none was triggered for it)", () => read("android/app/src/main/res/layout/activity_ringing_booking.xml").includes('android:text="🔔 नई डायरेक्ट बुकिंग रिक्वेस्ट!"')],
  ["ring order (owner 2026-10-31, NO native build): the push (with customer/fare/km) goes out BEFORE alertedDriverMobiles is written, so the phone's live watcher cannot ring first with the old 3-field screen; ringTargets is written first for onBookingTaken / escalation, which read both lists; the late write is in a finally so the backup ring is never lost", () => { const fn = read("functions/index.js"); const iEarly = fn.indexOf("update({ ringTargets: alerted"); const iSend = fn.indexOf("await Promise.all(sends.map((send) => send()));\n      // Let the push"); const iLate = fn.indexOf("update({ alertedDriverMobiles: alerted })"); return iEarly > 0 && iSend > iEarly && iLate > iSend && fn.includes("WATCHER_BACKUP_DELAY_MS = 3000") && fn.includes("} finally {") && fn.includes("...(after.ringTargets || before.ringTargets || [])") && fn.includes("...(load.ringTargets || [])"); }],
  ["booking (owner 2026-10-31): Pickup + Drop CHOSEN by hand (suggestion / current location / map tap) hide the same way a recent trip does -- only km + Enter Weight (+ 'Change pickup / drop') stay; merely typed text never hides them", () => app.includes("const dropAlreadyChosen = dropFromPlaceRef.current && !!dropCoords;") && app.includes("setFromTrip(dropAlreadyChosen);") && app.includes("setFromTrip(pickupFromPlaceRef.current && !!pickupCoords); goAfterPlaces();") && app.includes("const tripHidden = fromTrip && placesReady;") && !app.includes("export { CustomerBooking")],
  ["booking screen (owner 2026-10-31): an evident 3 px navy line + shadow separates the map from the form; the wrapper is a plain div (no position / z-index) so the map's own stacking context and the header layering stay untouched", () => app.includes("data-map-divider style={{ borderBottom: `3px solid ${C.navy}`") && !/data-map-divider[^\n]*(zIndex|position:)/.test(app) && !app.includes("export { CustomerBooking")],
  ["booking (owner 2026-10-31): Pickup/Drop ease out (SmoothCollapse, not a pop); 'Change pickup / drop' sits UNDER the 'Enter weight first' note (and the date/time hint / 'Tap a vehicle' line), centred, dull grey (#94A3B8)", () => app.includes("function SmoothCollapse({ show, children, duration = 320 })") && app.includes("<SmoothCollapse show={showDrop && !weightTyped && !tripHidden}>") && app.includes("const changePlacesLink = tripHidden && !chosen ? (") && app.includes('style={{ color: "#94A3B8" }}>\n        {lang === "en" ? "Change pickup / drop"') && (app.match(/\{changePlacesLink\}/g) || []).length === 2 && app.includes("&& changePlacesLink}") && !app.includes('className="self-start text-xs font-extrabold underline -mt-1"') && app.indexOf("const chosen = !!selectedEntry;") < app.indexOf("const changePlacesLink")],
  ["clean-up pass (owner 2026-10-31): index.css carries the --sarthi-css marker and index.html reloads ONCE (sessionStorage guard) if it is missing, so a failed stylesheet never leaves an unstyled app or loops; the shared polish rules touch no box size / position / layer", () => { const css = read("src/index.css"); const html = read("index.html"); return css.includes(":root { --sarthi-css: 1; }") && html.includes("getPropertyValue('--sarthi-css')") && html.includes("sarthi_css_retry") && css.includes("h1, h2, h3, h4 { text-wrap: balance;") && css.includes("::selection") && css.includes("body { overscroll-behavior-y: none; }") && !/Clean-up pass[\s\S]*(position:|z-index|padding|margin|width:|height:)/.test(css.slice(css.indexOf("Clean-up pass"))); }],
  ["clean fonts (owner 2026-10-31): html lang follows the app language; Hindi/Marathi get no heading letter-spacing and weight 800 drawn as 700 (still bold); Inter loads its italics; underlines keep their underline with a cleaner offset; bold/italic/underline are never removed", () => { const css = read("src/index.css"); const html = read("index.html"); return app.includes("document.documentElement.lang = lang;") && html.includes("family=Inter:ital,wght@0,400..900;1,400..900") && css.includes(":lang(hi) :is(h1, h2, h3, h4), :lang(mr) :is(h1, h2, h3, h4) { letter-spacing: 0; }") && css.includes(":lang(hi) :is(.font-black, .font-extrabold), :lang(mr) :is(.font-black, .font-extrabold) { font-weight: 700; }") && css.includes("text-underline-offset: 0.18em") && !/text-decoration:\s*none|font-style:\s*normal\s*!important|font-weight:\s*(400|normal)\s*!important/.test(css); }],
  ["KYC screen (owner 2026-10-31): the very first note line says documents are needed to get loads", () => app.includes("Without these documents you won't be able to get loads.") && app.indexOf("Without these documents you won't be able to get loads.") < app.indexOf("Everything below is mandatory")],
  ["driver home (owner 2026-10-31): wallet + duty bar + KYC/WhatsApp links are pinned to the BOTTOM of the idle screen (column root + mt-auto), links are text-sm, and the idle pill reads 'Loads available in Pune Hub' (not 'All India')", () => app.includes('<div className="px-5 pt-5 pb-5 flex flex-col flex-1">') && app.includes('<div className="relative z-20 shrink-0 flex items-center justify-between gap-2 px-5 pt-3 pb-1"') && app.indexOf('<div className="relative z-20 shrink-0 flex items-center justify-between gap-2 px-5 pt-3 pb-1"') < app.indexOf('<div className={`flex-1 overflow-y-auto relative${realHamburgerVisible') && app.includes('<div className="flex-1 flex flex-col items-center justify-center text-center py-4 px-4">') && !app.includes('"Settings (KYC & Vehicle)"') && app.includes('<div className="mt-auto pt-5">') && app.indexOf('<div className="mt-auto pt-5">') > app.indexOf("<LoadBellButton driver={driver} lang={lang} />") && app.includes("gap-x-1.5 text-sm font-semibold") && app.includes('"Loads available in Pune Hub"') && app.includes('"पुणे हब में लोड उपलब्ध"') && !app.includes("All India booking available")],
  ["OTP-screen map (customer + driver, mode toPickup) frames a 500 m radius around the driver by default (owner 2026-10-29)", () => app.includes("const OTP_MAP_RADIUS_KM = 0.5;") && app.includes("const radiusKey = `toPickup-radius:") && app.includes("anchor.lat + dLat")],
  ["booking map frames a 1.5 km radius around the current location/pickup by default (owner 2026-10-29)", () => app.includes("const NEARBY_MAP_DEFAULT_RADIUS_KM = 1.5;") && app.includes("center.lat + dLat") && app.includes("if (userAdjustedRef.current) return; // the customer has set their own view -- leave it alone")],
  ["live tracking map has no built-in zoom control either (owner 2026-10-29)", () => app.includes('fullscreenControl: false, zoomControl: false, gestureHandling: "greedy", disableDefaultUI: true,') && !app.includes('zoomControl: true')],
  ["entry + refresh animation: icon-rise loader that holds ~2.4 s with a yellow bar that fills over that time; the Refresh button turns once, dims the app and reloads into a short loader variant (owner 2026-10-29)", () => { const html = readFileSync(join(root, "index.html"), "utf8"); return html.includes("al-tile-wrap") && html.includes("al-bar") && html.includes("#app-loader.is-refresh") && html.includes("sessionStorage.getItem('sarthi_refresh')") && app.includes('window.sessionStorage.setItem("sarthi_refresh", "1")') && app.includes('"refresh-turn"') && app.includes("setTimeout(() => window.location.reload(), 600)") && !html.includes("al-truck"); }],
  ["motion pass is wired in (owner 2026-10-29 'implement all'): rising vehicle cards, sending spinner, map-truck fade-in + pickup pulse, radar + request-sent tick on the notifying screen, rising driver panel, springy duty switch, dropping load cards with bell wiggle, fare count-up on the trip summary, sliding sign-up steps with progress dots, success burst, photo tiles zoom, loading skeletons, empty states -- all switched off under reduced motion", () => { const css = readFileSync(join(root, "src", "index.css"), "utf8"); return ["anim-rise", "anim-drop-in", "ring-pulse-yellow", "bell-wiggle", "pop-in", "draw-tick", "chip-fade-out", "radar-ring", "map-halo", "skeleton", "bob", "road-drift", "slide-in-right", "photo-zoom-in", "line-fill", "sb-overlay", "sb-conf"].every((k) => css.includes("." + k)) && /prefers-reduced-motion: reduce[\s\S]{0,1800}\.anim-rise[\s\S]{0,1500}\.sb-conf i/.test(css) && app.includes("function SuccessBurst(") && app.includes("function SkeletonRows(") && app.includes("function EmptyState(") && app.includes("function StepDots(") && app.includes("useCountUpFromZero(totalAmount, 1600, 350)") && app.includes('className="anim-rise" style={{ animationDelay:') && app.includes("<OverlayViewF position={center}") && app.includes("setSignupBurst(true)") && app.includes("useBookingsLoaded()") && app.includes('"radar-ring"'); }],
  ["animations play BY DEFAULT even when the phone says Remove animations (html.force-motion set unless localStorage.sarthi_forceMotion === '0'); /motion-check.html lets a phone opt out; every reduced-motion rule honours the default", () => { const css = readFileSync(join(root, "src", "index.css"), "utf8"); const html = readFileSync(join(root, "index.html"), "utf8"); const check = readFileSync(join(root, "public", "motion-check.html"), "utf8"); const blk = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce) {\n  :root:not(.force-motion)")); return css.includes(":root:not(.force-motion) .anim-rise") && !/\n  \.(anim-rise|live-pulse|pop-in)/.test(blk.slice(0, blk.indexOf("\n}\n"))) && html.includes("getItem('sarthi_forceMotion')!=='0'") && check.includes("getItem('sarthi_forceMotion')!=='0'") && check.includes("al-tile-wrap") && !/prefers-reduced-motion:reduce\)\{\s+#app-loader/.test(html); }],
  ["Cloud Functions run on Node 22 (Node 20 is decommissioned 2026-10-30): firebase.json runtime and functions/package.json engines agree", () => JSON.parse(readFileSync(join(root, "firebase.json"), "utf8")).functions[0].runtime === "nodejs22" && JSON.parse(readFileSync(join(root, "functions", "package.json"), "utf8")).engines.node === "22"],
  ["fields never poke out of their box on narrow phones (inputs may shrink); the Book tap shows a visible 700 ms 'Sending request' beat; radar rings are big enough to see; the trip-summary fare counts up large (owner 2026-10-29 test feedback)", () => { const css = readFileSync(join(root, "src", "index.css"), "utf8"); return /input, select, textarea \{ min-width: 0; max-width: 100%; \}/.test(css) && count(app, "}, 700);") >= 1 && app.includes('style={{ width: 112, height: 112 }}') && app.includes("useCountUpFromZero(totalAmount, 1600, 350)"); }],
  ["the Weight box stays visible above the keyboard and the sticky Book Now bar when it gets the cursor (owner 2026-10-29): focus without jumping, then re-centre while the keyboard slides up and on every visualViewport resize", () => { const a = app.indexOf("function CustomerBooking("), b = app.indexOf("function CustomerAdvanceBooking("); const cb = app.slice(a, b); return cb.includes("const keepWeightVisible = () => {") && cb.includes("weightInputRef.current?.focus({ preventScroll: true });") && cb.includes('vv?.addEventListener("resize", onResize);') && cb.includes("scrollMarginBottom: 130") && cb.includes("keepWeightVisible(); }} />"); }],
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
