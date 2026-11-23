# Datasets folder

Place source files here, then run the importer from `ml/`:

```powershell
cd ml
python src/import_datasets.py --all
python src/validate_dataset.py
python src/train.py
```

## What you have now

| File | Status | Used for |
|------|--------|----------|
| `DEMO_L.xpt` | Present | NHANES demographics (age, gender) — 11,933 participants |
| `personal-key-indicators-of-heart-disease.ipynb` | Notebook only | Analysis reference |
| `shhh-i-want-to-sleep.ipynb` | Notebook only | Analysis reference |

## Files still needed (download from Kaggle)

1. **Heart disease** — save as `heart_2020_cleaned.csv`  
   https://www.kaggle.com/datasets/luyezhang/heart-2020-cleaned  
   (~320k rows, includes `HeartDisease`, `BMI`, `Smoking`, `SleepTime`)

2. **Sleep health** — save as `Sleep_health_and_lifestyle_dataset.csv`  
   https://www.kaggle.com/datasets/uom190346a/sleep-health-and-lifestyle-dataset  
   (~374 rows, sleep duration, activity, sleep disorders)

## Optional NHANES files (for richer profiles)

`DEMO_L.xpt` is demographics only. For real BMI, diet, and sleep in NHANES, add matching cycle files from https://wwwn.cdc.gov/nchs/nhanes/:

- `BMX_L.xpt` — height, weight, BMI  
- `SLQ_L.xpt` — sleep  
- `DR1TOT_L.xpt` — dietary intake  

## Expected folder layout

```
datasets/
  DEMO_L.xpt
  heart_2020_cleaned.csv              ← add this
  Sleep_health_and_lifestyle_dataset.csv ← add this
  personal-key-indicators-of-heart-disease.ipynb
  shhh-i-want-to-sleep.ipynb
```
