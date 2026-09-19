package com.apnatransport.app;

import android.Manifest;
import android.location.Location;
import android.os.Looper;
import androidx.annotation.NonNull;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import java.util.HashMap;
import java.util.Map;

// Replaces @capacitor/geolocation -- a real bug was caught live via a
// device bug report: Play Services WAS delivering location fixes to this
// app's process (confirmed at the OS level, "delivered locations[1]
// to ... com.apnatransport.app"), but the fix never reached JS. The exact
// same moment, the log shows: "A WebView method was called on thread
// 'binder:...'. All WebView methods must be called on the same thread."
// @capacitor/geolocation's coroutine/Flow-based callback chain was firing
// on a background/binder thread instead of the main thread, so Android's
// WebView silently discarded the handoff back into JS instead of
// crashing -- it just looked like the call hung forever.
// FusedLocationProviderClient.requestLocationUpdates() has a long-standing,
// documented overload that takes an explicit Looper -- passing
// Looper.getMainLooper() here guarantees every callback (and the
// call.resolve()/reject() inside it, which touch the WebView) always runs
// on the main thread, closing off that exact failure mode.
@CapacitorPlugin(
    name = "FusedLocationBridge",
    permissions = { @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, alias = "location") }
)
public class FusedLocationBridgePlugin extends Plugin {
    private FusedLocationProviderClient fusedClient;
    private final Map<String, LocationCallback> activeWatches = new HashMap<>();

    @Override
    public void load() {
        super.load();
        fusedClient = LocationServices.getFusedLocationProviderClient(getContext());
    }

    @PluginMethod
    public void getCurrentPosition(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "currentPositionPermsCallback");
            return;
        }
        fetchOnce(call);
    }

    @PermissionCallback
    private void currentPositionPermsCallback(PluginCall call) {
        if (getPermissionState("location") == PermissionState.GRANTED) fetchOnce(call);
        else call.reject("Location permission denied.");
    }

    private void fetchOnce(PluginCall call) {
        LocationRequest request = buildRequest(call);
        LocationCallback oneShot = new LocationCallback() {
            @Override
            public void onLocationResult(@NonNull LocationResult result) {
                fusedClient.removeLocationUpdates(this);
                Location loc = result.getLastLocation();
                if (loc == null) {
                    call.reject("No location available.");
                    return;
                }
                call.resolve(locationToJs(loc));
            }
        };
        fusedClient.requestLocationUpdates(request, oneShot, Looper.getMainLooper());
    }

    // RETURN_CALLBACK -- same generic Capacitor mechanism @capacitor/geolocation's
    // own watchPosition used (resolves once with a callback id the JS side
    // can clearWatch() later, then keeps delivering updates through that
    // same call via keepAlive).
    @PluginMethod(returnType = PluginMethod.RETURN_CALLBACK)
    public void watchPosition(PluginCall call) {
        call.setKeepAlive(true);
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "watchPositionPermsCallback");
            return;
        }
        startWatch(call);
    }

    @PermissionCallback
    private void watchPositionPermsCallback(PluginCall call) {
        if (getPermissionState("location") == PermissionState.GRANTED) startWatch(call);
        else call.reject("Location permission denied.");
    }

    private void startWatch(PluginCall call) {
        LocationRequest request = buildRequest(call);
        LocationCallback callback = new LocationCallback() {
            @Override
            public void onLocationResult(@NonNull LocationResult result) {
                Location loc = result.getLastLocation();
                if (loc == null) return;
                call.resolve(locationToJs(loc));
            }
        };
        activeWatches.put(call.getCallbackId(), callback);
        fusedClient.requestLocationUpdates(request, callback, Looper.getMainLooper());
    }

    @PluginMethod
    public void clearWatch(PluginCall call) {
        String id = call.getString("id");
        LocationCallback callback = id != null ? activeWatches.remove(id) : null;
        if (callback != null) fusedClient.removeLocationUpdates(callback);
        call.resolve();
    }

    private LocationRequest buildRequest(PluginCall call) {
        boolean highAccuracy = Boolean.TRUE.equals(call.getBoolean("enableHighAccuracy", false));
        long interval = call.getLong("minimumUpdateInterval", 5000L);
        return new LocationRequest.Builder(highAccuracy ? Priority.PRIORITY_HIGH_ACCURACY : Priority.PRIORITY_BALANCED_POWER_ACCURACY, interval)
            .setMinUpdateIntervalMillis(interval)
            .build();
    }

    private JSObject locationToJs(Location loc) {
        JSObject coords = new JSObject();
        coords.put("latitude", loc.getLatitude());
        coords.put("longitude", loc.getLongitude());
        coords.put("accuracy", loc.getAccuracy());
        if (loc.hasAltitude()) coords.put("altitude", loc.getAltitude());
        if (loc.hasSpeed()) coords.put("speed", loc.getSpeed());
        if (loc.hasBearing()) coords.put("heading", loc.getBearing());
        JSObject result = new JSObject();
        result.put("timestamp", loc.getTime());
        result.put("coords", coords);
        return result;
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        for (LocationCallback cb : activeWatches.values()) fusedClient.removeLocationUpdates(cb);
        activeWatches.clear();
    }
}
