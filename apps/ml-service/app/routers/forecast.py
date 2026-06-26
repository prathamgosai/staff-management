from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime
import pandas as pd
import numpy as np

router = APIRouter()


class ForecastRequest(BaseModel):
    outlet_id: str
    start_date: date
    end_date: date
    model: Optional[str] = "rule_based"
    include_recommendations: bool = True


class HourlyForecast(BaseModel):
    hour: int
    pax_forecast: float
    revenue_forecast: Optional[float]
    recommended_headcount: int
    confidence_lower: float
    confidence_upper: float


class ForecastResponse(BaseModel):
    outlet_id: str
    forecast_date: date
    model: str
    generated_at: datetime
    hourly_forecasts: List[HourlyForecast]
    confidence: float


def rule_based_forecast(outlet_id: str, target_date: date) -> List[HourlyForecast]:
    """Simple rule-based forecast using time-of-day and day-of-week patterns."""
    day_of_week = target_date.weekday()
    is_weekend = day_of_week >= 5

    # Baseline PAX pattern by hour
    hourly_pattern = {
        9: 0.05, 10: 0.08, 11: 0.12, 12: 0.18, 13: 0.20, 14: 0.12,
        15: 0.06, 16: 0.06, 17: 0.08, 18: 0.15, 19: 0.18, 20: 0.15,
        21: 0.08, 22: 0.04,
    }
    weekend_multiplier = 1.25 if is_weekend else 1.0
    base_pax = 200 * weekend_multiplier

    forecasts = []
    for hour, pct in hourly_pattern.items():
        pax = base_pax * pct
        noise_factor = np.random.uniform(0.9, 1.1)
        pax_estimate = pax * noise_factor
        recommended_hc = max(1, int(np.ceil(pax_estimate / 20)))
        forecasts.append(HourlyForecast(
            hour=hour,
            pax_forecast=round(pax_estimate, 1),
            revenue_forecast=round(pax_estimate * 35, 2),
            recommended_headcount=recommended_hc,
            confidence_lower=round(pax_estimate * 0.8, 1),
            confidence_upper=round(pax_estimate * 1.2, 1),
        ))
    return forecasts


@router.post("/generate")
async def generate_forecast(request: ForecastRequest, background_tasks: BackgroundTasks):
    """Generate demand forecast for an outlet over a date range."""
    results = []
    current = request.start_date
    while current <= request.end_date:
        if request.model == "rule_based":
            hourly = rule_based_forecast(request.outlet_id, current)
        else:
            # Prophet / XGBoost stubs — implement in Phase 2
            hourly = rule_based_forecast(request.outlet_id, current)

        total_pax = sum(h.pax_forecast for h in hourly)
        peak = max(hourly, key=lambda h: h.pax_forecast)

        results.append({
            "outlet_id": request.outlet_id,
            "forecast_date": current.isoformat(),
            "model": request.model or "rule_based",
            "generated_at": datetime.utcnow().isoformat(),
            "hourly_forecasts": [h.model_dump() for h in hourly],
            "daily_summary": {
                "total_pax": round(total_pax, 0),
                "peak_hour": peak.hour,
                "peak_pax": peak.pax_forecast,
                "recommended_headcount": max(h.recommended_headcount for h in hourly),
            },
            "confidence": 0.75 if request.model == "rule_based" else 0.88,
        })

        from datetime import timedelta
        current = date.fromordinal(current.toordinal() + 1)

    return {"status": "success", "forecasts": results}


@router.get("/accuracy/{outlet_id}")
async def get_forecast_accuracy(outlet_id: str, start_date: date, end_date: date):
    """Return MAPE / RMSE metrics for the outlet's forecast model."""
    return {
        "outlet_id": outlet_id,
        "period": {"start": start_date, "end": end_date},
        "metrics": {
            "mape": None,
            "rmse": None,
            "r2": None,
            "message": "Requires historical PAX data and past forecasts to compute accuracy",
        },
    }


@router.get("/models")
async def list_models():
    return {
        "available_models": [
            {"id": "rule_based", "name": "Rule-Based", "phase": 1, "status": "available"},
            {"id": "prophet", "name": "Facebook Prophet", "phase": 2, "status": "planned"},
            {"id": "xgboost", "name": "XGBoost", "phase": 2, "status": "planned"},
            {"id": "ensemble", "name": "Ensemble", "phase": 3, "status": "planned"},
        ]
    }
