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
const DEFAULT_TEXT = {
  otp: "{#var#} is your Apna Transport OTP. Do not share it with anyone.",
  bookingConfirmed: "Apna Transport: Booking confirmed. Driver {#var#} ({#var#}) will reach you soon. Pickup OTP: {#var#}",
  newLoad: "Apna Transport: New load request from {#var#} to {#var#}. Open the app to accept.",
  kycReminder: "Apna Transport: Your KYC is incomplete. Complete it to receive loads: {#var#}",
};

const DEFAULT_API_URL = "https://iqsms.airtel.in/api/v1/send-prepaid-sms";
const DEFAULT_MESSAGE_TYPE = "SERVICE_IMPLICIT";

const VAR_RE = /\{#var#\}/gi;
const countVars = (text) => (String(text || "").match(VAR_RE) || []).length;

// Fills the {#var#} slots in order. Throws when the number of values is wrong -- sending a half-filled template would be rejected (or worse, delivered with "{#var#}" in it).
function renderTemplate(text, vars) {
  const list = Array.isArray(vars) ? vars.map((v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim()) : [];
  const n = countVars(text);
  if (n !== list.length) throw new Error(`template needs ${n} value(s), got ${list.length}`);
  let i = 0;
  return String(text).replace(VAR_RE, () => list[i++]);
}

const cleanMobile = (v) => String(v == null ? "" : v).replace(/\D/g, "").slice(-10);
const isIndianMobile = (m) => /^[6-9]\d{9}$/.test(String(m || ""));

// Normalises the Firestore document (never trusts its shape).
function normalizeConfig(doc) {
  const d = doc && typeof doc === "object" ? doc : {};
  const templates = {};
  for (const k of KINDS) {
    const t = (d.templates && d.templates[k]) || {};
    templates[k] = { id: String(t.id || "").trim(), text: String(t.text || "").trim() || DEFAULT_TEXT[k], enabled: t.enabled !== false };
  }
  return {
    entityId: String(d.entityId || "").trim(), header: String(d.header || "").trim(), customerId: String(d.customerId || "").trim(),
    apiUrl: String(d.apiUrl || "").trim() || DEFAULT_API_URL, messageType: String(d.messageType || "").trim() || DEFAULT_MESSAGE_TYPE,
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
function buildRequest(cfg, creds, { to, message, templateId }) {
  const auth = Buffer.from(`${creds.user}:${creds.password}`).toString("base64");
  const body = {
    ...(cfg.customerId ? { customerId: cfg.customerId } : {}),
    destinationAddress: [`91${to}`],
    message,
    sourceAddress: cfg.header,
    messageType: cfg.messageType,
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
  const req = buildRequest(cfg, creds, { to: mobile, message, templateId: t.template.id });
  try {
    const res = await fetchImpl(req.url, req.init);
    const verdict = judgeGatewayReply(res.status, await res.text());
    return verdict.ok ? { ok: true, detail: verdict.detail } : { ok: false, reason: "gateway", detail: verdict.detail };
  } catch (e) {
    return { ok: false, reason: "network", detail: `Could not reach the SMS gateway: ${e && e.message}` };
  }
}

module.exports = { KINDS, DEFAULT_TEXT, DEFAULT_API_URL, DEFAULT_MESSAGE_TYPE, countVars, renderTemplate, cleanMobile, isIndianMobile, normalizeConfig, templateFor, buildRequest, judgeGatewayReply, sendDltSms };
