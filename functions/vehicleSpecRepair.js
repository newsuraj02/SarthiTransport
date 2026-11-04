/**
 * REPAIR of data damaged by an old bug (found 2026-11-04, fixed in src/App.jsx `lookupVehicleModelSpec`):
 * Driver KYC autofills a driver's vehicle capacity from the vehicle NAME they type, and the old lookup returned the FIRST model whose key appeared in
 * the text -- "16 wheeler" contains "6 wheeler", so a 16-wheeler (30,000 kg) was saved as a 6-wheeler (9,000 kg). The capacity decides which category the
 * driver is listed under on the customer's list and which loads ring them, so those drivers were in the wrong category.
 *
 * This module only DECIDES (pure, no Firebase, testable by scripts/verifyInvariants.mjs). The admin-only callable `repairSixteenWheelerCapacity` in
 * functions/index.js reads the data, calls `planSixteenWheelerRepair` and -- only when the Admin presses "Fix" -- writes the corrected capacity.
 *
 * A record is touched ONLY when BOTH are true:
 *   - its vehicle name says "16 wheeler" / "16-wheeler" (the only names the old lookup got wrong), and
 *   - its saved capacity is EXACTLY 9000 kg (the value the buggy autofill wrote). A driver who typed a different capacity by hand is left alone.
 */

const WRONG_CAPACITY_KG = 9000;   // the 6-wheeler capacity the old lookup autofilled
const RIGHT_CAPACITY_KG = 30000;  // 16 wheeler, as in VEHICLE_MODEL_SPECS (src/App.jsx)
// "16 wheeler", "16-wheeler", "Tata 16 Wheeler" -- but not "116 wheeler"; needs the space / hyphen, exactly like the old lookup keys did.
const SIXTEEN_WHEELER_RE = /(?<![0-9])16[\s-]+wheeler/i;

const asText = (v) => (typeof v === "string" ? v : "");

// drivers: [{ id, name, mobile, vehicleSpec }]   vehicleTypes: [{ id, key, label, labelEn, capacityKg }]
// -> { drivers: [{ mobile, name, vehicleName, from, to }], types: [{ key, label, from, to }] }
function planSixteenWheelerRepair(drivers, vehicleTypes) {
  const typeByKey = new Map();
  for (const t of vehicleTypes || []) typeByKey.set(t.key || t.id, t);
  const out = { drivers: [], types: [] };

  for (const d of drivers || []) {
    const spec = d.vehicleSpec || {};
    if (Number(spec.capacityKg) !== WRONG_CAPACITY_KG) continue;
    const t = typeByKey.get(spec.type);
    const names = [asText(t && t.label), asText(t && t.labelEn), asText(spec.type), asText(spec.vehicleName), asText(spec.name)].filter(Boolean);
    if (!names.some((n) => SIXTEEN_WHEELER_RE.test(n))) continue;
    out.drivers.push({ mobile: d.mobile || d.id, name: d.name || "", vehicleName: asText(t && (t.labelEn || t.label)) || asText(spec.type), from: WRONG_CAPACITY_KG, to: RIGHT_CAPACITY_KG });
  }

  for (const t of vehicleTypes || []) {
    if (Number(t.capacityKg) !== WRONG_CAPACITY_KG) continue;
    const names = [asText(t.label), asText(t.labelEn), asText(t.key || t.id)].filter(Boolean);
    if (!names.some((n) => SIXTEEN_WHEELER_RE.test(n))) continue;
    out.types.push({ key: t.key || t.id, label: asText(t.labelEn) || asText(t.label), from: WRONG_CAPACITY_KG, to: RIGHT_CAPACITY_KG });
  }
  return out;
}

module.exports = { WRONG_CAPACITY_KG, RIGHT_CAPACITY_KG, SIXTEEN_WHEELER_RE, planSixteenWheelerRepair };
