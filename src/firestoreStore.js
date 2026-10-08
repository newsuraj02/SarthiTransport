import {
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDoc, query, orderBy, serverTimestamp, writeBatch,
  runTransaction, arrayUnion,
} from "firebase/firestore";
import { getDb, hasConfig } from "./firebaseClient";

// Every tester's browser subscribes to these collections, so a write from
// any device shows up on every other device in real time. Docs are keyed by
// mobile number for drivers/customers (one real identity per phone) and by
// generated id everywhere else.
//
// getDb() (not a fixed `db`) is resolved fresh on every call, since which
// Firestore client is "active" depends on which role (customer/driver/
// admin) is currently signed in and acting — see setActiveRole in
// firebaseClient.js.

export const firestoreReady = hasConfig;

function col(name) {
  return collection(getDb(), name);
}

// Retries a single Firestore read/write on a transient network blip (the
// exact "internet went slow/dropped for a second" case) instead of letting
// it surface as a silent .catch(console.error) failure at whichever of the
// hundreds of App.jsx call sites happened to invoke it. Deliberately does
// NOT retry a real error (permission-denied, not-found, invalid-argument,
// etc.) -- retrying those just delays the same failure for no benefit.
// Every exported write/read helper below routes through this, so this is
// the one place that needed to change for every caller to benefit.
const RETRY_TRANSIENT_CODES = new Set(["unavailable", "deadline-exceeded", "cancelled", "internal", "aborted", "resource-exhausted"]);
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;
function isTransientFirestoreError(err) {
  return RETRY_TRANSIENT_CODES.has(err?.code);
}
async function withRetry(fn) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= RETRY_ATTEMPTS || !isTransientFirestoreError(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)));
    }
  }
}

// orderByField is optional — Firestore's orderBy silently excludes any
// document missing that field, so collections without a createdAt on every
// doc (e.g. seeded vehicleTypes, driver profiles) must pass orderByField=null.
// onError is optional too -- every existing caller that omits it keeps the
// original console.error-only behavior; a caller can pass one to also
// surface the failure in the UI, since a subscription that silently never
// fires again is otherwise indistinguishable from "the collection is
// genuinely empty."
export function subscribeCollection(name, onChange, orderByField = "createdAt", onError) {
  const db = getDb();
  if (!db) return () => {};
  const q = orderByField ? query(col(name), orderBy(orderByField, "desc")) : col(name);
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => {
    console.error(`[firestore] ${name} subscription error:`, err);
    if (onError) onError(err);
  });
}

