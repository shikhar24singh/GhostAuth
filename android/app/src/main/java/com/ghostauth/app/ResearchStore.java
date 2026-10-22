package com.ghostauth.app;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import org.json.JSONArray;
import org.json.JSONObject;

final class ResearchStore {
    static final int LIMIT = ResearchRetention.LIMIT, MAX_BYTES = ResearchRetention.MAX_BYTES;
    private static final String ALIAS = "ghostauth.research.v1";
    private final AtomicFile file;
    ResearchStore(Context context) { file = new AtomicFile(new File(context.getNoBackupFilesDir(), "research.v1")); }
    private SecretKey key(boolean create) throws Exception {
        KeyStore keys = KeyStore.getInstance("AndroidKeyStore"); keys.load(null);
        if (!keys.containsAlias(ALIAS)) {
            if (!create) throw new IllegalStateException("Research key unavailable");
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) keys.getKey(ALIAS, null);
    }
    static JSONObject empty() throws Exception {
        return new JSONObject().put("version", 1).put("enabled", false).put("movementConfigured", false)
            .put("movementAllowed", false).put("entries", new JSONArray());
    }
    JSONObject read() throws Exception {
        if (!file.getBaseFile().exists() && !new File(file.getBaseFile().getPath() + ".bak").exists()) return empty();
        if (file.getBaseFile().length() > MAX_BYTES || new File(file.getBaseFile().getPath() + ".bak").length() > MAX_BYTES)
            throw new IllegalStateException("Research file too large");
        JSONObject envelope = new JSONObject(new String(file.readFully(), StandardCharsets.UTF_8));
        byte[] plain = ResearchCryptography.decrypt(key(false), CredentialVault.decode(envelope.getString("iv")),
            CredentialVault.decode(envelope.getString("ciphertext")));
        try {
            JSONObject value = new JSONObject(new String(plain, StandardCharsets.UTF_8));
            if (value.getInt("version") != 1 || value.getJSONArray("entries").length() > LIMIT) throw new IllegalStateException("Invalid research version/count");
            value.getBoolean("enabled"); value.getBoolean("movementConfigured"); value.getBoolean("movementAllowed");
            return value;
        } finally { Arrays.fill(plain, (byte) 0); }
    }
    static boolean prune(JSONObject value, long now) throws Exception {
        JSONArray old = value.getJSONArray("entries"), next = new JSONArray();
        for (int i = ResearchRetention.firstRetainedIndex(old.length()); i < old.length(); i++) {
            JSONObject entry = old.getJSONObject(i);
            long time = entry.getLong("occurredAt");
            if (ResearchRetention.retain(time, now)) next.put(entry);
        }
        value.put("entries", next); return next.length() != old.length();
    }
    void save(JSONObject value) throws Exception {
        prune(value, System.currentTimeMillis());
        JSONArray entries = value.getJSONArray("entries");
        while (true) {
            byte[] plain = value.toString().getBytes(StandardCharsets.UTF_8);
            try {
                byte[][] encrypted = ResearchCryptography.encrypt(key(true), plain);
                byte[] data = new JSONObject().put("iv", CredentialVault.encode(encrypted[0]))
                    .put("ciphertext", CredentialVault.encode(encrypted[1])).toString().getBytes(StandardCharsets.UTF_8);
                if (data.length > MAX_BYTES) {
                    if (entries.length() == 0) throw new IllegalStateException("Research record too large");
                    entries.remove(0); continue;
                }
                FileOutputStream output = null;
                try {
                    output = file.startWrite(); output.write(data); output.getFD().sync(); file.finishWrite(output);
                    if (!Arrays.equals(data, file.readFully())) throw new IllegalStateException("Research write failed");
                } catch (Exception failure) { file.failWrite(output); throw failure; }
                return;
            } finally { Arrays.fill(plain, (byte) 0); }
        }
    }
}
