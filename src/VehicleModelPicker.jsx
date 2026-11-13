// "Which vehicle do you drive?" -- (owner 2026-11-13: NO company dropdown any more -- ONE list of "Company Model" rows, each with its weight, and a search box; the same picker everywhere.) -- (the company's models show as a list with their weights below the company box, not a second dropdown) -- the ONE picker used by the Driver KYC form and by Admin's driver edit forms (owner 2026-11-10). Company -> Model, from the sheet
// (src/vehicleModels.js); the weight is filled in from the sheet and shown read-only, there is NO weight box. (owner 2026-11-10: the "My model is not listed" option was removed -- a vehicle must be picked from the list.) It imports nothing from App.jsx (App and AdminPanel pass the colours, styles and category options in), so there is no import cycle.
import React, { useMemo, useState } from "react";
import { VEHICLE_MODEL_CATALOG, VEHICLE_CHOICE_SAVED, vehicleModelChoice, isSaneCapacityKg, looksLikeVehicleName } from "./vehicleModels.js";

const T = (lang, en, hi, mr) => (lang === "en" ? en : lang === "mr" ? (mr || hi) : hi);

// Every model of every company as ONE flat list; `label` is "<Company> <Model>" -- exactly the vehicle name that is saved (resolveVehicleChoice), so what is picked is what every screen shows afterwards.
const FLAT_MODELS = VEHICLE_MODEL_CATALOG.flatMap((c, ci) => c.models.map((m, mi) => ({ ci, mi, choice: vehicleModelChoice(ci, mi), label: `${c.company} ${m.name}`, kg: m.kg })));

