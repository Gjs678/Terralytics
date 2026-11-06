"""Tests for the Machine Learning subsystem and Heuristic Fallback Integration."""

import os
from pathlib import Path
import pytest
import pandas as pd
import numpy as np
from fastapi.testclient import TestClient

from app.ml.config import MLConfig
from app.ml.dataset_loader import DatasetLoader
from app.ml.preprocessing import DataPreprocessor
from app.ml.model_manager import ModelManager
from app.ml.predictor import HazardPredictor
from app.ml.schemas import MLPredictionInput, MLTrainingRequest
from app.ml.training import TrainingPipeline
from app.services import risk_engine
from app.services.ml_prediction_service import MLPredictionService


def test_ml_status_when_no_model_exists(client: TestClient):
    """GET /api/ml/status must return not_trained and model_available=False when no model exists."""
    response = client.get("/api/ml/status")
    assert response.status_code == 200
    data = response.json()
    assert data["model_available"] is False
    assert data["is_trained"] is False
    assert data["model_status"] == "not_trained"
    assert data["datasets_available"] is False
    assert data["dataset_count"] == 0
    assert data["training_status"] == "no_datasets"
    assert "heuristic risk engine fallback" in data["message"].lower()


def test_dataset_status_when_no_datasets_exist(client: TestClient):
    """GET /api/ml/datasets must return empty list without error when no datasets exist."""
    response = client.get("/api/ml/datasets")
    assert response.status_code == 200
    data = response.json()
    assert data["datasets_available"] is False
    assert data["total_files"] == 0
    assert data["datasets"] == []
    assert "No CSV datasets found" in data["message"]


