// "Which vehicle do you drive?" -- (owner 2026-11-13: NO company dropdown any more -- ONE list of "Company Model" rows, each with its weight, and a search box; the same picker everywhere.) -- (the company's models show as a list with their weights below the company box, not a second dropdown) -- the ONE picker used by the Driver KYC form and by Admin's driver edit forms (owner 2026-11-10). Company -> Model, from the sheet
// (src/vehicleModels.js); the weight is filled in from the sheet and shown read-only, there is NO weight box. (owner 2026-11-10: the "My model is not listed" option was removed -- a vehicle must be picked from the list.) It imports nothing from App.jsx (App and AdminPanel pass the colours, styles and category options in), so there is no import cycle.
import React from "react";
import { VEHICLE_MODEL_CATALOG, VEHICLE_CHOICE_SAVED, VEHICLE_CHOICE_OTHER, vehicleModelChoice, isSaneCapacityKg, looksLikeVehicleName, vehicleNameWithoutCompany } from "./vehicleModels.js";

const T = (lang, en, hi, mr) => (lang === "en" ? en : lang === "mr" ? (mr || hi) : hi);

// Every model of every company as ONE flat list; `label` is "<Company> <Model>" -- exactly the vehicle name that is saved (resolveVehicleChoice), so what is picked is what every screen shows afterwards.
const FLAT_MODELS = VEHICLE_MODEL_CATALOG.flatMap((c, ci) => c.models.map((m, mi) => ({ ci, mi, choice: vehicleModelChoice(ci, mi), label: m.name, kg: m.kg })));

export default function VehicleModelPicker({
  lang, choice, setChoice, categoryIndex, setCategoryIndex, categoryOptions, saved, resolved,
  inputCls, inputStyle, labelColor, requiredColor, okColor,
}) {
  const savedNameJunk = !!(saved && String(saved.name || "").trim() && !looksLikeVehicleName(saved.name)); // 2026-11-13: free text typed before 10 Nov is never offered back
  const hasSaved = !!(saved && String(saved.name || "").trim() && !savedNameJunk && isSaneCapacityKg(saved.kg));
  const lbl = "text-xs font-semibold mb-1 block";
  const req = <span style={{ color: requiredColor }}> *</span>;
  const rows = FLAT_MODELS;
  return (
    <div data-vehicle-picker>
      <label className={lbl} style={{ color: labelColor }}>{T(lang, "Vehicle (company and model)", "गाड़ी (कंपनी और मॉडल)", "गाडी (कंपनी आणि मॉडेल)")}{req}</label>
            {savedNameJunk && (
        <div data-vehicle-junk-note className="rounded-lg px-3 py-2 mb-2 text-xs font-semibold break-words" style={{ background: "#FDECEA", color: requiredColor, border: "1px solid #F5B7B1" }}>
          {T(lang, "The saved vehicle name is not a valid vehicle. Please pick your vehicle from the list below.", "सेव की हुई गाड़ी का नाम सही गाड़ी नहीं है। कृपया नीचे की सूची से अपनी गाड़ी चुनें।", "सेव्ह केलेले गाडीचे नाव योग्य गाडी नाही. कृपया खालील यादीतून तुमची गाडी निवडा.")}
        </div>
      )}
      {/* ONE "Select vehicle" dropdown (owner 2026-11-15): every vehicle is an option, only the picked one shows while it is closed. A native select = the phone's own picker, identical in every form. */}
      <select data-vehicle-select value={choice || ""} onChange={(e) => setChoice(e.target.value)} className={`${inputCls} mb-2.5`} style={inputStyle}>
        <option value="">{T(lang, "Select vehicle", "गाड़ी चुनें", "गाडी निवडा")}</option>
        {hasSaved && (
          <option value={VEHICLE_CHOICE_SAVED} data-vehicle-keep>{T(lang, "Keep my current vehicle", "मेरी मौजूदा गाड़ी रखें", "माझी सध्याची गाडी ठेवा")}: {vehicleNameWithoutCompany(saved.name)} · {saved.kg} {T(lang, "kg", "किग्रा", "किग्रॅ")}</option>
        )}
        {rows.map((r) => (
          <option key={r.choice} value={r.choice} data-vehicle-model={r.label} data-vehicle-model-kg={r.kg}>{r.label} · {r.kg} {T(lang, "kg", "किग्रा", "किग्रॅ")}</option>
        ))}
        {/* "Other" is the LAST option (owner 2026-11-25): for a vehicle that is not in the list. No name is ever typed -- the driver picks a weight category instead. */}
        <option value={VEHICLE_CHOICE_OTHER} data-vehicle-other>{T(lang, "Other", "अन्य", "इतर")}</option>
      </select>
      {choice === VEHICLE_CHOICE_OTHER && (
        <div data-vehicle-other-box className="mb-2.5">
          <label className={lbl} style={{ color: labelColor }}>{T(lang, "My vehicle's weight category", "मेरी गाड़ी की वज़न श्रेणी", "माझ्या गाडीची वजन श्रेणी")}{req}</label>
          <select data-vehicle-other-category value={categoryIndex == null ? "" : String(categoryIndex)} onChange={(e) => setCategoryIndex(e.target.value === "" ? null : Number(e.target.value))} className={inputCls} style={inputStyle}>
            <option value="">{T(lang, "Select weight category", "वज़न श्रेणी चुनें", "वजन श्रेणी निवडा")}</option>
            {(categoryOptions || []).map((o) => (<option key={o.index} value={o.index}>{o.label}</option>))}
          </select>
        </div>
      )}

      {resolved && (
        <>
          <p data-vehicle-selected-name className="text-xs font-extrabold mb-0.5" style={{ color: okColor }}>{vehicleNameWithoutCompany(resolved.name)}</p>
          <p data-vehicle-weight className="text-[11px] font-semibold mb-2" style={{ color: okColor }}>
            {T(lang, `Vehicle weight: ${resolved.kg} kg (set automatically)`, `गाड़ी का वज़न: ${resolved.kg} किग्रा (अपने आप भरा गया)`, `गाडीचे वजन: ${resolved.kg} किग्रॅ (आपोआप भरले)`)}
          </p>
        </>
      )}
    </div>
  );
}
