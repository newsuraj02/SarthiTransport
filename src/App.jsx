import React, { useState, useEffect, useRef } from "react";
import {
  Truck, MapPin, Package, Wallet, UserCircle2, ShieldCheck, Camera, Clock3,
  Phone, MessageCircle, CheckCircle2, XCircle, Bell, Navigation,
  Users, BarChart3, Settings2, Download, IndianRupee, LayoutDashboard,
  ClipboardList, MapPinned, Siren, Mic, Globe,
} from "lucide-react";

// ---------------- design tokens ----------------
const C = {
  bg: "#F4F1E8",
  paper: "#FFFFFF",
  ink: "#1C2A3A",
  inkSoft: "#5B6B7C",
  marigold: "#E8A020",
  marigoldDeep: "#B87A12",
  safety: "#E85D2F",
  success: "#3F7D4F",
  line: "#D9D0BC",
  navy: "#1C2A3A",
  pimpri: "#2B5C8A",
  chinchwad: "#3F7D4F",
};
const bodyFont = "'Noto Sans','Segoe UI',system-ui,sans-serif";
const monoFont = "'JetBrains Mono','Courier New',monospace";

const DEFAULT_VEHICLES = [
  { key: "chhota", label: "छोटा हाथी", rate: 20, capacity: "750 किग्रा", capacityKg: 750, l: 7, w: 4.5, h: 4.5 },
  { key: "tataAce", label: "टाटा एस", rate: 25, capacity: "850 किग्रा", capacityKg: 850, l: 7.5, w: 4.5, h: 5 },
  { key: "pickup", label: "पिकअप", rate: 30, capacity: "1.5 टन", capacityKg: 1500, l: 8.5, w: 5, h: 5.5 },
  { key: "truck", label: "बड़ा ट्रक", rate: 50, capacity: "9+ टन", capacityKg: 9000, l: 19, w: 6.5, h: 7 },
];
const ADD_VEHICLE_TYPE = "__add_new_vehicle__";
function slugify(str) {
  return "v" + str.replace(/\s+/g, "").slice(0, 10) + Math.floor(Math.random() * 900 + 100);
}
const MATERIALS = ["लोहा", "प्लास्टिक", "बॉक्स / कार्टन", "सीमेंट / बालू", "अन्य"];
const LIGHT_BULKY_MATERIALS = ["प्लास्टिक", "बॉक्स / कार्टन"];
const BIG_VEHICLE_KEYS = ["pickup", "truck"];
const MATERIAL_LABELS_EN = { "लोहा": "Iron", "प्लास्टिक": "Plastic", "बॉक्स / कार्टन": "Box / Carton", "सीमेंट / बालू": "Cement / Sand", "अन्य": "Other" };
const materialLabel = (m, lang, customMap = {}) => {
  if (customMap[m]) return lang === "en" ? (customMap[m].en || customMap[m].hi) : (customMap[m].hi || customMap[m].en);
  return (lang === "en" && MATERIAL_LABELS_EN[m]) ? MATERIAL_LABELS_EN[m] : m;
};
const ADD_MATERIAL = "__add_new__";

const CITY_COLORS = ["#2B5C8A", "#3F7D4F", "#B87A12", "#E85D2F", "#7A5CB8", "#1C7A7A"];

const EN_LABELS = {
  book: "Book Now", rides: "My Rides", home: "Home", wallet: "Wallet", history: "History",
  kyc: "KYC", sos: "SOS", fleet: "Live Dashboard", drivers: "Driver List", settings: "Settings",
  finance: "Reports", notify: "Notify", alerts: "Alerts",
};

