package com.apnatransport.mobile.ui.screens

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
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
//
// Location permission is requested here, right before the first toggle,
// rather than primed earlier in the flow the way the hybrid app's
// BackgroundLocationDisclosure does. Needed up front: LocationTrackerService
// is declared foregroundServiceType="location", and on API 29+ (hard
// enforced on 34+, this app's targetSdk) calling startForeground() for a
// location-type service without ACCESS_FINE_LOCATION already granted
// throws a SecurityException immediately inside onStartCommand -- the
// service dies while startForegroundService() is still waiting on it,
// which is what was presenting as an unrecoverable freeze before this
// permission check existed. ACCESS_BACKGROUND_LOCATION (needed for
// tracking to keep writing once the app itself isn't foregrounded) is
// deliberately not requested here yet -- see the TODO on
// requestLocationPermissions below.
@Composable
fun HomeScreen(
    driverMobile: String,
    bookingRepository: BookingRepository,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var online by remember { mutableStateOf(false) }
    var pendingEnable by remember { mutableStateOf(false) }
    var permissionDenied by remember { mutableStateOf(false) }
    val openBookings by produceState(initialValue = emptyList<OpenBooking>()) {
        bookingRepository.observeOpenBookings().collect { value = it }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { results ->
        val locationGranted = results[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            results[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (pendingEnable && locationGranted) {
            online = true
            bookingRepository.setOnline(driverMobile, true)
            toggleLocationTracking(context, driverMobile, true)
        } else if (pendingEnable) {
            permissionDenied = true
        }
        pendingEnable = false
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
                    if (!checked) {
                        online = false
                        bookingRepository.setOnline(driverMobile, false)
                        toggleLocationTracking(context, driverMobile, false)
                        return@Switch
                    }
                    permissionDenied = false
                    if (hasLocationPermission(context)) {
                        online = true
                        bookingRepository.setOnline(driverMobile, true)
                        toggleLocationTracking(context, driverMobile, true)
                    } else {
                        pendingEnable = true
                        permissionLauncher.launch(requestLocationPermissions())
                    }
                },
            )
        }
        if (permissionDenied) {
            Spacer(Modifier.height(8.dp))
            Text(
                "Location permission is required to go on duty.",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
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

private fun hasLocationPermission(context: Context): Boolean {
    val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
    val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
    return fine == PackageManager.PERMISSION_GRANTED || coarse == PackageManager.PERMISSION_GRANTED
}

// TODO(Phase 1a): also prompt for ACCESS_BACKGROUND_LOCATION (a separate,
// later system dialog on API 29+) the way the hybrid app's
// BackgroundLocationDisclosure does, so tracking keeps writing once the
// app itself is backgrounded rather than only while it's in the
// foreground. Foreground-only location is enough to prove the pipeline
// works and to satisfy the foregroundServiceType="location" requirement
// this fixes, but it's not yet the same background-survives-everything
// guarantee the hybrid app's GPS tracking has.
private fun requestLocationPermissions(): Array<String> {
    val permissions = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        permissions += Manifest.permission.POST_NOTIFICATIONS
    }
    return permissions.toTypedArray()
}
