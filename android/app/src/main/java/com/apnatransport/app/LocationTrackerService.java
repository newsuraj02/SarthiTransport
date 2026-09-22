package com.apnatransport.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.firestore.FirebaseFirestore;
import java.util.HashMap;
import java.util.Map;

// Keeps writing this driver's GPS fix to Firestore even once the app is
// minimized/backgrounded, which the WebView's own JS setInterval-based
// polling (see DriverHome's tracking effect in App.jsx) cannot do on its
// own -- Android suspends/throttles a WebView's JS timers once its Activity
// isn't visible, which is exactly the backgrounding gap this exists to
// close. Runs a normal FusedLocationProviderClient subscription (same API
// FusedLocationBridgePlugin uses from the foreground/JS side) but writes to
// Firestore directly from this native process using its OWN signed-in
// session (see mintLocationServiceToken in functions/index.js) instead of
// going back through the WebView at all.
//
// Write-side throttling, not request-interval throttling: fixes are read
// from Play Services every LOCATION_INTERVAL_MS, but only actually written
// to Firestore when the driver has moved at least MIN_DISPLACEMENT_M since
// the last write, or MIN_HEARTBEAT_MS has passed with no qualifying move
// (so a stationary/loading driver's location doc still visibly updates,
// just far less often). Deliberately a plain write-gate rather than
// changing the LocationRequest's own interval -- rapid start/stop or
// interval churn on a live location subscription is exactly what an
// earlier investigation this session flagged as a real risk on some
// devices; the request itself stays constant, only the Firestore write
// underneath it is gated.
public class LocationTrackerService extends Service {
    private static final String TAG = "LocationTrackerService";
    private static final String CHANNEL_ID = "location_tracking";
    private static final int NOTIFICATION_ID = 4821;
    private static final long LOCATION_INTERVAL_MS = 8000L;
    private static final float MIN_DISPLACEMENT_M = 25f;
    private static final long MIN_HEARTBEAT_MS = 30000L;

    public static final String ACTION_START = "com.apnatransport.app.action.START_TRACKING";
    public static final String ACTION_UPDATE_TRIP = "com.apnatransport.app.action.UPDATE_TRIP";
    public static final String ACTION_STOP = "com.apnatransport.app.action.STOP_TRACKING";
    public static final String EXTRA_MOBILE = "mobile";
    public static final String EXTRA_TOKEN = "token";
    public static final String EXTRA_TRIP_ID = "tripId";

    private FusedLocationProviderClient fusedClient;
    private LocationCallback locationCallback;
    private FirebaseFirestore firestore;

    private String driverMobile;
    private String tripId; // null when the driver has no active trip
    private Location lastWrittenLocation;
    private long lastWriteAtMs;

    @Override
    public void onCreate() {
        super.onCreate();
        fusedClient = LocationServices.getFusedLocationProviderClient(this);
        firestore = FirebaseFirestore.getInstance();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action)) {
            stopTracking();
            return START_NOT_STICKY;
        }
        if (ACTION_UPDATE_TRIP.equals(action) && intent != null) {
            tripId = intent.getStringExtra(EXTRA_TRIP_ID);
            return START_STICKY;
        }
        if (ACTION_START.equals(action) && intent != null) {
            driverMobile = intent.getStringExtra(EXTRA_MOBILE);
            tripId = intent.getStringExtra(EXTRA_TRIP_ID);
            String token = intent.getStringExtra(EXTRA_TOKEN);
            startForeground(NOTIFICATION_ID, buildNotification());
            signInAndStart(token);
            return START_STICKY;
        }
        // Unknown/empty intent (e.g. the system restarting this service
        // after process death with a null intent) -- nothing to resume
        // without a mobile number, so just stop cleanly instead of running
        // a foreground service with no way to write anywhere.
        stopSelf();
        return START_NOT_STICKY;
    }

    private void signInAndStart(String token) {
        if (token == null || driverMobile == null) {
            Log.w(TAG, "Missing token/mobile, stopping.");
            stopSelf();
            return;
        }
        FirebaseAuth.getInstance().signInWithCustomToken(token)
            .addOnSuccessListener(result -> beginLocationUpdates())
            .addOnFailureListener(e -> {
                Log.e(TAG, "signInWithCustomToken failed", e);
                stopSelf();
            });
    }

    private void beginLocationUpdates() {
        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, LOCATION_INTERVAL_MS)
            .setMinUpdateIntervalMillis(LOCATION_INTERVAL_MS)
            .build();
        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(@NonNull LocationResult result) {
                Location loc = result.getLastLocation();
                if (loc != null) maybeWrite(loc);
            }
        };
        try {
            fusedClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper());
        } catch (SecurityException e) {
            // Location permission was revoked out from under an already-running
            // service (Settings > Apps, mid-trip) -- nothing useful to do but
            // stop rather than crash-loop.
            Log.e(TAG, "Location permission missing", e);
            stopSelf();
        }
    }

    private void maybeWrite(@NonNull Location loc) {
        long now = System.currentTimeMillis();
        boolean dueForHeartbeat = now - lastWriteAtMs >= MIN_HEARTBEAT_MS;
        boolean moved = lastWrittenLocation == null || lastWrittenLocation.distanceTo(loc) >= MIN_DISPLACEMENT_M;
        if (!moved && !dueForHeartbeat) return;

        lastWrittenLocation = loc;
        lastWriteAtMs = now;

        // Plain Long millis, not FieldValue.serverTimestamp()/a Date -- every
        // JS reader of lastKnownLocation.updatedAt/driverLocation.updatedAt
        // (see App.jsx: gpsStatus, nearby-driver staleness checks) does
        // Date.now() - location.updatedAt as a plain number; a Firestore
        // Timestamp object there would break every one of those call sites.
        Map<String, Object> location = new HashMap<>();
        location.put("lat", loc.getLatitude());
        location.put("lng", loc.getLongitude());
        location.put("updatedAt", now);

        if (driverMobile != null) {
            firestore.collection("drivers").document(driverMobile)
                .update("lastKnownLocation", location)
                .addOnFailureListener(e -> Log.e(TAG, "drivers write failed", e));
        }
        if (tripId != null) {
            firestore.collection("bookings").document(tripId)
                .update("driverLocation", location)
                .addOnFailureListener(e -> Log.e(TAG, "bookings write failed", e));
        }
    }

    private void stopTracking() {
        if (fusedClient != null && locationCallback != null) fusedClient.removeLocationUpdates(locationCallback);
        stopForeground(true);
        stopSelf();
    }

    private Notification buildNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
            NotificationChannel channel = manager.getNotificationChannel(CHANNEL_ID);
            if (channel == null) {
                channel = new NotificationChannel(CHANNEL_ID, "Location tracking", NotificationManager.IMPORTANCE_LOW);
                channel.setDescription("Shown while sharing your live location for an active/available trip.");
                manager.createNotificationChannel(channel);
            }
        }
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent contentIntent = launchIntent != null
            ? PendingIntent.getActivity(this, 0, launchIntent, flags)
            : null;
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Sharing your location")
            .setContentText("Apna Transport is tracking your location for pickup/trip matching.")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setContentIntent(contentIntent)
            .build();
    }

    @Override
    public void onDestroy() {
        if (fusedClient != null && locationCallback != null) fusedClient.removeLocationUpdates(locationCallback);
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
