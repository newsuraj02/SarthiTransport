// FLEET OWNER screens (owner 2026-11-08, "the fleet owner flow"): a transporter signs up once, adds every vehicle + its driver (people with NO app), is rung for a booking,
// taps Accept, picks ONE free vehicle, and the driver gets the trip on WhatsApp. Data: `fleetVehicles` (public: capacity, kyc, active) + `fleetVehiclePrivate` (driver name +
// phone, vehicle number, document photos -- owner + Admin only). Rules: firestore.rules. Logic of who is rung / listed: functions/tripLock.js + fleetPseudoDrivers (App.jsx).
// Loaded lazily from App.jsx / AdminPanel.jsx (they import from here, this imports from App.jsx -- lazy keeps the cycle harmless).
import React, { useState } from "react";
import { ChevronDown, Phone } from "lucide-react";
import { C, uploadPhoto, customerListCategoryOptions, vehicleCategoryText } from "./App.jsx";
import { createDoc, patchDoc, removeDoc } from "./firestoreStore";
import { buildFleetDispatchText, whatsappLink } from "./fleetDispatch.js";
import { cleanNameInput, isValidPersonName, digitsOnly } from "./inputRules.js";
import VehicleModelPicker from "./VehicleModelPicker.jsx";
import { resolveVehicleChoice, categoryIndexForKg } from "./vehicleModels.js";

const T = (lang, en, hi, mr) => (lang === "en" ? en : lang === "mr" ? (mr || hi) : hi);
const digits = (v, n) => digitsOnly(v, n);
const newVehicleId = (owner) => `${owner}_${Date.now().toString(36)}${Math.floor(Math.random() * 36 ** 2).toString(36)}`;

function PhotoPick({ label, file, onFile, required, lang }) {
  const url = file ? URL.createObjectURL(file) : null;
  return (
    <label className="block">
      <div className="text-[11px] font-bold mb-1" style={{ color: C.inkSoft }}>{label}{required ? " *" : ""}</div>
      <div className="rounded-lg flex items-center justify-center overflow-hidden" style={{ background: C.bg, border: `1px dashed ${file ? C.success : C.line}`, minHeight: 72 }}>
        {url ? <img src={url} alt="" className="w-full" style={{ maxHeight: 120, objectFit: "cover" }} />
          : <span className="text-xs font-semibold py-5" style={{ color: C.inkSoft }}>{T(lang, "Tap to add photo", "फोटो जोड़ने के लिए टैप करें", "फोटो जोडण्यासाठी टॅप करा")}</span>}
      </div>
      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) onFile(f); }} />
    </label>
  );
}

const field = "w-full rounded-lg p-2.5 text-sm font-bold outline-none";
const fieldStyle = { background: C.bg, border: `1px solid ${C.line}`, color: C.ink };

