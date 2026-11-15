// What the sign-up / profile boxes accept (owner 2026-11-09: "some of the users are putting numbers in place of name ... only letters accepted for the name, and only numbers accepted for the number fields").
// NAME boxes: letters of ANY language (English, Hindi, Marathi ...), their vowel signs, spaces and . ' - -- no digits, no symbols. NUMBER boxes: digits only (a phone with a Hindi / Marathi
// keyboard types Devanagari digits, those are turned into 0-9 instead of being thrown away). Pure functions, shared by every screen so the rule cannot drift.
const NAME_BAD = /[^\p{L}\p{M}‌‍\s.'’-]/gu;
export function cleanNameInput(v) {
  return String(v == null ? "" : v).replace(NAME_BAD, "").replace(/\s+/g, " ").replace(/^[\s.'’-]+/, "").slice(0, 60);
}
// A real name has at least two letters and nothing but name characters (an old account whose name is just its mobile number fails this).
export function isValidPersonName(v) {
  const s = String(v == null ? "" : v).trim();
  return (s.match(/\p{L}/gu) || []).length >= 2 && !new RegExp(NAME_BAD.source, "u").test(s);
}
export function digitsOnly(v, max) {
  const d = String(v == null ? "" : v).replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 0x0966)).replace(/\D/g, "");
  return max ? d.slice(0, max) : d;
}

// VEHICLE REGISTERED NUMBER (owner 2026-11-15: "only accepts AB12AB1234 -- this many letters and digits, in this order"): exactly 2 letters, 2 digits, 2 letters, 4 digits (e.g. MH12AB1234).
// Typing is filtered position by position (a digit cannot go where a letter belongs and the reverse); spaces, dashes and lower case are cleaned up, so a pasted "mh-12-ab-1234" becomes MH12AB1234.
// The form refuses to submit anything that is not the full pattern. ONE rule for every screen where a driver / owner enters a vehicle number.
const VEHICLE_NUMBER_SHAPE = ["L", "L", "D", "D", "L", "L", "D", "D", "D", "D"];
export function cleanVehicleNumberInput(v) {
  const src = String(v == null ? "" : v).toUpperCase().replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 0x0966)).replace(/[^A-Z0-9]/g, "");
  let out = "";
  for (const ch of src) {
    if (out.length >= VEHICLE_NUMBER_SHAPE.length) break;
    const want = VEHICLE_NUMBER_SHAPE[out.length];
    if ((want === "L" && /[A-Z]/.test(ch)) || (want === "D" && /[0-9]/.test(ch))) out += ch;
  }
  return out;
}
export const isValidVehicleNumber = (v) => /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/.test(String(v == null ? "" : v).trim().toUpperCase());
export const vehicleNumberHint = (lang) => (lang === "en" ? "Format: AB12AB1234 (2 letters, 2 digits, 2 letters, 4 digits)" : lang === "mr" ? "फॉरमॅट: AB12AB1234 (2 अक्षरे, 2 अंक, 2 अक्षरे, 4 अंक)" : "फ़ॉर्मेट: AB12AB1234 (2 अक्षर, 2 अंक, 2 अक्षर, 4 अंक)");
