from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

MODALITIES = {"acceleration": ("acceleration",), "rotation": ("rotation",), "both": ("acceleration", "rotation")}
FEATURES = {name: tuple(f"{sensor}.{feature}" for sensor in sensors for feature in ("mean", "standardDeviation"))
            for name, sensors in MODALITIES.items()}
SPLITS = ("train", "validation", "test")


class DatasetError(ValueError):
    pass


def finite(value, minimum=0, maximum=1e12):
    return type(value) in (int, float) and math.isfinite(value) and minimum <= value <= maximum


def reject_constant(value):
    raise DatasetError(f"Non-finite JSON value: {value}")


def sensor_features(sensor, verified, units):
    if not isinstance(sensor, dict):
        raise DatasetError("Missing sensor summary")
    if sensor.get("units") != units:
        raise DatasetError("Sensor units do not match the native feature contract")
    count = sensor.get("count")
    duration, gap, rate = (sensor.get(key) for key in ("durationMillis", "maxGapMillis", "rateHz"))
    if type(count) is not int or not 0 <= count <= 1000 or not finite(duration, maximum=10000) \
            or not finite(gap, maximum=10000) or not finite(rate, maximum=1e9):
        raise DatasetError("Invalid sensor quality metadata")
    quality = sensor.get("quality")
    if quality not in ("eligible", "too_short", "sensor_gap", "invalid_samples"):
        raise DatasetError("Unknown sensor quality")
    if count < 2 and (duration != 0 or gap != 0 or rate != 0):
        raise DatasetError("A rate or duration was fabricated from fewer than two readings")
    if quality == "eligible" and (count < 2 or duration < 2000 or gap > 250 or rate <= 0):
        raise DatasetError("Sensor claims eligibility without meeting collection quality limits")
    usable = verified and quality == "eligible"
    if usable:
        if not all(finite(sensor.get(key)) for key in ("mean", "standardDeviation", "rms")):
            raise DatasetError("Eligible sensor has missing/invalid features")
        if not math.isclose(sensor["rms"] ** 2, sensor["mean"] ** 2 + sensor["standardDeviation"] ** 2, rel_tol=1e-5, abs_tol=1e-8):
            raise DatasetError("Magnitude statistics are inconsistent")
        return [float(sensor["mean"]), float(sensor["standardDeviation"])]
    if any(key in sensor for key in ("mean", "standardDeviation", "rms")):
        raise DatasetError("Unverified or insufficient windows must not contain behavioral features")
    return None


def validate_records(raw_records):
    records, windows, sessions = [], set(), {}
    for index, raw in enumerate(raw_records, 1):
        if not isinstance(raw, dict) or type(raw.get("schema_version")) is not int or raw.get("schema_version") != 1 or raw.get("source") != "ghostauth":
            raise DatasetError(f"Record {index}: expected GhostAuth study schema version 1")
        required = ("owner_id", "actor_id", "device_id", "session_id", "window_id")
        if any(not isinstance(raw.get(key), str) or not raw[key].strip() or len(raw[key]) > 128 for key in required):
            raise DatasetError(f"Record {index}: missing/bad pseudonymous identifiers")
        if raw.get("data_kind") not in ("study", "synthetic") or raw.get("split") not in SPLITS \
                or raw.get("label") not in ("owner", "impostor") or raw.get("purpose") not in ("owner_enrollment", "evaluation"):
            raise DatasetError(f"Record {index}: explicit data kind, partition, operator label and purpose are required")
        if (raw["actor_id"] == raw["owner_id"]) != (raw["label"] == "owner"):
            raise DatasetError("Operator identity label conflicts with actor/owner identifiers")
        if raw["split"] == "train" and (raw["label"] != "owner" or raw["purpose"] != "owner_enrollment"):
            raise DatasetError("Only operator-labeled owner enrollment may enter training")
        if raw["split"] != "train" and raw["purpose"] != "evaluation":
            raise DatasetError("Validation/test sessions must be explicitly separated from enrollment")
        try:
            day = date.fromisoformat(raw["day"])
            if day.isoformat() != raw["day"]:
                raise ValueError()
        except (ValueError, TypeError, KeyError):
            raise DatasetError("Each session needs an ISO calendar day for time-disjoint evaluation") from None
        if raw["window_id"] in windows:
            raise DatasetError("Duplicate window identifier; never copy a window across splits")
        windows.add(raw["window_id"])
        session_key = (raw["owner_id"], raw["device_id"], raw["session_id"])
        identity = tuple(raw[key] for key in ("day", "split", "actor_id", "label", "purpose", "data_kind"))
        if session_key in sessions and sessions[session_key] != identity:
            raise DatasetError("A session crosses partitions, days or operator labels")
        sessions[session_key] = identity
        native = raw.get("native")
        if not isinstance(native, dict) or type(native.get("version")) is not int or native.get("version") != 1 or native.get("method") not in ("PIN", "fingerprint") \
                or native.get("outcome") not in ("verified", "failed", "canceled", "locked-out", "unavailable") \
                or type(native.get("eligible")) is not bool:
            raise DatasetError("Invalid native verification metadata")
        verified = native["method"] == "fingerprint" and native["outcome"] == "verified"
        sensors = {key: sensor_features(native.get(key), verified, units) for key, units in (("acceleration", "m/s²"), ("rotation", "rad/s"))}
        if native["method"] == "PIN" and any(native[key]["count"] for key in sensors):
            raise DatasetError("PIN motion is excluded")
        if native["eligible"] != any(value is not None for value in sensors.values()):
            raise DatasetError("Native eligibility disagrees with sensor quality/verification")
        records.append({key: raw[key] for key in (*required, "day", "split", "label", "purpose", "data_kind")}
                       | {"features": {name: None if any(sensors[key] is None for key in keys)
                                       else [v for key in keys for v in sensors[key]] for name, keys in MODALITIES.items()}})
    if len({r["data_kind"] for r in records}) > 1:
        raise DatasetError("Synthetic and physical study data must never be mixed")
    for group in group_records(records).values():
        days = {split: {r["day"] for r in group if r["split"] == split} for split in SPLITS}
        for earlier, later in (("train", "validation"), ("validation", "test"), ("train", "test")):
            if days[earlier] and days[later] and max(days[earlier]) >= min(days[later]):
                raise DatasetError("Use strictly later days for validation and test; never random window splits")
    return records


