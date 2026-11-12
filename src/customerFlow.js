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

// ONE ENTRY PER CUSTOMER (owner 2026-11-12: "a single entry for every customer and all the tries inside it; not multiple entries of a single customer"): the sessions (tries) of
// each customer mobile are folded into one customer record, newest activity first, every try kept inside. With `groupKey` only the tries of that category are folded in (a customer
// with tries in several categories then appears once in each category tab, with just that category's tries); with none, every try of the customer.
// -> [{ mobile, name, tries: [session...] (newest first), lastAt, booked, notFinished, latest }] sorted by the customer's latest activity.
export function groupSessionsByCustomer(sessions, groupKey = null, now = Date.now()) {
  const byMobile = new Map();
  (sessions || []).forEach((s) => {
    if (!s || !s.customerMobile) return;
    const k = FLOW_GROUP_KEYS.includes(s.group) ? s.group : flowGroupKey(s);
    if (groupKey && k !== groupKey) return;
    if (!byMobile.has(s.customerMobile)) byMobile.set(s.customerMobile, []);
    byMobile.get(s.customerMobile).push(s);
  });
  const out = [];
  byMobile.forEach((tries, mobile) => {
    tries.sort((a, b) => (Number(b.lastAt) || 0) - (Number(a.lastAt) || 0));
    const named = tries.find((t) => t.customerName);
    out.push({
      mobile, name: named ? named.customerName : "", tries, lastAt: Number(tries[0].lastAt) || 0, latest: tries[0],
      booked: tries.filter((t) => flowStatus(t, now) === "booked").length, notFinished: tries.filter((t) => flowStatus(t, now) === "abandoned").length,
    });
  });
  return out.sort((x, y) => y.lastAt - x.lastAt);
}

// The "Can't fill Pickup / Drop? Call us" button (App.jsx, data-call-to-book) has no tracking of its own: its tap is logged by the generic tap logger under its aria-label.
// These are those three labels (en / hi / mr) -- an invariant keeps them equal to the button's.
export const CALL_TAP_LABELS = ["Call Apna Transport", "अपना ट्रांसपोर्ट को फोन करें", "अपना ट्रान्सपोर्टला फोन करा"];
export const calledAdmin = (session) => !!(session && (session.events || []).some((ev) => ev && ev.e === "tap" && CALL_TAP_LABELS.includes(ev.d)));

// What Admin's "Book for this customer" fills in from a customer's tries (owner 2026-11-12: "autofill the data that was entered by the customer ... like weight, Pickup and Drop if filled").
// Takes the newest try that is not booked and has anything filled in (else the newest try with anything filled, else the newest) -> { mobile, name, pickup, drop, categoryKg, advance, scheduledFor, returnTrip }.
// `categoryKg` is the vehicle category's weight limit the customer picked (the customer screen has no weight box any more -- the category IS the weight).
export function bookingPrefillFromTries(customer) {
  const tries = (customer && customer.tries) || [];
  const filled = (t) => !!(t && (t.pickup || t.drop || t.categoryKg));
  const t = tries.find((x) => filled(x) && !(x.booked || x.stage === "booked")) || tries.find(filled) || tries[0] || {};
  return {
    mobile: String((customer && customer.mobile) || ""), name: String((customer && customer.name) || ""),
    pickup: t.pickup || "", drop: t.drop || "", categoryKg: t.categoryKg == null ? null : Number(t.categoryKg),
    advance: !!t.advance, scheduledFor: t.scheduledFor || null, returnTrip: !!t.returnTrip,
  };
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
