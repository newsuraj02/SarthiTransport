// ADMIN LIST SEARCH BAR (owner 2026-11-23). One component for every Admin list: when the list has MORE THAN 20 entries (src/adminListSearch.js) a search box shows above it;
// 20 or fewer = exactly the old list, no box. The search looks through the WHOLE list, not just what is on screen.
import React, { useState } from "react";
import { C } from "./App.jsx";
import { needsListSearch, filterByQuery } from "./adminListSearch.js";

const T = (lang, en, hi, mr) => (lang === "en" ? en : lang === "mr" ? mr : hi);

export function ListSearchBox({ value, onChange, lang, shown, total, placeholder }) {
  return (
    <div className="mb-2" data-list-search-wrap>
      <input data-list-search type="search" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || T(lang, "Search by name, mobile or vehicle number...", "नाम, मोबाइल या गाड़ी नंबर से खोजें...", "नाव, मोबाइल किंवा गाडी नंबरने शोधा...")}
        className="w-full rounded-lg px-3 py-2 text-xs outline-none" style={{ border: `1px solid ${C.line}`, background: C.paper, color: C.ink }} />
      {value.trim() && (
        <div className="text-[10px] font-semibold mt-1" style={{ color: C.inkSoft }}>
          {T(lang, `${shown} of ${total}`, `${total} में से ${shown}`, `${total} पैकी ${shown}`)}
        </div>
      )}
    </div>
  );
}

export const noMatchText = (lang) => T(lang, "Nothing matches your search.", "आपकी खोज से कुछ नहीं मिला।", "तुमच्या शोधाशी काहीही जुळले नाही.");

// items: the full list. renderItem(item, index): same signature the lists already use. textOf(item): what the entry is searched by.
export default function SearchableList({ items, renderItem, textOf, lang, className = "space-y-1.5", placeholder }) {
  const [q, setQ] = useState("");
  const list = items || [];
  const bar = needsListSearch(list.length);
  const shown = bar ? filterByQuery(list, q, textOf) : list;
  return (
    <div>
      {bar && <ListSearchBox value={q} onChange={setQ} lang={lang} shown={shown.length} total={list.length} placeholder={placeholder} />}
      {bar && q.trim() && shown.length === 0
        ? <p className="text-xs text-center py-6" style={{ color: C.inkSoft }}>{noMatchText(lang)}</p>
        : <div className={className}>{shown.map(renderItem)}</div>}
    </div>
  );
}
