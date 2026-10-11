package com.apnatransport.driver.auth

import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.tasks.await

// Mirrors firebaseClient.js's pinAuthEmail/pinToPassword exactly -- same
// synthetic email/password scheme, same Firebase project, so a driver's
// PIN works identically whether they're on the hybrid app or this native
// one, and both write to the exact same drivers/{mobile} Firestore doc.
//
// The 4-digit PIN alone is under Firebase Auth's 6-character password
// floor, hence the fixed "apna-pin-" prefix -- not a secret, just a
// length-padding constant (see the JS original's own comment for why).
private const val PIN_AUTH_EMAIL_DOMAIN = "apnatransport.local"

private fun pinAuthEmail(mobile: String): String = "$mobile@driver.$PIN_AUTH_EMAIL_DOMAIN"
private fun pinToPassword(pin: String): String = "apna-pin-$pin"

class AuthRepository(private val auth: FirebaseAuth = FirebaseAuth.getInstance()) {

    val currentDriverMobile: String?
        get() = auth.currentUser?.email?.substringBefore("@")

    suspend fun signIn(mobile: String, pin: String): Result<Unit> = runCatching {
        auth.signInWithEmailAndPassword(pinAuthEmail(mobile), pinToPassword(pin)).await()
        Unit
    }

    // TODO(Phase 1a): registration (new driver, no account yet) --
    // createUserWithEmailAndPassword + the matching drivers/{mobile} doc
    // creation the hybrid app's DriverOnboarding does. Deferred since this
    // first pass assumes testing with an existing driver account.

    fun signOut() = auth.signOut()
}
