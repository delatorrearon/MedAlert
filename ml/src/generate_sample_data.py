"""Generate synthetic sample data for pipeline testing.

Usage (from ml/ directory):
  python src/generate_sample_data.py
  python src/generate_sample_data.py --users 50 --days 30
"""

from __future__ import annotations

import argparse
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd


def generate(users: int = 20, days: int = 30, seed: int = 42) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    rng = np.random.default_rng(seed)
    start = date.today() - timedelta(days=days)

    profiles_rows = []
    logs_rows = []
    labels_rows = []

    for i in range(users):
        user_id = f"user_{i + 1:03d}"
        age = int(rng.integers(22, 65))
        height = float(rng.uniform(155, 190))
        weight = float(rng.uniform(55, 110))
        smoking = rng.choice(["never", "former", "current"], p=[0.6, 0.25, 0.15])
        alcohol = rng.choice(["never", "rarely", "moderately", "frequently"], p=[0.2, 0.4, 0.3, 0.1])
        processed_food = rng.choice(["rarely", "sometimes", "frequently"], p=[0.3, 0.5, 0.2])

        profiles_rows.append(
            {
                "user_id": user_id,
                "age": age,
                "gender": rng.choice(["male", "female"]),
                "weight_kg": round(weight, 1),
                "height_cm": round(height, 1),
                "smoking": smoking,
                "alcohol": alcohol,
                "processed_food": processed_food,
                "activity_level": rng.choice(["sedentary", "light", "moderate", "active"]),
                "diet_type": "balanced",
                "vegetable_intake": "often",
                "fruit_intake": "often",
                "medical_conditions": "",
            }
        )

        bmi = weight / ((height / 100) ** 2)
        base_risk = (
            max(0, bmi - 25) * 2
            + (18 if smoking == "current" else 6 if smoking == "former" else 0)
            + (10 if processed_food == "frequently" else 4 if processed_food == "sometimes" else 0)
        )

        for d in range(days):
            log_date = (start + timedelta(days=d)).isoformat()
            sleep = float(np.clip(rng.normal(7, 1.2), 4, 10))
            exercise = float(np.clip(rng.normal(35, 20), 0, 120))
            water = float(np.clip(rng.normal(7, 2), 2, 14))
            caffeine = float(np.clip(rng.normal(2, 1.5), 0, 8))
            calories = float(np.clip(rng.normal(2100, 400), 1200, 3500))
            protein = float(np.clip(rng.normal(70, 20), 20, 150))
            carbs = float(np.clip(rng.normal(260, 60), 80, 450))
            fats = float(np.clip(rng.normal(70, 20), 20, 150))

            logs_rows.append(
                {
                    "user_id": user_id,
                    "date": log_date,
                    "sleep_hours": round(sleep, 1),
                    "exercise_minutes": round(exercise),
                    "water_glasses": round(water, 1),
                    "caffeine_drinks": round(caffeine, 1),
                    "calories": round(calories),
                    "protein_g": round(protein, 1),
                    "carbs_g": round(carbs, 1),
                    "fats_g": round(fats, 1),
                    "weight_kg": round(weight + rng.normal(0, 0.5), 1),
                }
            )

            day_risk = base_risk + max(0, 7 - sleep) * 6 + max(0, 30 - exercise) * 0.5 + abs(calories - 2000) / 50
            cardio = float(np.clip(day_risk + rng.normal(0, 5), 0, 100))
            metabolic = float(np.clip(day_risk * 0.9 + rng.normal(0, 5), 0, 100))
            nutritional = float(np.clip(day_risk * 0.85 + rng.normal(0, 5), 0, 100))
            sleep_risk = float(np.clip(max(0, 7 - sleep) * 12 + caffeine * 3 + rng.normal(0, 5), 0, 100))
            overall = (cardio * 0.3 + metabolic * 0.25 + nutritional * 0.25 + sleep_risk * 0.2)

            labels_rows.append(
                {
                    "user_id": user_id,
                    "date": log_date,
                    "cardiovascular_risk": round(cardio, 1),
                    "metabolic_risk": round(metabolic, 1),
                    "nutritional_risk": round(nutritional, 1),
                    "sleep_risk": round(sleep_risk, 1),
                    "overall_risk": round(overall, 1),
                    "high_risk_binary": int(overall >= 50),
                }
            )

    return pd.DataFrame(profiles_rows), pd.DataFrame(logs_rows), pd.DataFrame(labels_rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--users", type=int, default=20)
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--output-dir", default="data/processed")
    args = parser.parse_args()

    base_dir = Path(__file__).resolve().parent.parent
    output_dir = base_dir / args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    profiles, logs, labels = generate(args.users, args.days)
    profiles.to_csv(output_dir / "profiles.csv", index=False)
    logs.to_csv(output_dir / "daily_logs.csv", index=False)
    labels.to_csv(output_dir / "labels.csv", index=False)

    print(f"Generated sample dataset in {output_dir}:")
    print(f"  {len(profiles)} users, {len(logs)} daily logs, {len(labels)} labels")
    print("\nNext: python src/validate_dataset.py")
    print("       python src/train.py")


if __name__ == "__main__":
    main()
