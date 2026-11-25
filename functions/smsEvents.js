// Which SMS goes out when (pure; scripts/serverTests/smsEvents.cjs). Owner 2026-11-25: Booking confirmed, New load, KYC reminder.
// A DLT variable is usually limited to about 30 characters, so every place name is shortened to its first part.
const { cleanMobile, isIndianMobile } = require("./smsGateway");

const VAR_MAX = 30;
const shortText = (v, max = VAR_MAX) => {
  const s = String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > 12 ? cut.slice(0, sp) : cut).replace(/[,\-\s]+$/, "");
};

// "New load": the drivers the ring chose (`ringTargets`, written by the frozen onDirectRequestBroadcast FIRST and grown by the escalation waves) who have not been texted for this booking yet.
// The caller stores `smsSentTo` before sending, so a retry never texts anybody twice. -> { targets: [mobile...] }
function newLoadTargets(after) {
  if (!after || after.status !== "AwaitingDriver" || after.driverName || after.pendingDriverName) return { targets: [] };
  const rung = Array.isArray(after.ringTargets) ? after.ringTargets : [];
  const done = new Set((Array.isArray(after.smsSentTo) ? after.smsSentTo : []).map(cleanMobile));
  const seen = new Set(); const targets = [];
  for (const m of rung) { const mob = cleanMobile(m); if (isIndianMobile(mob) && !done.has(mob) && !seen.has(mob)) { seen.add(mob); targets.push(mob); } }
  return { targets };
}
// An {#alphanumeric#} slot only takes Latin letters / digits, so a Devanagari address is replaced (the app opens with the real address): "your pickup" / "your drop".
const hasLatin = (v) => /[A-Za-z0-9]/.test(String(v == null ? "" : v));
const latinOr = (v, fallback) => (hasLatin(v) ? String(v) : fallback);
const newLoadVars = (b) => [shortText(latinOr(b && b.pickup, "the pickup point")), shortText(latinOr(b && b.drop, "the drop point"))];

// "Booking confirmed": to the CUSTOMER when the pickup OTP is made (= a driver accepted). The registered text has the driver and the vehicle only (no OTP in the SMS).
// `driver` = the driver document (or null for a fleet vehicle).
function bookingConfirmedSms(booking, otpDoc, driver) {
  const to = cleanMobile((otpDoc && otpDoc.customerMobile) || (booking && booking.customerMobile));
  if (!isIndianMobile(to) || !otpDoc || !otpDoc.otp) return null;
  const name = latinOr((booking && (booking.fleetDriverName || booking.driverName)) || (driver && driver.name), "your driver");
  const plate = latinOr((booking && booking.fleetVehicleNumber) || (driver && driver.vehicleSpec && driver.vehicleSpec.vehicleNumber), "assigned");
  return { to, vars: [shortText(name, 20), shortText(plate, 15)] };
}

// "KYC reminder": Admin's bulk button. "Dear <name>, ...": the driver's own name (Devanagari names cannot go in an alphanumeric slot, so they become "Driver").
const kycVars = (driver) => [shortText(latinOr(driver && driver.name, "Driver"), 20)];

module.exports = { VAR_MAX, shortText, latinOr, newLoadTargets, newLoadVars, bookingConfirmedSms, kycVars };
