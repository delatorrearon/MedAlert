"""Prepare raw CSV files into the processed MedAlert schema.

Usage:
  python src/prepare_data.py --profiles data/raw/my_profiles.csv --logs data/raw/my_logs.csv
  python src/prepare_data.py --profiles data/raw/profiles.csv --logs data/raw/logs.csv --labels data/raw/labels.csv
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

# Column rename maps for common external dataset naming conventions
PROFILE_ALIASES = {
    "userid": "user_id",
    "user": "user_id",
    "id": "user_id",
    "weight": "weight_kg",
    "height": "height_cm",
    "processedfood": "processed_food",
    "activitylevel": "activity_level",
    "diettype": "diet_type",
    "vegetableintake": "vegetable_intake",
    "fruitintake": "fruit_intake",
    "medicalconditions": "medical_conditions",
}

LOG_ALIASES = {
    "userid": "user_id",
    "user": "user_id",
    "sleep": "sleep_hours",
    "sleephours": "sleep_hours",
    "exercise": "exercise_minutes",
    "exerciseminutes": "exercise_minutes",
    "water": "water_glasses",
    "waterintake": "water_glasses",
    "caffeine": "caffeine_drinks",
    "caffeineintake": "caffeine_drinks",
    "protein": "protein_g",
    "carbs": "carbs_g",
    "carbohydrates": "carbs_g",
    "fats": "fats_g",
    "fat": "fats_g",
}

LABEL_ALIASES = {
    "userid": "user_id",
    "user": "user_id",
    "cardiovascular": "cardiovascular_risk",
    "metabolic": "metabolic_risk",
    "nutritional": "nutritional_risk",
    "sleep": "sleep_risk",
    "overall": "overall_risk",
    "highrisk": "high_risk_binary",
}


def normalize_columns(df: pd.DataFrame, aliases: dict[str, str]) -> pd.DataFrame:
    renamed = {}
    for col in df.columns:
        key = col.strip().lower().replace(" ", "_").replace("-", "_")
        renamed[col] = aliases.get(key, key)
    return df.rename(columns=renamed)


def write_processed(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False)
    print(f"Wrote {len(df)} rows -> {path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert raw CSVs into MedAlert processed schema")
    parser.add_argument("--profiles", type=str, help="Path to raw profiles CSV")
    parser.add_argument("--logs", type=str, help="Path to raw daily logs CSV")
    parser.add_argument("--labels", type=str, help="Path to raw labels CSV (optional)")
    parser.add_argument(
        "--output-dir",
        type=str,
        default="data/processed",
        help="Output directory for processed files",
    )
    args = parser.parse_args()

    base_dir = Path(__file__).resolve().parent.parent
    output_dir = base_dir / args.output_dir

    if not args.profiles and not args.logs and not args.labels:
        print("No input files provided.")
        print("Drop your dataset CSVs into data/raw/, then run:")
        print("  python src/prepare_data.py --profiles data/raw/YOUR_profiles.csv --logs data/raw/YOUR_logs.csv")
        return

    if args.profiles:
        profiles = normalize_columns(pd.read_csv(base_dir / args.profiles), PROFILE_ALIASES)
        write_processed(profiles, output_dir / "profiles.csv")

    if args.logs:
        logs = normalize_columns(pd.read_csv(base_dir / args.logs), LOG_ALIASES)
        if "date" in logs.columns:
            logs["date"] = pd.to_datetime(logs["date"]).dt.strftime("%Y-%m-%d")
        write_processed(logs, output_dir / "daily_logs.csv")

    if args.labels:
        labels = normalize_columns(pd.read_csv(base_dir / args.labels), LABEL_ALIASES)
        if "date" in labels.columns:
            labels["date"] = pd.to_datetime(labels["date"]).dt.strftime("%Y-%m-%d")
        write_processed(labels, output_dir / "labels.csv")


if __name__ == "__main__":
    main()
