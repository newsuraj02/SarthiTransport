// ADMIN BOOKS ON BEHALF OF A CUSTOMER (owner 2026-11-12: "add a book button and call button to personally call the driver from Admin, and if they accept it on the call
// then we book on behalf of the customer -- but the customer has to pay for themselves").
// Admin types the customer's mobile + name, picks Pickup / Drop (the same place boxes as everywhere), Now or an Advance day, and the vehicle category -- the fare shown is the
// SAME number the customer's vehicle list and the Admin Rate Calculator show (buildRouteFareTable / categoryRouteFare, only read here). Then the drivers of that category are
// listed, each with a Call button and a Book button: Admin phones the driver, and if the driver agrees, Book creates the trip ALREADY ASSIGNED to that driver
// (functions/index.js adminBookForCustomer -- nobody else is rung). The customer pays the driver directly; nothing is charged to Admin.
// Also (second step, same day): a ROUND TRIP (fare = one-way + return, the customer's own rule) and a TRANSPORTER's vehicle -- the owner's trip, the vehicle's driver (no app) gets it on WhatsApp.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Phone } from "lucide-react";
import {
  C, LocationField, geocodeAddress, syncRouteDistance, buildRouteFareTable, categoryRouteFare, customerListCategoryOptions, vehicleCategoryText,
  gpsStatus, haversineKm, localDateKey, fmt, formatTripKm, getAdminRouteOverride,
} from "./App.jsx";
import { useGoogleMaps } from "./googleMapsContext.jsx";
import { adminBookForCustomer } from "./firebaseClient";
import { categoryIndexForKg } from "./vehicleModels.js";
import { cleanNameInput, isValidPersonName, digitsOnly } from "./inputRules.js";
import { whatsappLink } from "./fleetDispatch.js";

const T = (lang, en, hi, mr) => (lang === "en" ? en : lang === "mr" ? (mr || hi) : hi);
const inputCls = "w-full rounded-lg p-2.5 text-sm font-bold outline-none";
const inputStyle = { background: C.bg, border: `1px solid ${C.line}`, color: C.ink };

// Advance days offered (same three as the customer's Advance screen) -> { key: "YYYY-MM-DD", label }.
function advanceDays(lang) {
  const names = [T(lang, "Tomorrow", "कल", "उद्या"), T(lang, "Day after tomorrow", "परसों", "परवा"), T(lang, "In 3 days", "परसों के बाद", "परवा नंतर")];
  return [1, 2, 3].map((n, i) => {
    const d = new Date(); d.setDate(d.getDate() + n);
    return { key: localDateKey(d), label: `${names[i]} · ${d.toLocaleDateString(lang === "en" ? "en-IN" : lang === "mr" ? "mr-IN" : "hi-IN", { weekday: "short", day: "numeric", month: "short" })}` };
  });
}

