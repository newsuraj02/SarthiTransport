// Runs the REAL `askHelper` + `rateHelperAnswer` callables (functions/index.js) against a tiny fake Firestore and a fake Anthropic API -- no Firebase, no network (owner 2026-11-24: the in-app helper).
// Every line must say "ok"; the exit code is 1 otherwise. verifyInvariants.mjs runs this file ("IN-APP HELPER").
const Module = require("module");
const path = require("path");
const store = {};
const col = (n) => (store[n] ||= new Map());
const STAMP = { __ts: true };
let autoId = 0;
class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const makeQuery = (name, filters = []) => ({
  where(f, op, v) { return makeQuery(name, [...filters, [f, v]]); },
  async get() { const docs = [...col(name).entries()].filter(([, d]) => filters.every(([f, v]) => d[f] === v)).map(([id, d]) => ({ id, data: () => d, exists: true, ref: fakeDb.collection(name).doc(id) })); return { docs, size: docs.length, empty: !docs.length, forEach: (fn) => docs.forEach(fn) }; },
});
const fakeDb = {
  async runTransaction(fn) { const tx = { async get(ref) { return ref.get(); }, set(ref, data, opts) { ref.__pending = () => (opts && opts.merge ? ref.update(data).catch(() => ref.set(data)) : ref.set(data)); tx.__refs.push(ref); }, __refs: [] }; const r = await fn(tx); for (const ref of tx.__refs) await ref.__pending(); return r; },
  collection: (name) => ({
  ...makeQuery(name),
  async add(data) { const id = `auto${String(++autoId).padStart(16, "0")}`; col(name).set(id, data); return { id }; },
  doc: (id0) => { const id = id0 || `auto${++autoId}`; return {
    id,
    async get() { const d = col(name).get(id); return { exists: !!d, id, data: () => d }; },
    async create(data) { if (col(name).has(id)) { const e = new Error("already exists"); e.code = 6; throw e; } col(name).set(id, data); },
    async set(data) { col(name).set(id, data); }, async update(p) { col(name).set(id, { ...col(name).get(id), ...p }); }, async delete() { col(name).delete(id); },
  }; },
}) };
const users = new Map(); // email -> { uid, password }
const real = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === "firebase-functions/v2/https") return { onCall: (o, fn) => fn, onRequest: (o, fn) => fn, HttpsError };
  if (req === "firebase-functions/v2/identity") return { beforeUserCreated: (o, fn) => fn };
  if (req === "firebase-functions/v2/firestore") return { onDocumentCreated: () => ({}), onDocumentUpdated: () => ({}), onDocumentWritten: () => ({}) };
  if (req === "firebase-functions/v2/scheduler") return { onSchedule: () => ({}) };
  if (req === "firebase-functions/params") return { defineSecret: () => ({ value: () => process.env.TEST_KEY || "" }) };
  if (req === "firebase-admin/app") return { initializeApp: () => ({}) };
  if (req === "firebase-admin/firestore") return { getFirestore: () => fakeDb, FieldValue: { serverTimestamp: () => STAMP, increment: (n) => n, arrayUnion: (...a) => a }, Timestamp: { now: () => ({}), fromMillis: (m) => ({ toMillis: () => m }) } };
  if (req === "firebase-admin/auth") return { getAuth: () => ({
    getUserByEmail: async (e) => { if (users.has(e)) return { uid: users.get(e).uid, email: e }; const x = new Error("nf"); x.code = "auth/user-not-found"; throw x; },
    createCustomToken: async (uid, claims) => "custom:" + uid + ":" + JSON.stringify(claims || {}),
    createUser: async ({ email, password }) => { if (users.has(email)) { const x = new Error("exists"); x.code = "auth/email-already-exists"; throw x; } users.set(email, { uid: "u" + users.size, password }); return { uid: "u" + users.size }; },
  }) };
  if (req.startsWith("firebase-") || req.startsWith("@google-cloud")) return new Proxy(function () {}, { get: (t, k) => (k === "then" ? undefined : () => ({})), apply: () => ({}) });
  return real.apply(this, arguments);
};
process.env.TEST_KEY = "sk-test";
let fns;
try { fns = require(path.join(__dirname, "..", "..", "functions", "index.js")); } catch (e) { console.error("LOAD FAIL", e.message); process.exit(2); }
const ask = fns.askHelper, rate = fns.rateHelperAnswer;
const user = (uid = "u1") => ({ auth: { uid, token: {} } });
let sent = [], reply = null, httpStatus = 200, boom = false;
global.fetch = async (url, opts) => {
  sent.push({ url, opts, body: JSON.parse(opts.body) });
  if (boom) throw new Error("network down");
  return { ok: httpStatus === 200, status: httpStatus, json: async () => (reply || { content: [{ type: "text", text: "Jawab." }], usage: { input_tokens: 6000, output_tokens: 80 }, stop_reason: "end_turn" }) };
};
(async () => {
  const out = [];
  const ck = (cond, name, extra = "") => out.push([cond ? "ok  " : "BUG?", name, extra]);
  const tryCall = async (fn, req) => { try { return { r: await fn(req) }; } catch (e) { return { e }; } };
  // ---- who may ask, what is accepted
  let x = await tryCall(ask, { data: { role: "customer", lang: "en", question: "how to book" } });
  ck(x.e && x.e.code === "unauthenticated" && sent.length === 0, "signed-out caller refused, nothing sent to the API");
  x = await tryCall(ask, { ...user(), data: { role: "admin", lang: "en", question: "hello there" } });
  ck(x.e && x.e.code === "invalid-argument", "only the customer and driver apps may ask (role admin refused)");
  x = await tryCall(ask, { ...user(), data: { role: "customer", lang: "en", question: " " } });
  ck(x.e && x.e.code === "invalid-argument" && sent.length === 0, "an empty question is refused before any API call");
  process.env.TEST_KEY = "";
  x = await tryCall(ask, { ...user("u0"), data: { role: "customer", lang: "en", question: "how to book" } });
  ck(x.r && x.r.ok === false && x.r.reason === "not_configured" && sent.length === 0, "no ANTHROPIC_API_KEY -> not_configured (the app shows the support buttons), nothing sent");
  process.env.TEST_KEY = "sk-test";
  // ---- the request that goes to Claude
  x = await tryCall(ask, { ...user("u2"), data: { role: "customer", lang: "hi", question: "mera OTP 123456 nahi aaya, number 9876543210", history: [{ role: "user", text: "namaste" }, { role: "assistant", text: "Namaste!" }] } });
  const b = sent[sent.length - 1] && sent[sent.length - 1].body;
  ck(x.r && x.r.ok === true && x.r.text === "Jawab." && x.r.answered === true && typeof x.r.logId === "string", "an answer comes back with a log id", JSON.stringify(x.r));
  ck(b && b.model === "claude-haiku-5-5", "the model is Haiku 5.5", b && b.model);
  ck(sent[0].url === "https://api.anthropic.com/v1/messages" && sent[sent.length - 1].opts.headers["x-api-key"] === "sk-test", "goes to the Messages API with the secret key");
  ck(b && b.system[0].text.includes("Hindi (Devanagari script)") && b.system[0].text.includes("ONLY in"), "the reply language is the user's chosen one (Hindi)");
  ck(b && JSON.stringify(b).indexOf("123456") === -1 && JSON.stringify(b).indexOf("9876543210") === -1 && /\[number\]/.test(b.messages[b.messages.length - 1].content), "OTPs / mobile numbers (6+ digits) never leave the server");
  ck(b && b.messages[b.messages.length - 1].role === "user" && b.messages[0].role === "user", "the conversation starts and ends on a user turn");
  ck(b && b.system[0].text.includes("Select vehicle") && !b.system[0].text.includes("Duty switch"), "a CUSTOMER gets the customer facts only");
  ck(b && b.thinking && b.thinking.type === "disabled" && b.output_config && b.output_config.effort === "low" && b.max_tokens <= 800 && b.system[0].cache_control && b.system[0].cache_control.type === "ephemeral", "cheap settings: thinking off, low effort, short answer cap, the FAQ text cached");
  ck(!("temperature" in b) && !("top_p" in b) && !("prefill" in b), "no sampling parameters (Haiku 5.5 rejects them)");
  ck(!JSON.stringify(b).includes("u2"), "nothing identifying the person (uid) is sent");
  await ask({ ...user("u3"), data: { role: "driver", lang: "mr", question: "duty on kasa karaycha" } });
  const bd = sent[sent.length - 1].body;
  ck(bd.system[0].text.includes("Duty switch") && !bd.system[0].text.includes("Confirm booking") && bd.system[0].text.includes("Marathi"), "a DRIVER gets the driver facts, in Marathi");
  // ---- unanswered
  reply = { content: [{ type: "text", text: "Mujhe yeh nahi mila. [[NO_ANSWER]]" }], usage: { input_tokens: 5000, output_tokens: 30 }, stop_reason: "end_turn" };
  x = await tryCall(ask, { ...user("u4"), data: { role: "customer", lang: "en", question: "what is my refund" } });
  ck(x.r && x.r.ok && x.r.answered === false && !x.r.text.includes("NO_ANSWER") && x.r.text.length > 0, "a question outside the facts comes back unanswered and the marker is stripped", JSON.stringify(x.r));
  reply = { content: [], stop_reason: "refusal", usage: {} };
  x = await tryCall(ask, { ...user("u4"), data: { role: "customer", lang: "en", question: "something odd" } });
  ck(x.r && x.r.ok && x.r.answered === false, "a refusal / empty reply counts as unanswered (the app offers a person)");
  reply = null;
  // ---- the log (what Admin reads)
  const logs = [...col("helperLog").values()];
  ck(logs.length >= 4 && logs.every((l) => l.role && l.lang && "question" in l && "answered" in l && !("uid" in l) && !("mobile" in l)), "every exchange is logged anonymously (role, language, question, answer, answered, tokens)", String(logs.length));
  ck(logs.some((l) => l.question.includes("[number]") && !/\d{6}/.test(l.question)), "the logged question has no long digit runs");
  ck(logs.some((l) => l.answered === false), "an unanswered question is flagged in the log (so Admin knows what to add)");
  // ---- API trouble
  httpStatus = 529;
  x = await tryCall(ask, { ...user("u5"), data: { role: "customer", lang: "en", question: "how to book" } });
  ck(x.r && x.r.ok === false && x.r.reason === "api_error", "an API error -> api_error (never a crash)");
  httpStatus = 200; boom = true;
  x = await tryCall(ask, { ...user("u5"), data: { role: "customer", lang: "en", question: "how to book" } });
  ck(x.r && x.r.ok === false && x.r.reason === "error", "a network failure -> error (never a crash)");
  boom = false;
  // ---- the daily limit
  const before = sent.length; let last = null, okCount = 0;
  for (let i = 0; i < 22; i++) { const r = await ask({ ...user("heavy"), data: { role: "customer", lang: "en", question: "question " + i } }); if (r.ok) okCount++; last = r; }
  ck(okCount === 20 && last.ok === false && last.reason === "limit" && sent.length - before === 20, "20 questions a day per user, the 21st is refused WITHOUT calling the API", okCount + " answered, last=" + last.reason);
  const other = await ask({ ...user("someoneElse"), data: { role: "customer", lang: "en", question: "how to book" } });
  ck(other.ok === true, "another user is not affected by one user's limit");
  // ---- feedback
  const id = (await ask({ ...user("u6"), data: { role: "driver", lang: "en", question: "how do I get loads" } })).logId;
  x = await tryCall(rate, { ...user("u6"), data: { logId: id, helpful: false } });
  ck(x.r && x.r.ok === true && col("helperLog").get(id).helpful === false, "thumbs-down is saved on the log entry");
  x = await tryCall(rate, { ...user("u6"), data: { logId: "../bookings/abc", helpful: true } });
  ck(x.e && x.e.code === "invalid-argument", "a path-like log id is refused");
  x = await tryCall(rate, { data: { logId: id, helpful: true } });
  ck(x.e && x.e.code === "unauthenticated", "signed-out thumbs refused");
  x = await tryCall(rate, { ...user("u6"), data: { logId: "doesnotexist12345", helpful: true } });
  ck(x.r && x.r.ok === false, "a log id that does not exist changes nothing");
  let bad = 0; for (const r of out) { if (r[0] !== "ok  ") bad++; }
  console.log(out.map((r) => r.join("  ")).join("\n"));
  process.exit(bad ? 1 : 0);
})();
