// Server copy of src/fleetDispatch.js (kept identical -- an invariant compares the two) + the trip-link token helpers (owner 2026-11-08).
const crypto = require("crypto");
const cleanMobile = (m) => String(m || "").replace(/\D/g, "").slice(-10);

function mapsLink(lat, lng) {
  return lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? `https://maps.google.com/?q=${Number(lat)},${Number(lng)}` : "";
}

function buildFleetDispatchText({ booking, ownerName, ownerMobile, link }) {
  const b = booking || {};
  const lines = ["🚛 अपना ट्रांसपोर्ट — नई ट्रिप"];
  if (b.scheduledFor) lines.push(`📅 एडवांस ट्रिप: ${b.scheduledFor}`);
  lines.push(`📍 पिकअप (माल यहाँ से उठाना है): ${b.pickup || "-"}`);
  const pm = mapsLink(b.pickupLat, b.pickupLng);
  if (pm) lines.push(`   नक्शा: ${pm}`);
  lines.push(`🏁 ड्रॉप (माल यहाँ छोड़ना है): ${b.drop || "-"}`);
  const dm = mapsLink(b.dropLat, b.dropLng);
  if (dm) lines.push(`   नक्शा: ${dm}`);
  lines.push(`📞 कस्टमर का मोबाइल: ${cleanMobile(b.customerMobile) || "-"}`);
  lines.push(`👤 ओनर${ownerName ? ` (${ownerName})` : ""} का मोबाइल: ${cleanMobile(ownerMobile) || "-"}`);
  if (link) lines.push(`✅ पिकअप पर कस्टमर से 4 अंकों का OTP लेकर इस लिंक में डालें, और माल पहुँचाकर "डिलीवर हो गया" दबाएँ: ${link}`);
  return lines.join("\n");
}

// A 24-hex-character secret per trip link; compared in constant time.
const newLinkToken = () => crypto.randomBytes(12).toString("hex");
function tokenMatches(stored, given) {
  const a = Buffer.from(String(stored || ""));
  const b = Buffer.from(String(given || ""));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { cleanMobile, mapsLink, buildFleetDispatchText, newLinkToken, tokenMatches };
