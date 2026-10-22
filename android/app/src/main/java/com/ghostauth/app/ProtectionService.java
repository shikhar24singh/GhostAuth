package com.ghostauth.app;

import android.accessibilityservice.AccessibilityService;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.BitmapFactory;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ImageView;
import android.widget.TextView;
import com.getcapacitor.JSObject;

public class ProtectionService extends AccessibilityService {
    private static volatile java.lang.ref.WeakReference<ProtectionService> current = new java.lang.ref.WeakReference<>(null);
    private final String token = java.util.UUID.randomUUID().toString();
    private final ProtectionPolicy policy = new ProtectionPolicy("com.ghostauth.app");
    private final Handler main = new Handler(Looper.getMainLooper());
    private LinearLayout shield;
    private String lastPackage;
    private String shieldPackage;
    private long lastEventTime;
    private volatile String failure;
    private SharedPreferences.OnSharedPreferenceChangeListener changes;
    private boolean receiverRegistered;

    private final BroadcastReceiver screen = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            policy.clear(); removeShield();
            if (Intent.ACTION_USER_PRESENT.equals(intent.getAction()) && lastPackage != null) observe(lastPackage);
            GhostDevicePlugin.protectionChanged();
        }
    };

    static JSObject status(Context context) {
        ProtectionService service = current.get();
        boolean enabled = ProtectionPreferences.enabled(context);
        JSObject result = new JSObject().put("configured", ProtectionPreferences.store(context).contains("packages"))
            .put("enabled", enabled).put("connected", service != null && service.failure == null);
        com.getcapacitor.JSArray packages = new com.getcapacitor.JSArray();
        for (String pkg : ProtectionPreferences.packages(context)) packages.put(pkg);
        result.put("packages", packages);
        String pending = service == null ? null : service.policy.pending();
        if (enabled && pending != null) result.put("pending", new JSObject().put("packageName", pending).put("id", service.token + ":" + service.policy.request()));
        if (service != null && service.failure != null) result.put("error", service.failure);
        return result;
    }

    static boolean approveLaunch(String target) {
        ProtectionService service = current.get();
        if (service == null || !ProtectionPreferences.enabled(service)) return true;
        if (!service.policy.approveLaunch(target, SystemClock.elapsedRealtime())) return false;
        service.removeShield();
        return true;
    }

    static void launchFailed() {
        ProtectionService service = current.get();
        if (service != null) { service.policy.clear(); service.removeShield(); }
    }

    static void ghostAuthVisible() {
        ProtectionService service = current.get();
        if (service != null) {
            service.lastPackage = service.getPackageName();
            service.policy.observe(service.getPackageName(), SystemClock.elapsedRealtime());
            service.removeShield();
            GhostDevicePlugin.protectionChanged();
        }
    }

    static void cancelRequest() {
        ProtectionService service = current.get();
        if (service != null) {
            if (service.shield == null) service.policy.clear();
            service.performGlobalAction(GLOBAL_ACTION_HOME);
            GhostDevicePlugin.protectionChanged();
        }
    }

    @Override protected void onServiceConnected() {
        current = new java.lang.ref.WeakReference<>(this);
        changes = (preferences, key) -> main.post(this::reloadSelection);
        ProtectionPreferences.store(this).registerOnSharedPreferenceChangeListener(changes);
        IntentFilter filter = new IntentFilter(Intent.ACTION_SCREEN_OFF);
        filter.addAction(Intent.ACTION_USER_PRESENT);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(screen, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(screen, filter);
        receiverRegistered = true;
        reloadSelection();
    }

    private void reloadSelection() {
        failure = null;
        policy.select(ProtectionPreferences.packages(this));
        removeShield();
        if (lastPackage != null) observe(lastPackage);
        GhostDevicePlugin.protectionChanged();
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED || event.getPackageName() == null
            || event.getEventTime() < lastEventTime) return;
        String pkg = event.getPackageName().toString();
        if (pkg.equals(getPackageName()) && !MainActivity.class.getName().contentEquals(event.getClassName() == null ? "" : event.getClassName())) return;
        ComponentName keyboard = ComponentName.unflattenFromString(Settings.Secure.getString(getContentResolver(), Settings.Secure.DEFAULT_INPUT_METHOD) == null
            ? "" : Settings.Secure.getString(getContentResolver(), Settings.Secure.DEFAULT_INPUT_METHOD));
        if (keyboard != null && pkg.equals(keyboard.getPackageName())) return;
        lastEventTime = event.getEventTime();
        lastPackage = pkg;
        observe(pkg);
    }

    private void observe(String pkg) {
        if (!ProtectionPreferences.enabled(this) || failure != null) { policy.clear(); removeShield(); return; }
        String previous = policy.pending();
        boolean blocked = policy.observe(pkg, SystemClock.elapsedRealtime());
        if (!blocked) { removeShield(); if (previous != null && policy.pending() == null) GhostDevicePlugin.protectionChanged(); return; }
        if (AppLauncher.resolve(this, pkg) == null) { policy.clear(); removeShield(); return; }
        showShield(pkg);
        GhostDevicePlugin.protectionChanged();
        if (!pkg.equals(previous)) openVerification();
    }

    private void openVerification() {
        try {
            startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP));
        } catch (RuntimeException unavailable) {
        }
    }

    private void showShield(String pkg) {
        if (shield != null && pkg.equals(shieldPackage)) return;
        removeShield();
        LinearLayout view = new LinearLayout(this) {
            @Override public boolean dispatchKeyEvent(KeyEvent event) {
                if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
                    if (event.getAction() == KeyEvent.ACTION_UP) cancelRequest();
                    return true;
                }
                return super.dispatchKeyEvent(event);
            }
        };
        view.setFocusableInTouchMode(true);
        boolean dark = AppearancePreferences.dark(this);
        int paper = dark ? Color.rgb(22, 24, 30) : Color.rgb(245, 244, 240);
        int ink = dark ? Color.rgb(240, 241, 245) : Color.rgb(25, 25, 25);
        view.setOrientation(LinearLayout.VERTICAL); view.setGravity(Gravity.CENTER);
        view.setPadding(32, 32, 32, 32); view.setBackgroundColor(paper);
        try (java.io.InputStream asset = getAssets().open("public/assets/ghostauth-logo.png")) {
            ImageView logo = new ImageView(this); logo.setImageBitmap(BitmapFactory.decodeStream(asset));
            if (dark) logo.setColorFilter(new android.graphics.ColorMatrixColorFilter(new float[] {
                .574f, -1.430f, -.144f, 0, 255, -.426f, -.430f, -.144f, 0, 255,
                -.426f, -1.430f, .856f, 0, 255, -1.2f, 0, 0, 1.13f, 0 }));
            logo.setContentDescription(getString(R.string.app_name));
            int size = Math.round(160 * getResources().getDisplayMetrics().density);
            view.addView(logo, new LinearLayout.LayoutParams(size, size));
        } catch (java.io.IOException unavailable) {
            TextView title = new TextView(this); title.setText(R.string.app_name); title.setTextSize(28);
            title.setTextColor(ink); view.addView(title);
        }
        Button verify = new Button(this); verify.setText(R.string.protection_verify); verify.setOnClickListener(v -> openVerification()); view.addView(verify);
        Button close = new Button(this); close.setText(R.string.protection_close); close.setOnClickListener(v -> cancelRequest()); view.addView(close);
        verify.setTextColor(ink); close.setTextColor(ink);
        android.content.res.ColorStateList buttonColor = android.content.res.ColorStateList.valueOf(dark ? Color.rgb(57, 61, 72) : Color.rgb(216, 214, 207));
        verify.setBackgroundTintList(buttonColor); close.setBackgroundTintList(buttonColor);
        verify.setVisibility(android.view.View.GONE); close.setVisibility(android.view.View.GONE);
        main.postDelayed(() -> {
            if (shield == view) { verify.setVisibility(android.view.View.VISIBLE); close.setVisibility(android.view.View.VISIBLE); }
        }, 800);
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_SECURE, PixelFormat.OPAQUE);
        params.gravity = Gravity.TOP;
        params.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN;
        try { getSystemService(WindowManager.class).addView(view, params); shield = view; shieldPackage = pkg; }
        catch (RuntimeException unavailable) {
            failure = "Android could not show the protection screen. Re-enable the accessibility service.";
            policy.clear(); performGlobalAction(GLOBAL_ACTION_HOME);
        }
    }

    private void removeShield() {
        if (shield == null) return;
        try { getSystemService(WindowManager.class).removeViewImmediate(shield); } catch (RuntimeException ignored) { }
        shield = null; shieldPackage = null;
    }

    @Override public void onInterrupt() {
        failure = "Protection was interrupted. Re-enable the accessibility service.";
        policy.clear(); removeShield(); GhostDevicePlugin.protectionChanged();
    }

    @Override public void onDestroy() {
        if (current.get() == this) current.clear();
        main.removeCallbacksAndMessages(null);
        if (changes != null) ProtectionPreferences.store(this).unregisterOnSharedPreferenceChangeListener(changes);
        if (receiverRegistered) unregisterReceiver(screen);
        policy.clear(); removeShield(); GhostDevicePlugin.protectionChanged();
        super.onDestroy();
    }
}
