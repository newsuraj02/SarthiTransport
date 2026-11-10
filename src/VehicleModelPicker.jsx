// "Which vehicle do you drive?" -- (the company's models show as a list with their weights below the company box, not a second dropdown) -- the ONE picker used by the Driver KYC form and by Admin's driver edit forms (owner 2026-11-10). Company -> Model, from the sheet
// (src/vehicleModels.js); the weight is filled in from the sheet and shown read-only, there is NO weight box. (owner 2026-11-10: the "My model is not listed" option was removed -- a vehicle must be picked from the list.) It imports nothing from App.jsx (App and AdminPanel pass the colours, styles and category options in), so there is no import cycle.
import React, { useState } from "react";
import { VEHICLE_MODEL_CATALOG, VEHICLE_CHOICE_SAVED, vehicleModelChoice, parseVehicleModelChoice, isSaneCapacityKg } from "./vehicleModels.js";

const T = (lang, en, hi, mr) => (lang === "en" ? en : lang === "mr" ? (mr || hi) : hi);

export default function VehicleModelPicker({
  lang, choice, setChoice, categoryIndex, setCategoryIndex, categoryOptions, saved, resolved,
  inputCls, inputStyle, labelColor, requiredColor, okColor,
}) {
  const parsed = parseVehicleModelChoice(choice);
  const [companyIdx, setCompanyIdx] = useState(parsed ? parsed.ci : "");
  const hasSaved = !!(saved && String(saved.name || "").trim() && isSaneCapacityKg(saved.kg));
  const companyValue = choice === VEHICLE_CHOICE_SAVED ? "saved" : (companyIdx !== "" ? `c:${companyIdx}` : "");
  const onCompany = (e) => {
    const v = e.target.value;
    if (v === "saved") { setChoice(VEHICLE_CHOICE_SAVED); return; }
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
      </select>

      {company && choice !== VEHICLE_CHOICE_SAVED && (
        <>
          <label className={lbl} style={{ color: labelColor }}>{T(lang, "Vehicle model", "गाड़ी का मॉडल", "गाडीचे मॉडेल")}{req}</label>
          {/* Owner 2026-11-10: pick the company, and ITS models show right below as a list with the weight each carries -- no second dropdown. */}
          <div data-vehicle-model-list role="radiogroup" className="rounded-lg overflow-hidden mb-2.5" style={{ border: inputStyle.border || "1px solid #D5DCE8" }}>
            {company.models.map((m, mi) => {
              const val = vehicleModelChoice(companyIdx, mi); const on = choice === val;
              return (
                <button type="button" key={m.name} role="radio" aria-checked={on} data-vehicle-model={m.name} data-vehicle-model-kg={m.kg} onClick={() => setChoice(val)}
                  className="w-full flex items-center justify-between gap-2 text-left px-3 py-2.5 text-sm"
                  style={{ background: on ? "#E8F7EE" : "transparent", color: inputStyle.color, borderTop: mi ? (inputStyle.border || "1px solid #D5DCE8") : "none", fontWeight: on ? 700 : 500 }}>
                  <span className="flex items-center gap-2 min-w-0">
                    <span aria-hidden className="shrink-0 inline-flex items-center justify-center rounded-full" style={{ width: 16, height: 16, border: `2px solid ${on ? okColor : "#94A3B8"}` }}>{on && <span className="rounded-full" style={{ width: 8, height: 8, background: okColor }} />}</span>
                    <span className="break-words">{m.name}</span>
                  </span>
                  <span className="shrink-0 text-xs font-extrabold rounded-md px-2 py-0.5" style={{ background: on ? okColor : "#E5EAF2", color: on ? "#fff" : "#475569" }}>{m.kg} {T(lang, "kg", "किग्रा", "किग्रॅ")}</span>
                </button>
              );
            })}
          </div>
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