// One vehicle + its driver. Everything the owner types lands in the PRIVATE doc; only capacity / name / kyc / active are public.
function FleetVehicleForm({ ownerMobile, lang, onSaved, onCancel }) {
  const [v, setV] = useState({ driverName: "", driverMobile: "", vehicleNumber: "", vehicleChoice: "", categoryIndex: null });
  const [files, setFiles] = useState({ driverPhoto: null, dl: null, vehicleSide: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, val) => { setV((p) => ({ ...p, [k]: val })); setError(""); };
  const missing = [];
  if (!isValidPersonName(v.driverName)) missing.push(T(lang, "driver name", "ड्राइवर का नाम", "ड्रायव्हरचे नाव"));
  if (digits(v.driverMobile, 10).length !== 10) missing.push(T(lang, "driver's 10-digit mobile", "ड्राइवर का 10 अंकों का मोबाइल", "ड्रायव्हरचा 10 अंकी मोबाइल"));
  if (!v.vehicleNumber.trim()) missing.push(T(lang, "vehicle number", "गाड़ी नंबर", "गाडी नंबर"));
  // Vehicle (owner 2026-11-10: the SAME company -> model picker as the driver KYC and Admin's edit forms; "not listed" -> a weight category). The weight comes from the pick, never typed;
  // the vehicle is listed / rung in the category its weight falls in (categoryIndexForKg).
  const categories = customerListCategoryOptions(lang);
  const picked = resolveVehicleChoice(v.vehicleChoice, { categoryOptions: customerListCategoryOptions("en"), categoryIndex: v.categoryIndex });
  const vehicleName = picked ? picked.name : "";
  const capacityKg = picked ? picked.kg : 0;
  const pickedCategoryIndex = picked ? categoryIndexForKg(picked.kg, categories) : null;
  if (!picked) missing.push(T(lang, "vehicle (company + model, or weight category)", "गाड़ी (कंपनी + मॉडल, या वज़न वर्ग)", "गाडी (कंपनी + मॉडेल, किंवा वजन वर्ग)"));
  if (!files.driverPhoto) missing.push(T(lang, "driver photo", "ड्राइवर की फोटो", "ड्रायव्हरचा फोटो"));
  if (!files.dl) missing.push(T(lang, "driving licence photo", "ड्राइविंग लाइसेंस की फोटो", "ड्रायव्हिंग लायसन्स फोटो"));

  const save = async () => {
    if (missing.length || saving) return;
    setSaving(true); setError("");
    const id = newVehicleId(ownerMobile);
    try {
      const up = async (file, key) => {
        if (!file) return null;
        let reason = null;
        const done = await uploadPhoto(file, `drivers/${ownerMobile}/fleet_${id}_${key}.jpg`, 900, 0.72, null, (r) => { reason = r; });
        if (!done || !done.url) throw new Error(`upload-failed:${key}:${reason || ""}`); // uploadPhoto returns { name, url }
        return done.url;
      };
      const [driverPhotoUrl, dlPhotoUrl, vehicleSideUrl] = await Promise.all([up(files.driverPhoto, "driver"), up(files.dl, "dl"), up(files.vehicleSide, "vehicle")]);
      await createDoc("fleetVehicles", id, { ownerMobile, vehicleName, capacityKg, categoryIndex: pickedCategoryIndex, vehicleCompany: picked.company || null, vehicleModel: picked.model || null, kyc: "Pending", active: true });
      await createDoc("fleetVehiclePrivate", id, {
        ownerMobile, driverName: v.driverName.trim(), driverMobile: digits(v.driverMobile, 10), vehicleNumber: v.vehicleNumber.trim().toUpperCase(),
        vehicleName, capacityKg, categoryIndex: pickedCategoryIndex, driverPhotoUrl, dlPhotoUrl, vehicleSideUrl,
      });
      onSaved(id);
    } catch (e) {
      console.error("[fleet vehicle save]", e);
      setError(T(lang, "Couldn't save — check the photos and try again.", "सेव नहीं हो पाया — फोटो जाँचकर दोबारा कोशिश करें।", "सेव्ह झाले नाही — फोटो तपासून पुन्हा प्रयत्न करा."));
    }
    setSaving(false);
  };

  return (
    <div className="p-4 space-y-3" data-fleet-vehicle-form>
      <div className="text-sm font-extrabold" style={{ color: C.ink }}>{T(lang, "Vehicle and driver", "गाड़ी और ड्राइवर की जानकारी", "गाडी व ड्रायव्हरची माहिती")}</div>
      <input value={v.driverName} onChange={(e) => set("driverName", cleanNameInput(e.target.value))} className={field} style={fieldStyle} placeholder={T(lang, "Driver name", "ड्राइवर का नाम", "ड्रायव्हरचे नाव")} />
      <input value={v.driverMobile} onChange={(e) => set("driverMobile", digits(e.target.value, 10))} inputMode="numeric" className={field} style={fieldStyle}
        placeholder={T(lang, "Driver's mobile number (gets the trip on WhatsApp)", "ड्राइवर का मोबाइल नंबर (ट्रिप WhatsApp पर मिलेगी)", "ड्रायव्हरचा मोबाइल (ट्रिप WhatsApp वर मिळेल)")} />
      <input value={v.vehicleNumber} onChange={(e) => set("vehicleNumber", e.target.value)} className={field} style={fieldStyle} placeholder={T(lang, "Vehicle number (e.g. MH12AB1234)", "गाड़ी नंबर (जैसे MH12AB1234)", "गाडी नंबर (उदा. MH12AB1234)")} />
<div data-fleet-vehicle-picker>
        <VehicleModelPicker lang={lang} choice={v.vehicleChoice} setChoice={(c) => set("vehicleChoice", c)} categoryIndex={v.categoryIndex} setCategoryIndex={(i) => set("categoryIndex", i)}
          categoryOptions={customerListCategoryOptions("en").map((o, i) => ({ ...o, label: categories[i].label }))} saved={null} resolved={picked}
          inputCls={field} inputStyle={fieldStyle} labelColor={C.inkSoft} requiredColor={C.safety} okColor={C.success} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PhotoPick lang={lang} required label={T(lang, "Driver photo", "ड्राइवर की फोटो", "ड्रायव्हरचा फोटो")} file={files.driverPhoto} onFile={(f) => setFiles((p) => ({ ...p, driverPhoto: f }))} />
        <PhotoPick lang={lang} required label={T(lang, "Driving licence", "ड्राइविंग लाइसेंस", "ड्रायव्हिंग लायसन्स")} file={files.dl} onFile={(f) => setFiles((p) => ({ ...p, dl: f }))} />
      </div>
      <PhotoPick lang={lang} label={T(lang, "Vehicle photo (optional)", "गाड़ी की फोटो (वैकल्पिक)", "गाडीचा फोटो (ऐच्छिक)")} file={files.vehicleSide} onFile={(f) => setFiles((p) => ({ ...p, vehicleSide: f }))} />
      {missing.length > 0 && <div className="text-[11px] font-semibold" style={{ color: C.marigoldDeep }}>{T(lang, "Still needed: ", "अभी चाहिए: ", "अजून हवे: ")}{missing.join(", ")}</div>}
      {error && <div className="text-xs font-bold" style={{ color: C.safety }}>{error}</div>}
      <div className="flex gap-2">
        {onCancel && <button onClick={onCancel} disabled={saving} className="rounded-lg px-4 py-3 text-sm font-bold" style={{ background: "#E5EAF2", color: C.inkSoft }}>{T(lang, "Cancel", "रद्द करें", "रद्द करा")}</button>}
        <button onClick={save} disabled={missing.length > 0 || saving} className="flex-1 rounded-lg py-3 text-sm font-extrabold"
          style={{ background: missing.length || saving ? "#E5EAF2" : C.success, color: missing.length || saving ? "#9AA3B0" : "#fff" }}>
          {saving ? "…" : T(lang, "Save vehicle", "गाड़ी सेव करें", "गाडी सेव्ह करा")}
        </button>
      </div>
    </div>
  );
}

// Setup (the gate right after a fleet owner signs up) and "My fleet" (manage later) in one component.
// mode "setup": form -> "Add another vehicle?" Yes/No loop -> onFinish() on No (needs at least one vehicle).
// mode "manage": the list with Add / on-off / remove.
export function FleetSetup({ owner, vehicles, privateById, lang, mode = "setup", openForm = false, onFinish, onClose, onCountChange }) {
  const mine = (vehicles || []).filter((x) => x.ownerMobile === owner.mobile);
  const [view, setView] = useState(openForm || (mode === "setup" && mine.length === 0) ? "form" : mode === "setup" ? "ask" : "list");
  const afterSave = (n) => { onCountChange && onCountChange(n); setView(mode === "setup" ? "ask" : "list"); };
  const statusChip = (x) => x.kyc === "Approved" ? [T(lang, "Approved", "स्वीकृत", "मंजूर"), C.success] : x.kyc === "Rejected" ? [T(lang, "Rejected", "अस्वीकृत", "नाकारले"), C.safety] : [T(lang, "Under review", "जाँच में", "तपासणीत"), C.marigoldDeep];
  return (
    <div className="flex-1 overflow-y-auto" data-fleet-setup>
      <div className="px-5 py-4 flex items-center justify-between" style={{ background: C.navy }}>
        <h3 className="text-sm font-bold text-white">{mode === "setup" ? T(lang, "Add your vehicles and drivers", "अपनी गाड़ियाँ और ड्राइवर जोड़ें", "तुमच्या गाड्या व ड्रायव्हर जोडा") : T(lang, "My fleet", "मेरी फ्लीट", "माझी फ्लीट")}</h3>
        {mode === "manage" && onClose && <button onClick={onClose} className="text-base font-bold text-white">✕</button>}
      </div>
      <div className="mx-4 mt-3 rounded-lg p-3 text-xs font-semibold" style={{ background: C.metallicGold, color: "#000000" }}>
        {T(lang, "Only you need the app. Your drivers need no app: when you accept a booking and pick a vehicle, the driver gets pickup, drop and the numbers on WhatsApp.",
          "सिर्फ़ आपको ऐप चाहिए। आपके ड्राइवरों को ऐप की ज़रूरत नहीं: बुकिंग एक्सेप्ट करके गाड़ी चुनते ही ड्राइवर को पिकअप, ड्रॉप और नंबर WhatsApp पर मिल जाएँगे।",
          "फक्त तुम्हाला अ‍ॅप हवे. ड्रायव्हरना अ‍ॅप नको: बुकिंग स्वीकारून गाडी निवडताच ड्रायव्हरला पिकअप, ड्रॉप व नंबर WhatsApp वर मिळतील.")}
      </div>

      {view === "form" && <FleetVehicleForm ownerMobile={owner.mobile} lang={lang} onSaved={() => afterSave(mine.length + 1)} onCancel={mine.length > 0 ? () => setView(mode === "setup" ? "ask" : "list") : null} />}

      {view === "ask" && (
        <div className="p-4 space-y-3" data-fleet-ask-more>
          <div className="rounded-xl p-4 text-center" style={{ background: C.paper, border: `1.5px solid ${C.line}` }}>
            <div className="text-sm font-extrabold mb-1" style={{ color: C.ink }}>{T(lang, "Do you want to add another vehicle?", "क्या आप दूसरी गाड़ी जोड़ना चाहते हैं?", "तुम्हाला दुसरी गाडी जोडायची आहे का?")}</div>
            <div className="text-xs mb-3" style={{ color: C.inkSoft }}>{T(lang, `${mine.length} vehicle(s) added so far`, `अब तक ${mine.length} गाड़ी जोड़ी गई`, `आतापर्यंत ${mine.length} गाडी जोडली`)}</div>
            <div className="grid grid-cols-2 gap-2">
              <button data-fleet-add-yes onClick={() => setView("form")} className="rounded-lg py-3 text-sm font-extrabold text-white" style={{ background: C.navy }}>{T(lang, "Yes", "हाँ", "होय")}</button>
              <button data-fleet-add-no onClick={() => mine.length > 0 && onFinish && onFinish()} disabled={mine.length === 0} className="rounded-lg py-3 text-sm font-extrabold text-white" style={{ background: mine.length ? C.success : "#E5EAF2" }}>{T(lang, "No", "ना", "नाही")}</button>
            </div>
          </div>
        </div>
      )}

      {(view === "list" || view === "ask") && mine.length > 0 && (
        <div className="px-4 pb-4 space-y-2" data-fleet-list>
          {mine.map((x) => {
            const p = (privateById || {})[x.id] || {};
            const [label, color] = statusChip(x);
            return (
              <div key={x.id} className="rounded-xl p-3" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold truncate" style={{ color: C.ink }}>{p.vehicleNumber || x.vehicleName} · {vehicleCategoryText(x.capacityKg, lang) || `${x.capacityKg} kg`}</div>
                    <div className="text-xs truncate" style={{ color: C.inkSoft }}>{[x.categoryIndex == null ? x.vehicleName : "", p.driverName, p.driverMobile].filter(Boolean).join(" · ")}</div>
                  </div>
                  <span className="text-[10px] font-extrabold px-2 py-1 rounded-full shrink-0" style={{ background: "#fff", border: `1px solid ${color}`, color }}>{label}</span>
                </div>
                {mode === "manage" && (
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => patchDoc("fleetVehicles", x.id, { active: x.active === false }).catch((e) => console.error(e))} className="rounded-lg px-3 py-2 text-xs font-bold" style={{ background: C.bg, border: `1px solid ${C.line}`, color: C.ink }}>
                      {x.active === false ? T(lang, "Turn on", "चालू करें", "चालू करा") : T(lang, "Turn off", "बंद करें", "बंद करा")}
                    </button>
                    <button onClick={() => { if (window.confirm(T(lang, "Remove this vehicle?", "यह गाड़ी हटाएँ?", "ही गाडी काढायची?"))) { Promise.all([removeDoc("fleetVehicles", x.id), removeDoc("fleetVehiclePrivate", x.id)]).then(() => onCountChange && onCountChange(Math.max(0, mine.length - 1))).catch((e) => console.error(e)); } }}
                      className="rounded-lg px-3 py-2 text-xs font-bold" style={{ background: "#fff", border: `1px solid ${C.safety}`, color: C.safety }}>{T(lang, "Remove", "हटाएँ", "काढा")}</button>
                  </div>
                )}
              </div>
            );
          })}
          {mode === "manage" && view === "list" && (
            <button onClick={() => setView("form")} className="w-full rounded-lg py-3 text-sm font-extrabold text-white" style={{ background: C.navy }}>+ {T(lang, "Add a vehicle", "गाड़ी जोड़ें", "गाडी जोडा")}</button>
          )}
        </div>
      )}
    </div>
  );
}

