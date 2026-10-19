package com.apnatransport.app;

import com.getcapacitor.PluginCall;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import com.google.firebase.analytics.FirebaseAnalytics;

// Owner request (2026-10-19): real conversion events for Google Ads, fired
// at the exact moment a customer or driver finishes signup (see App.jsx's
// CustomerOnboarding onComplete / DriverOnboarding onFirstSignupComplete).
// Google Ads App campaigns import conversion actions from a Firebase
// project's OWN Analytics data for the installed app -- that link is keyed
// to this app's native Firebase Analytics instance (app ID, install ID),
// not to any web-based analytics running inside the WebView, which is why
// this is a native plugin rather than calling firebase/analytics from JS.
// Each campaign (Driver vs Customer) can then be pointed at its own real
// signup event as its conversion goal instead of the generic "install"
// action, once that's set up in the Firebase Console / Google Ads UI (a
// one-time account-linking step on the owner's side -- this plugin only
// gets the underlying event data flowing).
@CapacitorPlugin(name = "AnalyticsBridge")
public class AnalyticsBridgePlugin extends Plugin {

    @PluginMethod
    public void logEvent(PluginCall call) {
        String name = call.getString("name");
        if (name == null || name.isEmpty()) {
            call.reject("name is required.");
            return;
        }
        FirebaseAnalytics.getInstance(getContext()).logEvent(name, null);
        call.resolve();
    }
}
