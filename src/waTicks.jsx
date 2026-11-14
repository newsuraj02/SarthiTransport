// WHATSAPP DELIVERY TICKS in Admin (owner 2026-11-14: "the WhatsApp bulk message must have a sent and read mark just like WhatsApp does on every single entry ... double tick send,
// double blue tick read"). The state per driver is written by the Cloud Functions (functions/whatsappStatus.js) into `whatsappStatus/{mobile}`; AdminPanel provides it through
// WaStatusContext and every driver row shows its ticks:
//   clock          = MSG91 accepted it, WhatsApp has not confirmed yet
//   one grey tick  = sent to WhatsApp
//   two grey ticks = delivered to the phone
//   two BLUE ticks = read
//   red !          = failed (the reason is the tooltip)
import React, { createContext, useContext, useEffect, useState } from "react";
import { C } from "./App.jsx";
import { getWhatsAppWebhookInfo } from "./firebaseClient";

export const WaStatusContext = createContext({});
export const useWaStatus = () => useContext(WaStatusContext);

const KIND_TEXT = {
  reinstall: ["Reinstall offer", "रीइंस्टॉल ऑफ़र", "रीइन्स्टॉल ऑफर"], kycIncomplete: ["KYC incomplete", "KYC अधूरा", "KYC अपूर्ण"],
  gpsOff: ["GPS off", "GPS बंद", "GPS बंद"], offDuty: ["Off duty", "ऑफ ड्यूटी", "ऑफ ड्युटी"],
};
const STATUS_TEXT = {
  submitted: ["Sending...", "भेज रहे हैं...", "पाठवत आहे..."], sent: ["Sent", "भेजा गया", "पाठवले"], delivered: ["Delivered", "पहुँच गया", "पोहोचले"],
  read: ["Read", "पढ़ लिया", "वाचले"], failed: ["Failed", "भेजा नहीं जा सका", "पाठवता आले नाही"],
};
const pickText = (arr, lang) => (lang === "en" ? arr[0] : lang === "mr" ? arr[2] : arr[1]);
const rankOf = { submitted: 1, sent: 2, delivered: 3, read: 4 };

// The driver's latest WhatsApp message: { kind, status, ... } or null.
export function latestWaState(map, mobile) {
  const e = map && mobile ? map[mobile] : null;
  if (!e || !e.byKind) return null;
  const kind = e.lastKind && e.byKind[e.lastKind] ? e.lastKind : Object.keys(e.byKind)[0];
  return kind ? { kind, ...e.byKind[kind] } : null;
}

const tickColor = (status) => (status === "read" ? "#53BDEB" : "#8696A0");

// One or two overlapping check marks, drawn like WhatsApp's.
function Check({ x, color }) {
  return <path d={`M${x + 1} 8.5 L${x + 4} 11.5 L${x + 10} 4.5`} fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />;
}

export function WaTicks({ mobile, lang = "en", compact = false }) {
  const map = useWaStatus();
  const st = latestWaState(map, mobile);
  if (!st) return null;
  const color = tickColor(st.status);
  const label = `${pickText(STATUS_TEXT[st.status] || STATUS_TEXT.submitted, lang)}${KIND_TEXT[st.kind] ? ` · ${pickText(KIND_TEXT[st.kind], lang)}` : ""}${st.status === "failed" && st.reason ? ` · ${st.reason}` : ""}`;
  return (
    <span data-wa-ticks={st.status} data-wa-kind={st.kind} title={label} aria-label={label} className="inline-flex items-center gap-1 shrink-0" style={{ color }}>
      <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">
        {st.status === "submitted" && <g fill="none" stroke="#8696A0" strokeWidth="1.5" strokeLinecap="round"><circle cx="9" cy="7" r="4.6" /><path d="M9 4.6 V7 L10.8 8.2" /></g>}
        {st.status === "sent" && <Check x={3} color={color} />}
        {(st.status === "delivered" || st.status === "read") && (<><Check x={1} color={color} /><Check x={6} color={color} /></>)}
        {st.status === "failed" && <g fill="none" stroke={C.safety} strokeWidth="1.6" strokeLinecap="round"><circle cx="9" cy="7" r="5.2" /><path d="M9 4.2 V7.6" /><path d="M9 9.6 V9.7" /></g>}
      </svg>
      {!compact && <span className="text-[10px] font-bold" style={{ color: st.status === "failed" ? C.safety : C.inkSoft }}>{pickText(STATUS_TEXT[st.status] || STATUS_TEXT.submitted, lang)}</span>}
    </span>
  );
}

// "Sent 12 · Delivered 9 · Read 4 · Failed 1" for a list of mobiles and one kind -- shown under a bulk send.
export function waCounts(map, mobiles, kind) {
  const c = { submitted: 0, sent: 0, delivered: 0, read: 0, failed: 0 };
  (mobiles || []).forEach((m) => { const e = map && map[m]; const st = e && e.byKind && e.byKind[kind]; if (st && c[st.status] != null) c[st.status] += 1; });
  // a tick "counts" for every stage it has passed: delivered also counts as sent, read also as delivered
  return { ...c, atLeastSent: c.sent + c.delivered + c.read, atLeastDelivered: c.delivered + c.read };
}

