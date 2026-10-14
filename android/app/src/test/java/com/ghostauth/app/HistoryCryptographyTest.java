package com.ghostauth.app;
import org.junit.Test;
import static org.junit.Assert.*;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

public class HistoryCryptographyTest {
    private SecretKey key() throws Exception { KeyGenerator generator = KeyGenerator.getInstance("AES"); generator.init(256); return generator.generateKey(); }
    @Test public void encryptedHistoryRoundTripsAndEachWriteHasFreshIv() throws Exception {
        SecretKey key = key(); byte[] data = "verification outcome".getBytes(StandardCharsets.UTF_8);
        HistoryCryptography.Encrypted first = HistoryCryptography.encrypt(key, data), second = HistoryCryptography.encrypt(key, data);
        assertArrayEquals(data, HistoryCryptography.decrypt(key, first));
        assertFalse(Arrays.equals(first.iv, second.iv)); assertFalse(Arrays.equals(data, first.ciphertext));
    }
    @Test public void tamperingAndDifferentKeysCannotReadHistory() throws Exception {
        SecretKey key = key(); HistoryCryptography.Encrypted encrypted = HistoryCryptography.encrypt(key, new byte[] {1, 2, 3});
        assertThrows(Exception.class, () -> HistoryCryptography.decrypt(key(), encrypted));
        encrypted.ciphertext[0] ^= 1;
        assertThrows(Exception.class, () -> HistoryCryptography.decrypt(key, encrypted));
    }
    @Test public void malformedIvAndTruncatedCiphertextFail() throws Exception {
        SecretKey key = key();
        assertThrows(IllegalArgumentException.class, () -> HistoryCryptography.decrypt(key, new HistoryCryptography.Encrypted(new byte[0], new byte[16])));
        assertThrows(IllegalArgumentException.class, () -> HistoryCryptography.decrypt(key, new HistoryCryptography.Encrypted(new byte[12], new byte[1])));
    }
}
