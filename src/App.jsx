import React, { useState, useEffect, useRef } from "react";
import {
  Truck, MapPin, Package, Wallet, UserCircle2, ShieldCheck, Camera, Clock3,
  Phone, MessageCircle, CheckCircle2, XCircle, Bell, Navigation, Activity,
  Users, BarChart3, Settings2, Download, IndianRupee, LayoutDashboard,
  ClipboardList, MapPinned, Siren, Mic, Globe, Menu, Home, ChevronLeft, Eye,
} from "lucide-react";
import {
  firestoreReady, subscribeCollection, subscribeDoc, getOrCreateDoc, getDocOnce, createDoc, replaceDoc, patchDoc, seedIfEmpty,
} from "./firestoreStore";
import { increment, arrayUnion } from "firebase/firestore";
import { GoogleMap, MarkerF, PolylineF, Autocomplete } from "@react-google-maps/api";
import { useGoogleMaps } from "./googleMapsContext.jsx";
import { RecaptchaVerifier, signInWithPhoneNumber, signOut } from "firebase/auth";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { customerFirebaseAuth, driverFirebaseAuth, storage } from "./firebaseClient";

// ---------------- design tokens ----------------
// Oxblood & mustard theme — chosen specifically to not read as Porter
// (teal), BlackBuck/Rivigo (bright orange-red), or Ola/Uber (black+yellow).
// Token names (marigold, navy, etc.) are kept as-is even though they no
// longer mean gold/black — every screen already references these by name,
// so this is a value-only swap.
const C = {
  bg: "#F6EFE6",
  paper: "#FFFFFF",
  ink: "#2B1512",
  inkSoft: "#7A5C50",
  marigold: "#E3A93C",
  marigoldDeep: "#A8721C",
  safety: "#C1442C",
  success: "#3F7A54",
  line: "#E6DDD1",
  navy: "#5C1F1F",
  pimpri: "#A8721C",
  chinchwad: "#3F7A54",
};
const bodyFont = "'Noto Sans','Segoe UI',system-ui,sans-serif";
const monoFont = "'JetBrains Mono','Courier New',monospace";

// Brand mark — an oxblood-and-mustard hexagon holding a truck, matching the
// SARTHI logo. Built as CSS/SVG (not an image file) so it stays crisp at any
// size and recolors automatically with the theme.
function Logo({ size = 64, showText = true, textColor }) {
  return (
    <div className="flex flex-col items-center">
      <div
        style={{
          width: size,
          height: size,
          clipPath: "polygon(25% 4%, 75% 4%, 100% 50%, 75% 96%, 25% 96%, 0% 50%)",
          background: `linear-gradient(135deg, ${C.marigold}, ${C.marigoldDeep})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Truck size={Math.round(size * 0.5)} color="#fff" strokeWidth={2.2} />
      </div>
      {showText && (
        <div className="mt-1.5 font-extrabold" style={{ color: textColor || C.marigoldDeep, fontSize: Math.round(size * 0.22), letterSpacing: 1.5 }}>
          SARTHI
        </div>
      )}
    </div>
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
// Vehicle types added via "+ Add new type" only have one name (like custom
// materials), so English falls back to the same string when no labelEn exists.
const vehicleLabel = (v, lang) => (v ? (lang === "en" ? (v.labelEn || v.label) : v.label) : "");
const vehicleCapacity = (v, lang) => (v ? (lang === "en" ? (v.capacityEn || v.capacity) : v.capacity) : "");
const MATERIALS = ["लोहा", "प्लास्टिक", "बॉक्स / कार्टन", "सीमेंट / बालू", "अन्य"];
const LIGHT_BULKY_MATERIALS = ["प्लास्टिक", "बॉक्स / कार्टन"];
const BIG_VEHICLE_KEYS = ["pickup", "truck"];
const MATERIAL_LABELS_EN = { "लोहा": "Iron", "प्लास्टिक": "Plastic", "बॉक्स / कार्टन": "Box / Carton", "सीमेंट / बालू": "Cement / Sand", "अन्य": "Other" };
const materialLabel = (m, lang, customMap = {}) => {
  if (customMap[m]) return lang === "en" ? (customMap[m].en || customMap[m].hi) : (customMap[m].hi || customMap[m].en);
  return (lang === "en" && MATERIAL_LABELS_EN[m]) ? MATERIAL_LABELS_EN[m] : m;
};
const serviceTypeLabel = (t, lang) => {
  if (t === "outstation") return lang === "en" ? "Outstation" : "आउटस्टेशन";
  return lang === "en" ? "Within City" : "शहर के अंदर";
};
const ALERT_TYPE_LABELS_EN = { "पुलिस सहायता": "Police Help", "इमरजेंसी कॉल": "Emergency Call", "व्हाट्सएप सपोर्ट": "WhatsApp Support", "शिकायत": "Complaint" };
const alertTypeLabel = (t, lang) => (lang === "en" && ALERT_TYPE_LABELS_EN[t]) ? ALERT_TYPE_LABELS_EN[t] : t;
const ADD_MATERIAL = "__add_new__";

const CITY_COLORS = ["#A8721C", "#3F7D4F", "#B87A12", "#E85D2F", "#7A5CB8", "#1C7A7A"];

const EN_LABELS = {
  book: "Book Now", rides: "My Rides", home: "Home", wallet: "Wallet", history: "History",
  kyc: "KYC", sos: "SOS", fleet: "Live Dashboard", drivers: "Drivers", settings: "Settings",
  finance: "Reports", notify: "Notify", alerts: "Alerts", customers: "Customers",
};

function genId(p = "TS") { return p + "-" + Math.floor(10000 + Math.random() * 89999); }
function hashPos(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 997;
  return { x: 15 + (h % 70), y: 15 + ((h * 7) % 70) };
}
function fmt(n) { return "₹" + Math.round(n).toLocaleString("en-IN"); }
function stars(n) { return "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n)); }

// Time-of-day greeting shown at the top of the Customer/Driver/Admin home
// screens — computed fresh on every render, so it naturally flips from
// Morning to Afternoon to Evening as the session stays open across the day.
function greetingWord(lang) {
  const hour = new Date().getHours();
  if (lang === "en") return hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  return hour < 12 ? "सुप्रभात" : hour < 17 ? "शुभ दोपहर" : "शुभ संध्या";
}
function Greeting({ name, lang }) {
  return (
    <div className="px-5 pt-2 pb-1">
      <div className="text-sm font-bold" style={{ color: C.ink }}>
        {greetingWord(lang)}{name ? `, ${name}` : ""} 👋
      </div>
    </div>
  );
}

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

const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_DAYS = 30;

// ---------------- shared: mock map ----------------
function MockMap({ pickup, drop, progress, zoneColor, height = 150, lang = "hi" }) {
  const p1 = hashPos(pickup || "pickup");
  const p2 = hashPos((drop || "drop") + "x");
  const tx = p1.x + (p2.x - p1.x) * (progress ?? 0) / 100;
  const ty = p1.y + (p2.y - p1.y) * (progress ?? 0) / 100;
  return (
    <div className="relative rounded-lg overflow-hidden" style={{ height, background: "#EDE0CC", border: `1px solid ${C.line}` }}>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        {Array.from({ length: 6 }).map((_, i) => (
          <line key={"h" + i} x1="0" y1={i * 18} x2="100" y2={i * 18} stroke="#D9C8A8" strokeWidth="0.4" />
        ))}
        {Array.from({ length: 6 }).map((_, i) => (
          <line key={"v" + i} x1={i * 18} y1="0" x2={i * 18} y2="100" stroke="#D9C8A8" strokeWidth="0.4" />
        ))}
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={zoneColor || C.marigoldDeep} strokeWidth="1" strokeDasharray="2,2" />
        <circle cx={p1.x} cy={p1.y} r="2.2" fill={C.marigoldDeep} />
        <circle cx={p2.x} cy={p2.y} r="2.2" fill={C.safety} />
        {progress !== undefined && (
          <circle cx={tx} cy={ty} r="2.6" fill={C.navy} stroke="#fff" strokeWidth="0.6" />
        )}
      </svg>
      <div className="absolute bottom-1.5 left-2 text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: C.paper, color: C.ink }}>
        📍 {lang === "en" ? "Pickup" : "पिकअप"}
      </div>
      <div className="absolute top-1.5 right-2 text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: C.paper, color: C.ink }}>
        🏁 {lang === "en" ? "Drop" : "ड्रॉप"}
      </div>
    </div>
  );
}

// Real Google Maps live-tracking view — pickup/drop pins at real coordinates
// plus the driver's live GPS marker. Falls back to the fake MockMap when
// Google Maps isn't configured/loaded yet, or this booking has no real
// coordinates (e.g. it was posted before Maps was set up).
function LiveTrackingMap({ pickup, drop, pickupLat, pickupLng, dropLat, dropLng, driverLocation, progress, zoneColor, height = 150, lang = "hi" }) {
  const { isLoaded, hasKey } = useGoogleMaps();
  const hasCoords = pickupLat != null && pickupLng != null && dropLat != null && dropLng != null;
  if (!hasKey || !isLoaded || !hasCoords) {
    return <MockMap pickup={pickup} drop={drop} progress={progress} zoneColor={zoneColor} height={height} lang={lang} />;
  }
  const pickupPos = { lat: pickupLat, lng: pickupLng };
  const dropPos = { lat: dropLat, lng: dropLng };
  const driverPos = driverLocation?.lat != null && driverLocation?.lng != null ? { lat: driverLocation.lat, lng: driverLocation.lng } : null;
  return (
    <div className="relative rounded-lg overflow-hidden" style={{ height, border: `1px solid ${C.line}` }}>
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        onLoad={(map) => {
          const bounds = new window.google.maps.LatLngBounds();
          bounds.extend(pickupPos);
          bounds.extend(dropPos);
          if (driverPos) bounds.extend(driverPos);
          map.fitBounds(bounds, 28);
        }}
        options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false, zoomControl: false, gestureHandling: "greedy" }}
      >
        <MarkerF position={pickupPos} label={{ text: "P", color: "#fff", fontSize: "10px", fontWeight: "bold" }} />
        <MarkerF position={dropPos} label={{ text: "D", color: "#fff", fontSize: "10px", fontWeight: "bold" }} />
        <PolylineF path={[pickupPos, dropPos]} options={{ strokeColor: zoneColor || C.marigoldDeep, strokeOpacity: 0.7, strokeWeight: 3 }} />
        {driverPos && (
          <MarkerF
            position={driverPos}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: C.navy,
              fillOpacity: 1,
              strokeColor: "#fff",
              strokeWeight: 2,
            }}
          />
        )}
      </GoogleMap>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(42,33,28,0.7)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-2xl p-4" style={{ background: C.bg }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold" style={{ color: C.ink }}>{lang === "en" ? "Tap to mark location" : "जगह चुनने के लिए टैप करें"}</span>
          <button onClick={onClose} className="text-xs font-bold px-2 py-1" style={{ color: C.inkSoft }}>✕</button>
        </div>

        <div className="relative rounded-lg overflow-hidden mb-3" style={{ height: H, background: "#EDE0CC", cursor: "crosshair" }} onClick={handleTap}>
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
          style={{ background: pin && !loading ? C.marigoldDeep : C.line, color: pin && !loading ? "#fff" : "#9AA3B0" }}>
          {lang === "en" ? "Use this location" : "यह जगह इस्तेमाल करें"}
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
      setAddress(status === "OK" && results?.[0] ? results[0].formatted_address : `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
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
    setAddress(place.formatted_address || place.name || "");
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
          <span className="text-sm font-bold" style={{ color: C.ink }}>{lang === "en" ? "Search or tap to mark location" : "जगह खोजें या टैप करके चुनें"}</span>
          <button onClick={onClose} className="text-xs font-bold px-2 py-1" style={{ color: C.inkSoft }}>✕</button>
        </div>

        <Autocomplete onLoad={(a) => (autocompleteRef.current = a)} onPlaceChanged={onPlaceChanged}>
          <input
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none mb-2"
            style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.ink }}
            placeholder={lang === "en" ? "Search an address" : "पता खोजें"}
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

        <button type="button" onClick={useMyLocation} className="text-xs font-semibold mb-3 flex items-center gap-1" style={{ color: "#A8721C" }}>
          <Navigation size={12} /> {lang === "en" ? "Use my current location" : "मेरी मौजूदा जगह इस्तेमाल करें"}
        </button>

        <div className="rounded-lg p-3 mb-3" style={{ background: C.paper, minHeight: 50 }}>
          {loading ? (
            <span className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Finding address..." : "पता ढूंढा जा रहा है..."}</span>
          ) : marker ? (
            <span className="text-xs" style={{ color: C.ink }}>{address}</span>
          ) : (
            <span className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Search above or tap anywhere on the map to drop a pin" : "ऊपर खोजें या मैप पर कहीं भी टैप करके पिन लगाएं"}</span>
          )}
        </div>

        <button onClick={() => marker && onConfirm(address, marker.lat, marker.lng)} disabled={!marker || loading}
          className="w-full rounded-lg py-3 font-bold text-sm"
          style={{ background: marker && !loading ? C.marigoldDeep : C.line, color: marker && !loading ? "#fff" : "#9AA3B0" }}>
          {lang === "en" ? "Use this location" : "यह जगह इस्तेमाल करें"}
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

function MicButton({ onResult, lang = "hi-IN", size = 8, iconSize = 14 }) {
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
      className="shrink-0 rounded-full flex items-center justify-center"
      style={{ background: listening ? C.safety : "#F5E6C8", width: size * 4, height: size * 4 }}>
      <Mic size={iconSize} color={listening ? "#fff" : "#A8721C"} />
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
          className="w-full rounded-lg py-3 font-bold text-sm flex items-center justify-center gap-2 text-white" style={{ background: "#2A211C" }}>
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
      <div className="rounded-xl p-4 mt-5 shadow-sm" style={{ border: `1px solid ${C.line}`, background: C.paper }}>
        <div className="text-xs font-bold mb-2" style={{ color: C.ink }}>{lang === "en" ? "File a Complaint" : "शिकायत दर्ज करें"}</div>
        <p className="text-[11px] mb-2" style={{ color: C.inkSoft }}>
          {role === "driver"
            ? (lang === "en" ? "Send admin details of any issue related to the customer or the goods." : "ग्राहक या सामान से जुड़ी किसी समस्या की जानकारी एडमिन को भेजें।")
            : (lang === "en" ? "Send admin details of any issue related to the driver or your booking." : "ड्राइवर या आपकी बुकिंग से जुड़ी किसी समस्या की जानकारी एडमिन को भेजें।")}
        </p>
        <textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} rows={3}
          placeholder={role === "driver"
            ? (lang === "en" ? "e.g. Customer gave wrong address, wrong weight told..." : "जैसे: ग्राहक ने गलत पता दिया, सामान का वजन गलत बताया...")
            : (lang === "en" ? "e.g. Driver asked for extra money, vehicle was different than promised..." : "जैसे: ड्राइवर ने अतिरिक्त पैसे मांगे, गाड़ी वादे से अलग थी...")}
          className="w-full rounded-lg px-3 py-2 text-xs outline-none mb-2" style={{ border: `1px solid ${C.line}`, color: C.ink }} />
        {sent && <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold" style={{ color: C.success }}><CheckCircle2 size={13} /> {lang === "en" ? "Complaint sent to admin" : "शिकायत एडमिन को भेज दी गई"}</div>}
        <button onClick={submitComplaint} disabled={!complaint.trim()} className="w-full rounded-lg py-2.5 font-bold text-sm"
          style={{ background: complaint.trim() ? C.navy : C.line, color: complaint.trim() ? "#fff" : "#9AA3B0" }}>{lang === "en" ? "Send Complaint" : "शिकायत भेजें"}</button>
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
function RoleSelect({ onSelect, lang, customerVerified, driverVerified, adminVerified, onLogoutRole, adminEntry, lockedRole }) {
  const anyVerified = customerVerified || driverVerified || adminVerified;
  // Once a device has verified as Customer or Driver, it's locked to that
  // choice forever — the other option never shows again, even after logout.
  const showCustomer = lockedRole ? lockedRole === "customer" : true;
  const showDriver = lockedRole ? lockedRole === "driver" : true;
  // Admin Login is invisible to regular Customer/Driver users — it only
  // shows up when the page was opened with the secret ?admin=1 link, or
  // once already signed in as admin (so the logout link stays reachable).
  const showAdmin = (adminEntry && !anyVerified) || adminVerified;
  const logoutLink = (role, label) => (
    <button onClick={() => onLogoutRole(role)} className="w-full text-center text-[10px] font-semibold mt-1.5" style={{ color: C.inkSoft }}>
      {lang === "en" ? `Not you? Logout of ${label}` : `आप नहीं हैं? ${label} से लॉगआउट करें`}
    </button>
  );
  return (
    <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-8 py-10">
      <div className="mb-4">
        <Logo size={88} />
      </div>
      <p className="text-xs text-center mb-8" style={{ color: C.inkSoft }}>
        {anyVerified
          ? (lang === "en" ? "Continue where you left off, or logout to switch" : "जहां से छोड़ा था वहां से जारी रखें, या स्विच करने के लिए लॉगआउट करें")
          : (lang === "en" ? "Choose which app you want to open" : "आप कौन सा ऐप खोलना चाहते हैं?")}
      </p>

      <div className="w-full space-y-3">
        {showCustomer && (
          <div>
            <button onClick={() => onSelect("customer")} className="w-full rounded-xl p-4 flex items-center gap-3 text-left" style={{ background: C.marigold }}>
              <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: C.navy }}>
                <Package size={20} color="#fff" />
              </div>
              <div>
                <div className="text-sm font-bold" style={{ color: C.navy }}>{lang === "en" ? "Customer" : "कस्टमर"}</div>
                <div className="text-[11px]" style={{ color: "#3D1B17" }}>{lang === "en" ? "Post a load & book a truck" : "लोड पोस्ट करें और ट्रक बुक करें"}</div>
              </div>
            </button>
            {customerVerified && logoutLink("customer", lang === "en" ? "Customer" : "कस्टमर")}
          </div>
        )}

        {showDriver && (
          <div>
            <button onClick={() => onSelect("driver")} className="w-full rounded-xl p-4 flex items-center gap-3 text-left" style={{ background: C.navy }}>
              <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: C.marigold }}>
                <Truck size={20} color={C.navy} />
              </div>
              <div>
                <div className="text-sm font-bold text-white">{lang === "en" ? "Driver" : "ड्राइवर"}</div>
                <div className="text-[11px]" style={{ color: "#D9C4B0" }}>{lang === "en" ? "Bid on loads & earn" : "लोड पर बोली लगाएं और कमाएं"}</div>
              </div>
            </button>
            {driverVerified && logoutLink("driver", lang === "en" ? "Driver" : "ड्राइवर")}
          </div>
        )}
      </div>

      {showAdmin && (
        <button onClick={() => onSelect("admin")} className="mt-8 text-[11px] font-semibold" style={{ color: C.inkSoft }}>
          {lang === "en" ? "Admin Login" : "एडमिन लॉगिन"}
        </button>
      )}
      {adminVerified && logoutLink("admin", lang === "en" ? "Admin" : "एडमिन")}
    </div>
  );
}

