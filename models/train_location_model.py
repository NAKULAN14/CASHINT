"""
Location Ranking Model — Training
--------------------------------------
Ranks candidate ATMs per case snapshot using LightGBM's lambdarank
objective (LambdaMART) -- outputs a SCORE per candidate, not a single
class, so downstream you get the ranked list ("ATM Cluster A 81%,
Cluster B 64%...") your concept doc calls for, not just a single guess.

Grouped split by case_id (not by individual group rows) so snapshots
from the same case never straddle train/val -- same reasoning as the
Channel model's split.

Usage:
    python train_location_model.py --candidates location_candidates.csv --out_dir ./location_model
"""

import argparse
import json
import os

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.model_selection import GroupShuffleSplit

FEATURE_COLS = [
    "dist_victim_km", "dist_terminal_km", "same_bank_as_terminal",
    "n_hops_observed", "terminal_readiness", "stolen_amount", "urban",
    "is_final_snapshot",
]
LABEL_COL = "label_is_true"
CASE_COL = "case_id"


def make_group_sizes(df):
    """LightGBM's ranker needs the data sorted so that all rows of one
    query group are contiguous, plus an array of each group's size."""
    df = df.sort_values(["case_id", "snapshot_index"]).reset_index(drop=True)
    sizes = df.groupby(["case_id", "snapshot_index"], sort=False).size().to_numpy()
    return df, sizes


def evaluate_ranking(df, scores):
    """Top-1 accuracy and Mean Reciprocal Rank, computed per group."""
    df = df.copy()
    df["score"] = scores
    top1_hits = 0
    reciprocal_ranks = []
    n_groups = 0

    for _, group in df.groupby(["case_id", "snapshot_index"], sort=False):
        n_groups += 1
        ranked = group.sort_values("score", ascending=False).reset_index(drop=True)
        true_rank = ranked.index[ranked[LABEL_COL] == 1]
        if len(true_rank) == 0:
            continue
        rank = true_rank[0] + 1  # 1-indexed
        if rank == 1:
            top1_hits += 1
        reciprocal_ranks.append(1.0 / rank)

    return {
        "n_groups": n_groups,
        "top1_accuracy": top1_hits / n_groups,
        "mrr": float(np.mean(reciprocal_ranks)),
    }


def main(candidates_path, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    df = pd.read_csv(candidates_path)

    missing = set(FEATURE_COLS + [LABEL_COL, CASE_COL]) - set(df.columns)
    if missing:
        raise ValueError(f"candidates file is missing columns: {missing}")

    # grouped split by CASE (not by individual ranking-group rows)
    splitter = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
    train_case_idx, val_case_idx = next(splitter.split(df, groups=df[CASE_COL]))
    train_cases = set(df[CASE_COL].iloc[train_case_idx])
    val_cases = set(df[CASE_COL].iloc[val_case_idx])

    train_df = df[df[CASE_COL].isin(train_cases)]
    val_df = df[df[CASE_COL].isin(val_cases)]

    train_df, train_sizes = make_group_sizes(train_df)
    val_df, val_sizes = make_group_sizes(val_df)

    print(f"Train: {len(train_df)} rows / {len(train_sizes)} groups / {len(train_cases)} cases")
    print(f"Val:   {len(val_df)} rows / {len(val_sizes)} groups / {len(val_cases)} cases")

    train_set = lgb.Dataset(train_df[FEATURE_COLS], label=train_df[LABEL_COL],
                             group=train_sizes, free_raw_data=False)
    val_set = lgb.Dataset(val_df[FEATURE_COLS], label=val_df[LABEL_COL],
                           group=val_sizes, reference=train_set, free_raw_data=False)

    params = {
        "objective": "lambdarank",
        "metric": "ndcg",
        "eval_at": [1, 3],
        "learning_rate": 0.03,
        "num_leaves": 15,
        "min_data_in_leaf": 30,
        "lambda_l2": 0.5,
        "feature_fraction": 0.8,
        "bagging_fraction": 0.8,
        "bagging_freq": 5,
        # force the model to respect "farther = never more likely" as a hard
        # rule, instead of hoping it discovers this from a sparse (1-in-~20)
        # relevance signal -- -1 = prediction must be monotonically
        # DEcreasing as the feature increases. Order must match FEATURE_COLS.
        "monotone_constraints": [-1, -1, 0, 0, 0, 0, 0, 0],
        "verbose": -1,
    }

    model = lgb.train(
        params, train_set, num_boost_round=500,
        valid_sets=[val_set],
        callbacks=[lgb.early_stopping(40), lgb.log_evaluation(25)],
    )

    train_scores = model.predict(train_df[FEATURE_COLS], num_iteration=model.best_iteration)
    train_metrics = evaluate_ranking(train_df, train_scores)
    print(f"\nTRAIN metrics (compare to val below -- a big gap means overfitting): {train_metrics}")

    val_scores = model.predict(val_df[FEATURE_COLS], num_iteration=model.best_iteration)
    metrics = evaluate_ranking(val_df, val_scores)
    print(f"\nValidation results: {metrics}")

    # a naive "always pick nearest ATM to victim" baseline, for comparison
    baseline_scores = -val_df["dist_victim_km"].to_numpy()  # closer = higher score
    baseline_metrics = evaluate_ranking(val_df, baseline_scores)
    print(f"Nearest-to-victim baseline: {baseline_metrics}")

    importance = pd.DataFrame({
        "feature": FEATURE_COLS,
        "gain": model.feature_importance(importance_type="gain"),
    }).sort_values("gain", ascending=False)
    print("\nFeature importance:")
    print(importance.to_string(index=False))

    model.save_model(os.path.join(out_dir, "location_model.txt"))
    with open(os.path.join(out_dir, "feature_cols.json"), "w") as f:
        json.dump(FEATURE_COLS, f)
    importance.to_csv(os.path.join(out_dir, "feature_importance.csv"), index=False)
    with open(os.path.join(out_dir, "report.txt"), "w") as f:
        f.write(f"Model metrics: {metrics}\nBaseline (nearest-to-victim): {baseline_metrics}\n\n")
        f.write(importance.to_string(index=False))

    print(f"\nSaved model + artifacts to {out_dir}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidates", required=True)
    parser.add_argument("--out_dir", default="./location_model")
    args = parser.parse_args()
    main(args.candidates, args.out_dir)