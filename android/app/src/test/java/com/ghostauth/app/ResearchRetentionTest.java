package com.ghostauth.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class ResearchRetentionTest {
    @Test public void expiryIncludesSevenDayBoundaryAndRejectsClockRollback() {
        long now = ResearchRetention.MAX_AGE_MILLIS * 2;
        assertTrue(ResearchRetention.retain(now - 1, now));
        assertTrue(ResearchRetention.retain(now - ResearchRetention.MAX_AGE_MILLIS + 1, now));
        assertFalse(ResearchRetention.retain(now - ResearchRetention.MAX_AGE_MILLIS, now));
        assertFalse(ResearchRetention.retain(now + 1, now)); assertFalse(ResearchRetention.retain(0, now));
    }
    @Test public void appendEvictsOldestAtCountLimit() {
        assertEquals(0, ResearchRetention.firstRetainedIndex(0));
        assertEquals(0, ResearchRetention.firstRetainedIndex(500));
        assertEquals(1, ResearchRetention.firstRetainedIndex(501));
        assertEquals(100, ResearchRetention.firstRetainedIndex(600));
    }
}
