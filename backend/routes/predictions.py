from fastapi import APIRouter, HTTPException
from backend.schemas import PredictRequest, PredictResponse
from backend.prediction_service import run_prediction_pipeline

router = APIRouter(prefix="/api/predict", tags=["predictions"])


@router.post("", response_model=PredictResponse)
def predict(request: PredictRequest):
    """
    Accepts an incremental evidence snapshot dict and returns predictions for:
    - WHERE: candidate ATM/branch locations
    - WHEN: cash-out time window (p10, p50, p90)
    - HOW: cash-out channel probabilities (ATM, Agent, Branch, UPI, Other)
    - CONFIDENCE: overall and component confidence levels
    - WHY: supporting signal interpretations
    """
    try:
        snapshot_dict = request.snapshot.model_dump()
        location_mode = request.location_mode or "baseline"
        if location_mode not in ["baseline", "model"]:
            location_mode = "baseline"

        result = run_prediction_pipeline(snapshot_dict, location_mode=location_mode)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Prediction pipeline failed: {str(e)}"
        )
