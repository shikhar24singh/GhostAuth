package com.ghostauth.app;

final class MotionDiagnosticSession {
    static final long DURATION_NANOS = 5_000_000_000L;
    final long id, started;
    final MotionWindow acceleration = new MotionWindow(), rotation = new MotionWindow();
    private boolean running = true;
    private String reason;

    MotionDiagnosticSession(long id, long now) {
        if (id < 1 || now < 0) throw new IllegalArgumentException("Invalid diagnostic session");
        this.id = id; started = now;
    }
    boolean running() { return running; }
    String reason() { return reason; }
    void stop(String cause) {
        if (!running) return;
        running = false; reason = cause;
    }
    long remainingMillis(long now) {
        return running ? Math.max(0, (DURATION_NANOS - Math.max(0, now - started) + 999_999L) / 1_000_000L) : 0;
    }
    boolean add(boolean accelerometer, long timestamp, long now, double x, double y, double z) {
        if (!running) return false;
        if (now >= started && now - started >= DURATION_NANOS) { stop("completed"); return false; }
        if (now < started || timestamp < started || timestamp > now) return false;
        (accelerometer ? acceleration : rotation).add(timestamp - started, x, y, z);
        return true;
    }
}
