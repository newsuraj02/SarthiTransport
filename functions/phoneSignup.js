// NUMBER + OTP LOGIN, NO PIN (owner 2026-11-24: "Remove the PIN procedure, just keep the Number + OTP login"; before that, 2026-11-23: "I want the OTP back during signup and Login as I have
// got multiple fraud bookings"). The only way into the customer / driver app is a real Firebase Phone Auth SMS OTP, and THIS file is the one place that decides what that OTP is
// allowed to do (pure, so verifyInvariants + scripts/serverTests/phoneSignup.cjs run the real thing). The callable `otpSignIn` (functions/index.js) uses it.
//
// The proof is the caller's ID token: it must come from a PHONE sign-in (`firebase.sign_in_provider === "phone"`, which carries `phone_number`) that is recent enough --
//   login:   OTP_LOGIN_MAX_AGE_SEC  (the app calls the function the moment the code is accepted)
//   signup:  OTP_SIGNUP_MAX_AGE_SEC (3 hours: a driver fills in the long documents form between the OTP and the final "Create Account")
// After the proof, the server (not the phone) signs the person in: it hands back a Firebase custom token for that number's customer / driver login.

const OTP_LOGIN_MAX_AGE_SEC = 15 * 60;
const OTP_SIGNUP_MAX_AGE_SEC = 3 * 60 * 60;
const OTP_MAX_AGE_SEC = OTP_SIGNUP_MAX_AGE_SEC;

// roles = { exists, otherRoleExists } for the number (functions/roleLock.js lookupMobileRoles): `exists` = this role already has the number (a login OR a profile document).
// -> { ok: true, mobile } | { ok: false, reason }
//   reason: "phone_required" (no phone proof at all) | "otp_expired" | "exists" (sign-up on a number this role already has) | "other_role" (the number is the other role's)
//           | "no_account" (login on a number that has no account in this role -- it must Sign Up first)
function planOtpSignIn({ token, nowSec, mode, roles }) {
  const phone = token && token.phone_number;
  const provider = token && token.firebase && token.firebase.sign_in_provider;
  const m = typeof phone === "string" ? phone.match(/^\+91(\d{10})$/) : null;
  if (!m || provider !== "phone") return { ok: false, reason: "phone_required" };
  const authTime = Number(token.auth_time);
  const maxAge = mode === "signup" ? OTP_SIGNUP_MAX_AGE_SEC : OTP_LOGIN_MAX_AGE_SEC;
  if (!Number.isFinite(authTime) || nowSec - authTime > maxAge || authTime - nowSec > 300) return { ok: false, reason: "otp_expired" };
  const r = roles || { exists: false, otherRoleExists: false };
  if (mode === "signup") {
    if (r.exists) return { ok: false, reason: "exists" };
    if (r.otherRoleExists) return { ok: false, reason: "other_role" };
    return { ok: true, mobile: m[1] };
  }
  if (!r.exists) return { ok: false, reason: r.otherRoleExists ? "other_role" : "no_account" };
  return { ok: true, mobile: m[1] };
}

// The synthetic e-mails a browser must never be able to create on its own (used by the optional Identity Platform blocking function in functions/index.js).
const PIN_EMAIL_RE = /@(customer|driver)\.apnatransport\.local$/i;
function isClientPinSignup(email) { return PIN_EMAIL_RE.test(String(email || "")); }

module.exports = { OTP_MAX_AGE_SEC, OTP_LOGIN_MAX_AGE_SEC, OTP_SIGNUP_MAX_AGE_SEC, planOtpSignIn, isClientPinSignup };
