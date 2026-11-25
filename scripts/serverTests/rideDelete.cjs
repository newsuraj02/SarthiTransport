// Runs the REAL deleteBookingsCascade (functions/rideDelete.js) and the adminDeleteBookings callable against a tiny fake Firestore + Storage (owner 2026-11-25: deleting a ride
// must remove it everywhere, not just the entry). Every line must say "ok"; the exit code is 1 otherwise. verifyInvariants.mjs runs this file.
const Module = require("module");
const path = require("path");
const store = {};
const col = (n) => (store[n] ||= new Map());
const STAMP = { __ts: true };
const files = new Set();
const mkRef = (name, id) => ({ __col: name, id, path: `${name}/${id}`, async get() { const d = col(name).get(id); return { exists: !!d, id, data: () => d }; }, async set(d) { col(name).set(id, d); }, async delete() { col(name).delete(id); } });
const mkQuery = (name, filters = []) => ({
  where(f, op, v) { return mkQuery(name, [...filters, [f, v]]); },
  async get() { const docs = [...col(name).entries()].filter(([, d]) => filters.every(([f, v]) => d[f] === v)).map(([id, d]) => ({ id, data: () => d, ref: mkRef(name, id) })); return { docs, size: docs.length, empty: !docs.length, forEach: (fn) => docs.forEach(fn) }; },
});
const fakeDb = {
  collection: (name) => ({ ...mkQuery(name), doc: (id) => mkRef(name, id) }),
  batch: () => { const ops = []; return { delete(r) { ops.push(r); }, set() {}, update() {}, async commit() { ops.forEach((r) => col(r.__col).delete(r.id)); } }; },
};
const fakeBucket = { async deleteFiles({ prefix }) { [...files].filter((f) => f.startsWith(prefix)).forEach((f) => files.delete(f)); } };
const real = Module._load;
Module._load = function (req) {
  if (req === "firebase-functions/v2/https") return { onCall: (o, fn) => fn, onRequest: (o, fn) => fn, HttpsError: class extends Error { constructor(c, m) { super(m); this.code = c; } } };
  if (req === "firebase-functions/v2/firestore") return { onDocumentCreated: () => ({}), onDocumentUpdated: () => ({}), onDocumentWritten: () => ({}) };
  if (req === "firebase-functions/v2/scheduler") return { onSchedule: (o, fn) => fn };
  if (req === "firebase-functions/params") return { defineSecret: () => ({ value: () => "x" }) };
  if (req === "firebase-admin/app") return { initializeApp: () => ({}) };
  if (req === "firebase-admin/firestore") return { getFirestore: () => fakeDb, FieldValue: { serverTimestamp: () => STAMP, increment: (n) => n, arrayUnion: (...a) => a, delete: () => null }, Timestamp: { fromMillis: (m) => ({ toMillis: () => m }) } };
  if (req === "firebase-admin/auth") return { getAuth: () => { const nf = async () => { const x = new Error("nf"); x.code = "auth/user-not-found"; throw x; }; return { getUserByEmail: nf, getUserByPhoneNumber: nf, revokeRefreshTokens: async () => {}, deleteUser: async () => {} }; } };
  if (req === "firebase-admin/storage") return { getStorage: () => ({ bucket: () => fakeBucket }) };
  if (req.startsWith("firebase-") || req.startsWith("@google-cloud")) return new Proxy(function () {}, { get: (t, k) => (k === "then" ? undefined : () => ({})), apply: () => ({}) });
  return real.apply(this, arguments);
};
const fns = require(path.join(__dirname, "../../functions/index.js"));
const { deleteBookingsCascade } = require(path.join(__dirname, "../../functions/rideDelete.js"));
let bad = 0;
const ok = (n, c) => { if (!c) bad++; console.log(`${c ? "ok  " : "FAIL"}  ${n}`); };
const seed = () => {
  Object.keys(store).forEach((k) => delete store[k]); files.clear();
  const B = col("bookings");
  B.set("done", { status: "Completed", driverName: "Ravi" }); B.set("cancel", { status: "Cancelled" }); B.set("run", { status: "Ongoing", driverName: "Sunil" }); B.set("open", { status: "AwaitingDriver" }); B.set("done2", { status: "Completed", driverName: "Ravi" });
  ["done", "cancel", "run", "open", "done2"].forEach((id) => col("bookingOtps").set(id, { otp: "1" }));
  col("bookingExtras").set("x1", { bookingId: "done", amount: 100 }); col("bookingExtras").set("x2", { bookingId: "run", amount: 50 });
  col("ringDeliveries").set("open_9", { bookingId: "open" }); col("ringDeliveries").set("done_9", { bookingId: "done" });
  ["bookings/done/documents/bill.pdf", "bookings/run/documents/eway.pdf", "bookings/done2/documents/inv.pdf", "adminExports/keep.csv"].forEach((f) => files.add(f));
  col("customerFlow").set("f-booked", { booked: true, stage: "booked" }); col("customerFlow").set("f-open", { booked: false, stage: "drop" });
  col("alerts").set("a1", { type: "x" }); col("drivers").set("9111", { name: "Ravi", wallet: 500 });
};
const call = (data, admin = true) => fns.adminDeleteBookings({ auth: { token: admin ? { admin: true } : {} }, data });
(async () => {
  ok("the callable exists", typeof fns.adminDeleteBookings === "function");
  seed(); let r = await deleteBookingsCascade({ db: fakeDb, bucket: fakeBucket, mode: "finished", ids: null });
  ok("finished (no ids): every Completed / Cancelled ride is deleted, a running trip and an open request are NOT", !col("bookings").has("done") && !col("bookings").has("cancel") && !col("bookings").has("done2") && col("bookings").has("run") && col("bookings").has("open") && r.deleted === 3);
  ok("finished: their pickup OTP, extras, ring receipts and uploaded bills go with them; the running trip's stay", !col("bookingOtps").has("done") && !col("bookingOtps").has("cancel") && col("bookingOtps").has("run") && !col("bookingExtras").has("x1") && col("bookingExtras").has("x2") && !col("ringDeliveries").has("done_9") && col("ringDeliveries").has("open_9") && !files.has("bookings/done/documents/bill.pdf") && !files.has("bookings/done2/documents/inv.pdf") && files.has("bookings/run/documents/eway.pdf"));
  ok("finished: customer-activity tries are NOT touched", col("customerFlow").size === 2);
  seed(); r = await deleteBookingsCascade({ db: fakeDb, bucket: fakeBucket, mode: "finished", ids: ["done", "run", "ghost"] });
  ok("finished with ids: only the listed rides that are STILL finished (a running trip's id is ignored)", !col("bookings").has("done") && col("bookings").has("run") && col("bookings").has("cancel") && r.deleted === 1);
  seed(); r = await deleteBookingsCascade({ db: fakeDb, bucket: fakeBucket, mode: "finished", ids: [] });
  ok("an EMPTY id list deletes nothing (never 'everything')", r.deleted === 0 && col("bookings").size === 5);
  seed(); r = await deleteBookingsCascade({ db: fakeDb, bucket: fakeBucket, mode: "all", ids: null });
  ok("all: every ride of every status is gone, running trips and open requests included", col("bookings").size === 0 && r.deleted === 5);
  ok("all: pickup OTPs, extras, ring receipts and every bill under bookings/ are gone", col("bookingOtps").size === 0 && col("bookingExtras").size === 0 && col("ringDeliveries").size === 0 && ![...files].some((f) => f.startsWith("bookings/")) && files.has("adminExports/keep.csv"));
  ok("all: the Booked customer-activity tries go, the not-booked ones stay", !col("customerFlow").has("f-booked") && col("customerFlow").has("f-open"));
  ok("nothing else is touched: driver profile / wallet, alerts", col("drivers").get("9111").wallet === 500 && col("alerts").has("a1"));
  seed(); let res = await call({ mode: "all" });
  ok("the callable (Admin) runs it and reports what it removed", res.ok === true && res.deleted === 5 && col("bookings").size === 0);
  seed(); let threw = false; try { await call({ mode: "all" }, false); } catch (e) { threw = e.code === "permission-denied"; }
  ok("a non-Admin is refused and nothing is deleted", threw && col("bookings").size === 5);
  seed(); threw = false; try { await call({ mode: "bogus" }); } catch (e) { threw = e.code === "invalid-argument"; }
  ok("a bad mode is refused", threw && col("bookings").size === 5);
  // BRUTAL (owner 2026-11-25): any ride of any status can be deleted by id -- today's, Advance, open, running
  seed(); col("bookings").set("adv", { status: "Ongoing", scheduledFor: "2026-11-28 08:00", driverName: "Ravi", customerMobile: "9777000001" }); col("bookingOtps").set("adv", { otp: "2" });
  r = await deleteBookingsCascade({ db: fakeDb, bucket: fakeBucket, mode: "ids", ids: ["run", "open", "adv", "ghost"] });
  ok("ids mode: a running trip, an open request and an accepted Advance ride are deleted (any status), an unknown id is ignored, the rest stay", !col("bookings").has("run") && !col("bookings").has("open") && !col("bookings").has("adv") && col("bookings").has("done") && col("bookings").has("cancel") && r.deleted === 3);
  ok("ids mode: their OTP / extras / receipts / bills go too", !col("bookingOtps").has("adv") && !col("bookingOtps").has("run") && !col("bookingExtras").has("x2") && !col("ringDeliveries").has("open_9") && !files.has("bookings/run/documents/eway.pdf") && col("bookingExtras").has("x1"));
  seed(); threw = false; try { await call({ mode: "ids", ids: [] }); } catch (e) { threw = e.code === "invalid-argument"; }
  ok("ids mode needs a non-empty list", threw && col("bookings").size === 5);
  seed(); res = await call({ mode: "ids", ids: ["run", "open"] });
  ok("the callable deletes the listed rides of any status", res.ok === true && res.deleted === 2 && !col("bookings").has("run") && col("bookings").has("done"));
  // FORCE: deleting a person with unfinished rides
  const seedPerson = () => { seed(); col("customers").set("9888000001", { name: "Fraud Petrol Pump" }); col("bookings").set("f1", { status: "AwaitingDriver", customerMobile: "9888000001" }); col("bookings").set("f2", { status: "Ongoing", customerMobile: "9888000001", driverName: "Ravi", driverMobile: "9111" }); col("bookings").set("f3", { status: "Completed", customerMobile: "9888000001" }); col("bookingOtps").set("f2", { otp: "3" }); };
  seedPerson(); res = await fns.adminDeleteAccount({ auth: { token: { admin: true } }, data: { mobile: "9888000001", role: "customer" } });
  ok("without force a person with an unfinished ride is still refused (nothing deleted)", res.ok === false && res.reason === "trip-running" && col("bookings").has("f1") && col("customers").has("9888000001"));
  seedPerson(); res = await fns.adminDeleteAccount({ auth: { token: { admin: true } }, data: { mobile: "9888000001", role: "customer", force: true } });
  ok("with force: every ride of that person (open, running, finished) is deleted with its OTP, then the account goes", res.ok === true && res.ridesDeleted === 3 && !col("bookings").has("f1") && !col("bookings").has("f2") && !col("bookings").has("f3") && !col("bookingOtps").has("f2") && !col("customers").has("9888000001"));
  ok("with force: nobody else's rides are touched", col("bookings").has("done") && col("bookings").has("run") && col("bookings").has("open"));
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
