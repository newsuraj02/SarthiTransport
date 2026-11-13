// ANDROID BACK BUTTON (owner 2026-11-13: "fix all of the above" after the bug hunt found that the phone's Back button had no handling at all: on the Pickup / Drop
// screen, an open menu or any sub-screen it simply closed the app). One small registry: a screen that can go "one step back" registers a handler while it is in that state
// (`useBackHandler(active, fn, priority)`); the root app calls `runBackHandlers()` when Back is pressed -- the highest priority wins (a modal above a sheet above a screen
// above a mode), ties go to the one registered last. A handler returns `false` to say "nothing to do here" (the next one is tried). When nobody handles it the app is
// MINIMISED (like the Home button), never killed.
import { useEffect, useRef } from "react";

const handlers = [];
let seq = 0;

export function registerBackHandler(fn, priority = 0) {
  const h = { fn, priority, seq: ++seq };
  handlers.push(h);
  return () => { const i = handlers.indexOf(h); if (i >= 0) handlers.splice(i, 1); };
}

// Runs the best handler; true = something handled the press.
export function runBackHandlers() {
  const order = handlers.slice().sort((a, b) => (b.priority - a.priority) || (b.seq - a.seq));
  for (const h of order) {
    let r;
    try { r = h.fn(); } catch (e) { console.error("[back button]", e); r = true; }
    if (r !== false) return true;
  }
  return false;
}

export const backHandlerCount = () => handlers.length;

// Registered only while `active`; always calls the LATEST `fn` (no stale closures).
export function useBackHandler(active, fn, priority = 0) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => (active ? registerBackHandler(() => ref.current(), priority) : undefined), [active, priority]);
}
