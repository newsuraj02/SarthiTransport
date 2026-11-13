// ADMIN: LEADS (owner 2026-11-13: "when an enquiry comes from an ad I must know whether it is a customer or a driver ... Name | Phone | Type | Where from | Date | Time").
// One table built from three places:
//   - every customer / driver account (its `leadSource` was saved at sign-up by the deep link they came through; accounts without one show "Other / unknown"),
//   - enquiries Admin typed in by hand (`leads`) -- plain WhatsApp has no API, so a WhatsApp message can only be added by Admin,
//   - WhatsApp-link clicks (`leadClicks`, written by the waClick function): counted per day, no person is known.
// The screen also shows the four links Admin hands out (app links + WhatsApp links, plain and "?src=ad" for advertisements) with Copy buttons.
import React, { useMemo, useState } from "react";
import { Phone, Copy } from "lucide-react";
import { C } from "./App.jsx";
import { replaceDoc, removeDoc } from "./firestoreStore";
import { LEAD_KINDS, leadKindLabel } from "./entryLink.js";
import { cleanNameInput, digitsOnly } from "./inputRules.js";

const T = (lang, en, hi, mr) => (lang === "en" ? en : lang === "mr" ? (mr || hi) : hi);
const pad = (n) => String(n).padStart(2, "0");
const dateText = (ms) => { const d = new Date(ms); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
const timeText = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const toMs = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : Number(v) || 0);
export const SITE_BASE = "https://sarthi-transport-74865.web.app";
const KIND_COLOR = { ad: "#E89828", deeplink: "#0052CC", whatsapp: "#00A854", organic: "#64748B" };

// Pure: customers + drivers + hand-typed enquiries -> rows, newest first. Exported for the invariants.
export function buildLeadRows(customers, drivers, leads) {
  const rows = [];
  (customers || []).forEach((c) => { if (!c || !c.mobile) return; const ls = c.leadSource || null; rows.push({ id: `c_${c.mobile}`, name: c.name || "", mobile: c.mobile, type: "customer", kind: ls && LEAD_KINDS.includes(ls.kind) ? ls.kind : "organic", atMs: toMs(c.createdAt) || Number(ls && ls.at) || 0, manual: false }); });
  (drivers || []).forEach((d) => { if (!d || !d.mobile) return; const ls = d.leadSource || null; rows.push({ id: `d_${d.mobile}`, name: d.name || "", mobile: d.mobile, type: "driver", kind: ls && LEAD_KINDS.includes(ls.kind) ? ls.kind : "organic", atMs: toMs(d.createdAt) || Number(ls && ls.at) || 0, manual: false }); });
  (leads || []).forEach((l) => { if (!l) return; rows.push({ id: `l_${l.id}`, docId: l.id, name: l.name || "", mobile: l.mobile || "", type: l.type === "driver" ? "driver" : "customer", kind: LEAD_KINDS.includes(l.kind) ? l.kind : "whatsapp", atMs: Number(l.atMs) || toMs(l.at), manual: true }); });
  return rows.sort((a, b) => b.atMs - a.atMs);
}
// Pure: clicks per day and role for the last `days` days -> [{ day: "DD/MM/YYYY", customer: n, driver: n }], newest first.
export function clickCounts(clicks, days = 7, now = Date.now()) {
  const since = now - days * 86400000; const map = new Map();
  (clicks || []).forEach((k) => { const ms = Number(k && k.atMs) || toMs(k && k.at); if (!ms || ms < since) return; const day = dateText(ms); const r = map.get(day) || { day, ms, customer: 0, driver: 0 }; r[k.role === "driver" ? "driver" : "customer"] += 1; map.set(day, r); });
  return [...map.values()].sort((a, b) => b.ms - a.ms);
}

