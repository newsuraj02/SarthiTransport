// IN-APP HELPER (owner 2026-11-24: "an AI agent inside the app to answer all the app related queries, FAQs ... similar to the Meta Ads Manager AI helper on every screen placed at the bottom right
// corner"; name: English "Your Helper", Hindi "अपना मददगार", Marathi "आपला मददगार"; Haiku; Customer + Driver apps only; replies in the language chosen at sign-up = the app's `lang`).
// One round button at the bottom right of every Customer / Driver screen (mounted once in App(), so no screen's own code is touched); it opens a chat panel. The server (askHelper in
// functions/index.js) answers ONLY from functions/helpKnowledge.js; anything it cannot answer shows "Talk to a person" (call / WhatsApp). Nothing about the person is sent -- only the question text,
// the role and the language.
import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, ThumbsUp, ThumbsDown, Phone, MessageCircle } from "lucide-react";
import { askHelperCall, rateHelperCall } from "./firebaseClient";
import { useBackHandler } from "./backButton.js";

export const HELPER_NAME = { en: "Your Helper", hi: "अपना मददगार", mr: "आपला मददगार" };
const POS_KEY = "sarthi_helperPos";
const BLUE = "#0052CC";

const T = {
  hello: { en: "Hello! Ask me anything about using the app.", hi: "नमस्ते! ऐप इस्तेमाल करने के बारे में कुछ भी पूछें।", mr: "नमस्कार! अ‍ॅप वापरण्याबद्दल काहीही विचारा." },
  placeholder: { en: "Type your question", hi: "अपना सवाल लिखें", mr: "तुमचा प्रश्न लिहा" },
  send: { en: "Send", hi: "भेजें", mr: "पाठवा" },
  thinking: { en: "Typing...", hi: "लिख रहा हूँ...", mr: "लिहित आहे..." },
  person: { en: "Talk to a person", hi: "किसी इंसान से बात करें", mr: "व्यक्तीशी बोला" },
  call: { en: "Call", hi: "कॉल", mr: "कॉल" },
  whatsapp: { en: "WhatsApp", hi: "व्हाट्सएप", mr: "व्हॉट्सअ‍ॅप" },
  note: { en: "AI answers can be wrong. Never share your OTP.", hi: "AI के जवाब गलत हो सकते हैं। अपना OTP किसी को न बताएं।", mr: "AI ची उत्तरे चुकीची असू शकतात. तुमचा OTP कोणालाही सांगू नका." },
  limit: { en: "You have reached today's question limit. Please try again tomorrow or talk to a person.", hi: "आज के सवालों की सीमा पूरी हो गई। कल फिर कोशिश करें या किसी इंसान से बात करें।", mr: "आजची प्रश्नांची मर्यादा संपली. उद्या पुन्हा प्रयत्न करा किंवा व्यक्तीशी बोला." },
  down: { en: "I could not answer just now. Please talk to a person.", hi: "अभी जवाब नहीं दे पाया। कृपया किसी इंसान से बात करें।", mr: "आत्ता उत्तर देता आले नाही. कृपया व्यक्तीशी बोला." },
  helpful: { en: "Helpful", hi: "काम का", mr: "उपयुक्त" },
  notHelpful: { en: "Not helpful", hi: "काम का नहीं", mr: "उपयुक्त नाही" },
  close: { en: "Close", hi: "बंद करें", mr: "बंद करा" },
  open: { en: "Help", hi: "मदद", mr: "मदत" },
};
const QUICK = {
  customer: {
    en: ["How do I book a vehicle?", "Why can't I see any vehicles?", "How does the pickup OTP work?", "What is Round trip?"],
    hi: ["गाड़ी कैसे बुक करें?", "मुझे गाड़ियाँ क्यों नहीं दिख रहीं?", "पिकअप OTP कैसे काम करता है?", "राउंड ट्रिप क्या है?"],
    mr: ["गाडी कशी बुक करायची?", "मला गाड्या का दिसत नाहीत?", "पिकअप OTP कसा काम करतो?", "राउंड ट्रिप म्हणजे काय?"],
  },
  driver: {
    en: ["Why am I not getting loads?", "How do I complete my KYC?", "How do I turn duty on?", "How do I add another vehicle?"],
    hi: ["मुझे लोड क्यों नहीं मिल रहे?", "KYC कैसे पूरा करूँ?", "ड्यूटी ऑन कैसे करें?", "दूसरी गाड़ी कैसे जोड़ें?"],
    mr: ["मला लोड का मिळत नाहीत?", "KYC कसे पूर्ण करू?", "ड्यूटी ऑन कशी करायची?", "दुसरी गाडी कशी जोडायची?"],
  },
};
const tr = (key, lang) => (T[key] && (T[key][lang] || T[key].hi)) || "";

