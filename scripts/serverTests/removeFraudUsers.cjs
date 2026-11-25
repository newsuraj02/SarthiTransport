// Runs scripts/removeFraudUsers.js against a tiny fake firebase-admin (owner 2026-11-25): the DRY RUN writes nothing and lists only name matches; --apply deletes ONLY the
// numbers it is given (their rides, logins, profiles, tombstone) and nobody else. Every line must say "ok"; exit code 1 otherwise.
const Module = require("module");
const path = require("path");
const { Readable } = require("stream");
const store = {};
const col = (n) => (store[n] ||= new Map());
const authUsers = new Map(); // email|phone -> { uid }
const revoked = [];
let writes = 0;
const mkDoc = (name, id) => ({ id, path: `${name}/${id}`, async get() { const d = col(name).get(id); return { exists: !!d, id, data: () => d, ref: this }; }, async set(d) { writes++; col(name).set(id, d); }, async delete() { writes++; col(name).delete(id); } });
const mkQuery = (name, filters = []) => ({
  where(f, op, v) { return mkQuery(name, [...filters, [f, v]]); },
  async get() { const docs = [...col(name).entries()].filter(([, d]) => filters.every(([f, v]) => d[f] === v)).map(([id, d]) => ({ id, data: () => d, ref: mkDoc(name, id) })); return { docs, size: docs.length, empty: !docs.length, forEach: (fn) => docs.forEach(fn) }; },
});
const fakeDb = { collection: (name) => ({ ...mkQuery(name), doc: (id) => mkDoc(name, id) }) };
const fakeAdmin = {
  initializeApp() {}, credential: { cert: () => ({}) },
  firestore: Object.assign(() => fakeDb, { FieldValue: { serverTimestamp: () => ({ __ts: true }) } }),
  auth: () => ({
    getUserByEmail: async (e) => { if (authUsers.has(e)) return { uid: authUsers.get(e).uid }; const x = new Error("nf"); x.code = "auth/user-not-found"; throw x; },
    getUserByPhoneNumber: async (p) => { if (authUsers.has(p)) return { uid: authUsers.get(p).uid }; const x = new Error("nf"); x.code = "auth/user-not-found"; throw x; },
    revokeRefreshTokens: async (uid) => { revoked.push(uid); },
    deleteUser: async (uid) => { for (const [k, v] of authUsers) if (v.uid === uid) authUsers.delete(k); writes++; },
  }),
};
const real = Module._load;
Module._load = function (req) { if (req === "firebase-admin") return fakeAdmin; return real.apply(this, arguments); };
const script = path.join(__dirname, "../removeFraudUsers.js");
const seed = () => {
  Object.keys(store).forEach((k) => delete store[k]); authUsers.clear(); revoked.length = 0; writes = 0;
  col("customers").set("9111111111", { name: "Nishant Petrol Pump", createdAt: { toMillis: () => 1 } });
  col("customers").set("9222222222", { name: "धर्मेंद्र", createdAt: { toMillis: () => 1 } });
  col("drivers").set("9333333333", { name: "Atul Petrolpump", kyc: "Approved", online: true });
  col("customers").set("9444444444", { name: "Ramroop Yadav" });
  col("drivers").set("9555555555", { name: "Dharmendra Kumar (a real driver)", kyc: "Approved" });
  authUsers.set("9111111111@customer.apnatransport.local", { uid: "u1" });
  authUsers.set("9333333333@driver.apnatransport.local", { uid: "u3" });
  authUsers.set("9444444444@customer.apnatransport.local", { uid: "u4" });
  col("bookings").set("b1", { status: "AwaitingDriver", customerMobile: "9111111111", customerName: "Nishant Petrol Pump", pickup: "A", drop: "B" });
  col("bookings").set("b2", { status: "Completed", customerMobile: "9111111111", driverMobile: "9666666666" });
  col("bookings").set("b3", { status: "Ongoing", customerMobile: "9777777777", driverMobile: "9333333333" });
  col("bookings").set("b4", { status: "Completed", customerMobile: "9444444444", driverMobile: "9666666666" });
  col("bookingOtps").set("b3", { otp: "1" }); col("ringDeliveries").set("b1_9", { bookingId: "b1" });
  col("customerFlow").set("f1", { customerMobile: "9111111111" }); col("customerFlow").set("f4", { customerMobile: "9444444444" });
};
const run = async (args, input) => {
  const out = []; const origLog = console.log, origErr = console.error; console.log = (...a) => out.push(a.join(" ")); console.error = (...a) => out.push(a.join(" "));
  const origStdin = Object.getOwnPropertyDescriptor(process, "stdin");
  Object.defineProperty(process, "stdin", { configurable: true, value: Readable.from([input || ""]) });
  const origExit = process.exit; process.exit = (c) => { out.push(`exit ${c}`); throw new Error("__exit__"); };
  Module._load = function (req) { if (req === "firebase-admin") return fakeAdmin; if (/key\.json$/.test(req)) return {}; return real.apply(this, arguments); };
  delete require.cache[require.resolve(script)];
  try { await require(script).main(["node", script, "key.json", ...args]); } catch (e) { if (e.message !== "__exit__") out.push(String(e.stack || e)); }
  console.log = origLog; console.error = origErr; process.exit = origExit; if (origStdin) Object.defineProperty(process, "stdin", origStdin);
  return out.join("\n");
};
let bad = 0;
const ok = (n, c) => { if (!c) bad++; console.log(`${c ? "ok  " : "FAIL"}  ${n}`); };
(async () => {
  seed();
  let out = await run([]);
  if (process.env.DBG) console.log("OUT>>", out);
  ok("DRY RUN writes nothing", writes === 0 && col("customers").size === 3 && col("bookings").size === 4);
  ok("DRY RUN lists the three fraud-name accounts and the same-name real driver, not Ramroop", /9111111111/.test(out) && /9222222222/.test(out) && /9333333333/.test(out) && /9555555555/.test(out) && !/9444444444/.test(out));
  ok("DRY RUN shows the rides per number and flags an Ongoing trip", /rides on this number: 2/.test(out) && /Ongoing 1.*has Ongoing/.test(out.replace(/\n/g, " ")));
  seed();
  out = await run(["--apply", "9111111111,9333333333"], "DELETE\n");
  ok("--apply: their rides are gone (as customer and as driver), with the pickup OTP and ring leftovers", !col("bookings").has("b1") && !col("bookings").has("b2") && !col("bookings").has("b3") && !col("bookingOtps").has("b3") && !col("ringDeliveries").has("b1_9"));
  ok("--apply: their logins and profiles are gone, tombstones written, tokens revoked", !col("customers").has("9111111111") && !col("drivers").has("9333333333") && authUsers.size === 1 && col("deletedAccounts").has("9111111111") && col("deletedAccounts").has("9333333333") && revoked.includes("u1") && revoked.includes("u3"));
  ok("--apply: their activity is gone", !col("customerFlow").has("f1"));
  ok("--apply: nobody else is touched (a named-alike real driver, an unrelated customer, their ride and activity)", col("drivers").has("9555555555") && col("customers").has("9444444444") && col("customers").has("9222222222") && col("bookings").has("b4") && col("customerFlow").has("f4") && authUsers.has("9444444444@customer.apnatransport.local"));
  seed();
  out = await run(["--apply", "9111111111"], "no\n");
  ok("typing anything but DELETE cancels: nothing is deleted", writes === 0 && col("bookings").size === 4 && /Cancelled/.test(out));
  seed();
  out = await run(["--apply", "98765"], "DELETE\n");
  ok("a bad number is refused before anything happens", writes === 0 && /10-digit/.test(out));
  process.exit(bad ? 1 : 0);
})();
