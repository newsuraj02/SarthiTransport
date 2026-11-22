// PICKUP / DROP MUST BE A SPECIFIC PLACE (owner 2026-11-22: the boxes accepted "Pune, India" / "Chennai, India", which is too generic to tell where a vehicle should go).
// A place is TOO GENERIC when Google calls it only a city / district / state / country / region / pincode (no building, landmark, street, area or neighbourhood).
// Areas (sublocality / neighbourhood, e.g. "Hinjewadi"), roads, buildings, landmarks, stations and airports are accepted.
// The SAME lists live in functions/addressLang.js (the server filters the suggestions); an invariant compares them. Change both together.
export const GENERIC_PLACE_TYPES = ["country", "administrative_area_level_1", "administrative_area_level_2", "administrative_area_level_3", "administrative_area_level_4", "administrative_area_level_5", "locality", "colloquial_area", "postal_town", "postal_code", "continent"];
export const SPECIFIC_PLACE_TYPES = ["establishment", "point_of_interest", "premise", "subpremise", "street_address", "route", "intersection", "neighborhood", "transit_station", "airport", "plus_code"];

// Google place `types` -> true when the place is only a city / district / state ... Unknown (missing) types are never "generic": a place we cannot judge is accepted.
export function isGenericPlaceTypes(types) {
  if (!Array.isArray(types) || !types.length) return false;
  const generic = types.some((t) => GENERIC_PLACE_TYPES.includes(t));
  if (!generic) return false;
  const specific = types.some((t) => SPECIFIC_PLACE_TYPES.includes(t) || String(t).startsWith("sublocality"));
  return !specific;
}

const REGION_NAMES = ["andhra pradesh", "arunachal pradesh", "assam", "bihar", "chhattisgarh", "goa", "gujarat", "haryana", "himachal pradesh", "jharkhand", "karnataka", "kerala", "madhya pradesh", "maharashtra", "manipur", "meghalaya", "mizoram", "nagaland", "odisha", "punjab", "rajasthan", "sikkim", "tamil nadu", "telangana", "tripura", "uttar pradesh", "uttarakhand", "west bengal", "delhi", "new delhi", "chandigarh", "puducherry", "jammu and kashmir", "ladakh",
  "महाराष्ट्र", "गुजरात", "कर्नाटक", "तमिलनाडु", "तमिळनाडू", "दिल्ली", "राजस्थान", "उत्तर प्रदेश", "मध्य प्रदेश", "तेलंगाना", "केरल", "पंजाब", "हरियाणा", "बिहार", "गोवा"];

// A saved address TEXT (an older booking, which has no place types) that is only "<city>, India" or "<city>, <state>[, India]". Used to leave such old trips out of the
// "recent" suggestions. A real address always has at least an area + a city, so one or two parts that end in a state is just a city.
export function isGenericPlaceName(name) {
  if (typeof name !== "string") return false;
  const parts = name.split(",").map((p) => p.trim()).filter(Boolean);
  while (parts.length && /^(india|भारत)$/i.test(parts[parts.length - 1])) parts.pop();
  if (!parts.length) return false;
  if (parts.length === 1) return true;
  if (parts.length === 2 && REGION_NAMES.includes(parts[1].toLowerCase())) return true;
  return false;
}
