package com.apnatransport.mobile.ui.screens

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.apnatransport.mobile.data.BookingRepository
import com.apnatransport.mobile.data.OpenBooking
import com.apnatransport.mobile.service.LocationTrackerService
import kotlinx.coroutines.launch

// Duty toggle + a plain list of open broadcast loads -- the smallest slice
// that actually proves the end-to-end pipeline this whole native rewrite
// exists to make reliable: go online (starts LocationTrackerService) ->
// live Firestore listener shows a real open booking -> accept/decline
// writes back. The ring/full-screen-alert path (AppFirebaseMessagingService
// -> RingingBookingActivity) is separate and already wired in the
// manifest; this screen is what a driver sees if they open the app
// normally instead of responding from the ring screen.
@Composable
fun HomeScreen(
    driverMobile: String,
    bookingRepository: BookingRepository,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var online by remember { mutableStateOf(false) }
    val openBookings by produceState(initialValue = emptyList<OpenBooking>()) {
        bookingRepository.observeOpenBookings().collect { value = it }
    }

    LaunchedEffect(Unit) {
        online = bookingRepository.isOnline(driverMobile)
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Driver Duty", style = MaterialTheme.typography.titleMedium)
            Switch(
                checked = online,
                onCheckedChange = { checked ->
                    online = checked
                    bookingRepository.setOnline(driverMobile, checked)
                    toggleLocationTracking(context, driverMobile, checked)
                },
            )
        }
        Spacer(Modifier.height(16.dp))
        if (!online) {
            Text("Turn duty on to see open loads.", style = MaterialTheme.typography.bodyMedium)
            return@Column
        }
        if (openBookings.isEmpty()) {
            Text("You're online — a load will appear here.", style = MaterialTheme.typography.bodyMedium)
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(openBookings, key = { it.id }) { booking ->
                OpenBookingCard(
                    booking = booking,
                    onAccept = { scope.launch { bookingRepository.acceptBooking(booking.id, driverMobile) } },
                    onDecline = { scope.launch { bookingRepository.declineBooking(booking.id, driverMobile) } },
                )
            }
        }
    }
}

@Composable
private fun OpenBookingCard(booking: OpenBooking, onAccept: () -> Unit, onDecline: () -> Unit) {
    ElevatedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text("${booking.pickup} → ${booking.drop}", style = MaterialTheme.typography.titleSmall)
            Text("${booking.weight}kg · ₹${booking.fare}", style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onDecline) { Text("Decline") }
                Button(onClick = onAccept) { Text("Accept") }
            }
        }
    }
}

private fun toggleLocationTracking(context: Context, mobile: String, start: Boolean) {
    val intent = Intent(context, LocationTrackerService::class.java).apply {
        action = if (start) LocationTrackerService.ACTION_START else LocationTrackerService.ACTION_STOP
        putExtra(LocationTrackerService.EXTRA_MOBILE, mobile)
    }
    if (start) context.startForegroundService(intent) else context.startService(intent)
}
