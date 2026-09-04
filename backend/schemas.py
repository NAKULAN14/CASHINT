from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field


class CaseSummary(BaseModel):
    case_id: str
    stolen_amount: float
    urban: bool
    complaint_timestamp: str
    n_total_snapshots: int


class AccountSchema(BaseModel):
    account_id: str
    bank: str
    branch_lat: float
    branch_lon: float
    age_days: int
    dormant_before_case: bool
    cashout_readiness: Optional[float] = 0.0


class TransactionSchema(BaseModel):
    from_account: str
    to_account: str
    amount: float
    timestamp: str
    split_group: Optional[str] = None


class CaseDetail(BaseModel):
    case_id: str
    victim_lat: float
    victim_lon: float
    stolen_amount: float
    complaint_timestamp: str
    urban: bool
    accounts: List[AccountSchema]
    transactions: List[TransactionSchema]
    n_total_snapshots: int


class SnapshotSchema(BaseModel):
    case_id: str
    snapshot_index: int
    as_of_time: str
    n_hops_observed: int
    visible_transactions: List[TransactionSchema] = []
    visible_accounts: List[AccountSchema] = []
    terminal_account_id: Optional[str] = None
    terminal_account_readiness: Optional[float] = None
    time_since_last_hop_hours: Optional[float] = None
    victim_lat: float
    victim_lon: float
    stolen_amount: float
    urban: bool
    is_final_snapshot: bool


class ChannelPredictionItem(BaseModel):
    channel: str
    probability: float


class ChannelPredictionResult(BaseModel):
    predictions: List[ChannelPredictionItem]
    top_channel: str
    top_probability: float


class TimeWindowResult(BaseModel):
    lower_hours: float
    median_hours: float
    upper_hours: float
    cashout_window_start: str
    cashout_window_end: str


class LocationCandidate(BaseModel):
    id: str
    atm_id: Optional[str] = None
    lat: float
    lon: float
    bank: Optional[str] = None
    dist_victim_km: float
    dist_terminal_km: Optional[float] = None
    same_bank_as_terminal: Optional[int] = 0
    score: Optional[float] = None


class LocationResult(BaseModel):
    mode: str
    top_locations: List[LocationCandidate]


class ConfidenceResult(BaseModel):
    level: str  # "LOW", "MEDIUM", "HIGH"
    overall_score: float
    channel_conf: float
    time_conf: float
    location_conf: float
    evidence_penalty_applied: bool


class SupportingSignal(BaseModel):
    signal: str
    value: str
    interpretation: str
    importance: Optional[str] = "Normal"


class PredictRequest(BaseModel):
    snapshot: SnapshotSchema
    location_mode: Optional[str] = "baseline"


class PredictResponse(BaseModel):
    case_id: str
    snapshot_index: int
    as_of_time: str
    n_hops_observed: int
    channel: ChannelPredictionResult
    time_window: TimeWindowResult
    location: LocationResult
    confidence: ConfidenceResult
    supporting_signals: Optional[List[SupportingSignal]] = None


class ATMItem(BaseModel):
    id: str
    lat: float
    lon: float
    bank: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    models_loaded: bool
