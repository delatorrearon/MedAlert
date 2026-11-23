"""Import datasets/ folder sources into MedAlert processed CSV schema.

Expected files in datasets/ (download CSVs from Kaggle if missing):
  - DEMO_L.xpt                          NHANES demographics (you have this)
  - heart_2020_cleaned.csv              Kaggle heart disease
  - Sleep_health_and_lifestyle_dataset.csv   Kaggle sleep health

Usage (from ml/):
  python src/import_datasets.py --all
  python src/import_datasets.py --nhanes --heart --sleep
"""

from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

DATASETS_DIR = Path(__file__).resolve().parent.parent.parent / "datasets"
PROCESSED_DIR = Path(__file__).resolve().parent.parent / "data" / "processed"

# Midpoint ages for BRFSS age categories (heart dataset)
AGE_CATEGORY_MAP = {
    "18-24": 21,
    "25-29": 27,
    "30-34": 32,
    "35-39": 37,
    "40-44": 42,
    "45-49": 47,
    "50-54": 52,
    "55-59": 57,
    "60-64": 62,
    "65-69": 67,
    "70-74": 72,
    "75-79": 77,
    "80 or older": 82,
    "80+": 82,
}

BMI_CATEGORY_TO_KG = {
    "underweight": 52.0,
    "normal": 68.0,
    "normal weight": 68.0,
    "overweight": 82.0,
    "obese": 98.0,
}


def _today() -> str:
    return date.today().isoformat()


def _yes_no_smoking(val) -> str:
    s = str(val).strip().lower()
    if s in ("yes", "1", "current", "true"):
        return "current"
    if s in ("former", "ex-smoker"):
        return "former"
    return "never"


def _yes_no_alcohol(val) -> str:
    s = str(val).strip().lower()
    return "frequently" if s in ("yes", "1", "true", "heavy") else "rarely"


def _yes_no_activity(val) -> str:
    s = str(val).strip().lower()
    if s in ("yes", "1", "true"):
        return "active"
    return "sedentary"


def _bmi_from_value(val, default_height_cm: float = 170.0) -> tuple[float, float]:
    """Return (weight_kg, height_cm) from numeric BMI or category string."""
    if pd.isna(val):
        return 70.0, default_height_cm
    try:
        bmi = float(val)
        weight = bmi * ((default_height_cm / 100) ** 2)
        return round(weight, 1), default_height_cm
    except (TypeError, ValueError):
        key = str(val).strip().lower()
        weight = BMI_CATEGORY_TO_KG.get(key, 70.0)
        return weight, default_height_cm


def import_nhanes_demo(path: Path) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """NHANES DEMO_L: demographics only (age, gender). No daily lifestyle logs in this file."""
    df = pd.read_sas(path)
    df["SEQN"] = df["SEQN"].astype(int)

    profiles = pd.DataFrame(
        {
            "user_id": "nhanes_" + df["SEQN"].astype(str),
            "age": df["RIDAGEYR"].fillna(30).astype(int),
            "gender": df["RIAGENDR"].map({1.0: "male", 2.0: "female"}).fillna("other"),
            "weight_kg": 70.0,  # requires BMX_L.xpt for real values
            "height_cm": 170.0,
            "smoking": "never",
            "alcohol": "rarely",
            "processed_food": "sometimes",
            "activity_level": "moderate",
            "diet_type": "balanced",
            "vegetable_intake": "often",
            "fruit_intake": "often",
            "medical_conditions": "",
        }
    )

    # One snapshot log per participant (placeholder — add DIQ/SLQ/BMX XPT files for real values)
    logs = pd.DataFrame(
        {
            "user_id": profiles["user_id"],
            "date": _today(),
            "sleep_hours": 7.0,
            "exercise_minutes": 30.0,
            "water_glasses": 8.0,
            "caffeine_drinks": 2.0,
            "calories": 2000.0,
            "protein_g": 60.0,
            "carbs_g": 250.0,
            "fats_g": 65.0,
            "weight_kg": profiles["weight_kg"],
        }
    )

    # DEMO_L has no outcome labels — proxy labels are derived during training
    labels = pd.DataFrame(
        columns=[
            "user_id",
            "date",
            "cardiovascular_risk",
            "metabolic_risk",
            "nutritional_risk",
            "sleep_risk",
            "overall_risk",
            "high_risk_binary",
        ]
    )

    return profiles, logs, labels


