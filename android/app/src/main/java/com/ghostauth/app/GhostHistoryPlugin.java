package com.ghostauth.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "GhostHistory")
public class GhostHistoryPlugin extends Plugin {
    private static volatile GhostHistoryPlugin current;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    @Override public void load() { current = this; }
    static void changed() { GhostHistoryPlugin plugin = current; if (plugin != null) plugin.notifyListeners("historyChanged", new JSObject()); }
    private interface Work { JSObject run() throws Exception; }
    private void execute(PluginCall call, Work work) {
        worker.execute(() -> {
            try { call.resolve(work.run()); }
            catch (Exception unavailable) { call.reject("Security history is unavailable. Your PIN and fingerprint were kept.", "HISTORY_UNAVAILABLE"); }
        });
    }
    @PluginMethod public void getSnapshot(PluginCall call) { execute(call, () -> HistoryStore.snapshot(getContext(), call.getBoolean("initialEnabled"))); }
    @PluginMethod public void configureRecording(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null) { call.reject("Choose whether to record security history.", "INVALID_HISTORY_SETTING"); return; }
        execute(call, () -> HistoryStore.configure(getContext(), enabled));
    }
    @PluginMethod public void clearHistory(PluginCall call) { execute(call, () -> HistoryStore.clear(getContext())); }
    @Override protected void handleOnDestroy() { if (current == this) current = null; worker.shutdown(); }
}
