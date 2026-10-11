package com.apnatransport.mobile.push;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import androidx.annotation.NonNull;
import com.apnatransport.mobile.ui.ringing.RingingBookingActivity;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

// Ported from the main Capacitor app's AppFirebaseMessagingService.java --
// same proven mechanism, now extending FirebaseMessagingService directly
// (no Capacitor push-notifications plugin to subclass/co-exist with here,
// since this app has no Capacitor at all).
//
// Why a posted Notification with setFullScreenIntent, not just
// startActivity() directly: Android 10+ blocks apps from launching an
// Activity straight from a background process -- the OS makes a specific,
// deliberate exception for a full-screen-intent PendingIntent attached to
// a legitimate posted notification, which is exactly the call-style API
// Uber/Ola/Rapido use for this (and what the main app's own version of
// this file already proved works end-to-end, including the app being
// fully killed, before this port).
//
// The broadcast dispatch Cloud Function (onDirectRequestBroadcast,
// functions/index.js) sends this as a DATA-ONLY message deliberately --
// see that function's own comment -- which is the one thing that actually
// matters for onMessageReceived to fire reliably while this app is
// backgrounded/killed; a `notification` payload would let the OS handle
// display itself and skip calling this class's code entirely.
public class AppFirebaseMessagingService extends FirebaseMessagingService {
    private static final String RING_CHANNEL_ID = "direct_request_ring";
    private static final int RING_NOTIFICATION_ID = 7821;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        Map<String, String> data = remoteMessage.getData();
        if (!"direct_request_ring".equals(data.get("type"))) return;
        showRingingNotification(data);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        // TODO(Phase 1a): write this token to drivers/{mobile}.fcmToken,
        // same as useRideNotifications does client-side in the main app --
        // needs the signed-in driver's mobile number, which this service
        // doesn't have direct access to on its own. Route through
        // AuthRepository/a shared singleton once that exists.
    }

    private void showRingingNotification(Map<String, String> data) {
        createRingChannelIfNeeded();

        Intent fullScreenIntent = new Intent(this, RingingBookingActivity.class);
        fullScreenIntent.putExtra("bookingId", data.get("bookingId"));
        fullScreenIntent.putExtra("pickup", data.get("pickup"));
        fullScreenIntent.putExtra("drop", data.get("drop"));
        fullScreenIntent.putExtra("weight", data.get("weight"));
        fullScreenIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(this, RING_NOTIFICATION_ID, fullScreenIntent, piFlags);

        String pickup = data.get("pickup") != null ? data.get("pickup") : "-";
        String drop = data.get("drop") != null ? data.get("drop") : "-";

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, RING_CHANNEL_ID)
            : new Notification.Builder(this);
        builder
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("नई बुकिंग रिक्वेस्ट")
            .setContentText(pickup + " → " + drop)
            .setCategory(Notification.CATEGORY_CALL)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setContentIntent(fullScreenPendingIntent)
            .setAutoCancel(true)
            .setOngoing(false);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setPriority(Notification.PRIORITY_HIGH);
            builder.setSound(RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_RINGTONE));
        }

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(RING_NOTIFICATION_ID, builder.build());
    }

    private void createRingChannelIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(RING_CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            RING_CHANNEL_ID, "Incoming booking requests", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Rings like an incoming call for a new load request.");
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] { 0, 1000, 500, 1000, 500, 1000 });
        channel.setSound(
            RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_RINGTONE),
            new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
        );
        manager.createNotificationChannel(channel);
    }
}
