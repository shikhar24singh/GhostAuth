package com.ghostauth.app;

import static org.junit.Assert.*;
import org.junit.Test;

public class LaunchSessionTest {
    @Test public void approvalIsBoundToPackageAndConsumedOnce() {
        LaunchSession session = new LaunchSession();
        assertFalse(session.consume("com.example.mail", 100));
        session.grant("com.example.mail", 100);
        assertFalse(session.consume("com.example.photos", 101));
        assertFalse(session.consume("com.example.mail", 102));
        session.grant("com.example.mail", 200);
        assertTrue(session.consume("com.example.mail", 201));
        assertEquals(0, session.remaining(202));
        assertFalse(session.consume("com.example.mail", 203));
    }
    @Test public void expiryRevocationAndProcessRestartRejectLaunches() {
        LaunchSession session = new LaunchSession();
        session.grant("com.example.mail", 100);
        assertEquals(1, session.remaining(30_099));
        assertFalse(session.consume("com.example.mail", 30_100));
        session.grant("com.example.mail", 100);
        assertFalse(session.consume("com.example.mail", 99));
        session.grant("com.example.mail", 100);
        session.clear();
        assertFalse(session.consume("com.example.mail", 101));
        session.grant("com.example.mail", 100);
        assertFalse(new LaunchSession().consume("com.example.mail", 101));
    }
}
