package com.ghostauth.app;

import android.content.SharedPreferences;

public class GhostAppearancePlugin extends NativeHandler {
    GhostAppearancePlugin(MainActivity activity, GhostChannels channels) { super(activity, channels); }

    public void getTheme(NativeCall call) {
        call.resolve(new NativePayload().put("dark", AppearancePreferences.dark(getContext())));
    }
    public void setTheme(NativeCall call) {
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
            call.resolve(new NativePayload().put("dark", dark));
        });
    }
}
