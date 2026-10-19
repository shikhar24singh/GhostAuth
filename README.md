# GhostAuth

GhostAuth is an Android personal-security research prototype with a React + TypeScript interface built from its Figma design. It includes 34 screens, the approved fingerprint mark, bundled Arimo/Cousine fonts, app and privacy preferences, and a Capacitor Android build with native PIN and biometric verification.

**Current Android version: 0.7.0.** Native authentication, installed-app discovery with actual app icons, verified app launching, persistent local security history, and usage/notification permission status are implemented. An experimental accessibility service now covers selected apps when they open. Risk scoring and behavior learning remain previews. The user reports the 0.3.0 catalog/preferences, permission settings, PIN persistence/reboot lockout and biometric prompt/enrollment review groups passed on a phone; the user also reports the three proposed 0.5.1 Presto fingerprint/protection review groups passed on 2026-10-13. Icon display and additional detailed scenarios remain unreported.

[Figma design](https://www.figma.com/design/TM015DhFupKb6VtwjUoUFo/GhostNet?node-id=10-1645) · [Android setup and authentication details](android/README.md)

## What works today

| Feature | Browser preview | Installed Android APK |
| --- | --- | --- |
| Screens and navigation | 34 screens, hash navigation and responsive layouts | Same interface with native Back handling and system insets |
| PIN verification | Simulated; a fresh demo uses `123456` | Your own six-digit PIN, verified by native code; no default PIN |
| Fingerprint verification | Explicit simulated results | Enabled fingerprint starts automatically when opening a protected app; PIN is the secondary option |
| PIN and fingerprint settings | Changes apply to the demo session | Changing the PIN or enabling/disabling fingerprint requires the current PIN |
| Saved preferences | App selection and privacy choices persist when explicitly saved | Same choices persist separately in the installed app |
| App selection | Four sample apps | Launchable apps with Android-provided icons in the current profile, selected and saved by package name |
| Permissions | Simulated grants/revocations | Actual usage-access and notification status; buttons open Android Settings and returning refreshes status |
| Verification lifetime | Temporary frontend state | At most 30 seconds, bound to one package and consumed at launch; clears on backgrounding, reload or restart |
| Dark mode | Saved browser appearance | Settings toggle with native persistence, dark screens/protection shield and matching Android bar icons |
| Security history | In-memory sample events | Latest 100 real app-verification outcomes saved encrypted on-device; pause recording or clear history |
| Verified app launching | Handoff preview | Immediately opens the verified package using a single-use native approval |
| App protection | Simulated | User-enabled accessibility service covers selected apps and requires verification; subject to Android/OEM limitations |
| Motion research | Android only | Explicit opt-in foreground motion summaries, encrypted local diagnostics, pause and clear controls |
| Behavior learning | Simulated | Not implemented |

## Run the browser preview

Requirements: Node.js 24 and npm. No API credentials are required.

```sh
git clone https://github.com/shikhar24singh/GhostAuth.git
cd GhostAuth
npm ci
npm run dev
```

Open the printed URL, usually `http://127.0.0.1:5173`.

Start with **Set up GhostAuth** to review privacy choices, create a demo PIN, try fingerprint enrollment and select apps. You can also open `/#home` directly; the initial browser demo PIN is `123456`.

- **Apps:** open protection details and identity checks; search, select or deselect sample apps.
- **Activity:** review sample security events and new verification attempts.
- **Settings:** manage demo PIN/fingerprint options, save privacy choices and review permission previews.
- **Restricted sessions:** identity checks cannot override a simulated restriction. **Start a new demo session** clears it explicitly.

App and privacy choices persist only after **Save selection** or **Save preferences**. Unsaved edits are discarded on reload. Resetting saved preferences restores those choices without replacing the PIN or bypassing an active restriction. Unavailable storage produces an error and a save retry option.

Android starts with no selected apps. Sample-app choices from older Android builds are not migrated into package selections; choose installed apps once after updating. Existing privacy choices and native PIN/biometric credentials remain intact. Android discovers launchable apps only in the current profile, excludes GhostAuth, and does not read app content or usage history. Usage access and notifications are optional for local identity checks. Protection requires explicit consent in GhostAuth and enabling **GhostAuth protection** in Android Accessibility. Usage access and notifications alone do not activate it. Native selection and consent persist across process restarts; launch and foreground approvals never persist. Android Settings, launchers and the active keyboard cannot be selected for protection.

Android **Activity** retains the latest 100 app-verification entries with package/label, local date/time, PIN or fingerprint method and outcome (verified, failed, canceled, locked out or unavailable). Turn **Security history** off in Privacy & data and save to pause new recording while retaining old entries. Use **Activity → Clear history** to delete the log; this preserves credentials, selections and recording consent. Resetting preferences restores default recording consent but keeps the log. Previous privacy consent is retained on upgrade, and no older in-memory history is invented or migrated. History never restores authorization.

**Settings → Dark mode** changes appearance immediately and saves it on the device. Light remains the default. The appearance preference is independent of app/privacy preferences and survives their reset; it does not change credentials or history. Android stores the choice natively so its protection shield, app theme and bar icons follow it after reopening. Browser appearance is stored separately.

In the browser, PIN/fingerprint settings, verification, permissions, restrictions and activity are held in memory. Reloading resets the demo PIN to `123456`; app and privacy preferences remain saved. Storage is separate for each browser, device and origin.

## Motion collection pilot

Version 0.7.0 adds **Settings → Motion research**, off on install and upgrade. Read the disclosure and choose **Agree and enable** to enroll. The saved Movement signals preference additionally gates motion capture. Native movement consent is authoritative across reload; Behavior signals remains a touch-collection preview.

The pilot requests accelerometer/gyroscope readings at 20 Hz only while GhostAuth is resumed and focused during a fingerprint app check, for at most 10 seconds. Capture stops on focus loss, backgrounding or screen lock, without restarting a partial window. Fingerprint and app launch never wait for a sample. PIN flows retain outcome diagnostics only, with no PIN input/timing or motion capture. No touch, app content, cross-app gestures or usage history is collected. Raw motion stays in memory; only versioned magnitude summaries and quality metadata are saved. A native matching verification is required for an eligible candidate; failed/canceled checks retain diagnostics without behavioral features.

Research has its own encrypted, backup-excluded native file/key and I/O executor. Keep at most 500 summaries, 10 MiB or 7 days, pruning on the next research read/write. Pause retains existing summaries, Clear research data removes summaries/pending buffers while preserving consent, and resetting preferences pauses research while restoring default movement choices. PIN, fingerprint, protection selection and security history are independent. Storage failures stop collection without changing native verification. No automatic upload/export, model training or behavioral access decision is included.

Use the [phone checklist](android/device-review.md) to measure useful-window coverage, sensor gaps and prompt lifecycle behavior. Short or missing data is shown explicitly; an empty usable count does not mean low risk. Public HMOG data has not been integrated.

## Build and install on Android

Requirements:

- Node.js 24 and npm.
- Java 21.
- Android SDK Platform 36 and Build Tools 36.0.0.
- An Android device running API 24 or newer.

Install the dependencies with `npm ci`, configure `JAVA_HOME` and `ANDROID_HOME` (or `ANDROID_SDK_ROOT`), then run:

```sh
npm run android:apk
```

The script builds the frontend, syncs Capacitor, builds the debug APK, runs Android unit tests and lint, and writes:

```text
artifacts/GhostAuth-debug.apk
artifacts/GhostAuth-debug.apk.sha256
```

SDK/JDK tools, build caches and APKs are not included in Git. The build script can also discover locally installed portable tools under `.android-tools/`. The first Gradle build needs network access to download dependencies.

Copy the APK to your phone and open it, or install it through a configured USB debugging connection:

```sh
adb install -r artifacts/GhostAuth-debug.apk
```

The APK bundles its screens, fonts and branding and can open without the frontend server or Wi-Fi. It is a debug preview; release signing and store distribution are separate work.

### Download over Wi-Fi

On Windows, bind the APK download server to your computer’s Wi-Fi IPv4 address:

```powershell
$env:APK_HOST = 'YOUR_WIFI_IPV4'
npm run android:serve
```

Connect the phone to the same Wi-Fi and open the printed HTTP URL in the full Brave or Chrome app:

```text
http://YOUR_WIFI_IPV4:4174/GhostAuth-auth-preview.apk
```

Keep the server running until the download finishes. It serves only the APK and supports resumed downloads. If an embedded browser stays on **Downloading** after showing the full file size, check Downloads/Files for a completed APK, cancel the stuck attempt and retry the fresh URL in the full browser.

### Native authentication

Create and confirm your own six-digit PIN on first setup. Previous browser/demo PINs are not migrated into native credentials.

- A salted PIN verifier and retry counters are encrypted using an Android Keystore key; the PIN is not persisted in frontend or native storage.
- Five wrong PIN attempts impose a 30-second delay. Further failures increase the delay up to one hour; restarting or resetting preferences cannot clear it.
- Enabling fingerprint requires the existing PIN and approval of Android’s biometric prompt. Biometric enrollment changes require enabling fingerprint again with the PIN.
- Canceled prompts, unavailable biometrics, stale callbacks and unavailable native authentication cannot grant access.
- Native verification approval lasts at most 30 seconds and ends when GhostAuth enters the background, reloads or restarts.

There is no forgotten-PIN recovery bypass. Clearing app data or uninstalling removes the native credentials and app settings. See [Android authentication details](android/README.md#native-authentication) for storage, retry policy and biometric key behavior.

## Commands and checks

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the local development server |
| `npm test` | Run the state, preferences, Back handling and APK download tests |
| `npm run build` | Type-check and produce the frontend in `dist/` |
| `npm run preview` | Serve the production frontend locally |
| `npm run android:sync` | Build the frontend and sync Android assets/plugins |
| `npm run android:open` | Open the Android project in Android Studio |
| `npm run android:apk` | Build and validate the Android debug APK |
| `npm run android:serve` | Serve the generated APK for phone downloads |

Optional browser checks require an available Playwright installation and Chromium or Chrome:

```sh
npm run build
node tests/mobile-browser.cjs
```

Set `PLAYWRIGHT_MODULE` to the package path if Playwright is installed outside the project. Optionally set `CHROME_EXECUTABLE` to an installed Chrome executable. The checks use an isolated headless browser and write screenshots/reports to the ignored `tmp/mobile-qa/` directory.

The test suite includes 42 Node tests and 28 JVM security tests (plus the generated example test), production and APK builds, APK download checks, and mobile UI checks across 34 routes at five viewport sizes. Version 0.5.1 also checks automatic fingerprint startup, the minimal lock screen, nonmatch errors, PIN fallback, direct launch and canceled/replaced biometric results. Version 0.6.1 adds saved dark mode, native theme/bar styling and browser checks for restart, reset, failed saves and dark fingerprint handoff. Version 0.6.0 adds history validation, encryption/retention policy tests and UI checks for recording, restart, privacy consent, deletion, stale reads and storage failures. Android authentication, device integration, launch, protection, history and research UI checks use a mocked Capacitor bridge; they do not validate a physical Android Keystore, biometric sensor, installed-app catalog, Settings app, actual app launch or accessibility overlays. The full 0.7.0 browser review passed 69 checks with no uncaught errors, including 47 mocked native bridge checks. The six research UI checks cover explicit consent, reload, PIN exclusion/short-window diagnostics, movement gating, pause/clear and stale snapshots, storage errors and reset. JVM research tests cover streaming quality/statistics, retention boundaries and AES-GCM tampering/domain separation; physical lifecycle, sensor delivery, Android Keystore/filesystem and launch-latency measurements remain pending.

See [APK build results](android/build-validation.json), [earlier automated native authentication checks](android/native-auth-validation.json) and [Android frontend review](design/figma/android-review.md). Phone review of PIN persistence, reboot lockout, biometric prompts and enrollment invalidation passed according to the user's report; additional scenario coverage is tracked in the phone checklist.

See the [device-integration checks](android/device-integration-validation.json) and use the [phone review checklist](android/device-review.md) for physical validation. Device integration follows Android's [package visibility declarations](https://developer.android.com/training/package-visibility/declaring) and [usage access API](https://developer.android.com/reference/android/app/usage/UsageStatsManager).

For a focused native-bridge UI review, run `node tests/mobile-browser.cjs --native-only` with the same Playwright/Chrome configuration.

### View the browser preview on a phone

```sh
npm run build
npm run preview -- --host YOUR_WIFI_IPV4 --port 4173 --strictPort
```

Open the printed HTTP URL from a phone on the same Wi-Fi. This serves the browser demo; native authentication is available only in the installed APK.

## Project structure

| Path | Purpose |
| --- | --- |
| `src/mobile/` | Screen UI, routes, state, saved preferences and responsive styles |
| `src/native/` | Android Back handling and native authentication bridge/lifecycle logic |
| `src/native/useNativeDevice.ts` | Installed-app catalog, real permission status, Settings navigation and foreground refresh |
| `src/components/Modal.tsx` | Shared confirmation dialog and focus handling |
| `android/app/src/main/java/com/ghostauth/app/` | Native plugin, encrypted credential vault and PIN security policy |
| `android/app/src/test/` | Android JVM security-policy tests |
| `capacitor.config.json` | Native package identity, system bars and logging configuration |
| `scripts/` | Android build, launcher assets and APK download server |
| `public/assets/` and `public/fonts/` | Approved brand mark, bundled fonts and font licenses |
| `design/figma/` | Design contexts, prototype maps, construction history and validation records |
| `tests/` | State tests and browser/native-bridge integration checks |

The earlier dashboard fixtures and tests remain in `src/lib/` and `tests/demo-state.test.ts`; the current entry point renders the mobile interface.

## Next integration work

The next algorithm milestone is the [behavioral data collection pilot](design/behavior-collection-plan.md): establish whether normal fingerprint-first verification provides usable consented signals, then collect a GhostAuth-specific dataset before training. Version 0.7.0 implements the initial opt-in foreground motion collector and local diagnostics; physical signal coverage and a trained model remain pending. HMOG remains an optional research reference. Initial scoring will require separate evaluation and will leave native fingerprint/PIN checks mandatory.

Native authentication provides local identity checks inside GhostAuth. Installed-app discovery and usage/notification Settings integration are in place. All four summary phone-review groups have passed according to the user's reports. Version 0.4.0 launches the selected package after PIN or biometric verification. Version 0.5.0 adds a user-enabled accessibility service for those external openings. Version 0.5.1 makes enabled fingerprint the primary check and opens the app immediately after verification. The user reports the three proposed 0.5.1 Presto phone-review groups passed on 2026-10-13: automatic fingerprint and direct launch with wrong-scan denial; PIN fallback, cancellation, re-entry and screen locking; notifications/Recents and opening after swiping GhostAuth away. Additional detailed/OEM cases remain tracked in the phone checklist. Version 0.6.0 implements persistent local security history. Phone review of app-check outcomes, restart persistence, recording pause, Clear history and retained credentials remains outstanding, alongside the 0.6.1 dark-mode review. Authoritative risk decisions, consent-based behavior learning and a recovery design remain future work.
