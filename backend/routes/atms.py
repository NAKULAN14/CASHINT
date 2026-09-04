from typing import List, Optional
from fastapi import APIRouter, Query
from backend.schemas import ATMItem
from backend.data_service import get_data_service

router = APIRouter(prefix="/api/atms", tags=["atms"])


@router.get("", response_model=List[ATMItem])
def get_atms(
    limit: Optional[int] = Query(None, ge=1, description="Maximum number of ATMs to return"),
    bank: Optional[str] = Query(None, description="Filter by bank name"),
):
    """
    Returns list of ATMs for mapping and intelligence analysis.
    """
    data_svc = get_data_service()
    return data_svc.get_atms(limit=limit, bank=bank)