def test_prediction_when_no_model_trained(client: TestClient):
    """POST /api/ml/predict must return prediction_available=False when no model is trained."""
    payload = {
        "slope_deg": 32.0,
        "rainfall_mm": 45.0,
        "antecedent_rain_mm": 20.0,
        "hazard_category": "landslide",
    }
    response = client.post("/api/ml/predict", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["prediction_available"] is False
    assert data["model_status"] == "not_trained"
    assert data["prediction_source"] == "heuristic"
    assert data["predicted_risk_index"] is None
    assert data["fallback_recommended"] is True


def test_training_endpoint_rejects_when_no_datasets(client: TestClient):
    """POST /api/ml/train must return HTTP 400 Bad Request if no datasets exist."""
    response = client.post("/api/ml/train", json={"model_type": "random_forest"})
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert "Cannot train model" in detail
    assert "No CSV datasets found" in detail


def test_dataset_loader_with_csv(tmp_path: Path):
    """DatasetLoader must correctly inspect row count, columns, types, and missing values."""
    csv_file = tmp_path / "test_assam_hazard.csv"
    csv_content = (
        "slope,precipitation,soil_moisture,terrain,risk_level\n"
        "28.5,45.0,65.0,mountain_pass,high\n"
        "15.0,12.0,30.0,flat_valley,low\n"
        "38.0,85.0,,steep_escarpment,critical\n"
        "22.0,,55.0,hills,medium\n"
    )
    csv_file.write_text(csv_content, encoding="utf-8")

    cfg = MLConfig(dataset_dir=tmp_path, model_dir=tmp_path / "models")
    loader = DatasetLoader(cfg)

    # Check inspection
    summary = loader.inspect_dataset(csv_file)
    assert summary.row_count == 4
    assert summary.column_count == 5
    assert "slope" in summary.columns
    assert summary.missing_values.get("precipitation") == 1
    assert "slope_deg" in summary.detected_canonical_features

    # Check loading with synonym mapping
    df = loader.load_dataset(csv_file)
    assert "slope_deg" in df.columns
    assert "rainfall_mm" in df.columns
    assert "soil_moisture" in df.columns
    assert len(df) == 4


def test_missing_column_validation(tmp_path: Path):
    """DatasetLoader must raise ValueError if required columns are missing."""
    csv_file = tmp_path / "incomplete_hazard.csv"
    csv_content = (
        "slope,soil_moisture\n"
        "28.5,65.0\n"
        "15.0,30.0\n"
    )
    csv_file.write_text(csv_content, encoding="utf-8")

    cfg = MLConfig(dataset_dir=tmp_path, model_dir=tmp_path / "models")
    loader = DatasetLoader(cfg)

    with pytest.raises(ValueError, match="missing required column"):
        loader.load_dataset(csv_file, required_columns=["slope_deg", "rainfall_mm"])


def test_preprocessing_pipeline(tmp_path: Path):
    """DataPreprocessor must impute missing values, scale features, encode categoricals, and support save/load."""
    raw_data = pd.DataFrame({
        "slope_deg": [28.5, 15.0, np.nan, 38.0, 22.0],
        "rainfall_mm": [45.0, np.nan, 85.0, 70.0, 20.0],
        "antecedent_rain_mm": [30.0, 10.0, 40.0, 50.0, 25.0],
        "soil_moisture": [65.0, 30.0, 75.0, 80.0, 50.0],
        "elevation_m": [600.0, 120.0, 1100.0, 1400.0, 450.0],
        "drainage_density": [2.5, 3.8, 1.2, 1.0, 2.8],
        "terrain_type": ["mountain_pass", "valley", "escarpment", "escarpment", "hills"],
        "floodplain_exposure": ["moderate", "high", "low", "low", "moderate"],
        "risk_level": ["high", "low", "critical", "critical", "medium"],
    })

    cfg = MLConfig(dataset_dir=tmp_path, model_dir=tmp_path / "models")
    preprocessor = DataPreprocessor(config=cfg)

    # 1. Split train/test without leakage
    X_train, X_test, y_train, y_test = preprocessor.split_train_test(
        df=raw_data,
        target_col="risk_level",
        test_size=0.2,
        random_state=42,
    )
    assert len(X_train) == 4
    assert len(X_test) == 1

    # 2. Fit on X_train only
    X_train_trans = preprocessor.fit_transform(X_train)
    assert X_train_trans is not None
    assert X_train_trans.shape[0] == 4
    assert not np.isnan(X_train_trans).any()

    # 3. Transform X_test with fitted pipeline
    X_test_trans = preprocessor.transform(X_test)
    assert X_test_trans.shape[0] == 1
    assert not np.isnan(X_test_trans).any()

    # 4. Save and reload fitted preprocessor
    artifact_path = tmp_path / "models" / "preprocessor.joblib"
    preprocessor.save(artifact_path)
    loaded = DataPreprocessor.load(artifact_path)
    assert loaded.is_fitted is True

    # Check loaded preprocessor transform matches original
    X_test_loaded = loaded.transform(X_test)
    np.testing.assert_allclose(X_test_trans, X_test_loaded)


def test_existing_heuristic_fallback():
    """When ML model is not available, estimate_route_hazard must use heuristic and set prediction_source='heuristic'."""
    service = MLPredictionService()
    assert service.is_ml_model_available() is False

    res = risk_engine.estimate_segment_hazard(
        slope_deg=32.0,
        terrain_type="mountain_pass",
        floodplain_exposure="low",
        antecedent_rain_mm=40.0,
        forecast_rain_mm=25.0,
        forecast_horizon="3h",
    )
    assert res.prediction_source == "heuristic"
    assert res.landslide is not None
    assert res.flood is not None
    assert res.landslide.category == "landslide"


def test_existing_route_api_hazard_endpoint_compatibility(client: TestClient):
    """Existing /api/routes/{route_id}/hazard endpoint must continue working and include prediction_source."""
    response = client.get("/api/routes/RT-001/hazard?horizon=3h")
    assert response.status_code == 200
    data = response.json()
    assert "overall_hazard_index" in data
    assert "overall_risk_level" in data
    assert "landslide" in data
    assert "flood" in data
    assert "prediction_source" in data
    assert data["prediction_source"] == "heuristic"
    assert "scoring_method" in data


def test_existing_route_compare_endpoint_compatibility(client: TestClient):
    """Existing /api/routes/compare/{vehicle_id} endpoint must continue working."""
    response = client.get("/api/routes/compare/TRK-8845?horizon=3h")
    assert response.status_code == 200
    data = response.json()
    assert data["vehicle_id"] == "TRK-8845"
    assert data["standard_route"] is not None
    assert data["standard_hazard"] is not None
    assert data["standard_hazard"]["prediction_source"] == "heuristic"


def test_feature_extractor_from_route():
    """FeatureExtractor should correctly extract corridor terrain and weather features."""
    from app.ml.feature_extractor import FeatureExtractor
    extractor = FeatureExtractor()

    class MockRoute:
        id = "RT-001"

    priors = {
        "slope_deg": 28.5,
        "terrain_type": "mountain_pass",
        "floodplain": "moderate",
        "soil_saturation_baseline": 65.0,
    }

    features = extractor.extract_from_route(MockRoute(), priors=priors, forecast_horizon="6h")
    assert features["slope_deg"] == 28.5
    assert features["terrain_type"] == "mountain_pass"
    assert features["soil_moisture"] == 65.0
    assert features["forecast_horizon"] == "6h"

    valid, issues = extractor.validate_features(features)
    assert valid is True
    assert len(issues) == 0


def test_risk_level_from_score_mapping():
    """risk_level_from_score must classify continuous hazard indices correctly."""
    from app.ml.evaluation import risk_level_from_score
    assert risk_level_from_score(10.0) == "low"
    assert risk_level_from_score(30.0) == "medium"
    assert risk_level_from_score(60.0) == "high"
    assert risk_level_from_score(85.0) == "critical"
    assert risk_level_from_score(None) == "unknown"


# ============================================================================
# NEW IMPROVEMENT TESTS: Path Traversal, Dataset Validation, Training Validation,
# Separate Flood/Landslide Models, and Removal of Hardcoded Confidence
# ============================================================================

def test_path_traversal_prevention(tmp_path: Path):
    """DatasetLoader must strictly block path traversal attempts outside dataset directory."""
    cfg = MLConfig(dataset_dir=tmp_path / "datasets", model_dir=tmp_path / "models")
    loader = DatasetLoader(cfg)

    with pytest.raises(ValueError, match="Path traversal detected"):
        loader.get_dataset_path("../../etc/passwd")

    with pytest.raises(ValueError, match="Path traversal detected"):
        loader.get_dataset_path("..\\windows\\system32\\calc.exe")


def test_dataset_validation_coordinates(tmp_path: Path):
    """DatasetLoader must validate geographical coordinates, flag invalid ranges and detect duplicates."""
    csv_file = tmp_path / "geo_hazard.csv"
    csv_content = (
        "lat,lng,rainfall_mm,slope_deg,risk_level\n"
        "26.1,91.7,45.0,20.0,medium\n"
        "26.1,91.7,45.0,20.0,medium\n"  # Duplicate coordinate
        "95.0,91.8,50.0,22.0,high\n"    # Invalid latitude > 90
        "26.2,-195.0,60.0,25.0,critical\n" # Invalid longitude < -180
    )
    csv_file.write_text(csv_content, encoding="utf-8")

    cfg = MLConfig(dataset_dir=tmp_path, model_dir=tmp_path / "models")
    loader = DatasetLoader(cfg)

    summary = loader.inspect_dataset(csv_file)
    assert summary.geo_summary is not None
    assert summary.geo_summary["invalid_coordinates_count"] == 2
    assert summary.geo_summary["duplicate_geo_records"] == 1
    assert any("out-of-bounds coordinate" in err for err in summary.validation_errors)
    assert any("duplicate records" in warn for warn in summary.validation_warnings)


def test_dataset_validation_rainfall_and_slope_ranges(tmp_path: Path):
    """DatasetLoader must detect negative rainfall and invalid slope degrees."""
    csv_file = tmp_path / "physical_bounds.csv"
    csv_content = (
        "slope_deg,rainfall_mm,risk_level\n"
        "30.0,-15.0,low\n"  # Negative rainfall
        "-5.0,50.0,medium\n"  # Negative slope
        "95.0,40.0,high\n"   # Slope > 90°
        "25.0,2500.0,critical\n" # Extreme rainfall > 2000mm
    )
    csv_file.write_text(csv_content, encoding="utf-8")

    cfg = MLConfig(dataset_dir=tmp_path, model_dir=tmp_path / "models")
    loader = DatasetLoader(cfg)

    summary = loader.inspect_dataset(csv_file)
    assert any("negative rainfall" in err for err in summary.validation_errors)
    assert any("outside the 0°-90° range" in err for err in summary.validation_errors)
    assert any("extreme rainfall" in warn for warn in summary.validation_warnings)


def test_dataset_validation_timestamps_and_daterange(tmp_path: Path):
    """DatasetLoader must extract date-range information and detect unparseable timestamps."""
    csv_file = tmp_path / "temporal_hazard.csv"
    csv_content = (
        "timestamp,slope_deg,rainfall_mm,risk_level\n"
        "2026-06-15T10:00:00,30.0,40.0,medium\n"
        "2026-07-20T14:30:00,35.0,60.0,high\n"
        "invalid_date_xyz,25.0,20.0,low\n"
        "2026-08-01T08:00:00,40.0,80.0,critical\n"
    )
    csv_file.write_text(csv_content, encoding="utf-8")

    cfg = MLConfig(dataset_dir=tmp_path, model_dir=tmp_path / "models")
    loader = DatasetLoader(cfg)

    summary = loader.inspect_dataset(csv_file)
    assert summary.date_range is not None
    assert "2026-06-15" in summary.date_range["start_date"]
    assert "2026-08-01" in summary.date_range["end_date"]
    assert any("unparseable timestamp" in warn for warn in summary.validation_warnings)


def test_dataset_validation_missing_target_labels(tmp_path: Path):
    """DatasetLoader must detect missing target labels and compute missing percentages."""
    csv_file = tmp_path / "target_missing.csv"
    csv_content = (
        "slope_deg,rainfall_mm,risk_level\n"
        "30.0,40.0,medium\n"
        "35.0,60.0,\n"  # Missing label
        "25.0,20.0,low\n"
        "40.0,80.0,\n"  # Missing label
    )
    csv_file.write_text(csv_content, encoding="utf-8")

    cfg = MLConfig(dataset_dir=tmp_path, model_dir=tmp_path / "models")
    loader = DatasetLoader(cfg)

    summary = loader.inspect_dataset(csv_file)
    assert summary.target_label_summary is not None
    assert summary.target_label_summary["missing_labels_count"] == 2
    assert summary.target_label_summary["missing_labels_pct"] == 50.0


def test_dataset_without_coordinates_handled_cleanly(tmp_path: Path):
    """Datasets without lat/lng columns must not fail coordinate validation."""
    csv_file = tmp_path / "no_geo.csv"
    csv_content = (
        "slope_deg,rainfall_mm,soil_moisture,risk_level\n"
        "30.0,40.0,50.0,medium\n"
        "35.0,60.0,60.0,high\n"
    )
    csv_file.write_text(csv_content, encoding="utf-8")

    cfg = MLConfig(dataset_dir=tmp_path, model_dir=tmp_path / "models")
    loader = DatasetLoader(cfg)

    summary = loader.inspect_dataset(csv_file)
    assert summary.geo_summary is None  # Cleanly skipped, no false errors
    assert len(summary.validation_errors) == 0


def test_training_validation_insufficient_records(tmp_path: Path):
    """Training must be rejected if dataset has fewer than minimum required records."""
    csv_file = tmp_path / "tiny_dataset.csv"
    csv_content = (
        "slope_deg,rainfall_mm,terrain_type,risk_level\n"
        "30.0,40.0,mountain_pass,medium\n"
        "35.0,60.0,mountain_pass,high\n"
        "20.0,20.0,valley,low\n"
    )
    csv_file.write_text(csv_content, encoding="utf-8")

    cfg = MLConfig(dataset_dir=tmp_path, model_dir=tmp_path / "models", min_training_samples=10)
    pipeline = TrainingPipeline(config=cfg)

    res = pipeline.train_model(MLTrainingRequest(target_hazard="landslide", dataset_filename="tiny_dataset.csv"))
    assert res.success is False
    assert res.status == "failed"
    assert "Insufficient training records" in res.message


def test_training_validation_invalid_target_categories(tmp_path: Path):
    """Training must be rejected if target column has non-standard categories."""
    csv_file = tmp_path / "invalid_cats.csv"
    # 10 rows with invalid category "extreme_danger"
    lines = ["slope_deg,rainfall_mm,terrain_type,risk_level"]
    for i in range(5):
        lines.append(f"30.0,40.0,mountain_pass,extreme_danger")
        lines.append(f"20.0,20.0,valley,low")
    csv_file.write_text("\n".join(lines), encoding="utf-8")

    cfg = MLConfig(dataset_dir=tmp_path, model_dir=tmp_path / "models", min_training_samples=10)
    pipeline = TrainingPipeline(config=cfg)

    res = pipeline.train_model(MLTrainingRequest(target_hazard="landslide", dataset_filename="invalid_cats.csv"))
    assert res.success is False
    assert res.status == "failed"
    assert "Invalid target categories" in res.message


def test_training_validation_missing_feature_columns(tmp_path: Path):
    """Training must be rejected if dataset lacks hazard-specific features."""
    csv_file = tmp_path / "unrelated_columns.csv"
    lines = ["customer_id,age,income,risk_level"]
    for i in range(12):
        lines.append(f"{i},30,50000,low" if i % 2 == 0 else f"{i},45,80000,high")
    csv_file.write_text("\n".join(lines), encoding="utf-8")

    cfg = MLConfig(dataset_dir=tmp_path, model_dir=tmp_path / "models")
    pipeline = TrainingPipeline(config=cfg)

    res = pipeline.train_model(MLTrainingRequest(target_hazard="landslide", dataset_filename="unrelated_columns.csv"))
    assert res.success is False
    assert "missing required features" in res.message


def test_independent_landslide_and_flood_models(tmp_path: Path):
    """Landslide and Flood models must train independently, produce separate artifacts and store complete metadata."""
    # 1. Landslide Dataset
    ls_csv = tmp_path / "landslide_train.csv"
    ls_content = (
        "slope_deg,rainfall_mm,antecedent_rain_mm,soil_moisture,elevation_m,terrain_type,risk_level\n"
        "35.0,80.0,60.0,80.0,1200.0,steep_escarpment,critical\n"
        "38.0,90.0,70.0,85.0,1400.0,steep_escarpment,critical\n"
        "28.0,50.0,40.0,60.0,800.0,mountain_pass,high\n"
        "30.0,55.0,45.0,65.0,850.0,mountain_pass,high\n"
        "22.0,30.0,20.0,45.0,400.0,hills,medium\n"
        "20.0,25.0,18.0,40.0,350.0,hills,medium\n"
        "10.0,10.0,5.0,20.0,100.0,valley,low\n"
        "12.0,12.0,8.0,22.0,120.0,valley,low\n"
        "14.0,15.0,10.0,25.0,150.0,valley,low\n"
        "36.0,85.0,65.0,82.0,1300.0,steep_escarpment,critical\n"
    )
    ls_csv.write_text(ls_content, encoding="utf-8")

    # 2. Flood Dataset
    fl_csv = tmp_path / "flood_train.csv"
    fl_content = (
        "rainfall_mm,antecedent_rain_mm,drainage_density,elevation_m,floodplain_exposure,terrain_type,risk_level\n"
        "85.0,60.0,4.5,50.0,high,valley,critical\n"
        "90.0,70.0,4.8,45.0,high,valley,critical\n"
        "55.0,40.0,3.2,100.0,moderate,valley,high\n"
        "60.0,45.0,3.5,90.0,moderate,valley,high\n"
        "30.0,20.0,2.1,250.0,moderate,hills,medium\n"
        "25.0,18.0,2.0,300.0,low,hills,medium\n"
        "10.0,5.0,1.0,600.0,low,mountain_pass,low\n"
        "12.0,8.0,1.2,650.0,low,mountain_pass,low\n"
        "15.0,10.0,1.1,700.0,low,mountain_pass,low\n"
        "80.0,65.0,4.2,60.0,high,valley,critical\n"
    )
    fl_csv.write_text(fl_content, encoding="utf-8")

    cfg = MLConfig(dataset_dir=tmp_path, model_dir=tmp_path / "models")
    pipeline = TrainingPipeline(config=cfg)

    # Train Landslide model
    ls_res = pipeline.train_model(MLTrainingRequest(
        target_hazard="landslide",
        model_type="random_forest",
        dataset_filename="landslide_train.csv",
        dataset_source="ISRO Bhuvan",
    ))
    assert ls_res.success is True
    assert ls_res.target_hazard == "landslide"

    # Train Flood model
    fl_res = pipeline.train_model(MLTrainingRequest(
        target_hazard="flood",
        model_type="random_forest",
        dataset_filename="flood_train.csv",
        dataset_source="ASDMA CWC",
    ))
    assert fl_res.success is True
    assert fl_res.target_hazard == "flood"

    # Verify separate artifacts exist on disk
    models_dir = tmp_path / "models"
    assert (models_dir / "landslide_model.joblib").is_file()
    assert (models_dir / "landslide_preprocessor.joblib").is_file()
    assert (models_dir / "landslide_metadata.json").is_file()

    assert (models_dir / "flood_model.joblib").is_file()
    assert (models_dir / "flood_preprocessor.joblib").is_file()
    assert (models_dir / "flood_metadata.json").is_file()

    # Verify metadata fields
    manager = ModelManager(config=cfg)
    ls_meta = manager.get_model_metadata("landslide")
    assert ls_meta["target_hazard"] == "landslide"
    assert ls_meta["dataset_source"] == "ISRO Bhuvan"
    assert ls_meta["training_sample_count"] > 0
    assert ls_meta["testing_sample_count"] > 0
    assert "slope_deg" in ls_meta["features_used"]

    fl_meta = manager.get_model_metadata("flood")
    assert fl_meta["target_hazard"] == "flood"
    assert fl_meta["dataset_source"] == "ASDMA CWC"
    assert "drainage_density" in fl_meta["features_used"]

    # Verify predictor routes to the appropriate model based on hazard_category
    predictor = HazardPredictor(model_manager=manager, config=cfg)

    ls_pred = predictor.predict({
        "hazard_category": "landslide",
        "slope_deg": 35.0,
        "rainfall_mm": 80.0,
        "antecedent_rain_mm": 60.0,
        "soil_moisture": 80.0,
        "elevation_m": 1200.0,
        "terrain_type": "steep_escarpment",
    })
    assert ls_pred.prediction_available is True
    assert ls_pred.hazard_category == "landslide"
    assert ls_pred.confidence is not None  # Genuine probability from classifier

    fl_pred = predictor.predict({
        "hazard_category": "flood",
        "rainfall_mm": 85.0,
        "antecedent_rain_mm": 60.0,
        "drainage_density": 4.5,
        "elevation_m": 50.0,
        "floodplain_exposure": "high",
        "terrain_type": "valley",
    })
    assert fl_pred.prediction_available is True
    assert fl_pred.hazard_category == "flood"


def test_no_hardcoded_regression_confidence(tmp_path: Path):
    """When a regressor is trained, confidence must return None (null in JSON), never hardcoded 0.85."""
    csv_file = tmp_path / "regression_hazard.csv"
    # Target column is continuous risk_index
    content = (
        "slope_deg,rainfall_mm,antecedent_rain_mm,soil_moisture,elevation_m,terrain_type,risk_index\n"
        "35.0,80.0,60.0,80.0,1200.0,steep_escarpment,88.5\n"
        "38.0,90.0,70.0,85.0,1400.0,steep_escarpment,92.0\n"
        "28.0,50.0,40.0,60.0,800.0,mountain_pass,68.0\n"
        "30.0,55.0,45.0,65.0,850.0,mountain_pass,72.0\n"
        "22.0,30.0,20.0,45.0,400.0,hills,45.0\n"
        "20.0,25.0,18.0,40.0,350.0,hills,42.0\n"
        "10.0,10.0,5.0,20.0,100.0,valley,15.0\n"
        "12.0,12.0,8.0,22.0,120.0,valley,18.0\n"
        "14.0,15.0,10.0,25.0,150.0,valley,20.0\n"
        "36.0,85.0,65.0,82.0,1300.0,steep_escarpment,89.0\n"
    )
    csv_file.write_text(content, encoding="utf-8")

    cfg = MLConfig(dataset_dir=tmp_path, model_dir=tmp_path / "models")
    pipeline = TrainingPipeline(config=cfg)

    res = pipeline.train_model(MLTrainingRequest(
        target_hazard="landslide",
        model_type="random_forest",
        dataset_filename="regression_hazard.csv",
    ))
    assert res.success is True

    manager = ModelManager(config=cfg)
    predictor = HazardPredictor(model_manager=manager, config=cfg)

    pred = predictor.predict({
        "hazard_category": "landslide",
        "slope_deg": 35.0,
        "rainfall_mm": 80.0,
        "antecedent_rain_mm": 60.0,
        "soil_moisture": 80.0,
        "elevation_m": 1200.0,
        "terrain_type": "steep_escarpment",
    })

    assert pred.prediction_available is True
    assert pred.predicted_risk_index is not None
    # Crucial check: regression confidence must be None, NOT 0.85!
    assert pred.confidence is None
