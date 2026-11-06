"""Model training pipeline for future authorized training jobs.

Validates dataset availability, enforces training thresholds, validates target
categories and features, trains hazard-specific estimators (Landslide vs Flood),
evaluates on test splits, and persists model artifacts and comprehensive metadata.
"""

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import pandas as pd

from .config import MLConfig, get_ml_config
from .dataset_loader import DatasetLoader
from .evaluation import evaluate_classification, evaluate_regression
from .model_manager import ModelManager
from .preprocessing import DataPreprocessor
from .schemas import MLTrainingRequest, MLTrainingResultOut


class TrainingPipeline:
    """Orchestrates end-to-end model training for independent hazard models."""

    def __init__(
        self,
        config: Optional[MLConfig] = None,
        dataset_loader: Optional[DatasetLoader] = None,
        model_manager: Optional[ModelManager] = None,
    ):
        self.config = config or get_ml_config()
        self.dataset_loader = dataset_loader or DatasetLoader(self.config)
        self.model_manager = model_manager or ModelManager(self.config)

    def train_model(
        self,
        request: Optional[MLTrainingRequest] = None,
    ) -> MLTrainingResultOut:
        """Execute model training on specified or detected dataset for the target hazard.

        Performs rigorous validation:
          - Dataset availability
          - Path traversal security
          - Minimum training record count
          - Missing target labels
          - Class balance and category validity
          - Hazard-specific feature presence
          - Leakage-free train/test splitting
        """
        req = request or MLTrainingRequest()
        model_type = req.model_type or self.config.default_model_type
        target_hazard = (req.target_hazard or "landslide").lower()

        # 1. Check dataset directory availability
        if not self.dataset_loader.has_datasets():
            return MLTrainingResultOut(
                success=False,
                status="failed",
                target_hazard=target_hazard,
                message=(
                    f"No CSV datasets found in '{self.config.dataset_dir}'. "
                    "Cannot initiate training without genuine hazard data. "
                    "Please place Assam hazard CSV datasets in the datasets folder."
                ),
            )

        # 2. Identify and resolve target dataset file safely (prevent path traversal)
        csv_files = self.dataset_loader.list_dataset_files()
        target_file: Optional[Path] = None
        if req.dataset_filename:
            try:
                target_file = self.dataset_loader.get_dataset_path(req.dataset_filename)
            except ValueError as val_err:
                return MLTrainingResultOut(
                    success=False,
                    status="failed",
                    target_hazard=target_hazard,
                    message=str(val_err),
                )
            if not target_file.exists():
                return MLTrainingResultOut(
                    success=False,
                    status="failed",
                    target_hazard=target_hazard,
                    message=f"Requested dataset file '{req.dataset_filename}' does not exist.",
                )
        else:
            target_file = csv_files[0]

        # 3. Load dataset with column mapping
        try:
            df = self.dataset_loader.load_dataset(target_file)
        except Exception as exc:
            return MLTrainingResultOut(
                success=False,
                status="failed",
                target_hazard=target_hazard,
                message=f"Failed to load dataset: {str(exc)}",
            )

        # 4. Validate sufficient training records
        if len(df) < self.config.min_training_samples:
            return MLTrainingResultOut(
                success=False,
                status="failed",
                target_hazard=target_hazard,
                message=(
                    f"Insufficient training records: dataset '{target_file.name}' contains {len(df)} records. "
                    f"A minimum of {self.config.min_training_samples} records is required for training."
                ),
            )

        # 5. Identify target column (risk_level or risk_index)
        target_col: Optional[str] = None
        task = "classification"
        for candidate in ["risk_level", "risk_index", "target", "severity", "hazard_risk"]:
            if candidate in df.columns:
                target_col = candidate
                if candidate in ["risk_index", "hazard_risk"]:
                    task = "regression"
                break

        if not target_col:
            return MLTrainingResultOut(
                success=False,
                status="failed",
                target_hazard=target_hazard,
                message=(
                    f"Dataset '{target_file.name}' lacks a recognized target column. "
                    "Expected one of ['risk_level', 'risk_index', 'severity']."
                ),
            )

        # 6. Validate missing target labels
        missing_target_count = int(df[target_col].isnull().sum())
        if missing_target_count == len(df):
            return MLTrainingResultOut(
                success=False,
                status="failed",
                target_hazard=target_hazard,
                message=f"Missing target labels: all rows in target column '{target_col}' are null/empty.",
            )

        # Drop records with missing targets
        valid_df = df.dropna(subset=[target_col]).copy()
        if len(valid_df) < self.config.min_training_samples:
            return MLTrainingResultOut(
                success=False,
                status="failed",
                target_hazard=target_hazard,
                message=(
                    f"Insufficient valid training records after dropping {missing_target_count} missing target labels: "
                    f"{len(valid_df)} records remaining (minimum {self.config.min_training_samples} required)."
                ),
            )

        # 7. Classification: Class Imbalance & Category Validity
        if task == "classification":
            valid_df[target_col] = valid_df[target_col].astype(str).str.lower().str.strip()
            y_series = valid_df[target_col]
            unique_classes = list(y_series.unique())

            if len(unique_classes) < 2:
                return MLTrainingResultOut(
                    success=False,
                    status="failed",
                    target_hazard=target_hazard,
                    message=(
                        f"Cannot train classification model: target column '{target_col}' contains only one distinct class "
                        f"({unique_classes}). At least 2 distinct classes are required."
                    ),
                )

            # Check invalid target categories
            if target_col in ["risk_level", "severity"]:
                invalid_cats = [c for c in unique_classes if c not in self.config.risk_classes]
                if invalid_cats:
                    return MLTrainingResultOut(
                        success=False,
                        status="failed",
                        target_hazard=target_hazard,
                        message=(
                            f"Invalid target categories found in '{target_col}': {invalid_cats}. "
                            f"Expected standard risk categories: {self.config.risk_classes}."
                        ),
                    )

        # 8. Validate Hazard-Specific Feature Columns
        num_features, cat_features = self.config.get_feature_sets_for_hazard(target_hazard)
        present_features = [f for f in num_features + cat_features if f in valid_df.columns]

        if len(present_features) < 2:
            return MLTrainingResultOut(
                success=False,
                status="failed",
                target_hazard=target_hazard,
                message=(
                    f"Dataset '{target_file.name}' is missing required features for {target_hazard} risk modeling. "
                    f"Expected relevant features from {num_features + cat_features}. Found: {present_features}."
                ),
            )

        # 9. Initialize preprocessor configured for the target hazard
        test_size = req.test_size or 0.2
        preprocessor = DataPreprocessor(
            numerical_features=num_features,
            categorical_features=cat_features,
            config=self.config,
        )

        try:
            X_train, X_test, y_train, y_test = preprocessor.split_train_test(
                df=valid_df,
                target_col=target_col,
                test_size=test_size,
                random_state=42,
                stratify=(task == "classification"),
            )
        except Exception as exc:
            return MLTrainingResultOut(
                success=False,
                status="failed",
                target_hazard=target_hazard,
                message=f"Dataset splitting failed: {str(exc)}",
            )

        # 10. Fit preprocessor strictly on X_train
        try:
            X_train_trans = preprocessor.fit_transform(X_train)
            X_test_trans = preprocessor.transform(X_test)
        except Exception as exc:
            return MLTrainingResultOut(
                success=False,
                status="failed",
                target_hazard=target_hazard,
                message=f"Preprocessing transformation failed: {str(exc)}",
            )

        # 11. Create model instance and fit
        try:
            model = self.model_manager.create_model_instance(
                model_type=model_type,
                task=task,
                hyperparameters=req.hyperparameters,
            )
            model.fit(X_train_trans, y_train)
        except Exception as exc:
            return MLTrainingResultOut(
                success=False,
                status="failed",
                target_hazard=target_hazard,
                message=f"Model training failed: {str(exc)}",
            )

        # 12. Evaluate model on X_test_trans
        y_pred = model.predict(X_test_trans)
        if task == "classification":
            metrics = evaluate_classification(y_test, y_pred)
        else:
            metrics = evaluate_regression(y_test, y_pred)

        # 13. Assemble complete metadata (Requirement 5)
        now_iso = datetime.now(timezone.utc).isoformat()
        metadata = {
            "model_name": f"{target_hazard}_{model_type}",
            "model_type": model_type,
            "model_version": "1.0.0",
            "dataset_filename": target_file.name,
            "dataset_source": req.dataset_source,
            "training_timestamp": now_iso,
            "training_sample_count": int(len(X_train)),
            "testing_sample_count": int(len(X_test)),
            "features_used": preprocessor.get_feature_names(),
            "evaluation_metrics": metrics,
            "hyperparameters": req.hyperparameters or {},
            "target_hazard": target_hazard,
            "task": task,
        }

        # 14. Persist model artifacts specific to target_hazard
        try:
            self.model_manager.save_model(
                model=model,
                preprocessor=preprocessor,
                metadata=metadata,
                hazard_type=target_hazard,
            )
        except Exception as exc:
            return MLTrainingResultOut(
                success=False,
                status="failed",
                target_hazard=target_hazard,
                message=f"Failed to persist {target_hazard} model artifacts: {str(exc)}",
            )

        return MLTrainingResultOut(
            success=True,
            status="completed",
            model_name=metadata["model_name"],
            model_version=metadata["model_version"],
            target_hazard=target_hazard,
            dataset_source=req.dataset_source,
            training_sample_count=metadata["training_sample_count"],
            testing_sample_count=metadata["testing_sample_count"],
            trained_at=now_iso,
            metrics=metrics,
            features_used=metadata["features_used"],
            message=f"Successfully trained {target_hazard} {model_type} model on '{target_file.name}'.",
        )
