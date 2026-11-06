"""Pydantic schemas for the MOSSAM ML subsystem."""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class MLModelStatusOut(BaseModel):
    """Status summary for ML model availability, training state, and datasets."""

    model_available: bool = Field(description="Whether at least one serialized ML model is present on disk")
    is_trained: bool = Field(description="Whether model training has completed")
    model_status: str = Field(description="'trained' or 'not_trained'")
    model_name: Optional[str] = Field(default=None, description="Name of the active model")
    model_version: Optional[str] = Field(default=None, description="Semantic version of the model")
    model_type: Optional[str] = Field(default=None, description="Algorithm type (e.g., random_forest, xgboost)")
    datasets_available: bool = Field(description="Whether any CSV datasets exist in the datasets directory")
    dataset_count: int = Field(default=0, description="Number of CSV files detected")
    training_status: str = Field(description="'trained', 'ready_for_training', or 'no_datasets'")
    active_models: Dict[str, Any] = Field(default_factory=dict, description="Details of registered model artifacts")
    landslide_model: Optional[Dict[str, Any]] = Field(default=None, description="Status of independent Landslide model")
    flood_model: Optional[Dict[str, Any]] = Field(default=None, description="Status of independent Flood model")
    message: Optional[str] = Field(default=None, description="Human-readable informational note")


class DatasetSummaryOut(BaseModel):
    """Detailed metadata and diagnostic information for a single dataset file."""

    filename: str = Field(description="File name of the dataset")
    file_path: str = Field(description="Path relative to dataset root")
    file_size_bytes: int = Field(description="Size in bytes")
    row_count: int = Field(description="Total number of records")
    column_count: int = Field(description="Total number of columns")
    columns: List[str] = Field(description="List of raw column headers")
    dtypes: Dict[str, str] = Field(description="Inferred data type per column")
    missing_values: Dict[str, int] = Field(description="Count of missing/null values per column")
    missing_percentage: Dict[str, float] = Field(description="Percentage of missing values per column")
    detected_canonical_features: List[str] = Field(
        default_factory=list,
        description="Features successfully mapped to canonical names",
    )
    date_range: Optional[Dict[str, Optional[str]]] = Field(
        default=None, description="Minimum and maximum timestamps if temporal column present"
    )
    validation_warnings: List[str] = Field(
        default_factory=list, description="Non-fatal warnings regarding ranges, class imbalance, or data hygiene"
    )
    validation_errors: List[str] = Field(
        default_factory=list, description="Validation issues detected during dataset inspection"
    )
    geo_summary: Optional[Dict[str, Any]] = Field(
        default=None, description="Geographical coordinate validation and bounds (if present)"
    )
    target_label_summary: Optional[Dict[str, Any]] = Field(
        default=None, description="Diagnostic analysis of target column values and distributions"
    )


class DatasetListOut(BaseModel):
    """Response containing information about all available CSV datasets."""

    datasets_available: bool = Field(description="True if one or more valid CSVs were found")
    dataset_directory: str = Field(description="Resolved path of the dataset directory")
    total_files: int = Field(default=0, description="Total number of CSV datasets found")
    datasets: List[DatasetSummaryOut] = Field(default_factory=list, description="Per-file inspection summaries")
    message: Optional[str] = Field(default=None, description="Diagnostic note or instructions")


class MLPredictionInput(BaseModel):
    """Feature input payload for predicting hazard risk via ML."""

    slope_deg: Optional[float] = Field(default=None, description="Terrain slope gradient in degrees (0-90)")
    rainfall_mm: Optional[float] = Field(default=None, description="Observed or forecast precipitation in mm")
    antecedent_rain_mm: Optional[float] = Field(default=None, description="Antecedent 24h/72h rainfall in mm")
    soil_moisture: Optional[float] = Field(default=None, description="Soil moisture or saturation percentage (0-100)")
    elevation_m: Optional[float] = Field(default=None, description="Elevation above sea level in meters")
    terrain_type: Optional[str] = Field(default=None, description="Geological terrain classification")
    floodplain_exposure: Optional[str] = Field(default=None, description="'low', 'moderate', or 'high'")
    drainage_density: Optional[float] = Field(default=None, description="Drainage density index")
    hazard_category: Optional[str] = Field(default="composite", description="'landslide', 'flood', or 'composite'")
    forecast_horizon: Optional[str] = Field(default="3h", description="Forecast time horizon (e.g., 1h, 3h, 6h, 24h)")
    additional_features: Optional[Dict[str, Any]] = Field(
        default=None, description="Arbitrary extra features for future model iterations"
    )


class MLPredictionOut(BaseModel):
    """Standardized prediction output from ML inference or fallback."""

    prediction_available: bool = Field(description="Whether a genuine ML prediction was generated")
    model_status: str = Field(description="'trained' or 'not_trained'")
    prediction_source: str = Field(description="'machine_learning' or 'heuristic'")
    hazard_category: str = Field(default="composite", description="Hazard category evaluated")
    predicted_risk_index: Optional[float] = Field(default=None, description="Continuous risk index (0.0 - 100.0)")
    predicted_risk_level: Optional[str] = Field(default=None, description="'low', 'medium', 'high', 'critical', or 'unknown'")
    confidence: Optional[float] = Field(default=None, description="Prediction confidence score (0.0 - 1.0) when genuine method exists, else null")
    class_probabilities: Optional[Dict[str, float]] = Field(
        default=None, description="Class probabilities if supported by the model"
    )
    model_version: Optional[str] = Field(default=None, description="Version of the model that produced the prediction")
    model_type: Optional[str] = Field(default=None, description="Model algorithm type")
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="ISO timestamp of prediction generation",
    )
    message: Optional[str] = Field(default=None, description="Diagnostic note or fallback instruction")
    fallback_recommended: bool = Field(
        default=False, description="True if caller should rely on heuristic risk engine"
    )


class MLTrainingRequest(BaseModel):
    """Payload for initiating a future model training job."""

    model_type: Optional[str] = Field(default="random_forest", description="Algorithm to train")
    target_hazard: Optional[str] = Field(default="landslide", description="'landslide', 'flood', or 'composite'")
    dataset_filename: Optional[str] = Field(default=None, description="Specific CSV filename to train on")
    dataset_source: Optional[str] = Field(default=None, description="Origin or provider of dataset (e.g., ASDMA, IMD, ISRO Bhuvan)")
    test_size: Optional[float] = Field(default=0.2, ge=0.05, le=0.5, description="Test split fraction")
    hyperparameters: Optional[Dict[str, Any]] = Field(default=None, description="Custom model hyperparameters")


class MLTrainingResultOut(BaseModel):
    """Result of a training attempt."""

    success: bool = Field(description="Whether training succeeded")
    status: str = Field(description="'completed', 'failed', or 'rejected'")
    model_name: Optional[str] = Field(default=None)
    model_version: Optional[str] = Field(default=None)
    target_hazard: Optional[str] = Field(default=None)
    dataset_source: Optional[str] = Field(default=None)
    training_sample_count: Optional[int] = Field(default=None)
    testing_sample_count: Optional[int] = Field(default=None)
    trained_at: Optional[str] = Field(default=None)
    metrics: Optional[Dict[str, Any]] = Field(default=None, description="Test-split evaluation metrics")
    features_used: Optional[List[str]] = Field(default=None, description="Features included in the model")
    message: str = Field(description="Detailed outcome message")


__all__ = [
    "MLModelStatusOut",
    "DatasetSummaryOut",
    "DatasetListOut",
    "MLPredictionInput",
    "MLPredictionOut",
    "MLTrainingRequest",
    "MLTrainingResultOut",
]
