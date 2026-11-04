// In-app speech input for the Pickup / Drop boxes (owner 2026-11-04: "I want it to work independently in the app").
//
// Three engines, best first:
//   "native" -- Android's own SpeechRecognizer through the @capacitor-community/speech-recognition plugin (needs the native build that
//               contains the plugin + the RECORD_AUDIO permission). Works inside the installed app, no keyboard involved.
//   "web"    -- the browser's Web Speech API (Chrome and a few WebViews).
//   "none"   -- neither; the caller falls back to the keyboard's own mic with a hint.
//
// startSpeech() gives every engine the same shape: live partial text while the person speaks, ONE final text, or ONE error code:
//   "denied"      microphone permission refused
//   "no-speech"   nothing was heard
//   "unavailable" this engine cannot run on this phone (caller should stop offering it and use the keyboard mic)
//
// Pure logic, no React: testable on its own (scripts/verifyInvariants.mjs runs it against fake engines).

import { Capacitor } from "@capacitor/core";
import { SpeechRecognition as NativeSpeech } from "@capacitor-community/speech-recognition";

export const SPEECH_MAX_MS = 15000; // hard stop so the microphone can never stay open

export function speechLocale(lang) { return lang === "en" ? "en-IN" : lang === "mr" ? "mr-IN" : "hi-IN"; }

export function pickSpeechEngine(env = {}) {
  const cap = env.Capacitor || Capacitor;
  const win = env.window || (typeof window !== "undefined" ? window : null);
  if (cap && cap.isNativePlatform && cap.isNativePlatform() && cap.isPluginAvailable && cap.isPluginAvailable("SpeechRecognition")) return "native";
  if (win && (win.SpeechRecognition || win.webkitSpeechRecognition)) return "web";
  return "none";
}

// `deps` lets tests inject fake engines; the app passes nothing.
export function startSpeech({ lang, onStart = () => {}, onPartial = () => {}, onResult = () => {}, onError = () => {} }, deps = {}) {
  const engine = deps.engine || pickSpeechEngine(deps);
  let done = false, latest = "", cancelled = false, stopFn = async () => {};
  const timers = [];
  const clear = () => timers.forEach(clearTimeout);
  const finish = (text) => {
    if (done) return; done = true; clear();
    if (cancelled) return;
    const t = String(text || "").trim();
    if (t) onResult(t); else onError("no-speech");
  };
  const fail = (code) => { if (done) return; done = true; clear(); if (!cancelled) onError(code); };
  timers.push(setTimeout(() => { try { stopFn(); } catch { /* ignore */ } }, SPEECH_MAX_MS));

  if (engine === "native") {
    const plugin = deps.native || NativeSpeech;
    (async () => {
      try {
        const av = await plugin.available();
        if (!av || av.available === false) return fail("unavailable");
        let perm = await plugin.checkPermissions();
        if (!perm || perm.speechRecognition !== "granted") perm = await plugin.requestPermissions();
        if (!perm || perm.speechRecognition !== "granted") return fail("denied");
        await plugin.removeAllListeners();
        await plugin.addListener("partialResults", (d) => { const m = d && d.matches && d.matches[0]; if (m) { latest = String(m); if (!done) onPartial(latest); } });
        await plugin.addListener("listeningState", (d) => { if (d && d.status === "stopped") { plugin.removeAllListeners().catch(() => {}); finish(latest); } });
        stopFn = async () => { try { await plugin.stop(); } catch { /* already stopped */ } finish(latest); };
        if (cancelled) { await stopFn(); return; }
        await plugin.start({ language: speechLocale(lang), maxResults: 1, partialResults: true, popup: false });
        if (!done && !cancelled) onStart();
      } catch (e) {
        const msg = String((e && (e.message || e.errorMessage)) || e || "").toLowerCase();
        if (/no match|timeout|speech/.test(msg)) finish(latest);
        else if (/permission|denied/.test(msg)) fail("denied");
        else fail("unavailable");
      }
    })();
    return { engine, stop: () => stopFn(), cancel: () => { cancelled = true; clear(); Promise.resolve(stopFn()).catch(() => {}); done = true; } };
  }

  if (engine === "web") {
    const Rec = deps.WebSpeech || (typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null);
    let rec = null; const startedAt = Date.now();
    try {
      rec = new Rec();
      rec.lang = speechLocale(lang); rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false;
      rec.onstart = () => { if (!done && !cancelled) onStart(); };
      rec.onresult = (ev) => {
        let text = "", isFinal = false;
        for (let i = 0; i < (ev.results ? ev.results.length : 0); i++) { const r = ev.results[i]; text += (r[0] && r[0].transcript) || ""; if (r.isFinal) isFinal = true; }
        latest = text.trim();
        if (latest && !done) onPartial(latest);
        if (isFinal) finish(latest);
      };
      rec.onerror = (ev) => { const e = ev && ev.error; if (e === "no-speech" || e === "aborted") finish(latest); else if (e === "not-allowed") fail("denied"); else fail("unavailable"); };
      rec.onend = () => { if (done) return; if (!latest && Date.now() - startedAt < 1200) fail("unavailable"); else finish(latest); };
      stopFn = async () => { try { rec.stop(); } catch { /* already stopped */ } };
      rec.start();
    } catch { fail("unavailable"); }
    return { engine, stop: () => stopFn(), cancel: () => { cancelled = true; clear(); done = true; try { rec && rec.abort ? rec.abort() : rec && rec.stop(); } catch { /* ignore */ } } };
  }

  setTimeout(() => fail("unavailable"), 0);
  return { engine: "none", stop: () => {}, cancel: () => { cancelled = true; done = true; clear(); } };
}
