"""
Time Window Prediction Model — Training
--------------------------------------------
Predicts a TIME WINDOW for cash-out (e.g. "1.2 - 4.8 hours from now"), not
a single point estimate -- matching the concept doc's "ATM Cluster A,
18:00-19:00" style output.

Approach: three LightGBM quantile regressors (10th percentile, median,
90th percentile) trained on log1p(hours_to_cashout), since the target is
strongly right-skewed (many fast cash-outs, a long tail of slow ones).
This gives a real prediction interval, not just a point guess -- and the
gap between the 10th/90th percentile predictions is itself a usable
per-case UNCERTAINTY signal for the Low-Confidence Gate later.

Usage:
    python train_time_model.py --features features_train.csv --out_dir ./time_model
"""

import argparse
import json
import os

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.model_selection import GroupShuffleSplit

FEATURE_COLS = [
    "as_of_hour", "as_of_day_of_week", "n_hops_observed",
    "time_since_last_hop_hours", "elapsed_hours_since_first_tx", "hop_velocity",
    "terminal_readiness", "n_split_events", "n_unique_banks_seen",
    "dormant_account_ratio", "avg_account_age_days", "min_account_age_days",
    "last_hop_amount", "amount_trend", "stolen_amount", "urban",
    "victim_lat", "victim_lon", "is_final_snapshot",
]
TARGET_COL = "label_time_to_cashout_hours"
GROUP_COL = "case_id"
QUANTILES = {"lower_p10": 0.10, "median_p50": 0.50, "upper_p90": 0.90}


def train_quantile_model(alpha, X_train, y_train, X_val, y_val):
    train_set = lgb.Dataset(X_train, label=y_train, free_raw_data=False)
    val_set = lgb.Dataset(X_val, label=y_val, reference=train_set, free_raw_data=False)
    params = {
        "objective": "quantile", "alpha": alpha, "metric": "quantile",
        "learning_rate": 0.05, "num_leaves": 31, "min_data_in_leaf": 10,
        "feature_fraction": 0.8, "bagging_fraction": 0.8, "bagging_freq": 5,
        "verbose": -1,
    }
    model = lgb.train(params, train_set, num_boost_round=300, valid_sets=[val_set],
                       callbacks=[lgb.early_stopping(20), lgb.log_evaluation(0)])
    return model


def main(features_path, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    df = pd.read_csv(features_path)

    missing = set(FEATURE_COLS + [TARGET_COL, GROUP_COL]) - set(df.columns)
    if missing:
        raise ValueError(f"features file is missing columns: {missing}")

    X = df[FEATURE_COLS]
    y_log = np.log1p(df[TARGET_COL])  # log-space: target is right-skewed
    groups = df[GROUP_COL]

    splitter = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
    train_idx, val_idx = next(splitter.split(X, y_log, groups=groups))
    X_train, X_val = X.iloc[train_idx], X.iloc[val_idx]
    y_train, y_val = y_log.iloc[train_idx], y_log.iloc[val_idx]
    y_val_true_hours = df[TARGET_COL].iloc[val_idx].to_numpy()

    print(f"Train: {len(X_train)} rows / {groups.iloc[train_idx].nunique()} cases")
    print(f"Val:   {len(X_val)} rows / {groups.iloc[val_idx].nunique()} cases")

    models = {}
    preds = {}
    for name, alpha in QUANTILES.items():
        print(f"\nTraining {name} (quantile={alpha})...")
        model = train_quantile_model(alpha, X_train, y_train, X_val, y_val)
        models[name] = model
        preds[name] = np.expm1(model.predict(X_val, num_iteration=model.best_iteration))
        preds[name] = np.clip(preds[name], 0, None)  # hours can't be negative

    # --- evaluation ---
    median_mae = np.mean(np.abs(preds["median_p50"] - y_val_true_hours))
    coverage = np.mean((y_val_true_hours >= preds["lower_p10"]) &
                        (y_val_true_hours <= preds["upper_p90"]))
    avg_window_width = np.mean(preds["upper_p90"] - preds["lower_p10"])

    print(f"\nMedian prediction MAE: {median_mae:.3f} hours")
    print(f"10-90 interval coverage: {coverage:.1%} (target: ~80%)")
    print(f"Average predicted window width: {avg_window_width:.2f} hours")

    # naive baseline: always predict the training-set median delay
    naive_median_hours = np.expm1(y_train.median())
    naive_mae = np.mean(np.abs(naive_median_hours - y_val_true_hours))
    print(f"Naive baseline (always predict global median = {naive_median_hours:.2f}h) MAE: {naive_mae:.3f} hours")

    # feature importance from the median model
    importance = pd.DataFrame({
        "feature": FEATURE_COLS,
        "gain": models["median_p50"].feature_importance(importance_type="gain"),
    }).sort_values("gain", ascending=False)
    print("\nFeature importance (median model):")
    print(importance.to_string(index=False))

    for name, model in models.items():
        model.save_model(os.path.join(out_dir, f"time_model_{name}.txt"))
    with open(os.path.join(out_dir, "feature_cols.json"), "w") as f:
        json.dump(FEATURE_COLS, f)
    importance.to_csv(os.path.join(out_dir, "feature_importance.csv"), index=False)
    with open(os.path.join(out_dir, "report.txt"), "w") as f:
        f.write(f"Median MAE: {median_mae:.3f} hours\n")
        f.write(f"Naive baseline MAE: {naive_mae:.3f} hours\n")
        f.write(f"10-90 coverage: {coverage:.1%} (target ~80%)\n")
        f.write(f"Avg window width: {avg_window_width:.2f} hours\n\n")
        f.write(importance.to_string(index=False))

    print(f"\nSaved 3 quantile models + artifacts to {out_dir}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", required=True)
    parser.add_argument("--out_dir", default="./time_model")
    args = parser.parse_args()
    main(args.features, args.out_dir)
