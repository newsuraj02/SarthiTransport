// REMOVE THE VEHICLE SIDE PHOTO EVERYWHERE (owner 2026-11-25: "the Vehicle side photo is irrelevant ... remove all the associates of it from database and frontend too").
// Pure decision: given what is stored, say exactly which fields / files carry a vehicle side photo. functions/index.js (removeVehicleSidePhotos) does the deleting,
// and only when Admin taps Delete (a Check is a dry run). Nothing else is ever listed: a driver's own photo, licence, wallet, KYC state, the front photo, a fleet
// vehicle's driver / licence photos are never touched.
const SIDE_FILE = /^drivers\/[^/]+\/vehicleSide\.jpg$/;            // DriverKyc / sign-up: drivers/{mobile}/vehicleSide.jpg
const FLEET_SIDE_FILE = /^drivers\/[^/]+\/fleet_.+_vehicle\.jpg$/; // the Add-vehicle form: drivers/{owner}/fleet_{id}_vehicle.jpg
const has = (o, k) => !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);

function planVehiclePhotoCleanup({ drivers = [], fleetPrivate = [], storageNames = [] } = {}) {
  const driverPatches = [];
  for (const d of drivers) {
    const fields = [];
    if (has(d.vehicleSpec, "photoSide")) fields.push("vehicleSpec.photoSide");
    if (has(d.ownVehicleSpec, "photoSide")) fields.push("ownVehicleSpec.photoSide"); // a fleet owner's own vehicle (functions/fleetConvert.js keeps the old spec there)
    if (fields.length) driverPatches.push({ mobile: String(d.id || d.mobile), fields });
  }
  const fleetIds = fleetPrivate.filter((v) => has(v, "vehicleSideUrl")).map((v) => String(v.id));
  const files = storageNames.filter((n) => SIDE_FILE.test(n) || FLEET_SIDE_FILE.test(n));
  return { driverPatches, fleetIds, files };
}
module.exports = { planVehiclePhotoCleanup, SIDE_FILE, FLEET_SIDE_FILE };
