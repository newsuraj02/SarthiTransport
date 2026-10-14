package com.apnatransport.app;

import android.content.Context;
import android.util.Log;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.firestore.DocumentChange;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.ListenerRegistration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

// ---- दूसरा रास्ता: FCM के बिना घंटी (2026-10-14) ----
// Owner: the ring works with the app open, never when it is closed or the
// phone is asleep, and every FCM-side fix tried so far changed nothing.
// This path does not use FCM or the push token at all.
//
// How Uber does it (RAMEN): a live connection from the phone to the
// server for as long as the driver is online. This app already HAS a
// process that stays alive while the driver is on duty, even with the app
// swiped away and the screen off: LocationTrackerService (the GPS
// foreground service, confirmed working on a real device). Any Firestore
// listener inside that same process keeps receiving live updates.
//
// So: whenever the native FirebaseAuth session exists (LocationTrackerService
// signs in with the driver's own uid), listen to open loads
// (bookings where status == "AwaitingDriver" -- a single-field query, no
// extra index; there are only ever a few open loads) and ring natively for
// any load the server put this driver in alertedDriverMobiles (the server's
// own eligibility decision, same list FCM uses). When a load leaves the
// open set (taken/cancelled) its ring is closed.
//
// Started from ApnaApplication.onCreate, which runs whenever the app's
// process starts -- including when Android restarts only the GPS service.
// GPS files are not touched.
final class LoadWatcher {
    private static final String TAG = "LoadWatcher";
    // Ignore loads older than this when the listener (re)attaches, so an old
    // still-open load doesn't ring every time the process restarts.
    private static final long MAX_AGE_MS = 3 * 60 * 1000;

    private static boolean started = false;
    private static ListenerRegistration registration;
    private static String watchingMobile;
    private static final java.util.Set<String> ringing = java.util.Collections.synchronizedSet(new java.util.HashSet<>());

    private LoadWatcher() {}

    static synchronized void start(Context context) {
        if (started) return;
        started = true;
        final Context app = context.getApplicationContext();
        FirebaseAuth.getInstance().addAuthStateListener(auth -> attach(app, auth.getCurrentUser()));
    }

    private static synchronized void attach(Context app, FirebaseUser user) {
        String mobile = driverMobileOf(user);
        if (mobile != null && mobile.equals(watchingMobile) && registration != null) return;
        if (registration != null) { registration.remove(); registration = null; }
        watchingMobile = mobile;
        if (mobile == null) return;

        registration = FirebaseFirestore.getInstance().collection("bookings")
            .whereEqualTo("status", "AwaitingDriver")
            .addSnapshotListener((snap, err) -> {
                if (err != null) { Log.e(TAG, "listen failed", err); return; }
                if (snap == null) return;
                for (DocumentChange change : snap.getDocumentChanges()) {
                    DocumentSnapshot doc = change.getDocument();
                    if (change.getType() == DocumentChange.Type.REMOVED) {
                        // No longer open: someone took it or it was cancelled.
                        // Only close rings this watcher started for THIS load.
                        if (ringing.remove(doc.getId())) AppFirebaseMessagingService.closeLoad(app, doc.getId());
                        continue;
                    }
                    if (!isForMe(doc, mobile)) continue;
                    if (isTooOld(doc)) continue;
                    if (ringing.add(doc.getId())) AppFirebaseMessagingService.showRingingNotification(app, ringData(doc));
                }
            });
        Log.i(TAG, "watching open loads for " + mobile);
    }

    // The server writes alertedDriverMobiles a moment after creating the
    // booking (onDirectRequestBroadcast), so the doc first arrives without
    // it and then as MODIFIED with it -- both pass through here.
    private static boolean isForMe(DocumentSnapshot doc, String mobile) {
        Object list = doc.get("alertedDriverMobiles");
        if (!(list instanceof List)) return false;
        if (!((List<?>) list).contains(mobile)) return false;
        Object pending = doc.get("pendingDriverName");
        return pending == null;
    }

    // Bookings are created with acceptedAt = serverTimestamp() (the creation
    // time, despite the name -- see requestByCategory in src/App.jsx).
    private static boolean isTooOld(DocumentSnapshot doc) {
        com.google.firebase.Timestamp created = doc.getTimestamp("acceptedAt");
        if (created == null) created = doc.getTimestamp("createdAt");
        if (created == null) return false;
        return System.currentTimeMillis() - created.toDate().getTime() > MAX_AGE_MS;
    }

    private static Map<String, String> ringData(DocumentSnapshot doc) {
        Map<String, String> data = new HashMap<>();
        data.put("type", "direct_request_ring");
        data.put("bookingId", doc.getId());
        data.put("pickup", str(doc.get("pickup")));
        data.put("drop", str(doc.get("drop")));
        Object w = doc.get("weight");
        data.put("weight", w == null ? "-" : String.valueOf(w));
        return data;
    }

    private static String str(Object o) { return o == null ? "-" : String.valueOf(o); }

    // Same rule as PushTokenSync: PIN login "{mobile}@driver.apnatransport.local"
    // or OTP login "+91{mobile}". Customer sessions never watch loads.
    private static String driverMobileOf(FirebaseUser user) {
        if (user == null) return null;
        String email = user.getEmail();
        if (email != null) {
            if (!email.endsWith("@driver.apnatransport.local")) return null;
            String m = email.substring(0, email.indexOf('@'));
            return m.matches("\\d{10}") ? m : null;
        }
        String phone = user.getPhoneNumber();
        if (phone != null && phone.startsWith("+91") && phone.length() == 13) return phone.substring(3);
        return null;
    }
}
