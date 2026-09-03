"""
Live Prediction Demo
------------------------
The actual "watch the prediction update as new evidence arrives" demo.
Loads the trained Channel, Location, and Time models, streams a case's
evidence snapshot-by-snapshot (via stream_case from
build_incremental_snapshots.py), and re-runs all three predictions after
each new piece of evidence -- printing the evolving picture, matching the
concept doc's "Where + When + Confidence + Why" investigator view.

Location currently uses the NEAREST-TO-VICTIM baseline, not the trained
ranker -- the trained ranker is underperforming that baseline on real data
(see model_artifacts/location_model/report.txt) and using a known-broken
model in a live demo is worse than being upfront about using a heuristic
while the ranker gets tuned. Swap back with --location_mode model once fixed.

Usage:
    python demo_app.py --cases cases.jsonl --case_id <id> \
        --channel_model_dir model_artifacts/channel_model \
        --time_model_dir model_artifacts/time_model \
        --atm_csv data/atm_locations.csv \
        --interactive
    
     python demo_app.py --cases data/cases.jsonl --channel_model_dir model_artifacts/channel_model --time_model_dir model_artifacts/time_model --atm_csv data/atm_locations.csv --location_mode model --location_model_dir model_artifacts/location_model --interactive
"""

import argparse
import json
import math
import sys

import lightgbm as lgb
import numpy as np
import pandas as pd

sys.path.insert(0, ".")
from data_pipeline.build_incremental_snapshots import stream_case
from data_pipeline.build_feature_table import flatten_snapshot


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def load_channel_model(model_dir):
    model = lgb.Booster(model_file=f"{model_dir}/channel_model.txt")
    with open(f"{model_dir}/class_names.json") as f:
        class_names = json.load(f)
    with open(f"{model_dir}/feature_cols.json") as f:
        feature_cols = json.load(f)
    return model, class_names, feature_cols


def load_time_models(model_dir):
    models = {}
    for name in ["lower_p10", "median_p50", "upper_p90"]:
        models[name] = lgb.Booster(model_file=f"{model_dir}/time_model_{name}.txt")
    with open(f"{model_dir}/feature_cols.json") as f:
        feature_cols = json.load(f)
    return models, feature_cols


def load_ranking_model(model_dir):
    model = lgb.Booster(model_file=f"{model_dir}/location_model.txt")
    with open(f"{model_dir}/feature_cols.json") as f:
        feature_cols = json.load(f)
    return model, feature_cols


def predict_channel(model, class_names, feature_cols, row):
    x = pd.DataFrame([{c: row.get(c, 0) for c in feature_cols}])
    probs = model.predict(x)[0]
    ranked = sorted(zip(class_names, probs), key=lambda t: -t[1])
    return ranked


def predict_time_window(models, feature_cols, row):
    x = pd.DataFrame([{c: row.get(c, 0) for c in feature_cols}])
    p10 = max(0, np.expm1(models["lower_p10"].predict(x)[0]))
    p50 = max(0, np.expm1(models["median_p50"].predict(x)[0]))
    p90 = max(0, np.expm1(models["upper_p90"].predict(x)[0]))
    return p10, p50, p90


