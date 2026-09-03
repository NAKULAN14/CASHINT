# Predictive Cash-Out Intelligence — Project README

## Two tracks in this repo

1. **Main pipeline** (`data_pipeline/`, `models/`, `model_artifacts/`, `data/`) — the
   synthetic mule-chain simulation, Channel model, and Location Ranking model.
   This is the core SIH deliverable and runs end-to-end today.
2. **PaySim behavioral track** (`paysim_track/`) — a parallel, not-yet-integrated
   effort using real PaySim data to build a "cash-out probability" model, plus
   feature-recipe validation done independently on IEEE-CIS. Its only current
   connection to the main pipeline is `calibrate_from_paysim.py`, which pulls
   two numbers (amount distribution, cash-out hour-of-day) out of raw PaySim
   stats to ground the synthetic generator.

## Folder structure

```
SIH/
├── data_pipeline/
│   ├── mule_chain_generator.py        # generates synthetic cybercrime cases
│   ├── prepare_atm_dataset.py         # geocodes RBI ATM export -> lat/lon
│   ├── calibrate_from_paysim.py       # fits real amount/timing stats from PaySim
│   ├── build_incremental_snapshots.py # slices cases into time-ordered evidence
│   ├── build_feature_table.py         # flattens snapshots into a training table
│   └── build_location_candidates.py   # builds ranked ATM candidate sets per snapshot
├── models/
│   ├── train_channel_model.py         # trains the Channel prediction model
│   └── train_location_model.py        # trains the Location Ranking model
├── model_artifacts/
│   ├── channel_model/
│   │   ├── channel_model.txt
│   │   ├── class_names.json
│   │   ├── feature_cols.json
│   │   ├── feature_importance.csv
│   │   ├── confusion_matrix.csv
│   │   └── report.txt
│   └── location_model/
│       ├── location_model.txt
│       ├── feature_cols.json
│       ├── feature_importance.csv
│       └── report.txt
├── data/                               # regenerable -- gitignored except data/raw/
│   ├── raw/                            # ATM_DATA.xlsx, lat.csv, PAYSIM.csv (source downloads)
│   ├── atm_locations.csv
│   ├── calibration.json
│   ├── cases.jsonl
│   ├── snapshots.jsonl
│   ├── labels.jsonl
│   ├── features_train.csv
│   └── location_candidates.csv
├── paysim_track/                       
│   ├── fix_paysim_target.py            
│   ├── clean.py                        # PaySim feature engineering pipeline
│   ├── ieee_cis_discovery/
│   │   ├── TRANSFERABLE_INSIGHTS.md
│   │   ├── transferable_feature_insights.json
│   │   └── ieee_feature_importance_categorized.csv
│   ├── ieee_cis_benchmark.py           # validates GBT approach on real IEEE-CIS fraud data
│   ├── data/                           # gitignored -- large files, don't commit
│   │   ├── paysim_engineered.csv
│   │   └── paysim_with_fixed_target.csv
│   ├── ml_train.py                     # (to be built) trains cash-out probability model
│   ├── ml_evaluate.py                  # (to be built)
│   ├── model/
│   │   └── best_model.pkl
│   ├── results/
│   │   ├── metrics.txt
│   │   ├── feature_importance.png
│   │   └── shap_summary.png
│   └── README_PAYSIM.md                # document target definition + unified-ledger logic here
├── .gitignore
├── README.md
└── requirements.txt
```

## Run order — main pipeline

```bash
# 1. Geocode your RBI ATM export
python3 data_pipeline/prepare_atm_dataset.py \
    --atm_export data/raw/ATM_DATA.xlsx --district_geo data/raw/lat.csv \
    --out data/atm_locations.csv

# 2. Calibrate against real PaySim statistics
python3 data_pipeline/calibrate_from_paysim.py \
    --paysim_csv data/raw/PAYSIM.csv --out data/calibration.json

# 3. Generate synthetic mule-chain cases
python3 data_pipeline/mule_chain_generator.py \
    --n_cases 2000 --atm_csv data/atm_locations.csv \
    --calibration data/calibration.json --out data/cases.jsonl

# 4. Slice into incremental evidence snapshots
python3 data_pipeline/build_incremental_snapshots.py \
    --cases data/cases.jsonl \
    --snapshots_out data/snapshots.jsonl --labels_out data/labels.jsonl

# 5. Flatten into a trainable feature table
python3 data_pipeline/build_feature_table.py \
    --snapshots data/snapshots.jsonl --labels data/labels.jsonl \
    --out data/features_train.csv

# 6. Train the Channel model
python3 models/train_channel_model.py \
    --features data/features_train.csv --out_dir model_artifacts/channel_model

# 7. Build ATM ranking candidates
python3 data_pipeline/build_location_candidates.py \
    --snapshots data/snapshots.jsonl --labels data/labels.jsonl \
    --atm_csv data/atm_locations.csv --out data/location_candidates.csv

# 8. Train the Location Ranking model
python3 models/train_location_model.py \
    --candidates data/location_candidates.csv --out_dir model_artifacts/location_model
```

## Status

- **Channel model**: LightGBM multiclass, ~45% accuracy (majority-class baseline
  was 34%). `stolen_amount` is the top feature. Branch is under-predicted in
  top-1 accuracy by design (rarely the single most-likely channel) -- evaluate
  with top-2 accuracy or full ranked probabilities, not top-1 alone.
- **Location model**: trained on real geocoded ATM data — see
  `model_artifacts/location_model/report.txt` for the latest model-vs-nearest-
  to-victim-baseline comparison. Confirm the model beats the baseline before
  trusting it; on the earlier 4-ATM toy test it did not, which was expected
  given the tiny candidate pool.
- **PaySim track**: target (`future_cashout_24h`) was 100% zero due to being
  computed against `nameOrig`, which is ~99.85% one-time-use in PaySim.
  `fix_paysim_target.py` corrects this by tracking `nameDest` instead (83%
  recurrence). Two features in `clean.py` — `orig_trans_count_step` and
  `amount_zscore_orig` — have the same root-cause bug (grouped on `nameOrig`
  alone) and still need the same unified-ledger fix.
- **Not yet built**: Time Window model, Confidence calibration, demo app
  wiring `stream_case()` to live predictions, PaySim cash-out probability
  model (`ml_train.py`/`ml_evaluate.py` in `paysim_track/` are placeholders).

## Notes

- Every snapshot -> feature -> model step depends on the SAME generation run.
  If you regenerate `cases.jsonl` with different settings, re-run every step
  after it too.
- `paysim_track/` is currently independent of the main pipeline except via
  `calibrate_from_paysim.py`. It does not need to be "done" for the main
  pipeline to keep progressing.
