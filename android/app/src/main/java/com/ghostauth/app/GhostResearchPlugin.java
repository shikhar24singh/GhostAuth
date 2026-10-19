package com.ghostauth.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "GhostResearch")
public class GhostResearchPlugin extends Plugin {
    private static volatile GhostResearchPlugin current;
    @Override public void load() { current = this; }
    static void changed() { GhostResearchPlugin plugin = current; if (plugin != null) plugin.notifyListeners("researchChanged", new JSObject()); }
    @PluginMethod public void getSnapshot(PluginCall call) { ResearchCapture.operation(call, "snapshot", null, call.getBoolean("initialMovement")); }
    @PluginMethod public void configure(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled"), movement = call.getBoolean("movementAllowed");
        if (enabled == null && movement == null) { call.reject("Choose a research setting.", "INVALID_RESEARCH_SETTING"); return; }
        ResearchCapture.operation(call, "configure", enabled, movement);
    }
    @PluginMethod public void clearData(PluginCall call) { ResearchCapture.operation(call, "clear", null, null); }
    @Override protected void handleOnDestroy() { if (current == this) current = null; ResearchCapture.cancel(); }
}
