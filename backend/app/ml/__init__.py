"""MOSSAM Machine Learning Subsystem.

This package provides a modular, dataset-agnostic machine learning architecture
for hazard prediction (landslides, floods, and compound accessibility risks)
in the Northeast India / Assam corridor.

When trained models are available, predictions are served seamlessly.
When models are not yet trained, the platform transparently falls back to
the empirical physics-informed heuristic risk engine.
"""

from .config import MLConfig, get_ml_config
from .dataset_loader import DatasetLoader
from .preprocessing import DataPreprocessor
from .feature_extractor import FeatureExtractor
from .model_manager import ModelManager
from .predictor import HazardPredictor
from .training import TrainingPipeline

__all__ = [
    "MLConfig",
    "get_ml_config",
    "DatasetLoader",
    "DataPreprocessor",
    "FeatureExtractor",
    "ModelManager",
    "HazardPredictor",
    "TrainingPipeline",
]
