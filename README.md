# GhostAuth frontend

React + TypeScript implementation of the GhostAuth mobile Figma design. It includes all 33 screens and preview panels, the original fingerprint mark, locally bundled Arimo/Cousine fonts, and working navigation and controls.

Design: [GhostAuth in Figma](https://www.figma.com/design/TM015DhFupKb6VtwjUoUFo/GhostNet?node-id=10-1645).

## Run locally

Use Node.js 24 and npm:

```sh
npm ci
npm run dev
```

Open the URL printed by Vite, usually `http://127.0.0.1:5173`. No environment variables or API credentials are required.

```sh
npm test          # State and access-transition tests
npm run build     # TypeScript checks and production output in dist/
npm run preview   # Serve the production build locally
```

## Android test APK

The Android 0.2.0 project packages the frontend with local assets, GhostAuth launcher branding, native Back-button handling and display insets. It adds a Keystore-protected PIN verifier, persistent retry delays, the Android biometric prompt and short-lived native access approval. Create your own PIN in the APK; **123456 applies only to the browser demo**. Changing a native PIN and enabling/disabling fingerprint require the existing PIN. Build it with `npm run android:apk`; the APK is written to `artifacts/GhostAuth-debug.apk`. Java 21 and Android SDK 36 are required. See [Android build and phone installation](android/README.md) for setup, commands and preview boundaries.

## Try the frontend

Start with **Set up GhostAuth**. Review privacy choices, create and confirm a six-digit demo PIN, try fingerprint enrollment, and choose apps to protect. You can skip onboarding by opening `/#home`; the initial demo PIN is **123456**.

- **Apps:** open protection details and preview identity verification. Search, select or deselect apps with **Choose apps**. Saving an empty selection shows the empty state.
- **Activity:** view sample events and new verification attempts. Open the sample restricted event and choose **Preview restricted session** to try a blocked session.
- **Settings:** change the PIN, configure fingerprint previews, save privacy preferences, reset the learning preview, and review permissions.
- **Reset saved preferences:** restore the default app selection and privacy choices from Settings. The confirmation can be canceled, and resetting does not clear an active session restriction.
- **Permissions:** simulate revoking the protection service to see the limited-protection state. Restoring permission requires a fresh identity check.
- **Restricted session:** PINs, fingerprints and direct success URLs cannot bypass it. **Start a new demo session** in Settings explicitly clears the simulated restriction while retaining your choices.

Navigation uses URL hashes and supports browser back/forward. Unknown hashes show the welcome screen. **Save selection** and **Save preferences** store app and privacy choices on this browser, including an empty selection and disabled privacy options. These survive reloads and reopening the frontend at the same address. Unsaved edits are discarded on reload. Storage is separate for each browser, device and origin (scheme, host and port).

Demo identity/session state remains in React memory. Reloading resets the PIN to **123456**, fingerprint/permission simulations, verification, restrictions and security events. No PIN, biometric setting, access approval or event data is stored with preferences. Existing activity is synthetic; new demo attempts use the current time in IST. Disabling security history pauses new event recording.

If device storage is unavailable, choices still apply to the current session, with a visible failure message and **Try saving again**. An unsuccessful reset keeps the saved choices and the confirmation open. Invalid or incompatible saved data falls back to defaults without crashing or overwriting it until you explicitly save or reset.

The interface fills phone widths in portrait and landscape, and centers a 390px frame on desktop. Content scrolls within the screen while the header and navigation stay visible. Touch targets are at least 48 CSS pixels, with space for display cutouts and bottom system bars. PIN entry uses the built-in keypad or a hardware keyboard; search uses the phone keyboard.

## Review on an Android phone

Connect the phone and computer to the same Wi-Fi. Build the frontend, then bind the preview to the computer's Wi-Fi IPv4 address:

```sh
npm run build
npm run preview -- --host YOUR_WIFI_IPV4 --port 4173 --strictPort
```

Replace `YOUR_WIFI_IPV4` with the computer's address, then open the printed Network URL in Chrome on the phone. Keep the preview process running during the review. Check setup, the PIN keypad, search, Settings dialogs, and portrait/landscape scrolling.

The October 10, 2026 review passed automated mobile checks, and the user confirmed that the preview loads and looks right on their Android phone. The phone model and Android/browser versions were not recorded. See `design/figma/android-review.md` for scope and results.

## Preview boundaries

This is a frontend research demonstration. Fingerprint checks, Android permissions, risk signals, learning and protected-app handoff are explicit simulations. The browser does not collect device signals, scan biometrics, enforce protection over other apps or provide authentication. Recovery is not enrolled. Use a demo PIN.

The installed Android APK now provides local PIN/biometric verification; browser authentication remains simulated. Production integration still needs native permissions, installed-app selection, protection/app-launch services, authoritative risk decisions, a recovery flow, and security-event storage. Native authentication still needs physical phone validation.

## Code map

| File | Purpose |
| --- | --- |
| `src/App.tsx` | Exports the mobile frontend |
| `src/mobile/GhostAuthApp.tsx` | Screens, navigation and interaction handlers |
| `src/mobile/screens.ts` | Copy and route definitions for all 33 screens |
| `src/mobile/state.ts` | App selection, preferences and verification transitions |
| `src/mobile/preferences.ts` | Versioned browser storage for app and privacy choices |
| `src/mobile/mobile.css` | Figma typography, colors and responsive layout |
| `src/components/Modal.tsx` | Shared confirmation dialog and focus handling |
| `public/assets/ghostauth-logo.png` | Original approved GhostAuth mark |
| `public/fonts/` | Bundled fonts and their licenses |
| `design/figma/` | Design contexts, prototype maps and validation records |
| `tests/mobile-state.test.ts` | Mobile state regression tests |
| `tests/mobile-browser.cjs` | Optional production browser interaction checks |
| `tests/android-review.cjs` | Android touch, viewport, scrolling and dialog regression checks |
| `tests/preferences.test.ts` | Saved-data validation and reset behavior |
| `tests/preferences-browser.cjs` | Reload/reopen, reset confirmation and storage-failure checks |

The prior dashboard's domain fixtures and tests remain under `src/lib/` and `tests/demo-state.test.ts`; they are not used by the mobile entry point.

## Browser checks

Build first, then run with an available Playwright installation:

```sh
npm run build
node tests/mobile-browser.cjs
```

If Playwright is installed outside this project, set `PLAYWRIGHT_MODULE` to its package path. Optionally set `CHROME_EXECUTABLE` to a Chrome executable; otherwise Playwright uses its installed Chromium. Tests launch an isolated headless browser, exercise the main flows, and check desktop layouts plus all 33 routes in Chromium mobile emulation at 320×568, 360×640, 390×844, 412×915 and 844×390. Touch navigation, reduced-height search, long activity lists, PIN fallback and simulated system insets are also checked. Screenshots and reports are written to the ignored `tmp/mobile-qa/` directory.
