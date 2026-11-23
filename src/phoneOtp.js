// OTP AT SIGN-UP AND LOGIN (owner 2026-11-23: "I want the OTP back during signup and Login as I have got multiple fraud bookings").
//   Customer: number > OTP > PIN (twice) > done.   Driver: number > OTP > PIN (twice) > KYC documents > done.   Login: number > OTP > PIN.
// The OTP is a real Firebase Phone Auth SMS (sent by Firebase's servers, with the invisible reCAPTCHA the Forgot-PIN screen already uses). It is done in a SEPARATE auth app
// (`otpFirebaseAuth`, in memory only -- see firebaseClient.js) so it never logs anybody into the app by itself. A NEW PIN login is then created only by the server callable
// `createPinAccountAfterPhoneVerify`, which needs that fresh phone session (functions/phoneSignup.js), so an account for a number nobody verified cannot be made from the app.
// The UI (CustomerOnboarding / DriverOnboarding in App.jsx) talks only to the functions below.
import { RecaptchaVerifier, signInWithPhoneNumber, signOut, signInWithEmailAndPassword } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { otpFirebaseAuth, otpFunctions, pinAuthEmail, pinToPassword } from "./firebaseClient";

export const OTP_RESEND_SECONDS = 30;

// Firebase error code -> one of our reasons (pure; pinned by verifyInvariants).
export function otpReason(code) {
  switch (code) {
    case "auth/too-many-requests": return "too_many";
    case "auth/invalid-phone-number": return "invalid_phone";
    case "auth/quota-exceeded": return "quota";
    case "auth/captcha-check-failed":
    case "auth/missing-recaptcha-token":
    case "auth/invalid-app-credential": return "captcha";
    case "auth/network-request-failed": return "network";
    case "auth/invalid-verification-code": return "wrong_code";
    case "auth/code-expired":
    case "auth/session-expired": return "expired";
    case "auth/operation-not-allowed": return "not_enabled";
    default: return "error";
  }
}

// reason -> the sentence shown under the box (en / hi / mr). Pure.
export function otpMessage(reason, lang) {
  const M = {
    too_many: ["Too many attempts -- please wait a while before trying again.", "बहुत ज़्यादा कोशिशें -- कृपया थोड़ी देर बाद फिर कोशिश करें।", "खूप जास्त प्रयत्न -- कृपया थोड्या वेळाने पुन्हा प्रयत्न करा."],
    invalid_phone: ["That mobile number doesn't look right.", "यह मोबाइल नंबर सही नहीं लग रहा।", "हा मोबाइल नंबर बरोबर वाटत नाही."],
    quota: ["OTP limit reached for now -- please try again later or call us.", "अभी OTP की सीमा पूरी हो गई है -- बाद में कोशिश करें या हमें फोन करें।", "सध्या OTP ची मर्यादा संपली आहे -- नंतर प्रयत्न करा किंवा आम्हाला फोन करा."],
    captcha: ["Couldn't confirm you're not a robot -- please try again.", "वेरिफिकेशन नहीं हो सका -- कृपया फिर कोशिश करें।", "पडताळणी झाली नाही -- कृपया पुन्हा प्रयत्न करा."],
    network: ["No internet -- check your connection and try again.", "इंटरनेट नहीं है -- कनेक्शन जांचें और फिर कोशिश करें।", "इंटरनेट नाही -- कनेक्शन तपासा आणि पुन्हा प्रयत्न करा."],
    wrong_code: ["Incorrect OTP -- try again.", "गलत OTP -- फिर कोशिश करें।", "चुकीचा OTP -- पुन्हा प्रयत्न करा."],
    expired: ["This OTP has expired -- tap Resend OTP.", "यह OTP पुराना हो गया -- OTP दोबारा भेजें दबाएं।", "हा OTP जुना झाला -- OTP पुन्हा पाठवा दाबा."],
    not_enabled: ["OTP is not switched on yet -- please call us.", "OTP अभी चालू नहीं है -- कृपया हमें फोन करें।", "OTP अजून सुरू नाही -- कृपया आम्हाला फोन करा."],
    not_configured: ["The app isn't ready -- please try again in a moment.", "ऐप अभी तैयार नहीं है -- थोड़ी देर बाद कोशिश करें।", "अॅप अजून तयार नाही -- थोड्या वेळाने प्रयत्न करा."],
    otp_expired: ["Your OTP check has expired -- please verify your number again.", "OTP वेरिफिकेशन पुराना हो गया -- कृपया नंबर दोबारा वेरीफाई करें।", "OTP पडताळणी जुनी झाली -- कृपया नंबर पुन्हा पडताळा."],
    error: ["Something went wrong -- try again.", "कुछ गलत हो गया -- फिर कोशिश करें।", "काहीतरी चुकले -- पुन्हा प्रयत्न करा."],
  };
  const row = M[reason] || M.error;
  return lang === "en" ? row[0] : lang === "mr" ? row[2] : row[1];
}

let verifier = null, verifierBox = null;
function dropVerifier() { try { verifier && verifier.clear(); } catch { /* already gone */ } verifier = null; verifierBox = null; }

// Sends the SMS OTP. -> { ok: true, confirmation } | { ok: false, reason }
export async function sendPhoneOtp(mobile, containerId) {
  if (!otpFirebaseAuth) return { ok: false, reason: "not_configured" };
  try {
    if (!verifier || verifierBox !== containerId) { dropVerifier(); verifier = new RecaptchaVerifier(otpFirebaseAuth, containerId, { size: "invisible" }); verifierBox = containerId; }
    const confirmation = await signInWithPhoneNumber(otpFirebaseAuth, "+91" + mobile, verifier);
    return { ok: true, confirmation };
  } catch (e) {
    console.error("[sendPhoneOtp]", e);
    dropVerifier();
    return { ok: false, reason: otpReason(e && e.code) };
  }
}

// Checks the 6 digits. -> { ok: true } | { ok: false, reason }
export async function confirmPhoneOtp(confirmation, code) {
  try { await confirmation.confirm(code); return { ok: true }; }
  catch (e) { console.error("[confirmPhoneOtp]", e); return { ok: false, reason: otpReason(e && e.code) }; }
}

// Creates the PIN login on the server (needs the fresh phone session from confirmPhoneOtp). `pin` is the raw 4 digits. -> { ok: true } | { ok: false, reason }
//   reason: "exists" | "other_role" | "otp_expired" | "bad_pin" | "error" | "not_configured"
export async function createPinAccountAfterOtp(role, pin) {
  if (!otpFunctions) return { ok: false, reason: "not_configured" };
  try {
    const result = await httpsCallable(otpFunctions, "createPinAccountAfterPhoneVerify")({ role, newPin: pinToPassword(pin) });
    return result.data || { ok: false, reason: "error" };
  } catch (e) {
    console.error("[createPinAccountAfterOtp]", e);
    return { ok: false, reason: e && e.code === "functions/unauthenticated" ? "otp_expired" : "error" };
  }
}

// The normal PIN sign-in into the customer / driver session (what login always did). Throws like signInWithEmailAndPassword.
export async function signInWithPin(authInstance, role, mobile, pin) {
  return signInWithEmailAndPassword(authInstance, pinAuthEmail(mobile, role), pinToPassword(pin));
}

// Forget the OTP session (after the account / login is done, or when the person backs out). Best effort.
export async function endOtpSession() {
  dropVerifier();
  try { if (otpFirebaseAuth && otpFirebaseAuth.currentUser) await signOut(otpFirebaseAuth); } catch { /* nothing to do */ }
}
