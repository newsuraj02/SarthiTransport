package com.apnatransport.mobile.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.apnatransport.mobile.data.CustomerBookingRepository
import com.apnatransport.mobile.data.MyBooking
import kotlinx.coroutines.launch

// Customer's home screen: post a load, see its own live bookings update
// as a driver accepts -- the smallest slice that proves the customer ->
// Firestore -> driver's open-load list -> accept -> back-to-customer
// pipeline end-to-end. See CustomerBookingRepository's TODO for what's
// still a placeholder (fare, eligibility) versus this screen's own scope.
@Composable
fun CustomerScreen(
    customerMobile: String,
    bookingRepository: CustomerBookingRepository,
) {
    val scope = rememberCoroutineScope()
    var pickup by remember { mutableStateOf("") }
    var drop by remember { mutableStateOf("") }
    var weight by remember { mutableStateOf("") }
    var posting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val myBookings by produceState(initialValue = emptyList<MyBooking>(), customerMobile) {
        bookingRepository.observeMyBookings(customerMobile).collect { value = it }
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("Book a load", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = pickup,
            onValueChange = { pickup = it },
            label = { Text("Pickup") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = drop,
            onValueChange = { drop = it },
            label = { Text("Drop") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = weight,
            onValueChange = { if (it.length <= 6) weight = it.filter(Char::isDigit) },
            label = { Text("Weight (kg)") },
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }
        Spacer(Modifier.height(12.dp))
        Button(
            onClick = {
                val weightKg = weight.toDoubleOrNull()
                if (pickup.isBlank() || drop.isBlank() || weightKg == null || weightKg <= 0) {
                    error = "Enter pickup, drop and a valid weight"
                    return@Button
                }
                error = null
                posting = true
                scope.launch {
                    // Placeholder flat-rate fare -- see CustomerBookingRepository's TODO.
                    val fare = (weightKg * 5).coerceAtLeast(100.0)
                    runCatching { bookingRepository.createBooking(customerMobile, pickup, drop, weightKg, fare) }
                        .onSuccess { pickup = ""; drop = ""; weight = "" }
                        .onFailure { error = it.message ?: "Could not post load" }
                    posting = false
                }
            },
            enabled = !posting,
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (posting) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) else Text("Post load")
        }

        Spacer(Modifier.height(24.dp))
        Text("Your bookings", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        if (myBookings.isEmpty()) {
            Text("No active bookings.", style = MaterialTheme.typography.bodyMedium)
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(myBookings, key = { it.id }) { booking -> MyBookingCard(booking) }
        }
    }
}

@Composable
private fun MyBookingCard(booking: MyBooking) {
    ElevatedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text("${booking.pickup} → ${booking.drop}", style = MaterialTheme.typography.titleSmall)
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("₹${booking.fare}", style = MaterialTheme.typography.bodySmall)
                AssistChip(onClick = {}, label = { Text(statusLabel(booking)) })
            }
        }
    }
}

private fun statusLabel(booking: MyBooking): String = when (booking.status) {
    "AwaitingDriver" -> "Finding a driver..."
    "Ongoing" -> booking.driverName?.let { "Driver: $it" } ?: "Driver assigned"
    else -> booking.status
}
