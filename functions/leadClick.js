// WHATSAPP LINK REDIRECT (owner 2026-11-13): https://<site>/wa/customer and /wa/driver send the visitor to wa.me with a ready-made Hindi message.
// (The click log for Admin -> Leads was REMOVED 2026-11-23 -- owner: "it doesnt actually help in anything"; the links themselves still work.)
// Pure helpers (no Firebase) so the invariants can run them; the HTTP function itself is `waClick` in index.js.
const WHATSAPP_NUMBER = "917972399892";
const TEXT = { customer: "नमस्ते, मुझे गाड़ी बुक करनी है", driver: "नमस्ते, मुझे ड्राइवर बनना है" };

// "/wa/customer", "/wa/driver?src=ad" -> "customer" | "driver" | null
function roleFromWaPath(path) {
  const m = /^\/wa\/(customer|driver)\/?$/i.exec(String(path || "").split("?")[0]);
  return m ? m[1].toLowerCase() : null;
}
function whatsappUrl(role) { return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(TEXT[role === "driver" ? "driver" : "customer"])}`; }
module.exports = { WHATSAPP_NUMBER, TEXT, roleFromWaPath, whatsappUrl };
