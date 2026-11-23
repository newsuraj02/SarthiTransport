// OTP AT SIGN-UP (owner 2026-11-23: "I want the OTP back during signup and login as I have got multiple fraud bookings"): a NEW customer / driver login (the PIN account) is only
// created by the server, and only for a caller who has just proved they own the number with a real Firebase Phone Auth SMS OTP. This file is the one place that decides it
// (pure, so verifyInvariants + scripts/serverTests/phoneSignup.cjs run the real thing). The callable `createPinAccountAfterPhoneVerify` (functions/index.js) uses it.
//
// The proof is the caller's ID token: it must come from a PHONE sign-in (`firebase.sign_in_provider === "phone"`, which carries `phone_number`) that happened within
// OTP_MAX_AGE_SEC. 3 hours because a driver fills in the long documents form between the OTP and the final "Create Account".

const OTP_MAX_AGE_SEC = 3 * 60 * 60;

// -> { ok: true, mobile } | { ok: false, reason }
//   reason: "phone_required" (no phone proof at all) | "otp_expired" | "bad_pin" | "exists" (this role already has the number) | "other_role" (the number is the other role's)
function planPhoneSignup({ token, nowSec, newPassword, roles }) {
  const phone = token && token.phone_number;
  const provider = token && token.firebase && token.firebase.sign_in_provider;
  const m = typeof phone === "string" ? phone.match(/^\+91(\d{10})$/) : null;
  if (!m || provider !== "phone") return { ok: false, reason: "phone_required" };
  const authTime = Number(token.auth_time);
  if (!Number.isFinite(authTime) || nowSec - authTime > OTP_MAX_AGE_SEC || authTime - nowSec > 300) return { ok: false, reason: "otp_expired" };
  if (typeof newPassword !== "string" || newPassword.length < 6 || newPassword.length > 64) return { ok: false, reason: "bad_pin" };
  if (roles && roles.exists) return { ok: false, reason: "exists" };
  if (roles && roles.otherRoleExists) return { ok: false, reason: "other_role" };
  return { ok: true, mobile: m[1] };
}

// The synthetic PIN e-mails a browser must never be able to create on its own (used by the optional Identity Platform blocking function in functions/index.js).
const PIN_EMAIL_RE = /@(customer|driver)\.apnatransport\.local$/i;
function isClientPinSignup(email) { return PIN_EMAIL_RE.test(String(email || "")); }

module.exports = { OTP_MAX_AGE_SEC, planPhoneSignup, isClientPinSignup };