// The reason codes adminBookForCustomer can answer with -> a sentence in the Admin's language.
function failText(res, lang) {
  const r = res && res.reason;
  const m = {
    driver_not_approved: T(lang, "That driver's KYC is not Approved.", "उस ड्राइवर का KYC अप्रूव्ड नहीं है।", "त्या ड्रायव्हरचा KYC मंजूर नाही."),
    driver_blocked: T(lang, "That driver is blocked.", "वह ड्राइवर ब्लॉक है।", "तो ड्रायव्हर ब्लॉक आहे."),
    driver_is_transporter: T(lang, "That is a transporter (owner). A transporter's trip is accepted in his own app.", "यह ट्रांसपोर्टर (मालिक) है। उसकी ट्रिप उसके अपने ऐप में एक्सेप्ट होती है।", "हा ट्रान्सपोर्टर (मालक) आहे. त्याची ट्रिप त्याच्या अ‍ॅपमध्ये स्वीकारली जाते."),
    driver_no_vehicle: T(lang, "That driver has no vehicle saved.", "उस ड्राइवर की गाड़ी सेव नहीं है।", "त्या ड्रायव्हरचे वाहन सेव्ह नाही."),
    driver_busy: T(lang, "That driver is already on a trip at that time.", "वह ड्राइवर उस समय पहले से ट्रिप पर है।", "तो ड्रायव्हर त्या वेळी आधीच ट्रिपवर आहे."),
    driver_not_found: T(lang, "That driver was not found.", "वह ड्राइवर नहीं मिला।", "तो ड्रायव्हर सापडला नाही."),
    number_is_driver: T(lang, "That number belongs to a Driver, so it cannot be booked as a customer.", "यह नंबर किसी ड्राइवर का है, इसलिए ग्राहक के रूप में बुक नहीं हो सकता।", "हा नंबर ड्रायव्हरचा आहे, त्यामुळे ग्राहक म्हणून बुक होऊ शकत नाही."),
    same_number: T(lang, "The customer and the driver cannot be the same number.", "ग्राहक और ड्राइवर का नंबर एक नहीं हो सकता।", "ग्राहक आणि ड्रायव्हरचा नंबर एकच असू शकत नाही."),
    vehicle_not_approved: T(lang, "That vehicle is not Approved yet.", "वह गाड़ी अभी अप्रूव्ड नहीं है।", "ते वाहन अजून मंजूर नाही."),
    vehicle_inactive: T(lang, "That vehicle is switched off by its owner.", "वह गाड़ी मालिक ने बंद रखी है।", "ते वाहन मालकाने बंद ठेवले आहे."),
    vehicle_not_found: T(lang, "That vehicle was not found.", "वह गाड़ी नहीं मिली।", "ते वाहन सापडले नाही."),
    vehicle_no_driver_details: T(lang, "That vehicle has no driver details saved.", "उस गाड़ी के ड्राइवर की जानकारी सेव नहीं है।", "त्या वाहनाच्या ड्रायव्हरची माहिती सेव्ह नाही."),
    owner_not_transporter: T(lang, "That owner is not a transporter.", "वह मालिक ट्रांसपोर्टर नहीं है।", "तो मालक ट्रान्सपोर्टर नाही."),
    fare: T(lang, "The fare does not add up -- check the Round trip and try again.", "भाड़ा मेल नहीं खा रहा — राउंड ट्रिप जाँचकर फिर कोशिश करें।", "भाडे जुळत नाही — राउंड ट्रिप तपासून पुन्हा प्रयत्न करा."),
    "permission-denied": T(lang, "Only Admin can do this.", "यह सिर्फ़ एडमिन कर सकता है।", "हे फक्त अ‍ॅडमिन करू शकतो."),
  };
  return m[r] || (res && res.message) || T(lang, "Could not book -- please try again.", "बुक नहीं हो सका — फिर कोशिश करें।", "बुक होऊ शकले नाही — पुन्हा प्रयत्न करा.");
}

