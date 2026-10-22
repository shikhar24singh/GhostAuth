package com.ghostauth.app;

final class MotionWindow {
    static final long MIN_NANOS = 2_000_000_000L, MAX_GAP_NANOS = 250_000_000L, MAX_NANOS = 10_000_000_000L;
    int count;
    long first, last, maxGap;
    double mean, m2, squares;
    boolean invalid;

    void add(long time, double x, double y, double z) {
        if (count >= 1000) { invalid = true; return; }
        double magnitude = Math.sqrt(x * x + y * y + z * z);
        if (time < 0 || !Double.isFinite(magnitude) || (count > 0 && (time <= last || time - first > MAX_NANOS))) {
            invalid = true; return;
        }
        if (count == 0) first = time;
        else maxGap = Math.max(maxGap, time - last);
        last = time; count++;
        double delta = magnitude - mean;
        mean += delta / count; m2 += delta * (magnitude - mean); squares += magnitude * magnitude;
    }
    long durationMillis() { return count < 2 ? 0 : (last - first) / 1_000_000L; }
    String reason() {
        if (invalid) return "invalid_samples";
        if (count < 2 || last - first < MIN_NANOS) return "too_short";
        if (maxGap > MAX_GAP_NANOS) return "sensor_gap";
        return "eligible";
    }
    double rate() { return count < 2 || last <= first ? 0 : (count - 1) * 1_000_000_000.0 / (last - first); }
    double deviation() { return count == 0 ? 0 : Math.sqrt(Math.max(0, m2 / count)); }
    double rms() { return count == 0 ? 0 : Math.sqrt(squares / count); }
}
