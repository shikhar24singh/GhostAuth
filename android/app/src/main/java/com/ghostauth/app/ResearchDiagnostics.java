package com.ghostauth.app;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

final class ResearchDiagnostics {
    static final String[] STOP_REASONS = { "too_short", "movement_disabled", "pin_flow", "focus_lost", "no_sensors",
        "sensor_unavailable", "window_limit", "verification_finished", "backgrounded", "screen_locked", "canceled", "request_replaced" };
    static final class SensorSummary {
        final int count;
        final long durationMillis, maxGapMillis;
        final double rateHz;
        final boolean usable;
        SensorSummary(int count, long durationMillis, long maxGapMillis, double rateHz, boolean usable) {
            if (count < 0 || count > 1000 || durationMillis < 0 || durationMillis > 10_000
                || maxGapMillis < 0 || maxGapMillis > 10_000 || !Double.isFinite(rateHz) || rateHz < 0 || rateHz > 1_000_000_000
                || (count < 2 && (durationMillis != 0 || maxGapMillis != 0 || rateHz != 0))
                || (usable && (count < 2 || durationMillis < 2000 || maxGapMillis > 250)))
                throw new IllegalArgumentException("Invalid sensor diagnostics");
            this.count = count; this.durationMillis = durationMillis; this.maxGapMillis = maxGapMillis;
            this.rateHz = rateHz; this.usable = usable;
        }
    }
    static final class SensorTotals {
        int windows, usableWindows;
        final List<Double> durations = new ArrayList<>(), rates = new ArrayList<>();
        Long maxGapMillis;
        void add(SensorSummary sample) {
            if (sample.count == 0) return;
            windows++;
            if (sample.usable) usableWindows++;
            durations.add((double) sample.durationMillis);
            if (sample.count >= 2) {
                rates.add(sample.rateHz);
                maxGapMillis = maxGapMillis == null ? sample.maxGapMillis : Math.max(maxGapMillis, sample.maxGapMillis);
            }
        }
        Double medianDurationMillis() { return median(durations); }
        Double medianRateHz() { return median(rates); }
    }
    int fingerprintSessions, pinSessions, usableFingerprintSessions, bothSensorsUsable;
    final SensorTotals acceleration = new SensorTotals(), rotation = new SensorTotals();
    final Map<String, Integer> stops = new LinkedHashMap<>();
    void add(String method, boolean eligible, String stoppedBy, SensorSummary acceleration, SensorSummary rotation) {
        if (fingerprintSessions + pinSessions >= ResearchRetention.LIMIT) throw new IllegalArgumentException("Too many diagnostics");
        if (eligible != (acceleration.usable || rotation.usable)) throw new IllegalArgumentException("Inconsistent eligibility");
        if ("PIN".equals(method)) {
            if (eligible || acceleration.count != 0 || rotation.count != 0) throw new IllegalArgumentException("PIN motion is excluded");
            pinSessions++; return;
        }
        if (!"fingerprint".equals(method) || !java.util.Arrays.asList(STOP_REASONS).contains(stoppedBy))
            throw new IllegalArgumentException("Invalid fingerprint diagnostics");
        fingerprintSessions++;
        if (eligible) usableFingerprintSessions++;
        if (acceleration.usable && rotation.usable) bothSensorsUsable++;
        stops.put(stoppedBy, stops.getOrDefault(stoppedBy, 0) + 1);
        this.acceleration.add(acceleration); this.rotation.add(rotation);
    }
    private static Double median(List<Double> values) {
        if (values.isEmpty()) return null;
        List<Double> sorted = new ArrayList<>(values); Collections.sort(sorted);
        int middle = sorted.size() / 2;
        return sorted.size() % 2 == 0 ? (sorted.get(middle - 1) + sorted.get(middle)) / 2 : sorted.get(middle);
    }
}
