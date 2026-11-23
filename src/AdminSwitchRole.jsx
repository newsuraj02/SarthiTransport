// ADMIN "SWITCH ROLE" BUTTON (owner 2026-11-19: "a Switch button, only Admin can switch ... in every row of the Customer and Driver lists"; also in Customer activity).
// One small component used by every Admin row: it asks for a confirm tap, calls the Admin-only callable `adminSwitchRole` (all the rules live on the server in
// functions/roleSwitch.js) and shows the answer. When the switch worked the row leaves this list (the lists are live), so the result is shown as a toast that outlives the row.
import React, { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { C } from "./App.jsx";
import { adminSwitchRole } from "./firebaseClient";

const T = (lang, en, hi, mr) => (lang === "en" ? en : lang === "mr" ? (mr || hi) : hi);
const ROLE = { driver: ["Driver", "ड्राइवर", "ड्रायव्हर"], customer: ["Customer", "कस्टमर", "कस्टमर"] };
const roleName = (role, lang) => { const r = ROLE[role]; return lang === "en" ? r[0] : lang === "mr" ? r[2] : r[1]; };

// What a Driver still has to settle before the number can stop being a driver (reasons come from the server's `issues`).
export function switchIssueText(issue, lang) {
  switch (issue) {
    case "open-trip": return T(lang, "has an unfinished trip -- finish or cancel it first", "अधूरी ट्रिप है — पहले उसे पूरा या रद्द करें", "अपूर्ण ट्रिप आहे — आधी ती पूर्ण किंवा रद्द करा");
    case "wallet": return T(lang, "has money in the wallet -- settle it (withdraw / transfer) first", "वॉलेट में पैसे हैं — पहले निकासी / ट्रांसफर करके हिसाब पूरा करें", "वॉलेटमध्ये पैसे आहेत — आधी काढून / ट्रान्सफर करून हिशोब पूर्ण करा");
    case "bonus": return T(lang, "has a bonus balance -- settle it first", "बोनस बाकी है — पहले हिसाब पूरा करें", "बोनस बाकी आहे — आधी हिशोब पूर्ण करा");
    case "held-credit": return T(lang, "has money on hold from a cancelled trip -- settle it first", "रद्द ट्रिप की रकम होल्ड में है — पहले हिसाब पूरा करें", "रद्द ट्रिपची रक्कम होल्डमध्ये आहे — आधी हिशोब पूर्ण करा");
    case "pending-money": return T(lang, "has a pending withdrawal / recharge request -- finish it first", "निकासी / रिचार्ज का अनुरोध पेंडिंग है — पहले उसे निपटाएँ", "पैसे काढणे / रिचार्ज विनंती प्रलंबित आहे — आधी ती निपटवा");
    case "fleet-owner": return T(lang, "is a transporter with vehicles -- remove the vehicles first", "ट्रांसपोर्टर है, गाड़ियाँ जुड़ी हैं — पहले गाड़ियाँ हटाएँ", "ट्रान्सपोर्टर आहे, गाड्या जोडलेल्या आहेत — आधी गाड्या काढा");
    case "blocked": return T(lang, "is blocked -- unblock first", "ब्लॉक है — पहले अनब्लॉक करें", "ब्लॉक आहे — आधी अनब्लॉक करा");
    case "open-booking": return T(lang, "has a booking in progress -- let it finish or cancel it first", "बुकिंग चल रही है — पहले पूरी या रद्द करें", "बुकिंग सुरू आहे — आधी पूर्ण किंवा रद्द करा");
    default: return String(issue);
  }
}
export function switchRefusalText(res, lang) {
  if (!res) return T(lang, "Couldn't switch -- try again.", "बदल नहीं सके — फिर कोशिश करें।", "बदलता आले नाही — पुन्हा प्रयत्न करा.");
  if (res.reason === "driver-not-settled" || res.reason === "customer-has-booking") {
    const list = (res.issues || []).map((i) => `• ${switchIssueText(i, lang)}`).join("\n");
    return `${T(lang, "Not switched. This number", "बदला नहीं गया। यह नंबर", "बदलले नाही. हा नंबर")}:\n${list}`;
  }
  if (res.reason === "has-both-roles") return T(lang, "Not switched: this number already has BOTH a Customer and a Driver account (older account). Remove one first.", "बदला नहीं गया: इस नंबर पर कस्टमर और ड्राइवर दोनों अकाउंट हैं (पुराना अकाउंट)। पहले एक हटाएँ।", "बदलले नाही: या नंबरवर कस्टमर आणि ड्रायव्हर दोन्ही खाती आहेत (जुने खाते). आधी एक काढा.");
  if (res.reason === "not-found") return T(lang, "Not switched: no account found for this number.", "बदला नहीं गया: इस नंबर का कोई अकाउंट नहीं मिला।", "बदलले नाही: या नंबरचे खाते सापडले नाही.");
  return T(lang, `Couldn't switch (${res.reason || "error"}). Try again.`, `बदल नहीं सके (${res.reason || "error"})। फिर कोशिश करें।`, `बदलता आले नाही (${res.reason || "error"}). पुन्हा प्रयत्न करा.`);
}

// A message that stays on screen after the row that triggered it has left the list (plain DOM, so it survives any re-render).
export function showSwitchToast(text, ok = true) {
  if (typeof document === "undefined") return;
  document.querySelectorAll("[data-switch-role-toast]").forEach((n) => n.remove());
  const box = document.createElement("div");
  box.setAttribute("data-switch-role-toast", ok ? "ok" : "refused");
  box.style.cssText = `position:fixed;left:12px;right:12px;bottom:16px;z-index:200;max-width:440px;margin:0 auto;padding:12px 14px;border-radius:12px;background:${ok ? "#0B7A43" : "#B3261E"};color:#fff;font:600 13px/1.4 Inter,sans-serif;box-shadow:0 8px 24px rgba(15,27,45,.35);white-space:pre-line;display:flex;gap:10px;align-items:flex-start`;
  const msg = document.createElement("div"); msg.style.flex = "1"; msg.textContent = text;
  const x = document.createElement("button"); x.type = "button"; x.textContent = "✕"; x.setAttribute("aria-label", "Close"); x.style.cssText = "background:transparent;border:0;color:#fff;font-size:16px;font-weight:800;cursor:pointer";
  x.onclick = () => box.remove();
  box.append(msg, x); document.body.appendChild(box);
  setTimeout(() => box.remove(), ok ? 15000 : 25000);
}

// `role` = the role the number HAS today ("driver" | "customer"); the button moves it to the other one.
export default function AdminSwitchRole({ mobile, name, role, lang, compact = false }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const to = role === "driver" ? "customer" : "driver";
  const who = `${name || mobile} (${mobile})`;
  const run = async () => {
    setBusy(true);
    const res = await adminSwitchRole(mobile, to);
    setBusy(false);
    if (res && res.ok) {
      setConfirm(false);
      showSwitchToast(to === "customer"
        ? T(lang, `✓ ${who} is now a Customer. Tell them to open the app, choose Customer and log in with the same PIN.`, `✓ ${who} अब कस्टमर है। उन्हें बताएँ: ऐप खोलें, कस्टमर चुनें और वही PIN डालें।`, `✓ ${who} आता कस्टमर आहे. त्यांना सांगा: अ‍ॅप उघडा, कस्टमर निवडा आणि तोच PIN टाका.`)
        : T(lang, `✓ ${who} is now a Driver with an empty KYC form. Tell them to open the app, choose Driver, log in with the same PIN and fill the full form -- they cannot get loads until it is complete.`, `✓ ${who} अब ड्राइवर है, KYC फ़ॉर्म खाली है। उन्हें बताएँ: ऐप खोलें, ड्राइवर चुनें, वही PIN डालें और पूरा फ़ॉर्म भरें — पूरा होने तक लोड नहीं मिलेगा।`, `✓ ${who} आता ड्रायव्हर आहे, KYC फॉर्म रिकामा आहे. त्यांना सांगा: अ‍ॅप उघडा, ड्रायव्हर निवडा, तोच PIN टाका आणि पूर्ण फॉर्म भरा — पूर्ण होईपर्यंत लोड मिळणार नाही.`), true);
    } else {
      setConfirm(false);
      showSwitchToast(switchRefusalText(res, lang), false);
    }
  };
  if (confirm) {
    return (
      <div data-switch-role-confirm className="rounded-lg p-2.5 space-y-2" style={{ background: "#FFF4D6", border: `1px solid ${C.marigold}` }}>
        <div className="text-[11px] font-bold break-words" style={{ color: C.ink }}>
          {to === "customer"
            ? T(lang, `Switch ${who} from Driver to Customer? Their driver profile is removed (a copy is kept in the log) and they must log in again as a Customer with the same PIN.`, `${who} को ड्राइवर से कस्टमर बनाएँ? उनकी ड्राइवर प्रोफ़ाइल हट जाएगी (कॉपी लॉग में रहेगी) और उन्हें वही PIN से कस्टमर में फिर लॉगिन करना होगा।`, `${who} ला ड्रायव्हरचा कस्टमर करायचे? त्यांची ड्रायव्हर प्रोफाइल निघेल (प्रत लॉगमध्ये राहील) आणि त्यांना तोच PIN वापरून कस्टमर म्हणून पुन्हा लॉगिन करावे लागेल.`)
            : T(lang, `Switch ${who} from Customer to Driver? They become a Driver with an EMPTY KYC form and must fill everything before they can get loads. Their customer profile is removed (a copy is kept in the log).`, `${who} को कस्टमर से ड्राइवर बनाएँ? वे खाली KYC फ़ॉर्म वाले ड्राइवर बनेंगे और लोड पाने से पहले पूरा फ़ॉर्म भरना होगा। उनकी कस्टमर प्रोफ़ाइल हट जाएगी (कॉपी लॉग में रहेगी)।`, `${who} ला कस्टमरचा ड्रायव्हर करायचे? ते रिकाम्या KYC फॉर्मसह ड्रायव्हर होतील आणि लोड मिळण्याआधी पूर्ण फॉर्म भरावा लागेल. त्यांची कस्टमर प्रोफाइल निघेल (प्रत लॉगमध्ये राहील).`)}
        </div>
        <div className="flex gap-2">
          <button type="button" data-switch-role-yes disabled={busy} onClick={run} className="flex-1 rounded-lg py-2 text-xs font-extrabold" style={{ background: C.navy, color: "#FFFFFF", opacity: busy ? 0.6 : 1 }}>
            {busy ? T(lang, "Switching...", "बदल रहे हैं...", "बदलत आहे...") : T(lang, "Yes, switch", "हाँ, बदलें", "होय, बदला")}
          </button>
          <button type="button" data-switch-role-no disabled={busy} onClick={() => setConfirm(false)} className="flex-1 rounded-lg py-2 text-xs font-extrabold" style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.ink }}>{T(lang, "No", "नहीं", "नाही")}</button>
        </div>
      </div>
    );
  }
  return (
    <button type="button" data-switch-role-btn={to} onClick={() => setConfirm(true)} className={`${compact ? "px-2.5 py-1.5" : "w-full py-2"} rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5`} style={{ background: C.paper, border: `1px solid ${C.navy}`, color: C.navy }}>
      <ArrowLeftRight size={13} /> {T(lang, `Switch to ${roleName(to, "en")}`, `${roleName(to, "hi")} बनाएँ`, `${roleName(to, "mr")} करा`)}
    </button>
  );
}
