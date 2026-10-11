package com.apnatransport.mobile

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build

class ApnaApp : Application() {
    override fun onCreate() {
        super.onCreate()
        createLoadAlertNotificationChannel()
    }

    // Ported from the hybrid app's MainActivity.java (see that file's own
    // comment for the full "why"): every push this app sends with a
    // `notification` payload rather than data-only -- the driver's plain
    // "new load" broadcast alert (type: "direct_request") and the
    // customer-side driver-accepted/trip-completed alerts
    // (sendCustomerBookingAlert, functions/index.js) -- targets Android
    // notification channel "new_load_alerts". On Android 8+, the OS
    // silently DROPS any notification whose channel was never actually
    // created on-device via createNotificationChannel(), even though
    // Cloud Functions logs show the send succeeding -- no sound, nothing
    // in the shade, total silence, exactly the bug class this fixes.
    //
    // Put in Application.onCreate() rather than an Activity's onCreate()
    // (as the hybrid app originally did) since this runs for every
    // process start, including one FCM triggers purely to deliver a
    // background message with no Activity ever launching -- the one case
    // that actually matters most for a currently-killed app receiving its
    // first push since install. createNotificationChannel() is a no-op if
    // the channel already exists, so this is safe and cheap to call on
    // every single process start, no persisted "have I done this" flag
    // needed.
    private fun createLoadAlertNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            "new_load_alerts", "New load alerts", NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "New loads and booking status updates."
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 500, 200, 500, 200, 500, 200, 500)
            setSound(
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build(),
            )
        }
        manager.createNotificationChannel(channel)
    }
}
