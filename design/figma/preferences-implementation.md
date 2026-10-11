# Persistent frontend preferences

Implemented October 10, 2026. App selection and privacy choices are stored only when the user chooses **Save selection** or **Save preferences**. The versioned `ghostnet.preferences.v1` record contains `version`, `selected` app IDs and the three privacy booleans. This internal key is retained after correcting the app name to GhostAuth so existing saved choices continue to load.

State initialization restores valid choices and normalizes app IDs. Empty selections and disabled privacy choices are retained. Missing, malformed or incompatible records fall back to defaults; reading them does not overwrite them. Temporary PIN, fingerprint/permission, verification, restriction and event state starts fresh on reload.

Settings includes **Reset saved preferences** with confirmation. Cancel leaves choices intact. Successful reset removes only the GhostAuth preference record, restores default app/privacy choices and invalidates verification while retaining the current PIN and any session restriction. Failed reset leaves choices intact and shows a retryable error in the dialog.

Unavailable browser storage does not stop the frontend. Saved choices apply to the current session, an error explains that persistence failed, and **Try saving again** retries the current choices.

Storage is local to the browser origin, so phone and computer preferences are separate and changing the preview host/port does not share saved choices. This is the persistence layer for the browser preview; native Android storage remains a later integration.

Validation includes pure tests in `tests/preferences.test.ts` and production browser checks in `tests/preferences-browser.cjs`. The saved browser results are in `preferences-validation.json`.
