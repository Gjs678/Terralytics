"""Feature extraction and normalization module.

Constructs consistent feature dictionaries and DataFrames from diverse backend
sources: Route database models, Open-Meteo weather forecasts, corridor terrain
priors, and raw API input payloads.
"""

from typing import Any, Dict, List, Optional, Tuple, Union
import pandas as pd

from .config import MLConfig, get_ml_config
from .schemas import MLPredictionInput


class FeatureExtractor:
    """Extracts and normalizes features for hazard risk estimation."""

    def __init__(self, config: Optional[MLConfig] = None):
        self.config = config or get_ml_config()

    def extract_from_prediction_input(
        self,
        payload: Union[MLPredictionInput, Dict[str, Any]],
    ) -> pd.DataFrame:
        """Convert an MLPredictionInput schema or raw dictionary into a single-row DataFrame."""
        if isinstance(payload, MLPredictionInput):
            data = payload.model_dump()
        else:
            data = dict(payload)

        # Merge additional features if present
        extra = data.pop("additional_features", None)
        if extra and isinstance(extra, dict):
            data.update(extra)

        # Apply canonical synonym mapping
        normalized = {}
        for k, v in data.items():
            k_clean = k.strip().lower()
            canonical_key = self.config.canonical_column_synonyms.get(k_clean, k_clean)
            normalized[canonical_key] = v

        return pd.DataFrame([normalized])

    def extract_from_route(
        self,
        route: Any,
        active_incidents: Optional[List[Any]] = None,
        antecedent_rain_mm: Optional[float] = None,
        forecast_rain_mm: Optional[float] = None,
        priors: Optional[Dict[str, Any]] = None,
        forecast_horizon: str = "3h",
    ) -> Dict[str, Any]:
        """Extract ML features from a Route database model, corridor priors, and active incidents."""
        route_id = getattr(route, "id", "")
        priors = priors or {}

        # Topographic slope & terrain
        slope_deg = priors.get("slope_deg", 25.0)
        terrain_type = priors.get("terrain_type", "hilly_corridor")
        floodplain_exposure = priors.get("floodplain", "moderate")
        soil_moisture = priors.get("soil_saturation_baseline", 50.0)

        # Default rainfall baselines if not provided
        if forecast_rain_mm is None:
            baseline_rain = {"1h": 6.5, "3h": 19.0, "6h": 42.0, "24h": 85.0}
            forecast_rain_mm = baseline_rain.get(forecast_horizon, 19.0)

        if antecedent_rain_mm is None:
            antecedent_rain_mm = soil_moisture * 0.5

        # Count active incidents matching this corridor
        inc_count = 0
        landslide_incidents = 0
        flood_incidents = 0

        if active_incidents:
            for inc in active_incidents:
                inc_route_id = getattr(inc, "affected_route_id", None) or (
                    inc.get("affected_route_id") if isinstance(inc, dict) else None
                )
                inc_status = getattr(inc, "status", None) or (
                    inc.get("status") if isinstance(inc, dict) else "active"
                )
                if inc_status != "active":
                    continue

                inc_type = getattr(inc, "type", "") or (
                    inc.get("type", "") if isinstance(inc, dict) else ""
                )

                if inc_route_id and inc_route_id == route_id:
                    inc_count += 1
                    if inc_type == "landslide":
                        landslide_incidents += 1
                    elif inc_type == "flood":
                        flood_incidents += 1

        features: Dict[str, Any] = {
            "route_id": route_id,
            "slope_deg": float(slope_deg) if slope_deg is not None else 25.0,
            "rainfall_mm": float(forecast_rain_mm) if forecast_rain_mm is not None else 19.0,
            "antecedent_rain_mm": float(antecedent_rain_mm) if antecedent_rain_mm is not None else 30.0,
            "soil_moisture": float(soil_moisture) if soil_moisture is not None else 50.0,
            "elevation_m": float(priors.get("elevation_m", 500.0)),
            "drainage_density": float(priors.get("drainage_density", 2.5)),
            "terrain_type": str(terrain_type),
            "floodplain_exposure": str(floodplain_exposure),
            "active_incident_count": inc_count,
            "active_landslide_count": landslide_incidents,
            "active_flood_count": flood_incidents,
            "forecast_horizon": forecast_horizon,
        }

        return features

    def validate_features(self, features: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """Validate physical boundaries of feature values."""
        issues: List[str] = []

        slope = features.get("slope_deg")
        if slope is not None and (slope < 0.0 or slope > 90.0):
            issues.append(f"slope_deg ({slope}) must be between 0 and 90 degrees")

        rain = features.get("rainfall_mm")
        if rain is not None and rain < 0.0:
            issues.append(f"rainfall_mm ({rain}) cannot be negative")

        antecedent = features.get("antecedent_rain_mm")
        if antecedent is not None and antecedent < 0.0:
            issues.append(f"antecedent_rain_mm ({antecedent}) cannot be negative")

        soil_m = features.get("soil_moisture")
        if soil_m is not None and (soil_m < 0.0 or soil_m > 100.0):
            issues.append(f"soil_moisture ({soil_m}) should be between 0 and 100")

        return len(issues) == 0, issues
