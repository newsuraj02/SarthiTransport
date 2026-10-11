package com.apnatransport.mobile.auth

import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.tasks.await

// Mirrors firebaseClient.js's pinAuthEmail/pinToPassword exactly, same
// synthetic email/password scheme, same Firebase project, so a driver's
// or customer's PIN works identically whether they're on the hybrid app
// or this native one, and both write to the exact same drivers/{mobile}
// or customers/{mobile} Firestore doc.
//
// The 4-digit PIN alone is under Firebase Auth's 6-character password
// floor, hence the fixed "apna-pin-" prefix, not a secret, just a
// length-padding constant (see the JS original's own comment for why).
private const val PIN_AUTH_EMAIL_DOMAIN = "apnatransport.local"

enum class Role(val value: String) {
    DRIVER("driver"),
    CUSTOMER("customer"),
}

private fun pinAuthEmail(mobile: String, role: Role): String = "$mobile@${role.value}.$PIN_AUTH_EMAIL_DOMAIN"
private fun pinToPassword(pin: String): String = "apna-pin-$pin"

class AuthRepository(private val auth: FirebaseAuth = FirebaseAuth.getInstance()) {

    val currentMobile: String?
        get() = auth.currentUser?.email?.substringBefore("@")

    // Derived from the signed-in synthetic email's role segment (see
    // pinAuthEmail) so a cold app restart can route straight to the
    // right home screen without asking the user to pick a role again.
    val currentRole: Role?
        get() = auth.currentUser?.email
            ?.substringAfter("@", "")
            ?.substringBefore(".")
            ?.let { segment -> Role.entries.find { it.value == segment } }

    suspend fun signIn(mobile: String, pin: String, role: Role): Result<Unit> = runCatching {
        auth.signInWithEmailAndPassword(pinAuthEmail(mobile, role), pinToPassword(pin)).await()
        Unit
    }

    // TODO(Phase 1a): registration (new driver/customer, no account yet),
    // createUserWithEmailAndPassword + the matching drivers/{mobile} or
    // customers/{mobile} doc creation the hybrid app's onboarding flows
    // do. Deferred since this first pass assumes testing with an
    // existing account.

    fun signOut() = auth.signOut()
}
