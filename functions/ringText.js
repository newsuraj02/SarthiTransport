/**
 * Text for the driver's ring screen (owner 2026-10-31: show customer name, fare and est. km as well).
 *
 * The installed Android ring screen (RingingBookingActivity) can only show three text fields -- pickup, drop and weight --
 * and appends " किग्रा" to the weight. A new native build was ruled out, so the extra details are written INTO the weight
 * text on the server: customer, fare and distance lines first, then "वज़न: <weight>" last so the app's own " किग्रा" suffix
 * ends the weight line. Each line is left out when the booking has no such value.
 */
// "2026-11-05 07:00" (what an Advance booking stores in scheduledFor) -> "5 Nov 2026, 7:00 AM". Anything else is shown as it is.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatScheduledFor(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(value || "").trim());
  if (!m) return String(value || "").trim();
  const h = Number(m[4]);
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] || m[2]} ${m[1]}, ${h % 12 || 12}:${m[5]} ${h < 12 ? "AM" : "PM"}`;
}

function ringWeightText(load) {
  const lines = [];
  // Owner 2026-11-01: an ADVANCE booking says WHEN the trip is -- very first line (Current bookings have no scheduledFor).
  if (load?.scheduledFor) lines.push(`📅 एडवांस ट्रिप: ${formatScheduledFor(load.scheduledFor)}`);
  // Owner 2026-11-01: a customer who ticked "Round trip" -- FIRST line, so it cannot be missed; the fare below is then the TOTAL
  // (one way + return).
  if (load?.returnTrip) lines.push("↔ राउंड ट्रिप (आना-जाना)");
  const name = String(load?.customerName || "").trim();
  if (name) lines.push(`ग्राहक: ${name}`);
  const fare = Math.round(Number(load?.fare));
  if (fare > 0) lines.push(`भाड़ा: ₹${fare}`);
  const km = Number(load?.distance);
  if (km > 0) lines.push(`अनुमानित दूरी: ${Number.isInteger(km) ? km : km.toFixed(1)} किमी`);
  const weight = load?.weight ? String(load.weight) : "-";
  // Nothing extra to show: keep exactly what older pushes sent.
  if (!lines.length) return weight;
  lines.push(`वज़न: ${weight}`);
  return lines.join("\n");
}

module.exports = { ringWeightText, formatScheduledFor };
