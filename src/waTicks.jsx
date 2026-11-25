// MESSAGE TICKS in Admin's driver rows (owner 2026-11-14, kept 2026-11-25 when the messages became DLT SMS). The state per driver is written by the Cloud Functions
// (functions/smsFunctions.js sendBulkDriverSms) into `whatsappStatus/{mobile}` (the collection keeps its old name); AdminPanel provides it through WaStatusContext:
//   one grey tick  = the SMS gateway accepted the message (there are no delivery receipts)
//   red !          = failed (tap or hover to see the reason)
// (The clock / two grey ticks / two BLUE ticks below belong to the old WhatsApp receipts; nothing writes those states any more.)
import React, { createContext, useContext, useEffect, useState } from "react";
import { C } from "./App.jsx";

export const WaStatusContext = createContext({});
export const useWaStatus = () => useContext(WaStatusContext);

const KIND_TEXT = {
  kycIncomplete: ["KYC incomplete", "KYC अधूरा", "KYC अपूर्ण"],
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

const WHY_TEXT = ["Why it failed", "फेल क्यों हुआ", "अयशस्वी का?"];
const NO_REASON_TEXT = ["No reason was reported (the number may not be on WhatsApp, or the template was not accepted)", "कारण नहीं बताया गया (नंबर WhatsApp पर नहीं होगा, या टेम्पलेट मंज़ूर नहीं हुआ)", "कारण दिले नाही (नंबर WhatsApp वर नसेल, किंवा टेम्पलेट मंजूर नाही)"];

export function WaTicks({ mobile, lang = "en", compact = false }) {
  const map = useWaStatus();
  const [showWhy, setShowWhy] = useState(false); // red "!" only: hover (computer) or tap (phone) shows the reason right there (owner 2026-11-25)
  const st = latestWaState(map, mobile);
  if (!st) return null;
  const color = tickColor(st.status);
  const label = `${pickText(STATUS_TEXT[st.status] || STATUS_TEXT.submitted, lang)}${KIND_TEXT[st.kind] ? ` · ${pickText(KIND_TEXT[st.kind], lang)}` : ""}${st.status === "failed" && st.reason ? ` · ${st.reason}` : ""}`;
  const failed = st.status === "failed";
  const whyText = failed ? (st.reason ? String(st.reason) : pickText(NO_REASON_TEXT, lang)) : "";
  return (
    <span data-wa-ticks={st.status} data-wa-kind={st.kind} title={label} aria-label={label} className={`inline-flex items-center gap-1 shrink-0${failed ? " relative cursor-pointer" : ""}`} style={{ color }}
      {...(failed ? { role: "button", tabIndex: 0, onClick: (e) => { e.stopPropagation(); if (e.nativeEvent && e.nativeEvent.pointerType === "mouse") setShowWhy(true); else setShowWhy((v) => !v); }, onPointerEnter: (e) => { if (e.pointerType === "mouse") setShowWhy(true); }, onPointerLeave: (e) => { if (e.pointerType === "mouse") setShowWhy(false); } } : {})}>
      {failed && showWhy && (
        <span data-wa-fail-reason className="absolute left-0 top-full mt-1 z-40 w-56 rounded-lg px-2.5 py-2 text-[11px] font-semibold leading-snug break-words shadow-lg text-left" style={{ background: C.paper, color: C.ink, border: `1px solid ${C.safety}` }}>
          <span className="block font-extrabold mb-0.5" style={{ color: C.safety }}>{pickText(WHY_TEXT, lang)}{KIND_TEXT[st.kind] ? ` · ${pickText(KIND_TEXT[st.kind], lang)}` : ""}</span>
          {whyText}
        </span>
      )}
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