def load_records(path):
    path = Path(path)
    if path.stat().st_size > 100 * 1024 * 1024:
        raise DatasetError("Study file exceeds 100 MiB")
    rows = []
    with path.open(encoding="utf-8") as stream:
        for line in stream:
            if line.strip():
                rows.append(json.loads(line, parse_constant=reject_constant))
            if len(rows) > 100000:
                raise DatasetError("Study file exceeds 100000 windows")
    return validate_records(rows)


def group_records(records):
    groups = defaultdict(list)
    for row in records:
        groups[(row["owner_id"], row["device_id"])].append(row)
    return groups


def coverage(records, modality):
    sessions = defaultdict(list)
    for row in records:
        sessions[row["session_id"]].append(row)
    usable = sum(any(row["features"][modality] is not None for row in rows) for rows in sessions.values())
    return {"total_windows": len(records), "eligible_windows": sum(row["features"][modality] is not None for row in records),
            "total_sessions": len(sessions), "eligible_sessions": usable,
            "session_coverage": usable / len(sessions) if sessions else None}


def audit(records):
    return {"schema_version": 1, "data_kind": records[0]["data_kind"] if records else None,
            "status": "no_data" if not records else "audited", "deployable": False,
            "groups": [{"owner_id": owner, "device_id": device, "partitions": {
                split: {modality: coverage([r for r in rows if r["split"] == split], modality) for modality in MODALITIES}
                for split in SPLITS}} for (owner, device), rows in sorted(group_records(records).items())]}


def path_adjustment(n):
    if n <= 1:
        return 0.0
    if n == 2:
        return 1.0
    return 2 * (math.log(n - 1) + 0.5772156649015329) - 2 * (n - 1) / n


def export_forest(forest):
    trees = []
    for estimator, features in zip(forest.estimators_, forest.estimators_features_):
        tree = estimator.tree_
        trees.append({"feature_map": features.tolist(), "feature": tree.feature.tolist(), "threshold": tree.threshold.tolist(),
                      "left": tree.children_left.tolist(), "right": tree.children_right.tolist(), "samples": tree.n_node_samples.tolist()})
    return {"type": "isolation_forest", "max_samples": int(forest.max_samples_), "trees": trees}


def score_vectors(model, vectors):
    import numpy as np
    values = np.asarray(vectors, dtype=float)
    if values.ndim != 2 or values.shape[1] != len(model["feature_names"]) or not np.isfinite(values).all():
        raise DatasetError("Missing, non-finite or incompatible features; do not substitute zeros")
    scaled = (values - np.asarray(model["mean"])) / np.asarray(model["scale"])
    if model["estimator"]["type"] == "distance":
        return np.sqrt(np.mean(scaled ** 2, axis=1))
    scaled = scaled.astype(np.float32)
    estimator = model["estimator"]
    scores = []
    for row in scaled:
        lengths = []
        for tree in estimator["trees"]:
            node, depth = 0, 0
            while tree["left"][node] != -1:
                feature = tree["feature_map"][tree["feature"][node]]
                node = tree["left"][node] if float(row[feature]) <= tree["threshold"][node] else tree["right"][node]
                depth += 1
            lengths.append(depth + path_adjustment(tree["samples"][node]))
        normalizer = path_adjustment(estimator["max_samples"])
        scores.append(2 ** (-sum(lengths) / (len(lengths) * normalizer)) if normalizer else 0.5)
    return np.asarray(scores)


