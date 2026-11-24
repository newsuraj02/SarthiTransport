// ONE-TIME FORCED RE-LOGIN (owner 2026-11-24: "I want you to force ask re-login to every user only once, then after that they will follow the same protocol of login-logout, login-logout").
// The login changed to number + SMS OTP (no PIN). Everybody who was logged in with the OLD login is signed out ONCE, the first time they open an app version that has this file,
// and asked to log in again with the new login. After that the session stays on the phone until they log out themselves (the normal protocol).
//
// How it works: the phone remembers which LOGIN_EPOCH it last handled (`sarthi_loginEpoch`). A phone whose remembered value is not the current one gets, before the app draws
// anything: the customer + driver "logged in" flags cleared, the old driver session id dropped, the Firebase sessions signed out (main.jsx supplies `signOutAll`), a "please log in
// again" notice queued (only when somebody WAS logged in), and then the current epoch is remembered. A phone that was never logged in (a new install) just remembers the epoch -- its
// first login is never interrupted. From then on the epoch matches and nothing is ever forced again.
//
// To force everybody to log in once more some day, change LOGIN_EPOCH to a new value (one place) -- nothing else.
// Pure (the storage and the sign-out are passed in) so verifyInvariants can run the real thing. Admin is not touched (it has its own login + PIN lock).
export const LOGIN_EPOCH = "2026-11-24-otp-login";
export const LOGIN_EPOCH_KEY = "sarthi_loginEpoch";

let forcedThisRun = false;
export function didForceRelogin() { return forcedThisRun; }

function readFlag(storage, key) { try { return JSON.parse(storage.getItem(key)); } catch { return null; } }

// Was a customer or a driver logged in on this phone (by the app's own remembered flags)?
export function wasLoggedIn(storage) {
  const c = readFlag(storage, "sarthi_customerAuth"), d = readFlag(storage, "sarthi_driverAuth");
  return !!((c && c.verified) || (d && d.verified));
}

// -> true when somebody was logged out by this call (so the "please log in again" notice is queued), false otherwise. Never throws; waits at most `timeoutMs` for the sign-out.
export async function enforceLoginEpoch({ storage, signOutAll, timeoutMs = 4000 } = {}) {
  let store = storage;
  try { if (!store) store = window.localStorage; } catch { return false; }
  let stored = null;
  try { stored = store.getItem(LOGIN_EPOCH_KEY); } catch { return false; }
  if (stored === LOGIN_EPOCH) return false;
  const was = wasLoggedIn(store);
  try {
    store.setItem("sarthi_customerAuth", JSON.stringify({ verified: false, mobile: "" }));
    store.setItem("sarthi_driverAuth", JSON.stringify({ verified: false, mobile: "" }));
    store.removeItem("sarthi_driverSession");
    if (was) store.setItem("sarthi_relogNotice", "true");
  } catch { /* storage unavailable: nothing was remembered, nothing to clear */ }
  // Firebase sessions are signed out on every phone that has not handled this epoch, also when the flags said "logged out" -- a leftover session must never log anyone back in.
  try { await Promise.race([Promise.resolve().then(() => (signOutAll ? signOutAll() : null)).catch(() => {}), new Promise((resolve) => setTimeout(resolve, timeoutMs))]); } catch { /* go on */ }
  try { store.setItem(LOGIN_EPOCH_KEY, LOGIN_EPOCH); } catch { /* storage unavailable */ }
  forcedThisRun = was;
  return was;
}
