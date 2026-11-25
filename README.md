# GhostAuth

GhostAuth is an Android personal-security research prototype. The Android app uses Flutter with the existing GhostAuth colors, typography and fingerprint mark. Android handles PIN and biometric checks, package-bound app opening, accessibility protection, encrypted security history, and consented motion capture.

The Flutter source targets **0.8.0** on Android API 24 and later. The preceding Capacitor release was **0.7.3**. The independent React browser preview remains available for simulated scenarios.

[Figma design](https://www.figma.com/design/TM015DhFupKb6VtwjUoUFo/GhostNet?node-id=10-1645) · [Android implementation and phone review](android/README.md)

## What the app includes

| Feature | Flutter Android app | Browser preview |
| --- | --- | --- |
| Identity verification | Six-digit PIN, native retry lockout, Android strong biometrics and PIN fallback | Simulated PIN and fingerprint |
| App selection and protection | Installed apps with package names and icons, explicit Accessibility consent, verified app opening | Sample apps and simulated permissions |
| Appearance and privacy | Saved light/dark palette, app selection and privacy preferences | Separate browser preferences |
| Activity | Latest 100 verification outcomes encrypted on device, with pause and clear controls | Sample events and simulated attempts |
| Motion research | Separately enrolled foreground capture, coverage and sensor statistics, pause and clear, five-second diagnostic | Android only |
| Behavioral model | [Offline evaluation pipeline](research/README.md). App opening requires PIN or fingerprint. | Simulated risk and restriction scenarios |

## Build and install on Android

Install [Flutter stable](https://docs.flutter.dev/install/manual), Java 21 and Android SDK Platform 36 with Build Tools 36.0.0. Set `JAVA_HOME` and `ANDROID_HOME` as needed. The build script also discovers a portable JDK, Android SDK and Flutter under `.android-tools/`. Set `FLUTTER_ROOT` if Flutter lives elsewhere and is absent from `PATH`.

```sh
npm run android:apk
```

The command builds the Android APK, runs Flutter analysis and tests, then runs the Android JVM tests and lint. First setup may need to download Flutter and Gradle dependencies and Android NDK 28.2.13676358. On Windows the build uses Android CLI to install the exact NDK into the selected SDK when it is missing. It writes `artifacts/GhostAuth-debug.apk` and its SHA-256 checksum after the checks pass. The APK bundles the Flutter UI and runs offline. To launch on a connected device during development, use `flutter run` from the repository root.

```sh
adb install -r artifacts/GhostAuth-debug.apk
```

For an in-place upgrade, use the same signing key as the previous installation. Android retains the PIN, encrypted vaults, security history, research summaries, protection settings and appearance under the same package ID. The first Flutter startup imports the old private privacy settings. Confirm these on the phone with the [upgrade checklist](android/README.md#flutter-migration-verification).

### Download over Wi-Fi

After producing the APK, set the APK server to your Wi-Fi IPv4 address and run it from the repository root.

```powershell
$env:APK_HOST = 'YOUR_WIFI_IPV4'
npm run android:serve
```

Open `http://YOUR_WIFI_IPV4:4174/GhostAuth-auth-preview.apk` in the phone's browser on the same network. Keep the server running until the download finishes. The server supports resuming interrupted downloads.

## Android verification and protection

- Create and confirm your own six-digit PIN. Android encrypts the salted verifier and retry counters with its Keystore. Five wrong PIN attempts impose a 30-second delay, rising to at most one hour after further failures.
- To change the PIN or toggle fingerprint, confirm the current PIN. Enabling fingerprint also requires a strong biometric enrolled in Android and approval of its prompt. An enrollment change can invalidate GhostAuth's key. An enabled fingerprint can still open selected apps if you forget your PIN.
- Select apps by package. Android Settings, launchers and the active keyboard stay available. Explicit GhostAuth consent and enabling **GhostAuth protection** in Android Accessibility are required to guard external openings. Usage access and notifications are optional.
- Verification is bound to one app for a maximum of 30 seconds. Approvals clear on backgrounding or restart. With active external protection, GhostAuth waits for Android to report the matched package before confirming handoff.
- Security history saves the latest 100 outcomes when recording is enabled. Pausing preserves existing entries. **Clear history** deletes them independently of credentials and app choices. **Dark mode** persists and also controls the Android shield.

The [device review](android/device-review.md) records earlier 0.7.x testing and the phone scenarios to repeat on Flutter.

## Motion research

**Settings → Motion research** requires separate opt-in and saved Movement signals consent. A fingerprint check may collect up to 10 seconds of foreground accelerometer and gyroscope readings at a requested 20 Hz. Capture stops when GhostAuth loses focus, pauses or is interrupted. Native verification and app opening proceed independently of sampling. PIN checks contribute outcome diagnostics only. Raw samples stay in memory. Eligible summaries require matching native verification and sufficient signal quality.

Research has an independent encrypted store. It retains up to 500 summaries, 10 MiB or seven days. Pause keeps prior summaries. Clear removes summaries and pending capture. Resetting saved preferences pauses research. No upload runs. **Open motion diagnostic** runs a separately confirmed five-second sensor delivery test. Results stay in memory and can be cleared or explicitly copied.

See the [collection plan](design/behavior-collection-plan.md), [Nothing Phone 2a pilot](android/motion-pilot.md), and [motion diagnostic protocol](android/motion-diagnostic.md). The first observation found zero eligible windows in 12 fingerprint checks. The offline model compares a distance baseline with Isolation Forest on time/session-disjoint study data. It has no trained physical-data model or active Android risk decision. The conference paper's HMOG results describe external research, and its LMS gateway and risk fusion remain proposals.

## Run the browser preview

The React browser demo uses Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Open the printed URL. Use **Set up GhostAuth** for a first run. The in-memory demo PIN for an existing preview session is `123456`. App and privacy choices are saved when explicitly applied. The browser can simulate verification, permissions, and a restricted session. Start a new demo session explicitly to clear a simulated restriction. Browser and Android data are separate.

Use `npm run build` to build the browser preview, `npm test` for its unit tests and `node tests/mobile-browser.cjs` for optional Playwright integration checks. Mocked Capacitor tests exercise the historical browser bridge. Flutter's tests and the Android phone checklist cover the new Android host.

## Project structure

| Path | Purpose |
| --- | --- |
| `lib/` | Flutter screens, state and Android platform channels |
| `test/` | Flutter controller and widget tests |
| `android/app/src/main/java/com/ghostauth/app/` | Android authentication, app protection, encrypted storage and sensor lifecycle |
| `android/app/src/test/` | JVM security and research tests |
| `src/mobile/` and `tests/` | Browser preview and its tests |
| `research/` | Offline data validation, model training and evaluation |
| `design/` and `public/` | Design references, collection plan, and shared brand assets |
