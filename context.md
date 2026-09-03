# Project Context — Predictive Cash-Out Intelligence
# For: Agent building the frontend and backend

---

> [!CAUTION]
> ## The entire `data/` directory is gitignored — you will NOT have it after cloning.
>
> The `.gitignore` excludes **everything under `data/`**. None of the derived data
> files exist in the repo and must be generated before the backend can start.
> The raw source files (`data/raw/ATM_DATA.xlsx`, `data/raw/lat.csv`, `data/raw/PAYSIM.csv`)
> are also not in the repo.
>
> The **model artifacts** (`model_artifacts/`) ARE committed — no retraining needed.

> [!IMPORTANT]
> ## Generating the synthetic dataset (no raw source files required)
>
> The pipeline has built-in synthetic fallbacks — **you do not need the real RBI or
> PaySim files** to generate a working dataset. Run these commands from the repo root
> in order:
>
> ```bash
> # 0. Create the data directory (gitignored, won't exist after clone)
> mkdir data
>
> # 1. Generate a synthetic ATM location file (500 ATMs spread across India).
> #    This replicates the internal fallback grid used by the mule chain generator,
> #    but saves it to a file so the rest of the pipeline can reference it.
> python -c "
> import numpy as np, csv, os
> os.makedirs('data', exist_ok=True)
> rng = np.random.default_rng(0)
> lats = rng.uniform(8.0, 28.0, 500)
> lons = rng.uniform(72.0, 88.0, 500)
> banks = ['SBI','HDFC','ICICI','Axis','PNB','Kotak','BOB','Union']
> with open('data/atm_locations.csv', 'w', newline='') as f:
>     w = csv.DictWriter(f, fieldnames=['id','lat','lon','bank'])
>     w.writeheader()
>     for i,(lat,lon) in enumerate(zip(lats,lons)):
>         w.writerow({'id':f'ATM_{i}','lat':round(float(lat),6),'lon':round(float(lon),6),'bank':banks[i%len(banks)]})
> print('Written 500 synthetic ATMs to data/atm_locations.csv')
> "
>
> # 2. Generate 2000 synthetic cybercrime cases.
> #    --calibration is omitted intentionally — the generator uses sensible built-in
> #    defaults (lognormal amounts, uniform hour-of-day) without it.
> python data_pipeline/mule_chain_generator.py \
>     --n_cases 2000 \
>     --atm_csv data/atm_locations.csv \
>     --out data/cases.jsonl
>
> # 3. Slice each case into time-ordered evidence snapshots.
> #    Writes snapshots.jsonl (no ground truth) and labels.jsonl (ground truth only).
> python data_pipeline/build_incremental_snapshots.py \
>     --cases data/cases.jsonl \
>     --snapshots_out data/snapshots.jsonl \
>     --labels_out data/labels.jsonl
>
> # 4. Flatten snapshots into a training feature table (needed only if retraining).
> python data_pipeline/build_feature_table.py \
>     --snapshots data/snapshots.jsonl \
>     --labels data/labels.jsonl \
>     --out data/features_train.csv
>
> # 5. Build ATM ranking candidates (needed only if retraining the location model).
> python data_pipeline/build_location_candidates.py \
>     --snapshots data/snapshots.jsonl \
>     --labels data/labels.jsonl \
>     --atm_csv data/atm_locations.csv \
>     --out data/location_candidates.csv
> ```
>
> **After steps 1–3, the backend can start.** Steps 4–5 are only needed if you
> want to retrain the models (the pre-trained artifacts in `model_artifacts/` already work).
>
> The three files the backend requires at startup:
> - `data/atm_locations.csv` — the ATM database (for map + location prediction)
> - `data/cases.jsonl` — all cases (for the `/cases` endpoint)
> - `data/snapshots.jsonl` — all evidence snapshots (for the `/snapshots` endpoints)

---

## 1. What this system does

This is a cybercrime investigation tool. When a fraud victim files a complaint, law
enforcement has a narrow window to intercept the criminal before they physically
withdraw ("cash out") stolen money from a bank or ATM. The criminal almost always
moves money through a chain of mule accounts first.

