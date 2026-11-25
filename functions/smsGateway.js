// DLT SMS (owner 2026-11-25: "implement the DLT SMS in the app ... Signup / Login OTP, Booking confirmed, New load and KYC reminder ... I don't want any more connection with MSG91").
// Everything that decides how an SMS is built and judged lives here, pure (no Firebase, `fetch` is passed in), so scripts/serverTests/smsGateway.cjs runs the real thing.
//
// India's rules (TRAI DLT): an SMS only goes out if it carries the sender's ENTITY ID, a registered HEADER (sender name) and the TEMPLATE ID of a registered template, and its text matches
// that template exactly (only the {#var#} parts may differ). So the app keeps, per message kind, the template's id AND its exact text, and fills the variables in order.
// Configuration lives in Firestore `smsConfig/main` (Admin-only, edited in Admin -> Settings -> "SMS (DLT)"); the gateway login is two Firebase secrets (SMS_API_USER, SMS_API_PASSWORD).
//
// THE GATEWAY: written for the Airtel IQ SMS API (iqsms.airtel.in, HTTP Basic login, DLT fields entityId / dltTemplateId). The exact field names below follow Airtel's published
// description but could NOT be tested from here against a live account -- Admin -> Settings -> "Send test SMS" shows the gateway's own reply, so a wrong field shows up as a readable
// error on the first test and is fixed in ONE place (`buildRequest`). A different DLT gateway only needs `buildRequest` / `judgeGatewayReply` changed.

const KINDS = ["otp", "bookingConfirmed", "newLoad", "kycReminder"];

// The wording suggested for registration on the DLT portal (owner may have registered different words -- paste the REAL registered text in Admin; this is only the default).
// These are the REGISTERED templates (APTRNS, owner 2026-11-25): OTP_LOGIN_V3 (Transactional), BOOKING_CONFIRMED_V2, DRIVER_NEW_LOAD_V2, DRIVER_KYC_REMINDER_V2 (Service Implicit).
const DEFAULT_TEXT = {
  otp: "{#numeric#} is your OTP for Apna Transport. Do not share it with anyone. Valid for 10 minutes.",
  bookingConfirmed: "Your Apna Transport booking is confirmed. Driver {#alphanumeric#} and vehicle {#alphanumeric#}. Open the app to track your trip.",
  newLoad: "New load on Apna Transport: pickup {#alphanumeric#}, drop {#alphanumeric#}. Open the app to accept.",
  kycReminder: "Dear {#alphanumeric#}, your Apna Transport KYC is incomplete. Complete it in the app to start getting loads.",
};
// DLT message type per kind (what the gateway calls it); a saved per-message value in Admin wins.
const DEFAULT_TYPE = { otp: "TRANSACTIONAL", bookingConfirmed: "SERVICE_IMPLICIT", newLoad: "SERVICE_IMPLICIT", kycReminder: "SERVICE_IMPLICIT" };

const DEFAULT_API_URL = "https://iqsms.airtel.in/api/v1/send-prepaid-sms";

