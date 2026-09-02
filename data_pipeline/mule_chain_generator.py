"""
Synthetic Mule-Chain Case Generator
------------------------------------
Generates synthetic cybercrime cases with multi-hop mule account chains,
a ground-truth cash-out outcome (channel + location + time), and
behavioural features that are DELIBERATELY correlated with that outcome
so downstream models (channel classifier, location ranker, time model)
have real signal to learn from -- not just structurally plausible noise.

Design principle: generate the ground truth FIRST, then walk backward to
build the account chain and features consistent with it. This guarantees
every case has a coherent, learnable answer.

Usage:
    python mule_chain_generator.py --n_cases 2000 --atm_csv atm_locations.csv --out cases.jsonl
"""

import argparse
import csv
import json
import math
import random
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from typing import List, Optional

import numpy as np


# ---------------------------------------------------------------------------
# 1. CONFIG -- tune these instead of touching generation logic
# ---------------------------------------------------------------------------

@dataclass
class GenConfig:
    n_cases: int = 2000
    chain_len_mean: float = 3.0          # Poisson mean number of hops before cash-out
    chain_len_min: int = 1
    chain_len_max: int = 7

    amount_lognorm_mean: float = 10.5    # log-space mean (~ INR 36,000 median)
    amount_lognorm_sigma: float = 0.9

    # channel mix, adjusted by urban/rural flag at generation time
    channel_weights_urban: dict = field(default_factory=lambda: {
        "ATM": 0.45, "Branch": 0.10, "Agent": 0.10, "UPI": 0.30, "Other": 0.05})
    channel_weights_rural: dict = field(default_factory=lambda: {
        "ATM": 0.20, "Branch": 0.15, "Agent": 0.45, "UPI": 0.15, "Other": 0.05})

    # amount-based multipliers on top of the base urban/rural weights above.
    # Rationale: ATMs/UPI have real per-transaction/daily caps, so very large
    # amounts realistically push toward Branch; small amounts are easy via
    # UPI/Agent. Thresholds are in INR.
    amount_tier_low_max: float = 15000.0
    amount_tier_mid_max: float = 100000.0
    channel_amount_multipliers: dict = field(default_factory=lambda: {
        "low":  {"ATM": 1.0, "Branch": 0.5, "Agent": 1.3, "UPI": 1.4, "Other": 1.0},
        "mid":  {"ATM": 1.3, "Branch": 1.0, "Agent": 1.0, "UPI": 0.7, "Other": 1.0},
        "high": {"ATM": 0.6, "Branch": 1.8, "Agent": 0.8, "UPI": 0.15, "Other": 1.0},
    })

    # chain-length multiplier: longer/more elaborate mule chains skew toward
    # less traceable channels (Agent/Other) over a simple ATM withdrawal
    long_chain_hop_threshold: int = 5
    long_chain_multipliers: dict = field(default_factory=lambda: {
        "ATM": 0.9, "Branch": 0.9, "Agent": 1.4, "UPI": 0.9, "Other": 1.3})

    geo_signal_fraction: float = 0.70    # fraction of cases where true location is
                                          # spatially near a known case entity
    max_geo_bias_km: float = 15.0        # radius used when biasing location choice

    noisy_case_fraction: float = 0.25    # fraction of cases with weak/contradictory
                                          # signal -- feeds the low-confidence gate

    cashout_delay_lognorm_mean: float = 1.2   # hours, log-space mean
    cashout_delay_lognorm_sigma: float = 1.1  # long tail out to a few days

    urban_fraction: float = 0.65
    random_seed: int = 42

    # optional: hour-of-day weights (len 24) fitted from real PaySim fraud
    # CASH_OUT timing via calibrate_from_paysim.py -- if set, cash-out hour
    # is resampled to match real fraud timing instead of being fully random
    hour_of_day_weights: Optional[List[float]] = None

    @classmethod
    def from_calibration(cls, calibration_path: Optional[str] = None, **overrides):
        cfg = cls(**overrides)
        if calibration_path:
            with open(calibration_path) as f:
                cal = json.load(f)
            cfg.amount_lognorm_mean = cal.get("amount_lognorm_mean", cfg.amount_lognorm_mean)
            cfg.amount_lognorm_sigma = cal.get("amount_lognorm_sigma", cfg.amount_lognorm_sigma)
            cfg.hour_of_day_weights = cal.get("hour_of_day_weights", cfg.hour_of_day_weights)
            print(f"Loaded calibration from {calibration_path}: "
                  f"amount_lognorm_mean={cfg.amount_lognorm_mean}, "
                  f"amount_lognorm_sigma={cfg.amount_lognorm_sigma}, "
                  f"hour_of_day_weights={'set' if cfg.hour_of_day_weights else 'unset'}")
        return cfg


