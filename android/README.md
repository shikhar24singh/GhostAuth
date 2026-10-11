# GhostAuth Android preview

This Capacitor 8 project packages the frontend into an installable debug APK. Its screens, fonts and approved fingerprint mark are bundled in the app; opening it does not require the Vite server or Wi-Fi. The Android application ID is `com.ghostauth.app`, version `0.2.0`, minimum API 24 and target API 36.

Android PIN and biometric checks now use native authentication. Permissions, app selection, behavior learning, risk decisions and opening/protecting other apps remain previews. Browser preferences and installed-app preferences are separate. Browser authentication remains a demo; native authentication runs only in the installed APK.

## Native authentication

Create and confirm your own six-digit PIN on first setup. Android has no default PIN, and restarting or resetting preferences cannot replace an enrolled PIN. Changing it requires the current PIN. Forgotten PINs have no recovery bypass; clearing app data or uninstalling removes credentials and all settings.

The local `GhostAuth` Capacitor plugin keeps a random 32-byte salt and PBKDF2-HMAC-SHA256 verifier (600,000 iterations) in AES-256-GCM encrypted preferences, using a non-exportable Android Keystore key. Retry counters and biometric bindings share the authenticated encrypted record. PINs are never persisted in frontend preferences or native storage. Bridge logging is disabled, screenshots/app-switcher captures are blocked, and credentials are excluded from cloud backup and device transfer. Storage corruption or a missing key fails closed instead of silently reenrolling.

Five wrong PIN attempts impose a 30-second delay, doubling after each further group of five failures up to one hour. The delay uses the device's monotonic clock, survives process restarts and cannot be shortened by changing the clock. A reboot conservatively restarts the last imposed delay. The PIN checker runs on a serialized background executor.

Fingerprint enable/disable requires the PIN. Enabling also requires approving Android's biometric prompt. Supported strong biometrics authorize a per-use Keystore cipher via `BiometricPrompt.CryptoObject`; a successful callback alone is insufficient. GhostAuth never receives a fingerprint image. Biometric enrollment changes invalidate the key; use the PIN and enable again. Cancellation, missing hardware, no enrolled strong biometric or OS lockout leave PIN verification available. See the official [Android biometric authentication guide](https://developer.android.com/identity/sign-in/biometric-auth) and [Keystore key specifications](https://developer.android.com/reference/android/security/keystore/KeyGenParameterSpec).

Native access approval lasts at most 30 seconds and expires when the app enters the background, reloads or restarts. Late prompt callbacks cannot restore a revoked session. The frontend independently clears its display approval; the native plugin independently checks the deadline. This implements local identity verification inside GhostAuth, not a service enforcing access to other apps.

## Build

Use Node.js 24, Java 21, Android SDK Platform 36 and Build Tools 36.0.0. Install dependencies with `npm ci`, then run from the repository root:

```sh
npm run android:apk
```

The command builds the frontend, syncs assets/plugins, runs Gradle `assembleDebug`, `:app:testDebugUnitTest` and `lintDebug`, and copies the result to `artifacts/GhostAuth-debug.apk` with a SHA-256 checksum. It uses `JAVA_HOME` and `ANDROID_HOME`/`ANDROID_SDK_ROOT`, or portable tools under `.android-tools/`. Gradle's wrapper downloads its pinned version on the first build. Build caches, generated web assets, local SDK settings and APKs are ignored by Git.

For Android Studio, open `android/` or run `npm run android:open`. After each frontend change, run `npm run android:sync` before building through the IDE.

The portable Windows tools used for this initial build are under `.android-tools/`: Microsoft OpenJDK 21, Google's command-line SDK tools, Platform 36 and Build Tools 36.0.0. These do not change system environment variables. For another computer, follow the [Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup) or install the [Android command-line tools](https://developer.android.com/studio#command-tools) and a [Java 21 JDK](https://learn.microsoft.com/en-us/java/openjdk/download).

## Install on a phone

Copy `artifacts/GhostAuth-debug.apk` to the Android phone and open it. If Android asks, allow installation from the browser or file manager used to open the APK. The debug signing key is for development; Play Store release signing is a separate step.

To download from this computer on the same Wi-Fi, bind the APK-only server to its Wi-Fi IPv4 address:

```powershell
$env:APK_HOST = 'YOUR_WIFI_IPV4'
npm run android:serve
```

Open the printed HTTP URL on the phone. The server serves only the generated APK, on port 4174 by default; keep it running until the download finishes. With a USB debugging connection, you can instead run `adb install -r artifacts/GhostAuth-debug.apk`.

The current download URL is `/GhostAuth-auth-preview.apk`; the earlier `/GhostAuth-preview.apk` and `/GhostAuth-debug.apk` URLs also work. The server supports resuming with byte ranges and closes each response explicitly. If a phone's embedded browser remains on **Downloading** after displaying the full file size, cancel that attempt and paste the fresh authentication preview URL directly into the full Brave or Chrome app. Check the browser's Downloads or the phone's Files app for a completed APK before downloading again. Install this version over the earlier preview to retain selected apps/privacy preferences; previous demo PINs were never saved, so native PIN setup is required.

## Native shell and review

Android displays its real system bars; the frontend's sample clock/battery row is hidden. Safe-area styles use Capacitor's injected inset variables with browser fallbacks. The native Back button dismisses an open dialog first, then navigates back, and exits at the initial screen. The light theme, launcher icon and launch screen use GhostAuth branding. App-data backup is disabled for this preview.

The core [System Bars documentation](https://capacitorjs.com/docs/apis/system-bars) and [App plugin documentation](https://capacitorjs.com/docs/apis/app) describe the native APIs used by this shell.

Phone review should cover installing/opening while offline, native PIN setup and verification after force-close/reopen, wrong PIN and lockout, PIN changes, enabling/canceling/verifying/disabling fingerprint, leaving and returning during verification, Back with a confirmation open, and portrait/landscape layouts. Build and mocked-bridge browser checks cannot substitute for a physical Android review. Actual app selection/permissions and protection services remain the next integration phase.

See `build-validation.json`, `native-auth-validation.json` and `native-shell-validation.json` for recorded build, security policy and UI integration results. Physical installation, Keystore operations and Android biometric prompt review are pending.
