package com.ghostauth.app;

import static org.junit.Assert.*;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.junit.Test;

public class PinSecurityTest {
    @Test
    public void pbkdf2MatchesIndependentJdkImplementation() throws Exception {
        byte[] salt = "salt".getBytes(StandardCharsets.UTF_8);
        for (int iterations : new int[] {1, 2, 4096}) {
            PBEKeySpec spec = new PBEKeySpec("password".toCharArray(), salt, iterations, 256);
            byte[] reference = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
            assertArrayEquals(reference, PinSecurity.derive("password", salt, iterations));
            spec.clearPassword();
        }
    }

    @Test
    public void verifierRejectsWrongPinAndMalformedCredentials() throws Exception {
        byte[] salt = new byte[32]; Arrays.fill(salt, (byte) 7);
        byte[] verifier = PinSecurity.derive("012345", salt, PinSecurity.ITERATIONS);
        assertTrue(PinSecurity.matches("012345", salt, verifier));
        assertFalse(PinSecurity.matches("123456", salt, verifier));
        assertFalse(PinSecurity.matches("123", salt, verifier));
        assertFalse(PinSecurity.matches("abcdef", salt, verifier));
        assertFalse(PinSecurity.matches("012345", new byte[16], verifier));
        assertFalse(PinSecurity.matches("012345", salt, new byte[16]));
        assertFalse(Arrays.equals(verifier, PinSecurity.derive("012345", new byte[32], PinSecurity.ITERATIONS)));
    }

    @Test
    public void retryDelayEscalatesAndRoundsRemainingTimeUp() {
        assertEquals(0, PinSecurity.delayMillis(4));
        assertEquals(30_000, PinSecurity.delayMillis(5));
        assertEquals(30_000, PinSecurity.delayMillis(9));
        assertEquals(60_000, PinSecurity.delayMillis(10));
        assertEquals(3_600_000, PinSecurity.delayMillis(100));
        assertEquals(30, PinSecurity.remainingSeconds(31_000, 1_001));
        assertEquals(1, PinSecurity.remainingSeconds(31_000, 30_999));
        assertEquals(0, PinSecurity.remainingSeconds(31_000, 31_000));
    }

    @Test
    public void sessionsExpireAndCannotSurviveClockRollbackOrProcessRestart() {
        assertTrue(PinSecurity.sessionValid(100, 100));
        assertTrue(PinSecurity.sessionValid(100, 30_099));
        assertFalse(PinSecurity.sessionValid(100, 30_100));
        assertFalse(PinSecurity.sessionValid(100, 99));
        assertFalse(PinSecurity.sessionValid(-1, 500));
    }
}
