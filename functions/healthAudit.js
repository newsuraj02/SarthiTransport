// MORNING / EVENING SCAN -- the pure, testable half (no Firebase imports) (owner 2026-11-03: "keep track of everything via scan, inform Admin
// even the slightest of change"). functions/index.js loads the live data, calls these, and writes the result to systemHealth/* where the
// Admin dashboard shows it. Everything here takes plain objects, so verifyInvariants.mjs runs it with made-up data -- including the exact
// failure that went unnoticed before: a driver on a trip still being listed as available.
//
// SAFE TO SHOW: findings never contain a name or phone number (systemHealth is publicly readable) -- only counts, booking ids and short ids.

const H = 3600e3;

// ---- the availability rule, MIRRORING src/App.jsx (findDriverLoadConflict with no candidate time) -----------------------------------
// scripts/verifyInvariants.mjs runs both on hundreds of random scenarios and fails if they ever disagree, so these cannot drift apart.
function parseScheduledFor(scheduledFor) {
  const [datePart, timePart] = scheduledFor.split(" ");
  return new Date(`${datePart}T${timePart}:00`);
}
function notificationLockHours(vehicleCapacityKg) {
  if (vehicleCapacityKg > 16000) return 4;
  if (vehicleCapacityKg > 8000) return 3;
  if (vehicleCapacityKg >= 3000) return 2;
  return 1;
}
function estimatedTripHours(b) {
  const km = Number(b && b.distance) || 0;
  const oneWay = Math.max(2, Math.ceil(km / 30) + 1);
  return b && b.returnTrip ? oneWay * 2 : oneWay;
}
function isBookingRunning(b, now) {
  if (!b.scheduledFor) return true;
  if (b.loadingStartedAt) return true;
  const t = parseScheduledFor(b.scheduledFor).getTime();
  return Number.isFinite(t) && t <= now;
}
const ms = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : typeof v === "number" ? v : null);
function getBookingWindow(b, now) {
  let start;
  if (b.scheduledFor) start = parseScheduledFor(b.scheduledFor);
  else if (ms(b.acceptedAt) != null) start = new Date(ms(b.acceptedAt));
  else if (ms(b.createdAt) != null) start = new Date(ms(b.createdAt));
  else start = new Date(now);
  if (!Number.isFinite(start.getTime())) return null;
  const hours = Number(b.hours) > 0 ? Number(b.hours) : estimatedTripHours(b);
  let end = start.getTime() + hours * H;
  if (isBookingRunning(b, now) && end < now + H) end = now + H;
  return { start, end: new Date(end) };
}
function isDriverRecord(rec, driver) {
  if (!rec || !driver) return false;
  if (rec.driverMobile && driver.mobile) return rec.driverMobile === driver.mobile;
  return !!rec.driverName && rec.driverName === driver.name;
}
// True when `driver` may NOT be shown / given a new CURRENT (immediate) load right now.
function driverIsBusyForCurrentLoad(driver, bookings, capacityKg, now) {
  const lockHours = notificationLockHours(capacityKg || 0);
  for (const existing of bookings.filter((b) => b.status === "Ongoing" && isDriverRecord(b, driver))) {
    const win = getBookingWindow(existing, now);
    if (!win) continue;
    const lockStart = new Date(win.start.getTime() - lockHours * H);
    if (new Date(now) < win.end && new Date(now) >= lockStart) return true;
  }
  return false;
}

