package com.apnatransport.app;

import android.content.Intent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

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
}
