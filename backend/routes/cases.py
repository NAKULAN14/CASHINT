from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query

from backend.schemas import CaseSummary, CaseDetail, SnapshotSchema, PredictResponse
from backend.data_service import get_data_service
from backend.prediction_service import run_prediction_pipeline

router = APIRouter(prefix="/api/cases", tags=["cases"])


@router.get("", response_model=List[CaseSummary])
def get_cases(
    skip: int = Query(0, ge=0),
    limit: Optional[int] = Query(None, ge=1),
    search: Optional[str] = Query(None),
    urban: Optional[bool] = Query(None),
):
    """
    Returns a summary list of all fraud cases.
    Ground truth is NEVER returned.
    """
    data_svc = get_data_service()
    return data_svc.get_case_summaries(skip=skip, limit=limit, search=search, urban=urban)


@router.get("/{case_id}", response_model=CaseDetail)
def get_case_by_id(case_id: str):
    """
    Returns case metadata, accounts, and transactions.
    Ground truth is strictly excluded.
    """
    data_svc = get_data_service()
    case = data_svc.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")
    return case


@router.get("/{case_id}/snapshots", response_model=List[SnapshotSchema])
def get_case_snapshots(case_id: str):
    """
    Returns all incremental evidence snapshots for a case ordered by snapshot_index.
    """
    data_svc = get_data_service()
    snapshots = data_svc.get_case_snapshots(case_id)
    if snapshots is None:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")
    return snapshots


@router.get("/{case_id}/snapshots/{index}", response_model=SnapshotSchema)
def get_case_snapshot_by_index(case_id: str, index: int):
    """
    Returns a specific snapshot for a case by its index.
    """
    data_svc = get_data_service()
    snapshot = data_svc.get_snapshot(case_id, index)
    if snapshot is None:
        raise HTTPException(
            status_code=404,
            detail=f"Snapshot index {index} not found for case '{case_id}'"
        )
    return snapshot


@router.get("/{case_id}/analysis", response_model=List[PredictResponse])
def get_case_analysis(case_id: str, location_mode: str = Query("baseline", pattern="^(baseline|model)$")):
    """
    Convenience endpoint: returns predictions for every snapshot in the case sequence
    so the frontend can chart confidence evolution and prediction changes across steps.
    """
    data_svc = get_data_service()
    snapshots = data_svc.get_case_snapshots(case_id)
    if snapshots is None:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")

    analysis = []
    for s in snapshots:
        pred = run_prediction_pipeline(s, location_mode=location_mode)
        analysis.append(pred)
    return analysis
