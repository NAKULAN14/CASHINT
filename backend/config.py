from pathlib import Path
from typing import List

# Base workspace directory
BASE_DIR = Path(__file__).resolve().parent.parent

# Data directory and files
DATA_DIR = BASE_DIR / "data"
CASES_FILE = DATA_DIR / "cases.jsonl"
SNAPSHOTS_FILE = DATA_DIR / "snapshots.jsonl"
ATM_FILE = DATA_DIR / "atm_locations.csv"

# Model artifact directories
MODEL_ARTIFACTS_DIR = BASE_DIR / "model_artifacts"
CHANNEL_MODEL_DIR = MODEL_ARTIFACTS_DIR / "channel_model"
TIME_MODEL_DIR = MODEL_ARTIFACTS_DIR / "time_model"
LOCATION_MODEL_DIR = MODEL_ARTIFACTS_DIR / "location_model"

# CORS configuration
CORS_ORIGINS: List[str] = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "*"
]
