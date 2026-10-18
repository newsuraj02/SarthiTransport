package com.apnatransport.app;

import android.content.Intent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.auth.FirebaseAuth;

// Thin JS-facing control surface for LocationTrackerService -- see that
// class for the actual tracking/throttling/Firestore-write logic. Kept
// separate from FusedLocationBridgePlugin (foreground one-shot fixes for
// the driver's own UI) since this is purely start/stop/update plumbing for
// a background service, not a location-reading API itself.
@CapacitorPlugin(name = "LocationTracker")
public class LocationTrackerPlugin extends Plugin {

    @PluginMethod
    public void startTracking(PluginCall call) {
        String mobile = call.getString("mobile");
        String token = call.getString("token");
        String tripId = call.getString("tripId");
        if (mobile == null || token == null) {
            call.reject("mobile and token are required.");
            return;
        }
        Intent intent = new Intent(getContext(), LocationTrackerService.class);
        intent.setAction(LocationTrackerService.ACTION_START);
        intent.putExtra(LocationTrackerService.EXTRA_MOBILE, mobile);
        intent.putExtra(LocationTrackerService.EXTRA_TOKEN, token);
        if (tripId != null) intent.putExtra(LocationTrackerService.EXTRA_TRIP_ID, tripId);
        // Context.startForegroundService() itself only exists from API 26 --
        // calling it directly would crash with NoSuchMethodError on this
        // app's minSdk 24/25 devices. ContextCompat's version calls that on
        // O+ and plain startService() below it, which is all pre-O needs
        // since the foreground-service-must-post-a-notification-within-5s
        // rule (and this crash risk) doesn't exist before API 26 either.
        ContextCompat.startForegroundService(getContext(), intent);
        call.resolve();
    }

    @PluginMethod
    public void updateTrip(PluginCall call) {
        String tripId = call.getString("tripId");
        Intent intent = new Intent(getContext(), LocationTrackerService.class);
        intent.setAction(LocationTrackerService.ACTION_UPDATE_TRIP);
        if (tripId != null) intent.putExtra(LocationTrackerService.EXTRA_TRIP_ID, tripId);
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void stopTracking(PluginCall call) {
        Intent intent = new Intent(getContext(), LocationTrackerService.class);
        intent.setAction(LocationTrackerService.ACTION_STOP);
        getContext().startService(intent);
        call.resolve();
    }

    // Owner-reported bug (2026-10-18): a customer on a phone that had
    // earlier been used to test the DRIVER role kept receiving that
    // driver's load-ring pushes. Root cause: mintLocationServiceToken's
    // native FirebaseAuth session (signInWithCustomToken, same uid as the
    // driver's own login -- see that function and PushTokenSync) is
    // completely separate from the web-side driverFirebaseAuth the JS
    // logout button signs out, and nothing ever cleared it -- so once a
    // phone had ever gone on duty as a given driver, PushTokenSync kept
    // re-writing THIS phone's current FCM token into THAT driver's
    // Firestore doc on every app resume, forever, even after the web-side
    // logout and even on a completely different person's device going
    // forward. Called from App.jsx's logoutRole("driver") only -- a real,
    // explicit driver logout -- not from the online/offline duty toggle,
    // which must keep working exactly as before (a driver who's merely
    // off duty, not logged out, should still be reachable while the app
    // is closed).
    @PluginMethod
    public void signOutNative(PluginCall call) {
        FirebaseAuth.getInstance().signOut();
        call.resolve();
    }
}
