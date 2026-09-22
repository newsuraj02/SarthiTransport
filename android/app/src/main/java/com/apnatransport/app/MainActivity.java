package com.apnatransport.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must run before super.onCreate() -- Capacitor registers plugins
        // during the base onCreate(), so registering any later misses it.
        registerPlugin(SettingsBridgePlugin.class);
        registerPlugin(LocationBridgePlugin.class);
        registerPlugin(AppUpdateBridgePlugin.class);
        registerPlugin(FusedLocationBridgePlugin.class);
        registerPlugin(LocationTrackerPlugin.class);
        registerPlugin(PowerBridgePlugin.class);
        super.onCreate(savedInstanceState);
        createLoadAlertNotificationChannel();
    }

    // Every push this app sends for a new/direct load (see functions/index.js:
    // sendLoadAlert/sendDirectRequestAlert and their customer-side
    // equivalents) targets android.notification.channel_id =
    // "new_load_alerts" -- but on Android 8+, FCM/the OS silently DROPS any
    // notification whose channel was never actually created on-device via
    // NotificationManager.createNotificationChannel(). Nothing on the
    // client ever created this channel (confirmed: LocationTrackerService's
    // own "location_tracking" channel IS created correctly -- this one was
    // simply never mirrored the same way), which is exactly why these
    // pushes were being sent successfully (visible in Cloud Functions logs)
    // but never actually displaying on the device -- no sound, nothing in
    // the shade, total silence. createNotificationChannel is a no-op if a
    // channel with this ID already exists, so this is safe to call on
    // every launch. Only ever needs to run once ever per device -- Android
    // remembers a created channel across app updates/restarts -- but
    // running it on every launch costs nothing and needs no persisted
    // "have I done this already" flag.
    private void createLoadAlertNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            "new_load_alerts", "New load alerts", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("New loads and direct booking requests.");
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] { 0, 500, 200, 500, 200, 500, 200, 500 });
        channel.setSound(
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
            new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build()
        );
        manager.createNotificationChannel(channel);
    }
}