// =====================================================================
// ADMIN LOGIN — password protected, separate from customer/driver
// =====================================================================
function AdminLogin({ onVerified, lang, onBack }) {
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
    <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-8 py-10 relative">
      {onBack && (
        <button onClick={onBack} className="absolute top-4 left-4 flex items-center gap-1 pl-2 pr-3 py-1.5 rounded-full text-xs font-bold" style={{ background: "#F5E6C8", color: C.marigoldDeep }}>
          <ChevronLeft size={16} strokeWidth={2.75} /> {lang === "en" ? "Back" : "वापस"}
        </button>
      )}
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
          style={{ background: email.trim() && password.trim() ? C.marigold : C.line, color: email.trim() && password.trim() ? C.navy : "#9AA3B0" }}>
          {lang === "en" ? "Login" : "लॉगिन करें"}
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
function CustomerOnboarding({ lang = "hi", authInstance, recaptchaContainerId, verified, verifiedMobile, hasProfile, checking, onOtpVerified, onLogout, onComplete }) {
  // Step 2 fields — profile/address, asked only once, only if needed.
  // Persisted to localStorage so refreshing mid-registration (a slow
  // connection, an accidental reload) doesn't force retyping everything —
  // cleared once submitProfile actually completes.
  const [name, setName] = usePersistedState("sarthi_customerReg_name", "");
  const [email, setEmail] = usePersistedState("sarthi_customerReg_email", "");
  const [photo, setPhoto] = usePersistedPhoto("sarthi_customerReg_photo", null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [address, setAddress] = usePersistedState("sarthi_customerReg_address", "");
  const [area, setArea] = usePersistedState("sarthi_customerReg_area", "");
  const [city, setCity] = usePersistedState("sarthi_customerReg_city", "");
  const [state, setState] = usePersistedState("sarthi_customerReg_state", "");
  const [pincode, setPincode] = usePersistedState("sarthi_customerReg_pincode", "");

  // Step 1 — mobile/OTP verification.
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [otpStage, setOtpStage] = useState("mobile");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const confirmationRef = useRef(null);
  const recaptchaRef = useRef(null);
  const otpInputCls = "w-full rounded-lg px-3 py-3 text-sm outline-none text-center";
  const otpInputStyle = { background: C.paper, border: `1px solid ${C.line}`, color: C.ink, fontFamily: monoFont, letterSpacing: 2 };
  const fieldCls = "w-full rounded-lg px-3 py-2.5 text-sm outline-none";
  const fieldStyle = { background: C.paper, border: `1px solid ${C.line}`, color: C.ink };

  // A still-valid Firebase session on this device — skip straight past
  // Step 1. Whether a profile exists for that number is checked separately
  // and live from Firestore, so there's no stale-cache risk here.
  useEffect(() => {
    const existing = authInstance?.currentUser?.phoneNumber;
    if (existing) onOtpVerified(existing.replace("+91", ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const detailsValid = name.trim().length >= 3 && address.trim().split(/\s+/).length >= 2 && area.trim() && city.trim() && state.trim() && pincode.length === 6;

  const getRecaptcha = () => {
    if (!recaptchaRef.current) {
      recaptchaRef.current = new RecaptchaVerifier(authInstance, recaptchaContainerId, { size: "invisible" });
    }
    return recaptchaRef.current;
  };

  const sendOtp = async () => {
    if (mobile.length !== 10 || !authInstance || sending) return;
    setSending(true);
    setError("");
    try {
      confirmationRef.current = await signInWithPhoneNumber(authInstance, "+91" + mobile, getRecaptcha());
      setOtp("");
      setOtpStage("otp");
    } catch (e) {
      console.error(e);
      try { recaptchaRef.current?.clear(); } catch { /* already gone */ }
      recaptchaRef.current = null;
      setError(
        e?.code === "auth/too-many-requests"
          ? (lang === "en" ? "Too many attempts — please wait a while before trying again." : "बहुत ज़्यादा कोशिशें — कृपया थोड़ी देर बाद फिर कोशिश करें।")
          : (lang === "en" ? "Couldn't send OTP — check the number and try again." : "OTP नहीं भेज सका — नंबर जांचें और फिर कोशिश करें।")
      );
    }
    setSending(false);
  };

  const verifyOtp = async () => {
    if (otp.length !== 6 || !confirmationRef.current || sending) return;
    setSending(true);
    setError("");
    try {
      await confirmationRef.current.confirm(otp);
      onOtpVerified(mobile);
    } catch (e) {
      console.error(e);
      setError(lang === "en" ? "Incorrect OTP — try again." : "गलत OTP — फिर कोशिश करें।");
      setSending(false);
      return;
    }
    setSending(false);
  };

  const submitProfile = () => {
    if (!detailsValid) return;
    const ownMobile = verifiedMobile || mobile;
    const ref = new URLSearchParams(window.location.search).get("ref");
    const referredBy = ref && ref !== ownMobile ? ref : null;
    onComplete({ name, email: email.trim() || null, photo, address, area, city, state, pincode, referredBy, referralCredited: false, referralBalance: 0, referralEntries: [] });
    // Submitted for real — clear the draft so it can't leak into a future
    // registration attempt on this same device (e.g. a different customer).
    setName(""); setEmail(""); setPhoto(null); setAddress(""); setArea(""); setCity(""); setState(""); setPincode("");
  };

  const backButton = (
    <button onClick={onLogout} className="flex items-center gap-1 mb-4 pl-2 pr-3 py-1.5 rounded-full text-xs font-bold" style={{ background: "#F5E6C8", color: C.marigoldDeep }}>
      <ChevronLeft size={16} strokeWidth={2.75} /> {lang === "en" ? "Back" : "वापस"}
    </button>
  );

  if (verified && checking) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-5">
        {backButton}
        <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Checking your profile..." : "आपकी प्रोफाइल जांची जा रही है..."}</p>
      </div>
    );
  }

  if (verified && hasProfile) {
    // Root is about to swap to CustomerApp — never show anything else here.
    return <div className="flex-1 flex items-center justify-center"><p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Loading..." : "लोड हो रहा है..."}</p></div>;
  }

  if (!verified) {
    // STEP 1 — mobile + OTP only, nothing else to fill in yet.
    return (
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-8 py-10 relative">
        <button onClick={onLogout} className="absolute top-4 left-4 flex items-center gap-1 pl-2 pr-3 py-1.5 rounded-full text-xs font-bold" style={{ background: "#F5E6C8", color: C.marigoldDeep }}>
          <ChevronLeft size={16} strokeWidth={2.75} /> {lang === "en" ? "Back" : "वापस"}
        </button>
        <div className="mb-4"><Logo size={64} showText={false} /></div>
        <h2 className="text-lg font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "Customer Login" : "कस्टमर लॉगिन"}</h2>
        <p className="text-xs text-center mb-6" style={{ color: C.inkSoft }}>{lang === "en" ? "Verify your mobile number to get started." : "शुरू करने के लिए अपना मोबाइल नंबर वेरीफाई करें।"}</p>
        <div className="w-full">
          {otpStage === "mobile" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg px-3" style={{ border: `1px solid ${C.line}`, background: C.paper }}>
                <Phone size={16} color={C.inkSoft} />
                <span className="text-sm" style={{ color: C.inkSoft, fontFamily: monoFont }}>+91</span>
                <input className="flex-1 py-3 text-sm outline-none" style={{ color: C.ink, fontFamily: monoFont }} placeholder={lang === "en" ? "10-digit mobile number" : "10 अंकों का मोबाइल नंबर"}
                  value={mobile} onChange={(e) => { setMobile(e.target.value.replace(/\D/g, "").slice(0, 10)); setError(""); }} />
              </div>
              {error && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{error}</div>}
              <button onClick={sendOtp} disabled={mobile.length !== 10 || sending}
                className="w-full rounded-lg py-3 font-bold text-sm" style={{ background: mobile.length === 10 && !sending ? C.marigold : C.line, color: mobile.length === 10 && !sending ? C.navy : "#9AA3B0" }}>
                {sending ? (lang === "en" ? "Sending..." : "भेजा जा रहा है...") : (lang === "en" ? "Send OTP" : "OTP भेजें")}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[11px]" style={{ color: C.inkSoft }}>{lang === "en" ? `OTP sent to ${mobile}` : `${mobile} पर OTP भेजा गया`}</p>
              <div className="flex items-center gap-2 rounded-lg px-3" style={{ border: `1px solid ${C.line}`, background: C.paper }}>
                <ShieldCheck size={16} color={C.inkSoft} />
                <input className={otpInputCls} style={{ ...otpInputStyle, border: "none" }} placeholder="• • • • • •" value={otp}
                  onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} />
              </div>
              {error && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{error}</div>}
              <button onClick={verifyOtp} disabled={otp.length !== 6 || sending}
                className="w-full rounded-lg py-3 font-bold text-sm" style={{ background: otp.length === 6 && !sending ? C.marigold : C.line, color: otp.length === 6 && !sending ? C.navy : "#9AA3B0" }}>
                {sending ? (lang === "en" ? "Verifying..." : "वेरीफाई हो रहा है...") : (lang === "en" ? "Verify" : "वेरीफाई करें")}
              </button>
              <div className="flex items-center justify-between">
                <button onClick={() => { setOtpStage("mobile"); setOtp(""); setError(""); }} className="text-[11px] font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "Change number" : "नंबर बदलें"}</button>
                <button onClick={sendOtp} disabled={sending} className="text-[11px] font-semibold" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Resend OTP" : "OTP दोबारा भेजें"}</button>
              </div>
            </div>
          )}
        </div>
        <div id={recaptchaContainerId} />
      </div>
    );
  }

  // STEP 2 — verified, and this number has no saved profile yet: fill it
  // in once.
  return (
    <div className="flex-1 overflow-y-auto px-6 py-8 relative">
      {backButton}
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: C.marigold }}>
        <MapPin size={22} color={C.navy} />
      </div>
      <h2 className="text-lg font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "Customer Registration" : "कस्टमर रजिस्ट्रेशन"}</h2>
      <p className="text-xs mb-5" style={{ color: C.inkSoft }}>{lang === "en" ? "Just this once — fill in your details to finish setting up." : "बस एक बार — सेटअप पूरा करने के लिए अपनी जानकारी भरें।"}</p>

      <div className="space-y-3">
        <div className="flex justify-center">
          <PhotoPicker label={lang === "en" ? "Profile Photo" : "प्रोफाइल फोटो"} lang={lang} onSelect={(f) => { setPhotoUploading(true); uploadPhoto(f, `customers/${verifiedMobile || mobile}/profile.jpg`).then((p) => { setPhoto(p); setPhotoUploading(false); }); }}>
            <div className="w-20 h-20 rounded-full flex items-center justify-center cursor-pointer overflow-hidden" style={{ background: "#F5E6C8", border: `2px dashed ${C.marigoldDeep}` }}>
              {photoUploading
                ? <p className="text-[9px] text-center px-1" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Uploading..." : "अपलोड हो रहा है..."}</p>
                : <SafeImage src={photo?.url} alt="" className="w-full h-full object-cover" fallback={<Camera size={22} color={C.marigoldDeep} />} />}
            </div>
          </PhotoPicker>
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Full Name" : "पूरा नाम"}</label>
          <input className={fieldCls} style={fieldStyle} placeholder={lang === "en" ? "e.g. Ramesh Patel" : "जैसे: रमेश पटेल"} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Email (optional)" : "ईमेल (वैकल्पिक)"}</label>
          <input type="email" className={fieldCls} style={fieldStyle} placeholder={lang === "en" ? "e.g. ramesh@email.com" : "जैसे: ramesh@email.com"} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Full Address (House/Shop No., Street)" : "पूरा पता (मकान/दुकान नं., गली)"}</label>
          <input className={fieldCls} style={fieldStyle} placeholder={lang === "en" ? "e.g. Shop No. 12, MG Road" : "जैसे: दुकान नं. 12, MG रोड"} value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Area" : "एरिया"}</label>
            <input className={fieldCls} style={fieldStyle} placeholder={lang === "en" ? "e.g. Pimpri" : "जैसे: पिंपरी"} value={area} onChange={(e) => setArea(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "City" : "शहर"}</label>
            <input className={fieldCls} style={fieldStyle} placeholder={lang === "en" ? "e.g. Pune" : "जैसे: पुणे"} value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "State" : "राज्य"}</label>
            <input className={fieldCls} style={fieldStyle} placeholder={lang === "en" ? "e.g. Maharashtra" : "जैसे: महाराष्ट्र"} value={state} onChange={(e) => setState(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Pincode" : "पिनकोड"}</label>
            <input className={fieldCls} style={{ ...fieldStyle, fontFamily: monoFont }} placeholder={lang === "en" ? "6-digit pincode" : "6 अंकों का पिनकोड"} value={pincode}
              onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          </div>
        </div>
      </div>

      {!detailsValid && <div className="text-[11px] font-semibold mt-3" style={{ color: C.safety }}>{lang === "en" ? "Fill in all the details above (name, address, area, city, state, 6-digit pincode) to continue" : "आगे बढ़ने के लिए ऊपर सारी जानकारी भरें (नाम, पता, एरिया, शहर, राज्य, 6 अंकों का पिनकोड)"}</div>}
      <button onClick={submitProfile} disabled={!detailsValid || photoUploading} className="w-full rounded-lg py-3 font-bold text-sm mt-3"
        style={{ background: detailsValid && !photoUploading ? C.marigold : C.line, color: detailsValid && !photoUploading ? C.navy : "#9AA3B0" }}>
        {photoUploading ? (lang === "en" ? "Uploading photo..." : "फोटो अपलोड हो रही है...") : (lang === "en" ? "Complete Registration" : "रजिस्ट्रेशन पूरा करें")}
      </button>
      <div id={recaptchaContainerId} />
    </div>
  );
}

// =====================================================================
// DRIVER REGISTRATION — one continuous page: phone OTP, then straight
// into KYC submission, instead of two separate screens.
// =====================================================================
function DriverOnboarding({ lang = "hi", authInstance, recaptchaContainerId, verified, onOtpVerified, onLogout, driver, setDriver, vehicleTypes, addVehicleType }) {
  // Personal details — filled in first, on this page (Step 1 of 2).
  // Persisted to localStorage so a refresh mid-fill doesn't wipe it —
  // cleared once the details actually attach to the driver doc below.
  const [name, setName] = usePersistedState("sarthi_driverReg_name", "");
  const [address, setAddress] = usePersistedState("sarthi_driverReg_address", "");
  const [city, setCity] = usePersistedState("sarthi_driverReg_city", "");
  const [state, setState] = usePersistedState("sarthi_driverReg_state", "");
  const [pincode, setPincode] = usePersistedState("sarthi_driverReg_pincode", "");
  const infoAppliedRef = useRef(false);

  // Mobile/OTP verification — lives at the bottom of this same page.
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [otpStage, setOtpStage] = useState(authInstance?.currentUser ? "checking" : "mobile");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const confirmationRef = useRef(null);
  const recaptchaRef = useRef(null);
  const otpInputCls = "w-full rounded-lg px-3 py-3 text-sm outline-none text-center";
  const otpInputStyle = { background: C.paper, border: `1px solid ${C.line}`, color: C.ink, fontFamily: monoFont, letterSpacing: 2 };
  const fieldCls = "w-full rounded-lg px-3 py-2.5 text-sm outline-none";
  const fieldStyle = { background: C.paper, border: `1px solid ${C.line}`, color: C.ink };

  useEffect(() => {
    const existing = authInstance?.currentUser?.phoneNumber;
    if (existing) onOtpVerified(existing.replace("+91", ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once OTP verifies and the driver doc exists, attach whatever was
  // collected on this page.
  useEffect(() => {
    if (verified && driver && !driver.address && !infoAppliedRef.current && name.trim()) {
      infoAppliedRef.current = true;
      const ref = new URLSearchParams(window.location.search).get("ref");
      const referredBy = ref && ref !== driver.mobile ? ref : null;
      setDriver({ ...driver, name: name.trim(), address: address.trim(), city: city.trim(), state: state.trim(), pincode, referredBy, referralCredited: false });
      // Attached for real — clear the draft so it can't leak into a future
      // registration attempt on this same device (e.g. a different driver).
      setName(""); setAddress(""); setCity(""); setState(""); setPincode("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verified, driver]);

  // Verified with an existing driver doc but no address on it and nothing
  // typed this session — a stale session left over from testing (e.g. a
  // Firestore wipe survived by the Firebase Auth session). Force a clean
  // restart instead of ever showing a half-broken "finish your details"
  // screen with a disabled button.
  useEffect(() => {
    if (verified && driver && !driver.vehicleSpec && !driver.address && !name.trim()) {
      onLogout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verified, driver]);

  const detailsValid = name.trim().length >= 3 && address.trim().length > 0 && city.trim() && state.trim() && pincode.length === 6;

  const getRecaptcha = () => {
    if (!recaptchaRef.current) {
      recaptchaRef.current = new RecaptchaVerifier(authInstance, recaptchaContainerId, { size: "invisible" });
    }
    return recaptchaRef.current;
  };

  const sendOtp = async () => {
    if (!detailsValid || mobile.length !== 10 || !authInstance || sending) return;
    setSending(true);
    setError("");
    try {
      confirmationRef.current = await signInWithPhoneNumber(authInstance, "+91" + mobile, getRecaptcha());
      setOtp("");
      setOtpStage("otp");
    } catch (e) {
      console.error(e);
      try { recaptchaRef.current?.clear(); } catch { /* already gone */ }
      recaptchaRef.current = null;
      setError(
        e?.code === "auth/too-many-requests"
          ? (lang === "en" ? "Too many attempts — please wait a while before trying again." : "बहुत ज़्यादा कोशिशें — कृपया थोड़ी देर बाद फिर कोशिश करें।")
          : (lang === "en" ? "Couldn't send OTP — check the number and try again." : "OTP नहीं भेज सका — नंबर जांचें और फिर कोशिश करें।")
      );
    }
    setSending(false);
  };

  const verifyOtp = async () => {
    if (otp.length !== 6 || !confirmationRef.current || sending) return;
    setSending(true);
    setError("");
    try {
      await confirmationRef.current.confirm(otp);
      onOtpVerified(mobile);
      // Details attach to the driver doc automatically once it's ready
      // (see the effect above) — nothing more to do here.
    } catch (e) {
      console.error(e);
      setError(lang === "en" ? "Incorrect OTP — try again." : "गलत OTP — फिर कोशिश करें।");
      setSending(false);
      return;
    }
    setSending(false);
  };

  const backButton = (
    <button onClick={onLogout} className="flex items-center gap-1 mb-4 pl-2 pr-3 py-1.5 rounded-full text-xs font-bold" style={{ background: "#F5E6C8", color: C.marigoldDeep }}>
      <ChevronLeft size={16} strokeWidth={2.75} /> {lang === "en" ? "Back" : "वापस"}
    </button>
  );

  if (verified && driver && driver.vehicleSpec) {
    // Returning driver, same number — already fully registered. The root
    // will swap to the KYC-pending or DriverApp screen on its next render.
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-5">
        {backButton}
        <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Loading your profile..." : "आपकी प्रोफाइल लोड हो रही है..."}</p>
      </div>
    );
  }

  if (verified && !driver) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-5">
        {backButton}
        <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Loading your profile..." : "आपकी प्रोफाइल लोड हो रही है..."}</p>
      </div>
    );
  }

  if (verified && driver && !driver.vehicleSpec && !driver.address && name.trim()) {
    // Normal flow — details were just collected on this page and the effect
    // above is attaching them to the driver profile right now.
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-5">
        {backButton}
        <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Saving your details..." : "आपकी जानकारी सेव हो रही है..."}</p>
      </div>
    );
  }

  if (verified && driver && driver.address) {
    // Details already attached (normal path) — move straight to documents.
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="px-5 pt-4">{backButton}</div>
        <DriverKyc driver={driver} setDriver={setDriver} vehicleTypes={vehicleTypes} addVehicleType={addVehicleType} lang={lang}
          stepLabel={lang === "en" ? "Step 2 of 2 — Documents & Vehicle" : "स्टेप 2 / 2 — दस्तावेज़ और गाड़ी"} />
      </div>
    );
  }

  if (!verified && otpStage === "checking") {
    return <div className="flex-1 flex items-center justify-center"><p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Checking your session..." : "आपका सेशन जांचा जा रहा है..."}</p></div>;
  }

  if (verified && driver && !driver.vehicleSpec && !driver.address && !name.trim()) {
    // Stale session with no progress — the effect above is signing us out
    // right now so this page reloads fresh.
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-5">
        {backButton}
        <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Restarting registration..." : "रजिस्ट्रेशन फिर से शुरू हो रहा है..."}</p>
      </div>
    );
  }

  // Page 1: personal details, with mobile/OTP verification at the bottom.
  return (
    <div className="flex-1 overflow-y-auto px-6 py-8 relative">
      {backButton}
      <div className="mb-4"><Logo size={64} showText={false} /></div>
      <h2 className="text-lg font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "Driver Registration" : "ड्राइवर रजिस्ट्रेशन"}</h2>
      <p className="text-xs mb-5" style={{ color: C.inkSoft }}>
        {lang === "en" ? "Step 1 of 2 — Fill in your details, then verify your mobile number below." : "स्टेप 1 / 2 — अपनी जानकारी भरें, फिर नीचे मोबाइल नंबर वेरीफाई करें।"}
      </p>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Your Name" : "आपका नाम"}</label>
          <input className={fieldCls} style={fieldStyle} placeholder={lang === "en" ? "e.g. Ramesh Patel" : "जैसे: रमेश पटेल"} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Address" : "पता"}</label>
          <input className={fieldCls} style={fieldStyle} placeholder={lang === "en" ? "e.g. House/Shop No., Street" : "जैसे: मकान/दुकान नं., गली"} value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "City" : "शहर"}</label>
            <input className={fieldCls} style={fieldStyle} placeholder={lang === "en" ? "e.g. Pune" : "जैसे: पुणे"} value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "State" : "राज्य"}</label>
            <input className={fieldCls} style={fieldStyle} placeholder={lang === "en" ? "e.g. Maharashtra" : "जैसे: महाराष्ट्र"} value={state} onChange={(e) => setState(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Pincode" : "पिनकोड"}</label>
          <input className={fieldCls} style={{ ...fieldStyle, fontFamily: monoFont }} placeholder={lang === "en" ? "6-digit pincode" : "6 अंकों का पिनकोड"} value={pincode}
            onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
        </div>
      </div>

      <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${C.line}` }}>
        <div className="text-[11px] font-bold mb-2" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Verify Mobile Number" : "मोबाइल नंबर वेरीफाई करें"}</div>
        {otpStage === "mobile" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg px-3" style={{ border: `1px solid ${C.line}`, background: C.paper }}>
                <Phone size={16} color={C.inkSoft} />
                <span className="text-sm" style={{ color: C.inkSoft, fontFamily: monoFont }}>+91</span>
                <input className="flex-1 py-3 text-sm outline-none" style={{ color: C.ink, fontFamily: monoFont }} placeholder={lang === "en" ? "10-digit mobile number" : "10 अंकों का मोबाइल नंबर"}
                  value={mobile} onChange={(e) => { setMobile(e.target.value.replace(/\D/g, "").slice(0, 10)); setError(""); }} />
              </div>
              {!detailsValid && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{lang === "en" ? "Fill in all the details above first" : "पहले ऊपर सारी जानकारी भरें"}</div>}
              {error && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{error}</div>}
              <button onClick={sendOtp} disabled={!detailsValid || mobile.length !== 10 || sending}
                className="w-full rounded-lg py-3 font-bold text-sm" style={{ background: detailsValid && mobile.length === 10 && !sending ? C.marigold : C.line, color: detailsValid && mobile.length === 10 && !sending ? C.navy : "#9AA3B0" }}>
                {sending ? (lang === "en" ? "Sending..." : "भेजा जा रहा है...") : (lang === "en" ? "Send OTP" : "OTP भेजें")}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[11px]" style={{ color: C.inkSoft }}>{lang === "en" ? `OTP sent to ${mobile}` : `${mobile} पर OTP भेजा गया`}</p>
              <div className="flex items-center gap-2 rounded-lg px-3" style={{ border: `1px solid ${C.line}`, background: C.paper }}>
                <ShieldCheck size={16} color={C.inkSoft} />
                <input className={otpInputCls} style={{ ...otpInputStyle, border: "none" }} placeholder="• • • • • •" value={otp}
                  onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} />
              </div>
              {error && <div className="text-[11px] font-semibold" style={{ color: C.safety }}>{error}</div>}
              <button onClick={verifyOtp} disabled={otp.length !== 6 || sending}
                className="w-full rounded-lg py-3 font-bold text-sm" style={{ background: otp.length === 6 && !sending ? C.marigold : C.line, color: otp.length === 6 && !sending ? C.navy : "#9AA3B0" }}>
                {sending ? (lang === "en" ? "Verifying..." : "वेरीफाई हो रहा है...") : (lang === "en" ? "Verify & Continue" : "वेरीफाई करें और आगे बढ़ें")}
              </button>
              <div className="flex items-center justify-between">
                <button onClick={() => { setOtpStage("mobile"); setOtp(""); setError(""); }} className="text-[11px] font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "Change number" : "नंबर बदलें"}</button>
                <button onClick={sendOtp} disabled={sending} className="text-[11px] font-semibold" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Resend OTP" : "OTP दोबारा भेजें"}</button>
              </div>
            </div>
          )}
      </div>
      <div id={recaptchaContainerId} />
    </div>
  );
}

// Wraps any tappable "upload a photo" tile — tapping it opens an action
// sheet asking Take Photo vs Choose from Library, instead of jumping
// straight to the OS file picker. Each option triggers its own hidden file
// input (one forces the camera via `capture`, the other doesn't).
// Resizes/compresses an uploaded photo client-side and hands back the
// decoded <canvas> — shared by uploadPhoto below.
function resizeImageToCanvas(file, maxDim = 900) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("image decode failed"));
      img.onload = () => {
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
        resolve(canvas);
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
// still works before that one-time setup step is done.
async function uploadPhoto(file, path, maxDim = 900, quality = 0.72) {
  const canvas = await resizeImageToCanvas(file, maxDim);
  if (storage) {
    try {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      const ref = storageRef(storage, path);
      // Firebase's resumable upload retries transient network errors with
      // backoff for a long time by default — on a flaky connection that can
      // stall the whole form for a while before ever reaching the fallback
      // below. Cap it so a bad connection fails over quickly instead.
      const attempt = uploadBytes(ref, blob, { contentType: "image/jpeg" }).then(() => getDownloadURL(ref));
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Storage upload timed out")), 10000));
      const url = await Promise.race([attempt, timeout]);
      return { name: file.name, url };
    } catch (e) {
      console.error("[storage upload]", e);
    }
  }
  return { name: file.name, url: canvas.toDataURL("image/jpeg", quality) };
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
            <button type="button" onClick={() => cameraRef.current?.click()} className="w-full rounded-lg py-3 mb-2 font-bold text-sm flex items-center justify-center gap-2" style={{ background: C.marigold, color: "#fff" }}>
              <Camera size={16} /> {lang === "en" ? "Take Photo" : "फोटो लें"}
            </button>
            <button type="button" onClick={() => libraryRef.current?.click()} className="w-full rounded-lg py-3 mb-2 font-bold text-sm" style={{ background: C.line, color: C.ink }}>
              {lang === "en" ? "Choose from Library" : "लाइब्रेरी से चुनें"}
            </button>
            <button type="button" onClick={() => setChoosing(false)} className="w-full rounded-lg py-2.5 text-xs font-semibold" style={{ color: C.safety }}>
              {lang === "en" ? "Cancel" : "रद्द करें"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// Pickup/Drop address field — wires Google Places Autocomplete directly onto
// the text input (live suggestion dropdown while typing) when Maps is
// configured/loaded, falling back to a plain input otherwise.
function LocationField({ label, value, onChange, onPlaceChanged, autocompleteRef, mapsReady, placeholder, onMic, onMapPin, onUseCurrentLocation, locating, areaLabel, suggestions, onSuggestionTap }) {
  // Icon cluster (map-pin, optional current-location, mic) sits inside the
  // bar at the right edge, so the field itself can span the full width —
  // right padding reserves room for it instead of separate outside buttons.
  const rightPad = onUseCurrentLocation ? 108 : 76;
  const inputCls = "w-full rounded-lg pl-3 py-2.5 text-sm outline-none";
  const inputStyle = { background: C.paper, border: `1px solid ${C.line}`, color: C.ink, paddingRight: rightPad };
  const inputEl = <input className={inputCls} style={inputStyle} placeholder={placeholder} value={value} onChange={onChange} />;
  return (
    <div>
      <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{label}</label>
      <div className="relative w-full">
        {mapsReady ? (
          <Autocomplete onLoad={(a) => (autocompleteRef.current = a)} onPlaceChanged={onPlaceChanged} options={{ componentRestrictions: { country: "in" } }}>
            {inputEl}
          </Autocomplete>
        ) : inputEl}
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          <button type="button" onClick={onMapPin} title={label} className="shrink-0 rounded-full flex items-center justify-center" style={{ width: 28, height: 28, background: "#F5E6C8" }}>
            <MapPin size={13} color="#A8721C" />
          </button>
          {onUseCurrentLocation && (
            <button type="button" onClick={onUseCurrentLocation} disabled={locating} title={label} className="shrink-0 rounded-full flex items-center justify-center" style={{ width: 28, height: 28, background: "#DFEEE2" }}>
              <Navigation size={13} color={C.success} />
            </button>
          )}
          <MicButton onResult={onMic} size={7} iconSize={13} />
        </div>
      </div>
      {areaLabel ? (
        <div className="text-[10px] mt-1 font-semibold" style={{ color: "#A8721C" }}>📍 {areaLabel}</div>
      ) : suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {suggestions.map((a) => (
            <button key={a} onClick={() => onSuggestionTap(a)} className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#F5E6C8", color: "#A8721C" }}>{a}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// CUSTOMER APP
// =====================================================================
function CustomerBooking({ createLoad, vehicleTypes, lastBooking, lang, customMaterials, addCustomMaterial }) {
  const VEHICLES = vehicleTypes;
  const [bookingMode, setBookingMode] = useState(null); // null | 'now' | 'advance'
  const [advanceDate, setAdvanceDate] = useState("");
  const [advanceTime, setAdvanceTime] = useState("");
  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [pickupCoords, setPickupCoords] = useState(null); // {lat,lng} | null
  const [dropCoords, setDropCoords] = useState(null);
  const [vehicle, setVehicle] = useState(VEHICLES[0]?.key || "chhota");
  const [showAllVehicles, setShowAllVehicles] = useState(true);
  const [serviceType, setServiceType] = useState("withinCity"); // 'withinCity' | 'outstation'
  const [material, setMaterial] = useState(MATERIALS[0]);
  const [materialsList, setMaterialsList] = useState(MATERIALS);
  const [newMaterial, setNewMaterial] = useState("");
  const [newMaterialEn, setNewMaterialEn] = useState("");
  const [addingMaterial, setAddingMaterial] = useState(false);
  const [weight, setWeight] = useState("");
  const distance = estimateDistance(pickup, drop);
  const [mapField, setMapField] = useState(null); // 'pickup' | 'drop' | null
  const [showBulkyPopup, setShowBulkyPopup] = useState(false);
  const [bulkyPopupSeenFor, setBulkyPopupSeenFor] = useState("");
  const { isLoaded: mapsLoaded, hasKey: mapsHasKey } = useGoogleMaps();
  const mapsReady = mapsHasKey && mapsLoaded;
  const pickupAutocompleteRef = useRef(null);
  const dropAutocompleteRef = useRef(null);
  const onPickupPlaceChanged = () => {
    const place = pickupAutocompleteRef.current?.getPlace();
    const loc = place?.geometry?.location;
    if (!loc) return;
    setPickup(place.formatted_address || place.name || "");
    setPickupCoords({ lat: loc.lat(), lng: loc.lng() });
  };
  const onDropPlaceChanged = () => {
    const place = dropAutocompleteRef.current?.getPlace();
    const loc = place?.geometry?.location;
    if (!loc) return;
    setDrop(place.formatted_address || place.name || "");
    setDropCoords({ lat: loc.lat(), lng: loc.lng() });
  };

  const [locatingPickup, setLocatingPickup] = useState(false);
  const useMyCurrentLocation = () => {
    if (!navigator.geolocation || locatingPickup) return;
    setLocatingPickup(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setPickupCoords({ lat: latitude, lng: longitude });
        if (mapsReady && window.google) {
          new window.google.maps.Geocoder().geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
            setPickup(status === "OK" && results?.[0] ? results[0].formatted_address : `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
            setLocatingPickup(false);
          });
        } else {
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=16`, { headers: { Accept: "application/json" } });
            const data = await res.json();
            setPickup(data?.display_name || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
          } catch {
            setPickup(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
          }
          setLocatingPickup(false);
        }
      },
      () => setLocatingPickup(false)
    );
  };

  const canPost = pickup.trim() && drop.trim() && weight.trim() && (bookingMode === "now" || (advanceDate && advanceTime));

  useEffect(() => {
    const w = Number(weight);
    if (!weight || !w) return;
    const isLightBulky = LIGHT_BULKY_MATERIALS.includes(material);
    const smallFit = VEHICLES.filter((v) => v.capacityKg >= w).sort((a, b) => a.capacityKg - b.capacityKg)[0];
    const bigFit = VEHICLES.filter((v) => BIG_VEHICLE_KEYS.includes(v.key)).sort((a, b) => a.capacityKg - b.capacityKg)[0];
    if (isLightBulky && bigFit) {
      setVehicle(bigFit.key);
      setShowAllVehicles(false);
      const key = material + "|" + weight;
      if (bulkyPopupSeenFor !== key) {
        setShowBulkyPopup(true);
        setBulkyPopupSeenFor(key);
      }
    } else if (smallFit) {
      setVehicle(smallFit.key);
      setShowAllVehicles(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weight, material]);

  const post = () => {
    if (!canPost) return;
    createLoad({
      pickup, drop, vehicle, material, weight, distance, scheduledFor: bookingMode === "advance" ? `${advanceDate} ${advanceTime}` : null,
      pickupLat: pickupCoords?.lat ?? null, pickupLng: pickupCoords?.lng ?? null,
      dropLat: dropCoords?.lat ?? null, dropLng: dropCoords?.lng ?? null,
      serviceType,
    });
    setPickup(""); setDrop(""); setWeight(""); setBookingMode(null); setAdvanceDate(""); setAdvanceTime("");
    setPickupCoords(null); setDropCoords(null); setServiceType("withinCity");
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
            <div className="text-[11px]" style={{ color: "#3D1B17" }}>{lang === "en" ? "Post now and get quotes right away" : "अभी पोस्ट करें, तुरंत कोटेशन पाएं"}</div>
          </div>
        </button>
        <button onClick={() => setBookingMode("advance")} className="w-full rounded-2xl p-5 text-left flex items-center gap-3" style={{ background: C.navy }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: C.marigold }}>
            <Clock3 size={22} color={C.navy} />
          </div>
          <div>
            <div className="text-base font-bold text-white">📅 {lang === "en" ? "Book ride in advance" : "एडवांस गाड़ी बुक करें"}</div>
            <div className="text-[11px]" style={{ color: "#D9C4B0" }}>{lang === "en" ? "Choose a future date and time" : "आगे की तारीख और समय चुनें"}</div>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="px-5 py-5">
      <button onClick={() => setBookingMode(null)} className="flex items-center gap-1 mb-3 pl-2 pr-3 py-1.5 rounded-full text-xs font-bold" style={{ background: "#F5E6C8", color: C.marigoldDeep }}>
        <ChevronLeft size={16} strokeWidth={2.75} /> {lang === "en" ? "Back" : "वापस"}
      </button>
      <div className="space-y-3">
        {bookingMode === "advance" && (
          <div className="rounded-lg p-3" style={{ background: "#F5E6C8" }}>
            <div className="text-[11px] font-bold mb-2" style={{ color: "#A8721C" }}>📅 {lang === "en" ? "When do you need the vehicle?" : "गाड़ी कब चाहिए?"}</div>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {[1, 2, 3].map((n) => {
                const d = new Date(Date.now() + n * 24 * 60 * 60 * 1000);
                const iso = d.toISOString().slice(0, 10);
                const active = advanceDate === iso;
                return (
                  <button key={n} type="button" onClick={() => setAdvanceDate(iso)}
                    className="rounded-lg py-2 text-[11px] font-bold text-center"
                    style={{ background: active ? "#A8721C" : C.paper, color: active ? "#fff" : "#A8721C", border: `1.5px solid #A8721C` }}>
                    {lang === "en" ? `+${n} day${n > 1 ? "s" : ""}` : `${n} दिन बाद`}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={advanceDate} onChange={(e) => setAdvanceDate(e.target.value)} className={inputCls} style={inputStyle} />
              <input type="time" value={advanceTime} onChange={(e) => setAdvanceTime(e.target.value)} className={inputCls} style={inputStyle} />
            </div>
          </div>
        )}
        <div className="text-[11px] font-bold" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Step 1 — Service Type" : "स्टेप 1 — सर्विस टाइप"}</div>
        <div>
          <select className={inputCls} style={inputStyle} value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
            <option value="withinCity">{lang === "en" ? "Within City" : "शहर के अंदर"}</option>
            <option value="outstation">{lang === "en" ? "Outstation" : "आउटस्टेशन"}</option>
          </select>
        </div>

        {lastBooking && !pickup && !drop && (
          <button onClick={() => {
            setPickup(lastBooking.pickup); setDrop(lastBooking.drop); setMaterial(lastBooking.material);
            setPickupCoords(lastBooking.pickupLat != null && lastBooking.pickupLng != null ? { lat: lastBooking.pickupLat, lng: lastBooking.pickupLng } : null);
            setDropCoords(lastBooking.dropLat != null && lastBooking.dropLng != null ? { lat: lastBooking.dropLat, lng: lastBooking.dropLng } : null);
          }}
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
        <div className="text-[11px] font-bold pt-1" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Step 2 — Pickup & Drop" : "स्टेप 2 — पिकअप और ड्रॉप"}</div>
        <div className="space-y-4">
          <LocationField
            label={lang === "en" ? "Pickup" : "पिकअप"}
            value={pickup}
            onChange={(e) => { setPickup(e.target.value); setPickupCoords(null); }}
            onPlaceChanged={onPickupPlaceChanged}
            autocompleteRef={pickupAutocompleteRef}
            mapsReady={mapsReady}
            placeholder={lang === "en" ? "Pickup address" : "पिकअप पता"}
            onMic={(text) => { setPickup((p) => (p ? p + " " : "") + text); setPickupCoords(null); }}
            onMapPin={() => setMapField("pickup")}
            onUseCurrentLocation={useMyCurrentLocation}
            locating={locatingPickup}
            areaLabel={findArea(pickup) ? `${lang === "en" ? "Area" : "क्षेत्र"}: ${findArea(pickup)}` : null}
            suggestions={suggestAreas(pickup)}
            onSuggestionTap={(a) => { setPickup(pickup.trim() + (pickup.trim() ? ", " : "") + a); setPickupCoords(null); }}
          />
          <LocationField
            label={lang === "en" ? "Drop" : "ड्रॉप"}
            value={drop}
            onChange={(e) => { setDrop(e.target.value); setDropCoords(null); }}
            onPlaceChanged={onDropPlaceChanged}
            autocompleteRef={dropAutocompleteRef}
            mapsReady={mapsReady}
            placeholder={lang === "en" ? "Drop address" : "ड्रॉप पता"}
            onMic={(text) => { setDrop((d) => (d ? d + " " : "") + text); setDropCoords(null); }}
            onMapPin={() => setMapField("drop")}
            areaLabel={findArea(drop) ? `${lang === "en" ? "Area" : "क्षेत्र"}: ${findArea(drop)}` : null}
            suggestions={suggestAreas(drop)}
            onSuggestionTap={(a) => { setDrop(drop.trim() + (drop.trim() ? ", " : "") + a); setDropCoords(null); }}
          />
        </div>

        {distance !== null && (
          <div className="rounded-lg p-2.5 flex items-center gap-2" style={{ background: "#F5E6C8" }}>
            <Navigation size={14} color="#A8721C" />
            <span className="text-xs font-semibold" style={{ color: "#A8721C" }}>{lang === "en" ? "Estimated distance" : "अनुमानित दूरी"}: {distance} {lang === "en" ? "km" : "किमी"}</span>
            <span className="text-[10px]" style={{ color: C.inkSoft }}>— {lang === "en" ? "this helps both customer and driver decide a fair price" : "इससे कस्टमर और ड्राइवर दोनों को सही बोली तय करने में आसानी होगी"}</span>
          </div>
        )}

        <div className="text-[11px] font-bold pt-1" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Step 3 — Load Details" : "स्टेप 3 — सामान की जानकारी"}</div>
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
                  }} className="shrink-0 rounded-lg px-3 py-2.5 text-xs font-bold text-white" style={{ background: "#A8721C" }}>{lang === "en" ? "Add" : "जोड़ें"}</button>
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

        {showBulkyPopup && (() => {
          const w = Number(weight);
          const smallFit = VEHICLES.filter((v) => v.capacityKg >= w).sort((a, b) => a.capacityKg - b.capacityKg)[0];
          const bigFit = VEHICLES.find((v) => v.key === vehicle);
          return (
            <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(42,33,28,0.6)" }} onClick={() => setShowBulkyPopup(false)}>
              <div className="w-full max-w-sm rounded-t-2xl p-5" style={{ background: C.paper }} onClick={(e) => e.stopPropagation()}>
                <div className="text-sm font-bold mb-2 flex items-center gap-1.5" style={{ color: C.marigoldDeep }}>⚠ {lang === "en" ? "Light but bulky load" : "हल्का पर बड़ा माल"}</div>
                <p className="text-xs mb-4" style={{ color: C.ink }}>{lang === "en" ? "This load is light and bulky — a bigger vehicle is suggested for it. You can still choose a smaller vehicle if you prefer." : "यह माल हल्का और बड़ा है, इसके लिए बड़ी गाड़ी का सुझाव है। चाहें तो छोटी गाड़ी भी चुन सकते हैं।"}</p>
                <div className="space-y-2">
                  <button onClick={() => setShowBulkyPopup(false)} className="w-full rounded-lg py-3 font-bold text-sm text-white" style={{ background: C.marigoldDeep }}>
                    {lang === "en" ? `Keep suggested vehicle (${vehicleLabel(bigFit, lang)})` : `सुझाई गई गाड़ी रखें (${vehicleLabel(bigFit, lang)})`}
                  </button>
                  <button onClick={() => { if (smallFit) setVehicle(smallFit.key); setShowAllVehicles(true); setShowBulkyPopup(false); }}
                    className="w-full rounded-lg py-3 font-bold text-sm" style={{ background: C.line, color: C.ink }}>
                    {lang === "en" ? `Use smaller vehicle instead (${smallFit ? vehicleLabel(smallFit, lang) : "—"})` : `छोटी गाड़ी ही रखें (${smallFit ? vehicleLabel(smallFit, lang) : "—"})`}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        <div className="rounded-lg p-3 flex items-center gap-2" style={{ background: "#FBEBD2" }}>
          <IndianRupee size={16} color={C.marigoldDeep} />
          <span className="text-[11px]" style={{ color: C.marigoldDeep }}>{lang === "en" ? "There's no fixed fare here — after posting, driver quotes will show up in \"My Rides\"." : "यहाँ कोई फिक्स भाड़ा नहीं है — पोस्ट करने के बाद ड्राइवरों की बोलियां \"मेरी राइड्स\" में दिखेंगी।"}</span>
        </div>

        <button onClick={post} disabled={!canPost} className="w-full rounded-lg py-3 font-bold text-sm flex items-center justify-center gap-2"
          style={{ background: canPost ? C.marigold : C.line, color: canPost ? C.navy : "#9AA3B0" }}>
          {lang === "en" ? "Book Now" : "बुक करें"}
        </button>
      </div>

      {mapField && (
        <LocationPicker
          lang={lang}
          onClose={() => setMapField(null)}
          onConfirm={(address, lat, lng) => {
            const coords = lat != null && lng != null ? { lat, lng } : null;
            if (mapField === "pickup") { setPickup(address); setPickupCoords(coords); }
            else { setDrop(address); setDropCoords(coords); }
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
        <div className="text-[9px] font-bold uppercase tracking-wide" style={{ color: C.inkSoft }}>{lang === "en" ? "From" : "से"}</div>
        <div className="text-sm font-bold leading-snug" style={{ color: C.ink }}>{pickup}</div>
        <div className="text-[9px] font-bold uppercase tracking-wide mt-1.5" style={{ color: C.inkSoft }}>{lang === "en" ? "To" : "तक"}</div>
        <div className="text-sm font-bold leading-snug" style={{ color: C.ink }}>{drop}</div>
      </div>
    </div>
  );
}

// Shows a single active (Bidding or Ongoing) booking — the customer's main
// page focuses on this one card instead of a separate "My Rides" tab.
function ActiveRide({ booking: b, vehicleTypes, cancelBooking, acceptBid, driverVehicle, drivers, lang }) {
  const VEHICLES = vehicleTypes;
  const [selectedBid, setSelectedBid] = useState(null);

  const shareTrip = () => {
    const text = lang === "en"
      ? `My goods are moving via Sarthi Transport.\nBooking: ${b.id}\nDriver: ${b.driverName || "—"}\nVehicle Number: ${driverVehicle?.vehicleNumber || "—"}\nRoute: ${b.pickup} → ${b.drop}\nStatus: ${b.progress}% complete`
      : `मेरा सामान सार्थी ट्रांसपोर्ट से जा रहा है।\nबुकिंग: ${b.id}\nड्राइवर: ${b.driverName || "—"}\nगाड़ी नंबर: ${driverVehicle?.vehicleNumber || "—"}\nरूट: ${b.pickup} → ${b.drop}\nस्टेटस: ${b.progress}% पूरा`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  if (b.status === "Bidding") {
    const sortedBids = b.bids.filter((x) => !x.paused).sort((x, y) => x.amount - y.amount);
    const selectedId = selectedBid;
    // Each bid comes from a driver who may have a different vehicle type,
    // so the vehicle shown per bid is that driver's own — never the load's
    // pre-suggested type, since the customer never confirmed one.
    const bidRow = (bid, isLowest) => {
      const isSelected = selectedId === bid.id;
      const bidDriver = drivers.find((d) => d.name === bid.driverName);
      const bidVehicleType = VEHICLES.find((vt) => vt.key === bidDriver?.vehicleSpec?.type);
      return (
        <button key={bid.id} onClick={() => setSelectedBid(bid.id)}
          className="w-full text-left rounded-xl p-3 relative"
          style={{ background: isSelected ? "#F5E6C8" : C.paper, border: `1.5px solid ${isSelected ? "#A8721C" : isLowest ? C.success : C.line}` }}>
          {isLowest && <span className="absolute -top-2 left-3 text-[9px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: C.success }}>{lang === "en" ? "Lowest bid" : "सबसे कम बोली"}</span>}
          <div className="flex items-center gap-3 mt-1">
            <SafeImage
              src={bidDriver?.vehicleSpec?.photo?.url}
              alt={vehicleLabel(bidVehicleType, lang)}
              className="w-14 h-14 rounded-lg object-cover shrink-0"
              fallback={
                <div className="w-14 h-14 rounded-lg flex items-center justify-center shrink-0" style={{ background: isSelected ? "#A8721C" : isLowest ? C.success : C.marigoldDeep }}>
                  <Truck size={22} color="#fff" />
                </div>
              }
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold truncate" style={{ color: C.ink }}>{vehicleLabel(bidVehicleType, lang) || bid.driverName}</div>
              <div className="text-[10px] truncate" style={{ color: C.inkSoft }}>{bid.driverName} · {stars(bid.rating)} · {bid.distanceKm} {lang === "en" ? "km away" : "किमी दूर"}</div>
              {bidVehicleType && <div className="text-[9px]" style={{ color: C.inkSoft, fontFamily: monoFont }}>{vehicleCapacity(bidVehicleType, lang)}</div>}
            </div>
            <div className="text-right shrink-0">
              <div className="text-base font-bold" style={{ color: "#A8721C", fontFamily: monoFont }}>{fmt(bid.amount)}</div>
              {isSelected && <CheckCircle2 size={16} color="#A8721C" className="ml-auto mt-0.5" />}
            </div>
          </div>
          {(bid.hours || bid.extraHourRate) && (
            <div className="text-[10px] mt-1.5 pt-1.5" style={{ color: C.inkSoft, borderTop: `1px solid ${C.line}` }}>
              {bid.hours ? (lang === "en" ? `${bid.hours} allowed hrs · ` : `${bid.hours} घंटे अलाउ · `) : ""}
              {bid.extraHourRate ? (lang === "en" ? `then ${fmt(bid.extraHourRate)}/hr waiting` : `उसके बाद ${fmt(bid.extraHourRate)}/घंटा वेटिंग`) : ""}
            </div>
          )}
        </button>
      );
    };
    return (
      <div className="px-5 py-5">
        <h2 className="text-base font-bold mb-3" style={{ color: C.ink }}>{lang === "en" ? "Your Active Ride" : "आपकी सक्रिय राइड"}</h2>
        <div className="rounded-xl p-3 mb-4 shadow-sm" style={{ background: C.paper, border: `1.5px solid ${C.marigoldDeep}` }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold flex items-center gap-1" style={{ color: C.marigoldDeep }}><IndianRupee size={13} /> {lang === "en" ? "Bidding in progress" : "बोली चल रही है"}</span>
              <span className="text-[10px] font-mono" style={{ color: C.inkSoft }}>{b.id}</span>
            </div>
            <div className="text-[10px] font-semibold flex items-center gap-1.5 mb-1">
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: b.serviceType === "outstation" ? "#FBEBD2" : "#DFEEE2", color: b.serviceType === "outstation" ? "#A8721C" : C.success }}>{serviceTypeLabel(b.serviceType, lang)}</span>
            </div>
            <RouteLine pickup={b.pickup} drop={b.drop} lang={lang} />
            {b.scheduledFor && (
              <div className="rounded-lg p-2 mb-2 flex items-center gap-1.5" style={{ background: "#F5E6C8" }}>
                <Clock3 size={12} color="#A8721C" />
                <span className="text-[11px] font-semibold" style={{ color: "#A8721C" }}>{lang === "en" ? "Scheduled for" : "इसके लिए शेड्यूल"}: {b.scheduledFor}</span>
              </div>
            )}

            {sortedBids.length === 0 ? (
              <div className="text-[11px] py-3 text-center" style={{ color: C.inkSoft }}>{lang === "en" ? "Waiting for driver bids..." : "ड्राइवरों की बोली का इंतज़ार है..."}</div>
            ) : (
              <div className="space-y-2">
                {bidRow(sortedBids[0], true)}
                {sortedBids.length > 1 && (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
                    {sortedBids.slice(1).map((bid) => bidRow(bid, false))}
                  </div>
                )}
              </div>
            )}

            {selectedId && (
              <button onClick={() => { acceptBid(b.id, selectedId); setSelectedBid(null); }}
                className="w-full rounded-lg py-2.5 font-bold text-sm mt-2 text-white" style={{ background: C.success }}>
                {lang === "en" ? "Book this vehicle" : "यही गाड़ी बुक करें"}
              </button>
            )}
            <button onClick={() => cancelBooking(b.id)} className="text-[11px] font-semibold mt-2" style={{ color: C.safety }}>{lang === "en" ? "Cancel load" : "लोड रद्द करें"}</button>
        </div>
      </div>
    );
  }

  const v = VEHICLES.find((x) => x.key === b.vehicle);
  return (
    <div className="px-5 py-5">
      <h2 className="text-base font-bold mb-3" style={{ color: C.ink }}>{lang === "en" ? "Your Active Ride" : "आपकी सक्रिय राइड"}</h2>

      <div className="rounded-2xl p-3.5 mb-2.5 shadow-sm flex items-center gap-3" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
        <div className="relative shrink-0">
          <SafeImage
            src={driverVehicle?.photo?.url}
            alt="ड्राइवर"
            className="w-12 h-12 rounded-full object-cover"
            fallback={<div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: C.navy }}><UserCircle2 size={26} color="#fff" /></div>}
          />
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: "#fff" }}>
            <CheckCircle2 size={15} color={C.success} />
          </div>
        </div>
        <div>
          <div className="text-base font-bold" style={{ color: C.ink }}>{b.driverName}</div>
          <span className="inline-block mt-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: "#F5E6C8", color: C.pimpri }}>{lang === "en" ? "Verified" : "सत्यापित"}</span>
        </div>
      </div>

      <div className="rounded-2xl p-3 mb-2.5 shadow-sm flex items-center justify-between" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
        <span className="text-sm font-bold flex items-center gap-1.5" style={{ color: C.pimpri }}><Navigation size={15} /> {lang === "en" ? "Live Tracking" : "लाइव ट्रैकिंग"} <Activity size={14} /></span>
        <span className="text-xs font-mono" style={{ color: C.inkSoft }}>{b.id}</span>
      </div>

      <div className="rounded-2xl mb-2.5 shadow-sm flex" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
        <div className="flex-1 p-3 flex items-center gap-2.5">
          <SafeImage
            src={driverVehicle?.photo?.url}
            alt="ड्राइवर"
            className="w-10 h-10 rounded-full object-cover"
            fallback={<div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: C.pimpri }}><UserCircle2 size={20} color="#fff" /></div>}
          />
          <div className="text-sm font-bold" style={{ color: C.ink }}>{b.driverName}</div>
        </div>
        <div className="w-px" style={{ background: C.line }} />
        <div className="flex-1 p-3">
          <div className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Vehicle Details" : "गाड़ी की जानकारी"}</div>
          <div className="text-sm font-bold mt-0.5" style={{ color: C.ink }}>{vehicleLabel(v, lang)} · {driverVehicle?.vehicleNumber || (lang === "en" ? "unavailable" : "उपलब्ध नहीं")}</div>
        </div>
      </div>

      <div className="rounded-2xl p-3.5 mb-2.5" style={{ background: "#F5E6C8", border: `1.5px solid ${C.pimpri}` }}>
        <div className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Fare and Waiting Policy" : "भाड़ा और वेटिंग नियम"}</div>
        <div className="text-base font-extrabold mt-1" style={{ color: "#000000", fontFamily: bodyFont, fontVariantNumeric: "tabular-nums" }}>{lang === "en" ? "Fixed fare:" : "तय भाड़ा:"} {fmt(b.fare)}</div>
        {b.hours && (
          <div className="text-sm font-bold mt-1" style={{ color: "#000000", fontFamily: bodyFont, fontVariantNumeric: "tabular-nums" }}>
            {lang === "en" ? `${b.hours} allowed hrs` : `${b.hours} घंटे अलाउ`}{b.extraHourRate ? (lang === "en" ? ` · then ${fmt(b.extraHourRate)}/hr waiting` : ` · उसके बाद ${fmt(b.extraHourRate)}/घंटा वेटिंग`) : ""}
          </div>
        )}
        <div className="flex items-center gap-1.5 mt-2">
          <Phone size={14} color="#000000" />
          {b.driverMobile ? (
            <>
              <a href={`tel:${b.driverMobile}`} className="text-sm font-extrabold px-1.5 py-0.5 rounded" style={{ color: "#000000", fontFamily: bodyFont, fontVariantNumeric: "tabular-nums", letterSpacing: 0.3, background: "#FFE066" }}>{b.driverMobile}</a>
              <span className="text-sm font-semibold" style={{ color: "#000000", fontFamily: bodyFont }}>{lang === "en" ? "Call Driver" : "ड्राइवर को कॉल करें"}</span>
            </>
          ) : (
            <span className="text-sm font-bold" style={{ color: "#000000", fontFamily: bodyFont }}>{lang === "en" ? "revealing after commission cut..." : "कमीशन कटने के बाद दिखेगा..."}</span>
          )}
        </div>
      </div>

      {b.otp && !b.loadingStartedAt && (
        <div className="rounded-2xl p-4 mb-2.5 text-center" style={{ background: "#F1EEE7", border: "1.5px dashed #9AA0A6" }}>
          <div className="text-xs font-semibold" style={{ color: C.inkSoft }}>{lang === "en" ? "Give this OTP to the driver at pickup" : "पिकअप पर यह OTP ड्राइवर को बताएं"}</div>
          <div className="text-3xl font-extrabold mt-1.5" style={{ color: "#000000", fontFamily: monoFont, letterSpacing: 8 }}>{b.otp}</div>
        </div>
      )}

      <div className="rounded-2xl p-3 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
        <LiveTrackingMap pickup={b.pickup} drop={b.drop} pickupLat={b.pickupLat} pickupLng={b.pickupLng} dropLat={b.dropLat} dropLng={b.dropLng} driverLocation={b.driverLocation} progress={b.progress} zoneColor={C.pimpri} height={130} lang={lang} />
        <div className="w-full h-1.5 rounded-full mt-2" style={{ background: C.line }}>
          <div className="h-1.5 rounded-full" style={{ width: `${b.progress}%`, background: C.pimpri }} />
        </div>
        <div className="text-[11px] mt-1" style={{ color: C.inkSoft }}>{lang === "en" ? "Vehicle location" : "गाड़ी की लोकेशन"} — {b.progress}% {lang === "en" ? "of the way complete" : "रास्ता पूरा"}</div>
        {b.loadingStartedAt && <TripOvertimeBanner booking={b} lang={lang} />}
        <div className="flex items-center gap-4 mt-2">
          <button onClick={shareTrip} className="text-[11px] font-semibold flex items-center gap-1" style={{ color: C.success }}><MessageCircle size={12} /> {lang === "en" ? "Share trip" : "ट्रिप शेयर करें"}</button>
          <button onClick={() => cancelBooking(b.id)} className="text-[11px] font-semibold" style={{ color: C.safety }}>{lang === "en" ? "Cancel booking" : "बुकिंग रद्द करें"}</button>
        </div>
      </div>
    </div>
  );
}

// Completed/cancelled booking history — reached from the hamburger menu now
// that the main page focuses on the single active ride.
function CustomerHistory({ bookings, vehicleTypes, rateBooking, lang }) {
  const VEHICLES = vehicleTypes;
  const others = bookings.filter((b) => b.status === "Completed" || b.status === "Cancelled");
  const statusMeta = lang === "en"
    ? { Completed: { label: "Completed", color: C.success, bg: "#DFEEE2" }, Cancelled: { label: "Cancelled", color: C.safety, bg: "#FCEAE3" } }
    : { Completed: { label: "पूर्ण", color: C.success, bg: "#DFEEE2" }, Cancelled: { label: "रद्द", color: C.safety, bg: "#FCEAE3" } };

  const downloadInvoice = (b) => {
    const text = `Sarthi Transport Invoice\nBooking: ${b.id}\nPickup: ${b.pickup}\nDrop: ${b.drop}\nVehicle: ${vehicleLabel(VEHICLES.find(v => v.key === b.vehicle), "en")}\nDistance: ${b.distance} km\nQuoted Fare: ${fmt(b.fare - (b.extraCharge || 0))}\nExtra Waiting Charge: ${b.extraCharge ? fmt(b.extraCharge) : "-"}\nTotal Fare: ${fmt(b.fare)}\nAllowed Hours: ${b.hours || "-"} hrs\nWaiting Charge Rate: ${b.extraHourRate ? fmt(b.extraHourRate) + "/hr" : "-"}\nStatus: ${b.status}`;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${b.id}-invoice.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="px-5 py-4">
      <h2 className="text-base font-bold mb-3" style={{ color: C.ink }}>{lang === "en" ? "Ride History" : "राइड हिस्ट्री"}</h2>
      {others.length === 0 ? (
        <div className="text-center py-12 px-6">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "#FBEBD2" }}>
            <Package size={26} color={C.marigoldDeep} />
          </div>
          <p className="text-sm font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "No past rides yet" : "अभी कोई पुरानी राइड नहीं है"}</p>
          <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Completed and cancelled bookings will show up here." : "पूर्ण और रद्द बुकिंग यहां दिखेंगी।"}</p>
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

// Editable customer profile — photo, name, email, mobile (read-only, tied to
// the verified login), and address, with a Save button that persists via
// onUpdateProfile.
function CustomerProfileEdit({ customerProfile, customerMobile, onSave, requestReferralWithdrawal, onOpenTerms, lang }) {
  const [name, setName] = useState(customerProfile?.name || "");
  const [email, setEmail] = useState(customerProfile?.email || "");
  const [photo, setPhoto] = useState(customerProfile?.photo || null);
  const [photoUploading, setPhotoUploading] = useState(false);
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

  const now = Date.now();
  const referralEntries = customerProfile?.referralEntries || [];
  const referralLocked = referralEntries.filter((e) => e.unlockAt > now).reduce((s, e) => s + e.amount, 0);
  const referralBalance = customerProfile?.referralBalance || 0;
  const referralAvailable = Math.max(0, referralBalance - referralLocked);
  const [withdrawn, setWithdrawn] = useState(false);
  const withdrawReferral = () => {
    if (referralAvailable <= 0) return;
    requestReferralWithdrawal?.(referralAvailable);
    setWithdrawn(true);
    setTimeout(() => setWithdrawn(false), 2500);
  };

  return (
    <div className="px-5 py-4">
      <h2 className="text-base font-bold mb-3" style={{ color: C.ink }}>{lang === "en" ? "My Profile" : "मेरी प्रोफाइल"}</h2>
      {referralBalance > 0 && (
        <div className="rounded-xl p-4 mb-3 shadow-sm" style={{ background: "#DFEEE2", border: `1px solid ${C.success}` }}>
          <div className="text-xs font-bold mb-1 flex items-center gap-1.5" style={{ color: C.success }}>🤝 {lang === "en" ? "Referral Rewards" : "रेफरल रिवॉर्ड"}</div>
          <div className="text-lg font-bold" style={{ color: C.success, fontFamily: monoFont }}>{fmt(referralBalance)}</div>
          {referralLocked > 0 && (
            <div className="text-[10px] mt-0.5" style={{ color: C.inkSoft }}>
              {lang === "en" ? `${fmt(referralLocked)} locked — unlocks 2 months after each referral` : `${fmt(referralLocked)} लॉक्ड — हर रेफरल के 2 महीने बाद अनलॉक होगा`}
            </div>
          )}
          {withdrawn ? (
            <div className="text-xs font-semibold mt-2" style={{ color: C.success }}>{lang === "en" ? "Withdrawal request sent ✓" : "विड्रॉल रिक्वेस्ट भेज दी गई ✓"}</div>
          ) : (
            <button onClick={withdrawReferral} disabled={referralAvailable <= 0} className="w-full rounded-lg py-2 font-bold text-xs mt-2"
              style={{ background: referralAvailable > 0 ? C.success : C.line, color: referralAvailable > 0 ? "#fff" : "#9AA3B0" }}>
              {referralAvailable > 0 ? (lang === "en" ? `Withdraw ${fmt(referralAvailable)}` : `${fmt(referralAvailable)} विड्रॉ करें`) : (lang === "en" ? "Nothing unlocked yet" : "अभी कुछ भी अनलॉक नहीं हुआ")}
            </button>
          )}
        </div>
      )}
      <div className="rounded-xl p-4 mb-3 shadow-sm space-y-3" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
        <div className="flex justify-center">
          <PhotoPicker label={lang === "en" ? "Profile Photo" : "प्रोफाइल फोटो"} lang={lang} onSelect={(f) => { setPhotoUploading(true); uploadPhoto(f, `customers/${customerMobile}/profile.jpg`).then((p) => { setPhoto(p); setPhotoUploading(false); }); }}>
            <div className="w-20 h-20 rounded-full flex items-center justify-center cursor-pointer overflow-hidden" style={{ background: "#F5E6C8", border: `2px dashed ${C.marigoldDeep}` }}>
              {photoUploading
                ? <p className="text-[9px] text-center px-1" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Uploading..." : "अपलोड हो रहा है..."}</p>
                : <SafeImage src={photo?.url} alt="" className="w-full h-full object-cover" fallback={<Camera size={22} color={C.marigoldDeep} />} />}
            </div>
          </PhotoPicker>
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Full Name" : "पूरा नाम"}</label>
          <input className={inputCls} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Mobile" : "मोबाइल"}</label>
          <input className={inputCls} style={{ ...inputStyle, fontFamily: monoFont, background: C.bg, color: C.inkSoft }} value={customerMobile || ""} disabled />
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Email (optional)" : "ईमेल (वैकल्पिक)"}</label>
          <input type="email" className={inputCls} style={inputStyle} placeholder={lang === "en" ? "e.g. ramesh@email.com" : "जैसे: ramesh@email.com"} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Address" : "पता"}</label>
          <input className={inputCls} style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Area" : "एरिया"}</label>
            <input className={inputCls} style={inputStyle} value={area} onChange={(e) => setArea(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "City" : "शहर"}</label>
            <input className={inputCls} style={inputStyle} value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "State" : "राज्य"}</label>
            <input className={inputCls} style={inputStyle} value={state} onChange={(e) => setState(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Pincode" : "पिनकोड"}</label>
            <input className={inputCls} style={{ ...inputStyle, fontFamily: monoFont }} value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          </div>
        </div>
        <button onClick={save} disabled={photoUploading} className="w-full rounded-lg py-2.5 font-bold text-sm text-white" style={{ background: photoUploading ? C.line : saved ? C.success : C.marigoldDeep }}>
          {photoUploading ? (lang === "en" ? "Uploading photo..." : "फोटो अपलोड हो रही है...") : saved ? (lang === "en" ? "Saved ✓" : "सेव हो गया ✓") : (lang === "en" ? "Save Changes" : "बदलाव सेव करें")}
        </button>
      </div>
      <button onClick={onOpenTerms} className="w-full rounded-lg py-2.5 font-bold text-sm" style={{ background: C.marigold, color: C.navy }}>{lang === "en" ? "Terms & Conditions" : "नियम व शर्तें"}</button>
    </div>
  );
}

function CustomerApp({ bookings, createLoad, drivers, vehicleTypes, cancelBooking, rateBooking, acceptBid, lang, onLogout, customerProfile, customerMobile, onUpdateProfile, requestReferralWithdrawal, raiseAlert, trialMode, onOpenTerms, onGoHome }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsView, setSettingsView] = useState(null); // 'helpline' | 'profile' | 'liveLocation' | 'settings' | 'history' | null
  const ongoingTrip = bookings.find((b) => b.status === "Ongoing");
  const activeBooking = bookings.find((b) => b.status === "Bidding" || b.status === "Ongoing");
  // The actual assigned driver's vehicle — looked up from the shared drivers
  // list by name, not this device's own driver session (a customer's phone
  // usually isn't also logged in as the driver who accepted their load).
  const activeDriverVehicle = drivers.find((d) => d.name === activeBooking?.driverName)?.vehicleSpec;

  const shareApp = () => {
    // Referral reward applies from day one (not gated by trial mode) — the
    // link carries this customer's own mobile number as their referral
    // code, so ₹200 credits to their profile once the new user completes
    // their first booking/trip (see creditReferralOnce in the root App).
    const link = `https://sarthitransport.example.com?ref=${customerMobile}`;
    const msg = lang === "en"
      ? `Try Sarthi Transport for booking trucks/tempos easily! Download: ${link} — I get ₹200 once your first booking is done!`
      : `ट्रक/टेम्पो बुक करने के लिए सार्थी ट्रांसपोर्ट इस्तेमाल करें! डाउनलोड करें: ${link} — आपकी पहली बुकिंग पूरी होने पर मुझे ₹200 मिलेंगे!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  if (settingsView) {
    return (
      <div className="flex-1 overflow-y-auto relative">
        <button onClick={() => setSettingsView(null)} className="flex items-center gap-1 mx-5 mt-4 pl-2 pr-3 py-1.5 rounded-full text-xs font-bold self-start" style={{ background: "#F5E6C8", color: C.marigoldDeep }}>
          <ChevronLeft size={16} strokeWidth={2.75} /> {lang === "en" ? "Back" : "वापस"}
        </button>
        {settingsView === "helpline" && <SosScreen role="customer" raiseAlert={raiseAlert} lang={lang} />}
        {settingsView === "profile" && (
          <CustomerProfileEdit customerProfile={customerProfile} customerMobile={customerMobile} onSave={onUpdateProfile} requestReferralWithdrawal={requestReferralWithdrawal} onOpenTerms={onOpenTerms} lang={lang} />
        )}
        {settingsView === "liveLocation" && (
          <div className="px-5 py-4">
            <h2 className="text-base font-bold mb-3" style={{ color: C.ink }}>{lang === "en" ? "Live Location" : "लाइव लोकेशन"}</h2>
            {ongoingTrip ? (
              <>
                <LiveTrackingMap pickup={ongoingTrip.pickup} drop={ongoingTrip.drop} pickupLat={ongoingTrip.pickupLat} pickupLng={ongoingTrip.pickupLng} dropLat={ongoingTrip.dropLat} dropLng={ongoingTrip.dropLng} driverLocation={ongoingTrip.driverLocation} progress={ongoingTrip.progress} zoneColor={C.pimpri} height={200} lang={lang} />
                <div className="text-xs mt-2" style={{ color: C.ink }}>{ongoingTrip.pickup} → {ongoingTrip.drop}</div>
                <div className="text-[11px] mt-1" style={{ color: C.inkSoft }}>{ongoingTrip.progress}% {lang === "en" ? "of the way complete" : "रास्ता पूरा"}</div>
              </>
            ) : (
              <p className="text-xs text-center py-10" style={{ color: C.inkSoft }}>{lang === "en" ? "No active trip right now." : "अभी कोई सक्रिय ट्रिप नहीं है।"}</p>
            )}
          </div>
        )}
        {settingsView === "settings" && (
          <div className="px-5 py-4">
            <h2 className="text-base font-bold mb-3" style={{ color: C.ink }}>{lang === "en" ? "Settings" : "सेटिंग्स"}</h2>
            <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Use the language toggle (EN / हिं) at the top of the app to switch languages. For changes to your saved address, contact the helpline." : "भाषा बदलने के लिए ऐप के ऊपर मौजूद EN / हिं बटन इस्तेमाल करें। सेव किए गए पते में बदलाव के लिए हेल्पलाइन से संपर्क करें।"}</p>
          </div>
        )}
        {settingsView === "history" && <CustomerHistory bookings={bookings} vehicleTypes={vehicleTypes} rateBooking={rateBooking} lang={lang} />}
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto relative">
        <div className="flex items-center justify-between px-5 pt-3">
          <button onClick={() => setMenuOpen(true)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#F0EAE0" }}>
            <Menu size={16} color={C.inkSoft} />
          </button>
          {onGoHome && (
            <button onClick={onGoHome} title={lang === "en" ? "Back to main page" : "मुख्य पेज पर वापस जाएं"} className="w-9 h-9 rounded-full flex items-center justify-center shadow-sm" style={{ background: C.marigold, border: `1.5px solid ${C.marigoldDeep}` }}>
              <Home size={18} color={C.navy} strokeWidth={2.5} />
            </button>
          )}
        </div>
        {!activeBooking && <Greeting name={customerProfile?.name} lang={lang} />}
        {menuOpen && (
          <div className="fixed inset-0 z-50 flex" onClick={() => setMenuOpen(false)}>
            <div className="w-72 max-w-[82%] h-full overflow-y-auto" style={{ background: C.paper }} onClick={(e) => e.stopPropagation()}>
              <div className="px-4 py-4 flex items-center gap-3" style={{ background: C.navy }}>
                <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 overflow-hidden" style={{ background: C.marigold }}>
                  {customerProfile?.photo ? <img src={customerProfile.photo.url} alt="" className="w-full h-full object-cover" /> : <UserCircle2 size={24} color={C.navy} />}
                </div>
                <div>
                  <div className="text-sm font-bold text-white">{customerProfile?.name || (lang === "en" ? "Customer" : "कस्टमर")}</div>
                  {customerMobile && <div className="text-[11px]" style={{ color: "#D9C4B0", fontFamily: monoFont }}>{customerMobile}</div>}
                </div>
              </div>
              {onGoHome && (
                <button onClick={() => { onGoHome(); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-left" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
                  <Home size={16} color={C.marigoldDeep} /> {lang === "en" ? "Back to Main Page" : "मुख्य पेज पर वापस जाएं"}
                </button>
              )}
              <button onClick={() => { setSettingsView("profile"); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-left" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
                <UserCircle2 size={16} color={C.marigoldDeep} /> {lang === "en" ? "My Profile" : "मेरी प्रोफाइल"}
              </button>
              <button onClick={() => { setSettingsView("history"); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-left" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
                <Package size={16} color={C.marigoldDeep} /> {lang === "en" ? "Ride History" : "राइड हिस्ट्री"}
              </button>
              <button onClick={() => { setSettingsView("liveLocation"); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-left" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
                <MapPinned size={16} color={C.marigoldDeep} /> {lang === "en" ? "Live Location" : "लाइव लोकेशन"}
              </button>
              <button onClick={() => { setSettingsView("settings"); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-left" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
                <Settings2 size={16} color={C.marigoldDeep} /> {lang === "en" ? "Settings" : "सेटिंग्स"}
              </button>
              <button onClick={() => { shareApp(); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-left" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
                <MessageCircle size={16} color={C.success} /> {lang === "en" ? "Share App (Refer & Earn ₹200)" : "ऐप शेयर करें (Refer & Earn ₹200)"}
              </button>
              <button onClick={() => { setSettingsView("helpline"); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-left" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
                <Phone size={16} color={C.safety} /> {lang === "en" ? "Contact & Helpline" : "संपर्क व हेल्पलाइन"}
              </button>
              <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-left" style={{ color: C.safety }}>
                <XCircle size={16} /> {lang === "en" ? "Logout" : "लॉगआउट"}
              </button>
            </div>
            <div className="flex-1" style={{ background: "rgba(42,33,28,0.5)" }} />
          </div>
        )}
        {activeBooking ? (
          <ActiveRide booking={activeBooking} vehicleTypes={vehicleTypes} cancelBooking={cancelBooking} acceptBid={acceptBid} driverVehicle={activeDriverVehicle} drivers={drivers} lang={lang} />
        ) : (
          <CustomerBooking createLoad={createLoad} vehicleTypes={vehicleTypes} lastBooking={bookings[0]} lang={lang} />
        )}
      </div>
    </>
  );
}

// =====================================================================
// DRIVER APP
// =====================================================================
function LoadAlertCard({ load, vehicleTypes, driver, addBid, lang, commissionPct = 0, minWallet = 0, trialMode = false }) {
  const VEHICLES = vehicleTypes;
  const v = VEHICLES.find((x) => x.key === load.vehicle);
  const myBid = load.bids.find((b) => b.driverName === driver.name);
  const [amount, setAmount] = useState("");
  const [allowedHours, setAllowedHours] = useState("");
  const [extraHourRate, setExtraHourRate] = useState("");
  const [justSubmitted, setJustSubmitted] = useState(false);

  const canSubmit = Number(amount) > 0 && Number(allowedHours) > 0 && Number(extraHourRate) > 0;
  const requiredForQuote = Number(amount || 0) * (commissionPct / 100);
  const walletShortfall = !trialMode && (driver.wallet - requiredForQuote) < minWallet;

  const otherBids = load.bids.filter((b) => b.driverName !== driver.name);
  const lowestOther = otherBids.length ? otherBids.reduce((min, b) => b.amount < min.amount ? b : min) : null;
  const allAmounts = load.bids.map((b) => b.amount);
  const lowestOverall = allAmounts.length ? Math.min(...allAmounts) : null;
  const isMineHighest = myBid && allAmounts.length > 1 && myBid.amount === Math.max(...allAmounts) && myBid.amount !== lowestOverall;

  const submitBid = () => {
    if (!canSubmit || myBid || walletShortfall) return;
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
    <div className="rounded-xl p-3 shadow-sm mb-3 transition-colors" style={{ background: justSubmitted ? "#DFEEE2" : C.paper, border: `2px solid ${justSubmitted ? C.success : C.marigoldDeep}` }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold flex items-center gap-1" style={{ color: C.marigoldDeep }}><Bell size={13} /> {lang === "en" ? "New Load" : "नया लोड"}</span>
        <span className="text-[10px]" style={{ color: C.inkSoft }}>{load.distance} {lang === "en" ? "km" : "किमी"}</span>
      </div>
      <div className="text-xs mb-0.5" style={{ color: C.ink }}>{load.pickup} → {load.drop}</div>
      <div className="text-[11px] mb-1 flex items-center gap-1.5" style={{ color: C.inkSoft }}>
        {vehicleLabel(v, lang)} · {materialLabel(load.material, lang)} · {load.weight} {lang === "en" ? "kg" : "किग्रा"}
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: load.serviceType === "outstation" ? "#FBEBD2" : "#DFEEE2", color: load.serviceType === "outstation" ? "#A8721C" : C.success }}>{serviceTypeLabel(load.serviceType, lang)}</span>
      </div>

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
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 mb-2" style={{ background: "#F5E6C8" }}>
              <IndianRupee size={11} color="#A8721C" />
              <span className="text-[11px] font-semibold" style={{ color: "#A8721C" }}>
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
          {canSubmit && walletShortfall && (
            <div className="text-[10px] mb-2 font-semibold" style={{ color: C.safety }}>
              {lang === "en" ? `Not enough wallet balance to cover ${commissionPct}% commission on this fare — recharge your wallet first.` : `इस भाड़े पर ${commissionPct}% कमीशन के लिए वॉलेट में पर्याप्त बैलेंस नहीं है — पहले वॉलेट रीचार्ज करें।`}
            </div>
          )}

          <button onClick={submitBid} disabled={!canSubmit || walletShortfall} className="w-full rounded-lg py-2.5 text-sm font-bold text-white flex items-center justify-center gap-1.5"
            style={{ background: justSubmitted ? C.success : (canSubmit && !walletShortfall) ? C.marigoldDeep : C.line, color: justSubmitted || (canSubmit && !walletShortfall) ? "#fff" : "#9AA3B0" }}>
            {justSubmitted ? <><CheckCircle2 size={16} /> {lang === "en" ? "Sent" : "भेज दिया"}</> : (lang === "en" ? "Send Quote" : "कोटेशन भेजें")}
          </button>
        </>
      )}
    </div>
  );
}

function fmtHMS(ms) {
  const hh = Math.floor(ms / 3600000);
  const mm = Math.floor((ms % 3600000) / 60000);
  const ss = Math.floor((ms % 60000) / 1000);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

// Shared elapsed/remaining-time math for a loading trip, used by both the
// driver's timer screen and the customer's ongoing-trip overtime banner so
// the "बीप-बीप" alarm behaves identically on both sides.
function useTripClock(loadingStartedAt, hours, extraHourRate) {
  const [now, setNow] = useState(Date.now());
  const beepedRef = useRef(false);
  const started = !!loadingStartedAt;

  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [started, loadingStartedAt]);

  const elapsedMs = started ? now - loadingStartedAt : 0;
  const elapsedHoursExact = elapsedMs / 3600000;
  const bookedHours = hours || 0;
  const isOvertime = started && bookedHours > 0 && elapsedHoursExact >= bookedHours;
  const extraHours = Math.max(0, elapsedHoursExact - bookedHours);
  const extraCharge = Math.round(extraHours * (extraHourRate || 0));
  const remainingMs = Math.max(0, bookedHours * 3600000 - elapsedMs);

  useEffect(() => {
    if (isOvertime && !beepedRef.current) {
      beepedRef.current = true;
      playBeepTone();
    }
    if (!isOvertime) beepedRef.current = false;
  }, [isOvertime]);

  return { started, isOvertime, extraHours, extraCharge, elapsedStr: fmtHMS(elapsedMs), remainingStr: fmtHMS(remainingMs) };
}

// Read-only overtime banner shown on the customer's ongoing-trip card —
// mirrors the driver's alarm so both sides get the "समय खत्म" alert.
function TripOvertimeBanner({ booking, lang }) {
  const clock = useTripClock(booking.loadingStartedAt, booking.hours, booking.extraHourRate);
  if (!clock.started || !clock.isOvertime) return null;
  return (
    <div className="rounded-lg mt-2 p-2.5" style={{ background: "#FCEAE3" }}>
      <div className="text-[11px] font-bold" style={{ color: C.safety }}>🔔 {lang === "en" ? "Beep-beep! Allowed loading time is over" : "बीप-बीप! अलाउ समय खत्म हो गया"}</div>
      <div className="text-[11px] mt-0.5" style={{ color: C.safety }}>
        {lang === "en" ? `Extra time: ${clock.extraHours.toFixed(2)} hrs · Waiting charge so far: ${fmt(clock.extraCharge)}` : `अतिरिक्त समय: ${clock.extraHours.toFixed(2)} घंटे · अब तक वेटिंग चार्ज: ${fmt(clock.extraCharge)}`}
      </div>
    </div>
  );
}

function LoadingTimer({ trip, startLoading, completeBooking, lang }) {
  const [otpInput, setOtpInput] = useState("");
  const [otpError, setOtpError] = useState(false);
  const clock = useTripClock(trip.loadingStartedAt, trip.hours, trip.extraHourRate);

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
        <div className="space-y-2">
          <input value={otpInput} onChange={(e) => { setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 4)); setOtpError(false); }}
            placeholder="0000" maxLength={4} inputMode="numeric"
            className="w-full rounded-lg px-3 py-2.5 text-center outline-none" style={{ border: `1px solid ${C.line}`, background: C.paper, color: C.ink, fontFamily: monoFont, fontSize: 20, letterSpacing: 6 }} />
          <button onClick={confirmOtp} disabled={otpInput.length !== 4} className="w-full rounded-lg py-2.5 text-sm font-bold text-white"
            style={{ background: otpInput.length === 4 ? C.marigoldDeep : C.line, color: otpInput.length === 4 ? "#fff" : "#9AA3B0" }}>
            {lang === "en" ? "Confirm" : "पुष्टि करें"}
          </button>
        </div>
        {otpError && <div className="text-[11px] font-semibold mt-1.5" style={{ color: C.safety }}>{lang === "en" ? "Incorrect OTP — ask the customer again" : "OTP गलत है — ग्राहक से दोबारा पूछें"}</div>}
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="rounded-lg p-3" style={{ background: C.navy }}>
        {trip.hours ? (
          <>
            <div className="text-[11px]" style={{ color: "#D9C4B0" }}>{clock.isOvertime ? (lang === "en" ? "Allowed time over — extra time running" : "अलाउ समय खत्म — अतिरिक्त समय चल रहा है") : (lang === "en" ? "Time remaining (reverse timer)" : "बचा हुआ समय (रिवर्स टाइमर)")}</div>
            <div className="text-xl font-bold text-white" style={{ fontFamily: monoFont }}>{clock.isOvertime ? clock.elapsedStr : clock.remainingStr}</div>
            <div className="text-[11px] mt-1" style={{ color: "#D9C4B0" }}>{lang === "en" ? `Allowed: ${trip.hours} hrs · elapsed ${clock.elapsedStr}` : `अलाउ समय: ${trip.hours} घंटे · अब तक ${clock.elapsedStr}`}</div>
          </>
        ) : (
          <>
            <div className="text-[11px]" style={{ color: "#D9C4B0" }}>{lang === "en" ? "Loading started" : "लोडिंग शुरू हुए"}</div>
            <div className="text-xl font-bold text-white" style={{ fontFamily: monoFont }}>{clock.elapsedStr}</div>
            <div className="text-[11px] mt-1" style={{ color: "#D9C4B0" }}>{lang === "en" ? "Driver had not set allowed hours" : "ड्राइवर ने अलाउ घंटे नहीं भरे थे"}</div>
          </>
        )}
        {trip.extraHourRate && clock.isOvertime && (
          <div className="rounded-lg mt-2 p-2" style={{ background: "#4A1512" }}>
            <div className="text-[11px] font-bold" style={{ color: "#FF8A80" }}>🔔 {lang === "en" ? "Beep-beep! Allowed time is over" : "बीप-बीप! अलाउ समय खत्म हो गया"}</div>
            <div className="text-[11px] mt-0.5" style={{ color: "#F5C6C2" }}>
              {lang === "en" ? `Extra time: ${clock.extraHours.toFixed(2)} hrs · Extra fare: ${fmt(clock.extraCharge)}` : `अतिरिक्त समय: ${clock.extraHours.toFixed(2)} घंटे · अतिरिक्त भाड़ा: ${fmt(clock.extraCharge)}`}
            </div>
          </div>
        )}
      </div>
      <button onClick={() => startLoading(trip.id, -3600000)} className="w-full text-center text-[11px] font-semibold py-2" style={{ color: C.inkSoft }}>
        {lang === "en" ? "+ Advance 1 hour (test)" : "+ 1 घंटा आगे बढ़ाएं (टेस्ट)"}
      </button>
      <button onClick={() => completeBooking(trip.id, clock.extraCharge)} className="w-full rounded-lg py-2.5 font-bold text-sm text-white" style={{ background: C.success }}>
        {lang === "en" ? "End Trip — Complete Trip" : "एंड ट्रिप — ट्रिप पूरी करें"} {clock.extraCharge > 0 ? `(+${fmt(clock.extraCharge)})` : ""}
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
      <div className="text-[11px] mb-2 flex items-center gap-1.5" style={{ color: C.inkSoft }}>
        {vehicleLabel(v, lang)} · {materialLabel(load.material, lang)} · {load.weight} {lang === "en" ? "kg" : "किग्रा"}
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: load.serviceType === "outstation" ? "#FBEBD2" : "#DFEEE2", color: load.serviceType === "outstation" ? "#A8721C" : C.success }}>{serviceTypeLabel(load.serviceType, lang)}</span>
      </div>
      {load.scheduledFor && (
        <div className="text-[10px] font-semibold mb-2 flex items-center gap-1" style={{ color: "#A8721C" }}>
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

function DriverHome({ driver, setDriver, bookings, addBid, completeBooking, startLoading, vehicleTypes, lang, commissionPct, minWallet, trialMode }) {
  const myTrip = bookings.find((b) => b.status === "Ongoing" && b.driverName === driver.name);
  const [openLoadId, setOpenLoadId] = useState(null);
  // A driver sees a load if it needs their exact vehicle type, or any
  // smaller/lighter type — a bigger truck can always carry a smaller load,
  // so "above" vehicle options can bid too, not just an exact match.
  const driverVehicleDef = vehicleTypes.find((v) => v.key === driver.vehicleSpec?.type);
  const openLoads = bookings.filter((b) => {
    if (b.status !== "Bidding") return false;
    if (!driverVehicleDef) return true;
    const loadVehicleDef = vehicleTypes.find((v) => v.key === b.vehicle);
    if (!loadVehicleDef) return b.vehicle === driver.vehicleSpec.type;
    return loadVehicleDef.capacityKg <= driverVehicleDef.capacityKg;
  });
  const openLoad = openLoads.find((l) => l.id === openLoadId);

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
    if (freshLoads.length > 0 && driver.online && driver.kyc === "Approved" && !driver.blacklisted) {
      playBeepTone();
      setNewLoadToast(freshLoads[0]);
      setTimeout(() => setNewLoadToast((cur) => (cur?.id === freshLoads[0].id ? null : cur)), 4000);
    }
    seenLoadIdsRef.current = currentIds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadIdsKey]);

  // Real GPS live-tracking: while this driver has an active trip, share their
  // actual device location so the customer (and admin fleet map) see it live.
  const lastGpsWriteRef = useRef(0);
  useEffect(() => {
    if (!myTrip || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastGpsWriteRef.current < 5000) return; // throttle Firestore writes
        lastGpsWriteRef.current = now;
        const location = { lat: pos.coords.latitude, lng: pos.coords.longitude, updatedAt: now };
        patchDoc("bookings", myTrip.id, { driverLocation: location }).catch((e) => console.error(e));
        if (driver.mobile) patchDoc("drivers", driver.mobile, { lastKnownLocation: location }).catch((e) => console.error(e));
      },
      (err) => console.error("GPS tracking error", err),
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [myTrip?.id, driver.mobile]);

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
          className="flex items-center gap-2 rounded-full pl-3 pr-1 py-1" style={{ background: driver.online ? C.navy : "#9AA3B0" }}>
          <span className="text-[11px] font-bold text-white">{driver.online ? (lang === "en" ? "Online" : "ऑनलाइन") : (lang === "en" ? "Offline" : "ऑफलाइन")}</span>
          <span className="w-9 h-5 rounded-full relative" style={{ background: driver.online ? C.marigold : "#A69686" }}>
            <span className="w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-all" style={{ left: driver.online ? 19 : 2 }} />
          </span>
        </button>
      </div>

      {newLoadToast && (
        <div className="rounded-lg p-2.5 mb-3 flex items-center gap-2" style={{ background: C.navy }}>
          <Bell size={14} color={C.marigold} />
          <span className="text-[11px] font-bold text-white">🔔 {lang === "en" ? "New load" : "नया लोड"}: {newLoadToast.pickup} → {newLoadToast.drop}</span>
        </div>
      )}

      {driver.blacklisted && (
        <div className="rounded-lg p-3 mb-4 flex items-center gap-2" style={{ background: "#FCEAE3" }}>
          <XCircle size={15} color={C.safety} />
          <span className="text-xs font-semibold" style={{ color: C.safety }}>{lang === "en" ? "Your account has been blocked by admin — loads won't show." : "आपका खाता एडमिन द्वारा ब्लॉक किया गया है — लोड नहीं दिखेंगे।"}</span>
        </div>
      )}

      {myTrip ? (
        <div>
          <div className="rounded-2xl p-3.5 mb-2.5 shadow-sm flex items-center justify-between" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
            <span className="text-sm font-bold flex items-center gap-1.5" style={{ color: C.pimpri }}><Truck size={15} /> {lang === "en" ? "Trip in progress" : "ट्रिप जारी है"}</span>
            <span className="text-xs font-mono" style={{ color: C.inkSoft }}>{myTrip.id}</span>
          </div>

          <div className="rounded-2xl p-3 mb-2.5 shadow-sm flex items-center justify-between" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
            <span className="text-sm font-bold flex items-center gap-1.5" style={{ color: C.pimpri }}><Navigation size={15} /> {lang === "en" ? "Live Tracking" : "लाइव ट्रैकिंग"} <Activity size={14} /></span>
          </div>

          <div className="rounded-2xl p-3 mb-2.5 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
            <LiveTrackingMap pickup={myTrip.pickup} drop={myTrip.drop} pickupLat={myTrip.pickupLat} pickupLng={myTrip.pickupLng} dropLat={myTrip.dropLat} dropLng={myTrip.dropLng} driverLocation={myTrip.driverLocation} progress={myTrip.progress} zoneColor={C.pimpri} height={130} lang={lang} />
            <div className="text-xs mt-2" style={{ color: C.ink }}>{myTrip.pickup} → {myTrip.drop}</div>
          </div>

          <div className="rounded-2xl p-3.5 mb-2.5" style={{ background: "#F5E6C8", border: `1.5px solid ${C.pimpri}` }}>
            <div className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Fare and Waiting Policy" : "भाड़ा और वेटिंग नियम"}</div>
            <div className="text-base font-extrabold mt-1" style={{ color: "#000000", fontFamily: bodyFont, fontVariantNumeric: "tabular-nums" }}>{lang === "en" ? "Fixed fare:" : "तय भाड़ा:"} {fmt(myTrip.fare)}</div>
            {myTrip.hours && (
              <div className="text-sm font-bold mt-1" style={{ color: "#000000", fontFamily: bodyFont, fontVariantNumeric: "tabular-nums" }}>
                {lang === "en" ? `${myTrip.hours} allowed hrs` : `${myTrip.hours} घंटे अलाउ`}{myTrip.extraHourRate ? (lang === "en" ? ` · then ${fmt(myTrip.extraHourRate)}/hr waiting` : ` · उसके बाद ${fmt(myTrip.extraHourRate)}/घंटा वेटिंग`) : ""}
              </div>
            )}
            <div className="flex items-center gap-1.5 mt-2">
              <Phone size={14} color="#000000" />
              {myTrip.customerMobile ? (
                <>
                  <a href={`tel:${myTrip.customerMobile}`} className="text-sm font-extrabold px-1.5 py-0.5 rounded" style={{ color: "#000000", fontFamily: bodyFont, fontVariantNumeric: "tabular-nums", letterSpacing: 0.3, background: "#FFE066" }}>{myTrip.customerMobile}</a>
                  <span className="text-sm font-semibold" style={{ color: "#000000", fontFamily: bodyFont }}>{lang === "en" ? "Call Customer" : "ग्राहक को कॉल करें"}</span>
                </>
              ) : (
                <span className="text-sm font-bold" style={{ color: "#000000", fontFamily: bodyFont }}>{lang === "en" ? "revealing after commission cut..." : "कमीशन कटने के बाद दिखेगा..."}</span>
              )}
            </div>
          </div>

          <div className="rounded-2xl p-3 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
            <div className="text-[10px]" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Collect the remaining 90% fare directly from the customer (cash / UPI) after delivery." : "डिलीवरी के बाद बचा हुआ 90% भाड़ा ग्राहक से सीधे (नकद / UPI) वसूलें।"}</div>
            <LoadingTimer trip={myTrip} startLoading={startLoading} completeBooking={completeBooking} lang={lang} />
          </div>
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
        <div className="fixed inset-0 z-40 flex items-end justify-center" style={{ background: "rgba(42,33,28,0.6)" }} onClick={() => setOpenLoadId(null)}>
          <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-t-2xl p-4" style={{ background: C.bg }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold" style={{ color: C.ink }}>{lang === "en" ? "Request Details" : "रिक्वेस्ट की डिटेल"}</span>
              <button onClick={() => setOpenLoadId(null)} className="text-xs font-bold px-2 py-1 rounded" style={{ color: C.inkSoft }}>✕</button>
            </div>
            <LoadAlertCard load={openLoad} vehicleTypes={vehicleTypes} driver={driver} addBid={(id, bid) => { addBid(id, bid); setOpenLoadId(null); }} lang={lang}
              commissionPct={commissionPct} minWallet={minWallet} trialMode={trialMode} />
          </div>
        </div>
      )}
    </div>
  );
}

function DriverWallet({ driver, setDriver, tripLog, commissionPct, minWallet, bonusPct, trialMode, lang, withdrawals, requestWithdrawal, rechargeRequests, requestRecharge }) {
  const myTrips = tripLog.filter((t) => t.driverName === driver.name && t.status !== "Cancelled");
  const totalCommission = myTrips.reduce((s, t) => s + t.fare * (commissionPct / 100), 0);
  const totalBonus = myTrips.reduce((s, t) => s + t.fare * (bonusPct / 100), 0);
  const myWithdrawals = (withdrawals || []).filter((w) => w.driverName === driver.name);
  const myRecharges = (rechargeRequests || []).filter((r) => r.driverName === driver.name);
  const hasPendingRecharge = myRecharges.some((r) => r.status === "Pending");
  return (
    <div className="px-5 py-5">
      <h2 className="text-base font-bold mb-3" style={{ color: C.ink }}>{lang === "en" ? "My Wallet" : "मेरा वॉलेट"}</h2>
      {trialMode && (
        <div className="rounded-lg p-3 mb-3 flex items-center gap-2" style={{ background: "#DFEEE2" }}>
          <CheckCircle2 size={15} color={C.success} />
          <span className="text-xs font-semibold" style={{ color: C.success }}>{lang === "en" ? "Free trial is active — no commission will be cut and no minimum wallet balance is required." : "अभी फ्री ट्रायल चल रहा है — कोई कमीशन नहीं कटेगा और न्यूनतम वॉलेट बैलेंस की ज़रूरत नहीं है।"}</span>
        </div>
      )}
      <div className="rounded-xl p-4 mb-3" style={{ background: C.navy }}>
        <div className="text-[11px]" style={{ color: "#D9C4B0" }}>{lang === "en" ? "Wallet Balance" : "वॉलेट बैलेंस"}</div>
        <div className="text-3xl font-bold text-white mt-1" style={{ fontFamily: monoFont }}>{fmt(driver.wallet)}</div>
        {!trialMode && driver.wallet < minWallet && (
          <div className="text-[11px] mt-2 font-semibold" style={{ color: C.safety }}>{lang === "en" ? `Minimum ${fmt(minWallet)} balance required — app may be deactivated` : `न्यूनतम ${fmt(minWallet)} बैलेंस ज़रूरी है — ऐप बंद हो सकता है`}</div>
        )}
        {(driver.heldCredit || 0) > 0 && (
          <div className="text-[11px] mt-2 font-semibold" style={{ color: C.marigold }}>{lang === "en" ? `${fmt(driver.heldCredit)} held from a cancelled trip — will auto-adjust against your next trip's commission.` : `रद्द हुई ट्रिप से ${fmt(driver.heldCredit)} होल्ड में है — अगली ट्रिप के कमीशन में अपने आप एडजस्ट होगा।`}</div>
        )}
      </div>
      <button onClick={() => requestRecharge(500)} disabled={hasPendingRecharge} className="w-full rounded-lg py-2.5 font-bold text-sm mb-2"
        style={{ background: hasPendingRecharge ? C.line : C.marigold, color: hasPendingRecharge ? "#9AA3B0" : C.navy }}>
        {hasPendingRecharge ? (lang === "en" ? "Recharge request pending admin approval" : "रीचार्ज रिक्वेस्ट एडमिन अप्रूवल के इंतज़ार में") : (lang === "en" ? "Request ₹500 recharge (UPI / Paytm)" : "₹500 रीचार्ज रिक्वेस्ट करें (UPI / Paytm)")}
      </button>
      <div className="text-[11px] mb-2" style={{ color: C.inkSoft }}>{lang === "en" ? "Pay admin via UPI/Paytm outside the app, then request a recharge — admin verifies and credits your wallet." : "ऐप के बाहर UPI/Paytm से एडमिन को भुगतान करें, फिर रीचार्ज रिक्वेस्ट करें — एडमिन जांच कर वॉलेट में जमा करेगा।"}</div>
      {myRecharges.length > 0 && (
        <div className="mb-2">
          <div className="space-y-1.5">
            {myRecharges.map((r) => (
              <div key={r.id} className="rounded-lg px-3 py-2 flex items-center justify-between" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                <span className="text-xs font-semibold" style={{ color: C.ink, fontFamily: monoFont }}>{fmt(r.amount)}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: r.status === "Approved" ? C.success : C.marigoldDeep, background: r.status === "Approved" ? "#DFEEE2" : "#FBEBD2" }}>
                  {r.status === "Approved" ? (lang === "en" ? "Credited ✓" : "जमा हुआ ✓") : (lang === "en" ? "Pending admin approval" : "एडमिन अप्रूवल बाकी")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
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
          style={{ background: driver.bonus ? C.success : C.line, color: driver.bonus ? "#fff" : "#9AA3B0" }}>
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
      <div className="rounded-lg p-3 flex items-center justify-between" style={{ background: "#F5E6C8" }}>
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

function DriverKyc({ driver, setDriver, vehicleTypes, addVehicleType, lang, stepLabel }) {
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

  const onVehiclePhoto = (setVal, key) => (f) => {
    if (!f) return;
    markUploading(key, true);
    uploadPhoto(f, `drivers/${driver.mobile}/${key}.jpg`).then((p) => { setVal(p); markUploading(key, false); });
  };
  const onDoc = (setVal, key) => (f) => {
    if (!f) return;
    markUploading(key, true);
    uploadPhoto(f, `drivers/${driver.mobile}/${key}.jpg`).then((p) => { setVal(p); markUploading(key, false); });
  };

  const canSubmit = !!(photo && dl && vehiclePhotoFront && vehiclePhotoSide && vehicleNumber.trim() && vehicleTypeName.trim() && !anyUploading);
  const submit = () => {
    if (!canSubmit) return;
    setDriver({
      ...driver, kyc: "Pending", docs: { dl, photo },
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
  };

  const inputCls = "w-full rounded-lg px-3 py-2.5 text-sm outline-none";
  const inputStyle = { background: C.paper, border: `1px solid ${C.line}`, color: C.ink };
  const docLabels = lang === "en"
    ? { photo: "Driver Photo", dl: "Driving License" }
    : { photo: "ड्राइवर फोटो", dl: "ड्राइविंग लाइसेंस" };

  return (
    <div className="px-5 py-5">
      {stepLabel && <div className="text-[11px] font-bold mb-2" style={{ color: C.marigoldDeep }}>{stepLabel}</div>}
      <h2 className="text-base font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "Documents (KYC)" : "दस्तावेज़ (KYC)"}</h2>
      <p className="text-xs mb-4" style={{ color: C.inkSoft }}>{lang === "en" ? "Upload your photo and driving license, and enter your vehicle's number and dimensions." : "अपनी फोटो और ड्राइविंग लाइसेंस अपलोड करें, और अपनी गाड़ी का नंबर व साइज़ डालें।"}</p>

      <div className="rounded-lg p-3 mb-4 flex items-center gap-2" style={{ background: driver.kyc === "Approved" ? "#DFEEE2" : "#FBEBD2" }}>
        <ShieldCheck size={16} color={driver.kyc === "Approved" ? C.success : C.marigoldDeep} />
        <span className="text-xs font-semibold" style={{ color: driver.kyc === "Approved" ? C.success : C.marigoldDeep }}>{lang === "en" ? "Status" : "स्टेटस"}: {driver.kyc === "Approved" ? (lang === "en" ? "Verified" : "सत्यापित") : (lang === "en" ? "Pending" : "लंबित")}</span>
      </div>

      <div className="text-[11px] font-bold mb-2" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Documents" : "दस्तावेज़"}</div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[
          ["photo", docLabels.photo, photo, setPhoto], ["dl", docLabels.dl, dl, setDl],
        ].map(([key, label, val, setVal]) => (
          <PhotoPicker key={key} label={label} lang={lang} onSelect={onDoc(setVal, key)}>
            <div className="rounded-lg overflow-hidden flex flex-col items-center justify-center text-center cursor-pointer" style={{ border: `1.5px dashed ${C.line}`, background: C.paper, minHeight: 86 }}>
              {uploadingKeys[key] ? (
                <div className="p-2 flex flex-col items-center justify-center">
                  <span className="text-[10px] font-semibold" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Uploading..." : "अपलोड हो रहा है..."}</span>
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
              <span className="text-[9px] mt-0.5 pb-1 truncate max-w-full" style={{ color: val ? C.success : C.inkSoft }}>{val ? (lang === "en" ? "Uploaded ✓" : "अपलोड ✓") : (lang === "en" ? "Take photo" : "फोटो लें")}</span>
            </div>
          </PhotoPicker>
        ))}
      </div>

      <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Vehicle Registered Number" : "गाड़ी रजिस्टर्ड नंबर"}</label>
      <input className={inputCls} style={{ ...inputStyle, fontFamily: monoFont, textTransform: "uppercase", marginBottom: 12 }} placeholder="MH-14-XX-XXXX" value={vehicleNumber}
        onChange={(e) => setVehicleNumber(e.target.value)} />

      <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Vehicle Dimensions" : "गाड़ी का साइज़"}</label>
      <div className="grid grid-cols-2 gap-2 mb-4">
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

      <div className="text-[11px] font-bold mb-2" style={{ color: "#A8721C" }}>{lang === "en" ? "Step 2 — Vehicle Details" : "स्टेप 2 — गाड़ी की जानकारी"}</div>
      <div className="rounded-xl p-3 mb-4" style={{ border: `1.5px solid #A8721C`, background: "#F5E6C8" }}>
        <div className="text-xs font-bold mb-2 flex items-center gap-1.5" style={{ color: "#A8721C" }}><Truck size={14} /> {lang === "en" ? "Fill this clearly — customer will see this" : "साफ-साफ भरें — कस्टमर को यही दिखेगी"}</div>

        <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Vehicle Name" : "गाड़ी का नाम"}</label>
        <input className={inputCls} style={{ ...inputStyle, marginBottom: 10 }} placeholder={lang === "en" ? "e.g. Tata 109" : "जैसे: Tata 109"} value={vehicleTypeName} onChange={(e) => setVehicleTypeName(e.target.value)} />

        <label className="text-xs font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Vehicle Photos (Front & Side)" : "गाड़ी की फोटो (आगे व साइड)"}</label>
        <div className="grid grid-cols-2 gap-2 mb-2">
          {[
            ["vehicleFront", lang === "en" ? "Front" : "आगे से", vehiclePhotoFront, setVehiclePhotoFront],
            ["vehicleSide", lang === "en" ? "Side" : "साइड से", vehiclePhotoSide, setVehiclePhotoSide],
          ].map(([key, label, val, setVal]) => (
            <PhotoPicker key={key} label={label} lang={lang} onSelect={onVehiclePhoto(setVal, key)}>
              <div className="rounded-lg p-2 flex flex-col items-center justify-center cursor-pointer" style={{ border: `1.5px dashed #A8721C`, background: C.paper, minHeight: 110 }}>
                {uploadingKeys[key] ? (
                  <div className="text-xs font-semibold py-6" style={{ color: "#A8721C" }}>{lang === "en" ? "Uploading..." : "अपलोड हो रहा है..."}</div>
                ) : (
                  <SafeImage
                    src={val?.url}
                    alt={label}
                    className="w-full h-24 rounded-lg object-cover"
                    fallback={
                      <>
                        <div className="w-10 h-10 rounded-full flex items-center justify-center mb-1" style={{ background: "#F5E6C8" }}><Camera size={18} color="#A8721C" /></div>
                        <div className="text-[10px] font-semibold text-center" style={{ color: C.ink }}>{label}</div>
                      </>
                    }
                  />
                )}
              </div>
              <div className="text-[9px] mt-0.5 text-center" style={{ color: val ? C.success : C.inkSoft }}>
                {val ? (lang === "en" ? "Uploaded ✓" : "अपलोड ✓") : (lang === "en" ? "Tap to upload" : "अपलोड के लिए टैप करें")}
              </div>
            </PhotoPicker>
          ))}
        </div>
        <div className="rounded-lg p-2.5" style={{ background: "#F0EAE0" }}>
          <div className="text-[10px] font-semibold mb-1" style={{ color: C.ink }}>{lang === "en" ? "For a good photo:" : "अच्छी फोटो के लिए:"}</div>
          <div className="text-[10px]" style={{ color: C.inkSoft, lineHeight: 1.6 }}>
            {lang === "en" ? (
              <>• Take it in daylight, at a clean spot<br />• The full vehicle should be in frame<br />• The number plate should be clearly visible<br />• Don't upload blurry, dark, or cropped photos</>
            ) : (
              <>• दिन की रोशनी में, साफ जगह पर फोटो लें<br />• पूरी गाड़ी फ्रेम में आनी चाहिए<br />• गाड़ी नंबर प्लेट साफ दिखनी चाहिए<br />• धुंधली, अंधेरी या कटी हुई फोटो न डालें</>
            )}
          </div>
        </div>
      </div>

      {!canSubmit && <div className="text-[11px] font-semibold mb-2" style={{ color: C.safety }}>{lang === "en" ? "Upload your photo, license, both vehicle photos, and enter the vehicle name & number to submit" : "सबमिट करने के लिए अपनी फोटो, लाइसेंस, गाड़ी की दोनों फोटो, गाड़ी का नाम और नंबर डालें"}</div>}
      <button onClick={submit} disabled={!canSubmit} className="w-full rounded-lg py-3 font-bold text-sm" style={{ background: canSubmit ? C.marigold : C.line, color: canSubmit ? C.navy : "#9AA3B0" }}>{lang === "en" ? "Submit" : "सबमिट करें"}</button>
    </div>
  );
}

function DriverApp({ driver, setDriver, bookings, addBid, completeBooking, startLoading, tripLog, vehicleTypes, addVehicleType, raiseAlert, commissionPct, minWallet, bonusPct, trialMode, lang, onLogout, withdrawals, requestWithdrawal, rechargeRequests, requestRecharge, onOpenTerms, onGoHome }) {
  const [tab, setTab] = useState("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsView, setSettingsView] = useState(null); // 'kyc' | 'helpline' | 'profile' | 'liveLocation' | null
  const tabs = [["home", "होम", LayoutDashboard], ["wallet", "वॉलेट", Wallet], ["history", "हिस्ट्री", Package]];
  const myTrip = bookings.find((b) => b.status === "Ongoing" && b.driverName === driver.name);

  const shareApp = () => {
    // The ₹200 referral reward is a customer-side program (see spec) — a
    // driver's share link doesn't carry a referral code.
    const msg = lang === "en"
      ? "Join Sarthi Transport as a driver — bid your own fare, no more middlemen! Download: https://sarthitransport.example.com"
      : "सार्थी ट्रांसपोर्ट में ड्राइवर बनकर जुड़ें — अपना भाड़ा खुद तय करें! डाउनलोड करें: https://sarthitransport.example.com";
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  if (settingsView) {
    return (
      <div className="flex-1 overflow-y-auto relative">
        <button onClick={() => setSettingsView(null)} className="flex items-center gap-1 mx-5 mt-4 pl-2 pr-3 py-1.5 rounded-full text-xs font-bold self-start" style={{ background: "#F5E6C8", color: C.marigoldDeep }}>
          <ChevronLeft size={16} strokeWidth={2.75} /> {lang === "en" ? "Back" : "वापस"}
        </button>
        {settingsView === "kyc" && <DriverKyc driver={driver} setDriver={setDriver} vehicleTypes={vehicleTypes} addVehicleType={addVehicleType} lang={lang} />}
        {settingsView === "helpline" && <SosScreen role="driver" raiseAlert={raiseAlert} lang={lang} />}
        {settingsView === "profile" && (
          <div className="px-5 py-4">
            <h2 className="text-base font-bold mb-3" style={{ color: C.ink }}>{lang === "en" ? "My Profile" : "मेरी प्रोफाइल"}</h2>
            <div className="rounded-xl p-4 mb-3 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
              <div className="text-sm font-bold" style={{ color: C.ink }}>{driver.name}</div>
              {driver.mobile && <div className="text-xs mt-0.5" style={{ color: C.inkSoft, fontFamily: monoFont }}>{driver.mobile}</div>}
              <div className="text-xs mt-2" style={{ color: C.inkSoft }}>{lang === "en" ? "Vehicle" : "गाड़ी"}: {driver.vehicleSpec?.vehicleNumber || "—"}</div>
              <div className="text-xs mt-0.5" style={{ color: C.inkSoft }}>{lang === "en" ? "KYC status" : "KYC स्टेटस"}: {driver.kyc === "Approved" ? (lang === "en" ? "Verified" : "सत्यापित") : driver.kyc}</div>
              <div className="text-xs mt-0.5" style={{ color: C.inkSoft }}>{lang === "en" ? "Wallet" : "वॉलेट"}: {fmt(driver.wallet)}</div>
            </div>
            <button onClick={onOpenTerms} className="w-full rounded-lg py-2.5 font-bold text-sm" style={{ background: C.marigold, color: C.navy }}>{lang === "en" ? "Terms & Conditions" : "नियम व शर्तें"}</button>
          </div>
        )}
        {settingsView === "liveLocation" && (
          <div className="px-5 py-4">
            <h2 className="text-base font-bold mb-3" style={{ color: C.ink }}>{lang === "en" ? "Live Location" : "लाइव लोकेशन"}</h2>
            {myTrip ? (
              <>
                <LiveTrackingMap pickup={myTrip.pickup} drop={myTrip.drop} pickupLat={myTrip.pickupLat} pickupLng={myTrip.pickupLng} dropLat={myTrip.dropLat} dropLng={myTrip.dropLng} driverLocation={myTrip.driverLocation} progress={myTrip.progress} zoneColor={C.pimpri} height={200} lang={lang} />
                <div className="text-xs mt-2" style={{ color: C.ink }}>{myTrip.pickup} → {myTrip.drop}</div>
                <div className="text-[11px] mt-1" style={{ color: C.inkSoft }}>{myTrip.progress}% {lang === "en" ? "of the way complete" : "रास्ता पूरा"}</div>
              </>
            ) : (
              <p className="text-xs text-center py-10" style={{ color: C.inkSoft }}>{lang === "en" ? "No active trip right now." : "अभी कोई सक्रिय ट्रिप नहीं है।"}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto relative">
        <div className="flex items-center justify-between px-5 pt-3">
          <button onClick={() => setMenuOpen(true)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#F0EAE0" }}>
            <Menu size={16} color={C.inkSoft} />
          </button>
          {onGoHome && (
            <button onClick={onGoHome} title={lang === "en" ? "Back to main page" : "मुख्य पेज पर वापस जाएं"} className="w-9 h-9 rounded-full flex items-center justify-center shadow-sm" style={{ background: C.marigold, border: `1.5px solid ${C.marigoldDeep}` }}>
              <Home size={18} color={C.navy} strokeWidth={2.5} />
            </button>
          )}
        </div>
        {tab === "home" && <Greeting name={driver?.name} lang={lang} />}
        {menuOpen && (
          <div className="fixed inset-0 z-50 flex" onClick={() => setMenuOpen(false)}>
            <div className="w-72 max-w-[82%] h-full overflow-y-auto" style={{ background: C.paper }} onClick={(e) => e.stopPropagation()}>
              <div className="px-4 py-4" style={{ background: C.navy }}>
                <div className="text-sm font-bold text-white">{driver.name}</div>
                {driver.mobile && <div className="text-[11px]" style={{ color: "#D9C4B0", fontFamily: monoFont }}>{driver.mobile}</div>}
              </div>
              {onGoHome && (
                <button onClick={() => { onGoHome(); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-left" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
                  <Home size={16} color={C.marigoldDeep} /> {lang === "en" ? "Back to Main Page" : "मुख्य पेज पर वापस जाएं"}
                </button>
              )}
              <button onClick={() => { setSettingsView("profile"); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-left" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
                <UserCircle2 size={16} color={C.marigoldDeep} /> {lang === "en" ? "My Profile" : "मेरी प्रोफाइल"}
              </button>
              <button onClick={() => { setTab("history"); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-left" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
                <Package size={16} color={C.marigoldDeep} /> {lang === "en" ? "My Trips" : "मेरी ट्रिप्स"}
              </button>
              <button onClick={() => { setSettingsView("liveLocation"); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-left" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
                <MapPinned size={16} color={C.marigoldDeep} /> {lang === "en" ? "Live Location" : "लाइव लोकेशन"}
              </button>
              <button onClick={() => { setSettingsView("kyc"); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-left" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
                <Settings2 size={16} color={C.marigoldDeep} /> {lang === "en" ? "Settings (KYC & Vehicle)" : "सेटिंग्स (KYC व गाड़ी)"}
              </button>
              <button onClick={() => { shareApp(); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-left" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
                <MessageCircle size={16} color={C.success} /> {lang === "en" ? "Share App" : "ऐप शेयर करें"}
              </button>
              <button onClick={() => { setSettingsView("helpline"); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-left" style={{ color: C.ink, borderBottom: `1px solid ${C.line}` }}>
                <Phone size={16} color={C.safety} /> {lang === "en" ? "Contact & Helpline" : "संपर्क व हेल्पलाइन"}
              </button>
              <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-left" style={{ color: C.safety }}>
                <XCircle size={16} /> {lang === "en" ? "Logout" : "लॉगआउट"}
              </button>
            </div>
            <div className="flex-1" style={{ background: "rgba(42,33,28,0.5)" }} />
          </div>
        )}
        {tab === "home" && <DriverHome driver={driver} setDriver={setDriver} bookings={bookings} addBid={addBid} completeBooking={completeBooking} startLoading={startLoading} vehicleTypes={vehicleTypes} lang={lang} commissionPct={commissionPct} minWallet={minWallet} trialMode={trialMode} />}
        {tab === "wallet" && <DriverWallet driver={driver} setDriver={setDriver} tripLog={tripLog} commissionPct={commissionPct} minWallet={minWallet} bonusPct={bonusPct} trialMode={trialMode} lang={lang} withdrawals={withdrawals} requestWithdrawal={requestWithdrawal} rechargeRequests={rechargeRequests} requestRecharge={requestRecharge} />}
        {tab === "history" && <DriverHistory tripLog={tripLog} driver={driver} commissionPct={commissionPct} lang={lang} />}
      </div>
      <BottomNav tabs={tabs} tab={tab} setTab={setTab} lang={lang} />
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
      <div className="text-[11px] font-semibold" style={{ color: C.inkSoft }}>{label}</div>
      <div className="text-3xl font-bold mt-1" style={{ color, fontFamily: monoFont }}>{value}</div>
    </>
  );
  if (onClick) {
    return (
      <button onClick={onClick} className="rounded-xl p-4 shadow-sm text-left w-full" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
        {content}
      </button>
    );
  }
  return <div className="rounded-xl p-4 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>{content}</div>;
}

function AdminFleet({ drivers, driver, bookings, tripLog, commissionPct, minWallet, lang, onNavigate }) {
  const bookedToday = tripLog.filter((t) => t.status === "Ongoing" || t.status === "Completed").length;
  const readyOnline = drivers.filter((d) => d.online && d.kyc === "Approved" && !d.blacklisted).length;
  const pendingApprovals = drivers.filter((d) => d.kyc === "Pending").length;
  const lowWalletOnline = drivers.filter((d) => d.online && !d.blacklisted && d.wallet < minWallet).length;

  const isToday = (b) => {
    const d = b.createdAt?.toDate ? b.createdAt.toDate() : null;
    if (!d) return false;
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  };
  const todaysEarnings = (bookings || []).filter((b) => b.status === "Completed" && isToday(b)).reduce((s, b) => s + (b.fare || 0) * (commissionPct / 100), 0);
  const cancelledToday = (bookings || []).filter((b) => b.status === "Cancelled" && isToday(b)).length;

  const statusMeta = lang === "en"
    ? { Bidding: { label: "Awaiting bids", color: C.marigoldDeep, bg: "#FBEBD2" }, Ongoing: { label: "Ongoing", color: C.marigoldDeep, bg: "#FBEBD2" }, Completed: { label: "Completed", color: C.success, bg: "#DFEEE2" }, Cancelled: { label: "Cancelled", color: C.safety, bg: "#FCEAE3" } }
    : { Bidding: { label: "बिड बाकी", color: C.marigoldDeep, bg: "#FBEBD2" }, Ongoing: { label: "चालू", color: C.marigoldDeep, bg: "#FBEBD2" }, Completed: { label: "पूर्ण", color: C.success, bg: "#DFEEE2" }, Cancelled: { label: "रद्द", color: C.safety, bg: "#FCEAE3" } };
  const recentActivity = (bookings || []).slice(0, 8);
  const activityTime = (b) => (b.createdAt?.toDate ? b.createdAt.toDate().toLocaleTimeString(lang === "en" ? "en-IN" : "hi-IN", { hour: "2-digit", minute: "2-digit" }) : "—");

  const [vehicleQuery, setVehicleQuery] = useState("");
  const q = vehicleQuery.trim().toUpperCase();
  const matchedDriver = q ? drivers.find((d) => d.vehicleSpec?.vehicleNumber?.toUpperCase() === q) : null;
  const vehicleHistory = matchedDriver ? tripLog.filter((t) => t.driverName === matchedDriver.name) : [];

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <StatTile label={lang === "en" ? "Pending KYC approvals" : "लंबित KYC अप्रूवल"} value={pendingApprovals} color={pendingApprovals > 0 ? C.safety : C.success} onClick={onNavigate ? () => onNavigate("kyc") : undefined} />
        <StatTile label={lang === "en" ? "Online — ready for bookings" : "ऑनलाइन — बुकिंग के लिए तैयार"} value={readyOnline} color={C.success} />
        <StatTile label={lang === "en" ? "Booked today" : "आज कितनी गाड़ियां बुक हुईं"} value={bookedToday} color={C.pimpri} />
        <StatTile label={lang === "en" ? "Cancelled today" : "आज रद्द हुईं"} value={cancelledToday} color={cancelledToday > 0 ? C.safety : C.success} />
        <StatTile label={lang === "en" ? "Today's earnings (commission)" : "आज की कमाई (कमीशन)"} value={fmt(todaysEarnings)} color={C.pimpri} onClick={onNavigate ? () => onNavigate("finance") : undefined} />
        <StatTile label={lang === "en" ? "Online drivers below min. wallet" : "न्यूनतम वॉलेट से कम — ऑनलाइन ड्राइवर"} value={lowWalletOnline} color={lowWalletOnline > 0 ? C.safety : C.success} onClick={onNavigate ? () => onNavigate("drivers") : undefined} />
      </div>

      <div className="rounded-xl p-4 mb-5 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
        <div className="text-sm font-bold mb-2 flex items-center gap-1.5" style={{ color: C.ink }}><Truck size={16} /> {lang === "en" ? "Search history by vehicle number" : "गाड़ी नंबर से हिस्ट्री देखें"}</div>
        <input value={vehicleQuery} onChange={(e) => setVehicleQuery(e.target.value)} placeholder="जैसे: MH-14-AB-4521"
          className="w-full rounded-lg px-3 py-2 text-xs outline-none" style={{ border: `1px solid ${C.line}`, color: C.ink, fontFamily: monoFont }} />
        {q && !matchedDriver && (
          <div className="text-[11px] mt-2" style={{ color: C.safety }}>{lang === "en" ? "No vehicle found with this number." : "इस नंबर की कोई गाड़ी नहीं मिली।"}</div>
        )}
        {matchedDriver && (
          <div className="mt-3">
            <div className="text-xs font-bold" style={{ color: C.ink }}>{matchedDriver.name} · {matchedDriver.vehicleSpec?.vehicleNumber || "—"}</div>
            <div className="text-[10px] mb-2" style={{ color: C.inkSoft }}>{lang === "en" ? "Total trips" : "कुल ट्रिप्स"}: {vehicleHistory.length}</div>
            {vehicleHistory.length === 0 ? (
              <p className="text-[11px]" style={{ color: C.inkSoft }}>{lang === "en" ? "No trip history for this vehicle yet." : "इस गाड़ी की अभी कोई ट्रिप हिस्ट्री नहीं है।"}</p>
            ) : (
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                {vehicleHistory.map((t) => (
                  <div key={t.id} className="rounded-lg p-2 flex items-center justify-between" style={{ background: "#F5E6C8", border: `1px solid ${C.pimpri}` }}>
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
        <div className="text-sm font-bold mb-2 flex items-center gap-1.5" style={{ color: C.ink }}><Activity size={16} /> {lang === "en" ? "Recent Activity" : "हाल की गतिविधि"}</div>
        {recentActivity.length === 0 ? (
          <p className="text-[11px]" style={{ color: C.inkSoft }}>{lang === "en" ? "No activity yet." : "अभी तक कोई गतिविधि नहीं।"}</p>
        ) : (
          <div className="space-y-1.5">
            {recentActivity.map((b) => {
              const sm = statusMeta[b.status] || statusMeta.Bidding;
              return (
                <div key={b.id} className="rounded-lg p-2.5 flex items-center justify-between gap-2" style={{ background: "#F8F4EC" }}>
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
          <div className={`w-full ${height} flex items-center justify-center`} style={{ background: "#F3F4F6" }}>
            <XCircle size={16} color={C.safety} />
          </div>
        }
      />
      <div className="text-[10px] font-semibold text-center py-1 flex items-center justify-center gap-1" style={{ color: url ? C.success : C.safety, background: url ? "#DFEEE2" : "#FCEAE3" }}>
        {url ? <CheckCircle2 size={11} /> : <XCircle size={11} />} {label}
      </div>
      {url && (
        <div className="flex" style={{ borderTop: `1px solid ${C.line}` }}>
          <button onClick={() => window.open(url, "_blank", "noopener,noreferrer")} className="flex-1 flex items-center justify-center gap-1 py-1 text-[10px] font-semibold" style={{ color: C.marigoldDeep }}>
            <Eye size={11} /> {lang === "en" ? "View" : "देखें"}
          </button>
          <button onClick={handleDownload} className="flex-1 flex items-center justify-center gap-1 py-1 text-[10px] font-semibold" style={{ color: C.marigoldDeep, borderLeft: `1px solid ${C.line}` }}>
            <Download size={11} /> {lang === "en" ? "Download" : "डाउनलोड"}
          </button>
        </div>
      )}
    </div>
  );
}

function AdminKyc({ drivers, updateDriverKyc, lang }) {
  const pending = drivers.filter((d) => d.kyc === "Pending");
  const [expandedId, setExpandedId] = useState(null);
  const docLabels = lang === "en"
    ? { photo: "Driver Photo", dl: "Driving License" }
    : { photo: "ड्राइवर फोटो", dl: "ड्राइविंग लाइसेंस" };
  return (
    <div className="rounded-xl p-4 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
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
                    <div className="text-[10px]" style={{ color: C.inkSoft, fontFamily: monoFont }}>{d.vehicleSpec?.vehicleNumber || "—"} · {d.mobile}</div>
                    <div className="text-[10px] font-semibold mt-0.5" style={{ color: "#A8721C" }}>{expanded ? (lang === "en" ? "▲ Hide details" : "▲ डिटेल छुपाएं") : (lang === "en" ? "▼ View KYC details" : "▼ KYC डिटेल देखें")}</div>
                  </button>
                  <div className="flex gap-2">
                    <button onClick={() => updateDriverKyc(d.id, "Rejected")} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "#FCEAE3", color: C.safety }}>{lang === "en" ? "Block" : "Block"}</button>
                    <button onClick={() => updateDriverKyc(d.id, "Approved")} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: C.success }}>{lang === "en" ? "Approve" : "Approve"}</button>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.line}` }}>
                    <div className="text-[11px] font-semibold mb-1.5" style={{ color: C.inkSoft }}>{lang === "en" ? "Submitted documents:" : "जमा किए गए दस्तावेज़:"}</div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {Object.entries(docLabels).map(([key, label]) => {
                        const doc = d.docs?.[key];
                        return <KycDocThumb key={key} url={doc?.url} label={label} lang={lang} fileName={`${d.name}-${key}.jpg`} />;
                      })}
                    </div>
                    {(d.vehicleSpec?.photo || d.vehicleSpec?.photoSide) && (
                      <>
                        <div className="text-[11px] font-semibold mb-1.5" style={{ color: C.inkSoft }}>{lang === "en" ? "Vehicle photos:" : "गाड़ी की फोटो:"}</div>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          {d.vehicleSpec?.photo && <KycDocThumb url={d.vehicleSpec.photo.url} label={lang === "en" ? "Vehicle - Front" : "गाड़ी - आगे"} lang={lang} fileName={`${d.name}-vehicle-front.jpg`} height="h-28" />}
                          {d.vehicleSpec?.photoSide && <KycDocThumb url={d.vehicleSpec.photoSide.url} label={lang === "en" ? "Vehicle - Side" : "गाड़ी - साइड"} lang={lang} fileName={`${d.name}-vehicle-side.jpg`} height="h-28" />}
                        </div>
                      </>
                    )}
                    {d.vehicleSpec && (
                      <div className="text-[11px] mb-2" style={{ color: C.ink }}>
                        <b>{lang === "en" ? "Vehicle number" : "गाड़ी नंबर"}:</b> <span style={{ fontFamily: monoFont }}>{d.vehicleSpec.vehicleNumber || "—"}</span><br />
                        <b>{lang === "en" ? "Capacity/size" : "क्षमता/साइज़"}:</b> {d.vehicleSpec.capacityKg ? `${d.vehicleSpec.capacityKg} ${lang === "en" ? "kg" : "किग्रा"}` : "—"} ·{" "}
                        {d.vehicleSpec.length || "—"}×{d.vehicleSpec.width || "—"}×{d.vehicleSpec.height || "—"} {lang === "en" ? "ft" : "फीट"}
                      </div>
                    )}
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

function AdminAlerts({ alerts, withdrawals, approveWithdrawal, rechargeRequests, approveRecharge, lang }) {
  const roleLabel = lang === "en" ? { customer: "Customer", driver: "Driver" } : { customer: "ग्राहक", driver: "ड्राइवर" };
  const pendingWithdrawals = (withdrawals || []).filter((w) => w.status === "Pending");
  const pendingRecharges = (rechargeRequests || []).filter((r) => r.status === "Pending");
  return (
    <div className="space-y-4">
      {pendingRecharges.length > 0 && (
        <div className="rounded-xl p-4 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          <div className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: C.ink }}><Wallet size={16} color={C.marigoldDeep} /> {lang === "en" ? "Wallet Recharge Requests" : "वॉलेट रीचार्ज रिक्वेस्ट"}</div>
          <div className="space-y-2">
            {pendingRecharges.map((r) => (
              <div key={r.id} className="rounded-lg p-3 flex items-center justify-between" style={{ background: "#FBEBD2" }}>
                <div>
                  <div className="text-xs font-bold" style={{ color: C.ink }}>{r.driverName}</div>
                  <div className="text-[10px]" style={{ color: C.inkSoft }}>{r.time}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: C.marigoldDeep, fontFamily: monoFont }}>{fmt(r.amount)}</span>
                  <button onClick={() => approveRecharge(r.id)} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: C.marigoldDeep }}>{lang === "en" ? "Approve" : "अप्रूव करें"}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {pendingWithdrawals.length > 0 && (
        <div className="rounded-xl p-4 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          <div className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: C.ink }}><Wallet size={16} color={C.success} /> {lang === "en" ? "Withdrawal Requests" : "विड्रॉल रिक्वेस्ट"}</div>
          <div className="space-y-2">
            {pendingWithdrawals.map((w) => (
              <div key={w.id} className="rounded-lg p-3 flex items-center justify-between" style={{ background: "#DFEEE2" }}>
                <div>
                  <div className="text-xs font-bold" style={{ color: C.ink }}>{w.driverName || w.customerName} <span className="font-normal" style={{ color: C.inkSoft }}>· {w.role === "customer" ? (lang === "en" ? "Referral" : "रेफरल") : (lang === "en" ? "Driver bonus" : "ड्राइवर बोनस")}</span></div>
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
      <div className="rounded-xl p-4 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
        <div className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: C.ink }}><Siren size={16} color={C.safety} /> {lang === "en" ? "Emergency Alerts" : "इमरजेंसी अलर्ट्स"}</div>
        {alerts.length === 0 ? <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "No alerts yet." : "अभी कोई अलर्ट नहीं आया।"}</p> : (
          <div className="space-y-2">
            {alerts.map((a) => {
              const urgent = a.type === "इमरजेंसी कॉल" || a.type === "पुलिस सहायता";
              return (
                <div key={a.id} className="rounded-lg p-3" style={{ background: urgent ? "#FCEAE3" : "#F0EAE0" }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1" style={{ color: urgent ? C.safety : C.ink }}>
                      {urgent && <Siren size={12} />} {roleLabel[a.role] || a.role} · {alertTypeLabel(a.type, lang)}
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
  const filtered = drivers.filter((d) => d.name.includes(q) || (d.vehicleSpec?.vehicleNumber || "").toLowerCase().includes(q.toLowerCase()) || (d.mobile || "").includes(q));
  const kycMeta = lang === "en"
    ? { Approved: { label: "Verified", color: C.success, bg: "#DFEEE2" }, Pending: { label: "Pending", color: C.marigoldDeep, bg: "#FBEBD2" }, Rejected: { label: "Blocked", color: C.safety, bg: "#FCEAE3" }, none: { label: "KYC not submitted", color: C.inkSoft, bg: "#F0EAE0" } }
    : { Approved: { label: "सत्यापित", color: C.success, bg: "#DFEEE2" }, Pending: { label: "लंबित", color: C.marigoldDeep, bg: "#FBEBD2" }, Rejected: { label: "ब्लॉक्ड", color: C.safety, bg: "#FCEAE3" }, none: { label: "KYC सबमिट नहीं हुआ", color: C.inkSoft, bg: "#F0EAE0" } };
  const docLabels = lang === "en"
    ? { photo: "Driver Photo", dl: "Driving License" }
    : { photo: "ड्राइवर फोटो", dl: "ड्राइविंग लाइसेंस" };
  return (
    <div className="rounded-xl p-4 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
      <div className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: C.ink }}><Users size={16} /> {lang === "en" ? "All Drivers" : "सभी ड्राइवर"}</div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={lang === "en" ? "Search by name, vehicle number or mobile..." : "नाम, गाड़ी नंबर या मोबाइल से खोजें..."} className="w-full rounded-lg px-3 py-2 text-xs outline-none mb-3" style={{ border: `1px solid ${C.line}`, background: C.paper, color: C.ink }} />
      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "No driver found." : "कोई ड्राइवर नहीं मिला।"}</p>}
        {filtered.map((d) => {
          const km = kycMeta[d.kyc] || kycMeta.none;
          const expanded = expandedId === d.id;
          return (
            <div key={d.id} className="rounded-lg p-3" style={{ border: `1px solid ${d.blacklisted ? C.safety : C.line}`, background: d.blacklisted ? "#FCEAE3" : C.paper }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold" style={{ color: C.ink }}>{d.name}</div>
                  <div className="text-[10px]" style={{ color: C.inkSoft, fontFamily: monoFont }}>{d.vehicleSpec?.vehicleNumber || "—"} · {d.mobile} · {lang === "en" ? "Wallet" : "वॉलेट"} {fmt(d.wallet)}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: d.online ? C.success : C.inkSoft, background: d.online ? "#DFEEE2" : "#F0EAE0" }}>{d.online ? (lang === "en" ? "Online" : "ऑनलाइन") : (lang === "en" ? "Offline" : "ऑफलाइन")}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: km.color, background: km.bg }}>{km.label}</span>
                </div>
              </div>

              <button onClick={() => setExpandedId(expanded ? null : d.id)} className="text-[10px] font-semibold mt-2" style={{ color: "#A8721C" }}>
                {expanded ? (lang === "en" ? "▲ Hide KYC details" : "▲ KYC डिटेल छुपाएं") : (lang === "en" ? "▼ View KYC details" : "▼ KYC डिटेल देखें")}
              </button>
              {expanded && (
                <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
                  <div className="text-[11px] font-semibold mb-1.5" style={{ color: C.inkSoft }}>{lang === "en" ? "Submitted documents:" : "जमा किए गए दस्तावेज़:"}</div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {Object.entries(docLabels).map(([key, label]) => {
                      const doc = d.docs?.[key];
                      return <KycDocThumb key={key} url={doc?.url} label={label} lang={lang} fileName={`${d.name}-${key}.jpg`} />;
                    })}
                  </div>
                  {(d.vehicleSpec?.photo || d.vehicleSpec?.photoSide) && (
                    <>
                      <div className="text-[11px] font-semibold mb-1.5" style={{ color: C.inkSoft }}>{lang === "en" ? "Vehicle photos:" : "गाड़ी की फोटो:"}</div>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        {d.vehicleSpec?.photo && <KycDocThumb url={d.vehicleSpec.photo.url} label={lang === "en" ? "Vehicle - Front" : "गाड़ी - आगे"} lang={lang} fileName={`${d.name}-vehicle-front.jpg`} />}
                        {d.vehicleSpec?.photoSide && <KycDocThumb url={d.vehicleSpec.photoSide.url} label={lang === "en" ? "Vehicle - Side" : "गाड़ी - साइड"} lang={lang} fileName={`${d.name}-vehicle-side.jpg`} />}
                      </div>
                    </>
                  )}
                  {d.vehicleSpec && (
                    <div className="text-[11px] mb-2" style={{ color: C.ink }}>
                      <b>{lang === "en" ? "Vehicle number" : "गाड़ी नंबर"}:</b> <span style={{ fontFamily: monoFont }}>{d.vehicleSpec.vehicleNumber || "—"}</span><br />
                      <b>{lang === "en" ? "Capacity/size" : "क्षमता/साइज़"}:</b> {d.vehicleSpec.capacityKg ? `${d.vehicleSpec.capacityKg} ${lang === "en" ? "kg" : "किग्रा"}` : "—"} · {d.vehicleSpec.length || "—"}×{d.vehicleSpec.width || "—"}×{d.vehicleSpec.height || "—"} {lang === "en" ? "ft" : "फीट"}
                    </div>
                  )}
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

// Read-only oversight of customer registrations — name, address, KYC info.
// Customers are never gated by admin approval (only drivers are), so this
// is visibility only, not a verification queue.
function AdminCustomers({ customers, bookings, lang }) {
  const [q, setQ] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const filtered = (customers || []).filter((c) => (c.name || "").toLowerCase().includes(q.toLowerCase()) || (c.mobile || "").includes(q) || (c.city || "").toLowerCase().includes(q.toLowerCase()));
  const statusMeta = lang === "en"
    ? { Bidding: { label: "Awaiting bids", color: C.marigoldDeep, bg: "#FBEBD2" }, Ongoing: { label: "Ongoing", color: C.marigoldDeep, bg: "#FBEBD2" }, Completed: { label: "Completed", color: C.success, bg: "#DFEEE2" }, Cancelled: { label: "Cancelled", color: C.safety, bg: "#FCEAE3" } }
    : { Bidding: { label: "बिड बाकी", color: C.marigoldDeep, bg: "#FBEBD2" }, Ongoing: { label: "चालू", color: C.marigoldDeep, bg: "#FBEBD2" }, Completed: { label: "पूर्ण", color: C.success, bg: "#DFEEE2" }, Cancelled: { label: "रद्द", color: C.safety, bg: "#FCEAE3" } };
  const bookingDate = (b) => (b.createdAt?.toDate ? b.createdAt.toDate().toLocaleDateString(lang === "en" ? "en-IN" : "hi-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
  return (
    <div className="rounded-xl p-4 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
      <div className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: C.ink }}><Users size={16} /> {lang === "en" ? "All Customers" : "सभी कस्टमर"}</div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={lang === "en" ? "Search by name, mobile or city..." : "नाम, मोबाइल या शहर से खोजें..."} className="w-full rounded-lg px-3 py-2 text-xs outline-none mb-3" style={{ border: `1px solid ${C.line}`, background: C.paper, color: C.ink }} />
      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "No customer found." : "कोई कस्टमर नहीं मिला।"}</p>}
        {filtered.map((c) => {
          const expanded = expandedId === c.mobile;
          const rides = (bookings || []).filter((b) => b.customerMobile === c.mobile);
          return (
            <div key={c.mobile} className="rounded-lg p-3" style={{ border: `1px solid ${C.line}` }}>
              <div className="flex items-center gap-2.5">
                <SafeImage src={c.photo?.url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" fallback={<div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: "#F5E6C8" }}><UserCircle2 size={20} color="#A8721C" /></div>} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate" style={{ color: C.ink }}>{c.name || "—"}</div>
                  <div className="text-[10px]" style={{ color: C.inkSoft, fontFamily: monoFont }}>{c.mobile}</div>
                  <div className="text-[10px] mt-0.5 truncate" style={{ color: C.inkSoft }}>{[c.address, c.area, c.city, c.state, c.pincode].filter(Boolean).join(", ") || (lang === "en" ? "No address on file" : "पता उपलब्ध नहीं")}</div>
                </div>
                <button onClick={() => setExpandedId(expanded ? null : c.mobile)} className="shrink-0 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg" style={{ color: C.marigoldDeep, background: "#FBEBD2" }}>
                  {expanded ? (lang === "en" ? "Hide" : "छुपाएं") : (lang === "en" ? "View Details" : "विवरण देखें")}
                </button>
              </div>

              {expanded && (
                <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.line}` }}>
                  <div className="text-[11px] mb-3" style={{ color: C.ink }}>
                    <b>{lang === "en" ? "Contact number" : "संपर्क नंबर"}:</b> <span style={{ fontFamily: monoFont }}>{c.mobile}</span><br />
                    {c.email && (<><b>{lang === "en" ? "Email" : "ईमेल"}:</b> {c.email}<br /></>)}
                    <b>{lang === "en" ? "Address" : "पता"}:</b> {[c.address, c.area, c.city, c.state, c.pincode].filter(Boolean).join(", ") || "—"}
                  </div>
                  <div className="text-[11px] font-semibold mb-1.5" style={{ color: C.inkSoft }}>
                    {lang === "en" ? `Ride history (${rides.length})` : `राइड हिस्ट्री (${rides.length})`}
                  </div>
                  {rides.length === 0 ? (
                    <p className="text-[11px]" style={{ color: C.inkSoft }}>{lang === "en" ? "No bookings yet." : "अभी तक कोई बुकिंग नहीं।"}</p>
                  ) : (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {rides.map((b) => {
                        const sm = statusMeta[b.status] || statusMeta.Cancelled;
                        return (
                          <div key={b.id} className="rounded-lg p-2" style={{ background: "#F8F4EC" }}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-bold truncate" style={{ color: C.ink }}>{b.pickup} → {b.drop}</span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ color: sm.color, background: sm.bg }}>{sm.label}</span>
                            </div>
                            <div className="text-[10px] mt-0.5" style={{ color: C.inkSoft }}>
                              {materialLabel(b.material, lang)} · {b.weight} {lang === "en" ? "kg" : "किग्रा"} · {serviceTypeLabel(b.serviceType, lang)}
                            </div>
                            <div className="text-[10px] flex items-center justify-between mt-1">
                              <span style={{ color: C.inkSoft }}>{b.driverName ? `${lang === "en" ? "Driver" : "ड्राइवर"}: ${b.driverName}` : (lang === "en" ? "No driver assigned" : "ड्राइवर तय नहीं")} · {bookingDate(b)}</span>
                              {b.fare != null && <span className="font-bold" style={{ color: C.marigoldDeep, fontFamily: monoFont }}>{fmt(b.fare)}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AdminNotify({ drivers, lang }) {
  const [target, setTarget] = useState("all");
  const [message, setMessage] = useState("");
  const [sentLog, setSentLog] = useState([]);
  const allDriversLabel = lang === "en" ? "All Drivers" : "सभी ड्राइवर";
  const send = () => {
    if (!message.trim()) return;
    const label = target === "all" ? allDriversLabel : drivers.find((d) => d.id === target)?.name || target;
    setSentLog((prev) => [{ id: genId("N"), to: label, message, time: new Date().toLocaleTimeString("hi-IN", { hour: "2-digit", minute: "2-digit" }) }, ...prev]);
    setMessage("");
  };
  return (
    <div className="rounded-xl p-4 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
      <div className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: C.ink }}><Bell size={16} /> {lang === "en" ? "Send Notification" : "सूचना भेजें"}</div>
      <label className="text-[11px] font-semibold mb-1 block" style={{ color: C.inkSoft }}>{lang === "en" ? "Send to" : "किसे भेजें"}</label>
      <select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full rounded-lg px-3 py-2 text-xs outline-none mb-2" style={{ border: `1px solid ${C.line}`, color: C.ink }}>
        <option value="all">{allDriversLabel}</option>
        {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={lang === "en" ? "Write a message..." : "संदेश लिखें..."} className="w-full rounded-lg px-3 py-2 text-xs outline-none mb-2" rows={3} style={{ border: `1px solid ${C.line}`, color: C.ink }} />
      <button onClick={send} disabled={!message.trim()} className="w-full rounded-lg py-2.5 font-bold text-sm mb-4" style={{ background: message.trim() ? C.marigold : C.line, color: message.trim() ? C.navy : "#9AA3B0" }}>{lang === "en" ? "Send" : "भेजें"}</button>
      <div className="text-[11px] font-semibold mb-2" style={{ color: C.inkSoft }}>{lang === "en" ? "Sent Notifications" : "भेजी गई सूचनाएं"}</div>
      <div className="space-y-2">
        {sentLog.length === 0 && <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "No notifications sent yet." : "अभी कोई सूचना नहीं भेजी गई।"}</p>}
        {sentLog.map((n) => (
          <div key={n.id} className="rounded-lg p-2.5" style={{ background: "#F0EAE0" }}>
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

function AdminSettings({ commissionPct, setCommissionPct, bonusPct, setBonusPct, minWallet, setMinWallet, trialMode, setTrialMode, trialDaysLeft, lang }) {
  return (
    <div className="rounded-xl p-4 shadow-sm" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
      <div className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: C.ink }}><Settings2 size={16} /> {lang === "en" ? "System Settings" : "सिस्टम सेटिंग्स"}</div>

      <div className="rounded-lg p-3 mb-4" style={{ background: trialMode ? "#DFEEE2" : "#F0EAE0" }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold" style={{ color: trialMode ? C.success : C.ink }}>{lang === "en" ? "Free Trial Mode (1 month)" : "फ्री ट्रायल मोड (1 महीना)"}</div>
            <div className="text-[11px]" style={{ color: C.inkSoft }}>{lang === "en" ? "While on, both commission and bonus stay at 0%" : "चालू रहने पर कमीशन और बोनस दोनों 0% रहेंगे"}</div>
            {trialMode && <div className="text-[11px] mt-1 font-semibold" style={{ color: C.success }}>{lang === "en" ? `${trialDaysLeft} days left — switches to commercial mode automatically after that` : `${trialDaysLeft} दिन बाकी — इसके बाद ऑटोमैटिक कमर्शियल मोड में बदल जाएगा`}</div>}
          </div>
          <button onClick={() => {
            setTrialMode((t) => {
              const next = !t;
              if (next) { setCommissionPct(0); setBonusPct(0); }
              else { setCommissionPct(10); setBonusPct(2); }
              return next;
            });
          }} className="w-12 h-7 rounded-full relative" style={{ background: trialMode ? C.success : "#B8BEC7" }}>
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
        <div className="text-sm font-bold flex items-center gap-1.5" style={{ color: C.ink }}><BarChart3 size={16} /> {lang === "en" ? "Reports — Commission & Earnings" : "रिपोर्ट्स — कमीशन और कमाई"}</div>
        <button onClick={downloadReport} disabled={tripLog.length === 0} className="text-[11px] font-semibold flex items-center gap-1 px-2.5 py-1.5 rounded-lg"
          style={{ color: tripLog.length ? C.marigoldDeep : C.inkSoft, background: tripLog.length ? "#FBEBD2" : "#F0EAE0" }}>
          <Download size={12} /> {lang === "en" ? "Download CSV" : "एक्सेल डाउनलोड करें"}
        </button>
      </div>
      <div className="rounded-lg p-3 mb-3" style={{ background: "#DFEEE2" }}>
        <div className="text-[11px]" style={{ color: C.success }}>{lang === "en" ? `Total commission so far (${commissionPct}%)` : `आज का कुल कमीशन (${commissionPct}%)`}</div>
        <div className="text-xl font-bold" style={{ color: C.success, fontFamily: monoFont }}>{fmt(totalCommission)}</div>
      </div>
      {tripLog.length === 0 ? <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "No bid has been accepted yet." : "आज अभी तक कोई बिड एक्सेप्ट नहीं हुई।"}</p> : (
        <table className="w-full text-xs">
          <thead><tr style={{ color: C.inkSoft }}>
            <th className="text-left font-semibold pb-1">{lang === "en" ? "Driver" : "ड्राइवर"}</th>
            <th className="text-left font-semibold pb-1">{lang === "en" ? "Route" : "रूट"}</th>
            <th className="text-right font-semibold pb-1">{lang === "en" ? "Fare" : "भाड़ा"}</th>
            <th className="text-right font-semibold pb-1">{lang === "en" ? "Commission" : "कमीशन"}</th>
          </tr></thead>
          <tbody>
            {tripLog.map((t) => (
              <tr key={t.id} style={{ borderTop: `1px solid ${C.line}` }}>
                <td className="py-1.5" style={{ color: C.ink }}>{t.driverName}</td>
                <td className="py-1.5" style={{ color: C.inkSoft }}>{t.pickup} → {t.drop}</td>
                <td className="py-1.5 text-right" style={{ fontFamily: monoFont, color: C.ink }}>{fmt(t.fare)}</td>
                <td className="py-1.5 text-right" style={{ fontFamily: monoFont, color: t.status === "Cancelled" ? C.safety : C.success }}>
                  {t.status === "Cancelled" ? (lang === "en" ? "Cancelled (refunded)" : "रद्द (वापस)") : fmt(t.fare * (commissionPct / 100))}
                </td>
              </tr>
            ))}

          </tbody>
        </table>
      )}
    </div>
  );
}

function AdminPanel({ drivers, customers, driver, updateDriverKyc, bookings, tripLog, alerts, toggleBlacklist, commissionPct, setCommissionPct, minWallet, setMinWallet, bonusPct, setBonusPct, lang, onLogout, onGoHome, trialMode, setTrialMode, trialDaysLeft, withdrawals, approveWithdrawal, rechargeRequests, approveRecharge }) {
  const [tab, setTab] = useState("fleet");
  const tabs = [["fleet", "लाइव डैशबोर्ड", MapPinned], ["kyc", "KYC डेस्क", Users], ["drivers", "ड्राइवर", ClipboardList], ["customers", "कस्टमर", UserCircle2], ["settings", "सिस्टम सेटिंग्स", Settings2], ["finance", "रिपोर्ट्स", BarChart3], ["notify", "सूचना भेजें", Bell], ["alerts", "अलर्ट्स", Siren]];
  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {onGoHome && (
            <button onClick={onGoHome} title={lang === "en" ? "Back to main page" : "मुख्य पेज पर वापस जाएं"} className="w-8 h-8 rounded-full flex items-center justify-center shadow-sm shrink-0" style={{ background: C.marigold, border: `1.5px solid ${C.marigoldDeep}` }}>
              <Home size={15} color={C.navy} strokeWidth={2.5} />
            </button>
          )}
          <LayoutDashboard size={18} color={C.marigoldDeep} />
          <h2 className="text-base font-bold" style={{ color: C.ink }}>{lang === "en" ? "Admin Control Panel" : "एडमिन कंट्रोल पैनल"}</h2>
        </div>
        <button onClick={onLogout} className="text-[11px] font-semibold flex items-center gap-1 px-2.5 py-1.5 rounded-lg" style={{ color: C.safety, background: "#FCEAE3" }}>
          <XCircle size={12} /> {lang === "en" ? "Logout" : "लॉगआउट"}
        </button>
      </div>
      {tab === "fleet" && <div className="text-sm font-bold mb-4" style={{ color: C.ink }}>{greetingWord(lang)}, {lang === "en" ? "Admin" : "एडमिन"} 👋</div>}
      <div className="flex gap-2 mb-5 overflow-x-auto">
        {tabs.map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
            style={{ background: tab === k ? C.navy : C.paper, color: tab === k ? "#fff" : C.inkSoft, border: `1px solid ${tab === k ? C.navy : C.line}` }}>
            <Icon size={13} /> {lang === "en" ? (EN_LABELS[k] || label) : label}
          </button>
        ))}
      </div>
      {tab === "fleet" && <AdminFleet drivers={drivers} driver={driver} bookings={bookings} tripLog={tripLog} commissionPct={commissionPct} minWallet={minWallet} lang={lang} onNavigate={setTab} />}
      {tab === "kyc" && <AdminKyc drivers={drivers} updateDriverKyc={updateDriverKyc} lang={lang} />}
      {tab === "drivers" && <AdminDriverList drivers={drivers} toggleBlacklist={toggleBlacklist} lang={lang} />}
      {tab === "customers" && <AdminCustomers customers={customers} bookings={bookings} lang={lang} />}
      {tab === "settings" && <AdminSettings commissionPct={commissionPct} setCommissionPct={setCommissionPct} bonusPct={bonusPct} setBonusPct={setBonusPct} minWallet={minWallet} setMinWallet={setMinWallet} trialMode={trialMode} setTrialMode={setTrialMode} trialDaysLeft={trialDaysLeft} lang={lang} />}
      {tab === "finance" && <AdminFinance tripLog={tripLog} commissionPct={commissionPct} lang={lang} />}
      {tab === "notify" && <AdminNotify drivers={drivers} lang={lang} />}
      {tab === "alerts" && <AdminAlerts alerts={alerts} withdrawals={withdrawals} approveWithdrawal={approveWithdrawal} rechargeRequests={rechargeRequests} approveRecharge={approveRecharge} lang={lang} />}
    </div>
  );
}

// ---------------- Terms ----------------
function TermsModal({ open, onClose, commissionPct, bonusPct, lang }) {
  if (!open) return null;
  const sections = lang === "en" ? [
    ["1. Load Posting", "Once a load is posted, the pickup-drop details cannot be changed. The final fare will be whatever was agreed in the driver's Accepted Bid."],
    ["2. Bidding System", "The customer is free to accept any one bid among multiple drivers. Once a bid is accepted, it is treated as final."],
    ["3. Cancellation", "If a trip is cancelled by either side after a driver is assigned, the deducted commission/advance fare is not refunded instantly — it is held by admin and automatically adjusted against the driver's next accepted trip, so the driver is not out of pocket. Repeated cancellations may lead to temporary account suspension."],
    ["4. Driver Responsibility", "The driver is required to submit a valid driving license, vehicle RC and KYC documents. No load will be shown until admin approves this verification."],
    ["5. Commission and Payment", `As soon as the customer accepts a bid, ${commissionPct}% of the agreed fare will be deducted instantly from the driver's wallet as company commission, and the customer's/driver's mobile numbers are revealed to each other. Of this commission, ${bonusPct}% will be credited back to the driver's bonus account. The remaining 90% of the fare is collected by the driver directly from the customer (cash, UPI, or any digital mode) after delivery — Sarthi Transport does not collect this fare inside the app. Maintaining a minimum wallet balance is mandatory.`],
    ["6. Responsibility for Goods & Loading Costs", "It is the customer's responsibility to ensure the safety and correct information (material type and weight) of the goods, and to bear the full cost of loading/unloading labour (hamali) — this is not the driver's expense. The company is not responsible for any loss, damage, or delay of goods — this responsibility lies with the concerned driver/transporter."],
    ["7. Platform's Role — Intermediary Only (Most Important)",
      `Sarthi Transport is a technology platform that only serves as a medium to connect the customer (load owner) and independent drivers/transporters. The company/admin is not itself a party to any transport of goods, nor a transport service provider. The ${commissionPct}% commission is charged only as a platform usage fee, not for transport service. Every deal between customer and driver (fare, timing, terms) is entirely a private agreement between the two. The company, admin, or platform will not be liable in any way for theft, damage, delay, accident, wrong payment, dispute, or any direct/indirect loss related to the goods. Full responsibility for any such matter rests with the concerned customer and driver themselves.`],
    ["8. Disputes and Jurisdiction", "In case of any complaint or dispute, contact admin via the SOS section — admin can only help as a facilitator, this does not mean admin is responsible for the dispute. In case of any legal dispute, jurisdiction will lie only with Pimpri-Chinchwad / Pune courts."],
  ] : [
    ["1. लोड पोस्टिंग", "लोड पोस्ट करने के बाद पिकअप-ड्रॉप की जानकारी बदली नहीं जा सकती। अंतिम भाड़ा वही होगा जो ड्राइवर की स्वीकृत बोली (Accepted Bid) में तय हुआ हो।"],
    ["2. बिडिंग सिस्टम", "ग्राहक कई ड्राइवरों में से किसी भी एक बोली को स्वीकार करने के लिए स्वतंत्र है। एक बार बोली स्वीकार होने के बाद वह अंतिम मानी जाएगी।"],
    ["3. रद्दीकरण", "बुकिंग फाइनल होने के बाद अगर किसी भी तरफ से ट्रिप रद्द की जाती है, तो कटा हुआ कमीशन/एडवांस भाड़ा तुरंत वापस नहीं किया जाता — यह एडमिन के पास होल्ड रहता है और ड्राइवर की अगली स्वीकृत ट्रिप के कमीशन में अपने आप एडजस्ट हो जाता है, ताकि ड्राइवर को नुकसान न हो। बार-बार रद्द करने पर खाता अस्थायी रूप से बंद किया जा सकता है।"],
    ["4. ड्राइवर की जिम्मेदारी", "ड्राइवर को वैध ड्राइविंग लाइसेंस, गाड़ी की RC और KYC दस्तावेज़ जमा करना अनिवार्य है। एडमिन अप्रूवल तक कोई भी लोड नहीं दिखाया जाएगा।"],
    ["5. कमीशन व भुगतान", `जैसे ही ग्राहक किसी बोली को स्वीकार करता है, तय भाड़े का ${commissionPct}% कंपनी कमीशन के रूप में ड्राइवर के वॉलेट से तुरंत कट जाएगा, और तभी ग्राहक व ड्राइवर के मोबाइल नंबर एक-दूसरे को दिखेंगे। इस कमीशन में से ${bonusPct}% ड्राइवर के बोनस अकाउंट में वापस जमा किया जाएगा। बचा हुआ 90% भाड़ा ड्राइवर डिलीवरी के बाद ग्राहक से सीधे (नकद, UPI या किसी भी डिजिटल माध्यम से) वसूलेगा — यह भुगतान सार्थी ट्रांसपोर्ट ऐप के अंदर कलेक्ट नहीं होता। ड्राइवर के वॉलेट में न्यूनतम बैलेंस रखना अनिवार्य है।`],
    ["6. सामान की जिम्मेदारी व लोडिंग खर्च", "सामान की सुरक्षा और सही जानकारी (मटेरियल टाइप व वजन) देना, साथ ही लोडिंग-अनलोडिंग की हमाली का पूरा खर्च उठाना ग्राहक की जिम्मेदारी है — यह ड्राइवर का खर्च नहीं है। किसी भी प्रकार के माल के नुकसान, टूट-फूट या देरी के लिए कंपनी जिम्मेदार नहीं होगी — यह जिम्मेदारी संबंधित ड्राइवर/ट्रांसपोर्टर की होगी।"],
    ["7. प्लेटफ़ॉर्म की भूमिका — केवल मध्यस्थ (सबसे ज़रूरी)",
      `सार्थी ट्रांसपोर्ट एक टेक्नोलॉजी प्लेटफ़ॉर्म है जो सिर्फ ग्राहक (लोड मालिक) और स्वतंत्र ड्राइवर/ट्रांसपोर्टर को आपस में जोड़ने का माध्यम है। कंपनी/एडमिन किसी भी माल की ढुलाई में स्वयं पक्षकार (party) नहीं है और न ही ट्रांसपोर्ट सेवा प्रदाता है। ${commissionPct}% कमीशन केवल प्लेटफ़ॉर्म इस्तेमाल करने के शुल्क के रूप में लिया जाता है, ट्रांसपोर्ट सेवा के लिए नहीं। ग्राहक और ड्राइवर के बीच हुआ हर सौदा (भाड़ा, समय, शर्तें) पूरी तरह उन दोनों के बीच का निजी अनुबंध है। माल की चोरी, नुकसान, देरी, दुर्घटना, गलत भुगतान, विवाद, या किसी भी प्रकार के प्रत्यक्ष/अप्रत्यक्ष नुकसान के लिए कंपनी, एडमिन या प्लेटफ़ॉर्म किसी भी रूप में उत्तरदायी (liable) नहीं होगा। ऐसे किसी भी मामले की पूरी जिम्मेदारी संबंधित ग्राहक और ड्राइवर की खुद की होगी।`],
    ["8. विवाद और क्षेत्राधिकार", "किसी भी शिकायत या विवाद की स्थिति में SOS सेक्शन से एडमिन से संपर्क करें — एडमिन केवल सहायता (facilitation) के तौर पर मदद कर सकता है, इसका मतलब यह नहीं कि विवाद की जिम्मेदारी एडमिन की है। किसी भी कानूनी विवाद की स्थिति में क्षेत्राधिकार (Jurisdiction) केवल पिंपरी-चिंचवड़ / पुणे कोर्ट का रहेगा।"],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(42,33,28,0.6)" }} onClick={onClose}>
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
  // Persisted so the app remembers the user's role choice and data across reloads —
  // real re-auth (OTP/password) still runs each time via the *Auth verified flags.
  // This per-device stuff stays in localStorage; everything shared between
  // testers (bookings, bids, driver profiles, admin settings...) now lives in
  // Firestore — see firestoreStore.js.
  const [app, setApp] = usePersistedState("sarthi_app", "customer");
  const [role, setRole] = usePersistedState("sarthi_role", null);
  // Admin Login is only revealed when the page is opened with this secret
  // link (e.g. https://yourapp/?admin=1) — regular Customer/Driver users
  // never see it on the plain URL.
  const adminEntry = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("admin") === "1";
  // Not persisted like customer/driver auth (those are real Firebase phone
  // OTP sessions) — admin is gated by a plain password, so every fresh page
  // load must go through AdminLogin again rather than silently staying
  // signed in and jumping straight to the Customer/Driver preview toggle.
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
  // Once a device verifies as Customer or Driver, it's permanently locked to
  // that choice — the other option never appears again, even after logout.
  const [lockedRole, setLockedRole] = usePersistedState("sarthi_lockedRole", null);
  useEffect(() => {
    if (lockedRole) return;
    if (customerAuth.verified) setLockedRole("customer");
    else if (driverAuth.verified) setLockedRole("driver");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Opening the app with ?admin=1 skips the role-choice screen entirely and
  // goes straight to the Admin login form — no option to pick Customer/Driver.
  useEffect(() => {
    if (adminEntry && role === null) setRole("admin");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminEntry]);
  // "Remembered login" is now a real Firebase Auth session (see
  // customerFirebaseAuth/driverFirebaseAuth in firebaseClient.js) — signing
  // out below clears it for real, instead of just a locally-stored number.
  const logoutRole = (targetRole) => {
    if (targetRole === "admin") { setAdminAuth(false); setRole(null); return; }
    if (targetRole === "customer") { setCustomerAuth({ verified: false, mobile: "" }); if (customerFirebaseAuth) signOut(customerFirebaseAuth).catch((e) => console.error(e)); }
    if (targetRole === "driver") { setDriverAuth({ verified: false, mobile: "" }); if (driverFirebaseAuth) signOut(driverFirebaseAuth).catch((e) => console.error(e)); }
    // A locked device only has one role anyway — skip the now-pointless
    // role-choice screen and go straight back to that role's login form.
    setRole(targetRole);
  };
  const logout = () => {
    logoutRole(role);
  };
  // Returns to role selection without clearing OTP verification, so tapping
  // Customer/Driver by mistake and going back doesn't force a re-login.
  const goHome = () => setRole(null);
  const [lang, setLang] = usePersistedState("sarthi_lang", "hi");
  const [showTerms, setShowTerms] = useState(false);
  const [customMaterials, setCustomMaterials] = usePersistedState("sarthi_customMaterials", {}); // { hiName: {hi, en} }
  const addCustomMaterial = (key, labels) => setCustomMaterials((prev) => ({ ...prev, [key]: labels }));

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
  const [settings, setSettingsLocal] = useState({ commissionPct: 3, bonusPct: 2, minWallet: 500, trialMode: true, trialStartDate: Date.now() });
  const commissionPct = settings.commissionPct;
  const bonusPct = settings.bonusPct;
  const minWallet = settings.minWallet;
  const trialMode = settings.trialMode;
  const trialStartDate = settings.trialStartDate;
  const setCommissionPct = (v) => patchDoc("settings", "main", { commissionPct: typeof v === "function" ? v(commissionPct) : v }).catch((e) => console.error(e));
  const setBonusPct = (v) => patchDoc("settings", "main", { bonusPct: typeof v === "function" ? v(bonusPct) : v }).catch((e) => console.error(e));
  const setMinWallet = (v) => patchDoc("settings", "main", { minWallet: typeof v === "function" ? v(minWallet) : v }).catch((e) => console.error(e));
  const setTrialMode = (v) => patchDoc("settings", "main", { trialMode: typeof v === "function" ? v(trialMode) : v }).catch((e) => console.error(e));

  useEffect(() => {
    if (!firestoreReady) return;
    seedIfEmpty("vehicleTypes", DEFAULT_VEHICLES, "key").catch((e) => console.error("[seed vehicleTypes]", e));
    return subscribeCollection("vehicleTypes", setVehicleTypesLocal, null);
  }, []);
  useEffect(() => (firestoreReady ? subscribeCollection("drivers", setDrivers, null) : undefined), []);
  // Only Admin needs the full customer list (profile/address oversight) —
  // gated on role so customer/driver sessions don't pull it for nothing.
  const [allCustomers, setAllCustomers] = useState([]);
  useEffect(() => (firestoreReady && role === "admin" ? subscribeCollection("customers", setAllCustomers, null) : undefined), [role]);
  useEffect(() => (firestoreReady ? subscribeCollection("bookings", setBookings) : undefined), []);
  useEffect(() => (firestoreReady ? subscribeCollection("alerts", setAlerts) : undefined), []);
  useEffect(() => (firestoreReady ? subscribeCollection("withdrawals", setWithdrawals) : undefined), []);
  useEffect(() => (firestoreReady ? subscribeCollection("rechargeRequests", setRechargeRequests) : undefined), []);
  useEffect(() => {
    if (!firestoreReady) return;
    // Subscribe first, create-if-missing in the background — awaiting the
    // create before subscribing would leave everyone stuck on defaults
    // forever if that one initial call is slow on a flaky connection.
    const unsub = subscribeDoc("settings", "main", (data) => { if (data) setSettingsLocal(data); });
    getOrCreateDoc("settings", "main", { commissionPct: 3, bonusPct: 2, minWallet: 500, trialMode: true, trialStartDate: Date.now() })
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

  // 2-month free trial: the clock starts the first time ANY tester's browser
  // creates the shared settings doc, so it's a real once-per-deployment
  // launch date now (not per-browser like the old local-only version).
  const trialDaysLeft = Math.max(0, TRIAL_DAYS - Math.floor((Date.now() - trialStartDate) / DAY_MS));
  const trialExpired = trialDaysLeft <= 0;
  useEffect(() => {
    if (trialExpired && trialMode) {
      patchDoc("settings", "main", { trialMode: false, commissionPct: 10, bonusPct: 2 }).catch((e) => console.error(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trialExpired, trialMode]);

  const addVehicleType = (v) => createDoc("vehicleTypes", v.key, v).catch((e) => console.error(e));

  // Trip history is just every booking that's been assigned to a driver —
  // no separate collection to keep in sync.
  const tripLog = bookings.filter((b) => b.driverName);

  const requestWithdrawal = (amount) => {
    if (amount <= 0 || !driver) return;
    setDriver({ ...driver, bonus: Math.max(0, (driver.bonus || 0) - amount) });
    createDoc("withdrawals", genId("W"), { role: "driver", driverMobile: driver.mobile, driverName: driver.name, amount, status: "Pending" }).catch((e) => console.error(e));
  };
  const approveWithdrawal = (id) => patchDoc("withdrawals", id, { status: "Approved" }).catch((e) => console.error(e));
  // Referral rewards unlock 2 months after being credited (see
  // creditReferralOnce) — this only fires once that's already true, so the
  // requested amount is always available balance, never locked money.
  const requestReferralWithdrawal = (amount) => {
    if (amount <= 0 || !customer || !customerAuth.mobile) return;
    setCustomer({ ...customer, referralBalance: Math.max(0, (customer.referralBalance || 0) - amount) });
    patchDoc("customers", customerAuth.mobile, { referralBalance: increment(-amount) }).catch((e) => console.error(e));
    createDoc("withdrawals", genId("W"), { role: "customer", customerMobile: customerAuth.mobile, customerName: customer.name, amount, status: "Pending" }).catch((e) => console.error(e));
  };

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

  const createLoad = ({ pickup, drop, vehicle, material, weight, distance, scheduledFor, pickupLat, pickupLng, dropLat, dropLng, serviceType }) => {
    createDoc("bookings", genId(), {
      pickup, drop, vehicle, material, weight, distance, status: "Bidding", bids: [], fare: null,
      driverName: null, progress: 0, scheduledFor: scheduledFor || null, customerMobile: customerAuth.mobile || "",
      pickupLat: pickupLat ?? null, pickupLng: pickupLng ?? null, dropLat: dropLat ?? null, dropLng: dropLng ?? null,
      driverLocation: null, serviceType: serviceType || "withinCity",
    }).catch((e) => console.error(e));
  };

  const addBid = (bookingId, bid) => {
    const b = bookings.find((x) => x.id === bookingId);
    if (!b) return;
    const rest = (b.bids || []).filter((x) => x.driverName !== bid.driverName);
    patchDoc("bookings", bookingId, { bids: [...rest, { id: genId("B"), ...bid }] }).catch((e) => console.error(e));
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
    if (!b || !bid) return;
    const otp = String(Math.floor(1000 + Math.random() * 9000));
    patchDoc("bookings", bookingId, {
      status: "Ongoing", fare: bid.amount, driverName: bid.driverName, driverMobile: mobileForDriverName(bid.driverName),
      hours: bid.hours, extraHourRate: bid.extraHourRate, progress: 0, otp,
    }).catch((e) => console.error(e));

    // 10% commission cut instantly on acceptance, only for the accepted
    // driver's own device — any held credit from a past cancellation offsets
    // this trip's commission first.
    if (bid.driverName === driver?.name) {
      const commissionAmt = bid.amount * (commissionPct / 100);
      const bonusAmt = bid.amount * (bonusPct / 100);
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
  };

  const cancelBooking = (id) => {
    const b = bookings.find((x) => x.id === id);
    if (!b) return;
    if (b.status === "Ongoing" && b.driverName === driver?.name && b.fare) {
      // New cancellation rule: the cut commission/advance is held by admin,
      // not refunded instantly — it auto-adjusts against the driver's next
      // accepted trip so the driver isn't out of pocket.
      const held = b.fare * (commissionPct / 100);
      const bonusReverse = b.fare * (bonusPct / 100);
      setDriver({ ...driver, heldCredit: (driver.heldCredit || 0) + held, bonus: Math.max(0, (driver.bonus || 0) - bonusReverse) });
    }
    if (b.status === "Ongoing" && b.driverName) unfreezeDriverName(b.driverName);
    patchDoc("bookings", id, { status: "Cancelled" }).catch((e) => console.error(e));
  };
  const rateBooking = (id, rating) => patchDoc("bookings", id, { rating }).catch((e) => console.error(e));
  // Credits ₹200 to the referring customer's profile the moment a referred
  // user (customer or driver) completes their first successful booking or
  // trip — checked/flagged via referralCredited so it only ever fires once
  // per referred user, no matter how many trips they complete after that.
  const creditReferralOnce = async (mobile, collectionName) => {
    const entity = await getDocOnce(collectionName, mobile);
    if (!entity?.referredBy || entity.referralCredited) return;
    await patchDoc(collectionName, mobile, { referralCredited: true }).catch((e) => console.error("[referral]", e));
    await patchDoc("customers", entity.referredBy, {
      referralBalance: increment(200),
      referralEntries: arrayUnion({ amount: 200, fromMobile: mobile, creditedAt: Date.now(), unlockAt: Date.now() + 60 * DAY_MS }),
    }).catch((e) => console.error("[referral]", e));
  };
  const completeBooking = (id, extraCharge = 0) => {
    const b = bookings.find((x) => x.id === id);
    if (!b) return;
    if (b.driverName) unfreezeDriverName(b.driverName);
    patchDoc("bookings", id, { status: "Completed", progress: 100, extraCharge, fare: (b.fare || 0) + extraCharge }).catch((e) => console.error(e));
    if (b.driverName === driver?.name) setDriver({ ...driver, online: true });
    if (firestoreReady) {
      if (b.customerMobile) creditReferralOnce(b.customerMobile, "customers");
      const bookingDriver = drivers.find((d) => d.name === b.driverName);
      if (bookingDriver?.mobile) creditReferralOnce(bookingDriver.mobile, "drivers");
    }
  };
  const startLoading = (id, adjustMs = 0) => {
    const b = bookings.find((x) => x.id === id);
    if (!b) return;
    const loadingStartedAt = b.loadingStartedAt ? b.loadingStartedAt + adjustMs : Date.now();
    patchDoc("bookings", id, { loadingStartedAt }).catch((e) => console.error(e));
  };
  const updateDriverKyc = (mobile, status) => patchDoc("drivers", mobile, { kyc: status }).catch((e) => console.error(e));
  const toggleBlacklist = (mobile) => {
    const d = drivers.find((x) => x.mobile === mobile);
    if (!d) return;
    patchDoc("drivers", mobile, { blacklisted: !d.blacklisted, online: d.blacklisted ? d.online : false }).catch((e) => console.error(e));
  };
  const raiseAlert = (role, type, note) => createDoc("alerts", genId("A"), { role, type, note: note || null }).catch((e) => console.error(e));

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

  return (
    <div className="min-h-screen flex justify-center" style={{ background: "#DCDDD6", fontFamily: bodyFont }}>
      <div className={`w-full ${isDesktop ? "max-w-3xl" : "max-w-sm"} min-h-screen flex flex-col`} style={{ background: C.bg }}>
        <div className="px-5 pt-6 pb-4" style={{ background: C.navy }}>
          <div className="flex items-center gap-2 mb-4">
            <Logo size={38} showText={false} />
            <div className="flex-1">
              <div className="text-white font-bold text-lg leading-none">{lang === "en" ? "Sarthi Transport" : "सार्थी ट्रांसपोर्ट"}</div>
              <div className="text-[11px]" style={{ color: "#D9C4B0" }}>{lang === "en" ? "All India On-Demand Transport Bidding" : "ऑल इंडिया ऑन-डिमांड ट्रांसपोर्ट बिडिंग"}</div>
            </div>
            <button onClick={() => setLang((l) => (l === "hi" ? "en" : "hi"))}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-bold"
              style={{ background: "#3D1B17", color: "#fff", border: "1px solid #4A1F1F" }}>
              <Globe size={12} /> {lang === "hi" ? "हिं" : "ENG"}
            </button>
          </div>
          {role === "admin" && adminAuth && (
            <div className="mt-1.5 text-[10px] text-center" style={{ color: "#D9C4B0" }}>
              {lang === "en" ? "Overview & approvals — Customer/Driver registration is not available here" : "ओवरव्यू और अप्रूवल — यहां कस्टमर/ड्राइवर रजिस्ट्रेशन उपलब्ध नहीं है"}
            </div>
          )}
        </div>

        {role !== null && role !== "admin" && app !== "customer" && (
          <div className="px-5 py-2 flex items-center gap-1.5" style={{ background: "#F5E6C8", borderBottom: `1px solid ${C.line}` }}>
            <span className="text-sm">💡</span>
            <span className="text-[11px] font-medium" style={{ color: C.inkSoft }}>
              {app === "driver" && (lang === "en" ? "This screen is for truck/tempo drivers — bid on loads and track earnings." : "यह स्क्रीन ट्रक/टेम्पो ड्राइवरों के लिए है — लोड पर बोली लगाएं और कमाई देखें।")}
            </span>
          </div>
        )}

        {role === null && (
          <RoleSelect lang={lang} onSelect={(r) => { setRole(r); setApp(r); }}
            customerVerified={customerAuth.verified} driverVerified={driverAuth.verified} adminVerified={adminAuth}
            onLogoutRole={logoutRole} adminEntry={adminEntry} lockedRole={lockedRole} />
        )}

        {role === "admin" && !adminAuth && (
          <AdminLogin lang={lang} onVerified={() => { setAdminAuth(true); setApp("admin"); }} onBack={adminEntry ? undefined : goHome} />
        )}

        {role === "customer" && (!customerAuth.verified || !customerChecked || !customer) && (
          <CustomerOnboarding lang={lang} authInstance={customerFirebaseAuth} recaptchaContainerId="recaptcha-customer"
            verified={customerAuth.verified} verifiedMobile={customerAuth.mobile} hasProfile={!!customer} checking={customerAuth.verified && !customerChecked}
            onOtpVerified={(mobile) => { setCustomerAuth({ verified: true, mobile }); setLockedRole("customer"); }}
            onLogout={() => (customerAuth.verified ? logoutRole("customer") : goHome())}
            onComplete={(addr) => {
              setCustomer({ mobile: customerAuth.mobile, ...addr });
              if (firestoreReady && customerAuth.mobile) replaceDoc("customers", customerAuth.mobile, { ...addr, mobile: customerAuth.mobile }).catch((e) => console.error(e));
            }} />
        )}
        {role === "customer" && customerAuth.verified && customerChecked && customer && (
          <CustomerApp bookings={bookings} createLoad={createLoad} drivers={drivers} vehicleTypes={vehicleTypes}
            cancelBooking={cancelBooking} rateBooking={rateBooking} acceptBid={acceptBid} lang={lang} onLogout={logout}
            customerProfile={customer} customerMobile={customerAuth.mobile} onUpdateProfile={updateCustomerProfile} requestReferralWithdrawal={requestReferralWithdrawal} raiseAlert={raiseAlert} trialMode={trialMode} onOpenTerms={() => setShowTerms(true)}
            onGoHome={goHome} />
        )}
        {role === "driver" && !driverResubmitting && (!driverAuth.verified || !driver || !driver.vehicleSpec) && (
          <DriverOnboarding lang={lang} authInstance={driverFirebaseAuth} recaptchaContainerId="recaptcha-driver"
            verified={driverAuth.verified}
            onOtpVerified={(mobile) => { setDriverAuth({ verified: true, mobile }); setLockedRole("driver"); }}
            onLogout={() => (driverAuth.verified ? logoutRole("driver") : goHome())}
            driver={driver} setDriver={setDriver} vehicleTypes={vehicleTypes} addVehicleType={addVehicleType} />
        )}
        {role === "driver" && driverAuth.verified && driver && driver.vehicleSpec && driverResubmitting && (
          <div className="flex-1 overflow-y-auto">
            <button onClick={() => logoutRole("driver")} className="flex items-center gap-1 mx-5 mt-4 pl-2 pr-3 py-1.5 rounded-full text-xs font-bold" style={{ background: "#F5E6C8", color: C.marigoldDeep }}>
              <ChevronLeft size={16} strokeWidth={2.75} /> {lang === "en" ? "Back" : "वापस"}
            </button>
            <div className="mx-5 mt-3 rounded-lg p-3 flex items-center gap-2" style={{ background: "#FBEBD2" }}>
              <ShieldCheck size={15} color={C.marigoldDeep} />
              <span className="text-xs font-semibold" style={{ color: C.marigoldDeep }}>{lang === "en" ? "Completing KYC is required before opening the home page." : "होम पेज खोलने से पहले KYC पूरी करना ज़रूरी है।"}</span>
            </div>
            <DriverKyc driver={driver} setDriver={setDriver} vehicleTypes={vehicleTypes} addVehicleType={addVehicleType} lang={lang} />
          </div>
        )}
        {role === "driver" && driverAuth.verified && driver && driver.vehicleSpec && !driverResubmitting && driver.kyc !== "Approved" && (
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center relative">
            <button onClick={() => logoutRole("driver")} className="absolute top-4 left-4 flex items-center gap-1 pl-2 pr-3 py-1.5 rounded-full text-xs font-bold" style={{ background: "#F5E6C8", color: C.marigoldDeep }}>
              <ChevronLeft size={16} strokeWidth={2.75} /> {lang === "en" ? "Back" : "वापस"}
            </button>
            {driver.kyc === "Rejected" ? (
              <>
                <XCircle size={40} color={C.safety} className="mb-3" />
                <h2 className="text-base font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "KYC rejected" : "KYC अस्वीकृत"}</h2>
                <p className="text-xs mb-4" style={{ color: C.inkSoft }}>{lang === "en" ? "Your documents were rejected by admin. Please review and resubmit." : "आपके दस्तावेज़ एडमिन द्वारा अस्वीकृत किए गए हैं। कृपया दोबारा जांच कर सबमिट करें।"}</p>
                <button onClick={() => setDriverResubmitting(true)} className="rounded-lg px-5 py-2.5 text-sm font-bold text-white" style={{ background: C.marigoldDeep }}>
                  {lang === "en" ? "Resubmit KYC" : "KYC दोबारा भरें"}
                </button>
              </>
            ) : (
              <>
                <Clock3 size={40} color={C.marigoldDeep} className="mb-3" />
                <h2 className="text-base font-bold mb-1" style={{ color: C.ink }}>{lang === "en" ? "KYC verification pending" : "KYC सत्यापन लंबित है"}</h2>
                <p className="text-xs" style={{ color: C.inkSoft }}>{lang === "en" ? "Your documents are under review. The dashboard unlocks once admin approves." : "आपके दस्तावेज़ों की समीक्षा हो रही है। एडमिन अप्रूवल के बाद डैशबोर्ड खुलेगा।"}</p>
              </>
            )}
          </div>
        )}
        {role === "driver" && driverAuth.verified && driver && driver.vehicleSpec && !driverResubmitting && driver.kyc === "Approved" && (
          <DriverApp driver={driver} setDriver={setDriver} bookings={bookings} addBid={addBid} completeBooking={completeBooking} startLoading={startLoading}
            tripLog={tripLog} vehicleTypes={vehicleTypes} addVehicleType={addVehicleType} raiseAlert={raiseAlert}
            commissionPct={commissionPct} minWallet={minWallet} bonusPct={bonusPct} trialMode={trialMode} lang={lang} onLogout={logout}
            withdrawals={withdrawals} requestWithdrawal={requestWithdrawal} rechargeRequests={rechargeRequests} requestRecharge={requestRecharge}
            onOpenTerms={() => setShowTerms(true)} onGoHome={goHome} />
        )}
        {role === "admin" && adminAuth && (
          <div className="flex-1 overflow-y-auto">
            <AdminPanel drivers={drivers} customers={allCustomers} driver={driver} updateDriverKyc={updateDriverKyc} bookings={bookings} tripLog={tripLog} alerts={alerts} toggleBlacklist={toggleBlacklist}
              commissionPct={commissionPct} setCommissionPct={setCommissionPct} minWallet={minWallet} setMinWallet={setMinWallet}
              bonusPct={bonusPct} setBonusPct={setBonusPct} lang={lang} onLogout={logout} onGoHome={goHome} trialMode={trialMode} setTrialMode={setTrialMode} trialDaysLeft={trialDaysLeft}
              withdrawals={withdrawals} approveWithdrawal={approveWithdrawal} rechargeRequests={rechargeRequests} approveRecharge={approveRecharge} />
          </div>
        )}

        <TermsFooterLink onOpen={() => setShowTerms(true)} lang={lang} />
      </div>
      <TermsModal open={showTerms} onClose={() => setShowTerms(false)} commissionPct={commissionPct} bonusPct={bonusPct} lang={lang} />
    </div>
  );
}
