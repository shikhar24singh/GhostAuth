import copy
import json
import math
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from behavior_model import (DatasetError, FEATURES, audit, calibrate, export_forest, load_records, metrics,
                            proportion, route_score, score_vectors, train_evaluate, validate_records)


def sensor(mean, deviation, units="m/s²"):
    return {"count": 51, "durationMillis": 2500, "maxGapMillis": 50, "rateHz": 20, "quality": "eligible",
            "units": units, "mean": mean, "standardDeviation": deviation, "rms": math.sqrt(mean * mean + deviation * deviation)}


def record(day="2026-11-01", split="train", label="owner", index=0):
    session = f"{day}-{split}-{label}-{index}"
    return {"schema_version": 1, "source": "ghostauth", "data_kind": "synthetic", "owner_id": "p1",
            "actor_id": "p1" if label == "owner" else "p2", "device_id": "device-a", "session_id": session,
            "window_id": session + "-window", "day": day, "split": split, "label": label,
            "purpose": "owner_enrollment" if split == "train" else "evaluation",
            "native": {"version": 1, "method": "fingerprint", "outcome": "verified", "eligible": True,
                       "acceleration": sensor(9.8, 0.2), "rotation": sensor(0.3, 0.1, "rad/s")}}


def study_fixture():
    import numpy as np
    rng, rows = np.random.default_rng(71), []
    for day, split, labels in [("2026-11-01", "train", ["owner"]), ("2026-11-02", "train", ["owner"]),
                               ("2026-11-03", "train", ["owner"]), ("2026-11-04", "validation", ["owner", "impostor"]),
                               ("2026-11-05", "test", ["owner", "impostor"])]:
        for label in labels:
            for index in range(6):
                row = record(day, split, label, index)
                row["native"]["acceleration"] = sensor(float(rng.normal(9.8 if label == "owner" else 12, .1)), float(rng.uniform(.1, .3)))
                row["native"]["rotation"] = sensor(float(rng.uniform(.1, .4) if label == "owner" else rng.uniform(2, 4)), float(rng.uniform(.05, .2)), "rad/s")
                rows.append(row)
    return rows


