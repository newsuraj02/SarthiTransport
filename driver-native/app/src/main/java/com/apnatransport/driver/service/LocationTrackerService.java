package com.apnatransport.driver.service;

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
import com.apnatransport.driver.MainActivity;
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

// Ported from the main Capacitor app's LocationTrackerService.java (proven
// working end-to-end on a real device, including surviving the app being
// fully swiped away from Recents -- see that file's own header comment).
//
// One real simplification fully-native unlocks: the original needs a
// server-minted custom auth token (mintLocationServiceToken, functions/
// index.js) to sign this background Service into its OWN Firebase session,
// because the hybrid app's "signed in" state lives inside the WebView's JS
// layer, which a native background Service has no access to. Here, the
// driver's sign-in IS already a native FirebaseAuth session shared by the
// whole app (MainActivity, this Service, everything) -- no WebView, no
// separate JS-side auth state, so no token-minting round-trip is needed at
// all. This Service just checks FirebaseAuth.getInstance().currentUser
// directly.
public class LocationTrackerService extends Service {
    private static final String TAG = "LocationTrackerService";
    private static final String CHANNEL_ID = "location_tracking";
    private static final int NOTIFICATION_ID = 4821;
    private static final long LOCATION_INTERVAL_MS = 8000L;
    private static final float MIN_DISPLACEMENT_M = 25f;
    private static final long MIN_HEARTBEAT_MS = 30000L;

    public static final String ACTION_START = "com.apnatransport.driver.action.START_TRACKING";
    public static final String ACTION_UPDATE_TRIP = "com.apnatransport.driver.action.UPDATE_TRIP";
    public static final String ACTION_STOP = "com.apnatransport.driver.action.STOP_TRACKING";
    public static final String EXTRA_MOBILE = "mobile";
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
            if (FirebaseAuth.getInstance().getCurrentUser() == null || driverMobile == null) {
                Log.w(TAG, "Not signed in or missing mobile, stopping.");
                stopSelf();
                return START_NOT_STICKY;
            }
            startForeground(NOTIFICATION_ID, buildNotification());
            beginLocationUpdates();
            return START_STICKY;
        }
        // Unknown/empty intent (e.g. the system restarting this service
        // after process death with a null intent) -- nothing to resume
        // without a mobile number, so just stop cleanly instead of running
        // a foreground service with no way to write anywhere.
        stopSelf();
        return START_NOT_STICKY;
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

        // Plain Long millis, not FieldValue.serverTimestamp()/a Date --
        // matches the main app's own lastKnownLocation.updatedAt/
        // driverLocation.updatedAt convention (plain Date.now()-style math
        // on the reading side), so the Firestore schema/contract these
        // documents share with the rest of the backend and the still-live
        // hybrid app stays identical.
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
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent contentIntent = PendingIntent.getActivity(
            this, 0, new Intent(this, MainActivity.class), flags);
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
