package com.ghostauth.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ResolveInfo;

final class AppLauncher {
    static boolean protectable(Context context, String pkg) {
        Intent settings = new Intent(android.provider.Settings.ACTION_SETTINGS);
        ResolveInfo settingsApp = context.getPackageManager().resolveActivity(settings, 0);
        if (settingsApp != null && settingsApp.activityInfo != null && pkg.equals(settingsApp.activityInfo.packageName)) return false;
        if (pkg.equals("com.android.settings") || pkg.equals("com.android.systemui") || pkg.equals(context.getPackageName())) return false;
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        for (ResolveInfo entry : context.getPackageManager().queryIntentActivities(home, 0)) {
            if (entry.activityInfo != null && pkg.equals(entry.activityInfo.packageName)) return false;
        }
        String keyboard = android.provider.Settings.Secure.getString(context.getContentResolver(), android.provider.Settings.Secure.DEFAULT_INPUT_METHOD);
        ComponentName input = keyboard == null ? null : ComponentName.unflattenFromString(keyboard);
        return input == null || !pkg.equals(input.getPackageName());
    }
    static Intent resolve(Context context, String packageName) {
        if (packageName == null || packageName.length() > 255
            || !packageName.matches("[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+")
            || packageName.equals(context.getPackageName())) return null;
        Intent query = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setPackage(packageName);
        for (ResolveInfo entry : context.getPackageManager().queryIntentActivities(query, 0)) {
            if (entry.activityInfo == null || !entry.activityInfo.enabled
                || !entry.activityInfo.applicationInfo.enabled || !entry.activityInfo.exported
                || !packageName.equals(entry.activityInfo.packageName)) continue;
            return new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
                .setComponent(new ComponentName(packageName, entry.activityInfo.name))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        }
        return null;
    }
}
