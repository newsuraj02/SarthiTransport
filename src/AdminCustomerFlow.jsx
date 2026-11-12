// ADMIN: CUSTOMER ACTIVITY (owner 2026-11-12: "I want every single entry by the Customer in the flow to be tracked and put in the exact category of the selection (Current,
// Current Return, Advance, Advance Return) ... unfinished attempts, even a single tap on any of the screen ... track the Customer screen end to end").
// Reads the `customerFlow` sessions the customers' apps write (src/customerFlow.js). Four tabs = the four categories; every session shows who it is (name + a Call button),
// how far they got (vehicle / Pickup / Drop / day / Book tapped / Booked), whether it is still going, finished or abandoned, and -- behind the arrow -- the whole timeline of taps
// and steps. ONE ENTRY PER CUSTOMER (owner 2026-11-12: "a single entry for every customer and all the tries inside it"): the customer's tries (sessions) are listed INSIDE their one entry;
// one customer open at a time, and one try's timeline open at a time, like the Customer / Driver lists.
import React, { useMemo, useState } from "react";
import { Phone, ChevronDown } from "lucide-react";
import { C, vehicleCategoryText } from "./App.jsx";
import { FLOW_GROUP_KEYS, flowStatus, groupFlowSessions, groupSessionsByCustomer, calledAdmin, bookingPrefillFromTries } from "./customerFlow.js";

