// Runs the REAL `removeVehicleSidePhotos` callable (functions/index.js) against a tiny fake Firestore + fake Storage -- no Firebase, no network (owner 2026-11-25: the vehicle side
// photo was removed; its stored fields and files are removed by Admin's Check / Delete). Every line must say "ok"; the exit code is 1 otherwise. verifyInvariants.mjs runs this file.
const Module = require("module");
const path = require("path");
const store = {};
const col = (n) => (store[n] ||= new Map());
const DEL = { __delete: true };
class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const setPath = (obj, dotted, val) => { const parts = dotted.split("."); let o = obj; for (let i = 0; i < parts.length - 1; i++) { o[parts[i]] = o[parts[i]] && typeof o[parts[i]] === "object" ? o[parts[i]] : {}; o = o[parts[i]]; } if (val === DEL) delete o[parts[parts.length - 1]]; else o[parts[parts.length - 1]] = val; };
const applyUpdate = (cur, patch) => { const next = JSON.parse(JSON.stringify(cur)); for (const [k, v] of Object.entries(patch)) setPath(next, k, v); return next; };
const fakeDb = {
  collection: (name) => ({
    async get() { return { docs: [...col(name).entries()].map(([id, d]) => ({ id, data: () => d })) }; },
    doc: (id) => ({ id, __col: name }),
  }),
  batch: () => { const ops = []; return { update(ref, patch) { ops.push([ref, patch]); }, async commit() { ops.forEach(([r, p]) => { if (!col(r.__col).has(r.id)) throw new Error("no doc"); col(r.__col).set(r.id, applyUpdate(col(r.__col).get(r.id), p)); }); } }; },
};
const files = new Set(); const deletedFiles = [];
const fakeBucket = { async getFiles({ prefix }) { return [[...files].filter((n) => n.startsWith(prefix)).map((name) => ({ name }))]; }, file: (name) => ({ async delete() { files.delete(name); deletedFiles.push(name); } }) };
const real = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === "firebase-functions/v2/https") return { onCall: (o, fn) => fn, onRequest: (o, fn) => fn, HttpsError };
  if (req === "firebase-functions/v2/firestore") return { onDocumentCreated: () => ({}), onDocumentUpdated: () => ({}), onDocumentWritten: () => ({}) };
  if (req === "firebase-functions/v2/scheduler") return { onSchedule: () => ({}) };
  if (req === "firebase-functions/params") return { defineSecret: () => ({ value: () => "x" }) };
  if (req === "firebase-admin/app") return { initializeApp: () => ({}) };
  if (req === "firebase-admin/firestore") return { getFirestore: () => fakeDb, FieldValue: { serverTimestamp: () => ({ __ts: true }), increment: (n) => n, arrayUnion: (...a) => a, delete: () => DEL }, Timestamp: { now: () => ({}), fromMillis: (m) => ({ toMillis: () => m }) } };
  if (req === "firebase-admin/storage") return { getStorage: () => ({ bucket: () => fakeBucket }) };
  if (req.startsWith("firebase-") || req.startsWith("@google-cloud")) return new Proxy(function () {}, { get: (t, k) => (k === "then" ? undefined : () => ({})), apply: () => ({}) });
  return real.apply(this, arguments);
};
let fns;
try { fns = require(path.join(__dirname, "..", "..", "functions", "index.js")); } catch (e) { console.error("LOAD FAIL", e.message); process.exit(2); }
const call = fns.removeVehicleSidePhotos;
const admin = { auth: { token: { admin: true } } };
(async () => {
  const out = [];
  const ok = (name, cond, detail) => out.push([cond ? "ok  " : "BUG?", name, detail || ""]);
  col("drivers").set("9000000001", { name: "Ravi", kyc: "Approved", wallet: 700, photo: { url: "me" }, docs: { dl: { url: "dl" }, photo: { url: "me" } }, vehicleSpec: { type: "ace", capacityKg: 700, vehicleNumber: "MH12AB1234", photo: { url: "front" }, photoSide: { name: "s", url: "side" } } });
  col("drivers").set("9000000002", { name: "Owner", fleetOwner: true, vehicleSpec: { type: "fleet", photoSide: null, fleet: true }, ownVehicleSpec: { type: "ace", capacityKg: 700, photoSide: { url: "oside" } } });
  col("drivers").set("9000000003", { name: "Clean", vehicleSpec: { type: "ace", capacityKg: 700 } });
  col("fleetVehiclePrivate").set("f1", { ownerMobile: "9000000002", driverName: "D", driverPhotoUrl: "dp", dlPhotoUrl: "dlp", vehicleSideUrl: "vs" });
  col("fleetVehiclePrivate").set("f2", { ownerMobile: "9000000002", driverName: "E", driverPhotoUrl: "dp2", dlPhotoUrl: "dlp2" });
  ["drivers/9000000001/vehicleSide.jpg", "drivers/9000000001/dl.jpg", "drivers/9000000001/photo.jpg", "drivers/9000000002/fleet_f1_vehicle.jpg", "drivers/9000000002/fleet_f1_driver.jpg", "drivers/9000000002/fleet_f1_dl.jpg", "bookings/b1/bill.jpg"].forEach((n) => files.add(n));
  const before = JSON.stringify([...col("drivers")]) + JSON.stringify([...col("fleetVehiclePrivate")]);

  let err; try { await call({ auth: { token: {} }, data: { apply: true } }); } catch (e) { err = e; }
  ok("non-admin refused (nothing runs)", err && err.code === "permission-denied" && deletedFiles.length === 0);

  const dry = await call({ ...admin, data: {} });
  ok("Check counts 2 drivers + 1 transporter vehicle + 2 files and applies nothing", dry.ok && dry.applied === false && dry.driverCount === 2 && dry.fleetCount === 1 && dry.fileCount === 2 && dry.filesDeleted === 0, JSON.stringify(dry));
  ok("Check changed no record and deleted no file", before === JSON.stringify([...col("drivers")]) + JSON.stringify([...col("fleetVehiclePrivate")]) && deletedFiles.length === 0);
  const dry2 = await call({ ...admin, data: { apply: "true" } });
  ok("apply must be boolean true (the string 'true' is a Check)", dry2.applied === false && deletedFiles.length === 0);

  const done = await call({ ...admin, data: { apply: true } });
  ok("Delete reports what it removed", done.ok && done.applied === true && done.driverCount === 2 && done.fleetCount === 1 && done.filesDeleted === 2, JSON.stringify(done));
  const d1 = col("drivers").get("9000000001"), d2 = col("drivers").get("9000000002");
  ok("side photo fields are gone from the driver and the owner's own vehicle", !("photoSide" in d1.vehicleSpec) && !("photoSide" in d2.vehicleSpec) && !("photoSide" in d2.ownVehicleSpec));
  ok("nothing else on those records changed (photo, licence, wallet, KYC, front photo, vehicle details)", d1.kyc === "Approved" && d1.wallet === 700 && d1.photo.url === "me" && d1.docs.dl.url === "dl" && d1.vehicleSpec.photo.url === "front" && d1.vehicleSpec.vehicleNumber === "MH12AB1234" && d1.vehicleSpec.capacityKg === 700 && d2.ownVehicleSpec.capacityKg === 700 && d2.fleetOwner === true);
  const f1 = col("fleetVehiclePrivate").get("f1"), f2 = col("fleetVehiclePrivate").get("f2");
  ok("fleet vehicle: vehicleSideUrl gone, driver + licence photos and the rest kept", !("vehicleSideUrl" in f1) && f1.driverPhotoUrl === "dp" && f1.dlPhotoUrl === "dlp" && f1.driverName === "D" && f2.driverPhotoUrl === "dp2");
  ok("only the two side-photo files were deleted from Storage", JSON.stringify(deletedFiles.sort()) === JSON.stringify(["drivers/9000000001/vehicleSide.jpg", "drivers/9000000002/fleet_f1_vehicle.jpg"]) && files.has("drivers/9000000001/dl.jpg") && files.has("drivers/9000000001/photo.jpg") && files.has("drivers/9000000002/fleet_f1_driver.jpg") && files.has("drivers/9000000002/fleet_f1_dl.jpg") && files.has("bookings/b1/bill.jpg"));
  const again = await call({ ...admin, data: { apply: true } });
  ok("running Delete again finds nothing and changes nothing", again.ok && again.driverCount === 0 && again.fleetCount === 0 && again.fileCount === 0);
  out.forEach((l) => console.log(l.join("  ")));
  process.exit(out.some((l) => l[0] !== "ok  ") ? 1 : 0);
})().catch((e) => { console.error("CRASH", e); process.exit(2); });
