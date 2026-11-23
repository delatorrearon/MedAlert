"""Load, validate, and merge MedAlert training datasets."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import yaml

from feature_engineering import FEATURE_COLUMNS, build_feature_matrix, derive_proxy_labels


def load_config(config_path: str | Path = "configs/train_config.yaml") -> dict:
    with open(config_path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_schema(schema_path: str | Path = "data/schema.json") -> dict:
    with open(schema_path, encoding="utf-8") as f:
        return json.load(f)


def _resolve_path(base_dir: Path, relative: str) -> Path:
    path = Path(relative)
    return path if path.is_absolute() else base_dir / path


def load_csv(path: Path, required_columns: list[str] | None = None) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {path}")

    df = pd.read_csv(path)
    if df.empty:
        raise ValueError(f"Dataset is empty (headers only): {path}")

    if required_columns:
        missing = [col for col in required_columns if col not in df.columns]
        if missing:
            raise ValueError(f"Missing columns in {path.name}: {missing}")

    return df


def validate_profiles(df: pd.DataFrame) -> pd.DataFrame:
    required = ["user_id", "age", "weight_kg", "height_cm", "smoking", "alcohol", "processed_food"]
    missing = [col for col in required if col not in df.columns]
    if missing:
        raise ValueError(f"profiles.csv missing required columns: {missing}")
    return df.drop_duplicates(subset=["user_id"], keep="last")


def validate_daily_logs(df: pd.DataFrame) -> pd.DataFrame:
    required = [
        "user_id",
        "date",
        "sleep_hours",
        "exercise_minutes",
        "water_glasses",
        "caffeine_drinks",
        "calories",
        "protein_g",
        "carbs_g",
        "fats_g",
    ]
    missing = [col for col in required if col not in df.columns]
    if missing:
        raise ValueError(f"daily_logs.csv missing required columns: {missing}")

    df = df.copy()
    df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    return df.drop_duplicates(subset=["user_id", "date"], keep="last")


def validate_labels(df: pd.DataFrame) -> pd.DataFrame:
    required = [
        "user_id",
        "date",
        "cardiovascular_risk",
        "metabolic_risk",
        "nutritional_risk",
        "sleep_risk",
    ]
    missing = [col for col in required if col not in df.columns]
    if missing:
        raise ValueError(f"labels.csv missing required columns: {missing}")

    df = df.copy()
    df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    return df.drop_duplicates(subset=["user_id", "date"], keep="last")


def load_datasets(config: dict | None = None, base_dir: Path | None = None) -> dict[str, pd.DataFrame]:
    config = config or load_config()
    base_dir = base_dir or Path(__file__).resolve().parent.parent

    processed_dir = _resolve_path(base_dir, config["data"]["processed_dir"])

    profiles = validate_profiles(load_csv(processed_dir / config["data"]["profiles_file"]))
    logs = validate_daily_logs(load_csv(processed_dir / config["data"]["daily_logs_file"]))

    labels_path = processed_dir / config["data"]["labels_file"]
    if labels_path.exists():
        try:
            labels = validate_labels(load_csv(labels_path))
        except ValueError:
            labels = pd.DataFrame()
    else:
        labels = pd.DataFrame()

    return {"profiles": profiles, "daily_logs": logs, "labels": labels}


def build_training_frame(config: dict | None = None, base_dir: Path | None = None) -> pd.DataFrame:
    config = config or load_config()
    base_dir = base_dir or Path(__file__).resolve().parent.parent
    data = load_datasets(config, base_dir)

    features = build_feature_matrix(
        data["daily_logs"],
        data["profiles"],
        target_calories=config["features"]["target_calories"],
    )

    labels = data["labels"]
    has_real_labels = (
        not labels.empty
        and "high_risk_binary" in labels.columns
        and labels["high_risk_binary"].notna().any()
    )

    target_col = config["training"]["classification_target"]

    if not has_real_labels:
        proxy = derive_proxy_labels(
            features,
            high_risk_threshold=config["training"].get("high_risk_threshold", 45),
        )
        merged = features.merge(proxy, on=["user_id", "date"], how="left")
    else:
        merged = features.merge(labels, on=["user_id", "date"], how="left")
        if target_col not in merged.columns:
            threshold = config["training"].get("high_risk_threshold", 50)
            risk_col = "overall_risk" if "overall_risk" in merged.columns else "cardiovascular_risk"
            merged[target_col] = (merged[risk_col] >= threshold).astype("Int64")
        # NHANES rows (and others) without outcome labels — keep only labeled rows
        merged = merged[merged[target_col].notna()]

    merged[target_col] = merged[target_col].astype(int)
    return merged.dropna(subset=FEATURE_COLUMNS)


def get_feature_target_split(
    frame: pd.DataFrame,
    classification_target: str = "high_risk_binary",
) -> tuple[pd.DataFrame, pd.Series]:
    X = frame[FEATURE_COLUMNS].copy()
    y = frame[classification_target].astype(int)
    return X, y
