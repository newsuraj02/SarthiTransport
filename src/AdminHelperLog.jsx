// ADMIN: IN-APP HELPER LOG (owner 2026-11-24: the "Your Helper" / "अपना मददगार" AI helper in the Customer + Driver apps). Shows what people asked and how it went, so the helper can be improved:
// "Not answered" = the helper had no answer and handed the person to support; "Not helpful" = the person tapped thumbs-down.
// TEACH AI (owner 2026-11-25: "add a feature called teach AI to answer where some questions are not answered by AI so we will teach AI to answer properly"): every question has a "Teach AI" button; Admin
// writes the correct answer once, it is saved in `helperTaught` and the helper (askHelper in functions/index.js) uses it from then on for that role ("Customers", "Partners" or "Both"). The "Taught" tab lists
// every taught answer with Edit and Delete. Reads the newest 150 `helperLog` entries and the taught answers (both Admin-only by firestore.rules); the log entries carry no name or mobile.
import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { C, genId } from "./App.jsx";
import { subscribeRecent, subscribeCollection, createDoc, patchDoc, removeDoc } from "./firestoreStore";

const T = (lang, en, hi, mr) => (lang === "en" ? en : lang === "mr" ? (mr || hi) : hi);
const pad = (n) => String(n).padStart(2, "0");
const atMs = (l) => (l && l.at && typeof l.at.toMillis === "function" ? l.at.toMillis() : Number(l && l.at) || 0);
const when = (ms) => { if (!ms) return ""; const d = new Date(ms); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const TAUGHT_Q_MAX = 300, TAUGHT_A_MAX = 800; // same caps as functions/helpAgent.js
const taughtMs = (t) => Number(t.updatedAtMs) || atMs({ at: t.createdAt });

export default function AdminHelperLog({ lang, embedded = false }) {
  const [rows, setRows] = useState(null);
  const [taught, setTaught] = useState(null);
  const [openOwn, setOpen] = useState(false);
  const open = embedded ? true : openOwn; // embedded = the Settings dropdown row already opens / closes it (it is only mounted while open, so it only reads then)
  const [filter, setFilter] = useState("unanswered"); // unanswered | down | all | taught
  // The form: { key: "log id" | "new" | "edit:<taught id>", id: taught id when editing, sourceLogId, question, answer, role } -- one open at a time.
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);
  useEffect(() => { if (!open) return undefined; return subscribeRecent("helperLog", (r) => setRows(r), "at", 150, () => setRows([])); }, [open]);
  useEffect(() => { if (!open) return undefined; return subscribeCollection("helperTaught", (r) => setTaught(r), "createdAt", () => setTaught([])); }, [open]);
  const taughtBySource = useMemo(() => { const m = new Map(); (taught || []).forEach((t) => { if (t.sourceLogId) m.set(t.sourceLogId, t); }); return m; }, [taught]);
  const list = useMemo(() => {
    const all = rows || [];
    // "Not answered" is the to-do list: a question that has already been taught leaves it (it stays in All, and in Taught for editing).
    return filter === "unanswered" ? all.filter((l) => l.answered === false && !taughtBySource.has(l.id)) : filter === "down" ? all.filter((l) => l.helpful === false) : all;
  }, [rows, filter, taughtBySource]);
  const n = (f) => (rows || []).filter(f).length;
  const chips = [
    ["unanswered", T(lang, "Not answered", "जवाब नहीं मिला", "उत्तर नाही"), n((l) => l.answered === false && !taughtBySource.has(l.id))],
    ["down", T(lang, "Not helpful", "काम का नहीं", "उपयुक्त नाही"), n((l) => l.helpful === false)],
    ["all", T(lang, "All", "सभी", "सर्व"), (rows || []).length],
    ["taught", T(lang, "Taught", "सिखाया हुआ", "शिकवलेले"), (taught || []).length],
  ];
  const roleLabel = (r) => (r === "both" ? T(lang, "Customers + Partners", "ग्राहक + पार्टनर", "ग्राहक + पार्टनर") : r === "driver" ? T(lang, "Partners (drivers)", "पार्टनर (ड्राइवर)", "पार्टनर (ड्रायव्हर)") : T(lang, "Customers", "ग्राहक", "ग्राहक"));
  const startTeach = (l) => { setFormError(""); setForm({ key: l.id, sourceLogId: l.id, question: l.question || "", answer: "", role: l.role === "driver" ? "driver" : "customer" }); };
  const startNew = () => { setFormError(""); setFilter("taught"); setForm({ key: "new", question: "", answer: "", role: "customer" }); };
  const startEdit = (t) => { setFormError(""); setForm({ key: `edit:${t.id}`, id: t.id, sourceLogId: t.sourceLogId || null, question: t.question || "", answer: t.answer || "", role: t.role || "customer" }); };
  const save = async () => {
    if (!form || saving) return;
    const question = form.question.trim(), answer = form.answer.trim();
    if (question.length < 3) { setFormError(T(lang, "Write the question (at least 3 letters).", "सवाल लिखें (कम से कम 3 अक्षर)।", "प्रश्न लिहा (किमान 3 अक्षरे).")); return; }
    if (answer.length < 5) { setFormError(T(lang, "Write the correct answer (at least 5 letters).", "सही जवाब लिखें (कम से कम 5 अक्षर)।", "योग्य उत्तर लिहा (किमान 5 अक्षरे).")); return; }
    setSaving(true); setFormError("");
    try {
      const data = { question: question.slice(0, TAUGHT_Q_MAX), answer: answer.slice(0, TAUGHT_A_MAX), role: form.role, updatedAtMs: Date.now() };
      if (form.id) await patchDoc("helperTaught", form.id, data);
      else await createDoc("helperTaught", genId("T"), { ...data, sourceLogId: form.sourceLogId || null });
      setForm(null);
    } catch (e) {
      setFormError(T(lang, "Could not save. Check the internet and try again.", "सेव नहीं हो सका। इंटरनेट जाँचकर फिर कोशिश करें।", "सेव्ह होऊ शकले नाही. इंटरनेट तपासून पुन्हा प्रयत्न करा."));
    } finally { setSaving(false); }
  };
  const del = async (id) => { try { await removeDoc("helperTaught", id); } catch (e) { setFormError(T(lang, "Could not delete. Try again.", "डिलीट नहीं हो सका। फिर कोशिश करें।", "डिलीट होऊ शकले नाही. पुन्हा प्रयत्न करा.")); } setConfirmDel(null); };

  const formBox = (
    <div data-teach-form className="mt-2 rounded-lg p-2.5" style={{ background: "#F3F8FF", border: `1px solid ${C.navy}` }}>
      <label className="block text-[11px] font-bold mb-1" style={{ color: C.ink }}>{T(lang, "Question (as users ask it)", "सवाल (जैसे यूज़र पूछते हैं)", "प्रश्न (वापरकर्ते जसे विचारतात)")}</label>
      <input data-teach-question value={form ? form.question : ""} onChange={(e) => setForm({ ...form, question: e.target.value })} maxLength={TAUGHT_Q_MAX} className="w-full rounded-lg px-2.5 py-2 text-xs outline-none mb-2" style={{ border: `1px solid ${C.line}`, background: "#fff", color: C.ink }} />
      <label className="block text-[11px] font-bold mb-1" style={{ color: C.ink }}>{T(lang, "Correct answer", "सही जवाब", "योग्य उत्तर")}</label>
      <textarea data-teach-answer rows={4} value={form ? form.answer : ""} onChange={(e) => setForm({ ...form, answer: e.target.value })} maxLength={TAUGHT_A_MAX} placeholder={T(lang, "Write it in any language; the AI answers in the user's own language.", "किसी भी भाषा में लिखें; AI यूज़र की अपनी भाषा में जवाब देगा।", "कोणत्याही भाषेत लिहा; AI वापरकर्त्याच्या भाषेत उत्तर देईल.")} className="w-full rounded-lg px-2.5 py-2 text-xs outline-none mb-1" style={{ border: `1px solid ${C.line}`, background: "#fff", color: C.ink }} />
      <div className="text-[10px] mb-2" style={{ color: C.inkSoft }}>{form ? form.answer.length : 0} / {TAUGHT_A_MAX}</div>
      <label className="block text-[11px] font-bold mb-1" style={{ color: C.ink }}>{T(lang, "Who gets this answer", "यह जवाब किसे मिलेगा", "हे उत्तर कोणाला मिळेल")}</label>
      <select data-teach-role value={form ? form.role : "customer"} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full rounded-lg px-2.5 py-2 text-xs outline-none mb-2" style={{ border: `1px solid ${C.line}`, background: "#fff", color: C.ink }}>
        <option value="customer">{roleLabel("customer")}</option>
        <option value="driver">{roleLabel("driver")}</option>
        <option value="both">{roleLabel("both")}</option>
      </select>
      <div className="text-[10px] mb-2" style={{ color: C.inkSoft }}>{T(lang, "The AI will use this for similar questions. Everyone in that group can be told it, so do not write private details (anyone's money, documents or numbers other than the support number).", "AI इसे मिलते-जुलते सवालों के लिए इस्तेमाल करेगा। उस समूह के हर व्यक्ति को यह बताया जा सकता है, इसलिए निजी जानकारी (किसी का पैसा, दस्तावेज़ या सपोर्ट नंबर के अलावा नंबर) न लिखें।", "AI हे अशा प्रश्नांसाठी वापरेल. त्या गटातील प्रत्येकाला हे सांगितले जाऊ शकते, म्हणून खासगी माहिती (कोणाचे पैसे, कागदपत्रे किंवा सपोर्ट नंबरशिवाय इतर नंबर) लिहू नका.")}</div>
      {formError && <div data-teach-error className="text-[11px] font-bold mb-2" style={{ color: "#FF2A2A" }}>{formError}</div>}
      <div className="flex gap-2">
        <button data-teach-save type="button" onClick={save} disabled={saving} className="flex-1 rounded-lg py-2 text-xs font-bold text-white" style={{ background: saving ? "#94A3B8" : C.navy }}>{saving ? "…" : T(lang, "Save and teach", "सेव करें और सिखाएँ", "सेव्ह करा आणि शिकवा")}</button>
        <button type="button" onClick={() => { setForm(null); setFormError(""); }} className="flex-1 rounded-lg py-2 text-xs font-bold" style={{ background: "#fff", color: C.inkSoft, border: `1px solid ${C.line}` }}>{T(lang, "Cancel", "रद्द", "रद्द")}</button>
      </div>
    </div>
  );

  const body = (
        <div className="mt-2">
          <div className="text-[11px] mb-2" style={{ color: C.inkSoft }}>{T(lang, "Newest 150 questions. Tap 'Teach AI' on any question to write the correct answer - the helper then answers it properly. No names or numbers are stored.", "सबसे नए 150 सवाल। किसी भी सवाल पर 'AI को सिखाएँ' दबाकर सही जवाब लिखें - फिर हेल्पर सही जवाब देगा। नाम या नंबर सेव नहीं होते।", "सर्वात नवीन 150 प्रश्न. कोणत्याही प्रश्नावर 'AI ला शिकवा' दाबून योग्य उत्तर लिहा - मग हेल्पर योग्य उत्तर देईल. नाव किंवा नंबर साठवले जात नाहीत.")}</div>
          <div className="flex gap-2 mb-2 flex-wrap">
            {chips.map(([k, label, c]) => (
              <button key={k} type="button" data-helper-chip={k} onClick={() => setFilter(k)} className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: filter === k ? C.navy : "#fff", color: filter === k ? "#fff" : C.navy, border: `1px solid ${C.navy}` }}>{label} · {c}</button>
            ))}
          </div>
          {(rows === null || taught === null) && <div className="text-xs" style={{ color: C.inkSoft }}>…</div>}

          {filter === "taught" ? (
            <div data-taught-list>
              <button data-teach-new type="button" onClick={startNew} className="w-full rounded-lg py-2 mb-2 text-xs font-bold" style={{ background: "#fff", color: C.navy, border: `1.5px dashed ${C.navy}` }}>＋ {T(lang, "Teach a new question", "नया सवाल सिखाएँ", "नवीन प्रश्न शिकवा")}</button>
              {form && form.key === "new" && formBox}
              {taught !== null && taught.length === 0 && !form && <div className="text-xs" style={{ color: C.inkSoft }}>{T(lang, "Nothing taught yet. Tap 'Teach AI' on a question, or add one above.", "अभी तक कुछ नहीं सिखाया। किसी सवाल पर 'AI को सिखाएँ' दबाएँ या ऊपर नया जोड़ें।", "अजून काही शिकवले नाही. प्रश्नावर 'AI ला शिकवा' दाबा किंवा वर नवीन जोडा.")}</div>}
              <div className="space-y-2 mt-2">
                {(taught || []).slice().sort((a, b) => taughtMs(b) - taughtMs(a)).map((t) => (
                  <div key={t.id} data-taught-row className="rounded-lg p-2 text-xs break-words" style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.ink }}>
                    <div className="flex items-center gap-1.5 flex-wrap mb-1" style={{ color: C.inkSoft }}>
                      <span>{when(taughtMs(t))}</span>
                      <span className="font-bold rounded-full px-2 py-0.5 text-white" style={{ background: C.navy, fontSize: 10 }}>{roleLabel(t.role)}</span>
                    </div>
                    <div className="font-bold">{t.question}</div>
                    <div className="mt-0.5 whitespace-pre-wrap" style={{ color: C.inkSoft }}>{t.answer}</div>
                    {form && form.key === `edit:${t.id}` ? formBox : (
                      confirmDel === t.id ? (
                        <div data-taught-confirm className="mt-2 flex items-center gap-2">
                          <span className="flex-1 text-[11px] font-bold" style={{ color: "#FF2A2A" }}>{T(lang, "Delete this taught answer?", "यह सिखाया हुआ जवाब डिलीट करें?", "हे शिकवलेले उत्तर डिलीट करायचे?")}</span>
                          <button type="button" data-taught-delete-yes onClick={() => del(t.id)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ background: "#FF2A2A" }}>{T(lang, "Yes, delete", "हाँ, डिलीट", "होय, डिलीट")}</button>
                          <button type="button" onClick={() => setConfirmDel(null)} className="rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: "#fff", color: C.inkSoft, border: `1px solid ${C.line}` }}>{T(lang, "Cancel", "रद्द", "रद्द")}</button>
                        </div>
                      ) : (
                        <div className="mt-2 flex gap-2 justify-end">
                          <button type="button" data-taught-edit onClick={() => startEdit(t)} className="rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: "#fff", color: C.navy, border: `1px solid ${C.navy}` }}>{T(lang, "Edit", "बदलें", "बदला")}</button>
                          <button type="button" data-taught-delete onClick={() => setConfirmDel(t.id)} className="rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: "#fff", color: "#FF2A2A", border: "1px solid #FF2A2A" }}>{T(lang, "Delete", "डिलीट", "डिलीट")}</button>
                        </div>
                      )
                    )}
                  </div>
                ))}
              </div>
              {formError && !form && <div className="text-[11px] font-bold mt-2" style={{ color: "#FF2A2A" }}>{formError}</div>}
            </div>
          ) : (
            <>
              {rows !== null && list.length === 0 && <div className="text-xs" style={{ color: C.inkSoft }}>{T(lang, "Nothing here.", "यहाँ कुछ नहीं।", "इथे काही नाही.")}</div>}
              <div className="space-y-2">
                {list.map((l) => {
                  const done = taughtBySource.get(l.id);
                  return (
                    <div key={l.id} data-helper-log-row className="rounded-lg p-2 text-xs break-words" style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.ink }}>
                      <div className="flex items-center gap-1.5 flex-wrap mb-1" style={{ color: C.inkSoft }}>
                        <span>{when(atMs(l))}</span><span>· {l.role}</span><span>· {String(l.lang || "").toUpperCase()}</span>
                        {l.answered === false && <span className="font-bold" style={{ color: "#E89828" }}>· {T(lang, "Not answered", "जवाब नहीं मिला", "उत्तर नाही")}</span>}
                        {l.restricted === true && <span className="font-bold" style={{ color: "#475569" }}>· {T(lang, "Restricted request", "प्रतिबंधित अनुरोध", "प्रतिबंधित विनंती")}</span>}
                        {l.helpful === false && <span className="font-bold" style={{ color: "#FF2A2A" }}>· 👎</span>}
                        {l.helpful === true && <span className="font-bold" style={{ color: "#00A854" }}>· 👍</span>}
                        {done && <span data-taught-badge className="font-bold" style={{ color: "#00A854" }}>· ✓ {T(lang, "Taught", "सिखाया गया", "शिकवले")}</span>}
                      </div>
                      <div className="font-bold">{l.question}</div>
                      <div className="mt-0.5" style={{ color: C.inkSoft }}>{l.answer}</div>
                      {form && (form.key === l.id || (done && form.key === `edit:${done.id}`)) ? formBox : (l.restricted === true ? null : (
                        <div className="mt-2 flex justify-end">
                          {done
                            ? <button type="button" data-teach-edit-from-row onClick={() => startEdit(done)} className="rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: "#fff", color: C.navy, border: `1px solid ${C.navy}` }}>{T(lang, "Edit taught answer", "सिखाया जवाब बदलें", "शिकवलेले उत्तर बदला")}</button>
                            : <button type="button" data-teach-ai onClick={() => startTeach(l)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ background: C.navy }}>🎓 {T(lang, "Teach AI", "AI को सिखाएँ", "AI ला शिकवा")}</button>}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
  );
  if (embedded) return <div data-admin-helper-log>{body}</div>;
  return (
    <div data-admin-helper-log className="rounded-lg p-3 mt-2 mb-4" style={{ background: C.bg, border: `1px solid ${C.line}` }}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between text-left">
        <div className="text-xs font-bold break-words min-w-0" style={{ color: C.ink }}>{T(lang, "Helper questions (AI helper)", "हेल्पर के सवाल (AI)", "हेल्परचे प्रश्न (AI)")}</div>
        <ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : "none", color: C.inkSoft }} />
      </button>
      {open && body}
    </div>
  );
}
