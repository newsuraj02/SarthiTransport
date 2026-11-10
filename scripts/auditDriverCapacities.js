// READ-ONLY admin script (owner 2026-11-10): lists every driver whose vehicle capacity, as typed during sign-up / KYC,
// looks wrong. It writes NOTHING.
//
// Usage:
//   cd scripts
//   npm install
//   node auditDriverCapacities.js /path/to/serviceAccountKey.json
//
// Flags it raises (one driver can have several):
//   MISSING      no capacity saved (or 0 / not a number)
//   TON-TYPED    1..60 -- looks like TONS typed into a KILOGRAM box (e.g. 9 for 9 ton)
//   TOO-SMALL    61..299 kg -- no vehicle in the app is that small
//   TOO-BIG      above 35000 kg and not the "uncapped" 999999 marker -- over the app's biggest vehicle
//   UNCAPPED     999999 -- the "trailer / ODC" marker typed or auto-filled (fine only for a real trailer)
//   NAME-VS-KG   the vehicle NAME names a known model but the capacity is far from that model's usual capacity
//                (more than 40 % apart), e.g. "16 wheeler" with 9000 kg (the old autofill bug) or "Tata Ace" with 9000 kg
//   NAME-WRONG-CLASS  the capacity lands in a different customer-list category than the name suggests
//   DUP-PLATE    the same vehicle number on more than one driver
//
// The category table and the model table below are COPIES of src/App.jsx (CUSTOMER_LIST_CATEGORY_KG / _NAMES and
// VEHICLE_MODEL_SPECS) -- this is a one-off report, keep them in step by hand if those ever change.

const admin = require("firebase-admin");
const path = require("path");

const [, , keyPathArg] = process.argv;
if (!keyPathArg) {
  console.error("Usage: node auditDriverCapacities.js <serviceAccountKey.json>");
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyPathArg))) });
const db = admin.firestore();

const CATEGORY_KG = [500, 750, 1200, 1700, 2500, 3500, 5000, 7500, 9000, 12000, 16000, 20000, 25000, 32000];
const CATEGORY_NAMES = ["3 wheeler", "Tata Ace", "Pickup", "Pickup 8ft", "Tata 407", "14ft Eicher", "17ft Eicher", "20ft container", "6 wheeler", "22ft/24ft truck", "10 wheeler", "20 ton container", "12/14 wheeler", "16 wheeler", "32t+ truck"];
const categoryOf = (kg) => { const i = CATEGORY_KG.findIndex((m) => kg <= m); return i < 0 ? CATEGORY_KG.length : i; };

const MODELS = [
  { keys: ["tata ace gold"], kg: 850 }, { keys: ["tata ace", "chhota hathi", "chotta hathi", "chota hathi"], kg: 750 },
  { keys: ["mahindra jeeto", "jeeto"], kg: 600 }, { keys: ["ashok leyland dost", "dost"], kg: 1250 },
  { keys: ["bolero maxitruck", "bolero pickup", "bolero"], kg: 1500 }, { keys: ["tata 407"], kg: 2500 },
  { keys: ["eicher 14", "14 ft", "14ft"], kg: 3500 }, { keys: ["eicher 17", "17 ft", "17ft"], kg: 5000 },
  { keys: ["eicher 19", "19 ft", "19ft"], kg: 7000 }, { keys: ["20 ft container", "20ft container"], kg: 7500 },
  { keys: ["6 wheeler", "six wheeler", "6-wheeler"], kg: 9000 }, { keys: ["sxl", "32 ft sxl", "32ft sxl"], kg: 9500 },
  { keys: ["22 ft", "22ft"], kg: 10000 }, { keys: ["24 ft", "24ft"], kg: 12000 },
  { keys: ["10 wheeler", "ten wheeler", "10-wheeler", "taurus"], kg: 16000 }, { keys: ["mxl", "32 ft mxl", "32ft mxl"], kg: 18000 },
  { keys: ["12 wheeler", "twelve wheeler", "12-wheeler"], kg: 21000 }, { keys: ["14 wheeler", "fourteen wheeler", "14-wheeler"], kg: 25000 },
  { keys: ["16 wheeler", "sixteen wheeler", "16-wheeler", "40 ft trailer", "40ft trailer"], kg: 30000 },
  { keys: ["trailer", "multi axle", "multi-axle", "odc"], kg: 999999 },
];
// Same rule as the app: the LONGEST matching key wins ("16 wheeler" must not match "6 wheeler").
function modelFor(name) {
  const q = String(name || "").trim().toLowerCase();
  if (!q) return null;
  let best = null, bestLen = 0;
  for (const m of MODELS) for (const k of m.keys) if (q.includes(k) && k.length > bestLen) { best = m; bestLen = k.length; }
  return best;
}

