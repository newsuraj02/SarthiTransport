// ADMIN -> SETTINGS -> "SMS (DLT)" (owner 2026-11-25: "implement the DLT SMS in the app: Signup / Login OTP, Booking confirmed, New load, KYC reminder ... no more MSG91").
// The owner pastes what the DLT portal gave: Entity ID, Header (sender name) and, per message, the Template ID + the EXACT registered text (the {#var#} slots are filled by the app).
// (2026-11-25, owner: "separate dropdown for each in a common box" + ONE Save for the whole Settings screen: this file renders only the DROPDOWN ROWS -- the sender details and one per message -- and has NO Save button of its own;
// the Settings screen's single "Save Changes" calls save() through the ref below and learns of unsaved edits through onDirtyChange.)
// Saved in Firestore `smsConfig/main` (Admin only, firestore.rules). The gateway LOGIN is two Firebase secrets (SMS_API_USER, SMS_API_PASSWORD), never kept here. "Send test SMS" shows the
// gateway's own reply; the OTP switch stays locked until a test OTP SMS was sent successfully, so a wrong setup can never lock people out of login.
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { C } from "./App.jsx";
import { subscribeDoc, mergeDoc } from "./firestoreStore";
import { sendTestSms } from "./firebaseClient";
import SettingsDropdown from "./SettingsDropdown.jsx";