// ---- live-data audit ---------------------------------------------------------------------------------------------------------------
// Each finding: { id, sev: "critical"|"high"|"info", area, title, detail }. `id` is stable so the Change Log entry for a problem that
// persists is re-opened, not duplicated.
function auditLiveData({ drivers = [], bookings = [], settings = {}, adminRouteFares = [], otpIds = [], withdrawals = [], rechargeRequests = [], unmatched = [], vehicleTypes = [], now = Date.now(), busyRule = driverIsBusyForCurrentLoad }) {
  const f = [];
  const push = (id, sev, area, title, detail) => f.push({ id, sev, area, title, detail: String(detail || "").slice(0, 400) });
  const ids = (arr, n = 8) => arr.slice(0, n).join(", ") + (arr.length > n ? ` (+${arr.length - n} more)` : "");
  const capOf = (d) => Number(d.vehicleSpec && d.vehicleSpec.capacityKg) || (vehicleTypes.find((v) => v.key === (d.vehicleSpec && d.vehicleSpec.type)) || {}).capacityKg || 0;
  const running = bookings.filter((b) => b.status === "Ongoing" && isBookingRunning(b, now));

  // 1. THE CHECK THAT WOULD HAVE CAUGHT 2026-11-03: every driver on a running trip must count as busy.
  const onTrip = drivers.filter((d) => running.some((b) => isDriverRecord(b, d)));
  const wronglyFree = onTrip.filter((d) => !busyRule(d, bookings, capOf(d), now));
  if (wronglyFree.length) push("availability-rule-broken", "critical", "Availability", `${wronglyFree.length} driver(s) on a running trip would still be offered new loads`, `The "driver is busy" rule is not working. Driver ids: ${ids(wronglyFree.map((d) => String(d.id || d.mobile || "").slice(-4)))}`);

  // 2. Double-booked: one driver on two running trips at once (the visible consequence of the rule failing).
  const per = {};
  running.forEach((b) => { const k = b.driverMobile || b.driverName; if (k) (per[k] = per[k] || []).push(b.id); });
  const dbl = Object.entries(per).filter(([, v]) => v.length > 1);
  if (dbl.length) push("driver-double-booked", "critical", "Availability", `${dbl.length} driver(s) are on more than one trip at once`, `Bookings: ${ids(dbl.flatMap(([, v]) => v))}`);

  // 3. Trips that never moved on.
  const stuckTrips = running.filter((b) => { const t = ms(b.acceptedAt) ?? ms(b.createdAt); return t != null && !b.loadingStartedAt && !b.scheduledFor && now - t > 24 * H; });
  if (stuckTrips.length) push("trip-stuck-not-started", "high", "Trips", `${stuckTrips.length} accepted trip(s) not started for over 24 h`, `They keep their driver busy until closed. Bookings: ${ids(stuckTrips.map((b) => b.id))}`);
  const longTrips = running.filter((b) => { const t = ms(b.loadingStartedAt); return t != null && now - t > 72 * H; });
  if (longTrips.length) push("trip-running-over-72h", "high", "Trips", `${longTrips.length} trip(s) running for over 72 h`, `Bookings: ${ids(longTrips.map((b) => b.id))}`);
  const searching = bookings.filter((b) => b.status === "AwaitingDriver" && !b.scheduledFor && ms(b.createdAt) != null && now - ms(b.createdAt) > 30 * 60e3);
  if (searching.length) push("search-unanswered", "info", "Trips", `${searching.length} booking(s) waiting for a driver for over 30 min`, `Bookings: ${ids(searching.map((b) => b.id))}`);

  // 4. The server-made OTP (issuePickupOtp) must exist for every accepted, not-yet-started trip.
  const otp = new Set(otpIds);
  const noOtp = running.filter((b) => !b.loadingStartedAt && !otp.has(b.id) && (ms(b.acceptedAt) ?? ms(b.createdAt)) != null && now - (ms(b.acceptedAt) ?? ms(b.createdAt)) > 2 * 60e3 && !b.scheduledFor);
  if (noOtp.length) push("otp-missing", "critical", "OTP", `${noOtp.length} accepted trip(s) have NO pickup OTP`, `The issuePickupOtp function did not run for: ${ids(noOtp.map((b) => b.id))}`);

  // 5. Integrity.
  const known = new Set(drivers.map((d) => d.mobile || d.id));
  const orphan = running.filter((b) => b.driverMobile && !known.has(b.driverMobile));
  if (orphan.length) push("trip-driver-missing", "high", "Integrity", `${orphan.length} running trip(s) point to a driver that no longer exists`, `Bookings: ${ids(orphan.map((b) => b.id))}`);
  const neg = drivers.filter((d) => Number(d.wallet) < 0 || Number(d.bonus) < 0 || Number(d.heldCredit) < 0);
  if (neg.length) push("negative-balance", "high", "Money", `${neg.length} driver(s) have a negative wallet / bonus / held credit`, `Driver ids: ${ids(neg.map((d) => String(d.id || d.mobile || "").slice(-4)))}`);

  // 6. Settings that drive every fare.
  const num = (k) => (settings[k] == null ? null : Number(settings[k]));
  const range = (k, lo, hi) => { const v = num(k); if (v != null && !(v >= lo && v <= hi)) push(`setting-${k}`, "high", "Settings", `Setting ${k} = ${settings[k]} is outside ${lo}-${hi}`, "Every fare quote uses this value."); };
  range("dieselPricePerLitre", 60, 200); range("returnPct", 0, 50); range("commissionPct", 0, 50); range("bonusPct", 0, 50); range("minWallet", 0, 100000);

  // 7. Saved Admin rates that cannot price anything.
  const badRates = adminRouteFares.filter((r) => !(Number(r.totalFare) > 0) || r.tierMaxKg == null || !(Number(r.estimatedKm) > 0));
  if (badRates.length) push("saved-rate-invalid", "high", "Fares", `${badRates.length} saved Admin rate(s) are unusable (no fare / vehicle / distance)`, `Rate ids: ${ids(badRates.map((r) => String(r.id || "?").slice(0, 40)))}`);

  // 8. Things waiting for a human.
  const old = (rows, h) => rows.filter((r) => ms(r.createdAt) != null && now - ms(r.createdAt) > h * H);
  const w = old(withdrawals.filter((x) => x.status === "Pending"), 24); if (w.length) push("withdrawals-waiting", "info", "Money", `${w.length} withdrawal request(s) waiting over 24 h`, "");
  const rc = old(rechargeRequests.filter((x) => x.status === "Pending"), 24); if (rc.length) push("recharges-waiting", "info", "Money", `${rc.length} wallet recharge request(s) waiting over 24 h`, "");
  const um = old(unmatched.filter((x) => x.status === "Pending" || !x.status), 6); if (um.length) push("unmatched-waiting", "info", "Requests", `${um.length} customer request(s) with no matching vehicle waiting over 6 h`, "");
  const kyc = old(drivers.filter((d) => d.kyc === "Pending" && d.vehicleSpec), 48); if (kyc.length) push("kyc-waiting", "info", "KYC", `${kyc.length} driver KYC submission(s) waiting over 48 h`, "");
  return f;
}

