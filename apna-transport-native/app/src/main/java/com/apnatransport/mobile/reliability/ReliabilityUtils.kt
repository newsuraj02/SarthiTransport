package com.apnatransport.mobile.reliability

import android.Manifest
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.google.android.gms.common.api.ResolvableApiException
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.LocationSettingsRequest
import com.google.android.gms.location.Priority
import kotlinx.coroutines.tasks.await

// Ported from the hybrid app's android/app/src/main/java/com/apnatransport/app/
// PowerBridgePlugin.java, FusedLocationBridgePlugin.java and
// RingingBridgePlugin.java -- those are real, proven-on-device fixes for
// why a background Android service gets killed even when the location/
// notification permissions themselves are granted. Ported as plain
// functions here rather than Capacitor @PluginMethod/PluginCall wrappers:
// that indirection existed only to cross the hybrid app's WebView/JS
// boundary, which doesn't exist in a fully-native app -- Compose code
// here can call straight into these and launch system dialogs/Settings
// screens directly.

// -- Battery optimization exemption (PowerBridgePlugin) --------------------
//
// LocationTrackerService getting killed once the OS decides the app is
// idle is NOT something granting location permission (foreground or
// background) does anything to prevent -- that's a separate, additional
// battery-optimization kill switch stock Android applies to every app.

fun isIgnoringBatteryOptimizations(context: Context): Boolean {
    val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
    return pm != null && pm.isIgnoringBatteryOptimizations(context.packageName)
}

// Launch via rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()).
// The dialog itself doesn't reliably hand back an accept/decline result
// code across every OEM -- re-check isIgnoringBatteryOptimizations()
// afterward rather than trusting the ActivityResult, same reasoning as
// the original plugin's own comment.
fun batteryOptimizationExemptionIntent(context: Context): Intent =
    Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).setData(Uri.parse("package:${context.packageName}"))

// -- OEM "autostart"/background-activity settings (PowerBridgePlugin) ------
//
// Xiaomi (MIUI), OPPO (ColorOS), Vivo (FuntouchOS) and Huawei/Honor (EMUI)
// each layer their OWN, stricter app-killer on top of stock Android that
// the battery-optimization exemption above does NOT override, with no
// standard API or system dialog for it at all -- only an OEM-specific
// settings screen, undocumented and liable to move between OS versions.
// Best-effort only, never a guaranteed result -- there's no API to even
// check whether it's already allowed, only to try opening the screen.

fun needsAutoStartSettings(): Boolean {
    val manufacturer = Build.MANUFACTURER?.lowercase() ?: ""
    return listOf("xiaomi", "oppo", "vivo", "huawei", "honor").any { manufacturer.contains(it) }
}

