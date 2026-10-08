# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# --- R8 enabled (release build, see build.gradle's minifyEnabled) ---
# Play Console flagged DEX optimisation/obfuscation/shrinking as "Low"/"-"
# because minification was off entirely -- these rules let R8 actually
# shrink+obfuscate third-party code (most of the real DEX size) while
# fully protecting every class this app's own native code depends on
# being found/called by its real name at runtime (Capacitor's plugin
# bridge, Android's manifest-declared services/activities, and anything
# reached only via reflection). Getting this wrong doesn't fail the
# build -- it fails silently on-device (a plugin call that does nothing,
# a crash), which is exactly why this is broad rather than trying to
# name only the minimum needed: every one of this app's own classes is
# under com.apnatransport.app, including the GPS tracking service/plugins
# that are frozen elsewhere in this codebase and must keep working
# exactly as before, so the blanket keep below is deliberate, not lazy.
-keep class com.apnatransport.app.** { *; }

# Capacitor's plugin bridge discovers plugins via this annotation and
# calls their @PluginMethod-annotated methods by reflection -- without
# this, R8 could rename/strip a plugin class or method with no compile-
# time signal, and the JS side's call would just silently do nothing.
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.PluginMethod <methods>;
}

# Firebase Cloud Messaging calls AppFirebaseMessagingService (declared by
# class name in AndroidManifest.xml) directly from system code, not
# through any app code path R8 can see -- same reasoning as the plugins
# above. Already covered by the app-wide keep, listed explicitly since
# this is the one most load-bearing for the app actually functioning
# (every new-load push alert goes through it).
-keep class com.apnatransport.app.AppFirebaseMessagingService { *; }

# Google Play Services / Play Core ship their own consumer ProGuard rules
# inside their AARs, which AGP merges in automatically -- these two are
# just a defensive backstop for AppUpdateBridgePlugin (Play Core in-app
# update) and FusedLocationBridgePlugin/LocationBridgePlugin (Play
# Services location), in case any transitive class isn't already covered.
-keep class com.google.android.play.** { *; }
-keep class com.google.android.gms.location.** { *; }