export function WaSummary({ mobiles, kind, lang = "en" }) {
  const map = useWaStatus();
  const c = waCounts(map, mobiles, kind);
  if (c.submitted + c.sent + c.delivered + c.read + c.failed === 0) return null;
  const T = (en, hi, mr) => (lang === "en" ? en : lang === "mr" ? mr : hi);
  return (
    <div data-wa-summary className="rounded-lg px-2.5 py-1.5 mt-2 text-[11px] font-bold flex flex-wrap items-center gap-x-3 gap-y-1" style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.ink }}>
      <span style={{ color: "#8696A0" }}>✓ {T("Sent", "भेजा", "पाठवले")} {c.atLeastSent}</span>
      <span style={{ color: "#8696A0" }}>✓✓ {T("Delivered", "पहुँचा", "पोहोचले")} {c.atLeastDelivered}</span>
      <span style={{ color: "#53BDEB" }}>✓✓ {T("Read", "पढ़ा", "वाचले")} {c.read}</span>
      {c.failed > 0 && <span style={{ color: C.safety }}>! {T("Failed", "फेल", "अयशस्वी")} {c.failed}</span>}
    </div>
  );
}

// Admin -> Settings: the one-time MSG91 hookup (the webhook URL) + whether MSG91 has called it yet.
export function WaSetupCard({ lang = "en" }) {
  const T = (en, hi, mr) => (lang === "en" ? en : lang === "mr" ? mr : hi);
  const [info, setInfo] = useState(null);
  const [copied, setCopied] = useState(false);
  const load = () => { setInfo(null); getWhatsAppWebhookInfo().then(setInfo); };
  useEffect(() => { load(); }, []);
  const lastAt = info && info.ok && info.lastAt ? new Date(info.lastAt).toLocaleString(lang === "en" ? "en-IN" : lang === "mr" ? "mr-IN" : "hi-IN") : "";
  return (
    <div data-wa-setup className="rounded-xl p-4 shadow-sm space-y-2" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
      <div className="text-sm font-extrabold" style={{ color: C.ink }}>{T("WhatsApp delivery ticks", "WhatsApp डिलीवरी टिक", "WhatsApp डिलिव्हरी टिक")}</div>
      <p className="text-[11px] leading-snug" style={{ color: C.inkSoft }}>
        {T("Every driver you message shows ✓ sent, ✓✓ delivered and blue ✓✓ read, like WhatsApp. MSG91 sends these updates to a web address: copy it below and paste it once in MSG91 → Webhooks → WhatsApp → Outbound Report.",
          "जिस ड्राइवर को आप मैसेज भेजते हैं उसके आगे WhatsApp की तरह ✓ भेजा, ✓✓ पहुँचा और नीला ✓✓ पढ़ा दिखता है। ये अपडेट MSG91 एक वेब पते पर भेजता है: नीचे का पता कॉपी करके MSG91 → Webhooks → WhatsApp → Outbound Report में एक बार पेस्ट करें।",
          "तुम्ही मेसेज पाठवलेल्या ड्रायव्हरपुढे WhatsApp सारखे ✓ पाठवले, ✓✓ पोहोचले आणि निळे ✓✓ वाचले दिसते. हे अपडेट MSG91 एका वेब पत्त्यावर पाठवतो: खालील पत्ता कॉपी करून MSG91 → Webhooks → WhatsApp → Outbound Report मध्ये एकदा पेस्ट करा.")}
      </p>
      {info === null && <div className="text-[11px]" style={{ color: C.inkSoft }}>{T("Loading...", "लोड हो रहा है...", "लोड होत आहे...")}</div>}
      {info && !info.ok && (
        <div data-wa-setup-error className="rounded-lg p-2 text-[11px] font-bold break-words" style={{ background: "#FDECEA", color: C.safety }}>
          {T("Could not get the address", "पता नहीं मिल सका", "पत्ता मिळाला नाही")}: {info.reason}{info.detail ? ` - ${info.detail}` : ""} ({T("deploy the functions first", "पहले functions deploy करें", "आधी functions deploy करा")})
          <button type="button" onClick={load} className="ml-2 underline">{T("Retry", "फिर कोशिश", "पुन्हा")}</button>
        </div>
      )}
      {info && info.ok && (
        <>
          <textarea data-wa-setup-url readOnly value={info.url} rows={3} onFocus={(e) => e.target.select()} className="w-full rounded-lg p-2 text-[10px] break-all" style={{ background: C.bg, border: `1px solid ${C.line}`, color: C.ink, fontFamily: "monospace" }} />
          <div className="flex items-center gap-2">
            <button type="button" data-wa-setup-copy onClick={() => { try { navigator.clipboard?.writeText(info.url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable: the box above is selectable */ } }}
              className="rounded-lg px-3 py-2 text-xs font-extrabold" style={{ background: C.navy, color: "#FFFFFF" }}>{copied ? T("Copied ✓", "कॉपी हुआ ✓", "कॉपी झाले ✓") : T("Copy address", "पता कॉपी करें", "पत्ता कॉपी करा")}</button>
            <button type="button" onClick={load} className="rounded-lg px-3 py-2 text-xs font-bold" style={{ background: C.bg, border: `1px solid ${C.line}`, color: C.ink }}>{T("Check again", "फिर जाँचें", "पुन्हा तपासा")}</button>
          </div>
          <div data-wa-setup-status className="text-[11px] font-bold" style={{ color: info.count ? C.success : C.inkSoft }}>
            {info.count
              ? T(`MSG91 is connected. Last update ${lastAt} (${info.count} received).`, `MSG91 जुड़ गया है। आखिरी अपडेट ${lastAt} (${info.count} मिले)।`, `MSG91 जोडले आहे. शेवटचे अपडेट ${lastAt} (${info.count} मिळाले).`)
              : T("MSG91 has not sent anything yet. Paste the address in MSG91, then send one test message.", "MSG91 ने अभी कुछ नहीं भेजा। पता MSG91 में पेस्ट करें, फिर एक टेस्ट मैसेज भेजें।", "MSG91 ने अजून काहीही पाठवले नाही. पत्ता MSG91 मध्ये पेस्ट करा, मग एक टेस्ट मेसेज पाठवा.")}
          </div>
        </>
      )}
    </div>
  );
}
