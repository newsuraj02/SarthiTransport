package com.apnatransport.app;

import android.Manifest;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.messaging.FirebaseMessaging;

// Real-device finding (2026-10-13): on at least one test device, EVERY
// call to the official @capacitor/push-notifications plugin hangs
// forever -- not just checkPermissions()/requestPermissions(), but even
// its raw register() call, whose own native Java resolves immediately
// without waiting for anything. Ruled out first: the Capacitor bridge
// itself is healthy on that device (CapacitorApp.getInfo(), a different
// plugin, resolves instantly); the official plugin's checkPermissions()/
// register() source (node_modules/@capacitor/push-notifications) is
// plain, synchronous code with no path that could legitimately hang; a
// full uninstall+reinstall didn't change anything. That leaves the
// official plugin's own load()/bridge-registration never completing on
// that specific device, for reasons invisible without native-side logs
// (no adb/chrome://inspect access available to get them).
//
// This plugin re-implements only the two things that were actually
// blocked -- checking/requesting POST_NOTIFICATIONS and fetching the FCM
// token -- as a small custom plugin instead, registered the exact same
// way (registerPlugin() in MainActivity, before super.onCreate()) as
// PowerBridgePlugin/RingingBridgePlugin, which are BOTH proven to work
// reliably on this same device. Deliberately does NOT touch anything
// about how ring pushes are received -- that's AppFirebaseMessagingService,
// a plain native FCM service entirely independent of this Capacitor
// plugin bridge, already working. This only replaces the "get this
// device's token written to Firestore" path.
@CapacitorPlugin(
    name = "NativePush",
    permissions = @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = NativePushPlugin.NOTIFICATIONS)
)
public class NativePushPlugin extends Plugin {
    static final String NOTIFICATIONS = "notifications";

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject result = new JSObject();
        result.put("receive", currentState());
        call.resolve(result);
    }

    private String currentState() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return "granted";
        PermissionState state = getPermissionState(NOTIFICATIONS);
        return state == null ? "prompt" : state.toString();
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState(NOTIFICATIONS) == PermissionState.GRANTED) {
            checkPermissions(call);
            return;
        }
        requestPermissionForAlias(NOTIFICATIONS, call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        checkPermissions(call);
    }

    // Fetches the current FCM token directly -- same
    // FirebaseMessaging.getInstance().getToken() call the official
    // plugin's own register() makes, just awaited and resolved with the
    // actual token value here instead of firing a separate "registration"
    // event the broken bridge could never have delivered anyway.
    @PluginMethod
    public void getToken(PluginCall call) {
        FirebaseMessaging.getInstance().setAutoInitEnabled(true);
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (!task.isSuccessful() || task.getResult() == null) {
                call.reject(task.getException() != null ? task.getException().getMessage() : "no token");
                return;
            }
            JSObject result = new JSObject();
            result.put("token", task.getResult());
            call.resolve(result);
        });
    }
}
