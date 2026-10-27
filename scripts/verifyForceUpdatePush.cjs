// Offline test of the REAL notifyForceUpdate (production + test mode). Run: node scripts/verifyForceUpdatePush.cjs
// Loads the REAL functions/index.js with every external module stubbed, grabs the
// notifyForceUpdate trigger handler, and drives it with a fake Firestore + fake FCM.
const Module = require("module"); const path = require("path");
const handlers = {}; const sent = []; let data = { drivers: [], customers: [] };
const proxy = () => new Proxy(function () {}, { get: (_, k) => (k === "then" ? undefined : proxy()), apply: () => proxy(), construct: () => proxy() });
const snapOf = (list, name) => ({ forEach: (cb) => list.forEach((d, i) => cb({ id: name + i, data: () => d })) });
const fakeDb = { collection: (name) => ({
  get: async () => snapOf(data[name] || [], name),
  where: (field, op, val) => ({ get: async () => snapOf((data[name] || []).filter((d) => op === "==" && d[field] === val), name) }),
  doc: () => proxy(),
}) };
const stubs = {
  "firebase-functions/v2/firestore": { onDocumentCreated: (p, h) => (handlers[p] = h, h), onDocumentWritten: (p, h) => (handlers["W:" + p] = h, h), onDocumentUpdated: (p, h) => (handlers["U:" + p] = h, h) },
  "firebase-admin/firestore": { getFirestore: () => fakeDb, FieldValue: proxy(), Timestamp: proxy() },
  "firebase-admin/messaging": { getMessaging: () => ({ sendEachForMulticast: async (m) => { sent.push(m); return { successCount: m.tokens.length, failureCount: 0, responses: [] }; } }) },
};
const origLoad = Module._load;
Module._load = function (req, parent, isMain) {
  if (stubs[req]) return stubs[req];
  if (/^(firebase-|@google-cloud)/.test(req)) return proxy();
  return origLoad.apply(this, arguments);
};
process.env.GCLOUD_PROJECT = "test";
require(path.join(__dirname, "..", "functions", "index.js"));
const run = async (before, after) => handlers["W:settings/main"]({ data: { before: { data: () => before }, after: { data: () => after } } });
const tok = (n, v) => ({ fcmToken: "t" + n, ...(v === undefined ? {} : { appVersionCode: v }) });
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS" : "FAIL") + "  " + name + (extra ? "  [" + extra + "]" : "")); };
(async () => {
  check("trigger is registered on settings/main", typeof handlers["W:settings/main"] === "function");

  // 1. required version bumped 40 -> 41
  data = {
    drivers: [tok(1, 41), tok(2, 40), tok(3, undefined), { name: "no token", appVersionCode: 1 }, tok(5, 42), tok(6, "abc")],
    customers: [tok(7, 41), tok(8, 12), { appVersionCode: 3 }],
  };
  sent.length = 0; await run({ latestVersionCode: 40 }, { latestVersionCode: 41 });
  const byColl = sent.map((m) => m.tokens.join(","));
  check("drivers: only installs BEHIND 41 are pushed (40, never-reported, garbage); 41/42 and no-token skipped", byColl[0] === "t2,t3,t6", byColl[0]);
  check("customers: only the old build is pushed; no-token skipped", byColl[1] === "t8", byColl[1]);
  check("exactly one push per collection", sent.length === 2);
  const m = sent[0];
  check("push is high priority, carries data.type=force_update, and has a title + body", m.android.priority === "high" && m.data.type === "force_update" && !!m.notification.title && !!m.notification.body);
  check("tap target opens the right app (driver vs customer)", m.webpush.fcmOptions.link === "/?open=driver" && sent[1].webpush.fcmOptions.link === "/?open=customer");

  // 2. no real change -> nothing sent
  sent.length = 0; await run({ latestVersionCode: 41, other: 1 }, { latestVersionCode: 41, other: 2 });
  check("editing another setting (same required version) sends nothing", sent.length === 0);
  sent.length = 0; await run({ latestVersionCode: 41 }, { latestVersionCode: null });
  check("clearing the required version sends nothing", sent.length === 0);
  sent.length = 0; await run({ latestVersionCode: 41 }, undefined);
  check("deleting the settings doc sends nothing (no crash)", sent.length === 0);

  // 3. first-ever value
  sent.length = 0; await run(undefined, { latestVersionCode: 5 });
  check("first-ever required version (no 'before') does push (only installs behind 5: the never-reported + garbage drivers)", sent.length === 1 && sent[0].tokens.join(",") === "t3,t6", sent.map((x) => x.tokens.join(",")).join(" | "));

  // 4. > 500 tokens are batched
  data = { drivers: Array.from({ length: 1200 }, (_, i) => tok(i, 1)), customers: [] };
  sent.length = 0; await run({ latestVersionCode: 5 }, { latestVersionCode: 6 });
  check("1200 old installs go out in 3 batches of <=500", sent.length === 3 && sent.every((x) => x.tokens.length <= 500) && sent.reduce((n, x) => n + x.tokens.length, 0) === 1200, sent.map((x) => x.tokens.length).join("+"));

  // 5. a throwaway/web driver: has a token but never reports a build number
  data = { drivers: [{ name: "throwaway web driver", mobile: "9000000001", fcmToken: "web-token" }], customers: [] };
  sent.length = 0; await run({ latestVersionCode: 40 }, { latestVersionCode: 41 });
  check("a web-only throwaway driver (token, no appVersionCode) WOULD be pushed", sent.length === 1 && sent[0].tokens[0] === "web-token");

  // ---- TEST MODE: testVersionCode reaches ONLY drivers/customers flagged forceUpdateTest ----
  data = {
    drivers: [{ ...tok(1, 40), forceUpdateTest: true }, tok(2, 40), { ...tok(3, 99), forceUpdateTest: true }, { fcmToken: undefined, forceUpdateTest: true, appVersionCode: 1 }, { ...tok(5, 40), forceUpdateTest: false }],
    customers: [{ ...tok(6, 10), forceUpdateTest: true }, tok(7, 10)],
  };
  sent.length = 0; await run({ latestVersionCode: 40 }, { latestVersionCode: 40, testVersionCode: 50 });
  check("test version: ONLY flagged + behind + has-token users are pushed (flagged t1 yes; unflagged t2/t5 no; flagged but already on 99 no; flagged without token no)", sent.length === 2 && sent[0].tokens.join(",") === "t1" && sent[1].tokens.join(",") === "t6", sent.map((x) => x.tokens.join(",")).join(" | "));
  check("test push has the same shape as a real one (type=force_update, high priority)", sent.every((x) => x.data.type === "force_update" && x.android.priority === "high"));
  sent.length = 0; await run({ latestVersionCode: 40, testVersionCode: 50 }, { latestVersionCode: 40, testVersionCode: 50 });
  check("test version unchanged -> nothing sent", sent.length === 0);
  sent.length = 0; await run({ latestVersionCode: 40, testVersionCode: 50 }, { latestVersionCode: 40, testVersionCode: null });
  check("switching the test off (blank) sends nothing", sent.length === 0);
  data = { drivers: [tok(1, 40), tok(2, 40)], customers: [tok(3, 40)] };
  sent.length = 0; await run({ latestVersionCode: 40 }, { latestVersionCode: 40, testVersionCode: 50 });
  check("test version with NO flagged phones reaches nobody (a real user can never be hit by it)", sent.length === 0);
  data = { drivers: [{ ...tok(1, 40), forceUpdateTest: true }, tok(2, 40)], customers: [] };
  sent.length = 0; await run({ latestVersionCode: 40 }, { latestVersionCode: 45 });
  check("a REAL required-version bump still goes to everyone behind, flagged or not (test mode doesn't change the real path)", sent.length === 1 && sent[0].tokens.join(",") === "t1,t2", sent.map((x) => x.tokens.join(",")).join(" | "));

  console.log("\n" + results.filter(Boolean).length + "/" + results.length + " checks passed");
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR", e); process.exit(2); });
