"""Configuration module for MOSSAM ML subsystem.

Provides path resolution, column synonym dictionaries, model parameter
defaults, hazard-specific feature configurations, and risk category definitions.
Avoids hardcoded absolute paths by resolving paths relative to this file
or environment variables.
"""

import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from pydantic import BaseModel, ConfigDict, Field

# Base directories (relative to package root, portable across OSes)
ML_PACKAGE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ML_PACKAGE_DIR.parent.parent

# Storage paths with environment variable overrides
DEFAULT_DATASET_DIR = Path(
    os.getenv("MOSSAM_DATASET_DIR", str(ML_PACKAGE_DIR / "datasets"))
)
DEFAULT_MODEL_DIR = Path(
    os.getenv("MOSSAM_MODEL_DIR", str(ML_PACKAGE_DIR / "models"))
)


class MLConfig(BaseModel):
    """Runtime configuration for ML data loading, training, and inference."""

    dataset_dir: Path = Field(default=DEFAULT_DATASET_DIR)
    model_dir: Path = Field(default=DEFAULT_MODEL_DIR)

    # General / composite model artifact filenames (backward compatibility)
    model_filename: str = "hazard_risk_model.joblib"
    preprocessor_filename: str = "hazard_preprocessor.joblib"
    metadata_filename: str = "model_metadata.json"

    # Independent Landslide model artifacts
    landslide_model_filename: str = "landslide_model.joblib"
    landslide_preprocessor_filename: str = "landslide_preprocessor.joblib"
    landslide_metadata_filename: str = "landslide_metadata.json"

    # Independent Flood model artifacts
    flood_model_filename: str = "flood_model.joblib"
    flood_preprocessor_filename: str = "flood_preprocessor.joblib"
    flood_metadata_filename: str = "flood_metadata.json"

    # Default model type
    default_model_type: str = "random_forest"
    supported_model_types: List[str] = [
        "random_forest",
        "xgboost",
        "decision_tree",
        "gradient_boosting",
    ]

    # Canonical column synonyms for Assam / Northeast India hazard datasets
    # Maps arbitrary raw CSV column headers to standardized feature names
    canonical_column_synonyms: Dict[str, str] = {
        # Geographical coordinates
        "lat": "lat",
        "latitude": "lat",
        "y": "lat",
        "lng": "lng",
        "lon": "lng",
        "long": "lng",
        "longitude": "lng",
        "x": "lng",
        # Rainfall / Precipitation
        "rain": "rainfall_mm",
        "rainfall": "rainfall_mm",
        "precipitation": "rainfall_mm",
        "precip_mm": "rainfall_mm",
        "precipitation_mm": "rainfall_mm",
        "rain_mm": "rainfall_mm",
        "forecast_rain": "rainfall_mm",
        "forecast_rain_mm": "rainfall_mm",
        "rain_gauge_mm": "rainfall_mm",
        # Antecedent Rain / Soil Moisture
        "antecedent_rain": "antecedent_rain_mm",
        "antecedent_rain_mm": "antecedent_rain_mm",
        "past_rainfall_24h": "antecedent_rain_mm",
        "soil_moisture": "soil_moisture",
        "soil_saturation": "soil_moisture",
        "soil_moisture_index": "soil_moisture",
        "soil_saturation_baseline": "soil_moisture",
        # Slope / Topography
        "slope": "slope_deg",
        "slope_deg": "slope_deg",
        "slope_degree": "slope_deg",
        "slope_degrees": "slope_deg",
        "gradient_deg": "slope_deg",
        "terrain_slope": "slope_deg",
        # Elevation
        "elevation": "elevation_m",
        "elevation_m": "elevation_m",
        "altitude": "elevation_m",
        "elevation_meters": "elevation_m",
        # River / Drainage Basin
        "drainage": "drainage_density",
        "drainage_density": "drainage_density",
        "river_proximity": "floodplain_exposure",
        "floodplain": "floodplain_exposure",
        "floodplain_exposure": "floodplain_exposure",
        # Categorical features
        "terrain": "terrain_type",
        "terrain_type": "terrain_type",
        "landform": "terrain_type",
        "geology": "terrain_type",
        # Target variables
        "hazard_risk": "risk_index",
        "risk_index": "risk_index",
        "hazard_score": "risk_index",
        "risk_level": "risk_level",
        "severity": "risk_level",
        "hazard_type": "hazard_category",
        "disaster_type": "hazard_category",
        # Datetime
        "date": "timestamp",
        "datetime": "timestamp",
        "time": "timestamp",
        "record_date": "timestamp",
    }

    # Default composite numeric and categorical feature sets
    default_numerical_features: List[str] = [
        "slope_deg",
        "rainfall_mm",
        "antecedent_rain_mm",
        "soil_moisture",
        "elevation_m",
        "drainage_density",
    ]

    default_categorical_features: List[str] = [
        "terrain_type",
        "floodplain_exposure",
    ]

    # Specific feature sets for Landslide modeling (governed by steep slope, saturation, rain, geology)
    landslide_numerical_features: List[str] = [
        "slope_deg",
        "rainfall_mm",
        "antecedent_rain_mm",
        "soil_moisture",
        "elevation_m",
    ]
    landslide_categorical_features: List[str] = [
        "terrain_type",
    ]

    # Specific feature sets for Flood modeling (governed by rainfall, basin drainage, valley exposure)
    flood_numerical_features: List[str] = [
        "rainfall_mm",
        "antecedent_rain_mm",
        "drainage_density",
        "elevation_m",
    ]
    flood_categorical_features: List[str] = [
        "floodplain_exposure",
        "terrain_type",
    ]

    # Target risk classification labels
    risk_classes: List[str] = ["low", "medium", "high", "critical"]

    # Thresholds mapping 0-100 continuous index to discrete risk level
    risk_thresholds: Dict[str, float] = {
        "low_max": 25.0,
        "medium_max": 50.0,
        "high_max": 75.0,
    }

    # Minimum training record count
    min_training_samples: int = 10

    model_config = ConfigDict(arbitrary_types_allowed=True)

    def get_artifact_filenames(self, hazard_type: str = "composite") -> Tuple[str, str, str]:
        """Return (model_filename, preprocessor_filename, metadata_filename) for a hazard."""
        h = (hazard_type or "composite").lower()
        if h == "landslide":
            return (
                self.landslide_model_filename,
                self.landslide_preprocessor_filename,
                self.landslide_metadata_filename,
            )
        elif h == "flood":
            return (
                self.flood_model_filename,
                self.flood_preprocessor_filename,
                self.flood_metadata_filename,
            )
        return (
            self.model_filename,
            self.preprocessor_filename,
            self.metadata_filename,
        )

    def get_feature_sets_for_hazard(
        self, hazard_type: str = "composite"
    ) -> Tuple[List[str], List[str]]:
        """Return numerical and categorical feature lists for specified hazard."""
        h = (hazard_type or "composite").lower()
        if h == "landslide":
            return list(self.landslide_numerical_features), list(self.landslide_categorical_features)
        elif h == "flood":
            return list(self.flood_numerical_features), list(self.flood_categorical_features)
        return list(self.default_numerical_features), list(self.default_categorical_features)


_config_instance: Optional[MLConfig] = None


def get_ml_config() -> MLConfig:
    """Retrieve or initialize the ML configuration singleton."""
    global _config_instance
    if _config_instance is None:
        _config_instance = MLConfig()
        # Ensure directories exist
        _config_instance.dataset_dir.mkdir(parents=True, exist_ok=True)
        _config_instance.model_dir.mkdir(parents=True, exist_ok=True)
    return _config_instance
