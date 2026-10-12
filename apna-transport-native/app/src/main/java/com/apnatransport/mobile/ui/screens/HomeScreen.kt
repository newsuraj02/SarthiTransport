package com.apnatransport.mobile.ui.screens

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.apnatransport.mobile.data.BookingRepository
import com.apnatransport.mobile.data.OpenBooking
import com.apnatransport.mobile.reliability.LocationServicesCheck
import com.apnatransport.mobile.reliability.batteryOptimizationExemptionIntent
import com.apnatransport.mobile.reliability.canUseFullScreenIntent
import com.apnatransport.mobile.reliability.checkLocationServicesEnabled
import com.apnatransport.mobile.reliability.hasBackgroundLocationPermission
import com.apnatransport.mobile.reliability.isIgnoringBatteryOptimizations
import com.apnatransport.mobile.reliability.needsAutoStartSettings
import com.apnatransport.mobile.reliability.openAutoStartSettings
import com.apnatransport.mobile.reliability.openFullScreenIntentSettings
import com.apnatransport.mobile.service.LocationTrackerService
import com.apnatransport.mobile.ui.theme.AppBg
import com.apnatransport.mobile.ui.theme.Ink
import com.apnatransport.mobile.ui.theme.InkSoft
import com.apnatransport.mobile.ui.theme.Line
import com.apnatransport.mobile.ui.theme.MarigoldDeep
import com.apnatransport.mobile.ui.theme.Success
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
// permission check existed.
//
// Once online, this also surfaces the same background-reliability fixes
// already proven on the hybrid app (see reliability/ReliabilityUtils.kt
// and its header comment for where each was ported from): battery-
// optimization exemption, background location (so tracking survives the
// app itself being backgrounded, not just foreground-only), OEM autostart
// settings, and the Android 14+ full-screen-intent permission the ring
// alert needs. Each is a persistent re-verify nudge, not a one-shot --
// it checks again every time duty goes online, since a driver (or an
// OEM's own "optimize battery usage" sweep) can silently revoke any of
// these later.
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
    var toggleError by remember { mutableStateOf<String?>(null) }
    val openBookings by produceState(initialValue = emptyList<OpenBooking>()) {
        bookingRepository.observeOpenBookings().collect { value = it }
    }

    var batteryOptIgnoring by remember { mutableStateOf<Boolean?>(null) }
    var backgroundLocationGranted by remember { mutableStateOf<Boolean?>(null) }
    var fullScreenIntentOk by remember { mutableStateOf<Boolean?>(null) }
    var batteryCardHidden by remember { mutableStateOf(false) }
    var backgroundLocationCardHidden by remember { mutableStateOf(false) }
    var autoStartCardHidden by remember { mutableStateOf(false) }
    var fullScreenCardHidden by remember { mutableStateOf(false) }

    // toggleLocationTracking (startForegroundService) had no error handling
    // at all -- any exception there (e.g. a foreground-service-start
    // restriction this device's Android/OEM version enforces beyond what's
    // been accounted for) propagated uncaught, which is indistinguishable
    // from a crash/freeze with no visible cause. Catching here and
    // surfacing the real exception on screen so a real device failure is
    // finally diagnosable without adb/logcat access.
    fun enableDutyNow() {
        try {
            bookingRepository.setOnline(driverMobile, true)
            toggleLocationTracking(context, driverMobile, true)
            online = true
            toggleError = null
        } catch (e: Throwable) {
            online = false
            toggleError = "Couldn't go on duty: ${e::class.java.simpleName}: ${e.message}"
        }
    }

    val locationServicesLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartIntentSenderForResult(),
    ) {
        // Device-wide Location Services being off doesn't crash or block
        // anything the way missing app permission does (startForeground()
        // works fine either way) -- this dialog's result doesn't reliably
        // report accept/decline across every OEM anyway, so proceed
        // regardless, same non-blocking-nudge reasoning as the other
        // reliability cards below.
        enableDutyNow()
    }

    suspend fun proceedPastLocationServicesCheck() {
        when (val check = checkLocationServicesEnabled(context)) {
            is LocationServicesCheck.Resolvable -> {
                try {
                    locationServicesLauncher.launch(IntentSenderRequest.Builder(check.exception.resolution.intentSender).build())
                } catch (_: Exception) {
                    enableDutyNow()
                }
            }
            else -> enableDutyNow()
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { results ->
        val locationGranted = results[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            results[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (pendingEnable && locationGranted) {
            scope.launch { proceedPastLocationServicesCheck() }
        } else if (pendingEnable) {
            permissionDenied = true
        }
        pendingEnable = false
    }

    val batteryOptLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) {
        // The dialog doesn't reliably hand back an accept/decline result
        // code across every OEM -- re-checking real state afterward is the
        // only trustworthy signal either way (see ReliabilityUtils.kt).
        batteryOptIgnoring = isIgnoringBatteryOptimizations(context)
    }

    val backgroundLocationLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) {
        backgroundLocationGranted = hasBackgroundLocationPermission(context)
    }

    // Re-verified every time duty goes online, not just once -- any of
    // these can be silently revoked later by the driver or an OEM battery
    // sweep, and a one-shot check would never catch that. Guarded for the
    // same reason as enableDutyNow() above -- an uncaught exception inside
    // a LaunchedEffect's coroutine crashes the whole app with no visible
    // cause, and this one runs automatically the instant duty goes online,
    // with nothing for the user to have tapped to trigger it directly.
    LaunchedEffect(online) {
        if (!online) return@LaunchedEffect
        try {
            batteryOptIgnoring = isIgnoringBatteryOptimizations(context)
            backgroundLocationGranted = hasBackgroundLocationPermission(context)
            fullScreenIntentOk = canUseFullScreenIntent(context)
            batteryCardHidden = false
            backgroundLocationCardHidden = false
            autoStartCardHidden = false
            fullScreenCardHidden = false
        } catch (e: Throwable) {
            toggleError = "Reliability check failed: ${e::class.java.simpleName}: ${e.message}"
        }
    }

    // Runs automatically the moment this screen first composes, before the
    // user has tapped anything -- same crash risk as above if
    // isOnline()'s Firestore read throws (permission-denied, network
    // error, etc.), and the most likely explanation for a crash reported
    // as happening "even before" the duty toggle is touched at all.
    LaunchedEffect(Unit) {
        try {
            online = bookingRepository.isOnline(driverMobile)
        } catch (e: Throwable) {
            toggleError = "Couldn't load duty status: ${e::class.java.simpleName}: ${e.message}"
        }
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Driver Duty", color = Ink, fontWeight = FontWeight.Black, style = MaterialTheme.typography.titleMedium)
            Switch(
                checked = online,
                onCheckedChange = { checked ->
                    if (!checked) {
                        online = false
                        toggleError = null
                        bookingRepository.setOnline(driverMobile, false)
                        toggleLocationTracking(context, driverMobile, false)
                        return@Switch
                    }
                    permissionDenied = false
                    toggleError = null
                    if (hasLocationPermission(context)) {
                        scope.launch { proceedPastLocationServicesCheck() }
                    } else {
                        pendingEnable = true
                        permissionLauncher.launch(requestLocationPermissions())
                    }
                },
            )
        }
        toggleError?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
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

        if (batteryOptIgnoring == false && !batteryCardHidden) {
            ReliabilityCard(
                title = "Allow background battery usage",
                body = "Without this, Android may stop sharing your location once the app isn't in front.",
                primaryLabel = "Allow (recommended)",
                onPrimary = { batteryOptLauncher.launch(batteryOptimizationExemptionIntent(context)) },
                onDismiss = { batteryCardHidden = true },
            )
        }
        if (backgroundLocationGranted == false && !backgroundLocationCardHidden) {
            ReliabilityCard(
                title = "Allow location all the time",
                body = "\"While using the app\" stops location sharing the moment you switch apps. Choose \"Allow all the time\" to keep sharing in the background.",
                primaryLabel = "Allow (recommended)",
                onPrimary = {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        backgroundLocationLauncher.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                    } else {
                        backgroundLocationGranted = true
                    }
                },
                onDismiss = { backgroundLocationCardHidden = true },
            )
        }
        if (needsAutoStartSettings() && !autoStartCardHidden) {
            ReliabilityCard(
                title = "Allow autostart",
                body = "Your phone's manufacturer needs a separate permission to keep this app running in the background.",
                primaryLabel = "Open settings",
                onPrimary = { openAutoStartSettings(context) },
                onDismiss = { autoStartCardHidden = true },
            )
        }
        if (fullScreenIntentOk == false && !fullScreenCardHidden) {
            ReliabilityCard(
                title = "Allow full-screen alerts",
                body = "Needed so a new load rings like an incoming call, even when your phone is locked.",
                primaryLabel = "Open settings",
                onPrimary = { openFullScreenIntentSettings(context) },
                onDismiss = { fullScreenCardHidden = true },
            )
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

// Matches the hybrid app's reminder/nudge-box convention (e.g. the
// install-steps card in App.jsx): white/paper background, 1.5dp
// marigoldDeep border, marigoldDeep-tinted heading -- not a shadowed
// Material card.
@Composable
private fun ReliabilityCard(
    title: String,
    body: String,
    primaryLabel: String,
    onPrimary: () -> Unit,
    onDismiss: () -> Unit,
) {
    OutlinedCard(
        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
        colors = CardDefaults.outlinedCardColors(containerColor = AppBg),
        border = BorderStroke(1.5.dp, MarigoldDeep),
        shape = MaterialTheme.shapes.medium,
    ) {
        Column(Modifier.padding(12.dp)) {
            Text(title, color = MarigoldDeep, fontWeight = FontWeight.Black, style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(4.dp))
            Text(body, color = InkSoft, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = onDismiss) { Text("Not now") }
                Button(onClick = onPrimary, colors = ButtonDefaults.buttonColors(containerColor = Success)) {
                    Text(primaryLabel, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

// Matches the hybrid app's list-card convention: flat white card, solid
// black (C.line) border, bold title. Accept is the primary action
// (C.metallicGreen fill, same as "Send Quote"/"Book this vehicle"
// elsewhere); Decline is a plain outlined secondary action.
@Composable
private fun OpenBookingCard(booking: OpenBooking, onAccept: () -> Unit, onDecline: () -> Unit) {
    OutlinedCard(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.outlinedCardColors(containerColor = AppBg),
        border = BorderStroke(1.5.dp, Line),
        shape = MaterialTheme.shapes.medium,
    ) {
        Column(Modifier.padding(12.dp)) {
            Text("${booking.pickup} → ${booking.drop}", color = Ink, fontWeight = FontWeight.Black, style = MaterialTheme.typography.titleSmall)
            Text("${booking.weight}kg · ₹${booking.fare}", color = InkSoft, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onDecline, shape = MaterialTheme.shapes.small) { Text("Decline") }
                Button(onClick = onAccept, colors = ButtonDefaults.buttonColors(containerColor = Success), shape = MaterialTheme.shapes.small) {
                    Text("Accept", fontWeight = FontWeight.Bold)
                }
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

private fun requestLocationPermissions(): Array<String> {
    val permissions = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        permissions += Manifest.permission.POST_NOTIFICATIONS
    }
    return permissions.toTypedArray()
}
