// IN-APP HELPER (owner 2026-11-24: "an AI agent inside the app to answer all the app related queries, FAQs ... similar to the Meta Ads Manager AI helper on every screen placed at the bottom right
// corner"; name: English "Your Helper", Hindi "अपना मददगार", Marathi "आपला मददगार"; Haiku; Customer + Driver apps only; replies in the language chosen at sign-up = the app's `lang`).
// One round button at the bottom right of every Customer / Driver screen (mounted once in App(), so no screen's own code is touched); it opens a chat panel. The server (askHelper in
// functions/index.js) answers ONLY from functions/helpKnowledge.js; anything it cannot answer shows "Talk to a person" (call / WhatsApp). Nothing about the person is sent -- only the question text,
// the role and the language.
import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, ThumbsUp, ThumbsDown, Phone, MessageCircle, Mic, Volume2, VolumeX } from "lucide-react";
import { askHelperCall, rateHelperCall, speakHelperCall } from "./firebaseClient";
import { useBackHandler } from "./backButton.js";

export const HELPER_NAME = { en: "Your Helper", hi: "अपना मददगार", mr: "आपला मददगार" };
// The button NEVER moves (owner 2026-11-24: "the AI logo stays constant throughout the app, no change on its placement"): the same spot on every screen, not draggable, no remembered position.
const FAB_RIGHT = 12, FAB_BOTTOM = 88; // px; sits above the fixed Round trip bar and the driver's bottom block
const BLUE = "#0052CC";
const SPEECH_RATE = 0.85; // the app's ONE speaking rate (same as SPEECH_RATE in App.jsx and HELP_SPEECH_RATE on the server)
const VOICE_KEY = "sarthi_helperVoice"; // "0" = muted on this phone (a per-device convenience only)

