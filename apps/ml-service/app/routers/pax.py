from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import date

router = APIRouter()


class PaxDataPoint(BaseModel):
    outlet_id: str
    date: date
    hour: int
    pax_count: int
    revenue: Optional[float] = None
    special_event: Optional[str] = None


class PaxDataBatch(BaseModel):
    data: List[PaxDataPoint]


@router.post("/ingest")
async def ingest_pax_data(batch: PaxDataBatch):
    """Accept PAX data from POS systems or manual upload."""
    return {
        "status": "queued",
        "records": len(batch.data),
        "message": "PAX data ingestion queued for processing",
    }


@router.get("/{outlet_id}")
async def get_pax_data(outlet_id: str, start_date: date, end_date: date):
    """Retrieve historical PAX data for an outlet."""
    return {
        "outlet_id": outlet_id,
        "start_date": start_date,
        "end_date": end_date,
        "data": [],
        "message": "Connect to TimescaleDB to retrieve PAX data",
    }
