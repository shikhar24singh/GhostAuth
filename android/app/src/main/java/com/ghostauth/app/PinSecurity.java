package com.ghostauth.app;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Arrays;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

final class PinSecurity {
    static final int ITERATIONS = 600_000;
    static final long SESSION_MILLIS = 30_000;

    static boolean valid(String pin) {
        return pin != null && pin.matches("[0-9]{6}");
    }

    static byte[] derive(String pin, byte[] salt, int iterations) throws GeneralSecurityException {
        if (pin == null || salt == null || iterations < 1) throw new IllegalArgumentException("Invalid KDF parameters");
        byte[] password = pin.getBytes(StandardCharsets.UTF_8);
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(password, "HmacSHA256"));
            byte[] input = Arrays.copyOf(salt, salt.length + 4);
            input[input.length - 1] = 1;
            byte[] u = mac.doFinal(input);
            byte[] result = u.clone();
            for (int i = 1; i < iterations; i++) {
                byte[] next = mac.doFinal(u);
                Arrays.fill(u, (byte) 0);
                u = next;
                for (int j = 0; j < result.length; j++) result[j] ^= u[j];
            }
            Arrays.fill(u, (byte) 0);
            Arrays.fill(input, (byte) 0);
            return result;
        } finally { Arrays.fill(password, (byte) 0); }
    }

    static boolean matches(String pin, byte[] salt, byte[] expected) throws GeneralSecurityException {
        if (!valid(pin) || salt.length != 32 || expected.length != 32) return false;
        byte[] candidate = derive(pin, salt, ITERATIONS);
        try { return MessageDigest.isEqual(candidate, expected); }
        finally { Arrays.fill(candidate, (byte) 0); }
    }

    static long delayMillis(int failures) {
        if (failures < 5) return 0;
        return Math.min(3_600_000L, 30_000L << Math.min(7, (failures - 5) / 5));
    }

    static long remainingSeconds(long until, long now) {
        return until <= now ? 0 : (until - now + 999) / 1000;
    }

    static boolean sessionValid(long grantedAt, long now) {
        return grantedAt >= 0 && now >= grantedAt && now - grantedAt < SESSION_MILLIS;
    }
}
