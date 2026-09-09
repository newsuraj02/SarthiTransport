package com.apnatransport.admin;

import android.content.Intent;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// JS-callable front door onto SettingsBridgeActivity for this app's own
// Capacitor WebView. Registered as "SettingsBridge" so the web side calls
// it via Capacitor.registerPlugin("SettingsBridge") -- see
// openNativeSettingsBridge in src/App.jsx.
//
// Why a plugin and not the same <a href="intent:...">androidSettingsBridgeUrl
// link the TWA build uses (see twa/patch-project.js and
// SettingsBridgeActivity.java in this same directory): Chrome/Custom Tabs
// (what the TWA actually runs on) specially decodes "intent:" scheme
// links into a real Intent when a page navigates to one. Capacitor's own
// WebView bridge (com.getcapacitor.Bridge#launchIntent) does not -- it
// just fires a bare ACTION_VIEW at the literal "intent:" URI, which
// resolves to nothing and silently fails, the exact same failure this
// whole settings-bridge mechanism exists to route around in the first
// place. Firing the real Intent from native code here, instead of
// relying on WebView URL-scheme interception, sidesteps that entirely.
@CapacitorPlugin(name = "SettingsBridge")
public class SettingsBridgePlugin extends Plugin {
    @PluginMethod
    public void open(PluginCall call) {
        String target = call.getString("target", "");
        // Goes through the same custom OPEN_SETTINGS action declared in
        // AndroidManifest.xml (rather than starting SettingsBridgeActivity
        // by class directly) so this stays a faithful match of the TWA's
        // intent-action pattern, not just an equivalent result.
        Intent intent = new Intent(getContext().getPackageName() + ".OPEN_SETTINGS");
        intent.setPackage(getContext().getPackageName());
        intent.putExtra("target", target);
        getContext().startActivity(intent);
        call.resolve();
    }
}
