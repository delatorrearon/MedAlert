"""Train MedAlert health risk models.

Usage (from ml/ directory):
  pip install -r requirements.txt
  python src/train.py
  python src/train.py --config configs/train_config.yaml
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import StratifiedShuffleSplit, train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.tree import DecisionTreeClassifier

sys.path.insert(0, str(Path(__file__).resolve().parent))

from data_loader import build_training_frame, get_feature_target_split, load_config
from feature_engineering import FEATURE_COLUMNS


def evaluate(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    return {
        "accuracy": round(accuracy_score(y_true, y_pred) * 100, 1),
        "precision": round(precision_score(y_true, y_pred, zero_division=0) * 100, 1),
        "recall": round(recall_score(y_true, y_pred, zero_division=0) * 100, 1),
        "f1Score": round(f1_score(y_true, y_pred, zero_division=0) * 100, 1),
    }


def train_models(config: dict, base_dir: Path) -> dict:
    frame = build_training_frame(config, base_dir)
    target = config["training"]["classification_target"]

    max_samples = config["training"].get("max_samples")
    if max_samples and len(frame) > max_samples:
        print(f"Subsampling {len(frame)} -> {max_samples} rows (stratified by {target})")
        splitter = StratifiedShuffleSplit(
            n_splits=1,
            train_size=max_samples,
            random_state=config["training"]["random_state"],
        )
        idx, _ = next(splitter.split(frame, frame[target]))
        frame = frame.iloc[idx].reset_index(drop=True)

    X, y = get_feature_target_split(frame, target)

    if len(y.unique()) < 2:
        raise ValueError(
            "Need at least two classes in the target column. "
            "Add labels.csv with high_risk_binary values, or use a larger dataset."
        )

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=config["training"]["test_size"],
        random_state=config["training"]["random_state"],
        stratify=y,
    )

    lr_cfg = config["models"]["logistic_regression"]
    dt_cfg = config["models"]["decision_tree"]
    rf_cfg = config["models"]["random_forest"]

    models = {
        "logistic_regression": Pipeline(
            [
                ("scaler", StandardScaler()),
                (
                    "clf",
                    LogisticRegression(
                        max_iter=lr_cfg["max_iter"],
                        class_weight=lr_cfg.get("class_weight"),
                        random_state=config["training"]["random_state"],
                    ),
                ),
            ]
        ),
        "decision_tree": DecisionTreeClassifier(
            max_depth=dt_cfg["max_depth"],
            min_samples_leaf=dt_cfg["min_samples_leaf"],
            random_state=dt_cfg["random_state"],
        ),
        "random_forest": RandomForestClassifier(
            n_estimators=rf_cfg["n_estimators"],
            max_depth=rf_cfg["max_depth"],
            random_state=rf_cfg["random_state"],
            class_weight="balanced",
            n_jobs=rf_cfg.get("n_jobs", -1),
        ),
    }

    results: dict = {"metrics": {}, "feature_columns": FEATURE_COLUMNS, "samples": len(frame)}
    models_dir = base_dir / config["output"]["models_dir"]
    models_dir.mkdir(parents=True, exist_ok=True)

    for name, model in models.items():
        model.fit(X_train, y_train)
        preds = model.predict(X_test)
        results["metrics"][name] = evaluate(y_test.to_numpy(), preds)
        joblib.dump(model, models_dir / f"{name}.joblib")
        print(f"\n{name}:")
        print(classification_report(y_test, preds, zero_division=0))

    # Ensemble: average predicted probabilities from LR + DT (matches app concept)
    lr_probs = models["logistic_regression"].predict_proba(X_test)[:, 1]  # type: ignore[index]
    dt_probs = models["decision_tree"].predict_proba(X_test)[:, 1]
    ensemble_probs = (lr_probs + dt_probs) / 2
    ensemble_preds = (ensemble_probs >= 0.5).astype(int)
    results["metrics"]["ensemble"] = evaluate(y_test.to_numpy(), ensemble_preds)

    lr_pipe = models["logistic_regression"]
    scaler = lr_pipe.named_steps["scaler"]  # type: ignore[attr-defined]
    clf = lr_pipe.named_steps["clf"]  # type: ignore[attr-defined]

    export_payload = {
        "feature_columns": FEATURE_COLUMNS,
        "logistic_regression": {
            "intercept": float(clf.intercept_[0]),
            "coefficients": dict(zip(FEATURE_COLUMNS, clf.coef_[0].tolist())),
            "scaler_mean": dict(zip(FEATURE_COLUMNS, scaler.mean_.tolist())),
            "scaler_scale": dict(zip(FEATURE_COLUMNS, scaler.scale_.tolist())),
        },
        "metrics": results["metrics"],
        "version": "1.0",
        "trained_on": "heart_2020_cleaned + sleep_health",
    }

    export_path = base_dir / config["output"]["export_file"]
    export_path.parent.mkdir(parents=True, exist_ok=True)
    with open(export_path, "w", encoding="utf-8") as f:
        json.dump(export_payload, f, indent=2)

    app_model_path = base_dir.parent / "website_capstone_v0.9.2" / "src" / "data" / "trainedModel.json"
    app_model_path.parent.mkdir(parents=True, exist_ok=True)
    with open(app_model_path, "w", encoding="utf-8") as f:
        json.dump(export_payload, f, indent=2)

    print(f"\nSaved models to {models_dir}")
    print(f"Exported coefficients to {export_path}")
    print(f"Copied to app: {app_model_path}")
    return results


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/train_config.yaml")
    args = parser.parse_args()

    base_dir = Path(__file__).resolve().parent.parent
    config = load_config(base_dir / args.config)

    try:
        results = train_models(config, base_dir)
        print("\nTraining complete.")
        print(json.dumps(results["metrics"], indent=2))
    except FileNotFoundError as exc:
        print(f"Dataset not ready: {exc}")
        print("\nNext steps:")
        print("  1. Place your CSV files in ml/data/raw/")
        print("  2. Run: python src/prepare_data.py --profiles data/raw/... --logs data/raw/...")
        print("  3. Run: python src/train.py")
    except ValueError as exc:
        print(f"Training error: {exc}")


if __name__ == "__main__":
    main()