def session_scores(model, rows):
    grouped = defaultdict(list)
    for row in rows:
        grouped[row["session_id"]].append(row)
    output = []
    for session, windows in sorted(grouped.items()):
        vectors = [r["features"][model["modality"]] for r in windows if r["features"][model["modality"]] is not None]
        output.append({"session_id": session, "label": windows[0]["label"],
                       "score": float(max(score_vectors(model, vectors))) if vectors else None})
    return output


def calibrate(scored, far_cap=0.01, owner_high_cap=0.05):
    genuine = [row["score"] for row in scored if row["label"] == "owner" and row["score"] is not None]
    impostor = [row["score"] for row in scored if row["label"] == "impostor" and row["score"] is not None]
    if not genuine or not impostor:
        raise DatasetError("Threshold calibration requires labeled genuine and impostor validation sessions")
    candidates = sorted(set(genuine + impostor))
    lower = math.nextafter(min(candidates), -math.inf)
    for threshold in [math.nextafter(value, math.inf) for value in candidates]:
        if sum(score < threshold for score in impostor) / len(impostor) <= far_cap:
            lower = threshold
    index = min(len(genuine) - 1, max(0, math.ceil((1 - owner_high_cap) * len(genuine)) - 1))
    upper = max(math.nextafter(sorted(genuine)[index], math.inf), math.nextafter(lower, math.inf))
    return {"low_below": lower, "high_at_or_above": upper,
            "validation_impostor_direct_open_cap": far_cap, "validation_owner_high_risk_cap": owner_high_cap}


def route_score(score, thresholds):
    if score is None or not finite(score):
        return {"risk": "insufficient_data", "proposed_action": "pin"}
    if score < thresholds["low_below"]:
        return {"risk": "low", "proposed_action": "open"}
    if score < thresholds["high_at_or_above"]:
        return {"risk": "medium", "proposed_action": "fingerprint"}
    return {"risk": "high", "proposed_action": "pin"}


def proportion(successes, total):
    if not total:
        return {"count": successes, "total": total, "rate": None, "wilson_95": None}
    z, p = 1.959963984540054, successes / total
    den = 1 + z * z / total
    center = (p + z * z / (2 * total)) / den
    half = z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / den
    return {"count": successes, "total": total, "rate": p, "wilson_95": [max(0, center - half), min(1, center + half)]}


def metrics(scored, thresholds):
    result = {}
    for label in ("owner", "impostor"):
        rows = [r for r in scored if r["label"] == label]
        available = [r for r in rows if r["score"] is not None]
        routes = Counter(route_score(r["score"], thresholds)["risk"] for r in available)
        result[label] = {"sessions": len(rows), "scored_sessions": len(available),
                         "insufficient_sessions": len(rows) - len(available),
                         "coverage": proportion(len(available), len(rows)),
                         "direct_open": proportion(routes["low"], len(available)),
                         "fingerprint": proportion(routes["medium"], len(available)),
                         "pin": proportion(routes["high"], len(available))}
    genuine = [r for r in scored if r["label"] == "owner" and r["score"] is not None]
    result["owner_behavioral_rejection_at_low_cutoff"] = proportion(
        sum(r["score"] >= thresholds["low_below"] for r in genuine), len(genuine))
    available = [r for r in scored if r["score"] is not None]
    if {r["label"] for r in available} == {"owner", "impostor"}:
        from sklearn.metrics import roc_curve
        far, tpr, cutoffs = roc_curve([r["label"] == "owner" for r in available], [-r["score"] for r in available], drop_intermediate=False)
        index = min(range(len(far)), key=lambda i: abs(float(far[i]) - (1 - float(tpr[i]))))
        result["eer_nearest_operating_point"] = {"estimate": (float(far[index]) + 1 - float(tpr[index])) / 2,
            "far": float(far[index]), "frr": 1 - float(tpr[index]),
            "anomaly_cutoff": float(-cutoffs[index]) if math.isfinite(float(cutoffs[index])) else None,
            "note": "Descriptive nearest empirical ROC point, not an interpolated exact EER and never used to tune the frozen routing thresholds."}
    result["metric_scope"] = "Session-level behavioral routing only; step-up is not end-to-end authentication rejection. Wilson intervals do not account for correlated sessions."
    return result