export default function AdminLeads({ customers, drivers, leads, leadClicks, lang, onClose }) {
  const [type, setType] = useState("all");         // all | customer | driver
  const [kind, setKind] = useState("all");         // all | ad | deeplink | whatsapp | organic
  const [range, setRange] = useState("30d");       // 7d | 30d | all
  const [copied, setCopied] = useState("");
  const [form, setForm] = useState({ open: false, mobile: "", name: "", type: "customer" });
  const [saving, setSaving] = useState(false);
  const now = Date.now();
  const all = useMemo(() => buildLeadRows(customers, drivers, leads), [customers, drivers, leads]);
  const since = range === "7d" ? now - 7 * 86400000 : range === "30d" ? now - 30 * 86400000 : 0;
  const rows = all.filter((r) => r.atMs >= since && (type === "all" || r.type === type) && (kind === "all" || r.kind === kind));
  const clicks = useMemo(() => clickCounts(leadClicks, 7, now), [leadClicks]); // eslint-disable-line react-hooks/exhaustive-deps
  const links = [
    [T(lang, "Customer app link", "कस्टमर ऐप लिंक", "कस्टमर अ‍ॅप लिंक"), `${SITE_BASE}/customer`], [T(lang, "Customer app link (advertisement)", "कस्टमर ऐप लिंक (विज्ञापन)", "कस्टमर अ‍ॅप लिंक (जाहिरात)"), `${SITE_BASE}/customer?src=ad`],
    [T(lang, "Driver app link", "ड्राइवर ऐप लिंक", "ड्रायव्हर अ‍ॅप लिंक"), `${SITE_BASE}/driver`], [T(lang, "Driver app link (advertisement)", "ड्राइवर ऐप लिंक (विज्ञापन)", "ड्रायव्हर अ‍ॅप लिंक (जाहिरात)"), `${SITE_BASE}/driver?src=ad`],
    [T(lang, "Customer WhatsApp link", "कस्टमर व्हाट्सऐप लिंक", "कस्टमर व्हॉट्सअ‍ॅप लिंक"), `${SITE_BASE}/wa/customer`], [T(lang, "Driver WhatsApp link", "ड्राइवर व्हाट्सऐप लिंक", "ड्रायव्हर व्हॉट्सअ‍ॅप लिंक"), `${SITE_BASE}/wa/driver`],
  ];
  const copy = async (url) => { try { await navigator.clipboard.writeText(url); setCopied(url); setTimeout(() => setCopied(""), 1500); } catch { setCopied("!"); } };
  const mobileOk = form.mobile.length === 10;
  const save = async () => {
    if (!mobileOk || saving) return; setSaving(true);
    const t = Date.now();
    try { await replaceDoc("leads", `${t}_${form.mobile}`, { name: form.name.trim(), mobile: form.mobile, type: form.type, kind: "whatsapp", atMs: t }); setForm({ open: false, mobile: "", name: "", type: "customer" }); } catch (e) { console.error("[leads]", e); }
    setSaving(false);
  };
  const chip = (active, onClick, label, extra = {}) => (
    <button type="button" onClick={onClick} aria-pressed={active} className="rounded-full px-3 py-1 text-[11px] font-extrabold" style={{ background: active ? C.navy : C.paper, color: active ? "#FFFFFF" : C.inkSoft, border: `1px solid ${active ? C.navy : C.line}` }} {...extra}>{label}</button>
  );
  return (
    <div data-admin-leads className="fixed inset-0 z-[70] overflow-y-auto" style={{ background: C.bg }}>
      <div className="max-w-lg mx-auto p-4 pb-10 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold" style={{ color: C.ink }}>{T(lang, "Leads (where they came from)", "लीड्स (कहाँ से आए)", "लीड्स (कुठून आले)")}</h2>
          <button type="button" data-leads-close onClick={onClose} className="rounded-lg px-3 py-2 text-xs font-extrabold" style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.ink }}>{T(lang, "Close", "बंद करें", "बंद करा")}</button>
        </div>

        <div data-leads-links className="rounded-xl p-3 space-y-2" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          <div className="text-xs font-extrabold" style={{ color: C.ink }}>{T(lang, "Your links", "आपके लिंक", "तुमचे लिंक")}</div>
          {links.map(([label, url]) => (
            <div key={url} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold" style={{ color: C.inkSoft }}>{label}</div>
                <div data-leads-link-url className="text-[11px] break-all" style={{ color: C.ink }}>{url}</div>
              </div>
              <button type="button" data-leads-copy onClick={() => copy(url)} className="shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-extrabold flex items-center gap-1" style={{ background: copied === url ? "#E8F7EE" : C.bg, border: `1px solid ${C.line}`, color: C.ink }}>
                <Copy size={12} /> {copied === url ? T(lang, "Copied", "कॉपी हुआ", "कॉपी झाले") : T(lang, "Copy", "कॉपी", "कॉपी")}
              </button>
            </div>
          ))}
        </div>

        <div data-leads-clicks className="rounded-xl p-3" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          <div className="text-xs font-extrabold mb-1" style={{ color: C.ink }}>{T(lang, "WhatsApp link clicks (last 7 days)", "व्हाट्सऐप लिंक क्लिक (पिछले 7 दिन)", "व्हॉट्सअ‍ॅप लिंक क्लिक (मागील 7 दिवस)")}</div>
          {clicks.length === 0
            ? <div className="text-[11px]" style={{ color: C.inkSoft }}>{T(lang, "No clicks yet. WhatsApp does not tell us who clicked, so only counts are shown.", "अभी कोई क्लिक नहीं। व्हाट्सऐप यह नहीं बताता कि किसने क्लिक किया, इसलिए सिर्फ़ गिनती दिखती है।", "अजून क्लिक नाहीत. कुणी क्लिक केले ते व्हॉट्सअ‍ॅप सांगत नाही, म्हणून फक्त संख्या दिसते.")}</div>
            : clicks.map((r) => (
              <div key={r.day} data-leads-click-row className="flex items-center justify-between text-[11px] py-0.5" style={{ color: C.ink }}>
                <span className="font-bold">{r.day}</span>
                <span>{T(lang, "Customer", "कस्टमर", "कस्टमर")} {r.customer} · {T(lang, "Driver", "ड्राइवर", "ड्रायव्हर")} {r.driver}</span>
              </div>
            ))}
        </div>

        {!form.open
          ? <button type="button" data-leads-add-open onClick={() => setForm({ ...form, open: true })} className="w-full rounded-xl py-2.5 text-sm font-extrabold" style={{ background: C.navy, color: "#FFFFFF" }}>+ {T(lang, "Add a WhatsApp enquiry", "व्हाट्सऐप पूछताछ जोड़ें", "व्हॉट्सअ‍ॅप चौकशी जोडा")}</button>
          : (
            <div data-leads-add-form className="rounded-xl p-3 space-y-2" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
              <div className="text-xs font-extrabold" style={{ color: C.ink }}>{T(lang, "Someone messaged you on WhatsApp", "किसी ने व्हाट्सऐप पर संदेश भेजा", "कुणीतरी व्हॉट्सअ‍ॅपवर संदेश पाठवला")}</div>
              <input data-leads-add-mobile inputMode="numeric" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: digitsOnly(e.target.value, 10) })} placeholder={T(lang, "10 digit mobile", "10 अंकों का मोबाइल", "10 अंकी मोबाइल")} className="w-full rounded-lg p-2.5 text-sm font-bold outline-none" style={{ background: C.bg, border: `1px solid ${C.line}`, color: C.ink }} />
              <input data-leads-add-name value={form.name} onChange={(e) => setForm({ ...form, name: cleanNameInput(e.target.value) })} placeholder={T(lang, "Name (optional)", "नाम (वैकल्पिक)", "नाव (ऐच्छिक)")} className="w-full rounded-lg p-2.5 text-sm font-bold outline-none" style={{ background: C.bg, border: `1px solid ${C.line}`, color: C.ink }} />
              <div className="flex gap-2">
                {[["customer", T(lang, "Customer", "कस्टमर", "कस्टमर")], ["driver", T(lang, "Driver", "ड्राइवर", "ड्रायव्हर")]].map(([k, label]) => (
                  <button key={k} type="button" data-leads-add-type={k} aria-pressed={form.type === k} onClick={() => setForm({ ...form, type: k })} className="flex-1 rounded-lg py-2 text-xs font-extrabold" style={{ background: form.type === k ? C.navy : C.bg, color: form.type === k ? "#FFFFFF" : C.ink, border: `1px solid ${C.line}` }}>{label}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button" data-leads-add-save disabled={!mobileOk || saving} onClick={save} className="flex-1 rounded-lg py-2 text-xs font-extrabold" style={{ background: mobileOk && !saving ? C.success : "#E5EAF2", color: mobileOk && !saving ? "#FFFFFF" : "#9AA3B0" }}>{saving ? "…" : T(lang, "Save", "सेव करें", "सेव्ह करा")}</button>
                <button type="button" onClick={() => setForm({ open: false, mobile: "", name: "", type: "customer" })} className="flex-1 rounded-lg py-2 text-xs font-extrabold" style={{ background: C.bg, color: C.ink, border: `1px solid ${C.line}` }}>{T(lang, "Cancel", "रद्द करें", "रद्द करा")}</button>
              </div>
            </div>
          )}

        <div className="flex flex-wrap gap-1.5" data-leads-type-chips>
          {chip(type === "all", () => setType("all"), T(lang, "All", "सब", "सर्व"))}
          {chip(type === "customer", () => setType("customer"), T(lang, "Customer", "कस्टमर", "कस्टमर"), { "data-leads-type": "customer" })}
          {chip(type === "driver", () => setType("driver"), T(lang, "Driver", "ड्राइवर", "ड्रायव्हर"), { "data-leads-type": "driver" })}
        </div>
        <div className="flex flex-wrap gap-1.5" data-leads-kind-chips>
          {chip(kind === "all", () => setKind("all"), T(lang, "Any source", "कोई भी", "कोणताही"))}
          {LEAD_KINDS.map((k) => chip(kind === k, () => setKind(k), leadKindLabel(k, lang), { key: k, "data-leads-kind": k }))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1.5">
            {[["7d", T(lang, "7 days", "7 दिन", "7 दिवस")], ["30d", T(lang, "30 days", "30 दिन", "30 दिवस")], ["all", T(lang, "All", "सब", "सर्व")]].map(([k, label]) => chip(range === k, () => setRange(k), label, { key: k, "data-leads-range": k }))}
          </div>
          <div data-leads-count className="text-[11px] font-bold" style={{ color: C.inkSoft }}>{rows.length} {T(lang, "rows", "पंक्तियाँ", "ओळी")}</div>
        </div>

        {rows.length === 0
          ? <div className="rounded-xl p-6 text-center text-sm font-semibold" style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.inkSoft }}>{T(lang, "Nothing here yet.", "यहाँ अभी कुछ नहीं।", "इथे अजून काही नाही.")}</div>
          : (
            <div className="space-y-2">
              {rows.slice(0, 200).map((r) => (
                <div key={r.id} data-lead-row={r.id} data-lead-type={r.type} data-lead-kind={r.kind} className="rounded-xl p-3 flex items-start gap-2.5" style={{ background: C.paper, border: `2px solid ${C.line}` }}>
                  <div className="flex-1 min-w-0">
                    <div data-lead-name className="text-sm font-extrabold break-words min-w-0" style={{ color: C.ink }}>{r.name || T(lang, "(no name)", "(नाम नहीं)", "(नाव नाही)")}</div>
                    <div className="text-[11px] font-semibold" style={{ color: C.inkSoft }}>{r.mobile}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span data-lead-type-pill className="rounded-full px-2 py-0.5 text-[10px] font-extrabold" style={{ background: r.type === "driver" ? "#FFF4D6" : "rgba(0,82,204,0.10)", color: r.type === "driver" ? C.marigoldDeep : C.navy }}>{r.type === "driver" ? T(lang, "Driver", "ड्राइवर", "ड्रायव्हर") : T(lang, "Customer", "कस्टमर", "कस्टमर")}</span>
                      <span data-lead-kind-pill className="rounded-full px-2 py-0.5 text-[10px] font-extrabold" style={{ background: KIND_COLOR[r.kind], color: "#FFFFFF" }}>{leadKindLabel(r.kind, lang)}</span>
                    </div>
                    <div data-lead-when className="text-[11px] mt-1" style={{ color: C.inkSoft }}>{r.atMs ? `${dateText(r.atMs)} · ${timeText(r.atMs)}` : "—"}</div>
                  </div>
                  {r.mobile && <a href={`tel:+91${r.mobile}`} data-lead-call className="shrink-0 p-2.5 rounded-lg flex items-center justify-center" style={{ background: C.success, color: "#FFFFFF" }} aria-label="Call"><Phone size={16} /></a>}
                  {r.manual && <button type="button" data-lead-delete onClick={() => { if (window.confirm(T(lang, "Delete this enquiry?", "यह पूछताछ हटाएँ?", "ही चौकशी हटवायची?"))) removeDoc("leads", r.docId).catch((e) => console.error(e)); }} className="shrink-0 px-2 py-1 text-[11px] font-bold rounded-lg" style={{ background: C.bg, border: `1px solid ${C.line}`, color: C.inkSoft }}>✕</button>}
                </div>
              ))}
              {rows.length > 200 && <div className="text-center text-[11px]" style={{ color: C.inkSoft }}>{T(lang, `Showing the newest 200 of ${rows.length}.`, `${rows.length} में से नवीनतम 200 दिख रहे हैं।`, `${rows.length} पैकी नवीनतम 200 दिसत आहेत.`)}</div>}
            </div>
          )}
      </div>
    </div>
  );
}
