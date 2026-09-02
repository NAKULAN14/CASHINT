"""
Location Candidate Generator
--------------------------------
A ranking model needs multiple CANDIDATES per case snapshot to rank against
each other -- not just the single true answer. This script builds that:
for every snapshot, picks a shortlist of real ATMs (the true one + a mix of
geographically-near "hard" negatives and far "easy" negatives), and computes
ranking features for each (case_id, snapshot_index, candidate_atm) row.

Output is a LONG table: one row per candidate, grouped by (case_id,
snapshot_index) -- this is the standard shape LightGBM's lambdarank
objective expects (a "group" column marking how many consecutive rows
belong to the same query).

Usage:
    python build_location_candidates.py --snapshots snapshots.jsonl \
        --labels labels.jsonl --atm_csv atm_locations.csv \
        --out location_candidates.csv --n_hard_negatives 15 --n_easy_negatives 5
"""

import argparse
import json
import math
import random

import pandas as pd


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def load_atms(path):
    df = pd.read_csv(path)
    return df.to_dict("records")


def nearest_atms(atms, lat, lon, k):
    scored = sorted(atms, key=lambda a: haversine_km(lat, lon, a["lat"], a["lon"]))
    return scored[:k]


def build_candidates(snapshots_path, labels_path, atm_csv, out_path,
                      n_hard_negatives, n_easy_negatives, seed=42):
    random.seed(seed)

    labels_by_case = {}
    with open(labels_path) as f:
        for line in f:
            rec = json.loads(line)
            labels_by_case[rec["case_id"]] = rec["ground_truth"]

    atms = load_atms(atm_csv)
    print(f"Loaded {len(atms)} ATM locations.")

    rows = []
    n_groups = 0
    n_missing_true_atm = 0

    with open(snapshots_path) as f:
        for line in f:
            s = json.loads(line)
            gt = labels_by_case.get(s["case_id"])
            if gt is None:
                continue

            accounts = {a["account_id"]: a for a in s["visible_accounts"]}
            terminal = accounts.get(s["terminal_account_id"])
            terminal_lat = terminal["branch_lat"] if terminal else s["victim_lat"]
            terminal_lon = terminal["branch_lon"] if terminal else s["victim_lon"]
            terminal_bank = terminal["bank"] if terminal else None

            # candidate pool: nearest-to-victim (hard negatives) + random (easy negatives)
            hard = nearest_atms(atms, s["victim_lat"], s["victim_lon"], n_hard_negatives)
            easy = random.sample(atms, min(n_easy_negatives, len(atms)))
            candidates = {a["id"]: a for a in (hard + easy)}  # dedupe by id

            true_id = gt["true_location_id"]
            if true_id not in candidates:
                # ensure the true answer is always present, even if it
                # wasn't geographically close (e.g. a noisy case)
                match = next((a for a in atms if str(a["id"]) == str(true_id)), None)
                if match:
                    candidates[true_id] = match
                else:
                    n_missing_true_atm += 1
                    continue  # can't build a valid group without the true label present

            group_rows = []
            for atm_id, atm in candidates.items():
                dist_victim = haversine_km(s["victim_lat"], s["victim_lon"], atm["lat"], atm["lon"])
                dist_terminal = haversine_km(terminal_lat, terminal_lon, atm["lat"], atm["lon"])
                group_rows.append({
                    "case_id": s["case_id"],
                    "snapshot_index": s["snapshot_index"],
                    "candidate_atm_id": atm_id,
                    "candidate_lat": atm["lat"],
                    "candidate_lon": atm["lon"],
                    "candidate_bank": atm.get("bank"),
                    "dist_victim_km": round(dist_victim, 3),
                    "dist_terminal_km": round(dist_terminal, 3),
                    "same_bank_as_terminal": int(atm.get("bank") == terminal_bank),
                    "n_hops_observed": s["n_hops_observed"],
                    "terminal_readiness": s["terminal_account_readiness"] or 0.0,
                    "stolen_amount": s["stolen_amount"],
                    "urban": int(s["urban"]),
                    "is_final_snapshot": int(s["is_final_snapshot"]),
                    "label_is_true": int(str(atm_id) == str(true_id)),
                })

            rows.extend(group_rows)
            n_groups += 1

    df = pd.DataFrame(rows)
    df.to_csv(out_path, index=False)

    n_true = df["label_is_true"].sum()
    print(f"Built {n_groups} groups, {len(df)} candidate rows.")
    print(f"Groups with a true label present: {n_true} (should equal n_groups: {n_groups})")
    if n_missing_true_atm:
        print(f"WARNING: {n_missing_true_atm} snapshots skipped -- true_location_id "
              f"not found in atm_csv. Check that atm_csv matches the file used "
              f"to generate cases.jsonl.")
    print(f"Avg candidates per group: {len(df) / max(n_groups, 1):.1f}")
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshots", required=True)
    parser.add_argument("--labels", required=True)
    parser.add_argument("--atm_csv", required=True)
    parser.add_argument("--out", default="location_candidates.csv")
    parser.add_argument("--n_hard_negatives", type=int, default=15)
    parser.add_argument("--n_easy_negatives", type=int, default=5)
    args = parser.parse_args()
    build_candidates(args.snapshots, args.labels, args.atm_csv, args.out,
                      args.n_hard_negatives, args.n_easy_negatives)
