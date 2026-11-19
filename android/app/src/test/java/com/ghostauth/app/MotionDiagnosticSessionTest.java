package com.ghostauth.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class MotionDiagnosticSessionTest {
    @Test public void normalDeliveryCanReachTwoSecondsWithoutFingerprintVerification() {
        MotionDiagnosticSession session = new MotionDiagnosticSession(1, 1_000_000_000L);
        for (int i = 0; i <= 80; i++) {
            long time = session.started + i * 50_000_000L;
            assertTrue(session.add(true, time, time, 3, 4, 0));
            assertTrue(session.add(false, time, time, 0, 0, 1));
        }
        assertEquals("eligible", session.acceleration.reason()); assertEquals("eligible", session.rotation.reason());
        assertEquals(20, session.acceleration.rate(), .00001); assertEquals(4000, session.acceleration.durationMillis());
        assertEquals(1000, session.remainingMillis(session.started + 4_000_000_000L));
    }
    @Test public void hardDeadlineRejectsLateSamplesEvenIfTheTimerRunsLate() {
        MotionDiagnosticSession session = new MotionDiagnosticSession(2, 100);
        session.add(true, 100, 100, 0, 0, 9.8);
        assertFalse(session.add(true, 100 + MotionDiagnosticSession.DURATION_NANOS - 1,
            100 + MotionDiagnosticSession.DURATION_NANOS, 0, 0, 9.8));
        assertFalse(session.running()); assertEquals("completed", session.reason()); assertEquals(1, session.acceleration.count);
        assertEquals(0, session.remainingMillis(100));
    }
    @Test public void focusAndOtherInterruptionsCannotResumeOrOverwriteTheirFirstReason() {
        for (String reason : new String[] {"focus_lost", "backgrounded", "screen_off", "settings_changed", "screen_left", "verification_started"}) {
            MotionDiagnosticSession session = new MotionDiagnosticSession(3, 0);
            session.add(true, 10, 10, 0, 0, 9.8); session.stop(reason);
            assertFalse(session.add(true, 100, 100, 0, 0, 9.8));
            session.stop("completed"); assertEquals(reason, session.reason()); assertEquals(1, session.acceleration.count);
        }
    }
    @Test public void timestampsOutsideTheRunAreIgnoredAndMissingStreamsRemainEmpty() {
        MotionDiagnosticSession session = new MotionDiagnosticSession(4, 100);
        assertFalse(session.add(true, 99, 101, 0, 0, 1));
        assertFalse(session.add(true, 103, 102, 0, 0, 1));
        assertTrue(session.add(true, 101, 102, 0, 0, 1));
        assertEquals(1, session.acceleration.count); assertEquals(0, session.rotation.count);
        assertEquals("too_short", session.rotation.reason()); assertEquals(5000, session.remainingMillis(100));
    }
    @Test public void gapsAndInvalidReadingsAreNotReportedAsSufficientDelivery() {
        MotionDiagnosticSession session = new MotionDiagnosticSession(5, 0);
        session.add(true, 0, 0, 0, 0, 1);
        session.add(true, 3_000_000_000L, 3_000_000_000L, 0, 0, 1);
        assertEquals("sensor_gap", session.acceleration.reason());
        session.add(false, 0, 0, Double.NaN, 0, 0); assertEquals("invalid_samples", session.rotation.reason());
    }
}
