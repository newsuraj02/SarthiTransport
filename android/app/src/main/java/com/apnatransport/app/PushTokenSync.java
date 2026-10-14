package com.apnatransport.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.firestore.FieldValue;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.HashMap;
import java.util.Map;

// Owner report (2026-10-14): the load bell rings while the app is open
// (DriverHome's in-app Firestore listener + playStrongBeep) but never when
// the app is closed or the phone is asleep -- that case depends 100% on
// drivers/{mobile}.fcmToken being this phone's CURRENT FCM token, and the
// only code that ever wrote it was JavaScript in the WebView (which hung
// on real devices -- see NativePushPlugin -- and never runs at all while
// the app is closed, e.g. when Google rotates the token).
//
// This writes the token from native code instead, with no WebView/JS in
// the path at all:
//   - every time the app comes to the foreground (MainActivity.onResume)
//   - whenever FCM issues a new token, even with the app closed
//     (AppFirebaseMessagingService.onNewToken)
// It uses the native FirebaseAuth session LocationTrackerService already
// establishes (signInWithCustomToken via mintLocationServiceToken, same uid
// as the driver's own login), so it passes the same firestore.rules
// isOwnPhone() check that service's own driver-doc writes already pass.
// No session yet (driver never went on duty on this install)? The token is
// remembered and written on the next call once a session exists; the JS
// paths (PermissionGate / useRideNotifications) still cover that window.
final class PushTokenSync {
    private static final String TAG = "PushTokenSync";
    private static final String PREFS = "push_token_sync";
    private static final String KEY_PENDING = "pending_token";

    private PushTokenSync() {}

    static void sync(Context context) {
        try {
            FirebaseMessaging.getInstance().setAutoInitEnabled(true);
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (!task.isSuccessful() || task.getResult() == null) {
                    Log.e(TAG, "getToken failed", task.getException());
                    return;
                }
                write(context, task.getResult());
            });
        } catch (Exception e) {
            Log.e(TAG, "sync", e);
        }
    }

    static void write(Context context, String token) {
        if (token == null || token.isEmpty()) return;
        Context app = context.getApplicationContext();
        SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String mobile = currentDriverMobile();
        if (mobile == null) {
            prefs.edit().putString(KEY_PENDING, token).apply();
            return;
        }
        Map<String, Object> patch = new HashMap<>();
        patch.put("fcmToken", token);
        patch.put("fcmTokenSavedAt", System.currentTimeMillis());
        patch.put("fcmTokenSource", "native");
        patch.put("fcmTokenUpdatedAt", FieldValue.serverTimestamp());
        FirebaseFirestore.getInstance().collection("drivers").document(mobile)
            .update(patch)
            .addOnSuccessListener(v -> prefs.edit().remove(KEY_PENDING).apply())
            .addOnFailureListener(e -> {
                Log.e(TAG, "fcmToken write failed", e);
                prefs.edit().putString(KEY_PENDING, token).apply();
            });
    }

    // Driver mobile from the native session: PIN logins are
    // "{mobile}@driver.apnatransport.local", OTP logins carry "+91{mobile}".
    // Customer sessions are ignored here (the bell is driver-only).
    private static String currentDriverMobile() {
        FirebaseUser user = FirebaseAuth.getInstance().getCurrentUser();
        if (user == null) return null;
        String email = user.getEmail();
        if (email != null && email.endsWith("@driver.apnatransport.local")) {
            String m = email.substring(0, email.indexOf('@'));
            return m.matches("\\d{10}") ? m : null;
        }
        String phone = user.getPhoneNumber();
        if (phone != null && phone.startsWith("+91") && phone.length() == 13) return phone.substring(3);
        return null;
    }
}