This system:
1. Takes a live fraud case (the victim, the stolen amount, and the mule account
   chain being progressively discovered by investigators)
2. After each new hop of evidence, re-runs three ML models
3. Outputs a combined "Where + When + How + Confidence" investigator alert

The key insight is **incremental prediction** — predictions update as evidence
accumulates, and the system explicitly tracks confidence so investigators know
when to act vs. wait for more evidence.

---

## 2. Repository layout

```
SIH/
├── data_pipeline/
│   ├── mule_chain_generator.py        # generates synthetic cases (cases.jsonl)
│   ├── prepare_atm_dataset.py         # geocodes RBI ATM export → atm_locations.csv
│   ├── calibrate_from_paysim.py       # fits PaySim stats → calibration.json
│   ├── build_incremental_snapshots.py # cases → snapshots.jsonl + labels.jsonl
│   ├── build_feature_table.py         # snapshots → features_train.csv
│   └── build_location_candidates.py   # snapshots → location_candidates.csv
├── models/
│   ├── train_channel_model.py
│   ├── train_location_model.py
│   ├── train_time_model.py
│   └── fix_paysim_target.py
├── model_artifacts/
│   ├── channel_model/                 # ← load this for channel predictions
│   │   ├── channel_model.txt          #   LightGBM model file
│   │   ├── class_names.json           #   ["ATM", "Agent", "Branch", "Other", "UPI"]
│   │   └── feature_cols.json          #   ordered list of feature names
│   ├── location_model/                # ← load this for location ranking
│   │   ├── location_model.txt
│   │   └── feature_cols.json
│   └── time_model/                    # ← load these for time window prediction
│       ├── time_model_lower_p10.txt
│       ├── time_model_median_p50.txt
│       ├── time_model_upper_p90.txt
│       └── feature_cols.json
├── data/
│   ├── raw/                           # source files (large, gitignored)
│   │   ├── ATM_DATA.xlsx
│   │   ├── lat.csv
│   │   └── PAYSIM.csv
│   ├── atm_locations.csv              # geocoded ATMs (id, lat, lon, bank)
│   ├── calibration.json
│   ├── cases.jsonl                    # synthetic cases (one JSON object per line)
│   ├── snapshots.jsonl                # incremental evidence (no ground truth)
│   ├── labels.jsonl                   # ground truth (kept separate from snapshots)
│   ├── features_train.csv
│   └── location_candidates.csv
├── demo_app.py                        # reference implementation of the full prediction pipeline
├── requirements.txt
└── README.md
```

---

## 3. Core data formats

### 3a. `cases.jsonl` — one case per line

Each line is a JSON object with this shape:

```json
{
  "case_id": "uuid-string",
  "victim_lat": 18.52,
  "victim_lon": 73.85,
  "stolen_amount": 48200.0,
  "complaint_timestamp": "2026-03-15T11:23:00",
  "urban": true,
  "accounts": [
    {
      "account_id": "ACC_a1b2c3d4",
      "bank": "HDFC",
      "branch_lat": 18.61,
      "branch_lon": 73.91,
      "age_days": 12,
      "dormant_before_case": true,
      "cashout_readiness": 0.87
    }
  ],
  "transactions": [
    {
      "from_account": "VICTIM",
      "to_account": "ACC_a1b2c3d4",
      "amount": 48200.0,
      "timestamp": "2026-03-15T11:23:00",
      "split_group": null
    }
  ],
  "ground_truth": {
    "true_channel": "ATM",
    "true_location_id": "SBIN0001234",
    "true_lat": 18.59,
    "true_lon": 73.88,
    "true_time_start": "2026-03-15T15:00:00",
    "true_time_end": "2026-03-15T16:30:00",
    "is_noisy_case": false
  }
}
```

**Important**: `ground_truth` exists only in `cases.jsonl`. It is **never** sent to
any model and **never** sent to the frontend. It is only used for evaluating model
quality offline.

