// VEHICLE MODEL CATALOGUE (owner 2026-11-10, from "Apna_Transport_Vehicle_Weights.xlsx"): the driver's KYC picks a COMPANY and a MODEL from this list and the
// vehicle's weight (payload, in kg) is filled in from here -- the driver never types a weight. 37 models, one fixed payload each. A model that is not in the list
// is entered as "My model is not listed" + a weight category (see resolveVehicleChoice); the weight is then the category's limit, never free text.
// Weights are PAYLOAD (not gross vehicle weight). Several are the sheet's own estimates (12/16-wheelers); change them HERE only.
// Pure data + a pure resolver: no React, no imports, so the invariants can load and run it.

export const VEHICLE_MODEL_CATALOG = [
  { company: "Tata Motors", models: [
    { name: "Ace Gold", kg: 700 }, { name: "Ace HT+", kg: 1000 }, { name: "Intra V10", kg: 1000 }, { name: "Intra V20 Gold", kg: 1200 },
    { name: "Intra V30", kg: 1700 }, { name: "Intra V50 Gold", kg: 1700 }, { name: "Intra V70 Gold", kg: 2000 }, { name: "407 Gold SFC", kg: 2500 },
    { name: "709g LPT", kg: 4000 }, { name: "Signa 2818.T (10-wheeler)", kg: 20000 }, { name: "Signa 3518.T (12-wheeler)", kg: 25000 },
    { name: "Signa 3521.T (12-wheeler)", kg: 25000 }, { name: "Signa 4225.T (14-wheeler)", kg: 32000 }, { name: "Signa 4825.T (16-wheeler)", kg: 35000 },
  ] },
  { company: "Mahindra", models: [
    { name: "Alfa Plus (3-wheeler)", kg: 500 }, { name: "Jeeto", kg: 700 }, { name: "Bolero Maxi Truck", kg: 1000 }, { name: "Bolero Maxi Truck Plus", kg: 1200 },
    { name: "Bolero Pik-Up", kg: 1700 }, { name: "Bolero Maxx Pik-Up HD", kg: 2000 }, { name: "Blazo X 35 (12-wheeler)", kg: 25000 }, { name: "Blazo X 48 (16-wheeler)", kg: 35000 },
  ] },
  { company: "Ashok Leyland", models: [
    { name: "Dost+", kg: 1700 }, { name: "Bada Dost i3", kg: 1700 }, { name: "Bada Dost i4", kg: 2000 }, { name: "AVTR 2820 (10-wheeler)", kg: 20000 },
    { name: "3520 (12-wheeler)", kg: 25000 }, { name: "4825 (16-wheeler)", kg: 35000 },
  ] },
  { company: "Maruti Suzuki", models: [{ name: "Super Carry", kg: 700 }] },
  { company: "Eicher (VECV)", models: [
    { name: "Pro 2049", kg: 2500 }, { name: "Pro 2059", kg: 4000 }, { name: "Pro 2095 XP Plus", kg: 7500 }, { name: "Pro 3015 (6-tyre)", kg: 10000 },
    { name: "Pro 6035 (12-wheeler)", kg: 25000 },
  ] },
  { company: "Piaggio", models: [{ name: "Ape Xtra LDX (3-wheeler)", kg: 500 }, { name: "Ape Xtra Bada 700 (3-wheeler)", kg: 700 }] },
  { company: "Bajaj", models: [{ name: "Maxima C (3-wheeler)", kg: 500 }] },
];

export const VEHICLE_CHOICE_SAVED = "saved";   // "keep my current vehicle" (a driver who already has one saved)
export const VEHICLE_CHOICE_OTHER = "other";   // "my model is not listed" -> a weight category is picked
export const vehicleModelChoice = (ci, mi) => `m:${ci}:${mi}`;
export function parseVehicleModelChoice(choice) {
  const m = /^m:(\d+):(\d+)$/.exec(String(choice || ""));
  if (!m) return null;
  const company = VEHICLE_MODEL_CATALOG[Number(m[1])];
  const model = company && company.models[Number(m[2])];
  return model ? { ci: Number(m[1]), mi: Number(m[2]), company: company.company, model: model.name, kg: model.kg } : null;
}

// The vehicle the driver ended up with, from the picker's state. `categoryOptions` = customerListCategoryOptions(lang) (the 15 customer-list categories;
// each { index, capacityKg, nameEn }), `saved` = { name, kg } already on the driver. Returns { name, kg, company, model } or null while nothing valid is chosen.
//  - a catalogue model  -> name "Tata Motors Ace Gold", the sheet's weight
//  - "my model is not listed" + category -> name = the category's English name (e.g. "Pickup"), weight = the category's limit
//  - "saved" -> exactly what the driver already had (never rewritten by opening the form)
export function resolveVehicleChoice(choice, { categoryOptions = [], categoryIndex = null, saved = null } = {}) {
  if (choice === VEHICLE_CHOICE_SAVED) {
    const kg = Number(saved && saved.kg);
    return saved && String(saved.name || "").trim() && kg > 0 ? { name: String(saved.name).trim(), kg, company: null, model: null } : null;
  }
  if (choice === VEHICLE_CHOICE_OTHER) {
    if (categoryIndex == null || categoryIndex === "") return null; // Number(null) is 0 -- nothing picked must not become the first category
    const opt = categoryOptions.find((o) => o.index === Number(categoryIndex));
    return opt && opt.capacityKg > 0 ? { name: opt.nameEn, kg: opt.capacityKg, company: null, model: null } : null;
  }
  const m = parseVehicleModelChoice(choice);
  return m ? { name: `${m.company} ${m.model}`, kg: m.kg, company: m.company, model: m.model } : null;
}
