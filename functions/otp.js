// Pickup OTP helpers (owner request 2026-11-02, "make the OTP server-side").
// The 4-digit code that proves a driver is physically at the pickup is now made HERE, on the server, the moment a booking becomes
// Ongoing -- not by the driver's own phone (which therefore always knew it) -- and nobody but the server can write it (firestore.rules).
const crypto = require("crypto");

// A code is issued exactly once, when the booking first becomes Ongoing with a driver on it.
function shouldIssuePickupOtp(before, after) {
  if (!before || !after) return false;
  return before.status !== "Ongoing" && after.status === "Ongoing" && !!after.driverMobile;
}

// 1000-9999, from the OS random source (not Math.random).
function newPickupOtp() {
  return String(crypto.randomInt(1000, 10000));
}

// Wrong guesses allowed before the check locks for a while. 10,000 possible codes, so 10 tries is a 0.1% chance per lock window.
const OTP_MAX_BAD_GUESSES = 10;
const OTP_LOCK_MS = 10 * 60 * 1000;

// Decides what verifyPickupOtp should do with one guess. `doc` is the bookingOtps document data (or null when it does not exist yet).
// Returns { valid, locked?, pending?, update? } -- `update` is the patch to write back (counter / lock), if any.
function judgeOtpGuess(doc, guess, now = Date.now()) {
  if (!doc) return { valid: false, pending: true };
  if ((Number(doc.lockedUntil) || 0) > now) return { valid: false, locked: true };
  if (String(doc.otp || "") === String(guess)) return { valid: true, update: (doc.badGuesses ? { badGuesses: 0 } : null) };
  const bad = (Number(doc.badGuesses) || 0) + 1;
  if (bad >= OTP_MAX_BAD_GUESSES) return { valid: false, locked: true, update: { badGuesses: 0, lockedUntil: now + OTP_LOCK_MS } };
  return { valid: false, update: { badGuesses: bad } };
}

module.exports = { shouldIssuePickupOtp, newPickupOtp, judgeOtpGuess, OTP_MAX_BAD_GUESSES, OTP_LOCK_MS };
