package com.apnatransport.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

// Subclasses Capacitor's own FCM service (not a fresh one registered
// alongside it -- Firebase only ever delivers to ONE FirebaseMessagingService
// per app, so a second independent one would silently lose the race; see
// AndroidManifest.xml's tools:node="remove" on Capacitor's original
// <service> entry, replaced with this one instead). super.onMessageReceived
// keeps every existing behavior this app already depends on (Capacitor's
// own JS-side "pushNotificationReceived" event, onNewToken registration)
// completely intact -- this only ADDS behavior for one specific message
// type, sendDirectRequestRingAlert's data-only push (see functions/index.js).
//
// Why a posted Notification with setFullScreenIntent, not just
// startActivity() directly: Android 10+ blocks apps from launching an
// Activity straight from a background process (exactly the state this
// service runs in when the app is killed/backgrounded) -- the OS makes a
// specific, deliberate exception for a full-screen-intent PendingIntent
// attached to a legitimate posted notification, which is exactly the
// call-style API Uber/Ola/Rapido use for this. Skipping the notification
// and calling startActivity() directly would work on some OEMs by luck and
// silently fail on stricter ones (exactly the "why doesn't it ring" bug
// this whole feature exists to avoid).
public class AppFirebaseMessagingService extends MessagingService {
    private static final String RING_CHANNEL_ID = "direct_request_ring";
    private static final int RING_NOTIFICATION_ID = 7821;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        Map<String, String> data = remoteMessage.getData();
        if (!"direct_request_ring".equals(data.get("type"))) return;
        showRingingNotification(data);
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
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("नई डायरेक्ट बुकिंग रिक्वेस्ट")
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

    // Its own channel, separate from "new_load_alerts" (see MainActivity) --
    // this one needs CATEGORY_CALL + a ringtone-usage sound so the OS treats
    // it as call-like (bypassing some Do Not Disturb configurations the way
    // a real incoming call does), which "new_load_alerts" was never meant
    // to carry. The actual continuous ringing/vibration for as long as the
    // screen is up comes from RingingBookingActivity's own looped
    // MediaPlayer, not this channel's one-shot sound -- this is only the
    // fallback so there's still real sound even on the rare device/OEM that
    // suppresses the full-screen intent itself (e.g. the user never granted
    // Android 14's separate full-screen-intent permission).
    private void createRingChannelIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(RING_CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            RING_CHANNEL_ID, "Incoming booking requests", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Rings like an incoming call for a new direct booking request.");
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
