// Runs the REAL `sendBulkDriverWhatsApp`, `msg91WhatsAppStatus` (the webhook) and `getWhatsAppWebhookInfo` (functions/index.js) against a tiny fake Firestore + a fake MSG91 -- no Firebase,
// no network (owner 2026-11-14: WhatsApp delivery ticks). Every line must say "ok"; exit code 1 otherwise. verifyInvariants.mjs runs this ("WHATSAPP DELIVERY TICKS").
const Module = require("module");
const path = require("path");
const store = {};
const col = (n) => (store[n] ||= new Map());
const STAMP = { __ts: true };
class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const deepMerge = (a, b) => { const o = { ...(a || {}) }; for (const [k, v] of Object.entries(b || {})) o[k] = v && typeof v === "object" && !Array.isArray(v) && !v.__ts && !v.__inc ? deepMerge(o[k], v) : v; return o; };
const applyInc = (cur, patch) => { const o = {}; for (const [k, v] of Object.entries(patch)) o[k] = v && v.__inc ? (Number(cur && cur[k]) || 0) + v.__inc : v; return o; };
const docRef = (name, id) => ({
  _name: name, _id: id,
  async get() { const d = col(name).get(id); return { exists: !!d, id, data: () => d }; },
  async update(patch) { const cur = JSON.parse(JSON.stringify(col(name).get(id) || {})); for (const [k, v] of Object.entries(patch)) { const parts = k.split("."); let o = cur; parts.slice(0, -1).forEach((q) => { o = o[q] = o[q] || {}; }); o[parts[parts.length - 1]] = v; } col(name).set(id, cur); },
  async set(data, opts) { const cur = col(name).get(id); col(name).set(id, opts && opts.merge ? deepMerge(cur, applyInc(cur, data)) : data); },
});
const fakeDb = {
  collection: (name) => ({ doc: (id) => docRef(name, id) }),
  batch() { const ops = []; return { set(ref, data, opts) { ops.push(["set", ref, data, opts]); }, update(ref, patch) { ops.push(["update", ref, patch]); }, async commit() { for (const [kind, ref, a, b] of ops) await (kind === "set" ? ref.set(a, b) : ref.update(a)); } }; },
  async runTransaction(fn) { return fn({ get: (ref) => ref.get(), set: (ref, data, opts) => ref.set(data, opts) }); },
};
const real = Module._load;
Module._load = function (req) {
  if (req === "firebase-functions/v2/https") return { onCall: (o, fn) => fn, onRequest: (o, fn) => fn, HttpsError };
  if (req === "firebase-functions/v2/firestore") return { onDocumentCreated: () => ({}), onDocumentUpdated: () => ({}), onDocumentWritten: () => ({}) };
  if (req === "firebase-functions/v2/scheduler") return { onSchedule: () => ({}) };
  if (req === "firebase-functions/params") return { defineSecret: (n) => ({ value: () => (n === "MSG91_WHATSAPP_NUMBER" ? "919999999999" : n === "MSG91_WHATSAPP_NAMESPACE" ? "ns" : "authkey123") }) };
  if (req === "firebase-admin/app") return { initializeApp: () => ({}) };
  if (req === "firebase-admin/firestore") return { getFirestore: () => fakeDb, FieldValue: { serverTimestamp: () => STAMP, increment: (n) => ({ __inc: n }), arrayUnion: (...a) => a }, Timestamp: { now: () => ({}), fromMillis: () => ({}) } };
  if (req === "firebase-admin/auth") return { getAuth: () => ({}) };
  if (req.startsWith("firebase-") || req.startsWith("@google-cloud")) return new Proxy(function () {}, { get: (t, k) => (k === "then" ? undefined : () => ({})), apply: () => ({}) });
  return real.apply(this, arguments);
};
let msg91Reply = { status: 200, body: '{"status":"success","request_id":"REQ-1"}' };
const sentBodies = [];
global.fetch = async (url, init) => { sentBodies.push(JSON.parse(init.body)); return { status: msg91Reply.status, text: async () => msg91Reply.body }; };
process.env.GCLOUD_PROJECT = "demo-proj";
let fns;
try { fns = require(path.join(__dirname, "..", "..", "functions", "index.js")); } catch (e) { console.error("LOAD FAIL", e.message); process.exit(2); }
const wa = require(path.join(__dirname, "..", "..", "functions", "whatsappStatus.js"));
const admin = { auth: { token: { admin: true } } };
const hook = async (q, body, method = "POST") => { let code = 0, text = ""; await fns.msg91WhatsAppStatus({ method, query: q, body }, { status(c) { code = c; return this; }, send(t) { text = t; } }); return { code, text }; };
(async () => {
  const out = []; const ok = (name, c, x = "") => out.push([c ? "ok  " : "BUG?", name, String(x).slice(0, 160)]);
  const tok = wa.webhookToken("authkey123");
  // 1. non-admin refused
  let err; try { await fns.sendBulkDriverWhatsApp({ auth: { token: {} }, data: { kind: "offDuty", mobiles: ["9000000001"] } }); } catch (e) { err = e; }
  ok("non-admin refused", err && err.code === "permission-denied");
  // 2. a bulk send records a 'submitted' tick for every driver
  const r = await fns.sendBulkDriverWhatsApp({ ...admin, data: { kind: "offDuty", mobiles: ["9000000001", "9000000002", "9000000003"] } });
  ok("bulk send ok", r.ok && r.sent === 3, JSON.stringify(r));
  const d1 = col("whatsappStatus").get("9000000001");
  ok("each driver got a 'submitted' record with the request id", ["9000000001", "9000000002", "9000000003"].every((m) => { const d = col("whatsappStatus").get(m); return d && d.lastKind === "offDuty" && d.byKind.offDuty.status === "submitted" && d.byKind.offDuty.requestId === "REQ-1"; }), JSON.stringify(d1));
  // 3. the webhook
  ok("webhook without the token is refused", (await hook({}, {})).code === 403 && (await hook({ k: "wrong" }, {})).code === 403);
  ok("GET with the token answers ok (MSG91 URL check)", (await hook({ k: tok }, null, "GET")).code === 200);
  await hook({ k: tok }, { data: [{ mobile: "919000000001", status: "sent", requestId: "REQ-1" }, { mobile: "919000000002", status: "Delivered" }, { mobile: "919000000003", status: "failed", reason: "not on WhatsApp" }] });
  ok("sent / delivered / failed applied to the right drivers", col("whatsappStatus").get("9000000001").byKind.offDuty.status === "sent" && col("whatsappStatus").get("9000000002").byKind.offDuty.status === "delivered" && col("whatsappStatus").get("9000000003").byKind.offDuty.status === "failed" && /not on WhatsApp/.test(col("whatsappStatus").get("9000000003").byKind.offDuty.reason));
  await hook({ k: tok }, [{ mobile: "9000000002", status: "read" }, { mobile: "9000000001", status: "read" }]);
  ok("read -> two blue ticks (status read, delivered / sent stamped too)", ["9000000001", "9000000002"].every((m) => { const s = col("whatsappStatus").get(m).byKind.offDuty; return s.status === "read" && s.readAt && s.deliveredAt && s.sentAt; }));
  await hook({ k: tok }, { mobile: "9000000002", status: "sent" });
  ok("a late 'sent' never moves a read message back", col("whatsappStatus").get("9000000002").byKind.offDuty.status === "read");
  await hook({ k: tok }, { mobile: "9000000002", status: "failed", reason: "late" });
  ok("a late 'failed' never overrides a read message", col("whatsappStatus").get("9000000002").byKind.offDuty.status === "read");
  await hook({ k: tok }, { mobile: "9777777777", status: "read" });
  ok("an event for a number we never messaged creates nothing", !col("whatsappStatus").has("9777777777"));
  await hook({ k: tok }, "not json at all");
  const w = col("whatsappStatus").get("_webhook");
  ok("every call is logged for Admin (count, last raw body)", w && w.count >= 4 && typeof w.lastRaw === "string");
  // 4. a NEW send starts the ticks over; another kind keeps its own
  const r2 = await fns.sendBulkDriverWhatsApp({ ...admin, data: { kind: "offDuty", mobiles: ["9000000002"] } });
  const again = col("whatsappStatus").get("9000000002").byKind.offDuty;
  ok("sending again resets that driver to submitted (old read / delivered stamps gone)", r2.ok && again.status === "submitted" && !again.readAt && !again.deliveredAt && !again.sentAt, JSON.stringify(again));
  await fns.sendBulkDriverWhatsApp({ ...admin, data: { kind: "kycIncomplete", mobiles: ["9000000001"] } });
  const k1 = col("whatsappStatus").get("9000000001");
  ok("a second kind is tracked beside the first, and is the latest", k1.lastKind === "kycIncomplete" && k1.byKind.kycIncomplete.status === "submitted" && k1.byKind.offDuty.status === "read");
  // 5. MSG91 refuses -> failed ticks with the reason
  msg91Reply = { status: 200, body: '{"status":"fail","message":"Template not found"}' };
  const r3 = await fns.sendBulkDriverWhatsApp({ ...admin, data: { kind: "gpsOff", mobiles: ["9000000004"] } });
  const f4 = col("whatsappStatus").get("9000000004");
  ok("a rejected send writes a failed tick with MSG91's reason", !r3.ok && f4 && f4.byKind.gpsOff.status === "failed" && /Template not found/.test(f4.byKind.gpsOff.reason), JSON.stringify(f4));
  // 6. the setup info for Admin
  let e2; try { await fns.getWhatsAppWebhookInfo({ auth: { token: {} } }); } catch (e) { e2 = e; }
  ok("webhook info is Admin-only", e2 && e2.code === "permission-denied");
  const info = await fns.getWhatsAppWebhookInfo(admin);
  ok("webhook info: URL carries the token, count from the log", info.url === `https://asia-south1-demo-proj.cloudfunctions.net/msg91WhatsAppStatus?k=${tok}` && info.count >= 4, info.url);
  out.forEach(([s, n, x]) => console.log(s, n, x ? "  " + x : ""));
  if (out.some((o) => o[0] !== "ok  ")) process.exit(1);
})();
