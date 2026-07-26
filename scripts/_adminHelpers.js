// Shared logic between setupAdmin.js (one admin) and setupAdmins.js (batch).
const admin = require("firebase-admin");

// Creates the account if it doesn't exist yet, or updates the password if
// it does, then tags it with the custom claim Firestore/Storage rules check
// to recognize a real admin.
async function ensureAdmin(email, password) {
  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(user.uid, { password });
    console.log(`Existing admin account found for ${email} — password updated.`);
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw e;
    user = await admin.auth().createUser({ email, password });
    console.log(`Created new admin account for ${email}.`);
  }
  await admin.auth().setCustomUserClaims(user.uid, { admin: true });
  console.log(`Tagged ${email} (uid: ${user.uid}) with the admin claim.`);
}

module.exports = { ensureAdmin };
