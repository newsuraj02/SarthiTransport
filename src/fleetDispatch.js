// The message a fleet driver (no app) gets on WhatsApp / SMS when the owner assigns a vehicle to a trip (owner 2026-11-08):
// pickup, drop, the customer's mobile, the owner's mobile -- plus the trip link (OTP / delivered, no app needed) and map links.
// MIRRORED by functions/fleetDispatch.js (the server sends the same text through MSG91); an invariant compares the two.
const cleanMobile = (m) => String(m || "").replace(/\D/g, "").slice(-10);

export function mapsLink(lat, lng) {
  return lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? `https://maps.google.com/?q=${Number(lat)},${Number(lng)}` : "";
}

export function buildFleetDispatchText({ booking, ownerName, ownerMobile, link }) {
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

export function whatsappLink(driverMobile, text) {
  const m = cleanMobile(driverMobile);
  return m.length === 10 ? `https://wa.me/91${m}?text=${encodeURIComponent(text)}` : "";
}
