"""Copy latest trained model export into the MedAlert web app.

Usage (from ml/):
  python src/export_for_app.py
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "models" / "exported_coefficients.json"
DEST = Path(__file__).resolve().parent.parent.parent / "website_capstone_v0.9.2" / "src" / "data" / "trainedModel.json"


def main() -> None:
    if not SRC.exists():
        raise FileNotFoundError(f"Run training first — missing {SRC}")
    DEST.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(SRC, DEST)
    data = json.loads(DEST.read_text(encoding="utf-8"))
    print(f"Copied trained model to {DEST}")
    print(f"  version: {data.get('version')}")
    print(f"  trained_on: {data.get('trained_on')}")


if __name__ == "__main__":
    main()
