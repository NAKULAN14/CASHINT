# Predictive Cash-Out Intelligence — Pipeline README

## Folder structure

```
sih-project/
├── data_pipeline/
│   ├── mule_chain_generator.py       # generates synthetic cybercrime cases
│   ├── prepare_atm_dataset.py        # geocodes RBI ATM export -> lat/lon
│   ├── calibrate_from_paysim.py      # fits real amount/timing stats from PaySim
│   ├── build_incremental_snapshots.py # slices cases into time-ordered evidence
│   └── build_feature_table.py        # flattens snapshots into a training table
├── models/
│   ├── train_channel_model.py        # trains the Channel prediction model
│   ├── ieee_cis_benchmark.py         # validates GBT approach on real fraud data
│   └── fix_paysim_target.py          # fixes future_cashout_24h target (for teammate's PaySim work)
├── data/                              # regenerable -- gitignore this folder
│   ├── raw/                           # ATM_DATA.xlsx, lat.csv, PaySim csv (your downloads)
│   ├── atm_locations.csv
│   ├── calibration.json
│   ├── cases.jsonl
│   ├── snapshots.jsonl
│   ├── labels.jsonl
│   └── features_train.csv
└── model_artifacts/                   # commit these -- small, expensive to regenerate
    └── channel_model/
        ├── channel_model.txt          # the trained LightGBM model
        ├── class_names.json           # ["ATM","Agent","Branch","Other","UPI"]
        ├── feature_cols.json          # exact feature column order the model expects
        ├── feature_importance.csv
        ├── confusion_matrix.csv
        └── report.txt
```

## Run order (full pipeline from scratch)

```bash
# 1. Geocode your RBI ATM export
python3 data_pipeline/prepare_atm_dataset.py \
    --atm_export data/raw/ATM_DATA.xlsx \
    --district_geo data/raw/lat.csv \
    --out data/atm_locations.csv

# 2. (optional) calibrate against real PaySim statistics
python3 data_pipeline/calibrate_from_paysim.py \
    --paysim_csv data/raw/PS_*.csv \
    --out data/calibration.json

# 3. Generate synthetic mule-chain cases
python3 data_pipeline/mule_chain_generator.py \
    --n_cases 2000 \
    --atm_csv data/atm_locations.csv \
    --calibration data/calibration.json \
    --out data/cases.jsonl

# 4. Slice into incremental evidence snapshots (for the "watch it update" demo)
python3 data_pipeline/build_incremental_snapshots.py \
    --cases data/cases.jsonl \
    --snapshots_out data/snapshots.jsonl \
    --labels_out data/labels.jsonl

# 5. Flatten into a trainable feature table
python3 data_pipeline/build_feature_table.py \
    --snapshots data/snapshots.jsonl \
    --labels data/labels.jsonl \
    --out data/features_train.csv

# 6. Train the Channel model
python3 models/train_channel_model.py \
    --features data/features_train.csv \
    --out_dir model_artifacts/channel_model
```

## Status as of last run

- **Channel model**: LightGBM multiclass, 45% accuracy (baseline/majority-class was 34%).
  `stolen_amount` is the top feature, confirming the model is learning the real
  amount-based channel logic built into the generator (large amounts -> Branch,
  small amounts -> UPI/Agent).
- Branch is still under-predicted in top-1 accuracy — expected, since it's rarely
  the single most-likely channel even when boosted. Evaluate with top-2 accuracy
  or the full ranked probability list, not top-1 accuracy alone, when this feeds
  the investigator UI.
- **Not yet built**: Location Ranking model, Time Window model, Confidence
  calibration, demo app wiring `stream_case()` to live predictions.

## Notes

- Every snapshot->feature->model step depends on the SAME generation run.
  If you regenerate `cases.jsonl` with different `--n_cases` or config, re-run
  every step after it too -- don't mix snapshots/features from different runs.
- `fix_paysim_target.py` is for your teammate's separate PaySim feature-engineering
  pipeline (`clean.py`), not part of this repo's main data flow -- it only matters
  once you re-run `calibrate_from_paysim.py` with their corrected output.