def import_heart_disease(path: Path) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Kaggle heart_2020_cleaned.csv → profiles, logs, labels."""
    df = pd.read_csv(path)
    df.columns = [c.strip() for c in df.columns]

    def map_age(row) -> int:
        if "AgeCategory" in row and pd.notna(row["AgeCategory"]):
            return AGE_CATEGORY_MAP.get(str(row["AgeCategory"]).strip(), 45)
        if "Age" in row and pd.notna(row["Age"]):
            return int(row["Age"])
        return 45

    profiles_rows = []
    logs_rows = []
    labels_rows = []

    for i, row in df.iterrows():
        user_id = f"heart_{i:06d}"
        weight, height = _bmi_from_value(row.get("BMI", 27))

        sex = str(row.get("Sex", "")).strip().lower()
        gender = "male" if sex in ("male", "m") else "female" if sex in ("female", "f") else "other"

        profiles_rows.append(
            {
                "user_id": user_id,
                "age": map_age(row),
                "gender": gender,
                "weight_kg": weight,
                "height_cm": height,
                "smoking": _yes_no_smoking(row.get("Smoking", "No")),
                "alcohol": _yes_no_alcohol(row.get("AlcoholDrinking", "No")),
                "processed_food": "sometimes",
                "activity_level": _yes_no_activity(row.get("PhysicalActivity", "No")),
                "diet_type": "balanced",
                "vegetable_intake": "often",
                "fruit_intake": "often",
                "medical_conditions": "|".join(
                    c
                    for c, col in [
                        ("diabetes", "Diabetic"),
                        ("stroke", "Stroke"),
                        ("asthma", "Asthma"),
                        ("kidney_disease", "KidneyDisease"),
                    ]
                    if str(row.get(col, "No")).strip().lower() == "yes"
                ),
            }
        )

        sleep_h = float(row.get("SleepTime", 7) or 7)
        phys_health = float(row.get("PhysicalHealth", 0) or 0)
        exercise = max(0.0, 30.0 - phys_health * 2)  # proxy: fewer bad-health days → more activity

        logs_rows.append(
            {
                "user_id": user_id,
                "date": _today(),
                "sleep_hours": sleep_h,
                "exercise_minutes": exercise,
                "water_glasses": 8.0,
                "caffeine_drinks": 2.0,
                "calories": 2100.0,
                "protein_g": 65.0,
                "carbs_g": 260.0,
                "fats_g": 70.0,
                "weight_kg": weight,
            }
        )

        has_hd = str(row.get("HeartDisease", "No")).strip().lower() == "yes"
        cardio = 85.0 if has_hd else 25.0
        labels_rows.append(
            {
                "user_id": user_id,
                "date": _today(),
                "cardiovascular_risk": cardio,
                "metabolic_risk": 70.0 if str(row.get("Diabetic", "No")).lower() == "yes" else 30.0,
                "nutritional_risk": 40.0,
                "sleep_risk": max(0.0, min(100.0, (7 - sleep_h) * 15)),
                "overall_risk": cardio,
                "high_risk_binary": int(has_hd),
            }
        )

    return pd.DataFrame(profiles_rows), pd.DataFrame(logs_rows), pd.DataFrame(labels_rows)


def import_sleep_health(path: Path) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Kaggle Sleep_health_and_lifestyle_dataset.csv → profiles, logs, labels."""
    df = pd.read_csv(path)
    df.columns = [c.strip() for c in df.columns]

    profiles_rows = []
    logs_rows = []
    labels_rows = []

    for _, row in df.iterrows():
        pid = row.get("Person ID", row.name)
        user_id = f"sleep_{int(pid)}"
        weight, height = _bmi_from_value(row.get("BMI Category", "Normal"))

        gender = str(row.get("Gender", "Male")).strip().lower()
        gender = "male" if gender.startswith("m") else "female" if gender.startswith("f") else "other"

        activity_min = float(row.get("Physical Activity Level", 30) or 30)
        sleep_h = float(row.get("Sleep Duration", 7) or 7)
        steps = float(row.get("Daily Steps", 5000) or 5000)
        stress = float(row.get("Stress Level", 5) or 5)

        profiles_rows.append(
            {
                "user_id": user_id,
                "age": int(row.get("Age", 35)),
                "gender": gender,
                "weight_kg": weight,
                "height_cm": height,
                "smoking": "never",
                "alcohol": "rarely",
                "processed_food": "sometimes",
                "activity_level": "active" if activity_min >= 60 else "moderate" if activity_min >= 30 else "light",
                "diet_type": "balanced",
                "vegetable_intake": "often",
                "fruit_intake": "often",
                "medical_conditions": "",
            }
        )

        logs_rows.append(
            {
                "user_id": user_id,
                "date": _today(),
                "sleep_hours": sleep_h,
                "exercise_minutes": activity_min,
                "water_glasses": 8.0,
                "caffeine_drinks": min(8.0, stress * 0.6),
                "calories": 2000.0,
                "protein_g": 65.0,
                "carbs_g": 250.0,
                "fats_g": 65.0,
                "weight_kg": weight,
            }
        )

        disorder = str(row.get("Sleep Disorder", "None")).strip().lower()
        quality = float(row.get("Quality of Sleep", 6) or 6)
        sleep_risk = 75.0 if disorder not in ("none", "nan", "") else max(0.0, (8 - quality) * 12)

        labels_rows.append(
            {
                "user_id": user_id,
                "date": _today(),
                "cardiovascular_risk": 35.0,
                "metabolic_risk": 40.0,
                "nutritional_risk": 35.0,
                "sleep_risk": sleep_risk,
                "overall_risk": sleep_risk,
                "high_risk_binary": int(sleep_risk >= 50),
            }
        )

    return pd.DataFrame(profiles_rows), pd.DataFrame(logs_rows), pd.DataFrame(labels_rows)


