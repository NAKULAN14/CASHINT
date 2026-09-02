"""
Channel Prediction Model — Training
--------------------------------------
Predicts which cash-out channel (ATM / Branch / Agent / UPI / Other) a
case is heading toward, using the flattened snapshot features.

Uses a GROUPED split by case_id (not a random row split) -- multiple
snapshots from the SAME case are highly correlated (they're literally
the same chain revealed incrementally), so a random split would leak
information between train and validation. Splitting by case_id keeps
all snapshots of a given case on the same side of the split.

Usage:
    python train_channel_model.py --features features_train.csv --out_dir ./channel_model
"""

import argparse
import json
import os

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix, log_loss
from sklearn.model_selection import GroupShuffleSplit
from sklearn.preprocessing import LabelEncoder

FEATURE_COLS = [
    "as_of_hour", "as_of_day_of_week", "n_hops_observed",
    "time_since_last_hop_hours", "elapsed_hours_since_first_tx", "hop_velocity",
    "terminal_readiness", "n_split_events", "n_unique_banks_seen",
    "dormant_account_ratio", "avg_account_age_days", "min_account_age_days",
    "last_hop_amount", "amount_trend", "stolen_amount", "urban",
    "victim_lat", "victim_lon", "is_final_snapshot",
]
TARGET_COL = "label_true_channel"
GROUP_COL = "case_id"


def main(features_path, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    df = pd.read_csv(features_path)

    missing = set(FEATURE_COLS + [TARGET_COL, GROUP_COL]) - set(df.columns)
    if missing:
        raise ValueError(f"features file is missing columns: {missing}")

    X = df[FEATURE_COLS]
    y_raw = df[TARGET_COL]
    groups = df[GROUP_COL]

    encoder = LabelEncoder()
    y = encoder.fit_transform(y_raw)
    class_names = list(encoder.classes_)
    print(f"Classes: {class_names}")
    print(f"Class distribution:\n{y_raw.value_counts()}")

    # grouped split so snapshots from the same case never straddle train/val
    splitter = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
    train_idx, val_idx = next(splitter.split(X, y, groups=groups))
    X_train, X_val = X.iloc[train_idx], X.iloc[val_idx]
    y_train, y_val = y[train_idx], y[val_idx]

    n_train_cases = groups.iloc[train_idx].nunique()
    n_val_cases = groups.iloc[val_idx].nunique()
    print(f"Train: {len(X_train)} rows / {n_train_cases} cases. "
          f"Val: {len(X_val)} rows / {n_val_cases} cases.")

    train_set = lgb.Dataset(X_train, label=y_train, free_raw_data=False)
    val_set = lgb.Dataset(X_val, label=y_val, reference=train_set, free_raw_data=False)

    params = {
        "objective": "multiclass",
        "num_class": len(class_names),
        "metric": "multi_logloss",
        "learning_rate": 0.05,
        "num_leaves": 31,
        "feature_fraction": 0.8,
        "bagging_fraction": 0.8,
        "bagging_freq": 5,
        "min_data_in_leaf": 10,   # dataset is small (3.6k rows) -- guard against overfit leaves
        "verbose": -1,
    }

    model = lgb.train(
        params, train_set, num_boost_round=300,
        valid_sets=[val_set],
        callbacks=[lgb.early_stopping(20), lgb.log_evaluation(25)],
    )

    val_probs = model.predict(X_val, num_iteration=model.best_iteration)
    val_preds = np.argmax(val_probs, axis=1)

    ll = log_loss(y_val, val_probs, labels=list(range(len(class_names))))
    print(f"\nValidation log loss: {ll:.4f}")
    print("\nClassification report:")
    report = classification_report(y_val, val_preds, target_names=class_names, zero_division=0)
    print(report)

    cm = confusion_matrix(y_val, val_preds, labels=list(range(len(class_names))))
    cm_df = pd.DataFrame(cm, index=class_names, columns=class_names)
    print("Confusion matrix (rows=true, cols=predicted):")
    print(cm_df)

    importance = pd.DataFrame({
        "feature": FEATURE_COLS,
        "gain": model.feature_importance(importance_type="gain"),
    }).sort_values("gain", ascending=False)
    print("\nFeature importance:")
    print(importance.to_string(index=False))

    # save everything needed to reload and use this model later
    model.save_model(os.path.join(out_dir, "channel_model.txt"))
    with open(os.path.join(out_dir, "class_names.json"), "w") as f:
        json.dump(class_names, f)
    with open(os.path.join(out_dir, "feature_cols.json"), "w") as f:
        json.dump(FEATURE_COLS, f)
    importance.to_csv(os.path.join(out_dir, "feature_importance.csv"), index=False)
    cm_df.to_csv(os.path.join(out_dir, "confusion_matrix.csv"))
    with open(os.path.join(out_dir, "report.txt"), "w") as f:
        f.write(f"Validation log loss: {ll:.4f}\n\n{report}\n\nConfusion matrix:\n{cm_df}")

    print(f"\nSaved model + artifacts to {out_dir}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", required=True)
    parser.add_argument("--out_dir", default="./channel_model")
    args = parser.parse_args()
    main(args.features, args.out_dir)