### 3b. `snapshots.jsonl` — one snapshot per line

A snapshot is "what an investigator knows as of this moment". Each case produces
N snapshots (one per transaction revealed). Snapshots contain **no ground truth**.

```json
{
  "case_id": "uuid-string",
  "snapshot_index": 2,
  "as_of_time": "2026-03-15T12:45:00",
  "n_hops_observed": 3,
  "visible_transactions": [],
  "visible_accounts": [],
  "terminal_account_id": "ACC_a1b2c3d4",
  "terminal_account_readiness": 0.87,
  "time_since_last_hop_hours": 0.42,
  "victim_lat": 18.52,
  "victim_lon": 73.85,
  "stolen_amount": 48200.0,
  "urban": true,
  "is_final_snapshot": false
}
```

`terminal_account_id` is the most recently revealed account that hasn't yet sent
money onward — i.e., "where is the money right now?"

### 3c. `atm_locations.csv` — the ATM database

Columns: `id, lat, lon, bank`

- `id` is the ATM/branch IFSC code (e.g., `SBIN0001234`)
- `lat`, `lon` are decimal degrees
- `bank` is the bank name string

---

## 4. The prediction pipeline (how demo_app.py works)

This is the core logic the backend must replicate. The reference implementation
lives in `demo_app.py`. The backend should expose this as an API.

### Step 1 — Load models (once at startup)

```python
import lightgbm as lgb, json

# Channel model
channel_model = lgb.Booster(model_file="model_artifacts/channel_model/channel_model.txt")
channel_class_names = json.load(open("model_artifacts/channel_model/class_names.json"))
# class_names → ["ATM", "Agent", "Branch", "Other", "UPI"]
channel_feature_cols = json.load(open("model_artifacts/channel_model/feature_cols.json"))

# Time models (3 quantile regressors)
time_model_p10 = lgb.Booster(model_file="model_artifacts/time_model/time_model_lower_p10.txt")
time_model_p50 = lgb.Booster(model_file="model_artifacts/time_model/time_model_median_p50.txt")
time_model_p90 = lgb.Booster(model_file="model_artifacts/time_model/time_model_upper_p90.txt")
time_feature_cols = json.load(open("model_artifacts/time_model/feature_cols.json"))

# Location ranker
location_model = lgb.Booster(model_file="model_artifacts/location_model/location_model.txt")
location_feature_cols = json.load(open("model_artifacts/location_model/feature_cols.json"))
```

### Step 2 — Flatten a snapshot into a feature row

Import `flatten_snapshot` from `data_pipeline/build_feature_table.py`.
This converts a snapshot dict into a flat dict of numeric features.

```python
import sys
sys.path.insert(0, ".")
from data_pipeline.build_feature_table import flatten_snapshot

row = flatten_snapshot(snapshot)  # snapshot is one dict from snapshots.jsonl
```

**Feature columns produced** (same list used by channel and time models):

| Feature | Type | Description |
|---|---|---|
| `as_of_hour` | int 0–23 | Hour of day of the current snapshot |
| `as_of_day_of_week` | int 0–6 | Day of week (Monday=0) |
| `n_hops_observed` | int | Number of mule accounts seen so far |
| `time_since_last_hop_hours` | float | Hours since the previous transaction |
| `elapsed_hours_since_first_tx` | float | Total elapsed time since first transaction |
| `hop_velocity` | float | Hops per elapsed hour |
| `terminal_readiness` | float 0–1 | Readiness score of the current terminal account |
| `n_split_events` | int | Number of transactions that were splits |
| `n_unique_banks_seen` | int | Count of distinct banks in the chain so far |
| `dormant_account_ratio` | float 0–1 | Fraction of accounts that were dormant |
| `avg_account_age_days` | float | Mean age (days) of seen accounts |
| `min_account_age_days` | int | Age of the newest account |
| `last_hop_amount` | float | Amount in the most recent transaction |
| `amount_trend` | float | Last amount minus first amount |
| `stolen_amount` | float | Original stolen amount (INR) |
| `urban` | int 0/1 | Whether the victim is in an urban area |
| `victim_lat` | float | Victim latitude |
| `victim_lon` | float | Victim longitude |
| `is_final_snapshot` | int 0/1 | Whether this is the last hop in the chain |

