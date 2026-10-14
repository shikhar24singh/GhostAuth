package com.ghostauth.app;

import android.app.AppOpsManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ApplicationInfo;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Build;
import android.os.Process;
import android.provider.Settings;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.io.ByteArrayOutputStream;

/** Device integration only: does not read usage history or enforce app protection. */
@CapacitorPlugin(name = "GhostDevice")
public class GhostDevicePlugin extends Plugin {
    private static volatile GhostDevicePlugin current;
    @Override public void load() { current = this; }
    @Override protected void handleOnDestroy() { if (current == this) current = null; }
    static void protectionChanged() {
        GhostDevicePlugin plugin = current;
        if (plugin != null) plugin.notifyListeners("protectionChanged", new JSObject());
    }

    @PluginMethod
    public void getSnapshot(PluginCall call) {
        try {
            PackageManager manager = getContext().getPackageManager();
            Intent launcher = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> activities = manager.queryIntentActivities(launcher, 0);
            Set<String> seen = new HashSet<>();
            List<JSObject> apps = new ArrayList<>();
            for (ResolveInfo entry : activities) {
                if (entry.activityInfo == null || !entry.activityInfo.enabled
                    || !entry.activityInfo.applicationInfo.enabled || !entry.activityInfo.exported) continue;
                String id = entry.activityInfo.packageName;
                if (id.equals(getContext().getPackageName()) || !seen.add(id)) continue;
                CharSequence label = manager.getApplicationLabel(entry.activityInfo.applicationInfo);
                JSObject app = new JSObject();
                app.put("id", id);
                app.put("name", label == null || label.toString().trim().isEmpty() ? id : label.toString());
                String icon = applicationIcon(manager, entry.activityInfo.applicationInfo);
                if (icon != null) app.put("icon", icon);
                apps.add(app);
            }
            apps.sort(Comparator.comparing(app -> app.getString("name", ""), String.CASE_INSENSITIVE_ORDER));
            JSArray catalog = new JSArray();
            for (JSObject app : apps) catalog.put(app);
            Set<String> protectedPackages = ProtectionPreferences.packages(getContext());
            if (protectedPackages.retainAll(seen)) {
                if (!ProtectionPreferences.store(getContext()).edit().putStringSet("packages", protectedPackages).commit())
                    throw new IllegalStateException("Selection unavailable");
            }
            NotificationManager notifications = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            JSObject permissions = new JSObject();
            permissions.put("usage", usageGranted());
            permissions.put("notifications", notifications != null && notifications.areNotificationsEnabled());
            JSObject protection = ProtectionService.status(getContext());
            permissions.put("service", protection.getBoolean("enabled", false) && protection.getBoolean("connected", false));
            JSObject result = new JSObject();
            result.put("apps", catalog);
            result.put("permissions", permissions);
            result.put("protection", protection);
            call.resolve(result);
        } catch (RuntimeException ignored) {
            call.reject("Device status is unavailable.", "DEVICE_UNAVAILABLE");
        }
    }

    private String applicationIcon(PackageManager manager, ApplicationInfo info) {
        Bitmap bitmap = null;
        try {
            // Draw the actual Android drawable, including adaptive/vector icons,
            // into a bounded PNG suitable for the offline WebView interface.
            Drawable drawable = manager.getApplicationIcon(info).mutate();
            bitmap = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888);
            drawable.setBounds(0, 0, 96, 96);
            drawable.draw(new Canvas(bitmap));
            ByteArrayOutputStream png = new ByteArrayOutputStream();
            if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, png)) return null;
            return "data:image/png;base64," + Base64.encodeToString(png.toByteArray(), Base64.NO_WRAP);
        } catch (RuntimeException unavailable) {
            // One unavailable icon must not hide the app or fail the catalog.
            return null;
        } finally {
            if (bitmap != null) bitmap.recycle();
        }
    }

    private boolean usageGranted() {
        AppOpsManager ops = (AppOpsManager) getContext().getSystemService(Context.APP_OPS_SERVICE);
        if (ops == null) return false;
        int mode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), getContext().getPackageName())
            : ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), getContext().getPackageName());
        if (mode == AppOpsManager.MODE_DEFAULT) {
            return getContext().checkCallingOrSelfPermission("android.permission.PACKAGE_USAGE_STATS") == PackageManager.PERMISSION_GRANTED;
        }
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        String permission = call.getString("permission", "");
        if (!permission.equals("usage") && !permission.equals("notifications") && !permission.equals("service")) {
            call.reject("This permission has no implemented settings flow.", "UNSUPPORTED_PERMISSION");
            return;
        }
        getActivity().runOnUiThread(() -> {
            Intent target;
            if (permission.equals("service")) {
                target = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            } else if (permission.equals("usage")) {
                target = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS,
                    Uri.parse("package:" + getContext().getPackageName()));
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                target = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            } else {
                target = appDetails();
            }
            try {
                getActivity().startActivity(target);
                call.resolve();
            } catch (RuntimeException ignored) {
                try {
                    // Some OEMs don't implement the package-specific settings activity.
                    Intent fallback = permission.equals("service") ? new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                        : permission.equals("usage") ? new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS) : appDetails();
                    getActivity().startActivity(fallback);
                    call.resolve();
                } catch (RuntimeException unavailable) {
                    call.reject("Android settings could not be opened.", "SETTINGS_UNAVAILABLE");
                }
            }
        });
    }

    private Intent appDetails() {
        return new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:" + getContext().getPackageName()));
    }

    @PluginMethod
    public void configureProtection(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        if (Boolean.FALSE.equals(enabled)) {
            if (ProtectionPreferences.store(getContext()).edit().putBoolean("consent", false).commit()) call.resolve();
            else call.reject("Could not disable protection.", "PROTECTION_UNAVAILABLE");
            return;
        }
        JSArray values = call.getArray("packages");
        if (values == null || values.length() > 2_000) { call.reject("Invalid app selection.", "INVALID_SELECTION"); return; }
        Set<String> selected = new HashSet<>();
        try {
            for (int i = 0; i < values.length(); i++) {
                Object value = values.get(i);
                if (!(value instanceof String)) throw new IllegalArgumentException();
                String pkg = (String) value;
                if (AppLauncher.resolve(getContext(), pkg) == null) throw new IllegalArgumentException();
                if (!AppLauncher.protectable(getContext(), pkg)) {
                    call.reject("Android Settings, the launcher and keyboard must remain available.", "UNSAFE_APP"); return;
                }
                selected.add(pkg);
            }
            if (Boolean.TRUE.equals(enabled) && !new CredentialVault(getContext()).read().has("verifier")) {
                call.reject("Set up your PIN before enabling protection.", "PIN_REQUIRED"); return;
            }
            android.content.SharedPreferences.Editor editor = ProtectionPreferences.store(getContext()).edit().putStringSet("packages", selected);
            if (enabled != null) editor.putBoolean("consent", enabled);
            if (!editor.commit()) throw new IllegalStateException();
            call.resolve();
        } catch (Exception unavailable) {
            call.reject("Could not save protection settings. Refresh the app list and try again.", "PROTECTION_UNAVAILABLE");
        }
    }

    @PluginMethod
    public void cancelProtection(PluginCall call) {
        getActivity().runOnUiThread(() -> { ProtectionService.cancelRequest(); call.resolve(); });
    }
}
