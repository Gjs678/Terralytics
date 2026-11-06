"""FastAPI route handlers for the Machine Learning subsystem."""

from fastapi import APIRouter, HTTPException, Query, status

from ..ml.schemas import (
    DatasetListOut,
    MLModelStatusOut,
    MLPredictionInput,
    MLPredictionOut,
    MLTrainingRequest,
    MLTrainingResultOut,
)
from ..services.ml_prediction_service import ml_service

router = APIRouter(prefix="/api/ml", tags=["machine_learning"])


@router.get("/status", response_model=MLModelStatusOut)
def get_ml_status():
    """Retrieve operational status of the ML model, pipeline, and dataset readiness.

    Returns whether a serialized model artifact exists on disk, training completion state,
    active model version, and detected dataset count.
    """
    return ml_service.get_status()


@router.get("/datasets", response_model=DatasetListOut)
def list_available_datasets():
    """Inspect and report on all CSV datasets present in the dataset directory.

    Provides dataset filenames, record counts, columns, inferred dtypes,
    and missing value diagnostic summaries.
    """
    return ml_service.list_datasets()


@router.post("/predict", response_model=MLPredictionOut)
def predict_hazard_ml(payload: MLPredictionInput):
    """Generate predictive hazard risk using the trained ML model.

    If a trained model is not yet available, returns prediction_available=False
    and model_status='not_trained', directing the caller to the heuristic risk engine.
    Never fabricates ML predictions when models are missing.
    """
    return ml_service.predict(payload)


@router.post(
    "/train",
    response_model=MLTrainingResultOut,
    responses={
        400: {"description": "Training cannot proceed due to missing or invalid datasets"},
    },
)
def train_hazard_model(payload: MLTrainingRequest = MLTrainingRequest()):
    """Trigger ML model training for future authorized use.

    Validates dataset presence. If datasets have not been downloaded or are missing,
    rejects execution with an HTTP 400 error rather than generating synthetic artifacts.
    """
    # Validate dataset availability before attempting training
    if not ml_service.dataset_loader.has_datasets():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Cannot train model: No CSV datasets found in datasets directory. "
                "Please place Assam hazard datasets in backend/app/ml/datasets/ before initiating training."
            ),
        )

    result = ml_service.train_model(payload)
    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.message,
        )

    return result