def predict_location(atms, snapshot, mode, model=None, feature_cols=None, top_k=3,
                      n_hard_negatives=15, n_easy_negatives=5):
    accounts = {a["account_id"]: a for a in snapshot["visible_accounts"]}
    terminal = accounts.get(snapshot["terminal_account_id"])
    t_lat = terminal["branch_lat"] if terminal else snapshot["victim_lat"]
    t_lon = terminal["branch_lon"] if terminal else snapshot["victim_lon"]
    t_bank = terminal["bank"] if terminal else None

    if mode == "model":
        # IMPORTANT: score the same kind of shortlist build_location_candidates.py
        # used during training (nearest-to-victim + a few random), not the
        # entire ATM file. Scoring thousands of far-away, out-of-distribution
        # candidates makes the model's ranking degenerate -- most get near-
        # identical scores since case-level features (readiness, hops) are
        # constant across all of them, and only a small distance nudge
        # differentiates -- which is what produced the "frozen top-3" bug.
        atms_sorted = sorted(atms, key=lambda a: haversine_km(
            snapshot["victim_lat"], snapshot["victim_lon"], a["lat"], a["lon"]))
        hard = atms_sorted[:n_hard_negatives]
        import random as _random
        easy = _random.sample(atms, min(n_easy_negatives, len(atms)))
        pool = {a["id"]: a for a in (hard + easy)}.values()
    else:
        pool = atms  # baseline scans everything to find the true nearest -- fine, it's O(n) sort only

    candidates = []
    for atm in pool:
        dist_v = haversine_km(snapshot["victim_lat"], snapshot["victim_lon"], atm["lat"], atm["lon"])
        dist_t = haversine_km(t_lat, t_lon, atm["lat"], atm["lon"])
        candidates.append({
            "id": atm["id"], "lat": atm["lat"], "lon": atm["lon"],
            "dist_victim_km": dist_v, "dist_terminal_km": dist_t,
            "same_bank_as_terminal": int(atm.get("bank") == t_bank),
        })

    if mode == "baseline":
        ranked = sorted(candidates, key=lambda c: c["dist_victim_km"])
    else:
        rows = []
        for c in candidates:
            rows.append({**c, "n_hops_observed": snapshot["n_hops_observed"],
                         "terminal_readiness": snapshot["terminal_account_readiness"] or 0.0,
                         "stolen_amount": snapshot["stolen_amount"], "urban": int(snapshot["urban"]),
                         "is_final_snapshot": int(snapshot["is_final_snapshot"])})
        X = pd.DataFrame(rows)[feature_cols]
        scores = model.predict(X)
        for c, s in zip(candidates, scores):
            c["score"] = s
        ranked = sorted(candidates, key=lambda c: -c["score"])

    return ranked[:top_k]


def compute_confidence(channel_ranked, time_window, location_ranked, n_hops_observed):
    """Combines signal from all three predictions into one confidence read.
    Deliberately simple and rule-based (not a trained calibration model) --
    appropriate for a proof-of-concept demo. Returns (level, components)
    so the demo can show its work, not just a black-box label.

    Components:
    - channel_conf: how far the top channel probability is above a flat
      5-way guess (0.20). Scaled so a clear leader scores high.
    - time_conf: how narrow the predicted window is relative to its own
      median -- a window of +/-10% of the median is confident; a window
      several times wider than the median is not.
    - location_conf: how much the top-ranked location "wins" over the
      second-ranked one (works whether ranked by model score or by raw
      distance -- both come out of predict_location as an ordered list,
      so we use rank position + a distance-based proxy gap either way).
    """
    top_channel_prob = channel_ranked[0][1]
    channel_conf = np.clip((top_channel_prob - 0.20) / 0.60, 0, 1)  # 0.20=baseline, 0.80=very confident

    p10, p50, p90 = time_window
    window_width = p90 - p10
    relative_width = window_width / max(p50, 0.1)
    time_conf = np.clip(1 - (relative_width / 6.0), 0, 1)  # width > 6x median -> ~0 confidence

    if len(location_ranked) >= 2:
        d1 = location_ranked[0]["dist_victim_km"]
        d2 = location_ranked[1]["dist_victim_km"]
        gap = abs(d2 - d1) / max(d1, 1.0)
        location_conf = np.clip(gap, 0, 1)
    else:
        location_conf = 0.5

    # evidence-volume gate: very early snapshots (1 hop observed) shouldn't
    # be allowed to present as confident even if the numbers above look
    # okay in isolation -- matches the concept doc's "insufficient
    # intelligence" principle rather than forcing a guess on thin evidence
    evidence_penalty = 0.5 if n_hops_observed <= 1 else 1.0

    overall = evidence_penalty * np.mean([channel_conf, time_conf, location_conf])

    if overall >= 0.6:
        level = "HIGH"
    elif overall >= 0.35:
        level = "MEDIUM"
    else:
        level = "LOW"

    return level, {
        "overall": round(float(overall), 2),
        "channel_conf": round(float(channel_conf), 2),
        "time_conf": round(float(time_conf), 2),
        "location_conf": round(float(location_conf), 2),
        "evidence_penalty_applied": evidence_penalty < 1.0,
    }


