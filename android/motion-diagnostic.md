# GhostAuth 0.7.3 motion diagnostic

Purpose: check whether Nothing Phone 2a / Android 16 delivers sustained accelerometer and gyroscope readings while GhostAuth remains focused. The earlier fingerprint flow produced 0 usable checks out of 12, all interrupted by focus loss. This separate task does not test identity recognition or produce model training data.

## Run and share

1. Install `artifacts/GhostAuth-debug.apk` over the existing app. Do not uninstall; confirm version 0.7.3 in About.
2. Open Settings -> Privacy & data. Ensure Movement signals is enabled and save.
3. Open Settings -> Motion research. If collection is paused/off, read the disclosure and enable it.
4. Choose Open motion diagnostic -> Start five-second test. Read the separate disclosure and choose Agree and start test.
5. Hold the phone comfortably, keep this screen visible and focused, and wait for Five-second test finished. Do not open a protected app or fingerprint prompt during the test.
6. Choose Copy results and paste the text into the project chat. Run this normal test three times and label the pasted results Run 1, Run 2 and Run 3. Copy each before starting the next; only the latest result stays in memory.

The report includes the app version, stop reason, counts, sampled durations, measured rates, largest gaps and delivery quality. No PIN, device serial number, app content or participant name is needed. Screenshot protection remains enabled.

## Separate interruption checks

After sharing the three normal tests, optionally start a new run and press Home before five seconds. Return and confirm it stopped rather than resumed; copy that result as Background check. Repeat with screen lock if convenient and label it Lock check. Focus loss may be reported before screen-off because Android callback order varies. Leaving the diagnostic with Back must also stop the run. A fresh test always requires another explicit start and consent.

Clear diagnostic result discards the temporary result; Clear research data also clears it. These actions must preserve native credentials and app protection. Diagnostic tests must not increase retained verification sessions, usable fingerprint checks or security history. Native listener/storage checks require device-side inspection beyond these visible observations.

## Interpretation

The requested rate is 20 Hz; actual delivery can differ. Single-reading streams have zero measured duration and no measurable rate or gap. The existing two-second/250 ms delivery checks are used for descriptive quality only. Sufficient delivery here does not establish identity accuracy, natural app-opening coverage, battery impact or launch latency.

Results are not saved to research storage, enrollment, security history or training datasets. Copy results explicitly places a delivery summary on the clipboard. No model or low/medium/high access decision is enabled. After reviewing actual delivery, decide how to study relevant, consented signals available before authentication; do not delay verification or continue sampling after focus loss to improve coverage.
