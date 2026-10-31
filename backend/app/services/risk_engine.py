"""Transparent, explainable route scoring and predictive hazard-risk estimation.

This is NOT a machine-learning model. It implements a transparent, empirical
physics-informed heuristic hazard index, as required:
  - Landslide Hazard: empirical combination of terrain slope susceptibility,
    antecedent precipitation, forecast accumulation, and active verified incidents.
  - Flood Hazard: combination of valley/drainage basin susceptibility,
    intense precipitation rate, and active waterlogging incidents.
  - Confirmed closures and impassability (is_impassable) are strictly kept
    separate from continuous hazard indices.
  - When essential inputs are unavailable, the model honestly marks them as
    unknown, avoiding deceptive zero-risk outputs.
"""
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional, List, Tuple, Dict, Any
import httpx

SCORING_METHOD_VERSION = "MOSSAM-HeuristicHazardIndex-v1.2"
SUPPORTED_FORECAST_HORIZONS = ("1h", "3h", "6h", "24h")

# ---- Configurable weights (tune freely) ----
TIME_WEIGHT = 1.0          # weight per hour of travel time
RISK_WEIGHT = 0.6          # weight per point of hazard_risk (0-100)
RELIABILITY_WEIGHT = 0.3   # weight per point of reliability penalty (0-100)

# Severity -> how much a new incident raises hazard risk on the route it hits
SEVERITY_RISK_DELTA = {
    "low": 15,
    "medium": 30,
    "high": 55,
    "severe": 80,
}

# Incident type -> baseline reliability penalty added (independent of severity)
TYPE_RELIABILITY_DELTA = {
    "landslide": 25,
    "flood": 20,
    "road_blockage": 30,
    "accident": 15,
    "heavy_rainfall": 10,
}


@dataclass
class ScoreBreakdown:
    travel_time: float
    hazard_risk: float
    reliability_penalty: float
    score: float
    time_weight: float = TIME_WEIGHT
    risk_weight: float = RISK_WEIGHT
    reliability_weight: float = RELIABILITY_WEIGHT


@dataclass
class FactorContribution:
    name: str
    category: str  # "terrain" | "observed" | "predicted" | "incident"
    impact_score: Optional[float]  # 0 to 100 contribution scale, or None if unknown
    weight: float
    source: str
    raw_value: Optional[Any] = None
    status: str = "measured"  # "measured" | "simulated" | "unknown"


@dataclass
class HazardCategoryAssessment:
    category: str  # "landslide" | "flood"
    risk_index: Optional[float]  # 0 to 100 heuristic index, or None if unknown
    risk_level: str  # "low" | "medium" | "high" | "critical" | "unknown"
    terrain_susceptibility: Optional[float]  # 0-100 susceptibility score
    observed_impact: Optional[float]
    predicted_trigger: Optional[float]
    is_unknown: bool
    factors: List[FactorContribution] = field(default_factory=list)


@dataclass
class PredictiveHazardEstimate:
    overall_hazard_index: Optional[float]
    overall_risk_level: str
    forecast_horizon: str  # "1h" | "3h" | "6h" | "24h"
    landslide: HazardCategoryAssessment
    flood: HazardCategoryAssessment
    is_impassable: bool  # Strictly separated from hazard scores
    closure_reasons: List[str]
    data_freshness: str  # "fresh" | "stale" | "simulated" | "unknown"
    data_timestamp: str
    scoring_method: str = SCORING_METHOD_VERSION
    confidence_note: str = (
        "Empirical heuristic hazard index based on terrain slope and precipitation accumulation. "
        "Not a trained ML prediction model."
    )