// A DLT template's variable slots: {#numeric#}, {#alphanumeric#}, {#var#} (anything), {#url#}, {#email#}...
const VAR_RE = /\{#([a-z0-9_]+)#\}/gi;
const countVars = (text) => (String(text || "").match(VAR_RE) || []).length;

// A value must look like what its slot allows, or the operator's scrubbing rejects the whole message: {#numeric#} = digits only; {#alphanumeric#} = letters, digits and single spaces
// (anything else, e.g. commas / brackets / Devanagari, is dropped), at most 30 characters; any other slot takes the text as it is.
function cleanVar(value, kind) {
  const s = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const k = String(kind || "").toLowerCase();
  if (k === "numeric") return s.replace(/\D/g, "").slice(0, 30);
  if (k === "alphanumeric") return s.replace(/[^A-Za-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 30).trim();
  return s;
}

// Fills the slots in order. Throws when the number of values is wrong or a value is empty after cleaning -- a half-filled template would be rejected (or delivered with "{#...#}" in it).
function renderTemplate(text, vars) {
  const list = Array.isArray(vars) ? vars : [];
  const n = countVars(text);
  if (n !== list.length) throw new Error(`template needs ${n} value(s), got ${list.length}`);
  let i = 0; let empty = false;
  const out = String(text).replace(VAR_RE, (_m, kind) => { const v = cleanVar(list[i++], kind); if (!v) empty = true; return v; });
  if (empty) throw new Error("a value is empty (or has no letters / digits the template slot accepts)");
  return out;
}

const cleanMobile = (v) => String(v == null ? "" : v).replace(/\D/g, "").slice(-10);
const isIndianMobile = (m) => /^[6-9]\d{9}$/.test(String(m || ""));

// Normalises the Firestore document (never trusts its shape).
function normalizeConfig(doc) {
  const d = doc && typeof doc === "object" ? doc : {};
  const templates = {};
  for (const k of KINDS) {
    const t = (d.templates && d.templates[k]) || {};
    templates[k] = { id: String(t.id || "").trim(), text: String(t.text || "").trim() || DEFAULT_TEXT[k], enabled: t.enabled !== false, type: String(t.type || "").trim() || DEFAULT_TYPE[k] };
  }
  return {
    entityId: String(d.entityId || "").trim(), header: String(d.header || "").trim(), customerId: String(d.customerId || "").trim(),
    apiUrl: String(d.apiUrl || "").trim() || DEFAULT_API_URL,
    otpEnabled: d.otpEnabled === true, otpTestedAt: Number(d.otpTestedAt) || 0, dailyOtpCap: Math.max(Number(d.dailyOtpCap) || 3000, 1), templates,
  };
}

// -> { ok: true, template } | { ok: false, reason, detail }   reason: "not_configured" (no entity / header) | "no_template" (no id) | "disabled"
function templateFor(cfg, kind) {
  if (!cfg || !KINDS.includes(kind)) return { ok: false, reason: "no_template", detail: `Unknown message kind "${kind}".` };
  const missing = [!cfg.entityId && "Entity ID", !cfg.header && "Header (sender name)"].filter(Boolean);
  if (missing.length) return { ok: false, reason: "not_configured", detail: `SMS is not set up yet: missing ${missing.join(" and ")} in Admin -> Settings -> SMS (DLT).` };
  const t = cfg.templates[kind];
  if (!t.id) return { ok: false, reason: "no_template", detail: `No DLT Template ID saved for "${kind}".` };
  if (!t.enabled) return { ok: false, reason: "disabled", detail: `"${kind}" SMS is switched off.` };
  return { ok: true, template: t };
}

// The HTTP request for the gateway. ONE place to adapt if the gateway wants other field names.
function buildRequest(cfg, creds, { to, message, templateId, messageType }) {
  const auth = Buffer.from(`${creds.user}:${creds.password}`).toString("base64");
  const body = {
    ...(cfg.customerId ? { customerId: cfg.customerId } : {}),
    destinationAddress: [`91${to}`],
    message,
    sourceAddress: cfg.header,
    messageType,
    dltTemplateId: templateId,
    entityId: cfg.entityId,
  };
  return { url: cfg.apiUrl, init: { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Basic ${auth}` }, body: JSON.stringify(body) } };
}

// A gateway can answer HTTP 200 and still have refused the message in the body -- that is a failure too.
function judgeGatewayReply(httpStatus, bodyText) {
  const text = String(bodyText == null ? "" : bodyText).slice(0, 600);
  let j = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  if (httpStatus < 200 || httpStatus >= 300) return { ok: false, detail: `HTTP ${httpStatus}: ${text}` };
  if (j && typeof j === "object") {
    const st = String(j.status != null ? j.status : j.Status != null ? j.Status : j.result != null ? j.result : "").toLowerCase();
    if (j.success === false || /^(fail|failed|failure|error|rejected)$/.test(st) || j.error || j.errors) return { ok: false, detail: `Gateway refused it: ${text}` };
  } else if (/(^|[^a-z])(error|fail|invalid|rejected|unauthori[sz]ed)([^a-z]|$)/i.test(text)) return { ok: false, detail: `Gateway said: ${text}` };
  return { ok: true, detail: text };
}

// Sends ONE message. `fetchImpl` is `fetch`. Never throws. -> { ok, reason?, detail }
async function sendDltSms({ cfg, creds, kind, to, vars, fetchImpl }) {
  const mobile = cleanMobile(to);
  if (!isIndianMobile(mobile)) return { ok: false, reason: "bad_number", detail: "That is not a valid Indian mobile number." };
  const t = templateFor(cfg, kind);
  if (!t.ok) return t;
  if (!creds || !creds.user || !creds.password) return { ok: false, reason: "no_credentials", detail: `The SMS gateway login is not set (missing: ${[!creds?.user && "SMS_API_USER", !creds?.password && "SMS_API_PASSWORD"].filter(Boolean).join(", ")}).` };
  let message;
  try { message = renderTemplate(t.template.text, vars); } catch (e) { return { ok: false, reason: "bad_template", detail: e.message }; }
  const req = buildRequest(cfg, creds, { to: mobile, message, templateId: t.template.id, messageType: t.template.type });
  try {
    const res = await fetchImpl(req.url, req.init);
    const verdict = judgeGatewayReply(res.status, await res.text());
    return verdict.ok ? { ok: true, detail: verdict.detail } : { ok: false, reason: "gateway", detail: verdict.detail };
  } catch (e) {
    return { ok: false, reason: "network", detail: `Could not reach the SMS gateway: ${e && e.message}` };
  }
}

module.exports = { KINDS, DEFAULT_TEXT, DEFAULT_TYPE, DEFAULT_API_URL, countVars, cleanVar, renderTemplate, cleanMobile, isIndianMobile, normalizeConfig, templateFor, buildRequest, judgeGatewayReply, sendDltSms };