# ---------------------------------------------------------------------------
# 2. DATA CLASSES
# ---------------------------------------------------------------------------

@dataclass
class Account:
    account_id: str
    bank: str
    branch_lat: float
    branch_lon: float
    age_days: int
    dormant_before_case: bool
    cashout_readiness: float = 0.0   # injected signal, rises near the true cash-out hop


@dataclass
class Transaction:
    from_account: str
    to_account: str
    amount: float
    timestamp: str
    split_group: Optional[str] = None   # groups sub-transfers from a split event


@dataclass
class GroundTruth:
    true_channel: str
    true_location_id: str
    true_lat: float
    true_lon: float
    true_time_start: str
    true_time_end: str
    is_noisy_case: bool               # True => deliberately weak/contradictory signal


@dataclass
class Case:
    case_id: str
    victim_lat: float
    victim_lon: float
    stolen_amount: float
    complaint_timestamp: str
    urban: bool
    accounts: List[Account]
    transactions: List[Transaction]
    ground_truth: GroundTruth


# ---------------------------------------------------------------------------
# 3. HELPERS
# ---------------------------------------------------------------------------

def combine_channel_weights(cfg: GenConfig, base_weights: dict, stolen_amount: float,
                             n_hops: int) -> dict:
    """Combines base urban/rural weights with amount-tier and chain-length
    multipliers, then renormalizes. This is what gives the channel choice
    real, learnable structure instead of depending on urban/rural alone."""
    if stolen_amount <= cfg.amount_tier_low_max:
        tier = "low"
    elif stolen_amount <= cfg.amount_tier_mid_max:
        tier = "mid"
    else:
        tier = "high"
    amount_mult = cfg.channel_amount_multipliers[tier]

    is_long_chain = n_hops >= cfg.long_chain_hop_threshold
    chain_mult = cfg.long_chain_multipliers if is_long_chain else {c: 1.0 for c in base_weights}

    combined = {c: base_weights[c] * amount_mult.get(c, 1.0) * chain_mult.get(c, 1.0)
                for c in base_weights}
    total = sum(combined.values())
    return {c: w / total for c, w in combined.items()}


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def load_atm_locations(csv_path: str):
    """Expects columns: id,lat,lon,bank. Falls back to a synthetic grid
    over a rough India bounding box if no real file is supplied yet --
    swap this out for the real data.gov.in ATM/branch file when you have it."""
    locations = []
    if csv_path:
        with open(csv_path, newline="") as f:
            for row in csv.DictReader(f):
                locations.append({
                    "id": row["id"], "lat": float(row["lat"]),
                    "lon": float(row["lon"]), "bank": row.get("bank", "unknown")})
        return locations

    rng = np.random.default_rng(0)
    lats = rng.uniform(8.0, 28.0, 500)
    lons = rng.uniform(72.0, 88.0, 500)
    return [{"id": f"ATM_{i}", "lat": float(lat), "lon": float(lon), "bank": "sim_bank"}
            for i, (lat, lon) in enumerate(zip(lats, lons))]


def nearby_locations(locations, lat, lon, radius_km, k=5):
    scored = [(haversine_km(lat, lon, loc["lat"], loc["lon"]), loc) for loc in locations]
    scored.sort(key=lambda x: x[0])
    within = [loc for d, loc in scored if d <= radius_km]
    return within[:k] if within else [scored[0][1]]


