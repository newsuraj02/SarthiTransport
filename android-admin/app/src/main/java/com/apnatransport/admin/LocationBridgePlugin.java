package com.apnatransport.admin;

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

// Same plugin as the main app's (com.apnatransport.app.LocationBridgePlugin)
// -- see that file's comment for the full "why". Admin doesn't currently
// do customer/driver GPS tracking, so this isn't called from src/App.jsx
// today, but it's kept here in step with the main app for consistency.
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
                JSObject result = new JSObject();
                result.put("enabled", true);
                call.resolve(result);
            })
            .addOnFailureListener(activity, exception -> {
                if (exception instanceof ResolvableApiException) {
                    try {
                        saveCall(call);
                        ((ResolvableApiException) exception).startResolutionForResult(activity, REQUEST_CHECK_SETTINGS);
                    } catch (Exception sendEx) {
                        JSObject result = new JSObject();
                        result.put("enabled", false);
                        result.put("reason", "resolution_failed");
                        call.resolve(result);
                    }
                } else {
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
        result.put("enabled", resultCode == Activity.RESULT_OK);
        call.resolve(result);
        removeSavedCall();
    }
}
