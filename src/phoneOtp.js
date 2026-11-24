// NUMBER + OTP LOGIN, NO PIN (owner 2026-11-24: "Remove the PIN procedure, just keep the Number + OTP login"; 2026-11-23: "I want the OTP back during signup and Login as I have got
// multiple fraud bookings").  Customer sign-up: details > number > OTP > done.   Driver sign-up: details > number > OTP > KYC documents > done.   Login: number > OTP.
// The OTP is a real Firebase Phone Auth SMS (sent by Firebase's servers, with an invisible reCAPTCHA). It is checked in a SEPARATE auth app (`otpFirebaseAuth`, in memory only -- see
// firebaseClient.js) so it never logs anybody into the app by itself. What turns the proven number into a session is the server callable `otpSignIn` (functions/phoneSignup.js decides):
// it answers with a Firebase custom token for that number's customer / driver login, and `signInAfterOtp` below signs the person in with it. That session is stored on the phone
// (IndexedDB) and stays until the person taps Logout -- the OTP is asked ONCE per login, never again on later app opens. The UI (CustomerOnboarding / DriverOnboarding in
// App.jsx) talks only to the functions below.
import { RecaptchaVerifier, signInWithPhoneNumber, signOut, signInWithCustomToken } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { otpFirebaseAuth, otpFunctions } from "./firebaseClient";

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
    no_account: ["No account found for this number. Please sign up first.", "इस नंबर का खाता नहीं मिला। कृपया पहले साइन अप करें।", "या नंबरचे खाते सापडले नाही. कृपया आधी साइन अप करा."],
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

// After the OTP code was accepted: asks the server to sign this number in (`mode` "login" | "signup") and signs the customer / driver session in with what it returns.
// `authInstance` = customerFirebaseAuth or driverFirebaseAuth. -> { ok: true } | { ok: false, reason }
//   reason: "no_account" | "exists" | "other_role" | "otp_expired" | "error" | "not_configured"
export async function signInAfterOtp(authInstance, role, mode) {
  if (!otpFunctions || !authInstance) return { ok: false, reason: "not_configured" };
  let data;
  try {
    data = (await httpsCallable(otpFunctions, "otpSignIn")({ role, mode })).data;
  } catch (e) {
    console.error("[signInAfterOtp] callable failed", e);
    return { ok: false, reason: e && e.code === "functions/unauthenticated" ? "otp_expired" : "error" };
  }
  if (!data || !data.ok || typeof data.token !== "string") return { ok: false, reason: (data && data.reason) || "error" };
  try { await signInWithCustomToken(authInstance, data.token); return { ok: true }; }
  catch (e) { console.error("[signInAfterOtp] sign-in failed", e); return { ok: false, reason: "error" }; }
}

// Forget the OTP session (after the account / login is done, or when the person backs out). Best effort.
export async function endOtpSession() {
  dropVerifier();
  try { if (otpFirebaseAuth && otpFirebaseAuth.currentUser) await signOut(otpFirebaseAuth); } catch { /* nothing to do */ }
}
