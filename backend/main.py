import warnings
warnings.filterwarnings("ignore")

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.config import CORS_ORIGINS
from backend.models_loader import get_models
from backend.data_service import get_data_service
from backend.routes import cases, predictions, atms, models
from backend.schemas import HealthResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: load models and dataset once
    print("--- Starting CASHINT Backend ---")
    get_models()
    get_data_service()
    print("--- CASHINT Backend Ready to Serve Requests ---")
    yield
    print("--- Shutting down backend ---")


app = FastAPI(
    title="CASHINT API",
    description="Case-Adaptive Predictive Cash-out Intelligence",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal Server Error: {str(exc)}"}
    )


# Health check endpoint
@app.get("/health", response_model=HealthResponse)
def health_check():
    models_loader = get_models()
    return {
        "status": "ok",
        "models_loaded": models_loader.is_loaded,
    }


# Include subrouters
app.include_router(cases.router)
app.include_router(predictions.router)
app.include_router(atms.router)
app.include_router(models.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
