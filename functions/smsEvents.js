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
const newLoadVars = (b) => [shortText(b && b.pickup), shortText(b && b.drop)];

// "Booking confirmed": to the CUSTOMER when the pickup OTP is made (= a driver accepted). `driver` = the driver document (or null for a fleet vehicle).
function bookingConfirmedSms(booking, otpDoc, driver) {
  const to = cleanMobile((otpDoc && otpDoc.customerMobile) || (booking && booking.customerMobile));
  if (!isIndianMobile(to) || !otpDoc || !otpDoc.otp) return null;
  const name = (booking && (booking.fleetDriverName || booking.driverName)) || (driver && driver.name) || "Driver";
  const plate = (booking && booking.fleetVehicleNumber) || (driver && driver.vehicleSpec && driver.vehicleSpec.vehicleNumber) || "-";
  return { to, vars: [shortText(name, 20), shortText(plate, 15), String(otpDoc.otp)] };
}

// "KYC reminder": Admin's bulk button. The link is the driver's own KYC page.
const kycLink = (mobile) => `https://sarthi-transport-74865.web.app/?driverKyc=1&mobile=${cleanMobile(mobile)}`;

module.exports = { VAR_MAX, shortText, newLoadTargets, newLoadVars, bookingConfirmedSms, kycLink };
