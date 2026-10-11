package com.ghostauth.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.ContentResolver;
import android.os.SystemClock;
import android.provider.Settings;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.security.KeyStore;
import java.security.SecureRandom;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import org.json.JSONObject;

/** The PIN verifier, retry counters and biometric binding are one authenticated ciphertext. */
final class CredentialVault {
    private static final String ALIAS = "ghostauth.credentials.v1";
    private static final byte[] AAD = "com.ghostauth.app.credentials.v1".getBytes(StandardCharsets.UTF_8);
    private final SharedPreferences preferences;
    private final KeyStore keys;
    private final ContentResolver resolver;

    CredentialVault(Context context) throws Exception {
        preferences = context.getSharedPreferences("ghostauth_auth", Context.MODE_PRIVATE);
        resolver = context.getContentResolver();
        keys = KeyStore.getInstance("AndroidKeyStore");
        keys.load(null);
    }

    static String encode(byte[] bytes) { return Base64.encodeToString(bytes, Base64.NO_WRAP); }
    static byte[] decode(String value) { return Base64.decode(value, Base64.NO_WRAP); }

    private SecretKey key(boolean create) throws Exception {
        if (!keys.containsAlias(ALIAS)) {
            if (!create) throw new IllegalStateException("Credential key unavailable");
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) keys.getKey(ALIAS, null);
    }

    JSONObject read() throws Exception {
        String stored = preferences.getString("record", null);
        if (stored == null) {
            // A surviving key without its record is not a fresh installation.
            if (keys.containsAlias(ALIAS)) throw new IllegalStateException("Credential record unavailable");
            return new JSONObject();
        }
        JSONObject envelope = new JSONObject(stored);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, decode(envelope.getString("iv"))));
        cipher.updateAAD(AAD);
        byte[] plaintext = cipher.doFinal(decode(envelope.getString("ciphertext")));
        try {
            JSONObject record = new JSONObject(new String(plaintext, StandardCharsets.UTF_8));
            if (record.getInt("version") != 1 || decode(record.getString("salt")).length != 32
                || decode(record.getString("verifier")).length != 32 || record.getInt("failures") < 0
                || record.getLong("lockedUntilElapsed") < 0 || record.getLong("lockDuration") < 0
                || record.getLong("lockDuration") > 3_600_000) throw new IllegalStateException("Invalid credential record");
            long now = SystemClock.elapsedRealtime();
            long boot = bootCount();
            // Device clock edits cannot shorten the lockout. After reboot, wait the last
            // imposed delay again, rather than trust a user-editable wall clock.
            if (record.getLong("lockDuration") > 0 && (record.getLong("lockBoot") != boot || now < record.getLong("savedElapsed"))) {
                record.put("lockedUntilElapsed", now + record.getLong("lockDuration")).put("lockBoot", boot);
                save(record);
            }
            return record;
        } finally { Arrays.fill(plaintext, (byte) 0); }
    }

    void save(JSONObject record) throws Exception {
        record.put("savedElapsed", SystemClock.elapsedRealtime());
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key(true));
        cipher.updateAAD(AAD);
        byte[] plaintext = record.toString().getBytes(StandardCharsets.UTF_8);
        try {
            JSONObject envelope = new JSONObject().put("iv", encode(cipher.getIV()))
                .put("ciphertext", encode(cipher.doFinal(plaintext)));
            if (!preferences.edit().putString("record", envelope.toString()).commit())
                throw new IllegalStateException("Credential write failed");
        } finally { Arrays.fill(plaintext, (byte) 0); }
    }

    JSONObject enroll(String pin) throws Exception {
        if (read().has("verifier")) throw new IllegalStateException("PIN already enrolled");
        JSONObject record = new JSONObject().put("version", 1);
        updatePin(record, pin);
        return record;
    }

    void updatePin(JSONObject record, String pin) throws Exception {
        if (!PinSecurity.valid(pin)) throw new IllegalArgumentException("Six-digit PIN required");
        byte[] salt = new byte[32]; new SecureRandom().nextBytes(salt);
        byte[] verifier = PinSecurity.derive(pin, salt, PinSecurity.ITERATIONS);
        try {
            record.put("salt", encode(salt)).put("verifier", encode(verifier))
                .put("failures", 0).put("lockedUntilElapsed", 0L).put("lockDuration", 0L).put("lockBoot", bootCount());
            save(record);
        } finally { Arrays.fill(verifier, (byte) 0); }
    }

    boolean check(JSONObject record, String pin) throws Exception {
        if (!record.has("verifier")) throw new IllegalStateException("Create a PIN first");
        if (PinSecurity.remainingSeconds(record.getLong("lockedUntilElapsed"), SystemClock.elapsedRealtime()) > 0) return false;
        boolean ok = PinSecurity.matches(pin, decode(record.getString("salt")), decode(record.getString("verifier")));
        int failures = ok ? 0 : Math.min(100, record.getInt("failures") + 1);
        long delay = PinSecurity.delayMillis(failures);
        record.put("failures", failures).put("lockedUntilElapsed", delay == 0 ? 0L : SystemClock.elapsedRealtime() + delay)
            .put("lockDuration", delay).put("lockBoot", bootCount());
        save(record); // Persist before returning a result, including on failed attempts.
        return ok;
    }

    private long bootCount() { return Settings.Global.getInt(resolver, Settings.Global.BOOT_COUNT, -1); }
}
