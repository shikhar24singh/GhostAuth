package com.ghostauth.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.content.Intent;
import android.view.WindowManager;

public class MainActivity extends BridgeActivity {
    private boolean visible;
    @Override
    public void onCreate(Bundle savedInstanceState) {
        AppearancePreferences.applyMode(this);
        ResearchCapture.attach(this);
        registerPlugin(GhostAuthPlugin.class);
        registerPlugin(GhostDevicePlugin.class);
        registerPlugin(GhostHistoryPlugin.class);
        registerPlugin(GhostAppearancePlugin.class);
        registerPlugin(GhostResearchPlugin.class);
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        AppearancePreferences.applyWindow(this);
        getBridge().getWebView().setBackgroundColor(AppearancePreferences.dark(this) ? android.graphics.Color.rgb(22, 24, 30) : android.graphics.Color.rgb(245, 244, 240));
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
    }
    @Override public void onPause() { visible = false; ResearchCapture.lifecycle(false, false); super.onPause(); }
    @Override public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        ResearchCapture.lifecycle(visible, focused);
    }
}