// ---- change detection --------------------------------------------------------------------------------------------------------------
function labelOf(key) {
  const i = key.indexOf(":"); const kind = key.slice(0, i); const name = key.slice(i + 1);
  if (kind === "app") return `App rule ${name}`;
  if (kind === "fns") return `Server rule ${name}`;
  if (kind === "fn") return `Cloud Function ${name}`;
  if (kind === "file") return `File ${name}`;
  if (kind === "code") { const [path, unit] = name.split("#"); return unit ? `Code ${path} > ${unit}` : `Code ${path}`; }
  return key;
}
// What differs between two criteria maps ({ key: hash }). The full code inventory (`code:...`) also contains every named rule / function /
// file, so a change would be listed twice: the plain-English named entry wins and the duplicate `code:` entry is dropped.
function diffCriteria(prev, cur) {
  const p = prev || {}, c = cur || {};
  const keys = (pred) => Object.keys(pred === "added" ? c : pred === "removed" ? p : c).filter((k) => (pred === "added" ? !(k in p) : pred === "removed" ? !(k in c) : k in p && p[k] !== c[k]));
  const out = { added: keys("added"), removed: keys("removed"), changed: keys("changed") };
  const named = new Set([...out.added, ...out.removed, ...out.changed].filter((k) => !k.startsWith("code:")).map((k) => k.slice(k.indexOf(":") + 1)));
  const dup = (k) => { if (!k.startsWith("code:")) return false; const rest = k.slice(5); const [path, unit] = rest.split("#"); return unit ? named.has(unit) : named.has(path); };
  for (const g of Object.keys(out)) out[g] = out[g].filter((k) => !dup(k)).map(labelOf);
  return out;
}
// Settings values that moved since the last scan, in plain words.
function diffSettings(prev, cur) {
  const out = []; const p = prev || {}; const c = cur || {};
  for (const k of ["dieselPricePerLitre", "returnPct", "commissionPct", "bonusPct", "minWallet", "latestVersionCode", "ratesDieselBase"]) {
    if (p[k] !== c[k] && !(p[k] == null && c[k] == null)) out.push(`Setting ${k}: ${p[k] == null ? "not set" : p[k]} -> ${c[k] == null ? "not set" : c[k]}`);
  }
  return out;
}

