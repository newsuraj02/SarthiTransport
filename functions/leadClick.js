// WHATSAPP LINK REDIRECT (owner 2026-11-13): https://<site>/wa/customer and /wa/driver log one click and send the visitor to wa.me with a ready-made Hindi message.
// Pure helpers (no Firebase) so the invariants can run them; the HTTP function itself is `waClick` in index.js.
const WHATSAPP_NUMBER = "917972399892";
const TEXT = { customer: "नमस्ते, मुझे गाड़ी बुक करनी है", driver: "नमस्ते, मुझे ड्राइवर बनना है" };

// "/wa/customer", "/wa/driver?src=ad" -> "customer" | "driver" | null
function roleFromWaPath(path) {
  const m = /^\/wa\/(customer|driver)\/?$/i.exec(String(path || "").split("?")[0]);
  return m ? m[1].toLowerCase() : null;
}
function whatsappUrl(role) { return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(TEXT[role === "driver" ? "driver" : "customer"])}`; }
// What is stored for one click: no person is known (plain WhatsApp has no API), only which link and when.
function clickDoc(role, query, nowMs) {
  const q = query || {};
  const src = String(q.src || "").toLowerCase().replace(/[^a-z]/g, "").slice(0, 12);
  return { role: role === "driver" ? "driver" : "customer", kind: src === "ad" ? "ad" : "whatsapp", via: "whatsapp-link", atMs: nowMs };
}
module.exports = { WHATSAPP_NUMBER, TEXT, roleFromWaPath, whatsappUrl, clickDoc };