# Baseline terrain susceptibility priors for known Northeast India corridors
# Source: ISRO Bhuvan / State Disaster Management historical landslide & flood atlases
CORRIDOR_TERRAIN_PRIORS: Dict[str, Dict[str, Any]] = {
    "RT-001": {  # Guwahati - Shillong NH-40 (Khasi Hills slope, moderate/high rain)
        "corridor": "Guwahati - Shillong",
        "slope_deg": 28.5,
        "terrain_type": "mountain_pass",
        "floodplain": "moderate",
        "soil_saturation_baseline": 65.0,
    },
    "RT-002": {  # NH-13 Direct Itanagar - Ziro (Steep sub-Himalayan gorge, high landslide risk)
        "corridor": "NH-13 Direct",
        "slope_deg": 38.0,
        "terrain_type": "steep_escarpment",
        "floodplain": "low",
        "soil_saturation_baseline": 75.0,
    },
    "RT-003": {  # Sela Pass Route (Alpine pass, steep scree slopes, frost thaw)
        "corridor": "Sela Pass Route",
        "slope_deg": 34.0,
        "terrain_type": "alpine_slope",
        "floodplain": "low",
        "soil_saturation_baseline": 45.0,
    },
    "RT-004": {  # Silchar - Aizawl Corridor (Barak river basin floodplains, clayey hills)
        "corridor": "Silchar - Aizawl Corridor",
        "slope_deg": 22.0,
        "terrain_type": "river_valley_to_hills",
        "floodplain": "high",
        "soil_saturation_baseline": 70.0,
    },
}


def compute_score(travel_time_hours: float, hazard_risk: float, reliability_penalty: float) -> ScoreBreakdown:
    """Compute the transparent weighted route score. Lower is better."""
    score = (
        TIME_WEIGHT * travel_time_hours
        + RISK_WEIGHT * hazard_risk
        + RELIABILITY_WEIGHT * reliability_penalty
    )
    return ScoreBreakdown(
        travel_time=travel_time_hours,
        hazard_risk=hazard_risk,
        reliability_penalty=reliability_penalty,
        score=round(score, 2),
    )


def apply_incident_to_risk(current_hazard_risk: float, current_reliability: float, incident_type: str, severity: str) -> tuple[float, float]:
    """Given an incident, return the (new_hazard_risk, new_reliability_penalty)
    for a route that passes through/near the incident. Values are clamped
    to [0, 100] so the score stays bounded and easy to reason about.
    """
    risk_delta = SEVERITY_RISK_DELTA.get(severity, 20)
    reliability_delta = TYPE_RELIABILITY_DELTA.get(incident_type, 15)

    new_risk = min(100.0, current_hazard_risk + risk_delta)
    new_reliability = min(100.0, current_reliability + reliability_delta)
    return new_risk, new_reliability


def apply_weather_to_risk(hazard_risk: float, rainfall_mm: float) -> float:
    """Simple, transparent weather->risk feed-in: heavier rainfall nudges
    hazard risk up. 0mm -> +0, 50mm+ -> +15 (capped), linear in between.
    """
    bump = min(15.0, (rainfall_mm / 50.0) * 15.0)
    return min(100.0, hazard_risk + bump)


def fetch_forecast_rainfall(lat: float, lng: float, horizon_hours: int = 3) -> Tuple[Optional[float], str]:
    """Fetch genuine hourly precipitation forecast from Open-Meteo with a strict short timeout.
    Returns (forecast_rainfall_mm, freshness_status).
    """
    try:
        url = (
            f"https://api.open-meteo.com/v1/forecast?"
            f"latitude={lat:.4f}&longitude={lng:.4f}&hourly=precipitation&forecast_hours={max(1, min(24, horizon_hours))}&timezone=auto"
        )
        with httpx.Client(timeout=2.0) as client:
            resp = client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                hourly = data.get("hourly", {}).get("precipitation", [])
                if hourly:
                    total = sum(hourly[:horizon_hours])
                    return round(float(total), 2), "fresh"
    except Exception:
        pass
    return None, "unknown"


def _risk_level_from_index(index: Optional[float]) -> str:
    if index is None:
        return "unknown"
    if index < 25.0:
        return "low"
    elif index < 50.0:
        return "medium"
    elif index < 75.0:
        return "high"
    return "critical"


