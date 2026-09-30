package com.apnatransport.app;

import android.app.NotificationManager;
import android.app.VibratorManager;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.WindowManager;
import android.widget.TextView;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

// The actual "incoming call" screen -- launched either by the OS itself (a
// locked/off screen, via AppFirebaseMessagingService's full-screen-intent
// notification) or by the user tapping that same notification (screen
// already on/unlocked). Plain Accept/Reject here can't call
// driverRespondBooking directly -- this Activity has no JS runtime of its
// own -- so it hands the decision to MainActivity as an Intent extra
// instead (see RingingBridgePlugin, which the WebView side reads that back
// out through on resume/cold-start).
public class RingingBookingActivity extends AppCompatActivity {
    private MediaPlayer ringtonePlayer;
    private Vibrator vibrator;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showOverLockScreenAndWakeUp();
        setContentView(R.layout.activity_ringing_booking);

        Intent intent = getIntent();
        String pickup = intent.getStringExtra("pickup");
        String drop = intent.getStringExtra("drop");
        String weight = intent.getStringExtra("weight");
        String bookingId = intent.getStringExtra("bookingId");

        ((TextView) findViewById(R.id.ringingPickup)).setText(pickup != null ? pickup : "-");
        ((TextView) findViewById(R.id.ringingDrop)).setText(drop != null ? drop : "-");
        ((TextView) findViewById(R.id.ringingWeight)).setText(weight != null ? weight + " किग्रा" : "-");

        findViewById(R.id.ringingAcceptButton).setOnClickListener(v -> respond(bookingId, true));
        findViewById(R.id.ringingRejectButton).setOnClickListener(v -> respond(bookingId, false));

        // The full-screen-intent notification itself already served its
        // purpose (waking/launching this screen) -- clear it here so it
        // doesn't also sit lingering in the shade behind this Activity.
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(7821);

        startRinging();
    }

    // Programmatic, not just the manifest's android:showWhenLocked/
    // turnScreenOn attributes (which only exist from API 27) -- this app's
    // minSdkVersion is 24 (see android/variables.gradle), so the legacy
    // window-flag path below is what actually covers API 24-26. Both paths
    // left in place together on 27+ is harmless belt-and-suspenders, not a
    // conflict.
    private void showOverLockScreenAndWakeUp() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            );
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    // Loops for as long as the screen is up (unlike the fallback channel
    // sound in AppFirebaseMessagingService, which is a one-shot) -- this is
    // what actually makes it "ring like an incoming call" rather than just
    // chime once. USAGE_NOTIFICATION_RINGTONE (not just NOTIFICATION) so it
    // follows the ringer volume/stream, same as a real call.
    private void startRinging() {
        try {
            ringtonePlayer = new MediaPlayer();
            ringtonePlayer.setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            );
            ringtonePlayer.setDataSource(this, RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_RINGTONE));
            ringtonePlayer.setLooping(true);
            ringtonePlayer.prepare();
            ringtonePlayer.start();
        } catch (Exception e) {
            // A ringtone URI can genuinely be missing/unreadable on some
            // OEM images -- vibration below still gets the driver's
            // attention even if sound fails entirely.
        }

        long[] pattern = { 0, 1000, 500, 1000, 500, 1000 };
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = getSystemService(VibratorManager.class);
            vibrator = vm != null ? vm.getDefaultVibrator() : null;
        } else {
            vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        }
        if (vibrator != null && vibrator.hasVibrator()) {
            // VibrationEffect itself only exists from API 26 -- this app's
            // floor is 24 (see android/variables.gradle), so the
            // deprecated-but-still-functional long[] overload covers 24-25.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
            } else {
                vibrator.vibrate(pattern, 0);
            }
        }
    }

    private void stopRinging() {
        if (ringtonePlayer != null) {
            try { ringtonePlayer.stop(); } catch (Exception ignored) { }
            ringtonePlayer.release();
            ringtonePlayer = null;
        }
        if (vibrator != null) {
            vibrator.cancel();
            vibrator = null;
        }
    }

    private void respond(String bookingId, boolean accept) {
        stopRinging();
        // singleTask (see MainActivity in AndroidManifest.xml) means this
        // either brings the already-running WebView instance to the front
        // (app was merely backgrounded) or cold-starts it fresh (app was
        // fully killed) -- either way MainActivity.onNewIntent/onCreate
        // picks these extras up, and RingingBridgePlugin is what the JS
        // side reads them back out through.
        Intent intent = new Intent(this, MainActivity.class);
        intent.putExtra("ringAction", accept ? "acceptBooking" : "rejectBooking");
        intent.putExtra("ringBookingId", bookingId);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(intent);
        finish();
    }

    @Override
    protected void onDestroy() {
        stopRinging();
        super.onDestroy();
    }
}
