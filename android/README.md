# GhostAuth Android preview

This Capacitor 8 project packages the frontend into an installable debug APK. Its screens, fonts and approved fingerprint mark are bundled in the app; opening it does not require the Vite server or Wi-Fi. The Android application ID is `com.ghostauth.app`, version `0.7.0`, minimum API 24 and target API 36.

Android PIN and biometric checks use native authentication. App selection uses installed launchable apps, and usage access/notification status is read from Android. Selected apps can be opened after native verification. An experimental user-enabled accessibility service covers selected apps opening externally. Behavior learning and risk decisions remain previews. Browser preferences and installed-app preferences are separate. Browser authentication remains a demo; native authentication runs only in the installed APK.

## Installed apps and permissions

The local `GhostDevice` plugin queries enabled, exported launcher activities in the current Android profile, deduplicates by package name, and excludes GhostAuth. The manifest declares a scoped `MAIN`/`LAUNCHER` query; it does not request broad `QUERY_ALL_PACKAGES` visibility. Apps without launcher activities and apps in other profiles are outside this catalog.

Version 0.3.1 also reads each app's icon using Android's `PackageManager`, draws adaptive/vector/bitmap drawables into a 96-pixel PNG, and supplies it to the WebView as a local data URL. App selection and the home list display these icons at 32 CSS pixels. Icons require no network requests and are not stored in preferences. A missing or unreadable icon keeps a folder fallback without removing the app. The frontend accepts only bounded PNG data URLs, so icon fields cannot load external URLs. See [PackageManager's icon API](https://developer.android.com/reference/android/content/pm/PackageManager#getApplicationIcon(android.content.pm.ApplicationInfo)).

Android selection starts empty. After the first explicit save or protection enable, package selections are stored natively in `ghostauth_protection` and are authoritative on reload. The frontend preference record retains privacy choices and a selection copy for older builds. Existing 0.4.0 selections migrate when protection is enabled or the selection is saved. Legacy sample-app choices are not migrated; saved privacy choices and native authentication credentials are retained. Before the first native save, privacy choices are read from the previous preference record without rewriting it. Native reset explicitly saves default privacy choices and an empty selection, so reload cannot restore the legacy choices. Missing apps are removed from the available selection on refresh. Reload, returning to the foreground and **Refresh Android status** refresh the catalog and permission flags. Failed or malformed responses show a retry error, clear displayed verification, and never substitute sample apps or simulated grants.

Usage access is checked through `AppOpsManager`; the settings button opens Android Usage Access settings, with a generic fallback for devices that do not support the package-specific screen. Notifications use `NotificationManager.areNotificationsEnabled()` and open GhostAuth's notification settings (app details on API 24–25). The device-status plugin reads no usage events, app content or motion signals, and this build does not send protection alerts. Optional foreground motion research is separate and described below. Permission changes invalidate displayed verification.

Protection is off until the user gives explicit consent and enables **GhostAuth protection** in Android Accessibility. Status is active only while consent is enabled and the service is connected without a reported interruption. Usage access and notifications are optional. No separate overlay permission or polling foreground service is required.

See Android's [package visibility declarations](https://developer.android.com/training/package-visibility/declaring), [UsageStatsManager](https://developer.android.com/reference/android/app/usage/UsageStatsManager) and [Settings API](https://developer.android.com/reference/android/provider/Settings). The [device review checklist](device-review.md) covers physical validation.

## Verified app launching

Choose a saved app and tap **Verify & open app**, or open a protected app externally with the accessibility service active. When fingerprint is enabled, GhostAuth automatically starts the secure Android biometric prompt over a minimal screen containing its mark, a fingerprint reader/retry control, and **Use PIN instead** at the bottom right. A successful fingerprint or fallback PIN immediately launches the exact package; no success screen or extra Open tap is needed. When fingerprint is unavailable, disabled or invalidated by new enrollment, the check starts with PIN. Android controls the system prompt appearance and sensor placement. Version 0.4.0 binds the native approval to the package supplied to the authentication call. A different package, expired approval, or background/restart cannot use it. The approval is kept only in memory and lasts at most 30 seconds.

The native `GhostAuth.launchApp` method resolves an enabled, exported `MAIN/LAUNCHER` activity in the current profile, then checks foreground state, session generation, deadline and exact package on the Android UI thread immediately before calling `startActivity`. Every launch attempt consumes approval; missing, disabled or removed apps clear verification and show a retry message while the catalog refreshes. A successful launch returns GhostAuth to its app list, and returning requires fresh verification. Settings and credential operations never launch apps.

No additional permissions are required. Existing saved app selections, privacy preferences, PIN and fingerprint enrollment are retained when installing over the prior APK. Version 0.5.0 adds experimental protection for external openings when the accessibility service is active. See Android's [activity intent guide](https://developer.android.com/training/basics/intents/sending).

## Experimental protection service

1. Install 0.5.0 over the existing APK; retain PIN, fingerprint, privacy and selected packages.
2. Open **Permissions → Protection service**, read the disclosure and tap **Enable protection**.
3. In Android Accessibility, enable **GhostAuth protection**, then return to GhostAuth. Confirm status is **Active · Android accessibility service**.
4. Leave GhostAuth and open Presto normally. It should show a GhostAuth lock screen, then the existing PIN/fingerprint screen. Complete verification and tap **Open Presto**.

If Android reports a restricted setting for this sideloaded APK, review [Google's restricted-settings instructions](https://support.google.com/android/answer/12623953?hl=en): Settings → Apps → GhostAuth → More → Allow restricted settings, then return to Accessibility. The user must enable access manually; GhostAuth does not grant it itself.

The service listens only to `TYPE_WINDOW_STATE_CHANGED` package names. Both XML configurations disable screen-content retrieval and gestures; API 31+ explicitly declares that this is not an accessibility tool. It does not inspect accessibility nodes, event text, passwords or screenshots, nor send package events over the network. An opaque `TYPE_ACCESSIBILITY_OVERLAY` intercepts interaction with the blocked app. The service attempts to open GhostAuth automatically; if an OEM blocks that activity launch, **Verify in GhostAuth** on the shield retries through a user action. **Close app** returns to the home screen.

After native authentication, a package-bound launch is handed to the service with a five-second arrival allowance. Once that app is foreground, its approval lasts only until another package opens or the screen locks. The keyboard is ignored so typing does not repeatedly relock the app. Other system windows may conservatively require another verification. Changing selection, service interruption, reconnect or process restart clears all approvals. Launcher, Settings and keyboard packages are rejected as protective selections so service controls stay available.

This is an event-driven research guard, not an OS-level sandbox. App content can briefly appear before detection. Force-stop, disabled accessibility, missing events, OEM service suspension, split-screen/PiP and notification previews can bypass or limit protection. No guarantee is made for those paths. The interface reports disconnected/interrupted status rather than claiming active protection. Disabling in GhostAuth stops monitoring immediately; the user can also disable the service in Android Settings. Resetting preferences empties the native protection scope while retaining PIN and biometric credentials.

See Android's [accessibility service guide](https://developer.android.com/guide/topics/ui/accessibility/service), [accessibility overlay API](https://developer.android.com/reference/android/view/WindowManager.LayoutParams#TYPE_ACCESSIBILITY_OVERLAY) and [background activity rules](https://developer.android.com/guide/components/activities/secure-bal).

## Appearance

Version 0.6.1 adds **Settings → Dark mode** with immediate application and saved light/dark choices; upgrades default to light. The native ghostauth_appearance preference is authoritative, while a separate frontend cache applies the saved palette before React renders. The browser demo keeps its own appearance key. Resetting app/privacy preferences or clearing history keeps appearance and credentials intact. Failed native saves retain the previous mode and offer a retry through the toggle.

The WebView uses a dark palette, readable blue accents and light brand strokes across screens, dialogs and fingerprint verification. App icons retain their original colors. The protection service reads the same native setting for its opaque shield and fallback controls. Android uses DayNight resources, saved application night mode (API 31+) and AppCompat mode; the existing uiMode configuration handling avoids recreating the app when toggling. SystemBars updates icon style for the selected background. Android controls the biometric prompt and system splash appearance; these native surfaces need physical review. See [Android dark theme guidance](https://developer.android.com/develop/ui/views/theming/darktheme).

## Optional motion research

Version 0.7.0 adds the `GhostResearch` plugin and **Settings → Motion research**. Enrollment is off on install/upgrade and requires the separate disclosure; legacy privacy defaults never enroll a participant. Native research settings retain Movement signals consent and initialize it from the previous frontend choice once. Saving privacy updates this native gate. Resetting preferences pauses research, restores the default movement gate, and retains existing research summaries.

`ResearchCapture` owns sensors on the UI thread and keeps storage on a separate serialized executor. Native `verifyBiometric` starts a request-bound capture; terminal outcomes come from native proof verification. Only matching successful checks can retain eligible magnitude features. A nonmatch ends the sample conservatively, so a later retry cannot turn that sample into enrollment data. PIN app checks collect outcome diagnostics with zero motion; no PIN-pad, typing or credential timing is captured. This is an enrollment assumption, not independent study labeling or a trained identity model.

Request 20 Hz accelerometer/gyroscope delivery for at most 10 seconds while MainActivity is resumed and focused. Unregister on focus loss, pause, screen lock, cancellation, consent change or teardown; a focus interruption never resumes the same window. Missing sensors/registration failure are diagnostics. Native verification and app launch do not wait for research I/O or a minimum window. An eligible sensor window needs at least 2 seconds of valid contiguous readings with no gap over 250 ms. Stream magnitude mean, population standard deviation and RMS, sample count, measured rate/duration and maximum gap; no raw trace is persisted. These quality settings need physical validation and establish no identity accuracy.

The independent `research.v1` AtomicFile under noBackupFilesDir uses AES-256-GCM, key `ghostauth.research.v1` and research-specific authenticated data. It holds at most 500 session summaries and 10 MiB; expired entries (7 days) and future-dated records after clock rollback are removed on read/write. Entries retain a random session identifier, collection date, build, verification method/outcome and quality metadata; packages and credential values are not persisted. These metadata fields must be excluded from future model inputs. The bridge exposes aggregate counts/reasons and sensor availability only.

Settings/clear increment a native revision before queued I/O, discard pending buffers and prevent older queued records from repopulating cleared data. Pause retains entries. Clear preserves research consent; unreadable-store recovery defaults collection and movement permission to off. A storage failure latches collection off for the process until a successful explicit settings/clear action; it does not alter credentials or app launch approvals. Reloaded history/research never grants authorization. The frontend uses request generations to discard stale snapshots. No upload, export, background sensor service, additional manifest permission or accessibility capability is added.

See the [collection plan](../design/behavior-collection-plan.md) and [0.7.0 physical review](device-review.md). The feasibility dataset, volunteer labels, offline model pipeline and physical lifecycle/battery/launch-latency measurements remain outstanding.

## Persistent security history

Version 0.6.0 records real app-verification outcomes in native code: PIN matches/mismatches/lockout and fingerprint matches/nonmatches/cancellation/lockout/unavailability. Setup, PIN changes and biometric enrollment do not create app-check entries. A successful identity check is recorded as verification, independently of whether Android subsequently opens the app; history is never a launch approval. Canceled or late results cannot become an authorization through rehydration.

The latest 100 entries retain an increasing identifier, package, bounded app label, wall-clock timestamp, method and outcome. Labels remain readable after uninstall and packages distinguish equal labels. The UI uses the phone's local date/time, with newest recorded entries first even if its clock changes. No PIN values, biometric images, application content, risk scores or session tokens are stored.

The independent HistoryStore uses an AES-256-GCM key named ghostauth.history.v1, authenticated versioned data, and an AtomicFile under noBackupFilesDir. Writes sync before publication and are read back for verification. The history file/key are separate from the credential vault and biometric keys; backup/transfer exclusions remain enabled. [Android cryptography guidance](https://developer.android.com/privacy-and-security/cryptography) documents the AES/GCM algorithm used. JVM tests cover ciphertext tampering, wrong keys, fresh IVs, retention, validation, immutable entries and pause/clear policy; they do not exercise a physical Android Keystore or filesystem.

The first native history initialization adopts the previously saved Security history choice; subsequent loads use authoritative native consent. Turning recording off and saving pauses new entries and retains existing history. Clear history deletes entries, preserves normal recording consent and advances the write revision so older queued writes cannot restore cleared entries. An attempt after clear can create a new entry if recording stays enabled. Reset preferences restores recording defaults and empty app selection while retaining history and credentials. History settings and data never enroll credentials, change retry counters or approve an app.

Read/write failure is reported in Activity or Privacy & data without blocking authentication. Corrupted/unreadable history can be explicitly cleared to recover its storage; when consent cannot be read, recovery keeps recording off until explicitly enabled. A failed clear/settings operation offers retry. UI snapshots use request generations to avoid restoring history from an older refresh after clear. The browser demo still has in-memory sample history.

## Native authentication

Nonmatching biometric scans display an error and leave the system prompt available for retry; they never grant a launch approval. Android reports these scans through [onAuthenticationFailed](https://developer.android.com/reference/androidx/biometric/BiometricPrompt.AuthenticationCallback#onAuthenticationFailed()). Biometric cancellation and lockout show errors with retry/PIN options. The system prompt’s **Use PIN instead** opens the GhostAuth PIN form. Switching to PIN cancels the prompt and ignores any late result; it does not enroll, disable or replace the saved credential. A branded opaque shield covers the handoff, retaining Verify/Close controls only if Android blocks the Activity launch.


Create and confirm your own six-digit PIN on first setup. Android has no default PIN, and restarting or resetting preferences cannot replace an enrolled PIN. Changing it requires the current PIN. Forgotten PINs have no recovery bypass; clearing app data or uninstalling removes credentials and all settings.

The local `GhostAuth` Capacitor plugin keeps a random 32-byte salt and PBKDF2-HMAC-SHA256 verifier (600,000 iterations) in AES-256-GCM encrypted preferences, using a non-exportable Android Keystore key. Retry counters and biometric bindings share the authenticated encrypted record. PINs are never persisted in frontend preferences or native storage. Bridge logging is disabled, screenshots/app-switcher captures are blocked, and credentials are excluded from cloud backup and device transfer. Storage corruption or a missing key fails closed instead of silently reenrolling.

Five wrong PIN attempts impose a 30-second delay, doubling after each further group of five failures up to one hour. The delay uses the device's monotonic clock, survives process restarts and cannot be shortened by changing the clock. A reboot conservatively restarts the last imposed delay. The PIN checker runs on a serialized background executor.

Fingerprint enable/disable requires the PIN. Enabling also requires approving Android's biometric prompt. Supported strong biometrics authorize a per-use Keystore cipher via `BiometricPrompt.CryptoObject`; a successful callback alone is insufficient. GhostAuth never receives a fingerprint image. Biometric enrollment changes invalidate the key; use the PIN and enable again. Cancellation, missing hardware, no enrolled strong biometric or OS lockout leave PIN verification available. See the official [Android biometric authentication guide](https://developer.android.com/identity/sign-in/biometric-auth) and [Keystore key specifications](https://developer.android.com/reference/android/security/keystore/KeyGenParameterSpec).

Native access approval lasts at most 30 seconds and expires when the app enters the background, reloads or restarts. Late prompt callbacks cannot restore a revoked session. The frontend independently clears its display approval; the native plugin independently checks the deadline. The separate user-enabled protection service uses this verification when it detects a selected app opening.

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

Android displays its real system bars; the frontend's sample clock/battery row is hidden. Safe-area styles use Capacitor's injected inset variables with browser fallbacks. The native Back button dismisses an open dialog first, then navigates back, and exits at the initial screen. Settings offers a saved Dark mode toggle. Both appearances, launcher icon and launch screen use GhostAuth branding. App-data backup is disabled for this preview.

The core [System Bars documentation](https://capacitorjs.com/docs/apis/system-bars) and [App plugin documentation](https://capacitorjs.com/docs/apis/app) describe the native APIs used by this shell.

Phone review should cover installing/opening while offline, native PIN setup and verification after force-close/reopen, wrong PIN and lockout, PIN changes, enabling/canceling/verifying/disabling fingerprint, leaving and returning during verification, Back with a confirmation open, installed app names/selections, real usage/notification settings and portrait/landscape layouts. Build and mocked-bridge browser checks cannot substitute for a physical Android review. The user reports the three proposed 0.5.1 Presto phone-review groups passed on 2026-10-13, including direct fingerprint/PIN launching, wrong-scan denial, cancellation, re-entry, screen locking, notifications/Recents and opening after swiping GhostAuth away. Additional detailed scenarios, service interruption and other OEM behavior remain unreported.

See `build-validation.json` and `device-integration-validation.json` for the current build and native UI integration results. `native-auth-validation.json` and `native-shell-validation.json` retain earlier authentication/shell records. The user reports all four summary phone-review groups passed: catalog/preferences, usage access/notifications/Settings return, PIN persistence/reboot lockout, and biometric prompt/enrollment invalidation. Additional unreported scenarios remain listed in `device-review.md`. Phone model and Android version were not provided.