def random_timestamp_near(base: datetime, max_hours_forward: float) -> datetime:
    return base + timedelta(hours=random.uniform(0, max_hours_forward))


# ---------------------------------------------------------------------------
# 4. CASE GENERATION -- ground truth first, then walk backward
# ---------------------------------------------------------------------------

def generate_case(cfg: GenConfig, atm_locations, banks) -> Case:
    case_id = str(uuid.uuid4())
    urban = random.random() < cfg.urban_fraction

    # victim + stolen amount
    victim_lat = random.uniform(8.0, 28.0)
    victim_lon = random.uniform(72.0, 88.0)
    stolen_amount = float(np.random.lognormal(cfg.amount_lognorm_mean, cfg.amount_lognorm_sigma))
    complaint_time = datetime(2026, 1, 1) + timedelta(
        days=random.randint(0, 300), hours=random.randint(0, 23))

    is_noisy = random.random() < cfg.noisy_case_fraction

    # sample chain length FIRST so channel choice below can depend on it
    n_hops = int(np.clip(np.random.poisson(cfg.chain_len_mean),
                          cfg.chain_len_min, cfg.chain_len_max))

    # --- STEP 1: sample the TRUE outcome first ---
    base_weights = cfg.channel_weights_urban if urban else cfg.channel_weights_rural
    weights = combine_channel_weights(cfg, base_weights, stolen_amount, n_hops)
    true_channel = random.choices(list(weights.keys()), weights=list(weights.values()))[0]

    use_geo_signal = (random.random() < cfg.geo_signal_fraction) and not is_noisy
    if use_geo_signal:
        candidates = nearby_locations(atm_locations, victim_lat, victim_lon, cfg.max_geo_bias_km)
    else:
        candidates = random.sample(atm_locations, min(5, len(atm_locations)))
    true_loc = random.choice(candidates)

    delay_hours = float(np.random.lognormal(cfg.cashout_delay_lognorm_mean,
                                             cfg.cashout_delay_lognorm_sigma))
    cashout_time = complaint_time + timedelta(hours=delay_hours)

    # if calibrated against real PaySim fraud timing, resample the HOUR
    # component to match the real fraud hour-of-day distribution while
    # keeping the day offset from the lognormal delay above
    if cfg.hour_of_day_weights:
        target_hour = random.choices(range(24), weights=cfg.hour_of_day_weights)[0]
        cashout_time = cashout_time.replace(
            hour=target_hour, minute=random.randint(0, 59), second=0, microsecond=0)
    window_hours = 1.5 if not is_noisy else random.uniform(3, 8)  # noisy cases -> wider, vaguer window
    true_time_start = cashout_time - timedelta(hours=window_hours / 2)
    true_time_end = cashout_time + timedelta(hours=window_hours / 2)
    # the prediction window can never start before the crime itself was reported
    min_start = complaint_time + timedelta(minutes=15)
    if true_time_start < min_start:
        shift = min_start - true_time_start
        true_time_start += shift
        true_time_end += shift

    ground_truth = GroundTruth(
        true_channel=true_channel,
        true_location_id=true_loc["id"],
        true_lat=true_loc["lat"],
        true_lon=true_loc["lon"],
        true_time_start=true_time_start.isoformat(),
        true_time_end=true_time_end.isoformat(),
        is_noisy_case=is_noisy,
    )

    # --- STEP 2: build the account chain, IN CHRONOLOGICAL ORDER, constrained
    # to fit strictly between complaint_time and cashout_time so hop timestamps
    # can never fall before the victim's own transfer or after the cash-out.
    # (n_hops was already sampled above, before channel selection) ---

    # hard limit: every hop must land strictly before the ground-truth
    # prediction window starts, not just before the cash-out midpoint
    usable_hours = max((true_time_start - complaint_time).total_seconds() / 3600.0, 0.1)
    raw_offsets = sorted(np.random.uniform(0.05, 0.85, max(n_hops - 1, 0)))
    hop_times = [complaint_time + timedelta(hours=frac * usable_hours)
                 for frac in raw_offsets]

    accounts: List[Account] = []
    transactions: List[Transaction] = []
    remaining_amount = stolen_amount
    prev_account_id = None

    for hop_idx in range(n_hops):
        acc_id = f"ACC_{uuid.uuid4().hex[:8]}"
        branch = random.choice(atm_locations)
        is_last_before_cashout = (hop_idx == n_hops - 1)
        age_days = random.randint(1, 15) if is_last_before_cashout else random.randint(1, 1500)
        dormant = random.random() < 0.6  # mule accounts often look dormant before use

        # cash-out readiness rises the closer the hop is to the true cash-out event
        proximity = (hop_idx + 1) / n_hops
        readiness = np.clip(proximity + np.random.normal(0, 0.08), 0, 1)
        if is_noisy:
            readiness = np.clip(readiness + np.random.normal(0, 0.25), 0, 1)  # blur the signal

        accounts.append(Account(
            account_id=acc_id, bank=random.choice(banks),
            branch_lat=branch["lat"], branch_lon=branch["lon"],
            age_days=age_days, dormant_before_case=dormant,
            cashout_readiness=float(readiness)))

        if prev_account_id is not None:
            hop_time = hop_times[hop_idx - 1]
            split = random.random() < 0.2  # 20% of hops split into sub-transfers
            if split:
                n_splits = random.randint(2, 3)
                group_id = f"split_{uuid.uuid4().hex[:6]}"
                portions = np.random.dirichlet(np.ones(n_splits)) * remaining_amount
                for portion in portions:
                    transactions.append(Transaction(
                        from_account=prev_account_id, to_account=acc_id,
                        amount=round(float(portion), 2),
                        timestamp=hop_time.isoformat(), split_group=group_id))
            else:
                transactions.append(Transaction(
                    from_account=prev_account_id, to_account=acc_id,
                    amount=round(remaining_amount, 2), timestamp=hop_time.isoformat()))
            remaining_amount *= random.uniform(0.85, 1.0)  # small leakage/fees per hop

        prev_account_id = acc_id

    # victim -> first account in the chain (always the earliest transaction)
    if accounts:
        first_acc = accounts[0].account_id
        transactions.append(Transaction(
            from_account="VICTIM", to_account=first_acc,
            amount=round(stolen_amount, 2), timestamp=complaint_time.isoformat()))

    transactions.sort(key=lambda t: t.timestamp)

    return Case(
        case_id=case_id, victim_lat=victim_lat, victim_lon=victim_lon,
        stolen_amount=round(stolen_amount, 2), complaint_timestamp=complaint_time.isoformat(),
        urban=urban, accounts=accounts,  # already chronological
        transactions=transactions, ground_truth=ground_truth)


