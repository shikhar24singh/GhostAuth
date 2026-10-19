# Behavioral data collection pilot

Status: initial collector implemented in 0.7.0; physical coverage validation, a pilot dataset and a behavioral model remain pending.
Decision recorded: 2026-10-17. Current Android build: 0.7.0.

## Research question

Can signals available during GhostAuth's existing app-opening and verification flow distinguish the enrolled owner from another person across different days, without delaying fingerprint verification?

The first milestone measures signal availability and repeatability. It does not assume that these short interactions contain enough information for identity recognition. App-opening context can support a separate risk experiment, but must not be presented as proof of identity.

HMOG remains an optional reference for feature research. Its reading, writing and map tasks are not our primary training or acceptance dataset. No public dataset has been downloaded or integrated for this milestone.

## Current implementation boundary

- `ProtectionService` observes package names from window-state events to protect selected apps. It does not retrieve screen content or cross-app touch/key events.
- `GhostDevicePlugin` checks usage-access status but does not query usage history.
- `MainActivity` now bounds foreground motion capture through resume, focus, pause and screen-off handling.
- Behavior signals remains a touch-collection preview. Movement signals additionally gates the new native collector; existing values do not enroll anyone in research.

## Proposed capture contract

| Signal | Proposed collection boundary | Intended use |
| --- | --- | --- |
| Motion | Optional accelerometer and gyroscope samples while the GhostAuth Activity is resumed and focused; request 20 Hz and measure actual delivery | Candidate movement features |
| Ordinary touch | Only explicitly allowlisted, non-sensitive controls in GhostAuth; summarize gesture duration, normalized distance and speed | Secondary experiment if normal use supplies enough gestures |
| Selected-app opening | Only the protected package already associated with the current verification request | Coverage and contextual analysis; excluded from the first identity model |
| Native verification outcome | Terminal outcome bound to that capture session by native code | Enrollment eligibility and quality analysis; never an identity feature |
| Sensor availability, gaps, duration and app version | Per-session metadata | Quality checks and reproducibility |

Do not request broader accessibility capabilities, usage-history queries, background monitoring, location, keyboard capture or screen-content access for this pilot. Sensor availability and delivery must be measured on physical phones. Android's [sensor framework documentation](https://developer.android.com/develop/sensors-and-location/sensors/sensors_overview) describes runtime discovery, event timestamps and lifecycle handling; requested rates are not a guarantee of delivered rates.

Do not capture PIN digits, PIN-pad events or timing, typed text, fingerprint images, system biometric interactions, or time spent entering credentials as behavioral features. Ordinary touch capture must stop on authentication/settings forms and use an explicit allowlist rather than a global input listener.

## Collection lifecycle and labeling

1. Add a separate research enrollment control, off on install and upgrade. Explain the exact signals, boundaries, retention and lack of behavioral protection before enabling it. Existing per-signal privacy choices further restrict collection; Security history consent is independent.
2. Start a bounded native session only for an opted-in verification request. Generate an unpredictable session identifier and bind it to the request generation and selected package. No JavaScript-provided success flag may approve an enrollment sample.
3. Collect for at most 10 seconds while GhostAuth is resumed and focused. Stop listeners immediately on pause, focus loss, screen lock, cancellation, consent withdrawal or process teardown. Record gaps; never fabricate continuous samples across a system prompt or another app.
4. Do not delay the biometric prompt, require extra gestures, or delay successful app launch to fill a window. A fast fingerprint interaction may produce no eligible sample. Preserve that result in coverage counts.
5. In ordinary owner-enrollment mode, commit a candidate training sample only after a matching successful native verification. Failed, canceled, stale or incomplete requests must not train the owner profile. Success is an enrollment assumption, not independent proof of the human's identity.
6. Explicit volunteer evaluation sessions are labeled separately by the study operator. Another volunteer may intentionally complete the same credential flow under supervision; those samples remain impostor test data and must never enter owner enrollment. Neither auth success nor failure establishes the study's owner/impostor label.

The system biometric prompt may remove Activity focus or interrupt capture. Measure that behavior instead of extending collection into the prompt. No samples from Presto's own interaction are implied by this design.

## Local data and controls

