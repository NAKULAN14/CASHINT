export interface CaseSummary {
  case_id: string;
  stolen_amount: number;
  urban: boolean;
  complaint_timestamp: string;
  n_total_snapshots: number;
}

export interface Account {
  account_id: string;
  bank: string;
  branch_lat: number;
  branch_lon: number;
  age_days: number;
  dormant_before_case: boolean;
  cashout_readiness?: number | null;
}

export interface Transaction {
  from_account: string;
  to_account: string;
  amount: number;
  timestamp: string;
  split_group?: string | null;
}

export interface CaseDetail {
  case_id: string;
  victim_lat: number;
  victim_lon: number;
  stolen_amount: number;
  complaint_timestamp: string;
  urban: boolean;
  accounts: Account[];
  transactions: Transaction[];
  n_total_snapshots: number;
}

export interface Snapshot {
  case_id: string;
  snapshot_index: number;
  as_of_time: string;
  n_hops_observed: number;
  visible_transactions: Transaction[];
  visible_accounts: Account[];
  terminal_account_id?: string | null;
  terminal_account_readiness?: number | null;
  time_since_last_hop_hours?: number | null;
  victim_lat: number;
  victim_lon: number;
  stolen_amount: number;
  urban: boolean;
  is_final_snapshot: boolean;
}

export interface ChannelPredictionItem {
  channel: string;
  probability: number;
}

export interface ChannelPredictionResult {
  predictions: ChannelPredictionItem[];
  top_channel: string;
  top_probability: number;
}

export interface TimeWindowResult {
  lower_hours: number;
  median_hours: number;
  upper_hours: number;
  cashout_window_start: string;
  cashout_window_end: string;
}

export interface LocationCandidate {
  id: string;
  atm_id?: string;
  lat: number;
  lon: number;
  bank?: string | null;
  dist_victim_km: number;
  dist_terminal_km?: number | null;
  same_bank_as_terminal?: number;
  score?: number | null;
}

export interface LocationResult {
  mode: 'baseline' | 'model';
  top_locations: LocationCandidate[];
}

export interface ConfidenceResult {
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  overall_score: number;
  channel_conf: number;
  time_conf: number;
  location_conf: number;
  evidence_penalty_applied: boolean;
}

export interface SupportingSignal {
  signal: string;
  value: string;
  interpretation: string;
  importance?: 'High' | 'Medium' | 'Normal';
}

export interface PredictionResult {
  case_id: string;
  snapshot_index: number;
  as_of_time: string;
  n_hops_observed: number;
  channel: ChannelPredictionResult;
  time_window: TimeWindowResult;
  location: LocationResult;
  confidence: ConfidenceResult;
  supporting_signals?: SupportingSignal[];
}

export interface ATM {
  id: string;
  lat: number;
  lon: number;
  bank?: string | null;
}

export interface ModelDetail {
  name: string;
  task: string;
  accuracy?: number;
  baseline_accuracy?: number;
  median_mae_hours?: number;
  baseline_mae_hours?: number;
  p10_p90_coverage?: number;
  avg_window_width_hours?: number;
  top1_accuracy?: number;
  baseline_top1_accuracy?: number;
  mrr?: number;
  baseline_mrr?: number;
  top_feature: string;
  classes?: string[];
  feature_importance?: Array<{ feature: string; importance?: number; gain?: number; split?: number }>;
  report?: string;
  notes?: string;
  disclaimer?: string;
  production_mode?: string;
}

export interface ModelStatusResponse {
  channel_model: ModelDetail;
  time_model: ModelDetail;
  location_model: ModelDetail;
}
