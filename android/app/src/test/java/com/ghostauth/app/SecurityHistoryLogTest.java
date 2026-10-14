package com.ghostauth.app;
import org.junit.Test;
import static org.junit.Assert.*;
import java.util.Collections;

public class SecurityHistoryLogTest {
    @Test public void recordingRequiresConsentAndPauseRetainsExistingEntries() {
        SecurityHistoryLog fresh = new SecurityHistoryLog();
        assertSame(fresh, fresh.append(1, "com.example.app", "App", "PIN", "verified"));
        SecurityHistoryLog recorded = fresh.configure(true).append(1, "com.example.app", "App", "PIN", "verified");
        SecurityHistoryLog paused = recorded.configure(false);
        assertSame(paused, paused.append(2, "com.example.app", "App", "fingerprint", "failed"));
        assertEquals(1, paused.entries.size());
        assertEquals(2, paused.configure(true).append(3, "com.example.app", "App", "fingerprint", "failed").entries.size());
    }
    @Test public void newestHundredRetainedWithStableOrderDespiteClockChanges() {
        SecurityHistoryLog log = new SecurityHistoryLog().configure(true);
        for (int i = 1; i <= 105; i++) log = log.append(200 - i, "com.example.app", "App", "PIN", "failed");
        assertEquals(100, log.entries.size()); assertEquals(105, log.entries.get(0).id);
        assertEquals(6, log.entries.get(99).id);
    }
    @Test public void clearPreservesConsentAndDoesNotReuseIdentifiers() {
        SecurityHistoryLog log = new SecurityHistoryLog().configure(true).append(1, "com.example.app", "App", "PIN", "verified");
        SecurityHistoryLog cleared = log.clear();
        assertTrue(cleared.enabled); assertTrue(cleared.configured); assertTrue(cleared.entries.isEmpty());
        assertEquals(2, cleared.append(2, "com.example.app", "App", "PIN", "failed").entries.get(0).id);
        assertFalse(log.configure(false).clear().enabled);
    }
    @Test public void restoredEntriesRemainImmutableAndPreserveNextIdentifier() {
        SecurityHistoryLog.Entry entry = new SecurityHistoryLog.Entry(5, 1, "com.example.app", "App", "fingerprint", "canceled");
        SecurityHistoryLog restored = new SecurityHistoryLog(true, true, 6, Collections.singletonList(entry));
        assertEquals(6, restored.append(2, "com.example.app", "App", "PIN", "locked-out").entries.get(0).id);
        assertThrows(UnsupportedOperationException.class, () -> restored.entries.clear());
    }
    @Test public void malformedRecordsAndArbitraryOutcomesAreRejected() {
        assertThrows(IllegalArgumentException.class, () -> new SecurityHistoryLog.Entry(1, 1, "sample", "App", "PIN", "verified"));
        assertThrows(IllegalArgumentException.class, () -> new SecurityHistoryLog.Entry(1, 1, "com.example.app", "App", "PIN", "allowed"));
        assertThrows(IllegalArgumentException.class, () -> new SecurityHistoryLog.Entry(1, 1, "com.example.app", "App", "password", "verified"));
        assertThrows(IllegalArgumentException.class, () -> new SecurityHistoryLog(false, true, 1, Collections.emptyList()));
        assertThrows(IllegalArgumentException.class, () -> new SecurityHistoryLog(true, true, 1,
            Collections.singletonList(new SecurityHistoryLog.Entry(1, 1, "com.example.app", "App", "PIN", "failed"))));
    }
}
