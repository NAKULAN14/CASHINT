import math
import random
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Any, Optional

import numpy as np
import pandas as pd

from data_pipeline.build_feature_table import flatten_snapshot
from backend.models_loader import get_models
from backend.data_service import get_data_service


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def predict_channel(row: dict) -> Tuple[List[dict], str, float]:
    models = get_models()
    x = pd.DataFrame([{c: row.get(c, 0) for c in models.channel_features}])
    probs = models.channel_model.predict(x)[0]
    ranked = sorted(zip(models.channel_classes, probs), key=lambda t: -t[1])
    
    predictions = [{"channel": name, "probability": round(float(prob), 4)} for name, prob in ranked]
    top_channel, top_prob = ranked[0]
    return predictions, top_channel, round(float(top_prob), 4)


def predict_time_window(row: dict, as_of_time_str: str) -> dict:
    models = get_models()
    x = pd.DataFrame([{c: row.get(c, 0) for c in models.time_features}])
    
    # Rule 2: Models operate in log-space, apply np.expm1()
    p10 = max(0.0, float(np.expm1(models.time_models["lower_p10"].predict(x)[0])))
    p50 = max(0.0, float(np.expm1(models.time_models["median_p50"].predict(x)[0])))
    p90 = max(0.0, float(np.expm1(models.time_models["upper_p90"].predict(x)[0])))

    # Compute wall-clock cashout timestamps
    try:
        as_of_dt = datetime.fromisoformat(as_of_time_str)
    except Exception:
        as_of_dt = datetime.now()

    start_dt = as_of_dt + timedelta(hours=p10)
    end_dt = as_of_dt + timedelta(hours=p90)

    return {
        "lower_hours": round(p10, 2),
        "median_hours": round(p50, 2),
        "upper_hours": round(p90, 2),
        "cashout_window_start": start_dt.isoformat(),
        "cashout_window_end": end_dt.isoformat(),
    }


def predict_location(
    snapshot: dict,
    mode: str = "baseline",
    top_k: int = 3,
    n_hard_negatives: int = 15,
    n_easy_negatives: int = 5
) -> List[dict]:
    data_svc = get_data_service()
    atms = data_svc.atms
    models = get_models()

    accounts = {a["account_id"]: a for a in snapshot.get("visible_accounts", [])}
    terminal = accounts.get(snapshot.get("terminal_account_id"))
    t_lat = terminal["branch_lat"] if terminal else snapshot["victim_lat"]
    t_lon = terminal["branch_lon"] if terminal else snapshot["victim_lon"]
    t_bank = terminal["bank"] if terminal else None

    if mode == "model" and models.location_model is not None:
        # Score shortlisted candidates: 15 nearest-to-victim + 5 random candidates
        atms_sorted = sorted(atms, key=lambda a: haversine_km(
            snapshot["victim_lat"], snapshot["victim_lon"], a["lat"], a["lon"]))
        hard = atms_sorted[:n_hard_negatives]
        easy = random.sample(atms, min(n_easy_negatives, len(atms)))
        pool = list({a["id"]: a for a in (hard + easy)}.values())
    else:
        # Production default: nearest-to-victim baseline
        pool = atms
        mode = "baseline"

    candidates = []
    for atm in pool:
        dist_v = haversine_km(snapshot["victim_lat"], snapshot["victim_lon"], atm["lat"], atm["lon"])
        dist_t = haversine_km(t_lat, t_lon, atm["lat"], atm["lon"])
        candidates.append({
            "id": atm["id"],
            "atm_id": atm["id"],
            "lat": atm["lat"],
            "lon": atm["lon"],
            "bank": atm.get("bank"),
            "dist_victim_km": round(dist_v, 2),
            "dist_terminal_km": round(dist_t, 2),
            "same_bank_as_terminal": int(atm.get("bank") == t_bank),
        })

    if mode == "baseline":
        ranked = sorted(candidates, key=lambda c: c["dist_victim_km"])
    else:
        rows = []
        for c in candidates:
            rows.append({
                **c,
                "n_hops_observed": snapshot.get("n_hops_observed", 1),
                "terminal_readiness": snapshot.get("terminal_account_readiness") or 0.0,
                "stolen_amount": snapshot.get("stolen_amount", 0.0),
                "urban": int(bool(snapshot.get("urban", True))),
                "is_final_snapshot": int(bool(snapshot.get("is_final_snapshot", False))),
            })
        X = pd.DataFrame(rows)[models.location_features]
        scores = models.location_model.predict(X)
        for c, s in zip(candidates, scores):
            c["score"] = round(float(s), 4)
        ranked = sorted(candidates, key=lambda c: -c["score"])

    return ranked[:top_k]