function readPos() {
  try { const p = JSON.parse(window.localStorage.getItem(POS_KEY)); if (p && Number.isFinite(p.right) && Number.isFinite(p.bottom)) return p; } catch { /* storage unavailable */ }
  return { right: 12, bottom: 88 };
}

export default function HelperWidget({ role, lang, phone, whatsapp }) {
  const L = HELPER_NAME[lang] ? lang : "hi";
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false); // a text box somewhere else on the screen has the keyboard up
  const [pos, setPos] = useState(readPos);
  const bodyRef = useRef(null);
  const dragRef = useRef(null);
  const busyRef = useRef(false);

  useBackHandler(open, () => setOpen(false), 40); // Android Back closes the panel first

  // Hide the round button while the keyboard is up for another box (it would sit on top of the keyboard / suggestions).
  useEffect(() => {
    const isField = (el) => !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !el.closest("[data-helper-panel]");
    const on = (e) => setTyping(isField(e.target));
    const off = () => setTyping(false);
    document.addEventListener("focusin", on); document.addEventListener("focusout", off);
    return () => { document.removeEventListener("focusin", on); document.removeEventListener("focusout", off); };
  }, []);

  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [msgs, busy, open]);

  const personButtons = (
    <div className="flex items-center gap-2 mt-2" data-helper-person>
      <a href={`tel:${phone}`} className="flex-1 rounded-xl py-2 text-xs font-extrabold text-white flex items-center justify-center gap-1.5" style={{ background: "#00A854" }}><Phone size={14} /> {tr("call", L)}</a>
      <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className="flex-1 rounded-xl py-2 text-xs font-extrabold text-white flex items-center justify-center gap-1.5" style={{ background: "#25D366" }}><MessageCircle size={14} /> {tr("whatsapp", L)}</a>
    </div>
  );

  const ask = async (raw) => {
    const q = String(raw || "").trim();
    if (q.length < 2 || busyRef.current) return;
    busyRef.current = true; setBusy(true); setText("");
    const history = msgs.filter((m) => !m.system).slice(-6).map((m) => ({ role: m.role, text: m.text }));
    setMsgs((prev) => [...prev, { role: "user", text: q }]);
    const r = await askHelperCall({ role, lang: L, question: q, history });
    let reply;
    if (r && r.ok) reply = { role: "assistant", text: r.text || tr("down", L), logId: r.logId, unanswered: !r.answered };
    else if (r && r.reason === "limit") reply = { role: "assistant", text: tr("limit", L), system: true, unanswered: true };
    else reply = { role: "assistant", text: tr("down", L), system: true, unanswered: true };
    setMsgs((prev) => [...prev, reply]);
    busyRef.current = false; setBusy(false);
  };

  const rate = (i, helpful) => {
    setMsgs((prev) => prev.map((m, j) => (j === i ? { ...m, rated: helpful ? "up" : "down" } : m)));
    rateHelperCall(msgs[i] && msgs[i].logId, helpful);
  };

  // Drag the round button (a plain tap still opens the panel). The spot is remembered on this phone only.
  const onDown = (e) => { dragRef.current = { x: e.clientX, y: e.clientY, right: pos.right, bottom: pos.bottom, moved: false }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not supported */ } };
  const onMove = (e) => {
    const d = dragRef.current; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 8) return;
    d.moved = true;
    const right = Math.min(Math.max(8, d.right - dx), Math.max(8, window.innerWidth - 64));
    const bottom = Math.min(Math.max(8, d.bottom - dy), Math.max(8, window.innerHeight - 140));
    setPos({ right, bottom });
  };
  const onUp = () => {
    const d = dragRef.current; dragRef.current = null;
    if (!d) return;
    if (d.moved) { try { window.localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch { /* storage unavailable */ } return; }
    setOpen(true);
  };

  if (!open) {
    if (typing) return null;
    return (
      <button type="button" data-helper-fab aria-label={`${HELPER_NAME[L]} - ${tr("open", L)}`}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { dragRef.current = null; }}
        className="fixed z-[34] w-[52px] h-[52px] rounded-full flex items-center justify-center shadow-lg active:scale-95"
        style={{ right: pos.right, bottom: `calc(env(safe-area-inset-bottom, 0px) + ${pos.bottom}px)`, background: `linear-gradient(135deg, #2A78F0, ${BLUE})`, touchAction: "none", border: "2px solid #fff" }}>
        <Sparkles size={24} color="#fff" />
      </button>
    );
  }

  const quick = (QUICK[role] && (QUICK[role][L] || QUICK[role].hi)) || [];
  return (
    <div data-helper-panel className="fixed z-[58] right-3 left-3 sm:left-auto sm:w-[380px] flex flex-col rounded-3xl shadow-2xl overflow-hidden"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)", height: "min(560px, calc(100dvh - 84px))", background: "#fff", border: "1px solid #D5DCE8" }}>
      <div className="flex items-center gap-2 px-4 py-3 text-white shrink-0" style={{ background: `linear-gradient(135deg, #2A78F0, ${BLUE})` }}>
        <Sparkles size={18} />
        <div className="flex-1 min-w-0 text-sm font-extrabold break-words">{HELPER_NAME[L]} <span className="ml-1 text-[10px] font-bold rounded px-1.5 py-0.5" style={{ background: "rgba(255,255,255,0.22)" }}>AI</span></div>
        <button type="button" onClick={() => setOpen(false)} aria-label={tr("close", L)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.2)" }}><X size={16} /></button>
      </div>

      <div ref={bodyRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5" style={{ background: "#F4F7FB" }}>
        <div className="max-w-[88%] rounded-2xl rounded-bl-md px-3 py-2 text-sm break-words" style={{ background: "#fff", color: "#0F1B2D", border: "1px solid #D5DCE8" }}>{tr("hello", L)}</div>
        {msgs.length === 0 && (
          <div className="flex flex-wrap gap-2 pt-1" data-helper-quick>
            {quick.map((q) => (
              <button key={q} type="button" onClick={() => ask(q)} className="rounded-full px-3 py-1.5 text-xs font-bold text-left break-words" style={{ background: "#fff", color: BLUE, border: `1px solid ${BLUE}` }}>{q}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (m.role === "user" ? (
          <div key={i} className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-md px-3 py-2 text-sm break-words text-white" style={{ background: BLUE }}>{m.text}</div></div>
        ) : (
          <div key={i} className="max-w-[92%]" data-helper-answer>
            <div className="rounded-2xl rounded-bl-md px-3 py-2 text-sm break-words whitespace-pre-wrap" style={{ background: "#fff", color: "#0F1B2D", border: "1px solid #D5DCE8" }}>{m.text}</div>
            {m.unanswered && personButtons}
            {m.logId && !m.unanswered && (
              <div className="flex items-center gap-1.5 mt-1">
                {m.rated ? (
                  <span className="text-[11px]" style={{ color: "#475569" }}>{m.rated === "up" ? "👍" : "👎"}</span>
                ) : (
                  <>
                    <button type="button" onClick={() => rate(i, true)} aria-label={tr("helpful", L)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "#E5EAF2" }}><ThumbsUp size={13} color="#475569" /></button>
                    <button type="button" onClick={() => rate(i, false)} aria-label={tr("notHelpful", L)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "#E5EAF2" }}><ThumbsDown size={13} color="#475569" /></button>
                  </>
                )}
              </div>
            )}
          </div>
        )))}
        {busy && <div className="text-xs px-1" style={{ color: "#475569" }}>{tr("thinking", L)}</div>}
      </div>

      <div className="shrink-0 px-3 pt-2 pb-2 border-t" style={{ borderColor: "#D5DCE8", background: "#fff" }}>
        <form onSubmit={(e) => { e.preventDefault(); ask(text); }} className="flex items-center gap-2">
          <input value={text} onChange={(e) => setText(e.target.value.slice(0, 500))} placeholder={tr("placeholder", L)} maxLength={500}
            className="flex-1 min-w-0 rounded-xl px-3 py-2.5 text-sm outline-none" style={{ border: "1px solid #D5DCE8", background: "#fff", color: "#0F1B2D" }} />
          <button type="submit" disabled={busy || text.trim().length < 2} aria-label={tr("send", L)} className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: busy || text.trim().length < 2 ? "#E5EAF2" : BLUE }}>
            <Send size={16} color={busy || text.trim().length < 2 ? "#94A3B8" : "#fff"} />
          </button>
        </form>
        <div className="flex items-center justify-between gap-2 mt-1.5">
          <div className="text-[10px] flex-1" style={{ color: "#94A3B8" }}>{tr("note", L)}</div>
          <a href={`tel:${phone}`} className="text-[11px] font-bold underline shrink-0" style={{ color: BLUE }}>{tr("person", L)}</a>
        </div>
      </div>
    </div>
  );
}
