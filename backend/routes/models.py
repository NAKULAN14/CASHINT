from fastapi import APIRouter
from backend.models_loader import get_models

router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("/status")
def get_model_status():
    """
    Returns performance metrics, feature importances, and evaluation reports
    for the Channel, Time, and Location models.
    """
    models = get_models()

    return {
        "channel_model": {
            "name": "LightGBM Multiclass Classifier",
            "task": "Predict cash-out channel (ATM, Agent, Branch, UPI, Other)",
            "accuracy": 0.44,
            "baseline_accuracy": 0.34,
            "top_feature": "stolen_amount",
            "classes": models.channel_classes,
            "feature_importance": models.channel_importance,
            "report": models.channel_report,
            "notes": "Trained on synthetic mule chains calibrated with PaySim distributions."
        },
        "time_model": {
            "name": "LightGBM Quantile Regressors (P10, P50, P90)",
            "task": "Predict hours until cash-out with uncertainty intervals",
            "median_mae_hours": 1.96,
            "baseline_mae_hours": 2.53,
            "p10_p90_coverage": 0.763,
            "avg_window_width_hours": 5.32,
            "top_feature": "hop_velocity",
            "feature_importance": models.time_importance,
            "report": models.time_report,
            "notes": "Target variable is log1p(hours_to_cashout), transformed back using expm1()."
        },
        "location_model": {
            "name": "LightGBM LambdaMART Ranker",
            "task": "Rank candidate ATM withdrawal locations",
            "top1_accuracy": 0.476,
            "baseline_top1_accuracy": 0.489,
            "mrr": 0.518,
            "baseline_mrr": 0.525,
            "top_feature": "terminal_readiness",
            "feature_importance": models.location_importance,
            "report": models.location_report,
            "status": "underperforming_baseline",
            "production_mode": "baseline",
            "disclaimer": "Location ranker currently underperforms the nearest-to-victim heuristic baseline. The system defaults to the nearest-to-victim baseline in production, exposing the trained model for experimental comparison."
        }
    }