export function subscribeDoc(name, id, onChange) {
  const db = getDb();
  if (!db) return () => {};
  return onSnapshot(doc(db, name, id), (snap) => {
    onChange(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, (err) => console.error(`[firestore] ${name}/${id} subscription error:`, err));
}

// One-off read (no live subscription) — for the rare case a client needs
// another user's doc for a moment (e.g. checking a referral code) rather
// than staying subscribed to it forever.
export async function getDocOnce(name, id) {
  const db = getDb();
  if (!db) return null;
  const snap = await withRetry(() => getDoc(doc(db, name, id)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Fetches a doc by id, creating it with `defaults` the first time (e.g. a
// driver's or customer's first login, or the singleton settings doc).
export async function getOrCreateDoc(name, id, defaults) {
  const ref = doc(getDb(), name, id);
  const snap = await withRetry(() => getDoc(ref));
  if (snap.exists()) return { id: snap.id, ...snap.data() };
  const data = { ...defaults, createdAt: serverTimestamp() };
  await withRetry(() => setDoc(ref, data));
  return { id, ...data };
}

// Creates a brand-new doc (a fresh booking, alert, withdrawal, recharge
// request) — always stamps createdAt so newest-first ordering works.
export async function createDoc(name, id, data) {
  await withRetry(() => setDoc(doc(getDb(), name, id), { ...data, createdAt: serverTimestamp() }));
}

// Overwrites a doc's fields with a fully-computed next state (used for
// driver/customer profiles, where callers already merge {...prev, ...patch}
// themselves) without disturbing the original createdAt.
export async function replaceDoc(name, id, data) {
  await withRetry(() => setDoc(doc(getDb(), name, id), data));
}

// Updates only the given fields, leaving everything else (incl. createdAt)
// untouched — used for status flips like "Pending" -> "Approved".
export async function patchDoc(name, id, patch) {
  await withRetry(() => updateDoc(doc(getDb(), name, id), patch));
}

// Permanently removes a doc (e.g. an admin deleting a driver/customer
// profile entirely, not just blocking them).
export async function removeDoc(name, id) {
  await withRetry(() => deleteDoc(doc(getDb(), name, id)));
}

// Atomically claims an open ("AwaitingDriver", not yet assigned) booking --
// used by broadcast dispatch, where several drivers can see and tap Accept
// on the same load at once. A plain patchDoc gated by the caller's own
// locally-cached booking state (the old single-target-driver pattern) is
// NOT safe here: two drivers' clients could both read "still open" from
// stale cache and both write, with Firestore's last-write-wins silently
// handing the job to whoever wrote second while the first driver's own app
// still thinks they got it. A transaction re-reads the doc from the server
// at commit time and only applies `patch` if it's still actually open,
// so exactly one caller ever gets { ok: true } for a given booking.
//
// `extraWrites` (optional, [{ name, id, data }]) commits alongside the same
// transaction -- e.g. driverRespondBooking's bookingOtps doc. Without this,
// that doc used to be written as a separate, un-awaited call AFTER this
// transaction already committed status:"Ongoing", so the customer's own
// subscription could see "Ongoing" and start listening for the OTP before
// the OTP doc existed yet, showing nothing for a beat. Writing it inside
// this same transaction means it's created atomically with the status
// flip -- by the time any client observes "Ongoing", the OTP doc is
// already there, every time, not just usually.
export async function claimBooking(id, patch, extraWrites = []) {
  const db = getDb();
  return withRetry(() => runTransaction(db, async (tx) => {
    const ref = doc(db, "bookings", id);
    const snap = await tx.get(ref);
    if (!snap.exists()) return { ok: false, reason: "not-found" };
    const data = snap.data();
    if (data.status !== "AwaitingDriver" || data.driverMobile) return { ok: false, reason: "taken" };
    tx.update(ref, patch);
    for (const w of extraWrites) {
      tx.set(doc(db, w.name, w.id), { ...w.data, createdAt: serverTimestamp() });
    }
    return { ok: true };
  }));
}

// Adds one name to a booking's declinedBy array without needing to read
// the current array first -- a plain patchDoc with a locally-computed
// [...prev, name] can lose another concurrent decline the same way
// claimBooking's comment describes for accepts (lower stakes here since
// nothing is wrongly "won", but still worth doing correctly now that
// broadcast dispatch means concurrent declines on the same booking are
// common instead of rare).
export async function addDeclinedBy(name, id, driverName) {
  await withRetry(() => updateDoc(doc(getDb(), name, id), { declinedBy: arrayUnion(driverName) }));
}

// Patches many docs in one go (e.g. a diesel-price adjustment nudging
// every rate in a collection at once) -- Firestore caps a single batch at
// 500 writes, so this chunks into multiple batches committed one after
// another, turning what would otherwise be hundreds of individual
// round-trips (slow, and exactly the kind of long-running mobile-browser
// operation that kept failing halfway during the Maharashtra rate
// import) into just a handful.
const BATCH_CHUNK_SIZE = 450;
export async function bulkUpdateDocs(name, updates) {
  const db = getDb();
  if (!db || updates.length === 0) return;
  for (let i = 0; i < updates.length; i += BATCH_CHUNK_SIZE) {
    const batch = writeBatch(db);
    updates.slice(i, i + BATCH_CHUNK_SIZE).forEach(({ id, patch }) => {
      batch.update(doc(db, name, id), patch);
    });
    await withRetry(() => batch.commit());
  }
}

export async function seedIfEmpty(name, items, idField) {
  const snap = await withRetry(() => getDoc(doc(getDb(), name, items[0][idField])));
  if (snap.exists()) return; // assume the collection is already seeded
  await Promise.all(items.map((item) => withRetry(() => setDoc(doc(getDb(), name, item[idField]), item))));
}
