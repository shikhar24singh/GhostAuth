package com.ghostauth.app;

import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "GhostAppearance")
public class GhostAppearancePlugin extends Plugin {
    @PluginMethod public void getTheme(PluginCall call) {
        call.resolve(new JSObject().put("dark", AppearancePreferences.dark(getContext())));
    }
    @PluginMethod public void setTheme(PluginCall call) {
        Boolean dark = call.getBoolean("dark");
        if (dark == null) { call.reject("Choose light or dark appearance.", "INVALID_APPEARANCE"); return; }
        getActivity().runOnUiThread(() -> {
            SharedPreferences preferences = AppearancePreferences.store(getContext());
            boolean previous = AppearancePreferences.dark(getContext());
            if (!preferences.edit().putBoolean("dark", dark).commit()) {
                preferences.edit().putBoolean("dark", previous).apply();
                call.reject("Could not save appearance.", "APPEARANCE_UNAVAILABLE"); return;
            }
            AppearancePreferences.applyMode(getActivity()); AppearancePreferences.applyWindow(getActivity());
            getBridge().getWebView().setBackgroundColor(dark ? android.graphics.Color.rgb(22, 24, 30) : android.graphics.Color.rgb(245, 244, 240));
            call.resolve(new JSObject().put("dark", dark));
        });
    }
}