const T = (lang, en, hi, mr) => (lang === "en" ? en : lang === "mr" ? (mr || hi) : hi);
const pad = (n) => String(n).padStart(2, "0");
const clock = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const dayClock = (ms) => { const d = new Date(ms); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const createdMs = (b) => (b && b.createdAt && typeof b.createdAt.toMillis === "function" ? b.createdAt.toMillis() : Number(b && b.createdAt) || 0);

const STAGE_TEXT = {
  opened: ["Opened the screen", "स्क्रीन खोली", "स्क्रीन उघडली"],
  vehicle: ["Picked a vehicle", "गाड़ी चुनी", "गाडी निवडली"],
  pickup: ["Entered Pickup", "पिकअप भरा", "पिकअप भरले"],
  drop: ["Entered Drop", "ड्रॉप भरा", "ड्रॉप भरले"],
  day: ["Chose the day", "दिन चुना", "दिवस निवडला"],
  book_tapped: ["Tapped Book now", "बुक नाउ दबाया", "बुक नाउ दाबले"],
  booked: ["Booked", "बुक किया", "बुक केले"],
};
const EVENT_TEXT = {
  screen: ["Screen", "स्क्रीन", "स्क्रीन"], step: ["Step", "स्टेप", "स्टेप"], tap: ["Tap", "टैप", "टॅप"], vehicle: ["Vehicle", "गाड़ी", "गाडी"], pickup: ["Pickup", "पिकअप", "पिकअप"], drop: ["Drop", "ड्रॉप", "ड्रॉप"],
  pickup_typed: ["Pickup typed", "पिकअप लिखा", "पिकअप टाइप"], drop_typed: ["Drop typed", "ड्रॉप लिखा", "ड्रॉप टाइप"], day: ["Day", "दिन", "दिवस"], round_trip: ["Round trip", "राउंड ट्रिप", "राउंड ट्रिप"],
  book_tap: ["Book now", "बुक नाउ", "बुक नाउ"], book_error: ["Error", "त्रुटि", "त्रुटी"], booked: ["Booked", "बुक हुआ", "बुक झाले"],
};
const STATUS_META = {
  booked: { en: "Booked", hi: "बुक हुआ", mr: "बुक झाले", bg: "#00A854", fg: "#FFFFFF" },
  active: { en: "Active now", hi: "अभी चालू", mr: "आत्ता सुरू", bg: "#0052CC", fg: "#FFFFFF" },
  abandoned: { en: "Not finished", hi: "अधूरा छोड़ा", mr: "अपूर्ण सोडले", bg: "#E89828", fg: "#FFFFFF" },
};

export default function AdminCustomerFlow({ sessions, bookings, lang, onBookFor, onClose }) {
  const [tab, setTab] = useState("all");           // all | current | currentReturn | advance | advanceReturn
  const [range, setRange] = useState("7d");        // today | 7d | all (of the newest sessions loaded)
  const [openMobile, setOpenMobile] = useState(null);   // the one customer entry that is open
  const [openTry, setOpenTry] = useState(null);         // the one try (session) whose timeline is open
  const now = Date.now();
  const titles = {
    current: T(lang, "Current", "करन्ट", "करंट"), currentReturn: T(lang, "Current Return", "करन्ट रिटर्न", "करंट रिटर्न"),
    advance: T(lang, "Advance", "एडवांस", "अ‍ॅडव्हान्स"), advanceReturn: T(lang, "Advance Return", "एडवांस रिटर्न", "अ‍ॅडव्हान्स रिटर्न"),
  };
  const startOfToday = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();
  const since = range === "today" ? startOfToday : range === "7d" ? now - 7 * 86400000 : 0;
  const inRange = useMemo(() => (sessions || []).filter((s) => (Number(s.lastAt) || 0) >= since), [sessions, since]);
  // One entry per customer in every tab: "All" holds every try of the customer, a category tab only that category's tries.
  const perTab = useMemo(() => {
    const o = { all: groupSessionsByCustomer(inRange, null, now) };
    FLOW_GROUP_KEYS.forEach((k) => { o[k] = groupSessionsByCustomer(inRange, k, now); });
    return o;
  }, [inRange]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = perTab[tab] || [];
  const totals = { booked: 0, abandoned: 0, active: 0 };
  list.forEach((c) => c.tries.forEach((t) => { totals[flowStatus(t, now)] += 1; }));
  // The booking a "Booked" try turned into: the same customer's booking created during / just after it.
  const bookingOf = (s) => (bookings || []).find((b) => b.customerMobile === s.customerMobile && createdMs(b) >= (Number(s.startedAt) || 0) - 5000 && createdMs(b) <= (Number(s.lastAt) || 0) + 120000) || null;
  const pill = (st) => { const meta = STATUS_META[st]; return <span data-flow-status-pill className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold" style={{ background: meta.bg, color: meta.fg }}>{T(lang, meta.en, meta.hi, meta.mr)}</span>; };

  // ONE TRY inside a customer's entry
  const tryRow = (s, n) => {
    const st = flowStatus(s, now), open = openTry === s.id;
    const stage = STAGE_TEXT[s.stage] || STAGE_TEXT.opened;
    const bk = st === "booked" ? bookingOf(s) : null;
    return (
      <div key={s.id} data-flow-session={s.id} data-flow-status={st} className="rounded-lg" style={{ background: C.bg, border: `1px solid ${C.line}` }}>
        <button type="button" data-flow-try-toggle aria-expanded={open} onClick={() => setOpenTry(open ? null : s.id)} className="w-full text-left p-2.5 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-extrabold" style={{ color: C.ink }}>{T(lang, "Try", "कोशिश", "प्रयत्न")} {n}</span>
              <span data-flow-try-category className="rounded-full px-2 py-0.5 text-[10px] font-extrabold" style={{ background: "rgba(0,82,204,0.10)", color: C.navy }}>{titles[s.group] || s.group}</span>
              {pill(st)}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: C.inkSoft }}>{T(lang, stage[0], stage[1], stage[2])} · {dayClock(s.lastAt)} · {(s.events || []).length} {T(lang, "steps", "स्टेप", "स्टेप")}{bk ? ` · ${bk.status}` : ""}</div>
          </div>
          <ChevronDown size={14} className="shrink-0" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
        </button>
        {open && (
          <div data-flow-details className="px-2.5 pb-2.5 space-y-2" style={{ borderTop: `1px solid ${C.line}` }}>
            <div className="pt-2 text-[11px] space-y-0.5" style={{ color: C.ink }}>
              <div><b>{T(lang, "Booking type", "बुकिंग प्रकार", "बुकिंग प्रकार")}:</b> {titles[s.group] || s.group}</div>
              {s.categoryKg ? <div data-flow-vehicle-category><b>{T(lang, "Vehicle category", "गाड़ी की श्रेणी", "वाहन श्रेणी")}:</b> {vehicleCategoryText(Math.min(Number(s.categoryKg), 35000), lang)}</div> : null}
              {s.pickup && <div><b>{T(lang, "Pickup", "पिकअप", "पिकअप")}:</b> {s.pickup}</div>}
              {s.drop && <div><b>{T(lang, "Drop", "ड्रॉप", "ड्रॉप")}:</b> {s.drop}</div>}
              {s.scheduledFor && <div><b>{T(lang, "Day", "दिन", "दिवस")}:</b> {s.scheduledFor}</div>}
              <div><b>{T(lang, "Started", "शुरू", "सुरू")}:</b> {dayClock(s.startedAt)}</div>
            </div>
            <div data-flow-timeline className="rounded-lg p-2 space-y-1" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
              {(s.events || []).map((ev, i) => {
                const lab = EVENT_TEXT[ev.e] || [ev.e, ev.e, ev.e];
                return (
                  <div key={i} className="flex gap-2 text-[11px] leading-snug">
                    <span className="shrink-0 font-mono" style={{ color: C.inkSoft }}>{clock(ev.t)}</span>
                    <span className="shrink-0 font-extrabold" style={{ color: ev.e === "book_error" ? C.safety : ev.e === "booked" ? C.success : C.navy }}>{T(lang, lab[0], lab[1], lab[2])}</span>
                    <span className="min-w-0 break-words" style={{ color: C.ink }}>{ev.d}{ev.s ? <span style={{ color: C.inkSoft }}> · {ev.s}</span> : null}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ONE ENTRY PER CUSTOMER
  const customerRow = (c) => {
    const open = openMobile === c.mobile, st = flowStatus(c.latest, now);
    return (
      <div key={c.mobile} data-flow-customer={c.mobile} className="rounded-xl overflow-hidden" style={{ background: C.paper, border: `2px solid ${C.line}` }}>
        <div className="p-3 flex items-center gap-2.5">
          <div className="flex-1 min-w-0">
            <div data-flow-customer-name className="text-sm font-extrabold break-words min-w-0" style={{ color: C.ink }}>{c.name || T(lang, "Customer", "ग्राहक", "ग्राहक")}</div>
            <div data-flow-customer-tags className="flex items-center gap-1.5 flex-wrap mt-0.5">
              {pill(st)}
              {c.tries.some((t) => calledAdmin(t)) && <span data-flow-called-badge className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold" style={{ background: "#FFF4D6", color: C.marigoldDeep, border: `1px solid ${C.marigold}` }}>📞 {T(lang, "Tapped Call", "कॉल दबाया", "कॉल दाबले")}</span>}
            </div>
            <div className="text-[11px] font-semibold" style={{ color: C.inkSoft }}>{c.mobile}</div>
            {(() => { const pf = bookingPrefillFromTries(c); return pf.categoryKg ? <div data-flow-customer-vehicle className="text-[11px] font-bold" style={{ color: C.navy }}>🚚 {vehicleCategoryText(Math.min(pf.categoryKg, 35000), lang)}</div> : null; })()}
            <div data-flow-customer-summary className="text-[11px]" style={{ color: C.inkSoft }}>
              {c.tries.length} {T(lang, c.tries.length === 1 ? "try" : "tries", "कोशिशें", "प्रयत्न")} · {c.booked} {T(lang, "booked", "बुक", "बुक")} · {c.notFinished} {T(lang, "not finished", "अधूरी", "अपूर्ण")} · {dayClock(c.lastAt)}
            </div>
          </div>
          <a href={`tel:+91${c.mobile}`} data-flow-call className="shrink-0 p-2.5 rounded-lg flex items-center justify-center" style={{ background: C.success, color: "#FFFFFF" }} aria-label="Call"><Phone size={16} /></a>
          <button type="button" data-flow-toggle aria-expanded={open} onClick={() => { setOpenMobile(open ? null : c.mobile); setOpenTry(null); }} className="shrink-0 p-2 rounded-lg" style={{ background: C.bg, border: `1px solid ${C.line}` }} aria-label="Details">
            <ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
          </button>
        </div>
        {onBookFor && (
          <div className="px-3 pb-3">
            <button type="button" data-flow-book-for onClick={() => onBookFor(bookingPrefillFromTries(c))} className="w-full rounded-lg py-2 text-xs font-extrabold" style={{ background: C.navy, color: "#FFFFFF" }}>
              {T(lang, "Book for this customer", "इस ग्राहक के लिए बुक करें", "या ग्राहकासाठी बुक करा")}
            </button>
          </div>
        )}
        {open && (
          <div data-flow-tries className="px-3 pb-3 space-y-2" style={{ borderTop: `1px solid ${C.line}` }}>
            <div className="pt-2" />
            {c.tries.map((t, i) => tryRow(t, c.tries.length - i))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div data-customer-activity className="fixed inset-0 z-[70] overflow-y-auto" style={{ background: C.bg }}>
      <div className="max-w-lg mx-auto p-4 pb-10 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold" style={{ color: C.ink }}>{T(lang, "Customer activity", "ग्राहक गतिविधि", "ग्राहक हालचाल")}</h2>
          <button type="button" data-flow-close onClick={onClose} className="rounded-lg px-3 py-2 text-xs font-extrabold" style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.ink }}>{T(lang, "Close", "बंद करें", "बंद करा")}</button>
        </div>
        <p className="text-[11px]" style={{ color: C.inkSoft }}>{T(lang, "One entry per customer, with every try inside it -- even tries that never ended in a booking.", "हर ग्राहक की एक ही एंट्री, उसमें उसकी सारी कोशिशें -- बुकिंग न बनने पर भी।", "प्रत्येक ग्राहकाची एकच एंट्री, त्यात त्याचे सर्व प्रयत्न -- बुकिंग न झाल्यासही.")}</p>
        <div data-flow-tabs className="grid grid-cols-2 gap-2">
          {[["all", T(lang, "All customers", "सभी ग्राहक", "सर्व ग्राहक")], ...FLOW_GROUP_KEYS.map((k) => [k, titles[k]])].map(([k, label], idx) => (
            <button key={k} type="button" data-flow-tab={k} aria-pressed={tab === k} onClick={() => { setTab(k); setOpenMobile(null); setOpenTry(null); }} className={`rounded-xl px-3 py-2.5 text-left ${idx === 0 ? "col-span-2" : ""}`}
              style={{ background: tab === k ? C.navy : C.paper, color: tab === k ? "#FFFFFF" : C.ink, border: `1px solid ${tab === k ? C.navy : C.line}` }}>
              <div className="text-xs font-extrabold">{label}</div>
              <div data-flow-count className="text-lg font-black leading-tight">{perTab[k].length}</div>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1.5">
            {[["today", T(lang, "Today", "आज", "आज")], ["7d", T(lang, "7 days", "7 दिन", "7 दिवस")], ["all", T(lang, "All", "सब", "सर्व")]].map(([k, label]) => (
              <button key={k} type="button" data-flow-range={k} aria-pressed={range === k} onClick={() => setRange(k)} className="rounded-full px-3 py-1 text-[11px] font-extrabold"
                style={{ background: range === k ? C.navy : C.paper, color: range === k ? "#FFFFFF" : C.inkSoft, border: `1px solid ${range === k ? C.navy : C.line}` }}>{label}</button>
            ))}
          </div>
          <div data-flow-summary className="text-[11px] font-bold text-right" style={{ color: C.inkSoft }}>
            {totals.booked} {T(lang, "booked", "बुक", "बुक")} · {totals.abandoned} {T(lang, "not finished", "अधूरी", "अपूर्ण")} · {totals.active} {T(lang, "active", "चालू", "सुरू")}
          </div>
        </div>
        {list.length === 0
          ? <div className="rounded-xl p-6 text-center text-sm font-semibold" style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.inkSoft }}>{T(lang, "Nothing in this category yet.", "इस श्रेणी में अभी कुछ नहीं।", "या श्रेणीत अजून काही नाही.")}</div>
          : <div className="space-y-2">{list.slice(0, 100).map(customerRow)}</div>}
        {list.length > 100 && <div className="text-center text-[11px]" style={{ color: C.inkSoft }}>{T(lang, `Showing the newest 100 of ${list.length}.`, `${list.length} में से नवीनतम 100 दिख रहे हैं।`, `${list.length} पैकी नवीनतम 100 दिसत आहेत.`)}</div>}
      </div>
    </div>
  );
}
