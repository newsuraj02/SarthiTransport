// ADMIN: IN-APP HELPER LOG (owner 2026-11-24: the "Your Helper" / "अपना मददगार" AI helper in the Customer + Driver apps). Shows what people asked and how it went, so the knowledge file
// (functions/helpKnowledge.js) can be improved: "Not answered" = the helper had no answer and handed the person to support; "Not helpful" = the person tapped thumbs-down.
// Reads the newest 150 `helperLog` entries (Admin-only by firestore.rules); the entries carry no name or mobile -- only role, language, question and answer.
import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { C } from "./App.jsx";
import { subscribeRecent } from "./firestoreStore";

const T = (lang, en, hi, mr) => (lang === "en" ? en : lang === "mr" ? (mr || hi) : hi);
const pad = (n) => String(n).padStart(2, "0");
const atMs = (l) => (l && l.at && typeof l.at.toMillis === "function" ? l.at.toMillis() : Number(l && l.at) || 0);
const when = (ms) => { if (!ms) return ""; const d = new Date(ms); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export default function AdminHelperLog({ lang }) {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("unanswered"); // unanswered | down | all
  useEffect(() => { if (!open) return undefined; return subscribeRecent("helperLog", (r) => setRows(r), "at", 150, () => setRows([])); }, [open]);
  const list = useMemo(() => {
    const all = rows || [];
    return filter === "unanswered" ? all.filter((l) => l.answered === false) : filter === "down" ? all.filter((l) => l.helpful === false) : all;
  }, [rows, filter]);
  const n = (f) => (rows || []).filter(f).length;
  const chips = [
    ["unanswered", T(lang, "Not answered", "जवाब नहीं मिला", "उत्तर नाही"), n((l) => l.answered === false)],
    ["down", T(lang, "Not helpful", "काम का नहीं", "उपयुक्त नाही"), n((l) => l.helpful === false)],
    ["all", T(lang, "All", "सभी", "सर्व"), (rows || []).length],
  ];
  return (
    <div data-admin-helper-log className="rounded-lg p-3 mt-2 mb-4" style={{ background: C.bg, border: `1px solid ${C.line}` }}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between text-left">
        <div className="text-xs font-bold break-words min-w-0" style={{ color: C.ink }}>{T(lang, "Helper questions (AI helper)", "हेल्पर के सवाल (AI)", "हेल्परचे प्रश्न (AI)")}</div>
        <ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : "none", color: C.inkSoft }} />
      </button>
      {open && (
        <div className="mt-2">
          <div className="text-[11px] mb-2" style={{ color: C.inkSoft }}>{T(lang, "Newest 150 questions. 'Not answered' ones show what to add to the helper's knowledge. No names or numbers are stored.", "सबसे नए 150 सवाल। 'जवाब नहीं मिला' वाले बताते हैं कि हेल्पर की जानकारी में क्या जोड़ना है। नाम या नंबर सेव नहीं होते।", "सर्वात नवीन 150 प्रश्न. 'उत्तर नाही' वाले दाखवतात की हेल्परच्या माहितीत काय जोडायचे. नाव किंवा नंबर साठवले जात नाहीत.")}</div>
          <div className="flex gap-2 mb-2 flex-wrap">
            {chips.map(([k, label, c]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: filter === k ? C.navy : "#fff", color: filter === k ? "#fff" : C.navy, border: `1px solid ${C.navy}` }}>{label} · {c}</button>
            ))}
          </div>
          {rows === null && <div className="text-xs" style={{ color: C.inkSoft }}>…</div>}
          {rows !== null && list.length === 0 && <div className="text-xs" style={{ color: C.inkSoft }}>{T(lang, "Nothing here.", "यहाँ कुछ नहीं।", "इथे काही नाही.")}</div>}
          <div className="space-y-2">
            {list.map((l) => (
              <div key={l.id} data-helper-log-row className="rounded-lg p-2 text-xs break-words" style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.ink }}>
                <div className="flex items-center gap-1.5 flex-wrap mb-1" style={{ color: C.inkSoft }}>
                  <span>{when(atMs(l))}</span><span>· {l.role}</span><span>· {String(l.lang || "").toUpperCase()}</span>
                  {l.answered === false && <span className="font-bold" style={{ color: "#E89828" }}>· {T(lang, "Not answered", "जवाब नहीं मिला", "उत्तर नाही")}</span>}
                  {l.helpful === false && <span className="font-bold" style={{ color: "#FF2A2A" }}>· 👎</span>}
                  {l.helpful === true && <span className="font-bold" style={{ color: "#00A854" }}>· 👍</span>}
                </div>
                <div className="font-bold">{l.question}</div>
                <div className="mt-0.5" style={{ color: C.inkSoft }}>{l.answer}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
