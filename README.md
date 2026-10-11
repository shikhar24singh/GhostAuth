# GhostAuth

GhostAuth is an Android personal-security research prototype with a React + TypeScript interface built from its Figma design. It includes 33 screens, the approved fingerprint mark, bundled Arimo/Cousine fonts, app and privacy preferences, and a Capacitor Android build with native PIN and biometric verification.

**Current Android version: 0.2.0.** Native authentication is implemented; protecting other apps, Android permission flows, risk scoring and behavior learning remain previews. Physical-device authentication validation is pending.

[Figma design](https://www.figma.com/design/TM015DhFupKb6VtwjUoUFo/GhostNet?node-id=10-1645) · [Android setup and authentication details](android/README.md)

## What works today

| Feature | Browser preview | Installed Android APK |
| --- | --- | --- |
| Screens and navigation | 33 screens, hash navigation and responsive layouts | Same interface with native Back handling and system insets |
| PIN verification | Simulated; a fresh demo uses `123456` | Your own six-digit PIN, verified by native code; no default PIN |
| Fingerprint verification | Explicit simulated results | Android biometric prompt using an enrolled strong biometric, with PIN fallback |
| PIN and fingerprint settings | Changes apply to the demo session | Changing the PIN or enabling/disabling fingerprint requires the current PIN |
| Saved preferences | App selection and privacy choices persist when explicitly saved | Same choices persist separately in the installed app |
| Verification lifetime | Temporary frontend state | At most 30 seconds; approval clears on backgrounding, reload or restart |
| App protection, permissions and behavior learning | Simulated | Still simulated; does not block or launch other apps |

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

In the browser, PIN/fingerprint settings, verification, permissions, restrictions and activity are held in memory. Reloading resets the demo PIN to `123456`; app and privacy preferences remain saved. Storage is separate for each browser, device and origin.

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

Recorded checks include 27 Node tests, four Java security tests, production and APK builds, APK signature/download verification, and mobile UI checks across 33 routes at five viewport sizes. Android authentication UI checks use a mocked Capacitor bridge; they do not validate a physical Android Keystore or biometric sensor.

See [APK build results](android/build-validation.json), [native authentication checks](android/native-auth-validation.json) and [Android frontend review](design/figma/android-review.md). Actual PIN persistence, reboot lockout, biometric enrollment invalidation and system prompt behavior still need review on a physical phone.

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

Native authentication provides local identity checks inside GhostAuth. A production app still needs installed-app discovery, real Android permission flows, protection/app-launch services, authoritative risk decisions, consent-based behavior learning, durable security-event storage and a recovery design.
