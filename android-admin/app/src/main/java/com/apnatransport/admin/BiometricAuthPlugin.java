package com.apnatransport.admin;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.provider.Settings;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.Executor;

// Backs AdminBiometricLock in src/App.jsx -- gates the Admin app behind a
// fingerprint scan every time it's opened or resumed, on top of the normal
// Firebase email/password session, which never expires on its own and would
// otherwise leave a signed-in admin session wide open to anyone who picks up
// the phone. Only added to this app (com.apnatransport.admin), not the main
// android/ project, since this lock is Admin-only -- see the doc comment on
// registerPlugin("BiometricAuth") in App.jsx for how the JS side degrades
// gracefully everywhere else the plugin simply isn't present.
@CapacitorPlugin(name = "BiometricAuth")
public class BiometricAuthPlugin extends Plugin {
    // Mirrors BiometricManager's own constants as plain strings so the JS
    // side doesn't need Android's numeric codes -- "available" means a
    // fingerprint (or other class-3 biometric) is enrolled and ready to
    // use right now; anything else means authenticate() would fail before
    // ever showing a prompt.
    @PluginMethod
    public void isAvailable(PluginCall call) {
        BiometricManager manager = BiometricManager.from(getContext());
        int result = manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);
        String status;
        switch (result) {
            case BiometricManager.BIOMETRIC_SUCCESS:
                status = "available";
                break;
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                status = "notEnrolled";
                break;
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
            case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
                status = "noHardware";
                break;
            default:
                status = "unavailable";
        }
        JSObject ret = new JSObject();
        ret.put("status", status);
        call.resolve(ret);
    }

    // Shows the system fingerprint prompt. Resolves (never rejects, so the
    // JS side always gets a clean success/failure flag to branch on)
    // exactly once, on the first terminal outcome -- a single misread
    // finger (onAuthenticationFailed) is NOT terminal and leaves the
    // prompt open for another attempt, same as every other Android app
    // using this API.
    @PluginMethod
    public void authenticate(PluginCall call) {
        Activity activity = getActivity();
        if (!(activity instanceof FragmentActivity)) {
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("error", "no-activity");
            call.resolve(ret);
            return;
        }
        FragmentActivity fragmentActivity = (FragmentActivity) activity;
        String title = call.getString("title", "Admin Login");
        String subtitle = call.getString("subtitle", "Scan your fingerprint to continue");
        String negativeButtonText = call.getString("negativeButtonText", "Use password instead");

        activity.runOnUiThread(() -> {
            Executor executor = ContextCompat.getMainExecutor(getContext());
            BiometricPrompt prompt = new BiometricPrompt(fragmentActivity, executor, new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    call.resolve(ret);
                }

                @Override
                public void onAuthenticationError(int errorCode, CharSequence errString) {
                    // Covers the negative button ("Use password instead"),
                    // a user-initiated cancel, and lockout after too many
                    // bad attempts -- all of these should fall back to
                    // password login on the JS side, not retry the prompt.
                    JSObject ret = new JSObject();
                    ret.put("success", false);
                    ret.put("error", errString != null ? errString.toString() : "error");
                    ret.put("errorCode", errorCode);
                    call.resolve(ret);
                }

                @Override
                public void onAuthenticationFailed() {
                    // A single non-matching scan -- the system prompt is
                    // still showing and will let the admin try again, so
                    // nothing is resolved here.
                }
            });
            BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle(subtitle)
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                .setNegativeButtonText(negativeButtonText)
                .build();
            prompt.authenticate(promptInfo);
        });
    }

    // Deep-links into the device's own fingerprint enrollment flow so an
    // admin who hasn't set one up yet doesn't have to go hunting through
    // Settings themselves. ACTION_BIOMETRIC_ENROLL only exists from
    // Android 11 (R) onward; older devices fall back to the general
    // Security settings screen, which still gets them to the same place
    // in a couple more taps.
    @PluginMethod
    public void openEnrollment(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            intent = new Intent(Settings.ACTION_BIOMETRIC_ENROLL);
            intent.putExtra(Settings.EXTRA_BIOMETRIC_AUTHENTICATORS_ALLOWED, BiometricManager.Authenticators.BIOMETRIC_STRONG);
        } else {
            intent = new Intent(Settings.ACTION_SECURITY_SETTINGS);
        }
        getContext().startActivity(intent);
        call.resolve();
    }
}
