package com.ghostauth.app;

import android.app.Activity;
import android.app.UiModeManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.view.WindowCompat;

final class AppearancePreferences {
    static SharedPreferences store(Context context) { return context.getSharedPreferences("ghostauth_appearance", Context.MODE_PRIVATE); }
    static boolean dark(Context context) { return store(context).getBoolean("dark", false); }
    static void applyMode(Context context) {
        boolean dark = dark(context);
        if (Build.VERSION.SDK_INT >= 31) context.getSystemService(UiModeManager.class)
            .setApplicationNightMode(dark ? UiModeManager.MODE_NIGHT_YES : UiModeManager.MODE_NIGHT_NO);
        AppCompatDelegate.setDefaultNightMode(dark ? AppCompatDelegate.MODE_NIGHT_YES : AppCompatDelegate.MODE_NIGHT_NO);
    }
    static void applyWindow(Activity activity) {
        boolean dark = dark(activity);
        int paper = dark ? android.graphics.Color.rgb(22, 24, 30) : android.graphics.Color.rgb(245, 244, 240);
        activity.getWindow().getDecorView().setBackgroundColor(paper);
        androidx.core.view.WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(activity.getWindow(), activity.getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(!dark); bars.setAppearanceLightNavigationBars(!dark);
    }
}
