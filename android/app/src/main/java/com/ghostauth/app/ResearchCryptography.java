package com.ghostauth.app;

import java.nio.charset.StandardCharsets;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class ResearchCryptography {
    private static final byte[] AAD = "com.ghostauth.app.research.v1".getBytes(StandardCharsets.UTF_8);
    static byte[][] encrypt(SecretKey key, byte[] plain) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key); cipher.updateAAD(AAD);
        return new byte[][] { cipher.getIV(), cipher.doFinal(plain) };
    }
    static byte[] decrypt(SecretKey key, byte[] iv, byte[] data) throws Exception {
        if (iv.length != 12 || data.length < 16) throw new IllegalArgumentException("Invalid research ciphertext");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, iv)); cipher.updateAAD(AAD);
        return cipher.doFinal(data);
    }
}
