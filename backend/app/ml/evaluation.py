"""Model evaluation metrics and risk category mapping.

Computes genuine evaluation metrics on test partitions during training.
Never fabricates evaluation metrics when models or evaluations are absent.
"""

from typing import Any, Dict, List, Optional
import numpy as np
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
)

from .config import MLConfig, get_ml_config


def risk_level_from_score(score: Optional[float], config: Optional[MLConfig] = None) -> str:
    """Map continuous hazard index (0 - 100) to standardized risk tier.

    Thresholds:
      0.0  to 25.0 -> low
      25.0 to 50.0 -> medium
      50.0 to 75.0 -> high
      75.0 to 100.0 -> critical
    """
    if score is None or np.isnan(score):
        return "unknown"

    cfg = config or get_ml_config()
    thresholds = cfg.risk_thresholds

    if score < thresholds.get("low_max", 25.0):
        return "low"
    elif score < thresholds.get("medium_max", 50.0):
        return "medium"
    elif score < thresholds.get("high_max", 75.0):
        return "high"
    return "critical"


def evaluate_classification(
    y_true: Any,
    y_pred: Any,
    labels: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Calculate genuine classification metrics on test split."""
    acc = float(accuracy_score(y_true, y_pred))
    prec_macro = float(precision_score(y_true, y_pred, average="macro", zero_division=0))
    rec_macro = float(recall_score(y_true, y_pred, average="macro", zero_division=0))
    f1_macro = float(f1_score(y_true, y_pred, average="macro", zero_division=0))
    f1_weighted = float(f1_score(y_true, y_pred, average="weighted", zero_division=0))

    return {
        "accuracy": round(acc, 4),
        "precision_macro": round(prec_macro, 4),
        "recall_macro": round(rec_macro, 4),
        "f1_macro": round(f1_macro, 4),
        "f1_weighted": round(f1_weighted, 4),
        "total_samples": int(len(y_true)),
    }


def evaluate_regression(
    y_true: Any,
    y_pred: Any,
) -> Dict[str, Any]:
    """Calculate genuine regression metrics on test split."""
    mae = float(mean_absolute_error(y_true, y_pred))
    mse = float(mean_squared_error(y_true, y_pred))
    rmse = float(np.sqrt(mse))
    r2 = float(r2_score(y_true, y_pred))

    return {
        "mae": round(mae, 4),
        "mse": round(mse, 4),
        "rmse": round(rmse, 4),
        "r2_score": round(r2, 4),
        "total_samples": int(len(y_true)),
    }
