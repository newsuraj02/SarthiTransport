// Real run of functions/smsGateway.js + smsEvents.js against a fake gateway (no network). Prints "ok ..." per check; exits 1 on the first failure.
const assert = require("assert");
const gw = require("../../functions/smsGateway.js");
const ev = require("../../functions/smsEvents.js");
const ok = (name) => console.log("ok", name);

// ---- templates (the REGISTERED APTRNS texts) ----
assert.strictEqual(gw.renderTemplate(gw.DEFAULT_TEXT.otp, ["482913"]), "482913 is your OTP for Apna Transport. Do not share it with anyone. Valid for 10 minutes."); ok("otp text (numeric slot)");
assert.strictEqual(gw.renderTemplate(gw.DEFAULT_TEXT.bookingConfirmed, ["Ravi", "MH12AB1234"]), "Your Apna Transport booking is confirmed. Driver Ravi and vehicle MH12AB1234. Open the app to track your trip."); ok("booking text, values in order");
assert.strictEqual(gw.renderTemplate(gw.DEFAULT_TEXT.newLoad, ["Hinjewadi", "Mumbai"]), "New load on Apna Transport: pickup Hinjewadi, drop Mumbai. Open the app to accept."); assert.strictEqual(gw.renderTemplate(gw.DEFAULT_TEXT.kycReminder, ["Ravi Kumar"]), "Dear Ravi Kumar, your Apna Transport KYC is incomplete. Complete it in the app to start getting loads."); ok("new load + KYC reminder texts");
assert.throws(() => gw.renderTemplate(gw.DEFAULT_TEXT.newLoad, ["only one"]), /needs 2/); assert.throws(() => gw.renderTemplate(gw.DEFAULT_TEXT.otp, []), /needs 1/); ok("wrong number of values is refused, never half-filled");
assert.strictEqual(gw.renderTemplate("{#var#} x", ["a\n  b"]), "a b x"); ok("line breaks inside a value are flattened");
assert.strictEqual(gw.cleanVar("12 34-5", "numeric"), "12345"); assert.strictEqual(gw.cleanVar("Plot 4, Baner (Pune)", "alphanumeric"), "Plot 4 Baner Pune"); assert.strictEqual(gw.cleanVar("x".repeat(60), "alphanumeric").length, 30); assert.strictEqual(gw.cleanVar("पुणे", "alphanumeric"), ""); ok("values are cleaned to what the slot allows (numeric = digits, alphanumeric = letters / digits / spaces, 30 max)");
assert.throws(() => gw.renderTemplate(gw.DEFAULT_TEXT.newLoad, ["पुणे", "Mumbai"]), /empty/); ok("a value with nothing the slot accepts is refused, never sent blank");
assert.deepStrictEqual(gw.KINDS, ["otp", "bookingConfirmed", "newLoad", "kycReminder"]); ok("the four message kinds");
assert.deepStrictEqual(gw.DEFAULT_TYPE, { otp: "TRANSACTIONAL", bookingConfirmed: "SERVICE_IMPLICIT", newLoad: "SERVICE_IMPLICIT", kycReminder: "SERVICE_IMPLICIT" }); ok("OTP is Transactional, the rest Service Implicit (as registered)");

// ---- configuration ----
const empty = gw.normalizeConfig(null);
assert.strictEqual(empty.otpEnabled, false); assert.strictEqual(empty.apiUrl, gw.DEFAULT_API_URL); assert.strictEqual(empty.templates.otp.text, gw.DEFAULT_TEXT.otp); assert.strictEqual(empty.templates.otp.type, "TRANSACTIONAL");
assert.strictEqual(gw.templateFor(empty, "otp").reason, "not_configured"); ok("nothing saved -> not configured, OTP switch off");
const cfg = gw.normalizeConfig({ entityId: " 1101234567890 ", header: "APNATR", customerId: "C1", otpEnabled: true, templates: { otp: { id: "11007", text: "{#numeric#} is your OTP." }, newLoad: { id: "11009", enabled: false }, kycReminder: { id: "11010", type: "SERVICE_EXPLICIT" } } });
assert.strictEqual(cfg.entityId, "1101234567890"); assert.strictEqual(cfg.templates.otp.text, "{#numeric#} is your OTP."); assert.strictEqual(cfg.templates.bookingConfirmed.id, ""); assert.strictEqual(cfg.templates.kycReminder.type, "SERVICE_EXPLICIT");
assert.strictEqual(gw.templateFor(cfg, "bookingConfirmed").reason, "no_template"); assert.strictEqual(gw.templateFor(cfg, "newLoad").reason, "disabled"); assert.strictEqual(gw.templateFor(cfg, "otp").ok, true);
assert.strictEqual(gw.templateFor(cfg, "nope").ok, false); ok("template lookup: missing id / switched off / unknown kind / saved message type wins");