def merge_sources(
    parts: list[tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]],
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    profiles = pd.concat([p for p, _, _ in parts], ignore_index=True)
    logs = pd.concat([l for _, l, _ in parts], ignore_index=True)
    labels = pd.concat([lb for _, _, lb in parts], ignore_index=True)
    return profiles, logs, labels


def write_processed(
    profiles: pd.DataFrame,
    logs: pd.DataFrame,
    labels: pd.DataFrame,
    output_dir: Path,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    profiles.to_csv(output_dir / "profiles.csv", index=False)
    logs.to_csv(output_dir / "daily_logs.csv", index=False)
    labels.to_csv(output_dir / "labels.csv", index=False)
    print(f"Wrote {len(profiles)} profiles, {len(logs)} logs, {len(labels)} labels -> {output_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Import datasets/ into MedAlert ML schema")
    parser.add_argument("--all", action="store_true", help="Import every source found")
    parser.add_argument("--nhanes", action="store_true")
    parser.add_argument("--heart", action="store_true")
    parser.add_argument("--sleep", action="store_true")
    parser.add_argument("--datasets-dir", type=str, default=str(DATASETS_DIR))
    parser.add_argument("--output-dir", type=str, default=str(PROCESSED_DIR))
    args = parser.parse_args()

    if not (args.all or args.nhanes or args.heart or args.sleep):
        args.all = True

    base = Path(args.datasets_dir)
    parts: list[tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]] = []
    status: list[str] = []

    nhanes_path = base / "DEMO_L.xpt"
    heart_path = base / "heart_2020_cleaned.csv"
    sleep_path = base / "Sleep_health_and_lifestyle_dataset.csv"

    if (args.all or args.nhanes) and nhanes_path.exists():
        print(f"Importing NHANES: {nhanes_path.name}")
        parts.append(import_nhanes_demo(nhanes_path))
        status.append(f"NHANES DEMO: {len(parts[-1][0])} users")
    elif args.all or args.nhanes:
        status.append("NHANES: DEMO_L.xpt not found")

    if (args.all or args.heart) and heart_path.exists():
        print(f"Importing Heart Disease: {heart_path.name}")
        parts.append(import_heart_disease(heart_path))
        status.append(f"Heart disease: {len(parts[-1][0])} rows")
    elif args.all or args.heart:
        status.append(
            "Heart disease: missing heart_2020_cleaned.csv — download from Kaggle "
            "(personal-key-indicators-of-heart-disease) into datasets/"
        )

    if (args.all or args.sleep) and sleep_path.exists():
        print(f"Importing Sleep Health: {sleep_path.name}")
        parts.append(import_sleep_health(sleep_path))
        status.append(f"Sleep health: {len(parts[-1][0])} rows")
    elif args.all or args.sleep:
        status.append(
            "Sleep health: missing Sleep_health_and_lifestyle_dataset.csv — download from Kaggle "
            "(sleep-health-and-lifestyle-dataset) into datasets/"
        )

    print("\n--- Import status ---")
    for line in status:
        print(f"  {line}")

    if not parts:
        print("\nNo data imported. Add CSV files to datasets/ and run again.")
        return

    profiles, logs, labels = merge_sources(parts)
    write_processed(profiles, logs, labels, Path(args.output_dir))
    print("\nNext: python src/validate_dataset.py && python src/train.py")


if __name__ == "__main__":
    main()