def compute_confidence(
    channel_ranked: List[Tuple[str, float]],
    time_window: Tuple[float, float, float],
    location_ranked: List[dict],
    n_hops_observed: int
) -> dict:
    top_channel_prob = channel_ranked[0][1]
    channel_conf = np.clip((top_channel_prob - 0.20) / 0.60, 0, 1)

    p10, p50, p90 = time_window
    window_width = p90 - p10
    relative_width = window_width / max(p50, 0.1)
    time_conf = np.clip(1 - (relative_width / 6.0), 0, 1)

    if len(location_ranked) >= 2:
        d1 = location_ranked[0]["dist_victim_km"]
        d2 = location_ranked[1]["dist_victim_km"]
        gap = abs(d2 - d1) / max(d1, 1.0)
        location_conf = np.clip(gap, 0, 1)
    else:
        location_conf = 0.5

    evidence_penalty = 0.5 if n_hops_observed <= 1 else 1.0
    overall = evidence_penalty * np.mean([channel_conf, time_conf, location_conf])

    if overall >= 0.6:
        level = "HIGH"
    elif overall >= 0.35:
        level = "MEDIUM"
    else:
        level = "LOW"

    return {
        "level": level,
        "overall_score": round(float(overall), 2),
        "channel_conf": round(float(channel_conf), 2),
        "time_conf": round(float(time_conf), 2),
        "location_conf": round(float(location_conf), 2),
        "evidence_penalty_applied": evidence_penalty < 1.0,
    }


def extract_supporting_signals(row: dict, location_ranked: List[dict]) -> List[dict]:
    signals = []

    # 1. Terminal readiness
    readiness = row.get("terminal_readiness", 0.0)
    if readiness >= 0.8:
        readiness_interp = "High cash-out readiness: mule account is pre-warmed for immediate liquidation"
        imp = "High"
    elif readiness >= 0.5:
        readiness_interp = "Moderate readiness: account active but may require further operational steps"
        imp = "Medium"
    else:
        readiness_interp = "Low readiness: potential mid-chain transit or dormant account"
        imp = "Normal"
    signals.append({
        "signal": "Terminal Account Readiness",
        "value": f"{int(readiness * 100)}%",
        "interpretation": readiness_interp,
        "importance": imp
    })

    # 2. Hop velocity
    velocity = row.get("hop_velocity", 0.0)
    if velocity >= 2.0:
        vel_interp = "Rapid hop movement: automated or high-tempo criminal routing"
        imp = "High"
    elif velocity >= 0.8:
        vel_interp = "Standard execution tempo: steady manual or scheduled fund transfers"
        imp = "Medium"
    else:
        vel_interp = "Slow propagation: delayed movement across accounts"
        imp = "Normal"
    signals.append({
        "signal": "Hop Velocity",
        "value": f"{velocity:.2f} hops/hr",
        "interpretation": vel_interp,
        "importance": imp
    })

    # 3. Layering Depth (Hops)
    hops = row.get("n_hops_observed", 1)
    signals.append({
        "signal": "Observed Layering Depth",
        "value": f"{hops} hops",
        "interpretation": "Current investigative visibility into the mule syndicate chain",
        "importance": "High" if hops >= 3 else "Medium"
    })

    # 4. Bank diversity
    banks = row.get("n_unique_banks_seen", 1)
    signals.append({
        "signal": "Banking Rail Diversity",
        "value": f"{banks} institutions",
        "interpretation": "Cross-bank transfer hops intended to obfuscate audit trails",
        "importance": "Medium"
    })

    # 5. Dormant account ratio
    dormant_ratio = row.get("dormant_account_ratio", 0.0)
    signals.append({
        "signal": "Dormant Account Penetration",
        "value": f"{int(dormant_ratio * 100)}%",
        "interpretation": "Proportion of recruited mule accounts that were inactive prior to this incident",
        "importance": "High" if dormant_ratio >= 0.5 else "Normal"
    })

    # 6. Nearest ATM Proximity
    if location_ranked:
        d1 = location_ranked[0]["dist_victim_km"]
        signals.append({
            "signal": "Primary Candidate Proximity",
            "value": f"{d1:.1f} km",
            "interpretation": f"Distance from victim coordinate to top candidate ({location_ranked[0]['id']})",
            "importance": "Medium"
        })

    return signals


def run_prediction_pipeline(snapshot: dict, location_mode: str = "baseline") -> dict:
    row = flatten_snapshot(snapshot)

    # Channel prediction
    channel_predictions, top_channel, top_channel_prob = predict_channel(row)
    channel_ranked = [(p["channel"], p["probability"]) for p in channel_predictions]

    # Time window prediction
    time_res = predict_time_window(row, snapshot["as_of_time"])
    p10 = time_res["lower_hours"]
    p50 = time_res["median_hours"]
    p90 = time_res["upper_hours"]

    # Location prediction
    location_ranked = predict_location(snapshot, mode=location_mode, top_k=3)

    # Confidence scoring
    confidence_res = compute_confidence(
        channel_ranked, (p10, p50, p90), location_ranked, snapshot.get("n_hops_observed", 1)
    )

    # Supporting signals
    supporting_signals = extract_supporting_signals(row, location_ranked)

    return {
        "case_id": snapshot["case_id"],
        "snapshot_index": snapshot["snapshot_index"],
        "as_of_time": snapshot["as_of_time"],
        "n_hops_observed": snapshot.get("n_hops_observed", 1),
        "channel": {
            "predictions": channel_predictions,
            "top_channel": top_channel,
            "top_probability": top_channel_prob,
        },
        "time_window": time_res,
        "location": {
            "mode": location_mode,
            "top_locations": location_ranked,
        },
        "confidence": confidence_res,
        "supporting_signals": supporting_signals,
    }
