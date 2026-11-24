// NATIVE SPEECH (owner 2026-11-24: "a mic on the Helper AND at the right end of the Pickup / Drop boxes, only to take the customer's voice and show suggestions").
//
// The installed Android app's WebView has no speech recognition and the app has no microphone permission, so a mic can only work through the native plugin
// @capacitor-community/speech-recognition (Android's own SpeechRecognizer) -- which ships with the NEXT native build (it adds RECORD_AUDIO itself and `cap sync` wires it in).
// Until that build is installed, `nativeSpeechAvailable()` is false and NOTHING that uses this file shows a mic: the installed app looks exactly as it did.
// No audio is recorded or stored by Apna Transport; the phone's speech service turns the voice into text and only the text is used.
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { useEffect, useState } from "react";

const LOCALE = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" };
export const speechLocale = (lang) => LOCALE[lang] || "hi-IN";

let availPromise = null;
// true only inside the installed app AND only when this build has the plugin AND the phone has a speech service. Asked once.
export function nativeSpeechAvailable() {
  if (!availPromise) {
    availPromise = (async () => {
      try {
        if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("SpeechRecognition")) return false;
        const r = await SpeechRecognition.available();
        return !!(r && r.available);
      } catch { return false; }
    })();
  }
  return availPromise;
}

// React hook: false until we know the plugin works, so a mic button never flashes up and then disappears.
export function useNativeSpeech() {
  const [ok, setOk] = useState(false);
  useEffect(() => { let alive = true; nativeSpeechAvailable().then((v) => { if (alive) setOk(!!v); }); return () => { alive = false; }; }, []);
  return ok;
}

let session = null; // the one listening session at a time

export async function stopNativeListening() {
  const s = session;
  if (!s) return;
  s.finish("");
  try { await SpeechRecognition.stop(); } catch { /* already stopped */ }
}

// Listens ONCE. onPartial(text) fires as the words come in; onDone(text, problem) fires exactly once at the end
// (problem: "" | "denied" | "unsupported" | "nospeech"). Returns true when listening really began.
export async function startNativeListening({ lang, onPartial, onDone }) {
  await stopNativeListening();
  try {
    let perm = await SpeechRecognition.checkPermissions();
    if (!perm || perm.speechRecognition !== "granted") perm = await SpeechRecognition.requestPermissions();
    if (!perm || perm.speechRecognition !== "granted") { onDone("", "denied"); return false; }
  } catch { onDone("", "unsupported"); return false; }

  let last = ""; let stoppedAt = 0; let finished = false; let endTimer = null; let idleTimer = null; let handles = [];
  const finish = (problem) => {
    if (finished) return;
    finished = true;
    clearTimeout(endTimer); clearTimeout(idleTimer);
    handles.forEach((h) => { try { h.remove(); } catch { /* ignore */ } });
    handles = [];
    if (session && session.finish === finish) session = null;
    const text = last.trim();
    onDone(text, text ? "" : (problem || "nospeech"));
  };
  session = { finish };
  try {
    handles.push(await SpeechRecognition.addListener("partialResults", (d) => {
      const t = d && d.matches && d.matches[0];
      if (!t) return;
      last = t; clearTimeout(idleTimer);
      if (onPartial) onPartial(t);
      if (stoppedAt) { clearTimeout(endTimer); endTimer = setTimeout(() => finish(""), 250); } // the final text arrived after "stopped"
    }));
    handles.push(await SpeechRecognition.addListener("listeningState", (d) => {
      if (d && d.status === "stopped") { stoppedAt = Date.now(); clearTimeout(endTimer); endTimer = setTimeout(() => finish(""), 1200); } // wait a moment for the final text
    }));
    idleTimer = setTimeout(() => finish("nospeech"), 12000); // nothing heard at all
    await SpeechRecognition.start({ language: speechLocale(lang), maxResults: 1, partialResults: true, popup: false });
    return true;
  } catch { finish("unsupported"); return false; }
}