### Step 3 — Channel prediction

```python
import pandas as pd

x = pd.DataFrame([{c: row.get(c, 0) for c in channel_feature_cols}])
probs = channel_model.predict(x)[0]  # array of 5 floats summing to 1.0
ranked = sorted(zip(channel_class_names, probs), key=lambda t: -t[1])
# → [("ATM", 0.52), ("Agent", 0.23), ("Branch", 0.14), ("UPI", 0.07), ("Other", 0.04)]
```

### Step 4 — Time window prediction

The models were trained on `log1p(hours_to_cashout)`, so outputs must be
inverse-transformed with `expm1`.

```python
import numpy as np

x = pd.DataFrame([{c: row.get(c, 0) for c in time_feature_cols}])
p10 = max(0, np.expm1(time_model_p10.predict(x)[0]))
p50 = max(0, np.expm1(time_model_p50.predict(x)[0]))
p90 = max(0, np.expm1(time_model_p90.predict(x)[0]))
# p10, p50, p90 are in HOURS from as_of_time
```

To convert to wall-clock time, add these offsets to `snapshot["as_of_time"]`.

### Step 5 — Location prediction

Two modes are available. **Default to `baseline` mode** — the trained ranker
currently underperforms the heuristic (see Section 10).

#### Baseline mode (recommended)

```python
import math

def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dlmb/2)**2
    return 2 * r * math.asin(math.sqrt(a))

# atms = list of dicts loaded from atm_locations.csv
ranked = sorted(atms, key=lambda a: haversine_km(
    snapshot["victim_lat"], snapshot["victim_lon"], a["lat"], a["lon"]))
top3 = ranked[:3]
```

#### Model mode (optional, toggle only)

Build a shortlist of 15 nearest + 5 random ATMs, score them, rank by score.
**Do NOT score the full ATM list** — it degrades ranking quality.

```python
import random

atms_sorted = sorted(atms, key=lambda a: haversine_km(
    snapshot["victim_lat"], snapshot["victim_lon"], a["lat"], a["lon"]))
hard = atms_sorted[:15]
easy = random.sample(atms, min(5, len(atms)))
pool = list({a["id"]: a for a in hard + easy}.values())

accounts = {a["account_id"]: a for a in snapshot["visible_accounts"]}
terminal = accounts.get(snapshot["terminal_account_id"])
t_lat = terminal["branch_lat"] if terminal else snapshot["victim_lat"]
t_lon = terminal["branch_lon"] if terminal else snapshot["victim_lon"]
t_bank = terminal["bank"] if terminal else None

rows = []
for atm in pool:
    rows.append({
        "dist_victim_km":        haversine_km(snapshot["victim_lat"], snapshot["victim_lon"], atm["lat"], atm["lon"]),
        "dist_terminal_km":      haversine_km(t_lat, t_lon, atm["lat"], atm["lon"]),
        "same_bank_as_terminal": int(atm.get("bank") == t_bank),
        "n_hops_observed":       snapshot["n_hops_observed"],
        "terminal_readiness":    snapshot["terminal_account_readiness"] or 0.0,
        "stolen_amount":         snapshot["stolen_amount"],
        "urban":                 int(snapshot["urban"]),
        "is_final_snapshot":     int(snapshot["is_final_snapshot"]),
    })

X = pd.DataFrame(rows)[location_feature_cols]
scores = location_model.predict(X)
for atm, score in zip(pool, scores):
    atm["score"] = score

top3 = sorted(pool, key=lambda a: -a["score"])[:3]
```

### Step 6 — Confidence scoring

Combines signals from all three models into one confidence label.
Rule-based — not a trained model. Exact formula:

