import json
from typing import Dict, List, Optional, Any
import pandas as pd

from backend.config import CASES_FILE, ATM_FILE
from data_pipeline.build_incremental_snapshots import stream_case


class DataService:
    _instance: Optional["DataService"] = None

    def __init__(self):
        self.cases_by_id: Dict[str, dict] = {}
        self.cases_order: List[str] = []
        self.snapshots_by_case: Dict[str, List[dict]] = {}
        self.atms: List[dict] = []
        self.atms_by_id: Dict[str, dict] = {}
        self.is_loaded = False

    @classmethod
    def get_instance(cls) -> "DataService":
        if cls._instance is None:
            cls._instance = DataService()
        return cls._instance

    def load_all(self):
        if self.is_loaded:
            return

        # 1. Load ATMs
        if ATM_FILE.exists():
            df_atms = pd.read_csv(ATM_FILE)
            self.atms = df_atms.to_dict("records")
            self.atms_by_id = {atm["id"]: atm for atm in self.atms}
            print(f"Loaded {len(self.atms)} ATMs into memory.")

        # 2. Load Cases (sanitize ground truth!)
        if CASES_FILE.exists():
            with open(CASES_FILE, "r", encoding="utf-8") as f:
                for line in f:
                    raw_case = json.loads(line)
                    case_id = raw_case["case_id"]
                    
                    # Pre-calculate snapshots for this case using the official stream_case generator
                    snapshots = list(stream_case(raw_case))
                    self.snapshots_by_case[case_id] = snapshots

                    # Strip ground_truth completely for storage in customer/investigator view
                    sanitized_case = {
                        "case_id": raw_case["case_id"],
                        "victim_lat": raw_case["victim_lat"],
                        "victim_lon": raw_case["victim_lon"],
                        "stolen_amount": raw_case["stolen_amount"],
                        "complaint_timestamp": raw_case["complaint_timestamp"],
                        "urban": raw_case["urban"],
                        "accounts": raw_case.get("accounts", []),
                        "transactions": raw_case.get("transactions", []),
                        "n_total_snapshots": len(snapshots),
                    }
                    self.cases_by_id[case_id] = sanitized_case
                    self.cases_order.append(case_id)

            # Re-order self.cases_order to place specified top 6 cases at the very beginning
            target_prefixes = [
                "82444dcb",
                "c8602764",
                "802ef8e3",
                "05cbecf7",
                "4b7d8f60",
                "c4045d48"
            ]
            top_cases = []
            for prefix in target_prefixes:
                for cid in self.cases_order:
                    if cid.lower().startswith(prefix.lower()):
                        top_cases.append(cid)
                        break
            remaining_cases = [cid for cid in self.cases_order if cid not in top_cases]
            self.cases_order = top_cases + remaining_cases

            print(f"Loaded {len(self.cases_by_id)} cases and generated snapshots into memory (Top 6 priority cases placed first).")

        self.is_loaded = True

    def get_case_summaries(
        self,
        skip: int = 0,
        limit: Optional[int] = None,
        search: Optional[str] = None,
        urban: Optional[bool] = None
    ) -> List[dict]:
        results = []
        for cid in self.cases_order:
            case = self.cases_by_id[cid]
            if urban is not None and case["urban"] != urban:
                continue
            if search and search.lower() not in cid.lower():
                continue
            results.append({
                "case_id": case["case_id"],
                "stolen_amount": case["stolen_amount"],
                "urban": case["urban"],
                "complaint_timestamp": case["complaint_timestamp"],
                "n_total_snapshots": case["n_total_snapshots"],
            })

        if limit is not None:
            return results[skip : skip + limit]
        return results[skip:]

    def get_case(self, case_id: str) -> Optional[dict]:
        return self.cases_by_id.get(case_id)

    def get_case_snapshots(self, case_id: str) -> Optional[List[dict]]:
        return self.snapshots_by_case.get(case_id)

    def get_snapshot(self, case_id: str, index: int) -> Optional[dict]:
        snaps = self.snapshots_by_case.get(case_id)
        if snaps is None:
            return None
        if 0 <= index < len(snaps):
            return snaps[index]
        return None

    def get_atms(self, limit: Optional[int] = None, bank: Optional[str] = None) -> List[dict]:
        if bank:
            filtered = [a for a in self.atms if a.get("bank") == bank]
            return filtered[:limit] if limit else filtered
        return self.atms[:limit] if limit else self.atms


def get_data_service() -> DataService:
    service = DataService.get_instance()
    if not service.is_loaded:
        service.load_all()
    return service