export default function VehicleModelPicker({
  lang, choice, setChoice, categoryIndex, setCategoryIndex, categoryOptions, saved, resolved,
  inputCls, inputStyle, labelColor, requiredColor, okColor,
}) {
  const [query, setQuery] = useState("");
  const savedNameJunk = !!(saved && String(saved.name || "").trim() && !looksLikeVehicleName(saved.name)); // 2026-11-13: free text typed before 10 Nov is never offered back
  const hasSaved = !!(saved && String(saved.name || "").trim() && !savedNameJunk && isSaneCapacityKg(saved.kg));
  const lbl = "text-xs font-semibold mb-1 block";
  const req = <span style={{ color: requiredColor }}> *</span>;
  const border = inputStyle.border || "1px solid #D5DCE8";
  const q = query.trim().toLowerCase();
  const rows = useMemo(() => (q ? FLAT_MODELS.filter((r) => `${r.label} ${r.kg}`.toLowerCase().includes(q)) : FLAT_MODELS), [q]);
  const radio = (on) => (
    <span aria-hidden className="shrink-0 inline-flex items-center justify-center rounded-full" style={{ width: 16, height: 16, border: `2px solid ${on ? okColor : "#94A3B8"}` }}>{on && <span className="rounded-full" style={{ width: 8, height: 8, background: okColor }} />}</span>
  );
  return (
    <div data-vehicle-picker>
      <label className={lbl} style={{ color: labelColor }}>{T(lang, "Vehicle (company and model)", "गाड़ी (कंपनी और मॉडल)", "गाडी (कंपनी आणि मॉडेल)")}{req}</label>
      <input data-vehicle-search value={query} onChange={(e) => setQuery(e.target.value)} className={inputCls} style={{ ...inputStyle, marginBottom: 8 }}
        placeholder={T(lang, "Search: Tata, Ace, Eicher, 1700 ...", "खोजें: Tata, Ace, Eicher, 1700 ...", "शोधा: Tata, Ace, Eicher, 1700 ...")} />
      {/* ONE list: every "Company Model" with the weight it carries -- tap one (no company step). */}
      {savedNameJunk && (
        <div data-vehicle-junk-note className="rounded-lg px-3 py-2 mb-2 text-xs font-semibold break-words" style={{ background: "#FDECEA", color: requiredColor, border: "1px solid #F5B7B1" }}>
          {T(lang, "The saved vehicle name is not a valid vehicle. Please pick your vehicle from the list below.", "सेव की हुई गाड़ी का नाम सही गाड़ी नहीं है। कृपया नीचे की सूची से अपनी गाड़ी चुनें।", "सेव्ह केलेले गाडीचे नाव योग्य गाडी नाही. कृपया खालील यादीतून तुमची गाडी निवडा.")}
        </div>
      )}
      <div data-vehicle-model-list role="radiogroup" className="rounded-lg overflow-y-auto mb-2.5" style={{ border, maxHeight: 300 }}>
        {hasSaved && (
          <button type="button" role="radio" aria-checked={choice === VEHICLE_CHOICE_SAVED} data-vehicle-keep onClick={() => setChoice(VEHICLE_CHOICE_SAVED)}
            className="w-full flex items-center justify-between gap-2 text-left px-3 py-2.5 text-sm"
            style={{ background: choice === VEHICLE_CHOICE_SAVED ? "#E8F7EE" : "transparent", color: inputStyle.color, fontWeight: choice === VEHICLE_CHOICE_SAVED ? 700 : 500 }}>
            <span className="flex items-center gap-2 min-w-0">{radio(choice === VEHICLE_CHOICE_SAVED)}<span className="break-words">{T(lang, "Keep my current vehicle", "मेरी मौजूदा गाड़ी रखें", "माझी सध्याची गाडी ठेवा")}: {saved.name}</span></span>
            <span className="shrink-0 text-xs font-extrabold rounded-md px-2 py-0.5" style={{ background: choice === VEHICLE_CHOICE_SAVED ? okColor : "#E5EAF2", color: choice === VEHICLE_CHOICE_SAVED ? "#fff" : "#475569" }}>{saved.kg} {T(lang, "kg", "किग्रा", "किग्रॅ")}</span>
          </button>
        )}
        {rows.map((r, n) => {
          const on = choice === r.choice;
          return (
            <button type="button" key={r.choice} role="radio" aria-checked={on} data-vehicle-model={r.label} data-vehicle-model-kg={r.kg} onClick={() => setChoice(r.choice)}
              className="w-full flex items-center justify-between gap-2 text-left px-3 py-2.5 text-sm"
              style={{ background: on ? "#E8F7EE" : "transparent", color: inputStyle.color, borderTop: n || hasSaved ? border : "none", fontWeight: on ? 700 : 500 }}>
              <span className="flex items-center gap-2 min-w-0">{radio(on)}<span className="break-words">{r.label}</span></span>
              <span className="shrink-0 text-xs font-extrabold rounded-md px-2 py-0.5" style={{ background: on ? okColor : "#E5EAF2", color: on ? "#fff" : "#475569" }}>{r.kg} {T(lang, "kg", "किग्रा", "किग्रॅ")}</span>
            </button>
          );
        })}
        {rows.length === 0 && <div data-vehicle-no-match className="px-3 py-3 text-xs" style={{ color: "#64748B" }}>{T(lang, "No vehicle matches. Try another word.", "कोई गाड़ी नहीं मिली। दूसरा शब्द लिखें।", "कोणतीही गाडी सापडली नाही. दुसरा शब्द लिहा.")}</div>}
      </div>

      {resolved && (
        <>
          <p data-vehicle-selected-name className="text-xs font-extrabold mb-0.5" style={{ color: okColor }}>{resolved.name}</p>
          <p data-vehicle-weight className="text-[11px] font-semibold mb-2" style={{ color: okColor }}>
            {T(lang, `Vehicle weight: ${resolved.kg} kg (set automatically)`, `गाड़ी का वज़न: ${resolved.kg} किग्रा (अपने आप भरा गया)`, `गाडीचे वजन: ${resolved.kg} किग्रॅ (आपोआप भरले)`)}
          </p>
        </>
      )}
    </div>
  );
}
