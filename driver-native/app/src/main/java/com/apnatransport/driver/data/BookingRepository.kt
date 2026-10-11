package com.apnatransport.driver.data

import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
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

private fun DocumentSnapshot.toOpenBooking(): OpenBooking? {
    val pickup = getString("pickup") ?: return null
    val drop = getString("drop") ?: return null
    return OpenBooking(
        id = id,
        pickup = pickup,
        drop = drop,
        weight = getDouble("weight") ?: 0.0,
        fare = getDouble("fare") ?: 0.0,
    )
}

class BookingRepository(private val db: FirebaseFirestore = FirebaseFirestore.getInstance()) {

    fun setOnline(mobile: String, online: Boolean) {
        db.collection("drivers").document(mobile).update("online", online)
    }

    suspend fun isOnline(mobile: String): Boolean {
        val snap = db.collection("drivers").document(mobile).get().await()
        return snap.getBoolean("online") ?: false
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
