package com.ghostauth.app;

import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.File;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

final class LegacyPreferences {
    private final MainActivity activity;
    private final SharedPreferences store;
    private final List<NativeCall> reads = new ArrayList<>();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable timeout = () -> fail("Could not read saved app preferences. Try again.");
    private WebView reader;

    LegacyPreferences(MainActivity activity) {
        this.activity = activity;
        store = activity.getSharedPreferences("ghostauth_flutter_preferences", 0);
    }

    private NativePayload snapshot() {
        return new NativePayload().put("behavior", store.getBoolean("behavior", true))
            .put("movement", store.getBoolean("initialMovement", true)).put("history", store.getBoolean("initialHistory", true));
    }

    void read(NativeCall call) {
        if (store.getBoolean("imported", false)) { call.resolve(snapshot()); return; }
        reads.add(call);
        if (reader != null) return;
        if (!new File(activity.getDataDir(), "app_webview").isDirectory()) { save(null, false); return; }
        try {
            reader = new WebView(activity);
            reader.getSettings().setBlockNetworkLoads(true);
            reader.getSettings().setAllowFileAccess(false);
            reader.getSettings().setAllowContentAccess(false);
            reader.getSettings().setDomStorageEnabled(true);
            reader.getSettings().setJavaScriptEnabled(true);
            reader.setWebViewClient(new WebViewClient() {
                @Override public void onPageFinished(WebView view, String url) {
                    if (reader != view) return;
                    view.evaluateJavascript("JSON.stringify([localStorage.getItem('ghostauth.android.preferences.v1'),"
                        + "localStorage.getItem('ghostnet.preferences.v1')])", encoded -> imported(view, encoded));
                }
            });
            handler.postDelayed(timeout, 5000);
            reader.loadDataWithBaseURL("https://localhost/", "<!doctype html><title>GhostAuth</title>", "text/html", "UTF-8", null);
        } catch (RuntimeException error) {
            fail("Could not read saved app preferences. Try again.");
        }
    }

    private void imported(WebView view, String encoded) {
        if (reader != view) return;
        try {
            Object raw = new JSONTokener(encoded).nextValue();
            if (!(raw instanceof String)) { fail("Could not read saved app preferences. Try again."); return; }
            JSONArray values = new JSONArray((String) raw);
            boolean android = !values.isNull(0);
            JSONObject old = parse(android ? values.opt(0) : values.opt(1));
            save(old, android);
        } catch (Exception invalid) {
            fail("Could not read saved app preferences. Try again.");
        }
    }

    private JSONObject parse(Object value) {
        if (!(value instanceof String)) return null;
        try {
            JSONObject old = new JSONObject((String) value);
            JSONObject privacy = old.optJSONObject("privacy");
            JSONArray selected = old.optJSONArray("selected");
            if (old.optInt("version") != 1 || privacy == null || selected == null
                || !(privacy.opt("behavior") instanceof Boolean) || !(privacy.opt("movement") instanceof Boolean)
                || !(privacy.opt("history") instanceof Boolean)) return null;
            for (int i = 0; i < selected.length(); i++) if (!(selected.opt(i) instanceof String)) return null;
            return old;
        } catch (Exception malformed) { return null; }
    }

    private void save(JSONObject old, boolean android) {
        JSONObject privacy = old == null ? null : old.optJSONObject("privacy");
        SharedPreferences protection = ProtectionPreferences.store(activity);
        if (android && old != null && !protection.contains("packages")) {
            JSONArray selected = old.optJSONArray("selected");
            Set<String> packages = new HashSet<>();
            for (int i = 0; i < selected.length() && i < 2000; i++) {
                String pkg = selected.optString(i);
                if (AppLauncher.resolve(activity, pkg) != null && AppLauncher.protectable(activity, pkg)) packages.add(pkg);
            }
            if (!protection.edit().putStringSet("packages", packages).commit()) {
                fail("Could not carry over your protected apps. Try again.");
                return;
            }
        }
        SharedPreferences.Editor write = store.edit().putBoolean("imported", true);
        if (privacy != null) {
            write.putBoolean("behavior", privacy.optBoolean("behavior", true))
                .putBoolean("initialMovement", privacy.optBoolean("movement", true))
                .putBoolean("initialHistory", privacy.optBoolean("history", true));
        }
        if (!write.commit()) { fail("Could not carry over saved app preferences. Try again."); return; }
        release();
        for (NativeCall call : reads) call.resolve(snapshot());
        reads.clear();
    }

    void setBehavior(NativeCall call) {
        Boolean behavior = call.getBoolean("behavior");
        if (behavior == null) { call.reject("Choose whether to enable Behavior signals.", "INVALID_PREFERENCES"); return; }
        if (!store.getBoolean("imported", false) || !store.edit().putBoolean("behavior", behavior).commit()) {
            call.reject("Could not save Behavior signals. Try again.", "PREFERENCES_UNAVAILABLE"); return;
        }
        call.resolve(snapshot());
    }

    private void fail(String message) {
        release();
        for (NativeCall call : reads) call.reject(message, "PREFERENCES_UNAVAILABLE");
        reads.clear();
    }

    private void release() {
        handler.removeCallbacks(timeout);
        if (reader != null) {
            WebView old = reader;
            reader = null;
            old.destroy();
        }
    }

    void close() { fail("GhostAuth closed."); }
}
