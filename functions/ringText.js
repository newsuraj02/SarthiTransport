/**
 * Text for the driver's ring screen (owner 2026-10-31: show customer name, fare and est. km as well).
 *
 * The installed Android ring screen (RingingBookingActivity) can only show three text fields -- pickup, drop and weight --
 * and appends " किग्रा" to the weight. A new native build was ruled out, so the extra details are written INTO the weight
 * text on the server: customer, fare and distance lines first, then "वज़न: <weight>" last so the app's own " किग्रा" suffix
 * ends the weight line. Each line is left out when the booking has no such value.
 */
function ringWeightText(load) {
  const lines = [];
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

module.exports = { ringWeightText };
