"""Validate dataset files without training.

Usage (from ml/ directory):
  python src/validate_dataset.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from data_loader import build_training_frame, load_config, load_datasets


def main() -> None:
    base_dir = Path(__file__).resolve().parent.parent
    config = load_config(base_dir / "configs/train_config.yaml")

    print("MedAlert dataset validation\n" + "=" * 40)

    try:
        data = load_datasets(config, base_dir)
        print(f"Profiles:   {len(data['profiles'])} users")
        print(f"Daily logs: {len(data['daily_logs'])} rows")
        print(f"Labels:     {len(data['labels'])} rows" + (" (will use proxy labels)" if data["labels"].empty else ""))

        frame = build_training_frame(config, base_dir)
        print(f"\nTraining frame: {len(frame)} rows, {len(frame.columns)} columns")
        print(f"Feature columns: {', '.join(c for c in frame.columns if c in config['features']['feature_columns'])}")

        if "high_risk_binary" in frame.columns:
            counts = frame["high_risk_binary"].value_counts().to_dict()
            print(f"Class balance (high_risk_binary): {counts}")

        print("\nDataset is ready for training.")
        print("Run: python src/train.py")
    except FileNotFoundError as exc:
        print(f"Missing file: {exc}")
        print("\nAdd your dataset to ml/data/processed/ or convert from raw:")
        print("  python src/prepare_data.py --profiles data/raw/... --logs data/raw/...")
    except ValueError as exc:
        print(f"Validation error: {exc}")


if __name__ == "__main__":
    main()
