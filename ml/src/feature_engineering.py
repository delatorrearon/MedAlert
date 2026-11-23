"""Feature engineering aligned with website_capstone_v0.9.2/src/utils/mlEngine.ts."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

FEATURE_COLUMNS = [
    "sleep",
    "exercise",
    "water",
    "caffeine",
    "bmi",
    "age",
    "calories_deviation",
    "protein",
    "carbs",
    "fats",
    "smoking",
    "alcohol",
    "processed_food",
]

SMOKING_MAP = {"never": 0.0, "former": 0.5, "current": 1.0}
ALCOHOL_MAP = {"never": 0.2, "rarely": 0.2, "moderately": 0.6, "frequently": 1.0}
PROCESSED_FOOD_MAP = {"rarely": 0.1, "sometimes": 0.5, "frequently": 1.0}


@dataclass
class FeatureVector:
    sleep: float
    exercise: float
    water: float
    caffeine: float
    bmi: float
    age: float
    calories_deviation: float
    protein: float
    carbs: float
    fats: float
    smoking: float
    alcohol: float
    processed_food: float

    def to_array(self) -> np.ndarray:
        return np.array(
            [
                self.sleep,
                self.exercise,
                self.water,
                self.caffeine,
                self.bmi,
                self.age,
                self.calories_deviation,
                self.protein,
                self.carbs,
                self.fats,
                self.smoking,
                self.alcohol,
                self.processed_food,
            ],
            dtype=float,
        )


def encode_smoking(value: str | float | None) -> float:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return 0.0
    return SMOKING_MAP.get(str(value).lower(), 0.0)


def encode_alcohol(value: str | float | None) -> float:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return 0.2
    return ALCOHOL_MAP.get(str(value).lower(), 0.2)


def encode_processed_food(value: str | float | None) -> float:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return 0.1
    return PROCESSED_FOOD_MAP.get(str(value).lower(), 0.1)


def compute_bmi(weight_kg: float, height_cm: float) -> float:
    if height_cm <= 0:
        return 24.0
    return weight_kg / ((height_cm / 100) ** 2)


def compute_calories_deviation(calories: float, target_calories: float = 2000) -> float:
    return abs(calories - target_calories) / target_calories


def row_to_feature_vector(
    log_row: pd.Series,
    profile_row: pd.Series | None,
    target_calories: float = 2000,
) -> FeatureVector:
    age = float(profile_row["age"]) if profile_row is not None and pd.notna(profile_row.get("age")) else 30.0
    profile_weight = float(profile_row["weight_kg"]) if profile_row is not None and pd.notna(profile_row.get("weight_kg")) else 70.0
    height_cm = float(profile_row["height_cm"]) if profile_row is not None and pd.notna(profile_row.get("height_cm")) else 170.0

    weight = float(log_row["weight_kg"]) if pd.notna(log_row.get("weight_kg")) else profile_weight
    bmi = compute_bmi(weight, height_cm)

    smoking = encode_smoking(profile_row["smoking"] if profile_row is not None else None)
    alcohol = encode_alcohol(profile_row["alcohol"] if profile_row is not None else None)
    processed_food = encode_processed_food(profile_row["processed_food"] if profile_row is not None else None)

    calories = float(log_row.get("calories", 0) or 0)
    calories_deviation = compute_calories_deviation(calories, target_calories)

    return FeatureVector(
        sleep=float(log_row.get("sleep_hours", 7)),
        exercise=float(log_row.get("exercise_minutes", 0)),
        water=float(log_row.get("water_glasses", 0)),
        caffeine=float(log_row.get("caffeine_drinks", 0)),
        bmi=bmi,
        age=age,
        calories_deviation=calories_deviation,
        protein=float(log_row.get("protein_g", 0)),
        carbs=float(log_row.get("carbs_g", 0)),
        fats=float(log_row.get("fats_g", 0)),
        smoking=smoking,
        alcohol=alcohol,
        processed_food=processed_food,
    )


def build_feature_matrix(
    logs: pd.DataFrame,
    profiles: pd.DataFrame,
    target_calories: float = 2000,
) -> pd.DataFrame:
    profile_index = profiles.set_index("user_id") if not profiles.empty else pd.DataFrame()
    rows: list[dict[str, float | str]] = []

    for _, log_row in logs.iterrows():
        profile_row = profile_index.loc[log_row["user_id"]] if log_row["user_id"] in profile_index.index else None
        fv = row_to_feature_vector(log_row, profile_row, target_calories)
        rows.append(
            {
                "user_id": log_row["user_id"],
                "date": log_row["date"],
                **{col: getattr(fv, col) for col in FEATURE_COLUMNS},
            }
        )

    return pd.DataFrame(rows)


def heuristic_risk_score(fv: FeatureVector) -> float:
    """Proxy label from mlEngine.ts evaluateModel() — use until real labels are available."""
    return (
        max(0, 8 - fv.sleep) * 8
        + max(0, 30 - fv.exercise) * 0.8
        + max(0, 8 - fv.water) * 5
        + max(0, fv.caffeine - 3) * 4
        + max(0, fv.bmi - 25) * 3
        + fv.calories_deviation * 40
        + fv.smoking * 18
        + fv.processed_food * 10
    )


def derive_proxy_labels(
    features: pd.DataFrame,
    high_risk_threshold: float = 45,
) -> pd.DataFrame:
    labels = features.copy()
    scores = []
    for _, row in features.iterrows():
        fv = FeatureVector(**{col: row[col] for col in FEATURE_COLUMNS})
        scores.append(heuristic_risk_score(fv))
    labels["overall_risk"] = scores
    labels["high_risk_binary"] = (labels["overall_risk"] >= high_risk_threshold).astype(int)
    return labels[["user_id", "date", "overall_risk", "high_risk_binary"]]