// ---- request ----
const req = gw.buildRequest(cfg, { user: "u", password: "p" }, { to: "9876543210", message: "hi", templateId: "11007", messageType: "TRANSACTIONAL" });
const body = JSON.parse(req.init.body);
assert.strictEqual(req.url, gw.DEFAULT_API_URL); assert.strictEqual(req.init.headers.Authorization, "Basic " + Buffer.from("u:p").toString("base64"));
assert.deepStrictEqual(body.destinationAddress, ["919876543210"]); assert.strictEqual(body.dltTemplateId, "11007"); assert.strictEqual(body.entityId, "1101234567890"); assert.strictEqual(body.sourceAddress, "APNATR"); assert.strictEqual(body.customerId, "C1"); assert.strictEqual(body.message, "hi"); assert.strictEqual(body.messageType, "TRANSACTIONAL");
ok("request carries entity id, header, template id, +91 number, Basic login");

// ---- reply judging ----
assert.strictEqual(gw.judgeGatewayReply(200, '{"status":"SUCCESS","messageRequestId":"abc"}').ok, true);
assert.strictEqual(gw.judgeGatewayReply(200, "").ok, true);
assert.strictEqual(gw.judgeGatewayReply(200, '{"status":"FAILED","message":"Template mismatch"}').ok, false);
assert.strictEqual(gw.judgeGatewayReply(200, '{"success":false}').ok, false);
assert.strictEqual(gw.judgeGatewayReply(200, '{"error":"bad"}').ok, false);
assert.strictEqual(gw.judgeGatewayReply(401, '{"message":"Unauthorized"}').ok, false); assert.ok(/HTTP 401/.test(gw.judgeGatewayReply(401, "x").detail));
assert.strictEqual(gw.judgeGatewayReply(500, "x".repeat(2000)).detail.length < 700, true);
ok("a refusal hidden inside HTTP 200 is a failure; a plain success is not");

