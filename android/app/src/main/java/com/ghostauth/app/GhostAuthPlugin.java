package com.ghostauth.app;

import android.os.Build;
import android.content.Intent;
import android.os.SystemClock;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** Local device authentication. No credential or biometric image leaves Android. */
@CapacitorPlugin(name = "GhostAuth")
public class GhostAuthPlugin extends Plugin {
    private static final String BIO_ALIAS = "ghostauth.biometric.v1";
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicLong generation = new AtomicLong();
    private final LaunchSession session = new LaunchSession();
    private volatile boolean foreground = true;
    private volatile BiometricPrompt prompt;
    private volatile PluginCall promptCall;
    private volatile boolean prompting;
    private volatile boolean promptEnrollment;

    private void recordHistory(PluginCall call, String method, String outcome) {
        String pkg = call.getString("packageName");
        if (pkg == null) return; // Credential management never masquerades as an app check.
        android.content.Context context = getContext().getApplicationContext();
        long ticket = HistoryStore.ticket(), time = System.currentTimeMillis();
        worker.execute(() -> HistoryStore.record(context, ticket, time, pkg, method, outcome));
    }

    private interface Work { void run(CredentialVault vault, long epoch) throws Exception; }

    private void execute(PluginCall call, Work work) {
        long epoch = generation.get();
        worker.execute(() -> {
            try {
                requireForeground(epoch);
                if (prompting) { call.reject("Finish the Android prompt first.", "BUSY"); return; }
                work.run(new CredentialVault(getContext()), epoch);
            } catch (Exception ignored) {
                session.clear();
                call.reject("Authentication unavailable. Your credentials were kept. Restart GhostAuth and try again.", "AUTH_UNAVAILABLE");
            }
        });
    }

    private void requireForeground(long epoch) {
        if (!foreground || generation.get() != epoch) throw new IllegalStateException("Session ended");
    }

    private boolean available() {
        return BiometricManager.from(getContext()).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            == BiometricManager.BIOMETRIC_SUCCESS;
    }

    private KeyStore keys() throws Exception {
        KeyStore keys = KeyStore.getInstance("AndroidKeyStore"); keys.load(null); return keys;
    }

