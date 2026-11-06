"""Reusable data preprocessing module for MOSSAM ML subsystem.

Handles missing values, duplicate removal, feature selection, categorical
encoding, numerical scaling, datetime extraction, and train/test splitting.
Guarantees no data leakage by fitting transformers strictly on training data
and enables saving/loading fitted artifacts for inference reuse.
"""

from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union
import joblib
import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from .config import MLConfig, get_ml_config


class DataPreprocessor:
    """Configurable and serializable preprocessing pipeline."""

    def __init__(
        self,
        numerical_features: Optional[List[str]] = None,
        categorical_features: Optional[List[str]] = None,
        datetime_col: Optional[str] = "timestamp",
        scaling: str = "standard",
        impute_numeric: str = "median",
        impute_categorical: str = "most_frequent",
        config: Optional[MLConfig] = None,
    ):
        self.config = config or get_ml_config()
        self.numerical_features = numerical_features or list(self.config.default_numerical_features)
        self.categorical_features = categorical_features or list(self.config.default_categorical_features)
        self.datetime_col = datetime_col
        self.scaling = scaling
        self.impute_numeric = impute_numeric
        self.impute_categorical = impute_categorical

        # Transformers (initialized during fit)
        self.numeric_imputer: Optional[SimpleImputer] = None
        self.numeric_scaler: Optional[StandardScaler] = None
        self.cat_imputer: Optional[SimpleImputer] = None
        self.cat_encoder: Optional[OneHotEncoder] = None

        # State tracking
        self.is_fitted: bool = False
        self.active_numerical_features: List[str] = []
        self.active_categorical_features: List[str] = []
        self.encoded_feature_names: List[str] = []

    def clean_raw_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """Perform initial data hygiene: duplicate removal and whitespace normalization."""
        cleaned = df.copy()

        # Remove duplicate rows
        cleaned = cleaned.drop_duplicates()

        # Strip whitespace from string columns
        for col in cleaned.select_dtypes(include=["object", "string"]).columns:
            cleaned[col] = cleaned[col].astype(str).str.strip()

        return cleaned

    def extract_datetime_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extract temporal and seasonal indicators from datetime columns if present.

        Specifically adds monsoon season indicators for Assam / Northeast India
        (monsoon season typically spans May through September).
        """
        df_out = df.copy()
        if self.datetime_col and self.datetime_col in df_out.columns:
            try:
                dt_series = pd.to_datetime(df_out[self.datetime_col], errors="coerce")
                if not dt_series.isnull().all():
                    df_out["month"] = dt_series.dt.month.fillna(6).astype(int)
                    df_out["hour"] = dt_series.dt.hour.fillna(12).astype(int)
                    df_out["day_of_week"] = dt_series.dt.dayofweek.fillna(0).astype(int)
                    # Northeast India monsoon flag (May to September)
                    df_out["is_monsoon"] = df_out["month"].isin([5, 6, 7, 8, 9]).astype(int)

                    if "month" not in self.numerical_features:
                        self.numerical_features.append("month")
                    if "is_monsoon" not in self.numerical_features:
                        self.numerical_features.append("is_monsoon")
            except Exception:
                pass
        return df_out

    def split_train_test(
        self,
        df: pd.DataFrame,
        target_col: str,
        test_size: float = 0.2,
        random_state: int = 42,
        stratify: bool = False,
    ) -> Tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series]:
        """Split raw dataset into train and test partitions BEFORE any fitting.

        Guarantees strict separation to eliminate data leakage.
        """
        if target_col not in df.columns:
            raise ValueError(f"Target column '{target_col}' not found in dataset. Columns: {list(df.columns)}")

        # Drop rows where target itself is missing
        valid_df = df.dropna(subset=[target_col]).copy()
        X = valid_df.drop(columns=[target_col])
        y = valid_df[target_col]

        n_classes = len(y.unique())
        n_test = int(np.ceil(len(y) * test_size)) if test_size < 1.0 else int(test_size)
        strat = (
            y
            if (
                stratify
                and n_classes > 1
                and y.value_counts().min() >= 2
                and n_test >= n_classes
            )
            else None
        )

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=random_state, stratify=strat
        )

        return X_train, X_test, y_train, y_test

    def fit(self, X: pd.DataFrame, y: Optional[pd.Series] = None) -> "DataPreprocessor":
        """Fit imputation, scaling, and categorical encoders strictly on training features."""
        X_clean = self.clean_raw_data(X)
        X_clean = self.extract_datetime_features(X_clean)

        # Identify numerical features present in the dataframe
        self.active_numerical_features = [
            f for f in self.numerical_features if f in X_clean.columns
        ]

        # Identify categorical features present in the dataframe
        self.active_categorical_features = [
            f for f in self.categorical_features if f in X_clean.columns
        ]

        if not self.active_numerical_features and not self.active_categorical_features:
            # Fallback: auto-detect from dataframe columns
            num_cols = X_clean.select_dtypes(include=[np.number]).columns.tolist()
            cat_cols = X_clean.select_dtypes(include=["object", "category"]).columns.tolist()
            self.active_numerical_features = num_cols
            self.active_categorical_features = cat_cols

        # 1. Fit numerical pipeline
        if self.active_numerical_features:
            self.numeric_imputer = SimpleImputer(strategy=self.impute_numeric)
            num_data = X_clean[self.active_numerical_features]
            imputed_num = self.numeric_imputer.fit_transform(num_data)

            if self.scaling == "standard":
                self.numeric_scaler = StandardScaler()
                self.numeric_scaler.fit(imputed_num)
            else:
                self.numeric_scaler = None

        # 2. Fit categorical pipeline
        if self.active_categorical_features:
            self.cat_imputer = SimpleImputer(strategy=self.impute_categorical, fill_value="unknown")
            cat_data = X_clean[self.active_categorical_features].astype(str)
            imputed_cat = self.cat_imputer.fit_transform(cat_data)

            self.cat_encoder = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
            self.cat_encoder.fit(imputed_cat)

        # Build feature names list
        feature_names: List[str] = list(self.active_numerical_features)
        if self.cat_encoder and self.active_categorical_features:
            encoded_cat_names = self.cat_encoder.get_feature_names_out(self.active_categorical_features)
            feature_names.extend(list(encoded_cat_names))

        self.encoded_feature_names = feature_names
        self.is_fitted = True
        return self

    def transform(self, X: pd.DataFrame) -> np.ndarray:
        """Apply fitted transformers to inference inputs or test split."""
        if not self.is_fitted:
            raise RuntimeError("DataPreprocessor must be fitted before calling transform().")

        X_clean = self.clean_raw_data(X)
        X_clean = self.extract_datetime_features(X_clean)

        parts = []

        # Numerical transform
        if self.active_numerical_features:
            # Ensure all expected columns exist, fill missing columns with NaN so imputer handles them
            num_df = pd.DataFrame(index=X_clean.index)
            for col in self.active_numerical_features:
                if col in X_clean.columns:
                    num_df[col] = pd.to_numeric(X_clean[col], errors="coerce")
                else:
                    num_df[col] = np.nan

            imputed_num = self.numeric_imputer.transform(num_df)
            if self.numeric_scaler is not None:
                scaled_num = self.numeric_scaler.transform(imputed_num)
            else:
                scaled_num = imputed_num
            parts.append(scaled_num)

        # Categorical transform
        if self.active_categorical_features:
            cat_df = pd.DataFrame(index=X_clean.index)
            for col in self.active_categorical_features:
                if col in X_clean.columns:
                    cat_df[col] = X_clean[col].astype(str)
                else:
                    cat_df[col] = "unknown"

            imputed_cat = self.cat_imputer.transform(cat_df)
            encoded_cat = self.cat_encoder.transform(imputed_cat)
            parts.append(encoded_cat)

        if not parts:
            raise ValueError("No features available after preprocessing.")

        return np.hstack(parts)

    def fit_transform(self, X: pd.DataFrame, y: Optional[pd.Series] = None) -> np.ndarray:
        """Fit on training data and return transformed feature matrix."""
        return self.fit(X, y).transform(X)

    def get_feature_names(self) -> List[str]:
        """Return the names of the processed output features."""
        return list(self.encoded_feature_names)

    def save(self, filepath: Union[str, Path]) -> Path:
        """Save fitted preprocessor artifact via joblib."""
        path = Path(filepath)
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, path)
        return path

    @classmethod
    def load(cls, filepath: Union[str, Path]) -> "DataPreprocessor":
        """Load fitted preprocessor artifact from disk."""
        path = Path(filepath)
        if not path.exists():
            raise FileNotFoundError(f"Preprocessor artifact not found at: {path}")
        loaded = joblib.load(path)
        if not isinstance(loaded, DataPreprocessor):
            raise TypeError(f"Loaded object is not a DataPreprocessor: {type(loaded)}")
        return loaded