```python
import numpy as np

def compute_confidence(channel_ranked, time_p10, time_p50, time_p90,
                        location_ranked, n_hops_observed):
    # Channel: how far the top probability is above the flat 1/5 baseline
    top_channel_prob = channel_ranked[0][1]
    channel_conf = np.clip((top_channel_prob - 0.20) / 0.60, 0, 1)

    # Time: how narrow the window is relative to the median
    window_width = time_p90 - time_p10
    relative_width = window_width / max(time_p50, 0.1)
    time_conf = np.clip(1 - (relative_width / 6.0), 0, 1)

    # Location: how much #1 beats #2 by distance
    if len(location_ranked) >= 2:
        d1 = location_ranked[0]["dist_victim_km"]
        d2 = location_ranked[1]["dist_victim_km"]
        gap = abs(d2 - d1) / max(d1, 1.0)
        location_conf = np.clip(gap, 0, 1)
    else:
        location_conf = 0.5

    # Evidence gate: 1 hop seen → cap confidence at 50%
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
```

---

## 5. Recommended API design

The backend should expose an HTTP API. Models must be loaded once at startup and kept in memory — do not reload them per request. All endpoints are stateless.


### `GET /cases`
List all cases (summary info only, no ground_truth, no accounts/transactions).

Response:
```json
[
  {
    "case_id": "uuid",
    "stolen_amount": 48200.0,
    "urban": true,
    "complaint_timestamp": "2026-03-15T11:23:00",
    "n_total_snapshots": 4
  }
]
```

### `GET /cases/{case_id}`
Full case header (no ground_truth).

### `GET /cases/{case_id}/snapshots`
All snapshots for a case (array, ordered by snapshot_index).

### `GET /cases/{case_id}/snapshots/{index}`
Single snapshot by index.

### `POST /predict`
**Core endpoint.** Accepts a snapshot, returns all three predictions + confidence.

Request body: snapshot dict (shape from Section 3b)

Query params: `?location_mode=baseline|model` (default: baseline)

Response:
```json
{
  "case_id": "uuid",
  "snapshot_index": 2,
  "as_of_time": "2026-03-15T12:45:00",
  "n_hops_observed": 3,

  "channel": {
    "predictions": [
      { "channel": "ATM",    "probability": 0.52 },
      { "channel": "Agent",  "probability": 0.23 },
      { "channel": "Branch", "probability": 0.14 },
      { "channel": "UPI",    "probability": 0.07 },
      { "channel": "Other",  "probability": 0.04 }
    ],
    "top_channel": "ATM",
    "top_probability": 0.52
  },

  "time_window": {
    "lower_hours": 1.2,
    "median_hours": 3.4,
    "upper_hours": 8.1,
    "cashout_window_start": "2026-03-15T13:57:00",
    "cashout_window_end":   "2026-03-15T20:51:00"
  },

  "location": {
    "mode": "baseline",
    "top_locations": [
      { "atm_id": "SBIN0001234", "lat": 18.59, "lon": 73.88, "bank": "SBI", "dist_victim_km": 2.1 },
      { "atm_id": "HDFC0005678", "lat": 18.56, "lon": 73.90, "bank": "HDFC", "dist_victim_km": 3.7 },
      { "atm_id": "ICIC0009012", "lat": 18.62, "lon": 73.84, "bank": "ICICI", "dist_victim_km": 4.2 }
    ]
  },

  "confidence": {
    "level": "MEDIUM",
    "overall_score": 0.41,
    "channel_conf": 0.53,
    "time_conf": 0.45,
    "location_conf": 0.25,
    "evidence_penalty_applied": false
  }
}
```

### `GET /atms`
All ATM locations for map rendering.

Response: `[ { "id": "SBIN0001234", "lat": 18.59, "lon": 73.88, "bank": "SBI" } ]`

---

## 6. Frontend requirements

### Pages

#### Case List
Table/cards of all cases. Columns: case ID (short), stolen amount (₹ formatted),
urban/rural badge, complaint time, number of snapshots (= evidence steps).
Click → Case Detail.

