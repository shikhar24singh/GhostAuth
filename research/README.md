# GhostAuth behavioral model: offline research foundation

Status: training/evaluation software implemented; no physical-data model has been trained or enabled in Android. The first phone observation supplied zero eligible windows out of 12 fingerprint checks. Aggregate screenshots cannot be converted into missing feature vectors or operator identity labels.

## What is implemented

- Per-owner, per-device distance baseline and Isolation Forest, evaluated separately for accelerometer, gyroscope and their combination.
- Features are magnitude mean and standard deviation from each eligible stream. RMS is deliberately excluded: its square equals mean squared plus variance and adds no independent information. No identity, package, timestamp, outcome, authentication method, sampling rate, duration or study label enters the feature vector.
- Independent quality validation, explicit missing streams and coverage denominators. PIN, canceled/failed verification and insufficient windows cannot become enrollment features. Successful fingerprint verification alone never supplies an owner/impostor study label.
- Entire sessions stay in one partition. All training days precede validation days, which precede test days. Scaling fits owner training data only. Calibration uses labeled validation sessions; test data cannot change preprocessing, models or routing cutoffs.
- Session-level evaluation uses the maximum anomaly score across eligible windows in the session. Reports include owner/impostor coverage, direct-open/fingerprint/PIN routing proportions, behavioral FAR/FRR at the direct-open cutoff, a descriptive nearest-ROC EER estimate and Wilson 95% intervals. Session correlation and small cohorts limit those intervals.
- Reproducible seeds, pinned dependencies, dataset hashes and versioned JSON model artifacts. Forest trees are exported as ordinary JSON; no pickle loading is used. Exported scores are checked against scikit-learn during training and in software tests.

## Relationship to the requested app flow

The offline routing proposal is low -> open, medium -> fingerprint, high -> PIN. An absent model or insufficient signal is unknown -> PIN, never low. These actions are represented in the research code; Android does not execute model decisions yet. Authentication failures are still recorded locally by the existing security history, without inventing a behavioral threat classification.

The current collector only preserves eligible behavioral features after native verification. It therefore cannot provide a fresh model decision before that same verification. Before enabling direct-open decisions, we need a revised, disclosed collection design that produces relevant signals at decision time, plus separately labeled natural-use evaluation. Version 0.7.3 now includes a separately consented [foreground sensor diagnostic](../android/motion-diagnostic.md) to test delivery only. Its temporary summaries are not training data and cannot establish the validity of a frictionless app-opening model; physical results remain pending. Do not lower the two-second requirement or collect after focus loss to fill this gap.

All exported models contain `mode: observation_only` and `deployable: false`, including models evaluated with physical study data. Moving to enforcement requires a separate review of coverage, error budgets, calibration, freshness, replay resistance, drift and model-to-app integration. A low model score alone is not currently an Android launch approval.

## Set up and run

Use Python 3.12. Create a local environment and install the pinned dependencies:

```powershell
python -m venv .venv-model
.venv-model\Scripts\python -m pip install -r research/requirements.txt
.venv-model\Scripts\python -m unittest discover -s research/tests -v
```

Study records belong in the ignored `research/data/` directory. A run directory must be new so earlier results are not overwritten.

```powershell
.venv-model\Scripts\python research/behavior_model.py audit research/data/pilot.jsonl --output research/runs/pilot-audit.json
.venv-model\Scripts\python research/behavior_model.py train-evaluate research/data/pilot.jsonl --output research/runs/pilot-001
```

No study dataset is bundled. The model tests generate clearly marked synthetic fixtures to check the software only. Training rejects synthetic input unless `--allow-synthetic` is explicitly passed, and resulting reports remain labeled `software_check_only`. Synthetic metrics are not project accuracy results. A training run with insufficient data writes an `insufficient_data` report and exits with code 2; it creates no models.

Minimum engineering gates per owner/device/modality: 15 eligible owner training sessions across at least three training days, plus five eligible owner and five eligible impostor sessions in each of validation and test. These are software feasibility gates, not a statistically adequate security study. The broader pilot plan still calls for multiple consenting participants and later-day testing.

## Input contract

One JSON object per line wraps one native summary with separately collected study-operator metadata:

- `schema_version`: 1; `source`: `ghostauth`; `data_kind`: `study` or `synthetic` (never mixed).
- `owner_id`, `actor_id`, `device_id`, `session_id`, `window_id`: nonempty pseudonyms, at most 128 characters. A window identifier is globally unique. Same-session windows must share actor, owner, device, day, partition, label and purpose.
- `day`: ISO date recorded by the study operator. Partition days must be strictly ordered within each owner/device group.
- `split`: `train`, `validation` or `test`; assigned before experimentation, never by random overlapping-window sampling.
- `purpose`: training uses `owner_enrollment`; validation/test use `evaluation`.
- `label`: operator-established `owner` or `impostor`. Owner requires actor == owner; impostor requires a different consenting actor using that same handset under supervision. Credential outcome must never infer this label.
- `native`: the version-1 summary containing `version`, `method`, `outcome`, `eligible`, `acceleration` and `rotation`. Native package/date/session metadata is not used as a model feature.

Each sensor contains `count`, `durationMillis`, `maxGapMillis`, `rateHz`, `quality` and native `units` (`m/s²` for acceleration, `rad/s` for rotation). Eligible, verified fingerprint windows additionally contain finite nonnegative `mean`, `standardDeviation` and `rms`. Require at least two seconds, no gap above 250 ms, and valid native quality; missing streams stay missing. One-reading windows have duration/rate/gap 0 but have no behavioral features. Noneligible/unverified streams must not include behavioral features.

The app does not yet export this dataset or collect study-operator labels. Do not extract credentials or bypass the encrypted native store to fabricate input. An eventual export must be an explicit participant-approved action with a preview, separate retention terms and pseudonymous labels. Diagnostic-task samples must remain distinct from the natural app-opening study.

## Calibration and limits

Anomaly scores increase with deviation from owner enrollment. The distance baseline is the root mean squared standardized feature distance; Isolation Forest uses the negative of scikit-learn's `score_samples`. Scores are not probabilities.

The lower cutoff is selected on validation sessions to maximize the range labeled low while empirical impostor direct-open frequency stays at or below 1%. With five impostor sessions this means zero observed direct opens; it does not prove a 1% population FAR. The upper cutoff starts above the 95th percentile of genuine validation scores and never falls below the lower cutoff. Both limits are exploratory settings, not approved security thresholds. Frozen cutoffs are evaluated on later held-out sessions. A test ROC/EER description does not feed back into threshold selection.

Model selection and general feature/hyperparameter decisions require a separate participant holdout when the cohort permits. Same-device tests with the same impostors across days do not establish cross-device or unseen-impostor performance. No global fallback model impersonates a missing owner profile. Report missing coverage and per-participant support alongside all accuracy claims.

References: [Isolation Forest score semantics](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.IsolationForest.html), [scikit-learn evaluation guidance](https://scikit-learn.org/stable/modules/cross_validation.html), [project collection protocol](../design/behavior-collection-plan.md), [first phone observations](../android/motion-pilot.md).