function genId(p = "TS") { return p + "-" + Math.floor(10000 + Math.random() * 89999); }
function hashPos(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 997;
  return { x: 15 + (h % 70), y: 15 + ((h * 7) % 70) };
}
function fmt(n) { return "₹" + Math.round(n).toLocaleString("en-IN"); }
function stars(n) { return "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n)); }

const AREAS = ["पिंपरी", "चिंचवड", "निगड़ी", "आकुर्डी", "भोसरी", "वाकड़", "तळवडे", "रावेत", "MG रोड", "MR-10", "काळेवाडी", "पिंपळे सौदागर", "थेरगाव", "चिखली", "मोशी", "भोसरी MIDC"];
function findArea(text) {
  if (!text.trim()) return null;
  return AREAS.find((a) => text.includes(a)) || null;
}
function suggestAreas(text) {
  if (!text.trim()) return [];
  return AREAS.filter((a) => a.toLowerCase().includes(text.trim().toLowerCase())).slice(0, 4);
}
function estimateDistance(pickup, drop) {
  if (!pickup.trim() || !drop.trim()) return null;
  const s = pickup.trim() + "|" + drop.trim();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 977;
  return 2 + (h % 17);
}

// ---------------- shared: mock map ----------------
function MockMap({ pickup, drop, progress, zoneColor, height = 150 }) {
  const p1 = hashPos(pickup || "pickup");
  const p2 = hashPos((drop || "drop") + "x");
  const tx = p1.x + (p2.x - p1.x) * (progress ?? 0) / 100;
  const ty = p1.y + (p2.y - p1.y) * (progress ?? 0) / 100;
  return (
    <div className="relative rounded-lg overflow-hidden" style={{ height, background: "#E7E2D2", border: `1px solid ${C.line}` }}>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        {Array.from({ length: 6 }).map((_, i) => (
          <line key={"h" + i} x1="0" y1={i * 18} x2="100" y2={i * 18} stroke="#D9D0BC" strokeWidth="0.4" />
        ))}
        {Array.from({ length: 6 }).map((_, i) => (
          <line key={"v" + i} x1={i * 18} y1="0" x2={i * 18} y2="100" stroke="#D9D0BC" strokeWidth="0.4" />
        ))}
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={zoneColor || C.marigoldDeep} strokeWidth="1" strokeDasharray="2,2" />
        <circle cx={p1.x} cy={p1.y} r="2.2" fill={C.marigoldDeep} />
        <circle cx={p2.x} cy={p2.y} r="2.2" fill={C.safety} />
        {progress !== undefined && (
          <circle cx={tx} cy={ty} r="2.6" fill={C.navy} stroke="#fff" strokeWidth="0.6" />
        )}
      </svg>
      <div className="absolute bottom-1.5 left-2 text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: C.paper, color: C.ink }}>
        📍 पिकअप
      </div>
      <div className="absolute top-1.5 right-2 text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: C.paper, color: C.ink }}>
        🏁 ड्रॉप
      </div>
    </div>
  );
}

function Pill({ active, onClick, children }) {
  return (
    <button onClick={onClick} className="flex-1 text-sm font-bold py-2.5 rounded-full transition-colors"
      style={{ background: active ? C.marigold : "transparent", color: active ? C.navy : "#B9C6D4" }}>
      {children}
    </button>
  );
}

function BottomNav({ tabs, tab, setTab, lang = "hi" }) {
  return (
    <div className="flex border-t" style={{ borderColor: C.line, background: C.paper }}>
      {tabs.map(([key, label, Icon]) => (
        <button key={key} onClick={() => setTab(key)} className="flex-1 flex flex-col items-center gap-1 py-2.5">
          <Icon size={18} color={tab === key ? C.marigoldDeep : C.inkSoft} />
          <span className="text-[10px] font-semibold" style={{ color: tab === key ? C.marigoldDeep : C.inkSoft }}>{lang === "en" ? (EN_LABELS[key] || label) : label}</span>
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
      setAddress(data?.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`);
    } catch {
      setAddress(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(28,42,58,0.7)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-2xl p-4" style={{ background: C.bg }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold" style={{ color: C.ink }}>{lang === "en" ? "Tap to mark location" : "जगह चुनने के लिए टैप करें"}</span>
          <button onClick={onClose} className="text-xs font-bold px-2 py-1" style={{ color: C.inkSoft }}>✕</button>
        </div>

        <div className="relative rounded-lg overflow-hidden mb-3" style={{ height: H, background: "#E7E2D2", cursor: "crosshair" }} onClick={handleTap}>
          {!imgError ? (
            <img src={mapUrl} alt="map" width={W} height={H} className="w-full h-full object-cover select-none" draggable={false} onError={() => setImgError(true)} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-center px-6">
              <span className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Map couldn't load — check internet connection" : "मैप लोड नहीं हुआ — इंटरनेट कनेक्शन देखें"}</span>
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
            <span className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Finding address..." : "पता ढूंढा जा रहा है..."}</span>
          ) : pin ? (
            <span className="text-xs" style={{ color: C.ink }}>{address}</span>
          ) : (
            <span className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Tap anywhere on the map above to drop a pin" : "ऊपर मैप पर कहीं भी टैप करके पिन लगाएं"}</span>
          )}
        </div>

        <button onClick={() => pin && onConfirm(address, pin.lat, pin.lon)} disabled={!pin || loading}
          className="w-full rounded-lg py-3 font-bold text-sm"
          style={{ background: pin && !loading ? C.marigoldDeep : C.line, color: pin && !loading ? "#fff" : "#8A8375" }}>
          {lang === "en" ? "Use this location" : "यह जगह इस्तेमाल करें"}
        </button>
      </div>
    </div>
  );
}

function MicButton({ onResult, lang = "hi-IN" }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  const start = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("यह डिवाइस/ब्राउज़र वॉइस इनपुट सपोर्ट नहीं करता।");
      return;
    }
    const rec = new SR();
    rec.lang = lang;
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

  return (
    <button type="button" onClick={listening ? stop : start}
      className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
      style={{ background: listening ? C.safety : "#DCE9F5" }}>
      <Mic size={14} color={listening ? "#fff" : "#2B5C8A"} />
    </button>
  );
}

function StarRating({ value, onRate }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} onClick={() => onRate(n)} className="text-lg leading-none" style={{ color: n <= (value || 0) ? C.marigold : C.line }}>★</button>
      ))}
    </div>
  );
}

function SosScreen({ role = "customer", raiseAlert, lang }) {
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
      <div className="rounded-xl p-5 text-center mb-5" style={{ background: "#FCEAE3" }}>
        <Siren size={26} color={C.safety} className="mx-auto mb-2" />
        <h2 className="text-base font-bold" style={{ color: C.safety }}>SOS / {lang === "en" ? "Help" : "मदद"}</h2>
        <p className="text-xs mt-1" style={{ color: C.ink }}>{lang === "en" ? "For any problem or booking help, click the button below." : "किसी भी समस्या या बुकिंग सहायता के लिए नीचे दिए गए बटन पर क्लिक करें।"}</p>
      </div>
      <div className="space-y-3">
        <a href="tel:100" onClick={() => raiseAlert?.(role, "पुलिस सहायता")}
          className="w-full rounded-lg py-3 font-bold text-sm flex items-center justify-center gap-2 text-white" style={{ background: "#1C2A3A" }}>
          <Siren size={16} /> {lang === "en" ? "Police Help (100)" : "पुलिस सहायता (100)"}
        </a>
        <a href="tel:+911234567890" onClick={() => raiseAlert?.(role, "इमरजेंसी कॉल")}
          className="w-full rounded-lg py-3 font-bold text-sm flex items-center justify-center gap-2 text-white" style={{ background: C.safety }}>
          <Phone size={16} /> {lang === "en" ? "Call Admin" : "एडमिन को कॉल करें"}
        </a>
        <a href="https://wa.me/911234567890" target="_blank" rel="noreferrer" onClick={() => raiseAlert?.(role, "व्हाट्सएप सपोर्ट")}
          className="w-full rounded-lg py-3 font-bold text-sm flex items-center justify-center gap-2 text-white" style={{ background: C.success }}>
          <MessageCircle size={16} /> {lang === "en" ? "WhatsApp Support" : "व्हाट्सएप सपोर्ट"}
        </a>
      </div>
      {role === "driver" && (
        <div className="rounded-xl p-4 mt-5" style={{ border: `1px solid ${C.line}`, background: C.paper }}>
          <div className="text-xs font-bold mb-2" style={{ color: C.ink }}>{lang === "en" ? "File a Complaint" : "शिकायत दर्ज करें"}</div>
          <p className="text-[11px] mb-2" style={{ color: C.inkSoft }}>{lang === "en" ? "Send admin details of any issue related to the customer or the goods." : "ग्राहक या सामान से जुड़ी किसी समस्या की जानकारी एडमिन को भेजें।"}</p>
          <textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} rows={3}
            placeholder={lang === "en" ? "e.g. Customer gave wrong address, wrong weight told..." : "जैसे: ग्राहक ने गलत पता दिया, सामान का वजन गलत बताया..."}
            className="w-full rounded-lg px-3 py-2 text-xs outline-none mb-2" style={{ border: `1px solid ${C.line}`, color: C.ink }} />
          {sent && <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold" style={{ color: C.success }}><CheckCircle2 size={13} /> {lang === "en" ? "Complaint sent to admin" : "शिकायत एडमिन को भेज दी गई"}</div>}
          <button onClick={submitComplaint} disabled={!complaint.trim()} className="w-full rounded-lg py-2.5 font-bold text-sm"
            style={{ background: complaint.trim() ? C.navy : C.line, color: complaint.trim() ? "#fff" : "#8A8375" }}>{lang === "en" ? "Send Complaint" : "शिकायत भेजें"}</button>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// CUSTOMER LOGIN — मोबाइल + OTP
// =====================================================================
// =====================================================================
// ROLE SELECTION — shown once so each user only sees their own platform
// =====================================================================
function RoleSelect({ onSelect, lang }) {
  return (
    <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-8 py-10">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: C.marigold }}>
        <Truck size={30} color={C.navy} />
      </div>
      <div className="text-xl font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "Saathi Transport" : "सार्थी ट्रांसपोर्ट"}</div>
      <p className="text-xs text-center mb-8" style={{ color: C.inkSoft }}>
        {lang === "en" ? "Choose which app you want to open" : "आप कौन सा ऐप खोलना चाहते हैं?"}
      </p>

      <div className="w-full space-y-3">
        <button onClick={() => onSelect("customer")} className="w-full rounded-xl p-4 flex items-center gap-3 text-left" style={{ background: C.marigold }}>
          <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: C.navy }}>
            <Package size={20} color="#fff" />
          </div>
          <div>
            <div className="text-sm font-bold" style={{ color: C.navy }}>{lang === "en" ? "Customer" : "कस्टमर"}</div>
            <div className="text-[11px]" style={{ color: "#5A4008" }}>{lang === "en" ? "Post a load & book a truck" : "लोड पोस्ट करें और ट्रक बुक करें"}</div>
          </div>
        </button>

        <button onClick={() => onSelect("driver")} className="w-full rounded-xl p-4 flex items-center gap-3 text-left" style={{ background: C.navy }}>
          <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: C.marigold }}>
            <Truck size={20} color={C.navy} />
          </div>
          <div>
            <div className="text-sm font-bold text-white">{lang === "en" ? "Driver" : "ड्राइवर"}</div>
            <div className="text-[11px]" style={{ color: "#9FB0C2" }}>{lang === "en" ? "Bid on loads & earn" : "लोड पर बोली लगाएं और कमाएं"}</div>
          </div>
        </button>
      </div>

      <button onClick={() => onSelect("admin")} className="mt-8 text-[11px] font-semibold" style={{ color: C.inkSoft }}>
        {lang === "en" ? "Admin Login" : "एडमिन लॉगिन"}
      </button>
    </div>
  );
}

// =====================================================================
// ADMIN LOGIN — password protected, separate from customer/driver
// =====================================================================
function AdminLogin({ onVerified, lang }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  const inputCls = "w-full rounded-lg px-3 py-3 text-sm outline-none";
  const inputStyle = { background: C.paper, border: `1px solid ${C.line}`, color: C.ink };

  const submit = () => {
    if (email.trim() && password === "admin123") {
      onVerified();
    } else {
      setError(true);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-8 py-10">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: C.navy }}>
        <LayoutDashboard size={26} color={C.marigold} />
      </div>
      <h2 className="text-lg font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "Admin Login" : "एडमिन लॉगिन"}</h2>
      <p className="text-xs text-center mb-6" style={{ color: C.inkSoft }}>{lang === "en" ? "Authorized personnel only" : "सिर्फ अधिकृत व्यक्ति ही आगे बढ़ें"}</p>

      <div className="w-full space-y-3">
        <input className={inputCls} style={inputStyle} placeholder={lang === "en" ? "Admin email / ID" : "एडमिन ईमेल / आईडी"} value={email}
          onChange={(e) => { setEmail(e.target.value); setError(false); }} />
        <input type="password" className={inputCls} style={inputStyle} placeholder={lang === "en" ? "Password" : "पासवर्ड"} value={password}
          onChange={(e) => { setPassword(e.target.value); setError(false); }} />
        <div className="text-[11px] text-center" style={{ color: C.inkSoft }}>{lang === "en" ? "Demo password: admin123" : "डेमो पासवर्ड: admin123"}</div>
        {error && (
          <div className="text-[11px] text-center font-semibold" style={{ color: C.safety }}>
            {lang === "en" ? "Incorrect email or password" : "ईमेल या पासवर्ड गलत है"}
          </div>
        )}
        <button onClick={submit} disabled={!email.trim() || !password.trim()} className="w-full rounded-lg py-3 font-bold text-sm"
          style={{ background: email.trim() && password.trim() ? C.marigold : C.line, color: email.trim() && password.trim() ? C.navy : "#8A8375" }}>
          {lang === "en" ? "Login" : "लॉगिन करें"}
        </button>
      </div>
    </div>
  );
}

function CustomerLogin({ onVerified }) {
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState("mobile");
  const inputCls = "w-full rounded-lg px-3 py-3 text-sm outline-none text-center";
  const inputStyle = { background: C.paper, border: `1px solid ${C.line}`, color: C.ink, fontFamily: monoFont, letterSpacing: 2 };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-8 py-10">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: C.marigold }}>
        <Truck size={26} color={C.navy} />
      </div>
      <h2 className="text-lg font-bold mb-1" style={{ color: C.ink }}>सार्थी ट्रांसपोर्ट में लॉगिन करें</h2>
      <p className="text-xs text-center mb-6" style={{ color: C.inkSoft }}>
        {stage === "mobile" ? "अपना मोबाइल नंबर डालें" : `${mobile} पर भेजा गया OTP डालें`}
      </p>

      {stage === "mobile" ? (
        <div className="w-full space-y-3">
          <div className="flex items-center gap-2 rounded-lg px-3" style={{ border: `1px solid ${C.line}`, background: C.paper }}>
            <Phone size={16} color={C.inkSoft} />
            <input className="flex-1 py-3 text-sm outline-none" style={{ color: C.ink, fontFamily: monoFont }} placeholder="10 अंकों का मोबाइल नंबर"
              value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} />
          </div>
          <button onClick={() => mobile.length === 10 && setStage("otp")} disabled={mobile.length !== 10}
            className="w-full rounded-lg py-3 font-bold text-sm" style={{ background: mobile.length === 10 ? C.marigold : C.line, color: mobile.length === 10 ? C.navy : "#8A8375" }}>
            OTP भेजें
          </button>
        </div>
      ) : (
        <div className="w-full space-y-3">
          <div className="flex items-center gap-2 rounded-lg px-3" style={{ border: `1px solid ${C.line}`, background: C.paper }}>
            <ShieldCheck size={16} color={C.inkSoft} />
            <input className={inputCls} style={{ ...inputStyle, border: "none" }} placeholder="• • • •" value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))} />
          </div>
          <div className="text-[11px] text-center" style={{ color: C.inkSoft }}>डेमो OTP: 1234</div>
          <button onClick={() => otp.length === 4 && onVerified(mobile)} disabled={otp.length !== 4}
            className="w-full rounded-lg py-3 font-bold text-sm" style={{ background: otp.length === 4 ? C.marigold : C.line, color: otp.length === 4 ? C.navy : "#8A8375" }}>
            वेरीफाई करें
          </button>
          <button onClick={() => setStage("mobile")} className="w-full text-center text-[11px] font-semibold" style={{ color: C.inkSoft }}>नंबर बदलें</button>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// CUSTOMER ADDRESS VERIFICATION (mandatory after login)
// =====================================================================
function CustomerAddressVerify({ onVerified }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);

  const canVerify = name.trim().length >= 3 && address.trim().split(/\s+/).length >= 2 && area.trim() && city.trim() && pincode.length === 6;

  const verify = () => {
    if (!canVerify) return;
    setVerifying(true);
    setResult(null);
    setTimeout(() => {
      setVerifying(false);
      setResult("ok");
    }, 1000);
  };

  const inputCls = "w-full rounded-lg px-3 py-2.5 text-sm outline-none";
  const inputStyle = { background: C.paper, border: `1px solid ${C.line}`, color: C.ink };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: C.marigold }}>
        <MapPin size={22} color={C.navy} />
      </div>
      <h2 className="text-lg font-bold mb-1" style={{ color: C.ink }}>अपना पता वेरीफाई करें</h2>
      <p className="text-xs mb-5" style={{ color: C.inkSoft }}>आगे बढ़ने से पहले अपना पूरा पता भरें और वेरीफाई करें।</p>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>पूरा नाम</label>
          <input className={inputCls} style={inputStyle} placeholder="जैसे: रमेश पटेल" value={name}
            onChange={(e) => { setName(e.target.value); setResult(null); }} />
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>पूरा पता (मकान/दुकान नं., गली)</label>
          <input className={inputCls} style={inputStyle} placeholder="जैसे: दुकान नं. 12, MG रोड" value={address}
            onChange={(e) => { setAddress(e.target.value); setResult(null); }} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>एरिया</label>
            <input className={inputCls} style={inputStyle} placeholder="जैसे: पिंपरी" value={area}
              onChange={(e) => { setArea(e.target.value); setResult(null); }} />
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>शहर</label>
            <input className={inputCls} style={inputStyle} placeholder="जैसे: पुणे" value={city}
              onChange={(e) => { setCity(e.target.value); setResult(null); }} />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>पिनकोड</label>
          <input className={inputCls} style={{ ...inputStyle, fontFamily: monoFont }} placeholder="6 अंकों का पिनकोड" value={pincode}
            onChange={(e) => { setPincode(e.target.value.replace(/\D/g, "").slice(0, 6)); setResult(null); }} />
        </div>

        {result === "ok" && (
          <div className="rounded-lg p-3 flex items-center gap-2" style={{ background: "#DFEEE2" }}>
            <CheckCircle2 size={16} color={C.success} />
            <span className="text-xs font-semibold" style={{ color: C.success }}>पता सत्यापित — अब आप बुकिंग कर सकते हैं।</span>
          </div>
        )}

        {result !== "ok" ? (
          <button onClick={verify} disabled={!canVerify || verifying} className="w-full rounded-lg py-3 font-bold text-sm"
            style={{ background: canVerify ? C.marigold : C.line, color: canVerify ? C.navy : "#8A8375" }}>
            {verifying ? "जाँच रहे हैं..." : "पता वेरीफाई करें"}
          </button>
        ) : (
          <button onClick={() => onVerified({ name, address, area, city, pincode })} className="w-full rounded-lg py-3 font-bold text-sm text-white" style={{ background: C.success }}>
            आगे बढ़ें
          </button>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// CUSTOMER APP
// =====================================================================
function CustomerBooking({ createLoad, driverVehicle, vehicleTypes, lastBooking, lang, customMaterials, addCustomMaterial }) {
  const VEHICLES = vehicleTypes;
  const [bookingMode, setBookingMode] = useState(null); // null | 'now' | 'advance'
  const [advanceDate, setAdvanceDate] = useState("");
  const [advanceTime, setAdvanceTime] = useState("");
  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [vehicle, setVehicle] = useState(VEHICLES[0]?.key || "chhota");
  const [showAllVehicles, setShowAllVehicles] = useState(true);
  const [material, setMaterial] = useState(MATERIALS[0]);
  const [materialsList, setMaterialsList] = useState(MATERIALS);
  const [newMaterial, setNewMaterial] = useState("");
  const [newMaterialEn, setNewMaterialEn] = useState("");
  const [addingMaterial, setAddingMaterial] = useState(false);
  const [weight, setWeight] = useState("");
  const distance = estimateDistance(pickup, drop);
  const [posted, setPosted] = useState(false);
  const [mapField, setMapField] = useState(null); // 'pickup' | 'drop' | null

  const canPost = pickup.trim() && drop.trim() && weight.trim() && (bookingMode === "now" || (advanceDate && advanceTime));

  useEffect(() => {
    const w = Number(weight);
    if (!weight || !w) return;
    const isLightBulky = LIGHT_BULKY_MATERIALS.includes(material);
    const candidates = isLightBulky ? VEHICLES.filter((v) => BIG_VEHICLE_KEYS.includes(v.key)) : VEHICLES;
    const fit = candidates.filter((v) => v.capacityKg >= w).sort((a, b) => a.capacityKg - b.capacityKg)[0]
      || (isLightBulky ? VEHICLES.filter((v) => BIG_VEHICLE_KEYS.includes(v.key)).sort((a, b) => a.capacityKg - b.capacityKg)[0] : null);
    if (fit) { setVehicle(fit.key); setShowAllVehicles(false); }
  }, [weight, material]);

  const post = () => {
    if (!canPost) return;
    createLoad({ pickup, drop, vehicle, material, weight, distance, scheduledFor: bookingMode === "advance" ? `${advanceDate} ${advanceTime}` : null });
    setPosted(true);
    setTimeout(() => setPosted(false), 3000);
    setPickup(""); setDrop(""); setWeight(""); setBookingMode(null); setAdvanceDate(""); setAdvanceTime("");
  };

  const inputCls = "w-full rounded-lg px-3 py-2.5 text-sm outline-none";
  const inputStyle = { background: C.paper, border: `1px solid ${C.line}`, color: C.ink };

  if (!bookingMode) {
    return (
      <div className="px-5 py-8 flex flex-col justify-center" style={{ minHeight: 420 }}>
        <p className="text-xs text-center mb-5" style={{ color: C.inkSoft }}>{lang === "en" ? "What do you need?" : "आपको क्या चाहिए?"}</p>
        <button onClick={() => setBookingMode("now")} className="w-full rounded-2xl p-5 mb-4 text-left flex items-center gap-3" style={{ background: C.marigold }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: C.navy }}>
            <Truck size={22} color="#fff" />
          </div>
          <div>
            <div className="text-base font-bold" style={{ color: C.navy }}>⚡ {lang === "en" ? "Need a vehicle now" : "तुरंत गाड़ी चाहिए"}</div>
            <div className="text-[11px]" style={{ color: "#5A4008" }}>{lang === "en" ? "Post now and get quotes right away" : "अभी पोस्ट करें, तुरंत कोटेशन पाएं"}</div>
          </div>
        </button>
        <button onClick={() => setBookingMode("advance")} className="w-full rounded-2xl p-5 text-left flex items-center gap-3" style={{ background: C.navy }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: C.marigold }}>
            <Clock3 size={22} color={C.navy} />
          </div>
          <div>
            <div className="text-base font-bold text-white">📅 {lang === "en" ? "Book vehicle in advance" : "एडवांस गाड़ी बुक करें"}</div>
            <div className="text-[11px]" style={{ color: "#9FB0C2" }}>{lang === "en" ? "Choose a future date and time" : "आगे की तारीख और समय चुनें"}</div>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="px-5 py-5">
      <button onClick={() => setBookingMode(null)} className="flex items-center gap-1 mb-3 text-xs font-semibold" style={{ color: C.marigoldDeep }}>← {lang === "en" ? "Back" : "वापस"}</button>
      <div className="space-y-3">
        {bookingMode === "advance" && (
          <div className="rounded-lg p-3" style={{ background: "#DCE9F5" }}>
            <div className="text-[11px] font-bold mb-2" style={{ color: "#2B5C8A" }}>📅 {lang === "en" ? "When do you need the vehicle?" : "गाड़ी कब चाहिए?"}</div>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={advanceDate} onChange={(e) => setAdvanceDate(e.target.value)} className={inputCls} style={inputStyle} />
              <input type="time" value={advanceTime} onChange={(e) => setAdvanceTime(e.target.value)} className={inputCls} style={inputStyle} />
            </div>
          </div>
        )}
        {lastBooking && !pickup && !drop && (
          <button onClick={() => { setPickup(lastBooking.pickup); setDrop(lastBooking.drop); setMaterial(lastBooking.material); }}
            className="w-full flex items-center gap-2.5 rounded-lg p-2.5 text-left" style={{ background: "#DFEEE2" }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: C.success }}>
              <Package size={15} color="#fff" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold" style={{ color: C.success }}>{lang === "en" ? "Repeat last trip" : "पिछली ट्रिप दोहराएं"}</div>
              <div className="text-[10px] truncate" style={{ color: C.inkSoft }}>{lastBooking.pickup} → {lastBooking.drop}</div>
            </div>
            <span className="text-[10px] font-bold shrink-0" style={{ color: C.success }}>{lang === "en" ? "Tap →" : "टैप करें →"}</span>
          </button>
        )}
        <div className="text-[11px] font-bold" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Step 1 — Pickup & Drop" : "स्टेप 1 — पिकअप और ड्रॉप"}</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Pickup" : "पिकअप"}</label>
            <div className="flex items-center gap-1.5">
              <input className={inputCls} style={inputStyle} placeholder={lang === "en" ? "Pickup address" : "पिकअप पता"} value={pickup} onChange={(e) => setPickup(e.target.value)} />
              <MicButton onResult={(text) => setPickup((p) => (p ? p + " " : "") + text)} />
              <button type="button" onClick={() => setMapField("pickup")} className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#DCE9F5" }}>
                <MapPin size={14} color="#2B5C8A" />
              </button>
            </div>
            {findArea(pickup) ? (
              <div className="text-[10px] mt-1 font-semibold" style={{ color: "#2B5C8A" }}>📍 {lang === "en" ? "Area" : "क्षेत्र"}: {findArea(pickup)}</div>
            ) : suggestAreas(pickup).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {suggestAreas(pickup).map((a) => (
                  <button key={a} onClick={() => setPickup(pickup.trim() + (pickup.trim() ? ", " : "") + a)}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#DCE9F5", color: "#2B5C8A" }}>{a}</button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Drop" : "ड्रॉप"}</label>
            <div className="flex items-center gap-1.5">
              <input className={inputCls} style={inputStyle} placeholder={lang === "en" ? "Drop address" : "ड्रॉप पता"} value={drop} onChange={(e) => setDrop(e.target.value)} />
              <MicButton onResult={(text) => setDrop((d) => (d ? d + " " : "") + text)} />
              <button type="button" onClick={() => setMapField("drop")} className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#DCE9F5" }}>
                <MapPin size={14} color="#2B5C8A" />
              </button>
            </div>
            {findArea(drop) ? (
              <div className="text-[10px] mt-1 font-semibold" style={{ color: "#2B5C8A" }}>📍 {lang === "en" ? "Area" : "क्षेत्र"}: {findArea(drop)}</div>
            ) : suggestAreas(drop).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {suggestAreas(drop).map((a) => (
                  <button key={a} onClick={() => setDrop(drop.trim() + (drop.trim() ? ", " : "") + a)}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#DCE9F5", color: "#2B5C8A" }}>{a}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {distance !== null && (
          <div className="rounded-lg p-2.5 flex items-center gap-2" style={{ background: "#DCE9F5" }}>
            <Navigation size={14} color="#2B5C8A" />
            <span className="text-xs font-semibold" style={{ color: "#2B5C8A" }}>{lang === "en" ? "Estimated distance" : "अनुमानित दूरी"}: {distance} {lang === "en" ? "km" : "किमी"}</span>
            <span className="text-[10px]" style={{ color: C.inkSoft }}>— {lang === "en" ? "this helps both customer and driver decide a fair price" : "इससे कस्टमर और ड्राइवर दोनों को सही बोली तय करने में आसानी होगी"}</span>
          </div>
        )}

        <div className="text-[11px] font-bold pt-1" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Step 2 — Load Details" : "स्टेप 2 — सामान की जानकारी"}</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Material Type" : "मटेरियल टाइप"}</label>
            <select className={inputCls} style={inputStyle} value={material}
              onChange={(e) => { if (e.target.value === ADD_MATERIAL) setAddingMaterial(true); else { setMaterial(e.target.value); setAddingMaterial(false); } }}>
              {materialsList.map((m) => <option key={m} value={m}>{materialLabel(m, lang, customMaterials)}</option>)}
              <option value={ADD_MATERIAL}>+ {lang === "en" ? "Add new material" : "नया मटेरियल जोड़ें"}</option>
            </select>
            {addingMaterial && (
              <div className="rounded-lg p-2.5 mt-2" style={{ border: `1px solid ${C.line}`, background: C.paper }}>
                <div className="text-[10px] font-semibold mb-1" style={{ color: C.inkSoft }}>{lang === "en" ? "Name (Hindi)" : "नाम (हिंदी में)"}</div>
                <input className={inputCls} style={{ ...inputStyle, marginBottom: 6 }} placeholder={lang === "en" ? "e.g. टाइल्स" : "जैसे: टाइल्स"} value={newMaterial} onChange={(e) => setNewMaterial(e.target.value)} />
                <div className="text-[10px] font-semibold mb-1" style={{ color: C.inkSoft }}>{lang === "en" ? "Name (English) — optional" : "नाम (English में) — वैकल्पिक"}</div>
                <div className="flex items-center gap-2">
                  <input className={inputCls} style={inputStyle} placeholder={lang === "en" ? "e.g. Tiles" : "e.g. Tiles"} value={newMaterialEn} onChange={(e) => setNewMaterialEn(e.target.value)} />
                  <button onClick={() => {
                    const nameHi = newMaterial.trim();
                    const nameEn = newMaterialEn.trim();
                    if (!nameHi) return;
                    setMaterialsList((prev) => prev.includes(nameHi) ? prev : [...prev, nameHi]);
                    addCustomMaterial(nameHi, { hi: nameHi, en: nameEn || nameHi });
                    setMaterial(nameHi); setNewMaterial(""); setNewMaterialEn(""); setAddingMaterial(false);
                  }} className="shrink-0 rounded-lg px-3 py-2.5 text-xs font-bold text-white" style={{ background: "#2B5C8A" }}>{lang === "en" ? "Add" : "जोड़ें"}</button>
                </div>
                <div className="text-[10px] mt-1.5" style={{ color: C.inkSoft }}>{lang === "en" ? "Leave English blank to use the same name in both languages." : "अंग्रेज़ी खाली छोड़ने पर दोनों भाषाओं में एक ही नाम दिखेगा।"}</div>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Enter Weight (kg)" : "वजन डालें (किलोग्राम)"}</label>
            <input className={inputCls} style={inputStyle} placeholder={lang === "en" ? "e.g. 300" : "जैसे: 300"} value={weight} onChange={(e) => setWeight(e.target.value.replace(/\D/g, ""))} />
          </div>
        </div>

        {weight && (() => {
          const v = VEHICLES.find((x) => x.key === vehicle);
          const isLightBulky = LIGHT_BULKY_MATERIALS.includes(material);
          return v ? (
            <div className="rounded-lg p-2.5" style={{ background: isLightBulky ? "#FBEBD2" : "#DCE9F5" }}>
              <div className="flex items-center gap-2">
                <Truck size={14} color={isLightBulky ? C.marigoldDeep : "#2B5C8A"} />
                <span className="text-[11px]" style={{ color: isLightBulky ? C.marigoldDeep : "#2B5C8A" }}>{lang === "en" ? "Vehicle decided" : "गाड़ी तय"}: <b>{v.label}</b></span>
              </div>
              {isLightBulky && (
                <div className="text-[11px] mt-1.5" style={{ color: C.marigoldDeep }}>
                  {lang === "en" ? "This load is light but bulky — a bigger vehicle is suggested for it." : "यह माल हल्का और बड़ा है, इसके लिए बड़ी गाड़ी का सुझाव है।"}
                </div>
              )}
            </div>
          ) : null;
        })()}

        <div className="rounded-lg p-3 flex items-center gap-2" style={{ background: "#FBEBD2" }}>
          <IndianRupee size={16} color={C.marigoldDeep} />
          <span className="text-[11px]" style={{ color: C.marigoldDeep }}>{lang === "en" ? "There's no fixed fare here — after posting, driver quotes will show up in \"My Rides\"." : "यहाँ कोई फिक्स भाड़ा नहीं है — पोस्ट करने के बाद ड्राइवरों की बोलियां \"मेरी राइड्स\" में दिखेंगी।"}</span>
        </div>

        {posted && (
          <div className="rounded-lg p-3 flex items-center gap-2" style={{ background: "#DFEEE2" }}>
            <CheckCircle2 size={16} color={C.success} />
            <span className="text-xs font-semibold" style={{ color: C.success }}>{lang === "en" ? "Load posted — nearby drivers can see it now." : "लोड पोस्ट हो गया — पास के ड्राइवरों को दिख रहा है।"}</span>
          </div>
        )}

        <button onClick={post} disabled={!canPost} className="w-full rounded-lg py-3 font-bold text-sm flex items-center justify-center gap-2"
          style={{ background: posted ? C.success : canPost ? C.marigold : C.line, color: posted ? "#fff" : canPost ? C.navy : "#8A8375" }}>
          {posted ? <><CheckCircle2 size={16} /> {lang === "en" ? "Load Posted" : "लोड पोस्ट हो गया"}</> : (lang === "en" ? "Book Now" : "बुक करें")}
        </button>
      </div>

      {mapField && (
        <MapPicker
          lang={lang}
          onClose={() => setMapField(null)}
          onConfirm={(address) => {
            if (mapField === "pickup") setPickup(address); else setDrop(address);
            setMapField(null);
          }}
        />
      )}
    </div>
  );
}

function CustomerRides({ bookings, vehicleTypes, cancelBooking, rateBooking, acceptBid, driverVehicle, driverName, onGoBook, lang }) {
  const VEHICLES = vehicleTypes;
  const [selectedBids, setSelectedBids] = useState({});
  const bidding = bookings.filter((b) => b.status === "Bidding");
  const ongoing = bookings.filter((b) => b.status === "Ongoing");
  const others = bookings.filter((b) => b.status === "Completed" || b.status === "Cancelled");
  const statusMeta = lang === "en"
    ? { Completed: { label: "Completed", color: C.success, bg: "#DFEEE2" }, Cancelled: { label: "Cancelled", color: C.safety, bg: "#FCEAE3" } }
    : { Completed: { label: "पूर्ण", color: C.success, bg: "#DFEEE2" }, Cancelled: { label: "रद्द", color: C.safety, bg: "#FCEAE3" } };

  const downloadInvoice = (b) => {
    const text = `Saathi Transport Invoice\nBooking: ${b.id}\nPickup: ${b.pickup}\nDrop: ${b.drop}\nVehicle: ${VEHICLES.find(v => v.key === b.vehicle)?.label}\nDistance: ${b.distance} km\nQuoted Fare: ${fmt(b.fare - (b.extraCharge || 0))}\nExtra Waiting Charge: ${b.extraCharge ? fmt(b.extraCharge) : "-"}\nTotal Fare: ${fmt(b.fare)}\nAllowed Hours: ${b.hours || "-"} hrs\nWaiting Charge Rate: ${b.extraHourRate ? fmt(b.extraHourRate) + "/hr" : "-"}\nStatus: ${b.status}`;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${b.id}-invoice.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  const shareTrip = (b) => {
    const text = lang === "en"
      ? `My goods are moving via Saathi Transport.\nBooking: ${b.id}\nDriver: ${driverName || "—"}\nVehicle Number: ${driverVehicle?.vehicleNumber || "—"}\nRoute: ${b.pickup} → ${b.drop}\nStatus: ${b.progress}% complete`
      : `मेरा सामान सार्थी ट्रांसपोर्ट से जा रहा है।\nबुकिंग: ${b.id}\nड्राइवर: ${driverName || "—"}\nगाड़ी नंबर: ${driverVehicle?.vehicleNumber || "—"}\nरूट: ${b.pickup} → ${b.drop}\nस्टेटस: ${b.progress}% पूरा`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <div className="px-5 py-5">
      <h2 className="text-base font-bold mb-3" style={{ color: C.ink }}>{lang === "en" ? "My Bookings" : "मेरी बुकिंग्स"}</h2>

      {bidding.map((b) => {
        const v = VEHICLES.find((x) => x.key === b.vehicle);
        const sortedBids = [...b.bids].sort((x, y) => x.amount - y.amount);
        const selectedId = selectedBids[b.id];
        return (
          <div key={b.id} className="rounded-xl p-3 mb-4" style={{ background: C.paper, border: `1.5px solid ${C.marigoldDeep}` }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold flex items-center gap-1" style={{ color: C.marigoldDeep }}><IndianRupee size={13} /> {lang === "en" ? "Bidding in progress" : "बोली चल रही है"}</span>
              <span className="text-[10px] font-mono" style={{ color: C.inkSoft }}>{b.id}</span>
            </div>
            <div className="text-xs mb-2" style={{ color: C.ink }}>{v?.label} · {b.pickup} → {b.drop}</div>
            {b.scheduledFor && (
              <div className="rounded-lg p-2 mb-2 flex items-center gap-1.5" style={{ background: "#DCE9F5" }}>
                <Clock3 size={12} color="#2B5C8A" />
                <span className="text-[11px] font-semibold" style={{ color: "#2B5C8A" }}>{lang === "en" ? "Scheduled for" : "इसके लिए शेड्यूल"}: {b.scheduledFor}</span>
              </div>
            )}

            {sortedBids.length === 0 ? (
              <div className="text-[11px] py-3 text-center" style={{ color: C.inkSoft }}>{lang === "en" ? "Waiting for driver bids..." : "ड्राइवरों की बोली का इंतज़ार है..."}</div>
            ) : (
              <>
                {(() => {
                  const lowest = sortedBids[0];
                  const isSelected = selectedId === lowest.id;
                  return (
                    <button onClick={() => setSelectedBids((prev) => ({ ...prev, [b.id]: lowest.id }))}
                      className="w-full text-left rounded-xl p-3 mb-2 relative"
                      style={{ background: isSelected ? "#DCE9F5" : "#DFEEE2", border: `2px solid ${isSelected ? C.pimpri : C.success}` }}>
                      <span className="absolute -top-2 left-3 text-[9px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: C.success }}>{lang === "en" ? "Lowest bid" : "सबसे कम बोली"}</span>
                      <div className="flex items-center gap-2 mt-1">
                        {lowest.driverName === driverName && driverVehicle?.photo ? (
                          <img src={driverVehicle.photo.url} alt={v?.label} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0" style={{ background: isSelected ? C.pimpri : C.success }}>
                            <Truck size={20} color="#fff" />
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-xs font-bold" style={{ color: C.ink }}>{lowest.driverName}</div>
                              <div className="text-[10px]" style={{ color: isSelected ? C.pimpri : C.success }}>{stars(lowest.rating)} · {lowest.distanceKm} {lang === "en" ? "km away" : "किमी दूर"}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-base font-bold" style={{ color: isSelected ? C.pimpri : C.success, fontFamily: monoFont }}>{fmt(lowest.amount)}</span>
                              {isSelected && <CheckCircle2 size={16} color={C.pimpri} />}
                            </div>
                          </div>
                          {v && (
                            <div className="text-[9px] mt-0.5" style={{ color: isSelected ? C.pimpri : C.success, fontFamily: monoFont }}>{v.l}×{v.w}×{v.h} {lang === "en" ? "ft (L×W×H)" : "फीट (ल×चौ×ऊं)"}</div>
                          )}
                        </div>
                      </div>
                      {(lowest.hours || lowest.extraHourRate) && (
                        <div className="text-[10px] mt-1.5 pt-1.5" style={{ color: isSelected ? C.pimpri : C.success, borderTop: `1px solid ${isSelected ? "#B7CFE3" : "#BFE0C6"}` }}>
                          {lowest.hours ? (lang === "en" ? `${lowest.hours} allowed hrs · ` : `${lowest.hours} घंटे अलाउ · `) : ""}
                          {lowest.extraHourRate ? (lang === "en" ? `then ${fmt(lowest.extraHourRate)}/hr waiting` : `उसके बाद ${fmt(lowest.extraHourRate)}/घंटा वेटिंग`) : ""}
                        </div>
                      )}
                    </button>
                  );
                })()}

                {sortedBids.length > 1 && (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
                    {sortedBids.slice(1).map((bid) => {
                      const isSelected = selectedId === bid.id;
                      return (
                        <button key={bid.id} onClick={() => setSelectedBids((prev) => ({ ...prev, [b.id]: bid.id }))}
                          className="w-full text-left rounded-lg p-2.5"
                          style={{ background: isSelected ? "#DCE9F5" : "#FBEBD2", border: isSelected ? `2px solid ${C.pimpri}` : "2px solid transparent" }}>
                          <div className="flex items-center gap-2">
                            {bid.driverName === driverName && driverVehicle?.photo ? (
                              <img src={driverVehicle.photo.url} alt={v?.label} className="w-9 h-9 rounded-lg object-cover shrink-0" />
                            ) : (
                              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: isSelected ? C.pimpri : C.marigoldDeep }}>
                                <Truck size={16} color="#fff" />
                              </div>
                            )}
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="text-xs font-bold" style={{ color: C.ink }}>{bid.driverName}</div>
                                  <div className="text-[10px]" style={{ color: isSelected ? C.pimpri : C.marigoldDeep }}>{stars(bid.rating)} · {bid.distanceKm} {lang === "en" ? "km away" : "किमी दूर"}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold" style={{ color: isSelected ? C.pimpri : C.marigoldDeep, fontFamily: monoFont }}>{fmt(bid.amount)}</span>
                                  {isSelected && <CheckCircle2 size={16} color={C.pimpri} />}
                                </div>
                              </div>
                              {v && <div className="text-[9px]" style={{ color: isSelected ? C.pimpri : C.marigoldDeep, fontFamily: monoFont }}>{v.l}×{v.w}×{v.h} {lang === "en" ? "ft" : "फीट"}</div>}
                            </div>
                          </div>
                          {(bid.hours || bid.extraHourRate) && (
                            <div className="text-[10px] mt-1.5 pt-1.5" style={{ color: isSelected ? C.pimpri : C.marigoldDeep, borderTop: `1px solid ${isSelected ? "#B7CFE3" : "#E8D7A8"}` }}>
                              {bid.hours ? (lang === "en" ? `${bid.hours} allowed hrs · ` : `${bid.hours} घंटे अलाउ · `) : ""}
                              {bid.extraHourRate ? (lang === "en" ? `then ${fmt(bid.extraHourRate)}/hr waiting` : `उसके बाद ${fmt(bid.extraHourRate)}/घंटा वेटिंग`) : ""}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {selectedId && (
              <button onClick={() => { acceptBid(b.id, selectedId); setSelectedBids((prev) => { const n = { ...prev }; delete n[b.id]; return n; }); }}
                className="w-full rounded-lg py-2.5 font-bold text-sm mt-2 text-white" style={{ background: C.success }}>
                {lang === "en" ? "Book this vehicle" : "यही गाड़ी बुक करें"}
              </button>
            )}
            <button onClick={() => cancelBooking(b.id)} className="text-[11px] font-semibold mt-2" style={{ color: C.safety }}>{lang === "en" ? "Cancel load" : "लोड रद्द करें"}</button>
          </div>
        );
      })}

      {ongoing.map((b) => {
        const v = VEHICLES.find((x) => x.key === b.vehicle);
        return (
          <div key={b.id} className="rounded-xl p-3 mb-4" style={{ background: C.paper, border: `1.5px solid ${C.pimpri}` }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold flex items-center gap-1" style={{ color: C.pimpri }}><Navigation size={13} /> {lang === "en" ? "Live Tracking" : "लाइव ट्रैकिंग"}</span>
              <span className="text-[10px] font-mono" style={{ color: C.inkSoft }}>{b.id}</span>
            </div>
            <div className="flex items-center gap-2.5 mb-2 rounded-lg p-2" style={{ background: "#DCE9F5" }}>
              {driverVehicle?.photo ? <img src={driverVehicle.photo.url} alt="ड्राइवर" className="w-9 h-9 rounded-full object-cover" /> : (
                <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: C.pimpri }}><UserCircle2 size={20} color="#fff" /></div>
              )}
              <div className="flex-1">
                <div className="text-xs font-bold" style={{ color: C.ink }}>{b.driverName}</div>
                <div className="text-[10px]" style={{ color: C.pimpri, fontFamily: monoFont }}>{v?.label} · {driverVehicle?.vehicleNumber || (lang === "en" ? "vehicle number unavailable" : "गाड़ी नंबर उपलब्ध नहीं")} · {lang === "en" ? "fixed fare" : "तय भाड़ा"} {fmt(b.fare)}</div>
                {b.hours && <div className="text-[10px]" style={{ color: C.pimpri, fontFamily: monoFont }}>{lang === "en" ? `${b.hours} allowed hrs` : `${b.hours} घंटे अलाउ`}{b.extraHourRate ? (lang === "en" ? ` · then ${fmt(b.extraHourRate)}/hr waiting` : ` · उसके बाद ${fmt(b.extraHourRate)}/घंटा वेटिंग`) : ""}</div>}
              </div>
            </div>
            {b.otp && !b.loadingStartedAt && (
              <div className="rounded-lg p-3 mb-2 text-center" style={{ background: "#FBEBD2", border: `1.5px dashed ${C.marigoldDeep}` }}>
                <div className="text-[10px] font-semibold" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Give this OTP to the driver at pickup" : "पिकअप पर यह OTP ड्राइवर को बताएं"}</div>
                <div className="text-2xl font-bold mt-1" style={{ color: C.marigoldDeep, fontFamily: monoFont, letterSpacing: 4 }}>{b.otp}</div>
              </div>
            )}
            <MockMap pickup={b.pickup} drop={b.drop} progress={b.progress} zoneColor={C.pimpri} height={130} />
            <div className="w-full h-1.5 rounded-full mt-2" style={{ background: C.line }}>
              <div className="h-1.5 rounded-full" style={{ width: `${b.progress}%`, background: C.pimpri }} />
            </div>
            <div className="text-[11px] mt-1" style={{ color: C.inkSoft }}>{lang === "en" ? "Vehicle location" : "गाड़ी की लोकेशन"} — {b.progress}% {lang === "en" ? "of the way complete" : "रास्ता पूरा"}</div>
            <div className="flex items-center gap-4 mt-2">
              <button onClick={() => shareTrip(b)} className="text-[11px] font-semibold flex items-center gap-1" style={{ color: C.success }}><MessageCircle size={12} /> {lang === "en" ? "Share trip" : "ट्रिप शेयर करें"}</button>
              <button onClick={() => cancelBooking(b.id)} className="text-[11px] font-semibold" style={{ color: C.safety }}>{lang === "en" ? "Cancel booking" : "बुकिंग रद्द करें"}</button>
            </div>
          </div>
        );
      })}

      {others.length === 0 && ongoing.length === 0 && bidding.length === 0 && (
        <div className="text-center py-12 px-6">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "#FBEBD2" }}>
            <Package size={26} color={C.marigoldDeep} />
          </div>
          <p className="text-sm font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "No bookings yet" : "अभी कोई बुकिंग नहीं है"}</p>
          <p className="text-xs mb-4" style={{ color: C.inkSoft }}>{lang === "en" ? "Post your first load — bids from nearby drivers will start arriving in minutes." : "अपना पहला लोड पोस्ट करें — कुछ ही मिनटों में पास के ड्राइवरों की बोलियां मिलनी शुरू हो जाएंगी।"}</p>
          <button onClick={onGoBook} className="rounded-full px-5 py-2.5 text-xs font-bold" style={{ background: C.marigold, color: C.navy }}>
            + {lang === "en" ? "Post first load" : "पहला लोड पोस्ट करें"}
          </button>
        </div>
      )}

      {others.map((b) => {
        const meta = statusMeta[b.status];
        return (
          <div key={b.id} className="rounded-xl mb-3 p-3" style={{ background: C.paper, border: `1px dashed ${C.line}` }}>
            <div className="flex justify-between items-start">
              <div className="text-[11px]" style={{ fontFamily: monoFont, color: C.inkSoft }}>{b.id}</div>
              <div className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: meta.color, background: meta.bg }}>{meta.label}</div>
            </div>
            <div className="text-xs mt-1" style={{ color: C.ink }}>{b.pickup} → {b.drop}</div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm font-bold" style={{ color: C.ink, fontFamily: monoFont }}>{b.fare ? fmt(b.fare) : "—"}</span>
              {b.status === "Completed" && (
                <button onClick={() => downloadInvoice(b)} className="text-[11px] font-semibold flex items-center gap-1" style={{ color: C.marigoldDeep }}><Download size={12} /> {lang === "en" ? "Invoice" : "इनवॉइस"}</button>
              )}
            </div>
            {b.status === "Completed" && (
              <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
                <span className="text-[11px]" style={{ color: C.inkSoft }}>{b.rating ? (lang === "en" ? "Your rating:" : "आपकी रेटिंग:") : (lang === "en" ? "Rate the driver:" : "ड्राइवर को रेट करें:")}</span>
                <StarRating value={b.rating} onRate={(n) => rateBooking(b.id, n)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CustomerApp({ bookings, createLoad, driverVehicle, vehicleTypes, cancelBooking, rateBooking, acceptBid, driverName, lang, onLogout, customerProfile, raiseAlert }) {
  const [tab, setTab] = useState("book");
  const [showMenu, setShowMenu] = useState(false);
  const [showSos, setShowSos] = useState(false);
  const tabs = [["book", "बुक करें", ClipboardList], ["rides", "मेरी राइड्स", Package]];

  if (showSos) {
    return (
      <div className="flex-1 overflow-y-auto relative">
        <button onClick={() => setShowSos(false)} className="flex items-center gap-1 px-5 pt-4 text-xs font-semibold" style={{ color: C.marigoldDeep }}>← {lang === "en" ? "Back" : "वापस"}</button>
        <SosScreen role="customer" raiseAlert={raiseAlert} lang={lang} />
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto relative">
        <div className="flex items-center justify-end px-5 pt-3">
          <button onClick={() => setShowMenu((s) => !s)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#F0EBDC" }}>
            <Settings2 size={15} color={C.inkSoft} />
          </button>
        </div>
        {showMenu && (
          <div className="mx-5 mb-1 rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: C.paper }}>
            {customerProfile?.name && (
              <div className="px-3 py-2.5" style={{ borderBottom: `1px solid ${C.line}` }}>
                <div className="text-xs font-bold" style={{ color: C.ink }}>{customerProfile.name}</div>
                <div className="text-[10px]" style={{ color: C.inkSoft }}>{customerProfile.address}, {customerProfile.area}, {customerProfile.city} {customerProfile.pincode}</div>
              </div>
            )}
            <button onClick={() => { setShowSos(true); setShowMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
              <Siren size={14} color={C.safety} /> SOS / {lang === "en" ? "Help" : "मदद"}
            </button>
            <button onClick={() => {
              const msg = lang === "en"
                ? "Try Saathi Transport for booking trucks/tempos easily! Download: https://saathitransport.example.com — you both get ₹200 when your first trip is done!"
                : "ट्रक/टेम्पो बुक करने के लिए सार्थी ट्रांसपोर्ट इस्तेमाल करें! डाउनलोड करें: https://saathitransport.example.com — पहली ट्रिप पूरी होने पर आप दोनों को ₹200 मिलेंगे!";
              window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
            }} className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
              <MessageCircle size={14} color={C.success} /> {lang === "en" ? "Share App (Refer & Earn ₹200)" : "ऐप शेयर करें (Refer & Earn ₹200)"}
            </button>
            <button onClick={onLogout} className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold" style={{ color: C.safety }}>
              <XCircle size={14} /> {lang === "en" ? "Logout" : "लॉगआउट"}
            </button>
          </div>
        )}
        {tab === "book" && <CustomerBooking createLoad={createLoad} driverVehicle={driverVehicle} vehicleTypes={vehicleTypes} lastBooking={bookings[0]} lang={lang} />}
        {tab === "rides" && <CustomerRides bookings={bookings} vehicleTypes={vehicleTypes} cancelBooking={cancelBooking} rateBooking={rateBooking} acceptBid={acceptBid} driverVehicle={driverVehicle} driverName={driverName} onGoBook={() => setTab("book")} lang={lang} />}
      </div>
      <BottomNav tabs={tabs} tab={tab} setTab={setTab} lang={lang} />
    </>
  );
}

// =====================================================================
// DRIVER APP
// =====================================================================
function LoadAlertCard({ load, vehicleTypes, driver, addBid, lang }) {
  const VEHICLES = vehicleTypes;
  const v = VEHICLES.find((x) => x.key === load.vehicle);
  const myBid = load.bids.find((b) => b.driverName === driver.name);
  const [amount, setAmount] = useState("");
  const [allowedHours, setAllowedHours] = useState("");
  const [extraHourRate, setExtraHourRate] = useState("");
  const [justSubmitted, setJustSubmitted] = useState(false);

  const canSubmit = Number(amount) > 0 && Number(allowedHours) > 0 && Number(extraHourRate) > 0;

  const otherBids = load.bids.filter((b) => b.driverName !== driver.name);
  const lowestOther = otherBids.length ? otherBids.reduce((min, b) => b.amount < min.amount ? b : min) : null;
  const allAmounts = load.bids.map((b) => b.amount);
  const lowestOverall = allAmounts.length ? Math.min(...allAmounts) : null;
  const isMineHighest = myBid && allAmounts.length > 1 && myBid.amount === Math.max(...allAmounts) && myBid.amount !== lowestOverall;

  const submitBid = () => {
    if (!canSubmit || myBid) return;
    addBid(load.id, {
      driverName: driver.name, amount: Number(amount),
      hours: Number(allowedHours), extraHourRate: Number(extraHourRate),
      rating: driver.rating || 4.6, distanceKm: 1 + Math.floor(Math.random() * 6),
    });
    setJustSubmitted(true);
    setTimeout(() => setJustSubmitted(false), 2500);
  };

  const inputCls = "w-full py-2 text-sm outline-none";
  const boxStyle = { border: `1px solid ${C.line}`, background: C.paper };

  return (
    <div className="rounded-xl p-3 mb-3 transition-colors" style={{ background: justSubmitted ? "#DFEEE2" : C.paper, border: `2px solid ${justSubmitted ? C.success : C.marigoldDeep}` }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold flex items-center gap-1" style={{ color: C.marigoldDeep }}><Bell size={13} /> {lang === "en" ? "New Load" : "नया लोड"}</span>
        <span className="text-[10px]" style={{ color: C.inkSoft }}>{load.distance} {lang === "en" ? "km" : "किमी"}</span>
      </div>
      <div className="text-xs mb-0.5" style={{ color: C.ink }}>{load.pickup} → {load.drop}</div>
      <div className="text-[11px] mb-2" style={{ color: C.inkSoft }}>{v?.label} · {materialLabel(load.material, lang)} · {load.weight} {lang === "en" ? "kg" : "किग्रा"}</div>

      {lowestOverall !== null && (
        <div className="rounded-lg p-2 mb-2 flex items-center justify-between" style={{ background: "#DFEEE2" }}>
          <span className="text-[11px] font-semibold" style={{ color: C.success }}>{lang === "en" ? "Current lowest quote" : "अभी सबसे कम कोटेशन"}</span>
          <span className="text-sm font-bold" style={{ color: C.success, fontFamily: monoFont }}>{fmt(lowestOverall)}</span>
        </div>
      )}
      {isMineHighest && (
        <div className="rounded-lg p-2 mb-2 text-[11px] font-semibold" style={{ background: "#FCEAE3", color: C.safety }}>
          ⚠ {lang === "en" ? "Your quote is the highest" : "आपका कोटेशन सबसे ज़्यादा है"} — {lowestOther ? (lang === "en" ? `${lowestOther.driverName}'s quote is ${fmt(lowestOther.amount)}` : `${lowestOther.driverName} का कोटेशन ${fmt(lowestOther.amount)} है`) : ""}
        </div>
      )}

      {myBid ? (
        <div className="rounded-lg p-3" style={{ background: "#DFEEE2" }}>
          <div className="flex items-center gap-1.5 text-xs font-bold mb-1" style={{ color: C.success }}>
            <CheckCircle2 size={14} /> {lang === "en" ? "Your quote has been sent" : "आपका कोटेशन भेज दिया गया"}
          </div>
          <div className="text-sm font-bold" style={{ color: C.success, fontFamily: monoFont }}>{fmt(myBid.amount)}</div>
          <div className="text-[11px] mt-1" style={{ color: C.inkSoft }}>
            {lang === "en" ? `${myBid.hours} allowed hrs · then ${fmt(myBid.extraHourRate)}/hr waiting` : `${myBid.hours} घंटे अलाउ · उसके बाद ${fmt(myBid.extraHourRate)}/घंटा वेटिंग`}
          </div>
          <div className="text-[10px] mt-1.5" style={{ color: C.inkSoft }}>{lang === "en" ? "A submitted quote cannot be changed." : "एक बार भेजा गया कोटेशन बदला नहीं जा सकता।"}</div>
        </div>
      ) : (
        <>
          <div className="text-sm font-extrabold mb-1.5" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Enter your quote (all fields required)" : "अपना कोटेशन भरें (सभी फील्ड ज़रूरी)"}</div>
          {v?.rate && (
            <button onClick={() => setAmount(String(Math.round((load.distance * v.rate) / 10) * 10))}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 mb-2" style={{ background: "#DCE9F5" }}>
              <IndianRupee size={11} color="#2B5C8A" />
              <span className="text-[11px] font-semibold" style={{ color: "#2B5C8A" }}>
                {lang === "en" ? `Suggested: ₹${Math.round((load.distance * v.rate) / 10) * 10} (tap to fill)` : `सुझाव: ₹${Math.round((load.distance * v.rate) / 10) * 10} (टैप करके भरें)`}
              </span>
            </button>
          )}
          <div className="rounded-lg overflow-hidden mb-2" style={{ border: `2px solid ${C.marigoldDeep}` }}>
            <div className="grid grid-cols-3" style={{ background: "#FBEBD2" }}>
              <div className="px-1.5 py-1.5 text-center" style={{ borderRight: `2px solid ${C.marigoldDeep}`, background: C.paper }}>
                <div className="text-[9px] font-extrabold mb-0.5" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Fare ₹ *" : "कुल भाड़ा ₹ *"}</div>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus
                  className="w-full text-center outline-none bg-transparent" style={{ color: C.marigoldDeep, fontFamily: monoFont, fontSize: 18, fontWeight: 800 }} />
              </div>
              <div className="px-1.5 py-1.5 text-center" style={{ borderRight: `1px solid ${C.marigoldDeep}` }}>
                <div className="text-[9px] font-bold mb-0.5" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Allowed hrs *" : "अलाउ घंटे *"}</div>
                <input type="number" value={allowedHours} onChange={(e) => setAllowedHours(e.target.value)} placeholder="0"
                  className="w-full text-center outline-none bg-transparent" style={{ color: C.ink, fontFamily: monoFont, fontSize: 15, fontWeight: 700 }} />
              </div>
              <div className="px-1.5 py-1.5 text-center">
                <div className="text-[9px] font-bold mb-0.5" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Waiting ₹/hr *" : "वेटिंग ₹/घं *"}</div>
                <input type="number" value={extraHourRate} onChange={(e) => setExtraHourRate(e.target.value)} placeholder="0"
                  className="w-full text-center outline-none bg-transparent" style={{ color: C.ink, fontFamily: monoFont, fontSize: 13 }} />
              </div>
            </div>
          </div>
          <div className="text-[10px] mb-2" style={{ color: C.inkSoft }}>
            {lang === "en" ? "Toll tax on the route must be paid by the driver from this fare — customer pays no separate toll." : "रास्ते का टोल टैक्स इसी भाड़े में से ड्राइवर को देना होगा — ग्राहक अलग से टोल नहीं देगा।"}
          </div>

          {!canSubmit && (amount || allowedHours || extraHourRate) && (
            <div className="text-[10px] mb-2 font-semibold" style={{ color: C.safety }}>{lang === "en" ? "All three fields are required" : "तीनों फील्ड भरना ज़रूरी है"}</div>
          )}

          <button onClick={submitBid} disabled={!canSubmit} className="w-full rounded-lg py-2.5 text-sm font-bold text-white flex items-center justify-center gap-1.5"
            style={{ background: justSubmitted ? C.success : canSubmit ? C.marigoldDeep : C.line, color: justSubmitted || canSubmit ? "#fff" : "#8A8375" }}>
            {justSubmitted ? <><CheckCircle2 size={16} /> {lang === "en" ? "Sent" : "भेज दिया"}</> : (lang === "en" ? "Send Quote" : "कोटेशन भेजें")}
          </button>
        </>
      )}
    </div>
  );
}

function LoadingTimer({ trip, startLoading, completeBooking, lang }) {
  const [now, setNow] = useState(Date.now());
  const [otpInput, setOtpInput] = useState("");
  const [otpError, setOtpError] = useState(false);
  const [beeped, setBeeped] = useState(false);
  useEffect(() => {
    if (!trip.loadingStartedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [trip.loadingStartedAt]);

  const playBeep = () => {
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
  };

  if (!trip.loadingStartedAt) {
    const confirmOtp = () => {
      if (otpInput.trim() === String(trip.otp || "")) {
        startLoading(trip.id);
        setOtpError(false);
      } else {
        setOtpError(true);
      }
    };
    return (
      <div className="mt-3 rounded-lg p-3" style={{ background: "#FBEBD2", border: `1.5px dashed ${C.marigoldDeep}` }}>
        <div className="text-xs font-bold mb-2" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Ask the customer for their 4-digit OTP to start loading" : "लोडिंग शुरू करने के लिए ग्राहक से 4-अंकों का OTP मांगें"}</div>
        <div className="flex items-center gap-2">
          <input value={otpInput} onChange={(e) => { setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 4)); setOtpError(false); }}
            placeholder="0000" maxLength={4} inputMode="numeric"
            className="flex-1 rounded-lg px-3 py-2.5 text-center outline-none" style={{ border: `1px solid ${C.line}`, background: C.paper, color: C.ink, fontFamily: monoFont, fontSize: 20, letterSpacing: 6 }} />
          <button onClick={confirmOtp} disabled={otpInput.length !== 4} className="shrink-0 rounded-lg px-4 py-2.5 text-sm font-bold text-white"
            style={{ background: otpInput.length === 4 ? C.marigoldDeep : C.line, color: otpInput.length === 4 ? "#fff" : "#8A8375" }}>
            {lang === "en" ? "Confirm" : "पुष्टि करें"}
          </button>
        </div>
        {otpError && <div className="text-[11px] font-semibold mt-1.5" style={{ color: C.safety }}>{lang === "en" ? "Incorrect OTP — ask the customer again" : "OTP गलत है — ग्राहक से दोबारा पूछें"}</div>}
      </div>
    );
  }

  const elapsedMs = now - trip.loadingStartedAt;
  const elapsedHoursExact = elapsedMs / 3600000;
  const bookedHours = trip.hours || 0;
  const extraHours = Math.max(0, elapsedHoursExact - bookedHours);
  const extraCharge = Math.round(extraHours * (trip.extraHourRate || 0));
  if (!beeped && bookedHours > 0 && elapsedHoursExact >= bookedHours) {
    setBeeped(true);
    playBeep();
  }
  const hh = Math.floor(elapsedMs / 3600000);
  const mm = Math.floor((elapsedMs % 3600000) / 60000);
  const ss = Math.floor((elapsedMs % 60000) / 1000);

  return (
    <div className="mt-3">
      <div className="rounded-lg p-3" style={{ background: C.navy }}>
        <div className="text-[11px]" style={{ color: "#9FB0C2" }}>{lang === "en" ? "Loading started" : "लोडिंग शुरू हुए"}</div>
        <div className="text-xl font-bold text-white" style={{ fontFamily: monoFont }}>{String(hh).padStart(2, "0")}:{String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}</div>
        {trip.hours ? (
          <div className="text-[11px] mt-1" style={{ color: "#9FB0C2" }}>{lang === "en" ? `Allowed: ${bookedHours} hrs` : `अलाउ समय: ${bookedHours} घंटे`}</div>
        ) : (
          <div className="text-[11px] mt-1" style={{ color: "#9FB0C2" }}>{lang === "en" ? "Driver had not set allowed hours" : "ड्राइवर ने अलाउ घंटे नहीं भरे थे"}</div>
        )}
        {trip.extraHourRate && extraHours > 0 && (
          <div className="rounded-lg mt-2 p-2" style={{ background: "#5A3E00" }}>
            <div className="text-[11px] font-bold" style={{ color: C.marigold }}>🔔 {lang === "en" ? "Beep-beep! Allowed time is over" : "बीप-बीप! अलाउ समय खत्म हो गया"}</div>
            <div className="text-[11px] mt-0.5" style={{ color: "#F0D9A0" }}>
              {lang === "en" ? `Extra time: ${extraHours.toFixed(2)} hrs · Extra fare: ${fmt(extraCharge)}` : `अतिरिक्त समय: ${extraHours.toFixed(2)} घंटे · अतिरिक्त भाड़ा: ${fmt(extraCharge)}`}
            </div>
          </div>
        )}
      </div>
      <button onClick={() => startLoading(trip.id, -3600000)} className="w-full text-center text-[11px] font-semibold py-2" style={{ color: C.inkSoft }}>
        {lang === "en" ? "+ Advance 1 hour (test)" : "+ 1 घंटा आगे बढ़ाएं (टेस्ट)"}
      </button>
      <button onClick={() => completeBooking(trip.id, extraCharge)} className="w-full rounded-lg py-2.5 font-bold text-sm text-white" style={{ background: C.success }}>
        {lang === "en" ? "End Trip — Complete Trip" : "एंड ट्रिप — ट्रिप पूरी करें"} {extraCharge > 0 ? `(+${fmt(extraCharge)})` : ""}
      </button>
    </div>
  );
}

function LoadSummaryCard({ load, vehicleTypes, driver, onOpen, lang }) {
  const VEHICLES = vehicleTypes;
  const v = VEHICLES.find((x) => x.key === load.vehicle);
  const myBid = load.bids.find((b) => b.driverName === driver.name);
  return (
    <button onClick={onOpen} className="w-full text-left rounded-xl p-3 mb-3"
      style={{ background: C.paper, border: `1.5px solid ${myBid ? C.success : C.marigoldDeep}` }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold flex items-center gap-1" style={{ color: myBid ? C.success : C.marigoldDeep }}>
          <Bell size={13} /> {lang === "en" ? "New Load" : "नया लोड"}
        </span>
        <span className="text-[10px]" style={{ color: C.inkSoft }}>{load.distance} {lang === "en" ? "km" : "किमी"}</span>
      </div>
      <div className="text-xs mb-0.5" style={{ color: C.ink }}>{load.pickup} → {load.drop}</div>
      <div className="text-[11px] mb-2" style={{ color: C.inkSoft }}>{v?.label} · {materialLabel(load.material, lang)} · {load.weight} {lang === "en" ? "kg" : "किग्रा"}</div>
      {load.scheduledFor && (
        <div className="text-[10px] font-semibold mb-2 flex items-center gap-1" style={{ color: "#2B5C8A" }}>
          <Clock3 size={11} /> {lang === "en" ? "Scheduled" : "शेड्यूल"}: {load.scheduledFor}
        </div>
      )}
      {myBid ? (
        <div className="text-[11px] font-bold flex items-center gap-1" style={{ color: C.success }}>
          <CheckCircle2 size={13} /> {lang === "en" ? "Your bid sent" : "आपकी बोली भेजी गई"}: {fmt(myBid.amount)}
        </div>
      ) : (
        <div className="text-[11px] font-bold flex items-center gap-1" style={{ color: C.marigoldDeep }}>
          {lang === "en" ? "Tap to enter fare →" : "भाड़ा भरने के लिए टैप करें →"}
        </div>
      )}
    </button>
  );
}

function DriverHome({ driver, setDriver, bookings, addBid, completeBooking, startLoading, vehicleTypes, lang }) {
  const myTrip = bookings.find((b) => b.status === "Ongoing" && b.driverName === driver.name);
  const [openLoadId, setOpenLoadId] = useState(null);
  const openLoads = bookings.filter((b) => b.status === "Bidding" && (!driver.vehicleSpec?.type || b.vehicle === driver.vehicleSpec.type));
  const openLoad = openLoads.find((l) => l.id === openLoadId);

  return (
    <div className="px-5 py-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-bold" style={{ color: C.ink }}>{driver.name}</div>
          <div className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: C.marigoldDeep }}>
            {stars(driver.rating || 0)} <span style={{ color: C.inkSoft, fontFamily: monoFont }}>({(driver.rating || 0).toFixed(1)})</span>
          </div>
        </div>
        <button onClick={() => setDriver({ ...driver, online: !driver.online })}
          className="flex items-center gap-2 rounded-full pl-3 pr-1 py-1" style={{ background: driver.online ? C.navy : "#8A8375" }}>
          <span className="text-[11px] font-bold text-white">{driver.online ? (lang === "en" ? "Online" : "ऑनलाइन") : (lang === "en" ? "Offline" : "ऑफलाइन")}</span>
          <span className="w-9 h-5 rounded-full relative" style={{ background: driver.online ? C.marigold : "#5B6B7C" }}>
            <span className="w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-all" style={{ left: driver.online ? 19 : 2 }} />
          </span>
        </button>
      </div>

      {driver.kyc !== "Approved" && (
        <div className="rounded-lg p-3 mb-4 flex items-center gap-2" style={{ background: "#FBEBD2" }}>
          <Clock3 size={15} color={C.marigoldDeep} />
          <span className="text-xs font-semibold" style={{ color: C.marigoldDeep }}>{lang === "en" ? "KYC verification pending — loads will show after admin approval." : "KYC सत्यापन लंबित है — एडमिन अप्रूवल के बाद लोड दिखेंगे।"}</span>
        </div>
      )}

      {driver.blacklisted && (
        <div className="rounded-lg p-3 mb-4 flex items-center gap-2" style={{ background: "#FCEAE3" }}>
          <XCircle size={15} color={C.safety} />
          <span className="text-xs font-semibold" style={{ color: C.safety }}>{lang === "en" ? "Your account has been blocked by admin — loads won't show." : "आपका खाता एडमिन द्वारा ब्लॉक किया गया है — लोड नहीं दिखेंगे।"}</span>
        </div>
      )}

      {myTrip ? (
        <div className="rounded-xl p-3" style={{ background: C.paper, border: `1.5px solid ${C.pimpri}` }}>
          <div className="text-xs font-bold mb-2" style={{ color: C.pimpri }}>{lang === "en" ? "Trip in progress" : "ट्रिप जारी है"}</div>
          <MockMap pickup={myTrip.pickup} drop={myTrip.drop} progress={myTrip.progress} zoneColor={C.pimpri} height={130} />
          <div className="text-xs mt-2" style={{ color: C.ink }}>{myTrip.pickup} → {myTrip.drop}</div>
          <div className="text-xs mt-1" style={{ color: C.inkSoft }}>{lang === "en" ? "Customer" : "ग्राहक"}: 9876543210 · {lang === "en" ? "fixed fare" : "तय भाड़ा"} {fmt(myTrip.fare)}</div>
          {myTrip.hours && <div className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? `${myTrip.hours} allowed hrs` : `${myTrip.hours} घंटे अलाउ`}{myTrip.extraHourRate ? (lang === "en" ? ` · then ${fmt(myTrip.extraHourRate)}/hr waiting` : ` · उसके बाद ${fmt(myTrip.extraHourRate)}/घंटा वेटिंग`) : ""}</div>}
          <LoadingTimer trip={myTrip} startLoading={startLoading} completeBooking={completeBooking} lang={lang} />
        </div>
      ) : driver.online && driver.kyc === "Approved" && !driver.blacklisted ? (
        <>
          {openLoads.length === 0 ? (
            <div className="text-center py-10 px-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "#FBEBD2" }}>
                <IndianRupee size={24} color={C.marigoldDeep} />
              </div>
              <p className="text-sm font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "No new load right now" : "अभी कोई नया लोड नहीं है"}</p>
              <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Stay online — new loads will show here instantly." : "ऑनलाइन रहें — नया लोड आते ही यहां तुरंत दिखेगा।"}</p>
            </div>
          ) : (
            <>
              <div className="text-[11px] font-bold mb-2" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Customer Requests" : "कस्टमर रिक्वेस्ट"}</div>
              {openLoads.map((load) => (
                <LoadSummaryCard key={load.id} load={load} vehicleTypes={vehicleTypes} driver={driver} onOpen={() => setOpenLoadId(load.id)} lang={lang} />
              ))}
            </>
          )}
        </>
      ) : (
        <div className="text-center py-10">
          <Truck size={28} color={C.inkSoft} className="mx-auto mb-2" />
          <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Turn duty on to get loads" : "ड्यूटी ऑन करें लोड पाने के लिए"}</p>
        </div>
      )}

      {openLoad && (
        <div className="fixed inset-0 z-40 flex items-end justify-center" style={{ background: "rgba(28,42,58,0.6)" }} onClick={() => setOpenLoadId(null)}>
          <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-t-2xl p-4" style={{ background: C.bg }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold" style={{ color: C.ink }}>{lang === "en" ? "Request Details" : "रिक्वेस्ट की डिटेल"}</span>
              <button onClick={() => setOpenLoadId(null)} className="text-xs font-bold px-2 py-1 rounded" style={{ color: C.inkSoft }}>✕</button>
            </div>
            <LoadAlertCard load={openLoad} vehicleTypes={vehicleTypes} driver={driver} addBid={(id, bid) => { addBid(id, bid); setOpenLoadId(null); }} lang={lang} />
          </div>
        </div>
      )}
    </div>
  );
}

function DriverWallet({ driver, setDriver, tripLog, commissionPct, minWallet, bonusPct, lang, withdrawals, requestWithdrawal }) {
  const recharge = () => setDriver({ ...driver, wallet: driver.wallet + 500 });
  const myTrips = tripLog.filter((t) => t.driverName === driver.name && t.status !== "Cancelled");
  const totalCommission = myTrips.reduce((s, t) => s + t.fare * (commissionPct / 100), 0);
  const totalBonus = myTrips.reduce((s, t) => s + t.fare * (bonusPct / 100), 0);
  const myWithdrawals = (withdrawals || []).filter((w) => w.driverName === driver.name);
  return (
    <div className="px-5 py-5">
      <h2 className="text-base font-bold mb-3" style={{ color: C.ink }}>{lang === "en" ? "My Wallet" : "मेरा वॉलेट"}</h2>
      {commissionPct === 0 && (
        <div className="rounded-lg p-3 mb-3 flex items-center gap-2" style={{ background: "#DFEEE2" }}>
          <CheckCircle2 size={15} color={C.success} />
          <span className="text-xs font-semibold" style={{ color: C.success }}>{lang === "en" ? "Free trial is active — no commission will be cut." : "अभी फ्री ट्रायल चल रहा है — कोई कमीशन नहीं कटेगा।"}</span>
        </div>
      )}
      <div className="rounded-xl p-4 mb-3" style={{ background: C.navy }}>
        <div className="text-[11px]" style={{ color: "#9FB0C2" }}>{lang === "en" ? "Wallet Balance" : "वॉलेट बैलेंस"}</div>
        <div className="text-3xl font-bold text-white mt-1" style={{ fontFamily: monoFont }}>{fmt(driver.wallet)}</div>
        {driver.wallet < minWallet && (
          <div className="text-[11px] mt-2 font-semibold" style={{ color: C.safety }}>{lang === "en" ? `Minimum ${fmt(minWallet)} balance required — app may be deactivated` : `न्यूनतम ${fmt(minWallet)} बैलेंस ज़रूरी है — ऐप बंद हो सकता है`}</div>
        )}
      </div>
      <button onClick={recharge} className="w-full rounded-lg py-2.5 font-bold text-sm mb-2" style={{ background: C.marigold, color: C.navy }}>{lang === "en" ? "Recharge ₹500 via UPI / Paytm" : "UPI / Paytm से ₹500 रीचार्ज करें"}</button>
      <div className="text-[11px] mb-4" style={{ color: C.inkSoft }}>{lang === "en" ? `${commissionPct}% commission is cut from this wallet instantly the moment a bid is accepted.` : `बिड एक्सेप्ट होते ही भाड़े का ${commissionPct}% कमीशन इसी वॉलेट से तुरंत कट जाता है।`}</div>

      <div className="rounded-xl p-4 mb-2" style={{ background: "#DFEEE2", border: `1.5px solid ${C.success}` }}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-[11px] font-bold" style={{ color: C.success }}>{lang === "en" ? "Bonus Account" : "बोनस अकाउंट"}</div>
            <div className="text-[10px]" style={{ color: C.inkSoft }}>{lang === "en" ? `You get ${bonusPct}% out of the ${commissionPct}% commission` : `${commissionPct}% कमीशन में से ${bonusPct}% बोनस आपको मिलता है`}</div>
          </div>
          <div className="text-xl font-bold" style={{ color: C.success, fontFamily: monoFont }}>{fmt(driver.bonus || 0)}</div>
        </div>
        <button onClick={() => requestWithdrawal(driver.bonus || 0)} disabled={!driver.bonus}
          className="w-full rounded-lg py-2 text-xs font-bold text-white flex items-center justify-center gap-1.5"
          style={{ background: driver.bonus ? C.success : C.line, color: driver.bonus ? "#fff" : "#8A8375" }}>
          <Wallet size={13} /> {lang === "en" ? "Send to Bank" : "बैंक में भेजें"}
        </button>
      </div>

      {myWithdrawals.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] font-bold mb-1.5" style={{ color: C.inkSoft }}>{lang === "en" ? "Withdrawal Requests" : "विड्रॉल रिक्वेस्ट"}</div>
          <div className="space-y-1.5">
            {myWithdrawals.map((w) => (
              <div key={w.id} className="rounded-lg px-3 py-2 flex items-center justify-between" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                <span className="text-xs font-semibold" style={{ color: C.ink, fontFamily: monoFont }}>{fmt(w.amount)}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: w.status === "Approved" ? C.success : C.marigoldDeep, background: w.status === "Approved" ? "#DFEEE2" : "#FBEBD2" }}>
                  {w.status === "Approved" ? (lang === "en" ? "Sent to bank ✓" : "बैंक में भेज दिया ✓") : (lang === "en" ? "Pending admin approval" : "एडमिन अप्रूवल बाकी")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg p-3 flex items-center justify-between mb-2" style={{ background: "#FBEBD2" }}>
        <div>
          <div className="text-[11px] font-semibold" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Total commission cut so far" : "अब तक कुल कमीशन कटा"}</div>
          <div className="text-[10px]" style={{ color: C.inkSoft }}>{lang === "en" ? `from ${myTrips.length} trips` : `${myTrips.length} ट्रिप्स से`}</div>
        </div>
        <div className="text-lg font-bold" style={{ color: C.marigoldDeep, fontFamily: monoFont }}>{fmt(totalCommission)}</div>
      </div>
      <div className="rounded-lg p-3 flex items-center justify-between" style={{ background: "#DCE9F5" }}>
        <div>
          <div className="text-[11px] font-semibold" style={{ color: C.pimpri }}>{lang === "en" ? "Total bonus earned so far" : "अब तक कुल बोनस मिला"}</div>
          <div className="text-[10px]" style={{ color: C.inkSoft }}>{lang === "en" ? `from ${myTrips.length} trips` : `${myTrips.length} ट्रिप्स से`}</div>
        </div>
        <div className="text-lg font-bold" style={{ color: C.pimpri, fontFamily: monoFont }}>{fmt(totalBonus)}</div>
      </div>
      <div className="text-[11px] mt-2" style={{ color: C.inkSoft }}>{lang === "en" ? "See the full trip-wise list in the \"History\" tab." : "पूरी ट्रिप-वार लिस्ट \"हिस्ट्री\" टैब में देखें।"}</div>
    </div>
  );
}

function DriverHistory({ tripLog, driver, commissionPct, lang }) {
  const myTrips = tripLog.filter((t) => t.driverName === driver.name);
  return (
    <div className="px-5 py-5">
      <h2 className="text-base font-bold mb-3" style={{ color: C.ink }}>{lang === "en" ? "Trip History" : "ट्रिप हिस्ट्री"}</h2>
      <div className="space-y-2">
        {myTrips.length === 0 && (
          <div className="text-center py-10">
            <Package size={28} color={C.inkSoft} className="mx-auto mb-2" />
            <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "No bid accepted yet." : "अभी कोई बिड एक्सेप्ट नहीं हुई।"}</p>
          </div>
        )}
        {myTrips.map((t) => (
          <div key={t.id} className="rounded-lg px-3 py-2.5" style={{ background: t.status === "Cancelled" ? "#FCEAE3" : C.paper, border: `1px solid ${t.status === "Cancelled" ? C.safety : C.line}` }}>
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold" style={{ color: C.ink }}>{t.pickup} → {t.drop}</div>
              <div className="text-sm font-bold" style={{ color: t.status === "Cancelled" ? C.safety : C.success, fontFamily: monoFont }}>
                {t.status === "Cancelled" ? (lang === "en" ? "Cancelled" : "रद्द") : fmt(t.fare * (1 - commissionPct / 100))}
              </div>
            </div>
            <div className="flex items-center justify-between mt-1">
              <div className="text-[10px]" style={{ color: C.inkSoft }}>
                {t.status === "Cancelled"
                  ? (lang === "en" ? `Fare ${fmt(t.fare)} · commission ${fmt(t.fare * (commissionPct / 100))} refunded to wallet` : `भाड़ा ${fmt(t.fare)} · कमीशन ${fmt(t.fare * (commissionPct / 100))} वापस वॉलेट में जमा`)
                  : (lang === "en" ? `Fare ${fmt(t.fare)} · commission − ${fmt(t.fare * (commissionPct / 100))}` : `भाड़ा ${fmt(t.fare)} · कमीशन − ${fmt(t.fare * (commissionPct / 100))}`)}
              </div>
              {t.status === "Cancelled" ? null : t.rating ? <div className="text-[11px] font-semibold" style={{ color: C.marigoldDeep }}>{stars(t.rating)}</div> : <div className="text-[10px]" style={{ color: C.inkSoft }}>{t.status === "Ongoing" ? (lang === "en" ? "In progress" : "चालू") : (lang === "en" ? "Rating pending" : "रेटिंग बाकी")}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DriverKyc({ driver, setDriver, vehicleTypes, addVehicleType, lang }) {
  const VEHICLES = vehicleTypes;
  const [aadhaar, setAadhaar] = useState(null);
  const [dl, setDl] = useState(null);
  const [rc, setRc] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [insurance, setInsurance] = useState(null);

  const [vehicleType, setVehicleType] = useState(driver.vehicleSpec?.type || VEHICLES[0].key);
  const [vehiclePhoto, setVehiclePhoto] = useState(driver.vehicleSpec?.photo || null);
  const [capacityKg, setCapacityKg] = useState(driver.vehicleSpec?.capacityKg || "");
  const [length, setLength] = useState(driver.vehicleSpec?.length || "");
  const [width, setWidth] = useState(driver.vehicleSpec?.width || "");
  const [height, setHeight] = useState(driver.vehicleSpec?.height || "");
  const [addingType, setAddingType] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState(driver.vehicleSpec?.vehicleNumber || "");

  const confirmNewType = () => {
    const name = newTypeName.trim();
    if (!name) return;
    const key = slugify(name);
    addVehicleType({ key, label: name, rate: 25, capacity: "", capacityKg: 0, l: 0, w: 0, h: 0 });
    setVehicleType(key); setNewTypeName(""); setAddingType(false);
  };

  const onVehiclePhoto = (e) => {
    const f = e.target.files?.[0];
    if (f) setVehiclePhoto({ name: f.name, url: URL.createObjectURL(f) });
  };

  const submit = () => {
    setDriver({
      ...driver, kyc: "Pending", docs: { aadhaar, dl, rc, photo, insurance },
      vehicleSpec: {
        type: vehicleType, photo: vehiclePhoto,
        capacityKg: Number(capacityKg) || undefined, length: Number(length) || undefined,
        width: Number(width) || undefined, height: Number(height) || undefined,
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
      },
    });
  };

  const inputCls = "w-full rounded-lg px-3 py-2.5 text-sm outline-none";
  const inputStyle = { background: C.paper, border: `1px solid ${C.line}`, color: C.ink };
  const docLabels = lang === "en"
    ? { photo: "Driver Photo", aadhaar: "Aadhaar Card", dl: "Driving License", rc: "Vehicle RC", insurance: "Vehicle Insurance" }
    : { photo: "ड्राइवर फोटो", aadhaar: "आधार कार्ड", dl: "ड्राइविंग लाइसेंस", rc: "गाड़ी RC", insurance: "गाड़ी इंश्योरेंस" };

  return (
    <div className="px-5 py-5">
      <h2 className="text-base font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "Documents (KYC)" : "दस्तावेज़ (KYC)"}</h2>
      <p className="text-xs mb-4" style={{ color: C.inkSoft }}>{lang === "en" ? "Upload your photo, Aadhaar, driving license, vehicle RC and insurance." : "अपनी फोटो, आधार, ड्राइविंग लाइसेंस, गाड़ी RC और इंश्योरेंस अपलोड करें।"}</p>

      <div className="rounded-lg p-3 mb-4 flex items-center gap-2" style={{ background: driver.kyc === "Approved" ? "#DFEEE2" : "#FBEBD2" }}>
        <ShieldCheck size={16} color={driver.kyc === "Approved" ? C.success : C.marigoldDeep} />
        <span className="text-xs font-semibold" style={{ color: driver.kyc === "Approved" ? C.success : C.marigoldDeep }}>{lang === "en" ? "Status" : "स्टेटस"}: {driver.kyc === "Approved" ? (lang === "en" ? "Verified" : "सत्यापित") : (lang === "en" ? "Pending" : "लंबित")}</span>
      </div>

      <div className="text-[11px] font-bold mb-2" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Step 1 — Your Details" : "स्टेप 1 — आपकी जानकारी"}</div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          ["photo", docLabels.photo, photo, setPhoto], ["aadhaar", docLabels.aadhaar, aadhaar, setAadhaar],
          ["dl", docLabels.dl, dl, setDl], ["rc", docLabels.rc, rc, setRc], ["insurance", docLabels.insurance, insurance, setInsurance],
        ].map(([key, label, val, setVal]) => (
          <label key={key} className="rounded-lg p-2.5 flex flex-col items-center justify-center text-center cursor-pointer" style={{ border: `1.5px dashed ${C.line}`, background: C.paper, minHeight: 86 }}>
            <Camera size={16} color={C.inkSoft} />
            <span className="text-[10px] font-semibold mt-1" style={{ color: C.ink }}>{label}</span>
            <span className="text-[9px] mt-0.5 truncate max-w-full" style={{ color: val ? C.success : C.inkSoft }}>{val ? (lang === "en" ? "Uploaded ✓" : "अपलोड ✓") : (lang === "en" ? "Take photo" : "फोटो लें")}</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setVal(e.target.files?.[0]?.name || "photo")} />
          </label>
        ))}
      </div>

      <div className="text-[11px] font-bold mb-2" style={{ color: "#2B5C8A" }}>{lang === "en" ? "Step 2 — Vehicle Details" : "स्टेप 2 — गाड़ी की जानकारी"}</div>
      <div className="rounded-xl p-3 mb-4" style={{ border: `1.5px solid #2B5C8A`, background: "#DCE9F5" }}>
        <div className="text-xs font-bold mb-2 flex items-center gap-1.5" style={{ color: "#2B5C8A" }}><Truck size={14} /> {lang === "en" ? "Fill this clearly — customer will see this" : "साफ-साफ भरें — कस्टमर को यही दिखेगी"}</div>

        <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Vehicle Type" : "गाड़ी का प्रकार"}</label>
        <select className={inputCls} style={{ ...inputStyle, marginBottom: addingType ? 8 : 10 }} value={vehicleType}
          onChange={(e) => { if (e.target.value === ADD_VEHICLE_TYPE) setAddingType(true); else { setVehicleType(e.target.value); setAddingType(false); } }}>
          {VEHICLES.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
          <option value={ADD_VEHICLE_TYPE}>+ {lang === "en" ? "Add new type" : "नया प्रकार जोड़ें"}</option>
        </select>
        {addingType && (
          <div className="flex items-center gap-2 mb-2">
            <input className={inputCls} style={inputStyle} placeholder={lang === "en" ? "New vehicle type name" : "नए गाड़ी प्रकार का नाम"} value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} />
            <button onClick={confirmNewType} className="shrink-0 rounded-lg px-3 py-2.5 text-xs font-bold text-white" style={{ background: "#2B5C8A" }}>{lang === "en" ? "Add" : "जोड़ें"}</button>
          </div>
        )}

        <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Vehicle Number" : "गाड़ी नंबर"}</label>
        <input className={inputCls} style={{ ...inputStyle, fontFamily: monoFont, textTransform: "uppercase", marginBottom: 10 }} placeholder="MH-14-XX-XXXX" value={vehicleNumber}
          onChange={(e) => setVehicleNumber(e.target.value)} />

        <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Vehicle Photo" : "गाड़ी की फोटो"}</label>
        <label className="rounded-lg p-2 flex flex-col items-center justify-center cursor-pointer mb-2" style={{ border: `1.5px dashed #2B5C8A`, background: C.paper, minHeight: vehiclePhoto ? "auto" : 110 }}>
          {vehiclePhoto ? (
            <img src={vehiclePhoto.url} alt="गाड़ी" className="w-full h-40 rounded-lg object-cover" />
          ) : (
            <>
              <div className="w-14 h-14 rounded-full flex items-center justify-center mb-1.5" style={{ background: "#DCE9F5" }}><Camera size={22} color="#2B5C8A" /></div>
              <div className="text-xs font-semibold" style={{ color: C.ink }}>{lang === "en" ? "Upload a clear photo" : "साफ फोटो अपलोड करें"}</div>
            </>
          )}
          <input type="file" accept="image/*" className="hidden" onChange={onVehiclePhoto} />
        </label>
        <div className="text-[10px] mb-2" style={{ color: vehiclePhoto ? C.success : C.inkSoft }}>
          {vehiclePhoto ? (lang === "en" ? "Uploaded ✓ — tap to change" : "अपलोड ✓ — बदलने के लिए टैप करें") : (lang === "en" ? "Upload a photo" : "फोटो अपलोड करें")}
        </div>
        <div className="rounded-lg p-2.5 mb-2" style={{ background: "#F0EBDC" }}>
          <div className="text-[10px] font-semibold mb-1" style={{ color: C.ink }}>{lang === "en" ? "For a good photo:" : "अच्छी फोटो के लिए:"}</div>
          <div className="text-[10px]" style={{ color: C.inkSoft, lineHeight: 1.6 }}>
            {lang === "en" ? (
              <>• Take it in daylight, at a clean spot<br />• The full vehicle (front or side) should be in frame<br />• The number plate should be clearly visible<br />• Don't upload blurry, dark, or cropped photos</>
            ) : (
              <>• दिन की रोशनी में, साफ जगह पर फोटो लें<br />• पूरी गाड़ी (आगे से या साइड से) फ्रेम में आनी चाहिए<br />• गाड़ी नंबर प्लेट साफ दिखनी चाहिए<br />• धुंधली, अंधेरी या कटी हुई फोटो न डालें</>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Capacity (kg)" : "क्षमता (किलोग्राम)"}</label>
            <input type="number" className={inputCls} style={inputStyle} placeholder={lang === "en" ? "e.g. 750" : "जैसे: 750"} value={capacityKg} onChange={(e) => setCapacityKg(e.target.value)} />
          </div>
          <div>
            <label className="text-[11px] font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Length (ft)" : "लंबाई (फीट)"}</label>
            <input type="number" className={inputCls} style={inputStyle} placeholder={lang === "en" ? "e.g. 7" : "जैसे: 7"} value={length} onChange={(e) => setLength(e.target.value)} />
          </div>
          <div>
            <label className="text-[11px] font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Width (ft)" : "चौड़ाई (फीट)"}</label>
            <input type="number" className={inputCls} style={inputStyle} placeholder={lang === "en" ? "e.g. 4.5" : "जैसे: 4.5"} value={width} onChange={(e) => setWidth(e.target.value)} />
          </div>
          <div>
            <label className="text-[11px] font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Height (ft)" : "ऊंचाई (फीट)"}</label>
            <input type="number" className={inputCls} style={inputStyle} placeholder={lang === "en" ? "e.g. 4.5" : "जैसे: 4.5"} value={height} onChange={(e) => setHeight(e.target.value)} />
          </div>
        </div>
      </div>

      <button onClick={submit} className="w-full rounded-lg py-3 font-bold text-sm" style={{ background: C.marigold, color: C.navy }}>{lang === "en" ? "Submit" : "सबमिट करें"}</button>
    </div>
  );
}

function DriverApp({ driver, setDriver, bookings, addBid, completeBooking, startLoading, tripLog, vehicleTypes, addVehicleType, raiseAlert, commissionPct, minWallet, bonusPct, lang, onLogout, withdrawals, requestWithdrawal }) {
  const [tab, setTab] = useState("home");
  const [showSettings, setShowSettings] = useState(false);
  const [settingsView, setSettingsView] = useState(null); // 'kyc' | 'sos' | null
  const tabs = [["home", "होम", LayoutDashboard], ["wallet", "वॉलेट", Wallet], ["history", "हिस्ट्री", Package]];

  if (settingsView === "kyc") {
    return (
      <div className="flex-1 overflow-y-auto relative">
        <button onClick={() => setSettingsView(null)} className="flex items-center gap-1 px-5 pt-4 text-xs font-semibold" style={{ color: C.marigoldDeep }}>← {lang === "en" ? "Back" : "वापस"}</button>
        <DriverKyc driver={driver} setDriver={setDriver} vehicleTypes={vehicleTypes} addVehicleType={addVehicleType} lang={lang} />
      </div>
    );
  }
  if (settingsView === "sos") {
    return (
      <div className="flex-1 overflow-y-auto relative">
        <button onClick={() => setSettingsView(null)} className="flex items-center gap-1 px-5 pt-4 text-xs font-semibold" style={{ color: C.marigoldDeep }}>← {lang === "en" ? "Back" : "वापस"}</button>
        <SosScreen role="driver" raiseAlert={raiseAlert} lang={lang} />
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto relative">
        <div className="flex items-center justify-end px-5 pt-3">
          <button onClick={() => setShowSettings((s) => !s)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#F0EBDC" }}>
            <Settings2 size={15} color={C.inkSoft} />
          </button>
        </div>
        {showSettings && (
          <div className="mx-5 mb-1 rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}`, background: C.paper }}>
            <button onClick={() => { setSettingsView("kyc"); setShowSettings(false); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
              <ShieldCheck size={14} color={C.marigoldDeep} /> KYC
            </button>
            <button onClick={() => { setSettingsView("sos"); setShowSettings(false); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
              <Siren size={14} color={C.safety} /> SOS / {lang === "en" ? "Help" : "मदद"}
            </button>
            <button onClick={() => {
              const msg = lang === "en"
                ? "Join Saathi Transport as a driver — bid your own fare, no more middlemen! Download: https://saathitransport.example.com — we both get ₹200 after your first trip!"
                : "सार्थी ट्रांसपोर्ट में ड्राइवर बनकर जुड़ें — अपना भाड़ा खुद तय करें! डाउनलोड करें: https://saathitransport.example.com — पहली ट्रिप पूरी होने पर हम दोनों को ₹200 मिलेंगे!";
              window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
            }} className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
              <MessageCircle size={14} color={C.success} /> {lang === "en" ? "Share App (Refer & Earn ₹200)" : "ऐप शेयर करें (Refer & Earn ₹200)"}
            </button>
            <button onClick={onLogout} className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold" style={{ color: C.safety }}>
              <XCircle size={14} /> {lang === "en" ? "Logout" : "लॉगआउट"}
            </button>
          </div>
        )}
        {tab === "home" && <DriverHome driver={driver} setDriver={setDriver} bookings={bookings} addBid={addBid} completeBooking={completeBooking} startLoading={startLoading} vehicleTypes={vehicleTypes} lang={lang} />}
        {tab === "wallet" && <DriverWallet driver={driver} setDriver={setDriver} tripLog={tripLog} commissionPct={commissionPct} minWallet={minWallet} bonusPct={bonusPct} lang={lang} withdrawals={withdrawals} requestWithdrawal={requestWithdrawal} />}
        {tab === "history" && <DriverHistory tripLog={tripLog} driver={driver} commissionPct={commissionPct} lang={lang} />}
      </div>
      <BottomNav tabs={tabs} tab={tab} setTab={setTab} lang={lang} />
    </>
  );
}

// =====================================================================
// ADMIN PANEL (desktop)
// =====================================================================
function AdminFleet({ drivers, driver, tripLog, lang }) {
  const bookedToday = tripLog.filter((t) => t.status === "Ongoing" || t.status === "Completed").length;
  const readyOnline = drivers.filter((d) => d.online && d.kyc === "Approved" && !d.blacklisted).length + (driver.online && driver.kyc === "Approved" && !driver.blacklisted ? 1 : 0);

  const [vehicleQuery, setVehicleQuery] = useState("");
  const q = vehicleQuery.trim().toUpperCase();
  const matchedDriver = q
    ? (drivers.find((d) => d.vehicleNumber.toUpperCase() === q) ||
       (driver.vehicleSpec?.vehicleNumber?.toUpperCase() === q ? driver : null))
    : null;
  const vehicleHistory = matchedDriver ? tripLog.filter((t) => t.driverName === matchedDriver.name) : [];

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-xl p-4" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          <div className="text-[11px] font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "Booked today" : "आज कितनी गाड़ियां बुक हुईं"}</div>
          <div className="text-3xl font-bold mt-1" style={{ color: C.pimpri, fontFamily: monoFont }}>{bookedToday}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          <div className="text-[11px] font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "Online — ready for bookings" : "ऑनलाइन — बुकिंग के लिए तैयार"}</div>
          <div className="text-3xl font-bold mt-1" style={{ color: C.success, fontFamily: monoFont }}>{readyOnline}</div>
        </div>
      </div>

      <div className="rounded-xl p-4 mb-5" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
        <div className="text-sm font-bold mb-2 flex items-center gap-1.5" style={{ color: C.ink }}><Truck size={16} /> {lang === "en" ? "Search history by vehicle number" : "गाड़ी नंबर से हिस्ट्री देखें"}</div>
        <input value={vehicleQuery} onChange={(e) => setVehicleQuery(e.target.value)} placeholder="जैसे: MH-14-AB-4521"
          className="w-full rounded-lg px-3 py-2 text-xs outline-none" style={{ border: `1px solid ${C.line}`, color: C.ink, fontFamily: monoFont }} />
        {q && !matchedDriver && (
          <div className="text-[11px] mt-2" style={{ color: C.safety }}>{lang === "en" ? "No vehicle found with this number." : "इस नंबर की कोई गाड़ी नहीं मिली।"}</div>
        )}
        {matchedDriver && (
          <div className="mt-3">
            <div className="text-xs font-bold" style={{ color: C.ink }}>{matchedDriver.name} · {matchedDriver.vehicleNumber}</div>
            <div className="text-[10px] mb-2" style={{ color: C.inkSoft }}>{lang === "en" ? "Total trips" : "कुल ट्रिप्स"}: {vehicleHistory.length}</div>
            {vehicleHistory.length === 0 ? (
              <p className="text-[11px]" style={{ color: C.inkSoft }}>{lang === "en" ? "No trip history for this vehicle yet." : "इस गाड़ी की अभी कोई ट्रिप हिस्ट्री नहीं है।"}</p>
            ) : (
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                {vehicleHistory.map((t) => (
                  <div key={t.id} className="rounded-lg p-2 flex items-center justify-between" style={{ background: "#F0EBDC" }}>
                    <div>
                      <div className="text-[11px] font-semibold" style={{ color: C.ink }}>{t.pickup} → {t.drop}</div>
                      <div className="text-[10px]" style={{ color: C.inkSoft }}>{t.status}</div>
                    </div>
                    <div className="text-xs font-bold" style={{ color: C.success, fontFamily: monoFont }}>{fmt(t.fare)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl p-4" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
        <div className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: C.ink }}><MapPinned size={16} /> {lang === "en" ? "Live fleet map (all India)" : "लाइव फ्लीट मैप (पूरे भारत में)"}</div>
        <div className="relative rounded-lg overflow-hidden" style={{ height: 260, background: "#E7E2D2" }}>
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            {Array.from({ length: 6 }).map((_, i) => (
              <line key={"h" + i} x1="0" y1={i * 18} x2="100" y2={i * 18} stroke="#D9D0BC" strokeWidth="0.3" />
            ))}
            {Array.from({ length: 6 }).map((_, i) => (
              <line key={"v" + i} x1={i * 18} y1="0" x2={i * 18} y2="100" stroke="#D9D0BC" strokeWidth="0.3" />
            ))}
            {drivers.filter((d) => d.online).map((d) => {
              const pos = hashPos(d.id + d.zone);
              const color = CITY_COLORS[hashPos(d.zone).x % CITY_COLORS.length] || C.pimpri;
              return <circle key={d.id} cx={pos.x} cy={pos.y} r="2.2" fill={color} stroke="#fff" strokeWidth="0.5" />;
            })}
          </svg>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px]" style={{ color: C.inkSoft }}>
          {[...new Set(drivers.filter((d) => d.online).map((d) => d.zone))].map((city) => (
            <span key={city} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: CITY_COLORS[hashPos(city).x % CITY_COLORS.length] }} /> {city}
            </span>
          ))}
          {drivers.filter((d) => d.online).length === 0 && <span>{lang === "en" ? "No vehicle is online right now" : "अभी कोई गाड़ी ऑनलाइन नहीं है"}</span>}
        </div>
      </div>
    </div>
  );
}

function AdminKyc({ drivers, updateDriverKyc, lang }) {
  const pending = drivers.filter((d) => d.kyc === "Pending");
  const [expandedId, setExpandedId] = useState(null);
  const docLabels = lang === "en"
    ? { aadhaar: "Aadhaar Card", dl: "Driving License", rc: "Vehicle RC", photo: "Driver Photo", insurance: "Insurance" }
    : { aadhaar: "आधार कार्ड", dl: "ड्राइविंग लाइसेंस", rc: "गाड़ी RC", photo: "ड्राइवर फोटो", insurance: "इंश्योरेंस" };
  return (
    <div className="rounded-xl p-4" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
      <div className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: C.ink }}><Users size={16} /> {lang === "en" ? "Driver Approval (KYC Desk)" : "ड्राइवर अप्रूवल (KYC Desk)"}</div>
      {pending.length === 0 ? <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "No pending approvals." : "कोई पेंडिंग अप्रूवल नहीं है।"}</p> : (
        <div className="space-y-2">
          {pending.map((d) => {
            const expanded = expandedId === d.id;
            return (
              <div key={d.id} className="rounded-lg p-3" style={{ border: `1px solid ${C.line}` }}>
                <div className="flex items-center justify-between">
                  <button onClick={() => setExpandedId(expanded ? null : d.id)} className="text-left flex-1">
                    <div className="text-xs font-bold" style={{ color: C.ink }}>{d.name}</div>
                    <div className="text-[10px]" style={{ color: C.inkSoft, fontFamily: monoFont }}>{d.vehicleNumber} · {d.zone}</div>
                    <div className="text-[10px] font-semibold mt-0.5" style={{ color: "#2B5C8A" }}>{expanded ? (lang === "en" ? "▲ Hide details" : "▲ डिटेल छुपाएं") : (lang === "en" ? "▼ View KYC details" : "▼ KYC डिटेल देखें")}</div>
                  </button>
                  <div className="flex gap-2">
                    <button onClick={() => updateDriverKyc(d.id, "Rejected")} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "#FCEAE3", color: C.safety }}>{lang === "en" ? "Block" : "Block"}</button>
                    <button onClick={() => updateDriverKyc(d.id, "Approved")} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: C.success }}>{lang === "en" ? "Approve" : "Approve"}</button>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.line}` }}>
                    {d.vehicleSpec?.photo && (
                      <img src={d.vehicleSpec.photo.url} alt="गाड़ी" className="w-full h-32 rounded-lg object-cover mb-2" />
                    )}
                    {d.vehicleSpec && (
                      <div className="text-[11px] mb-2" style={{ color: C.ink }}>
                        <b>{lang === "en" ? "Vehicle" : "गाड़ी"}:</b> {d.vehicleSpec.capacityKg ? `${d.vehicleSpec.capacityKg} ${lang === "en" ? "kg" : "किग्रा"}` : "—"} ·{" "}
                        {d.vehicleSpec.length || "—"}×{d.vehicleSpec.width || "—"}×{d.vehicleSpec.height || "—"} {lang === "en" ? "ft" : "फीट"}
                      </div>
                    )}
                    <div className="text-[11px] font-semibold mb-1" style={{ color: C.inkSoft }}>{lang === "en" ? "Uploaded documents:" : "अपलोड किए गए दस्तावेज़:"}</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {Object.entries(docLabels).map(([key, label]) => (
                        <div key={key} className="flex items-center gap-1.5 text-[11px]" style={{ color: d.docs?.[key] ? C.success : C.safety }}>
                          {d.docs?.[key] ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {label}
                        </div>
                      ))}
                    </div>
                    {!d.vehicleSpec && !d.docs && (
                      <p className="text-[11px]" style={{ color: C.inkSoft }}>{lang === "en" ? "No extra data available for this driver (demo driver)." : "इस ड्राइवर का कोई अतिरिक्त डेटा उपलब्ध नहीं है (डेमो ड्राइवर)।"}</p>
                    )}
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

function AdminAlerts({ alerts, withdrawals, approveWithdrawal, lang }) {
  const roleLabel = lang === "en" ? { customer: "Customer", driver: "Driver" } : { customer: "ग्राहक", driver: "ड्राइवर" };
  const pendingWithdrawals = (withdrawals || []).filter((w) => w.status === "Pending");
  return (
    <div className="space-y-4">
      {pendingWithdrawals.length > 0 && (
        <div className="rounded-xl p-4" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          <div className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: C.ink }}><Wallet size={16} color={C.success} /> {lang === "en" ? "Withdrawal Requests" : "विड्रॉल रिक्वेस्ट"}</div>
          <div className="space-y-2">
            {pendingWithdrawals.map((w) => (
              <div key={w.id} className="rounded-lg p-3 flex items-center justify-between" style={{ background: "#DFEEE2" }}>
                <div>
                  <div className="text-xs font-bold" style={{ color: C.ink }}>{w.driverName}</div>
                  <div className="text-[10px]" style={{ color: C.inkSoft }}>{w.time}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: C.success, fontFamily: monoFont }}>{fmt(w.amount)}</span>
                  <button onClick={() => approveWithdrawal(w.id)} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: C.success }}>{lang === "en" ? "Approve" : "अप्रूव करें"}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="rounded-xl p-4" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
        <div className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: C.ink }}><Siren size={16} color={C.safety} /> {lang === "en" ? "Emergency Alerts" : "इमरजेंसी अलर्ट्स"}</div>
        {alerts.length === 0 ? <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "No alerts yet." : "अभी कोई अलर्ट नहीं आया।"}</p> : (
          <div className="space-y-2">
            {alerts.map((a) => {
              const urgent = a.type === "इमरजेंसी कॉल" || a.type === "पुलिस सहायता";
              return (
                <div key={a.id} className="rounded-lg p-3" style={{ background: urgent ? "#FCEAE3" : "#F0EBDC" }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1" style={{ color: urgent ? C.safety : C.ink }}>
                      {urgent && <Siren size={12} />} {roleLabel[a.role] || a.role} · {a.type}
                    </span>
                    <span className="text-[10px]" style={{ color: C.inkSoft }}>{a.time}</span>
                  </div>
                  {a.note && <div className="text-[11px] mt-1" style={{ color: C.inkSoft }}>{a.note}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function AdminDriverList({ drivers, toggleBlacklist, lang }) {
  const [q, setQ] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const filtered = drivers.filter((d) => d.name.includes(q) || d.vehicleNumber.toLowerCase().includes(q.toLowerCase()) || d.zone.includes(q));
  const kycMeta = lang === "en"
    ? { Approved: { label: "Verified", color: C.success, bg: "#DFEEE2" }, Pending: { label: "Pending", color: C.marigoldDeep, bg: "#FBEBD2" }, Rejected: { label: "Blocked", color: C.safety, bg: "#FCEAE3" } }
    : { Approved: { label: "सत्यापित", color: C.success, bg: "#DFEEE2" }, Pending: { label: "लंबित", color: C.marigoldDeep, bg: "#FBEBD2" }, Rejected: { label: "ब्लॉक्ड", color: C.safety, bg: "#FCEAE3" } };
  const docLabels = lang === "en"
    ? { aadhaar: "Aadhaar Card", dl: "Driving License", rc: "Vehicle RC", photo: "Driver Photo", insurance: "Insurance" }
    : { aadhaar: "आधार कार्ड", dl: "ड्राइविंग लाइसेंस", rc: "गाड़ी RC", photo: "ड्राइवर फोटो", insurance: "इंश्योरेंस" };
  return (
    <div className="rounded-xl p-4" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
      <div className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: C.ink }}><Users size={16} /> {lang === "en" ? "All Drivers" : "सभी ड्राइवर"}</div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={lang === "en" ? "Search by name, vehicle number or city..." : "नाम, गाड़ी नंबर या शहर से खोजें..."} className="w-full rounded-lg px-3 py-2 text-xs outline-none mb-3" style={{ border: `1px solid ${C.line}`, background: C.paper, color: C.ink }} />
      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "No driver found." : "कोई ड्राइवर नहीं मिला।"}</p>}
        {filtered.map((d) => {
          const km = kycMeta[d.kyc] || kycMeta.Pending;
          const expanded = expandedId === d.id;
          return (
            <div key={d.id} className="rounded-lg p-3" style={{ border: `1px solid ${d.blacklisted ? C.safety : C.line}`, background: d.blacklisted ? "#FCEAE3" : C.paper }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold" style={{ color: C.ink }}>{d.name}</div>
                  <div className="text-[10px]" style={{ color: C.inkSoft, fontFamily: monoFont }}>{d.vehicleNumber} · {d.zone} · {lang === "en" ? "Wallet" : "वॉलेट"} {fmt(d.wallet)}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: d.online ? C.success : C.inkSoft, background: d.online ? "#DFEEE2" : "#F0EBDC" }}>{d.online ? (lang === "en" ? "Online" : "ऑनलाइन") : (lang === "en" ? "Offline" : "ऑफलाइन")}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: km.color, background: km.bg }}>{km.label}</span>
                </div>
              </div>

              <button onClick={() => setExpandedId(expanded ? null : d.id)} className="text-[10px] font-semibold mt-2" style={{ color: "#2B5C8A" }}>
                {expanded ? (lang === "en" ? "▲ Hide KYC details" : "▲ KYC डिटेल छुपाएं") : (lang === "en" ? "▼ View KYC details" : "▼ KYC डिटेल देखें")}
              </button>
              {expanded && (
                <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
                  {d.vehicleSpec?.photo && <img src={d.vehicleSpec.photo.url} alt="गाड़ी" className="w-full h-28 rounded-lg object-cover mb-2" />}
                  {d.vehicleSpec && (
                    <div className="text-[11px] mb-2" style={{ color: C.ink }}>
                      <b>{lang === "en" ? "Vehicle" : "गाड़ी"}:</b> {d.vehicleSpec.capacityKg ? `${d.vehicleSpec.capacityKg} ${lang === "en" ? "kg" : "किग्रा"}` : "—"} · {d.vehicleSpec.length || "—"}×{d.vehicleSpec.width || "—"}×{d.vehicleSpec.height || "—"} {lang === "en" ? "ft" : "फीट"}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.entries(docLabels).map(([key, label]) => (
                      <div key={key} className="flex items-center gap-1.5 text-[11px]" style={{ color: d.docs?.[key] ? C.success : C.safety }}>
                        {d.docs?.[key] ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {label}
                      </div>
                    ))}
                  </div>
                  {!d.vehicleSpec && !d.docs && <p className="text-[11px]" style={{ color: C.inkSoft }}>{lang === "en" ? "No extra data available for this driver (demo driver)." : "इस ड्राइवर का कोई अतिरिक्त डेटा उपलब्ध नहीं है (डेमो ड्राइवर)।"}</p>}
                </div>
              )}

              <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
                {d.blacklisted ? <span className="text-[11px] font-bold" style={{ color: C.safety }}>⛔ {lang === "en" ? "Blocked — won't get bookings" : "ब्लॉक्ड — बुकिंग नहीं मिलेगी"}</span> : <span />}
                <button onClick={() => toggleBlacklist(d.id)} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{ color: d.blacklisted ? C.success : C.safety, background: d.blacklisted ? "#DFEEE2" : "#FCEAE3" }}>
                  {d.blacklisted ? (lang === "en" ? "Unblock" : "अनब्लॉक करें") : (lang === "en" ? "Block" : "ब्लॉक करें")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AdminNotify({ drivers }) {
  const [target, setTarget] = useState("all");
  const [message, setMessage] = useState("");
  const [sentLog, setSentLog] = useState([]);
  const send = () => {
    if (!message.trim()) return;
    const label = target === "all" ? "सभी ड्राइवर" : drivers.find((d) => d.id === target)?.name || target;
    setSentLog((prev) => [{ id: genId("N"), to: label, message, time: new Date().toLocaleTimeString("hi-IN", { hour: "2-digit", minute: "2-digit" }) }, ...prev]);
    setMessage("");
  };
  return (
    <div className="rounded-xl p-4" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
      <div className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: C.ink }}><Bell size={16} /> सूचना भेजें</div>
      <label className="text-[11px] font-semibold mb-1 block" style={{ color: C.inkSoft }}>किसे भेजें</label>
      <select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full rounded-lg px-3 py-2 text-xs outline-none mb-2" style={{ border: `1px solid ${C.line}`, color: C.ink }}>
        <option value="all">सभी ड्राइवर</option>
        {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="संदेश लिखें..." className="w-full rounded-lg px-3 py-2 text-xs outline-none mb-2" rows={3} style={{ border: `1px solid ${C.line}`, color: C.ink }} />
      <button onClick={send} disabled={!message.trim()} className="w-full rounded-lg py-2.5 font-bold text-sm mb-4" style={{ background: message.trim() ? C.marigold : C.line, color: message.trim() ? C.navy : "#8A8375" }}>भेजें</button>
      <div className="text-[11px] font-semibold mb-2" style={{ color: C.inkSoft }}>भेजी गई सूचनाएं</div>
      <div className="space-y-2">
        {sentLog.length === 0 && <p className="text-xs" style={{ color: C.inkSoft }}>अभी कोई सूचना नहीं भेजी गई।</p>}
        {sentLog.map((n) => (
          <div key={n.id} className="rounded-lg p-2.5" style={{ background: "#F0EBDC" }}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold" style={{ color: C.ink }}>{n.to}</span>
              <span className="text-[10px]" style={{ color: C.inkSoft }}>{n.time}</span>
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: C.inkSoft }}>{n.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminSettings({ commissionPct, setCommissionPct, bonusPct, setBonusPct, minWallet, setMinWallet, trialMode, setTrialMode, lang }) {
  return (
    <div className="rounded-xl p-4" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
      <div className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: C.ink }}><Settings2 size={16} /> {lang === "en" ? "System Settings" : "सिस्टम सेटिंग्स"}</div>

      <div className="rounded-lg p-3 mb-4" style={{ background: trialMode ? "#DFEEE2" : "#F0EBDC" }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold" style={{ color: trialMode ? C.success : C.ink }}>{lang === "en" ? "Free Trial Mode (2 months)" : "फ्री ट्रायल मोड (2 महीने)"}</div>
            <div className="text-[11px]" style={{ color: C.inkSoft }}>{lang === "en" ? "While on, both commission and bonus stay at 0%" : "चालू रहने पर कमीशन और बोनस दोनों 0% रहेंगे"}</div>
          </div>
          <button onClick={() => {
            setTrialMode((t) => {
              const next = !t;
              if (next) { setCommissionPct(0); setBonusPct(0); }
              else { setCommissionPct(10); setBonusPct(2); }
              return next;
            });
          }} className="w-12 h-7 rounded-full relative" style={{ background: trialMode ? C.success : "#B8B0A0" }}>
            <div className="w-5 h-5 rounded-full bg-white absolute top-1 transition-all" style={{ left: trialMode ? 25 : 3 }} />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4" style={{ opacity: trialMode ? 0.4 : 1 }}>
        <div>
          <div className="text-xs font-semibold" style={{ color: C.ink }}>{lang === "en" ? "Commission Percentage" : "कमीशन प्रतिशत"}</div>
          <div className="text-[11px]" style={{ color: C.inkSoft }}>{lang === "en" ? "This % is cut from the driver's wallet the moment a bid is accepted" : "बिड एक्सेप्ट होते ही यह % ड्राइवर के वॉलेट से कटेगा"}</div>
        </div>
        <div className="flex items-center gap-1">
          <input type="number" value={commissionPct} disabled={trialMode} onChange={(e) => setCommissionPct(Math.max(0, Number(e.target.value) || 0))}
            className="w-16 rounded px-2 py-1 text-xs text-right" style={{ fontFamily: monoFont, border: `1px solid ${C.line}` }} />
          <span className="text-xs" style={{ color: C.inkSoft }}>%</span>
        </div>
      </div>
      <div className="flex items-center justify-between mb-4" style={{ opacity: trialMode ? 0.4 : 1 }}>
        <div>
          <div className="text-xs font-semibold" style={{ color: C.ink }}>{lang === "en" ? "Driver Bonus Percentage" : "ड्राइवर बोनस प्रतिशत"}</div>
          <div className="text-[11px]" style={{ color: C.inkSoft }}>{lang === "en" ? "This % out of the commission goes back to the driver's bonus account" : "कमीशन में से यह % ड्राइवर के बोनस अकाउंट में वापस जाएगा"}</div>
        </div>
        <div className="flex items-center gap-1">
          <input type="number" value={bonusPct} disabled={trialMode} onChange={(e) => setBonusPct(Math.max(0, Number(e.target.value) || 0))}
            className="w-16 rounded px-2 py-1 text-xs text-right" style={{ fontFamily: monoFont, border: `1px solid ${C.line}` }} />
          <span className="text-xs" style={{ color: C.inkSoft }}>%</span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold" style={{ color: C.ink }}>{lang === "en" ? "Minimum Wallet Balance" : "न्यूनतम वॉलेट बैलेंस"}</div>
          <div className="text-[11px]" style={{ color: C.inkSoft }}>{lang === "en" ? "Driver must maintain this balance to keep the app active" : "ऐप एक्टिव रखने के लिए ड्राइवर को यह बैलेंस रखना होगा"}</div>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs" style={{ color: C.inkSoft }}>₹</span>
          <input type="number" value={minWallet} onChange={(e) => setMinWallet(Math.max(0, Number(e.target.value) || 0))}
            className="w-20 rounded px-2 py-1 text-xs text-right" style={{ fontFamily: monoFont, border: `1px solid ${C.line}` }} />
        </div>
      </div>
    </div>
  );
}

function AdminFinance({ tripLog, commissionPct }) {
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
    <div className="rounded-xl p-4" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-bold flex items-center gap-1.5" style={{ color: C.ink }}><BarChart3 size={16} /> रिपोर्ट्स — कमीशन और कमाई</div>
        <button onClick={downloadReport} disabled={tripLog.length === 0} className="text-[11px] font-semibold flex items-center gap-1 px-2.5 py-1.5 rounded-lg"
          style={{ color: tripLog.length ? C.marigoldDeep : C.inkSoft, background: tripLog.length ? "#FBEBD2" : "#F0EBDC" }}>
          <Download size={12} /> एक्सेल डाउनलोड करें
        </button>
      </div>
      <div className="rounded-lg p-3 mb-3" style={{ background: "#DFEEE2" }}>
        <div className="text-[11px]" style={{ color: C.success }}>आज का कुल कमीशन ({commissionPct}%)</div>
        <div className="text-xl font-bold" style={{ color: C.success, fontFamily: monoFont }}>{fmt(totalCommission)}</div>
      </div>
      {tripLog.length === 0 ? <p className="text-xs" style={{ color: C.inkSoft }}>आज अभी तक कोई बिड एक्सेप्ट नहीं हुई।</p> : (
        <table className="w-full text-xs">
          <thead><tr style={{ color: C.inkSoft }}><th className="text-left font-semibold pb-1">ड्राइवर</th><th className="text-left font-semibold pb-1">रूट</th><th className="text-right font-semibold pb-1">भाड़ा</th><th className="text-right font-semibold pb-1">कमीशन</th></tr></thead>
          <tbody>
            {tripLog.map((t) => (
              <tr key={t.id} style={{ borderTop: `1px solid ${C.line}` }}>
                <td className="py-1.5" style={{ color: C.ink }}>{t.driverName}</td>
                <td className="py-1.5" style={{ color: C.inkSoft }}>{t.pickup} → {t.drop}</td>
                <td className="py-1.5 text-right" style={{ fontFamily: monoFont, color: C.ink }}>{fmt(t.fare)}</td>
                <td className="py-1.5 text-right" style={{ fontFamily: monoFont, color: t.status === "Cancelled" ? C.safety : C.success }}>
                  {t.status === "Cancelled" ? "रद्द (वापस)" : fmt(t.fare * (commissionPct / 100))}
                </td>
              </tr>
            ))}

          </tbody>
        </table>
      )}
    </div>
  );
}

function AdminPanel({ drivers, allDrivers, driver, updateDriverKyc, tripLog, alerts, toggleBlacklist, commissionPct, setCommissionPct, minWallet, setMinWallet, bonusPct, setBonusPct, lang, onLogout, trialMode, setTrialMode, withdrawals, approveWithdrawal }) {
  const [tab, setTab] = useState("fleet");
  const tabs = [["fleet", "लाइव डैशबोर्ड", MapPinned], ["kyc", "KYC डेस्क", Users], ["drivers", "ड्राइवर लिस्ट", ClipboardList], ["settings", "सिस्टम सेटिंग्स", Settings2], ["finance", "रिपोर्ट्स", BarChart3], ["notify", "सूचना भेजें", Bell], ["alerts", "अलर्ट्स", Siren]];
  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LayoutDashboard size={18} color={C.marigoldDeep} />
          <h2 className="text-base font-bold" style={{ color: C.ink }}>{lang === "en" ? "Admin Control Panel" : "एडमिन कंट्रोल पैनल"}</h2>
        </div>
        <button onClick={onLogout} className="text-[11px] font-semibold flex items-center gap-1 px-2.5 py-1.5 rounded-lg" style={{ color: C.safety, background: "#FCEAE3" }}>
          <XCircle size={12} /> {lang === "en" ? "Logout" : "लॉगआउट"}
        </button>
      </div>
      <div className="flex gap-2 mb-5 overflow-x-auto">
        {tabs.map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
            style={{ background: tab === k ? C.navy : C.paper, color: tab === k ? "#fff" : C.inkSoft, border: `1px solid ${tab === k ? C.navy : C.line}` }}>
            <Icon size={13} /> {lang === "en" ? (EN_LABELS[k] || label) : label}
          </button>
        ))}
      </div>
      {tab === "fleet" && <AdminFleet drivers={drivers} driver={driver} tripLog={tripLog} lang={lang} />}
      {tab === "kyc" && <AdminKyc drivers={allDrivers} updateDriverKyc={updateDriverKyc} lang={lang} />}
      {tab === "drivers" && <AdminDriverList drivers={allDrivers} toggleBlacklist={toggleBlacklist} lang={lang} />}
      {tab === "settings" && <AdminSettings commissionPct={commissionPct} setCommissionPct={setCommissionPct} bonusPct={bonusPct} setBonusPct={setBonusPct} minWallet={minWallet} setMinWallet={setMinWallet} trialMode={trialMode} setTrialMode={setTrialMode} lang={lang} />}
      {tab === "finance" && <AdminFinance tripLog={tripLog} commissionPct={commissionPct} />}
      {tab === "notify" && <AdminNotify drivers={drivers} />}
      {tab === "alerts" && <AdminAlerts alerts={alerts} withdrawals={withdrawals} approveWithdrawal={approveWithdrawal} lang={lang} />}
    </div>
  );
}

// ---------------- Terms ----------------
function TermsModal({ open, onClose, commissionPct, bonusPct, lang }) {
  if (!open) return null;
  const sections = lang === "en" ? [
    ["1. Load Posting", "Once a load is posted, the pickup-drop details cannot be changed. The final fare will be whatever was agreed in the driver's Accepted Bid."],
    ["2. Bidding System", "The customer is free to accept any one bid among multiple drivers. Once a bid is accepted, it is treated as final."],
    ["3. Cancellation", "If a trip is cancelled after a driver is assigned, the deducted commission will be credited back to the driver's wallet. Repeated cancellations may lead to temporary account suspension."],
    ["4. Driver Responsibility", "The driver is required to submit a valid driving license, vehicle RC and KYC documents. No load will be shown without verification."],
    ["5. Commission", `As soon as the customer accepts a bid, ${commissionPct}% of the agreed fare will be deducted instantly from the driver's wallet as company commission. Of this, ${bonusPct}% will be credited back to the driver's bonus account. Maintaining a minimum balance in the driver's wallet is mandatory.`],
    ["6. Responsibility for Goods", "It is the customer's responsibility to ensure the safety and correct information (material type and weight) of the goods. The company is not responsible for any loss, damage, or delay of goods — this responsibility lies with the concerned driver/transporter."],
    ["7. Platform's Role — Intermediary Only (Most Important)",
      `Saathi Transport is a technology platform that only serves as a medium to connect the customer (load owner) and independent drivers/transporters. The company/admin is not itself a party to any transport of goods, nor a transport service provider. The ${commissionPct}% commission is charged only as a platform usage fee, not for transport service. Every deal between customer and driver (fare, timing, terms) is entirely a private agreement between the two. The company, admin, or platform will not be liable in any way for theft, damage, delay, accident, wrong payment, dispute, or any direct/indirect loss related to the goods. Full responsibility for any such matter rests with the concerned customer and driver themselves.`],
    ["8. Disputes and Jurisdiction", "In case of any complaint or dispute, contact admin via the SOS section — admin can only help as a facilitator, this does not mean admin is responsible for the dispute. In case of any legal dispute, jurisdiction will lie only with Pimpri-Chinchwad / Pune courts."],
  ] : [
    ["1. लोड पोस्टिंग", "लोड पोस्ट करने के बाद पिकअप-ड्रॉप की जानकारी बदली नहीं जा सकती। अंतिम भाड़ा वही होगा जो ड्राइवर की स्वीकृत बोली (Accepted Bid) में तय हुआ हो।"],
    ["2. बिडिंग सिस्टम", "ग्राहक कई ड्राइवरों में से किसी भी एक बोली को स्वीकार करने के लिए स्वतंत्र है। एक बार बोली स्वीकार होने के बाद वह अंतिम मानी जाएगी।"],
    ["3. रद्दीकरण", "ड्राइवर असाइन होने के बाद ट्रिप रद्द होने पर कटा हुआ कमीशन ड्राइवर के वॉलेट में वापस जमा कर दिया जाएगा। बार-बार रद्द करने पर खाता अस्थायी रूप से बंद किया जा सकता है।"],
    ["4. ड्राइवर की जिम्मेदारी", "ड्राइवर को वैध ड्राइविंग लाइसेंस, गाड़ी की RC और KYC दस्तावेज़ जमा करना अनिवार्य है। बिना सत्यापन के कोई भी लोड नहीं दिखाया जाएगा।"],
    ["5. कमीशन", `जैसे ही ग्राहक किसी बोली को स्वीकार करता है, तय भाड़े का ${commissionPct}% कंपनी कमीशन के रूप में ड्राइवर के वॉलेट से तुरंत कट जाएगा। इसमें से ${bonusPct}% ड्राइवर के बोनस अकाउंट में वापस जमा किया जाएगा। ड्राइवर के वॉलेट में न्यूनतम बैलेंस रखना अनिवार्य है।`],
    ["6. सामान की जिम्मेदारी", "सामान की सुरक्षा और सही जानकारी (मटेरियल टाइप व वजन) देना ग्राहक की जिम्मेदारी है। किसी भी प्रकार के माल के नुकसान, टूट-फूट या देरी के लिए कंपनी जिम्मेदार नहीं होगी — यह जिम्मेदारी संबंधित ड्राइवर/ट्रांसपोर्टर की होगी।"],
    ["7. प्लेटफ़ॉर्म की भूमिका — केवल मध्यस्थ (सबसे ज़रूरी)",
      `सार्थी ट्रांसपोर्ट एक टेक्नोलॉजी प्लेटफ़ॉर्म है जो सिर्फ ग्राहक (लोड मालिक) और स्वतंत्र ड्राइवर/ट्रांसपोर्टर को आपस में जोड़ने का माध्यम है। कंपनी/एडमिन किसी भी माल की ढुलाई में स्वयं पक्षकार (party) नहीं है और न ही ट्रांसपोर्ट सेवा प्रदाता है। ${commissionPct}% कमीशन केवल प्लेटफ़ॉर्म इस्तेमाल करने के शुल्क के रूप में लिया जाता है, ट्रांसपोर्ट सेवा के लिए नहीं। ग्राहक और ड्राइवर के बीच हुआ हर सौदा (भाड़ा, समय, शर्तें) पूरी तरह उन दोनों के बीच का निजी अनुबंध है। माल की चोरी, नुकसान, देरी, दुर्घटना, गलत भुगतान, विवाद, या किसी भी प्रकार के प्रत्यक्ष/अप्रत्यक्ष नुकसान के लिए कंपनी, एडमिन या प्लेटफ़ॉर्म किसी भी रूप में उत्तरदायी (liable) नहीं होगा। ऐसे किसी भी मामले की पूरी जिम्मेदारी संबंधित ग्राहक और ड्राइवर की खुद की होगी।`],
    ["8. विवाद और क्षेत्राधिकार", "किसी भी शिकायत या विवाद की स्थिति में SOS सेक्शन से एडमिन से संपर्क करें — एडमिन केवल सहायता (facilitation) के तौर पर मदद कर सकता है, इसका मतलब यह नहीं कि विवाद की जिम्मेदारी एडमिन की है। किसी भी कानूनी विवाद की स्थिति में क्षेत्राधिकार (Jurisdiction) केवल पिंपरी-चिंचवड़ / पुणे कोर्ट का रहेगा।"],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(28,42,58,0.6)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto" style={{ background: C.paper }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold" style={{ color: C.ink }}>{lang === "en" ? "Terms & Conditions" : "नियम व शर्तें (Terms & Conditions)"}</h3>
          <button onClick={onClose} className="text-xs font-bold px-2 py-1 rounded" style={{ color: C.inkSoft }}>✕</button>
        </div>
        <div className="space-y-3">
          {sections.map(([title, text]) => (
            <div key={title}>
              <div className="text-xs font-bold mb-0.5" style={{ color: C.marigoldDeep }}>{title}</div>
              <p className="text-xs leading-relaxed" style={{ color: C.inkSoft }}>{text}</p>
            </div>
          ))}
        </div>
        <button onClick={onClose} className="w-full rounded-lg py-2.5 font-bold text-sm mt-4" style={{ background: C.marigold, color: C.navy }}>{lang === "en" ? "Got it" : "समझ गया"}</button>
      </div>
    </div>
  );
}

function TermsFooterLink({ onOpen, lang }) {
  return (
    <button onClick={onOpen} className="w-full text-center text-[11px] font-semibold py-2" style={{ color: C.inkSoft, background: C.paper, borderTop: `1px solid ${C.line}` }}>
      {lang === "en" ? "Terms & Conditions" : "नियम व शर्तें"}
    </button>
  );
}

// =====================================================================
// ROOT APP
// =====================================================================
export default function App() {
  const [app, setApp] = useState("customer");
  const [role, setRole] = useState(null);
  const [adminAuth, setAdminAuth] = useState(false);
  const logout = () => {
    if (role === "admin") setAdminAuth(false);
    if (role === "customer") setCustomerAuth({ verified: false, mobile: "" });
    if (role === "driver") setDriverAuth({ verified: false, mobile: "" });
    setRole(null);
  };
  const [lang, setLang] = useState("hi");
  const [showTerms, setShowTerms] = useState(false);
  const [vehicleTypes, setVehicleTypes] = useState(DEFAULT_VEHICLES);
  const [customMaterials, setCustomMaterials] = useState({}); // { hiName: {hi, en} }
  const addCustomMaterial = (key, labels) => setCustomMaterials((prev) => ({ ...prev, [key]: labels }));
  const [commissionPct, setCommissionPct] = useState(0);
  const [bonusPct, setBonusPct] = useState(0);
  const [trialMode, setTrialMode] = useState(true);
  const [minWallet, setMinWallet] = useState(500);
  const [customerAuth, setCustomerAuth] = useState({ verified: false, mobile: "" });
  const [customerAddress, setCustomerAddress] = useState({ verified: false, name: "", address: "", area: "", city: "", pincode: "" });
  const [driverAuth, setDriverAuth] = useState({ verified: false, mobile: "" });

  const addVehicleType = (v) => setVehicleTypes((prev) => [...prev, v]);

  const [drivers, setDrivers] = useState([
    { id: "D-1", name: "विकास पवार", vehicleNumber: "MH-14-AB-4521", zone: "पुणे", online: true, kyc: "Approved", wallet: 1200, busy: false, rating: 4.7, vehicleType: "chhota" },
    { id: "D-2", name: "सुनील यादव", vehicleNumber: "DL-01-CD-1187", zone: "दिल्ली", online: true, kyc: "Approved", wallet: 300, busy: false, rating: 4.3, vehicleType: "chhota" },
    { id: "D-3", name: "अजय शिंदे", vehicleNumber: "MH-02-EF-7710", zone: "मुंबई", online: false, kyc: "Pending", wallet: 0, busy: false, rating: 4.5, vehicleType: "pickup" },
  ]);

  const [driver, setDriver] = useState({
    name: "रमेश पटेल", online: true, kyc: "Approved", wallet: 1200, bonus: 0, rating: 4.7,
    docs: { aadhaar: "aadhaar.jpg", dl: "dl.jpg", rc: "rc.jpg", photo: "driver-photo.jpg", insurance: "insurance.jpg" },
    vehicleSpec: {
      type: "chhota",
      photo: { name: "truck.jpg", url: "https://images.unsplash.com/photo-1591768793355-74d04bb6608f?w=600&h=400&fit=crop" },
      capacityKg: 750, length: 7, width: 4.5, height: 4.5, vehicleNumber: "MH14AB4521",
    },
  });

  const [bookings, setBookings] = useState([
    {
      id: "TS-90001", pickup: "MG रोड, पिंपरी", drop: "MIDC, भोसरी", vehicle: "chhota", material: "बॉक्स / कार्टन", weight: "300", distance: 8,
      status: "Completed", bids: [], fare: 850, driverName: "रमेश पटेल", hours: 3, extraHourRate: 100,
      progress: 100, rating: 5,
    },
  ]);
  const [tripLog, setTripLog] = useState([
    {
      id: "TS-90001", pickup: "MG रोड, पिंपरी", drop: "MIDC, भोसरी", vehicle: "chhota", fare: 850, driverName: "रमेश पटेल",
      hours: 3, extraHourRate: 100, status: "Completed", rating: 5,
    },
  ]);
  const [alerts, setAlerts] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const requestWithdrawal = (amount) => {
    if (amount <= 0) return;
    setDriver((d) => ({ ...d, bonus: Math.max(0, (d.bonus || 0) - amount) }));
    setWithdrawals((prev) => [{ id: genId("W"), driverName: driver.name, amount, status: "Pending", time: new Date().toLocaleTimeString("hi-IN", { hour: "2-digit", minute: "2-digit" }) }, ...prev]);
  };
  const approveWithdrawal = (id) => setWithdrawals((prev) => prev.map((w) => w.id === id ? { ...w, status: "Approved" } : w));
  const progressTimer = useRef(null);

  const createLoad = ({ pickup, drop, vehicle, material, weight, distance, scheduledFor }) => {
    const id = genId();
    setBookings((prev) => [
      { id, pickup, drop, vehicle, material, weight, distance, status: "Bidding", bids: [], fare: null, driverName: null, progress: 0, scheduledFor: scheduledFor || null },
      ...prev,
    ]);
    // simulate other drivers on the marketplace placing bids after a short delay
    const vType = vehicleTypes.find((v) => v.key === vehicle);
    const baseRate = vType?.rate || 25;
    const bidders = drivers.filter((d) => d.kyc === "Approved" && !d.blacklisted && d.name !== driver.name && d.vehicleType === vehicle).slice(0, 2);
    bidders.forEach((d, i) => {
      setTimeout(() => {
        const amount = Math.round((distance * baseRate * (0.85 + Math.random() * 0.3)) / 10) * 10;
        const durationHrs = 2 + Math.floor(Math.random() * 5);
        const extraHourRate = Math.round((baseRate * 3 + Math.random() * 50) / 10) * 10;
        setBookings((prev) => prev.map((b) => b.id === id && b.status === "Bidding"
          ? { ...b, bids: [...b.bids, { id: genId("B"), driverName: d.name, amount, hours: durationHrs, extraHourRate, rating: d.rating, distanceKm: 1 + Math.floor(Math.random() * 6) }] }
          : b));
      }, 1200 + i * 1400 + Math.random() * 800);
    });
  };

  const addBid = (bookingId, bid) => {
    setBookings((prev) => prev.map((b) => {
      if (b.id !== bookingId) return b;
      const rest = b.bids.filter((x) => x.driverName !== bid.driverName);
      return { ...b, bids: [...rest, { id: genId("B"), ...bid }] };
    }));
  };

  const acceptBid = (bookingId, bidId) => {
    let acceptedFare = 0, acceptedDriver = "", acceptedHours = 0, acceptedExtraRate = 0;
    const otp = String(Math.floor(1000 + Math.random() * 9000));
    setBookings((prev) => prev.map((b) => {
      if (b.id !== bookingId) return b;
      const bid = b.bids.find((x) => x.id === bidId);
      if (!bid) return b;
      acceptedFare = bid.amount; acceptedDriver = bid.driverName; acceptedHours = bid.hours; acceptedExtraRate = bid.extraHourRate;
      return { ...b, status: "Ongoing", fare: bid.amount, driverName: bid.driverName, hours: bid.hours, extraHourRate: bid.extraHourRate, progress: 0, otp };
    }));
    setTimeout(() => {
      if (!acceptedDriver) return;
      if (acceptedDriver === driver.name) {
        const commissionAmt = acceptedFare * (commissionPct / 100);
        const bonusAmt = acceptedFare * (bonusPct / 100);
        setDriver((d) => ({ ...d, wallet: Math.max(0, d.wallet - commissionAmt), bonus: (d.bonus || 0) + bonusAmt }));
      }
      // Freeze: remove this driver's pending quotes from every other open load — they're now busy on this trip
      setBookings((prev) => prev.map((b) => (b.id !== bookingId && b.status === "Bidding")
        ? { ...b, bids: b.bids.filter((x) => x.driverName !== acceptedDriver) }
        : b));
      setBookings((prev) => {
        const b = prev.find((x) => x.id === bookingId);
        if (b) {
          setTripLog((log) => [{ ...b, driverName: acceptedDriver, fare: acceptedFare, hours: acceptedHours, extraHourRate: acceptedExtraRate, status: "Ongoing" }, ...log]);
        }
        return prev;
      });
    }, 0);
  };

  const cancelBooking = (id) => {
    setBookings((prev) => {
      const b = prev.find((x) => x.id === id);
      if (b && b.status === "Ongoing" && b.driverName === driver.name && b.fare) {
        const refund = b.fare * (commissionPct / 100);
        const bonusReverse = b.fare * (bonusPct / 100);
        setDriver((d) => ({ ...d, wallet: d.wallet + refund, bonus: Math.max(0, (d.bonus || 0) - bonusReverse) }));
      }
      return prev.map((x) => x.id === id ? { ...x, status: "Cancelled" } : x);
    });
    setTripLog((prev) => prev.map((t) => t.id === id ? { ...t, status: "Cancelled" } : t));
  };
  const rateBooking = (id, rating) => {
    setBookings((prev) => prev.map((b) => b.id === id ? { ...b, rating } : b));
    setTripLog((prev) => prev.map((t) => t.id === id ? { ...t, rating } : t));
  };
  const completeBooking = (id, extraCharge = 0) => {
    setBookings((prev) => prev.map((b) => b.id === id ? { ...b, status: "Completed", progress: 100, extraCharge, fare: b.fare + extraCharge } : b));
    setTripLog((prev) => prev.map((t) => t.id === id ? { ...t, status: "Completed", extraCharge, fare: t.fare + extraCharge } : t));
    setDriver((d) => ({ ...d, online: true }));
  };
  const startLoading = (id, adjustMs = 0) => {
    setBookings((prev) => prev.map((b) => {
      if (b.id !== id) return b;
      if (!b.loadingStartedAt) return { ...b, loadingStartedAt: Date.now() };
      return { ...b, loadingStartedAt: b.loadingStartedAt + adjustMs };
    }));
  };
  const updateDriverKyc = (id, status) => {
    if (id === "D-0") { setDriver((d) => ({ ...d, kyc: status })); return; }
    setDrivers((prev) => prev.map((d) => d.id === id ? { ...d, kyc: status } : d));
  };
  const toggleBlacklist = (id) => {
    if (id === "D-0") { setDriver((d) => ({ ...d, blacklisted: !d.blacklisted, online: d.blacklisted ? d.online : false })); return; }
    setDrivers((prev) => prev.map((d) => d.id === id ? { ...d, blacklisted: !d.blacklisted, online: d.blacklisted ? d.online : false } : d));
  };
  const allDrivers = [...drivers, {
    id: "D-0", name: driver.name, vehicleNumber: driver.vehicleSpec?.vehicleNumber || "—", zone: lang === "en" ? "Self (Test Driver)" : "स्वयं (टेस्ट ड्राइवर)",
    online: driver.online, kyc: driver.kyc, wallet: driver.wallet, rating: driver.rating || 0, blacklisted: driver.blacklisted || false, busy: false,
    vehicleSpec: driver.vehicleSpec, docs: driver.docs,
  }];
  const raiseAlert = (role, type, note) => setAlerts((prev) => [{ id: genId("A"), role, type, note, time: new Date().toLocaleTimeString("hi-IN", { hour: "2-digit", minute: "2-digit" }) }, ...prev]);

  useEffect(() => {
    progressTimer.current = setInterval(() => {
      setBookings((prev) => prev.map((b) => b.status === "Ongoing" && b.progress < 95 ? { ...b, progress: b.progress + 5 } : b));
    }, 1200);
    return () => clearInterval(progressTimer.current);
  }, []);

  const isDesktop = app === "admin";

  return (
    <div className="min-h-screen flex justify-center" style={{ background: "#DCD5C4", fontFamily: bodyFont }}>
      <div className={`w-full ${isDesktop ? "max-w-3xl" : "max-w-sm"} min-h-screen flex flex-col`} style={{ background: C.bg }}>
        <div className="px-5 pt-6 pb-4" style={{ background: C.navy }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: C.marigold }}>
              <Truck size={20} color={C.navy} />
            </div>
            <div className="flex-1">
              <div className="text-white font-bold text-lg leading-none">{lang === "en" ? "Saathi Transport" : "सार्थी ट्रांसपोर्ट"}</div>
              <div className="text-[11px]" style={{ color: "#9FB0C2" }}>{lang === "en" ? "All India On-Demand Transport Bidding" : "ऑल इंडिया ऑन-डिमांड ट्रांसपोर्ट बिडिंग"}</div>
            </div>
            <button onClick={() => setLang((l) => (l === "hi" ? "en" : "hi"))}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-bold"
              style={{ background: "#28394D", color: "#fff", border: "1px solid #3A4C61" }}>
              <Globe size={12} /> {lang === "hi" ? "EN" : "हिं"}
            </button>
          </div>
          {role === "admin" && adminAuth ? (
            <div className="flex items-center gap-2">
              <div className="flex flex-1 rounded-full p-1.5" style={{ background: "#28394D" }}>
                <Pill active={app === "customer"} onClick={() => setApp("customer")}>{lang === "en" ? "Customer" : "कस्टमर"}</Pill>
                <Pill active={app === "driver"} onClick={() => setApp("driver")}>{lang === "en" ? "Driver" : "ड्राइवर"}</Pill>
              </div>
              <button onClick={() => setApp("admin")} title={lang === "en" ? "Admin Panel" : "एडमिन पैनल"} className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center"
                style={{ background: app === "admin" ? C.marigold : "#28394D", border: app === "admin" ? "none" : "1px solid #3A4C61" }}>
                <LayoutDashboard size={18} color={app === "admin" ? C.navy : "#B9C6D4"} />
              </button>
            </div>
          ) : null}
          {role === "admin" && adminAuth && (
            <div className="mt-1.5 text-[10px] text-center" style={{ color: "#9FB0C2" }}>
              {lang === "en" ? "Admin can view all apps" : "एडमिन सभी ऐप देख सकता है"}
            </div>
          )}
        </div>

        {role !== null && (role !== "admin" || adminAuth) && app !== "customer" && (
          <div className="px-5 py-2 flex items-center gap-1.5" style={{ background: "#EFE9D8", borderBottom: `1px solid ${C.line}` }}>
            <span className="text-sm">💡</span>
            <span className="text-[11px] font-medium" style={{ color: C.inkSoft }}>
              {app === "driver" && (lang === "en" ? "This screen is for truck/tempo drivers — bid on loads and track earnings." : "यह स्क्रीन ट्रक/टेम्पो ड्राइवरों के लिए है — लोड पर बोली लगाएं और कमाई देखें।")}
              {app === "admin" && (lang === "en" ? "This is your control room — run the whole business from here." : "यह आपका कंट्रोल रूम है — पूरा बिजनेस यहीं से चलाएं।")}
            </span>
          </div>
        )}

        {role === null && (
          <RoleSelect lang={lang} onSelect={(r) => { setRole(r); setApp(r); }} />
        )}

        {role === "admin" && !adminAuth && (
          <AdminLogin lang={lang} onVerified={() => setAdminAuth(true)} />
        )}

        {role !== null && app === "customer" && !customerAuth.verified && (
          <CustomerLogin onVerified={(mobile) => setCustomerAuth({ verified: true, mobile })} />
        )}
        {role !== null && app === "customer" && customerAuth.verified && !customerAddress.verified && (
          <CustomerAddressVerify onVerified={(addr) => setCustomerAddress({ verified: true, ...addr })} />
        )}
        {role !== null && app === "customer" && customerAuth.verified && customerAddress.verified && (
          <CustomerApp bookings={bookings} createLoad={createLoad} driverVehicle={driver.vehicleSpec} vehicleTypes={vehicleTypes}
            cancelBooking={cancelBooking} rateBooking={rateBooking} acceptBid={acceptBid} driverName={driver.name} lang={lang} onLogout={logout} customerProfile={customerAddress} raiseAlert={raiseAlert} />
        )}
        {role !== null && app === "driver" && !driverAuth.verified && (
          <CustomerLogin onVerified={(mobile) => setDriverAuth({ verified: true, mobile })} />
        )}
        {role !== null && app === "driver" && driverAuth.verified && !driver.vehicleSpec && (
          <div className="flex-1 overflow-y-auto">
            <div className="mx-5 mt-4 rounded-lg p-3 flex items-center gap-2" style={{ background: "#FBEBD2" }}>
              <ShieldCheck size={15} color={C.marigoldDeep} />
              <span className="text-xs font-semibold" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Completing KYC is required before opening the home page." : "होम पेज खोलने से पहले KYC पूरी करना ज़रूरी है।"}</span>
            </div>
            <DriverKyc driver={driver} setDriver={setDriver} vehicleTypes={vehicleTypes} addVehicleType={addVehicleType} lang={lang} />
          </div>
        )}
        {role !== null && app === "driver" && driverAuth.verified && driver.vehicleSpec && (
          <DriverApp driver={driver} setDriver={setDriver} bookings={bookings} addBid={addBid} completeBooking={completeBooking} startLoading={startLoading}
            tripLog={tripLog} vehicleTypes={vehicleTypes} addVehicleType={addVehicleType} raiseAlert={raiseAlert}
            commissionPct={commissionPct} minWallet={minWallet} bonusPct={bonusPct} lang={lang} onLogout={logout} withdrawals={withdrawals} requestWithdrawal={requestWithdrawal} />
        )}
        {role !== null && app === "admin" && adminAuth && (
          <div className="flex-1 overflow-y-auto">
            <AdminPanel drivers={drivers} allDrivers={allDrivers} driver={driver} updateDriverKyc={updateDriverKyc} tripLog={tripLog} alerts={alerts} toggleBlacklist={toggleBlacklist}
              commissionPct={commissionPct} setCommissionPct={setCommissionPct} minWallet={minWallet} setMinWallet={setMinWallet}
              bonusPct={bonusPct} setBonusPct={setBonusPct} lang={lang} onLogout={logout} trialMode={trialMode} setTrialMode={setTrialMode} withdrawals={withdrawals} approveWithdrawal={approveWithdrawal} />
          </div>
        )}

        <TermsFooterLink onOpen={() => setShowTerms(true)} lang={lang} />
      </div>
      <TermsModal open={showTerms} onClose={() => setShowTerms(false)} commissionPct={commissionPct} bonusPct={bonusPct} lang={lang} />
    </div>
  );
}
