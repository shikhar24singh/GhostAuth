# Motion feasibility pilot: Nothing Phone 2a

Target device: Nothing Phone 2a, Android 16 (user-provided). Intended test build: GhostAuth 0.7.1. Status: initial physical aggregate observations received on 2026-11-17; capture feasibility is not established. No phone was attached through Android debugging during preparation. The submitted photo does not show the app version.

## First physical observations: 2026-11-17

Source: user-provided photo, `WhatsApp Image 2026-11-17 at 12.52.29.jpeg`. Values below are transcribed from the visible Motion research screen, not independently collected sensor traces. The device/Android version comes from the user's earlier report. Session outcomes below the quality heading, per-session records, opening latency, postures, starting counters and boundary-check results were not supplied.

- Collection enabled; both accelerometer and gyroscope available.
- Retained sessions: 12 total, 0 usable, 12 insufficient or unverified.
- Retained fingerprint coverage: 0 of 12 (0.0%); 0 PIN checks excluded.
- Accelerometer: 12 sampled windows, 0 usable; median window 0.11 seconds, median rate 104.9 Hz, largest gap 9 ms.
- Gyroscope: 6 sampled windows, 0 usable; median window 0.00 seconds, median rate 21.0 Hz, largest gap 47 ms.
- First observed capture stop: GhostAuth lost focus, 12 checks.

Interpretation: the present fingerprint-first collection flow supplied no eligible training candidates in this retained group. Sensors delivered readings and the displayed largest gaps are below 250 ms, but the median accelerometer duration is far below the two-second requirement. Focus loss in all 12 checks is consistent with interruption by the biometric prompt; the photo does not identify the window that took focus or prove every per-session quality/outcome. A displayed gyroscope median of 0.00 seconds is rounded and can include single-reading windows; it does not mean the sensor never delivered data. Its rate median is calculated only over windows with at least two readings.

The accelerometer's measured rate being above the requested 20 Hz is not by itself a fault: Android treats sampling periods as hints and delivery can be faster or slower. A rate over a tiny window is not a sustained sampling-rate measurement. See [SensorManager registration documentation](https://developer.android.com/reference/android/hardware/SensorManager#registerListener(android.hardware.SensorEventListener,android.hardware.Sensor,int,android.os.Handler)).

Decision: this group does not pass the capture-feasibility gate for the current flow. Preserve the focus/foreground stop rules, normal launch timing and two-second quality threshold. Do not train, manufacture missing features, continue collection inside another app, or delay authentication to improve these counters. This observation does not establish that motion authentication is impossible on this device or that app protection failed.

Next investigation: a separately disclosed, user-started foreground sensor diagnostic can distinguish sustained sensor delivery from the prompt lifecycle interruption. It must be separate from ordinary app opening and owner enrollment, stop on focus/background/screen-off/consent changes, and never be presented as an authentic normal-flow dataset. The collection approach then needs a new natural-use feasibility study before participant collection or model training. No such diagnostic mode has been implemented or enabled by recording this result.

## Purpose

Determine whether normal fingerprint-first app opening supplies usable foreground motion without adding a wait. This first owner-only check measures availability and lifecycle behavior; it cannot measure owner recognition, impostor acceptance or model accuracy.

Install `artifacts/GhostAuth-debug.apk` over the existing installation. Do not uninstall or clear Android app data; those actions remove credentials and settings. Verify Settings shows 0.7.1. Retain the existing PIN/fingerprint and protection setup. Use a non-sensitive test app where possible.

## Prepare a clean measurement

1. Open Settings -> Motion research. Confirm research is off if never enrolled. If already enrolled, pause it while preparing.
2. Clear research data only if existing pilot summaries are no longer needed. This deletes retained motion summaries; it preserves research consent, credentials, selected apps and security history. Otherwise record the starting counters and report that the aggregate includes earlier sessions.
3. In Privacy & data, enable Movement signals and save. Return to Motion research, read the disclosure and explicitly agree to enroll.
4. Record sensor availability, the app version, Android version and baseline retained/PIN/fingerprint counts. Keep all measurements within the seven-day retention period.