// ---- sending (fake gateway, never throws) ----
(async () => {
  const calls = [];
  const fakeFetch = (reply) => async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { status: reply.status, text: async () => reply.body }; };
  const base = { cfg, creds: { user: "u", password: "p" }, kind: "otp", to: "+91 98765-43210", vars: ["482913"] };
  let r = await gw.sendDltSms({ ...base, fetchImpl: fakeFetch({ status: 200, body: '{"status":"SUCCESS"}' }) });
  assert.strictEqual(r.ok, true); assert.strictEqual(calls[0].body.message, "482913 is your OTP."); assert.strictEqual(calls[0].body.messageType, "TRANSACTIONAL"); assert.deepStrictEqual(calls[0].body.destinationAddress, ["919876543210"]); ok("sends the filled template to the cleaned number");
  r = await gw.sendDltSms({ ...base, to: "12345", fetchImpl: fakeFetch({ status: 200, body: "" }) }); assert.strictEqual(r.reason, "bad_number"); assert.strictEqual(calls.length, 1); ok("a bad number never reaches the gateway");
  r = await gw.sendDltSms({ ...base, kind: "bookingConfirmed", fetchImpl: fakeFetch({ status: 200, body: "" }) }); assert.strictEqual(r.reason, "no_template"); assert.strictEqual(calls.length, 1); ok("a message with no Template ID is not sent");
  r = await gw.sendDltSms({ ...base, creds: { user: "", password: "" }, fetchImpl: fakeFetch({ status: 200, body: "" }) }); assert.strictEqual(r.reason, "no_credentials"); assert.ok(/SMS_API_USER, SMS_API_PASSWORD/.test(r.detail)); ok("missing gateway login names the secrets");
  r = await gw.sendDltSms({ ...base, vars: [], fetchImpl: fakeFetch({ status: 200, body: "" }) }); assert.strictEqual(r.reason, "bad_template"); ok("wrong number of values -> bad_template, nothing sent");
  r = await gw.sendDltSms({ ...base, fetchImpl: fakeFetch({ status: 200, body: '{"status":"FAILED","message":"Header not mapped"}' }) }); assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, "gateway"); assert.ok(/Header not mapped/.test(r.detail)); ok("gateway refusal comes back readable");
  r = await gw.sendDltSms({ ...base, fetchImpl: async () => { throw new Error("ECONNRESET"); } }); assert.strictEqual(r.reason, "network"); assert.ok(/ECONNRESET/.test(r.detail)); ok("network failure never throws");

  // ---- events ----
  assert.strictEqual(ev.shortText("Hinjewadi Phase 1, Rajiv Gandhi Infotech Park, Pune, Maharashtra 411057, India").length <= 30, true);
  assert.strictEqual(ev.shortText("Pune"), "Pune"); assert.strictEqual(ev.shortText(null), ""); ok("place names are shortened for the 30-character variable");
  const rung = { status: "AwaitingDriver", ringTargets: ["9876543210", "+91 98765 43211", "123", "9876543210"], smsSentTo: ["9876543211"] };
  assert.deepStrictEqual(ev.newLoadTargets(rung).targets, ["9876543210"]); ok("new load: only valid, not-yet-texted, de-duplicated drivers");
  assert.deepStrictEqual(ev.newLoadTargets({ ...rung, status: "Ongoing" }).targets, []); assert.deepStrictEqual(ev.newLoadTargets({ ...rung, driverName: "Ravi" }).targets, []); assert.deepStrictEqual(ev.newLoadTargets({ status: "AwaitingDriver" }).targets, []); assert.deepStrictEqual(ev.newLoadTargets(null).targets, []); ok("new load: nothing once taken / no ring list");
  assert.deepStrictEqual(ev.newLoadVars({ pickup: "Pune", drop: "Mumbai" }), ["Pune", "Mumbai"]);
  const bc = ev.bookingConfirmedSms({ customerMobile: "9123456789", driverName: "Ravi" }, { otp: "4821", customerMobile: "9123456789" }, { vehicleSpec: { vehicleNumber: "MH12AB1234" } });
  assert.deepStrictEqual(bc, { to: "9123456789", vars: ["Ravi", "MH12AB1234"] });
  assert.strictEqual(ev.bookingConfirmedSms({}, { otp: "4821", customerMobile: "12" }, null), null); assert.strictEqual(ev.bookingConfirmedSms({}, null, null), null);
  assert.deepStrictEqual(ev.bookingConfirmedSms({ fleetBooking: true, fleetDriverName: "Sonu", fleetVehicleNumber: "MH14XY9999" }, { otp: "1111", customerMobile: "9123456789" }, null).vars, ["Sonu", "MH14XY9999"]);
  assert.deepStrictEqual(ev.bookingConfirmedSms({ driverName: "रवि" }, { otp: "1", customerMobile: "9123456789" }, null).vars, ["your driver", "assigned"]); ok("booking confirmed: customer number, driver and vehicle (fleet vehicles too; a Devanagari name falls back to plain words)");
  assert.deepStrictEqual(ev.kycVars({ name: "Ravi Kumar" }), ["Ravi Kumar"]); assert.deepStrictEqual(ev.kycVars({ name: "रवि" }), ["Driver"]); assert.deepStrictEqual(ev.kycVars(null), ["Driver"]); ok("KYC reminder greets the driver by name (Devanagari / unknown -> Driver)");
  assert.deepStrictEqual(ev.newLoadVars({ pickup: "पुणे स्टेशन", drop: "Mumbai" }), ["the pickup point", "Mumbai"]); ok("a Devanagari address becomes plain words in the new-load SMS");
  console.log("ALL OK");
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
