package com.ghostauth.app;

import static org.junit.Assert.*;
import java.util.Arrays;
import org.junit.Test;

public class ProtectionPolicyTest {
    @Test public void biometricSystemWindowsDoNotStealTheBoundedLaunchHandoff() {
        ProtectionPolicy policy = policy();
        policy.observe("presto", 0); assertTrue(policy.approveLaunch("presto", 100));
        assertTrue(policy.arriving("presto", 101)); assertFalse(policy.confirmed("presto"));
        assertFalse(policy.observe("systemui", 102, true));
        assertFalse(policy.observe("ghost", 103));
        assertFalse(policy.confirmed("presto"));
        assertFalse(policy.observe("presto", 104)); assertTrue(policy.confirmed("presto"));
        assertFalse(policy.arriving("presto", 105));
        assertFalse(policy.observe("systemui", 106, true)); assertTrue(policy.confirmed("presto"));
        assertFalse(policy.observe("systemui", 5_100, true)); assertFalse(policy.confirmed("presto"));
        assertTrue(policy.observe("presto", 5_101));
    }
    @Test public void launchConfirmationCannotFollowAnotherAppOrAnExpiredArrival() {
        ProtectionPolicy policy = policy(); policy.approveLaunch("presto", 100);
        assertTrue(policy.observe("mail", 101)); assertFalse(policy.confirmed("presto"));
        assertFalse(policy.arriving("presto", 102)); assertFalse(policy.approveLaunch("presto", 103));
        policy.clear(); policy.approveLaunch("presto", 200);
        assertFalse(policy.observe("settings", 201)); assertFalse(policy.arriving("presto", 202));
        policy.approveLaunch("presto", 300);
        assertFalse(policy.arriving("presto", 5_300));
        assertTrue(policy.observe("presto", 5_300)); assertFalse(policy.confirmed("presto"));
    }
    @Test public void timeoutAndSelectionChangesRevokeOnlyThePendingLaunch() {
        ProtectionPolicy policy = policy(); policy.approveLaunch("presto", 100);
        policy.revokeArrival("mail"); assertTrue(policy.arriving("presto", 101));
        policy.revokeArrival("presto"); assertFalse(policy.arriving("presto", 101));
        assertTrue(policy.observe("presto", 102));
        policy.approveLaunch("presto", 200); policy.select(Arrays.asList("mail"));
        assertFalse(policy.confirmed("presto")); assertFalse(policy.arriving("presto", 201));
        assertTrue(policy.observe("mail", 202));
    }
    private ProtectionPolicy policy() {
        ProtectionPolicy policy = new ProtectionPolicy("ghost");
        policy.select(Arrays.asList("presto", "mail")); return policy;
    }
    @Test public void directOpenBlocksUntilExactPackageIsApproved() {
        ProtectionPolicy policy = policy();
        assertTrue(policy.observe("presto", 0));
        long request = policy.request();
        assertTrue(policy.observe("presto", 1)); assertEquals(request, policy.request());
        assertFalse(policy.observe("ghost", 2)); assertEquals("presto", policy.pending());
        assertFalse(policy.approveLaunch("mail", 3));
        assertTrue(policy.approveLaunch("presto", 4));
        assertFalse(policy.observe("ghost", 5)); assertFalse(policy.observe("presto", 6));
        assertFalse(policy.observe("presto", 500_000));
    }
    @Test public void leavingScreenLockSelectionChangeAndRestartRelock() {
        ProtectionPolicy policy = policy();
        policy.approveLaunch("presto", 0); policy.observe("presto", 1);
        assertFalse(policy.observe("home", 2)); assertTrue(policy.observe("presto", 3));
        policy.approveLaunch("presto", 4); policy.observe("presto", 5); policy.clear();
        assertTrue(policy.observe("presto", 6));
        policy.approveLaunch("presto", 7); policy.select(Arrays.asList("presto"));
        assertTrue(policy.observe("presto", 8));
        assertTrue(policy().observe("presto", 9));
        policy.select(Arrays.asList()); assertFalse(policy.observe("presto", 10));
    }
    @Test public void graceExpiresAndCannotAuthorizeAnotherSelectedApp() {
        ProtectionPolicy policy = policy();
        policy.approveLaunch("presto", 100);
        assertTrue(policy.observe("presto", 5_100));
        policy.approveLaunch("presto", 6_000);
        assertTrue(policy.observe("mail", 6_001)); assertEquals("mail", policy.pending());
        assertFalse(policy.observe("settings", 6_002)); assertNull(policy.pending());
    }
}
