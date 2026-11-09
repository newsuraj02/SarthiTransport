// A driver who owns more than one vehicle becomes a fleet OWNER (owner 2026-11-09, "Add new vehicle" in My Profile). The driver's OWN vehicle becomes the first
// fleet vehicle (driver = the owner himself, approval inherited from his KYC), the account becomes a fleet owner (the same shape the "I own several vehicles" sign-up
// makes: placeholder vehicleSpec with no capacity, so the account itself is never listed as a vehicle) and his real vehicle is kept as `ownVehicleSpec`.
// Pure decision function -- functions/index.js (convertDriverToFleetOwner) does the writes.
function fleetPlaceholderSpec() {
  return { type: "fleet", photo: null, photoFront: null, photoSide: null, capacityKg: null, vehicleNumber: null, fleet: true };
}
function ownVehicleId(mobile) { return `${mobile}_own`; }
function humanVehicleName(spec) {
  return String((spec && (spec.vehicleName || spec.type)) || "Vehicle").replace(/[_-]+/g, " ").trim().slice(0, 60) || "Vehicle";
}
function buildFleetConversion(driver, mobile) {
  if (!driver) return { error: "no-profile" };
  if (driver.blacklisted) return { error: "blocked" };
  if (driver.fleetOwner) return { already: true };
  const spec = driver.vehicleSpec;
  const capacityKg = Number(spec && spec.capacityKg);
  const vehicleNumber = String((spec && spec.vehicleNumber) || "").trim().toUpperCase();
  if (!spec || !(capacityKg > 0) || !vehicleNumber) return { error: "no-vehicle" };
  const id = ownVehicleId(mobile);
  const vehicleName = humanVehicleName(spec);
  // The vehicle carries the driver's own KYC state: an Approved driver keeps getting loads at once, a Pending / Rejected one stays as it is.
  const kyc = driver.kyc === "Approved" ? "Approved" : driver.kyc === "Rejected" ? "Rejected" : "Pending";
  return {
    id,
    vehicle: { ownerMobile: mobile, vehicleName, capacityKg, kyc, active: true, own: true },
    priv: {
      ownerMobile: mobile, driverName: String(driver.name || mobile), driverMobile: mobile, vehicleNumber, vehicleName, capacityKg,
      driverPhotoUrl: (driver.photo && driver.photo.url) || (driver.docs && driver.docs.photo && driver.docs.photo.url) || null,
      dlPhotoUrl: (driver.docs && driver.docs.dl && driver.docs.dl.url) || null,
      vehicleSideUrl: (spec.photoSide && spec.photoSide.url) || null,
    },
    ownerPatch: { fleetOwner: true, fleetSetupDone: true, fleetVehicleCount: 1, ownVehicleSpec: spec, vehicleSpec: fleetPlaceholderSpec() },
  };
}
module.exports = { buildFleetConversion, fleetPlaceholderSpec, ownVehicleId, humanVehicleName };