def format_hours(h):
    if h < 1:
        return f"{int(round(h * 60))} min"
    return f"{h:.1f} hr"


def run_demo(case, atm_locations, channel_stuff, time_stuff, location_mode,
             location_model=None, location_feature_cols=None, interactive=False):
    channel_model, class_names, channel_cols = channel_stuff
    time_models, time_cols = time_stuff

    print(f"\n{'='*70}\nCASE {case['case_id']}\n{'='*70}")
    print(f"Stolen amount: Rs.{case['stolen_amount']:,.0f}  |  "
          f"Urban: {case['urban']}  |  Total hops in chain: {len(case['accounts'])}\n")

    for snapshot in stream_case(case):
        row = flatten_snapshot(snapshot)

        channel_ranked = predict_channel(channel_model, class_names, channel_cols, row)
        p10, p50, p90 = predict_time_window(time_models, time_cols, row)
        location_ranked = predict_location(
            atm_locations, snapshot, location_mode, location_model, location_feature_cols)

        confidence_level, confidence_parts = compute_confidence(
            channel_ranked, (p10, p50, p90), location_ranked, snapshot["n_hops_observed"])

        print(f"--- Snapshot {snapshot['snapshot_index']} | as of {snapshot['as_of_time'][:19]} "
              f"| hops observed: {snapshot['n_hops_observed']} "
              f"| readiness: {snapshot['terminal_account_readiness']:.2f} ---")

        print(f"  CONFIDENCE: {confidence_level}  "
              f"(channel={confidence_parts['channel_conf']}, "
              f"time={confidence_parts['time_conf']}, "
              f"location={confidence_parts['location_conf']})")
        if confidence_level == "LOW":
            print("  -> Insufficient/weak evidence for a precise prediction. "
                  "Treat the below as a broad regional forecast, not a "
                  "high-confidence actionable lead.")

        print("  Channel prediction:")
        for name, prob in channel_ranked[:3]:
            print(f"    {name:8s} {prob:.1%}")

        print(f"  Time window: {format_hours(p10)} - {format_hours(p90)} "
              f"(median: {format_hours(p50)})")

        print(f"  Top locations ({'model' if location_mode=='model' else 'nearest-to-victim heuristic'}):")
        for i, c in enumerate(location_ranked, 1):
            print(f"    {i}. {c['id']}  ({c['dist_victim_km']:.1f} km from victim)")

        if interactive and not snapshot["is_final_snapshot"]:
            input("\n  [Press Enter for next evidence update...]\n")
        else:
            print()

    print(f"{'='*70}\nCase stream ended (cash-out point reached).\n{'='*70}\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cases", required=True)
    parser.add_argument("--case_id", default=None, help="If omitted, uses the first case in the file.")
    parser.add_argument("--channel_model_dir", required=True)
    parser.add_argument("--time_model_dir", required=True)
    parser.add_argument("--atm_csv", required=True)
    parser.add_argument("--location_mode", choices=["baseline", "model"], default="baseline",
                         help="baseline = nearest-to-victim heuristic (recommended until the "
                              "trained ranker beats it -- see model_artifacts/location_model/report.txt)")
    parser.add_argument("--location_model_dir", default=None,
                         help="Required if --location_mode model")
    parser.add_argument("--interactive", action="store_true",
                         help="Pause for Enter between snapshots (for live demo pacing)")
    args = parser.parse_args()

    with open(args.cases) as f:
        cases = [json.loads(line) for line in f]
    case = next((c for c in cases if c["case_id"] == args.case_id), cases[0]) if args.case_id else cases[0]

    atm_locations = pd.read_csv(args.atm_csv).to_dict("records")

    channel_stuff = load_channel_model(args.channel_model_dir)
    time_stuff = load_time_models(args.time_model_dir)

    location_model, location_feature_cols = (None, None)
    if args.location_mode == "model":
        if not args.location_model_dir:
            raise ValueError("--location_model_dir is required when --location_mode model")
        location_model, location_feature_cols = load_ranking_model(args.location_model_dir)

    run_demo(case, atm_locations, channel_stuff, time_stuff, args.location_mode,
              location_model, location_feature_cols, args.interactive)


if __name__ == "__main__":
    main()