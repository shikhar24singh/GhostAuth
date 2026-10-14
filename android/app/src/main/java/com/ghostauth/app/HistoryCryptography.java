package com.ghostauth.app;

import java.nio.charset.StandardCharsets;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class HistoryCryptography {
    private static final byte[] AAD = "com.ghostauth.app.history.v1".getBytes(StandardCharsets.UTF_8);
    static final class Encrypted {
        final byte[] iv, ciphertext;
        Encrypted(byte[] iv, byte[] ciphertext) { this.iv = iv; this.ciphertext = ciphertext; }
    }
    static Encrypted encrypt(SecretKey key, byte[] plaintext) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key); cipher.updateAAD(AAD);
        return new Encrypted(cipher.getIV(), cipher.doFinal(plaintext));
    }
    static byte[] decrypt(SecretKey key, Encrypted encrypted) throws Exception {
        if (encrypted.iv.length != 12 || encrypted.ciphertext.length < 16) throw new IllegalArgumentException("Invalid history ciphertext");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, encrypted.iv)); cipher.updateAAD(AAD);
        return cipher.doFinal(encrypted.ciphertext);
    }
}
