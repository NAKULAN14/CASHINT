# Predictive Cash-Out Intelligence

> **Incremental Intelligence for Proactive Cybercrime Intervention**  
> *A decision-support intelligence platform developed for Smart India Hackathon (SIH).*

---

## 1. Executive Summary

When a cyber financial fraud occurs, criminals route illicit funds through multi-layered mule account chains to obfuscate the money trail before physically withdrawing (**"cashing out"**) the money via ATMs, banking branches, local cash agents, or peer-to-peer UPI channels. Law enforcement investigators operate against a narrow time window to identify the withdrawal vector and freeze or interdict the funds.

**Predictive Cash-Out Intelligence** transforms static post-facto fraud tracking into an active decision-support system. Rather than generating a one-time risk score, the system implements **incremental prediction**:
> *"As new transaction hops and mule accounts are uncovered, Where, When, How, and Confidence continuously evolve."*

---

## 2. System Architecture

```
                                  [ Investigator Interface ]
                                   React 18 + TypeScript + Vite
                                   Tailwind CSS + Leaflet Maps
                                                ▲
                                                │ REST API / JSON
                                                ▼
                                   [ Backend Nervous System ]
                                  FastAPI (Python) + Pydantic
                                  In-Memory Model & Data Singletons
                                                ▲
                                                │ Feature Flattening & Inference
                                                ▼
                     ┌──────────────────────────┼──────────────────────────┐
                     ▼                          ▼                          ▼
            [ Channel Model ]             [ Time Model ]            [ Location Baseline ]
           LightGBM Multiclass         3x Quantile Regressors     Nearest-to-Victim Heuristic
         (ATM / Agent / Branch /       (P10 / P50 / P90 Hours)     (Top Candidates with Mode
               UPI / Other)             np.expm1() log-inverse        Toggle for Ranker)
```

---

## 3. Technology Stack

- **Backend**: Python 3.10+, FastAPI, Uvicorn, Pydantic v2, Pandas, NumPy, LightGBM, Scikit-Learn.
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, Recharts, Leaflet & React-Leaflet.
- **Data & Models**: Pre-trained LightGBM boosters, 2,000 synthetic PaySim-calibrated fraud cases, and 54,914 geocoded national ATM locations.

---

## 4. Quick Start & Local Execution

### Option A: Unified One-Command Launcher (Recommended)

From the project root:

```bash
# 1. Install dependencies
pip install -r backend/requirements.txt
cd frontend && npm install && cd ..

# 2. Start both Backend (Port 8000) and Frontend (Port 5173)
python run_app.py
```

On Windows PowerShell:
```powershell
.\start.ps1
```

