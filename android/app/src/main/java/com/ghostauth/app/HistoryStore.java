package com.ghostauth.app;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import com.getcapacitor.JSObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.Arrays;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import org.json.JSONArray;
import org.json.JSONObject;

/** Separate key/file from credentials. All state changes commit before publication. */
final class HistoryStore {
    private static final String ALIAS = "ghostauth.history.v1";
    private static SecurityHistoryLog log;
    private static long revision;
    private static String error;
    private static AtomicFile file(Context context) { return new AtomicFile(new File(context.getNoBackupFilesDir(), "security-history.v1")); }
    private static SecretKey key(boolean create) throws Exception {
        KeyStore keys = KeyStore.getInstance("AndroidKeyStore"); keys.load(null);
        if (!keys.containsAlias(ALIAS)) {
            if (!create) throw new IllegalStateException("History key unavailable");
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) keys.getKey(ALIAS, null);
    }
    private static SecurityHistoryLog load(Context context) throws Exception {
        if (log != null) return log;
        File base = file(context).getBaseFile();
        if (!base.exists() && !new File(base.getPath() + ".bak").exists()) return log = new SecurityHistoryLog();
        if (base.length() > 262_144) throw new IllegalStateException("Invalid history size");
        JSONObject envelope = new JSONObject(new String(file(context).readFully(), StandardCharsets.UTF_8));
        byte[] plaintext = HistoryCryptography.decrypt(key(false), new HistoryCryptography.Encrypted(
            CredentialVault.decode(envelope.getString("iv")), CredentialVault.decode(envelope.getString("ciphertext"))));
        try {
            JSONObject record = new JSONObject(new String(plaintext, StandardCharsets.UTF_8));
            if (record.getInt("version") != 1) throw new IllegalStateException("Invalid history version");
            JSONArray raw = record.getJSONArray("entries");
            if (raw.length() > SecurityHistoryLog.LIMIT) throw new IllegalStateException("Invalid history count");
            ArrayList<SecurityHistoryLog.Entry> entries = new ArrayList<>();
            for (int i = 0; i < raw.length(); i++) {
                JSONObject entry = raw.getJSONObject(i);
                entries.add(new SecurityHistoryLog.Entry(entry.getLong("id"), entry.getLong("occurredAt"), entry.getString("packageName"),
                    entry.getString("label"), entry.getString("method"), entry.getString("outcome")));
            }
            return log = new SecurityHistoryLog(record.getBoolean("configured"), record.getBoolean("enabled"), record.getLong("nextId"), entries);
        } finally { Arrays.fill(plaintext, (byte) 0); }
    }
    private static JSONArray entries(SecurityHistoryLog value) throws Exception {
        JSONArray entries = new JSONArray();
        for (SecurityHistoryLog.Entry entry : value.entries) entries.put(new JSONObject().put("id", entry.id).put("occurredAt", entry.occurredAt)
            .put("packageName", entry.packageName).put("label", entry.label).put("method", entry.method).put("outcome", entry.outcome));
        return entries;
    }
    private static void save(Context context, SecurityHistoryLog next) throws Exception {
        JSONObject record = new JSONObject().put("version", 1).put("configured", next.configured).put("enabled", next.enabled)
            .put("nextId", next.nextId).put("entries", entries(next));
        byte[] plaintext = record.toString().getBytes(StandardCharsets.UTF_8);
        try {
            HistoryCryptography.Encrypted encrypted = HistoryCryptography.encrypt(key(true), plaintext);
            byte[] data = new JSONObject().put("iv", CredentialVault.encode(encrypted.iv))
                .put("ciphertext", CredentialVault.encode(encrypted.ciphertext)).toString().getBytes(StandardCharsets.UTF_8);
            AtomicFile target = file(context); FileOutputStream output = null;
            try {
                output = target.startWrite(); output.write(data); output.getFD().sync(); target.finishWrite(output);
                if (!Arrays.equals(data, target.readFully())) throw new IllegalStateException("History write failed");
            }
            catch (Exception failure) { target.failWrite(output); throw failure; }
            log = next;
        } finally { Arrays.fill(plaintext, (byte) 0); }
    }
    static synchronized JSObject snapshot(Context context, Boolean initialEnabled) throws Exception {
        SecurityHistoryLog value = load(context);
        if (!value.configured && initialEnabled != null) { save(context, value.configure(initialEnabled)); revision++; }
        JSObject result = new JSObject().put("enabled", log.enabled).put("entries", entries(log));
        if (error != null) result.put("error", error);
        return result;
    }
    static synchronized JSObject configure(Context context, boolean enabled) throws Exception {
        SecurityHistoryLog value = load(context);
        if (value.configured && value.enabled == enabled) return snapshot(context, null);
        save(context, value.configure(enabled)); revision++; error = null;
        return snapshot(context, null);
    }
    static synchronized JSObject clear(Context context) throws Exception {
        SecurityHistoryLog value;
        try { value = load(context).clear(); }
        catch (Exception unavailable) { value = new SecurityHistoryLog().configure(false); }
        save(context, value); revision++; error = null;
        return snapshot(context, null);
    }
    static synchronized long ticket() { return revision; }
    static synchronized void record(Context context, long ticket, long time, String pkg, String method, String outcome) {
        try {
            if (ticket != revision) return; // Clear/pause discards older queued writes.
            SecurityHistoryLog value = load(context);
            if (!value.configured || !value.enabled) return;
            String label = pkg;
            try { label = getApplicationLabel(context, pkg); } catch (Exception ignored) { }
            label = label.substring(0, Math.min(label.length(), 160));
            SecurityHistoryLog next = value.append(time, pkg, label, method, outcome);
            save(context, next); error = null;
        } catch (Exception unavailable) { error = "Some verification attempts could not be saved. Clear history to reset its storage, then try again."; }
        GhostHistoryPlugin.changed();
    }
    private static String getApplicationLabel(Context context, String pkg) throws Exception {
        String label = context.getPackageManager().getApplicationLabel(context.getPackageManager().getApplicationInfo(pkg, 0)).toString().trim();
        return label.isEmpty() ? pkg : label.substring(0, Math.min(label.length(), 160));
    }
}
