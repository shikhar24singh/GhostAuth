package com.ghostauth.app;


public class GhostResearchPlugin extends NativeHandler {
    GhostResearchPlugin(MainActivity activity, GhostChannels channels) { super(activity, channels); }

    private static volatile GhostResearchPlugin current;
    @Override public void load() { current = this; }
    static void changed() { GhostResearchPlugin plugin = current; if (plugin != null) plugin.notifyListeners("researchChanged", new NativePayload()); }
    static void diagnosticChanged() { GhostResearchPlugin plugin = current; if (plugin != null) plugin.notifyListeners("diagnosticChanged", new NativePayload()); }
    public void openDiagnostic(NativeCall call) { ResearchCapture.diagnosticOperation(call, "open"); }
    public void closeDiagnostic(NativeCall call) { ResearchCapture.diagnosticOperation(call, "close"); }
    public void getDiagnostic(NativeCall call) { ResearchCapture.diagnosticOperation(call, "snapshot"); }
    public void startDiagnostic(NativeCall call) { ResearchCapture.diagnosticOperation(call, "start"); }
    public void stopDiagnostic(NativeCall call) { ResearchCapture.diagnosticOperation(call, "stop"); }
    public void clearDiagnostic(NativeCall call) { ResearchCapture.diagnosticOperation(call, "clear"); }
    public void copyDiagnostic(NativeCall call) { ResearchCapture.diagnosticOperation(call, "copy"); }
    public void getSnapshot(NativeCall call) { ResearchCapture.operation(call, "snapshot", null, call.getBoolean("initialMovement")); }
    public void configure(NativeCall call) {
        Boolean enabled = call.getBoolean("enabled"), movement = call.getBoolean("movementAllowed");
        if (enabled == null && movement == null) { call.reject("Choose a research setting.", "INVALID_RESEARCH_SETTING"); return; }
        ResearchCapture.operation(call, "configure", enabled, movement);
    }
    public void clearData(NativeCall call) { ResearchCapture.operation(call, "clear", null, null); }
    @Override protected void handleOnDestroy() { if (current == this) current = null; ResearchCapture.cancel(); }
}
