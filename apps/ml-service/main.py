from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import forecast, health, pax

app = FastAPI(
    title="WorkforceIQ ML Service",
    description="Demand forecasting and workforce intelligence API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, tags=["Health"])
app.include_router(pax.router, prefix="/pax", tags=["PAX Data"])
app.include_router(forecast.router, prefix="/forecast", tags=["Forecasting"])


@app.get("/")
async def root():
    return {"service": "WorkforceIQ ML Service", "version": "0.1.0", "status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