export default function AdminBookForCustomer({ drivers, fleetVehicles = [], fleetPrivate = [], fareTiers, adminRouteFares, dieselPricePerLitre, returnPct = 0, lang, onClose }) {
  const { isLoaded: mapsLoaded, hasKey: mapsHasKey } = useGoogleMaps();
  const mapsReady = mapsHasKey && mapsLoaded;
  const [customerMobile, setCustomerMobile] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [pickup, setPickup] = useState(""); const [pickupCoords, setPickupCoords] = useState(null); const [pickupPlaceId, setPickupPlaceId] = useState(null);
  const [drop, setDrop] = useState(""); const [dropCoords, setDropCoords] = useState(null); const [dropPlaceId, setDropPlaceId] = useState(null);
  const [distance, setDistance] = useState(null);
  const [when, setWhen] = useState("now"); // "now" | "advance"
  const [returnTrip, setReturnTrip] = useState(false);
  const [advanceDate, setAdvanceDate] = useState("");
  const [categoryIndex, setCategoryIndex] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [confirming, setConfirming] = useState(null); // the driver Admin is about to book
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null); // { bookingId, driverName }

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
    syncRouteDistance(pickupCoords, dropCoords, mapsReady, setDistance, distanceRequestRef, "admin book-for-customer distance");
  }, [pickupCoords, dropCoords, mapsReady]);

  const options = useMemo(() => customerListCategoryOptions(lang), [lang]);
  const km = distance || 0;
  const placesReady = !!pickupCoords && !!dropCoords && km > 0;
  // THE fare: the same table the customer's vehicle list and the Admin Rate Calculator read.
  const fareTable = useMemo(
    () => (placesReady ? buildRouteFareTable({ tiers: fareTiers, pickup, drop, distance: km, pickupLat: pickupCoords.lat, pickupLng: pickupCoords.lng, dropLat: dropCoords.lat, dropLng: dropCoords.lng, adminRouteFares, dieselPricePerLitre }) : null),
    [placesReady, fareTiers, pickup, drop, km, pickupCoords, dropCoords, adminRouteFares, dieselPricePerLitre]
  );
  // One-way: the category's fare ({ fare, tierMaxKg }). ROUND TRIP (the customer's own rule): total = one-way + return, where return = Admin's saved return rate for the swapped
  // route if there is one, otherwise the one-way fare less Admin's return %. Returns { fare (what is booked), tierMaxKg, oneWayFare?, returnFare? }.
  const fareFor = (i) => {
    const base = fareTable ? categoryRouteFare(i, fareTiers, fareTable) : null;
    if (!base || !returnTrip) return base;
    const saved = getAdminRouteOverride(drop, pickup, base.tierMaxKg, adminRouteFares, dropCoords?.lat, dropCoords?.lng, pickupCoords?.lat, pickupCoords?.lng, fareTiers, km, null, true);
    const returnFare = saved != null ? Math.round(saved) : Math.round(base.fare * (1 - (Number(returnPct) || 0) / 100));
    return { ...base, oneWayFare: base.fare, returnFare, fare: base.fare + returnFare };
  };
  const chosen = categoryIndex != null ? options.find((o) => o.index === categoryIndex) : null;
  const chosenFare = chosen ? fareFor(chosen.index) : null;
  const days = useMemo(() => advanceDays(lang), [lang]);

  const mobileOk = customerMobile.length === 10;
  const nameOk = isValidPersonName(customerName);
  const whenOk = when === "now" || !!advanceDate;
  const ready = mobileOk && nameOk && placesReady && whenOk && !!chosen && !!chosenFare && chosenFare.fare > 0;

  // The drivers Admin can phone: Approved, not blocked, not a transporter (his trip is accepted in his own app), with a vehicle. Same category first; "show all" lists every vehicle.
  const rows = useMemo(() => {
    if (!chosen) return [];
    return (drivers || [])
      .filter((d) => d && d.mobile && d.kyc === "Approved" && !d.blacklisted && !d.fleetOwner && !d.fleetVehicleId && Number(d.vehicleSpec?.capacityKg) > 0)
      .filter((d) => showAll || categoryIndexForKg(Number(d.vehicleSpec.capacityKg), options) === chosen.index)
      .map((d) => {
        const loc = d.lastKnownLocation;
        const kmAway = pickupCoords && loc && loc.lat != null && loc.lng != null ? haversineKm(pickupCoords.lat, pickupCoords.lng, loc.lat, loc.lng) : null;
        return { d, kmAway };
      })
      .sort((a, b) => (b.d.online ? 1 : 0) - (a.d.online ? 1 : 0) || (a.kmAway ?? 1e9) - (b.kmAway ?? 1e9));
  }, [drivers, chosen, showAll, pickupCoords, options]);

  // A TRANSPORTER's vehicles of the category (owner 2026-11-12): Approved + active vehicles of an Approved, unblocked transporter, with the driver details the owner saved (the
  // vehicle's driver has no app). Admin can phone the owner or the driver.
  const fleetRows = useMemo(() => {
    if (!chosen) return [];
    const owners = new Map((drivers || []).filter((d) => d && d.fleetOwner && d.kyc === "Approved" && !d.blacklisted).map((d) => [d.mobile, d]));
    const priv = new Map((fleetPrivate || []).map((p) => [p.id, p]));
    return (fleetVehicles || [])
      .filter((v) => v && v.kyc === "Approved" && v.active !== false && Number(v.capacityKg) > 0 && owners.has(v.ownerMobile) && priv.has(v.id))
      .filter((v) => showAll || categoryIndexForKg(Number(v.capacityKg), options) === chosen.index)
      .map((v) => ({ v, owner: owners.get(v.ownerMobile), priv: priv.get(v.id) }))
      .sort((a, b) => (b.owner.online ? 1 : 0) - (a.owner.online ? 1 : 0));
  }, [fleetVehicles, fleetPrivate, drivers, chosen, showAll, options]);

  const scheduledFor = when === "advance" && advanceDate ? `${advanceDate} 08:00` : null;
  const doBook = async () => {
    if (!confirming || !ready || working) return;
    setWorking(true); setError("");
    const res = await adminBookForCustomer({
      customerMobile, customerName: customerName.trim(),
      ...(confirming.fleetVehicleId ? { fleetVehicleId: confirming.fleetVehicleId } : { driverMobile: confirming.mobile }),
      pickup, drop, pickupLat: pickupCoords.lat, pickupLng: pickupCoords.lng, dropLat: dropCoords.lat, dropLng: dropCoords.lng,
      pickupPlaceId, dropPlaceId, placeLang: lang,
      fare: chosenFare.fare, tierMaxKg: chosenFare.tierMaxKg, listCategory: chosen.index,
      listCategoryKg: chosen.index >= options.length - 1 ? 999999 : chosen.capacityKg,
      distance: km, scheduledFor,
      ...(returnTrip ? { returnTrip: true, oneWayFare: chosenFare.oneWayFare, returnFare: chosenFare.returnFare, returnPct: Number(returnPct) || 0 } : {}),
    });
    setWorking(false);
    if (res && res.ok) { setDone({ bookingId: res.bookingId, driverName: confirming.name, fleet: !!res.fleet, dispatch: res.dispatch || null }); setConfirming(null); return; }
    setError(failText(res, lang)); setConfirming(null);
  };

  const label = "text-[11px] font-bold mb-1";
  return (
    <div data-admin-book-for-customer className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(15,27,45,0.55)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-2xl overflow-hidden max-h-[92vh] flex flex-col relative" style={{ background: C.paper }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-center justify-between shrink-0" style={{ background: C.navy }}>
          <h3 className="text-sm font-bold" style={{ color: "#fff" }}>{T(lang, "Book for a customer", "ग्राहक के लिए बुक करें", "ग्राहकासाठी बुक करा")}</h3>
          <button onClick={onClose} className="text-base font-bold" style={{ color: "#fff" }} aria-label="Close">✕</button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          {done ? (
            <div data-admin-book-done className="rounded-xl p-4 text-center space-y-2" style={{ background: "#E8F7EE", border: `1px solid ${C.success}` }}>
              <div className="text-sm font-extrabold" style={{ color: C.ink }}>{T(lang, "Booked", "बुक हो गया", "बुक झाले")} · {done.bookingId}</div>
              <div className="text-xs" style={{ color: C.inkSoft }}>
                {T(lang, `${done.driverName} now has this trip. Tell the driver to open the app. The customer pays the driver directly.`, `${done.driverName} के पास यह ट्रिप आ गई है। ड्राइवर को ऐप खोलने को कहें। ग्राहक ड्राइवर को सीधे भुगतान करेगा।`, `${done.driverName} कडे ही ट्रिप आली आहे. ड्रायव्हरला अ‍ॅप उघडायला सांगा. ग्राहक ड्रायव्हरला थेट पैसे देईल.`)}
              </div>
              {done.fleet && done.dispatch && (
                <div data-admin-book-fleet-dispatch className="text-xs space-y-1.5 text-left rounded-lg p-2.5" style={{ background: "#FFFFFF", border: `1px solid ${C.line}`, color: C.ink }}>
                  {done.dispatch.sent
                    ? <div className="font-bold" style={{ color: C.success }}>{T(lang, "The trip was sent to the vehicle's driver on WhatsApp.", "ट्रिप गाड़ी के ड्राइवर को WhatsApp पर भेज दी गई।", "ट्रिप वाहनाच्या ड्रायव्हरला WhatsApp वर पाठवली.")}</div>
                    : (
                      <>
                        <div className="font-bold" style={{ color: C.marigoldDeep }}>{T(lang, "Automatic WhatsApp is not set up. Send the trip to the vehicle's driver yourself:", "ऑटोमैटिक WhatsApp चालू नहीं है। गाड़ी के ड्राइवर को ट्रिप खुद भेजें:", "ऑटोमॅटिक WhatsApp चालू नाही. वाहनाच्या ड्रायव्हरला ट्रिप स्वतः पाठवा:")}</div>
                        {done.dispatch.text && whatsappLink(done.dispatch.driverMobile, done.dispatch.text) && (
                          <a href={whatsappLink(done.dispatch.driverMobile, done.dispatch.text)} target="_blank" rel="noreferrer" data-admin-book-send-whatsapp className="block text-center rounded-lg py-2 font-extrabold" style={{ background: C.success, color: "#fff" }}>{T(lang, "Send on WhatsApp", "WhatsApp पर भेजें", "WhatsApp वर पाठवा")}</a>
                        )}
                      </>
                    )}
                  <div style={{ color: C.inkSoft }}>{T(lang, "Also tell the transporter (owner) on the phone to open his app: the trip is on his Home.", "ट्रांसपोर्टर (मालिक) को फ़ोन पर कहें कि अपना ऐप खोले: ट्रिप उसके होम पर है।", "ट्रान्सपोर्टरला (मालकाला) फोनवर सांगा की अ‍ॅप उघडा: ट्रिप त्याच्या होमवर आहे.")}</div>
                </div>
              )}
              <button onClick={onClose} className="rounded-lg px-4 py-2 text-xs font-extrabold" style={{ background: C.navy, color: "#fff" }}>{T(lang, "Done", "ठीक है", "ठीक आहे")}</button>
            </div>
          ) : (
            <>
              <p className="text-[11px] leading-snug" style={{ color: C.inkSoft }}>
                {T(lang, "Phone the driver first. Press Book only if the driver agrees. The customer pays the driver directly.", "पहले ड्राइवर को फ़ोन करें। ड्राइवर के मानने पर ही बुक दबाएँ। ग्राहक ड्राइवर को सीधे भुगतान करेगा।", "आधी ड्रायव्हरला फोन करा. ड्रायव्हरने होकार दिल्यावरच बुक दाबा. ग्राहक ड्रायव्हरला थेट पैसे देईल.")}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className={label} style={{ color: C.inkSoft }}>{T(lang, "Customer mobile", "ग्राहक मोबाइल", "ग्राहक मोबाइल")}</div>
                  <input data-admin-book-mobile inputMode="numeric" className={inputCls} style={inputStyle} value={customerMobile} onChange={(e) => setCustomerMobile(digitsOnly(e.target.value, 10))} placeholder="10 digits" />
                </div>
                <div>
                  <div className={label} style={{ color: C.inkSoft }}>{T(lang, "Customer name", "ग्राहक का नाम", "ग्राहकाचे नाव")}</div>
                  <input data-admin-book-name className={inputCls} style={inputStyle} value={customerName} onChange={(e) => setCustomerName(cleanNameInput(e.target.value))} />
                </div>
              </div>
              <div className="space-y-2">
                <LocationField lang={lang} value={pickup}
                  onChange={(e) => { setPickup(e.target.value); setPickupCoords(null); setPickupPlaceId(null); }}
                  onPlaceSelected={(p) => { setPickup(p.name); setPickupCoords({ lat: p.lat, lng: p.lng }); setPickupPlaceId(p.placeId || null); }}
                  mapsReady={mapsReady} placeholder={T(lang, "Pickup", "पिकअप", "पिकअप")} />
                <LocationField lang={lang} value={drop}
                  onChange={(e) => { setDrop(e.target.value); setDropCoords(null); setDropPlaceId(null); }}
                  onPlaceSelected={(p) => { setDrop(p.name); setDropCoords({ lat: p.lat, lng: p.lng }); setDropPlaceId(p.placeId || null); }}
                  mapsReady={mapsReady} placeholder={T(lang, "Drop", "ड्रॉप", "ड्रॉप")} />
                {km > 0 && <div className="text-xs font-extrabold" style={{ color: C.ink }}>{formatTripKm(km, lang)}</div>}
              </div>
              <div className="flex gap-2">
                {[["now", T(lang, "Now", "अभी", "आत्ता")], ["advance", T(lang, "Advance", "एडवांस", "अ‍ॅडव्हान्स")]].map(([k, text]) => (
                  <button key={k} type="button" data-admin-book-when={k} onClick={() => setWhen(k)} className="flex-1 rounded-lg py-2 text-xs font-extrabold"
                    style={{ background: when === k ? C.navy : C.bg, color: when === k ? "#fff" : C.ink, border: `1px solid ${C.line}` }}>{text}</button>
                ))}
              </div>
              <label data-admin-book-round-trip className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 cursor-pointer select-none" style={{ background: C.bg, border: `1px solid ${returnTrip ? C.success : C.line}` }}>
                <span className="text-xs font-bold" style={{ color: C.ink }}>↔ {T(lang, "Round trip (one-way + return)", "राउंड ट्रिप (जाना + वापसी)", "राउंड ट्रिप (जाणे + परत)")}</span>
                <input type="checkbox" checked={returnTrip} onChange={(e) => { setReturnTrip(e.target.checked); setConfirming(null); setError(""); }} className="w-5 h-5 shrink-0 rounded" style={{ accentColor: C.navy }} />
              </label>
              {when === "advance" && (
                <div className="grid grid-cols-1 gap-1.5" data-admin-book-days>
                  {days.map((d) => (
                    <button key={d.key} type="button" onClick={() => setAdvanceDate(d.key)} className="rounded-lg py-2 text-xs font-bold"
                      style={{ background: advanceDate === d.key ? "#E8F7EE" : C.bg, border: `1px solid ${advanceDate === d.key ? C.success : C.line}`, color: C.ink }}>{d.label}</button>
                  ))}
                </div>
              )}
              {placesReady && (
                <div data-admin-book-categories className="space-y-1">
                  <div className={label} style={{ color: C.inkSoft }}>{T(lang, "Vehicle category (the fare the customer sees)", "गाड़ी की श्रेणी (ग्राहक को दिखने वाला भाड़ा)", "वाहन श्रेणी (ग्राहकाला दिसणारे भाडे)")}</div>
                  {options.map((o) => {
                    const f = fareFor(o.index);
                    const on = categoryIndex === o.index;
                    return (
                      <button key={o.index} type="button" data-admin-book-category={o.index} onClick={() => { setCategoryIndex(o.index); setConfirming(null); setError(""); }}
                        className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left"
                        style={{ background: on ? "#E8F7EE" : C.bg, border: `1px solid ${on ? C.success : C.line}` }}>
                        <span className="text-xs font-bold truncate" style={{ color: C.ink }}>{o.label}</span>
                        <span className="text-xs font-extrabold shrink-0 text-right" style={{ color: C.ink }}>
                          {f && f.fare > 0 ? fmt(f.fare) : "—"}
                          {f && f.returnFare != null && <span className="block text-[10px] font-semibold" style={{ color: C.inkSoft }}>{fmt(f.oneWayFare)} + {fmt(f.returnFare)} ↩</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {ready && (
                <div data-admin-book-drivers className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-bold" style={{ color: C.inkSoft }}>{T(lang, `Drivers (${rows.length}) — call, then Book`, `ड्राइवर (${rows.length}) — फ़ोन करें, फिर बुक`, `ड्रायव्हर (${rows.length}) — फोन करा, मग बुक`)}</div>
                    <label className="flex items-center gap-1 text-[11px] font-semibold cursor-pointer" style={{ color: C.inkSoft }}>
                      <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> {T(lang, "All vehicles", "सभी गाड़ियाँ", "सर्व गाड्या")}
                    </label>
                  </div>
                  {rows.length === 0 && fleetRows.length === 0 && <p className="text-xs text-center py-3" style={{ color: C.inkSoft }}>{T(lang, "No Approved driver in this category. Tick \"All vehicles\".", "इस श्रेणी में कोई अप्रूव्ड ड्राइवर नहीं। \"सभी गाड़ियाँ\" टिक करें।", "या श्रेणीत मंजूर ड्रायव्हर नाही. \"सर्व गाड्या\" टिक करा.")}</p>}
                  {rows.map(({ d, kmAway }) => {
                    const g = gpsStatus(d, lang);
                    return (
                      <div key={d.mobile} data-admin-book-driver={d.mobile} className="rounded-lg p-2.5" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-extrabold truncate" style={{ color: C.ink }}>{d.name || "—"}</div>
                            <div className="text-[11px]" style={{ color: C.inkSoft }}>{d.mobile} · {vehicleCategoryText(d.vehicleSpec.capacityKg, lang)}</div>
                            <div className="text-[11px] flex items-center gap-1.5 mt-0.5" style={{ color: C.inkSoft }}>
                              <span className="font-bold" style={{ color: d.online ? C.success : C.inkSoft }}>{d.online ? T(lang, "On duty", "ड्यूटी पर", "ड्युटीवर") : T(lang, "Off duty", "ड्यूटी बंद", "ड्युटी बंद")}</span>
                              <span>· GPS {g.label}</span>
                              {kmAway != null && <span>· {Math.round(kmAway)} km</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <a href={`tel:+91${d.mobile}`} data-admin-book-call className="p-2.5 rounded-lg flex items-center justify-center" style={{ background: C.success, color: "#fff" }} aria-label="Call"><Phone size={16} /></a>
                            <button type="button" data-admin-book-btn onClick={() => { setConfirming({ mobile: d.mobile, name: d.name }); setError(""); }} className="px-3 py-2.5 rounded-lg text-xs font-extrabold" style={{ background: C.navy, color: "#fff" }}>{T(lang, "Book", "बुक", "बुक")}</button>
                          </div>
                        </div>
                        {confirming && !confirming.fleetVehicleId && confirming.mobile === d.mobile && (
                          <div data-admin-book-confirm className="mt-2 rounded-lg p-2.5 space-y-2" style={{ background: "#FFF8E1", border: `1px solid ${C.marigoldDeep}` }}>
                            <div className="text-xs" style={{ color: C.ink }}>
                              {T(lang, `Book ${d.name} for ${customerName.trim()} (${customerMobile}) at ${fmt(chosenFare.fare)}? Only if the driver agreed on the call. The customer pays the driver directly.`, `${customerName.trim()} (${customerMobile}) के लिए ${d.name} को ${fmt(chosenFare.fare)} में बुक करें? सिर्फ़ तब जब ड्राइवर कॉल पर मान गया हो। ग्राहक ड्राइवर को सीधे भुगतान करेगा।`, `${customerName.trim()} (${customerMobile}) साठी ${d.name} ला ${fmt(chosenFare.fare)} मध्ये बुक करायचे? फक्त ड्रायव्हरने कॉलवर होकार दिला असेल तरच. ग्राहक ड्रायव्हरला थेट पैसे देईल.`)}
                            </div>
                            <div className="flex gap-2">
                              <button type="button" disabled={working} data-admin-book-confirm-yes onClick={doBook} className="flex-1 rounded-lg py-2 text-xs font-extrabold" style={{ background: working ? "#E5EAF2" : C.success, color: working ? "#9AA3B0" : "#fff" }}>{working ? T(lang, "Booking…", "बुक हो रहा है…", "बुक होत आहे…") : T(lang, "Yes, book", "हाँ, बुक करें", "हो, बुक करा")}</button>
                              <button type="button" disabled={working} onClick={() => setConfirming(null)} className="flex-1 rounded-lg py-2 text-xs font-extrabold" style={{ background: C.bg, color: C.ink, border: `1px solid ${C.line}` }}>{T(lang, "Cancel", "रद्द करें", "रद्द करा")}</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {ready && fleetRows.length > 0 && (
                <div data-admin-book-fleet className="space-y-1.5">
                  <div className="text-[11px] font-bold" style={{ color: C.inkSoft }}>{T(lang, `Transporters' vehicles (${fleetRows.length}) — call the owner or the driver, then Book`, `ट्रांसपोर्टर की गाड़ियाँ (${fleetRows.length}) — मालिक या ड्राइवर को फ़ोन करें, फिर बुक`, `ट्रान्सपोर्टरची वाहने (${fleetRows.length}) — मालक किंवा ड्रायव्हरला फोन करा, मग बुक`)}</div>
                  {fleetRows.map(({ v, owner, priv }) => (
                    <div key={v.id} data-admin-book-fleet-vehicle={v.id} className="rounded-lg p-2.5" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-extrabold truncate" style={{ color: C.ink }}>{priv.vehicleNumber || v.vehicleName || "—"} <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: C.bg, color: C.inkSoft }}>{T(lang, "Transporter", "ट्रांसपोर्टर", "ट्रान्सपोर्टर")}</span></div>
                          <div className="text-[11px]" style={{ color: C.inkSoft }}>{vehicleCategoryText(v.capacityKg, lang)}</div>
                          <div className="text-[11px]" style={{ color: C.inkSoft }}>{T(lang, "Owner", "मालिक", "मालक")}: {owner.name || "—"} · {owner.mobile}</div>
                          <div className="text-[11px]" style={{ color: C.inkSoft }}>{T(lang, "Driver", "ड्राइवर", "ड्रायव्हर")}: {priv.driverName} · {priv.driverMobile}</div>
                          <div className="text-[11px] font-bold" style={{ color: owner.online ? C.success : C.inkSoft }}>{owner.online ? T(lang, "Owner on duty", "मालिक ड्यूटी पर", "मालक ड्युटीवर") : T(lang, "Owner off duty", "मालिक ड्यूटी बंद", "मालक ड्युटी बंद")}</div>
                        </div>
                        <div className="flex flex-col items-stretch gap-1.5 shrink-0">
                          <a href={`tel:+91${owner.mobile}`} data-admin-book-call-owner className="px-2.5 py-2 rounded-lg flex items-center justify-center gap-1 text-[11px] font-extrabold" style={{ background: C.success, color: "#fff" }}><Phone size={13} /> {T(lang, "Owner", "मालिक", "मालक")}</a>
                          {priv.driverMobile && <a href={`tel:+91${priv.driverMobile}`} data-admin-book-call-fleet-driver className="px-2.5 py-2 rounded-lg flex items-center justify-center gap-1 text-[11px] font-extrabold" style={{ background: C.success, color: "#fff" }}><Phone size={13} /> {T(lang, "Driver", "ड्राइवर", "ड्रायव्हर")}</a>}
                          <button type="button" data-admin-book-fleet-btn onClick={() => { setConfirming({ fleetVehicleId: v.id, name: `${priv.vehicleNumber || v.vehicleName} (${priv.driverName})` }); setError(""); }} className="px-2.5 py-2 rounded-lg text-xs font-extrabold" style={{ background: C.navy, color: "#fff" }}>{T(lang, "Book", "बुक", "बुक")}</button>
                        </div>
                      </div>
                      {confirming && confirming.fleetVehicleId === v.id && (
                        <div data-admin-book-confirm className="mt-2 rounded-lg p-2.5 space-y-2" style={{ background: "#FFF8E1", border: `1px solid ${C.marigoldDeep}` }}>
                          <div className="text-xs" style={{ color: C.ink }}>
                            {T(lang, `Book ${confirming.name} for ${customerName.trim()} (${customerMobile}) at ${fmt(chosenFare.fare)}? Only if the owner / driver agreed on the call. The customer pays the driver directly.`, `${customerName.trim()} (${customerMobile}) के लिए ${confirming.name} को ${fmt(chosenFare.fare)} में बुक करें? सिर्फ़ तब जब मालिक / ड्राइवर कॉल पर मान गया हो। ग्राहक ड्राइवर को सीधे भुगतान करेगा।`, `${customerName.trim()} (${customerMobile}) साठी ${confirming.name} ला ${fmt(chosenFare.fare)} मध्ये बुक करायचे? फक्त मालक / ड्रायव्हरने कॉलवर होकार दिला असेल तरच. ग्राहक ड्रायव्हरला थेट पैसे देईल.`)}
                          </div>
                          <div className="flex gap-2">
                            <button type="button" disabled={working} data-admin-book-confirm-yes onClick={doBook} className="flex-1 rounded-lg py-2 text-xs font-extrabold" style={{ background: working ? "#E5EAF2" : C.success, color: working ? "#9AA3B0" : "#fff" }}>{working ? T(lang, "Booking…", "बुक हो रहा है…", "बुक होत आहे…") : T(lang, "Yes, book", "हाँ, बुक करें", "हो, बुक करा")}</button>
                            <button type="button" disabled={working} onClick={() => setConfirming(null)} className="flex-1 rounded-lg py-2 text-xs font-extrabold" style={{ background: C.bg, color: C.ink, border: `1px solid ${C.line}` }}>{T(lang, "Cancel", "रद्द करें", "रद्द करा")}</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {error && <p data-admin-book-error className="text-xs font-bold" style={{ color: C.safety }}>{error}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
