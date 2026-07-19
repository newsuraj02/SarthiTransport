import {
  collection, doc, onSnapshot, setDoc, updateDoc, getDoc, query, orderBy, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebaseClient";

// Every tester's browser subscribes to these collections, so a write from
// any device shows up on every other device in real time. Docs are keyed by
// mobile number for drivers/customers (one real identity per phone) and by
// generated id everywhere else.

export const firestoreReady = !!db;

function col(name) {
  return collection(db, name);
}

// orderByField is optional — Firestore's orderBy silently excludes any
// document missing that field, so collections without a createdAt on every
// doc (e.g. seeded vehicleTypes, driver profiles) must pass orderByField=null.
export function subscribeCollection(name, onChange, orderByField = "createdAt") {
  if (!db) return () => {};
  const q = orderByField ? query(col(name), orderBy(orderByField, "desc")) : col(name);
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => console.error(`[firestore] ${name} subscription error:`, err));
}

export function subscribeDoc(name, id, onChange) {
  if (!db) return () => {};
  return onSnapshot(doc(db, name, id), (snap) => {
    onChange(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, (err) => console.error(`[firestore] ${name}/${id} subscription error:`, err));
}

// Fetches a doc by id, creating it with `defaults` the first time (e.g. a
// driver's or customer's first login, or the singleton settings doc).
export async function getOrCreateDoc(name, id, defaults) {
  const ref = doc(db, name, id);
  const snap = await getDoc(ref);
  if (snap.exists()) return { id: snap.id, ...snap.data() };
  const data = { ...defaults, createdAt: serverTimestamp() };
  await setDoc(ref, data);
  return { id, ...data };
}

// Creates a brand-new doc (a fresh booking, alert, withdrawal, recharge
// request) — always stamps createdAt so newest-first ordering works.
export async function createDoc(name, id, data) {
  await setDoc(doc(db, name, id), { ...data, createdAt: serverTimestamp() });
}

// Overwrites a doc's fields with a fully-computed next state (used for
// driver/customer profiles, where callers already merge {...prev, ...patch}
// themselves) without disturbing the original createdAt.
export async function replaceDoc(name, id, data) {
  await setDoc(doc(db, name, id), data);
}

// Updates only the given fields, leaving everything else (incl. createdAt)
// untouched — used for status flips like "Pending" -> "Approved".
export async function patchDoc(name, id, patch) {
  await updateDoc(doc(db, name, id), patch);
}

export async function seedIfEmpty(name, items, idField) {
  const snap = await getDoc(doc(db, name, items[0][idField]));
  if (snap.exists()) return; // assume the collection is already seeded
  await Promise.all(items.map((item) => setDoc(doc(db, name, item[idField]), item)));
}