- Use a separate encrypted native store, excluded from backup and independent of credentials and security history. Raw motion stays in memory; persist versioned per-window summaries plus bounded quality metadata.
- Use monotonic relative timestamps for motion and gestures. Keep collection date only as retention/session-split metadata; exclude absolute time, package, participant/device identifiers, authentication method/outcome and session identifiers from the first identity feature vector.
- Candidate summaries: acceleration/rotation magnitude mean, standard deviation and root mean square over contiguous windows, with explicit units, sample counts and measured intervals. Evaluate sensor combinations separately; absence is not a zero-valued sensor reading.
- Initial eligibility rule for each evaluated sensor combination: at least 2 seconds of contiguous usable data, finite readings and no gap longer than 250 ms. Record rejection reasons and actual rates. These are pilot settings to validate, not proven identity thresholds.
- Store at most 500 session summaries, 10 MiB or 7 days of data, whichever limit is reached first. Evict oldest entries and report storage errors without blocking authentication. Exported copies, if any, have their own participant-approved retention agreement.
- Show collection state, eligible/rejected session counts and reasons. Disabling research collection stops capture, discards pending buffers and retains existing samples until expiry or explicit deletion. Clear research data removes samples/profile without changing PIN, biometrics, protection selection or security history. Clearing/resetting must invalidate queued writes so deleted data cannot reappear.
- No automatic upload or export. Any later export feature needs explicit user action, participant consent and an aggregate-data preview. Participant identifiers must be pseudonymous; package/device details can still be identifying and must be excluded by default.

## Pilot protocol

Start with one phone and its enrolled owner to validate lifecycle, sampling and normal-flow coverage. This cannot measure impostor acceptance. Then aim for 8-12 consenting volunteers over at least 7 days, with at least 15 eligible owner sessions per owner across multiple days. These are initial feasibility targets, not a statistically sufficient security evaluation.

Include comfortable variations: seated/standing, supported/handheld phone and either hand where practical. Do not impose reading, typing or map tasks as substitutes for the actual verification workflow. Log unsuccessful/too-short collection attempts as well as eligible samples.

For each evaluated owner, have other volunteers use that same handset under supervision, with separate operator labels and no owner-profile updates. Use a dedicated test app and no personal app content. Keep owner and impostor trials comparable in task and authentication method so a model cannot learn the experiment setup instead of identity.

## Evaluation and decision gates

1. **Capture feasibility:** report usable-session percentage, durations, actual sensor rates, gaps, missing sensors and added launch latency on physical devices. Verify capture stops on lifecycle/consent changes. If normal fingerprint-first use rarely supplies eligible windows, revise the collection approach before training; do not silently add a delay or broader monitoring.
2. **Dataset quality:** inspect missingness and owner/impostor label integrity. Keep all windows from one session in one partition. Reserve later days for testing, tune only on earlier training/validation days, and freeze thresholds before the final test. General-purpose feature/threshold choices require a separate participant holdout when cohort size permits.
3. **First algorithm:** compare a simple per-owner distance baseline against a one-class anomaly detector on the same eligible features. Report owner rejection, impostor acceptance, insufficient-data coverage and per-participant trial counts/uncertainty. Do not report accuracy on only the usable subset without its coverage.
4. **Observation mode:** if the pilot supports further work, record scores without changing fingerprint/PIN requirements. Missing or insufficient signals produce `insufficient_data`, never low risk. No self-training from unverified or evaluation sessions.
5. **Enforcement:** a separate future decision requires representative independent testing and an agreed error budget. This pilot does not authorize behavioral bypass, automatic denial or claims of continuous cross-app authentication.

## Implementation order and completion criteria

1. Implement native research consent, bounded encrypted storage, clear/pause controls and lifecycle invalidation.
2. Implement foreground motion capture and native session/outcome binding. Add allowlisted ordinary-touch summaries only if the workflow yields relevant gestures.
3. Add collection diagnostics and physical-device review for missing sensors, fast fingerprint completion, prompt focus loss, PIN fallback, cancellation, screen lock, process restart, consent changes, deletion races and storage failure.
4. Run the feasibility pilot and produce a coverage report. Only then build the offline training/evaluation pipeline with explicit session splits and volunteer labels.

The collection milestone is complete when a physical-device coverage report and a reproducible, consented pilot dataset exist, collection boundaries are verified, and the data can be cleared without affecting credentials. The 0.7.0 implementation adds a test APK and owner-enrollment collection diagnostics; this document does not establish a completed feasibility pilot or trained model.

## 0.7.0 implementation scope

Separate off-by-default research consent, native authoritative movement permission, foreground motion summaries, encrypted bounded storage, quality counts/reasons, pause/delete controls, and native verification binding are implemented. No touch collector, study-operator labeling, export or model is implemented. PIN checks record outcome diagnostics with zero motion. A nonmatching scan ends its research sample; later success in that prompt cannot enroll that sample. Packages are bound in memory but not persisted. Retention is enforced on the next research read/write; deleting research data does not delete security history or credentials. Physical-device checks and the complete pilot remain pending.
