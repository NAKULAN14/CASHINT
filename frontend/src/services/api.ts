import {
  CaseSummary,
  CaseDetail,
  Snapshot,
  PredictionResult,
  ATM,
  ModelStatusResponse,
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE || '';

export async function fetchHealth(): Promise<{ status: string; models_loaded: boolean }> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
  return res.json();
}

export async function fetchCases(params?: {
  skip?: number;
  limit?: number;
  search?: string;
  urban?: boolean;
}): Promise<CaseSummary[]> {
  const searchParams = new URLSearchParams();
  if (params?.skip !== undefined) searchParams.set('skip', params.skip.toString());
  if (params?.limit !== undefined) searchParams.set('limit', params.limit.toString());
  if (params?.search) searchParams.set('search', params.search);
  if (params?.urban !== undefined) searchParams.set('urban', params.urban.toString());

  const url = `${API_BASE}/api/cases${searchParams.toString() ? '?' + searchParams.toString() : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch cases: ${res.statusText}`);
  return res.json();
}

export async function fetchCase(caseId: string): Promise<CaseDetail> {
  const res = await fetch(`${API_BASE}/api/cases/${encodeURIComponent(caseId)}`);
  if (!res.ok) throw new Error(`Failed to fetch case ${caseId}: ${res.statusText}`);
  return res.json();
}

export async function fetchCaseSnapshots(caseId: string): Promise<Snapshot[]> {
  const res = await fetch(`${API_BASE}/api/cases/${encodeURIComponent(caseId)}/snapshots`);
  if (!res.ok) throw new Error(`Failed to fetch snapshots for case ${caseId}: ${res.statusText}`);
  return res.json();
}

export async function fetchCaseSnapshot(caseId: string, index: number): Promise<Snapshot> {
  const res = await fetch(`${API_BASE}/api/cases/${encodeURIComponent(caseId)}/snapshots/${index}`);
  if (!res.ok) throw new Error(`Failed to fetch snapshot ${index}: ${res.statusText}`);
  return res.json();
}

export async function fetchCaseAnalysis(
  caseId: string,
  locationMode: 'baseline' | 'model' = 'baseline'
): Promise<PredictionResult[]> {
  const res = await fetch(
    `${API_BASE}/api/cases/${encodeURIComponent(caseId)}/analysis?location_mode=${locationMode}`
  );
  if (!res.ok) throw new Error(`Failed to fetch case analysis: ${res.statusText}`);
  return res.json();
}

export async function predictSnapshot(
  snapshot: Snapshot,
  locationMode: 'baseline' | 'model' = 'baseline'
): Promise<PredictionResult> {
  const res = await fetch(`${API_BASE}/api/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      snapshot,
      location_mode: locationMode,
    }),
  });
  if (!res.ok) throw new Error(`Prediction API failed: ${res.statusText}`);
  return res.json();
}

export async function fetchAtms(limit?: number, bank?: string): Promise<ATM[]> {
  const searchParams = new URLSearchParams();
  if (limit) searchParams.set('limit', limit.toString());
  if (bank) searchParams.set('bank', bank);

  const url = `${API_BASE}/api/atms${searchParams.toString() ? '?' + searchParams.toString() : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ATMs: ${res.statusText}`);
  return res.json();
}

export async function fetchModelStatus(): Promise<ModelStatusResponse> {
  const res = await fetch(`${API_BASE}/api/models/status`);
  if (!res.ok) throw new Error(`Failed to fetch model status: ${res.statusText}`);
  return res.json();
}
