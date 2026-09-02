"""
Feature Table Builder
------------------------
Flattens snapshots.jsonl (nested: accounts, transactions as lists) into
ONE ROW PER SNAPSHOT with plain numeric/categorical columns -- this is
what actually gets fed into LightGBM for the Next-Action, Channel,
Location, and Time models.

Two modes:
  TRAINING (pass --labels): merges in ground truth from labels.jsonl as
    label_* columns, plus a computed time_to_cashout_hours target for the
    survival/time model. Use this file OFFLINE to train models.

  INFERENCE (omit --labels): produces the same feature columns with no
    label_* columns at all -- this is the shape your live demo/model
    actually sees at prediction time, so testing against this mode is
    the honest way to check your model isn't accidentally depending on
    something it wouldn't have in production.

Usage:
    # training table
    python build_feature_table.py --snapshots snapshots.jsonl \
        --labels labels.jsonl --out features_train.csv

    # inference-shaped table (no labels, for sanity-checking your model
    # doesn't silently need columns that don't exist at prediction time)
    python build_feature_table.py --snapshots snapshots.jsonl \
        --out features_inference.csv
"""

import argparse
import json
from collections import Counter
from datetime import datetime

import pandas as pd


def _parse(ts):
    return datetime.fromisoformat(ts)


def flatten_snapshot(s: dict) -> dict:
    as_of = _parse(s["as_of_time"])
    txs = s["visible_transactions"]
    accounts = s["visible_accounts"]

    # first transaction time == when the complaint/first transfer happened,
    # used to derive elapsed-time and chain-velocity features
    first_tx_time = _parse(txs[0]["timestamp"]) if txs else as_of
    elapsed_hours = max((as_of - first_tx_time).total_seconds() / 3600, 0.05)  # floor at 3 min

    split_events = sum(1 for t in txs if t.get("split_group"))
    unique_banks = len({a["bank"] for a in accounts}) if accounts else 0
    dormant_ratio = (
        sum(1 for a in accounts if a["dormant_before_case"]) / len(accounts)
        if accounts else 0.0)
    avg_account_age = (
        sum(a["age_days"] for a in accounts) / len(accounts) if accounts else 0.0)
    min_account_age = min((a["age_days"] for a in accounts), default=0)

    amounts = [t["amount"] for t in txs]
    last_amount = amounts[-1] if amounts else 0.0
    amount_trend = (amounts[-1] - amounts[0]) if len(amounts) >= 2 else 0.0

    return {
        "case_id": s["case_id"],
        "snapshot_index": s["snapshot_index"],
        "as_of_time": s["as_of_time"],
        "as_of_hour": as_of.hour,
        "as_of_day_of_week": as_of.weekday(),
        "n_hops_observed": s["n_hops_observed"],
        "time_since_last_hop_hours": s["time_since_last_hop_hours"] or 0.0,
        "elapsed_hours_since_first_tx": round(elapsed_hours, 3),
        "hop_velocity": round(s["n_hops_observed"] / elapsed_hours, 4),  # hops per hour
        "terminal_readiness": s["terminal_account_readiness"] or 0.0,
        "n_split_events": split_events,
        "n_unique_banks_seen": unique_banks,
        "dormant_account_ratio": round(dormant_ratio, 3),
        "avg_account_age_days": round(avg_account_age, 2),
        "min_account_age_days": min_account_age,
        "last_hop_amount": last_amount,
        "amount_trend": round(amount_trend, 2),
        "stolen_amount": s["stolen_amount"],
        "urban": int(s["urban"]),
        "victim_lat": s["victim_lat"],
        "victim_lon": s["victim_lon"],
        "is_final_snapshot": int(s["is_final_snapshot"]),
    }


def build(snapshots_path, labels_path, out_path):
    labels_by_case = {}
    if labels_path:
        with open(labels_path) as f:
            for line in f:
                rec = json.loads(line)
                labels_by_case[rec["case_id"]] = rec["ground_truth"]

    rows = []
    with open(snapshots_path) as f:
        for line in f:
            s = json.loads(line)
            row = flatten_snapshot(s)

            if labels_path:
                gt = labels_by_case.get(s["case_id"])
                if gt is None:
                    continue  # skip snapshots we have no label for
                as_of = _parse(s["as_of_time"])
                true_start = _parse(gt["true_time_start"])
                row["label_true_channel"] = gt["true_channel"]
                row["label_true_location_id"] = gt["true_location_id"]
                row["label_true_lat"] = gt["true_lat"]
                row["label_true_lon"] = gt["true_lon"]
                row["label_is_noisy_case"] = int(gt["is_noisy_case"])
                # target for the time/survival model: hours from THIS
                # snapshot until the true cash-out window starts
                row["label_time_to_cashout_hours"] = round(
                    (true_start - as_of).total_seconds() / 3600, 3)

            rows.append(row)

    df = pd.DataFrame(rows)
    df.to_csv(out_path, index=False)

    mode = "TRAINING (with labels)" if labels_path else "INFERENCE (no labels)"
    print(f"Mode: {mode}")
    print(f"Wrote {len(df)} rows, {len(df.columns)} columns to {out_path}")
    if labels_path and len(df):
        print(f"label_true_channel distribution:\n{df['label_true_channel'].value_counts()}")
        neg_time = (df['label_time_to_cashout_hours'] < 0).sum()
        if neg_time:
            print(f"WARNING: {neg_time} rows have a NEGATIVE time_to_cashout_hours "
                  f"-- this means a snapshot's as_of_time is after the true cash-out "
                  f"window started. Check the generator's chronology if this is nonzero.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshots", required=True)
    parser.add_argument("--labels", default=None,
                         help="Omit for an inference-shaped table with no label_* columns")
    parser.add_argument("--out", default="features.csv")
    args = parser.parse_args()
    build(args.snapshots, args.labels, args.out)