const T = {
  hello: { en: "Good day. How may I assist you with the Apna Transport app?", hi: "नमस्कार। मैं अपना ट्रांसपोर्ट ऐप के बारे में आपकी क्या सहायता कर सकता हूँ?", mr: "नमस्कार. मी अपना ट्रान्सपोर्ट अ‍ॅपबद्दल आपली कशी मदत करू शकतो?" },
  placeholder: { en: "Type your question", hi: "अपना सवाल लिखें", mr: "तुमचा प्रश्न लिहा" },
  speak: { en: "Tap the microphone and speak your question", hi: "माइक दबाकर अपना प्रश्न बोलें", mr: "माइक दाबून आपला प्रश्न बोला" },
  listening: { en: "Listening... tap to stop", hi: "सुन रहा हूँ... रोकने के लिए दबाएँ", mr: "ऐकत आहे... थांबवण्यासाठी दाबा" },
  micOff: { en: "To speak your question, tap the box below and then the 🎤 microphone on your keyboard. Or simply type it.", hi: "आवाज़ से पूछने के लिए नीचे के बॉक्स पर टैप करें, फिर कीबोर्ड का 🎤 माइक दबाएँ। या सीधे लिखें।", mr: "आवाजाने विचारण्यासाठी खालील बॉक्सवर टॅप करा, मग कीबोर्डवरील 🎤 माइक दाबा. किंवा थेट लिहा." },
  micDenied: { en: "This app cannot use the microphone directly. Tap the box below and then the 🎤 microphone on your keyboard, or type your question.", hi: "यह ऐप सीधे माइक का उपयोग नहीं कर सकता। नीचे के बॉक्स पर टैप करें, फिर कीबोर्ड का 🎤 माइक दबाएँ, या अपना प्रश्न लिखें।", mr: "हे अ‍ॅप थेट माइक वापरू शकत नाही. खालील बॉक्सवर टॅप करा, मग कीबोर्डवरील 🎤 माइक दाबा, किंवा आपला प्रश्न लिहा." },
  noSpeech: { en: "I did not hear anything. Please tap the microphone and try again.", hi: "कुछ सुनाई नहीं दिया। कृपया माइक दबाकर पुनः प्रयास करें।", mr: "काही ऐकू आले नाही. कृपया माइक दाबून पुन्हा प्रयत्न करा." },
  send: { en: "Send", hi: "भेजें", mr: "पाठवा" },
  thinking: { en: "Typing...", hi: "लिख रहा हूँ...", mr: "लिहित आहे..." },
  person: { en: "Talk to a person", hi: "हमारी टीम से बात करें", mr: "आमच्या टीमशी बोला" },
  call: { en: "Call", hi: "कॉल", mr: "कॉल" },
  whatsapp: { en: "WhatsApp", hi: "व्हाट्सएप", mr: "व्हॉट्सअ‍ॅप" },
  note: { en: "AI answers can be wrong. Never share your OTP.", hi: "AI के जवाब गलत हो सकते हैं। अपना OTP किसी को न बताएं।", mr: "AI ची उत्तरे चुकीची असू शकतात. तुमचा OTP कोणालाही सांगू नका." },
  limit: { en: "You have reached today's limit of questions. Kindly try again tomorrow, or speak to our team.", hi: "आज के प्रश्नों की सीमा पूरी हो चुकी है। कृपया कल पुनः प्रयास करें, या हमारी टीम से बात करें।", mr: "आजची प्रश्नांची मर्यादा पूर्ण झाली आहे. कृपया उद्या पुन्हा प्रयत्न करा, किंवा आमच्या टीमशी बोला." },
  down: { en: "I am unable to answer this at the moment. Kindly speak to our team.", hi: "मैं इस समय इसका उत्तर नहीं दे पा रहा हूँ। कृपया हमारी टीम से बात करें।", mr: "मी सध्या याचे उत्तर देऊ शकत नाही. कृपया आमच्या टीमशी बोला." },
  helpful: { en: "Helpful", hi: "काम का", mr: "उपयुक्त" },
  notHelpful: { en: "Not helpful", hi: "काम का नहीं", mr: "उपयुक्त नाही" },
  close: { en: "Close", hi: "बंद करें", mr: "बंद करा" },
  open: { en: "Help", hi: "मदद", mr: "मदत" },
  voiceOn: { en: "Voice on - tap to mute", hi: "आवाज़ चालू - बंद करने के लिए दबाएँ", mr: "आवाज चालू - बंद करण्यासाठी दाबा" },
  voiceOff: { en: "Voice off - tap to turn on", hi: "आवाज़ बंद - चालू करने के लिए दबाएँ", mr: "आवाज बंद - चालू करण्यासाठी दाबा" },
  listen: { en: "Listen to this answer", hi: "यह उत्तर सुनें", mr: "हे उत्तर ऐका" },
  stopListen: { en: "Stop", hi: "रोकें", mr: "थांबवा" },
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
const LOCALE = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" };
const tr = (key, lang) => (T[key] && (T[key][lang] || T[key].hi)) || "";

export default function HelperWidget({ role, lang, phone, whatsapp }) {
  const L = HELPER_NAME[lang] ? lang : "hi";
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false); // a text box somewhere else on the screen has the keyboard up
  const bodyRef = useRef(null);
  const busyRef = useRef(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");     // what the phone has understood so far (shown while speaking)
  const [micIssue, setMicIssue] = useState(""); // "" | "unsupported" | "denied" | "nospeech"
  const recRef = useRef(null);
  const askRef = useRef(null);
  const audioRef = useRef(null);          // the one <audio> that is ever playing
  const idRef = useRef(0);                // message ids (so a spoken answer is found again after the list changes)
  const [speakingId, setSpeakingId] = useState(null);
  const tokenRef = useRef(0);            // bumped by every new speak / stop, so a slow server answer never plays over something newer
  const openRef = useRef(false);
  const [voiceOn, setVoiceOn] = useState(() => { try { return window.localStorage.getItem(VOICE_KEY) !== "0"; } catch { return true; } });
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;

  openRef.current = open;
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

  // VOICE (owner 2026-11-24: "add a Mic button instead of a text box and send button inside the AI helper"). Uses the phone's own speech recognition (Web Speech API) in the app's language;
  // the audio is never recorded or stored by Apna Transport. Where the phone cannot do it (many Android WebViews), the panel shows the typing box instead so the helper is never unusable.
  const SR = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const micOk = !!SR && micIssue !== "unsupported" && micIssue !== "denied";
  const stopListening = () => { try { if (recRef.current) recRef.current.stop(); } catch { /* already stopped */ } };
  const startListening = () => {
    if (!SR || busyRef.current) return;
    if (listening) { stopListening(); return; }
    stopSpeaking();
    setMicIssue(""); setHeard("");
    try {
      const r = new SR();
      r.lang = LOCALE[L] || "hi-IN"; r.interimResults = true; r.maxAlternatives = 1; r.continuous = false;
      let finalText = "", lastText = "";
      r.onresult = (e) => {
        let t = "";
        for (let i = e.resultIndex; i < e.results.length; i++) { const piece = e.results[i][0].transcript; t += piece; if (e.results[i].isFinal) finalText += piece; }
        lastText = finalText || t; setHeard(lastText);
      };
      r.onerror = (e) => {
        const code = e && e.error;
        if (code === "not-allowed" || code === "service-not-allowed") setMicIssue("denied");
        else if (code === "no-speech") setMicIssue("nospeech");
        else if (code && code !== "aborted") setMicIssue("unsupported"); // language-not-supported, audio-capture, network ...: show the typing box (with the keyboard-mic hint)
      };
      r.onend = () => { setListening(false); setHeard(""); const q = (finalText || lastText).trim(); recRef.current = null; if (q.length >= 2 && askRef.current) askRef.current(q); };
      recRef.current = r; r.start(); setListening(true);
    } catch { setMicIssue("unsupported"); setListening(false); }
  };
  useEffect(() => { if (!open && recRef.current) { try { recRef.current.abort(); } catch { /* ignore */ } recRef.current = null; setListening(false); setHeard(""); } }, [open]);

  // VOICE FOR EVERY ANSWER (owner 2026-11-24: "add a voice to every response to the questions by the AI helper"). Each answer is read out in the app's language as soon as it appears (unless the person
  // muted the voice with the speaker button in the header) and has its own listen / stop button. The audio is an MP3 made on the server (speakHelperAnswer) and kept in memory for replays; if
  // that is not possible (offline, service off), the phone's own voice reads it at the same speaking rate; if neither works, the text is simply shown. Only ONE sound plays at a time, and
  // it is stopped when the microphone starts (so the helper never hears itself), when the panel closes and when the voice is muted.
  const stopSpeaking = () => {
    tokenRef.current += 1;
    try { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } } catch { /* ignore */ }
    try { if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel(); } catch { /* ignore */ }
    setSpeakingId(null);
  };
  const speakDevice = (m) => {
    try {
      if (typeof window === "undefined" || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== "function") return;
      window.speechSynthesis.cancel();
      const u = new window.SpeechSynthesisUtterance(m.text);
      u.lang = LOCALE[L] || "hi-IN"; u.rate = SPEECH_RATE;
      u.onend = () => setSpeakingId((cur) => (cur === m.id ? null : cur)); u.onerror = u.onend;
      setSpeakingId(m.id); window.speechSynthesis.speak(u);
    } catch { setSpeakingId(null); }
  };
  const playData = (m, src) => {
    try {
      const a = new Audio(src);
      audioRef.current = a;
      a.onended = () => { if (audioRef.current === a) audioRef.current = null; setSpeakingId((cur) => (cur === m.id ? null : cur)); };
      a.onerror = () => { if (audioRef.current === a) audioRef.current = null; setSpeakingId(null); speakDevice(m); };
      setSpeakingId(m.id);
      const p = a.play();
      if (p && typeof p.catch === "function") p.catch(() => { if (audioRef.current === a) audioRef.current = null; setSpeakingId(null); }); // autoplay blocked: the listen button plays it on a tap
    } catch { setSpeakingId(null); }
  };
  const speakMsg = async (m) => {
    stopSpeaking();
    const my = tokenRef.current;
    if (m.audio) { playData(m, m.audio); return; }
    if (m.logId && !m.system) {
      setSpeakingId(m.id);
      const r = await speakHelperCall(m.logId);
      const stale = my !== tokenRef.current || !openRef.current || !!recRef.current || (!voiceOnRef.current && !m.manual); // something newer happened, or the panel closed / the mic started / voice was muted
      if (r && r.ok && r.audio) {
        const src = `data:${r.mime || "audio/mpeg"};base64,${r.audio}`;
        setMsgs((prev) => prev.map((x) => (x.id === m.id ? { ...x, audio: src } : x)));
        if (!stale) playData(m, src); else if (my === tokenRef.current) setSpeakingId(null);
        return;
      }
      if (stale) { if (my === tokenRef.current) setSpeakingId(null); return; }
    }
    speakDevice(m);
  };
  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    try { window.localStorage.setItem(VOICE_KEY, next ? "1" : "0"); } catch { /* storage unavailable */ }
    if (!next) stopSpeaking();
  };
  useEffect(() => { if (!open) stopSpeaking(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  useEffect(() => () => { stopSpeaking(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const ask = async (raw) => {
    const q = String(raw || "").trim();
    if (q.length < 2 || busyRef.current) return;
    busyRef.current = true; setBusy(true); setText("");
    const history = msgs.filter((m) => !m.system).slice(-6).map((m) => ({ role: m.role, text: m.text }));
    setMsgs((prev) => [...prev, { role: "user", text: q, id: ++idRef.current }]);
    const r = await askHelperCall({ role, lang: L, question: q, history });
    let reply;
    if (r && r.ok) reply = { role: "assistant", text: r.text || tr("down", L), logId: r.logId, unanswered: !r.answered };
    else if (r && r.reason === "limit") reply = { role: "assistant", text: tr("limit", L), system: true, unanswered: true };
    else reply = { role: "assistant", text: tr("down", L), system: true, unanswered: true };
    reply.id = ++idRef.current;
    setMsgs((prev) => [...prev, reply]);
    busyRef.current = false; setBusy(false);
    if (voiceOnRef.current && !recRef.current) speakMsg(reply); // every answer is spoken
  };

  askRef.current = ask;

  const rate = (i, helpful) => {
    setMsgs((prev) => prev.map((m, j) => (j === i ? { ...m, rated: helpful ? "up" : "down" } : m)));
    rateHelperCall(msgs[i] && msgs[i].logId, helpful);
  };

  if (!open) {
    if (typing) return null;
    return (
      <button type="button" data-helper-fab aria-label={`${HELPER_NAME[L]} - ${tr("open", L)}`}
        onClick={() => setOpen(true)}
        className="fixed z-[34] w-[52px] h-[52px] rounded-full flex items-center justify-center shadow-lg active:scale-95"
        style={{ right: FAB_RIGHT, bottom: `calc(env(safe-area-inset-bottom, 0px) + ${FAB_BOTTOM}px)`, background: `linear-gradient(135deg, #2A78F0, ${BLUE})`, border: "2px solid #fff" }}>
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
        <button type="button" data-helper-voice-toggle onClick={toggleVoice} aria-label={tr(voiceOn ? "voiceOn" : "voiceOff", L)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.2)" }}>{voiceOn ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
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
            <button type="button" data-helper-listen onClick={() => (speakingId === m.id ? stopSpeaking() : speakMsg({ ...m, manual: true }))} aria-label={tr(speakingId === m.id ? "stopListen" : "listen", L)}
              className="mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: speakingId === m.id ? BLUE : "#E5EAF2", color: speakingId === m.id ? "#fff" : "#475569" }}>
              {speakingId === m.id ? <VolumeX size={13} /> : <Volume2 size={13} />} {tr(speakingId === m.id ? "stopListen" : "listen", L)}
            </button>
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
        {micOk ? (
          <div className="flex flex-col items-center gap-1.5 pb-1" data-helper-mic-area>
            <button type="button" data-helper-mic onClick={startListening} disabled={busy} aria-label={tr(listening ? "listening" : "speak", L)}
              className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg ${listening ? "animate-pulse" : ""}`}
              style={{ background: busy ? "#E5EAF2" : listening ? "#FF2A2A" : `linear-gradient(135deg, #2A78F0, ${BLUE})`, border: "3px solid #fff", boxShadow: listening ? "0 0 0 6px rgba(255,42,42,0.18)" : undefined }}>
              <Mic size={28} color={busy ? "#94A3B8" : "#fff"} />
            </button>
            <div className="text-xs font-bold text-center break-words px-2" style={{ color: listening ? "#FF2A2A" : "#475569" }} data-helper-mic-label>{heard || tr(listening ? "listening" : "speak", L)}</div>
            {micIssue === "nospeech" && <div className="text-[11px] text-center" style={{ color: "#E89828" }}>{tr("noSpeech", L)}</div>}
          </div>
        ) : (
          <>
            {(!SR || micIssue === "unsupported") && <div className="text-[11px] mb-1.5" style={{ color: "#475569" }} data-helper-mic-note>{tr("micOff", L)}</div>}
            {micIssue === "denied" && <div className="text-[11px] mb-1.5" style={{ color: "#475569" }} data-helper-mic-note>{tr("micDenied", L)}</div>}
            <form onSubmit={(e) => { e.preventDefault(); ask(text); }} className="flex items-center gap-2" data-helper-text-form>
              <input value={text} onChange={(e) => setText(e.target.value.slice(0, 500))} placeholder={tr("placeholder", L)} maxLength={500}
                className="flex-1 min-w-0 rounded-xl px-3 py-2.5 text-sm outline-none" style={{ border: "1px solid #D5DCE8", background: "#fff", color: "#0F1B2D" }} />
              <button type="submit" disabled={busy || text.trim().length < 2} aria-label={tr("send", L)} className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: busy || text.trim().length < 2 ? "#E5EAF2" : BLUE }}>
                <Send size={16} color={busy || text.trim().length < 2 ? "#94A3B8" : "#fff"} />
              </button>
            </form>
          </>
        )}
        <div className="flex items-center justify-between gap-2 mt-1.5">
          <div className="text-[10px] flex-1" style={{ color: "#94A3B8" }}>{tr("note", L)}</div>
          <a href={`tel:${phone}`} className="text-[11px] font-bold underline shrink-0" style={{ color: BLUE }}>{tr("person", L)}</a>
        </div>
      </div>
    </div>
  );
}
