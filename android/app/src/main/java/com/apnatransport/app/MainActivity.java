package com.apnatransport.app;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // TEMPORARY, for the live GPS investigation -- lets chrome://inspect
        // attach to this app's WebView (Chrome DevTools console, network
        // tab, live JS execution) even though this is a release build,
        // which normally has this off. Must run before super.onCreate(),
        // which is where Capacitor actually creates the WebView -- setting
        // this any later has no effect on the already-created view.
        // Remove once the driver-webview-geolocation-hangs-forever /
        // FusedLocationBridge investigation is resolved.
        WebView.setWebContentsDebuggingEnabled(true);
        // Must run before super.onCreate() -- Capacitor registers plugins
        // during the base onCreate(), so registering any later misses it.
        registerPlugin(SettingsBridgePlugin.class);
        registerPlugin(LocationBridgePlugin.class);
        registerPlugin(AppUpdateBridgePlugin.class);
        registerPlugin(FusedLocationBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