def estimate_segment_hazard(
    slope_deg: Optional[float],
    terrain_type: Optional[str],
    floodplain_exposure: Optional[str],
    antecedent_rain_mm: Optional[float],
    forecast_rain_mm: Optional[float],
    forecast_horizon: str = "3h",
    active_incidents: Optional[List[Dict[str, Any]]] = None,
    data_freshness: str = "fresh",
    data_source_weather: str = "Open-Meteo IMD-WMO",
    data_source_terrain: str = "ISRO Bhuvan DEM",
) -> PredictiveHazardEstimate:
    """Calculate transparent multi-hazard heuristic risk indices for a route segment.

    Inputs are strictly validated. If essential inputs are missing, the assessment
    marks them as unknown rather than producing misleading zero-risk estimates.
    Confirmed closures are evaluated as a separate boolean is_impassable constraint.
    """
    if forecast_horizon not in SUPPORTED_FORECAST_HORIZONS:
        forecast_horizon = "3h"

    horizon_hours = int(forecast_horizon.replace("h", ""))
    active_incidents = active_incidents or []

    # 1. Evaluate Confirmed Closures & Impassability
    is_impassable = False
    closure_reasons: List[str] = []
    landslide_incidents: List[Dict[str, Any]] = []
    flood_incidents: List[Dict[str, Any]] = []

    for inc in active_incidents:
        itype = inc.get("type", "").lower()
        sev = inc.get("severity", "").lower()
        desc = inc.get("description", "")
        status = inc.get("status", "active").lower()

        if itype == "landslide":
            landslide_incidents.append(inc)
        elif itype == "flood":
            flood_incidents.append(inc)
        elif itype in ("road_blockage", "accident", "heavy_rainfall"):
            pass

        # Check for impassability: severe hazard, confirmed road blockage, or explicit closure
        if (
            sev == "severe"
            or itype == "road_blockage"
            or "block" in desc.lower()
            or "impassable" in desc.lower()
            or status == "closed"
        ):
            is_impassable = True
            closure_reasons.append(
                f"{itype.replace('_', ' ').title()} ({sev}): {desc or 'Road confirmed impassable'}"
            )

    # 2. Evaluate Landslide Hazard Assessment
    ls_factors: List[FactorContribution] = []

    # 2a. Terrain Susceptibility (Slope)
    ls_susceptibility: Optional[float] = None
    if slope_deg is None:
        ls_factors.append(FactorContribution(
            name="Slope Gradient",
            category="terrain",
            impact_score=None,
            weight=0.45,
            source=data_source_terrain,
            raw_value="Unknown",
            status="unknown",
        ))
    else:
        if slope_deg >= 35.0:
            ls_susceptibility = 92.0
            impact = "Critical (>35°)"
        elif slope_deg >= 25.0:
            ls_susceptibility = 68.0
            impact = "High (25°-35°)"
        elif slope_deg >= 15.0:
            ls_susceptibility = 38.0
            impact = "Moderate (15°-25°)"
        else:
            ls_susceptibility = 15.0
            impact = "Low (<15°)"

        ls_factors.append(FactorContribution(
            name=f"Slope Gradient ({slope_deg:.1f}°)",
            category="terrain",
            impact_score=round(ls_susceptibility, 1),
            weight=0.45,
            source=data_source_terrain,
            raw_value=f"{slope_deg:.1f}° - {impact}",
            status="simulated" if data_freshness == "simulated" else "measured",
        ))

    # 2b. Precipitation Trigger (Antecedent 24h + Forecast)
    ls_trigger: Optional[float] = None
    if forecast_rain_mm is None and antecedent_rain_mm is None:
        ls_factors.append(FactorContribution(
            name=f"Precipitation Trigger ({forecast_horizon})",
            category="predicted",
            impact_score=None,
            weight=0.40,
            source=data_source_weather,
            raw_value="Unknown (no rainfall data)",
            status="unknown",
        ))
    else:
        ante = antecedent_rain_mm if antecedent_rain_mm is not None else 0.0
        fcst = forecast_rain_mm if forecast_rain_mm is not None else 0.0
        # Cumulative moisture index: antecedent soil saturation (40%) + upcoming forecast accumulation
        effective_rain = 0.40 * ante + fcst

        if effective_rain >= 80.0:
            ls_trigger = 95.0
        elif effective_rain >= 45.0:
            ls_trigger = 72.0
        elif effective_rain >= 20.0:
            ls_trigger = 44.0
        else:
            ls_trigger = 16.0

        ls_factors.append(FactorContribution(
            name=f"Rainfall Accumulation (fcst {fcst:.1f}mm, past {ante:.1f}mm)",
            category="predicted",
            impact_score=round(ls_trigger, 1),
            weight=0.40,
            source=data_source_weather,
            raw_value=f"{effective_rain:.1f}mm equivalent",
            status="simulated" if data_freshness == "simulated" else "measured",
        ))

    # 2c. Active Incidents Impact
    ls_incident_impact = min(100.0, len(landslide_incidents) * 35.0)
    ls_factors.append(FactorContribution(
        name=f"Active Landslide Incidents ({len(landslide_incidents)})",
        category="incident",
        impact_score=ls_incident_impact,
        weight=0.15,
        source="Field & Control Room Incident Feed",
        raw_value=f"{len(landslide_incidents)} reported",
        status="measured",
    ))

    # Landslide Composite Index
    ls_unknown = (ls_susceptibility is None and ls_trigger is None)
    if ls_unknown:
        ls_index = None
    else:
        s_part = ls_susceptibility if ls_susceptibility is not None else 50.0
        t_part = ls_trigger if ls_trigger is not None else 50.0
        ls_index = round(0.45 * s_part + 0.40 * t_part + 0.15 * ls_incident_impact, 1)
        ls_index = min(100.0, max(0.0, ls_index))

    landslide_assessment = HazardCategoryAssessment(
        category="landslide",
        risk_index=ls_index,
        risk_level=_risk_level_from_index(ls_index),
        terrain_susceptibility=ls_susceptibility,
        observed_impact=ls_incident_impact,
        predicted_trigger=ls_trigger,
        is_unknown=ls_unknown,
        factors=ls_factors,
    )

    # 3. Evaluate Flood Hazard Assessment
    fl_factors: List[FactorContribution] = []

    # 3a. Floodplain Susceptibility
    fl_susceptibility: Optional[float] = None
    if floodplain_exposure is None:
        fl_factors.append(FactorContribution(
            name="Floodplain Proximity",
            category="terrain",
            impact_score=None,
            weight=0.40,
            source=data_source_terrain,
            raw_value="Unknown",
            status="unknown",
        ))
    else:
        exp = floodplain_exposure.lower()
        if exp == "high" or "basin" in exp:
            fl_susceptibility = 85.0
            desc_val = "River Basin / Valley Floor (High)"
        elif exp == "moderate":
            fl_susceptibility = 45.0
            desc_val = "Undulating Lowland (Moderate)"
        else:
            fl_susceptibility = 15.0
            desc_val = "Elevated Ridge / Highland (Low)"

        fl_factors.append(FactorContribution(
            name="River Basin / Lowland Exposure",
            category="terrain",
            impact_score=round(fl_susceptibility, 1),
            weight=0.40,
            source=data_source_terrain,
            raw_value=desc_val,
            status="simulated" if data_freshness == "simulated" else "measured",
        ))

    # 3b. Precipitation Intensity (Rate in horizon)
    fl_trigger: Optional[float] = None
    if forecast_rain_mm is None:
        fl_factors.append(FactorContribution(
            name=f"Rainfall Rate ({forecast_horizon})",
            category="predicted",
            impact_score=None,
            weight=0.45,
            source=data_source_weather,
            raw_value="Unknown",
            status="unknown",
        ))
    else:
        rate_per_hour = forecast_rain_mm / max(1.0, float(horizon_hours))
        if rate_per_hour >= 25.0:
            fl_trigger = 92.0
            rate_desc = f"{rate_per_hour:.1f} mm/hr (Intense cloudburst)"
        elif rate_per_hour >= 12.0:
            fl_trigger = 70.0
            rate_desc = f"{rate_per_hour:.1f} mm/hr (Heavy continuous rain)"
        elif rate_per_hour >= 4.0:
            fl_trigger = 40.0
            rate_desc = f"{rate_per_hour:.1f} mm/hr (Moderate rain)"
        else:
            fl_trigger = 15.0
            rate_desc = f"{rate_per_hour:.1f} mm/hr (Light / trace rain)"

        fl_factors.append(FactorContribution(
            name=f"Rainfall Intensity ({forecast_horizon})",
            category="predicted",
            impact_score=round(fl_trigger, 1),
            weight=0.45,
            source=data_source_weather,
            raw_value=rate_desc,
            status="simulated" if data_freshness == "simulated" else "measured",
        ))

    # 3c. Active Flood Incidents
    fl_incident_impact = min(100.0, len(flood_incidents) * 35.0)
    fl_factors.append(FactorContribution(
        name=f"Active Flood / Inundation Reports ({len(flood_incidents)})",
        category="incident",
        impact_score=fl_incident_impact,
        weight=0.15,
        source="Field & Control Room Incident Feed",
        raw_value=f"{len(flood_incidents)} reported",
        status="measured",
    ))

    # Flood Composite Index
    fl_unknown = (fl_susceptibility is None and fl_trigger is None)
    if fl_unknown:
        fl_index = None
    else:
        s_part = fl_susceptibility if fl_susceptibility is not None else 40.0
        t_part = fl_trigger if fl_trigger is not None else 40.0
        fl_index = round(0.40 * s_part + 0.45 * t_part + 0.15 * fl_incident_impact, 1)
        fl_index = min(100.0, max(0.0, fl_index))

    flood_assessment = HazardCategoryAssessment(
        category="flood",
        risk_index=fl_index,
        risk_level=_risk_level_from_index(fl_index),
        terrain_susceptibility=fl_susceptibility,
        observed_impact=fl_incident_impact,
        predicted_trigger=fl_trigger,
        is_unknown=fl_unknown,
        factors=fl_factors,
    )

    # 4. Overall Composite Hazard Score
    # Combines flood and landslide using dominant hazard weighting
    if ls_index is None and fl_index is None:
        overall_index = None
        overall_level = "unknown"
    elif ls_index is None:
        overall_index = fl_index
        overall_level = flood_assessment.risk_level
    elif fl_index is None:
        overall_index = ls_index
        overall_level = landslide_assessment.risk_level
    else:
        dominant = max(ls_index, fl_index)
        secondary = min(ls_index, fl_index)
        overall_index = round(0.75 * dominant + 0.25 * secondary, 1)
        overall_level = _risk_level_from_index(overall_index)

    now_iso = datetime.now(timezone.utc).isoformat()

    return PredictiveHazardEstimate(
        overall_hazard_index=overall_index,
        overall_risk_level=overall_level,
        forecast_horizon=forecast_horizon,
        landslide=landslide_assessment,
        flood=flood_assessment,
        is_impassable=is_impassable,
        closure_reasons=closure_reasons,
        data_freshness=data_freshness,
        data_timestamp=now_iso,
        scoring_method=SCORING_METHOD_VERSION,
    )


