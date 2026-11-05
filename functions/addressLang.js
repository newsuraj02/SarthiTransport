/**
 * Address-language service (owner 2026-10-31, from the developer brief "Address Language Fix").
 *
 * Every address shown in the Pickup / Drop boxes is produced ON THE SERVER in the user's selected language. Any English
 * (Latin) words Google still returns are transliterated into the selected script (Devanagari for Hindi and Marathi).
 *
 * This file is pure logic with injected dependencies (fetch, cache, Maps key) so it can be tested without Firebase;
 * functions/index.js wires it to Firestore + the MAPS_KEY secret and exposes getAddress / searchPlaces / getPlace.
 *
 * NOTE: an earlier home-made transliteration was removed from the app (it produced broken text). This one uses Google's
 * own Input Tools transliteration. If it ever misbehaves, set TRANSLITERATE_ENABLED to false and redeploy functions --
 * addresses then come back exactly as Google returns them (still in the requested language where Google has it).
 */

const TRANSLITERATE_ENABLED = true;
const SUPPORTED = ["hi", "en", "mr", "gu", "pa", "bn"];
const DEFAULT_LANG = "hi";
const LANG_ALIASES = {
  hindi: "hi", "हिंदी": "hi", "हिन्दी": "hi",
  english: "en", "इंग्लिश": "en", "अंग्रेजी": "en",
  marathi: "mr", "मराठी": "mr",
  gujarati: "gu", "ગુજરાતી": "gu",
  punjabi: "pa", "ਪੰਜਾਬੀ": "pa",
  bengali: "bn", "বাংলা": "bn",
};

class GeoError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function normalizeLang(value) {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  if (LANG_ALIASES[v]) return LANG_ALIASES[v];
  const two = v.slice(0, 2);
  return SUPPORTED.includes(two) ? two : null;
}
// The language the app sends wins; otherwise Hindi.
function resolveLang(requested) { return normalizeLang(requested) || DEFAULT_LANG; }

