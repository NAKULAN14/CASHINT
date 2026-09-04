import json
from pathlib import Path
from typing import Dict, Any, Optional
import lightgbm as lgb
import pandas as pd

from backend.config import CHANNEL_MODEL_DIR, TIME_MODEL_DIR, LOCATION_MODEL_DIR


class ModelsLoader:
    _instance: Optional["ModelsLoader"] = None

    def __init__(self):
        self.channel_model = None
        self.channel_classes = []
        self.channel_features = []
        self.channel_importance = []
        self.channel_report = ""

        self.time_models = {}
        self.time_features = []
        self.time_importance = []
        self.time_report = ""

        self.location_model = None
        self.location_features = []
        self.location_importance = []
        self.location_report = ""

        self.is_loaded = False

    @classmethod
    def get_instance(cls) -> "ModelsLoader":
        if cls._instance is None:
            cls._instance = ModelsLoader()
        return cls._instance

    def load_all(self):
        if self.is_loaded:
            return

        # 1. Channel Model
        channel_model_path = CHANNEL_MODEL_DIR / "channel_model.txt"
        self.channel_model = lgb.Booster(model_file=str(channel_model_path))
        with open(CHANNEL_MODEL_DIR / "class_names.json", "r") as f:
            self.channel_classes = json.load(f)
        with open(CHANNEL_MODEL_DIR / "feature_cols.json", "r") as f:
            self.channel_features = json.load(f)
        
        channel_imp_path = CHANNEL_MODEL_DIR / "feature_importance.csv"
        if channel_imp_path.exists():
            self.channel_importance = pd.read_csv(channel_imp_path).to_dict("records")
        channel_rep_path = CHANNEL_MODEL_DIR / "report.txt"
        if channel_rep_path.exists():
            self.channel_report = channel_rep_path.read_text(encoding="utf-8")

        # 2. Time Models
        for name in ["lower_p10", "median_p50", "upper_p90"]:
            p = TIME_MODEL_DIR / f"time_model_{name}.txt"
            self.time_models[name] = lgb.Booster(model_file=str(p))
        with open(TIME_MODEL_DIR / "feature_cols.json", "r") as f:
            self.time_features = json.load(f)

        time_imp_path = TIME_MODEL_DIR / "feature_importance.csv"
        if time_imp_path.exists():
            self.time_importance = pd.read_csv(time_imp_path).to_dict("records")
        time_rep_path = TIME_MODEL_DIR / "report.txt"
        if time_rep_path.exists():
            self.time_report = time_rep_path.read_text(encoding="utf-8")

        # 3. Location Model
        loc_model_path = LOCATION_MODEL_DIR / "location_model.txt"
        if loc_model_path.exists():
            self.location_model = lgb.Booster(model_file=str(loc_model_path))
        with open(LOCATION_MODEL_DIR / "feature_cols.json", "r") as f:
            self.location_features = json.load(f)

        loc_imp_path = LOCATION_MODEL_DIR / "feature_importance.csv"
        if loc_imp_path.exists():
            self.location_importance = pd.read_csv(loc_imp_path).to_dict("records")
        loc_rep_path = LOCATION_MODEL_DIR / "report.txt"
        if loc_rep_path.exists():
            self.location_report = loc_rep_path.read_text(encoding="utf-8")

        self.is_loaded = True
        print("All ML models successfully loaded into memory once.")


def get_models() -> ModelsLoader:
    loader = ModelsLoader.get_instance()
    if not loader.is_loaded:
        loader.load_all()
    return loader
