import {
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDoc, query, orderBy, serverTimestamp, writeBatch,
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
  const snap = await getDoc(doc(db, name, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Fetches a doc by id, creating it with `defaults` the first time (e.g. a
// driver's or customer's first login, or the singleton settings doc).
export async function getOrCreateDoc(name, id, defaults) {
  const ref = doc(getDb(), name, id);
  const snap = await getDoc(ref);
  if (snap.exists()) return { id: snap.id, ...snap.data() };
  const data = { ...defaults, createdAt: serverTimestamp() };
  await setDoc(ref, data);
  return { id, ...data };
}

// Creates a brand-new doc (a fresh booking, alert, withdrawal, recharge
// request) — always stamps createdAt so newest-first ordering works.
export async function createDoc(name, id, data) {
  await setDoc(doc(getDb(), name, id), { ...data, createdAt: serverTimestamp() });
}

// Overwrites a doc's fields with a fully-computed next state (used for
// driver/customer profiles, where callers already merge {...prev, ...patch}
// themselves) without disturbing the original createdAt.
export async function replaceDoc(name, id, data) {
  await setDoc(doc(getDb(), name, id), data);
}

// Updates only the given fields, leaving everything else (incl. createdAt)
// untouched — used for status flips like "Pending" -> "Approved".
export async function patchDoc(name, id, patch) {
  await updateDoc(doc(getDb(), name, id), patch);
}

// Permanently removes a doc (e.g. an admin deleting a driver/customer
// profile entirely, not just blocking them).
export async function removeDoc(name, id) {
  await deleteDoc(doc(getDb(), name, id));
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
    await batch.commit();
  }
}

export async function seedIfEmpty(name, items, idField) {
  const snap = await getDoc(doc(getDb(), name, items[0][idField]));
  if (snap.exists()) return; // assume the collection is already seeded
  await Promise.all(items.map((item) => setDoc(doc(getDb(), name, item[idField]), item)));
}
