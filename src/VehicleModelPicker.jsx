// "Which vehicle do you drive?" -- ONE flat list of models, each with the weight it carries (owner 2026-11-13: drivers could not follow Company -> Model, so the COMPANY step is gone;
// no company name is shown anywhere in the picker, only the model and its capacity, lightest first). It is the ONE picker used by the Driver KYC form, Admin's driver edit forms and the
// fleet Add-vehicle form. The list comes from src/vehicleModels.js; the weight is filled in from it and shown read-only, there is NO weight box. The choice value stays "m:<company>:<model>"
// and the company is still STORED (vehicleSpec.vehicleCompany) -- it is just not shown. (owner 2026-11-10: no "My model is not listed" option -- a vehicle must be picked from the list.)
// It imports nothing from App.jsx (App and AdminPanel pass the colours, styles and category options in), so there is no import cycle.
import React from "react";
import { VEHICLE_MODEL_CATALOG, VEHICLE_CHOICE_SAVED, vehicleModelChoice, isSaneCapacityKg } from "./vehicleModels.js";

const T = (lang, en, hi, mr) => (lang === "en" ? en : lang === "mr" ? (mr || hi) : hi);

// Every catalogue model in ONE list, lightest first (same weight: the sheet's order is kept).
const FLAT_MODELS = VEHICLE_MODEL_CATALOG
  .flatMap((c, ci) => c.models.map((m, mi) => ({ ...m, choice: vehicleModelChoice(ci, mi) })))
  .map((m, i) => ({ ...m, order: i }))
  .sort((x, y) => x.kg - y.kg || x.order - y.order);

export default function VehicleModelPicker({
  lang, choice, setChoice, categoryIndex, setCategoryIndex, categoryOptions, saved, resolved,
  inputCls, inputStyle, labelColor, requiredColor, okColor,
}) {
  const hasSaved = !!(saved && String(saved.name || "").trim() && isSaneCapacityKg(saved.kg));
  const lbl = "text-xs font-semibold mb-1 block";
  const req = <span style={{ color: requiredColor }}> *</span>;
  const border = inputStyle.border || "1px solid #D5DCE8";
  const row = (key, on, onPick, name, kg, extra) => (
    <button type="button" key={key} role="radio" aria-checked={on} {...extra} onClick={onPick}
      className="w-full flex items-center justify-between gap-2 text-left px-3 py-2.5 text-sm"
      style={{ background: on ? "#E8F7EE" : "transparent", color: inputStyle.color, fontWeight: on ? 700 : 500 }}>
      <span className="flex items-center gap-2 min-w-0">
        <span aria-hidden className="shrink-0 inline-flex items-center justify-center rounded-full" style={{ width: 16, height: 16, border: `2px solid ${on ? okColor : "#94A3B8"}` }}>{on && <span className="rounded-full" style={{ width: 8, height: 8, background: okColor }} />}</span>
        <span className="break-words">{name}</span>
      </span>
      <span className="shrink-0 text-xs font-extrabold rounded-md px-2 py-0.5" style={{ background: on ? okColor : "#E5EAF2", color: on ? "#fff" : "#475569" }}>{kg} {T(lang, "kg", "किग्रा", "किग्रॅ")}</span>
    </button>
  );
  return (
    <div data-vehicle-picker>
      <label className={lbl} style={{ color: labelColor }}>{T(lang, "Select your vehicle", "अपनी गाड़ी चुनें", "तुमची गाडी निवडा")}{req}</label>
      <div data-vehicle-model-list role="radiogroup" className="rounded-lg overflow-hidden mb-2.5" style={{ border }}>
        {hasSaved && row("saved", choice === VEHICLE_CHOICE_SAVED, () => setChoice(VEHICLE_CHOICE_SAVED),
          `${T(lang, "Keep my current vehicle", "मेरी मौजूदा गाड़ी रखें", "माझी सध्याची गाडी ठेवा")}: ${saved.name}`, saved.kg, { "data-vehicle-saved": "1" })}
        {FLAT_MODELS.map((m, i) => (
          <div key={m.choice} style={{ borderTop: (i || hasSaved) ? border : "none" }}>
            {row(m.choice, choice === m.choice, () => setChoice(m.choice), m.name, m.kg, { "data-vehicle-model": m.name, "data-vehicle-model-kg": m.kg })}
          </div>
        ))}
      </div>

      {resolved && (
        <p data-vehicle-weight className="text-[11px] font-semibold mb-2" style={{ color: okColor }}>
          {T(lang, `Vehicle weight: ${resolved.kg} kg (set automatically)`, `गाड़ी का वज़न: ${resolved.kg} किग्रा (अपने आप भरा गया)`, `गाडीचे वजन: ${resolved.kg} किग्रॅ (आपोआप भरले)`)}
        </p>
      )}
    </div>
  );
}
