"""Model manager module for serializing, loading, and inspecting ML models.

Supports independent Landslide and Flood prediction models, as well as general
composite models. Manages artifact persistence, version metadata, and clean
modular decoupling between API callers and model storage.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union
import joblib

from sklearn.ensemble import (
    GradientBoostingClassifier,
    GradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

from .config import MLConfig, get_ml_config
from .preprocessing import DataPreprocessor


class ModelManager:
    """Manages ML model lifecycle, persistence, metadata, and loading for hazard models."""

    def __init__(self, config: Optional[MLConfig] = None):
        self.config = config or get_ml_config()
        self.model_dir: Path = self.config.model_dir
        self.model_dir.mkdir(parents=True, exist_ok=True)

    def get_model_path(
        self,
        hazard_type: str = "composite",
        model_name: Optional[str] = None,
    ) -> Path:
        """Resolve path to the model artifact."""
        if model_name:
            name = model_name
        else:
            name = self.config.get_artifact_filenames(hazard_type)[0]

        path = Path(name)
        if not path.is_absolute():
            path = self.model_dir / name
        return path

    def get_preprocessor_path(
        self,
        hazard_type: str = "composite",
        preprocessor_name: Optional[str] = None,
    ) -> Path:
        """Resolve path to the preprocessor artifact."""
        if preprocessor_name:
            name = preprocessor_name
        else:
            name = self.config.get_artifact_filenames(hazard_type)[1]

        path = Path(name)
        if not path.is_absolute():
            path = self.model_dir / name
        return path

    def get_metadata_path(
        self,
        hazard_type: str = "composite",
        metadata_name: Optional[str] = None,
    ) -> Path:
        """Resolve path to model metadata JSON."""
        if metadata_name:
            name = metadata_name
        else:
            name = self.config.get_artifact_filenames(hazard_type)[2]

        path = Path(name)
        if not path.is_absolute():
            path = self.model_dir / name
        return path

    def is_model_available(
        self,
        hazard_type: str = "composite",
        model_name: Optional[str] = None,
    ) -> bool:
        """Check whether a trained model file exists on disk for the specified hazard."""
        model_path = self.get_model_path(hazard_type=hazard_type, model_name=model_name)
        preprocessor_path = self.get_preprocessor_path(hazard_type=hazard_type)
        return model_path.is_file() and preprocessor_path.is_file()

    def get_model_metadata(
        self,
        hazard_type: str = "composite",
        metadata_name: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Read and return model metadata JSON if it exists."""
        path = self.get_metadata_path(hazard_type=hazard_type, metadata_name=metadata_name)
        if not path.is_file():
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None

    def get_hazard_model_status(self, hazard_type: str) -> Dict[str, Any]:
        """Provide status report for a specific hazard model."""
        available = self.is_model_available(hazard_type=hazard_type)
        metadata = self.get_model_metadata(hazard_type=hazard_type)

        if not available:
            return {
                "hazard_type": hazard_type,
                "model_available": False,
                "is_trained": False,
                "model_status": "not_trained",
                "model_name": None,
                "model_version": None,
                "model_type": None,
                "message": f"No trained ML model file found for {hazard_type}.",
            }

        return {
            "hazard_type": hazard_type,
            "model_available": True,
            "is_trained": True,
            "model_status": "trained",
            "model_name": metadata.get("model_name", f"{hazard_type}_model") if metadata else f"{hazard_type}_model",
            "model_version": metadata.get("model_version", "1.0.0") if metadata else "1.0.0",
            "model_type": metadata.get("model_type", "unknown") if metadata else "unknown",
            "dataset_source": metadata.get("dataset_source") if metadata else None,
            "trained_at": metadata.get("training_timestamp") or (metadata.get("trained_at") if metadata else None),
            "training_sample_count": metadata.get("training_sample_count") if metadata else None,
            "testing_sample_count": metadata.get("testing_sample_count") if metadata else None,
            "features_used": metadata.get("features_used") if metadata else None,
            "metrics": metadata.get("evaluation_metrics") or (metadata.get("metrics") if metadata else None),
            "message": f"Trained {hazard_type} ML model is loaded and ready for inference.",
        }

    def get_model_status(self, hazard_type: Optional[str] = None) -> Dict[str, Any]:
        """Provide a complete status report of model artifacts."""
        if hazard_type:
            return self.get_hazard_model_status(hazard_type)

        ls_status = self.get_hazard_model_status("landslide")
        fl_status = self.get_hazard_model_status("flood")
        comp_status = self.get_hazard_model_status("composite")

        any_available = ls_status["model_available"] or fl_status["model_available"] or comp_status["model_available"]
        any_trained = ls_status["is_trained"] or fl_status["is_trained"] or comp_status["is_trained"]

        active_models: Dict[str, Any] = {
            "landslide_model": ls_status,
            "flood_model": fl_status,
        }
        if comp_status["model_available"]:
            active_models["composite_model"] = comp_status

        primary_model = ls_status if ls_status["model_available"] else (
            fl_status if fl_status["model_available"] else comp_status
        )

        return {
            "model_available": any_available,
            "is_trained": any_trained,
            "model_status": "trained" if any_trained else "not_trained",
            "model_name": primary_model.get("model_name") if any_available else None,
            "model_version": primary_model.get("model_version") if any_available else None,
            "model_type": primary_model.get("model_type") if any_available else None,
            "landslide_model": ls_status,
            "flood_model": fl_status,
            "active_models": active_models,
            "message": (
                "Trained ML hazard models loaded."
                if any_trained
                else "No trained ML model files found. System operates with heuristic risk engine as fallback."
            ),
        }

    def load_model(
        self,
        hazard_type: str = "composite",
        model_name: Optional[str] = None,
    ) -> Tuple[Optional[Any], Optional[DataPreprocessor], Optional[Dict[str, Any]]]:
        """Load the trained model, its preprocessor, and metadata for the given hazard."""
        if not self.is_model_available(hazard_type=hazard_type, model_name=model_name):
            # Also check composite fallback if a specific hazard is requested but not found
            if hazard_type != "composite" and self.is_model_available(hazard_type="composite"):
                hazard_type = "composite"
            else:
                return None, None, None

        model_path = self.get_model_path(hazard_type=hazard_type, model_name=model_name)
        preprocessor_path = self.get_preprocessor_path(hazard_type=hazard_type)
        metadata = self.get_model_metadata(hazard_type=hazard_type)

        try:
            model = joblib.load(model_path)
            preprocessor = DataPreprocessor.load(preprocessor_path)
            return model, preprocessor, metadata
        except Exception:
            return None, None, None

    def save_model(
        self,
        model: Any,
        preprocessor: DataPreprocessor,
        metadata: Dict[str, Any],
        hazard_type: str = "composite",
        model_name: Optional[str] = None,
    ) -> Tuple[Path, Path, Path]:
        """Save trained model, preprocessor artifact, and metadata JSON."""
        model_path = self.get_model_path(hazard_type=hazard_type, model_name=model_name)
        preprocessor_path = self.get_preprocessor_path(hazard_type=hazard_type)
        metadata_path = self.get_metadata_path(hazard_type=hazard_type)

        joblib.dump(model, model_path)
        preprocessor.save(preprocessor_path)

        with open(metadata_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2)

        return model_path, preprocessor_path, metadata_path

    def create_model_instance(
        self,
        model_type: str = "random_forest",
        task: str = "classification",
        hyperparameters: Optional[Dict[str, Any]] = None,
    ) -> Any:
        """Instantiate a model with specified algorithm and hyperparameters."""
        m_type = model_type.lower()
        params = hyperparameters or {}

        if m_type == "random_forest":
            if task == "regression":
                return RandomForestRegressor(
                    n_estimators=params.get("n_estimators", 100),
                    max_depth=params.get("max_depth", None),
                    random_state=params.get("random_state", 42),
                )
            return RandomForestClassifier(
                n_estimators=params.get("n_estimators", 100),
                max_depth=params.get("max_depth", None),
                random_state=params.get("random_state", 42),
            )

        elif m_type == "decision_tree":
            if task == "regression":
                return DecisionTreeRegressor(
                    max_depth=params.get("max_depth", None),
                    random_state=params.get("random_state", 42),
                )
            return DecisionTreeClassifier(
                max_depth=params.get("max_depth", None),
                random_state=params.get("random_state", 42),
            )

        elif m_type == "gradient_boosting":
            if task == "regression":
                return GradientBoostingRegressor(
                    n_estimators=params.get("n_estimators", 100),
                    learning_rate=params.get("learning_rate", 0.1),
                    random_state=params.get("random_state", 42),
                )
            return GradientBoostingClassifier(
                n_estimators=params.get("n_estimators", 100),
                learning_rate=params.get("learning_rate", 0.1),
                random_state=params.get("random_state", 42),
            )

        elif m_type == "xgboost":
            try:
                import xgboost as xgb
                if task == "regression":
                    return xgb.XGBRegressor(
                        n_estimators=params.get("n_estimators", 100),
                        learning_rate=params.get("learning_rate", 0.1),
                        random_state=params.get("random_state", 42),
                    )
                return xgb.XGBClassifier(
                    n_estimators=params.get("n_estimators", 100),
                    learning_rate=params.get("learning_rate", 0.1),
                    random_state=params.get("random_state", 42),
                )
            except ImportError:
                # Fallback to GradientBoosting with note
                if task == "regression":
                    return GradientBoostingRegressor(
                        n_estimators=params.get("n_estimators", 100),
                        random_state=params.get("random_state", 42),
                    )
                return GradientBoostingClassifier(
                    n_estimators=params.get("n_estimators", 100),
                    random_state=params.get("random_state", 42),
                )

        raise ValueError(
            f"Unsupported model type: '{model_type}'. "
            f"Supported types: {self.config.supported_model_types}"
        )