    private Cipher biometricCipher(JSONObject record) throws Exception {
        KeyStore keys = keys();
        if (!keys.containsAlias(BIO_ALIAS)) throw new IllegalStateException("Biometric key unavailable");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, (SecretKey) keys.getKey(BIO_ALIAS, null),
            new GCMParameterSpec(128, CredentialVault.decode(record.getString("bioIv"))));
        return cipher;
    }

    private JSObject status(JSONObject record) {
        long now = SystemClock.elapsedRealtime();
        long remaining = foreground ? session.remaining(now) : 0;
        boolean valid = remaining > 0;
        boolean enabled = false;
        if (record.has("bioCiphertext") && available()) {
            try { biometricCipher(record); enabled = true; } catch (Exception ignored) { /* PIN remains available. */ }
        }
        return new JSObject().put("pinSet", record.has("verifier"))
            .put("biometricAvailable", available()).put("biometricEnabled", enabled)
            .put("lockedForSeconds", PinSecurity.remainingSeconds(record.optLong("lockedUntilElapsed"), now))
            .put("sessionValid", valid).put("sessionRemainingMillis", remaining);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        execute(call, (vault, epoch) -> call.resolve(status(vault.read())));
    }

    @PluginMethod
    public void lock(PluginCall call) { endSession(); call.resolve(); }

    @PluginMethod
    public void launchApp(PluginCall call) {
        long epoch = generation.get();
        String target = call.getString("packageName");
        getActivity().runOnUiThread(() -> {
            try {
                // Resolution and the final authorization check run together on the UI
                // thread, where foreground lifecycle transitions are also delivered.
                Intent intent = AppLauncher.resolve(getContext(), target);
                if (intent == null || (ProtectionPreferences.store(getContext()).contains("packages")
                    && !ProtectionPreferences.packages(getContext()).contains(target))) {
                    endSession();
                    call.reject("This app is no longer available. Refresh your app selection.", "APP_UNAVAILABLE");
                    return;
                }
                if (!foreground || generation.get() != epoch
                    || !session.consume(target, SystemClock.elapsedRealtime())) {
                    endSession();
                    call.reject("Verify this app again before opening it.", "SESSION_ENDED");
                    return;
                }
                // Approval is already consumed before Android receives the intent.
                if (!ProtectionService.approveLaunch(target)) {
                    endSession();
                    call.reject("The protected app changed. Verify the current app again.", "SESSION_ENDED"); return;
                }
                getActivity().startActivity(intent);
                endSession();
                call.resolve();
            } catch (RuntimeException unavailable) {
                ProtectionService.launchFailed();
                endSession();
                call.reject("Android could not open this app. Verify again to retry.", "APP_UNAVAILABLE");
            }
        });
    }

    private boolean requireTarget(PluginCall call) {
        session.clear();
        String target = call.getString("packageName");
        if (AppLauncher.resolve(getContext(), target) != null
            && (!ProtectionPreferences.store(getContext()).contains("packages")
                || ProtectionPreferences.packages(getContext()).contains(target))) return true;
        call.reject("This app is no longer available. Refresh your app selection.", "APP_UNAVAILABLE");
        return false;
    }

    @PluginMethod
    public void enrollPin(PluginCall call) {
        execute(call, (vault, epoch) -> {
            session.clear();
            String pin = call.getString("pin");
            if (!PinSecurity.valid(pin)) { call.reject("Enter a six-digit PIN.", "INVALID_PIN"); return; }
            JSONObject record = vault.enroll(pin);
            requireForeground(epoch);
            call.resolve(status(record));
        });
    }

    @PluginMethod
    public void verifyPin(PluginCall call) {
        execute(call, (vault, epoch) -> {
            if (!requireTarget(call)) return;
            JSONObject record = vault.read();
            boolean locked = PinSecurity.remainingSeconds(record.optLong("lockedUntilElapsed"), SystemClock.elapsedRealtime()) > 0;
            boolean verified = vault.check(record, call.getString("pin"));
            requireForeground(epoch);
            recordHistory(call, "PIN", verified ? "verified" : locked ? "locked-out" : "failed");
            if (verified) session.grant(call.getString("packageName"), SystemClock.elapsedRealtime());
            requireForeground(epoch);
            JSObject result = status(record);
            result.put("verified", verified).put("expiresInSeconds", verified ? 30 : 0);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void changePin(PluginCall call) {
        execute(call, (vault, epoch) -> {
            String next = call.getString("newPin");
            if (!PinSecurity.valid(next)) { call.reject("Enter a six-digit PIN.", "INVALID_PIN"); return; }
            JSONObject record = vault.read();
            session.clear();
            if (!vault.check(record, call.getString("currentPin"))) {
                call.resolve(status(record).put("changed", false)); return;
            }
            requireForeground(epoch);
            vault.updatePin(record, next);
            call.resolve(status(record).put("changed", true));
        });
    }

    @PluginMethod
    public void disableBiometric(PluginCall call) {
        execute(call, (vault, epoch) -> {
            session.clear();
            JSONObject record = vault.read();
            if (!vault.check(record, call.getString("pin"))) {
                call.resolve(status(record).put("changed", false)); return;
            }
            requireForeground(epoch);
            record.remove("bioIv"); record.remove("bioCiphertext"); record.remove("bioMarker");
            vault.save(record);
            keys().deleteEntry(BIO_ALIAS);
            call.resolve(status(record).put("changed", true));
        });
    }

    @PluginMethod
    public void enableBiometric(PluginCall call) {
        execute(call, (vault, epoch) -> {
            session.clear();
            JSONObject record = vault.read();
            if (!vault.check(record, call.getString("pin"))) {
                call.resolve(status(record).put("changed", false)); return;
            }
            if (!available()) { call.reject("Enroll a fingerprint or strong biometric in Android Settings first.", "BIOMETRIC_UNAVAILABLE"); return; }
            requireForeground(epoch);
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(BIO_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setUserAuthenticationRequired(true).setInvalidatedByBiometricEnrollment(true);
            if (Build.VERSION.SDK_INT >= 30) spec.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
            else spec.setUserAuthenticationValidityDurationSeconds(-1);
            generator.init(spec.build());
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, generator.generateKey());
            showPrompt(call, vault, record, cipher, true, epoch);
        });
    }

    @PluginMethod
    public void verifyBiometric(PluginCall call) {
        execute(call, (vault, epoch) -> {
            if (!requireTarget(call)) return;
            JSONObject record = vault.read();
            if (!status(record).getBoolean("biometricEnabled", false)) {
                recordHistory(call, "fingerprint", "unavailable");
                call.reject("Fingerprint is unavailable. Use your PIN or enable it again with your PIN.", "BIOMETRIC_UNAVAILABLE"); return;
            }
            showPrompt(call, vault, record, biometricCipher(record), false, epoch);
        });
    }

    private void showPrompt(PluginCall call, CredentialVault vault, JSONObject record, Cipher cipher, boolean enroll, long epoch) {
        prompting = true;
        promptEnrollment = enroll;
        promptCall = call;
        getActivity().runOnUiThread(() -> {
            try {
                requireForeground(epoch);
                prompt = new BiometricPrompt(getActivity(), ContextCompat.getMainExecutor(getContext()),
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationError(int errorCode, CharSequence message) {
                            if (promptCall != call) return;
                            promptCall = null; prompting = false; prompt = null; session.clear();
                            String code = errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON && !enroll ? "BIOMETRIC_USE_PIN"
                                : errorCode == BiometricPrompt.ERROR_LOCKOUT || errorCode == BiometricPrompt.ERROR_LOCKOUT_PERMANENT
                                    ? "BIOMETRIC_LOCKOUT" : errorCode == BiometricPrompt.ERROR_CANCELED || errorCode == BiometricPrompt.ERROR_USER_CANCELED
                                        ? "BIOMETRIC_CANCELED" : "BIOMETRIC_UNAVAILABLE";
                            if (!enroll) recordHistory(call, "fingerprint", "BIOMETRIC_LOCKOUT".equals(code) ? "locked-out"
                                : "BIOMETRIC_UNAVAILABLE".equals(code) ? "unavailable" : "canceled");
                            call.reject("Fingerprint verification ended. Use your PIN or try again.", code);
                        }

                        @Override
                        public void onAuthenticationFailed() {
                            if (promptCall != call || !foreground || generation.get() != epoch) return;
                            session.clear();
                            if (!enroll) recordHistory(call, "fingerprint", "failed");
                            notifyListeners("biometricFailed", new JSObject());
                        }

                        @Override
                        public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                            if (promptCall != call) return;
                            worker.execute(() -> {
                                try {
                                    requireForeground(epoch);
                                    if (promptCall != call || result.getCryptoObject() == null
                                        || result.getCryptoObject().getCipher() == null) throw new IllegalStateException("Missing biometric proof");
                                    Cipher authorized = result.getCryptoObject().getCipher();
                                    if (enroll) {
                                        byte[] marker = new byte[32]; new SecureRandom().nextBytes(marker);
                                        record.put("bioMarker", CredentialVault.encode(marker))
                                            .put("bioIv", CredentialVault.encode(authorized.getIV()))
                                            .put("bioCiphertext", CredentialVault.encode(authorized.doFinal(marker)));
                                        requireForeground(epoch);
                                        vault.save(record);
                                    } else {
                                        byte[] marker = authorized.doFinal(CredentialVault.decode(record.getString("bioCiphertext")));
                                        if (!MessageDigest.isEqual(marker, CredentialVault.decode(record.getString("bioMarker"))))
                                            throw new IllegalStateException("Invalid biometric proof");
                                        session.grant(call.getString("packageName"), SystemClock.elapsedRealtime());
                                    }
                                    requireForeground(epoch);
                                    JSObject response = status(record);
                                    if (!enroll) recordHistory(call, "fingerprint", "verified");
                                    response.put(enroll ? "changed" : "verified", true).put("expiresInSeconds", enroll ? 0 : 30);
                                    promptCall = null; prompting = false; prompt = null;
                                    call.resolve(response);
                                } catch (Exception ignored) {
                                    session.clear();
                                    if (promptCall == call) {
                                        promptCall = null; prompting = false; prompt = null;
                                        if (!enroll) recordHistory(call, "fingerprint", "unavailable");
                                        call.reject("Fingerprint proof unavailable. Use your PIN.", "BIOMETRIC_UNAVAILABLE");
                                    }
                                }
                            });
                        }
                    });
                BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(enroll ? "Enable GhostAuth fingerprint" : "GhostAuth")
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    .setNegativeButtonText(enroll ? "Cancel" : "Use PIN instead").build();
                prompt.authenticate(info, new BiometricPrompt.CryptoObject(cipher));
            } catch (Exception ignored) {
                if (promptCall == call) {
                    promptCall = null; prompting = false; prompt = null;
                    if (!enroll) recordHistory(call, "fingerprint", "unavailable");
                    call.reject("Fingerprint unavailable. Use your PIN.", "BIOMETRIC_UNAVAILABLE");
                }
            }
        });
    }

    private void endSession() {
        generation.incrementAndGet(); session.clear();
        PluginCall pending = promptCall;
        if (pending != null && !promptEnrollment) recordHistory(pending, "fingerprint", "canceled");
        promptCall = null; prompting = false;
        BiometricPrompt active = prompt; prompt = null;
        if (active != null) getActivity().runOnUiThread(active::cancelAuthentication);
        if (pending != null) pending.reject("Authentication canceled because the session ended.", "SESSION_ENDED");
        notifyListeners("sessionEnded", new JSObject().put("active", foreground));
    }

    @Override
    protected void handleOnStop() { foreground = false; endSession(); }

    @Override
    protected void handleOnResume() {
        foreground = true;
        notifyListeners("sessionEnded", new JSObject().put("active", true));
    }

    @Override
    protected void handleOnDestroy() { endSession(); worker.shutdown(); }
}
