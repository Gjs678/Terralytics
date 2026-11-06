"""ML prediction service and heuristic integration layer.

Orchestrates machine-learning hazard inference with independent Landslide
and Flood prediction models, with transparent fallback to the existing
heuristic risk engine.
When a trained ML model is present for a specific hazard, ML inferences are used;
otherwise, the system transparently and reliably falls back to empirical heuristic risk scoring.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import pandas as pd

from ..ml.config import get_ml_config
from ..ml.dataset_loader import DatasetLoader
from ..ml.evaluation import risk_level_from_score
from ..ml.feature_extractor import FeatureExtractor
from ..ml.model_manager import ModelManager
from ..ml.predictor import HazardPredictor
from ..ml.schemas import (
    DatasetListOut,
    MLModelStatusOut,
    MLPredictionInput,
    MLPredictionOut,
    MLTrainingRequest,
    MLTrainingResultOut,
)
from ..ml.training import TrainingPipeline
from . import risk_engine


class MLPredictionService:
    """Service layer coordinating ML model operations and heuristic fallback."""

    def __init__(self):
        self.config = get_ml_config()
        self.model_manager = ModelManager(self.config)
        self.feature_extractor = FeatureExtractor(self.config)
        self.dataset_loader = DatasetLoader(self.config)
        self.predictor = HazardPredictor(
            model_manager=self.model_manager,
            feature_extractor=self.feature_extractor,
            config=self.config,
        )
        self.training_pipeline = TrainingPipeline(
            config=self.config,
            dataset_loader=self.dataset_loader,
            model_manager=self.model_manager,
        )

    def is_ml_model_available(self, hazard_type: Optional[str] = None) -> bool:
        """Check whether a trained ML model is available on disk for specified or any hazard."""
        if hazard_type:
            return self.model_manager.is_model_available(hazard_type=hazard_type)

        return (
            self.model_manager.is_model_available("landslide")
            or self.model_manager.is_model_available("flood")
            or self.model_manager.is_model_available("composite")
        )

    def get_status(self) -> MLModelStatusOut:
        """Return the ML subsystem status, independent model states, and dataset availability."""
        general_status = self.model_manager.get_model_status()
        ls_status = self.model_manager.get_hazard_model_status("landslide")
        fl_status = self.model_manager.get_hazard_model_status("flood")

        has_datasets = self.dataset_loader.has_datasets()
        dataset_files = self.dataset_loader.list_dataset_files()

        any_trained = general_status["is_trained"]
        training_status = "trained" if any_trained else (
            "ready_for_training" if has_datasets else "no_datasets"
        )

        message = general_status.get("message")
        if not any_trained and not has_datasets:
            message = (
                "ML models (Landslide & Flood) are not trained and no datasets are found in the datasets folder. "
                "The platform is currently operating on the heuristic risk engine fallback."
            )
        elif not any_trained and has_datasets:
            message = (
                f"{len(dataset_files)} dataset(s) detected. "
                "Landslide and Flood ML models can now be trained via POST /api/ml/train."
            )

        active_models = {
            "landslide_model": ls_status,
            "flood_model": fl_status,
        }

        return MLModelStatusOut(
            model_available=general_status["model_available"],
            is_trained=general_status["is_trained"],
            model_status=general_status["model_status"],
            model_name=general_status.get("model_name"),
            model_version=general_status.get("model_version"),
            model_type=general_status.get("model_type"),
            datasets_available=has_datasets,
            dataset_count=len(dataset_files),
            training_status=training_status,
            active_models=active_models,
            landslide_model=ls_status,
            flood_model=fl_status,
            message=message,
        )

    def list_datasets(self) -> DatasetListOut:
        """Inspect and report on available CSV datasets."""
        return self.dataset_loader.inspect_all_datasets()

    def predict(self, payload: MLPredictionInput) -> MLPredictionOut:
        """Direct ML prediction endpoint handler for specified hazard."""
        return self.predictor.predict(payload)

    def train_model(self, request: Optional[MLTrainingRequest] = None) -> MLTrainingResultOut:
        """Trigger model training for independent hazard model."""
        return self.training_pipeline.train_model(request)

    def evaluate_route_hazard(
        self,
        route: Any,
        active_incidents: Optional[List[Any]] = None,
        forecast_horizon: str = "3h",
        fetch_live_weather: bool = False,
        simulated_inputs: Optional[Dict[str, Any]] = None,
    ) -> risk_engine.PredictiveHazardEstimate:
        """Integrated multi-hazard risk estimation for a route corridor.

        1. Checks whether trained Landslide and/or Flood ML models are available.
        2. Applies ML predictions for available models independently.
        3. Falls back to heuristic calculation for any hazard model not yet trained.
        4. Maintains the exact hazard response structure expected by the frontend.
        """
        # Always calculate baseline heuristic assessment
        heuristic_res = risk_engine.estimate_route_hazard_heuristic(
            route=route,
            active_incidents=active_incidents,
            forecast_horizon=forecast_horizon,
            fetch_live_weather=fetch_live_weather,
            simulated_inputs=simulated_inputs,
        )

        has_ls_model = self.is_ml_model_available("landslide")
        has_fl_model = self.is_ml_model_available("flood")
        has_comp_model = self.is_ml_model_available("composite")

        # If neither independent model nor composite model is available, return heuristic directly
        if not (has_ls_model or has_fl_model or has_comp_model):
            heuristic_res.prediction_source = "heuristic"
            return heuristic_res

        try:
            route_id = getattr(route, "id", "")
            priors = risk_engine.CORRIDOR_TERRAIN_PRIORS.get(route_id, {})

            # Extract features for this route corridor
            features = self.feature_extractor.extract_from_route(
                route=route,
                active_incidents=active_incidents,
                priors=priors,
                forecast_horizon=forecast_horizon,
            )
            if simulated_inputs:
                features.update(simulated_inputs)

            landslide_assessment = heuristic_res.landslide
            flood_assessment = heuristic_res.flood
            models_applied: List[str] = []

            # 1. Landslide Model Inference
            if has_ls_model:
                features_ls = dict(features)
                features_ls["hazard_category"] = "landslide"
                ls_pred = self.predictor.predict(features_ls)

                if ls_pred.prediction_available and ls_pred.predicted_risk_index is not None:
                    ls_idx = ls_pred.predicted_risk_index
                    ls_lvl = ls_pred.predicted_risk_level or risk_level_from_score(ls_idx, self.config)
                    conf_str = f"{ls_pred.confidence * 100.0:.1f}%" if ls_pred.confidence is not None else "N/A"

                    landslide_assessment = risk_engine.HazardCategoryAssessment(
                        category="landslide",
                        risk_index=ls_idx,
                        risk_level=ls_lvl,
                        terrain_susceptibility=heuristic_res.landslide.terrain_susceptibility,
                        observed_impact=heuristic_res.landslide.observed_impact,
                        predicted_trigger=heuristic_res.landslide.predicted_trigger,
                        is_unknown=False,
                        factors=[
                            risk_engine.FactorContribution(
                                name="ML Landslide Model Output",
                                category="model",
                                impact_score=ls_idx,
                                weight=1.0,
                                source=f"MOSSAM ML ({ls_pred.model_type} v{ls_pred.model_version})",
                                raw_value=f"Confidence: {conf_str}",
                                status="measured",
                            )
                        ] + heuristic_res.landslide.factors,
                    )
                    models_applied.append(f"Landslide ({ls_pred.model_type})")

            # 2. Flood Model Inference
            if has_fl_model:
                features_fl = dict(features)
                features_fl["hazard_category"] = "flood"
                fl_pred = self.predictor.predict(features_fl)

                if fl_pred.prediction_available and fl_pred.predicted_risk_index is not None:
                    fl_idx = fl_pred.predicted_risk_index
                    fl_lvl = fl_pred.predicted_risk_level or risk_level_from_score(fl_idx, self.config)
                    conf_str = f"{fl_pred.confidence * 100.0:.1f}%" if fl_pred.confidence is not None else "N/A"

                    flood_assessment = risk_engine.HazardCategoryAssessment(
                        category="flood",
                        risk_index=fl_idx,
                        risk_level=fl_lvl,
                        terrain_susceptibility=heuristic_res.flood.terrain_susceptibility,
                        observed_impact=heuristic_res.flood.observed_impact,
                        predicted_trigger=heuristic_res.flood.predicted_trigger,
                        is_unknown=False,
                        factors=[
                            risk_engine.FactorContribution(
                                name="ML Flood Model Output",
                                category="model",
                                impact_score=fl_idx,
                                weight=1.0,
                                source=f"MOSSAM ML ({fl_pred.model_type} v{fl_pred.model_version})",
                                raw_value=f"Confidence: {conf_str}",
                                status="measured",
                            )
                        ] + heuristic_res.flood.factors,
                    )
                    models_applied.append(f"Flood ({fl_pred.model_type})")

            # 3. Composite Model Fallback (if independent models were not trained but composite is)
            if not models_applied and has_comp_model:
                comp_pred = self.predictor.predict(features)
                if comp_pred.prediction_available and comp_pred.predicted_risk_index is not None:
                    comp_idx = comp_pred.predicted_risk_index
                    comp_lvl = comp_pred.predicted_risk_level or risk_level_from_score(comp_idx, self.config)
                    models_applied.append(f"Composite ({comp_pred.model_type})")

            if not models_applied:
                heuristic_res.prediction_source = "heuristic"
                return heuristic_res

            # Recompute overall composite hazard score using dominant hazard weighting
            ls_idx = landslide_assessment.risk_index
            fl_idx = flood_assessment.risk_index

            if ls_idx is None and fl_idx is None:
                overall_index = None
                overall_level = "unknown"
            elif ls_idx is None:
                overall_index = fl_idx
                overall_level = flood_assessment.risk_level
            elif fl_idx is None:
                overall_index = ls_idx
                overall_level = landslide_assessment.risk_level
            else:
                dominant = max(ls_idx, fl_idx)
                secondary = min(ls_idx, fl_idx)
                overall_index = round(0.75 * dominant + 0.25 * secondary, 1)
                overall_level = risk_level_from_score(overall_index, self.config)

            scoring_method = f"MOSSAM-ML[{', '.join(models_applied)}]"
            confidence_note = (
                f"Prediction computed with trained Machine Learning model(s): {', '.join(models_applied)}."
            )

            now_iso = datetime.now(timezone.utc).isoformat()

            return risk_engine.PredictiveHazardEstimate(
                overall_hazard_index=overall_index,
                overall_risk_level=overall_level,
                forecast_horizon=forecast_horizon,
                landslide=landslide_assessment,
                flood=flood_assessment,
                is_impassable=heuristic_res.is_impassable,
                closure_reasons=heuristic_res.closure_reasons,
                data_freshness=heuristic_res.data_freshness,
                data_timestamp=now_iso,
                scoring_method=scoring_method,
                confidence_note=confidence_note,
                prediction_source="machine_learning",
            )

        except Exception:
            heuristic_res.prediction_source = "heuristic"
            return heuristic_res


# Service singleton
ml_service = MLPredictionService()
