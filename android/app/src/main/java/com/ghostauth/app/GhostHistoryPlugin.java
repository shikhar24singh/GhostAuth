package com.ghostauth.app;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class GhostHistoryPlugin extends NativeHandler {
    GhostHistoryPlugin(MainActivity activity, GhostChannels channels) { super(activity, channels); }

    private static volatile GhostHistoryPlugin current;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    @Override public void load() { current = this; }
    static void changed() { GhostHistoryPlugin plugin = current; if (plugin != null) plugin.notifyListeners("historyChanged", new NativePayload()); }
    private interface Work { NativePayload run() throws Exception; }
    private void execute(NativeCall call, Work work) {
        worker.execute(() -> {
            try { call.resolve(work.run()); }
            catch (Exception unavailable) { call.reject("Security history is unavailable. Your PIN and fingerprint were kept.", "HISTORY_UNAVAILABLE"); }
        });
    }
    public void getSnapshot(NativeCall call) { execute(call, () -> HistoryStore.snapshot(getContext(), call.getBoolean("initialEnabled"))); }
    public void configureRecording(NativeCall call) {
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null) { call.reject("Choose whether to record security history.", "INVALID_HISTORY_SETTING"); return; }
        execute(call, () -> HistoryStore.configure(getContext(), enabled));
    }
    public void clearHistory(NativeCall call) { execute(call, () -> HistoryStore.clear(getContext())); }
    @Override protected void handleOnDestroy() { if (current == this) current = null; worker.shutdown(); }
}
