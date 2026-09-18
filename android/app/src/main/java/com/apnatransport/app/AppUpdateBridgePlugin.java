package com.apnatransport.app;

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

// Drives Play Core's own full-screen "update the app" flow instead of only
// linking out to Play Store -- src/App.jsx's "Update Required" screen
// (nativeVersionState.outdated) tries this first, and only falls back to
// the manual Play Store link if this resolves {started:false}. Only ever
// finds an update on an install that Play Store itself is tracking, so
// this harmlessly reports no update on Admin's sideloaded APK -- that's
// expected, not an error, see android-admin's copy of this same file.
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
                // No Play Store account/app on this device, or this install
                // isn't one Play Store is tracking (e.g. Admin's sideloaded
                // APK) -- resolve false rather than leaving the JS side
                // hanging, same reasoning as LocationBridgePlugin.
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
            // Saved so handleOnActivityResult below can find its way back to
            // this exact call once Play Core's own update screen closes.
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
        // A successful immediate update restarts the app on its own before
        // this ever resolves. RESULT_CANCELED (user backed out of Play
        // Core's screen) or any failure just means the caller stays on the
        // manual-link fallback until the next foreground-resume version
        // check retries this whole flow again.
        result.put("started", resultCode == Activity.RESULT_OK);
        call.resolve(result);
        freeSavedCall();
    }
}