function createAddressService({ fetchFn, mapsKey, cache }) {
  const wordCache = new Map();

  async function transliterateWord(word, lang) {
    const key = `${lang}:${word.toLowerCase()}`;
    if (wordCache.has(key)) return wordCache.get(key);
    let out = word;
    try {
      const url = `https://inputtools.google.com/request?text=${encodeURIComponent(word)}&itc=${lang}-t-i0-und&num=1&ie=utf-8&oe=utf-8`;
      const r = await fetchFn(url);
      const j = await r.json();
      if (j[0] === "SUCCESS" && j[1]?.[0]?.[1]?.[0]) out = j[1][0][1][0];
    } catch (e) { /* keep the original word if the service fails */ }
    wordCache.set(key, out);
    return out;
  }

  // Latin words -> the selected script. Digits, punctuation and already-native text are left alone.
  async function toScript(text, lang) {
    if (!text || lang === "en" || !TRANSLITERATE_ENABLED || !/[A-Za-z]/.test(text)) return text || "";
    const words = [...new Set(text.match(/[A-Za-z]+/g))];
    const map = {};
    await Promise.all(words.map(async (w) => { map[w] = await transliterateWord(w, lang); }));
    return text.replace(/[A-Za-z]+/g, (w) => map[w] || w);
  }

  // Google plus codes ("JQ38+PRM") are not place names -- same cleanup the app does everywhere.
  const stripPlusCode = (t) => (t || "").replace(/\b[A-Z0-9]{4,8}\+[A-Z0-9]{2,3}\b,?\s*/gi, "").replace(/^,\s*/, "").replace(/,\s*,/g, ",").trim();

  async function getAddress(lat, lng, lang) {
    const cacheId = `${lang}_${lat.toFixed(4)}_${lng.toFixed(4)}`;
    const hit = await cache.get(cacheId);
    if (hit?.address) return { address: hit.address, placeId: hit.placeId || null };
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=${lang}&region=in&key=${mapsKey()}`;
    const j = await (await fetchFn(url)).json();
    if (j.status !== "OK" || !j.results?.length) throw new GeoError("not-found", `Geocode failed: ${j.status}`);
    const address = await toScript(stripPlusCode(j.results[0].formatted_address), lang);
    const placeId = j.results[0].place_id || null;
    await cache.set(cacheId, { address, placeId, lang, lat, lng });
    return { address, placeId };
  }

  async function getPlace(placeId, lang, sessionToken) {
    const cacheId = `${lang}_place_${placeId}`;
    const hit = await cache.get(cacheId);
    if (hit?.place) return hit.place;
    const qs = new URLSearchParams({ languageCode: lang, regionCode: "IN" });
    if (sessionToken) qs.set("sessionToken", sessionToken);
    const r = await fetchFn(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?${qs}`, {
      headers: { "X-Goog-Api-Key": mapsKey(), "X-Goog-FieldMask": "id,displayName,formattedAddress,location" },
    });
    const j = await r.json();
    if (!r.ok) throw new GeoError("not-found", j.error?.message || "Place not found");
    const place = {
      placeId: j.id,
      name: await toScript(stripPlusCode(j.displayName?.text || ""), lang),
      address: await toScript(stripPlusCode(j.formattedAddress || ""), lang),
      lat: j.location?.latitude,
      lng: j.location?.longitude,
    };
    await cache.set(cacheId, { place, lang });
    return place;
  }

  // One autocomplete call, the way Google Maps itself does it. `biasKm` (max 50 -- Google's limit for a circle) = a SOFT preference for places near (lat,lng):
  // nearer matches rank higher but a better match farther away still shows. We never use locationRestriction (a hard box): it hides the right place whenever it is
  // outside the box and, merged with other boxes, produced the vague lists the owner reported (2026-11-04).
  async function autocompleteOnce(input, lang, sessionToken, lat, lng, area) {
    const body = { input, languageCode: lang, includedRegionCodes: ["in"] };
    if (sessionToken) body.sessionToken = sessionToken;
    // `origin` only makes Google return distanceMeters (straight-line, from the customer) so the app can show "N km"; it does not change which places come back.
    if (typeof lat === "number" && typeof lng === "number") body.origin = { latitude: lat, longitude: lng };
    if (area && area.biasKm && typeof lat === "number" && typeof lng === "number") {
      body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: Math.min(area.biasKm, 50) * 1000 } };
    }
    const r = await fetchFn("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": mapsKey() },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) throw new GeoError("internal", j.error?.message || "Autocomplete failed");
    return (j.suggestions || []).filter((s) => s.placePrediction).map((s) => s.placePrediction);
  }

  // Owner 2026-11-04 (replaces the nearest-first multi-box search): the suggestions under Pickup / Drop must work EXACTLY like Google Maps -- two or three letters
  // of the first word already show the place you mean. Google Maps asks Autocomplete ONCE per keystroke with a soft location bias and shows Google's own relevance
  // order (prefix matches, popularity, nearness together). So do we: ONE call, bias circle around the reference point (the customer for Pickup, the pickup for Drop),
  // Google's order untouched, the km label from `origin`. No distance re-sorting, no hard areas, no padding with weaker matches.
  const BIAS_KM = 50;
  const MAX_RESULTS = 8;
  async function searchPlaces(input, lang, sessionToken, lat, lng) {
    const hasPoint = typeof lat === "number" && typeof lng === "number";
    const list = await autocompleteOnce(input, lang, sessionToken, lat, lng, hasPoint ? { biasKm: BIAS_KM } : null);
    const seen = new Set(); const preds = [];
    for (const p of list) { if (p?.placeId && !seen.has(p.placeId)) { seen.add(p.placeId); preds.push(p); } }
    return Promise.all(preds.slice(0, MAX_RESULTS).map(async (p) => ({
      placeId: p.placeId,
      main: await toScript(stripPlusCode(p.structuredFormat?.mainText?.text || p.text?.text || ""), lang),
      secondary: await toScript(stripPlusCode(p.structuredFormat?.secondaryText?.text || ""), lang),
      full: await toScript(stripPlusCode(p.text?.text || ""), lang),
      distanceKm: typeof p.distanceMeters === "number" ? Math.round(p.distanceMeters / 100) / 10 : null,
    })));
  }

  return { getAddress, getPlace, searchPlaces, toScript };
}

module.exports = { createAddressService, normalizeLang, resolveLang, GeoError, SUPPORTED, DEFAULT_LANG };
