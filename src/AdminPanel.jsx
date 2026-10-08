// Admin-only screens, split into their own module (and lazy-loaded from
// App.jsx via React.lazy) so a customer or driver never downloads any of
// this -- 16 screens, ~2,800 lines, previously bundled into the single
// shared App.jsx chunk regardless of role. Nothing here changed logic-
// wise; this is a straight move, verified with a scope analysis (espree +
// eslint-scope) that every free identifier referenced below is covered by
// one of the imports here.
import React, { useState, useEffect, useRef } from "react";
import {
  Activity, AlertTriangle, BarChart3, Bell, Calculator, Camera, CheckCircle2, ChevronLeft,
  ClipboardList, Download, Eye, EyeOff, IndianRupee, LayoutDashboard, MapPin, MapPinned,
  MessageCircle, Phone, PhoneCall, Plus, Settings2, Siren, Truck, UserCircle2, Users,
  Wallet, Weight, X, XCircle,
} from "lucide-react";
import { GoogleMap, MarkerF } from "@react-google-maps/api";
import { useGoogleMaps } from "./googleMapsContext.jsx";
import { onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";
import { adminFirebaseAuth, sendAdminNotification, resolveChangeLogEntry, sendBulkDriverWhatsApp } from "./firebaseClient";
import { createDoc, patchDoc, removeDoc, bulkUpdateDocs } from "./firestoreStore";
import {
  C, DEFAULT_EXPENSE_CATEGORIES, EN_LABELS, FARE_TIER_MAX_KG_UNCAPPED, MR_LABELS,
  NEARBY_MAP_DEFAULT_CENTER, PLAY_STORE_URL, alertTypeLabel, calculateFare,
  describeAdminRateSaveError, driverTruckIcon, driverTruckIconInactive, estimateDistanceKm,
  fetchRoadDistanceKm, findExactAdminRoute, findFareTier, fmt, formatDistanceExact, genId, geocodeAddress,
  getRouteScaleRatio, gpsStatus, greetingWord, haversineKm, installedDrivers, zoneFor,
  isFutureAdvance, isLikelyUninstalled, locationsNear,
  monoFont, normalizeRouteText, pad2, partitionDriversByInstallStatus, routeMatchRadiusKm,
  sanitizeForDocId, trialDaysLeft, usePersistedState, uploadPhoto, KycDocThumb,
  LocationField, PhotoPicker, RouteLine, SafeImage, StatTile,
} from "./App.jsx";

function AdminLiveMap({ drivers, lang = "hi" }) {
  const { isLoaded, hasKey } = useGoogleMaps();
  const [mapInstance, setMapInstance] = useState(null);
  const installed = installedDrivers(drivers);
  const located = installed.filter((d) => d.lastKnownLocation?.lat != null && d.lastKnownLocation?.lng != null);
  const neverLocated = installed.filter((d) => d.lastKnownLocation?.lat == null || d.lastKnownLocation?.lng == null);
  const online = located.filter((d) => d.online);
  const offline = located.filter((d) => !d.online);
  const center = online[0]?.lastKnownLocation || offline[0]?.lastKnownLocation || NEARBY_MAP_DEFAULT_CENTER;

  useEffect(() => {
    if (!mapInstance || !window.google?.maps || located.length === 0) return;
    const bounds = new window.google.maps.LatLngBounds();
    located.forEach((d) => bounds.extend({ lat: d.lastKnownLocation.lat, lng: d.lastKnownLocation.lng }));
    mapInstance.fitBounds(bounds, 48);
  }, [mapInstance, located.length, located.map((d) => `${d.lastKnownLocation.lat},${d.lastKnownLocation.lng}`).join("|")]);

  const staleMinutes = (d) => Math.round((Date.now() - (d.lastKnownLocation?.updatedAt || 0)) / 60000);
  const markerTitle = (d) => `${d.name || d.mobile} · ${staleMinutes(d)}${lang === "en" ? "m ago" : " मिनट पहले"}`;

  // Shared by both render branches below so the two never drift apart
  // again the way the tile/map mismatch did before. neverLocated is
  // called out separately since those drivers have no pin on this map at
  // all -- there's nothing to plot without a coordinate.
  const mapSummaryLabel =
    `${online.length} ${lang === "en" ? "online" : "ऑनलाइन"}` +
    (offline.length > 0 ? ` · ${offline.length} ${lang === "en" ? "offline" : "ऑफलाइन"}` : "") +
    (neverLocated.length > 0 ? ` · ${neverLocated.length} ${lang === "en" ? "no location yet" : "अभी तक लोकेशन नहीं"}` : "");

  if (!hasKey || !isLoaded) {
    const scale = 900;
    const toXY = (lat, lng) => ({ x: 50 + (lng - center.lng) * scale, y: 50 - (lat - center.lat) * scale });
    return (
      <div className="relative overflow-hidden rounded-lg" style={{ height: "60vh", background: "#E5E5E5" }}>
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
          {Array.from({ length: 8 }).map((_, i) => <line key={"h" + i} x1="0" y1={i * 14} x2="100" y2={i * 14} stroke="#D8D8D8" strokeWidth="0.4" />)}
          {Array.from({ length: 8 }).map((_, i) => <line key={"v" + i} x1={i * 14} y1="0" x2={i * 14} y2="100" stroke="#D8D8D8" strokeWidth="0.4" />)}
          {offline.map((d) => {
            const p = toXY(d.lastKnownLocation.lat, d.lastKnownLocation.lng);
            if (p.x < 2 || p.x > 98 || p.y < 2 || p.y > 98) return null;
            return <circle key={d.mobile || d.id} cx={p.x} cy={p.y} r="2.2" fill="#9AA3B0" stroke="#fff" strokeWidth="0.6" />;
          })}
          {online.map((d) => {
            const p = toXY(d.lastKnownLocation.lat, d.lastKnownLocation.lng);
            if (p.x < 2 || p.x > 98 || p.y < 2 || p.y > 98) return null;
            return <circle key={d.mobile || d.id} cx={p.x} cy={p.y} r="2.2" fill={C.navy} stroke="#fff" strokeWidth="0.6" />;
          })}
        </svg>
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm whitespace-nowrap" style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}>
          {mapSummaryLabel}
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-lg overflow-hidden" style={{ height: "60vh" }}>
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        onLoad={setMapInstance}
        options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false, zoomControl: true, clickableIcons: false }}
      >
        {offline.map((d) => (
          <MarkerF key={d.mobile || d.id} position={{ lat: d.lastKnownLocation.lat, lng: d.lastKnownLocation.lng }} icon={driverTruckIconInactive()} title={markerTitle(d)} />
        ))}
        {online.map((d) => (
          <MarkerF key={d.mobile || d.id} position={{ lat: d.lastKnownLocation.lat, lng: d.lastKnownLocation.lng }} icon={driverTruckIcon()} title={markerTitle(d)} />
        ))}
      </GoogleMap>
      <div className="absolute top-2 left-2 text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm whitespace-nowrap" style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}>
        {mapSummaryLabel}
      </div>
    </div>
  );
}

export function AdminLogin({ onVerified, lang, onBack }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const inputCls = "w-full rounded-lg px-3 py-3 text-sm outline-none";
  const inputStyle = { background: C.paper, border: `1px solid ${C.line}`, color: C.ink };

  // A real, persisted Firebase Auth session (not a locally-stored flag) —
  // refreshing the page or reopening the app skips straight past this form
  // if already signed in, same as Customer/Driver already do.
  useEffect(() => {
    if (!adminFirebaseAuth) { setChecking(false); return; }
    const unsub = onAuthStateChanged(adminFirebaseAuth, (user) => {
      setChecking(false);
      // false here (a silently-restored session, not a password just typed
      // THIS visit) is what makes AdminPinLock actually show on a fresh
      // app open — see the root component's adminUnlocked state.
      if (user) onVerified(false);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (!adminFirebaseAuth || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await signInWithEmailAndPassword(adminFirebaseAuth, email.trim(), password);
      onVerified(true);
    } catch (e) {
      console.error(e);
      // Firebase folds "no such user" and "wrong password" into the same
      // generic invalid-credential code (to avoid leaking which one it
      // was) — but operation-not-allowed / configuration errors are
      // distinct and mean something needs fixing in Firebase Console
      // rather than the typed-in credentials, so surface those separately.
      if (e?.code === "auth/operation-not-allowed") {
        setError(lang === "en" ? "Email/Password sign-in isn't enabled yet in Firebase Console (Authentication → Sign-in method)." : lang === "mr" ? "Firebase Console मध्ये Email/Password साइन-इन अजून चालू नाही (Authentication → Sign-in method)." : "Firebase Console में Email/Password साइन-इन अभी चालू नहीं है (Authentication → Sign-in method)।");
      } else if (e?.code === "auth/too-many-requests") {
        setError(lang === "en" ? "Too many attempts — please wait a while before trying again." : lang === "mr" ? "खूप जास्त प्रयत्न — कृपया थोड्या वेळाने पुन्हा प्रयत्न करा." : "बहुत ज़्यादा कोशिशें — कृपया थोड़ी देर बाद फिर कोशिश करें।");
      } else if (e?.code === "auth/network-request-failed") {
        setError(lang === "en" ? "Network error — check your internet connection." : lang === "mr" ? "नेटवर्क त्रुटी — तुमचे इंटरनेट कनेक्शन तपासा." : "नेटवर्क त्रुटि — अपना इंटरनेट कनेक्शन जांचें।");
      } else if (e?.code === "auth/invalid-email") {
        setError(lang === "en" ? "That doesn't look like a valid email address." : lang === "mr" ? "हा वैध ईमेल पत्ता वाटत नाही." : "यह एक मान्य ईमेल पता नहीं लगता।");
      } else {
        setError(
          (lang === "en" ? "Incorrect email or password" : lang === "mr" ? "ईमेल किंवा पासवर्ड चुकीचा आहे" : "ईमेल या पासवर्ड गलत है")
          + (e?.code ? ` (${e.code})` : "")
        );
      }
    }
    setSubmitting(false);
  };

  if (checking) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Checking your session..." : lang === "mr" ? "तुमचे सेशन तपासले जात आहे..." : "आपका सेशन जांचा जा रहा है..."}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-8 py-10 relative">
      {onBack && (
        <button onClick={onBack} className="absolute top-4 left-4 flex items-center gap-1 p-3 rounded-full shadow-sm" style={{ background: C.marigold, color: "#000000", border: `1.5px solid ${C.marigoldDeep}` }}>
          <ChevronLeft size={18} strokeWidth={3} />
        </button>
      )}
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: C.navy }}>
        <LayoutDashboard size={26} color="#FFFFFF" />
      </div>
      <h2 className="text-lg font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "Admin Login" : lang === "mr" ? "अ‍ॅडमिन लॉगिन" : "एडमिन लॉगिन"}</h2>
      <p className="text-xs text-center mb-6" style={{ color: C.inkSoft }}>{lang === "en" ? "Authorized personnel only" : lang === "mr" ? "फक्त अधिकृत व्यक्तींनीच पुढे जावे" : "सिर्फ अधिकृत व्यक्ति ही आगे बढ़ें"}</p>

      <div className="w-full space-y-3">
        <input className={inputCls} style={inputStyle} placeholder={lang === "en" ? "Admin email / ID" : lang === "mr" ? "अ‍ॅडमिन ईमेल / आयडी" : "एडमिन ईमेल / आईडी"} value={email}
          onChange={(e) => { setEmail(e.target.value); setError(""); }} />
        <div className="relative">
          <input type={showPassword ? "text" : "password"} className={inputCls} style={{ ...inputStyle, paddingRight: 40 }} placeholder={lang === "en" ? "Password" : lang === "mr" ? "पासवर्ड" : "पासवर्ड"} value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }} />
          <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute top-1/2 -translate-y-1/2 right-3" style={{ color: C.inkSoft }}
            aria-label={lang === "en" ? (showPassword ? "Hide password" : "Show password") : lang === "mr" ? (showPassword ? "पासवर्ड लपवा" : "पासवर्ड दाखवा") : (showPassword ? "पासवर्ड छुपाएं" : "पासवर्ड दिखाएं")}>
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {error && (
          <div className="text-[11px] text-center font-semibold" style={{ color: C.safety }}>
            {error}
          </div>
        )}
        <button onClick={submit} disabled={!email.trim() || !password.trim() || submitting} className="w-full rounded-lg py-4 font-bold text-base"
          style={{ background: email.trim() && password.trim() && !submitting ? C.marigold : "#E0E0E0", color: email.trim() && password.trim() && !submitting ? "#000000" : "#9AA3B0" }}>
          {submitting ? (lang === "en" ? "Logging in..." : lang === "mr" ? "लॉगिन होत आहे..." : "लॉगिन हो रहा है...") : (lang === "en" ? "Login" : lang === "mr" ? "लॉगिन करा" : "लॉगिन करें")}
        </button>
      </div>
    </div>
  );
}

export function AdminPinLock({ adminPin, setAdminPin, lang, onUnlocked, onUseFallback }) {
  const [step, setStep] = useState(adminPin ? "enter" : "setup"); // setup | confirm | enter
  const [value, setValue] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [error, setError] = useState("");

  const onChange = (raw) => {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    setError("");
    setValue(digits);
    if (digits.length !== 4) return;

    if (step === "setup") {
      setFirstPin(digits);
      setValue("");
      setStep("confirm");
    } else if (step === "confirm") {
      if (digits !== firstPin) {
        setError(lang === "en" ? "PINs don't match — start again." : lang === "mr" ? "PIN जुळत नाहीत — पुन्हा सुरू करा." : "PIN मेल नहीं खाते — फिर से शुरू करें।");
        setValue(""); setFirstPin(""); setStep("setup");
        return;
      }
      setAdminPin(digits);
      onUnlocked();
    } else {
      if (digits === adminPin) { onUnlocked(); return; }
      setError(lang === "en" ? "Wrong PIN." : lang === "mr" ? "चुकीचा PIN." : "गलत PIN।");
      setValue("");
    }
  };

  const heading = step === "setup"
    ? (lang === "en" ? "Set up an Admin PIN" : lang === "mr" ? "अ‍ॅडमिन PIN सेट करा" : "एडमिन PIN सेट करें")
    : step === "confirm"
    ? (lang === "en" ? "Confirm your PIN" : lang === "mr" ? "तुमचा PIN कन्फर्म करा" : "अपना PIN कन्फर्म करें")
    : (lang === "en" ? "Admin Locked" : lang === "mr" ? "अ‍ॅडमिन लॉक्ड" : "एडमिन लॉक्ड");
  const subtext = step === "setup"
    ? (lang === "en" ? "Choose a 4-digit PIN to quickly unlock the Admin app next time — this stays on this device only." : lang === "mr" ? "पुढच्या वेळी अ‍ॅडमिन अ‍ॅप पटकन अनलॉक करण्यासाठी 4-अंकी PIN निवडा — हे फक्त या डिव्हाइसवर राहील." : "अगली बार एडमिन ऐप जल्दी अनलॉक करने के लिए 4 अंकों का PIN चुनें — यह सिर्फ इस डिवाइस पर रहेगा।")
    : step === "confirm"
    ? (lang === "en" ? "Enter the same PIN again." : lang === "mr" ? "तोच PIN पुन्हा टाका." : "वही PIN फिर से डालें।")
    : (lang === "en" ? "Enter your PIN to continue." : lang === "mr" ? "पुढे जाण्यासाठी तुमचा PIN टाका." : "जारी रखने के लिए अपना PIN डालें।");

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 py-10 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: C.navy }}>
        <LayoutDashboard size={26} color="#FFFFFF" />
      </div>
      <h2 className="text-lg font-bold mb-1" style={{ color: C.ink }}>{heading}</h2>
      <p className="text-xs mb-6" style={{ color: C.inkSoft }}>{subtext}</p>

      <div className="w-full space-y-3">
        <input key={step} type="password" inputMode="numeric" autoFocus value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg py-4 text-center text-2xl font-black outline-none"
          style={{ background: C.bg, border: `1.5px solid ${C.line}`, color: C.ink, letterSpacing: 10, fontFamily: monoFont }}
          placeholder="••••" />
        {error && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{error}</div>}
        {step === "enter" && (
          <button onClick={onUseFallback} className="w-full rounded-lg py-4 font-bold text-base" style={{ background: C.paper, border: `1.5px solid ${C.line}`, color: C.inkSoft }}>
            {lang === "en" ? "Forgot PIN? Use password instead" : lang === "mr" ? "PIN विसरलात? त्याऐवजी पासवर्ड वापरा" : "PIN भूल गए? इसके बजाय पासवर्ड इस्तेमाल करें"}
          </button>
        )}
      </div>
    </div>
  );
}