#### Case Detail / Live Demo (main screen)

Two sub-modes:
- **Replay mode**: user clicks "Next Evidence" to step through snapshots from `snapshots.jsonl`
- **Live mode** (future): real-time streaming

Layout sketch:
```
┌─────────────────────────────────────────────────────────┐
│  CASE abc123   |  ₹48,200   |  Urban  |  MEDIUM 🟡      │
├────────────────┬────────────────────────────────────────┤
│                │  CHANNEL                               │
│   MAP          │  ████████ ATM    52%                   │
│                │  █████    Agent  23%                   │
│  [victim pin]  │  ███      Branch 14%                   │
│  [top 3 ATMs]  ├────────────────────────────────────────┤
│  [mule chain]  │  TIME WINDOW                           │
│                │  1.2h ─────────●────── 8.1h            │
│                │  Cash-out expected 13:57 – 20:51       │
├────────────────┼────────────────────────────────────────┤
│  MULE CHAIN    │  CONFIDENCE  MEDIUM  (0.41)            │
│  VICTIM        │  Channel ████████░░  0.53              │
│    → ACC_a1b2  │  Time    █████░░░░░  0.45              │
│    → ACC_c3d4  │  Location ███░░░░░░  0.25              │
│    → ACC_e5f6  │                                        │
└────────────────┴────────────────────────────────────────┘
       [◀ Prev]   [▶ Next Evidence]   Hop 2 / 4
```

### Map
- Render an interactive map centred on India
- All coordinates are decimal degrees (WGS84)
- Markers needed:
  - Victim location
  - Top-3 predicted ATMs, numbered 1/2/3 by rank
  - Mule account branch locations (`visible_accounts[].branch_lat/lon`)
- Draw lines connecting VICTIM → ACC_1 → ACC_2 → ... (the mule chain)
- Clicking an ATM marker should show: ATM ID, bank, distance from victim

### Confidence badge
- HIGH → green
- MEDIUM → amber
- LOW → red + tooltip: "Insufficient evidence — treat as a broad regional estimate"

### Channel chart
- Horizontal bar chart (all 5 channels)
- Sort by probability descending
- Top channel highlighted

### Time window
- Timeline/range bar showing p10 – p90 with p50 marked
- Display as wall-clock time (add offsets to `as_of_time`)
- Also show as "in X hours / Y minutes"

### Evidence / mule chain panel
- One row per account in `visible_accounts`
- Show: account ID (short), bank name, `cashout_readiness` as a progress bar,
  `dormant_before_case` badge, `age_days`
- Highlight the `terminal_account_id` — "money is here now"

---

## 7. Backend startup commands

```bash
# Install core ML dependencies
pip install -r requirements.txt

# Verify all three model families load correctly
python -c "
import lightgbm as lgb, json
m = lgb.Booster(model_file='model_artifacts/channel_model/channel_model.txt')
print('Channel model OK, num trees:', m.num_trees())
m = lgb.Booster(model_file='model_artifacts/time_model/time_model_median_p50.txt')
print('Time model OK, num trees:', m.num_trees())
m = lgb.Booster(model_file='model_artifacts/location_model/location_model.txt')
print('Location model OK, num trees:', m.num_trees())
"
```

---

## 8. Running the existing CLI demo (validation reference)

Run this before building the backend to confirm model loading and prediction
logic works end-to-end.

```bash
# Baseline location (recommended default)
python demo_app.py \
    --cases data/cases.jsonl \
    --channel_model_dir model_artifacts/channel_model \
    --time_model_dir model_artifacts/time_model \
    --atm_csv data/atm_locations.csv \
    --interactive

# Trained location ranker
python demo_app.py \
    --cases data/cases.jsonl \
    --channel_model_dir model_artifacts/channel_model \
    --time_model_dir model_artifacts/time_model \
    --atm_csv data/atm_locations.csv \
    --location_mode model \
    --location_model_dir model_artifacts/location_model \
    --interactive

# Specific case
python demo_app.py \
    --cases data/cases.jsonl \
    --case_id <uuid-from-cases.jsonl> \
    --channel_model_dir model_artifacts/channel_model \
    --time_model_dir model_artifacts/time_model \
    --atm_csv data/atm_locations.csv
```

