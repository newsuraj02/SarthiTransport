package com.apnatransport.admin;

import android.app.Activity;
import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.UpdateAvailability;

// Same plugin as the main app's (com.apnatransport.app.AppUpdateBridgePlugin)
// -- see that file's comment for the full "why". Admin is distributed as a
// sideloaded APK, not a Play Store listing, so Play Core has nothing to
// find here and this will always resolve {started:false}; kept in step
// with the main app for consistency, and harmless either way since the JS
// side already falls back to the manual Play Store link on false.
@CapacitorPlugin(name = "AppUpdateBridge")
public class AppUpdateBridgePlugin extends Plugin {
    private static final int REQUEST_UPDATE = 5391;

    @PluginMethod
    public void startImmediateUpdate(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity available.");
            return;
        }

        AppUpdateManager manager = AppUpdateManagerFactory.create(activity);
        manager.getAppUpdateInfo()
            .addOnSuccessListener(info -> startFlowIfAvailable(manager, info, activity, call))
            .addOnFailureListener(exception -> {
                JSObject result = new JSObject();
                result.put("started", false);
                call.resolve(result);
            });
    }

    private void startFlowIfAvailable(AppUpdateManager manager, AppUpdateInfo info, Activity activity, PluginCall call) {
        boolean canStartImmediate = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
            && info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE);
        if (!canStartImmediate) {
            JSObject result = new JSObject();
            result.put("started", false);
            call.resolve(result);
            return;
        }
        try {
            saveCall(call);
            manager.startUpdateFlowForResult(info, activity, AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build(), REQUEST_UPDATE);
        } catch (Exception e) {
            JSObject result = new JSObject();
            result.put("started", false);
            call.resolve(result);
        }
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_UPDATE) return;
        PluginCall call = getSavedCall();
        if (call == null) return;
        JSObject result = new JSObject();
        result.put("started", resultCode == Activity.RESULT_OK);
        call.resolve(result);
        removeSavedCall();
    }
}