def estimate_route_hazard(
    route,
    active_incidents: Optional[List[Any]] = None,
    forecast_horizon: str = "3h",
    fetch_live_weather: bool = False,
    simulated_inputs: Optional[Dict[str, Any]] = None,
) -> PredictiveHazardEstimate:
    """Evaluate predictive hazard risk for a full route, mapping its terrain
    profile and integrating live or transparently simulated weather.
    """
    if forecast_horizon not in SUPPORTED_FORECAST_HORIZONS:
        forecast_horizon = "3h"

    horizon_hours = int(forecast_horizon.replace("h", ""))

    # Corridor terrain parameters
    route_id = getattr(route, "id", "")
    priors = CORRIDOR_TERRAIN_PRIORS.get(route_id, {})

    slope_deg = priors.get("slope_deg")
    terrain_type = priors.get("terrain_type", "hilly_corridor")
    floodplain = priors.get("floodplain", "moderate")
    antecedent_mm = priors.get("soil_saturation_baseline", 30.0)

    # Allow explicit simulated overrides (for test cases or scenario demos)
    if simulated_inputs:
        slope_deg = simulated_inputs.get("slope_deg", slope_deg)
        terrain_type = simulated_inputs.get("terrain_type", terrain_type)
        floodplain = simulated_inputs.get("floodplain", floodplain)
        antecedent_mm = simulated_inputs.get("antecedent_rain_mm", antecedent_mm)
        forecast_rain_mm = simulated_inputs.get("forecast_rain_mm")
        data_freshness = simulated_inputs.get("data_freshness", "simulated")
        data_source_weather = simulated_inputs.get("weather_source", "Simulated Scenario Inputs")
    else:
        # Default baseline precipitation by horizon
        # 1h: 6mm, 3h: 18mm, 6h: 38mm, 24h: 75mm (representative monsoon conditions)
        baseline_rain_by_horizon = {"1h": 6.5, "3h": 19.0, "6h": 42.0, "24h": 85.0}
        forecast_rain_mm = baseline_rain_by_horizon.get(forecast_horizon, 19.0)
        data_freshness = "simulated"
        data_source_weather = "MOSSAM Northeast Regional Baseline (Simulated)"

        # If live weather requested and coordinates exist, attempt genuine forecast fetch
        if fetch_live_weather:
            coords = getattr(route, "coordinates", [])
            if coords:
                mid_pt = coords[len(coords) // 2]
                live_rain, freshness = fetch_forecast_rainfall(mid_pt[0], mid_pt[1], horizon_hours=horizon_hours)
                if live_rain is not None:
                    forecast_rain_mm = live_rain
                    data_freshness = freshness
                    data_source_weather = "Open-Meteo IMD-WMO NWP (Live)"

    # Filter incidents that affect this route
    route_incidents: List[Dict[str, Any]] = []
    if active_incidents:
        for inc in active_incidents:
            inc_route_id = getattr(inc, "affected_route_id", None) or (inc.get("affected_route_id") if isinstance(inc, dict) else None)
            inc_status = getattr(inc, "status", None) or (inc.get("status") if isinstance(inc, dict) else "active")
            if inc_status != "active":
                continue

            # Route match: either explicitly attached or proximity check
            match = False
            if inc_route_id and inc_route_id == route_id:
                match = True
            else:
                coords = getattr(route, "coordinates", [])
                inc_lat = getattr(inc, "lat", None) if not isinstance(inc, dict) else inc.get("lat")
                inc_lng = getattr(inc, "lng", None) if not isinstance(inc, dict) else inc.get("lng")
                if inc_lat is not None and inc_lng is not None and coords:
                    for pt in coords:
                        if (pt[0] - inc_lat) ** 2 + (pt[1] - inc_lng) ** 2 < 0.15:  # ~35km buffer
                            match = True
                            break

            if match:
                route_incidents.append({
                    "id": getattr(inc, "id", "") if not isinstance(inc, dict) else inc.get("id"),
                    "type": getattr(inc, "type", "") if not isinstance(inc, dict) else inc.get("type"),
                    "severity": getattr(inc, "severity", "") if not isinstance(inc, dict) else inc.get("severity"),
                    "description": getattr(inc, "description", "") if not isinstance(inc, dict) else inc.get("description", ""),
                    "status": inc_status,
                })

    return estimate_segment_hazard(
        slope_deg=slope_deg,
        terrain_type=terrain_type,
        floodplain_exposure=floodplain,
        antecedent_rain_mm=antecedent_mm,
        forecast_rain_mm=forecast_rain_mm,
        forecast_horizon=forecast_horizon,
        active_incidents=route_incidents,
        data_freshness=data_freshness,
        data_source_weather=data_source_weather,
        data_source_terrain="ISRO Bhuvan / State Geological Survey",
    )
