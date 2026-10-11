package com.apnatransport.mobile

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.*
import com.apnatransport.mobile.auth.AuthRepository
import com.apnatransport.mobile.auth.Role
import com.apnatransport.mobile.data.BookingRepository
import com.apnatransport.mobile.data.CustomerBookingRepository
import com.apnatransport.mobile.ui.screens.CustomerScreen
import com.apnatransport.mobile.ui.screens.HomeScreen
import com.apnatransport.mobile.ui.screens.LoginScreen
import com.apnatransport.mobile.ui.screens.RoleSelectScreen
import com.apnatransport.mobile.ui.theme.ApnaTheme

// singleTask launch mode (see AndroidManifest.xml) so RingingBookingActivity's
// Accept/Reject either brings this already-running instance to the front
// (app was merely backgrounded) or cold-starts it fresh (app was fully
// killed), either way onNewIntent/onCreate below picks up the
// ringAction/ringBookingId extras directly. No RingingBridgePlugin-style
// JS bridge needed here, that existed in the hybrid app only because the
// WebView had no other way to reach native code; a fully-native Activity
// can just read its own Intent. The ring/accept path only applies to the
// Driver role (RingingBookingActivity is never launched for a customer).
class MainActivity : ComponentActivity() {
    private val authRepository = AuthRepository()
    private val bookingRepository = BookingRepository()
    private val customerBookingRepository = CustomerBookingRepository()
    private var pendingRingAction by mutableStateOf<Pair<String, String>?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        consumeRingIntent(intent)

        setContent {
            ApnaTheme {
                var mobile by remember { mutableStateOf(authRepository.currentMobile) }
                var role by remember { mutableStateOf(authRepository.currentRole) }
                // Only asked once per cold start -- a returning signed-in
                // user skips straight past this via currentRole above.
                var pendingRole by remember { mutableStateOf<Role?>(null) }

                LaunchedEffect(pendingRingAction) {
                    val (action, bookingId) = pendingRingAction ?: return@LaunchedEffect
                    val driverMobile = mobile?.takeIf { role == Role.DRIVER } ?: return@LaunchedEffect
                    if (action == "acceptBooking") {
                        bookingRepository.acceptBooking(bookingId, driverMobile)
                    } else if (action == "rejectBooking") {
                        bookingRepository.declineBooking(bookingId, driverMobile)
                    }
                    pendingRingAction = null
                }

                when {
                    mobile != null && role == Role.DRIVER -> HomeScreen(driverMobile = mobile!!, bookingRepository = bookingRepository)
                    mobile != null && role == Role.CUSTOMER -> CustomerScreen(customerMobile = mobile!!, bookingRepository = customerBookingRepository)
                    pendingRole != null -> LoginScreen(
                        role = pendingRole!!,
                        authRepository = authRepository,
                        onSignedIn = {
                            mobile = authRepository.currentMobile
                            role = authRepository.currentRole
                        },
                    )
                    else -> RoleSelectScreen(onSelect = { pendingRole = it })
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