(async () => {
  const [driversSnap, typesSnap] = await Promise.all([db.collection("drivers").get(), db.collection("vehicleTypes").get()]);
  const types = new Map();
  typesSnap.forEach((d) => types.set(d.id, d.data()));
  const typeKey = (t) => t || "";

  const rows = [];
  const plates = new Map();
  driversSnap.forEach((doc) => {
    const d = doc.data();
    if (d.fleetOwner) return; // a fleet owner has no vehicle of his own on this record -- see fleetVehicles
    const vs = d.vehicleSpec || {};
    const t = types.get(typeKey(vs.type)) || {};
    const vehicleName = t.labelEn || t.label || vs.type || "";
    const raw = vs.capacityKg;
    const kg = Number(raw);
    const flags = [];
    if (!(kg > 0)) flags.push("MISSING");
    else {
      if (kg < 61) flags.push("TON-TYPED");
      else if (kg < 300) flags.push("TOO-SMALL");
      if (kg === 999999) flags.push("UNCAPPED");
      else if (kg > 35000) flags.push("TOO-BIG");
      const m = modelFor(vehicleName);
      if (m && kg >= 61) {
        if (m.kg !== 999999 && kg !== 999999 && Math.abs(kg - m.kg) / m.kg > 0.4) flags.push(`NAME-VS-KG (name suggests ~${m.kg} kg)`);
        else if (categoryOf(kg) !== categoryOf(m.kg)) flags.push(`NAME-WRONG-CLASS (name suggests ${CATEGORY_NAMES[categoryOf(m.kg)]})`);
      }
    }
    const plate = String(vs.vehicleNumber || "").replace(/\s+/g, "").toUpperCase();
    if (plate) plates.set(plate, [...(plates.get(plate) || []), doc.id]);
    rows.push({ mobile: doc.id, name: d.name || "", kyc: d.kyc || "", vehicleName, raw, kg, plate, flags });
  });
  for (const r of rows) if (r.plate && plates.get(r.plate).length > 1) r.flags.push(`DUP-PLATE (${plates.get(r.plate).join(", ")})`);

  const bad = rows.filter((r) => r.flags.length);
  console.log(`Drivers scanned: ${rows.length}   flagged: ${bad.length}\n`);
  for (const r of bad) {
    const cat = r.kg > 0 ? CATEGORY_NAMES[categoryOf(r.kg)] : "-";
    console.log(`${r.mobile} | ${r.name} | KYC ${r.kyc} | vehicle "${r.vehicleName}" | capacity ${JSON.stringify(r.raw)} | lands in "${cat}" | ${r.flags.join("; ")}`);
  }
  console.log("\nHow many drivers sit in each customer-list category (for a sanity check of the spread):");
  const counts = new Map();
  for (const r of rows) if (r.kg > 0) counts.set(categoryOf(r.kg), (counts.get(categoryOf(r.kg)) || 0) + 1);
  [...counts.keys()].sort((a, b) => a - b).forEach((i) => console.log(`  ${CATEGORY_NAMES[i].padEnd(18)} ${counts.get(i)}`));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
