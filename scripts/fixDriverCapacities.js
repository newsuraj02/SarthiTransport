// ONE-OFF admin script (owner 2026-11-10): corrects vehicle weights that drivers typed wrongly at sign-up (tons typed into the kilogram box, or an extra zero).
// DRY RUN by default -- it only PRINTS what it would change. Add --apply to write.
//
// Usage:
//   cd scripts
//   node fixDriverCapacities.js /path/to/serviceAccountKey.json                  (dry run: shows the planned changes)
//   node fixDriverCapacities.js /path/to/serviceAccountKey.json --apply          (writes them)
//   node fixDriverCapacities.js /path/to/serviceAccountKey.json --set 9060627781=7500 --set 8237568117=12000 --set 9370536594=25000     (add more, once confirmed with the driver)
//
// Safety: a record is changed ONLY when its saved capacity is still the wrong value listed below (`from`), or -- for a --set -- is outside 300..35000 kg.
// A driver who has since fixed their own weight, or any sensible weight, is never overwritten. It writes only `vehicleSpec.capacityKg`.

const admin = require("firebase-admin");
const path = require("path");

const [, , keyPathArg, ...args] = process.argv;
if (!keyPathArg) {
  console.error("Usage: node fixDriverCapacities.js <serviceAccountKey.json> [--apply] [--set mobile=kg ...]");
  process.exit(1);
}
const APPLY = args.includes("--apply");

// Confirmed by the owner 2026-11-10 (typed in tons; the vehicle names show the intended weight).
const FIXES = [
  { mobile: "9284080182", from: 1.5, to: 1500, note: "Vishnu Dudhate -- Veero Mahindra 1.5 XXL" },
  { mobile: "9356468927", from: 1.5, to: 1500, note: "Vikas Gunthe -- Bolero pick up" },
  { mobile: "8830048557", from: 1.7, to: 1700, note: "Raj Jagtap -- Ashok Leyland Dost plus" },
  { mobile: "9923450868", from: 1.7, to: 1700, note: "Tushar Suryavanshi -- Pick up 1.7" },
];
// Anything passed with --set (to be confirmed with the driver first): 9060627781 (Tata 1613, typed 7.5), 8237568117 ("Eiser", typed 12), 9370536594 (Leyland 3118, typed 250000).
for (let i = 0; i < args.length; i++) {
  if (args[i] !== "--set") continue;
  const m = /^(\d{10})=(\d{3,6})$/.exec(args[i + 1] || "");
  if (!m) { console.error(`Bad --set value "${args[i + 1]}" (use mobile=kg, e.g. 9060627781=7500)`); process.exit(1); }
  FIXES.push({ mobile: m[1], from: null, to: Number(m[2]), note: "--set" });
}

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyPathArg))) });
const db = admin.firestore();

(async () => {
  let changed = 0;
  for (const f of FIXES) {
    const ref = db.collection("drivers").doc(f.mobile);
    const snap = await ref.get();
    if (!snap.exists) { console.log(`${f.mobile}  NOT FOUND`); continue; }
    const cur = snap.data().vehicleSpec && snap.data().vehicleSpec.capacityKg;
    const wrongNow = f.from != null ? Number(cur) === f.from : !(Number(cur) >= 300 && Number(cur) <= 35000);
    if (!wrongNow) { console.log(`${f.mobile}  SKIPPED (saved capacity is ${JSON.stringify(cur)}, not the wrong value we expected)  ${f.note}`); continue; }
    console.log(`${f.mobile}  ${JSON.stringify(cur)} -> ${f.to} kg  ${f.note}${APPLY ? "" : "   (dry run)"}`);
    if (APPLY) await ref.update({ "vehicleSpec.capacityKg": f.to });
    changed++;
  }
  console.log(`\n${APPLY ? "Updated" : "Would update"} ${changed} driver(s).${APPLY ? "" : "  Re-run with --apply to write."}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
