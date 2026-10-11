package com.apnatransport.driver.ui.ringing;

import android.app.NotificationManager;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.WindowManager;
import android.widget.TextView;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import com.apnatransport.driver.MainActivity;
import com.apnatransport.driver.R;

// Ported from the main Capacitor app's RingingBookingActivity.java (proven
// working end-to-end on real devices, including surviving the app being
// fully killed -- see that file's own header comment). Same mechanism,
// same reasoning, now with no WebView/JS bridge in between at all.
//
// The actual "incoming call" screen -- launched either by the OS itself (a
// locked/off screen, via AppFirebaseMessagingService's full-screen-intent
// notification) or by the user tapping that same notification (screen
// already on/unlocked).
//
// Accept/Reject still hands off to MainActivity via Intent extras rather
// than calling a repository directly from here -- kept identical to the
// proven original for this scaffolding pass. Once the shared
// BookingRepository (the claimBooking-equivalent transaction) exists, this
// can call it directly instead, since there's no WebView bridge forcing
// the indirection anymore -- that's a real simplification fully-native
// unlocks, just not done in this first pass.
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

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(7821);

        startRinging();
    }

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
