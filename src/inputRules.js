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
