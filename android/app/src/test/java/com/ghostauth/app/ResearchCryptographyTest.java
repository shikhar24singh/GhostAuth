package com.ghostauth.app;

import org.junit.Test;
import static org.junit.Assert.*;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import java.util.Arrays;

public class ResearchCryptographyTest {
    private SecretKey key() throws Exception { KeyGenerator generator = KeyGenerator.getInstance("AES"); generator.init(256); return generator.generateKey(); }
    @Test public void summariesRoundTripWithFreshIvAndRejectTampering() throws Exception {
        SecretKey key = key(); byte[] plain = "motion summaries".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        byte[][] first = ResearchCryptography.encrypt(key, plain), second = ResearchCryptography.encrypt(key, plain);
        assertArrayEquals(plain, ResearchCryptography.decrypt(key, first[0], first[1]));
        assertFalse(Arrays.equals(first[0], second[0]));
        assertThrows(Exception.class, () -> ResearchCryptography.decrypt(key(), first[0], first[1]));
        first[1][0] ^= 1; assertThrows(Exception.class, () -> ResearchCryptography.decrypt(key, first[0], first[1]));
    }
    @Test public void historyAndResearchCiphertextsCannotBeInterchangedEvenWithSameKey() throws Exception {
        SecretKey key = key(); byte[][] research = ResearchCryptography.encrypt(key, new byte[] {1});
        assertThrows(Exception.class, () -> HistoryCryptography.decrypt(key, new HistoryCryptography.Encrypted(research[0], research[1])));
        HistoryCryptography.Encrypted history = HistoryCryptography.encrypt(key, new byte[] {1});
        assertThrows(Exception.class, () -> ResearchCryptography.decrypt(key, history.iv, history.ciphertext));
    }
    @Test public void malformedCiphertextIsRejected() throws Exception {
        SecretKey key = key();
        assertThrows(IllegalArgumentException.class, () -> ResearchCryptography.decrypt(key, new byte[0], new byte[16]));
        assertThrows(IllegalArgumentException.class, () -> ResearchCryptography.decrypt(key, new byte[12], new byte[1]));
    }
}
