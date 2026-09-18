package com.apnatransport.app;

import android.app.Activity;
import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.common.api.ResolvableApiException;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.LocationSettingsRequest;
import com.google.android.gms.location.Priority;

// Triggers the real, native "Turn on Location?" system dialog (the same
// one Google Maps/Uber show) instead of a custom in-app banner -- see
// src/App.jsx's LocationBanner and the SarthiTransport session note on
// why device-wide Location Services being off (not app permission, which
// is a separate thing entirely) is outside what navigator.geolocation or
// any plain web JS can fix on its own. This wraps Google Play Services'
// SettingsClient.checkLocationSettings, which either confirms Location is
// already on, or hands back a ResolvableApiException whose
// startResolutionForResult() call pops that exact system dialog with a
// single "Turn on" button -- no manual trip to Settings needed.
@CapacitorPlugin(name = "LocationBridge")
public class LocationBridgePlugin extends Plugin {
    private static final int REQUEST_CHECK_SETTINGS = 4271;

    @PluginMethod
    public void ensureEnabled(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity available.");
            return;
        }

        LocationRequest locationRequest = new LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 10000).build();
        LocationSettingsRequest settingsRequest = new LocationSettingsRequest.Builder()
            .addLocationRequest(locationRequest)
            .build();

        LocationServices.getSettingsClient(activity)
            .checkLocationSettings(settingsRequest)
            .addOnSuccessListener(activity, response -> {
                // Already on -- nothing to resolve.
                JSObject result = new JSObject();
                result.put("enabled", true);
                call.resolve(result);
            })
            .addOnFailureListener(activity, exception -> {
                if (exception instanceof ResolvableApiException) {
                    try {
                        // Saved so handleOnActivityResult below can find its
                        // way back to this exact call once the dialog closes.
                        saveCall(call);
                        ((ResolvableApiException) exception).startResolutionForResult(activity, REQUEST_CHECK_SETTINGS);
                    } catch (Exception sendEx) {
                        JSObject result = new JSObject();
                        result.put("enabled", false);
                        result.put("reason", "resolution_failed");
                        call.resolve(result);
                    }
                } else {
                    // Not resolvable at all on this device (e.g. no
                    // Location hardware, or Play Services unavailable) --
                    // report false rather than leaving the JS side hanging.
                    JSObject result = new JSObject();
                    result.put("enabled", false);
                    result.put("reason", "not_resolvable");
                    call.resolve(result);
                }
            });
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_CHECK_SETTINGS) return;
        PluginCall call = getSavedCall();
        if (call == null) return;
        JSObject result = new JSObject();
        // RESULT_OK means the user tapped "Turn on" in the system dialog;
        // anything else (back button, "No thanks") means they declined --
        // either way this resolves the same JS promise, never leaves it hanging.
        result.put("enabled", resultCode == Activity.RESULT_OK);
        call.resolve(result);
        removeSavedCall();
    }
}