Access the application in your browser:
- **Investigator Dashboard**: [http://localhost:5173](http://localhost:5173)
- **FastAPI OpenAPI Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **API Health Endpoint**: [http://localhost:8000/health](http://localhost:8000/health)

---

### Option B: Running Services Separately

#### 1. Backend Server
```bash
pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. Frontend Application
```bash
cd frontend
npm install
npm run dev
```

---

## 5. Verifying the CLI Reference Implementation

The original CLI tool `demo_app.py` remains 100% functional and serves as the reference ground truth for prediction outputs:

```bash
# Baseline nearest-to-victim mode (Recommended production default)
python demo_app.py \
    --cases data/cases.jsonl \
    --channel_model_dir model_artifacts/channel_model \
    --time_model_dir model_artifacts/time_model \
    --atm_csv data/atm_locations.csv

# Interactive stepping mode
python demo_app.py \
    --cases data/cases.jsonl \
    --channel_model_dir model_artifacts/channel_model \
    --time_model_dir model_artifacts/time_model \
    --atm_csv data/atm_locations.csv \
    --interactive

# Model ranking mode (experimental debug)
python demo_app.py \
    --cases data/cases.jsonl \
    --channel_model_dir model_artifacts/channel_model \
    --time_model_dir model_artifacts/time_model \
    --atm_csv data/atm_locations.csv \
    --location_mode model \
    --location_model_dir model_artifacts/location_model
```

To run automated backend tests:
```bash
python -m pytest tests/test_api.py -v
```

---

## 6. API Endpoints Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | System health check (`status`, `models_loaded`) |
| `GET` | `/api/cases` | List case summaries (`case_id`, `stolen_amount`, `urban`, `complaint_timestamp`, `n_total_snapshots`). Strict: no `ground_truth`. |
| `GET` | `/api/cases/{case_id}` | Full case metadata, accounts, transactions (no `ground_truth`). |
| `GET` | `/api/cases/{case_id}/snapshots` | All chronological snapshots for a case. |
| `GET` | `/api/cases/{case_id}/snapshots/{index}` | Specific snapshot by sequence index. |
| `GET` | `/api/cases/{case_id}/analysis` | Pre-calculated sequence predictions across all snapshots for trend analytics. |
| `POST` | `/api/predict` | Runs pipeline on a snapshot dict. Returns Where, When, How, Confidence, and Supporting Signals. |
| `GET` | `/api/atms` | National ATM database list with optional `limit` and `bank` filters. |
| `GET` | `/api/models/status` | Model metrics, feature importances, validation reports, and baseline disclosures. |

---

## 7. Machine Learning Models & Production Safeguards

### Core Models

1. **Channel Model (`model_artifacts/channel_model/`)**:
   - LightGBM Multiclass Classifier (5 classes: ATM, Agent, Branch, UPI, Other).
   - Accuracy: **44.0%** (vs majority-class baseline of 34.0%).
   - Key Feature: `stolen_amount`.

2. **Time Window Model (`model_artifacts/time_model/`)**:
   - 3x LightGBM Quantile Regressors (P10, P50, P90).
   - Median MAE: **1.96 hours** (vs naive global median baseline of 2.53 hours).
   - P10–P90 Coverage: **76.3%** (Target ~80%).
   - Key Feature: `hop_velocity`.
   - **Critical Transformation**: Output is trained on `log1p(hours_to_cashout)`. Inference strictly inverts this using `np.expm1()`.

3. **Location Model (`model_artifacts/location_model/`)**:
   - LightGBM LambdaMART Ranker.
   - Top-1 Accuracy: **47.6%** | MRR: **0.518**.
   - Nearest-to-Victim Baseline: **48.9%** | MRR: **0.525**.
   - **Production Decision**: Because the heuristic baseline outperforms the trained ranker, the system defaults to the **Nearest-to-Victim Baseline** in production. The ranker is exposed as an "Experimental Model" toggle for judging transparency.

### Confidence Formula
Combines predictions from all three models into an actionable gate:
- **Channel Confidence**: `clip((top_prob - 0.20) / 0.60, 0, 1)`
- **Time Confidence**: `clip(1 - (window_width / max(p50, 0.1)) / 6.0, 0, 1)`
- **Location Confidence**: Distance separation `clip(|d2 - d1| / max(d1, 1.0), 0, 1)`
- **Early-Evidence Penalty**: 50% discount if `n_hops_observed <= 1`.
- **Actionability Classification**: `HIGH >= 0.60`, `MEDIUM >= 0.35`, `LOW < 0.35`.

### Data Protection Rules
- `ground_truth` and `labels.jsonl` are strictly partitioned. No API response or frontend component ever accesses or leaks ground truth.

---

## 8. SIH Demonstration Walkthrough (3-5 Minutes)

1. **Overview Dashboard**:
   - Show the aggregated 2,000 incident cases, ~3.4 average snapshots per case, and 54,914 geocoded ATMs.
   - Highlight the channel distribution and victim demographic split.
2. **Launch Live Investigation**:
   - Open a case (e.g. `CASE #B59CF7BE`, ₹56,786).
   - Point out **Evidence Step 1 / 3**:
     - The map shows only the victim origin and first mule account.
     - Confidence is **LOW (28%)** due to early volume penalty: notice the amber/rose warning: *"Insufficient evidence — treat as broad regional forecast"*.
3. **Step Through Evidence ("Next Evidence" or "Auto Replay")**:
   - Advance to Step 2:
     - New mule node added to chain; terminal account moves.
     - Cash-out time window contracts from 11.1 hours down to 2.6 hours.
     - Primary channel probability sharpens.
   - Advance to Step 3 (Final Layer):
     - Terminal readiness peaks at 96% ("CURRENT MONEY LOCATION" badge glows).
     - Expected window tightens to 29 min – 2.9 hr (Median 58 min).
     - Confidence upgrades as evidence volume matures.
4. **Interactive Map**:
   - Inspect the numbered candidate ATMs (#1, #2, #3) with distance to victim and terminal branch.
   - Trace the purple dashed mule routing chain from Victim &rarr; Mule 1 &rarr; Mule 2 &rarr; Mule 3.
5. **Model Transparency**:
   - Navigate to **Model Status**:
   - Highlight the honesty regarding the location model: explain why the system uses the nearest-to-victim baseline in production while keeping the ML ranker experimental.

---

## 9. Directory Structure

```
SIH-2026/
├── backend/
│   ├── config.py                 # Paths, CORS, and settings
│   ├── schemas.py                # Pydantic request/response schemas
│   ├── models_loader.py          # Singleton LightGBM model loader
│   ├── data_service.py           # In-memory cases and ATM data store
│   ├── prediction_service.py     # Inference pipeline, confidence, & signals
│   ├── routes/
│   │   ├── cases.py              # Case & snapshot endpoints
│   │   ├── predictions.py        # Core /api/predict endpoint
│   │   ├── atms.py               # ATM database endpoints
│   │   └── models.py             # Model metrics & diagnostics
│   ├── main.py                   # FastAPI app entry point
│   └── requirements.txt          # Backend dependencies
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.tsx
│   │   │   ├── InvestigationHeader.tsx
│   │   │   ├── InvestigationMap.tsx
│   │   │   ├── ChannelPanel.tsx
│   │   │   ├── TimeWindowPanel.tsx
│   │   │   ├── ConfidencePanel.tsx
│   │   │   ├── ReplayControls.tsx
│   │   │   ├── MuleChain.tsx
│   │   │   ├── SupportingSignals.tsx
│   │   │   └── CandidateAtmTable.tsx
│   │   ├── pages/
│   │   │   ├── Overview.tsx
│   │   │   ├── CaseList.tsx
│   │   │   ├── Investigation.tsx
│   │   │   ├── ATMIntelligence.tsx
│   │   │   ├── PredictionAnalytics.tsx
│   │   │   └── ModelStatus.tsx
│   │   ├── services/api.ts
│   │   ├── types/index.ts
│   │   ├── utils/formatters.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── vite.config.ts
│   └── package.json
│
├── data/                         # Committed datasets (cases, ATMs, snapshots)
├── data_pipeline/                # Feature extraction & generators
├── model_artifacts/              # Trained LightGBM model files & reports
├── demo_app.py                   # Reference CLI prediction application
├── run_app.py                    # Unified application launcher
├── start.ps1                     # PowerShell launcher script
└── tests/
    └── test_api.py               # Automated pytest suite
```