// Accept -> pick the vehicle for this trip. `vehicles` = the owner's free, eligible vehicle pseudo-drivers (fleetPseudoDrivers filtered by the same rule that rang the owner).
export function FleetAssignSheet({ booking, vehicles, privateById, lang, onPick, onClose, busy }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ background: "rgba(15,27,45,0.55)" }} onClick={onClose} data-fleet-assign>
      <div className="w-full max-w-sm rounded-t-2xl overflow-hidden max-h-[85vh] flex flex-col" style={{ background: C.paper }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-center justify-between shrink-0" style={{ background: C.navy }}>
          <h3 className="text-sm font-bold text-white">{T(lang, "Which vehicle takes this trip?", "इस ट्रिप के लिए कौन-सी गाड़ी?", "या ट्रिपसाठी कोणती गाडी?")}</h3>
          <button onClick={onClose} className="text-base font-bold text-white">✕</button>
        </div>
        <div className="p-4 space-y-2 overflow-y-auto">
          <div className="text-xs font-semibold mb-1" style={{ color: C.inkSoft }}>{booking.pickup} → {booking.drop}</div>
          {vehicles.length === 0 && <div className="text-sm font-bold text-center py-4" style={{ color: C.safety }}>{T(lang, "None of your vehicles is free for this load.", "इस लोड के लिए आपकी कोई गाड़ी खाली नहीं है।", "या लोडसाठी तुमची कोणतीही गाडी रिकामी नाही.")}</div>}
          {vehicles.map((v) => {
            const p = (privateById || {})[v.fleetVehicleId] || {};
            return (
              <button key={v.fleetVehicleId} data-fleet-pick={v.fleetVehicleId} disabled={busy} onClick={() => onPick(v)} className="w-full text-left rounded-xl p-3" style={{ background: C.bg, border: `1.5px solid ${C.line}` }}>
                <div className="text-sm font-extrabold" style={{ color: C.ink }}>{p.vehicleNumber || v.vehicleSpec.type} · {vehicleCategoryText(v.vehicleSpec.capacityKg, lang) || `${v.vehicleSpec.capacityKg} kg`}</div>
                <div className="text-xs" style={{ color: C.inkSoft }}>{v.vehicleSpec.type}{p.driverName ? ` · ${T(lang, "Driver", "ड्राइवर", "ड्रायव्हर")}: ${p.driverName}` : ""}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// After the claim: the driver's message, ready to send. `link` + `autoSent` come from the server (dispatchFleetTrip).
export function FleetDispatchSheet({ booking, priv, owner, link, autoSent, working, lang, onClose }) {
  const text = buildFleetDispatchText({ booking, ownerName: owner?.name, ownerMobile: owner?.mobile, link });
  const wa = whatsappLink(priv?.driverMobile, text);
  const [copied, setCopied] = useState(false);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ background: "rgba(15,27,45,0.55)" }} data-fleet-dispatch>
      <div className="w-full max-w-sm rounded-t-2xl overflow-hidden max-h-[88vh] flex flex-col" style={{ background: C.paper }}>
        <div className="px-5 py-4 shrink-0" style={{ background: C.success }}>
          <h3 className="text-sm font-bold text-white">✓ {T(lang, "Booking accepted", "बुकिंग एक्सेप्ट हो गई", "बुकिंग स्वीकारली")} — {priv?.vehicleNumber || ""} {priv?.driverName ? `(${priv.driverName})` : ""}</h3>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          <div className="text-xs font-semibold" style={{ color: C.inkSoft }}>
            {autoSent
              ? T(lang, `The driver (${priv?.driverMobile}) was sent this message on WhatsApp automatically.`, `ड्राइवर (${priv?.driverMobile}) को यह मैसेज WhatsApp पर अपने आप भेज दिया गया।`, `ड्रायव्हरला (${priv?.driverMobile}) हा मेसेज WhatsApp वर आपोआप पाठवला.`)
              : T(lang, "Send this to the driver now:", "यह मैसेज अभी ड्राइवर को भेजें:", "हा मेसेज आता ड्रायव्हरला पाठवा:")}
          </div>
          <pre className="rounded-lg p-3 text-[12px] whitespace-pre-wrap break-words" style={{ background: C.bg, border: `1px solid ${C.line}`, color: C.ink, fontFamily: "inherit" }}>{working ? "…" : text}</pre>
          <div className="flex gap-2">
            <a data-fleet-whatsapp href={working ? undefined : wa} target="_blank" rel="noopener noreferrer" className="flex-1 text-center rounded-lg py-3 text-sm font-extrabold text-white" style={{ background: working || !wa ? "#9AA3B0" : "#25D366", pointerEvents: working || !wa ? "none" : "auto" }}>
              {T(lang, "Send on WhatsApp", "WhatsApp पर भेजें", "WhatsApp वर पाठवा")}
            </a>
            <button onClick={() => { try { navigator.clipboard.writeText(text); setCopied(true); } catch (_) { /* clipboard unavailable */ } }} className="rounded-lg px-4 py-3 text-sm font-bold" style={{ background: C.bg, border: `1px solid ${C.line}`, color: C.ink }}>
              {copied ? "✓" : T(lang, "Copy", "कॉपी", "कॉपी")}
            </button>
          </div>
          {!link && !working && <div className="text-[11px] font-semibold" style={{ color: C.marigoldDeep }}>{T(lang, "Trip link could not be made — the driver can still call the customer and you can tap Start / End in your app.", "ट्रिप लिंक नहीं बन पाया — ड्राइवर कस्टमर को कॉल कर सकता है और आप अपने ऐप में Start / End दबा सकते हैं।", "ट्रिप लिंक तयार झाली नाही — ड्रायव्हर ग्राहकाला कॉल करू शकतो आणि तुम्ही अ‍ॅपमध्ये Start / End दाबू शकता.")}</div>}
          <button onClick={onClose} className="w-full rounded-lg py-3 text-sm font-extrabold text-white" style={{ background: C.navy }}>{T(lang, "Done", "ठीक है", "ठीक आहे")}</button>
        </div>
      </div>
    </div>
  );
}

// Admin: TRANSPORTERS (owner 2026-11-11: "create the owner section and in sub category of that owner section the vehicle details and driver details, include the drivers' phone numbers").
// One card per owner (name, mobile, call, vehicle count, pending badge); tapping it opens that owner's vehicles -- vehicle details (number, category, status) and driver details
// (name, linked phone number, call) with the documents and Approve / Reject (the owner can only ever write kyc "Pending"). One owner open at a time.
export function AdminFleetVehicles({ fleetVehicles, fleetPrivate, drivers, lang, setKyc }) {
  const [openOwner, setOpenOwner] = useState(null);
  const privById = Object.fromEntries((fleetPrivate || []).map((p) => [p.id, p]));
  const ownerName = (m) => (drivers || []).find((d) => d.mobile === m)?.name || m;
  const byOwner = {};
  (fleetVehicles || []).forEach((v) => { (byOwner[v.ownerMobile] = byOwner[v.ownerMobile] || []).push(v); });
  const owners = Object.entries(byOwner).map(([mobile, vs]) => ({
    mobile, name: ownerName(mobile), pending: vs.filter((v) => v.kyc === "Pending").length,
    vehicles: [...vs].sort((a, b) => (a.kyc === "Pending" ? -1 : 1) - (b.kyc === "Pending" ? -1 : 1)),
  })).sort((a, b) => (b.pending > 0) - (a.pending > 0) || String(a.name).localeCompare(String(b.name)));
  return (
    <div className="p-4 space-y-2" data-admin-fleet>
      <div className="text-sm font-extrabold" style={{ color: C.ink }}>{T(lang, `All Transporters (${owners.length})`, `सभी ट्रांसपोर्टर (${owners.length})`, `सर्व ट्रान्सपोर्टर (${owners.length})`)}</div>
      {owners.length === 0 && <div className="text-xs" style={{ color: C.inkSoft }}>{T(lang, "No transporter vehicles yet.", "अभी कोई ट्रांसपोर्टर गाड़ी नहीं।", "अजून कोणतीही ट्रान्सपोर्टर गाडी नाही.")}</div>}
      {owners.map((o) => {
        const open = openOwner === o.mobile;
        return (
          <div key={o.mobile} data-fleet-owner-card className="rounded-xl" style={{ background: C.paper, border: `2px solid ${C.line}` }}>
            <div className="flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-extrabold truncate" style={{ color: C.ink }}>{o.name}</div>
                <div className="text-xs font-semibold" style={{ color: C.inkSoft }}>{o.mobile} · {T(lang, `${o.vehicles.length} vehicle(s)`, `${o.vehicles.length} गाड़ी`, `${o.vehicles.length} गाडी`)}{o.pending > 0 && <span className="font-bold" style={{ color: C.marigoldDeep }}> · {T(lang, `${o.pending} pending`, `${o.pending} लंबित`, `${o.pending} प्रलंबित`)}</span>}</div>
              </div>
              <a href={`tel:+91${o.mobile}`} aria-label="Call" className="shrink-0 p-2 rounded-full" style={{ background: C.navy }}><Phone size={14} color="#FFFFFF" /></a>
              <button type="button" data-fleet-owner-toggle aria-expanded={open} aria-label={T(lang, "Show vehicles", "गाड़ियाँ दिखाएँ", "गाड्या दाखवा")} onClick={() => setOpenOwner(open ? null : o.mobile)} className="shrink-0 p-2 rounded-full" style={{ background: C.bg, border: `1px solid ${C.line}` }}>
                <ChevronDown size={16} color={C.ink} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
              </button>
            </div>
            {open && (
              <div data-fleet-owner-vehicles className="px-3 pb-3 space-y-2">
                {o.vehicles.map((x) => {
                  const p = privById[x.id] || {};
                  return (
                    <div key={x.id} data-fleet-vehicle className="rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.line}` }}>
                      <div className="text-[10px] font-extrabold uppercase" style={{ color: C.inkSoft }}>{T(lang, "Vehicle details", "गाड़ी की जानकारी", "गाडीची माहिती")}</div>
                      <div className="text-sm font-extrabold" style={{ color: C.ink }}>{p.vehicleNumber || x.vehicleName} · {vehicleCategoryText(x.capacityKg, lang) || `${x.capacityKg} kg`} · <span style={{ color: x.kyc === "Approved" ? C.success : x.kyc === "Rejected" ? C.safety : C.marigoldDeep }}>{x.kyc}</span></div>
                      <div className="text-[10px] font-extrabold uppercase mt-2" style={{ color: C.inkSoft }}>{T(lang, "Driver details", "ड्राइवर की जानकारी", "ड्रायव्हरची माहिती")}</div>
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold truncate" style={{ color: C.ink }}>{p.driverName || "-"}</div>
                          <div data-fleet-driver-phone className="text-xs font-semibold" style={{ color: C.inkSoft }}>{p.driverMobile || "-"}</div>
                        </div>
                        {p.driverMobile && <a href={`tel:+91${p.driverMobile}`} aria-label="Call driver" className="shrink-0 p-2 rounded-full" style={{ background: C.navy }}><Phone size={14} color="#FFFFFF" /></a>}
                      </div>
                      <div className="flex gap-2 mt-2 items-center">
                        {[p.driverPhotoUrl, p.dlPhotoUrl, p.vehicleSideUrl].filter(Boolean).map((u, i) => <a key={i} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.line}` }} /></a>)}
                        <div className="flex-1" />
                        <button onClick={() => setKyc(x.id, "Approved")} disabled={x.kyc === "Approved"} className="rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: x.kyc === "Approved" ? "#9AA3B0" : C.success }}>{T(lang, "Approve", "स्वीकृत", "मंजूर")}</button>
                        <button onClick={() => setKyc(x.id, "Rejected")} disabled={x.kyc === "Rejected"} className="rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: x.kyc === "Rejected" ? "#9AA3B0" : C.safety }}>{T(lang, "Reject", "अस्वीकृत", "नाकार")}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
