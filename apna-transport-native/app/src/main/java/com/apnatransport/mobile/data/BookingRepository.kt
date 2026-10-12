package com.apnatransport.mobile.data

import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.crashlytics.FirebaseCrashlytics
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

// Minimal real data a broadcast load card needs -- deliberately a small
// subset of the full `bookings/{id}` schema (see src/App.jsx's
// requestByCategory for the complete document shape). Expand field-by-field
// as each screen that needs more of it gets built, rather than guessing the
// full shape up front.
data class OpenBooking(
    val id: String,
    val pickup: String,
    val drop: String,
    val weight: Double,
    val fare: Double,
)

// Confirmed via Crashlytics: DocumentSnapshot.getDouble("weight") throws a
// hard RuntimeException ("Field 'weight' is not a java.lang.Number") for at
// least one live booking document whose weight field isn't actually stored
// as a Number (likely an older write path or a different schema version).
// Because this runs inside observeOpenBookings()'s live snapshot listener,
// ONE bad document anywhere in the open-broadcast set crashed every
// driver's app the instant duty went online -- not a permission or
// foreground-service issue at all, despite how it presented. Reading each
// field generically and coercing defensively (never a type-specific
// getter that can throw) instead, plus a belt-and-suspenders try/catch so
// no future unanticipated field-shape surprise can crash this listener
// again -- a malformed single document should be skipped, not take down
// the whole list.
private fun numberField(value: Any?): Double = when (value) {
    is Number -> value.toDouble()
    is String -> value.toDoubleOrNull() ?: 0.0
    else -> 0.0
}

private fun DocumentSnapshot.toOpenBooking(): OpenBooking? = try {
    // get() + `as? String` instead of getString(), which throws the same
    // way getDouble() does if the stored value isn't actually a String.
    val pickup = get("pickup") as? String ?: return null
    val drop = get("drop") as? String ?: return null
    OpenBooking(
        id = id,
        pickup = pickup,
        drop = drop,
        weight = numberField(get("weight")),
        fare = numberField(get("fare")),
    )
} catch (e: Throwable) {
    FirebaseCrashlytics.getInstance().recordException(e)
    null
}

class BookingRepository(private val db: FirebaseFirestore = FirebaseFirestore.getInstance()) {

    fun setOnline(mobile: String, online: Boolean) {
        db.collection("drivers").document(mobile).update("online", online)
    }

    suspend fun isOnline(mobile: String): Boolean {
        val snap = db.collection("drivers").document(mobile).get().await()
        return snap.get("online") as? Boolean ?: false
    }

    // TODO(Phase 1a): port the real eligibility match (vehicle capacity
    // window, radius, KYC/blacklist, conflict check -- see App.jsx's
    // isDriverBroadcastEligible) instead of this placeholder, which just
    // shows every currently-open broadcast booking regardless of fit. Fine
    // for proving the live-listener + ring-alert pipeline end-to-end; not
    // fine for a real driver-facing list.
    fun observeOpenBookings(): Flow<List<OpenBooking>> = callbackFlow {
        val registration = db.collection("bookings")
            .whereEqualTo("status", "AwaitingDriver")
            .addSnapshotListener { snap, _ ->
                trySend(snap?.documents?.mapNotNull { it.toOpenBooking() } ?: emptyList())
            }
        awaitClose { registration.remove() }
    }

    // TODO(Phase 1a): port driverRespondBooking's real claimBooking
    // transaction (atomic accept, conflict/OTP handling -- see
    // firestoreStore.js) instead of this placeholder plain update, which
    // has the exact race-condition problem that transaction exists to
    // prevent (two drivers' clients both reading "still open" and both
    // writing). Fine only for proving the UI path works at all.
    suspend fun acceptBooking(bookingId: String, driverMobile: String) {
        db.collection("bookings").document(bookingId)
            .update(mapOf("status" to "Ongoing", "driverMobile" to driverMobile))
            .await()
    }

    suspend fun declineBooking(bookingId: String, driverName: String) {
        db.collection("bookings").document(bookingId)
            .update("declinedBy", com.google.firebase.firestore.FieldValue.arrayUnion(driverName))
            .await()
    }
}
