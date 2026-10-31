"""Tests for Predictive Hazard-Risk Estimation (Feature 1)."""
import pytest
from app.services import risk_engine


def test_flood_and_landslide_separate_categories():
    """Verify flood and landslide hazards are computed and reported separately."""
    result = risk_engine.estimate_segment_hazard(
        slope_deg=32.0,  # steep slope -> high landslide susceptibility
        terrain_type="mountain_slope",
        floodplain_exposure="low",  # ridge -> low flood susceptibility
        antecedent_rain_mm=40.0,
        forecast_rain_mm=25.0,
        forecast_horizon="3h",
    )
    assert result.landslide is not None
    assert result.flood is not None
    assert result.landslide.category == "landslide"
    assert result.flood.category == "flood"

    # With steep slope and low floodplain, landslide risk index must exceed flood risk index
    assert result.landslide.risk_index > result.flood.risk_index
    assert result.landslide.terrain_susceptibility > result.flood.terrain_susceptibility


def test_risk_increases_with_higher_rainfall_and_slope():
    """Hazard risk index must increase when rainfall accumulation and slope gradient increase."""
    low_condition = risk_engine.estimate_segment_hazard(
        slope_deg=10.0,
        terrain_type="flat_terrace",
        floodplain_exposure="low",
        antecedent_rain_mm=5.0,
        forecast_rain_mm=4.0,
        forecast_horizon="3h",
    )
    high_condition = risk_engine.estimate_segment_hazard(
        slope_deg=38.0,
        terrain_type="steep_escarpment",
        floodplain_exposure="high",
        antecedent_rain_mm=60.0,
        forecast_rain_mm=50.0,
        forecast_horizon="3h",
    )

    assert low_condition.landslide.risk_index < high_condition.landslide.risk_index
    assert low_condition.flood.risk_index < high_condition.flood.risk_index
    assert low_condition.overall_hazard_index < high_condition.overall_hazard_index


def test_forecast_horizons_produce_graduated_predictive_risk():
    """Longer forecast horizons accumulate more rainfall and yield higher trigger impacts."""
    res_1h = risk_engine.estimate_segment_hazard(
        slope_deg=30.0,
        terrain_type="hill",
        floodplain_exposure="moderate",
        antecedent_rain_mm=20.0,
        forecast_rain_mm=8.0,
        forecast_horizon="1h",
    )
    res_24h = risk_engine.estimate_segment_hazard(
        slope_deg=30.0,
        terrain_type="hill",
        floodplain_exposure="moderate",
        antecedent_rain_mm=20.0,
        forecast_rain_mm=65.0,
        forecast_horizon="24h",
    )

    assert res_1h.forecast_horizon == "1h"
    assert res_24h.forecast_horizon == "24h"
    # 24h accumulation of 65mm should trigger higher predicted risk than 1h 8mm
    assert res_24h.landslide.predicted_trigger > res_1h.landslide.predicted_trigger


def test_missing_inputs_reported_as_unknown_not_zero():
    """Missing terrain and rainfall data must return is_unknown=True and risk_level='unknown', never 0."""
    res_unknown = risk_engine.estimate_segment_hazard(
        slope_deg=None,
        terrain_type=None,
        floodplain_exposure=None,
        antecedent_rain_mm=None,
        forecast_rain_mm=None,
    )
    assert res_unknown.landslide.is_unknown is True
    assert res_unknown.landslide.risk_level == "unknown"
    assert res_unknown.flood.is_unknown is True
    assert res_unknown.flood.risk_level == "unknown"
    assert res_unknown.overall_hazard_index is None
    assert res_unknown.overall_risk_level == "unknown"

    # Factors must explicitly reflect unknown status
    terrain_factor = next(f for f in res_unknown.landslide.factors if f.category == "terrain")
    assert terrain_factor.status == "unknown"
    assert terrain_factor.impact_score is None


def test_confirmed_closure_is_separate_impassable_flag():
    """Confirmed severe closures must set is_impassable=True without corrupting hazard score calculations."""
    incidents = [
        {
            "id": "INC-TEST-1",
            "type": "landslide",
            "severity": "severe",
            "description": "Massive debris flow completely blocking both carriageways",
            "status": "closed",
        }
    ]
    res = risk_engine.estimate_segment_hazard(
        slope_deg=35.0,
        terrain_type="gorge",
        floodplain_exposure="low",
        antecedent_rain_mm=30.0,
        forecast_rain_mm=20.0,
        active_incidents=incidents,
    )

    # Impassability is a hard constraint
    assert res.is_impassable is True
    assert len(res.closure_reasons) > 0
    assert "Landslide" in res.closure_reasons[0]

    # The hazard scores themselves remain bounded heuristic indices (not forced to 100/100)
    assert isinstance(res.landslide.risk_index, float)
    assert 0 <= res.landslide.risk_index <= 100


def test_corridor_route_hazard_evaluation():
    """Route-level hazard evaluation extracts priors and returns transparent provenance."""
    class DummyRoute:
        id = "RT-002"
        coordinates = [[27.0844, 93.6053], [27.2, 93.7], [27.4, 93.8]]

    route = DummyRoute()
    res = risk_engine.estimate_route_hazard(route, forecast_horizon="6h")

    assert res.forecast_horizon == "6h"
    assert res.landslide.risk_index is not None
    assert res.scoring_method == risk_engine.SCORING_METHOD_VERSION
    assert "Not a trained ML prediction model" in res.confidence_note
