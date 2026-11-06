"""Inference predictor for hazard risk assessment.

Loads trained models and preprocessors via ModelManager, validates input features,
transforms features through the saved pipeline, and yields risk classification
or continuous risk indices.
Supports independent models for Landslide and Flood hazards.
When no trained model is available, returns model_status='not_trained' and
prediction_available=False. Never returns hardcoded or fabricated confidence values.
"""

from datetime import datetime, timezone
from typing import Any, Dict, Optional, Union
import numpy as np
import pandas as pd

from .config import MLConfig, get_ml_config
from .evaluation import risk_level_from_score
from .feature_extractor import FeatureExtractor
from .model_manager import ModelManager
from .schemas import MLPredictionInput, MLPredictionOut


class HazardPredictor:
    """Performs ML hazard prediction with independent hazard models and fallback awareness."""

    def __init__(
        self,
        model_manager: Optional[ModelManager] = None,
        feature_extractor: Optional[FeatureExtractor] = None,
        config: Optional[MLConfig] = None,
    ):
        self.config = config or get_ml_config()
        self.model_manager = model_manager or ModelManager(self.config)
        self.feature_extractor = feature_extractor or FeatureExtractor(self.config)

    def is_model_ready(self, hazard_category: str = "composite") -> bool:
        """Check whether a trained ML model is ready for inference for the given hazard."""
        return self.model_manager.is_model_available(hazard_type=hazard_category)

    def predict(
        self,
        inputs: Union[MLPredictionInput, Dict[str, Any], pd.DataFrame],
    ) -> MLPredictionOut:
        """Generate hazard risk prediction using the appropriate trained ML model.

        If the model is not trained or unavailable, returns an explicit
        unavailability response so the system falls back to the heuristic risk engine.
        Confidence is strictly computed via genuine methods (e.g., class probability);
        never hardcoded.
        """
        now_iso = datetime.now(timezone.utc).isoformat()
        hazard_cat = "composite"

        if isinstance(inputs, MLPredictionInput):
            hazard_cat = (inputs.hazard_category or "composite").lower()
        elif isinstance(inputs, dict):
            hazard_cat = str(inputs.get("hazard_category", "composite")).lower()

        # 1. Check if model is available for this hazard
        if not self.is_model_ready(hazard_cat):
            return MLPredictionOut(
                prediction_available=False,
                model_status="not_trained",
                prediction_source="heuristic",
                hazard_category=hazard_cat,
                predicted_risk_index=None,
                predicted_risk_level=None,
                confidence=None,
                class_probabilities=None,
                model_version=None,
                model_type=None,
                timestamp=now_iso,
                message=f"Trained ML model for '{hazard_cat}' is not available. Use heuristic risk engine fallback.",
                fallback_recommended=True,
            )

        # 2. Extract and format input features into DataFrame
        if isinstance(inputs, pd.DataFrame):
            df_in = inputs
        else:
            df_in = self.feature_extractor.extract_from_prediction_input(inputs)

        # 3. Load model and preprocessor for this specific hazard
        model, preprocessor, metadata = self.model_manager.load_model(hazard_type=hazard_cat)
        if model is None or preprocessor is None:
            return MLPredictionOut(
                prediction_available=False,
                model_status="not_trained",
                prediction_source="heuristic",
                hazard_category=hazard_cat,
                predicted_risk_index=None,
                predicted_risk_level=None,
                confidence=None,
                class_probabilities=None,
                model_version=None,
                model_type=None,
                timestamp=now_iso,
                message=f"Failed to load '{hazard_cat}' model artifacts. Reverting to heuristic risk engine.",
                fallback_recommended=True,
            )

        try:
            # 4. Transform features through fitted preprocessor
            X_trans = preprocessor.transform(df_in)

            # 5. Model prediction
            risk_index: Optional[float] = None
            risk_level: Optional[str] = None
            confidence: Optional[float] = None
            class_probs: Optional[Dict[str, float]] = None

            # Check if model has predict_proba (classifiers)
            if hasattr(model, "predict_proba"):
                probs = model.predict_proba(X_trans)[0]
                classes = list(getattr(model, "classes_", []))

                if classes:
                    class_probs = {
                        str(cls_name): round(float(prob), 4)
                        for cls_name, prob in zip(classes, probs)
                    }
                    pred_class = str(model.predict(X_trans)[0])
                    risk_level = pred_class.lower()

                    # Genuine confidence: max predicted class probability
                    confidence = round(float(np.max(probs)), 4)

                    # Estimate numerical risk index from class probabilities if classes are risk levels
                    level_weights = {"low": 15.0, "medium": 38.0, "high": 65.0, "critical": 90.0}
                    if all(c.lower() in level_weights for c in classes):
                        risk_index = round(
                            sum(level_weights[c.lower()] * p for c, p in zip(classes, probs)), 1
                        )
                    else:
                        risk_index = level_weights.get(risk_level, 50.0)

            else:
                # Regressor
                raw_pred = float(model.predict(X_trans)[0])
                risk_index = round(min(100.0, max(0.0, raw_pred)), 1)
                risk_level = risk_level_from_score(risk_index, self.config)
                # Genuine confidence: only set if a genuine estimation technique exists
                # Standard scikit-learn regressors do not output probability confidence, so return None (null in JSON)
                confidence = None

            model_version = metadata.get("model_version", "1.0.0") if metadata else "1.0.0"
            model_type = metadata.get("model_type", type(model).__name__) if metadata else type(model).__name__

            return MLPredictionOut(
                prediction_available=True,
                model_status="trained",
                prediction_source="machine_learning",
                hazard_category=hazard_cat,
                predicted_risk_index=risk_index,
                predicted_risk_level=risk_level,
                confidence=confidence,
                class_probabilities=class_probs,
                model_version=model_version,
                model_type=model_type,
                timestamp=now_iso,
                message=f"Prediction successfully generated by trained {hazard_cat} ML model.",
                fallback_recommended=False,
            )

        except Exception as exc:
            return MLPredictionOut(
                prediction_available=False,
                model_status="error",
                prediction_source="heuristic",
                hazard_category=hazard_cat,
                predicted_risk_index=None,
                predicted_risk_level=None,
                confidence=None,
                class_probabilities=None,
                model_version=None,
                model_type=None,
                timestamp=now_iso,
                message=f"ML inference error: {str(exc)}. Falling back to heuristic risk engine.",
                fallback_recommended=True,
            )
