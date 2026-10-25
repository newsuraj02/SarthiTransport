package com.apnatransport.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import java.util.Locale;

// Speaks an Admin Notification aloud via the device's own TextToSpeech
// engine, triggered by AppFirebaseMessagingService's "admin_broadcast" data
// message (see sendAdminNotification, functions/index.js) -- an opt-in
// checkbox on the Send Notification screen, separate from the always-on
// in-app "Admin Announcements" inbox entry every notification already gets.
//
// A plain Service, not an Activity: unlike RingingBookingActivity (which
// shows booking details with Accept/Reject buttons), a broadcast
// announcement has no UI of its own to show, just something to say. Still
// needs startForeground() -- Android 8+'s background execution limits mean
// a service woken by a killed-app FCM message gets a few seconds to run
// before the OS may kill it; TextToSpeech's own init+speak flow is
// inherently async and can't be guaranteed to finish inside that window
// without one.
public class AdminBroadcastSpeakService extends Service {
    private static final String CHANNEL_ID = "admin_broadcast";
    private static final int NOTIFICATION_ID = 7822;
    private static final String EXTRA_MESSAGE = "message";
    // Safety net -- if TextToSpeech's init or utterance callbacks never
    // fire (engine missing, no voice installed, a wedged OEM TTS service),
    // this stops the foreground service anyway so it can't get stuck
    // running forever. Matches this file's one job: speak once, then stop.
    private static final long MAX_RUN_MS = 15000L;

    private TextToSpeech tts;
    private final Handler timeoutHandler = new Handler(Looper.getMainLooper());
    private final Runnable timeoutRunnable = this::stopSelf;

    public static void start(Context ctx, String message) {
        if (message == null || message.trim().isEmpty()) return;
        Intent intent = new Intent(ctx, AdminBroadcastSpeakService.class);
        intent.putExtra(EXTRA_MESSAGE, message);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(intent);
        else ctx.startService(intent);
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String message = intent != null ? intent.getStringExtra(EXTRA_MESSAGE) : null;
        startForeground(NOTIFICATION_ID, buildNotification(message));
        timeoutHandler.postDelayed(timeoutRunnable, MAX_RUN_MS);

        if (message == null || message.trim().isEmpty()) { stopSelf(); return START_NOT_STICKY; }

        tts = new TextToSpeech(this, status -> {
            if (status != TextToSpeech.SUCCESS) { stopSelf(); return; }
            tts.setLanguage(new Locale("hi", "IN"));
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String utteranceId) { }
                @Override public void onDone(String utteranceId) { stopSelf(); }
                @Override public void onError(String utteranceId) { stopSelf(); }
            });
            tts.speak(message, TextToSpeech.QUEUE_FLUSH, null, "admin_broadcast");
        });

        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        timeoutHandler.removeCallbacks(timeoutRunnable);
        if (tts != null) { tts.stop(); tts.shutdown(); tts = null; }
        super.onDestroy();
    }

    private Notification buildNotification(String message) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
            NotificationChannel channel = manager.getNotificationChannel(CHANNEL_ID);
            if (channel == null) {
                channel = new NotificationChannel(CHANNEL_ID, "Admin announcements (spoken)", NotificationManager.IMPORTANCE_DEFAULT);
                channel.setDescription("Shown briefly while an admin message plays aloud.");
                manager.createNotificationChannel(channel);
            }
        }
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("📢 Admin")
            .setContentText(message != null ? message : "")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(false)
            .build();
    }
}
