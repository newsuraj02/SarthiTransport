// ONE ROLE PER MOBILE NUMBER (owner 2026-11-12: "if someone logs in as a customer with his phone number then he can't log in as a driver with the
// same phone number"). A number that is a Customer cannot become a Driver, and the other way round. This is the one place that decides it; the
// callables `checkMobileRegistered` (sign-up / login messages) and `resetPinAfterPhoneVerify` (forgot-PIN must not create the other account) use it.
//
// "Has an account in a role" = a PIN login (Firebase Auth user for that role) OR that role's profile document (customers/{mobile} or drivers/{mobile}),
// so a driver the Admin added by hand also blocks that number from being a customer.
// Numbers that ALREADY hold both accounts from before this rule are left alone (they keep working); only a NEW second role is refused.

function otherRoleOf(role) {
  return role === "driver" ? "customer" : "driver";
}

// hasAccount(role) -> Promise<boolean>; throws on a real lookup error (the caller decides what to do).
async function lookupMobileRoles(role, hasAccount) {
  const thisRole = role === "driver" ? "driver" : "customer";
  const other = otherRoleOf(thisRole);
  const exists = await hasAccount(thisRole);
  const otherRoleExists = await hasAccount(other);
  return { exists, otherRoleExists, otherRole: other };
}

// A NEW account / PIN reset in `role` is refused when the number belongs to the other role only.
function refusesSecondRole({ exists, otherRoleExists }) {
  return !exists && !!otherRoleExists;
}

module.exports = { otherRoleOf, lookupMobileRoles, refusesSecondRole };
