"""Dataset loader module for future Assam and regional hazard data.

Reads, inspects, and validates CSV datasets from a configurable directory.
Handles column synonym mapping, detects missing values and type anomalies,
validates geographical coordinates, rainfall/slope physical bounds, timestamps,
and target labels. Prevents path traversal and never invents synthetic records.
"""

from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple, Union
import numpy as np
import pandas as pd

from .config import MLConfig, get_ml_config
from .schemas import DatasetListOut, DatasetSummaryOut


class DatasetLoader:
    """Manages loading, validation, and inspection of CSV hazard datasets."""

    def __init__(self, config: Optional[MLConfig] = None):
        self.config = config or get_ml_config()
        self.dataset_dir: Path = self.config.dataset_dir

    def list_dataset_files(self) -> List[Path]:
        """List all CSV files in the configured dataset directory.

        Returns an empty list if the directory does not exist or has no CSVs.
        """
        if not self.dataset_dir.exists():
            return []
        return sorted(list(self.dataset_dir.glob("*.csv")))

    def has_datasets(self) -> bool:
        """Check whether any CSV dataset is currently available."""
        return len(self.list_dataset_files()) > 0

    def get_dataset_path(self, filename: Union[str, Path]) -> Path:
        """Resolve a filename to a path within the dataset directory.

        Strictly prevents path traversal outside the configured dataset directory.
        """
        raw_path = Path(filename)
        base_dir = self.dataset_dir.resolve()

        if raw_path.is_absolute():
            resolved = raw_path.resolve()
        else:
            resolved = (self.dataset_dir / raw_path).resolve()

        # Enforce that the target file path resides strictly inside the dataset directory
        try:
            resolved.relative_to(base_dir)
        except ValueError:
            raise ValueError(
                f"Path traversal detected: '{filename}' attempts to access files outside '{self.dataset_dir}'."
            )

        return resolved

    def validate_dataset_columns(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Run configurable domain validations based on whichever columns are present.

        Validates:
          - Latitude and longitude (if present)
          - Rainfall physical limits (if present)
          - Slope physical limits (if present)
          - Timestamps and date range (if present)
          - Target labels and missing counts (if present)
          - Duplicate geographical records (if coordinates present)
        """
        warnings: List[str] = []
        errors: List[str] = []
        geo_summary: Optional[Dict[str, Any]] = None
        date_range: Optional[Dict[str, Optional[str]]] = None
        target_summary: Optional[Dict[str, Any]] = None

        cols_lower = {col.lower(): col for col in df.columns}

        # 1. Coordinate Validation (only if lat/lng columns exist)
        lat_col = cols_lower.get("lat") or cols_lower.get("latitude") or cols_lower.get("y")
        lng_col = cols_lower.get("lng") or cols_lower.get("longitude") or cols_lower.get("lon") or cols_lower.get("x")

        if lat_col and lng_col:
            lat_series = pd.to_numeric(df[lat_col], errors="coerce")
            lng_series = pd.to_numeric(df[lng_col], errors="coerce")

            invalid_lat = (lat_series < -90.0) | (lat_series > 90.0) | lat_series.isnull()
            invalid_lng = (lng_series < -180.0) | (lng_series > 180.0) | lng_series.isnull()
            invalid_geo_count = int((invalid_lat | invalid_lng).sum())

            if invalid_geo_count > 0:
                errors.append(f"Found {invalid_geo_count} invalid or out-of-bounds coordinate records in [{lat_col}, {lng_col}].")

            # Check for duplicate geographical records
            dup_subset = [lat_col, lng_col]
            time_candidate = cols_lower.get("timestamp") or cols_lower.get("date") or cols_lower.get("datetime")
            if time_candidate:
                dup_subset.append(time_candidate)
            dup_geo_count = int(df.duplicated(subset=dup_subset).sum())
            if dup_geo_count > 0:
                warnings.append(f"Found {dup_geo_count} duplicate records for coordinate/timestamp subset: {dup_subset}.")

            geo_summary = {
                "lat_column": lat_col,
                "lng_column": lng_col,
                "valid_coordinates_count": int(len(df) - invalid_geo_count),
                "invalid_coordinates_count": invalid_geo_count,
                "duplicate_geo_records": dup_geo_count,
                "lat_min": float(lat_series.dropna().min()) if not lat_series.dropna().empty else None,
                "lat_max": float(lat_series.dropna().max()) if not lat_series.dropna().empty else None,
                "lng_min": float(lng_series.dropna().min()) if not lng_series.dropna().empty else None,
                "lng_max": float(lng_series.dropna().max()) if not lng_series.dropna().empty else None,
            }

        # 2. Rainfall Range Validation (rainfall >= 0, sensible upper bound)
        rain_col = None
        for candidate in ["rainfall_mm", "precipitation", "rain", "rain_mm", "precipitation_mm"]:
            if candidate in cols_lower:
                rain_col = cols_lower[candidate]
                break

        if rain_col:
            rain_series = pd.to_numeric(df[rain_col], errors="coerce")
            neg_rain = (rain_series < 0.0).sum()
            extreme_rain = (rain_series > 2000.0).sum()
            if neg_rain > 0:
                errors.append(f"Column '{rain_col}' contains {int(neg_rain)} negative rainfall value(s).")
            if extreme_rain > 0:
                warnings.append(f"Column '{rain_col}' contains {int(extreme_rain)} extreme rainfall value(s) (>2000 mm).")

        # 3. Slope Range Validation (0 to 90 degrees)
        slope_col = None
        for candidate in ["slope_deg", "slope", "slope_degree", "gradient_deg"]:
            if candidate in cols_lower:
                slope_col = cols_lower[candidate]
                break

        if slope_col:
            slope_series = pd.to_numeric(df[slope_col], errors="coerce")
            invalid_slope = ((slope_series < 0.0) | (slope_series > 90.0)).sum()
            if invalid_slope > 0:
                errors.append(f"Column '{slope_col}' contains {int(invalid_slope)} slope value(s) outside the 0°-90° range.")

        # 4. Timestamp & Date-Range Validation
        time_col = None
        for candidate in ["timestamp", "date", "datetime", "time", "record_date"]:
            if candidate in cols_lower:
                time_col = cols_lower[candidate]
                break

        if time_col:
            parsed_dates = pd.to_datetime(df[time_col], errors="coerce")
            invalid_dates = int(parsed_dates.isnull().sum())
            if invalid_dates > 0:
                warnings.append(f"Column '{time_col}' contains {invalid_dates} unparseable timestamp record(s).")

            valid_dates = parsed_dates.dropna()
            if not valid_dates.empty:
                date_range = {
                    "start_date": valid_dates.min().isoformat(),
                    "end_date": valid_dates.max().isoformat(),
                }

        # 5. Missing Target-Label Detection
        target_col = None
        for candidate in ["risk_level", "risk_index", "severity", "target", "hazard_risk"]:
            if candidate in cols_lower:
                target_col = cols_lower[candidate]
                break

        if target_col:
            missing_target_count = int(df[target_col].isnull().sum())
            missing_target_pct = round((missing_target_count / max(1, len(df))) * 100.0, 2)
            if missing_target_count > 0:
                warnings.append(
                    f"Target column '{target_col}' has {missing_target_count} ({missing_target_pct}%) missing label(s)."
                )

            valid_targets = df[target_col].dropna()
            unique_targets = [str(t) for t in valid_targets.unique().tolist()]

            # Check if categorical target has invalid classes
            if target_col.lower() in ["risk_level", "severity"]:
                norm_classes = [c.lower().strip() for c in unique_targets]
                invalid_cats = [c for c in norm_classes if c not in self.config.risk_classes]
                if invalid_cats:
                    warnings.append(
                        f"Target column '{target_col}' contains non-standard risk categories: {invalid_cats}. "
                        f"Expected standard categories: {self.config.risk_classes}."
                    )

            target_summary = {
                "target_column": target_col,
                "missing_labels_count": missing_target_count,
                "missing_labels_pct": missing_target_pct,
                "unique_labels": unique_targets,
                "class_counts": {str(k): int(v) for k, v in valid_targets.value_counts().items()},
            }
        else:
            warnings.append("No explicit target label column detected ('risk_level', 'risk_index', 'severity').")

        return {
            "validation_warnings": warnings,
            "validation_errors": errors,
            "geo_summary": geo_summary,
            "date_range": date_range,
            "target_label_summary": target_summary,
        }

    def inspect_dataset(
        self,
        file_path_or_name: Union[str, Path],
        column_mapping: Optional[Dict[str, str]] = None,
    ) -> DatasetSummaryOut:
        """Inspect a single CSV dataset without loading it entirely into persistent memory.

        Computes record counts, column types, missing value statistics,
        canonical mapping detection, and comprehensive domain validations.
        """
        path = (
            file_path_or_name
            if isinstance(file_path_or_name, Path)
            else self.get_dataset_path(file_path_or_name)
        )

        if not path.exists():
            raise FileNotFoundError(f"Dataset file not found: {path}")

        file_size = path.stat().st_size

        # Read dataset with pandas
        df = pd.read_csv(path)
        row_count, col_count = df.shape

        # Column data types
        dtypes = {col: str(dtype) for col, dtype in df.dtypes.items()}

        # Missing values analysis
        missing_counts = df.isnull().sum().to_dict()
        missing_pcts = {
            col: round((count / max(1, row_count)) * 100.0, 2)
            for col, count in missing_counts.items()
        }

        # Identify which columns map to canonical features
        mapping = column_mapping or self.config.canonical_column_synonyms
        detected_canonicals: Set[str] = set()
        for col in df.columns:
            normalized = col.strip().lower()
            if normalized in mapping:
                detected_canonicals.add(mapping[normalized])
            elif col in self.config.default_numerical_features or col in self.config.default_categorical_features:
                detected_canonicals.add(col)

        # Run domain validation checks
        val_report = self.validate_dataset_columns(df)

        rel_path = str(path.relative_to(self.dataset_dir)) if path.is_relative_to(self.dataset_dir) else path.name

        return DatasetSummaryOut(
            filename=path.name,
            file_path=rel_path,
            file_size_bytes=file_size,
            row_count=row_count,
            column_count=col_count,
            columns=list(df.columns),
            dtypes=dtypes,
            missing_values=missing_counts,
            missing_percentage=missing_pcts,
            detected_canonical_features=sorted(list(detected_canonicals)),
            date_range=val_report["date_range"],
            validation_warnings=val_report["validation_warnings"],
            validation_errors=val_report["validation_errors"],
            geo_summary=val_report["geo_summary"],
            target_label_summary=val_report["target_label_summary"],
        )

    def inspect_all_datasets(self) -> DatasetListOut:
        """Inspect all available CSV datasets in the configured directory."""
        files = self.list_dataset_files()
        if not files:
            return DatasetListOut(
                datasets_available=False,
                dataset_directory=str(self.dataset_dir),
                total_files=0,
                datasets=[],
                message=(
                    "No CSV datasets found. Place Assam hazard datasets in "
                    f"'{self.dataset_dir}' to enable ML model training."
                ),
            )

        summaries = [self.inspect_dataset(f) for f in files]
        return DatasetListOut(
            datasets_available=True,
            dataset_directory=str(self.dataset_dir),
            total_files=len(summaries),
            datasets=summaries,
            message=f"Found {len(summaries)} CSV dataset(s).",
        )

    def load_dataset(
        self,
        file_path_or_name: Union[str, Path],
        column_mapping: Optional[Dict[str, str]] = None,
        required_columns: Optional[List[str]] = None,
        apply_synonyms: bool = True,
    ) -> pd.DataFrame:
        """Load and normalize a CSV dataset.

        Args:
            file_path_or_name: Path or filename of the CSV.
            column_mapping: Optional explicit column renaming dictionary.
            required_columns: List of canonical columns that must be present.
            apply_synonyms: Whether to apply canonical synonym mappings from MLConfig.

        Returns:
            Normalized pandas DataFrame.

        Raises:
            FileNotFoundError: If the file does not exist.
            ValueError: If path traversal is detected or required columns are missing.
        """
        path = (
            file_path_or_name
            if isinstance(file_path_or_name, Path)
            else self.get_dataset_path(file_path_or_name)
        )

        if not path.exists():
            raise FileNotFoundError(
                f"Dataset file '{path}' does not exist. Please place the dataset in '{self.dataset_dir}'."
            )

        df = pd.read_csv(path)

        # Normalize column header whitespace
        df.columns = [c.strip() for c in df.columns]

        # Apply column mapping
        if apply_synonyms:
            mapping = dict(self.config.canonical_column_synonyms)
            if column_mapping:
                mapping.update(column_mapping)
            rename_dict = {}
            for col in df.columns:
                col_lower = col.lower()
                if col_lower in mapping:
                    rename_dict[col] = mapping[col_lower]
                elif col in mapping:
                    rename_dict[col] = mapping[col]
            df = df.rename(columns=rename_dict)
        elif column_mapping:
            df = df.rename(columns=column_mapping)

        # Validate required columns
        if required_columns:
            missing = [c for c in required_columns if c not in df.columns]
            if missing:
                raise ValueError(
                    f"Dataset '{path.name}' is missing required column(s): {missing}. "
                    f"Available columns after mapping: {list(df.columns)}"
                )

        return df

    def detect_missing_values(self, df: pd.DataFrame) -> Dict[str, Dict[str, Any]]:
        """Return missing value count and percentage per column in a DataFrame."""
        total_rows = len(df)
        res = {}
        for col in df.columns:
            n_missing = int(df[col].isnull().sum())
            pct = round((n_missing / max(1, total_rows)) * 100.0, 2)
            res[col] = {"missing_count": n_missing, "missing_pct": pct}
        return res

    def detect_column_type_mismatches(
        self,
        df: pd.DataFrame,
        expected_types: Dict[str, str],
    ) -> Dict[str, str]:
        """Detect columns where values do not conform to expected data types."""
        mismatches: Dict[str, str] = {}
        for col, exp_type in expected_types.items():
            if col not in df.columns:
                continue

            if exp_type == "numeric":
                non_num = pd.to_numeric(df[col], errors="coerce").isnull() & df[col].notnull()
                if non_num.any():
                    count = int(non_num.sum())
                    mismatches[col] = f"{count} non-numeric value(s) found in numeric column"
            elif exp_type == "datetime":
                non_dt = pd.to_datetime(df[col], errors="coerce").isnull() & df[col].notnull()
                if non_dt.any():
                    count = int(non_dt.sum())
                    mismatches[col] = f"{count} unparseable datetime value(s) found"
        return mismatches
