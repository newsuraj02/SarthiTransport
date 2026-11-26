// WHO IS A "TRANSPORTER" IN ADMIN (owner 2026-11-26: "there are 3-4 Drivers with only 1 vehicle in the Transporter list whereas I specifically want only 2 and above vehicle listed in the Transporter list").
// ONE rule for the Admin "All Transporters (N)" button AND the list behind it: an owner is a transporter only when he has TWO OR MORE vehicles in `fleetVehicles` (every vehicle that is listed under him,
// whatever its status). A driver with a single vehicle (e.g. one who just tapped "Add new vehicle" and has only his own) is an ordinary driver, not a transporter. Pure -- no React, no Firebase.
export const TRANSPORTER_MIN_VEHICLES = 2;

// -> [{ mobile, vehicles: [...] }] for every owner with at least TRANSPORTER_MIN_VEHICLES vehicles (input order kept inside an owner; owners in first-seen order).
export function groupTransporters(fleetVehicles, minVehicles = TRANSPORTER_MIN_VEHICLES) {
  const byOwner = new Map();
  (Array.isArray(fleetVehicles) ? fleetVehicles : []).forEach((v) => {
    if (!v || !v.ownerMobile) return;
    if (!byOwner.has(v.ownerMobile)) byOwner.set(v.ownerMobile, []);
    byOwner.get(v.ownerMobile).push(v);
  });
  return [...byOwner.entries()].filter(([, vs]) => vs.length >= minVehicles).map(([mobile, vehicles]) => ({ mobile, vehicles }));
}