class DataContractTests(unittest.TestCase):
    def test_features_exclude_identifiers_timing_outcome_and_redundant_rms(self):
        row = record()
        row["native"]["packageName"] = "never.a.feature"
        clean = validate_records([row])[0]
        self.assertEqual(clean["features"]["both"], [9.8, .2, .3, .1])
        self.assertEqual(len(FEATURES["both"]), 4)
        self.assertNotIn("never.a.feature", json.dumps(clean))

    def test_failed_native_verification_cannot_supply_owner_features(self):
        row = record(); row["native"]["outcome"] = "failed"
        with self.assertRaises(DatasetError):
            validate_records([row])

    def test_verified_impostor_is_still_impostor_and_cannot_train(self):
        row = record("2026-11-04", "validation", "impostor")
        self.assertEqual(validate_records([row])[0]["label"], "impostor")
        row["split"] = "train"; row["purpose"] = "owner_enrollment"
        with self.assertRaises(DatasetError):
            validate_records([row])

    def test_missing_sensor_and_short_windows_never_become_zero_features(self):
        row = record()
        row["native"]["rotation"] = {"count": 0, "durationMillis": 0, "maxGapMillis": 0, "rateHz": 0, "quality": "too_short", "units": "rad/s"}
        clean = validate_records([row])[0]
        self.assertIsNotNone(clean["features"]["acceleration"])
        self.assertIsNone(clean["features"]["rotation"])
        self.assertIsNone(clean["features"]["both"])
        row["native"]["acceleration"] = {"count": 1, "durationMillis": 0, "maxGapMillis": 0, "rateHz": 0, "quality": "too_short", "units": "m/s²"}
        row["native"]["eligible"] = False
        result = audit(validate_records([row]))
        self.assertEqual(result["groups"][0]["partitions"]["train"]["both"]["session_coverage"], 0)

    def test_duplicate_windows_and_split_session_leakage_are_rejected(self):
        a, b = record(), record(index=1)
        b["window_id"] = a["window_id"]
        with self.assertRaises(DatasetError):
            validate_records([a, b])
        b = record("2026-11-04", "validation"); b["session_id"] = a["session_id"]
        with self.assertRaises(DatasetError):
            validate_records([a, b])

    def test_days_must_be_strictly_ordered_and_labels_operator_consistent(self):
        for b in (record("2026-11-01", "validation"), record("2026-10-31", "validation")):
            with self.assertRaises(DatasetError):
                validate_records([record(), b])
        row = record(); row["actor_id"] = "p2"
        with self.assertRaises(DatasetError):
            validate_records([row])

    def test_invalid_statistics_and_pin_motion_are_rejected(self):
        for key, value in (("mean", float("nan")), ("rms", 1), ("durationMillis", 110), ("maxGapMillis", 251)):
            row = record(); row["native"]["acceleration"][key] = value
            with self.assertRaises(DatasetError):
                validate_records([row])
        row = record(); row["native"]["method"] = "PIN"
        with self.assertRaises(DatasetError):
            validate_records([row])

    def test_units_and_schema_versions_cannot_silently_change_feature_meaning(self):
        for field, value in (("units", "g"), ("units", "degrees/s")):
            row = record(); row["native"]["acceleration"][field] = value
            with self.assertRaises(DatasetError):
                validate_records([row])
        row = record(); row["schema_version"] = True
        with self.assertRaises(DatasetError):
            validate_records([row])

    def test_file_parser_rejects_nonstandard_nan_and_mixed_data_kinds(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "data.jsonl"; path.write_text('{"value": NaN}\n')
            with self.assertRaises(DatasetError):
                load_records(path)
        a, b = record(), record(index=1); b["data_kind"] = "study"
        with self.assertRaises(DatasetError):
            validate_records([a, b])


class ModelingTests(unittest.TestCase):
    def test_safe_json_forest_matches_library_on_unseen_and_training_points(self):
        import numpy as np
        from sklearn.ensemble import IsolationForest
        rng = np.random.default_rng(19)
        x = rng.normal(size=(37, 4))
        forest = IsolationForest(n_estimators=31, max_samples=23, max_features=.75, random_state=4).fit(x)
        model = {"feature_names": list(FEATURES["both"]), "mean": [0]*4, "scale": [1]*4, "estimator": export_forest(forest)}
        sample = np.vstack([x, rng.normal(size=(19, 4)), np.full((1, 4), 1000)])
        restored = json.loads(json.dumps(model, allow_nan=False))
        np.testing.assert_allclose(score_vectors(restored, sample), -forest.score_samples(sample), rtol=1e-10, atol=1e-10)

    def test_pipeline_is_reproducible_and_test_values_do_not_fit_scaler_or_thresholds(self):
        raw = study_fixture(); rows = validate_records(raw)
        models, report = train_evaluate(rows, allow_synthetic=True, trees=17)
        self.assertEqual(len(models), 6)
        self.assertEqual(report["status"], "software_check_only")
        self.assertFalse(report["deployable"])
        again, _ = train_evaluate(rows, allow_synthetic=True, trees=17)
        self.assertEqual(models, again)
        altered = copy.deepcopy(raw)
        for row in altered:
            if row["split"] == "test":
                row["native"]["acceleration"] = sensor(1000, 100)
        other, _ = train_evaluate(validate_records(altered), allow_synthetic=True, trees=17)
        self.assertEqual(models, other)
        for model in models:
            self.assertEqual(model["training"]["sessions"], 18)
            self.assertNotIn("2026-11-04", model["training"]["days"])

    def test_insufficient_data_and_synthetic_input_cannot_silently_train(self):
        rows = validate_records([record()])
        with self.assertRaises(DatasetError):
            train_evaluate(rows)
        models, report = train_evaluate(rows, allow_synthetic=True)
        self.assertEqual(models, [])
        self.assertEqual(report["status"], "insufficient_data")

    def test_risk_routes_and_unknown_data_follow_the_requested_actions(self):
        thresholds = {"low_below": .3, "high_at_or_above": .7}
        for score, risk, action in ((.1, "low", "open"), (.3, "medium", "fingerprint"), (.7, "high", "pin"),
                                    (None, "insufficient_data", "pin"), (float("nan"), "insufficient_data", "pin")):
            self.assertEqual(route_score(score, thresholds), {"risk": risk, "proposed_action": action})

    def test_calibration_uses_impostor_labels_and_does_not_promise_tiny_sample_security(self):
        validation = [{"score": score, "label": label} for label, scores in (("owner", [.1, .2, .3, .4, .5]),
                        ("impostor", [.2, .3, .4, .5, .6])) for score in scores]
        thresholds = calibrate(validation)
        result = metrics(validation + [{"score": None, "label": "impostor"}], thresholds)
        self.assertEqual(result["impostor"]["direct_open"]["rate"], 0)
        self.assertEqual(result["impostor"]["insufficient_sessions"], 1)
        self.assertGreater(result["impostor"]["direct_open"]["wilson_95"][1], .4)
        self.assertIn("eer_nearest_operating_point", result)
        self.assertIsNone(proportion(0, 0)["rate"])


if __name__ == "__main__":
    unittest.main()
