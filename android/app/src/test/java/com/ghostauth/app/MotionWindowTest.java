package com.ghostauth.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class MotionWindowTest {
    @Test public void shortAndEmptyWindowsCannotBecomeIdentityEvidence() {
        MotionWindow window = new MotionWindow(); assertEquals("too_short", window.reason());
        window.add(0, 3, 4, 0); window.add(50_000_000, 3, 4, 0);
        assertEquals("too_short", window.reason()); assertEquals(20, window.rate(), 0.00001);
    }
    @Test public void regularTwoSecondWindowHasCorrectMagnitudeStatistics() {
        MotionWindow window = new MotionWindow();
        for (int i = 0; i <= 40; i++) window.add(i * 50_000_000L, 3, 4, 0);
        assertEquals("eligible", window.reason()); assertEquals(41, window.count);
        assertEquals(2000, window.durationMillis()); assertEquals(5, window.mean, 0.00001);
        assertEquals(5, window.rms(), 0.00001); assertEquals(0, window.deviation(), 0.00001);
    }
    @Test public void gapCannotBeHiddenByOtherwiseLongWindow() {
        MotionWindow window = new MotionWindow();
        for (int i = 0; i < 10; i++) window.add(i * 50_000_000L, 0, 0, 9.8);
        for (int i = 20; i <= 50; i++) window.add(i * 50_000_000L, 0, 0, 9.8);
        assertEquals("sensor_gap", window.reason());
    }
    @Test public void invalidAndOutOfOrderSamplesRejectTheWindow() {
        MotionWindow window = new MotionWindow(); window.add(0, Double.NaN, 0, 0);
        assertEquals("invalid_samples", window.reason());
        window = new MotionWindow(); window.add(10, 0, 0, 0); window.add(10, 0, 0, 0);
        assertEquals("invalid_samples", window.reason());
    }
    @Test public void windowsHaveTimeAndCountBounds() {
        MotionWindow window = new MotionWindow(); window.add(0, 0, 0, 0); window.add(10_000_000_001L, 0, 0, 0);
        assertEquals("invalid_samples", window.reason());
        window = new MotionWindow(); for (int i = 0; i < 1001; i++) window.add(i, 0, 0, 0);
        assertEquals(1000, window.count); assertEquals("invalid_samples", window.reason());
    }
    @Test public void changingMagnitudesUsePopulationVariance() {
        MotionWindow window = new MotionWindow(); window.add(0, 1, 0, 0); window.add(50_000_000, 3, 0, 0);
        assertEquals(2, window.mean, 0.00001); assertEquals(1, window.deviation(), 0.00001);
        assertEquals(Math.sqrt(5), window.rms(), 0.00001);
    }
}