const KINDS = [
  { k: "otp", en: "Sign-up / login OTP", hi: "साइन-अप / लॉगिन OTP", mr: "साइन-अप / लॉगिन OTP", vars: 1 },
  { k: "bookingConfirmed", en: "Booking confirmed (to the customer)", hi: "बुकिंग कन्फर्म (ग्राहक को)", mr: "बुकिंग कन्फर्म (ग्राहकाला)", vars: 2 },
  { k: "newLoad", en: "New load (to drivers)", hi: "नया लोड (ड्राइवर को)", mr: "नवीन लोड (ड्रायव्हरला)", vars: 2 },
  { k: "kycReminder", en: "KYC reminder (Admin's bulk button)", hi: "KYC रिमाइंडर (एडमिन का बटन)", mr: "KYC रिमाइंडर (अ‍ॅडमिन बटण)", vars: 1 },
];
// The registered templates of the APTRNS header (owner 2026-11-25). Shown prefilled the first time, so they only have to be checked and saved.
const DEFAULT_TEXT = {
  otp: "{#numeric#} is your OTP for Apna Transport. Do not share it with anyone. Valid for 10 minutes.",
  bookingConfirmed: "Your Apna Transport booking is confirmed. Driver {#alphanumeric#} and vehicle {#alphanumeric#}. Open the app to track your trip.",
  newLoad: "New load on Apna Transport: pickup {#alphanumeric#}, drop {#alphanumeric#}. Open the app to accept.",
  kycReminder: "Dear {#alphanumeric#}, your Apna Transport KYC is incomplete. Complete it in the app to start getting loads.",
};
const DEFAULT_ID = { otp: "1077167510003843516", bookingConfirmed: "1077397930014615345", newLoad: "1077583850014046823", kycReminder: "1077200630014989738" };
const DEFAULT_TYPE = { otp: "TRANSACTIONAL", bookingConfirmed: "SERVICE_IMPLICIT", newLoad: "SERVICE_IMPLICIT", kycReminder: "SERVICE_IMPLICIT" };
const VAR_RE = /\{#[a-z0-9_]+#\}/gi;
const blank = () => ({ entityId: "1001728310189530441", header: "APTRNS", customerId: "", apiUrl: "", otpEnabled: false, otpTestedAt: 0, templates: Object.fromEntries(KINDS.map(({ k }) => [k, { id: DEFAULT_ID[k], text: DEFAULT_TEXT[k], enabled: true, type: DEFAULT_TYPE[k] }])) });
const fromDoc = (d) => { const b = blank(); if (!d) return b; for (const f of ["entityId", "header", "customerId", "apiUrl"]) b[f] = String(d[f] || ""); b.otpEnabled = d.otpEnabled === true; b.otpTestedAt = Number(d.otpTestedAt) || 0; for (const { k } of KINDS) { const t = (d.templates && d.templates[k]) || {}; b.templates[k] = { id: String(t.id || ""), text: String(t.text || "") || DEFAULT_TEXT[k], enabled: t.enabled !== false, type: String(t.type || "") || DEFAULT_TYPE[k] }; } return b; };

const AdminSmsSettings = forwardRef(function AdminSmsSettings({ lang = "en", openRow = "", setOpenRow = () => {}, onDirtyChange = () => {} }, ref) {
  const T = (en, hi, mr) => (lang === "en" ? en : lang === "mr" ? (mr || hi) : hi);
  const [cfg, setCfg] = useState(blank());
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(true); // the first time (no saved config yet) the prefilled values still have to be saved
  const editedRef = useRef(false); // the Admin typed something since the card opened
  const [testMobile, setTestMobile] = useState("");
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState("");
  useEffect(() => subscribeDoc("smsConfig", "main", (d) => {
    if (d) { if (editedRef.current) setCfg((cur) => ({ ...cur, otpTestedAt: Number(d.otpTestedAt) || 0 })); else { setCfg(fromDoc(d)); setDirty(false); } } // no saved config yet: keep the prefilled values (and Save stays enabled)
    setLoaded(true);
  }), []);
  useEffect(() => { onDirtyChange(dirty); }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  const upd = (patch) => { editedRef.current = true; setCfg((c) => ({ ...c, ...patch })); setDirty(true); };
  const updT = (k, patch) => { editedRef.current = true; setCfg((c) => ({ ...c, templates: { ...c.templates, [k]: { ...c.templates[k], ...patch } } })); setDirty(true); };
  const save = async () => {
    try {
      await mergeDoc("smsConfig", "main", { entityId: cfg.entityId.trim(), header: cfg.header.trim(), customerId: cfg.customerId.trim(), apiUrl: cfg.apiUrl.trim(), otpEnabled: cfg.otpEnabled && cfg.otpTestedAt > 0, templates: cfg.templates });
      editedRef.current = false; setDirty(false);
      return { ok: true };
    } catch (e) { return { ok: false, message: String((e && e.message) || e).slice(0, 120) }; }
  };
  useImperativeHandle(ref, () => ({ save }));
  const test = async (k) => {
    if (!/^[6-9]\d{9}$/.test(testMobile)) { setResults((r) => ({ ...r, [k]: { ok: false, detail: T("Type a 10-digit mobile number first.", "पहले 10 अंकों का मोबाइल नंबर लिखें।", "आधी 10 अंकी मोबाइल नंबर लिहा.") } })); return; }
    setBusy(k); setResults((r) => ({ ...r, [k]: null }));
    const r = await sendTestSms(k, testMobile);
    setResults((x) => ({ ...x, [k]: r }));
    setBusy("");
  };
  const inp = "w-full rounded-lg px-3 py-2 text-sm font-semibold";
  const inpStyle = { border: `1.5px solid ${C.line}`, color: C.ink, background: C.paper };
  const lbl = "text-[11px] font-bold mb-1 block";
  const toggle = (id) => setOpenRow(openRow === id ? "" : id);
  const unsavedNote = dirty && (
    <div data-sms-test-needs-save className="text-[10px] font-bold leading-snug" style={{ color: C.safety }}>{T("Tests use the last SAVED settings -- press Save Changes (bottom of the page) first.", "टेस्ट आख़िरी सेव की हुई सेटिंग्स से होते हैं -- पहले नीचे \"बदलाव सेव करें\" दबाएँ।", "टेस्ट शेवटच्या सेव्ह केलेल्या सेटिंग्जने होतात -- आधी खाली \"बदल सेव्ह करा\" दाबा.")}</div>
  );
  return (
    <div data-sms-settings>
      <div className="text-[11px] font-extrabold mb-1.5 mt-1" style={{ color: C.inkSoft }}>{T("SMS (DLT)", "SMS (DLT)", "SMS (DLT)")}</div>
      <SettingsDropdown id="sms-sender" title={T("SMS -- sender details", "SMS -- भेजने वाले की जानकारी", "SMS -- प्रेषकाची माहिती")} open={openRow === "sms-sender"} onToggle={() => toggle("sms-sender")}>
        <p className="text-[11px] leading-snug" style={{ color: C.inkSoft }}>
          {T("Paste what the DLT portal gave you. The text of each message must be EXACTLY the registered template (the {#numeric#} / {#alphanumeric#} parts are filled in by the app). The SMS gateway login is kept as two secrets (SMS_API_USER, SMS_API_PASSWORD), not here.",
            "DLT पोर्टल से मिली जानकारी यहाँ डालें। हर मैसेज का टेक्स्ट रजिस्टर्ड टेम्पलेट से बिल्कुल वही होना चाहिए ({#numeric#} / {#alphanumeric#} वाले हिस्से ऐप भरता है)। SMS गेटवे का लॉगिन दो सीक्रेट (SMS_API_USER, SMS_API_PASSWORD) में रहता है, यहाँ नहीं।",
            "DLT पोर्टलवरून मिळालेली माहिती येथे टाका. प्रत्येक मेसेजचा मजकूर नोंदणीकृत टेम्पलेटशी तंतोतंत जुळला पाहिजे ({#numeric#} / {#alphanumeric#} भाग अ‍ॅप भरते). SMS गेटवे लॉगिन दोन सीक्रेटमध्ये असते (SMS_API_USER, SMS_API_PASSWORD), येथे नाही.")}
        </p>
        {!loaded && <div className="text-[11px]" style={{ color: C.inkSoft }}>{T("Loading...", "लोड हो रहा है...", "लोड होत आहे...")}</div>}
        <div className="grid grid-cols-2 gap-2">
          <div><label className={lbl} style={{ color: C.inkSoft }}>{T("Entity ID (PE ID)", "एंटिटी ID (PE ID)", "एंटिटी ID (PE ID)")}</label><input data-sms-entity className={inp} style={inpStyle} inputMode="numeric" value={cfg.entityId} onChange={(e) => upd({ entityId: e.target.value })} /></div>
          <div><label className={lbl} style={{ color: C.inkSoft }}>{T("Header (sender name)", "हेडर (भेजने वाले का नाम)", "हेडर (प्रेषकाचे नाव)")}</label><input data-sms-header className={inp} style={inpStyle} value={cfg.header} onChange={(e) => upd({ header: e.target.value })} placeholder="APNATR" /></div>
        </div>
        <div><label className={lbl} style={{ color: C.inkSoft }}>{T("Gateway customer ID (if the gateway gave one)", "गेटवे customer ID (अगर मिला हो)", "गेटवे customer ID (असल्यास)")}</label><input data-sms-customer className={inp} style={inpStyle} value={cfg.customerId} onChange={(e) => upd({ customerId: e.target.value })} /></div>
        <div><label className={lbl} style={{ color: C.inkSoft }}>{T("API URL (leave empty unless the gateway says otherwise)", "API URL (गेटवे के कहे बिना खाली छोड़ें)", "API URL (गेटवेने सांगितल्याशिवाय रिकामे ठेवा)")}</label><input data-sms-url className={inp} style={inpStyle} value={cfg.apiUrl} onChange={(e) => upd({ apiUrl: e.target.value })} placeholder="https://iqsms.airtel.in/api/v1/send-prepaid-sms" /></div>
      </SettingsDropdown>
      {KINDS.map(({ k, vars, ...names }) => {
        const t = cfg.templates[k]; const r = results[k]; const have = (t.text.match(VAR_RE) || []).length;
        const badge = <span className="text-[10px] font-bold" style={{ color: t.enabled ? C.success : C.inkSoft }}>{t.enabled ? T("On", "चालू", "चालू") : T("Off", "बंद", "बंद")}{have === vars ? "" : " ✗"}</span>;
        return (
          <SettingsDropdown key={k} id={`sms-${k}`} title={`SMS -- ${T(names.en, names.hi, names.mr)}`} badge={badge} open={openRow === `sms-${k}`} onToggle={() => toggle(`sms-${k}`)}>
            <div data-sms-kind={k} className="space-y-2">
              <label className="flex items-center gap-1 text-[11px] font-bold" style={{ color: C.inkSoft }}><input type="checkbox" checked={t.enabled} onChange={(e) => updT(k, { enabled: e.target.checked })} /> {T("On", "चालू", "चालू")}</label>
              <input data-sms-template-id className={inp} style={inpStyle} inputMode="numeric" value={t.id} onChange={(e) => updT(k, { id: e.target.value })} placeholder={T("DLT Template ID", "DLT टेम्पलेट ID", "DLT टेम्पलेट ID")} />
              <input data-sms-template-type className={inp} style={inpStyle} value={t.type} onChange={(e) => updT(k, { type: e.target.value })} placeholder="SERVICE_IMPLICIT" aria-label="Message type" />
              <textarea data-sms-template-text rows={3} className={`${inp} text-[12px]`} style={inpStyle} value={t.text} onChange={(e) => updT(k, { text: e.target.value })} />
              <div className="text-[10px] font-semibold" style={{ color: have === vars ? C.inkSoft : C.safety }}>{T(`The app fills ${vars} value(s) in this message; your text has ${have} {#...#} slot(s).`, `ऐप इस मैसेज में ${vars} वैल्यू भरता है; आपके टेक्स्ट में ${have} {#...#} स्लॉट हैं।`, `अ‍ॅप या मेसेजमध्ये ${vars} मूल्ये भरते; तुमच्या मजकुरात ${have} {#...#} स्लॉट आहेत.`)}{have === vars ? " ✓" : " ✗"}</div>
              {k === "otp" && (
                <div data-sms-otp-switch className="rounded-lg p-3" style={{ background: cfg.otpEnabled ? "#E8F7EE" : C.bg, border: `1px solid ${C.line}` }}>
                  <label className="flex items-center gap-2 text-xs font-extrabold" style={{ color: C.ink }}>
                    <input type="checkbox" data-sms-otp-enabled checked={cfg.otpEnabled && cfg.otpTestedAt > 0} disabled={!(cfg.otpTestedAt > 0)} onChange={(e) => upd({ otpEnabled: e.target.checked })} />
                    {T("Send the login / sign-up OTP by this SMS (instead of Firebase)", "लॉगिन / साइन-अप OTP इसी SMS से भेजें (Firebase की जगह)", "लॉगिन / साइन-अप OTP याच SMS ने पाठवा (Firebase ऐवजी)")}
                  </label>
                  <p className="text-[10px] mt-1 leading-snug" style={{ color: C.inkSoft }}>{cfg.otpTestedAt > 0 ? T("A test OTP SMS was sent successfully, so you may switch this on. If SMS ever fails, people still get the Firebase OTP.", "टेस्ट OTP SMS सफलता से गया, इसलिए आप इसे चालू कर सकते हैं। SMS फेल हो तो लोगों को Firebase वाला OTP मिलता रहेगा।", "टेस्ट OTP SMS यशस्वी गेला, म्हणून हे चालू करू शकता. SMS अयशस्वी झाल्यास Firebase OTP मिळत राहील.") : T("Locked: send a test SMS for the OTP message first and make sure it arrives.", "लॉक है: पहले OTP मैसेज का टेस्ट SMS भेजकर देखें कि वह पहुँचा।", "लॉक: आधी OTP मेसेजचा टेस्ट SMS पाठवून तो पोहोचला का ते पहा.")}</p>
                </div>
              )}
              <div><label className={lbl} style={{ color: C.inkSoft }}>{T("Mobile number for the test SMS", "टेस्ट SMS के लिए मोबाइल नंबर", "टेस्ट SMS साठी मोबाइल नंबर")}</label><input data-sms-test-mobile className={inp} style={inpStyle} inputMode="numeric" maxLength={10} value={testMobile} onChange={(e) => setTestMobile(e.target.value.replace(/\D/g, ""))} /></div>
              {unsavedNote}
              <div className="flex items-center gap-2">
                <button type="button" data-sms-test={k} onClick={() => test(k)} disabled={busy === k} className="rounded-lg px-3 py-1.5 text-xs font-extrabold" style={{ background: C.navy, color: "#FFFFFF" }}>{busy === k ? T("Sending...", "भेज रहे हैं...", "पाठवत आहे...") : T("Send test SMS", "टेस्ट SMS भेजें", "टेस्ट SMS पाठवा")}</button>
                {r && <span data-sms-test-result className="text-[11px] font-bold break-words min-w-0" style={{ color: r.ok ? C.success : C.safety }}>{r.ok ? T("Sent ✓ -- check the phone", "भेज दिया ✓ -- फोन देखें", "पाठवले ✓ -- फोन पहा") : `${r.reason || ""} ${r.detail || ""}`}</span>}
              </div>
            </div>
          </SettingsDropdown>
        );
      })}
    </div>
  );
});
export default AdminSmsSettings;
