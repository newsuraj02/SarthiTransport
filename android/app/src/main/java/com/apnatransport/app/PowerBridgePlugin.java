package com.apnatransport.app;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

// Battery-optimization exemption + OEM "autostart"/background-activity
// settings -- the actual fix for LocationTrackerService (see that file)
// getting killed once the driver's phone decides the app is idle, which
// background/foreground LOCATION permission itself does nothing to
// prevent. Two very different mechanisms bundled into one plugin since
// both exist for the same reason (this app staying alive in the
// background) and both are asked for from the same place in DriverHome:
//
// 1. REQUEST_IGNORE_BATTERY_OPTIMIZATIONS -- a real, standard Android
//    system dialog (AlertDialog, not a Settings screen) asking "Allow
//    Apna Transport to ignore battery optimizations?". Stock Android and
//    most OEMs respect this; it's the same mechanism messaging/calling
//    apps use to keep running.
// 2. OEM "autostart"/"background activity" toggles -- OPPO (ColorOS),
//    Xiaomi (MIUI), Vivo (FuntouchOS) and Huawei (EMUI) each layer their
//    OWN, stricter app-killer on top of stock Android that (1) above does
//    NOT override, with no standard API or system dialog for it at all --
//    only an OEM-specific settings screen, undocumented and liable to
//    move between OS versions, so this is a best-effort attempt with a
//    graceful no-op fallback, never a guaranteed result.
@CapacitorPlugin(name = "PowerBridge")
public class PowerBridgePlugin extends Plugin {

    @PluginMethod
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ignoring", isIgnoringNow());
        call.resolve(result);
    }

    private boolean isIgnoringNow() {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity available.");
            return;
        }
        if (isIgnoringNow()) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            startActivityForResult(call, intent, "batteryOptimizationResult");
        } catch (Exception e) {
            // Not every OEM/ROM ships this dialog (a few strip it entirely)
            // -- resolve granted:false rather than leaving the caller
            // hanging, same reasoning as every other "might not exist on
            // this device" native call in this app.
            JSObject result = new JSObject();
            result.put("granted", false);
            call.resolve(result);
        }
    }

    @ActivityCallback
    private void batteryOptimizationResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        // The dialog itself doesn't reliably hand back an accept/decline
        // result code across every OEM -- checking the real state afterward
        // via PowerManager is the only trustworthy signal either way.
        JSObject data = new JSObject();
        data.put("granted", isIgnoringNow());
        call.resolve(data);
    }

    // Lets the JS side decide whether to even show its one-time "enable
    // background tracking" card before calling openAutoStartSettings below
    // -- true only for the OEMs known to layer their own aggressive
    // app-killer on top of stock Android; showing that card (and jumping
    // to a Settings screen) on every other manufacturer would just be
    // noise, since stock Android's battery-optimization exemption above
    // is already sufficient there.
    @PluginMethod
    public void needsAutoStartSettings(PluginCall call) {
        String manufacturer = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase();
        boolean needed = manufacturer.contains("xiaomi") || manufacturer.contains("oppo")
            || manufacturer.contains("vivo") || manufacturer.contains("huawei") || manufacturer.contains("honor");
        JSObject result = new JSObject();
        result.put("needed", needed);
        call.resolve(result);
    }

    // Best-effort deep link into the specific OEM screen that controls
    // whether this app may run in the background / auto-start -- tried in
    // order, first one whose Activity actually resolves on this device
    // wins. Falls back to this app's own Application Details settings
    // page (always resolves) if none of the OEM-specific ones do, so the
    // driver still lands somewhere useful instead of nothing happening.
    @PluginMethod
    public void openAutoStartSettings(PluginCall call) {
        Context context = getContext();
        String manufacturer = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase();
        Intent[] candidates;
        if (manufacturer.contains("xiaomi")) {
            candidates = new Intent[] {
                componentIntent("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
            };
        } else if (manufacturer.contains("oppo")) {
            candidates = new Intent[] {
                componentIntent("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
                componentIntent("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"),
                componentIntent("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"),
            };
        } else if (manufacturer.contains("vivo")) {
            candidates = new Intent[] {
                componentIntent("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"),
                componentIntent("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"),
            };
        } else if (manufacturer.contains("huawei") || manufacturer.contains("honor")) {
            candidates = new Intent[] {
                componentIntent("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"),
            };
        } else {
            candidates = new Intent[0];
        }

        for (Intent intent : candidates) {
            if (intent != null && intent.resolveActivity(context.getPackageManager()) != null) {
                intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
                JSObject result = new JSObject();
                result.put("opened", true);
                call.resolve(result);
                return;
            }
        }

        // Fallback: this app's own details screen -- battery/background
        // usage controls live somewhere on it on every OEM even when the
        // dedicated autostart screen above can't be found.
        Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        fallback.setData(Uri.fromParts("package", context.getPackageName(), null));
        fallback.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        boolean opened = fallback.resolveActivity(context.getPackageManager()) != null;
        if (opened) context.startActivity(fallback);
        JSObject result = new JSObject();
        result.put("opened", opened);
        call.resolve(result);
    }

    private Intent componentIntent(String pkg, String cls) {
        try {
            Intent intent = new Intent();
            intent.setComponent(new ComponentName(pkg, cls));
            return intent;
        } catch (Exception e) {
            return null;
        }
    }
}
