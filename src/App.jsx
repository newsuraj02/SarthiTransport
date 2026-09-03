import React, { useState, useEffect, useRef, useId } from "react";
import {
  Truck, MapPin, Package, Wallet, UserCircle2, ShieldCheck, Camera, Clock3,
  Phone, PhoneCall, MessageCircle, CheckCircle2, XCircle, Bell, Navigation, Activity,
  Users, BarChart3, Settings2, Download, IndianRupee, LayoutDashboard,
  ClipboardList, MapPinned, Siren, Mic, Menu, ChevronLeft, ChevronDown, Eye, EyeOff, Plus, Loader2,
  FileText, X, Upload, ArrowRight, IdCard, UserCheck, Languages,
} from "lucide-react";
import {
  firestoreReady, subscribeCollection, subscribeDoc, getOrCreateDoc, getDocOnce, createDoc, replaceDoc, patchDoc, removeDoc, seedIfEmpty,
} from "./firestoreStore";
import { increment, arrayUnion, serverTimestamp } from "firebase/firestore";
import { GoogleMap, MarkerF, PolylineF, Autocomplete } from "@react-google-maps/api";
import { useGoogleMaps } from "./googleMapsContext.jsx";
import { RecaptchaVerifier, signInWithPhoneNumber, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, linkWithCredential, EmailAuthProvider, onAuthStateChanged } from "firebase/auth";
import { ref as storageRef, uploadBytes, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { customerFirebaseAuth, driverFirebaseAuth, adminFirebaseAuth, setActiveRole, getActiveStorage, requestPushToken, listenForegroundPush, initiateMaskedCall, sendAdminNotification, pinAuthEmail, pinToPassword, resetPinAfterPhoneVerify } from "./firebaseClient";

// ---------------- design tokens ----------------
// Bright/high-visibility flat palette — legible in direct outdoor sunlight
// for drivers and customers using this on the road. Solid fills only, no
// gradients/pastel tints (readability over decoration). Token names
// (marigold, navy, etc.) are kept as-is even though they no longer mean
// gold/maroon — every screen already references these by name, so this is
// a value-only swap.
const C = {
  bg: "#FFFFFF",
  paper: "#FFFFFF",
  ink: "#000000",
  inkSoft: "#333333",
  marigold: "#FFCC00",
  marigoldDeep: "#FF6600",
  safety: "#FF2A2A",
  success: "#00A854",
  line: "#000000",
  navy: "#0052CC",
  pimpri: "#FF6600",
  chinchwad: "#00A854",
  // Flat solid fill (no gradient) for the app's highlighted info/policy
  // boxes — Fare & Waiting Charge Policy, quote-entry, Scheduled-for, KYC
  // tips, wallet summary, etc.
  metallicGold: "#FFCC00",
  // Flat solid fill for primary action buttons that used to carry a
  // green gradient sheen — Send Quote, Book this vehicle, Save Changes,
  // admin Approve/Add, etc.
  metallicGreen: "#00A854",
};
const bodyFont = "'Noto Sans','Segoe UI',system-ui,sans-serif";
const monoFont = "'JetBrains Mono','Courier New',monospace";

// Brand mark — full-bleed bright-yellow square holding a bold flat truck
// silhouette, with an "Apna Transport" wordmark band along the bottom. Same
// design as the app's favicon/PWA/Play Store icons (public/favicon.svg,
// public/icons/*) so the mark reads as one consistent icon everywhere it
// appears, in-app or on a home screen. Built as inline SVG (not an image
// file) so it stays crisp at any size; gradient ids are namespaced per
// instance via useId so multiple Logos on one page don't clash.
function Logo({ size = 64, showText = true }) {
  const uid = useId();
  const g = (name) => `${uid}-${name}`;
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" style={{ display: "block", borderRadius: size * 0.22, overflow: "hidden" }}>
      <defs>
        <linearGradient id={g("ybg")} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#FFD93D" />
          <stop offset="100%" stopColor="#FFC300" />
        </linearGradient>
        <linearGradient id={g("sheen")} x1="20%" y1="0%" x2="80%" y2="60%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.5" />
          <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="512" height="512" fill={`url(#${g("ybg")})`} />
      <rect x="0" y="0" width="512" height="512" fill={`url(#${g("sheen")})`} />

      {/* truck, a bold 2-tone silhouette — window/hubs are yellow
          negative-space cutouts rather than a 3rd color, so it stays
          legible even shrunk down to a small header icon */}
      <g transform={showText ? "translate(0,-14)" : "translate(0,20) scale(1.28) translate(-56,-46)"}>
        <rect x="70" y="196" width="238" height="120" rx="16" fill="#0B3D91" />
        <rect x="90" y="214" width="150" height="30" rx="8" fill="#FFD93D" opacity="0.85" />

        <path d="M308 224 L392 224 Q414 224 414 246 L414 316 L308 316 Z" fill="#0B3D91" />
        <rect x="330" y="240" width="52" height="42" rx="7" fill="#FFD93D" opacity="0.85" />

        <circle cx="150" cy="330" r="42" fill="#0B3D91" />
        <circle cx="150" cy="330" r="16" fill="#FFD93D" opacity="0.85" />
        <circle cx="356" cy="330" r="42" fill="#0B3D91" />
        <circle cx="356" cy="330" r="16" fill="#FFD93D" opacity="0.85" />
      </g>

      {showText && (
        <g>
          <rect x="46" y="382" width="420" height="88" rx="20" fill="#0B3D91" />
          <text x="256" y="424" textAnchor="middle" fontFamily={bodyFont} fontWeight="900" fontSize="40" letterSpacing="1" fill="#FFFFFF">APNA</text>
          <text x="256" y="458" textAnchor="middle" fontFamily={bodyFont} fontWeight="900" fontSize="30" letterSpacing="3" fill="#FFFFFF">TRANSPORT</text>
        </g>
      )}
    </svg>
  );
}

const DEFAULT_VEHICLES = [
  { key: "chhota", label: "छोटा हाथी", labelEn: "Chhota Hathi (Mini Truck)", rate: 20, capacity: "750 किग्रा", capacityEn: "750 kg", capacityKg: 750, l: 7, w: 4.5, h: 4.5 },
  { key: "tataAce", label: "टाटा एस", labelEn: "Tata Ace", rate: 25, capacity: "850 किग्रा", capacityEn: "850 kg", capacityKg: 850, l: 7.5, w: 4.5, h: 5 },
  { key: "pickup", label: "पिकअप", labelEn: "Pickup", rate: 30, capacity: "1.5 टन", capacityEn: "1.5 ton", capacityKg: 1500, l: 8.5, w: 5, h: 5.5 },
  { key: "truck", label: "बड़ा ट्रक", labelEn: "Big Truck", rate: 50, capacity: "9+ टन", capacityEn: "9+ ton", capacityKg: 9000, l: 19, w: 6.5, h: 7 },
];
function slugify(str) {
  return "v" + str.replace(/\s+/g, "").slice(0, 10) + Math.floor(Math.random() * 900 + 100);
}
// Reference specs for common Indian commercial vehicle models — lets Driver
// KYC auto-fill capacity/length/width/height the moment a driver types a
// recognizable model name into "Vehicle Name", instead of leaving them to
// guess these numbers. Matched loosely against free-typed text (lowercase,
// substring), since there's no dropdown here — "Tata Ace Gold", "ace",
// "chhota hathi" all resolve sensibly. Values are commonly published
// reference specs, not per-unit exact; the driver can always edit any field
// afterward, and the auto-fill never overwrites a field once they have.
const VEHICLE_MODEL_SPECS = [
  { keys: ["tata ace gold"], capacityKg: 850, length: 7.5, width: 4.5, height: 5 },
  { keys: ["tata ace", "chhota hathi", "chotta hathi", "chota hathi"], capacityKg: 750, length: 7, width: 4.5, height: 4.5 },
  { keys: ["mahindra jeeto", "jeeto"], capacityKg: 600, length: 6.5, width: 4.3, height: 4.3 },
  { keys: ["ashok leyland dost", "dost"], capacityKg: 1250, length: 8, width: 5, height: 5 },
  { keys: ["bolero maxitruck", "bolero pickup", "bolero"], capacityKg: 1500, length: 8.5, width: 5, height: 5.5 },
  { keys: ["tata 407"], capacityKg: 2500, length: 10, width: 5.5, height: 6 },
  { keys: ["tata 709"], capacityKg: 4000, length: 12, width: 6, height: 6.5 },
  { keys: ["eicher 14", "14 ft", "14ft"], capacityKg: 5000, length: 14, width: 6, height: 6.5 },
  { keys: ["eicher 17", "17 ft", "17ft"], capacityKg: 7000, length: 17, width: 6.5, height: 7 },
  { keys: ["eicher 19", "19 ft", "19ft"], capacityKg: 9000, length: 19, width: 6.5, height: 7 },
  { keys: ["6 wheeler", "six wheeler", "6-wheeler"], capacityKg: 9000, length: 19, width: 6.5, height: 7 },
  { keys: ["10 wheeler", "ten wheeler", "10-wheeler"], capacityKg: 16000, length: 22, width: 7, height: 7.5 },
];
function lookupVehicleModelSpec(name) {
  const q = (name || "").trim().toLowerCase();
  if (!q) return null;
  return VEHICLE_MODEL_SPECS.find((v) => v.keys.some((k) => q.includes(k))) || null;
}
// Vehicle types added via "+ Add new type" only have one name (like custom
// materials), so English falls back to the same string when no labelEn exists.
const vehicleLabel = (v, lang) => (v ? (lang === "en" ? (v.labelEn || v.label) : v.label) : "");
const vehicleCapacity = (v, lang) => (v ? (lang === "en" ? (v.capacityEn || v.capacity) : v.capacity) : "");
// Fixed list — the only choices in the Material Type dropdown. The last
// entry ("अन्य") isn't a material: picking it reveals a free-text box (see
// CustomerBooking) and is labelled "Add Material". Whatever's typed there
// is stored straight onto the load and is never added to any shared list,
// so one customer's entry can't surface as a suggestion for anyone else.
const MATERIALS = ["लोहा", "स्टील", "एमएस स्क्रैप", "प्लास्टिक", "बॉक्स / कार्टन", "सीमेंट / बालू", "अन्य"];
const MATERIAL_LABELS_EN = { "लोहा": "Iron", "स्टील": "Steel", "एमएस स्क्रैप": "MS Scrap", "प्लास्टिक": "Plastic", "बॉक्स / कार्टन": "Box / Carton", "सीमेंट / बालू": "Cement / Sand" };
// Label for the free-text "add your own" option, per language.
const ADD_MATERIAL_LABEL = { en: "Add Material", hi: "मटेरियल जोड़ें", mr: "मटेरियल जोडा" };
const materialLabel = (m, lang, customMap = {}) => {
  if (customMap[m]) return lang === "en" ? (customMap[m].en || customMap[m].hi) : (customMap[m].hi || customMap[m].en);
  return (lang === "en" && MATERIAL_LABELS_EN[m]) ? MATERIAL_LABELS_EN[m] : m;
};

// A curated slot picker (period -> a handful of round-hour times) instead of
// a native <input type="time"> clock/dial, which testers found fiddly —
// tap a period, then a slot, done. Slot values stay 24-hour "HH:MM" so
// advanceTime/scheduledFor storage format is unchanged.
const TIME_PERIODS = [
  { key: "morning", icon: "🌅", labelHi: "सुबह", labelEn: "Morning", labelMr: "सकाळ", slots: ["06:00", "07:00", "08:00", "09:00"] },
  { key: "afternoon", icon: "☀️", labelHi: "दोपहर", labelEn: "Afternoon", labelMr: "दुपार", slots: ["12:00", "13:00", "14:00", "15:00"] },
  { key: "evening", icon: "🌆", labelHi: "शाम", labelEn: "Evening", labelMr: "संध्याकाळ", slots: ["16:00", "17:00", "18:00", "19:00"] },
  { key: "night", icon: "🌙", labelHi: "रात", labelEn: "Night", labelMr: "रात्र", slots: ["20:00", "21:00", "22:00", "23:00"] },
];
function periodLabel(period, lang) {
  return lang === "en" ? period.labelEn : lang === "mr" ? period.labelMr : period.labelHi;
}
function formatSlotShort(hhmm, lang) {
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(m).padStart(2, "0");
  return lang === "en" ? `${h12}:${mm} ${h < 12 ? "AM" : "PM"}` : lang === "mr" ? `${h12}:${mm} वाजता` : `${h12}:${mm} बजे`;
}
function formatTimeSlot(hhmm, lang) {
  if (!hhmm) return "";
  const period = TIME_PERIODS.find((p) => p.slots.includes(hhmm)) || TIME_PERIODS[0];
  return `${periodLabel(period, lang)} ${formatSlotShort(hhmm, lang)}`;
}
function TimeSlotModal({ open, value, onSelect, onClose, lang }) {
  const defaultPeriod = (TIME_PERIODS.find((p) => p.slots.includes(value)) || TIME_PERIODS[0]).key;
  const [activePeriod, setActivePeriod] = useState(defaultPeriod);
  const [pending, setPending] = useState(value || "");
  // Reselecting an already-set time shouldn't let Done through on the old
  // value alone — the period defaults to the right one for convenience
  // (so the relevant slots show immediately), but both it and a slot must
  // be actively tapped again before Done unlocks. That requirement only
  // makes sense when there WAS a prior value to reconfirm — on a genuinely
  // first-time pick there's nothing to accidentally confirm, so the
  // period (already shown highlighted as the sensible default) counts as
  // picked from the start; only the slot itself needs a tap.
  const [periodPicked, setPeriodPicked] = useState(!value);
  const [slotPicked, setSlotPicked] = useState(false);
  useEffect(() => {
    if (open) { setActivePeriod(defaultPeriod); setPending(""); setPeriodPicked(!value); setSlotPicked(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!open) return null;
  const period = TIME_PERIODS.find((p) => p.key === activePeriod);
  const canConfirm = periodPicked && slotPicked && !!pending;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(42,33,28,0.6)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-2xl overflow-hidden" style={{ background: C.paper }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4" style={{ background: C.navy }}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold" style={{ color: "#fff" }}>{lang === "en" ? "Choose Time" : lang === "mr" ? "वेळ निवडा" : "समय चुनें"}</h3>
            <button onClick={onClose} className="text-base font-bold" style={{ color: "#fff" }}>✕</button>
          </div>
          <p className="text-[11px] mt-0.5" style={{ color: "#FFFFFF" }}>{lang === "en" ? "Pick a period, then only that period's slots will show." : lang === "mr" ? "जो प्रहर निवडाल, फक्त तीच वेळ दिसेल" : "जो पहर चुनेंगे, सिर्फ वही समय दिखेगा"}</p>
        </div>
        <div className="p-5">
          <div className="text-xs font-bold mb-2" style={{ color: C.ink }}>1. {lang === "en" ? "Choose period:" : lang === "mr" ? "प्रहर निवडा:" : "पहर चुनें:"}</div>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {TIME_PERIODS.map((p) => {
              const active = activePeriod === p.key;
              return (
                <button key={p.key} type="button" onClick={() => { setActivePeriod(p.key); setPeriodPicked(true); }}
                  className="rounded-lg py-3.5 flex flex-col items-center gap-1 text-sm font-bold"
                  style={{ background: active ? C.marigoldDeep : C.bg, border: `1.5px solid ${active ? C.marigoldDeep : C.line}`, color: active ? "#FFFFFF" : C.inkSoft }}>
                  <span className="text-lg leading-none">{p.icon}</span>
                  {periodLabel(p, lang)}
                </button>
              );
            })}
          </div>
          <div className="text-xs font-bold mb-2" style={{ color: C.ink }}>2. {lang === "en" ? "Available time slots:" : lang === "mr" ? "उपलब्ध वेळ (Time Slots):" : "उपलब्ध समय (Time Slots):"}</div>
          <div className="grid grid-cols-2 gap-2 mb-5">
            {period.slots.map((s) => {
              const active = pending === s;
              return (
                <button key={s} type="button" onClick={() => { setPending(s); setSlotPicked(true); }}
                  className="rounded-lg py-3.5 text-base font-bold text-left px-4"
                  style={{ background: active ? C.marigoldDeep : C.paper, border: `1.5px solid ${active ? C.marigoldDeep : C.line}`, color: active ? "#FFFFFF" : C.ink }}>
                  {period.icon} {formatSlotShort(s, lang)}
                </button>
              );
            })}
          </div>
          <button onClick={() => { if (canConfirm) { onSelect(pending); onClose(); } }} disabled={!canConfirm}
            className="w-full rounded-lg py-4 font-bold text-base" style={{ background: canConfirm ? "#0052CC" : "#E0E0E0", color: canConfirm ? "#fff" : "#9AA3B0" }}>
            {lang === "en" ? "Done" : lang === "mr" ? "ठीक आहे (Done)" : "ठीक है (Done)"}
          </button>
        </div>
      </div>
    </div>
  );
}
const ALERT_TYPE_LABELS_EN = { "पुलिस सहायता": "Police Help", "इमरजेंसी कॉल": "Emergency Call", "व्हाट्सएप सपोर्ट": "WhatsApp Support", "शिकायत": "Complaint" };
const alertTypeLabel = (t, lang) => (lang === "en" && ALERT_TYPE_LABELS_EN[t]) ? ALERT_TYPE_LABELS_EN[t] : t;

const CITY_COLORS = ["#FF6600", "#00A854", "#0052CC", "#FF2A2A", "#FFCC00", "#00A854"];

const EN_LABELS = {
  book: "Book Now", rides: "My Rides", home: "Home", wallet: "Wallet", history: "History",
  kyc: "KYC", sos: "SOS", fleet: "Live Dashboard", drivers: "Drivers", settings: "Settings",
  finance: "Reports", notify: "Notify", alerts: "Alerts", customers: "Customers", expenses: "Expenses",
  callLogs: "Call Logs",
};
const MR_LABELS = {
  book: "आत्ता बुक करा", rides: "माझ्या राइड्स", home: "होम", wallet: "वॉलेट", history: "हिस्टरी",
  kyc: "KYC", sos: "SOS", fleet: "लाइव्ह डॅशबोर्ड", drivers: "ड्रायव्हर", settings: "सेटिंग्स",
  finance: "रिपोर्ट्स", notify: "सूचना पाठवा", alerts: "अलर्ट्स", customers: "कस्टमर", expenses: "खर्च",
  callLogs: "कॉल लॉग्स",
};

// Default business-expense categories for Admin's Expenses tab — admin can
// add more via "+ Add Category", stored in the expenseCategories collection
// and merged in, same custom-list pattern as materials/vehicleTypes.
const DEFAULT_EXPENSE_CATEGORIES = [
  { key: "server", icon: "🌐", hi: "सर्वर / डोमेन खर्च", en: "Server / Domain Expense", mr: "सर्व्हर / डोमेन खर्च" },
  { key: "ads", icon: "📢", hi: "गूगल एड्स व प्रचार", en: "Google Ads & Promotion", mr: "गूगल अ‍ॅड्स व प्रचार" },
  { key: "office", icon: "☕", hi: "ऑफिस व चाय पानी", en: "Office & Refreshments", mr: "ऑफिस व चहापाणी" },
  { key: "fuel", icon: "⛽", hi: "फ्यूल व मेंटेनेंस", en: "Fuel & Maintenance", mr: "फ्युएल व मेंटेनन्स" },
  { key: "other", icon: "📦", hi: "अन्य खर्चे", en: "Other Expenses", mr: "इतर खर्च" },
];

function genId(p = "TS") { return p + "-" + Math.floor(10000 + Math.random() * 89999); }
function hashPos(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 997;
  return { x: 15 + (h % 70), y: 15 + ((h * 7) % 70) };
}
function fmt(n) { return "₹" + Math.round(n).toLocaleString("en-IN"); }
function stars(n) { return "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n)); }

// A booking counts as a still-pending "advance" booking only while its
// scheduled date is genuinely in the future — once that date arrives, it
// should behave like any other active/ongoing booking. scheduledFor is
// stored as "YYYY-MM-DD HH:MM", so a plain string comparison on the date
// part is enough (no timezone math needed, same as isToday elsewhere).
function isFutureAdvance(scheduledFor) {
  if (!scheduledFor) return false;
  const datePart = scheduledFor.split(" ")[0];
  const today = new Date().toISOString().slice(0, 10);
  return datePart > today;
}

function parseScheduledFor(scheduledFor) {
  const [datePart, timePart] = scheduledFor.split(" ");
  return new Date(`${datePart}T${timePart}:00`);
}

// Heavier loads need more lead time for a driver to actually be arranged —
// enforced on Advance booking so a customer can't schedule, say, an 8-ton
// load for 30 minutes from now.
function minAdvanceNoticeHours(weightKg) {
  if (weightKg > 8000) return 3;
  if (weightKg >= 3000) return 2;
  return 1;
}

// A driver with an upcoming Advance booking stops getting pinged for new
// Current (immediate) loads — and can't have a new bid accepted for one —
// starting this many hours before that booking's scheduled time. Bigger
// vehicles get a longer protection window since they need more prep/travel
// time before heading out. Keyed off the driver's own vehicle capacity.
// 1-3 ton -> 1hr, 4-8 ton -> 2hr, 9-16 ton -> 3hr, >16 ton -> 4hr.
function notificationLockHours(vehicleCapacityKg) {
  if (vehicleCapacityKg > 16000) return 4;
  if (vehicleCapacityKg > 8000) return 3;
  if (vehicleCapacityKg >= 3000) return 2;
  return 1;
}

// The real-world time window a driver is committed to once a bid is
// accepted: starts at the scheduled time (advance) or the moment of
// acceptance (immediate, via acceptedAt — falls back to createdAt for
// older bookings from before that field existed), and runs for the
// allotted hours. Used to stop a driver being double-booked into two
// overlapping commitments (see acceptBid).
function getBookingWindow(b) {
  if (!b.hours) return null;
  let start;
  if (b.scheduledFor) start = parseScheduledFor(b.scheduledFor);
  else if (b.acceptedAt?.toMillis) start = new Date(b.acceptedAt.toMillis());
  else if (b.createdAt?.toMillis) start = new Date(b.createdAt.toMillis());
  else return null;
  return { start, end: new Date(start.getTime() + b.hours * 60 * 60 * 1000) };
}

// The single source of truth for "can this driver take this load" — used at
// three points: hiding a load from a driver's list before they ever see it,
// blocking the Send Quote button if they try anyway, and blocking Accept if
// a customer somehow still selects a conflicting bid. A driver already
// committed to another Ongoing booking (current trip in progress, or an
// upcoming Advance booking) cannot bid on / be assigned anything whose time
// falls inside that commitment's window PLUS the vehicle-tonnage buffer
// ahead of it (notificationLockHours) — e.g. a 10 AM advance booking with a
// 2-hour buffer and 4 allotted hours blocks everything from 8 AM to 2 PM.
// `candidate.hours` is optional — omitted while just deciding whether to
// show a load (duration isn't chosen yet), included once a bid amount/hours
// has actually been entered so a full overlap (not just a start-time check)
// can be tested.
function findDriverLoadConflict(driver, candidate, bookings, vehicleTypes, lang) {
  if (!driver) return null;
  const driverVehicleDef = vehicleTypes.find((v) => v.key === driver.vehicleSpec?.type);
  const lockHours = notificationLockHours(driverVehicleDef?.capacityKg || 0);
  const newStart = candidate.scheduledFor ? parseScheduledFor(candidate.scheduledFor) : new Date();
  const newEnd = candidate.hours ? new Date(newStart.getTime() + candidate.hours * 60 * 60 * 1000) : newStart;
  const myCommitments = bookings.filter((b) => b.status === "Ongoing" && b.driverName === driver.name && b.id !== candidate.id);
  for (const existing of myCommitments) {
    const win = getBookingWindow(existing);
    if (!win) continue;
    const lockStart = new Date(win.start.getTime() - lockHours * 60 * 60 * 1000);
    if (newStart < win.end && newEnd >= lockStart) {
      const fmtTime = (d) => d.toLocaleString(lang === "en" ? "en-IN" : lang === "mr" ? "mr-IN" : "hi-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      return lang === "en"
        ? `⚠️ You already have a ride booked from ${fmtTime(win.start)} to ${fmtTime(win.end)} (incl. ${lockHours}hr buffer) — you cannot bid on or take this load.`
        : lang === "mr"
        ? `⚠️ तुमची आधीच ${fmtTime(win.start)} पासून ${fmtTime(win.end)} पर्यंत (${lockHours} तासांच्या बफरसह) एक राइड बुक आहे — तुम्ही या लोडवर बोली लावू शकत नाही किंवा हा लोड घेऊ शकत नाही.`
        : `⚠️ आपकी पहले से ${fmtTime(win.start)} से ${fmtTime(win.end)} तक (${lockHours} घंटे के बफर सहित) एक राइड बुक है — आप इस लोड पर बोली नहीं लगा सकते या इसे नहीं ले सकते।`;
    }
  }
  return null;
}

function pad2(n) { return String(n).padStart(2, "0"); }

function to12Hour(hours, minutes) {
  const period = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 || 12;
  return `${pad2(h12)}:${pad2(minutes)} ${period}`;
}

// Renders a booking's date/time in DD:MM:YYYY HH:MM AM/PM — for an advance
// booking that's the scheduled date/time itself; for an immediate ride
// (no scheduledFor) it's when the ride was actually posted.
function rideDateTimeLabel(booking) {
  if (booking.scheduledFor) {
    const [datePart, timePart] = booking.scheduledFor.split(" ");
    const [y, m, d] = datePart.split("-");
    let timeLabel = "";
    if (timePart) {
      const [hh, mm] = timePart.split(":").map(Number);
      timeLabel = " " + to12Hour(hh, mm);
    }
    return `${d}:${m}:${y}${timeLabel}`;
  }
  const d = booking.createdAt?.toDate ? booking.createdAt.toDate() : null;
  if (!d) return "";
  return `${pad2(d.getDate())}:${pad2(d.getMonth() + 1)}:${d.getFullYear()} ${to12Hour(d.getHours(), d.getMinutes())}`;
}

// Time-of-day greeting shown at the top of the Customer/Driver/Admin home
// screens — computed fresh on every render, so it naturally flips from
// Morning to Afternoon to Evening as the session stays open across the day.
function greetingWord(lang) {
  const hour = new Date().getHours();
  if (lang === "en") return hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  return hour < 12 ? "सुप्रभात" : hour < 17 ? "शुभ दोपहर" : "शुभ संध्या";
}

const AREAS = ["पिंपरी", "चिंचवड", "निगड़ी", "आकुर्डी", "भोसरी", "वाकड़", "तळवडे", "रावेत", "MG रोड", "MR-10", "काळेवाडी", "पिंपळे सौदागर", "थेरगाव", "चिखली", "मोशी", "भोसरी MIDC"];
function suggestAreas(text) {
  if (!text.trim()) return [];
  return AREAS.filter((a) => a.toLowerCase().includes(text.trim().toLowerCase())).slice(0, 4);
}
// Great-circle ("as the crow flies") distance between two coordinates, in km.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Loading/unloading time (the allowed-hours/waiting-charge clock) must only
// count time actually spent at the pickup or drop point, never the drive
// between them — see the geofence pause/resume logic in DriverHome's GPS
// watcher and useTripClock below. Deliberately not surfaced to either side
// as a distance/GPS concept — drivers and customers just see the existing
// timer pause with a plain note, never the radius or the mechanism.
// Straight-line (haversineKm), not road distance — free, instant, computed
// entirely from coordinates already on the device/booking, no API call.
const LOADING_GEOFENCE_M = 100;

// For a current (non-advance) booking, only drivers within this straight-line
// radius of the pickup point can see/bid on the load — keeps bids realistic
// for jobs that need a truck right away. Advance bookings aren't restricted
// since the driver has time to travel to the pickup point before the slot.
const BID_RADIUS_KM = 100;

// Roads aren't a straight line, so straight-line distance is scaled up by a
// fixed factor as a stand-in for real road distance — typical for Indian
// urban/semi-urban road networks. Good enough until this gets replaced by a
// real routed distance from Google's Distance Matrix API.
const ROAD_DISTANCE_FACTOR = 1.35;

// Straight-line estimate scaled up for roads — requires real GPS
// coordinates for both ends. Returns null (not a guess) when either
// coordinate is missing, since a distance that isn't actually derived from
// real locations is worse than showing nothing — it used to fall back to a
// text-hash of the two address strings, which could land anywhere from
// 2-18km regardless of the real distance (e.g. showing "6 km" for an
// address pair that's actually 144 km apart).
function estimateDistanceKm(pickupCoords, dropCoords) {
  if (pickupCoords?.lat == null || pickupCoords?.lng == null || dropCoords?.lat == null || dropCoords?.lng == null) return null;
  const straightLineKm = haversineKm(pickupCoords.lat, pickupCoords.lng, dropCoords.lat, dropCoords.lng);
  return Math.max(1, Math.round(straightLineKm * ROAD_DISTANCE_FACTOR));
}

// Resolves free-typed address text to coordinates via Google's Geocoder —
// used when the customer types Pickup/Drop by hand without ever tapping an
// Autocomplete suggestion, so pickupCoords/dropCoords (and therefore the
// distance estimate and the booking's saved lat/lng) don't stay empty just
// because they didn't pick from the dropdown.
function geocodeAddress(text) {
  return new Promise((resolve) => {
    if (!window.google?.maps?.Geocoder || !text?.trim()) { resolve(null); return; }
    new window.google.maps.Geocoder().geocode(
      { address: text, componentRestrictions: { country: "in" } },
      (results, status) => {
        const loc = status === "OK" && results?.[0]?.geometry?.location;
        resolve(loc ? { lat: loc.lat(), lng: loc.lng() } : null);
      }
    );
  });
}

// Google's Geocoder/Places can return a Plus Code (e.g. "JQ38+PRM, Wakad,
// Pimpri-Chinchwad") as part of an address for areas without a formal
// street address — not something a customer/driver can read as a place
// name, so it's stripped from every address string before it's shown or
// stored (suggestion dropdown, reverse-geocode, current-location results).
//
// Previously this app also transliterated place names into the app's
// current script (e.g. spelling an English name out phonetically in
// Devanagari) whenever Google had no native name in that script on file.
// That produced exactly this kind of broken/unusual text, since it's a
// syllable-by-syllable guess, not a real translation — removed in favor of
// just showing Google's own text as-is (already in the right language most
// of the time, thanks to the `language` param the Maps script loads with —
// see googleMapsContext.jsx).
function stripPlusCode(text) {
  if (!text) return text;
  return text
    .replace(/\b[A-Z0-9]{4,8}\+[A-Z0-9]{2,3}\b,?\s*/gi, "")
    .replace(/^,\s*/, "")
    .replace(/,\s*,/g, ",")
    .trim();
}

// Real routed driving distance from Google's Distance Matrix Service (part
// of the core Maps JavaScript API — no extra `libraries` entry needed,
// unlike Places). Resolves in km, or rejects if Maps isn't loaded, the
// request fails, or no route is found — callers should keep whatever
// straight-line estimate they already showed as the fallback.
function fetchRoadDistanceKm(pickupCoords, dropCoords) {
  return new Promise((resolve, reject) => {
    if (!window.google?.maps?.DistanceMatrixService) { reject(new Error("Distance Matrix not loaded")); return; }
    const service = new window.google.maps.DistanceMatrixService();
    service.getDistanceMatrix(
      {
        origins: [pickupCoords],
        destinations: [dropCoords],
        travelMode: window.google.maps.TravelMode.DRIVING,
        unitSystem: window.google.maps.UnitSystem.METRIC,
      },
      (response, status) => {
        if (status !== "OK") { reject(new Error(status)); return; }
        const el = response?.rows?.[0]?.elements?.[0];
        if (!el || el.status !== "OK") { reject(new Error(el?.status || "no result")); return; }
        resolve(el.distance.value / 1000);
      }
    );
  });
}

// Persists a piece of state to localStorage under `key`, so the app
// remembers role choice, bookings, wallet balances etc. across reloads.
function usePersistedState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : initialValue;
    } catch {
      return initialValue;
    }
  });
  useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  }, [key, value]);
  return [value, setValue];
}

// Like usePersistedState, but for {name, url} photo values specifically —
// skips writing to localStorage when `url` is a base64 data: URI (the
// fallback uploadPhoto uses when Firebase Storage isn't reachable/
// configured). Those can be large enough on their own, let alone four of
// them on one KYC form, to blow past localStorage's ~5-10MB per-origin
// quota; once that's hit, the browser silently drops the write instead of
// throwing somewhere visible, which is what made photos vanish on refresh.
// A real Storage download URL is just a short link, so it always persists
// fine — this only affects the degraded fallback path.
function usePersistedPhoto(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : initialValue;
    } catch {
      return initialValue;
    }
  });
  useEffect(() => {
    if (value?.url?.startsWith("data:")) return;
    try {
      if (value) window.localStorage.setItem(key, JSON.stringify(value));
      else window.localStorage.removeItem(key);
    } catch { /* storage unavailable or quota exceeded */ }
  }, [key, value]);
  return [value, setValue];
}

// Animates a displayed number smoothly toward `value` whenever it changes
// (e.g. a wallet balance after a commission deduction or recharge), instead
// of the digits snapping instantly — a single requestAnimationFrame loop,
// cheap enough for a budget phone, that re-targets itself if `value` changes
// again mid-animation instead of queuing/jumping.
function useCountUp(value, duration = 700) {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);
  const rafRef = useRef(null);
  useEffect(() => {
    if (value === displayRef.current) return;
    const from = displayRef.current;
    const to = value;
    const start = performance.now();
    cancelAnimationFrame(rafRef.current);
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (to - from) * eased;
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);
  return display;
}

// Smoothly glides a lat/lng marker toward a new GPS fix instead of snapping
// straight to it — live tracking otherwise looks choppy since real GPS
// updates only land every few seconds. Re-targets mid-flight the same way
// useCountUp does; returns `target` unchanged (no animation) whenever it's
// null or this is the very first position received, so the marker still
// appears immediately rather than gliding in from nowhere.
function useSmoothPosition(target, duration = 1200) {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);
  const rafRef = useRef(null);
  useEffect(() => {
    if (!target) { displayRef.current = null; setDisplay(null); return; }
    const from = displayRef.current;
    if (!from) { displayRef.current = target; setDisplay(target); return; }
    if (from.lat === target.lat && from.lng === target.lng) return;
    const start = performance.now();
    cancelAnimationFrame(rafRef.current);
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = { lat: from.lat + (target.lat - from.lat) * eased, lng: from.lng + (target.lng - from.lng) * eased };
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.lat, target?.lng, duration]);
  return display;
}

// FLIP-animates a reordered list (First-Last-Invert-Play): whenever the
// order of `itemIds` changes, each item that moved is nudged back to its
// previous on-screen spot with a transform and then transitioned to 0, so
// the reorder reads as a smooth slide instead of an instant snap. Items are
// located by `data-flip-id` inside `containerRef` — no measuring library,
// just getBoundingClientRect, and it does nothing at all unless the order
// actually changed.
function useFlipListAnimation(containerRef, itemIds) {
  const prevRectsRef = useRef(new Map());
  const idsKey = itemIds.join(",");
  useEffect(() => {
    const container = containerRef.current;
    const prevRects = prevRectsRef.current;
    if (container && prevRects.size > 0) {
      itemIds.forEach((id) => {
        const el = container.querySelector(`[data-flip-id="${id}"]`);
        if (!el) return;
        const prev = prevRects.get(id);
        const next = el.getBoundingClientRect();
        if (!prev) return;
        const dy = prev.top - next.top;
        if (Math.abs(dy) < 1) return;
        el.style.transition = "none";
        el.style.transform = `translateY(${dy}px)`;
        // Force layout so the browser registers the starting transform
        // before the transition below is applied, otherwise it never animates.
        // eslint-disable-next-line no-unused-expressions
        el.getBoundingClientRect();
        el.style.transition = "transform 0.28s ease";
        el.style.transform = "";
      });
    }
    const newRects = new Map();
    if (container) {
      itemIds.forEach((id) => {
        const el = container.querySelector(`[data-flip-id="${id}"]`);
        if (el) newRects.set(id, el.getBoundingClientRect());
      });
    }
    prevRectsRef.current = newRects;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);
}

function playBeepTone() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 300].forEach((delay) => {
      setTimeout(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 880; gain.gain.value = 0.15;
        osc.start(); osc.stop(ctx.currentTime + 0.2);
      }, delay);
    });
  } catch { /* audio not available */ }
}

// Wires up real push notifications for ride events (bid accepted, trip
// completed, new bid) — collectionName/docId is where the FCM device token
// gets saved ("customers"/mobile or "drivers"/mobile) so the Cloud Function
// in functions/index.js knows who to push to. Silently re-issues a token on
// every load if permission was already granted in an earlier session, so it
// stays fresh without asking again; `enable()` is what the banner's button
// calls to trigger the actual browser permission prompt on first use.
function useRideNotifications(collectionName, docId, lang) {
  const [permission, setPermission] = useState(() => (typeof Notification !== "undefined" ? Notification.permission : "unsupported"));
  const [toast, setToast] = useState(null);

  const enable = async () => {
    const result = await requestPushToken();
    if (result.ok && docId) {
      patchDoc(collectionName, docId, { fcmToken: result.token }).catch((e) => console.error("[push token]", e));
      setPermission("granted");
    } else {
      setPermission(result.reason === "unsupported" ? "unsupported" : (typeof Notification !== "undefined" ? Notification.permission : "unsupported"));
    }
  };

  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted" || !docId) return;
    requestPushToken().then((result) => {
      if (result.ok) patchDoc(collectionName, docId, { fcmToken: result.token }).catch((e) => console.error("[push token]", e));
    });
    let unsub;
    listenForegroundPush((payload) => {
      playBeepTone();
      setToast(payload.notification || null);
      setTimeout(() => setToast(null), 5000);
    }).then((fn) => { unsub = fn; });
    return () => unsub?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, docId]);

  return { permission, enable, toast };
}

// Tracks which Admin Announcements this specific customer/driver hasn't
// seen yet — "seen" persists locally (per role+mobile) as the newest
// createdAt millis they've been shown, so it survives app restarts and
// naturally covers every announcement sent before this device ever existed
// (nothing to catch up on) as well as ones sent while it was closed. Pairs
// with AnnouncementAlertBanner (auto-popup) and a hamburger-menu badge —
// either one calling markSeen() clears both at once, since they're the same
// underlying "have you seen the latest one" state.
function useAnnouncementAlerts(adminNotifications, myMobile, toRole) {
  const mine = myMobile
    ? (adminNotifications || []).filter((n) => n.toRole === toRole && (n.target === "all" || n.target === myMobile || (Array.isArray(n.target) && n.target.includes(myMobile))))
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
    : [];
  const [lastSeenAt, setLastSeenAt] = usePersistedState(`sarthi_announcementsLastSeen_${toRole}_${myMobile || "none"}`, 0);
  const unread = mine.filter((n) => (n.createdAt?.toMillis?.() || 0) > lastSeenAt);
  const markSeen = () => {
    const newest = mine[0]?.createdAt?.toMillis?.() || Date.now();
    if (newest > lastSeenAt) setLastSeenAt(newest);
  };
  return { unreadCount: unread.length, latestUnread: unread[0] || null, markSeen };
}

function NotificationBanner({ permission, onEnable, lang }) {
  if (permission === "granted" || permission === "unsupported") return null;
  if (permission === "denied") {
    return (
      <div className="mx-5 mb-2 rounded-lg p-2.5 text-[11px] font-semibold" style={{ background: C.safety, color: "#FFFFFF" }}>
        {lang === "en" ? "Notifications are blocked in your browser settings — enable them there to get ride updates." : lang === "mr" ? "तुमच्या ब्राउझरमध्ये नोटिफिकेशन बंद आहेत — राइड अपडेट मिळवण्यासाठी तिथे चालू करा." : "आपके ब्राउज़र में नोटिफिकेशन बंद हैं — राइड अपडेट पाने के लिए वहां चालू करें।"}
      </div>
    );
  }
  return (
    <button onClick={onEnable} className="mx-5 mb-2 rounded-lg p-3.5 flex items-center gap-2 shadow-lg" style={{ background: C.metallicGold }}>
      <Bell size={14} color={C.marigoldDeep} />
      <span className="text-[11px] font-semibold" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Turn on notifications for ride updates" : lang === "mr" ? "राइड अपडेटसाठी नोटिफिकेशन चालू करा" : "राइड अपडेट के लिए नोटिफिकेशन चालू करें"}</span>
    </button>
  );
}

// Post-signup language picker — shown once, right after a brand-new
// Customer/Driver signup completes (see the langPromptPending gate in
// AppRoot). Everything up through signup itself stays in Hindi; a
// returning/login user never sees this. Once picked it's persisted and
// applied everywhere; there is no in-app toggle to change it afterwards.
function LanguageSelect({ onSelect }) {
  const options = [
    { code: "en", label: "English", sub: "Continue in English" },
    { code: "hi", label: "हिंदी", sub: "हिंदी में जारी रखें" },
    { code: "mr", label: "मराठी", sub: "मराठीत सुरू ठेवा" },
  ];
  return (
    <div className="flex-1 overflow-y-auto flex flex-col items-center px-6 py-10">
      <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: "#EAF1FF" }}>
        <Languages size={30} color={C.navy} />
      </div>
      <p className="text-lg font-black text-center mb-1" style={{ color: C.ink }}>Select your language</p>
      <p className="text-sm font-semibold text-center mb-7" style={{ color: C.inkSoft }}>भाषा चुनें · भाषा निवडा</p>
      <div className="w-full max-w-xs flex flex-col gap-3">
        {options.map((o) => (
          <button key={o.code} onClick={() => onSelect(o.code)} className="w-full rounded-2xl p-4 flex flex-col items-center text-center" style={{ background: "#FFFFFF", border: `2px solid ${C.navy}` }}>
            <div className="text-lg font-black mb-0.5" style={{ color: C.ink }}>{o.label}</div>
            <div className="text-xs font-semibold" style={{ color: C.inkSoft }}>{o.sub}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// One-shot celebratory overlay for the single most emotionally significant
// moment in the app — a bid getting accepted (customer books a vehicle, or a
// driver's quote wins the load). Self-dismissing (no button, nothing to
// tap away), non-blocking (pointer-events: none, so it never delays the
// customer/driver from acting on what's now on screen underneath it), and
// pure CSS animation — no JS animation loop, just the toast-pop keyframe
// already used elsewhere plus one extra pulse ring, so it costs nothing on
// a slow phone. Callers own the `show` boolean and should clear it after
// ~1.4s (matches the animation's own duration).
function SuccessBurst({ show, text, lang }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center" style={{ pointerEvents: "none" }}>
      <div className="toast-pop flex flex-col items-center gap-2">
        <div className="success-burst-ring rounded-full flex items-center justify-center" style={{ width: 84, height: 84, background: C.success }}>
          <CheckCircle2 size={44} color="#FFFFFF" strokeWidth={2.5} />
        </div>
        {text && (
          <div className="rounded-full px-4 py-1.5 shadow-lg text-sm font-black" style={{ background: C.ink, color: "#FFFFFF" }}>{text}</div>
        )}
      </div>
    </div>
  );
}

// Badge + callout shown on the hamburger button right after a quote gets
// accepted (Customer: the moment they tap Accept; Driver: the moment one of
// their bids gets accepted) — see AppRoot's showBookingHint state. The badge
// dot alone would be easy to miss the first time, so a "View your Booking
// here" callout points at it too; both stay up until the menu is actually
// opened. Must sit inside a `relative` wrapper around the hamburger button.
function HamburgerHint({ show, lang }) {
  if (!show) return null;
  return (
    <>
      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-white shadow-sm" style={{ background: C.safety }}>1</span>
      <div className="absolute top-11 left-0 z-40 rounded-lg px-3 py-2 shadow-lg text-xs font-bold whitespace-nowrap" style={{ background: C.ink, color: "#FFFFFF" }}>
        {lang === "en" ? "View your Advance Booking here" : lang === "mr" ? "तुमची अ‍ॅडव्हान्स बुकिंग इथे पहा" : "अपनी एडवांस बुकिंग यहां देखें"}
        <div className="absolute -top-1 left-4 w-2 h-2 rotate-45" style={{ background: C.ink }} />
      </div>
    </>
  );
}

// Standalone hamburger button + HamburgerHint, floated over whatever screen
// is currently showing. Needed because the app's real hamburger button is
// deliberately hidden the instant there's an active booking/trip (replaced
// by the trip view itself) — exactly the moment this hint needs to appear,
// so there's no real hamburger to attach the badge to. Callers pass
// show={showBookingHint && <real hamburger isn't currently visible>} so
// this and the real HamburgerHint never both show at once.
function FloatingHamburgerHint({ show, onOpenMenu, lang }) {
  if (!show) return null;
  return (
    <div className="fixed top-3 left-5 z-50">
      <button onClick={onOpenMenu} className="w-9 h-9 rounded-full flex items-center justify-center shadow-lg" style={{ background: "#0052CC", border: "1.5px solid #0052CC" }}>
        <Menu size={18} color="#fff" strokeWidth={2.5} />
      </button>
      <HamburgerHint show={show} lang={lang} />
    </div>
  );
}

// Auto-popup for a new, not-yet-seen Admin Announcement — shown on whatever
// screen the customer/driver happens to open the app to, instead of relying
// on them to notice the hamburger badge and go find it under Messages
// themselves. Either button clears it (see useAnnouncementAlerts.markSeen):
// "View" also opens the full inbox, "dismiss" just acknowledges it in place
// since the message text is already fully readable right here.
function AnnouncementAlertBanner({ announcement, onView, onDismiss, lang }) {
  if (!announcement) return null;
  return (
    <div className="mx-5 mb-2 rounded-lg p-3 shadow-lg" style={{ background: C.navy, border: `1.5px solid ${C.marigold}` }}>
      <div className="flex items-start gap-2">
        <Bell size={16} color={C.marigold} className="shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold text-white mb-0.5">📢 {lang === "en" ? "New message from Admin" : lang === "mr" ? "अ‍ॅडमिनकडून नवीन संदेश" : "एडमिन से नया संदेश"}</div>
          <div className="text-xs" style={{ color: "#FFFFFF" }}>{announcement.message}</div>
        </div>
        <button onClick={onDismiss} className="shrink-0" style={{ color: "#FFFFFF", opacity: 0.75 }}><X size={16} /></button>
      </div>
      <button onClick={onView} className="w-full mt-2 rounded-lg py-2 text-xs font-bold" style={{ background: C.marigold, color: "#000000" }}>
        {lang === "en" ? "View" : lang === "mr" ? "पहा" : "देखें"}
      </button>
    </div>
  );
}

function ForegroundToast({ toast }) {
  if (!toast) return null;
  return (
    <div className="mx-5 mb-2 rounded-lg p-2.5 flex items-center gap-2" style={{ background: C.navy }}>
      <Bell size={14} color={C.marigold} />
      <div>
        <div className="text-[11px] font-bold text-white">{toast.title}</div>
        {toast.body && <div className="text-[10px]" style={{ color: "#FFFFFF" }}>{toast.body}</div>}
      </div>
    </div>
  );
}

// Driver/Customer "Admin Announcements" inbox (hamburger menu, both roles) —
// past and present broadcasts sent from AdminNotify (functions/index.js:
// sendAdminNotification), filtered to whatever was sent to "all" of this
// role or to this person specifically. Read-only; there's no reply/compose
// here, only what Admin has sent out.
function AnnouncementsInbox({ adminNotifications, myMobile, toRole, lang, onOpen }) {
  const mine = (adminNotifications || [])
    .filter((n) => n.toRole === toRole && (n.target === "all" || n.target === myMobile || (Array.isArray(n.target) && n.target.includes(myMobile))))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  // Opening this screen is itself "seeing" every announcement in it, same
  // as tapping the auto-popup banner's View button — clears the hamburger
  // badge whichever way the customer/driver actually got here.
  useEffect(() => { onOpen?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const formatTime = (createdAt) => (createdAt?.toDate ? createdAt.toDate().toLocaleString(lang === "en" ? "en-IN" : lang === "mr" ? "mr-IN" : "hi-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
  return (
    <div className="px-5 py-5">
      <h2 className="text-base font-bold mb-3 flex items-center gap-1.5" style={{ color: C.ink }}><Bell size={16} color={C.marigoldDeep} /> {lang === "en" ? "Admin Announcements" : lang === "mr" ? "अ‍ॅडमिन सूचना" : "एडमिन सूचनाएं"}</h2>
      {mine.length === 0 ? (
        <p className="text-sm text-center py-16" style={{ color: C.inkSoft }}>{lang === "en" ? "No announcements yet." : lang === "mr" ? "अजून कोणतीही सूचना नाही." : "अभी तक कोई सूचना नहीं।"}</p>
      ) : (
        <div className="space-y-2">
          {mine.map((n) => (
            <div key={n.id} className="rounded-lg p-3" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[11px] font-bold" style={{ color: C.marigoldDeep }}>📢 {lang === "en" ? "Admin" : lang === "mr" ? "अ‍ॅडमिन" : "एडमिन"}</span>
                <span className="text-[10px] shrink-0" style={{ color: C.inkSoft }}>{formatTime(n.createdAt)}</span>
              </div>
              <div className="text-sm" style={{ color: C.ink }}>{n.message}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_DAYS = 30;
// Each driver/customer gets their own 30-day trial from their own signup
// date (their doc's createdAt), not one shared platform-wide clock. A
// missing createdAt (still resolving right after signup, or a legacy doc
// from before this field existed) is treated as "in trial" — generous by
// default rather than accidentally charging someone commission early.
const isInTrial = (createdAt) => (createdAt?.toMillis ? (Date.now() - createdAt.toMillis()) < TRIAL_DAYS * DAY_MS : true);
// Whole days left in trial (0 on the last day, null once it's over or
// createdAt isn't known yet) — used only for the admin's Free Trial /
// Main Routine driver split and the "X days left" badge, purely derived
// from createdAt like isInTrial so it can never drift out of sync with
// the actual gating logic above.
const trialDaysLeft = (createdAt) => {
  if (!createdAt?.toMillis || !isInTrial(createdAt)) return null;
  const elapsedMs = Date.now() - createdAt.toMillis();
  return Math.max(0, Math.ceil((TRIAL_DAYS * DAY_MS - elapsedMs) / DAY_MS) - 1);
};

// ---------------- shared: mock map ----------------
function MockMap({ pickup, drop, progress, zoneColor, height = 150, lang = "hi" }) {
  const p1 = hashPos(pickup || "pickup");
  const p2 = drop ? hashPos(drop + "x") : null;
  const tx = p2 ? p1.x + (p2.x - p1.x) * (progress ?? 0) / 100 : p1.x;
  const ty = p2 ? p1.y + (p2.y - p1.y) * (progress ?? 0) / 100 : p1.y;
  // No real coordinates here (mock fallback), so hand off to Google Maps
  // using the address text instead — same "any gesture opens Maps" rule as
  // the real LiveTrackingMap.
  const openExternalMaps = () => {
    if (!pickup) return;
    const origin = encodeURIComponent(pickup);
    const destination = encodeURIComponent(drop || pickup);
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`, "_blank");
  };
  return (
    <div className="relative rounded-lg overflow-hidden" style={{ height, background: "#E5E5E5", border: `1px solid ${C.line}` }}>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        {Array.from({ length: 6 }).map((_, i) => (
          <line key={"h" + i} x1="0" y1={i * 18} x2="100" y2={i * 18} stroke="#CCCCCC" strokeWidth="0.4" />
        ))}
        {Array.from({ length: 6 }).map((_, i) => (
          <line key={"v" + i} x1={i * 18} y1="0" x2={i * 18} y2="100" stroke="#CCCCCC" strokeWidth="0.4" />
        ))}
        {p2 && <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={zoneColor || C.marigoldDeep} strokeWidth="1" strokeDasharray="2,2" />}
        <circle cx={p1.x} cy={p1.y} r="2.2" fill={C.marigoldDeep} />
        {p2 && <circle cx={p2.x} cy={p2.y} r="2.2" fill={C.safety} />}
        {p2 && progress !== undefined && (
          <circle cx={tx} cy={ty} r="2.6" fill={C.navy} stroke="#fff" strokeWidth="0.6" />
        )}
      </svg>
      <div className="absolute bottom-1.5 left-2 text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: C.paper, color: C.ink }}>
        📍 {lang === "en" ? "Pickup" : lang === "mr" ? "पिकअप" : "पिकअप"}
      </div>
      {p2 && (
        <div className="absolute top-1.5 right-2 text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: C.paper, color: C.ink }}>
          🏁 {lang === "en" ? "Drop" : lang === "mr" ? "ड्रॉप" : "ड्रॉप"}
        </div>
      )}
      <div onClick={openExternalMaps} className="absolute inset-0 cursor-pointer" role="button" aria-label="Open in Google Maps" />
      <div className="absolute bottom-1.5 right-2 text-xs font-black px-2.5 py-1 rounded-full shadow-lg pointer-events-none" style={{ background: "#FFCC00", color: "#000000" }}>
        {lang === "en" ? "Tap to open in Google Maps" : lang === "mr" ? "गूगल मॅप्समध्ये उघडण्यासाठी टॅप करा" : "गूगल मैप्स में खोलने के लिए टैप करें"}
      </div>
    </div>
  );
}

// Fetches an actual driving route (road-following polyline) between two
// points via the Directions API, instead of a straight line drawn point-
// to-point. Re-fetches when the destination changes, or when the origin
// has moved more than ~50m from the last fetch (GPS jitter/frequent small
// updates shouldn't each trigger a fresh Directions call) — a live-
// tracking origin (the driver) moves continuously, a static one (Pickup)
// never re-triggers on its own. Returns null until the first route lands,
// so callers should fall back to a straight line in the meantime.
function useDrivingRoute(origin, destination, isLoaded, hasKey) {
  const [path, setPath] = useState(null);
  const lastOriginRef = useRef(null);
  const lastDestRef = useRef(null);
  useEffect(() => {
    if (!isLoaded || !hasKey || !origin || !destination || !window.google?.maps) return;
    const originMoved = !lastOriginRef.current || haversineKm(lastOriginRef.current.lat, lastOriginRef.current.lng, origin.lat, origin.lng) > 0.05;
    const destMoved = !lastDestRef.current || lastDestRef.current.lat !== destination.lat || lastDestRef.current.lng !== destination.lng;
    if (!originMoved && !destMoved) return;
    let cancelled = false;
    new window.google.maps.DirectionsService().route(
      { origin, destination, travelMode: window.google.maps.TravelMode.DRIVING },
      (result, status) => {
        if (cancelled) return;
        lastOriginRef.current = origin;
        lastDestRef.current = destination;
        if (status === "OK" && result?.routes?.[0]) {
          setPath(result.routes[0].overview_path.map((p) => ({ lat: p.lat(), lng: p.lng() })));
        }
      }
    );
    return () => { cancelled = true; };
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, isLoaded, hasKey]);
  return path;
}

// Real Google Maps live-tracking view — pickup/drop pins at real coordinates
// plus the driver's live GPS marker, connected by the actual fastest driving
// route (not a straight line) via useDrivingRoute. Falls back to the fake
// MockMap when Google Maps isn't configured/loaded yet, or this booking has
// no real coordinates (e.g. it was posted before Maps was set up).
function LiveTrackingMap({ pickup, drop, pickupLat, pickupLng, dropLat, dropLng, driverLocation, customerLocation, progress, zoneColor, height = 150, lang = "hi", mode = "route" }) {
  const { isLoaded, hasKey } = useGoogleMaps();
  // "toPickup" mode (used before a driver has entered the OTP) draws only
  // the driver's live position and the Pickup pin, with the route line
  // between THEM instead of Pickup->Drop — Drop isn't relevant yet since
  // the driver hasn't picked up the load. Falls back to the normal
  // Pickup->Drop route once mode is "route" (the default, post-OTP).
  const toPickup = mode === "toPickup";
  const hasCoords = toPickup ? (pickupLat != null && pickupLng != null) : (pickupLat != null && pickupLng != null && dropLat != null && dropLng != null);
  const pickupPos = pickupLat != null && pickupLng != null ? { lat: pickupLat, lng: pickupLng } : null;
  const dropPos = dropLat != null && dropLng != null ? { lat: dropLat, lng: dropLng } : null;
  // Raw GPS fixes — used for the actual route request/bounds-fitting below,
  // which should only recompute on a genuine new fix, not on every
  // in-between animation frame. The marker itself renders the smoothed
  // (glided) version further down instead, via useSmoothPosition, so live
  // tracking doesn't look like it's teleporting between pings every few
  // seconds.
  const rawDriverPos = driverLocation?.lat != null && driverLocation?.lng != null ? { lat: driverLocation.lat, lng: driverLocation.lng } : null;
  const rawCustomerPos = customerLocation?.lat != null && customerLocation?.lng != null ? { lat: customerLocation.lat, lng: customerLocation.lng } : null;
  const driverPos = useSmoothPosition(rawDriverPos);
  const customerPos = useSmoothPosition(rawCustomerPos);
  const routeOrigin = toPickup ? rawDriverPos : pickupPos;
  const routeDestination = toPickup ? pickupPos : dropPos;
  const roadPath = useDrivingRoute(routeOrigin, routeDestination, isLoaded, hasKey);
  const [mapInstance, setMapInstance] = useState(null);
  useEffect(() => {
    if (!mapInstance || !window.google?.maps) return;
    const bounds = new window.google.maps.LatLngBounds();
    if (roadPath?.length) {
      roadPath.forEach((p) => bounds.extend(p));
    } else {
      if (routeOrigin) bounds.extend(routeOrigin);
      if (routeDestination) bounds.extend(routeDestination);
    }
    if (!toPickup && customerPos) bounds.extend(customerPos);
    if (!bounds.isEmpty()) mapInstance.fitBounds(bounds, 28);
  }, [mapInstance, roadPath, routeOrigin?.lat, routeOrigin?.lng, routeDestination?.lat, routeDestination?.lng]);

  // The embedded map is a preview, not something meant to be panned/zoomed
  // in place — tapping it hands off straight to the real Google Maps app/
  // site instead. Gestures are disabled on the GoogleMap itself (so it never
  // pans/zooms in place), and a transparent overlay listens for onClick —
  // deliberately not onPointerDown/onTouchStart, which also fire the instant
  // a finger lands mid-scroll (e.g. scrolling the page starting from a touch
  // over the map), causing Maps to open on what was actually just a scroll.
  // onClick only fires for a genuine tap, not a drag/scroll passing through.
  const openExternalMaps = () => {
    if (!routeOrigin || !routeDestination) return;
    const origin = `${routeOrigin.lat},${routeOrigin.lng}`;
    const destination = `${routeDestination.lat},${routeDestination.lng}`;
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`, "_blank");
  };

  if (!hasKey || !isLoaded || !hasCoords) {
    return <MockMap pickup={pickup} drop={toPickup ? null : drop} progress={toPickup ? undefined : progress} zoneColor={zoneColor} height={height} lang={lang} />;
  }
  return (
    <div className="relative rounded-lg overflow-hidden" style={{ height, border: `1px solid ${C.line}` }}>
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        onLoad={setMapInstance}
        options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false, zoomControl: false, gestureHandling: "none", disableDefaultUI: true, disableDoubleClickZoom: true, clickableIcons: false, keyboardShortcuts: false }}
      >
        <MarkerF position={pickupPos} label={{ text: "P", color: "#fff", fontSize: "10px", fontWeight: "bold" }} />
        {!toPickup && dropPos && <MarkerF position={dropPos} label={{ text: "D", color: "#fff", fontSize: "10px", fontWeight: "bold" }} />}
        {!toPickup && dropPos && <PolylineF path={roadPath || [pickupPos, dropPos]} options={{ strokeColor: zoneColor || C.marigoldDeep, strokeOpacity: 0.7, strokeWeight: 3 }} />}
        {toPickup && driverPos && <PolylineF path={roadPath || [driverPos, pickupPos]} options={{ strokeColor: zoneColor || C.marigoldDeep, strokeOpacity: 0.7, strokeWeight: 3 }} />}
        {driverPos && (
          <MarkerF
            position={driverPos}
            label={{ text: "🚚", fontSize: "14px" }}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 14,
              fillColor: C.navy,
              fillOpacity: 1,
              strokeColor: "#fff",
              strokeWeight: 2,
              labelOrigin: new window.google.maps.Point(0, 0),
            }}
          />
        )}
        {!toPickup && customerPos && (
          <MarkerF
            position={customerPos}
            label={{ text: "🧍", fontSize: "14px" }}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 14,
              fillColor: C.success,
              fillOpacity: 1,
              strokeColor: "#fff",
              strokeWeight: 2,
              labelOrigin: new window.google.maps.Point(0, 0),
            }}
          />
        )}
      </GoogleMap>
      <div onClick={openExternalMaps} className="absolute inset-0 cursor-pointer" role="button" aria-label="Open in Google Maps" />
      <div className="absolute bottom-1.5 right-2 text-xs font-black px-2.5 py-1 rounded-full shadow-lg pointer-events-none" style={{ background: "#FFCC00", color: "#000000" }}>
        {lang === "en" ? "Tap to open in Google Maps" : lang === "mr" ? "गूगल मॅप्समध्ये उघडण्यासाठी टॅप करा" : "गूगल मैप्स में खोलने के लिए टैप करें"}
      </div>
    </div>
  );
}

function BottomNav({ tabs, tab, setTab, lang = "hi" }) {
  return (
    <div className="flex border-t" style={{ borderColor: C.line, background: C.paper }}>
      {tabs.map(([key, label, Icon]) => (
        <button key={key} onClick={() => setTab(key)} className="flex-1 flex flex-col items-center gap-1 py-4">
          <Icon size={22} color={tab === key ? C.marigoldDeep : C.ink} />
          <span className="text-xs font-semibold" style={{ color: tab === key ? C.marigoldDeep : C.ink }}>{lang === "en" ? (EN_LABELS[key] || label) : lang === "mr" ? (MR_LABELS[key] || label) : label}</span>
        </button>
      ))}
    </div>
  );
}

// Free OpenStreetMap-based location picker — no API key needed.
// Uses a static map image (staticmap.openstreetmap.de) + Web Mercator math to
// convert taps into lat/lng, then reverse-geocodes via Nominatim (OSM, free).
function MapPicker({ onConfirm, onClose, lang = "hi" }) {
  const CENTER = { lat: 18.6298, lon: 73.8131 }; // Pimpri-Chinchwad / Pune area default
  const ZOOM = 11;
  const W = 380, H = 320;
  const [pin, setPin] = useState(null); // {x,y,lat,lon}
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [imgError, setImgError] = useState(false);

  const mapUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${CENTER.lat},${CENTER.lon}&zoom=${ZOOM}&size=${W}x${H}&maptype=mapnik`;

  const pixelToLatLon = (px, py) => {
    const scale = 256 * Math.pow(2, ZOOM);
    const centerX = ((CENTER.lon + 180) / 360) * scale;
    const latRad = (CENTER.lat * Math.PI) / 180;
    const centerY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale;
    const worldX = centerX + (px - W / 2);
    const worldY = centerY + (py - H / 2);
    const lon = (worldX / scale) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * worldY) / scale;
    const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
    return { lat, lon };
  };

  const handleTap = async (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { lat, lon } = pixelToLatLon(px, py);
    setPin({ x: px, y: py, lat, lon });
    setAddress("");
    setLoading(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=16`, {
        headers: { Accept: "application/json" },
      });
      const data = await res.json();
      setAddress(stripPlusCode(data?.display_name) || `${lat.toFixed(5)}, ${lon.toFixed(5)}`);
    } catch {
      setAddress(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(42,33,28,0.7)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-2xl p-4" style={{ background: C.bg }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold" style={{ color: C.ink }}>{lang === "en" ? "Tap to mark location" : lang === "mr" ? "जागा निवडण्यासाठी टॅप करा" : "जगह चुनने के लिए टैप करें"}</span>
          <button onClick={onClose} className="text-base font-bold px-3 py-2" style={{ color: C.inkSoft }}>✕</button>
        </div>

        <div className="relative rounded-lg overflow-hidden mb-3" style={{ height: H, background: "#E5E5E5", cursor: "crosshair" }} onClick={handleTap}>
          {!imgError ? (
            <img src={mapUrl} alt="map" width={W} height={H} className="w-full h-full object-cover select-none" draggable={false} onError={() => setImgError(true)} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-center px-6">
              <span className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Map couldn't load — check internet connection" : lang === "mr" ? "मॅप लोड झाला नाही — इंटरनेट कनेक्शन तपासा" : "मैप लोड नहीं हुआ — इंटरनेट कनेक्शन देखें"}</span>
            </div>
          )}
          {pin && (
            <div className="absolute" style={{ left: pin.x - 12, top: pin.y - 24, pointerEvents: "none" }}>
              <MapPin size={28} color={C.safety} fill={C.safety} />
            </div>
          )}
        </div>

        <div className="rounded-lg p-3 mb-3" style={{ background: C.paper, minHeight: 50 }}>
          {loading ? (
            <span className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Finding address..." : lang === "mr" ? "पत्ता शोधला जात आहे..." : "पता ढूंढा जा रहा है..."}</span>
          ) : pin ? (
            <span className="text-xs" style={{ color: C.ink }}>{address}</span>
          ) : (
            <span className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Tap anywhere on the map above to drop a pin" : lang === "mr" ? "वरील मॅपवर कुठेही टॅप करून पिन लावा" : "ऊपर मैप पर कहीं भी टैप करके पिन लगाएं"}</span>
          )}
        </div>

        <button onClick={() => pin && onConfirm(address, pin.lat, pin.lon)} disabled={!pin || loading}
          className="w-full rounded-lg py-4 font-bold text-base"
          style={{ background: pin && !loading ? C.marigoldDeep : "#E0E0E0", color: pin && !loading ? "#fff" : "#9AA3B0" }}>
          {lang === "en" ? "Use this location" : lang === "mr" ? "ही जागा वापरा" : "यह जगह इस्तेमाल करें"}
        </button>
      </div>
    </div>
  );
}

// Real Google Maps location picker — search box (Places Autocomplete) +
// tap/drag-to-place marker + reverse geocoding, returning real lat/lng.
function GoogleLocationPicker({ onConfirm, onClose, lang = "hi" }) {
  const CENTER = { lat: 18.6298, lng: 73.8131 }; // Pimpri-Chinchwad / Pune area default
  const [marker, setMarker] = useState(null); // {lat,lng}
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const mapRef = useRef(null);
  const autocompleteRef = useRef(null);
  const geocoderRef = useRef(null);

  const reverseGeocode = (lat, lng) => {
    setLoading(true);
    if (!geocoderRef.current) geocoderRef.current = new window.google.maps.Geocoder();
    geocoderRef.current.geocode({ location: { lat, lng } }, (results, status) => {
      setLoading(false);
      setAddress(status === "OK" && results?.[0] ? stripPlusCode(results[0].formatted_address) : `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    });
  };

  const placeMarker = (lat, lng) => {
    setMarker({ lat, lng });
    reverseGeocode(lat, lng);
  };

  const onPlaceChanged = () => {
    const place = autocompleteRef.current?.getPlace();
    const loc = place?.geometry?.location;
    if (!loc) return;
    const lat = loc.lat(), lng = loc.lng();
    setMarker({ lat, lng });
    setAddress(stripPlusCode(place.formatted_address || place.name || ""));
    setLoading(false);
    mapRef.current?.panTo({ lat, lng });
    mapRef.current?.setZoom(16);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      placeMarker(latitude, longitude);
      mapRef.current?.panTo({ lat: latitude, lng: longitude });
      mapRef.current?.setZoom(16);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(42,33,28,0.7)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-2xl p-4" style={{ background: C.bg }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold" style={{ color: C.ink }}>{lang === "en" ? "Search or tap to mark location" : lang === "mr" ? "जागा शोधा किंवा टॅप करून निवडा" : "जगह खोजें या टैप करके चुनें"}</span>
          <button onClick={onClose} className="text-base font-bold px-3 py-2" style={{ color: C.inkSoft }}>✕</button>
        </div>

        <Autocomplete onLoad={(a) => (autocompleteRef.current = a)} onPlaceChanged={onPlaceChanged}>
          <input
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none mb-2"
            style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.ink }}
            placeholder={lang === "en" ? "Search an address" : lang === "mr" ? "पत्ता शोधा" : "पता खोजें"}
          />
        </Autocomplete>

        <div className="relative rounded-lg overflow-hidden mb-3" style={{ height: 320, cursor: "crosshair" }}>
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "100%" }}
            center={marker || CENTER}
            zoom={marker ? 15 : 12}
            onClick={(e) => placeMarker(e.latLng.lat(), e.latLng.lng())}
            onLoad={(map) => (mapRef.current = map)}
            options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}
          >
            {marker && <MarkerF position={marker} draggable onDragEnd={(e) => placeMarker(e.latLng.lat(), e.latLng.lng())} />}
          </GoogleMap>
        </div>

        <button type="button" onClick={useMyLocation} className="text-base font-semibold mb-3 flex items-center gap-1" style={{ color: C.marigoldDeep }}>
          <Navigation size={12} /> {lang === "en" ? "Use my current location" : lang === "mr" ? "माझी सध्याची जागा वापरा" : "मेरी मौजूदा जगह इस्तेमाल करें"}
        </button>

        <div className="rounded-lg p-3 mb-3" style={{ background: C.paper, minHeight: 50 }}>
          {loading ? (
            <span className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Finding address..." : lang === "mr" ? "पत्ता शोधला जात आहे..." : "पता ढूंढा जा रहा है..."}</span>
          ) : marker ? (
            <span className="text-xs" style={{ color: C.ink }}>{address}</span>
          ) : (
            <span className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Search above or tap anywhere on the map to drop a pin" : lang === "mr" ? "वर शोधा किंवा मॅपवर कुठेही टॅप करून पिन लावा" : "ऊपर खोजें या मैप पर कहीं भी टैप करके पिन लगाएं"}</span>
          )}
        </div>

        <button onClick={() => marker && onConfirm(address, marker.lat, marker.lng)} disabled={!marker || loading}
          className="w-full rounded-lg py-4 font-bold text-base"
          style={{ background: marker && !loading ? C.marigoldDeep : "#E0E0E0", color: marker && !loading ? "#fff" : "#9AA3B0" }}>
          {lang === "en" ? "Use this location" : lang === "mr" ? "ही जागा वापरा" : "यह जगह इस्तेमाल करें"}
        </button>
      </div>
    </div>
  );
}

// Picks the real Google Maps picker when a Maps API key is configured and
// loaded; otherwise falls back to the free OSM-based picker so location
// picking still works before/without a Google Maps key.
function LocationPicker(props) {
  const { isLoaded, hasKey } = useGoogleMaps();
  if (hasKey && isLoaded) return <GoogleLocationPicker {...props} />;
  return <MapPicker {...props} />;
}

function MicButton({ onResult, lang = "hi", label, size = 8, iconSize = 14 }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  const start = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert(lang === "en" ? "This device/browser doesn't support voice input." : lang === "mr" ? "हे डिव्हाइस/ब्राउझर व्हॉइस इनपुट सपोर्ट करत नाही." : "यह डिवाइस/ब्राउज़र वॉइस इनपुट सपोर्ट नहीं करता।");
      return;
    }
    const rec = new SR();
    rec.lang = lang === "en" ? "en-IN" : lang === "mr" ? "mr-IN" : "hi-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const text = e.results?.[0]?.[0]?.transcript;
      if (text) onResult(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const stop = () => {
    recRef.current?.stop();
    setListening(false);
  };

  if (label) {
    return (
      <button type="button" onClick={listening ? stop : start}
        className="w-full flex items-center justify-center gap-1.5 rounded-xl py-5 text-base font-bold"
        style={{ background: listening ? C.safety : C.success, color: "#fff" }}>
        <Mic size={18} /> {label}
      </button>
    );
  }

  return (
    <button type="button" onClick={listening ? stop : start}
      className="shrink-0 rounded-full flex items-center justify-center"
      style={{ background: listening ? C.safety : C.paper, border: listening ? "none" : `1.5px solid ${C.marigoldDeep}`, width: size * 4, height: size * 4 }}>
      <Mic size={iconSize} color={listening ? "#fff" : C.marigoldDeep} />
    </button>
  );
}

// Calls the other party in a booking through Exotel's number-masking
// bridge (see initiateMaskedCall in firebaseClient.js / functions/index.js)
// instead of a plain tel: link that would show either side's real number
// to the other -- neither party's number is displayed here either, since
// printing it on screen would defeat the point even if the actual call is
// masked. Falls back to a normal tel: link to fallbackMobile if masking
// isn't configured yet or the bridge request fails for any reason --
// calling must never break, masking is a privacy layer on top of it, not
// a replacement for it working at all.
function MaskedCallButton({ bookingId, fallbackMobile, label, lang, className, style }) {
  const [calling, setCalling] = useState(false);
  const [connected, setConnected] = useState(false);
  const handleClick = async () => {
    if (calling) return;
    setCalling(true);
    const result = await initiateMaskedCall(bookingId);
    setCalling(false);
    if (result.ok) {
      setConnected(true);
      setTimeout(() => setConnected(false), 6000);
    } else if (fallbackMobile) {
      window.location.href = `tel:${fallbackMobile}`;
    }
  };
  return (
    <div>
      <button type="button" onClick={handleClick} disabled={calling} className={className} style={style}>
        <Phone size={16} color={style?.color || "#000000"} /> {calling ? (lang === "en" ? "Connecting..." : lang === "mr" ? "जोडत आहोत..." : "जोड़ रहे हैं...") : label}
      </button>
      {connected && (
        <div className="text-[10px] font-bold text-center mt-1" style={{ color: C.success }}>
          {lang === "en" ? "You'll receive a call shortly to connect you." : lang === "mr" ? "तुम्हाला लवकरच कॉल येईल जो तुम्हाला जोडेल." : "आपको जल्द ही कॉल आएगी जो आपको जोड़ देगी।"}
        </div>
      )}
    </div>
  );
}

function StarRating({ value, onRate }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} onClick={() => onRate(n)} className="text-xl leading-none" style={{ color: n <= (value || 0) ? C.marigold : C.line }}>★</button>
      ))}
    </div>
  );
}

const ADMIN_PHONE = "+917972399892";
const ADMIN_WHATSAPP = "917972399892";

function SosScreen({ role = "customer", raiseAlert, lang, tripLocked }) {
  const [complaint, setComplaint] = useState("");
  const [sent, setSent] = useState(false);
  const submitComplaint = () => {
    if (!complaint.trim()) return;
    raiseAlert?.(role, "शिकायत", complaint.trim());
    setComplaint("");
    setSent(true);
    setTimeout(() => setSent(false), 3000);
  };
  return (
    <div className="px-5 py-5">
      <div className="rounded-xl p-5 text-center mb-5" style={{ background: C.safety }}>
        <Siren size={26} color="#FFFFFF" className="mx-auto mb-2" />
        <h2 className="text-base font-bold" style={{ color: "#FFFFFF" }}>SOS / {lang === "en" ? "Help" : lang === "mr" ? "मदत" : "मदद"}</h2>
        <p className="text-xs mt-1" style={{ color: "#FFFFFF" }}>{lang === "en" ? "For any problem or booking help, click the button below." : lang === "mr" ? "कोणत्याही समस्येसाठी किंवा बुकिंग मदतीसाठी खालील बटणावर क्लिक करा." : "किसी भी समस्या या बुकिंग सहायता के लिए नीचे दिए गए बटन पर क्लिक करें।"}</p>
      </div>
      {tripLocked && (
        <div className="rounded-xl p-4 mb-5 text-center" style={{ background: C.safety }}>
          <div className="text-sm font-bold mb-1" style={{ color: "#FFFFFF" }}>⚠️ {lang === "en" ? "Trip cannot be cancelled!" : lang === "mr" ? "ट्रिप रद्द केली जाऊ शकत नाही!" : "ट्रिप कैंसल नहीं की जा सकती!"}</div>
          <p className="text-xs" style={{ color: "#FFFFFF" }}>{lang === "en" ? "The driver has verified the OTP and the goods are loaded/in transit. This trip will only end once the driver completes it (End Trip). Contact support below for any help." : lang === "mr" ? "ड्रायव्हरने ओटीपी (OTP) सत्यापित केला आहे आणि माल लोड/ट्रान्झिटमध्ये आहे. ही ट्रिप फक्त ड्रायव्हरने प्रवास पूर्ण (End Trip) केल्यावरच संपेल. कोणत्याही मदतीसाठी खाली सपोर्टशी संपर्क करा." : "ड्राइवर द्वारा ओटीपी (OTP) सत्यापित किया जा चुका है और माल लोड/ट्रांजिट में है। यह ट्रिप केवल ड्राइवर द्वारा यात्रा पूरी (End Trip) करने के बाद ही समाप्त होगी। किसी भी सहायता के लिए नीचे सपोर्ट से संपर्क करें।"}</p>
        </div>
      )}
      <div className="space-y-3">
        <a href="tel:100" onClick={() => raiseAlert?.(role, "पुलिस सहायता")}
          className="w-full rounded-lg py-3 font-bold text-sm flex items-center justify-center gap-2 text-white" style={{ background: "#000000" }}>
          <Siren size={16} /> {lang === "en" ? "Police Help (100)" : lang === "mr" ? "पोलीस मदत (100)" : "पुलिस सहायता (100)"}
        </a>
        <a href={`tel:${ADMIN_PHONE}`} onClick={() => raiseAlert?.(role, "इमरजेंसी कॉल")}
          className="w-full rounded-lg py-3 font-bold text-sm flex items-center justify-center gap-2 text-white" style={{ background: C.safety }}>
          <Phone size={16} /> {lang === "en" ? "Call Admin" : lang === "mr" ? "अ‍ॅडमिनला कॉल करा" : "एडमिन को कॉल करें"}
        </a>
        <a href={`https://wa.me/${ADMIN_WHATSAPP}`} target="_blank" rel="noreferrer" onClick={() => raiseAlert?.(role, "व्हाट्सएप सपोर्ट")}
          className="w-full rounded-lg py-3 font-bold text-sm flex items-center justify-center gap-2 text-white shadow-lg" style={{ background: C.metallicGreen }}>
          <MessageCircle size={16} /> {lang === "en" ? "WhatsApp Support" : lang === "mr" ? "व्हॉट्सअ‍ॅप सपोर्ट" : "व्हाट्सएप सपोर्ट"}
        </a>
      </div>
      <div className="rounded-xl p-4 mt-5 shadow-sm" style={{ border: `1px solid ${C.line}`, background: C.paper }}>
        <div className="text-xs font-bold mb-2" style={{ color: C.ink }}>{lang === "en" ? "File a Complaint" : lang === "mr" ? "तक्रार नोंदवा" : "शिकायत दर्ज करें"}</div>
        <p className="text-[11px] mb-2" style={{ color: C.inkSoft }}>
          {role === "driver"
            ? (lang === "en" ? "Send admin details of any issue related to the customer or the goods." : lang === "mr" ? "ग्राहक किंवा सामानाशी संबंधित कोणत्याही समस्येची माहिती अ‍ॅडमिनला पाठवा." : "ग्राहक या सामान से जुड़ी किसी समस्या की जानकारी एडमिन को भेजें।")
            : (lang === "en" ? "Send admin details of any issue related to the driver or your booking." : lang === "mr" ? "ड्रायव्हर किंवा तुमच्या बुकिंगशी संबंधित कोणत्याही समस्येची माहिती अ‍ॅडमिनला पाठवा." : "ड्राइवर या आपकी बुकिंग से जुड़ी किसी समस्या की जानकारी एडमिन को भेजें।")}
        </p>
        <textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} rows={3}
          placeholder={role === "driver"
            ? (lang === "en" ? "e.g. Customer gave wrong address, wrong weight told..." : lang === "mr" ? "उदा: ग्राहकाने चुकीचा पत्ता दिला, सामानाचे वजन चुकीचे सांगितले..." : "जैसे: ग्राहक ने गलत पता दिया, सामान का वजन गलत बताया...")
            : (lang === "en" ? "e.g. Driver asked for extra money, vehicle was different than promised..." : lang === "mr" ? "उदा: ड्रायव्हरने जास्त पैसे मागितले, गाडी वचनापेक्षा वेगळी होती..." : "जैसे: ड्राइवर ने अतिरिक्त पैसे मांगे, गाड़ी वादे से अलग थी...")}
          className="w-full rounded-lg px-3 py-2 text-xs outline-none mb-2" style={{ border: `1px solid ${C.line}`, color: C.ink }} />
        {sent && <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold" style={{ color: C.success }}><CheckCircle2 size={13} /> {lang === "en" ? "Complaint sent to admin" : lang === "mr" ? "तक्रार अ‍ॅडमिनला पाठवली गेली" : "शिकायत एडमिन को भेज दी गई"}</div>}
        <button onClick={submitComplaint} disabled={!complaint.trim()} className="w-full rounded-lg py-3.5 font-bold text-base"
          style={{ background: complaint.trim() ? "#0052CC" : "#E0E0E0", color: complaint.trim() ? "#fff" : "#9AA3B0" }}>{lang === "en" ? "Send Complaint" : lang === "mr" ? "तक्रार पाठवा" : "शिकायत भेजें"}</button>
      </div>
    </div>
  );
}

// =====================================================================
// CUSTOMER LOGIN — मोबाइल + OTP
// =====================================================================
// =====================================================================
// ROLE SELECTION — shown once so each user only sees their own platform
// =====================================================================
function RoleSelect({ onSelect, lang, customerVerified, driverVerified, adminVerified, onLogoutRole, adminEntry }) {
  const anyVerified = customerVerified || driverVerified || adminVerified;
  // One number, one app: while a Customer or Driver session is active on
  // this device, the other role is hidden — opening it requires logging
  // out of the active one first (via the "Not you?" link below). Logging
  // out brings back this same screen with both options visible again.
  const showCustomer = !driverVerified;
  const showDriver = !customerVerified;
  // Admin Login is invisible to regular Customer/Driver users — it only
  // shows up when the page was opened with the secret ?admin=1 link, or
  // once already signed in as admin (so the logout link stays reachable).
  const showAdmin = (adminEntry && !anyVerified) || adminVerified;
  const logoutLink = (role, label) => (
    <button onClick={() => onLogoutRole(role)} className="w-full text-center text-sm font-semibold mt-1.5" style={{ color: C.inkSoft }}>
      {lang === "en" ? `Not you? Logout of ${label}` : lang === "mr" ? `तुम्ही नाही आहात? ${label} मधून लॉगआउट करा` : `आप नहीं हैं? ${label} से लॉगआउट करें`}
    </button>
  );
  const bothShown = showCustomer && showDriver;
  return (
    <div className="flex-1 overflow-y-auto flex flex-col items-center px-5 py-8">
      {anyVerified ? (
        <p className="text-sm text-center mb-6" style={{ color: C.inkSoft }}>
          {lang === "en" ? "Continue where you left off, or logout to switch" : lang === "mr" ? "जिथून सोडले होते तिथून सुरू ठेवा, किंवा स्विच करण्यासाठी लॉगआउट करा" : "जहां से छोड़ा था वहां से जारी रखें, या स्विच करने के लिए लॉगआउट करें"}
        </p>
      ) : (
        <div className="w-full rounded-2xl p-4 mb-5 text-center" style={{ background: "#FFF3C4", border: `1.5px solid ${C.marigoldDeep}` }}>
          <p className="text-base font-bold leading-relaxed" style={{ color: C.ink }}>
            {lang === "en"
              ? <>Are you a driver? If you want fare/loads, choose the <span className="font-black" style={{ color: C.navy }}>Driver App</span>.</>
              : lang === "mr"
              ? <>तुम्ही कोण आहात? ड्रायव्हर आहात? तुम्हाला भाडे/लोड हवे असतील तर तुम्ही <span className="font-black" style={{ color: C.navy }}>ड्रायव्हर अ‍ॅप</span> निवडा.</>
              : <>आप कौन हैं? ड्राइवर हैं? आप को भाड़ा चाहिए तो आप <span className="font-black" style={{ color: C.navy }}>ड्राइवर ऐप</span> चुनें।</>}
          </p>
          <p className="text-base font-bold leading-relaxed mt-2" style={{ color: C.ink }}>
            {lang === "en"
              ? <>Are you a customer? If you want to book a vehicle, choose the <span className="font-black" style={{ color: C.success }}>Customer App</span>.</>
              : lang === "mr"
              ? <>तुम्ही कस्टमर आहात का? तुम्हाला गाडी बुक करायची असेल तर तुम्ही <span className="font-black" style={{ color: C.success }}>कस्टमर अ‍ॅप</span> निवडा.</>
              : <>अगर आप कस्टमर हैं? आप को गाड़ी बुक करना है तो आप <span className="font-black" style={{ color: C.success }}>कस्टमर ऐप</span> चुनें।</>}
          </p>
        </div>
      )}

      <div className={bothShown ? "w-full grid grid-cols-2 gap-3" : "w-full flex flex-col items-center"}>
        {showDriver && (
          <div className={bothShown ? "flex flex-col" : "w-full max-w-xs flex flex-col"}>
            <button onClick={() => onSelect("driver")} className="flex-1 w-full rounded-2xl p-4 flex flex-col items-center text-center" style={{ background: "#FFFFFF", border: `2px solid ${C.navy}` }}>
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-3" style={{ background: "#EAF1FF" }}>
                <IdCard size={30} color={C.navy} />
              </div>
              <div className="text-base font-black mb-1" style={{ color: C.ink }}>{lang === "en" ? "Driver App" : lang === "mr" ? "ड्रायव्हर अ‍ॅप" : "ड्राइवर ऐप"}</div>
              <div className="text-xs font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "To find fare & loads" : lang === "mr" ? "भाडे आणि लोड शोधण्यासाठी" : "भाड़ा और लोड खोजने के लिए"}</div>
            </button>
            {driverVerified && logoutLink("driver", lang === "en" ? "Driver" : lang === "mr" ? "ड्रायव्हर" : "ड्राइवर")}
          </div>
        )}

        {showCustomer && (
          <div className={bothShown ? "flex flex-col" : "w-full max-w-xs flex flex-col mt-3"}>
            <button onClick={() => onSelect("customer")} className="flex-1 w-full rounded-2xl p-4 flex flex-col items-center text-center" style={{ background: "#FFFFFF", border: `2px solid ${C.success}` }}>
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-3" style={{ background: "#E6F7EE" }}>
                <UserCheck size={30} color={C.success} />
              </div>
              <div className="text-base font-black mb-1" style={{ color: C.ink }}>{lang === "en" ? "Customer App" : lang === "mr" ? "कस्टमर अ‍ॅप" : "कस्टमर ऐप"}</div>
              <div className="text-xs font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "To book a vehicle" : lang === "mr" ? "गाडी बुक करण्यासाठी" : "गाड़ी बुक करने के लिए"}</div>
            </button>
            {customerVerified && logoutLink("customer", lang === "en" ? "Customer" : lang === "mr" ? "कस्टमर" : "कस्टमर")}
          </div>
        )}
      </div>

      {showAdmin && (
        <button onClick={() => onSelect("admin")} className="mt-8 text-sm font-semibold" style={{ color: C.inkSoft }}>
          {lang === "en" ? "Admin Login" : lang === "mr" ? "अ‍ॅडमिन लॉगिन" : "एडमिन लॉगिन"}
        </button>
      )}
      {adminVerified && logoutLink("admin", lang === "en" ? "Admin" : lang === "mr" ? "अ‍ॅडमिन" : "एडमिन")}
    </div>
  );
}

// =====================================================================
// ADMIN LOGIN — password protected, separate from customer/driver
// =====================================================================
function AdminLogin({ onVerified, lang, onBack }) {
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
      if (user) onVerified();
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
      onVerified();
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

// =====================================================================
// CUSTOMER REGISTRATION — two separate steps. Step 1 is mobile/OTP only.
// Step 2 (profile details) only appears once, right after verifying, and
// only if this exact mobile number has no saved profile yet.
// =====================================================================
function CustomerOnboarding({ lang = "hi", authInstance, verified, verifiedMobile, hasProfile, checking, onOtpVerified, onLogout, onComplete }) {
  // Step 2 fields — profile/address, asked only once, only if needed.
  // Persisted to localStorage so refreshing mid-registration (a slow
  // connection, an accidental reload) doesn't force retyping everything —
  // cleared once submitProfile actually completes.
  const [name, setName] = usePersistedState("sarthi_customerReg_name", "");
  const [photo, setPhoto] = usePersistedPhoto("sarthi_customerReg_photo", null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  // Sign Up's photo picker runs before OTP verifies, but Storage's security
  // rules require real auth to write — so the file just sits here (never
  // persisted; Files aren't JSON-serializable) and the actual upload
  // happens inside submitProfile, once verifyOtp has signed the user in.
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  useEffect(() => {
    if (!photoFile) return;
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  // Which button they tapped on the very first screen — purely about
  // showing the right labels/copy, since the underlying mobile+OTP flow is
  // identical either way and already figures out on its own (via
  // hasProfile) whether this number needs the registration form or not.
  const [mode, setMode] = useState(null); // null | "login" | "signup"

  // Step 1 — mobile + PIN. "stage" is purely local UI progression (moving
  // from the mobile field to the PIN field costs nothing — unlike the old
  // OTP flow, there's no SMS to send just to advance a screen).
  const [mobile, setMobile] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState(""); // Sign Up only
  const [stage, setStage] = useState("mobile"); // "mobile" | "pin"
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // Forgot-PIN — reachable only from Login's PIN screen. Reuses Firebase's
  // own Phone Auth (reCAPTCHA + real SMS OTP) as the recovery proof instead
  // of a custom SMS path — it already works today with no DLT template to
  // wait on, and showing the "I'm not a robot" check on this one rare
  // recovery path costs far less than showing it on every login (which is
  // the whole reason PIN login exists). "forgotStage" tracks its own
  // 2-step flow: verify via real OTP, then set a new PIN.
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStage, setForgotStage] = useState("otp"); // "otp" | "newPin"
  const [forgotOtp, setForgotOtp] = useState("");
  const [forgotNewPin, setForgotNewPin] = useState("");
  const [forgotNewPinConfirm, setForgotNewPinConfirm] = useState("");
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const forgotConfirmationRef = useRef(null);
  const forgotRecaptchaRef = useRef(null);

  const otpInputCls = "w-full rounded-lg px-3 py-3 text-sm outline-none text-center placeholder:text-[#C7B8B3]";
  const otpInputStyle = { background: C.paper, border: `1px solid ${C.line}`, color: C.ink, fontFamily: monoFont, letterSpacing: 2 };
  const fieldCls = "w-full rounded-lg px-3 py-2.5 text-sm outline-none";
  const fieldStyle = { background: C.paper, border: `1px solid ${C.line}`, color: C.ink };

  // A still-valid Firebase session on this device — skip straight past
  // Step 1. Covers both a real (legacy) Firebase Phone Auth session and a
  // PIN-based one (identified by its synthetic email — see pinAuthEmail).
  // Whether a profile exists for that number is checked separately and
  // live from Firestore, so there's no stale-cache risk here.
  useEffect(() => {
    const current = authInstance?.currentUser;
    const phoneMatch = current?.phoneNumber;
    if (phoneMatch) { onOtpVerified(phoneMatch.replace("+91", "")); return; }
    const emailMatch = current?.email?.match(/^(\d{10})@customer\.apnatransport\.local$/);
    if (emailMatch) onOtpVerified(emailMatch[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const detailsValid = name.trim().length >= 3;

  // Guided-step highlighting for the registration details field — see
  // GuidedStep. Shared by both places this form renders (post-login
  // completion and Sign Up), since both use the same field state.
  const regStepCompleted = [name.trim().length >= 3];
  // pinFocus: true — don't jump the guided highlight/scroll to the next
  // field the instant this one's validation passes; stay put until the
  // customer/driver actually taps away, so they can keep typing (e.g. a
  // name past the 3-char minimum) without the form yanking ahead of them.
  // autoAdvanceMs releases it on its own after 5 quiet seconds so they
  // don't have to tap elsewhere on screen just to move on.
  const { stepProps: regStepProps } = useGuidedSteps(regStepCompleted, { pinFocus: true, autoAdvanceMs: 5000 });

  const goToPinStage = () => {
    // Sign Up requires the details form to be filled in first; Login just
    // needs a valid-length mobile number. No network call here — the PIN
    // itself is what actually authenticates, entered on the next screen.
    if ((mode === "signup" && !detailsValid) || mobile.length !== 10) return;
    setPin(""); setPinConfirm(""); setError("");
    setStage("pin");
  };

  const submitPin = async () => {
    if (mobile.length !== 10 || pin.length !== 4 || !authInstance || sending) return;
    if (mode === "signup" && (!detailsValid || pin !== pinConfirm)) return;
    setSending(true);
    setError("");
    try {
      if (mode === "signup") {
        await createUserWithEmailAndPassword(authInstance, pinAuthEmail(mobile, "customer"), pinToPassword(pin));
      } else {
        await signInWithEmailAndPassword(authInstance, pinAuthEmail(mobile, "customer"), pinToPassword(pin));
      }
      onOtpVerified(mobile);
      // Sign Up already collected every field above — submit it straight
      // away instead of showing a second, redundant details screen.
      if (mode === "signup" && detailsValid) submitProfile();
    } catch (e) {
      console.error(e);
      setError(
        mode === "signup" && e?.code === "auth/email-already-in-use"
          ? (lang === "en" ? "This number is already registered — please Login instead." : lang === "mr" ? "हा नंबर आधीच नोंदणीकृत आहे — कृपया लॉगिन करा." : "यह नंबर पहले से रजिस्टर्ड है — कृपया लॉगिन करें।")
          : mode === "login"
          ? (lang === "en" ? "Incorrect mobile number or PIN." : lang === "mr" ? "चुकीचा मोबाइल नंबर किंवा PIN." : "गलत मोबाइल नंबर या PIN।")
          : (lang === "en" ? "Something went wrong — try again." : lang === "mr" ? "काहीतरी चुकले — पुन्हा प्रयत्न करा." : "कुछ गलत हुआ — फिर कोशिश करें।")
      );
      setSending(false);
      return;
    }
    setSending(false);
  };

  const getForgotRecaptcha = () => {
    if (!forgotRecaptchaRef.current) {
      forgotRecaptchaRef.current = new RecaptchaVerifier(authInstance, "recaptcha-forgot-pin-customer", { size: "invisible" });
    }
    return forgotRecaptchaRef.current;
  };

  const openForgotPin = async () => {
    if (mobile.length !== 10 || forgotSending || !authInstance) return;
    setForgotSending(true);
    setForgotError("");
    try {
      forgotConfirmationRef.current = await signInWithPhoneNumber(authInstance, "+91" + mobile, getForgotRecaptcha());
      setForgotOtp("");
      setForgotStage("otp");
      setForgotOpen(true);
    } catch (e) {
      console.error(e);
      try { forgotRecaptchaRef.current?.clear(); } catch { /* already gone */ }
      forgotRecaptchaRef.current = null;
      setForgotError(
        e?.code === "auth/too-many-requests"
          ? (lang === "en" ? "Too many attempts — please wait a while before trying again." : lang === "mr" ? "खूप जास्त प्रयत्न — कृपया थोड्या वेळाने पुन्हा प्रयत्न करा." : "बहुत ज़्यादा कोशिशें — कृपया थोड़ी देर बाद फिर कोशिश करें।")
          : (lang === "en" ? "Couldn't send OTP — try again." : lang === "mr" ? "OTP पाठवू शकलो नाही — पुन्हा प्रयत्न करा." : "OTP नहीं भेज सका — फिर कोशिश करें।")
      );
    }
    setForgotSending(false);
  };

  const verifyForgotOtp = async () => {
    if (forgotOtp.length !== 6 || !forgotConfirmationRef.current || forgotSending) return;
    setForgotSending(true);
    setForgotError("");
    try {
      await forgotConfirmationRef.current.confirm(forgotOtp);
      setForgotStage("newPin");
    } catch (e) {
      console.error(e);
      setForgotError(lang === "en" ? "Incorrect OTP — try again." : lang === "mr" ? "चुकीचा OTP — पुन्हा प्रयत्न करा." : "गलत OTP — फिर कोशिश करें।");
    }
    setForgotSending(false);
  };

  const submitForgotNewPin = async () => {
    if (forgotNewPin.length !== 4 || forgotNewPin !== forgotNewPinConfirm || forgotSending) return;
    setForgotSending(true);
    setForgotError("");
    const result = await resetPinAfterPhoneVerify("customer", pinToPassword(forgotNewPin));
    setForgotSending(false);
    if (!result.ok) {
      setForgotError(lang === "en" ? "Couldn't set new PIN — try again." : lang === "mr" ? "नवीन PIN सेट होऊ शकला नाही — पुन्हा प्रयत्न करा." : "नया PIN सेट नहीं हो सका — फिर कोशिश करें।");
      return;
    }
    // Already phone-verified for real just above -- straight into the app,
    // no separate re-login with the new PIN needed.
    onOtpVerified(mobile);
  };

  const submitProfile = async () => {
    if (!detailsValid) return;
    const ownMobile = verifiedMobile || mobile;
    // Sign Up's photo was only picked, not uploaded (couldn't be — Storage
    // requires real auth, which didn't exist until verifyOtp just now) —
    // upload it for real at this point, now that it does.
    let finalPhoto = photo;
    if (photoFile && ownMobile) {
      setPhotoUploading(true);
      finalPhoto = await uploadPhoto(photoFile, `customers/${ownMobile}/profile.jpg`);
      setPhotoUploading(false);
    }
    const ref = new URLSearchParams(window.location.search).get("ref");
    const referredBy = ref && ref !== ownMobile ? ref : null;
    // Pass the mobile we actually verified, not left for the caller to read
    // off its own state — onOtpVerified's setCustomerAuth update above hasn't
    // necessarily been re-rendered yet by the time this callback runs (no
    // photo means submitProfile has nothing to await in between), so the
    // caller's own "current" mobile can still be the pre-verification value.
    // That mismatch used to make the profile save under the wrong Firestore
    // doc ID, so the next refresh found no profile and re-asked for sign-up.
    onComplete({ name, photo: finalPhoto, referredBy, referralCredited: false, mobile: ownMobile });
    // Submitted for real — clear the draft so it can't leak into a future
    // registration attempt on this same device (e.g. a different customer).
    setName(""); setPhoto(null); setPhotoFile(null);
  };

  const backButton = (
    <button onClick={onLogout} className="flex items-center gap-1 mb-4 p-3 rounded-full shadow-sm" style={{ background: C.marigold, color: "#000000", border: `1.5px solid ${C.marigoldDeep}` }}>
      <ChevronLeft size={18} strokeWidth={3} />
    </button>
  );

  if (verified && checking) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-5">
        {backButton}
        <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Checking your profile..." : lang === "mr" ? "तुमची प्रोफाइल तपासली जात आहे..." : "आपकी प्रोफाइल जांची जा रही है..."}</p>
      </div>
    );
  }

  if (verified && hasProfile) {
    // Root is about to swap to CustomerApp — never show anything else here.
    return <div className="flex-1 flex items-center justify-center"><p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Loading..." : lang === "mr" ? "लोड होत आहे..." : "लोड हो रहा है..."}</p></div>;
  }

  if (verified && !hasProfile && mode !== "signup") {
    // This number chose (or defaulted to, via a resumed session) Login, but
    // genuinely has no registration on file — the details form must only
    // ever be reachable through Sign Up, so send them there instead of
    // silently letting a Login tap register a new account.
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center relative">
        {backButton}
        <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: C.safety }}>
          <XCircle size={26} color="#FFFFFF" />
        </div>
        <h2 className="text-lg font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "Not registered yet" : lang === "mr" ? "अजून रजिस्टर्ड नाही" : "अभी रजिस्टर्ड नहीं है"}</h2>
        <p className="text-xs mb-6" style={{ color: C.inkSoft }}>{lang === "en" ? "This mobile number doesn't have a customer account yet. Please sign up first." : lang === "mr" ? "या मोबाइल नंबरने अजून कोणतेही कस्टमर खाते नाही. कृपया आधी साइन अप करा." : "इस मोबाइल नंबर से अभी तक कोई कस्टमर खाता नहीं है। कृपया पहले साइन अप करें।"}</p>
        <button onClick={() => setMode("signup")} className="w-full rounded-lg py-4 font-bold text-base" style={{ background: C.marigold, color: "#000000" }}>
          {lang === "en" ? "Sign Up Now" : lang === "mr" ? "आत्ता साइन अप करा" : "अभी साइन अप करें"}
        </button>
      </div>
    );
  }

  if (verified && !hasProfile) {
    // Verified via Sign Up, and this number genuinely has no saved profile
    // yet.
    return (
      <div className="flex-1 overflow-y-auto px-6 py-8 relative">
        {backButton}
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: C.marigold }}>
          <MapPin size={22} color="#000000" />
        </div>
        <h2 className="text-lg font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "Customer Registration" : lang === "mr" ? "कस्टमर रजिस्ट्रेशन" : "कस्टमर रजिस्ट्रेशन"}</h2>
        <p className="text-xs mb-5" style={{ color: C.inkSoft }}>{lang === "en" ? "Just this once — fill in your details to finish setting up." : lang === "mr" ? "फक्त एकदाच — सेटअप पूर्ण करण्यासाठी तुमची माहिती भरा." : "बस एक बार — सेटअप पूरा करने के लिए अपनी जानकारी भरें।"}</p>

        <div className="space-y-3">
          <div className="flex justify-center">
            <PhotoPicker label={lang === "en" ? "Profile Photo" : lang === "mr" ? "प्रोफाइल फोटो" : "प्रोफाइल फोटो"} lang={lang} onSelect={(f) => {
              setPhotoUploading(true); setPhotoError(false);
              uploadPhoto(f, `customers/${verifiedMobile || mobile}/profile.jpg`).then((p) => {
                setPhotoUploading(false);
                if (p) setPhoto(p); else setPhotoError(true);
              });
            }}>
              <div className="w-20 h-20 rounded-full flex items-center justify-center cursor-pointer overflow-hidden" style={{ background: C.paper, border: `2px dashed ${C.marigoldDeep}` }}>
                {photoUploading
                  ? <p className="text-[9px] text-center px-1" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Uploading..." : lang === "mr" ? "अपलोड होत आहे..." : "अपलोड हो रहा है..."}</p>
                  : <SafeImage src={photo?.url} alt="" className="w-full h-full object-cover" fallback={<Camera size={22} color={C.marigoldDeep} />} />}
              </div>
            </PhotoPicker>
          </div>
          {photoError && (
            <p className="text-[10px] font-semibold text-center" style={{ color: C.safety }}>{lang === "en" ? "Photo upload failed — please try another photo" : lang === "mr" ? "फोटो अपलोड झाला नाही — कृपया दुसरा फोटो वापरा" : "फोटो अपलोड नहीं हुई — कृपया दूसरी फोटो लें"}</p>
          )}
          <GuidedStep {...regStepProps(0)} lang={lang}>
            <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Full Name" : lang === "mr" ? "पूर्ण नाव" : "पूरा नाम"}</label>
            <input className={fieldCls} style={fieldStyle} placeholder={lang === "en" ? "e.g. Ramesh Patel" : lang === "mr" ? "उदा: रमेश पटेल" : "जैसे: रमेश पटेल"} value={name} onChange={(e) => setName(e.target.value)} />
          </GuidedStep>
        </div>

        {!detailsValid && <div className="text-[11px] font-semibold mt-3" style={{ color: C.safety }}>{lang === "en" ? "Fill in your name above to continue" : lang === "mr" ? "पुढे जाण्यासाठी वरील नाव भरा" : "आगे बढ़ने के लिए ऊपर नाम भरें"}</div>}
        <button onClick={submitProfile} disabled={!detailsValid || photoUploading} className={`w-full rounded-lg py-4 font-bold text-base mt-3 ${detailsValid && !photoUploading ? "guided-submit-ready" : ""}`}
          style={{ background: detailsValid && !photoUploading ? C.marigold : "#E0E0E0", color: detailsValid && !photoUploading ? "#000000" : "#9AA3B0" }}>
          {photoUploading ? (lang === "en" ? "Uploading photo..." : lang === "mr" ? "फोटो अपलोड होत आहे..." : "फोटो अपलोड हो रही है...") : (lang === "en" ? "Complete Registration" : lang === "mr" ? "रजिस्ट्रेशन पूर्ण करा" : "रजिस्ट्रेशन पूरा करें")}
        </button>
      </div>
    );
  }

  if (!verified && mode === null) {
    // First screen — a plain choice, before anything else, so a returning
    // customer knows they can go straight to OTP without expecting a
    // registration form (and a new customer knows what to expect too).
    // The actual mobile+OTP mechanics are identical either way — the app
    // already checks Firestore (hasProfile) after verifying and only shows
    // the registration form if this number genuinely has none yet.
    return (
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-8 py-10 relative">
        <button onClick={onLogout} className="absolute top-4 left-4 flex items-center gap-1 p-3 rounded-full shadow-sm" style={{ background: C.marigold, color: "#000000", border: `1.5px solid ${C.marigoldDeep}` }}>
          <ChevronLeft size={18} strokeWidth={3} />
        </button>
        <div className="mb-4"><Logo size={96} /></div>
        <h2 className="text-lg font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "Customer" : lang === "mr" ? "कस्टमर" : "कस्टमर"}</h2>
        <p className="text-xs text-center mb-6" style={{ color: C.inkSoft }}>{lang === "en" ? "Are you already registered, or new here?" : lang === "mr" ? "तुम्ही आधीपासून रजिस्टर्ड आहात, की नवीन आहात?" : "क्या आप पहले से रजिस्टर्ड हैं, या नए हैं?"}</p>
        <div className="w-full space-y-3">
          <button onClick={() => setMode("login")} className="w-full rounded-lg py-4 font-bold text-base" style={{ background: C.marigold, color: "#000000" }}>
            {lang === "en" ? "Login" : lang === "mr" ? "लॉगिन करा" : "लॉगिन करें"}
          </button>
          <button onClick={() => setMode("signup")} className="w-full rounded-lg py-4 font-bold text-base" style={{ background: C.paper, color: C.marigoldDeep, border: `1.5px solid ${C.marigoldDeep}` }}>
            {lang === "en" ? "Sign Up (New Customer)" : lang === "mr" ? "साइन अप करा (नवीन कस्टमर)" : "साइन अप करें (नया कस्टमर)"}
          </button>
        </div>
      </div>
    );
  }

  if (mode === "login") {
    // Login — mobile + PIN, no SMS needed except via the Forgot PIN path.
    return (
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-8 py-10 relative">
        <button onClick={() => setMode(null)} className="absolute top-4 left-4 flex items-center gap-1 p-3 rounded-full shadow-sm" style={{ background: C.marigold, color: "#000000", border: `1.5px solid ${C.marigoldDeep}` }}>
          <ChevronLeft size={18} strokeWidth={3} />
        </button>
        <div className="mb-4"><Logo size={96} /></div>
        <h2 className="text-lg font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "Customer Login" : lang === "mr" ? "कस्टमर लॉगिन" : "कस्टमर लॉगिन"}</h2>
        <p className="text-xs text-center mb-6" style={{ color: C.inkSoft }}>{lang === "en" ? "Enter your mobile number and PIN to continue." : lang === "mr" ? "सुरू ठेवण्यासाठी तुमचा मोबाइल नंबर आणि PIN टाका." : "जारी रखने के लिए अपना मोबाइल नंबर और PIN डालें।"}</p>
        <div className="w-full">
          {stage === "mobile" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg px-3" style={{ border: `1px solid ${C.line}`, background: C.paper }}>
                <Phone size={16} color={C.inkSoft} />
                <span className="text-sm" style={{ color: C.inkSoft, fontFamily: monoFont }}>+91</span>
                <input className="flex-1 py-3 text-sm outline-none" style={{ color: C.ink, fontFamily: monoFont }} placeholder={lang === "en" ? "10-digit mobile number" : lang === "mr" ? "10 अंकी मोबाइल नंबर" : "10 अंकों का मोबाइल नंबर"}
                  value={mobile} onChange={(e) => { setMobile(e.target.value.replace(/\D/g, "").slice(0, 10)); setError(""); }} />
              </div>
              {error && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{error}</div>}
              <button onClick={goToPinStage} disabled={mobile.length !== 10}
                className="w-full rounded-lg py-4 font-bold text-base" style={{ background: mobile.length === 10 ? C.marigold : "#E0E0E0", color: mobile.length === 10 ? "#000000" : "#9AA3B0" }}>
                {lang === "en" ? "Continue" : lang === "mr" ? "पुढे जा" : "आगे बढ़ें"}
              </button>
            </div>
          ) : forgotOpen ? (
            forgotStage === "otp" ? (
              <div className="space-y-3">
                <p className="text-[11px]" style={{ color: C.inkSoft }}>{lang === "en" ? `OTP sent to +91${mobile} to verify it's really you.` : lang === "mr" ? `तुम्हीच आहात याची खात्री करण्यासाठी +91${mobile} वर OTP पाठवला.` : `यह सच में आप हैं यह जांचने के लिए +91${mobile} पर OTP भेजा गया।`}</p>
                <div className="flex items-center gap-2 rounded-lg px-3" style={{ border: `1px solid ${C.line}`, background: C.paper }}>
                  <ShieldCheck size={16} color={C.inkSoft} />
                  <input className={otpInputCls} style={{ ...otpInputStyle, border: "none", color: forgotOtp ? "#000000" : "#C7B8B3" }} placeholder="• • • • • •" value={forgotOtp}
                    onChange={(e) => { setForgotOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setForgotError(""); }} />
                </div>
                {forgotError && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{forgotError}</div>}
                <button onClick={verifyForgotOtp} disabled={forgotOtp.length !== 6 || forgotSending}
                  className="w-full rounded-lg py-4 font-bold text-base" style={{ background: forgotOtp.length === 6 && !forgotSending ? C.marigold : "#E0E0E0", color: forgotOtp.length === 6 && !forgotSending ? "#000000" : "#9AA3B0" }}>
                  {forgotSending ? (lang === "en" ? "Verifying..." : lang === "mr" ? "व्हेरिफाय होत आहे..." : "वेरीफाई हो रहा है...") : (lang === "en" ? "Verify" : lang === "mr" ? "व्हेरिफाय करा" : "वेरीफाई करें")}
                </button>
                <div className="flex items-center justify-between">
                  <button onClick={() => { setForgotOpen(false); setForgotError(""); }} className="text-sm font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "Cancel" : lang === "mr" ? "रद्द करा" : "रद्द करें"}</button>
                  <button onClick={openForgotPin} disabled={forgotSending} className="text-sm font-semibold" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Resend OTP" : lang === "mr" ? "OTP पुन्हा पाठवा" : "OTP दोबारा भेजें"}</button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-bold" style={{ color: C.success }}>{lang === "en" ? "Number verified — now set a new PIN." : lang === "mr" ? "नंबर व्हेरिफाय झाला — आता नवीन PIN सेट करा." : "नंबर वेरीफाई हो गया — अब नया PIN सेट करें।"}</p>
                <input className={otpInputCls} style={{ ...otpInputStyle, color: forgotNewPin ? "#000000" : "#C7B8B3" }} placeholder={lang === "en" ? "New 4-digit PIN" : lang === "mr" ? "नवीन 4-अंकी PIN" : "नया 4-अंकों का PIN"}
                  value={forgotNewPin} onChange={(e) => { setForgotNewPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setForgotError(""); }} />
                <input className={otpInputCls} style={{ ...otpInputStyle, color: forgotNewPinConfirm ? "#000000" : "#C7B8B3" }} placeholder={lang === "en" ? "Confirm new PIN" : lang === "mr" ? "नवीन PIN कन्फर्म करा" : "नया PIN कन्फर्म करें"}
                  value={forgotNewPinConfirm} onChange={(e) => { setForgotNewPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 4)); setForgotError(""); }} />
                {forgotNewPin && forgotNewPinConfirm && forgotNewPin !== forgotNewPinConfirm && (
                  <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{lang === "en" ? "PINs don't match" : lang === "mr" ? "PIN जुळत नाहीत" : "PIN मेल नहीं खाते"}</div>
                )}
                {forgotError && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{forgotError}</div>}
                <button onClick={submitForgotNewPin} disabled={forgotNewPin.length !== 4 || forgotNewPin !== forgotNewPinConfirm || forgotSending}
                  className="w-full rounded-lg py-4 font-bold text-base" style={{ background: forgotNewPin.length === 4 && forgotNewPin === forgotNewPinConfirm && !forgotSending ? C.marigold : "#E0E0E0", color: forgotNewPin.length === 4 && forgotNewPin === forgotNewPinConfirm && !forgotSending ? "#000000" : "#9AA3B0" }}>
                  {forgotSending ? (lang === "en" ? "Saving..." : lang === "mr" ? "सेव्ह होत आहे..." : "सेव हो रहा है...") : (lang === "en" ? "Save & Continue" : lang === "mr" ? "सेव्ह करा आणि पुढे जा" : "सेव करें और आगे बढ़ें")}
                </button>
              </div>
            )
          ) : (
            <div className="space-y-3">
              <input className={otpInputCls} style={{ ...otpInputStyle, color: pin ? "#000000" : "#C7B8B3" }} placeholder={lang === "en" ? "4-digit PIN" : lang === "mr" ? "4-अंकी PIN" : "4-अंकों का PIN"}
                value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setError(""); }} />
              {error && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{error}</div>}
              <button onClick={submitPin} disabled={pin.length !== 4 || sending}
                className="w-full rounded-lg py-4 font-bold text-base" style={{ background: pin.length === 4 && !sending ? C.marigold : "#E0E0E0", color: pin.length === 4 && !sending ? "#000000" : "#9AA3B0" }}>
                {sending ? (lang === "en" ? "Logging in..." : lang === "mr" ? "लॉगिन होत आहे..." : "लॉगिन हो रहा है...") : (lang === "en" ? "Login" : lang === "mr" ? "लॉगिन करा" : "लॉगिन करें")}
              </button>
              <div className="flex items-center justify-between">
                <button onClick={() => { setStage("mobile"); setError(""); }} className="text-sm font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "Change number" : lang === "mr" ? "नंबर बदला" : "नंबर बदलें"}</button>
                <button onClick={openForgotPin} disabled={forgotSending} className="text-sm font-semibold" style={{ color: C.marigoldDeep }}>{forgotSending ? (lang === "en" ? "Sending..." : lang === "mr" ? "पाठवले जात आहे..." : "भेजा जा रहा है...") : (lang === "en" ? "Forgot PIN?" : lang === "mr" ? "PIN विसरलात?" : "PIN भूल गए?")}</button>
              </div>
              {forgotError && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{forgotError}</div>}
            </div>
          )}
        </div>
        <div id="recaptcha-forgot-pin-customer" />
      </div>
    );
  }

  // Sign Up — the registration form comes first, with mobile/OTP
  // verification at the bottom of this same page.
  return (
    <div className="flex-1 overflow-y-auto px-6 py-8 relative">
      <button onClick={() => setMode(null)} className="flex items-center gap-1 mb-4 p-3 rounded-full shadow-sm" style={{ background: C.marigold, color: "#000000", border: `1.5px solid ${C.marigoldDeep}` }}>
        <ChevronLeft size={18} strokeWidth={3} />
      </button>
      <div className="mb-4"><Logo size={96} /></div>
      <h2 className="text-lg font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "Customer Sign Up" : lang === "mr" ? "कस्टमर साइन अप" : "कस्टमर साइन अप"}</h2>
      <p className="text-xs mb-5" style={{ color: C.inkSoft }}>
        {lang === "en" ? "Step 1 of 2 — Fill in your details, then set a PIN below." : lang === "mr" ? "स्टेप 1 / 2 — तुमची माहिती भरा, नंतर खाली PIN सेट करा." : "स्टेप 1 / 2 — अपनी जानकारी भरें, फिर नीचे PIN सेट करें।"}
      </p>

      <div className="space-y-3">
        <div className="flex justify-center">
          <PhotoPicker label={lang === "en" ? "Profile Photo" : lang === "mr" ? "प्रोफाइल फोटो" : "प्रोफाइल फोटो"} lang={lang} onSelect={(f) => setPhotoFile(f)}>
            <div className="w-20 h-20 rounded-full flex items-center justify-center cursor-pointer overflow-hidden" style={{ background: C.paper, border: `2px dashed ${C.marigoldDeep}` }}>
              <SafeImage src={photoPreview} alt="" className="w-full h-full object-cover" fallback={<Camera size={22} color={C.marigoldDeep} />} />
            </div>
          </PhotoPicker>
        </div>
        <GuidedStep {...regStepProps(0)} lang={lang}>
          <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Full Name" : lang === "mr" ? "पूर्ण नाव" : "पूरा नाम"}</label>
          <input className={fieldCls} style={fieldStyle} placeholder={lang === "en" ? "e.g. Ramesh Patel" : lang === "mr" ? "उदा: रमेश पटेल" : "जैसे: रमेश पटेल"} value={name} onChange={(e) => setName(e.target.value)} />
        </GuidedStep>
      </div>

      <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${C.line}` }}>
        <div className="text-[11px] font-bold mb-2" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Set Up Login" : lang === "mr" ? "लॉगिन सेट करा" : "लॉगिन सेट करें"}</div>
        {stage === "mobile" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg px-3" style={{ border: `1px solid ${C.line}`, background: C.paper }}>
                <Phone size={16} color={C.inkSoft} />
                <span className="text-sm" style={{ color: C.inkSoft, fontFamily: monoFont }}>+91</span>
                <input className="flex-1 py-3 text-sm outline-none" style={{ color: C.ink, fontFamily: monoFont }} placeholder={lang === "en" ? "10-digit mobile number" : lang === "mr" ? "10 अंकी मोबाइल नंबर" : "10 अंकों का मोबाइल नंबर"}
                  value={mobile} onChange={(e) => { setMobile(e.target.value.replace(/\D/g, "").slice(0, 10)); setError(""); }} />
              </div>
              {!detailsValid && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{lang === "en" ? "Fill in all the details above first" : lang === "mr" ? "आधी वरील सर्व माहिती भरा" : "पहले ऊपर सारी जानकारी भरें"}</div>}
              {error && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{error}</div>}
              <button onClick={goToPinStage} disabled={!detailsValid || mobile.length !== 10}
                className={`w-full rounded-lg py-4 font-bold text-base ${detailsValid && mobile.length === 10 ? "guided-submit-ready" : ""}`} style={{ background: detailsValid && mobile.length === 10 ? C.marigold : "#E0E0E0", color: detailsValid && mobile.length === 10 ? "#000000" : "#9AA3B0" }}>
                {lang === "en" ? "Continue" : lang === "mr" ? "पुढे जा" : "आगे बढ़ें"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[11px]" style={{ color: C.inkSoft }}>{lang === "en" ? "Set a 4-digit PIN you'll use to log in next time." : lang === "mr" ? "पुढच्या वेळी लॉगिनसाठी वापरण्यासाठी 4-अंकी PIN सेट करा." : "अगली बार लॉगिन के लिए इस्तेमाल होने वाला 4-अंकों का PIN सेट करें।"}</p>
              <input className={otpInputCls} style={{ ...otpInputStyle, color: pin ? "#000000" : "#C7B8B3" }} placeholder={lang === "en" ? "4-digit PIN" : lang === "mr" ? "4-अंकी PIN" : "4-अंकों का PIN"}
                value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setError(""); }} />
              <input className={otpInputCls} style={{ ...otpInputStyle, color: pinConfirm ? "#000000" : "#C7B8B3" }} placeholder={lang === "en" ? "Confirm PIN" : lang === "mr" ? "PIN कन्फर्म करा" : "PIN कन्फर्म करें"}
                value={pinConfirm} onChange={(e) => { setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 4)); setError(""); }} />
              {pin && pinConfirm && pin !== pinConfirm && (
                <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{lang === "en" ? "PINs don't match" : lang === "mr" ? "PIN जुळत नाहीत" : "PIN मेल नहीं खाते"}</div>
              )}
              {error && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{error}</div>}
              <button onClick={submitPin} disabled={pin.length !== 4 || pin !== pinConfirm || sending}
                className="w-full rounded-lg py-4 font-bold text-base" style={{ background: pin.length === 4 && pin === pinConfirm && !sending ? C.marigold : "#E0E0E0", color: pin.length === 4 && pin === pinConfirm && !sending ? "#000000" : "#9AA3B0" }}>
                {sending ? (lang === "en" ? "Creating account..." : lang === "mr" ? "खाते तयार होत आहे..." : "खाता बन रहा है...") : (lang === "en" ? "Create Account" : lang === "mr" ? "खाते तयार करा" : "खाता बनाएं")}
              </button>
              <button onClick={() => { setStage("mobile"); setError(""); }} className="text-sm font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "Change number" : lang === "mr" ? "नंबर बदला" : "नंबर बदलें"}</button>
            </div>
          )}
      </div>
    </div>
  );
}

// =====================================================================
// DRIVER REGISTRATION — one continuous page: phone OTP, then straight
// into KYC submission, instead of two separate screens.
// =====================================================================
function DriverOnboarding({ lang = "hi", authInstance, verified, onOtpVerified, onLogout, driver, setDriver, vehicleTypes, addVehicleType, onFirstSignupComplete, forceMode = null }) {
  // Which button they tapped on the very first screen — purely about
  // labels/copy, since the mobile+OTP mechanics are identical either way.
  // forceMode skips that first screen entirely (used by DriverKycPortal,
  // where the visitor is always an already-registered driver completing
  // KYC, so there's no real "new here?" choice to ask).
  const [mode, setMode] = useState(forceMode); // null | "login" | "signup"

  // Personal details — only ever asked for AFTER OTP verifies, and only if
  // this driver doc genuinely has none yet (first-time signup). Persisted
  // to localStorage so a refresh mid-fill doesn't wipe it.
  const [name, setName] = usePersistedState("sarthi_driverReg_name", "");
  // Mandatory acknowledgment that keeping vehicle documents (RC, insurance,
  // fitness, permit, PUC) and the driving license valid/updated is the
  // driver/owner's own responsibility, not the app's — see the Vehicle
  // Documents & Legal Compliance clause in TermsModal. Required before
  // registration can complete, same as every other field here.
  const [acceptedDocsTerms, setAcceptedDocsTerms] = usePersistedState("sarthi_driverReg_acceptedDocsTerms", false);

  // Step 1 — mobile + PIN. "stage" starts at "checking" only to avoid a
  // one-frame flash of the mobile-entry screen while the effect below
  // resolves an already-valid session on this device.
  const [mobile, setMobile] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState(""); // Sign Up only
  const [stage, setStage] = useState(authInstance?.currentUser ? "checking" : "mobile"); // "checking" | "mobile" | "pin"
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // Forgot-PIN — reachable only from Login's PIN screen. See
  // CustomerOnboarding's identical block for the full explanation (reuses
  // real Firebase Phone Auth as the recovery proof).
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStage, setForgotStage] = useState("otp"); // "otp" | "newPin"
  const [forgotOtp, setForgotOtp] = useState("");
  const [forgotNewPin, setForgotNewPin] = useState("");
  const [forgotNewPinConfirm, setForgotNewPinConfirm] = useState("");
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const forgotConfirmationRef = useRef(null);
  const forgotRecaptchaRef = useRef(null);

  const otpInputCls = "w-full rounded-lg py-3 px-3 text-sm outline-none text-center placeholder:text-[#C7B8B3]";
  const otpInputStyle = { background: C.paper, border: `1px solid ${C.line}`, color: C.ink, fontFamily: monoFont, letterSpacing: 2 };
  const fieldCls = "w-full rounded-lg px-3 py-2.5 text-sm outline-none";
  const fieldStyle = { background: C.paper, border: `1px solid ${C.line}`, color: C.ink };

  useEffect(() => {
    const current = authInstance?.currentUser;
    const phoneMatch = current?.phoneNumber;
    if (phoneMatch) { onOtpVerified(phoneMatch.replace("+91", "")); return; }
    const emailMatch = current?.email?.match(/^(\d{10})@driver\.apnatransport\.local$/);
    if (emailMatch) { onOtpVerified(emailMatch[1]); return; }
    setStage("mobile");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once OTP verifies and the driver doc exists, attach whatever was
  // collected on the Sign Up form (pre-OTP). Login has no fields to apply —
  // this simply won't fire for that path since name stays empty. A driver
  // doc's name is seeded to its own mobile number as a placeholder at
  // creation (see getOrCreateDoc in App()), so "name still equals mobile"
  // is the signal that registration details haven't been given yet —
  // there's no separate address field anymore to check instead.
  const infoAppliedRef = useRef(false);
  useEffect(() => {
    if (verified && driver && driver.name === driver.mobile && !infoAppliedRef.current && name.trim()) {
      infoAppliedRef.current = true;
      const ref = new URLSearchParams(window.location.search).get("ref");
      const referredBy = ref && ref !== driver.mobile ? ref : null;
      setDriver({ ...driver, name: name.trim(), referredBy, referralCredited: false });
      setName(""); setAcceptedDocsTerms(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verified, driver]);

  const detailsValid = name.trim().length >= 3 && acceptedDocsTerms;

  // Guided-step highlighting for the registration details field — see
  // GuidedStep. Shared by both places this form renders (the fallback
  // completion form and Sign Up), since both use the same field state.
  const regStepCompleted = [name.trim().length >= 3];
  // pinFocus: true — don't jump the guided highlight/scroll to the next
  // field the instant this one's validation passes; stay put until the
  // customer/driver actually taps away, so they can keep typing (e.g. a
  // name past the 3-char minimum) without the form yanking ahead of them.
  // autoAdvanceMs releases it on its own after 5 quiet seconds so they
  // don't have to tap elsewhere on screen just to move on.
  const { stepProps: regStepProps } = useGuidedSteps(regStepCompleted, { pinFocus: true, autoAdvanceMs: 5000 });

  const goToPinStage = () => {
    // Sign Up requires the details form to be filled in first; Login just
    // needs a valid-length mobile number.
    if ((mode === "signup" && !detailsValid) || mobile.length !== 10) return;
    setPin(""); setPinConfirm(""); setError("");
    setStage("pin");
  };

  const submitPin = async () => {
    if (mobile.length !== 10 || pin.length !== 4 || !authInstance || sending) return;
    if (mode === "signup" && (!detailsValid || pin !== pinConfirm)) return;
    setSending(true);
    setError("");
    try {
      if (mode === "signup") {
        await createUserWithEmailAndPassword(authInstance, pinAuthEmail(mobile, "driver"), pinToPassword(pin));
      } else {
        await signInWithEmailAndPassword(authInstance, pinAuthEmail(mobile, "driver"), pinToPassword(pin));
      }
      onOtpVerified(mobile);
      // Sign Up's details attach to the driver doc automatically once it's
      // ready (see the effect above) — nothing more to do here.
    } catch (e) {
      console.error(e);
      setError(
        mode === "signup" && e?.code === "auth/email-already-in-use"
          ? (lang === "en" ? "This number is already registered — please Login instead." : lang === "mr" ? "हा नंबर आधीच नोंदणीकृत आहे — कृपया लॉगिन करा." : "यह नंबर पहले से रजिस्टर्ड है — कृपया लॉगिन करें।")
          : mode === "login"
          ? (lang === "en" ? "Incorrect mobile number or PIN." : lang === "mr" ? "चुकीचा मोबाइल नंबर किंवा PIN." : "गलत मोबाइल नंबर या PIN।")
          : (lang === "en" ? "Something went wrong — try again." : lang === "mr" ? "काहीतरी चुकले — पुन्हा प्रयत्न करा." : "कुछ गलत हुआ — फिर कोशिश करें।")
      );
      setSending(false);
      return;
    }
    setSending(false);
  };

  const getForgotRecaptcha = () => {
    if (!forgotRecaptchaRef.current) {
      forgotRecaptchaRef.current = new RecaptchaVerifier(authInstance, "recaptcha-forgot-pin-driver", { size: "invisible" });
    }
    return forgotRecaptchaRef.current;
  };

  const openForgotPin = async () => {
    if (mobile.length !== 10 || forgotSending || !authInstance) return;
    setForgotSending(true);
    setForgotError("");
    try {
      forgotConfirmationRef.current = await signInWithPhoneNumber(authInstance, "+91" + mobile, getForgotRecaptcha());
      setForgotOtp("");
      setForgotStage("otp");
      setForgotOpen(true);
    } catch (e) {
      console.error(e);
      try { forgotRecaptchaRef.current?.clear(); } catch { /* already gone */ }
      forgotRecaptchaRef.current = null;
      setForgotError(
        e?.code === "auth/too-many-requests"
          ? (lang === "en" ? "Too many attempts — please wait a while before trying again." : lang === "mr" ? "खूप जास्त प्रयत्न — कृपया थोड्या वेळाने पुन्हा प्रयत्न करा." : "बहुत ज़्यादा कोशिशें — कृपया थोड़ी देर बाद फिर कोशिश करें।")
          : (lang === "en" ? "Couldn't send OTP — try again." : lang === "mr" ? "OTP पाठवू शकलो नाही — पुन्हा प्रयत्न करा." : "OTP नहीं भेज सका — फिर कोशिश करें।")
      );
    }
    setForgotSending(false);
  };

  const verifyForgotOtp = async () => {
    if (forgotOtp.length !== 6 || !forgotConfirmationRef.current || forgotSending) return;
    setForgotSending(true);
    setForgotError("");
    try {
      await forgotConfirmationRef.current.confirm(forgotOtp);
      setForgotStage("newPin");
    } catch (e) {
      console.error(e);
      setForgotError(lang === "en" ? "Incorrect OTP — try again." : lang === "mr" ? "चुकीचा OTP — पुन्हा प्रयत्न करा." : "गलत OTP — फिर कोशिश करें।");
    }
    setForgotSending(false);
  };

  const submitForgotNewPin = async () => {
    if (forgotNewPin.length !== 4 || forgotNewPin !== forgotNewPinConfirm || forgotSending) return;
    setForgotSending(true);
    setForgotError("");
    const result = await resetPinAfterPhoneVerify("driver", pinToPassword(forgotNewPin));
    setForgotSending(false);
    if (!result.ok) {
      setForgotError(lang === "en" ? "Couldn't set new PIN — try again." : lang === "mr" ? "नवीन PIN सेट होऊ शकला नाही — पुन्हा प्रयत्न करा." : "नया PIN सेट नहीं हो सका — फिर कोशिश करें।");
      return;
    }
    // Already phone-verified for real just above -- straight into the app,
    // no separate re-login with the new PIN needed.
    onOtpVerified(mobile);
  };

  // Fallback completion form (see the "still just a placeholder name"
  // branch below) — covers someone who tapped Login but turned out to be
  // a new driver, so they're not stuck with no way to finish setting up.
  const completeDetails = () => {
    if (!detailsValid || !driver) return;
    const ref = new URLSearchParams(window.location.search).get("ref");
    const referredBy = ref && ref !== driver.mobile ? ref : null;
    setDriver({ ...driver, name: name.trim(), referredBy, referralCredited: false });
    setName("");
  };

  const backButton = (
    <button onClick={onLogout} className="flex items-center gap-1 mb-4 p-3 rounded-full shadow-sm" style={{ background: C.marigold, color: "#000000", border: `1.5px solid ${C.marigoldDeep}` }}>
      <ChevronLeft size={18} strokeWidth={3} />
    </button>
  );

  if (!verified && stage === "checking") {
    return <div className="flex-1 flex items-center justify-center"><p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Checking your session..." : lang === "mr" ? "तुमचे सेशन तपासले जात आहे..." : "आपका सेशन जांचा जा रहा है..."}</p></div>;
  }

  if (verified && driver && driver.vehicleSpec) {
    // Returning driver, same number — already fully registered. The root
    // will swap to the KYC-pending or DriverApp screen on its next render.
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-5">
        {backButton}
        <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Loading your profile..." : lang === "mr" ? "तुमची प्रोफाइल लोड होत आहे..." : "आपकी प्रोफाइल लोड हो रही है..."}</p>
      </div>
    );
  }

  if (verified && !driver) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-5">
        {backButton}
        <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Loading your profile..." : lang === "mr" ? "तुमची प्रोफाइल लोड होत आहे..." : "आपकी प्रोफाइल लोड हो रही है..."}</p>
      </div>
    );
  }

  if (verified && driver && driver.name !== driver.mobile) {
    // Details already on file (normal returning-driver path) — move
    // straight to documents.
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="px-5 pt-4">{backButton}</div>
        <DriverKyc driver={driver} setDriver={setDriver} vehicleTypes={vehicleTypes} addVehicleType={addVehicleType} lang={lang}
          stepLabel={lang === "en" ? "Step 2 of 2 — Documents & Vehicle" : lang === "mr" ? "स्टेप 2 / 2 — कागदपत्रे आणि गाडी" : "स्टेप 2 / 2 — दस्तावेज़ और गाड़ी"}
          onFirstSubmit={onFirstSignupComplete} />
      </div>
    );
  }

  if (verified && driver && !driver.vehicleSpec && driver.name === driver.mobile && mode !== "signup") {
    // This number chose (or defaulted to, via a resumed session) Login, but
    // genuinely has no registration on file — the details form must only
    // ever be reachable through Sign Up, so send them there instead of
    // silently letting a Login tap register a new account.
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center relative">
        {backButton}
        <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: C.safety }}>
          <XCircle size={26} color="#FFFFFF" />
        </div>
        <h2 className="text-lg font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "Not registered yet" : lang === "mr" ? "अजून रजिस्टर्ड नाही" : "अभी रजिस्टर्ड नहीं है"}</h2>
        <p className="text-xs mb-6" style={{ color: C.inkSoft }}>{lang === "en" ? "This mobile number doesn't have a driver account yet. Please sign up first." : lang === "mr" ? "या मोबाइल नंबरने अजून कोणतेही ड्रायव्हर खाते नाही. कृपया आधी साइन अप करा." : "इस मोबाइल नंबर से अभी तक कोई ड्राइवर खाता नहीं है। कृपया पहले साइन अप करें।"}</p>
        <button onClick={() => setMode("signup")} className="w-full rounded-lg py-4 font-bold text-base" style={{ background: C.marigold, color: "#000000" }}>
          {lang === "en" ? "Sign Up Now" : lang === "mr" ? "आत्ता साइन अप करा" : "अभी साइन अप करें"}
        </button>
      </div>
    );
  }

  if (verified && driver && !driver.vehicleSpec && driver.name === driver.mobile) {
    // STEP 2 — verified via Sign Up, and this number genuinely has no
    // details yet.
    return (
      <div className="flex-1 overflow-y-auto px-6 py-8 relative">
        {backButton}
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: C.marigold }}>
          <MapPin size={22} color="#000000" />
        </div>
        <h2 className="text-lg font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "Driver Registration" : lang === "mr" ? "ड्रायव्हर रजिस्ट्रेशन" : "ड्राइवर रजिस्ट्रेशन"}</h2>
        <p className="text-xs mb-5" style={{ color: C.inkSoft }}>{lang === "en" ? "Just this once — fill in your details to finish setting up." : lang === "mr" ? "फक्त एकदाच — सेटअप पूर्ण करण्यासाठी तुमची माहिती भरा." : "बस एक बार — सेटअप पूरा करने के लिए अपनी जानकारी भरें।"}</p>
        <div className="space-y-3">
          <GuidedStep {...regStepProps(0)} lang={lang}>
            <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Your Name" : lang === "mr" ? "तुमचे नाव" : "आपका नाम"}</label>
            <input className={fieldCls} style={fieldStyle} placeholder={lang === "en" ? "e.g. Ramesh Patel" : lang === "mr" ? "उदा: रमेश पटेल" : "जैसे: रमेश पटेल"} value={name} onChange={(e) => setName(e.target.value)} />
          </GuidedStep>
        </div>
        <div className="rounded-lg p-3 mt-3" style={{ background: C.safety }}>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={acceptedDocsTerms} onChange={(e) => setAcceptedDocsTerms(e.target.checked)} className="mt-0.5 shrink-0" style={{ width: 18, height: 18 }} />
            <span className="text-[11px] font-semibold leading-snug" style={{ color: "#FFFFFF" }}>
              {lang === "en"
                ? "I confirm that keeping my vehicle's RC, insurance, fitness certificate, permit, PUC, and my driving license valid and up to date is my full responsibility as the Driver/Vehicle Owner. Apna Transport is not liable for any document deficiency or any resulting RTO/legal action, fine, or challan — full responsibility rests with me."
                : lang === "mr" ? "मी याची पुष्टी करतो/करते की माझ्या गाडीचे RC, इन्शुरन्स, फिटनेस सर्टिफिकेट, परमिट, PUC आणि माझा ड्रायव्हिंग लायसन्स वैध व अद्ययावत ठेवणे, ड्रायव्हर/गाडी मालक म्हणून, पूर्णपणे माझी जबाबदारी आहे. कोणत्याही कागदपत्राच्या कमतरतेमुळे किंवा त्यामुळे होणाऱ्या RTO/कायदेशीर कारवाई, दंड किंवा चलनासाठी अपना ट्रान्सपोर्ट जबाबदार राहणार नाही — त्याची संपूर्ण जबाबदारी माझी स्वतःची असेल." : "मैं पुष्टि करता/करती हूं कि मेरी गाड़ी की RC, इंश्योरेंस, फिटनेस सर्टिफिकेट, परमिट, PUC और मेरा ड्राइविंग लाइसेंस वैध व अपडेट रखना, ड्राइवर/गाड़ी मालिक के तौर पर, पूरी तरह मेरी जिम्मेदारी है। किसी भी दस्तावेज़ की कमी या उससे होने वाली RTO/कानूनी कार्रवाई, जुर्माने या चालान के लिए अपना ट्रांसपोर्ट जिम्मेदार नहीं होगा — इसकी पूरी जिम्मेदारी मेरी खुद की होगी।"}
            </span>
          </label>
        </div>
        {!detailsValid && <div className="text-[11px] font-semibold mt-3" style={{ color: C.safety }}>{lang === "en" ? "Fill in your name above and accept the document responsibility clause to continue" : lang === "mr" ? "पुढे जाण्यासाठी वरील नाव भरा आणि कागदपत्र जबाबदारीची अट स्वीकारा" : "आगे बढ़ने के लिए ऊपर नाम भरें और दस्तावेज़ जिम्मेदारी वाली शर्त स्वीकार करें"}</div>}
        <button onClick={completeDetails} disabled={!detailsValid} className={`w-full rounded-lg py-4 font-bold text-base mt-3 ${detailsValid ? "guided-submit-ready" : ""}`}
          style={{ background: detailsValid ? C.marigold : "#E0E0E0", color: detailsValid ? "#000000" : "#9AA3B0" }}>
          {lang === "en" ? "Continue" : lang === "mr" ? "पुढे जा" : "आगे बढ़ें"}
        </button>
      </div>
    );
  }

  if (!verified && mode === null) {
    // First screen — a plain choice, before any OTP or details. A
    // returning driver on a brand-new device/browser used to be forced to
    // re-type their whole profile just to log in; now Login goes straight
    // to OTP and Sign Up is clearly the "I'm new" path — either way lands
    // on the same underlying check (does this number have a real name on
    // file yet, or just its own mobile-number placeholder?).
    return (
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-8 py-10 relative">
        <button onClick={onLogout} className="absolute top-4 left-4 flex items-center gap-1 p-3 rounded-full shadow-sm" style={{ background: C.marigold, color: "#000000", border: `1.5px solid ${C.marigoldDeep}` }}>
          <ChevronLeft size={18} strokeWidth={3} />
        </button>
        <div className="mb-4"><Logo size={96} /></div>
        <h2 className="text-lg font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "Driver" : lang === "mr" ? "ड्रायव्हर" : "ड्राइवर"}</h2>
        <p className="text-xs text-center mb-6" style={{ color: C.inkSoft }}>{lang === "en" ? "Are you already registered, or new here?" : lang === "mr" ? "तुम्ही आधीपासून रजिस्टर्ड आहात, की नवीन आहात?" : "क्या आप पहले से रजिस्टर्ड हैं, या नए हैं?"}</p>
        <div className="w-full space-y-3">
          <button onClick={() => setMode("login")} className="w-full rounded-lg py-4 font-bold text-base" style={{ background: C.marigold, color: "#000000" }}>
            {lang === "en" ? "Login" : lang === "mr" ? "लॉगिन करा" : "लॉगिन करें"}
          </button>
          <button onClick={() => setMode("signup")} className="w-full rounded-lg py-4 font-bold text-base" style={{ background: C.paper, color: C.marigoldDeep, border: `1.5px solid ${C.marigoldDeep}` }}>
            {lang === "en" ? "Sign Up (New Driver)" : lang === "mr" ? "साइन अप करा (नवीन ड्रायव्हर)" : "साइन अप करें (नया ड्राइवर)"}
          </button>
        </div>
      </div>
    );
  }

  if (mode === "login") {
    // Login — mobile + PIN, no SMS needed except via the Forgot PIN path.
    return (
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-8 py-10 relative">
        <button onClick={() => setMode(null)} className="absolute top-4 left-4 flex items-center gap-1 p-3 rounded-full shadow-sm" style={{ background: C.marigold, color: "#000000", border: `1.5px solid ${C.marigoldDeep}` }}>
          <ChevronLeft size={18} strokeWidth={3} />
        </button>
        <div className="mb-4"><Logo size={96} /></div>
        <h2 className="text-lg font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "Driver Login" : lang === "mr" ? "ड्रायव्हर लॉगिन" : "ड्राइवर लॉगिन"}</h2>
        <p className="text-xs text-center mb-6" style={{ color: C.inkSoft }}>{lang === "en" ? "Enter your mobile number and PIN to continue." : lang === "mr" ? "सुरू ठेवण्यासाठी तुमचा मोबाइल नंबर आणि PIN टाका." : "जारी रखने के लिए अपना मोबाइल नंबर और PIN डालें।"}</p>
        <div className="w-full">
          {stage === "mobile" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg px-3" style={{ border: `1px solid ${C.line}`, background: C.paper }}>
                <Phone size={16} color={C.inkSoft} />
                <span className="text-sm" style={{ color: C.inkSoft, fontFamily: monoFont }}>+91</span>
                <input className="flex-1 py-3 text-sm outline-none" style={{ color: C.ink, fontFamily: monoFont }} placeholder={lang === "en" ? "10-digit mobile number" : lang === "mr" ? "10 अंकी मोबाइल नंबर" : "10 अंकों का मोबाइल नंबर"}
                  value={mobile} onChange={(e) => { setMobile(e.target.value.replace(/\D/g, "").slice(0, 10)); setError(""); }} />
              </div>
              {error && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{error}</div>}
              <button onClick={goToPinStage} disabled={mobile.length !== 10}
                className="w-full rounded-lg py-4 font-bold text-base" style={{ background: mobile.length === 10 ? C.marigold : "#E0E0E0", color: mobile.length === 10 ? "#000000" : "#9AA3B0" }}>
                {lang === "en" ? "Continue" : lang === "mr" ? "पुढे जा" : "आगे बढ़ें"}
              </button>
            </div>
          ) : forgotOpen ? (
            forgotStage === "otp" ? (
              <div className="space-y-3">
                <p className="text-[11px]" style={{ color: C.inkSoft }}>{lang === "en" ? `OTP sent to +91${mobile} to verify it's really you.` : lang === "mr" ? `तुम्हीच आहात याची खात्री करण्यासाठी +91${mobile} वर OTP पाठवला.` : `यह सच में आप हैं यह जांचने के लिए +91${mobile} पर OTP भेजा गया।`}</p>
                <div className="flex items-center gap-2 rounded-lg px-3" style={{ border: `1px solid ${C.line}`, background: C.paper }}>
                  <ShieldCheck size={16} color={C.inkSoft} />
                  <input className={otpInputCls} style={{ ...otpInputStyle, border: "none", color: forgotOtp ? "#000000" : "#C7B8B3" }} placeholder="• • • • • •" value={forgotOtp}
                    onChange={(e) => { setForgotOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setForgotError(""); }} />
                </div>
                {forgotError && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{forgotError}</div>}
                <button onClick={verifyForgotOtp} disabled={forgotOtp.length !== 6 || forgotSending}
                  className="w-full rounded-lg py-4 font-bold text-base" style={{ background: forgotOtp.length === 6 && !forgotSending ? C.marigold : "#E0E0E0", color: forgotOtp.length === 6 && !forgotSending ? "#000000" : "#9AA3B0" }}>
                  {forgotSending ? (lang === "en" ? "Verifying..." : lang === "mr" ? "व्हेरिफाय होत आहे..." : "वेरीफाई हो रहा है...") : (lang === "en" ? "Verify" : lang === "mr" ? "व्हेरिफाय करा" : "वेरीफाई करें")}
                </button>
                <div className="flex items-center justify-between">
                  <button onClick={() => { setForgotOpen(false); setForgotError(""); }} className="text-sm font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "Cancel" : lang === "mr" ? "रद्द करा" : "रद्द करें"}</button>
                  <button onClick={openForgotPin} disabled={forgotSending} className="text-sm font-semibold" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Resend OTP" : lang === "mr" ? "OTP पुन्हा पाठवा" : "OTP दोबारा भेजें"}</button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-bold" style={{ color: C.success }}>{lang === "en" ? "Number verified — now set a new PIN." : lang === "mr" ? "नंबर व्हेरिफाय झाला — आता नवीन PIN सेट करा." : "नंबर वेरीफाई हो गया — अब नया PIN सेट करें।"}</p>
                <input className={otpInputCls} style={{ ...otpInputStyle, color: forgotNewPin ? "#000000" : "#C7B8B3" }} placeholder={lang === "en" ? "New 4-digit PIN" : lang === "mr" ? "नवीन 4-अंकी PIN" : "नया 4-अंकों का PIN"}
                  value={forgotNewPin} onChange={(e) => { setForgotNewPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setForgotError(""); }} />
                <input className={otpInputCls} style={{ ...otpInputStyle, color: forgotNewPinConfirm ? "#000000" : "#C7B8B3" }} placeholder={lang === "en" ? "Confirm new PIN" : lang === "mr" ? "नवीन PIN कन्फर्म करा" : "नया PIN कन्फर्म करें"}
                  value={forgotNewPinConfirm} onChange={(e) => { setForgotNewPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 4)); setForgotError(""); }} />
                {forgotNewPin && forgotNewPinConfirm && forgotNewPin !== forgotNewPinConfirm && (
                  <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{lang === "en" ? "PINs don't match" : lang === "mr" ? "PIN जुळत नाहीत" : "PIN मेल नहीं खाते"}</div>
                )}
                {forgotError && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{forgotError}</div>}
                <button onClick={submitForgotNewPin} disabled={forgotNewPin.length !== 4 || forgotNewPin !== forgotNewPinConfirm || forgotSending}
                  className="w-full rounded-lg py-4 font-bold text-base" style={{ background: forgotNewPin.length === 4 && forgotNewPin === forgotNewPinConfirm && !forgotSending ? C.marigold : "#E0E0E0", color: forgotNewPin.length === 4 && forgotNewPin === forgotNewPinConfirm && !forgotSending ? "#000000" : "#9AA3B0" }}>
                  {forgotSending ? (lang === "en" ? "Saving..." : lang === "mr" ? "सेव्ह होत आहे..." : "सेव हो रहा है...") : (lang === "en" ? "Save & Continue" : lang === "mr" ? "सेव्ह करा आणि पुढे जा" : "सेव करें और आगे बढ़ें")}
                </button>
              </div>
            )
          ) : (
            <div className="space-y-3">
              <input className={otpInputCls} style={{ ...otpInputStyle, color: pin ? "#000000" : "#C7B8B3" }} placeholder={lang === "en" ? "4-digit PIN" : lang === "mr" ? "4-अंकी PIN" : "4-अंकों का PIN"}
                value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setError(""); }} />
              {error && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{error}</div>}
              <button onClick={submitPin} disabled={pin.length !== 4 || sending}
                className="w-full rounded-lg py-4 font-bold text-base" style={{ background: pin.length === 4 && !sending ? C.marigold : "#E0E0E0", color: pin.length === 4 && !sending ? "#000000" : "#9AA3B0" }}>
                {sending ? (lang === "en" ? "Logging in..." : lang === "mr" ? "लॉगिन होत आहे..." : "लॉगिन हो रहा है...") : (lang === "en" ? "Login" : lang === "mr" ? "लॉगिन करा" : "लॉगिन करें")}
              </button>
              <div className="flex items-center justify-between">
                <button onClick={() => { setStage("mobile"); setError(""); }} className="text-sm font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "Change number" : lang === "mr" ? "नंबर बदला" : "नंबर बदलें"}</button>
                <button onClick={openForgotPin} disabled={forgotSending} className="text-sm font-semibold" style={{ color: C.marigoldDeep }}>{forgotSending ? (lang === "en" ? "Sending..." : lang === "mr" ? "पाठवले जात आहे..." : "भेजा जा रहा है...") : (lang === "en" ? "Forgot PIN?" : lang === "mr" ? "PIN विसरलात?" : "PIN भूल गए?")}</button>
              </div>
              {forgotError && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{forgotError}</div>}
            </div>
          )}
        </div>
        <div id="recaptcha-forgot-pin-driver" />
      </div>
    );
  }

  // Sign Up — the registration form comes first, with mobile/OTP
  // verification at the bottom of this same page.
  return (
    <div className="flex-1 overflow-y-auto px-6 py-8 relative">
      <button onClick={() => setMode(null)} className="flex items-center gap-1 mb-4 p-3 rounded-full shadow-sm" style={{ background: C.marigold, color: "#000000", border: `1.5px solid ${C.marigoldDeep}` }}>
        <ChevronLeft size={18} strokeWidth={3} />
      </button>
      <div className="mb-4"><Logo size={96} /></div>
      <h2 className="text-lg font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "Driver Sign Up" : lang === "mr" ? "ड्रायव्हर साइन अप" : "ड्राइवर साइन अप"}</h2>
      <p className="text-xs mb-5" style={{ color: C.inkSoft }}>
        {lang === "en" ? "Step 1 of 2 — Fill in your details, then set a PIN below." : lang === "mr" ? "स्टेप 1 / 2 — तुमची माहिती भरा, नंतर खाली PIN सेट करा." : "स्टेप 1 / 2 — अपनी जानकारी भरें, फिर नीचे PIN सेट करें।"}
      </p>

      <div className="space-y-3">
        <GuidedStep {...regStepProps(0)} lang={lang}>
          <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Your Name" : lang === "mr" ? "तुमचे नाव" : "आपका नाम"}</label>
          <input className={fieldCls} style={fieldStyle} placeholder={lang === "en" ? "e.g. Ramesh Patel" : lang === "mr" ? "उदा: रमेश पटेल" : "जैसे: रमेश पटेल"} value={name} onChange={(e) => setName(e.target.value)} />
        </GuidedStep>
      </div>

      <div className="rounded-lg p-3 mt-3" style={{ background: C.safety }}>
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={acceptedDocsTerms} onChange={(e) => setAcceptedDocsTerms(e.target.checked)} className="mt-0.5 shrink-0" style={{ width: 18, height: 18 }} />
          <span className="text-[11px] font-semibold leading-snug" style={{ color: "#FFFFFF" }}>
            {lang === "en"
              ? "I confirm that keeping my vehicle's RC, insurance, fitness certificate, permit, PUC, and my driving license valid and up to date is my full responsibility as the Driver/Vehicle Owner. Apna Transport is not liable for any document deficiency or any resulting RTO/legal action, fine, or challan — full responsibility rests with me."
              : lang === "mr" ? "मी याची पुष्टी करतो/करते की माझ्या गाडीचे RC, इन्शुरन्स, फिटनेस सर्टिफिकेट, परमिट, PUC आणि माझा ड्रायव्हिंग लायसन्स वैध व अद्ययावत ठेवणे, ड्रायव्हर/गाडी मालक म्हणून, पूर्णपणे माझी जबाबदारी आहे. कोणत्याही कागदपत्राच्या कमतरतेमुळे किंवा त्यामुळे होणाऱ्या RTO/कायदेशीर कारवाई, दंड किंवा चलनासाठी अपना ट्रान्सपोर्ट जबाबदार राहणार नाही — त्याची संपूर्ण जबाबदारी माझी स्वतःची असेल." : "मैं पुष्टि करता/करती हूं कि मेरी गाड़ी की RC, इंश्योरेंस, फिटनेस सर्टिफिकेट, परमिट, PUC और मेरा ड्राइविंग लाइसेंस वैध व अपडेट रखना, ड्राइवर/गाड़ी मालिक के तौर पर, पूरी तरह मेरी जिम्मेदारी है। किसी भी दस्तावेज़ की कमी या उससे होने वाली RTO/कानूनी कार्रवाई, जुर्माने या चालान के लिए अपना ट्रांसपोर्ट जिम्मेदार नहीं होगा — इसकी पूरी जिम्मेदारी मेरी खुद की होगी।"}
          </span>
        </label>
      </div>

      <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${C.line}` }}>
        <div className="text-[11px] font-bold mb-2" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Set Up Login" : lang === "mr" ? "लॉगिन सेट करा" : "लॉगिन सेट करें"}</div>
        {stage === "mobile" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg px-3" style={{ border: `1px solid ${C.line}`, background: C.paper }}>
                <Phone size={16} color={C.inkSoft} />
                <span className="text-sm" style={{ color: C.inkSoft, fontFamily: monoFont }}>+91</span>
                <input className="flex-1 py-3 text-sm outline-none" style={{ color: C.ink, fontFamily: monoFont }} placeholder={lang === "en" ? "10-digit mobile number" : lang === "mr" ? "10 अंकी मोबाइल नंबर" : "10 अंकों का मोबाइल नंबर"}
                  value={mobile} onChange={(e) => { setMobile(e.target.value.replace(/\D/g, "").slice(0, 10)); setError(""); }} />
              </div>
              {!detailsValid && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{lang === "en" ? "Fill in your name above and accept the document responsibility clause first" : lang === "mr" ? "आधी वरील नाव भरा आणि कागदपत्र जबाबदारीची अट स्वीकारा" : "पहले ऊपर नाम भरें और दस्तावेज़ जिम्मेदारी वाली शर्त स्वीकार करें"}</div>}
              {error && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{error}</div>}
              <button onClick={goToPinStage} disabled={!detailsValid || mobile.length !== 10}
                className={`w-full rounded-lg py-4 font-bold text-base ${detailsValid && mobile.length === 10 ? "guided-submit-ready" : ""}`} style={{ background: detailsValid && mobile.length === 10 ? C.marigold : "#E0E0E0", color: detailsValid && mobile.length === 10 ? "#000000" : "#9AA3B0" }}>
                {lang === "en" ? "Continue" : lang === "mr" ? "पुढे जा" : "आगे बढ़ें"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[11px]" style={{ color: C.inkSoft }}>{lang === "en" ? "Set a 4-digit PIN you'll use to log in next time." : lang === "mr" ? "पुढच्या वेळी लॉगिनसाठी वापरण्यासाठी 4-अंकी PIN सेट करा." : "अगली बार लॉगिन के लिए इस्तेमाल होने वाला 4-अंकों का PIN सेट करें।"}</p>
              <input className={otpInputCls} style={{ ...otpInputStyle, color: pin ? "#000000" : "#C7B8B3" }} placeholder={lang === "en" ? "4-digit PIN" : lang === "mr" ? "4-अंकी PIN" : "4-अंकों का PIN"}
                value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setError(""); }} />
              <input className={otpInputCls} style={{ ...otpInputStyle, color: pinConfirm ? "#000000" : "#C7B8B3" }} placeholder={lang === "en" ? "Confirm PIN" : lang === "mr" ? "PIN कन्फर्म करा" : "PIN कन्फर्म करें"}
                value={pinConfirm} onChange={(e) => { setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 4)); setError(""); }} />
              {pin && pinConfirm && pin !== pinConfirm && (
                <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{lang === "en" ? "PINs don't match" : lang === "mr" ? "PIN जुळत नाहीत" : "PIN मेल नहीं खाते"}</div>
              )}
              {error && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{error}</div>}
              <button onClick={submitPin} disabled={pin.length !== 4 || pin !== pinConfirm || sending}
                className="w-full rounded-lg py-4 font-bold text-base" style={{ background: pin.length === 4 && pin === pinConfirm && !sending ? C.marigold : "#E0E0E0", color: pin.length === 4 && pin === pinConfirm && !sending ? "#000000" : "#9AA3B0" }}>
                {sending ? (lang === "en" ? "Creating account..." : lang === "mr" ? "खाते तयार होत आहे..." : "खाता बन रहा है...") : (lang === "en" ? "Create Account" : lang === "mr" ? "खाते तयार करा" : "खाता बनाएं")}
              </button>
              <button onClick={() => { setStage("mobile"); setError(""); }} className="text-sm font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "Change number" : lang === "mr" ? "नंबर बदला" : "नंबर बदलें"}</button>
            </div>
          )}
      </div>
    </div>
  );
}

// =====================================================================
// DRIVER KYC PORTAL — a standalone route (?driverKyc=1&mobile=...),
// reached only via the "Send" button/WhatsApp link on Admin's KYC desk
// (AdminKyc), separate from the normal role-select/app flow entirely.
// No login or OTP step at all — the link is personalized per driver (the
// mobile is right there in the URL), and Firestore's rules allow reading
// and writing that one driver's doc without any auth as long as their
// KYC is still empty (see firestore.rules: drivers/{mobile} — closes
// again the moment vehicleSpec is set, so a stale/forwarded link can't
// be used to tamper with an already-submitted KYC). Fetches that single
// doc directly (not the admin-only full driver list) so it works for a
// genuinely unauthenticated visitor. Reuses DriverOnboarding/DriverKyc
// for the actual document-upload form (and, on the rare account that
// somehow still has no personal details on file, that same step-1 form).
// =====================================================================
function DriverKycPortal({ lang, vehicleTypes, addVehicleType }) {
  const mobile = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("mobile") : null;
  const [portalDriver, setPortalDriverState] = useState(undefined); // undefined = still loading, null = not found
  useEffect(() => {
    if (!firestoreReady || !mobile) { setPortalDriverState(null); return; }
    return subscribeDoc("drivers", mobile, setPortalDriverState);
  }, [mobile]);
  const setPortalDriver = (updater) => {
    if (!portalDriver) return;
    const next = typeof updater === "function" ? updater(portalDriver) : updater;
    if (firestoreReady && mobile) replaceDoc("drivers", mobile, next).catch((e) => console.error("[driver kyc portal save]", e));
  };
  // DriverOnboarding's own back button normally logs out of the app — not
  // meaningful here (there's no login to leave). Repurposed instead to
  // step back to a plain name-review screen, since this is the only
  // "step 1" left to recheck once KYC (step 2) is showing.
  const [editingName, setEditingName] = useState(false);

  return (
    <div className="min-h-screen flex justify-center" style={{ background: "#E5E5E5", fontFamily: bodyFont }}>
      <div className="w-full max-w-sm min-h-screen flex flex-col" style={{ background: C.bg }}>
        <div className="px-5 pt-6 pb-4" style={{ background: C.navy }}>
          <div className="flex items-center gap-2">
            <Logo size={64} />
            <div translate="no" className="text-white font-bold text-lg leading-none truncate">
              {lang === "en" ? "Apna Transport" : lang === "mr" ? "अपना ट्रान्सपोर्ट" : "अपना ट्रांसपोर्ट"}
            </div>
          </div>
        </div>
        <div className="px-5 py-3" style={{ background: C.safety }}>
          <p className="text-xs font-bold text-center" style={{ color: "#FFFFFF" }}>
            {lang === "en"
              ? "⚠️ Completing your KYC is mandatory to receive new loads."
              : lang === "mr"
              ? "⚠️ नवीन लोड मिळवण्यासाठी तुमची KYC पूर्ण करणे अनिवार्य आहे."
              : "⚠️ नए लोड पाने के लिए अपनी KYC पूरी करना अनिवार्य है।"}
          </p>
        </div>
        {!mobile || portalDriver === null ? (
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: C.safety }}>
              <XCircle size={26} color="#FFFFFF" />
            </div>
            <h2 className="text-lg font-bold mb-1" style={{ color: C.ink }}>
              {lang === "en" ? "No driver account found" : lang === "mr" ? "कोणतेही ड्रायव्हर खाते सापडले नाही" : "कोई ड्राइवर खाता नहीं मिला"}
            </h2>
            <p className="text-xs" style={{ color: C.inkSoft }}>
              {lang === "en" ? "This link looks incomplete or incorrect." : lang === "mr" ? "ही लिंक अपूर्ण किंवा चुकीची वाटते." : "यह लिंक अधूरी या गलत लगती है।"}
            </p>
          </div>
        ) : portalDriver === undefined ? (
          <div className="flex-1 flex items-center justify-center px-8 text-center">
            <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Loading..." : lang === "mr" ? "लोड होत आहे..." : "लोड हो रहा है..."}</p>
          </div>
        ) : portalDriver.vehicleSpec ? (
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: C.success }}>
              <CheckCircle2 size={26} color="#FFFFFF" />
            </div>
            <h2 className="text-lg font-bold mb-1" style={{ color: C.ink }}>
              {lang === "en" ? "Your KYC is already on file" : lang === "mr" ? "तुमची KYC आधीच जमा आहे" : "आपकी KYC पहले से जमा है"}
            </h2>
            <p className="text-xs" style={{ color: C.inkSoft }}>
              {lang === "en" ? "Nothing more to do here — you can close this page." : lang === "mr" ? "इथे आणखी काही करायचे नाही — तुम्ही हे पेज बंद करू शकता." : "यहां और कुछ करने की जरूरत नहीं — आप यह पेज बंद कर सकते हैं।"}
            </p>
          </div>
        ) : editingName ? (
          <DriverKycPortalNameEdit driver={portalDriver} setDriver={setPortalDriver} lang={lang} onDone={() => setEditingName(false)} />
        ) : (
          // driver is known (from the URL, no login needed) and just
          // hasn't submitted KYC yet — verified is a constant true (no
          // OTP screens ever render), forceMode="signup" routes straight
          // to whichever form applies (personal details, if somehow
          // still missing, then DriverKyc) without DriverOnboarding's own
          // "not registered — sign up now" interstitial in between.
          <DriverOnboarding lang={lang} authInstance={driverFirebaseAuth}
            verified={true} forceMode="signup"
            onOtpVerified={() => {}} onLogout={() => setEditingName(true)}
            driver={portalDriver} setDriver={setPortalDriver} vehicleTypes={vehicleTypes} addVehicleType={addVehicleType} />
        )}
      </div>
    </div>
  );
}

// Reached via the KYC (step 2) screen's back button inside DriverKycPortal
// — lets a driver recheck/fix their name before continuing, without any
// of DriverOnboarding's own OTP/step machinery (which assumes a first-time
// fill, not editing a value that's already saved).
function DriverKycPortalNameEdit({ driver, setDriver, lang, onDone }) {
  const [name, setName] = useState(driver?.name === driver?.mobile ? "" : (driver?.name || ""));
  const valid = name.trim().length >= 3;
  const save = () => {
    if (!valid) return;
    setDriver({ ...driver, name: name.trim() });
    onDone();
  };
  return (
    <div className="flex-1 overflow-y-auto px-6 py-8 relative">
      <button onClick={onDone} className="flex items-center gap-1 mb-4 p-3 rounded-full shadow-sm" style={{ background: C.marigold, color: "#000000", border: `1.5px solid ${C.marigoldDeep}` }}>
        <ChevronLeft size={18} strokeWidth={3} />
      </button>
      <h2 className="text-lg font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "Your Name" : lang === "mr" ? "तुमचे नाव" : "आपका नाम"}</h2>
      <p className="text-xs mb-5" style={{ color: C.inkSoft }}>{lang === "en" ? "Review or update your name." : lang === "mr" ? "तुमचे नाव तपासा किंवा बदला." : "अपना नाम जांचें या बदलें।"}</p>
      <input className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.ink }}
        placeholder={lang === "en" ? "e.g. Ramesh Patel" : lang === "mr" ? "उदा: रमेश पटेल" : "जैसे: रमेश पटेल"} value={name} onChange={(e) => setName(e.target.value)} />
      {!valid && <div className="text-[11px] font-semibold mt-2" style={{ color: C.safety }}>{lang === "en" ? "Name must be at least 3 characters" : lang === "mr" ? "नाव किमान 3 अक्षरांचे असावे" : "नाम कम से कम 3 अक्षर का होना चाहिए"}</div>}
      <button onClick={save} disabled={!valid} className="w-full rounded-lg py-4 font-bold text-base mt-4"
        style={{ background: valid ? C.marigold : "#E0E0E0", color: valid ? "#000000" : "#9AA3B0" }}>
        {lang === "en" ? "Save & Continue" : lang === "mr" ? "सेव्ह करा आणि पुढे जा" : "सेव करें और आगे बढ़ें"}
      </button>
    </div>
  );
}

// Wraps any tappable "upload a photo" tile — tapping it opens an action
// sheet asking Take Photo vs Choose from Library, instead of jumping
// straight to the OS file picker. Each option triggers its own hidden file
// input (one forces the camera via `capture`, the other doesn't).

// Largest source file we'll even attempt to decode. Android camera photos
// are ~2-6 MB; anything past this is an edited/downloaded/panorama file
// that risks OOM-crashing the WebView on a low-RAM phone mid-decode, so we
// reject it up front with a clear reason instead.
const MAX_PHOTO_BYTES = 25 * 1024 * 1024;

// Resizes/compresses an uploaded photo client-side and hands back the
// decoded <canvas> — shared by uploadPhoto below. Rejects with an Error
// whose .message is a stable code ("toobig" | "timeout" | "decode") so
// callers can show the driver a reason they can act on.
function resizeImageToCanvas(file, maxDim = 900) {
  return new Promise((resolve, reject) => {
    if (file && file.size > MAX_PHOTO_BYTES) { reject(new Error("toobig")); return; }
    // Hard timeout: on some Android WebViews a huge photo the decoder
    // chokes on fires neither img.onload nor img.onerror — without this the
    // promise would hang forever, leaving the KYC tile stuck on "Uploading"
    // and anyUploading permanently true so the driver can never submit.
    const timeoutId = setTimeout(() => reject(new Error("timeout")), 20000);
    const finish = (fn) => (arg) => { clearTimeout(timeoutId); fn(arg); };
    const ok = finish(resolve);
    const fail = finish((e) => reject(e instanceof Error && ["toobig", "timeout", "decode"].includes(e.message) ? e : new Error("decode")));
    const reader = new FileReader();
    reader.onerror = () => fail(new Error("decode"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => fail(new Error("decode"));
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const scale = maxDim / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          ok(canvas);
        } catch (e) {
          fail(e);
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Resizes a photo and uploads it to Firebase Storage at `path` (overwriting
// any previous photo at that same path), returning {name, url} with a real,
// permanent download URL — so profile/KYC/vehicle photos live as small
// links in Firestore instead of full images inline in every document. Falls
// back to an inline base64 data URL if Storage isn't configured, so the app
// still works before that one-time setup step is done. Returns null (never
// throws) if the file itself can't be read/decoded — e.g. a corrupted photo
// or a format the browser can't open — so callers can always clear their
// "uploading" state and show an error instead of hanging forever. Before
// returning null it calls onFail(reason) with a code ("toobig" | "timeout"
// | "decode" | "upload") so callers can tell the driver what to fix.
//
// Uses a resumable upload (uploadBytesResumable) rather than a one-shot
// uploadBytes — on the flaky mobile connections drivers actually sign up
// on, a resumable session survives brief drops instead of the whole
// attempt dying on the first blip, and its state_changed events give
// callers real bytes-transferred progress (via the optional onProgress
// callback) instead of a static "Uploading..." with no sense of whether
// it's actually moving. Still has a cap — 30s, well past what the ~50-150KB
// blob these photos compress down to should ever need even on a slow
// connection — so a genuinely dead connection still falls through to the
// base64 fallback below instead of hanging forever; cancelling the task
// makes its own 'error' branch fire rather than needing a separate race.
async function uploadPhoto(file, path, maxDim = 900, quality = 0.72, onProgress = null, onFail = null) {
  let canvas;
  try {
    canvas = await resizeImageToCanvas(file, maxDim);
  } catch (e) {
    console.error("[photo decode]", e);
    onFail?.(["toobig", "timeout", "decode"].includes(e?.message) ? e.message : "decode");
    return null;
  }
  const storage = getActiveStorage();
  if (storage) {
    try {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      const ref = storageRef(storage, path);
      const url = await new Promise((resolve, reject) => {
        const task = uploadBytesResumable(ref, blob, { contentType: "image/jpeg" });
        const timeoutId = setTimeout(() => task.cancel(), 30000);
        task.on(
          "state_changed",
          (snapshot) => onProgress?.(snapshot.totalBytes ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100) : 0),
          (err) => { clearTimeout(timeoutId); reject(err); },
          () => { clearTimeout(timeoutId); getDownloadURL(task.snapshot.ref).then(resolve, reject); }
        );
      });
      return { name: file.name, url };
    } catch (e) {
      console.error("[storage upload]", e);
    }
  }
  try {
    return { name: file.name, url: canvas.toDataURL("image/jpeg", quality) };
  } catch (e) {
    console.error("[photo base64 fallback]", e);
    onFail?.("upload");
    return null;
  }
}

// Higher-fidelity variant of uploadPhoto for scanned bill/invoice documents —
// the text needs to stay legible at a police/RTO checkpoint, so this uses a
// larger max dimension and higher JPEG quality than profile/KYC photos.
async function uploadDocumentPhoto(file, path) {
  return uploadPhoto(file, path, 1600, 0.85);
}

// Turns an uploadPhoto onFail(reason) code into a short, action-oriented
// line for a photo tile — tells the driver what actually went wrong and
// what to do about it, instead of a bare "Upload failed".
function uploadErrorInfo(reason, lang) {
  const M = {
    toobig: {
      en: "Photo is too large. Take a fresh photo instead of an edited or downloaded one.",
      hi: "फोटो बहुत बड़ी है। एडिट या डाउनलोड की हुई फोटो की जगह नई फोटो लें।",
      mr: "फोटो खूप मोठा आहे. एडिट किंवा डाउनलोड केलेल्याऐवजी नवीन फोटो घ्या.",
    },
    timeout: {
      en: "This photo is too heavy for your phone to process. Take a new photo.",
      hi: "यह फोटो आपके फोन के लिए बहुत भारी है। नई फोटो लें।",
      mr: "हा फोटो तुमच्या फोनसाठी खूप जड आहे. नवीन फोटो घ्या.",
    },
    decode: {
      en: "Couldn't open this photo — it may be damaged or an unsupported type. Take a new photo.",
      hi: "यह फोटो नहीं खुल पाई — यह खराब या असमर्थित हो सकती है। नई फोटो लें।",
      mr: "हा फोटो उघडता आला नाही — तो खराब किंवा असमर्थित असू शकतो. नवीन फोटो घ्या.",
    },
    upload: {
      en: "Upload failed — check your internet and retry.",
      hi: "अपलोड नहीं हुआ — इंटरनेट जांचें और फिर कोशिश करें।",
      mr: "अपलोड झाले नाही — इंटरनेट तपासा आणि पुन्हा प्रयत्न करा.",
    },
  };
  const m = M[reason] || M.upload;
  return lang === "en" ? m.en : lang === "mr" ? m.mr : m.hi;
}

// Uploads a file (e.g. a PDF) to Storage as-is, no resizing — used for the
// E-Way Bill when the customer picks a PDF instead of scanning a photo. No
// base64 fallback here (PDFs are too large to inline into a Firestore doc),
// so this simply fails if Storage isn't reachable.
async function uploadRawFile(file, path) {
  const storage = getActiveStorage();
  if (!storage) return null;
  try {
    const ref = storageRef(storage, path);
    const attempt = uploadBytes(ref, file, { contentType: file.type || "application/pdf" }).then(() => getDownloadURL(ref));
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Storage upload timed out")), 20000));
    const url = await Promise.race([attempt, timeout]);
    return { name: file.name, url };
  } catch (e) {
    console.error("[storage upload]", e);
    return null;
  }
}

// Renders an <img>, falling back to `fallback` if there's no src yet or the
// image fails to load (e.g. a stale blob: URL from an older upload that no
// longer resolves on this device) — avoids the browser's broken-image glyph.
function SafeImage({ src, alt = "", className, fallback = null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  if (!src || failed) return fallback;
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}

function PhotoPicker({ label, lang = "hi", onSelect, children }) {
  const [choosing, setChoosing] = useState(false);
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (f) onSelect(f);
    setChoosing(false);
    e.target.value = "";
  };

  return (
    <>
      <div onClick={() => setChoosing(true)}>{children}</div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      <input ref={libraryRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      {choosing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(92,31,31,0.55)" }} onClick={() => setChoosing(false)}>
          <div className="w-full max-w-sm rounded-t-2xl p-4" style={{ background: C.paper }} onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-bold mb-3 text-center" style={{ color: C.ink }}>{label}</div>
            <button type="button" onClick={() => cameraRef.current?.click()} className="w-full rounded-lg py-4 mb-2 font-bold text-base flex items-center justify-center gap-2" style={{ background: C.marigold, color: "#fff" }}>
              <Camera size={16} /> {lang === "en" ? "Take Photo" : lang === "mr" ? "फोटो घ्या" : "फोटो लें"}
            </button>
            <button type="button" onClick={() => libraryRef.current?.click()} className="w-full rounded-lg py-4 mb-2 font-bold text-base" style={{ background: C.paper, border: `1.5px solid ${C.line}`, color: C.ink }}>
              {lang === "en" ? "Choose from Library" : lang === "mr" ? "लायब्ररीमधून निवडा" : "लाइब्रेरी से चुनें"}
            </button>
            <button type="button" onClick={() => setChoosing(false)} className="w-full rounded-lg py-3.5 text-base font-semibold" style={{ color: C.safety }}>
              {lang === "en" ? "Cancel" : lang === "mr" ? "रद्द करा" : "रद्द करें"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// Customer-facing "Upload Documents / Send Invoice" flow — scans/uploads the
// Original invoice, Duplicate copy, and E-Way Bill (which also accepts a
// straight PDF upload), then patches them onto the booking doc. A Cloud
// Function (onBillDocumentsUploaded) picks up once all three are present,
// merges them into one PDF, and pushes an "Invoice & E-Way Bill Received"
// alert to the driver — nothing else here talks to the driver directly.
function BillDocumentsModal({ booking, onClose, lang }) {
  const existing = booking.documents || {};
  const [file, setFile] = useState(existing.file || null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const uploadFileRef = useRef(null);
  const scanInputRef = useRef(null);

  const alreadySent = !!existing.file?.url;

  const doUpload = async (f, isPdf) => {
    setUploading(true);
    setError("");
    const path = `bookings/${booking.id}/documents/invoice.${isPdf ? "pdf" : "jpg"}`;
    const result = isPdf ? await uploadRawFile(f, path) : await uploadDocumentPhoto(f, path);
    setUploading(false);
    if (!result) { setError(lang === "en" ? "Upload failed — check your connection and try again." : lang === "mr" ? "अपलोड अयशस्वी — कनेक्शन तपासा आणि पुन्हा प्रयत्न करा." : "अपलोड विफल — कनेक्शन जांचें और फिर कोशिश करें।"); return; }
    setFile({ ...result, type: isPdf ? "pdf" : "image" });
  };

  const send = async () => {
    setSending(true);
    setError("");
    try {
      await patchDoc("bookings", booking.id, { "documents.file": file });
      onClose();
    } catch (e) {
      console.error(e);
      setError(lang === "en" ? "Could not send — try again." : lang === "mr" ? "पाठवता आले नाही — पुन्हा प्रयत्न करा." : "भेजा नहीं जा सका — फिर कोशिश करें।");
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(92,31,31,0.55)" }} onClick={onClose}>
      <div className="w-full max-w-sm max-h-[88vh] overflow-y-auto rounded-t-2xl p-4" style={{ background: C.bg }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-black" style={{ color: C.ink }}>{lang === "en" ? "Send Invoice" : lang === "mr" ? "इनव्हॉइस पाठवा" : "इनवॉइस भेजें"}</h3>
          <button onClick={onClose}><X size={18} color={C.inkSoft} /></button>
        </div>

        {alreadySent && (
          <div className="rounded-lg p-2.5 mb-3 flex items-center gap-2" style={{ background: C.success }}>
            <CheckCircle2 size={14} color="#FFFFFF" />
            <span className="text-xs font-bold" style={{ color: "#FFFFFF" }}>{lang === "en" ? "Already sent to driver — you can resend to update." : lang === "mr" ? "आधीच ड्रायव्हरला पाठवले गेले आहे — अपडेटसाठी पुन्हा पाठवू शकता." : "पहले ही ड्राइवर को भेजा जा चुका है — अपडेट के लिए फिर भेज सकते हैं।"}</span>
          </div>
        )}

        <div className="rounded-xl p-3 mb-3" style={{ background: C.paper, border: `1.5px solid ${file?.url ? C.success : C.line}` }}>
          <div className="flex items-center gap-2 mb-2">
            <FileText size={16} color={file?.url ? C.success : C.marigoldDeep} className="shrink-0" />
            <span className="text-sm font-bold flex-1 min-w-0" style={{ color: C.ink }}>{lang === "en" ? "Invoice / Bill" : lang === "mr" ? "इनव्हॉइस / बिल" : "इनवॉइस / बिल"}</span>
            {file?.url && <CheckCircle2 size={16} color={C.success} className="shrink-0" />}
          </div>
          {file?.url && <div className="text-[11px] truncate mb-2" style={{ color: C.inkSoft }}>{file.name}</div>}
          <div className="flex gap-2">
            <button type="button" onClick={() => scanInputRef.current?.click()} className="rounded-lg py-3.5 px-3 flex items-center justify-center gap-1.5 text-base font-bold" style={{ background: C.marigoldDeep, color: "#fff" }}>
              <Camera size={16} /> {file?.url ? (lang === "en" ? "Rescan" : lang === "mr" ? "पुन्हा स्कॅन करा" : "फिर स्कैन करें") : (lang === "en" ? "Scan Document" : lang === "mr" ? "कागदपत्र स्कॅन करा" : "दस्तावेज़ स्कैन करें")}
            </button>
            {/* capture="environment" launches the camera directly — no Take
                Photo/Choose from Library sheet — since this button's whole
                job is scanning, not picking an existing photo. */}
            <input ref={scanInputRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) doUpload(f, false); e.target.value = ""; }} />
            <button type="button" onClick={() => uploadFileRef.current?.click()} className="rounded-lg py-3.5 px-3 flex items-center justify-center gap-1.5 text-base font-bold" style={{ background: C.paper, border: `1.5px solid ${C.line}`, color: C.ink }}>
              <Upload size={16} /> {lang === "en" ? "Upload Invoice" : lang === "mr" ? "इनव्हॉइस अपलोड करा" : "इनवॉइस अपलोड करें"}
            </button>
            {/* No capture attribute here — this one's for picking an
                existing file/photo, not scanning a new one. */}
            <input ref={uploadFileRef} type="file" accept="image/*,application/pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) doUpload(f, f.type === "application/pdf"); e.target.value = ""; }} />
          </div>
          {uploading && (
            <div className="text-[11px] font-semibold mt-2 flex items-center gap-1.5" style={{ color: C.marigoldDeep }}>
              <Loader2 size={12} className="animate-spin" /> {lang === "en" ? "Uploading..." : lang === "mr" ? "अपलोड होत आहे..." : "अपलोड हो रहा है..."}
            </div>
          )}
        </div>

        {error && <div className="text-xs font-bold mb-2" style={{ color: C.safety }}>{error}</div>}

        <button onClick={send} disabled={!file?.url || sending} className={`w-full rounded-xl py-4 text-base font-black text-white ${file?.url ? "shadow-lg" : ""}`}
          style={{ background: file?.url ? C.metallicGreen : "#E0E0E0", color: file?.url ? "#fff" : "#9AA3B0" }}>
          {sending ? (lang === "en" ? "Sending..." : lang === "mr" ? "पाठवले जात आहे..." : "भेजा जा रहा है...") : (lang === "en" ? "Send to Driver" : lang === "mr" ? "ड्रायव्हरला पाठवा" : "ड्राइवर को भेजें")}
        </button>
      </div>
    </div>
  );
}

// Driver-facing read-only view opened by the "Receive Bill" button — shows
// whether the invoice has arrived yet and links straight to it. Drivers
// never upload here; only the customer does, from BillDocumentsModal. Works
// both mid-ride (myTrip) and post-ride (a completed trip row), so it's a
// plain read of whatever the passed-in booking already has on its
// documents field.
function BillDocumentsViewModal({ trip, onClose, lang }) {
  const file = trip.documents?.file;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(92,31,31,0.55)" }} onClick={onClose}>
      <div className="w-full max-w-sm max-h-[88vh] overflow-y-auto rounded-t-2xl p-4" style={{ background: C.bg }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-black" style={{ color: C.ink }}>{lang === "en" ? "Receive Bill" : lang === "mr" ? "बिल मिळवा" : "बिल प्राप्त करें"}</h3>
          <button onClick={onClose}><X size={18} color={C.inkSoft} /></button>
        </div>

        {file?.url ? (
          <a href={file.url} target="_blank" rel="noreferrer" className="w-full rounded-xl py-3 text-sm font-black text-white flex items-center justify-center gap-2 shadow-lg" style={{ background: C.metallicGreen }}>
            <Download size={16} /> {lang === "en" ? "View / Download Invoice" : lang === "mr" ? "इनव्हॉइस पहा / डाउनलोड करा" : "इनवॉइस देखें / डाउनलोड करें"}
          </a>
        ) : (
          <div className="text-xs font-semibold text-center" style={{ color: C.inkSoft }}>{lang === "en" ? "Waiting for the customer to send the invoice." : lang === "mr" ? "ग्राहकाकडून इनव्हॉइस पाठवण्याची वाट पाहत आहे." : "ग्राहक द्वारा इनवॉइस भेजे जाने का इंतज़ार है।"}</div>
        )}
      </div>
    </div>
  );
}

// Pickup/Drop address field — wires Google Places Autocomplete directly onto
// the text input (live suggestion dropdown while typing) when Maps is
// configured/loaded, falling back to a plain input otherwise.
// Custom-built suggestion dropdown (AutocompleteService + Geocoder) instead
// of Google's own embedded Autocomplete widget — the native widget renders
// its own popup directly into the page, completely outside React's control,
// so there was no way to localize what it displayed (see
// stripPlusCode). This version fetches predictions itself and
// renders them as an ordinary list, so each row's text can be transliterated
// to match the app's language toggle before it's ever shown.
function LocationField({ label, value, onChange, onPlaceSelected, mapsReady, placeholder, onMic, onMapPin, onUseCurrentLocation, locating, suggestions, onSuggestionTap, lang = "hi" }) {
  const [predictions, setPredictions] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const debounceRef = useRef(null);
  const blurTimeoutRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!mapsReady || !window.google?.maps?.places?.AutocompleteService || !value.trim()) {
      setPredictions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      new window.google.maps.places.AutocompleteService().getPlacePredictions(
        { input: value, componentRestrictions: { country: "in" } },
        (preds, status) => setPredictions(status === "OK" && preds ? preds : [])
      );
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [value, mapsReady]);

  useEffect(() => () => clearTimeout(blurTimeoutRef.current), []);

  const selectPrediction = (p) => {
    setDropdownOpen(false);
    setPredictions([]);
    if (!window.google?.maps?.Geocoder) return;
    new window.google.maps.Geocoder().geocode({ placeId: p.place_id }, (results, status) => {
      const r = status === "OK" && results?.[0];
      const loc = r?.geometry?.location;
      if (!loc) return;
      onPlaceSelected({ name: stripPlusCode(r.formatted_address || p.description), lat: loc.lat(), lng: loc.lng() });
    });
  };

  const inputCls = "w-full rounded-lg py-5 text-base font-bold outline-none";
  const inputStyle = { background: C.paper, border: `1.5px solid ${C.line}`, color: C.ink, paddingLeft: 16, paddingRight: value ? 52 : 16 };
  const showDropdown = dropdownOpen && predictions.length > 0;

  return (
    <div>
      <label className="text-lg font-extrabold mb-2 block text-center" style={{ color: C.ink }}>{label}</label>
      <div className="relative w-full">
        <input className={inputCls} style={inputStyle} placeholder={placeholder} value={value}
          onChange={(e) => { onChange(e); setDropdownOpen(true); }}
          onFocus={() => setDropdownOpen(true)}
          onBlur={() => { blurTimeoutRef.current = setTimeout(() => setDropdownOpen(false), 150); }} />
        {value && (
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onChange({ target: { value: "" } })}
            className="absolute right-0 top-0 bottom-0 flex items-center justify-center" style={{ width: 44, background: "transparent" }}>
            <X size={20} color={C.inkSoft} strokeWidth={2.5} />
          </button>
        )}
        {showDropdown && (
          <div className="absolute left-0 right-0 mt-1 z-20 rounded-lg overflow-hidden max-h-64 overflow-y-auto" style={{ border: `1px solid ${C.line}`, background: C.paper, boxShadow: "0 6px 18px rgba(0,0,0,0.18)" }}>
            {predictions.map((p) => {
              const main = stripPlusCode(p.structured_formatting?.main_text || p.description);
              const secondary = stripPlusCode(p.structured_formatting?.secondary_text || "");
              return (
                <button key={p.place_id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => selectPrediction(p)}
                  className="w-full text-left px-4 py-3.5 flex items-start gap-2" style={{ borderTop: `1px solid ${C.line}` }}>
                  <MapPin size={14} color={C.marigoldDeep} className="mt-0.5 shrink-0" />
                  <span className="text-xs leading-snug">
                    <span className="font-bold" style={{ color: C.ink }}>{main}</span>
                    {secondary && <span style={{ color: C.inkSoft }}> {secondary}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {/* Clear, labeled buttons below the field instead of small icons
          crammed inside it — bigger touch targets and unambiguous at a
          glance for a first-time user. */}
      <div className="mt-2 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onMapPin} className="flex items-center justify-center gap-1.5 rounded-xl py-5 text-base font-bold" style={{ background: C.success, color: "#fff" }}>
            <MapPin size={18} /> {lang === "en" ? "Choose from Map" : lang === "mr" ? "मॅपवरून निवडा" : "मैप से चुनें"}
          </button>
          <MicButton onResult={onMic} lang={lang} label={lang === "en" ? "Speak to Enter" : lang === "mr" ? "बोलून लिहा" : "बोलकर लिखें"} />
        </div>
        {onUseCurrentLocation && (
          <button type="button" onClick={onUseCurrentLocation} disabled={locating} className="w-full flex items-center justify-center gap-1.5 rounded-xl py-5 text-base font-bold" style={{ background: C.success, color: "#fff" }}>
            <Navigation size={16} /> {locating ? (lang === "en" ? "Locating..." : lang === "mr" ? "शोधत आहोत..." : "ढूंढ रहे हैं...") : (lang === "en" ? "Use My Current Location" : lang === "mr" ? "माझे सध्याचे लोकेशन वापरा" : "मेरी वर्तमान लोकेशन इस्तेमाल करें")}
          </button>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {suggestions.map((a) => (
            <button key={a} onClick={() => onSuggestionTap(a)} className="text-sm font-semibold px-3 py-1.5 rounded-full" style={{ background: C.marigoldDeep, color: "#FFFFFF" }}>{a}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// Wraps one field/section of a multi-step form with the app-wide guided
// pattern: the active step glows amber (see .guided-step-active in
// index.css) so it's obvious what to fill next, and a green "Completed"
// badge appears the instant that step is done. `stepRef` is what the
// parent form scrolls into view when this step becomes active — see the
// auto-scroll effect in CustomerBooking for the reference implementation.
// Only a step that's neither active nor already completed is locked —
// `inert` blocks pointer, keyboard and screen-reader interaction with
// everything inside it in one shot (dropdowns, photo pickers, mic buttons
// included, no matter what's nested inside), and the dimmed opacity/
// pointer-events are a fallback for the rare browser without `inert`
// support. This forces the form forward strictly in the order shown on
// screen, while still letting the customer go back and fix an earlier,
// already-filled field at any time — editing one back to incomplete just
// re-activates it (via activeStep's findIndex in the parent) and re-locks
// whatever comes after until it's filled again.
function GuidedStep({ active, completed, stepRef, children, lang, onFocusStep, onBlurStep, onFieldInput }) {
  const locked = !active && !completed;
  // Border and padding are reserved at all times (transparent/see-through
  // when inactive) instead of only appearing once a step goes active --
  // otherwise the box's own size jumps the instant the guided highlight
  // reaches it, which is most visible when two steps sit side by side
  // (e.g. Material Type / Enter Weight) since the neighbor visibly shifts too.
  return (
    <div ref={stepRef} className={`relative rounded-2xl h-full ${active ? "guided-step-active" : ""}`}
      style={{ border: `2px solid ${active ? C.marigoldDeep : "transparent"}`, background: active ? C.marigold : "transparent", padding: 10 }}
      onFocus={onFocusStep} onBlur={onBlurStep} onInput={onFieldInput} onChange={onFieldInput}>
      <div inert={locked ? "" : undefined} className="h-full" style={locked ? { pointerEvents: "none", userSelect: "none", opacity: 0.45 } : undefined}>
        {children}
      </div>
    </div>
  );
}

// Shared by every multi-step guided form (see GuidedStep above). By default,
// the active step auto-shifts to the next field the instant the current one
// becomes complete — the original, snappy behavior every guided form except
// the driver's bid card still uses.
//
// The driver's Fare/Loading-Unloading Time/Waiting bid card (LoadAlertCard) opts into
// `pinFocus: true` instead, because naively picking the first incomplete
// field as "active" made the highlight jump away from a field the instant
// its value became non-empty/non-zero there specifically — e.g. typing
// "5000" into Fare, one digit at a time, would yank the glow to the next
// field right after the first "5", while still mid-keystroke. With
// pinFocus on, the active step stays pinned to whichever field the user is
// actually still focused in, even after it becomes "complete", and only
// really advances once focus genuinely leaves that step (a true blur — not
// just moving between two elements inside the same step). Every other
// guided form doesn't have that mid-keystroke false-positive (their fields
// don't flip "complete" on a truthy partial number), so they keep the
// plain auto-shift-on-completion behavior.
//
// autoAdvanceMs (only meaningful together with pinFocus) releases the pin
// on its own after that many quiet milliseconds — no further typing/input
// on the focused field — instead of making the customer/driver tap
// somewhere else to move on. It only ever fires while the field is
// genuinely valid at that moment; a pause on a still-incomplete field is a
// no-op (they're just thinking), and every keystroke pushes the deadline
// back out, so it can never cut off someone still actively typing.
function useGuidedSteps(stepCompleted, { pinFocus = false, autoScroll = true, autoAdvanceMs = null } = {}) {
  const [focusedStep, setFocusedStep] = useState(null);
  const rawActive = stepCompleted.findIndex((done) => !done); // -1 once all done
  const activeStep = pinFocus && focusedStep != null && stepCompleted[focusedStep] && (rawActive === -1 || rawActive > focusedStep)
    ? focusedStep
    : rawActive;
  const stepRefsHolder = useRef([]);
  stepRefsHolder.current = stepCompleted.map((_, i) => stepRefsHolder.current[i] || { current: null });
  const advanceTimerRef = useRef(null);
  const clearAdvanceTimer = () => {
    if (advanceTimerRef.current) { clearTimeout(advanceTimerRef.current); advanceTimerRef.current = null; }
  };
  // The timer callback below must NOT read stepCompleted directly out of
  // this closure: the keystroke that flips a field from invalid to valid
  // fires its onChange (updating that field's state) and bubbles to
  // onFieldInput (arming this timer) as part of one and the same native
  // event, before React has re-rendered — so armAdvanceTimer would always
  // capture the PRE-keystroke stepCompleted, permanently false for exactly
  // the keystroke that mattered. A single-digit entry (hits valid on its
  // only keystroke) never released; a multi-digit one only worked because
  // it was already valid a keystroke earlier. This ref is reassigned fresh
  // on every render (not inside an effect), so by the time the timer
  // actually fires — long after React has caught up — reading it here
  // reflects the true current validity instead of that stale snapshot.
  const stepCompletedRef = useRef(stepCompleted);
  stepCompletedRef.current = stepCompleted;
  // Set right before the timer releases the pin, so the effect below knows
  // this particular activeStep change was an auto-advance (not the user
  // manually tapping/focusing elsewhere) and should carry keyboard focus
  // along with it — a tap-away already leaves focus wherever the user put
  // it, so that path never touches this flag.
  const autoAdvancedRef = useRef(false);
  const armAdvanceTimer = (step) => {
    if (!autoAdvanceMs) return;
    clearAdvanceTimer();
    advanceTimerRef.current = setTimeout(() => {
      // Only release if that step is still the focused one AND it's
      // actually valid right now — otherwise leave the pin exactly as is.
      setFocusedStep((f) => {
        if (f === step && stepCompletedRef.current[step]) {
          autoAdvancedRef.current = true;
          return null;
        }
        return f;
      });
    }, autoAdvanceMs);
  };
  useEffect(() => clearAdvanceTimer, []);
  // Skip the very first run — a form/card that just mounted (e.g. a new
  // load alert appearing the moment a driver goes online) shouldn't yank
  // the page straight to its first field before the driver has even seen
  // what's above it. Only auto-scroll once the user has actually advanced
  // past a step themselves. autoScroll:false opts a form out of this
  // entirely — used by CustomerBooking, where scrolling the page while a
  // Pickup/Drop suggestion dropdown is open fights with the user browsing
  // that list themselves.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!autoScroll) return;
    if (!mountedRef.current) { mountedRef.current = true; return; }
    if (activeStep >= 0) stepRefsHolder.current[activeStep]?.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep, autoScroll]);
  // Carries the cursor to the next field on an auto-advance, so typing can
  // just continue without a tap — prefers a real text field over a button
  // (a photo-upload step has only the latter to fall back to).
  useEffect(() => {
    if (!autoAdvancedRef.current) return;
    autoAdvancedRef.current = false;
    if (activeStep < 0) return;
    const wrapper = stepRefsHolder.current[activeStep]?.current;
    const focusable = wrapper?.querySelector("input, select, textarea") || wrapper?.querySelector("button");
    focusable?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep]);
  const stepProps = (i) => ({
    active: activeStep === i,
    completed: stepCompleted[i],
    stepRef: stepRefsHolder.current[i],
    onFocusStep: pinFocus ? () => { setFocusedStep(i); armAdvanceTimer(i); } : undefined,
    onBlurStep: pinFocus ? (e) => { if (!e.currentTarget.contains(e.relatedTarget)) { setFocusedStep((f) => (f === i ? null : f)); clearAdvanceTimer(); } } : undefined,
    onFieldInput: pinFocus && autoAdvanceMs ? () => armAdvanceTimer(i) : undefined,
  });
  return { activeStep, stepProps };
}

// =====================================================================
// CUSTOMER APP
// =====================================================================
function CustomerBooking({ createLoad, vehicleTypes, lastBooking, lang, onModeChange }) {
  const VEHICLES = vehicleTypes;
  const [bookingMode, setBookingMode] = useState(null); // null | 'now' | 'advance'
  // Reports the current mode up to CustomerApp so it can tell whether the
  // "What do you need?" chooser (mode === null) is on screen right now —
  // that's the only place the hamburger menu should show.
  useEffect(() => { onModeChange?.(bookingMode); }, [bookingMode]);
  const [advanceDate, setAdvanceDate] = useState("");
  const [advanceTime, setAdvanceTime] = useState("");
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [pickupCoords, setPickupCoords] = useState(null); // {lat,lng} | null
  const [dropCoords, setDropCoords] = useState(null);
  // Separate from pickupCoords/dropCoords on purpose: coords also get filled
  // in silently by the debounced geocode below (for distance/booking data
  // quality) whenever someone types a full address by hand and never taps a
  // suggestion — that shouldn't count as "done" for the guided step, only an
  // actual explicit action (tapping a suggestion, the map pin, current
  // location, or Repeat Last Trip) does.
  const [pickupSelected, setPickupSelected] = useState(false);
  const [dropSelected, setDropSelected] = useState(false);
  const [vehicle, setVehicle] = useState(VEHICLES[0]?.key || "chhota");
  const [material, setMaterial] = useState("");
  // Shown only when "Others" is picked. Stored straight onto the load in
  // post(), never into a shared collection — so it stays private to this
  // customer and never becomes a suggestion for anyone else.
  const [materialOther, setMaterialOther] = useState("");
  const isOtherMaterial = material === "अन्य";
  const resolvedMaterial = isOtherMaterial ? materialOther.trim() : material;
  const [weight, setWeight] = useState("");
  const [distance, setDistance] = useState(null);
  const [mapField, setMapField] = useState(null); // 'pickup' | 'drop' | null
  const { isLoaded: mapsLoaded, hasKey: mapsHasKey } = useGoogleMaps();
  const mapsReady = mapsHasKey && mapsLoaded;

  // Guided-step highlighting for the booking fields — see GuidedStep/
  // useGuidedSteps. Each step's own state decides completion (no cross-
  // referencing another field's value), and useGuidedSteps only advances
  // once the user actually leaves a field, not the instant it becomes
  // non-empty mid-typing. The date/time step only exists in Advance mode,
  // so the array (and the index every other field is wrapped at) shifts
  // by one in that mode.
  const hasDateTimeStep = bookingMode === "advance";
  const stepOffset = hasDateTimeStep ? 1 : 0;
  // Pickup/Drop have a live suggestion dropdown, so their step only counts
  // as done once the user has actually taken an explicit action — tapped a
  // suggestion, the map pin, current location, or Repeat Last Trip (see
  // pickupSelected/dropSelected) — not just from typing, and not from the
  // silent debounced-geocode fallback further down either (that only fills
  // in coordinates for distance/booking data, it shouldn't auto-advance the
  // step on its own whenever the user pauses mid-sentence while typing).
  // Falls back to the old plain non-empty check if Maps never loaded, so a
  // Maps outage can't strand the form on this step forever. Material is a
  // <select> (no in-between typed state) and Weight is a plain number
  // field, so both still just need a non-empty value, same as before.
  const stepCompleted = [
    ...(hasDateTimeStep ? [!!advanceDate && !!advanceTime] : []),
    pickupSelected || (!mapsReady && pickup.trim().length > 0),
    dropSelected || (!mapsReady && drop.trim().length > 0),
    !!material && (!isOtherMaterial || resolvedMaterial.length > 0),
    weight.trim().length > 0,
  ];
  // autoScroll:false — see useGuidedSteps; scrolling the page while the
  // Pickup/Drop suggestion dropdown is open fights with browsing that list.
  const { activeStep, stepProps } = useGuidedSteps(stepCompleted, { autoScroll: false });

  // If the customer typed Pickup/Drop by hand without tapping an
  // Autocomplete suggestion, pickupCoords/dropCoords stay null — geocode
  // the typed text after a short pause so the distance estimate (and the
  // coordinates actually saved on the booking) are still based on the real
  // location, not left empty or guessed.
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

  // Shows the straight-line estimate immediately (no blank/loading state),
  // then silently upgrades to the real routed distance from Google's
  // Distance Matrix once it resolves — keeping the straight-line number if
  // that call fails or Maps isn't configured at all. Both stay null (no
  // banner shown) until real coordinates for both ends are known.
  const distanceRequestRef = useRef(0);
  useEffect(() => {
    setDistance(estimateDistanceKm(pickupCoords, dropCoords));
    const hasBothCoords = pickupCoords?.lat != null && pickupCoords?.lng != null && dropCoords?.lat != null && dropCoords?.lng != null;
    if (!hasBothCoords || !mapsReady) return;
    const requestId = ++distanceRequestRef.current;
    fetchRoadDistanceKm(pickupCoords, dropCoords)
      .then((km) => {
        if (distanceRequestRef.current === requestId) setDistance(Math.max(1, Math.round(km)));
      })
      .catch((e) => console.error("[distance matrix]", e));
  }, [pickupCoords, dropCoords, mapsReady]);

  const onPickupPlaceSelected = (p) => { setPickup(p.name); setPickupCoords({ lat: p.lat, lng: p.lng }); setPickupSelected(true); };
  const onDropPlaceSelected = (p) => { setDrop(p.name); setDropCoords({ lat: p.lat, lng: p.lng }); setDropSelected(true); };

  const [locatingPickup, setLocatingPickup] = useState(false);
  const useMyCurrentLocation = () => {
    if (!navigator.geolocation || locatingPickup) return;
    setLocatingPickup(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setPickupCoords({ lat: latitude, lng: longitude });
        setPickupSelected(true);
        if (mapsReady && window.google) {
          new window.google.maps.Geocoder().geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
            setPickup(status === "OK" && results?.[0] ? stripPlusCode(results[0].formatted_address) : `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
            setLocatingPickup(false);
          });
        } else {
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=16`, { headers: { Accept: "application/json" } });
            const data = await res.json();
            setPickup(stripPlusCode(data?.display_name) || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
          } catch {
            setPickup(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
          }
          setLocatingPickup(false);
        }
      },
      () => setLocatingPickup(false)
    );
  };

  // Minimum lead-time rule for Advance bookings, scaled by load weight —
  // heavier loads need more notice to actually line up a driver.
  const advanceNoticeError = (() => {
    if (bookingMode !== "advance" || !advanceDate || !advanceTime || !weight.trim()) return "";
    const scheduled = parseScheduledFor(`${advanceDate} ${advanceTime}`);
    const minHours = minAdvanceNoticeHours(Number(weight) || 0);
    const hoursUntil = (scheduled.getTime() - Date.now()) / (60 * 60 * 1000);
    if (hoursUntil >= minHours) return "";
    return lang === "en"
      ? `This weight needs at least ${minHours} hour${minHours > 1 ? "s" : ""} advance notice — please pick a later time.`
      : lang === "mr"
      ? `या वजनासाठी किमान ${minHours} तास आधी बुकिंग आवश्यक आहे — कृपया नंतरची वेळ निवडा.`
      : `इस वजन के लिए कम से कम ${minHours} घंटे पहले बुकिंग जरूरी है — कृपया बाद का समय चुनें।`;
  })();

  const canPost = pickup.trim() && drop.trim() && resolvedMaterial && weight.trim() && (bookingMode === "now" || (advanceDate && advanceTime && !advanceNoticeError));

  useEffect(() => {
    const w = Number(weight);
    if (!weight || !w) return;
    const smallFit = VEHICLES.filter((v) => v.capacityKg >= w).sort((a, b) => a.capacityKg - b.capacityKg)[0];
    if (smallFit) setVehicle(smallFit.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weight, material]);

  const post = () => {
    if (!canPost) return;
    createLoad({
      pickup, drop, vehicle, material: resolvedMaterial, weight, distance, scheduledFor: bookingMode === "advance" ? `${advanceDate} ${advanceTime}` : null,
      pickupLat: pickupCoords?.lat ?? null, pickupLng: pickupCoords?.lng ?? null,
      dropLat: dropCoords?.lat ?? null, dropLng: dropCoords?.lng ?? null,
    });
    setPickup(""); setDrop(""); setWeight(""); setBookingMode(null); setAdvanceDate(""); setAdvanceTime("");
    setPickupCoords(null); setDropCoords(null); setPickupSelected(false); setDropSelected(false);
  };

  const inputCls = "w-full rounded-lg px-3 py-2.5 text-sm font-bold outline-none";
  const inputStyle = { background: C.paper, border: `1px solid ${C.line}`, color: C.ink };

  if (!bookingMode) {
    return (
      <div className="px-5 py-8 flex flex-col justify-center" style={{ minHeight: 420 }}>
        <p className="text-base font-black text-center mb-8" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Book anything from a mini truck to a full-size truck — all across India." : lang === "mr" ? "संपूर्ण भारतात लहान ते मोठी गाडी बुक करा." : "पूरे भारत में छोटी से लेकर बड़ी गाड़ी तक बुक करें।"}</p>
        <p className="text-sm font-extrabold text-center mb-5" style={{ color: C.ink }}>{lang === "en" ? "What do you need?" : lang === "mr" ? "तुम्हाला काय हवे आहे?" : "आपको क्या चाहिए?"}</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setBookingMode("now")} className="rounded-2xl p-7 flex flex-col items-center justify-center gap-3 text-center" style={{ background: C.marigold, minHeight: 160 }}>
            <Truck size={30} color="#000000" />
            <div className="text-base font-black" style={{ color: "#000000" }}>⚡ {lang === "en" ? "Book a vehicle now" : lang === "mr" ? "आत्ता गाडी बुक करा" : "अभी गाड़ी बुक करें"}</div>
          </button>
          <button onClick={() => {
            // Pickup/Drop are shared state with "Book Now" -- if the customer
            // typed something there before backing out to switch modes,
            // starting Advance mode fresh (not silently carrying it over)
            // avoids an address meant for a right-now trip ending up on a
            // scheduled one by accident.
            setPickup(""); setDrop(""); setPickupCoords(null); setDropCoords(null); setPickupSelected(false); setDropSelected(false);
            setBookingMode("advance");
          }} className="rounded-2xl p-7 flex flex-col items-center justify-center gap-3 text-center" style={{ background: C.navy, minHeight: 160 }}>
            <Clock3 size={30} color="#fff" />
            <div className="text-base font-black text-white">📅 {lang === "en" ? "Book ride in advance" : lang === "mr" ? "अ‍ॅडव्हान्स गाडी बुक करा" : "एडवांस गाड़ी बुक करें"}</div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 pt-3 pb-5">
      <div className="flex items-center gap-2.5 mb-3">
        <button onClick={() => setBookingMode(null)} className="flex items-center gap-1 p-3 rounded-full shadow-sm shrink-0" style={{ background: C.marigold, color: "#000000", border: `1.5px solid ${C.marigoldDeep}` }}>
          <ChevronLeft size={18} strokeWidth={3} />
        </button>
        <p className="text-[11px] font-bold" style={{ color: C.inkSoft }}>{lang === "en" ? "* All fields below are mandatory" : lang === "mr" ? "* खाली दिलेली सर्व माहिती भरणे अनिवार्य आहे" : "* नीचे दिए गए सभी विवरण भरना अनिवार्य है"}</p>
      </div>
      <div className="space-y-3">
        {lastBooking && !pickup && !drop && (
          <button onClick={() => {
            setPickup(lastBooking.pickup); setDrop(lastBooking.drop);
            const hasPickupCoords = lastBooking.pickupLat != null && lastBooking.pickupLng != null;
            const hasDropCoords = lastBooking.dropLat != null && lastBooking.dropLng != null;
            setPickupCoords(hasPickupCoords ? { lat: lastBooking.pickupLat, lng: lastBooking.pickupLng } : null);
            setDropCoords(hasDropCoords ? { lat: lastBooking.dropLat, lng: lastBooking.dropLng } : null);
            setPickupSelected(hasPickupCoords);
            setDropSelected(hasDropCoords);
          }}
            className="w-full flex items-center gap-3 rounded-2xl p-4 text-left" style={{ background: C.success }}>
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#FFFFFF" }}>
              <Package size={20} color={C.success} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold" style={{ color: "#FFFFFF" }}>{lang === "en" ? "Repeat last trip" : lang === "mr" ? "मागील ट्रिप पुन्हा करा" : "पिछली ट्रिप दोहराएं"}</div>
              <div className="text-sm font-bold truncate" style={{ color: "#FFFFFF" }}>{lastBooking.pickup} → {lastBooking.drop}</div>
            </div>
            <span className="text-xs font-black shrink-0 rounded-xl px-3 py-2.5 text-center" style={{ background: "#00763C", color: "#FFFFFF" }}>{lang === "en" ? "Tap →" : lang === "mr" ? "टॅप करा →" : "टैप करें →"}</span>
          </button>
        )}
        {bookingMode === "advance" && (
          <GuidedStep {...stepProps(0)} lang={lang}>
            {/* Yellow only while this step is the one being filled — once the
                customer moves on, it settles back to a plain white card
                instead of staying highlighted forever. */}
            <div className="rounded-2xl p-3" style={{ background: stepProps(0).active ? C.marigold : C.paper }}>
              <label className="text-base font-extrabold mb-2 block text-center" style={{ color: C.ink }}>{lang === "en" ? "When do you need the vehicle?" : lang === "mr" ? "गाडी कधी हवी?" : "गाड़ी कब चाहिए?"}</label>
              <div className="grid grid-cols-3 gap-2 mb-2">
                {[1, 2, 3].map((n) => {
                  const d = new Date(Date.now() + n * 24 * 60 * 60 * 1000);
                  const iso = d.toISOString().slice(0, 10);
                  const active = advanceDate === iso;
                  return (
                    <button key={n} type="button" onClick={() => setAdvanceDate(iso)}
                      className="rounded-xl py-4 text-base font-bold text-center"
                      style={{ background: active ? C.marigoldDeep : C.paper, color: active ? "#fff" : C.ink, border: active ? "none" : `1.5px solid ${C.line}` }}>
                      {lang === "en" ? `+${n} day${n > 1 ? "s" : ""}` : lang === "mr" ? `${n} दिवसांनी` : `${n} दिन बाद`}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={advanceDate} onChange={(e) => setAdvanceDate(e.target.value)} className={inputCls} style={inputStyle} />
                <button type="button" onClick={() => setShowTimeModal(true)} className="rounded-xl px-4 py-4 flex items-center justify-center" style={inputStyle}>
                  <span className="text-sm font-bold truncate" style={{ color: C.ink }}>{advanceTime ? formatTimeSlot(advanceTime, lang) : (lang === "en" ? "Select Time" : lang === "mr" ? "वेळ निवडा" : "समय चुनें")}</span>
                </button>
              </div>
            </div>
            <TimeSlotModal open={showTimeModal} value={advanceTime} onSelect={setAdvanceTime} onClose={() => setShowTimeModal(false)} lang={lang} />
          </GuidedStep>
        )}
        <div className="space-y-4">
          <GuidedStep {...stepProps(stepOffset + 0)} lang={lang}>
            <LocationField
              label={lang === "en" ? "Choose Pickup location" : lang === "mr" ? "पिकअप ठिकाण निवडा" : "पिकअप स्थान चुनें"}
              lang={lang}
              value={pickup}
              onChange={(e) => { setPickup(e.target.value); setPickupCoords(null); setPickupSelected(false); }}
              onPlaceSelected={onPickupPlaceSelected}
              mapsReady={mapsReady}
              placeholder={lang === "en" ? "Where to pick up the load from? (Pickup)" : lang === "mr" ? "सामान कुठून उचलायचे आहे? (पिकअप)" : "सामान कहाँ से उठाना है? (पिकअप)"}
              onMic={(text) => { setPickup((p) => (p ? p + " " : "") + text); setPickupCoords(null); setPickupSelected(false); }}
              onMapPin={() => setMapField("pickup")}
              onUseCurrentLocation={useMyCurrentLocation}
              locating={locatingPickup}
              suggestions={suggestAreas(pickup)}
              onSuggestionTap={(a) => { setPickup(pickup.trim() + (pickup.trim() ? ", " : "") + a); setPickupCoords(null); setPickupSelected(false); }}
            />
          </GuidedStep>

          <GuidedStep {...stepProps(stepOffset + 1)} lang={lang}>
            <LocationField
              label={lang === "en" ? "Choose Drop location" : lang === "mr" ? "ड्रॉप ठिकाण निवडा" : "ड्रॉप स्थान चुनें"}
              lang={lang}
              value={drop}
              onChange={(e) => { setDrop(e.target.value); setDropCoords(null); setDropSelected(false); }}
              onPlaceSelected={onDropPlaceSelected}
              mapsReady={mapsReady}
              placeholder={lang === "en" ? "Where to unload the goods? (Drop)" : lang === "mr" ? "सामान कुठे उतरवायचे आहे? (ड्रॉप)" : "सामान कहाँ उतारना है? (ड्रॉप)"}
              onMic={(text) => { setDrop((d) => (d ? d + " " : "") + text); setDropCoords(null); setDropSelected(false); }}
              onMapPin={() => setMapField("drop")}
              suggestions={suggestAreas(drop)}
              onSuggestionTap={(a) => { setDrop(drop.trim() + (drop.trim() ? ", " : "") + a); setDropCoords(null); setDropSelected(false); }}
            />
          </GuidedStep>
        </div>

        <div className="grid grid-cols-2 gap-3 items-start">
          <GuidedStep {...stepProps(stepOffset + 2)} lang={lang}>
            <label className="text-sm font-extrabold mb-1 block text-center" style={{ color: C.ink }}>{lang === "en" ? "Material Type" : lang === "mr" ? "मटेरियल टाइप" : "मटेरियल टाइप"}</label>
            <select className={inputCls} style={{ ...inputStyle, color: material ? inputStyle.color : "#9AA3B0" }} value={material}
              onChange={(e) => setMaterial(e.target.value)}>
              <option value="" disabled style={{ color: "#9AA3B0" }}>{lang === "en" ? "Select material" : lang === "mr" ? "मटेरियल निवडा" : "मटेरियल चुनें"}</option>
              {MATERIALS.map((m) => <option key={m} value={m} style={{ color: C.ink }}>{m === "अन्य" ? (ADD_MATERIAL_LABEL[lang] || ADD_MATERIAL_LABEL.hi) : materialLabel(m, lang)}</option>)}
            </select>
            {isOtherMaterial && (
              <input className={inputCls} style={{ ...inputStyle, marginTop: 6 }} autoFocus
                placeholder={lang === "en" ? "Type the material" : lang === "mr" ? "मटेरियल टाइप करा" : "मटेरियल टाइप करें"}
                value={materialOther} onChange={(e) => setMaterialOther(e.target.value)} />
            )}
          </GuidedStep>
          <GuidedStep {...stepProps(stepOffset + 3)} lang={lang}>
            <label className="text-sm font-extrabold mb-1 block text-center" style={{ color: C.ink }}>{lang === "en" ? "Enter Weight (kg)" : lang === "mr" ? "वजन टाका (किलोग्राम)" : "वजन डालें (किलोग्राम)"}</label>
            <input className={inputCls} style={inputStyle} placeholder={lang === "en" ? "e.g. 300 kg" : lang === "mr" ? "उदा: 300 किलो" : "जैसे: 300 किग्रा"} value={weight} onChange={(e) => setWeight(e.target.value.replace(/\D/g, ""))} />
          </GuidedStep>
        </div>

        {distance !== null && (
          <div className="rounded-lg p-2.5 shadow-sm flex items-center gap-2" style={{ background: "#F5F3EE", border: `1px solid ${C.line}` }}>
            <Navigation size={16} color="#000000" />
            <span className="text-base font-bold" style={{ color: C.ink }}>{lang === "en" ? "Estimated distance" : lang === "mr" ? "अंदाजे अंतर" : "अनुमानित दूरी"}: {distance} {lang === "en" ? "km" : lang === "mr" ? "किमी" : "किमी"}</span>
          </div>
        )}

        {advanceNoticeError && (
          <div className="rounded-lg p-2.5 text-xs font-bold text-center" style={{ background: C.safety, color: "#FFFFFF" }}>{advanceNoticeError}</div>
        )}

        <button onClick={post} disabled={!canPost} className={`w-full rounded-xl py-5 font-extrabold text-xl flex items-center justify-center gap-2 ${canPost ? "guided-submit-ready" : ""}`}
          style={{ background: canPost ? C.success : "#E0E0E0", color: canPost ? "#fff" : "#9AA3B0" }}>
          🚚 {lang === "en" ? "Book Now" : lang === "mr" ? "आत्ता बुक करा" : "अभी बुक करें"}
        </button>
      </div>

      {mapField && (
        <LocationPicker
          lang={lang}
          onClose={() => setMapField(null)}
          onConfirm={(address, lat, lng) => {
            const coords = lat != null && lng != null ? { lat, lng } : null;
            if (mapField === "pickup") { setPickup(address); setPickupCoords(coords); setPickupSelected(coords != null); }
            else { setDrop(address); setDropCoords(coords); setDropSelected(coords != null); }
            setMapField(null);
          }}
        />
      )}
    </div>
  );
}

// Bold From/To route line with pickup/drop dots — used in booking lists so
// the route is the most visually prominent thing on the card.
function RouteLine({ pickup, drop, lang }) {
  return (
    <div className="flex items-stretch gap-2.5 my-1.5">
      <div className="flex flex-col items-center pt-1">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: C.marigoldDeep }} />
        <span className="flex-1 my-0.5" style={{ width: 2, background: C.line, minHeight: 16 }} />
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: C.safety }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[9px] font-bold uppercase tracking-wide" style={{ color: C.inkSoft }}>{lang === "en" ? "Pickup" : lang === "mr" ? "पिकअप" : "पिकअप"}</div>
        <div className="text-sm font-bold leading-snug" style={{ color: C.ink }}>{pickup}</div>
        <div className="text-[9px] font-bold uppercase tracking-wide mt-1.5" style={{ color: C.inkSoft }}>{lang === "en" ? "Drop" : lang === "mr" ? "ड्रॉप" : "ड्रॉप"}</div>
        <div className="text-sm font-bold leading-snug" style={{ color: C.ink }}>{drop}</div>
      </div>
    </div>
  );
}

// Full-width, high-contrast banner stating plainly whether a load/booking
// is an Immediate or Advance ride, plus its date/time — deliberately big
// and bold rather than a small pill, so it's the first thing anyone sees
// on any screen showing load/booking details, for both Customer and Driver.
function RideTypeBanner({ booking, lang }) {
  const advance = !!booking.scheduledFor;
  return (
    <div className="w-full rounded-xl px-4 py-3.5 mb-3 flex items-center justify-center gap-2.5 text-center" style={{ background: advance ? C.marigoldDeep : C.success }}>
      <Clock3 size={20} color="#fff" strokeWidth={2.5} />
      <span className="text-sm sm:text-base font-extrabold text-white tracking-wide">
        {advance ? (lang === "en" ? "Advance Ride" : lang === "mr" ? "अ‍ॅडव्हान्स राइड" : "एडवांस राइड") : (lang === "en" ? "Immediate Ride" : lang === "mr" ? "तात्काळ राइड" : "तुरंत राइड")} · {rideDateTimeLabel(booking)}
      </span>
    </div>
  );
}

// Shows a single active (Bidding or Ongoing) booking — the customer's main
// page focuses on this one card instead of a separate "My Rides" tab.
function ActiveRide({ booking: b, vehicleTypes, cancelBooking, acceptBid, driverVehicle, drivers, lang, onAddAnother, onBidAccepted }) {
  const VEHICLES = vehicleTypes;
  const [selectedBid, setSelectedBid] = useState(null);
  const [acceptError, setAcceptError] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [showDocs, setShowDocs] = useState(false);
  const docsSent = !!b.documents?.file?.url;

  // Computed unconditionally (not just inside the b.status === "Bidding"
  // branch below) purely so useFlipListAnimation — a hook — can be called
  // unconditionally too, with the right ordering, on every render.
  const sortedBids = b.status === "Bidding" ? (b.bids || []).filter((x) => !x.paused).sort((x, y) => x.amount - y.amount || (y.hours || 0) - (x.hours || 0)) : [];
  const selectedId = selectedBid;
  // Once the customer taps a bid, it jumps to the top of the list — makes
  // the screen visibly "settle" around their choice instead of leaving it
  // wherever price-sorting happened to place it (which could be buried in
  // the scrollable rest, far from the Book button that now appears right
  // under it). The true lowest-price bid still keeps its "Lowest bid" tag
  // even if it's no longer the one on top.
  const displayBids = selectedId
    ? [...sortedBids.filter((x) => x.id === selectedId), ...sortedBids.filter((x) => x.id !== selectedId)]
    : sortedBids;
  const lowestBidId = sortedBids[0]?.id;
  // Animates the jump-to-top above as a smooth slide instead of an instant
  // snap — see useFlipListAnimation. bidsListRef is attached to the shared
  // wrapper around both the pinned top bid and the scrollable rest below,
  // so the technique still works even though the moving card physically
  // reparents between those two containers.
  const bidsListRef = useRef(null);
  useFlipListAnimation(bidsListRef, displayBids.map((x) => x.id));

  const shareTrip = () => {
    const text = lang === "en"
      ? `My goods are moving via Apna Transport.\nBooking: ${b.id}\nDriver: ${b.driverName || "—"}\nVehicle Number: ${driverVehicle?.vehicleNumber || "—"}\nRoute: ${b.pickup} → ${b.drop}\nStatus: ${b.progress}% complete`
      : lang === "mr"
      ? `माझे सामान अपना ट्रान्सपोर्टद्वारे जात आहे.\nबुकिंग: ${b.id}\nड्रायव्हर: ${b.driverName || "—"}\nगाडी नंबर: ${driverVehicle?.vehicleNumber || "—"}\nरूट: ${b.pickup} → ${b.drop}\nस्टेटस: ${b.progress}% पूर्ण`
      : `मेरा सामान अपना ट्रांसपोर्ट से जा रहा है।\nबुकिंग: ${b.id}\nड्राइवर: ${b.driverName || "—"}\nगाड़ी नंबर: ${driverVehicle?.vehicleNumber || "—"}\nरूट: ${b.pickup} → ${b.drop}\nस्टेटस: ${b.progress}% पूरा`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  if (b.status === "Bidding") {
    // Each bid comes from a driver who may have a different vehicle type,
    // so the vehicle shown per bid is that driver's own — never the load's
    // pre-suggested type, since the customer never confirmed one.
    const bidRow = (bid, isLowest) => {
      const isSelected = selectedId === bid.id;
      const bidDriver = drivers.find((d) => d.name === bid.driverName);
      const bidVehicleType = VEHICLES.find((vt) => vt.key === bidDriver?.vehicleSpec?.type);
      return (
        <React.Fragment key={bid.id}>
        <div onClick={() => setSelectedBid(bid.id)} data-flip-id={bid.id}
          className="w-full text-left rounded-xl p-3 relative cursor-pointer"
          style={{ background: C.paper, border: `${isSelected ? 2.5 : 1.5}px solid ${isSelected ? C.marigoldDeep : isLowest ? C.success : C.marigoldDeep}` }}>
          {isLowest && <span className="absolute -top-2 left-3 text-[9px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: C.success }}>{lang === "en" ? "Lowest bid" : lang === "mr" ? "सर्वात कमी बोली" : "सबसे कम बोली"}</span>}
          <div className="flex items-center gap-3 mt-1">
            <SafeImage
              src={bidDriver?.vehicleSpec?.photoSide?.url}
              alt={lang === "en" ? `${vehicleLabel(bidVehicleType, lang)} - Side` : lang === "mr" ? `${vehicleLabel(bidVehicleType, lang)} - बाजू` : `${vehicleLabel(bidVehicleType, lang)} - साइड`}
              className="w-14 h-14 rounded-lg object-cover shrink-0"
              fallback={
                <div className="w-14 h-14 rounded-lg flex items-center justify-center shrink-0" style={{ background: isSelected ? C.marigoldDeep : isLowest ? C.success : C.marigoldDeep }}>
                  <Truck size={22} color="#fff" />
                </div>
              }
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold truncate" style={{ color: C.ink }}>{vehicleLabel(bidVehicleType, lang) || bid.driverName}</div>
              {bid.distanceKm != null && <div className="text-[10px] truncate" style={{ color: C.inkSoft }}>{bid.distanceKm} {lang === "en" ? "km away" : lang === "mr" ? "किमी दूर" : "किमी दूर"}</div>}
              {bidVehicleType && <div className="text-[9px]" style={{ color: C.inkSoft, fontFamily: monoFont }}>{vehicleCapacity(bidVehicleType, lang)}</div>}
            </div>
            <div className="text-right shrink-0">
              <div className="text-base font-bold" style={{ color: "#000000" }}>{fmt(bid.amount)}</div>
            </div>
          </div>
          {(bid.hours || bid.extraHourRate) && (
            <div className="text-xs font-bold mt-1.5 pt-1.5" style={{ color: C.ink, borderTop: `1px solid ${C.marigoldDeep}` }}>
              {bid.hours ? (lang === "en" ? `${bid.hours} hrs loading/unloading · ` : lang === "mr" ? `${bid.hours} तास लोडिंग/अनलोडिंग · ` : `${bid.hours} घंटे लोडिंग/अनलोडिंग · `) : ""}
              {bid.extraHourRate ? (lang === "en" ? `then ${fmt(bid.extraHourRate)}/hr waiting charge` : lang === "mr" ? `त्यानंतर ${fmt(bid.extraHourRate)}/तास वेटिंग चार्ज` : `उसके बाद ${fmt(bid.extraHourRate)}/घंटा वेटिंग चार्ज`) : ""}
            </div>
          )}
          <div className="flex justify-end mt-2">
            <button onClick={(e) => { e.stopPropagation(); setSelectedBid(bid.id); }}
              className="flex items-center gap-1 rounded-full px-4 py-2.5 text-base font-black shadow-sm text-white"
              style={{ background: "#0052CC" }}>
              {isSelected ? <><CheckCircle2 size={14} /> {lang === "en" ? "Selected" : lang === "mr" ? "निवडलेले" : "चयनित"}</> : (lang === "en" ? "Select" : lang === "mr" ? "निवडा" : "चुनें")}
            </button>
          </div>
        </div>
        {isSelected && (
          <>
            <button onClick={() => {
              const err = acceptBid(b.id, bid.id);
              if (err) setAcceptError(err);
              else { setSelectedBid(null); setAcceptError(""); onBidAccepted?.(b); }
            }}
              className="w-full rounded-lg py-3.5 font-bold text-base mt-2 text-white" style={{ background: C.success }}>
              {lang === "en" ? "Book this vehicle" : lang === "mr" ? "हीच गाडी बुक करा" : "यही गाड़ी बुक करें"}
            </button>
            {acceptError && <div className="text-xs font-bold mt-1" style={{ color: C.safety }}>{acceptError}</div>}
          </>
        )}
        </React.Fragment>
      );
    };
    return (
      <div className="px-5 py-5">
        <div className="rounded-xl p-3 mb-4 shadow-sm" style={{ background: C.paper, border: `1.5px solid ${C.marigoldDeep}` }}>
            {b.scheduledFor && (
              <div className="rounded-lg p-2 mb-2 flex items-center gap-1.5 shadow-lg" style={{ background: C.metallicGold }}>
                <Clock3 size={12} color={C.ink} />
                <span className="text-[11px] font-bold" style={{ color: C.ink }}>{lang === "en" ? "Advance ride" : lang === "mr" ? "अ‍ॅडव्हान्स राइड" : "एडवांस राइड"}: {rideDateTimeLabel(b)}</span>
              </div>
            )}

            {sortedBids.length === 0 ? (
              <div className="guided-submit-ready shadow-lg rounded-lg px-4 py-3 my-1 flex items-center justify-center" style={{ background: C.navy }}>
                <span className="text-sm font-black text-center" style={{ color: "#FFFFFF" }}>{lang === "en" ? "In some time, you will see vehicles according to your requirement" : lang === "mr" ? "थोड्याच वेळात तुमच्या गरजेनुसार गाड्या दिसतील" : "कुछ ही समय में आपकी ज़रूरत के अनुसार गाड़ियां दिखेंगी"}</span>
              </div>
            ) : (
              <div className="space-y-2" ref={bidsListRef}>
                {bidRow(displayBids[0], displayBids[0].id === lowestBidId)}
                {displayBids.length > 1 && (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
                    {displayBids.slice(1).map((bid) => bidRow(bid, bid.id === lowestBidId))}
                  </div>
                )}
              </div>
            )}

            {sortedBids.length === 0 && (
              <div className="flex justify-end mt-2">
                <button onClick={() => { const err = cancelBooking(b.id); if (err) setCancelError(err); }} className="text-sm font-semibold flex items-center justify-center" style={{ color: C.safety }}>{lang === "en" ? "Cancel load" : lang === "mr" ? "लोड रद्द करा" : "लोड रद्द करें"}</button>
              </div>
            )}
            {cancelError && <div className="text-[11px] font-bold mt-1 text-right" style={{ color: C.safety }}>{cancelError}</div>}
        </div>
      </div>
    );
  }

  const v = VEHICLES.find((x) => x.key === b.vehicle);
  return (
    <div className="px-5 pt-3 pb-5">
      <div className="rounded-2xl py-3.5 px-2 mb-2.5 shadow-sm flex items-center justify-between gap-1" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
        {onAddAnother ? (
          <button onClick={onAddAnother} className="w-9 h-9 rounded-full flex items-center justify-center shadow-sm shrink-0" style={{ background: C.marigold, border: `1.5px solid ${C.marigoldDeep}` }}>
            <ChevronLeft size={18} color="#000000" strokeWidth={3} />
          </button>
        ) : <div />}
        {/* Until the driver actually enters this OTP (loadingStartedAt flips
            true), show it right here so it's impossible to miss — Invoice
            only makes sense once loading has genuinely started, so it takes
            this exact spot the moment OTP is no longer needed instead of
            the two ever being shown at once. */}
        {b.otp && !b.loadingStartedAt ? (
          <div className="flex-1 rounded-xl px-3 py-1.5 text-center guided-submit-ready">
            <div className="text-[8px] font-black" style={{ color: C.inkSoft }}>{lang === "en" ? "OTP" : lang === "mr" ? "OTP" : "OTP"}</div>
            <div className="text-lg font-black leading-none mt-0.5" style={{ color: "#000000", fontFamily: monoFont, letterSpacing: 4 }}>{b.otp}</div>
          </div>
        ) : (
          <button onClick={() => setShowDocs(true)} className="shrink-0 flex items-center gap-1.5 pl-3 pr-3.5 py-3 rounded-full text-base font-black shadow-sm text-white"
            style={{ background: docsSent ? C.metallicGreen : C.navy, border: `1.5px solid ${docsSent ? C.success : C.navy}` }}>
            <FileText size={15} /> {docsSent ? (lang === "en" ? "Sent ✓" : lang === "mr" ? "पाठवले गेले ✓" : "भेजा गया ✓") : (lang === "en" ? "Invoice" : lang === "mr" ? "इनव्हॉइस" : "इनवॉइस")}
          </button>
        )}
      </div>

      <div className="rounded-2xl mb-2.5 shadow-sm flex" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
        <div className="flex-1 p-3 flex items-center gap-2.5">
          <SafeImage
            src={drivers.find((d) => d.name === b.driverName)?.photo?.url}
            alt={lang === "en" ? "Driver" : lang === "mr" ? "ड्रायव्हर" : "ड्राइवर"}
            className="w-10 h-10 rounded-full object-cover"
            fallback={<div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: C.pimpri }}><UserCircle2 size={20} color="#fff" /></div>}
          />
          <div className="text-sm font-bold" style={{ color: C.ink }}>{b.driverName}</div>
        </div>
        <div className="w-px" style={{ background: C.line }} />
        <div className="flex-1 p-3">
          <div className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Vehicle Details" : lang === "mr" ? "गाडीची माहिती" : "गाड़ी की जानकारी"}</div>
          <div className="text-sm font-bold mt-0.5" style={{ color: C.ink }}>{vehicleLabel(v, lang)} · {driverVehicle?.vehicleNumber || (lang === "en" ? "unavailable" : lang === "mr" ? "उपलब्ध नाही" : "उपलब्ध नहीं")}</div>
        </div>
      </div>

      {b.driverMobile && (
        <MaskedCallButton bookingId={b.id} fallbackMobile={b.driverMobile} lang={lang}
          label={lang === "en" ? "Call Driver" : lang === "mr" ? "कॉल ड्रायव्हर" : "कॉल ड्राइवर"}
          className="w-full flex items-center justify-center gap-2 px-3.5 py-3.5 mb-2.5 rounded-2xl text-base font-black shadow-sm"
          style={{ color: "#FFFFFF", fontFamily: bodyFont, background: C.navy }} />
      )}

      <div className="rounded-2xl p-3.5 mb-2.5 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
        {!b.loadingStartedAt && (
          <div style={{ color: C.ink }}><span className="text-lg font-black" style={{ color: C.navy }}>{lang === "en" ? "Pickup" : lang === "mr" ? "पिकअप" : "पिकअप"}: </span><span className="text-base font-normal">{b.pickup}</span></div>
        )}
        {b.loadingStartedAt && (
          <div style={{ color: C.ink }}><span className="text-lg font-black" style={{ color: C.navy }}>{lang === "en" ? "Drop" : lang === "mr" ? "ड्रॉप" : "ड्रॉप"}: </span><span className="text-base font-normal">{b.drop}</span></div>
        )}
        <div className="mt-3" style={{ height: "35vh" }}>
          <LiveTrackingMap pickup={b.pickup} drop={b.drop} pickupLat={b.pickupLat} pickupLng={b.pickupLng} dropLat={b.dropLat} dropLng={b.dropLng}
            driverLocation={b.driverLocation} customerLocation={b.customerLocation} progress={b.progress} zoneColor={C.pimpri} height="100%" lang={lang}
            mode={b.loadingStartedAt ? "route" : "toPickup"} />
        </div>
      </div>

      {b.loadingStartedAt && (
        <div className="rounded-2xl p-3.5 mb-2.5 shadow-lg" style={{ background: "#4FC3F7", border: "2px solid #0288D1" }}>
          <div className="text-sm font-bold" style={{ color: "#FFFFFF", fontFamily: bodyFont }}>
            {lang === "en" ? "💡 Once the vehicle is loaded, the driver may ask for an advance payment — this is a mutual agreement between the customer and driver, not a fixed app rule." : lang === "mr" ? "💡 गाडी लोड झाल्यानंतर ड्रायव्हर अ‍ॅडव्हान्स पेमेंट मागू शकतो — ही ग्राहक आणि ड्रायव्हर यांच्यातील परस्पर सहमती आहे, अ‍ॅपचा कोणताही निश्चित नियम नाही." : "💡 गाड़ी लोड होने के बाद ड्राइवर एडवांस भुगतान मांग सकता है — यह ग्राहक और ड्राइवर के बीच आपसी सहमति है, ऐप का कोई तय नियम नहीं।"}
          </div>
        </div>
      )}

      <div className="rounded-2xl p-3 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
        {b.loadingStartedAt && <TripOvertimeBanner booking={b} lang={lang} />}
        {!b.loadingStartedAt && (
          <div className="flex justify-end">
            <button onClick={() => { const err = cancelBooking(b.id); if (err) setCancelError(err); }} className="text-sm font-semibold flex items-center justify-center" style={{ color: C.safety }}>{lang === "en" ? "Cancel booking" : lang === "mr" ? "बुकिंग रद्द करा" : "बुकिंग रद्द करें"}</button>
          </div>
        )}
        {b.loadingStartedAt && (
          <div className="rounded-lg p-2.5" style={{ background: C.safety, color: "#FFFFFF" }}>
            <div className="text-[11px] font-bold">
              ⚠️ {lang === "en" ? "Note 1:" : lang === "mr" ? "नोंद 1:" : "नोट 1:"} {lang === "en" ? "Travel time between pickup and drop is not counted in loading/unloading time." : lang === "mr" ? "पिकअप आणि ड्रॉपमधील प्रवासाचा वेळ लोडिंग/अनलोडिंग वेळेत मोजला जात नाही." : "पिकअप और ड्रॉप के बीच की यात्रा का समय लोडिंग/अनलोडिंग समय में नहीं गिना जाता।"}
            </div>
            <div className="text-[11px] font-bold mt-1.5 pt-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.35)" }}>
              ⚠️ {lang === "en" ? "Note 2:" : lang === "mr" ? "नोंद 2:" : "नोट 2:"} {lang === "en" ? "This trip cannot be cancelled now — it will end only when the driver completes it (End Trip)." : lang === "mr" ? "ही ट्रिप आता रद्द केली जाऊ शकत नाही — ही फक्त ड्रायव्हरने पूर्ण (End Trip) केल्यावरच संपेल." : "यह ट्रिप अब रद्द नहीं की जा सकती — यह केवल ड्राइवर द्वारा पूरी (End Trip) करने पर ही समाप्त होगी।"}
            </div>
          </div>
        )}
        {b.loadingStartedAt && (
          <div className="flex justify-end mt-2">
            <button onClick={shareTrip} className="text-sm font-semibold flex items-center justify-center gap-1" style={{ color: C.success }}><MessageCircle size={12} /> {lang === "en" ? "Share trip" : lang === "mr" ? "ट्रिप शेअर करा" : "ट्रिप शेयर करें"}</button>
          </div>
        )}
        {cancelError && <div className="text-[11px] font-bold mt-2" style={{ color: C.safety }}>{cancelError}</div>}
      </div>
      {showDocs && <BillDocumentsModal booking={b} onClose={() => setShowDocs(false)} lang={lang} />}
    </div>
  );
}

// Completed/cancelled booking history — reached from the hamburger menu now
// that the main page focuses on the single active ride.
function CustomerHistory({ bookings, vehicleTypes, rateBooking, lang }) {
  const VEHICLES = vehicleTypes;
  const others = bookings.filter((b) => b.status === "Completed" || b.status === "Cancelled");
  const [docsBooking, setDocsBooking] = useState(null);
  const statusMeta = lang === "en"
    ? { Completed: { label: "Completed", color: "#FFFFFF", bg: C.success }, Cancelled: { label: "Cancelled", color: "#FFFFFF", bg: C.safety } }
    : { Completed: { label: "पूर्ण", color: "#FFFFFF", bg: C.success }, Cancelled: { label: "रद्द", color: "#FFFFFF", bg: C.safety } };

  // Same Context/Time/Charges breakdown as the in-app trip summary table
  // (see TripBreakdownTable), laid out as a fixed-width plain-text table
  // since this downloads as a .txt file — no HTML/CSS available to draw
  // real borders, so column padding + a rule line stand in for them.
  const downloadInvoice = (b) => {
    const baseFare = (b.fare || 0) - (b.extraCharge || 0);
    const { totalMs, loadingUnloadingMs, waitingMs } = tripHourBreakdown(b);
    const col1 = 34, col2 = 16;
    const line = (context, time, charges) => `${context.padEnd(col1)}${(time || "-").padEnd(col2)}${charges || "-"}`;
    const rule = "-".repeat(col1 + col2 + 12);
    const rows = [
      line("Fare", "-", fmt(baseFare)),
      line("Total time", fmtHrMin(totalMs, "en"), "-"),
      line("Loading/Unloading time", fmtHrMin(loadingUnloadingMs, "en"), "-"),
    ];
    if (b.extraCharge > 0) rows.push(line(`Waiting charge (${fmt(b.extraHourRate || 0)}/hr)`, fmtHrMin(waitingMs, "en"), fmt(b.extraCharge)));
    rows.push(rule, line("Total", "-", fmt(b.fare)));
    const text = [
      "Apna Transport - Trip Invoice",
      `Booking: ${b.id}`, `Pickup: ${b.pickup}`, `Drop: ${b.drop}`,
      `Vehicle: ${vehicleLabel(VEHICLES.find(v => v.key === b.vehicle), "en")}`, `Distance: ${b.distance} km`, "",
      line("Context", "Time", "Charges (Rs)"), rule, ...rows, "",
      `Status: ${b.status}`,
    ].join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${b.id}-invoice.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="px-5 py-4">
      <h2 className="text-base font-bold mb-3" style={{ color: C.ink }}>{lang === "en" ? "Ride History" : lang === "mr" ? "राइड हिस्टरी" : "राइड हिस्ट्री"}</h2>
      {others.length === 0 ? (
        <div className="text-center py-12 px-6">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: C.marigoldDeep }}>
            <Package size={26} color="#FFFFFF" />
          </div>
          <p className="text-sm font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "No past rides yet" : lang === "mr" ? "अजून कोणतीही जुनी राइड नाही" : "अभी कोई पुरानी राइड नहीं है"}</p>
          <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Completed and cancelled bookings will show up here." : lang === "mr" ? "पूर्ण आणि रद्द बुकिंग इथे दिसतील." : "पूर्ण और रद्द बुकिंग यहां दिखेंगी।"}</p>
        </div>
      ) : others.map((b) => {
        const meta = statusMeta[b.status];
        return (
          <div key={b.id} className="rounded-xl mb-3 p-3 shadow-sm" style={{ background: C.paper, border: `1px dashed ${C.line}` }}>
            <div className="flex justify-between items-start">
              <div className="text-[11px]" style={{ fontFamily: monoFont, color: C.inkSoft }}>{b.id}</div>
              <div className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: meta.color, background: meta.bg }}>{meta.label}</div>
            </div>
            <RouteLine pickup={b.pickup} drop={b.drop} lang={lang} />
            <div className="flex items-center justify-between mt-2">
              <div>
                <div className="text-[9px] font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "Transaction Amount" : lang === "mr" ? "व्यवहार रक्कम" : "लेन-देन राशि"}</div>
                <span className="text-lg font-bold" style={{ color: C.ink, fontFamily: monoFont }}>{b.fare ? fmt(b.fare) : "—"}</span>
              </div>
              {b.status === "Completed" && (
                <div className="flex items-center gap-3">
                  <button onClick={() => setDocsBooking(b)} className="text-sm font-semibold flex items-center gap-1" style={{ color: b.documents?.file?.url ? C.success : C.marigoldDeep }}>
                    <FileText size={12} /> {lang === "en" ? "Send Invoice" : lang === "mr" ? "इनव्हॉइस पाठवा" : "इनवॉइस भेजें"}
                  </button>
                  <button onClick={() => downloadInvoice(b)} className="text-sm font-semibold flex items-center gap-1" style={{ color: C.marigoldDeep }}><Download size={12} /> {lang === "en" ? "Invoice" : lang === "mr" ? "इनव्हॉइस" : "इनवॉइस"}</button>
                </div>
              )}
            </div>
            {b.status === "Completed" && b.fare > 0 && (
              <div className="text-[10px] mt-1" style={{ color: C.inkSoft }}>
                {lang === "en" ? "Payment Type" : lang === "mr" ? "पेमेंटचा प्रकार" : "भुगतान का प्रकार"}: <span className="font-semibold" style={{ color: C.ink }}>{lang === "en" ? "Cash / UPI (paid directly to driver)" : lang === "mr" ? "रोख / UPI (थेट ड्रायव्हरला)" : "नकद / UPI (सीधे ड्राइवर को)"}</span>
              </div>
            )}
            {b.status === "Completed" && (
              <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
                <span className="text-[11px]" style={{ color: C.inkSoft }}>{b.rating ? (lang === "en" ? "Your rating:" : lang === "mr" ? "तुमचे रेटिंग:" : "आपकी रेटिंग:") : (lang === "en" ? "Rate the driver:" : lang === "mr" ? "ड्रायव्हरला रेट करा:" : "ड्राइवर को रेट करें:")}</span>
                <StarRating value={b.rating} onRate={(n) => rateBooking(b.id, n)} />
              </div>
            )}
            {b.status === "Completed" && b.fare > 0 && (
              <div className="mt-2">
                <TripBreakdownTable baseFareLabel={lang === "en" ? "Base fare" : lang === "mr" ? "बेस भाडे" : "बेस भाड़ा"} baseFare={b.fare - (b.extraCharge || 0)} totalAmount={b.fare} trip={b} lang={lang} />
              </div>
            )}
          </div>
        );
      })}
      {docsBooking && <BillDocumentsModal booking={docsBooking} onClose={() => setDocsBooking(null)} lang={lang} />}
    </div>
  );
}

// Editable customer profile — photo, name, email, mobile (read-only, tied to
// the verified login), and address, with a Save button that persists via
// onUpdateProfile.
function CustomerProfileEdit({ customerProfile, customerMobile, onSave, lang, onChangeLang, onLogout }) {
  const [name, setName] = useState(customerProfile?.name || "");
  const [email, setEmail] = useState(customerProfile?.email || "");
  const [photo, setPhoto] = useState(customerProfile?.photo || null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [address, setAddress] = useState(customerProfile?.address || "");
  const [area, setArea] = useState(customerProfile?.area || "");
  const [city, setCity] = useState(customerProfile?.city || "");
  const [state, setState] = useState(customerProfile?.state || "");
  const [pincode, setPincode] = useState(customerProfile?.pincode || "");
  const [saved, setSaved] = useState(false);

  const inputCls = "w-full rounded-lg px-3 py-2.5 text-sm outline-none";
  const inputStyle = { background: C.paper, border: `1px solid ${C.line}`, color: C.ink };

  const save = () => {
    onSave?.({ name: name.trim(), email: email.trim() || null, photo, address, area, city, state, pincode });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Migration nudge for an account still on the old Firebase Phone Auth
  // login (real phone-auth users never get a Firebase email set) — lets
  // them add PIN login on TOP of their existing session via linkWithCredential
  // (same uid, same account, no new/competing account and no re-verification
  // needed since they're already proven by just being logged in here).
  // Already-PIN accounts (email set) or brand-new PIN signups never see this.
  const hasPinAlready = !!customerFirebaseAuth?.currentUser?.email;
  const [pinPromptOpen, setPinPromptOpen] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pinDone, setPinDone] = useState(false);

  const setUpPin = async () => {
    if (newPin.length !== 4 || newPin !== newPinConfirm || pinSaving || !customerFirebaseAuth?.currentUser || !customerMobile) return;
    setPinSaving(true);
    setPinError("");
    try {
      const credential = EmailAuthProvider.credential(pinAuthEmail(customerMobile, "customer"), pinToPassword(newPin));
      await linkWithCredential(customerFirebaseAuth.currentUser, credential);
      setPinDone(true);
      setNewPin(""); setNewPinConfirm(""); setPinPromptOpen(false);
    } catch (e) {
      console.error(e);
      setPinError(lang === "en" ? "Couldn't set PIN — try again." : lang === "mr" ? "PIN सेट होऊ शकला नाही — पुन्हा प्रयत्न करा." : "PIN सेट नहीं हो सका — फिर कोशिश करें।");
    }
    setPinSaving(false);
  };

  return (
    <div className="px-5 py-4">
      <h2 className="text-base font-bold mb-3" style={{ color: C.ink }}>{lang === "en" ? "My Profile" : lang === "mr" ? "माझी प्रोफाइल" : "मेरी प्रोफाइल"}</h2>
      <div className="rounded-xl p-4 mb-3 shadow-sm space-y-3" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
        <div className="flex justify-center">
          <PhotoPicker label={lang === "en" ? "Profile Photo" : lang === "mr" ? "प्रोफाइल फोटो" : "प्रोफाइल फोटो"} lang={lang} onSelect={(f) => {
            setPhotoUploading(true); setPhotoError(false);
            uploadPhoto(f, `customers/${customerMobile}/profile.jpg`).then((p) => {
              setPhotoUploading(false);
              if (p) setPhoto(p); else setPhotoError(true);
            });
          }}>
            <div className="w-20 h-20 rounded-full flex items-center justify-center cursor-pointer overflow-hidden" style={{ background: C.paper, border: `2px dashed ${C.marigoldDeep}` }}>
              {photoUploading
                ? <p className="text-[9px] text-center px-1" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Uploading..." : lang === "mr" ? "अपलोड होत आहे..." : "अपलोड हो रहा है..."}</p>
                : <SafeImage src={photo?.url} alt="" className="w-full h-full object-cover" fallback={<Camera size={22} color={C.marigoldDeep} />} />}
            </div>
          </PhotoPicker>
        </div>
        {photoError && (
          <p className="text-[10px] font-semibold text-center" style={{ color: C.safety }}>{lang === "en" ? "Photo upload failed — please try another photo" : lang === "mr" ? "फोटो अपलोड झाला नाही — कृपया दुसरा फोटो वापरा" : "फोटो अपलोड नहीं हुई — कृपया दूसरी फोटो लें"}</p>
        )}
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Full Name" : lang === "mr" ? "पूर्ण नाव" : "पूरा नाम"}</label>
          <input className={inputCls} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Mobile" : lang === "mr" ? "मोबाइल" : "मोबाइल"}</label>
          <input className={inputCls} style={{ ...inputStyle, fontFamily: monoFont, background: C.bg, color: C.inkSoft }} value={customerMobile || ""} disabled />
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Language" : lang === "mr" ? "भाषा" : "भाषा"}</label>
          <select className={inputCls} style={inputStyle} value={lang} onChange={(e) => onChangeLang?.(e.target.value)}>
            <option value="en">English</option>
            <option value="hi">हिंदी</option>
            <option value="mr">मराठी</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Email (optional)" : lang === "mr" ? "ईमेल (ऐच्छिक)" : "ईमेल (वैकल्पिक)"}</label>
          <input type="email" className={inputCls} style={inputStyle} placeholder={lang === "en" ? "e.g. ramesh@email.com" : lang === "mr" ? "उदा: ramesh@email.com" : "जैसे: ramesh@email.com"} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Address" : lang === "mr" ? "पत्ता" : "पता"}</label>
          <input className={inputCls} style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Area" : lang === "mr" ? "एरिया" : "एरिया"}</label>
            <input className={inputCls} style={inputStyle} value={area} onChange={(e) => setArea(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "City" : lang === "mr" ? "शहर" : "शहर"}</label>
            <input className={inputCls} style={inputStyle} value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "State" : lang === "mr" ? "राज्य" : "राज्य"}</label>
            <input className={inputCls} style={inputStyle} value={state} onChange={(e) => setState(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Pincode" : lang === "mr" ? "पिनकोड" : "पिनकोड"}</label>
            <input className={inputCls} style={{ ...inputStyle, fontFamily: monoFont }} value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          </div>
        </div>
        <button onClick={save} disabled={photoUploading} className={`w-full rounded-lg py-3.5 font-bold text-base text-white ${saved ? "shadow-lg" : ""}`} style={{ background: photoUploading ? C.line : saved ? C.metallicGreen : C.marigoldDeep }}>
          {photoUploading ? (lang === "en" ? "Uploading photo..." : lang === "mr" ? "फोटो अपलोड होत आहे..." : "फोटो अपलोड हो रही है...") : saved ? (lang === "en" ? "Saved ✓" : lang === "mr" ? "सेव्ह झाले ✓" : "सेव हो गया ✓") : (lang === "en" ? "Save Changes" : lang === "mr" ? "बदल सेव्ह करा" : "बदलाव सेव करें")}
        </button>
      </div>

      {!hasPinAlready && (
        <div className="rounded-xl p-4 mb-3 shadow-sm" style={{ background: C.paper, border: `1.5px solid ${C.marigoldDeep}` }}>
          {pinDone ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} color={C.success} />
              <span className="text-xs font-bold" style={{ color: C.ink }}>{lang === "en" ? "PIN set! You can use it to log in next time." : lang === "mr" ? "PIN सेट झाला! पुढच्या वेळी लॉगिनसाठी वापरू शकता." : "PIN सेट हो गया! अगली बार लॉगिन के लिए इस्तेमाल कर सकते हैं।"}</span>
            </div>
          ) : !pinPromptOpen ? (
            <>
              <div className="text-xs font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "Set a PIN for faster login" : lang === "mr" ? "जलद लॉगिनसाठी PIN सेट करा" : "तेज़ लॉगिन के लिए PIN सेट करें"}</div>
              <p className="text-[11px] mb-2" style={{ color: C.inkSoft }}>{lang === "en" ? "Skip the OTP next time — just your mobile number and a PIN." : lang === "mr" ? "पुढच्या वेळी OTP टाळा — फक्त मोबाइल नंबर आणि PIN." : "अगली बार OTP छोड़ें — बस मोबाइल नंबर और PIN।"}</p>
              <button onClick={() => setPinPromptOpen(true)} className="text-sm font-bold" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Set PIN" : lang === "mr" ? "PIN सेट करा" : "PIN सेट करें"}</button>
            </>
          ) : (
            <div className="space-y-2">
              <input className={inputCls} style={{ ...inputStyle, textAlign: "center", letterSpacing: 2, fontFamily: monoFont }} placeholder={lang === "en" ? "4-digit PIN" : lang === "mr" ? "4-अंकी PIN" : "4-अंकों का PIN"}
                value={newPin} onChange={(e) => { setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setPinError(""); }} />
              <input className={inputCls} style={{ ...inputStyle, textAlign: "center", letterSpacing: 2, fontFamily: monoFont }} placeholder={lang === "en" ? "Confirm PIN" : lang === "mr" ? "PIN कन्फर्म करा" : "PIN कन्फर्म करें"}
                value={newPinConfirm} onChange={(e) => { setNewPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 4)); setPinError(""); }} />
              {newPin && newPinConfirm && newPin !== newPinConfirm && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{lang === "en" ? "PINs don't match" : lang === "mr" ? "PIN जुळत नाहीत" : "PIN मेल नहीं खाते"}</div>}
              {pinError && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{pinError}</div>}
              <button onClick={setUpPin} disabled={newPin.length !== 4 || newPin !== newPinConfirm || pinSaving}
                className="w-full rounded-lg py-2.5 font-bold text-sm" style={{ background: newPin.length === 4 && newPin === newPinConfirm && !pinSaving ? C.marigold : "#E0E0E0", color: newPin.length === 4 && newPin === newPinConfirm && !pinSaving ? "#000000" : "#9AA3B0" }}>
                {pinSaving ? (lang === "en" ? "Saving..." : lang === "mr" ? "सेव्ह होत आहे..." : "सेव हो रहा है...") : (lang === "en" ? "Save PIN" : lang === "mr" ? "PIN सेव्ह करा" : "PIN सेव करें")}
              </button>
            </div>
          )}
        </div>
      )}

      <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 rounded-lg py-3.5 font-bold text-base" style={{ background: C.safety, color: "#FFFFFF", border: `1px solid ${C.safety}` }}>
        <XCircle size={16} /> {lang === "en" ? "Logout" : lang === "mr" ? "लॉगआउट" : "लॉगआउट"}
      </button>
    </div>
  );
}

// Shown to the customer the moment the driver taps End Trip — the booking
// flips straight to status "Completed", which would otherwise drop the
// customer instantly back to the "What do you need?" chooser (activeBooking
// only matches Bidding/Ongoing) with no chance to review what they owe.
// Mirrors the driver's own DriverTripSummary.
function CustomerTripSummary({ trip, lang, onDone }) {
  const baseFare = (trip.fare || 0) - (trip.extraCharge || 0);
  const totalAmount = trip.fare || 0;
  const completedLabel = trip.completedAt ? new Date(trip.completedAt).toLocaleString(lang === "en" ? "en-IN" : lang === "mr" ? "mr-IN" : "hi-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <div>
      <div className="rounded-2xl p-4 mb-3 shadow-sm text-center" style={{ background: C.paper, border: `1.5px solid ${C.success}` }}>
        <CheckCircle2 size={32} color={C.success} className="mx-auto mb-1.5" />
        <div className="text-lg font-black" style={{ color: C.ink }}>{lang === "en" ? "Trip Completed" : lang === "mr" ? "ट्रिप पूर्ण झाली" : "ट्रिप पूरी हुई"}</div>
        {completedLabel && <div className="text-xs font-bold mt-0.5" style={{ color: C.inkSoft }}>{completedLabel}</div>}
      </div>

      <div className="rounded-2xl p-3.5 mb-2.5 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
        <RouteLine pickup={trip.pickup} drop={trip.drop} lang={lang} />
      </div>

      <TripBreakdownTable baseFareLabel={lang === "en" ? "Fare" : lang === "mr" ? "भाडे" : "भाड़ा"} baseFare={baseFare} totalAmount={totalAmount} trip={trip} lang={lang} />

      <button onClick={onDone} className="w-full rounded-lg py-3.5 font-bold text-base text-white shadow-lg" style={{ background: C.metallicGreen }}>
        {lang === "en" ? "Done" : lang === "mr" ? "पूर्ण" : "पूर्ण"}
      </button>
    </div>
  );
}

function CustomerApp({ bookings, createLoad, drivers, vehicleTypes, cancelBooking, rateBooking, acceptBid, lang, onChangeLang, onLogout, customerProfile, customerMobile, onUpdateProfile, raiseAlert, onOpenTerms, adminNotifications }) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Badge + "View your Booking here" callout on the hamburger button, shown
  // right after a bid is accepted (see the onBidAccepted callbacks below)
  // until the menu is actually opened — see HamburgerHint.
  const [showBookingHint, setShowBookingHint] = useState(false);
  // The single most emotionally significant moment in the app — see
  // SuccessBurst. Fires every time acceptBid succeeds, immediate or advance.
  const [showAcceptedBurst, setShowAcceptedBurst] = useState(false);
  const fireAcceptedBurst = () => {
    setShowAcceptedBurst(true);
    setTimeout(() => setShowAcceptedBurst(false), 1400);
  };
  // Tracks CustomerBooking's own bookingMode (see onModeChange below) purely
  // so the header knows whether the "What do you need?" chooser is on
  // screen right now — that's the only place the hamburger menu shows.
  const [customerBookingMode, setCustomerBookingMode] = useState(null);
  const [settingsView, setSettingsView] = useState(null); // 'helpline' | 'profile' | 'liveLocation' | 'settings' | 'history' | null
  const [selectedAdvanceId, setSelectedAdvanceId] = useState(null);
  // Toggle between Current and Advance rides, shown as a bar in the header
  // (between the hamburger menu and Home button) instead of a hamburger-menu
  // entry — replaces the old "Advance Bookings" menu item.
  const [rideView, setRideView] = useState("current");
  // `bookings` is the whole platform's list (drivers need to see every open
  // load to bid on) — a customer must only ever see their own, so every
  // lookup below filters to this customer's mobile number first.
  const myBookings = bookings.filter((b) => b.customerMobile === customerMobile);
  // Posting a new ride while another one is already active/advance-booked —
  // see the "Back" button on ActiveRide below, which flips this back on to
  // return to the booking form. Cleared the moment a new booking actually
  // lands (myBookings.length changes).
  const [addingAnother, setAddingAnother] = useState(false);
  useEffect(() => { setAddingAnother(false); }, [myBookings.length]);
  // A booking scheduled for a future date shouldn't hog the home screen or
  // block posting today's ride — it stays reachable via the Current/Advance
  // toggle in the header instead (see rideView below).
  // Still-Bidding advance loads stay on the main page like any other load
  // (so the customer sees bids come in and can accept one) — only a bid
  // actually being accepted (status flips to Ongoing) moves a future-dated
  // one out to Advance Bookings.
  const advanceBookings = myBookings.filter((b) => b.status === "Ongoing" && isFutureAdvance(b.scheduledFor));
  const ongoingTrip = myBookings.find((b) => b.status === "Ongoing" && !isFutureAdvance(b.scheduledFor));
  const activeBooking = myBookings.find((b) => b.status === "Bidding" || (b.status === "Ongoing" && !isFutureAdvance(b.scheduledFor)));

  // Surfaces a fare-review summary the moment the driver ends the trip,
  // instead of silently dropping the customer back to the chooser the
  // instant status flips to Completed (see CustomerTripSummary above).
  // Deliberately NOT a "detect the live transition" effect — that only
  // fires if this component happened to stay mounted at the exact moment
  // the driver tapped End Trip. A customer's phone is very often locked/
  // backgrounded mid-delivery, so reopening the app afterward would skip
  // straight past that moment and never show anything. Instead this is
  // derived every render from persisted data: the most recently completed
  // booking, shown until acknowledged (Done) — survives the app being
  // fully closed and reopened.
  const [ackedTripId, setAckedTripId] = usePersistedState(`sarthi_ackedTrip_${customerMobile}`, null);
  const recentCompleted = myBookings
    .filter((b) => b.status === "Completed" && b.completedAt && Date.now() - b.completedAt < 2 * 60 * 60 * 1000)
    .sort((a, b) => b.completedAt - a.completedAt)[0] || null;
  const completedTripSummary = recentCompleted && recentCompleted.id !== ackedTripId ? recentCompleted : null;
  // Whichever single booking ActiveRide is currently showing (if any) — used
  // to put its "Immediate/Advance Ride · date time" badge in the header, in
  // the gap between the hamburger menu and Home button, instead of inside
  // the page body where RideTypeBanner used to render it.
  const headerRideBooking = rideView === "current"
    ? (activeBooking && !addingAnother ? activeBooking : null)
    : advanceBookings.find((ab) => ab.id === selectedAdvanceId) || null;
  // The hamburger only shows on the "What do you need?" chooser screen —
  // i.e. the Current tab, no active/being-added ride, and CustomerBooking
  // itself hasn't moved past its own mode chooser yet.
  // True whenever the "What do you need?" chooser (hamburger + Customer
  // Dashboard title) is what's actually on screen — either there's no active
  // booking at all, or the customer tapped Back from an active ride to post
  // another one (addingAnother) — as long as CustomerBooking hasn't moved
  // past its own mode chooser yet.
  const showHamburger = rideView === "current" && (!activeBooking || addingAnother) && customerBookingMode === null;
  // The actual assigned driver's vehicle — looked up from the shared drivers
  // list by name, not this device's own driver session (a customer's phone
  // usually isn't also logged in as the driver who accepted their load).
  const activeDriverVehicle = drivers.find((d) => d.name === activeBooking?.driverName)?.vehicleSpec;
  const rideNotifications = useRideNotifications("customers", customerMobile, lang);
  const announcementAlerts = useAnnouncementAlerts(adminNotifications, customerMobile, "customer");

  // Real GPS live-tracking, mirroring the driver's own — shares the
  // customer's actual device location while a trip is Ongoing, so the
  // driver (and the customer's own map) can see both parties together.
  const lastCustomerGpsWriteRef = useRef(0);
  useEffect(() => {
    if (!ongoingTrip || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastCustomerGpsWriteRef.current < 5000) return;
        lastCustomerGpsWriteRef.current = now;
        const location = { lat: pos.coords.latitude, lng: pos.coords.longitude, updatedAt: now };
        patchDoc("bookings", ongoingTrip.id, { customerLocation: location }).catch((e) => console.error(e));
      },
      (err) => console.error("GPS tracking error", err),
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [ongoingTrip?.id]);

  const shareApp = () => {
    // No referral code — customers no longer earn anything for sharing
    // (only drivers do, see DriverApp's shareApp).
    const link = "https://sarthi-transport-74865.web.app";
    const msg = lang === "en"
      ? `Book trucks and tempos easily with Apna Transport. Download the app: ${link}`
      : lang === "mr"
      ? `ट्रक आणि टेम्पो सहज बुक करण्यासाठी अपना ट्रान्सपोर्ट डाउनलोड करा: ${link}`
      : `ट्रक और टेम्पो आसानी से बुक करने के लिए अपना ट्रांसपोर्ट डाउनलोड करें: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  if (completedTripSummary) {
    return (
      <div className="flex-1 overflow-y-auto relative px-5 pt-5 pb-5">
        <CustomerTripSummary trip={completedTripSummary} lang={lang} onDone={() => setAckedTripId(completedTripSummary.id)} />
      </div>
    );
  }

  if (settingsView) {
    return (
      <div className="flex-1 overflow-y-auto relative">
        <div className="px-5 pt-3">
          <button onClick={() => setSettingsView(null)} className="flex items-center gap-1 p-3 rounded-full shadow-sm self-start" style={{ background: C.marigold, color: "#000000", border: `1.5px solid ${C.marigoldDeep}` }}>
            <ChevronLeft size={18} strokeWidth={3} />
          </button>
        </div>
        {settingsView === "helpline" && <SosScreen role="customer" raiseAlert={raiseAlert} lang={lang} tripLocked={!!ongoingTrip?.loadingStartedAt} />}
        {settingsView === "profile" && (
          <CustomerProfileEdit customerProfile={customerProfile} customerMobile={customerMobile} onSave={onUpdateProfile} lang={lang} onChangeLang={onChangeLang} onLogout={onLogout} />
        )}
        {settingsView === "history" && <CustomerHistory bookings={myBookings} vehicleTypes={vehicleTypes} rateBooking={rateBooking} lang={lang} />}
        {settingsView === "messages" && <AnnouncementsInbox adminNotifications={adminNotifications} myMobile={customerMobile} toRole="customer" lang={lang} onOpen={announcementAlerts.markSeen} />}
      </div>
    );
  }

  // While a load is still Bidding (no driver assigned yet), the header shows
  // Back + "My Active Booking" instead of the Immediate/Advance Ride time
  // badge — that badge only makes sense once a driver is actually en route.
  const biddingHeader = rideView === "current" && !addingAnother && activeBooking?.status === "Bidding";
  // The Ongoing (assigned-driver) ride view on the Current tab has its own
  // Back + OTP/Send-Invoice row right at the top of the page body, so the
  // header's ride-time badge would just be dead space above it — only show
  // the badge for the Advance tab's own selected-ride detail view.
  const showRideBadge = headerRideBooking && headerRideBooking.status !== "Bidding" && rideView !== "current";
  const headerHasContent = showHamburger || rideView === "advance" || biddingHeader || !!showRideBadge;

  return (
    <>
      <SuccessBurst show={showAcceptedBurst} text={lang === "en" ? "Booked!" : lang === "mr" ? "बुक झाले!" : "बुक हो गया!"} lang={lang} />
      <FloatingHamburgerHint show={showBookingHint && !showHamburger} onOpenMenu={() => { setMenuOpen(true); setShowBookingHint(false); }} lang={lang} />
      <div className="flex-1 overflow-y-auto relative">
        {headerHasContent && (
          <div className="flex items-center justify-between gap-2 px-5 pt-3">
            {showHamburger ? (
              <div className="relative shrink-0">
                <button onClick={() => { setMenuOpen(true); setShowBookingHint(false); }} className="w-9 h-9 rounded-full flex items-center justify-center shadow-sm" style={{ background: "#0052CC", border: "1.5px solid #0052CC" }}>
                  <Menu size={18} color="#fff" strokeWidth={2.5} />
                </button>
                <HamburgerHint show={showBookingHint} lang={lang} />
                {announcementAlerts.unreadCount > 0 && (
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-white shadow-sm" style={{ background: C.safety }}>
                    {announcementAlerts.unreadCount}
                  </span>
                )}
              </div>
            ) : rideView === "advance" ? (
              <button onClick={() => (selectedAdvanceId ? setSelectedAdvanceId(null) : setRideView("current"))} className="w-9 h-9 rounded-full flex items-center justify-center shadow-sm shrink-0" style={{ background: C.marigold, border: `1.5px solid ${C.marigoldDeep}` }}>
                <ChevronLeft size={18} color="#000000" strokeWidth={3} />
              </button>
            ) : biddingHeader ? (
              <button onClick={() => setAddingAnother(true)} className="w-9 h-9 rounded-full flex items-center justify-center shadow-sm shrink-0" style={{ background: C.marigold, border: `1.5px solid ${C.marigoldDeep}` }}>
                <ChevronLeft size={18} color="#000000" strokeWidth={3} />
              </button>
            ) : <div className="w-9 h-9 shrink-0" />}
            {showRideBadge ? (
              <div className="flex-1 min-w-0 rounded-full px-3 py-2 flex items-center justify-center gap-1.5 shadow-sm" style={{ background: headerRideBooking.scheduledFor ? C.marigoldDeep : C.success }}>
                <Clock3 size={16} color="#fff" strokeWidth={2.5} className="shrink-0" />
                <span className="text-sm font-extrabold text-white truncate">
                  {headerRideBooking.scheduledFor ? (lang === "en" ? "Advance Ride" : lang === "mr" ? "अ‍ॅडव्हान्स राइड" : "एडवांस राइड") : (lang === "en" ? "Immediate Ride" : lang === "mr" ? "तात्काळ राइड" : "तुरंत राइड")} · {rideDateTimeLabel(headerRideBooking)}
                </span>
              </div>
            ) : showHamburger ? (
              <div className="flex-1 min-w-0 flex items-center justify-end gap-2">
                {activeBooking && (
                  <button onClick={() => { setRideView("current"); setAddingAnother(false); }} title={lang === "en" ? "Go to current ride" : lang === "mr" ? "सध्याच्या राइडवर जा" : "मौजूदा राइड पर जाएं"}
                    className="w-9 h-9 rounded-full flex items-center justify-center shadow-sm shrink-0" style={{ background: C.marigold, border: `1.5px solid ${C.marigoldDeep}` }}>
                    <ArrowRight size={18} color="#000000" strokeWidth={2.5} />
                  </button>
                )}
              </div>
            ) : biddingHeader ? (
              <div className="flex-1 min-w-0">
                <span className="text-base font-black" style={{ color: C.ink }}>{lang === "en" ? "My Active Booking" : lang === "mr" ? "माझी सक्रिय बुकिंग" : "मेरी सक्रिय बुकिंग"}</span>
              </div>
            ) : (
              <div className="flex-1 min-w-0" />
            )}
            {showHamburger ? null : <div className="w-9 h-9 shrink-0" />}
          </div>
        )}
        <NotificationBanner permission={rideNotifications.permission} onEnable={rideNotifications.enable} lang={lang} />
        <ForegroundToast toast={rideNotifications.toast} />
        <AnnouncementAlertBanner announcement={announcementAlerts.latestUnread}
          onView={() => { announcementAlerts.markSeen(); setSettingsView("messages"); }}
          onDismiss={announcementAlerts.markSeen} lang={lang} />
        {menuOpen && (
          <div className="fixed inset-0 z-50 flex" onClick={() => setMenuOpen(false)}>
            <div className="w-72 max-w-[82%] h-full overflow-y-auto" style={{ background: C.paper }} onClick={(e) => e.stopPropagation()}>
              <div className="px-4 py-4 flex items-center gap-3" style={{ background: C.navy }}>
                <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 overflow-hidden" style={{ background: C.marigold }}>
                  {customerProfile?.photo ? <img src={customerProfile.photo.url} alt="" className="w-full h-full object-cover" /> : <UserCircle2 size={24} color="#000000" />}
                </div>
                <div>
                  <div className="text-sm font-bold text-white">{customerProfile?.name || (lang === "en" ? "Customer" : lang === "mr" ? "कस्टमर" : "कस्टमर")}</div>
                  {customerMobile && <div className="text-[11px]" style={{ color: "#FFFFFF", fontFamily: monoFont }}>{customerMobile}</div>}
                </div>
              </div>
              <div className="p-2 space-y-2" style={{ borderBottom: `1px solid ${C.line}` }}>
                <button onClick={() => { setRideView("current"); setAddingAnother(false); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-4 py-3 rounded-lg shadow-sm text-left" style={{ background: C.marigold }}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: "#000000" }}>
                    <Truck size={13} color={C.marigold} />
                  </div>
                  <div className="flex-1 min-w-0 text-xs font-black" style={{ color: "#000000" }}>{lang === "en" ? "Current Booking/s" : lang === "mr" ? "सध्याची बुकिंग पहा" : "वर्तमान बुकिंग देखें"} ({activeBooking ? 1 : 0})</div>
                </button>
                <button onClick={() => { setRideView("advance"); setSelectedAdvanceId(null); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-4 py-3 rounded-lg shadow-sm text-left" style={{ background: C.navy }}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: "#000000" }}>
                    <Clock3 size={13} color="#FFFFFF" />
                  </div>
                  <div className="flex-1 min-w-0 text-xs font-black" style={{ color: "#FFFFFF" }}>{lang === "en" ? "Advance Booking/s" : lang === "mr" ? "अ‍ॅडव्हान्स बुकिंग पहा" : "एडवांस बुकिंग देखें"} ({advanceBookings.length})</div>
                </button>
              </div>
              <button onClick={() => { setSettingsView("profile"); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-5 py-4 text-base font-semibold text-left" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
                <UserCircle2 size={16} color={C.marigoldDeep} /> {lang === "en" ? "My Profile" : lang === "mr" ? "माझी प्रोफाइल" : "मेरी प्रोफाइल"}
              </button>
              <button onClick={() => { setSettingsView("history"); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-5 py-4 text-base font-semibold text-left" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
                <Package size={16} color={C.marigoldDeep} /> {lang === "en" ? "Ride History" : lang === "mr" ? "राइड हिस्टरी" : "राइड हिस्ट्री"}
              </button>
              <button onClick={() => { setSettingsView("messages"); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-5 py-4 text-base font-semibold text-left" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
                <Bell size={16} color={C.marigoldDeep} /> {lang === "en" ? "Admin Announcements" : lang === "mr" ? "अ‍ॅडमिन सूचना" : "एडमिन सूचनाएं"} ({(adminNotifications || []).filter((n) => n.toRole === "customer" && (n.target === "all" || n.target === customerMobile)).length})
                {announcementAlerts.unreadCount > 0 && (
                  <span className="rounded-full px-1.5 py-0.5 text-[10px] font-black text-white" style={{ background: C.safety }}>{announcementAlerts.unreadCount} {lang === "en" ? "new" : lang === "mr" ? "नवीन" : "नई"}</span>
                )}
              </button>
              <button onClick={() => { shareApp(); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-5 py-4 text-base font-semibold text-left" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
                <MessageCircle size={16} color={C.success} /> {lang === "en" ? "Share App" : lang === "mr" ? "अ‍ॅप शेअर करा" : "ऐप शेयर करें"}
              </button>
              <button onClick={() => { setSettingsView("helpline"); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-5 py-4 text-base font-semibold text-left" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
                <Phone size={16} color={C.safety} /> {lang === "en" ? "Contact & Helpline" : lang === "mr" ? "संपर्क व हेल्पलाइन" : "संपर्क व हेल्पलाइन"}
              </button>
              <button onClick={() => { onOpenTerms(); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-5 py-4 text-base font-semibold text-left" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
                <ClipboardList size={16} color={C.marigoldDeep} /> {lang === "en" ? "Terms & Conditions" : lang === "mr" ? "नियम व अटी" : "नियम व शर्तें"}
              </button>
              <a href="/privacy.html" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-left" style={{ color: C.ink }}>
                <ShieldCheck size={16} color={C.marigoldDeep} /> {lang === "en" ? "Privacy Policy" : lang === "mr" ? "गोपनीयता धोरण" : "गोपनीयता नीति"}
              </a>
            </div>
            <div className="flex-1" style={{ background: "rgba(42,33,28,0.5)" }} />
          </div>
        )}
        {rideView === "current" ? (
          activeBooking && !addingAnother ? (
            <ActiveRide booking={activeBooking} vehicleTypes={vehicleTypes} cancelBooking={cancelBooking} acceptBid={acceptBid} driverVehicle={activeDriverVehicle} drivers={drivers} lang={lang}
              onAddAnother={() => setAddingAnother(true)}
              onBidAccepted={(booking) => {
                fireAcceptedBurst();
                // An accepted bid on a future-dated load moves it straight out
                // of the Current tab (see activeBooking/advanceBookings above) —
                // jump straight to its Advance detail view instead of dropping
                // back to the "What do you need?" chooser. The hamburger
                // hint is Advance-only (see task), so it only fires here.
                if (isFutureAdvance(booking.scheduledFor)) {
                  setShowBookingHint(true);
                  setRideView("advance");
                  setSelectedAdvanceId(booking.id);
                }
              }} />
          ) : (
            <CustomerBooking createLoad={createLoad} vehicleTypes={vehicleTypes} lastBooking={myBookings[0]} lang={lang}
              onModeChange={setCustomerBookingMode} />
          )
        ) : (
          <div>
            {selectedAdvanceId && advanceBookings.find((ab) => ab.id === selectedAdvanceId) ? (
              <ActiveRide booking={advanceBookings.find((ab) => ab.id === selectedAdvanceId)} vehicleTypes={vehicleTypes} cancelBooking={cancelBooking} acceptBid={acceptBid}
                driverVehicle={drivers.find((d) => d.name === advanceBookings.find((ab) => ab.id === selectedAdvanceId)?.driverName)?.vehicleSpec}
                drivers={drivers} lang={lang} onBidAccepted={() => { fireAcceptedBurst(); setShowBookingHint(true); }} />
            ) : (
              <div className="px-5 py-5">
                {advanceBookings.length === 0 ? (
                  <p className="text-sm text-center py-16" style={{ color: C.inkSoft }}>{lang === "en" ? "No advance bookings yet." : lang === "mr" ? "अजून कोणतीही अ‍ॅडव्हान्स बुकिंग नाही." : "अभी तक कोई एडवांस बुकिंग नहीं है।"}</p>
                ) : (
                  <div className="space-y-3">
                    {advanceBookings.map((ab) => (
                      <button key={ab.id} onClick={() => setSelectedAdvanceId(ab.id)} className="w-full text-left rounded-xl p-5 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                        <RideTypeBanner booking={ab} lang={lang} />
                        <RouteLine pickup={ab.pickup} drop={ab.drop} lang={lang} />
                        <div className="text-xs mt-2" style={{ color: C.inkSoft }}>{ab.status === "Bidding" ? (lang === "en" ? "Waiting for bids" : lang === "mr" ? "बोलीची वाट पाहत आहे" : "बोली का इंतज़ार") : (lang === "en" ? `Driver assigned — ${ab.driverName}` : lang === "mr" ? `ड्रायव्हर निश्चित झाला — ${ab.driverName}` : `ड्राइवर तय हो गया — ${ab.driverName}`)}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// =====================================================================
// DRIVER APP
// =====================================================================
function LoadAlertCard({ load, driver, addBid, lang, commissionPct = 0, minWallet = 0, skipLoad }) {
  const myBid = load.bids.find((b) => b.driverName === driver.name);
  const [amount, setAmount] = useState("");
  const [allowedHours, setAllowedHours] = useState("");
  const [extraHourRate, setExtraHourRate] = useState("");
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [bidError, setBidError] = useState("");
  // Skipping a load hides it for good on this device (see DriverHome's
  // persisted skip list) — irreversible from the UI, so it takes a second
  // tap to confirm rather than firing on one stray touch.
  const [confirmSkip, setConfirmSkip] = useState(false);

  const canSubmit = Number(amount) > 0 && Number(allowedHours) > 0 && Number(extraHourRate) > 0;
  const requiredForQuote = Number(amount || 0) * (commissionPct / 100);
  const walletShortfall = !isInTrial(driver.createdAt) && (driver.wallet - requiredForQuote) < minWallet;

  // Guided-step highlighting for the 3 quote fields — see GuidedStep/useGuidedSteps.
  // pinFocus is on here specifically because these fields flip "complete"
  // on a truthy partial number (Number("5") > 0), which caused the
  // mid-keystroke jump bug useGuidedSteps' pinFocus mode exists to fix.
  // autoAdvanceMs is shorter here (2.5s vs. the sign-up forms' 5s) — a fare/
  // hours/rate digit entry is quick to finish typing, so a driver bidding on
  // a fresh load alert shouldn't have to wait as long between fields.
  const stepCompleted = [Number(amount) > 0, Number(allowedHours) > 0, Number(extraHourRate) > 0];
  const { activeStep, stepProps } = useGuidedSteps(stepCompleted, { pinFocus: true, autoAdvanceMs: 2500 });

  const otherBids = load.bids.filter((b) => b.driverName !== driver.name);
  const lowestOther = otherBids.length ? otherBids.reduce((min, b) => b.amount < min.amount ? b : min) : null;
  const allAmounts = load.bids.map((b) => b.amount);
  const lowestOverall = allAmounts.length ? Math.min(...allAmounts) : null;
  const isMineHighest = myBid && allAmounts.length > 1 && myBid.amount === Math.max(...allAmounts) && myBid.amount !== lowestOverall;

  // Real straight-line distance from this driver's last known position to
  // the pickup point — was a random 1-6km placeholder before, which is why
  // two equally-placed drivers could show different "X km away" numbers on
  // the customer's bid list. null (not a fake number) when either location
  // is missing (e.g. an Advance load's driver hasn't gone Online yet) so
  // the customer's screen can just omit the line instead of showing junk.
  const distanceKm = (driver.lastKnownLocation && load.pickupLat != null && load.pickupLng != null)
    ? Math.round(haversineKm(driver.lastKnownLocation.lat, driver.lastKnownLocation.lng, load.pickupLat, load.pickupLng) * 10) / 10
    : null;

  const submitBid = () => {
    if (!canSubmit || myBid || walletShortfall) return;
    const err = addBid(load.id, {
      driverName: driver.name, amount: Number(amount),
      hours: Number(allowedHours), extraHourRate: Number(extraHourRate),
      rating: driver.rating || 4.6, distanceKm,
    });
    if (err) { setBidError(err); return; }
    setBidError("");
    setJustSubmitted(true);
    setTimeout(() => setJustSubmitted(false), 2500);
  };

  const inputCls = "w-full py-2 text-sm outline-none";
  const boxStyle = { border: `1px solid ${C.line}`, background: C.paper };

  // Once the bid lands, this card's job is done — it disappears from the
  // New Loads list entirely (see DriverHome's bidSentToast for the
  // confirmation the driver actually sees) instead of lingering as a
  // permanent "waiting" box.
  if (myBid) return null;

  return (
    <div className="toast-pop rounded-xl p-3 shadow-sm mb-3 transition-colors" style={{ background: C.paper, border: `2px solid ${justSubmitted ? C.success : C.marigoldDeep}` }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-bold flex items-center gap-1" style={{ color: C.marigoldDeep }}><Bell size={13} /> {lang === "en" ? "New Load" : lang === "mr" ? "नवीन लोड" : "नया लोड"}</span>
      </div>
      <RideTypeBanner booking={load} lang={lang} />
      <div className="mb-2">
        <div className="pb-2.5" style={{ color: C.ink, borderBottom: `2px solid ${C.navy}` }}><span className="text-lg font-black" style={{ color: C.navy }}>{lang === "en" ? "Pickup" : lang === "mr" ? "पिकअप" : "पिकअप"}: </span><span className="text-base font-normal">{load.pickup}</span></div>
        <div className="pt-2.5" style={{ color: C.ink }}><span className="text-lg font-black" style={{ color: C.navy }}>{lang === "en" ? "Drop" : lang === "mr" ? "ड्रॉप" : "ड्रॉप"}: </span><span className="text-base font-normal">{load.drop}</span></div>
      </div>

      {isMineHighest && (
        <div className="rounded-lg p-2 mb-2 text-[11px] font-semibold" style={{ background: C.safety, color: "#FFFFFF" }}>
          ⚠ {lang === "en" ? "Your quote is the highest" : lang === "mr" ? "तुमचे कोटेशन सर्वात जास्त आहे" : "आपका कोटेशन सबसे ज़्यादा है"} — {lowestOther ? (lang === "en" ? `${lowestOther.driverName}'s quote is ${fmt(lowestOther.amount)}` : lang === "mr" ? `${lowestOther.driverName} चे कोटेशन ${fmt(lowestOther.amount)} आहे` : `${lowestOther.driverName} का कोटेशन ${fmt(lowestOther.amount)} है`) : ""}
        </div>
      )}

      <div className="rounded-lg p-3 mb-2 shadow-lg" style={{ background: C.metallicGold, border: `2px solid ${C.marigoldDeep}` }}>
            <div className="text-sm font-extrabold mb-1.5" style={{ color: "#000000" }}>{lang === "en" ? "Enter your quote (all fields required)" : lang === "mr" ? "तुमचे कोटेशन भरा (सर्व फील्ड आवश्यक)" : "अपना कोटेशन भरें (सभी फील्ड ज़रूरी)"}</div>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: C.paper, color: C.navy }}>{load.distance} {lang === "en" ? "km" : lang === "mr" ? "किमी" : "किमी"}</span>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: C.paper, color: C.navy }}>{load.weight}{lang === "en" ? "kg" : lang === "mr" ? "किलो" : "किग्रा"}</span>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: C.paper, color: C.navy }}>{materialLabel(load.material, lang)}</span>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: C.safety, color: "#FFFFFF" }}>{lang === "en" ? "Fixed fare, no negotiation" : lang === "mr" ? "निश्चित भाडे, कोणतीही घासाघीस नाही" : "तय भाड़ा, कोई मोलभाव नहीं"}</span>
            </div>
            <div className="space-y-2">
              <GuidedStep {...stepProps(0)} lang={lang}>
                <div className="rounded-lg px-2 py-2.5 text-center" style={{ border: `2px solid ${C.marigoldDeep}`, background: C.paper }}>
                  <div className="text-sm font-black mb-1" style={{ color: "#000000", fontFamily: '"Arial Black", Arial, sans-serif', fontWeight: 900 }}>{lang === "en" ? "Fare ₹ *" : lang === "mr" ? "एकूण भाडे ₹ *" : "कुल भाड़ा ₹ *"}</div>
                  <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus
                    className="w-full text-center outline-none bg-transparent" style={{ color: C.navy, fontFamily: monoFont, fontSize: 26, fontWeight: 900 }} />
                </div>
              </GuidedStep>
              <div className="grid grid-cols-2 gap-2">
                <GuidedStep {...stepProps(1)} lang={lang}>
                  <div className="rounded-lg px-1.5 py-2 text-center h-full flex flex-col justify-center" style={{ border: `2px solid ${C.marigoldDeep}`, background: C.paper }}>
                    <div className="text-sm font-black mb-1 break-words" style={{ color: "#000000", fontFamily: '"Arial Black", Arial, sans-serif', fontWeight: 900 }}>{lang === "en" ? "Loading/Unloading hrs *" : lang === "mr" ? "लोडिंग/अनलोडिंग तास *" : "लोडिंग/अनलोडिंग घंटे *"}</div>
                    <input type="number" value={allowedHours} onChange={(e) => setAllowedHours(e.target.value)} placeholder="0"
                      className="w-full text-center outline-none bg-transparent" style={{ color: C.navy, fontFamily: monoFont, fontSize: 18, fontWeight: 900 }} />
                  </div>
                </GuidedStep>
                <GuidedStep {...stepProps(2)} lang={lang}>
                  <div className="rounded-lg px-1.5 py-2 text-center h-full flex flex-col justify-center" style={{ border: `2px solid ${C.marigoldDeep}`, background: C.paper }}>
                    <div className="text-sm font-black mb-1 break-words" style={{ color: "#000000", fontFamily: '"Arial Black", Arial, sans-serif', fontWeight: 900 }}>{lang === "en" ? "Waiting charges ₹/hr *" : lang === "mr" ? "वेटिंग चार्ज ₹/तास *" : "वेटिंग चार्ज ₹/घं *"}</div>
                    <input type="number" value={extraHourRate} onChange={(e) => setExtraHourRate(e.target.value)} placeholder="0"
                      className="w-full text-center outline-none bg-transparent" style={{ color: C.navy, fontFamily: monoFont, fontSize: 16, fontWeight: 900 }} />
                  </div>
                </GuidedStep>
              </div>
            </div>
          </div>
          {!canSubmit && (amount || allowedHours || extraHourRate) && (
            <div className="text-[10px] mb-2 font-semibold" style={{ color: C.safety }}>{lang === "en" ? "All three fields are required" : lang === "mr" ? "तिन्ही फील्ड भरणे आवश्यक आहे" : "तीनों फील्ड भरना ज़रूरी है"}</div>
          )}
          {canSubmit && walletShortfall && (
            <div className="text-[10px] mb-2 font-semibold" style={{ color: C.safety }}>
              {lang === "en" ? `Not enough wallet balance to cover ${commissionPct}% commission on this fare — recharge your wallet first.` : lang === "mr" ? `या भाड्यावर ${commissionPct}% कमिशनसाठी वॉलेटमध्ये पुरेसे बॅलन्स नाही — आधी वॉलेट रिचार्ज करा.` : `इस भाड़े पर ${commissionPct}% कमीशन के लिए वॉलेट में पर्याप्त बैलेंस नहीं है — पहले वॉलेट रीचार्ज करें।`}
            </div>
          )}
          {bidError && (
            <div className="rounded-lg p-2.5 mb-2 text-xs font-bold text-center" style={{ background: C.safety, color: "#FFFFFF" }}>{bidError}</div>
          )}

          <button onClick={submitBid} disabled={!canSubmit || walletShortfall} className={`w-full rounded-xl py-4 text-lg font-black text-white flex items-center justify-center gap-1.5 mb-2 ${canSubmit && !walletShortfall && !justSubmitted ? "guided-submit-ready shadow-lg" : (canSubmit && !walletShortfall) || justSubmitted ? "shadow-lg" : "shadow-sm"}`}
            style={{ background: (canSubmit && !walletShortfall) || justSubmitted ? C.metallicGreen : "#E0E0E0", color: (canSubmit && !walletShortfall) || justSubmitted ? "#fff" : "#9AA3B0" }}>
            {justSubmitted ? <><CheckCircle2 size={18} /> {lang === "en" ? "Sent" : lang === "mr" ? "पाठवले" : "भेज दिया"}</> : (lang === "en" ? "Send Quote" : lang === "mr" ? "कोटेशन पाठवा" : "कोटेशन भेजें")}
          </button>

          <div className="rounded-lg p-2.5 mb-2" style={{ background: C.marigoldDeep }}>
            <div className="text-xs font-black mb-1" style={{ color: "#FFFFFF" }}>⚠️ {lang === "en" ? "Note" : lang === "mr" ? "नोंद" : "नोट"}</div>
            <div className="text-[10px] font-bold" style={{ color: "#FFFFFF" }}>
              {lang === "en" ? "Toll tax on the route must be paid by the driver from this fare — customer pays no separate toll." : lang === "mr" ? "रस्त्यावरील टोल टॅक्स याच भाड्यातून ड्रायव्हरला द्यावा लागेल — ग्राहक वेगळा टोल देणार नाही." : "रास्ते का टोल टैक्स इसी भाड़े में से ड्राइवर को देना होगा — ग्राहक अलग से टोल नहीं देगा।"}
            </div>
            <div className="text-[10px] font-bold mt-1" style={{ color: "#000000" }}>
              {lang === "en" ? "Travel time between pickup and drop is not counted in loading/unloading time." : lang === "mr" ? "पिकअप आणि ड्रॉपमधील प्रवासाचा वेळ लोडिंग/अनलोडिंग वेळेत मोजला जात नाही." : "पिकअप और ड्रॉप के बीच की यात्रा का समय लोडिंग/अनलोडिंग समय में नहीं गिना जाता।"}
            </div>
          </div>

          <div className="flex justify-center">
            <button type="button"
              onClick={() => {
                if (!confirmSkip) { setConfirmSkip(true); setTimeout(() => setConfirmSkip(false), 3000); return; }
                skipLoad?.(load.id);
              }}
              className="rounded-lg px-3 py-1 text-[11px] font-bold"
              style={{ background: "#EDEDED", color: C.inkSoft, border: `1px solid ${C.line}` }}>
              {confirmSkip
                ? (lang === "en" ? "Tap again to skip" : lang === "mr" ? "वगळण्यासाठी पुन्हा टॅप करा" : "छोड़ने के लिए फिर टैप करें")
                : (lang === "en" ? "Skip this load" : lang === "mr" ? "हा लोड वगळा" : "इस लोड को छोड़ें")}
            </button>
          </div>
    </div>
  );
}

function fmtHMS(ms) {
  const hh = Math.floor(ms / 3600000);
  const mm = Math.floor((ms % 3600000) / 60000);
  const ss = Math.floor((ms % 60000) / 1000);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
// "X hr Y min" — used on the trip breakdown table/invoice, where whole
// minutes read easier than a HH:MM:SS stopwatch face.
function fmtHrMin(ms, lang) {
  const totalMin = Math.round(Math.max(0, ms) / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return lang === "en" ? `${h} hr ${m} min` : lang === "mr" ? `${h} तास ${m} मिनिट` : `${h} घं ${m} मिनट`;
}
// Splits a completed trip's total loading-to-drop-off time into its three
// billing categories — loading/unloading (up to the booked allowance),
// travel (paused out of the clock entirely, see the geofence in
// DriverHome), and waiting (the overage beyond the booked allowance,
// billed via the 15-min-grace rule in useTripClock). Derived straight from
// the persisted booking fields, not the live clock, so it works the same
// whether it's rendered from the driver's onEnded snapshot or the
// customer's Firestore doc.
function tripHourBreakdown(trip) {
  const bookedHours = trip.hours || 0;
  const pausedMs = trip.pausedMs || 0;
  const totalMs = trip.completedAt && trip.loadingStartedAt ? Math.max(0, trip.completedAt - trip.loadingStartedAt) : 0;
  const activeMs = Math.max(0, totalMs - pausedMs);
  const waitingMs = Math.max(0, activeMs - bookedHours * 3600000);
  const loadingUnloadingMs = activeMs - waitingMs;
  return { totalMs, loadingUnloadingMs, travelMs: pausedMs, waitingMs };
}

// The itemized Context/Time/Charges table shown on both trip summary
// screens (and mirrored as plain text in the downloadable invoice) — bold,
// left-aligned Time/Charges columns, and full solid-black borders per the
// agreed design, not the app's usual thin grey hairlines.
function TripBreakdownTable({ baseFareLabel, baseFare, totalAmount, trip, lang }) {
  const { totalMs, loadingUnloadingMs, waitingMs } = tripHourBreakdown(trip);
  const cellStyle = { border: "1.5px solid #000000", padding: "8px 10px", fontSize: 13, textAlign: "left" };
  const Row = ({ context, time, charges, bold, zebra }) => (
    <tr style={{ background: bold ? C.success : zebra ? C.bg : C.paper }}>
      <td style={{ ...cellStyle, fontFamily: bodyFont, fontWeight: bold ? 900 : 700, color: bold ? "#fff" : "#000000" }}>{context}</td>
      <td style={{ ...cellStyle, fontFamily: monoFont, color: bold ? "#fff" : time ? "#000000" : C.inkSoft }}>{time || "—"}</td>
      <td style={{ ...cellStyle, fontFamily: monoFont, color: bold ? "#fff" : charges ? "#000000" : C.inkSoft }}>{charges || "—"}</td>
    </tr>
  );
  return (
    <div className="rounded-xl overflow-hidden mb-2.5 shadow-sm" style={{ border: "2px solid #000000" }}>
      <table className="w-full" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: C.marigold }}>
            <th style={{ ...cellStyle, fontFamily: bodyFont, color: "#000000" }}>{lang === "en" ? "Context" : lang === "mr" ? "तपशील" : "विवरण"}</th>
            <th style={{ ...cellStyle, fontFamily: bodyFont, color: "#000000" }}>{lang === "en" ? "Time" : lang === "mr" ? "वेळ" : "समय"}</th>
            <th style={{ ...cellStyle, fontFamily: bodyFont, color: "#000000" }}>{lang === "en" ? "Charges (₹)" : lang === "mr" ? "चार्ज (₹)" : "चार्ज (₹)"}</th>
          </tr>
        </thead>
        <tbody>
          <Row context={baseFareLabel} charges={fmt(baseFare)} />
          <Row context={lang === "en" ? "Total time" : lang === "mr" ? "एकूण वेळ" : "कुल समय"} time={fmtHrMin(totalMs, lang)} zebra />
          <Row context={lang === "en" ? "Loading/Unloading time" : lang === "mr" ? "लोडिंग/अनलोडिंग वेळ" : "लोडिंग/अनलोडिंग समय"} time={fmtHrMin(loadingUnloadingMs, lang)} />
          {trip.extraCharge > 0 && (
            <Row context={`${lang === "en" ? "Waiting charge" : lang === "mr" ? "वेटिंग चार्ज" : "वेटिंग चार्ज"} (${fmt(trip.extraHourRate || 0)}/${lang === "en" ? "hr" : lang === "mr" ? "तास" : "घं"})`}
              time={fmtHrMin(waitingMs, lang)} charges={fmt(trip.extraCharge)} />
          )}
          <Row context={lang === "en" ? "Total" : lang === "mr" ? "एकूण" : "कुल"} charges={fmt(totalAmount)} bold />
        </tbody>
      </table>
    </div>
  );
}

// Shared elapsed/remaining-time math for a loading trip, used by both the
// driver's timer screen and the customer's ongoing-trip overtime banner so
// the "बीप-बीप" alarm behaves identically on both sides.
//
// pausedMs (completed travel segments) and travelPausedAt (an in-progress
// one, set while the driver is between the pickup and drop geofences — see
// LOADING_GEOFENCE_M) are subtracted out here so every downstream number —
// remaining time, overtime, waiting charge — reflects only time actually
// spent at the pickup/drop point, never the drive between them.
function useTripClock(loadingStartedAt, hours, extraHourRate, pausedMs = 0, travelPausedAt = null) {
  const [now, setNow] = useState(Date.now());
  const beepedRef = useRef(false);
  const started = !!loadingStartedAt;
  const isPaused = !!travelPausedAt;

  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [started, loadingStartedAt]);

  const rawElapsedMs = started ? now - loadingStartedAt : 0;
  const currentPauseMs = isPaused ? Math.max(0, now - travelPausedAt) : 0;
  const elapsedMs = Math.max(0, rawElapsedMs - (pausedMs || 0) - currentPauseMs);
  const elapsedHoursExact = elapsedMs / 3600000;
  const bookedHours = hours || 0;
  const isOvertime = started && bookedHours > 0 && elapsedHoursExact >= bookedHours;
  const extraHours = Math.max(0, elapsedHoursExact - bookedHours);
  // Waiting is billed in full-hour blocks, not pro-rated by the minute, but
  // with a 15-minute grace window at the start of each block — up to 15
  // minutes into a waiting hour costs nothing extra yet, but a single
  // minute past that bills the whole hour.
  const WAITING_GRACE_HOURS = 0.25;
  const extraHoursWhole = Math.floor(extraHours);
  const extraHoursFraction = extraHours - extraHoursWhole;
  const billableHours = extraHours > 0 ? extraHoursWhole + (extraHoursFraction > WAITING_GRACE_HOURS ? 1 : 0) : 0;
  const extraCharge = Math.round(billableHours * (extraHourRate || 0));
  const remainingMs = Math.max(0, bookedHours * 3600000 - elapsedMs);
  // A separate stopwatch for the waiting-time box — starts fresh at zero the
  // moment overtime begins, instead of reusing the trip's total elapsed time.
  const waitingElapsedMs = Math.max(0, elapsedMs - bookedHours * 3600000);

  useEffect(() => {
    if (isOvertime && !beepedRef.current) {
      beepedRef.current = true;
      playBeepTone();
    }
    if (!isOvertime) beepedRef.current = false;
  }, [isOvertime]);

  return { started, isPaused, isOvertime, extraHours, billableHours, extraCharge, elapsedStr: fmtHMS(elapsedMs), remainingStr: fmtHMS(remainingMs), waitingElapsedStr: fmtHMS(waitingElapsedMs) };
}

// Read-only overtime banner shown on the customer's ongoing-trip card —
// mirrors the driver's alarm so both sides get the "समय खत्म" alert.
function TripOvertimeBanner({ booking, lang }) {
  const clock = useTripClock(booking.loadingStartedAt, booking.hours, booking.extraHourRate, booking.pausedMs, booking.travelPausedAt);
  if (!clock.started || !clock.isOvertime) return null;
  return (
    <div className="rounded-lg mt-2 p-2.5" style={{ background: C.safety }}>
      <div className="text-[11px] font-bold" style={{ color: "#FFFFFF" }}>🔔 {lang === "en" ? "Beep-beep! Loading/Unloading time is over" : lang === "mr" ? "बीप-बीप! लोडिंग/अनलोडिंग वेळ संपली" : "बीप-बीप! लोडिंग/अनलोडिंग समय खत्म हो गया"}</div>
      <div className="text-[11px] mt-0.5" style={{ color: "#FFFFFF" }}>
        {lang === "en" ? `Extra time: ${clock.extraHours.toFixed(2)} hrs (billed as ${clock.billableHours} hr${clock.billableHours === 1 ? "" : "s"}) · Waiting charge so far: ${fmt(clock.extraCharge)}` : lang === "mr" ? `अतिरिक्त वेळ: ${clock.extraHours.toFixed(2)} तास (${clock.billableHours} तासांनुसार बिल) · आतापर्यंत वेटिंग चार्ज: ${fmt(clock.extraCharge)}` : `अतिरिक्त समय: ${clock.extraHours.toFixed(2)} घंटे (${clock.billableHours} घंटे के हिसाब से बिल) · अब तक वेटिंग चार्ज: ${fmt(clock.extraCharge)}`}
      </div>
      {clock.isPaused && (
        <div className="text-[11px] mt-1 font-semibold" style={{ color: "#FFFFFF" }}>⏸ {lang === "en" ? "Timer paused — travel time isn't counted" : lang === "mr" ? "टायमर थांबलेला आहे — प्रवासाचा वेळ मोजला जात नाही" : "टाइमर रुका हुआ है — यात्रा का समय नहीं गिना जाता"}</div>
      )}
    </div>
  );
}

function LoadingTimer({ trip, completeBooking, lang, onEnded }) {
  const clock = useTripClock(trip.loadingStartedAt, trip.hours, trip.extraHourRate, trip.pausedMs, trip.travelPausedAt);

  // Entering the OTP itself now happens up top, next to the Online/Offline
  // switch (see DriverOtpEntry) — mirrors where the customer's own OTP
  // display sits on their Active Ride page. Nothing to show here until
  // that's actually done and loading has started.
  if (!trip.loadingStartedAt) return null;

  return (
    <div className="mt-3 space-y-2.5">
      <div className="grid grid-cols-2 gap-2.5">
      {/* Whichever box is actually counting right now gets the same
          guided-step glow every multi-field form on the app uses (see
          .guided-step-active) — Loading/Unloading while active, Waiting
          Time once overtime kicks in — so it's obvious at a glance which
          clock matters at this moment. */}
      <div className={`rounded-2xl p-3.5 shadow-lg ${!clock.isOvertime ? "guided-step-active" : ""}`} style={{ background: C.metallicGold, border: `2px solid ${C.pimpri}` }}>
        {trip.hours ? (
          <>
            {clock.isOvertime ? (
              <div className="text-base font-extrabold" style={{ color: C.safety, fontFamily: bodyFont }}>⏰ {lang === "en" ? "Time's Up" : lang === "mr" ? "वेळ संपली" : "समय खत्म"}</div>
            ) : (
              <>
                <div className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Loading/Unloading time remaining" : lang === "mr" ? "उरलेला लोडिंग/अनलोडिंग वेळ" : "बचा हुआ लोडिंग/अनलोडिंग समय"}</div>
                <div className="text-base font-extrabold mt-1" style={{ color: "#000000", fontFamily: bodyFont, fontVariantNumeric: "tabular-nums" }}>{clock.remainingStr}</div>
              </>
            )}
            <div className="text-sm font-bold mt-1" style={{ color: clock.isOvertime ? C.safety : "#000000", fontFamily: bodyFont, fontVariantNumeric: "tabular-nums" }}>{lang === "en" ? `Loading/Unloading: ${trip.hours} hrs · elapsed ${clock.elapsedStr}` : lang === "mr" ? `लोडिंग/अनलोडिंग वेळ: ${trip.hours} तास · आतापर्यंत ${clock.elapsedStr}` : `लोडिंग/अनलोडिंग समय: ${trip.hours} घंटे · अब तक ${clock.elapsedStr}`}</div>
          </>
        ) : (
          <>
            <div className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Loading started" : lang === "mr" ? "लोडिंग सुरू होऊन" : "लोडिंग शुरू हुए"}</div>
            <div className="text-base font-extrabold mt-1" style={{ color: "#000000", fontFamily: bodyFont, fontVariantNumeric: "tabular-nums" }}>{clock.elapsedStr}</div>
            <div className="text-sm font-bold mt-1" style={{ color: "#000000", fontFamily: bodyFont }}>{lang === "en" ? "Driver had not set loading/unloading time" : lang === "mr" ? "ड्रायव्हरने लोडिंग/अनलोडिंग वेळ भरली नव्हती" : "ड्राइवर ने लोडिंग/अनलोडिंग समय नहीं भरा था"}</div>
          </>
        )}
        {clock.isPaused && (
          <div className="text-xs mt-1.5 font-bold" style={{ color: C.safety, fontFamily: bodyFont }}>⏸ {lang === "en" ? "Paused — travel time isn't counted" : lang === "mr" ? "थांबलेले — प्रवासाचा वेळ मोजला जात नाही" : "रुका हुआ — यात्रा का समय नहीं गिना जाता"}</div>
        )}
      </div>

      {/* Blurred (the whole box, not just the number) until the
          loading/unloading box to the left actually hits Time's Up —
          reads as "not relevant yet" instead of a misleadingly sharp
          00:00:00. Sharpens for good the instant overtime begins; the
          loading/unloading box is never blurred, including once it's done. */}
      <div className={`rounded-2xl p-3.5 shadow-lg transition-[filter] duration-300 ${clock.isOvertime ? "guided-step-active" : ""}`}
        style={{ background: C.metallicGold, border: `2px solid ${C.pimpri}`, filter: clock.isOvertime ? "none" : "blur(4px)" }}>
        <div className="text-xs" style={{ color: C.inkSoft }}>🔔 {lang === "en" ? "Waiting time" : lang === "mr" ? "वेटिंग वेळ" : "वेटिंग समय"}</div>
        <div className="text-base font-extrabold mt-1" style={{ color: "#000000", fontFamily: bodyFont, fontVariantNumeric: "tabular-nums" }}>{clock.isOvertime ? clock.waitingElapsedStr : "00:00:00"}</div>
        {clock.isOvertime ? (
          trip.extraHourRate ? (
            <div className="text-sm font-bold mt-1" style={{ color: "#000000", fontFamily: bodyFont }}>
              {lang === "en" ? `Billed as ${clock.billableHours} hr${clock.billableHours === 1 ? "" : "s"} · Waiting charge so far: ${fmt(clock.extraCharge)}` : lang === "mr" ? `${clock.billableHours} तासांनुसार बिल · आतापर्यंत वेटिंग चार्ज: ${fmt(clock.extraCharge)}` : `${clock.billableHours} घंटे के हिसाब से बिल · अब तक वेटिंग चार्ज: ${fmt(clock.extraCharge)}`}
            </div>
          ) : (
            <div className="text-sm font-bold mt-1" style={{ color: "#000000", fontFamily: bodyFont }}>{lang === "en" ? "Running until you end the trip" : lang === "mr" ? "ट्रिप संपेपर्यंत सुरू आहे" : "ट्रिप खत्म करने तक चल रहा है"}</div>
          )
        ) : (
          <div className="text-sm font-bold mt-1" style={{ color: "#000000", fontFamily: bodyFont }}>{lang === "en" ? "Starts once loading/unloading time is over" : lang === "mr" ? "लोडिंग/अनलोडिंग वेळ संपल्यावर सुरू होईल" : "लोडिंग/अनलोडिंग समय खत्म होने पर शुरू होगा"}</div>
        )}
      </div>
      </div>

      <button
        onClick={() => {
          completeBooking(trip.id, clock.extraCharge);
          onEnded?.({ ...trip, extraCharge: clock.extraCharge, billableHours: clock.billableHours, waitingElapsedStr: clock.waitingElapsedStr });
        }}
        className="w-full rounded-lg py-3.5 font-bold text-base text-white shadow-lg" style={{ background: C.metallicGreen }}>
        {lang === "en" ? "End Trip" : lang === "mr" ? "एंड ट्रिप" : "एंड ट्रिप"}
      </button>
    </div>
  );
}

// Compact OTP entry sitting next to the Online/Offline switch at the top of
// the driver's Active Ride page — same top-row position as the read-only
// OTP the customer sees on their own Active Ride page. Pulses (via the same
// guided-submit-ready animation used for other ready-to-act CTAs) so it's
// impossible to miss once there's an actual trip waiting on it.
function DriverOtpEntry({ trip, startLoading, lang }) {
  const [otpInput, setOtpInput] = useState("");
  const [otpError, setOtpError] = useState(false);

  // Auto-submits the moment the 4th digit lands — no separate Confirm tap.
  const handleChange = (e) => {
    const next = e.target.value.replace(/\D/g, "").slice(0, 4);
    setOtpInput(next);
    setOtpError(false);
    if (next.length === 4) {
      if (next === String(trip.otp || "")) {
        startLoading(trip.id);
      } else {
        setOtpError(true);
        setOtpInput("");
      }
    }
  };

  return (
    <div className="flex-1 min-w-0">
      <div className="guided-submit-ready flex items-center justify-center rounded-xl px-2.5 py-1.5" style={{ background: C.paper, border: `1.5px solid ${C.marigoldDeep}` }}>
        <input value={otpInput} onChange={handleChange}
          placeholder={lang === "en" ? "Enter OTP" : lang === "mr" ? "OTP टाका" : "OTP डालें"} maxLength={4} inputMode="numeric"
          className="w-full text-center outline-none bg-transparent" style={{ color: C.ink, fontFamily: monoFont, fontSize: 18, letterSpacing: 4, fontWeight: 900 }} />
      </div>
      {otpError && <div className="text-[10px] font-semibold mt-1" style={{ color: C.safety }}>{lang === "en" ? "Incorrect OTP — ask the customer again" : lang === "mr" ? "OTP चुकीचा आहे — ग्राहकाला पुन्हा विचारा" : "OTP गलत है — ग्राहक से दोबारा पूछें"}</div>}
    </div>
  );
}

// Post-trip receipt shown right after End Trip is tapped — the booking has
// already flipped to status "Completed" by then (so myTrip in DriverHome no
// longer matches it), so this renders from the snapshot LoadingTimer's
// onEnded captured at the moment of the tap, not from the live booking.
function DriverTripSummary({ trip, lang, onDone }) {
  const baseFare = trip.fare || 0;
  const totalAmount = baseFare + (trip.extraCharge || 0);
  const completedLabel = trip.completedAt ? new Date(trip.completedAt).toLocaleString(lang === "en" ? "en-IN" : lang === "mr" ? "mr-IN" : "hi-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <div>
      <div className="rounded-2xl p-4 mb-3 shadow-sm text-center" style={{ background: C.paper, border: `1.5px solid ${C.success}` }}>
        <CheckCircle2 size={32} color={C.success} className="mx-auto mb-1.5" />
        <div className="text-lg font-black" style={{ color: C.ink }}>{lang === "en" ? "Trip Completed" : lang === "mr" ? "ट्रिप पूर्ण झाली" : "ट्रिप पूरी हुई"}</div>
        {completedLabel && <div className="text-xs font-bold mt-0.5" style={{ color: C.inkSoft }}>{completedLabel}</div>}
      </div>

      <div className="rounded-2xl p-3.5 mb-2.5 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
        <RouteLine pickup={trip.pickup} drop={trip.drop} lang={lang} />
      </div>

      <TripBreakdownTable baseFareLabel={lang === "en" ? "Base fare" : lang === "mr" ? "बेस भाडे" : "बेस भाड़ा"} baseFare={baseFare} totalAmount={totalAmount} trip={trip} lang={lang} />

      <button onClick={onDone} className="w-full rounded-lg py-3.5 font-bold text-base text-white shadow-lg" style={{ background: C.metallicGreen }}>
        {lang === "en" ? "Done" : lang === "mr" ? "पूर्ण" : "पूर्ण"}
      </button>
    </div>
  );
}

function DriverHome({ driver, bookings, addBid, completeBooking, startLoading, vehicleTypes, lang, commissionPct, minWallet }) {
  const myTrip = bookings.find((b) => b.status === "Ongoing" && b.driverName === driver.name && !isFutureAdvance(b.scheduledFor));
  // Snapshot of the trip End Trip was just tapped on — the booking flips to
  // "Completed" immediately (see LoadingTimer's onEnded), which makes myTrip
  // above stop matching it on the very next render, so this is what the
  // summary screen renders from instead of the (by then gone) live trip.
  const [completedTrip, setCompletedTrip] = useState(null);
  // A driver sees a load if it needs their exact vehicle type, or any
  // smaller/lighter type — a bigger truck can always carry a smaller load,
  // so "above" vehicle options can bid too, not just an exact match.
  const driverVehicleDef = vehicleTypes.find((v) => v.key === driver.vehicleSpec?.type);

  // If this driver has an upcoming Advance booking, Current (immediate)
  // loads are hidden entirely — no notification, no listing, no bidding —
  // starting N hours before it (N scaled by this driver's own vehicle
  // tonnage), so they aren't pulled toward a new immediate job while they
  // should be prepping for/heading to the advance one. Used only for the
  // banner below — the actual filtering (which also covers any OTHER load,
  // including another Advance one, whose time would conflict) is done by
  // findDriverLoadConflict in openLoads.
  const myAdvanceBookings = bookings.filter((b) => b.status === "Ongoing" && b.driverName === driver.name && isFutureAdvance(b.scheduledFor));
  const notificationsLocked = myAdvanceBookings.some((b) => {
    const scheduled = parseScheduledFor(b.scheduledFor);
    const lockHours = notificationLockHours(driverVehicleDef?.capacityKg || 0);
    const lockStart = scheduled.getTime() - lockHours * 60 * 60 * 1000;
    return Date.now() >= lockStart && Date.now() < scheduled.getTime();
  });

  // A load never even shows up if it would conflict with a commitment this
  // driver already has (current trip in progress, or an upcoming Advance
  // booking plus its vehicle-tonnage buffer) — no bidding, no alert to work
  // around, it's simply not in the list.
  const openLoads = bookings.filter((b) => {
    if (b.status !== "Bidding") return false;
    // Current (immediate) loads only go to drivers within BID_RADIUS_KM of
    // the pickup point — a driver with no location on file yet (hasn't gone
    // Online long enough for a GPS fix) simply doesn't see these loads.
    // Advance bookings are exempt since the driver has time to travel there.
    if (!isFutureAdvance(b.scheduledFor) && b.pickupLat != null && b.pickupLng != null) {
      if (!driver.lastKnownLocation) return false;
      const distKm = haversineKm(driver.lastKnownLocation.lat, driver.lastKnownLocation.lng, b.pickupLat, b.pickupLng);
      if (distKm > BID_RADIUS_KM) return false;
    }
    if (findDriverLoadConflict(driver, { id: b.id, scheduledFor: b.scheduledFor }, bookings, vehicleTypes, lang)) return false;
    if (!driverVehicleDef) return true;
    const loadVehicleDef = vehicleTypes.find((v) => v.key === b.vehicle);
    if (!loadVehicleDef) return b.vehicle === driver.vehicleSpec.type;
    return loadVehicleDef.capacityKg <= driverVehicleDef.capacityKg;
  });

  // Loads still open for bidding that this driver hasn't already quoted on.
  // LoadAlertCard renders nothing once this driver has a bid on a load (see
  // its myBid check), so the "No new load" empty state and the list below
  // must both key off this instead of raw openLoads — otherwise bidding on
  // the only open load would leave a blank gap rather than either the empty
  // state or the next available load.
  // Loads this driver has tapped "Skip this load" on — hidden for good on
  // this device. Persisted per-driver so a skip survives a refresh; keyed
  // by mobile so a shared device doesn't leak one driver's skips to another.
  const [skippedLoadIds, setSkippedLoadIds] = usePersistedState(`sarthi_driverSkippedLoads_${driver.mobile}`, []);
  const skipLoad = (id) => setSkippedLoadIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  const visibleLoads = openLoads.filter((l) => !l.bids?.some((b) => b.driverName === driver.name) && !skippedLoadIds.includes(l.id));

  // No search bar / route filter for drivers — every new matching load rings
  // (beep + toast) the moment it's posted, instead of drivers having to search.
  const seenLoadIdsRef = useRef(null);
  const [newLoadToast, setNewLoadToast] = useState(null);
  const loadIdsKey = openLoads.map((l) => l.id).join(",");

  useEffect(() => {
    const currentIds = new Set(openLoads.map((l) => l.id));
    if (seenLoadIdsRef.current === null) {
      seenLoadIdsRef.current = currentIds;
      return;
    }
    const freshLoads = openLoads.filter((l) => !seenLoadIdsRef.current.has(l.id));
    if (freshLoads.length > 0 && driver.online && driver.kyc === "Approved" && !driver.blacklisted && !notificationsLocked) {
      playBeepTone();
      setNewLoadToast(freshLoads[0]);
      setTimeout(() => setNewLoadToast((cur) => (cur?.id === freshLoads[0].id ? null : cur)), 4000);
    }
    seenLoadIdsRef.current = currentIds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadIdsKey, notificationsLocked]);

  // Detects the moment a load this driver quoted on resolves against them —
  // by the time that happens the load has already left openLoads entirely
  // (it's no longer status "Bidding"), so this watches the full bookings
  // list rather than openLoads to still catch it and surface a note. Also
  // catches the opposite transition (a bid this driver just placed landing
  // in Firestore) to confirm it with a brief toast instead of a permanent
  // box taking over the card.
  const myPendingBidIdsRef = useRef(null);
  const [bidRejectedToast, setBidRejectedToast] = useState(false);
  const [bidSentToast, setBidSentToast] = useState(false);
  // The driver-side equivalent of CustomerApp's showAcceptedBurst — see
  // SuccessBurst. Fires the moment one of this driver's pending bids
  // resolves in their own favor (the load leaves Bidding with their name on
  // it), same detection shape as lostOne just below.
  const [bidWonBurst, setBidWonBurst] = useState(false);
  const bidStatusKey = bookings.map((b) => `${b.id}:${b.status}:${b.driverName || ""}`).join(",");
  useEffect(() => {
    const currentPending = new Set(bookings.filter((b) => b.status === "Bidding" && b.bids?.some((x) => x.driverName === driver.name)).map((b) => b.id));
    if (myPendingBidIdsRef.current === null) {
      myPendingBidIdsRef.current = currentPending;
      return;
    }
    const prevPending = myPendingBidIdsRef.current;
    const lostOne = [...prevPending].some((id) => {
      if (currentPending.has(id)) return false;
      const b = bookings.find((x) => x.id === id);
      return b && b.status !== "Bidding" && b.driverName !== driver.name;
    });
    if (lostOne) {
      setBidRejectedToast(true);
      setTimeout(() => setBidRejectedToast(false), 4000);
    }
    const wonOne = [...prevPending].some((id) => {
      if (currentPending.has(id)) return false;
      const b = bookings.find((x) => x.id === id);
      return b && b.status !== "Bidding" && b.driverName === driver.name;
    });
    if (wonOne) {
      setBidWonBurst(true);
      setTimeout(() => setBidWonBurst(false), 1400);
    }
    const sentOne = [...currentPending].some((id) => !prevPending.has(id));
    if (sentOne) {
      setBidSentToast(true);
      setTimeout(() => setBidSentToast(false), 2500);
    }
    myPendingBidIdsRef.current = currentPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bidStatusKey]);

  // Real GPS live-tracking: while this driver has an active trip, share their
  // actual device location so the customer (and admin fleet map) see it live.
  // Also runs whenever the driver is simply Online (not on a trip) so
  // lastKnownLocation stays fresh for the 100km bid-radius check below —
  // otherwise an idle online driver would have no location on file at all.
  const lastGpsWriteRef = useRef(0);
  // The watch below only resubscribes when the trip ID changes (see its own
  // dependency array) — kept in sync separately here so the GPS callback
  // always reads this trip's current pause-tracking fields instead of a
  // stale closure from whenever that ID last changed.
  const myTripRef = useRef(myTrip);
  useEffect(() => { myTripRef.current = myTrip; }, [myTrip]);
  useEffect(() => {
    if ((!myTrip && !driver.online) || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastGpsWriteRef.current < 5000) return; // throttle Firestore writes
        lastGpsWriteRef.current = now;
        const location = { lat: pos.coords.latitude, lng: pos.coords.longitude, updatedAt: now };
        if (myTrip) patchDoc("bookings", myTrip.id, { driverLocation: location }).catch((e) => console.error(e));
        if (driver.mobile) patchDoc("drivers", driver.mobile, { lastKnownLocation: location }).catch((e) => console.error(e));

        // Loading/unloading-time geofence — pauses the allowed-hours/waiting
        // clock (see useTripClock) the moment the driver's straight-line
        // distance from the pickup point exceeds LOADING_GEOFENCE_M, and
        // resumes it for good once straight-line distance to the drop point
        // drops to/below it (or resumes without locking in if they're simply
        // back near pickup — still loading, never left for real). Runs on
        // the same 5s cadence as the GPS write itself, since haversineKm is
        // free local math, not an API call. Never surfaced to either side
        // beyond the plain "paused" note already added to the timer boxes.
        const trip = myTripRef.current;
        if (trip?.loadingStartedAt && !trip.reachedDropAt &&
            trip.pickupLat != null && trip.pickupLng != null && trip.dropLat != null && trip.dropLng != null) {
          const distPickupM = haversineKm(pos.coords.latitude, pos.coords.longitude, trip.pickupLat, trip.pickupLng) * 1000;
          const distDropM = haversineKm(pos.coords.latitude, pos.coords.longitude, trip.dropLat, trip.dropLng) * 1000;
          if (distDropM <= LOADING_GEOFENCE_M) {
            const patch = { reachedDropAt: now, travelPausedAt: null, pausedMs: increment(trip.travelPausedAt ? now - trip.travelPausedAt : 0) };
            patchDoc("bookings", trip.id, patch).catch((e) => console.error(e));
            myTripRef.current = { ...trip, reachedDropAt: now, travelPausedAt: null, pausedMs: (trip.pausedMs || 0) + (trip.travelPausedAt ? now - trip.travelPausedAt : 0) };
          } else if (distPickupM > LOADING_GEOFENCE_M && !trip.travelPausedAt) {
            patchDoc("bookings", trip.id, { travelPausedAt: now }).catch((e) => console.error(e));
            myTripRef.current = { ...trip, travelPausedAt: now };
          } else if (distPickupM <= LOADING_GEOFENCE_M && trip.travelPausedAt) {
            patchDoc("bookings", trip.id, { travelPausedAt: null, pausedMs: increment(now - trip.travelPausedAt) }).catch((e) => console.error(e));
            myTripRef.current = { ...trip, travelPausedAt: null, pausedMs: (trip.pausedMs || 0) + (now - trip.travelPausedAt) };
          }
        }
      },
      (err) => console.error("GPS tracking error", err),
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [myTrip?.id, driver.online, driver.mobile]);

  if (completedTrip) {
    return (
      <div className="px-5 pt-5 pb-5">
        <DriverTripSummary trip={completedTrip} lang={lang} onDone={() => setCompletedTrip(null)} />
      </div>
    );
  }

  return (
    <div className={`px-5 pb-5 ${myTrip ? "pt-2" : "pt-5"}`}>
      <SuccessBurst show={bidWonBurst} text={lang === "en" ? "You won the load!" : lang === "mr" ? "लोड मिळाला!" : "लोड मिल गया!"} lang={lang} />
      {myTrip && !myTrip.loadingStartedAt && (
        <div className="mb-4">
          <DriverOtpEntry trip={myTrip} startLoading={startLoading} lang={lang} />
        </div>
      )}

      {bidSentToast && (
        <div className="toast-pop rounded-lg p-2.5 mb-3 flex items-center gap-2" style={{ background: C.success }}>
          <CheckCircle2 size={16} color="#fff" />
          <span className="text-[11px] font-bold text-white">{lang === "en" ? "Bid sent, waiting for customer's response." : lang === "mr" ? "बोली पाठवली, ग्राहकाच्या उत्तराची वाट पाहत आहे." : "बोली भेज दी, ग्राहक के जवाब का इंतज़ार है।"}</span>
        </div>
      )}

      {newLoadToast && (
        <div className="rounded-lg p-2.5 mb-3 flex items-center gap-2" style={{ background: C.navy }}>
          <Bell size={14} color={C.marigold} />
          <span className="text-[11px] font-bold text-white">🔔 {lang === "en" ? "New load" : lang === "mr" ? "नवीन लोड" : "नया लोड"}: {newLoadToast.pickup} → {newLoadToast.drop}</span>
        </div>
      )}

      {bidRejectedToast && (
        <div className="toast-pop rounded-lg p-2.5 mb-3 flex items-center gap-2" style={{ background: C.safety }}>
          <XCircle size={14} color="#FFFFFF" />
          <span className="text-[11px] font-bold" style={{ color: "#FFFFFF" }}>{lang === "en" ? "Customer chose someone else for one of your quotes." : lang === "mr" ? "तुमच्या एका कोटेशनसाठी ग्राहकाने दुसऱ्याला निवडले." : "आपके किसी कोटेशन के लिए ग्राहक ने किसी और को चुन लिया।"}</span>
        </div>
      )}

      {notificationsLocked && (
        <div className="rounded-lg p-2.5 mb-3 flex items-center gap-2 shadow-lg" style={{ background: C.metallicGold }}>
          <Clock3 size={14} color="#000000" />
          <span className="text-xs font-bold" style={{ color: "#000000" }}>{lang === "en" ? "You have an Advance booking coming up soon — Current (immediate) loads are hidden until then." : lang === "mr" ? "तुमची अ‍ॅडव्हान्स बुकिंग लवकरच आहे — तोपर्यंत करंट (तात्काळ) लोड दिसणार नाहीत." : "आपकी एडवांस बुकिंग जल्द है — तब तक करेंट (तुरंत) लोड नहीं दिखेंगे।"}</span>
        </div>
      )}

      {driver.blacklisted && (
        <div className="rounded-lg p-3 mb-4 flex items-center gap-2" style={{ background: C.safety }}>
          <XCircle size={15} color="#FFFFFF" />
          <span className="text-xs font-semibold" style={{ color: "#FFFFFF" }}>{lang === "en" ? "Your account has been blocked by admin — loads won't show." : lang === "mr" ? "तुमचे खाते अ‍ॅडमिनने ब्लॉक केले आहे — लोड दिसणार नाहीत." : "आपका खाता एडमिन द्वारा ब्लॉक किया गया है — लोड नहीं दिखेंगे।"}</span>
        </div>
      )}

      {myTrip ? (
        <div>

          {myTrip.customerMobile && (
            <MaskedCallButton bookingId={myTrip.id} fallbackMobile={myTrip.customerMobile} lang={lang}
              label={lang === "en" ? "Call Customer" : lang === "mr" ? "ग्राहकाला कॉल करा" : "ग्राहक को कॉल करें"}
              className="w-full flex items-center justify-center gap-2 px-3.5 py-3.5 mb-2.5 rounded-2xl text-base font-black shadow-sm"
              style={{ color: "#FFFFFF", fontFamily: bodyFont, background: C.navy }} />
          )}

          <div className="rounded-2xl p-3.5 mb-2.5 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
            {!myTrip.loadingStartedAt && (
              <div style={{ color: C.ink }}><span className="text-lg font-black" style={{ color: C.navy }}>{lang === "en" ? "Pickup" : lang === "mr" ? "पिकअप" : "पिकअप"}: </span><span className="text-base font-normal">{myTrip.pickup}</span></div>
            )}
            {myTrip.loadingStartedAt && (
              <div style={{ color: C.ink }}><span className="text-lg font-black" style={{ color: C.navy }}>{lang === "en" ? "Drop" : lang === "mr" ? "ड्रॉप" : "ड्रॉप"}: </span><span className="text-base font-normal">{myTrip.drop}</span></div>
            )}
            <div className="mt-3" style={{ height: "35vh" }}>
              <LiveTrackingMap pickup={myTrip.pickup} drop={myTrip.drop} pickupLat={myTrip.pickupLat} pickupLng={myTrip.pickupLng} dropLat={myTrip.dropLat} dropLng={myTrip.dropLng}
                driverLocation={myTrip.driverLocation} customerLocation={myTrip.customerLocation} progress={myTrip.progress} zoneColor={C.pimpri} height="100%" lang={lang}
                mode={myTrip.loadingStartedAt ? "route" : "toPickup"} />
            </div>
          </div>

          <LoadingTimer trip={myTrip} completeBooking={completeBooking} lang={lang} onEnded={setCompletedTrip} />
        </div>
      ) : driver.online && driver.kyc === "Approved" && !driver.blacklisted ? (
        <>
          {visibleLoads.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-10 px-4" style={{ minHeight: 420 }}>
              <p className="text-lg font-black mb-10" style={{ color: C.navy }}>{lang === "en" ? "All India booking available" : lang === "mr" ? "संपूर्ण भारतात बुकिंग उपलब्ध" : "पूरे भारत में बुकिंग उपलब्ध"}</p>
              <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ background: C.marigoldDeep }}>
                <IndianRupee size={24} color="#FFFFFF" />
              </div>
              <p className="text-sm font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "No new load right now" : lang === "mr" ? "अजून कोणताही नवीन लोड नाही" : "अभी कोई नया लोड नहीं है"}</p>
              <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Stay online — new loads will show here instantly." : lang === "mr" ? "ऑनलाइन रहा — नवीन लोड येताच इथे लगेच दिसेल." : "ऑनलाइन रहें — नया लोड आते ही यहां तुरंत दिखेगा।"}</p>
            </div>
          ) : (
            <>
              {visibleLoads.map((load) => (
                <LoadAlertCard key={load.id} load={load} driver={driver} addBid={addBid} lang={lang}
                  commissionPct={commissionPct} minWallet={minWallet} skipLoad={skipLoad} />
              ))}
            </>
          )}
        </>
      ) : (
        <div className="text-center py-10">
          <Truck size={28} color={C.inkSoft} className="mx-auto mb-2" />
          <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Turn duty on to get loads" : lang === "mr" ? "लोड मिळवण्यासाठी ड्युटी ऑन करा" : "ड्यूटी ऑन करें लोड पाने के लिए"}</p>
        </div>
      )}
    </div>
  );
}

function DriverWallet({ driver, setDriver, tripLog, commissionPct, minWallet, bonusPct, lang, withdrawals, requestWithdrawal, rechargeRequests, requestRecharge }) {
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // Balance/bonus count smoothly toward their real value instead of
  // snapping — see useCountUp.
  const displayWallet = useCountUp(driver.wallet || 0);
  const displayBonus = useCountUp(driver.bonus || 0);
  const inTrial = isInTrial(driver.createdAt);
  const myTrips = tripLog.filter((t) => t.driverName === driver.name && t.status !== "Cancelled");
  const myWithdrawals = (withdrawals || []).filter((w) => w.driverName === driver.name);
  const myRecharges = (rechargeRequests || []).filter((r) => r.driverName === driver.name);

  // The wallet balance moves for three reasons: a commission cut the instant
  // a bid is accepted, an approved recharge landing, or a referral reward —
  // so that's the complete ledger, merged and sorted newest-first by
  // createdAt. Referral entries store a plain millis number (Date.now())
  // rather than a Firestore Timestamp, hence txMillis/txTime below handling
  // both shapes.
  const referralEntries = driver.referralEntries || [];
  const txMillis = (createdAt) => createdAt?.toMillis?.() || (typeof createdAt === "number" ? createdAt : 0);
  const walletTransactions = [
    ...myTrips.map((t) => ({
      id: t.id, type: "debit", createdAt: t.createdAt,
      label: lang === "en" ? `Commission — ${t.pickup} → ${t.drop}` : lang === "mr" ? `कमिशन — ${t.pickup} → ${t.drop}` : `कमीशन — ${t.pickup} → ${t.drop}`,
      amount: t.fare * (commissionPct / 100),
    })),
    ...myRecharges.filter((r) => r.status === "Approved").map((r) => ({
      id: r.id, type: "credit", createdAt: r.createdAt,
      label: lang === "en" ? "Wallet recharge" : lang === "mr" ? "वॉलेट रिचार्ज" : "वॉलेट रीचार्ज",
      amount: r.amount,
    })),
    ...referralEntries.map((r, i) => ({
      id: `ref-${i}-${r.creditedAt}`, type: "credit", createdAt: r.creditedAt,
      label: lang === "en" ? "Referral bonus" : lang === "mr" ? "रेफरल बोनस" : "रेफरल बोनस",
      amount: r.amount,
    })),
  ].sort((a, b) => txMillis(b.createdAt) - txMillis(a.createdAt));
  const txTime = (createdAt) => {
    const ms = txMillis(createdAt);
    return ms ? new Date(ms).toLocaleString(lang === "en" ? "en-IN" : lang === "mr" ? "mr-IN" : "hi-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
  };

  return (
    <div className="px-5 py-5">
      <h2 className="text-base font-bold mb-3" style={{ color: C.ink }}>{lang === "en" ? "Wallet" : lang === "mr" ? "वॉलेट" : "वॉलेट"}</h2>
      <div className="rounded-xl p-4 mb-3" style={{ background: C.navy }}>
        <div className="text-[11px]" style={{ color: "#FFFFFF" }}>{lang === "en" ? "Wallet Balance" : lang === "mr" ? "वॉलेट बॅलन्स" : "वॉलेट बैलेंस"}</div>
        <div className="text-3xl font-bold text-white mt-1" style={{ fontFamily: monoFont }}>{fmt(displayWallet)}</div>
        {!inTrial && driver.wallet < minWallet && (
          <div className="text-[11px] mt-2 font-semibold" style={{ color: "#FFFFFF" }}>{lang === "en" ? `Minimum ${fmt(minWallet)} balance required — app may be deactivated` : lang === "mr" ? `किमान ${fmt(minWallet)} बॅलन्स आवश्यक आहे — अ‍ॅप बंद होऊ शकते` : `न्यूनतम ${fmt(minWallet)} बैलेंस ज़रूरी है — ऐप बंद हो सकता है`}</div>
        )}
        {(driver.heldCredit || 0) > 0 && (
          <div className="text-[11px] mt-2 font-semibold" style={{ color: "#FFFFFF" }}>{lang === "en" ? `${fmt(driver.heldCredit)} held from a cancelled trip — will auto-adjust against your next trip's commission.` : lang === "mr" ? `रद्द झालेल्या ट्रिपमधून ${fmt(driver.heldCredit)} होल्डमध्ये आहे — पुढील ट्रिपच्या कमिशनमध्ये आपोआप अ‍ॅडजस्ट होईल.` : `रद्द हुई ट्रिप से ${fmt(driver.heldCredit)} होल्ड में है — अगली ट्रिप के कमीशन में अपने आप एडजस्ट होगा।`}</div>
        )}
        <button onClick={() => setShowComingSoon(true)} className="w-full mt-3 rounded-lg py-3.5 font-bold text-base flex items-center justify-center gap-1.5" style={{ background: "#FFFFFF", color: C.navy }}>
          <IndianRupee size={14} /> {lang === "en" ? "Recharge" : lang === "mr" ? "रिचार्ज करा" : "रीचार्ज करें"}
        </button>
        {showComingSoon && (
          <div className="rounded-lg p-2.5 mt-2 text-[11px] font-semibold text-center shadow-lg" style={{ background: C.metallicGold, color: "#000000" }}>
            {lang === "en" ? "Online payments are coming soon." : lang === "mr" ? "ऑनलाइन पेमेंट लवकरच येत आहे." : "ऑनलाइन पेमेंट जल्द आ रहा है।"}
          </div>
        )}
        <button onClick={() => setShowHistory((v) => !v)} className="w-full mt-3 rounded-lg py-3 text-base font-bold flex items-center justify-center gap-1.5" style={{ background: "#000000", color: "#fff" }}>
          <ClipboardList size={13} /> {showHistory ? (lang === "en" ? "Hide Transaction History" : lang === "mr" ? "व्यवहार हिस्टरी लपवा" : "लेन-देन हिस्ट्री छुपाएं") : (lang === "en" ? "Transaction History" : lang === "mr" ? "व्यवहार हिस्टरी" : "लेन-देन हिस्ट्री")}
        </button>
      </div>
      {showHistory && (
        <div className="rounded-xl p-3 mb-3 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          {walletTransactions.length === 0 ? (
            <p className="text-[11px] text-center py-2" style={{ color: C.inkSoft }}>{lang === "en" ? "No wallet transactions yet." : lang === "mr" ? "अजून कोणताही व्यवहार झाला नाही." : "अभी तक कोई लेन-देन नहीं हुआ।"}</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {walletTransactions.map((tx) => (
                <div key={tx.id} className="rounded-lg p-2 flex items-center justify-between gap-2" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold truncate" style={{ color: C.ink }}>{tx.label}</div>
                    <div className="text-[10px]" style={{ color: C.inkSoft }}>{txTime(tx.createdAt)}</div>
                  </div>
                  <span className="text-xs font-bold shrink-0" style={{ color: tx.type === "credit" ? C.success : C.safety, fontFamily: monoFont }}>
                    {tx.type === "credit" ? "+" : "−"}{fmt(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="rounded-xl p-4 mb-2" style={{ background: C.success }}>
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-extrabold" style={{ color: "#FFFFFF" }}>{lang === "en" ? "Driver Bonus" : lang === "mr" ? "ड्रायव्हर बोनस" : "ड्राइवर बोनस"}</div>
          <div className="text-xl font-bold" style={{ color: "#FFFFFF", fontFamily: monoFont }}>{fmt(displayBonus)}</div>
        </div>
        <div className="text-[11px] font-semibold mb-2" style={{ color: "#FFFFFF" }}>{lang === "en" ? "Withdraw anytime" : lang === "mr" ? "कधीही काढा" : "कभी भी निकालें"}</div>
        <button onClick={() => requestWithdrawal(driver.bonus || 0)} disabled={!driver.bonus}
          className={`w-full rounded-lg py-3 text-base font-bold text-white flex items-center justify-center gap-1.5 ${driver.bonus ? "shadow-lg" : ""}`}
          style={{ background: driver.bonus ? C.metallicGreen : "#E0E0E0", color: driver.bonus ? "#fff" : "#9AA3B0" }}>
          <Wallet size={13} /> {lang === "en" ? "Send to Bank" : lang === "mr" ? "बँकेत पाठवा" : "बैंक में भेजें"}
        </button>
      </div>

      {myWithdrawals.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] font-bold mb-1.5" style={{ color: C.inkSoft }}>{lang === "en" ? "Withdrawal Requests" : lang === "mr" ? "विड्रॉल रिक्वेस्ट" : "विड्रॉल रिक्वेस्ट"}</div>
          <div className="space-y-1.5">
            {myWithdrawals.map((w) => (
              <div key={w.id} className="rounded-lg px-3 py-2 flex items-center justify-between" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                <span className="text-xs font-semibold" style={{ color: C.ink, fontFamily: monoFont }}>{fmt(w.amount)}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#FFFFFF", background: w.status === "Approved" ? C.success : C.marigoldDeep }}>
                  {w.status === "Approved" ? (lang === "en" ? "Sent to bank ✓" : lang === "mr" ? "बँकेत पाठवले ✓" : "बैंक में भेज दिया ✓") : (lang === "en" ? "Pending admin approval" : lang === "mr" ? "अ‍ॅडमिन अप्रूव्हल बाकी" : "एडमिन अप्रूवल बाकी")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

function DriverHistory({ tripLog, driver, commissionPct, lang }) {
  const myTrips = tripLog.filter((t) => t.driverName === driver.name);
  const [docsTrip, setDocsTrip] = useState(null);
  return (
    <div className="px-5 py-5">
      <h2 className="text-base font-bold mb-3" style={{ color: C.ink }}>{lang === "en" ? "Trip History" : lang === "mr" ? "ट्रिप हिस्टरी" : "ट्रिप हिस्ट्री"}</h2>
      <div className="space-y-2">
        {myTrips.length === 0 && (
          <div className="text-center py-10">
            <Package size={28} color={C.inkSoft} className="mx-auto mb-2" />
            <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "No bid accepted yet." : lang === "mr" ? "अजून कोणतीही बिड अ‍ॅक्सेप्ट झाली नाही." : "अभी कोई बिड एक्सेप्ट नहीं हुई।"}</p>
          </div>
        )}
        {myTrips.map((t) => (
          <div key={t.id} className="rounded-lg px-3 py-2.5" style={{ background: C.paper, border: `1px solid ${t.status === "Cancelled" ? C.safety : C.line}` }}>
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold" style={{ color: C.ink }}>{t.pickup} → {t.drop}</div>
              <div className="text-sm font-bold" style={{ color: t.status === "Cancelled" ? C.safety : C.success, fontFamily: monoFont }}>
                {t.status === "Cancelled" ? (lang === "en" ? "Cancelled" : lang === "mr" ? "रद्द" : "रद्द") : fmt(t.fare * (1 - commissionPct / 100))}
              </div>
            </div>
            <div className="flex items-center justify-between mt-1">
              <div className="text-[10px]" style={{ color: C.inkSoft }}>
                {t.status === "Cancelled"
                  ? (lang === "en" ? `Fare ${fmt(t.fare)} · commission ${fmt(t.fare * (commissionPct / 100))} refunded to wallet` : lang === "mr" ? `भाडे ${fmt(t.fare)} · कमिशन ${fmt(t.fare * (commissionPct / 100))} वॉलेटमध्ये परत जमा` : `भाड़ा ${fmt(t.fare)} · कमीशन ${fmt(t.fare * (commissionPct / 100))} वापस वॉलेट में जमा`)
                  : (lang === "en" ? `Fare ${fmt(t.fare)} · commission − ${fmt(t.fare * (commissionPct / 100))}` : lang === "mr" ? `भाडे ${fmt(t.fare)} · कमिशन − ${fmt(t.fare * (commissionPct / 100))}` : `भाड़ा ${fmt(t.fare)} · कमीशन − ${fmt(t.fare * (commissionPct / 100))}`)}
              </div>
              {t.status === "Cancelled" ? null : t.rating ? <div className="text-[11px] font-semibold" style={{ color: C.marigoldDeep }}>{stars(t.rating)}</div> : <div className="text-[10px]" style={{ color: C.inkSoft }}>{t.status === "Ongoing" ? (lang === "en" ? "In progress" : lang === "mr" ? "चालू" : "चालू") : (lang === "en" ? "Rating pending" : lang === "mr" ? "रेटिंग बाकी" : "रेटिंग बाकी")}</div>}
            </div>
            {t.status === "Completed" && (
              <button onClick={() => setDocsTrip(t)} className="text-sm font-semibold mt-1.5 flex items-center gap-1"
                style={{ color: t.documents?.file?.url ? C.success : C.marigoldDeep }}>
                <FileText size={12} /> {lang === "en" ? "Receive Bill" : lang === "mr" ? "बिल मिळवा" : "बिल प्राप्त करें"}
              </button>
            )}
          </div>
        ))}
      </div>
      {docsTrip && <BillDocumentsViewModal trip={docsTrip} onClose={() => setDocsTrip(null)} lang={lang} />}
    </div>
  );
}

function DriverKyc({ driver, setDriver, vehicleTypes, addVehicleType, lang, stepLabel, onFirstSubmit }) {
  const VEHICLES = vehicleTypes;
  // Persisted to localStorage so a refresh mid-fill (slow connection,
  // accidental reload) doesn't force re-uploading photos or retyping —
  // cleared once submit() actually attaches them to the driver doc. Falls
  // back to whatever's already saved on the driver (e.g. on KYC
  // resubmission after a rejection) only when there's no in-progress draft.
  const [dl, setDl] = usePersistedPhoto("sarthi_driverKyc_dl", null);
  const [photo, setPhoto] = usePersistedPhoto("sarthi_driverKyc_photo", null);
  // Which photo tiles are mid-upload — a set, not a single value, so
  // uploading two photos at once (e.g. tapping Front then Side before the
  // first finishes) doesn't make one tile's "uploading" indicator vanish
  // while it's still actually in flight.
  const [uploadingKeys, setUploadingKeys] = useState({});
  const markUploading = (key, on) => setUploadingKeys((prev) => ({ ...prev, [key]: on }));
  const anyUploading = Object.values(uploadingKeys).some(Boolean);
  // Set when a tile's photo failed to upload (e.g. a corrupted file the
  // browser couldn't decode) — surfaced as inline text on that tile instead
  // of leaving "Uploading..." stuck forever with no explanation.
  // Per-tile upload failure reason ("toobig" | "timeout" | "decode" |
  // "upload"), or false when there's no error. Surfaced as an inline,
  // action-oriented line on the tile (see uploadErrorInfo) instead of
  // leaving "Uploading..." stuck forever with no explanation.
  const [uploadErrorKeys, setUploadErrorKeys] = useState({});
  const markUploadError = (key, reason) => setUploadErrorKeys((prev) => ({ ...prev, [key]: reason || false }));
  // Real bytes-transferred percentage per tile, fed by uploadPhoto's
  // onProgress callback — replaces a static "Uploading..." with something
  // that visibly moves, so a slow connection doesn't look identical to a
  // stuck one.
  const [uploadProgress, setUploadProgress] = useState({});
  const markProgress = (key, pct) => setUploadProgress((prev) => ({ ...prev, [key]: pct }));
  // The last File actually picked per tile — kept around purely so Retry
  // can re-run the same upload without sending the driver back through the
  // camera/library picker sheet for a failure that was probably just a
  // network blip, not a bad photo.
  const lastFilesRef = useRef({});

  const existingVehicleType = VEHICLES.find((v) => v.key === driver.vehicleSpec?.type);
  // The driver just types their vehicle's name — no dropdown of preset
  // types to pick from. Resolved to a vehicleTypes entry (reusing a
  // matching one by name, or creating a new one) only at submit time.
  const [vehicleTypeName, setVehicleTypeName] = usePersistedState("sarthi_driverKyc_vehicleTypeName", existingVehicleType ? vehicleLabel(existingVehicleType, lang) : "");
  const [vehiclePhotoFront, setVehiclePhotoFront] = usePersistedPhoto("sarthi_driverKyc_photoFront", driver.vehicleSpec?.photo || driver.vehicleSpec?.photoFront || null);
  const [vehiclePhotoSide, setVehiclePhotoSide] = usePersistedPhoto("sarthi_driverKyc_photoSide", driver.vehicleSpec?.photoSide || null);
  const [capacityKg, setCapacityKg] = usePersistedState("sarthi_driverKyc_capacityKg", driver.vehicleSpec?.capacityKg || "");
  const [length, setLength] = usePersistedState("sarthi_driverKyc_length", driver.vehicleSpec?.length || "");
  const [width, setWidth] = usePersistedState("sarthi_driverKyc_width", driver.vehicleSpec?.width || "");
  const [height, setHeight] = usePersistedState("sarthi_driverKyc_height", driver.vehicleSpec?.height || "");
  const [vehicleNumber, setVehicleNumber] = usePersistedState("sarthi_driverKyc_vehicleNumber", driver.vehicleSpec?.vehicleNumber || "");

  // Auto-fills dimensions from VEHICLE_MODEL_SPECS the moment the typed
  // vehicle name matches a known model — but only into fields the driver
  // hasn't already touched, so it never clobbers a manual entry.
  const matchedModelSpec = lookupVehicleModelSpec(vehicleTypeName);
  useEffect(() => {
    if (!matchedModelSpec) return;
    if (capacityKg || length || width || height) return;
    setCapacityKg(String(matchedModelSpec.capacityKg));
    setLength(String(matchedModelSpec.length));
    setWidth(String(matchedModelSpec.width));
    setHeight(String(matchedModelSpec.height));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleTypeName]);

  // Reuses a vehicleTypes entry with a matching name (case-insensitive) so
  // typing the same vehicle name as another driver doesn't fragment the
  // shared type list; otherwise creates a new one from what's typed here.
  const resolveVehicleTypeKey = () => {
    const name = vehicleTypeName.trim();
    const match = VEHICLES.find((v) => v.label.toLowerCase() === name.toLowerCase() || (v.labelEn || "").toLowerCase() === name.toLowerCase());
    if (match) return match.key;
    const key = slugify(name);
    addVehicleType({
      key, label: name, rate: 25, capacity: "", capacityKg: Number(capacityKg) || 0,
      l: Number(length) || 0, w: Number(width) || 0, h: Number(height) || 0,
    });
    return key;
  };

  // Shared by all three KYC photo tiles (driver photo, DL, vehicle side) —
  // onDoc/onVehiclePhoto used to be separate, identical copies of this same
  // logic. Also used by retryUpload below, which re-invokes this with the
  // same File instead of a fresh one from the picker.
  const startPhotoUpload = (setVal, key) => (f) => {
    if (!f) return;
    lastFilesRef.current[key] = f;
    markUploading(key, true);
    markUploadError(key, false);
    markProgress(key, 0);
    let failReason = null;
    uploadPhoto(f, `drivers/${driver.mobile}/${key}.jpg`, 900, 0.72,
      (pct) => markProgress(key, pct),
      (reason) => { failReason = reason; },
    ).then((p) => {
      markUploading(key, false);
      if (p) setVal(p); else markUploadError(key, failReason || "upload");
    });
  };
  // Re-send the exact same File — only offered for a "upload" (network)
  // failure. A "toobig"/"timeout"/"decode" failure needs a different photo,
  // so those tiles show "tap to take again" (reopens the picker) instead.
  const retryUpload = (setVal, key) => () => {
    const f = lastFilesRef.current[key];
    if (f) startPhotoUpload(setVal, key)(f);
  };

  const canSubmit = !!(photo && dl && vehiclePhotoSide && vehicleNumber.trim() && vehicleTypeName.trim() && !anyUploading);
  // Guided-step highlighting for the KYC fields — see GuidedStep. Vehicle
  // dimensions are optional (not part of canSubmit), so they're skipped.
  // Vehicle Front isn't required here either — see the photo tile below,
  // same reasoning as DriverProfileEdit's document list already applied:
  // the side profile is the only vehicle photo that matters to a customer
  // browsing bids, so dropping Front halves the photo-upload burden on
  // signup without losing anything a customer actually sees.
  const kycStepCompleted = [!!photo, !!dl, !!vehicleNumber.trim(), !!vehicleTypeName.trim(), !!vehiclePhotoSide];
  const { stepProps: kycStepProps } = useGuidedSteps(kycStepCompleted, { pinFocus: true, autoAdvanceMs: 5000 });
  // First-time submission within this driver's own 30-day trial (from
  // their own signup date) skips the admin approval wait entirely — a
  // driver who's already been reviewed before (kyc isn't null, e.g.
  // resubmitting after a rejection or editing an approved profile) still
  // goes back through the normal Pending review either way.
  const isFirstSubmission = driver.kyc == null;
  const submit = () => {
    if (!canSubmit) return;
    setDriver({
      // The KYC driver photo doubles as the profile photo (see
      // DriverProfileEdit) — kept in sync here every time KYC is
      // submitted/resubmitted, rather than letting the two drift apart.
      ...driver, kyc: isInTrial(driver.createdAt) && isFirstSubmission ? "Approved" : "Pending", photo, docs: { dl, photo },
      vehicleSpec: {
        type: resolveVehicleTypeKey(), photo: vehiclePhotoFront, photoFront: vehiclePhotoFront, photoSide: vehiclePhotoSide,
        capacityKg: Number(capacityKg) || undefined, length: Number(length) || undefined,
        width: Number(width) || undefined, height: Number(height) || undefined,
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
      },
    });
    // Submitted for real — clear the draft so a later resubmission (after a
    // rejection) starts from the driver's actual saved data, not this.
    setDl(null); setPhoto(null); setVehicleTypeName(""); setVehiclePhotoFront(null); setVehiclePhotoSide(null);
    setCapacityKg(""); setLength(""); setWidth(""); setHeight(""); setVehicleNumber("");
    if (isFirstSubmission) onFirstSubmit?.();
  };

  const inputCls = "w-full rounded-lg px-3 py-2.5 text-sm outline-none";
  const inputStyle = { background: C.paper, border: `1px solid ${C.line}`, color: C.ink };
  const docLabels = lang === "en"
    ? { photo: "Driver Photo", dl: "Driving License" }
    : lang === "mr"
    ? { photo: "ड्रायव्हर फोटो", dl: "ड्रायव्हिंग लायसन्स" }
    : { photo: "ड्राइवर फोटो", dl: "ड्राइविंग लाइसेंस" };

  return (
    <div className="px-5 py-5">
      {stepLabel && <div className="text-[11px] font-bold mb-2" style={{ color: C.marigoldDeep }}>{stepLabel}</div>}
      <h2 className="text-base font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "Documents (KYC)" : lang === "mr" ? "कागदपत्रे (KYC)" : "दस्तावेज़ (KYC)"}</h2>
      <p className="text-xs mb-4" style={{ color: C.inkSoft }}>{lang === "en" ? "Upload your photo and driving license, and enter your vehicle's number and dimensions." : lang === "mr" ? "तुमचा फोटो आणि ड्रायव्हिंग लायसन्स अपलोड करा, आणि तुमच्या गाडीचा नंबर व साइझ टाका." : "अपनी फोटो और ड्राइविंग लाइसेंस अपलोड करें, और अपनी गाड़ी का नंबर व साइज़ डालें।"}</p>

      <div className="rounded-lg p-3 mb-4 flex items-center gap-2" style={{ background: driver.kyc === "Approved" ? C.success : C.marigoldDeep }}>
        <ShieldCheck size={16} color="#FFFFFF" />
        <span className="text-xs font-semibold" style={{ color: "#FFFFFF" }}>{lang === "en" ? "Status" : lang === "mr" ? "स्टेटस" : "स्टेटस"}: {driver.kyc === "Approved" ? (lang === "en" ? "Verified" : lang === "mr" ? "सत्यापित" : "सत्यापित") : (lang === "en" ? "Pending" : lang === "mr" ? "प्रलंबित" : "लंबित")}</span>
      </div>

      <div className="text-[11px] font-bold mb-2" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Documents" : lang === "mr" ? "कागदपत्रे" : "दस्तावेज़"}</div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[
          ["photo", docLabels.photo, photo, setPhoto], ["dl", docLabels.dl, dl, setDl],
        ].map(([key, label, val, setVal], i) => (
          <GuidedStep key={key} {...kycStepProps(i)} lang={lang}>
            <PhotoPicker label={label} lang={lang} onSelect={startPhotoUpload(setVal, key)}>
              <div className="rounded-lg overflow-hidden flex flex-col items-center justify-center text-center cursor-pointer" style={{ border: `1.5px dashed ${C.line}`, background: C.paper, minHeight: 86 }}>
                {uploadingKeys[key] ? (
                  <div className="p-2 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-semibold" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Uploading" : lang === "mr" ? "अपलोड होत आहे" : "अपलोड हो रहा है"}{uploadProgress[key] ? ` ${uploadProgress[key]}%` : "..."}</span>
                  </div>
                ) : (
                  <SafeImage
                    src={val?.url}
                    alt={label}
                    className="w-full h-16 object-cover"
                    fallback={
                      <div className="p-2 flex flex-col items-center justify-center">
                        <Camera size={16} color={C.inkSoft} />
                        <span className="text-[10px] font-semibold mt-1" style={{ color: C.ink }}>{label}</span>
                      </div>
                    }
                  />
                )}
                {uploadErrorKeys[key] ? (
                  <div className="mt-0.5 pb-1 px-1">
                    <span className="block text-[9px] font-semibold leading-tight" style={{ color: C.safety }}>{uploadErrorInfo(uploadErrorKeys[key], lang)}</span>
                    {uploadErrorKeys[key] === "upload" ? (
                      <button type="button" onClick={(e) => { e.stopPropagation(); retryUpload(setVal, key)(); }} className="text-[9px] font-bold underline mt-0.5" style={{ color: C.navy }}>
                        {lang === "en" ? "Retry" : lang === "mr" ? "पुन्हा प्रयत्न करा" : "फिर कोशिश करें"}
                      </button>
                    ) : (
                      <span className="block text-[9px] font-bold underline mt-0.5" style={{ color: C.navy }}>
                        {lang === "en" ? "Tap to take again" : lang === "mr" ? "पुन्हा घेण्यासाठी टॅप करा" : "फिर से लेने के लिए टैप करें"}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-[9px] mt-0.5 pb-1 truncate max-w-full" style={{ color: val ? C.success : C.inkSoft }}>
                    {val ? (lang === "en" ? "Uploaded ✓" : lang === "mr" ? "अपलोड ✓" : "अपलोड ✓") : (lang === "en" ? "Take photo" : lang === "mr" ? "फोटो घ्या" : "फोटो लें")}
                  </span>
                )}
              </div>
            </PhotoPicker>
          </GuidedStep>
        ))}
      </div>

      <GuidedStep {...kycStepProps(2)} lang={lang}>
        <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Vehicle Registered Number" : lang === "mr" ? "गाडी रजिस्टर्ड नंबर" : "गाड़ी रजिस्टर्ड नंबर"}</label>
        <input className={inputCls} style={{ ...inputStyle, fontFamily: monoFont, textTransform: "uppercase", marginBottom: 12 }} placeholder="MH-14-XX-XXXX" value={vehicleNumber}
          onChange={(e) => setVehicleNumber(e.target.value)} />
      </GuidedStep>

      <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Vehicle Dimensions" : lang === "mr" ? "गाडीचा साइझ" : "गाड़ी का साइज़"}</label>
      {matchedModelSpec && (
        <p className="text-[10px] font-semibold mb-1.5" style={{ color: C.success }}>
          {lang === "en" ? "Auto-filled for this vehicle model — edit any field if yours differs." : lang === "mr" ? "या गाडी मॉडेलनुसार आपोआप भरले गेले आहे — वेगळे असल्यास बदलू शकता." : "इस गाड़ी मॉडल के हिसाब से अपने आप भर दिया गया है — अलग हो तो बदल सकते हैं।"}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div>
          <label className="text-[11px] font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Capacity (kg)" : lang === "mr" ? "क्षमता (किलोग्राम)" : "क्षमता (किलोग्राम)"}</label>
          <input type="number" className={inputCls} style={inputStyle} placeholder={lang === "en" ? "e.g. 750" : lang === "mr" ? "उदा: 750" : "जैसे: 750"} value={capacityKg} onChange={(e) => setCapacityKg(e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Length (ft)" : lang === "mr" ? "लांबी (फूट)" : "लंबाई (फीट)"}</label>
          <input type="number" className={inputCls} style={inputStyle} placeholder={lang === "en" ? "e.g. 7" : lang === "mr" ? "उदा: 7" : "जैसे: 7"} value={length} onChange={(e) => setLength(e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Width (ft)" : lang === "mr" ? "रुंदी (फूट)" : "चौड़ाई (फीट)"}</label>
          <input type="number" className={inputCls} style={inputStyle} placeholder={lang === "en" ? "e.g. 4.5" : lang === "mr" ? "उदा: 4.5" : "जैसे: 4.5"} value={width} onChange={(e) => setWidth(e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Height (ft)" : lang === "mr" ? "उंची (फूट)" : "ऊंचाई (फीट)"}</label>
          <input type="number" className={inputCls} style={inputStyle} placeholder={lang === "en" ? "e.g. 4.5" : lang === "mr" ? "उदा: 4.5" : "जैसे: 4.5"} value={height} onChange={(e) => setHeight(e.target.value)} />
        </div>
      </div>

      <div className="text-[11px] font-bold mb-2" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Step 2 — Vehicle Details" : lang === "mr" ? "स्टेप 2 — गाडीची माहिती" : "स्टेप 2 — गाड़ी की जानकारी"}</div>
      <div className="rounded-xl p-3 mb-4 shadow-lg" style={{ border: `2px solid ${C.marigoldDeep}`, background: C.metallicGold }}>
        <div className="text-xs font-bold mb-2 flex items-center gap-1.5" style={{ color: "#000000" }}><Truck size={14} /> {lang === "en" ? "Fill this clearly — customer will see this" : lang === "mr" ? "स्पष्ट भरा — कस्टमरला हीच दिसेल" : "साफ-साफ भरें — कस्टमर को यही दिखेगी"}</div>

        <GuidedStep {...kycStepProps(3)} lang={lang}>
          <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Vehicle Name" : lang === "mr" ? "गाडीचे नाव" : "गाड़ी का नाम"}</label>
          <input className={inputCls} style={inputStyle} placeholder={lang === "en" ? "e.g. Tata 109" : lang === "mr" ? "उदा: Tata 109" : "जैसे: Tata 109"} value={vehicleTypeName} onChange={(e) => setVehicleTypeName(e.target.value)} />
        </GuidedStep>

        <label className="text-xs font-semibold mb-1 mt-2 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Vehicle Photo (Side)" : lang === "mr" ? "गाडीचा फोटो (बाजूने)" : "गाड़ी की फोटो (साइड से)"}</label>
        {/* Front used to be required here too — dropped (see kycStepCompleted
            above) since the side profile is the only vehicle photo a
            customer ever sees on a bid card, same reasoning already applied
            to DriverProfileEdit's own document list. Halves the photo-upload
            burden a new driver faces during signup. */}
        <div className="max-w-[180px] mb-2">
          <GuidedStep {...kycStepProps(4)} lang={lang}>
            <PhotoPicker label={lang === "en" ? "Side" : lang === "mr" ? "बाजूने" : "साइड से"} lang={lang} onSelect={startPhotoUpload(setVehiclePhotoSide, "vehicleSide")}>
              <div className="rounded-lg p-2 flex flex-col items-center justify-center cursor-pointer" style={{ border: `1.5px dashed ${C.marigoldDeep}`, background: C.paper, minHeight: 110 }}>
                {uploadingKeys.vehicleSide ? (
                  <div className="text-xs font-semibold py-6" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Uploading" : lang === "mr" ? "अपलोड होत आहे" : "अपलोड हो रहा है"}{uploadProgress.vehicleSide ? ` ${uploadProgress.vehicleSide}%` : "..."}</div>
                ) : (
                  <SafeImage
                    src={vehiclePhotoSide?.url}
                    alt={lang === "en" ? "Side" : lang === "mr" ? "बाजूने" : "साइड से"}
                    className="w-full h-24 rounded-lg object-cover"
                    fallback={
                      <>
                        <div className="w-10 h-10 rounded-full flex items-center justify-center mb-1" style={{ background: C.marigoldDeep }}><Camera size={18} color="#FFFFFF" /></div>
                        <div className="text-[10px] font-semibold text-center" style={{ color: C.ink }}>{lang === "en" ? "Side" : lang === "mr" ? "बाजूने" : "साइड से"}</div>
                      </>
                    }
                  />
                )}
              </div>
              {uploadErrorKeys.vehicleSide ? (
                <div className="mt-0.5 px-1 text-center">
                  <span className="block text-[9px] font-semibold leading-tight" style={{ color: C.safety }}>{uploadErrorInfo(uploadErrorKeys.vehicleSide, lang)}</span>
                  {uploadErrorKeys.vehicleSide === "upload" ? (
                    <button type="button" onClick={(e) => { e.stopPropagation(); retryUpload(setVehiclePhotoSide, "vehicleSide")(); }} className="text-[9px] font-bold underline mt-0.5" style={{ color: C.navy }}>
                      {lang === "en" ? "Retry" : lang === "mr" ? "पुन्हा प्रयत्न करा" : "फिर कोशिश करें"}
                    </button>
                  ) : (
                    <span className="block text-[9px] font-bold underline mt-0.5" style={{ color: C.navy }}>
                      {lang === "en" ? "Tap to take again" : lang === "mr" ? "पुन्हा घेण्यासाठी टॅप करा" : "फिर से लेने के लिए टैप करें"}
                    </span>
                  )}
                </div>
              ) : (
                <div className="text-[9px] mt-0.5 text-center" style={{ color: vehiclePhotoSide ? C.success : C.inkSoft }}>
                  {vehiclePhotoSide ? (lang === "en" ? "Uploaded ✓" : lang === "mr" ? "अपलोड ✓" : "अपलोड ✓") : (lang === "en" ? "Tap to upload" : lang === "mr" ? "अपलोडसाठी टॅप करा" : "अपलोड के लिए टैप करें")}
                </div>
              )}
            </PhotoPicker>
          </GuidedStep>
        </div>
        <div className="rounded-lg p-2.5" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          <div className="text-[10px] font-semibold mb-1" style={{ color: C.ink }}>{lang === "en" ? "For a good photo:" : lang === "mr" ? "चांगल्या फोटोसाठी:" : "अच्छी फोटो के लिए:"}</div>
          <div className="text-[10px]" style={{ color: C.inkSoft, lineHeight: 1.6 }}>
            {lang === "en" ? (
              <>• Take it in daylight, at a clean spot<br />• The full vehicle should be in frame<br />• The number plate should be clearly visible<br />• Don't upload blurry, dark, or cropped photos</>
            ) : lang === "mr" ? (
              <>• दिवसाच्या उजेडात, स्वच्छ जागी फोटो घ्या<br />• संपूर्ण गाडी फ्रेममध्ये यायला हवी<br />• गाडी नंबर प्लेट स्पष्ट दिसायला हवी<br />• धूसर, अंधारी किंवा कापलेली फोटो टाकू नका</>
            ) : (
              <>• दिन की रोशनी में, साफ जगह पर फोटो लें<br />• पूरी गाड़ी फ्रेम में आनी चाहिए<br />• गाड़ी नंबर प्लेट साफ दिखनी चाहिए<br />• धुंधली, अंधेरी या कटी हुई फोटो न डालें</>
            )}
          </div>
        </div>
      </div>

      {!canSubmit && <div className="text-[11px] font-semibold mb-2" style={{ color: C.safety }}>{lang === "en" ? "Upload your photo, license, both vehicle photos, and enter the vehicle name & number to submit" : lang === "mr" ? "सबमिट करण्यासाठी तुमचा फोटो, लायसन्स, गाडीचे दोन्ही फोटो, गाडीचे नाव आणि नंबर टाका" : "सबमिट करने के लिए अपनी फोटो, लाइसेंस, गाड़ी की दोनों फोटो, गाड़ी का नाम और नंबर डालें"}</div>}
      <button onClick={submit} disabled={!canSubmit} className={`w-full rounded-lg py-4 font-bold text-base ${canSubmit ? "guided-submit-ready" : ""}`} style={{ background: canSubmit ? C.marigold : "#E0E0E0", color: canSubmit ? "#000000" : "#9AA3B0" }}>{lang === "en" ? "Submit" : lang === "mr" ? "सबमिट करा" : "सबमिट करें"}</button>
    </div>
  );
}

// Mirrors CustomerProfileEdit's layout/fields (name, disabled mobile, email,
// address, area/city, state/pincode) so both roles' profile pages look and
// behave the same — minus the customer-only referral section, plus a
// Logout button at the bottom (moved out of the hamburger menu, see
// DriverApp). Unlike the customer version, the profile photo itself isn't
// separately uploadable here — it's the KYC "Driver Photo" (see DriverKyc's
// submit, which writes it to driver.photo directly), shown read-only so
// it's always exactly what the customer sees on their active ride page.
function DriverProfileEdit({ driver, setDriver, lang, onChangeLang, onLogout, onEditDocuments }) {
  const [name, setName] = useState(driver?.name || "");
  const [saved, setSaved] = useState(false);

  const inputCls = "w-full rounded-lg px-3 py-2.5 text-sm outline-none";
  const inputStyle = { background: C.paper, border: `1px solid ${C.line}`, color: C.ink };

  const save = () => {
    setDriver({ ...driver, name: name.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Migration nudge for an account still on the old Firebase Phone Auth
  // login — see CustomerProfileEdit's identical block for the full
  // explanation of why linkWithCredential (not a new account) is used here.
  const hasPinAlready = !!driverFirebaseAuth?.currentUser?.email;
  const [pinPromptOpen, setPinPromptOpen] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pinDone, setPinDone] = useState(false);

  const setUpPin = async () => {
    if (newPin.length !== 4 || newPin !== newPinConfirm || pinSaving || !driverFirebaseAuth?.currentUser || !driver?.mobile) return;
    setPinSaving(true);
    setPinError("");
    try {
      const credential = EmailAuthProvider.credential(pinAuthEmail(driver.mobile, "driver"), pinToPassword(newPin));
      await linkWithCredential(driverFirebaseAuth.currentUser, credential);
      setPinDone(true);
      setNewPin(""); setNewPinConfirm(""); setPinPromptOpen(false);
    } catch (e) {
      console.error(e);
      setPinError(lang === "en" ? "Couldn't set PIN — try again." : lang === "mr" ? "PIN सेट होऊ शकला नाही — पुन्हा प्रयत्न करा." : "PIN सेट नहीं हो सका — फिर कोशिश करें।");
    }
    setPinSaving(false);
  };

  return (
    <div className="px-5 py-4">
      <h2 className="text-base font-bold mb-3" style={{ color: C.ink }}>{lang === "en" ? "My Profile" : lang === "mr" ? "माझी प्रोफाइल" : "मेरी प्रोफाइल"}</h2>
      <div className="rounded-xl p-4 mb-3 shadow-sm space-y-3" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
        <div className="flex justify-center">
          <div className="w-28 h-28 rounded-full flex items-center justify-center overflow-hidden" style={{ background: C.paper, border: `2px solid ${C.marigoldDeep}` }}>
            <SafeImage src={driver?.photo?.url} alt="" className="w-full h-full object-cover" fallback={<Camera size={30} color={C.marigoldDeep} />} />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Full Name" : lang === "mr" ? "पूर्ण नाव" : "पूरा नाम"}</label>
          <input className={inputCls} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Mobile" : lang === "mr" ? "मोबाइल" : "मोबाइल"}</label>
          <input className={inputCls} style={{ ...inputStyle, fontFamily: monoFont, background: C.bg, color: C.inkSoft }} value={driver?.mobile || ""} disabled />
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Language" : lang === "mr" ? "भाषा" : "भाषा"}</label>
          <select className={inputCls} style={inputStyle} value={lang} onChange={(e) => onChangeLang?.(e.target.value)}>
            <option value="en">English</option>
            <option value="hi">हिंदी</option>
            <option value="mr">मराठी</option>
          </select>
        </div>

        {/* Every document submitted with KYC, visible right here — View/
            Download per document via KycDocThumb (same component the admin
            review screen uses), and a single Change button that jumps to
            the existing KYC & Vehicle form to re-upload/edit any of them
            (including the driver photo above), instead of duplicating that
            upload flow here. Vehicle - Front isn't shown — the side profile
            is the only vehicle photo that matters to a customer browsing
            bids. */}
        <div className="pt-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold" style={{ color: C.ink }}>{lang === "en" ? "Documents" : lang === "mr" ? "कागदपत्रे" : "दस्तावेज़"}</h3>
            <button onClick={onEditDocuments} className="text-base font-bold px-4 py-2.5 rounded-lg" style={{ background: C.marigold, color: "#000000" }}>
              {lang === "en" ? "Change" : lang === "mr" ? "बदला" : "बदलें"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: "dl", label: lang === "en" ? "Driving License" : lang === "mr" ? "ड्रायव्हिंग लायसन्स" : "ड्राइविंग लाइसेंस", url: driver?.docs?.dl?.url },
              { key: "vehicleSide", label: lang === "en" ? "Vehicle - Side" : lang === "mr" ? "गाडी - बाजू" : "गाड़ी - साइड", url: driver?.vehicleSpec?.photoSide?.url },
            ].map((d) => (
              <KycDocThumb key={d.key} url={d.url} label={d.label} lang={lang} fileName={`${driver?.name || "driver"}-${d.key}.jpg`} />
            ))}
          </div>
        </div>

        <button onClick={save} className={`w-full rounded-lg py-3.5 font-bold text-base text-white ${saved ? "shadow-lg" : ""}`} style={{ background: saved ? C.metallicGreen : C.marigoldDeep }}>
          {saved ? (lang === "en" ? "Saved ✓" : lang === "mr" ? "सेव्ह झाले ✓" : "सेव हो गया ✓") : (lang === "en" ? "Save Changes" : lang === "mr" ? "बदल सेव्ह करा" : "बदलाव सेव करें")}
        </button>
      </div>

      {!hasPinAlready && (
        <div className="rounded-xl p-4 mb-3 shadow-sm" style={{ background: C.paper, border: `1.5px solid ${C.marigoldDeep}` }}>
          {pinDone ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} color={C.success} />
              <span className="text-xs font-bold" style={{ color: C.ink }}>{lang === "en" ? "PIN set! You can use it to log in next time." : lang === "mr" ? "PIN सेट झाला! पुढच्या वेळी लॉगिनसाठी वापरू शकता." : "PIN सेट हो गया! अगली बार लॉगिन के लिए इस्तेमाल कर सकते हैं।"}</span>
            </div>
          ) : !pinPromptOpen ? (
            <>
              <div className="text-xs font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "Set a PIN for faster login" : lang === "mr" ? "जलद लॉगिनसाठी PIN सेट करा" : "तेज़ लॉगिन के लिए PIN सेट करें"}</div>
              <p className="text-[11px] mb-2" style={{ color: C.inkSoft }}>{lang === "en" ? "Skip the OTP next time — just your mobile number and a PIN." : lang === "mr" ? "पुढच्या वेळी OTP टाळा — फक्त मोबाइल नंबर आणि PIN." : "अगली बार OTP छोड़ें — बस मोबाइल नंबर और PIN।"}</p>
              <button onClick={() => setPinPromptOpen(true)} className="text-sm font-bold" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Set PIN" : lang === "mr" ? "PIN सेट करा" : "PIN सेट करें"}</button>
            </>
          ) : (
            <div className="space-y-2">
              <input className={inputCls} style={{ ...inputStyle, textAlign: "center", letterSpacing: 2, fontFamily: monoFont }} placeholder={lang === "en" ? "4-digit PIN" : lang === "mr" ? "4-अंकी PIN" : "4-अंकों का PIN"}
                value={newPin} onChange={(e) => { setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setPinError(""); }} />
              <input className={inputCls} style={{ ...inputStyle, textAlign: "center", letterSpacing: 2, fontFamily: monoFont }} placeholder={lang === "en" ? "Confirm PIN" : lang === "mr" ? "PIN कन्फर्म करा" : "PIN कन्फर्म करें"}
                value={newPinConfirm} onChange={(e) => { setNewPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 4)); setPinError(""); }} />
              {newPin && newPinConfirm && newPin !== newPinConfirm && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{lang === "en" ? "PINs don't match" : lang === "mr" ? "PIN जुळत नाहीत" : "PIN मेल नहीं खाते"}</div>}
              {pinError && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{pinError}</div>}
              <button onClick={setUpPin} disabled={newPin.length !== 4 || newPin !== newPinConfirm || pinSaving}
                className="w-full rounded-lg py-2.5 font-bold text-sm" style={{ background: newPin.length === 4 && newPin === newPinConfirm && !pinSaving ? C.marigold : "#E0E0E0", color: newPin.length === 4 && newPin === newPinConfirm && !pinSaving ? "#000000" : "#9AA3B0" }}>
                {pinSaving ? (lang === "en" ? "Saving..." : lang === "mr" ? "सेव्ह होत आहे..." : "सेव हो रहा है...") : (lang === "en" ? "Save PIN" : lang === "mr" ? "PIN सेव्ह करा" : "PIN सेव करें")}
              </button>
            </div>
          )}
        </div>
      )}

      <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 rounded-lg py-3.5 font-bold text-base" style={{ background: C.safety, color: "#FFFFFF", border: `1px solid ${C.safety}` }}>
        <XCircle size={16} /> {lang === "en" ? "Logout" : lang === "mr" ? "लॉगआउट" : "लॉगआउट"}
      </button>
    </div>
  );
}

function DriverApp({ driver, setDriver, bookings, addBid, completeBooking, startLoading, tripLog, vehicleTypes, addVehicleType, raiseAlert, commissionPct, minWallet, bonusPct, lang, onChangeLang, onLogout, withdrawals, requestWithdrawal, rechargeRequests, requestRecharge, onOpenTerms, adminNotifications }) {
  const [tab, setTab] = useState("home");
  const [menuOpen, setMenuOpen] = useState(false);
  // Tapping "Share App" in the hamburger menu doesn't open WhatsApp right
  // away — it first drops down the ₹200 payout note in place, and only a
  // second tap (now "Continue to WhatsApp") actually shares. Reset shut
  // whenever the menu itself closes, so it's always collapsed on reopen.
  const [shareNoteOpen, setShareNoteOpen] = useState(false);
  const [settingsView, setSettingsView] = useState(null); // 'kyc' | 'helpline' | 'profile' | null
  const [selectedAdvanceId, setSelectedAdvanceId] = useState(null);
  // 'current' (default) shows the driver's own trip/bidding activity
  // automatically; 'advance' is the driver's own accepted advance bookings,
  // reached via the "View Advance Ride/s" box below.
  const [rideView, setRideView] = useState("current");
  const myTrip = bookings.find((b) => b.status === "Ongoing" && b.driverName === driver.name && !isFutureAdvance(b.scheduledFor));
  // Jobs this driver is already assigned to but that are scheduled for a
  // future date — kept out of myTrip (above) so today's home screen isn't
  // stuck showing a trip that's days away, but still reachable here.
  const advanceBookings = bookings.filter((b) => b.status === "Ongoing" && b.driverName === driver.name && isFutureAdvance(b.scheduledFor));
  const rideNotifications = useRideNotifications("drivers", driver.mobile, lang);
  const announcementAlerts = useAnnouncementAlerts(adminNotifications, driver.mobile, "driver");

  // Badge + "View your Booking here" callout, shown the moment one of this
  // driver's ADVANCE bids gets accepted (see HamburgerHint/
  // FloatingHamburgerHint) until the menu is actually opened — immediate
  // (myTrip) acceptances deliberately don't trigger this. Unlike the
  // Customer side, acceptance here is a real-time Firestore event triggered
  // by someone else (the customer), not a local button tap — so it's
  // detected by watching for an advanceBookings id that's newly assigned to
  // this driver that wasn't there on the previous check. The ref starts at
  // null so the very first run (mount, or the driver already had an
  // advance booking when they opened the app) just records the baseline
  // instead of firing a false hint.
  const [showBookingHint, setShowBookingHint] = useState(false);
  const assignedIdsKey = advanceBookings.map((b) => b.id).sort().join(",");
  const prevAssignedIdsRef = useRef(null);
  useEffect(() => {
    const currentIds = new Set(assignedIdsKey ? assignedIdsKey.split(",") : []);
    if (prevAssignedIdsRef.current === null) {
      prevAssignedIdsRef.current = currentIds;
      return;
    }
    const hasNew = [...currentIds].some((id) => !prevAssignedIdsRef.current.has(id));
    if (hasNew) setShowBookingHint(true);
    prevAssignedIdsRef.current = currentIds;
  }, [assignedIdsKey]);

  const shareApp = () => {
    // The link carries this driver's own mobile number as their referral
    // code either way, but the ₹200 only ever pays out for a driver-to-driver
    // referral — a customer who signs up via this link is still tracked as
    // referred by this driver, just without a payout (see creditReferralOnce
    // in the root App). The reward itself isn't mentioned in the message text.
    const link = `https://sarthi-transport-74865.web.app?ref=${driver.mobile}`;
    const msg = lang === "en"
      ? `Join Apna Transport — book trucks/tempos or sign up as a driver-partner using my link: ${link}`
      : lang === "mr"
      ? `अपना ट्रान्सपोर्टमध्ये सामील व्हा — माझ्या लिंकवरून ट्रक/टेम्पो बुक करा किंवा ड्रायव्हर-पार्टनर व्हा: ${link}`
      : `अपना ट्रांसपोर्ट से जुड़ें — मेरे लिंक से ट्रक/टेम्पो बुक करें या ड्राइवर-पार्टनर बनें: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  if (settingsView) {
    return (
      <div className="flex-1 overflow-y-auto relative">
        <div className="px-5 pt-3">
          <button onClick={() => setSettingsView(null)} className="flex items-center gap-1 p-3 rounded-full shadow-sm self-start" style={{ background: C.marigold, color: "#000000", border: `1.5px solid ${C.marigoldDeep}` }}>
            <ChevronLeft size={18} strokeWidth={3} />
          </button>
        </div>
        {settingsView === "kyc" && <DriverKyc driver={driver} setDriver={setDriver} vehicleTypes={vehicleTypes} addVehicleType={addVehicleType} lang={lang} />}
        {settingsView === "helpline" && <SosScreen role="driver" raiseAlert={raiseAlert} lang={lang} />}
        {settingsView === "profile" && <DriverProfileEdit driver={driver} setDriver={setDriver} lang={lang} onChangeLang={onChangeLang} onLogout={onLogout} onEditDocuments={() => setSettingsView("kyc")} />}
        {settingsView === "messages" && <AnnouncementsInbox adminNotifications={adminNotifications} myMobile={driver.mobile} toRole="driver" lang={lang} onOpen={announcementAlerts.markSeen} />}
      </div>
    );
  }

  const realHamburgerVisible = tab === "home" && rideView === "current" && !myTrip;

  return (
    <>
      <FloatingHamburgerHint show={showBookingHint && !realHamburgerVisible} onOpenMenu={() => { setMenuOpen(true); setShareNoteOpen(false); setShowBookingHint(false); }} lang={lang} />
      <div className="flex-1 overflow-y-auto relative">
        {/* This whole row (menu, language toggle, arrow, online/offline) is
            for the idle main dashboard only -- Wallet, My Trips, and the
            Advance Ride/s view (all reached via the hamburger menu, and all
            with their own Back control) don't need it, same as an active
            trip doesn't. */}
        {realHamburgerVisible && (
          <div className="flex items-center justify-between gap-2 px-5 pt-3">
            <div className="relative shrink-0">
              <button onClick={() => { setMenuOpen(true); setShareNoteOpen(false); setShowBookingHint(false); }} className="w-9 h-9 rounded-full flex items-center justify-center shadow-sm" style={{ background: "#0052CC", border: "1.5px solid #0052CC" }}>
                <Menu size={18} color="#fff" strokeWidth={2.5} />
              </button>
              <HamburgerHint show={showBookingHint} lang={lang} />
              {announcementAlerts.unreadCount > 0 && (
                <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-white shadow-sm" style={{ background: C.safety }}>
                  {announcementAlerts.unreadCount}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0 flex justify-center">
              {tab === "home" ? (
                <button onClick={() => setTab("wallet")} className="rounded-full px-4 py-2 text-base font-black text-white text-center flex items-center gap-1.5" style={{ background: "#0052CC" }}>
                  <Wallet size={16} color="#fff" /> {lang === "en" ? "My Wallet" : lang === "mr" ? "माझे वॉलेट" : "मेरा वॉलेट"}
                </button>
              ) : (
                <span className="rounded-full px-4 py-2 text-base font-black text-white text-center" style={{ background: "#0052CC" }}>{lang === "en" ? "Customer Requests" : lang === "mr" ? "कस्टमर रिक्वेस्ट" : "कस्टमर रिक्वेस्ट"}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="flex flex-col items-center leading-none" style={{ color: C.inkSoft }}>
                <span className="text-[9px] font-bold">{lang === "en" ? "Driver" : lang === "mr" ? "ड्रायव्हर" : "ड्राइवर"}</span>
                <span className="text-[9px] font-bold mt-0.5">{lang === "en" ? "Duty" : lang === "mr" ? "ड्युटी" : "ड्यूटी"}</span>
              </div>
              <button onClick={() => setDriver({ ...driver, online: !driver.online })}
                className="shrink-0 flex items-center rounded-full p-2" style={{ background: C.marigoldDeep }}>
                <span className="w-14 h-8 rounded-full relative transition-colors" style={{ background: driver.online ? C.success : C.safety }}>
                  <span className="absolute inset-0 flex items-center text-[10px] font-black text-white select-none" style={{ justifyContent: driver.online ? "flex-start" : "flex-end", paddingLeft: driver.online ? 8 : 0, paddingRight: driver.online ? 0 : 8 }}>{driver.online ? "On" : "Off"}</span>
                  <span className="w-6 h-6 rounded-full bg-white absolute top-1 transition-all shadow-sm" style={{ left: driver.online ? 31 : 4 }} />
                </span>
              </button>
            </div>
          </div>
        )}
        {!driver.trialNoteSeen && (
          <button onClick={() => setDriver({ ...driver, trialNoteSeen: true })} className="w-full flex items-center justify-between gap-2 px-5 py-3.5 text-left" style={{ background: C.metallicGold }}>
            <span className="text-xs font-black" style={{ color: "#000000" }}>🎁 {lang === "en" ? "Free trial for 30 days" : lang === "mr" ? "30 दिवसांची फ्री ट्रायल" : "30 दिनों का फ्री ट्रायल"}</span>
            <X size={14} color="#000000" strokeWidth={3} />
          </button>
        )}
        {tab === "home" && <NotificationBanner permission={rideNotifications.permission} onEnable={rideNotifications.enable} lang={lang} />}
        <ForegroundToast toast={rideNotifications.toast} />
        <AnnouncementAlertBanner announcement={announcementAlerts.latestUnread}
          onView={() => { announcementAlerts.markSeen(); setSettingsView("messages"); }}
          onDismiss={announcementAlerts.markSeen} lang={lang} />
        {menuOpen && (
          <div className="fixed inset-0 z-50 flex" onClick={() => setMenuOpen(false)}>
            <div className="w-72 max-w-[82%] h-full overflow-y-auto" style={{ background: C.paper }} onClick={(e) => e.stopPropagation()}>
              <div className="px-4 py-4" style={{ background: C.navy }}>
                <div className="text-sm font-bold text-white">{driver.name}</div>
                {driver.mobile && <div className="text-[11px]" style={{ color: "#FFFFFF", fontFamily: monoFont }}>{driver.mobile}</div>}
              </div>
              <div className="p-2 space-y-2" style={{ borderBottom: `1px solid ${C.line}` }}>
                <button onClick={() => { setTab("home"); setRideView("advance"); setSelectedAdvanceId(null); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-4 py-3 rounded-lg shadow-sm text-left" style={{ background: C.navy }}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: "#000000" }}>
                    <Clock3 size={13} color="#FFFFFF" />
                  </div>
                  <div className="flex-1 min-w-0 text-xs font-black" style={{ color: "#FFFFFF" }}>{lang === "en" ? "Advance Booking/s" : lang === "mr" ? "अ‍ॅडव्हान्स बुकिंग पहा" : "एडवांस बुकिंग देखें"} ({advanceBookings.length})</div>
                </button>
              </div>
              <button onClick={() => { setSettingsView("profile"); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-5 py-4 text-base font-semibold text-left" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
                <UserCircle2 size={16} color={C.marigoldDeep} /> {lang === "en" ? "My Profile" : lang === "mr" ? "माझी प्रोफाइल" : "मेरी प्रोफाइल"}
              </button>
              <button onClick={() => { setTab("history"); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-5 py-4 text-base font-semibold text-left" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
                <Package size={16} color={C.marigoldDeep} /> {lang === "en" ? "My Trips" : lang === "mr" ? "माझ्या ट्रिप्स" : "मेरी ट्रिप्स"}
              </button>
              <button onClick={() => { setSettingsView("messages"); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-5 py-4 text-base font-semibold text-left" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
                <Bell size={16} color={C.marigoldDeep} /> {lang === "en" ? "Admin Announcements" : lang === "mr" ? "अ‍ॅडमिन सूचना" : "एडमिन सूचनाएं"} ({(adminNotifications || []).filter((n) => n.toRole === "driver" && (n.target === "all" || n.target === driver.mobile)).length})
                {announcementAlerts.unreadCount > 0 && (
                  <span className="rounded-full px-1.5 py-0.5 text-[10px] font-black text-white" style={{ background: C.safety }}>{announcementAlerts.unreadCount} {lang === "en" ? "new" : lang === "mr" ? "नवीन" : "नई"}</span>
                )}
              </button>
              <button onClick={() => { setSettingsView("kyc"); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-5 py-4 text-base font-semibold text-left" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
                <Settings2 size={16} color={C.marigoldDeep} /> {lang === "en" ? "Settings (KYC & Vehicle)" : lang === "mr" ? "सेटिंग्स (KYC व गाडी)" : "सेटिंग्स (KYC व गाड़ी)"}
              </button>
              <div style={{ borderBottom: `1px solid ${C.line}` }}>
                <button
                  onClick={() => { if (shareNoteOpen) { shareApp(); setMenuOpen(false); setShareNoteOpen(false); } else { setShareNoteOpen(true); } }}
                  className="w-full flex items-center gap-3 px-5 py-4 text-base font-semibold text-left"
                  style={{ color: C.ink }}>
                  <MessageCircle size={16} color={C.success} className="shrink-0" />
                  <span className="flex-1">{lang === "en" ? "Share App" : lang === "mr" ? "अ‍ॅप शेअर करा" : "ऐप शेयर करें"}</span>
                  <ChevronDown size={16} color={C.inkSoft} className="shrink-0 transition-transform" style={{ transform: shareNoteOpen ? "rotate(180deg)" : "none" }} />
                </button>
                {shareNoteOpen && (
                  <div className="px-4 pb-3 -mt-1">
                    <div className="rounded-lg p-3" style={{ background: C.success }}>
                      <div className="text-xs font-semibold" style={{ color: "#FFFFFF" }}>
                        {lang === "en" ? "You get ₹200 once a driver you refer completes their first ride. Referring a customer just helps them download the app — no bonus for that." : lang === "mr" ? "तुम्ही रेफर केलेल्या ड्रायव्हरची पहिली राइड पूर्ण होताच तुम्हाला ₹200 मिळतील. कस्टमरला रेफर केल्याने फक्त त्यांना अ‍ॅप डाउनलोड करण्यास मदत होते — त्यासाठी कोणताही बोनस नाही." : "आपके रेफर किए हुए ड्राइवर की पहली राइड पूरी होते ही आपको ₹200 मिलेंगे। कस्टमर को रेफर करने से सिर्फ उन्हें ऐप डाउनलोड करने में मदद मिलती है — उसके लिए कोई बोनस नहीं है।"}
                      </div>
                      <button onClick={() => { shareApp(); setMenuOpen(false); setShareNoteOpen(false); }}
                        className="w-full mt-2 rounded-lg py-3 text-base font-bold text-white shadow-lg"
                        style={{ background: C.metallicGreen }}>
                        {lang === "en" ? "Continue to WhatsApp" : lang === "mr" ? "WhatsApp वर सुरू ठेवा" : "WhatsApp पर जारी रखें"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <button onClick={() => { setSettingsView("helpline"); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-5 py-4 text-base font-semibold text-left" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
                <Phone size={16} color={C.safety} /> {lang === "en" ? "Contact & Helpline" : lang === "mr" ? "संपर्क व हेल्पलाइन" : "संपर्क व हेल्पलाइन"}
              </button>
              <button onClick={() => { onOpenTerms(); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-5 py-4 text-base font-semibold text-left" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
                <ClipboardList size={16} color={C.marigoldDeep} /> {lang === "en" ? "Terms & Conditions" : lang === "mr" ? "नियम व अटी" : "नियम व शर्तें"}
              </button>
              <a href="/privacy.html" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-left" style={{ color: C.ink }}>
                <ShieldCheck size={16} color={C.marigoldDeep} /> {lang === "en" ? "Privacy Policy" : lang === "mr" ? "गोपनीयता धोरण" : "गोपनीयता नीति"}
              </a>
            </div>
            <div className="flex-1" style={{ background: "rgba(42,33,28,0.5)" }} />
          </div>
        )}
        {tab === "home" && rideView === "current" && <DriverHome driver={driver} bookings={bookings} addBid={addBid} completeBooking={completeBooking} startLoading={startLoading} vehicleTypes={vehicleTypes} lang={lang} commissionPct={commissionPct} minWallet={minWallet} />}
        {tab === "home" && rideView === "advance" && (
          selectedAdvanceId && advanceBookings.find((ab) => ab.id === selectedAdvanceId) ? (() => {
            const ab = advanceBookings.find((x) => x.id === selectedAdvanceId);
            return (
              <div className="px-5 py-4">
                <button onClick={() => setSelectedAdvanceId(null)} className="flex items-center gap-1 mb-4 p-3 rounded-full shadow-sm" style={{ background: C.marigold, color: "#000000", border: `1.5px solid ${C.marigoldDeep}` }}>
                  <ChevronLeft size={18} strokeWidth={3} />
                </button>
                <RideTypeBanner booking={ab} lang={lang} />
                <div className="rounded-2xl p-3.5 mb-2.5 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                  <div style={{ color: C.ink }}><span className="text-sm font-normal">{lang === "en" ? "Pickup" : lang === "mr" ? "पिकअप" : "पिकअप"}: </span><span className="text-base font-extrabold">{ab.pickup}</span></div>
                  <div style={{ color: C.ink }}><span className="text-sm font-normal">{lang === "en" ? "Drop" : lang === "mr" ? "ड्रॉप" : "ड्रॉप"}: </span><span className="text-base font-extrabold">{ab.drop}</span></div>
                </div>
                <div className="rounded-2xl p-3.5 mb-2.5 shadow-lg" style={{ background: C.metallicGold, border: `2px solid ${C.pimpri}` }}>
                  <div className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Fare and Waiting Charge Policy" : lang === "mr" ? "भाडे आणि वेटिंग चार्ज नियम" : "भाड़ा और वेटिंग चार्ज नियम"}</div>
                  <div className="flex items-center gap-1.5 mt-1" style={{ color: "#000000" }}>
                    <Clock3 size={13} />
                    <span className="text-sm font-bold" style={{ fontFamily: bodyFont }}>{lang === "en" ? "Advance ride:" : lang === "mr" ? "अ‍ॅडव्हान्स राइड:" : "एडवांस राइड:"} {rideDateTimeLabel(ab)}</span>
                  </div>
                  <div className="text-base font-extrabold mt-1" style={{ color: "#000000", fontFamily: bodyFont, fontVariantNumeric: "tabular-nums" }}>{lang === "en" ? "Fixed fare:" : lang === "mr" ? "निश्चित भाडे:" : "तय भाड़ा:"} {fmt(ab.fare)}</div>
                  {ab.hours && (
                    <div className="text-sm font-bold mt-1" style={{ color: "#000000", fontFamily: bodyFont, fontVariantNumeric: "tabular-nums" }}>
                      {lang === "en" ? `${ab.hours} hrs loading/unloading` : lang === "mr" ? `${ab.hours} तास लोडिंग/अनलोडिंग` : `${ab.hours} घंटे लोडिंग/अनलोडिंग`}{ab.extraHourRate ? (lang === "en" ? ` · then ${fmt(ab.extraHourRate)}/hr waiting charge` : lang === "mr" ? ` · त्यानंतर ${fmt(ab.extraHourRate)}/तास वेटिंग चार्ज` : ` · उसके बाद ${fmt(ab.extraHourRate)}/घंटा वेटिंग चार्ज`) : ""}
                    </div>
                  )}
                  <div className="mt-2">
                    {ab.customerMobile ? (
                      <MaskedCallButton bookingId={ab.id} fallbackMobile={ab.customerMobile} lang={lang}
                        label={lang === "en" ? "Call Customer" : lang === "mr" ? "ग्राहकाला कॉल करा" : "ग्राहक को कॉल करें"}
                        className="w-full flex items-center justify-center gap-2 rounded-lg py-3 font-extrabold text-base" style={{ color: "#FFFFFF", fontFamily: bodyFont, background: "#4FC3F7" }} />
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Phone size={14} color="#000000" />
                        <span className="text-sm font-bold" style={{ color: "#000000", fontFamily: bodyFont }}>{lang === "en" ? "revealing after commission cut..." : lang === "mr" ? "कमिशन कापल्यानंतर दिसेल..." : "कमीशन कटने के बाद दिखेगा..."}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })() : (
            <div className="px-5 py-4">
              <button onClick={() => setRideView("current")} className="flex items-center gap-1 mb-4 p-3 rounded-full shadow-sm" style={{ background: C.marigold, color: "#000000", border: `1.5px solid ${C.marigoldDeep}` }}>
                <ChevronLeft size={18} strokeWidth={3} />
              </button>
              {advanceBookings.length === 0 ? (
                <p className="text-xs text-center py-10" style={{ color: C.inkSoft }}>{lang === "en" ? "No advance bookings yet." : lang === "mr" ? "अजून कोणतीही अ‍ॅडव्हान्स बुकिंग नाही." : "अभी तक कोई एडवांस बुकिंग नहीं है।"}</p>
              ) : (
                <div className="space-y-2">
                  {advanceBookings.map((ab) => (
                    <button key={ab.id} onClick={() => setSelectedAdvanceId(ab.id)} className="w-full text-left rounded-xl p-4 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                      <RideTypeBanner booking={ab} lang={lang} />
                      <div className="pb-2.5" style={{ color: C.ink, borderBottom: `2px solid ${C.navy}` }}><span className="text-lg font-black" style={{ color: C.navy }}>{lang === "en" ? "Pickup" : lang === "mr" ? "पिकअप" : "पिकअप"}: </span><span className="text-base font-normal">{ab.pickup}</span></div>
                      <div className="pt-2.5" style={{ color: C.ink }}><span className="text-lg font-black" style={{ color: C.navy }}>{lang === "en" ? "Drop" : lang === "mr" ? "ड्रॉप" : "ड्रॉप"}: </span><span className="text-base font-normal">{ab.drop}</span></div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        )}
        {(tab === "wallet" || tab === "history") && (
          <div className="px-5 pt-3">
            <button onClick={() => setTab("home")} className="flex items-center gap-1 p-3 rounded-full shadow-sm" style={{ background: C.marigold, color: "#000000", border: `1.5px solid ${C.marigoldDeep}` }}>
              <ChevronLeft size={18} strokeWidth={3} />
            </button>
          </div>
        )}
        {tab === "wallet" && <DriverWallet driver={driver} setDriver={setDriver} tripLog={tripLog} commissionPct={commissionPct} minWallet={minWallet} bonusPct={bonusPct} lang={lang} withdrawals={withdrawals} requestWithdrawal={requestWithdrawal} rechargeRequests={rechargeRequests} requestRecharge={requestRecharge} />}
        {tab === "history" && <DriverHistory tripLog={tripLog} driver={driver} commissionPct={commissionPct} lang={lang} />}
      </div>
    </>
  );
}

// =====================================================================
// ADMIN PANEL (desktop)
// =====================================================================
// Live fleet map — plots drivers at their real last-known GPS position
// (shared while they're on an active trip) when Google Maps is configured
// and at least one driver has reported one; otherwise falls back to the
// old fake hashed-position layout so the panel still shows something.
function StatTile({ label, value, color, onClick }) {
  const content = (
    <>
      <div className="text-xs font-bold" style={{ color: C.ink }}>{label}</div>
      <div className="text-3xl font-bold mt-1" style={{ color, fontFamily: monoFont }}>{value}</div>
    </>
  );
  if (onClick) {
    return (
      <button onClick={onClick} className="rounded-xl p-5 shadow-sm text-left w-full" style={{ background: C.paper, border: `1.5px solid ${color}` }}>
        {content}
      </button>
    );
  }
  return <div className="rounded-xl p-4 shadow-sm" style={{ background: C.paper, border: `1.5px solid ${color}` }}>{content}</div>;
}

function AdminFleet({ drivers, customers, driver, bookings, tripLog, commissionPct, minWallet, lang, onNavigate, onLogout }) {
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
  const pendingApprovals = drivers.filter((d) => d.kyc === "Pending").length;
  const lowWalletDrivers = drivers.filter((d) => d.online && !d.blacklisted && d.wallet < minWallet);
  // New signups today (drivers + customers) and drivers still inside their
  // 30-day free trial — both derived live from createdAt, same source of
  // truth as everywhere else trial/signup timing is used in the app.
  const newDriversToday = drivers.filter(isToday);
  const newCustomersToday = (customers || []).filter(isToday);
  const trialDrivers = drivers.filter((d) => isInTrial(d.createdAt));

  const todaysEarnings = (bookings || []).filter((b) => b.status === "Completed" && isToday(b)).reduce((s, b) => s + (b.fare || 0) * (commissionPct / 100), 0);
  const cancelledTodayList = (bookings || []).filter((b) => b.status === "Cancelled" && isToday(b));
  // Currently-open loads no driver has bid on yet — the core marketplace-
  // health signal (not scoped to today, since a load that's sat with zero
  // bids since yesterday is exactly the kind of thing admin needs to see).
  const noBidsList = (bookings || []).filter((b) => b.status === "Bidding" && (!b.bids || b.bids.length === 0));
  // Any not-yet-finished booking scheduled for a future date, regardless of
  // whether it's still awaiting bids or already has a driver assigned.
  const advanceBookingsList = (bookings || []).filter((b) => isFutureAdvance(b.scheduledFor) && b.status !== "Cancelled" && b.status !== "Completed");

  // Tapping one of the "drill-down" tiles opens a dedicated full page (with
  // its own Back button) showing the live record list behind that count —
  // a separate screen, not an inline panel on the dashboard itself.
  const [detailView, setDetailView] = useState(null);

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
    noBids: {
      title: lang === "en" ? "Loads with no bids yet" : lang === "mr" ? "बोली नसलेले लोड" : "बिना बोली वाले लोड",
      emptyMsg: lang === "en" ? "Every open load has at least one bid." : lang === "mr" ? "प्रत्येक खुल्या लोडवर किमान एक बोली आली आहे." : "हर खुले लोड पर कम से कम एक बोली आ चुकी है।",
      items: noBidsList,
      renderItem: (b) => (
        <div key={b.id} className="rounded-lg p-2.5" style={{ background: C.paper, border: `1px solid ${C.safety}` }}>
          <RouteLine pickup={b.pickup} drop={b.drop} lang={lang} />
          <div className="text-[11px] mt-1" style={{ color: C.safety }}>{materialLabel(b.material, lang)} · {b.weight}{lang === "en" ? "kg" : lang === "mr" ? "किलो" : "किग्रा"} · {activityTime(b)}{b.scheduledFor ? ` · ${b.scheduledFor}` : ""}</div>
        </div>
      ),
    },
    newToday: {
      title: lang === "en" ? "New registrations today" : lang === "mr" ? "आजचे नवीन रजिस्ट्रेशन" : "आज के नए रजिस्ट्रेशन",
      emptyMsg: lang === "en" ? "No new signups today yet." : lang === "mr" ? "आज अद्याप कोणतेही नवीन साइनअप झाले नाही." : "आज तक कोई नया साइनअप नहीं हुआ।",
      items: [...newDriversToday.map((d) => ({ ...d, _kind: "driver" })), ...newCustomersToday.map((c) => ({ ...c, _kind: "customer" }))],
      renderItem: (p) => (
        <div key={`${p._kind}-${p.id}`} className="rounded-lg p-2.5 flex items-center justify-between" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          <div>
            <div className="text-xs font-bold" style={{ color: C.ink }}>{p.name}</div>
            <div className="text-[10px]" style={{ color: C.inkSoft, fontFamily: monoFont }}>{p.mobile}{p._kind === "driver" && p.vehicleSpec?.vehicleNumber ? ` · ${p.vehicleSpec.vehicleNumber}` : ""}</div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#FFFFFF", background: p._kind === "driver" ? C.marigoldDeep : C.navy }}>
            {p._kind === "driver" ? (lang === "en" ? "Driver" : lang === "mr" ? "ड्रायव्हर" : "ड्राइवर") : (lang === "en" ? "Customer" : lang === "mr" ? "कस्टमर" : "कस्टमर")}
          </span>
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

  if (detailView) {
    const page = detailPages[detailView];
    return (
      <div>
        <button onClick={() => setDetailView(null)} className="flex items-center gap-1 mb-3 p-3 rounded-full shadow-sm" style={{ background: C.marigold, color: "#000000", border: `1.5px solid ${C.marigoldDeep}` }}>
          <ChevronLeft size={18} strokeWidth={3} />
        </button>
        <h2 className="text-base font-bold mb-3" style={{ color: C.ink }}>{page.title}</h2>
        {page.items.length === 0 ? (
          <p className="text-xs text-center py-10" style={{ color: C.inkSoft }}>{page.emptyMsg}</p>
        ) : (
          <div className="space-y-1.5">{page.items.map(page.renderItem)}</div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Most to least important: loads actively failing to get bids —
          the core marketplace working or not, right now — comes first,
          then other things admin must act on (KYC queue, at-risk wallets),
          then today's health signals (cancellations, earnings, bookings,
          capacity), then pipeline (advance bookings), then growth metrics
          (signups, trial) last — those are useful context, not something
          to act on today. */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <StatTile label={lang === "en" ? "Loads with no bids yet" : lang === "mr" ? "बोली नसलेले लोड" : "बिना बोली वाले लोड"} value={noBidsList.length} color={noBidsList.length > 0 ? C.safety : C.success} onClick={() => setDetailView("noBids")} />
        <StatTile label={lang === "en" ? "Pending KYC approvals" : lang === "mr" ? "प्रलंबित KYC अप्रूव्हल" : "लंबित KYC अप्रूवल"} value={pendingApprovals} color={pendingApprovals > 0 ? C.safety : C.success} onClick={onNavigate ? () => onNavigate("kyc") : undefined} />
        <StatTile label={lang === "en" ? "Online drivers below min. wallet" : lang === "mr" ? "किमान वॉलेटपेक्षा कमी — ऑनलाइन ड्रायव्हर" : "न्यूनतम वॉलेट से कम — ऑनलाइन ड्राइवर"} value={lowWalletDrivers.length} color={lowWalletDrivers.length > 0 ? C.safety : C.success} onClick={() => setDetailView("lowWallet")} />
        <StatTile label={lang === "en" ? "Cancelled today" : lang === "mr" ? "आज रद्द झाल्या" : "आज रद्द हुईं"} value={cancelledTodayList.length} color={cancelledTodayList.length > 0 ? C.safety : C.success} onClick={() => setDetailView("cancelled")} />
        <StatTile label={lang === "en" ? "Today's earnings (commission)" : lang === "mr" ? "आजची कमाई (कमिशन)" : "आज की कमाई (कमीशन)"} value={fmt(todaysEarnings)} color={C.pimpri} onClick={onNavigate ? () => onNavigate("finance") : undefined} />
        <StatTile label={lang === "en" ? "Booked today" : lang === "mr" ? "आज किती गाड्या बुक झाल्या" : "आज कितनी गाड़ियां बुक हुईं"} value={bookedTodayList.length} color={C.pimpri} onClick={() => setDetailView("booked")} />
        <StatTile label={lang === "en" ? "Online — ready for bookings" : lang === "mr" ? "ऑनलाइन — बुकिंगसाठी तयार" : "ऑनलाइन — बुकिंग के लिए तैयार"} value={readyOnlineDrivers.length} color={C.success} onClick={() => setDetailView("online")} />
        <StatTile label={lang === "en" ? "Total advance bookings" : lang === "mr" ? "एकूण अ‍ॅडव्हान्स बुकिंग" : "कुल एडवांस बुकिंग"} value={advanceBookingsList.length} color={C.pimpri} onClick={() => setDetailView("advance")} />
        <StatTile label={lang === "en" ? "New registrations today" : lang === "mr" ? "आजचे नवीन रजिस्ट्रेशन" : "आज के नए रजिस्ट्रेशन"} value={newDriversToday.length + newCustomersToday.length} color={C.pimpri} onClick={() => setDetailView("newToday")} />
        <StatTile label={lang === "en" ? "Drivers in free trial" : lang === "mr" ? "फ्री ट्रायलमधील ड्रायव्हर" : "फ्री ट्रायल में ड्राइवर"} value={trialDrivers.length} color={C.marigoldDeep} onClick={() => setDetailView("trial")} />
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

// Renders one KYC/vehicle document thumbnail with View (opens full-size in
// a new tab) and Download buttons. Download fetches the image as a blob
// first so the browser actually saves the file instead of just navigating
// to it — Firebase Storage download URLs are cross-origin, and browsers
// ignore a plain <a download> on cross-origin links.
function KycDocThumb({ url, label, lang, fileName, height = "h-24" }) {
  const handleDownload = async (e) => {
    e.stopPropagation();
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName || label;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("[kyc doc download]", err);
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
      <SafeImage
        src={url}
        alt={label}
        className={`w-full ${height} object-cover`}
        fallback={
          <div className={`w-full ${height} flex items-center justify-center`} style={{ background: C.paper }}>
            <XCircle size={16} color={C.safety} />
          </div>
        }
      />
      <div className="text-[10px] font-semibold text-center py-1 flex items-center justify-center gap-1" style={{ color: "#FFFFFF", background: url ? C.success : C.safety }}>
        {url ? <CheckCircle2 size={11} /> : <XCircle size={11} />} {label}
      </div>
      {url && (
        <div className="flex" style={{ borderTop: `1px solid ${C.line}` }}>
          <button onClick={() => window.open(url, "_blank", "noopener,noreferrer")} className="flex-1 flex items-center justify-center gap-1 py-2 text-sm font-semibold" style={{ color: C.marigoldDeep }}>
            <Eye size={11} /> {lang === "en" ? "View" : lang === "mr" ? "पहा" : "देखें"}
          </button>
          <button onClick={handleDownload} className="flex-1 flex items-center justify-center gap-1 py-2 text-sm font-semibold" style={{ color: C.marigoldDeep, borderLeft: `1px solid ${C.line}` }}>
            <Download size={11} /> {lang === "en" ? "Download" : lang === "mr" ? "डाउनलोड" : "डाउनलोड"}
          </button>
        </div>
      )}
    </div>
  );
}

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
  const [view, setView] = useState("incomplete"); // 'incomplete' | 'complete'
  const [expandedId, setExpandedId] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null); // { ok, sentCount? } | null
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

  // The push reminder can't carry a working link — sendAdminNotification
  // broadcasts one shared message to the whole list, and the portal link
  // must be personalized per driver (their mobile is right there in the
  // URL — see DriverKycPortal — since that page skips login entirely).
  // So push stays a plain nudge; the actual actionable, personalized
  // link only goes out via each row's WhatsApp button below.
  const reminderMessage = lang === "en"
    ? "Your KYC is incomplete — completing it is mandatory to receive new loads. Please complete it as soon as possible."
    : lang === "mr"
    ? "तुमची KYC अपूर्ण आहे — नवीन लोड मिळवण्यासाठी ती पूर्ण करणे अनिवार्य आहे. कृपया लवकरात लवकर पूर्ण करा."
    : "आपकी KYC अधूरी है — नए लोड पाने के लिए इसे पूरा करना अनिवार्य है। कृपया जल्द से जल्द पूरा करें।";
  const sendToIncomplete = async () => {
    if (sending || notSubmitted.length === 0) return;
    setSending(true);
    setSendResult(null);
    const result = await sendAdminNotification(notSubmitted.map((d) => d.mobile), reminderMessage, "driver");
    setSending(false);
    setSendResult(result);
  };
  // Push relies on the driver already having granted notification
  // permission at some point — exactly the kind of thing a driver who
  // never finished KYC often hasn't done. WhatsApp needs none of that:
  // it opens a chat straight to their number with a personalized link
  // (?driverKyc=1&mobile=...) prefilled, admin just taps Send — no
  // login/OTP step on the other end either, see DriverKycPortal.
  //
  // The message covers both paths at once: the self-serve portal link,
  // plus a fallback asking the driver to just reply on this same WhatsApp
  // number with the raw details/photos if they can't manage the form
  // themselves, so admin can key them into that driver's Firestore doc
  // by hand.
  const whatsappLink = (mobile) => {
    const portalLink = `${window.location.origin}${window.location.pathname}?driverKyc=1&mobile=${mobile}`;
    const msg = lang === "en"
      ? `Your KYC is incomplete — completing it is mandatory to receive new loads. Please fill it in here: ${portalLink}\nIf you're unable to fill the form yourself, share it on this WhatsApp number instead — reply here with: Phone number, Driver photo, Driving license, Vehicle side photo, Vehicle number, Vehicle model name, Capacity, Length, Breadth, and Height — and we'll complete it for you.`
      : lang === "mr"
      ? `तुमची KYC अपूर्ण आहे — नवीन लोड मिळवण्यासाठी ती पूर्ण करणे अनिवार्य आहे. कृपया इथे भरा: ${portalLink}\nजर तुम्हाला स्वतः फॉर्म भरता येत नसेल, तर त्याऐवजी याच व्हॉट्सअॅप नंबरवर पाठवा — इथे उत्तर द्या: फोन नंबर, ड्रायव्हर फोटो, ड्रायव्हिंग लायसन्स, गाडीचा साइडचा फोटो, गाडी नंबर, गाडी मॉडेलचे नाव, क्षमता, लांबी, रुंदी आणि उंची — आम्ही तुमच्या वतीने पूर्ण करू.`
      : `आपकी KYC अधूरी है — नए लोड पाने के लिए इसे पूरा करना अनिवार्य है। कृपया यहां भरें: ${portalLink}\nअगर आप खुद फॉर्म नहीं भर पा रहे हैं, तो इसके बजाय इसी व्हाट्सएप नंबर पर भेजें — यहां जवाब दें: फोन नंबर, ड्राइवर फोटो, ड्राइविंग लाइसेंस, गाड़ी की साइड फोटो, गाड़ी नंबर, गाड़ी मॉडल का नाम, क्षमता, लंबाई, चौड़ाई और ऊंचाई — और हम आपकी ओर से पूरा कर देंगे।`;
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

      {view === "incomplete" ? (
        <div>
          <p className="text-[11px] mb-3" style={{ color: C.inkSoft }}>
            {lang === "en" ? "Some haven't submitted KYC yet; others are submitted and waiting on your approval." : lang === "mr" ? "काहींनी अजून KYC जमा केलेली नाही; इतरांनी जमा केली आहे आणि तुमच्या अप्रूव्हलची वाट पाहत आहेत." : "कुछ ने अभी तक KYC जमा नहीं की; बाकी जमा हो चुकी है और आपके अप्रूवल का इंतज़ार कर रही है।"}
          </p>
          <button onClick={sendToIncomplete} disabled={notSubmitted.length === 0 || sending}
            className="w-full rounded-lg py-3 font-bold text-sm mb-3 flex items-center justify-center gap-1.5"
            style={{ background: notSubmitted.length && !sending ? C.marigold : "#E0E0E0", color: notSubmitted.length && !sending ? "#000000" : "#9AA3B0" }}>
            <Bell size={14} />
            {sending
              ? (lang === "en" ? "Sending..." : lang === "mr" ? "पाठवले जात आहे..." : "भेजा जा रहा है...")
              : (lang === "en" ? `Send KYC reminder to all (${notSubmitted.length})` : lang === "mr" ? `सर्वांना KYC रिमाइंडर पाठवा (${notSubmitted.length})` : `सभी को KYC रिमाइंडर भेजें (${notSubmitted.length})`)}
          </button>
          {sendResult && (
            <div className="text-[11px] font-semibold mb-3" style={{ color: sendResult.ok ? C.success : C.safety }}>
              {sendResult.ok
                ? (lang === "en" ? `Sent — delivered to ${sendResult.sentCount || 0} device(s).` : lang === "mr" ? `पाठवले — ${sendResult.sentCount || 0} डिव्हाइसवर पोहोचले.` : `भेज दिया — ${sendResult.sentCount || 0} डिवाइस पर पहुंचा।`)
                : (lang === "en" ? "Couldn't send — try again." : lang === "mr" ? "पाठवू शकलो नाही — पुन्हा प्रयत्न करा." : "भेज नहीं सका — फिर कोशिश करें।")}
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
  const [trialTab, setTrialTab] = useState("all"); // 'all' | 'trial' | 'main'
  const trialCount = drivers.filter((d) => isInTrial(d.createdAt)).length;
  const byTrialTab = trialTab === "all" ? drivers : drivers.filter((d) => (trialTab === "trial" ? isInTrial(d.createdAt) : !isInTrial(d.createdAt)));
  const filtered = byTrialTab.filter((d) => d.name.includes(q) || (d.vehicleSpec?.vehicleNumber || "").toLowerCase().includes(q.toLowerCase()) || (d.mobile || "").includes(q));
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
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#FFFFFF", background: C.navy }}>{drivers.length}</span>
        </div>
        <button onClick={() => setShowCall((v) => !v)} className="text-sm font-bold px-4 py-2.5 rounded-lg text-white shadow-lg flex items-center gap-1" style={{ background: C.metallicGreen }}>
          {showCall ? (lang === "en" ? "Cancel" : lang === "mr" ? "रद्द करा" : "रद्द करें") : <><Phone size={12} /> {lang === "en" ? "Call Driver" : lang === "mr" ? "ड्रायव्हरला कॉल करा" : "ड्राइवर को कॉल करें"}</>}
        </button>
      </div>
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
          ["all", lang === "en" ? "All" : lang === "mr" ? "सर्व" : "सभी", drivers.length],
          ["trial", lang === "en" ? "Free Trial" : lang === "mr" ? "फ्री ट्रायल" : "फ्री ट्रायल", trialCount],
          ["main", lang === "en" ? "Main Routine" : lang === "mr" ? "मुख्य रुटीन" : "मुख्य रूटीन", drivers.length - trialCount],
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
          return (
            <div key={d.id} className="rounded-lg p-3" style={{ border: `1px solid ${d.blacklisted ? C.safety : C.line}`, background: C.paper }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold" style={{ color: C.ink }}>{d.name}</div>
                  <div className="text-xs font-bold" style={{ color: C.ink, fontFamily: monoFont }}>{d.vehicleSpec?.vehicleNumber || "—"} · {d.mobile} · {lang === "en" ? "Wallet" : lang === "mr" ? "वॉलेट" : "वॉलेट"} {fmt(d.wallet)}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#FFFFFF", background: d.online ? C.success : C.marigoldDeep }}>{d.online ? (lang === "en" ? "Online" : lang === "mr" ? "ऑनलाइन" : "ऑनलाइन") : (lang === "en" ? "Offline" : lang === "mr" ? "ऑफलाइन" : "ऑफलाइन")}</span>
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
                      <button onClick={() => toggleBlacklist(d.id)} className="text-sm font-bold px-3.5 py-2 rounded-lg" style={{ color: "#FFFFFF", background: d.blacklisted ? C.success : C.safety }}>
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
  const filtered = (customers || []).filter((c) => (c.name || "").toLowerCase().includes(q.toLowerCase()) || (c.mobile || "").includes(q) || (c.city || "").toLowerCase().includes(q.toLowerCase()));
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
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={lang === "en" ? "Search by name, mobile or city..." : lang === "mr" ? "नाव, मोबाइल किंवा शहराने शोधा..." : "नाम, मोबाइल या शहर से खोजें..."} className="w-full rounded-lg px-3 py-2 text-xs outline-none mb-3" style={{ border: `1px solid ${C.line}`, background: C.paper, color: C.ink }} />
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
                  <div className="text-[10px] font-bold mt-0.5 truncate" style={{ color: C.ink }}>{[c.address, c.area, c.city, c.state, c.pincode].filter(Boolean).join(", ") || (lang === "en" ? "No address on file" : lang === "mr" ? "पत्ता उपलब्ध नाही" : "पता उपलब्ध नहीं")}</div>
                </div>
                <button onClick={() => setExpandedId(expanded ? null : c.mobile)} className="shrink-0 text-sm font-semibold px-3.5 py-2.5 rounded-lg" style={{ color: "#FFFFFF", background: C.marigoldDeep }}>
                  {expanded ? (lang === "en" ? "Hide" : lang === "mr" ? "लपवा" : "छुपाएं") : (lang === "en" ? "View Details" : lang === "mr" ? "तपशील पहा" : "विवरण देखें")}
                </button>
              </div>

              {expanded && (
                <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.line}` }}>
                  <div className="text-[11px] mb-3" style={{ color: C.ink }}>
                    <b>{lang === "en" ? "Contact number" : lang === "mr" ? "संपर्क नंबर" : "संपर्क नंबर"}:</b> <span style={{ fontFamily: monoFont }}>{c.mobile}</span><br />
                    {c.email && (<><b>{lang === "en" ? "Email" : lang === "mr" ? "ईमेल" : "ईमेल"}:</b> {c.email}<br /></>)}
                    <b>{lang === "en" ? "Address" : lang === "mr" ? "पत्ता" : "पता"}:</b> {[c.address, c.area, c.city, c.state, c.pincode].filter(Boolean).join(", ") || "—"}
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
                              {materialLabel(b.material, lang)} · {b.weight} {lang === "en" ? "kg" : lang === "mr" ? "किलो" : "किग्रा"}
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

function AdminNotify({ drivers, customers, adminNotifications, lang }) {
  const [audience, setAudience] = useState("driver"); // 'driver' | 'customer'
  const [target, setTarget] = useState("all");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const audiencePeople = audience === "driver" ? (drivers || []) : (customers || []);
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
          <button key={a} onClick={() => { setAudience(a); setTarget("all"); }} className="flex-1 rounded-lg py-3 text-base font-bold"
            style={{ background: audience === a ? C.navy : C.paper, color: audience === a ? "#fff" : C.inkSoft, border: `1.5px solid ${audience === a ? C.navy : C.line}` }}>
            {a === "driver" ? (lang === "en" ? "Drivers" : lang === "mr" ? "ड्रायव्हर" : "ड्राइवर") : (lang === "en" ? "Customers" : lang === "mr" ? "कस्टमर" : "कस्टमर")}
          </button>
        ))}
      </div>
      <label className="text-[11px] font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Send to" : lang === "mr" ? "कोणाला पाठवायचे" : "किसे भेजें"}</label>
      <select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full rounded-lg px-3 py-2 text-xs outline-none mb-2" style={{ border: `1px solid ${C.line}`, color: C.ink }}>
        <option value="all">{allLabel}</option>
        {audiencePeople.map((p) => <option key={p.mobile} value={p.mobile}>{p.name}</option>)}
      </select>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={lang === "en" ? "Write a message..." : lang === "mr" ? "संदेश लिहा..." : "संदेश लिखें..."} className="w-full rounded-lg px-3 py-2 text-xs outline-none mb-2" rows={3} style={{ border: `1px solid ${C.line}`, color: C.ink }} />
      {error && <div className="text-[11px] font-bold mb-2" style={{ color: C.safety }}>{error}</div>}
      <button onClick={send} disabled={!message.trim() || sending} className="w-full rounded-lg py-3.5 font-bold text-base mb-4" style={{ background: message.trim() && !sending ? C.marigold : "#E0E0E0", color: message.trim() && !sending ? "#000000" : "#9AA3B0" }}>
        {sending ? (lang === "en" ? "Sending..." : lang === "mr" ? "पाठवले जात आहे..." : "भेजा जा रहा है...") : (lang === "en" ? "Send" : lang === "mr" ? "पाठवा" : "भेजें")}
      </button>
      <div className="text-[11px] font-semibold mb-2" style={{ color: C.inkSoft }}>{lang === "en" ? "Sent Notifications" : lang === "mr" ? "पाठवलेल्या सूचना" : "भेजी गई सूचनाएं"}</div>
      <div className="space-y-2">
        {(adminNotifications || []).length === 0 && <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "No notifications sent yet." : lang === "mr" ? "अजून कोणतीही सूचना पाठवली गेली नाही." : "अभी कोई सूचना नहीं भेजी गई।"}</p>}
        {(adminNotifications || []).map((n) => (
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
            <div className="text-[10px] mt-0.5" style={{ color: n.recipientCount > 0 ? C.success : C.safety }}>
              {n.recipientCount > 0
                ? (lang === "en" ? `Delivered to ${n.recipientCount} device${n.recipientCount > 1 ? "s" : ""}` : lang === "mr" ? `${n.recipientCount} डिव्हाइसवर पोहोचली` : `${n.recipientCount} डिवाइस पर पहुंची`)
                : (lang === "en" ? "No device had notifications enabled" : lang === "mr" ? "कोणत्याही डिव्हाइसवर नोटिफिकेशन चालू नव्हते" : "किसी डिवाइस पर नोटिफिकेशन चालू नहीं था")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminSettings({ commissionPct, setCommissionPct, bonusPct, setBonusPct, minWallet, setMinWallet, lang }) {
  // Commission/bonus/min-wallet are edited as a draft and only written to
  // Firestore on Save, instead of firing a write on every keystroke. Stays
  // in sync with the live values as long as there's no unsaved edit, so an
  // external change (e.g. trial mode toggling commission to 0) still shows
  // up immediately.
  const [draft, setDraft] = useState({ commissionPct, bonusPct, minWallet });
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!dirty) setDraft({ commissionPct, bonusPct, minWallet });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commissionPct, bonusPct, minWallet, dirty]);
  const updateDraft = (patch) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); setSaved(false); };
  const saveSettings = () => {
    setCommissionPct(draft.commissionPct);
    setBonusPct(draft.bonusPct);
    setMinWallet(draft.minWallet);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };
  return (
    <div className="rounded-xl p-4 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
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
      {saved && <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold" style={{ color: C.success }}><CheckCircle2 size={13} /> {lang === "en" ? "Settings saved" : lang === "mr" ? "सेटिंग्स सेव्ह झाल्या" : "सेटिंग्स सेव हो गईं"}</div>}
      <button onClick={saveSettings} disabled={!dirty} className="w-full rounded-lg py-3.5 font-bold text-base"
        style={{ background: dirty ? "#0052CC" : "#E0E0E0", color: dirty ? "#fff" : "#9AA3B0" }}>
        {lang === "en" ? "Save Changes" : lang === "mr" ? "बदल सेव्ह करा" : "बदलाव सेव करें"}
      </button>
    </div>
  );
}

function AdminFinance({ tripLog, commissionPct, lang }) {
  const totalCommission = tripLog.filter((t) => t.status !== "Cancelled").reduce((s, t) => s + t.fare * (commissionPct / 100), 0);
  const downloadReport = () => {
    const header = "Driver,Route,Fare,Commission,Status\n";
    const rows = tripLog.map((t) => `${t.driverName},"${t.pickup} to ${t.drop}",${t.fare},${t.status === "Cancelled" ? 0 : Math.round(t.fare * (commissionPct / 100))},${t.status}`).join("\n");
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
        <div className="text-[11px]" style={{ color: "#FFFFFF" }}>{lang === "en" ? `Total commission so far (${commissionPct}%)` : lang === "mr" ? `आजपर्यंतचे एकूण कमिशन (${commissionPct}%)` : `आज का कुल कमीशन (${commissionPct}%)`}</div>
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
                  {t.status === "Cancelled" ? (lang === "en" ? "Cancelled (refunded)" : lang === "mr" ? "रद्द (परत)" : "रद्द (वापस)") : fmt(t.fare * (commissionPct / 100))}
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

function AdminPanel({ drivers, customers, driver, updateDriverKyc, bookings, tripLog, alerts, toggleBlacklist, deleteDriver, deleteCustomer, commissionPct, setCommissionPct, minWallet, setMinWallet, bonusPct, setBonusPct, lang, onLogout, withdrawals, approveWithdrawal, rechargeRequests, approveRecharge, vehicleTypes, addVehicleType, addManualCustomer, addManualDriver, expenses, expenseCategories, addExpense, addExpenseCategory, callLogs, adminNotifications }) {
  const [tab, setTab] = useState("fleet");
  // "kyc" is deliberately not in this list -- the KYC desk is reached only
  // via the "Pending KYC approvals" tile on the Live Dashboard, not as a
  // persistent top-level tab. The tab === "kyc" route below still exists,
  // so that tile (and its onNavigate("kyc") call) keeps working exactly
  // as before -- this only declutters the tab bar itself.
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
      {tab === "fleet" && <AdminFleet drivers={drivers} customers={customers} driver={driver} bookings={bookings} tripLog={tripLog} commissionPct={commissionPct} minWallet={minWallet} lang={lang} onNavigate={setTab} onLogout={onLogout} />}
      {tab === "kyc" && <AdminKyc drivers={drivers} updateDriverKyc={updateDriverKyc} lang={lang} />}
      {tab === "drivers" && <AdminDriverList drivers={drivers} toggleBlacklist={toggleBlacklist} deleteDriver={deleteDriver} lang={lang} vehicleTypes={vehicleTypes} addVehicleType={addVehicleType} addManualDriver={addManualDriver} />}
      {tab === "customers" && <AdminCustomers customers={customers} bookings={bookings} lang={lang} deleteCustomer={deleteCustomer} />}
      {tab === "expenses" && <AdminExpenses expenses={expenses} expenseCategories={expenseCategories} addExpense={addExpense} addExpenseCategory={addExpenseCategory} lang={lang} />}
      {tab === "settings" && <AdminSettings commissionPct={commissionPct} setCommissionPct={setCommissionPct} bonusPct={bonusPct} setBonusPct={setBonusPct} minWallet={minWallet} setMinWallet={setMinWallet} lang={lang} />}
      {tab === "finance" && <AdminFinance tripLog={tripLog} commissionPct={commissionPct} lang={lang} />}
      {tab === "notify" && <AdminNotify drivers={drivers} customers={customers} adminNotifications={adminNotifications} lang={lang} />}
      {tab === "alerts" && <AdminAlerts alerts={alerts} withdrawals={withdrawals} approveWithdrawal={approveWithdrawal} rechargeRequests={rechargeRequests} approveRecharge={approveRecharge} lang={lang} />}
      {tab === "callLogs" && <AdminCallLogs callLogs={callLogs} bookings={bookings} lang={lang} />}
    </div>
  );
}

// ---------------- Terms ----------------
function TermsModal({ open, onClose, commissionPct, bonusPct, lang, role }) {
  if (!open) return null;
  // Cancellation and Vehicle Documents & Legal Compliance are driver-only
  // concerns (commission/advance-fare holdback, driving license/RC/KYC) —
  // shown to drivers, skipped for customers. Numbering is applied after
  // filtering, so the customer's shorter list still reads as a clean 1..N
  // instead of jumping straight from 2 to 5.
  const allSections = lang === "en" ? [
    ["Load Posting", "Once a load is posted, the pickup-drop details cannot be changed. The final fare will be whatever was agreed in the driver's Accepted Bid.", false],
    ["Bidding System", "The customer is free to accept any one bid among multiple drivers. Once a bid is accepted, it is treated as final.", false],
    ["Cancellation", "If a trip is cancelled by either side after a driver is assigned, the deducted commission/advance fare is not refunded instantly — it is held by admin and automatically adjusted against the driver's next accepted trip, so the driver is not out of pocket. Repeated cancellations may lead to temporary account suspension.", true],
    ["Vehicle Documents & Legal Compliance", "The driver is required to submit a valid driving license, vehicle RC and KYC documents at signup — no load will be shown until admin approves this verification. Beyond that submission, keeping all vehicle documents (RC, insurance, fitness certificate, national/state permit, PUC) and the driver's license valid, accurate, and up to date at all times is the complete and sole responsibility of the Vehicle Owner and Driver — not Apna Transport. If any document is found incomplete, incorrect, expired, or invalid during any trip or inspection, Apna Transport / the company bears no liability whatsoever. Any fine, challan, or legal action imposed by the RTO, traffic police, or any government authority — including full responsibility for payment or settlement — rests solely with the Driver and Vehicle Owner.", true],
    ["Payment", "Apna Transport does not currently charge any commission on trips. The agreed fare is paid by the customer directly to the driver (cash, UPI, or any digital mode) after delivery — the app does not collect any payment on your behalf.", false],
    ["Responsibility for Goods & Loading Costs", "It is the customer's responsibility to ensure the safety and correct information (material type and weight) of the goods, and to bear the full cost of loading/unloading labour (hamali) — this is not the driver's expense. The company is not responsible for any loss, damage, or delay of goods — this responsibility lies with the concerned driver/transporter.", false],
    ["Platform's Role — Intermediary Only (Most Important)",
      "Apna Transport is a technology platform that only serves as a medium to connect the customer (load owner) and independent drivers/transporters. The company/admin is not itself a party to any transport of goods, nor a transport service provider. The platform does not currently charge any fee or commission for connecting customers and drivers; this may change in the future with prior notice to users. Every deal between customer and driver (fare, timing, terms) is entirely a private agreement between the two. The company, admin, or platform will not be liable in any way for theft, damage, delay, accident, wrong payment, dispute, or any direct/indirect loss related to the goods. Full responsibility for any such matter rests with the concerned customer and driver themselves.", false],
    ["Disputes and Jurisdiction", "In case of any complaint or dispute, contact admin via the SOS section — admin can only help as a facilitator, this does not mean admin is responsible for the dispute. In case of any legal dispute, jurisdiction will lie only with Pimpri-Chinchwad / Pune courts.", false],
    ["Overload Charges", "Apna Transport is not responsible for any overload fine, challan, or penalty charged by the RTO, traffic police, or any other authority to either the customer or the driver. Ensuring the vehicle is loaded within its permitted capacity is the joint responsibility of the customer (who declares the weight) and the driver/vehicle owner (who accepts the load) — any overload-related charge or legal action must be settled directly between them.", false],
  ] : lang === "mr" ? [
    ["लोड पोस्टिंग", "लोड पोस्ट केल्यानंतर पिकअप-ड्रॉपची माहिती बदलली जाऊ शकत नाही. अंतिम भाडे तेच असेल जे ड्रायव्हरच्या स्वीकृत बोलीमध्ये (Accepted Bid) ठरले असेल.", false],
    ["बिडिंग सिस्टम", "ग्राहक अनेक ड्रायव्हरांपैकी कोणतीही एक बोली स्वीकारण्यास मोकळा आहे. एकदा बोली स्वीकारल्यानंतर ती अंतिम मानली जाईल.", false],
    ["रद्दीकरण", "बुकिंग फायनल झाल्यानंतर जर कोणत्याही बाजूने ट्रिप रद्द केली गेली, तर कापलेले कमिशन/अ‍ॅडव्हान्स भाडे लगेच परत केले जात नाही — ते अ‍ॅडमिनकडे होल्ड राहते आणि ड्रायव्हरच्या पुढील स्वीकृत ट्रिपच्या कमिशनमध्ये आपोआप अ‍ॅडजस्ट होते, जेणेकरून ड्रायव्हरचे नुकसान होणार नाही. वारंवार रद्द केल्यास खाते तात्पुरते बंद केले जाऊ शकते.", true],
    ["गाडीचे कागदपत्र व कायदेशीर पालन", "ड्रायव्हरने साइनअपच्या वेळी वैध ड्रायव्हिंग लायसन्स, गाडीचे RC आणि KYC कागदपत्रे जमा करणे अनिवार्य आहे — अ‍ॅडमिन अप्रूव्हलपर्यंत कोणताही लोड दाखवला जाणार नाही. याशिवाय, गाडीची सर्व कागदपत्रे (RC, इन्शुरन्स, फिटनेस सर्टिफिकेट, नॅशनल/स्टेट परमिट, PUC) आणि ड्रायव्हरचा लायसन्स नेहमी वैध, बरोबर आणि अद्ययावत ठेवण्याची संपूर्ण व एकमेव जबाबदारी गाडी मालक आणि ड्रायव्हरची असेल — अपना ट्रान्सपोर्टची नाही. जर कोणत्याही ट्रिप किंवा तपासणी दरम्यान एखादे कागदपत्र अपूर्ण, चुकीचे, एक्सपायर्ड किंवा अवैध आढळले, तर अपना ट्रान्सपोर्ट / कंपनी यासाठी कोणत्याही प्रकारे जबाबदार राहणार नाही. RTO, ट्रॅफिक पोलीस किंवा कोणत्याही सरकारी प्राधिकरणाने लावलेला कोणताही दंड, चलन किंवा कायदेशीर कारवाई — पेमेंट किंवा निपटाऱ्याच्या संपूर्ण जबाबदारीसह — पूर्णपणे ड्रायव्हर आणि गाडी मालकाची असेल.", true],
    ["पेमेंट", "अपना ट्रान्सपोर्ट सध्या कोणत्याही ट्रिपवर कोणतेही कमिशन घेत नाही. निश्चित भाडे ग्राहकाकडून डिलिव्हरीनंतर थेट ड्रायव्हरला (रोख, UPI किंवा कोणत्याही डिजिटल माध्यमाने) दिले जाते — अ‍ॅप तुमच्या वतीने कोणतेही पेमेंट गोळा करत नाही.", false],
    ["सामानाची जबाबदारी व लोडिंग खर्च", "सामानाची सुरक्षा आणि बरोबर माहिती (मटेरियल टाइप व वजन) देणे, तसेच लोडिंग-अनलोडिंगच्या हमालीचा संपूर्ण खर्च उचलणे ही ग्राहकाची जबाबदारी आहे — हा ड्रायव्हरचा खर्च नाही. कोणत्याही प्रकारच्या मालाचे नुकसान, तुटफूट किंवा उशीर यासाठी कंपनी जबाबदार राहणार नाही — ही जबाबदारी संबंधित ड्रायव्हर/ट्रान्सपोर्टरची असेल.", false],
    ["प्लॅटफॉर्मची भूमिका — फक्त मध्यस्थ (सर्वात महत्त्वाचे)",
      "अपना ट्रान्सपोर्ट हे एक टेक्नॉलॉजी प्लॅटफॉर्म आहे जे फक्त ग्राहक (लोड मालक) आणि स्वतंत्र ड्रायव्हर/ट्रान्सपोर्टर यांना एकमेकांशी जोडण्याचे माध्यम आहे. कंपनी/अ‍ॅडमिन कोणत्याही मालाच्या वाहतुकीत स्वतः पक्षकार (party) नाही आणि ट्रान्सपोर्ट सेवा पुरवठादारही नाही. प्लॅटफॉर्म सध्या ग्राहक आणि ड्रायव्हरला जोडण्यासाठी कोणतेही शुल्क किंवा कमिशन घेत नाही; भविष्यात यात बदल झाल्यास वापरकर्त्यांना आधीच सूचित केले जाईल. ग्राहक आणि ड्रायव्हर यांच्यात झालेला प्रत्येक व्यवहार (भाडे, वेळ, अटी) पूर्णपणे त्या दोघांमधील खासगी करार आहे. मालाची चोरी, नुकसान, उशीर, अपघात, चुकीचे पेमेंट, वाद, किंवा कोणत्याही प्रकारच्या प्रत्यक्ष/अप्रत्यक्ष नुकसानीसाठी कंपनी, अ‍ॅडमिन किंवा प्लॅटफॉर्म कोणत्याही प्रकारे जबाबदार (liable) राहणार नाही. अशा कोणत्याही प्रकरणाची संपूर्ण जबाबदारी संबंधित ग्राहक आणि ड्रायव्हरची स्वतःची असेल.", false],
    ["वाद आणि क्षेत्राधिकार", "कोणत्याही तक्रारीच्या किंवा वादाच्या स्थितीत SOS सेक्शनद्वारे अ‍ॅडमिनशी संपर्क करा — अ‍ॅडमिन फक्त सहाय्य (facilitation) म्हणून मदत करू शकतो, याचा अर्थ असा नाही की वादाची जबाबदारी अ‍ॅडमिनची आहे. कोणत्याही कायदेशीर वादाच्या स्थितीत क्षेत्राधिकार (Jurisdiction) फक्त पिंपरी-चिंचवड / पुणे कोर्टाचा राहील.", false],
    ["ओव्हरलोड चार्ज", "RTO, ट्रॅफिक पोलीस किंवा इतर कोणत्याही प्राधिकरणाने ग्राहक किंवा ड्रायव्हरवर लावलेल्या कोणत्याही ओव्हरलोड दंड, चलन किंवा पेनल्टीसाठी अपना ट्रान्सपोर्ट जबाबदार नाही. गाडी तिच्या निश्चित क्षमतेच्या आत लोड करणे सुनिश्चित करणे ही ग्राहक (जो वजन सांगतो) आणि ड्रायव्हर/गाडी मालक (जो लोड स्वीकारतो) — दोघांची संयुक्त जबाबदारी आहे. ओव्हरलोडशी संबंधित कोणताही चार्ज किंवा कायदेशीर कारवाई दोघांमध्ये थेट निपटवली गेली पाहिजे.", false],
  ] : [
    ["लोड पोस्टिंग", "लोड पोस्ट करने के बाद पिकअप-ड्रॉप की जानकारी बदली नहीं जा सकती। अंतिम भाड़ा वही होगा जो ड्राइवर की स्वीकृत बोली (Accepted Bid) में तय हुआ हो।", false],
    ["बिडिंग सिस्टम", "ग्राहक कई ड्राइवरों में से किसी भी एक बोली को स्वीकार करने के लिए स्वतंत्र है। एक बार बोली स्वीकार होने के बाद वह अंतिम मानी जाएगी।", false],
    ["रद्दीकरण", "बुकिंग फाइनल होने के बाद अगर किसी भी तरफ से ट्रिप रद्द की जाती है, तो कटा हुआ कमीशन/एडवांस भाड़ा तुरंत वापस नहीं किया जाता — यह एडमिन के पास होल्ड रहता है और ड्राइवर की अगली स्वीकृत ट्रिप के कमीशन में अपने आप एडजस्ट हो जाता है, ताकि ड्राइवर को नुकसान न हो। बार-बार रद्द करने पर खाता अस्थायी रूप से बंद किया जा सकता है।", true],
    ["गाड़ी के दस्तावेज़ व कानूनी अनुपालन", "ड्राइवर को साइनअप के समय वैध ड्राइविंग लाइसेंस, गाड़ी की RC और KYC दस्तावेज़ जमा करना अनिवार्य है — एडमिन अप्रूवल तक कोई भी लोड नहीं दिखाया जाएगा। इसके अलावा, गाड़ी के सभी दस्तावेज़ों (RC, इंश्योरेंस, फिटनेस सर्टिफिकेट, नेशनल/स्टेट परमिट, PUC) और ड्राइवर के लाइसेंस को हर समय वैध, सही और अपडेट रखने की पूरी और एकमात्र जिम्मेदारी गाड़ी मालिक और ड्राइवर की होगी — अपना ट्रांसपोर्ट की नहीं। यदि किसी भी ट्रिप या जांच के दौरान कोई दस्तावेज़ अधूरा, गलत, एक्सपायर्ड या अमान्य पाया जाता है, तो अपना ट्रांसपोर्ट / कंपनी इसके लिए किसी भी प्रकार से उत्तरदायी नहीं होगी। RTO, ट्रैफिक पुलिस या किसी भी सरकारी प्राधिकरण द्वारा लगाया गया कोई भी जुर्माना, चालान या कानूनी कार्रवाई — भुगतान या निपटान की पूरी जिम्मेदारी सहित — पूरी तरह ड्राइवर और गाड़ी मालिक की होगी।", true],
    ["भुगतान", "अपना ट्रांसपोर्ट फिलहाल किसी भी ट्रिप पर कोई कमीशन नहीं लेता। तय भाड़ा ग्राहक द्वारा डिलीवरी के बाद सीधे ड्राइवर को (नकद, UPI या किसी भी डिजिटल माध्यम से) दिया जाता है — ऐप आपकी ओर से कोई भुगतान कलेक्ट नहीं करता।", false],
    ["सामान की जिम्मेदारी व लोडिंग खर्च", "सामान की सुरक्षा और सही जानकारी (मटेरियल टाइप व वजन) देना, साथ ही लोडिंग-अनलोडिंग की हमाली का पूरा खर्च उठाना ग्राहक की जिम्मेदारी है — यह ड्राइवर का खर्च नहीं है। किसी भी प्रकार के माल के नुकसान, टूट-फूट या देरी के लिए कंपनी जिम्मेदार नहीं होगी — यह जिम्मेदारी संबंधित ड्राइवर/ट्रांसपोर्टर की होगी।", false],
    ["प्लेटफ़ॉर्म की भूमिका — केवल मध्यस्थ (सबसे ज़रूरी)",
      "अपना ट्रांसपोर्ट एक टेक्नोलॉजी प्लेटफ़ॉर्म है जो सिर्फ ग्राहक (लोड मालिक) और स्वतंत्र ड्राइवर/ट्रांसपोर्टर को आपस में जोड़ने का माध्यम है। कंपनी/एडमिन किसी भी माल की ढुलाई में स्वयं पक्षकार (party) नहीं है और न ही ट्रांसपोर्ट सेवा प्रदाता है। प्लेटफ़ॉर्म फिलहाल ग्राहक और ड्राइवर को जोड़ने के लिए कोई शुल्क या कमीशन नहीं लेता; भविष्य में इसमें बदलाव होने पर उपयोगकर्ताओं को पहले से सूचित किया जाएगा। ग्राहक और ड्राइवर के बीच हुआ हर सौदा (भाड़ा, समय, शर्तें) पूरी तरह उन दोनों के बीच का निजी अनुबंध है। माल की चोरी, नुकसान, देरी, दुर्घटना, गलत भुगतान, विवाद, या किसी भी प्रकार के प्रत्यक्ष/अप्रत्यक्ष नुकसान के लिए कंपनी, एडमिन या प्लेटफ़ॉर्म किसी भी रूप में उत्तरदायी (liable) नहीं होगा। ऐसे किसी भी मामले की पूरी जिम्मेदारी संबंधित ग्राहक और ड्राइवर की खुद की होगी।", false],
    ["विवाद और क्षेत्राधिकार", "किसी भी शिकायत या विवाद की स्थिति में SOS सेक्शन से एडमिन से संपर्क करें — एडमिन केवल सहायता (facilitation) के तौर पर मदद कर सकता है, इसका मतलब यह नहीं कि विवाद की जिम्मेदारी एडमिन की है। किसी भी कानूनी विवाद की स्थिति में क्षेत्राधिकार (Jurisdiction) केवल पिंपरी-चिंचवड़ / पुणे कोर्ट का रहेगा।", false],
    ["ओवरलोड चार्ज", "RTO, ट्रैफिक पुलिस या किसी भी अन्य प्राधिकरण द्वारा ग्राहक या ड्राइवर पर लगाया गया कोई भी ओवरलोड जुर्माना, चालान या पेनल्टी के लिए अपना ट्रांसपोर्ट जिम्मेदार नहीं है। गाड़ी को उसकी तय क्षमता के भीतर लोड करना सुनिश्चित करना ग्राहक (जो वजन बताता है) और ड्राइवर/गाड़ी मालिक (जो लोड स्वीकार करता है) — दोनों की साझा जिम्मेदारी है। ओवरलोड से जुड़ा कोई भी चार्ज या कानूनी कार्रवाई दोनों के बीच सीधे निपटाई जानी चाहिए।", false],
  ];
  const sections = allSections
    .filter(([, , driverOnly]) => role !== "customer" || !driverOnly)
    .map(([title, text], i) => [`${i + 1}. ${title}`, text]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(42,33,28,0.6)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto" style={{ background: C.paper }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold" style={{ color: C.ink }}>{lang === "en" ? "Terms & Conditions" : lang === "mr" ? "नियम व अटी (Terms & Conditions)" : "नियम व शर्तें (Terms & Conditions)"}</h3>
          <button onClick={onClose} className="text-base font-bold px-3 py-2 rounded" style={{ color: C.inkSoft }}>✕</button>
        </div>
        <div className="space-y-3">
          {sections.map(([title, text]) => (
            <div key={title}>
              <div className="text-xs font-bold mb-0.5" style={{ color: C.marigoldDeep }}>{title}</div>
              <p className="text-xs leading-relaxed" style={{ color: C.inkSoft }}>{text}</p>
            </div>
          ))}
        </div>
        <button onClick={onClose} className="w-full rounded-lg py-3.5 font-bold text-base mt-4" style={{ background: C.marigold, color: "#000000" }}>{lang === "en" ? "Got it" : lang === "mr" ? "समजले" : "समझ गया"}</button>
      </div>
    </div>
  );
}

// =====================================================================
// ROOT APP
// =====================================================================
export default function App() {
  // Persisted so the app remembers the user's role choice and data across reloads —
  // real re-auth (OTP/password) still runs each time via the *Auth verified flags.
  // This per-device stuff stays in localStorage; everything shared between
  // testers (bookings, bids, driver profiles, admin settings...) now lives in
  // Firestore — see firestoreStore.js.
  const [app, setApp] = usePersistedState("sarthi_app", "customer");
  const [role, setRole] = usePersistedState("sarthi_role", null);
  // Every Firestore/Storage read or write below goes through whichever
  // role's own authenticated client is "active" (see setActiveRole in
  // firebaseClient.js) — this has to run before any other effect in this
  // component that touches Firestore, so it's declared first.
  useEffect(() => { setActiveRole(role); }, [role]);
  // Admin Login is only revealed when the page is opened with this secret
  // link (e.g. https://yourapp/?admin=1) — regular Customer/Driver users
  // never see it on the plain URL.
  const adminEntry = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("admin") === "1";
  // The standalone Driver KYC portal (e.g. https://yourapp/?driverKyc=1) —
  // linked from Admin's KYC desk "Send" button — is a self-contained route
  // that bypasses role-select/login entirely, see the render gate below
  // and DriverKycPortal.
  const driverKycPortal = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("driverKyc") === "1";
  // Not persisted like customer/driver auth (those are real Firebase phone
  // OTP sessions) — admin is gated by a plain password, so every fresh page
  // load must go through AdminLogin again rather than silently staying
  // signed in and jumping straight to the Customer/Driver preview toggle.
  // Tracks real connectivity (not just navigator.onLine, which only means
  // "some network interface is up" — WiFi connected to a router with no
  // actual internet, or certain mobile data states, still reports true)
  // so the app can reliably block behind a "you're offline" screen. Backed
  // by an actual network probe: a tiny same-origin fetch with a timeout,
  // re-checked periodically and whenever the browser's own online/offline
  // events fire or the tab becomes visible again.
  // connectivityChecked stays false until the very first probe resolves, so
  // the app never briefly flashes real content (or the offline screen)
  // based on the unverified initial guess before we actually know.
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [connectivityChecked, setConnectivityChecked] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!navigator.onLine) { if (!cancelled) { setIsOnline(false); setConnectivityChecked(true); } return; }
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        await fetch(`/favicon.svg?_=${Date.now()}`, { method: "GET", cache: "no-store", signal: controller.signal });
        clearTimeout(timeout);
        if (!cancelled) setIsOnline(true);
      } catch {
        if (!cancelled) setIsOnline(false);
      } finally {
        if (!cancelled) setConnectivityChecked(true);
      }
    };
    check();
    const interval = setInterval(check, 6000);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    window.addEventListener("online", check);
    window.addEventListener("offline", check);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  const [adminAuth, setAdminAuth] = useState(false);
  const [customerAuth, setCustomerAuth] = usePersistedState("sarthi_customerAuth", { verified: false, mobile: "" });
  // The customer's profile is looked up live from Firestore by their
  // verified mobile number (exactly like the driver profile) instead of a
  // local cache — a local cache doesn't know which mobile it belongs to, so
  // a second customer verifying on the same device would otherwise see the
  // first customer's leftover profile. customerChecked distinguishes "we
  // haven't looked yet" from "we looked, and there's no profile".
  const [customer, setCustomer] = useState(null);
  const [customerChecked, setCustomerChecked] = useState(false);
  useEffect(() => {
    if (!customerAuth.verified || !customerAuth.mobile) { setCustomer(null); setCustomerChecked(false); return; }
    if (!firestoreReady) { setCustomer(null); setCustomerChecked(true); return; }
    setCustomerChecked(false);
    return subscribeDoc("customers", customerAuth.mobile, (data) => { setCustomer(data); setCustomerChecked(true); });
  }, [customerAuth.verified, customerAuth.mobile]);
  const updateCustomerProfile = (patch) => {
    setCustomer((prev) => {
      const next = { ...prev, ...patch };
      if (firestoreReady && customerAuth.mobile) replaceDoc("customers", customerAuth.mobile, { ...next, mobile: customerAuth.mobile }).catch((e) => console.error(e));
      return next;
    });
  };
  const [driverAuth, setDriverAuth] = usePersistedState("sarthi_driverAuth", { verified: false, mobile: "" });
  // Opening the app with ?admin=1 skips the role-choice screen entirely and
  // goes straight to the Admin login form — no option to pick Customer/Driver.
  useEffect(() => {
    if (adminEntry && role === null) setRole("admin");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminEntry]);
  // Backs the manifest's home-screen shortcuts (?open=customer / ?open=driver)
  // — jumps straight past the role-choice screen on a fresh load, same as
  // adminEntry above. Harmless no-op for anyone opening the plain URL.
  useEffect(() => {
    const open = new URLSearchParams(window.location.search).get("open");
    if ((open === "customer" || open === "driver") && role === null) { setRole(open); setApp(open); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // A referral link (?ref=...) must land on the role-choice screen the
  // FIRST time it's opened, not skip straight into whichever role this
  // device last used (role is persisted — see sarthi_role above) — the
  // referred person needs to be free to pick Customer or Driver. But the
  // ref param stays in the address bar forever after that (nothing strips
  // it, and CustomerOnboarding/DriverOnboarding read it again later for
  // referral-bonus attribution, so it can't just be removed from the URL).
  // Two guards keep it from re-firing on every future load:
  // - Once EITHER role is actually signed in/verified, never reset again —
  //   from that point on, the only way back to role selection is Logout,
  //   same as for anyone who never came in via a referral link at all.
  // - Before that (still mid-signup, not yet verified), a sessionStorage
  //   flag keyed by the ref value stops it firing again on a same-tab
  //   refresh, so an accidental reload doesn't wipe an in-progress form —
  //   but still lets a genuinely different referral link force the choice
  //   again within the same tab.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    const alreadySignedIn = customerAuth.verified || driverAuth.verified;
    if (ref && !alreadySignedIn && sessionStorage.getItem("sarthi_ref_handled") !== ref) {
      sessionStorage.setItem("sarthi_ref_handled", ref);
      setRole(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // "Remembered login" is now a real Firebase Auth session (see
  // customerFirebaseAuth/driverFirebaseAuth in firebaseClient.js) — signing
  // out below clears it for real, instead of just a locally-stored number.
  //
  // One-number-one-app: Customer and Driver can't be active at the same
  // time — RoleSelect hides whichever one isn't currently verified's
  // sibling (see showCustomer/showDriver there) while the other is live.
  // Logging out clears that role's session and returns to the main role
  // picker (not straight back into that same role's login form), so both
  // options are visible again for whoever picks up the device next.
  const logoutRole = (targetRole) => {
    if (targetRole === "admin") { setAdminAuth(false); if (adminFirebaseAuth) signOut(adminFirebaseAuth).catch((e) => console.error(e)); }
    if (targetRole === "customer") { setCustomerAuth({ verified: false, mobile: "" }); if (customerFirebaseAuth) signOut(customerFirebaseAuth).catch((e) => console.error(e)); }
    if (targetRole === "driver") { setDriverAuth({ verified: false, mobile: "" }); if (driverFirebaseAuth) signOut(driverFirebaseAuth).catch((e) => console.error(e)); }
    setRole(null);
  };
  const logout = () => {
    logoutRole(role);
  };
  // Returns to role selection without clearing OTP verification, so tapping
  // Customer/Driver by mistake and going back doesn't force a re-login.
  const goHome = () => setRole(null);
  // Defaults to Hindi — every screen up through signup (role select, OTP,
  // registration forms) stays in Hindi for a brand-new install. The
  // LanguageSelect prompt only appears once, right after a genuinely new
  // Customer/Driver signup completes (see langPromptPending below); a
  // returning/login user never has this flag set, so they never see it.
  const [lang, setLang] = usePersistedState("sarthi_lang", "hi");
  const [langPromptPending, setLangPromptPending] = usePersistedState("sarthi_langPromptPending", false);
  // Google Places Autocomplete's suggestion language is fixed when its
  // script loads (see googleMapsContext.jsx) and can't be hot-swapped — so
  // picking a language reloads the page. localStorage is written directly
  // (not just via setLang's own effect) so the new value is guaranteed to
  // be there before the reload happens, regardless of React's effect-flush
  // timing. There is no in-app toggle to change it afterwards.
  const chooseLang = (l) => {
    try { window.localStorage.setItem("sarthi_lang", JSON.stringify(l)); } catch { /* storage unavailable */ }
    try { window.localStorage.setItem("sarthi_langPromptPending", "false"); } catch { /* storage unavailable */ }
    setLang(l);
    setLangPromptPending(false);
    window.location.reload();
  };
  const [showTerms, setShowTerms] = useState(false);

  // ---------------------------------------------------------------------
  // Shared pilot state — synced live across every tester's device via
  // Firestore. Each collection is subscribed once on mount; every write
  // below just fires the Firestore call and lets the subscription flow the
  // (near-instant, local-first) update back into these mirrors.
  // ---------------------------------------------------------------------
  const [vehicleTypes, setVehicleTypesLocal] = useState(DEFAULT_VEHICLES);
  const [drivers, setDrivers] = useState([]); // every driver, including "me"
  const [driver, setDriverLocal] = useState(null); // null until my own profile loads
  const [bookings, setBookings] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [rechargeRequests, setRechargeRequests] = useState([]);
  const [settings, setSettingsLocal] = useState({ commissionPct: 0, bonusPct: 2, minWallet: 500 });
  const commissionPct = settings.commissionPct;
  const bonusPct = settings.bonusPct;
  const minWallet = settings.minWallet;
  const setCommissionPct = (v) => patchDoc("settings", "main", { commissionPct: typeof v === "function" ? v(commissionPct) : v }).catch((e) => console.error(e));
  const setBonusPct = (v) => patchDoc("settings", "main", { bonusPct: typeof v === "function" ? v(bonusPct) : v }).catch((e) => console.error(e));
  const setMinWallet = (v) => patchDoc("settings", "main", { minWallet: typeof v === "function" ? v(minWallet) : v }).catch((e) => console.error(e));

  useEffect(() => {
    if (!firestoreReady) return;
    seedIfEmpty("vehicleTypes", DEFAULT_VEHICLES, "key").catch((e) => console.error("[seed vehicleTypes]", e));
    return subscribeCollection("vehicleTypes", setVehicleTypesLocal, null);
  }, []);
  // These four collections require real authentication under the current
  // Firestore rules (isSignedIn()) — the dependency array must include every
  // auth transition, not just mount ([]) or role alone, otherwise a
  // subscription that first fires before login finishes gets permanently
  // denied and never retries once the user actually signs in.
  const authDeps = [role, customerAuth.verified, driverAuth.verified, adminAuth];
  useEffect(() => (firestoreReady ? subscribeCollection("drivers", setDrivers, null) : undefined), authDeps);
  // One-time backfill for drivers approved before the profile-photo change
  // (see DriverProfileEdit/DriverKyc) — copies the KYC driver photo into
  // the top-level photo field for anyone missing it, so their customer-
  // facing avatar isn't stuck blank until their next KYC resubmission.
  // Runs opportunistically off this same drivers subscription, from
  // whichever client happens to have the app open; the ref guards against
  // re-patching the same driver twice in one session while the write is
  // still in flight, and it's naturally self-terminating — once a driver's
  // photo field is set, they never match the condition again.
  const backfilledPhotoRef = useRef(new Set());
  useEffect(() => {
    if (!firestoreReady) return;
    drivers.forEach((d) => {
      if (!d.photo && d.docs?.photo && d.mobile && !backfilledPhotoRef.current.has(d.mobile)) {
        backfilledPhotoRef.current.add(d.mobile);
        patchDoc("drivers", d.mobile, { photo: d.docs.photo }).catch((e) => console.error("[driver photo backfill]", e));
      }
    });
  }, [drivers, firestoreReady]);
  // Only Admin needs the full customer list (profile/address oversight).
  const [allCustomers, setAllCustomers] = useState([]);
  useEffect(() => (firestoreReady && role === "admin" && adminAuth ? subscribeCollection("customers", setAllCustomers, null) : undefined), authDeps);
  useEffect(() => (firestoreReady ? subscribeCollection("bookings", setBookings) : undefined), authDeps);
  // Only Admin ever reads this (see AdminAlerts) — matches the Firestore
  // rule restricting alerts to admin-only reads.
  useEffect(() => (firestoreReady && role === "admin" && adminAuth ? subscribeCollection("alerts", setAlerts) : undefined), authDeps);
  useEffect(() => (firestoreReady ? subscribeCollection("withdrawals", setWithdrawals) : undefined), authDeps);
  useEffect(() => (firestoreReady ? subscribeCollection("rechargeRequests", setRechargeRequests) : undefined), authDeps);
  // Masked-call audit trail (see functions/index.js: initiateMaskedCall) —
  // admin-only read, same pattern as alerts above.
  const [callLogs, setCallLogs] = useState([]);
  useEffect(() => (firestoreReady && role === "admin" && adminAuth ? subscribeCollection("callLogs", setCallLogs) : undefined), authDeps);
  // Admin "Send Notification" history (see functions/index.js:
  // sendAdminNotification) — doubles as the announcements list drivers and
  // customers read in their own "Admin Announcements" inbox (hamburger
  // menu), not just admin's own Sent Notifications view, so (unlike
  // callLogs/alerts) this subscribes for every signed-in role, same pattern
  // as bookings/drivers above.
  const [adminNotifications, setAdminNotifications] = useState([]);
  useEffect(() => (firestoreReady ? subscribeCollection("adminNotifications", setAdminNotifications) : undefined), authDeps);
  // Business expenses — admin-only, same pattern as alerts.
  const [expenses, setExpenses] = useState([]);
  useEffect(() => (firestoreReady && role === "admin" && adminAuth ? subscribeCollection("expenses", setExpenses) : undefined), authDeps);
  const [expenseCategories, setExpenseCategories] = useState({}); // { hiName: {key, hi, en, icon} }
  useEffect(() => (firestoreReady && role === "admin" && adminAuth
    ? subscribeCollection("expenseCategories", (docs) => {
        const map = {};
        docs.forEach((d) => { map[d.hi] = d; });
        setExpenseCategories(map);
      }, null)
    : undefined), authDeps);
  useEffect(() => {
    if (!firestoreReady) return;
    // Subscribe first, create-if-missing in the background — awaiting the
    // create before subscribing would leave everyone stuck on defaults
    // forever if that one initial call is slow on a flaky connection.
    const unsub = subscribeDoc("settings", "main", (data) => { if (data) setSettingsLocal(data); });
    getOrCreateDoc("settings", "main", { commissionPct: 0, bonusPct: 2, minWallet: 500 })
      .catch((e) => console.error("[settings init]", e));
    return unsub;
  }, []);

  // My own driver profile — created on first driver login (keyed by mobile
  // number so every tester gets their own real identity), then kept live.
  useEffect(() => {
    if (!firestoreReady || !driverAuth.verified || !driverAuth.mobile) { setDriverLocal(null); return; }
    const unsub = subscribeDoc("drivers", driverAuth.mobile, (data) => setDriverLocal(data));
    getOrCreateDoc("drivers", driverAuth.mobile, {
      // kyc stays null (not "Pending") until they actually submit the KYC
      // form below, so admin's approval queue doesn't fill up with blank
      // entries for testers who've only logged in so far.
      name: driverAuth.mobile, mobile: driverAuth.mobile, online: true, kyc: null,
      wallet: 500, bonus: 0, heldCredit: 0, rating: 4.5, blacklisted: false, docs: null, vehicleSpec: null,
    }).catch((e) => console.error("[driver init]", e));
    return unsub;
  }, [driverAuth.verified, driverAuth.mobile]);

  const setDriver = (updater) => {
    if (!driver) return;
    const next = typeof updater === "function" ? updater(driver) : updater;
    if (firestoreReady && driverAuth.mobile) replaceDoc("drivers", driverAuth.mobile, next).catch((e) => console.error("[driver save]", e));
  };

  const [driverResubmitting, setDriverResubmitting] = useState(false);
  useEffect(() => {
    if (driver?.kyc !== "Rejected") setDriverResubmitting(false);
  }, [driver?.kyc]);

  const addVehicleType = (v) => createDoc("vehicleTypes", v.key, v).catch((e) => console.error(e));

  // Admin-side manual registration — lets admin add a customer/driver
  // straight into the database without them going through OTP signup
  // themselves. Keyed by mobile (same identity model as self-signup), so
  // once that number logs in for real it lands on an already-complete
  // profile instead of the onboarding flow.
  // Checks Firestore directly for the duplicate-mobile guard, not the
  // locally subscribed allCustomers/drivers array — that array can briefly
  // hold an optimistic local write from a rapid double-click before the
  // server confirms (or rejects) it, which was falsely tripping this check
  // even when nothing had actually been saved.
  const addManualCustomer = async (fields) => {
    const mobile = (fields.mobile || "").trim();
    if (!mobile) return Promise.reject(new Error("duplicate-or-missing-mobile"));
    const existing = await getDocOnce("customers", mobile);
    if (existing) return Promise.reject(new Error("duplicate-or-missing-mobile"));
    return replaceDoc("customers", mobile, {
      mobile, name: fields.name.trim(), email: null, photo: null,
      address: fields.address || "", area: fields.area || "", city: fields.city || "", state: fields.state || "", pincode: fields.pincode || "",
      referredBy: null, referralCredited: false,
      createdAt: serverTimestamp(),
    });
  };
  const addManualDriver = async (fields) => {
    const mobile = (fields.mobile || "").trim();
    if (!mobile) return Promise.reject(new Error("duplicate-or-missing-mobile"));
    const existing = await getDocOnce("drivers", mobile);
    if (existing) return Promise.reject(new Error("duplicate-or-missing-mobile"));
    return replaceDoc("drivers", mobile, {
      mobile, name: fields.name.trim(), online: false, kyc: "Approved", rating: 4.5,
      wallet: 500, bonus: 0, heldCredit: 0, blacklisted: false, docs: null,
      address: fields.address || "", city: fields.city || "", state: fields.state || "", pincode: fields.pincode || "",
      vehicleSpec: { type: fields.vehicleTypeKey, vehicleNumber: fields.vehicleNumber.trim().toUpperCase(), capacityKg: Number(fields.capacityKg) || null },
      createdAt: serverTimestamp(),
    });
  };

  // Trip history is just every booking that's been assigned to a driver —
  // no separate collection to keep in sync.
  const tripLog = bookings.filter((b) => b.driverName);

  const requestWithdrawal = (amount) => {
    if (amount <= 0 || !driver) return;
    setDriver({ ...driver, bonus: Math.max(0, (driver.bonus || 0) - amount) });
    createDoc("withdrawals", genId("W"), { role: "driver", driverMobile: driver.mobile, driverName: driver.name, amount, status: "Pending" }).catch((e) => console.error(e));
  };
  const approveWithdrawal = (id) => patchDoc("withdrawals", id, { status: "Approved" }).catch((e) => console.error(e));

  // Recharging the main wallet is a request admin must approve (proof of an
  // outside UPI/cash payment), not an instant self-credit.
  const requestRecharge = (amount) => {
    if (amount <= 0 || !driver) return;
    createDoc("rechargeRequests", genId("R"), { driverMobile: driver.mobile, driverName: driver.name, amount, status: "Pending" }).catch((e) => console.error(e));
  };
  const approveRecharge = (id) => {
    const req = rechargeRequests.find((r) => r.id === id);
    if (req && req.status === "Pending") {
      const target = drivers.find((d) => d.mobile === req.driverMobile);
      if (target) patchDoc("drivers", target.mobile, { wallet: (target.wallet || 0) + req.amount }).catch((e) => console.error(e));
    }
    patchDoc("rechargeRequests", id, { status: "Approved" }).catch((e) => console.error(e));
  };

  const createLoad = ({ pickup, drop, vehicle, material, weight, distance, scheduledFor, pickupLat, pickupLng, dropLat, dropLng }) => {
    createDoc("bookings", genId(), {
      pickup, drop, vehicle, material, weight, distance, status: "Bidding", bids: [], fare: null,
      driverName: null, progress: 0, scheduledFor: scheduledFor || null, customerMobile: customerAuth.mobile || "",
      pickupLat: pickupLat ?? null, pickupLng: pickupLng ?? null, dropLat: dropLat ?? null, dropLng: dropLng ?? null,
      driverLocation: null,
    }).catch((e) => console.error(e));
  };

  // A driver can't even place a bid — let alone have one accepted — on a
  // load that would conflict with a commitment they already have (see
  // findDriverLoadConflict). This is the authoritative check: DriverHome
  // hides conflicting loads from the list as the first line of defense, but
  // this is what actually stops the write if a stale/cached load slips
  // through.
  const addBid = (bookingId, bid) => {
    const b = bookings.find((x) => x.id === bookingId);
    if (!b) return null;
    const bidDriver = drivers.find((d) => d.name === bid.driverName);
    // Authoritative re-check (not just the client-side openLoads filter) —
    // current loads only accept bids from drivers within BID_RADIUS_KM of
    // the pickup point; advance bookings are exempt.
    if (!isFutureAdvance(b.scheduledFor) && b.pickupLat != null && b.pickupLng != null) {
      const loc = bidDriver?.lastKnownLocation;
      const distKm = loc ? haversineKm(loc.lat, loc.lng, b.pickupLat, b.pickupLng) : null;
      if (distKm == null || distKm > BID_RADIUS_KM) {
        return lang === "en"
          ? `⚠️ You are outside the ${BID_RADIUS_KM}km bidding radius for this load's pickup point.`
          : lang === "mr"
          ? `⚠️ तुम्ही या लोडच्या पिकअप ठिकाणापासून ${BID_RADIUS_KM}km च्या बोली परिघाबाहेर आहात.`
          : `⚠️ आप इस लोड के पिकअप स्थान से ${BID_RADIUS_KM}km के बोली दायरे से बाहर हैं।`;
      }
    }
    const conflict = findDriverLoadConflict(bidDriver, { id: b.id, scheduledFor: b.scheduledFor, hours: bid.hours }, bookings, vehicleTypes, lang);
    if (conflict) return conflict;
    const rest = (b.bids || []).filter((x) => x.driverName !== bid.driverName);
    patchDoc("bookings", bookingId, { bids: [...rest, { id: genId("B"), ...bid }] }).catch((e) => console.error(e));
    return null;
  };

  const mobileForDriverName = (name) => drivers.find((d) => d.name === name)?.mobile || "";

  const unfreezeDriverName = (driverName) => {
    if (!driverName) return;
    const affected = bookings.filter((b) => b.status === "Bidding" && (b.bids || []).some((x) => x.driverName === driverName && x.paused));
    affected.forEach((b) => {
      patchDoc("bookings", b.id, { bids: b.bids.map((x) => x.driverName === driverName ? { ...x, paused: false } : x) }).catch((e) => console.error(e));
    });
  };

  const acceptBid = (bookingId, bidId) => {
    const b = bookings.find((x) => x.id === bookingId);
    const bid = b?.bids?.find((x) => x.id === bidId);
    if (!b || !bid) return null;
    const bidDriver = drivers.find((d) => d.name === bid.driverName);
    const conflict = findDriverLoadConflict(bidDriver, { id: b.id, scheduledFor: b.scheduledFor, hours: bid.hours }, bookings, vehicleTypes, lang);
    if (conflict) return conflict;
    const otp = String(Math.floor(1000 + Math.random() * 9000));
    patchDoc("bookings", bookingId, {
      status: "Ongoing", fare: bid.amount, driverName: bid.driverName, driverMobile: mobileForDriverName(bid.driverName),
      hours: bid.hours, extraHourRate: bid.extraHourRate, progress: 0, otp, acceptedAt: serverTimestamp(),
    }).catch((e) => console.error(e));

    // Commission cut instantly on acceptance, only for the accepted
    // driver's own device — any held credit from a past cancellation offsets
    // this trip's commission first. 0% while this specific driver is still
    // within their own 30-day trial (from their own signup date).
    if (bid.driverName === driver?.name) {
      const effCommissionPct = isInTrial(driver.createdAt) ? 0 : commissionPct;
      const effBonusPct = isInTrial(driver.createdAt) ? 0 : bonusPct;
      const commissionAmt = bid.amount * (effCommissionPct / 100);
      const bonusAmt = bid.amount * (effBonusPct / 100);
      const held = driver.heldCredit || 0;
      const offset = Math.min(held, commissionAmt);
      setDriver({
        ...driver,
        wallet: Math.max(0, driver.wallet - (commissionAmt - offset)),
        bonus: (driver.bonus || 0) + bonusAmt,
        heldCredit: Math.max(0, held - offset),
      });
    }

    // Freeze: pause (not delete) this driver's pending quotes on every other
    // open load — they're busy on this trip and stop appearing as "highest"
    // etc. on the customer's screen. They come back (unfreeze) on trip end.
    const others = bookings.filter((x) => x.id !== bookingId && x.status === "Bidding" && (x.bids || []).some((y) => y.driverName === bid.driverName));
    others.forEach((x) => {
      patchDoc("bookings", x.id, { bids: x.bids.map((y) => y.driverName === bid.driverName ? { ...y, paused: true } : y) }).catch((e) => console.error(e));
    });
    return null;
  };

  // Once the driver has verified pickup OTP (loadingStartedAt set), the
  // goods are considered loaded/in transit — cancellation locks out from
  // here on, for either side, from any entry point (not just the button
  // itself, which is hidden — this is the actual enforcement point).
  // Returns an error string when blocked, null when the cancellation went
  // through.
  const cancelBooking = (id) => {
    const b = bookings.find((x) => x.id === id);
    if (!b) return null;
    if (b.loadingStartedAt) {
      return lang === "en"
        ? "Trip cannot be cancelled! The driver has verified the OTP and the goods are loaded/in transit. This trip will only end once the driver completes it (End Trip). Contact support for any help."
        : lang === "mr" ? "ट्रिप रद्द केली जाऊ शकत नाही! ड्रायव्हरने ओटीपी (OTP) सत्यापित केला आहे आणि माल लोड/ट्रान्झिटमध्ये आहे. ही ट्रिप फक्त ड्रायव्हरने प्रवास पूर्ण (End Trip) केल्यावरच संपेल. कोणत्याही मदतीसाठी सपोर्टशी संपर्क करा." : "ट्रिप कैंसल नहीं की जा सकती! ड्राइवर द्वारा ओटीपी (OTP) सत्यापित किया जा चुका है और माल लोड/ट्रांजिट में है। यह ट्रिप केवल ड्राइवर द्वारा यात्रा पूरी (End Trip) करने के बाद ही समाप्त होगी। किसी भी सहायता के लिए सपोर्ट से संपर्क करें।";
    }
    if (b.status === "Ongoing" && b.driverName === driver?.name && b.fare) {
      // New cancellation rule: the cut commission/advance is held by admin,
      // not refunded instantly — it auto-adjusts against the driver's next
      // accepted trip so the driver isn't out of pocket. Matches whatever
      // rate actually applied when the commission was cut (0% if this
      // driver was in their own trial at the time).
      const effCommissionPct = isInTrial(driver.createdAt) ? 0 : commissionPct;
      const effBonusPct = isInTrial(driver.createdAt) ? 0 : bonusPct;
      const held = b.fare * (effCommissionPct / 100);
      const bonusReverse = b.fare * (effBonusPct / 100);
      setDriver({ ...driver, heldCredit: (driver.heldCredit || 0) + held, bonus: Math.max(0, (driver.bonus || 0) - bonusReverse) });
    }
    if (b.status === "Ongoing" && b.driverName) unfreezeDriverName(b.driverName);
    patchDoc("bookings", id, { status: "Cancelled" }).catch((e) => console.error(e));
    return null;
  };
  const rateBooking = (id, rating) => patchDoc("bookings", id, { rating }).catch((e) => console.error(e));
  // Credits ₹200 straight into the referring driver's wallet the moment a
  // referred driver (signed up via that driver's share link) completes
  // their first successful trip — checked/flagged via referralCredited so
  // it only ever fires once per referred driver, no matter how many trips
  // they complete after that. Driver-to-driver only: a customer signed up
  // via a driver's link is still tracked as a referral (see referredBy on
  // the customer doc) but never triggers a payout — only called for
  // drivers below. A referredBy mobile that isn't a driver (e.g. stale
  // data) is simply ignored.
  const creditReferralOnce = async (mobile, collectionName) => {
    const entity = await getDocOnce(collectionName, mobile);
    if (!entity?.referredBy || entity.referralCredited) return;
    await patchDoc(collectionName, mobile, { referralCredited: true }).catch((e) => console.error("[referral]", e));
    const referringDriver = drivers.find((d) => d.mobile === entity.referredBy);
    if (!referringDriver) return;
    await patchDoc("drivers", entity.referredBy, {
      wallet: increment(200),
      referralEntries: arrayUnion({ amount: 200, fromMobile: mobile, creditedAt: Date.now() }),
    }).catch((e) => console.error("[referral]", e));
  };
  const completeBooking = (id, extraCharge = 0) => {
    const b = bookings.find((x) => x.id === id);
    if (!b) return;
    if (b.driverName) unfreezeDriverName(b.driverName);
    patchDoc("bookings", id, { status: "Completed", progress: 100, extraCharge, fare: (b.fare || 0) + extraCharge, completedAt: Date.now() }).catch((e) => console.error(e));
    if (b.driverName === driver?.name) setDriver({ ...driver, online: true });
    if (firestoreReady) {
      const bookingDriver = drivers.find((d) => d.name === b.driverName);
      if (bookingDriver?.mobile) creditReferralOnce(bookingDriver.mobile, "drivers");
    }
  };
  const startLoading = (id, adjustMs = 0) => {
    const b = bookings.find((x) => x.id === id);
    if (!b) return;
    const loadingStartedAt = b.loadingStartedAt ? b.loadingStartedAt + adjustMs : Date.now();
    // travelPausedAt/pausedMs/reachedDropAt back the loading/unloading-time
    // geofence pause (see LOADING_GEOFENCE_M) — reset alongside the timer
    // itself whenever it (re)starts.
    patchDoc("bookings", id, { loadingStartedAt, travelPausedAt: null, pausedMs: 0, reachedDropAt: null }).catch((e) => console.error(e));
  };
  const updateDriverKyc = (mobile, status) => patchDoc("drivers", mobile, { kyc: status }).catch((e) => console.error(e));
  const toggleBlacklist = (mobile) => {
    const d = drivers.find((x) => x.mobile === mobile);
    if (!d) return;
    patchDoc("drivers", mobile, { blacklisted: !d.blacklisted, online: d.blacklisted ? d.online : false }).catch((e) => console.error(e));
  };
  const deleteDriver = (mobile) => removeDoc("drivers", mobile).catch((e) => console.error(e));
  const deleteCustomer = (mobile) => removeDoc("customers", mobile).catch((e) => console.error(e));
  const raiseAlert = (role, type, note) => createDoc("alerts", genId("A"), { role, type, note: note || null }).catch((e) => console.error(e));
  const addExpense = ({ id, date, category, amount, note, photoUrl }) =>
    createDoc("expenses", id, { date, category, amount, note: note || "", photoUrl: photoUrl || null });
  const addExpenseCategory = (name) => createDoc("expenseCategories", slugify(name), { key: slugify(name), icon: "📦", hi: name, en: name }).catch((e) => console.error(e));

  // Simulated GPS: only the assigned driver's own device advances progress
  // for their trip, so two devices never race to write the same field.
  const progressTimer = useRef(null);
  useEffect(() => {
    progressTimer.current = setInterval(() => {
      if (!driver) return;
      bookings
        .filter((b) => b.status === "Ongoing" && b.progress < 95 && b.driverName === driver.name)
        .forEach((b) => patchDoc("bookings", b.id, { progress: b.progress + 5 }).catch((e) => console.error(e)));
    }, 1200);
    return () => clearInterval(progressTimer.current);
  }, [bookings, driver]);

  const isDesktop = role === "admin" && adminAuth;

  // Standalone Driver KYC portal (?driverKyc=1&mobile=...) — entirely
  // separate from role-select/login (no auth at all, see
  // firestore.rules), so it takes priority over every other gate below
  // and doesn't touch role/lang-prompt/connectivity state. Only needs
  // vehicleTypes (public read, already loading regardless of role) — it
  // fetches its one driver doc itself, see DriverKycPortal.
  if (driverKycPortal) {
    return <DriverKycPortal lang={lang} vehicleTypes={vehicleTypes} addVehicleType={addVehicleType} />;
  }

  // Shown once, right after a brand-new Customer/Driver signup completes
  // (langPromptPending is set true there — see onComplete/onFirstSignupComplete
  // below). Placed ahead of the offline check since picking a language
  // needs no network.
  if (langPromptPending) {
    return (
      <div className="min-h-screen flex justify-center" style={{ background: "#E5E5E5", fontFamily: bodyFont }}>
        <div className={`w-full ${isDesktop ? "max-w-3xl" : "max-w-sm"} min-h-screen flex flex-col`} style={{ background: C.bg }}>
          <div className="px-5 pt-6 pb-4" style={{ background: C.navy }}>
            <div className="flex items-center gap-2">
              <Logo size={64} />
              <div translate="no" className="text-white font-bold text-lg leading-none truncate">Apna Transport</div>
            </div>
          </div>
          <LanguageSelect onSelect={chooseLang} />
        </div>
      </div>
    );
  }

  // Nothing else renders until connectivity is actually verified (avoids a
  // flash of real content — or of the offline screen — before we know for
  // sure), and offline blocks everything: no cached screen, no role-select,
  // nothing interactive underneath, just this message until reconnected.
  if (!connectivityChecked || !isOnline) {
    return (
      <div className="min-h-screen flex justify-center items-center" style={{ background: "#E5E5E5", fontFamily: bodyFont }}>
        <div className="w-full max-w-sm min-h-screen flex flex-col items-center justify-center px-8 text-center" style={{ background: C.bg }}>
          {connectivityChecked ? (
            <>
              <span className="text-5xl mb-4">📶</span>
              <p className="text-base font-black mb-2" style={{ color: C.ink }}>{lang === "en" ? "You're offline" : lang === "mr" ? "तुम्ही ऑफलाइन आहात" : "आप ऑफलाइन हैं"}</p>
              <p className="text-sm font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "Please turn on your mobile data or Wi-Fi to continue." : lang === "mr" ? "सुरू ठेवण्यासाठी कृपया तुमचा मोबाइल डेटा किंवा वाय-फाय चालू करा." : "जारी रखने के लिए कृपया अपना मोबाइल डेटा या वाई-फाई चालू करें।"}</p>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex justify-center" style={{ background: "#E5E5E5", fontFamily: bodyFont }}>
      <div className={`w-full ${isDesktop ? "max-w-3xl" : "max-w-sm"} min-h-screen flex flex-col`} style={{ background: C.bg }}>
        <div className="px-5 pt-6 pb-4" style={{ background: C.navy }}>
          <div className="flex items-center gap-2 mb-4">
            <Logo size={64} />
            <div className="flex-1 min-w-0">
              <div translate="no" className="text-white font-bold text-lg leading-none truncate">{lang === "en" ? "Apna Transport" : lang === "mr" ? "अपना ट्रान्सपोर्ट" : "अपना ट्रांसपोर्ट"}</div>
              <div className="text-[11px] truncate" style={{ color: "#FFFFFF" }}>{lang === "en" ? "All India On-Demand Transport Bidding" : lang === "mr" ? "ऑल इंडिया ऑन-डिमांड ट्रान्सपोर्ट बिडिंग" : "ऑल इंडिया ऑन-डिमांड ट्रांसपोर्ट बिडिंग"}</div>
            </div>
          </div>
          {role === "admin" && adminAuth && (
            <div className="mt-1.5 text-[10px] text-center" style={{ color: "#FFFFFF" }}>
              {lang === "en" ? "Overview & approvals — Customer/Driver registration is not available here" : lang === "mr" ? "ओव्हरव्ह्यू आणि अप्रूव्हल — इथे कस्टमर/ड्रायव्हर रजिस्ट्रेशन उपलब्ध नाही" : "ओवरव्यू और अप्रूवल — यहां कस्टमर/ड्राइवर रजिस्ट्रेशन उपलब्ध नहीं है"}
            </div>
          )}
        </div>

        {role === null && (
          <RoleSelect lang={lang} onSelect={(r) => { setRole(r); setApp(r); }}
            customerVerified={customerAuth.verified} driverVerified={driverAuth.verified} adminVerified={adminAuth}
            onLogoutRole={logoutRole} adminEntry={adminEntry} />
        )}

        {role === "admin" && !adminAuth && (
          <AdminLogin lang={lang} onVerified={() => { setAdminAuth(true); setApp("admin"); }} onBack={adminEntry ? undefined : goHome} />
        )}

        {role === "customer" && (!customerAuth.verified || !customerChecked || !customer) && (
          <CustomerOnboarding lang={lang} authInstance={customerFirebaseAuth}
            verified={customerAuth.verified} verifiedMobile={customerAuth.mobile} hasProfile={!!customer} checking={customerAuth.verified && !customerChecked}
            onOtpVerified={(mobile) => setCustomerAuth({ verified: true, mobile })}
            onLogout={() => (customerAuth.verified ? logoutRole("customer") : goHome())}
            onComplete={(addr) => {
              // addr.mobile is the number CustomerOnboarding just verified —
              // trust it over customerAuth.mobile, which can still be stale
              // here (see the comment in submitProfile).
              const signedUpMobile = addr.mobile || customerAuth.mobile;
              setCustomer({ ...addr, mobile: signedUpMobile });
              // First-ever creation of this customer's doc — stamp their real
              // signup date so their own 30-day trial can be calculated from it.
              if (firestoreReady && signedUpMobile) replaceDoc("customers", signedUpMobile, { ...addr, mobile: signedUpMobile, createdAt: serverTimestamp() }).catch((e) => console.error(e));
              // Brand-new signup — prompt for a language once, right after.
              setLangPromptPending(true);
            }} />
        )}
        {role === "customer" && customerAuth.verified && customerChecked && customer && (
          <CustomerApp bookings={bookings} createLoad={createLoad} drivers={drivers} vehicleTypes={vehicleTypes}
            cancelBooking={cancelBooking} rateBooking={rateBooking} acceptBid={acceptBid} lang={lang} onChangeLang={chooseLang} onLogout={logout}
            customerProfile={customer} customerMobile={customerAuth.mobile} onUpdateProfile={updateCustomerProfile} raiseAlert={raiseAlert} onOpenTerms={() => setShowTerms(true)}
            adminNotifications={adminNotifications} />
        )}
        {role === "driver" && !driverResubmitting && (!driverAuth.verified || !driver || !driver.vehicleSpec) && (
          <DriverOnboarding lang={lang} authInstance={driverFirebaseAuth}
            verified={driverAuth.verified}
            onOtpVerified={(mobile) => setDriverAuth({ verified: true, mobile })}
            onLogout={() => (driverAuth.verified ? logoutRole("driver") : goHome())}
            driver={driver} setDriver={setDriver} vehicleTypes={vehicleTypes} addVehicleType={addVehicleType}
            onFirstSignupComplete={() => setLangPromptPending(true)} />
        )}
        {role === "driver" && driverAuth.verified && driver && driver.vehicleSpec && driverResubmitting && (
          <div className="flex-1 overflow-y-auto">
            <button onClick={() => logoutRole("driver")} className="flex items-center gap-1 mx-5 mt-4 p-3 rounded-full shadow-sm" style={{ background: C.marigold, color: "#000000", border: `1.5px solid ${C.marigoldDeep}` }}>
              <ChevronLeft size={18} strokeWidth={3} />
            </button>
            <div className="mx-5 mt-3 rounded-lg p-3 flex items-center gap-2 shadow-lg" style={{ background: C.metallicGold }}>
              <ShieldCheck size={15} color={C.marigoldDeep} />
              <span className="text-xs font-semibold" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Completing KYC is required before opening the home page." : lang === "mr" ? "होम पेज उघडण्यापूर्वी KYC पूर्ण करणे आवश्यक आहे." : "होम पेज खोलने से पहले KYC पूरी करना ज़रूरी है।"}</span>
            </div>
            <DriverKyc driver={driver} setDriver={setDriver} vehicleTypes={vehicleTypes} addVehicleType={addVehicleType} lang={lang} />
          </div>
        )}
        {role === "driver" && driverAuth.verified && driver && driver.vehicleSpec && !driverResubmitting && driver.kyc !== "Approved" && (
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center relative">
            <button onClick={() => logoutRole("driver")} className="absolute top-4 left-4 flex items-center gap-1 p-3 rounded-full shadow-sm" style={{ background: C.marigold, color: "#000000", border: `1.5px solid ${C.marigoldDeep}` }}>
              <ChevronLeft size={18} strokeWidth={3} />
            </button>
            {driver.kyc === "Rejected" ? (
              <>
                <XCircle size={40} color={C.safety} className="mb-3" />
                <h2 className="text-base font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "KYC rejected" : lang === "mr" ? "KYC नाकारले" : "KYC अस्वीकृत"}</h2>
                <p className="text-xs mb-4" style={{ color: C.inkSoft }}>{lang === "en" ? "Your documents were rejected by admin. Please review and resubmit." : lang === "mr" ? "तुमची कागदपत्रे अ‍ॅडमिनने नाकारली आहेत. कृपया पुन्हा तपासून सबमिट करा." : "आपके दस्तावेज़ एडमिन द्वारा अस्वीकृत किए गए हैं। कृपया दोबारा जांच कर सबमिट करें।"}</p>
                <button onClick={() => setDriverResubmitting(true)} className="rounded-lg px-6 py-3.5 text-base font-bold text-white" style={{ background: C.marigoldDeep }}>
                  {lang === "en" ? "Resubmit KYC" : lang === "mr" ? "KYC पुन्हा भरा" : "KYC दोबारा भरें"}
                </button>
              </>
            ) : (
              <>
                <Clock3 size={40} color={C.marigoldDeep} className="mb-3" />
                <h2 className="text-base font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "KYC verification pending" : lang === "mr" ? "KYC सत्यापन प्रलंबित आहे" : "KYC सत्यापन लंबित है"}</h2>
                <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Your documents are under review. The dashboard unlocks once admin approves." : lang === "mr" ? "तुमच्या कागदपत्रांचे पुनरावलोकन होत आहे. अ‍ॅडमिन अप्रूव्हलनंतर डॅशबोर्ड उघडेल." : "आपके दस्तावेज़ों की समीक्षा हो रही है। एडमिन अप्रूवल के बाद डैशबोर्ड खुलेगा।"}</p>
              </>
            )}
          </div>
        )}
        {role === "driver" && driverAuth.verified && driver && driver.vehicleSpec && !driverResubmitting && driver.kyc === "Approved" && (
          <DriverApp driver={driver} setDriver={setDriver} bookings={bookings} addBid={addBid} completeBooking={completeBooking} startLoading={startLoading}
            tripLog={tripLog} vehicleTypes={vehicleTypes} addVehicleType={addVehicleType} raiseAlert={raiseAlert}
            commissionPct={commissionPct} minWallet={minWallet} bonusPct={bonusPct} lang={lang} onChangeLang={chooseLang} onLogout={logout}
            withdrawals={withdrawals} requestWithdrawal={requestWithdrawal} rechargeRequests={rechargeRequests} requestRecharge={requestRecharge}
            onOpenTerms={() => setShowTerms(true)} adminNotifications={adminNotifications} />
        )}
        {role === "admin" && adminAuth && (
          <div className="flex-1 overflow-y-auto">
            <AdminPanel drivers={drivers} customers={allCustomers} driver={driver} updateDriverKyc={updateDriverKyc} bookings={bookings} tripLog={tripLog} alerts={alerts} toggleBlacklist={toggleBlacklist} deleteDriver={deleteDriver} deleteCustomer={deleteCustomer}
              commissionPct={commissionPct} setCommissionPct={setCommissionPct} minWallet={minWallet} setMinWallet={setMinWallet}
              bonusPct={bonusPct} setBonusPct={setBonusPct} lang={lang} onLogout={logout}
              withdrawals={withdrawals} approveWithdrawal={approveWithdrawal} rechargeRequests={rechargeRequests} approveRecharge={approveRecharge}
              vehicleTypes={vehicleTypes} addVehicleType={addVehicleType} addManualCustomer={addManualCustomer} addManualDriver={addManualDriver}
              expenses={expenses} expenseCategories={expenseCategories} addExpense={addExpense} addExpenseCategory={addExpenseCategory} callLogs={callLogs} adminNotifications={adminNotifications} />
          </div>
        )}
      </div>
      <TermsModal open={showTerms} onClose={() => setShowTerms(false)} commissionPct={commissionPct} bonusPct={bonusPct} lang={lang} role={role} />
    </div>
  );
}