---

## 9. Regenerating data and models (if needed)

Only needed if model artifacts or data files are missing. Run in exact order:

```bash
python data_pipeline/prepare_atm_dataset.py \
    --atm_export data/raw/ATM_DATA.xlsx \
    --district_geo data/raw/lat.csv \
    --out data/atm_locations.csv

python data_pipeline/calibrate_from_paysim.py \
    --paysim_csv data/raw/PAYSIM.csv \
    --out data/calibration.json

python data_pipeline/mule_chain_generator.py \
    --n_cases 2000 \
    --atm_csv data/atm_locations.csv \
    --calibration data/calibration.json \
    --out data/cases.jsonl

python data_pipeline/build_incremental_snapshots.py \
    --cases data/cases.jsonl \
    --snapshots_out data/snapshots.jsonl \
    --labels_out data/labels.jsonl

python data_pipeline/build_feature_table.py \
    --snapshots data/snapshots.jsonl \
    --labels data/labels.jsonl \
    --out data/features_train.csv

python models/train_channel_model.py \
    --features data/features_train.csv \
    --out_dir model_artifacts/channel_model

python models/train_time_model.py \
    --features data/features_train.csv \
    --out_dir model_artifacts/time_model

python data_pipeline/build_location_candidates.py \
    --snapshots data/snapshots.jsonl \
    --labels data/labels.jsonl \
    --atm_csv data/atm_locations.csv \
    --out data/location_candidates.csv

python models/train_location_model.py \
    --candidates data/location_candidates.csv \
    --out_dir model_artifacts/location_model
```

If you regenerate `cases.jsonl`, re-run every step from `build_incremental_snapshots.py`
onward.

---

## 10. Model performance numbers (current artifacts)

| Model | Metric | Value | Baseline |
|---|---|---|---|
| Channel | Accuracy | 44% | 34% (majority class) |
| Channel | Top feature | `stolen_amount` | — |
| Time | Median MAE | 1.96 hours | 2.53 hours (global median) |
| Time | p10–p90 coverage | 76.3% | target ~80% |
| Time | Avg window width | 5.32 hours | — |
| Time | Top feature | `hop_velocity` | — |
| Location | Top-1 accuracy | 47.6% | 48.9% (nearest-to-victim) |
| Location | MRR | 0.518 | 0.525 (nearest-to-victim) |

The **location model underperforms the heuristic**. Default to `baseline` mode.
Expose `model` mode as a debug toggle only.

---

## 11. Key caveats

1. **Never send `ground_truth` to the frontend.** Strip it before serialising any case.

2. **Time model outputs are in log-space.** Always apply `np.expm1()` to raw model
   output. Forgetting this gives wildly wrong (tiny) hour values.

3. **Location model shortlist must be 15 nearest + 5 random**, not the full ATM list.
   Scoring all ATMs produces the "frozen top-3" bug.

4. **`terminal_account_readiness` and `time_since_last_hop_hours` can be `None`**
   in the first snapshot. Default both to `0.0` in feature rows.

5. **`split_group` in transactions is nullable.** Handle `null` gracefully.

6. **`urban` is a Python bool in snapshots but `0/1` int in feature rows.**
   `flatten_snapshot()` handles this automatically — always use it.

7. **All amounts are in INR.** Format with `₹` symbol and comma separators.

8. **All timestamps are ISO 8601 strings, no timezone** (treat as IST / local).

9. **`flatten_snapshot` must be imported from `data_pipeline/build_feature_table.py`**,
   not reimplemented — the feature engineering logic must stay in sync with how
   training was done.

10. **`stream_case` from `data_pipeline/build_incremental_snapshots.py`** can be
    used server-side to re-derive snapshots from a raw case dict on the fly,
    rather than reading from the pre-materialised `snapshots.jsonl`.