// Tries OEM-specific candidates in order, first one that actually resolves
// AND launches without throwing wins; falls back to this app's own
// Application Details screen (always resolves) so the driver still lands
// somewhere useful. resolveActivity() only confirms something CLAIMS to
// handle the component -- several OEMs lock their autostart screen down
// as protected/system-only, so it resolves fine but actually launching it
// throws SecurityException at runtime (confirmed live on a real device
// with the hybrid app) -- caught here and falls through to the next
// candidate instead of crashing.
fun openAutoStartSettings(context: Context): Boolean {
    val manufacturer = Build.MANUFACTURER?.lowercase() ?: ""
    val candidates = when {
        manufacturer.contains("xiaomi") -> listOf(
            componentIntent("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
        )
        manufacturer.contains("oppo") -> listOf(
            componentIntent("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
            componentIntent("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"),
            componentIntent("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"),
        )
        manufacturer.contains("vivo") -> listOf(
            componentIntent("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"),
            componentIntent("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"),
        )
        manufacturer.contains("huawei") || manufacturer.contains("honor") -> listOf(
            componentIntent("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"),
        )
        else -> emptyList()
    }

    for (intent in candidates) {
        if (intent == null || intent.resolveActivity(context.packageManager) == null) continue
        try {
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
            context.startActivity(intent)
            return true
        } catch (_: Exception) {
            // try the next candidate, or the fallback below
        }
    }

    val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
        .setData(Uri.fromParts("package", context.packageName, null))
        .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return try {
        if (fallback.resolveActivity(context.packageManager) != null) {
            context.startActivity(fallback)
            true
        } else {
            false
        }
    } catch (_: Exception) {
        false
    }
}

private fun componentIntent(pkg: String, cls: String): Intent? = try {
    Intent().apply { component = ComponentName(pkg, cls) }
} catch (_: Exception) {
    null
}

// -- Background location permission (FusedLocationBridgePlugin) ------------
//
// Must be requested SEPARATELY from foreground location, after foreground
// is already granted -- Android refuses to grant ACCESS_BACKGROUND_LOCATION
// as part of the same request as foreground location on API 30+, silently
// dropping it from the dialog entirely if bundled together. Below API 29
// there's no separate background permission at all; foreground already
// covers it.

fun hasBackgroundLocationPermission(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    }
    return ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED
}

// -- Full-screen ring alert permission, API 34+ (RingingBridgePlugin) ------
//
// Android 14 added a separate "Full screen notifications" permission on
// top of POST_NOTIFICATIONS/USE_FULL_SCREEN_INTENT -- canUseFullScreenIntent()
// itself doesn't exist on older SDKs, so this reports true there, same as
// the OS effectively allows unconditionally pre-34.

fun canUseFullScreenIntent(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < 34) return true
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
    return manager != null && manager.canUseFullScreenIntent()
}

// -- Direct Settings deep links -----------------------------------------
//
// The hybrid app needed a dedicated SettingsBridgeActivity for these
// because Chrome/WebView deliberately blocks web content from firing
// "android.settings.*" intents itself (an anti-phishing measure). A
// fully-native Activity has no such restriction calling a system Settings
// API on itself, so these just fire the Intent directly -- no bridge
// Activity needed.

fun openFullScreenIntentSettings(context: Context) {
    val intent = if (Build.VERSION.SDK_INT >= 34) {
        Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).setData(Uri.fromParts("package", context.packageName, null))
    } else {
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
    }
    intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
    if (intent.resolveActivity(context.packageManager) != null) context.startActivity(intent)
}

// -- Device-wide "Turn on Location?" dialog (LocationBridgePlugin) ---------
//
// Distinct from app permission (hasLocationPermission above) -- this is
// about the phone's Location Services/GPS being switched off entirely at
// the OS level, which no amount of granted app permission does anything
// to fix. Wraps Play Services' SettingsClient.checkLocationSettings(),
// which either confirms Location is already on, or hands back a
// ResolvableApiException whose .resolution (an IntentSender) pops the
// exact same native "Turn on Location?" dialog Google Maps/Uber show --
// no manual trip to Settings needed. Launch the returned IntentSender via
// rememberLauncherForActivityResult(ActivityResultContracts.StartIntentSenderForResult()).
sealed class LocationServicesCheck {
    data object Enabled : LocationServicesCheck()
    data class Resolvable(val exception: ResolvableApiException) : LocationServicesCheck()
    data object NotResolvable : LocationServicesCheck()
}

suspend fun checkLocationServicesEnabled(context: Context): LocationServicesCheck {
    val request = LocationSettingsRequest.Builder()
        .addLocationRequest(LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 10000L).build())
        .build()
    return try {
        LocationServices.getSettingsClient(context).checkLocationSettings(request).await()
        LocationServicesCheck.Enabled
    } catch (e: ResolvableApiException) {
        LocationServicesCheck.Resolvable(e)
    } catch (_: Exception) {
        // Not resolvable at all on this device (e.g. no Location hardware,
        // or Play Services unavailable) -- caller should just proceed
        // rather than block on something it can't fix either.
        LocationServicesCheck.NotResolvable
    }
}
