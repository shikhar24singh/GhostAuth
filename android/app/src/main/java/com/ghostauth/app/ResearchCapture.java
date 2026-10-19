package com.ghostauth.app;

import android.app.Activity;
import android.content.Context;
import android.content.BroadcastReceiver;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Handler;
import android.os.Build;
import android.os.Looper;
import android.os.SystemClock;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;
import org.json.JSONArray;
import org.json.JSONObject;

/** Main-thread sensor ownership; independent I/O never waits on the authentication executor. */
final class ResearchCapture implements SensorEventListener {
    private static volatile ResearchCapture current;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final AtomicLong revision = new AtomicLong();
    private final ResearchStore store;
    private final SensorManager sensors;
    private final Sensor accelerometer, gyroscope;
    private volatile boolean enabled, movementAllowed, ready, fault;
    private volatile String error;
    private boolean resumed, focused;
    private volatile Pending pending;
    private final Runnable timeout = () -> stop("window_limit");
    private static final class Pending {
        final String callback, id = UUID.randomUUID().toString(), pkg, method;
        final long revision, started = SystemClock.elapsedRealtimeNanos(), occurredAt = System.currentTimeMillis();
        final MotionWindow acceleration = new MotionWindow(), rotation = new MotionWindow();
        volatile boolean listening;
        boolean accelRegistered, gyroRegistered;
        String stopReason = "too_short";
        Pending(String callback, String pkg, String method, long revision) {
            this.callback = callback; this.pkg = pkg; this.method = method; this.revision = revision;
        }
    }
    private ResearchCapture(Context context) {
        store = new ResearchStore(context);
        sensors = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        accelerometer = sensors == null ? null : sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        gyroscope = sensors == null ? null : sensors.getDefaultSensor(Sensor.TYPE_GYROSCOPE);
        BroadcastReceiver screen = new BroadcastReceiver() {
            @Override public void onReceive(Context ignored, Intent intent) { lifecycle(false, false); }
        };
        if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(screen, new IntentFilter(Intent.ACTION_SCREEN_OFF), Context.RECEIVER_NOT_EXPORTED);
        else context.registerReceiver(screen, new IntentFilter(Intent.ACTION_SCREEN_OFF));
        io.execute(() -> {
            try { JSONObject value = store.read(); if (ResearchStore.prune(value, System.currentTimeMillis())) store.save(value); if (revision.get() == 0) publish(value); }
            catch (Exception unavailable) { fail(); }
        });
    }
    static void attach(Activity activity) {
        if (current == null) current = new ResearchCapture(activity.getApplicationContext());
    }
    static void lifecycle(boolean resumed, boolean focused) {
        ResearchCapture capture = current;
        if (capture == null) return;
        capture.resumed = resumed; capture.focused = focused;
        if (!resumed) { capture.finishPending("canceled"); }
        else if (!focused) capture.stop("focus_lost");
    }
    static void begin(PluginCall call, String method) {
        ResearchCapture capture = current;
        if (capture == null) return;
        String callback = call.getCallbackId(), pkg = call.getString("packageName");
        capture.main.post(() -> capture.start(callback, pkg, method));
    }
    static void finish(PluginCall call, String outcome) {
        ResearchCapture capture = current;
        if (capture == null) return;
        String callback = call.getCallbackId(), pkg = call.getString("packageName");
        capture.main.post(() -> {
            if (capture.pending != null && capture.pending.callback.equals(callback) && capture.pending.pkg.equals(pkg)) capture.finishPending(outcome);
        });
    }
    static void cancel() {
        ResearchCapture capture = current;
        if (capture != null) capture.main.post(() -> capture.finishPending("canceled"));
    }
    private void start(String callback, String pkg, String method) {
        finishPending("canceled");
        if (!ready || fault || !enabled || !resumed || pkg == null) return;
        pending = new Pending(callback, pkg, method, revision.get());
        if (!movementAllowed) { pending.stopReason = "movement_disabled"; return; }
        // PIN flows contribute only outcome diagnostics. Never measure credential-entry motion/timing.
        if (!"fingerprint".equals(method)) { pending.stopReason = "pin_flow"; return; }
        if (!focused) { pending.stopReason = "focus_lost"; return; }
        if (sensors == null || (accelerometer == null && gyroscope == null)) { pending.stopReason = "no_sensors"; return; }
        pending.listening = true;
        try {
            if (accelerometer != null) pending.accelRegistered = sensors.registerListener(this, accelerometer, 50_000, main);
            if (gyroscope != null) pending.gyroRegistered = sensors.registerListener(this, gyroscope, 50_000, main);
            if (!pending.accelRegistered && !pending.gyroRegistered) stop("sensor_unavailable");
            else main.postDelayed(timeout, 10_000);
        } catch (RuntimeException unavailable) { stop("sensor_unavailable"); }
    }
    private void stop(String reason) {
        main.removeCallbacks(timeout);
        if (pending == null) return;
        if (pending.listening && sensors != null) sensors.unregisterListener(this);
        pending.listening = false; pending.stopReason = reason;
    }
    @Override public void onSensorChanged(SensorEvent event) {
        Pending value = pending;
        if (value == null || !value.listening || !resumed || !focused || !enabled || !movementAllowed || fault) return;
        long now = SystemClock.elapsedRealtimeNanos();
        if (now - value.started > MotionWindow.MAX_NANOS) { stop("window_limit"); return; }
        if (event.timestamp < value.started || event.timestamp > now || event.values.length < 3) return;
        MotionWindow window = event.sensor.getType() == Sensor.TYPE_ACCELEROMETER ? value.acceleration : value.rotation;
        window.add(event.timestamp - value.started, event.values[0], event.values[1], event.values[2]);
    }
    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) {
        if (pending != null && accuracy == SensorManager.SENSOR_STATUS_UNRELIABLE) {
            if (sensor.getType() == Sensor.TYPE_ACCELEROMETER) pending.acceleration.invalid = true;
            else pending.rotation.invalid = true;
        }
    }
    private JSONObject summary(MotionWindow value, boolean verified, String units) throws Exception {
        JSONObject result = new JSONObject().put("count", value.count).put("durationMillis", value.durationMillis())
            .put("maxGapMillis", value.maxGap / 1_000_000L).put("rateHz", value.rate()).put("quality", value.reason()).put("units", units);
        if (verified && "eligible".equals(value.reason())) result.put("mean", value.mean).put("standardDeviation", value.deviation()).put("rms", value.rms());
        return result;
    }
    private void finishPending(String outcome) {
        Pending value = pending;
        if (value == null) return;
        String stopped = value.stopReason;
        stop(value.listening ? "verification_finished" : stopped); pending = null;
        if (fault || !enabled || value.revision != revision.get()) return;
        try {
            boolean verified = "verified".equals(outcome);
            boolean eligible = verified && ("eligible".equals(value.acceleration.reason()) || "eligible".equals(value.rotation.reason()));
            String reason = !verified ? "not_verified" : eligible ? "eligible"
                : !"too_short".equals(value.stopReason) && value.acceleration.count == 0 && value.rotation.count == 0 ? value.stopReason
                : "sensor_gap".equals(value.acceleration.reason()) || "sensor_gap".equals(value.rotation.reason()) ? "sensor_gap"
                : value.acceleration.invalid || value.rotation.invalid ? "invalid_samples" : "too_short";
            JSONObject entry = new JSONObject().put("version", 1).put("id", value.id).put("occurredAt", value.occurredAt)
                .put("build", "0.7.0").put("method", value.method).put("outcome", outcome).put("eligible", eligible)
                .put("reason", reason).put("stoppedBy", value.stopReason)
                .put("acceleration", summary(value.acceleration, verified, "m/s²"))
                .put("rotation", summary(value.rotation, verified, "rad/s"));
            io.execute(() -> {
                if (fault || value.revision != revision.get()) return;
                try {
                    JSONObject record = store.read();
                    if (!record.getBoolean("enabled")) return;
                    record.getJSONArray("entries").put(entry); store.save(record);
                    if (value.revision == revision.get()) publish(record);
                } catch (Exception unavailable) { fail(); }
                GhostResearchPlugin.changed();
            });
        } catch (Exception unavailable) { fail(); }
    }
    private void publish(JSONObject value) throws Exception {
        enabled = value.getBoolean("enabled"); movementAllowed = value.getBoolean("movementAllowed"); ready = true;
    }
    private void fail() {
        fault = true; enabled = false; ready = true;
        error = "Research storage is unavailable. Collection stopped. Clear research data or pause and re-enable collection to recover; credentials are kept.";
        main.post(() -> { stop("storage_unavailable"); pending = null; });
    }
    private JSObject snapshot(JSONObject value) throws Exception {
        Pending active = pending;
        JSONArray entries = value.getJSONArray("entries"); int eligible = 0;
        JSONObject reasons = new JSONObject();
        for (int i = 0; i < entries.length(); i++) {
            JSONObject entry = entries.getJSONObject(i);
            if (entry.getBoolean("eligible")) eligible++;
            String reason = entry.getString("reason"); reasons.put(reason, reasons.optInt(reason) + 1);
        }
        JSObject result = new JSObject().put("enabled", value.getBoolean("enabled")).put("movementAllowed", value.getBoolean("movementAllowed"))
            .put("collecting", !fault && enabled && movementAllowed && active != null && active.listening)
            .put("pausedForError", fault).put("total", entries.length()).put("eligible", eligible).put("rejected", entries.length() - eligible)
            .put("accelerometer", accelerometer != null).put("gyroscope", gyroscope != null).put("reasons", reasons);
        if (error != null) result.put("error", error);
        return result;
    }
    static void operation(PluginCall call, String action, Boolean enabled, Boolean movement) {
        ResearchCapture capture = current;
        if (capture == null) { call.reject("Research collection is unavailable.", "RESEARCH_UNAVAILABLE"); return; }
        capture.main.post(() -> {
            // Invalidate before queuing I/O: older buffers and queued records cannot survive settings/clear.
            if (!"snapshot".equals(action)) {
                capture.revision.incrementAndGet(); capture.stop("settings_changed"); capture.pending = null;
                capture.enabled = false;
            }
            long operationRevision = capture.revision.get();
            capture.io.execute(() -> {
                try {
                    JSONObject record;
                    try { record = capture.store.read(); }
                    catch (Exception unavailable) { if (!"clear".equals(action)) throw unavailable; record = ResearchStore.empty(); }
                    boolean changed = ResearchStore.prune(record, System.currentTimeMillis());
                    if ("clear".equals(action)) { record.put("entries", new JSONArray()); changed = true; }
                    if (enabled != null) { record.put("enabled", enabled); changed = true; }
                    if (movement != null && (!"snapshot".equals(action) || !record.getBoolean("movementConfigured"))) {
                        record.put("movementConfigured", true).put("movementAllowed", movement); changed = true;
                    }
                    if (changed) capture.store.save(record);
                    if (operationRevision == capture.revision.get()) {
                        if (!"snapshot".equals(action)) { capture.fault = false; capture.error = null; }
                        capture.publish(record);
                    }
                    call.resolve(capture.snapshot(record));
                } catch (Exception unavailable) {
                    capture.fail(); call.reject("Could not save research settings. Collection stopped; your credentials are kept.", "RESEARCH_UNAVAILABLE");
                }
                if (!"snapshot".equals(action)) GhostResearchPlugin.changed();
            });
        });
    }
}
