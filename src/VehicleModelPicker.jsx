// "Which vehicle do you drive?" -- the ONE picker used by the Driver KYC form and by Admin's driver edit forms (owner 2026-11-10). Company -> Model, from the sheet
// (src/vehicleModels.js); the weight is filled in from the sheet and shown read-only, there is NO weight box. "My model is not listed" shows the customer-list weight
// categories instead. It imports nothing from App.jsx (App and AdminPanel pass the colours, styles and category options in), so there is no import cycle.
import React, { useState } from "react";
import { VEHICLE_MODEL_CATALOG, VEHICLE_CHOICE_SAVED, VEHICLE_CHOICE_OTHER, vehicleModelChoice, parseVehicleModelChoice, isSaneCapacityKg } from "./vehicleModels.js";

const T = (lang, en, hi, mr) => (lang === "en" ? en : lang === "mr" ? (mr || hi) : hi);

export default function VehicleModelPicker({
  lang, choice, setChoice, categoryIndex, setCategoryIndex, categoryOptions, saved, resolved,
  inputCls, inputStyle, labelColor, requiredColor, okColor,
}) {
  const parsed = parseVehicleModelChoice(choice);
  const [companyIdx, setCompanyIdx] = useState(parsed ? parsed.ci : "");
  const hasSaved = !!(saved && String(saved.name || "").trim() && isSaneCapacityKg(saved.kg));
  const companyValue = choice === VEHICLE_CHOICE_SAVED ? "saved" : choice === VEHICLE_CHOICE_OTHER ? "other" : (companyIdx !== "" ? `c:${companyIdx}` : "");
  const onCompany = (e) => {
    const v = e.target.value;
    if (v === "saved") { setChoice(VEHICLE_CHOICE_SAVED); return; }
    if (v === "other") { setChoice(VEHICLE_CHOICE_OTHER); return; }
    if (v.startsWith("c:")) { setCompanyIdx(Number(v.slice(2))); setChoice(""); return; }
    setCompanyIdx(""); setChoice("");
  };
  const lbl = "text-xs font-semibold mb-1 block";
  const req = <span style={{ color: requiredColor }}> *</span>;
  const company = companyIdx !== "" ? VEHICLE_MODEL_CATALOG[companyIdx] : null;
  return (
    <div data-vehicle-picker>
      <label className={lbl} style={{ color: labelColor }}>{T(lang, "Vehicle company", "गाड़ी की कंपनी", "गाडीची कंपनी")}{req}</label>
      <select data-vehicle-company className={inputCls} style={{ ...inputStyle, marginBottom: 10 }} value={companyValue} onChange={onCompany}>
        <option value="">{T(lang, "Select company", "कंपनी चुनें", "कंपनी निवडा")}</option>
        {hasSaved && <option value="saved">{T(lang, "Keep my current vehicle", "मेरी मौजूदा गाड़ी रखें", "माझी सध्याची गाडी ठेवा")}: {saved.name}</option>}
        {VEHICLE_MODEL_CATALOG.map((c, i) => <option key={c.company} value={`c:${i}`}>{c.company}</option>)}
        <option value="other">{T(lang, "My model is not listed", "मेरा मॉडल लिस्ट में नहीं है", "माझे मॉडेल यादीत नाही")}</option>
      </select>

      {company && choice !== VEHICLE_CHOICE_SAVED && choice !== VEHICLE_CHOICE_OTHER && (
        <>
          <label className={lbl} style={{ color: labelColor }}>{T(lang, "Vehicle model", "गाड़ी का मॉडल", "गाडीचे मॉडेल")}{req}</label>
          <select data-vehicle-model className={inputCls} style={{ ...inputStyle, marginBottom: 10 }} value={parsed && parsed.ci === companyIdx ? choice : ""} onChange={(e) => setChoice(e.target.value)}>
            <option value="">{T(lang, "Select model", "मॉडल चुनें", "मॉडेल निवडा")}</option>
            {company.models.map((m, mi) => <option key={m.name} value={vehicleModelChoice(companyIdx, mi)}>{m.name}</option>)}
          </select>
        </>
      )}

      {choice === VEHICLE_CHOICE_OTHER && (
        <>
          <label className={lbl} style={{ color: labelColor }}>{T(lang, "Vehicle weight category", "गाड़ी का वज़न वर्ग", "गाडीचा वजन वर्ग")}{req}</label>
          <select data-vehicle-category className={inputCls} style={{ ...inputStyle, marginBottom: 10 }} value={categoryIndex == null ? "" : String(categoryIndex)} onChange={(e) => setCategoryIndex(e.target.value === "" ? null : Number(e.target.value))}>
            <option value="">{T(lang, "Select weight category", "वज़न वर्ग चुनें", "वजन वर्ग निवडा")}</option>
            {categoryOptions.map((o) => <option key={o.index} value={o.index}>{o.label}</option>)}
          </select>
        </>
      )}

      {resolved && (
        <p data-vehicle-weight className="text-[11px] font-semibold mb-2" style={{ color: okColor }}>
          {T(lang, `Vehicle weight: ${resolved.kg} kg (set automatically)`, `गाड़ी का वज़न: ${resolved.kg} किग्रा (अपने आप भरा गया)`, `गाडीचे वजन: ${resolved.kg} किग्रॅ (आपोआप भरले)`)}
        </p>
      )}
    </div>
  );
}
