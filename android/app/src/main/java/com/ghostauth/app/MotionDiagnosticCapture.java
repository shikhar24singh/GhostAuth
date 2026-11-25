package com.ghostauth.app;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import java.util.Locale;
import java.util.UUID;
import org.json.JSONObject;

final class MotionDiagnosticCapture implements SensorEventListener {
    private final Context context;
    private final ResearchCapture research;
    private final SensorManager manager;
    private final Sensor accelerometer, gyroscope;
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean resumed, focused, registered;
    private String lease;
    private long nextId;
    private MotionDiagnosticSession session;
    private final Runnable deadline = () -> stop("completed");

    MotionDiagnosticCapture(Context context, ResearchCapture research) {
        this.context = context; this.research = research;
        manager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        accelerometer = manager == null ? null : manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        gyroscope = manager == null ? null : manager.getDefaultSensor(Sensor.TYPE_GYROSCOPE);
    }
    void lifecycle(boolean resumed, boolean focused) {
        boolean changed = this.resumed != resumed || this.focused != focused;
        this.resumed = resumed; this.focused = focused;
        if (!resumed) stop("backgrounded");
        else if (!focused) stop("focus_lost");
        if (changed) GhostResearchPlugin.diagnosticChanged();
    }
    void stop(String reason) {
        main.removeCallbacks(deadline);
        if (registered && manager != null) manager.unregisterListener(this);
        registered = false;
        if (session != null && session.running()) {
            session.stop(reason); GhostResearchPlugin.diagnosticChanged();
        }
    }
    void clear() { stop("cleared"); session = null; GhostResearchPlugin.diagnosticChanged(); }
    private String blocked() {
        if (session != null && session.running()) return "running";
        String consent = research.diagnosticBlock();
        if (consent != null) return consent;
        if (!resumed || !focused) return "not_foreground";
        return null;
    }
    private NativePayload sensor(MotionWindow window, String units) {
        return new NativePayload().put("samples", window.count).put("durationMillis", window.durationMillis())
            .put("rateHz", window.count < 2 ? JSONObject.NULL : window.rate())
            .put("maxGapMillis", window.count < 2 ? JSONObject.NULL : window.maxGap / 1_000_000L)
            .put("quality", window.reason()).put("units", units);
    }
    private NativePayload snapshot() {
        String blocked = blocked();
        NativePayload value = new NativePayload().put("canStart", blocked == null).put("blockedReason", blocked == null ? JSONObject.NULL : blocked)
            .put("accelerometer", accelerometer != null).put("gyroscope", gyroscope != null).put("windowMillis", 5000);
        if (session == null) return value.put("state", "idle").put("run", JSONObject.NULL);
        return value.put("state", session.running() ? "running" : "completed".equals(session.reason()) ? "complete" : "stopped")
            .put("run", new NativePayload().put("id", session.id).put("remainingMillis", session.remainingMillis(SystemClock.elapsedRealtimeNanos()))
                .put("reason", session.reason() == null ? JSONObject.NULL : session.reason())
                .put("acceleration", sensor(session.acceleration, "m/s²")).put("rotation", sensor(session.rotation, "rad/s")));
    }
    private void start() {
        session = new MotionDiagnosticSession(++nextId, SystemClock.elapsedRealtimeNanos());
        if (manager == null || (accelerometer == null && gyroscope == null)) { stop("no_sensors"); return; }
        try {
            registered = true;
            boolean acceleration = accelerometer != null && manager.registerListener(this, accelerometer, 50_000, main);
            boolean rotation = gyroscope != null && manager.registerListener(this, gyroscope, 50_000, main);
            if (!acceleration && !rotation) stop("sensor_unavailable");
            else main.postDelayed(deadline, 5000);
        } catch (RuntimeException unavailable) { stop("sensor_unavailable"); }
        GhostResearchPlugin.diagnosticChanged();
    }
    @Override public void onSensorChanged(SensorEvent event) {
        if (session == null || !session.running()) return;
        if (!resumed || !focused || research.diagnosticBlock() != null) { stop("settings_changed"); return; }
        if (event.values.length < 3) return;
        boolean accepted = session.add(event.sensor.getType() == Sensor.TYPE_ACCELEROMETER, event.timestamp,
            SystemClock.elapsedRealtimeNanos(), event.values[0], event.values[1], event.values[2]);
        if (!accepted && !session.running()) stopAfterDeadline();
    }
    private void stopAfterDeadline() {
        main.removeCallbacks(deadline);
        if (registered && manager != null) manager.unregisterListener(this);
        registered = false; GhostResearchPlugin.diagnosticChanged();
    }
    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) {
        if (session == null || !session.running() || accuracy != SensorManager.SENSOR_STATUS_UNRELIABLE) return;
        (sensor.getType() == Sensor.TYPE_ACCELEROMETER ? session.acceleration : session.rotation).invalid = true;
    }
    private String report() {
        return "GhostAuth " + BuildConfig.VERSION_NAME + " - motion diagnostic only\n"
            + "State: " + session.reason() + "\nRequested rate: 20 Hz; test limit: 5 s\n"
            + reportSensor("Accelerometer", session.acceleration) + reportSensor("Gyroscope", session.rotation)
            + "Temporary delivery diagnostics only. No identity verification, training sample or threat decision.";
    }
    private String reportSensor(String name, MotionWindow window) {
        return String.format(Locale.ROOT, "%s: %d samples; %.3f s; rate %s; largest gap %s; quality %s\n", name,
            window.count, window.durationMillis() / 1000.0, window.count < 2 ? "unavailable" : String.format(Locale.ROOT, "%.2f Hz", window.rate()),
            window.count < 2 ? "unavailable" : (window.maxGap / 1_000_000L) + " ms", window.reason());
    }
    void operation(NativeCall call, String action) {
        main.post(() -> {
            try {
                if ("open".equals(action)) {
                    stop("screen_left"); lease = UUID.randomUUID().toString();
                    call.resolve(new NativePayload().put("lease", lease).put("status", snapshot())); return;
                }
                if (lease == null || !lease.equals(call.getString("lease"))) {
                    if ("close".equals(action)) call.resolve();
                    else call.reject("Reopen the motion diagnostic screen.", "DIAGNOSTIC_CLOSED");
                    return;
                }
                if ("close".equals(action)) { stop("screen_left"); lease = null; call.resolve(); return; }
                if ("start".equals(action)) {
                    if (!Boolean.TRUE.equals(call.getBoolean("consent"))) { call.reject("Agree to this diagnostic before starting.", "DIAGNOSTIC_CONSENT"); return; }
                    if (blocked() != null) { call.reject("Enable motion research and Movement signals, and keep this screen visible before starting.", "DIAGNOSTIC_BLOCKED"); return; }
                    start();
                } else if ("stop".equals(action)) stop("stopped_by_user");
                else if ("clear".equals(action)) clear();
                else if ("copy".equals(action)) {
                    Long id = call.getLong("runId");
                    if (!resumed || !focused || session == null || session.running() || id == null || id != session.id)
                        throw new IllegalStateException("Diagnostic result changed");
                    ClipboardManager clipboard = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
                    if (clipboard == null) throw new IllegalStateException("Clipboard unavailable");
                    clipboard.setPrimaryClip(ClipData.newPlainText("GhostAuth motion diagnostic", report()));
                    call.resolve(new NativePayload().put("copied", true)); return;
                }
                call.resolve(snapshot());
            } catch (RuntimeException unavailable) {
                stop("unavailable"); call.reject("Diagnostic unavailable. Refresh or start a new test; verification is unchanged.", "DIAGNOSTIC_UNAVAILABLE");
            }
        });
    }
}