// ---- deployment drift ("the app got back to its older self") -----------------------------------------------------------------------
// hosting = live /build.json (or null), functions = functions/build.json stamp (or null), head = latest commit sha on the branch (or null).
function auditDeployment({ hosting, functions, head, now = Date.now() }) {
  const f = []; const push = (id, sev, title, detail) => f.push({ id, sev, area: "Deployment", title, detail });
  const same = (a, b) => a && b && (a.startsWith(b) || b.startsWith(a));
  if (!hosting) push("deploy-hosting-unstamped", "high", "The live app has no build stamp", "Live /build.json is missing: the live app was built before stamps existed, or from a different checkout. Rebuild and redeploy hosting.");
  else {
    if (hosting.dirty) push("deploy-hosting-dirty", "high", `The live app was built from UNCOMMITTED code (${hosting.commit})`, "Edits on the build machine that are not in the repository are live. Commit them or rebuild from a clean checkout.");
    if (head && hosting.commitFull && !same(hosting.commitFull, head)) push("deploy-hosting-behind", "high", `The live app (${hosting.commit}) is not the latest commit (${head.slice(0, 7)})`, "Newer fixes are in the repository but not deployed. Run: git pull, npm run build, firebase deploy --only hosting.");
  }
  if (!functions) push("deploy-functions-unstamped", "info", "Cloud Functions have no build stamp", "Deploy functions once with the new firebase.json predeploy step to start tracking them.");
  else {
    if (functions.dirty) push("deploy-functions-dirty", "high", `Cloud Functions were deployed from UNCOMMITTED code (${functions.commit})`, "");
    if (head && functions.commitFull && !same(functions.commitFull, head)) push("deploy-functions-behind", "info", `Cloud Functions (${functions.commit}) are not at the latest commit (${head.slice(0, 7)})`, "Only matters if functions/ changed since then.");
  }
  return f;
}

function summarize(findings, changes, totalChanges = changes.length) {
  const crit = findings.filter((x) => x.sev === "critical").length, high = findings.filter((x) => x.sev === "high").length, info = findings.filter((x) => x.sev === "info").length;
  const status = crit || high ? "fail" : "pass";
  return { status, crit, high, info, changes: totalChanges, text: status === "pass" ? `All checks passed${info ? ` (${info} note${info > 1 ? "s" : ""})` : ""}${totalChanges ? ` - ${totalChanges} change(s) detected` : ""}.` : `${crit} critical, ${high} high${info ? `, ${info} note(s)` : ""}${totalChanges ? `; ${totalChanges} change(s) detected` : ""}.` };
}

module.exports = { isDriverRecord, auditLiveData, auditDeployment, diffCriteria, diffSettings, summarize, driverIsBusyForCurrentLoad, isBookingRunning, getBookingWindow, estimatedTripHours, notificationLockHours };
