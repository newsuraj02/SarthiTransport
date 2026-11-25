// OWN SMS OTP (owner 2026-11-25: "implement the DLT SMS ... Signup / Login OTP"). Pure rules (no Firebase) for the one-time code sent by DLT SMS instead of Firebase Phone Auth;
// functions/smsFunctions.js stores the documents and calls these. Tested by scripts/serverTests/smsOtp.cjs.
//
// Why this is careful: an unauthenticated "send an SMS to this number" function is what SMS-pumping fraud abuses, so (1) a number is only texted when the sign-in could actually
// go on (login = the number HAS an account, sign-up = it does NOT -- checked by the caller BEFORE sending), (2) per-number limits (30 s between texts, 5 / hour, 10 / day), (3) per-
// device-address limit, (4) a global daily cap, (5) the code is stored only as a salted hash, lives 5 minutes, allows 5 wrong guesses, and works once.
// After the right code the server hands back a one-time PROOF (kept in the same document, valid 3 h so a driver can fill in the long documents form, then is used up by `otpSignIn`).
const crypto = require("crypto");

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_GAP_MS = 30 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_SENDS_PER_DAY = 10;
const MAX_BAD_GUESSES = 5;
const PROOF_TTL_MS = 3 * 60 * 60 * 1000;
const IP_MAX_PER_HOUR = 20;
const HOUR = 3600 * 1000, DAY = 24 * HOUR;

const newCode = () => String(crypto.randomInt(100000, 1000000));
const newSalt = () => crypto.randomBytes(12).toString("base64url");
const newProof = () => crypto.randomBytes(24).toString("base64url");
const hashCode = (mobile, code, salt) => crypto.createHash("sha256").update(`${mobile}:${code}:${salt}`).digest("hex");
const timingSafeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// May this number be texted now? `doc` = its smsOtps document (or null). -> { ok: true } | { ok: false, reason: "wait" | "too_many", waitSec? }
function planSend(doc, now) {
  const sends = Array.isArray(doc && doc.sends) ? doc.sends.map(Number).filter((t) => now - t < DAY) : [];
  const last = sends.length ? Math.max(...sends) : 0;
  if (last && now - last < RESEND_GAP_MS) return { ok: false, reason: "wait", waitSec: Math.ceil((RESEND_GAP_MS - (now - last)) / 1000) };
  if (sends.filter((t) => now - t < HOUR).length >= MAX_SENDS_PER_HOUR || sends.length >= MAX_SENDS_PER_DAY) return { ok: false, reason: "too_many" };
  return { ok: true };
}

// The document to store after a send. A new code replaces any older one (and kills an old proof).
function afterSend(doc, now, { mobile, code }) {
  const sends = (Array.isArray(doc && doc.sends) ? doc.sends.map(Number).filter((t) => now - t < DAY) : []).concat(now);
  const salt = newSalt();
  return { mobile, sends, salt, hash: hashCode(mobile, code, salt), expiresAt: now + OTP_TTL_MS, bad: 0, proof: null, proofUntil: 0, updatedAt: now };
}

// One guess. -> { ok: true, doc, proof } | { ok: false, reason: "no_code" | "expired" | "wrong_code" | "locked", doc? }   (`doc` = what to store)
function planVerify(doc, mobile, code, now) {
  if (!doc || !doc.hash) return { ok: false, reason: "no_code" };
  if (now > Number(doc.expiresAt || 0)) return { ok: false, reason: "expired" };
  if (!/^\d{6}$/.test(String(code || ""))) return { ok: false, reason: "wrong_code", doc: { ...doc, bad: (Number(doc.bad) || 0) + 1 } };
  if (timingSafeEq(hashCode(mobile, String(code), doc.salt), doc.hash)) {
    const proof = newProof();
    return { ok: true, proof, doc: { ...doc, hash: null, bad: 0, proof, proofUntil: now + PROOF_TTL_MS, updatedAt: now } };
  }
  const bad = (Number(doc.bad) || 0) + 1;
  if (bad >= MAX_BAD_GUESSES) return { ok: false, reason: "locked", doc: { ...doc, hash: null, bad } }; // the code is burnt; ask for a new one
  return { ok: false, reason: "wrong_code", doc: { ...doc, bad } };
}

// otpSignIn with a proof: valid, unexpired, for THIS number. Used once (the caller deletes the proof).
function checkProof(doc, proof, now) {
  if (!doc || !doc.proof || !proof) return false;
  return now <= Number(doc.proofUntil || 0) && timingSafeEq(String(proof), doc.proof);
}

// Per-address limit (`doc` = the counter document for that address hash).
function planIp(doc, now) {
  const sends = (Array.isArray(doc && doc.sends) ? doc.sends.map(Number) : []).filter((t) => now - t < HOUR);
  return sends.length >= IP_MAX_PER_HOUR ? { ok: false, sends } : { ok: true, sends: sends.concat(now) };
}

module.exports = { OTP_TTL_MS, RESEND_GAP_MS, MAX_SENDS_PER_HOUR, MAX_SENDS_PER_DAY, MAX_BAD_GUESSES, PROOF_TTL_MS, IP_MAX_PER_HOUR, newCode, hashCode, planSend, afterSend, planVerify, checkProof, planIp };
