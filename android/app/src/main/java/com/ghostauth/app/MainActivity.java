package com.ghostauth.app;

import android.content.Intent;
import android.os.Bundle;
import android.view.WindowManager;
import io.flutter.embedding.android.FlutterFragmentActivity;
import io.flutter.embedding.engine.FlutterEngine;

public class MainActivity extends FlutterFragmentActivity {
    private GhostChannels channels;
    private boolean visible;

    @Override public void onCreate(Bundle savedInstanceState) {
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        AppearancePreferences.applyMode(this);
        super.onCreate(savedInstanceState);
        ResearchCapture.attach(this);
        AppearancePreferences.applyWindow(this);
    }

    @Override public void configureFlutterEngine(FlutterEngine engine) {
        super.configureFlutterEngine(engine);
        channels = new GhostChannels(this, engine.getDartExecutor().getBinaryMessenger());
    }

    @Override public void cleanUpFlutterEngine(FlutterEngine engine) {
        if (channels != null) { channels.close(); channels = null; }
        super.cleanUpFlutterEngine(engine);
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (visible) ProtectionService.ghostAuthVisible();
        GhostDevicePlugin.protectionChanged();
    }

    @Override public void onResume() {
        super.onResume();
        visible = true;
        ResearchCapture.lifecycle(true, hasWindowFocus());
        ProtectionService.ghostAuthVisible();
        if (channels != null) channels.resume();
    }

    @Override public void onPause() {
        visible = false;
        ResearchCapture.lifecycle(false, false);
        super.onPause();
    }

    @Override public void onStop() {
        if (channels != null) channels.stop();
        super.onStop();
    }

    @Override public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        ResearchCapture.lifecycle(visible, focused);
    }
}
