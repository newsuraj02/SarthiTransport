// CUSTOMER FLOW TRACKER (owner 2026-11-12: "I want every single entry by the Customer in the flow to be tracked and put in the exact category of the selection
// (Current, Current Return, Advance, Advance Return)" -> "unfinished attempts, even a single tap on any of the screen ... track the Customer screen end to end").
//
// One SESSION = one go at booking: it starts at the customer's first tap / step and ends when a booking is sent ("booked") or after 30 minutes of silence
// (the next tap then starts a fresh session). Every tap in the customer app and every step of the booking flow (vehicle picked, Pickup / Drop typed and chosen,
// day chosen, Round trip ticked, Book tapped, errors) is appended to the session's timeline, and the session carries the CATEGORY the customer is in right now:
// Current / Current Return / Advance / Advance Return (the same four groups as Admin -> Bookings, `bookingGroupKey`). The session is written to Firestore
// `customerFlow/{customerMobile}_{startedAt}` -- Admin reads it (Admin -> Bookings -> "Customer activity").
//
// PRIVACY: only the customer's own screen taps and the places they chose / typed in Pickup and Drop are kept; nothing is read from the PIN / OTP boxes, no keystrokes
// are logged (a typed place is recorded once, when the cursor leaves the box). This file is pure (no React, no Firebase) so the invariants can run it.

import { BOOKING_GROUP_KEYS } from "./bookingGroups.js";

export const FLOW_GROUP_KEYS = BOOKING_GROUP_KEYS;
export const FLOW_IDLE_MS = 30 * 60 * 1000;   // 30 minutes without a tap ends a session
export const FLOW_MAX_EVENTS = 200;           // the Firestore rule caps the timeline at 250
export const FLOW_FLUSH_MS = 1500;            // writes are batched: at most one every 1.5 s

// The category of a session: Advance = the customer is on the Advance Booking screen, Return = Round trip ticked.
export function flowGroupKey(ctx) {
  const adv = !!(ctx && ctx.advance), ret = !!(ctx && ctx.returnTrip);
  return adv ? (ret ? "advanceReturn" : "advance") : (ret ? "currentReturn" : "current");
}

// The furthest step reached, in order (a later stage never goes back to an earlier one inside a session).
export const FLOW_STAGES = ["opened", "vehicle", "pickup", "drop", "day", "book_tapped", "booked"];
const stageRank = (s) => Math.max(0, FLOW_STAGES.indexOf(s));

const squash = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);

// What the customer tapped, as words. `el` is the tapped element's own facts (no DOM needed): { tag, type, text, ariaLabel, title, placeholder, dataTrack }.
// A text / number / password box is named by its placeholder or label only -- NEVER its value.
export function tapLabel(el) {
  if (!el) return "";
  const tag = String(el.tag || "").toLowerCase(), type = String(el.type || "").toLowerCase();
  const named = squash(el.dataTrack, 80) || squash(el.ariaLabel, 80) || squash(el.title, 80);
  if (tag === "input" || tag === "textarea" || tag === "select") {
    if (type === "checkbox" || type === "radio") return named || squash(el.text, 60) || type;
    return `[box] ${named || squash(el.placeholder, 60) || type || tag}`;
  }
  return named || squash(el.text, 70) || tag;
}

// Ready-made rows for Admin: how far the session got, and whether it is finished, still going, or abandoned.
export function flowStatus(s, now = Date.now()) {
  if (!s) return "active";
  if (s.stage === "booked" || s.booked) return "booked";
  return now - (Number(s.lastAt) || 0) > FLOW_IDLE_MS ? "abandoned" : "active";
}

// -> { current: [...], currentReturn: [...], advance: [...], advanceReturn: [...] }, newest activity first.
export function groupFlowSessions(sessions) {
  const out = { current: [], currentReturn: [], advance: [], advanceReturn: [] };
  (sessions || []).forEach((s) => {
    const k = FLOW_GROUP_KEYS.includes(s && s.group) ? s.group : flowGroupKey(s);
    out[k].push(s);
  });
  FLOW_GROUP_KEYS.forEach((k) => out[k].sort((a, b) => (Number(b.lastAt) || 0) - (Number(a.lastAt) || 0)));
  return out;
}

// The recorder. `send(sessionId, doc)` writes the session (the app passes a Firestore merge-write; tests pass a spy); a failing send is swallowed -- tracking must
// never break the app.
export function createFlowRecorder({ mobile, getName = () => "", send, now = Date.now, idleMs = FLOW_IDLE_MS, maxEvents = FLOW_MAX_EVENTS, flushMs = FLOW_FLUSH_MS, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let s = null;                 // the open session, or null
  let timer = null;
  let ctx = { advance: false, returnTrip: false };

  const fresh = (t) => ({
    id: `${mobile}_${t}`, startedAt: t, lastAt: t, stage: "opened", booked: false, closed: false,
    categoryKg: null, pickup: "", drop: "", scheduledFor: null, events: [],
  });
  const doc = () => ({
    customerMobile: String(mobile), customerName: squash(getName(), 60),
    group: flowGroupKey(ctx), advance: !!ctx.advance, returnTrip: !!ctx.returnTrip,
    stage: s.stage, booked: !!s.booked, categoryKg: s.categoryKg, pickup: s.pickup, drop: s.drop, scheduledFor: s.scheduledFor,
    startedAt: s.startedAt, lastAt: s.lastAt, events: s.events.slice(-maxEvents),
  });
  const flushNow = () => {
    if (timer) { clearTimer(timer); timer = null; }
    if (!s || !send) return;
    try { const r = send(s.id, doc()); if (r && typeof r.catch === "function") r.catch(() => {}); } catch { /* tracking must never break the app */ }
  };
  const schedule = () => { if (!timer) timer = setTimer(() => { timer = null; flushNow(); }, flushMs); };

  // type: short code ("tap", "vehicle", "pickup" ...); detail: words; patch: optional facts about where the customer is now
  //   { advance, returnTrip, stage, categoryKg, pickup, drop, scheduledFor, screen }
  const record = (type, detail = "", patch = {}) => {
    if (!mobile) return;
    const t = now();
    if (!s || s.closed || t - s.lastAt > idleMs) {
      if (s && !s.closed) flushNow();                       // the abandoned one is written as it was
      s = fresh(t);
      ctx = { advance: ctx.advance, returnTrip: false };    // a new attempt starts with the form empty; the Current / Advance toggle stays where it is
    }
    if (patch.advance != null) ctx.advance = !!patch.advance;
    if (patch.returnTrip != null) ctx.returnTrip = !!patch.returnTrip;
    if (patch.stage && stageRank(patch.stage) >= stageRank(s.stage)) s.stage = patch.stage;
    if (patch.categoryKg !== undefined) s.categoryKg = patch.categoryKg;
    if (patch.pickup !== undefined) s.pickup = squash(patch.pickup, 160);
    if (patch.drop !== undefined) s.drop = squash(patch.drop, 160);
    if (patch.scheduledFor !== undefined) s.scheduledFor = patch.scheduledFor;
    const ev = { t, e: String(type), d: squash(detail, 140) };
    if (patch.screen) ev.s = squash(patch.screen, 30);
    s.events.push(ev);
    if (s.events.length > maxEvents) s.events = s.events.slice(-maxEvents);
    s.lastAt = t;
    if (type === "booked") { s.stage = "booked"; s.booked = true; s.closed = true; flushNow(); return; }
    schedule();
  };

  return { record, flushNow, getContext: () => ({ ...ctx }), getSession: () => (s ? { ...s, events: s.events.slice() } : null) };
}
