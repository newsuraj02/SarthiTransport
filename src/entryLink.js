// DEEP LINKS + LEAD SOURCE (owner 2026-11-13, "2 deep links: /customer and /driver ... customer sees only customer, driver only driver ... Admin must know who came from where").
// Pure (no React, no Firebase) so the invariants can run it.
//
//  - https://<site>/customer and /driver are the two entry links. `?src=ad` marks a link used in an advertisement; a plain link counts as a "deeplink".
//  - Inside the installed app a link LOCKS the phone to that role (the other role's buttons are never shown). In a plain browser the link sends the person to the Play Store with
//    the role + source in the Play "referrer" (read on first launch by the native build, see docs/SYSTEM_CONTRACTS.md N20).
//  - The source is saved on the new account (`leadSource`) so Admin -> Leads can show Name | Phone | Type | Source | Date | Time.

export const ENTRY_ROLES = ["customer", "driver"];
export const LEAD_KINDS = ["ad", "deeplink", "whatsapp", "organic"];
export const PLAY_PACKAGE = "com.apnatransport.app";
export const ENTRY_LINK_WINDOW_MS = 10 * 60 * 1000; // an account created up to 10 min BEFORE the stored click still counts (clock / write order slack)

const clean = (v, n = 60) => String(v == null ? "" : v).replace(/[^\w.\- ]/g, "").slice(0, n);

// "/customer", "/driver/", "/customer/anything" -> role; anything else -> null.
export function roleFromPath(pathname) {
  const m = /^\/(customer|driver)(\/|$)/i.exec(String(pathname || ""));
  return m ? m[1].toLowerCase() : null;
}

// -> { role, kind, link, utm } or null when the URL is not an entry link.
//    kind: "ad" when ?src=ad (or any utm_medium of paid / cpc / ad / ads), "whatsapp" when ?src=whatsapp, otherwise "deeplink".
export function parseEntryLink(pathname, search = "") {
  const role = roleFromPath(pathname);
  if (!role) return null;
  const p = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const src = clean(p.get("src"), 20).toLowerCase();
  const medium = clean(p.get("utm_medium"), 30).toLowerCase();
  const kind = src === "ad" || /^(paid|cpc|ad|ads|paid_social)$/.test(medium) ? "ad" : src === "whatsapp" ? "whatsapp" : "deeplink";
  const utm = {};
  ["utm_source", "utm_medium", "utm_campaign"].forEach((k) => { const v = clean(p.get(k), 60); if (v) utm[k] = v; });
  return { role, kind, link: role, utm };
}

// Same thing from a full URL (the app's `appUrlOpen` event gives one).
export function parseEntryUrl(url) {
  try { const u = new URL(String(url)); return parseEntryLink(u.pathname, u.search); } catch { return null; }
}

// The Play Store URL a browser visitor is sent to; the referrer carries what the link said (Play passes it to the app on first launch).
export function playStoreUrlFor(entry, base = `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`) {
  if (!entry) return base;
  const parts = [`role=${entry.role}`, `src=${entry.kind}`];
  Object.keys(entry.utm || {}).forEach((k) => parts.push(`${k}=${encodeURIComponent(entry.utm[k])}`));
  return `${base}&referrer=${encodeURIComponent(parts.join("&"))}`;
}

// Parse a Play install referrer string back ("role=customer&src=deeplink&utm_source=facebook") -> the same entry shape, or null.
export function parseReferrer(referrer) {
  const p = new URLSearchParams(String(referrer || ""));
  const role = clean(p.get("role"), 12).toLowerCase();
  if (!ENTRY_ROLES.includes(role)) return null;
  const src = clean(p.get("src"), 20).toLowerCase();
  const utm = {};
  ["utm_source", "utm_medium", "utm_campaign"].forEach((k) => { const v = clean(p.get(k), 60); if (v) utm[k] = v; });
  return { role, kind: LEAD_KINDS.includes(src) ? src : "deeplink", link: role, utm };
}

// What is stored on the phone until the person signs up ({ role, kind, link, utm, at }).
export function storedLeadSource(entry, now = Date.now()) {
  return entry ? { role: entry.role, kind: entry.kind, link: entry.link, utm: entry.utm || {}, at: now } : null;
}

// The field written on the NEW account (customers/{mobile} or drivers/{mobile}). Only when the stored click belongs to this role and the account was created after it.
export function leadSourceForAccount(stored, accountRole, accountCreatedMs) {
  if (!stored || !stored.role || stored.role !== accountRole) return null;
  const created = Number(accountCreatedMs) || 0;
  if (!created || created < Number(stored.at || 0) - ENTRY_LINK_WINDOW_MS) return null;
  return { kind: LEAD_KINDS.includes(stored.kind) ? stored.kind : "deeplink", link: stored.link || accountRole, utm: stored.utm || {}, at: Number(stored.at) || created };
}

// The WhatsApp message each link pre-fills (owner: Hindi text), and the redirect URL (the server builds the same).
export const WHATSAPP_NUMBER = "917972399892";
export const WHATSAPP_TEXT = { customer: "नमस्ते, मुझे गाड़ी बुक करनी है", driver: "नमस्ते, मुझे ड्राइवर बनना है" };
export const whatsappUrlFor = (role) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_TEXT[role === "driver" ? "driver" : "customer"])}`;

// What Admin shows in the Source column.
export function leadKindLabel(kind, lang = "en") {
  const t = {
    ad: ["Advertisement", "विज्ञापन", "जाहिरात"], deeplink: ["Deep link", "डीप लिंक", "डीप लिंक"],
    whatsapp: ["WhatsApp", "व्हाट्सऐप", "व्हॉट्सअ‍ॅप"], organic: ["Other / unknown", "अन्य / पता नहीं", "इतर / माहीत नाही"],
  }[LEAD_KINDS.includes(kind) ? kind : "organic"];
  return lang === "en" ? t[0] : lang === "mr" ? t[2] : t[1];
}