# ---------------------------------------------------------------------------
# 5. BATCH GENERATION
# ---------------------------------------------------------------------------

def generate_dataset(cfg: GenConfig, atm_csv: Optional[str], out_path: str):
    random.seed(cfg.random_seed)
    np.random.seed(cfg.random_seed)

    atm_locations = load_atm_locations(atm_csv)
    banks = ["SBI", "HDFC", "ICICI", "Axis", "PNB", "Kotak", "BOB", "Union"]

    with open(out_path, "w") as f:
        for _ in range(cfg.n_cases):
            case = generate_case(cfg, atm_locations, banks)
            f.write(json.dumps(asdict(case)) + "\n")

    print(f"Wrote {cfg.n_cases} synthetic cases to {out_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--n_cases", type=int, default=2000)
    parser.add_argument("--atm_csv", type=str, default=None,
                         help="CSV with columns id,lat,lon,bank (e.g. data.gov.in ATM export). "
                              "If omitted, a synthetic ATM grid over India is used.")
    parser.add_argument("--out", type=str, default="cases.jsonl")
    parser.add_argument("--calibration", type=str, default=None,
                         help="Optional calibration.json from calibrate_from_paysim.py "
                              "-- grounds amount and cash-out-hour distributions in real "
                              "PaySim fraud statistics instead of hand-picked defaults.")
    args = parser.parse_args()

    cfg = GenConfig.from_calibration(args.calibration, n_cases=args.n_cases)
    generate_dataset(cfg, args.atm_csv, args.out)