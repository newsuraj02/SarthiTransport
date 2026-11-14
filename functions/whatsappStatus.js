// WHATSAPP DELIVERY TICKS (owner 2026-11-14: "the WhatsApp bulk message must have a sent and read mark just like WhatsApp does on every single entry ... double tick
// send and double blue tick read"). MSG91 only says "accepted" when we send; the real Sent / Delivered / Read / Failed news arrives LATER, one event per recipient, on a
// webhook (MSG91 dashboard -> Webhooks -> WhatsApp "Outbound Report"). This file is the pure part: read a (loosely specified) MSG91 report, and merge it into the stored
// per-driver state so a status only ever moves FORWARD (read never falls back to sent because an old "sent" event arrived late).
//
// State per driver:  whatsappStatus/{mobile} = { mobile, lastKind, updatedAt, byKind: { <kind>: { status, batchId, requestId, submittedAt, sentAt, deliveredAt, readAt, failedAt, reason } } }
//   status: "submitted" (MSG91 accepted it) -> "sent" (WhatsApp took it, one tick) -> "delivered" (on the phone, two grey ticks) -> "read" (two BLUE ticks); or "failed".
const crypto = require("crypto");

const RANK = { submitted: 1, sent: 2, delivered: 3, read: 4 };

const mobile10 = (v) => String(v == null ? "" : v).replace(/\D/g, "").slice(-10);

// MSG91's wording varies by webhook generation ("Delivered", "message_delivered", "seen", "undelivered"): map them all to our five words.
function normalizeStatus(raw) {
  const s = String(raw == null ? "" : raw).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!s) return null;
  if (/(^|_)(fail|failed|failure|undelivered|error|rejected|expired)(_|$)/.test(s)) return "failed";
  if (/(^|_)(read|seen)(_|$)/.test(s)) return "read";
  if (/(^|_)delivered(_|$)/.test(s)) return "delivered";
  if (/(^|_)sent(_|$)/.test(s)) return "sent";
  if (/(^|_)(submitted|queued|accepted|pending|processing)(_|$)/.test(s)) return "submitted";
  return null;
}

const firstOf = (o, keys) => { for (const k of keys) { if (o && o[k] != null && o[k] !== "") return o[k]; } return undefined; };

function toMs(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
  const n = Number(v);
  if (Number.isFinite(n) && String(v).trim() !== "") return n < 1e12 ? n * 1000 : n;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

// Turns whatever MSG91 posted (one object, an array, or { data: [...] } / { events: [...] }) into [{ mobile, status, at, uuid, requestId, reason }].
// An item with no recognisable number or status is skipped, never guessed.
function parseMsg91Reports(body, now = Date.now()) {
  let root = body;
  if (typeof root === "string") { try { root = JSON.parse(root); } catch { return []; } }
  const items = [];
  const walk = (x) => {
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (!x || typeof x !== "object") return;
    const nested = firstOf(x, ["data", "events", "reports", "messages", "payload"]);
    const hasOwn = firstOf(x, ["status", "message_status", "messageStatus", "state", "eventName", "event"]) !== undefined && firstOf(x, ["mobile", "customer_number", "customerNumber", "recipient", "recipient_number", "to", "phone", "wa_id", "number"]) !== undefined;
    if (hasOwn) items.push(x);
    else if (nested && typeof nested === "object") walk(nested);
  };
  walk(root);
  const out = [];
  for (const it of items) {
    const status = normalizeStatus(firstOf(it, ["status", "message_status", "messageStatus", "state"])) || normalizeStatus(firstOf(it, ["eventName", "event"]));
    const mobile = mobile10(firstOf(it, ["mobile", "customer_number", "customerNumber", "recipient", "recipient_number", "to", "phone", "wa_id", "number"]));
    if (!status || mobile.length !== 10) continue;
    const reasonRaw = firstOf(it, ["reason", "failure_reason", "failureReason", "error", "errors", "errorMessage", "error_message", "description"]);
    out.push({
      mobile, status,
      at: toMs(firstOf(it, ["timestamp", "time", "delivered_at", "read_at", "sent_at", "submitted_at", "updated_at", "created_at", "date"])) || now,
      uuid: String(firstOf(it, ["uuid", "message_uuid", "messageId", "message_id", "wamid", "id"]) || ""),
      requestId: String(firstOf(it, ["requestId", "request_id"]) || ""),
      reason: reasonRaw == null ? "" : (typeof reasonRaw === "string" ? reasonRaw : JSON.stringify(reasonRaw)).slice(0, 200),
    });
  }
  return out;
}

// The new state of one driver's one-kind message after an event. Forward only: read > delivered > sent > submitted; "failed" only replaces a state that was not yet
// delivered / read (a late failure notice for a message already delivered is ignored); a read / delivered event also fills the earlier timestamps.
function mergeMessageState(prev, ev) {
  const cur = prev && typeof prev === "object" ? { ...prev } : {};
  const curRank = RANK[cur.status] || 0;
  const at = ev.at;
  if (ev.status === "failed") {
    if (curRank >= RANK.delivered) return cur;
    return { ...cur, status: "failed", failedAt: at, reason: ev.reason || cur.reason || "" };
  }
  const rank = RANK[ev.status] || 0;
  if (!rank) return cur;
  const next = { ...cur };
  if (rank >= RANK.sent && !next.sentAt) next.sentAt = at;
  if (rank >= RANK.delivered && !next.deliveredAt) next.deliveredAt = at;
  if (rank >= RANK.read && !next.readAt) next.readAt = at;
  if (rank > curRank || cur.status === "failed") { next.status = ev.status; if (cur.status === "failed") { delete next.failedAt; delete next.reason; } }
  return next;
}

// A fresh send (new batch) starts the driver's tick over at "submitted"; a failed chunk writes "failed" with the reason Admin already sees.
function submittedState(batchId, requestId, at) { return { status: "submitted", batchId, requestId: requestId || "", submittedAt: at }; }
function failedSendState(batchId, reason, at) { return { status: "failed", batchId, submittedAt: at, failedAt: at, reason: String(reason || "").slice(0, 200) }; }

// The webhook URL carries a token derived from the MSG91 auth key (an existing secret -> no new secret to create before deploying). Anyone without the key cannot forge ticks.
function webhookToken(authKey) { return crypto.createHash("sha256").update(`${authKey}:whatsapp-status-webhook`).digest("hex").slice(0, 32); }
function tokenMatches(given, authKey) {
  const a = Buffer.from(String(given || "")), b = Buffer.from(webhookToken(authKey));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// requestId out of MSG91's bulk reply (field names differ between API generations); "" when it gives none.
function requestIdFromReply(bodyText) {
  let j = null; try { j = JSON.parse(String(bodyText || "")); } catch { return ""; }
  const v = firstOf(j, ["request_id", "requestId"]) ?? firstOf(j && j.data, ["request_id", "requestId"]) ?? firstOf(j, ["message_uuid", "uuid"]);
  return v == null ? "" : String(v);
}

module.exports = { RANK, mobile10, normalizeStatus, parseMsg91Reports, mergeMessageState, submittedState, failedSendState, webhookToken, tokenMatches, requestIdFromReply };
