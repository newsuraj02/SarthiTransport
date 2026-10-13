package com.apnatransport.app;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.View;
import android.view.WindowManager;
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

    // Whether this app can actually force the full-screen ring screen over
    // the lock screen right now -- see AppFirebaseMessagingService.java's
    // setFullScreenIntent. Android 14+ (API 34) added a separate
    // "Full screen notifications" permission that isn't auto-granted on a
    // fresh install; without it, the notification still posts normally
    // (heads-up banner + sound) but silently never wakes the screen. No
    // such restriction exists before API 34 -- canUseFullScreenIntent()
    // itself doesn't exist on older SDKs, so this just reports true there,
    // same as the OS effectively allows unconditionally.
    @PluginMethod
    public void canUseFullScreenIntent(PluginCall call) {
        boolean can = true;
        if (Build.VERSION.SDK_INT >= 34) {
            NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            can = manager != null && manager.canUseFullScreenIntent();
        }
        JSObject result = new JSObject();
        result.put("can", can);
        call.resolve(result);
    }

    // "Display over other apps" -- with it, the ring screen can open by
    // itself even while the driver is inside another app (owner rule,
    // 2026-10-13). Without it the full-screen intent only shows a banner
    // whenever the phone is unlocked and in use.
    @PluginMethod
    public void canDrawOverlays(PluginCall call) {
        JSObject result = new JSObject();
        result.put("can", Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception ignored) {
        }
        call.resolve();
    }

    // ---- Auto-return from Settings (owner request 2026-10-13 15:02) ----
    // The driver flips the toggle on the "Full screen notifications" or
    // "Display over other apps" screen, and the app comes straight back by
    // itself -- no hunting for the back arrow, and the home screen is clean
    // again. While the Settings screen is open this polls the real state
    // every 500 ms (max 2 minutes); the moment it turns on, MainActivity is
    // brought back to the front. Bringing an activity forward from the
    // background is only allowed for an app that holds "Display over other
    // apps" (and, on Android 15+, has an overlay window showing), so a 1x1
    // invisible overlay is shown for a moment first. If the driver backs
    // out without turning it on, nothing happens -- they're back anyway.
    private final Handler returnHandler = new Handler(Looper.getMainLooper());
    private Runnable returnPoll = null;

    @PluginMethod
    public void openSettingsAndReturn(PluginCall call) {
        final String target = call.getString("target", "");
        final Context ctx = getContext();
        try {
            Intent intent;
            if ("overlay".equals(target)) {
                intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + ctx.getPackageName()));
            } else if ("full_screen_intent".equals(target) && Build.VERSION.SDK_INT >= 34) {
                intent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                intent.setData(Uri.fromParts("package", ctx.getPackageName(), null));
            } else {
                intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                intent.putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);
        } catch (Exception e) {
            JSObject r = new JSObject();
            r.put("opened", false);
            call.resolve(r);
            return;
        }
        stopReturnPoll();
        final long until = System.currentTimeMillis() + 120000;
        returnPoll = new Runnable() {
            @Override
            public void run() {
                if (System.currentTimeMillis() > until) { returnPoll = null; return; }
                if (isGranted(target)) {
                    returnPoll = null;
                    bringAppToFront();
                    return;
                }
                returnHandler.postDelayed(this, 500);
            }
        };
        returnHandler.postDelayed(returnPoll, 800);
        JSObject r = new JSObject();
        r.put("opened", true);
        call.resolve(r);
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        stopReturnPoll(); // driver came back on their own
    }

    private void stopReturnPoll() {
        if (returnPoll != null) {
            returnHandler.removeCallbacks(returnPoll);
            returnPoll = null;
        }
    }

    private boolean isGranted(String target) {
        Context ctx = getContext();
        if ("overlay".equals(target)) {
            return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(ctx);
        }
        if (Build.VERSION.SDK_INT >= 34) {
            NotificationManager m = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            return m != null && m.canUseFullScreenIntent();
        }
        return true;
    }

    private void bringAppToFront() {
        final Context ctx = getContext().getApplicationContext();
        View dot = null;
        WindowManager wm = null;
        try {
            if (Build.VERSION.SDK_INT >= 26 && Settings.canDrawOverlays(ctx)) {
                wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);
                WindowManager.LayoutParams lp = new WindowManager.LayoutParams(1, 1,
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                    PixelFormat.TRANSLUCENT);
                dot = new View(ctx);
                wm.addView(dot, lp);
            }
        } catch (Exception ignored) {
            dot = null;
        }
        try {
            Intent back = new Intent(ctx, MainActivity.class);
            back.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            ctx.startActivity(back);
        } catch (Exception ignored) {
        }
        final View fDot = dot;
        final WindowManager fWm = wm;
        if (fDot != null && fWm != null) {
            returnHandler.postDelayed(() -> {
                try { fWm.removeView(fDot); } catch (Exception ignored) { }
            }, 1500);
        }
    }
}
