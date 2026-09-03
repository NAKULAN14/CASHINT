# Predictive Cash-Out Intelligence — Project README

## What this is

A machine-learning system for cybercrime investigation. Given a fraud case with a
mule-chain of accounts, it predicts **where, when, and via which channel** the
criminal will cash out — and updates those predictions in real time as each new
hop of evidence arrives.

Three models work together to produce the investigator view:

| Model | Output |
|---|---|
| **Channel model** | Ranked probabilities across ATM / Branch / Agent / UPI / Other |
| **Time model** | A prediction interval (p10 – p90 hours until cash-out) |
| **Location model** | Ranked list of candidate ATMs, scored by likelihood |

All three predictions are combined into a single **confidence level** (LOW / MEDIUM / HIGH)
that gates how actionable the output is treated.

---

## Folder structure

```
SIH/
├── data_pipeline/
│   ├── mule_chain_generator.py        # generates synthetic cybercrime cases
│   ├── prepare_atm_dataset.py         # geocodes RBI ATM export → lat/lon
│   ├── calibrate_from_paysim.py       # fits real amount/timing stats from PaySim
│   ├── build_incremental_snapshots.py # slices cases into time-ordered evidence snapshots
│   ├── build_feature_table.py         # flattens snapshots into a flat training table
│   └── build_location_candidates.py   # builds ranked ATM candidate sets per snapshot
├── models/
│   ├── train_channel_model.py         # trains the Channel prediction model
│   ├── train_location_model.py        # trains the Location Ranking model
│   ├── train_time_model.py            # trains the Time Window prediction model
│   └── fix_paysim_target.py           # fixes the future_cashout_24h target bug in PaySim data
├── model_artifacts/
│   ├── channel_model/
│   │   ├── channel_model.txt
│   │   ├── class_names.json
│   │   ├── feature_cols.json
│   │   ├── feature_importance.csv
│   │   ├── confusion_matrix.csv
│   │   └── report.txt
│   ├── location_model/
│   │   ├── location_model.txt
│   │   ├── feature_cols.json
│   │   ├── feature_importance.csv
│   │   └── report.txt
│   └── time_model/
│       ├── time_model_lower_p10.txt
│       ├── time_model_median_p50.txt
│       ├── time_model_upper_p90.txt
│       ├── feature_cols.json
│       ├── feature_importance.csv
│       └── report.txt
├── data/                               # regenerable — gitignored 
│   ├── raw/                            # ATM_DATA.xlsx, lat.csv, PAYSIM.csv (source downloads)
│   ├── atm_locations.csv
│   ├── calibration.json
│   ├── cases.jsonl
│   ├── snapshots.jsonl
│   ├── labels.jsonl
│   ├── features_train.csv
│   └── location_candidates.csv
├── demo_app.py                         # live CLI demo — streams evidence and updates all predictions
├── .gitignore
├── README.md
└── requirements.txt
```

---

## Run order — main pipeline

```bash
# 1. Geocode your RBI ATM export
python data_pipeline/prepare_atm_dataset.py \
    --atm_export data/raw/ATM_DATA.xlsx --district_geo data/raw/lat.csv \
    --out data/atm_locations.csv

# 2. Calibrate against real PaySim statistics
python data_pipeline/calibrate_from_paysim.py \
    --paysim_csv data/raw/PAYSIM.csv --out data/calibration.json

# 3. Generate synthetic mule-chain cases
python data_pipeline/mule_chain_generator.py \
    --n_cases 2000 --atm_csv data/atm_locations.csv \
    --calibration data/calibration.json --out data/cases.jsonl

# 4. Slice into incremental evidence snapshots
python data_pipeline/build_incremental_snapshots.py \
    --cases data/cases.jsonl \
    --snapshots_out data/snapshots.jsonl --labels_out data/labels.jsonl

# 5. Flatten into a trainable feature table
python data_pipeline/build_feature_table.py \
    --snapshots data/snapshots.jsonl --labels data/labels.jsonl \
    --out data/features_train.csv

# 6. Train the Channel model
python models/train_channel_model.py \
    --features data/features_train.csv --out_dir model_artifacts/channel_model

# 7. Train the Time Window model
python models/train_time_model.py \
    --features data/features_train.csv --out_dir model_artifacts/time_model

# 8. Build ATM ranking candidates
python data_pipeline/build_location_candidates.py \
    --snapshots data/snapshots.jsonl --labels data/labels.jsonl \
    --atm_csv data/atm_locations.csv --out data/location_candidates.csv

# 9. Train the Location Ranking model
python models/train_location_model.py \
    --candidates data/location_candidates.csv --out_dir model_artifacts/location_model
```

---

## Running the demo

The demo streams a single case evidence hop-by-hop and prints the evolving
Channel + Time + Location + Confidence picture after each new piece of evidence.

```bash
# Using the nearest-to-victim heuristic for location (recommended — see Status below)
python demo_app.py \
    --cases data/cases.jsonl \
    --channel_model_dir model_artifacts/channel_model \
    --time_model_dir model_artifacts/time_model \
    --atm_csv data/atm_locations.csv \
    --interactive

# Using the trained location ranker instead
python demo_app.py \
    --cases data/cases.jsonl \
    --channel_model_dir model_artifacts/channel_model \
    --time_model_dir model_artifacts/time_model \
    --atm_csv data/atm_locations.csv \
    --location_mode model \
    --location_model_dir model_artifacts/location_model \
    --interactive
```

Use `--case_id <id>` to run on a specific case instead of the first one in the file.

---

## Model status

### Channel model
- **Algorithm**: LightGBM multiclass classifier (5 classes)
- **Accuracy**: 44% (majority-class baseline was 34%)
- **Top feature**: `stolen_amount`
- **Note**: Branch, Other, and UPI are under-predicted in top-1 accuracy — evaluate
  with top-2 accuracy or full ranked probabilities rather than top-1 alone.

### Time model
- **Algorithm**: 3 LightGBM quantile regressors (p10 / p50 / p90) on log1p(hours)
- **Median MAE**: 1.96 hours (naive global-median baseline: 2.53 hours)
- **p10–p90 coverage**: 76.3% (target ~80%)
- **Average predicted window width**: 5.32 hours
- **Top feature**: `hop_velocity`

### Location model
- **Algorithm**: LightGBM LambdaMART ranker
- **Top-1 accuracy**: 47.6% | **MRR**: 0.518
- **Nearest-to-victim baseline**: 48.9% Top-1 | MRR 0.525
- **Status**: Currently **underperforms** the heuristic baseline. The demo defaults
  to `--location_mode baseline` (nearest-to-victim) until the ranker is tuned.
  See `model_artifacts/location_model/report.txt` for full metrics.

---

## Notes

- Every step from snapshot → feature → model depends on the **same generation run**.
  If you regenerate `cases.jsonl` with different settings, re-run every step after
  it too.
- The ground truth is kept in a **separate** `labels.jsonl` file and never written
  into `snapshots.jsonl`. This prevents the easy mistake of a model or demo
  accidentally reading the answer while pretending to predict it.
- `data/` (except `data/raw/`) is gitignored — all derived files are regenerable
  from the pipeline above.
