package com.apnatransport.mobile.data

import com.google.firebase.crashlytics.FirebaseCrashlytics
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import java.util.UUID

// A customer's own booking as shown on their status screen -- see
// src/App.jsx's requestByCategory for the full `bookings/{id}` document
// shape this is a projection of. driverName stays null until a driver
// accepts (driverRespondBooking on the hybrid side); status moves
// AwaitingDriver -> Ongoing -> Completed/Cancelled.
data class MyBooking(
    val id: String,
    val pickup: String,
    val drop: String,
    val fare: Double,
    val status: String,
    val driverName: String?,
)

// Same defensive pattern as BookingRepository.kt's toOpenBooking() -- see
// its comment. getDouble()/getString() throw a hard RuntimeException
// rather than returning null when a field exists but isn't the expected
// type, which crashed the equivalent driver-side listener in production;
// this screen reads the exact same `bookings` documents, so it has the
// identical risk.
private fun DocumentSnapshot.toMyBooking(): MyBooking? = try {
    val pickup = get("pickup") as? String ?: return null
    val drop = get("drop") as? String ?: return null
    val fareValue = get("fare")
    MyBooking(
        id = id,
        pickup = pickup,
        drop = drop,
        fare = when (fareValue) {
            is Number -> fareValue.toDouble()
            is String -> fareValue.toDoubleOrNull() ?: 0.0
            else -> 0.0
        },
        status = get("status") as? String ?: "AwaitingDriver",
        driverName = get("driverName") as? String,
    )
} catch (e: Throwable) {
    FirebaseCrashlytics.getInstance().recordException(e)
    null
}

class CustomerBookingRepository(private val db: FirebaseFirestore = FirebaseFirestore.getInstance()) {

    // TODO(Phase 1a): port the real fare-tier resolution + eligibility
    // pre-check (see App.jsx's requestByCategory/resolveFareForTier)
    // instead of this flat placeholder fare. Fine for proving a booking
    // reaches Firestore and shows up live in a driver's open-load list;
    // not fine for real customer-facing pricing.
    suspend fun createBooking(customerMobile: String, pickup: String, drop: String, weightKg: Double, fare: Double): String {
        val bookingId = UUID.randomUUID().toString()
        db.collection("bookings").document(bookingId).set(
            mapOf(
                "pickup" to pickup,
                "drop" to drop,
                "vehicle" to null,
                "weight" to weightKg,
                "tierMaxKg" to weightKg,
                "status" to "AwaitingDriver",
                "bids" to emptyList<String>(),
                "fare" to fare,
                "declinedBy" to emptyList<String>(),
                "driverName" to null,
                "driverMobile" to null,
                "progress" to 0,
                "customerMobile" to customerMobile,
                "acceptedAt" to FieldValue.serverTimestamp(),
            ),
        ).await()
        return bookingId
    }

    // whereEqualTo + whereIn together may prompt Firestore to ask for a
    // composite index the first time this runs against a fresh project
    // (the error it throws includes a direct console link to create it).
    fun observeMyBookings(customerMobile: String): Flow<List<MyBooking>> = callbackFlow {
        val registration = db.collection("bookings")
            .whereEqualTo("customerMobile", customerMobile)
            .whereIn("status", listOf("AwaitingDriver", "Ongoing"))
            .addSnapshotListener { snap, _ ->
                trySend(snap?.documents?.mapNotNull { it.toMyBooking() } ?: emptyList())
            }
        awaitClose { registration.remove() }
    }
}