function AdminFleet({ drivers, customers, bookings, tripLog, minWallet, lang, onNavigate, onLogout, toggleBlacklist, updateDriverKyc, updateDriverVehicleSpec, vehicleTypes, routeFares, adminRouteFares, adminRouteFaresError, fareTiers, returnPct, setReturnPct, bugs, systemHealth }) {
  // Takes a raw Firestore Timestamp (not a whole doc) so each caller can
  // pick the field that actually answers "did this happen today" for that
  // tile -- createdAt for a signup/booking, but e.g. cancelledAt (not
  // createdAt) for a cancellation, since a booking placed yesterday and
  // cancelled today is "cancelled today", not "cancelled yesterday".
  const isToday = (ts) => {
    const d = ts?.toDate ? ts.toDate() : null;
    if (!d) return false;
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  };
  // "Booked today" previously counted every Ongoing/Completed trip ever
  // logged (no date filter) despite the label — scope it to today like the
  // other trip-based tiles below.
  const bookedTodayList = tripLog.filter((t) => (t.status === "Ongoing" || t.status === "Completed") && isToday(t.createdAt));
  const readyOnlineDrivers = drivers.filter((d) => d.online && d.kyc === "Approved" && !d.blacklisted);
  // Single partition, used for every installed/uninstalled/blacklisted
  // count on this dashboard (see partitionDriversByInstallStatus) -- these
  // three groups are guaranteed to sum to drivers.length by construction,
  // with a loud console.error if that's ever somehow not true. Nothing
  // below should re-derive "uninstalled"/"installed" with its own
  // separate filter again -- that duplication is exactly what caused the
  // Total Drivers/tabs/Live Map/uninstalled-tile numbers to disagree
  // before.
  const { installed: installedDriversList, uninstalled: uninstalledDrivers, blacklisted: blacklistedDrivers } = partitionDriversByInstallStatus(drivers);
  // Blacklisted drivers are folded into the same "Uninstalled" KPI/page as
  // likely-uninstalled ones -- with AdminDriverList (and its search) now
  // strictly installed-only, this tile is the only place left to even see
  // a blacklisted driver again, let alone Unblock them, so it can't be
  // left out of that list.
  const inactiveDrivers = [...uninstalledDrivers, ...blacklistedDrivers];
  // Matches AdminLiveMap's own "located" count exactly (installed,
  // non-blacklisted, has a lastKnownLocation) -- this tile's number and
  // what the map shows after tapping it must never diverge again.
  const liveMapLocatedCount = installedDriversList.filter((d) => d.lastKnownLocation?.lat != null && d.lastKnownLocation?.lng != null).length;
  // Everyone else approved-but-not-online, split by isLikelyUninstalled
  // (see its own comment) so admin can tell "toggled off, still around" from
  // "gone quiet long enough to probably not have the app anymore" instead of
  // one undifferentiated "not online" bucket.
  const notReadyApprovedDrivers = drivers.filter((d) => !d.online && d.kyc === "Approved" && !d.blacklisted);
  const offDutyDrivers = notReadyApprovedDrivers.filter((d) => !isLikelyUninstalled(d));
  const lowWalletDrivers = drivers.filter((d) => d.online && !d.blacklisted && d.wallet < minWallet);
  // New customer signups today, and drivers still inside their 30-day free
  // trial — both derived live from createdAt, same source of truth as
  // everywhere else trial/signup timing is used in the app.
  const newCustomersToday = (customers || []).filter((c) => isToday(c.createdAt));
  // Today's new driver signups. "New Registrations" is deliberately just
  // a today's-signup-volume counter, same createdAt-based approach as
  // newCustomersToday -- actually
  // reviewing/approving those signups now happens entirely in the
  // Drivers tab (see AdminDriverList), not through this tile.
  const newDriversToday = drivers.filter((d) => isToday(d.createdAt));

  const cancelledTodayList = (bookings || []).filter((b) => b.status === "Cancelled" && isToday(b.cancelledAt));
  // Any not-yet-finished booking scheduled for a future date, regardless of
  // whether it's still awaiting bids or already has a driver assigned.
  const advanceBookingsList = (bookings || []).filter((b) => isFutureAdvance(b.scheduledFor) && b.status !== "Cancelled" && b.status !== "Completed");

  // Tapping one of the "drill-down" tiles opens a dedicated full page (with
  // its own Back button) showing the live record list behind that count —
  // a separate screen, not an inline panel on the dashboard itself.
  const [detailView, setDetailView] = useState(null);

  // KYC approval queue for "New Registrations" -> Driver (see
  // detailView === "newRegistrations" below) -- only drivers who've
  // actually submitted and are sitting in Pending, waiting on a decision.
  // Deliberately NOT drivers who haven't submitted at all yet -- there's
  // nothing to approve/reject for those, and they'd just be noise here;
  // the WhatsApp reminder for them still lives in the Drivers tab's
  // Incomplete section. Not just today's Pending signups either, since a
  // driver who signed up yesterday and is still Pending needs this
  // exactly as much as one who signed up an hour ago. Approve/Reject/Edit
  // live only here now; the Drivers tab (AdminDriverList) keeps Edit alone.
  const approvalQueue = drivers.filter((d) => d.vehicleSpec && d.kyc === "Pending");
  // A driver who signed up but hasn't submitted the KYC form yet has
  // nothing to approve/reject -- but hiding them completely made a fresh
  // signup look like it vanished/got silently auto-approved (real confusion
  // this caused once). Kept visible for a few days so Admin has a real
  // window to actively follow up and ask them to finish the form, not just
  // a single day -- but still bounded, not every incomplete signup ever, so
  // this doesn't turn back into the unbounded "not submitted" noise
  // approvalQueue above deliberately excludes -- a signup from weeks ago
  // still belongs only in the Drivers tab's Incomplete section/WhatsApp
  // reminder, not here.
  const NOT_SUBMITTED_VISIBLE_DAYS = 3;
  const isWithinLastDays = (ts, days) => {
    const d = ts?.toDate ? ts.toDate() : null;
    return !!d && Date.now() - d.getTime() <= days * 24 * 60 * 60 * 1000;
  };
  const notSubmittedRecentList = drivers.filter((d) => !d.vehicleSpec && isWithinLastDays(d.createdAt, NOT_SUBMITTED_VISIBLE_DAYS));
  const driverRegistrations = [...approvalQueue, ...notSubmittedRecentList];
  const [approvalExpandedId, setApprovalExpandedId] = useState(null);
  const [approvalEditingId, setApprovalEditingId] = useState(null);
  const [approvalEditDraft, setApprovalEditDraft] = useState(null);
  const [approvalEditError, setApprovalEditError] = useState("");
  const startApprovalEdit = (d) => {
    setApprovalEditingId(d.id);
    setApprovalEditDraft({
      type: d.vehicleSpec?.type || "",
      vehicleNumber: d.vehicleSpec?.vehicleNumber || "",
      capacityKg: d.vehicleSpec?.capacityKg != null ? String(d.vehicleSpec.capacityKg) : "",
      length: d.vehicleSpec?.length || "",
      width: d.vehicleSpec?.width || "",
      height: d.vehicleSpec?.height || "",
    });
    setApprovalEditError("");
  };
  const cancelApprovalEdit = () => { setApprovalEditingId(null); setApprovalEditDraft(null); setApprovalEditError(""); };
  const saveApprovalEdit = async (d) => {
    const capacityKg = Number(approvalEditDraft.capacityKg);
    if (!approvalEditDraft.vehicleNumber.trim() || !capacityKg || capacityKg <= 0) {
      setApprovalEditError(lang === "en" ? "Vehicle number and a valid capacity are required." : lang === "mr" ? "गाडी नंबर आणि योग्य क्षमता आवश्यक आहे." : "गाड़ी नंबर और सही क्षमता आवश्यक है।");
      return;
    }
    await updateDriverVehicleSpec(d.id, {
      type: approvalEditDraft.type,
      vehicleNumber: approvalEditDraft.vehicleNumber.trim().toUpperCase(),
      capacityKg,
      length: approvalEditDraft.length.trim(), width: approvalEditDraft.width.trim(), height: approvalEditDraft.height.trim(),
    });
    cancelApprovalEdit();
  };
  const approvalDocLabels = lang === "en"
    ? { photo: "Driver Photo", dl: "Driving License" }
    : lang === "mr"
    ? { photo: "ड्रायव्हर फोटो", dl: "ड्रायव्हिंग लायसन्स" }
    : { photo: "ड्राइवर फोटो", dl: "ड्राइविंग लाइसेंस" };

  // Retention nudge for "App uninstalled (likely)" -- "already reminded
  // today" tracked per driver so switching away to WhatsApp and back
  // doesn't lose track or double-message anyone.
  const todayStrUninstalled = () => new Date().toISOString().slice(0, 10);
  const [uninstalledWhatsappSentMap, setUninstalledWhatsappSentMap] = usePersistedState("sarthi_uninstalledWhatsappSent", {});
  const markUninstalledWhatsappSent = (mobile) => setUninstalledWhatsappSentMap((prev) => ({ ...prev, [mobile]: todayStrUninstalled() }));
  const sentUninstalledToday = (mobile) => uninstalledWhatsappSentMap[mobile] === todayStrUninstalled();
  const uninstalledUnsent = uninstalledDrivers.filter((d) => !sentUninstalledToday(d.mobile));

  // Same "already messaged today" tracking as the uninstalled-driver
  // retention nudge above, but for approved drivers who still have the app
  // and just haven't toggled online -- a distinct message and a separate
  // sent-today map since these are two different asks (come back vs. go
  // online) and a driver could plausibly need both reminders on the same day.
  const [offDutyWhatsappSentMap, setOffDutyWhatsappSentMap] = usePersistedState("sarthi_offDutyWhatsappSent", {});
  const markOffDutyWhatsappSent = (mobile) => setOffDutyWhatsappSentMap((prev) => ({ ...prev, [mobile]: todayStrUninstalled() }));
  const sentOffDutyToday = (mobile) => offDutyWhatsappSentMap[mobile] === todayStrUninstalled();
  const offDutyUnsent = offDutyDrivers.filter((d) => !sentOffDutyToday(d.mobile));

  // Real bulk send (see sendBulkDriverWhatsApp in functions/index.js) --
  // one MSG91 API call reaching every not-yet-messaged-today driver at
  // once. Only one bulk send can run at a time from this screen
  // (bulkSendingKind), which is fine -- these are rare, deliberate admin
  // actions, not something fired off in parallel. markSent is whichever
  // per-kind "already sent today" setter applies (e.g.
  // markUninstalledWhatsappSent) so a successful bulk send updates the same
  // persisted map the per-row individual button below also uses -- either
  // path correctly marks a driver as reminded for the day.
  const [bulkSendingKind, setBulkSendingKind] = useState(null);
  const [bulkSendResult, setBulkSendResult] = useState(null);
  const sendBulkWhatsAppNow = async (kind, targets, markSent) => {
    if (bulkSendingKind) return;
    setBulkSendingKind(kind);
    setBulkSendResult(null);
    const mobiles = targets.map((d) => d.mobile).filter(Boolean);
    const result = await sendBulkDriverWhatsApp(kind, mobiles);
    if (result.ok) targets.forEach((d) => markSent(d.mobile));
    setBulkSendResult({ kind, ...result });
    setBulkSendingKind(null);
  };

  // Per-row "message just this one driver" -- same MSG91 template as the
  // bulk button above (a bulk send of one), not the old wa.me plain-text
  // link this replaces. That old link was never actually removed when the
  // bulk button was added, so it kept firing an unreviewed, outdated
  // message (still pointing at the Firebase hosting URL instead of the
  // Play Store listing) whenever admin messaged a single driver instead of
  // everyone -- a real bug caught by the admin testing it on themselves.
  const [singleSendingMobile, setSingleSendingMobile] = useState(null);
  // Surfaced next to the row's own button (see renderItem below) -- the
  // old wa.me link at least visibly opened WhatsApp, so a failed send was
  // obvious. This one sends silently in the background, so without some
  // visible result an admin has no way to tell a failure from a success;
  // that silence is very likely what was actually behind the repeated
  // "still shows the old message" reports -- the call may have simply
  // been failing every time, with no new message ever sent at all.
  const [singleSendResult, setSingleSendResult] = useState(null);
  const sendSingleWhatsAppNow = async (kind, d, markSent) => {
    if (bulkSendingKind || singleSendingMobile) return;
    setSingleSendingMobile(d.mobile);
    setSingleSendResult(null);
    const result = await sendBulkDriverWhatsApp(kind, [d.mobile]);
    if (result.ok) markSent(d.mobile);
    setSingleSendResult({ mobile: d.mobile, kind, ok: result.ok, reason: result.reason });
    setSingleSendingMobile(null);
  };

  // Global fuel-price nudge -- moves every Admin rate (adminRouteFares) when
  // the diesel price per litre changes, up or down. Driver-submitted quotes
  // (routeFares) are untouched by this since commit ae40cb4 dropped them as
  // a customer-pricing layer entirely -- Diesel has no reason to move a
  // number that no longer affects what anyone is charged.
  //
  // Per-tier, not a flat ₹/km for everyone -- a heavier vehicle burns more
  // diesel per km, so the same price-per-litre move should shift its rate
  // more than a tempo's. DIESEL_MILEAGE_BY_TIER_MAX_KG (km/litre, admin-
  // reviewed reference figures) converts a ₹/litre change into each tier's
  // own ₹/km delta: perKmDelta = priceDelta / mileage. These are fuel-cost
  // mileage figures only, not the tier's actual perKmRate (DEFAULT_FARE_TIERS)
  // -- that already bakes in driver earnings + margin on top of fuel, so
  // this formula only sizes the ADJUSTMENT, it never replaces the rate.
  //
  // Still a flat totalFare += perKmDelta*estimatedKm rather than nudging a
  // displayed per-km rate and rebuilding Total from it, which was tried
  // first: that approach amplifies any per-km change by dividing it by 0.75
  // (the first 5km is a fixed 25% SLICE of the total, not a flat rupee
  // amount) -- a real bug: "+₹1/km" on a 201km entry landed as +₹271, not
  // +₹201. Entries with no usable distance are left untouched -- there's no
  // per-km rate to move. Entries missing/with an unrecognized tierMaxKg fall
  // back to the heaviest tier's mileage -- the smallest, most conservative
  // per-km move.
  //
  // Tapping +/- only ever changes dieselStagedPrice (in-memory, no network)
  // so repeated taps are instant -- nothing actually writes to Firestore
  // until "Save Diesel Rate" commits the accumulated change in a single
  // pass, using bulkUpdateDocs (chunked Firestore batches) rather than one
  // write per document, since a several-hundred-doc bulk operation from a
  // mobile browser is exactly the kind of long-running write that kept
  // failing halfway during the Maharashtra import.
  // Re-keyed to DEFAULT_FARE_TIERS' new 24-vehicle maxKg set (see
  // admin-rate-calculator-developer-guide.md) -- the old 8-tier keys here
  // no longer exist, which would've silently fallen every tier but the
  // smallest/largest to the most conservative (heaviest-tier) mileage.
  const DIESEL_MILEAGE_BY_TIER_MAX_KG = {
    500: 18, 750: 16.5, 800: 16, 900: 15.2, 1000: 14.5, 1200: 13, 1250: 12.5,
    1500: 11, 2000: 9.8, 2500: 9, 3500: 7.2, 5000: 6, 7000: 5.4, 7500: 5.2,
    9000: 4.8, 9500: 4.6, 10000: 4.5, 12000: 4.2, 16000: 3.8, 18000: 3.6,
    21000: 3.4, 25000: 3.2, 30000: 3,
    [FARE_TIER_MAX_KG_UNCAPPED]: 2.8,
  };
  const [dieselPricePerLitre, setDieselPricePerLitre] = usePersistedState("sarthi_dieselPricePerLitre", 90);
  const [dieselStagedPrice, setDieselStagedPrice] = useState(null);
  const dieselDisplayPrice = dieselStagedPrice ?? dieselPricePerLitre;
  const dieselPending = dieselStagedPrice != null ? dieselStagedPrice - dieselPricePerLitre : 0;
  const [dieselAdjusting, setDieselAdjusting] = useState(false);
  const [dieselFlash, setDieselFlash] = useState("");
  const [dieselError, setDieselError] = useState("");
  const saveDiesel = async () => {
    if (dieselAdjusting || dieselPending === 0) return;
    const oldPrice = dieselPricePerLitre;
    const newPrice = dieselStagedPrice;
    setDieselAdjusting(true);
    setDieselFlash("");
    setDieselError("");
    try {
      // Admin's own rates only, now that driver-submitted quotes (routeFares)
      // no longer feed into customer pricing at all -- see resolveFare.
      const adminUpdates = (adminRouteFares || [])
        .filter((r) => r.estimatedKm > 0)
        .map((r) => {
          const mileage = DIESEL_MILEAGE_BY_TIER_MAX_KG[r.tierMaxKg] ?? DIESEL_MILEAGE_BY_TIER_MAX_KG[FARE_TIER_MAX_KG_UNCAPPED];
          const perKmDelta = (newPrice - oldPrice) / mileage;
          return {
            id: r.id,
            patch: { totalFare: Math.max(1, Math.round((Number(r.totalFare) || 0) + perKmDelta * r.estimatedKm)) },
          };
        });
      await bulkUpdateDocs("adminRouteFares", adminUpdates);
      const count = adminUpdates.length;
      setDieselPricePerLitre(newPrice);
      setDieselStagedPrice(null);
      setDieselFlash(lang === "en" ? `Adjusted ${count} rates for diesel ₹${oldPrice} → ₹${newPrice}/L.` : lang === "mr" ? `डिझेल ₹${oldPrice} → ₹${newPrice}/L साठी ${count} दर बदलले.` : `डीज़ल ₹${oldPrice} → ₹${newPrice}/L के लिए ${count} दरों को बदला गया।`);
    } catch (e) {
      console.error(e);
      setDieselError(lang === "en" ? "Couldn't adjust rates -- try again." : lang === "mr" ? "दर बदलता आले नाहीत — पुन्हा प्रयत्न करा." : "दर बदले नहीं जा सके — फिर कोशिश करें।");
    }
    setDieselAdjusting(false);
  };

  // Which side of the merged New Registrations screen is showing — see
  // detailView === "newRegistrations" below. Defaults to Driver since KYC
  // approval (the thing that actually needs admin action) lives there;
  // Customer is purely informational.
  const [newRegTab, setNewRegTab] = useState("driver");

  const statusMeta = lang === "en"
    ? { Bidding: { label: "Awaiting bids", color: "#FFFFFF", bg: C.marigoldDeep }, Ongoing: { label: "Ongoing", color: "#FFFFFF", bg: C.marigoldDeep }, Completed: { label: "Completed", color: "#FFFFFF", bg: C.success }, Cancelled: { label: "Cancelled", color: "#FFFFFF", bg: C.safety } }
    : { Bidding: { label: "बिड बाकी", color: "#FFFFFF", bg: C.marigoldDeep }, Ongoing: { label: "चालू", color: "#FFFFFF", bg: C.marigoldDeep }, Completed: { label: "पूर्ण", color: "#FFFFFF", bg: C.success }, Cancelled: { label: "रद्द", color: "#FFFFFF", bg: C.safety } };
  const recentActivity = (bookings || []).slice(0, 5);
  const activityTime = (b) => (b.createdAt?.toDate ? b.createdAt.toDate().toLocaleTimeString(lang === "en" ? "en-IN" : lang === "mr" ? "mr-IN" : "hi-IN", { hour: "2-digit", minute: "2-digit" }) : "—");

  const [vehicleQuery, setVehicleQuery] = useState("");
  const q = vehicleQuery.trim().toUpperCase();
  const matchedDriver = q ? drivers.find((d) => d.vehicleSpec?.vehicleNumber?.toUpperCase() === q) : null;
  const vehicleHistory = matchedDriver ? tripLog.filter((t) => t.driverName === matchedDriver.name) : [];

  // Each drill-down tile's dedicated detail page: title, empty-state
  // message, the live items array, and how to render one row.
  const detailPages = {
    online: {
      title: lang === "en" ? "Online — ready for bookings" : lang === "mr" ? "ऑनलाइन — बुकिंगसाठी तयार" : "ऑनलाइन — बुकिंग के लिए तैयार",
      emptyMsg: lang === "en" ? "No drivers currently online." : lang === "mr" ? "अजून कोणताही ड्रायव्हर ऑनलाइन नाही." : "अभी कोई ड्राइवर ऑनलाइन नहीं है।",
      items: readyOnlineDrivers,
      renderItem: (d) => (
        <div key={d.id} className="rounded-lg p-2.5 flex items-center justify-between" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          <div className="text-xs font-bold" style={{ color: C.ink }}>{d.name}</div>
          <div className="text-[11px]" style={{ color: C.inkSoft, fontFamily: monoFont }}>{d.vehicleSpec?.vehicleNumber || "—"}</div>
        </div>
      ),
    },
    offDuty: {
      title: lang === "en" ? "Off duty" : lang === "mr" ? "ऑफ ड्युटी" : "ऑफ ड्यूटी",
      emptyMsg: lang === "en" ? "No approved driver is currently off duty." : lang === "mr" ? "सध्या कोणताही अप्रूव्ह्ड ड्रायव्हर ऑफ ड्युटीवर नाही." : "फिलहाल कोई अप्रूव्ड ड्राइवर ऑफ ड्यूटी पर नहीं है।",
      items: offDutyDrivers,
      headerExtra: offDutyDrivers.length > 0 && (
        <>
          {offDutyUnsent.length > 0 ? (
            <button onClick={() => sendBulkWhatsAppNow("offDuty", offDutyUnsent, markOffDutyWhatsappSent)} disabled={!!bulkSendingKind}
              className="w-full rounded-lg py-3 font-bold text-sm mb-2 flex items-center justify-center gap-1.5 text-white" style={{ background: bulkSendingKind ? "#9AA3B0" : C.success, opacity: bulkSendingKind && bulkSendingKind !== "offDuty" ? 0.6 : 1 }}>
              <MessageCircle size={14} />
              {bulkSendingKind === "offDuty"
                ? (lang === "en" ? "Sending…" : lang === "mr" ? "पाठवत आहे…" : "भेजा जा रहा है…")
                : (lang === "en" ? `Bulk WhatsApp to all ${offDutyUnsent.length} off-duty drivers at once` : lang === "mr" ? `सर्व ${offDutyUnsent.length} ऑफ ड्युटी ड्रायव्हर्सना एका साथ बल्क WhatsApp पाठवा` : `सभी ${offDutyUnsent.length} ऑफ ड्यूटी ड्राइवरों को एक साथ बल्क WhatsApp भेजें`)}
            </button>
          ) : (
            <div className="w-full rounded-lg py-3 font-bold text-sm mb-2 flex items-center justify-center gap-1.5" style={{ background: "#E0E0E0", color: "#9AA3B0" }}>
              <CheckCircle2 size={14} />
              {lang === "en" ? "Everyone messaged today" : lang === "mr" ? "आज सर्वांना मेसेज केला" : "आज सभी को मेसेज किया गया"}
            </div>
          )}
          {bulkSendResult?.kind === "offDuty" && (
            <div className="rounded-lg p-2 mb-3 text-xs font-bold text-center" style={{ background: bulkSendResult.ok ? C.success : C.safety, color: "#fff" }}>
              {bulkSendResult.ok
                ? (lang === "en" ? `Sent to ${bulkSendResult.sent} drivers.` : lang === "mr" ? `${bulkSendResult.sent} ड्रायव्हर्सना पाठवले.` : `${bulkSendResult.sent} ड्राइवरों को भेजा गया।`)
                : (lang === "en" ? "Couldn't send — try again." : lang === "mr" ? "पाठवता आले नाही — पुन्हा प्रयत्न करा." : "भेजा नहीं जा सका — फिर कोशिश करें।")}
            </div>
          )}
        </>
      ),
      renderItem: (d) => (
        <div key={d.id} className="rounded-lg p-2.5 flex items-center justify-between" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          <div>
            <div className="text-xs font-bold" style={{ color: C.ink }}>{d.name}</div>
            <div className="text-[11px]" style={{ color: C.inkSoft, fontFamily: monoFont }}>{d.vehicleSpec?.vehicleNumber || "—"}</div>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-0.5">
            <button onClick={() => sendSingleWhatsAppNow("offDuty", d, markOffDutyWhatsappSent)} disabled={!!bulkSendingKind || !!singleSendingMobile}
              className="p-2 rounded-full" style={{ background: sentOffDutyToday(d.mobile) ? "#E0E0E0" : C.success, opacity: singleSendingMobile && singleSendingMobile !== d.mobile ? 0.6 : 1 }}>
              <MessageCircle size={14} color={sentOffDutyToday(d.mobile) ? "#9AA3B0" : "#FFFFFF"} />
            </button>
            {singleSendResult?.mobile === d.mobile && (
              <span className="text-[9px] font-bold" style={{ color: singleSendResult.ok ? C.success : C.safety }} title={singleSendResult.ok ? undefined : singleSendResult.reason}>
                {singleSendResult.ok
                  ? (lang === "en" ? "Sent" : lang === "mr" ? "पाठवले" : "भेजा गया")
                  : (lang === "en" ? "Failed" : lang === "mr" ? "अयशस्वी" : "विफल")}
              </span>
            )}
          </div>
        </div>
      ),
    },
    uninstalled: {
      title: lang === "en" ? "Uninstalled / Blocked" : lang === "mr" ? "अनइन्स्टॉल्ड / ब्लॉक्ड" : "अनइंस्टॉल्ड / ब्लॉक्ड",
      emptyMsg: lang === "en" ? "No driver has gone quiet this long, and none are blocked." : lang === "mr" ? "कोणताही ड्रायव्हर इतका काळ गप्प नाही, आणि कोणीही ब्लॉक्ड नाही." : "कोई भी ड्राइवर इतने दिन से खामोश नहीं है, और कोई ब्लॉक्ड नहीं है।",
      // Blacklisted drivers folded in alongside likely-uninstalled ones --
      // see inactiveDrivers above for why (AdminDriverList is installed-
      // only now, so this is their only remaining home).
      items: inactiveDrivers,
      // Retention queue -- same "send next one, one tap at a time" pattern
      // as AdminDriverList's GPS reminder, so admin can work through the
      // whole list without hunting for who's already been messaged today.
      // Scoped to uninstalledDrivers only (not blacklisted) -- "we miss
      // you, come back" makes no sense to send someone who was blocked on
      // purpose, not someone who just went quiet.
      headerExtra: uninstalledDrivers.length > 0 && (
        <>
          {uninstalledUnsent.length > 0 ? (
            <button onClick={() => sendBulkWhatsAppNow("reinstall", uninstalledUnsent, markUninstalledWhatsappSent)} disabled={!!bulkSendingKind}
              className="w-full rounded-lg py-3 font-bold text-sm mb-2 flex items-center justify-center gap-1.5 text-white" style={{ background: bulkSendingKind ? "#9AA3B0" : C.success, opacity: bulkSendingKind && bulkSendingKind !== "reinstall" ? 0.6 : 1 }}>
              <MessageCircle size={14} />
              {bulkSendingKind === "reinstall"
                ? (lang === "en" ? "Sending…" : lang === "mr" ? "पाठवत आहे…" : "भेजा जा रहा है…")
                : (lang === "en" ? `Bulk WhatsApp to all ${uninstalledUnsent.length} drivers at once` : lang === "mr" ? `सर्व ${uninstalledUnsent.length} ड्रायव्हर्सना एका साथ बल्क WhatsApp पाठवा` : `सभी ${uninstalledUnsent.length} ड्राइवरों को एक साथ बल्क WhatsApp भेजें`)}
            </button>
          ) : (
            <div className="w-full rounded-lg py-3 font-bold text-sm mb-2 flex items-center justify-center gap-1.5" style={{ background: "#E0E0E0", color: "#9AA3B0" }}>
              <CheckCircle2 size={14} />
              {lang === "en" ? "Everyone messaged today" : lang === "mr" ? "आज सर्वांना मेसेज केला" : "आज सभी को मेसेज किया गया"}
            </div>
          )}
          {bulkSendResult?.kind === "reinstall" && (
            <div className="rounded-lg p-2 mb-3 text-xs font-bold text-center" style={{ background: bulkSendResult.ok ? C.success : C.safety, color: "#fff" }}>
              {bulkSendResult.ok
                ? (lang === "en" ? `Sent to ${bulkSendResult.sent} drivers.` : lang === "mr" ? `${bulkSendResult.sent} ड्रायव्हर्सना पाठवले.` : `${bulkSendResult.sent} ड्राइवरों को भेजा गया।`)
                : (lang === "en" ? "Couldn't send — try again." : lang === "mr" ? "पाठवता आले नाही — पुन्हा प्रयत्न करा." : "भेजा नहीं जा सका — फिर कोशिश करें।")}
            </div>
          )}
        </>
      ),
      renderItem: (d) => (
        <div key={d.id} className="rounded-lg p-2.5 flex items-center justify-between" style={{ background: C.paper, border: `1px solid ${d.blacklisted ? C.safety : C.line}` }}>
          <div>
            <div className="text-xs font-bold" style={{ color: C.ink }}>{d.name}</div>
            <div className="text-[10px]" style={{ color: C.inkSoft, fontFamily: monoFont }}>{d.mobile}</div>
            <div className="text-[11px]" style={{ color: C.inkSoft, fontFamily: monoFont }}>{d.vehicleSpec?.vehicleNumber || "—"}</div>
          </div>
          {d.blacklisted ? (
            <button onClick={() => toggleBlacklist(d.mobile || d.id)} className="shrink-0 text-xs font-bold px-3 py-2 rounded-lg text-white" style={{ background: C.success }}>
              {lang === "en" ? "Unblock" : lang === "mr" ? "अनब्लॉक करा" : "अनब्लॉक करें"}
            </button>
          ) : (
            <div className="shrink-0 flex flex-col items-end gap-0.5">
              <button onClick={() => sendSingleWhatsAppNow("reinstall", d, markUninstalledWhatsappSent)} disabled={!!bulkSendingKind || !!singleSendingMobile}
                className="p-2 rounded-full" style={{ background: sentUninstalledToday(d.mobile) ? "#E0E0E0" : C.success, opacity: singleSendingMobile && singleSendingMobile !== d.mobile ? 0.6 : 1 }}>
                <MessageCircle size={14} color={sentUninstalledToday(d.mobile) ? "#9AA3B0" : "#FFFFFF"} />
              </button>
              {singleSendResult?.mobile === d.mobile && (
                <span className="text-[9px] font-bold" style={{ color: singleSendResult.ok ? C.success : C.safety }} title={singleSendResult.ok ? undefined : singleSendResult.reason}>
                  {singleSendResult.ok
                    ? (lang === "en" ? "Sent" : lang === "mr" ? "पाठवले" : "भेजा गया")
                    : (lang === "en" ? "Failed" : lang === "mr" ? "अयशस्वी" : "विफल")}
                </span>
              )}
            </div>
          )}
        </div>
      ),
    },
    booked: {
      title: lang === "en" ? "Booked today" : lang === "mr" ? "आज किती गाड्या बुक झाल्या" : "आज कितनी गाड़ियां बुक हुईं",
      emptyMsg: lang === "en" ? "No vehicles booked today yet." : lang === "mr" ? "आज अद्याप कोणतीही गाडी बुक झाली नाही." : "आज तक कोई गाड़ी बुक नहीं हुई।",
      items: bookedTodayList,
      renderItem: (t) => (
        <div key={t.id} className="rounded-lg p-2.5" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          <RouteLine pickup={t.pickup} drop={t.drop} lang={lang} />
          <div className="text-[11px] mt-1" style={{ color: C.inkSoft }}>{t.driverName || "—"} · {fmt(t.fare)} · {statusMeta[t.status]?.label || t.status}</div>
        </div>
      ),
    },
    cancelled: {
      title: lang === "en" ? "Cancelled today" : lang === "mr" ? "आज रद्द झाल्या" : "आज रद्द हुईं",
      emptyMsg: lang === "en" ? "Nothing cancelled today." : lang === "mr" ? "आज काहीही रद्द झाले नाही." : "आज कुछ भी रद्द नहीं हुआ।",
      items: cancelledTodayList,
      renderItem: (b) => (
        <div key={b.id} className="rounded-lg p-2.5" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          <RouteLine pickup={b.pickup} drop={b.drop} lang={lang} />
          <div className="text-[11px] mt-1" style={{ color: C.inkSoft }}>{b.driverName || (lang === "en" ? "No driver assigned" : lang === "mr" ? "कोणताही ड्रायव्हर निश्चित झाला नाही" : "कोई ड्राइवर तय नहीं हुआ")}</div>
        </div>
      ),
    },
    lowWallet: {
      title: lang === "en" ? "Online drivers below min. wallet" : lang === "mr" ? "किमान वॉलेटपेक्षा कमी — ऑनलाइन ड्रायव्हर" : "न्यूनतम वॉलेट से कम — ऑनलाइन ड्राइवर",
      emptyMsg: lang === "en" ? "No online driver is below the minimum wallet balance." : lang === "mr" ? "कोणताही ऑनलाइन ड्रायव्हर किमान वॉलेटपेक्षा कमी नाही." : "कोई भी ऑनलाइन ड्राइवर न्यूनतम वॉलेट से कम नहीं है।",
      items: lowWalletDrivers,
      renderItem: (d) => (
        <div key={d.id} className="rounded-lg p-2.5 flex items-center justify-between" style={{ background: C.paper, border: `1px solid ${C.safety}` }}>
          <div className="text-xs font-bold" style={{ color: C.ink }}>{d.name}</div>
          <div className="text-[11px] font-bold" style={{ color: C.safety, fontFamily: monoFont }}>{fmt(d.wallet)}</div>
        </div>
      ),
    },
    advance: {
      title: lang === "en" ? "Total advance bookings" : lang === "mr" ? "एकूण अ‍ॅडव्हान्स बुकिंग" : "कुल एडवांस बुकिंग",
      emptyMsg: lang === "en" ? "No advance bookings yet." : lang === "mr" ? "अजून कोणतीही अ‍ॅडव्हान्स बुकिंग नाही." : "अभी तक कोई एडवांस बुकिंग नहीं है।",
      items: advanceBookingsList,
      renderItem: (b) => (
        <div key={b.id} className="rounded-lg p-2.5" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          <RouteLine pickup={b.pickup} drop={b.drop} lang={lang} />
          <div className="text-[11px] mt-1" style={{ color: C.inkSoft }}>{b.scheduledFor} · {b.driverName || (lang === "en" ? "Awaiting bids" : lang === "mr" ? "बोलीची वाट पाहत आहे" : "बोली का इंतज़ार")}</div>
        </div>
      ),
    },
  };

  // "New Registrations" -> Customer stays a plain informational,
  // today-only list (a customer registration has no pending/incomplete
  // state, so "today" is the only meaningful scope there). Driver is the
  // KYC approval queue (see approvalQueue above) -- Approve/Reject/Edit
  // live here now, not in the Drivers tab.
  if (detailView === "liveMap") {
    return (
      <div>
        <button onClick={() => setDetailView(null)} className="flex items-center gap-1 mb-3 p-3 rounded-full shadow-sm" style={{ background: C.marigold, color: "#000000", border: `1.5px solid ${C.marigoldDeep}` }}>
          <ChevronLeft size={18} strokeWidth={3} />
        </button>
        <h2 className="text-base font-bold mb-3" style={{ color: C.ink }}>{lang === "en" ? "Live Map" : lang === "mr" ? "लाइव्ह मॅप" : "लाइव मैप"}</h2>
        <AdminLiveMap drivers={drivers} lang={lang} />
      </div>
    );
  }

  if (detailView === "newRegistrations") {
    return (
      <div>
        <button onClick={() => setDetailView(null)} className="flex items-center gap-1 mb-3 p-3 rounded-full shadow-sm" style={{ background: C.marigold, color: "#000000", border: `1.5px solid ${C.marigoldDeep}` }}>
          <ChevronLeft size={18} strokeWidth={3} />
        </button>
        <h2 className="text-base font-bold mb-3" style={{ color: C.ink }}>{lang === "en" ? "New Registrations" : lang === "mr" ? "नवीन रजिस्ट्रेशन" : "नए रजिस्ट्रेशन"}</h2>
        <div className="flex gap-2 mb-4">
          <button onClick={() => setNewRegTab("customer")} className="flex-1 rounded-lg py-3 text-sm font-bold"
            style={{ background: newRegTab === "customer" ? C.navy : C.paper, color: newRegTab === "customer" ? "#fff" : C.inkSoft, border: `1.5px solid ${newRegTab === "customer" ? C.navy : C.line}` }}>
            {lang === "en" ? "Customer" : lang === "mr" ? "कस्टमर" : "कस्टमर"}{newCustomersToday.length > 0 ? ` (${newCustomersToday.length})` : ""}
          </button>
          <button onClick={() => setNewRegTab("driver")} className="flex-1 rounded-lg py-3 text-sm font-bold"
            style={{ background: newRegTab === "driver" ? C.navy : C.paper, color: newRegTab === "driver" ? "#fff" : C.inkSoft, border: `1.5px solid ${newRegTab === "driver" ? C.navy : C.line}` }}>
            {lang === "en" ? "Driver" : lang === "mr" ? "ड्रायव्हर" : "ड्राइवर"}{driverRegistrations.length > 0 ? ` (${driverRegistrations.length})` : ""}
          </button>
        </div>
        {newRegTab === "customer" ? (
          newCustomersToday.length === 0 ? (
            <p className="text-xs text-center py-10" style={{ color: C.inkSoft }}>{lang === "en" ? "No new customer signups today yet." : lang === "mr" ? "आज अद्याप कोणताही नवीन कस्टमर साइनअप झाला नाही." : "आज तक कोई नया कस्टमर साइनअप नहीं हुआ।"}</p>
          ) : (
            <div className="space-y-1.5">
              {newCustomersToday.map((c) => (
                <div key={c.id} className="rounded-lg p-2.5 flex items-center justify-between" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                  <div className="text-xs font-bold" style={{ color: C.ink }}>{c.name}</div>
                  <div className="text-[10px]" style={{ color: C.inkSoft, fontFamily: monoFont }}>{c.mobile}</div>
                </div>
              ))}
            </div>
          )
        ) : driverRegistrations.length === 0 ? (
          <p className="text-xs text-center py-10" style={{ color: C.inkSoft }}>{lang === "en" ? "Every driver's KYC is resolved." : lang === "mr" ? "सर्व ड्रायव्हरांची KYC निकाली काढली आहे." : "सभी ड्राइवरों की KYC निपटा दी गई है।"}</p>
        ) : (
          <div className="space-y-1.5">
            {driverRegistrations.map((d) => {
              // Not yet submitted (signed up within the last few days, no
              // vehicleSpec) -- nothing to approve/reject/edit here, just a
              // visibility row so a fresh signup never looks like it
              // silently disappeared. See notSubmittedRecentList above.
              if (!d.vehicleSpec) {
                return (
                  <div key={d.id} className="rounded-lg p-3 flex items-center justify-between gap-2" style={{ border: `1px solid ${C.line}`, background: C.bg }}>
                    <div className="min-w-0">
                      <div className="text-sm font-bold" style={{ color: C.ink }}>{d.name}</div>
                      <div className="text-xs" style={{ color: C.inkSoft, fontFamily: monoFont }}>{d.mobile}</div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ color: C.inkSoft, background: "#E0E0E0" }}>
                      {lang === "en" ? "Form not submitted yet" : lang === "mr" ? "फॉर्म अद्याप भरलेला नाही" : "फॉर्म अभी भरा नहीं गया"}
                    </span>
                  </div>
                );
              }
              const expanded = approvalExpandedId === d.id;
              const editing = approvalEditingId === d.id;
              return (
                <div key={d.id} className="rounded-lg p-3" style={{ border: `1px solid ${C.line}`, background: C.paper }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold" style={{ color: C.ink }}>{d.name}</div>
                      <div className="text-xs" style={{ color: C.inkSoft, fontFamily: monoFont }}>{d.vehicleSpec?.vehicleNumber || "—"} · {d.mobile}</div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ color: "#FFFFFF", background: C.marigoldDeep }}>
                      {lang === "en" ? "Pending" : lang === "mr" ? "प्रलंबित" : "लंबित"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                        <button onClick={() => setApprovalExpandedId(expanded ? null : d.id)} className="text-sm font-bold" style={{ color: C.marigoldDeep }}>
                          {expanded ? (lang === "en" ? "▲ Hide KYC details" : lang === "mr" ? "▲ KYC डिटेल लपवा" : "▲ KYC डिटेल छुपाएं") : (lang === "en" ? "▼ View KYC details" : lang === "mr" ? "▼ KYC डिटेल पहा" : "▼ KYC डिटेल देखें")}
                        </button>
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => (editing ? cancelApprovalEdit() : startApprovalEdit(d))} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: editing ? C.inkSoft : C.navy, color: "#FFFFFF" }}>
                            {editing ? (lang === "en" ? "Cancel" : lang === "mr" ? "रद्द करा" : "रद्द करें") : (lang === "en" ? "Edit" : lang === "mr" ? "एडिट" : "एडिट")}
                          </button>
                          <button onClick={() => updateDriverKyc(d.id, "Rejected")} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: C.safety, color: "#FFFFFF" }}>{lang === "en" ? "Reject" : lang === "mr" ? "नाकारा" : "नकारें"}</button>
                          <button onClick={() => updateDriverKyc(d.id, "Approved")} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: C.metallicGreen }}>{lang === "en" ? "Approve" : lang === "mr" ? "अप्रूव्ह करा" : "अप्रूव करें"}</button>
                        </div>
                      </div>
                      {editing ? (
                        <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <label className="text-[11px] col-span-2">
                              <span className="block mb-1 font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "Vehicle type" : lang === "mr" ? "गाडीचा प्रकार" : "गाड़ी का प्रकार"}</span>
                              <select value={approvalEditDraft.type} onChange={(e) => setApprovalEditDraft((p) => ({ ...p, type: e.target.value }))}
                                className="w-full rounded-lg px-2.5 py-2 text-sm outline-none" style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.ink }}>
                                {!vehicleTypes.some((v) => v.key === approvalEditDraft.type) && <option value={approvalEditDraft.type}>{approvalEditDraft.type || "—"}</option>}
                                {vehicleTypes.map((v) => <option key={v.key} value={v.key}>{lang === "en" ? (v.labelEn || v.label) : v.label}</option>)}
                              </select>
                            </label>
                            <label className="text-[11px]">
                              <span className="block mb-1 font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "Vehicle number" : lang === "mr" ? "गाडी नंबर" : "गाड़ी नंबर"}</span>
                              <input value={approvalEditDraft.vehicleNumber} onChange={(e) => setApprovalEditDraft((p) => ({ ...p, vehicleNumber: e.target.value }))}
                                className="w-full rounded-lg px-2.5 py-2 text-sm outline-none" style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.ink }} />
                            </label>
                            <label className="text-[11px]">
                              <span className="block mb-1 font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "Capacity (kg)" : lang === "mr" ? "क्षमता (किलो)" : "क्षमता (किग्रा)"}</span>
                              <input type="number" value={approvalEditDraft.capacityKg} onChange={(e) => setApprovalEditDraft((p) => ({ ...p, capacityKg: e.target.value }))}
                                className="w-full rounded-lg px-2.5 py-2 text-sm outline-none" style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.ink }} />
                            </label>
                            <label className="text-[11px]">
                              <span className="block mb-1 font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "Length (ft)" : lang === "mr" ? "लांबी (फूट)" : "लंबाई (फीट)"}</span>
                              <input value={approvalEditDraft.length} onChange={(e) => setApprovalEditDraft((p) => ({ ...p, length: e.target.value }))}
                                className="w-full rounded-lg px-2.5 py-2 text-sm outline-none" style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.ink }} />
                            </label>
                            <label className="text-[11px]">
                              <span className="block mb-1 font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "Width (ft)" : lang === "mr" ? "रुंदी (फूट)" : "चौड़ाई (फीट)"}</span>
                              <input value={approvalEditDraft.width} onChange={(e) => setApprovalEditDraft((p) => ({ ...p, width: e.target.value }))}
                                className="w-full rounded-lg px-2.5 py-2 text-sm outline-none" style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.ink }} />
                            </label>
                            <label className="text-[11px]">
                              <span className="block mb-1 font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "Height (ft)" : lang === "mr" ? "उंची (फूट)" : "ऊंचाई (फीट)"}</span>
                              <input value={approvalEditDraft.height} onChange={(e) => setApprovalEditDraft((p) => ({ ...p, height: e.target.value }))}
                                className="w-full rounded-lg px-2.5 py-2 text-sm outline-none" style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.ink }} />
                            </label>
                          </div>
                          {approvalEditError && <p className="text-[11px] mb-2" style={{ color: C.safety }}>{approvalEditError}</p>}
                          <div className="flex justify-end">
                            <button onClick={() => saveApprovalEdit(d)} className="rounded-lg px-5 py-2.5 text-sm font-bold text-white" style={{ background: C.metallicGreen }}>
                              {lang === "en" ? "Save changes" : lang === "mr" ? "बदल सेव्ह करा" : "बदलाव सेव करें"}
                            </button>
                          </div>
                        </div>
                      ) : expanded && (
                        <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
                          <div className="text-[11px] font-semibold mb-1.5" style={{ color: C.inkSoft }}>{lang === "en" ? "Submitted documents:" : lang === "mr" ? "जमा केलेली कागदपत्रे:" : "जमा किए गए दस्तावेज़:"}</div>
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            {Object.entries(approvalDocLabels).map(([key, label]) => {
                              const doc = d.docs?.[key];
                              return <KycDocThumb key={key} url={doc?.url} label={label} lang={lang} fileName={`${d.name}-${key}.jpg`} />;
                            })}
                          </div>
                          {(d.vehicleSpec?.photo || d.vehicleSpec?.photoSide) && (
                            <>
                              <div className="text-[11px] font-semibold mb-1.5" style={{ color: C.inkSoft }}>{lang === "en" ? "Vehicle photos:" : lang === "mr" ? "गाडीचा फोटो:" : "गाड़ी की फोटो:"}</div>
                              <div className="grid grid-cols-2 gap-2 mb-2">
                                {d.vehicleSpec?.photo && <KycDocThumb url={d.vehicleSpec.photo.url} label={lang === "en" ? "Vehicle - Front" : lang === "mr" ? "गाडी - पुढे" : "गाड़ी - आगे"} lang={lang} fileName={`${d.name}-vehicle-front.jpg`} />}
                                {d.vehicleSpec?.photoSide && <KycDocThumb url={d.vehicleSpec.photoSide.url} label={lang === "en" ? "Vehicle - Side" : lang === "mr" ? "गाडी - बाजू" : "गाड़ी - साइड"} lang={lang} fileName={`${d.name}-vehicle-side.jpg`} />}
                              </div>
                            </>
                          )}
                          <div className="text-[11px]" style={{ color: C.ink }}>
                            <b>{lang === "en" ? "Vehicle number" : lang === "mr" ? "गाडी नंबर" : "गाड़ी नंबर"}:</b> <span style={{ fontFamily: monoFont }}>{d.vehicleSpec.vehicleNumber || "—"}</span><br />
                            <b>{lang === "en" ? "Capacity/size" : lang === "mr" ? "क्षमता/साइझ" : "क्षमता/साइज़"}:</b> {d.vehicleSpec.capacityKg ? `${d.vehicleSpec.capacityKg} ${lang === "en" ? "kg" : lang === "mr" ? "किलो" : "किग्रा"}` : "—"} · {d.vehicleSpec.length || "—"}×{d.vehicleSpec.width || "—"}×{d.vehicleSpec.height || "—"} {lang === "en" ? "ft" : lang === "mr" ? "फूट" : "फीट"}
                          </div>
                        </div>
                      )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (detailView === "routeFares") {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => setDetailView(null)} className="shrink-0 flex items-center gap-1 p-3 rounded-full shadow-sm" style={{ background: C.marigold, color: "#000000", border: `1.5px solid ${C.marigoldDeep}` }}>
            <ChevronLeft size={18} strokeWidth={3} />
          </button>
          <div className="flex-1 grid grid-cols-3 gap-2">
            <button onClick={() => setDieselStagedPrice((p) => (p ?? dieselPricePerLitre) - 1)} disabled={dieselAdjusting} className="h-11 rounded-lg font-black text-lg flex items-center justify-center" style={{ background: C.paper, color: C.safety, border: `1px solid ${C.line}`, opacity: dieselAdjusting ? 0.5 : 1 }}>−</button>
            <div className="h-11 rounded-lg flex items-center justify-center text-sm font-bold" style={{ background: C.bg, border: `1px solid ${C.line}`, color: C.ink }}>
              {lang === "en" ? "Diesel" : lang === "mr" ? "डिझेल" : "डीज़ल"} ₹{dieselDisplayPrice}/L
            </div>
            <button onClick={() => setDieselStagedPrice((p) => (p ?? dieselPricePerLitre) + 1)} disabled={dieselAdjusting} className="h-11 rounded-lg font-black text-lg flex items-center justify-center" style={{ background: C.paper, color: C.success, border: `1px solid ${C.line}`, opacity: dieselAdjusting ? 0.5 : 1 }}>+</button>
          </div>
        </div>
        {dieselPending !== 0 && (
          <button onClick={saveDiesel} disabled={dieselAdjusting} className="w-full rounded-lg py-2.5 mb-2 text-sm font-bold" style={{ background: dieselAdjusting ? "#E0E0E0" : C.navy, color: dieselAdjusting ? "#9AA3B0" : "#fff" }}>
            {dieselAdjusting
              ? "…"
              : (lang === "en" ? `Save Diesel Rate (₹${dieselPricePerLitre} → ₹${dieselDisplayPrice}/L)` : lang === "mr" ? `डिझेल दर सेव्ह करा (₹${dieselPricePerLitre} → ₹${dieselDisplayPrice}/L)` : `डीज़ल दर सेव करें (₹${dieselPricePerLitre} → ₹${dieselDisplayPrice}/L)`)}
          </button>
        )}
        {(dieselFlash || dieselError) && (
          <div className="rounded-lg p-2 mb-3 text-xs font-bold text-center" style={{ background: dieselError ? C.safety : C.success, color: "#fff" }}>
            {dieselError || dieselFlash}
          </div>
        )}
        <AdminRouteFares routeFares={routeFares} adminRouteFares={adminRouteFares} adminRouteFaresError={adminRouteFaresError} fareTiers={fareTiers} drivers={drivers} returnPct={returnPct} setReturnPct={setReturnPct} lang={lang} />
      </div>
    );
  }

  if (detailView) {
    const page = detailPages[detailView];
    return (
      <div>
        <button onClick={() => setDetailView(null)} className="flex items-center gap-1 mb-3 p-3 rounded-full shadow-sm" style={{ background: C.marigold, color: "#000000", border: `1.5px solid ${C.marigoldDeep}` }}>
          <ChevronLeft size={18} strokeWidth={3} />
        </button>
        <h2 className="text-base font-bold mb-3" style={{ color: C.ink }}>{page.title}</h2>
        {page.headerExtra}
        {page.items.length === 0 ? (
          <p className="text-xs text-center py-10" style={{ color: C.inkSoft }}>{page.emptyMsg}</p>
        ) : (
          <div className="space-y-1.5">{page.items.map(page.renderItem)}</div>
        )}
      </div>
    );
  }

  // Change Log alert card — sits at the top of the Live Dashboard exactly
  // where the old standalone Bug Tracker card used to live, per explicit
  // request that "if anything comes up... inform the Admin on the Live
  // Dashboard, just where the bug tracker was placed before." Only renders
  // when there's actually something open (including anything the daily
  // health-check Routine logs here) -- tapping it jumps straight into
  // Settings, where the full Change Log (AdminBugTracker) now lives.
  const openChangeLogCount = (bugs || []).filter((b) => b.status !== "fixed").length;
  const criticalChangeLogCount = (bugs || []).filter((b) => b.status !== "fixed" && (b.severity === "critical" || b.severity === "high")).length;

  // Always-visible daily health check status -- per explicit request,
  // this must inform the admin whether the last run passed OR failed, not
  // just show up when something's broken (that's what the Change Log card
  // below is for). Reads systemHealth/heartbeat directly (see
  // dailyHealthCheckMorning/Night in functions/index.js), which both
  // scheduled runs update every time, pass or fail.
  const morningAt = systemHealth?.lastMorningRunAt?.toMillis ? systemHealth.lastMorningRunAt.toMillis() : null;
  const nightAt = systemHealth?.lastNightRunAt?.toMillis ? systemHealth.lastNightRunAt.toMillis() : null;
  const latestIsMorning = (morningAt || 0) >= (nightAt || 0);
  const latestHealthMs = latestIsMorning ? morningAt : nightAt;
  const latestHealthStatus = latestIsMorning ? systemHealth?.lastMorningRunStatus : systemHealth?.lastNightRunStatus;
  const latestHealthSummary = latestIsMorning ? systemHealth?.lastMorningRunSummary : systemHealth?.lastNightRunSummary;
  const healthStaleHours = latestHealthMs ? (Date.now() - latestHealthMs) / 3600000 : null;
  const healthIsStale = healthStaleHours == null || healthStaleHours > 26;
  const healthColor = healthIsStale ? C.marigoldDeep : latestHealthStatus === "pass" ? C.success : C.safety;
  const healthTimeStr = latestHealthMs ? new Date(latestHealthMs).toLocaleString(lang === "mr" ? "mr-IN" : lang === "hi" ? "hi-IN" : "en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
  const healthLabel = !latestHealthMs
    ? (lang === "en" ? "Daily health check — hasn't run yet" : lang === "mr" ? "डेली हेल्थ चेक — अजून चालले नाही" : "डेली हेल्थ चेक — अभी तक नहीं चला")
    : healthIsStale
    ? (lang === "en" ? `Daily health check — last ran ${healthTimeStr}, may have stopped` : lang === "mr" ? `डेली हेल्थ चेक — शेवटचे ${healthTimeStr} ला चालले, थांबले असू शकते` : `डेली हेल्थ चेक — आखिरी बार ${healthTimeStr} को चला, रुक गया हो सकता है`)
    : latestHealthStatus === "pass"
    ? (lang === "en" ? `Daily health check passed — ${healthTimeStr}` : lang === "mr" ? `डेली हेल्थ चेक पास झाला — ${healthTimeStr}` : `डेली हेल्थ चेक पास हुआ — ${healthTimeStr}`)
    : (lang === "en" ? `Daily health check found issues — ${healthTimeStr}` : lang === "mr" ? `डेली हेल्थ चेकमध्ये समस्या आढळल्या — ${healthTimeStr}` : `डेली हेल्थ चेक में समस्याएं मिलीं — ${healthTimeStr}`);

  return (
    <div>
      <div className="w-full rounded-xl p-3 mb-3 flex items-center gap-2" style={{ background: C.paper, border: `1.5px solid ${healthColor}` }}>
        {healthIsStale ? <AlertTriangle size={16} color={healthColor} /> : latestHealthStatus === "pass" ? <CheckCircle2 size={16} color={healthColor} /> : <XCircle size={16} color={healthColor} />}
        <div className="flex-1">
          <div className="text-xs font-bold" style={{ color: C.ink }}>{healthLabel}</div>
          {latestHealthSummary && latestHealthStatus !== "pass" && !healthIsStale && (
            <div className="text-[10px] mt-0.5" style={{ color: C.inkSoft }}>{latestHealthSummary}</div>
          )}
        </div>
      </div>
      {openChangeLogCount > 0 && (
        <button onClick={() => onNavigate("settings")} className="w-full rounded-xl p-4 mb-5 shadow-sm text-left" style={{ background: criticalChangeLogCount > 0 ? C.safety : C.marigold, border: `1.5px solid ${criticalChangeLogCount > 0 ? C.safety : C.marigoldDeep}` }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-bold" style={{ color: criticalChangeLogCount > 0 ? "#FFFFFF" : "#000000" }}>
              <ClipboardList size={16} /> {lang === "en" ? "Change Log needs attention" : lang === "mr" ? "चेंज लॉगकडे लक्ष द्या" : "चेंज लॉग पर ध्यान दें"}
            </div>
            <span className="text-xs font-black px-2.5 py-1 rounded-full" style={{ background: criticalChangeLogCount > 0 ? "#FFFFFF" : C.marigoldDeep, color: criticalChangeLogCount > 0 ? C.safety : "#FFFFFF" }}>
              {openChangeLogCount}
            </span>
          </div>
          <p className="text-[11px] font-semibold mt-1" style={{ color: criticalChangeLogCount > 0 ? "#FFFFFF" : "#000000" }}>
            {lang === "en" ? `${openChangeLogCount} open (${criticalChangeLogCount} high/critical) — tap to review in Settings` : lang === "mr" ? `${openChangeLogCount} उघड्या (${criticalChangeLogCount} हाय/क्रिटिकल) — Settings मध्ये पाहण्यासाठी टॅप करा` : `${openChangeLogCount} खुले (${criticalChangeLogCount} हाई/क्रिटिकल) — Settings में देखने के लिए टैप करें`}
          </p>
        </button>
      )}
      {/* Most to least important: New Registrations (today's total
          Customer+Driver signups, see newCustomersToday/newDriversToday
          above) comes first, then today's health signals (at-risk
          wallets, cancellations, earnings, bookings, capacity), then
          pipeline (advance bookings), then growth metrics (trial) last —
          those are useful context, not something to act on today. A
          plain today's-signups counter, not a KYC-backlog alert --
          reviewing/approving a driver's KYC lives in the Drivers tab now,
          so this stays a fixed color instead of flagging red off however
          many are still Pending. */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <StatTile label={lang === "en" ? "New Registrations" : lang === "mr" ? "नवीन रजिस्ट्रेशन" : "नए रजिस्ट्रेशन"} value={newCustomersToday.length + newDriversToday.length} color={C.pimpri} onClick={() => setDetailView("newRegistrations")} />
        <StatTile label={lang === "en" ? "Online drivers below min. wallet" : lang === "mr" ? "किमान वॉलेटपेक्षा कमी — ऑनलाइन ड्रायव्हर" : "न्यूनतम वॉलेट से कम — ऑनलाइन ड्राइवर"} value={lowWalletDrivers.length} color={lowWalletDrivers.length > 0 ? C.safety : C.success} onClick={() => setDetailView("lowWallet")} />
        <StatTile label={lang === "en" ? "Cancelled today" : lang === "mr" ? "आज रद्द झाल्या" : "आज रद्द हुईं"} value={cancelledTodayList.length} color={cancelledTodayList.length > 0 ? C.safety : C.success} onClick={() => setDetailView("cancelled")} />
        <StatTile label={lang === "en" ? "Booked today" : lang === "mr" ? "आज किती गाड्या बुक झाल्या" : "आज कितनी गाड़ियां बुक हुईं"} value={bookedTodayList.length} color={C.pimpri} onClick={() => setDetailView("booked")} />
        <StatTile label={lang === "en" ? "Online — ready for bookings" : lang === "mr" ? "ऑनलाइन — बुकिंगसाठी तयार" : "ऑनलाइन — बुकिंग के लिए तैयार"} value={readyOnlineDrivers.length} color={C.success} onClick={() => setDetailView("online")} />
        <StatTile label={lang === "en" ? "Live Map" : lang === "mr" ? "लाइव्ह मॅप" : "लाइव मैप"} value={liveMapLocatedCount} color={C.navy} onClick={() => setDetailView("liveMap")} />
        <StatTile label={lang === "en" ? "Off duty" : lang === "mr" ? "ऑफ ड्युटी" : "ऑफ ड्यूटी"} value={offDutyDrivers.length} color={C.marigoldDeep} onClick={() => setDetailView("offDuty")} />
        <StatTile label={lang === "en" ? "Uninstalled / Blocked" : lang === "mr" ? "अनइन्स्टॉल्ड / ब्लॉक्ड" : "अनइंस्टॉल्ड / ब्लॉक्ड"} value={inactiveDrivers.length} color={C.safety} onClick={() => setDetailView("uninstalled")} />
        <StatTile label={lang === "en" ? "Total advance bookings" : lang === "mr" ? "एकूण अ‍ॅडव्हान्स बुकिंग" : "कुल एडवांस बुकिंग"} value={advanceBookingsList.length} color={C.pimpri} onClick={() => setDetailView("advance")} />
        <StatTile label={lang === "en" ? "Driver Ride Entries" : lang === "mr" ? "ड्रायव्हर राइड एंट्री" : "ड्राइवर राइड एंट्री"} value={(routeFares || []).length} color={C.pimpri} onClick={() => setDetailView("routeFares")} />
      </div>

      <div className="rounded-xl p-4 mb-5 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
        <div className="text-sm font-bold mb-2 flex items-center gap-1.5" style={{ color: C.ink }}><Truck size={16} /> {lang === "en" ? "Search history by vehicle number" : lang === "mr" ? "गाडी नंबरने हिस्टरी पहा" : "गाड़ी नंबर से हिस्ट्री देखें"}</div>
        <input value={vehicleQuery} onChange={(e) => setVehicleQuery(e.target.value)} placeholder="जैसे: MH-14-AB-4521"
          className="w-full rounded-lg px-3 py-2 text-xs outline-none" style={{ border: `1px solid ${C.line}`, color: C.ink, fontFamily: monoFont }} />
        {q && !matchedDriver && (
          <div className="text-[11px] mt-2" style={{ color: C.safety }}>{lang === "en" ? "No vehicle found with this number." : lang === "mr" ? "या नंबरची कोणतीही गाडी सापडली नाही." : "इस नंबर की कोई गाड़ी नहीं मिली।"}</div>
        )}
        {matchedDriver && (
          <div className="mt-3">
            <div className="text-xs font-bold" style={{ color: C.ink }}>{matchedDriver.name} · {matchedDriver.vehicleSpec?.vehicleNumber || "—"}</div>
            <div className="text-[10px] mb-2" style={{ color: C.inkSoft }}>{lang === "en" ? "Total trips" : lang === "mr" ? "एकूण ट्रिप्स" : "कुल ट्रिप्स"}: {vehicleHistory.length}</div>
            {vehicleHistory.length === 0 ? (
              <p className="text-[11px]" style={{ color: C.inkSoft }}>{lang === "en" ? "No trip history for this vehicle yet." : lang === "mr" ? "या गाडीची अजून कोणतीही ट्रिप हिस्टरी नाही." : "इस गाड़ी की अभी कोई ट्रिप हिस्ट्री नहीं है।"}</p>
            ) : (
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                {vehicleHistory.map((t) => (
                  <div key={t.id} className="rounded-lg p-2 flex items-center justify-between" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                    <div>
                      <div className="text-[11px] font-bold" style={{ color: C.ink }}>{t.pickup} → {t.drop}</div>
                      <div className="text-[10px]" style={{ color: C.inkSoft }}>{t.status}</div>
                    </div>
                    <div className="text-sm font-bold" style={{ color: C.pimpri, fontFamily: monoFont }}>{fmt(t.fare)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl p-4 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
        <div className="text-sm font-bold mb-2 flex items-center gap-1.5" style={{ color: C.ink }}><Activity size={16} /> {lang === "en" ? "Recent Activity" : lang === "mr" ? "अलीकडील हालचाल" : "हाल की गतिविधि"}</div>
        {recentActivity.length === 0 ? (
          <p className="text-[11px]" style={{ color: C.inkSoft }}>{lang === "en" ? "No activity yet." : lang === "mr" ? "अजून कोणतीही हालचाल नाही." : "अभी तक कोई गतिविधि नहीं।"}</p>
        ) : (
          <div className="space-y-1.5">
            {recentActivity.map((b) => {
              const sm = statusMeta[b.status] || statusMeta.Bidding;
              return (
                <div key={b.id} className="rounded-lg p-2.5 flex items-center justify-between gap-2" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold truncate" style={{ color: C.ink }}>{b.pickup} → {b.drop}</div>
                    <div className="text-[10px]" style={{ color: C.inkSoft }}>{b.driverName ? `${b.driverName} · ` : ""}{activityTime(b)}</div>
                  </div>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ color: sm.color, background: sm.bg }}>{sm.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button onClick={onLogout} className="w-full mt-5 rounded-lg py-3.5 text-base font-semibold flex items-center justify-center gap-1.5" style={{ color: "#FFFFFF", background: C.safety }}>
        <XCircle size={14} /> {lang === "en" ? "Logout" : lang === "mr" ? "लॉगआउट" : "लॉगआउट"}
      </button>
    </div>
  );
}

const BUG_SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const BUG_SEVERITY_COLOR = { critical: C.safety, high: C.safety, medium: C.marigoldDeep, low: C.inkSoft };
const BUG_SEVERITY_LABEL = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
// Broadened from a pure bug log into a general Change Log per explicit
// request -- every change worth remembering (a bug fix, a UI tweak, a
// Maps/permissions config change, a new feature) gets an entry here, not
// just defects. `type` is purely a filter/label; the underlying "bugs"
// Firestore collection and BUG_TRACKER_SEED array are unchanged, just no
// longer bug-only in what they hold.
const CHANGE_TYPE_LABEL = { bug: "Bug", feature: "Feature", ui: "UI", config: "Config", security: "Security" };
const CHANGE_TYPE_COLOR = { bug: C.safety, feature: C.navy, ui: C.marigoldDeep, config: C.metallicGreen, security: "#8B0000" };

// Admin's internal Change Log (see AdminSettings, where this now lives) —
// a running record of what's actually changed in this app: bugs found and
// fixed, features added, UI tweaks, config/permissions changes. Seeded
// once per new entry with BUG_TRACKER_SEED and added to over time via the
// form below. Nothing here is customer/driver-facing; SOS/complaint
// reports (AdminAlerts) are a separate, unrelated inbox.
function AdminBugTracker({ bugs, setBugStatus, addBug, lang }) {
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ title: "", description: "", area: "", severity: "medium", type: "bug" });
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [resolvingId, setResolvingId] = useState(null);
  const q = query.trim().toLowerCase();
  const filtered = (bugs || []).filter((b) => {
    if (typeFilter !== "all" && (b.type || "bug") !== typeFilter) return false;
    if (!q) return true;
    return [b.title, b.description, b.area].some((f) => (f || "").toLowerCase().includes(q));
  });
  const sorted = [...filtered].sort((a, b) => {
    if ((a.status === "fixed") !== (b.status === "fixed")) return a.status === "fixed" ? 1 : -1;
    return (BUG_SEVERITY_ORDER[a.severity] ?? 9) - (BUG_SEVERITY_ORDER[b.severity] ?? 9);
  });
  const submit = () => {
    if (!draft.title.trim()) return;
    addBug({ title: draft.title.trim(), description: draft.description.trim(), area: draft.area.trim(), severity: draft.severity, type: draft.type });
    setDraft({ title: "", description: "", area: "", severity: "medium", type: "bug" });
    setShowForm(false);
  };
  // Resolve now runs server-side (see functions/index.js:
  // resolveChangeLogEntry) instead of the browser flipping status itself —
  // the function marks the entry "resolving" immediately (every admin
  // session sees it live, not just this tab), runs any real registered
  // data remedy against live Firestore data, then has Claude verify/report
  // and settles the entry on "fixed" or back to "open" with a note either
  // way. resolvingId here is just an immediate local lock against a
  // double-click while the call is in flight -- b.status === "resolving"
  // (from Firestore) is what actually tracks progress across sessions.
  const resolve = async (b) => {
    setResolvingId(b.id);
    try {
      await resolveChangeLogEntry(b.id);
    } catch (e) {
      console.error("[resolve]", e);
    }
    setResolvingId(null);
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold" style={{ color: C.ink }}>{lang === "en" ? "Change Log" : lang === "mr" ? "चेंज लॉग" : "चेंज लॉग"}</h2>
        <button onClick={() => setShowForm((v) => !v)} className="flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-lg" style={{ background: C.marigoldDeep, color: "#FFFFFF" }}>
          <Plus size={13} /> {lang === "en" ? "Log a change" : lang === "mr" ? "बदल नोंदवा" : "बदलाव दर्ज करें"}
        </button>
      </div>
      <input value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder={lang === "en" ? "Search changes..." : lang === "mr" ? "बदल शोधा..." : "बदलाव खोजें..."}
        className="w-full rounded-lg px-3 py-2.5 text-xs outline-none mb-2" style={{ border: `1px solid ${C.line}`, color: C.ink, background: C.paper }} />
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-0.5">
        {["all", ...Object.keys(CHANGE_TYPE_LABEL)].map((t) => (
          <button key={t} onClick={() => setTypeFilter(t)} className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold"
            style={{ background: typeFilter === t ? C.navy : C.bg, color: typeFilter === t ? "#fff" : C.inkSoft, border: `1px solid ${typeFilter === t ? C.navy : C.line}` }}>
            {t === "all" ? (lang === "en" ? "All" : lang === "mr" ? "सर्व" : "सभी") : CHANGE_TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      {showForm && (
        <div className="rounded-xl p-3 mb-4 space-y-2" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={lang === "en" ? "Title" : lang === "mr" ? "शीर्षक" : "शीर्षक"}
            className="w-full rounded-lg px-3 py-2 text-xs outline-none" style={{ border: `1px solid ${C.line}`, color: C.ink }} />
          <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={3} placeholder={lang === "en" ? "What changed, and why" : lang === "mr" ? "काय बदलले, आणि का" : "क्या बदला, और क्यों"}
            className="w-full rounded-lg px-3 py-2 text-xs outline-none" style={{ border: `1px solid ${C.line}`, color: C.ink }} />
          <input value={draft.area} onChange={(e) => setDraft({ ...draft, area: e.target.value })} placeholder={lang === "en" ? "Area (e.g. Driver KYC)" : lang === "mr" ? "क्षेत्र (उदा. ड्रायव्हर KYC)" : "क्षेत्र (जैसे ड्राइवर KYC)"}
            className="w-full rounded-lg px-3 py-2 text-xs outline-none" style={{ border: `1px solid ${C.line}`, color: C.ink }} />
          <div className="flex gap-1.5 flex-wrap">
            {Object.keys(CHANGE_TYPE_LABEL).map((t) => (
              <button key={t} onClick={() => setDraft({ ...draft, type: t })} className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold"
                style={{ background: draft.type === t ? CHANGE_TYPE_COLOR[t] : C.bg, color: draft.type === t ? "#FFFFFF" : C.inkSoft, border: `1.5px solid ${CHANGE_TYPE_COLOR[t]}` }}>
                {CHANGE_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {Object.keys(BUG_SEVERITY_LABEL).map((s) => (
              <button key={s} onClick={() => setDraft({ ...draft, severity: s })} className="flex-1 rounded-lg py-2 text-[11px] font-bold"
                style={{ background: draft.severity === s ? BUG_SEVERITY_COLOR[s] : C.bg, color: draft.severity === s ? "#FFFFFF" : C.inkSoft, border: `1.5px solid ${BUG_SEVERITY_COLOR[s]}` }}>
                {BUG_SEVERITY_LABEL[s]}
              </button>
            ))}
          </div>
          <button onClick={submit} disabled={!draft.title.trim()} className="w-full rounded-lg py-2.5 text-sm font-bold"
            style={{ background: draft.title.trim() ? C.metallicGreen : "#E0E0E0", color: draft.title.trim() ? "#fff" : "#9AA3B0" }}>
            {lang === "en" ? "Save" : lang === "mr" ? "सेव्ह करा" : "सेव करें"}
          </button>
        </div>
      )}
      {sorted.length === 0 ? (
        <p className="text-xs text-center py-10" style={{ color: C.inkSoft }}>{q || typeFilter !== "all" ? (lang === "en" ? "Nothing matches." : lang === "mr" ? "काहीही जुळत नाही." : "कुछ भी मेल नहीं खाता।") : (lang === "en" ? "No changes logged yet." : lang === "mr" ? "अजून कोणताही बदल नोंदवलेला नाही." : "अभी तक कोई बदलाव दर्ज नहीं हुआ।")}</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((b) => {
            const fixed = b.status === "fixed";
            const type = b.type || "bug";
            const resolving = resolvingId === b.id || b.status === "resolving";
            return (
              <div key={b.id} className="rounded-xl p-3" style={{ background: C.paper, border: `1.5px solid ${fixed ? C.line : BUG_SEVERITY_COLOR[b.severity] || C.line}`, opacity: fixed ? 0.7 : 1 }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-bold" style={{ color: C.ink }}>{b.title}</div>
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-full shrink-0" style={{ background: resolving ? C.marigoldDeep : fixed ? C.success : (BUG_SEVERITY_COLOR[b.severity] || C.inkSoft), color: "#FFFFFF" }}>
                    {resolving ? (lang === "en" ? "RESOLVING…" : lang === "mr" ? "सोडवत आहे…" : "हल हो रहा है…") : fixed ? (lang === "en" ? "FIXED" : lang === "mr" ? "फिक्स्ड" : "फिक्स्ड") : (BUG_SEVERITY_LABEL[b.severity] || b.severity || "").toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {/* Type badge only shows while genuinely open/resolving --
                      per explicit request, it should disappear once an
                      entry is Fixed, and reappear if it's Reopened. */}
                  {!fixed && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: CHANGE_TYPE_COLOR[type] || C.inkSoft, color: "#fff" }}>{CHANGE_TYPE_LABEL[type] || type}</span>
                  )}
                  {b.area && <div className="text-[10px] font-semibold" style={{ color: C.marigoldDeep }}>{b.area}</div>}
                </div>
                {b.resolutionNote && <p className="text-[10px] italic mt-1" style={{ color: C.inkSoft }}>{b.resolutionNote}</p>}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px]" style={{ color: C.inkSoft }}>
                    {lang === "en" ? "Found" : lang === "mr" ? "सापडले" : "मिला"} {b.foundAt || "—"}{fixed && b.fixedAt ? ` · ${lang === "en" ? "Fixed" : lang === "mr" ? "फिक्स्ड" : "फिक्स्ड"} ${typeof b.fixedAt === "number" ? new Date(b.fixedAt).toISOString().slice(0, 10) : b.fixedAt}` : ""}
                  </span>
                  <div className="flex items-center gap-2">
                    {/* Manual fallback -- only shown when not fixed and not
                        mid-resolve, for exactly the case where the automated
                        Resolve (resolveChangeLogEntry -> Claude) is broken
                        (e.g. the ANTHROPIC_API_KEY/model call itself failing)
                        and the admin already knows this is genuinely fine and
                        just wants to clear it, same as before Resolve called
                        Claude at all. */}
                    {!fixed && !resolving && (
                      <button onClick={() => setBugStatus(b.id, "fixed", lang === "en" ? "Marked fixed manually by admin (automated check unavailable)." : lang === "mr" ? "अ‍ॅडमिनने मॅन्युअली फिक्स्ड मार्क केले (ऑटोमेटेड चेक उपलब्ध नाही)." : "एडमिन द्वारा मैन्युअली फिक्स्ड मार्क किया गया (ऑटोमेटेड चेक उपलब्ध नहीं)।")}
                        className="text-[10px] font-semibold underline" style={{ color: C.inkSoft }}>
                        {lang === "en" ? "Mark fixed manually" : lang === "mr" ? "मॅन्युअली फिक्स्ड मार्क करा" : "मैन्युअली फिक्स्ड मार्क करें"}
                      </button>
                    )}
                    <button onClick={() => fixed ? setBugStatus(b.id, "open") : resolve(b)} disabled={resolving} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg" style={{ background: fixed ? C.paper : C.metallicGreen, color: fixed ? C.inkSoft : "#FFFFFF", border: fixed ? `1px solid ${C.line}` : "none", opacity: resolving ? 0.6 : 1 }}>
                      {resolving
                        ? (lang === "en" ? "Resolving…" : lang === "mr" ? "सोडवत आहे…" : "हल हो रहा है…")
                        : fixed
                        ? (lang === "en" ? "Reopen" : lang === "mr" ? "पुन्हा उघडा" : "फिर से खोलें")
                        : (lang === "en" ? "Resolve" : lang === "mr" ? "सोडवा" : "हल करें")}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Percent-difference judgment between a driver's own submitted quote and
// the system's resolved rate for the same route+tier -- the guide's own
// judge() (section 9): within ±15% is a reasonable real-world quote
// (green), 15-30% off is worth a second look (amber), 30%+ is probably a
// mistake or a driver testing the form (red). Never used to adjust
// anything automatically -- purely a signal for Admin's own eyes.
function judgeRate(driverQuote, systemRate) {
  if (!systemRate) return null;
  const diff = ((driverQuote - systemRate) / systemRate) * 100;
  const a = Math.abs(diff);
  return { diff, a, cls: a <= 15 ? "ok" : a <= 30 ? "warn" : "bad" };
}
const JUDGE_COLOR = { ok: C.success, warn: C.marigoldDeep, bad: C.safety };

// The guide's own home screen (section 1): two buttons, Admin Rate
// Calculator and Saved Routes (with a live count) -- opens one or the
// other as its own full-screen sheet, same as before.
function AdminRouteFares({ routeFares, adminRouteFares, adminRouteFaresError, fareTiers, drivers, returnPct, setReturnPct, lang }) {
  const [rateCalcOpen, setRateCalcOpen] = useState(false);
  // Entry to pre-load the calculator with -- set when Saved Routes' own
  // edit action reopens this instead of editing inline.
  const [calcPrefill, setCalcPrefill] = useState(null);
  const [savedRoutesOpen, setSavedRoutesOpen] = useState(false);

  const openCalculator = (prefillEntry) => {
    setCalcPrefill(prefillEntry || null);
    setSavedRoutesOpen(false);
    setRateCalcOpen(true);
  };

  return (
    <div>
      <div className="flex items-stretch gap-2 mb-3">
        <button onClick={() => openCalculator(null)} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-3 rounded-lg" style={{ background: C.navy, color: "#fff" }}>
          <Calculator size={14} /> {lang === "en" ? "Admin Rate Calculator" : lang === "mr" ? "अ‍ॅडमिन दर कॅल्क्युलेटर" : "एडमिन रेट कैलकुलेटर"}
        </button>
        <button onClick={() => setSavedRoutesOpen(true)} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-3 rounded-lg" style={{ background: C.marigold, color: "#1a1200" }}>
          <ClipboardList size={14} /> {lang === "en" ? "Saved Routes" : lang === "mr" ? "सेव्ह केलेले रूट्स" : "सेव किए गए रूट्स"} ({(adminRouteFares || []).length})
        </button>
      </div>
      {adminRouteFaresError && (
        <div className="rounded-lg p-3 mb-3 text-xs font-bold" style={{ background: C.safety, color: "#fff" }}>
          {lang === "en"
            ? `Couldn't load saved rates (${adminRouteFaresError}). Whatever's in Firestore may be fine — this is a read failure on this device, not proof the data is missing.`
            : lang === "mr"
            ? `सेव्ह केलेले दर लोड होऊ शकले नाहीत (${adminRouteFaresError}). Firestore मध्ये डेटा असू शकतो — हे या डिव्हाइसवरील रीड फेल्युअर आहे, डेटा गहाळ असल्याचा पुरावा नाही.`
            : `सेव किए गए दर लोड नहीं हो सके (${adminRouteFaresError})। Firestore में डेटा ठीक हो सकता है — यह इस डिवाइस पर रीड फेल्योर है, डेटा गायब होने का सबूत नहीं।`}
        </div>
      )}
      {rateCalcOpen && (
        <AdminRateCalculator adminRouteFares={adminRouteFares} adminRouteFaresError={adminRouteFaresError} fareTiers={fareTiers} routeFares={routeFares} drivers={drivers} returnPct={returnPct} setReturnPct={setReturnPct} lang={lang}
          prefill={calcPrefill} onClose={() => setRateCalcOpen(false)} />
      )}
      {savedRoutesOpen && (
        <AdminSavedRoutes adminRouteFares={adminRouteFares} adminRouteFaresError={adminRouteFaresError} lang={lang}
          onEditAdminRate={openCalculator} onClose={() => setSavedRoutesOpen(false)} />
      )}
    </div>
  );
}

// Every rate Admin has hand-set via AdminRateCalculator -- one card per
// route+tier+zone+return-state (see the guide's own route identity,
// section 6/8). Tapping a card reopens the calculator pre-filled
// ("रूट अपडेट करें" there); that's still the only place a save happens.
function AdminSavedRoutes({ adminRouteFares, adminRouteFaresError, lang, onEditAdminRate, onClose }) {
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const deleteRate = (id) => { removeDoc("adminRouteFares", id).catch((e) => console.error(e)); setConfirmDeleteId(null); };
  const sorted = [...(adminRouteFares || [])].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(42,33,28,0.6)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-2xl overflow-hidden max-h-[85vh] flex flex-col" style={{ background: C.paper }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-center justify-between shrink-0" style={{ background: C.navy }}>
          <h3 className="text-sm font-bold" style={{ color: "#fff" }}>{lang === "en" ? "Saved Routes" : lang === "mr" ? "सेव्ह केलेले रूट्स" : "सेव किए गए रूट्स"}</h3>
          <button onClick={onClose} className="text-base font-bold" style={{ color: "#fff" }}>✕</button>
        </div>
        <div className="p-4 overflow-y-auto space-y-1.5">
          {adminRouteFaresError && (
            <div className="rounded-lg p-2.5 mb-2 text-[11px] font-bold" style={{ background: C.safety, color: "#fff" }}>
              {lang === "en"
                ? `Can't load saved rates right now (${adminRouteFaresError}) — this list may be showing nothing even though entries exist.`
                : lang === "mr"
                ? `सेव्ह केलेले दर आत्ता लोड होऊ शकत नाहीत (${adminRouteFaresError}) — एंट्री असूनही ही यादी काहीही दाखवत नसेल.`
                : `सेव किए गए दर अभी लोड नहीं हो सकते (${adminRouteFaresError}) — एंट्री होने के बावजूद यह लिस्ट कुछ नहीं दिखा सकती।`}
            </div>
          )}
          {sorted.length === 0 ? (
            <p className="text-xs text-center py-10" style={{ color: C.inkSoft }}>{lang === "en" ? "No route saved yet." : lang === "mr" ? "अजून कोणताही रूट सेव्ह नाही." : "अभी तक कोई रूट सेव नहीं है।"}</p>
          ) : (
            sorted.map((r) => (
              <div key={r.id} className="rounded-lg p-2.5" style={{ background: C.bg, border: `1px solid ${C.line}` }}>
                <button onClick={() => onEditAdminRate(r)} className="w-full text-left">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0" style={{ background: C.navy, color: "#fff" }}>
                      {lang === "en" ? "ADMIN SET" : lang === "mr" ? "अ‍ॅडमिन-सेट" : "एडमिन-सेट"}
                    </span>
                    <span className="text-[9px] font-bold" style={{ color: C.inkSoft }}>
                      {(r.zone || "in") === "out" ? (lang === "en" ? "Outside city" : lang === "mr" ? "शहराबाहेर" : "शहर के बाहर") : (lang === "en" ? "Inside city" : lang === "mr" ? "शहरात" : "शहर के अंदर")}
                    </span>
                  </div>
                  <div className="text-xs font-bold truncate mt-1" style={{ color: C.ink }}>{r.pickupName}</div>
                  <div className="text-xs font-bold truncate" style={{ color: C.ink }}>→ {r.dropName}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: C.inkSoft }}>
                    {r.veh ? `${r.veh} · ` : ""}{r.estimatedKm != null ? `${formatDistanceExact(r.estimatedKm, lang)} · ` : ""}<b style={{ color: C.ink }}>{fmt(r.totalFare)}</b>
                    {r.isReturn ? ` · ${lang === "en" ? "Return" : lang === "mr" ? "रिटर्न" : "रिटर्न"} −${r.returnPct || 15}%` : ""}
                    {r.manual ? ` · ${lang === "en" ? "Manual" : lang === "mr" ? "मॅन्युअल" : "मैनुअल"}` : ""}
                  </div>
                  {r.driverEntry && (
                    <div className="text-[10px] mt-0.5" style={{ color: C.marigoldDeep }}>
                      {lang === "en" ? `Driver ${r.driverEntry.mobile} quoted ${fmt(r.driverEntry.quote)}` : lang === "mr" ? `ड्रायव्हर ${r.driverEntry.mobile} ने ${fmt(r.driverEntry.quote)} भरले होते` : `ड्राइवर ${r.driverEntry.mobile} ने ${fmt(r.driverEntry.quote)} भरा था`}
                    </div>
                  )}
                </button>
                <div className="flex items-center justify-end gap-4 mt-2">
                  {confirmDeleteId === r.id ? (
                    <>
                      <button onClick={() => deleteRate(r.id)} className="text-xs font-bold px-3 py-2 rounded-lg" style={{ color: "#fff", background: C.safety }}>
                        {lang === "en" ? "Delete" : lang === "mr" ? "काढा" : "हटाएं"}
                      </button>
                      <button onClick={() => setConfirmDeleteId(null)} className="text-xs font-bold px-3 py-2 rounded-lg" style={{ color: C.inkSoft, background: C.paper, border: `1px solid ${C.line}` }}>
                        {lang === "en" ? "Cancel" : lang === "mr" ? "रद्द करा" : "रद्द करें"}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-[11px] font-bold" style={{ color: C.navy }}>{lang === "en" ? "✎ Tap to edit" : lang === "mr" ? "✎ बदलण्यासाठी दाबा" : "✎ दबाकर बदलें"}</span>
                      <button onClick={() => setConfirmDeleteId(r.id)} className="text-[11px] font-bold px-3 py-2 rounded-lg" style={{ color: C.safety, background: C.paper, border: `1px solid ${C.safety}` }}>
                        {lang === "en" ? "Remove" : lang === "mr" ? "काढा" : "हटाएं"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Admin's own rate calculator -- full port of
// admin-rate-calculator-developer-guide.md's "सारथी — एडमिन रेट
// कैलकुलेटर" (section 2's exact top-to-bottom order: return-load switch,
// inside/outside-city zone, pickup, drop, distance|vehicle, fix|per|total,
// driver-entry comparison bar, Save, Driver Entries list). A specific
// vehicle is SELECTED (full-screen picker, section 3), not typed as a
// loose weight number -- unlike CustomerBooking's customer-facing weight
// field, Admin is pricing one exact tier at a time.
function AdminRateCalculator({ adminRouteFares, adminRouteFaresError, fareTiers, routeFares, drivers, returnPct, setReturnPct, lang, prefill, onClose }) {
  // isReturn now means "the ⇅ swap button has flipped pickup/drop" -- the
  // form is calculating the RETURN-direction fare for this same pair of
  // places, not a manually-toggled discount switch (guide section 6A).
  const [isReturn, setIsReturn] = useState(false);
  // returnPct/setReturnPct come from settings/main (Firestore, see App.jsx)
  // now, not local browser storage -- every driver/customer session needs
  // to read the SAME admin-set percentage, not just this one admin device
  // (see the guide's own section 7a note that the demo's browser-storage
  // version isn't what the real app should do). pctDraft/pctEditing back
  // the inline "✎ बदलें" -> pick % -> लागू करें/रद्द करें confirm/cancel flow;
  // the app-wide returnPct itself only ever changes on an explicit "apply".
  const [pctDraft, setPctDraft] = useState(returnPct);
  const [pctEditing, setPctEditing] = useState(false);
  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [pickupCoords, setPickupCoords] = useState(null);
  const [dropCoords, setDropCoords] = useState(null);
  const [distance, setDistance] = useState(null);
  const [selectedMaxKg, setSelectedMaxKg] = useState(null);
  const [kgPickerOpen, setKgPickerOpen] = useState(false);
  const [fix, setFix] = useState("");
  const [fixTouched, setFixTouched] = useState(false);
  const [per, setPer] = useState("");
  const [perTouched, setPerTouched] = useState(false);
  const [totalFare, setTotalFare] = useState("");
  const [manual, setManual] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [editingId, setEditingId] = useState(null);
  // The driver-submitted routeFares entry currently open in this form (see
  // openDriverEntry below), if any -- drives the comparison bar and gets
  // removed from Driver Entries (promoted into a real Admin rate) on save.
  const [comparingEntry, setComparingEntry] = useState(null);
  const [driverConfirmDeleteId, setDriverConfirmDeleteId] = useState(null);
  const { isLoaded: mapsLoaded, hasKey: mapsHasKey } = useGoogleMaps();
  const mapsReady = mapsHasKey && mapsLoaded;

  useEffect(() => {
    if (!mapsReady || pickupCoords || !pickup.trim()) return;
    const t = setTimeout(() => { geocodeAddress(pickup).then((loc) => { if (loc) setPickupCoords(loc); }); }, 900);
    return () => clearTimeout(t);
  }, [pickup, pickupCoords, mapsReady]);
  useEffect(() => {
    if (!mapsReady || dropCoords || !drop.trim()) return;
    const t = setTimeout(() => { geocodeAddress(drop).then((loc) => { if (loc) setDropCoords(loc); }); }, 900);
    return () => clearTimeout(t);
  }, [drop, dropCoords, mapsReady]);
  const distanceRequestRef = useRef(0);
  useEffect(() => {
    setDistance(estimateDistanceKm(pickupCoords, dropCoords));
    const hasBothCoords = pickupCoords?.lat != null && pickupCoords?.lng != null && dropCoords?.lat != null && dropCoords?.lng != null;
    if (!hasBothCoords || !mapsReady) return;
    const requestId = ++distanceRequestRef.current;
    fetchRoadDistanceKm(pickupCoords, dropCoords)
      .then((km) => { if (distanceRequestRef.current === requestId) setDistance(Math.round(km * 100) / 100); })
      .catch((e) => console.error("[admin rate calc distance]", e));
  }, [pickupCoords, dropCoords, mapsReady]);

  const tier = selectedMaxKg != null ? fareTiers.find((t) => t.maxKg === selectedMaxKg) : null;
  // Zone is fully auto-detected now (guide section 5A's zoneFor, the same
  // city-list logic a real booking resolves with) -- no more manual
  // inside/outside toggle for Admin to get wrong or forget to flip.
  const zone = zoneFor(pickupCoords?.lat, pickupCoords?.lng, dropCoords?.lat, dropCoords?.lng, distance);

  // A fresh route/tier/zone context lets new suggestions apply again --
  // same intent as the guide's own matchOff/manual resets on every pickup/
  // drop/zone keystroke, simplified into per-field "touched" flags.
  useEffect(() => {
    setFixTouched(false); setPerTouched(false); setManual(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMaxKg, zone, pickup, drop, isReturn]);

  // (क) an exact Admin rate already saved for this tier+route+zone+return →
  // (ख) the averaged scale ratio from Admin rates on OTHER tiers of this
  // same route → (ग) the tier's own master-formula default. Same 3-layer
  // order resolveFareForCapacity uses for real bookings (see App.jsx) --
  // this calculator's "suggestion" should never silently disagree with
  // what a customer is actually being quoted right now.
  const exactMatch = tier && pickup.trim() && drop.trim()
    ? findExactAdminRoute(pickup, drop, tier.maxKg, zone, isReturn, adminRouteFares, pickupCoords?.lat, pickupCoords?.lng, dropCoords?.lat, dropCoords?.lng)
    : null;
  const scaleRatio = tier && pickup.trim() && drop.trim() && !exactMatch
    ? getRouteScaleRatio(pickup, drop, zone, isReturn, adminRouteFares, fareTiers)
    : null;
  const suggestionSource = exactMatch ? "admin" : scaleRatio != null ? "scaled" : "formula";

  const baseFix = tier ? (zone === "out" ? tier.outerMin : tier.innerFix) : null;
  const basePer = tier ? (zone === "out" ? tier.outerPer : tier.innerPer) : null;
  const suggestedFix = exactMatch ? (exactMatch.fix ?? null)
    : (scaleRatio != null && baseFix != null ? Math.round(baseFix * scaleRatio / 10) * 10 : baseFix);
  const suggestedPer = exactMatch ? exactMatch.per
    : (scaleRatio != null && basePer != null ? Math.round(basePer * scaleRatio * 2) / 2 : basePer);
  useEffect(() => {
    if (!fixTouched) setFix(suggestedFix != null ? String(suggestedFix) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedFix, fixTouched]);
  useEffect(() => {
    if (!perTouched) setPer(suggestedPer != null ? String(suggestedPer) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedPer, perTouched]);

  const km = distance || 0;
  const fixNum = Number(fix) || 0, perNum = Number(per) || 0;
  // Same uniform formula as calculateFare (App.jsx) now -- every vehicle,
  // light or heavy, uses fix/min + per km, with the 30km floor guard and
  // toll surcharge applied outside city. The guard and toll stay tied to
  // the tier's own defaults (never Admin-overridable here), exactly like
  // calculateFare; only fix/per themselves can be overridden per route.
  const c30Guard = tier ? tier.innerFix + 27 * tier.innerPer : 0;
  const computedTotal = tier && km > 0
    ? (zone === "out" ? Math.max(km * perNum, fixNum, c30Guard) + km * tier.tollPerKm : fixNum + Math.max(0, km - 3) * perNum)
    : null;
  // isReturn means the ⇅ swap has flipped this into the return direction --
  // the return-load discount only ever applies on that side, never the
  // regular-direction fare (guide section 6A/7).
  const suggestedTotal = computedTotal != null
    ? Math.round(isReturn && returnPct > 0 ? computedTotal * (1 - returnPct / 100) : computedTotal)
    : null;
  useEffect(() => {
    if (!manual) setTotalFare(suggestedTotal != null ? String(suggestedTotal) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedTotal, manual]);

  const resetForm = () => {
    setPickup(""); setDrop(""); setPickupCoords(null); setDropCoords(null); setDistance(null);
    setSelectedMaxKg(null); setIsReturn(false); setPctEditing(false);
    setFix(""); setFixTouched(false); setPer(""); setPerTouched(false);
    setTotalFare(""); setManual(false);
    setEditingId(null); setComparingEntry(null); setSaveError("");
  };
  const editEntry = (r) => {
    setSaveError(""); setPctEditing(false);
    setPickup(r.pickupName || ""); setDrop(r.dropName || "");
    setPickupCoords(r.pickupLat != null ? { lat: r.pickupLat, lng: r.pickupLng } : null);
    setDropCoords(r.dropLat != null ? { lat: r.dropLat, lng: r.dropLng } : null);
    setDistance(r.estimatedKm ?? null);
    setSelectedMaxKg(r.tierMaxKg ?? null);
    setIsReturn(!!r.isReturn);
    if (r.returnPct) setReturnPct(r.returnPct);
    setFix(r.fix != null ? String(r.fix) : ""); setFixTouched(true);
    setPer(r.per != null ? String(r.per) : ""); setPerTouched(true);
    setTotalFare(r.totalFare != null ? String(r.totalFare) : ""); setManual(true);
    setEditingId(r.id);
    setComparingEntry(null);
    setSavedFlash(false);
  };
  useEffect(() => {
    if (prefill) editEntry(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Driver-submitted "Set Fare" entries (see SetFareForm) not yet promoted
  // into a real Admin rate -- reference data Admin reviews against the
  // system's own resolved rate for that same route+tier (judgeRate below).
  const driverEntries = [...(routeFares || [])].sort((a, b) => (b.updatedAt || a.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  const stdRateFor = (entry) => {
    const capacityKg = entry.capacityKg ?? (drivers || []).find((d) => d.mobile === entry.driverMobile)?.vehicleSpec?.capacityKg ?? null;
    if (capacityKg == null) return null;
    const entryTier = findFareTier(capacityKg, fareTiers);
    // routeFares entries carry no zone of their own -- resolve it the same
    // way a live customer booking would (zoneFor, App.jsx).
    const entryZone = zoneFor(entry.pickupLat, entry.pickupLng, entry.dropLat, entry.dropLng, entry.estimatedKm);
    const exact = findExactAdminRoute(entry.pickupName, entry.dropName, entryTier.maxKg, entryZone, false, adminRouteFares, entry.pickupLat, entry.pickupLng, entry.dropLat, entry.dropLng);
    if (exact) return Number(exact.totalFare) || null;
    const ratio = getRouteScaleRatio(entry.pickupName, entry.dropName, entryZone, false, adminRouteFares, fareTiers);
    const formulaFare = calculateFare(entryTier.maxKg, entry.estimatedKm, fareTiers, entryZone, 0);
    return ratio != null ? Math.round(formulaFare * ratio) : formulaFare;
  };
  const openDriverEntry = (r) => {
    setSaveError(""); setEditingId(null);
    setComparingEntry(r);
    const capacityKg = r.capacityKg ?? (drivers || []).find((d) => d.mobile === r.driverMobile)?.vehicleSpec?.capacityKg ?? null;
    const entryTier = capacityKg != null ? findFareTier(capacityKg, fareTiers) : null;
    setSelectedMaxKg(entryTier ? entryTier.maxKg : null);
    setIsReturn(false); setPctEditing(false);
    setPickup(r.pickupName || ""); setDrop(r.dropName || "");
    setPickupCoords(r.pickupLat != null ? { lat: r.pickupLat, lng: r.pickupLng } : null);
    setDropCoords(r.dropLat != null ? { lat: r.dropLat, lng: r.dropLng } : null);
    setDistance(r.estimatedKm ?? null);
    setSavedFlash(false);
  };
  const deleteDriverEntry = (id) => { removeDoc("routeFares", id).catch((e) => console.error(e)); setDriverConfirmDeleteId(null); };

  const locationResolved = !mapsReady || (pickupCoords != null && dropCoords != null);
  const canSave = pickup.trim() && drop.trim() && tier && totalFare !== "" && !saving && locationResolved;
  const save = async () => {
    if (!canSave) return;
    setSaving(true); setSaveError("");
    const docId = `${sanitizeForDocId(pickup)}__${sanitizeForDocId(drop)}__${tier.maxKg}__${zone}${isReturn ? "__ret" : ""}`;
    try {
      await createDoc("adminRouteFares", docId, {
        pickupName: pickup.trim(), dropName: drop.trim(),
        pickupKey: normalizeRouteText(pickup), dropKey: normalizeRouteText(drop),
        pickupLat: pickupCoords?.lat ?? null, pickupLng: pickupCoords?.lng ?? null,
        dropLat: dropCoords?.lat ?? null, dropLng: dropCoords?.lng ?? null,
        estimatedKm: distance,
        tierMaxKg: tier.maxKg,
        veh: tier.label,
        zone,
        fix: fix !== "" ? Number(fix) || 0 : 0,
        per: Number(per) || 0,
        totalFare: Number(totalFare) || 0,
        manual,
        isReturn,
        returnPct: isReturn ? returnPct : null,
        driverEntry: comparingEntry ? { mobile: comparingEntry.driverMobile, quote: comparingEntry.totalFare } : null,
        updatedAt: Date.now(),
      });
      // docId is derived fresh from the CURRENT route/tier/zone/return --
      // if Admin edited an existing entry's route text, tier, zone, or
      // return state enough to shift which doc this is, the old doc no
      // longer matches and would otherwise be left behind as an orphan.
      if (editingId && editingId !== docId) {
        await removeDoc("adminRouteFares", editingId).catch((e) => console.error("[stale admin rate cleanup]", e));
      }
      if (comparingEntry) {
        await removeDoc("routeFares", comparingEntry.id).catch((e) => console.error("[promote driver entry cleanup]", e));
      }
      resetForm();
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (e) {
      console.error(e);
      setSaveError(describeAdminRateSaveError(e, lang));
    }
    setSaving(false);
  };

  const comparingJudge = comparingEntry && totalFare !== "" ? judgeRate(Number(comparingEntry.totalFare) || 0, Number(totalFare) || 0) : null;

  // ⇅ -- flips pickup and drop (and their resolved coords) in place and
  // toggles isReturn, so the form now computes/saves the RETURN-direction
  // fare for this same pair of places (guide section 6A). Distance and
  // zone are symmetric either way, so nothing else needs to change.
  const swapRoute = () => {
    setPickup(drop); setDrop(pickup);
    setPickupCoords(dropCoords); setDropCoords(pickupCoords);
    setIsReturn((v) => !v); setPctEditing(false);
    setSavedFlash(false); setSaveError("");
  };

  // Light/medium group stays in ascending-maxKg order (natural small-to-
  // large reading order); the heavy group is re-sorted by its own base
  // rate, ascending -- the guide's own display rule (section 4): a
  // vehicle with less actual payload but a bigger box (e.g. the 32ft SXL
  // container) costs more than some heavier-payload options, so showing
  // it by weight alone would look out of order next to its own price.
  const lightTiers = fareTiers.filter((t) => !t.heavy);
  const heavyTiers = [...fareTiers.filter((t) => t.heavy)].sort((a, b) => a.innerFix - b.innerFix);

  const RETURN_PCTS = [5, 10, 15, 20, 25, 30, 35];
  const inputCls = "w-full rounded-lg p-2.5 text-sm font-bold outline-none";
  const inputStyle = { background: C.bg, border: `1px solid ${C.line}`, color: C.ink };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(42,33,28,0.6)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-2xl overflow-hidden max-h-[85vh] flex flex-col relative" style={{ background: C.paper }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-center justify-between shrink-0" style={{ background: C.navy }}>
          <h3 className="text-sm font-bold" style={{ color: "#fff" }}>{lang === "en" ? "Admin Rate Calculator" : lang === "mr" ? "अ‍ॅडमिन दर कॅल्क्युलेटर" : "एडमिन रेट कैलकुलेटर"}</h3>
          <button onClick={onClose} className="text-base font-bold" style={{ color: "#fff" }}>✕</button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          {editingId && (
            <div className="rounded-lg p-2.5 flex items-center justify-between gap-2 text-xs font-bold" style={{ background: C.marigoldSoft || "#FFEADB", border: `1.5px solid ${C.marigoldDeep}`, color: C.marigoldDeep }}>
              <span>✎ {lang === "en" ? "Editing a saved route" : lang === "mr" ? "सेव्ह रूट बदलत आहात" : "सेव रूट बदल रहे हैं"}</span>
              <button onClick={resetForm} className="rounded-full px-3 py-1" style={{ border: `1.5px solid ${C.marigoldDeep}`, background: C.paper }}>{lang === "en" ? "Cancel" : lang === "mr" ? "रद्द करा" : "रद्द करें"}</button>
            </div>
          )}

          {/* Pickup/drop + ⇅ swap -- section 6A. Swapping flips both fields
              in place and marks the form as computing the RETURN-direction
              fare for this same pair of places; saving while swapped tags
              a distinct "Return Load" route (save()'s __ret doc id) that
              never touches the regular-direction rate. */}
          <div className="flex items-stretch gap-2">
            <div className="flex-1 grid gap-2">
              <LocationField lang={lang} value={pickup}
                onChange={(e) => { setPickup(e.target.value); setPickupCoords(null); setSavedFlash(false); setSaveError(""); }}
                onPlaceSelected={(p) => { setPickup(p.name); setPickupCoords({ lat: p.lat, lng: p.lng }); setSavedFlash(false); setSaveError(""); }}
                mapsReady={mapsReady}
                placeholder={lang === "en" ? "Pickup" : lang === "mr" ? "पिकअप" : "पिकअप"} />
              <LocationField lang={lang} value={drop}
                onChange={(e) => { setDrop(e.target.value); setDropCoords(null); setSavedFlash(false); setSaveError(""); }}
                onPlaceSelected={(p) => { setDrop(p.name); setDropCoords({ lat: p.lat, lng: p.lng }); setSavedFlash(false); setSaveError(""); }}
                mapsReady={mapsReady}
                placeholder={lang === "en" ? "Drop" : lang === "mr" ? "ड्रॉप" : "ड्रॉप"} />
            </div>
            <button type="button" onClick={swapRoute} title={lang === "en" ? "Swap for return load" : lang === "mr" ? "रिटर्न लोडसाठी स्वॅप करा" : "रिटर्न लोड के लिए स्वैप करें"}
              className="shrink-0 w-11 rounded-xl flex items-center justify-center text-lg font-black"
              style={{ background: isReturn ? C.success : C.navy, color: "#fff" }}>⇅</button>
          </div>

          {/* Zone is fully auto-detected (zoneFor, same as a real booking)
              -- no manual inside/outside toggle for Admin to forget. */}
          <div className="rounded-xl px-3.5 py-2.5 flex items-center justify-between" style={{ border: `1.5px solid ${C.line}`, background: C.bg }}>
            <span className="text-xs font-bold" style={{ color: C.inkSoft }}>{lang === "en" ? "Zone (auto)" : lang === "mr" ? "झोन (ऑटो)" : "ज़ोन (ऑटो)"}</span>
            <span className="text-xs font-black px-2.5 py-1 rounded-full" style={{ color: "#fff", background: zone === "out" ? C.marigoldDeep : C.navy }}>
              {zone === "out" ? (lang === "en" ? "Outside City" : lang === "mr" ? "शहराबाहेर" : "शहर के बाहर") : (lang === "en" ? "Inside City" : lang === "mr" ? "शहरात" : "शहर के अंदर")}
            </span>
          </div>

          {/* Return-load fare panel -- only shown once ⇅ has flipped this
              into the return direction. "✎ बदलें" opens the % picker inline;
              returnPct (app-wide, Firestore-backed) only changes on the
              explicit "लागू करें", never just by picking a pill (section 7b). */}
          {isReturn && (
            <div className="rounded-2xl overflow-hidden" style={{ border: `1.5px solid ${C.success}` }}>
              <div className="px-3.5 py-2.5" style={{ background: "rgba(63,122,84,0.1)" }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-bold" style={{ color: C.success }}>
                    {lang === "en" ? `Return fare (${returnPct}% less)` : lang === "mr" ? `रिटर्न भाडे (${returnPct}% कमी)` : `रिटर्न भाड़ा (${returnPct}% कम)`}
                  </div>
                  <button type="button" onClick={() => { setPctDraft(returnPct); setPctEditing((v) => !v); }} className="text-xs font-bold shrink-0" style={{ color: C.navy }}>
                    ✎ {lang === "en" ? "Change" : lang === "mr" ? "बदला" : "बदलें"}
                  </button>
                </div>
                {pctEditing && (
                  <div className="grid gap-2 mt-2 pt-2" style={{ borderTop: `1.5px dashed ${C.success}` }}>
                    <div className="grid grid-cols-4 gap-1.5">
                      {RETURN_PCTS.map((v) => (
                        <button key={v} type="button" onClick={() => setPctDraft(v)} className="rounded-lg py-1.5 text-xs font-black"
                          style={{ border: `1.5px solid ${C.line}`, background: pctDraft === v ? C.success : C.paper, color: pctDraft === v ? "#fff" : C.ink }}>
                          {v}%
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setPctEditing(false)} className="rounded-lg py-1.5 text-xs font-bold" style={{ border: `1.5px solid ${C.line}`, color: C.inkSoft, background: C.paper }}>
                        {lang === "en" ? "Cancel" : lang === "mr" ? "रद्द करा" : "रद्द करें"}
                      </button>
                      <button type="button" onClick={() => { setReturnPct(pctDraft); setPctEditing(false); }} className="rounded-lg py-1.5 text-xs font-bold" style={{ background: C.success, color: "#fff" }}>
                        {lang === "en" ? "Apply" : lang === "mr" ? "लागू करा" : "लागू करें"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {computedTotal != null && suggestedTotal != null && (
                <div className="px-3.5 py-2 flex items-center justify-between gap-1.5 text-[11px] font-bold" style={{ color: C.ink, background: C.paper, fontFamily: monoFont }}>
                  <span>{lang === "en" ? "Going" : lang === "mr" ? "जाणे" : "जाना"} {fmt(computedTotal)}</span>
                  <span style={{ color: C.success }}>{lang === "en" ? "Return" : lang === "mr" ? "रिटर्न" : "रिटर्न"} {fmt(suggestedTotal)}</span>
                  <span style={{ color: C.inkSoft }}>{lang === "en" ? "Diff" : lang === "mr" ? "फरक" : "फ़र्क़"} −{fmt(computedTotal - suggestedTotal)}</span>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] font-bold mb-1" style={{ color: C.inkSoft }}>{lang === "en" ? "Estimated distance" : lang === "mr" ? "अंदाजे अंतर" : "अनुमानित दूरी"}</div>
              <div className="rounded-lg p-2.5 text-sm font-black" style={{ background: C.bg, border: `1px solid ${C.line}`, color: C.ink, fontFamily: monoFont }}>
                {!pickup.trim() || !drop.trim() ? "—" : distance !== null ? formatDistanceExact(distance, lang) : (lang === "en" ? "Calculating..." : lang === "mr" ? "गणना होत आहे..." : "गणना हो रही है...")}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-bold mb-1" style={{ color: C.inkSoft }}>{lang === "en" ? "Weight / Vehicle" : lang === "mr" ? "वजन / गाडी" : "वजन / गाड़ी चुनें"}</div>
              <button type="button" onClick={() => setKgPickerOpen(true)}
                className={`${inputCls} flex items-center justify-between gap-2 text-left ${!tier ? "animate-pulse" : ""}`}
                style={{ ...inputStyle, borderColor: tier ? C.navy : C.marigoldDeep, background: tier ? C.bg : "rgba(239,108,26,0.08)" }}>
                {tier ? (
                  <span className="min-w-0">
                    <span className="block font-black truncate">{tier.weightLabel}</span>
                    <span className="block text-[11px] font-semibold truncate" style={{ color: C.inkSoft }}>{tier.label}</span>
                  </span>
                ) : (
                  <span style={{ color: C.marigoldDeep }}>{lang === "en" ? "Choose vehicle" : lang === "mr" ? "गाडी निवडा" : "गाड़ी चुनें"}</span>
                )}
                <span style={{ color: C.inkSoft }}>▾</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 items-end">
            <div>
              <div className="text-[11px] font-bold mb-1 min-h-[28px] flex items-end" style={{ color: C.inkSoft }}>
                {zone === "out" ? (lang === "en" ? "Minimum charge" : lang === "mr" ? "मिनिमम चार्ज" : "मिनिमम चार्ज") : (lang === "en" ? "1–3 km Fixed Rate" : lang === "mr" ? "1–3 किमी फिक्स्ड दर" : "1–3 किमी फिक्स्ड दर")}
              </div>
              <input type="number" inputMode="numeric" value={fix}
                onChange={(e) => { setFix(e.target.value); setFixTouched(true); setManual(false); setSavedFlash(false); setSaveError(""); }}
                className={inputCls} style={{ ...inputStyle, fontWeight: 700 }} placeholder={lang === "en" ? "e.g. 250" : "उदा. 250"} />
            </div>
            <div>
              <div className="text-[11px] font-bold mb-1 min-h-[28px] flex items-end" style={{ color: C.inkSoft }}>{lang === "en" ? "Extra Rate/km" : lang === "mr" ? "जास्त दर/किमी" : "एक्स्ट्रा दर/किमी"}</div>
              <input type="number" inputMode="numeric" value={per}
                onChange={(e) => { setPer(e.target.value); setPerTouched(true); setManual(false); setSavedFlash(false); setSaveError(""); }}
                className={inputCls} style={inputStyle} placeholder={lang === "en" ? "e.g. 25" : "उदा. 25"} />
            </div>
            <div>
              <div className="text-[11px] font-bold mb-1 min-h-[28px] flex items-end" style={{ color: C.inkSoft }}>{lang === "en" ? "Rate for this route" : lang === "mr" ? "या रूटसाठी दर" : "इस रूट के लिए दर"}</div>
              <input type="number" inputMode="numeric" value={totalFare}
                onChange={(e) => { setTotalFare(e.target.value); setManual(true); setSavedFlash(false); setSaveError(""); }}
                className={inputCls} style={{ ...inputStyle, borderColor: manual ? C.marigoldDeep : C.navy, background: manual ? "rgba(239,108,26,0.08)" : "rgba(21,89,214,0.08)", color: manual ? C.marigoldDeep : C.navy, fontWeight: 800 }}
                placeholder={lang === "en" ? "Rate" : lang === "mr" ? "दर" : "दर"} />
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px]" style={{ color: C.inkSoft }}>
            {manual ? (
              <>
                <span>{lang === "en" ? "Manual rate" : lang === "mr" ? "मॅन्युअल दर" : "मैनुअल दर"}</span>
                <button onClick={() => setManual(false)} style={{ color: C.navy, fontWeight: 700 }}>↺ {lang === "en" ? "Use auto rate" : lang === "mr" ? "ऑटो दर वापरा" : "अपने आप वाली दर"}</button>
              </>
            ) : suggestionSource === "admin" ? (
              <span style={{ color: C.safety }}>⚠ {lang === "en" ? "Already live as an Admin rate — saving now just re-confirms it" : lang === "mr" ? "आधीच अ‍ॅडमिन दर म्हणून लाइव्ह आहे — सेव्ह केल्यास तेच पुन्हा कन्फर्म होईल" : "पहले से एडमिन दर के रूप में लाइव है — अभी सेव करने से यह वही दोबारा कन्फर्म होगा"}</span>
            ) : suggestionSource === "scaled" ? (
              <span style={{ color: C.marigoldDeep }}>{lang === "en" ? "Scaled from Admin rates on other vehicles of this route" : lang === "mr" ? "या रूटवरील इतर गाड्यांच्या अ‍ॅडमिन दरावरून काढलेला दर" : "इस रूट की दूसरी गाड़ियों के एडमिन दर से निकाला गया दर"}</span>
            ) : (
              <span style={{ color: C.inkSoft }}>{lang === "en" ? "System formula — no Admin rate set for this route yet" : lang === "mr" ? "सिस्टम फॉर्म्युला — या रूटसाठी अजून अ‍ॅडमिन दर नाही" : "सिस्टम फॉर्मूला — इस रूट के लिए अभी तक एडमिन दर नहीं है"}</span>
            )}
          </div>

          {/* Toll surcharge (guide section 5C) -- fixed per vehicle class,
              outside city only, never Admin-editable here, always added on
              top of fix/min+per. Shown so the total's composition is clear. */}
          {zone === "out" && tier && tier.tollPerKm > 0 && km > 0 && (
            <div className="flex items-center justify-between text-[11px] font-bold rounded-lg px-2.5 py-1.5" style={{ color: C.inkSoft, background: C.bg, border: `1px solid ${C.line}` }}>
              <span>{lang === "en" ? `Toll included (₹${tier.tollPerKm}/km)` : lang === "mr" ? `टोल समाविष्ट (₹${tier.tollPerKm}/किमी)` : `टोल शामिल (₹${tier.tollPerKm}/किमी)`}</span>
              <span style={{ fontFamily: monoFont }}>+{fmt(Math.round(km * tier.tollPerKm))}</span>
            </div>
          )}

          {comparingEntry && comparingJudge && (
            <div className="rounded-xl px-3 py-2.5 flex items-center gap-2.5" style={{ background: `${JUDGE_COLOR[comparingJudge.cls]}1A`, border: `1.5px solid ${JUDGE_COLOR[comparingJudge.cls]}` }}>
              <span className="text-base font-black shrink-0" style={{ color: JUDGE_COLOR[comparingJudge.cls] }}>{comparingJudge.diff >= 0 ? "+" : "−"}{comparingJudge.a.toFixed(0)}%</span>
              <span className="text-xs font-semibold flex-1 min-w-0 truncate" style={{ color: C.ink }}>
                {comparingJudge.cls === "ok" ? (lang === "en" ? "Fair rate" : lang === "mr" ? "योग्य दर" : "सही भाड़ा") : comparingJudge.cls === "warn" ? (lang === "en" ? "A bit off" : lang === "mr" ? "थोडा फरक" : "थोड़ा फ़र्क़") : (lang === "en" ? "Way off" : lang === "mr" ? "खूप फरक" : "बहुत फ़र्क़")}
                {" · "}{lang === "en" ? "Driver" : lang === "mr" ? "ड्रायव्हर" : "ड्राइवर"} <b>{fmt(comparingEntry.totalFare)}</b> · {lang === "en" ? "Route" : lang === "mr" ? "रूट" : "रूट"} <b>{fmt(Number(totalFare) || 0)}</b>
              </span>
              <button onClick={() => setComparingEntry(null)} style={{ color: C.inkSoft }}>✕</button>
            </div>
          )}

          {adminRouteFaresError && (
            <div className="rounded-lg p-2.5 text-[11px] font-bold" style={{ background: C.safety, color: "#fff" }}>
              {lang === "en"
                ? `Can't load saved rates right now (${adminRouteFaresError}) — the suggestion above may be wrong.`
                : lang === "mr"
                ? `सेव्ह केलेले दर आत्ता लोड होऊ शकत नाहीत (${adminRouteFaresError}) — वरचे सुचवलेले दर चुकीचे असू शकते.`
                : `सेव किए गए दर अभी लोड नहीं हो सकते (${adminRouteFaresError}) — ऊपर सुझाई गई दर गलत हो सकती है।`}
            </div>
          )}

          <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: C.line }}>
            <div className="text-sm font-bold" style={{ color: C.ink }}>{lang === "en" ? "Driver Entries" : lang === "mr" ? "ड्रायव्हर एंट्री" : "ड्राइवर एंट्री"}</div>
            <div className="text-sm font-black" style={{ color: C.marigoldDeep }}>{driverEntries.length}</div>
          </div>
          <div className="text-[11px]" style={{ color: C.inkSoft, marginTop: -8 }}>
            {lang === "en" ? "Tap an entry — it fills the form above and shows how close it is to the resolved rate." : lang === "mr" ? "एंट्री दाबा — वरील फॉर्ममध्ये भरेल आणि दर किती जुळतो ते दाखवेल." : "एंट्री दबाएँ — ऊपर इसी फॉर्म में भर जाएगी और दिखेगा कि दर कितना मिलता है।"}
          </div>
          {driverEntries.length === 0 ? (
            <div className="text-xs text-center rounded-xl py-6" style={{ color: C.inkSoft, border: `1.5px dashed ${C.line}` }}>
              {lang === "en" ? "All driver entries checked ✓ — they're now in Saved Routes." : lang === "mr" ? "सर्व ड्रायव्हर एंट्री चेक झाल्या ✓ — त्या आता Saved Routes मध्ये आहेत." : "सभी ड्राइवर एंट्री चेक हो गईं ✓ — ये अब Saved Routes में हैं।"}
            </div>
          ) : (
            <div className="space-y-2">
              {driverEntries.map((r) => {
                const std = stdRateFor(r);
                const j = std ? judgeRate(Number(r.totalFare) || 0, std) : null;
                const isActive = comparingEntry?.id === r.id;
                return (
                  <div key={r.id} className="rounded-xl p-2.5" style={{ background: C.bg, border: `${isActive ? 2 : 1}px solid ${isActive ? C.navy : C.line}` }}>
                    <button onClick={() => openDriverEntry(r)} className="w-full text-left flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold truncate" style={{ color: C.ink }}>{r.pickupName} → {r.dropName}</div>
                        <div className="text-[10px] truncate" style={{ color: C.inkSoft, fontFamily: monoFont }}>
                          {r.driverMobile} · {r.estimatedKm != null ? formatDistanceExact(r.estimatedKm, lang) : "—"}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-black" style={{ color: C.ink }}>{fmt(r.totalFare)}</div>
                        {j && <div className="text-[10px] font-bold" style={{ color: JUDGE_COLOR[j.cls] }}>{j.diff >= 0 ? "+" : ""}{j.diff.toFixed(0)}%</div>}
                      </div>
                    </button>
                    <div className="flex items-center justify-end gap-3 mt-1.5">
                      {driverConfirmDeleteId === r.id ? (
                        <>
                          <button onClick={() => deleteDriverEntry(r.id)} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg" style={{ color: "#fff", background: C.safety }}>{lang === "en" ? "Delete" : lang === "mr" ? "काढा" : "हटाएं"}</button>
                          <button onClick={() => setDriverConfirmDeleteId(null)} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg" style={{ color: C.inkSoft, background: C.paper, border: `1px solid ${C.line}` }}>{lang === "en" ? "Cancel" : lang === "mr" ? "रद्द करा" : "रद्द करें"}</button>
                        </>
                      ) : (
                        <button onClick={() => setDriverConfirmDeleteId(r.id)} className="text-[11px] font-bold" style={{ color: C.safety }}>{lang === "en" ? "Remove" : lang === "mr" ? "काढा" : "हटाएं"}</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="px-4 pt-3 shrink-0" style={{ borderTop: `1px solid ${C.line}`, background: C.paper, paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
          {!locationResolved && pickup.trim() && drop.trim() && (
            <div className="text-[11px] font-semibold text-center mb-1.5" style={{ color: C.marigoldDeep }}>
              {lang === "en" ? "Resolving exact location — wait a moment before saving" : lang === "mr" ? "नेमके ठिकाण शोधले जात आहे — सेव्ह करण्यापूर्वी थोडे थांबा" : "सटीक स्थान खोजा जा रहा है — सेव करने से पहले थोड़ा रुकें"}
            </div>
          )}
          <button onClick={save} disabled={!canSave} className="w-full rounded-lg py-3 font-bold text-sm"
            style={{ background: canSave ? C.success : "#E0E0E0", color: canSave ? "#fff" : "#9AA3B0" }}>
            {saving ? "…" : editingId ? (lang === "en" ? "Update Route" : lang === "mr" ? "रूट अपडेट करा" : "रूट अपडेट करें") : (lang === "en" ? "Save Rate" : lang === "mr" ? "दर सेव्ह करा" : "दर सेव करें")}
          </button>
          {savedFlash && (
            <div className="rounded-lg p-2 mt-2 text-xs font-bold text-center" style={{ background: C.success, color: "#fff" }}>
              {lang === "en" ? "Saved." : lang === "mr" ? "सेव्ह झाले." : "सेव हो गया।"}
            </div>
          )}
          {saveError && (
            <div className="rounded-lg p-2 mt-2 text-xs font-bold text-center" style={{ background: C.safety, color: "#fff" }}>
              {saveError}
            </div>
          )}
        </div>

        {/* Full-screen vehicle picker (section 3) -- deliberately NOT a
            native <select>, which shows an empty-circle placeholder the
            guide explicitly calls out to avoid. Covers this whole sheet,
            not just its own body, same as the guide's own kgpage. */}
        {kgPickerOpen && (
          <div className="absolute inset-0 z-10 flex flex-col" style={{ background: C.paper }}>
            <div className="px-5 py-4 flex items-center justify-between shrink-0" style={{ background: C.navy }}>
              <h3 className="text-sm font-bold" style={{ color: "#fff" }}>{lang === "en" ? "Weight / Vehicle" : lang === "mr" ? "वजन / गाडी निवडा" : "वजन / गाड़ी चुनें"}</h3>
              <button onClick={() => setKgPickerOpen(false)} className="text-base font-bold" style={{ color: "#fff" }}>✕</button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-1.5">
              <div className="rounded-lg px-3 py-2 text-xs font-black" style={{ background: C.navySoft || "rgba(21,89,214,0.1)", color: C.navy, border: `1.5px solid ${C.navy}` }}>
                {lang === "en" ? "Light/Medium: Fixed (1-3km) + per km" : lang === "mr" ? "लोकल/मीडियम: बेस (1-3 km) + किमी" : "लोकल/मीडियम: बेस (1–3 km) + किमी"}
              </div>
              {lightTiers.map((t) => (
                <button key={t.maxKg} onClick={() => { setSelectedMaxKg(t.maxKg); setKgPickerOpen(false); }}
                  className="w-full text-left rounded-lg p-2.5 grid gap-0.5" style={{ border: `${selectedMaxKg === t.maxKg ? 2 : 1.5}px solid ${selectedMaxKg === t.maxKg ? C.navy : C.line}`, background: selectedMaxKg === t.maxKg ? "rgba(21,89,214,0.08)" : C.bg }}>
                  <span className="text-sm font-black" style={{ color: C.ink, fontFamily: monoFont }}>{t.weightLabel}</span>
                  <span className="text-xs font-semibold" style={{ color: C.inkSoft }}>{t.label}</span>
                </button>
              ))}
              <div className="rounded-lg px-3 py-2 text-xs font-black mt-2" style={{ background: "rgba(239,108,26,0.1)", color: C.marigoldDeep, border: `1.5px solid ${C.marigoldDeep}` }}>
                {lang === "en" ? "Heavy/Outstation: same formula, bigger rates + toll" : lang === "mr" ? "हेवी/आउटस्टेशन: तोच फॉर्म्युला, मोठे दर + टोल" : "हेवी/आउटस्टेशन: वही फॉर्मूला, बड़े दर + टोल"}
              </div>
              {heavyTiers.map((t) => (
                <button key={t.maxKg} onClick={() => { setSelectedMaxKg(t.maxKg); setKgPickerOpen(false); }}
                  className="w-full text-left rounded-lg p-2.5 grid gap-0.5" style={{ border: `${selectedMaxKg === t.maxKg ? 2 : 1.5}px solid ${selectedMaxKg === t.maxKg ? C.navy : C.line}`, background: selectedMaxKg === t.maxKg ? "rgba(21,89,214,0.08)" : C.bg }}>
                  <span className="text-sm font-black" style={{ color: C.ink, fontFamily: monoFont }}>{t.weightLabel}</span>
                  <span className="text-xs font-semibold" style={{ color: C.inkSoft }}>{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminAlerts({ alerts, replyToAlert, withdrawals, approveWithdrawal, rechargeRequests, approveRecharge, lang }) {
  const roleLabel = lang === "en" ? { customer: "Customer", driver: "Driver" } : lang === "mr" ? { customer: "ग्राहक", driver: "ड्रायव्हर" } : { customer: "ग्राहक", driver: "ड्राइवर" };
  // Draft reply text per complaint id, so opening one complaint's reply box
  // doesn't touch any other's. Prefilled with the existing adminReply (if
  // any) so re-opening shows what was already sent, editable in place.
  const [replyDrafts, setReplyDrafts] = useState({});
  const [openReplyId, setOpenReplyId] = useState(null);
  const sendReply = (a) => {
    const text = (replyDrafts[a.id] ?? a.adminReply ?? "").trim();
    if (!text) return;
    replyToAlert?.(a.id, text);
    setOpenReplyId(null);
  };
  const pendingWithdrawals = (withdrawals || []).filter((w) => w.status === "Pending");
  const pendingRecharges = (rechargeRequests || []).filter((r) => r.status === "Pending");
  // Docs only ever get a createdAt (server timestamp) — there's no separate
  // "time" field — so format that instead of the undefined w.time/r.time/a.time
  // this used to read (which is why timestamps never actually showed up).
  const formatTime = (createdAt) => (createdAt?.toDate ? createdAt.toDate().toLocaleString(lang === "en" ? "en-IN" : lang === "mr" ? "mr-IN" : "hi-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
  return (
    <div className="space-y-4">
      {pendingRecharges.length > 0 && (
        <div className="rounded-xl p-4 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          <div className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: C.ink }}><Wallet size={16} color={C.marigoldDeep} /> {lang === "en" ? "Wallet Recharge Requests" : lang === "mr" ? "वॉलेट रिचार्ज रिक्वेस्ट" : "वॉलेट रीचार्ज रिक्वेस्ट"}</div>
          <div className="space-y-2">
            {pendingRecharges.map((r) => (
              <div key={r.id} className="rounded-lg p-3 flex items-center justify-between" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                <div>
                  <div className="text-xs font-bold" style={{ color: C.ink }}>{r.driverName}</div>
                  <div className="text-[10px]" style={{ color: C.inkSoft }}>{formatTime(r.createdAt)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: C.marigoldDeep, fontFamily: monoFont }}>{fmt(r.amount)}</span>
                  <button onClick={() => approveRecharge(r.id)} className="text-base font-semibold px-4 py-2.5 rounded-lg text-white" style={{ background: C.marigoldDeep }}>{lang === "en" ? "Approve" : lang === "mr" ? "अप्रूव्ह करा" : "अप्रूव करें"}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {pendingWithdrawals.length > 0 && (
        <div className="rounded-xl p-4 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          <div className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: C.ink }}><Wallet size={16} color={C.success} /> {lang === "en" ? "Withdrawal Requests" : lang === "mr" ? "विड्रॉल रिक्वेस्ट" : "विड्रॉल रिक्वेस्ट"}</div>
          <div className="space-y-2">
            {pendingWithdrawals.map((w) => (
              <div key={w.id} className="rounded-lg p-3 flex items-center justify-between" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                <div>
                  <div className="text-xs font-bold" style={{ color: C.ink }}>{w.driverName || w.customerName} <span className="font-normal" style={{ color: C.inkSoft }}>· {w.role === "customer" ? (lang === "en" ? "Referral" : lang === "mr" ? "रेफरल" : "रेफरल") : (lang === "en" ? "Driver bonus" : lang === "mr" ? "ड्रायव्हर बोनस" : "ड्राइवर बोनस")}</span></div>
                  <div className="text-[10px]" style={{ color: C.inkSoft }}>{formatTime(w.createdAt)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: C.success, fontFamily: monoFont }}>{fmt(w.amount)}</span>
                  <button onClick={() => approveWithdrawal(w.id)} className="text-base font-semibold px-4 py-2.5 rounded-lg text-white shadow-lg" style={{ background: C.metallicGreen }}>{lang === "en" ? "Approve" : lang === "mr" ? "अप्रूव्ह करा" : "अप्रूव करें"}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="rounded-xl p-4 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
        <div className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: C.ink }}><Siren size={16} color={C.safety} /> {lang === "en" ? "Emergency Alerts" : lang === "mr" ? "इमर्जन्सी अलर्ट्स" : "इमरजेंसी अलर्ट्स"}</div>
        {alerts.length === 0 ? <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "No alerts yet." : lang === "mr" ? "अजून कोणताही अलर्ट आला नाही." : "अभी कोई अलर्ट नहीं आया।"}</p> : (() => {
          // Police Help / Emergency Call / WhatsApp Support carry no extra
          // info per tap — a driver tapping "WhatsApp Support" 5 times just
          // adds 5 identical rows. Collapse those into one row per role+type
          // with a tap count, so the list reads as distinct alert kinds, not
          // a repeated instruction. Complaints keep one row each since every
          // one has its own real text.
          const grouped = {};
          const complaints = [];
          for (const a of alerts) {
            if (a.type === "शिकायत") { complaints.push(a); continue; }
            const key = `${a.role}|${a.type}`;
            if (!grouped[key]) grouped[key] = { role: a.role, type: a.type, count: 0, latest: a.createdAt };
            grouped[key].count += 1;
          }
          const groupedRows = Object.values(grouped); // alerts is newest-first, so first-seen == latest per key
          return (
            <div className="space-y-2">
              {groupedRows.map((g) => {
                const urgent = g.type === "इमरजेंसी कॉल" || g.type === "पुलिस सहायता";
                return (
                  <div key={`${g.role}|${g.type}`} className="rounded-lg p-3" style={{ background: C.paper, border: `1px solid ${urgent ? C.safety : C.line}` }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold flex items-center gap-1" style={{ color: urgent ? C.safety : C.ink }}>
                        {urgent && <Siren size={12} />} {roleLabel[g.role] || g.role} · {alertTypeLabel(g.type, lang)}
                        {g.count > 1 && <span className="font-normal" style={{ color: C.inkSoft }}>&nbsp;×{g.count}</span>}
                      </span>
                      <span className="text-[10px]" style={{ color: C.inkSoft }}>{formatTime(g.latest)}</span>
                    </div>
                  </div>
                );
              })}
              {complaints.map((a) => (
                <div key={a.id} className="rounded-lg p-3" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold" style={{ color: C.ink }}>{roleLabel[a.role] || a.role} · {alertTypeLabel(a.type, lang)}</span>
                    <span className="text-[10px]" style={{ color: C.inkSoft }}>{formatTime(a.createdAt)}</span>
                  </div>
                  {a.note && <div className="text-[11px] mt-1" style={{ color: C.inkSoft }}>{a.note}</div>}
                  {a.adminReply && openReplyId !== a.id && (
                    <div className="mt-2 rounded-lg p-2" style={{ background: C.metallicGreen + "22" }}>
                      <div className="text-[10px] font-bold mb-0.5" style={{ color: C.metallicGreen }}>
                        {a.mobile
                          ? (lang === "en" ? "Your reply (shown in their app)" : lang === "mr" ? "तुमचे उत्तर (त्यांच्या अ‍ॅपमध्ये दिसते)" : "आपका जवाब (उनके ऐप में दिखता है)")
                          : (lang === "en" ? "Internal note (no mobile on file to deliver to)" : lang === "mr" ? "अंतर्गत नोंद (पाठवण्यासाठी मोबाइल उपलब्ध नाही)" : "आंतरिक नोट (भेजने के लिए मोबाइल उपलब्ध नहीं)")}
                      </div>
                      <div className="text-[11px]" style={{ color: C.ink }}>{a.adminReply}</div>
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {/* Complaints filed before this shipped have no mobile on
                        file at all -- nothing to WhatsApp, so this button is
                        simply omitted for those instead of linking nowhere.
                        The in-app reply below still works either way. */}
                    {a.mobile && (
                      <a
                        href={`https://wa.me/91${a.mobile}?text=${encodeURIComponent(`${lang === "en" ? "Re" : "जवाब"}: "${a.note || ""}"\n\n`)}`}
                        target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full text-white"
                        style={{ background: C.metallicGreen }}>
                        <MessageCircle size={12} /> {lang === "en" ? "Reply on WhatsApp" : lang === "mr" ? "WhatsApp वर उत्तर द्या" : "WhatsApp पर जवाब दें"}
                      </a>
                    )}
                    <button
                      onClick={() => setOpenReplyId(openReplyId === a.id ? null : a.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full"
                      style={{ background: C.bg, border: `1px solid ${C.line}`, color: C.ink }}>
                      <Bell size={12} /> {a.adminReply
                        ? (lang === "en" ? "Edit Reply" : lang === "mr" ? "उत्तर संपादित करा" : "जवाब संपादित करें")
                        : (lang === "en" ? "Reply in App" : lang === "mr" ? "अ‍ॅपमध्ये उत्तर द्या" : "ऐप में जवाब दें")}
                    </button>
                  </div>
                  {openReplyId === a.id && (
                    <div className="mt-2">
                      {!a.mobile && (
                        <p className="text-[10px] mb-1" style={{ color: C.inkSoft }}>
                          {lang === "en" ? "This complaint has no mobile on file, so this reply is saved as an internal note only — it can't be delivered to anyone." : lang === "mr" ? "या तक्रारीसाठी मोबाइल उपलब्ध नाही, त्यामुळे हे उत्तर फक्त अंतर्गत नोंद म्हणून जतन होईल — ते कोणालाही पाठवले जाणार नाही." : "इस शिकायत के लिए मोबाइल उपलब्ध नहीं है, इसलिए यह जवाब केवल आंतरिक नोट के रूप में सेव होगा — यह किसी को नहीं भेजा जाएगा।"}
                        </p>
                      )}
                      <textarea
                        value={replyDrafts[a.id] ?? a.adminReply ?? ""}
                        onChange={(e) => setReplyDrafts((d) => ({ ...d, [a.id]: e.target.value }))}
                        rows={2}
                        placeholder={lang === "en" ? "Type your reply..." : lang === "mr" ? "तुमचे उत्तर टाइप करा..." : "अपना जवाब टाइप करें..."}
                        className="w-full rounded-lg px-3 py-2 text-xs outline-none mb-2" style={{ border: `1px solid ${C.line}`, color: C.ink }} />
                      <button onClick={() => sendReply(a)} disabled={!(replyDrafts[a.id] ?? a.adminReply ?? "").trim()}
                        className="text-xs font-bold px-3 py-1.5 rounded-full text-white"
                        style={{ background: (replyDrafts[a.id] ?? a.adminReply ?? "").trim() ? C.navy : "#B0B6BF" }}>
                        {lang === "en" ? "Save Reply" : lang === "mr" ? "उत्तर जतन करा" : "जवाब सेव करें"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// Dispute-resolution audit trail for masked calls (see functions/index.js:
// initiateMaskedCall) -- who called who, on which booking, when. Only the
// initial connect request gets logged (no duration/answer status, since
// Kaleyra's click-to-call response is all this reads -- a call-status
// webhook would be needed for more than that, which isn't wired up).
function AdminCallLogs({ callLogs, bookings, lang }) {
  const roleLabel = lang === "en" ? { customer: "Customer", driver: "Driver" } : lang === "mr" ? { customer: "ग्राहक", driver: "ड्रायव्हर" } : { customer: "ग्राहक", driver: "ड्राइवर" };
  const formatTime = (createdAt) => (createdAt?.toDate ? createdAt.toDate().toLocaleString(lang === "en" ? "en-IN" : lang === "mr" ? "mr-IN" : "hi-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
  return (
    <div className="rounded-xl p-4 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
      <div className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: C.ink }}>
        <PhoneCall size={16} color={C.marigoldDeep} /> {lang === "en" ? "Masked Call Logs" : lang === "mr" ? "मास्क्ड कॉल लॉग्स" : "मास्क्ड कॉल लॉग्स"}
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#FFFFFF", background: C.navy }}>{(callLogs || []).length}</span>
      </div>
      {(callLogs || []).length === 0 ? (
        <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "No masked calls yet." : lang === "mr" ? "अजून कोणताही मास्क्ड कॉल झाला नाही." : "अभी तक कोई मास्क्ड कॉल नहीं हुई।"}</p>
      ) : (
        <div className="space-y-2">
          {callLogs.map((log) => {
            const b = (bookings || []).find((x) => x.id === log.bookingId);
            return (
              <div key={log.id} className="rounded-lg p-3" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold" style={{ color: C.ink }}>{roleLabel[log.initiatedBy] || log.initiatedBy} {lang === "en" ? "called" : lang === "mr" ? "ने कॉल केला" : "ने कॉल किया"}</span>
                  <span className="text-[10px]" style={{ color: C.inkSoft }}>{formatTime(log.createdAt)}</span>
                </div>
                {b ? (
                  <div className="text-[11px] mt-1" style={{ color: C.inkSoft }}>{b.pickup} → {b.drop}{b.driverName ? ` · ${b.driverName}` : ""}</div>
                ) : (
                  <div className="text-[11px] mt-1" style={{ color: C.inkSoft }}>{lang === "en" ? "Booking" : lang === "mr" ? "बुकिंग" : "बुकिंग"}: {log.bookingId}</div>
                )}
                {/* kaleyraCallId is the current field (Kaleyra); exotelCallSid is kept for any call log written before the Exotel->Kaleyra switch. */}
                {(log.kaleyraCallId || log.exotelCallSid) && <div className="text-[10px] mt-0.5" style={{ color: C.inkSoft, fontFamily: monoFont }}>ID: {log.kaleyraCallId || log.exotelCallSid}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Single home for everything about a driver -- used to be split across
// this list (GPS/online/wallet, blacklist/delete, KYC shown read-only)
// and a separate AdminKyc screen (Approve/Reject/Edit, WhatsApp nudges)
// only reachable via the Live Dashboard's "New Registrations" tile.
// Merged so every action for a given driver lives on that driver's own
// row here, instead of admin having to jump between two different
// screens to finish reviewing one signup.
function AdminDriverList({ drivers, toggleBlacklist, deleteDriver, updateDriverVehicleSpec, vehicleTypes, lang }) {
  const [q, setQ] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [showCall, setShowCall] = useState(false);
  const [callQ, setCallQ] = useState("");
  // Editing a submitted driver's vehicle KYC fields (see AdminKyc's old
  // Edit -- lets admin fix a typo'd vehicle number or wrong capacity
  // before approving, instead of only being able to Block-or-accept-as-is).
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [editError, setEditError] = useState("");
  const startEdit = (d) => {
    setEditingId(d.id);
    setEditDraft({
      type: d.vehicleSpec?.type || "",
      vehicleNumber: d.vehicleSpec?.vehicleNumber || "",
      capacityKg: d.vehicleSpec?.capacityKg != null ? String(d.vehicleSpec.capacityKg) : "",
      length: d.vehicleSpec?.length || "",
      width: d.vehicleSpec?.width || "",
      height: d.vehicleSpec?.height || "",
    });
    setEditError("");
  };
  const cancelEdit = () => { setEditingId(null); setEditDraft(null); setEditError(""); };
  const saveEdit = async (d) => {
    const capacityKg = Number(editDraft.capacityKg);
    if (!editDraft.vehicleNumber.trim() || !capacityKg || capacityKg <= 0) {
      setEditError(lang === "en" ? "Vehicle number and a valid capacity are required." : lang === "mr" ? "गाडी नंबर आणि योग्य क्षमता आवश्यक आहे." : "गाड़ी नंबर और सही क्षमता आवश्यक है।");
      return;
    }
    await updateDriverVehicleSpec(d.id, {
      type: editDraft.type,
      vehicleNumber: editDraft.vehicleNumber.trim().toUpperCase(),
      capacityKg,
      length: editDraft.length.trim(), width: editDraft.width.trim(), height: editDraft.height.trim(),
    });
    cancelEdit();
  };
  // Not-yet-submitted WhatsApp nudge queue. Scoped to installedDrivers(drivers)
  // (same population the sections above use), NOT the raw drivers array --
  // that mismatch is exactly what made this queue's count disagree with
  // the Incomplete section's count (a driver who's long gone quiet/
  // uninstalled, or blacklisted, was still being counted and re-nudged
  // here forever, on top of never showing up in Incomplete at all).
  const notSubmittedKyc = installedDrivers(drivers).filter((d) => !d.vehicleSpec);
  const todayStrKyc = () => new Date().toISOString().slice(0, 10);
  const [kycWhatsappSentMap, setKycWhatsappSentMap] = usePersistedState("sarthi_kycWhatsappSent", {});
  const markKycWhatsappSent = (mobile) => setKycWhatsappSentMap((prev) => ({ ...prev, [mobile]: todayStrKyc() }));
  const sentKycToday = (mobile) => kycWhatsappSentMap[mobile] === todayStrKyc();
  const notSubmittedUnsent = notSubmittedKyc.filter((d) => !sentKycToday(d.mobile));
  const capacityWhatsappLink = (mobile) => {
    const portalLink = `${window.location.origin}${window.location.pathname}?driverKyc=1&mobile=${mobile}`;
    const msg = lang === "en"
      ? `Your vehicle's carrying capacity is missing from your KYC — please add it here so you can be matched and paid the right fare for loads: ${portalLink}\nYour photo, license and vehicle details are already saved — you'll just need to fill in the capacity.`
      : lang === "mr"
      ? `तुमच्या KYC मध्ये गाडीची क्षमता (कॅपॅसिटी) नमूद केलेली नाही — योग्य लोड आणि भाडे मिळण्यासाठी कृपया इथे भरा: ${portalLink}\nतुमचा फोटो, लायसन्स आणि गाडीची माहिती आधीच सेव्ह आहे — फक्त क्षमता भरायची आहे.`
      : `आपकी KYC में गाड़ी की क्षमता (कैपेसिटी) दर्ज नहीं है — सही लोड और भाड़ा पाने के लिए कृपया यहां भरें: ${portalLink}\nआपका फोटो, लाइसेंस और गाड़ी की जानकारी पहले से सेव है — बस क्षमता भरनी है।`;
    return `https://wa.me/91${mobile}?text=${encodeURIComponent(msg)}`;
  };
  // "Total Drivers" and every tab/count below it all report the SAME
  // installed-drivers population (see installedDrivers) -- how many
  // actually still have the app on their phone, not how many driver docs
  // have ever been created. Deliberately the single shared base for
  // every number on this screen so none of them can read differently
  // from each other again.
  const totalInstalled = installedDrivers(drivers);
  // Four segregated sections instead of one list gated behind tabs -- GPS
  // ON/OFF and Incomplete/Complete are independent dimensions, so a driver
  // belongs to exactly one of each pair and shows up in both of its
  // sections (once under whichever GPS section, once under whichever KYC
  // section) rather than being hidden by whichever single tab was picked.
  // Each section is its own collapsible accordion (see expandedSections)
  // instead of a click-to-switch tab, so admin can open more than one at
  // once, or none, without losing the others' place.
  const [expandedSections, setExpandedSections] = useState({ gpsOn: false, gpsOff: false, incomplete: true, complete: false });
  const toggleSection = (key) => setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  const allSectionsExpanded = Object.values(expandedSections).every(Boolean);
  const actionRank = (d) => (d.vehicleSpec && d.kyc === "Pending" ? 0 : !d.vehicleSpec ? 1 : 2);
  const bySection = (arr) => [...arr].sort((a, b) => actionRank(a) - actionRank(b));
  // GPS ON vs GPS OFF, computed live from the same gpsStatus diagnostic as
  // each driver's own "GPS {label}" badge below (!stale == reported a
  // location within the last 2 minutes) -- replaces the old Free Trial/
  // Main Routine split.
  const gpsOnSection = bySection(totalInstalled.filter((d) => !gpsStatus(d, lang).stale));
  const gpsOffSectionAll = totalInstalled.filter((d) => gpsStatus(d, lang).stale);
  // GPS diagnostic (see gpsStatus) -- an Online driver whose lastKnownLocation
  // is stale/missing is the exact "is this actually tracking?" question,
  // used below for the WhatsApp reminder queue (the GPS OFF section itself
  // already covers seeing these drivers, so there's no separate filter
  // toggle for them here).
  const onlineNoLiveGps = totalInstalled.filter((d) => d.online && gpsStatus(d, lang).stale);
  const gpsOffSection = bySection(gpsOffSectionAll);
  // Incomplete vs Complete, independent of the GPS split above -- a driver
  // shows up in one of these AND one of the GPS sections. Same
  // definitions AdminKyc used before it got folded in here: Incomplete =
  // still needs admin's attention (never submitted, or submitted and
  // sitting in Pending review); Complete = resolved either way (Approved
  // or Rejected/Blocked).
  const isIncompleteKyc = (d) => !d.vehicleSpec || d.kyc === "Pending";
  const incompleteSection = bySection(totalInstalled.filter(isIncompleteKyc));
  const completeSection = bySection(totalInstalled.filter((d) => !isIncompleteKyc(d)));
  // Same reasoning as AdminKyc's WhatsApp reminder queue -- a push
  // notification only reaches a driver who's already granted notification
  // permission, exactly the kind of driver whose GPS/location permission
  // is also plausibly off. WhatsApp reaches them regardless. Persisted (not
  // plain useState) so tapping WhatsApp -- which switches away to the
  // WhatsApp app -- doesn't lose the "already reminded today" tick if the
  // tab gets reloaded when admin switches back.
  const todayStrGps = () => new Date().toISOString().slice(0, 10);
  const [gpsWhatsappSentMap, setGpsWhatsappSentMap] = usePersistedState("sarthi_gpsWhatsappSent", {});
  const markGpsWhatsappSent = (mobile) => setGpsWhatsappSentMap((prev) => ({ ...prev, [mobile]: todayStrGps() }));
  const sentGpsToday = (mobile) => gpsWhatsappSentMap[mobile] === todayStrGps();
  const gpsUnsent = onlineNoLiveGps.filter((d) => !sentGpsToday(d.mobile));

  // Real bulk send (see sendBulkDriverWhatsApp in functions/index.js) --
  // same reasoning/shape as AdminFleet's own copy of this (Off duty,
  // Uninstalled/Blocked) -- a separate component instance needs its own
  // copy of this state, not shared, but the logic is identical.
  const [bulkSendingKind, setBulkSendingKind] = useState(null);
  const [bulkSendResult, setBulkSendResult] = useState(null);
  const sendBulkWhatsAppNow = async (kind, targets, markSent) => {
    if (bulkSendingKind) return;
    setBulkSendingKind(kind);
    setBulkSendResult(null);
    const mobiles = targets.map((d) => d.mobile).filter(Boolean);
    const result = await sendBulkDriverWhatsApp(kind, mobiles);
    if (result.ok) targets.forEach((d) => markSent(d.mobile));
    setBulkSendResult({ kind, ...result });
    setBulkSendingKind(null);
  };
  // Per-row "message just this one driver" -- same MSG91 template as the
  // bulk button above (a bulk send of one), not the old wa.me plain-text
  // links this replaces for the GPS-off and not-submitted-KYC cases (the
  // two that have an approved MSG91 template). The old links were never
  // actually removed when the bulk buttons were added, so messaging a
  // single driver here kept firing an unreviewed, outdated message instead
  // -- a real bug caught by the admin testing it on themselves. The
  // "needsCapacity" KYC case below has no approved template yet, so it
  // keeps its original wa.me link.
  const [singleSendingMobile, setSingleSendingMobile] = useState(null);
  // Surfaced next to the row's own button (see renderRow below) -- see
  // AdminFleet's copy of this same state for why: a failed silent send
  // and a successful one otherwise look identical, which is very likely
  // what was actually behind the repeated "still shows the old message"
  // reports on this feature.
  const [singleSendResult, setSingleSendResult] = useState(null);
  const sendSingleWhatsAppNow = async (kind, d, markSent) => {
    if (bulkSendingKind || singleSendingMobile) return;
    setSingleSendingMobile(d.mobile);
    setSingleSendResult(null);
    const result = await sendBulkDriverWhatsApp(kind, [d.mobile]);
    if (result.ok) markSent(d.mobile);
    setSingleSendResult({ mobile: d.mobile, kind, ok: result.ok, reason: result.reason });
    setSingleSendingMobile(null);
  };
  // Scoped to totalInstalled, same as the 4 sections above -- only active,
  // installed drivers are ever listed here, full stop. A blacklisted or
  // likely-uninstalled driver isn't findable from this screen at all
  // anymore (search included); the Live Dashboard's "Uninstalled /
  // Blocked" KPI is their only remaining home, Unblock button included.
  // A search collapses the 4 sections into one flat result list (see the
  // render below); with an empty query there's nothing to search and the
  // sections render instead.
  const searchResults = q.trim()
    ? bySection(totalInstalled.filter((d) => d.name.includes(q) || (d.vehicleSpec?.vehicleNumber || "").toLowerCase().includes(q.toLowerCase()) || (d.mobile || "").includes(q)))
    : [];
  const kycMeta = lang === "en"
    ? { Approved: { label: "Verified", color: "#FFFFFF", bg: C.success }, Pending: { label: "Pending", color: "#FFFFFF", bg: C.marigoldDeep }, Rejected: { label: "Blocked", color: "#FFFFFF", bg: C.safety }, none: { label: "KYC not submitted", color: C.inkSoft, bg: "#E5E5E5" } }
    : lang === "mr"
    ? { Approved: { label: "सत्यापित", color: "#FFFFFF", bg: C.success }, Pending: { label: "प्रलंबित", color: "#FFFFFF", bg: C.marigoldDeep }, Rejected: { label: "ब्लॉक्ड", color: "#FFFFFF", bg: C.safety }, none: { label: "KYC सबमिट झाले नाही", color: C.inkSoft, bg: "#E5E5E5" } }
    : { Approved: { label: "सत्यापित", color: "#FFFFFF", bg: C.success }, Pending: { label: "लंबित", color: "#FFFFFF", bg: C.marigoldDeep }, Rejected: { label: "ब्लॉक्ड", color: "#FFFFFF", bg: C.safety }, none: { label: "KYC सबमिट नहीं हुआ", color: C.inkSoft, bg: "#E5E5E5" } };
  const docLabels = lang === "en"
    ? { photo: "Driver Photo", dl: "Driving License" }
    : lang === "mr"
    ? { photo: "ड्रायव्हर फोटो", dl: "ड्रायव्हिंग लायसन्स" }
    : { photo: "ड्राइवर फोटो", dl: "ड्राइविंग लाइसेंस" };

  // One driver's full card -- shared by every section below and by the
  // flat search-results list, instead of five copies of the same ~170
  // lines of JSX.
  const renderRow = (d) => {
    const km = kycMeta[d.kyc] || kycMeta.none;
    const expanded = expandedId === d.id;
    const editing = editingId === d.id;
    const daysLeft = trialDaysLeft(d.createdAt);
    const gps = gpsStatus(d, lang);
    const notSubmitted = !d.vehicleSpec;
    const needsCapacity = !!d.vehicleSpec && !d.vehicleSpec.capacityKg;
    return (
      <div key={d.id} className="rounded-lg p-3" style={{ border: `1px solid ${d.blacklisted ? C.safety : C.line}`, background: C.paper }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-bold" style={{ color: C.ink }}>{d.name}</div>
            <div className="text-xs font-bold" style={{ color: C.ink, fontFamily: monoFont }}>{d.vehicleSpec?.vehicleNumber || "—"} · {d.mobile} · {lang === "en" ? "Wallet" : lang === "mr" ? "वॉलेट" : "वॉलेट"} {fmt(d.wallet)}</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#FFFFFF", background: d.online ? C.success : C.marigoldDeep }}>{d.online ? (lang === "en" ? "Online" : lang === "mr" ? "ऑनलाइन" : "ऑनलाइन") : (lang === "en" ? "Offline" : lang === "mr" ? "ऑफलाइन" : "ऑफलाइन")}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5" style={{ color: gps.color, background: gps.bg }} title={lang === "en" ? "GPS status" : lang === "mr" ? "GPS स्थिती" : "GPS स्थिति"}>
              <MapPin size={9} /> GPS {gps.label}
            </span>
            {d.online && gps.stale && (
              sentGpsToday(d.mobile) ? (
                <span className="text-[10px] font-semibold" style={{ color: C.navy }}>✓ {lang === "en" ? "Reminded" : lang === "mr" ? "आठवण दिली" : "याद दिलाया"}</span>
              ) : (
                <button onClick={() => sendSingleWhatsAppNow("gpsOff", d, markGpsWhatsappSent)} disabled={!!bulkSendingKind || !!singleSendingMobile}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 text-white" style={{ background: C.success, opacity: singleSendingMobile && singleSendingMobile !== d.mobile ? 0.6 : 1 }}>
                  <MessageCircle size={9} /> WhatsApp
                </button>
              )
            )}
            {singleSendResult?.mobile === d.mobile && singleSendResult.kind === "gpsOff" && (
              <span className="text-[9px] font-bold" style={{ color: singleSendResult.ok ? C.success : C.safety }} title={singleSendResult.ok ? undefined : singleSendResult.reason}>
                {singleSendResult.ok
                  ? (lang === "en" ? "Sent" : lang === "mr" ? "पाठवले" : "भेजा गया")
                  : (lang === "en" ? "Failed" : lang === "mr" ? "अयशस्वी" : "विफल")}
              </span>
            )}
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: km.color, background: km.bg }}>{km.label}</span>
            {(notSubmitted || needsCapacity) && (
              sentKycToday(d.mobile) ? (
                <span className="text-[10px] font-semibold" style={{ color: C.navy }}>✓ {lang === "en" ? "Reminded" : lang === "mr" ? "आठवण दिली" : "याद दिलाया"}</span>
              ) : (
                notSubmitted ? (
                  <button onClick={() => sendSingleWhatsAppNow("kycIncomplete", d, markKycWhatsappSent)} disabled={!!bulkSendingKind || !!singleSendingMobile}
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 text-white" style={{ background: C.marigoldDeep, opacity: singleSendingMobile && singleSendingMobile !== d.mobile ? 0.6 : 1 }}>
                    <MessageCircle size={9} /> {lang === "en" ? "KYC WhatsApp" : lang === "mr" ? "KYC व्हॉट्सअ‍ॅप" : "KYC व्हाट्सएप"}
                  </button>
                ) : (
                  <a href={capacityWhatsappLink(d.mobile)} target="_blank" rel="noreferrer" onClick={() => markKycWhatsappSent(d.mobile)}
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 text-white" style={{ background: C.marigoldDeep }}>
                    <MessageCircle size={9} /> {lang === "en" ? "Capacity WhatsApp" : lang === "mr" ? "क्षमता व्हॉट्सअ‍ॅप" : "क्षमता व्हाट्सएप"}
                  </a>
                )
              )
            )}
            {singleSendResult?.mobile === d.mobile && singleSendResult.kind === "kycIncomplete" && (
              <span className="text-[9px] font-bold" style={{ color: singleSendResult.ok ? C.success : C.safety }} title={singleSendResult.ok ? undefined : singleSendResult.reason}>
                {singleSendResult.ok
                  ? (lang === "en" ? "Sent" : lang === "mr" ? "पाठवले" : "भेजा गया")
                  : (lang === "en" ? "Failed" : lang === "mr" ? "अयशस्वी" : "विफल")}
              </span>
            )}
            {daysLeft != null ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#FFFFFF", background: C.marigoldDeep }}>
                {lang === "en" ? `Trial · ${daysLeft}d left` : lang === "mr" ? `ट्रायल · ${daysLeft} दिवस बाकी` : `ट्रायल · ${daysLeft} दिन बाकी`}
              </span>
            ) : (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: C.inkSoft, background: "#E5E5E5" }}>{lang === "en" ? "Main Routine" : lang === "mr" ? "मुख्य रुटीन" : "मुख्य रूटीन"}</span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-2">
          <button onClick={() => setExpandedId(expanded ? null : d.id)} className="text-sm font-bold" style={{ color: C.marigoldDeep }}>
            {expanded ? (lang === "en" ? "▲ Hide KYC details" : lang === "mr" ? "▲ KYC डिटेल लपवा" : "▲ KYC डिटेल छुपाएं") : (lang === "en" ? "▼ View KYC details" : lang === "mr" ? "▼ KYC डिटेल पहा" : "▼ KYC डिटेल देखें")}
          </button>
          {/* Approve/Reject moved to the Live Dashboard's "New Registrations"
              approval queue (see AdminFleet) -- this screen keeps Edit only,
              for fixing bad vehicle data on a driver regardless of KYC
              status, not for making the approval decision itself. */}
          {d.vehicleSpec && (
            <div className="flex gap-2 shrink-0">
              <button onClick={() => (editing ? cancelEdit() : startEdit(d))} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: editing ? C.inkSoft : C.navy, color: "#FFFFFF" }}>
                {editing ? (lang === "en" ? "Cancel" : lang === "mr" ? "रद्द करा" : "रद्द करें") : (lang === "en" ? "Edit" : lang === "mr" ? "एडिट" : "एडिट")}
              </button>
            </div>
          )}
        </div>
        {editing ? (
          <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <label className="text-[11px] col-span-2">
                <span className="block mb-1 font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "Vehicle type" : lang === "mr" ? "गाडीचा प्रकार" : "गाड़ी का प्रकार"}</span>
                <select value={editDraft.type} onChange={(e) => setEditDraft((p) => ({ ...p, type: e.target.value }))}
                  className="w-full rounded-lg px-2.5 py-2 text-sm outline-none" style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.ink }}>
                  {!vehicleTypes.some((v) => v.key === editDraft.type) && <option value={editDraft.type}>{editDraft.type || "—"}</option>}
                  {vehicleTypes.map((v) => <option key={v.key} value={v.key}>{lang === "en" ? (v.labelEn || v.label) : v.label}</option>)}
                </select>
              </label>
              <label className="text-[11px]">
                <span className="block mb-1 font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "Vehicle number" : lang === "mr" ? "गाडी नंबर" : "गाड़ी नंबर"}</span>
                <input value={editDraft.vehicleNumber} onChange={(e) => setEditDraft((p) => ({ ...p, vehicleNumber: e.target.value }))}
                  className="w-full rounded-lg px-2.5 py-2 text-sm outline-none" style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.ink }} />
              </label>
              <label className="text-[11px]">
                <span className="block mb-1 font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "Capacity (kg)" : lang === "mr" ? "क्षमता (किलो)" : "क्षमता (किग्रा)"}</span>
                <input type="number" value={editDraft.capacityKg} onChange={(e) => setEditDraft((p) => ({ ...p, capacityKg: e.target.value }))}
                  className="w-full rounded-lg px-2.5 py-2 text-sm outline-none" style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.ink }} />
              </label>
              <label className="text-[11px]">
                <span className="block mb-1 font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "Length (ft)" : lang === "mr" ? "लांबी (फूट)" : "लंबाई (फीट)"}</span>
                <input value={editDraft.length} onChange={(e) => setEditDraft((p) => ({ ...p, length: e.target.value }))}
                  className="w-full rounded-lg px-2.5 py-2 text-sm outline-none" style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.ink }} />
              </label>
              <label className="text-[11px]">
                <span className="block mb-1 font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "Width (ft)" : lang === "mr" ? "रुंदी (फूट)" : "चौड़ाई (फीट)"}</span>
                <input value={editDraft.width} onChange={(e) => setEditDraft((p) => ({ ...p, width: e.target.value }))}
                  className="w-full rounded-lg px-2.5 py-2 text-sm outline-none" style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.ink }} />
              </label>
              <label className="text-[11px]">
                <span className="block mb-1 font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "Height (ft)" : lang === "mr" ? "उंची (फूट)" : "ऊंचाई (फीट)"}</span>
                <input value={editDraft.height} onChange={(e) => setEditDraft((p) => ({ ...p, height: e.target.value }))}
                  className="w-full rounded-lg px-2.5 py-2 text-sm outline-none" style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.ink }} />
              </label>
            </div>
            {editError && <p className="text-[11px] mb-2" style={{ color: C.safety }}>{editError}</p>}
            <div className="flex justify-end">
              <button onClick={() => saveEdit(d)} className="rounded-lg px-5 py-2.5 text-sm font-bold text-white" style={{ background: C.metallicGreen }}>
                {lang === "en" ? "Save changes" : lang === "mr" ? "बदल सेव्ह करा" : "बदलाव सेव करें"}
              </button>
            </div>
          </div>
        ) : expanded && (
          <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
            <div className="text-[11px] font-semibold mb-1.5" style={{ color: C.inkSoft }}>{lang === "en" ? "Submitted documents:" : lang === "mr" ? "जमा केलेली कागदपत्रे:" : "जमा किए गए दस्तावेज़:"}</div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {Object.entries(docLabels).map(([key, label]) => {
                const doc = d.docs?.[key];
                return <KycDocThumb key={key} url={doc?.url} label={label} lang={lang} fileName={`${d.name}-${key}.jpg`} />;
              })}
            </div>
            {(d.vehicleSpec?.photo || d.vehicleSpec?.photoSide) && (
              <>
                <div className="text-[11px] font-semibold mb-1.5" style={{ color: C.inkSoft }}>{lang === "en" ? "Vehicle photos:" : lang === "mr" ? "गाडीचा फोटो:" : "गाड़ी की फोटो:"}</div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {d.vehicleSpec?.photo && <KycDocThumb url={d.vehicleSpec.photo.url} label={lang === "en" ? "Vehicle - Front" : lang === "mr" ? "गाडी - पुढे" : "गाड़ी - आगे"} lang={lang} fileName={`${d.name}-vehicle-front.jpg`} />}
                  {d.vehicleSpec?.photoSide && <KycDocThumb url={d.vehicleSpec.photoSide.url} label={lang === "en" ? "Vehicle - Side" : lang === "mr" ? "गाडी - बाजू" : "गाड़ी - साइड"} lang={lang} fileName={`${d.name}-vehicle-side.jpg`} />}
                </div>
              </>
            )}
            {d.vehicleSpec && (
              <div className="text-[11px] mb-2" style={{ color: C.ink }}>
                <b>{lang === "en" ? "Vehicle number" : lang === "mr" ? "गाडी नंबर" : "गाड़ी नंबर"}:</b> <span style={{ fontFamily: monoFont }}>{d.vehicleSpec.vehicleNumber || "—"}</span><br />
                <b>{lang === "en" ? "Capacity/size" : lang === "mr" ? "क्षमता/साइझ" : "क्षमता/साइज़"}:</b> {d.vehicleSpec.capacityKg ? `${d.vehicleSpec.capacityKg} ${lang === "en" ? "kg" : lang === "mr" ? "किलो" : "किग्रा"}` : "—"} · {d.vehicleSpec.length || "—"}×{d.vehicleSpec.width || "—"}×{d.vehicleSpec.height || "—"} {lang === "en" ? "ft" : lang === "mr" ? "फूट" : "फीट"}
              </div>
            )}
            {!d.vehicleSpec && !d.docs && <p className="text-[11px]" style={{ color: C.inkSoft }}>{lang === "en" ? "No extra data available for this driver (demo driver)." : lang === "mr" ? "या ड्रायव्हरचा कोणताही अतिरिक्त डेटा उपलब्ध नाही (डेमो ड्रायव्हर)." : "इस ड्राइवर का कोई अतिरिक्त डेटा उपलब्ध नहीं है (डेमो ड्राइवर)।"}</p>}
          </div>
        )}

        <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
          {d.blacklisted ? <span className="text-[11px] font-bold" style={{ color: C.safety }}>⛔ {lang === "en" ? "Blocked — won't get bookings" : lang === "mr" ? "ब्लॉक्ड — बुकिंग मिळणार नाही" : "ब्लॉक्ड — बुकिंग नहीं मिलेगी"}</span> : <span />}
          <div className="flex items-center gap-2">
            {confirmDeleteId === d.id ? (
              <>
                <span className="text-[11px]" style={{ color: C.inkSoft }}>{lang === "en" ? "Delete permanently?" : lang === "mr" ? "कायमचे काढून टाकायचे?" : "हमेशा के लिए हटाएं?"}</span>
                <button onClick={() => { deleteDriver(d.mobile || d.id); setConfirmDeleteId(null); }} className="text-sm font-bold px-3.5 py-2 rounded-lg" style={{ color: "#fff", background: C.safety }}>
                  {lang === "en" ? "Yes, delete" : lang === "mr" ? "हो, काढा" : "हां, हटाएं"}
                </button>
                <button onClick={() => setConfirmDeleteId(null)} className="text-sm font-bold px-3.5 py-2 rounded-lg" style={{ color: C.inkSoft, background: C.bg }}>
                  {lang === "en" ? "Cancel" : lang === "mr" ? "रद्द करा" : "रद्द करें"}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => toggleBlacklist(d.mobile || d.id)} className="text-sm font-bold px-3.5 py-2 rounded-lg" style={{ color: "#FFFFFF", background: d.blacklisted ? C.success : C.safety }}>
                  {d.blacklisted ? (lang === "en" ? "Unblock" : lang === "mr" ? "अनब्लॉक करा" : "अनब्लॉक करें") : (lang === "en" ? "Block" : lang === "mr" ? "ब्लॉक करा" : "ब्लॉक करें")}
                </button>
                <button onClick={() => setConfirmDeleteId(d.id)} className="text-sm font-bold px-3.5 py-2 rounded-lg" style={{ color: C.inkSoft, background: C.bg, border: `1px solid ${C.line}` }}>
                  {lang === "en" ? "Delete" : lang === "mr" ? "काढा" : "हटाएं"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };
  // Section metadata for the 4 accordions below -- a driver naturally
  // belongs to exactly one GPS section and one KYC section, so it can
  // appear in up to 2 of these 4 lists at once (see the big comment above
  // expandedSections).
  const sections = [
    { key: "gpsOn", label: lang === "en" ? "GPS ON" : lang === "mr" ? "GPS ऑन" : "GPS ऑन", list: gpsOnSection },
    { key: "gpsOff", label: lang === "en" ? "GPS OFF" : lang === "mr" ? "GPS ऑफ" : "GPS ऑफ", list: gpsOffSection },
    { key: "incomplete", label: lang === "en" ? "Incomplete" : lang === "mr" ? "अपूर्ण" : "अधूरी", list: incompleteSection },
    { key: "complete", label: lang === "en" ? "Complete" : lang === "mr" ? "पूर्ण" : "पूरी", list: completeSection },
  ];

  return (
    <div className="rounded-xl p-4 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
      <div className="flex items-center justify-between mb-3">
        {/* One single, complete button (not a plain label plus a separate
            reset button) -- with sections replacing tabs below, its job is
            now to open or close every section at once, in place of the old
            "reset both tabs to all" action. */}
        <button onClick={() => { const next = !allSectionsExpanded; setExpandedSections({ gpsOn: next, gpsOff: next, incomplete: next, complete: next }); }}
          className="text-sm font-bold px-4 py-2.5 rounded-lg flex items-center gap-1.5" style={{ background: allSectionsExpanded ? C.navy : C.bg, color: allSectionsExpanded ? "#fff" : C.ink, border: `1px solid ${allSectionsExpanded ? C.navy : C.line}` }}>
          <Users size={16} /> {lang === "en" ? "All Drivers" : lang === "mr" ? "सर्व ड्रायव्हर" : "सभी ड्राइवर"} ({totalInstalled.length})
        </button>
        <button onClick={() => setShowCall((v) => !v)} className="text-sm font-bold px-4 py-2.5 rounded-lg text-white shadow-lg flex items-center gap-1" style={{ background: C.metallicGreen }}>
          {showCall ? (lang === "en" ? "Cancel" : lang === "mr" ? "रद्द करा" : "रद्द करें") : <><Phone size={12} /> {lang === "en" ? "Call Driver" : lang === "mr" ? "ड्रायव्हरला कॉल करा" : "ड्राइवर को कॉल करें"}</>}
        </button>
      </div>
      {onlineNoLiveGps.length > 0 && (
        gpsUnsent.length > 0 ? (
          <button onClick={() => sendBulkWhatsAppNow("gpsOff", gpsUnsent, markGpsWhatsappSent)} disabled={!!bulkSendingKind}
            className="w-full rounded-lg py-3 font-bold text-sm mb-2 flex items-center justify-center gap-1.5 text-white" style={{ background: bulkSendingKind ? "#9AA3B0" : C.success, opacity: bulkSendingKind && bulkSendingKind !== "gpsOff" ? 0.6 : 1 }}>
            <MessageCircle size={14} />
            {bulkSendingKind === "gpsOff"
              ? (lang === "en" ? "Sending…" : lang === "mr" ? "पाठवत आहे…" : "भेजा जा रहा है…")
              : (lang === "en" ? `Bulk GPS reminder on WhatsApp to all ${gpsUnsent.length} at once` : lang === "mr" ? `सर्व ${gpsUnsent.length} ना GPS रिमाइंडरचा बल्क WhatsApp एका साथ पाठवा` : `सभी ${gpsUnsent.length} को GPS रिमाइंडर का बल्क WhatsApp एक साथ भेजें`)}
          </button>
        ) : (
          <div className="w-full rounded-lg py-3 font-bold text-sm mb-2 flex items-center justify-center gap-1.5" style={{ background: "#E0E0E0", color: "#9AA3B0" }}>
            <CheckCircle2 size={14} />
            {lang === "en" ? "Everyone reminded today" : lang === "mr" ? "आज सर्वांना आठवण दिली" : "आज सभी को याद दिलाया गया"}
          </div>
        )
      )}
      {bulkSendResult?.kind === "gpsOff" && (
        <div className="rounded-lg p-2 mb-3 text-xs font-bold text-center" style={{ background: bulkSendResult.ok ? C.success : C.safety, color: "#fff" }}>
          {bulkSendResult.ok
            ? (lang === "en" ? `Sent to ${bulkSendResult.sent} drivers.` : lang === "mr" ? `${bulkSendResult.sent} ड्रायव्हर्सना पाठवले.` : `${bulkSendResult.sent} ड्राइवरों को भेजा गया।`)
            : (lang === "en" ? "Couldn't send — try again." : lang === "mr" ? "पाठवता आले नाही — पुन्हा प्रयत्न करा." : "भेजा नहीं जा सका — फिर कोशिश करें।")}
        </div>
      )}
      {notSubmittedKyc.length > 0 && (
        notSubmittedUnsent.length > 0 ? (
          <button onClick={() => sendBulkWhatsAppNow("kycIncomplete", notSubmittedUnsent, markKycWhatsappSent)} disabled={!!bulkSendingKind}
            className="w-full rounded-lg py-3 font-bold text-sm mb-2 flex items-center justify-center gap-1.5 text-white" style={{ background: bulkSendingKind ? "#9AA3B0" : C.marigoldDeep, opacity: bulkSendingKind && bulkSendingKind !== "kycIncomplete" ? 0.6 : 1 }}>
            <XCircle size={14} />
            {bulkSendingKind === "kycIncomplete"
              ? (lang === "en" ? "Sending…" : lang === "mr" ? "पाठवत आहे…" : "भेजा जा रहा है…")
              : (lang === "en" ? `Bulk KYC reminder on WhatsApp to all ${notSubmittedUnsent.length} at once` : lang === "mr" ? `सर्व ${notSubmittedUnsent.length} ना KYC रिमाइंडरचा बल्क WhatsApp एका साथ पाठवा` : `सभी ${notSubmittedUnsent.length} को KYC रिमाइंडर का बल्क WhatsApp एक साथ भेजें`)}
          </button>
        ) : (
          <div className="w-full rounded-lg py-3 font-bold text-sm mb-2 flex items-center justify-center gap-1.5" style={{ background: "#E0E0E0", color: "#9AA3B0" }}>
            <CheckCircle2 size={14} />
            {lang === "en" ? "Everyone reminded today" : lang === "mr" ? "आज सर्वांना आठवण दिली" : "आज सभी को याद दिलाया गया"}
          </div>
        )
      )}
      {bulkSendResult?.kind === "kycIncomplete" && (
        <div className="rounded-lg p-2 mb-3 text-xs font-bold text-center" style={{ background: bulkSendResult.ok ? C.success : C.safety, color: "#fff" }}>
          {bulkSendResult.ok
            ? (lang === "en" ? `Sent to ${bulkSendResult.sent} drivers.` : lang === "mr" ? `${bulkSendResult.sent} ड्रायव्हर्सना पाठवले.` : `${bulkSendResult.sent} ड्राइवरों को भेजा गया।`)
            : (lang === "en" ? "Couldn't send — try again." : lang === "mr" ? "पाठवता आले नाही — पुन्हा प्रयत्न करा." : "भेजा नहीं जा सका — फिर कोशिश करें।")}
        </div>
      )}
      {showCall && (() => {
        const callFiltered = totalInstalled.filter((d) => d.name.includes(callQ) || (d.vehicleSpec?.vehicleNumber || "").toLowerCase().includes(callQ.toLowerCase()) || (d.mobile || "").includes(callQ));
        return (
          <div className="rounded-lg p-2 mb-3" style={{ background: C.bg, border: `1px solid ${C.line}` }}>
            <input value={callQ} onChange={(e) => setCallQ(e.target.value)} placeholder={lang === "en" ? "Search by name, vehicle number or mobile..." : lang === "mr" ? "नाव, गाडी नंबर किंवा मोबाइलने शोधा..." : "नाम, गाड़ी नंबर या मोबाइल से खोजें..."}
              className="w-full rounded-lg px-3 py-2 text-xs outline-none mb-2" style={{ border: `1px solid ${C.line}`, background: C.paper, color: C.ink }} />
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {callFiltered.length === 0 ? (
                <p className="text-xs px-1 py-1" style={{ color: C.inkSoft }}>{lang === "en" ? "No driver found." : lang === "mr" ? "कोणताही ड्रायव्हर सापडला नाही." : "कोई ड्राइवर नहीं मिला।"}</p>
              ) : callFiltered.map((d) => (
                <a key={d.id} href={`tel:${d.mobile}`} onClick={() => setShowCall(false)}
                  className="flex items-center justify-between gap-2 rounded-lg px-3 py-2" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate" style={{ color: C.ink }}>{d.name}</div>
                    <div className="text-[10px] font-bold" style={{ color: C.inkSoft, fontFamily: monoFont }}>{d.mobile}</div>
                  </div>
                  <Phone size={16} color={C.success} className="shrink-0" />
                </a>
              ))}
            </div>
          </div>
        );
      })()}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={lang === "en" ? "Search by name, vehicle number or mobile..." : lang === "mr" ? "नाव, गाडी नंबर किंवा मोबाइलने शोधा..." : "नाम, गाड़ी नंबर या मोबाइल से खोजें..."} className="w-full rounded-lg px-3 py-2 text-xs outline-none mb-3" style={{ border: `1px solid ${C.line}`, background: C.paper, color: C.ink }} />
      {q.trim() ? (
        <div className="space-y-2">
          {searchResults.length === 0 && <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "No driver found." : lang === "mr" ? "कोणताही ड्रायव्हर सापडला नाही." : "कोई ड्राइवर नहीं मिला।"}</p>}
          {searchResults.map(renderRow)}
        </div>
      ) : (
        <div className="space-y-2">
          {sections.map(({ key, label, list }) => (
            <div key={key} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
              <button onClick={() => toggleSection(key)} className="w-full flex items-center justify-between px-3 py-3" style={{ background: expandedSections[key] ? C.bg : C.paper }}>
                <span className="text-sm font-bold" style={{ color: C.ink }}>{label} ({list.length})</span>
                <span className="text-sm font-bold" style={{ color: C.marigoldDeep }}>{expandedSections[key] ? "▲" : "▼"}</span>
              </button>
              {expandedSections[key] && (
                <div className="px-3 pb-3 pt-1 space-y-2" style={{ borderTop: `1px solid ${C.line}` }}>
                  {list.length === 0
                    ? <p className="text-xs pt-2" style={{ color: C.inkSoft }}>{lang === "en" ? "No driver here." : lang === "mr" ? "इथे कोणताही ड्रायव्हर नाही." : "यहां कोई ड्राइवर नहीं है।"}</p>
                    : list.map(renderRow)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Read-only oversight of customer registrations — name, address, KYC info.
// Customers are never gated by admin approval (only drivers are), so this
// is visibility only, not a verification queue.
function AdminCustomers({ customers, bookings, lang, deleteCustomer }) {
  const [q, setQ] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [showCall, setShowCall] = useState(false);
  const [callQ, setCallQ] = useState("");
  const filtered = (customers || []).filter((c) => (c.name || "").toLowerCase().includes(q.toLowerCase()) || (c.mobile || "").includes(q));
  const statusMeta = lang === "en"
    ? { Bidding: { label: "Awaiting bids", color: "#FFFFFF", bg: C.marigoldDeep }, Ongoing: { label: "Ongoing", color: "#FFFFFF", bg: C.marigoldDeep }, Completed: { label: "Completed", color: "#FFFFFF", bg: C.success }, Cancelled: { label: "Cancelled", color: "#FFFFFF", bg: C.safety } }
    : { Bidding: { label: "बिड बाकी", color: "#FFFFFF", bg: C.marigoldDeep }, Ongoing: { label: "चालू", color: "#FFFFFF", bg: C.marigoldDeep }, Completed: { label: "पूर्ण", color: "#FFFFFF", bg: C.success }, Cancelled: { label: "रद्द", color: "#FFFFFF", bg: C.safety } };
  const bookingDate = (b) => (b.createdAt?.toDate ? b.createdAt.toDate().toLocaleDateString(lang === "en" ? "en-IN" : lang === "mr" ? "mr-IN" : "hi-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

  return (
    <div className="rounded-xl p-4 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-bold flex items-center gap-1.5" style={{ color: C.ink }}>
          <Users size={16} /> {lang === "en" ? "All Customers" : lang === "mr" ? "सर्व कस्टमर" : "सभी कस्टमर"}
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#FFFFFF", background: C.navy }}>{(customers || []).length}</span>
        </div>
        <button onClick={() => setShowCall((v) => !v)} className="text-sm font-bold px-4 py-2.5 rounded-lg text-white shadow-lg flex items-center gap-1" style={{ background: C.metallicGreen }}>
          {showCall ? (lang === "en" ? "Cancel" : lang === "mr" ? "रद्द करा" : "रद्द करें") : <><Phone size={12} /> {lang === "en" ? "Call Customer" : lang === "mr" ? "कस्टमरला कॉल करा" : "कस्टमर को कॉल करें"}</>}
        </button>
      </div>
      {showCall && (() => {
        const callFiltered = (customers || []).filter((c) => (c.name || "").toLowerCase().includes(callQ.toLowerCase()) || (c.mobile || "").includes(callQ));
        return (
          <div className="rounded-lg p-2 mb-3" style={{ background: C.bg, border: `1px solid ${C.line}` }}>
            <input value={callQ} onChange={(e) => setCallQ(e.target.value)} placeholder={lang === "en" ? "Search by name or mobile..." : lang === "mr" ? "नाव किंवा मोबाइलने शोधा..." : "नाम या मोबाइल से खोजें..."}
              className="w-full rounded-lg px-3 py-2 text-xs outline-none mb-2" style={{ border: `1px solid ${C.line}`, background: C.paper, color: C.ink }} />
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {callFiltered.length === 0 ? (
                <p className="text-xs px-1 py-1" style={{ color: C.inkSoft }}>{lang === "en" ? "No customer found." : lang === "mr" ? "कोणताही कस्टमर सापडला नाही." : "कोई कस्टमर नहीं मिला।"}</p>
              ) : callFiltered.map((c) => (
                <a key={c.mobile} href={`tel:${c.mobile}`} onClick={() => setShowCall(false)}
                  className="flex items-center justify-between gap-2 rounded-lg px-3 py-2" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate" style={{ color: C.ink }}>{c.name || "—"}</div>
                    <div className="text-[10px] font-bold" style={{ color: C.inkSoft, fontFamily: monoFont }}>{c.mobile}</div>
                  </div>
                  <Phone size={16} color={C.success} className="shrink-0" />
                </a>
              ))}
            </div>
          </div>
        );
      })()}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={lang === "en" ? "Search by name or mobile..." : lang === "mr" ? "नाव किंवा मोबाइलने शोधा..." : "नाम या मोबाइल से खोजें..."} className="w-full rounded-lg px-3 py-2 text-xs outline-none mb-3" style={{ border: `1px solid ${C.line}`, background: C.paper, color: C.ink }} />
      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "No customer found." : lang === "mr" ? "कोणताही कस्टमर सापडला नाही." : "कोई कस्टमर नहीं मिला।"}</p>}
        {filtered.map((c) => {
          const expanded = expandedId === c.mobile;
          const rides = (bookings || []).filter((b) => b.customerMobile === c.mobile);
          return (
            <div key={c.mobile} className="rounded-lg p-3" style={{ border: `1px solid ${C.line}` }}>
              <div className="flex items-center gap-2.5">
                <SafeImage src={c.photo?.url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" fallback={<div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: C.marigoldDeep }}><UserCircle2 size={20} color="#FFFFFF" /></div>} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate" style={{ color: C.ink }}>{c.name || "—"}</div>
                  <div className="text-[10px] font-bold" style={{ color: C.ink, fontFamily: monoFont }}>{c.mobile}</div>
                </div>
                <button onClick={() => setExpandedId(expanded ? null : c.mobile)} className="shrink-0 text-sm font-semibold px-3.5 py-2.5 rounded-lg" style={{ color: "#FFFFFF", background: C.marigoldDeep }}>
                  {expanded ? (lang === "en" ? "Hide" : lang === "mr" ? "लपवा" : "छुपाएं") : (lang === "en" ? "View Details" : lang === "mr" ? "तपशील पहा" : "विवरण देखें")}
                </button>
              </div>

              {expanded && (
                <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.line}` }}>
                  <div className="text-[11px] mb-3" style={{ color: C.ink }}>
                    <b>{lang === "en" ? "Contact number" : lang === "mr" ? "संपर्क नंबर" : "संपर्क नंबर"}:</b> <span style={{ fontFamily: monoFont }}>{c.mobile}</span>
                  </div>
                  <div className="text-[11px] font-semibold mb-1.5" style={{ color: C.inkSoft }}>
                    {lang === "en" ? `Ride history (${rides.length})` : lang === "mr" ? `राइड हिस्टरी (${rides.length})` : `राइड हिस्ट्री (${rides.length})`}
                  </div>
                  {rides.length === 0 ? (
                    <p className="text-[11px]" style={{ color: C.inkSoft }}>{lang === "en" ? "No bookings yet." : lang === "mr" ? "अजून कोणतीही बुकिंग नाही." : "अभी तक कोई बुकिंग नहीं।"}</p>
                  ) : (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {rides.map((b) => {
                        const sm = statusMeta[b.status] || statusMeta.Cancelled;
                        return (
                          <div key={b.id} className="rounded-lg p-2" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-bold truncate" style={{ color: C.ink }}>{b.pickup} → {b.drop}</span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ color: sm.color, background: sm.bg }}>{sm.label}</span>
                            </div>
                            <div className="text-[10px] mt-0.5" style={{ color: C.inkSoft }}>
                              {b.weight} {lang === "en" ? "kg" : lang === "mr" ? "किलो" : "किग्रा"}
                            </div>
                            <div className="text-[10px] flex items-center justify-between mt-1">
                              <span style={{ color: C.inkSoft }}>{b.driverName ? `${lang === "en" ? "Driver" : lang === "mr" ? "ड्रायव्हर" : "ड्राइवर"}: ${b.driverName}` : (lang === "en" ? "No driver assigned" : lang === "mr" ? "ड्रायव्हर निश्चित नाही" : "ड्राइवर तय नहीं")} · {bookingDate(b)}</span>
                              {b.fare != null && <span className="font-bold" style={{ color: C.marigoldDeep, fontFamily: monoFont }}>{fmt(b.fare)}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${C.line}` }}>
                    {confirmDeleteId === c.mobile ? (
                      <>
                        <span className="text-[11px]" style={{ color: C.inkSoft }}>{lang === "en" ? "Delete permanently?" : lang === "mr" ? "कायमचे काढून टाकायचे?" : "हमेशा के लिए हटाएं?"}</span>
                        <button onClick={() => { deleteCustomer(c.mobile); setConfirmDeleteId(null); }} className="text-sm font-bold px-3.5 py-2 rounded-lg" style={{ color: "#fff", background: C.safety }}>
                          {lang === "en" ? "Yes, delete" : lang === "mr" ? "हो, काढा" : "हां, हटाएं"}
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)} className="text-sm font-bold px-3.5 py-2 rounded-lg" style={{ color: C.inkSoft, background: C.bg }}>
                          {lang === "en" ? "Cancel" : lang === "mr" ? "रद्द करा" : "रद्द करें"}
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(c.mobile)} className="text-sm font-bold px-3.5 py-2 rounded-lg" style={{ color: C.inkSoft, background: C.bg, border: `1px solid ${C.line}` }}>
                        {lang === "en" ? "Delete" : lang === "mr" ? "काढा" : "हटाएं"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AdminNotify({ drivers, customers, adminNotifications, deleteAdminNotification, lang }) {
  const [audience, setAudience] = useState("driver"); // 'driver' | 'customer'
  const [target, setTarget] = useState("all");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const audiencePeople = audience === "driver" ? (drivers || []) : (customers || []);
  const searchedPeople = search.trim()
    ? audiencePeople.filter((p) => (p.name || "").toLowerCase().includes(search.trim().toLowerCase()))
    : audiencePeople;
  // Each audience gets its own section of the sent-notifications list below
  // (older ones have no toRole at all -- those only ever went to drivers,
  // back before the customer audience existed, so they fall under "driver").
  const audienceNotifications = (adminNotifications || []).filter((n) => (n.toRole || "driver") === audience);
  const allLabel = lang === "en"
    ? (audience === "driver" ? "All Drivers" : "All Customers")
    : lang === "mr"
    ? (audience === "driver" ? "सर्व ड्रायव्हर" : "सर्व कस्टमर")
    : (audience === "driver" ? "सभी ड्राइवर" : "सभी कस्टमर");
  const formatTime = (createdAt) => (createdAt?.toDate ? createdAt.toDate().toLocaleString(lang === "en" ? "en-IN" : lang === "mr" ? "mr-IN" : "hi-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
  const send = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    setError("");
    const result = await sendAdminNotification(target, message.trim(), audience);
    setSending(false);
    if (result.ok) setMessage("");
    else setError(lang === "en" ? "Couldn't send — try again." : lang === "mr" ? "पाठवू शकलो नाही — पुन्हा प्रयत्न करा." : "भेज नहीं सका — फिर कोशिश करें।");
  };
  const notifLabel = (n) => {
    const label = n.toRole === "customer"
      ? (lang === "en" ? "All Customers" : lang === "mr" ? "सर्व कस्टमर" : "सभी कस्टमर")
      : (lang === "en" ? "All Drivers" : lang === "mr" ? "सर्व ड्रायव्हर" : "सभी ड्राइवर");
    if (n.target === "all") return label;
    if (Array.isArray(n.target)) return n.targetName || (lang === "en" ? `${n.target.length} drivers` : lang === "mr" ? `${n.target.length} ड्रायव्हर` : `${n.target.length} ड्राइवर`);
    return n.targetName || n.target;
  };
  return (
    <div className="rounded-xl p-4 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
      <div className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: C.ink }}><Bell size={16} /> {lang === "en" ? "Send Notification" : lang === "mr" ? "सूचना पाठवा" : "सूचना भेजें"}</div>
      <div className="flex gap-2 mb-3">
        {["driver", "customer"].map((a) => (
          <button key={a} onClick={() => { setAudience(a); setTarget("all"); setSearch(""); setPickerOpen(false); }} className="flex-1 rounded-lg py-3 text-base font-bold"
            style={{ background: audience === a ? C.navy : C.paper, color: audience === a ? "#fff" : C.inkSoft, border: `1.5px solid ${audience === a ? C.navy : C.line}` }}>
            {a === "driver" ? (lang === "en" ? "Drivers" : lang === "mr" ? "ड्रायव्हर" : "ड्राइवर") : (lang === "en" ? "Customers" : lang === "mr" ? "कस्टमर" : "कस्टमर")}
          </button>
        ))}
      </div>
      <label className="text-[11px] font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Send to" : lang === "mr" ? "कोणाला पाठवायचे" : "किसे भेजें"}</label>
      <div className="relative mb-2">
        <input type="text" value={search}
          onFocus={() => setPickerOpen(true)}
          onBlur={() => setPickerOpen(false)}
          onChange={(e) => { setSearch(e.target.value); setPickerOpen(true); }}
          placeholder={allLabel}
          className="w-full rounded-lg px-3 py-2 text-xs outline-none" style={{ border: `1px solid ${C.line}`, color: C.ink }} />
        {pickerOpen && (
          <div className="absolute left-0 right-0 mt-1 rounded-lg shadow-lg overflow-y-auto z-10" style={{ background: C.paper, border: `1px solid ${C.line}`, maxHeight: 200 }}>
            <div onMouseDown={() => { setTarget("all"); setSearch(""); setPickerOpen(false); }}
              className="px-3 py-2 text-xs font-bold cursor-pointer" style={{ color: C.navy, borderBottom: `1px solid ${C.line}` }}>
              {allLabel}
            </div>
            {searchedPeople.length === 0 ? (
              <div className="px-3 py-2 text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "No matches" : lang === "mr" ? "जुळणारे काही नाही" : "कोई मैच नहीं"}</div>
            ) : (
              searchedPeople.map((p) => (
                <div key={p.mobile} onMouseDown={() => { setTarget(p.mobile); setSearch(p.name); setPickerOpen(false); }}
                  className="px-3 py-2 text-xs cursor-pointer" style={{ color: C.ink }}>
                  {p.name}
                </div>
              ))
            )}
          </div>
        )}
      </div>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={lang === "en" ? "Write a message..." : lang === "mr" ? "संदेश लिहा..." : "संदेश लिखें..."} className="w-full rounded-lg px-3 py-2 text-xs outline-none mb-2" rows={3} style={{ border: `1px solid ${C.line}`, color: C.ink }} />
      {error && <div className="text-[11px] font-bold mb-2" style={{ color: C.safety }}>{error}</div>}
      <button onClick={send} disabled={!message.trim() || sending} className="w-full rounded-lg py-3.5 font-bold text-base mb-4" style={{ background: message.trim() && !sending ? C.marigold : "#E0E0E0", color: message.trim() && !sending ? "#000000" : "#9AA3B0" }}>
        {sending ? (lang === "en" ? "Sending..." : lang === "mr" ? "पाठवले जात आहे..." : "भेजा जा रहा है...") : (lang === "en" ? "Send" : lang === "mr" ? "पाठवा" : "भेजें")}
      </button>
      <div className="text-[11px] font-semibold mb-2" style={{ color: C.inkSoft }}>
        {audience === "driver"
          ? (lang === "en" ? "Sent Notifications — Drivers" : lang === "mr" ? "पाठवलेल्या सूचना — ड्रायव्हर" : "भेजी गई सूचनाएं — ड्राइवर")
          : (lang === "en" ? "Sent Notifications — Customers" : lang === "mr" ? "पाठवलेल्या सूचना — कस्टमर" : "भेजी गई सूचनाएं — कस्टमर")}
      </div>
      <div className="space-y-2">
        {audienceNotifications.length === 0 && <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "No notifications sent yet." : lang === "mr" ? "अजून कोणतीही सूचना पाठवली गेली नाही." : "अभी कोई सूचना नहीं भेजी गई।"}</p>}
        {audienceNotifications.map((n) => (
          <div key={n.id} className="rounded-lg p-2.5" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold" style={{ color: C.ink }}>
                <span className="px-1.5 py-0.5 rounded mr-1" style={{ background: n.toRole === "customer" ? C.success : C.navy, color: "#fff", fontSize: 9 }}>
                  {n.toRole === "customer" ? (lang === "en" ? "Customer" : lang === "mr" ? "कस्टमर" : "कस्टमर") : (lang === "en" ? "Driver" : lang === "mr" ? "ड्रायव्हर" : "ड्राइवर")}
                </span>
                {notifLabel(n)}
              </span>
              <span className="text-[10px] shrink-0" style={{ color: C.inkSoft }}>{formatTime(n.createdAt)}</span>
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: C.inkSoft }}>{n.message}</div>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <div className="text-[10px]" style={{ color: n.recipientCount > 0 ? C.success : C.safety }}>
                {n.recipientCount > 0
                  ? (lang === "en" ? `Delivered to ${n.recipientCount} device${n.recipientCount > 1 ? "s" : ""}` : lang === "mr" ? `${n.recipientCount} डिव्हाइसवर पोहोचली` : `${n.recipientCount} डिवाइस पर पहुंची`)
                  : (lang === "en" ? "No device had notifications enabled" : lang === "mr" ? "कोणत्याही डिव्हाइसवर नोटिफिकेशन चालू नव्हते" : "किसी डिवाइस पर नोटिफिकेशन चालू नहीं था")}
              </div>
              {confirmDeleteId === n.id ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px]" style={{ color: C.inkSoft }}>{lang === "en" ? "Delete?" : lang === "mr" ? "काढायचे?" : "हटाएं?"}</span>
                  <button onClick={() => { deleteAdminNotification?.(n.id); setConfirmDeleteId(null); }} className="text-[10px] font-bold px-2 py-1 rounded-md" style={{ color: "#fff", background: C.safety }}>
                    {lang === "en" ? "Yes" : lang === "mr" ? "हो" : "हां"}
                  </button>
                  <button onClick={() => setConfirmDeleteId(null)} className="text-[10px] font-bold px-2 py-1 rounded-md" style={{ color: C.inkSoft, background: C.bg }}>
                    {lang === "en" ? "Cancel" : lang === "mr" ? "रद्द करा" : "रद्द करें"}
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmDeleteId(n.id)} className="text-[10px] font-bold px-2 py-1 rounded-md shrink-0" style={{ color: C.safety, background: C.paper, border: `1px solid ${C.safety}` }}>
                  {lang === "en" ? "Delete" : lang === "mr" ? "काढा" : "हटाएं"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminSettings({ commissionPct, setCommissionPct, bonusPct, setBonusPct, minWallet, setMinWallet, latestVersionCode, setLatestVersionCode, updateUrl, setUpdateUrl, latestAdminVersionCode, setLatestAdminVersionCode, adminUpdateUrl, setAdminUpdateUrl, bugs, setBugStatus, addBug, lang }) {
  // Commission/bonus/min-wallet are edited as a draft and only written to
  // Firestore on Save, instead of firing a write on every keystroke. Stays
  // in sync with the live values as long as there's no unsaved edit, so an
  // external change (e.g. trial mode toggling commission to 0) still shows
  // up immediately.
  const [draft, setDraft] = useState({ commissionPct, bonusPct, minWallet, latestVersionCode: latestVersionCode || "", updateUrl: updateUrl || "", latestAdminVersionCode: latestAdminVersionCode || "", adminUpdateUrl: adminUpdateUrl || "" });
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!dirty) setDraft({ commissionPct, bonusPct, minWallet, latestVersionCode: latestVersionCode || "", updateUrl: updateUrl || "", latestAdminVersionCode: latestAdminVersionCode || "", adminUpdateUrl: adminUpdateUrl || "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commissionPct, bonusPct, minWallet, latestVersionCode, updateUrl, latestAdminVersionCode, adminUpdateUrl, dirty]);
  const updateDraft = (patch) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); setSaved(false); };
  const saveSettings = () => {
    setCommissionPct(draft.commissionPct);
    setBonusPct(draft.bonusPct);
    setMinWallet(draft.minWallet);
    setLatestVersionCode(draft.latestVersionCode === "" ? null : Number(draft.latestVersionCode));
    setUpdateUrl(draft.updateUrl.trim());
    setLatestAdminVersionCode(draft.latestAdminVersionCode === "" ? null : Number(draft.latestAdminVersionCode));
    setAdminUpdateUrl(draft.adminUpdateUrl.trim());
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };
  return (
    <div>
    <div className="rounded-xl p-4 shadow-sm mb-5" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
      <div className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: C.ink }}><Settings2 size={16} /> {lang === "en" ? "System Settings" : lang === "mr" ? "सिस्टम सेटिंग्स" : "सिस्टम सेटिंग्स"}</div>

      <div className="rounded-lg p-3 mb-4" style={{ background: C.success }}>
        <div className="text-xs font-bold" style={{ color: "#FFFFFF" }}>{lang === "en" ? "On the date of login, a 30-day trial mode is initiated for the new driver and the customer" : lang === "mr" ? "लॉगिनच्या तारखेपासून, नवीन ड्रायव्हर आणि कस्टमरसाठी 30 दिवसांचा ट्रायल मोड आपोआप सुरू होतो" : "लॉगिन की तारीख से, नए ड्राइवर और कस्टमर के लिए 30 दिन का ट्रायल मोड अपने आप शुरू हो जाता है"}</div>
        <div className="text-[11px] font-bold mt-1" style={{ color: "#FFFFFF" }}>{lang === "en" ? "No commission or minimum balance applies during that driver's own trial. The rates below apply automatically once it ends." : lang === "mr" ? "त्या ड्रायव्हरच्या ट्रायल दरम्यान कोणतेही कमिशन किंवा किमान बॅलन्स लागू होत नाही. ट्रायल संपल्यावर खाली दिलेले दर आपोआप लागू होतील." : "उस ड्राइवर के ट्रायल के दौरान कोई कमीशन या न्यूनतम बैलेंस लागू नहीं होता। ट्रायल खत्म होने पर नीचे दी गई दरें अपने आप लागू हो जाएंगी।"}</div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs font-bold" style={{ color: C.ink }}>{lang === "en" ? "Commission Percentage" : lang === "mr" ? "कमिशन टक्केवारी" : "कमीशन प्रतिशत"}</div>
          <div className="text-[11px] font-bold" style={{ color: C.inkSoft }}>{lang === "en" ? "This % is cut from the driver's wallet the moment a bid is accepted, once their trial has ended" : lang === "mr" ? "ट्रायल संपल्यानंतर, बिड अ‍ॅक्सेप्ट होताच हे % ड्रायव्हरच्या वॉलेटमधून कापले जाईल" : "ट्रायल खत्म होने के बाद, बिड एक्सेप्ट होते ही यह % ड्राइवर के वॉलेट से कटेगा"}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <input type="number" value={draft.commissionPct} onChange={(e) => updateDraft({ commissionPct: Math.max(0, Number(e.target.value) || 0) })}
            className="w-24 rounded-lg px-3 py-2 text-lg font-bold text-right" style={{ fontFamily: monoFont, border: `1.5px solid ${C.line}`, color: C.ink }} />
          <span className="text-base font-bold" style={{ color: C.ink }}>%</span>
        </div>
      </div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs font-bold" style={{ color: C.ink }}>{lang === "en" ? "Driver Bonus Percentage" : lang === "mr" ? "ड्रायव्हर बोनस टक्केवारी" : "ड्राइवर बोनस प्रतिशत"}</div>
          <div className="text-[11px] font-bold" style={{ color: C.inkSoft }}>{lang === "en" ? "This % out of the commission goes back to the driver's bonus account" : lang === "mr" ? "कमिशनमधून हे % ड्रायव्हरच्या बोनस खात्यात परत जाईल" : "कमीशन में से यह % ड्राइवर के बोनस अकाउंट में वापस जाएगा"}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <input type="number" value={draft.bonusPct} onChange={(e) => updateDraft({ bonusPct: Math.max(0, Number(e.target.value) || 0) })}
            className="w-24 rounded-lg px-3 py-2 text-lg font-bold text-right" style={{ fontFamily: monoFont, border: `1.5px solid ${C.line}`, color: C.ink }} />
          <span className="text-base font-bold" style={{ color: C.ink }}>%</span>
        </div>
      </div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs font-bold" style={{ color: C.ink }}>{lang === "en" ? "Minimum Wallet Balance" : lang === "mr" ? "किमान वॉलेट बॅलन्स" : "न्यूनतम वॉलेट बैलेंस"}</div>
          <div className="text-[11px] font-bold" style={{ color: C.inkSoft }}>{lang === "en" ? "Driver must maintain this balance to keep the app active" : lang === "mr" ? "अ‍ॅप अ‍ॅक्टिव्ह ठेवण्यासाठी ड्रायव्हरला हे बॅलन्स ठेवावे लागेल" : "ऐप एक्टिव रखने के लिए ड्राइवर को यह बैलेंस रखना होगा"}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-base font-bold" style={{ color: C.ink }}>₹</span>
          <input type="number" value={draft.minWallet} onChange={(e) => updateDraft({ minWallet: Math.max(0, Number(e.target.value) || 0) })}
            className="w-24 rounded-lg px-3 py-2 text-lg font-bold text-right" style={{ fontFamily: monoFont, border: `1.5px solid ${C.line}`, color: C.ink }} />
        </div>
      </div>

      <div className="rounded-lg p-3 mt-2 mb-4" style={{ background: C.bg, border: `1px solid ${C.line}` }}>
        <div className="text-xs font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "Force Update (Play Store)" : lang === "mr" ? "फोर्स अपडेट (Play Store)" : "फोर्स अपडेट (Play Store)"}</div>
        <div className="text-[11px] font-bold mb-3" style={{ color: C.inkSoft }}>{lang === "en" ? "Set this to the versionCode of whatever you just published to the Production track — anyone on an older install gets blocked until they update. Leave blank to turn this off." : lang === "mr" ? "तुम्ही नुकतीच Production track वर पब्लिश केलेल्या versionCode इथे टाका — जुन्या व्हर्जनवरील सर्वांना अपडेट होईपर्यंत ब्लॉक केले जाईल. बंद करण्यासाठी रिकामे ठेवा." : "आपने अभी-अभी Production track पर publish किया हुआ versionCode यहां डालें — पुराने वर्शन वाले सभी को अपडेट होने तक ब्लॉक कर दिया जाएगा। बंद करने के लिए खाली छोड़ें।"}</div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-bold" style={{ color: C.ink }}>{lang === "en" ? "Required versionCode" : lang === "mr" ? "आवश्यक versionCode" : "आवश्यक versionCode"}</div>
          <input type="number" placeholder={lang === "en" ? "Off" : lang === "mr" ? "बंद" : "बंद"} value={draft.latestVersionCode} onChange={(e) => updateDraft({ latestVersionCode: e.target.value })}
            className="w-24 rounded-lg px-3 py-2 text-lg font-bold text-right" style={{ fontFamily: monoFont, border: `1.5px solid ${C.line}`, color: C.ink }} />
        </div>
        <div className="text-xs font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "Play Store link (optional)" : lang === "mr" ? "Play Store लिंक (ऐच्छिक)" : "Play Store लिंक (वैकल्पिक)"}</div>
        <input type="text" placeholder={PLAY_STORE_URL} value={draft.updateUrl} onChange={(e) => updateDraft({ updateUrl: e.target.value })}
          className="w-full rounded-lg px-3 py-2 text-sm font-semibold" style={{ border: `1.5px solid ${C.line}`, color: C.ink }} />
      </div>

      <div className="rounded-lg p-3 mt-2 mb-4" style={{ background: C.bg, border: `1px solid ${C.line}` }}>
        <div className="text-xs font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "Force Update (Admin app)" : lang === "mr" ? "फोर्स अपडेट (Admin अ‍ॅप)" : "फोर्स अपडेट (Admin ऐप)"}</div>
        <div className="text-[11px] font-bold mb-3" style={{ color: C.inkSoft }}>
          {lang === "en" ? "Separate from the field above — this is a completely different install (its own versionCode, sideloaded rather than Play Store). Set this only when you've actually sideloaded the new Admin APK somewhere admins can reach it, and paste that link below. Leave blank to turn off." : lang === "mr" ? "वरच्या फील्डपेक्षा वेगळे — ही एक वेगळी इन्स्टॉल आहे (स्वतःचा versionCode, Play Store नाही तर साइडलोड). नवीन Admin APK प्रत्यक्ष साइडलोड करून अ‍ॅडमिन्सना उपलब्ध करून दिल्यावरच हे सेट करा, आणि खाली तो लिंक टाका. बंद करण्यासाठी रिकामे ठेवा." : "ऊपर वाले फील्ड से अलग — यह एक बिल्कुल अलग इंस्टॉल है (अपना versionCode, Play Store नहीं बल्कि साइडलोड)। नया Admin APK असल में साइडलोड करके एडमिन तक पहुंचाने के बाद ही इसे सेट करें, और नीचे वह लिंक डालें। बंद करने के लिए खाली छोड़ें।"}
        </div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-bold" style={{ color: C.ink }}>{lang === "en" ? "Required versionCode" : lang === "mr" ? "आवश्यक versionCode" : "आवश्यक versionCode"}</div>
          <input type="number" placeholder={lang === "en" ? "Off" : lang === "mr" ? "बंद" : "बंद"} value={draft.latestAdminVersionCode} onChange={(e) => updateDraft({ latestAdminVersionCode: e.target.value })}
            className="w-24 rounded-lg px-3 py-2 text-lg font-bold text-right" style={{ fontFamily: monoFont, border: `1.5px solid ${C.line}`, color: C.ink }} />
        </div>
        <div className="text-xs font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "APK download link" : lang === "mr" ? "APK डाउनलोड लिंक" : "APK डाउनलोड लिंक"}</div>
        <input type="text" placeholder="https://..." value={draft.adminUpdateUrl} onChange={(e) => updateDraft({ adminUpdateUrl: e.target.value })}
          className="w-full rounded-lg px-3 py-2 text-sm font-semibold" style={{ border: `1.5px solid ${C.line}`, color: C.ink }} />
      </div>

      {saved && <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold" style={{ color: C.success }}><CheckCircle2 size={13} /> {lang === "en" ? "Settings saved" : lang === "mr" ? "सेटिंग्स सेव्ह झाल्या" : "सेटिंग्स सेव हो गईं"}</div>}
      <button onClick={saveSettings} disabled={!dirty} className="w-full rounded-lg py-3.5 font-bold text-base"
        style={{ background: dirty ? "#0052CC" : "#E0E0E0", color: dirty ? "#fff" : "#9AA3B0" }}>
        {lang === "en" ? "Save Changes" : lang === "mr" ? "बदल सेव्ह करा" : "बदलाव सेव करें"}
      </button>
    </div>
    <AdminBugTracker bugs={bugs} setBugStatus={setBugStatus} addBug={addBug} lang={lang} />
    </div>
  );
}

function AdminFinance({ tripLog, lang }) {
  // Commission is deliberately held at 0 here too (see driverRespondBooking)
  // — fare is a real, fixed, calculated number again, but this report
  // shouldn't show non-zero "would-be" commission while actual wallet
  // deductions are still intentionally off; would be misleading otherwise.
  const activeCommissionPct = 0;
  const totalCommission = tripLog.filter((t) => t.status !== "Cancelled").reduce((s, t) => s + t.fare * (activeCommissionPct / 100), 0);
  const downloadReport = () => {
    const header = "Driver,Route,Fare,Commission,Status\n";
    const rows = tripLog.map((t) => `${t.driverName},"${t.pickup} to ${t.drop}",${t.fare},${t.status === "Cancelled" ? 0 : Math.round(t.fare * (activeCommissionPct / 100))},${t.status}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "commission-report.csv"; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="rounded-xl p-4 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-bold flex items-center gap-1.5" style={{ color: C.ink }}><BarChart3 size={16} /> {lang === "en" ? "Reports — Commission & Earnings" : lang === "mr" ? "रिपोर्ट्स — कमिशन आणि कमाई" : "रिपोर्ट्स — कमीशन और कमाई"}</div>
        <button onClick={downloadReport} disabled={tripLog.length === 0} className="text-sm font-semibold flex items-center gap-1 px-3.5 py-2.5 rounded-lg"
          style={{ color: tripLog.length ? "#FFFFFF" : C.inkSoft, background: tripLog.length ? C.marigoldDeep : "#E5E5E5" }}>
          <Download size={12} /> {lang === "en" ? "Download CSV" : lang === "mr" ? "एक्सेल डाउनलोड करा" : "एक्सेल डाउनलोड करें"}
        </button>
      </div>
      <div className="rounded-lg p-3 mb-3" style={{ background: C.success }}>
        <div className="text-[11px]" style={{ color: "#FFFFFF" }}>{lang === "en" ? `Total commission so far (${activeCommissionPct}%)` : lang === "mr" ? `आजपर्यंतचे एकूण कमिशन (${activeCommissionPct}%)` : `आज का कुल कमीशन (${activeCommissionPct}%)`}</div>
        <div className="text-xl font-bold" style={{ color: "#FFFFFF", fontFamily: monoFont }}>{fmt(totalCommission)}</div>
      </div>
      {tripLog.length === 0 ? <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "No bid has been accepted yet." : lang === "mr" ? "आज अजून कोणतीही बिड अ‍ॅक्सेप्ट झाली नाही." : "आज अभी तक कोई बिड एक्सेप्ट नहीं हुई।"}</p> : (
        <table className="w-full text-xs">
          <thead><tr style={{ color: C.inkSoft }}>
            <th className="text-left font-semibold pb-1">{lang === "en" ? "Driver" : lang === "mr" ? "ड्रायव्हर" : "ड्राइवर"}</th>
            <th className="text-left font-semibold pb-1">{lang === "en" ? "Route" : lang === "mr" ? "रूट" : "रूट"}</th>
            <th className="text-right font-semibold pb-1">{lang === "en" ? "Fare" : lang === "mr" ? "भाडे" : "भाड़ा"}</th>
            <th className="text-right font-semibold pb-1">{lang === "en" ? "Commission" : lang === "mr" ? "कमिशन" : "कमीशन"}</th>
          </tr></thead>
          <tbody>
            {tripLog.map((t) => (
              <tr key={t.id} style={{ borderTop: `1px solid ${C.line}` }}>
                <td className="py-1.5" style={{ color: C.ink }}>{t.driverName}</td>
                <td className="py-1.5" style={{ color: C.inkSoft }}>{t.pickup} → {t.drop}</td>
                <td className="py-1.5 text-right" style={{ fontFamily: monoFont, color: C.ink }}>{fmt(t.fare)}</td>
                <td className="py-1.5 text-right" style={{ fontFamily: monoFont, color: t.status === "Cancelled" ? C.safety : C.success }}>
                  {t.status === "Cancelled" ? (lang === "en" ? "Cancelled (refunded)" : lang === "mr" ? "रद्द (परत)" : "रद्द (वापस)") : fmt(t.fare * (activeCommissionPct / 100))}
                </td>
              </tr>
            ))}

          </tbody>
        </table>
      )}
    </div>
  );
}

// Admin's private expense tracker — for keeping receipts/bills organized
// so they can be handed to a CA at tax time (server bills, ads, fuel,
// office costs, etc.). Entirely separate from driver commission/earnings,
// which already live under the Reports tab.
function AdminExpenses({ expenses, expenseCategories, addExpense, addExpenseCategory, lang }) {
  const categories = [...DEFAULT_EXPENSE_CATEGORIES, ...Object.values(expenseCategories || {}).filter((c) => !DEFAULT_EXPENSE_CATEGORIES.some((d) => d.hi === c.hi))];
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const blankForm = { date: todayISO(), category: categories[0]?.hi || "", amount: "", note: "", photo: null };
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const now = new Date();
  const totalAllTime = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalThisMonth = expenses.filter((e) => {
    const d = e.date ? new Date(e.date) : null;
    return d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).reduce((s, e) => s + (e.amount || 0), 0);
  const receiptsCount = expenses.filter((e) => e.photoUrl).length;

  const resetForm = () => { setForm({ ...blankForm, category: categories[0]?.hi || "" }); setAddingCategory(false); setNewCategoryName(""); setSaveError(""); };
  const openAdd = (prefill = {}) => { resetForm(); setForm((f) => ({ ...f, ...prefill })); setShowAdd(true); };

  const submit = async () => {
    if (!form.amount || Number(form.amount) <= 0) return;
    setSaving(true);
    setSaveError("");
    try {
      const id = genId("EXP");
      let photoUrl = null;
      if (form.photo) {
        const uploaded = await uploadPhoto(form.photo, `expenses/${id}.jpg`);
        photoUrl = uploaded.url;
      }
      await addExpense({ id, date: form.date, category: form.category, amount: Number(form.amount), note: form.note.trim(), photoUrl });
      setShowAdd(false);
      resetForm();
    } catch (e) {
      console.error(e);
      setSaveError(lang === "en" ? "Couldn't save — please try again." : lang === "mr" ? "सेव्ह होऊ शकले नाही — पुन्हा प्रयत्न करा." : "सेव नहीं हो सका — दोबारा कोशिश करें।");
    } finally {
      setSaving(false);
    }
  };

  const downloadReport = () => {
    const header = "Date,Category,Amount,Description,Photo Attached\n";
    const rows = [...expenses].sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((e) => `${e.date},"${e.category}",${e.amount},"${(e.note || "").replace(/"/g, "'")}",${e.photoUrl ? "Yes" : "No"}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "expense-report.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const recent = [...expenses].sort((a, b) => (a.date < b.date ? 1 : -1));
  // Expense History below shows every month ever recorded, but the total
  // tile above only counts the current month — without some marker, the two
  // numbers look inconsistent even though each is correct for what it says.
  // A month divider (recent is already sorted newest-first, so same-month
  // entries are always consecutive) makes the boundary visible instead.
  const currentMonthKey = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  const monthLabel = (key) => {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(lang === "en" ? "en-IN" : lang === "mr" ? "mr-IN" : "hi-IN", { month: "long", year: "numeric" });
  };

  return (
    <div>
      <div className="text-xs font-bold mb-2" style={{ color: C.inkSoft }}>{lang === "en" ? "Expense Tools:" : lang === "mr" ? "खर्चाचे टूल:" : "खर्चे के टूल:"}</div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <button onClick={() => openAdd()} className="rounded-xl py-5 flex flex-col items-center gap-1.5" style={{ background: C.marigold }}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#FFFFFF" }}><Plus size={18} color={C.navy} /></div>
          <span className="text-[11px] font-bold" style={{ color: "#000000" }}>{lang === "en" ? "New Expense" : lang === "mr" ? "नवीन खर्च" : "नया खर्च"}</span>
        </button>
        <PhotoPicker label={lang === "en" ? "Attach a bill photo" : lang === "mr" ? "बिलाचा फोटो जोडा" : "बिल की फोटो जोड़ें"} lang={lang} onSelect={(file) => openAdd({ photo: file })}>
          <div className="rounded-xl py-4 flex flex-col items-center gap-1.5 cursor-pointer" style={{ background: C.safety }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#FFFFFF" }}><Camera size={16} color={C.safety} /></div>
            <span className="text-[11px] font-bold text-center" style={{ color: "#FFFFFF" }}>{lang === "en" ? "Camera / Bill" : lang === "mr" ? "कॅमेरा / बिल" : "कैमरा / बिल"}</span>
          </div>
        </PhotoPicker>
        <button onClick={downloadReport} disabled={expenses.length === 0} className="rounded-xl py-5 flex flex-col items-center gap-1.5" style={{ background: C.success, opacity: expenses.length ? 1 : 0.5 }}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#FFFFFF" }}><Download size={16} color={C.success} /></div>
          <span className="text-[11px] font-bold" style={{ color: "#FFFFFF" }}>Excel {lang === "en" ? "Report" : lang === "mr" ? "रिपोर्ट" : "रिपोर्ट"}</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatTile label={lang === "en" ? "Total expense (all time)" : lang === "mr" ? "एकूण खर्च (सर्व वेळ)" : "कुल खर्च (सभी समय)"} value={fmt(totalAllTime)} color={C.ink} />
        <StatTile label={lang === "en" ? "Monthly expense" : lang === "mr" ? "मासिक खर्च" : "मासिक खर्च"} value={fmt(totalThisMonth)} color={C.marigoldDeep} />
        <div className="col-span-2">
          <StatTile label={lang === "en" ? "Bills" : lang === "mr" ? "बिले" : "बिल"} value={`${receiptsCount} ${lang === "en" ? "bills" : lang === "mr" ? "बिल" : "बिल"}`} color={C.success} />
        </div>
      </div>

      <div className="rounded-xl p-4 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
        <div className="text-sm font-bold mb-2 flex items-center gap-1.5" style={{ color: C.ink }}><ClipboardList size={16} /> {lang === "en" ? "Expense History" : lang === "mr" ? "खर्चांचा इतिहास" : "खर्चों का इतिहास"}</div>
        {recent.length === 0 ? (
          <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "No expenses recorded yet." : lang === "mr" ? "अजून कोणताही खर्च नोंदवला गेला नाही." : "अभी तक कोई खर्च दर्ज नहीं हुआ।"}</p>
        ) : (
          <div className="space-y-2">
            {(() => {
              let lastMonthKey = null;
              return recent.map((e) => {
                const monthKey = (e.date || "").slice(0, 7);
                const showDivider = monthKey !== lastMonthKey;
                lastMonthKey = monthKey;
                const isCurrentMonth = monthKey === currentMonthKey;
                const cat = categories.find((c) => c.hi === e.category || c.en === e.category);
                return (
                  <React.Fragment key={e.id}>
                    {showDivider && (
                      <div className="text-[11px] font-bold pt-1.5 pb-0.5" style={{ color: isCurrentMonth ? C.marigoldDeep : C.inkSoft }}>
                        {monthLabel(monthKey)}
                        {isCurrentMonth ? (lang === "en" ? " — counted in the total above" : lang === "mr" ? " — वरील एकूणमध्ये समाविष्ट" : " — ऊपर के कुल में शामिल") : ""}
                      </div>
                    )}
                    <div className="rounded-lg p-2.5" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-bold truncate" style={{ color: C.ink }}>{e.note || (cat ? (lang === "en" ? cat.en : lang === "mr" ? (cat.mr || cat.hi) : cat.hi) : e.category)}</div>
                          <div className="text-[10px]" style={{ color: C.inkSoft }}>{e.date} · {cat ? `${cat.icon} ${lang === "en" ? cat.en : lang === "mr" ? (cat.mr || cat.hi) : cat.hi}` : e.category}</div>
                        </div>
                        <div className="text-sm font-bold shrink-0" style={{ color: C.ink, fontFamily: monoFont }}>{fmt(e.amount)}</div>
                      </div>
                      {e.photoUrl && (
                        <a href={e.photoUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-semibold mt-1.5 inline-flex items-center gap-1" style={{ color: C.success }}>
                          <CheckCircle2 size={11} /> {lang === "en" ? "Photo secured" : lang === "mr" ? "फोटो सुरक्षित" : "फोटो सुरक्षित"}
                        </a>
                      )}
                    </div>
                  </React.Fragment>
                );
              });
            })()}
          </div>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(42,33,28,0.6)" }} onClick={() => setShowAdd(false)}>
          <div className="w-full max-w-sm rounded-t-2xl max-h-[85vh] overflow-y-auto" style={{ background: C.paper }} onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ background: C.navy }}>
              <h3 className="text-sm font-bold flex items-center gap-1.5" style={{ color: "#fff" }}><ClipboardList size={15} /> {lang === "en" ? "Add New Expense" : lang === "mr" ? "नवीन खर्च नोंदवा" : "नया खर्च दर्ज करें"}</h3>
              <button onClick={() => setShowAdd(false)} className="text-base font-bold" style={{ color: "#fff" }}>✕</button>
            </div>
            <div className="p-5 space-y-3">
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ border: `1px solid ${C.line}`, color: C.ink }} />

              <div className="text-xs font-bold" style={{ color: C.ink }}>{lang === "en" ? "Choose expense category:" : lang === "mr" ? "खर्चाची कॅटेगरी निवडा:" : "खर्च की कैटेगरी चुनें:"}</div>
              <div className="space-y-1.5">
                {categories.map((c) => {
                  const active = form.category === c.hi;
                  return (
                    <button key={c.key} type="button" onClick={() => setForm({ ...form, category: c.hi })}
                      className="w-full rounded-lg px-4 py-3.5 flex items-center justify-between"
                      style={{ background: active ? C.marigoldDeep : C.bg, border: `1.5px solid ${active ? C.marigoldDeep : C.line}` }}>
                      <span className="text-xs font-bold flex items-center gap-2" style={{ color: active ? "#FFFFFF" : C.ink }}>
                        <span>{c.icon}</span> {lang === "en" ? c.en : lang === "mr" ? (c.mr || c.hi) : c.hi}
                      </span>
                      <span className="w-4 h-4 rounded-full shrink-0" style={{ border: `2px solid ${active ? C.marigoldDeep : C.line}`, background: active ? C.marigoldDeep : "transparent" }} />
                    </button>
                  );
                })}
              </div>

              {addingCategory ? (
                <div className="flex gap-2">
                  <input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder={lang === "en" ? "New category name" : lang === "mr" ? "नवीन कॅटेगरीचे नाव" : "नई कैटेगरी का नाम"}
                    className="flex-1 min-w-0 rounded-lg px-3 py-2 text-xs outline-none" style={{ border: `1px solid ${C.line}`, color: C.ink }} />
                  <button type="button" onClick={() => {
                    const name = newCategoryName.trim();
                    if (!name) return;
                    addExpenseCategory(name);
                    setForm((f) => ({ ...f, category: name }));
                    setNewCategoryName(""); setAddingCategory(false);
                  }} className="px-4 rounded-lg text-base font-bold text-white shadow-lg" style={{ background: C.metallicGreen }}>{lang === "en" ? "Add" : lang === "mr" ? "जोडा" : "जोड़ें"}</button>
                </div>
              ) : (
                <button type="button" onClick={() => setAddingCategory(true)} className="w-full rounded-lg py-3.5 text-base font-bold" style={{ border: `2px dashed ${C.marigold}`, color: C.marigoldDeep }}>
                  + {lang === "en" ? "Add Category" : lang === "mr" ? "नवीन कॅटेगरी जोडा (Add Category)" : "नयी कैटेगरी जोड़ें (Add Category)"}
                </button>
              )}

              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>💰 {lang === "en" ? "Amount (₹)" : lang === "mr" ? "रक्कम (₹)" : "रकम (₹)"}</label>
                <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder={lang === "en" ? "e.g. 2500" : lang === "mr" ? "उदा: 2500" : "उदा: 2500"}
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ border: `1px solid ${C.line}`, color: C.ink, fontFamily: monoFont }} />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>📝 {lang === "en" ? "Description (note)" : lang === "mr" ? "तपशील (नोंद लिहा)" : "विवरण (नोट लिखें)"}</label>
                <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={lang === "en" ? "e.g. Firebase domain & server charge" : lang === "mr" ? "उदा: फायरबेस डोमेन आणि सर्व्हर चार्ज" : "उदा: फायरबेस डोमेन और सर्वर चार्ज"}
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ border: `1px solid ${C.line}`, color: C.ink }} />
              </div>

              <PhotoPicker label={lang === "en" ? "Attach a bill photo" : lang === "mr" ? "बिलाचा फोटो जोडा" : "बिल की फोटो जोड़ें"} lang={lang} onSelect={(file) => setForm((f) => ({ ...f, photo: file }))}>
                <div className="w-full rounded-lg py-2.5 text-xs font-bold text-center cursor-pointer" style={{ background: form.photo ? C.success : C.bg, color: form.photo ? "#FFFFFF" : C.inkSoft, border: `1.5px dashed ${form.photo ? C.success : C.line}` }}>
                  {form.photo ? `✓ ${lang === "en" ? "Photo attached" : lang === "mr" ? "फोटो जोडला गेला" : "फोटो जोड़ी गई"}` : `📷 ${lang === "en" ? "Camera Photo / Choose Gallery" : lang === "mr" ? "कॅमेरा फोटो / गॅलरी निवडा" : "कैमरा फोटो / गैलरी चुनिए"}`}
                </div>
              </PhotoPicker>

              {saveError && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{saveError}</div>}

              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowAdd(false)} className="flex-1 rounded-lg py-4 text-base font-bold" style={{ background: C.paper, border: `1.5px solid ${C.line}`, color: C.inkSoft }}>{lang === "en" ? "Cancel" : lang === "mr" ? "रद्द" : "रद्द"}</button>
                <button onClick={submit} disabled={!form.amount || Number(form.amount) <= 0 || saving} className="flex-1 rounded-lg py-4 text-base font-bold text-white flex items-center justify-center gap-1.5"
                  style={{ background: (!form.amount || Number(form.amount) <= 0 || saving) ? C.line : C.success }}>
                  <CheckCircle2 size={15} /> {saving ? (lang === "en" ? "Saving..." : lang === "mr" ? "सेव्ह होत आहे..." : "सेव हो रहा है...") : (lang === "en" ? "Save Securely" : lang === "mr" ? "सुरक्षित सेव्ह करा" : "सुरक्षित सेव करें")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminPanel({ drivers, customers, updateDriverKyc, updateDriverVehicleSpec, bookings, tripLog, alerts, replyToAlert, toggleBlacklist, deleteDriver, deleteCustomer, commissionPct, setCommissionPct, minWallet, setMinWallet, returnPct, setReturnPct, bonusPct, setBonusPct, latestVersionCode, setLatestVersionCode, updateUrl, setUpdateUrl, latestAdminVersionCode, setLatestAdminVersionCode, adminUpdateUrl, setAdminUpdateUrl, fareTiers, lang, onLogout, withdrawals, approveWithdrawal, rechargeRequests, approveRecharge, vehicleTypes, addVehicleType, addManualDriver, expenses, expenseCategories, addExpense, addExpenseCategory, callLogs, adminNotifications, deleteAdminNotification, bugs, setBugStatus, addBug, routeFares, adminRouteFares, adminRouteFaresError, systemHealth }) {
  const [tab, setTab] = useState("fleet");
  // "kyc" is deliberately not in this list -- KYC review lives inside the
  // "drivers" tab now (see AdminDriverList), not its own top-level tab or
  // a separate "Pending KYC approvals" tile.
  const tabs = [["fleet", "लाइव डैशबोर्ड", MapPinned], ["drivers", "ड्राइवर", ClipboardList], ["customers", "कस्टमर", UserCircle2], ["expenses", "खर्चे (Expenses)", IndianRupee], ["settings", "सिस्टम सेटिंग्स", Settings2], ["finance", "रिपोर्ट्स", BarChart3], ["notify", "सूचना भेजें", Bell], ["alerts", "अलर्ट्स", Siren], ["callLogs", "कॉल लॉग्स", PhoneCall]];
  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LayoutDashboard size={18} color={C.marigoldDeep} />
          <h2 className="text-base font-bold" style={{ color: C.ink }}>{lang === "en" ? "Admin Control Panel" : lang === "mr" ? "अ‍ॅडमिन कंट्रोल पॅनल" : "एडमिन कंट्रोल पैनल"}</h2>
        </div>
      </div>
      {tab === "fleet" && <div className="text-sm font-bold mb-4" style={{ color: C.ink }}>{greetingWord(lang)}, {lang === "en" ? "Admin" : lang === "mr" ? "अ‍ॅडमिन" : "एडमिन"} 👋</div>}
      <div className="flex gap-2 mb-5 overflow-x-auto">
        {tabs.map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className="flex items-center gap-1.5 px-4 py-3 rounded-full text-base font-black whitespace-nowrap shadow-sm"
            style={{ background: tab === k ? C.navy : C.marigold, color: tab === k ? "#fff" : "#000000", border: `1.5px solid ${tab === k ? C.navy : C.marigoldDeep}` }}>
            <Icon size={16} /> {lang === "en" ? (EN_LABELS[k] || label) : lang === "mr" ? (MR_LABELS[k] || label) : label}
          </button>
        ))}
      </div>
      {tab === "fleet" && <AdminFleet drivers={drivers} customers={customers} bookings={bookings} tripLog={tripLog} minWallet={minWallet} lang={lang} onNavigate={setTab} onLogout={onLogout} toggleBlacklist={toggleBlacklist} updateDriverKyc={updateDriverKyc} updateDriverVehicleSpec={updateDriverVehicleSpec} vehicleTypes={vehicleTypes} routeFares={routeFares} adminRouteFares={adminRouteFares} adminRouteFaresError={adminRouteFaresError} fareTiers={fareTiers} returnPct={returnPct} setReturnPct={setReturnPct} bugs={bugs} systemHealth={systemHealth} />}
      {tab === "drivers" && <AdminDriverList drivers={drivers} toggleBlacklist={toggleBlacklist} deleteDriver={deleteDriver} updateDriverVehicleSpec={updateDriverVehicleSpec} lang={lang} vehicleTypes={vehicleTypes} addVehicleType={addVehicleType} addManualDriver={addManualDriver} />}
      {tab === "customers" && <AdminCustomers customers={customers} bookings={bookings} lang={lang} deleteCustomer={deleteCustomer} />}
      {tab === "expenses" && <AdminExpenses expenses={expenses} expenseCategories={expenseCategories} addExpense={addExpense} addExpenseCategory={addExpenseCategory} lang={lang} />}
      {tab === "settings" && <AdminSettings commissionPct={commissionPct} setCommissionPct={setCommissionPct} bonusPct={bonusPct} setBonusPct={setBonusPct} minWallet={minWallet} setMinWallet={setMinWallet} latestVersionCode={latestVersionCode} setLatestVersionCode={setLatestVersionCode} updateUrl={updateUrl} setUpdateUrl={setUpdateUrl} latestAdminVersionCode={latestAdminVersionCode} setLatestAdminVersionCode={setLatestAdminVersionCode} adminUpdateUrl={adminUpdateUrl} setAdminUpdateUrl={setAdminUpdateUrl} bugs={bugs} setBugStatus={setBugStatus} addBug={addBug} lang={lang} />}
      {tab === "finance" && <AdminFinance tripLog={tripLog} lang={lang} />}
      {tab === "notify" && <AdminNotify drivers={drivers} customers={customers} adminNotifications={adminNotifications} deleteAdminNotification={deleteAdminNotification} lang={lang} />}
      {tab === "alerts" && <AdminAlerts alerts={alerts} replyToAlert={replyToAlert} withdrawals={withdrawals} approveWithdrawal={approveWithdrawal} rechargeRequests={rechargeRequests} approveRecharge={approveRecharge} lang={lang} />}
      {tab === "callLogs" && <AdminCallLogs callLogs={callLogs} bookings={bookings} lang={lang} />}
    </div>
  );
}
