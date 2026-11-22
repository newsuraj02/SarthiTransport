// PICKUP ONLY INSIDE PUNE, DROP ANYWHERE IN INDIA (owner 2026-11-22: "For Pickup location, only accept the points inside Pune only. If tries entering outside Pune, add a note of
// currently unavailable. For Drop location, accept anywhere in India.").
// "Inside Pune" = within PUNE_PICKUP_RADIUS_KM of the city centre (this covers Pimpri-Chinchwad, Hinjewadi, Hadapsar, Chakan, Talegaon, Wagholi, the airport ...). It is judged
// from the place's COORDINATES, so a suggestion, a typed address, "Use Current Location", a map tap and an old trip are all checked the same way. Change the one number
// below to widen / narrow the area. Drop has no check here (the suggestions are already limited to India).
export const PUNE_CENTER = { lat: 18.5204, lng: 73.8567 };
export const PUNE_PICKUP_RADIUS_KM = 40;

function kmBetween(aLat, aLng, bLat, bLng) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Coordinates -> true when the point is inside the Pune pickup area. A place we know nothing about (no coordinates) is NOT inside.
export function isInsidePune(lat, lng) {
  const la = Number(lat), ln = Number(lng);
  if (lat == null || lng == null || !Number.isFinite(la) || !Number.isFinite(ln)) return false;
  return kmBetween(PUNE_CENTER.lat, PUNE_CENTER.lng, la, ln) <= PUNE_PICKUP_RADIUS_KM;
}
