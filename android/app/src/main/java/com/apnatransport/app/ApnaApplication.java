package com.apnatransport.app;

import android.app.Application;

// Runs whenever the app's process starts -- an app open, an FCM wake-up, or
// Android restarting only the GPS service. Starts LoadWatcher (the
// FCM-independent load ring, 2026-10-14) so it is alive in every case.
public class ApnaApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        try {
            LoadWatcher.start(this);
        } catch (Exception ignored) {
            // Never let the watcher stop the app from starting.
        }
    }
}
