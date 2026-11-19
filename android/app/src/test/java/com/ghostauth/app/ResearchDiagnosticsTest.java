package com.ghostauth.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class ResearchDiagnosticsTest {
    private ResearchDiagnostics.SensorSummary empty() { return sensor(0, 0, 0, 0, false); }
    private ResearchDiagnostics.SensorSummary sensor(int count, long duration, long gap, double rate, boolean usable) {
        return new ResearchDiagnostics.SensorSummary(count, duration, gap, rate, usable);
    }
    @Test public void fingerprintCoverageExcludesPinAndPreservesMissingSensors() {
        ResearchDiagnostics data = new ResearchDiagnostics();
        data.add("PIN", false, "pin_flow", empty(), empty());
        data.add("fingerprint", false, "focus_lost", empty(), empty());
        data.add("fingerprint", true, "verification_finished", sensor(41, 2000, 50, 20, true), empty());
        assertEquals(1, data.pinSessions); assertEquals(2, data.fingerprintSessions); assertEquals(1, data.usableFingerprintSessions);
        assertEquals(0, data.bothSensorsUsable); assertEquals(1, data.acceleration.usableWindows);
        assertEquals(0, data.rotation.windows); assertNull(data.rotation.medianDurationMillis()); assertNull(data.rotation.medianRateHz());
        assertNull(data.rotation.maxGapMillis); assertEquals(Integer.valueOf(1), data.stops.get("focus_lost"));
    }
    @Test public void mediansDescribeSampledWindowsAndGapsRetainTheWorstObservation() {
        ResearchDiagnostics data = new ResearchDiagnostics();
        data.add("fingerprint", false, "focus_lost", sensor(11, 500, 100, 20, false), empty());
        data.add("fingerprint", true, "verification_finished", sensor(101, 5000, 200, 20, true), sensor(51, 2500, 50, 20, true));
        data.add("fingerprint", false, "backgrounded", sensor(21, 2000, 600, 10, false), empty());
        assertEquals(2000, data.acceleration.medianDurationMillis(), 0.00001);
        assertEquals(20, data.acceleration.medianRateHz(), 0.00001); assertEquals(Long.valueOf(600), data.acceleration.maxGapMillis);
        assertEquals(1, data.bothSensorsUsable); assertEquals(1, data.usableFingerprintSessions);
        assertEquals(3, data.acceleration.windows); assertEquals(1, data.acceleration.usableWindows);
    }
    @Test public void singleReadingsHaveDurationButNoInventedRateOrGap() {
        ResearchDiagnostics data = new ResearchDiagnostics();
        data.add("fingerprint", false, "focus_lost", sensor(1, 0, 0, 0, false), empty());
        assertEquals(0, data.acceleration.medianDurationMillis(), 0.0);
        assertNull(data.acceleration.medianRateHz()); assertNull(data.acceleration.maxGapMillis);
        data.add("fingerprint", false, "verification_finished", sensor(11, 500, 50, 20, false), empty());
        assertEquals(250, data.acceleration.medianDurationMillis(), 0.0);
        assertEquals(20, data.acceleration.medianRateHz(), 0.0);
    }
    @Test public void unverifiedGoodQualityWindowsAreNotUsableIdentityCandidates() {
        ResearchDiagnostics data = new ResearchDiagnostics();
        data.add("fingerprint", false, "verification_finished", sensor(41, 2000, 50, 20, false), empty());
        assertEquals(1, data.acceleration.windows); assertEquals(0, data.acceleration.usableWindows);
        assertEquals(0, data.usableFingerprintSessions);
    }
    @Test public void malformedAndContradictoryDiagnosticsFailRatherThanShowingFalseCoverage() {
        assertThrows(IllegalArgumentException.class, () -> sensor(2, 100, 50, Double.NaN, false));
        assertThrows(IllegalArgumentException.class, () -> sensor(0, 2000, 50, 20, true));
        assertThrows(IllegalArgumentException.class, () -> sensor(41, 2000, 251, 20, true));
        assertThrows(IllegalArgumentException.class, () -> sensor(1001, 2000, 50, 20, true));
        assertThrows(IllegalArgumentException.class, () -> sensor(1, 0, 0, 20, false));
        ResearchDiagnostics data = new ResearchDiagnostics();
        assertThrows(IllegalArgumentException.class, () -> data.add("PIN", false, "pin_flow", sensor(1, 0, 0, 0, false), empty()));
        assertThrows(IllegalArgumentException.class, () -> data.add("fingerprint", true, "focus_lost", empty(), empty()));
        assertThrows(IllegalArgumentException.class, () -> data.add("fingerprint", false, "unknown", empty(), empty()));
        assertEquals(0, data.fingerprintSessions + data.pinSessions);
    }
    @Test public void aggregationIsBoundedByTheRetainedStore() {
        ResearchDiagnostics data = new ResearchDiagnostics();
        for (int i = 0; i < 500; i++) data.add("fingerprint", false, "focus_lost", empty(), empty());
        assertEquals(Integer.valueOf(500), data.stops.get("focus_lost"));
        assertThrows(IllegalArgumentException.class, () -> data.add("fingerprint", false, "focus_lost", empty(), empty()));
    }
}