## Normal fingerprint coverage

Open the protected test app normally 10 times. Leave it between openings so each opening requires a fresh check. Complete fingerprint verification at your normal speed; do not wait to fill a sensor window. Try five seated and five standing openings with the phone held comfortably. Stop if the app opens unexpectedly without verification.

After each group, return to Motion research and tap Refresh research data. Record or privately capture the following visible results:

- Total retained sessions; fingerprint checks, usable fingerprint checks and coverage percentage; PIN checks separately.
- Usable sensor combinations: both sensors, accelerometer only, gyroscope only.
- For each sensor: sampled windows, usable windows, median window duration in seconds, median delivered rate in Hz, and largest gap in milliseconds. Preserve absent measurements as missing.
- Capture-stop counts, particularly focus loss, verification completion, leaving the foreground and screen-off events.
- Whether app opening felt delayed, whether content flashed, and whether protection remained active. Perceived delay is an observation, not a measured p50/p95 latency.

The percentage is usable retained fingerprint checks divided by all retained fingerprint checks recorded while enrolled. It includes attempts with Movement signals disabled; PIN checks are excluded. It is not coverage of unrecorded attempts, a lifetime counter or an authentication-accuracy score. Expiry, eviction and deletion change the denominator.

Sensor medians include sampled insufficient/unverified fingerprint windows; usable counts additionally require matching successful native verification. Duration includes one-reading windows (0 seconds); rate/gap measurements require at least two readings. Missing sensors never become zero-valued observations. Requested delivery is 20 Hz; actual delivery can differ. Eligibility requires at least two seconds with no gap above 250 ms for the evaluated sensor. A usable accelerometer does not imply a usable gyroscope.

## Boundary checks

- Try a wrong fingerprint, then cancel. Confirm no usable candidate is added. A later success after a nonmatch in the same prompt must not enroll that earlier sample.
- Switch to PIN and verify. Confirm the PIN counter grows without improving fingerprint coverage or adding PIN sensor windows.
- During a fresh check, leave GhostAuth, then repeat with screen locking. Confirm verification does not open the target after leaving or unlocking without a fresh check. A development sensor trace is still needed to prove listeners stop; aggregate UI cannot prove the absence of background readings.
- Pause research, perform another check and refresh. Counts should not grow. Reopen GhostAuth and confirm research remains paused.
- Resume enrollment, disable Movement signals and save, then perform one fingerprint check. Confirm it produces no new sampled window. Keep this gate test outside the normal coverage group or report its effect on the denominator.
- Review and, only when the results are no longer needed, clear research data. Reopen and refresh; old counts must not return. PIN, fingerprint, protection and history should still work.

Stop causes are the first interruption observed by the collector in 0.7.1. Focus loss does not prove that the biometric prompt caused it; Android event order can make focus loss appear before a screen-off event. Retained 0.7.0 entries preserve their original recorded stop reason.

## Results to return

Version 0.7.3 adds a separate [five-second foreground delivery diagnostic](motion-diagnostic.md), with an explicit Copy results action. Use that protocol to investigate sustained delivery after the initial 0/12 observation. Its results are separate from the fingerprint coverage pilot and never contribute enrollment or training windows.

Report the normal group counts, both sensor summaries, stop counts, any protection failures, and boundary-check observations. No PIN, app content, device serial number or volunteer identity is needed. Screenshots may contain app names/history elsewhere; use only Motion research or transcribe the counters.

If usable coverage is consistently absent or low, investigate prompt focus/lifecycle delivery before collecting a larger dataset. Do not lengthen verification, broaden monitoring or train on synthetic/missing readings to compensate. No numerical acceptance threshold has been established yet.

Separately measure launch latency and battery impact with a repeatable device-side protocol before claiming negligible overhead. A consented participant dataset, study-operator labels and an explicit export workflow remain later work; this build adds no export, upload, trained model or behavioral enforcement.
