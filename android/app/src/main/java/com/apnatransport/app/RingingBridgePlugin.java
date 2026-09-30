package com.apnatransport.app;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// JS-callable front door onto whatever ringAction/ringBookingId extras
// RingingBookingActivity's Accept/Reject buttons most recently launched
// MainActivity with (see MainActivity.onNewIntent, which keeps
// getIntent() pointed at the latest one). Registered as "RingingBridge" --
// see consumePendingRingAction in src/App.jsx, which polls this on driver
// login/mount and on every foreground resume.
//
// "Consume" (not just "get"): removeExtra after reading so the same
// decision can never be replayed twice -- e.g. the app coming back to the
// foreground a second time for an unrelated reason (screen lock/unlock)
// must not re-fire an already-handled Accept.
@CapacitorPlugin(name = "RingingBridge")
public class RingingBridgePlugin extends Plugin {
    @PluginMethod
    public void consumePendingAction(PluginCall call) {
        Intent intent = getActivity().getIntent();
        String action = intent.getStringExtra("ringAction");
        String bookingId = intent.getStringExtra("ringBookingId");
        intent.removeExtra("ringAction");
        intent.removeExtra("ringBookingId");

        JSObject result = new JSObject();
        result.put("action", action);
        result.put("bookingId", bookingId);
        call.resolve(result);
    }
}
