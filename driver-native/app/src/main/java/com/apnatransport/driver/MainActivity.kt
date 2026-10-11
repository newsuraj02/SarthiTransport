package com.apnatransport.driver

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.*
import com.apnatransport.driver.auth.AuthRepository
import com.apnatransport.driver.data.BookingRepository
import com.apnatransport.driver.ui.screens.HomeScreen
import com.apnatransport.driver.ui.screens.LoginScreen
import com.apnatransport.driver.ui.theme.ApnaDriverTheme
import kotlinx.coroutines.launch

// singleTask launch mode (see AndroidManifest.xml) so RingingBookingActivity's
// Accept/Reject either brings this already-running instance to the front
// (app was merely backgrounded) or cold-starts it fresh (app was fully
// killed) -- either way onNewIntent/onCreate below picks up the
// ringAction/ringBookingId extras directly. No RingingBridgePlugin-style
// JS bridge needed here -- that existed in the hybrid app only because the
// WebView had no other way to reach native code; a fully-native Activity
// can just read its own Intent.
class MainActivity : ComponentActivity() {
    private val authRepository = AuthRepository()
    private val bookingRepository = BookingRepository()
    private var pendingRingAction by mutableStateOf<Pair<String, String>?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        consumeRingIntent(intent)

        setContent {
            ApnaDriverTheme {
                var driverMobile by remember { mutableStateOf(authRepository.currentDriverMobile) }

                LaunchedEffect(pendingRingAction) {
                    val (action, bookingId) = pendingRingAction ?: return@LaunchedEffect
                    val mobile = driverMobile ?: return@LaunchedEffect
                    if (action == "acceptBooking") {
                        bookingRepository.acceptBooking(bookingId, mobile)
                    } else if (action == "rejectBooking") {
                        bookingRepository.declineBooking(bookingId, mobile)
                    }
                    pendingRingAction = null
                }

                if (driverMobile == null) {
                    LoginScreen(authRepository = authRepository, onSignedIn = { driverMobile = authRepository.currentDriverMobile })
                } else {
                    HomeScreen(driverMobile = driverMobile!!, bookingRepository = bookingRepository)
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        consumeRingIntent(intent)
    }

    private fun consumeRingIntent(intent: Intent?) {
        val action = intent?.getStringExtra("ringAction") ?: return
        val bookingId = intent.getStringExtra("ringBookingId") ?: return
        intent.removeExtra("ringAction")
        intent.removeExtra("ringBookingId")
        pendingRingAction = action to bookingId
    }
}
