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
import { adminFirebaseAuth, sendAdminNotification, resolveChangeLogEntry } from "./firebaseClient";
import { createDoc, patchDoc, removeDoc, bulkUpdateDocs } from "./firestoreStore";
import {
  C, DEFAULT_EXPENSE_CATEGORIES, EN_LABELS, FARE_TIER_MAX_KG_UNCAPPED, MR_LABELS,
  NEARBY_MAP_DEFAULT_CENTER, PLAY_STORE_URL, alertTypeLabel, calculateFare,
  describeAdminRateSaveError, driverTruckIcon, driverTruckIconInactive, estimateDistanceKm,
  fetchRoadDistanceKm, findFareTier, fmt, formatDistanceExact, genId, geocodeAddress,
  getAdminRouteOverride, gpsStatus, greetingWord, haversineKm, installedDrivers,
  isFutureAdvance, isInTrial, isLikelyUninstalled, isLongHaulSmallLoad, locationsNear,
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

function AdminFleet({ drivers, customers, driver, bookings, tripLog, minWallet, lang, onNavigate, onLogout, updateDriverKyc, routeFares, adminRouteFares, adminRouteFaresError, fareTiers, bugs, systemHealth }) {
  const isToday = (b) => {
    const d = b.createdAt?.toDate ? b.createdAt.toDate() : null;
    if (!d) return false;
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  };
  // "Booked today" previously counted every Ongoing/Completed trip ever
  // logged (no date filter) despite the label — scope it to today like the
  // other trip-based tiles below.
  const bookedTodayList = tripLog.filter((t) => (t.status === "Ongoing" || t.status === "Completed") && isToday(t));
  const readyOnlineDrivers = drivers.filter((d) => d.online && d.kyc === "Approved" && !d.blacklisted);
  // Single partition, used for every installed/uninstalled/blacklisted
  // count on this dashboard (see partitionDriversByInstallStatus) -- these
  // three groups are guaranteed to sum to drivers.length by construction,
  // with a loud console.error if that's ever somehow not true. Nothing
  // below should re-derive "uninstalled"/"installed" with its own
  // separate filter again -- that duplication is exactly what caused the
  // Total Drivers/tabs/Live Map/uninstalled-tile numbers to disagree
  // before.
  const { installed: installedDriversList, uninstalled: uninstalledDrivers } = partitionDriversByInstallStatus(drivers);
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
  const pendingApprovals = drivers.filter((d) => d.kyc === "Pending").length;
  const lowWalletDrivers = drivers.filter((d) => d.online && !d.blacklisted && d.wallet < minWallet);
  // New customer signups today, and drivers still inside their 30-day free
  // trial — both derived live from createdAt, same source of truth as
  // everywhere else trial/signup timing is used in the app.
  const newCustomersToday = (customers || []).filter(isToday);
  // Today's new driver signups — separate from pendingApprovals below.
  // pendingApprovals only counts drivers still sitting in "Pending" KYC,
  // but a driver signing up inside their own 30-day trial gets
  // auto-approved instantly (see DriverKyc's submit()), skipping "Pending"
  // entirely — so during this pilot, the "New Registrations" tile could
  // read 0 even with a steady stream of real signups, since none of them
  // ever paused in Pending long enough to be counted. This tracks actual
  // signup volume instead, same createdAt-based approach as
  // newCustomersToday above.
  const newDriversToday = drivers.filter(isToday);
  // isInTrial alone also matched drivers who just verified their phone
  // and never went any further (no name, no KYC) — cluttering this list
  // with abandoned signups nobody can actually act on. Only count a
  // driver as "in trial" here once they've completed every step that
  // actually lets them take loads: basic details (name set, not just the
  // placeholder-name-equals-mobile a fresh signup starts with) and KYC
  // approved. Rate setup used to be a third required step here too —
  // dropped along with pricing (see backup-before-pricing-removal).
  const trialDrivers = drivers.filter((d) => isInTrial(d.createdAt) && d.name && d.name !== d.mobile && d.kyc === "Approved");

  const cancelledTodayList = (bookings || []).filter((b) => b.status === "Cancelled" && isToday(b));
  // Any not-yet-finished booking scheduled for a future date, regardless of
  // whether it's still awaiting bids or already has a driver assigned.
  const advanceBookingsList = (bookings || []).filter((b) => isFutureAdvance(b.scheduledFor) && b.status !== "Cancelled" && b.status !== "Completed");

  // Tapping one of the "drill-down" tiles opens a dedicated full page (with
  // its own Back button) showing the live record list behind that count —
  // a separate screen, not an inline panel on the dashboard itself.
  const [detailView, setDetailView] = useState(null);

  // Retention nudge for "App uninstalled (likely)" -- same queue pattern as
  // AdminDriverList's GPS WhatsApp reminder (send-next-one-at-a-time,
  // persisted "already reminded today" per driver so switching away to
  // WhatsApp and back doesn't lose track or double-message anyone).
  const todayStrUninstalled = () => new Date().toISOString().slice(0, 10);
  const [uninstalledWhatsappSentMap, setUninstalledWhatsappSentMap] = usePersistedState("sarthi_uninstalledWhatsappSent", {});
  const markUninstalledWhatsappSent = (mobile) => setUninstalledWhatsappSentMap((prev) => ({ ...prev, [mobile]: todayStrUninstalled() }));
  const sentUninstalledToday = (mobile) => uninstalledWhatsappSentMap[mobile] === todayStrUninstalled();
  const uninstalledWhatsappLink = (mobile) => {
    const msg = lang === "en"
      ? "We miss you! It's been a while since you opened Apna Transport, and new loads keep coming in every day. Reopen the app to see what's nearby: https://sarthi-transport-74865.web.app"
      : lang === "mr"
      ? "आम्हाला तुमची आठवण येते! तुम्ही Apna Transport बऱ्याच दिवसांपासून उघडलेले नाही, आणि रोज नवीन लोड येत आहेत. जवळचे लोड पाहण्यासाठी अ‍ॅप पुन्हा उघडा: https://sarthi-transport-74865.web.app"
      : "हमें आपकी याद आती है! आपने Apna Transport काफी दिनों से नहीं खोला है, और हर दिन नए लोड आ रहे हैं। आसपास के लोड देखने के लिए ऐप फिर से खोलें: https://sarthi-transport-74865.web.app";
    return `https://wa.me/91${mobile}?text=${encodeURIComponent(msg)}`;
  };
  const uninstalledUnsent = uninstalledDrivers.filter((d) => !sentUninstalledToday(d.mobile));
  const nextUninstalledToRemind = uninstalledUnsent[0] || null;

  // Global fuel-price nudge -- moves every Admin rate (adminRouteFares) by
  // ₹1/km per +/- tap, up or down. Driver-submitted quotes (routeFares)
  // are untouched by this since commit ae40cb4 dropped them as a
  // customer-pricing layer entirely -- Diesel has no reason to move a
  // number that no longer affects what anyone is charged.
  // Deliberately a flat totalFare += delta*estimatedKm rather than
  // nudging a displayed per-km rate and rebuilding Total from it, which
  // was tried first: that approach amplifies any per-km change by
  // dividing it by 0.75 (the first 5km is a fixed 25% SLICE of the
  // total, not a flat rupee amount) -- a real bug: "+₹1/km" on a 201km
  // entry landed as +₹271, not +₹201. Entries with no usable distance
  // are left untouched -- there's no per-km rate to move.
  //
  // Tapping +/- only ever changes dieselPending (an in-memory net count,
  // no network at all) so repeated taps are instant -- nothing actually
  // writes to Firestore until "Save Diesel Rate" commits the accumulated
  // net change in a single pass, using bulkUpdateDocs (chunked Firestore
  // batches) rather than one write per document, since a several-hundred-
  // doc bulk operation from a mobile browser is exactly the kind of long-
  // running write that kept failing halfway during the Maharashtra import.
  const [dieselPending, setDieselPending] = useState(0);
  const [dieselAdjusting, setDieselAdjusting] = useState(false);
  const [dieselFlash, setDieselFlash] = useState("");
  const [dieselError, setDieselError] = useState("");
  const saveDiesel = async () => {
    if (dieselAdjusting || dieselPending === 0) return;
    const delta = dieselPending;
    setDieselAdjusting(true);
    setDieselFlash("");
    setDieselError("");
    try {
      // Admin's own rates only, now that driver-submitted quotes (routeFares)
      // no longer feed into customer pricing at all -- see resolveFare.
      const adminUpdates = (adminRouteFares || [])
        .filter((r) => r.estimatedKm > 0)
        .map((r) => ({
          id: r.id,
          patch: { totalFare: Math.max(1, Math.round((Number(r.totalFare) || 0) + delta * r.estimatedKm)) },
        }));
      await bulkUpdateDocs("adminRouteFares", adminUpdates);
      const count = adminUpdates.length;
      setDieselFlash(lang === "en" ? `Adjusted ${count} rates by ${delta > 0 ? "+" : ""}₹${delta}/km.` : lang === "mr" ? `${count} दर ${delta > 0 ? "+" : ""}₹${delta}/किमी ने बदलले.` : `${count} दरों को ${delta > 0 ? "+" : ""}₹${delta}/किमी से बदला गया।`);
      setDieselPending(0);
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
      renderItem: (d) => (
        <div key={d.id} className="rounded-lg p-2.5 flex items-center justify-between" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          <div className="text-xs font-bold" style={{ color: C.ink }}>{d.name}</div>
          <div className="text-[11px]" style={{ color: C.inkSoft, fontFamily: monoFont }}>{d.vehicleSpec?.vehicleNumber || "—"}</div>
        </div>
      ),
    },
    uninstalled: {
      title: lang === "en" ? "App uninstalled (likely)" : lang === "mr" ? "अ‍ॅप अनइन्स्टॉल केलेले (शक्यतो)" : "ऐप अनइंस्टॉल किया हुआ (संभावित)",
      emptyMsg: lang === "en" ? "No driver has gone quiet this long." : lang === "mr" ? "कोणताही ड्रायव्हर इतका काळ गप्प नाही." : "कोई भी ड्राइवर इतने दिन से खामोश नहीं है।",
      items: uninstalledDrivers,
      // Retention queue -- same "send next one, one tap at a time" pattern
      // as AdminDriverList's GPS reminder, so admin can work through the
      // whole list without hunting for who's already been messaged today.
      headerExtra: uninstalledDrivers.length > 0 && (
        nextUninstalledToRemind ? (
          <a href={uninstalledWhatsappLink(nextUninstalledToRemind.mobile)} target="_blank" rel="noreferrer" onClick={() => markUninstalledWhatsappSent(nextUninstalledToRemind.mobile)}
            className="w-full rounded-lg py-3 font-bold text-sm mb-3 flex items-center justify-center gap-1.5 text-white" style={{ background: C.success }}>
            <MessageCircle size={14} />
            {lang === "en" ? `Send next retention message on WhatsApp (${uninstalledUnsent.length} left)` : lang === "mr" ? `पुढचा रिटेंशन मेसेज WhatsApp वर पाठवा (${uninstalledUnsent.length} बाकी)` : `अगला रिटेंशन मेसेज WhatsApp पर भेजें (${uninstalledUnsent.length} बाकी)`}
          </a>
        ) : (
          <div className="w-full rounded-lg py-3 font-bold text-sm mb-3 flex items-center justify-center gap-1.5" style={{ background: "#E0E0E0", color: "#9AA3B0" }}>
            <CheckCircle2 size={14} />
            {lang === "en" ? "Everyone messaged today" : lang === "mr" ? "आज सर्वांना मेसेज केला" : "आज सभी को मेसेज किया गया"}
          </div>
        )
      ),
      renderItem: (d) => (
        <div key={d.id} className="rounded-lg p-2.5 flex items-center justify-between" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          <div>
            <div className="text-xs font-bold" style={{ color: C.ink }}>{d.name}</div>
            <div className="text-[10px]" style={{ color: C.inkSoft, fontFamily: monoFont }}>{d.mobile}</div>
            <div className="text-[11px]" style={{ color: C.inkSoft, fontFamily: monoFont }}>{d.vehicleSpec?.vehicleNumber || "—"}</div>
          </div>
          <a href={uninstalledWhatsappLink(d.mobile)} target="_blank" rel="noreferrer" onClick={() => markUninstalledWhatsappSent(d.mobile)}
            className="shrink-0 p-2 rounded-full" style={{ background: sentUninstalledToday(d.mobile) ? "#E0E0E0" : C.success }}>
            <MessageCircle size={14} color={sentUninstalledToday(d.mobile) ? "#9AA3B0" : "#FFFFFF"} />
          </a>
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
    trial: {
      title: lang === "en" ? "Drivers in free trial" : lang === "mr" ? "फ्री ट्रायलमधील ड्रायव्हर" : "फ्री ट्रायल में ड्राइवर",
      emptyMsg: lang === "en" ? "No driver is currently in their free trial." : lang === "mr" ? "सध्या कोणताही ड्रायव्हर फ्री ट्रायलमध्ये नाही." : "फिलहाल कोई भी ड्राइवर फ्री ट्रायल में नहीं है।",
      items: trialDrivers,
      renderItem: (d) => (
        <div key={d.id} className="rounded-lg p-2.5 flex items-center justify-between" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          <div>
            <div className="text-xs font-bold" style={{ color: C.ink }}>{d.name}</div>
            <div className="text-[10px]" style={{ color: C.inkSoft, fontFamily: monoFont }}>{d.vehicleSpec?.vehicleNumber || "—"} · {d.mobile}</div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#FFFFFF", background: C.marigoldDeep }}>
            {lang === "en" ? `${trialDaysLeft(d.createdAt)}d left` : lang === "mr" ? `${trialDaysLeft(d.createdAt)} दिवस बाकी` : `${trialDaysLeft(d.createdAt)} दिन बाकी`}
          </span>
        </div>
      ),
    },
  };

  // Merged "New Registrations" screen — replaces the old separate "Pending
  // KYC approvals" tile/tab. Customer side is a plain informational list
  // (a customer registration has no pending/incomplete state, so "today"
  // is the only meaningful scope); Driver side embeds the full AdminKyc
  // workflow as-is (Incomplete/Complete tabs, Approve/Block, WhatsApp
  // nudge) — covering every driver still needing review, not just today's
  // signups, since that's the whole point of consolidating KYC here.
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
            {lang === "en" ? "Driver" : lang === "mr" ? "ड्रायव्हर" : "ड्राइवर"}{pendingApprovals > 0 ? ` (${pendingApprovals})` : ""}
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
        ) : (
          <AdminKyc drivers={drivers} updateDriverKyc={updateDriverKyc} lang={lang} />
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
            <button onClick={() => setDieselPending((p) => p - 1)} disabled={dieselAdjusting} className="h-11 rounded-lg font-black text-lg flex items-center justify-center" style={{ background: C.paper, color: C.safety, border: `1px solid ${C.line}`, opacity: dieselAdjusting ? 0.5 : 1 }}>−</button>
            <div className="h-11 rounded-lg flex items-center justify-center text-sm font-bold" style={{ background: C.bg, border: `1px solid ${C.line}`, color: C.ink }}>
              {lang === "en" ? "Diesel" : lang === "mr" ? "डिझेल" : "डीज़ल"}{dieselPending !== 0 && ` (${dieselPending > 0 ? "+" : ""}${dieselPending})`}
            </div>
            <button onClick={() => setDieselPending((p) => p + 1)} disabled={dieselAdjusting} className="h-11 rounded-lg font-black text-lg flex items-center justify-center" style={{ background: C.paper, color: C.success, border: `1px solid ${C.line}`, opacity: dieselAdjusting ? 0.5 : 1 }}>+</button>
          </div>
        </div>
        {dieselPending !== 0 && (
          <button onClick={saveDiesel} disabled={dieselAdjusting} className="w-full rounded-lg py-2.5 mb-2 text-sm font-bold" style={{ background: dieselAdjusting ? "#E0E0E0" : C.navy, color: dieselAdjusting ? "#9AA3B0" : "#fff" }}>
            {dieselAdjusting
              ? "…"
              : (lang === "en" ? `Save Diesel Rate (${dieselPending > 0 ? "+" : ""}${dieselPending})` : lang === "mr" ? `डिझेल दर सेव्ह करा (${dieselPending > 0 ? "+" : ""}${dieselPending})` : `डीज़ल दर सेव करें (${dieselPending > 0 ? "+" : ""}${dieselPending})`)}
          </button>
        )}
        {(dieselFlash || dieselError) && (
          <div className="rounded-lg p-2 mb-3 text-xs font-bold text-center" style={{ background: dieselError ? C.safety : C.success, color: "#fff" }}>
            {dieselError || dieselFlash}
          </div>
        )}
        <AdminRouteFares routeFares={routeFares} adminRouteFares={adminRouteFares} adminRouteFaresError={adminRouteFaresError} fareTiers={fareTiers} drivers={drivers} lang={lang} />
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
          Customer+Driver signups — see newCustomersToday/newDriversToday
          above for why this isn't just pendingApprovals) comes first, then
          today's health signals (at-risk wallets, cancellations, earnings,
          bookings, capacity), then pipeline (advance bookings), then
          growth metrics (trial) last — those are useful context, not
          something to act on today. Still flags red via pendingApprovals
          when there's an actual KYC backlog to act on, independent of how
          many signups happened today. */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <StatTile label={lang === "en" ? "New Registrations" : lang === "mr" ? "नवीन रजिस्ट्रेशन" : "नए रजिस्ट्रेशन"} value={newCustomersToday.length + newDriversToday.length} color={pendingApprovals > 0 ? C.safety : C.success} onClick={() => setDetailView("newRegistrations")} />
        <StatTile label={lang === "en" ? "Online drivers below min. wallet" : lang === "mr" ? "किमान वॉलेटपेक्षा कमी — ऑनलाइन ड्रायव्हर" : "न्यूनतम वॉलेट से कम — ऑनलाइन ड्राइवर"} value={lowWalletDrivers.length} color={lowWalletDrivers.length > 0 ? C.safety : C.success} onClick={() => setDetailView("lowWallet")} />
        <StatTile label={lang === "en" ? "Cancelled today" : lang === "mr" ? "आज रद्द झाल्या" : "आज रद्द हुईं"} value={cancelledTodayList.length} color={cancelledTodayList.length > 0 ? C.safety : C.success} onClick={() => setDetailView("cancelled")} />
        <StatTile label={lang === "en" ? "Booked today" : lang === "mr" ? "आज किती गाड्या बुक झाल्या" : "आज कितनी गाड़ियां बुक हुईं"} value={bookedTodayList.length} color={C.pimpri} onClick={() => setDetailView("booked")} />
        <StatTile label={lang === "en" ? "Online — ready for bookings" : lang === "mr" ? "ऑनलाइन — बुकिंगसाठी तयार" : "ऑनलाइन — बुकिंग के लिए तैयार"} value={readyOnlineDrivers.length} color={C.success} onClick={() => setDetailView("online")} />
        <StatTile label={lang === "en" ? "Live Map" : lang === "mr" ? "लाइव्ह मॅप" : "लाइव मैप"} value={liveMapLocatedCount} color={C.navy} onClick={() => setDetailView("liveMap")} />
        <StatTile label={lang === "en" ? "Off duty" : lang === "mr" ? "ऑफ ड्युटी" : "ऑफ ड्यूटी"} value={offDutyDrivers.length} color={C.marigoldDeep} onClick={() => setDetailView("offDuty")} />
        <StatTile label={lang === "en" ? "App uninstalled (likely)" : lang === "mr" ? "अ‍ॅप अनइन्स्टॉल केलेले (शक्यतो)" : "ऐप अनइंस्टॉल किया हुआ (संभावित)"} value={uninstalledDrivers.length} color={C.safety} onClick={() => setDetailView("uninstalled")} />
        <StatTile label={lang === "en" ? "Total advance bookings" : lang === "mr" ? "एकूण अ‍ॅडव्हान्स बुकिंग" : "कुल एडवांस बुकिंग"} value={advanceBookingsList.length} color={C.pimpri} onClick={() => setDetailView("advance")} />
        <StatTile label={lang === "en" ? "Drivers in free trial" : lang === "mr" ? "फ्री ट्रायलमधील ड्रायव्हर" : "फ्री ट्रायल में ड्राइवर"} value={trialDrivers.length} color={C.marigoldDeep} onClick={() => setDetailView("trial")} />
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

// Every driver-submitted "Set Fare" entry (see SetFareForm), grouped by
// route so Admin can see at a glance what the whole fleet is charging for
// each pickup/drop pair — and the only place any of these numbers can be
// edited or removed by someone other than the driver who submitted them.
// Looks up the Admin default/override rate for one driver-submitted entry,
// matched by the SAME route coordinates and the weight bracket that
// entry's own driver's vehicle falls into (routeFares entries don't record
// a bracket themselves -- see SetFareForm -- so the driver's real
// capacityKg from the drivers list stands in for it). Used only for the
// "vs default" comparison badge in AdminRouteFares; never touches pricing.
function findMatchingDefaultRate(entry, capacityKg, adminRouteFares, fareTiers) {
  if (capacityKg == null || entry.pickupLat == null || entry.dropLat == null) return null;
  const tier = findFareTier(capacityKg, fareTiers);
  const radiusKm = routeMatchRadiusKm(haversineKm(entry.pickupLat, entry.pickupLng, entry.dropLat, entry.dropLng));
  const match = (adminRouteFares || []).find((r) =>
    r.tierMaxKg === tier.maxKg &&
    r.pickupLat != null && r.dropLat != null &&
    locationsNear(entry.pickupLat, entry.pickupLng, r.pickupLat, r.pickupLng, radiusKm) &&
    locationsNear(entry.dropLat, entry.dropLng, r.dropLat, r.dropLng, radiusKm)
  );
  return match ? Number(match.totalFare) || null : null;
}

function AdminRouteFares({ routeFares, adminRouteFares, adminRouteFaresError, fareTiers, drivers, lang }) {
  const [editingId, setEditingId] = useState(null);
  const [editingEstimatedKm, setEditingEstimatedKm] = useState(null);
  const [draftTotalFare, setDraftTotalFare] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [rateCalcOpen, setRateCalcOpen] = useState(false);

  const groups = {};
  (routeFares || []).forEach((r) => {
    const key = `${r.pickupKey || ""}→${r.dropKey || ""}`;
    if (!groups[key]) groups[key] = { pickupName: r.pickupName, dropName: r.dropName, entries: [] };
    groups[key].entries.push(r);
  });
  const groupList = Object.values(groups).sort((a, b) => b.entries.length - a.entries.length);

  // Same 25%-of-total rule SetFareForm applies — kept in sync here so an
  // admin edit can't leave a driver's entry with a 1-5 km fare that no
  // longer matches its total.
  const draftTier1to5Fare = draftTotalFare !== "" ? Math.round((Number(draftTotalFare) || 0) * 0.25) : 0;
  const draftPerKmRate = editingEstimatedKm != null && editingEstimatedKm > 5 && draftTotalFare !== ""
    ? Math.round((Number(draftTotalFare) - draftTier1to5Fare) / (editingEstimatedKm - 5)) : null;

  const startEdit = (r) => { setEditingId(r.id); setEditingEstimatedKm(r.estimatedKm ?? null); setDraftTotalFare(String(r.totalFare ?? "")); };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = async (id) => {
    setSaving(true);
    try {
      await patchDoc("routeFares", id, { tier1to5Fare: draftTier1to5Fare, totalFare: Number(draftTotalFare) || 0, perKmRate: draftPerKmRate });
      setEditingId(null);
    } catch (e) { console.error(e); }
    setSaving(false);
  };
  const deleteEntry = (id) => { removeDoc("routeFares", id).catch((e) => console.error(e)); setConfirmDeleteId(null); };

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="text-base font-bold" style={{ color: C.ink }}>{lang === "en" ? "Driver Ride Entries" : lang === "mr" ? "ड्रायव्हर राइड एंट्री" : "ड्राइवर राइड एंट्री"}</h2>
        <button onClick={() => setRateCalcOpen(true)} className="shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg" style={{ background: C.navy, color: "#fff" }}>
          <Calculator size={14} /> {lang === "en" ? "Admin Rate Calculator" : lang === "mr" ? "अ‍ॅडमिन दर कॅल्क्युलेटर" : "एडमिन रेट कैलकुलेटर"}
        </button>
      </div>
      <div className="rounded-lg p-2.5 mb-3 text-[11px] font-semibold" style={{ background: C.bg, color: C.inkSoft, border: `1px solid ${C.line}` }}>
        {lang === "en"
          ? "Reference only — what drivers say they charge for a route no longer affects the fare a customer is actually quoted. Only an Admin rate (Rate Calculator) or the default formula does."
          : lang === "mr"
          ? "फक्त संदर्भासाठी — ड्रायव्हर एखाद्या रूटसाठी काय आकारतो हे आता ग्राहकाला दाखवल्या जाणाऱ्या दरावर परिणाम करत नाही. फक्त अ‍ॅडमिन दर (रेट कॅल्क्युलेटर) किंवा डिफॉल्ट फॉर्म्युला दर ठरवते."
          : "केवल संदर्भ के लिए — ड्राइवर किसी रूट के लिए क्या चार्ज करता है, इसका अब ग्राहक को दिखाए जाने वाले दर पर कोई असर नहीं है। केवल एडमिन दर (रेट कैलकुलेटर) या डिफ़ॉल्ट फॉर्मूला ही दर तय करता है।"}
      </div>
      {adminRouteFaresError && (
        <div className="rounded-lg p-3 mb-3 text-xs font-bold" style={{ background: C.safety, color: "#fff" }}>
          {lang === "en"
            ? `Couldn't load Admin default rates (${adminRouteFaresError}). Whatever's in Firestore may be fine — this is a read failure on this device, not proof the data is missing.`
            : lang === "mr"
            ? `अ‍ॅडमिन डिफॉल्ट दर लोड होऊ शकले नाहीत (${adminRouteFaresError}). Firestore मध्ये डेटा असू शकतो — हे या डिव्हाइसवरील रीड फेल्युअर आहे, डेटा गहाळ असल्याचा पुरावा नाही.`
            : `एडमिन डिफ़ॉल्ट दर लोड नहीं हो सके (${adminRouteFaresError})। Firestore में डेटा ठीक हो सकता है — यह इस डिवाइस पर रीड फेल्योर है, डेटा गायब होने का सबूत नहीं।`}
        </div>
      )}
      {rateCalcOpen && <AdminRateCalculator adminRouteFares={adminRouteFares} adminRouteFaresError={adminRouteFaresError} fareTiers={fareTiers} lang={lang} onClose={() => setRateCalcOpen(false)} />}
      {groupList.length === 0 ? (
        <p className="text-xs text-center py-10" style={{ color: C.inkSoft }}>{lang === "en" ? "No driver has set a route fare yet." : lang === "mr" ? "अजून कोणत्याही ड्रायव्हरने रूट भाडे सेट केलेले नाही." : "अभी तक किसी ड्राइवर ने रूट किराया सेट नहीं किया।"}</p>
      ) : (
        <div className="space-y-3">
          {groupList.map((g, gi) => {
            const avgTotal = Math.round(g.entries.reduce((s, r) => s + (Number(r.totalFare) || 0), 0) / g.entries.length);
            // Matches each entry to the Admin default for its own driver's
            // capacity bracket, then averages just the entries that found
            // one — a route with no matching Admin default anywhere shows
            // no badge rather than a misleading comparison.
            const defaultMatches = g.entries
              // Prefer the capacity the driver actually had ON RECORD when
              // they quoted (stored directly on the entry now) over a live
              // lookup in the current drivers list, which only exists for
              // entries saved before that field was captured.
              .map((r) => findMatchingDefaultRate(r, r.capacityKg ?? (drivers || []).find((d) => d.mobile === r.driverMobile)?.vehicleSpec?.capacityKg, adminRouteFares, fareTiers))
              .filter((v) => v != null);
            const avgDefault = defaultMatches.length ? Math.round(defaultMatches.reduce((s, v) => s + v, 0) / defaultMatches.length) : null;
            const diffPct = avgDefault ? Math.round(((avgTotal - avgDefault) / avgDefault) * 100) : null;
            return (
              <div key={gi} className="rounded-xl p-3 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate" style={{ color: C.ink }}>{g.pickupName}</div>
                    <div className="text-sm font-bold truncate" style={{ color: C.ink }}>→ {g.dropName}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-black" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Avg" : lang === "mr" ? "सरासरी" : "औसत"}: {fmt(avgTotal)}</div>
                    {avgDefault != null && (
                      <div className="text-[10px] font-bold mt-0.5" style={{ color: Math.abs(diffPct) > 15 ? C.safety : C.inkSoft }}>
                        {lang === "en" ? "Default" : lang === "mr" ? "डिफॉल्ट" : "डिफ़ॉल्ट"}: {fmt(avgDefault)} ({diffPct > 0 ? "+" : ""}{diffPct}%)
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  {g.entries.map((r) => {
                    // Older entries saved before capacityKg was captured on
                    // the routeFares doc itself don't have it — fall back to
                    // the driver's current KYC record so the badge still
                    // shows the real number instead of "unknown".
                    const entryCapacityKg = r.capacityKg ?? (drivers || []).find((d) => d.mobile === r.driverMobile)?.vehicleSpec?.capacityKg ?? null;
                    return (
                    <div key={r.id} className="rounded-lg p-2.5 flex items-center gap-2" style={{ background: C.bg, border: `1px solid ${C.line}` }}>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-bold flex items-center gap-1.5" style={{ color: C.ink, fontFamily: monoFont }}>
                          {r.driverMobile}
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0" style={{ background: C.marigold, color: "#1a1200" }}>
                            {entryCapacityKg != null ? `${entryCapacityKg}kg` : (lang === "en" ? "capacity unknown" : lang === "mr" ? "क्षमता अज्ञात" : "क्षमता अज्ञात")}
                          </span>
                        </div>
                        {editingId === r.id ? (
                          <div className="mt-1">
                            <input type="number" inputMode="numeric" value={draftTotalFare} onChange={(e) => setDraftTotalFare(e.target.value)}
                              className="w-24 rounded p-1.5 text-xs font-bold outline-none" style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.ink }} placeholder={lang === "en" ? "Total" : "कुल"} />
                            <div className="text-[10px] mt-1" style={{ color: C.inkSoft }}>
                              {lang === "en" ? "1-5km (25%, auto)" : "1-5किमी (25%, स्वतः)"}: {fmt(draftTier1to5Fare)}
                              {draftPerKmRate != null && <> · {fmt(draftPerKmRate)}/km</>}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[11px] mt-0.5" style={{ color: C.inkSoft }}>
                            {lang === "en" ? "1-5km" : "1-5किमी"}: {fmt(r.tier1to5Fare)} · {lang === "en" ? "Total" : lang === "mr" ? "एकूण" : "कुल"}: {fmt(r.totalFare)}
                            {r.estimatedKm != null && <> · {formatDistanceExact(r.estimatedKm, lang)}</>}
                            {r.perKmRate != null && <> · {fmt(r.perKmRate)}/km</>}
                          </div>
                        )}
                        {/* Raw saved coordinates -- lets this exact entry's
                            pickup/drop point be compared directly against
                            whatever a customer's typed address resolves
                            to, when a route-match mismatch needs tracing. */}
                        {r.pickupLat != null && (
                          <div className="text-[9px] mt-0.5 leading-tight" style={{ color: C.inkSoft, fontFamily: monoFont }}>
                            P: {r.pickupLat.toFixed(4)},{r.pickupLng.toFixed(4)} · D: {r.dropLat.toFixed(4)},{r.dropLng.toFixed(4)}
                          </div>
                        )}
                      </div>
                      {editingId === r.id ? (
                        <div className="flex items-center gap-4 shrink-0">
                          <button onClick={() => saveEdit(r.id)} disabled={saving} className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center" style={{ background: C.success }}>
                            <CheckCircle2 size={17} color="#fff" />
                          </button>
                          <button onClick={cancelEdit} className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center" style={{ background: C.inkSoft }}>
                            <X size={17} color="#fff" strokeWidth={3} />
                          </button>
                        </div>
                      ) : confirmDeleteId === r.id ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => deleteEntry(r.id)} className="text-xs font-bold px-3 py-2.5 rounded-lg" style={{ color: "#fff", background: C.safety }}>
                            {lang === "en" ? "Delete" : lang === "mr" ? "काढा" : "हटाएं"}
                          </button>
                          <button onClick={() => setConfirmDeleteId(null)} className="text-xs font-bold px-3 py-2.5 rounded-lg" style={{ color: C.inkSoft, background: C.paper, border: `1px solid ${C.line}` }}>
                            {lang === "en" ? "Cancel" : lang === "mr" ? "रद्द करा" : "रद्द करें"}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-4 shrink-0">
                          <button onClick={() => startEdit(r)} className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center" style={{ background: C.navy }}>
                            <Settings2 size={16} color="#fff" />
                          </button>
                          <button onClick={() => setConfirmDeleteId(r.id)} className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center" style={{ background: C.safety }}>
                            <X size={17} color="#fff" strokeWidth={3} />
                          </button>
                        </div>
                      )}
                    </div>
                  );})}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Admin's own fixed-rate override for one route + one capacity/weight
// bracket (see getAdminRouteOverride/resolveFare) — opened from the button
// at the right end of AdminRouteFares' header. Deliberately mirrors
// CustomerBooking's own Pickup/Drop/Weight fields (full address, not
// restricted to cities like SetFareForm — Admin is pricing exact routes,
// not logging a loose "I drove this corridor" entry) so the estimated
// distance Admin sees while setting a rate matches what a customer would
// actually see. Saving upserts a doc keyed by route+tier, so re-saving the
// same pickup/drop for the same weight bracket edits that one entry rather
// than creating a duplicate; a different weight bracket on the identical
// route creates a separate entry (see the "Different rates per weight
// bracket" design decision this was built to).
function AdminRateCalculator({ adminRouteFares, adminRouteFaresError, fareTiers, lang, onClose }) {
  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [pickupCoords, setPickupCoords] = useState(null);
  const [dropCoords, setDropCoords] = useState(null);
  const [distance, setDistance] = useState(null);
  const [weight, setWeight] = useState("");
  const [totalFare, setTotalFare] = useState("");
  const [fareTouched, setFareTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
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

  // Straight-line estimate shows instantly, then silently upgrades to the
  // real routed distance — same pattern as CustomerBooking/SetFareForm.
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

  const capacityKg = weight !== "" ? Number(weight) || 0 : null;
  const tier = capacityKg != null ? findFareTier(capacityKg, fareTiers) : null;
  // Mirrors resolveFare's own two-layer priority (Admin override, else the
  // generic formula) instead of always jumping straight to the formula --
  // otherwise this "suggestion" can flatly contradict what a customer is
  // actually being quoted right now for this exact route+bracket (a real
  // bug: it used to always show the generic-formula number even when a
  // correct Admin default already existed, making it easy to overwrite a
  // right answer with a wrong one without any warning). Shown as a
  // starting point since Admin has to type something into Save Rate, but
  // always editable: typing over it (fareTouched) stops it auto-updating.
  const existingOverride = tier != null && pickup.trim() && drop.trim()
    ? getAdminRouteOverride(pickup, drop, capacityKg, adminRouteFares, pickupCoords?.lat, pickupCoords?.lng, dropCoords?.lat, dropCoords?.lng, fareTiers)
    : null;
  const suggestedFare = existingOverride != null ? existingOverride
    : (tier != null ? calculateFare(capacityKg, distance, fareTiers) : null);
  const suggestionSource = existingOverride != null ? "admin" : "formula";
  useEffect(() => {
    if (fareTouched) return;
    setTotalFare(suggestedFare != null ? String(suggestedFare) : "");
  }, [suggestedFare, fareTouched]);

  const resetForm = () => {
    setPickup(""); setDrop(""); setPickupCoords(null); setDropCoords(null); setDistance(null);
    setWeight(""); setTotalFare(""); setFareTouched(false); setEditingId(null); setSaveError("");
  };

  const editEntry = (r) => {
    setSaveError("");
    setPickup(r.pickupName || ""); setDrop(r.dropName || "");
    setPickupCoords(r.pickupLat != null ? { lat: r.pickupLat, lng: r.pickupLng } : null);
    setDropCoords(r.dropLat != null ? { lat: r.dropLat, lng: r.dropLng } : null);
    setDistance(r.estimatedKm ?? null);
    setWeight(r.weight != null ? String(r.weight) : "");
    setTotalFare(r.totalFare != null ? String(r.totalFare) : "");
    setFareTouched(true);
    setEditingId(r.id);
    setSavedFlash(false);
  };

  const deleteEntry = (id) => { removeDoc("adminRouteFares", id).catch((e) => console.error(e)); setConfirmDeleteId(null); if (editingId === id) resetForm(); };

  // Same reasoning as SetFareForm's own locationResolved check: an Admin
  // override that saves before geocoding catches up would only ever match
  // by loose text containment, defeating the whole point of an
  // authoritative, GPS-anchored rate for this exact route+bracket.
  const locationResolved = !mapsReady || (pickupCoords != null && dropCoords != null);
  const canSave = pickup.trim() && drop.trim() && weight !== "" && totalFare !== "" && !saving && locationResolved;
  const save = async () => {
    if (!canSave || !tier) return;
    setSaving(true);
    setSaveError("");
    const docId = `${sanitizeForDocId(pickup)}__${sanitizeForDocId(drop)}__${tier.maxKg}`;
    try {
      await createDoc("adminRouteFares", docId, {
        pickupName: pickup.trim(), dropName: drop.trim(),
        pickupKey: normalizeRouteText(pickup), dropKey: normalizeRouteText(drop),
        pickupLat: pickupCoords?.lat ?? null, pickupLng: pickupCoords?.lng ?? null,
        dropLat: dropCoords?.lat ?? null, dropLng: dropCoords?.lng ?? null,
        estimatedKm: distance,
        weight: capacityKg,
        tierMaxKg: tier.maxKg,
        totalFare: Number(totalFare) || 0,
        updatedAt: Date.now(),
      });
      // docId is derived fresh from the CURRENT pickup/drop/tier -- if
      // Admin edited an existing entry's route text or weight enough to
      // shift brackets, that no longer matches editingId's original doc.
      // Without this, the old doc would be left behind as an orphaned
      // duplicate that could later resurface via getAdminRouteOverride's
      // "most recent wins" tie-break and quote a stale fare -- the same
      // class of bug already fixed once for the fare-vs-label mismatch
      // (commit f9d8695).
      if (editingId && editingId !== docId) {
        await removeDoc("adminRouteFares", editingId).catch((e) => console.error("[stale admin rate cleanup]", e));
      }
      resetForm();
      setSavedFlash(true);
    } catch (e) {
      console.error(e);
      setSaveError(describeAdminRateSaveError(e, lang));
    }
    setSaving(false);
  };

  const sorted = [...(adminRouteFares || [])].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  // A real count to check against, instead of scrolling a list of
  // hundreds and losing track -- e.g. after the Maharashtra bulk import,
  // this is the only in-app way to confirm "yes, all 880 are really here"
  // without opening Firestore or running a script.
  const defaultCount = sorted.filter((r) => r.source === "maharashtraDefault").length;
  const handEditedCount = sorted.length - defaultCount;


  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(42,33,28,0.6)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-2xl overflow-hidden max-h-[85vh] flex flex-col" style={{ background: C.paper }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-center justify-between shrink-0" style={{ background: C.navy }}>
          <h3 className="text-sm font-bold" style={{ color: "#fff" }}>{lang === "en" ? "Admin Rate Calculator" : lang === "mr" ? "अ‍ॅडमिन दर कॅल्क्युलेटर" : "एडमिन रेट कैलकुलेटर"}</h3>
          <button onClick={onClose} className="text-base font-bold" style={{ color: "#fff" }}>✕</button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          <div className="rounded-lg p-3 text-xs font-semibold" style={{ background: C.metallicGold, color: "#000000" }}>
            {lang === "en"
              ? "Set a fixed rate for a route + weight bracket. This overrides driver-entered rates and the standard formula for that exact route."
              : lang === "mr"
              ? "एका रूट + वजन ब्रॅकेटसाठी निश्चित दर सेट करा. हे त्या रूटसाठी ड्रायव्हरने भरलेले दर आणि स्टँडर्ड फॉर्म्युला यांना ओव्हरराइड करते."
              : "एक रूट + वजन ब्रैकेट के लिए निश्चित दर सेट करें। यह उस रूट के लिए ड्राइवर द्वारा भरे गए दर और मानक फॉर्मूले को ओवरराइड करता है।"}
          </div>

          <LocationField lang={lang} value={pickup}
            onChange={(e) => { setPickup(e.target.value); setPickupCoords(null); setSavedFlash(false); setSaveError(""); setFareTouched(false); }}
            onPlaceSelected={(p) => { setPickup(p.name); setPickupCoords({ lat: p.lat, lng: p.lng }); setSavedFlash(false); setSaveError(""); setFareTouched(false); }}
            mapsReady={mapsReady}
            placeholder={lang === "en" ? "Pickup" : lang === "mr" ? "पिकअप" : "पिकअप"} />
          <LocationField lang={lang} value={drop}
            onChange={(e) => { setDrop(e.target.value); setDropCoords(null); setSavedFlash(false); setSaveError(""); setFareTouched(false); }}
            onPlaceSelected={(p) => { setDrop(p.name); setDropCoords({ lat: p.lat, lng: p.lng }); setSavedFlash(false); setSaveError(""); setFareTouched(false); }}
            mapsReady={mapsReady}
            placeholder={lang === "en" ? "Drop" : lang === "mr" ? "ड्रॉप" : "ड्रॉप"} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] font-bold mb-1" style={{ color: C.inkSoft }}>{lang === "en" ? "Estimated distance" : lang === "mr" ? "अंदाजे अंतर" : "अनुमानित दूरी"}</div>
              <div className="rounded-lg p-2.5 text-sm font-black" style={{ background: C.bg, border: `1px solid ${C.line}`, color: C.ink, fontFamily: monoFont }}>
                {!pickup.trim() || !drop.trim() ? "—" : distance !== null ? formatDistanceExact(distance, lang) : (lang === "en" ? "Calculating..." : lang === "mr" ? "गणना होत आहे..." : "गणना हो रही है...")}
              </div>
              {/* Raw resolved coordinates, admin-only -- lets a route-match
                  mismatch (typed address geocoding somewhere unexpected)
                  actually be seen and compared against a driver's own
                  saved entry, instead of guessing blind. */}
              {(pickupCoords || dropCoords) && (
                <div className="text-[9px] mt-1 leading-tight" style={{ color: C.inkSoft, fontFamily: monoFont }}>
                  {pickupCoords ? `P: ${pickupCoords.lat.toFixed(4)},${pickupCoords.lng.toFixed(4)}` : "P: —"}
                  {" · "}
                  {dropCoords ? `D: ${dropCoords.lat.toFixed(4)},${dropCoords.lng.toFixed(4)}` : "D: —"}
                </div>
              )}
            </div>
            <div>
              <div className="text-[11px] font-bold mb-1" style={{ color: C.inkSoft }}>{lang === "en" ? "Enter weight (kg)" : lang === "mr" ? "वजन टाका (किलो)" : "वजन डालें (किलो)"}</div>
              <input type="number" inputMode="numeric" value={weight}
                onChange={(e) => { setWeight(e.target.value.replace(/\D/g, "")); setSavedFlash(false); setSaveError(""); setFareTouched(false); }}
                className="w-full rounded-lg p-2.5 text-sm font-bold outline-none" style={{ background: C.bg, border: `1px solid ${C.line}`, color: C.ink }}
                placeholder={lang === "en" ? "e.g. 1000" : "उदा. 1000"} />
            </div>
          </div>

          <div>
            <div className="text-[11px] font-bold mb-1" style={{ color: C.inkSoft }}>
              {lang === "en" ? "Rate for this route" : lang === "mr" ? "या रूटसाठी दर" : "इस रूट के लिए दर"}
              {suggestedFare != null && !fareTouched && suggestionSource === "admin" && (
                <span style={{ color: C.safety }}> · {lang === "en" ? "⚠ already live as an Admin rate — saving now just re-confirms it" : lang === "mr" ? "⚠ आधीच अ‍ॅडमिन दर म्हणून लाइव्ह आहे — आत्ता सेव्ह केल्यास तेच पुन्हा कन्फर्म होईल" : "⚠ पहले से एडमिन दर के रूप में लाइव है — अभी सेव करने से यह वही दोबारा कन्फर्म होगा"}</span>
              )}
              {suggestedFare != null && !fareTouched && suggestionSource === "formula" && (
                <span style={{ color: C.marigoldDeep }}> · {lang === "en" ? "system formula — no Admin rate set for this route yet" : lang === "mr" ? "सिस्टम फॉर्म्युला — या रूटसाठी अजून अ‍ॅडमिन दर नाही" : "सिस्टम फॉर्मूला — इस रूट के लिए अभी तक एडमिन दर नहीं है"}</span>
              )}
            </div>
            <input type="number" inputMode="numeric" value={totalFare}
              onChange={(e) => { setTotalFare(e.target.value); setFareTouched(true); setSavedFlash(false); setSaveError(""); }}
              className="w-full rounded-lg p-2.5 text-sm font-bold outline-none" style={{ background: C.bg, border: `1px solid ${C.line}`, color: C.ink }}
              placeholder={lang === "en" ? "Fill rate" : lang === "mr" ? "दर भरा" : "दर भरें"} />
          </div>

          {editingId && (
            <button onClick={resetForm} className="w-full text-center text-xs font-bold py-1" style={{ color: C.inkSoft }}>
              {lang === "en" ? "Cancel edit / start new entry" : lang === "mr" ? "एडिट रद्द करा / नवीन एंट्री सुरू करा" : "एडिट रद्द करें / नई एंट्री शुरू करें"}
            </button>
          )}

          {adminRouteFaresError && (
            <div className="rounded-lg p-2.5 text-[11px] font-bold" style={{ background: C.safety, color: "#fff" }}>
              {lang === "en"
                ? `Can't load saved rates right now (${adminRouteFaresError}) — this list may be showing nothing even though entries exist. Try closing and reopening the app.`
                : lang === "mr"
                ? `सेव्ह केलेले दर आत्ता लोड होऊ शकत नाहीत (${adminRouteFaresError}) — एंट्री असूनही ही यादी काहीही दाखवत नसेल. अ‍ॅप बंद करून पुन्हा उघडून पहा.`
                : `सेव किए गए दर अभी लोड नहीं हो सकते (${adminRouteFaresError}) — एंट्री होने के बावजूद यह लिस्ट कुछ नहीं दिखा सकती। ऐप बंद करके फिर से खोलें।`}
            </div>
          )}
          {sorted.length > 0 && (
            <div className="pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
              <div className="flex items-center justify-between mb-2 gap-2">
                <div className="text-xs font-bold" style={{ color: C.inkSoft }}>{lang === "en" ? "Saved Admin rates" : lang === "mr" ? "सेव्ह केलेले अ‍ॅडमिन दर" : "सेव किए गए एडमिन दर"}</div>
                <div className="text-xs font-black shrink-0" style={{ color: C.navy }}>{sorted.length}</div>
              </div>
              <div className="text-[10.5px] font-semibold mb-2" style={{ color: C.inkSoft }}>
                {lang === "en" ? `${defaultCount} imported default${handEditedCount ? ` · ${handEditedCount} hand-typed/edited` : ""}` : lang === "mr" ? `${defaultCount} इम्पोर्ट केलेले डिफॉल्ट${handEditedCount ? ` · ${handEditedCount} हाताने टाइप/एडिट केलेले` : ""}` : `${defaultCount} इम्पोर्ट किए गए डिफ़ॉल्ट${handEditedCount ? ` · ${handEditedCount} हाथ से टाइप/एडिट किए गए` : ""}`}
              </div>
              <div className="space-y-1.5">
                {sorted.map((r) => (
                  <div key={r.id} className="rounded-lg p-2.5" style={{ background: C.bg, border: `1px solid ${C.line}` }}>
                    <button onClick={() => editEntry(r)} className="w-full text-left">
                      <div className="flex items-center gap-1.5">
                        <div className="text-xs font-bold truncate" style={{ color: C.ink }}>{r.pickupName}</div>
                        {r.source === "maharashtraDefault" && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0" style={{ background: C.marigold, color: "#000" }}>
                            {lang === "en" ? "DEFAULT" : lang === "mr" ? "डिफॉल्ट" : "डिफ़ॉल्ट"}
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-bold truncate" style={{ color: C.ink }}>→ {r.dropName}</div>
                      <div className="text-[11px] mt-0.5" style={{ color: C.inkSoft }}>
                        {lang === "en" ? "Up to" : lang === "mr" ? "पर्यंत" : "तक"} {r.tierMaxKg >= FARE_TIER_MAX_KG_UNCAPPED ? "∞" : `${r.tierMaxKg}kg`} · {fmt(r.totalFare)}
                      </div>
                      {isLongHaulSmallLoad(r.estimatedKm, r.tierMaxKg) && (
                        <div className="text-[9.5px] font-bold mt-1" style={{ color: C.safety }}>
                          ⚠ {lang === "en" ? "Small load, long haul — a shared/LTL truck is likely cheaper for the customer" : lang === "mr" ? "लहान लोड, लांब पल्ला — ग्राहकासाठी शेअर्ड/LTL ट्रक स्वस्त पडण्याची शक्यता आहे" : "छोटा लोड, लंबी दूरी — ग्राहक के लिए शेयर्ड/LTL ट्रक सस्ता पड़ सकता है"}
                        </div>
                      )}
                    </button>
                    <div className="flex items-center justify-end gap-4 mt-2">
                      {confirmDeleteId === r.id ? (
                        <>
                          <button onClick={() => deleteEntry(r.id)} className="text-xs font-bold px-3 py-2 rounded-lg" style={{ color: "#fff", background: C.safety }}>
                            {lang === "en" ? "Delete" : lang === "mr" ? "काढा" : "हटाएं"}
                          </button>
                          <button onClick={() => setConfirmDeleteId(null)} className="text-xs font-bold px-3 py-2 rounded-lg" style={{ color: C.inkSoft, background: C.paper, border: `1px solid ${C.line}` }}>
                            {lang === "en" ? "Cancel" : lang === "mr" ? "रद्द करा" : "रद्द करें"}
                          </button>
                        </>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(r.id)} className="text-[11px] font-bold px-3 py-2 rounded-lg" style={{ color: C.safety, background: C.paper, border: `1px solid ${C.safety}` }}>
                          {lang === "en" ? "Remove" : lang === "mr" ? "काढा" : "हटाएं"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
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
            {saving ? "…" : (lang === "en" ? "Save Rate" : lang === "mr" ? "दर सेव्ह करा" : "दर सेव करें")}
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
      </div>
    </div>
  );
}

// Renders one KYC/vehicle document thumbnail with View (opens full-size in
// a new tab) and Download buttons. Download fetches the image as a blob
// first so the browser actually saves the file instead of just navigating
// to it — Firebase Storage download URLs are cross-origin, and browsers
// ignore a plain <a download> on cross-origin links.


function AdminKyc({ drivers, updateDriverKyc, lang }) {
  // "Incomplete" = still needs admin's attention — either never
  // submitted any KYC documents, or submitted and is sitting in Pending
  // review (the Approve button on that row only actually does anything
  // once the driver has submitted). "Complete" = fully resolved
  // (Approved or Rejected/Blocked) — nothing left to do, so it's
  // view-only there.
  const notSubmitted = drivers.filter((d) => !d.vehicleSpec);
  const incomplete = drivers.filter((d) => !d.vehicleSpec || d.kyc === "Pending");
  const complete = drivers.filter((d) => d.vehicleSpec && d.kyc !== "Pending");
  // A separate, disjoint concern from notSubmitted/incomplete above: these
  // drivers DID submit KYC (photos, license, vehicle number all on file)
  // but a since-fixed validation gap (typing "0" for capacity used to pass
  // the form's own check yet get discarded as undefined on save) left
  // vehicleSpec.capacityKg empty — which quietly excludes them from the
  // fixed-fare tiers below (findFareTier/calculateFare need a real
  // capacityKg), so they show no fare and can't be booked against by
  // weight. Fixing the validation gap stops new occurrences; this list is
  // the backlog of drivers already caught by the old bug.
  const missingCapacity = drivers.filter((d) => d.vehicleSpec && !d.vehicleSpec.capacityKg);
  const [view, setView] = useState("incomplete"); // 'incomplete' | 'complete' | 'capacity'
  const [expandedId, setExpandedId] = useState(null);
  const [sendingCapacity, setSendingCapacity] = useState(false);
  const [sendResultCapacity, setSendResultCapacity] = useState(null);
  // Persisted (not just in-memory) because tapping WhatsApp on a phone
  // switches away to the WhatsApp app — mobile browsers/TWAs routinely
  // discard or reload a backgrounded tab like that, which would silently
  // wipe a plain useState the moment admin switches back. Keyed by
  // mobile -> the date it was tapped, so the tick clears itself the next
  // day instead of accumulating forever (opening WhatsApp still doesn't
  // guarantee the message was actually sent from there, just that admin
  // already nudged this driver today).
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const [whatsappSentMap, setWhatsappSentMap] = usePersistedState("sarthi_kycWhatsappSent", {});
  const markWhatsappSent = (mobile) => setWhatsappSentMap((prev) => ({ ...prev, [mobile]: todayStr() }));
  const sentToday = (mobile) => whatsappSentMap[mobile] === todayStr();
  const docLabels = lang === "en"
    ? { photo: "Driver Photo", dl: "Driving License" }
    : lang === "mr"
    ? { photo: "ड्रायव्हर फोटो", dl: "ड्रायव्हिंग लायसन्स" }
    : { photo: "ड्राइवर फोटो", dl: "ड्राइविंग लाइसेंस" };
  const statusMeta = {
    Approved: { label: lang === "en" ? "Verified" : lang === "mr" ? "सत्यापित" : "सत्यापित", bg: C.success },
    Pending: { label: lang === "en" ? "Pending" : lang === "mr" ? "प्रलंबित" : "लंबित", bg: C.marigoldDeep },
    Rejected: { label: lang === "en" ? "Blocked" : lang === "mr" ? "ब्लॉक्ड" : "ब्लॉक्ड", bg: C.safety },
  };

  // "Send KYC reminder to all" used to fire a single sendAdminNotification
  // push broadcast — but push relies on the driver already having granted
  // notification permission at some point, exactly the kind of thing a
  // driver who never finished KYC usually hasn't done, so in practice it
  // reached almost no one and admin never saw an actual WhatsApp go out.
  // WhatsApp needs none of that: it opens a chat straight to the driver's
  // number with a personalized link (?driverKyc=1&mobile=...) prefilled.
  // A browser can't fire off many wa.me opens at once from one tap (each
  // is a real navigation, and popup blockers kill anything beyond the
  // first), so this button instead walks admin through the not-yet-
  // reminded drivers one at a time: tap it, WhatsApp opens for the next
  // driver in line and that driver drops off the list (via sentToday
  // below), tap again for the one after — same real <a> mechanism as each
  // row's own WhatsApp button, just queued instead of one-by-one hunting
  // through the list.
  const notSubmittedUnsent = notSubmitted.filter((d) => !sentToday(d.mobile));
  const nextToRemind = notSubmittedUnsent[0] || null;
  const whatsappLink = (mobile) => {
    const portalLink = `${window.location.origin}${window.location.pathname}?driverKyc=1&mobile=${mobile}`;
    const msg = lang === "en"
      ? `Your KYC is incomplete — completing it is mandatory to receive new loads. Please fill it in here: ${portalLink}\nIf you're unable to fill the form yourself, share it on this WhatsApp number instead — reply here with: Phone number, Driver photo, Driving license, Vehicle side photo, Vehicle number, Vehicle model name, Capacity, Length, Breadth, and Height — and we'll complete it for you.`
      : lang === "mr"
      ? `तुमची KYC अपूर्ण आहे — नवीन लोड मिळवण्यासाठी ती पूर्ण करणे अनिवार्य आहे. कृपया इथे भरा: ${portalLink}\nजर तुम्हाला स्वतः फॉर्म भरता येत नसेल, तर त्याऐवजी याच व्हॉट्सअॅप नंबरवर पाठवा — इथे उत्तर द्या: फोन नंबर, ड्रायव्हर फोटो, ड्रायव्हिंग लायसन्स, गाडीचा साइडचा फोटो, गाडी नंबर, गाडी मॉडेलचे नाव, क्षमता, लांबी, रुंदी आणि उंची — आम्ही तुमच्या वतीने पूर्ण करू.`
      : `आपकी KYC अधूरी है — नए लोड पाने के लिए इसे पूरा करना अनिवार्य है। कृपया यहां भरें: ${portalLink}\nअगर आप खुद फॉर्म नहीं भर पा रहे हैं, तो इसके बजाय इसी व्हाट्सएप नंबर पर भेजें — यहां जवाब दें: फोन नंबर, ड्राइवर फोटो, ड्राइविंग लाइसेंस, गाड़ी की साइड फोटो, गाड़ी नंबर, गाड़ी मॉडल का नाम, क्षमता, लंबाई, चौड़ाई और ऊंचाई — और हम आपकी ओर से पूरा कर देंगे।`;
    return `https://wa.me/91${mobile}?text=${encodeURIComponent(msg)}`;
  };

  // Capacity-only nudge — unlike reminderMessage/whatsappLink above, these
  // drivers already have every other document on file, so the message (and
  // the portal link's DriverKycPortal gate, changed to key off
  // vehicleSpec.capacityKg instead of vehicleSpec presence) sends them
  // straight to the KYC form pre-filled with what they already submitted,
  // just missing capacity.
  const capacityMessage = lang === "en"
    ? "Your vehicle's carrying capacity is missing from your KYC — please add it so you can be matched and paid the right fare for loads. It only takes a moment."
    : lang === "mr"
    ? "तुमच्या KYC मध्ये गाडीची क्षमता (कॅपॅसिटी) नमूद केलेली नाही — योग्य लोड आणि योग्य भाडे मिळण्यासाठी कृपया ती भरा. यासाठी फक्त एक क्षण लागेल."
    : "आपकी KYC में गाड़ी की क्षमता (कैपेसिटी) दर्ज नहीं है — सही लोड और सही भाड़ा पाने के लिए कृपया इसे भरें। इसमें बस एक पल लगेगा।";
  const sendToMissingCapacity = async () => {
    if (sendingCapacity || missingCapacity.length === 0) return;
    setSendingCapacity(true);
    setSendResultCapacity(null);
    const result = await sendAdminNotification(missingCapacity.map((d) => d.mobile), capacityMessage, "driver");
    setSendingCapacity(false);
    setSendResultCapacity(result);
  };
  const capacityWhatsappLink = (mobile) => {
    const portalLink = `${window.location.origin}${window.location.pathname}?driverKyc=1&mobile=${mobile}`;
    const msg = lang === "en"
      ? `Your vehicle's carrying capacity is missing from your KYC — please add it here so you can be matched and paid the right fare for loads: ${portalLink}\nYour photo, license and vehicle details are already saved — you'll just need to fill in the capacity.`
      : lang === "mr"
      ? `तुमच्या KYC मध्ये गाडीची क्षमता (कॅपॅसिटी) नमूद केलेली नाही — योग्य लोड आणि भाडे मिळण्यासाठी कृपया इथे भरा: ${portalLink}\nतुमचा फोटो, लायसन्स आणि गाडीची माहिती आधीच सेव्ह आहे — फक्त क्षमता भरायची आहे.`
      : `आपकी KYC में गाड़ी की क्षमता (कैपेसिटी) दर्ज नहीं है — सही लोड और भाड़ा पाने के लिए कृपया यहां भरें: ${portalLink}\nआपका फोटो, लाइसेंस और गाड़ी की जानकारी पहले से सेव है — बस क्षमता भरनी है।`;
    return `https://wa.me/91${mobile}?text=${encodeURIComponent(msg)}`;
  };

  const docSection = (d) => (
    <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.line}` }}>
      <div className="text-[11px] font-semibold mb-1.5" style={{ color: C.inkSoft }}>{lang === "en" ? "Submitted documents:" : lang === "mr" ? "जमा केलेली कागदपत्रे:" : "जमा किए गए दस्तावेज़:"}</div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {Object.entries(docLabels).map(([key, label]) => {
          const doc = d.docs?.[key];
          return <KycDocThumb key={key} url={doc?.url} label={label} lang={lang} fileName={`${d.name}-${key}.jpg`} />;
        })}
      </div>
      {(d.vehicleSpec?.photo || d.vehicleSpec?.photoSide) && (
        <>
          <div className="text-[11px] font-semibold mb-1.5" style={{ color: C.inkSoft }}>{lang === "en" ? "Vehicle photos:" : lang === "mr" ? "गाडीचा फोटो:" : "गाड़ी की फोटो:"}</div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {d.vehicleSpec?.photo && <KycDocThumb url={d.vehicleSpec.photo.url} label={lang === "en" ? "Vehicle - Front" : lang === "mr" ? "गाडी - पुढे" : "गाड़ी - आगे"} lang={lang} fileName={`${d.name}-vehicle-front.jpg`} height="h-28" />}
            {d.vehicleSpec?.photoSide && <KycDocThumb url={d.vehicleSpec.photoSide.url} label={lang === "en" ? "Vehicle - Side" : lang === "mr" ? "गाडी - बाजू" : "गाड़ी - साइड"} lang={lang} fileName={`${d.name}-vehicle-side.jpg`} height="h-28" />}
          </div>
        </>
      )}
      {d.vehicleSpec && (
        <div className="text-[11px] mb-2" style={{ color: C.ink }}>
          <b>{lang === "en" ? "Vehicle number" : lang === "mr" ? "गाडी नंबर" : "गाड़ी नंबर"}:</b> <span style={{ fontFamily: monoFont }}>{d.vehicleSpec.vehicleNumber || "—"}</span><br />
          <b>{lang === "en" ? "Capacity/size" : lang === "mr" ? "क्षमता/साइझ" : "क्षमता/साइज़"}:</b> {d.vehicleSpec.capacityKg ? `${d.vehicleSpec.capacityKg} ${lang === "en" ? "kg" : lang === "mr" ? "किलो" : "किग्रा"}` : "—"} ·{" "}
          {d.vehicleSpec.length || "—"}×{d.vehicleSpec.width || "—"}×{d.vehicleSpec.height || "—"} {lang === "en" ? "ft" : lang === "mr" ? "फूट" : "फीट"}
        </div>
      )}
      {!d.vehicleSpec && !d.docs && (
        <p className="text-[11px]" style={{ color: C.inkSoft }}>{lang === "en" ? "No extra data available for this driver (demo driver)." : lang === "mr" ? "या ड्रायव्हरचा कोणताही अतिरिक्त डेटा उपलब्ध नाही (डेमो ड्रायव्हर)." : "इस ड्राइवर का कोई अतिरिक्त डेटा उपलब्ध नहीं है (डेमो ड्राइवर)।"}</p>
      )}
    </div>
  );

  return (
    <div className="rounded-xl p-4 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setView("incomplete")} className="flex-1 rounded-lg py-3 text-sm font-bold flex items-center justify-center gap-1.5"
          style={{ background: view === "incomplete" ? C.navy : C.paper, color: view === "incomplete" ? "#fff" : C.inkSoft, border: `1.5px solid ${view === "incomplete" ? C.navy : C.line}` }}>
          <XCircle size={14} /> {lang === "en" ? "Incomplete" : lang === "mr" ? "अपूर्ण" : "अधूरी"} ({incomplete.length})
        </button>
        <button onClick={() => setView("complete")} className="flex-1 rounded-lg py-3 text-sm font-bold flex items-center justify-center gap-1.5"
          style={{ background: view === "complete" ? C.navy : C.paper, color: view === "complete" ? "#fff" : C.inkSoft, border: `1.5px solid ${view === "complete" ? C.navy : C.line}` }}>
          <Users size={14} /> {lang === "en" ? "Complete" : lang === "mr" ? "पूर्ण" : "पूरी"} ({complete.length})
        </button>
      </div>
      {missingCapacity.length > 0 && (
        <button onClick={() => setView("capacity")} className="w-full rounded-lg py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 mb-4"
          style={{ background: view === "capacity" ? C.navy : C.paper, color: view === "capacity" ? "#fff" : C.safety, border: `1.5px solid ${view === "capacity" ? C.navy : C.safety}` }}>
          <Weight size={13} /> {lang === "en" ? `Missing vehicle capacity (${missingCapacity.length})` : lang === "mr" ? `गाडीची क्षमता नमूद नाही (${missingCapacity.length})` : `गाड़ी की क्षमता दर्ज नहीं (${missingCapacity.length})`}
        </button>
      )}

      {view === "incomplete" ? (
        <div>
          <p className="text-[11px] mb-3" style={{ color: C.inkSoft }}>
            {lang === "en" ? "Some haven't submitted KYC yet; others are submitted and waiting on your approval." : lang === "mr" ? "काहींनी अजून KYC जमा केलेली नाही; इतरांनी जमा केली आहे आणि तुमच्या अप्रूव्हलची वाट पाहत आहेत." : "कुछ ने अभी तक KYC जमा नहीं की; बाकी जमा हो चुकी है और आपके अप्रूवल का इंतज़ार कर रही है।"}
          </p>
          {notSubmitted.length === 0 ? null : nextToRemind ? (
            <a href={whatsappLink(nextToRemind.mobile)} target="_blank" rel="noreferrer" onClick={() => markWhatsappSent(nextToRemind.mobile)}
              className="w-full rounded-lg py-3 font-bold text-sm mb-3 flex items-center justify-center gap-1.5 text-white" style={{ background: C.success }}>
              <MessageCircle size={14} />
              {lang === "en" ? `Send next KYC reminder on WhatsApp (${notSubmittedUnsent.length} left)` : lang === "mr" ? `पुढचा KYC रिमाइंडर WhatsApp वर पाठवा (${notSubmittedUnsent.length} बाकी)` : `अगला KYC रिमाइंडर WhatsApp पर भेजें (${notSubmittedUnsent.length} बाकी)`}
            </a>
          ) : (
            <div className="w-full rounded-lg py-3 font-bold text-sm mb-3 flex items-center justify-center gap-1.5" style={{ background: "#E0E0E0", color: "#9AA3B0" }}>
              <CheckCircle2 size={14} />
              {lang === "en" ? "Everyone reminded today" : lang === "mr" ? "आज सर्वांना आठवण दिली" : "आज सभी को याद दिलाया गया"}
            </div>
          )}
          {incomplete.length === 0 ? (
            <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Every driver's KYC is resolved." : lang === "mr" ? "सर्व ड्रायव्हरांची KYC निकाली काढली आहे." : "सभी ड्राइवरों की KYC निपटा दी गई है।"}</p>
          ) : (
            <div className="space-y-1.5">
              {incomplete.map((d) => {
                if (d.vehicleSpec) {
                  // Submitted, awaiting review — Approve/Block are live here.
                  const expanded = expandedId === d.id;
                  return (
                    <div key={d.id} className="rounded-lg p-3" style={{ border: `1px solid ${C.line}` }}>
                      <div className="flex items-center justify-between gap-2">
                        <button onClick={() => setExpandedId(expanded ? null : d.id)} className="text-left flex-1 min-w-0">
                          <div className="text-xs font-bold" style={{ color: C.ink }}>{d.name}</div>
                          <div className="text-[10px]" style={{ color: C.inkSoft, fontFamily: monoFont }}>{d.vehicleSpec?.vehicleNumber || "—"} · {d.mobile}</div>
                          <div className="text-[10px] font-semibold mt-0.5" style={{ color: C.marigoldDeep }}>{expanded ? (lang === "en" ? "▲ Hide details" : lang === "mr" ? "▲ डिटेल लपवा" : "▲ डिटेल छुपाएं") : (lang === "en" ? "▼ View KYC details" : lang === "mr" ? "▼ KYC डिटेल पहा" : "▼ KYC डिटेल देखें")}</div>
                        </button>
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => updateDriverKyc(d.id, "Rejected")} className="text-base font-semibold px-4 py-2.5 rounded-lg" style={{ background: C.safety, color: "#FFFFFF" }}>{lang === "en" ? "Block" : lang === "mr" ? "ब्लॉक करा" : "ब्लॉक करें"}</button>
                          <button onClick={() => updateDriverKyc(d.id, "Approved")} className="text-base font-semibold px-4 py-2.5 rounded-lg text-white shadow-lg" style={{ background: C.metallicGreen }}>{lang === "en" ? "Approve" : lang === "mr" ? "अप्रूव्ह करा" : "अप्रूव करें"}</button>
                        </div>
                      </div>
                      {expanded && docSection(d)}
                    </div>
                  );
                }
                // Not submitted yet — Approve is shown but disabled since
                // there's nothing to review; WhatsApp is the live action.
                return (
                  <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2" style={{ border: `1px solid ${C.line}` }}>
                    <div className="min-w-0">
                      <div className="text-xs font-bold" style={{ color: C.ink }}>{d.name}</div>
                      <div className="text-[10px]" style={{ color: C.inkSoft, fontFamily: monoFont }}>{d.mobile}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex gap-2">
                        <button disabled title={lang === "en" ? "Approve unlocks once this driver submits KYC" : lang === "mr" ? "ड्रायव्हरने KYC जमा केल्यावरच अप्रूव्ह करता येईल" : "ड्राइवर के KYC जमा करने के बाद ही अप्रूव कर सकते हैं"}
                          className="rounded-lg px-3 py-2 text-xs font-bold" style={{ background: "#E0E0E0", color: "#9AA3B0" }}>
                          {lang === "en" ? "Approve" : lang === "mr" ? "अप्रूव्ह करा" : "अप्रूव करें"}
                        </button>
                        <a href={whatsappLink(d.mobile)} target="_blank" rel="noreferrer" onClick={() => markWhatsappSent(d.mobile)}
                          className="rounded-lg px-3 py-2 flex items-center gap-1 text-xs font-bold text-white" style={{ background: C.success }}>
                          <MessageCircle size={14} /> WhatsApp
                        </a>
                      </div>
                      {sentToday(d.mobile) && (
                        <span className="text-[10px] font-semibold" style={{ color: C.navy }}>
                          ✓ {lang === "en" ? "Message sent" : lang === "mr" ? "संदेश पाठवला" : "संदेश भेजा गया"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : view === "capacity" ? (
        <div>
          <p className="text-[11px] mb-3" style={{ color: C.inkSoft }}>
            {lang === "en" ? "These drivers already submitted KYC (photo, license, vehicle number) but their vehicle capacity is missing — without it, they get no fare shown and can't be matched to loads by weight." : lang === "mr" ? "या ड्रायव्हरांनी KYC (फोटो, लायसन्स, गाडी नंबर) आधीच जमा केली आहे, पण त्यांची गाडीची क्षमता नमूद नाही — त्याशिवाय त्यांना भाडे दिसत नाही आणि वजनानुसार लोड जुळत नाही." : "इन ड्राइवरों ने KYC (फोटो, लाइसेंस, गाड़ी नंबर) पहले ही जमा कर दी है, लेकिन उनकी गाड़ी की क्षमता दर्ज नहीं है — इसके बिना उन्हें भाड़ा नहीं दिखता और वजन के हिसाब से लोड नहीं मिल पाते।"}
          </p>
          <button onClick={sendToMissingCapacity} disabled={missingCapacity.length === 0 || sendingCapacity}
            className="w-full rounded-lg py-3 font-bold text-sm mb-3 flex items-center justify-center gap-1.5"
            style={{ background: missingCapacity.length && !sendingCapacity ? C.marigold : "#E0E0E0", color: missingCapacity.length && !sendingCapacity ? "#000000" : "#9AA3B0" }}>
            <Bell size={14} />
            {sendingCapacity
              ? (lang === "en" ? "Sending..." : lang === "mr" ? "पाठवले जात आहे..." : "भेजा जा रहा है...")
              : (lang === "en" ? `Send capacity reminder to all (${missingCapacity.length})` : lang === "mr" ? `सर्वांना क्षमता रिमाइंडर पाठवा (${missingCapacity.length})` : `सभी को क्षमता रिमाइंडर भेजें (${missingCapacity.length})`)}
          </button>
          {sendResultCapacity && (
            <div className="text-[11px] font-semibold mb-3" style={{ color: sendResultCapacity.ok ? C.success : C.safety }}>
              {sendResultCapacity.ok
                ? (lang === "en" ? `Sent — delivered to ${sendResultCapacity.sentCount || 0} device(s).` : lang === "mr" ? `पाठवले — ${sendResultCapacity.sentCount || 0} डिव्हाइसवर पोहोचले.` : `भेज दिया — ${sendResultCapacity.sentCount || 0} डिवाइस पर पहुंचा।`)
                : (lang === "en" ? "Couldn't send — try again." : lang === "mr" ? "पाठवू शकलो नाही — पुन्हा प्रयत्न करा." : "भेज नहीं सका — फिर कोशिश करें।")}
            </div>
          )}
          {missingCapacity.length === 0 ? (
            <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Every driver's vehicle capacity is on file." : lang === "mr" ? "सर्व ड्रायव्हरांची गाडी क्षमता नोंदवलेली आहे." : "सभी ड्राइवरों की गाड़ी क्षमता दर्ज है।"}</p>
          ) : (
            <div className="space-y-1.5">
              {missingCapacity.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2" style={{ border: `1px solid ${C.line}` }}>
                  <div className="min-w-0">
                    <div className="text-xs font-bold" style={{ color: C.ink }}>{d.name}</div>
                    <div className="text-[10px]" style={{ color: C.inkSoft, fontFamily: monoFont }}>{d.vehicleSpec?.vehicleNumber || "—"} · {d.mobile}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <a href={capacityWhatsappLink(d.mobile)} target="_blank" rel="noreferrer" onClick={() => markWhatsappSent(d.mobile)}
                      className="rounded-lg px-3 py-2 flex items-center gap-1 text-xs font-bold text-white" style={{ background: C.success }}>
                      <MessageCircle size={14} /> WhatsApp
                    </a>
                    {sentToday(d.mobile) && (
                      <span className="text-[10px] font-semibold" style={{ color: C.navy }}>
                        ✓ {lang === "en" ? "Message sent" : lang === "mr" ? "संदेश पाठवला" : "संदेश भेजा गया"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          {complete.length === 0 ? <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "No driver's KYC has been resolved yet." : lang === "mr" ? "अजून कोणत्याही ड्रायव्हरची KYC निकाली निघालेली नाही." : "अभी तक किसी ड्राइवर की KYC निपटाई नहीं गई है।"}</p> : (
            <div className="space-y-2">
              {complete.map((d) => {
                const expanded = expandedId === d.id;
                const meta = statusMeta[d.kyc] || statusMeta.Approved;
                return (
                  <div key={d.id} className="rounded-lg p-3" style={{ border: `1px solid ${C.line}` }}>
                    <div className="flex items-center justify-between gap-2">
                      <button onClick={() => setExpandedId(expanded ? null : d.id)} className="text-left flex-1 min-w-0">
                        <div className="text-xs font-bold" style={{ color: C.ink }}>{d.name}</div>
                        <div className="text-[10px]" style={{ color: C.inkSoft, fontFamily: monoFont }}>{d.vehicleSpec?.vehicleNumber || "—"} · {d.mobile}</div>
                        <div className="text-[10px] font-semibold mt-0.5" style={{ color: C.marigoldDeep }}>{expanded ? (lang === "en" ? "▲ Hide details" : lang === "mr" ? "▲ डिटेल लपवा" : "▲ डिटेल छुपाएं") : (lang === "en" ? "▼ View KYC details" : lang === "mr" ? "▼ KYC डिटेल पहा" : "▼ KYC डिटेल देखें")}</div>
                      </button>
                      <span className="text-[10px] font-bold px-2.5 py-1.5 rounded-full text-white shrink-0" style={{ background: meta.bg }}>{meta.label}</span>
                    </div>
                    {expanded && docSection(d)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AdminAlerts({ alerts, withdrawals, approveWithdrawal, rechargeRequests, approveRecharge, lang }) {
  const roleLabel = lang === "en" ? { customer: "Customer", driver: "Driver" } : lang === "mr" ? { customer: "ग्राहक", driver: "ड्रायव्हर" } : { customer: "ग्राहक", driver: "ड्राइवर" };
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
                  {/* Complaints filed before this shipped have no mobile on
                      file at all -- nothing to reply to, so the button is
                      simply omitted for those instead of linking nowhere. */}
                  {a.mobile && (
                    <a
                      href={`https://wa.me/91${a.mobile}?text=${encodeURIComponent(`${lang === "en" ? "Re" : "जवाब"}: "${a.note || ""}"\n\n`)}`}
                      target="_blank" rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full text-white"
                      style={{ background: C.metallicGreen }}>
                      <MessageCircle size={12} /> {lang === "en" ? "Reply on WhatsApp" : lang === "mr" ? "WhatsApp वर उत्तर द्या" : "WhatsApp पर जवाब दें"}
                    </a>
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
// Exotel's Connect API response is all this reads -- a call-status webhook
// would be needed for more than that, which isn't wired up).
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
                {log.exotelCallSid && <div className="text-[10px] mt-0.5" style={{ color: C.inkSoft, fontFamily: monoFont }}>SID: {log.exotelCallSid}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminDriverList({ drivers, toggleBlacklist, deleteDriver, lang }) {
  const [q, setQ] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [showCall, setShowCall] = useState(false);
  const [callQ, setCallQ] = useState("");
  // Free Trial vs Main Routine is computed live from each driver's own
  // createdAt (see isInTrial/trialDaysLeft) instead of a stored status
  // field — a driver moves the instant their 30 days are up, on every
  // render, with nothing that can fall out of sync if a scheduled check
  // were ever missed. The Cloud Function on the backend does the same
  // computation independently, only for sending the one-time "trial
  // ended" push notification (see functions/index.js).
  // "Total Drivers" and every tab/count below it all report the SAME
  // installed-drivers population (see installedDrivers) -- how many
  // actually still have the app on their phone, not how many driver docs
  // have ever been created. Deliberately the single shared base for
  // every number on this screen so none of them can read differently
  // from each other again.
  const totalInstalled = installedDrivers(drivers);
  const [trialTab, setTrialTab] = useState("all"); // 'all' | 'trial' | 'main'
  const trialCount = totalInstalled.filter((d) => isInTrial(d.createdAt)).length;
  const byTrialTab = trialTab === "all" ? totalInstalled : totalInstalled.filter((d) => (trialTab === "trial" ? isInTrial(d.createdAt) : !isInTrial(d.createdAt)));
  // GPS diagnostic (see gpsStatus) -- an Online driver whose lastKnownLocation
  // is stale/missing is the exact "is this actually tracking?" question,
  // made visible per-driver instead of guessed at from Online status alone.
  // Scoped to installed, non-blacklisted drivers only -- a blacklisted
  // driver's GPS status isn't actionable, and an uninstalled driver isn't
  // the one this WhatsApp-reminder flow below is meant to reach anyway.
  const [gpsOnly, setGpsOnly] = useState(false);
  const onlineNoLiveGps = totalInstalled.filter((d) => d.online && gpsStatus(d, lang).stale);
  const byGps = gpsOnly ? byTrialTab.filter((d) => d.online && gpsStatus(d, lang).stale) : byTrialTab;
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
  const nextGpsToRemind = gpsUnsent[0] || null;
  const gpsWhatsappLink = (mobile) => {
    const msg = lang === "en"
      ? "Your GPS/location tracking looks off in our app right now. To keep getting loads, you must turn it on -- please check these two things on your phone:\n1) Settings → Location → turn ON\n2) Settings → Apps → Apna Transport → Permissions → Location → Allow\nThen reopen our app."
      : lang === "mr"
      ? "तुमची GPS/लोकेशन ट्रॅकिंग सध्या आमच्या अ‍ॅपमध्ये बंद दिसत आहे. लोड मिळत राहण्यासाठी ती सुरू करणे आवश्यक आहे -- कृपया तुमच्या फोनमध्ये या दोन गोष्टी तपासा:\n1) Settings → Location → सुरू करा\n2) Settings → Apps → Apna Transport → Permissions → Location → Allow करा\nमग आमचे अ‍ॅप पुन्हा उघडा."
      : "आपकी GPS/लोकेशन ट्रैकिंग अभी हमारे ऐप में बंद दिख रही है। लोड मिलते रहने के लिए इसे ऑन करना ज़रूरी है -- कृपया अपने फोन में ये दो चीज़ें चेक करें:\n1) Settings → Location → ऑन करें\n2) Settings → Apps → Apna Transport → Permissions → Location → Allow करें\nफिर हमारा ऐप फिर से खोलें।";
    return `https://wa.me/91${mobile}?text=${encodeURIComponent(msg)}`;
  };
  // Typing an actual search query reaches EVERY driver record (uninstalled
  // or blacklisted included), not just the installed ones the tabs/counts
  // above default to -- otherwise admin would have no way to ever find
  // and unblacklist someone once they're not counted as "installed"
  // anymore. The default (empty query) view stays scoped to byGps/
  // byTrialTab so every number on this screen agrees with each other.
  const searchBase = q.trim() ? drivers : byGps;
  const filtered = searchBase.filter((d) => d.name.includes(q) || (d.vehicleSpec?.vehicleNumber || "").toLowerCase().includes(q.toLowerCase()) || (d.mobile || "").includes(q));
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

  return (
    <div className="rounded-xl p-4 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-bold flex items-center gap-1.5" style={{ color: C.ink }}>
          <Users size={16} /> {lang === "en" ? "All Drivers" : lang === "mr" ? "सर्व ड्रायव्हर" : "सभी ड्राइवर"}
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#FFFFFF", background: C.navy }}>{totalInstalled.length}</span>
        </div>
        <button onClick={() => setShowCall((v) => !v)} className="text-sm font-bold px-4 py-2.5 rounded-lg text-white shadow-lg flex items-center gap-1" style={{ background: C.metallicGreen }}>
          {showCall ? (lang === "en" ? "Cancel" : lang === "mr" ? "रद्द करा" : "रद्द करें") : <><Phone size={12} /> {lang === "en" ? "Call Driver" : lang === "mr" ? "ड्रायव्हरला कॉल करा" : "ड्राइवर को कॉल करें"}</>}
        </button>
      </div>
      {onlineNoLiveGps.length > 0 && (
        <button onClick={() => setGpsOnly((v) => !v)} className="w-full rounded-lg p-3 mb-3 text-left" style={{ background: gpsOnly ? C.safety : "#FFF3F3", border: `1.5px solid ${C.safety}` }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: gpsOnly ? "#FFFFFF" : C.safety }}>
              <MapPin size={14} /> {lang === "en" ? "Online but no live GPS" : lang === "mr" ? "ऑनलाइन पण लाइव्ह GPS नाही" : "ऑनलाइन लेकिन लाइव GPS नहीं"}
            </span>
            <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ background: gpsOnly ? "#FFFFFF" : C.safety, color: gpsOnly ? C.safety : "#FFFFFF" }}>{onlineNoLiveGps.length}</span>
          </div>
          <p className="text-[10px] font-semibold mt-1" style={{ color: gpsOnly ? "#FFFFFF" : C.safety }}>
            {gpsOnly
              ? (lang === "en" ? "Showing only these — tap again to show everyone." : lang === "mr" ? "फक्त हेच दाखवत आहे — पुन्हा टॅप करून सर्व पहा." : "सिर्फ यही दिखा रहा है — फिर टैप करके सभी देखें।")
              : (lang === "en" ? "These drivers say Online but haven't sent a GPS update recently — tap to filter to just them." : lang === "mr" ? "हे ड्रायव्हर ऑनलाइन आहेत पण अलीकडे GPS अपडेट पाठवलेले नाही — फक्त हेच पाहण्यासाठी टॅप करा." : "ये ड्राइवर ऑनलाइन हैं लेकिन हाल में GPS अपडेट नहीं भेजा — सिर्फ इन्हें देखने के लिए टैप करें।")}
          </p>
        </button>
      )}
      {onlineNoLiveGps.length > 0 && (
        nextGpsToRemind ? (
          <a href={gpsWhatsappLink(nextGpsToRemind.mobile)} target="_blank" rel="noreferrer" onClick={() => markGpsWhatsappSent(nextGpsToRemind.mobile)}
            className="w-full rounded-lg py-3 font-bold text-sm mb-3 flex items-center justify-center gap-1.5 text-white" style={{ background: C.success }}>
            <MessageCircle size={14} />
            {lang === "en" ? `Send next GPS reminder on WhatsApp (${gpsUnsent.length} left)` : lang === "mr" ? `पुढचा GPS रिमाइंडर WhatsApp वर पाठवा (${gpsUnsent.length} बाकी)` : `अगला GPS रिमाइंडर WhatsApp पर भेजें (${gpsUnsent.length} बाकी)`}
          </a>
        ) : (
          <div className="w-full rounded-lg py-3 font-bold text-sm mb-3 flex items-center justify-center gap-1.5" style={{ background: "#E0E0E0", color: "#9AA3B0" }}>
            <CheckCircle2 size={14} />
            {lang === "en" ? "Everyone reminded today" : lang === "mr" ? "आज सर्वांना आठवण दिली" : "आज सभी को याद दिलाया गया"}
          </div>
        )
      )}
      {showCall && (() => {
        const callFiltered = drivers.filter((d) => d.name.includes(callQ) || (d.vehicleSpec?.vehicleNumber || "").toLowerCase().includes(callQ.toLowerCase()) || (d.mobile || "").includes(callQ));
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
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        {[
          ["all", lang === "en" ? "All" : lang === "mr" ? "सर्व" : "सभी", totalInstalled.length],
          ["trial", lang === "en" ? "Free Trial" : lang === "mr" ? "फ्री ट्रायल" : "फ्री ट्रायल", trialCount],
          ["main", lang === "en" ? "Main Routine" : lang === "mr" ? "मुख्य रुटीन" : "मुख्य रूटीन", totalInstalled.length - trialCount],
        ].map(([key, label, count]) => (
          <button key={key} onClick={() => setTrialTab(key)} className="rounded-lg py-3 text-sm font-bold text-center"
            style={{ background: trialTab === key ? C.marigoldDeep : C.bg, color: trialTab === key ? "#fff" : C.inkSoft, border: `1px solid ${trialTab === key ? C.marigoldDeep : C.line}` }}>
            {label} ({count})
          </button>
        ))}
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={lang === "en" ? "Search by name, vehicle number or mobile..." : lang === "mr" ? "नाव, गाडी नंबर किंवा मोबाइलने शोधा..." : "नाम, गाड़ी नंबर या मोबाइल से खोजें..."} className="w-full rounded-lg px-3 py-2 text-xs outline-none mb-3" style={{ border: `1px solid ${C.line}`, background: C.paper, color: C.ink }} />
      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "No driver found." : lang === "mr" ? "कोणताही ड्रायव्हर सापडला नाही." : "कोई ड्राइवर नहीं मिला।"}</p>}
        {filtered.map((d) => {
          const km = kycMeta[d.kyc] || kycMeta.none;
          const expanded = expandedId === d.id;
          const daysLeft = trialDaysLeft(d.createdAt);
          const gps = gpsStatus(d, lang);
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
                      <a href={gpsWhatsappLink(d.mobile)} target="_blank" rel="noreferrer" onClick={() => markGpsWhatsappSent(d.mobile)}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 text-white" style={{ background: C.success }}>
                        <MessageCircle size={9} /> WhatsApp
                      </a>
                    )
                  )}
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: km.color, background: km.bg }}>{km.label}</span>
                  {daysLeft != null ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#FFFFFF", background: C.marigoldDeep }}>
                      {lang === "en" ? `Trial · ${daysLeft}d left` : lang === "mr" ? `ट्रायल · ${daysLeft} दिवस बाकी` : `ट्रायल · ${daysLeft} दिन बाकी`}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: C.inkSoft, background: "#E5E5E5" }}>{lang === "en" ? "Main Routine" : lang === "mr" ? "मुख्य रुटीन" : "मुख्य रूटीन"}</span>
                  )}
                </div>
              </div>

              <button onClick={() => setExpandedId(expanded ? null : d.id)} className="text-sm font-bold mt-2" style={{ color: C.marigoldDeep }}>
                {expanded ? (lang === "en" ? "▲ Hide KYC details" : lang === "mr" ? "▲ KYC डिटेल लपवा" : "▲ KYC डिटेल छुपाएं") : (lang === "en" ? "▼ View KYC details" : lang === "mr" ? "▼ KYC डिटेल पहा" : "▼ KYC डिटेल देखें")}
              </button>
              {expanded && (
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
        })}
      </div>
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
          <button key={a} onClick={() => { setAudience(a); setTarget("all"); setSearch(""); }} className="flex-1 rounded-lg py-3 text-base font-bold"
            style={{ background: audience === a ? C.navy : C.paper, color: audience === a ? "#fff" : C.inkSoft, border: `1.5px solid ${audience === a ? C.navy : C.line}` }}>
            {a === "driver" ? (lang === "en" ? "Drivers" : lang === "mr" ? "ड्रायव्हर" : "ड्राइवर") : (lang === "en" ? "Customers" : lang === "mr" ? "कस्टमर" : "कस्टमर")}
          </button>
        ))}
      </div>
      <label className="text-[11px] font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Send to" : lang === "mr" ? "कोणाला पाठवायचे" : "किसे भेजें"}</label>
      <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder={lang === "en" ? "Search by name..." : lang === "mr" ? "नावाने शोधा..." : "नाम से खोजें..."}
        className="w-full rounded-lg px-3 py-2 text-xs outline-none mb-1.5" style={{ border: `1px solid ${C.line}`, color: C.ink }} />
      <select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full rounded-lg px-3 py-2 text-xs outline-none" style={{ border: `1px solid ${C.line}`, color: C.ink }}>
        <option value="all">{allLabel}</option>
        {searchedPeople.map((p) => <option key={p.mobile} value={p.mobile}>{p.name}</option>)}
      </select>
      <div className="text-[10px] mb-2 mt-1" style={{ color: C.inkSoft, minHeight: 14 }}>
        {search.trim() && (lang === "en" ? `${searchedPeople.length} match${searchedPeople.length === 1 ? "" : "es"}` : lang === "mr" ? `${searchedPeople.length} जुळले` : `${searchedPeople.length} मैच मिले`)}
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

function AdminFinance({ tripLog, commissionPct, lang }) {
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

export function AdminPanel({ drivers, customers, driver, updateDriverKyc, bookings, tripLog, alerts, toggleBlacklist, deleteDriver, deleteCustomer, commissionPct, setCommissionPct, minWallet, setMinWallet, bonusPct, setBonusPct, latestVersionCode, setLatestVersionCode, updateUrl, setUpdateUrl, latestAdminVersionCode, setLatestAdminVersionCode, adminUpdateUrl, setAdminUpdateUrl, fareTiers, lang, onLogout, withdrawals, approveWithdrawal, rechargeRequests, approveRecharge, vehicleTypes, addVehicleType, addManualCustomer, addManualDriver, expenses, expenseCategories, addExpense, addExpenseCategory, callLogs, adminNotifications, deleteAdminNotification, bugs, setBugStatus, addBug, routeFares, adminRouteFares, adminRouteFaresError, systemHealth }) {
  const [tab, setTab] = useState("fleet");
  // "kyc" is deliberately not in this list -- KYC review now lives inside
  // the Live Dashboard's "New Registrations" tile (see AdminFleet's
  // detailView === "newRegistrations", Driver tab) instead of its own
  // top-level tab or a separate "Pending KYC approvals" tile.
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
      {tab === "fleet" && <AdminFleet drivers={drivers} customers={customers} driver={driver} bookings={bookings} tripLog={tripLog} minWallet={minWallet} lang={lang} onNavigate={setTab} onLogout={onLogout} updateDriverKyc={updateDriverKyc} routeFares={routeFares} adminRouteFares={adminRouteFares} adminRouteFaresError={adminRouteFaresError} fareTiers={fareTiers} bugs={bugs} systemHealth={systemHealth} />}
      {tab === "drivers" && <AdminDriverList drivers={drivers} toggleBlacklist={toggleBlacklist} deleteDriver={deleteDriver} lang={lang} vehicleTypes={vehicleTypes} addVehicleType={addVehicleType} addManualDriver={addManualDriver} />}
      {tab === "customers" && <AdminCustomers customers={customers} bookings={bookings} lang={lang} deleteCustomer={deleteCustomer} />}
      {tab === "expenses" && <AdminExpenses expenses={expenses} expenseCategories={expenseCategories} addExpense={addExpense} addExpenseCategory={addExpenseCategory} lang={lang} />}
      {tab === "settings" && <AdminSettings commissionPct={commissionPct} setCommissionPct={setCommissionPct} bonusPct={bonusPct} setBonusPct={setBonusPct} minWallet={minWallet} setMinWallet={setMinWallet} latestVersionCode={latestVersionCode} setLatestVersionCode={setLatestVersionCode} updateUrl={updateUrl} setUpdateUrl={setUpdateUrl} latestAdminVersionCode={latestAdminVersionCode} setLatestAdminVersionCode={setLatestAdminVersionCode} adminUpdateUrl={adminUpdateUrl} setAdminUpdateUrl={setAdminUpdateUrl} bugs={bugs} setBugStatus={setBugStatus} addBug={addBug} lang={lang} />}
      {tab === "finance" && <AdminFinance tripLog={tripLog} commissionPct={commissionPct} lang={lang} />}
      {tab === "notify" && <AdminNotify drivers={drivers} customers={customers} adminNotifications={adminNotifications} deleteAdminNotification={deleteAdminNotification} lang={lang} />}
      {tab === "alerts" && <AdminAlerts alerts={alerts} withdrawals={withdrawals} approveWithdrawal={approveWithdrawal} rechargeRequests={rechargeRequests} approveRecharge={approveRecharge} lang={lang} />}
      {tab === "callLogs" && <AdminCallLogs callLogs={callLogs} bookings={bookings} lang={lang} />}
    </div>
  );
}