def train_evaluate(records, allow_synthetic=False, trees=200, seed=42, min_train=15, min_train_days=3, min_evaluation=5):
    import numpy as np
    import sklearn
    from sklearn.ensemble import IsolationForest
    if records and records[0]["data_kind"] == "synthetic" and not allow_synthetic:
        raise DatasetError("Synthetic data is only permitted for explicit software checks, never research evidence")
    result = audit(records)
    result.update(status="insufficient_data", models=[], unavailable=[], limitations=[
        "Observation only; no model authorizes Android app access.",
        "Native verification outcome is not the operator's owner/impostor label.",
        "Per-owner, same-device temporal evaluation does not establish unseen-participant or cross-device generalization.",
        "Magnitude mean and standard deviation are exploratory identity features; RMS is excluded because it is algebraically redundant.",
        "Minimum sample counts are engineering feasibility checks, not sufficient evidence of security.",
        "Training, validation and test data require documented participant consent and independent operator labels.",
    ], versions={"numpy": np.__version__, "scikit_learn": sklearn.__version__}, seed=seed)
    models = []
    for (owner, device), rows in sorted(group_records(records).items()):
        partitions = {split: [r for r in rows if r["split"] == split] for split in SPLITS}
        for modality, feature_names in FEATURES.items():
            training = [r for r in partitions["train"] if r["features"][modality] is not None]
            supported = len({r["session_id"] for r in training}) >= min_train and len({r["day"] for r in training}) >= min_train_days
            for split in ("validation", "test"):
                for label in ("owner", "impostor"):
                    supported &= len({r["session_id"] for r in partitions[split] if r["label"] == label and r["features"][modality] is not None}) >= min_evaluation
            if not supported:
                result["unavailable"].append({"owner_id": owner, "device_id": device, "modality": modality,
                                              "reason": "Insufficient eligible owner training days/sessions or labeled validation/test sessions"})
                continue
            x = np.asarray([r["features"][modality] for r in training])
            mean, scale = x.mean(axis=0), x.std(axis=0)
            scale = np.where(scale > 1e-6, scale, 1.0)
            z = (x - mean) / scale
            forest = IsolationForest(n_estimators=trees, max_samples=min(256, len(x)), contamination="auto", random_state=seed, n_jobs=1).fit(z)
            for name, estimator in (("distance", {"type": "distance"}), ("isolation_forest", export_forest(forest))):
                model = {"schema_version": 1, "mode": "observation_only", "deployable": False,
                         "data_kind": records[0]["data_kind"], "owner_id": owner, "device_id": device, "modality": modality,
                         "name": name, "feature_names": list(feature_names), "mean": mean.tolist(), "scale": scale.tolist(),
                         "estimator": estimator, "seed": seed,
                         "training": {"sessions": len({r["session_id"] for r in training}), "windows": len(training),
                                      "days": sorted({r["day"] for r in training})}}
                if name == "isolation_forest" and not np.allclose(score_vectors(model, x), -forest.score_samples(z), rtol=1e-10, atol=1e-10):
                    raise DatasetError("Exported Isolation Forest scores disagree with the training library")
                validation = session_scores(model, partitions["validation"])
                model["thresholds"] = calibrate(validation)
                held_out = session_scores(model, partitions["test"])
                model["model_id"] = hashlib.sha256(json.dumps(model, sort_keys=True, allow_nan=False).encode()).hexdigest()[:20]
                models.append(model)
                result["models"].append({key: model[key] for key in ("model_id", "owner_id", "device_id", "modality", "name", "training", "thresholds")}
                                       | {"validation": metrics(validation, model["thresholds"]), "test": metrics(held_out, model["thresholds"])})
    if models:
        result["status"] = "software_check_only" if records[0]["data_kind"] == "synthetic" else "offline_evaluated_not_deployable"
    return models, result


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def main(argv=None):
    parser = argparse.ArgumentParser(description="GhostAuth offline behavioral research; no Android enforcement")
    parser.add_argument("command", choices=("audit", "train-evaluate"))
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--allow-synthetic", action="store_true")
    args = parser.parse_args(argv)
    try:
        records = load_records(args.dataset)
        if args.command == "audit":
            write_json(args.output, audit(records))
            print(f"Audited {len(records)} windows; no model trained. Report: {args.output}")
            return 0
        if args.output.exists():
            raise DatasetError("Choose a new run directory; previous results are never overwritten")
        models, report = train_evaluate(records, allow_synthetic=args.allow_synthetic)
        report["dataset_sha256"] = hashlib.sha256(args.dataset.read_bytes()).hexdigest()
        write_json(args.output / "evaluation.json", report)
        for model in models:
            write_json(args.output / f"{model['model_id']}.model.json", model)
        print(f"{report['status']}: {len(models)} observation-only models. Report: {args.output / 'evaluation.json'}")
        return 0 if models else 2
    except (DatasetError, ValueError, KeyError, OSError) as error:
        parser.exit(2, f"Research input error: {error}\n")


if __name__ == "__main__":
    raise SystemExit(main())
